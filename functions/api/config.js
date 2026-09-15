import { json } from '../_shared.js';
import { googleConfigured } from '../_google.js';
import { mailConfigured } from '../_mail.js';

// אילו תכונות אופציונליות מופעלות בשרת הזה. ציבורי בכוונה: הדפדפן צריך לדעת
// אם להציג את כפתור Google ואת קישור השחזור עוד לפני שיש סשן. אין כאן שום סוד,
// רק "כן/לא" — אותו מידע שממילא נלמד מלחיצה על הכפתור.
export async function onRequestGet({ env }) {
  return json({
    ok: true,
    google: googleConfigured(env),
    mailReset: mailConfigured(env),
  });
}
