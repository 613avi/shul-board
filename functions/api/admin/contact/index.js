import { json } from '../../../_shared.js';
import { requireAdmin } from '../../../_admin.js';
import { ensureContactTable, TOPICS } from '../../../_contact.js';

// רשימת הפניות לדשבורד המנהל. החדשות קודם.
export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  await ensureContactTable(env);
  const rows = await env.DB.prepare(
    `SELECT id, name, contact, shul, topic, message, status, created_at
     FROM contact ORDER BY (status = 'new') DESC, created_at DESC LIMIT 200`
  ).all();

  return json({ ok: true, topics: TOPICS, items: rows.results || [] });
}
