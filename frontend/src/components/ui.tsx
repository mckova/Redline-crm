import { useEffect, useId, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Link } from "react-router-dom";
import { X } from "@phosphor-icons/react";
import { fmtDate, money, type RecordType } from "../api";
import type { Field } from "../fields";
import { useStore } from "../store";
import { t, tv } from "../i18n";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, wide, role = "dialog" }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; role?: "dialog" | "alertdialog" }) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>(`.modal-body ${FOCUSABLE}`) ?? box.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); trigger?.focus?.({ preventScroll: true }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div ref={box} role={role} aria-modal="true" aria-labelledby={titleId} className={`modal ${wide ? "wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2 id={titleId}>{title}</h2><button className="ghost icon" aria-label={t("Close")} onClick={onClose}><X aria-hidden="true" /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Accessible replacement for window.confirm, for destructive actions. */
export function confirmDialog(message: string, confirmLabel = t("Delete")): Promise<boolean> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise((resolve) => {
    const done = (v: boolean) => { root.unmount(); host.remove(); resolve(v); };
    root.render(
      <Modal title={message} role="alertdialog" onClose={() => done(false)}>
        <p className="soft">{t("This can't be undone from the app.")}</p>
        <div className="actions">
          <button className="ghost" onClick={() => done(false)}>{t("Keep it")}</button>
          <button className="danger solid" onClick={() => done(true)}>{confirmLabel}</button>
        </div>
      </Modal>,
    );
  });
}

/** Loading placeholder shaped like the rows it stands in for. */
export function Skeleton({ lines = 3, label }: { lines?: number; label?: string }) {
  return <div className="skeleton" role="status" aria-label={label ?? t("Loading…")}>{Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${92 - (i % 4) * 14}%` }} />)}</div>;
}

/** A failed load says what failed and offers the retry; it is never shown as an empty state. */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <p>{t("Couldn't load {x}. The server didn't answer.", { x: what })}</p>
      <button onClick={onRetry}>{t("Try again")}</button>
    </div>
  );
}

/** The stage as a glass pill with a hairline. Won reads teal, lost reads quiet. */
export function Stage({ stage }: { stage: string }) {
  return <span className={`stage ${stage}`}>{tv(stage)}</span>;
}

export function Grade({ grade, score }: { grade: string; score: number }) {
  return <span className={`grade ${grade}`} aria-label={t("Grade {g}, score {n} of 100", { g: grade, n: score })}><b aria-hidden="true">{grade}</b><span className="fig" aria-hidden="true">{score}</span></span>;
}

export const Tag = ({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" | "loss" }) => <span className={`tag ${tone ?? ""}`}>{children}</span>;

export const Unset = () => <span className="unset" aria-label={t("Not set")}>-</span>;

export function FieldValue({ field, record }: { field: Field; record: Record<string, any> }) {
  const { refName } = useStore();
  const v = record[field.key];
  if (v == null || v === "") return <Unset />;
  switch (field.kind) {
    case "money": return <span className="fig">{money(v, record.currency)}</span>;
    case "date": return <span className="tnum">{fmtDate(v)}</span>;
    case "number": return <span className="fig">{Number(v).toLocaleString()}</span>;
    case "ref":
      if (field.ref === "user") return <>{refName("user", v)}</>;
      return <Link to={`/${field.ref}/${v}`} onClick={(e) => e.stopPropagation()}>{refName(field.ref as RecordType, v)}</Link>;
    case "select":
      return field.key === "stage" ? <Stage stage={v} /> : <span className="cap">{tv(String(v))}</span>;
    case "email": return <a href={`mailto:${v}`} onClick={(e) => e.stopPropagation()}>{v}</a>;
    case "textarea": return <span className="clip">{v}</span>;
    default: return <>{String(v)}</>;
  }
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Bar({ value, max, quiet }: { value: number; max: number; quiet?: boolean }) {
  return <div className="bar" aria-hidden="true"><div className={`bar-fill ${quiet ? "quiet" : ""}`} style={{ width: `${max ? Math.max(1, (value / max) * 100) : 0}%` }} /></div>;
}

/** Small-type attribution for anything the assistant wrote. */
export function Provenance({ model, when }: { model: string; when?: string }) {
  const who = model.startsWith("demo") ? t("Drafted by the offline demo assistant") : t("Drafted by {m}", { m: model });
  return <span className="provenance">{who}{when && <> · {when}</>}</span>;
}
