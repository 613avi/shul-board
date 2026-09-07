import { json, bad, uuid, now, normalizeSlug } from '../_shared.js';
import { ensureContactTable, clean, cleanText, TOPICS, MAX_PER_IP, RL_WINDOW, MAX_ROWS } from '../_contact.js';

// שליחת פנייה מדף הבית. ציבורי, בלי התחברות — ולכן מוגבל בקצב ובגודל.
export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rlKey = `rl:contact:${ip}`;
  const tries = parseInt(await env.SESSIONS.get(rlKey) || '0', 10);
  if (tries >= MAX_PER_IP) {
    return bad('נשלחו כבר כמה פניות מהמכשיר הזה. נסו שוב בעוד שעה, או כתבו בשרשור בפורום', 429);
  }

  let body;
  try { body = await request.json(); } catch { return bad('בקשה לא תקינה'); }

  // מלכודת בוטים: שדה נסתר שאדם לא ממלא
  if (clean(body.website, 40)) return json({ ok: true });

  const name = clean(body.name, 60);
  const contact = clean(body.contact, 80);
  const shul = normalizeSlug(body.shul) || null;
  const topic = Object.hasOwn(TOPICS, body.topic) ? body.topic : 'other';
  const message = cleanText(body.message, 2000);

  if (name.length < 2) return bad('נא למלא שם');
  if (message.length < 5) return bad('נא לכתוב את תוכן הפנייה');
  if (!contact) return bad('נא להשאיר טלפון או מייל, אחרת לא נוכל לחזור אליכם');

  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM contact').first().catch(() => null);
  if (Number(total?.n) >= MAX_ROWS) return bad('תיבת הפניות מלאה כרגע. נסו שוב מאוחר יותר', 503);

  const t = now();
  const id = uuid();
  await ensureContactTable(env);
  await env.DB.prepare(
    `INSERT INTO contact (id, name, contact, shul, topic, message, status, ip, user_agent, created_at)
     VALUES (?,?,?,?,?,?,'new',?,?,?)`
  ).bind(
    id, name, contact, shul, topic, message, ip,
    clean(request.headers.get('user-agent'), 200), t
  ).run();

  await env.SESSIONS.put(rlKey, String(tries + 1), { expirationTtl: RL_WINDOW });

  // התראה מיידית, אם הוגדר סוד CONTACT_WEBHOOK ב-Pages
  if (env.CONTACT_WEBHOOK) {
    const send = fetch(env.CONTACT_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'shul-board', id, name, contact, shul,
        topic: TOPICS[topic], message, created_at: t,
        text: `פנייה חדשה ב-ShulBoard\n${name} (${contact})${shul ? ` · ${shul}` : ''}\n${TOPICS[topic]}\n\n${message}`,
      }),
    }).catch(() => {});
    if (typeof ctx.waitUntil === 'function') ctx.waitUntil(send);
  }

  return json({ ok: true }, { status: 201 });
}

export const onRequestGet = () => bad('שיטה לא נתמכת', 405);
