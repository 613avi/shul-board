// תבניות מהקהילה — עזרי גישה משותפים.
// שמירת המראה של בית כנסת כתבנית ציבורית: עיצוב, פריסת מסכים והגדרות תצוגה בלבד.

import { DEFAULTS } from './_shared.js';
import { normalize } from './_migrations.js';

export const MAX_PER_SHUL = 5;

const SQL = `CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  shul_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  author TEXT,
  json TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'public',
  created_at INTEGER NOT NULL
)`;

// יצירה עצלה: פריסה חדשה לא צריכה הרצת סכימה ידנית
export async function ensureTable(env) {
  await env.DB.prepare(SQL).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status, uses DESC, created_at DESC)').run();
}

// המראה של בית הכנסת כפי שנשמר במסד — הלקוח לא שולח תוכן, כדי שלא ייכנס זבל
export async function snapshotLook(env, shulId) {
  const rows = await env.DB.prepare(
    "SELECT section, json FROM settings WHERE shul_id = ? AND section IN ('config', 'screens')"
  ).bind(shulId).all();
  const get = (s) => { const r = (rows.results || []).find(x => x.section === s); try { return r ? JSON.parse(r.json) : null; } catch { return null; } };
  const config = normalize('config', get('config') || DEFAULTS.config);
  const screens = normalize('screens', get('screens') || DEFAULTS.screens);
  const design = { ...config.design };
  delete design.logo;               // הלוגו הוא זהות של בית הכנסת, לא חלק מהמראה
  return { design, screens, display: config.display || { showUpcoming: true } };
}

export function rowToTemplate(r) {
  let look = {};
  try { look = JSON.parse(r.json); } catch {}
  return {
    id: r.id, name: r.name, description: r.description || '', author: r.author || '',
    uses: r.uses || 0, createdAt: r.created_at, ...look,
  };
}
