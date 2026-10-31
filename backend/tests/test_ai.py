"""AI layer tests with a scripted fake Claude client (no network, deterministic)."""
import copy
from types import SimpleNamespace

import pytest

from app import ai


class Block(SimpleNamespace):
    def model_dump(self, mode="json", exclude_none=True):
        return {k: v for k, v in vars(self).items() if v is not None}


def text(t):
    return Block(type="text", text=t)


def tool(id_, name, **inp):
    return Block(type="tool_use", id=id_, name=name, input=inp)


def msg(*blocks, stop="end_turn"):
    return SimpleNamespace(content=list(blocks), stop_reason=stop, stop_details=None)


class FakeClient:
    def __init__(self, script=(), parsed=None):
        self.script, self.parsed, self.calls = list(script), parsed, []
        outer = self

        class _Msgs:
            def create(self, **kw):
                outer.calls.append(copy.deepcopy(kw))
                return outer.script.pop(0)

            def parse(self, **kw):
                outer.calls.append(kw)
                return SimpleNamespace(parsed_output=outer.parsed, stop_reason="end_turn", stop_details=None, content=[])

        self.beta = SimpleNamespace(messages=_Msgs())


@pytest.fixture()
def fake(monkeypatch):
    def install(**kw):
        c = FakeClient(**kw)
        ai.set_client(c)
        return c

    yield install
    ai.set_client(None)


def mk(client, plural, **values):
    r = client.post(f"/api/{plural}", json=values)
    assert r.status_code == 201, r.text
    return r.json()


def test_ai_disabled_returns_503(client):
    assert client.get("/api/ai/status").json()["enabled"] is False
    t = client.post("/api/ai/threads", json={}).json()
    r = client.post(f"/api/ai/threads/{t['id']}/messages", json={"text": "hi"})
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_copilot_reads_then_pauses_for_approval(client, fake):
    deal = mk(client, "deals", name="Orion pilot", amount_micros=60_000_000_000, stage="QUALIFIED")
    c = fake(script=[
        msg(tool("t1", "search_records", query="Orion"), stop="tool_use"),
        msg(text("Moving it to proposal."),
            tool("t2", "update_record", record_type="deal", record_id=deal["id"], fields=[{"field": "stage", "value": "PROPOSAL"}, {"field": "amount", "value": "75000"}]),
            tool("t3", "create_task", title="Send proposal", details=None, due_in_days=2, links=[{"type": "deal", "id": deal["id"]}]),
            stop="tool_use"),
        msg(text("Done: [Orion pilot](/deal/1) is in Proposal at ₪75,000 with a follow-up task.")),
    ])
    t = client.post("/api/ai/threads", json={"target_type": "deal", "target_id": deal["id"]}).json()
    r = client.post(f"/api/ai/threads/{t['id']}/messages", json={"text": "We sent the proposal for 75K"}).json()

    # request shape: latest model, fallbacks, strict tools, explicit effort
    first = c.calls[0]
    assert first["model"] == "claude-opus-5-5" and first["fallbacks"] == "default"
    assert all(tl["strict"] for tl in first["tools"]) and first["output_config"]["effort"] == "medium"
    assert "opened this conversation from deal" in first["messages"][0]["content"]  # record context attached

    # writes are pending, nothing changed yet
    assert [p["name"] for p in r["pending"]] == ["update_record", "create_task"]
    assert client.get(f"/api/deals/{deal['id']}").json()["stage"] == "QUALIFIED"

    pend = {p["tool_use_id"]: True for p in r["pending"]}
    r = client.post(f"/api/ai/threads/{t['id']}/resolve", json={"decisions": pend}).json()
    d = client.get(f"/api/deals/{deal['id']}").json()
    assert d["stage"] == "PROPOSAL" and d["amount_micros"] == 75_000_000_000
    assert d["related"]["tasks"][0]["title"] == "Send proposal"
    assert r["display"][-1]["text"].startswith("Done")
    # all tool results of the paused turn were returned in ONE user message, read result included
    resumed = c.calls[-1]["messages"][-1]
    assert resumed["role"] == "user" and {b["tool_use_id"] for b in resumed["content"]} == {"t2", "t3"}
    # the timeline shows the change came through the AI
    tl = client.get(f"/api/deals/{deal['id']}/timeline").json()
    assert tl[0]["actor_source"] == "ai" or any(a["actor_source"] == "ai" for a in tl)


def test_copilot_rejection_is_reported_to_model(client, fake):
    deal = mk(client, "deals", name="X")
    c = fake(script=[
        msg(tool("w", "update_record", record_type="deal", record_id=deal["id"], fields=[{"field": "stage", "value": "LOST"}]), stop="tool_use"),
        msg(text("Okay, I left it as is.")),
    ])
    t = client.post("/api/ai/threads", json={}).json()
    client.post(f"/api/ai/threads/{t['id']}/messages", json={"text": "mark it lost"})
    r = client.post(f"/api/ai/threads/{t['id']}/resolve", json={"decisions": {"w": False}}).json()
    assert client.get(f"/api/deals/{deal['id']}").json()["stage"] == "NEW"
    assert "rejected" in c.calls[-1]["messages"][-1]["content"][0]["content"]
    assert r["display"][-2]["items"][0]["status"] == "skipped"


def test_refusal_is_surfaced(client, fake):
    fake(script=[SimpleNamespace(content=[], stop_reason="refusal", stop_details=SimpleNamespace(category="cyber"))])
    t = client.post("/api/ai/threads", json={}).json()
    r = client.post(f"/api/ai/threads/{t['id']}/messages", json={"text": "?"})
    assert r.status_code == 422 and "declined" in r.json()["detail"]


def test_insight_structured_output(client, fake):
    deal = mk(client, "deals", name="Galil expansion", stage="NEGOTIATION")
    parsed = ai.RecordInsight(summary="Late-stage, quiet for 2 weeks.", momentum="stalling", risks=["No contact linked"],
                              next_actions=[ai.NextAction(title="Book a call", why="re-engage", due_in_days=2)],
                              email_draft=ai.EmailDraft(subject="Next steps", body="Hi..."))
    c = fake(parsed=parsed)
    r = client.post(f"/api/ai/insights/deal/{deal['id']}")
    assert r.status_code == 200 and r.json()["momentum"] == "stalling"
    assert c.calls[0]["output_format"] is ai.RecordInsight
    assert client.get(f"/api/ai/insights/deal/{deal['id']}").json()["next_actions"][0]["title"] == "Book a call"


def test_automation_draft_from_plain_language(client, fake):
    parsed = ai.AutomationDraft(
        name="Big deals get a CEO note", trigger_event="deal.created",
        conditions=[ai.DraftCondition(field="amount_micros", op="gte", value="100000000000")],
        actions=[ai.DraftAction(type="ai_agent", title=None, body=None, due_in_days=None, url=None, values=None,
                                instructions="Write a short brief for the CEO as a note")],
        explanation="When a deal of 100K+ is created, the AI writes a CEO brief.")
    fake(parsed=parsed)
    r = client.post("/api/ai/automation-draft", json={"prompt": "כשנפתחת עסקה מעל 100 אלף תכתוב תקציר למנכ\"ל"}).json()
    assert r["valid"] and r["actions"][0] == {"type": "ai_agent", "params": {"instructions": "Write a short brief for the CEO as a note"}}


def test_ai_agent_automation_runs_in_background(client, fake):
    from app import db as dbmod

    client.post("/api/automations", json={
        "name": "AI brief", "trigger_event": "deal.created", "conditions": [],
        "actions": [{"type": "ai_agent", "params": {"instructions": "Brief for {{record.name}}"}}]})
    c = fake(script=[
        msg(tool("n", "add_note", title="CEO brief", body="Mega deal brief", links=[{"type": "deal", "id": 1}]), stop="tool_use"),
        msg(text("Added a brief.")),
    ])
    deal = mk(client, "deals", name="Mega")
    assert c.calls == []  # the save did not wait for the model
    jobs = client.get("/api/ai/jobs").json()
    assert jobs[0]["status"] == "queued" and jobs[0]["instructions"] == "Brief for Mega"
    assert ai.process_pending_jobs(dbmod.SessionLocal) == 1
    job = client.get("/api/ai/jobs").json()[0]
    assert job["status"] == "done" and job["output"]["actions"][0]["tool"] == "add_note"
    assert c.calls[0]["output_config"]["effort"] == "low"
    notes = client.get(f"/api/deals/{deal['id']}").json()["related"]["notes"]
    assert notes[0]["title"] == "CEO brief" and notes[0]["created_by_source"] == "ai"


def test_ai_agent_action_without_key_fails_cleanly(client):
    client.post("/api/automations", json={"name": "x", "trigger_event": "deal.created", "conditions": [],
                                           "actions": [{"type": "ai_agent", "params": {"instructions": "x"}}]})
    mk(client, "deals", name="Y")
    run = client.get("/api/automations/runs").json()[0]
    assert run["status"] == "failed" and "ANTHROPIC_API_KEY" in run["output"][0]["error"]


def test_tool_schemas_are_strict_compatible():
    def walk(s):
        if s.get("type") == "object" or s.get("properties") is not None:
            assert s.get("additionalProperties") is False
            assert set(s["required"]) == set(s["properties"])
            for v in s["properties"].values():
                walk(v)
        if s.get("type") == "array":
            walk(s["items"])
    for t in ai.ALL_TOOLS:
        walk(t["input_schema"])
