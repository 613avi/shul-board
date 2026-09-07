import { json } from '../../_shared.js';
import { requireAdmin } from '../../_admin.js';
import { ensureScreensTable, liveCounts } from '../../_screens.js';
import { newContactCount } from '../../_contact.js';

// כל מה שהדשבורד צריך בבקשה אחת.
export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const DAY = 86_400_000;
  const t = Date.now();

  await ensureScreensTable(env);
  const [totals, shuls, audit, byDay, screens, contactNew] = await Promise.all([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM shuls)                          AS shuls,
        (SELECT COUNT(*) FROM shuls WHERE status = 'active')  AS active,
        (SELECT COUNT(*) FROM gabbaim)                        AS gabbaim,
        (SELECT COUNT(*) FROM media)                          AS media_files,
        (SELECT COALESCE(SUM(size), 0) FROM media)            AS media_bytes,
        (SELECT COUNT(*) FROM audit)                          AS audit_rows
    `).first(),

    env.DB.prepare(`
      SELECT s.id, s.slug, s.name, s.status, s.contact, s.created_at, s.updated_at,
             (SELECT COUNT(*) FROM gabbaim g WHERE g.shul_id = s.id)              AS gabbaim,
             (SELECT COUNT(*) FROM media m WHERE m.shul_id = s.id)                AS media_files,
             (SELECT COALESCE(SUM(size),0) FROM media m WHERE m.shul_id = s.id)   AS media_bytes,
             (SELECT MAX(updated_at) FROM settings t WHERE t.shul_id = s.id)      AS last_saved,
             (SELECT MAX(created_at) FROM audit a WHERE a.shul_id = s.id)         AS last_active
      FROM shuls s
      ORDER BY s.created_at DESC
    `).all(),

    env.DB.prepare(`
      SELECT a.shul_id, a.gabbai, a.action, a.detail, a.created_at,
             COALESCE(s.name, a.shul_id) AS shul_name
      FROM audit a LEFT JOIN shuls s ON s.id = a.shul_id
      ORDER BY a.created_at DESC LIMIT 60
    `).all(),

    env.DB.prepare(
      'SELECT created_at FROM shuls WHERE created_at >= ? ORDER BY created_at'
    ).bind(t - 30 * DAY).all(),

    liveCounts(env, t).catch(() => ({})),
    newContactCount(env),
  ]);

  // מסכים בלייב לכל בית כנסת (דופק ב-7 הדקות האחרונות) + סך הכל
  let screensLive = 0, screensTotal = 0;
  const shulRows = (shuls.results || []).map(s => {
    const sc = screens[s.id] || { live: 0, total: 0 };
    screensLive += sc.live; screensTotal += sc.total;
    return { ...s, screens_live: sc.live, screens_total: sc.total };
  });

  // הרשמות לפי יום ב-30 הימים האחרונים
  const signups = {};
  for (const row of byDay.results || []) {
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    signups[key] = (signups[key] || 0) + 1;
  }

  const activeToday = shulRows
    .filter(s => s.last_active && t - s.last_active < DAY).length;

  return json({
    ok: true,
    totals: { ...totals, activeToday, screensLive, screensTotal, contactNew },
    // מכסות המסלול החינמי, כדי לראות כמה מרווח נשאר
    limits: {
      kvStorageBytes: 1024 ** 3,
      kvWritesPerDay: 1000,
      functionRequestsPerDay: 100_000,
      d1Bytes: 5 * 1024 ** 3,
    },
    shuls: shulRows,
    audit: audit.results || [],
    signups,
    serverTime: t,
  });
}
