import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CaretDown, CaretUp, Plus } from "@phosphor-icons/react";
import { api, PLURAL, type RecordType } from "../api";
import RecordForm from "../components/RecordForm";
import { Empty, FieldValue, Grade, LoadError, Skeleton } from "../components/ui";
import { FIELDS, LABELS } from "../fields";
import { useStore } from "../store";
import { t, tv } from "../i18n";

const FIRST_RUN: Partial<Record<RecordType, string>> = {
  deal: "Deals appear here when you create one or convert a lead.",
  lead: "New leads land here from the web form, imports, or when you add one.",
  company: "Companies are created with deals and converted leads, or by hand.",
  contact: "People are added with converted leads, or by hand.",
  task: "Tasks come from you, from rules, and from the assistant's next steps.",
};

export default function RecordList({ type }: { type: RecordType }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
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
  const one = t(LABELS[type][0]);

  const load = () => {
    setFailed(false);
    const qs = new URLSearchParams({ sort, limit: "300" });
    if (q) qs.set("q", q);
    if (filter) qs.set("filters", filter);
    api<{ total: number; items: any[] }>(`/${PLURAL[type]}?${qs}`).then((r) => { setItems(r.items); setTotal(r.total); }).catch(() => setFailed(true));
  };
  useEffect(() => { const timer = setTimeout(load, 150); return () => clearTimeout(timer); }, [type, q, sort, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key: string) => setSort(sort === key ? `-${key}` : key);
  const sortState = (key: string) => (sort.replace("-", "") === key ? (sort.startsWith("-") ? "descending" : "ascending") : undefined);
  const SortMark = ({ k }: { k: string }) => (sortState(k) === "descending" ? <CaretDown aria-hidden="true" /> : sortState(k) === "ascending" ? <CaretUp aria-hidden="true" /> : null);

  async function quickDone(e: React.MouseEvent, task: any) {
    e.stopPropagation();
    await api(`/tasks/${task.id}`, { method: "PATCH", body: { status: task.status === "DONE" ? "TODO" : "DONE" } });
    load();
  }

  const narrowed = !!(q || filter);
  const rest = cols.slice(type === "contact" || type === "lead" ? 0 : 1);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t(LABELS[type][1])}{items && <span className="fig">{total}</span>}</h1>
        <div className="row">
          {selectField && (
            <select aria-label={t("Show")} value={filter} onChange={(e) => setParams(e.target.value ? { filter: e.target.value } : {})}>
              <option value="">{t("Any {x}", { x: t(selectField.label).toLowerCase() })}</option>
              {selectField.options!.map((o) => <option key={o} value={`${selectField.key}:${o}`}>{tv(o)}</option>)}
              {type === "task" && user && <option value={`assignee_id:${user.id}`}>{t("Assigned to me")}</option>}
            </select>
          )}
          <input className="filter" type="search" aria-label={t("Filter by name")} placeholder={t("Filter by name")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t("New {x}", { x: one.toLowerCase() })}</button>
        </div>
      </div>
      {failed ? <LoadError what={t(LABELS[type][1]).toLowerCase()} onRetry={load} />
        : items === null ? <Skeleton lines={10} />
        : items.length === 0 ? (
          narrowed ? (
            <Empty>
              <b>{t("Nothing matches this filter.")}</b>
              <button onClick={() => { setQ(""); setParams({}); }}>{t("Clear the filter")}</button>
            </Empty>
          ) : (
            <Empty>
              <b>{t("No {x} yet.", { x: t(LABELS[type][1]).toLowerCase() })}</b>
              {FIRST_RUN[type] && <span>{t(FIRST_RUN[type]!)}</span>}
              <button className="primary" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t("New {x}", { x: one.toLowerCase() })}</button>
            </Empty>
          )
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  {type === "task" && <th><span className="vh">{t("Done")}</span></th>}
                  <th aria-sort={sortState("id")}><button className="th-btn" onClick={() => toggleSort("id")}>{type === "contact" || type === "lead" ? t("Name") : t(cols[0].label)}<SortMark k="id" /></button></th>
                  {type === "lead" && <th aria-sort={sortState("score")}><button className="th-btn" onClick={() => toggleSort("score")}>{t("Score")}<SortMark k="score" /></button></th>}
                  {rest.map((f) => (
                    <th key={f.key} aria-sort={sortState(f.key)} className={f.kind === "money" || f.kind === "number" ? "num" : ""}>
                      <button className="th-btn" style={f.kind === "money" || f.kind === "number" ? { justifyContent: "flex-end" } : undefined} onClick={() => toggleSort(f.key)}>{t(f.label)}<SortMark k={f.key} /></button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className={`link ${r.status === "DONE" ? "done" : ""}`} onClick={() => nav(`/${type}/${r.id}`)}>
                    {type === "task" && <td className="check"><input type="checkbox" aria-label={t("Mark “{x}” done", { x: r.display_name })} checked={r.status === "DONE"} onClick={(e) => quickDone(e, r)} readOnly /></td>}
                    <td className="name"><Link to={`/${type}/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.display_name}</Link></td>
                    {type === "lead" && <td><Grade grade={r.grade} score={r.score} /></td>}
                    {rest.map((f) => <td key={f.key} className={f.kind === "money" || f.kind === "number" ? "num" : ""}><FieldValue field={f} record={r} /></td>)}
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
