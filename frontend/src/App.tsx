import { useEffect, useState, type ComponentType } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AddressBook, Buildings, ChatCircleText, Desktop, FlowArrow, Funnel, Handshake, Kanban, ListChecks, Moon, Notepad, SignOut, Sun, type IconProps } from "@phosphor-icons/react";
import { api, auth, type RecordType } from "./api";
import Assistant from "./components/Assistant";
import SearchBar from "./components/SearchBar";
import Automations from "./pages/Automations";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Pipeline from "./pages/Pipeline";
import RecordDetail from "./pages/RecordDetail";
import RecordList from "./pages/RecordList";
import { useStore } from "./store";
import { lang, setLang, t } from "./i18n";
import { setTheme, theme, type Theme } from "./theme";

type NavItem = [string, ComponentType<IconProps>, string];
const NAV: [string | null, NavItem[]][] = [
  [null, [["/", Notepad, "Today"], ["/pipeline", Kanban, "Pipeline"], ["/tasks", ListChecks, "Tasks"]]],
  ["Records", [["/deals", Handshake, "Deals"], ["/leads", Funnel, "Leads"], ["/companies", Buildings, "Companies"], ["/contacts", AddressBook, "People"]]],
  ["Workspace", [["/automations", FlowArrow, "Automations"]]],
];
const THEMES: [Theme, ComponentType<IconProps>, string][] = [["light", Sun, "Light theme"], ["dark", Moon, "Dark theme"], ["system", Desktop, "Match the system"]];
const TYPES: [string, RecordType][] = [["companies", "company"], ["contacts", "contact"], ["leads", "lead"], ["deals", "deal"], ["tasks", "task"], ["notes", "note"]];

export default function App() {
  const { user, setUser, assistant, openAssistant, closeAssistant } = useStore();
  const [checking, setChecking] = useState(!!auth.token);
  const [mode, setMode] = useState<Theme>(theme());

  useEffect(() => {
    if (auth.token) api("/auth/me").then(setUser).catch(() => auth.set(null)).finally(() => setChecking(false));
    const out = () => setUser(null);
    window.addEventListener("kesher:logout", out);
    return () => window.removeEventListener("kesher:logout", out);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return null;
  if (!user) return <Landing />;

  return (
    <div className={`shell ${assistant.open ? "with-assistant" : ""}`}>
      <nav className="side" aria-label={t("Main")}>
        <div className="workspace">
          <span className="mark" aria-hidden="true">ק</span>
          <div><b>KESHER</b><span>{t("Sample workspace")}</span></div>
        </div>
        {NAV.map(([label, items]) => (
          <div key={label ?? "main"} role="group" aria-label={label ? t(label) : undefined}>
            {label && <div className="side-label" aria-hidden="true">{t(label)}</div>}
            {items.map(([to, Icon, name]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon aria-hidden="true" />{t(name)}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="me">
          <div className="me-name">{user.name}</div>
          <div className="faint">{t(user.role)}</div>
          <div className="row" role="group" aria-label={t("Theme")}>
            {THEMES.map(([value, Icon, label]) => (
              <button key={value} className="ghost icon small" aria-label={t(label)} title={t(label)} aria-pressed={mode === value} onClick={() => { setTheme(value); setMode(value); }}><Icon aria-hidden="true" /></button>
            ))}
          </div>
          <div className="row">
            <button className="ghost small" lang={lang === "he" ? "en" : "he"} onClick={() => setLang(lang === "he" ? "en" : "he")}>{lang === "he" ? "English" : "עברית"}</button>
            <button className="ghost small" onClick={() => { auth.set(null); setUser(null); }}><SignOut className="flip" aria-hidden="true" />{t("Sign out")}</button>
          </div>
        </div>
      </nav>
      <main className="frame">
        <header className="top">
          <SearchBar />
          <button aria-pressed={assistant.open} onClick={() => (assistant.open ? closeAssistant() : openAssistant())}><ChatCircleText aria-hidden="true" />{t("Assistant")}</button>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/automations" element={<Automations />} />
          {TYPES.map(([plural, type]) => <Route key={plural} path={`/${plural}`} element={<RecordList key={type} type={type} />} />)}
          {TYPES.map(([, type]) => <Route key={type} path={`/${type}/:id`} element={<RecordDetail key={type} type={type} />} />)}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {assistant.open && <Assistant target={assistant.target ?? undefined} onClose={closeAssistant} />}
    </div>
  );
}
