import { createSession, sessionCookie, logAudit } from '../../../_shared.js';
import {
  googleConfigured, takeState, exchangeCode, ensureGoogleTable,
  addLink, shulsForSub, savePick, saveSignup,
} from '../../../_google.js';

// חזרה מ-Google. תמיד מסתיים בהפניה לדף — לא ב-JSON — כי הדפדפן הגיע לכאן בניווט.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const to = (path) => Response.redirect(`${url.origin}${path}`, 302);

  if (!googleConfigured(env)) return to('/admin.html?google=off');

  if (url.searchParams.get('error')) return to('/admin.html?google=cancelled');

  const code = url.searchParams.get('code') || '';
  const state = await takeState(env, url.searchParams.get('state'));
  if (!code || !state) return to('/admin.html?google=expired');

  let profile;
  try {
    profile = await exchangeCode(env, { code, origin: url.origin });
  } catch (e) {
    console.error('google exchange', e.message);
    return to('/admin.html?google=failed');
  }

  // מייל לא מאומת לא מזהה אף אחד; ה-sub כן, אבל בלי מייל אין מה להציג לגבאי
  if (!profile.emailVerified) return to('/admin.html?google=unverified');

  await ensureGoogleTable(env);

  // ---------- הרשמה ----------
  // הזהות מאומתת, אבל שם בית הכנסת עוד לא ידוע. שומרים אותה לרגע ומחזירים
  // לטופס ההרשמה, שם ממלאים שם וכתובת בלבד.
  if (state.mode === 'register') {
    const token = await saveSignup(env, { sub: profile.sub, email: profile.email, name: profile.name });
    return to(`/?gsignup=${token}#register`);
  }

  // ---------- שיוך ----------
  if (state.mode === 'link') {
    if (!state.shulId) return to('/admin.html?google=expired');
    await addLink(env, {
      shulId: state.shulId, sub: profile.sub, email: profile.email, gabbai: state.gabbai,
    });
    await logAudit(env, {
      shulId: state.shulId, gabbai: state.gabbai, action: 'google-link', detail: profile.email, request,
    }).catch(() => {});
    return to('/admin.html?google=linked');
  }

  // ---------- כניסה ----------
  const shuls = await shulsForSub(env, profile.sub);
  if (!shuls.length) return to('/admin.html?google=nolink');

  // גבאי בכמה בתי כנסת: לא מנחשים בשבילו. אסימון בחירה קצר, והבחירה בניהול.
  if (shuls.length > 1) {
    const pick = await savePick(env, shuls.map(s => s.shul_id));
    return to(`/admin.html?pick=${pick}`);
  }

  const one = shuls[0];
  const token = await createSession(env, { shulId: one.shul_id, slug: one.slug, gabbai: one.gabbai });
  await logAudit(env, {
    shulId: one.shul_id, gabbai: one.gabbai, action: 'google-login', detail: null, request,
  }).catch(() => {});

  return new Response(null, {
    status: 302,
    headers: { location: `${url.origin}/admin.html?google=in`, 'set-cookie': sessionCookie(token) },
  });
}
