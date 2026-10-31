import { useEffect, useId, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Link } from "react-router-dom";
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
        <div className="modal-head"><h2 id={titleId}>{title}</h2><button className="ghost icon" aria-label={t("Close")} onClick={onClose}>✕</button></div>
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
        <p className="muted">{t("This can't be undone from the app.")}</p>
        <div className="actions">
          <button className="ghost" onClick={() => done(false)}>{t("Cancel")}</button>
          <button className="danger solid" onClick={() => done(true)}>{confirmLabel}</button>
        </div>
      </Modal>,
    );
  });
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="skeleton" aria-busy="true" aria-label={t("Loading…")}>{Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${92 - i * 14}%` }} />)}</div>;
}

export const StageBadge = ({ stage }: { stage: string }) => <span className={`badge stage-${stage}`}>{tv(stage)}</span>;
export const Badge = ({ children, tone = "gray" }: { children: ReactNode; tone?: string }) => <span className={`badge tone-${tone}`}>{children}</span>;

export function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const tone = { A: "green", B: "blue", C: "amber", D: "gray" }[grade] ?? "gray";
  return <span className={`badge tone-${tone}`} title={`score ${score}/100`}>{grade} · {score}</span>;
}

export function FieldValue({ field, record }: { field: Field; record: Record<string, any> }) {
  const { refName } = useStore();
  const v = record[field.key];
  if (v == null || v === "") return <span className="muted">—</span>;
  switch (field.kind) {
    case "money": return <>{money(v, record.currency)}</>;
    case "date": return <>{fmtDate(v)}</>;
    case "ref":
      if (field.ref === "user") return <>{refName("user", v)}</>;
      return <Link to={`/${field.ref}/${v}`} onClick={(e) => e.stopPropagation()}>{refName(field.ref as RecordType, v)}</Link>;
    case "select":
      return field.key === "stage" ? <StageBadge stage={v} /> : <Badge>{tv(String(v))}</Badge>;
    case "email": return <a href={`mailto:${v}`} onClick={(e) => e.stopPropagation()}>{v}</a>;
    case "textarea": return <span className="clip">{v}</span>;
    default: return <>{String(v)}</>;
  }
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Bar({ value, max, tone = "indigo" }: { value: number; max: number; tone?: string }) {
  return <div className="bar"><div className={`bar-fill fill-${tone}`} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>;
}
