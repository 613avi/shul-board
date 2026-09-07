// Smart Zmanim - display logic
// Loads data/*.json, renders a kiosk-style synagogue board (always all-rooms).

(() => {
  const { HDate, GeoLocation, Zmanim, HebrewCalendar, flags, Locale, gematriya, Molad, Location } = window.hebcal;
  const P = window.SB_PRESETS || null;
  const stripNikud = (t) => String(t || '').replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '');
  const FLAG_PARSHA = (flags && flags.PARSHA_HASHAVUA) || 1024;
  const FLAG_CHAG = (flags && flags.CHAG) || 1;

  const hebMonth = (hdate) => {
    try { return Locale.gettext(hdate.getMonthName(), 'he'); }
    catch { return hdate.getMonthName(); }
  };
  const hebDay = (n) => {
    try { return gematriya(Number(n) || 0); }
    catch { return String(n); }
  };
  const makeGeo = () => {
    const { latitude, longitude, timezone } = state.config.location;
    return new GeoLocation(
      state.config.synagogueName || 'site',
      Number(latitude), Number(longitude),
      0,
      timezone || 'Asia/Jerusalem'
    );
  };

  const HEB_DOW = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  const state = {
    config: null,
    rooms: [],
    memorial: [],
    announcements: [],
    specialEvents: [],
    zmanimCalendar: {}, // { "YYYY-MM-DD": { key: "HH:MM" } }
    dedications: [],
    shiurim: [],
    texts: [],
  };

  // דגלי תצוגה (config.display). ברירת המחדל כאן היא לבתי כנסת שאין להם את השדה בכלל.
  const flag = (key, def = false) => {
    const d = state.config && state.config.display;
    return d && d[key] !== undefined ? !!d[key] : def;
  };

  // ---------- helpers ----------
  const qs = (sel) => document.querySelector(sel);
  const fmtTime = (d) => {
    if (!d || !(d instanceof Date) || isNaN(d)) return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  const parseTime = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);
  const asArr = (v) => Array.isArray(v) ? v.filter(x => x !== '' && x != null) : (v ? [v] : []);

  // Effective Hebrew date: after sunset at current location we're already on the next Hebrew day.
  function getEffectiveHDate() {
    const now = new Date();
    let hd = new HDate(now);
    if (state.config && state.config.location) {
      try {
        const sunset = new Zmanim(makeGeo(), now).sunset();
        if (sunset && now >= sunset) hd = hd.next();
      } catch {}
    }
    return hd;
  }

  // רשומת זמן היא מחרוזת פשוטה או אובייקט (זמן יחסי / מוגבל לימים).
  // חשוב לא להמיר למחרוזת — זה היה מוחק את ההגדרות המורכבות.
  const keepEntry = (v) => (v && typeof v === 'object') ? v : String(v);
  // מנחה ערב שבת וערבית מוצ״ש נשמרו פעם כמספרים (דקות מהדלקת נרות / מצאת השבת)
  const offsetEntry = (base) => (v) => (v && typeof v === 'object')
    ? v : { type: 'relative', base, offset: Number(v) || 0, round: 0, days: [] };

  function normalizeRoom(room) {
    const wk = room.weekday || {};
    const sh = room.shabbat || {};
    room.weekday = {
      shacharit: [...asArr(wk.shacharit), ...asArr(wk.shacharit2)].map(keepEntry),
      mincha:    asArr(wk.mincha).map(keepEntry),
      arvit:     asArr(wk.arvit).map(keepEntry),
    };
    room.shabbat = {
      kabbalat:            asArr(sh.kabbalat).map(keepEntry),
      minchaErevOffsets:   asArr(sh.minchaErevOffsets ?? sh.minchaErevOffset).map(offsetEntry('candle')),
      shacharit:           asArr(sh.shacharit).map(keepEntry),
      mincha:              asArr(sh.mincha).map(keepEntry),
      arvitMotzashOffsets: asArr(sh.arvitMotzashOffsets ?? sh.arvitMotzashOffset).map(offsetEntry('havdalah')),
    };
    return room;
  }

  // Normalize special-times to event-grouped format.
  function migrateSpecialTimes(arr) {
    if (!Array.isArray(arr)) return [];
    if (arr.length === 0) return [];
    if (arr[0] && (Array.isArray(arr[0].times) || arr[0].name != null || arr[0].dateType)) {
      // Already events format — ensure shape
      return arr.map(ev => ({
        id: ev.id || String(Math.random()).slice(2),
        name: ev.name || '',
        dateType: ev.dateType === 'hebrew' ? 'hebrew' : 'gregorian',
        date: ev.date || '',
        hebrewDay: ev.hebrewDay || 0,
        hebrewMonth: ev.hebrewMonth || '',
        times: Array.isArray(ev.times) ? ev.times : [],
      }));
    }
    // Flat rows (legacy): group by date
    const groups = new Map();
    for (const r of arr) {
      const key = r.date || '';
      if (!groups.has(key)) groups.set(key, {
        id: String(Math.random()).slice(2),
        name: '',
        dateType: 'gregorian',
        date: key,
        hebrewDay: 0,
        hebrewMonth: '',
        times: [],
      });
      groups.get(key).times.push({ roomId: r.roomId || '', label: r.label || '', time: r.time || '' });
    }
    return [...groups.values()];
  }

  // מזהה בית הכנסת מוזרק על ידי ה-Function שמגיש את הדף (functions/s/[slug].js).
  // נפילה לאחור: חילוץ מהנתיב, כדי שגם פתיחה ישירה תעבוד.
  function currentSlug() {
    if (window.SHUL && window.SHUL.slug) return window.SHUL.slug;
    const m = location.pathname.match(/^\/s\/([^/]+)/);
    return m ? m[1] : '';
  }

  let _version = null;
  let _appVersion = null;     // גרסת הקוד בשרת — שינוי בה = טעינה מחדש של הדף
  let _previewMode = false;   // נדלק כשהצג רץ בתוך ה-iframe של הניהול

  // ---------- זהות המסך — ל"מסכים בלייב" בניהול ----------
  // בתוך iframe (התצוגה המקדימה של הניהול) הצג לא נספר כמסך.
  const _embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const LS_SCREEN = 'sb_screen_id';

  const hashStr = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };

  // שם שניתן בכתובת: /s/<slug>?screen=שם — המתקין שם שם את שם המחשב
  function screenLabel() {
    try { return (new URLSearchParams(location.search).get('screen') || '').trim().slice(0, 60); }
    catch { return ''; }
  }

  // טביעת אצבע של המכשיר: מאחדת בניהול מסך שהופעל מחדש במצב "גלישה בסתר",
  // שבו המזהה השמור בדפדפן אובד בכל הפעלה.
  function fingerprint() {
    try {
      const n = navigator;
      return hashStr([
        n.userAgent, screen.width, screen.height, screen.colorDepth, window.devicePixelRatio,
        n.hardwareConcurrency, n.language, Intl.DateTimeFormat().resolvedOptions().timeZone,
      ].join('|'));
    } catch { return ''; }
  }

  let _screenId = null;
  function screenId() {
    if (_screenId) return _screenId;
    const label = screenLabel();
    if (label) return (_screenId = `n:${hashStr(label)}`);
    let stored = null;
    try { stored = localStorage.getItem(LS_SCREEN); } catch {}
    if (!stored || stored.length < 4) {
      stored = `d:${fingerprint()}-${Math.random().toString(36).slice(2, 8)}`;
      try { localStorage.setItem(LS_SCREEN, stored); } catch {}
    }
    return (_screenId = stored);
  }

  // דופק לשרת: "אני כאן, וזה מה שאני מציג". התשובה כוללת את חותמת הגרסה
  // הנוכחית, כך שהדופק הוא גם בדיקת העדכונים — בלי בקשה נוספת.
  async function sendHeartbeat() {
    const slug = currentSlug();
    if (!slug) throw new Error('לא זוהה בית כנסת');
    const res = await fetch(`/api/heartbeat/${encodeURIComponent(slug)}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: screenId(),
        fp: fingerprint(),
        label: screenLabel(),
        width: screen.width,
        height: screen.height,
        appVersion: _appVersion,
        dataVersion: _version,
      }),
    });
    if (!res.ok) throw new Error(`heartbeat: ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('תשובה לא צפויה מהשרת');
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || 'heartbeat');
    return body;
  }

  async function fetchBundle() {
    const slug = currentSlug();
    if (!slug) throw new Error('לא זוהה בית כנסת');
    // חותמת דקה: מסכים באותה דקה חולקים תשובה אחת מהקצה (חוסך במכסה),
    // אבל תשובה שגויה לא יכולה להינעל במטמון ליותר מדקה.
    const bucket = Math.floor(Date.now() / 60000);
    const res = await fetch(`/api/public/${encodeURIComponent(slug)}?t=${bucket}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`bundle: ${res.status}`);

    // אם הגיע HTML במקום JSON — סימן שה-Function לא נותב. עדיף להיכשל
    // בקול מאשר להציג לוח ריק כאילו הכל תקין.
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error('תשובה לא צפויה מהשרת');

    const body = await res.json();
    if (!body.ok) throw new Error(body.error || 'שגיאה בטעינה');

    // פרסנו גרסת קוד חדשה? הדף נטען מחדש כדי שקוד ישן לא ירוץ מול נתונים חדשים.
    // בתצוגה המקדימה של הניהול לא — זה היה מוחק שינויים שטרם נשמרו.
    if (body.appVersion) {
      if (_appVersion && body.appVersion !== _appVersion && !_previewMode) {
        location.reload();
        return body;
      }
      _appVersion = body.appVersion;
    }
    return body;
  }

  async function loadData() {
    const bundle = await fetchBundle();
    _version = bundle.version;
    const d = bundle.data || {};
    const config = d['config'] || null;
    const rooms = d['rooms'] || { rooms: [] };
    const memorial = d['memorial'] || { entries: [] };
    const announcements = d['announcements'] || { entries: [] };
    const specialTimes = d['special-times'] || { entries: [] };
    const zmanimCal = d['zmanim-calendar'] || { entries: {} };
    state.screens = d['screens'] || null;
    state.mediaPlaylist = d['media-playlist'] || { seconds: 12, entries: [] };
    state.dedications = Array.isArray(d.dedications?.entries) ? d.dedications.entries : [];
    state.shiurim = Array.isArray(d.shiurim?.entries) ? d.shiurim.entries : [];
    state.texts = Array.isArray(d.texts?.entries) ? d.texts.entries : [];
    if (!config) throw new Error('config missing');
    if (!config.synagogueName && bundle.name) config.synagogueName = bundle.name;
    state.config = config;
    state.config.zmanimOverrides = state.config.zmanimOverrides || {};
    state.rooms = (rooms.rooms || []).map(normalizeRoom);
    state.memorial = memorial.entries || [];
    state.announcements = announcements.entries || [];
    state.specialEvents = migrateSpecialTimes(specialTimes.entries || []);
    state.zmanimCalendar = (zmanimCal && zmanimCal.entries && typeof zmanimCal.entries === 'object') ? zmanimCal.entries : {};
  }

  // ---------- header / omer / parasha ----------
  function findOmerText(hdate) {
    try {
      const evs = HebrewCalendar.calendar({ start: hdate, end: hdate, omer: true, locale: 'he', il: true });
      const omerEv = evs.find(e => e.constructor && e.constructor.name === 'OmerEvent')
                  || evs.find(e => typeof e.getTodayIs === 'function');
      if (!omerEv) return '';
      if (typeof omerEv.getTodayIs === 'function') {
        const text = omerEv.getTodayIs('he');
        const sefira = typeof omerEv.sefira === 'function' ? omerEv.sefira('he') : '';
        return sefira ? `${text} · ${sefira}` : text;
      }
      return omerEv.render('he');
    } catch { return ''; }
  }

  function findParashaText(hdate, now) {
    try {
      const events = HebrewCalendar.calendar({ start: hdate, end: hdate, sedrot: true, il: true, locale: 'he' });
      const parashaEv = events.find(e => e.getFlags && (e.getFlags() & FLAG_PARSHA));
      if (parashaEv) return parashaEv.render('he');
      const daysToShabbat = (6 - now.getDay() + 7) % 7 || 7;
      const shabbat = new HDate(new Date(now.getTime() + daysToShabbat * 86400000));
      const wkEvents = HebrewCalendar.calendar({ start: shabbat, end: shabbat, sedrot: true, il: true, locale: 'he' });
      const pEv = wkEvents.find(e => e.getFlags && (e.getFlags() & FLAG_PARSHA));
      return pEv ? pEv.render('he') : '';
    } catch { return ''; }
  }

  function renderHeader() {
    qs('#synagogue-name').textContent = state.config.synagogueName || '';
    const now = new Date();
    const hdate = getEffectiveHDate();
    qs('#hebrew-date').textContent = hdate.renderGematriya();
    const dow = HEB_DOW[now.getDay()];
    qs('#gregorian-date').textContent = `יום ${dow}, ${now.toLocaleDateString('he-IL', {day:'numeric', month:'long', year:'numeric'})}`;

    const parashaText = findParashaText(hdate, now);
    qs('#parasha').textContent = parashaText;
    qs('.parasha-sep').style.display = parashaText ? '' : 'none';

    const omerText = findOmerText(hdate);
    const omerEl = qs('#omer-line');
    if (omerEl) {
      omerEl.textContent = omerText;
      omerEl.style.display = omerText ? '' : 'none';
    }

    renderMentions(hdate);
    renderTodayLine(hdate);
  }

  // ---------- "היום": חגים, ראש חודש, חנוכה, צום, שבת מברכים ומולד ----------
  const MODERN_KEEP = /Yom HaShoah|Yom HaZikaron|Yom HaAtzma|Yom Yerushalayim/;
  const SKIP_DESC = /^(Shabbat Mevarchim|Molad|Havdalah|Candle lighting|Fast begins|Fast ends)/;

  function todayEvents(hdate) {
    try {
      return HebrewCalendar.calendar({
        start: hdate, end: hdate, il: true, locale: 'he',
        sedrot: false, omer: false, candlelighting: false, molad: false, shabbatMevarchim: true,
        noMinorFast: false, noModern: false, noSpecialShabbat: false,
      });
    } catch { return []; }
  }

  // מונחים: מחרוזות מוכנות להצגה
  function computeTodayItems(hdate) {
    const items = [];
    const evs = todayEvents(hdate);
    let mevarchim = null;
    for (const ev of evs) {
      const f = ev.getFlags();
      const desc = ev.getDesc ? ev.getDesc() : '';
      if (f & (flags.PARSHA_HASHAVUA | flags.OMER_COUNT | flags.HEBREW_DATE | flags.DAILY_LEARNING | flags.MOLAD)) continue;
      if ((f & flags.MODERN_HOLIDAY) && !MODERN_KEEP.test(desc)) continue;
      if (f & flags.SHABBAT_MEVARCHIM) { mevarchim = ev; continue; }
      if (SKIP_DESC.test(desc)) continue;
      const text = stripNikud(ev.render('he')).replace(/\b5\d{3}\b/, y => hebDay(Number(y) % 1000)).trim();
      if (text) items.push({ text, fast: !!(f & (flags.MINOR_FAST | flags.MAJOR_FAST)), ev });
    }
    if (mevarchim) {
      items.push({ text: stripNikud(mevarchim.render('he')) });
      try {
        // המולד של החודש הבא
        const m = hdate.getMonth(), y = hdate.getFullYear();
        const months = HDate.monthsInYear(y);
        const nm = m === months ? 1 : m + 1;
        const ny = m === months ? y + 1 : y;
        const molad = new Molad(ny, nm);
        const dow = HEB_DOW[molad.getDow()];
        const hh = String(molad.getHour()).padStart(2, '0'), mm = String(molad.getMinutes()).padStart(2, '0');
        items.push({ text: `המולד: יום ${dow}, ${hh}:${mm} ו-${molad.getChalakim()} חלקים` });
      } catch {}
    }
    return items;
  }

  // תחילת/סיום הצום להיום, אם היום תענית
  function fastTimesToday(hdate, force = false) {
    if (!force && !flag('fastTimes')) return null;
    try {
      const { latitude, longitude, timezone } = state.config.location;
      const loc = new Location(Number(latitude), Number(longitude), true, timezone || 'Asia/Jerusalem');
      const evs = HebrewCalendar.calendar({ start: hdate, end: hdate, il: true, locale: 'he', location: loc, candlelighting: true });
      const fast = evs.find(e => e.getFlags() & (flags.MINOR_FAST | flags.MAJOR_FAST));
      if (!fast) return null;
      const t = (e) => e && e.eventTime ? fmtTime(e.eventTime) : '';
      const start = t(fast.startEvent), end = t(fast.endEvent);
      if (!start && !end) return null;
      return { name: stripNikud(fast.render('he')), start, end };
    } catch { return null; }
  }

  function renderTodayLine(hdate) {
    const line = qs('#today-line');
    if (!line) return;
    if (!flag('todayLine')) { line.style.display = 'none'; return; }
    try {
      const items = computeTodayItems(hdate).map(i => i.text);
      const fast = fastTimesToday(hdate);
      if (fast && (fast.start || fast.end)) {
        items.push(`${fast.start ? 'תחילת הצום ' + fast.start : ''}${fast.start && fast.end ? ' · ' : ''}${fast.end ? 'סיום הצום ' + fast.end : ''}`);
      }
      line.innerHTML = '';
      for (const t of items) line.appendChild(Object.assign(document.createElement('span'), { textContent: t }));
      line.style.display = items.length ? '' : 'none';
    } catch { line.style.display = 'none'; }
  }

  // ---------- tefilla mentions (winter/summer, rain request, ya'aleh v'yavo, al hanisim) ----------
  function computeTefillaMentions(hdate) {
    const m = hdate.getMonth(); // 1=Nisan .. 7=Tishrei .. 13=Adar II
    const d = hdate.getDate();
    const out = [];

    // משיב הרוח ומוריד הגשם (Shemini Atzeret musaf through Pesach day-1 musaf)
    // Simplified by calendar day:
    // Winter: 22 Tishrei → 14 Nisan inclusive. Else "מוריד הטל".
    const isWinter =
      (m === 7 && d >= 22) ||
      (m >= 8 && m <= 13) ||
      (m === 1 && d <= 14);
    out.push(isWinter ? 'משיב הרוח ומוריד הגשם' : 'מוריד הטל');

    // ותן טל ומטר (Israel): 7 Cheshvan → 14 Nisan; else ותן ברכה
    const rainRequest =
      (m === 8 && d >= 7) ||
      (m >= 9 && m <= 13) ||
      (m === 1 && d <= 14);
    out.push(rainRequest ? 'ותן טל ומטר לברכה' : 'ותן ברכה');

    // יעלה ויבוא (Rosh Chodesh or Chol Hamoed in Israel)
    let yaaleh = false;
    if (d === 1) yaaleh = true;
    else if (d === 30) {
      try {
        const daysInMonth = HDate.daysInMonth(m, hdate.getFullYear());
        if (daysInMonth === 30) yaaleh = true; // the 30th is Rosh Chodesh eve day
      } catch {}
    }
    // Chol hamoed (Israel): Nisan 16-20, Tishrei 16-21
    if (m === 1 && d >= 16 && d <= 20) yaaleh = true;
    if (m === 7 && d >= 16 && d <= 21) yaaleh = true;
    if (yaaleh) out.push('יעלה ויבוא');

    // על הניסים — Chanukah (25 Kislev through 2-3 Tevet) and Purim (14-15 Adar last-Adar)
    let alHanisim = false;
    if (m === 9 && d >= 25) alHanisim = true;             // Kislev 25-30
    if (m === 10 && d <= 3) alHanisim = true;              // Tevet 1-3
    const lastAdar = (() => {
      try { return HDate.isLeapYear(hdate.getFullYear()) ? 13 : 12; }
      catch { return 12; }
    })();
    if (m === lastAdar && (d === 14 || d === 15)) alHanisim = true; // Purim + Shushan Purim
    if (alHanisim) out.push('על הניסים');

    if (flag('extendedMentions')) {
      const leap = (() => { try { return HDate.isLeapYear(hdate.getFullYear()); } catch { return false; } })();
      const lastAdar = leap ? 13 : 12;
      const isChanukah = (m === 9 && d >= 25) || (m === 10 && d <= 2) ||
        (m === 10 && d === 3 && (() => { try { return HDate.daysInMonth(9, hdate.getFullYear()) === 29; } catch { return false; } })());
      const rc = d === 1 || (d === 30);
      // הלל
      let hallel = '';
      if (m === 1 && d === 15) hallel = 'הלל שלם';
      else if (m === 1 && d >= 16 && d <= 21) hallel = 'חצי הלל';
      else if (m === 3 && d === 6) hallel = 'הלל שלם';
      else if (m === 7 && d >= 15 && d <= 22) hallel = 'הלל שלם';
      else if (isChanukah) hallel = 'הלל שלם';
      else if (rc) hallel = 'חצי הלל';
      if (hallel) out.push(hallel);
      // תחנון — ימים שבהם לא אומרים
      const noTachanun =
        rc || m === 1 ||
        (m === 2 && (d === 14 || d === 18)) ||
        (m === 3 && d <= 12) ||
        (m === 5 && (d === 9 || d === 15)) ||
        (m === 6 && d === 29) ||
        (m === 7 && d >= 9) ||
        isChanukah ||
        (m === 11 && d === 15) ||
        (m === lastAdar && (d === 14 || d === 15)) ||
        (leap && m === 12 && (d === 14 || d === 15)) ||
        hdate.getDay() === 6;
      if (noTachanun) out.push('אין תחנון');
    }

    return out;
  }

  function renderMentions(hdate) {
    const bar = qs('#mentions-bar');
    if (!bar) return;
    try {
      const items = computeTefillaMentions(hdate);
      if (!items.length) { bar.style.display = 'none'; return; }
      bar.innerHTML = items.map(t => `<span class="mention">${t}</span>`).join('');
      bar.style.display = '';
    } catch (e) {
      bar.style.display = 'none';
    }
  }

  function renderClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    qs('#current-time').textContent = `${h}:${m}`;
    qs('#current-seconds').textContent = s;
  }

  // ---------- zmanim ----------
  const ZMANIM_DEFS = [
    { key: 'alotHaShachar',    label: 'עלות השחר',                   fn: z => z.alotHaShachar() },
    { key: 'misheyakir',       label: 'משיכיר',                      fn: z => z.misheyakir() },
    { key: 'sunrise',          label: 'הנץ החמה',                     fn: z => z.sunrise() },
    { key: 'sofZmanShmaMGA',   label: 'סוף זמן ק״ש (מג״א)',           fn: z => z.sofZmanShmaMGA() },
    { key: 'sofZmanShma',      label: 'סוף זמן ק״ש (גר״א)',           fn: z => z.sofZmanShma() },
    { key: 'sofZmanTfillaMGA', label: 'סוף זמן תפילה (מג״א)',         fn: z => z.sofZmanTfillaMGA() },
    { key: 'sofZmanTfilla',    label: 'סוף זמן תפילה (גר״א)',         fn: z => z.sofZmanTfilla() },
    { key: 'chatzot',          label: 'חצות היום',                    fn: z => z.chatzot() },
    { key: 'minchaGedola',     label: 'מנחה גדולה',                   fn: z => z.minchaGedola() },
    { key: 'minchaKetana',     label: 'מנחה קטנה',                    fn: z => z.minchaKetana() },
    { key: 'plagHaMincha',     label: 'פלג המנחה',                    fn: z => z.plagHaMincha() },
    { key: 'sunset',           label: 'שקיעת החמה',                   fn: z => z.sunset() },
    { key: 'tzeit',            label: 'צאת הכוכבים',                  fn: z => z.tzeit() },
    { key: 'tzeit72',          label: 'צאת הכוכבים (ר״ת)',            fn: z => z.sunsetOffset(72) },
    { key: 'chatzotNight',     label: 'חצות הלילה',                   fn: z => z.chatzotNight() },
  ];

  function computeZmanim() {
    const z = new Zmanim(makeGeo(), new Date());
    const globalOv = state.config.zmanimOverrides || {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const perDateOv = (state.zmanimCalendar && state.zmanimCalendar[todayStr]) || {};
    const out = {};
    const isTime = (v) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim());
    const padTime = (v) => {
      const [hh, mm] = v.trim().split(':');
      return `${hh.padStart(2,'0')}:${mm.padStart(2,'0')}`;
    };
    for (const def of ZMANIM_DEFS) {
      let time = '', isOverride = false;
      // priority: per-date → global → computed
      if (isTime(perDateOv[def.key])) {
        time = padTime(perDateOv[def.key]);
        isOverride = true;
      } else if (isTime(globalOv[def.key])) {
        time = padTime(globalOv[def.key]);
        isOverride = true;
      } else {
        try {
          const d = def.fn(z);
          time = fmtTime(d instanceof Date ? d : new Date(d));
        } catch {}
      }
      out[def.key] = { time, isOverride };
    }
    return out;
  }

  function renderZmanim() {
    const tbody = qs('#zmanim-table tbody');
    tbody.innerHTML = '';
    const displayed = state.config.displayedZmanim || {};
    const computed = computeZmanim();
    for (const def of ZMANIM_DEFS) {
      if (!displayed[def.key]) continue;
      const r = computed[def.key];
      if (!r.time) continue;
      const tr = document.createElement('tr');
      const mark = r.isOverride ? '<span class="ov" title="ערך מותאם אישית">*</span>' : '';
      tr.innerHTML = `<td>${def.label}${mark}</td><td>${r.time}</td>`;
      tbody.appendChild(tr);
    }
    updateAutoScroll(qs('.zmanim-card'));
  }

  // ---------- seamless loop scroll ----------
  // Clones the content once; animates translateY 0 -> -50% (one full content height)
  // infinitely, so as the original scrolls off the top the clone enters from the bottom.
  function updateAutoScroll(cardEl) {
    if (!cardEl) return;
    const viewport = cardEl.querySelector('.scroll-viewport');
    const inner = viewport && viewport.querySelector('.scroll-inner');
    if (!viewport || !inner) return;

    // Reset
    inner.classList.remove('scrolling');
    inner.style.animationDuration = '';
    inner.removeAttribute('data-cloned');
    inner.querySelectorAll(':scope > [data-clone="1"]').forEach(c => c.remove());

    requestAnimationFrame(() => {
      const vh = viewport.clientHeight;
      const ch = inner.scrollHeight;
      if (ch <= vh + 2) return;

      // Clone current children into a single wrapper and append
      const wrap = document.createElement(inner.tagName === 'UL' ? 'li' : 'div');
      wrap.setAttribute('data-clone', '1');
      if (inner.tagName === 'UL') {
        // For a UL, the clone wrapper should be an LI whose children are clones of the original LIs.
        // Simpler: put the clones straight under the UL as additional LIs.
        const orig = Array.from(inner.children);
        for (const c of orig) {
          const clone = c.cloneNode(true);
          clone.setAttribute('data-clone', '1');
          inner.appendChild(clone);
        }
      } else {
        for (const child of Array.from(inner.children)) {
          wrap.appendChild(child.cloneNode(true));
        }
        inner.appendChild(wrap);
      }
      inner.setAttribute('data-cloned', '1');

      // Speed: ~40px per second (slow, readable)
      const duration = Math.max(ch / 28, 20);
      inner.style.animationDuration = `${duration}s`;
      inner.classList.add('scrolling');
    });
  }

  // ---------- tefillot (always all-rooms) ----------
  function computeShabbatContext() {
    const geo = makeGeo();
    const now = new Date();
    const dow = now.getDay();
    let friday = new Date(now);
    if (dow === 6) friday.setDate(now.getDate() - 1);
    else if (dow === 5) { /* today */ }
    else {
      const daysToFri = (5 - dow + 7) % 7;
      friday.setDate(now.getDate() + daysToFri);
    }
    friday.setHours(12, 0, 0, 0);
    const saturday = new Date(friday); saturday.setDate(friday.getDate() + 1);
    const zFri = new Zmanim(geo, friday);
    const zSat = new Zmanim(geo, saturday);
    const candleMinutes = Number(state.config.location.candleLightingMinutes) || 18;
    const candle = addMinutes(zFri.sunset(), -candleMinutes);
    const havdalah = zSat.tzeit(8.5);
    let havdalahRT = null;
    try { havdalahRT = zSat.sunsetOffset(72); } catch {}
    return { candle, havdalah, havdalahRT, friday, saturday };
  }

  // ---------- פתרון זמן תפילה ----------
  // רשומה יכולה להיות מחרוזת "06:30" (כמו קודם), או אובייקט:
  //   { type:'fixed',    time:'06:30',                    days:[0,1,2,3,4] }
  //   { type:'relative', base:'sunset', offset:-20, round:5, days:[...] }
  // days ריק או חסר = כל הימים. 0=ראשון … 6=שבת.

  let _zmCache = null, _zmCacheKey = '';

  function zmanimToday() {
    const key = new Date().toISOString().slice(0, 10);
    if (!_zmCache || _zmCacheKey !== key) {
      try { _zmCache = computeZmanim(); _zmCacheKey = key; } catch { return {}; }
    }
    return _zmCache;
  }

  function parseHM(str) {
    const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }

  function roundToNearest(date, minutes) {
    if (!minutes || minutes < 1) return date;
    const ms = minutes * 60000;
    return new Date(Math.round(date.getTime() / ms) * ms);
  }

  // שמות הזמנים כפי שמופיעים בטקסט "45 דק׳ לפני הנץ החמה"
  const BASE_LABELS = Object.assign(
    Object.fromEntries(ZMANIM_DEFS.map(d => [d.key, d.label])),
    { sunset: 'השקיעה', candle: 'הדלקת נרות', havdalah: 'צאת השבת' }
  );

  // הזמן הבסיסי של רשומה יחסית. הדלקת נרות וצאת השבת מגיעות מהקשר השבת,
  // כל השאר מזמני היום (כולל דריסות של הגבאי).
  function baseTimeOf(base, ctx) {
    if (base === 'candle' || base === 'havdalah') {
      const c = ctx || computeShabbatContext();
      const d = base === 'candle' ? c.candle : c.havdalah;
      return d instanceof Date && !isNaN(d) ? parseHM(fmtTime(d)) : null;
    }
    return parseHM(zmanimToday()[base]?.time);
  }

  // הטקסט הגולמי של רשומה יחסית: "45 דק׳ לפני הנץ החמה", "שעה אחרי צאת השבת"
  function relativeText(entry) {
    const label = BASE_LABELS[entry.base] || entry.base || '';
    const off = Number(entry.offset) || 0;
    if (!off) return label;
    const abs = Math.abs(off);
    const amount = abs === 60 ? 'שעה' : abs % 60 === 0 ? `${abs / 60} שע׳` : `${abs} דק׳`;
    return `${amount} ${off < 0 ? 'לפני' : 'אחרי'} ${label}`;
  }

  function resolveTimeEntry(entry, dow, ctx) {
    if (entry == null) return null;
    if (typeof entry === 'string') return entry.trim() ? { time: entry.trim() } : null;
    if (typeof entry !== 'object') return null;

    if (Array.isArray(entry.days) && entry.days.length && !entry.days.includes(dow)) return null;

    if (entry.type === 'relative') {
      const d = baseTimeOf(entry.base, ctx);
      if (!d) return null;
      const shifted = roundToNearest(addMinutes(d, Number(entry.offset) || 0), Number(entry.round) || 0);
      const out = { time: fmtTime(shifted), relative: true };
      // show:'text' — על הלוח מופיע הטקסט הגולמי; השעה המחושבת משמשת רק למיון ול"התפילה הבאה"
      if (entry.show === 'text') out.label = relativeText(entry);
      return out;
    }
    return entry.time ? { time: String(entry.time).trim() } : null;
  }

  function pushEntries(rows, list, group, dow, ctx) {
    for (const entry of (list || [])) {
      const r = resolveTimeEntry(entry, dow, ctx);
      if (r) rows.push({ group, time: r.time, relative: r.relative, label: r.label });
    }
  }

  function buildWeekdayRows(room) {
    const rows = [];
    const dow = new Date().getDay();
    pushEntries(rows, room.weekday.shacharit, 'שחרית', dow);
    pushEntries(rows, room.weekday.mincha,    'מנחה',   dow);
    pushEntries(rows, room.weekday.arvit,     'ערבית',  dow);
    return rows;
  }

  function buildShabbatRows(room, ctx) {
    const rows = [];
    const dow = new Date().getDay();
    pushEntries(rows, room.shabbat.kabbalat,            'קבלת שבת',      dow, ctx);
    pushEntries(rows, room.shabbat.minchaErevOffsets,   'מנחה ערב שבת',  dow, ctx);
    pushEntries(rows, room.shabbat.shacharit,           'שחרית שבת',     dow, ctx);
    pushEntries(rows, room.shabbat.mincha,              'מנחה שבת',      dow, ctx);
    pushEntries(rows, room.shabbat.arvitMotzashOffsets, 'ערבית מוצ״ש',   dow, ctx);
    return rows;
  }

  function eventAppliesToday(ev, hdateToday, gregTodayStr) {
    if (ev.dateType === 'hebrew') {
      if (!ev.hebrewDay || !ev.hebrewMonth) return false;
      const monthHe = hebMonth(hdateToday);
      const monthEn = hdateToday.getMonthName();
      const em = String(ev.hebrewMonth).trim();
      const byName = em === monthHe.trim() || em.toLowerCase() === monthEn.toLowerCase();
      const byIndex = Number(em) === hdateToday.getMonth();
      return (byName || byIndex) && Number(ev.hebrewDay) === hdateToday.getDate();
    }
    return ev.date === gregTodayStr;
  }

  function applySpecialEventsToRoom(rows, room) {
    const hdate = getEffectiveHDate();
    const gregToday = new Date().toISOString().slice(0, 10);
    for (const ev of state.specialEvents) {
      if (!eventAppliesToday(ev, hdate, gregToday)) continue;
      for (const t of (ev.times || [])) {
        if (!t.label || !t.time) continue;
        if (t.roomId && t.roomId !== '*' && t.roomId !== room.id) continue;
        const matches = rows.filter(r => r.group === t.label);
        if (matches.length) {
          rows.forEach(r => { if (r.group === t.label) { r.time = t.time; delete r.label; } });
        } else {
          rows.push({ group: t.label, time: t.time, eventName: ev.name });
        }
      }
    }
    return rows;
  }

  // סדר הקבוצות בלוח התפילות — לפי סדר היום: ערב שבת קודם לשבת עצמה
  const PRAYER_ORDER = [
    'מנחה ערב שבת', 'קבלת שבת',
    'שחרית', 'שחרית שבת',
    'מנחה', 'מנחה שבת',
    'ערבית', 'ערבית מוצ״ש',
  ];
  const prayerOrderIdx = (name) => {
    const i = PRAYER_ORDER.indexOf(name);
    return i < 0 ? 99 : i;
  };

  function currentEventName() {
    const hdate = getEffectiveHDate();
    const gregToday = new Date().toISOString().slice(0, 10);
    const match = state.specialEvents.find(ev => eventAppliesToday(ev, hdate, gregToday) && ev.name);
    return match ? match.name : '';
  }

  function renderTefillot() {
    const container = qs('#tefillot-rooms');
    container.innerHTML = '';
    if (!state.rooms.length) {
      container.innerHTML = '<div class="empty-state">לא הוגדרו חדרי תפילה</div>';
      return;
    }

    const now = new Date();
    const dow = now.getDay();
    const isShabbat = dow === 6;
    const isErevShabbat = dow === 5;
    const shabbatCtx = (isShabbat || isErevShabbat) ? computeShabbatContext() : null;

    let title = isShabbat || isErevShabbat ? 'זמני תפילות שבת' : 'זמני תפילות';
    const eventName = currentEventName();
    if (eventName) title = `זמני תפילות — ${eventName}`;
    qs('#tefillot-title').textContent = title;

    // Shared shabbat row at top
    if (shabbatCtx) {
      const shared = document.createElement('div');
      shared.className = 'shabbat-shared';
      shared.innerHTML = `
        <div><span>הדלקת נרות</span><b>${fmtTime(shabbatCtx.candle)}</b></div>
        <div><span>צאת השבת</span><b>${fmtTime(shabbatCtx.havdalah)}</b></div>
      `;
      container.appendChild(shared);
    }

    // Gather minyans by prayer group from every room
    const byGroup = new Map();
    for (const room of state.rooms) {
      const raw = (isShabbat || isErevShabbat) ? buildShabbatRows(room, shabbatCtx) : buildWeekdayRows(room);
      applySpecialEventsToRoom(raw, room);
      for (const r of raw) {
        const list = byGroup.get(r.group) || [];
        list.push({ ...r, roomName: room.name });
        byGroup.set(r.group, list);
      }
    }

    // צום היום — שורה משותפת כמו הדלקת נרות
    const fast = fastTimesToday(getEffectiveHDate());
    if (fast) {
      const shared = document.createElement('div');
      shared.className = 'shabbat-shared fast-line';
      shared.innerHTML =
        (fast.start ? `<div><span>תחילת הצום</span><b>${fast.start}</b></div>` : '') +
        (fast.end ? `<div><span>סיום הצום</span><b>${fast.end}</b></div>` : '');
      container.appendChild(shared);
    }

    const groups = [...byGroup.entries()].sort((a, b) => prayerOrderIdx(a[0]) - prayerOrderIdx(b[0]));
    const showRoomCol = state.rooms.length > 1;
    const next = flag('nextHighlight') ? nextMinyan() : null;
    const hidePast = flag('hidePast');
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const [group, minyans] of groups) {
      minyans.sort((a, b) => parseTime(a.time) - parseTime(b.time));
      const visible = hidePast ? minyans.filter(m => !(parseTime(m.time) < nowMin)) : minyans;
      if (!visible.length) continue;
      const block = document.createElement('div');
      block.className = 'prayer-block';
      const rowsHtml = visible.map(m => {
        const mins = parseTime(m.time);
        const isNext = next && next.group === group && next.time === m.time && next.roomName === m.roomName;
        const isPast = flag('nextHighlight') && !isNaN(mins) && mins < nowMin;
        const badge = isNext ? `<span class="next-in">${untilText(next.minutes)}</span>` : '';
        const shown = m.label ? `<span class="ptime-text">${m.label}</span>` : (m.time || '—');
        return `<tr class="${isNext ? 'next-minyan' : isPast ? 'past-minyan' : ''}"><td class="ptime">${shown}${badge}</td>${showRoomCol ? `<td class="proom">${m.roomName}</td>` : ''}</tr>`;
      }).join('');
      block.innerHTML = `<h3>${group}</h3><table><tbody>${rowsHtml}</tbody></table>`;
      container.appendChild(block);
    }
    if (!container.querySelector('.prayer-block')) {
      container.insertAdjacentHTML('beforeend', '<div class="empty-state">אין עוד תפילות היום</div>');
    }

    updateAutoScroll(qs('.tefillot-card'));
  }

  // כל המניינים של היום, שטוחים — לחישוב "התפילה הבאה"
  function allMinyansToday() {
    const now = new Date();
    const dow = now.getDay();
    const shabbat = dow === 6 || dow === 5;
    const ctx = shabbat ? computeShabbatContext() : null;
    const out = [];
    for (const room of state.rooms) {
      const raw = shabbat ? buildShabbatRows(room, ctx) : buildWeekdayRows(room);
      applySpecialEventsToRoom(raw, room);
      for (const r of raw) if (!isNaN(parseTime(r.time))) out.push({ ...r, roomName: room.name });
    }
    return out.sort((a, b) => parseTime(a.time) - parseTime(b.time));
  }

  function nextMinyan() {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const m = allMinyansToday().find(r => parseTime(r.time) >= nowMin);
    if (!m) return null;
    return { ...m, minutes: parseTime(m.time) - nowMin };
  }

  function untilText(minutes) {
    if (minutes <= 0) return 'עכשיו';
    if (minutes < 60) return `בעוד ${minutes} דק׳`;
    const h = Math.floor(minutes / 60), mm = minutes % 60;
    return mm ? `בעוד ${h} שע׳ ו-${mm} דק׳` : `בעוד ${h} שע׳`;
  }

  // ---------- memorial ----------
  function hebrewDateMatches(entry, hdate) {
    if (!entry.hebrewMonth || !entry.hebrewDay) return false;
    const monthHe = hebMonth(hdate);
    const monthEn = hdate.getMonthName();
    const day = hdate.getDate();
    const em = String(entry.hebrewMonth).trim();
    const byName = em === monthHe.trim() || em.toLowerCase() === monthEn.toLowerCase();
    const byIndex = Number(em) === hdate.getMonth();
    return (byName || byIndex) && Number(entry.hebrewDay) === day;
  }

  function renderMemorial() {
    const list = qs('#memorial-list');
    const card = qs('#memorial-card');
    list.innerHTML = '';
    if (!state.memorial.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    const today = getEffectiveHDate();
    const items = [...state.memorial].map(e => ({ ...e, _today: hebrewDateMatches(e, today) }));
    items.sort((a, b) => {
      if (a._today && !b._today) return -1;
      if (!a._today && b._today) return 1;
      return (a.name || '').localeCompare(b.name || '', 'he');
    });
    for (const entry of items.slice(0, 60)) {
      const li = document.createElement('li');
      const dateStr = entry.hebrewDay && entry.hebrewMonth
        ? `${hebDay(entry.hebrewDay)} ${entry.hebrewMonth}`
        : '';
      li.innerHTML = `
        <span class="mem-name${entry._today ? ' mem-today' : ''}">${entry.name || ''}</span>
        <span class="mem-date">${dateStr}</span>
      `;
      list.appendChild(li);
    }
    updateAutoScroll(qs('.memorial-card'));
  }

  function renderAnnouncements() {
    const container = qs('#announcements-container');
    const ticker = qs('#announcements-ticker');
    const today = new Date().toISOString().slice(0, 10);
    const active = state.announcements.filter(a => {
      const startOk = !a.startDate || a.startDate <= today;
      const endOk = !a.endDate || a.endDate >= today;
      return startOk && endOk && a.text;
    });
    if (!active.length) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    ticker.textContent = active.map(a => a.text).join('   •   ');
  }

  const showUpcoming = () => !state.config || !state.config.display || state.config.display.showUpcoming !== false;

  function renderUpcoming() {
    // הגדרה: "אירוע קרוב" אפשר לכבות. במצב מסכים הקובייה פשוט לא מצוירת.
    document.body.classList.toggle('no-upcoming', !showUpcoming());
    if (!showUpcoming()) { qs('#upcoming-event').textContent = ''; return; }
    try {
      const now = new Date();
      const hdate = getEffectiveHDate();
      const end = new HDate(new Date(now.getTime() + 14 * 86400000));
      const events = HebrewCalendar.calendar({
        start: hdate, end, il: true, locale: 'he',
        candlelighting: false, sedrot: false, omer: false,
      });
      const upcoming = events.find(e => (e.getFlags() & FLAG_CHAG));
      if (!upcoming) { qs('#upcoming-event').textContent = ''; return; }
      // hebcal מחזיר למשל "רֹאשׁ הַשָּׁנָה 5787": מורידים ניקוד וכותבים את השנה באותיות
      const name = upcoming.render('he')
        .replace(/[\u0591-\u05C7]/g, '')
        .replace(/\b5\d{3}\b/, y => hebDay(Number(y) % 1000))
        .trim();
      const days = upcoming.getDate().abs() - hdate.abs();
      const when = days <= 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;
      qs('#upcoming-event').textContent = `${name} · ${when}`;
    } catch { /* ignore */ }
  }

  function applyDesign() {
    if (!state.config) return;
    // הקטלוג המשותף (js/presets.js) משלים כל שדה חסר מהמראה שנבחר,
    // כך שהגדרות ישנות ממשיכות לעבוד וגם design ריק מקבל מראה סביר.
    const d = window.SB_PRESETS
      ? window.SB_PRESETS.resolveDesign(state.config.design)
      : { theme: 'dark', layout: '3col', style: 'classic', font: 'classic', accent: '', scale: 1,
          backgroundImage: '', backgroundOverlay: 0.45, ...(state.config.design || {}) };

    document.body.setAttribute('data-theme', d.theme);
    document.documentElement.setAttribute('data-theme', d.theme);
    const root = qs('#display-root');
    if (root) {
      root.setAttribute('data-layout', d.layout);
      root.setAttribute('data-style', d.style);
      root.setAttribute('data-font', d.font || 'classic');
      root.style.setProperty('--fs', String(d.scale || 1));
    }

    // לוגו בכותרת (במצב מסכים קוביית לוגו נפרדת מסתירה אותו דרך body.logo-block)
    const logoEl = qs('#header-logo');
    if (logoEl) {
      const url = (d.logo && d.logo.url || '').trim();
      const wanted = !!url && !!(state.config.display && state.config.display.headerLogo);
      if (wanted && logoEl.getAttribute('src') !== url) logoEl.src = url;
      logoEl.hidden = !wanted;
    }

    // צבע הדגשה מותאם: inline על ה-html גובר על הערכה, ריק = צבע הערכה
    if (d.accent) document.documentElement.style.setProperty('--accent', d.accent);
    else document.documentElement.style.removeProperty('--accent');

    const bgImage = (d.backgroundImage || '').trim();
    if (bgImage) {
      const safeUrl = bgImage.replace(/["'\\)]/g, '');
      const fits = {
        cover:   ['cover', 'no-repeat', 'center'],
        contain: ['contain', 'no-repeat', 'center'],
        stretch: ['100% 100%', 'no-repeat', 'center'],
        tile:    ['auto', 'repeat', 'center'],
      };
      const [size, repeat, pos] = fits[d.backgroundFit] || fits.cover;
      document.body.style.setProperty('--custom-bg-url', `url("${safeUrl}")`);
      document.body.style.setProperty('--bg-overlay', String(Math.min(0.9, Math.max(0, d.backgroundOverlay))));
      document.body.style.setProperty('--bg-size', size);
      document.body.style.setProperty('--bg-repeat', repeat);
      document.body.style.setProperty('--bg-pos', pos);
      document.body.style.setProperty('--bg-blur', `${Math.min(20, Math.max(0, d.backgroundBlur || 0))}px`);
      document.body.setAttribute('data-custom-bg', '1');
    } else {
      document.body.removeAttribute('data-custom-bg');
      for (const v of ['--custom-bg-url', '--bg-overlay', '--bg-size', '--bg-repeat', '--bg-pos', '--bg-blur'])
        document.body.style.removeProperty(v);
    }
  }

  // ================= קוביות חדשות =================
  // נבנות מחדש בכל ציור מסך. renderDynamicBlocks() מעדכן אותן כל דקה,
  // tickClocks() כל שנייה, והסבב (הקדשות/טקסטים) לפי display.textsSeconds.

  const blockTitle = (type) => (P && P.BLOCKS.find(b => b.type === type)?.name) || type;

  function mkCard(type, title, extraClass = '') {
    const card = document.createElement('section');
    card.className = `card blk blk-${type} ${extraClass}`.trim();
    if (title) { const h = document.createElement('h2'); h.textContent = title; card.appendChild(h); }
    const body = document.createElement('div');
    body.className = 'blk-body';
    card.appendChild(body);
    return { card, body };
  }

  // גודל טקסט לפי ממדי הקובייה — לשעונים ותאריכים שצריכים למלא את המקום
  function fitFont(el, wrap, wFrac, hFrac) {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    el.style.fontSize = `${Math.max(12, Math.min(w * wFrac, h * hFrac))}px`;
  }

  // גופן נוסף שנטען רק כשקובייה צריכה אותו (למשל שעון "לד")
  function ensureFont(name, query) {
    const id = `font-${name}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
    document.head.appendChild(link);
  }

  // לוח שעון אנלוגי: classic (שנתות), numbers, roman, hebrew (אותיות), minimal, modern (נקודות)
  function analogClockSvg(face, showSec) {
    const pt = (r, i, n = 12) => { const a = i * 2 * Math.PI / n; return [50 + r * Math.sin(a), 50 - r * Math.cos(a)]; };
    const line = (cls, r1, r2, i, n, w) => { const [x1, y1] = pt(r1, i, n), [x2, y2] = pt(r2, i, n); return `<line class="${cls}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke-width="${w}"/>`; };
    const NUMS = { numbers: [...Array(12)].map((_, i) => String(i + 1)),
      roman: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'],
      hebrew: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב'] };
    let marks = '';
    if (face === 'minimal') {
      for (let i = 0; i < 4; i++) marks += line('tick tick-big', 38, 45, i, 4, 2.4);
    } else if (face === 'modern') {
      for (let i = 0; i < 12; i++) { const [x, y] = pt(42, i); marks += `<circle class="dot ${i % 3 === 0 ? 'dot-big' : ''}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${i % 3 === 0 ? 2.4 : 1.3}"/>`; }
    } else if (NUMS[face]) {
      for (let i = 0; i < 60; i++) if (i % 5) marks += line('tick tick-min', 44, 46, i, 60, 0.6);
      for (let i = 0; i < 12; i++) { const [x, y] = pt(36, i + 1); marks += `<text class="num ${face === 'roman' ? 'num-roman' : ''}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central">${NUMS[face][i]}</text>`; }
      for (let i = 0; i < 12; i++) marks += line('tick tick-big', 43, 46, i, 12, 1.6);
    } else {
      for (let i = 0; i < 60; i++) if (i % 5) marks += line('tick', 43, 45, i, 60, 0.6);
      for (let i = 0; i < 12; i++) marks += line(`tick ${i % 3 === 0 ? 'tick-big' : ''}`, i % 3 === 0 ? 39 : 41, 45, i, 12, i % 3 === 0 ? 2.2 : 1.2);
    }
    const bold = face === 'modern' || face === 'minimal';
    return `<svg viewBox="0 0 100 100" aria-label="שעון">
      <circle class="face" cx="50" cy="50" r="47" stroke-width="${face === 'minimal' ? 0.8 : 1.5}"/>
      ${marks}
      <line class="hand hand-h" x1="50" y1="${bold ? 54 : 50}" x2="50" y2="${bold ? 28 : 26}" stroke-width="${bold ? 5 : 4}"/>
      <line class="hand hand-m" x1="50" y1="${bold ? 54 : 50}" x2="50" y2="${bold ? 17 : 16}" stroke-width="${bold ? 3.4 : 2.6}"/>
      ${showSec ? '<line class="hand hand-sec" x1="50" y1="56" x2="50" y2="12" stroke-width="1"/>' : ''}
      <circle class="pin" cx="50" cy="50" r="${bold ? 3 : 2.2}"/>
    </svg>`;
  }

  const _blockRenderers = {
    // אלמנט גרפי: ציור מהספרייה (js/decor.js) או תמונה שהועלתה. בלי לוח ובלי מסגרת.
    decor(block, wrap) {
      const cls = `${block.flip ? 'flip' : ''} ${block.anchor ? `anchor-${block.anchor}` : ''}`.trim();
      const { card, body } = mkCard('decor', '', cls);
      const url = String(block.url || '').trim();
      if (url) {
        const img = document.createElement('img');
        img.src = url; img.alt = ''; img.draggable = false;
        body.appendChild(img);
      } else {
        const asset = window.ShulDecor?.get(block.asset || 'menorah');
        if (!asset) { wrap.remove(); return; }
        body.innerHTML = asset.svg;
      }
      wrap.appendChild(card);
    },
    clock(block, wrap) {
      const analog = block.variant === 'analog';
      const showSec = block.seconds !== false;
      const face = String(block.face || (analog ? 'classic' : 'plain'));
      const { card, body } = mkCard('clock', '', `clock-${analog ? 'analog' : 'digital'} face-${face}`);
      if (analog) {
        body.innerHTML = analogClockSvg(face, showSec);
      } else {
        if (face === 'seven') ensureFont('Orbitron', 'family=Orbitron:wght@700');
        const digits = face === 'flip'
          ? `<div class="big-time flip"><span class="fd" data-d="0">0</span><span class="fd" data-d="1">0</span><i>:</i><span class="fd" data-d="2">0</span><span class="fd" data-d="3">0</span>${showSec ? '<span class="fd fd-s" data-d="4">0</span><span class="fd fd-s" data-d="5">0</span>' : ''}</div>`
          : `<div class="big-time">${face === 'seven' ? '<span class="ghost">88:88</span>' : ''}<span class="bt-hm">00:00</span>${showSec ? '<small class="bt-s">00</small>' : ''}</div>`;
        const dateLine = block.showDate
          ? `<div class="bt-date">${getEffectiveHDate().renderGematriya()} · יום ${HEB_DOW[new Date().getDay()]}</div>` : '';
        body.innerHTML = digits + dateLine;
      }
      wrap.appendChild(card);
      if (!analog) {
        const hFrac = block.showDate ? 0.42 : 0.62;
        const bt = body.querySelector('.big-time');
        fitFont(bt, wrap, face === 'flip' ? (showSec ? 0.16 : 0.24) : (showSec ? 0.3 : 0.38), hFrac);
        // גופנים רחבים (לד, קלפים) וקוביות צרות: מכווצים עד שהשעה נכנסת ברוחב
        const avail = wrap.clientWidth * 0.9;
        if (avail && bt.scrollWidth > avail) bt.style.fontSize = `${Math.max(12, parseFloat(bt.style.fontSize) * avail / bt.scrollWidth)}px`;
        const d = body.querySelector('.bt-date'); if (d) fitFont(d, wrap, 0.065, 0.12);
      }
      tickClocks();
    },
    date(block, wrap) {
      const { card, body } = mkCard('date', '');
      const hdate = getEffectiveHDate();
      const now = new Date();
      const par = findParashaText(hdate, now);
      body.innerHTML = `<div class="d-heb">${hdate.renderGematriya()}</div>
        <div class="d-greg">יום ${HEB_DOW[now.getDay()]}, ${now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        ${par ? `<div class="d-parasha">${stripNikud(par)}</div>` : ''}`;
      wrap.appendChild(card);
      fitFont(body.querySelector('.d-heb'), wrap, 0.085, 0.3);
      fitFont(body.querySelector('.d-greg'), wrap, 0.045, 0.16);
      const p = body.querySelector('.d-parasha'); if (p) fitFont(p, wrap, 0.05, 0.18);
    },
    shabbat(block, wrap) {
      const { card, body } = mkCard('shabbat', 'שבת קודש');
      try {
        const ctx = computeShabbatContext();
        const shabbatHd = new HDate(ctx.saturday);
        const par = findParashaText(shabbatHd, ctx.saturday);
        const special = todayEvents(shabbatHd).filter(e => e.getFlags() & (flags.SPECIAL_SHABBAT | flags.CHAG | flags.ROSH_CHODESH))
          .map(e => stripNikud(e.render('he'))).slice(0, 2);
        const room = state.rooms[0];
        const rows = [];
        // הרשומה הראשונה שחלה ביום המבוקש; טקסט גולמי מוצג כמו שהוא
        const first = (list, dow) => {
          for (const e of (list || [])) { const r = resolveTimeEntry(e, dow, ctx); if (r) return r.label || r.time; }
          return null;
        };
        const erev = room && first(room.shabbat.minchaErevOffsets, 5);
        if (erev) rows.push(['מנחה ערב שבת', erev]);
        rows.push(['הדלקת נרות', fmtTime(ctx.candle)]);
        const shach = room && first(room.shabbat.shacharit, 6); if (shach) rows.push(['שחרית', shach]);
        const minch = room && first(room.shabbat.mincha, 6);    if (minch) rows.push(['מנחה', minch]);
        rows.push(['צאת השבת', fmtTime(ctx.havdalah)]);
        if (ctx.havdalahRT) rows.push(['צאת השבת (ר״ת)', fmtTime(ctx.havdalahRT)]);
        const motz = room && first(room.shabbat.arvitMotzashOffsets, 6); if (motz) rows.push(['ערבית מוצ״ש', motz]);
        body.innerHTML = `${par ? `<div class="sh-parasha">${stripNikud(par)}${special.length ? ' · ' + special.join(' · ') : ''}</div>` : ''}` +
          rows.map(([k, v]) => `<div class="sh-row"><span>${k}</span><b>${v}</b></div>`).join('');
      } catch { body.innerHTML = '<div class="blk-empty">—</div>'; }
      wrap.appendChild(card);
    },
    today(block, wrap) {
      const inline = block.h <= 2;
      const { card, body } = mkCard('today', inline ? '' : 'היום', inline ? 'blk-inline' : '');
      const hdate = getEffectiveHDate();
      const items = computeTodayItems(hdate).map(i => i.text);
      const fast = fastTimesToday(hdate, true);
      if (fast) items.push(`${fast.start ? 'תחילת הצום ' + fast.start : ''}${fast.start && fast.end ? ' · ' : ''}${fast.end ? 'סיום הצום ' + fast.end : ''}`);
      const omer = findOmerText(hdate);
      if (omer) items.push(omer);
      body.innerHTML = items.length
        ? items.map(t => `<div class="td-item">${t}</div>`).join('')
        : `<div class="td-item">${stripNikud(hdate.renderGematriya())} · יום רגיל</div>`;
      wrap.appendChild(card);
    },
    learning(block, wrap) {
      const { card, body } = mkCard('learning', 'לימוד יומי');
      const ids = (state.config.display && Array.isArray(state.config.display.learning) && state.config.display.learning.length)
        ? state.config.display.learning : ['dafyomi'];
      if (!window.hebcal.DailyLearning || !window.hebcal.DailyLearning.getCalendars().length) {
        body.innerHTML = '<div class="blk-empty">טוען…</div>';
        ensureLearning().then(() => renderDynamicBlocks());
      } else {
        const hdate = getEffectiveHDate();
        const rows = [];
        for (const id of ids) {
          const name = (P && P.LEARNING.find(l => l.id === id)?.name) || id;
          try {
            const ev = window.hebcal.DailyLearning.lookup(id, hdate, true);
            if (!ev) continue;
            let text = stripNikud(ev.render('he'));
            if (id === 'dafyomi') text = text.replace(/^[^:\d]{2,20}:\s*/, '');
            rows.push(`<div class="ln-row"><span class="ln-name">${name}</span><span class="ln-val">${text}</span></div>`);
          } catch {}
        }
        body.innerHTML = rows.join('') || '<div class="blk-empty">אין לימוד להיום</div>';
      }
      wrap.appendChild(card);
    },
    dedications(block, wrap) {
      const { card, body } = mkCard('dedications', 'הקדשות וברכות');
      const items = activeDedications();
      if (!items.length) body.innerHTML = '<div class="blk-empty">אין הקדשות פעילות</div>';
      else {
        const i = _rotIndex % items.length;
        const it = items[i];
        const type = (P && P.DEDICATION_TYPES.find(t => t.id === it.type)) || { name: it.type || '', icon: '' };
        body.innerHTML = `<div class="dd-fade">
          <div class="dd-type">${type.icon} ${type.name}</div>
          <div class="dd-text">${escapeText(it.text)}</div>
          ${it.from ? `<div class="dd-by">${escapeText(it.from)}</div>` : ''}
          ${items.length > 1 ? `<div class="dd-dots">${items.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        </div>`;
      }
      wrap.appendChild(card);
    },
    shiurim(block, wrap) {
      const { card, body } = mkCard('shiurim', 'שיעורים');
      const now = new Date();
      const dow = now.getDay();
      const list = (dayIdx) => state.shiurim
        .filter(s => s && s.title && (!Array.isArray(s.days) || !s.days.length || s.days.includes(dayIdx)))
        .sort((a, b) => parseTime(a.time) - parseTime(b.time));
      const row = (s) => `<div class="sr-row"><span class="sr-time">${s.time || ''}</span><span class="sr-title">${escapeText(s.title)}</span>
        ${(s.lecturer || s.place) ? `<span class="sr-meta">${[s.lecturer, s.place].filter(Boolean).map(escapeText).join(' · ')}</span>` : ''}</div>`;
      const today = list(dow), tomorrow = list((dow + 1) % 7);
      let html = '';
      if (today.length) html += `<div class="sr-day">היום</div>` + today.map(row).join('');
      if (tomorrow.length && (block.h >= 5 || !today.length)) html += `<div class="sr-day">מחר</div>` + tomorrow.map(row).join('');
      body.innerHTML = html || '<div class="blk-empty">אין שיעורים היום</div>';
      wrap.appendChild(card);
    },
    text(block, wrap) {
      const items = state.texts.filter(t => t && (t.body || t.title));
      const { card, body } = mkCard('text', '');
      if (!items.length) body.innerHTML = '<div class="blk-empty">לא הוזנו טקסטים</div>';
      else {
        const it = items[_rotIndex % items.length];
        body.innerHTML = `<div class="dd-fade">${it.title ? `<div class="tx-title">${escapeText(it.title)}</div>` : ''}<div class="tx-body">${escapeText(it.body || '')}</div></div>`;
      }
      wrap.appendChild(card);
    },
    omer(block, wrap) {
      const { card, body } = mkCard('omer', '');
      const hdate = getEffectiveHDate();
      let ev = null;
      try {
        ev = HebrewCalendar.calendar({ start: hdate, end: hdate, omer: true, locale: 'he', il: true })
          .find(e => e.getFlags() & flags.OMER_COUNT);
      } catch {}
      if (!ev) body.innerHTML = '<div class="blk-empty">ספירת העומר — לא בימי הספירה</div>';
      else {
        const n = typeof ev.omer === 'number' ? ev.omer : (ev.getOmerDay ? ev.getOmerDay() : 0);
        const sefira = typeof ev.sefira === 'function' ? ev.sefira('he') : '';
        body.innerHTML = `<div class="om-big">${hebDay(n)}</div><div class="om-text">${stripNikud(ev.getTodayIs ? ev.getTodayIs('he') : ev.render('he'))}</div>${sefira ? `<div class="om-sefira">${stripNikud(sefira)}</div>` : ''}`;
        wrap.appendChild(card);
        fitFont(body.querySelector('.om-big'), wrap, 0.35, 0.42);
        fitFont(body.querySelector('.om-text'), wrap, 0.05, 0.12);
        const sf = body.querySelector('.om-sefira'); if (sf) fitFont(sf, wrap, 0.04, 0.1);
        return;
      }
      wrap.appendChild(card);
    },
    weather(block, wrap) {
      const { card, body } = mkCard('weather', 'מזג אוויר');
      const w = _weather;
      if (!w) { body.innerHTML = '<div class="blk-empty">טוען…</div>'; fetchWeather(); }
      else {
        body.innerHTML = `<div class="wx-now"><span class="wx-icon">${wmoIcon(w.code)}</span><span class="wx-temp">${Math.round(w.temp)}°</span></div>
          <div class="wx-desc">${wmoText(w.code)}</div>
          ${block.h >= 4 && w.days.length ? `<div class="wx-days">${w.days.map(d => `<div class="wx-day"><div>${d.name}</div><div class="ic">${wmoIcon(d.code)}</div><b>${Math.round(d.max)}° / ${Math.round(d.min)}°</b></div>`).join('')}</div>` : ''}`;
      }
      wrap.appendChild(card);
    },
    countdown(block, wrap) {
      const { card, body } = mkCard('countdown', '');
      body.innerHTML = '<div class="cd-label"></div><div class="cd-name"></div><div class="cd-time"></div><div class="cd-at"></div>';
      wrap.appendChild(card);
      fitFont(body.querySelector('.cd-time'), wrap, 0.22, 0.4);
      tickClocks();
    },
  };

  const escapeText = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function activeDedications() {
    const today = new Date().toISOString().slice(0, 10);
    return state.dedications.filter(d => d && d.text &&
      (!d.startDate || d.startDate <= today) && (!d.endDate || d.endDate >= today));
  }

  // ---------- שעונים וספירה לאחור — כל שנייה ----------
  function tickClocks() {
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const ss = String(now.getSeconds()).padStart(2, '0');
    document.querySelectorAll('.blk-clock .bt-hm').forEach(e => { e.textContent = hm; });
    document.querySelectorAll('.blk-clock .bt-s').forEach(e => { e.textContent = ss; });
    const flipDigits = hm.replace(':', '') + ss;
    document.querySelectorAll('.blk-clock .flip .fd').forEach(e => {
      const d = flipDigits[Number(e.dataset.d)] || '0';
      if (e.textContent !== d) { e.textContent = d; e.classList.remove('tick'); void e.offsetWidth; e.classList.add('tick'); }
    });
    document.querySelectorAll('.blk-clock svg').forEach(svg => {
      const h = now.getHours() % 12 + now.getMinutes() / 60, m = now.getMinutes() + now.getSeconds() / 60, s = now.getSeconds();
      svg.querySelector('.hand-h')?.setAttribute('transform', `rotate(${h * 30} 50 50)`);
      svg.querySelector('.hand-m')?.setAttribute('transform', `rotate(${m * 6} 50 50)`);
      svg.querySelector('.hand-sec')?.setAttribute('transform', `rotate(${s * 6} 50 50)`);
    });
    const cds = document.querySelectorAll('.blk-countdown');
    if (cds.length) {
      const next = nextMinyan();
      cds.forEach(c => {
        const label = c.querySelector('.cd-label'), name = c.querySelector('.cd-name'), time = c.querySelector('.cd-time'), at = c.querySelector('.cd-at');
        if (!next) { label.textContent = 'התפילה הבאה'; name.textContent = 'אין עוד תפילות היום'; time.textContent = ''; at.textContent = ''; return; }
        const target = parseHM(next.time);
        const diff = Math.max(0, Math.floor((target - now) / 1000));
        const hh = Math.floor(diff / 3600), mm = Math.floor((diff % 3600) / 60), sec = diff % 60;
        label.textContent = 'התפילה הבאה';
        name.textContent = `${next.group}${state.rooms.length > 1 ? ' · ' + next.roomName : ''}`;
        time.textContent = hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        at.textContent = `בשעה ${next.time}`;
      });
    }
    checkSleep(now);
  }

  // ---------- סבב הקדשות/טקסטים ----------
  let _rotIndex = 0;
  let _rotTimer = null;
  function startRotation() {
    clearInterval(_rotTimer);
    if (!document.querySelector('.blk-dedications, .blk-text')) return;
    const secs = Math.max(4, Number(state.config?.display?.textsSeconds) || 15);
    _rotTimer = setInterval(() => {
      _rotIndex += 1;
      rerenderBlocks(['dedications', 'text']);
    }, secs * 1000);
  }

  // ---------- ציור מחדש של קוביות דינמיות ----------
  function rerenderBlocks(types) {
    if (!_stage) return;
    for (const wrap of _stage.querySelectorAll('.screen-block')) {
      const type = wrap.dataset.type;
      if (!_blockRenderers[type] || (types && !types.includes(type))) continue;
      const block = wrap._block || { type, h: 5 };
      wrap.innerHTML = '';
      try { _blockRenderers[type](block, wrap); } catch (e) { console.error('block', type, e); }
    }
  }
  function renderDynamicBlocks() {
    rerenderBlocks(['date', 'shabbat', 'today', 'learning', 'shiurim', 'omer', 'weather']);
  }

  // ---------- לימוד יומי: הספרייה נטענת רק כשצריך ----------
  let _learningPromise = null;
  function ensureLearning() {
    if (window.hebcal.DailyLearning && window.hebcal.DailyLearning.getCalendars().length) return Promise.resolve();
    if (_learningPromise) return _learningPromise;
    _learningPromise = new Promise((resolve) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/@hebcal/learning@6.6.1/dist/bundle.min.js';
      sc.onload = resolve; sc.onerror = resolve;
      document.head.appendChild(sc);
    });
    return _learningPromise;
  }

  // ---------- מזג אוויר (Open-Meteo, בלי מפתח) ----------
  let _weather = null, _weatherAt = 0;
  async function fetchWeather() {
    if (Date.now() - _weatherAt < 30 * 60 * 1000) return;
    _weatherAt = Date.now();
    try {
      const { latitude, longitude } = state.config.location;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(latitude)}&longitude=${Number(longitude)}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=4`;
      const res = await fetch(url);
      const j = await res.json();
      const days = (j.daily?.time || []).slice(1, 4).map((t, i) => ({
        name: HEB_DOW[new Date(t + 'T12:00:00').getDay()],
        code: j.daily.weather_code[i + 1], max: j.daily.temperature_2m_max[i + 1], min: j.daily.temperature_2m_min[i + 1],
      }));
      _weather = { temp: j.current?.temperature_2m, code: j.current?.weather_code, days };
      rerenderBlocks(['weather']);
    } catch (e) { console.error('weather', e); }
  }
  const wmoIcon = (c) => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 49 ? '🌫️' : c <= 59 ? '🌦️' : c <= 69 ? '🌧️' : c <= 79 ? '🌨️' : c <= 84 ? '🌦️' : c <= 94 ? '⛈️' : '⛈️';
  const wmoText = (c) => c === 0 ? 'בהיר' : c <= 2 ? 'מעונן חלקית' : c === 3 ? 'מעונן' : c <= 49 ? 'ערפל' : c <= 59 ? 'טפטוף' : c <= 69 ? 'גשם' : c <= 79 ? 'שלג' : c <= 84 ? 'ממטרים' : 'סופת רעמים';

  // ---------- מצב שינה ----------
  function checkSleep(now = new Date()) {
    const s = state.config?.display?.sleep;
    let sleeping = false;
    if (s && s.enabled && !_previewMode) {
      const cur = now.getHours() * 60 + now.getMinutes();
      const from = parseTime(s.from), to = parseTime(s.to);
      if (!isNaN(from) && !isNaN(to)) sleeping = from <= to ? (cur >= from && cur < to) : (cur >= from || cur < to);
    }
    document.body.classList.toggle('sleeping', sleeping);
    if (sleeping) {
      const c = qs('#sleep-clock');
      if (c) c.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
  }

  // ================= מסכים מתחלפים =================
  // כל קובייה עוטפת אלמנט קיים בדף, כך שכל פונקציות הרינדור ממשיכות
  // למצוא את היעדים שלהן לפי id — רק המיקום משתנה.

  const GRID = { cols: 24, rows: 18 };

  const BLOCK_SELECTOR = {
    header: '.display-header',
    zmanim: '.zmanim-card',
    tefillot: '.tefillot-card',
    memorial: '.memorial-card',
    mentions: '.mentions-bar',
    announcements: '.announcements-container',
    upcoming: '.display-footer',
  };

  let _stage = null;
  let _homes = null;        // איפה כל אלמנט ישב במקור, כדי שאפשר יהיה לחזור
  let _screenTimer = null;
  let _mediaTimer = null;
  let _screenIndex = 0;

  function rememberHomes() {
    if (_homes) return;
    _homes = new Map();
    for (const [type, sel] of Object.entries(BLOCK_SELECTOR)) {
      const el = qs(sel);
      if (el) _homes.set(type, { el, parent: el.parentNode, next: el.nextSibling });
    }
  }

  function restoreClassic() {
    if (_homes) {
      for (const { el, parent, next } of _homes.values()) {
        el.style.cssText = '';
        el.hidden = false;
        el.classList.remove('no-clock', 'no-sub');
        parent.insertBefore(el, next);
      }
    }
    if (_stage) { _stage.remove(); _stage = null; }
    clearInterval(_screenTimer); _screenTimer = null;
    clearInterval(_mediaTimer); _mediaTimer = null;
    clearInterval(_rotTimer); _rotTimer = null;
    document.body.removeAttribute('data-screens');
    document.body.classList.remove('logo-block');
  }

  function screensConfig() {
    const s = state.screens;
    if (!s || !s.enabled) return null;
    const list = Array.isArray(s.screens) ? s.screens.filter(x => x && Array.isArray(x.blocks)) : [];
    return list.length ? { ...s, screens: list } : null;
  }

  function applyScreens() {
    const cfg = screensConfig();
    if (!cfg) { restoreClassic(); return; }

    rememberHomes();
    document.body.setAttribute('data-screens', '1');

    if (!_stage) {
      _stage = document.createElement('div');
      _stage.id = 'screen-stage';
      qs('#display-root').appendChild(_stage);
    }
    _stage.style.setProperty('--aspect', (cfg.aspect || '16:9').replace(':', ' / '));

    if (_screenIndex >= cfg.screens.length) _screenIndex = 0;
    paintScreen(cfg, _screenIndex);

    clearInterval(_screenTimer);
    if (cfg.screens.length > 1) {
      const tick = () => {
        const c = screensConfig();
        if (!c) return;
        _screenIndex = (_screenIndex + 1) % c.screens.length;
        paintScreen(c, _screenIndex);
        scheduleNext(c);
      };
      const scheduleNext = (c) => {
        clearTimeout(_screenTimer);
        const secs = Math.max(3, Number(c.screens[_screenIndex]?.seconds) || 20);
        _screenTimer = setTimeout(tick, secs * 1000);
      };
      scheduleNext(cfg);
    }
  }

  function paintScreen(cfg, index) {
    const screen = cfg.screens[index];
    if (!screen) return;

    // הכל מוסתר, ומה שנמצא במסך הנוכחי יוחזר לתצוגה
    for (const { el } of _homes.values()) el.hidden = true;
    document.body.classList.toggle('logo-block', screen.blocks.some(b => b.type === 'logo'));
    _stage.innerHTML = '';

    for (const block of screen.blocks) {
      if (block.type === 'upcoming' && !showUpcoming()) continue;
      const wrap = document.createElement('div');
      wrap.className = 'screen-block';
      wrap.dataset.type = block.type;
      wrap.style.left   = `${(block.x / GRID.cols) * 100}%`;
      wrap.style.top    = `${(block.y / GRID.rows) * 100}%`;
      wrap.style.width  = `${(block.w / GRID.cols) * 100}%`;
      wrap.style.height = `${(block.h / GRID.rows) * 100}%`;

      if (typeof block.opacity === 'number') wrap.style.opacity = String(block.opacity);
      if (block.floating) { wrap.style.zIndex = '5'; wrap.style.pointerEvents = 'none'; }

      wrap._block = block;
      _stage.appendChild(wrap);
      if (_blockRenderers[block.type]) {
        try { _blockRenderers[block.type](block, wrap); } catch (e) { console.error('block', block.type, e); }
      } else if (block.type === 'media') {
        wrap.appendChild(buildMediaWindow(block));
      } else if (block.type === 'logo') {
        const url = (state.config?.design?.logo?.url || '').trim();
        if (!url) { wrap.remove(); continue; }
        const img = document.createElement('img');
        img.className = 'logo-img';
        img.src = url;
        img.alt = 'לוגו';
        wrap.appendChild(img);
      } else {
        const home = _homes.get(block.type);
        if (!home) continue;
        home.el.hidden = false;
        home.el.style.cssText = 'width:100%;height:100%;margin:0;';
        if (block.type === 'header') {
          // "רק שם" — כשיש קוביית שעון נפרדת אין טעם בשעון של הכותרת
          home.el.classList.toggle('no-clock', block.showClock === false);
          home.el.classList.toggle('no-sub', block.showSub === false);
        }
        wrap.appendChild(home.el);
      }
    }

    startMediaRotation();
    startRotation();
  }

  // ---------- חלון המודעות ----------
  function buildMediaWindow(block) {
    const box = document.createElement('div');
    box.className = 'media-window';
    box.id = 'media-window';
    if (block?.fit === 'contain' || block?.fit === 'cover') box.dataset.fit = block.fit;
    if (block?.page) box.dataset.page = block.page;
    return box;
  }

  // יחס דף (רוחב/גובה) להצגת PDF שלם. 'fill' מותח לכל הלוח.
  const PAGE_RATIO = { portrait: 1 / 1.414, landscape: 1.414, square: 1 };

  function mediaItems() {
    const p = state.mediaPlaylist || {};
    return Array.isArray(p.entries) ? p.entries.filter(e => e && e.url) : [];
  }

  let _mediaIndex = 0;

  function renderMediaItem() {
    const boxes = document.querySelectorAll('.media-window');
    if (!boxes.length) return;
    const items = mediaItems();
    if (items.length && _mediaIndex >= items.length) _mediaIndex = 0;
    const item = items[_mediaIndex];

    for (const box of boxes) {
      if (!item) { box.innerHTML = '<div class="media-empty">לא הועלו מודעות</div>'; continue; }
      // התאמה: קודם ההגדרה של הקובייה, אחרת ההגדרה של חלון המודעות
      const fit = box.dataset.fit || (state.mediaPlaylist?.fit === 'cover' ? 'cover' : 'contain');
      const page = box.dataset.page || 'portrait';

      if (item.kind === 'pdf') {
        // Chrome מרנדר PDF מוטמע; הפרמטרים מסתירים את סרגלי הכלים בקיוסק.
        // כדי שכל הדף ייכנס ללוח, ה-iframe מקבל בדיוק את צורת הדף בתוך הלוח.
        box.innerHTML =
          `<iframe class="media-pdf" src="${item.url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit" title="מודעה"></iframe>`;
        const frame = box.querySelector('.media-pdf');
        const ratio = PAGE_RATIO[page];
        if (fit === 'cover' || !ratio) { frame.style.width = '100%'; frame.style.height = '100%'; continue; }
        const bw = box.clientWidth, bh = box.clientHeight;
        if (!bw || !bh) continue;
        let w = bw, h = bw / ratio;
        if (h > bh) { h = bh; w = bh * ratio; }
        frame.style.width = `${Math.floor(w)}px`;
        frame.style.height = `${Math.floor(h)}px`;
      } else {
        box.innerHTML =
          `<img class="media-img" style="object-fit:${fit}" src="${item.url}" alt="מודעה">`;
      }
    }
  }

  function startMediaRotation() {
    clearInterval(_mediaTimer);
    if (!document.querySelector('.media-window')) return;
    renderMediaItem();
    const items = mediaItems();
    if (items.length < 2) return;
    const secs = Math.max(3, Number(state.mediaPlaylist?.seconds) || 12);
    _mediaTimer = setInterval(() => {
      _mediaIndex = (_mediaIndex + 1) % mediaItems().length;
      renderMediaItem();
    }, secs * 1000);
  }

  // כל קובייה מצוירת בנפרד: תקלה בהנצחות לא משאירה את הזמנים ריקים.
  const safe = (label, fn) => { try { fn(); } catch (e) { console.error(`${label} failed`, e); } };

  async function refreshAll() {
    try {
      await loadData();
    } catch (e) {
      // הטעינה נכשלה — ממשיכים להציג את מה שכבר טעון
      console.error('load failed', e);
      if (!state.config) return;
    }
    safe('design', applyDesign);
    safe('screens', applyScreens);
    safe('header', renderHeader);
    safe('zmanim', renderZmanim);
    safe('tefillot', renderTefillot);
    safe('memorial', renderMemorial);
    safe('announcements', renderAnnouncements);
    safe('upcoming', renderUpcoming);
  }

  function lightRefresh() {
    if (!state.config) return;
    safe('header', renderHeader);
    safe('zmanim', renderZmanim);
    safe('tefillot', renderTefillot);
    safe('memorial', renderMemorial);
    safe('blocks', renderDynamicBlocks);
    safe('sleep', checkSleep);
  }

  // ---------- auto-reload on new commit ----------
  function detectOwnerRepo() {
    const host = location.hostname;
    const match = host.match(/^([^.]+)\.github\.io$/);
    if (match) {
      const parts = location.pathname.split('/').filter(Boolean);
      if (parts[0]) return `${match[1]}/${parts[0]}`;
    }
    return '';
  }

  // בדיקת עדכונים: משווים את חותמת הגרסה של המנה הציבורית.
  // כשגבאי שומר שינוי, ה-version עולה והצג מרענן את עצמו תוך דקות.
  // בדרך כלל הבדיקה היא הדופק ל"מסכים בלייב"; בתוך iframe או בלשונית מוסתרת
  // (מישהו פתח את הצג ברקע בטלפון) לא נשלח דופק — רק הבדיקה הישנה מול המנה הציבורית.
  async function checkForUpdates() {
    // בתוך התצוגה המקדימה של הניהול: ריענון היה מוחק שינויי עיצוב שטרם נשמרו
    if (_previewMode) return;
    try {
      let version;
      let viaHeartbeat = !_embedded && !document.hidden && _version != null;
      if (viaHeartbeat) {
        try {
          const hb = await sendHeartbeat();
          if (hb.appVersion && _appVersion && hb.appVersion !== _appVersion) { location.reload(); return; }
          version = hb.version;
        } catch { viaHeartbeat = false; }
      }
      if (!viaHeartbeat) version = (await fetchBundle()).version;
      if (_version == null) { _version = version; return; }
      if (version !== _version) {
        _version = version;
        await refreshAll();
      }
    } catch { /* הצג ממשיך להציג את מה שכבר טעון */ }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await refreshAll();
    renderClock();
    setInterval(() => { renderClock(); try { tickClocks(); } catch {} }, 1000);
    setInterval(lightRefresh, 60 * 1000);
    setInterval(refreshAll, 5 * 60 * 1000);
    // בדיקת שינויים כל 3 דקות. השעון והזמנים מחושבים מקומית,
    // כך שגם הקצב הזה שומר את הפלטפורמה בתוך המכסה החינמית.
    setInterval(checkForUpdates, 3 * 60 * 1000);
    // דופק ראשון מיד אחרי הטעינה, כדי שהמסך יופיע בניהול בלי לחכות 3 דקות
    checkForUpdates();

    // Listen for design preview updates from admin page
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'PREVIEW_DESIGN') {
        if (event.origin !== location.origin) return;
        _previewMode = true;
        document.body.setAttribute('data-preview', '1');
        if (!state.config) state.config = {};
        // הניהול שולח את כל אובייקט העיצוב; שדות בודדים נתמכים לתאימות
        const incoming = event.data.design && typeof event.data.design === 'object'
          ? event.data.design
          : event.data;
        const design = { ...(state.config.design || {}) };
        for (const k of ['preset', 'theme', 'style', 'layout', 'font', 'accent', 'backgroundImage', 'backgroundFit']) {
          if (typeof incoming[k] === 'string') design[k] = incoming[k];
        }
        for (const k of ['backgroundOverlay', 'backgroundBlur', 'scale']) {
          if (typeof incoming[k] === 'number') design[k] = incoming[k];
        }
        if (incoming.logo && typeof incoming.logo === 'object') design.logo = incoming.logo;
        state.config.design = design;
        if (event.data.display && typeof event.data.display === 'object') {
          state.config.display = { ...(state.config.display || {}), ...event.data.display };
        }
        applyDesign();
        safe('upcoming', renderUpcoming);
        // הלוגו וקוביית האירוע יושבים בתוך קוביות — מציירים מחדש כדי שהשינוי ייראה
        if (incoming.logo || event.data.display) applyScreens();
      }

      // תצוגה מקדימה חיה של עורך המסכים
      if (event.data && event.data.type === 'PREVIEW_SCREENS') {
        if (event.origin !== location.origin) return;
        _previewMode = true;
        if (event.data.screens) state.screens = event.data.screens;
        if (event.data.mediaPlaylist) state.mediaPlaylist = event.data.mediaPlaylist;
        if (typeof event.data.screenIndex === 'number') _screenIndex = event.data.screenIndex;
        applyScreens();
      }
    });
  });
})();
