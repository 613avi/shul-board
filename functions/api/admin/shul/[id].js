import { json, bad, now, hashPassword } from '../../../_shared.js';
import { requireAdmin } from '../../../_admin.js';
import { ensureScreensTable } from '../../../_screens.js';

async function loadShul(env, id) {
  return env.DB.prepare('SELECT * FROM shuls WHERE id = ?').bind(id).first();
}

// השהיה / הפעלה מחדש
export async function onRequestPatch({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const shul = await loadShul(env, String(params.id));
  if (!shul) return bad('בית הכנסת לא נמצא', 404);

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const status = String(body.status || '');
  if (!['active', 'suspended'].includes(status)) return bad('סטטוס לא חוקי');

  await env.DB.prepare('UPDATE shuls SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, now(), shul.id).run();

  await env.DB.prepare(
    'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
  ).bind(
    shul.id, null, status === 'active' ? 'admin-activate' : 'admin-suspend',
    shul.slug, request.headers.get('cf-connecting-ip') || null, now()
  ).run().catch(() => {});

  return json({ ok: true, id: shul.id, status });
}

// ---------- איפוס סיסמה ----------
// הסיסמה נשמרת כגיבוב PBKDF2 ולכן אי אפשר לשחזר אותה — אפשר רק לקבוע חדשה.
// גבאי ששכח את הסיסמה פונה דרך "יצירת קשר", מנהל המערכת מוודא את זהותו מול
// פרטי הקשר שנרשמו בהרשמה (shuls.contact), ומוסר לו את הסיסמה החדשה.

// אלפבית בלי תווים שמתבלבלים בהכתבה בטלפון: בלי 0/O, בלי 1/l/i, בלי o.
const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generatePassword(len = 10) {
  // דגימה עם דחייה — 248 = 31×8, כך שאין הטיה לטובת התווים הראשונים
  const limit = Math.floor(256 / PW_ALPHABET.length) * PW_ALPHABET.length;
  let out = '';
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len))) {
      if (b >= limit) continue;
      out += PW_ALPHABET[b % PW_ALPHABET.length];
      if (out.length === len) break;
    }
  }
  // מקף באמצע — קל יותר להקריא בטלפון ולהקליד בלי טעות
  return `${out.slice(0, len / 2)}-${out.slice(len / 2)}`;
}

export async function onRequestPut({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const shul = await loadShul(env, String(params.id));
  if (!shul) return bad('בית הכנסת לא נמצא', 404);

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  // אישור מפורש עם ה-slug, כמו במחיקה: איפוס בטעות נועל את כל הגבאים בחוץ
  if (String(body.confirm || '') !== shul.slug) {
    return bad('כדי לאפס סיסמה יש לשלוח confirm=<slug> תואם', 400, { expected: shul.slug });
  }

  const typed = String(body.password || '');
  if (typed && typed.length < 6) return bad('הסיסמה חייבת להיות באורך 6 תווים לפחות');
  const password = typed || generatePassword();

  const { hash, salt } = await hashPassword(password);
  await env.DB.prepare('UPDATE shuls SET pass_hash = ?, pass_salt = ?, updated_at = ? WHERE id = ?')
    .bind(hash, salt, now(), shul.id).run();

  // ביומן נרשמת העובדה שהייתה איפוס — לעולם לא הסיסמה עצמה
  await env.DB.prepare(
    'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
  ).bind(
    shul.id, null, 'admin-reset-password', shul.slug,
    request.headers.get('cf-connecting-ip') || null, now()
  ).run().catch(() => {});

  // הסיסמה מוחזרת פעם אחת בלבד — היא לא נשמרת בשום מקום שאפשר לקרוא ממנו שוב
  return json({ ok: true, slug: shul.slug, password, contact: shul.contact || null });
}

// מחיקה מלאה. דורש אישור מפורש עם ה-slug — כדי שלחיצה בטעות לא תמחק בית כנסת.
export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const shul = await loadShul(env, String(params.id));
  if (!shul) return bad('בית הכנסת לא נמצא', 404);

  const confirm = new URL(request.url).searchParams.get('confirm');
  if (confirm !== shul.slug) {
    return bad('כדי למחוק יש לשלוח confirm=<slug> תואם', 400, { expected: shul.slug });
  }

  // מוחקים קודם את הבייטים מ-KV; אין FK cascade אמין ב-D1, אז מוחקים במפורש.
  const media = await env.DB.prepare('SELECT blob_key FROM media WHERE shul_id = ?')
    .bind(shul.id).all();
  for (const row of media.results || []) {
    await env.MEDIA.delete(row.blob_key).catch(() => {});
  }

  await ensureScreensTable(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM screens  WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM media    WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM settings WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM gabbaim  WHERE shul_id = ?').bind(shul.id),
    env.DB.prepare('DELETE FROM shuls    WHERE id = ?').bind(shul.id),
  ]);

  // היומן נשאר בכוונה — עקבות מחיקה שווים יותר מניקיון
  await env.DB.prepare(
    'INSERT INTO audit (shul_id, gabbai, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
  ).bind(
    shul.id, null, 'admin-delete', `${shul.slug} · ${shul.name}`,
    request.headers.get('cf-connecting-ip') || null, now()
  ).run().catch(() => {});

  return json({ ok: true, deleted: shul.slug, mediaRemoved: (media.results || []).length });
}
