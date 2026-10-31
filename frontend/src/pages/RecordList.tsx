import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, PLURAL, type RecordType } from "../api";
import RecordForm from "../components/RecordForm";
import { Empty, FieldValue, GradeBadge } from "../components/ui";
import { FIELDS, LABELS } from "../fields";
import { useStore } from "../store";
import { t, tv } from "../i18n";

export default function RecordList({ type }: { type: RecordType }) {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(type === "lead" ? "-score" : type === "task" ? "due_at" : "-id");
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "";
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const { user } = useStore();
  const cols = FIELDS[type].filter((f) => f.list);
  const selectField = FIELDS[type].find((f) => f.kind === "select");

  const load = () => {
    const qs = new URLSearchParams({ sort, limit: "300" });
    if (q) qs.set("q", q);
    if (filter) qs.set("filters", filter);
    api<{ total: number; items: any[] }>(`/${PLURAL[type]}?${qs}`).then((r) => { setItems(r.items); setTotal(r.total); });
  };
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [type, q, sort, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key: string) => setSort(sort === key ? `-${key}` : key);

  async function quickDone(e: React.MouseEvent, t: any) {
    e.stopPropagation();
    await api(`/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "DONE" ? "TODO" : "DONE" } });
    load();
  }

  return (
    <div className="page">
      <div className="row-between">
        <h1>{t(LABELS[type][1])} <span className="muted small">{total}</span></h1>
        <div className="row">
          {selectField && (
            <select aria-label={t("Status")} value={filter} onChange={(e) => setParams(e.target.value ? { filter: e.target.value } : {})}>
              <option value="">{t("All {x}", { x: t(selectField.label) })}</option>
              {selectField.options!.map((o) => <option key={o} value={`${selectField.key}:${o}`}>{tv(o)}</option>)}
              {type === "task" && user && <option value={`assignee_id:${user.id}`}>{t("Assigned to me")}</option>}
            </select>
          )}
          <input className="filter" aria-label={t("Filter…")} placeholder={t("Filter…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary" onClick={() => setCreating(true)}>{t("+ New {x}", { x: t(LABELS[type][0]) })}</button>
        </div>
      </div>
      {items.length === 0 ? (
        <Empty>{t("No records match.")} <button className="primary" onClick={() => setCreating(true)}>{t("+ New {x}", { x: t(LABELS[type][0]) })}</button></Empty>
      ) : (
        <div className="card flush">
          <table className="grid">
            <thead>
              <tr>
                {type === "task" && <th style={{ width: 32 }} />}
                <th><button className="th-btn" onClick={() => toggleSort("id")}>{type === "contact" || type === "lead" ? t("Name") : t(cols[0].label)}</button></th>
                {type === "lead" && <th aria-sort={sort.endsWith("score") ? (sort.startsWith("-") ? "descending" : "ascending") : undefined}><button className="th-btn" onClick={() => toggleSort("score")}>{t("Score")} {sort.endsWith("score") && (sort.startsWith("-") ? "↓" : "↑")}</button></th>}
                {cols.slice(type === "contact" || type === "lead" ? 0 : 1).map((f) => (
                  <th key={f.key} aria-sort={sort.replace("-", "") === f.key ? (sort.startsWith("-") ? "descending" : "ascending") : undefined}><button className="th-btn" onClick={() => toggleSort(f.key)}>{t(f.label)} {sort.replace("-", "") === f.key && (sort.startsWith("-") ? "↓" : "↑")}</button></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} onClick={() => nav(`/${type}/${r.id}`)} className={r.status === "DONE" ? "done" : ""}>
                  {type === "task" && <td><input type="checkbox" aria-label={r.display_name} checked={r.status === "DONE"} onClick={(e) => quickDone(e, r)} readOnly /></td>}
                  <td className="strong"><Link to={`/${type}/${r.id}`} className="row-link" onClick={(e) => e.stopPropagation()}>{r.display_name}</Link></td>
                  {type === "lead" && <td><GradeBadge grade={r.grade} score={r.score} /></td>}
                  {cols.slice(type === "contact" || type === "lead" ? 0 : 1).map((f) => <td key={f.key}><FieldValue field={f} record={r} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <RecordForm type={type} onClose={() => setCreating(false)} onSaved={(r) => { setCreating(false); nav(`/${type}/${r.id}`); }} />}
    </div>
  );
}
