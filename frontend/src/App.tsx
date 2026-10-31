import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api, auth, type RecordType } from "./api";
import Copilot from "./components/Copilot";
import SearchBar from "./components/SearchBar";
import Automations from "./pages/Automations";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Pipeline from "./pages/Pipeline";
import RecordDetail from "./pages/RecordDetail";
import RecordList from "./pages/RecordList";
import { useStore } from "./store";

const NAV: [string, string, string][] = [
  ["/", "▦", "Dashboard"], ["/pipeline", "▥", "Pipeline"], ["/deals", "💼", "Deals"], ["/leads", "🎯", "Leads"],
  ["/companies", "🏢", "Companies"], ["/contacts", "👤", "People"], ["/tasks", "☑", "Tasks"], ["/automations", "⚡", "Automations"],
];
const TYPES: [string, RecordType][] = [["companies", "company"], ["contacts", "contact"], ["leads", "lead"], ["deals", "deal"], ["tasks", "task"], ["notes", "note"]];

export default function App() {
  const { user, setUser, copilot, openCopilot, closeCopilot } = useStore();
  const [checking, setChecking] = useState(!!auth.token);

  useEffect(() => {
    if (auth.token) api("/auth/me").then(setUser).catch(() => auth.set(null)).finally(() => setChecking(false));
    const out = () => setUser(null);
    window.addEventListener("kesher:logout", out);
    return () => window.removeEventListener("kesher:logout", out);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return null;
  if (!user) return <Login />;

  return (
    <div className={`shell ${copilot.open ? "with-copilot" : ""}`}>
      <nav className="side">
        <div className="logo">◆ KESHER</div>
        {NAV.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <span className="ico">{icon}</span>{label}
          </NavLink>
        ))}
        <div className="me">
          <div>{user.name}</div>
          <div className="muted small">{user.role}</div>
          <button className="ghost small" onClick={() => { auth.set(null); setUser(null); }}>Sign out</button>
        </div>
      </nav>
      <main>
        <header className="top row-between"><SearchBar /><button className="ai-btn" onClick={() => (copilot.open ? closeCopilot() : openCopilot())}>✦ Copilot</button></header>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/automations" element={<Automations />} />
          {TYPES.map(([plural, t]) => <Route key={plural} path={`/${plural}`} element={<RecordList key={t} type={t} />} />)}
          {TYPES.map(([, t]) => <Route key={t} path={`/${t}/:id`} element={<RecordDetail key={t} type={t} />} />)}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {copilot.open && <Copilot target={copilot.target ?? undefined} onClose={closeCopilot} />}
    </div>
  );
}
