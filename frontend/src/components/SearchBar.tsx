import { useEffect, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { AddressBook, Buildings, Funnel, Handshake, ListChecks, MagnifyingGlass, Note, type IconProps } from "@phosphor-icons/react";
import { api } from "../api";
import { t } from "../i18n";

type Hit = { type: string; id: number; name: string };
const ICON: Record<string, ComponentType<IconProps>> = { company: Buildings, contact: AddressBook, lead: Funnel, deal: Handshake, task: ListChecks, note: Note };
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** The search palette: opened from the round button in the top bar, or with ⌘K / Ctrl K. */
export default function SearchBar({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => { ref.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setHits(null); return; }
    const timer = setTimeout(() => api<Hit[]>(`/search?q=${encodeURIComponent(q)}`).then((r) => { setHits(r); setSel(0); }), 150);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (h: Hit) => { nav(`/${h.type}/${h.id}`); onClose(); };
  const show = hits !== null;

  return (
    <div className="palette-wrap" onMouseDown={onClose}>
    <div className="palette card" role="dialog" aria-modal="true" aria-label={t("Search records")} onMouseDown={(e) => e.stopPropagation()}>
    <div className="search">
      <MagnifyingGlass aria-hidden="true" />
      <input
        ref={ref} value={q} type="search" aria-label={t("Search records")} role="combobox" aria-expanded={show} aria-controls="search-hits" aria-autocomplete="list"
        aria-activedescendant={show && hits!.length ? `hit-${sel}` : undefined}
        placeholder={t("Search deals, people, companies")}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
          if (!hits) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter" && hits[sel]) go(hits[sel]);
        }}
      />
      <kbd aria-hidden="true">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
      {show && (
        <ul className="search-hits" id="search-hits" role="listbox" aria-label={t("Search results")}>
          {hits!.length === 0 && <li className="search-none" role="option" aria-selected="false" aria-disabled="true">{t("Nothing matches “{q}”.", { q })}</li>}
          {hits!.map((h, i) => {
            const Icon = ICON[h.type] ?? Note;
            return (
              <li key={`${h.type}${h.id}`} id={`hit-${i}`} role="option" aria-selected={i === sel} className={i === sel ? "sel" : ""} onMouseDown={() => go(h)}>
                <Icon aria-hidden="true" />{h.name}<span className="faint">{t(h.type)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
    </div>
    </div>
  );
}
