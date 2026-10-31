import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, compact } from "../api";
import { Bar, StageBadge } from "../components/ui";

type Dash = {
  kpis: Record<string, number>;
  funnel: { stage: string; label: string; count: number; amount: number }[];
  lead_sources: { source: string; leads: number; converted: number; conversion_rate: number }[];
  activity: { date: string; count: number }[];
  at_risk: { id: number; name: string; amount: number; score: number; status: string; issues: { message: string; action: string }[] }[];
};

const KPI = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="card kpi"><div className="muted small">{label}</div><div className="kpi-value">{value}</div>{hint && <div className="muted small">{hint}</div>}</div>
);

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  useEffect(() => { api<Dash>("/dashboard").then(setD); }, []);
  if (!d) return <div className="muted">Loading…</div>;
  const k = d.kpis;
  const maxAmt = Math.max(...d.funnel.map((f) => f.amount));
  const maxAct = Math.max(1, ...d.activity.map((a) => a.count));
  return (
    <div className="page">
      <h1>Dashboard</h1>
      <div className="kpis">
        <KPI label="Open pipeline" value={`₪${compact(k.open_pipeline)}`} hint={`${k.open_deals} open deals`} />
        <KPI label="Weighted forecast" value={`₪${compact(k.weighted_forecast)}`} hint="amount × stage probability" />
        <KPI label="Won" value={`₪${compact(k.won_value)}`} hint={`win rate ${k.win_rate}%`} />
        <KPI label="Avg. sales cycle" value={`${k.avg_cycle_days}d`} hint="created → won" />
        <KPI label="Overdue tasks" value={String(k.overdue_tasks)} hint={`${k.leads} leads in funnel`} />
      </div>
      <div className="grid2">
        <section className="card">
          <h3>Pipeline by stage</h3>
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
          <h3>Deals needing attention</h3>
          {d.at_risk.length === 0 && <div className="muted">All open deals look healthy 🎉</div>}
          <ul className="risk">
            {d.at_risk.map((r) => (
              <li key={r.id}>
                <div className="row-between">
                  <Link to={`/deal/${r.id}`}>{r.name}</Link>
                  <span className={`health h-${r.status}`}>{r.score}</span>
                </div>
                <div className="muted small">{r.issues[0]?.message} → <i>{r.issues[0]?.action}</i></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Activity · last 14 days</h3>
          <div className="spark">
            {d.activity.map((a) => (
              <div key={a.date} className="spark-col" title={`${a.date}: ${a.count}`}>
                <div className="spark-bar" style={{ height: `${(a.count / maxAct) * 100}%` }} />
                <span className="small muted">{a.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>Lead sources</h3>
          <table className="plain">
            <thead><tr><th>Source</th><th className="num">Leads</th><th className="num">Converted</th><th className="num">Rate</th></tr></thead>
            <tbody>
              {d.lead_sources.map((s) => (
                <tr key={s.source}><td>{s.source}</td><td className="num">{s.leads}</td><td className="num">{s.converted}</td><td className="num">{s.conversion_rate}%</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
