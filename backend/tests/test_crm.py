"""End-to-end API tests for the core CRM flows."""
import os


def mk(client, plural, **values):
    r = client.post(f"/api/{plural}", json=values)
    assert r.status_code == 201, r.text
    return r.json()


def test_auth_required():
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as c:
        assert c.get("/api/deals").status_code == 401


def test_crud_and_soft_delete(client):
    co = mk(client, "companies", name="Acme", domain="acme.io")
    assert client.get(f"/api/companies/{co['id']}").json()["name"] == "Acme"
    client.patch(f"/api/companies/{co['id']}", json={"city": "Haifa"})
    assert client.get(f"/api/companies/{co['id']}").json()["city"] == "Haifa"
    assert client.delete(f"/api/companies/{co['id']}").status_code == 204
    assert client.get(f"/api/companies/{co['id']}").status_code == 404
    assert client.get("/api/companies").json()["total"] == 0


def test_timeline_records_field_diff(client):
    deal = mk(client, "deals", name="Big deal", amount_micros=5_000_000_000)
    client.patch(f"/api/deals/{deal['id']}", json={"stage": "QUALIFIED"})
    tl = client.get(f"/api/deals/{deal['id']}/timeline").json()
    assert [a["name"] for a in tl] == ["deal.updated", "deal.created"]
    assert tl[0]["properties"]["diff"]["stage"] == {"before": "NEW", "after": "QUALIFIED"}
    assert tl[0]["actor"] == "Admin"


def test_invalid_stage_rejected(client):
    deal = mk(client, "deals", name="X")
    r = client.patch(f"/api/deals/{deal['id']}", json={"stage": "BOGUS"})
    assert r.status_code == 422


def test_task_fans_out_to_linked_records(client):
    co = mk(client, "companies", name="Acme")
    deal = mk(client, "deals", name="D", company_id=co["id"])
    task = mk(client, "tasks", title="Call", targets=[{"type": "deal", "id": deal["id"]}, {"type": "company", "id": co["id"]}])
    assert {t["type"] for t in task["targets"]} == {"deal", "company"}
    names = [a["name"] for a in client.get(f"/api/companies/{co['id']}/timeline").json()]
    assert "linked-task.created" in names
    detail = client.get(f"/api/deals/{deal['id']}").json()
    assert [t["title"] for t in detail["related"]["tasks"]] == ["Call"]
    listed = client.get(f"/api/tasks?target_type=deal&target_id={deal['id']}").json()
    assert listed["total"] == 1
    row = next(r for r in client.get("/api/deal-rows").json() if r["id"] == deal["id"])
    assert row["company_name"] == "Acme" and row["next_step"]["title"] == "Call" and row["last_touch"]


def test_kanban_move_between_cards(client):
    a = mk(client, "deals", name="A", stage="PROPOSAL")
    b = mk(client, "deals", name="B", stage="PROPOSAL")
    c = mk(client, "deals", name="C", stage="NEW")
    r = client.post(f"/api/deals/{c['id']}/move", json={"stage": "PROPOSAL", "after_id": a["id"], "before_id": b["id"]})
    assert r.status_code == 200
    col = next(col for col in client.get("/api/pipeline").json() if col["stage"] == "PROPOSAL")
    assert [d["name"] for d in col["deals"]] == ["A", "C", "B"]


def test_lead_scoring_is_explainable(client):
    hot = mk(client, "leads", first_name="Dana", email="dana@bigco.com", phone="050", job_title="CEO",
             company_name="BigCo", source="referral", budget_micros=150_000 * 1_000_000)
    cold = mk(client, "leads", first_name="Joe", email="joe@gmail.com", source="cold")
    assert hot["score"] >= 70 and hot["grade"] == "A"
    assert cold["score"] < 30 and cold["grade"] == "D"
    assert any("decision maker" in r["reason"] for r in hot["score_reasons"])
    # rescored automatically on edit
    upd = client.patch(f"/api/leads/{cold['id']}", json={"source": "referral"}).json()
    assert upd["score"] > cold["score"]


def test_lead_conversion(client):
    lead = mk(client, "leads", first_name="Rina", last_name="Katz", email="rina@galil.co.il",
              company_name="Galil", budget_micros=40_000 * 1_000_000)
    note = mk(client, "notes", title="met at expo", targets=[{"type": "lead", "id": lead["id"]}])
    r = client.post(f"/api/leads/{lead['id']}/convert", json={"create_deal": True})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["company"]["name"] == "Galil" and out["company"]["domain"] == "galil.co.il"
    assert out["contact"]["company_id"] == out["company"]["id"]
    assert out["deal"]["amount_micros"] == 40_000 * 1_000_000 and out["deal"]["stage"] == "QUALIFIED"
    assert out["lead"]["status"] == "converted"
    # notes follow the person
    contact_notes = client.get(f"/api/contacts/{out['contact']['id']}").json()["related"]["notes"]
    assert [n["id"] for n in contact_notes] == [note["id"]]
    assert client.post(f"/api/leads/{lead['id']}/convert", json={}).status_code == 409


def test_automation_creates_task_on_stage_change(client):
    rule = client.post("/api/automations", json={
        "name": "follow up",
        "trigger_event": "deal.updated",
        "conditions": [{"field": "stage", "op": "changed_to", "value": "PROPOSAL"}],
        "actions": [{"type": "create_task", "params": {"title": "Follow up {{record.name}}", "due_in_days": 3}}],
    })
    assert rule.status_code == 201, rule.text
    deal = mk(client, "deals", name="Orion")
    client.patch(f"/api/deals/{deal['id']}", json={"amount_micros": 1})  # no stage change → no run
    assert client.get("/api/automations/runs").json() == []
    client.patch(f"/api/deals/{deal['id']}", json={"stage": "PROPOSAL"})
    runs = client.get("/api/automations/runs").json()
    assert len(runs) == 1 and runs[0]["status"] == "success"
    tasks = client.get(f"/api/deals/{deal['id']}").json()["related"]["tasks"]
    assert tasks[0]["title"] == "Follow up Orion" and tasks[0]["created_by_source"] == "automation"
    assert tasks[0]["due_at"] is not None


def test_automation_loop_protection(client):
    # rule that re-triggers itself on every update
    client.post("/api/automations", json={
        "name": "ping-pong", "trigger_event": "deal.updated", "conditions": [],
        "actions": [{"type": "update_record", "params": {"values": {"lost_reason": "x{{record.id}}{{record.lost_reason}}"}}}],
    })
    deal = mk(client, "deals", name="Loop")
    r = client.patch(f"/api/deals/{deal['id']}", json={"stage": "QUALIFIED"})
    assert r.status_code == 200
    assert len(client.get("/api/automations/runs").json()) <= 3


def test_failing_action_is_logged_not_raised(client):
    client.post("/api/automations", json={
        "name": "bad", "trigger_event": "deal.created", "conditions": [],
        "actions": [{"type": "update_record", "params": {"values": {"stage": "NOPE"}}},
                    {"type": "add_note", "params": {"title": "still runs"}}],
    })
    deal = mk(client, "deals", name="Z")
    run = client.get("/api/automations/runs").json()[0]
    assert run["status"] == "failed"
    assert "unknown stage" in run["output"][0]["error"]
    assert client.get(f"/api/deals/{deal['id']}").json()["related"]["notes"][0]["title"] == "still runs"


def test_invalid_rule_rejected(client):
    r = client.post("/api/automations", json={"name": "x", "trigger_event": "deal.exploded", "actions": [{"type": "add_note"}]})
    assert r.status_code == 422


def test_dashboard_and_health(client):
    mk(client, "deals", name="Open", amount_micros=100_000_000_000, stage="PROPOSAL")
    mk(client, "deals", name="Won", amount_micros=50_000_000_000, stage="WON")
    mk(client, "deals", name="Lost", amount_micros=10_000_000_000, stage="LOST")
    k = client.get("/api/dashboard").json()["kpis"]
    assert k["open_pipeline"] == 100_000 and k["weighted_forecast"] == 50_000
    assert k["win_rate"] == 50.0 and k["won_value"] == 50_000
    health = client.get("/api/deals/1").json()["health"]
    codes = {i["code"] for i in health["issues"]}
    assert {"no_contact", "no_next_step"} <= codes


def test_search(client):
    mk(client, "companies", name="Kinneret Solar")
    mk(client, "contacts", first_name="Yael", last_name="Golan")
    res = client.get("/api/search?q=kinn").json()
    assert res == [{"type": "company", "id": 1, "name": "Kinneret Solar"}]


def test_seed_runs_clean(tmp_path):
    from sqlalchemy.orm import sessionmaker

    from app import automations, scoring, timeline  # noqa: F401  (register listeners)
    from app.db import Base, make_engine
    from app.insights import dashboard
    from app.models import AutomationRun, Deal
    from app.seed import seed

    engine = make_engine(os.environ.get("REDLINE_TEST_DATABASE_URL") or f"sqlite:///{tmp_path}/s.db")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        seed(db)
        assert db.query(Deal).count() == 30
        assert db.query(AutomationRun).count() >= 1
        assert dashboard(db)["kpis"]["open_deals"] > 0
