import { useState } from "react";
import { api, auth } from "../api";
import { useStore } from "../store";
import { lang, setLang, t } from "../i18n";

export default function Login({ embedded = false }: { embedded?: boolean }) {
  const { setUser } = useStore();
  const [email, setEmail] = useState("admin@kesher.dev");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ token: string; user: any }>("/auth/login", { body: { email, password } });
      auth.set(r.token);
      setUser(r.user);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className={embedded ? "login-embedded" : "login"}>
      <form onSubmit={submit} className="card login-card">
        <div className="logo big"><span className="logo-mark" aria-hidden="true" />KESHER</div>
        <p className="muted">{t("Relationship CRM · demo workspace")}</p>
        <label><span>{t("Email")}</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label><span>{t("Password")}</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary">{t("Sign in")}</button>
        {!embedded && <button type="button" className="ghost small" onClick={() => setLang(lang === "he" ? "en" : "he")}>{lang === "he" ? "English" : "עברית"}</button>}
        <p className="muted small">{t("Demo users: admin@ / dor@ / noa@kesher.dev · password demo1234")}</p>
      </form>
    </div>
  );
}
