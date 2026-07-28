// אימות מנהל-על. נפרד לחלוטין מהסשן של הגבאים:
// עוגייה אחרת, קידומת אחרת ב-KV, וסיסמה שיושבת כסוד ב-Pages ולא במסד.

import { bad, now } from './_shared.js';

export const ADMIN_COOKIE = 'sb_admin';
const ADMIN_TTL = 60 * 60 * 4; // 4 שעות — קצר יותר מסשן גבאי

const toHex = (buf) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function createAdminSession(env) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.SESSIONS.put(`a:${token}`, JSON.stringify({ at: now() }), {
    expirationTtl: ADMIN_TTL,
  });
  return token;
}

export function adminCookie(token, maxAge = ADMIN_TTL) {
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearAdminCookie = () =>
  `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function readAdminSession(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)sb_admin=([^;]+)/);
  if (!m) return null;
  const token = decodeURIComponent(m[1]);
  const raw = await env.SESSIONS.get(`a:${token}`);
  return raw ? { ...JSON.parse(raw), token } : null;
}

export async function destroyAdminSession(env, token) {
  if (token) await env.SESSIONS.delete(`a:${token}`);
}

export async function requireAdmin(request, env) {
  if (!env.PLATFORM_PASSWORD) {
    return { error: bad('דשבורד המנהל לא הופעל — חסר הסוד PLATFORM_PASSWORD', 503) };
  }
  const session = await readAdminSession(request, env);
  if (!session) return { error: bad('נדרשת התחברות מנהל', 401) };
  return { session };
}

// השוואה בזמן קבוע — מונעת דליפת מידע דרך מדידת זמן התגובה
export function safeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
