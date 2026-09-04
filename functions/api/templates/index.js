import { json, bad, uuid, now, requireAuth, logAudit } from '../../_shared.js';
import { ensureTable, snapshotLook, rowToTemplate, MAX_PER_SHUL } from '../../_templates.js';

// רשימת התבניות הציבוריות — ציבורי, נשמר במטמון הקצה לדקה
export async function onRequestGet({ env }) {
  await ensureTable(env);
  const rows = await env.DB.prepare(
    "SELECT * FROM templates WHERE status = 'public' ORDER BY uses DESC, created_at DESC LIMIT 100"
  ).all();
  return Response.json(
    { ok: true, items: (rows.results || []).map(rowToTemplate) },
    { headers: { 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' } }
  );
}

// פרסום המראה הנוכחי (כפי שנשמר) כתבנית ציבורית
export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { shul, session } = auth;

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }
  const name = String(body.name || '').trim().slice(0, 60);
  const description = String(body.description || '').trim().slice(0, 200);
  if (name.length < 2) return bad('תנו לתבנית שם (לפחות 2 תווים)');

  await ensureTable(env);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM templates WHERE shul_id = ?').bind(shul.id).first();
  if ((count?.n || 0) >= MAX_PER_SHUL) return bad(`אפשר לפרסם עד ${MAX_PER_SHUL} תבניות לבית כנסת. מחקו תבנית ישנה קודם`, 409);

  const look = await snapshotLook(env, shul.id);
  const id = uuid();
  const t = now();
  await env.DB.prepare(
    'INSERT INTO templates (id, shul_id, name, description, author, json, uses, status, created_at) VALUES (?,?,?,?,?,?,0,?,?)'
  ).bind(id, shul.id, name, description, shul.name, JSON.stringify(look), 'public', t).run();

  await logAudit(env, { shulId: shul.id, gabbai: session.gabbai, action: 'publish-template', detail: name, request });
  return json({ ok: true, item: { id, name, description, author: shul.name, uses: 0, createdAt: t, ...look } }, { status: 201 });
}
