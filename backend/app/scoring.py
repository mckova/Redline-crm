"""Explainable lead scoring.

Every point added carries a human-readable reason, so a salesperson can see
*why* a lead is an "A". The score is recomputed automatically whenever a lead
is created or edited (event listener below) and on demand via the API.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from .models import Lead, TimelineActivity
from .services import RecordEvent, subscribe

FREE_MAIL = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "walla.co.il", "icloud.com"}
SOURCE_POINTS = {"referral": 25, "event": 15, "website": 10, "ads": 5, "cold": 0}
SENIORITY = [
    (r"\b(ceo|cto|coo|cfo|founder|owner|president|מנכ\"?ל|בעלים)\b", 20, "decision maker title"),
    (r"\b(vp|vice president|head|director|סמנכ\"?ל)\b", 15, "senior title"),
    (r"\b(manager|lead|מנהל)\b", 8, "manager title"),
]


def compute_score(lead: Lead, engagement_events: int = 0) -> tuple[int, list[dict]]:
    reasons: list[dict] = []

    def add(points: int, why: str) -> None:
        if points:
            reasons.append({"points": points, "reason": why})

    add(SOURCE_POINTS.get(lead.source, 0), f"source: {lead.source}")
    if lead.email:
        domain = lead.email.rsplit("@", 1)[-1].lower()
        add(15 if domain not in FREE_MAIL else 3, "business email" if domain not in FREE_MAIL else "personal email")
    add(10 if lead.phone else 0, "phone number provided")
    add(5 if lead.company_name else 0, "company known")
    title = (lead.job_title or "").lower()
    for pattern, pts, why in SENIORITY:
        if re.search(pattern, title):
            add(pts, why)
            break
    budget = (lead.budget_micros or 0) / 1_000_000
    if budget >= 100_000:
        add(25, "budget ≥ 100K")
    elif budget >= 25_000:
        add(15, "budget ≥ 25K")
    elif budget > 0:
        add(5, "budget stated")
    add(min(engagement_events * 2, 10), f"{engagement_events} engagement events")
    score = max(0, min(100, sum(r["points"] for r in reasons)))
    return score, reasons


def grade(score: int) -> str:
    return "A" if score >= 70 else "B" if score >= 50 else "C" if score >= 30 else "D"


def rescore(db: Session, lead: Lead) -> Lead:
    engagement = (
        db.query(TimelineActivity)
        .filter(
            TimelineActivity.record_type == "lead",
            TimelineActivity.record_id == lead.id,
            TimelineActivity.name.like("linked-%"),
        )
        .count()
    )
    lead.score, lead.score_reasons = compute_score(lead, engagement)
    return lead


@subscribe
def on_lead_event(db: Session, event: RecordEvent) -> None:
    if event.record_type == "lead" and event.verb in ("created", "updated"):
        rescore(db, event.record)
