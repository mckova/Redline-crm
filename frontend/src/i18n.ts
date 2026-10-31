/** English / Hebrew UI. English strings are the keys; Hebrew switches the layout to RTL. */
export type Lang = "en" | "he";

const KEY = "redline.lang";
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
  Main: "ניווט ראשי", Today: "היום", Pipeline: "צנרת מכירות", Tasks: "משימות", Records: "רשומות", Deals: "עסקאות", Leads: "לידים",
  Companies: "חברות", People: "אנשי קשר", Contacts: "אנשי קשר", Notes: "הערות", Workspace: "סביבת עבודה", Automations: "אוטומציות",
  "Sample workspace": "סביבת דוגמה", Theme: "ערכת צבעים", "Light theme": "בהירה", "Dark theme": "כהה", "Match the system": "לפי המערכת",
  "Sign out": "התנתקות", Assistant: "העוזר", admin: "מנהל/ת", sales: "מכירות", "Loading…": "טוען…",
  "Search records": "חיפוש רשומות", "Search deals, people, companies": "חיפוש עסקאות, אנשים, חברות", "Search results": "תוצאות חיפוש",
  "Nothing matches “{q}”.": "אין תוצאות עבור “{q}”.",
  // states
  "Couldn't load {x}. The server didn't answer.": "לא הצלחנו לטעון את {x}. השרת לא ענה.", "Try again": "לנסות שוב",
  "Not set": "לא הוגדר", Close: "סגירה", "This can't be undone from the app.": "אי אפשר לבטל את זה מתוך המערכת.", "Keep it": "להשאיר",
  "Grade {g}, score {n} of 100": "דרגה {g}, ציון {n} מתוך 100",
  "Drafted by the offline demo assistant": "נכתב על ידי עוזר הדמו הלא מקוון", "Drafted by {m}": "נכתב על ידי {m}",
  // sign in
  Email: "אימייל", Password: "סיסמה", "Sign in": "כניסה", "Signing in…": "נכנסים…", "Open the sample workspace": "לפתוח את סביבת הדוגמה",
  "Other sample users: dor@redline.dev and noa@redline.dev, same password.": "משתמשי דוגמה נוספים: dor@redline.dev ו-noa@redline.dev, אותה סיסמה.",
  "That email and password don't match an account.": "האימייל והסיסמה לא תואמים לחשבון.", "Couldn't reach the server. Try again in a moment.": "אין חיבור לשרת. נסו שוב בעוד רגע.",
  // today
  "Where to start today": "מאיפה להתחיל היום", Rewrite: "לכתוב מחדש", "Reading the pipeline…": "קורא את הצנרת…", "today's memo": "המזכר של היום",
  "The assistant couldn't write the memo: {e}": "העוזר לא הצליח לכתוב את המזכר: {e}",
  "No memo yet today. The assistant reads deal health, overdue tasks, hot leads and the forecast, then ranks the records to work on first.":
    "עדיין אין מזכר להיום. העוזר קורא את בריאות העסקאות, המשימות באיחור, הלידים החמים והתחזית, ומדרג את הרשומות שכדאי להתחיל בהן.",
  "Write today's memo": "לכתוב את המזכר של היום", Watch: "לשים לב",
  "Deals that need attention": "עסקאות שדורשות טיפול", "health score of 100": "ציון בריאות מתוך 100", "the pipeline": "הצנרת",
  "Every open deal has a recent touch, a contact and a next step.": "לכל עסקה פתוחה יש מגע אחרון, איש קשר וצעד הבא.",
  "Pipeline figures": "נתוני הצנרת", "Open pipeline": "צנרת פתוחה", "{n} open deals": "{n} עסקאות פתוחות", "Weighted forecast": "תחזית משוקללת",
  "amount × stage probability": "סכום × הסתברות השלב", Won: "נסגרו בהצלחה", "win rate {n}%": "אחוז זכייה {n}%", "Average sales cycle": "מחזור מכירה ממוצע",
  "{n} days": "{n} ימים", "from created to won": "מפתיחה ועד סגירה", "Overdue tasks": "משימות באיחור", "{n} leads open": "{n} לידים פתוחים",
  "Pipeline value by stage": "ערך הצנרת לפי שלב", "{n} deals": "{n} עסקאות", "Which lead sources convert": "אילו מקורות לידים מומרים",
  Source: "מקור", Converted: "הומרו", Rate: "שיעור", "Timeline events per day, last 14 days": "אירועים ביום בטיימליין, 14 הימים האחרונים",
  // lists
  "Any {x}": "כל ה{x}", Show: "הצגה", "Assigned to me": "משויך אליי", "Filter by name": "סינון לפי שם", "New {x}": "{x} חדש/ה",
  "Nothing matches this filter.": "אין רשומות שמתאימות לסינון.", "Clear the filter": "ניקוי הסינון", "No {x} yet.": "עדיין אין {x}.",
  "Deals appear here when you create one or convert a lead.": "עסקאות מופיעות כאן כשיוצרים עסקה או ממירים ליד.",
  "New leads land here from the web form, imports, or when you add one.": "לידים חדשים מגיעים לכאן מטופס האתר, מייבוא או כשמוסיפים ידנית.",
  "Companies are created with deals and converted leads, or by hand.": "חברות נוצרות עם עסקאות ולידים שהומרו, או ידנית.",
  "People are added with converted leads, or by hand.": "אנשי קשר נוספים עם לידים שהומרו, או ידנית.",
  "Tasks come from you, from rules, and from the assistant's next steps.": "משימות מגיעות ממך, מכללים ומהצעדים שהעוזר מציע.",
  Done: "בוצע", "Mark “{x}” done": "לסמן את “{x}” כבוצע", Name: "שם", Score: "ציון",
  // pipeline
  "Everyone's deals": "העסקאות של כולם", "New deal": "עסקה חדשה", "Drop a deal here": "אפשר לגרור לכאן עסקה", "No company": "ללא חברה",
  "₪{x} open across {n} deals. Drag a card to move its stage.": "₪{x} פתוחים ב-{n} עסקאות. גוררים כרטיס כדי להעביר שלב.",
  // record
  Breadcrumb: "נתיב", "Convert lead": "המרת ליד", "Ask the assistant": "לשאול את העוזר", Edit: "עריכה", Delete: "מחיקה",
  "Delete {x}?": "למחוק את {x}?", "Delete {x}": "מחיקת {x}", "Move to stage": "העברה לשלב", "Win probability": "הסתברות לזכייה",
  "Linked to": "מקושר ל", Created: "נוצר", "by hand": "ידנית", "via assistant": "דרך העוזר", "via rule": "דרך כלל", "via import": "דרך ייבוא",
  "This record was deleted or never existed.": "הרשומה נמחקה או שלא הייתה קיימת.", "Back to {x}": "חזרה ל{x}",
  "Couldn't load this record: {e}": "לא הצלחנו לטעון את הרשומה: {e}",
  "Deal health": "בריאות העסקה", "{n} of 100": "{n} מתוך 100", "Recent contact, a named buyer and a next step. Nothing to fix.": "מגע אחרון, איש קשר מוגדר וצעד הבא. אין מה לתקן.",
  "How the score adds up": "איך הציון מצטבר", "Converted into": "הומר ל", contact: "איש קשר", deal: "עסקה", company: "חברה", lead: "ליד", task: "משימה", note: "הערה",
  "No people linked yet.": "עדיין אין אנשי קשר מקושרים.", "No deals yet.": "עדיין אין עסקאות.", "Add task": "הוספת משימה", "Add note": "הוספת הערה",
  "No open tasks. Add one, or take a next step from the assistant's read.": "אין משימות פתוחות. אפשר להוסיף, או לקחת צעד הבא מהקריאה של העוזר.",
  "No notes yet. Paste a call into the assistant and it will propose one.": "עדיין אין הערות. מדביקים שיחה לעוזר והוא יציע אחת.",
  Timeline: "טיימליין", "Nothing has happened to this record yet.": "עדיין לא קרה כלום ברשומה הזו.", "the timeline": "הטיימליין", to: "ל",
  "Convert {x}": "המרת {x}", "Also open a deal": "לפתוח גם עסקה", "Deal name": "שם העסקה", "Amount (₪)": "סכום (₪)", Cancel: "ביטול",
  "Creates the company (or reuses it) and the contact, and moves the lead's notes and tasks over.": "נוצרים חברה (או שימוש בקיימת) ואיש קשר, וההערות והמשימות של הליד עוברות אליהם.",
  // read-out
  "Assistant's read": "הקריאה של העוזר", "Read again": "לקרוא שוב", "Reading…": "קורא…", "Read this record": "לקרוא את הרשומה",
  "The assistant couldn't read this record: {e}": "העוזר לא הצליח לקרוא את הרשומה: {e}",
  "The assistant reads this record's timeline, notes and tasks, then suggests the next step.": "העוזר קורא את הטיימליין, ההערות והמשימות של הרשומה ומציע את הצעד הבא.",
  Risks: "סיכונים", "Next steps": "צעדים הבאים", "in {n} days": "בעוד {n} ימים", "Add as task": "להוסיף כמשימה", "Task added": "המשימה נוספה",
  "Follow-up email": "מייל המשך", "Copy email": "העתקת המייל", Copied: "הועתק",
  accelerating: "מאיץ", steady: "יציב", stalling: "נתקע", "at risk": "בסיכון", closed: "סגור",
  // form
  "Edit {x}": "עריכת {x}", "Save changes": "שמירת השינויים", "Create {x}": "יצירת {x}", "Saving…": "שומר…",
  // assistant
  "Working on {x}": "עובד על {x}", "Offline demo: answers come from simple rules over this workspace": "דמו לא מקוון: התשובות מגיעות מכללים פשוטים על נתוני הסביבה",
  "New conversation": "שיחה חדשה", "Close the assistant": "סגירת העוזר", "The assistant is switched off on this server.": "העוזר כבוי בשרת הזה.",
  "Set ANTHROPIC_API_KEY, or REDLINE_AI=demo for the offline demo, and restart.": "מגדירים ANTHROPIC_API_KEY, או REDLINE_AI=demo לדמו הלא מקוון, ומפעילים מחדש.",
  "Ask about the pipeline, or paste notes from a call. I read records on my own; anything I'd change waits here for your approval.":
    "אפשר לשאול על הצנרת או להדביק סיכום שיחה. אני קורא רשומות לבד, וכל מה שהייתי משנה מחכה כאן לאישור שלך.",
  "What should I focus on today?": "על מה כדאי לי להתמקד היום?", "Which deals are at risk and what should I do about each?": "אילו עסקאות בסיכון ומה לעשות עם כל אחת?",
  "Summarize the pipeline by stage and owner": "סכם את הצנרת לפי שלב ובעלים", "Summarize this and suggest the next step": "סכם והצע את הצעד הבא",
  "Draft a follow-up email": "נסח מייל המשך", "Log these call notes: ": "תעד את סיכום השיחה: ",
  "searched the CRM": "חיפש ב-CRM", "listed records": "שלף רשומות", "read a record": "קרא רשומה", "checked the pipeline": "בדק את הצנרת",
  "Applied changes": "שינויים שבוצעו", done: "בוצע", failed: "נכשל", skipped: "דולג", open: "פתיחה",
  "Apply {n} selected": "ביצוע {n} שנבחרו", "Discard all": "ביטול הכול",
  "Working…": "עובד…", "That didn't go through: {e}": "הפעולה לא עברה: {e}", "Message the assistant": "הודעה לעוזר",
  "Approve or discard the changes above first": "קודם צריך לאשר או לבטל את השינויים", "Ask, or paste call notes": "שאלה, או הדבקת סיכום שיחה", Send: "שליחה",
  // automations
  "Each rule waits for an event on a record, checks its conditions, then runs its steps in order.": "כל כלל מחכה לאירוע ברשומה, בודק את התנאים ומריץ את הצעדים לפי הסדר.",
  "New rule": "כלל חדש", "Describe a rule and the assistant drafts it": "מתארים כלל והעוזר מנסח אותו",
  "You review the draft in the editor before anything is saved.": "בודקים את הטיוטה בעורך לפני שמשהו נשמר.",
  "When a deal over ₪100,000 is created, add a call task for tomorrow": "כשנפתחת עסקה מעל ₪100,000, להוסיף משימת שיחה למחר",
  "Drafting…": "מנסח…", "Draft the rule": "ניסוח הכלל", "It needs one fix before saving: {e}": "צריך תיקון אחד לפני השמירה: {e}",
  "The assistant couldn't draft that: {e}": "העוזר לא הצליח לנסח את זה: {e}", Rules: "כללים", "{n} active": "{n} פעילים", "the rules": "הכללים",
  "No rules yet. Describe one above, or start from a blank rule.": "עדיין אין כללים. אפשר לתאר אחד למעלה, או להתחיל מכלל ריק.",
  "{x} is on": "{x} פעיל", "{n} runs": "{n} הרצות", "last {x}": "אחרונה {x}", "Delete rule": "מחיקת הכלל", "Delete the rule “{x}”?": "למחוק את הכלל “{x}”?",
  When: "כאשר", If: "אם", Then: "אז", And: "וגם", and: "וגם",
  is: "הוא", "is not": "אינו", "is over": "מעל", "is at least": "לפחות", "is under": "מתחת ל", "is at most": "לכל היותר", contains: "מכיל",
  changes: "משתנה", "changes to": "משתנה ל", "changes from": "משתנה מ", "is empty": "ריק", "is set": "מוגדר",
  "create the task": "ליצור את המשימה", "due in {n} days": "יעד בעוד {n} ימים", "add the note": "להוסיף את ההערה", "hand it to the assistant": "להעביר לעוזר",
  set: "להגדיר", "send a webhook to": "לשלוח Webhook אל",
  "Recent runs": "הרצות אחרונות", "No runs yet. Move a deal to Proposal and the first rule will fire.": "עדיין אין הרצות. מעבירים עסקה לשלב הצעה והכלל הראשון ירוץ.",
  Rule: "כלל", Record: "רשומה", Result: "תוצאה", Steps: "צעדים", "dry run": "הרצת ניסיון", success: "הצליח",
  "Assistant steps": "צעדי העוזר", "run in the background so saving a record never waits": "רצים ברקע, כך ששמירת רשומה לא מחכה",
  "Asked to": "התבקש", Status: "סטטוס", Outcome: "תוצאה", "read the record after it changed": "לקרוא את הרשומה אחרי שהשתנתה",
  "Edit rule": "עריכת כלל", "(every condition must match)": "(כל התנאים צריכים להתקיים)", Field: "שדה", Operator: "יחס", Value: "ערך", Values: "ערכים",
  "field, for example stage": "שדה, למשל stage", value: "ערך", "Remove condition": "הסרת תנאי", "Add condition": "הוספת תנאי",
  Step: "צעד", title: "כותרת", "Due in days": "יעד בימים", days: "ימים", "note text": "תוכן ההערה", Instructions: "הנחיות",
  "What the assistant should do, for example draft a follow-up email as a note": "מה העוזר צריך לעשות, למשל לנסח מייל המשך כהערה",
  "Remove step": "הסרת צעד", "Add step": "הוספת צעד", "Save rule": "שמירת הכלל", "Give the rule a name so the run log can show it.": "צריך לתת לכלל שם כדי שיופיע ביומן ההרצות.",
  create_task: "יצירת משימה", add_note: "הוספת הערה", update_record: "עדכון שדה", webhook: "Webhook", ai_agent: "צעד של העוזר",
  queued: "בתור", running: "רץ",
  // fields
  Domain: "דומיין", Industry: "תעשייה", Employees: "עובדים", "Annual revenue": "הכנסה שנתית", City: "עיר", Owner: "בעלים",
  "First name": "שם פרטי", "Last name": "שם משפחה", Phone: "טלפון", "Job title": "תפקיד", Company: "חברה", Budget: "תקציב", Description: "תיאור",
  Amount: "סכום", Stage: "שלב", "Close date": "תאריך סגירה צפוי", "Point of contact": "איש קשר", "Probability override %": "הסתברות ידנית %",
  "Lost reason": "סיבת הפסד", Title: "כותרת", Due: "יעד", Assignee: "אחראי/ת", Details: "פרטים", Body: "תוכן",
  Deal: "עסקה", Lead: "ליד", Contact: "איש קשר", Task: "משימה", Note: "הערה",
  // values
  new: "חדש", qualified: "מוסמך", proposal: "הצעה", negotiation: "משא ומתן", won: "נסגר", lost: "הפסד",
  contacted: "נוצר קשר", unqualified: "לא רלוונטי", converted: "הומר", referral: "הפניה", event: "אירוע", website: "אתר", ads: "פרסום", cold: "פנייה קרה",
  todo: "לביצוע", "in progress": "בתהליך",
  Proposal: "הצעה", Negotiation: "משא ומתן", Qualified: "מוסמך",
  // timeline verbs
  created: "יצר/ה", updated: "עדכן/ה", deleted: "מחק/ה", empty: "ריק",
  "just now": "עכשיו", "{n}m ago": "לפני {n} דק׳", "{n}h ago": "לפני {n} שע׳", "{n}d ago": "לפני {n} ימים",
  // product page
  Page: "עמוד", "Paste the call.": "מדביקים את השיחה.", "Approve the update.": "מאשרים את העדכון.",
  "Redline's assistant reads your sales notes, drafts the CRM changes, and writes nothing until you approve each one.":
    "העוזר של Redline קורא את סיכומי המכירה, מנסח את השינויים ב-CRM, ולא כותב כלום עד שמאשרים כל אחד מהם.",
  "Works without an API key in an offline demo mode. Add a key and the same screens use Claude Opus 5.5.":
    "עובד בלי מפתח API במצב דמו לא מקוון. עם מפתח, אותם מסכים עובדים עם Claude Opus 5.5.",
  "Interactive sample of the assistant": "דוגמה אינטראקטיבית של העוזר", "Sample deal. Runs in your browser; nothing is sent.": "עסקת דוגמה. רץ בדפדפן, שום דבר לא נשלח.",
  Reset: "איפוס", "Negev Robotics, fleet pilot": "נגב רובוטיקס, פיילוט צי", "Call notes": "סיכום השיחה", "Paste or type notes from a call": "מדביקים או כותבים סיכום שיחה",
  "Nothing to propose yet. Mention an amount, a date or a next step.": "עדיין אין מה להציע. כדאי לציין סכום, תאריך או צעד הבא.",
  "Unchecked items are discarded.": "פריטים שלא סומנו לא יבוצעו.", "via assistant, approved by you": "דרך העוזר, באישור שלך",
  "Move the stage to {x}": "להעביר לשלב {x}", "Set the amount to {x}": "לעדכן את הסכום ל-{x}", "Set the close date to {x}": "לעדכן את תאריך הסגירה ל-{x}",
  "Create the task “Send the proposal”, due in 2 days": "ליצור משימה “לשלוח את ההצעה”, יעד בעוד יומיים",
  "Create the task “Book the site visit”, due in 5 days": "ליצור משימה “לתאם ביקור באתר”, יעד בעוד 5 ימים",
  "Save these call notes on the deal": "לשמור את סיכום השיחה בעסקה",
  "A ranked list of where to start, every morning.": "כל בוקר, רשימה מדורגת של מאיפה להתחיל.",
  "The assistant reads deal health, overdue tasks and hot leads, then writes a short memo. Every line links to its record.":
    "העוזר קורא את בריאות העסקאות, המשימות באיחור והלידים החמים, וכותב מזכר קצר. כל שורה מקשרת לרשומה שלה.",
  "Sample morning memo": "מזכר בוקר לדוגמה", "Sample memo": "מזכר לדוגמה",
  "Two deals worth ₪415K have gone quiet; start with Negev Robotics before Thursday.": "שתי עסקאות בשווי ₪415K שקטות מדי. כדאי להתחיל בנגב רובוטיקס לפני יום חמישי.",
  "Proposal promised for Thursday. No task exists for it yet.": "הובטחה הצעה עד יום חמישי, ועדיין אין לה משימה.",
  "Yam Logistics, renewal": "ים לוגיסטיקה, חידוש", "No contact in 16 days and the close date passed last week.": "אין מגע 16 ימים, ותאריך הסגירה עבר בשבוע שעבר.",
  "Orion Cyber, pilot": "אוריון סייבר, פיילוט", "Grade A lead from a referral, still unassigned.": "ליד בדרגה A מהפניה, עדיין בלי אחראי.",
  "Also in the workspace": "עוד בסביבת העבודה",
  "A pipeline you drag": "צנרת שגוררים", "The same deals as a table with saved views, or as a board you drag across six stages.": "אותן עסקאות כטבלה עם תצוגות שמורות, או כלוח שגוררים בו בין שישה שלבים.",
  "Lead scores with reasons": "ציון לידים עם נימוק", "Every point names its cause: a business email, a decision-maker title, a stated budget.": "לכל נקודה יש סיבה: אימייל עסקי, תפקיד של מקבל/ת החלטות, תקציב מוצהר.",
  "Rules in plain language": "כללים בשפה פשוטה", "Describe a rule in English or Hebrew; the assistant drafts it and the engine checks it before you save.": "מתארים כלל בעברית או באנגלית, העוזר מנסח אותו והמנוע בודק אותו לפני השמירה.",
  "A timeline with sources": "טיימליין עם מקורות", "Every change shows who made it, by hand, by a rule or by the assistant, with the field before and after.": "כל שינוי מראה מי ביצע אותו, ידנית, כלל או העוזר, עם הערך לפני ואחרי.",
  "Hebrew and English": "עברית ואנגלית", "The whole interface mirrors for right-to-left, with light and dark themes.": "כל הממשק מתהפך לימין-לשמאל, עם ערכה בהירה וכהה.",
  "Try it on the sample workspace.": "לנסות על סביבת הדוגמה.", "Twelve companies, thirty deals and twenty leads, reset whenever the server restarts.": "שתים עשרה חברות, שלושים עסקאות ועשרים לידים, מתאפסים בכל הפעלה מחדש של השרת.",
  "Redline is open source under the MIT license.": "Redline הוא קוד פתוח ברישיון MIT.", "Source on GitHub": "הקוד ב-GitHub",
  // deals screen and top bar
  "Open deal": "לפתוח את העסקה",
  Search: "חיפוש", "Redline, today": "Redline, היום", "Account and settings": "חשבון והגדרות", "Changes to review": "שינויים לבדיקה",
  "1 change waiting for review": "שינוי אחד ממתין לבדיקה", "{n} changes waiting for review": "{n} שינויים ממתינים לבדיקה", "Nothing waiting for review": "אין שינויים שממתינים", "The assistant drafted these from your notes.": "העוזר ניסח אותם מתוך ההערות שלך.",
  "Nothing is waiting. Paste call notes on a deal and the assistant drafts the updates.": "אין כרגע כלום. מדביקים הערות משיחה בעסקה והעוזר מנסח את העדכונים.", "1 change": "שינוי אחד", "{n} changes": "{n} שינויים", "Type a name, company, email or domain.": "שם, חברה, אימייל או דומיין.",
  Layout: "תצוגה", Table: "טבלה", Board: "לוח", "Saved views": "תצוגות שמורות",
  Open: "פתוחות", Mine: "שלי", "Closing this month": "נסגרות החודש", "Gone quiet": "השתתקו",
  "1 open": "פתוחה אחת", "{n} open": "{n} פתוחות", worth: "בשווי", "1 change to review": "שינוי אחד לבדיקה",
  "{n} changes to review": "{n} שינויים לבדיקה", Closes: "נסגרת", "Next step": "הצעד הבא", "Last touch": "מגע אחרון",
  None: "אין", Never: "אף פעם", Yesterday: "אתמול", "{n} days ago": "לפני {n} ימים",
  "No deals in this view.": "אין עסקאות בתצוגה הזו.", "Show open deals": "להציג עסקאות פתוחות", "Totals for this view": "סיכומים לתצוגה הזו", Total: "סה\"כ",
  Weighted: "משוקלל", "Won this quarter": "נסגר ברבעון", "1 change from your call with {who}": "שינוי אחד מהשיחה עם {who}", "{n} changes from your call with {who}": "{n} שינויים מהשיחה עם {who}",
  "1 change from your notes": "שינוי אחד מההערות שלך", "{n} changes from your notes": "{n} שינויים מההערות שלך", "Discard these changes": "לבטל את השינויים האלה", Discard: "לבטל",
  "Changes to apply": "שינויים להחלה", "Apply 1 change": "להחיל שינוי אחד", "Apply {n} changes": "להחיל {n} שינויים", "New task": "משימה חדשה",
  Change: "שינוי", "Win chance": "סיכוי זכייה", "Log a call": "תיעוד שיחה", "Paste your notes from a call about {x}. The assistant drafts the updates; nothing changes until you approve.": "מדביקים הערות משיחה על {x}. העוזר מנסח את העדכונים, ושום דבר לא משתנה עד שמאשרים.",
  "Call with Adi: budget approved at 240K, wants the proposal by Thursday…": "שיחה עם עדי: התקציב אושר על 240 אלף, רוצה הצעה עד חמישי…", "Reading your notes…": "קורא את ההערות…", "Draft changes": "לנסח שינויים", "Stage moved to {s}": "השלב עבר ל{s}",
  "Amount set to {x}": "הסכום עודכן ל-{x}", "Deal created": "העסקה נפתחה", "Updated {f}": "עודכן: {f}", details: "פרטים",
  "Recent activity": "פעילות אחרונה",
  // counts
  "Waiting for your approval: 1 change": "ממתין לאישור שלך: שינוי אחד", "Waiting for your approval: {n} changes": "ממתין לאישור שלך: {n} שינויים",
  "in 1 day": "מחר", "1 open deal": "עסקה פתוחה אחת", "1 day": "יום אחד", "1 lead open": "ליד פתוח אחד", "1 deal": "עסקה אחת",
  "due tomorrow": "יעד מחר", "1 run": "הרצה אחת", "day from created to won": "יום מפתיחה ועד סגירה", "days from created to won": "ימים מפתיחה ועד סגירה",
};

export function t(s: string, vars?: Record<string, string | number>): string {
  let out = lang === "he" ? HE[s] ?? s : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}

/** Count-aware translation: the "one" key for exactly 1, the "many" key otherwise. */
export const tn = (n: number, one: string, many: string, vars?: Record<string, string | number>) => t(n === 1 ? one : many, { n, ...vars });

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
  if (lang !== "he") return r.charAt(0).toUpperCase() + r.slice(1);
  for (const [re, f] of REASON_HE) { const m = r.match(re); if (m) return f(m); }
  return r;
}

export const locale = lang === "he" ? "he-IL" : "en-GB";
