"""Deterministic demo data so the app looks alive on first run."""
from __future__ import annotations

import random
from datetime import timedelta

from sqlalchemy.orm import Session

from .auth import hash_password
from .models import Automation, Company, Deal, Lead, TimelineActivity, User, utcnow
from .services import Actor, create_record, update_record

COMPANIES = [
    ("Negev Robotics", "negevrobotics.io", "Robotics", 120, "Beer Sheva"),
    ("Galil Foods", "galilfoods.co.il", "Food & Beverage", 340, "Karmiel"),
    ("Yam Logistics", "yamlogistics.com", "Logistics", 860, "Haifa"),
    ("Orion Cyber", "orioncyber.io", "Cybersecurity", 75, "Tel Aviv"),
    ("Tamar Health", "tamarhealth.com", "Healthcare", 410, "Jerusalem"),
    ("Kinneret Solar", "kinneretsolar.com", "Energy", 95, "Tiberias"),
    ("Arava AgriTech", "arava-agri.com", "AgriTech", 48, "Eilat"),
    ("Carmel Fintech", "carmelfin.io", "Fintech", 150, "Herzliya"),
    ("Sharon Retail Group", "sharonretail.co.il", "Retail", 1200, "Netanya"),
    ("Hermon EdTech", "hermonedu.com", "Education", 60, "Ramat Gan"),
    ("Dead Sea Cosmetics Lab", "dslab.com", "Cosmetics", 210, "Arad"),
    ("Jaffa Creative Studio", "jaffastudio.co", "Media", 25, "Tel Aviv"),
]
FIRST = ["Noa", "Itai", "Maya", "Yoav", "Shira", "Amit", "Tamar", "Omer", "Lior", "Dana", "Eitan", "Yael", "Ron", "Michal", "Guy", "Hila", "Nadav", "Roni", "Adi", "Ofek"]
LAST = ["Levi", "Cohen", "Mizrahi", "Peretz", "Biton", "Friedman", "Azoulay", "Katz", "Shapiro", "Ben-David", "Golan", "Avraham"]
TITLES = ["CEO", "CTO", "VP Sales", "Head of Operations", "Procurement Manager", "Product Manager", "Founder", "Director of IT", "Marketing Lead", "CFO"]
DEAL_KINDS = ["Annual license", "Pilot", "Expansion", "Onboarding package", "Enterprise plan", "Integration project", "Support renewal"]
STAGE_MIX = ["NEW"] * 5 + ["QUALIFIED"] * 6 + ["PROPOSAL"] * 6 + ["NEGOTIATION"] * 4 + ["WON"] * 6 + ["LOST"] * 3
LEAD_CO = ["Ella Bakery", "Modiin Motors", "Rehovot BioLabs", "Ashdod Port Services", "Golan Wines", "Petah Tikva Clinics", "Holon Toys", "Eilat Hotels", "Lod Printing", "Hadera Steel"]

DEFAULT_RULES = [
    {
        "name": "Proposal sent: follow-up task in 3 days",
        "trigger_event": "deal.updated",
        "conditions": [{"field": "stage", "op": "changed_to", "value": "PROPOSAL"}],
        "actions": [{"type": "create_task", "params": {"title": "Follow up on proposal: {{record.name}}", "due_in_days": 3, "assignee": "owner"}}],
    },
    {
        "name": "Hot lead (score 70+): call within a day",
        "trigger_event": "lead.created",
        "conditions": [{"field": "score", "op": "gte", "value": 70}],
        "actions": [
            {"type": "create_task", "params": {"title": "Call hot lead {{record.display_name}}", "due_in_days": 1}},
            {"type": "update_record", "params": {"values": {"status": "contacted"}}},
        ],
    },
    {
        "name": "Deal won: onboarding note and webhook",
        "trigger_event": "deal.updated",
        "conditions": [{"field": "stage", "op": "changed_to", "value": "WON"}],
        "actions": [
            {"type": "add_note", "params": {"title": "Kick-off onboarding", "body": "{{record.name}} closed. Schedule kick-off with {{record.contact_name}}."}},
            {"type": "webhook", "params": {"url": "https://hooks.example.com/crm/deal-won"}},
        ],
    },
    {
        "name": "Negotiation: assistant writes a brief",
        "trigger_event": "deal.updated",
        "enabled": False,  # turn on once ANTHROPIC_API_KEY is set
        "conditions": [{"field": "stage", "op": "changed_to", "value": "NEGOTIATION"}],
        "actions": [{"type": "ai_agent", "params": {"instructions": "Read the deal's notes and timeline and add a note titled 'Negotiation brief' with: what the buyer cares about, likely objections, our walk-away terms, and a proposed concession plan. Then create a task to review it before the next call."}}],
    },
]


def seed_if_empty(db: Session) -> bool:
    if db.query(User).count():
        return False
    seed(db)
    return True


def seed(db: Session, rnd_seed: int = 7) -> None:
    rnd = random.Random(rnd_seed)
    now = utcnow()
    admin = User(email="admin@redline.dev", name="May Admin", role="admin", password_hash=hash_password("demo1234"))
    reps = [
        User(email="dor@redline.dev", name="Dor Sales", role="sales", password_hash=hash_password("demo1234")),
        User(email="noa@redline.dev", name="Noa Sales", role="sales", password_hash=hash_password("demo1234")),
    ]
    db.add_all([admin, *reps])
    db.flush()
    team = [admin, *reps]
    imp = Actor(source="import")

    for rule in DEFAULT_RULES:
        db.add(Automation(**rule))
    db.flush()

    companies: list[Company] = []
    for name, domain, industry, emp, city in COMPANIES:
        companies.append(
            create_record(db, "company", {
                "name": name, "domain": domain, "industry": industry, "employees": emp, "city": city,
                "annual_revenue_micros": emp * rnd.randint(150, 400) * 1000 * 1_000_000 // 1000,
                "owner_id": rnd.choice(team).id,
            }, imp)
        )

    contacts = []
    for co in companies:
        for _ in range(rnd.randint(1, 3)):
            fn, ln = rnd.choice(FIRST), rnd.choice(LAST)
            contacts.append(
                create_record(db, "contact", {
                    "first_name": fn, "last_name": ln, "email": f"{fn.lower()}.{ln.lower().replace('-', '')}@{co.domain}",
                    "phone": f"05{rnd.randint(0, 9)}-{rnd.randint(1000000, 9999999)}", "job_title": rnd.choice(TITLES),
                    "company_id": co.id, "owner_id": co.owner_id,
                }, imp)
            )

    for i, stage in enumerate(STAGE_MIX):
        co = rnd.choice(companies)
        co_contacts = [c for c in contacts if c.company_id == co.id]
        created = now - timedelta(days=rnd.randint(5, 75))
        deal = create_record(db, "deal", {
            "name": f"{co.name}, {rnd.choice(DEAL_KINDS)}",
            "amount_micros": rnd.choice([12, 18, 25, 40, 60, 85, 120, 150, 220]) * 1000 * 1_000_000,
            "stage": "NEW", "company_id": co.id, "contact_id": rnd.choice(co_contacts).id if co_contacts and rnd.random() > 0.15 else None,
            "owner_id": co.owner_id, "close_date": (now + timedelta(days=rnd.randint(-10, 60))).isoformat(),
        }, imp)
        deal.created_at = created
        if stage != "NEW":
            # walk through the stages so the timeline shows a real history
            path = ["QUALIFIED", "PROPOSAL", "NEGOTIATION"]
            target = stage if stage not in ("WON", "LOST") else rnd.choice(path)
            for s in path[: path.index(target) + 1]:
                update_record(db, "deal", deal, {"stage": s}, Actor(user_id=deal.owner_id, source="manual", depth=9))
            if stage in ("WON", "LOST"):
                vals = {"stage": stage}
                if stage == "LOST":
                    vals["lost_reason"] = rnd.choice(["Price", "Chose competitor", "No budget", "Timing"])
                update_record(db, "deal", deal, vals, Actor(user_id=deal.owner_id, source="manual", depth=9))
        deal.stage_changed_at = created + timedelta(days=rnd.randint(2, 40))
        if deal.stage_changed_at > now:
            deal.stage_changed_at = now
        if rnd.random() > 0.35 and stage not in ("WON", "LOST"):
            create_record(db, "task", {
                "title": rnd.choice(["Send pricing", "Book demo", "Security questionnaire", "Intro call", "Legal review"]),
                "due_at": (now + timedelta(days=rnd.randint(-4, 10))).isoformat(), "assignee_id": deal.owner_id,
            }, Actor(user_id=deal.owner_id), targets=[{"type": "deal", "id": deal.id}])
        if rnd.random() > 0.5:
            create_record(db, "note", {
                "title": rnd.choice(["Discovery call notes", "Pricing feedback", "Decision process", "Competitor mentioned"]),
                "body": rnd.choice([
                    "Budget approved for Q1. Decision by committee of 3.",
                    "Asked for a 10% discount on a 2-year term.",
                    "Main competitor is a spreadsheet + WhatsApp groups.",
                    "Needs Hebrew UI and on-prem option.",
                ]),
            }, Actor(user_id=deal.owner_id), targets=[{"type": "deal", "id": deal.id}, *([{"type": "company", "id": co.id}])])

    sources = ["referral", "event", "website", "website", "ads", "cold"]
    for i, co_name in enumerate(LEAD_CO * 2):
        fn, ln = rnd.choice(FIRST), rnd.choice(LAST)
        domain = co_name.lower().replace(" ", "") + ".co.il" if rnd.random() > 0.3 else "gmail.com"
        lead = create_record(db, "lead", {
            "first_name": fn, "last_name": ln, "email": f"{fn.lower()}@{domain}",
            "phone": f"05{rnd.randint(0, 9)}-{rnd.randint(1000000, 9999999)}" if rnd.random() > 0.3 else None,
            "job_title": rnd.choice(TITLES + ["Analyst", "Office Manager"]), "company_name": co_name,
            "source": rnd.choice(sources), "budget_micros": rnd.choice([0, 0, 15, 30, 80, 150]) * 1000 * 1_000_000,
            "status": rnd.choice(["new", "new", "contacted", "qualified", "unqualified"]),
            "owner_id": rnd.choice(team).id,
        }, Actor(source="import", depth=9))
        lead.created_at = now - timedelta(days=rnd.randint(0, 40))
        if i % 7 == 0:
            update_record(db, "lead", lead, {"status": "converted"}, Actor(source="import", depth=9))

    # Spread the generated history over the last two months for realistic charts.
    # Per-record ordering is preserved so a deal's history still reads top-down.
    cursor: dict[tuple[str, int], object] = {}
    for act in db.query(TimelineActivity).order_by(TimelineActivity.id).all():
        key = (act.record_type, act.record_id)
        prev = cursor.get(key)
        when = (prev + timedelta(days=rnd.randint(1, 6), hours=rnd.randint(0, 8))) if prev else now - timedelta(days=rnd.randint(4, 45))
        act.happens_at = min(when, now - timedelta(minutes=rnd.randint(5, 600)))
        cursor[key] = act.happens_at
    # One live stage move so the automation log has a real run to show.
    demo = db.query(Deal).filter(Deal.stage == "QUALIFIED").order_by(Deal.id).first()
    if demo:
        update_record(db, "deal", demo, {"stage": "PROPOSAL"}, Actor(user_id=demo.owner_id))
    db.commit()
