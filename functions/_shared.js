// שכבת עזר משותפת לכל ה-Functions: תשובות, אימות, זיהוי בית כנסת.
// קבצים שמתחילים ב-_ אינם נתיבים ב-Pages — רק מודולים.

export const SECTIONS = [
  'config', 'rooms', 'memorial', 'announcements',
  'special-times', 'zmanim-calendar', 'media-playlist', 'screens',
  'dedications', 'shiurim', 'texts',
];

// רשת הפריסה של עורך המסכים. כל הקואורדינטות של הקוביות הן בתאים,
// כך שהפריסה נשארת נכונה בכל רזולוציה ובכל יחס מסך.
export const GRID = { cols: 24, rows: 18 };

export const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', ...(init.headers || {}) },
  });

export const bad = (msg, status = 400, extra = {}) =>
  json({ ok: false, error: msg, ...extra }, { status });

export const now = () => Date.now();

export function uuid() {
  return crypto.randomUUID();
}

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ---------- סיסמאות ----------
// PBKDF2-SHA256, 100k סבבים. לא שומרים סיסמה, רק גיבוב.

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPassword(password, hashHex, saltHex) {
  const { hash } = await hashPassword(password, saltHex);
  // השוואה בזמן קבוע
  if (hash.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

// ---------- סשן ----------
// טוקן אקראי ב-KV. עדיף על JWT כאן: ניתן לבטל מיידית.

const SESSION_TTL = 60 * 60 * 12; // 12 שעות
export const COOKIE = 'sb_session';

export async function createSession(env, { shulId, slug, gabbai }) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.SESSIONS.put(
    `s:${token}`,
    JSON.stringify({ shulId, slug, gabbai, at: now() }),
    { expirationTtl: SESSION_TTL }
  );
  return token;
}

export async function readSession(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)sb_session=([^;]+)/);
  if (!m) return null;
  const raw = await env.SESSIONS.get(`s:${decodeURIComponent(m[1])}`);
  if (!raw) return null;
  try {
    return { ...JSON.parse(raw), token: decodeURIComponent(m[1]) };
  } catch {
    return null;
  }
}

export async function destroySession(env, token) {
  if (token) await env.SESSIONS.delete(`s:${token}`);
}

export function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// שומר סף לנתיבי ניהול. מחזיר את הסשן או Response של שגיאה.
export async function requireAuth(request, env) {
  const session = await readSession(request, env);
  if (!session) return { error: bad('נדרשת התחברות', 401) };
  const shul = await env.DB.prepare('SELECT * FROM shuls WHERE id = ?').bind(session.shulId).first();
  if (!shul) return { error: bad('בית הכנסת לא נמצא', 404) };
  if (shul.status !== 'active') return { error: bad('החשבון מושהה', 403) };
  return { session, shul };
}

// ---------- slug ----------

// תעתיק עברי→לטיני, זהה לזה שבדפדפן (public/js/site.js).
// נדרש כדי ששם בעברית לא ייצור כתובת ריקה כשהלקוח לא שלח slug.
const HEB = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'o', 'ז': 'z',
  'ח': 'ch', 'ט': 't', 'י': 'i', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
  'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'f',
  'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't',
};

export function normalizeSlug(input) {
  return String(input || '')
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'׳״]/g, '')
    .replace(/[א-ת]/g, c => HEB[c] ?? '')
    .trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

const RESERVED = new Set([
  'admin', 'api', 'www', 'app', 'static', 'assets', 'download', 'downloads',
  's', 'm', 'login', 'logout', 'register', 'new', 'help', 'about', 'dashboard',
  'manage', 'root', 'system', 'support', 'billing',
]);

export const slugAvailable = (slug) =>
  slug.length >= 3 && !RESERVED.has(slug);

// זיהוי בית הכנסת: קודם תת-דומיין (לעתיד, כשיהיה דומיין), אחרת נתיב /s/<slug>.
// כך אותו קוד יעבוד ביום שיתווסף דומיין — בלי שינוי.
export function resolveSlug(request) {
  const url = new URL(request.url);
  const host = url.hostname;
  const base = ['pages.dev', 'localhost', '127.0.0.1'];
  const isPlatformHost = base.some(b => host === b || host.endsWith('.' + b));
  if (!isPlatformHost) {
    const parts = host.split('.');
    if (parts.length > 2 && parts[0] !== 'www') return normalizeSlug(parts[0]);
  }
  const m = url.pathname.match(/^\/s\/([^/]+)/);
  return m ? normalizeSlug(m[1]) : null;
}

export async function getShulBySlug(env, slug) {
  if (!slug) return null;
  return env.DB.prepare('SELECT * FROM shuls WHERE slug = ?').bind(slug).first();
}

export async function logAudit(env, { shulId, gabbai, action, detail, request }) {
  try {
    await env.DB.prepare(
      'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
    ).bind(
      shulId, gabbai || null, action, detail || null,
      request?.headers.get('cf-connecting-ip') || null, now()
    ).run();
  } catch {
    // יומן נכשל לא אמור להפיל בקשה
  }
}

// ברירות מחדל לבית כנסת חדש — אותו מבנה שהצג כבר יודע לקרוא.
export const DEFAULTS = {
  config: {
    synagogueName: '',
    location: {
      address: '', latitude: 31.7683, longitude: 35.2137,
      timezone: 'Asia/Jerusalem', candleLightingMinutes: 40,
    },
    displayedZmanim: {
      alotHaShachar: true, misheyakir: true, sunrise: true, sofZmanShma: true,
      sofZmanTfilla: true, chatzot: true, minchaGedola: true, minchaKetana: true,
      plagHaMincha: true, sunset: true, tzeit: true,
      sofZmanShmaMGA: true, sofZmanTfillaMGA: true,
      tzeit72: false, chatzotNight: false,
    },
    theme: { accent: '#d4af37', background: '#0e1320' },
    rotation: { enabled: false, intervalSeconds: 20 },
    zmanimOverrides: {},
    // המראה נבחר מהקטלוג ב-public/js/presets.js. preset הוא כרטיס אחד
    // שקובע צבעים/סגנון/פריסה/גופן; שאר השדות מאפשרים כוונון עדין.
    design: {
      preset: 'jerusalem', theme: 'stone', layout: '3col', style: 'traditional', font: 'classic',
      accent: '', scale: 1, backgroundImage: '', backgroundOverlay: 0.45, logo: { url: '' },
    },
    // מה מוצג על הלוח מעבר לקוביות עצמן. תכונות חדשות דולקות רק להרשמות חדשות —
    // המיגרציה ב-_migrations.js מכבה אותן לבתי כנסת שנשמרו לפניהן.
    display: {
      showUpcoming: true, headerLogo: true,
      todayLine: true,          // שורת "היום": חגים, ראש חודש, חנוכה, שבת מברכים ומולד
      fastTimes: true,          // תחילת וסיום הצום בימי תענית
      nextHighlight: true,      // הדגשת המניין הבא + "בעוד X דק׳"
      hidePast: false,          // הסתרת תפילות שכבר עברו היום
      extendedMentions: true,   // תחנון והלל בשורת ההזכרות
      learning: ['dafyomi'],    // לוחות לימוד יומי לקוביית "לימוד יומי"
      weather: { enabled: false },
      sleep: { enabled: false, from: '23:30', to: '05:00' },
      textsSeconds: 15,         // קצב החלפת הטקסטים/ההקדשות
    },
    // אשף ההקמה מוצג עד שהגבאי מסיים אותו (או מדלג עליו).
    setup: { done: false, step: 1 },
  },
  rooms: {
    rooms: [{
      id: 'main', name: 'היכל מרכזי',
      weekday: { shacharit: ['06:30'], mincha: [], arvit: ['20:00'] },
      shabbat: {
        kabbalat: [], minchaErevOffsets: [-15], shacharit: ['08:30'],
        mincha: [], arvitMotzashOffsets: [30],
      },
      notes: '',
    }],
  },
  memorial: { entries: [] },
  announcements: { entries: [] },
  'special-times': { entries: [] },
  'zmanim-calendar': { entries: {} },

  // חלון המודעות: קבצים שהועלו ומוצגים בסבב בתוך קובייה מסוג media
  'media-playlist': { seconds: 12, fit: 'contain', entries: [] },

  // הקדשות וברכות: לעילוי נשמת / לרפואה / להצלחה / תרומה / מזל טוב — מוצגות בסבב
  dedications: { entries: [] },
  // לוח שיעורים קבוע: { title, lecturer, days:[0..6], time:'HH:MM', place, notes }
  shiurim: { entries: [] },
  // טקסטים מתחלפים: הלכה יומית, פסוק, דבר תורה — { title, body }
  texts: { entries: [] },

  // מסכים מתחלפים. enabled=false משאיר את הפריסה הקלאסית,
  // כך שבתי כנסת קיימים לא משתנים בלי שביקשו.
  screens: {
    enabled: false,
    aspect: '16:9',
    screens: [{
      id: 'main',
      name: 'מסך ראשי',
      seconds: 20,
      blocks: [
        { id: 'b-header',  type: 'header',        x: 0,  y: 0,  w: 24, h: 3 },
        { id: 'b-zmanim',  type: 'zmanim',        x: 16, y: 3,  w: 8,  h: 11 },
        { id: 'b-tef',     type: 'tefillot',      x: 8,  y: 3,  w: 8,  h: 11 },
        { id: 'b-mem',     type: 'memorial',      x: 0,  y: 3,  w: 8,  h: 11 },
        { id: 'b-ment',    type: 'mentions',      x: 0,  y: 14, w: 24, h: 1 },
        { id: 'b-ann',     type: 'announcements', x: 0,  y: 15, w: 24, h: 2 },
        { id: 'b-up',      type: 'upcoming',      x: 0,  y: 17, w: 24, h: 1 },
      ],
    }],
  },
};
