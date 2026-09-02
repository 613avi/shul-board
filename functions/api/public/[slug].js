import { normalizeSlug, SECTIONS, DEFAULTS } from '../../_shared.js';
import { upgradeAll, APP_VERSION } from '../../_migrations.js';

// המנה הציבורית שהצג צורך. אין כאן שום דבר סודי — זמני תפילה והודעות.
// נשמר ב-cache של הקצה ל-60 שניות כדי לא לשרוף את מכסת הבקשות החינמית:
// מסכים רבים באותו בית כנסת חולקים תשובה אחת מה-CDN.

const TTL = 60;

export async function onRequestGet(context) {
  const { request, env, params } = context;

  // אין כאן שימוש ב-caches.default במכוון. בעבר תשובת HTML של ה-fallback
  // הסטטי ננעלה במטמון הקצה תחת הכתובת הזאת, והצג קיבל HTML במקום JSON
  // בלי שום דרך לנקות מהקוד. במקום זה הצג מוסיף חותמת דקה לכתובת,
  // כך שהשיתוף במטמון נשמר אבל תקלה לא יכולה להינעל ליותר מדקה.

  const slug = normalizeSlug(params.slug);
  const shul = await env.DB.prepare(
    'SELECT id, slug, name, status FROM shuls WHERE slug = ?'
  ).bind(slug).first();

  if (!shul || shul.status !== 'active') {
    return Response.json({ ok: false, error: 'בית הכנסת לא נמצא' }, { status: 404 });
  }

  const rows = await env.DB.prepare(
    'SELECT section, json, updated_at FROM settings WHERE shul_id = ?'
  ).bind(shul.id).all();

  const raw = {};
  let version = 0;
  for (const section of SECTIONS) {
    const row = (rows.results || []).find(r => r.section === section);
    try { raw[section] = row ? JSON.parse(row.json) : DEFAULTS[section]; }
    catch { raw[section] = DEFAULTS[section]; }
    if (row?.updated_at > version) version = row.updated_at;
  }
  // נתונים שנשמרו במבנה ישן מועלים כאן לגרסה הנוכחית — הצג תמיד מקבל מבנה שהוא מכיר
  const data = upgradeAll(raw);

  const body = {
    ok: true,
    slug: shul.slug,
    name: shul.name,
    version,                     // הצג משווה את זה כדי לדעת אם להתרענן
    appVersion: APP_VERSION,     // גרסת הקוד — הצג נטען מחדש כשהיא משתנה
    data,
    servedFrom: request.cf?.colo ?? null,
  };

  return Response.json(body, {
    headers: {
      'cache-control': `public, max-age=${TTL}`,
      'access-control-allow-origin': '*',
      etag: `"${version}"`,
    },
  });
}
