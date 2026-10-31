import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowsLeftRight, CaretRight, ChatCircleText, CheckCircle, PencilSimple, Plus, Trash, Warning } from "@phosphor-icons/react";
import { api, fmtDate, money, PLURAL, type RecordType } from "../api";
import RecordForm from "../components/RecordForm";
import Readout from "../components/Readout";
import Timeline from "../components/Timeline";
import { FieldValue, Grade, Modal, Skeleton, Stage, confirmDialog } from "../components/ui";
import { FIELDS, LABELS, STAGES } from "../fields";
import { useStore } from "../store";
import { t, tIssue, tReason, tv } from "../i18n";

const SOURCE: Record<string, string> = { manual: "by hand", ai: "via assistant", automation: "via rule", import: "via import" };

export default function RecordDetail({ type }: { type: RecordType }) {
  const id = Number(useParams().id);
  const [rec, setRec] = useState<any>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<"task" | "note" | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const { openAssistant } = useStore();

  useEffect(() => {
    const h = () => setTick((n) => n + 1);
    window.addEventListener("kesher:changed", h);
    return () => window.removeEventListener("kesher:changed", h);
  }, []);

  const reload = () => setTick((n) => n + 1);
  useEffect(() => {
    setError(null);
    api(`/${PLURAL[type]}/${id}`).then(setRec).catch((e) => setError(e.status === 404 ? "missing" : e.message));
  }, [type, id, tick]);

  if (error === "missing") return (
    <div className="page"><div className="empty"><b>{t("This record was deleted or never existed.")}</b><Link to={`/${PLURAL[type]}`}>{t("Back to {x}", { x: t(LABELS[type][1]).toLowerCase() })}</Link></div></div>
  );
  if (error) return <div className="page"><div className="error" role="alert">{t("Couldn't load this record: {e}", { e: error })}</div><button onClick={reload}>{t("Try again")}</button></div>;
  if (!rec) return <div className="page"><Skeleton lines={8} /></div>;
  const related = rec.related ?? {};

  async function setStage(stage: string) {
    await api(`/deals/${id}`, { method: "PATCH", body: { stage } });
    reload();
  }
  async function remove() {
    if (!(await confirmDialog(t("Delete {x}?", { x: rec.display_name }), t("Delete {x}", { x: t(LABELS[type][0]).toLowerCase() })))) return;
    await api(`/${PLURAL[type]}/${id}`, { method: "DELETE" });
    nav(`/${PLURAL[type]}`);
  }
  async function toggleTask(task: any) {
    await api(`/tasks/${task.id}`, { method: "PATCH", body: { status: task.status === "DONE" ? "TODO" : "DONE" } });
    reload();
  }

  return (
    <div className="page">
      <nav className="crumbs" aria-label={t("Breadcrumb")}><Link to={`/${PLURAL[type]}`}>{t(LABELS[type][1])}</Link><CaretRight className="flip" aria-hidden="true" /><span aria-current="page">{rec.display_name}</span></nav>
      <div className="page-head">
        <div className="title-row">
          <h1>{rec.display_name}</h1>
          {type === "deal" && <Stage stage={rec.stage} />}
          {type === "lead" && <Grade grade={rec.grade} score={rec.score} />}
        </div>
        <div className="row">
          {type === "lead" && rec.status !== "converted" && <button className="primary" onClick={() => setConverting(true)}><ArrowsLeftRight aria-hidden="true" />{t("Convert lead")}</button>}
          {type !== "task" && type !== "note" && <button onClick={() => openAssistant({ type, id, name: rec.display_name })}><ChatCircleText aria-hidden="true" />{t("Ask the assistant")}</button>}
          <button className="ghost" onClick={() => setEditing(true)}><PencilSimple aria-hidden="true" />{t("Edit")}</button>
          <button className="ghost icon danger" aria-label={t("Delete")} title={t("Delete")} onClick={remove}><Trash aria-hidden="true" /></button>
        </div>
      </div>

      {type === "deal" && (
        <div className="stage-steps" role="group" aria-label={t("Move to stage")}>
          {STAGES.map((s) => (
            <button key={s} aria-pressed={s === rec.stage} className={`step ${s === rec.stage ? "active" : ""} ${s === "LOST" ? "lost" : ""} ${STAGES.indexOf(s) < STAGES.indexOf(rec.stage) && rec.stage !== "LOST" ? "past" : ""}`} onClick={() => setStage(s)}>
              {tv(s)}
            </button>
          ))}
        </div>
      )}

      <div className="detail">
        <div className="col-main">
          <dl className="fields">
            {FIELDS[type].filter((f) => f.key !== "name" && f.key !== "title").map((f) => (
              <div key={f.key} className={f.kind === "textarea" ? "span-all" : ""}><dt>{t(f.label)}</dt><dd><FieldValue field={f} record={rec} /></dd></div>
            ))}
            {type === "deal" && <div><dt>{t("Win probability")}</dt><dd className="fig">{rec.win_probability}%</dd></div>}
            {(type === "task" || type === "note") && (
              <div><dt>{t("Linked to")}</dt><dd>{rec.targets.length ? rec.targets.map((x: any) => <Link key={`${x.type}${x.id}`} className="chip" to={`/${x.type}/${x.id}`}>{x.name}</Link>) : <span className="unset">-</span>}</dd></div>
            )}
            <div><dt>{t("Created")}</dt><dd><span className="tnum">{fmtDate(rec.created_at)}</span> <span className="faint small">{t(SOURCE[rec.created_by_source] ?? "by hand")}</span></dd></div>
          </dl>

          {["company", "contact", "lead", "deal"].includes(type) && <Readout type={type} id={id} onChanged={reload} />}

          {type === "deal" && rec.health && rec.health.status !== "closed" && (
            <section className="section" aria-labelledby="health-title">
              <div className="section-head"><h2 id="health-title">{t("Deal health")}</h2><span className={`health h-${rec.health.status}`}>{t("{n} of 100", { n: rec.health.score })}</span></div>
              {rec.health.issues.length === 0 ? <p className="ok-line"><CheckCircle aria-hidden="true" />{t("Recent contact, a named buyer and a next step. Nothing to fix.")}</p> : (
                <ul className="issues">{rec.health.issues.map((i: any) => <li key={i.code}><Warning aria-hidden="true" /><b>{tIssue(i).message}</b><span className="act">{tIssue(i).action}</span></li>)}</ul>
              )}
            </section>
          )}

          {type === "lead" && (
            <section className="section" aria-labelledby="score-title">
              <div className="section-head"><h2 id="score-title">{t("How the score adds up")}</h2><span className="fig faint">{rec.score} / 100</span></div>
              <ul className="reasons">{rec.score_reasons.map((r: any, i: number) => <li key={i}><span className="fig">+{r.points}</span>{tReason(r.reason)}</li>)}</ul>
              {rec.status === "converted" && (
                <p className="soft" style={{ marginBlockStart: "var(--s3)" }}>{t("Converted into")}{" "}
                  {rec.converted_contact_id && <Link to={`/contact/${rec.converted_contact_id}`}>{t("contact")}</Link>}
                  {rec.converted_deal_id && <> · <Link to={`/deal/${rec.converted_deal_id}`}>{t("deal")}</Link></>}
                  {rec.converted_company_id && <> · <Link to={`/company/${rec.converted_company_id}`}>{t("company")}</Link></>}</p>
              )}
            </section>
          )}

          {related.contacts && (
            <section className="section" aria-labelledby="people-title">
              <div className="section-head"><h2 id="people-title">{t("People")}</h2><span className="fig faint">{related.contacts.length}</span></div>
              {related.contacts.length === 0 ? <p className="empty-line">{t("No people linked yet.")}</p> : (
                <ul className="list">{related.contacts.map((c: any) => <li key={c.id} className="line1"><Link to={`/contact/${c.id}`}>{c.display_name}</Link><span className="soft">{c.job_title}</span></li>)}</ul>
              )}
            </section>
          )}
          {related.deals && (
            <section className="section" aria-labelledby="deals-title">
              <div className="section-head"><h2 id="deals-title">{t("Deals")}</h2><span className="fig faint">{related.deals.length}</span></div>
              {related.deals.length === 0 ? <p className="empty-line">{t("No deals yet.")}</p> : (
                <table className="plain"><tbody>{related.deals.map((d: any) => (
                  <tr key={d.id}><td><Link to={`/deal/${d.id}`}>{d.name}</Link></td><td><Stage stage={d.stage} /></td><td className="num fig">{money(d.amount_micros)}</td></tr>
                ))}</tbody></table>
              )}
            </section>
          )}
          {related.tasks && (
            <section className="section" aria-labelledby="tasks-title">
              <div className="section-head"><h2 id="tasks-title">{t("Tasks")}</h2><button className="ghost small" onClick={() => setAdding("task")}><Plus aria-hidden="true" />{t("Add task")}</button></div>
              {related.tasks.length === 0 ? <p className="empty-line">{t("No open tasks. Add one, or take a next step from the assistant's read.")}</p> : (
                <ul className="list">
                  {related.tasks.map((task: any) => (
                    <li key={task.id} className={`task-row ${task.status === "DONE" ? "done" : ""}`}>
                      <input type="checkbox" aria-label={t("Mark “{x}” done", { x: task.title })} checked={task.status === "DONE"} onChange={() => toggleTask(task)} />
                      <Link to={`/task/${task.id}`}>{task.title}</Link>
                      {task.created_by_source === "automation" && <span className="via">{t("via rule")}</span>}
                      {task.created_by_source === "ai" && <span className="via" style={{ color: "var(--accent)" }}>{t("via assistant")}</span>}
                      <span className="faint tnum">{fmtDate(task.due_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {related.notes && (
            <section className="section" aria-labelledby="notes-title">
              <div className="section-head"><h2 id="notes-title">{t("Notes")}</h2><button className="ghost small" onClick={() => setAdding("note")}><Plus aria-hidden="true" />{t("Add note")}</button></div>
              {related.notes.length === 0 ? <p className="empty-line">{t("No notes yet. Paste a call into the assistant and it will propose one.")}</p> : (
                <div className="notes">{related.notes.map((n: any) => <div key={n.id}><b>{n.title}</b><p>{n.body}</p></div>)}</div>
              )}
            </section>
          )}
        </div>
        <aside className="col-side" aria-labelledby="tl-title">
          <div className="section-head"><h2 id="tl-title">{t("Timeline")}</h2></div>
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
  const [name, setName] = useState(`${lead.company_name ?? lead.display_name}, new deal`);
  const [amount, setAmount] = useState(String((lead.budget_micros ?? 0) / 1e6));
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    try {
      onDone(await api(`/leads/${lead.id}/convert`, { body: { create_deal: createDeal, deal_name: name, amount: Number(amount) } }));
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Modal title={t("Convert {x}", { x: lead.display_name })} onClose={onClose}>
      <p className="soft">{t("Creates the company (or reuses it) and the contact, and moves the lead's notes and tasks over.")}</p>
      <label className="check"><input type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} /> {t("Also open a deal")}</label>
      {createDeal && (
        <div className="form">
          <label><span>{t("Deal name")}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label><span>{t("Amount (₪)")}</span><input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        </div>
      )}
      {err && <div className="error" role="alert">{err}</div>}
      <div className="actions"><button className="ghost" onClick={onClose}>{t("Cancel")}</button><button className="primary" onClick={go}>{t("Convert lead")}</button></div>
    </Modal>
  );
}
