// קטלוג העיצוב של ShulBoard — משותף לממשק הניהול ולאשף ההקמה.
// כל "מראה" (preset) הוא צירוף מוכן של ערכת צבע, סגנון, פריסה וגופן,
// כך שגבאי בוחר כרטיס אחד ומקבל צג גמור. הכוונון העדין נשאר זמין למי שרוצה.

window.SB_PRESETS = (() => {
  // ---------- ערכות צבע (data-theme) ----------
  // swatch משמש לציור הכרטיסים בגלריה; הערכים האמיתיים יושבים ב-css/board.css.
  const THEMES = [
    { id: 'stone',     name: 'אבן ירושלמית', swatch: { bg: '#8a7550', card: 'rgba(30,18,6,.55)', text: '#fff8ec', accent: '#ffd27a' } },
    { id: 'dark',      name: 'כהה קלאסי',    swatch: { bg: '#0e1320', card: 'rgba(255,255,255,.06)', text: '#f5f5f5', accent: '#d4af37' } },
    { id: 'midnight',  name: 'חצות',          swatch: { bg: '#070b18', card: 'rgba(255,255,255,.05)', text: '#eef2ff', accent: '#f2c94c' } },
    { id: 'blue',      name: 'כחול עמוק',     swatch: { bg: '#0a192f', card: 'rgba(255,255,255,.06)', text: '#e6f1ff', accent: '#64ffda' } },
    { id: 'emerald',   name: 'ירוק אזמרגד',   swatch: { bg: '#062b22', card: 'rgba(255,255,255,.06)', text: '#eefbf5', accent: '#e9c46a' } },
    { id: 'burgundy',  name: 'בורדו',          swatch: { bg: '#3a0d14', card: 'rgba(0,0,0,.28)', text: '#fff3f0', accent: '#f4c542' } },
    { id: 'wood',      name: 'עץ',             swatch: { bg: '#4b3017', card: 'rgba(0,0,0,.4)', text: '#fdf5e6', accent: '#ffd700' } },
    { id: 'carved',    name: 'עץ מגולף',       swatch: { bg: '#2d1a0a', card: 'rgba(0,0,0,.5)', text: '#f4e4c1', accent: '#ffcf5b' } },
    { id: 'slate',     name: 'אפור מודרני',    swatch: { bg: '#1f2430', card: 'rgba(255,255,255,.07)', text: '#f1f3f8', accent: '#7dd3fc' } },
    { id: 'parchment', name: 'קלף עתיק',       swatch: { bg: '#efe0c0', card: 'rgba(60,30,10,.09)', text: '#3a2511', accent: '#8b0000' } },
    { id: 'marble',    name: 'שיש',            swatch: { bg: '#e8e8e8', card: 'rgba(255,255,255,.8)', text: '#2f4f4f', accent: '#8b0000' } },
    { id: 'sand',      name: 'חול',            swatch: { bg: '#f3e9d6', card: 'rgba(120,80,30,.08)', text: '#3f2d18', accent: '#a0561f' } },
    { id: 'sky',       name: 'תכלת',           swatch: { bg: '#e9f3fb', card: 'rgba(255,255,255,.75)', text: '#12314a', accent: '#1b6ca8' } },
    { id: 'light',     name: 'בהיר ונקי',      swatch: { bg: '#f5f5f5', card: 'rgba(0,0,0,.04)', text: '#1a2140', accent: '#b8860b' } },
    { id: 'royal',     name: 'סגול מלכותי',    swatch: { bg: '#1d1033', card: 'rgba(255,255,255,.07)', text: '#f3eeff', accent: '#f0c75e' } },
    { id: 'ocean',     name: 'ים',             swatch: { bg: '#062a3a', card: 'rgba(255,255,255,.07)', text: '#e8f6fb', accent: '#ffd166' } },
    { id: 'charcoal',  name: 'פחם',            swatch: { bg: '#111214', card: 'rgba(255,255,255,.06)', text: '#fafafa', accent: '#ffffff' } },
    { id: 'olive',     name: 'זית',            swatch: { bg: '#eef0e3', card: 'rgba(60,80,30,.08)', text: '#24301a', accent: '#5c7a2a' } },
    { id: 'sunset',    name: 'שקיעה',          swatch: { bg: '#2b1620', card: 'rgba(0,0,0,.3)', text: '#fff1e6', accent: '#ff9f43' } },
  ];

  // ---------- סגנון האלמנטים (data-style) ----------
  const STYLES = [
    { id: 'traditional', name: 'מסורתי מפואר', desc: 'עיטורים, כתרים ומסגרת מגולפת' },
    { id: 'classic',     name: 'קלאסי',        desc: 'כרטיסים עם מסגרת עדינה' },
    { id: 'modern',      name: 'מודרני',       desc: 'פינות עגולות וצל רך' },
    { id: 'minimalist',  name: 'מינימליסטי',   desc: 'בלי רקעים, רק קו מודגש' },
    { id: 'ornate',      name: 'מעוטר',        desc: 'מסגרת כפולה וכותרות במרכז' },
    { id: 'glass',       name: 'זכוכית',       desc: 'לוחות שקופים עם טשטוש רקע' },
    { id: 'bold',        name: 'נועז',         desc: 'כותרות גדולות, פס עבה, ניגודיות גבוהה' },
    { id: 'elements',    name: 'אלמנטים מעוטרים', desc: 'מסגרות זהב מגולפות, כותרות על סרטי קלף, ואלמנטים גרפיים חופשיים' },
  ];

  // ---------- פריסת הצג הקלאסי (data-layout) ----------
  const LAYOUTS = [
    { id: '3col',          name: '3 עמודות',              desc: 'זמנים · תפילות · הנצחות' },
    { id: '2col',          name: 'תפילות במרכז',          desc: 'התפילות תופסות את רוב המסך' },
    { id: 'horizontal',    name: 'הנצחות ברוחב מלא',      desc: 'שתי עמודות למעלה, הנצחות למטה' },
    { id: 'sidebar-right', name: 'סרגל צד ימין',          desc: 'השעון והתאריך בצד' },
    { id: 'sidebar-left',  name: 'סרגל צד שמאל',          desc: 'השעון והתאריך בצד השני' },
    { id: 'stacked',       name: 'עמודה אחת',             desc: 'הלוחות זה מתחת לזה — למסך אנכי' },
  ];

  // ---------- גופנים (data-font) ----------
  const FONTS = [
    { id: 'classic', name: 'קלאסי',        desc: 'כותרות בכתב ספרים, טקסט נקי',  sample: "'Frank Ruhl Libre', serif" },
    { id: 'serif',   name: 'ספרותי',       desc: 'הכל בכתב ספרים',                sample: "'Frank Ruhl Libre', serif" },
    { id: 'david',   name: 'דוד',          desc: 'הגופן המוכר מהסידור',           sample: "'David Libre', serif" },
    { id: 'sans',    name: 'נקי',          desc: 'הכל בגופן מודרני וקריא',        sample: "'Assistant', sans-serif" },
    { id: 'heebo',   name: 'היבו',         desc: 'מודרני ועבה, קריא מרחוק',        sample: "'Heebo', sans-serif" },
    { id: 'rubik',   name: 'רוביק',        desc: 'עגול וידידותי',                 sample: "'Rubik', sans-serif" },
    { id: 'secular', name: 'סקולר',        desc: 'שלטים ולוחות — עבה ובולט',      sample: "'Secular One', sans-serif" },
    { id: 'alef',    name: 'אלף',          desc: 'קלאסי-מודרני, קריא מאוד',       sample: "'Alef', sans-serif" },
    { id: 'varela',  name: 'ורלה',         desc: 'רך ועגול',                      sample: "'Varela Round', sans-serif" },
  ];

  // ---------- מראות מוכנים ----------
  // בחירת מראה כותבת את השדות theme/style/layout/font/accent לתוך config.design.
  // accent ריק = צבע הערכה; ערך = דריסה.
  const DESIGN_PRESETS = [
    { id: 'jerusalem',   name: 'ירושלים',        desc: 'אבן ירושלמית עם עיטורים מסורתיים', theme: 'stone',     style: 'traditional', layout: '3col',       font: 'classic' },
    { id: 'palace',      name: 'ארמון',          desc: 'קלף, זהב ומסגרות מגולפות — עם אלמנטים גרפיים', theme: 'parchment', style: 'elements',    layout: '3col',       font: 'classic' },
    { id: 'classic',     name: 'קלאסי כהה',      desc: 'הלוח המוכר — כהה, זהב ונקי',        theme: 'dark',      style: 'classic',     layout: '3col',       font: 'classic' },
    { id: 'midnight',    name: 'חצות',           desc: 'כחול לילה עמוק וזהב חם',            theme: 'midnight',  style: 'modern',      layout: '3col',       font: 'classic' },
    { id: 'royal',       name: 'כחול מלכותי',    desc: 'כחול עמוק עם טורקיז',               theme: 'blue',      style: 'modern',      layout: '2col',       font: 'sans' },
    { id: 'parchment',   name: 'קלף עתיק',       desc: 'כמו דף מסידור ישן',                 theme: 'parchment', style: 'ornate',      layout: '3col',       font: 'serif' },
    { id: 'carved',      name: 'עץ מגולף',       desc: 'ארון קודש — עץ כהה ומסגרת זהב',     theme: 'carved',    style: 'traditional', layout: '3col',       font: 'classic' },
    { id: 'emerald',     name: 'אזמרגד',         desc: 'ירוק עמוק וזהב, חגיגי ורגוע',       theme: 'emerald',   style: 'classic',     layout: '3col',       font: 'classic' },
    { id: 'burgundy',    name: 'בורדו',          desc: 'אדום עמוק עם עיטורים',              theme: 'burgundy',  style: 'ornate',      layout: '3col',       font: 'david' },
    { id: 'marble',      name: 'שיש',            desc: 'בהיר ויוקרתי',                      theme: 'marble',    style: 'classic',     layout: '3col',       font: 'classic' },
    { id: 'sand',        name: 'חול',            desc: 'בהיר וחם, נעים לעין ביום',          theme: 'sand',      style: 'classic',     layout: 'horizontal', font: 'david' },
    { id: 'sky',         name: 'תכלת',           desc: 'בהיר ומודרני',                      theme: 'sky',       style: 'modern',      layout: '2col',       font: 'heebo' },
    { id: 'clean',       name: 'נקי',            desc: 'מינימלי, בלי מסגרות',               theme: 'light',     style: 'minimalist',  layout: '2col',       font: 'sans' },
    { id: 'slate',       name: 'אפור מודרני',    desc: 'אפור-כחול עם תכלת',                 theme: 'slate',     style: 'minimalist',  layout: 'sidebar-right', font: 'rubik' },
    { id: 'wood',        name: 'עץ חם',          desc: 'עץ חום וזהב',                       theme: 'wood',      style: 'classic',     layout: 'horizontal', font: 'classic' },
    { id: 'royal',       name: 'סגול מלכותי',    desc: 'סגול עמוק, זהב ולוחות זכוכית',     theme: 'royal',     style: 'glass',       layout: '3col',       font: 'heebo' },
    { id: 'ocean',       name: 'ים',             desc: 'כחול-ירוק עמוק עם צהוב חם',         theme: 'ocean',     style: 'modern',      layout: '2col',       font: 'rubik' },
    { id: 'charcoal',    name: 'פחם',            desc: 'שחור-לבן נועז, קריא מכל מרחק',      theme: 'charcoal',  style: 'bold',        layout: '3col',       font: 'secular' },
    { id: 'olive',       name: 'זית',            desc: 'בהיר וטבעי, ירוק זית',              theme: 'olive',     style: 'classic',     layout: 'horizontal', font: 'alef' },
    { id: 'sunset',      name: 'שקיעה',          desc: 'סגול-כתום חם עם זכוכית',            theme: 'sunset',    style: 'glass',       layout: '3col',       font: 'varela' },
    { id: 'stone-glass', name: 'אבן וזכוכית',    desc: 'אבן ירושלמית עם לוחות זכוכית',      theme: 'stone',     style: 'glass',       layout: '3col',       font: 'classic' },
  ];

  // ---------- תבניות למסכים (רשת 24×18) ----------
  // כל תבנית מחליפה את הקוביות של המסך הנוכחי בלחיצה אחת.
  const B = (type, x, y, w, h, extra = {}) => ({ type, x, y, w, h, ...extra });
  const SCREEN_TEMPLATES = [
    {
      id: 'ornate', name: 'לוח מעוטר', desc: 'סרט כותרת, שעון ולוגו בקלף, שני לוחות גדולים ואלמנטים גרפיים בפינות — הכי יפה בסגנון "אלמנטים מעוטרים"',
      blocks: [
        B('clock', 0, 0, 5, 3, { variant: 'digital', face: 'plain', seconds: false, showDate: true }),
        B('header', 5, 0, 14, 3), B('logo', 19, 0, 5, 3),
        B('tefillot', 12, 4, 11, 10), B('shiurim', 1, 4, 11, 10),
        B('decor', 0, 14, 5, 4, { asset: 'book', floating: true, anchor: 'bottom' }),
        B('decor', 19, 13, 5, 5, { asset: 'menorah', floating: true, anchor: 'bottom' }),
        B('mentions', 5, 15, 14, 1), B('announcements', 5, 16, 14, 2),
      ],
    },
    {
      id: 'classic3', name: 'קלאסי — 3 עמודות', desc: 'זמנים, תפילות והנצחות זו לצד זו',
      blocks: [
        B('header', 0, 0, 24, 3), B('zmanim', 16, 3, 8, 11), B('tefillot', 8, 3, 8, 11), B('memorial', 0, 3, 8, 11),
        B('mentions', 0, 14, 24, 1), B('announcements', 0, 15, 24, 2), B('upcoming', 0, 17, 24, 1),
      ],
    },
    {
      id: 'tefillot-center', name: 'תפילות במרכז', desc: 'התפילות גדולות, זמני היום בצד',
      blocks: [
        B('header', 0, 0, 24, 3), B('zmanim', 17, 3, 7, 12), B('tefillot', 5, 3, 12, 12), B('memorial', 0, 3, 5, 12),
        B('mentions', 0, 15, 24, 1), B('announcements', 0, 16, 24, 2),
      ],
    },
    {
      id: 'with-media', name: 'עם חלון מודעות', desc: 'מודעות משמאל, זמנים ותפילות מימין',
      blocks: [
        B('header', 0, 0, 24, 3), B('zmanim', 17, 3, 7, 12), B('tefillot', 10, 3, 7, 12), B('media', 0, 3, 10, 12),
        B('mentions', 0, 15, 24, 1), B('announcements', 0, 16, 24, 2),
      ],
    },
    {
      id: 'media-full', name: 'מסך מודעות', desc: 'כותרת למעלה, מודעה על כל המסך — טוב כמסך שני',
      blocks: [
        B('header', 0, 0, 24, 3), B('media', 0, 3, 24, 13), B('announcements', 0, 16, 24, 2),
      ],
    },
    {
      id: 'zmanim-tefillot', name: 'זמנים ותפילות בלבד', desc: 'שני לוחות גדולים, בלי הנצחות',
      blocks: [
        B('header', 0, 0, 24, 3), B('zmanim', 12, 3, 12, 13), B('tefillot', 0, 3, 12, 13),
        B('mentions', 0, 16, 24, 1), B('upcoming', 0, 17, 24, 1),
      ],
    },
    {
      id: 'with-logo', name: 'עם לוגו', desc: 'לוגו בפינה, שאר הלוח קלאסי',
      blocks: [
        B('logo', 0, 0, 4, 3), B('header', 4, 0, 20, 3), B('zmanim', 16, 3, 8, 11), B('tefillot', 8, 3, 8, 11), B('memorial', 0, 3, 8, 11),
        B('mentions', 0, 14, 24, 1), B('announcements', 0, 15, 24, 2), B('upcoming', 0, 17, 24, 1),
      ],
    },
    {
      id: 'vertical', name: 'מסך אנכי', desc: 'למסך מסובב (9:16) — הכל בעמודה אחת',
      aspect: '9:16',
      blocks: [
        B('header', 0, 0, 24, 2), B('zmanim', 0, 2, 24, 5), B('tefillot', 0, 7, 24, 6), B('memorial', 0, 13, 24, 3),
        B('announcements', 0, 16, 24, 1), B('upcoming', 0, 17, 24, 1),
      ],
    },
    {
      id: 'dashboard', name: 'לוח מחוונים', desc: 'שעון ותאריך גדולים, שבת, זמנים, תפילות, היום ולימוד יומי',
      blocks: [
        B('clock', 18, 0, 6, 4), B('date', 6, 0, 12, 4), B('logo', 0, 0, 6, 4),
        B('zmanim', 16, 4, 8, 10), B('tefillot', 8, 4, 8, 10), B('shabbat', 0, 4, 8, 5), B('learning', 0, 9, 8, 5),
        B('today', 0, 14, 24, 1), B('mentions', 0, 15, 24, 1), B('announcements', 0, 16, 24, 2),
      ],
    },
    {
      id: 'shabbat-board', name: 'לוח שבת', desc: 'שבת במרכז: הדלקת נרות, צאת השבת, פרשה, תפילות',
      blocks: [
        B('header', 0, 0, 24, 3), B('shabbat', 8, 3, 8, 12), B('tefillot', 16, 3, 8, 12), B('zmanim', 0, 3, 8, 12),
        B('mentions', 0, 15, 24, 1), B('announcements', 0, 16, 24, 2),
      ],
    },
    {
      id: 'community', name: 'לוח קהילה', desc: 'הקדשות וברכות, שיעורים והודעות לצד הזמנים',
      blocks: [
        B('header', 0, 0, 24, 3), B('zmanim', 17, 3, 7, 12), B('tefillot', 10, 3, 7, 12),
        B('dedications', 0, 3, 10, 6), B('shiurim', 0, 9, 10, 6),
        B('mentions', 0, 15, 24, 1), B('announcements', 0, 16, 24, 2),
      ],
    },
    {
      id: 'learning-board', name: 'לוח לימוד', desc: 'לימוד יומי וטקסט מתחלף (הלכה יומית) לצד הזמנים',
      blocks: [
        B('header', 0, 0, 24, 3), B('zmanim', 17, 3, 7, 12), B('tefillot', 10, 3, 7, 12),
        B('learning', 0, 3, 10, 5), B('text', 0, 8, 10, 7),
        B('today', 0, 15, 24, 1), B('announcements', 0, 16, 24, 2),
      ],
    },
    {
      id: 'vertical-full', name: 'מסך אנכי מלא', desc: 'שעון, שבת, זמנים, תפילות והקדשות בעמודה — 9:16',
      aspect: '9:16',
      blocks: [
        B('clock', 0, 0, 24, 2), B('date', 0, 2, 24, 1), B('zmanim', 0, 3, 24, 5), B('tefillot', 0, 8, 24, 4),
        B('shabbat', 0, 12, 24, 2), B('dedications', 0, 14, 24, 2), B('announcements', 0, 16, 24, 1), B('today', 0, 17, 24, 1),
      ],
    },
    {
      id: 'memorial-focus', name: 'הנצחות מודגשות', desc: 'לוח הנצחות גדול בצד',
      blocks: [
        B('header', 0, 0, 24, 3), B('memorial', 14, 3, 10, 12), B('tefillot', 7, 3, 7, 12), B('zmanim', 0, 3, 7, 12),
        B('mentions', 0, 15, 24, 1), B('announcements', 0, 16, 24, 2),
      ],
    },
  ];

  // ---------- ערים נפוצות — לאשף ההקמה ----------
  const CITIES = [
    { name: 'ירושלים',    lat: 31.7683, lon: 35.2137, candle: 40 },
    { name: 'תל אביב',    lat: 32.0853, lon: 34.7818, candle: 18 },
    { name: 'חיפה',       lat: 32.7940, lon: 34.9896, candle: 30 },
    { name: 'בני ברק',    lat: 32.0809, lon: 34.8338, candle: 18 },
    { name: 'באר שבע',    lat: 31.2530, lon: 34.7915, candle: 18 },
    { name: 'פתח תקווה',  lat: 32.0871, lon: 34.8878, candle: 18 },
    { name: 'אשדוד',      lat: 31.8014, lon: 34.6435, candle: 18 },
    { name: 'נתניה',      lat: 32.3215, lon: 34.8532, candle: 18 },
    { name: 'מודיעין',    lat: 31.8969, lon: 35.0104, candle: 18 },
    { name: 'בית שמש',    lat: 31.7470, lon: 34.9880, candle: 18 },
    { name: 'צפת',        lat: 32.9646, lon: 35.4960, candle: 18 },
    { name: 'אילת',       lat: 29.5577, lon: 34.9519, candle: 18 },
  ];

  // ---------- קוביות המסך ----------
  // single = עוטפת אלמנט יחיד בדף ולכן פעם אחת למסך; השאר נבנות מחדש בכל ציור.
  const BLOCKS = [
    { type: 'header',        name: 'כותרת ושעון',     desc: 'שם בית הכנסת, תאריך, פרשה ושעון', single: true },
    { type: 'zmanim',        name: 'זמני היום',       desc: 'הזמנים ההלכתיים שסימנתם', single: true },
    { type: 'tefillot',      name: 'זמני תפילות',     desc: 'המניינים של היום, עם הדגשת הבא', single: true },
    { type: 'memorial',      name: 'לעילוי נשמת',     desc: 'לוח ההנצחות, יארצייט מודגש', single: true },
    { type: 'mentions',      name: 'הזכרות בתפילה',   desc: 'משיב הרוח, יעלה ויבוא, תחנון, הלל', single: true },
    { type: 'announcements', name: 'הודעות רצות',     desc: 'פס ההודעות', single: true },
    { type: 'upcoming',      name: 'אירוע קרוב',      desc: 'החג הקרוב וספירת ימים', single: true },
    { type: 'media',         name: 'חלון מודעות',     desc: 'תמונות ו-PDF בסבב' },
    { type: 'logo',          name: 'לוגו',            desc: 'הלוגו שבחרתם' },
    { type: 'clock',         name: 'שעון גדול',       desc: 'דיגיטלי (רגיל, דק, לד, קלפים) או אנלוגי (שנתות, ספרות, רומי, עברי, מינימלי, מודרני)' },
    { type: 'date',          name: 'תאריך גדול',      desc: 'תאריך עברי, לועזי ופרשה' },
    { type: 'shabbat',       name: 'לוח שבת',         desc: 'הדלקת נרות, צאת השבת, פרשה' },
    { type: 'today',         name: 'היום',            desc: 'חגים, ראש חודש, צום, שבת מברכים ומולד' },
    { type: 'learning',      name: 'לימוד יומי',      desc: 'דף היומי, משנה יומית, רמב״ם ועוד' },
    { type: 'dedications',   name: 'הקדשות וברכות',   desc: 'לעילוי נשמת, לרפואה, מזל טוב — בסבב' },
    { type: 'shiurim',       name: 'שיעורים',         desc: 'השיעורים של היום והשבוע' },
    { type: 'text',          name: 'טקסט מתחלף',      desc: 'הלכה יומית, פסוק, דבר תורה' },
    { type: 'omer',          name: 'ספירת העומר',     desc: 'הספירה בגדול, בימי הספירה' },
    { type: 'weather',       name: 'מזג אוויר',       desc: 'טמפרטורה ותחזית (Open-Meteo)' },
    { type: 'countdown',     name: 'התפילה הבאה',     desc: 'ספירה לאחור למניין הקרוב' },
    { type: 'decor',         name: 'אלמנט גרפי',      desc: 'מנורה, ספר, כתר, נרות, מסגרת, סרט — או תמונה שהעליתם; מונח בחופשיות' },
  ];

  // ---------- לימוד יומי (hebcal/learning) ----------
  const LEARNING = [
    { id: 'dafyomi',            name: 'דף היומי' },
    { id: 'mishnayomi',         name: 'משנה יומית' },
    { id: 'rambam1',            name: 'רמב״ם — פרק ליום' },
    { id: 'rambam3',            name: 'רמב״ם — ג׳ פרקים' },
    { id: 'seferhamitzvot',     name: 'ספר המצוות' },
    { id: 'nachyomi',           name: 'נ״ך יומי' },
    { id: 'tanakhyomi',         name: 'תנ״ך יומי' },
    { id: 'psalms',             name: 'תהלים יומי' },
    { id: 'yerushalmi-vilna',   name: 'ירושלמי יומי' },
    { id: 'dafweekly',          name: 'דף השבוע' },
    { id: 'perekyomi',          name: 'משנה — פרק ליום' },
    { id: 'kitzurshulchanaruch', name: 'קיצור שולחן ערוך' },
    { id: 'arukhhashulchanyomi', name: 'ערוך השולחן יומי' },
    { id: 'chofetzchaim',       name: 'חפץ חיים' },
    { id: 'shemirathalashon',   name: 'שמירת הלשון' },
    { id: 'pirkeiavotsummer',   name: 'פרקי אבות (קיץ)' },
  ];

  // ---------- סוגי הקדשות ----------
  const DEDICATION_TYPES = [
    { id: 'neshama',   name: 'לעילוי נשמת',   icon: '🕯️' },
    { id: 'refua',     name: 'לרפואה שלמה',   icon: '💗' },
    { id: 'hatzlacha', name: 'להצלחה',        icon: '✨' },
    { id: 'zechut',    name: 'לזכות',         icon: '🙏' },
    { id: 'donation',  name: 'נתרם על ידי',   icon: '🎁' },
    { id: 'mazal',     name: 'מזל טוב',       icon: '🎉' },
    { id: 'welcome',   name: 'ברוכים הבאים',  icon: '🤝' },
  ];

  // ---------- זמני היום — מפתחות ושמות (משותף לניהול ולצג) ----------
  const ZMANIM = [
    ['alotHaShachar',    'עלות השחר'],
    ['misheyakir',       'משיכיר'],
    ['sunrise',          'הנץ החמה'],
    ['sofZmanShmaMGA',   'סוף זמן ק״ש (מג״א)'],
    ['sofZmanShma',      'סוף זמן ק״ש (גר״א)'],
    ['sofZmanTfillaMGA', 'סוף זמן תפילה (מג״א)'],
    ['sofZmanTfilla',    'סוף זמן תפילה (גר״א)'],
    ['chatzot',          'חצות היום'],
    ['minchaGedola',     'מנחה גדולה'],
    ['minchaKetana',     'מנחה קטנה'],
    ['plagHaMincha',     'פלג המנחה'],
    ['sunset',           'שקיעת החמה'],
    ['tzeit',            'צאת הכוכבים'],
    ['tzeit72',          'צאת הכוכבים (ר״ת)'],
    ['chatzotNight',     'חצות הלילה'],
  ];

  const byId = (list, id) => list.find(x => x.id === id) || null;

  // מפענח design שמור לערכי תצוגה מלאים — עם ברירות מחדל לכל שדה חסר.
  function resolveDesign(design) {
    const d = design || {};
    const preset = byId(DESIGN_PRESETS, d.preset) || DESIGN_PRESETS[0];
    return {
      preset: d.preset || preset.id,
      theme:  byId(THEMES, d.theme) ? d.theme : preset.theme,
      style:  byId(STYLES, d.style) ? d.style : preset.style,
      layout: byId(LAYOUTS, d.layout) ? d.layout : preset.layout,
      font:   byId(FONTS, d.font) ? d.font : preset.font,
      accent: /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : '',
      scale:  typeof d.scale === 'number' ? Math.min(1.5, Math.max(0.7, d.scale)) : 1,
      backgroundImage: typeof d.backgroundImage === 'string' ? d.backgroundImage.trim() : '',
      backgroundOverlay: typeof d.backgroundOverlay === 'number' ? d.backgroundOverlay : 0.45,
      backgroundFit: ['cover', 'contain', 'stretch', 'tile'].includes(d.backgroundFit) ? d.backgroundFit : 'cover',
      backgroundBlur: typeof d.backgroundBlur === 'number' ? Math.min(20, Math.max(0, d.backgroundBlur)) : 0,
      logo: d.logo && typeof d.logo === 'object' ? d.logo : { url: '' },
    };
  }

  // ---------- ימים ללא תחנון ----------
  // המזהים משמשים גם את הצג (הכללים עצמם ב-display.js) וגם את הניהול (רשימת הסימון).
  // כיבוי כלל = הצג יאמר תחנון באותו יום. ימים נוספים מוגדרים ב-config.tachanun.extra.
  const TACHANUN_RULES = [
    { id: 'rc',          name: 'ראש חודש' },
    { id: 'nisan',       name: 'כל חודש ניסן' },
    { id: 'pesachSheni', name: 'פסח שני — י״ד באייר' },
    { id: 'lagBaomer',   name: 'ל״ג בעומר — י״ח באייר' },
    { id: 'sivan',       name: 'א׳–י״ב בסיוון — שבועות וימי התשלומין' },
    { id: 'tishaBav',    name: 'תשעה באב' },
    { id: 'tuBav',       name: 'ט״ו באב' },
    { id: 'erevRH',      name: 'ערב ראש השנה — כ״ט באלול' },
    { id: 'tishrei',     name: 'מערב יום כיפור עד סוף תשרי' },
    { id: 'chanukah',    name: 'חנוכה' },
    { id: 'tuBishvat',   name: 'ט״ו בשבט' },
    { id: 'purim',       name: 'פורים ושושן פורים' },
    { id: 'purimKatan',  name: 'פורים קטן — י״ד וט״ו באדר א׳' },
    { id: 'shabbat',     name: 'שבת' },
  ];

  return { THEMES, STYLES, LAYOUTS, FONTS, DESIGN_PRESETS, SCREEN_TEMPLATES, CITIES, BLOCKS, LEARNING, DEDICATION_TYPES, ZMANIM, TACHANUN_RULES, byId, resolveDesign };
})();
