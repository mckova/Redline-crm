import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ago, api } from "../api";
import { lang, t } from "../i18n";
import { Skeleton } from "./ui";

type Brief = {
  headline: string; pipeline_note: string; watch_out: string[]; model: string; created_at: string;
  focus: { title: string; why: string; record_type: string; record_id: number }[];
};

/** Today's briefing: Claude reads the whole pipeline and says where to start. */
export default function Briefing() {
  const [b, setB] = useState<Brief | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api<Brief | null>("/ai/briefing").then(setB).catch(() => setB(null)); }, []);

  async function generate() {
    setBusy(true); setErr(null);
    try { setB(await api<Brief>(`/ai/briefing?lang=${lang}`, { method: "POST" })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const demo = b?.model.startsWith("demo");
  return (
    <section className="card briefing" aria-labelledby="brief-title" aria-busy={busy}>
      <div className="row-between">
        <h2 id="brief-title" className="h3">{t("✦ Today's briefing")} {demo && <span className="badge tone-amber">{t("Demo AI")}</span>}</h2>
        <button className={b ? "ghost" : "primary"} disabled={busy} onClick={generate}>{busy ? t("Thinking…") : b ? t("Refresh") : t("Generate briefing")}</button>
      </div>
      {err && <div className="error" role="alert">{err}</div>}
      {b === undefined || (busy && !b) ? <Skeleton lines={3} /> : !b ? (
        <p className="muted pretty">{t("Claude reads the whole pipeline (deal health, overdue tasks, hot leads, forecast) and tells you where to start today.")}</p>
      ) : (
        <>
          <p className="brief-headline balance">{b.headline}</p>
          <ol className="focus-list">
            {b.focus.map((f, i) => (
              <li key={i} style={{ "--i": i } as React.CSSProperties}>
                <span className="focus-n" aria-hidden="true">{i + 1}</span>
                <div>
                  <Link to={`/${f.record_type}/${f.record_id}`} className="strong">{f.title}</Link>
                  <div className="muted small">{f.why}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="muted small pretty">{b.pipeline_note}</p>
          {b.watch_out.length > 0 && <p className="small watch"><b>{t("Watch out")}:</b> {b.watch_out.join(" · ")}</p>}
          <div className="muted small">{demo ? null : b.model} · {ago(b.created_at)}</div>
        </>
      )}
    </section>
  );
}
