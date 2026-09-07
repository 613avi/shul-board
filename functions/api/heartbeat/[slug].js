import { normalizeSlug } from '../../_shared.js';
import { APP_VERSION } from '../../_migrations.js';
import { ensureScreensTable, touchScreen, dataVersion, HEARTBEAT_SECONDS } from '../../_screens.js';

// דופק מהצג: "אני כאן, זו הגרסה שאני מציג". לא נשמר במטמון — כל מסך נספר בנפרד.
// התשובה מחליפה את בדיקת העדכונים הישנה: הצג מקבל את חותמת הגרסה הנוכחית
// ואת גרסת הקוד, ומחליט לבד אם לטעון מחדש.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...CORS } });

export const onRequestOptions = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'POST, OPTIONS' } });

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };

export async function onRequestPost({ request, env, params }) {
  const slug = normalizeSlug(params.slug);
  const shul = await env.DB.prepare(
    'SELECT id, status FROM shuls WHERE slug = ?'
  ).bind(slug).first();
  if (!shul || shul.status !== 'active') return reply({ ok: false, error: 'בית הכנסת לא נמצא' }, 404);

  let body = {};
  try {
    const text = await request.text();
    if (text.length > 2048) return reply({ ok: false, error: 'בקשה גדולה מדי' }, 413);
    body = text ? JSON.parse(text) : {};
  } catch { return reply({ ok: false, error: 'בקשה לא תקינה' }, 400); }

  const id = str(body.id, 80).replace(/[^\w.:-]/g, '');
  if (id.length < 4) return reply({ ok: false, error: 'חסר מזהה מסך' }, 400);

  const t = Date.now();
  const beat = {
    id,
    fp: str(body.fp, 40).replace(/[^\w-]/g, '') || null,
    label: str(body.label, 60) || null,
    userAgent: str(request.headers.get('user-agent') || '', 200) || null,
    width: int(body.width, 20000),
    height: int(body.height, 20000),
    appVersion: str(body.appVersion, 20) || null,
    dataVersion: int(body.dataVersion, Number.MAX_SAFE_INTEGER),
    ip: request.headers.get('cf-connecting-ip') || null,
  };

  await ensureScreensTable(env);
  const [version] = await Promise.all([
    dataVersion(env, shul.id),
    touchScreen(env, shul.id, beat, t).catch(() => false),
  ]);

  return reply({
    ok: true,
    version,                       // חותמת הנתונים — שונה ממה שהצג מציג? הוא יטען מחדש
    appVersion: APP_VERSION,       // גרסת הקוד — שונה? הצג טוען את הדף מחדש
    nextInSeconds: HEARTBEAT_SECONDS,
    serverTime: t,
  });
}
