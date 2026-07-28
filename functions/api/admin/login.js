import { json, bad, now } from '../../_shared.js';
import {
  createAdminSession, adminCookie, readAdminSession,
  destroyAdminSession, clearAdminCookie, safeEqual,
} from '../../_admin.js';

// הגבלת קצב פשוטה: 5 ניסיונות כושלים ל-IP בכל 15 דקות.
const MAX_TRIES = 5;
const WINDOW = 15 * 60;

export async function onRequestPost({ request, env }) {
  if (!env.PLATFORM_PASSWORD) {
    return bad('דשבורד המנהל לא הופעל — הגדירו את הסוד PLATFORM_PASSWORD', 503);
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rlKey = `rl:admin:${ip}`;
  const tries = parseInt(await env.SESSIONS.get(rlKey) || '0', 10);
  if (tries >= MAX_TRIES) {
    return bad('יותר מדי ניסיונות. נסו שוב בעוד רבע שעה', 429);
  }

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  if (!safeEqual(body.password || '', env.PLATFORM_PASSWORD)) {
    await env.SESSIONS.put(rlKey, String(tries + 1), { expirationTtl: WINDOW });
    await env.DB.prepare(
      'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
    ).bind('platform', null, 'admin-login-failed', null, ip, now()).run().catch(() => {});
    return bad('סיסמה שגויה', 401);
  }

  await env.SESSIONS.delete(rlKey);
  await env.DB.prepare(
    'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
  ).bind('platform', null, 'admin-login', null, ip, now()).run().catch(() => {});

  const token = await createAdminSession(env);
  return json({ ok: true }, { headers: { 'set-cookie': adminCookie(token) } });
}

export async function onRequestDelete({ request, env }) {
  const session = await readAdminSession(request, env);
  await destroyAdminSession(env, session?.token);
  return json({ ok: true }, { headers: { 'set-cookie': clearAdminCookie() } });
}
