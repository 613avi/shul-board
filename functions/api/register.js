import {
  json, bad, uuid, now, hashPassword, createSession, sessionCookie,
  normalizeSlug, slugAvailable, DEFAULTS, SECTIONS, logAudit,
} from '../_shared.js';

// הרשמה עצמית: יוצר בית כנסת, גבאי-בעלים, והגדרות ברירת מחדל — ומחבר מיד.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  const name = String(body.name || '').trim();
  const gabbai = String(body.gabbai || '').trim();
  const password = String(body.password || '');
  const contact = String(body.contact || '').trim() || null;
  const slug = normalizeSlug(body.slug || name);

  if (name.length < 2) return bad('שם בית הכנסת קצר מדי');
  if (gabbai.length < 2) return bad('שם הגבאי קצר מדי');
  if (password.length < 6) return bad('הסיסמה חייבת להיות באורך 6 תווים לפחות');
  if (!slugAvailable(slug)) {
    return bad('הכתובת המבוקשת אינה תקינה או שמורה — בחרו כתובת אחרת באנגלית', 400, { slug });
  }

  const exists = await env.DB.prepare('SELECT id FROM shuls WHERE slug = ?').bind(slug).first();
  if (exists) return bad('הכתובת הזאת כבר תפוסה', 409, { slug });

  const { hash, salt } = await hashPassword(password);
  const shulId = uuid();
  const t = now();

  const config = { ...DEFAULTS.config, synagogueName: name };

  const stmts = [
    env.DB.prepare(
      `INSERT INTO shuls (id, slug, name, pass_hash, pass_salt, contact, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'active',?,?)`
    ).bind(shulId, slug, name, hash, salt, contact, t, t),
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
  await env.DB.batch(stmts);

  await logAudit(env, { shulId, gabbai, action: 'register', detail: slug, request });

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
