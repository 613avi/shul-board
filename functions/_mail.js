// שליחת מייל יוצא — משמש כרגע רק לשחזור סיסמה.
//
// ל-Cloudflare Workers אין שליחת מייל מובנית, ו-SMTP לא זמין משם (פורט 25 חסום,
// וגם אם היינו כותבים לקוח SMTP מעל cloudflare:sockets — Google חוסם התחברויות
// מכתובות IP של דאטה-סנטר שמתחלפות). לכן שולחים דרך HTTP. שלושה ספקים נתמכים,
// והבחירה לפי הסודות שהוגדרו ב-Pages:
//
//   Apps Script — ממסר קטן שרץ בחשבון Google שלכם (tools/gmail-relay.gs).
//                 המייל יוצא **באמת** מה-Gmail שלכם, ולכן ה-SPF וה-DKIM
//                 מתיישרים ואין נחיתות בספאם. בלי דומיין ובלי ספק חיצוני.
//                 מכסה: 100 נמענים ביום בחשבון Gmail רגיל.
//   Brevo       — מסלול חינמי, 300 ליום, מאמת כתובת שולח בודדת בלי דומיין.
//                 עובד, אבל שליחה "מטעם" כתובת @gmail.com דרך צד שלישי לא
//                 מתיישרת ב-DMARC, וחלק מהמיילים ינחתו בספאם.
//   Resend      — נעים לעבודה, אבל דורש דומיין מאומת.
//
// ההגדרה (אחת מהשלוש):
//   wrangler pages secret put GAS_MAIL_URL    --project-name shul-board
//   wrangler pages secret put GAS_MAIL_SECRET --project-name shul-board
//     — או —
//   wrangler pages secret put BREVO_API_KEY   --project-name shul-board
//   wrangler pages secret put MAIL_FROM       --project-name shul-board
//   (רשות בשתיהן) MAIL_FROM_NAME — שם התצוגה של השולח
//
// בלי הסודות האלה שחזור הסיסמה במייל פשוט כבוי, והגבאי מופנה ל"יצירת קשר".
// שום מסלול אחר במערכת לא תלוי בזה.

const gasReady = (env) => Boolean(env.GAS_MAIL_URL && env.GAS_MAIL_SECRET);
const apiReady = (env) => Boolean(env.MAIL_FROM && (env.BREVO_API_KEY || env.RESEND_API_KEY));

export function mailConfigured(env) {
  return gasReady(env) || apiReady(env);
}

export async function sendMail(env, { to, subject, text, html }) {
  if (!mailConfigured(env)) throw new Error('שליחת מייל לא מוגדרת');
  const fromName = String(env.MAIL_FROM_NAME || 'ShulBoard');

  // הממסר עדיף כשהוגדר: אותה תיבה, דליוורביליות טובה יותר
  if (gasReady(env)) return sendViaAppsScript(env, { to, subject, text, html, fromName });

  const from = String(env.MAIL_FROM);
  const [url, headers, body] = env.BREVO_API_KEY
    ? [
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': env.BREVO_API_KEY },
      { sender: { email: from, name: fromName }, to: [{ email: to }], subject, textContent: text, htmlContent: html },
    ]
    : [
      'https://api.resend.com/emails',
      { authorization: `Bearer ${env.RESEND_API_KEY}` },
      { from: `${fromName} <${from}>`, to: [to], subject, text, html },
    ];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // גוף התשובה של הספק עוזר מאוד לאבחון (מפתח לא תקין, שולח לא מאומת),
    // ולכן הוא נכנס לשגיאה — היא נרשמת בלוג ולא מוצגת למשתמש.
    throw new Error(`mail ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// ---------- ממסר Apps Script ----------
// שני דברים מיוחדים כאן:
// 1. Web App של Apps Script עונה 302 אל script.googleusercontent.com, ושם יושב
//    הגוף האמיתי. fetch עוקב לבד, ולכן אין מה לעשות — רק לא להיבהל מהניתוב.
// 2. הסקריפט מחזיר 200 גם כששליחה נכשלה אצלו, ולכן הסימן להצלחה הוא גוף
//    התשובה ("ok") ולא קוד הסטטוס.
async function sendViaAppsScript(env, { to, subject, text, html, fromName }) {
  const res = await fetch(String(env.GAS_MAIL_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.GAS_MAIL_SECRET, to, subject, text, html, fromName }),
  });

  const body = (await res.text()).trim();
  if (!res.ok) throw new Error(`gas mail ${res.status}: ${body.slice(0, 300)}`);
  if (!body.startsWith('ok')) throw new Error(`gas mail: ${body.slice(0, 300)}`);
}
