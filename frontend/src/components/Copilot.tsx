import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type RecordType } from "../api";
import { t } from "../i18n";

type Pending = { tool_use_id: string; name: string; summary: string; status: string; record?: { type: string; id: number; name: string }; error?: string };
type Item =
  | { role: "user" | "assistant"; text: string }
  | { role: "tools"; items: string[] }
  | { role: "actions"; items: Pending[] };
type Thread = { id: number; title: string; display: Item[]; pending: Pending[]; target: { type: string; id: number } | null };

const TOOL_LABEL: Record<string, string> = {
  search_records: "searched the CRM", list_records: "listed records", get_record: "read a record", pipeline_overview: "checked the pipeline",
};
const STATUS_ICON: Record<string, string> = { success: "✓", failed: "✗", skipped: "–", pending: "…" };

/** Renders text with [Label](/type/id) links and line breaks. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(\/[a-z]+\/\d+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[([^\]]+)\]\((\/[a-z]+\/\d+)\)$/);
        if (m) return <Link key={i} to={m[2]}>{m[1]}</Link>;
        return <Fragment key={i}>{p.split("\n").map((line, j) => <Fragment key={j}>{j > 0 && <br />}{line.replace(/\*\*(.+?)\*\*/g, "$1")}</Fragment>)}</Fragment>;
      })}
    </>
  );
}

const PROMPTS_GLOBAL = [
  "What should I focus on today?",
  "Which deals are at risk and what should I do about each?",
  "Summarize the pipeline by stage and owner",
];
const PROMPTS_RECORD = [
  "Summarize this and suggest the next step",
  "Draft a follow-up email",
  "Log these call notes: ",
];

export default function Copilot({ target, onClose, onChanged }: { target?: { type: RecordType; id: number; name: string }; onClose: () => void; onChanged?: () => void }) {
  const [status, setStatus] = useState<{ enabled: boolean; mode: string; model: string } | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { api("/ai/status").then(setStatus); }, []);
  useEffect(() => { setThread(null); }, [target?.type, target?.id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [thread, busy]);
  useEffect(() => { if (thread) setDecisions(Object.fromEntries(thread.pending.map((p) => [p.tool_use_id, true]))); }, [thread?.pending.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureThread(): Promise<Thread> {
    if (thread) return thread;
    const t = await api<Thread>("/ai/threads", { body: target ? { target_type: target.type, target_id: target.id } : {} });
    setThread(t);
    return t;
  }

  async function send(msg: string) {
    if (!msg.trim() || busy) return;
    setBusy(true); setError(null); setText("");
    try {
      const t = await ensureThread();
      setThread({ ...t, display: [...t.display, { role: "user", text: msg }] });
      setThread(await api<Thread>(`/ai/threads/${t.id}/messages`, { body: { text: msg } }));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function resolve(choice: Record<string, boolean> = decisions) {
    if (!thread) return;
    setBusy(true); setError(null);
    try {
      setThread(await api<Thread>(`/ai/threads/${thread.id}/resolve`, { body: { decisions: choice } }));
      window.dispatchEvent(new Event("kesher:changed"));
      onChanged?.();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const prompts = target ? PROMPTS_RECORD : PROMPTS_GLOBAL;

  return (
    <aside className="copilot" aria-label={t("✦ Copilot")}>
      <div className="copilot-head">
        <div><b>{t("✦ Copilot")}</b> {status?.mode === "demo" && <span className="badge tone-amber" title={t("Demo mode: no API key is set, so an offline stand-in answers from the CRM data. Set ANTHROPIC_API_KEY to use Claude Opus 5.5.")}>{t("Demo AI")}</span>}{target && <div className="muted small">{t("about {x}", { x: target.name })}</div>}</div>
        <div className="row">
          {thread && <button className="ghost small" onClick={() => setThread(null)}>{t("New chat")}</button>}
          <button className="ghost icon" aria-label={t("Close")} onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="copilot-body" aria-live="polite" aria-busy={busy}>
        {status && !status.enabled && (
          <div className="ai-off">
            <b>{t("AI is not configured.")}</b>
            <p className="muted small">{t("Set ANTHROPIC_API_KEY on the server and restart. Every change Copilot proposes waits for your approval.")}</p>
          </div>
        )}
        {!thread?.display.length && status?.enabled && (
          <div className="copilot-empty">
            <p className="muted">{t("Ask anything about your CRM, or paste call notes and I'll propose the updates. Nothing changes until you approve it.")}</p>
            {prompts.map((p) => t(p)).map((p) => <button key={p} className="chip-btn" onClick={() => (p.endsWith(": ") ? setText(p) : send(p))}>{p}</button>)}
          </div>
        )}
        {thread?.display.map((d, i) => {
          if (d.role === "user") return <div key={i} className="bubble me">{d.text}</div>;
          if (d.role === "assistant") return <div key={i} className="bubble ai"><Rich text={d.text} /></div>;
          if (d.role === "tools") return <div key={i} className="tool-line">⌕ {[...new Set(d.items.map((x) => t(TOOL_LABEL[x] ?? x)))].join(" · ")}</div>;
          if (d.role !== "actions") return null;
          return (
            <div key={i} className="action-log">
              {d.items.map((a) => (
                <div key={a.tool_use_id} className={`act-${a.status}`}>
                  {STATUS_ICON[a.status]} {a.summary}{a.record && <> · <Link to={`/${a.record.type}/${a.record.id}`}>{t("open")}</Link></>}
                  {a.error && <div className="small">{a.error}</div>}
                </div>
              ))}
            </div>
          );
        })}
        {thread && thread.pending.length > 0 && (
          <div className="approval">
            <div className="small strong">{t("Copilot wants to make {n} change(s):", { n: thread.pending.length })}</div>
            {thread.pending.map((p) => (
              <label key={p.tool_use_id} className="approval-item">
                <input type="checkbox" checked={!!decisions[p.tool_use_id]} onChange={(e) => setDecisions({ ...decisions, [p.tool_use_id]: e.target.checked })} />
                <span>{p.summary}</span>
              </label>
            ))}
            <div className="row">
              <button className="primary" disabled={busy} onClick={() => resolve()}>{t("Apply selected")}</button>
              <button className="ghost" disabled={busy} onClick={() => resolve({})}>{t("Reject all")}</button>
            </div>
          </div>
        )}
        {busy && <div className="bubble ai thinking" role="status" aria-label={t("Thinking…")}><span /><span /><span /></div>}
        {error && <div className="error" role="alert">{error}</div>}
        <div ref={end} />
      </div>
      <form className="copilot-input" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea
          aria-label={t("Ask, or paste call notes…")}
          rows={text.length > 80 ? 5 : 2} value={text} placeholder={thread?.pending.length ? t("Approve or reject the changes above first") : t("Ask, or paste call notes…")}
          disabled={!status?.enabled || !!thread?.pending.length}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
        />
        <button className="primary" disabled={!status?.enabled || busy || !text.trim()}>{t("Send")}</button>
      </form>
    </aside>
  );
}
