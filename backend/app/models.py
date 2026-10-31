"""Domain model.

Design decisions (see docs/design.md):

* Money is stored as integer micros + ISO currency, so sums never suffer
  float drift.
* Every record carries ``created_by_source`` (manual / api / automation / ai /
  import), so the timeline can say *who or what* made a change.
* Soft delete through ``deleted_at``.
* Kanban ordering through a float ``position`` (insert between two cards
  without renumbering the column).
* Tasks and notes attach to *any* record through a polymorphic target
  table instead of one foreign key per object type.
* Leads are a separate pre-qualification object that *converts* into
  Company + Contact + Deal.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


DEAL_STAGES: list[tuple[str, str, int]] = [
    # (key, label, default win probability %)
    ("NEW", "New", 10),
    ("QUALIFIED", "Qualified", 25),
    ("PROPOSAL", "Proposal", 50),
    ("NEGOTIATION", "Negotiation", 75),
    ("WON", "Won", 100),
    ("LOST", "Lost", 0),
]
STAGE_KEYS = [s[0] for s in DEAL_STAGES]
STAGE_PROBABILITY = {k: p for k, _, p in DEAL_STAGES}

LEAD_SOURCES = ["referral", "event", "website", "ads", "cold"]
LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified", "converted"]
TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"]
RECORD_TYPES = ["company", "contact", "lead", "deal", "task", "note"]


class AuditMixin:
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_source: Mapped[str] = mapped_column(String(20), default="manual")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="sales")  # admin | sales
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Company(AuditMixin, Base):
    __tablename__ = "companies"
    name: Mapped[str] = mapped_column(String(200), index=True)
    domain: Mapped[str | None] = mapped_column(String(200), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    employees: Mapped[int | None] = mapped_column(Integer, nullable=True)
    annual_revenue_micros: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    contacts: Mapped[list["Contact"]] = relationship(back_populates="company")
    deals: Mapped[list["Deal"]] = relationship(back_populates="company")

    @property
    def display_name(self) -> str:
        return self.name


class Contact(AuditMixin, Base):
    __tablename__ = "contacts"
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    company: Mapped[Company | None] = relationship(back_populates="contacts")

    @property
    def display_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Lead(AuditMixin, Base):
    __tablename__ = "leads"
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source: Mapped[str] = mapped_column(String(30), default="website")
    status: Mapped[str] = mapped_column(String(30), default="new")
    budget_micros: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    score_reasons: Mapped[list] = mapped_column(JSON, default=list)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    converted_company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    converted_contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    converted_deal_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id"), nullable=True)

    @property
    def display_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Deal(AuditMixin, Base):
    __tablename__ = "deals"
    name: Mapped[str] = mapped_column(String(200))
    amount_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="ILS")
    stage: Mapped[str] = mapped_column(String(20), default="NEW", index=True)
    position: Mapped[float] = mapped_column(Float, default=0.0)
    close_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    probability: Mapped[int | None] = mapped_column(Integer, nullable=True)  # override
    lost_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    stage_changed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    company: Mapped[Company | None] = relationship(back_populates="deals")
    contact: Mapped[Contact | None] = relationship()

    @property
    def display_name(self) -> str:
        return self.name

    @property
    def win_probability(self) -> int:
        return self.probability if self.probability is not None else STAGE_PROBABILITY.get(self.stage, 0)


class Task(AuditMixin, Base):
    __tablename__ = "tasks"
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="TODO")
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    @property
    def display_name(self) -> str:
        return self.title


class Note(AuditMixin, Base):
    __tablename__ = "notes"
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def display_name(self) -> str:
        return self.title


class ActivityTarget(Base):
    """Polymorphic link: a task or note attached to any CRM record."""

    __tablename__ = "activity_targets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_kind: Mapped[str] = mapped_column(String(10), index=True)  # task | note
    item_id: Mapped[int] = mapped_column(Integer, index=True)
    target_type: Mapped[str] = mapped_column(String(20), index=True)
    target_id: Mapped[int] = mapped_column(Integer, index=True)


class TimelineActivity(Base):
    """Append-only event log rendered as each record's timeline.

    ``name`` follows ``<object>.<verb>`` (``deal.updated``); events on a task or
    note are fanned out to every attached record as ``linked-task.created``.
    ``properties`` keeps a field-level ``diff`` {field: {before, after}}.
    """

    __tablename__ = "timeline_activities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    happens_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    name: Mapped[str] = mapped_column(String(60), index=True)
    record_type: Mapped[str] = mapped_column(String(20), index=True)
    record_id: Mapped[int] = mapped_column(Integer, index=True)
    linked_record_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    linked_record_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    linked_record_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_source: Mapped[str] = mapped_column(String(20), default="manual")
    properties: Mapped[dict] = mapped_column(JSON, default=dict)


class Automation(Base):
    """A trigger → conditions → actions rule (compact no-code workflow)."""

    __tablename__ = "automations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    trigger_event: Mapped[str] = mapped_column(String(60), index=True)  # e.g. deal.updated
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    actions: Mapped[list] = mapped_column(JSON, default=list)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AutomationRun(Base):
    __tablename__ = "automation_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    automation_id: Mapped[int] = mapped_column(ForeignKey("automations.id", ondelete="CASCADE"), index=True)
    record_type: Mapped[str] = mapped_column(String(20))
    record_id: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))  # success | failed
    output: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


MODEL_BY_TYPE = {
    "company": Company,
    "contact": Contact,
    "lead": Lead,
    "deal": Deal,
    "task": Task,
    "note": Note,
}
