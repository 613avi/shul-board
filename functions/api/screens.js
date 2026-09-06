import { json, requireAuth } from '../_shared.js';
import { ensureScreensTable, listScreens, dataVersion, LIVE_WINDOW_MS, HEARTBEAT_SECONDS } from '../_screens.js';

// המסכים של בית הכנסת המחובר: כמה מקרינים כרגע, ומה כל אחד מציג.
export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  await ensureScreensTable(env);
  const t = Date.now();
  const [{ screens, live }, version] = await Promise.all([
    listScreens(env, auth.shul.id, t),
    dataVersion(env, auth.shul.id),
  ]);

  return json({
    ok: true,
    live,
    total: screens.length,
    version,                       // הגרסה השמורה — מסך עם dataVersion אחר עדיין לא התעדכן
    liveWindowMs: LIVE_WINDOW_MS,
    heartbeatSeconds: HEARTBEAT_SECONDS,
    serverTime: t,
    // כתובת ה-IP נשארת בשרת — הגבאי לא צריך אותה
    screens: screens.map(({ ip, fp, ...s }) => s),
  });
}
