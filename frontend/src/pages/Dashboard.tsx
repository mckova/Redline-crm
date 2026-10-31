import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, compact } from "../api";
import { Bar, Skeleton, StageBadge } from "../components/ui";
import Briefing from "../components/Briefing";
import { t, tIssue, tv } from "../i18n";

type Dash = {
  kpis: Record<string, number>;
  funnel: { stage: string; label: string; count: number; amount: number }[];
  lead_sources: { source: string; leads: number; converted: number; conversion_rate: number }[];
  activity: { date: string; count: number }[];
  at_risk: { id: number; name: string; amount: number; score: number; status: string; issues: { code: string; message: string; action: string }[] }[];
};

const KPI = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="card kpi"><div className="muted small">{label}</div><div className="kpi-value">{value}</div>{hint && <div className="muted small">{hint}</div>}</div>
);

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  useEffect(() => { api<Dash>("/dashboard").then(setD); }, []);
  if (!d) return <div className="page"><h1>{t("Dashboard")}</h1><Skeleton lines={6} /></div>;
  const k = d.kpis;
  const maxAmt = Math.max(...d.funnel.map((f) => f.amount));
  const maxAct = Math.max(1, ...d.activity.map((a) => a.count));
  return (
    <div className="page">
      <h1>{t("Dashboard")}</h1>
      <Briefing />
      <div className="kpis">
        <KPI label={t("Open pipeline")} value={`₪${compact(k.open_pipeline)}`} hint={t("{n} open deals", { n: k.open_deals })} />
        <KPI label={t("Weighted forecast")} value={`₪${compact(k.weighted_forecast)}`} hint={t("amount × stage probability")} />
        <KPI label={t("Won")} value={`₪${compact(k.won_value)}`} hint={t("win rate {n}%", { n: k.win_rate })} />
        <KPI label={t("Avg. sales cycle")} value={t("{n}d", { n: k.avg_cycle_days })} hint={t("created → won")} />
        <KPI label={t("Overdue tasks")} value={String(k.overdue_tasks)} hint={t("{n} leads in funnel", { n: k.leads })} />
      </div>
      <div className="grid2">
        <section className="card">
          <h3>{t("Pipeline by stage")}</h3>
          <table className="plain">
            <tbody>
              {d.funnel.map((f) => (
                <tr key={f.stage}>
                  <td style={{ width: 110 }}><StageBadge stage={f.stage} /></td>
                  <td style={{ width: "55%" }}><Bar value={f.amount} max={maxAmt} tone={f.stage === "LOST" ? "gray" : f.stage === "WON" ? "green" : "indigo"} /></td>
                  <td className="num">₪{compact(f.amount)}</td>
                  <td className="num muted">{f.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>{t("Deals needing attention")}</h3>
          {d.at_risk.length === 0 && <div className="muted">{t("All open deals look healthy 🎉")}</div>}
          <ul className="risk">
            {d.at_risk.map((r) => (
              <li key={r.id}>
                <div className="row-between">
                  <Link to={`/deal/${r.id}`}>{r.name}</Link>
                  <span className={`health h-${r.status}`}>{r.score}</span>
                </div>
                <div className="muted small">{r.issues[0] && <>{tIssue(r.issues[0]).message} → <i>{tIssue(r.issues[0]).action}</i></>}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>{t("Activity · last 14 days")}</h3>
          <div className="spark">
            {d.activity.map((a) => (
              <div key={a.date} className="spark-col" title={`${a.date}: ${a.count}`} aria-label={`${a.date}: ${a.count}`}>
                <div className="spark-bar" style={{ height: `${(a.count / maxAct) * 100}%` }} />
                <span className="small muted">{a.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>{t("Lead sources")}</h3>
          <table className="plain">
            <thead><tr><th>{t("Source")}</th><th className="num">{t("Leads")}</th><th className="num">{t("Converted")}</th><th className="num">{t("Rate")}</th></tr></thead>
            <tbody>
              {d.lead_sources.map((s) => (
                <tr key={s.source}><td>{tv(s.source)}</td><td className="num">{s.leads}</td><td className="num">{s.converted}</td><td className="num">{s.conversion_rate}%</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
