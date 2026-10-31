"""Pipeline analytics and per-deal health signals ("next best action")."""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import DEAL_STAGES, ActivityTarget, Deal, Lead, Task, TimelineActivity, utcnow

OPEN_STAGES = [k for k, _, _ in DEAL_STAGES if k not in ("WON", "LOST")]
STALE_DAYS = 14


def deal_health(db: Session, deal: Deal) -> dict:
    """Return a 0-100 health score with concrete, actionable warnings."""
    now = utcnow()
    issues: list[dict] = []
    if deal.stage in ("WON", "LOST"):
        return {"score": 100, "status": "closed", "issues": []}

    last = (
        db.query(func.max(TimelineActivity.happens_at))
        .filter(TimelineActivity.record_type == "deal", TimelineActivity.record_id == deal.id)
        .scalar()
    )
    if last and (now - last).days >= STALE_DAYS:
        issues.append({"penalty": 30, "code": "stale", "message": f"No activity for {(now - last).days} days", "action": "Log a call or send a follow-up"})
    if deal.close_date and deal.close_date < now:
        issues.append({"penalty": 25, "code": "overdue_close", "message": "Expected close date has passed", "action": "Update the close date or move the stage"})
    if not deal.contact_id:
        issues.append({"penalty": 15, "code": "no_contact", "message": "No point of contact", "action": "Link a decision maker"})
    task_ids = [
        r[0]
        for r in db.query(ActivityTarget.item_id).filter(
            ActivityTarget.item_kind == "task", ActivityTarget.target_type == "deal", ActivityTarget.target_id == deal.id
        )
    ]
    open_tasks = (
        db.query(Task).filter(Task.id.in_(task_ids), Task.status != "DONE", Task.deleted_at.is_(None)).count() if task_ids else 0
    )
    if open_tasks == 0:
        issues.append({"penalty": 15, "code": "no_next_step", "message": "No open next step", "action": "Create a follow-up task"})
    if (now - deal.stage_changed_at).days > 30:
        issues.append({"penalty": 15, "code": "stuck", "message": f"In {deal.stage} for {(now - deal.stage_changed_at).days} days", "action": "Re-qualify or push to next stage"})
    score = max(0, 100 - sum(i["penalty"] for i in issues))
    status = "healthy" if score >= 70 else "at_risk" if score >= 40 else "critical"
    return {"score": score, "status": status, "issues": issues}


def dashboard(db: Session) -> dict:
    now = utcnow()
    deals = db.query(Deal).filter(Deal.deleted_at.is_(None)).all()
    by_stage: dict[str, dict] = {k: {"stage": k, "label": label, "count": 0, "amount": 0.0} for k, label, _ in DEAL_STAGES}
    weighted = open_value = 0.0
    for d in deals:
        amt = d.amount_micros / 1_000_000
        by_stage[d.stage]["count"] += 1
        by_stage[d.stage]["amount"] += amt
        if d.stage in OPEN_STAGES:
            open_value += amt
            weighted += amt * d.win_probability / 100
    won = [d for d in deals if d.stage == "WON"]
    lost = [d for d in deals if d.stage == "LOST"]
    closed = len(won) + len(lost)
    cycle = [(d.stage_changed_at - d.created_at).days for d in won]

    leads = db.query(Lead).filter(Lead.deleted_at.is_(None)).all()
    src: dict[str, dict] = defaultdict(lambda: {"leads": 0, "converted": 0})
    for lead in leads:
        src[lead.source]["leads"] += 1
        src[lead.source]["converted"] += lead.status == "converted"
    sources = [
        {"source": s, **v, "conversion_rate": round(v["converted"] / v["leads"] * 100, 1) if v["leads"] else 0}
        for s, v in sorted(src.items(), key=lambda kv: -kv[1]["leads"])
    ]

    since = now - timedelta(days=13)
    act_rows = (
        db.query(func.date(TimelineActivity.happens_at), func.count())
        .filter(TimelineActivity.happens_at >= since.replace(hour=0, minute=0, second=0))
        .group_by(func.date(TimelineActivity.happens_at))
        .all()
    )
    act_map = {str(d): c for d, c in act_rows}
    activity = [
        {"date": (since + timedelta(days=i)).date().isoformat(), "count": act_map.get((since + timedelta(days=i)).date().isoformat(), 0)}
        for i in range(14)
    ]
    overdue = (
        db.query(Task)
        .filter(Task.deleted_at.is_(None), Task.status != "DONE", Task.due_at.isnot(None), Task.due_at < now)
        .count()
    )
    at_risk = []
    for d in deals:
        if d.stage in OPEN_STAGES:
            h = deal_health(db, d)
            if h["status"] != "healthy":
                at_risk.append({"id": d.id, "name": d.name, "amount": d.amount_micros / 1_000_000, **h})
    at_risk.sort(key=lambda r: (r["score"], -r["amount"]))
    return {
        "kpis": {
            "open_pipeline": round(open_value, 2),
            "weighted_forecast": round(weighted, 2),
            "won_value": round(sum(d.amount_micros for d in won) / 1_000_000, 2),
            "win_rate": round(len(won) / closed * 100, 1) if closed else 0,
            "avg_cycle_days": round(sum(cycle) / len(cycle), 1) if cycle else 0,
            "open_deals": sum(1 for d in deals if d.stage in OPEN_STAGES),
            "leads": len(leads),
            "overdue_tasks": overdue,
        },
        "funnel": list(by_stage.values()),
        "lead_sources": sources,
        "activity": activity,
        "at_risk": at_risk[:6],
    }
