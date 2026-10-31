import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { api, compact } from "../api";
import { Bar, LoadError, Skeleton, Stage } from "../components/ui";
import Memo from "../components/Memo";
import { locale, t, tn, tIssue, tv } from "../i18n";

type Dash = {
  kpis: Record<string, number>;
  funnel: { stage: string; label: string; count: number; amount: number }[];
  lead_sources: { source: string; leads: number; converted: number; conversion_rate: number }[];
  activity: { date: string; count: number }[];
  at_risk: { id: number; name: string; amount: number; score: number; status: string; issues: { code: string; message: string; action: string }[] }[];
};

const ils = (n: number) => `₪${compact(n)}`;

/** Today: the memo leads, the deals at risk sit beside it, the numbers follow. */
export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); api<Dash>("/dashboard").then(setD).catch(() => setFailed(true)); };
  useEffect(load, []);
  const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{t("Today")}</h1><p className="sub">{today}</p></div>
      </div>
      <div className="cols">
        <Memo />
        <section className="section" aria-labelledby="risk-title" style={{ borderBlockStart: 0, paddingBlockStart: 0 }}>
          <div className="section-head"><h2 id="risk-title">{t("Deals that need attention")}</h2>{d && <span className="faint">{t("health score of 100")}</span>}</div>
          {failed ? <LoadError what={t("the pipeline")} onRetry={load} /> : !d ? <Skeleton lines={6} /> : d.at_risk.length === 0 ? (
            <p className="ok-line"><CheckCircle aria-hidden="true" />{t("Every open deal has a recent touch, a contact and a next step.")}</p>
          ) : (
            <ul className="list" style={{ borderBlockStart: "1px solid var(--line)" }}>
              {d.at_risk.map((r) => {
                const issue = r.issues[0] && tIssue(r.issues[0]);
                return (
                  <li key={r.id}>
                    <div className="line1"><Link to={`/deal/${r.id}`}>{r.name}</Link><span className={`health h-${r.status}`}>{r.score}</span></div>
                    {issue && <div className="soft">{issue.message}. {issue.action}.</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {d && (
        <>
          <dl className="ledger" aria-label={t("Pipeline figures")}>
            <div><dt>{t("Open pipeline")}</dt><dd>{ils(d.kpis.open_pipeline)}</dd><span className="faint">{tn(d.kpis.open_deals, "1 open deal", "{n} open deals")}</span></div>
            <div><dt>{t("Weighted forecast")}</dt><dd>{ils(d.kpis.weighted_forecast)}</dd><span className="faint">{t("amount × stage probability")}</span></div>
            <div><dt>{t("Won")}</dt><dd>{ils(d.kpis.won_value)}</dd><span className="faint">{t("win rate {n}%", { n: d.kpis.win_rate })}</span></div>
            <div><dt>{t("Average sales cycle")}</dt><dd>{d.kpis.avg_cycle_days}</dd><span className="faint">{tn(d.kpis.avg_cycle_days, "day from created to won", "days from created to won")}</span></div>
            <div><dt>{t("Overdue tasks")}</dt><dd>{d.kpis.overdue_tasks}</dd><span className="faint">{tn(d.kpis.leads, "1 lead open", "{n} leads open")}</span></div>
          </dl>
          <div className="cols">
            <section className="section" aria-labelledby="funnel-title">
              <div className="section-head"><h2 id="funnel-title">{t("Pipeline value by stage")}</h2></div>
              <table className="plain">
                <tbody>
                  {d.funnel.map((f) => {
                    const max = Math.max(...d.funnel.map((x) => x.amount));
                    return (
                      <tr key={f.stage}>
                        <td style={{ width: 170 }}><Stage stage={f.stage} /></td>
                        <td><Bar value={f.amount} max={max} quiet={f.stage === "LOST"} /></td>
                        <td className="num fig" style={{ width: 80 }}>{ils(f.amount)}</td>
                        <td className="num tnum faint" style={{ width: 76 }}>{tn(f.count, "1 deal", "{n} deals")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <section className="section" aria-labelledby="src-title">
              <div className="section-head"><h2 id="src-title">{t("Which lead sources convert")}</h2></div>
              <table className="plain">
                <thead><tr><th>{t("Source")}</th><th className="num">{t("Leads")}</th><th className="num">{t("Converted")}</th><th className="num">{t("Rate")}</th></tr></thead>
                <tbody>
                  {d.lead_sources.map((s) => (
                    <tr key={s.source}><td className="cap">{tv(s.source)}</td><td className="num fig">{s.leads}</td><td className="num fig">{s.converted}</td><td className="num fig">{s.conversion_rate}%</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
          <section className="section" aria-labelledby="act-title">
            <div className="section-head"><h2 id="act-title">{t("Timeline events per day, last 14 days")}</h2></div>
            <div className="spark" role="img" aria-label={d.activity.map((a) => `${a.date}: ${a.count}`).join(", ")}>
              {d.activity.map((a) => {
                const max = Math.max(1, ...d.activity.map((x) => x.count));
                return (
                  <div key={a.date} className="spark-col" title={`${a.date}: ${a.count}`}>
                    <div className={`spark-bar ${a.count ? "" : "zero"}`} style={{ height: `${(a.count / max) * 100}%` }} />
                    <span className="fig">{a.date.slice(8)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
