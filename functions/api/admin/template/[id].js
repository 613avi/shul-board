import { json, bad } from '../../../_shared.js';
import { requireAdmin } from '../../../_admin.js';
import { ensureTable } from '../../../_templates.js';

// מנהל המערכת: הסתרה/מחיקה של תבנית קהילה לא ראויה
export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  await ensureTable(env);
  const res = await env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(String(params.id)).run();
  if (!res.meta?.changes) return bad('התבנית לא נמצאה', 404);
  return json({ ok: true });
}

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }
  const status = body.status === 'hidden' ? 'hidden' : 'public';
  await ensureTable(env);
  await env.DB.prepare('UPDATE templates SET status = ? WHERE id = ?').bind(status, String(params.id)).run();
  return json({ ok: true, status });
}
