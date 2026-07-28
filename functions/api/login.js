import {
  json, bad, uuid, now, verifyPassword, createSession, sessionCookie,
  normalizeSlug, logAudit,
} from '../_shared.js';

// כניסה: כתובת בית הכנסת + שם הגבאי + הסיסמה המשותפת.
// שם גבאי שאינו קיים נוסף אוטומטית — כך גבאי חדש נכנס בלי שאף אחד יגדיר אותו מראש.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const slug = normalizeSlug(body.slug);
  const gabbai = String(body.gabbai || '').trim();
  const password = String(body.password || '');

  if (!slug || !gabbai || !password) return bad('חסרים פרטים');

  const shul = await env.DB.prepare('SELECT * FROM shuls WHERE slug = ?').bind(slug).first();

  // אימות סיסמה גם כשבית הכנסת לא קיים — כדי לא לחשוף אילו כתובות תפוסות
  const ok = shul
    ? await verifyPassword(password, shul.pass_hash, shul.pass_salt)
    : await verifyPassword(password, '0'.repeat(64), '0'.repeat(32));

  if (!shul || !ok) {
    await logAudit(env, {
      shulId: shul?.id || 'unknown', gabbai,
      action: 'login-failed', detail: slug, request,
    });
    return bad('פרטי הכניסה שגויים', 401);
  }
  if (shul.status !== 'active') return bad('החשבון מושהה', 403);

  const known = await env.DB.prepare(
    'SELECT id FROM gabbaim WHERE shul_id = ? AND name = ?'
  ).bind(shul.id, gabbai).first();

  if (!known) {
    await env.DB.prepare(
      'INSERT INTO gabbaim (id, shul_id, name, is_owner, created_at) VALUES (?,?,?,0,?)'
    ).bind(uuid(), shul.id, gabbai, now()).run();
  }

  await logAudit(env, { shulId: shul.id, gabbai, action: 'login', request });

  const token = await createSession(env, { shulId: shul.id, slug: shul.slug, gabbai });
  return json(
    { ok: true, slug: shul.slug, name: shul.name, gabbai },
    { headers: { 'set-cookie': sessionCookie(token) } }
  );
}
