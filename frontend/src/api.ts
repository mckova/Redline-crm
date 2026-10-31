import { locale, t } from "./i18n";
export type Rec = Record<string, any> & { id: number; type: string; display_name: string };
export type RecordType = "company" | "contact" | "lead" | "deal" | "task" | "note";

export const PLURAL: Record<RecordType, string> = {
  company: "companies", contact: "contacts", lead: "leads", deal: "deals", task: "tasks", note: "notes",
};

const TOKEN_KEY = "kesher.token";
export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set(token: string | null) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { auth.set(null); window.dispatchEvent(new Event("kesher:logout")); }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* empty */ }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const money = (micros: number | null | undefined, cur = "ILS") =>
  new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format((micros ?? 0) / 1e6);
export const compact = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const ago = (s: string) => {
  const d = (Date.now() - new Date(s + (s.endsWith("Z") ? "" : "Z")).getTime()) / 1000;
  if (d < 60) return t("just now");
  if (d < 3600) return t("{n}m ago", { n: Math.floor(d / 60) });
  if (d < 86400) return t("{n}h ago", { n: Math.floor(d / 3600) });
  return t("{n}d ago", { n: Math.floor(d / 86400) });
};
