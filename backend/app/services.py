"""Record service: the single write path for every CRM object.

All creates/updates/deletes go through here so that every mutation produces a
``RecordEvent``. Subscribers (timeline writer, automation engine, lead scorer)
react to events, so the timeline and automation triggers can never drift
from what actually happened to the data.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from .models import MODEL_BY_TYPE, STAGE_KEYS, ActivityTarget, Deal, utcnow

IGNORED_DIFF_FIELDS = {"updated_at", "created_at", "position", "score_reasons"}


@dataclass
class Actor:
    user_id: int | None = None
    source: str = "manual"  # manual | api | automation | import | system
    depth: int = 0  # automation recursion depth


@dataclass
class RecordEvent:
    name: str  # "<type>.<verb>"
    record_type: str
    record: Any
    actor: Actor
    diff: dict[str, dict[str, Any]] = field(default_factory=dict)
    before: dict[str, Any] = field(default_factory=dict)

    @property
    def verb(self) -> str:
        return self.name.split(".", 1)[1]


Listener = Callable[[Session, RecordEvent], None]
_listeners: list[Listener] = []


def subscribe(listener: Listener) -> Listener:
    _listeners.append(listener)
    return listener


def emit(db: Session, event: RecordEvent) -> None:
    for listener in list(_listeners):
        listener(db, event)


# --------------------------------------------------------------------------- utils

def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def column_values(record: Any) -> dict[str, Any]:
    mapper = sa_inspect(record.__class__)
    return {c.key: _jsonable(getattr(record, c.key)) for c in mapper.column_attrs}


def serialize(record: Any, record_type: str) -> dict[str, Any]:
    data = column_values(record)
    data["type"] = record_type
    data["display_name"] = record.display_name
    if isinstance(record, Deal):
        data["win_probability"] = record.win_probability
        data["company_name"] = record.company.name if record.company else None
        data["contact_name"] = record.contact.display_name if record.contact else None
    if record_type == "contact":
        data["company_name"] = record.company.name if record.company else None
    return data


def _writable_fields(model) -> set[str]:
    mapper = sa_inspect(model)
    return {c.key for c in mapper.column_attrs} - {
        "id",
        "created_at",
        "updated_at",
        "deleted_at",
        "created_by_source",
    }


def _coerce(model, key: str, value: Any) -> Any:
    col = sa_inspect(model).columns.get(key)
    if col is None or value is None or value == "":
        return None if value == "" else value
    if col.type.python_type is datetime and isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    return value


class ValidationError(ValueError):
    pass


def _validate(record_type: str, values: dict[str, Any]) -> None:
    if record_type == "deal" and "stage" in values and values["stage"] not in STAGE_KEYS:
        raise ValidationError(f"unknown stage {values['stage']!r}; expected one of {STAGE_KEYS}")


# --------------------------------------------------------------------------- CRUD

def get_record(db: Session, record_type: str, record_id: int, include_deleted: bool = False):
    model = MODEL_BY_TYPE[record_type]
    record = db.get(model, record_id)
    if record is None or (record.deleted_at is not None and not include_deleted):
        return None
    return record


def create_record(
    db: Session,
    record_type: str,
    values: dict[str, Any],
    actor: Actor,
    targets: list[dict[str, Any]] | None = None,
):
    model = MODEL_BY_TYPE[record_type]
    allowed = _writable_fields(model)
    clean = {k: _coerce(model, k, v) for k, v in values.items() if k in allowed}
    _validate(record_type, clean)
    if record_type == "deal" and "position" not in clean:
        clean["position"] = _next_position(db, clean.get("stage", "NEW"))
    record = model(**clean, created_by_source=actor.source)
    db.add(record)
    db.flush()
    if targets and record_type in ("task", "note"):
        attach_targets(db, record_type, record.id, targets)
    emit(db, RecordEvent(f"{record_type}.created", record_type, record, actor))
    return record


def update_record(db: Session, record_type: str, record, values: dict[str, Any], actor: Actor):
    model = MODEL_BY_TYPE[record_type]
    allowed = _writable_fields(model)
    before = column_values(record)
    clean = {k: _coerce(model, k, v) for k, v in values.items() if k in allowed}
    _validate(record_type, clean)
    if record_type == "deal" and "stage" in clean and clean["stage"] != record.stage:
        record.stage_changed_at = utcnow()
    for k, v in clean.items():
        setattr(record, k, v)
    db.flush()
    after = column_values(record)
    diff = {
        k: {"before": before.get(k), "after": after.get(k)}
        for k in clean
        if before.get(k) != after.get(k) and k not in IGNORED_DIFF_FIELDS
    }
    if diff:
        emit(db, RecordEvent(f"{record_type}.updated", record_type, record, actor, diff, before))
    return record


def delete_record(db: Session, record_type: str, record, actor: Actor) -> None:
    record.deleted_at = utcnow()
    db.flush()
    emit(db, RecordEvent(f"{record_type}.deleted", record_type, record, actor))


def _next_position(db: Session, stage: str) -> float:
    last = (
        db.query(Deal.position)
        .filter(Deal.stage == stage, Deal.deleted_at.is_(None))
        .order_by(Deal.position.desc())
        .first()
    )
    return (last[0] + 1024.0) if last else 1024.0


def move_deal(db: Session, deal: Deal, stage: str, before_id: int | None, after_id: int | None, actor: Actor):
    """Place a kanban card between two neighbours using fractional positions."""
    lo = db.get(Deal, after_id).position if after_id else None
    hi = db.get(Deal, before_id).position if before_id else None
    if lo is not None and hi is not None:
        pos = (lo + hi) / 2
    elif lo is not None:
        pos = lo + 1024.0
    elif hi is not None:
        pos = hi - 1024.0
    else:
        pos = _next_position(db, stage)
    deal.position = pos
    return update_record(db, "deal", deal, {"stage": stage}, actor)


# --------------------------------------------------------------------------- targets

def attach_targets(db: Session, item_kind: str, item_id: int, targets: list[dict[str, Any]]) -> None:
    for t in targets:
        if t["type"] not in MODEL_BY_TYPE or t["type"] in ("task", "note"):
            raise ValidationError(f"cannot attach a {item_kind} to {t['type']!r}")
        if get_record(db, t["type"], int(t["id"])) is None:
            raise ValidationError(f"{t['type']} #{t['id']} does not exist")
        db.add(ActivityTarget(item_kind=item_kind, item_id=item_id, target_type=t["type"], target_id=int(t["id"])))
    db.flush()


def targets_of(db: Session, item_kind: str, item_id: int) -> list[ActivityTarget]:
    return (
        db.query(ActivityTarget)
        .filter(ActivityTarget.item_kind == item_kind, ActivityTarget.item_id == item_id)
        .all()
    )


def items_for_target(db: Session, item_kind: str, target_type: str, target_id: int) -> list[int]:
    rows = (
        db.query(ActivityTarget.item_id)
        .filter(
            ActivityTarget.item_kind == item_kind,
            ActivityTarget.target_type == target_type,
            ActivityTarget.target_id == target_id,
        )
        .all()
    )
    return [r[0] for r in rows]
