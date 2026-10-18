import { bad, createSession, sessionCookie } from './_shared.js';
import { ensureDemo, DEMO_SLUG, DEMO_GABBAI } from './_demo.js';

// כניסה לניהול של לוח ההדגמה בלי סיסמה. הסשן רגיל לגמרי — מה שהופך אותו
// לבטוח הוא ש-_middleware.js חוסם כל כתיבה של סשן עם הכתובת הזאת.
export async function onRequestGet({ env }) {
  const shulId = await ensureDemo(env);
  if (!shulId) return bad('לוח ההדגמה לא זמין כרגע', 503);
  const token = await createSession(env, { shulId, slug: DEMO_SLUG, gabbai: DEMO_GABBAI });
  return new Response(null, {
    status: 302,
    headers: { location: '/admin', 'set-cookie': sessionCookie(token), 'cache-control': 'no-store' },
  });
}
