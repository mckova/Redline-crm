"""Automation engine: ``trigger event → conditions → actions``.

Triggered by the same record events that feed the timeline. Rules are plain JSON so they can be built in the UI,
versioned, and tested without code.

Example rule::

    {
      "name": "Proposal sent → follow-up in 3 days",
      "trigger_event": "deal.updated",
      "conditions": [{"field": "stage", "op": "changed_to", "value": "PROPOSAL"}],
      "actions": [{"type": "create_task",
                   "params": {"title": "Follow up on {{record.name}}", "due_in_days": 3}}]
    }
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from .models import Automation, AutomationRun, utcnow
from .services import (
    Actor,
    RecordEvent,
    ValidationError,
    create_record,
    serialize,
    subscribe,
    update_record,
)

MAX_DEPTH = 3
OPERATORS = [
    "eq", "neq", "gt", "gte", "lt", "lte", "contains",
    "changed", "changed_to", "changed_from", "is_empty", "not_empty",
]
ACTION_TYPES = ["create_task", "add_note", "update_record", "webhook", "ai_agent"]
TRIGGERS = [f"{t}.{v}" for t in ("company", "contact", "lead", "deal", "task") for v in ("created", "updated", "deleted")]

_TEMPLATE = re.compile(r"\{\{\s*record\.(\w+)\s*\}\}")


def render(template: Any, data: dict[str, Any]) -> Any:
    if not isinstance(template, str):
        return template
    return _TEMPLATE.sub(lambda m: "" if data.get(m.group(1)) is None else str(data.get(m.group(1))), template)


def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def check_condition(cond: dict[str, Any], data: dict[str, Any], diff: dict[str, Any]) -> bool:
    field, op, expected = cond.get("field"), cond.get("op", "eq"), cond.get("value")
    actual = data.get(field)
    if op == "eq":
        return str(actual) == str(expected)
    if op == "neq":
        return str(actual) != str(expected)
    if op in ("gt", "gte", "lt", "lte"):
        a, b = _num(actual), _num(expected)
        if a is None or b is None:
            return False
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    if op == "contains":
        return str(expected).lower() in str(actual or "").lower()
    if op == "is_empty":
        return actual in (None, "")
    if op == "not_empty":
        return actual not in (None, "")
    if op == "changed":
        return field in diff
    if op == "changed_to":
        return field in diff and str(diff[field]["after"]) == str(expected)
    if op == "changed_from":
        return field in diff and str(diff[field]["before"]) == str(expected)
    raise ValidationError(f"unknown operator {op!r}")


def validate_rule(trigger: str, conditions: list, actions: list) -> None:
    if trigger not in TRIGGERS:
        raise ValidationError(f"unknown trigger {trigger!r}")
    for c in conditions:
        if c.get("op") not in OPERATORS:
            raise ValidationError(f"unknown operator {c.get('op')!r}")
    if not actions:
        raise ValidationError("a rule needs at least one action")
    for a in actions:
        if a.get("type") not in ACTION_TYPES:
            raise ValidationError(f"unknown action {a.get('type')!r}")


def _run_action(db: Session, action: dict, event: RecordEvent, data: dict, actor: Actor) -> dict:
    kind, params = action["type"], action.get("params", {})
    target = [{"type": event.record_type, "id": event.record.id}] if event.record_type not in ("task", "note") else []
    if kind == "create_task":
        due_days = params.get("due_in_days")
        assignee = params.get("assignee", "owner")
        task = create_record(
            db,
            "task",
            {
                "title": render(params.get("title", "Follow up"), data),
                "body": render(params.get("body"), data),
                "due_at": utcnow() + timedelta(days=float(due_days)) if due_days is not None else None,
                "assignee_id": data.get("owner_id") if assignee == "owner" else assignee,
            },
            actor,
            targets=target,
        )
        return {"action": kind, "task_id": task.id}
    if kind == "add_note":
        note = create_record(
            db,
            "note",
            {"title": render(params.get("title", "Automation note"), data), "body": render(params.get("body"), data)},
            actor,
            targets=target,
        )
        return {"action": kind, "note_id": note.id}
    if kind == "update_record":
        values = {k: render(v, data) for k, v in params.get("values", {}).items()}
        update_record(db, event.record_type, event.record, values, actor)
        return {"action": kind, "values": values}
    if kind == "ai_agent":
        # Claude runs off the request path (ai.py worker) so a user's save never waits on the model.
        from .ai import ai_enabled, enqueue_ai_step

        if not ai_enabled():
            raise ValidationError("AI is not configured (set ANTHROPIC_API_KEY)")
        job = enqueue_ai_step(db, event.record_type, event.record.id, render(params.get("instructions", ""), data))
        return {"action": kind, "job_id": job.id, "queued": True}
    if kind == "webhook":
        url = params.get("url", "")
        payload = {"event": event.name, "record": data, "diff": event.diff}
        if os.environ.get("REDLINE_WEBHOOKS", "off") != "on" or not url.startswith(("http://", "https://")):
            return {"action": kind, "url": url, "delivered": False, "dry_run": True}
        req = urllib.request.Request(
            url, data=json.dumps(payload, default=str).encode(), headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310 - user-configured URL
            return {"action": kind, "url": url, "delivered": True, "status": resp.status}
    raise ValidationError(f"unknown action {kind!r}")


def run_rule(db: Session, rule: Automation, event: RecordEvent) -> AutomationRun | None:
    data = serialize(event.record, event.record_type)
    if not all(check_condition(c, data, event.diff) for c in rule.conditions):
        return None
    actor = Actor(user_id=None, source="automation", depth=event.actor.depth + 1)
    output, status = [], "success"
    for action in rule.actions:
        try:
            with db.begin_nested():
                output.append(_run_action(db, action, event, data, actor))
        except Exception as exc:  # one failing action must not roll back the user's write
            status = "failed"
            output.append({"action": action.get("type"), "error": str(exc)})
    rule.run_count += 1
    rule.last_run_at = utcnow()
    run = AutomationRun(
        automation_id=rule.id,
        record_type=event.record_type,
        record_id=event.record.id,
        status=status,
        output=output,
    )
    db.add(run)
    return run


@subscribe
def on_record_event(db: Session, event: RecordEvent) -> None:
    if event.actor.depth >= MAX_DEPTH:
        return  # loop protection: automation → update → automation …
    rules = (
        db.query(Automation)
        .filter(Automation.enabled.is_(True), Automation.trigger_event == event.name)
        .order_by(Automation.id)
        .all()
    )
    for rule in rules:
        run_rule(db, rule, event)
