import { json, bad, requireAuth, logAudit } from '../../_shared.js';
import { ensureTable } from '../../_templates.js';

// שימוש בתבנית — סופר "כמה בתי כנסת השתמשו"
export async function onRequestPost({ request, env, params }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  await ensureTable(env);
  await env.DB.prepare("UPDATE templates SET uses = uses + 1 WHERE id = ? AND status = 'public'")
    .bind(String(params.id)).run();
  return json({ ok: true });
}

// מחיקה — רק בית הכנסת שפרסם
export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  await ensureTable(env);
  const row = await env.DB.prepare('SELECT id, name FROM templates WHERE id = ? AND shul_id = ?')
    .bind(String(params.id), auth.shul.id).first();
  if (!row) return bad('התבנית לא נמצאה', 404);
  await env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(row.id).run();
  await logAudit(env, { shulId: auth.shul.id, gabbai: auth.session.gabbai, action: 'delete-template', detail: row.name, request });
  return json({ ok: true });
}
