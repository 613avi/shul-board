import {
  json, bad, uuid, now, hashPassword, createSession, sessionCookie,
  normalizeSlug, slugAvailable, DEFAULTS, SECTIONS, logAudit,
  ensureShulEmail, ensureShulPasswordFlag,
} from '../_shared.js';
import { SCHEMA_VERSION } from '../_migrations.js';
import { ensureGoogleTable, addLink, readSignup, burnSignup } from '../_google.js';

// הרשמה עצמית: יוצר בית כנסת, גבאי-בעלים, והגדרות ברירת מחדל — ומחבר מיד.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const name = String(body.name || '').trim();
  const gabbai = String(body.gabbai || '').trim();
  const password = String(body.password || '');
  const contact = String(body.contact || '').trim() || null;
  const slug = normalizeSlug(body.slug || name);

  // הרשמה עם Google: במקום סיסמה מגיע אסימון קצר-מועד שנוצר אחרי שהזהות
  // אומתה מול Google. בית הכנסת נפתח בלי סיסמה משותפת בכלל.
  const signup = body.googleToken ? await readSignup(env, String(body.googleToken)) : null;
  if (body.googleToken && !signup) {
    return bad('ההרשמה עם Google פגה. התחילו שוב מהכפתור בדף הבית', 410);
  }

  if (name.length < 2) return bad('שם בית הכנסת קצר מדי');
  if (gabbai.length < 2) return bad('שם הגבאי קצר מדי');
  if (!signup && password.length < 6) return bad('הסיסמה חייבת להיות באורך 6 תווים לפחות');
  if (!slugAvailable(slug)) {
    return bad('הכתובת המבוקשת אינה תקינה או שמורה — בחרו כתובת אחרת באנגלית', 400, { slug });
  }

  const exists = await env.DB.prepare('SELECT id FROM shuls WHERE slug = ?').bind(slug).first();
  if (exists) return bad('הכתובת הזאת כבר תפוסה', 409, { slug });

  // בהרשמה עם Google נשמרת סיסמה אקראית שאיש אינו יודע: הכניסה היא דרך Google,
  // ומי שירצה סיסמה משותפת יקבע אחת בלשונית "חשבון" בלי להידרש לנוכחית.
  const { hash, salt } = await hashPassword(
    signup ? [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16)).join('') : password
  );
  const shulId = uuid();
  const t = now();

  const config = { ...DEFAULTS.config, synagogueName: name, schemaVersion: SCHEMA_VERSION };

  const stmts = [
    env.DB.prepare(
      `INSERT INTO shuls (id, slug, name, pass_hash, pass_salt, contact, email, has_password, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,'active',?,?)`
    ).bind(shulId, slug, name, hash, salt, contact, signup?.email || null, signup ? 0 : 1, t, t),
    env.DB.prepare(
      'INSERT INTO gabbaim (id, shul_id, name, is_owner, created_at) VALUES (?,?,?,1,?)'
    ).bind(uuid(), shulId, gabbai, t),
    ...SECTIONS.map(section =>
      env.DB.prepare(
        'INSERT INTO settings (shul_id, section, json, updated_at, updated_by) VALUES (?,?,?,?,?)'
      ).bind(
        shulId, section,
        JSON.stringify(section === 'config' ? config : DEFAULTS[section]),
        t, gabbai
      )
    ),
  ];
  await ensureShulEmail(env);
  await ensureShulPasswordFlag(env);
  await env.DB.batch(stmts);

  // השיוך נוצר מיד, אחרת בית כנסת שנפתח עם Google היה נשאר בלי שום דרך להיכנס
  if (signup) {
    await ensureGoogleTable(env);
    await addLink(env, { shulId, sub: signup.sub, email: signup.email, gabbai });
    await burnSignup(env, String(body.googleToken));
  }

  await logAudit(env, {
    shulId, gabbai, action: signup ? 'register-google' : 'register', detail: slug, request,
  });

  const token = await createSession(env, { shulId, slug, gabbai });
  return json(
    { ok: true, slug, shulId, displayUrl: `/s/${slug}` },
    { status: 201, headers: { 'set-cookie': sessionCookie(token) } }
  );
}

// בדיקת זמינות כתובת בזמן הקלדה
export async function onRequestGet({ request, env }) {
  const slug = normalizeSlug(new URL(request.url).searchParams.get('slug'));
  if (!slugAvailable(slug)) return json({ slug, available: false, reason: 'invalid' });
  const exists = await env.DB.prepare('SELECT id FROM shuls WHERE slug = ?').bind(slug).first();
  return json({ slug, available: !exists, reason: exists ? 'taken' : null });
}
