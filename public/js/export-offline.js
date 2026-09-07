// ייצוא הצג לקובץ אחד שרץ בלי אינטרנט.
//
// הרעיון: הצג ממילא מחשב אצלו את זמני היום, התאריך העברי, הפרשה והיארצייט —
// מהשרת הוא מקבל רק את התוכן שהגבאים הזינו. לכן אפשר לארוז את הכל לקובץ HTML
// אחד: העימוד, הקוד, ספריות hebcal, הגופנים, המנה הציבורית והמדיה כ-data URI.
// הקובץ נפתח בדפדפן מ-file:// וממשיך להציג נכון כל יום, בלי רשת.
//
// הבנייה רצה בדפדפן של הגבאי ולא בשרת: המדיה יכולה להגיע לעשרות מגה־בייט,
// וזה חורג ממה שנכון לעשות בתוך Worker.
window.SB_OFFLINE = (() => {
  const CORE_URL = 'https://cdn.jsdelivr.net/npm/@hebcal/core@6.9.2/dist/bundle.min.js';
  const LEARNING_URL = 'https://cdn.jsdelivr.net/npm/@hebcal/learning@6.6.1/dist/bundle.min.js';

  // טקסט שנכנס לתוך <script>: רק "</script" יכול לסגור את התגית מוקדם.
  // בתוך JS זה תמיד חוקי לכתוב "<\/script", גם במחרוזת וגם בביטוי רגולרי.
  const forScript = (js) => String(js).replace(/<\/script/gi, '<\\/script');
  // JSON בתוך <script>: מספיק לנטרל את "<" כדי שלא ייווצר תג.
  const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

  async function text(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.text();
  }

  async function blobOf(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.blob();
  }

  // FileReader ולא btoa: קובץ של כמה מגה־בייט מפוצץ את המחסנית ב-String.fromCharCode.
  const toDataUri = (blob) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error || new Error('read'));
    fr.readAsDataURL(blob);
  });

  // ---------- גופנים ----------
  // ה-CSS של Google Fonts מפוצל לתת-קבוצות לפי טווח תווים, כל אחת עם ההערה שלה
  // ("/* hebrew */"). לוח בעברית צריך עברית ולטינית בלבד — השאר (קירילי, יווני,
  // ויאטנמית) היו מכפילים את גודל הקובץ בלי שום תועלת.
  const KEEP_SUBSETS = /^(hebrew|latin|latin-ext)$/;

  async function inlineFonts(cssUrl, onStep) {
    let css;
    try {
      css = await text(cssUrl);
    } catch {
      return '';   // בלי אינטרנט בזמן הייצוא — הקובץ ייפול חזרה לגופני המערכת
    }

    const blocks = [];
    const re = /\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
    let m;
    while ((m = re.exec(css))) {
      if (KEEP_SUBSETS.test(m[1])) blocks.push(m[2]);
    }
    if (!blocks.length) blocks.push(...(css.match(/@font-face\s*\{[^}]*\}/gi) || []));

    let out = blocks.join('\n');
    const urls = [...new Set((out.match(/https:\/\/fonts\.gstatic\.com\/[^)'"]+/g) || []))];
    let done = 0;
    for (const u of urls) {
      onStep(`גופנים ${++done}/${urls.length}`);
      try {
        const uri = await toDataUri(await blobOf(u));
        out = out.split(u).join(uri);
      } catch { /* גופן בודד שלא נטען — הדפדפן ייפול חזרה למשפחה הבאה */ }
    }
    return out;
  }

  // ---------- מדיה ----------
  // כל כתובת /m/<id> שמופיעה במנה — מודעות, לוגו, תמונת רקע — נארזת פנימה.
  function mediaUrls(bundle) {
    const found = new Set();
    const walk = (v) => {
      if (typeof v === 'string') { if (/^\/m\/[A-Za-z0-9_-]+$/.test(v)) found.add(v); return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(bundle);
    return [...found];
  }

  // ---------- הבנייה ----------
  // onStep מקבל הודעת התקדמות לתצוגה בניהול.
  async function build({ slug, name, includeMedia = true, onStep = () => {} } = {}) {
    if (!slug) throw new Error('חסר מזהה בית כנסת');

    onStep('קורא את הצג');
    const [html, cssBoard, cssTraditional, cssScreens, jsPresets, jsDisplay] = await Promise.all([
      text('/display.html'),
      text('/css/board.css'),
      text('/css/traditional.css'),
      text('/css/screens.css'),
      text('/js/presets.js'),
      text('/js/display.js'),
    ]);

    onStep('קורא את התוכן');
    const res = await fetch(`/api/public/${encodeURIComponent(slug)}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`הנתונים לא נטענו (${res.status})`);
    const bundle = await res.json();
    if (!bundle.ok) throw new Error(bundle.error || 'הנתונים לא נטענו');

    onStep('מוריד את ספריות הזמנים');
    const [jsCore, jsLearning] = await Promise.all([text(CORE_URL), text(LEARNING_URL)]);

    // הגופנים של הדף, ועוד Orbitron — שעון "לד" טוען אותו בעצלנות, ובאופליין
    // אין מאיפה. הוא לטיני בלבד וכמעט לא מוסיף לגודל.
    let fontsUrl = (html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/) || [])[0] || '';
    if (fontsUrl && !/family=Orbitron/.test(fontsUrl)) {
      fontsUrl = fontsUrl.replace('&display=swap', '&family=Orbitron:wght@700&display=swap');
    }
    const fontCss = fontsUrl ? await inlineFonts(fontsUrl, onStep) : '';

    const media = {};
    let mediaBytes = 0;
    if (includeMedia) {
      const urls = mediaUrls(bundle);
      let done = 0;
      for (const u of urls) {
        onStep(`מדיה ${++done}/${urls.length}`);
        try {
          const blob = await blobOf(u);
          mediaBytes += blob.size;
          media[u] = await toDataUri(blob);
        } catch { /* קובץ בודד שלא נטען לא יפיל את הייצוא */ }
      }
    }

    onStep('מרכיב את הקובץ');
    const payload = {
      slug,
      name: name || bundle.name || slug,
      exportedAt: new Date().toISOString(),
      version: bundle.version,
      appVersion: bundle.appVersion,
      bundle,
      media,
    };

    // חשוב: כל ההחלפות מקבלות פונקציה ולא מחרוזת. במחרוזת החלפה הרצפים
    // $&, $` ו-$' הם תווי בקרה של String.replace — וקוד CSS/JS מכיל אותם,
    // מה שהיה משכפל חלקים מהדף לתוך עצמו.
    const put = (v) => () => v;

    let out = html
      // גיליונות הסגנון המקומיים
      .replace(/[ \t]*<link rel="stylesheet" href="\/css\/board\.css">\s*/,
        put(`<style>\n${cssBoard}\n</style>\n`))
      .replace(/[ \t]*<link rel="stylesheet" href="\/css\/traditional\.css">\s*/,
        put(`<style>\n${cssTraditional}\n</style>\n`))
      .replace(/[ \t]*<link rel="stylesheet" href="\/css\/screens\.css">\s*/,
        put(`<style>\n${cssScreens}\n</style>\n`))
      // Google Fonts: שני ה-preconnect וה-link יורדים יחד
      .replace(/[ \t]*<link rel="preconnect"[^>]*>\s*/g, '')
      .replace(/[ \t]*<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/,
        put(fontCss ? `<style>\n${fontCss}\n</style>\n` : ''))
      // הזרקת הנתונים במקום שבו ה-Function מזריקה אותם בשרת
      .replace('<!--SHUL_BOOTSTRAP-->',
        put(`<script>\nwindow.SHUL = ${jsonForScript({ slug: payload.slug, name: payload.name })};\n`
          + `window.SHUL_OFFLINE = ${jsonForScript(payload)};\n</script>`))
      // הקוד: hebcal (כולל הלימוד היומי, שבצג נטען בעצלנות), הקטלוג והצג.
      // שורה ריקה לפני הסגירה כדי שהערת //# sourceMappingURL בסוף חבילה
      // מוקטנת לא תבלע את התג הבא.
      .replace(/[ \t]*<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>\s*/,
        put(`<script>\n${forScript(jsCore)}\n</script>\n<script>\n${forScript(jsLearning)}\n</script>\n`))
      .replace(/[ \t]*<script src="\/js\/presets\.js"><\/script>\s*/,
        put(`<script>\n${forScript(jsPresets)}\n</script>\n`))
      .replace(/[ \t]*<script src="\/js\/display\.js"><\/script>\s*/,
        put(`<script>\n${forScript(jsDisplay)}\n</script>\n`))
      .replace('<title>', put(`<title>${escapeHtml(payload.name)} — `));

    const blob = new Blob([out], { type: 'text/html;charset=utf-8' });
    const date = new Date().toISOString().slice(0, 10);
    return {
      blob,
      filename: `ShulBoard-${slug}-${date}.html`,
      bytes: blob.size,
      mediaBytes,
      mediaCount: Object.keys(media).length,
      fonts: !!fontCss,
    };
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return { build };
})();
