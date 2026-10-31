import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, MagnifyingGlass, Minus, PaperPlaneRight, X } from "@phosphor-icons/react";
import { api, type RecordType } from "../api";
import { t, tn } from "../i18n";

type Pending = { tool_use_id: string; name: string; summary: string; status: string; record?: { type: string; id: number; name: string }; error?: string };
type Item =
  | { role: "user" | "assistant"; text: string }
  | { role: "tools"; items: string[] }
  | { role: "actions"; items: Pending[] };
type Thread = { id: number; title: string; display: Item[]; pending: Pending[]; target: { type: string; id: number } | null };

const TOOL_LABEL: Record<string, string> = {
  search_records: "searched the CRM", list_records: "listed records", get_record: "read a record", pipeline_overview: "checked the pipeline",
};

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

/** The assistant: reads on its own, and every write waits in an approval list. */
export default function Assistant({ target, onClose, onChanged }: { target?: { type: RecordType; id: number; name: string }; onClose: () => void; onChanged?: () => void }) {
  const [status, setStatus] = useState<{ enabled: boolean; mode: string; model: string } | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { api("/ai/status").then(setStatus).catch(() => setStatus({ enabled: false, mode: "off", model: "" })); }, []);
  useEffect(() => { setThread(null); }, [target?.type, target?.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [thread, busy]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".overlay")) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  useEffect(() => { if (thread) setDecisions(Object.fromEntries(thread.pending.map((p) => [p.tool_use_id, true]))); }, [thread?.pending.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureThread(): Promise<Thread> {
    if (thread) return thread;
    const th = await api<Thread>("/ai/threads", { body: target ? { target_type: target.type, target_id: target.id } : {} });
    setThread(th);
    return th;
  }

  async function send(msg: string) {
    if (!msg.trim() || busy) return;
    setBusy(true); setError(null); setText("");
    try {
      const th = await ensureThread();
      setThread({ ...th, display: [...th.display, { role: "user", text: msg }] });
      setThread(await api<Thread>(`/ai/threads/${th.id}/messages`, { body: { text: msg } }));
      window.dispatchEvent(new Event("redline:proposed"));
    } catch (e: any) { setError(e.message); setText(msg); } finally { setBusy(false); }
  }

  async function resolve(choice: Record<string, boolean> = decisions) {
    if (!thread) return;
    setBusy(true); setError(null);
    try {
      setThread(await api<Thread>(`/ai/threads/${thread.id}/resolve`, { body: { decisions: choice } }));
      window.dispatchEvent(new Event("redline:changed"));
      onChanged?.();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const prompts = target ? PROMPTS_RECORD : PROMPTS_GLOBAL;
  const chosen = Object.values(decisions).filter(Boolean).length;

  return (
    <aside className="assistant" aria-labelledby="assistant-title">
      <div className="assistant-inner">
        <div className="assistant-head">
          <div>
            <b id="assistant-title">{t("Assistant")}</b>
            <div className="about">{target ? t("Working on {x}", { x: target.name }) : status?.mode === "demo" ? t("Offline demo: answers come from simple rules over this workspace") : status?.model}</div>
          </div>
          <div className="row">
            {thread && <button className="ghost small" onClick={() => setThread(null)}>{t("New conversation")}</button>}
            <button className="ghost icon" aria-label={t("Close the assistant")} onClick={onClose}><X aria-hidden="true" /></button>
          </div>
        </div>
        <div className="assistant-body" aria-live="polite" aria-busy={busy}>
          {status && !status.enabled && (
            <div className="ai-off">
              <b>{t("The assistant is switched off on this server.")}</b>
              <p className="small">{t("Set ANTHROPIC_API_KEY, or REDLINE_AI=demo for the offline demo, and restart.")}</p>
            </div>
          )}
          {!thread?.display.length && status?.enabled && (
            <>
              <p className="intro">{t("Ask about the pipeline, or paste notes from a call. I read records on my own; anything I'd change waits here for your approval.")}</p>
              <div className="prompts">
                {prompts.map((p) => t(p)).map((p) => (
                  <button key={p} onClick={() => (p.endsWith(": ") ? (setText(p), input.current?.focus()) : send(p))}><ArrowRight className="flip" aria-hidden="true" />{p}</button>
                ))}
              </div>
            </>
          )}
          {thread?.display.map((d, i) => {
            if (d.role === "user") return <div key={i} className="msg me">{d.text}</div>;
            if (d.role === "assistant") return <div key={i} className="msg ai"><Rich text={d.text} /></div>;
            if (d.role === "tools") return <div key={i} className="tool-line"><MagnifyingGlass aria-hidden="true" />{[...new Set(d.items.map((x) => t(TOOL_LABEL[x] ?? x)))].join(" · ")}</div>;
            if (d.role !== "actions") return null;
            return (
              <div key={i} className="action-log" aria-label={t("Applied changes")}>
                {d.items.map((a) => (
                  <div key={a.tool_use_id} className={`act-${a.status}`}>
                    {a.status === "success" ? <Check weight="bold" aria-label={t("done")} /> : a.status === "failed" ? <X weight="bold" aria-label={t("failed")} /> : <Minus aria-label={t("skipped")} />}
                    <span>{a.summary}</span>{a.record && <Link to={`/${a.record.type}/${a.record.id}`}>{t("open")}</Link>}
                    {a.error && <div className="small">{a.error}</div>}
                  </div>
                ))}
              </div>
            );
          })}
          {thread && thread.pending.length > 0 && (
            <div className="approval" role="group" aria-labelledby="approval-title">
              <div className="approval-head" id="approval-title">{tn(thread.pending.length, "Waiting for your approval: 1 change", "Waiting for your approval: {n} changes")}</div>
              <div className="approval-list">
                {thread.pending.map((p) => (
                  <label key={p.tool_use_id} className="approval-item">
                    <input type="checkbox" checked={!!decisions[p.tool_use_id]} onChange={(e) => setDecisions({ ...decisions, [p.tool_use_id]: e.target.checked })} />
                    <span>{p.summary}</span>
                  </label>
                ))}
              </div>
              <div className="row acts">
                <button className="apply" disabled={busy || chosen === 0} onClick={() => resolve()}>{t("Apply {n} selected", { n: chosen })}</button>
                <button className="disc" disabled={busy} onClick={() => resolve({})}>{t("Discard all")}</button>
              </div>
            </div>
          )}
          {busy && <div className="thinking" role="status" aria-label={t("Working…")}><span /><span /><span /></div>}
          {error && <div className="error" role="alert">{t("That didn't go through: {e}", { e: error })}</div>}
          <div ref={end} />
        </div>
        <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <textarea
            ref={input} aria-label={t("Message the assistant")}
            rows={text.length > 80 ? 5 : 2} value={text} placeholder={thread?.pending.length ? t("Approve or discard the changes above first") : t("Ask, or paste call notes")}
            disabled={!status?.enabled || !!thread?.pending.length}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
          />
          <button className="primary icon" aria-label={t("Send")} disabled={!status?.enabled || busy || !text.trim()}><PaperPlaneRight className="flip" aria-hidden="true" /></button>
        </form>
      </div>
    </aside>
  );
}
