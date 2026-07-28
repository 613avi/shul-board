import { json, requireAuth, SECTIONS, DEFAULTS } from '../../_shared.js';

// כל המקטעים בבקשה אחת — ממשק הניהול טוען הכל בפתיחה.
export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  const rows = await env.DB.prepare(
    'SELECT section, json, updated_at, updated_by FROM settings WHERE shul_id = ?'
  ).bind(auth.shul.id).all();

  const data = {};
  const meta = {};
  for (const section of SECTIONS) {
    const row = (rows.results || []).find(r => r.section === section);
    data[section] = row ? JSON.parse(row.json) : DEFAULTS[section];
    meta[section] = row ? { updatedAt: row.updated_at, updatedBy: row.updated_by } : null;
  }

  return json({ ok: true, data, meta });
}
