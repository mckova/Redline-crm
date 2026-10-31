import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ago, api, PLURAL, type RecordType } from "../api";
import { isRTL, t } from "../i18n";

type Activity = {
  id: number; name: string; happens_at: string; actor: string; actor_source: string;
  properties: { diff?: Record<string, { before: any; after: any }> };
  linked: { type: RecordType; id: number; name: string } | null;
};

const ICON: Record<string, string> = { created: "✚", updated: "✎", deleted: "🗑", converted: "⇄" };
const tField = (k: string) => t(k.charAt(0).toUpperCase() + k.slice(1));
const pretty = (k: string) => k.replace(/_micros$/, "").replace(/_id$/, "").replace(/_/g, " ");
const val = (k: string, v: any) =>
  v == null || v === "" ? t("empty") : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : k.endsWith("_micros") ? `₪${(v / 1e6).toLocaleString()}` : String(v).slice(0, 40);

export default function Timeline({ type, id, refreshKey }: { type: RecordType; id: number; refreshKey?: number }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => { api<Activity[]>(`/${PLURAL[type]}/${id}/timeline`).then(setItems); }, [type, id, refreshKey]);
  if (!items) return <div className="muted">{t("Loading…")}</div>;
  if (!items.length) return <div className="muted">{t("No activity yet")}</div>;
  return (
    <ol className="timeline">
      {items.map((a) => {
        const [obj, verb] = a.name.replace("linked-", "").split(".");
        const diff = Object.entries(a.properties?.diff ?? {});
        return (
          <li key={a.id} className={`tl tl-${verb}`}>
            <span className="tl-icon">{ICON[verb] ?? "•"}</span>
            <div className="tl-body">
              <div>
                <b>{a.actor}</b>{a.actor_source === "automation" && <span className="badge tone-violet">{t("⚡ automation")}</span>}{a.actor_source === "ai" && <span className="badge tone-ai">✦ AI</span>}{" "}
                {a.linked ? (
                  <>{t(verb)} {t(obj)} <Link to={`/${a.linked.type}/${a.linked.id}`}>{a.linked.name}</Link></>
                ) : (
                  <>{isRTL ? `${t(verb)} ${t(obj)}` : `${verb} this ${obj}`}</>
                )}
                <span className="muted small"> · {ago(a.happens_at)}</span>
              </div>
              {diff.length > 0 && (
                <ul className="diff">
                  {diff.map(([k, d]) => (
                    <li key={k}><span className="muted">{tField(pretty(k))}:</span> <s>{val(k, d.before)}</s> → <b>{val(k, d.after)}</b></li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
