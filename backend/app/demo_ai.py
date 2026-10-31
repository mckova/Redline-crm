"""Offline demo stand-in for Claude.

Used when no ``ANTHROPIC_API_KEY`` is configured (``KESHER_AI=auto``) or when
``KESHER_AI=demo``. It speaks the same request/response shape as
``client.beta.messages.create`` / ``.parse`` and drives the *real* tool loop,
approval cards, background jobs and structured outputs, but its "reasoning" is
a small set of deterministic rules over the CRM data it is given. Everything it
produces is labelled "demo mode" in the UI, so nobody mistakes it for the
model. Set an API key to get Claude Opus 5.5 instead.
"""
from __future__ import annotations

import json
import re
from types import SimpleNamespace
from typing import Any

STAGE_WORDS = [
    ("WON", ["won", "signed", "closed won", "נחתם", "סגרנו", "נסגר"]),
    ("LOST", ["lost", "went with", "chose another", "הפסדנו", "בחרו במתחרה", "ירד מהפרק"]),
    ("NEGOTIATION", ["negotiat", "discount", "terms", "משא ומתן", "הנחה", "תנאים"]),
    ("PROPOSAL", ["proposal", "quote", "pricing sent", "הצעת מחיר", "הצעה"]),
    ("QUALIFIED", ["qualified", "budget confirmed", "discovery", "תקציב מאושר", "מתאים"]),
]
STOP = {"the", "and", "for", "with", "what", "who", "show", "find", "about", "from", "this", "that", "deal", "deals",
        "lead", "leads", "company", "please", "can", "you", "me", "my", "is", "are", "of", "to", "in", "on", "a",
        "מה", "של", "את", "עם", "על", "זה", "תראה", "תמצא", "לי", "יש", "כל", "מי"}
STAGE_HE = {"NEW": "חדש", "QUALIFIED": "מוסמך", "PROPOSAL": "הצעה", "NEGOTIATION": "משא ומתן", "WON": "נסגר", "LOST": "הפסד"}


HEALTH_HE = {
    "stale": ("אין פעילות {n} ימים", "לתעד שיחה או לשלוח מייל המשך"),
    "overdue_close": ("תאריך הסגירה הצפוי עבר", "לעדכן את תאריך הסגירה או להזיז שלב"),
    "no_contact": ("אין איש קשר", "לקשר מקבל/ת החלטות"),
    "no_next_step": ("אין צעד הבא פתוח", "ליצור משימת המשך"),
    "stuck": ("תקועה באותו שלב {n} ימים", "לבדוק מחדש התאמה או לקדם שלב"),
}


def _issue(i: dict, he: bool) -> tuple[str, str]:
    if not he or i.get("code") not in HEALTH_HE:
        return i["message"], i["action"]
    n = (re.findall(r"\d+", i["message"]) or [""])[0]
    msg, act = HEALTH_HE[i["code"]]
    return msg.replace("{n}", n), act


def _he(text: str) -> bool:
    return bool(re.search(r"[֐-׿]", text or ""))


class _Block(SimpleNamespace):
    def model_dump(self, mode: str = "json", exclude_none: bool = True) -> dict:
        return {k: v for k, v in vars(self).items() if v is not None}


def _text(t: str) -> _Block:
    return _Block(type="text", text=t)


_n = 0


def _tool(name: str, **inp: Any) -> _Block:
    global _n
    _n += 1
    return _Block(type="tool_use", id=f"demo_{_n}", name=name, input=inp)


def _msg(*blocks: _Block, stop: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(content=list(blocks), stop_reason=stop, stop_details=None)


def _json_after(marker: str, text: str) -> dict:
    i = text.find(marker)
    if i < 0:
        return {}
    chunk = text[i + len(marker):].split("\n\n---\n\n")[0].strip()
    try:
        return json.loads(chunk)
    except ValueError:
        return {}


def _amount(text: str) -> int | None:
    best = None
    for m in re.finditer(r"(₪)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|K|אלף|m|M|מיליון)?", text):
        cur, num, unit = m.group(1), float(m.group(2).replace(",", "")), m.group(3)
        if unit in ("k", "K", "אלף"):
            num *= 1000
        elif unit in ("m", "M", "מיליון"):
            num *= 1_000_000
        if (cur or unit) and num >= 1000:
            best = int(num)
    return best


def _stage(text: str) -> str | None:
    low = text.lower()
    for key, words in STAGE_WORDS:
        if any(w in low for w in words):
            return key
    return None


def _keyword(text: str) -> str:
    words = [w.strip(".,?!:;\"'()") for w in text.split()]
    caps = [w for w in words if len(w) > 2 and w[:1].isupper() and w.lower() not in STOP]
    pool = caps or [w for w in words if len(w) > 2 and w.lower() not in STOP]
    return max(pool, key=len) if pool else text[:30]


def _link(ref: dict) -> str:
    return f"[{ref['name']}](/{ref['type']}/{ref['id']})"


# --------------------------------------------------------------------------- copilot + AI steps

def _copilot(messages: list[dict]) -> SimpleNamespace:
    first = messages[0]["content"] if isinstance(messages[0]["content"], str) else ""
    target = re.search(r"opened this conversation from (\w+) #(\d+)", first)
    user_texts = [m["content"] for m in messages if m["role"] == "user" and isinstance(m["content"], str)]
    said = user_texts[-1].split("\n\n---\n\n")[-1]
    he = _he(said)
    last = messages[-1]

    if last["role"] == "user" and isinstance(last["content"], str):
        low = said.lower()
        if any(w in low for w in ("pipeline", "forecast", "today", "focus", "priorit", "צנרת", "תחזית", "היום", "לתעדף", "פייפליין")):
            return _msg(_tool("pipeline_overview"), stop="tool_use")
        if target and target.group(1) in ("deal", "lead", "company", "contact"):
            return _msg(_tool("get_record", record_type=target.group(1), record_id=int(target.group(2))), stop="tool_use")
        return _msg(_tool("search_records", query=_keyword(said)), stop="tool_use")

    # Tool results: find the calls they answer.
    prev = next(m for m in reversed(messages[:-1]) if m["role"] == "assistant")
    calls = [b for b in prev["content"] if b.get("type") == "tool_use"]
    results = {r["tool_use_id"]: r for r in last["content"] if isinstance(r, dict) and r.get("type") == "tool_result"}
    names = {c["name"] for c in calls}

    if names & {"update_record", "create_task", "add_note", "create_record", "convert_lead"}:
        rejected = sum("rejected" in str(r.get("content")) for r in results.values())
        applied = len([c for c in calls if c["name"] in {"update_record", "create_task", "add_note", "create_record", "convert_lead"}]) - rejected
        if he:
            return _msg(_text(f"בוצע: {applied} שינויים נשמרו" + (f", {rejected} נדחו" if rejected else "") + ". הכול מופיע בטיימליין עם תג ✦ AI."))
        return _msg(_text(f"Done: {applied} change(s) applied" + (f", {rejected} skipped" if rejected else "") + ". Everything is on the timeline with a ✦ AI badge."))

    call = calls[0]
    try:
        data = json.loads(results[call["id"]]["content"])
    except (KeyError, ValueError):
        data = {}

    if call["name"] == "pipeline_overview":
        k = data.get("kpis", {})
        risky = data.get("at_risk", [])[:3]
        if he:
            lines = [f"צנרת פתוחה ₪{k.get('open_pipeline', 0):,.0f}, תחזית משוקללת ₪{k.get('weighted_forecast', 0):,.0f}, אחוז זכייה {k.get('win_rate', 0)}%."]
            if risky:
                lines.append("כדאי להתחיל מאלה:")
                lines += [f"- [{r['name']}](/deal/{r['id']}): {' ← '.join(_issue(r['issues'][0], True)) if r['issues'] else ''}" for r in risky]
        else:
            lines = [f"Open pipeline ₪{k.get('open_pipeline', 0):,.0f}, weighted forecast ₪{k.get('weighted_forecast', 0):,.0f}, win rate {k.get('win_rate', 0)}%."]
            if risky:
                lines.append("Where I'd start today:")
                lines += [f"- [{r['name']}](/deal/{r['id']}): {r['issues'][0]['message']} → {r['issues'][0]['action']}" if r["issues"] else f"- [{r['name']}](/deal/{r['id']})" for r in risky]
        return _msg(_text("\n".join(lines)))

    if call["name"] == "search_records":
        hits = data.get("results", [])[:6]
        if not hits:
            return _msg(_text("לא מצאתי רשומות שמתאימות." if he else "I couldn't find matching records."))
        head = f"מצאתי {len(hits)}:" if he else f"I found {len(hits)}:"
        return _msg(_text("\n".join([head, *[f"- {_link(h)} ({h['type']})" for h in hits]])))

    # get_record on the thread's target: turn the user's notes into proposals.
    rtype, rid = call["input"]["record_type"], call["input"]["record_id"]
    rec = data.get("record", {})
    name = rec.get("display_name") or rec.get("name") or f"{rtype} #{rid}"
    proposals = []
    fields = []
    if rtype == "deal":
        st = _stage(said)
        if st and st != rec.get("stage"):
            fields.append({"field": "stage", "value": st})
        amt = _amount(said)
        if amt:
            fields.append({"field": "amount", "value": str(amt)})
    if fields:
        proposals.append(_tool("update_record", record_type=rtype, record_id=rid, fields=fields))
    links = [{"type": rtype, "id": rid}] if rtype in ("deal", "lead", "company", "contact") else []
    if len(said) > 25:
        proposals.append(_tool("add_note", title="סיכום שיחה" if he else "Call summary", body=said, links=links))
    proposals.append(_tool("create_task", title=(f"מעקב: {name}" if he else f"Follow up: {name}"), details=None, due_in_days=2, links=links))
    intro = (f"הנה מה שהייתי מעדכן ב-[{name}](/{rtype}/{rid}), מחכה לאישור שלך:" if he
             else f"Here's what I'd update on [{name}](/{rtype}/{rid}). Approve what looks right:")
    return _msg(_text(intro), *proposals, stop="tool_use")


def _ai_step(messages: list[dict]) -> SimpleNamespace:
    if messages[-1]["role"] == "user" and isinstance(messages[-1]["content"], list):
        return _msg(_text("Added an AI brief and a review task."))
    content = messages[0]["content"]
    instr = content.split("\n\n", 1)[0].removeprefix("Instructions: ")
    m = re.search(r"\n\n(\w+) #(\d+):\n", content)
    rtype, rid = (m.group(1), int(m.group(2))) if m else ("deal", 0)
    ctx = _json_after(f"{rtype} #{rid}:\n", content)
    rec = ctx.get("record", {})
    name = rec.get("display_name") or rec.get("name") or f"{rtype} #{rid}"
    notes = [n.get("body") for n in ctx.get("notes", []) if n.get("body")]
    issues = [i["message"] for i in (ctx.get("health") or {}).get("issues", [])]
    body = "\n".join([
        f"Record: {name}" + (f" · stage {rec['stage']}" if rec.get("stage") else "") + (f" · ₪{rec['amount']:,.0f}" if rec.get("amount") else ""),
        "What we know: " + ("; ".join(notes[:3]) if notes else "no notes logged yet."),
        "Open risks: " + ("; ".join(issues) if issues else "none flagged by deal health."),
        f"Task from the rule: {instr}",
    ])
    title = "Negotiation brief" if "negotiation" in instr.lower() else "AI brief"
    links = [{"type": rtype, "id": rid}]
    return _msg(_tool("add_note", title=title, body=body, links=links),
                _tool("create_task", title=f"Review {title.lower()}: {name}", details=None, due_in_days=1, links=links), stop="tool_use")


# --------------------------------------------------------------------------- structured outputs

def _insight(content: str):
    from .ai import EmailDraft, NextAction, RecordInsight

    he = "Write in Hebrew" in content
    ctx = _json_after("data:\n", content)
    rec = ctx.get("record", {})
    name = rec.get("display_name") or rec.get("name") or "this record"
    health = ctx.get("health") or {}
    issues = health.get("issues", [])
    tasks = [t for t in ctx.get("tasks", []) if t.get("status") != "DONE"]
    notes = ctx.get("notes", [])
    stage = rec.get("stage")
    if stage in ("WON", "LOST"):
        momentum = "closed"
    elif rec.get("score") is not None and stage is None:
        momentum = "accelerating" if rec["score"] >= 70 else "steady" if rec["score"] >= 40 else "stalling"
    else:
        momentum = {"healthy": "steady", "at_risk": "stalling", "critical": "at_risk"}.get(health.get("status"), "steady")
        if momentum == "steady" and len(ctx.get("timeline", [])) >= 4 and not issues:
            momentum = "accelerating"

    if stage:
        amount = f"₪{rec.get('amount', 0):,.0f}"
        summary = (f"{name} נמצאת בשלב {STAGE_HE.get(stage, stage)} בשווי {amount}. " if he else f"{name} is in {stage.title()} at {amount}. ") + (
            (f"יש {len(notes)} הערות ו-{len(tasks)} משימות פתוחות." if he else f"There {'is' if len(notes) == 1 else 'are'} {len(notes)} note{'' if len(notes) == 1 else 's'} and {len(tasks)} open task{'' if len(tasks) == 1 else 's'}.")
        )
    else:
        reasons = [r.get("reason") for r in ctx.get("score_reasons", []) if isinstance(r, dict)][:2]
        summary = (f"{name}: ציון {rec.get('score', '-')}. " if he else f"{name} scores {rec.get('score', '-')}. ") + ("; ".join(reasons) if reasons else "")
    risks = [_issue(i, he)[0] for i in issues][:3]
    actions = [NextAction(title=_issue(i, he)[1], why=_issue(i, he)[0], due_in_days=1 if i.get("penalty", 0) >= 25 else 3) for i in issues[:3]]
    if not actions:
        actions = [NextAction(title=("לקבוע את הצעד הבא עם " if he else "Agree the next step with ") + name, why=("אין משימה פתוחה" if he else "Keeps momentum"), due_in_days=2)]
    contact = rec.get("contact_name") or rec.get("first_name") or ""
    email = EmailDraft(
        subject=(f"{name}: המשך" if he else f"{name}: next steps"),
        body=(f"היי {contact},\n\nרציתי לוודא שיש לנו צעד הבא ברור. מתי נוח לך לשיחה קצרה השבוע?\n\nתודה," if he
              else f"Hi {contact or 'there'},\n\nI wanted to make sure we have a clear next step. Would a short call this week work for you?\n\nThanks,"),
    ) if stage not in ("WON", "LOST") else None
    return RecordInsight(summary=summary.strip(), momentum=momentum, risks=risks, next_actions=actions, email_draft=email)


def _briefing(content: str):
    from .ai import Briefing, FocusItem

    he = "Write in Hebrew" in content
    ctx = _json_after("CRM snapshot:\n", content)
    k = ctx.get("kpis", {})
    focus: list[FocusItem] = []
    for d in ctx.get("deals_at_risk", [])[:2]:
        if d.get("issues"):
            msg, act = _issue(d["issues"][0], he)
            focus.append(FocusItem(title=f"{d['name']}: {act}", why=f"{msg} · ₪{d['amount']:,.0f}", record_type="deal", record_id=d["id"]))
    for lead in ctx.get("hot_leads", [])[:2]:
        why = ", ".join(w for w in lead.get("why", []) if w) if not he else ""
        focus.append(FocusItem(title=(f"להתקשר ל-{lead['name']} ({lead['company']})" if he else f"Call {lead['name']} ({lead['company']})"),
                               why=f"{'ציון' if he else 'score'} {lead['score']}" + (f" · {why}" if why else ""), record_type="lead", record_id=lead["id"]))
    for t in ctx.get("overdue_tasks", [])[:1]:
        focus.append(FocusItem(title=(f"לסגור משימה באיחור: {t['title']}" if he else f"Clear overdue task: {t['title']}"),
                               why=(f"היה אמור להיות עד {t['due']}" if he else f"was due {t['due']}"), record_type="task", record_id=t["id"]))
    if len(focus) < 3:
        seen = {(f.record_type, f.record_id) for f in focus}
        for d in ctx.get("largest_open_deals", []):
            if ("deal", d["id"]) in seen or len(focus) >= 3:
                continue
            focus.insert(0, FocusItem(title=(f"לקדם את {d['name']} לשלב הבא" if he else f"Push {d['name']} to the next stage"),
                                      why=(f"העסקה הגדולה הפתוחה · ₪{d['amount']:,.0f}" if he else f"Largest open deal · ₪{d['amount']:,.0f} in {d['stage'].title()}"),
                                      record_type="deal", record_id=d["id"]))
    at_risk = len(ctx.get("deals_at_risk", []))
    if he:
        headline = f"צנרת פתוחה של ₪{k.get('open_pipeline', 0):,.0f} ב-{k.get('open_deals', 0)} עסקאות, {at_risk} מהן צריכות תשומת לב היום."
        note = f"תחזית משוקללת ₪{k.get('weighted_forecast', 0):,.0f}, אחוז זכייה {k.get('win_rate', 0)}%, מחזור מכירה ממוצע {k.get('avg_cycle_days', 0)} ימים."
        watch = [f"{k.get('overdue_tasks', 0)} משימות באיחור"] if k.get("overdue_tasks") else []
    else:
        headline = f"₪{k.get('open_pipeline', 0):,.0f} open across {k.get('open_deals', 0)} deals; {at_risk} need attention today."
        note = f"Weighted forecast ₪{k.get('weighted_forecast', 0):,.0f}, win rate {k.get('win_rate', 0)}%, average cycle {k.get('avg_cycle_days', 0)} days."
        watch = [f"{k.get('overdue_tasks', 0)} overdue tasks are piling up"] if k.get("overdue_tasks") else []
    return Briefing(headline=headline, focus=focus[:5], pipeline_note=note, watch_out=watch)


def _automation(content: str):
    from .ai import AutomationDraft, DraftAction, DraftCondition

    low = content.lower()
    obj = "lead" if ("lead" in low or "ליד" in low) else "deal"
    created = any(w in low for w in ("new ", "created", "comes in", "חדש", "נכנס"))
    trigger = f"{obj}.{'created' if created else 'updated'}"
    conds: list = []
    st = _stage(content)
    if st and obj == "deal" and not created:
        conds.append(DraftCondition(field="stage", op="changed_to", value=st))
    amt = _amount(content)
    if amt and obj == "deal":
        conds.append(DraftCondition(field="amount_micros", op="gte", value=str(amt * 1_000_000)))
    score = re.search(r"(?:score|ציון)\D{0,12}(\d{2})", low)
    if score and obj == "lead":
        conds.append(DraftCondition(field="score", op="gte", value=score.group(1)))
    days = re.search(r"(\d+)\s*(?:day|days|ימים|יום)", low)
    due = float(days.group(1)) if days else 1.0
    actions = []
    if any(w in low for w in ("ai", "brief", "summar", "analy", "סיכום", "תדריך", "נתח")):
        actions.append(DraftAction(type="ai_agent", title=None, body=None, due_in_days=None, url=None, values=None,
                                   instructions="Write a short brief on {{record.display_name}} as a note: context, risks, recommended next step."))
    if any(w in low for w in ("webhook", "slack", "notify", "התראה")):
        actions.append(DraftAction(type="webhook", title=None, body=None, due_in_days=None, url="https://hooks.example.com/kesher", values=None, instructions=None))
    if not actions or any(w in low for w in ("task", "call", "follow", "משימה", "להתקשר", "מעקב")):
        actions.append(DraftAction(type="create_task", title="Follow up: {{record.display_name}}", body=None, due_in_days=due, url=None, values=None, instructions=None))
    label = {"ai_agent": "AI brief", "create_task": "task", "webhook": "webhook"}
    when = f"New {obj}" if created else (f"{obj.title()} → {st.title()}" if st else f"{obj.title()} updated")
    name = f"{when}: " + " + ".join(label[a.type] for a in actions)
    explanation = f"When a {obj} is {'created' if created else 'updated'}" + (f" and matches {len(conds)} condition(s)" if conds else "") + ", run: " + ", ".join(a.type for a in actions) + "."
    return AutomationDraft(name=name, trigger_event=trigger, conditions=conds, actions=actions, explanation=explanation)


class _Messages:
    def create(self, **kw: Any) -> SimpleNamespace:
        from .ai import AGENT_STEP_SYSTEM

        if kw.get("system") == AGENT_STEP_SYSTEM:
            return _ai_step(kw["messages"])
        return _copilot(kw["messages"])

    def parse(self, **kw: Any) -> SimpleNamespace:
        from .ai import AutomationDraft, Briefing, RecordInsight

        content = kw["messages"][-1]["content"]
        fmt = kw["output_format"]
        if fmt is RecordInsight:
            out = _insight(content)
        elif fmt is Briefing:
            out = _briefing(content)
        elif fmt is AutomationDraft:
            out = _automation(content)
        else:  # pragma: no cover
            raise ValueError(fmt)
        return SimpleNamespace(parsed_output=out, stop_reason="end_turn", stop_details=None, content=[])


class DemoClient:
    def __init__(self) -> None:
        self.beta = SimpleNamespace(messages=_Messages())
