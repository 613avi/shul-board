// פניות מדף הבית — "יצירת קשר".
//
// הפנייה נשמרת ב-D1 ומוצגת בדשבורד מנהל המערכת (/manage.html). אין תלות בשירות
// חיצוני ואין כתובת מייל שמתפרסמת באתר. מי שרוצה התראה מיידית יכול להגדיר את
// הסוד CONTACT_WEBHOOK ב-Pages — כל פנייה תישלח אליו גם כ-JSON (טלגרם, Slack וכו׳).

export const MAX_PER_IP = 5;                 // פניות לכתובת IP
export const RL_WINDOW = 60 * 60;            // בתוך שעה
export const MAX_ROWS = 5000;                // תקרה, כדי שהטבלה לא תגדל בלי גבול

const SQL = `CREATE TABLE IF NOT EXISTS contact (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  contact    TEXT,
  shul       TEXT,
  topic      TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  ip         TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
)`;

// יצירה עצלה, כמו templates ו-screens: פריסה חדשה לא דורשת הרצת סכימה ידנית
export async function ensureContactTable(env) {
  await env.DB.prepare(SQL).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_contact_new ON contact(status, created_at DESC)'
  ).run();
}

export const TOPICS = {
  help: 'עזרה בהקמה',
  bug: 'תקלה',
  idea: 'רעיון לשיפור',
  other: 'אחר',
};

export const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const cleanText = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

// כמה פניות חדשות ממתינות — לאריח בדשבורד. נכשל בשקט אם הטבלה עוד לא נוצרה.
export async function newContactCount(env) {
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM contact WHERE status = 'new'"
    ).first();
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}
