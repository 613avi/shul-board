import {
  json, bad, now, hashPassword, verifyPassword, requireAuth, logAudit, ensureShulPasswordFlag,
} from '../_shared.js';

// שינוי סיסמת בית הכנסת על ידי גבאי מחובר.
//
// הסיסמה משותפת לכל הגבאים, ולכן שינוי שלה מנתק את כולם — מי שרוצה להיכנס
// שוב צריך את החדשה. זה מכוון: כך גבאי שפרש מפסיק לגשת, וכך סיסמה זמנית
// שמנהל המערכת מסר בטלפון (אחרי "שכחתי סיסמה") לא נשארת לתמיד.
export async function onRequestPut({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { shul, session } = auth;

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const current = String(body.current || '');
  const next = String(body.next || '');

  // בית כנסת שנפתח עם Google מעולם לא הייתה לו סיסמה, ולכן אין "נוכחית" לדעת.
  // בכל מקרה אחר דורשים אותה גם ממי שכבר מחובר: עוגיית סשן שנשארה פתוחה על
  // מחשב בבית הכנסת לא אמורה לאפשר לעובר אורח לנעול את הגבאים בחוץ.
  const first = shul.has_password === 0;
  if (!first && !await verifyPassword(current, shul.pass_hash, shul.pass_salt)) {
    return bad('הסיסמה הנוכחית שגויה');
  }
  if (next.length < 6) return bad('הסיסמה החדשה חייבת להיות באורך 6 תווים לפחות');
  if (!first && next === current) return bad('הסיסמה החדשה זהה לנוכחית');

  const { hash, salt } = await hashPassword(next);
  await ensureShulPasswordFlag(env);
  await env.DB.prepare(
    'UPDATE shuls SET pass_hash = ?, pass_salt = ?, has_password = 1, updated_at = ? WHERE id = ?'
  ).bind(hash, salt, now(), shul.id).run();

  // ביומן נרשמת העובדה שהסיסמה שונתה ומי שינה — לעולם לא הסיסמה עצמה
  await logAudit(env, {
    shulId: shul.id, gabbai: session.gabbai,
    action: first ? 'password-set' : 'password-change', detail: null, request,
  }).catch(() => {});

  return json({ ok: true });
}

export const onRequestGet = () => bad('שיטה לא נתמכת', 405);
