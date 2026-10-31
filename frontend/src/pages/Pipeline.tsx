import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, compact, fmtDate, money } from "../api";
import RecordForm from "../components/RecordForm";
import { useStore } from "../store";
import { t, tv } from "../i18n";

type Column = { stage: string; label: string; probability: number; total: number; deals: any[] };

export default function Pipeline() {
  const [cols, setCols] = useState<Column[]>([]);
  const [owner, setOwner] = useState<string>("");
  const [drag, setDrag] = useState<{ id: number; from: string } | null>(null);
  const [over, setOver] = useState<{ stage: string; index: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const { users } = useStore();
  const nav = useNavigate();

  const load = () => api<Column[]>(`/pipeline${owner ? `?owner_id=${owner}` : ""}`).then(setCols);
  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener("kesher:changed", h);
    return () => window.removeEventListener("kesher:changed", h);
  }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps

  async function drop(stage: string) {
    if (!drag || !over) return;
    const col = cols.find((c) => c.stage === stage)!;
    const others = col.deals.filter((d) => d.id !== drag.id);
    const after = others[over.index - 1];
    const before = others[over.index];
    // optimistic update
    const moved = cols.flatMap((c) => c.deals).find((d) => d.id === drag.id)!;
    setCols(cols.map((c) => {
      const rest = c.deals.filter((d) => d.id !== drag.id);
      if (c.stage !== stage) return { ...c, deals: rest };
      rest.splice(over.index, 0, { ...moved, stage });
      return { ...c, deals: rest };
    }));
    setDrag(null); setOver(null);
    await api(`/deals/${drag.id}/move`, { body: { stage, after_id: after?.id ?? null, before_id: before?.id ?? null } });
    void load();
  }

  return (
    <div className="page full">
      <div className="row-between">
        <h1>{t("Pipeline")}</h1>
        <div className="row">
          <select aria-label={t("Owner")} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t("All owners")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="primary" onClick={() => setCreating(true)}>{t("+ New deal")}</button>
        </div>
      </div>
      <div className="board">
        {cols.map((c) => (
          <div
            key={c.stage}
            className={`col ${over?.stage === c.stage ? "col-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (over?.stage !== c.stage) setOver({ stage: c.stage, index: c.deals.filter((d) => d.id !== drag?.id).length }); }}
            onDrop={() => drop(c.stage)}
          >
            <div className={`col-head stage-line-${c.stage}`}>
              <b>{tv(c.stage)}</b> <span className="muted small">{c.deals.length} · {c.probability}%</span>
              <div className="col-total">₪{compact(c.total)}</div>
            </div>
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
                <a className="deal-name" href={`/deal/${d.id}`} onClick={(e) => { e.preventDefault(); nav(`/deal/${d.id}`); }}>{d.name}</a>
                <div className="row-between small">
                  <b>{money(d.amount_micros, d.currency)}</b>
                  <span className="muted">{fmtDate(d.close_date)}</span>
                </div>
                <div className="muted small">{d.company_name ?? "—"}{d.contact_name ? ` · ${d.contact_name}` : ""}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {creating && <RecordForm type="deal" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
    </div>
  );
}
