import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChatCircle, Desktop, MagnifyingGlass, Moon, SignOut, Sun, Translate, type IconProps } from "@phosphor-icons/react";
import { api, auth, type RecordType } from "./api";
import Assistant from "./components/Assistant";
import SearchBar from "./components/SearchBar";
import Automations from "./pages/Automations";
import Dashboard from "./pages/Dashboard";
import Deals from "./pages/Deals";
import Landing from "./pages/Landing";
import Pipeline from "./pages/Pipeline";
import RecordDetail from "./pages/RecordDetail";
import RecordList from "./pages/RecordList";
import { useStore } from "./store";
import { lang, setLang, t, tn } from "./i18n";
import { setTheme, theme, type Theme } from "./theme";

const NAV: [string, string][] = [["/", "Today"], ["/deals", "Deals"], ["/leads", "Leads"], ["/companies", "Companies"], ["/contacts", "People"], ["/tasks", "Tasks"], ["/automations", "Rules"]];
const THEMES: [Theme, ComponentType<IconProps>, string][] = [["light", Sun, "Light theme"], ["dark", Moon, "Dark theme"], ["system", Desktop, "Match the system"]];
const TYPES: [string, RecordType][] = [["companies", "company"], ["contacts", "contact"], ["leads", "lead"], ["tasks", "task"], ["notes", "note"]];
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** A popover that closes on Escape and on any click outside it. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);
  return { open, setOpen, ref };
}

export default function App() {
  const { user, setUser, assistant, openAssistant, closeAssistant, pending } = useStore();
  const [checking, setChecking] = useState(!!auth.token);
  const [mode, setMode] = useState<Theme>(theme());
  const [searching, setSearching] = useState(false);
  const me = usePopover();
  const bell = usePopover();
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    if (auth.token) api("/auth/me").then(setUser).catch(() => auth.set(null)).finally(() => setChecking(false));
    const out = () => setUser(null);
    window.addEventListener("redline:logout", out);
    return () => window.removeEventListener("redline:logout", out);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearching(true); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (checking) return null;
  if (!user) return <Landing />;

  const waiting = pending.reduce((n, g) => n + g.items.length, 0);
  const dealsActive = loc.pathname === "/pipeline" || loc.pathname.startsWith("/deal");

  return (
    <div className={`app ${assistant.open ? "with-assistant" : ""}`}>
      <header className="top">
        <Link to="/" className="logo" aria-label={t("Redline, today")}><i aria-hidden="true" /></Link>
        <span className="brand" aria-hidden="true">Redline</span>
        <nav className="nav" aria-label={t("Main")}>
          {NAV.map(([to, name]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive || (to === "/deals" && dealsActive) ? "active" : "")}>{t(name)}</NavLink>
          ))}
        </nav>
        <span className="sp" />
        <button className="circ" aria-label={t("Search records")} title={t("Search")} onClick={() => setSearching(true)}><MagnifyingGlass aria-hidden="true" /></button>
        <div style={{ position: "relative" }} ref={bell.ref}>
          <button className="circ" aria-label={waiting ? tn(waiting, "1 change waiting for review", "{n} changes waiting for review") : t("Nothing waiting for review")} aria-expanded={bell.open} onClick={() => bell.setOpen(!bell.open)}>
            <Bell aria-hidden="true" />{waiting > 0 && <span className="badge" />}
          </button>
          {bell.open && (
            <div className="menu card" role="menu" style={{ inlineSize: 300 }}>
              <div className="menu-who"><b>{t("Changes to review")}</b><span className="faint small">{waiting ? t("The assistant drafted these from your notes.") : t("Nothing is waiting. Paste call notes on a deal and the assistant drafts the updates.")}</span></div>
              {pending.map((g) => (
                <button key={g.thread_id} role="menuitem" onClick={() => { bell.setOpen(false); nav(g.target?.type === "deal" ? `/deals?deal=${g.target.id}` : "/deals"); }}>
                  <span className="faint">{tn(g.items.length, "1 change", "{n} changes")}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{(g.said ?? "").slice(0, 40)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="circ" aria-label={t("Assistant")} title={t("Assistant")} aria-pressed={assistant.open} onClick={() => (assistant.open ? closeAssistant() : openAssistant())}><ChatCircle aria-hidden="true" /></button>
        <div style={{ position: "relative" }} ref={me.ref}>
          <button className="circ initials" aria-label={t("Account and settings")} aria-expanded={me.open} onClick={() => me.setOpen(!me.open)}>{initials(user.name)}</button>
          {me.open && (
            <div className="menu card" role="menu">
              <div className="menu-who"><b>{user.name}</b><span className="faint small">{t(user.role)} · {t("Sample workspace")}</span></div>
              <div className="menu-label">{t("Theme")}</div>
              <div className="seg" role="group" aria-label={t("Theme")}>
                {THEMES.map(([value, Icon, label]) => (
                  <button key={value} aria-label={t(label)} title={t(label)} aria-pressed={mode === value} onClick={() => { setTheme(value); setMode(value); }}><Icon aria-hidden="true" /></button>
                ))}
              </div>
              <button role="menuitem" lang={lang === "he" ? "en" : "he"} onClick={() => setLang(lang === "he" ? "en" : "he")}><Translate aria-hidden="true" />{lang === "he" ? "English" : "עברית"}</button>
              <button role="menuitem" onClick={() => { auth.set(null); setUser(null); }}><SignOut className="flip" aria-hidden="true" />{t("Sign out")}</button>
            </div>
          )}
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/automations" element={<Automations />} />
          {TYPES.map(([plural, type]) => <Route key={plural} path={`/${plural}`} element={<RecordList key={type} type={type} />} />)}
          {[...TYPES.map(([, type]) => type), "deal" as RecordType].map((type) => <Route key={type} path={`/${type}/:id`} element={<RecordDetail key={type} type={type} />} />)}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {searching && <SearchBar onClose={() => setSearching(false)} />}
      {assistant.open && <Assistant target={assistant.target ?? undefined} onClose={closeAssistant} />}
    </div>
  );
}
