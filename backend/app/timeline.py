"""Timeline writer: turns record events into an append-only activity feed."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import TimelineActivity
from .services import RecordEvent, get_record, subscribe, targets_of


def write_activity(
    db: Session,
    name: str,
    record_type: str,
    record_id: int,
    *,
    actor_id: int | None = None,
    actor_source: str = "manual",
    properties: dict | None = None,
    linked: tuple[str, int, str] | None = None,
) -> TimelineActivity:
    act = TimelineActivity(
        name=name,
        record_type=record_type,
        record_id=record_id,
        actor_id=actor_id,
        actor_source=actor_source,
        properties=properties or {},
    )
    if linked:
        act.linked_record_type, act.linked_record_id, act.linked_record_name = linked
    db.add(act)
    return act


@subscribe
def on_record_event(db: Session, event: RecordEvent) -> None:
    props = {"diff": event.diff} if event.diff else {}
    write_activity(
        db,
        event.name,
        event.record_type,
        event.record.id,
        actor_id=event.actor.user_id,
        actor_source=event.actor.source,
        properties=props,
    )
    # Fan-out: a task/note event also appears on every record it's attached to.
    if event.record_type in ("task", "note"):
        for t in targets_of(db, event.record_type, event.record.id):
            if get_record(db, t.target_type, t.target_id) is None:
                continue
            write_activity(
                db,
                f"linked-{event.name}",
                t.target_type,
                t.target_id,
                actor_id=event.actor.user_id,
                actor_source=event.actor.source,
                properties=props,
                linked=(event.record_type, event.record.id, event.record.display_name),
            )


def timeline_for(db: Session, record_type: str, record_id: int, limit: int = 100) -> list[TimelineActivity]:
    return (
        db.query(TimelineActivity)
        .filter(TimelineActivity.record_type == record_type, TimelineActivity.record_id == record_id)
        .order_by(TimelineActivity.happens_at.desc(), TimelineActivity.id.desc())
        .limit(limit)
        .all()
    )
