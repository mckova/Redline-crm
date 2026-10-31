import { useEffect, useState } from "react";
import { ago, api, type RecordType } from "../api";
import { lang, t, tv } from "../i18n";

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

  useEffect(() => {
    setIns(null);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    // A new lead or a deal that just changed stage is analyzed in the background: poll briefly until it lands.
    const poll = () => api<Insight | null>(`/ai/insights/${type}/${id}`).then((r) => { setIns(r); if (!r && ++tries < 6) timer = setTimeout(poll, 2500); });
    void poll();
    return () => clearTimeout(timer);
  }, [type, id]);

  async function generate() {
    setBusy(true); setErr(null);
    try { setIns(await api<Insight>(`/ai/insights/${type}/${id}?lang=${lang}`, { method: "POST" })); setAdded({}); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function addTask(i: number) {
    const a = ins!.next_actions[i];
    const due = new Date(Date.now() + a.due_in_days * 86400000).toISOString().slice(0, 10);
    await api("/tasks", { body: { title: a.title, body: a.why, due_at: due, targets: [{ type, id }] } });
    setAdded({ ...added, [i]: true }); onChanged();
  }

  return (
    <section className="card ai-card" aria-busy={busy}>
      <div className="row-between">
        <h3>{t("✦ AI insight")} {ins && <span className={`badge tone-${MOMENTUM_TONE[ins.momentum] ?? "gray"}`}>{tv(ins.momentum)}</span>}</h3>
        <button className="ghost" disabled={busy} onClick={generate}>{busy ? t("Analyzing…") : ins ? t("Refresh") : t("Generate")}</button>
      </div>
      {err && <div className="error" role="alert">{err}</div>}
      {!ins && !busy && !err && <div className="muted">{t("Claude reads this record's timeline, notes and tasks and suggests what to do next.")}</div>}
      {ins && (
        <>
          <p>{ins.summary}</p>
          {ins.risks.length > 0 && <ul className="issues">{ins.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <div className="next-actions">
            {ins.next_actions.map((a, i) => (
              <div key={i} className="next-action">
                <div><b>{a.title}</b> <span className="muted small">{t("· in {n}d", { n: a.due_in_days })}</span><div className="muted small">{a.why}</div></div>
                <button className="ghost small" disabled={added[i]} onClick={() => addTask(i)}>{added[i] ? t("✓ added") : t("+ Task")}</button>
              </div>
            ))}
          </div>
          {ins.email_draft && (
            <details className="email-draft">
              <summary>{t("Follow-up email draft:")} <b>{ins.email_draft.subject}</b></summary>
              <pre>{ins.email_draft.body}</pre>
              <button className="ghost small" onClick={() => { void navigator.clipboard.writeText(`${ins.email_draft!.subject}\n\n${ins.email_draft!.body}`); setCopied(true); }}>{copied ? t("✓ copied") : t("Copy")}</button>
            </details>
          )}
          <div className="muted small">{ins.model.startsWith("demo") ? <span className="badge tone-amber">{t("Demo AI")}</span> : ins.model} · {ago(ins.created_at)}</div>
        </>
      )}
    </section>
  );
}
