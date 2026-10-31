import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmtDate, money, PLURAL, type RecordType } from "../api";
import RecordForm from "../components/RecordForm";
import AIInsightCard from "../components/AIInsightCard";
import Timeline from "../components/Timeline";
import { FieldValue, GradeBadge, Modal, Skeleton, StageBadge, confirmDialog } from "../components/ui";
import { FIELDS, LABELS, STAGES } from "../fields";
import { useStore } from "../store";
import { t, t as tr, tIssue, tReason, tv } from "../i18n";

export default function RecordDetail({ type }: { type: RecordType }) {
  const id = Number(useParams().id);
  const [rec, setRec] = useState<any>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<"task" | "note" | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const { openCopilot } = useStore();

  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("kesher:changed", h);
    return () => window.removeEventListener("kesher:changed", h);
  }, []);

  const reload = () => { setTick((t) => t + 1); };
  useEffect(() => {
    api(`/${PLURAL[type]}/${id}`).then(setRec).catch((e) => setError(e.message));
  }, [type, id, tick]);

  if (error) return <div className="page"><div className="error" role="alert">{error}</div></div>;
  if (!rec) return <div className="page"><Skeleton lines={8} /></div>;
  const related = rec.related ?? {};

  async function setStage(stage: string) {
    await api(`/deals/${id}`, { method: "PATCH", body: { stage } });
    reload();
  }
  async function remove() {
    if (!(await confirmDialog(t("Delete {x}?", { x: rec.display_name })))) return;
    await api(`/${PLURAL[type]}/${id}`, { method: "DELETE" });
    nav(`/${PLURAL[type]}`);
  }
  async function toggleTask(t: any) {
    await api(`/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "DONE" ? "TODO" : "DONE" } });
    reload();
  }

  return (
    <div className="page">
      <div className="crumbs"><Link to={`/${PLURAL[type]}`}>{t(LABELS[type][1])}</Link> / {rec.display_name}</div>
      <div className="row-between">
        <h1>
          {rec.display_name}{" "}
          {type === "deal" && <StageBadge stage={rec.stage} />}
          {type === "lead" && <GradeBadge grade={rec.grade} score={rec.score} />}
        </h1>
        <div className="row">
          {type === "lead" && rec.status !== "converted" && <button className="primary" onClick={() => setConverting(true)}>{t("Convert lead")}</button>}
          {type !== "task" && type !== "note" && <button className="ai-btn" onClick={() => openCopilot({ type, id, name: rec.display_name })}>{t("✦ Ask Copilot")}</button>}
          <button onClick={() => setEditing(true)}>{t("Edit")}</button>
          <button className="danger" onClick={remove}>{t("Delete")}</button>
        </div>
      </div>

      {type === "deal" && (
        <div className="stage-steps" role="group" aria-label={t("Stage")}>
          {STAGES.map((s) => (
            <button key={s} aria-pressed={s === rec.stage} className={`step ${s === rec.stage ? "active" : ""} ${STAGES.indexOf(s) < STAGES.indexOf(rec.stage) && rec.stage !== "LOST" ? "past" : ""}`} onClick={() => setStage(s)}>
              {tv(s)}
            </button>
          ))}
        </div>
      )}

      <div className="detail">
        <div className="col-main">
          <section className="card">
            <dl className="fields">
              {FIELDS[type].map((f) => (
                <div key={f.key}><dt>{t(f.label)}</dt><dd><FieldValue field={f} record={rec} /></dd></div>
              ))}
              {type === "deal" && <div><dt>{t("Win probability")}</dt><dd>{rec.win_probability}%</dd></div>}
              {(type === "task" || type === "note") && (
                <div><dt>{t("Linked to")}</dt><dd>{rec.targets.length ? rec.targets.map((t: any) => <Link key={`${t.type}${t.id}`} className="chip" to={`/${t.type}/${t.id}`}>{t.name}</Link>) : "—"}</dd></div>
              )}
              <div><dt>{t("Created")}</dt><dd>{fmtDate(rec.created_at)} <span className="muted small">{t("via")} {rec.created_by_source}</span></dd></div>
            </dl>
          </section>

          {["company", "contact", "lead", "deal"].includes(type) && <AIInsightCard type={type} id={id} onChanged={reload} />}

          {type === "deal" && rec.health && rec.health.status !== "closed" && (
            <section className="card">
              <h3>{t("Deal health")} <span className={`health h-${rec.health.status}`}>{rec.health.score}</span></h3>
              {rec.health.issues.length === 0 ? <div className="muted">{t("On track — nothing to fix.")}</div> : (
                <ul className="issues">{rec.health.issues.map((i: any) => <li key={i.code}><b>{tIssue(i).message}</b> <span className="muted">→ {tIssue(i).action}</span></li>)}</ul>
              )}
            </section>
          )}

          {type === "lead" && (
            <section className="card">
              <h3>{t("Why this score?")}</h3>
              <ul className="reasons">{rec.score_reasons.map((r: any, i: number) => <li key={i}><span className="pts">+{r.points}</span> {tReason(r.reason)}</li>)}</ul>
              {rec.status === "converted" && (
                <p className="muted">{t("Converted →")} {rec.converted_contact_id && <Link to={`/contact/${rec.converted_contact_id}`}>{t("contact")}</Link>}
                  {rec.converted_deal_id && <> · <Link to={`/deal/${rec.converted_deal_id}`}>{t("deal")}</Link></>}
                  {rec.converted_company_id && <> · <Link to={`/company/${rec.converted_company_id}`}>{t("company")}</Link></>}</p>
              )}
            </section>
          )}

          {related.contacts && (
            <section className="card"><h3>{t("People")} ({related.contacts.length})</h3>
              <ul className="links">{related.contacts.map((c: any) => <li key={c.id}><Link to={`/contact/${c.id}`}>{c.display_name}</Link> <span className="muted small">{c.job_title}</span></li>)}</ul>
            </section>
          )}
          {related.deals && (
            <section className="card"><h3>{t("Deals")} ({related.deals.length})</h3>
              <ul className="links">{related.deals.map((d: any) => <li key={d.id}><Link to={`/deal/${d.id}`}>{d.name}</Link> <StageBadge stage={d.stage} /> <span className="muted small">{money(d.amount_micros)}</span></li>)}</ul>
            </section>
          )}
          {related.tasks && (
            <section className="card">
              <div className="row-between"><h3>{t("Tasks")}</h3><button className="ghost" onClick={() => setAdding("task")}>{t("+ Task")}</button></div>
              <ul className="links">
                {related.tasks.map((t: any) => (
                  <li key={t.id} className={t.status === "DONE" ? "done" : ""}>
                    <input type="checkbox" aria-label={t.title} checked={t.status === "DONE"} onChange={() => toggleTask(t)} /> <Link to={`/task/${t.id}`}>{t.title}</Link>
                    <span className="muted small"> · {tr("due")} {fmtDate(t.due_at)}</span>{t.created_by_source === "automation" && <span className="badge tone-violet">⚡</span>}
                  </li>
                ))}
                {related.tasks.length === 0 && <li className="muted">{t("No tasks")}</li>}
              </ul>
            </section>
          )}
          {related.notes && (
            <section className="card">
              <div className="row-between"><h3>{t("Notes")}</h3><button className="ghost" onClick={() => setAdding("note")}>{t("+ Note")}</button></div>
              {related.notes.map((n: any) => <div key={n.id} className="note"><b>{n.title}</b><p>{n.body}</p></div>)}
              {related.notes.length === 0 && <div className="muted">{t("No notes")}</div>}
            </section>
          )}
        </div>
        <aside className="card col-side">
          <h3>{t("Timeline")}</h3>
          <Timeline type={type} id={id} refreshKey={tick} />
        </aside>
      </div>

      {editing && <RecordForm type={type} record={rec} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {adding && <RecordForm type={adding} targets={[{ type, id }]} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); reload(); }} />}
      {converting && <ConvertDialog lead={rec} onClose={() => setConverting(false)} onDone={(r) => nav(r.deal ? `/deal/${r.deal.id}` : `/contact/${r.contact.id}`)} />}
    </div>
  );
}

function ConvertDialog({ lead, onClose, onDone }: { lead: any; onClose: () => void; onDone: (r: any) => void }) {
  const [createDeal, setCreateDeal] = useState(true);
  const [name, setName] = useState(`${lead.company_name ?? lead.display_name} – new deal`);
  const [amount, setAmount] = useState(String((lead.budget_micros ?? 0) / 1e6));
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    try {
      onDone(await api(`/leads/${lead.id}/convert`, { body: { create_deal: createDeal, deal_name: name, amount: Number(amount) } }));
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Modal title={t("Convert lead")} onClose={onClose}>
      <p className="muted">{t("Creates the company (or reuses it) and contact, and moves the lead's notes and tasks over.")} <b>{lead.company_name}</b> · <b>{lead.display_name}</b></p>
      <label className="check"><input type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} /> {t("Also create a deal")}</label>
      {createDeal && (
        <div className="form">
          <label><span>{t("Deal name")}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label><span>{t("Amount (₪)")}</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        </div>
      )}
      {err && <div className="error" role="alert">{err}</div>}
      <div className="actions"><button className="ghost" onClick={onClose}>{t("Cancel")}</button><button className="primary" onClick={go}>{t("Convert")}</button></div>
    </Modal>
  );
}
