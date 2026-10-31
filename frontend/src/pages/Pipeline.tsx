import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "@phosphor-icons/react";
import { api, compact, fmtDate, money } from "../api";
import RecordForm from "../components/RecordForm";
import { LoadError, Skeleton, Stage } from "../components/ui";
import { useStore } from "../store";
import { t, tn } from "../i18n";

type Column = { stage: string; label: string; probability: number; total: number; deals: any[] };

export default function Pipeline() {
  const [cols, setCols] = useState<Column[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [owner, setOwner] = useState<string>("");
  const [drag, setDrag] = useState<{ id: number; from: string } | null>(null);
  const [over, setOver] = useState<{ stage: string; index: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const { users } = useStore();
  const nav = useNavigate();

  const load = () => { setFailed(false); return api<Column[]>(`/pipeline${owner ? `?owner_id=${owner}` : ""}`).then(setCols).catch(() => setFailed(true)); };
  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener("redline:changed", h);
    return () => window.removeEventListener("redline:changed", h);
  }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps

  async function drop(stage: string) {
    if (!drag || !over || !cols) return;
    const col = cols.find((c) => c.stage === stage)!;
    const others = col.deals.filter((d) => d.id !== drag.id);
    const after = others[over.index - 1];
    const before = others[over.index];
    const previous = cols;
    const moved = cols.flatMap((c) => c.deals).find((d) => d.id === drag.id)!;
    setCols(cols.map((c) => {
      const rest = c.deals.filter((d) => d.id !== drag.id);
      if (c.stage !== stage) return { ...c, deals: rest };
      rest.splice(over.index, 0, { ...moved, stage });
      return { ...c, deals: rest };
    }));
    setDrag(null); setOver(null);
    try { await api(`/deals/${drag.id}/move`, { body: { stage, after_id: after?.id ?? null, before_id: before?.id ?? null } }); }
    catch { setCols(previous); } // roll the optimistic move back if the server refused it
    void load();
  }

  const open = cols?.filter((c) => c.stage !== "WON" && c.stage !== "LOST").reduce((s, c) => s + c.total, 0) ?? 0;

  return (
    <div className="page full">
      <div className="page-head">
        <div>
          <h1>{t("Deals")}</h1>
          {cols && <p className="sub">{t("₪{x} open across {n} deals. Drag a card to move its stage.", { x: compact(open), n: cols.filter((c) => c.stage !== "WON" && c.stage !== "LOST").reduce((s, c) => s + c.deals.length, 0) })}</p>}
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label={t("Layout")}><Link to="/deals">{t("Table")}</Link><Link className="on" to="/pipeline" aria-current="page">{t("Board")}</Link></div>
          <select aria-label={t("Owner")} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t("Everyone's deals")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="primary" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t("New deal")}</button>
        </div>
      </div>
      {failed ? <LoadError what={t("the pipeline")} onRetry={load} /> : !cols ? <Skeleton lines={8} /> : (
        <div className="board">
          {cols.map((c) => (
            <section
              key={c.stage}
              aria-label={c.label}
              className={`lane ${over?.stage === c.stage ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (over?.stage !== c.stage) setOver({ stage: c.stage, index: c.deals.filter((d) => d.id !== drag?.id).length }); }}
              onDrop={() => drop(c.stage)}
            >
              <div className="lane-head">
                <Stage stage={c.stage} />
                <div className="row-between">
                  <span className="lane-total">₪{compact(c.total)}</span>
                  <span className="faint">{tn(c.deals.length, "1 deal", "{n} deals")} · {c.probability}%</span>
                </div>
              </div>
              {c.deals.length === 0 && <div className="lane-empty">{t("Drop a deal here")}</div>}
              {c.deals.map((d, i) => (
                <div
                  key={d.id}
                  draggable
                  className={`deal-card ${drag?.id === d.id ? "dragging" : ""} ${over?.stage === c.stage && over.index === i && drag?.id !== d.id ? "drop-above" : ""}`}
                  onDragStart={() => setDrag({ id: d.id, from: c.stage })}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const idx = c.deals.filter((x) => x.id !== drag?.id).findIndex((x) => x.id === d.id); setOver({ stage: c.stage, index: idx < 0 ? i : idx }); }}
                  onClick={() => nav(`/deal/${d.id}`)}
                >
                  <a href={`/deal/${d.id}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(`/deal/${d.id}`); }}>{d.name}</a>
                  <div className="row-between">
                    <span className="fig">{money(d.amount_micros, d.currency)}</span>
                    <span className="tnum faint">{fmtDate(d.close_date)}</span>
                  </div>
                  <div className="who">{d.company_name ?? t("No company")}{d.contact_name ? ` · ${d.contact_name}` : ""}</div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {creating && <RecordForm type="deal" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
    </div>
  );
}
