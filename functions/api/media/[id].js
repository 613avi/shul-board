import { json, bad, requireAuth, logAudit } from '../../_shared.js';

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { shul, session } = auth;

  const row = await env.DB.prepare(
    'SELECT id, blob_key, filename FROM media WHERE id = ? AND shul_id = ?'
  ).bind(String(params.id), shul.id).first();

  if (!row) return bad('הקובץ לא נמצא', 404);

  await env.MEDIA.delete(row.blob_key);
  await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(row.id).run();

  await logAudit(env, {
    shulId: shul.id, gabbai: session.gabbai,
    action: 'delete-media', detail: row.filename, request,
  });

  return json({ ok: true, id: row.id });
}
