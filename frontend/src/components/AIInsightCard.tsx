import { useEffect, useState } from "react";
import { ago, api, type RecordType } from "../api";

type Insight = {
  summary: string; momentum: string; risks: string[]; created_at: string; model: string;
  next_actions: { title: string; why: string; due_in_days: number }[];
  email_draft: { subject: string; body: string } | null;
};
const MOMENTUM_TONE: Record<string, string> = { accelerating: "green", steady: "blue", stalling: "amber", at_risk: "red", closed: "gray" };

export default function AIInsightCard({ type, id, onChanged }: { type: RecordType; id: number; onChanged: () => void }) {
  const [ins, setIns] = useState<Insight | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => { setIns(null); api<Insight | null>(`/ai/insights/${type}/${id}`).then(setIns); }, [type, id]);

  async function generate() {
    setBusy(true); setErr(null);
    try { setIns(await api<Insight>(`/ai/insights/${type}/${id}`, { method: "POST" })); setAdded({}); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function addTask(i: number) {
    const a = ins!.next_actions[i];
    const due = new Date(Date.now() + a.due_in_days * 86400000).toISOString().slice(0, 10);
    await api("/tasks", { body: { title: a.title, body: a.why, due_at: due, targets: [{ type, id }] } });
    setAdded({ ...added, [i]: true }); onChanged();
  }

  return (
    <section className="card ai-card">
      <div className="row-between">
        <h3>✦ AI insight {ins && <span className={`badge tone-${MOMENTUM_TONE[ins.momentum] ?? "gray"}`}>{ins.momentum.replace("_", " ")}</span>}</h3>
        <button className="ghost" disabled={busy} onClick={generate}>{busy ? "Analyzing…" : ins ? "Refresh" : "Generate"}</button>
      </div>
      {err && <div className="error">{err}</div>}
      {!ins && !busy && !err && <div className="muted">Claude reads this record's timeline, notes and tasks and suggests what to do next.</div>}
      {ins && (
        <>
          <p>{ins.summary}</p>
          {ins.risks.length > 0 && <ul className="issues">{ins.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <div className="next-actions">
            {ins.next_actions.map((a, i) => (
              <div key={i} className="next-action">
                <div><b>{a.title}</b> <span className="muted small">· in {a.due_in_days}d</span><div className="muted small">{a.why}</div></div>
                <button className="ghost small" disabled={added[i]} onClick={() => addTask(i)}>{added[i] ? "✓ added" : "+ Task"}</button>
              </div>
            ))}
          </div>
          {ins.email_draft && (
            <details className="email-draft">
              <summary>Follow-up email draft: <b>{ins.email_draft.subject}</b></summary>
              <pre>{ins.email_draft.body}</pre>
              <button className="ghost small" onClick={() => { void navigator.clipboard.writeText(`${ins.email_draft!.subject}\n\n${ins.email_draft!.body}`); setCopied(true); }}>{copied ? "✓ copied" : "Copy"}</button>
            </details>
          )}
          <div className="muted small">{ins.model} · {ago(ins.created_at)}</div>
        </>
      )}
    </section>
  );
}
