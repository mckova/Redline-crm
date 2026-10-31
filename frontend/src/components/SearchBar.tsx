import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type Hit = { type: string; id: number; name: string };
const ICON: Record<string, string> = { company: "🏢", contact: "👤", lead: "🎯", deal: "💼", task: "☑", note: "📝" };

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => api<Hit[]>(`/search?q=${encodeURIComponent(q)}`).then((r) => { setHits(r); setSel(0); }), 150);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h: Hit) => { nav(`/${h.type}/${h.id}`); setQ(""); setOpen(false); ref.current?.blur(); };

  return (
    <div className="search">
      <input
        ref={ref} value={q} placeholder="Search everything…  ⌘K"
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
          if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
          if (e.key === "Enter" && hits[sel]) go(hits[sel]);
        }}
      />
      {open && hits.length > 0 && (
        <ul className="search-hits">
          {hits.map((h, i) => (
            <li key={`${h.type}${h.id}`} className={i === sel ? "sel" : ""} onMouseDown={() => go(h)}>
              <span>{ICON[h.type]}</span> {h.name} <span className="muted small">{h.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
