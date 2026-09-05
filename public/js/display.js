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
      minchaErevOffsets:   asArr(sh.minchaErevOffsets ?? sh.minchaErevOffset).map(Number).filter(n => !isNaN(n)),
      shacharit:           asArr(sh.shacharit).map(keepEntry),
      mincha:              asArr(sh.mincha).map(keepEntry),
      arvitMotzashOffsets: asArr(sh.arvitMotzashOffsets ?? sh.arvitMotzashOffset).map(Number).filter(n => !isNaN(n)),
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

  function resolveTimeEntry(entry, dow) {
    if (entry == null) return null;
    if (typeof entry === 'string') return entry.trim() ? { time: entry.trim() } : null;
    if (typeof entry !== 'object') return null;

    if (Array.isArray(entry.days) && entry.days.length && !entry.days.includes(dow)) return null;

    if (entry.type === 'relative') {
      const base = zmanimToday()[entry.base]?.time;
      const d = parseHM(base);
      if (!d) return null;
      const shifted = roundToNearest(addMinutes(d, Number(entry.offset) || 0), Number(entry.round) || 0);
      return { time: fmtTime(shifted), relative: true };
    }
    return entry.time ? { time: String(entry.time).trim() } : null;
  }

  function pushEntries(rows, list, group, dow) {
    for (const entry of (list || [])) {
      const r = resolveTimeEntry(entry, dow);
      if (r) rows.push({ group, time: r.time, relative: r.relative });
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
    pushEntries(rows, room.shabbat.kabbalat, 'קבלת שבת', dow);
    for (const off of room.shabbat.minchaErevOffsets) rows.push({ group: 'מנחה ערב שבת', time: fmtTime(addMinutes(ctx.candle, off)) });
    pushEntries(rows, room.shabbat.shacharit, 'שחרית שבת', dow);
    pushEntries(rows, room.shabbat.mincha,    'מנחה שבת',  dow);
    for (const off of room.shabbat.arvitMotzashOffsets) rows.push({ group: 'ערבית מוצ״ש', time: fmtTime(addMinutes(ctx.havdalah, off)) });
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
          rows.forEach(r => { if (r.group === t.label) r.time = t.time; });
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
        return `<tr class="${isNext ? 'next-minyan' : isPast ? 'past-minyan' : ''}"><td class="ptime">${m.time || '—'}${badge}</td>${showRoomCol ? `<td class="proom">${m.roomName}</td>` : ''}</tr>`;
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
      document.body.style.setProperty('--custom-bg-url', `url("${safeUrl}")`);
      document.body.style.setProperty('--bg-overlay', String(Math.min(0.9, Math.max(0, d.backgroundOverlay))));
      document.body.setAttribute('data-custom-bg', '1');
    } else {
      document.body.removeAttribute('data-custom-bg');
      document.body.style.removeProperty('--custom-bg-url');
      document.body.style.removeProperty('--bg-overlay');
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

  const _blockRenderers = {
    clock(block, wrap) {
      const analog = block.variant === 'analog';
      const { card, body } = mkCard('clock', '');
      if (analog) {
        body.innerHTML = `<svg viewBox="0 0 100 100" aria-label="שעון">
          <circle class="face" cx="50" cy="50" r="47" stroke-width="1.5"/>
          ${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; const big = i % 3 === 0;
            const r1 = big ? 39 : 42, r2 = 45;
            return `<line class="tick ${big ? 'tick-big' : ''}" x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + r2 * Math.sin(a)}" y2="${50 - r2 * Math.cos(a)}" stroke-width="${big ? 2.2 : 1}"/>`; }).join('')}
          <line class="hand hand-h" x1="50" y1="50" x2="50" y2="26" stroke-width="4"/>
          <line class="hand hand-m" x1="50" y1="50" x2="50" y2="16" stroke-width="2.6"/>
          <line class="hand hand-sec" x1="50" y1="56" x2="50" y2="12" stroke-width="1"/>
          <circle cx="50" cy="50" r="2.2" fill="currentColor"/>
        </svg>`;
      } else {
        body.innerHTML = '<div class="big-time"><span class="bt-hm">00:00</span><small class="bt-s">00</small></div>';
      }
      wrap.appendChild(card);
      if (!analog) fitFont(body.querySelector('.big-time'), wrap, 0.3, 0.62);
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
        if (room && room.shabbat.minchaErevOffsets.length) rows.push(['מנחה ערב שבת', fmtTime(addMinutes(ctx.candle, room.shabbat.minchaErevOffsets[0]))]);
        rows.push(['הדלקת נרות', fmtTime(ctx.candle)]);
        if (room && room.shabbat.shacharit.length) { const r = resolveTimeEntry(room.shabbat.shacharit[0], 6); if (r) rows.push(['שחרית', r.time]); }
        if (room && room.shabbat.mincha.length) { const r = resolveTimeEntry(room.shabbat.mincha[0], 6); if (r) rows.push(['מנחה', r.time]); }
        rows.push(['צאת השבת', fmtTime(ctx.havdalah)]);
        if (ctx.havdalahRT) rows.push(['צאת השבת (ר״ת)', fmtTime(ctx.havdalahRT)]);
        if (room && room.shabbat.arvitMotzashOffsets.length) rows.push(['ערבית מוצ״ש', fmtTime(addMinutes(ctx.havdalah, room.shabbat.arvitMotzashOffsets[0]))]);
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
    document.querySelectorAll('.blk-clock svg').forEach(svg => {
      const h = now.getHours() % 12 + now.getMinutes() / 60, m = now.getMinutes() + now.getSeconds() / 60, s = now.getSeconds();
      svg.querySelector('.hand-h').setAttribute('transform', `rotate(${h * 30} 50 50)`);
      svg.querySelector('.hand-m').setAttribute('transform', `rotate(${m * 6} 50 50)`);
      svg.querySelector('.hand-sec').setAttribute('transform', `rotate(${s * 6} 50 50)`);
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
        wrap.appendChild(buildMediaWindow());
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
        wrap.appendChild(home.el);
      }
    }

    startMediaRotation();
    startRotation();
  }

  // ---------- חלון המודעות ----------
  function buildMediaWindow() {
    const box = document.createElement('div');
    box.className = 'media-window';
    box.id = 'media-window';
    return box;
  }

  function mediaItems() {
    const p = state.mediaPlaylist || {};
    return Array.isArray(p.entries) ? p.entries.filter(e => e && e.url) : [];
  }

  let _mediaIndex = 0;

  function renderMediaItem() {
    const box = qs('#media-window');
    if (!box) return;
    const items = mediaItems();
    if (!items.length) {
      box.innerHTML = '<div class="media-empty">לא הועלו מודעות</div>';
      return;
    }
    if (_mediaIndex >= items.length) _mediaIndex = 0;
    const item = items[_mediaIndex];
    const fit = (state.mediaPlaylist?.fit === 'cover') ? 'cover' : 'contain';

    if (item.kind === 'pdf') {
      // Chrome מרנדר PDF מוטמע; הפרמטרים מסתירים את סרגלי הכלים בקיוסק
      box.innerHTML =
        `<iframe class="media-pdf" src="${item.url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit" title="מודעה"></iframe>`;
    } else {
      box.innerHTML =
        `<img class="media-img" style="object-fit:${fit}" src="${item.url}" alt="מודעה">`;
    }
  }

  function startMediaRotation() {
    clearInterval(_mediaTimer);
    if (!qs('#media-window')) return;
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
  async function checkForUpdates() {
    // בתוך התצוגה המקדימה של הניהול: ריענון היה מוחק שינויי עיצוב שטרם נשמרו
    if (_previewMode) return;
    try {
      const bundle = await fetchBundle();
      if (_version == null) { _version = bundle.version; return; }
      if (bundle.version !== _version) {
        _version = bundle.version;
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
        for (const k of ['preset', 'theme', 'style', 'layout', 'font', 'accent', 'backgroundImage']) {
          if (typeof incoming[k] === 'string') design[k] = incoming[k];
        }
        for (const k of ['backgroundOverlay', 'scale']) {
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
