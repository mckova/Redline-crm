import { useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowsLeftRight, Circle, PencilSimple, Plus, Trash, type IconProps } from "@phosphor-icons/react";
import { ago, api, PLURAL, type RecordType } from "../api";
import { isRTL, t } from "../i18n";
import { LoadError, Skeleton } from "./ui";

type Activity = {
  id: number; name: string; happens_at: string; actor: string; actor_source: string;
  properties: { diff?: Record<string, { before: any; after: any }> };
  linked: { type: RecordType; id: number; name: string } | null;
};

const ICON: Record<string, ComponentType<IconProps>> = { created: Plus, updated: PencilSimple, deleted: Trash, converted: ArrowsLeftRight };
const VIA: Record<string, string> = { ai: "via assistant", automation: "via rule", import: "via import" };
const tField = (k: string) => t(k.charAt(0).toUpperCase() + k.slice(1));
const pretty = (k: string) => k.replace(/_micros$/, "").replace(/_id$/, "").replace(/_/g, " ");
const val = (k: string, v: any) =>
  v == null || v === "" ? t("empty") : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : k.endsWith("_micros") ? `₪${(v / 1e6).toLocaleString()}` : String(v).slice(0, 40);

/** Who changed what, with a field-level diff. Changes the assistant made carry its ring. */
export default function Timeline({ type, id, refreshKey }: { type: RecordType; id: number; refreshKey?: number }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); api<Activity[]>(`/${PLURAL[type]}/${id}/timeline`).then(setItems).catch(() => setFailed(true)); };
  useEffect(load, [type, id, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return <LoadError what={t("the timeline")} onRetry={load} />;
  if (!items) return <Skeleton lines={6} />;
  if (!items.length) return <p className="empty-line">{t("Nothing has happened to this record yet.")}</p>;
  return (
    <ol className="timeline">
      {items.map((a) => {
        const [obj, verb] = a.name.replace("linked-", "").split(".");
        const diff = Object.entries(a.properties?.diff ?? {});
        const Icon = ICON[verb] ?? Circle;
        return (
          <li key={a.id} className={`tl ${a.actor_source === "ai" ? "tl-ai" : ""}`}>
            <span className="tl-icon" aria-hidden="true"><Icon weight="bold" /></span>
            <div>
              <div className="tl-head">
                <b>{a.actor}</b>{" "}
                {a.linked ? (
                  <>{t(verb)} {t(obj)} <Link to={`/${a.linked.type}/${a.linked.id}`}>{a.linked.name}</Link></>
                ) : (
                  <>{isRTL ? `${t(verb)} ${t(obj)}` : `${verb} this ${obj}`}</>
                )}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {VIA[a.actor_source] && <span className="via">{t(VIA[a.actor_source])}</span>}
                <span className="when">{ago(a.happens_at)}</span>
              </div>
              {diff.length > 0 && (
                <ul className="diff">
                  {diff.map(([k, d]) => (
                    <li key={k}><span className="faint">{tField(pretty(k))}</span> <s>{val(k, d.before)}</s><ArrowRight className="flip" aria-label={t("to")} /><b>{val(k, d.after)}</b></li>
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
