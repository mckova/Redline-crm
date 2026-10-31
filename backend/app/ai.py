"""AI layer: Claude-powered copilot, record insights, rule drafting and AI automation steps.

Design:

* **Read tools run automatically, write tools need approval.** The agent loop
  pauses on any write tool call, stores the conversation, shows the proposal
  to the user (status lifecycle pending → success / failed / skipped) and
  resumes after approve/reject.
* **Threads attach to records**: a copilot thread opened from a deal page
  carries that deal as context.

Model: Claude Opus 5.5 (``claude-opus-5-5``) with adaptive thinking (always on),
explicit ``effort`` per feature, server-side refusal fallbacks
(``fallbacks="default"``), strict tool schemas and structured outputs.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base
from .models import (
    LEAD_SOURCES,
    LEAD_STATUSES,
    MODEL_BY_TYPE,
    STAGE_KEYS,
    TASK_STATUSES,
    utcnow,
)
from .services import (
    Actor,
    subscribe,
    ValidationError,
    create_record,
    get_record,
    items_for_target,
    serialize,
    update_record,
)

MODEL = os.environ.get("REDLINE_AI_MODEL", "claude-opus-5-5")
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_AGENT_STEPS = 12


class AIUnavailable(RuntimeError):
    pass


class AIRefused(RuntimeError):
    pass


# --------------------------------------------------------------------------- persistence

class AIThread(Base):
    """A copilot conversation. ``messages`` is the exact API transcript (append-only)."""

    __tablename__ = "ai_threads"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    target_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    display: Mapped[list] = mapped_column(JSON, default=list)  # UI-friendly transcript
    pending: Mapped[list] = mapped_column(JSON, default=list)  # write proposals awaiting approval
    created_at = mapped_column(DateTime, default=utcnow)
    updated_at = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AIInsight(Base):
    __tablename__ = "ai_insights"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    record_type: Mapped[str] = mapped_column(String(20), index=True)
    record_id: Mapped[int] = mapped_column(Integer, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(60))
    created_at = mapped_column(DateTime, default=utcnow)


class AIJob(Base):
    """Queued AI automation step, executed off the request path by the worker."""

    __tablename__ = "ai_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    automation_run_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    record_type: Mapped[str] = mapped_column(String(20))
    record_id: Mapped[int] = mapped_column(Integer)
    instructions: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20), default="agent")  # agent | insight
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|running|done|failed
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at = mapped_column(DateTime, default=utcnow)
    finished_at = mapped_column(DateTime, nullable=True)


# --------------------------------------------------------------------------- client

_client_override: Any = None


def set_client(client: Any) -> None:
    """Inject a client (tests, alternative providers via the Anthropic SDK)."""
    global _client_override
    _client_override = client


def ai_mode() -> str:
    """``live`` (real Claude), ``demo`` (offline scripted stand-in) or ``off``.

    ``REDLINE_AI``: ``auto`` (default: live when an API key is present, otherwise
    demo), ``on``/``live``, ``demo`` or ``off``.
    """
    if _client_override is not None:
        return "live"
    setting = os.environ.get("REDLINE_AI", "auto").lower()
    if setting == "off":
        return "off"
    if setting == "demo":
        return "demo"
    if setting in ("on", "live") or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "live"
    return "demo"


def ai_enabled() -> bool:
    return ai_mode() != "off"


def model_label() -> str:
    return "demo mode (offline, scripted)" if ai_mode() == "demo" else MODEL


def get_client():
    if _client_override is not None:
        return _client_override
    mode = ai_mode()
    if mode == "off":
        raise AIUnavailable("AI is not configured: set ANTHROPIC_API_KEY to enable Redline's AI features.")
    if mode == "demo":
        from .demo_ai import DemoClient

        return DemoClient()
    import anthropic

    return anthropic.Anthropic()


def _common(effort: str) -> dict:
    return {
        "model": MODEL,
        "max_tokens": 16000,
        "betas": [FALLBACK_BETA],
        "fallbacks": "default",  # re-run a declined request on Anthropic's recommended fallback model
        "output_config": {"effort": effort},
        "cache_control": {"type": "ephemeral"},
    }


def _check(response) -> None:
    if response.stop_reason == "refusal":
        category = getattr(getattr(response, "stop_details", None), "category", None)
        raise AIRefused(f"Claude declined this request ({category or 'policy'}).")


def _text(response) -> str:
    return "\n".join(b.text for b in response.content if getattr(b, "type", None) == "text").strip()


def _dump(content) -> list[dict]:
    out = []
    for b in content:
        out.append(b.model_dump(mode="json", exclude_none=True) if hasattr(b, "model_dump") else dict(b))
    return out


# --------------------------------------------------------------------------- record context

def record_context(db: Session, record_type: str, record_id: int, timeline_limit: int = 20) -> dict:
    from .insights import deal_health
    from .models import Note, Task
    from .timeline import timeline_for

    rec = get_record(db, record_type, record_id)
    if rec is None:
        raise ValidationError(f"{record_type} #{record_id} not found")
    data = serialize(rec, record_type)
    for k in list(data):
        if k.endswith("_micros") and data[k] is not None:
            data[k.replace("_micros", "")] = data.pop(k) / 1_000_000
    ctx: dict[str, Any] = {"record": data}
    if record_type == "deal":
        ctx["health"] = deal_health(db, rec)
    if record_type == "lead":
        ctx["score_reasons"] = rec.score_reasons
    if record_type not in ("task", "note"):
        task_ids = items_for_target(db, "task", record_type, record_id)
        note_ids = items_for_target(db, "note", record_type, record_id)
        ctx["tasks"] = [
            {"id": t.id, "title": t.title, "status": t.status, "due_at": t.due_at.isoformat() if t.due_at else None}
            for t in db.query(Task).filter(Task.id.in_(task_ids), Task.deleted_at.is_(None))
        ]
        ctx["notes"] = [{"title": n.title, "body": n.body} for n in db.query(Note).filter(Note.id.in_(note_ids), Note.deleted_at.is_(None))]
    ctx["timeline"] = [
        {"at": a.happens_at.isoformat(timespec="minutes"), "event": a.name, "by": a.actor_source,
         "diff": a.properties.get("diff"), "linked": a.linked_record_name}
        for a in timeline_for(db, record_type, record_id, timeline_limit)
    ]
    return ctx


# --------------------------------------------------------------------------- tools

def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required if required is not None else list(props), "additionalProperties": False}


_TYPE = {"type": "string", "enum": ["company", "contact", "lead", "deal", "task", "note"]}
_CRM_TYPE = {"type": "string", "enum": ["company", "contact", "lead", "deal"]}
_FIELDS = {
    "type": "array",
    "description": "Field/value pairs. Money fields take plain amounts in ILS (e.g. field 'amount' value '120000'). "
    "Dates are ISO (YYYY-MM-DD). References are numeric ids (company_id, contact_id, owner_id).",
    "items": _obj({"field": {"type": "string"}, "value": {"type": "string"}}),
}
_LINKS = {"type": "array", "items": _obj({"type": _CRM_TYPE, "id": {"type": "integer"}}), "description": "Records to attach this to"}

FIELD_GUIDE = (
    "company: name, domain, industry, employees, annual_revenue, city, owner_id | "
    "contact: first_name, last_name, email, phone, job_title, company_id, owner_id | "
    f"lead: first_name, last_name, email, phone, job_title, company_name, source {LEAD_SOURCES}, status {LEAD_STATUSES}, budget, description | "
    f"deal: name, amount, stage {STAGE_KEYS}, close_date, company_id, contact_id, probability, lost_reason, owner_id | "
    f"task: title, body, due_at, status {TASK_STATUSES}, assignee_id"
)

READ_TOOLS = [
    {"name": "search_records", "description": "Full-text search across companies, contacts, leads, deals, tasks and notes. Use it to resolve names to ids.",
     "input_schema": _obj({"query": {"type": "string"}})},
    {"name": "list_records", "description": "List records of one type with an optional equality filter and sort. Sort is a field name, prefix '-' for descending (e.g. '-amount_micros', '-score', 'due_at').",
     "input_schema": _obj({"record_type": _TYPE, "filter_field": {"type": ["string", "null"]}, "filter_value": {"type": ["string", "null"]},
                           "sort": {"type": ["string", "null"]}, "limit": {"type": "integer"}})},
    {"name": "get_record", "description": "Full context for one record: fields, linked tasks and notes, recent timeline (with field diffs), deal health or lead score reasons.",
     "input_schema": _obj({"record_type": _TYPE, "record_id": {"type": "integer"}})},
    {"name": "pipeline_overview", "description": "Dashboard numbers: open pipeline, weighted forecast, win rate, stage funnel, lead-source conversion, deals at risk.",
     "input_schema": _obj({})},
]
WRITE_TOOLS = [
    {"name": "create_record", "description": f"Create a company, contact, lead or deal. Fields: {FIELD_GUIDE}",
     "input_schema": _obj({"record_type": _CRM_TYPE, "fields": _FIELDS})},
    {"name": "update_record", "description": f"Change fields on an existing record. Fields: {FIELD_GUIDE}",
     "input_schema": _obj({"record_type": _TYPE, "record_id": {"type": "integer"}, "fields": _FIELDS})},
    {"name": "create_task", "description": "Create a follow-up task, optionally linked to records.",
     "input_schema": _obj({"title": {"type": "string"}, "details": {"type": ["string", "null"]}, "due_in_days": {"type": ["number", "null"]}, "links": _LINKS})},
    {"name": "add_note", "description": "Log a note (call summary, meeting notes, email draft) on one or more records.",
     "input_schema": _obj({"title": {"type": "string"}, "body": {"type": "string"}, "links": _LINKS})},
    {"name": "convert_lead", "description": "Convert a qualified lead into company + contact (+ deal).",
     "input_schema": _obj({"lead_id": {"type": "integer"}, "create_deal": {"type": "boolean"}, "deal_name": {"type": ["string", "null"]}, "amount": {"type": ["number", "null"]}})},
]
WRITE_NAMES = {t["name"] for t in WRITE_TOOLS}
ALL_TOOLS = [{**t, "strict": True} for t in READ_TOOLS + WRITE_TOOLS]

MONEY_FIELDS = {"amount": "amount_micros", "budget": "budget_micros", "annual_revenue": "annual_revenue_micros"}
INT_FIELDS = {"employees", "probability", "company_id", "contact_id", "owner_id", "assignee_id"}


def _coerce_fields(record_type: str, pairs: list[dict]) -> dict:
    model = MODEL_BY_TYPE[record_type]
    values: dict[str, Any] = {}
    for p in pairs:
        field, value = p["field"].strip(), p["value"]
        if field in MONEY_FIELDS:
            values[MONEY_FIELDS[field]] = int(float(str(value).replace(",", "")) * 1_000_000)
            continue
        if not hasattr(model, field):
            raise ValidationError(f"{record_type} has no field {field!r}")
        if value in ("", "null", None):
            values[field] = None
        elif field in INT_FIELDS:
            values[field] = int(float(value))
        else:
            values[field] = value
    return values


def _ref(rtype: str, rec) -> dict:
    return {"type": rtype, "id": rec.id, "name": rec.display_name}


def run_tool(db: Session, name: str, args: dict, actor: Actor) -> dict:
    """Execute one tool. Returns a JSON-able result (and, for writes, ``record`` refs for the UI)."""
    from .api import SEARCH_FIELDS, convert_lead_core
    from .insights import dashboard

    if name == "search_records":
        from sqlalchemy import or_

        hits = []
        for rtype, fields in SEARCH_FIELDS.items():
            m = MODEL_BY_TYPE[rtype]
            rows = db.query(m).filter(m.deleted_at.is_(None), or_(*[getattr(m, f).ilike(f"%{args['query']}%") for f in fields])).limit(8)
            hits += [_ref(rtype, r) for r in rows]
        return {"results": hits}
    if name == "list_records":
        rtype = args["record_type"]
        m = MODEL_BY_TYPE[rtype]
        q = db.query(m).filter(m.deleted_at.is_(None))
        if args.get("filter_field") and hasattr(m, args["filter_field"]):
            q = q.filter(getattr(m, args["filter_field"]) == args.get("filter_value"))
        sort = args.get("sort") or "-id"
        col = getattr(m, sort.lstrip("-"), m.id)
        q = q.order_by(col.desc() if sort.startswith("-") else col.asc())
        limit = max(1, min(int(args.get("limit") or 20), 50))
        rows = q.limit(limit).all()
        keep = ("id", "display_name", "stage", "status", "amount_micros", "score", "source", "company_name", "close_date", "due_at", "owner_id", "industry", "city", "email", "job_title")
        return {"total": q.count(), "items": [{k: v for k, v in serialize(r, rtype).items() if k in keep} for r in rows]}
    if name == "get_record":
        return record_context(db, args["record_type"], args["record_id"])
    if name == "pipeline_overview":
        return dashboard(db)

    if name == "create_record":
        rtype = args["record_type"]
        values = _coerce_fields(rtype, args["fields"])
        if rtype in ("company", "contact", "lead", "deal"):
            values.setdefault("owner_id", actor.user_id)
        rec = create_record(db, rtype, values, actor)
        return {"ok": True, "record": _ref(rtype, rec)}
    if name == "update_record":
        rtype = args["record_type"]
        rec = get_record(db, rtype, args["record_id"])
        if rec is None:
            raise ValidationError(f"{rtype} #{args['record_id']} not found")
        update_record(db, rtype, rec, _coerce_fields(rtype, args["fields"]), actor)
        return {"ok": True, "record": _ref(rtype, rec)}
    if name == "create_task":
        due = args.get("due_in_days")
        task = create_record(db, "task", {
            "title": args["title"], "body": args.get("details"),
            "due_at": utcnow() + timedelta(days=float(due)) if due is not None else None,
            "assignee_id": actor.user_id,
        }, actor, targets=args.get("links") or [])
        return {"ok": True, "record": _ref("task", task)}
    if name == "add_note":
        note = create_record(db, "note", {"title": args["title"], "body": args["body"]}, actor, targets=args.get("links") or [])
        return {"ok": True, "record": _ref("note", note)}
    if name == "convert_lead":
        lead = get_record(db, "lead", args["lead_id"])
        if lead is None:
            raise ValidationError(f"lead #{args['lead_id']} not found")
        out = convert_lead_core(db, lead, actor, args.get("create_deal", True), args.get("deal_name"), args.get("amount"))
        ref = out["deal"] or out["contact"]
        return {"ok": True, "record": {"type": "deal" if out["deal"] else "contact", "id": ref.id, "name": ref.display_name}}
    raise ValidationError(f"unknown tool {name!r}")


def describe_call(name: str, args: dict) -> str:
    """Human-readable proposal text for the approval card."""
    def show(field: str, value) -> str:
        if field in ("amount", "budget", "annual_revenue"):
            try:
                return f"₪{float(value):,.0f}"
            except (TypeError, ValueError):
                return str(value)
        if field == "stage" and isinstance(value, str):
            return value.replace("_", " ").capitalize()
        return str(value)

    f = lambda pairs: ", ".join(f"{p['field'].replace('_', ' ')} to {show(p['field'], p['value'])}" for p in pairs)  # noqa: E731
    if name == "create_record":
        return f"Create {args['record_type']}: {f(args['fields'])}"
    if name == "update_record":
        return f"Update {args['record_type']} #{args['record_id']}: {f(args['fields'])}"
    if name == "create_task":
        due = f", due in {args['due_in_days']:g} days" if args.get("due_in_days") is not None else ""
        return f"Create task “{args['title']}”{due}"
    if name == "add_note":
        return f"Add note “{args['title']}”"
    if name == "convert_lead":
        return f"Convert lead #{args['lead_id']}" + (" and open a deal" if args.get("create_deal") else "")
    return name


# --------------------------------------------------------------------------- copilot agent

COPILOT_SYSTEM = """You are the Redline assistant, the AI teammate inside a sales CRM used by a small Israeli B2B sales team.

You can read anything in the CRM with your tools, and you can propose changes (create/update records, tasks, notes, lead conversion). Every change you propose is shown to the user as an approval card and only runs after they approve, so propose changes directly rather than asking for permission in text.

How to work:
- Look things up before answering; never invent records, ids, numbers or dates. Resolve names with search_records.
- When the user pastes call notes or an email, extract who, what was agreed, amounts, dates and next steps, then propose the matching updates: log a note, move the deal stage, set amount/close date, and create follow-up tasks.
- Prefer concrete next steps with owners and due dates. Money is in ILS.
- Answer in the user's language (Hebrew or English). Keep replies short and skimmable; reference records by name.
- When you mention a record, write it as [Name](/type/id) so the UI can link it."""


def _system_for(thread: AIThread, db: Session) -> list[dict]:
    return [{"type": "text", "text": COPILOT_SYSTEM}]


def _context_message(db: Session, thread: AIThread) -> str | None:
    if not thread.target_type:
        return None
    try:
        ctx = record_context(db, thread.target_type, thread.target_id, timeline_limit=15)
    except ValidationError:
        return None
    return f"The user opened this conversation from {thread.target_type} #{thread.target_id}. Current context:\n{json.dumps(ctx, default=str)}"


def _assistant_text_for_display(content: list[dict]) -> str:
    return "\n".join(b.get("text", "") for b in content if b.get("type") == "text").strip()


def copilot_send(db: Session, thread: AIThread, user_text: str, actor: Actor) -> AIThread:
    if thread.pending:
        raise ValidationError("resolve the pending approvals first")
    text = user_text
    if not thread.messages:
        ctx = _context_message(db, thread)
        if ctx:
            text = f"{ctx}\n\n---\n\n{user_text}"
        thread.title = user_text[:80]
    thread.messages = [*thread.messages, {"role": "user", "content": text}]
    thread.display = [*thread.display, {"role": "user", "text": user_text}]
    return _agent_loop(db, thread, actor)


def copilot_resolve(db: Session, thread: AIThread, decisions: dict[str, bool], actor: Actor) -> AIThread:
    """Apply approve/reject decisions for every pending proposal, then resume the loop."""
    if not thread.pending:
        raise ValidationError("nothing pending")
    results, display = [], []
    for p in thread.pending:
        approved = decisions.get(p["tool_use_id"], False)
        dropped: list[str] = []
        # Field-level decisions ("<tool_use_id>:<field>") let the user take part of an update.
        if p["name"] == "update_record" and any(k.startswith(p["tool_use_id"] + ":") for k in decisions):
            fields = p["input"].get("fields", [])
            kept = [f for f in fields if decisions.get(f"{p['tool_use_id']}:{f['field']}", False)]
            dropped = [f["field"] for f in fields if f not in kept]
            approved = bool(kept)
            if approved and dropped:
                p = {**p, "input": {**p["input"], "fields": kept}, "summary": describe_call("update_record", {**p["input"], "fields": kept})}
        if not approved:
            results.append({"type": "tool_result", "tool_use_id": p["tool_use_id"], "content": "The user rejected this change. Do not retry it unless asked."})
            display.append({**p, "status": "skipped"})
            continue
        try:
            with db.begin_nested():
                out = run_tool(db, p["name"], p["input"], actor)
            note = f" The user declined these fields: {', '.join(dropped)}." if dropped else ""
            results.append({"type": "tool_result", "tool_use_id": p["tool_use_id"], "content": json.dumps(out, default=str) + note})
            display.append({**p, "status": "success", "record": out.get("record")})
        except Exception as exc:  # report failure to the model, keep going
            results.append({"type": "tool_result", "tool_use_id": p["tool_use_id"], "content": f"Error: {exc}", "is_error": True})
            display.append({**p, "status": "failed", "error": str(exc)})
    # Results for auto-run read tools from the same turn were stashed with the proposals.
    stashed = [r for p in thread.pending for r in p.get("_sibling_results", [])]
    thread.messages = [*thread.messages, {"role": "user", "content": stashed + results}]
    thread.display = [*thread.display, {"role": "actions", "items": [{k: v for k, v in d.items() if not k.startswith("_")} for d in display]}]
    thread.pending = []
    return _agent_loop(db, thread, actor)


def _agent_loop(db: Session, thread: AIThread, actor: Actor) -> AIThread:
    client = get_client()
    messages = list(thread.messages)
    for _ in range(MAX_AGENT_STEPS):
        response = client.beta.messages.create(
            **_common("medium"),
            system=_system_for(thread, db),
            tools=ALL_TOOLS,
            messages=messages,
        )
        _check(response)
        content = _dump(response.content)
        messages.append({"role": "assistant", "content": content})
        said = _assistant_text_for_display(content)
        if said:
            thread.display = [*thread.display, {"role": "assistant", "text": said}]
        if response.stop_reason == "pause_turn":
            continue
        calls = [b for b in content if b.get("type") == "tool_use"]
        if response.stop_reason != "tool_use" or not calls:
            break
        reads = [c for c in calls if c["name"] not in WRITE_NAMES]
        writes = [c for c in calls if c["name"] in WRITE_NAMES]
        read_results = []
        for c in reads:
            try:
                out = run_tool(db, c["name"], c["input"], actor)
                read_results.append({"type": "tool_result", "tool_use_id": c["id"], "content": json.dumps(out, default=str)[:60000]})
            except Exception as exc:
                read_results.append({"type": "tool_result", "tool_use_id": c["id"], "content": f"Error: {exc}", "is_error": True})
        if reads:
            thread.display = [*thread.display, {"role": "tools", "items": [c["name"] for c in reads]}]
        if writes:
            # Pause for human approval; every tool_result of this turn goes back in one message later.
            pending = [
                {"tool_use_id": c["id"], "name": c["name"], "input": c["input"], "summary": describe_call(c["name"], c["input"]), "status": "pending"}
                for c in writes
            ]
            pending[0]["_sibling_results"] = read_results
            thread.pending = pending
            break
        messages.append({"role": "user", "content": read_results})
    thread.messages = messages
    return thread


# --------------------------------------------------------------------------- insights (structured output)

class NextAction(BaseModel):
    title: str = Field(description="Imperative, specific next step")
    why: str
    due_in_days: int


class EmailDraft(BaseModel):
    subject: str
    body: str


class RecordInsight(BaseModel):
    summary: str = Field(description="2-3 sentence status of this relationship/deal")
    momentum: Literal["accelerating", "steady", "stalling", "at_risk", "closed"]
    risks: list[str]
    next_actions: list[NextAction]
    email_draft: EmailDraft | None = Field(description="A ready-to-send follow-up email to the main contact, or null if not useful")


INSIGHT_SYSTEM = (
    "You are a senior B2B sales coach. Given a CRM record with its timeline, tasks, notes and computed signals, "
    "produce a crisp status, concrete risks grounded in the data, 1-3 next actions, and a short follow-up email "
    "in English unless told otherwise. Never invent facts that are not in the data."
)


LANG_NOTE = {"he": "\nWrite in Hebrew.", "en": ""}


def generate_insight(db: Session, record_type: str, record_id: int, lang: str = "en") -> AIInsight:
    ctx = record_context(db, record_type, record_id)
    response = get_client().beta.messages.parse(
        **_common("medium"),
        system=INSIGHT_SYSTEM,
        messages=[{"role": "user", "content": f"Today is {utcnow().date().isoformat()}.{LANG_NOTE.get(lang, '')}\n{record_type} data:\n{json.dumps(ctx, default=str)}"}],
        output_format=RecordInsight,
    )
    _check(response)
    insight = AIInsight(record_type=record_type, record_id=record_id, payload=response.parsed_output.model_dump(), model=model_label())
    db.add(insight)
    return insight


# --------------------------------------------------------------------------- automation drafting (structured output)

class DraftCondition(BaseModel):
    field: str
    op: Literal["eq", "neq", "gt", "gte", "lt", "lte", "contains", "changed", "changed_to", "changed_from", "is_empty", "not_empty"]
    value: str | None


class FieldValue(BaseModel):
    field: str
    value: str


class DraftAction(BaseModel):
    type: Literal["create_task", "add_note", "update_record", "webhook", "ai_agent"]
    title: str | None = Field(description="create_task / add_note title; may use {{record.field}}")
    body: str | None
    due_in_days: float | None
    url: str | None
    values: list[FieldValue] | None = Field(description="update_record: fields to set")
    instructions: str | None = Field(description="ai_agent: what the AI should do with the record")


class AutomationDraft(BaseModel):
    name: str
    trigger_event: str
    conditions: list[DraftCondition]
    actions: list[DraftAction]
    explanation: str = Field(description="One sentence restating the rule in plain words")


def draft_automation(prompt: str) -> dict:
    from .automations import TRIGGERS

    system = (
        "Translate a sales-ops request into a Redline automation rule.\n"
        f"Triggers: {TRIGGERS}.\nRecord fields: {FIELD_GUIDE}. Money fields on records are stored in micros "
        "(amount_micros = ILS × 1,000,000), so a condition on deal size uses field amount_micros with the value in micros.\n"
        "Lead records also have score (0-100). Use changed_to for 'moves to/becomes'. "
        "Action ai_agent runs Claude on the record with your instructions and can create tasks, add notes or update the record."
    )
    response = get_client().beta.messages.parse(
        **_common("low"),
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=AutomationDraft,
    )
    _check(response)
    d = response.parsed_output
    actions = []
    for a in d.actions:
        if a.type == "create_task":
            actions.append({"type": "create_task", "params": {"title": a.title or "Follow up", "body": a.body, "due_in_days": a.due_in_days}})
        elif a.type == "add_note":
            actions.append({"type": "add_note", "params": {"title": a.title or "Note", "body": a.body}})
        elif a.type == "update_record":
            actions.append({"type": "update_record", "params": {"values": {v.field: v.value for v in (a.values or [])}}})
        elif a.type == "webhook":
            actions.append({"type": "webhook", "params": {"url": a.url or ""}})
        else:
            actions.append({"type": "ai_agent", "params": {"instructions": a.instructions or a.body or ""}})
    return {
        "name": d.name,
        "trigger_event": d.trigger_event,
        "conditions": [c.model_dump() for c in d.conditions],
        "actions": actions,
        "explanation": d.explanation,
    }


# --------------------------------------------------------------------------- AI automation step (background)

AGENT_STEP_SYSTEM = (
    "You are an automation step inside a CRM. A rule fired on the record below. Follow the rule's instructions "
    "using your tools, then stop with a one-line summary of what you did. The rule's author already approved "
    "these actions, so act without asking. Ground everything in the record data."
)
STEP_TOOLS = [{**t, "strict": True} for t in READ_TOOLS + WRITE_TOOLS if t["name"] in ("get_record", "search_records", "create_task", "add_note", "update_record")]


def enqueue_ai_step(db: Session, run_record_type: str, record_id: int, instructions: str) -> AIJob:
    job = AIJob(record_type=run_record_type, record_id=record_id, instructions=instructions)
    db.add(job)
    db.flush()
    return job


def run_ai_step(db: Session, job: AIJob) -> AIJob:
    job.status = "running"
    if job.kind == "insight":
        insight = generate_insight(db, job.record_type, job.record_id)
        db.flush()
        job.output = {"summary": insight.payload.get("summary", ""), "actions": [], "insight_id": insight.id}
        job.status, job.finished_at = "done", utcnow()
        return job
    actor = Actor(source="ai", depth=2)
    client = get_client()
    ctx = record_context(db, job.record_type, job.record_id)
    messages: list[dict] = [{"role": "user", "content": f"Instructions: {job.instructions}\n\n{job.record_type} #{job.record_id}:\n{json.dumps(ctx, default=str)}"}]
    actions: list[dict] = []
    for _ in range(6):
        response = client.beta.messages.create(**_common("low"), system=AGENT_STEP_SYSTEM, tools=STEP_TOOLS, messages=messages)
        _check(response)
        content = _dump(response.content)
        messages.append({"role": "assistant", "content": content})
        calls = [b for b in content if b.get("type") == "tool_use"]
        if response.stop_reason != "tool_use" or not calls:
            break
        results = []
        for c in calls:
            try:
                with db.begin_nested():
                    out = run_tool(db, c["name"], c["input"], actor)
                if c["name"] in WRITE_NAMES:
                    actions.append({"tool": c["name"], "summary": describe_call(c["name"], c["input"]), "record": out.get("record")})
                results.append({"type": "tool_result", "tool_use_id": c["id"], "content": json.dumps(out, default=str)[:60000]})
            except Exception as exc:
                results.append({"type": "tool_result", "tool_use_id": c["id"], "content": f"Error: {exc}", "is_error": True})
        messages.append({"role": "user", "content": results})
    job.output = {"summary": _assistant_text_for_display(messages[-1]["content"]) if messages[-1]["role"] == "assistant" else "", "actions": actions}
    job.status = "done"
    job.finished_at = utcnow()
    return job


def process_pending_jobs(session_factory, limit: int = 5) -> int:
    done = 0
    with session_factory() as db:
        jobs = db.query(AIJob).filter(AIJob.status == "queued").order_by(AIJob.id).limit(limit).all()
        for job in jobs:
            try:
                run_ai_step(db, job)
            except Exception as exc:
                db.rollback()
                job = db.get(AIJob, job.id)
                job.status, job.output, job.finished_at = "failed", {"error": str(exc)}, utcnow()
            db.commit()
            done += 1
    return done


def start_worker(session_factory, interval: float = 2.0) -> threading.Event:
    stop = threading.Event()

    def loop():
        while not stop.is_set():
            try:
                if ai_enabled():
                    process_pending_jobs(session_factory)
            except Exception:  # pragma: no cover - keep the worker alive
                pass
            stop.wait(interval)

    threading.Thread(target=loop, name="redline-ai-worker", daemon=True).start()
    return stop




# --------------------------------------------------------------------------- proactive analysis

AUTO_INSIGHT = os.environ.get("REDLINE_AI_AUTO_INSIGHTS", "on") != "off"


def _wants_auto_insight(event) -> bool:
    if event.actor.source in ("import", "ai") or not AUTO_INSIGHT or not ai_enabled():
        return False
    if event.name == "lead.created":
        return True
    return event.name == "deal.updated" and "stage" in event.diff


@subscribe
def _auto_insight(db: Session, event) -> None:
    """New leads and deals that change stage get an AI read-out in the background,
    so the analysis is already waiting when a rep opens the record."""
    if not _wants_auto_insight(event):
        return
    queued = db.query(AIJob).filter(AIJob.kind == "insight", AIJob.status == "queued",
                                    AIJob.record_type == event.record_type, AIJob.record_id == event.record.id).first()
    if queued is None:
        db.add(AIJob(kind="insight", record_type=event.record_type, record_id=event.record.id,
                     instructions="Analyze this record and suggest next actions."))


# --------------------------------------------------------------------------- daily briefing (structured output)

class FocusItem(BaseModel):
    title: str = Field(description="What to do, imperative and specific")
    why: str = Field(description="The data point that makes this urgent")
    record_type: Literal["deal", "lead", "task", "company", "contact"]
    record_id: int


class Briefing(BaseModel):
    headline: str = Field(description="One sentence on the state of the pipeline today")
    focus: list[FocusItem] = Field(description="3-5 highest-leverage actions for today, most important first")
    pipeline_note: str = Field(description="One or two sentences on forecast, win rate and where value is concentrated")
    watch_out: list[str] = Field(description="0-3 patterns worth attention (e.g. many stale deals in one stage)")


BRIEFING_SYSTEM = (
    "You are the sales lead's chief of staff. From the CRM snapshot, write today's briefing: what matters most "
    "today and why, grounded only in the data given (deal health issues, overdue tasks, hot leads, the forecast). "
    "Every focus item must point at a real record id from the snapshot. Be concrete and short."
)


def briefing_context(db: Session, user_id: int | None) -> dict:
    from .insights import dashboard
    from .models import Deal, Lead, Task

    now = utcnow()
    biggest = (db.query(Deal).filter(Deal.deleted_at.is_(None), Deal.stage.not_in(["WON", "LOST"]))
               .order_by(Deal.amount_micros.desc()).limit(5).all())
    dash = dashboard(db)
    overdue = (db.query(Task).filter(Task.deleted_at.is_(None), Task.status != "DONE", Task.due_at.is_not(None), Task.due_at < now)
               .order_by(Task.due_at).limit(10).all())
    hot = (db.query(Lead).filter(Lead.deleted_at.is_(None), Lead.status.in_(["new", "contacted", "qualified"]))
           .order_by(Lead.score.desc()).limit(6).all())
    return {
        "today": now.date().isoformat(),
        "kpis": dash["kpis"],
        "funnel": [{k: f[k] for k in ("stage", "count", "amount")} for f in dash["funnel"]],
        "deals_at_risk": dash["at_risk"][:8],
        "largest_open_deals": [{"id": d.id, "name": d.name, "stage": d.stage, "amount": d.amount_micros / 1_000_000,
                                "close_date": d.close_date.date().isoformat() if d.close_date else None} for d in biggest],
        "overdue_tasks": [{"id": t.id, "title": t.title, "due": t.due_at.date().isoformat()} for t in overdue],
        "hot_leads": [{"id": lead.id, "name": lead.display_name, "company": lead.company_name, "score": lead.score,
                       "status": lead.status, "why": [r.get("reason") if isinstance(r, dict) else r for r in (lead.score_reasons or [])][:3]}
                      for lead in hot],
    }


def generate_briefing(db: Session, user_id: int | None, lang: str = "en") -> AIInsight:
    ctx = briefing_context(db, user_id)
    response = get_client().beta.messages.parse(
        **_common("medium"),
        system=BRIEFING_SYSTEM,
        messages=[{"role": "user", "content": f"{LANG_NOTE.get(lang, '').strip()}\nCRM snapshot:\n{json.dumps(ctx, default=str)}".strip()}],
        output_format=Briefing,
    )
    _check(response)
    item = AIInsight(record_type="briefing", record_id=user_id or 0, payload={**response.parsed_output.model_dump(), "lang": lang}, model=model_label())
    db.add(item)
    return item
