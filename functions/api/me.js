import { json, requireAuth } from '../_shared.js';

// מצב ההתחברות + הקשר בית הכנסת, לטעינת ממשק הניהול.
export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { session, shul } = auth;

  const gabbaim = await env.DB.prepare(
    'SELECT name, is_owner FROM gabbaim WHERE shul_id = ? ORDER BY is_owner DESC, name'
  ).bind(shul.id).all();

  const recent = await env.DB.prepare(
    'SELECT gabbai, action, detail, created_at FROM audit WHERE shul_id = ? ORDER BY created_at DESC LIMIT 15'
  ).bind(shul.id).all();

  const url = new URL(request.url);
  return json({
    ok: true,
    gabbai: session.gabbai,
    shul: {
      slug: shul.slug,
      name: shul.name,
      contact: shul.contact,
      createdAt: shul.created_at,
    },
    urls: {
      display: `${url.origin}/s/${shul.slug}`,
      installer: `${url.origin}/download/ShulBoard-Setup-${shul.slug}.exe`,
    },
    gabbaim: gabbaim.results || [],
    recentActivity: recent.results || [],
  });
}
