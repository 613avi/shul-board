import { json, bad } from '../../../_shared.js';
import { requireAdmin } from '../../../_admin.js';
import { ensureContactTable } from '../../../_contact.js';

const STATUSES = new Set(['new', 'read', 'done']);

// סימון פנייה כנקראה / טופלה
export async function onRequestPatch({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }
  if (!STATUSES.has(body.status)) return bad('סטטוס לא תקין');

  await ensureContactTable(env);
  const res = await env.DB.prepare('UPDATE contact SET status = ? WHERE id = ?')
    .bind(body.status, String(params.id)).run();
  if (!res.meta?.changes) return bad('הפנייה לא נמצאה', 404);
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  await ensureContactTable(env);
  await env.DB.prepare('DELETE FROM contact WHERE id = ?').bind(String(params.id)).run();
  return json({ ok: true });
}
