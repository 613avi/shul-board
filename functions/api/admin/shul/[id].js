import { json, bad, now } from '../../../_shared.js';
import { requireAdmin } from '../../../_admin.js';
import { ensureScreensTable } from '../../../_screens.js';

async function loadShul(env, id) {
  return env.DB.prepare('SELECT * FROM shuls WHERE id = ?').bind(id).first();
}

// השהיה / הפעלה מחדש
export async function onRequestPatch({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const shul = await loadShul(env, String(params.id));
  if (!shul) return bad('בית הכנסת לא נמצא', 404);

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const status = String(body.status || '');
  if (!['active', 'suspended'].includes(status)) return bad('סטטוס לא חוקי');

  await env.DB.prepare('UPDATE shuls SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, now(), shul.id).run();

  await env.DB.prepare(
    'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
  ).bind(
    shul.id, null, status === 'active' ? 'admin-activate' : 'admin-suspend',
    shul.slug, request.headers.get('cf-connecting-ip') || null, now()
  ).run().catch(() => {});

  return json({ ok: true, id: shul.id, status });
}

// מחיקה מלאה. דורש אישור מפורש עם ה-slug — כדי שלחיצה בטעות לא תמחק בית כנסת.
export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const shul = await loadShul(env, String(params.id));
  if (!shul) return bad('בית הכנסת לא נמצא', 404);

  const confirm = new URL(request.url).searchParams.get('confirm');
  if (confirm !== shul.slug) {
    return bad('כדי למחוק יש לשלוח confirm=<slug> תואם', 400, { expected: shul.slug });
  }

  // מוחקים קודם את הבייטים מ-KV; אין FK cascade אמין ב-D1, אז מוחקים במפורש.
  const media = await env.DB.prepare('SELECT blob_key FROM media WHERE shul_id = ?')
    .bind(shul.id).all();
  for (const row of media.results || []) {
    await env.MEDIA.delete(row.blob_key).catch(() => {});
  }

  await ensureScreensTable(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM screens  WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM media    WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM settings WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM gabbaim  WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM shuls    WHERE id = ?').bind(shul.id),
  ]);

  // היומן נשאר בכוונה — עקבות מחיקה שווים יותר מניקיון
  await env.DB.prepare(
    'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
  ).bind(
    shul.id, null, 'admin-delete', `${shul.slug} · ${shul.name}`,
    request.headers.get('cf-connecting-ip') || null, now()
  ).run().catch(() => {});

  return json({ ok: true, deleted: shul.slug, mediaRemoved: (media.results || []).length });
}
