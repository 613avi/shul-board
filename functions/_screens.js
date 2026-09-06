import { SECTIONS } from './_shared.js';

// מסכים בלייב — אילו מכשירים מקרינים את הצג כרגע.
//
// כל צג שולח "דופק" כל 3 דקות (זה אותו בדיקת-עדכונים שהיה שם קודם, כך שמספר
// הבקשות למסך לא גדל). הדופק נכתב ל-D1 ומוצג בלוח הבית של הגבאים ובדשבורד המנהל.
// מסך נחשב "בלייב" אם הדופק האחרון שלו הגיע בחלון הזמן שלמטה.

export const HEARTBEAT_SECONDS = 180;                 // קצב הדופק בצג (display.js)
export const LIVE_WINDOW_MS = 7 * 60 * 1000;          // שני דופקים שהוחמצו — עדיין לא "כבוי"
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;       // מסך שלא נראה שבוע נמחק מהרשימה
export const MAX_PER_SHUL = 300;                      // הגנה מפני הצפה של שורות

const SQL = `CREATE TABLE IF NOT EXISTS screens (
  shul_id      TEXT NOT NULL,
  screen_id    TEXT NOT NULL,
  fp           TEXT,
  label        TEXT,
  user_agent   TEXT,
  width        INTEGER,
  height       INTEGER,
  app_version  TEXT,
  data_version INTEGER,
  ip           TEXT,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  PRIMARY KEY (shul_id, screen_id)
)`;

// יצירה עצלה, כמו templates: פריסה חדשה לא צריכה הרצת סכימה ידנית
export async function ensureScreensTable(env) {
  await env.DB.prepare(SQL).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_screens_seen ON screens(shul_id, last_seen DESC)').run();
}

// רישום דופק. upsert אחד; שורה חדשה נוצרת רק אם לא עברנו את התקרה.
export async function touchScreen(env, shulId, beat, t) {
  const exists = await env.DB.prepare(
    'SELECT 1 AS x FROM screens WHERE shul_id = ? AND screen_id = ?'
  ).bind(shulId, beat.id).first();

  if (!exists) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM screens WHERE shul_id = ?').bind(shulId).first();
    if ((count?.n || 0) >= MAX_PER_SHUL) return false;
  }

  await env.DB.prepare(`
    INSERT INTO screens (shul_id, screen_id, fp, label, user_agent, width, height, app_version, data_version, ip, first_seen, last_seen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(shul_id, screen_id) DO UPDATE SET
      fp = excluded.fp, label = excluded.label, user_agent = excluded.user_agent,
      width = excluded.width, height = excluded.height,
      app_version = excluded.app_version, data_version = excluded.data_version,
      ip = excluded.ip, last_seen = excluded.last_seen
  `).bind(
    shulId, beat.id, beat.fp, beat.label, beat.userAgent, beat.width, beat.height,
    beat.appVersion, beat.dataVersion, beat.ip, t, t
  ).run();
  return true;
}

// חותמת הגרסה של הנתונים — אותו חישוב כמו ב-api/public, כדי שהצג ישווה תפוחים לתפוחים
export async function dataVersion(env, shulId) {
  const marks = SECTIONS.map(() => '?').join(',');
  const row = await env.DB.prepare(
    `SELECT MAX(updated_at) AS v FROM settings WHERE shul_id = ? AND section IN (${marks})`
  ).bind(shulId, ...SECTIONS).first();
  return Number(row?.v) || 0;
}

// רשימת המסכים של בית כנסת, עם סימון מי בלייב.
// מסך שכבה ובמקומו עלה מסך חדש עם אותה טביעת-אצבע (למשל אחרי הפעלה מחדש
// במצב גלישה בסתר, שבו המזהה השמור אובד) — מוסתר, כדי לא להציג כפילויות.
export async function listScreens(env, shulId, t = Date.now()) {
  await env.DB.prepare('DELETE FROM screens WHERE shul_id = ? AND last_seen < ?')
    .bind(shulId, t - KEEP_MS).run().catch(() => {});

  const rows = await env.DB.prepare(
    'SELECT * FROM screens WHERE shul_id = ? ORDER BY last_seen DESC'
  ).bind(shulId).all();

  const all = (rows.results || []).map(r => ({
    id: r.screen_id,
    label: r.label || '',
    fp: r.fp || '',
    userAgent: r.user_agent || '',
    width: r.width || 0,
    height: r.height || 0,
    appVersion: r.app_version || '',
    dataVersion: Number(r.data_version) || 0,
    ip: r.ip || '',
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    live: t - r.last_seen <= LIVE_WINDOW_MS,
  }));

  const liveFps = new Set(all.filter(s => s.live && s.fp).map(s => s.fp));
  const screens = all.filter(s => s.live || !s.fp || !liveFps.has(s.fp));
  return { screens, live: screens.filter(s => s.live).length };
}

// לדשבורד המנהל: כמה מסכים בלייב לכל בית כנסת, בשאילתה אחת.
export async function liveCounts(env, t = Date.now()) {
  const rows = await env.DB.prepare(`
    SELECT shul_id,
           COUNT(*) AS total,
           SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END) AS live
    FROM screens WHERE last_seen >= ? GROUP BY shul_id
  `).bind(t - LIVE_WINDOW_MS, t - KEEP_MS).all();
  const out = {};
  for (const r of rows.results || []) out[r.shul_id] = { live: Number(r.live) || 0, total: Number(r.total) || 0 };
  return out;
}
