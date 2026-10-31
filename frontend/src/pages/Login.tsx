import { useState } from "react";
import { api, auth } from "../api";
import { useStore } from "../store";

export default function Login() {
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
    <div className="login">
      <form onSubmit={submit} className="card login-card">
        <div className="logo big">◆ KESHER</div>
        <p className="muted">Relationship CRM · demo workspace</p>
        <label><span>Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="error">{error}</div>}
        <button className="primary">Sign in</button>
        <p className="muted small">Demo users: admin@ / dor@ / noa@kesher.dev · password demo1234</p>
      </form>
    </div>
  );
}
