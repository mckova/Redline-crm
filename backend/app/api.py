"""HTTP API. One generic record router serves every object type (metadata-driven,
so new object types get REST endpoints for free); special flows get explicit endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import automations as automation_engine
from .auth import current_user, issue_token, verify_password
from .db import get_db
from .insights import dashboard, deal_health
from .models import (
    DEAL_STAGES,
    ActivityTarget,
    LEAD_SOURCES,
    LEAD_STATUSES,
    MODEL_BY_TYPE,
    TASK_STATUSES,
    Automation,
    AutomationRun,
    Company,
    Contact,
    Deal,
    Lead,
    Note,
    Task,
    TimelineActivity,
    User,
)
from .scoring import grade, rescore
from .services import (
    Actor,
    ValidationError,
    create_record,
    delete_record,
    get_record,
    items_for_target,
    move_deal,
    serialize,
    targets_of,
    update_record,
)
from .timeline import timeline_for, write_activity

router = APIRouter(prefix="/api")

PLURAL = {"companies": "company", "contacts": "contact", "leads": "lead", "deals": "deal", "tasks": "task", "notes": "note"}
Plural = Literal["companies", "contacts", "leads", "deals", "tasks", "notes"]
SEARCH_FIELDS = {
    "company": ["name", "domain", "industry", "city"],
    "contact": ["first_name", "last_name", "email", "job_title"],
    "lead": ["first_name", "last_name", "email", "company_name"],
    "deal": ["name"],
    "task": ["title"],
    "note": ["title", "body"],
}
FILTERABLE = {"stage", "status", "source", "company_id", "contact_id", "owner_id", "assignee_id", "industry"}


def actor_of(user: User) -> Actor:
    return Actor(user_id=user.id, source="manual")


def _404(record_type: str, record_id: int):
    raise HTTPException(404, f"{record_type} #{record_id} not found")


def _out(db: Session, record, record_type: str) -> dict:
    data = serialize(record, record_type)
    if record_type == "lead":
        data["grade"] = grade(record.score)
    if record_type in ("task", "note"):
        data["targets"] = [_target_ref(db, t.target_type, t.target_id) for t in targets_of(db, record_type, record.id)]
    return data


def _target_ref(db: Session, target_type: str, target_id: int) -> dict:
    rec = get_record(db, target_type, target_id, include_deleted=True)
    return {"type": target_type, "id": target_id, "name": rec.display_name if rec else "(deleted)"}


# --------------------------------------------------------------------------- auth / meta

class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "wrong email or password")
    return {"token": issue_token(user), "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role}}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@router.get("/users")
def users(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": u.id, "name": u.name, "email": u.email, "role": u.role} for u in db.query(User).order_by(User.id)]


@router.get("/meta")
def meta():
    return {
        "stages": [{"key": k, "label": label, "probability": p} for k, label, p in DEAL_STAGES],
        "lead_sources": LEAD_SOURCES,
        "lead_statuses": LEAD_STATUSES,
        "task_statuses": TASK_STATUSES,
        "automation": {
            "triggers": automation_engine.TRIGGERS,
            "operators": automation_engine.OPERATORS,
            "actions": automation_engine.ACTION_TYPES,
        },
    }


# --------------------------------------------------------------------------- dashboard / search / pipeline

@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return dashboard(db)


@router.get("/search")
def search(q: str = Query(min_length=1), db: Session = Depends(get_db), _: User = Depends(current_user)):
    results = []
    for rtype, fields in SEARCH_FIELDS.items():
        model = MODEL_BY_TYPE[rtype]
        like = f"%{q}%"
        rows = (
            db.query(model)
            .filter(model.deleted_at.is_(None), or_(*[getattr(model, f).ilike(like) for f in fields]))
            .limit(5)
            .all()
        )
        results += [{"type": rtype, "id": r.id, "name": r.display_name} for r in rows]
    return results


@router.get("/pipeline")
def pipeline(owner_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    q = db.query(Deal).filter(Deal.deleted_at.is_(None))
    if owner_id:
        q = q.filter(Deal.owner_id == owner_id)
    deals = q.order_by(Deal.position).all()
    columns = []
    for key, label, prob in DEAL_STAGES:
        cards = [serialize(d, "deal") for d in deals if d.stage == key]
        columns.append(
            {
                "stage": key,
                "label": label,
                "probability": prob,
                "total": sum(c["amount_micros"] for c in cards) / 1_000_000,
                "deals": cards,
            }
        )
    return columns


@router.get("/deal-rows")
def deal_rows(db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Deals as the table shows them: company and contact names, the next open task and the last activity."""
    deals = db.query(Deal).filter(Deal.deleted_at.is_(None)).order_by(Deal.amount_micros.desc()).all()
    ids = [d.id for d in deals]
    names = {}
    for model, rtype in ((Company, "company"), (Contact, "contact")):
        wanted = {getattr(d, f"{rtype}_id") for d in deals} - {None}
        names[rtype] = {r.id: r.display_name for r in db.query(model).filter(model.id.in_(wanted))} if wanted else {}
    links = (db.query(ActivityTarget.target_id, Task)
             .join(Task, Task.id == ActivityTarget.item_id)
             .filter(ActivityTarget.item_kind == "task", ActivityTarget.target_type == "deal", ActivityTarget.target_id.in_(ids),
                     Task.deleted_at.is_(None), Task.status != "DONE")
             .all()) if ids else []
    nxt: dict[int, Task] = {}
    for deal_id, task in links:
        cur = nxt.get(deal_id)
        if cur is None or (task.due_at or datetime.max) < (cur.due_at or datetime.max):
            nxt[deal_id] = task
    touch = dict(db.query(TimelineActivity.record_id, func.max(TimelineActivity.happens_at))
                 .filter(TimelineActivity.record_type == "deal", TimelineActivity.record_id.in_(ids))
                 .group_by(TimelineActivity.record_id).all()) if ids else {}
    rows = []
    for d in deals:
        row = serialize(d, "deal")
        t = nxt.get(d.id)
        row.update({
            "company_name": names["company"].get(d.company_id),
            "contact_name": names["contact"].get(d.contact_id),
            "next_step": {"id": t.id, "title": t.title, "due_at": t.due_at.isoformat() if t.due_at else None} if t else None,
            "last_touch": touch[d.id].isoformat() if d.id in touch else None,
        })
        rows.append(row)
    return rows


class MoveIn(BaseModel):
    stage: str
    before_id: int | None = None  # card that will sit *below* the moved card
    after_id: int | None = None  # card that will sit *above* the moved card


@router.post("/deals/{deal_id}/move")
def move(deal_id: int, body: MoveIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    deal = get_record(db, "deal", deal_id) or _404("deal", deal_id)
    move_deal(db, deal, body.stage, body.before_id, body.after_id, actor_of(user))
    db.commit()
    return serialize(deal, "deal")


# --------------------------------------------------------------------------- leads

class ConvertIn(BaseModel):
    create_deal: bool = True
    deal_name: str | None = None
    amount: float | None = None


def convert_lead_core(db: Session, lead: Lead, actor: Actor, create_deal: bool = True,
                      deal_name: str | None = None, amount: float | None = None) -> dict:
    """Lead conversion: Lead → Company + Contact (+ Deal), keeping links back."""
    if lead.status == "converted":
        raise HTTPException(409, "lead already converted")
    company = None
    if lead.company_name:
        company = db.query(Company).filter(Company.name == lead.company_name, Company.deleted_at.is_(None)).first()
        if company is None:
            domain = lead.email.split("@", 1)[1] if lead.email and "@" in lead.email else None
            company = create_record(db, "company", {"name": lead.company_name, "domain": domain, "owner_id": lead.owner_id}, actor)
    contact = create_record(
        db,
        "contact",
        {
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "email": lead.email,
            "phone": lead.phone,
            "job_title": lead.job_title,
            "company_id": company.id if company else None,
            "owner_id": lead.owner_id,
        },
        actor,
    )
    deal = None
    if create_deal:
        amt = amount if amount is not None else (lead.budget_micros or 0) / 1_000_000
        deal = create_record(
            db,
            "deal",
            {
                "name": deal_name or f"{lead.company_name or lead.display_name}, new deal",
                "amount_micros": int(amt * 1_000_000),
                "stage": "QUALIFIED",
                "company_id": company.id if company else None,
                "contact_id": contact.id,
                "owner_id": lead.owner_id or actor.user_id,
            },
            actor,
        )
    update_record(
        db,
        "lead",
        lead,
        {
            "status": "converted",
            "converted_company_id": company.id if company else None,
            "converted_contact_id": contact.id,
            "converted_deal_id": deal.id if deal else None,
        },
        actor,
    )
    write_activity(db, "lead.converted", "lead", lead.id, actor_id=actor.user_id, actor_source=actor.source, properties={
        "company_id": company.id if company else None, "contact_id": contact.id, "deal_id": deal.id if deal else None})
    # Move tasks/notes that were attached to the lead onto the new contact.
    for kind in ("task", "note"):
        for item_id in items_for_target(db, kind, "lead", lead.id):
            db.add(ActivityTarget(item_kind=kind, item_id=item_id, target_type="contact", target_id=contact.id))
    return {"company": company, "contact": contact, "deal": deal}


@router.post("/leads/{lead_id}/convert")
def convert_lead(lead_id: int, body: ConvertIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    lead: Lead = get_record(db, "lead", lead_id) or _404("lead", lead_id)
    out = convert_lead_core(db, lead, actor_of(user), body.create_deal, body.deal_name, body.amount)
    db.commit()
    company, contact, deal = out["company"], out["contact"], out["deal"]
    return {
        "lead": _out(db, lead, "lead"),
        "company": serialize(company, "company") if company else None,
        "contact": serialize(contact, "contact"),
        "deal": serialize(deal, "deal") if deal else None,
    }


@router.post("/leads/{lead_id}/rescore")
def rescore_lead(lead_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    lead = get_record(db, "lead", lead_id) or _404("lead", lead_id)
    rescore(db, lead)
    db.commit()
    return _out(db, lead, "lead")


# --------------------------------------------------------------------------- automations

class AutomationIn(BaseModel):
    name: str
    trigger_event: str
    conditions: list[dict[str, Any]] = []
    actions: list[dict[str, Any]]
    enabled: bool = True


def _auto_out(a: Automation) -> dict:
    return {
        "id": a.id, "name": a.name, "enabled": a.enabled, "trigger_event": a.trigger_event,
        "conditions": a.conditions, "actions": a.actions, "run_count": a.run_count,
        "last_run_at": a.last_run_at.isoformat() if a.last_run_at else None,
    }


@router.get("/automations")
def list_automations(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [_auto_out(a) for a in db.query(Automation).order_by(Automation.id)]


@router.post("/automations", status_code=201)
def create_automation(body: AutomationIn, db: Session = Depends(get_db), _: User = Depends(current_user)):
    automation_engine.validate_rule(body.trigger_event, body.conditions, body.actions)
    a = Automation(**body.model_dump())
    db.add(a)
    db.commit()
    return _auto_out(a)


@router.patch("/automations/{aid}")
def update_automation(aid: int, body: dict[str, Any] = Body(...), db: Session = Depends(get_db), _: User = Depends(current_user)):
    a = db.get(Automation, aid) or _404("automation", aid)
    for k in ("name", "enabled", "trigger_event", "conditions", "actions"):
        if k in body:
            setattr(a, k, body[k])
    automation_engine.validate_rule(a.trigger_event, a.conditions, a.actions)
    db.commit()
    return _auto_out(a)


@router.delete("/automations/{aid}", status_code=204)
def delete_automation(aid: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    a = db.get(Automation, aid) or _404("automation", aid)
    db.query(AutomationRun).filter(AutomationRun.automation_id == aid).delete()
    db.delete(a)
    db.commit()


@router.get("/automations/runs")
def automation_runs(limit: int = 50, db: Session = Depends(get_db), _: User = Depends(current_user)):
    runs = db.query(AutomationRun).order_by(AutomationRun.id.desc()).limit(limit).all()
    names = {a.id: a.name for a in db.query(Automation)}
    return [
        {"id": r.id, "automation_id": r.automation_id, "automation": names.get(r.automation_id),
         "record": _target_ref(db, r.record_type, r.record_id), "status": r.status,
         "output": r.output, "created_at": r.created_at.isoformat()}
        for r in runs
    ]


# --------------------------------------------------------------------------- generic records

@router.get("/{plural}")
def list_records(
    plural: Plural,
    q: str | None = None,
    limit: int = Query(200, le=500),
    offset: int = 0,
    sort: str = "-id",
    filters: str | None = Query(None, description="comma list of field:value"),
    target_type: str | None = None,
    target_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    rtype = PLURAL[plural]
    model = MODEL_BY_TYPE[rtype]
    query = db.query(model).filter(model.deleted_at.is_(None))
    if q:
        query = query.filter(or_(*[getattr(model, f).ilike(f"%{q}%") for f in SEARCH_FIELDS[rtype]]))
    if filters:
        for part in filters.split(","):
            field, _, value = part.partition(":")
            if field in FILTERABLE and hasattr(model, field):
                query = query.filter(getattr(model, field) == value)
    if target_type and target_id and rtype in ("task", "note"):
        query = query.filter(model.id.in_(items_for_target(db, rtype, target_type, target_id)))
    desc = sort.startswith("-")
    col = getattr(model, sort.lstrip("-"), model.id)
    query = query.order_by(col.desc() if desc else col.asc())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {"total": total, "items": [_out(db, r, rtype) for r in rows]}


@router.post("/{plural}", status_code=201)
def create(plural: Plural, body: dict[str, Any] = Body(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    rtype = PLURAL[plural]
    targets = body.pop("targets", None)
    if rtype in ("company", "contact", "lead", "deal"):
        body.setdefault("owner_id", user.id)
    record = create_record(db, rtype, body, actor_of(user), targets=targets)
    db.commit()
    return _out(db, record, rtype)


@router.get("/{plural}/{record_id}")
def read(plural: Plural, record_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    rtype = PLURAL[plural]
    record = get_record(db, rtype, record_id) or _404(rtype, record_id)
    data = _out(db, record, rtype)
    related: dict[str, list] = {}
    if rtype == "company":
        related["contacts"] = [serialize(c, "contact") for c in db.query(Contact).filter(Contact.company_id == record.id, Contact.deleted_at.is_(None))]
        related["deals"] = [serialize(d, "deal") for d in db.query(Deal).filter(Deal.company_id == record.id, Deal.deleted_at.is_(None))]
    if rtype == "contact":
        related["deals"] = [serialize(d, "deal") for d in db.query(Deal).filter(Deal.contact_id == record.id, Deal.deleted_at.is_(None))]
    if rtype not in ("task", "note"):
        related["tasks"] = [_out(db, t, "task") for t in db.query(Task).filter(Task.id.in_(items_for_target(db, "task", rtype, record.id)), Task.deleted_at.is_(None)).order_by(Task.id.desc())]
        related["notes"] = [_out(db, n, "note") for n in db.query(Note).filter(Note.id.in_(items_for_target(db, "note", rtype, record.id)), Note.deleted_at.is_(None)).order_by(Note.id.desc())]
    if rtype == "deal":
        data["health"] = deal_health(db, record)
    data["related"] = related
    return data


@router.patch("/{plural}/{record_id}")
def patch(plural: Plural, record_id: int, body: dict[str, Any] = Body(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    rtype = PLURAL[plural]
    record = get_record(db, rtype, record_id) or _404(rtype, record_id)
    update_record(db, rtype, record, body, actor_of(user))
    db.commit()
    return _out(db, record, rtype)


@router.delete("/{plural}/{record_id}", status_code=204)
def delete(plural: Plural, record_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    rtype = PLURAL[plural]
    record = get_record(db, rtype, record_id) or _404(rtype, record_id)
    delete_record(db, rtype, record, actor_of(user))
    db.commit()


@router.get("/{plural}/{record_id}/timeline")
def timeline(plural: Plural, record_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    rtype = PLURAL[plural]
    get_record(db, rtype, record_id, include_deleted=True) or _404(rtype, record_id)
    names = {u.id: u.name for u in db.query(User)}
    return [
        {
            "id": a.id, "name": a.name, "happens_at": a.happens_at.isoformat(),
            "actor": names.get(a.actor_id) if a.actor_id else a.actor_source,
            "actor_source": a.actor_source, "properties": a.properties,
            "linked": {"type": a.linked_record_type, "id": a.linked_record_id, "name": a.linked_record_name}
            if a.linked_record_type else None,
        }
        for a in timeline_for(db, rtype, record_id)
    ]


def install_error_handlers(app) -> None:
    from fastapi.responses import JSONResponse

    @app.exception_handler(ValidationError)
    async def _validation(_, exc: ValidationError):  # pragma: no cover - trivial
        return JSONResponse({"detail": str(exc)}, status_code=422)
