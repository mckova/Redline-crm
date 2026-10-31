import { useEffect, useRef, useState } from "react";
import { lang, setLang, t } from "../i18n";
import Login from "./Login";
import "../landing.css";

/**
 * Public product page shown before sign-in. Five acts, each with its own device:
 * layered hero (depth) → pinned call-notes sequence (scroll scrub) → live approval
 * toggles (interaction) → capability tiles (clip reveal) → the sign-in form itself.
 */
export default function Landing() {
  const hero = useRef<HTMLElement>(null);

  // Pointer depth for the hero planes; rAF-throttled, writes two CSS variables only.
  useEffect(() => {
    const el = hero.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        el.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    };
    el.addEventListener("pointermove", move);
    return () => { el.removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, []);

  return (
    <div className="landing">
      <header className="l-nav">
        <div className="logo"><span className="logo-mark" aria-hidden="true" />KESHER</div>
        <div className="row">
          <button className="ghost small" onClick={() => setLang(lang === "he" ? "en" : "he")}>{lang === "he" ? "English" : "עברית"}</button>
          <a className="l-cta small" href="#signin">{t("Open the demo")}</a>
        </div>
      </header>

      {/* Act 1: recognition, layered planes */}
      <section className="l-hero" ref={hero} aria-labelledby="l-title">
        <div className="plane plane-back" aria-hidden="true">
          {["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"].map((s) => <div key={s} className="ghost-col" />)}
        </div>
        <div className="l-hero-copy">
          <p className="l-eyebrow">{t("AI-native sales CRM")}</p>
          <h1 id="l-title" className="l-display">{t("The CRM that does the follow-up.")}</h1>
          <p className="l-lede">{t("Paste a call, get the updates. Claude reads your whole pipeline, proposes every change, and waits for your approval.")}</p>
          <div className="row"><a className="l-cta" href="#signin">{t("Open the demo")}</a><a className="l-link" href="#how">{t("See how it works")}</a></div>
        </div>
        <div className="plane plane-mid" aria-hidden="true">
          <div className="fcard c1"><b>Negev Robotics</b><span>₪240,000 · {t("Proposal")}</span></div>
          <div className="fcard c2"><b>Yam Logistics</b><span>₪85,000 · {t("Negotiation")}</span></div>
          <div className="fcard c3"><b>Orion Cyber</b><span>₪60,000 · {t("Qualified")}</span></div>
        </div>
        <div className="plane plane-front" aria-hidden="true">
          <div className="fnote">✦ {t("Move to Proposal · ₪240,000 · close Nov 20")}</div>
          <div className="fnote n2">✓ {t("Task: send proposal tomorrow")}</div>
        </div>
      </section>

      {/* Act 2: clarity, pinned scrub */}
      <section className="l-pin" id="how" aria-labelledby="l-how">
        <div className="l-pin-sticky">
          <div className="l-pin-copy">
            <h2 id="l-how" className="l-h2">{t("Paste the call. Approve the changes.")}</h2>
            <p className="l-body">{t("Copilot pulls out who, what was agreed, the amount and the date, then lines up the exact updates. Reads happen on their own; every write waits for you.")}</p>
          </div>
          <div className="l-panel" aria-hidden="true">
            <div className="l-note">“{t("Call with Adi: budget confirmed, wants the proposal at 240K, decision by Nov 20.")}”</div>
            <div className="l-step s1">⌕ {t("searched the CRM")} · {t("read a record")}</div>
            <div className="l-step s2">☐ {t("Update deal: stage → PROPOSAL, amount → 240,000")}</div>
            <div className="l-step s3">☐ {t("Add note “Call with Adi”")}</div>
            <div className="l-step s4">☐ {t("Create task “Send proposal” (due in 1d)")}</div>
          </div>
        </div>
      </section>

      {/* Act 3: control, a live interaction */}
      <Approvals />

      {/* Act 4: competence, capability tiles */}
      <section className="l-tiles" aria-labelledby="l-tiles">
        <h2 id="l-tiles" className="l-h2">{t("AI in every part of the work.")}</h2>
        <div className="tiles">
          {[
            [t("Today's briefing"), t("Every morning: what matters, which deal, why now.")],
            [t("Analysis in the background"), t("New leads and deals that change stage are read before you open them.")],
            [t("Rules in plain language"), t("Describe an automation in English or Hebrew; the engine validates the draft.")],
            [t("An audit trail you can trust"), t("Every AI change carries a ✦ badge and a field-level diff.")],
          ].map(([h, p], i) => (
            <article key={i} className="tile" style={{ "--i": i } as React.CSSProperties}><h3>{h}</h3><p>{p}</p></article>
          ))}
        </div>
      </section>

      {/* Act 5: resolve, the real sign-in */}
      <section className="l-end" id="signin" aria-label={t("Sign in")}>
        <h2 className="l-h2 balance">{t("Try it on a live demo workspace.")}</h2>
        <Login embedded />
      </section>
    </div>
  );
}

function Approvals() {
  const items = [t("Stage → Proposal"), t("Amount → ₪240,000"), t("Follow-up task tomorrow")];
  const [on, setOn] = useState([true, true, false]);
  const applied = items.filter((_, i) => on[i]);
  return (
    <section className="l-approve" aria-labelledby="l-approve">
      <div>
        <h2 id="l-approve" className="l-h2">{t("Nothing changes until you say so.")}</h2>
        <p className="l-body">{t("Try it: pick what Copilot may apply. The timeline shows exactly what will land, marked as AI.")}</p>
      </div>
      <div className="l-approve-box">
        <fieldset>
          <legend className="small strong">{t("Copilot wants to make {n} change(s):", { n: items.length })}</legend>
          {items.map((label, i) => (
            <label key={i} className="approval-item">
              <input type="checkbox" checked={on[i]} onChange={() => setOn(on.map((v, j) => (j === i ? !v : v)))} /> {label}
            </label>
          ))}
        </fieldset>
        <ol className="l-mini-tl" aria-live="polite">
          {applied.length === 0 && <li className="muted">{t("Nothing will change.")}</li>}
          {applied.map((a) => <li key={a}><span className="badge tone-ai">✦ AI</span> {a}</li>)}
        </ol>
      </div>
    </section>
  );
}
