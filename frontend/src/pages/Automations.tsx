import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { ago, api } from "../api";
import { LoadError, Modal, Skeleton, Tag, confirmDialog } from "../components/ui";
import { lang, t, tn, tv } from "../i18n";

type Cond = { field: string; op: string; value?: any };
type Action = { type: string; params: Record<string, any> };
type Rule = { id: number; name: string; enabled: boolean; trigger_event: string; conditions: Cond[]; actions: Action[]; run_count: number; last_run_at: string | null };
type Meta = { triggers: string[]; operators: string[]; actions: string[] };

const OP: Record<string, string> = {
  eq: "is", neq: "is not", gt: "is over", gte: "is at least", lt: "is under", lte: "is at most", contains: "contains",
  changed: "changes", changed_to: "changes to", changed_from: "changes from", is_empty: "is empty", not_empty: "is set",
};
const HE_VERB: Record<string, string> = { created: "נוצר/ה", updated: "מתעדכן/ת", deleted: "נמחק/ת" };
const C = ({ children }: { children: ReactNode }) => <code>{children}</code>;

function describeTrigger(ev: string) {
  const [obj, verb] = ev.split(".");
  return lang === "he" ? `${t(obj.charAt(0).toUpperCase() + obj.slice(1))} ${HE_VERB[verb] ?? verb}` : `a ${obj} is ${verb}`;
}
function describeCond(c: Cond) {
  const noValue = ["is_empty", "not_empty", "changed"].includes(c.op);
  return <><C>{c.field}</C> {t(OP[c.op] ?? c.op)}{!noValue && <> <C>{String(c.value)}</C></>}</>;
}
function describeAction(a: Action) {
  switch (a.type) {
    case "create_task": return <>{t("create the task")} “{a.params.title}”{a.params.due_in_days != null && <>, {tn(a.params.due_in_days, "due tomorrow", "due in {n} days")}</>}</>;
    case "add_note": return <>{t("add the note")} “{a.params.title}”</>;
    case "ai_agent": return <span className="ai">{t("hand it to the assistant")}: {a.params.instructions}</span>;
    case "update_record": return <>{t("set")} {Object.entries(a.params.values ?? {}).map(([k, v], i) => <span key={k}>{i > 0 && ", "}<C>{k}</C> = <C>{String(v)}</C></span>)}</>;
    default: return <>{t("send a webhook to")} <C>{a.params.url}</C></>;
  }
}

export default function Automations() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [nl, setNl] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);

  async function draft() {
    setDrafting(true); setDraftNote(null);
    try {
      const d = await api<any>("/ai/automation-draft", { body: { prompt: nl } });
      setDraftNote(d.explanation + (d.valid ? "" : ` ${t("It needs one fix before saving: {e}", { e: d.error })}`));
      setEditing({ name: d.name, trigger_event: d.trigger_event, conditions: d.conditions, actions: d.actions });
    } catch (e: any) { setDraftNote(t("The assistant couldn't draft that: {e}", { e: e.message })); } finally { setDrafting(false); }
  }

  const load = () => {
    setFailed(false);
    api<Rule[]>("/automations").then(setRules).catch(() => setFailed(true));
    api<any[]>("/automations/runs?limit=30").then(setRuns).catch(() => setRuns([]));
    api<any[]>("/ai/jobs").then(setJobs).catch(() => setJobs([]));
  };
  useEffect(() => { load(); api("/meta").then((m) => setMeta(m.automation)); }, []);

  async function toggle(r: Rule) { await api(`/automations/${r.id}`, { method: "PATCH", body: { enabled: !r.enabled } }); load(); }
  async function remove(r: Rule) { if (await confirmDialog(t("Delete the rule “{x}”?", { x: r.name }), t("Delete rule"))) { await api(`/automations/${r.id}`, { method: "DELETE" }); load(); } }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Automations")}</h1>
          <p className="sub">{t("Each rule waits for an event on a record, checks its conditions, then runs its steps in order.")}</p>
        </div>
        <button onClick={() => setEditing({ name: "", trigger_event: "deal.updated", conditions: [], actions: [{ type: "create_task", params: { title: "Follow up on {{record.name}}", due_in_days: 2 } }] })}><Plus aria-hidden="true" />{t("New rule")}</button>
      </div>

      <form className="describe" onSubmit={(e) => { e.preventDefault(); if (nl.trim()) void draft(); }}>
        <label htmlFor="nl-rule">{t("Describe a rule and the assistant drafts it")}</label>
        <p className="hint">{t("You review the draft in the editor before anything is saved.")}</p>
        <div className="row">
          <input id="nl-rule" value={nl} onChange={(e) => setNl(e.target.value)} placeholder={t("When a deal over ₪100,000 is created, add a call task for tomorrow")} />
          <button className="primary" disabled={drafting || !nl.trim()}>{drafting ? t("Drafting…") : t("Draft the rule")}</button>
        </div>
        {draftNote && <div role="status">{draftNote}</div>}
      </form>

      <section aria-labelledby="rules-title">
        <div className="section-head"><h2 id="rules-title">{t("Rules")}</h2>{rules && <span className="faint">{t("{n} active", { n: rules.filter((r) => r.enabled).length })}</span>}</div>
        {failed ? <LoadError what={t("the rules")} onRetry={load} /> : !rules ? <Skeleton lines={6} /> : rules.length === 0 ? (
          <p className="empty-line">{t("No rules yet. Describe one above, or start from a blank rule.")}</p>
        ) : (
          <ul className="rules">
            {rules.map((r) => (
              <li key={r.id} className={r.enabled ? "" : "off"}>
                <div className="rule-top">
                  <label className="switch"><input type="checkbox" role="switch" aria-label={t("{x} is on", { x: r.name })} checked={r.enabled} onChange={() => toggle(r)} /><span /></label>
                  <b>{r.name}</b>
                  <span className="faint">{tn(r.run_count, "1 run", "{n} runs")}{r.last_run_at && ` · ${t("last {x}", { x: ago(r.last_run_at) })}`}</span>
                  <div className="row">
                    <button className="ghost small" onClick={() => setEditing(r)}><PencilSimple aria-hidden="true" />{t("Edit")}</button>
                    <button className="ghost icon small" aria-label={t("Delete rule")} title={t("Delete rule")} onClick={() => remove(r)}><Trash aria-hidden="true" /></button>
                  </div>
                </div>
                <dl className="rule-body">
                  <dt>{t("When")}</dt><dd>{describeTrigger(r.trigger_event)}</dd>
                  {r.conditions.length > 0 && <><dt>{t("If")}</dt><dd>{r.conditions.map((c, i) => <span key={i}>{i > 0 && <> {t("and")} </>}{describeCond(c)}</span>)}</dd></>}
                  {r.actions.map((a, i) => <span key={i} style={{ display: "contents" }}><dt>{i === 0 ? t("Then") : t("And")}</dt><dd>{describeAction(a)}</dd></span>)}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="runs-title">
        <div className="section-head"><h2 id="runs-title">{t("Recent runs")}</h2></div>
        {runs.length === 0 ? <p className="empty-line">{t("No runs yet. Move a deal to Proposal and the first rule will fire.")}</p> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>{t("When")}</th><th>{t("Rule")}</th><th>{t("Record")}</th><th>{t("Result")}</th><th>{t("Steps")}</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="faint nowrap">{ago(r.created_at)}</td>
                    <td>{r.automation}</td>
                    <td><Link to={`/${r.record.type}/${r.record.id}`}>{r.record.name}</Link></td>
                    <td><Tag tone={r.status === "success" ? "ok" : "loss"}>{tv(r.status)}</Tag></td>
                    <td className="out">{r.output.map((o: any, i: number) => <span key={i} className={o.error ? "bad" : ""}>{i > 0 && " · "}{o.action}{o.error ? `: ${o.error}` : o.dry_run ? ` (${t("dry run")})` : ""}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {jobs.length > 0 && (
        <section className="section" aria-labelledby="jobs-title">
          <div className="section-head"><h2 id="jobs-title">{t("Assistant steps")}</h2><span className="faint">{t("run in the background so saving a record never waits")}</span></div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>{t("When")}</th><th>{t("Record")}</th><th>{t("Asked to")}</th><th>{t("Status")}</th><th>{t("Outcome")}</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="faint nowrap">{ago(j.created_at)}</td>
                    <td><Link to={`/${j.record.type}/${j.record.id}`}>{t(j.record.type)} #{j.record.id}</Link></td>
                    <td className="soft">{j.kind === "insight" ? t("read the record after it changed") : j.instructions}</td>
                    <td><Tag tone={j.status === "done" ? "ok" : j.status === "failed" ? "loss" : "warn"}>{tv(j.status)}</Tag></td>
                    <td className="soft">{j.output?.summary || j.output?.error || <span className="unset">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {editing && meta && <RuleEditor rule={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function RuleEditor({ rule, meta, onClose, onSaved }: { rule: Partial<Rule>; meta: Meta; onClose: () => void; onSaved: () => void }) {
  const [r, setR] = useState<Partial<Rule>>(JSON.parse(JSON.stringify(rule)));
  const [err, setErr] = useState<string | null>(null);
  const conds = r.conditions ?? [];
  const acts = r.actions ?? [];
  const setCond = (i: number, c: Partial<Cond>) => setR({ ...r, conditions: conds.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const setAct = (i: number, a: Partial<Action>) => setR({ ...r, actions: acts.map((x, j) => (j === i ? { ...x, ...a } : x)) });
  const setParam = (i: number, k: string, v: any) => setAct(i, { params: { ...acts[i].params, [k]: v } });

  async function save() {
    if (!r.name?.trim()) { setErr(t("Give the rule a name so the run log can show it.")); return; }
    try {
      const body = { name: r.name, trigger_event: r.trigger_event, conditions: conds, actions: acts, enabled: r.enabled ?? true };
      if (r.id) await api(`/automations/${r.id}`, { method: "PATCH", body });
      else await api("/automations", { body });
      onSaved();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Modal title={r.id ? t("Edit rule") : t("New rule")} onClose={onClose} wide>
      <div className="form">
        <label className="span2"><span>{t("Name")}</span><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
        <label className="span2"><span>{t("When")}</span>
          <select value={r.trigger_event} onChange={(e) => setR({ ...r, trigger_event: e.target.value })}>{meta.triggers.map((x) => <option key={x} value={x}>{describeTrigger(x)}</option>)}</select>
        </label>
      </div>
      <h3>{t("If")} <span className="faint small">{t("(every condition must match)")}</span></h3>
      {conds.map((c, i) => (
        <div key={i} className="builder-row">
          <input aria-label={t("Field")} placeholder={t("field, for example stage")} value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} />
          <select aria-label={t("Operator")} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>{meta.operators.map((o) => <option key={o} value={o}>{t(OP[o] ?? o)}</option>)}</select>
          <input aria-label={t("Value")} placeholder={t("value")} value={c.value ?? ""} onChange={(e) => setCond(i, { value: e.target.value })} />
          <button className="ghost icon" aria-label={t("Remove condition")} onClick={() => setR({ ...r, conditions: conds.filter((_, j) => j !== i) })}><X aria-hidden="true" /></button>
        </div>
      ))}
      <button className="ghost small" onClick={() => setR({ ...r, conditions: [...conds, { field: "stage", op: "changed_to", value: "" }] })}><Plus aria-hidden="true" />{t("Add condition")}</button>
      <h3>{t("Then")}</h3>
      {acts.map((a, i) => (
        <div key={i} className="builder-row">
          <select aria-label={t("Step")} value={a.type} onChange={(e) => setAct(i, { type: e.target.value, params: {} })}>{meta.actions.map((o) => <option key={o} value={o}>{t(o)}</option>)}</select>
          {(a.type === "create_task" || a.type === "add_note") && <input aria-label={t("Title")} placeholder={t("title")} value={a.params.title ?? ""} onChange={(e) => setParam(i, "title", e.target.value)} />}
          {a.type === "create_task" && <input aria-label={t("Due in days")} type="number" inputMode="numeric" placeholder={t("days")} style={{ width: 90, flex: "none" }} value={a.params.due_in_days ?? ""} onChange={(e) => setParam(i, "due_in_days", e.target.value === "" ? null : Number(e.target.value))} />}
          {a.type === "add_note" && <input aria-label={t("Body")} placeholder={t("note text")} value={a.params.body ?? ""} onChange={(e) => setParam(i, "body", e.target.value)} />}
          {a.type === "ai_agent" && <input aria-label={t("Instructions")} placeholder={t("What the assistant should do, for example draft a follow-up email as a note")} value={a.params.instructions ?? ""} onChange={(e) => setParam(i, "instructions", e.target.value)} />}
          {a.type === "webhook" && <input aria-label="URL" type="url" placeholder="https://" value={a.params.url ?? ""} onChange={(e) => setParam(i, "url", e.target.value)} />}
          {a.type === "update_record" && (
            <input aria-label={t("Values")} placeholder="field=value, field2=value" value={Object.entries(a.params.values ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
              onChange={(e) => setParam(i, "values", Object.fromEntries(e.target.value.split(",").map((p) => p.split("=").map((s) => s.trim())).filter((p) => p[0])))} />
          )}
          <button className="ghost icon" aria-label={t("Remove step")} onClick={() => setR({ ...r, actions: acts.filter((_, j) => j !== i) })}><X aria-hidden="true" /></button>
        </div>
      ))}
      <button className="ghost small" onClick={() => setR({ ...r, actions: [...acts, { type: "create_task", params: { title: "" } }] })}><Plus aria-hidden="true" />{t("Add step")}</button>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="actions"><button className="ghost" onClick={onClose}>{t("Cancel")}</button><button className="primary" onClick={save}>{t("Save rule")}</button></div>
    </Modal>
  );
}
