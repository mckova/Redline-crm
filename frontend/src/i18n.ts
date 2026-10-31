/** English / Hebrew UI. English strings are the keys; Hebrew switches the layout to RTL. */
export type Lang = "en" | "he";

const KEY = "kesher.lang";
export const lang: Lang = (localStorage.getItem(KEY) as Lang) === "he" ? "he" : "en";
export const isRTL = lang === "he";
document.documentElement.lang = lang;
document.documentElement.dir = isRTL ? "rtl" : "ltr";

export function setLang(l: Lang) {
  localStorage.setItem(KEY, l);
  window.location.reload();
}

const HE: Record<string, string> = {
  // shell
  Dashboard: "דשבורד", Pipeline: "צנרת מכירות", Deals: "עסקאות", Leads: "לידים", Companies: "חברות", People: "אנשי קשר",
  Tasks: "משימות", Automations: "אוטומציות", Notes: "הערות", Contacts: "אנשי קשר", "Sign out": "התנתקות",
  "Search everything…  ⌘K": "חיפוש בכל המערכת…  ⌘K", "✦ Copilot": "✦ קופיילוט", "Loading…": "טוען…",
  admin: "מנהל/ת", sales: "מכירות",
  // login
  "Relationship CRM · demo workspace": "CRM לניהול קשרי לקוחות · סביבת דמו", Email: "אימייל", Password: "סיסמה", "Sign in": "כניסה",
  "Demo users: admin@ / dor@ / noa@kesher.dev · password demo1234": "משתמשי דמו: admin@ / dor@ / noa@kesher.dev · סיסמה demo1234",
  // dashboard
  "Open pipeline": "צנרת פתוחה", "{n} open deals": "{n} עסקאות פתוחות", "Weighted forecast": "תחזית משוקללת",
  "amount × stage probability": "סכום × הסתברות השלב", Won: "נסגרו", "win rate {n}%": "אחוז זכייה {n}%",
  "Avg. sales cycle": "מחזור מכירה ממוצע", "created → won": "מפתיחה לסגירה", "Overdue tasks": "משימות באיחור",
  "{n} leads in funnel": "{n} לידים במשפך", "Pipeline by stage": "צנרת לפי שלב", "Deals needing attention": "עסקאות שדורשות טיפול",
  "All open deals look healthy 🎉": "כל העסקאות הפתוחות במצב טוב 🎉", "Activity · last 14 days": "פעילות · 14 הימים האחרונים",
  "Lead sources": "מקורות לידים", Source: "מקור", Converted: "הומרו", Rate: "שיעור", "{n}d": "{n} ימים",
  // briefing
  "✦ Today's briefing": "✦ התדריך של היום", "Generate briefing": "הפקת תדריך", Refresh: "רענון", "Thinking…": "חושב…",
  "Claude reads the whole pipeline (deal health, overdue tasks, hot leads, forecast) and tells you where to start today.":
    "Claude קורא את כל הצנרת (בריאות עסקאות, משימות באיחור, לידים חמים ותחזית) ואומר לך מאיפה להתחיל היום.",
  "Watch out": "שימו לב",
  // AI status
  "Demo AI": "AI במצב דמו",
  "Demo mode: no API key is set, so an offline stand-in answers from the CRM data. Set ANTHROPIC_API_KEY to use Claude Opus 5.5.":
    "מצב דמו: לא הוגדר מפתח API, ולכן תחליף לא מקוון עונה מתוך נתוני ה-CRM. הגדירו ANTHROPIC_API_KEY כדי לעבוד עם Claude Opus 5.5.",
  "AI is not configured.": "ה-AI לא מוגדר.",
  // lists
  "All {x}": "כל ה{x}", "Assigned to me": "משויך אליי", "Filter…": "סינון…", "+ New {x}": "+ {x} חדש/ה", "No records match.": "אין רשומות מתאימות.",
  Name: "שם", Score: "ציון", "All owners": "כל הבעלים", "+ New deal": "+ עסקה חדשה",
  // detail
  "Convert lead": "המרת ליד", "✦ Ask Copilot": "✦ לשאול את הקופיילוט", Edit: "עריכה", Delete: "מחיקה", "Delete {x}?": "למחוק את {x}?",
  "Win probability": "הסתברות לזכייה", "Linked to": "מקושר ל", Created: "נוצר", via: "דרך", "Deal health": "בריאות העסקה",
  "On track — nothing to fix.": "במסלול, אין מה לתקן.", "Why this score?": "למה הציון הזה?", "Converted →": "הומר ←", contact: "איש קשר",
  deal: "עסקה", company: "חברה", "+ Task": "+ משימה", "+ Note": "+ הערה", "No tasks": "אין משימות", "No notes": "אין הערות", due: "יעד",
  Timeline: "טיימליין", "No activity yet": "אין פעילות עדיין",
  "Creates": "ייווצרו", "Also create a deal": "ליצור גם עסקה", "Deal name": "שם העסקה", "Amount (₪)": "סכום (₪)", Cancel: "ביטול", Convert: "המרה",
  "Creates the company (or reuses it) and contact, and moves the lead's notes and tasks over.":
    "ייווצרו חברה (או שימוש בקיימת) ואיש קשר, וההערות והמשימות של הליד יעברו אליהם.",
  // insight
  "✦ AI insight": "✦ תובנת AI", Generate: "הפקה", "Analyzing…": "מנתח…",
  "Claude reads this record's timeline, notes and tasks and suggests what to do next.": "Claude קורא את הטיימליין, ההערות והמשימות של הרשומה ומציע מה לעשות עכשיו.",
  "· in {n}d": "· בעוד {n} ימים", "✓ added": "✓ נוסף", "Follow-up email draft:": "טיוטת מייל המשך:", Copy: "העתקה", "✓ copied": "✓ הועתק",
  accelerating: "מאיץ", steady: "יציב", stalling: "נתקע", "at risk": "בסיכון", closed: "סגור",
  // form
  New: "חדש/ה", Save: "שמירה", "Saving…": "שומר…",
  // copilot
  "about {x}": "על {x}", "New chat": "שיחה חדשה", "searched the CRM": "חיפש ב-CRM", "listed records": "שלף רשומות", "read a record": "קרא רשומה",
  "checked the pipeline": "בדק את הצנרת", open: "פתיחה",
  "Ask anything about your CRM, or paste call notes and I'll propose the updates. Nothing changes until you approve it.":
    "אפשר לשאול כל דבר על ה-CRM, או להדביק סיכום שיחה ואציע את העדכונים. שום דבר לא משתנה עד שתאשרו.",
  "What should I focus on today?": "על מה כדאי לי להתמקד היום?",
  "Which deals are at risk and what should I do about each?": "אילו עסקאות בסיכון ומה לעשות עם כל אחת?",
  "Summarize the pipeline by stage and owner": "סכם את הצנרת לפי שלב ובעלים",
  "Summarize this and suggest the next step": "סכם והצע את הצעד הבא", "Draft a follow-up email": "נסח מייל המשך", "Log these call notes: ": "תעד את סיכום השיחה: ",
  "Copilot wants to make {n} change(s):": "הקופיילוט רוצה לבצע {n} שינויים:", "Apply selected": "ביצוע הנבחרים", "Reject all": "דחיית הכול",
  "Approve or reject the changes above first": "קודם צריך לאשר או לדחות את השינויים", "Ask, or paste call notes…": "שאלה, או הדבקת סיכום שיחה…", Send: "שליחה",
  "Set ANTHROPIC_API_KEY on the server and restart. Every change Copilot proposes waits for your approval.": "הגדירו ANTHROPIC_API_KEY בשרת והפעילו מחדש. כל שינוי שהקופיילוט מציע מחכה לאישור.",
  // automations
  "+ New rule": "+ כלל חדש", "When something happens to a record → check conditions → run actions. Use {{record.field}} in text.":
    "כשמשהו קורה לרשומה ← בדיקת תנאים ← הפעלת פעולות. אפשר להשתמש ב-{{record.field}} בטקסט.",
  "✦ Describe a rule in your own words": "✦ תארו כלל במילים שלכם",
  "e.g. When a deal over 100K is created, have AI write a brief for the CEO and add a call task for tomorrow":
    "למשל: כשנפתחת עסקה מעל 100 אלף, ה-AI יכתוב תדריך למנכ\"ל ותיווצר משימת שיחה למחר",
  "Draft rule": "ניסוח כלל", "Drafting…": "מנסח…", "{n} runs": "{n} הרצות", last: "אחרונה", "Run log": "יומן הרצות", When: "מתי", Rule: "כלל",
  Record: "רשומה", Status: "סטטוס", Output: "פלט", "No runs yet — move a deal to “proposal” to see one.": "אין הרצות עדיין. העבירו עסקה לשלב \"הצעה\" כדי לראות אחת.",
  "✦ AI steps": "✦ צעדי AI", Instructions: "הנחיות", Result: "תוצאה", "Edit rule": "עריכת כלל", "New rule": "כלל חדש", "(all must match)": "(כולם צריכים להתקיים)",
  Conditions: "תנאים", Actions: "פעולות", "+ condition": "+ תנאי", "+ action": "+ פעולה", "Save rule": "שמירת כלל", "✦ AI analysis": "✦ ניתוח AI",
  // fields
  Domain: "דומיין", Industry: "תעשייה", Employees: "עובדים", "Annual revenue": "הכנסה שנתית", City: "עיר", Owner: "בעלים",
  "First name": "שם פרטי", "Last name": "שם משפחה", Phone: "טלפון", "Job title": "תפקיד", Company: "חברה", Budget: "תקציב", Description: "תיאור",
  Amount: "סכום", Stage: "שלב", "Close date": "תאריך סגירה צפוי", "Point of contact": "איש קשר", "Probability override %": "הסתברות ידנית %",
  "Lost reason": "סיבת הפסד", Title: "כותרת", Due: "יעד", Assignee: "אחראי/ת", Details: "פרטים", Body: "תוכן",
  Deal: "עסקה", Lead: "ליד", Contact: "איש קשר", Task: "משימה", Note: "הערה",
  // values
  new: "חדש", qualified: "מוסמך", proposal: "הצעה", negotiation: "משא ומתן", won: "נסגר", lost: "הפסד",
  contacted: "נוצר קשר", unqualified: "לא רלוונטי", converted: "הומר", referral: "הפניה", event: "אירוע", website: "אתר", ads: "פרסום", cold: "פנייה קרה",
  todo: "לביצוע", "in progress": "בתהליך", done: "בוצע", success: "הצליח", failed: "נכשל", queued: "בתור", running: "רץ", skipped: "דולג",
  Close: "סגירה", "This can't be undone from the app.": "אי אפשר לבטל את זה מתוך המערכת.",
  // landing
  "Open the demo": "לפתוח את הדמו", "AI-native sales CRM": "CRM מכירות שבנוי סביב AI", "The CRM that does the follow-up.": "ה-CRM שעושה את המעקב בשבילך.",
  "Paste a call, get the updates. Claude reads your whole pipeline, proposes every change, and waits for your approval.":
    "מדביקים סיכום שיחה ומקבלים את העדכונים. Claude קורא את כל הצנרת, מציע כל שינוי ומחכה לאישור שלך.",
  "See how it works": "איך זה עובד", Proposal: "הצעה", Negotiation: "משא ומתן", Qualified: "מוסמך",
  "Move to Proposal · ₪240,000 · close Nov 20": "מעבר להצעה · ₪240,000 · סגירה ב-20 בנובמבר", "Task: send proposal tomorrow": "משימה: לשלוח הצעה מחר",
  "Paste the call. Approve the changes.": "מדביקים את השיחה. מאשרים את השינויים.",
  "Copilot pulls out who, what was agreed, the amount and the date, then lines up the exact updates. Reads happen on their own; every write waits for you.":
    "הקופיילוט מזהה מי, על מה סוכם, הסכום והתאריך, ומכין את העדכונים המדויקים. קריאה קורית לבד, וכל כתיבה מחכה לך.",
  "Call with Adi: budget confirmed, wants the proposal at 240K, decision by Nov 20.": "שיחה עם עדי: התקציב אושר, רוצה הצעה ב-240 אלף, החלטה עד 20 בנובמבר.",
  "Update deal: stage → PROPOSAL, amount → 240,000": "עדכון עסקה: שלב ← הצעה, סכום ← 240,000", "Add note “Call with Adi”": "הוספת הערה “שיחה עם עדי”",
  "Create task “Send proposal” (due in 1d)": "יצירת משימה “לשלוח הצעה” (בעוד יום)", "AI in every part of the work.": "AI בכל חלק של העבודה.",
  "Today's briefing": "התדריך של היום", "Every morning: what matters, which deal, why now.": "כל בוקר: מה חשוב, איזו עסקה, ולמה עכשיו.",
  "Analysis in the background": "ניתוח ברקע", "New leads and deals that change stage are read before you open them.": "לידים חדשים ועסקאות שמשנות שלב נקראים עוד לפני שפתחת אותם.",
  "Rules in plain language": "כללים בשפה פשוטה", "Describe an automation in English or Hebrew; the engine validates the draft.": "מתארים אוטומציה בעברית או באנגלית, והמנוע בודק את הטיוטה.",
  "An audit trail you can trust": "תיעוד שאפשר לסמוך עליו", "Every AI change carries a ✦ badge and a field-level diff.": "כל שינוי של AI מסומן ב-✦ ומציג בדיוק מה השתנה.",
  "Try it on a live demo workspace.": "נסו את זה בסביבת דמו חיה.", "Nothing changes until you say so.": "שום דבר לא משתנה בלי אישור שלך.",
  "Try it: pick what Copilot may apply. The timeline shows exactly what will land, marked as AI.": "נסו: בחרו מה הקופיילוט רשאי לבצע. הטיימליין מראה בדיוק מה ייכנס, מסומן כ-AI.",
  "Stage → Proposal": "שלב ← הצעה", "Amount → ₪240,000": "סכום ← ₪240,000", "Follow-up task tomorrow": "משימת המשך למחר", "Nothing will change.": "שום דבר לא ישתנה.",
  // timeline
  created: "יצר/ה", updated: "עדכן/ה", deleted: "מחק/ה", "⚡ automation": "⚡ אוטומציה", empty: "ריק",
  "just now": "עכשיו", "{n}m ago": "לפני {n} דק׳", "{n}h ago": "לפני {n} שע׳", "{n}d ago": "לפני {n} ימים",
};

export function t(s: string, vars?: Record<string, string | number>): string {
  let out = lang === "he" ? HE[s] ?? s : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}

/** Translate an enum-like value (stage, status, source) for display. */
export const tv = (v: string) => t(String(v).toLowerCase().replace(/_/g, " "));

const HEALTH_HE: Record<string, [string, string]> = {
  stale: ["אין פעילות {n} ימים", "לתעד שיחה או לשלוח מייל המשך"],
  overdue_close: ["תאריך הסגירה הצפוי עבר", "לעדכן את תאריך הסגירה או להזיז שלב"],
  no_contact: ["אין איש קשר", "לקשר מקבל/ת החלטות"],
  no_next_step: ["אין צעד הבא פתוח", "ליצור משימת המשך"],
  stuck: ["תקועה באותו שלב {n} ימים", "לבדוק מחדש התאמה או לקדם שלב"],
};
/** Deal-health issue in the UI language (the API returns English text plus a stable code). */
export function tIssue(i: { code?: string; message: string; action: string }): { message: string; action: string } {
  if (lang !== "he" || !i.code || !HEALTH_HE[i.code]) return i;
  const n = i.message.match(/\d+/)?.[0] ?? "";
  const [m, a] = HEALTH_HE[i.code];
  return { message: m.replace("{n}", n), action: a };
}

const REASON_HE: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^source: (\w+)$/, (m) => `מקור: ${t(m[1])}`],
  [/^business email$/, () => "אימייל עסקי"], [/^personal email$/, () => "אימייל פרטי"],
  [/^phone number provided$/, () => "צוין מספר טלפון"], [/^company known$/, () => "החברה ידועה"],
  [/^decision maker title$/, () => "תפקיד מקבל/ת החלטות"], [/^senior title$/, () => "תפקיד בכיר"], [/^manager title$/, () => "תפקיד ניהולי"],
  [/^budget ≥ (\w+)$/, (m) => `תקציב ≥ ${m[1]}`], [/^budget stated$/, () => "צוין תקציב"],
  [/^(\d+) engagement events$/, (m) => `${m[1]} אינטראקציות`],
];
export function tReason(r: string): string {
  if (lang !== "he") return r;
  for (const [re, f] of REASON_HE) { const m = r.match(re); if (m) return f(m); }
  return r;
}

export const locale = lang === "he" ? "he-IL" : "en-GB";
