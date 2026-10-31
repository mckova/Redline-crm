"""Demo mode: the offline stand-in drives the real agent loop, structured outputs and background jobs."""
import pytest

from app import ai


@pytest.fixture()
def demo(monkeypatch):
    monkeypatch.setenv("REDLINE_AI", "demo")
    yield


def mk(client, plural, **values):
    r = client.post(f"/api/{plural}", json=values)
    assert r.status_code == 201, r.text
    return r.json()


def test_auto_mode_without_key_is_demo(monkeypatch):
    monkeypatch.setenv("REDLINE_AI", "auto")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    assert ai.ai_mode() == "demo"
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    assert ai.ai_mode() == "live"
    monkeypatch.setenv("REDLINE_AI", "off")
    assert ai.ai_mode() == "off"


def test_status_reports_demo(client, demo):
    s = client.get("/api/ai/status").json()
    assert s["enabled"] and s["mode"] == "demo" and "demo" in s["model"]


def test_demo_copilot_turns_notes_into_approved_changes(client, demo):
    deal = mk(client, "deals", name="Orion pilot", amount_micros=60_000_000_000, stage="QUALIFIED")
    t = client.post("/api/ai/threads", json={"target_type": "deal", "target_id": deal["id"]}).json()
    out = client.post(f"/api/ai/threads/{t['id']}/messages", json={"text": "Call with Dana: sent the proposal at 75K, decision next week"}).json()
    names = [p["name"] for p in out["pending"]]
    assert names == ["update_record", "add_note", "create_task"]
    upd = out["pending"][0]["input"]["fields"]
    assert {"field": "stage", "value": "PROPOSAL"} in upd and {"field": "amount", "value": "75000"} in upd
    waiting = client.get("/api/ai/pending").json()
    assert len(waiting) == 1 and waiting[0]["target"] == {"type": "deal", "id": deal["id"]}
    assert waiting[0]["said"].startswith("Call with Dana") and len(waiting[0]["items"]) == 3
    out = client.post(f"/api/ai/threads/{t['id']}/resolve", json={"decisions": {p["tool_use_id"]: True for p in out["pending"]}}).json()
    assert out["pending"] == [] and out["display"][-1]["text"].startswith("3 changes applied")
    d = client.get(f"/api/deals/{deal['id']}").json()
    assert d["stage"] == "PROPOSAL" and d["amount_micros"] == 75_000_000_000
    assert client.get("/api/ai/pending").json() == []


def test_demo_copilot_reads_close_date_and_next_step(client, demo):
    deal = mk(client, "deals", name="Fleet pilot", amount_micros=180_000_000_000, stage="QUALIFIED")
    t = client.post("/api/ai/threads", json={"target_type": "deal", "target_id": deal["id"]}).json()
    out = client.post(f"/api/ai/threads/{t['id']}/messages", json={"text": "Call with Adi: budget approved at 240K. She wants the proposal by Thursday and will decide by Dec 12."}).json()
    upd = out["pending"][0]["input"]["fields"]
    assert {"field": "amount", "value": "240000"} in upd
    assert any(f["field"] == "close_date" and f["value"].endswith("-12-12") for f in upd)
    task = out["pending"][-1]["input"]
    assert task["title"] == "Send the proposal" and 1 <= task["due_in_days"] <= 7
    # take the amount and close date, leave the stage as it is
    upd_id = out["pending"][0]["tool_use_id"]
    decisions = {p["tool_use_id"]: True for p in out["pending"]} | {f"{upd_id}:amount": True, f"{upd_id}:close_date": True, f"{upd_id}:stage": False}
    client.post(f"/api/ai/threads/{t['id']}/resolve", json={"decisions": decisions})
    d = client.get(f"/api/deals/{deal['id']}").json()
    assert d["close_date"][5:10] == "12-12" and d["amount_micros"] == 240_000_000_000 and d["stage"] == "QUALIFIED"


def test_demo_copilot_answers_in_hebrew(client, demo):
    mk(client, "deals", name="Negev expansion", amount_micros=10_000_000_000, stage="NEW")
    t = client.post("/api/ai/threads", json={}).json()
    out = client.post(f"/api/ai/threads/{t['id']}/messages", json={"text": "מה המצב בצנרת היום?"}).json()
    assert "צנרת פתוחה" in out["display"][-1]["text"]


def test_demo_insight_briefing_and_rule_draft(client, demo):
    deal = mk(client, "deals", name="Yam rollout", amount_micros=90_000_000_000, stage="PROPOSAL")
    ins = client.post(f"/api/ai/insights/deal/{deal['id']}").json()
    assert ins["momentum"] in ("steady", "stalling", "at_risk", "accelerating") and ins["next_actions"]
    he = client.post(f"/api/ai/insights/deal/{deal['id']}?lang=he").json()
    assert "בשלב" in he["summary"]
    b = client.post("/api/ai/briefing").json()
    assert b["headline"] and any(f["record_id"] == deal["id"] for f in b["focus"])
    assert client.get("/api/ai/briefing").json()["id"] == b["id"]
    assert client.get("/api/ai/briefing?lang=he").json() is None  # an English memo is not shown to a Hebrew reader
    hb = client.post("/api/ai/briefing?lang=he").json()
    assert client.get("/api/ai/briefing?lang=he").json()["id"] == hb["id"] and client.get("/api/ai/briefing").json()["id"] == b["id"]
    d = client.post("/api/ai/automation-draft", json={"prompt": "When a deal moves to negotiation, have AI write a brief and create a call task in 2 days"}).json()
    assert d["trigger_event"] == "deal.updated"
    assert d["conditions"][0] == {"field": "stage", "op": "changed_to", "value": "NEGOTIATION"}
    assert [a["type"] for a in d["actions"]] == ["ai_agent", "create_task"]


def test_new_lead_gets_background_insight(client, demo):
    from app import db as dbmod

    lead = mk(client, "leads", first_name="Noa", company_name="Ella Bakery", source="referral")
    jobs = client.get("/api/ai/jobs").json()
    assert jobs[0]["kind"] == "insight" and jobs[0]["record"] == {"type": "lead", "id": lead["id"]}
    assert ai.process_pending_jobs(dbmod.SessionLocal) == 1
    assert client.get("/api/ai/jobs").json()[0]["status"] == "done"
    assert client.get(f"/api/ai/insights/lead/{lead['id']}").json()["summary"]
