import { useEffect, useState } from "react";
import { ArrowsClockwise, CaretRight, Check, Copy, Envelope, Plus } from "@phosphor-icons/react";
import { ago, api, type RecordType } from "../api";
import { lang, t, tn, tv } from "../i18n";
import { Provenance, Skeleton, Tag } from "./ui";

type Insight = {
  summary: string; momentum: string; risks: string[]; created_at: string; model: string;
  next_actions: { title: string; why: string; due_in_days: number }[];
  email_draft: { subject: string; body: string } | null;
};
const MOMENTUM: Record<string, "ok" | "warn" | "loss" | undefined> = { accelerating: "ok", steady: undefined, stalling: "warn", at_risk: "loss", closed: undefined };

/** The assistant's read-out of one record: summary, risks, next steps that become tasks, a follow-up draft. */
export default function Readout({ type, id, onChanged }: { type: RecordType; id: number; onChanged: () => void }) {
  const [ins, setIns] = useState<Insight | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIns(undefined);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    // New leads and deals that just changed stage are read in the background; poll briefly until the read-out lands.
    const poll = () => api<Insight | null>(`/ai/insights/${type}/${id}`).then((r) => { setIns(r); if (!r && ++tries < 6) timer = setTimeout(poll, 2500); }).catch(() => setIns(null));
    void poll();
    return () => clearTimeout(timer);
  }, [type, id]);

  async function generate() {
    setBusy(true); setErr(null);
    try { setIns(await api<Insight>(`/ai/insights/${type}/${id}?lang=${lang}`, { method: "POST" })); setAdded({}); setCopied(false); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function addTask(i: number) {
    const a = ins!.next_actions[i];
    const due = new Date(Date.now() + a.due_in_days * 86400000).toISOString().slice(0, 10);
    await api("/tasks", { body: { title: a.title, body: a.why, due_at: due, targets: [{ type, id }] } });
    setAdded({ ...added, [i]: true }); onChanged();
  }

  return (
    <section className="readout" aria-labelledby="readout-title" aria-busy={busy}>
      <div className="section-head">
        <h2 id="readout-title" className="row">{t("Assistant's read")}{ins && <Tag tone={MOMENTUM[ins.momentum]}>{tv(ins.momentum)}</Tag>}</h2>
        {ins && <button className="ghost small" disabled={busy} onClick={generate}><ArrowsClockwise aria-hidden="true" />{busy ? t("Reading…") : t("Read again")}</button>}
      </div>
      {err && <div className="error" role="alert">{t("The assistant couldn't read this record: {e}", { e: err })}</div>}
      {ins === undefined || (busy && !ins) ? <Skeleton lines={4} label={t("Reading…")} /> : !ins ? (
        <div className="row" style={{ gap: "var(--s4)", alignItems: "center" }}>
          <p className="readout-intro">{t("The assistant reads this record's timeline, notes and tasks, then suggests the next step.")}</p>
          <button className="primary" disabled={busy} onClick={generate}>{t("Read this record")}</button>
        </div>
      ) : (
        <>
          <p className="summary">{ins.summary}</p>
          {ins.risks.length > 0 && (<><h3>{t("Risks")}</h3><ul className="risks">{ins.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></>)}
          {ins.next_actions.length > 0 && <h3>{t("Next steps")}</h3>}
          <ol className="next">
            {ins.next_actions.map((a, i) => (
              <li key={i}>
                <div><b>{a.title}</b><span className="fig">{tn(a.due_in_days, "in 1 day", "in {n} days")}</span></div>
                <span className="why">{a.why}</span>
                <button className="small" disabled={added[i]} onClick={() => addTask(i)}>{added[i] ? <><Check aria-hidden="true" />{t("Task added")}</> : <><Plus aria-hidden="true" />{t("Add as task")}</>}</button>
              </li>
            ))}
          </ol>
          {ins.email_draft && (
            <details className="email-draft">
              <summary><CaretRight className="caret" aria-hidden="true" /><Envelope aria-hidden="true" /><span>{t("Follow-up email")}: <b>{ins.email_draft.subject}</b></span></summary>
              <div className="body">
                <pre>{ins.email_draft.body}</pre>
                <button className="small" onClick={() => { void navigator.clipboard.writeText(`${ins.email_draft!.subject}\n\n${ins.email_draft!.body}`); setCopied(true); }}>
                  {copied ? <><Check aria-hidden="true" />{t("Copied")}</> : <><Copy aria-hidden="true" />{t("Copy email")}</>}
                </button>
              </div>
            </details>
          )}
          <div className="readout-foot"><Provenance model={ins.model} when={ago(ins.created_at)} /></div>
        </>
      )}
    </section>
  );
}
