import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";
import { ago, api } from "../api";
import { lang, t } from "../i18n";
import { LoadError, Provenance, Skeleton } from "./ui";

type Brief = {
  headline: string; pipeline_note: string; watch_out: string[]; model: string; created_at: string;
  focus: { title: string; why: string; record_type: string; record_id: number }[];
};

/** The morning memo: the assistant reads the whole pipeline and ranks where to start. */
export default function Memo() {
  const [b, setB] = useState<Brief | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => { setLoadFailed(false); api<Brief | null>(`/ai/briefing?lang=${lang}`).then(setB).catch(() => setLoadFailed(true)); };
  useEffect(load, []);

  async function write() {
    setBusy(true); setErr(null);
    try { setB(await api<Brief>(`/ai/briefing?lang=${lang}`, { method: "POST" })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <section className="memo" aria-labelledby="memo-title" aria-busy={busy}>
      <div className="memo-head">
        <h2 id="memo-title">{t("Where to start today")}</h2>
        {b && <button className="ghost small" disabled={busy} onClick={write}><ArrowsClockwise aria-hidden="true" />{busy ? t("Reading the pipeline…") : t("Rewrite")}</button>}
      </div>
      {err && <div className="error" role="alert">{t("The assistant couldn't write the memo: {e}", { e: err })}</div>}
      {loadFailed ? <LoadError what={t("today's memo")} onRetry={load} />
        : b === undefined || (busy && !b) ? <Skeleton lines={5} label={t("Reading the pipeline…")} />
        : !b ? (
          <div className="memo-empty">
            <p>{t("No memo yet today. The assistant reads deal health, overdue tasks, hot leads and the forecast, then ranks the records to work on first.")}</p>
            <button className="primary" disabled={busy} onClick={write}>{t("Write today's memo")}</button>
          </div>
        ) : (
          <>
            <p className="memo-lede">{b.headline}</p>
            <ol className="focus">
              {b.focus.map((f, i) => (
                <li key={i} style={{ "--i": i } as React.CSSProperties}>
                  <div>
                    <Link to={`/${f.record_type}/${f.record_id}`}>{f.title}</Link>
                    <p>{f.why}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="memo-note">{b.pipeline_note}</p>
            {b.watch_out.length > 0 && <p className="memo-watch"><Warning aria-hidden="true" /><span><b>{t("Watch")}:</b> {b.watch_out.join(" · ")}</span></p>}
            <div className="readout-foot"><Provenance model={b.model} when={ago(b.created_at)} /></div>
          </>
        )}
    </section>
  );
}
