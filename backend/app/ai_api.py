"""HTTP endpoints for the AI layer."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import ai
from .auth import current_user
from .db import get_db
from .models import User
from .services import Actor, get_record

router = APIRouter(prefix="/api/ai")
ai_actor = lambda user: Actor(user_id=user.id, source="ai")  # noqa: E731  (user-approved, AI-authored)


def _thread_out(t: ai.AIThread) -> dict:
    return {
        "id": t.id, "title": t.title, "target": {"type": t.target_type, "id": t.target_id} if t.target_type else None,
        "display": t.display,
        "pending": [{k: v for k, v in p.items() if not k.startswith("_")} for p in t.pending],
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _guard(fn, *args, **kwargs):
    """Map AI failures to clear HTTP errors."""
    try:
        return fn(*args, **kwargs)
    except ai.AIUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except ai.AIRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        try:
            import anthropic
        except ImportError:  # pragma: no cover
            raise
        if isinstance(exc, anthropic.RateLimitError):
            raise HTTPException(429, "AI rate limit reached, try again in a minute") from exc
        if isinstance(exc, anthropic.APIStatusError):
            raise HTTPException(502, f"AI provider error: {exc.message}") from exc
        if isinstance(exc, anthropic.APIConnectionError):
            raise HTTPException(502, "Could not reach the AI provider") from exc
        raise


@router.get("/status")
def status():
    return {"enabled": ai.ai_enabled(), "mode": ai.ai_mode(), "model": ai.model_label()}


class ThreadIn(BaseModel):
    target_type: str | None = None
    target_id: int | None = None


@router.get("/threads")
def list_threads(target_type: str | None = None, target_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(ai.AIThread).filter(ai.AIThread.user_id == user.id)
    if target_type:
        q = q.filter(ai.AIThread.target_type == target_type, ai.AIThread.target_id == target_id)
    return [{"id": t.id, "title": t.title, "updated_at": t.updated_at.isoformat() if t.updated_at else None,
             "target": {"type": t.target_type, "id": t.target_id} if t.target_type else None}
            for t in q.order_by(ai.AIThread.id.desc()).limit(30)]


@router.post("/threads", status_code=201)
def create_thread(body: ThreadIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if body.target_type and get_record(db, body.target_type, body.target_id or 0) is None:
        raise HTTPException(404, "target record not found")
    t = ai.AIThread(user_id=user.id, target_type=body.target_type, target_id=body.target_id, messages=[], display=[], pending=[])
    db.add(t)
    db.commit()
    return _thread_out(t)


def _own_thread(db: Session, tid: int, user: User) -> ai.AIThread:
    t = db.get(ai.AIThread, tid)
    if t is None or t.user_id != user.id:
        raise HTTPException(404, "conversation not found")
    return t


@router.get("/threads/{tid}")
def get_thread(tid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return _thread_out(_own_thread(db, tid, user))


class MessageIn(BaseModel):
    text: str


@router.post("/threads/{tid}/messages")
def send(tid: int, body: MessageIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _own_thread(db, tid, user)
    _guard(ai.copilot_send, db, t, body.text, ai_actor(user))
    db.commit()
    return _thread_out(t)


class ResolveIn(BaseModel):
    decisions: dict[str, bool]


@router.post("/threads/{tid}/resolve")
def resolve(tid: int, body: ResolveIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _own_thread(db, tid, user)
    _guard(ai.copilot_resolve, db, t, body.decisions, ai_actor(user))
    db.commit()
    return _thread_out(t)


def _insight_out(i: ai.AIInsight | None) -> dict | None:
    return None if i is None else {"id": i.id, "model": i.model, "created_at": i.created_at.isoformat(), **i.payload}


@router.get("/insights/{record_type}/{record_id}")
def latest_insight(record_type: str, record_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    i = (db.query(ai.AIInsight).filter(ai.AIInsight.record_type == record_type, ai.AIInsight.record_id == record_id)
         .order_by(ai.AIInsight.id.desc()).first())
    return _insight_out(i)


@router.post("/insights/{record_type}/{record_id}")
def make_insight(record_type: str, record_id: int, lang: str = "en", db: Session = Depends(get_db), _: User = Depends(current_user)):
    if record_type not in ("company", "contact", "lead", "deal") or get_record(db, record_type, record_id) is None:
        raise HTTPException(404, "record not found")
    i = _guard(ai.generate_insight, db, record_type, record_id, lang)
    db.commit()
    return _insight_out(i)


class DraftIn(BaseModel):
    prompt: str


@router.post("/automation-draft")
def automation_draft(body: DraftIn, _: User = Depends(current_user)) -> dict[str, Any]:
    from .automations import validate_rule
    from .services import ValidationError

    draft = _guard(ai.draft_automation, body.prompt)
    try:
        validate_rule(draft["trigger_event"], draft["conditions"], draft["actions"])
        draft["valid"], draft["error"] = True, None
    except ValidationError as exc:
        draft["valid"], draft["error"] = False, str(exc)
    return draft


@router.get("/jobs")
def jobs(db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.query(ai.AIJob).order_by(ai.AIJob.id.desc()).limit(30).all()
    return [{"id": j.id, "record": {"type": j.record_type, "id": j.record_id}, "instructions": j.instructions, "kind": j.kind,
             "status": j.status, "output": j.output, "created_at": j.created_at.isoformat()} for j in rows]


@router.get("/briefing")
def latest_briefing(lang: str = "en", db: Session = Depends(get_db), user: User = Depends(current_user)):
    """The newest memo written in the reader's language; a memo in the other language is not shown."""
    recent = (db.query(ai.AIInsight).filter(ai.AIInsight.record_type == "briefing", ai.AIInsight.record_id == user.id)
              .order_by(ai.AIInsight.id.desc()).limit(20).all())
    return _insight_out(next((i for i in recent if (i.payload or {}).get("lang", "en") == lang), None))


@router.post("/briefing")
def make_briefing(lang: str = "en", db: Session = Depends(get_db), user: User = Depends(current_user)):
    i = _guard(ai.generate_briefing, db, user.id, lang)
    db.commit()
    return _insight_out(i)
