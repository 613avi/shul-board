import { bad, readSession } from '../../../_shared.js';
import { googleConfigured, redirectUri, saveState, AUTH_URL } from '../../../_google.js';

// תחילת מסע ההרשאה. שלושה מצבים:
//   login    — כניסה לניהול עם חשבון שכבר שויך.
//   link     — שיוך החשבון לבית הכנסת שאליו הגבאי כבר מחובר.
//   register — פתיחת בית כנסת חדש, בלי סיסמה בכלל.
export async function onRequestGet({ request, env }) {
  if (!googleConfigured(env)) return bad('כניסה עם Google לא מופעלת בשרת הזה', 503);

  const url = new URL(request.url);
  const asked = url.searchParams.get('mode');
  const mode = ['link', 'register'].includes(asked) ? asked : 'login';

  // שיוך דורש שהגבאי כבר מחובר — אחרת כל אחד היה יכול לשייך את עצמו
  let session = null;
  if (mode === 'link') {
    session = await readSession(request, env);
    if (!session) return bad('נדרשת התחברות לפני שיוך חשבון', 401);
  }

  const state = await saveState(env, {
    mode,
    shulId: session?.shulId || null,
    gabbai: session?.gabbai || null,
  });

  const auth = new URL(AUTH_URL);
  auth.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  auth.searchParams.set('redirect_uri', redirectUri(url.origin));
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'openid email profile');
  auth.searchParams.set('state', state);
  // רק לבחור חשבון; אין לנו צורך בהרשאות מתמשכות ולכן בלי access_type=offline
  auth.searchParams.set('prompt', 'select_account');

  return Response.redirect(auth.toString(), 302);
}
