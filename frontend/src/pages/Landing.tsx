import { useMemo, useState } from "react";
import { ArrowsClockwise, PencilSimple, Plus } from "@phosphor-icons/react";
import { Stage } from "../components/ui";
import { isRTL, lang, locale, setLang, t, tn } from "../i18n";
import Login from "./Login";
import "../landing.css";

/*
  The product page behaves like the product. Its hero is a working copy of the assistant's approval flow,
  running in the browser on a clearly labelled sample deal; the page ends in the real sign-in form.
*/

type Deal = { stage: string; amount: number; close: Date };
type Proposal = { id: string; label: string; apply: (d: Deal) => Deal };

const START: Deal = { stage: "QUALIFIED", amount: 180000, close: new Date(2026, 10, 30) };
const NOTES_EN = "Call with Adi Levi at Negev Robotics. Budget approved at 240K for the fleet pilot. She wants the proposal by Thursday and will decide by Dec 12. Next: send the proposal and book a site visit in Beer Sheva.";
const NOTES_HE = "שיחה עם עדי לוי מנגב רובוטיקס. התקציב לפיילוט הצי אושר: 240 אלף. היא רוצה את ההצעה עד יום חמישי ותחליט עד 12 בדצמבר. הצעד הבא: לשלוח את ההצעה ולתאם ביקור באתר בבאר שבע.";
const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const ils = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const day = (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

/** A deliberately small reader: the shapes a sales note usually carries, in English or Hebrew. */
function read(notes: string): Proposal[] {
  const out: Proposal[] = [];
  const n = notes.toLowerCase();
  const stage = /signed|closed won|נחתם/.test(n) ? "WON" : /negotiat|משא ומתן/.test(n) ? "NEGOTIATION" : /proposal|הצעה/.test(n) ? "PROPOSAL" : null;
  if (stage && stage !== START.stage) out.push({ id: "stage", label: t("Move the stage to {x}", { x: t(stage.charAt(0) + stage.slice(1).toLowerCase()) }), apply: (d) => ({ ...d, stage }) });
  const k = n.match(/(\d[\d,.]*)\s*(k\b|אלף)/) ?? n.match(/₪\s?(\d[\d,]*)/);
  if (k) {
    const amount = Math.round(parseFloat(k[1].replace(/,/g, "")) * (k[2] ? 1000 : 1));
    if (amount && amount !== START.amount) out.push({ id: "amount", label: t("Set the amount to {x}", { x: ils(amount) }), apply: (d) => ({ ...d, amount }) });
  }
  let close: Date | null = null;
  const en = n.match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\b|\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})\b/);
  if (en) {
    const m = MONTHS_EN.indexOf((en[2] ?? en[3]) || "");
    if (m >= 0) close = new Date(2026, m, Number(en[1] ?? en[4]));
  }
  const he = notes.match(/(\d{1,2})\s+ב([א-ת]+)/);
  if (!close && he) { const m = MONTHS_HE.indexOf(he[2]); if (m >= 0) close = new Date(2026, m, Number(he[1])); }
  if (close) { const c = close; out.push({ id: "close", label: t("Set the close date to {x}", { x: day(c) }), apply: (d) => ({ ...d, close: c }) }); }
  if (/send (the )?proposal|לשלוח (את )?ה?הצעה/.test(n)) out.push({ id: "task1", label: t("Create the task “Send the proposal”, due in 2 days"), apply: (d) => d });
  if (/site visit|ביקור/.test(n)) out.push({ id: "task2", label: t("Create the task “Book the site visit”, due in 5 days"), apply: (d) => d });
  if (notes.trim().length > 20) out.push({ id: "note", label: t("Save these call notes on the deal"), apply: (d) => d });
  return out;
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-bar">
        <span className="lp-brand"><span className="mark" aria-hidden="true">ק</span>KESHER</span>
        <nav className="row" aria-label={t("Page")}>
          <button className="ghost small" lang={lang === "he" ? "en" : "he"} onClick={() => setLang(lang === "he" ? "en" : "he")}>{lang === "he" ? "English" : "עברית"}</button>
          <a className="lp-signin" href="#signin">{t("Sign in")}</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-copy">
            <h1 id="lp-title"><span>{t("Paste the call.")}</span> <span>{t("Approve the update.")}</span></h1>
            <p className="lp-lede">{t("KESHER's assistant reads your sales notes, drafts the CRM changes, and writes nothing until you approve each one.")}</p>
            <a className="lp-cta" href="#signin">{t("Open the sample workspace")}</a>
            <p className="lp-fine">{t("Works without an API key in an offline demo mode. Add a key and the same screens use Claude Opus 5.5.")}</p>
          </div>
          <Surface />
        </section>

        <section className="lp-memo" aria-labelledby="lp-memo-title">
          <div className="lp-side">
            <h2 id="lp-memo-title">{t("A ranked list of where to start, every morning.")}</h2>
            <p>{t("The assistant reads deal health, overdue tasks and hot leads, then writes a short memo. Every line links to its record.")}</p>
          </div>
          <figure className="lp-sheet" aria-label={t("Sample morning memo")}>
            <figcaption className="lp-sample">{t("Sample memo")}</figcaption>
            <p className="memo-lede">{t("Two deals worth ₪415K have gone quiet; start with Negev Robotics before Thursday.")}</p>
            <ol className="focus">
              <li><div><a href="#signin">{t("Negev Robotics, fleet pilot")}</a><p>{t("Proposal promised for Thursday. No task exists for it yet.")}</p></div></li>
              <li><div><a href="#signin">{t("Yam Logistics, renewal")}</a><p>{t("No contact in 16 days and the close date passed last week.")}</p></div></li>
              <li><div><a href="#signin">{t("Orion Cyber, pilot")}</a><p>{t("Grade A lead from a referral, still unassigned.")}</p></div></li>
            </ol>
          </figure>
        </section>

        <section className="lp-more" aria-labelledby="lp-more-title">
          <h2 id="lp-more-title">{t("Also in the workspace")}</h2>
          <dl>
            <div><dt>{t("A pipeline you drag")}</dt><dd>{t("Six stages, each move is one write, and the stage meter fills as a deal advances.")}</dd></div>
            <div><dt>{t("Lead scores with reasons")}</dt><dd>{t("Every point names its cause: a business email, a decision-maker title, a stated budget.")}</dd></div>
            <div><dt>{t("Rules in plain language")}</dt><dd>{t("Describe a rule in English or Hebrew; the assistant drafts it and the engine checks it before you save.")}</dd></div>
            <div><dt>{t("A timeline with sources")}</dt><dd>{t("Every change shows who made it, by hand, by a rule or by the assistant, with the field before and after.")}</dd></div>
            <div><dt>{t("Hebrew and English")}</dt><dd>{t("The whole interface mirrors for right-to-left, with light and dark themes.")}</dd></div>
          </dl>
        </section>

        <section className="lp-end" id="signin" aria-labelledby="lp-end-title">
          <div>
            <h2 id="lp-end-title">{t("Try it on the sample workspace.")}</h2>
            <p>{t("Twelve companies, thirty deals and twenty leads, reset whenever the server restarts.")}</p>
          </div>
          <Login embedded />
        </section>
      </main>

      <footer className="lp-foot">
        <span>{t("KESHER is open source under the MIT license.")}</span>
        <a href="https://github.com/mckova/kesher-crm">{t("Source on GitHub")}</a>
      </footer>
    </div>
  );
}

/** The hero: the real approval flow on a sample deal, computed in the browser as you type. */
function Surface() {
  const [notes, setNotes] = useState(isRTL ? NOTES_HE : NOTES_EN);
  const [deal, setDeal] = useState<Deal>(START);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [log, setLog] = useState<{ key: number; text: string; id: string }[]>([]);
  const [changed, setChanged] = useState<Record<string, number>>({});
  const proposals = useMemo(() => read(notes), [notes]);
  const chosen = proposals.filter((p) => !off[p.id]);

  function apply() {
    const next = chosen.reduce((d, p) => p.apply(d), deal);
    const stamp = Date.now();
    setChanged({ stage: next.stage !== deal.stage ? stamp : 0, amount: next.amount !== deal.amount ? stamp : 0, close: next.close.getTime() !== deal.close.getTime() ? stamp : 0 });
    setDeal(next);
    setLog((l) => [...chosen.map((p, i) => ({ key: stamp + i, text: p.label, id: p.id })), ...l].slice(0, 6));
    setNotes("");
  }
  function reset() { setDeal(START); setLog([]); setOff({}); setChanged({}); setNotes(isRTL ? NOTES_HE : NOTES_EN); }

  return (
    <div className="lp-surface" aria-label={t("Interactive sample of the assistant")} role="region">
      <div className="lp-surface-head">
        <span className="lp-sample">{t("Sample deal. Runs in your browser; nothing is sent.")}</span>
        <button className="ghost small" onClick={reset}><ArrowsClockwise aria-hidden="true" />{t("Reset")}</button>
      </div>
      <div className="lp-deal">
        <b>{t("Negev Robotics, fleet pilot")}</b>
        <dl>
          <div className={changed.stage ? "flash" : ""} key={`s${changed.stage}`}><dt>{t("Stage")}</dt><dd><Stage stage={deal.stage} /></dd></div>
          <div className={changed.amount ? "flash" : ""} key={`a${changed.amount}`}><dt>{t("Amount")}</dt><dd className="fig">{ils(deal.amount)}</dd></div>
          <div className={changed.close ? "flash" : ""} key={`c${changed.close}`}><dt>{t("Close date")}</dt><dd className="tnum">{day(deal.close)}</dd></div>
        </dl>
      </div>
      <label className="lp-notes">
        <span>{t("Call notes")}</span>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Paste or type notes from a call")} />
      </label>
      {proposals.length === 0 ? <p className="faint small" role="status">{t("Nothing to propose yet. Mention an amount, a date or a next step.")}</p> : (
      <div className="approval">
        <div className="approval-head" role="status">{tn(proposals.length, "Waiting for your approval: 1 change", "Waiting for your approval: {n} changes")}</div>
        {proposals.map((p) => (
          <label key={p.id} className="approval-item">
            <input type="checkbox" checked={!off[p.id]} onChange={() => setOff({ ...off, [p.id]: !off[p.id] })} />
            <span>{p.label}</span>
          </label>
        ))}
        <div className="row">
          <button className="primary" disabled={!chosen.length} onClick={apply}>{t("Apply {n} selected", { n: chosen.length })}</button>
          <span className="faint small">{t("Unchecked items are discarded.")}</span>
        </div>
      </div>
      )}
      {log.length > 0 && (
        <ol className="timeline lp-log" aria-label={t("Timeline")} aria-live="polite">
          {log.map((l) => (
            <li key={l.key} className="tl tl-ai">
              <span className="tl-icon" aria-hidden="true">{l.id.startsWith("task") || l.id === "note" ? <Plus weight="bold" /> : <PencilSimple weight="bold" />}</span>
              <div><div className="tl-head">{l.text}</div><span className="via">{t("via assistant, approved by you")}</span></div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
