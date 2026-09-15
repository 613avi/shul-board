// אסימוני שחזור סיסמה.
//
// האסימון עצמו נשלח במייל ואף פעם לא נשמר: ב-KV נשמר רק ה-SHA-256 שלו.
// כך גם מי שקורא את ה-KV לא יכול לאפס סיסמה של אף בית כנסת — בדיוק אותו
// היגיון שבגללו הסיסמאות עצמן נשמרות כגיבוב.

export const RESET_TTL = 60 * 60;          // שעה — מספיק לפתוח מייל, לא יותר
export const RESET_MAX_PER_IP = 5;         // בקשות שחזור לכתובת IP
export const RESET_MAX_PER_SHUL = 3;       // ולאותו בית כנסת
export const RESET_WINDOW = 60 * 60;

const enc = new TextEncoder();

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function tokenKey(token) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(token)));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `reset:${hex}`;
}

export async function storeToken(env, token, payload) {
  await env.SESSIONS.put(await tokenKey(token), JSON.stringify(payload), { expirationTtl: RESET_TTL });
}

export async function readToken(env, token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
  const raw = await env.SESSIONS.get(await tokenKey(token));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// שימוש חד-פעמי: האסימון נמחק ברגע שנקבעה סיסמה חדשה
export async function burnToken(env, token) {
  await env.SESSIONS.delete(await tokenKey(token)).catch(() => {});
}

// הסתרת אמצע הכתובת, כדי שאפשר יהיה להגיד לגבאי לאן נשלח המייל
// בלי לחשוף כתובת מלאה למי שסתם ניחש slug.
export function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '';
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export function resetEmail({ shulName, link }) {
  const subject = `איפוס סיסמה — ${shulName}`;
  const text = [
    `התקבלה בקשה לאיפוס הסיסמה של "${shulName}" ב-ShulBoard.`,
    '',
    'לקביעת סיסמה חדשה:',
    link,
    '',
    'הקישור תקף לשעה אחת ולשימוש אחד בלבד.',
    'אם לא ביקשתם לאפס — אפשר להתעלם מהמייל הזה, שום דבר לא השתנה.',
  ].join('\n');
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#2c2417">
  <p>התקבלה בקשה לאיפוס הסיסמה של <b>${escapeHtml(shulName)}</b> ב-ShulBoard.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#a37e45;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:bold">קביעת סיסמה חדשה</a></p>
  <p style="font-size:13px;color:#6b5c45">הקישור תקף לשעה אחת ולשימוש אחד בלבד.<br>
  אם לא ביקשתם לאפס — אפשר להתעלם מהמייל הזה, שום דבר לא השתנה.</p>
</div>`;
  return { subject, text, html };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
