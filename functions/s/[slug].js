import { normalizeSlug } from '../_shared.js';
import { APP_VERSION } from '../_migrations.js';

// מגיש את דף הצג עבור בית כנסת מסוים ומזריק את המזהה,
// כך שה-JS לא צריך לנחש אותו מה-URL.
export async function onRequestGet({ request, env, params }) {
  const slug = normalizeSlug(params.slug);

  const shul = await env.DB.prepare(
    'SELECT slug, name, status FROM shuls WHERE slug = ?'
  ).bind(slug).first();

  if (!shul || shul.status !== 'active') {
    const url = new URL(request.url);
    return Response.redirect(`${url.origin}/?missing=${encodeURIComponent(slug)}`, 302);
  }

  const url = new URL(request.url);
  const assetUrl = new URL('/display.html', url.origin);
  const res = await env.ASSETS.fetch(new Request(assetUrl, { headers: request.headers }));
  let html = await res.text();

  html = html.replace(
    '<!--SHUL_BOOTSTRAP-->',
    `<script>window.SHUL = ${JSON.stringify({ slug: shul.slug, name: shul.name })};</script>`
  ).replace('<title>', `<title>${escapeHtml(shul.name)} — `)
   // חותמת גרסה על הנכסים המקומיים: אחרי פריסה הצג מקבל css/js חדשים, לא עותק מהמטמון
   .replace(/(href|src)="(\/(?:css|js)\/[^"?]+)"/g, `$1="$2?v=${APP_VERSION}"`);

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
