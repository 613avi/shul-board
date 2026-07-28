import { json, readSession, destroySession, clearCookie } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  const session = await readSession(request, env);
  await destroySession(env, session?.token);
  return json({ ok: true }, { headers: { 'set-cookie': clearCookie() } });
}
