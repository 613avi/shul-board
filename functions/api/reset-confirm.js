import { json, bad, now, hashPassword, logAudit } from '../_shared.js';
import { readToken, burnToken } from '../_recovery.js';

// קביעת סיסמה חדשה מתוך קישור השחזור. האסימון חד-פעמי ותקף לשעה.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const token = String(body.token || '');
  const password = String(body.password || '');

  const data = await readToken(env, token);
  if (!data) return bad('הקישור פג תוקף או כבר שימש. בקשו קישור חדש', 410);
  if (password.length < 6) return bad('הסיסמה חייבת להיות באורך 6 תווים לפחות');

  const shul = await env.DB.prepare('SELECT id, slug, name, status FROM shuls WHERE id = ?')
    .bind(data.shulId).first();
  if (!shul || shul.status !== 'active') {
    await burnToken(env, token);
    return bad('בית הכנסת לא נמצא', 404);
  }

  const { hash, salt } = await hashPassword(password);
  await env.DB.prepare('UPDATE shuls SET pass_hash = ?, pass_salt = ?, updated_at = ? WHERE id = ?')
    .bind(hash, salt, now(), shul.id).run();

  // שריפה אחרי ההצלחה: קישור אחד, שימוש אחד
  await burnToken(env, token);

  await logAudit(env, {
    shulId: shul.id, gabbai: null, action: 'password-reset', detail: null, request,
  }).catch(() => {});

  return json({ ok: true, slug: shul.slug, name: shul.name });
}

// בדיקת תקינות הקישור לפני שמציגים טופס — כדי לא לבקש סיסמה חדשה לחינם
export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const data = await readToken(env, token);
  if (!data) return bad('הקישור פג תוקף או כבר שימש. בקשו קישור חדש', 410);
  return json({ ok: true, slug: data.slug });
}
