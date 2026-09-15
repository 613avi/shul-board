import { json, bad, normalizeSlug, ensureShulEmail, logAudit } from '../_shared.js';
import { mailConfigured, sendMail } from '../_mail.js';
import {
  newToken, storeToken, maskEmail, resetEmail,
  RESET_MAX_PER_IP, RESET_MAX_PER_SHUL, RESET_WINDOW,
} from '../_recovery.js';

// בקשת שחזור סיסמה: שולח לגבאי קישור למייל שרשום לבית הכנסת.
//
// התשובה זהה תמיד — גם לבית כנסת שלא קיים, וגם לכזה בלי מייל רשום. אחרת
// הטופס הזה היה הופך לכלי לגילוי אילו בתי כנסת קיימים ואילו מהם רשמו מייל.
// היחיד שמקבל מידע אמיתי הוא מי שיש לו גישה לתיבה.
export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  if (!mailConfigured(env)) {
    return bad('שחזור במייל לא מופעל בשרת הזה. פנו דרך טופס יצירת הקשר בדף הבית', 503);
  }

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }
  const slug = normalizeSlug(body.slug);
  if (!slug) return bad('נא למלא את כתובת בית הכנסת');

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  // שתי מכסות: אחת שמונעת סריקה של הרבה בתי כנסת מאותו מקום, ואחת שמונעת
  // הצפה של תיבה אחת — גם אם התוקף מחליף כתובות IP.
  for (const [key, max] of [[`rl:reset:ip:${ip}`, RESET_MAX_PER_IP], [`rl:reset:shul:${slug}`, RESET_MAX_PER_SHUL]]) {
    const tries = parseInt(await env.SESSIONS.get(key) || '0', 10);
    if (tries >= max) return bad('נשלחו כבר כמה בקשות. נסו שוב בעוד שעה, או פנו דרך טופס יצירת הקשר', 429);
    await env.SESSIONS.put(key, String(tries + 1), { expirationTtl: RESET_WINDOW });
  }

  await ensureShulEmail(env);
  const shul = await env.DB.prepare(
    'SELECT id, slug, name, email, status FROM shuls WHERE slug = ?'
  ).bind(slug).first();

  const generic = json({ ok: true, sent: true });
  if (!shul || shul.status !== 'active' || !shul.email) return generic;

  const token = newToken();
  await storeToken(env, token, { shulId: shul.id, slug: shul.slug, email: shul.email });

  const link = `${new URL(request.url).origin}/reset?t=${token}`;
  const mail = resetEmail({ shulName: shul.name, link });

  try {
    await sendMail(env, { to: shul.email, ...mail });
  } catch (e) {
    // תקלה אצל ספק המייל לא אמורה לגלות לפונה שבית הכנסת קיים
    console.error('reset mail', e.message);
    return generic;
  }

  await logAudit(env, {
    shulId: shul.id, gabbai: null, action: 'password-reset-requested',
    detail: maskEmail(shul.email), request,
  }).catch(() => {});

  return generic;
}

export const onRequestGet = () => bad('שיטה לא נתמכת', 405);
