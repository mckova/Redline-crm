import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, PLURAL, type RecordType } from "../api";
import RecordForm from "../components/RecordForm";
import { Empty, FieldValue, GradeBadge } from "../components/ui";
import { FIELDS, LABELS } from "../fields";
import { useStore } from "../store";

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
        <h1>{LABELS[type][1]} <span className="muted small">{total}</span></h1>
        <div className="row">
          {selectField && (
            <select value={filter} onChange={(e) => setParams(e.target.value ? { filter: e.target.value } : {})}>
              <option value="">All {selectField.label.toLowerCase()}s</option>
              {selectField.options!.map((o) => <option key={o} value={`${selectField.key}:${o}`}>{o}</option>)}
              {type === "task" && user && <option value={`assignee_id:${user.id}`}>Assigned to me</option>}
            </select>
          )}
          <input className="filter" placeholder={`Filter ${LABELS[type][1].toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary" onClick={() => setCreating(true)}>+ New {LABELS[type][0].toLowerCase()}</button>
        </div>
      </div>
      {items.length === 0 ? (
        <Empty>No {LABELS[type][1].toLowerCase()} match.</Empty>
      ) : (
        <div className="card flush">
          <table className="grid">
            <thead>
              <tr>
                {type === "task" && <th style={{ width: 32 }} />}
                <th onClick={() => toggleSort("id")}>{type === "contact" || type === "lead" ? "Name" : cols[0].label}</th>
                {type === "lead" && <th onClick={() => toggleSort("score")}>Score {sort.endsWith("score") && (sort.startsWith("-") ? "↓" : "↑")}</th>}
                {cols.slice(type === "contact" || type === "lead" ? 0 : 1).map((f) => (
                  <th key={f.key} onClick={() => toggleSort(f.key)}>{f.label} {sort.replace("-", "") === f.key && (sort.startsWith("-") ? "↓" : "↑")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} onClick={() => nav(`/${type}/${r.id}`)} className={r.status === "DONE" ? "done" : ""}>
                  {type === "task" && <td><input type="checkbox" checked={r.status === "DONE"} onClick={(e) => quickDone(e, r)} readOnly /></td>}
                  <td className="strong">{r.display_name}</td>
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
