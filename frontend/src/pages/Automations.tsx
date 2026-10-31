import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ago, api } from "../api";
import { Badge, Modal } from "../components/ui";

type Cond = { field: string; op: string; value?: any };
type Action = { type: string; params: Record<string, any> };
type Rule = { id: number; name: string; enabled: boolean; trigger_event: string; conditions: Cond[]; actions: Action[]; run_count: number; last_run_at: string | null };
type Meta = { triggers: string[]; operators: string[]; actions: string[] };

const describeCond = (c: Cond) => `${c.field} ${c.op.replace("_", " ")}${["is_empty", "not_empty", "changed"].includes(c.op) ? "" : ` "${c.value}"`}`;
const describeAction = (a: Action) =>
  a.type === "create_task" ? `create task “${a.params.title}”${a.params.due_in_days != null ? ` due in ${a.params.due_in_days}d` : ""}`
  : a.type === "add_note" ? `add note “${a.params.title}”`
  : a.type === "ai_agent" ? `✦ AI: ${a.params.instructions}`
  : a.type === "update_record" ? `set ${Object.entries(a.params.values ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}`
  : `POST ${a.params.url}`;

export default function Automations() {
  const [rules, setRules] = useState<Rule[]>([]);
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
      setDraftNote(d.explanation + (d.valid ? "" : ` (needs a fix: ${d.error})`));
      setEditing({ name: d.name, trigger_event: d.trigger_event, conditions: d.conditions, actions: d.actions });
    } catch (e: any) { setDraftNote(e.message); } finally { setDrafting(false); }
  }

  const load = () => {
    api<Rule[]>("/automations").then(setRules);
    api<any[]>("/automations/runs?limit=30").then(setRuns);
    api<any[]>("/ai/jobs").then(setJobs);
  };
  useEffect(() => { load(); api("/meta").then((m) => setMeta(m.automation)); }, []);

  async function toggle(r: Rule) { await api(`/automations/${r.id}`, { method: "PATCH", body: { enabled: !r.enabled } }); load(); }
  async function remove(r: Rule) { if (window.confirm(`Delete “${r.name}”?`)) { await api(`/automations/${r.id}`, { method: "DELETE" }); load(); } }

  return (
    <div className="page">
      <div className="row-between">
        <h1>Automations</h1>
        <button className="primary" onClick={() => setEditing({ name: "", trigger_event: "deal.updated", conditions: [], actions: [{ type: "create_task", params: { title: "Follow up on {{record.name}}", due_in_days: 2 } }] })}>+ New rule</button>
      </div>
      <p className="muted">When something happens to a record → check conditions → run actions. Use <code>{"{{record.field}}"}</code> in text.</p>
      <form className="card ai-describe" onSubmit={(e) => { e.preventDefault(); if (nl.trim()) void draft(); }}>
        <b>✦ Describe a rule in your own words</b>
        <div className="row builder-row">
          <input value={nl} onChange={(e) => setNl(e.target.value)} placeholder="e.g. When a deal over 100K is created, have AI write a brief for the CEO and add a call task for tomorrow" />
          <button className="primary" disabled={drafting || !nl.trim()}>{drafting ? "Drafting…" : "Draft rule"}</button>
        </div>
        {draftNote && <div className="muted small">{draftNote}</div>}
      </form>
      <div className="rules">
        {rules.map((r) => (
          <div key={r.id} className={`card rule ${r.enabled ? "" : "disabled"}`}>
            <div className="row-between">
              <b>{r.name}</b>
              <div className="row">
                <label className="switch"><input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} /><span /></label>
                <button className="ghost" onClick={() => setEditing(r)}>Edit</button>
                <button className="ghost" onClick={() => remove(r)}>✕</button>
              </div>
            </div>
            <div className="flow">
              <span className="node trig">WHEN {r.trigger_event}</span>
              {r.conditions.map((c, i) => <span key={i} className="node cond">IF {describeCond(c)}</span>)}
              {r.actions.map((a, i) => <span key={i} className="node act">THEN {describeAction(a)}</span>)}
            </div>
            <div className="muted small">{r.run_count} runs{r.last_run_at && ` · last ${ago(r.last_run_at)}`}</div>
          </div>
        ))}
      </div>
      <h3>Run log</h3>
      <div className="card flush">
        <table className="grid">
          <thead><tr><th>When</th><th>Rule</th><th>Record</th><th>Status</th><th>Output</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="muted">{ago(r.created_at)}</td>
                <td>{r.automation}</td>
                <td><Link to={`/${r.record.type}/${r.record.id}`}>{r.record.name}</Link></td>
                <td><Badge tone={r.status === "success" ? "green" : "red"}>{r.status}</Badge></td>
                <td className="small mono">{r.output.map((o: any) => o.error ? `✗ ${o.action}: ${o.error}` : `✓ ${o.action}${o.dry_run ? " (dry-run)" : ""}`).join("  ")}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={5} className="muted">No runs yet — move a deal to “proposal” to see one.</td></tr>}
          </tbody>
        </table>
      </div>
      {jobs.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>✦ AI steps</h3>
          <div className="card flush">
            <table className="grid">
              <thead><tr><th>When</th><th>Record</th><th>Instructions</th><th>Status</th><th>Result</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="muted">{ago(j.created_at)}</td>
                    <td><Link to={`/${j.record.type}/${j.record.id}`}>{j.record.type} #{j.record.id}</Link></td>
                    <td className="small">{j.instructions}</td>
                    <td><Badge tone={j.status === "done" ? "green" : j.status === "failed" ? "red" : "amber"}>{j.status}</Badge></td>
                    <td className="small">{j.output?.summary || j.output?.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
    try {
      const body = { name: r.name, trigger_event: r.trigger_event, conditions: conds, actions: acts, enabled: r.enabled ?? true };
      if (r.id) await api(`/automations/${r.id}`, { method: "PATCH", body });
      else await api("/automations", { body });
      onSaved();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Modal title={r.id ? "Edit rule" : "New rule"} onClose={onClose} wide>
      <div className="form">
        <label className="span2"><span>Name</span><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
        <label className="span2"><span>When</span>
          <select value={r.trigger_event} onChange={(e) => setR({ ...r, trigger_event: e.target.value })}>{meta.triggers.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
      </div>
      <h4>Conditions <span className="muted small">(all must match)</span></h4>
      {conds.map((c, i) => (
        <div key={i} className="row builder-row">
          <input placeholder="field (e.g. stage)" value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} />
          <select value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>{meta.operators.map((o) => <option key={o}>{o}</option>)}</select>
          <input placeholder="value" value={c.value ?? ""} onChange={(e) => setCond(i, { value: e.target.value })} />
          <button className="ghost" onClick={() => setR({ ...r, conditions: conds.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button className="ghost" onClick={() => setR({ ...r, conditions: [...conds, { field: "stage", op: "changed_to", value: "" }] })}>+ condition</button>
      <h4>Actions</h4>
      {acts.map((a, i) => (
        <div key={i} className="row builder-row">
          <select value={a.type} onChange={(e) => setAct(i, { type: e.target.value, params: {} })}>{meta.actions.map((o) => <option key={o}>{o}</option>)}</select>
          {(a.type === "create_task" || a.type === "add_note") && <input placeholder="title" value={a.params.title ?? ""} onChange={(e) => setParam(i, "title", e.target.value)} />}
          {a.type === "create_task" && <input type="number" placeholder="due in days" style={{ width: 110 }} value={a.params.due_in_days ?? ""} onChange={(e) => setParam(i, "due_in_days", e.target.value === "" ? null : Number(e.target.value))} />}
          {a.type === "add_note" && <input placeholder="body" value={a.params.body ?? ""} onChange={(e) => setParam(i, "body", e.target.value)} />}
          {a.type === "ai_agent" && <input placeholder="What should the AI do? e.g. Draft a personalised follow-up email as a note" value={a.params.instructions ?? ""} onChange={(e) => setParam(i, "instructions", e.target.value)} />}
          {a.type === "webhook" && <input placeholder="https://…" value={a.params.url ?? ""} onChange={(e) => setParam(i, "url", e.target.value)} />}
          {a.type === "update_record" && (
            <input placeholder="field=value, field2=value" value={Object.entries(a.params.values ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
              onChange={(e) => setParam(i, "values", Object.fromEntries(e.target.value.split(",").map((p) => p.split("=").map((s) => s.trim())).filter((p) => p[0])))} />
          )}
          <button className="ghost" onClick={() => setR({ ...r, actions: acts.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button className="ghost" onClick={() => setR({ ...r, actions: [...acts, { type: "create_task", params: { title: "" } }] })}>+ action</button>
      {err && <div className="error">{err}</div>}
      <div className="actions"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save rule</button></div>
    </Modal>
  );
}
