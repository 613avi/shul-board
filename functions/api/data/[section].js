import { json, bad, now, requireAuth, SECTIONS, DEFAULTS, logAudit } from '../../_shared.js';

// קריאה/כתיבה של מקטע הגדרות אחד של בית הכנסת המחובר.

export async function onRequestGet({ request, env, params }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const section = String(params.section);
  if (!SECTIONS.includes(section)) return bad('מקטע לא מוכר', 404);

  const row = await env.DB.prepare(
    'SELECT json, updated_at, updated_by FROM settings WHERE shul_id = ? AND section = ?'
  ).bind(auth.shul.id, section).first();

  return json({
    ok: true,
    section,
    data: row ? JSON.parse(row.json) : DEFAULTS[section],
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  });
}

export async function onRequestPut({ request, env, params }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { shul, session } = auth;

  const section = String(params.section);
  if (!SECTIONS.includes(section)) return bad('מקטע לא מוכר', 404);

  let data;
  try { data = await request.json(); } catch { return bad('JSON לא תקין'); }
  if (data === null || typeof data !== 'object') return bad('המקטע חייב להיות אובייקט');

  const text = JSON.stringify(data);
  if (text.length > 1_000_000) return bad('המקטע גדול מדי (מעל 1MB)', 413);

  const t = now();
  await env.DB.prepare(
    `INSERT INTO settings (shul_id, section, json, updated_at, updated_by)
     VALUES (?,?,?,?,?)
     ON CONFLICT(shul_id, section) DO UPDATE SET
       json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).bind(shul.id, section, text, t, session.gabbai).run();

  // שם בית הכנסת מוצג בעמוד הבית — משכפלים אותו לטבלת shuls
  if (section === 'config' && typeof data.synagogueName === 'string' && data.synagogueName.trim()) {
    await env.DB.prepare('UPDATE shuls SET name = ?, updated_at = ? WHERE id = ?')
      .bind(data.synagogueName.trim(), t, shul.id).run();
  }

  await logAudit(env, {
    shulId: shul.id, gabbai: session.gabbai,
    action: 'save', detail: section, request,
  });

  return json({ ok: true, section, updatedAt: t, updatedBy: session.gabbai });
}
