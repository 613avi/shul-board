// תרגום הממשק והצג.
//
// עברית היא שפת המקור: הטקסט העברי כתוב ישירות ב-HTML וב-JS, והאנגלית היא שכבת
// כיסוי לפי מפתח. המשמעות: אם התרגום נכשל או חסר מפתח, מה שמוצג הוא עברית תקינה
// ולא מפתח חשוף. זה גם אומר שאפשר להוסיף מחרוזת חדשה בלי לגעת כאן, והיא פשוט
// תישאר בעברית עד שמישהו יתרגם.
//
// שימוש:
//   ב-HTML   <h2 data-i18n="admin.rooms.title">זמני תפילות</h2>
//            <input data-i18n-ph="admin.rooms.namePh" placeholder="חדר 1">
//   ב-JS     I18n.t('display.zmanim.sunrise')          — אין מפתח? מוחזר המפתח
//            I18n.t('display.next', { min: 12 })       — {min} מוחלף
//
// הכיוון (dir/lang על <html>) מתחלף יחד עם השפה. ה-CSS כבר לוגי ברובו, וההבדלים
// האמיתיים יושבים בבלוק "כיווניות" ב-board.css.
window.SB_I18N = (() => {
  const LANGS = { he: { name: 'עברית', dir: 'rtl' }, en: { name: 'English', dir: 'ltr' } };
  const DEFAULT = 'he';

  // ---------- המילון ----------
  // עברית לא מופיעה כאן: היא כבר בקוד. כאן רק מה שמחליף אותה.
  const EN = {
    // ===== הצג =====
    'display.card.zmanim': 'Zmanim',
    'display.card.tefillot': 'Davening Times',
    'display.card.tefillotShabbat': 'Shabbos Davening Times',
    'display.card.memorial': 'L’iluy Nishmas',
    'display.card.shabbat': 'Shabbos',
    'display.card.today': 'Today',
    'display.card.learning': 'Daily Learning',
    'display.card.dedications': 'Dedications & Blessings',
    'display.card.shiurim': 'Shiurim',
    'display.card.weather': 'Weather',
    'display.card.omer': 'Sefiras HaOmer',

    'display.zmanim.alotHaShachar': 'Alos Hashachar',
    'display.zmanim.misheyakir': 'Misheyakir',
    'display.zmanim.sunrise': 'Netz Hachama',
    'display.zmanim.sofZmanShmaMGA': 'Sof Zman Krias Shma (M"A)',
    'display.zmanim.sofZmanShma': 'Sof Zman Krias Shma (Gra)',
    'display.zmanim.sofZmanTfillaMGA': 'Sof Zman Tefillah (M"A)',
    'display.zmanim.sofZmanTfilla': 'Sof Zman Tefillah (Gra)',
    'display.zmanim.chatzot': 'Chatzos',
    'display.zmanim.minchaGedola': 'Mincha Gedola',
    'display.zmanim.minchaKetana': 'Mincha Ketana',
    'display.zmanim.plagHaMincha': 'Plag HaMincha',
    'display.zmanim.sunset': 'Shkiah',
    'display.zmanim.tzeit': 'Tzeis Hakochavim',
    'display.zmanim.tzeit72': 'Tzeis (Rabbeinu Tam)',
    'display.zmanim.tzeit72deg': 'Rabbeinu Tam (by degrees)',
    'display.zmanim.chatzotNight': 'Chatzos Halaila',

    'display.prayer.shacharit': 'Shacharis',
    'display.prayer.mincha': 'Mincha',
    'display.prayer.arvit': 'Maariv',
    'display.prayer.kabbalat': 'Kabbalas Shabbos',
    'display.prayer.minchaErev': 'Mincha Erev Shabbos',
    'display.prayer.arvitMotzash': 'Maariv Motzei Shabbos',

    'display.shabbat.candles': 'Candle Lighting',
    'display.shabbat.havdalah': 'Motzei Shabbos',
    'display.shabbat.havdalahRT': 'Motzei Shabbos (R”T)',
    'display.shabbat.parasha': 'Parsha',

    'display.next.in': 'in {min} min',
    'display.next.inHours': 'in {h}h {min}m',
    'display.next.inHoursExact': 'in {h}h',
    'display.next.now': 'now',
    'display.countdown.next': 'Next Minyan',
    'display.countdown.none': 'No more minyanim today',
    'display.countdown.at': 'at {time}',
    'display.loading': 'Loading…',
    'display.weather.clear': 'Clear',
    'display.weather.partly': 'Partly cloudy',
    'display.weather.cloudy': 'Cloudy',
    'display.weather.fog': 'Fog',
    'display.weather.drizzle': 'Drizzle',
    'display.weather.rain': 'Rain',
    'display.weather.snow': 'Snow',
    'display.weather.showers': 'Showers',
    'display.weather.storm': 'Thunderstorms',
    'display.omer.day': 'Day {n} of the Omer',
    'display.upcoming.in': '{name} · in {days} days',
    'display.upcoming.tomorrow': '{name} · tomorrow',
    'display.upcoming.today': '{name} · today',

    'display.prayer.shacharitShab': 'Shacharis Shabbos',
    'display.prayer.minchaShab': 'Mincha Shabbos',
    'display.mention.moridHaGeshem': 'Mashiv Haruach U\u2019morid Hageshem',
    'display.mention.moridHaTal': 'Morid Hatal',
    'display.mention.talUmatar': 'V\u2019sein Tal U\u2019matar Livracha',
    'display.mention.veTenBracha': 'V’sein Bracha',
    'display.mention.noTachanun': 'No Tachanun',
    'display.mention.halfHallel': 'Half Hallel',
    'display.mention.fullHallel': 'Full Hallel',
    'display.mention.yaaleVeyavo': 'Yaaleh V’yavo',
    'display.mention.alHanisim': 'Al Hanisim',
    'display.mention.tal': 'V’sein Tal U’matar',
    'display.mention.roshChodesh': 'Rosh Chodesh',
    'display.mention.chanukahCandle': 'Chanukah — night {n}',
    'display.mention.mevarchim': 'Shabbos Mevorchim',
    'display.mention.molad': 'Molad',
    'display.mention.fastStart': 'Fast begins',
    'display.mention.fastEnd': 'Fast ends',
    'display.molad': 'Molad: {dow}, {time} and {chalakim} chalakim',
    'display.today.regular': 'a regular day',

    'display.dow.0': 'Sunday',
    'display.dow.1': 'Monday',
    'display.dow.2': 'Tuesday',
    'display.dow.3': 'Wednesday',
    'display.dow.4': 'Thursday',
    'display.dow.5': 'Friday',
    'display.dow.6': 'Shabbos',

    'display.learning.today': 'Today',
    'display.learning.tomorrow': 'Tomorrow',
    'display.learning.empty': 'No learning today',
    'display.dedications.empty': 'No active dedications',
    'display.texts.empty': 'No texts yet',
    'display.dedication.neshama': 'L’iluy Nishmas',
    'display.dedication.refua': 'Refuah Shleimah',
    'display.dedication.hatzlacha': 'L’hatzlacha',
    'display.dedication.zechut': 'L’zchus',
    'display.dedication.donation': 'Sponsored by',
    'display.dedication.mazal': 'Mazal Tov',
    'display.dedication.welcome': 'Welcome',
    'display.learning.dafyomi': 'Daf Yomi',
    'display.learning.mishnayomi': 'Mishna Yomis',
    'display.learning.rambam1': 'Rambam — 1 chapter',
    'display.learning.rambam3': 'Rambam — 3 chapters',
    'display.learning.seferhamitzvot': 'Sefer HaMitzvos',
    'display.learning.nachyomi': 'Nach Yomi',
    'display.learning.tanakhyomi': 'Tanach Yomi',
    'display.learning.psalms': 'Daily Tehillim',
    'display.learning.yerushalmi-vilna': 'Yerushalmi Yomi',
    'display.learning.dafweekly': 'Daf a Week',
    'display.learning.perekyomi': 'Mishna — a perek a day',
    'display.learning.kitzurshulchanaruch': 'Kitzur Shulchan Aruch',
    'display.shiurim.today': 'Today',
    'display.shiurim.tomorrow': 'Tomorrow',
    'display.shiurim.empty': 'No shiurim today',
    'display.error.load': 'Could not load the board',
    'display.error.noShul': 'Shul not identified',
  };

  const DICTS = { en: EN };

  // ---------- מילון לפי טקסט המקור ----------
  // הצג מתורגם לפי מפתחות, כי יש בו מעט מחרוזות והן מפוזרות בקוד. פאנל הניהול
  // הפוך: מאות מחרוזות עברית שיושבות ישירות ב-HTML וב-DOM שנבנה ב-JS. לפזר שם
  // data-i18n על כל אלמנט זה עבודה שמייצרת באג בכל מחרוזת חדשה ששוכחים לסמן.
  // לכן שם המפתח הוא העברית עצמה: מי שמוסיף כפתור חדש לא צריך לדעת שקיים כאן
  // קובץ, והכפתור פשוט יישאר בעברית עד שמישהו יתרגם אותו.
  //
  // המילון נרשם מבחוץ (i18n-admin.js), כדי שהצג לא יוריד אותו לחינם.
  const SOURCES = {};
  function registerSource(l, dict) {
    SOURCES[l] = Object.assign(SOURCES[l] || {}, dict);
  }

  let lang = DEFAULT;

  const dirOf = (l) => (LANGS[l] || LANGS[DEFAULT]).dir;

  // מפתח מפורש נבדק קודם במילון של הצג ואחר כך במילון לפי טקסט המקור, כדי
  // שמסך שמתורגם בעיקר לפי המקור יוכל בכל זאת להשתמש במפתח היכן שצריך.
  const lookup = (key) => {
    const a = DICTS[lang];
    if (a && Object.hasOwn(a, key)) return a[key];
    const b = SOURCES[lang];
    if (b && Object.hasOwn(b, key)) return b[key];
    return null;
  };

  function t(key, vars) {
    let out = lookup(key);
    if (out == null) out = key;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return out;
  }

  // האם יש בכלל תרגום למפתח הזה. משמש כדי להשאיר את העברית שכבר כתובה ב-DOM
  // במקומה, במקום להחליף אותה במפתח.
  const has = (key) => lang !== DEFAULT && lookup(key) != null;

  // מחליף טקסט ותכונות בכל תת-העץ. בעברית לא נוגע בכלום — הטקסט כבר נכון.
  function apply(root = document) {
    if (lang === DEFAULT) return;
    for (const el of root.querySelectorAll('[data-i18n]')) {
      const key = el.getAttribute('data-i18n');
      if (has(key)) el.textContent = t(key);
    }
    for (const [attr, prop] of [['data-i18n-ph', 'placeholder'], ['data-i18n-title', 'title'], ['data-i18n-aria', 'aria-label']]) {
      for (const el of root.querySelectorAll(`[${attr}]`)) {
        const key = el.getAttribute(attr);
        if (has(key)) el.setAttribute(prop, t(key));
      }
    }
  }

  // ---------- החלפה לפי טקסט המקור ----------
  // נשמר מה שנכתב לכל צומת, כדי לא לתרגם פעמיים ולא להיכנס ללולאה מול המשקיף.
  const _written = new WeakMap();   // צומת טקסט -> הערך שכתבנו
  const _attrs = new WeakMap();     // אלמנט -> { attr: { src, out } }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

  function srcText(text) {
    const dict = SOURCES[lang];
    if (!dict) return null;
    const raw = text.trim();
    if (!raw) return null;
    // ב-HTML משפט ארוך נשבר לשורות עם הזחה. המפתח מנורמל לרווח יחיד, כדי
    // שהמילון יישאר קריא ולא יישבר מעריכה שמזיזה שורה.
    const key = raw.replace(/\s+/g, ' ');
    if (!Object.hasOwn(dict, key)) return null;
    const out = dict[key];
    // מחליף בפונקציה ולא במחרוזת: $& ודומיו בתרגום הם תווי בקרה ב-replace
    return text.replace(raw, () => out);
  }

  function applySource(root) {
    const node = root || document.body;
    if (lang === DEFAULT || !SOURCES[lang] || !node) return;

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
        return /\S/.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    // אוספים ואז כותבים: שינוי תוך כדי הליכה מבלבל את ה-walker
    const hits = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (_written.get(n) === n.nodeValue) continue;
      const out = srcText(n.nodeValue);
      if (out != null && out !== n.nodeValue) hits.push([n, out]);
    }
    for (const [n, out] of hits) { n.nodeValue = out; _written.set(n, out); }

    const els = node.querySelectorAll ? [...node.querySelectorAll('[placeholder],[title],[aria-label]')] : [];
    if (node.nodeType === 1 && ATTRS.some(a => node.hasAttribute(a))) els.push(node);
    for (const el of els) {
      if (el.closest('[data-i18n-skip]')) continue;
      const seen = _attrs.get(el) || {};
      for (const attr of ATTRS) {
        const cur = el.getAttribute(attr);
        if (cur == null) continue;
        if (seen[attr] && seen[attr].out === cur) continue;  // כבר תורגם
        const out = srcText(cur);
        if (out == null || out === cur) continue;
        el.setAttribute(attr, out);
        seen[attr] = { src: cur, out };
      }
      _attrs.set(el, seen);
    }
  }

  // פאנל הניהול בונה DOM מחדש כל הזמן (renderRooms, renderSpecial...). במקום
  // לקרוא לתרגום אחרי כל אחד מהם — ולשכוח באחד — משקיף על העץ ומתרגם מה שנוסף.
  let _obs = null, _guard = false, _missed = false;
  function observe(root) {
    const node = root || document.body;
    if (_obs) { _obs.disconnect(); _obs = null; }
    if (lang === DEFAULT || !SOURCES[lang] || !node) return;
    _obs = new MutationObserver(() => {
      // התרגום עצמו מייצר שינויים; הדגל מונע לולאה. הוא נופל בתור המאקרו, אחרי
      // שקריאת המשקיף (מיקרו-תור) על השינויים שלנו כבר התבצעה ונדחתה.
      // שינוי של הדף עצמו שנפל בתוך חלון הדגל לא הולך לאיבוד: עוד מעבר אחרי שהוא יורד
      if (_guard) { _missed = true; return; }
      _guard = true;
      try { applySource(node); } finally {
        setTimeout(() => {
          _guard = false;
          if (_missed) { _missed = false; _guard = true; try { applySource(node); } finally { setTimeout(() => { _guard = false; }, 0); } }
        }, 0);
      }
    });
    _obs.observe(node, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  function setLang(next, { apply: doApply = true } = {}) {
    lang = Object.hasOwn(LANGS, next) ? next : DEFAULT;
    const html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', dirOf(lang));
    // hebcal יודע להחזיר פרשה, חגים ותאריך עברי באנגלית. הלוקאל האשכנזי נותן
    // Shabbos, Sukkos ו-Shavuos — כמו שאר האנגלית בממשק
    try { window.hebcal?.Locale?.setLocale(lang === 'en' ? 'ashkenazi' : 'he'); } catch {}
    if (doApply) {
      apply(); applySource();
      // הכותרת יושבת ב-<head>, מחוץ לעץ שהמשקיף עובר עליו
      const title = srcText(document.title);
      if (title != null) document.title = title;
    }
    return lang;
  }

  // ---------- הפעלה בעמוד ----------
  // שלושת העמודים שיש בהם ממשק — דף הבית, השחזור והניהול — עושים בדיוק את
  // אותם ארבעה דברים, ולכן הם כאן ולא משוכפלים בכל אחד מהם.
  //
  // השפה נשמרת פר-דפדפן ולא פר-בית-כנסת: מי שקורא אנגלית קורא אנגלית גם
  // בדף הבית וגם בניהול. שפת הצג עצמו היא הגדרה נפרדת לגמרי של בית הכנסת
  // (config.display.lang), כי הצג נצפה על ידי הקהילה ולא על ידי הגבאי.
  //
  // מי שעוד לא בחר שפה מקבל את ברירת המחדל לפי המדינה: ה-middleware כותב
  // data-default-lang="en" על <html> לכל מי שנכנס מחוץ לישראל. זה לא נשמר,
  // כך שבחירה מפורשת בבורר תמיד גוברת.
  const LS_KEY = 'sb.lang';

  function boot({ onChange } = {}) {
    let saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch {}
    const geo = document.documentElement.getAttribute('data-default-lang');
    setLang(Object.hasOwn(LANGS, saved || '') ? saved
      : Object.hasOwn(LANGS, geo || '') ? geo : DEFAULT);
    observe(document.body);

    for (const sel of document.querySelectorAll('.ui-lang')) {
      sel.value = lang;
      sel.addEventListener('change', () => {
        try { localStorage.setItem(LS_KEY, sel.value); } catch {}
        // טעינה מחדש ולא החלפה חיה: החזרה לעברית דורשת את הטקסט המקורי,
        // שכבר הוחלף. העמודים האלה קלים, והמחיר זניח מול המורכבות.
        if (onChange) onChange(sel.value); else location.reload();
      });
    }
    return lang;
  }

  return {
    LANGS,
    DEFAULT,
    boot,
    t,
    has,
    apply,
    applySource,
    registerSource,
    observe,
    setLang,
    get lang() { return lang; },
    dir: () => dirOf(lang),
  };
})();
