import { json, bad, uuid, now, requireAuth, logAudit } from '../../_shared.js';

// אחסון הבייטים ב-KV (הפלטפורמה נשארת במסלול החינמי — בלי R2, בלי כרטיס אשראי).
// KV מגביל ערך ל-25MB; אנחנו מגבילים ל-5MB לקובץ ו-60MB לבית כנסת.
const MAX_FILE = 5 * 1024 * 1024;
const MAX_PER_SHUL = 60 * 1024 * 1024;

const ALLOWED = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'image/gif': 'image', 'image/svg+xml': 'image', 'application/pdf': 'pdf',
};

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  const rows = await env.DB.prepare(
    `SELECT id, filename, content_type, size, kind, created_at, created_by
     FROM media WHERE shul_id = ? ORDER BY created_at DESC`
  ).bind(auth.shul.id).all();

  const items = (rows.results || []).map(r => ({ ...r, url: `/m/${r.id}` }));
  const used = items.reduce((s, r) => s + r.size, 0);

  return json({ ok: true, items, quota: { used, limit: MAX_PER_SHUL, maxFile: MAX_FILE } });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { shul, session } = auth;

  let form;
  try { form = await request.formData(); } catch { return bad('לא התקבל קובץ'); }

  const file = form.get('file');
  if (!file || typeof file === 'string') return bad('לא התקבל קובץ');

  const type = file.type || 'application/octet-stream';
  const kind = ALLOWED[type];
  if (!kind) return bad(`סוג קובץ לא נתמך: ${type}. מותר: תמונות ו-PDF`, 415);
  if (file.size > MAX_FILE) {
    return bad(`הקובץ גדול מדי (${(file.size / 1048576).toFixed(1)}MB). המקסימום הוא 5MB`, 413);
  }

  const usedRow = await env.DB.prepare(
    'SELECT COALESCE(SUM(size), 0) AS used FROM media WHERE shul_id = ?'
  ).bind(shul.id).first();
  if ((usedRow?.used || 0) + file.size > MAX_PER_SHUL) {
    return bad('חרגתם ממכסת האחסון. מחקו קבצים ישנים ונסו שוב', 413);
  }

  const id = uuid();
  const blobKey = `m:${shul.id}:${id}`;
  const bytes = await file.arrayBuffer();

  await env.MEDIA.put(blobKey, bytes, {
    metadata: { contentType: type, filename: file.name, shulId: shul.id },
  });

  const t = now();
  await env.DB.prepare(
    `INSERT INTO media (id, shul_id, blob_key, filename, content_type, size, kind, created_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(id, shul.id, blobKey, file.name || 'file', type, file.size, kind, t, session.gabbai).run();

  await logAudit(env, {
    shulId: shul.id, gabbai: session.gabbai,
    action: 'upload', detail: file.name, request,
  });

  return json({
    ok: true,
    item: {
      id, filename: file.name, content_type: type, size: file.size,
      kind, created_at: t, created_by: session.gabbai, url: `/m/${id}`,
    },
  }, { status: 201 });
}
