// שליחת מייל יוצא — משמש כרגע רק לשחזור סיסמה.
//
// ל-Cloudflare Workers אין שליחת מייל מובנית, ו-SMTP לא זמין משם. לכן שולחים
// דרך API של ספק. התמיכה כאן בשני ספקים, ובוחרים לפי הסוד שהוגדר ב-Pages:
//
//   Brevo   — brevo.com. מסלול חינמי, 300 מיילים ליום, ומאפשר לאמת כתובת
//             שולח בודדת (למשל Gmail) בלי דומיין משלכם. זו הבחירה הנכונה
//             כשעוד אין דומיין.
//   Resend  — resend.com. נעים יותר לעבודה, אבל שליחה לכל אחד דורשת דומיין
//             מאומת. עדיף כשכבר יש דומיין.
//
// ההגדרה:
//   wrangler pages secret put BREVO_API_KEY  --project-name shul-board
//   wrangler pages secret put MAIL_FROM      --project-name shul-board
//   (רשות) MAIL_FROM_NAME — שם התצוגה של השולח
//
// בלי הסודות האלה שחזור הסיסמה במייל פשוט כבוי, והגבאי מופנה ל"יצירת קשר".
// שום מסלול אחר במערכת לא תלוי בזה.

export function mailConfigured(env) {
  return Boolean(env.MAIL_FROM && (env.BREVO_API_KEY || env.RESEND_API_KEY));
}

export async function sendMail(env, { to, subject, text, html }) {
  if (!mailConfigured(env)) throw new Error('שליחת מייל לא מוגדרת');

  const from = String(env.MAIL_FROM);
  const fromName = String(env.MAIL_FROM_NAME || 'ShulBoard');

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
