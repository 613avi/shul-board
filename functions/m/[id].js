// הגשת מדיה לצג. ציבורי (התוכן ממילא מוצג על מסך בבית הכנסת),
// ועם cache ארוך — המזהה קבוע, אז הקצה מגיש חזרות בלי להעיר Function.

export async function onRequestGet({ env, params }) {
  const id = String(params.id);

  const row = await env.DB.prepare(
    'SELECT blob_key, content_type, filename, size FROM media WHERE id = ?'
  ).bind(id).first();

  if (!row) return new Response('לא נמצא', { status: 404 });

  const body = await env.MEDIA.get(row.blob_key, 'arrayBuffer');
  if (!body) return new Response('לא נמצא', { status: 404 });

  return new Response(body, {
    headers: {
      'content-type': row.content_type,
      'content-length': String(row.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      'x-content-type-options': 'nosniff',
    },
  });
}
