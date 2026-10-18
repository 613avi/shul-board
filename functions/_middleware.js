// כותרות אבטחה לכל התשובות + מדידת זמן בקצה + אנגלית כברירת מחדל מחוץ לישראל
// + חסימת כל כתיבה של סשן ההדגמה.

import { bad, readSession } from './_shared.js';
import { isDemo } from './_demo.js';

// העמודים שיש בהם בורר שפה. הצג לא כאן: השפה שלו היא הגדרה של בית הכנסת.
const UI_PAGES = /^\/(?:(?:index|admin|reset)(?:\.html)?)?$/;

// מה שזוחל של פורום או וואטסאפ קורא כשמדביקים קישור לדף הבית. בלי JS, ולכן
// התרגום חייב לקרות כאן ולא ב-i18n.js.
const EN_TITLE = 'ShulBoard — a smart display board for your shul';
const EN_DESC = 'A free zmanim and minyan board for your shul: register in a minute, manage it remotely, and put it on any screen.';

const setContent = (value) => ({ element(el) { el.setAttribute('content', value); } });

function toEnglish(res, isHome) {
  const rw = new HTMLRewriter()
    .on('html', { element(el) { el.setAttribute('data-default-lang', 'en'); } });
  if (isHome) {
    // <title> נשאר עברי: מי שבחר עברית מחוץ לישראל צריך לקבל אותו, ו-i18n.js
    // מתרגם אותו לבד לכל השאר
    rw.on('meta[name="description"]', setContent(EN_DESC))
      .on('meta[property="og:title"]', setContent(EN_TITLE))
      .on('meta[property="og:description"]', setContent(EN_DESC));
  }
  return rw.transform(res);
}

// בדיקה אחת כאן ולא בכל נתיב: כל כתיבה תחת /api — גם נתיב שיתווסף בעתיד — נחסמת
// לסשן ההדגמה. היציאה מותרת, וגם שיוך Google (בקשת GET שמתחילה כתיבה) נחסם.
const READ = new Set(['GET', 'HEAD', 'OPTIONS']);

async function demoBlocked(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/logout') return false;
  const linking = url.pathname === '/api/auth/google/start' && url.searchParams.get('mode') === 'link';
  if (READ.has(request.method) && !linking) return false;
  if (!(request.headers.get('cookie') || '').includes('sb_session=')) return false;
  return isDemo(await readSession(request, env));
}

export async function onRequest({ request, env, next }) {
  const t0 = Date.now();
  if (await demoBlocked(request, env)) {
    return bad('זה לוח הדגמה — אפשר לשחק עם הכל ולראות בתצוגה המקדימה, אבל שום שינוי לא נשמר.', 403, { demo: true });
  }
  const response = await next();
  let res = new Response(response.body, response);

  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('server-timing', `edge;dur=${Date.now() - t0}`);

  // דף הצג מיועד לרוץ במסך מלא בבית הכנסת — לא בתוך iframe של אחרים
  if ((res.headers.get('content-type') || '').includes('text/html')) {
    res.headers.set('x-frame-options', 'SAMEORIGIN');

    // בלי מדינה (הרצה מקומית) נשארים בעברית
    const country = request.cf?.country;
    const path = new URL(request.url).pathname;
    if (country && country !== 'IL' && UI_PAGES.test(path)) {
      // הגוף משתנה לפי המדינה, אז ה-ETag של הקובץ הסטטי כבר לא מתאר אותו
      res.headers.delete('etag');
      res = toEnglish(res, !/^\/(?:admin|reset)/.test(path));
    }
  }
  return res;
}
