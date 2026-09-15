import { json, bad, createSession, sessionCookie, logAudit } from '../../../_shared.js';
import { ensureGoogleTable, readPick, burnPick } from '../../../_google.js';

// בחירת בית כנסת, כשאותו חשבון Google משויך ליותר מאחד.
// האסימון נוצר ב-callback ותקף חמש דקות; הוא מכיל בדיוק את בתי הכנסת שאותו
// חשבון שויך אליהם, ולכן אי אפשר להיכנס דרכו לבית כנסת אחר.
export async function onRequestGet({ request, env }) {
  const ids = await readPick(env, new URL(request.url).searchParams.get('t'));
  if (!ids) return bad('הבחירה פגה. היכנסו שוב עם Google', 410);

  await ensureGoogleTable(env);
  const rows = await env.DB.prepare(
    `SELECT id, slug, name FROM shuls WHERE status = 'active' AND id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all();

  return json({ ok: true, shuls: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const token = String(body.token || '');
  const shulId = String(body.shulId || '');
  const ids = await readPick(env, token);
  if (!ids) return bad('הבחירה פגה. היכנסו שוב עם Google', 410);
  if (!ids.includes(shulId)) return bad('בית הכנסת לא ברשימה', 403);

  await ensureGoogleTable(env);
  const row = await env.DB.prepare(
    `SELECT g.gabbai, s.id, s.slug, s.name FROM google_links g JOIN shuls s ON s.id = g.shul_id
     WHERE g.shul_id = ? AND s.status = 'active' LIMIT 1`
  ).bind(shulId).first();
  if (!row) return bad('בית הכנסת לא נמצא', 404);

  await burnPick(env, token);
  const session = await createSession(env, { shulId: row.id, slug: row.slug, gabbai: row.gabbai });
  await logAudit(env, { shulId: row.id, gabbai: row.gabbai, action: 'google-login', detail: null, request }).catch(() => {});

  return json({ ok: true, slug: row.slug, name: row.name }, { headers: { 'set-cookie': sessionCookie(session) } });
}
