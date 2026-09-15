import { json, bad, requireAuth, logAudit } from '../../../_shared.js';
import { googleConfigured, ensureGoogleTable } from '../../../_google.js';

// החשבונות המשויכים לבית הכנסת המחובר, והסרה שלהם.
export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  await ensureGoogleTable(env);
  const rows = await env.DB.prepare(
    'SELECT id, email, gabbai, created_at FROM google_links WHERE shul_id = ? ORDER BY created_at'
  ).bind(auth.shul.id).all();

  return json({ ok: true, enabled: googleConfigured(env), links: rows.results || [] });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get('id') || '';
  await ensureGoogleTable(env);
  // התניה על shul_id: גבאי לא יכול להסיר שיוך של בית כנסת אחר גם אם ניחש מזהה
  const res = await env.DB.prepare('DELETE FROM google_links WHERE id = ? AND shul_id = ?')
    .bind(id, auth.shul.id).run();
  if (!res.meta?.changes) return bad('השיוך לא נמצא', 404);

  await logAudit(env, {
    shulId: auth.shul.id, gabbai: auth.session.gabbai, action: 'google-unlink', detail: null, request,
  }).catch(() => {});

  return json({ ok: true });
}
