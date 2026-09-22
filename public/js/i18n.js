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
    'display.card.zmanim': 'Halachic Times',
    'display.card.tefillot': 'Prayer Times',
    'display.card.tefillotShabbat': 'Shabbat Prayer Times',
    'display.card.memorial': 'In Loving Memory',
    'display.card.shabbat': 'Shabbat',
    'display.card.today': 'Today',
    'display.card.learning': 'Daily Learning',
    'display.card.dedications': 'Dedications & Blessings',
    'display.card.shiurim': 'Classes',
    'display.card.weather': 'Weather',
    'display.card.omer': 'Omer Count',

    'display.zmanim.alotHaShachar': 'Dawn (Alot HaShachar)',
    'display.zmanim.misheyakir': 'Misheyakir',
    'display.zmanim.sunrise': 'Sunrise (Netz)',
    'display.zmanim.sofZmanShmaMGA': 'Latest Shema (M"A)',
    'display.zmanim.sofZmanShma': 'Latest Shema (Gra)',
    'display.zmanim.sofZmanTfillaMGA': 'Latest Shacharit (M"A)',
    'display.zmanim.sofZmanTfilla': 'Latest Shacharit (Gra)',
    'display.zmanim.chatzot': 'Midday (Chatzot)',
    'display.zmanim.minchaGedola': 'Mincha Gedola',
    'display.zmanim.minchaKetana': 'Mincha Ketana',
    'display.zmanim.plagHaMincha': 'Plag HaMincha',
    'display.zmanim.sunset': 'Sunset (Shkia)',
    'display.zmanim.tzeit': 'Nightfall (Tzeit)',
    'display.zmanim.tzeit72': 'Nightfall (Rabbeinu Tam)',
    'display.zmanim.chatzotNight': 'Midnight (Chatzot)',

    'display.prayer.shacharit': 'Shacharit',
    'display.prayer.mincha': 'Mincha',
    'display.prayer.arvit': 'Arvit',
    'display.prayer.kabbalat': 'Kabbalat Shabbat',
    'display.prayer.minchaErev': 'Mincha Erev Shabbat',
    'display.prayer.arvitMotzash': 'Arvit Motzaei Shabbat',

    'display.shabbat.candles': 'Candle Lighting',
    'display.shabbat.havdalah': 'Shabbat Ends',
    'display.shabbat.havdalahRT': 'Shabbat Ends (R. Tam)',
    'display.shabbat.parasha': 'Parasha',

    'display.next.in': 'in {min} min',
    'display.next.inHours': 'in {h}h {min}m',
    'display.omer.day': 'Day {n} of the Omer',
    'display.upcoming.in': '{name} · in {days} days',
    'display.upcoming.tomorrow': '{name} · tomorrow',
    'display.upcoming.today': '{name} · today',

    'display.prayer.shacharitShab': 'Shacharit Shabbat',
    'display.prayer.minchaShab': 'Mincha Shabbat',
    'display.mention.moridHaGeshem': 'Mashiv HaRuach U\u2019Morid HaGeshem',
    'display.mention.moridHaTal': 'Morid HaTal',
    'display.mention.talUmatar': 'VeTen Tal U\u2019Matar LiVracha',
    'display.mention.veTenBracha': 'VeTen Bracha',
    'display.mention.noTachanun': 'No Tachanun',
    'display.mention.halfHallel': 'Half Hallel',
    'display.mention.fullHallel': 'Full Hallel',
    'display.mention.yaaleVeyavo': 'Yaaleh VeYavo',
    'display.mention.alHanisim': 'Al HaNisim',
    'display.mention.tal': 'VeTen Tal U’Matar',
    'display.mention.roshChodesh': 'Rosh Chodesh',
    'display.mention.chanukahCandle': 'Chanukah — candle {n}',
    'display.mention.mevarchim': 'Shabbat Mevarchim',
    'display.mention.molad': 'Molad',
    'display.mention.fastStart': 'Fast begins',
    'display.mention.fastEnd': 'Fast ends',

    'display.dow.0': 'Sunday',
    'display.dow.1': 'Monday',
    'display.dow.2': 'Tuesday',
    'display.dow.3': 'Wednesday',
    'display.dow.4': 'Thursday',
    'display.dow.5': 'Friday',
    'display.dow.6': 'Shabbat',

    'display.learning.today': 'Today',
    'display.learning.tomorrow': 'Tomorrow',
    'display.shiurim.today': 'Today',
    'display.shiurim.tomorrow': 'Tomorrow',
    'display.shiurim.empty': 'No classes today',
    'display.error.load': 'Could not load the board',
    'display.error.noShul': 'Synagogue not identified',
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
  let _obs = null, _guard = false;
  function observe(root) {
    const node = root || document.body;
    if (_obs) { _obs.disconnect(); _obs = null; }
    if (lang === DEFAULT || !SOURCES[lang] || !node) return;
    _obs = new MutationObserver(() => {
      // התרגום עצמו מייצר שינויים; הדגל מונע לולאה. הוא נופל בתור המאקרו, אחרי
      // שקריאת המשקיף (מיקרו-תור) על השינויים שלנו כבר התבצעה ונדחתה.
      if (_guard) return;
      _guard = true;
      try { applySource(node); } finally { setTimeout(() => { _guard = false; }, 0); }
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
    // hebcal יודע להחזיר פרשה, חגים ותאריך עברי באנגלית
    try { window.hebcal?.Locale?.setLocale(lang === 'en' ? 'en' : 'he'); } catch {}
    if (doApply) { apply(); applySource(); }
    return lang;
  }

  return {
    LANGS,
    DEFAULT,
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
