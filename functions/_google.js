// כניסה עם חשבון Google.
//
// למה: הסיסמה של בית כנסת משותפת לכל הגבאים, ומי ששוכח אותה תלוי בפנייה ידנית.
// חשבון Google פותר את שתי הבעיות בבת אחת — זהות מאומתת בלי סיסמה לזכור, ובלי
// שנצטרך ספק מייל משלנו.
//
// זרימה: Authorization Code. הגבאי מועבר ל-Google, חוזר עם code, והשרת מחליף
// אותו ל-id_token **מול Google ישירות** (TLS, עם client_secret). כיוון שהאסימון
// מגיע בערוץ הישיר הזה ולא דרך הדפדפן, אין צורך לאמת את חתימת ה-JWT — כך גם
// מתועד אצל Google. זו הסיבה שלא בחרנו בזרימת ID-token מהדפדפן.
//
// ההגדרה (Google Cloud → APIs & Services → Credentials → OAuth client, סוג Web):
//   Authorized redirect URI:  https://<הדומיין>/api/auth/google/callback
//   wrangler pages secret put GOOGLE_CLIENT_ID     --project-name shul-board
//   wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name shul-board
//
// בלי שני הסודות האלה התכונה כבויה לגמרי והכפתורים לא מוצגים.

import { now } from './_shared.js';

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const STATE_TTL = 10 * 60;      // הזמן שיש לגבאי להשלים את המסך של Google
export const PICK_TTL = 5 * 60;        // הזמן לבחור בית כנסת כששייכים לכמה

export const googleConfigured = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const redirectUri = (origin) => `${origin}/api/auth/google/callback`;

const SQL = `CREATE TABLE IF NOT EXISTS google_links (
  id         TEXT PRIMARY KEY,
  shul_id    TEXT NOT NULL,
  sub        TEXT NOT NULL,          -- מזהה החשבון אצל Google, יציב גם אם המייל משתנה
  email      TEXT,
  gabbai     TEXT NOT NULL,          -- שם הגבאי שאיתו ייכנס בעל החשבון הזה
  created_at INTEGER NOT NULL,
  UNIQUE (shul_id, sub)
)`;

// יצירה עצלה, כמו טבלאות הפניות והמסכים
export async function ensureGoogleTable(env) {
  await env.DB.prepare(SQL).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_google_sub ON google_links(sub)').run();
}

const rand = () => [...crypto.getRandomValues(new Uint8Array(24))]
  .map(b => b.toString(16).padStart(2, '0')).join('');

// ---------- state: הגנת CSRF על מסע ההרשאה ----------
export async function saveState(env, payload) {
  const state = rand();
  await env.SESSIONS.put(`gstate:${state}`, JSON.stringify(payload), { expirationTtl: STATE_TTL });
  return state;
}

// חד-פעמי: נמחק ברגע שנקרא, כדי שאותו state לא ישמש פעמיים
export async function takeState(env, state) {
  if (!/^[0-9a-f]{48}$/.test(String(state || ''))) return null;
  const key = `gstate:${state}`;
  const raw = await env.SESSIONS.get(key);
  await env.SESSIONS.delete(key).catch(() => {});
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ---------- אסימון בחירה, לגבאי ששייך לכמה בתי כנסת ----------
export async function savePick(env, shulIds) {
  const token = rand();
  await env.SESSIONS.put(`gpick:${token}`, JSON.stringify(shulIds), { expirationTtl: PICK_TTL });
  return token;
}

export async function readPick(env, token) {
  if (!/^[0-9a-f]{48}$/.test(String(token || ''))) return null;
  const raw = await env.SESSIONS.get(`gpick:${token}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function burnPick(env, token) {
  await env.SESSIONS.delete(`gpick:${token}`).catch(() => {});
}

// ---------- החלפת code ב-id_token ----------
export async function exchangeCode(env, { code, origin }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const body = await res.json();
  const claims = decodeJwtPayload(body.id_token);
  if (!claims?.sub) throw new Error('google id_token חסר sub');

  // בדיקת aud גם כאן: זו הגנה זולה מפני טעות הגדרה שבה הוגדר client אחר
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('google id_token לא מיועד לאפליקציה הזאת');

  return {
    sub: String(claims.sub),
    email: claims.email ? String(claims.email) : null,
    emailVerified: claims.email_verified === true,
    name: claims.name ? String(claims.name) : '',
  };
}

// פענוח בלבד, בלי אימות חתימה — האסימון הגיע מ-Google בערוץ ישיר (ראו למעלה)
function decodeJwtPayload(jwt) {
  const part = String(jwt || '').split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  try {
    // atob מחזיר בתים; הטענה מכילה עברית אפשרית בשם, ולכן דרך TextDecoder
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export async function linkRow(env, { shulId, sub }) {
  return env.DB.prepare('SELECT * FROM google_links WHERE shul_id = ? AND sub = ?')
    .bind(shulId, sub).first();
}

export async function addLink(env, { shulId, sub, email, gabbai }) {
  await env.DB.prepare(
    `INSERT INTO google_links (id, shul_id, sub, email, gabbai, created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (shul_id, sub) DO UPDATE SET email = excluded.email, gabbai = excluded.gabbai`
  ).bind(rand(), shulId, sub, email, gabbai, now()).run();
}

// כל בתי הכנסת הפעילים שאליהם משויך החשבון הזה
export async function shulsForSub(env, sub) {
  const rows = await env.DB.prepare(
    `SELECT g.shul_id, g.gabbai, s.slug, s.name
     FROM google_links g JOIN shuls s ON s.id = g.shul_id
     WHERE g.sub = ? AND s.status = 'active'
     ORDER BY s.name`
  ).bind(sub).all();
  return rows.results || [];
}
