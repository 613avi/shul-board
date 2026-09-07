// יציבות לבתי כנסת פעילים.
//
// צג שכבר רץ בבית כנסת חייב להמשיך לעבוד גם אחרי שאנחנו משנים את מבנה הנתונים
// או את קוד הצג. שלושה מנגנונים, כולם בצד השרת כדי שגם צג עם קוד ישן יקבל נתונים שהוא מבין:
//
// 1. SCHEMA_VERSION + מיגרציות: config.schemaVersion אומר באיזה מבנה נשמרו הנתונים.
//    בכל קריאה (המנה הציבורית, ממשק הניהול) הנתונים מועלים בזיכרון לגרסה הנוכחית.
//    לדיסק הם נכתבים במבנה החדש רק כשהגבאי שומר שוב — "עד העריכה הבאה שלו".
// 2. normalize(): כל מקטע מושלם בברירות מחדל ומנוקה מערכים שבורים, כך ששדה חדש
//    שנוסף לקוד לעולם לא יהיה undefined בצג, וקובייה פגומה לא תפיל מסך שלם.
// 3. APP_VERSION: מצורף למנה הציבורית. הצג טוען את עצמו מחדש כשהוא רואה גרסת קוד
//    חדשה, כך שקוד ישן לעולם לא רץ מול נתונים חדשים. הנכסים מוגשים עם ?v= לפי אותה גרסה.
//
// כשמשנים את מבנה הנתונים: מעלים SCHEMA_VERSION ומוסיפים מיגרציה. כשמשנים את הצג
// (display.js / css): מעלים APP_VERSION.

import { DEFAULTS, SECTIONS, GRID } from './_shared.js';

export const SCHEMA_VERSION = 4;
export const APP_VERSION = '3.3.0';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

// משלים שדות חסרים או מהטיפוס הלא נכון מברירות המחדל, בלי למחוק שדות נוספים.
export function deepDefaults(data, defaults) {
  if (!isObj(data)) return clone(defaults);
  const out = { ...data };
  for (const [k, def] of Object.entries(defaults)) {
    const v = out[k];
    if (isObj(def)) out[k] = deepDefaults(v, def);
    else if (Array.isArray(def)) out[k] = Array.isArray(v) ? v : clone(def);
    else if (v === undefined || v === null || typeof v !== typeof def) out[k] = def;
  }
  return out;
}

// ---------- מיגרציות: גרסה → פונקציה שמעלה את כל מפת המקטעים לאותה גרסה ----------
const MIGRATIONS = {
  // 1 → 2: השיפוץ. בתי כנסת מלפני האשף לא אמורים לקבל אותו בכפייה.
  2: (data) => {
    if (isObj(data.config) && !isObj(data.config.setup)) {
      data.config.setup = { done: true, step: 1 };
    }
    return data;
  },
  // 2 → 3: הלוגו בכותרת הצג הקלאסי הוא תכונה חדשה. בית כנסת שבחר לוגו לפני כן
  // התכוון לקוביית לוגו במצב מסכים — לא מדליקים לו את הכותרת בלי שביקש.
  3: (data) => {
    if (isObj(data.config)) {
      const disp = isObj(data.config.display) ? data.config.display : {};
      if (disp.headerLogo === undefined) data.config.display = { ...disp, headerLogo: false };
    }
    return data;
  },
  // 3 → 4: תכונות הצג החדשות (שורת היום, צומות, הדגשת התפילה הבאה, תחנון/הלל)
  // כבויות לכל מי שנשמר לפניהן. הגבאי מדליק אותן ב"מה מוצג על הלוח".
  4: (data) => {
    if (isObj(data.config)) {
      const disp = isObj(data.config.display) ? data.config.display : {};
      data.config.display = {
        todayLine: false, fastTimes: false, nextHighlight: false, extendedMentions: false,
        ...disp,
      };
    }
    return data;
  },
};

// ---------- ניקוי לכל מקטע ----------
const KNOWN_BLOCKS = new Set([
  'header', 'zmanim', 'tefillot', 'memorial', 'mentions', 'announcements', 'upcoming', 'media', 'logo',
  'clock', 'date', 'shabbat', 'today', 'learning', 'dedications', 'shiurim', 'text', 'omer', 'weather', 'countdown',
]);
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const entriesArray = (data, key = 'entries') =>
  ({ ...(isObj(data) ? data : {}), [key]: Array.isArray(data?.[key]) ? data[key].filter(isObj) : [] });

const timeList = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(e => e !== '' && e != null);
// מנחה ערב שבת וערבית מוצ״ש נשמרו פעם כמספרים (דקות מהדלקת נרות / מצאת השבת).
// היום הן רשומות זמן רגילות; מספר ישן הופך לרשומה יחסית לאותו בסיס.
const offsetList = (v, base) => timeList(v)
  .map(e => (isObj(e) ? e : { type: 'relative', base, offset: num(e, 0), round: 0, days: [] }))
  .filter(e => e.type !== 'relative' || Number.isFinite(Number(e.offset)));

function normalizeRoom(room, i) {
  const wk = isObj(room.weekday) ? room.weekday : {};
  const sh = isObj(room.shabbat) ? room.shabbat : {};
  return {
    ...room,
    id: String(room.id || `room-${i + 1}`),
    name: String(room.name || `חדר ${i + 1}`),
    weekday: {
      shacharit: [...timeList(wk.shacharit), ...timeList(wk.shacharit2)],
      mincha: timeList(wk.mincha),
      arvit: timeList(wk.arvit),
    },
    shabbat: {
      kabbalat: timeList(sh.kabbalat),
      minchaErevOffsets: offsetList(sh.minchaErevOffsets ?? sh.minchaErevOffset, 'candle'),
      shacharit: timeList(sh.shacharit),
      mincha: timeList(sh.mincha),
      arvitMotzashOffsets: offsetList(sh.arvitMotzashOffsets ?? sh.arvitMotzashOffset, 'havdalah'),
    },
  };
}

function normalizeBlock(b) {
  if (!isObj(b) || !KNOWN_BLOCKS.has(b.type)) return null;
  const w = clamp(num(b.w, 4), 1, GRID.cols);
  const h = clamp(num(b.h, 3), 1, GRID.rows);
  const x = clamp(num(b.x, 0), 0, GRID.cols - w);
  const y = clamp(num(b.y, 0), 0, GRID.rows - h);
  const out = { ...b, id: String(b.id || `b-${b.type}`), type: b.type, x, y, w, h };
  if (typeof b.opacity === 'number') out.opacity = clamp(b.opacity, 0, 1);
  return out;
}

const NORMALIZERS = {
  config: (d) => {
    const c = deepDefaults(d, DEFAULTS.config);
    if (!isObj(c.zmanimOverrides)) c.zmanimOverrides = {};
    // אילו זמנים מוצגים — בדיוק כפי שנשמר. השלמה מברירת המחדל הייתה מוסיפה שורות לצג.
    if (isObj(d?.displayedZmanim)) c.displayedZmanim = { ...d.displayedZmanim };
    return c;
  },
  rooms: (d) => ({
    ...(isObj(d) ? d : {}),
    rooms: (Array.isArray(d?.rooms) ? d.rooms : []).filter(isObj).map(normalizeRoom),
  }),
  memorial: (d) => entriesArray(d),
  announcements: (d) => entriesArray(d),
  'special-times': (d) => entriesArray(d),
  'zmanim-calendar': (d) => ({ ...(isObj(d) ? d : {}), entries: isObj(d?.entries) ? d.entries : {} }),
  dedications: (d) => entriesArray(d),
  shiurim: (d) => {
    const s = entriesArray(d);
    s.entries = s.entries.map(e => ({
      ...e,
      days: Array.isArray(e.days) ? e.days.map(Number).filter(n => n >= 0 && n <= 6) : [],
    }));
    return s;
  },
  texts: (d) => entriesArray(d),
  'media-playlist': (d) => {
    const p = deepDefaults(d, DEFAULTS['media-playlist']);
    p.entries = p.entries.filter(e => isObj(e) && typeof e.url === 'string');
    p.fit = p.fit === 'cover' ? 'cover' : 'contain';
    p.seconds = clamp(num(p.seconds, 12), 3, 600);
    return p;
  },
  screens: (d) => {
    const s = deepDefaults(d, DEFAULTS.screens);
    s.enabled = !!s.enabled;
    s.screens = s.screens
      .filter(sc => isObj(sc) && Array.isArray(sc.blocks))
      .map((sc, i) => ({
        ...sc,
        id: String(sc.id || `s-${i + 1}`),
        name: String(sc.name || `מסך ${i + 1}`),
        seconds: clamp(num(sc.seconds, 20), 3, 600),
        blocks: sc.blocks.map(normalizeBlock).filter(Boolean),
      }));
    if (!s.screens.length) s.screens = clone(DEFAULTS.screens.screens);
    return s;
  },
};

// מנקה מקטע אחד. אם משהו בכל זאת נשבר — ברירת המחדל עדיפה על צג שחור.
export function normalize(section, data) {
  try {
    return NORMALIZERS[section] ? NORMALIZERS[section](data) : data;
  } catch {
    return clone(DEFAULTS[section] ?? {});
  }
}

// מעלה מפת מקטעים שלמה (כפי שנקראה מהמסד) לגרסה הנוכחית, בזיכרון בלבד.
export function upgradeAll(data) {
  let d = { ...data };
  const from = Number(d.config?.schemaVersion) || 1;
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) {
      try { d = step(d) || d; } catch { /* מיגרציה שנכשלה לא מפילה את הצג */ }
    }
  }
  for (const section of SECTIONS) {
    d[section] = normalize(section, d[section] === undefined ? DEFAULTS[section] : d[section]);
  }
  d.config.schemaVersion = SCHEMA_VERSION;
  return d;
}

// לפני כתיבה: מנקה וחותם גרסה, כך שמה שנשמר תמיד במבנה הנוכחי.
export function prepareForSave(section, data) {
  const out = normalize(section, data);
  if (section === 'config') out.schemaVersion = SCHEMA_VERSION;
  return out;
}
