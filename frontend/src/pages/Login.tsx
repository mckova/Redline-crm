import { useState } from "react";
import { api, auth } from "../api";
import { useStore } from "../store";
import { t } from "../i18n";

/** Sign-in form. Embedded at the end of the product page; prefilled with the sample admin account. */
export default function Login({ embedded = false }: { embedded?: boolean }) {
  const { setUser } = useStore();
  const [email, setEmail] = useState("admin@redline.dev");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ token: string; user: any }>("/auth/login", { body: { email, password } });
      auth.set(r.token);
      setUser(r.user);
    } catch (err: any) {
      setError(err.status === 401 ? t("That email and password don't match an account.") : t("Couldn't reach the server. Try again in a moment."));
    } finally { setBusy(false); }
  }

  const form = (
    <form onSubmit={submit} className="login-card" aria-label={t("Sign in")}>
      <label className="field"><span>{t("Email")}</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span>{t("Password")}</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? t("Signing in…") : t("Open the sample workspace")}</button>
      <p className="demo-users">{t("Other sample users: dor@redline.dev and noa@redline.dev, same password.")}</p>
    </form>
  );
  return embedded ? form : <div className="login">{form}</div>;
}
