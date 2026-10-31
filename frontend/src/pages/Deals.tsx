import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { ago, api, money } from "../api";
import RecordForm from "../components/RecordForm";
import { Empty, LoadError, Skeleton, Stage } from "../components/ui";
import { useStore, type PendingGroup, type Proposal } from "../store";
import { locale, t, tn, tv } from "../i18n";

type Row = {
  id: number; name: string; stage: string; amount_micros: number; currency: string; close_date: string | null;
  company_id: number | null; company_name: string | null; contact_id: number | null; contact_name: string | null; owner_id: number | null;
  win_probability: number; stage_changed_at: string | null; created_at: string;
  next_step: { id: number; title: string; due_at: string | null } | null; last_touch: string | null;
};
type Activity = { id: number; name: string; happens_at: string; actor_source: string; properties: { diff?: Record<string, { before: any; after: any }> }; linked: { type: string; name: string } | null };
/** One line of the approval card: a field change, a task, a note. `key` is what the server's decision map expects. */
type Change = { key: string; tool: string; label: string; field?: string; from?: ReactNode; to: ReactNode; extra?: string };

const QUIET_DAYS = 14;
const DAY = 86_400_000;
const isOpen = (r: Row) => r.stage !== "WON" && r.stage !== "LOST";
const day = (s: string | null) => (s ? new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" }) : "");
const daysSince = (s: string | null) => (s ? Math.floor((Date.now() - new Date(s + (s.endsWith("Z") || s.includes("+") ? "" : "Z")).getTime()) / DAY) : Infinity);
const touch = (s: string | null) => {
  const d = daysSince(s);
  return d === Infinity ? t("Never") : d <= 0 ? t("Today") : d === 1 ? t("Yesterday") : t("{n} days ago", { n: d });
};
const shortName = (r: Row) => (r.company_name && r.name.startsWith(`${r.company_name}, `) ? r.name.slice(r.company_name.length + 2) : r.name);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ils = (n: number) => money(n * 1e6);
const weekday = (days: number) => new Date(Date.now() + days * DAY).toLocaleDateString(locale, { weekday: "short" });
const FIELD_LABEL: Record<string, string> = { stage: "Stage", amount: "Amount", close_date: "Close date", probability: "Win chance", owner_id: "Owner", name: "Name" };

/** The deal a proposal is about, whichever way the assistant phrased it. */
function dealOf(g: PendingGroup, p: Proposal): number | null {
  if (p.input.record_type === "deal" && p.input.record_id) return p.input.record_id;
  const link = (p.input.links ?? []).find((l: any) => l.type === "deal");
  if (link) return link.id;
  return g.target?.type === "deal" ? g.target.id : null;
}

function changesFor(items: Proposal[], row: Row | undefined): Change[] {
  const out: Change[] = [];
  for (const p of items) {
    if (p.name === "update_record") {
      for (const f of p.input.fields ?? []) {
        const old = row ? (f.field === "amount" ? ils(row.amount_micros / 1e6) : f.field === "stage" ? capital(tv(row.stage)) : f.field === "close_date" ? day(row.close_date) : null) : null;
        const to = f.field === "amount" ? ils(Number(f.value)) : f.field === "stage" ? capital(tv(f.value)) : f.field === "close_date" ? day(f.value) : String(f.value);
        out.push({ key: `${p.tool_use_id}:${f.field}`, tool: p.tool_use_id, field: f.field, label: t(FIELD_LABEL[f.field] ?? f.field), from: old || undefined, to });
      }
    } else if (p.name === "create_task") {
      out.push({ key: p.tool_use_id, tool: p.tool_use_id, label: t("New task"), to: p.input.title, extra: p.input.due_in_days != null ? weekday(p.input.due_in_days) : undefined });
    } else if (p.name === "add_note") {
      out.push({ key: p.tool_use_id, tool: p.tool_use_id, label: t("Note"), to: p.input.title });
    } else {
      out.push({ key: p.tool_use_id, tool: p.tool_use_id, label: t("Change"), to: p.summary });
    }
  }
  return out;
}

/** "Call with Adi: budget approved…" → ["Adi", "budget approved…"]. */
function speaker(said: string | null): [string | null, string] {
  const m = (said ?? "").match(/^\s*(?:call|meeting|chat|lunch)\s+with\s+([^:,.\n]{1,30})[:,.-]\s*([\s\S]*)$/i);
  return m ? [m[1].trim(), m[2].trim()] : [null, (said ?? "").trim()];
}

const VIEWS: [string, string, (r: Row, me: number | undefined) => boolean][] = [
  ["open", "Open", isOpen],
  ["mine", "Mine", (r, me) => isOpen(r) && r.owner_id === me],
  ["closing", "Closing this month", (r) => {
    if (!isOpen(r) || !r.close_date) return false;
    const d = new Date(r.close_date), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }],
  ["quiet", "Gone quiet", (r) => isOpen(r) && daysSince(r.last_touch) > QUIET_DAYS],
  ["won", "Won", (r) => r.stage === "WON"],
];

/** Deals: the table with saved views; the assistant's proposals sit in the cells and wait in the column on the right. */
export default function Deals() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState("open");
  const [q, setQ] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { user, refName, pending, reloadPending } = useStore();
  const nav = useNavigate();
  const selected = Number(params.get("deal")) || null;
  const select = (id: number) => setParams({ deal: String(id) }, { replace: true });

  const load = () => { setFailed(false); return api<Row[]>("/deal-rows").then(setRows).catch(() => setFailed(true)); };
  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener("redline:changed", h);
    return () => window.removeEventListener("redline:changed", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  /** Pending proposals grouped by the deal they would change. */
  const proposals = useMemo(() => {
    const m = new Map<number, { group: PendingGroup; items: Proposal[] }>();
    for (const g of pending) for (const p of g.items) {
      const id = dealOf(g, p);
      if (id == null) continue;
      const cur = m.get(id) ?? { group: g, items: [] };
      if (cur.group.thread_id === g.thread_id) cur.items.push(p);
      m.set(id, cur);
    }
    return m;
  }, [pending]);
  const changeCount = [...proposals.entries()].reduce((n, [id, p]) => n + changesFor(p.items, byId.get(id)).length, 0);

  const filter = VIEWS.find((v) => v[0] === view) ?? VIEWS[0];
  const shown = (rows ?? []).filter((r) => filter[2](r, user?.id)).filter((r) => !q || `${r.name} ${r.contact_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const current = (selected && byId.get(selected)) || shown.find((r) => proposals.has(r.id)) || shown[0];
  const open = (rows ?? []).filter(isOpen);
  const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.amount_micros / 1e6, 0);
  const quarter = Math.floor(new Date().getMonth() / 3);
  const wonQuarter = (rows ?? []).filter((r) => r.stage === "WON" && r.stage_changed_at && new Date(r.stage_changed_at).getFullYear() === new Date().getFullYear() && Math.floor(new Date(r.stage_changed_at).getMonth() / 3) === quarter);

  const firstPending = () => {
    const id = (rows ?? []).find((r) => proposals.has(r.id))?.id;
    if (id) { if (!shown.some((r) => r.id === id)) setView("open"); select(id); }
  };

  return (
    <div className="deals">
      <section className="card deals-main" aria-labelledby="deals-title">
        <div className="deals-head">
          <div>
            <h1 id="deals-title">{t("Deals")}</h1>
            {rows && <p><b>{tn(open.length, "1 open", "{n} open")}</b> {t("worth")} <b>{ils(sum(open))}</b></p>}
          </div>
          <span className="sp" />
          <div className="seg" role="group" aria-label={t("Layout")}><Link className="on" to="/deals" aria-current="page">{t("Table")}</Link><Link to="/pipeline">{t("Board")}</Link></div>
          {q === null
            ? <button className="icon" aria-label={t("Filter by name")} title={t("Filter by name")} onClick={() => setQ("")}><MagnifyingGlass aria-hidden="true" /></button>
            : <input className="filter" type="search" autoFocus aria-label={t("Filter by name")} placeholder={t("Filter by name")} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setQ(null)} onKeyDown={(e) => e.key === "Escape" && setQ(null)} />}
          <button className="primary" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t("New deal")}</button>
        </div>

        <div className="views" role="group" aria-label={t("Saved views")}>
          {VIEWS.map(([key, label, f]) => (
            <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{t(label)}{rows && <em>{rows.filter((r) => f(r, user?.id)).length}</em>}</button>
          ))}
          {changeCount > 0 && <button className="pend" onClick={firstPending}>{tn(changeCount, "1 change to review", "{n} changes to review")}</button>}
        </div>

        {failed ? <LoadError what={t("deals")} onRetry={load} /> : !rows ? <Skeleton lines={10} /> : shown.length === 0 ? (
          <Empty><b>{q ? t("Nothing matches this filter.") : t("No deals in this view.")}</b>{view !== "open" && <button onClick={() => setView("open")}>{t("Show open deals")}</button>}</Empty>
        ) : (
          <div className="deals-table">
            <table>
              <thead>
                <tr><th>{t("Deal")}</th><th>{t("Stage")}</th><th className="num">{t("Amount")}</th><th>{t("Closes")}</th><th>{t("Next step")}</th><th>{t("Last touch")}</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const prop = proposals.get(r.id);
                  const field = (f: string) => prop?.items.flatMap((p) => (p.name === "update_record" ? p.input.fields ?? [] : [])).find((x: any) => x.field === f)?.value;
                  const task = prop?.items.find((p) => p.name === "create_task");
                  const [st, amt, close] = [field("stage"), field("amount"), field("close_date")];
                  const late = isOpen(r) && r.close_date && new Date(r.close_date).getTime() < Date.now() - DAY;
                  const quiet = isOpen(r) && daysSince(r.last_touch) > QUIET_DAYS;
                  return (
                    <tr key={r.id} className={current?.id === r.id ? "sel" : ""} aria-current={current?.id === r.id || undefined} tabIndex={0}
                      onClick={() => select(r.id)} onKeyDown={(e) => { if (e.key === "Enter") nav(`/deal/${r.id}`); if (e.key === " ") { e.preventDefault(); select(r.id); } }}>
                      <td><div className="deal-name"><Link to={`/deal/${r.id}`} onClick={(e) => e.stopPropagation()} tabIndex={-1}>{shortName(r)}</Link><span>{r.company_name ?? t("No company")}</span></div></td>
                      <td>{st ? <span className="new cap"><s>{tv(r.stage)}</s><b>{tv(st)}</b></span> : <Stage stage={r.stage} />}</td>
                      <td className="num fig">{amt ? <span className="new"><s>{ils(r.amount_micros / 1e6)}</s><b>{ils(Number(amt))}</b></span> : ils(r.amount_micros / 1e6)}</td>
                      <td className={late && !close ? "late" : ""}>{close ? <span className="new"><s>{day(r.close_date)}</s><b>{day(close)}</b></span> : day(r.close_date) || <span className="quiet">{t("Not set")}</span>}</td>
                      <td>{task ? <span className="new"><b>{task.input.title}</b></span> : r.next_step ? r.next_step.title : <span className="quiet">{t("None")}</span>}</td>
                      <td className={quiet ? "late" : ""}>{touch(r.last_touch)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows && (
          <div className="sum" aria-label={t("Totals for this view")}>
            <span>{t("Total")}<b className="fig">{ils(sum(shown))}</b></span>
            <span>{t("Weighted")}<b className="fig">{ils(shown.filter(isOpen).reduce((s, r) => s + (r.amount_micros / 1e6) * r.win_probability / 100, 0))}</b></span>
            <span>{t("Won this quarter")}<b className="fig">{ils(sum(wonQuarter))}</b></span>
          </div>
        )}
      </section>

      <div className="side-col">
        {current && (proposals.has(current.id)
          ? <Approval key={proposals.get(current.id)!.group.thread_id} row={current} group={proposals.get(current.id)!.group} items={proposals.get(current.id)!.items} onDone={() => { void reloadPending(); void load(); }} />
          : <LogCall key={current.id} row={current} onDrafted={() => void reloadPending()} />)}
        {current && <Info row={current} owner={refName("user", current.owner_id)} />}
      </div>
      {creating && <RecordForm type="deal" onClose={() => setCreating(false)} onSaved={(r) => { setCreating(false); void load().then(() => select(r.id)); }} />}
    </div>
  );
}

/** The teal card: what the assistant took from the notes, each line ticked by default. */
function Approval({ row, group, items, onDone }: { row: Row; group: PendingGroup; items: Proposal[]; onDone: () => void }) {
  const changes = changesFor(items, row);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [who, words] = speaker(group.said);
  const chosen = changes.filter((c) => !off.has(c.key)).length;
  const at = group.at ? new Date(group.at + (group.at.endsWith("Z") || group.at.includes("+") ? "" : "Z")).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";

  async function resolve(apply: boolean) {
    setBusy(true); setError(null);
    const decisions: Record<string, boolean> = {};
    // the server wants an answer for every proposal in the conversation; anything not shown here is declined with it
    for (const p of group.items) decisions[p.tool_use_id] = false;
    if (apply) for (const c of changes) {
      decisions[c.key] = !off.has(c.key);
      if (c.field) decisions[c.tool] = decisions[c.tool] || !off.has(c.key);
    }
    try {
      await api(`/ai/threads/${group.thread_id}/resolve`, { body: { decisions } });
      window.dispatchEvent(new Event("redline:changed"));
      onDone();
    } catch (e: any) { setError(e.message); setBusy(false); }
  }

  return (
    <section className="prop" aria-labelledby="prop-title">
      <div className="ph">
        <div>
          <h2 id="prop-title">{who ? tn(changes.length, "1 change from your call with {who}", "{n} changes from your call with {who}", { who }) : tn(changes.length, "1 change from your notes", "{n} changes from your notes")}</h2>
          <p>{shortName(row)} · {row.company_name ?? t("No company")}{at && ` · ${at}`}</p>
        </div>
        <button className="x" aria-label={t("Discard these changes")} title={t("Discard")} disabled={busy} onClick={() => resolve(false)}><X aria-hidden="true" /></button>
      </div>
      {words && <p className="quote">“{words.length > 220 ? `${words.slice(0, 220)}…` : words}”</p>}
      <div className="chg" role="group" aria-label={t("Changes to apply")}>
        {changes.map((c) => (
          <label key={c.key} className="chg-row">
            <input type="checkbox" checked={!off.has(c.key)} onChange={() => { const n = new Set(off); n.has(c.key) ? n.delete(c.key) : n.add(c.key); setOff(n); }} />
            <span className="chk" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="m2.5 6.2 2.3 2.3 4.7-5" /></svg></span>
            <span className="k">{c.label}</span>
            <span className="v">{c.from && <s>{c.from}</s>}<b>{c.to}</b>{c.extra && `, ${c.extra}`}</span>
          </label>
        ))}
      </div>
      {error && <div className="error" role="alert">{t("That didn't go through: {e}", { e: error })}</div>}
      <div className="acts">
        <button className="apply" disabled={busy || chosen === 0} onClick={() => resolve(true)}>{tn(chosen, "Apply 1 change", "Apply {n} changes")}</button>
        <button className="disc" disabled={busy} onClick={() => resolve(false)}>{t("Discard")}</button>
      </div>
    </section>
  );
}

/** With nothing waiting: paste what happened on the call and the assistant drafts the updates. */
function LogCall({ row, onDrafted }: { row: Row; onDrafted: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function draft() {
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      const th = await api<{ id: number }>("/ai/threads", { body: { target_type: "deal", target_id: row.id } });
      await api(`/ai/threads/${th.id}/messages`, { body: { text } });
      onDrafted();
    } catch (e: any) { setError(e.message); setBusy(false); }
  }
  return (
    <form className="card log" onSubmit={(e) => { e.preventDefault(); void draft(); }}>
      <h2>{t("Log a call")}</h2>
      <p>{t("Paste your notes from a call about {x}. The assistant drafts the updates; nothing changes until you approve.", { x: shortName(row) })}</p>
      <textarea aria-label={t("Call notes")} placeholder={t("Call with Adi: budget approved at 240K, wants the proposal by Thursday…")} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void draft(); }} />
      {error && <div className="error" role="alert">{t("That didn't go through: {e}", { e: error })}</div>}
      <div className="row">
        <span className="faint small">{busy ? t("Reading your notes…") : ""}</span>
        <button className="primary" disabled={busy || !text.trim()}>{t("Draft changes")}</button>
      </div>
    </form>
  );
}

function describe(a: Activity): string {
  const [obj, verb] = a.name.replace("linked-", "").split(".");
  if (a.linked) return `${t(obj === "task" ? "Task" : obj === "note" ? "Note" : obj)}: \u2068${a.linked.name}\u2069`;
  const diff = a.properties?.diff ?? {};
  if (diff.stage) return t("Stage moved to {s}", { s: tv(diff.stage.after) });
  if (diff.amount_micros) return t("Amount set to {x}", { x: money(diff.amount_micros.after) });
  if (verb === "created") return t("Deal created");
  return t("Updated {f}", { f: Object.keys(diff).map((k) => k.replace(/_micros$|_id$/, "").replace(/_/g, " ")).join(", ") || t("details") });
}

/** Who the deal is with, who owns it, and the last few things that happened. */
function Info({ row, owner }: { row: Row; owner: string }) {
  const [acts, setActs] = useState<Activity[] | null>(null);
  useEffect(() => {
    setActs(null);
    const get = () => api<Activity[]>(`/deals/${row.id}/timeline`).then(setActs).catch(() => setActs([]));
    void get();
    window.addEventListener("redline:changed", get);
    return () => window.removeEventListener("redline:changed", get);
  }, [row.id]);
  return (
    <section className="card info" aria-labelledby="info-title">
      <h3 id="info-title"><span>{row.contact_name ?? row.company_name ?? shortName(row)}</span><Link to={`/deal/${row.id}`}>{t("Open deal")}<ArrowUpRight className="flip" aria-hidden="true" /></Link></h3>
      <dl className="kv">
        <dt>{t("Company")}</dt><dd>{row.company_id ? <Link to={`/company/${row.company_id}`}>{row.company_name}</Link> : t("None")}</dd>
        <dt>{t("Owner")}</dt><dd>{owner}</dd>
        <dt>{t("Win chance")}</dt><dd>{row.win_probability}%</dd>
        <dt>{t("Stage")}</dt><dd><Stage stage={row.stage} /></dd>
      </dl>
      <ol className="mini-tl" aria-label={t("Recent activity")}>
        {!acts ? <li><span className="faint">{t("Loading…")}</span></li> : acts.length === 0 ? <li><span className="faint">{t("Nothing has happened to this record yet.")}</span></li> : acts.slice(0, 4).map((a) => (
          <li key={a.id}><i className={a.actor_source === "ai" ? "c" : ""} aria-hidden="true" /><span>{describe(a)}</span><time dateTime={a.happens_at}>{ago(a.happens_at)}</time></li>
        ))}
      </ol>
    </section>
  );
}
