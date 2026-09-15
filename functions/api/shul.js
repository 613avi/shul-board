import { json, bad, now, requireAuth, ensureShulEmail, isEmail, logAudit } from '../_shared.js';

// עריכת פרטי השחזור של בית הכנסת על ידי גבאי מחובר.
//
// זה מה שמאפשר שחזור סיסמה עצמי: בלי מייל רשום, גבאי ששכח את הסיסמה תלוי
// בפנייה ידנית ובזיהוי מול הטלפון שנרשם בהרשמה.
export async function onRequestPut({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { shul, session } = auth;

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const email = String(body.email ?? '').trim().slice(0, 120);
  const contact = String(body.contact ?? '').trim().slice(0, 80);
  if (email && !isEmail(email)) return bad('כתובת המייל לא תקינה');

  await ensureShulEmail(env);
  await env.DB.prepare('UPDATE shuls SET email = ?, contact = ?, updated_at = ? WHERE id = ?')
    .bind(email || null, contact || null, now(), shul.id).run();

  // ביומן נרשם שפרטי השחזור שונו ומי שינה — הכתובת עצמה לא, כדי שמי שקורא
  // את היומן בניהול לא יראה כתובת מייל של גבאי אחר.
  await logAudit(env, {
    shulId: shul.id, gabbai: session.gabbai, action: 'recovery-update', detail: null, request,
  }).catch(() => {});

  return json({ ok: true, email: email || null, contact: contact || null });
}

export const onRequestGet = () => bad('שיטה לא נתמכת', 405);
