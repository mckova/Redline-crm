import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtDate, money, type RecordType } from "../api";
import type { Field } from "../fields";
import { useStore } from "../store";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="ghost" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const StageBadge = ({ stage }: { stage: string }) => <span className={`badge stage-${stage}`}>{stage.toLowerCase()}</span>;
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
      return field.key === "stage" ? <StageBadge stage={v} /> : <Badge>{String(v).toLowerCase().replace("_", " ")}</Badge>;
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
