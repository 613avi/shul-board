// ממשק ניהול לגבאים — עורך עותק מקומי ושומר דרך Pages Functions (js/api.js).

(() => {
  const HEB_MONTHS = ['ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר','אדר א׳','אדר ב׳'];

  const DEFAULT_CONFIG = {
    synagogueName: 'בית הכנסת',
    location: { address: '', latitude: 31.778, longitude: 35.235, timezone: 'Asia/Jerusalem', candleLightingMinutes: 18 },
    displayedZmanim: {
      alotHaShachar: true, misheyakir: false, sunrise: true,
      sofZmanShmaMGA: true, sofZmanShma: true,
      sofZmanTfillaMGA: true, sofZmanTfilla: true,
      chatzot: true, minchaGedola: true, minchaKetana: false,
      plagHaMincha: false, sunset: true, tzeit: true,
    },
    zmanimOverrides: {},
    theme: { accent: '#d4af37', background: '#0e1320' },
    design: { preset: 'jerusalem', theme: 'stone', layout: '3col', style: 'traditional', font: 'classic' },
    rotation: { enabled: false, intervalSeconds: 20 },
    setup: { done: false, step: 1 },
  };

  // ---- data normalization ----
  const asArr = (v) => Array.isArray(v) ? v.filter(x => x !== '' && x != null) : (v ? [v] : []);
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

  const state = {
    me: null,
    meta: {},
    media: [],
    community: [],
    data: {
      config: null,
      rooms: { rooms: [] },
      memorial: { entries: [] },
      announcements: { entries: [] },
      specialTimes: { entries: [] },
      zmanimCalendar: { entries: {} },
      mediaPlaylist: { seconds: 12, fit: 'contain', entries: [] },
      screens: null,
      dedications: { entries: [] },
      shiurim: { entries: [] },
      texts: { entries: [] },
    },
    dirty: false,
  };

  // ---------- Storage ----------
  // נשמרים רק לנוחות מילוי הטופס. הסיסמה לעולם לא נשמרת בדפדפן.
  const LS_SLUG = 'sb_slug_v1';
  const LS_GABBAI = 'sb_gabbai_v1';

  // ---------- Helpers ----------
  const qs = (s, p=document) => p.querySelector(s);
  const qsa = (s, p=document) => [...p.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue; // attrs like `disabled: cond ? 'disabled' : null` must be omitted, not stringified to "null"
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  };

  function status(msg, kind = '') {
    const bar = qs('#status-bar');
    bar.textContent = msg;
    bar.className = `status-bar show ${kind}`;
    clearTimeout(status._t);
    status._t = setTimeout(() => bar.classList.remove('show'), 4000);
  }

  function markDirty() {
    state.dirty = true;
    qs('#unsaved').classList.add('show');
  }
  function markClean() {
    state.dirty = false;
    qs('#unsaved').classList.remove('show');
  }

  // ---------- Load ----------
  async function loadData() {
    const res = await Api.loadAll();
    const d = res.data || {};
    state.data.config = d['config'] || DEFAULT_CONFIG;
    state.data.rooms = d['rooms'] || { rooms: [] };
    state.data.memorial = d['memorial'] || { entries: [] };
    state.data.announcements = d['announcements'] || { entries: [] };
    state.data.specialTimes = d['special-times'] || { entries: [] };
    state.data.zmanimCalendar = d['zmanim-calendar'] || { entries: {} };
    state.data.mediaPlaylist = d['media-playlist'] || { seconds: 12, fit: 'contain', entries: [] };
    state.data.screens = d['screens'] || null;
    state.data.dedications = { entries: Array.isArray(d.dedications?.entries) ? d.dedications.entries : [] };
    state.data.shiurim = { entries: Array.isArray(d.shiurim?.entries) ? d.shiurim.entries : [] };
    state.data.texts = { entries: Array.isArray(d.texts?.entries) ? d.texts.entries : [] };
    state.meta = res.meta || {};
    if (!Array.isArray(state.data.mediaPlaylist.entries)) state.data.mediaPlaylist.entries = [];
    if (!state.data.screens || !Array.isArray(state.data.screens.screens) || !state.data.screens.screens.length) {
      state.data.screens = defaultScreens();
    }
    // normalize
    if (!state.data.config.location) state.data.config.location = { ...DEFAULT_CONFIG.location };
    if (!state.data.config.displayedZmanim) state.data.config.displayedZmanim = { ...DEFAULT_CONFIG.displayedZmanim };
    if (!state.data.config.zmanimOverrides) state.data.config.zmanimOverrides = {};
    state.data.config.design = normalizeDesign(state.data.config.design);
    if (!state.data.config.display || typeof state.data.config.display !== 'object') state.data.config.display = { showUpcoming: true, headerLogo: false };
    // בתי כנסת שנפתחו לפני האשף לא מקבלים אותו בכפייה — רק הרשמות חדשות
    if (!state.data.config.setup || typeof state.data.config.setup !== 'object') {
      state.data.config.setup = { done: true, step: 1 };
    }
    if (!Array.isArray(state.data.rooms.rooms)) state.data.rooms.rooms = [];
    state.data.rooms.rooms = state.data.rooms.rooms.map(normalizeRoom);
    if (!Array.isArray(state.data.memorial.entries)) state.data.memorial.entries = [];
    if (!Array.isArray(state.data.announcements.entries)) state.data.announcements.entries = [];
    if (!Array.isArray(state.data.specialTimes.entries)) state.data.specialTimes.entries = [];
    migrateSpecial();
    if (!state.data.zmanimCalendar || typeof state.data.zmanimCalendar.entries !== 'object' || Array.isArray(state.data.zmanimCalendar.entries)) {
      state.data.zmanimCalendar = { entries: {} };
    }
  }

  // ---------- Login ----------
  async function handleLogin() {
    const slug = qs('#login-slug').value.trim();
    const gabbai = qs('#login-gabbai').value.trim();
    const password = qs('#login-password').value;
    const msg = qs('#login-msg');
    msg.textContent = '';

    if (!slug) { msg.textContent = 'יש להזין את כתובת בית הכנסת'; return; }
    if (!gabbai) { msg.textContent = 'יש להזין את שמכם'; return; }
    if (!password) { msg.textContent = 'יש להזין סיסמה'; return; }

    qs('#login-btn').disabled = true;
    msg.textContent = 'מתחבר...';
    try {
      await Api.login({ slug, gabbai, password });
      localStorage.setItem(LS_SLUG, slug);
      localStorage.setItem(LS_GABBAI, gabbai);
      await enterApp();
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      qs('#login-btn').disabled = false;
    }
  }

  // נכנסים לאפליקציה על בסיס עוגיית הסשן — משמש גם בהתחברות וגם בטעינה מחדש.
  async function enterApp() {
    const me = await Api.me();
    state.me = me;
    await loadData();
    qs('#login-view').style.display = 'none';
    renderIdentity();
    renderAll();
    if (typeof renderMedia === 'function') renderMedia().catch(() => {});
    loadCommunity();
    // הרשמה חדשה נכנסת ישר לאשף ההקמה; מי שסיים אותו (או שנפתח לפניו) — לניהול המלא
    if (state.data.config.setup && state.data.config.setup.done === false) showWizard();
    else showApp();
  }

  function showApp() {
    qs('#wizard-view').style.display = 'none';
    qs('#app-view').style.display = '';
    qs('#tour-btn').hidden = false;
    renderHome();
    startScreensPolling();
    scalePreview();
  }

  function renderIdentity() {
    const me = state.me;
    if (!me) return;
    const set = (sel, text) => { const e = qs(sel); if (e) e.textContent = text; };
    set('#hdr-shul', me.shul.name);
    set('#hdr-gabbai', me.gabbai);
    const disp = qs('#link-display');
    if (disp) disp.href = me.urls.display;
    const dispFull = qs('#link-display-full');
    if (dispFull) { dispFull.href = me.urls.display; dispFull.textContent = me.urls.display; }
    const exe = qs('#link-installer');
    if (exe) exe.href = me.urls.installer;
    const bat = qs('#link-bat');
    const batUrl = `/download/ShulBoard-${me.shul.slug}.bat`;
    if (bat) bat.href = batUrl;

    // כתובת הצג בכל המקומות שמציגים אותה
    const url = me.urls.display;
    set('#home-url', url);
    set('#link-display-text', url);
    set('#wz-display-url', url);
    set('#wz-shul-name', me.shul.name);
    for (const [sel, href] of [
      ['#home-open', url], ['#wz-open', url],
      ['#wz-link-installer', me.urls.installer], ['#wz-link-bat', batUrl],
    ]) { const a = qs(sel); if (a) a.href = href; }
    renderQr('#install-qr', url);
    renderQr('#wz-qr', url);

    // התצוגה המקדימה טוענת את הצג האמיתי של בית הכנסת המחובר.
    // נטען פעם אחת בלבד — טעינה חוזרת הייתה מאפסת שינויי עיצוב שטרם נשמרו.
    const pv = qs('#design-preview');
    if (pv && pv.dataset.loadedFor !== me.shul.slug) {
      pv.dataset.loadedFor = me.shul.slug;
      pv.src = me.urls.display;
      scalePreview();
    }
    const list = qs('#gabbaim-list');
    if (list) {
      list.innerHTML = '';
      (me.gabbaim || []).forEach(g => {
        list.appendChild(el('li', {}, `${g.name}${g.is_owner ? ' (פתח את החשבון)' : ''}`));
      });
    }
    for (const sel of ['#activity-list', '#home-activity']) {
      const act = qs(sel);
      if (!act) continue;
      act.innerHTML = '';
      const rows = me.recentActivity || [];
      if (!rows.length) act.appendChild(el('li', {}, 'עדיין אין פעילות.'));
      rows.slice(0, sel === '#home-activity' ? 6 : 15).forEach(a => {
        const when = new Date(a.created_at).toLocaleString('he-IL');
        act.appendChild(el('li', {}, `${when} · ${a.gabbai || '—'} · ${ACTION_LABELS[a.action] || a.action}${a.detail ? ' · ' + (SECTION_LABELS[a.detail] || a.detail) : ''}`));
      });
    }
  }

  const ACTION_LABELS = {
    register: 'פתיחת בית הכנסת', login: 'כניסה', 'login-failed': 'ניסיון כניסה שנכשל',
    save: 'שמירה', upload: 'העלאת קובץ', delete: 'מחיקה',
  };
  const SECTION_LABELS = {
    config: 'הגדרות ומראה', rooms: 'זמני תפילות', memorial: 'הנצחות', announcements: 'הודעות',
    'special-times': 'חגים ואירועים', 'zmanim-calendar': 'לוח זמנים שנתי',
    'media-playlist': 'חלון המודעות', screens: 'מסכים ופריסה',
  };

  // קוד QR של כתובת הצג — לפתיחה מהירה בטלוויזיה חכמה או בטאבלט
  function renderQr(sel, url) {
    const box = qs(sel);
    if (!box || !window.QRCode || box.dataset.for === url) return;
    box.dataset.for = url;
    box.innerHTML = '';
    try { new QRCode(box, { text: url, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.M }); }
    catch { box.remove(); }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); status('הכתובת הועתקה ✓', 'success'); }
    catch { status('לא ניתן להעתיק אוטומטית — סמנו והעתיקו ידנית', 'error'); }
  }

  async function logout() {
    try { await Api.logout(); } catch {}
    stopScreensPolling();
    localStorage.removeItem(LS_GABBAI);
    qs('#login-password').value = '';
    qs('#app-view').style.display = 'none';
    qs('#login-view').style.display = '';
  }

  // ---------- ניווט ----------
  // בלשוניות המראה והמסכים התצוגה המקדימה צמודה לצד; בשאר היא מוסתרת
  // (display:none לא טוען מחדש את ה-iframe, כך שהמצב שטרם נשמר נשאר).
  const PREVIEW_TABS = new Set(['design', 'screens']);

  function switchTab(name) {
    if (!qs(`.tab-content[data-tab="${name}"]`)) name = 'home';
    qsa('#admin-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    qsa('.tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === name));
    qs('#admin-shell').classList.toggle('with-preview', PREVIEW_TABS.has(name));
    if (name === 'home') { renderHome(); renderLiveScreens(true); }
    if (name === 'design') { renderDesign(); scalePreview(); pushDesignPreview(); }
    if (name === 'screens') { renderScreens(); scalePreview(); }
    window.scrollTo({ top: 0 });
  }

  function setupTabs() {
    qsa('#admin-nav button').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    qsa('[data-goto]').forEach(btn => btn.addEventListener('click', async () => {
      // מתוך האשף — מסיימים אותו קודם, כדי שהוא לא יקפוץ שוב בכניסה הבאה
      if (qs('#wizard-view').style.display !== 'none') await wizardFinish();
      switchTab(btn.dataset.goto);
    }));
    window.addEventListener('resize', scalePreview);
  }

  // ---------- General ----------
  function renderGeneral() {
    const c = state.data.config;
    qs('#g-name').value = c.synagogueName || '';
    qs('#g-address').value = c.location.address || '';
    qs('#g-lat').value = c.location.latitude ?? '';
    qs('#g-lon').value = c.location.longitude ?? '';
    qs('#g-tz').value = c.location.timezone || 'Asia/Jerusalem';
    qs('#g-candle').value = c.location.candleLightingMinutes ?? 18;
    renderCityChips('#g-cities', (city) => { applyCity(city); renderGeneral(); });
  }

  // ערים נפוצות — לחיצה אחת במקום קואורדינטות
  function renderCityChips(sel, onPick) {
    const row = qs(sel);
    if (!row) return;
    row.innerHTML = '';
    const loc = state.data.config.location || {};
    for (const c of SB_PRESETS.CITIES) {
      const active = Math.abs(Number(loc.latitude) - c.lat) < 0.01 && Math.abs(Number(loc.longitude) - c.lon) < 0.01;
      row.appendChild(el('button', {
        class: `chip${active ? ' active' : ''}`, type: 'button', onclick: () => onPick(c),
      }, c.name));
    }
  }
  function applyCity(c) {
    const loc = state.data.config.location;
    loc.latitude = c.lat;
    loc.longitude = c.lon;
    loc.timezone = 'Asia/Jerusalem';
    loc.candleLightingMinutes = c.candle;
    if (!String(loc.address || '').trim()) loc.address = c.name;
    markDirty();
  }
  function bindGeneral() {
    const fields = [
      ['#g-name', (v) => state.data.config.synagogueName = v],
      ['#g-address', (v) => state.data.config.location.address = v],
      ['#g-lat', (v) => state.data.config.location.latitude = parseFloat(v) || 0],
      ['#g-lon', (v) => state.data.config.location.longitude = parseFloat(v) || 0],
      ['#g-tz', (v) => state.data.config.location.timezone = v],
      ['#g-candle', (v) => state.data.config.location.candleLightingMinutes = parseInt(v, 10) || 18],
    ];
    for (const [sel, setter] of fields) {
      qs(sel).addEventListener('input', (e) => { setter(e.target.value); markDirty(); });
    }
    qs('#g-geocode').addEventListener('click', () => geocodeAddress('#g-address', '#g-geocode-status').then(ok => { if (ok) renderGeneral(); }));
  }

  // איתור כתובת (OpenStreetMap). מחזיר true אם נמצא ועודכן המיקום.
  async function geocodeAddress(inputSel, statusSel) {
    const address = qs(inputSel).value.trim();
    const st = qs(statusSel);
    if (!address) { st.textContent = 'הזינו כתובת'; return false; }
    st.textContent = 'מחפש...';
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'he' } });
      const data = await res.json();
      if (!data.length) { st.textContent = 'לא נמצא — נסו לבחור עיר מהרשימה'; return false; }
      const { lat, lon, display_name } = data[0];
      const loc = state.data.config.location;
      loc.address = address;
      loc.latitude = parseFloat(lat);
      loc.longitude = parseFloat(lon);
      if (!loc.timezone) loc.timezone = 'Asia/Jerusalem';
      st.textContent = `נמצא: ${display_name}`;
      markDirty();
      return true;
    } catch (e) {
      st.textContent = `שגיאה: ${e.message}`;
      return false;
    }
  }

  // ================= הקדשות וברכות =================
  const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  function cardHead(title, onDelete) {
    return el('div', { class: 'head' }, el('strong', {}, title),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: onDelete }, 'מחיקה'));
  }
  const inputFor = (obj, key, type = 'text', placeholder = '', onInput) => {
    const i = el('input', { type, placeholder });
    i.value = obj[key] ?? '';
    i.addEventListener('input', () => { obj[key] = i.value; markDirty(); if (onInput) onInput(); });
    return i;
  };
  const fieldOf = (label, input) => el('div', { class: 'field' }, el('label', {}, label), input);

  function renderDedications() {
    const host = qs('#ded-list');
    if (!host) return;
    host.innerHTML = '';
    const list = state.data.dedications.entries;
    if (!list.length) { host.appendChild(el('div', { class: 'empty-state' }, 'אין הקדשות — הוסיפו "לעילוי נשמת", "לרפואה" או "מזל טוב".')); return; }
    list.forEach((d) => {
      const card = el('div', { class: 'entry-card' });
      const title = el('strong', {}, d.text || '(ריק)');
      card.appendChild(el('div', { class: 'head' }, title,
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => {
          state.data.dedications.entries = list.filter(x => x !== d); markDirty(); renderDedications();
        } }, 'מחיקה')));
      const chips = el('div', { class: 'type-chips' });
      for (const t of P.DEDICATION_TYPES) {
        chips.appendChild(el('button', { class: `chip${d.type === t.id ? ' active' : ''}`, type: 'button',
          onclick: () => { d.type = t.id; markDirty(); renderDedications(); } }, `${t.icon} ${t.name}`));
      }
      card.appendChild(fieldOf('סוג', chips));
      card.appendChild(fieldOf('הטקסט (למשל: ר׳ יעקב בן משה ז״ל / דוד ושרה כהן להולדת הבת)',
        inputFor(d, 'text', 'text', '', () => { title.textContent = d.text || '(ריק)'; })));
      card.appendChild(el('div', { class: 'row-3' },
        fieldOf('מאת / הערה (רשות)', inputFor(d, 'from', 'text', 'לדוגמה: נתרם ע״י משפחת לוי')),
        fieldOf('מתאריך (רשות)', inputFor(d, 'startDate', 'date')),
        fieldOf('עד תאריך (רשות)', inputFor(d, 'endDate', 'date'))));
      host.appendChild(card);
    });
  }

  // ================= שיעורים =================
  function renderShiurim() {
    const host = qs('#shiur-list');
    if (!host) return;
    host.innerHTML = '';
    const list = state.data.shiurim.entries;
    if (!list.length) { host.appendChild(el('div', { class: 'empty-state' }, 'אין שיעורים — הוסיפו שיעור קבוע.')); return; }
    list.forEach((sh) => {
      const card = el('div', { class: 'entry-card' });
      const title = el('strong', {}, sh.title || '(ללא שם)');
      card.appendChild(el('div', { class: 'head' }, title,
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => {
          state.data.shiurim.entries = list.filter(x => x !== sh); markDirty(); renderShiurim();
        } }, 'מחיקה')));
      card.appendChild(el('div', { class: 'row' },
        fieldOf('נושא השיעור', inputFor(sh, 'title', 'text', 'לדוגמה: דף היומי', () => { title.textContent = sh.title || '(ללא שם)'; })),
        fieldOf('מגיד השיעור (רשות)', inputFor(sh, 'lecturer', 'text', 'הרב ...'))));
      const time = inputFor(sh, 'time', 'time');
      const days = el('div', { class: 'day-chips' });
      const active = Array.isArray(sh.days) ? sh.days : [];
      DAY_NAMES.forEach((name, i) => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = active.includes(i);
        const lab = el('label', { class: cb.checked ? 'on' : '' }, cb, name);
        cb.addEventListener('change', () => {
          const cur = Array.isArray(sh.days) ? [...sh.days] : [];
          sh.days = cb.checked ? [...new Set([...cur, i])].sort() : cur.filter(x => x !== i);
          lab.classList.toggle('on', cb.checked); markDirty();
        });
        days.appendChild(lab);
      });
      card.appendChild(el('div', { class: 'row-3' },
        fieldOf('שעה', time),
        fieldOf('ימים (ריק = כל יום)', days),
        fieldOf('מקום (רשות)', inputFor(sh, 'place', 'text', 'בית המדרש'))));
      host.appendChild(card);
    });
  }

  // ================= טקסטים מתחלפים =================
  function renderTexts() {
    const host = qs('#text-list');
    if (!host) return;
    host.innerHTML = '';
    const list = state.data.texts.entries;
    if (!list.length) { host.appendChild(el('div', { class: 'empty-state' }, 'אין טקסטים — הוסיפו הלכה יומית, פסוק או דבר תורה קצר.')); return; }
    list.forEach((t) => {
      const card = el('div', { class: 'entry-card' });
      const title = el('strong', {}, t.title || '(ללא כותרת)');
      card.appendChild(el('div', { class: 'head' }, title,
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => {
          state.data.texts.entries = list.filter(x => x !== t); markDirty(); renderTexts();
        } }, 'מחיקה')));
      card.appendChild(fieldOf('כותרת (רשות)', inputFor(t, 'title', 'text', 'לדוגמה: הלכה יומית', () => { title.textContent = t.title || '(ללא כותרת)'; })));
      const ta = el('textarea', { placeholder: 'הטקסט שיוצג על הצג' });
      ta.value = t.body || '';
      ta.addEventListener('input', () => { t.body = ta.value; markDirty(); });
      card.appendChild(fieldOf('תוכן', ta));
      host.appendChild(card);
    });
  }

  // ================= מראה הצג =================
  // הקטלוג (מראות, ערכות, סגנונות, גופנים) יושב ב-js/presets.js ומשותף לצג.

  const P = window.SB_PRESETS;
  const design = () => state.data.config.design;

  // resolveDesign משלים ברירות מחדל; preset נשמר ריק כשהגבאי כיוונן ידנית
  function normalizeDesign(d) {
    return { ...P.resolveDesign(d), preset: (d && typeof d.preset === 'string') ? d.preset : '' };
  }

  const presetMatches = (p, d) =>
    p.theme === d.theme && p.style === d.style && p.layout === d.layout && p.font === d.font;

  // כרטיס בגלריה: ציור סכמטי של הלוח בצבעי הערכה — בלי לטעון iframe לכל מראה
  function presetCard(p, active, onClick) {
    const t = P.byId(P.THEMES, p.theme) || P.THEMES[0];
    const thumb = el('div', { class: 'preset-thumb', 'data-layout': p.layout, 'data-style': p.style });
    thumb.style.setProperty('--p-bg', t.swatch.bg);
    thumb.style.setProperty('--p-card', t.swatch.card);
    thumb.style.setProperty('--p-accent', t.swatch.accent);
    thumb.style.setProperty('--p-text', t.swatch.text);
    thumb.innerHTML =
      '<div class="pt-head"><span class="pt-title"></span><span class="pt-clock"></span></div>' +
      '<div class="pt-cols"><div class="c1"><i></i><i></i><i></i></div>' +
      '<div class="c2"><i></i><i></i><i></i><i></i></div><div class="c3"><i></i><i></i></div></div>';
    return el('button', { class: `preset-card${active ? ' active' : ''}`, type: 'button', onclick: onClick },
      thumb, el('div', { class: 'preset-name' }, p.name), el('div', { class: 'preset-desc' }, p.desc));
  }

  function renderPresetGrid(sel, onPick) {
    const grid = qs(sel);
    if (!grid) return;
    grid.innerHTML = '';
    const d = design();
    for (const p of P.DESIGN_PRESETS) {
      const active = d.preset ? d.preset === p.id : presetMatches(p, d);
      grid.appendChild(presetCard(p, active, () => onPick(p)));
    }
  }

  function applyPreset(p) {
    const d = design();
    d.preset = p.id;
    d.theme = p.theme; d.style = p.style; d.layout = p.layout; d.font = p.font;
    d.accent = '';
    markDirty();
    renderDesign();
    pushDesignPreview();
  }

  // כוונון ידני מנתק את המראה מהכרטיס — הכרטיס יסומן שוב רק אם הערכים חוזרים להתאים
  function tune(fn) {
    fn(design());
    design().preset = '';
    markDirty();
    renderDesign();
    pushDesignPreview();
  }

  function fillSelect(sel, list, value) {
    const s = qs(sel);
    if (!s) return;
    s.innerHTML = '';
    for (const item of list) s.appendChild(el('option', { value: item.id }, item.desc ? `${item.name} — ${item.desc}` : item.name));
    s.value = value;
  }

  function renderDesign() {
    const d = design();
    if (!qs('#preset-grid')) return;
    renderPresetGrid('#preset-grid', applyPreset);

    renderThemeRow('#d-theme-row');
    fillSelect('#d-style', P.STYLES, d.style);
    fillSelect('#d-layout', P.LAYOUTS, d.layout);
    renderFontRow('#d-font-row');

    const themeAccent = (P.byId(P.THEMES, d.theme) || P.THEMES[0]).swatch.accent;
    qs('#d-accent').value = d.accent || themeAccent;
    qs('#d-accent-reset').disabled = !d.accent;

    const pct = Math.round((d.scale || 1) * 100);
    qs('#d-scale').value = pct;
    qs('#d-scale-val').textContent = pct + '%';

    qs('#d-bg-image').value = d.backgroundImage || '';
    const ov = Math.round((d.backgroundOverlay ?? 0.45) * 100);
    qs('#d-bg-overlay').value = ov;
    qs('#d-bg-overlay-val').textContent = ov + '%';
    qs('#d-bg-fit').value = d.backgroundFit || 'cover';
    qs('#d-bg-blur').value = d.backgroundBlur || 0;
    qs('#d-bg-blur-val').textContent = String(d.backgroundBlur || 0);

    const up = qs('#d-show-upcoming');
    if (up) up.checked = state.data.config.display?.showUpcoming !== false;
    const hl = qs('#d-header-logo');
    if (hl) hl.checked = !!state.data.config.display?.headerLogo;
    renderFeatures();

    renderBgGrid();
    renderLogoPicker();
  }

  // ---------- "מה מוצג על הלוח": תכונות הצג ----------
  const FEATURE_FLAGS = ['todayLine', 'fastTimes', 'nextHighlight', 'hidePast', 'extendedMentions'];
  const disp = () => {
    const c = state.data.config;
    if (!c.display || typeof c.display !== 'object') c.display = {};
    return c.display;
  };

  function renderFeatures() {
    if (!qs('#features-panel')) return;
    const d = disp();
    for (const k of FEATURE_FLAGS) { const cb = qs(`#f-${k}`); if (cb) cb.checked = !!d[k]; }
    const w = qs('#f-weather'); if (w) w.checked = !!(d.weather && d.weather.enabled);
    const chips = qs('#f-learning');
    if (chips) {
      const sel = Array.isArray(d.learning) ? d.learning : ['dafyomi'];
      chips.innerHTML = '';
      for (const l of P.LEARNING) {
        chips.appendChild(el('button', {
          class: `chip${sel.includes(l.id) ? ' active' : ''}`, type: 'button',
          onclick: () => {
            const cur = Array.isArray(d.learning) ? [...d.learning] : ['dafyomi'];
            d.learning = cur.includes(l.id) ? cur.filter(x => x !== l.id) : [...cur, l.id];
            markDirty(); renderFeatures(); pushDesignPreview();
          },
        }, l.name));
      }
    }
    const sl = d.sleep || {};
    if (qs('#f-sleep')) qs('#f-sleep').checked = !!sl.enabled;
    if (qs('#f-sleep-from')) qs('#f-sleep-from').value = sl.from || '23:30';
    if (qs('#f-sleep-to')) qs('#f-sleep-to').value = sl.to || '05:00';
    if (qs('#f-textsSeconds')) qs('#f-textsSeconds').value = d.textsSeconds || 15;
  }

  function bindFeatures() {
    if (!qs('#features-panel')) return;
    for (const k of FEATURE_FLAGS) {
      const cb = qs(`#f-${k}`);
      if (cb) cb.addEventListener('change', () => { disp()[k] = cb.checked; markDirty(); pushDesignPreview(); });
    }
    qs('#f-weather').addEventListener('change', (e) => { disp().weather = { ...(disp().weather || {}), enabled: e.target.checked }; markDirty(); pushDesignPreview(); });
    const sleepChanged = () => {
      disp().sleep = { enabled: qs('#f-sleep').checked, from: qs('#f-sleep-from').value || '23:30', to: qs('#f-sleep-to').value || '05:00' };
      markDirty(); pushDesignPreview();
    };
    for (const id of ['#f-sleep', '#f-sleep-from', '#f-sleep-to']) qs(id).addEventListener('change', sleepChanged);
    qs('#f-textsSeconds').addEventListener('input', (e) => { disp().textsSeconds = Math.max(4, parseInt(e.target.value, 10) || 15); markDirty(); pushDesignPreview(); });
  }

  // תמונות הרקע — מהקבצים שהועלו
  function renderBgGrid(sel = '#d-bg-grid', after = renderDesign) {
    const grid = qs(sel);
    if (!grid) return;
    const d = design();
    const pick = (url) => { d.backgroundImage = url; markDirty(); after(); pushDesignPreview(); };
    grid.innerHTML = '';
    grid.appendChild(el('button', {
      class: `bg-pick none${d.backgroundImage ? '' : ' active'}`, type: 'button', onclick: () => pick(''),
    }, 'בלי תמונה'));
    for (const m of state.media.filter(m => m.kind === 'image')) {
      const b = el('button', {
        class: `bg-pick${d.backgroundImage === m.url ? ' active' : ''}`, type: 'button', title: m.filename,
        onclick: () => pick(m.url),
      });
      b.style.backgroundImage = `url("${m.url}")`;
      grid.appendChild(b);
    }
  }

  // שורת ערכות צבע — משותפת לניהול ולאשף
  function renderThemeRow(sel, after) {
    const row = qs(sel);
    if (!row) return;
    const d = design();
    row.innerHTML = '';
    for (const t of P.THEMES) {
      const b = el('button', {
        class: `swatch${t.id === d.theme ? ' active' : ''}`, type: 'button', title: t.name,
        onclick: () => { tune(x => { x.theme = t.id; x.accent = ''; }); if (after) after(); },
      });
      b.style.setProperty('--s-bg', t.swatch.bg);
      b.style.setProperty('--s-accent', t.swatch.accent);
      row.appendChild(b);
    }
  }
  function renderFontRow(sel, after) {
    const fr = qs(sel);
    if (!fr) return;
    const d = design();
    fr.innerHTML = '';
    for (const f of P.FONTS) {
      const chip = el('button', {
        class: `chip${f.id === d.font ? ' active' : ''}`, type: 'button',
        onclick: () => { tune(x => { x.font = f.id; }); if (after) after(); },
      }, f.name, el('span', { class: 'sub' }, f.desc));
      chip.style.fontFamily = f.sample;
      fr.appendChild(chip);
    }
  }

  // העלאת קובץ ושימוש בו מיד (לוגו / רקע) — מהאשף, בלי לעבור דרך לשונית המדיה
  async function uploadAndUse(file, onUrl, label) {
    if (!file) return;
    try {
      status(`מעלה את ${file.name}…`);
      const res = await Api.uploadMedia(file);
      await renderMedia().catch(() => {});
      onUrl(res.item.url);
      status(`${label} עודכן ✓`, 'success');
    } catch (e) { status(`${file.name}: ${e.message}`, 'error'); }
  }

  // ================= תבניות מהקהילה =================
  // מראה + פריסה שבית כנסת אחר פרסם. מוחל על העיצוב וה"מסכים"; הלוגו והתוכן נשארים.

  const isCustomLook = () => {
    const d = design();
    const sc = state.data.screens || {};
    return !d.preset || !!d.accent || !!d.backgroundImage || !!sc.enabled;
  };

  async function loadCommunity() {
    try {
      const res = await Api.listTemplates();
      state.community = res.items || [];
    } catch { state.community = []; }
    renderCommunity('#community-grid');
    renderCommunity('#wz-community');
    renderMyTemplates();
  }

  function communityCard(item, onPick) {
    const t = P.byId(P.THEMES, item.design?.theme) || P.THEMES[0];
    const fake = { name: item.name, desc: item.description || '', theme: t.id,
      style: item.design?.style || 'classic', layout: item.design?.layout || '3col' };
    const card = presetCard(fake, false, onPick);
    if (item.screens?.enabled) card.appendChild(el('span', { class: 'preset-badge' }, 'מסכים'));
    card.appendChild(el('div', { class: 'preset-meta' },
      `${item.author || 'בית כנסת'}${item.uses ? ` · ${item.uses} בשימוש` : ''}`));
    return card;
  }

  function renderCommunity(sel) {
    const grid = qs(sel);
    if (!grid) return;
    const items = state.community || [];
    grid.innerHTML = '';
    const wrap = qs('#wz-community-wrap');
    if (sel === '#wz-community' && wrap) wrap.hidden = !items.length;
    if (!items.length) {
      grid.appendChild(el('div', { class: 'sc-hint' }, 'עדיין לא פורסמו תבניות. היו הראשונים — "שיתוף המראה שלכם" למטה.'));
      return;
    }
    for (const item of items) grid.appendChild(communityCard(item, () => applyCommunity(item)));
  }

  function applyCommunity(item) {
    const keepLogo = design().logo;
    state.data.config.design = { ...normalizeDesign(item.design || {}), logo: keepLogo || { url: '' } };
    if (item.screens && Array.isArray(item.screens.screens) && item.screens.screens.length) {
      state.data.screens = JSON.parse(JSON.stringify(item.screens));
      scActive = 0; scSelected = null;
    }
    if (item.display && typeof item.display === 'object') state.data.config.display = { ...item.display };
    markDirty();
    renderAll();
    if (qs('#wizard-view').style.display !== 'none') { wzFill3(); wzFill4(); }
    pushDesignPreview();
    pushScreensPreview();
    Api.useTemplate(item.id).catch(() => {});
    status(`הוחל המראה "${item.name}" — אפשר להמשיך להתאים`, 'success');
  }

  async function publishLook(nameSel, descSel, msgSel, btnSel) {
    const msg = qs(msgSel), btn = qs(btnSel);
    const name = qs(nameSel).value.trim();
    const description = descSel && qs(descSel) ? qs(descSel).value.trim() : '';
    msg.textContent = '';
    if (name.length < 2) { msg.textContent = 'תנו לתבנית שם'; return; }
    if (state.dirty) { msg.textContent = 'יש שינויים שלא נשמרו — לחצו "שמירה ופרסום" קודם, כדי שהתבנית תכלול אותם'; return; }
    btn.disabled = true;
    try {
      await Api.publishTemplate({ name, description });
      qs(nameSel).value = '';
      msg.textContent = 'התבנית פורסמה ✓ תודה! בתי כנסת אחרים יראו אותה ברשימה.';
      await loadCommunity();
    } catch (e) { msg.textContent = e.message; }
    finally { btn.disabled = false; }
  }

  function renderMyTemplates() {
    const box = qs('#my-templates');
    if (!box || !state.me) return;
    const mine = (state.community || []).filter(t => t.author === state.me.shul.name);
    box.innerHTML = '';
    if (!mine.length) return;
    box.appendChild(el('div', { class: 'desc' }, 'התבניות שפרסמתם:'));
    for (const t of mine) {
      box.appendChild(el('li', {}, el('span', {}, `${t.name}${t.uses ? ` · ${t.uses} בשימוש` : ''}`),
        el('button', { class: 'btn btn-ghost btn-sm btn-danger', type: 'button', onclick: async () => {
          if (!confirm(`להסיר את התבנית "${t.name}" מהקהילה?`)) return;
          try { await Api.deleteTemplate(t.id); await loadCommunity(); } catch (e) { status(e.message, 'error'); }
        } }, 'הסרה')));
    }
  }

  // ================= מדריך צף =================
  const TOUR_STEPS = [
    { tab: 'home', sel: '#home-checklist', title: 'לוח הבית', text: 'כאן רואים מה כבר הוגדר ומה עוד חסר. כל שורה מובילה למקום הנכון בלחיצה.' },
    { tab: 'design', sel: '#preset-grid', title: 'מראה מוכן', text: 'לחיצה על כרטיס מחליפה צבעים, סגנון, פריסה וגופן בבת אחת. התצוגה המקדימה בצד מתעדכנת מיד.' },
    { tab: 'design', sel: '#community-panel', title: 'תבניות מהקהילה', text: 'מראות שבתי כנסת אחרים בנו ופרסמו. לחיצה מעתיקה את המראה והפריסה; הלוגו והתוכן שלכם נשארים.' },
    { tab: 'design', sel: '#d-theme-row', title: 'כוונון עדין', text: 'ערכת צבע, גופן, צבע הדגשה וגודל טקסט. כך הצג שלכם נראה משלכם ולא כמו כולם.' },
    { tab: 'design', sel: '#d-bg-grid', title: 'רקע ולוגו', text: 'העלו תמונה של בית הכנסת או נוף כרקע, עם התאמה, החשכה וטשטוש לקריאות. הלוגו מופיע ליד שם בית הכנסת בכותרת.' },
    { tab: 'design', sel: '#features-panel', title: 'מה מוצג על הלוח', text: 'התכונות החכמות: שורת "היום" עם חגים ומולד, הדגשת התפילה הבאה, תחנון והלל, לימוד יומי, מזג אוויר ומצב שינה בלילה.' },
    { tab: 'design', sel: '#publish-panel', title: 'שיתוף המראה', text: 'יצרתם מראה יפה? פרסמו אותו כתבנית, ובתי כנסת אחרים יוכלו לבחור בו.' },
    { tab: 'screens', sel: '#sc-templates', title: 'פריסת המסך', text: 'תבניות לסידור הקוביות: עם חלון מודעות, עם לוגו, מסך אנכי. לחיצה מסדרת, ואחר כך אפשר לגרור.' },
    { tab: 'screens', sel: '#sc-canvas-wrap', title: 'עורך הקוביות', text: 'גוררים קובייה להזזה, מושכים את הריבוע הכחול לשינוי גודל. "+ מסך" יוצר מסך נוסף שיתחלף אוטומטית.' },
    { tab: 'dedications', sel: '#ded-list', title: 'הקדשות וברכות', text: 'לעילוי נשמת, לרפואה, מזל טוב — מוצגות בסבב על הצג. אפשר לתזמן לפי תאריכים.' },
    { tab: 'media', sel: '#media-file', title: 'קבצים ומודעות', text: 'תמונות ו-PDF להצגה בסבב בחלון המודעות, או לשימוש כרקע וכלוגו.' },
    { tab: 'announcements', sel: '#ann-table', title: 'הודעות לציבור', text: 'הודעה רצה בתחתית הצג, עם תאריכי התחלה וסיום כדי לתזמן מראש.' },
    { tab: 'installer', sel: '#link-installer', title: 'התקנה על המסך', text: 'קובץ שפותח את הצג במסך מלא בכל הדלקה של המחשב. או פשוט הכתובת בכל דפדפן.' },
    { tab: 'home', sel: '#save-all-btn', title: 'שמירה ופרסום', text: 'שום שינוי לא מגיע לצג עד שלוחצים כאן. אחרי השמירה הצג מתעדכן לבד תוך 3 דקות.' },
  ];
  let tourIdx = -1;
  const TOUR_KEY = () => `sb_tour_v1_${state.me?.shul?.slug || ''}`;

  function tourClearHighlight() {
    qsa('.tour-highlight').forEach(e => e.classList.remove('tour-highlight'));
  }

  function tourShow(i) {
    const step = TOUR_STEPS[i];
    if (!step) { tourEnd(); return; }
    tourIdx = i;
    switchTab(step.tab);
    tourClearHighlight();
    const target = qs(step.sel);
    if (target) {
      target.classList.add('tour-highlight');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    qs('#tour-count').textContent = `${i + 1} / ${TOUR_STEPS.length}`;
    qs('#tour-title').textContent = step.title;
    qs('#tour-text').textContent = step.text;
    qs('#tour-prev').disabled = i === 0;
    qs('#tour-next').textContent = i === TOUR_STEPS.length - 1 ? 'סיום ✓' : 'הבא ←';
    qs('#tour-card').hidden = false;
  }

  function tourStart() { tourShow(0); }

  function tourEnd() {
    tourIdx = -1;
    tourClearHighlight();
    qs('#tour-card').hidden = true;
    try { localStorage.setItem(TOUR_KEY(), '1'); } catch {}
  }

  function setupTour() {
    if (!qs('#tour-btn')) return;
    qs('#tour-btn').addEventListener('click', tourStart);
    qs('#tour-close').addEventListener('click', tourEnd);
    qs('#tour-prev').addEventListener('click', () => tourShow(tourIdx - 1));
    qs('#tour-next').addEventListener('click', () => tourShow(tourIdx + 1));
  }

  // מוצג לבד פעם אחת — בכניסה הראשונה לניהול המלא
  function maybeAutoTour() {
    let seen = true;
    try { seen = localStorage.getItem(TOUR_KEY()) === '1'; } catch {}
    if (!seen) setTimeout(tourStart, 600);
  }

  function bindDesign() {
    if (!qs('#preset-grid')) return;
    qs('#d-style').addEventListener('change', (e) => tune(x => { x.style = e.target.value; }));
    qs('#d-layout').addEventListener('change', (e) => tune(x => { x.layout = e.target.value; }));
    qs('#d-accent').addEventListener('input', (e) => {
      design().accent = e.target.value;
      qs('#d-accent-reset').disabled = false;
      markDirty(); pushDesignPreview();
    });
    qs('#d-accent-reset').addEventListener('click', () => {
      design().accent = '';
      markDirty(); renderDesign(); pushDesignPreview();
    });
    qs('#d-scale').addEventListener('input', (e) => {
      design().scale = parseInt(e.target.value, 10) / 100;
      qs('#d-scale-val').textContent = e.target.value + '%';
      markDirty(); pushDesignPreview();
    });
    qs('#d-bg-image').addEventListener('change', (e) => {
      design().backgroundImage = e.target.value.trim();
      markDirty(); renderBgGrid(); pushDesignPreview();
    });
    qs('#d-bg-overlay').addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10) || 0;
      design().backgroundOverlay = pct / 100;
      qs('#d-bg-overlay-val').textContent = pct + '%';
      markDirty(); pushDesignPreview();
    });
    qs('#d-bg-file').addEventListener('change', (e) => {
      uploadAndUse(e.target.files[0], (url) => {
        design().backgroundImage = url;
        markDirty(); renderBgGrid(); renderDesign(); pushDesignPreview();
      }, 'הרקע');
      e.target.value = '';
    });
    qs('#d-bg-fit').addEventListener('change', (e) => {
      design().backgroundFit = e.target.value;
      markDirty(); pushDesignPreview();
    });
    qs('#d-bg-blur').addEventListener('input', (e) => {
      design().backgroundBlur = parseInt(e.target.value, 10) || 0;
      qs('#d-bg-blur-val').textContent = e.target.value;
      markDirty(); pushDesignPreview();
    });
    const up = qs('#d-show-upcoming');
    if (up) up.addEventListener('change', () => {
      state.data.config.display = { ...(state.data.config.display || {}), showUpcoming: up.checked };
      markDirty(); pushDesignPreview();
    });
    const hl = qs('#d-header-logo');
    if (hl) hl.addEventListener('change', () => {
      state.data.config.display = { ...(state.data.config.display || {}), headerLogo: hl.checked };
      markDirty(); pushDesignPreview();
    });
    // כשהצג בתצוגה המקדימה נטען — דוחפים את המצב שטרם נשמר
    const pv = qs('#design-preview');
    if (pv) pv.addEventListener('load', () => { pushDesignPreview(); pushScreensPreview(); });
  }

  // דוחף את העיצוב לתצוגות המקדימות (בניהול ובאשף) בלי לשמור
  function pushDesignPreview() {
    for (const sel of ['#design-preview', '#wz-preview']) {
      const f = qs(sel);
      if (!f || !f.contentWindow || !f.dataset.loadedFor) continue;
      f.contentWindow.postMessage({
        type: 'PREVIEW_DESIGN', design: { ...design() }, display: { ...(state.data.config.display || {}) },
      }, location.origin);
    }
  }

  // ================= לוח הבית =================
  const LS_INSTALLED = () => `sb_installed_${state.me?.shul?.slug || ''}`;

  function renderHome() {
    const list = qs('#home-checklist');
    if (!list || !state.data.config) return;
    const c = state.data.config;
    const rooms = state.data.rooms.rooms || [];
    const hasTimes = rooms.some(r =>
      ['shacharit', 'mincha', 'arvit'].some(k => (r.weekday?.[k] || []).length) ||
      ['kabbalat', 'shacharit', 'mincha'].some(k => (r.shabbat?.[k] || []).length));
    let installed = false;
    try { installed = !!localStorage.getItem(LS_INSTALLED()); } catch {}

    const items = [
      { ok: !!String(c.location?.address || '').trim(), text: 'מיקום בית הכנסת', tab: 'general' },
      { ok: hasTimes, text: 'זמני תפילות', tab: 'rooms' },
      { ok: !!(c.design?.preset) || c.setup?.done === true, text: 'מראה הצג', tab: 'design' },
      { ok: installed || (state.screens?.total || 0) > 0, text: 'הפעלה על המסך בבית הכנסת', tab: 'installer' },
      { ok: (state.data.memorial.entries || []).length > 0, text: 'לוח הנצחות (רשות)', tab: 'memorial' },
      { ok: (state.data.announcements.entries || []).length > 0, text: 'הודעה ראשונה לציבור (רשות)', tab: 'announcements' },
    ];
    list.innerHTML = '';
    items.forEach((it, i) => {
      list.appendChild(el('li', { class: it.ok ? 'done' : '' },
        el('span', { class: 'ck' }, it.ok ? '✓' : String(i + 1)),
        el('span', { class: 'txt' }, it.text),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => switchTab(it.tab) }, it.ok ? 'עריכה' : 'הגדרה'),
      ));
    });
  }

  // ================= מסכים בלייב =================
  // כל צג שולח דופק כל 3 דקות; השרת מחזיר מי דיווח ב-7 הדקות האחרונות.
  // הרשימה מתרעננת כל חצי דקה כל עוד לוח הבית פתוח.
  let _screensTimer = null;

  function fmtAgo(ms) {
    const d = Math.max(0, Date.now() - ms);
    const sec = Math.round(d / 1000);
    if (sec < 45) return 'לפני רגע';
    const min = Math.round(sec / 60);
    if (min < 60) return `לפני ${min} דק׳`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `לפני ${hr} שע׳`;
    const days = Math.floor(hr / 24);
    return days === 1 ? 'אתמול' : `לפני ${days} ימים`;
  }

  // "Chrome · Windows" מתוך ה-user agent — מספיק כדי לזהות איזה מכשיר זה
  function describeDevice(ua) {
    ua = String(ua || '');
    const os = /Tizen|SMART-TV|WebOS|web0s|BRAVIA|VIDAA/i.test(ua) ? 'טלוויזיה חכמה'
      : /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad/i.test(ua) ? 'iOS' : /CrOS/i.test(ua) ? 'ChromeOS'
      : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return [br, os].filter(Boolean).join(' · ');
  }

  function screenName(s, i) {
    if (s.label) return s.label;
    const tail = String(s.id).replace(/^[a-z]:/, '').slice(-4).toUpperCase();
    return `מסך ${tail || i + 1}`;
  }

  async function renderLiveScreens(silent) {
    const list = qs('#live-list');
    if (!list || !state.me) return;
    let r;
    try { r = await Api.screens(); }
    catch (e) {
      if (e.status === 401) return;
      if (!silent) status(e.message, 'error');
      return;
    }
    const hadScreens = (state.screens?.total || 0) > 0;
    state.screens = r;

    const live = r.live || 0;
    qs('#live-count').textContent = String(live);
    qs('#live-dot').classList.toggle('on', live > 0);
    qs('#live-lbl').textContent = live === 1 ? 'מסך מקרין כרגע' : 'מסכים מקרינים כרגע';

    list.innerHTML = '';
    const screens = r.screens || [];
    if (!screens.length) {
      list.appendChild(el('li', { class: 'live-empty' },
        'עדיין לא זוהה מסך. פתחו את כתובת הצג על המסך בבית הכנסת — הוא יופיע כאן תוך רגע.'));
    }
    screens.forEach((s, i) => {
      const device = [describeDevice(s.userAgent), s.width && s.height ? `${s.width}×${s.height}` : ''].filter(Boolean).join(' · ');
      const when = s.live ? `דיווח ${fmtAgo(s.lastSeen)}` : `נראה לאחרונה ${fmtAgo(s.lastSeen)}`;
      let pill = null;
      if (s.live) {
        const fresh = !r.version || s.dataVersion >= r.version;
        pill = el('span', { class: `live-pill ${fresh ? 'ok' : 'warn'}`, title: fresh ? 'מציג את מה שנשמר לאחרונה' : 'עדיין לא קיבל את השמירה האחרונה — מתעדכן תוך 3 דקות' },
          fresh ? 'מעודכן' : 'מתעדכן…');
      } else {
        pill = el('span', { class: 'live-pill' }, 'כבוי');
      }
      list.appendChild(el('li', { class: s.live ? 'on' : 'off' },
        el('span', { class: `live-dot ${s.live ? 'on' : ''}` }),
        el('span', { class: 'nm' },
          el('b', {}, screenName(s, i)),
          el('span', {}, [device, when].filter(Boolean).join(' · '))),
        pill,
      ));
    });

    // הצ'ק-ליסט: מסך שנראה פעם אחת = "הופעל על המסך"
    if (hadScreens !== screens.length > 0) renderHome();
  }

  function startScreensPolling() {
    stopScreensPolling();
    renderLiveScreens(true);
    _screensTimer = setInterval(() => {
      if (document.hidden) return;
      const home = qs('.tab-content[data-tab="home"]');
      if (home && home.classList.contains('active')) renderLiveScreens(true);
    }, 30 * 1000);
  }
  function stopScreensPolling() {
    clearInterval(_screensTimer);
    _screensTimer = null;
  }

  // ================= אשף ההקמה =================
  // ארבעה שלבים קצרים. כל "המשך" שומר לשרת, כך שאפשר לעצור באמצע ולחזור.

  let wzStep = 1;

  function showWizard(step) {
    qs('#app-view').style.display = 'none';
    qs('#wizard-view').style.display = '';
    wzStep = Math.min(5, Math.max(1, Number(step ?? state.data.config.setup?.step) || 1));
    qs('#tour-btn').hidden = true;
    wzRender();
  }

  function wzRender() {
    qsa('#wz-steps .st').forEach(s => {
      const n = Number(s.dataset.step);
      s.classList.toggle('active', n === wzStep);
      s.classList.toggle('done', n < wzStep);
    });
    qsa('.wz-step').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === wzStep));
    const look = qs('#wz-look-wrap');
    if (look) look.hidden = !(wzStep === 3 || wzStep === 4);
    qs('#wz-back').style.visibility = wzStep === 1 ? 'hidden' : '';
    qs('#wz-next').textContent = wzStep === 5 ? 'סיום — לניהול המלא' : 'שמירה והמשך ←';
    qs('#wz-msg').textContent = '';
    if (wzStep === 1) wzFill1();
    if (wzStep === 2) wzFill2();
    if (wzStep === 3) wzFill3();
    if (wzStep === 4) wzFill4();
    if (wzStep === 5) wzFill5();
    window.scrollTo({ top: 0 });
  }

  function wzFill1() {
    const c = state.data.config;
    qs('#wz-name').value = c.synagogueName || state.me?.shul?.name || '';
    qs('#wz-address').value = c.location.address || '';
    qs('#wz-candle').value = c.location.candleLightingMinutes ?? 18;
    qs('#wz-latlon').textContent = `${Number(c.location.latitude).toFixed(4)}, ${Number(c.location.longitude).toFixed(4)}`;
    renderCityChips('#wz-cities', (city) => { applyCity(city); wzFill1(); });
  }

  // זמנים פשוטים: שדה טקסט אחד לכל תפילה, מופרד בפסיקים
  const fixedTimes = (arr) => (arr || [])
    .map(e => typeof e === 'string' ? e : (e && e.type !== 'relative' ? e.time : null))
    .filter(Boolean).join(', ');
  // באשף: מנחה ערב שבת וערבית מוצ״ש הן מספרים (דקות מהדלקת נרות / מצאת השבת).
  // רשומה "פשוטה" = יחסית לאותו בסיס, בלי עיגול ובלי תצוגת טקסט; רק אותן האשף עורך.
  const simpleOffset = (base) => (e) => e && typeof e === 'object' && e.type === 'relative'
    && e.base === base && !(Number(e.round) > 0) && e.show !== 'text';
  const offsetsOf = (arr, base) => (arr || []).filter(simpleOffset(base)).map(e => Number(e.offset) || 0).join(', ');
  const replaceOffsets = (arr, base, nums) => [
    ...nums.map(n => ({ type: 'relative', base, offset: n, round: 0, show: 'time', days: [] })),
    ...(arr || []).filter(e => !simpleOffset(base)(e)),
  ];

  function parseTimes(str) {
    const out = [];
    for (const tok of String(str || '').split(/[,\s;]+/)) {
      const m = tok.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) { if (tok) throw new Error(`"${tok}" אינה שעה תקינה (HH:MM)`); continue; }
      out.push(`${m[1].padStart(2, '0')}:${m[2]}`);
    }
    return out;
  }
  const parseNums = (str) => String(str || '').split(/[,\s;]+/).filter(Boolean).map(Number).filter(n => !isNaN(n));
  // שומר רשומות יחסיות שהוגדרו בניהול המלא; מחליף רק את השעות הקבועות
  const replaceFixed = (arr, fixed) => [...fixed, ...(arr || []).filter(e => e && typeof e === 'object' && e.type === 'relative')];

  function wzRoom() {
    const rooms = state.data.rooms.rooms;
    if (!rooms.length) rooms.push(normalizeRoom({ id: 'main', name: 'היכל מרכזי' }));
    return rooms[0];
  }

  function wzFill2() {
    const r = wzRoom();
    qs('#wz-wk-shacharit').value = fixedTimes(r.weekday.shacharit);
    qs('#wz-wk-mincha').value = fixedTimes(r.weekday.mincha);
    qs('#wz-wk-arvit').value = fixedTimes(r.weekday.arvit);
    qs('#wz-sh-kabbalat').value = fixedTimes(r.shabbat.kabbalat);
    qs('#wz-sh-mincha-erev').value = offsetsOf(r.shabbat.minchaErevOffsets, 'candle');
    qs('#wz-sh-shacharit').value = fixedTimes(r.shabbat.shacharit);
    qs('#wz-sh-mincha').value = fixedTimes(r.shabbat.mincha);
    qs('#wz-sh-arvit').value = offsetsOf(r.shabbat.arvitMotzashOffsets, 'havdalah');
  }

  // התצוגה המקדימה של האשף — נטענת פעם אחת, משותפת לשלבים 3 ו-4
  function ensureWzPreview() {
    const pv = qs('#wz-preview');
    if (pv && state.me && pv.dataset.loadedFor !== state.me.shul.slug) {
      pv.dataset.loadedFor = state.me.shul.slug;
      pv.addEventListener('load', () => { pushDesignPreview(); pushScreensPreview(); });
      pv.src = state.me.urls.display;
    }
    scalePreview();
  }

  function wzFill3() {
    const d = design();
    renderPresetGrid('#wz-presets', (p) => { applyPreset(p); wzFill3(); });
    renderCommunity('#wz-community');
    renderThemeRow('#wz-themes', wzFill3);
    renderFontRow('#wz-fonts', wzFill3);

    const themeAccent = (P.byId(P.THEMES, d.theme) || P.THEMES[0]).swatch.accent;
    qs('#wz-accent').value = d.accent || themeAccent;
    qs('#wz-accent-reset').disabled = !d.accent;
    const pct = Math.round((d.scale || 1) * 100);
    qs('#wz-scale').value = pct;
    qs('#wz-scale-val').textContent = pct + '%';

    // לוגו
    const lp = qs('#wz-logo-preview');
    const url = d.logo?.url || '';
    lp.innerHTML = '';
    if (url) lp.appendChild(el('img', { src: url, alt: 'לוגו' }));
    else lp.textContent = 'אין לוגו';
    qs('#wz-logo-remove').hidden = !url;

    // רקע
    renderBgGrid('#wz-bg-grid', wzFill3);
    const ov = Math.round((d.backgroundOverlay ?? 0.45) * 100);
    qs('#wz-overlay').value = ov;
    qs('#wz-overlay-val').textContent = ov + '%';
    qs('#wz-fit').value = d.backgroundFit || 'cover';
    qs('#wz-blur').value = d.backgroundBlur || 0;
    qs('#wz-blur-val').textContent = String(d.backgroundBlur || 0);

    ensureWzPreview();
  }

  // שלב 4: פריסה — תבניות מסך, עם "קלאסי" שמכבה את מצב המסכים
  function wzFill4() {
    const sc = scData();
    qs('#wz-aspect').value = sc.aspect || '16:9';
    qs('#wz-show-upcoming').checked = state.data.config.display?.showUpcoming !== false;
    qs('#wz-header-logo').checked = !!state.data.config.display?.headerLogo;

    const grid = qs('#wz-templates');
    grid.innerHTML = '';
    const active = sc.enabled ? matchBuiltinTemplate() : 'classic';
    const classic = el('button', {
      class: `tpl-card${active === 'classic' ? ' active' : ''}`, type: 'button',
      onclick: () => { sc.enabled = false; markDirty(); wzFill4(); pushScreensPreview(); },
    }, el('div', { class: 'tpl-thumb classic' }, 'זמנים · תפילות · הנצחות'),
       el('div', { class: 'tpl-name' }, 'קלאסי'), el('div', { class: 'tpl-desc' }, 'שלושת הלוחות לפי הפריסה שבחרתם במראה'));
    grid.appendChild(classic);
    for (const t of P.SCREEN_TEMPLATES) {
      grid.appendChild(templateCard(t, active === t.id, () => {
        applyTemplateSilent(t);
        wzFill4();
      }));
    }
    ensureWzPreview();
  }

  // איזו תבנית מובנית תואמת את המסך הראשון (לסימון הכרטיס הפעיל)
  function matchBuiltinTemplate() {
    const blocks = scData().screens[0]?.blocks || [];
    const sig = (bs) => bs.map(b => `${b.type}:${b.x},${b.y},${b.w},${b.h}`).sort().join('|');
    const cur = sig(blocks);
    const t = P.SCREEN_TEMPLATES.find(t => sig(t.blocks) === cur);
    return t ? t.id : '';
  }

  function wzFill5() {
    const pub = qs('#wz-publish');
    if (pub) pub.hidden = !isCustomLook();
  }

  async function wzSave(section, data) {
    await Api.saveSection(section, data);
  }

  async function wzNext() {
    const msg = qs('#wz-msg');
    const btn = qs('#wz-next');
    msg.textContent = '';
    const c = state.data.config;
    try {
      btn.disabled = true;
      if (wzStep === 1) {
        const name = qs('#wz-name').value.trim();
        if (name.length < 2) throw new Error('הזינו את שם בית הכנסת');
        c.synagogueName = name;
        c.location.address = qs('#wz-address').value.trim();
        c.location.candleLightingMinutes = parseInt(qs('#wz-candle').value, 10) || 18;
        c.setup.step = 2;
        await wzSave('config', c);
      } else if (wzStep === 2) {
        const r = wzRoom();
        r.weekday.shacharit = replaceFixed(r.weekday.shacharit, parseTimes(qs('#wz-wk-shacharit').value));
        r.weekday.mincha    = replaceFixed(r.weekday.mincha,    parseTimes(qs('#wz-wk-mincha').value));
        r.weekday.arvit     = replaceFixed(r.weekday.arvit,     parseTimes(qs('#wz-wk-arvit').value));
        r.shabbat.kabbalat  = replaceFixed(r.shabbat.kabbalat,  parseTimes(qs('#wz-sh-kabbalat').value));
        r.shabbat.shacharit = replaceFixed(r.shabbat.shacharit, parseTimes(qs('#wz-sh-shacharit').value));
        r.shabbat.mincha    = replaceFixed(r.shabbat.mincha,    parseTimes(qs('#wz-sh-mincha').value));
        r.shabbat.minchaErevOffsets   = replaceOffsets(r.shabbat.minchaErevOffsets,   'candle',   parseNums(qs('#wz-sh-mincha-erev').value));
        r.shabbat.arvitMotzashOffsets = replaceOffsets(r.shabbat.arvitMotzashOffsets, 'havdalah', parseNums(qs('#wz-sh-arvit').value));
        c.setup.step = 3;
        await wzSave('rooms', state.data.rooms);
        await wzSave('config', c);
      } else if (wzStep === 3) {
        c.setup.step = 4;
        await wzSave('config', c);
      } else if (wzStep === 4) {
        c.setup.step = 5;
        await wzSave('screens', state.data.screens);
        await wzSave('config', c);
      } else {
        await wizardFinish();
        return;
      }
      // האשף שומר כל מה שהוא נוגע בו — אחרי שמירה מוצלחת אין שינויים תלויים
      markClean();
      wzStep += 1;
      wzRender();
      renderAll();
    } catch (e) {
      if (e.status === 401) { location.reload(); return; }
      msg.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function wizardFinish() {
    const c = state.data.config;
    c.setup = { done: true, step: 5 };
    try {
      // האשף שומר כל שלב בנפרד; כאן נשמר גם מה שאולי השתנה בלי "המשך" (למשל תבנית מהקהילה)
      await wzSave('screens', state.data.screens);
      await wzSave('config', c);
    } catch (e) { status(`שגיאה בשמירה: ${e.message}`, 'error'); return; }
    markClean();
    renderAll();
    showApp();
    status('ההקמה הושלמה — הצג באוויר ✓', 'success');
    maybeAutoTour();
  }

  function setupWizard() {
    if (!qs('#wizard-view')) return;
    qs('#wz-next').addEventListener('click', wzNext);
    qs('#wz-back').addEventListener('click', () => { if (wzStep > 1) { wzStep -= 1; wzRender(); } });
    qs('#wz-skip').addEventListener('click', wizardFinish);
    qs('#wz-geocode').addEventListener('click', () =>
      geocodeAddress('#wz-address', '#wz-geocode-status').then(ok => { if (ok) wzFill1(); }));
    qs('#wz-copy').addEventListener('click', () => copyText(qs('#wz-display-url').textContent));
    qs('#home-copy').addEventListener('click', () => copyText(qs('#home-url').textContent));
    qs('#link-display-copy').addEventListener('click', () => copyText(qs('#link-display-text').textContent));
    qs('#home-wizard').addEventListener('click', () => showWizard(1));
    qs('#live-refresh').addEventListener('click', () => renderLiveScreens(false));

    // שלב 3: התאמה אישית
    qs('#wz-accent').addEventListener('input', (e) => {
      design().accent = e.target.value; qs('#wz-accent-reset').disabled = false; markDirty(); pushDesignPreview();
    });
    qs('#wz-accent-reset').addEventListener('click', () => { design().accent = ''; markDirty(); wzFill3(); pushDesignPreview(); });
    qs('#wz-scale').addEventListener('input', (e) => {
      design().scale = parseInt(e.target.value, 10) / 100; qs('#wz-scale-val').textContent = e.target.value + '%';
      markDirty(); pushDesignPreview();
    });
    qs('#wz-overlay').addEventListener('input', (e) => {
      design().backgroundOverlay = (parseInt(e.target.value, 10) || 0) / 100; qs('#wz-overlay-val').textContent = e.target.value + '%';
      markDirty(); pushDesignPreview();
    });
    qs('#wz-fit').addEventListener('change', (e) => {
      design().backgroundFit = e.target.value;
      markDirty(); pushDesignPreview();
    });
    qs('#wz-blur').addEventListener('input', (e) => {
      design().backgroundBlur = parseInt(e.target.value, 10) || 0;
      qs('#wz-blur-val').textContent = e.target.value;
      markDirty(); pushDesignPreview();
    });
    qs('#wz-logo-file').addEventListener('change', (e) => {
      // העלאת לוגו מהאשף = רוצים לראות אותו, גם בכותרת
      uploadAndUse(e.target.files[0], (url) => {
        design().logo = { url };
        state.data.config.display = { ...(state.data.config.display || {}), headerLogo: true };
        markDirty(); wzFill3(); renderLogoPicker(); renderDesign(); pushDesignPreview();
      }, 'הלוגו');
      e.target.value = '';
    });
    qs('#wz-logo-remove').addEventListener('click', () => { design().logo = { url: '' }; markDirty(); wzFill3(); renderLogoPicker(); pushDesignPreview(); });
    qs('#wz-bg-file').addEventListener('change', (e) => {
      uploadAndUse(e.target.files[0], (url) => { design().backgroundImage = url; markDirty(); wzFill3(); renderDesign(); pushDesignPreview(); }, 'הרקע');
      e.target.value = '';
    });

    // שלב 4: פריסה
    qs('#wz-aspect').addEventListener('change', (e) => { scData().aspect = e.target.value; markDirty(); scalePreview(); pushScreensPreview(); });
    qs('#wz-show-upcoming').addEventListener('change', (e) => {
      state.data.config.display = { ...(state.data.config.display || {}), showUpcoming: e.target.checked };
      markDirty(); pushDesignPreview();
    });
    qs('#wz-header-logo').addEventListener('change', (e) => {
      state.data.config.display = { ...(state.data.config.display || {}), headerLogo: e.target.checked };
      markDirty(); pushDesignPreview();
    });

    // שלב 5: פרסום לקהילה
    qs('#wz-pub-btn').addEventListener('click', () => publishLook('#wz-pub-name', null, '#wz-pub-msg', '#wz-pub-btn'));
    qs('#pub-btn').addEventListener('click', () => publishLook('#pub-name', '#pub-desc', '#pub-msg', '#pub-btn'));
    // הורדת המתקין נחשבת כ"הופעל על המסך" בצ'ק-ליסט
    for (const sel of ['#link-installer', '#link-bat', '#wz-link-installer', '#wz-link-bat']) {
      const a = qs(sel);
      if (a) a.addEventListener('click', () => { try { localStorage.setItem(LS_INSTALLED(), '1'); } catch {} });
    }
  }

  // ---------- Zmanim ----------
  const ZMANIM_KEYS = window.SB_PRESETS.ZMANIM;
  // hebcal method map (matches display.js ZMANIM_DEFS)
  const ZMANIM_FN = {
    alotHaShachar:    z => z.alotHaShachar(),
    misheyakir:       z => z.misheyakir(),
    sunrise:          z => z.sunrise(),
    sofZmanShmaMGA:   z => z.sofZmanShmaMGA(),
    sofZmanShma:      z => z.sofZmanShma(),
    sofZmanTfillaMGA: z => z.sofZmanTfillaMGA(),
    sofZmanTfilla:    z => z.sofZmanTfilla(),
    chatzot:          z => z.chatzot(),
    minchaGedola:     z => z.minchaGedola(),
    minchaKetana:     z => z.minchaKetana(),
    plagHaMincha:     z => z.plagHaMincha(),
    sunset:           z => z.sunset(),
    tzeit:            z => z.tzeit(),
    tzeit72:          z => z.sunsetOffset(72),
    chatzotNight:     z => z.chatzotNight(),
  };

  function computeDefaultZmanim() {
    const out = {};
    try {
      const h = window.hebcal;
      if (!h || !h.GeoLocation || !h.Zmanim) return out;
      const loc = state.data.config.location || {};
      const geo = new h.GeoLocation(
        state.data.config.synagogueName || 'site',
        Number(loc.latitude) || 0,
        Number(loc.longitude) || 0,
        0,
        loc.timezone || 'Asia/Jerusalem'
      );
      const z = new h.Zmanim(geo, new Date());
      for (const key of Object.keys(ZMANIM_FN)) {
        try {
          const d = ZMANIM_FN[key](z);
          if (d instanceof Date && !isNaN(d)) {
            out[key] = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
          }
        } catch {}
      }
    } catch {}
    return out;
  }

  function renderZmanim() {
    const grid = qs('#zmanim-grid');
    grid.innerHTML = '';
    const displayed = state.data.config.displayedZmanim || {};
    const overrides = state.data.config.zmanimOverrides || {};
    const defaults = computeDefaultZmanim();
    for (const [key, label] of ZMANIM_KEYS) {
      const row = el('div', { class: 'zmanim-row' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!displayed[key];
      cb.addEventListener('change', () => {
        state.data.config.displayedZmanim[key] = cb.checked;
        markDirty();
      });
      const ov = el('input', { type: 'text', placeholder: defaults[key] || 'HH:MM', maxlength: '5' });
      ov.value = overrides[key] || '';
      ov.style.width = '5.5rem';
      ov.style.direction = 'ltr';
      ov.style.textAlign = 'center';
      ov.addEventListener('input', () => {
        const v = ov.value.trim();
        if (v) state.data.config.zmanimOverrides[key] = v;
        else delete state.data.config.zmanimOverrides[key];
        markDirty();
      });
      const lbl = el('label', {}, cb, el('span', { class: 'zm-label' }, label));
      const defStr = defaults[key] ? `ברירת מחדל: ${defaults[key]}` : '';
      row.appendChild(lbl);
      row.appendChild(el('span', { class: 'zm-default small' }, defStr));
      row.appendChild(ov);
      grid.appendChild(row);
    }
  }

  // ---------- Rooms ----------
  // ---------- עורך רשומת זמן תפילה ----------
  // רשומה היא מחרוזת "06:30" (שעה קבועה) או אובייקט:
  //   { type:'relative', base:'sunset', offset:-20, round:5, days:[0,1,2] }

  //   show:'time' (ברירת מחדל) מציג את השעה המחושבת; show:'text' מציג "45 דק׳ לפני הנץ החמה"
  const ZMAN_BASES = [
    ['alotHaShachar', 'עלות השחר'], ['misheyakir', 'משיכיר'], ['sunrise', 'הנץ החמה'],
    ['sofZmanShmaMGA', 'סו״ז ק״ש (מג״א)'], ['sofZmanShma', 'סו״ז ק״ש (גר״א)'],
    ['sofZmanTfillaMGA', 'סו״ז תפילה (מג״א)'], ['sofZmanTfilla', 'סו״ז תפילה (גר״א)'],
    ['chatzot', 'חצות היום'], ['minchaGedola', 'מנחה גדולה'], ['minchaKetana', 'מנחה קטנה'],
    ['plagHaMincha', 'פלג המנחה'], ['sunset', 'שקיעה'], ['tzeit', 'צאת הכוכבים'],
    ['tzeit72', 'צאת הכוכבים (ר״ת)'], ['chatzotNight', 'חצות הלילה'],
    ['candle', 'הדלקת נרות (שבת)'], ['havdalah', 'צאת השבת'],
  ];
  const BASE_LABEL = Object.fromEntries(ZMAN_BASES);

  // כך הצג יציג רשומה יחסית במצב טקסט — אותה נוסחה כמו ב-display.js
  function relativeText(entry) {
    const label = { sunset: 'השקיעה', candle: 'הדלקת נרות' }[entry.base] || BASE_LABEL[entry.base] || '';
    const off = Number(entry.offset) || 0;
    if (!off) return label;
    const abs = Math.abs(off);
    const amount = abs === 60 ? 'שעה' : abs % 60 === 0 ? `${abs / 60} שע׳` : `${abs} דק׳`;
    return `${amount} ${off < 0 ? 'לפני' : 'אחרי'} ${label}`;
  }

  const DOW_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

  const asEntry = (v) => (v && typeof v === 'object') ? v : { type: 'fixed', time: String(v || '') };

  function timeEntryRow(arr, idx, redraw) {
    const entry = asEntry(arr[idx]);
    const isRel = entry.type === 'relative';
    const row = el('div', { class: 'tm-entry' });

    const kind = el('select', {});
    kind.appendChild(el('option', { value: 'fixed' }, 'שעה קבועה'));
    kind.appendChild(el('option', { value: 'relative' }, 'לפי זמן ביום'));
    kind.value = isRel ? 'relative' : 'fixed';
    kind.addEventListener('change', () => {
      arr[idx] = kind.value === 'relative'
        ? { type: 'relative', base: 'sunset', offset: -20, round: 0, show: 'time', days: entry.days || [] }
        : { type: 'fixed', time: entry.time || '', days: entry.days || [] };
      markDirty(); redraw();
    });
    row.appendChild(kind);

    if (isRel) {
      // [N דקות] [לפני/אחרי] [זמן] — נשמר כ-offset חתום (שלילי = לפני)
      const preview = el('span', { class: 'tm-result tm-preview' });
      const refresh = () => {
        preview.textContent = entry.show === 'text' ? `יוצג: ${relativeText(entry)}` : '';
        arr[idx] = entry; markDirty();
      };

      const off = el('input', { type: 'number', step: '1', min: '0', title: 'דקות' });
      off.value = String(Math.abs(Number(entry.offset) || 0));
      row.appendChild(off);
      row.appendChild(el('span', { class: 'tm-result' }, 'דק׳'));

      const dir = el('select', {});
      dir.appendChild(el('option', { value: '-1' }, 'לפני'));
      dir.appendChild(el('option', { value: '1' }, 'אחרי'));
      dir.value = (Number(entry.offset) || 0) > 0 ? '1' : '-1';
      const setOffset = () => { entry.offset = Number(dir.value) * (parseInt(off.value, 10) || 0); refresh(); };
      off.addEventListener('input', setOffset);
      dir.addEventListener('change', setOffset);
      row.appendChild(dir);

      const base = el('select', {});
      for (const [k, label] of ZMAN_BASES) base.appendChild(el('option', { value: k }, label));
      base.value = entry.base || 'sunset';
      base.addEventListener('change', () => { entry.base = base.value; refresh(); });
      row.appendChild(base);

      const round = el('select', {});
      [[0, 'בלי עיגול'], [5, 'לעגל ל־5 דק׳'], [10, 'לעגל ל־10 דק׳'], [15, 'לעגל ל־15 דק׳']]
        .forEach(([v, label]) => round.appendChild(el('option', { value: String(v) }, label)));
      round.value = String(entry.round || 0);
      round.addEventListener('change', () => { entry.round = parseInt(round.value, 10) || 0; refresh(); });
      row.appendChild(round);

      // מה מופיע על הלוח: השעה המחושבת, או הטקסט הגולמי
      const show = el('select', {});
      show.appendChild(el('option', { value: 'time' }, 'על הלוח: השעה'));
      show.appendChild(el('option', { value: 'text' }, 'על הלוח: הטקסט'));
      show.value = entry.show === 'text' ? 'text' : 'time';
      show.addEventListener('change', () => { entry.show = show.value; refresh(); });
      row.appendChild(show);
      row.appendChild(preview);
      preview.textContent = entry.show === 'text' ? `יוצג: ${relativeText(entry)}` : '';
    } else {
      const t = el('input', { type: 'time' });
      t.value = entry.time || '';
      t.addEventListener('input', () => { entry.time = t.value; arr[idx] = entry; markDirty(); });
      row.appendChild(t);
    }

    // ימים פעילים — ריק = כל הימים
    const days = el('div', { class: 'tm-days' });
    days.appendChild(el('span', { class: 'tm-result' }, 'ימים:'));
    const active = Array.isArray(entry.days) ? entry.days : [];
    DOW_LABELS.forEach((label, d) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = active.length === 0 || active.includes(d);
      const lab = el('label', { class: cb.checked ? 'on' : '' }, cb, label);
      cb.addEventListener('change', () => {
        let list = Array.isArray(entry.days) && entry.days.length
          ? [...entry.days] : [0, 1, 2, 3, 4, 5, 6];
        list = cb.checked ? [...new Set([...list, d])] : list.filter(x => x !== d);
        entry.days = list.length === 7 ? [] : list.sort();
        arr[idx] = entry;
        lab.classList.toggle('on', cb.checked);
        markDirty();
      });
      days.appendChild(lab);
    });
    row.appendChild(days);

    row.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: () => { arr.splice(idx, 1); markDirty(); redraw(); },
    }, '×'));

    return row;
  }

  function renderRooms() {
    const list = qs('#rooms-list');
    list.innerHTML = '';
    if (!state.data.rooms.rooms.length) {
      list.appendChild(el('div', { class: 'empty-state' }, 'אין חדרי תפילה — הוסיפו חדר כדי להתחיל.'));
      return;
    }
    for (const room of state.data.rooms.rooms) {
      list.appendChild(renderRoomCard(room));
    }
  }
  function renderRoomCard(room) {
    const card = el('div', { class: 'list-item' });
    const head = el('div', { class: 'head' },
      el('strong', {}, room.name || '(ללא שם)'),
      el('button', { class: 'btn btn-danger btn-sm', onclick: () => {
        if (!confirm(`למחוק את החדר "${room.name}"?`)) return;
        state.data.rooms.rooms = state.data.rooms.rooms.filter(r => r !== room);
        markDirty(); renderRooms();
      }}, 'מחיקה')
    );

    const body = el('div', {});
    const fieldRow = (label, inputEl) => el('div', { class: 'field' }, el('label', {}, label), inputEl);
    const mkInput = (type, value, onchange) => {
      const i = el('input', { type });
      i.value = value ?? '';
      i.addEventListener('input', (e) => { onchange(e.target.value); markDirty(); });
      return i;
    };

    body.appendChild(el('div', { class: 'row' },
      fieldRow('מזהה (id)', mkInput('text', room.id, v => { room.id = v.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-'); })),
      fieldRow('שם להצגה', mkInput('text', room.name, v => { room.name = v; renderRooms(); })),
    ));

    // Multi-minyan builder
    const buildList = (title, arr, opts = {}) => {
      const wrap = el('div', { class: 'minyan-list' });
      wrap.appendChild(el('label', {}, title));
      const rows = el('div', { class: 'minyan-rows' });
      const draw = () => {
        rows.innerHTML = '';
        arr.forEach((val, idx) => rows.appendChild(timeEntryRow(arr, idx, draw)));
        const add = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
          arr.push(opts.defaultEntry ? { ...opts.defaultEntry, days: [] } : { type: 'fixed', time: '', days: [] });
          markDirty(); draw();
        }}, '+ מניין');
        rows.appendChild(add);
      };
      draw();
      wrap.appendChild(rows);
      if (opts.hint) wrap.appendChild(el('div', { class: 'small' }, opts.hint));
      return wrap;
    };

    body.appendChild(el('h3', {}, 'יום חול'));
    body.appendChild(el('div', { class: 'row-3' },
      buildList('שחרית', room.weekday.shacharit),
      buildList('מנחה',   room.weekday.mincha),
      buildList('ערבית',  room.weekday.arvit),
    ));

    body.appendChild(el('h3', {}, 'שבת'));
    body.appendChild(el('div', { class: 'row-3' },
      buildList('קבלת שבת', room.shabbat.kabbalat, { hint: 'שעה קבועה (אופציונלי)' }),
      buildList('מנחה ערב שבת', room.shabbat.minchaErevOffsets, {
        defaultEntry: { type: 'relative', base: 'candle', offset: -15, round: 0, show: 'time' },
        hint: 'בדרך כלל דקות לפני הדלקת נרות; אפשר גם שעה קבועה או כל זמן אחר ביום',
      }),
      buildList('שחרית שבת', room.shabbat.shacharit),
    ));
    body.appendChild(el('div', { class: 'row-3' },
      buildList('מנחה שבת',  room.shabbat.mincha),
      buildList('ערבית מוצ״ש', room.shabbat.arvitMotzashOffsets, {
        defaultEntry: { type: 'relative', base: 'havdalah', offset: 30, round: 0, show: 'time' },
        hint: 'בדרך כלל דקות אחרי צאת השבת',
      }),
      el('div'),
    ));

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  // ---------- Memorial ----------
  function renderMemorial() {
    const tbody = qs('#mem-table tbody');
    tbody.innerHTML = '';
    for (const entry of state.data.memorial.entries) {
      tbody.appendChild(renderMemRow(entry));
    }
  }
  function renderMemRow(entry) {
    const tr = document.createElement('tr');
    const mkTd = (field, type='text') => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = type;
      input.value = entry[field] ?? '';
      input.addEventListener('input', (e) => { entry[field] = type === 'number' ? Number(e.target.value) : e.target.value; markDirty(); });
      td.appendChild(input);
      return td;
    };
    tr.appendChild(mkTd('name'));
    tr.appendChild(mkTd('hebrewDay', 'number'));
    // month as select
    const tdMonth = document.createElement('td');
    const sel = document.createElement('select');
    sel.appendChild(el('option', { value: '' }, '—'));
    for (const m of HEB_MONTHS) sel.appendChild(el('option', { value: m }, m));
    sel.value = entry.hebrewMonth || '';
    sel.addEventListener('change', () => { entry.hebrewMonth = sel.value; markDirty(); });
    tdMonth.appendChild(sel);
    tr.appendChild(tdMonth);
    tr.appendChild(mkTd('notes'));
    const tdAct = document.createElement('td');
    tdAct.className = 'col-actions';
    const del = el('button', { class: 'btn btn-danger btn-sm', onclick: () => {
      state.data.memorial.entries = state.data.memorial.entries.filter(e => e !== entry);
      markDirty(); renderMemorial();
    }}, '×');
    tdAct.appendChild(del);
    tr.appendChild(tdAct);
    return tr;
  }

  // ---------- Announcements ----------
  function renderAnnouncements() {
    const tbody = qs('#ann-table tbody');
    tbody.innerHTML = '';
    for (const a of state.data.announcements.entries) {
      tbody.appendChild(renderAnnRow(a));
    }
  }
  function renderAnnRow(a) {
    const tr = document.createElement('tr');
    const mkTd = (field, type='text') => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = type;
      input.value = a[field] ?? '';
      input.addEventListener('input', (e) => { a[field] = e.target.value; markDirty(); });
      td.appendChild(input);
      return td;
    };
    tr.appendChild(mkTd('text'));
    tr.appendChild(mkTd('startDate', 'date'));
    tr.appendChild(mkTd('endDate', 'date'));
    const tdAct = document.createElement('td');
    tdAct.className = 'col-actions';
    tdAct.appendChild(el('button', { class: 'btn btn-danger btn-sm', onclick: () => {
      state.data.announcements.entries = state.data.announcements.entries.filter(e => e !== a);
      markDirty(); renderAnnouncements();
    }}, '×'));
    tr.appendChild(tdAct);
    return tr;
  }

  // ---------- Special events ----------
  const HOLIDAY_PRESETS = [
    { name: 'ראש השנה א׳',    day: 1,  month: 'תשרי' },
    { name: 'ראש השנה ב׳',    day: 2,  month: 'תשרי' },
    { name: 'יום הכיפורים',    day: 10, month: 'תשרי' },
    { name: 'סוכות א׳',        day: 15, month: 'תשרי' },
    { name: 'שמיני עצרת',      day: 22, month: 'תשרי' },
    { name: 'שמחת תורה',       day: 23, month: 'תשרי' },
    { name: 'חנוכה א׳',        day: 25, month: 'כסלו' },
    { name: 'ט״ו בשבט',        day: 15, month: 'שבט' },
    { name: 'פורים',           day: 14, month: 'אדר' },
    { name: 'שושן פורים',      day: 15, month: 'אדר' },
    { name: 'פסח א׳',          day: 15, month: 'ניסן' },
    { name: 'שביעי של פסח',    day: 21, month: 'ניסן' },
    { name: 'ל״ג בעומר',       day: 18, month: 'אייר' },
    { name: 'יום ירושלים',     day: 28, month: 'אייר' },
    { name: 'שבועות',          day: 6,  month: 'סיון' },
    { name: 'צום י״ז בתמוז',   day: 17, month: 'תמוז' },
    { name: 'תשעה באב',        day: 9,  month: 'אב' },
  ];

  function migrateSpecial() {
    let arr = state.data.specialTimes.entries || [];
    if (arr.length && arr[0] && (Array.isArray(arr[0].times) || arr[0].dateType)) {
      // Already events
      state.data.specialTimes.entries = arr.map(ev => ({
        id: ev.id || String(Math.random()).slice(2),
        name: ev.name || '',
        dateType: ev.dateType === 'hebrew' ? 'hebrew' : 'gregorian',
        date: ev.date || '',
        hebrewDay: Number(ev.hebrewDay) || 0,
        hebrewMonth: ev.hebrewMonth || '',
        times: Array.isArray(ev.times) ? ev.times : [],
      }));
      return;
    }
    // Flat legacy rows → group by date
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
    state.data.specialTimes.entries = [...groups.values()];
  }

  function renderSpecial() {
    const host = qs('#sp-list');
    host.innerHTML = '';
    if (!state.data.specialTimes.entries.length) {
      host.appendChild(el('div', { class: 'empty-state' }, 'אין אירועים — הוסיפו אירוע (חג/תאריך מיוחד).'));
      return;
    }
    for (const ev of state.data.specialTimes.entries) {
      host.appendChild(renderEventCard(ev));
    }
  }

  function renderEventCard(ev) {
    const card = el('div', { class: 'list-item' });
    const head = el('div', { class: 'head' },
      el('strong', {}, ev.name || '(ללא שם)'),
      el('button', { class: 'btn btn-danger btn-sm', onclick: () => {
        state.data.specialTimes.entries = state.data.specialTimes.entries.filter(e => e !== ev);
        markDirty(); renderSpecial();
      }}, 'מחיקה')
    );

    const body = el('div', {});
    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.placeholder = 'שם האירוע (למשל: שבועות)';
    nameInp.value = ev.name || '';
    nameInp.addEventListener('input', () => {
      ev.name = nameInp.value;
      head.querySelector('strong').textContent = ev.name || '(ללא שם)';
      markDirty();
    });
    body.appendChild(el('div', { class: 'field' }, el('label', {}, 'שם'), nameInp));

    // Preset
    const preset = document.createElement('select');
    preset.appendChild(el('option', { value: '' }, '— חג מוכן (אופציונלי) —'));
    for (const h of HOLIDAY_PRESETS) preset.appendChild(el('option', { value: h.name }, h.name));
    preset.addEventListener('change', () => {
      const p = HOLIDAY_PRESETS.find(h => h.name === preset.value);
      if (!p) return;
      ev.name = p.name;
      ev.dateType = 'hebrew';
      ev.hebrewDay = p.day;
      ev.hebrewMonth = p.month;
      nameInp.value = p.name;
      head.querySelector('strong').textContent = p.name;
      markDirty();
      renderSpecial(); // re-render to reflect new dateType selection
    });
    body.appendChild(el('div', { class: 'field' }, el('label', {}, 'מילוי מהיר לפי חג'), preset));

    // Date type
    const dtWrap = el('div', { class: 'field' });
    dtWrap.appendChild(el('label', {}, 'סוג תאריך'));
    const dtSel = document.createElement('select');
    dtSel.appendChild(el('option', { value: 'hebrew' }, 'תאריך עברי'));
    dtSel.appendChild(el('option', { value: 'gregorian' }, 'תאריך לועזי'));
    dtSel.value = ev.dateType === 'gregorian' ? 'gregorian' : 'hebrew';
    dtSel.addEventListener('change', () => {
      ev.dateType = dtSel.value;
      markDirty();
      renderSpecial();
    });
    dtWrap.appendChild(dtSel);
    body.appendChild(dtWrap);

    if (ev.dateType === 'gregorian') {
      const di = document.createElement('input');
      di.type = 'date';
      di.value = ev.date || '';
      di.addEventListener('input', () => { ev.date = di.value; markDirty(); });
      body.appendChild(el('div', { class: 'field' }, el('label', {}, 'תאריך לועזי'), di));
    } else {
      const dayInp = document.createElement('input');
      dayInp.type = 'number';
      dayInp.min = '1'; dayInp.max = '30';
      dayInp.value = ev.hebrewDay || '';
      dayInp.addEventListener('input', () => { ev.hebrewDay = Number(dayInp.value) || 0; markDirty(); });
      const monthSel = document.createElement('select');
      monthSel.appendChild(el('option', { value: '' }, '—'));
      for (const m of HEB_MONTHS) monthSel.appendChild(el('option', { value: m }, m));
      monthSel.value = ev.hebrewMonth || '';
      monthSel.addEventListener('change', () => { ev.hebrewMonth = monthSel.value; markDirty(); });
      body.appendChild(el('div', { class: 'row' },
        el('div', { class: 'field' }, el('label', {}, 'יום עברי'), dayInp),
        el('div', { class: 'field' }, el('label', {}, 'חודש עברי'), monthSel),
      ));
    }

    // Times list
    body.appendChild(el('h3', {}, 'זמני תפילה לאירוע'));
    const timesHost = el('div', { class: 'sp-times' });
    const drawTimes = () => {
      timesHost.innerHTML = '';
      (ev.times || []).forEach((t, idx) => {
        const roomSel = document.createElement('select');
        roomSel.appendChild(el('option', { value: '' }, 'כל החדרים'));
        for (const r of state.data.rooms.rooms) roomSel.appendChild(el('option', { value: r.id }, r.name));
        roomSel.value = t.roomId || '';
        roomSel.addEventListener('change', () => { t.roomId = roomSel.value; markDirty(); });
        const labelInp = document.createElement('input');
        labelInp.type = 'text';
        labelInp.placeholder = 'שם התפילה (למשל: שחרית)';
        labelInp.value = t.label || '';
        labelInp.addEventListener('input', () => { t.label = labelInp.value; markDirty(); });
        const timeInp = document.createElement('input');
        timeInp.type = 'text';
        timeInp.placeholder = 'HH:MM';
        timeInp.value = t.time || '';
        timeInp.addEventListener('input', () => { t.time = timeInp.value; markDirty(); });
        const rm = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
          ev.times.splice(idx, 1); markDirty(); drawTimes();
        }}, '×');
        timesHost.appendChild(el('div', { class: 'sp-time-row' }, roomSel, labelInp, timeInp, rm));
      });
      const add = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
        ev.times = ev.times || [];
        ev.times.push({ roomId: '', label: '', time: '' });
        markDirty(); drawTimes();
      }}, '+ שעת תפילה');
      timesHost.appendChild(add);
    };
    drawTimes();
    body.appendChild(timesHost);

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    const lines = text.replace(/\r/g,'').split('\n').filter(l => l.trim());
    if (!lines.length) return [];
    // tiny CSV parser with quoted values
    const parseLine = (line) => {
      const out = [];
      let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else {
          if (c === ',') { out.push(cur); cur = ''; }
          else if (c === '"') inQ = true;
          else cur += c;
        }
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const header = parseLine(lines[0]);
    return lines.slice(1).map(l => {
      const cols = parseLine(l);
      const obj = {};
      header.forEach((h, i) => obj[h] = cols[i] ?? '');
      return obj;
    });
  }

  function toCSV(rows, columns) {
    const esc = (v) => {
      v = v == null ? '' : String(v);
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const lines = [columns.map(c => esc(c.label)).join(',')];
    for (const row of rows) {
      lines.push(columns.map(c => esc(row[c.key])).join(','));
    }
    return lines.join('\n');
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function setupCSV() {
    // Memorial CSV
    qs('#mem-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const rows = parseCSV(text);
      // Accept columns: name|שם, day|יום, month|חודש, notes|הערות
      const entries = rows.map(r => ({
        name: r['שם'] || r['name'] || '',
        hebrewDay: Number(r['יום'] || r['day'] || '') || 0,
        hebrewMonth: r['חודש'] || r['month'] || '',
        notes: r['הערות'] || r['notes'] || '',
      })).filter(e => e.name);
      if (!entries.length) { status('לא זוהו שורות', 'error'); return; }
      if (!confirm(`לטעון ${entries.length} שורות ולהחליף את הרשימה הנוכחית?`)) return;
      state.data.memorial.entries = entries;
      markDirty();
      renderMemorial();
      status('CSV נטען — לחצו "שמירה ופרסום"', 'success');
    });
    qs('#mem-download').addEventListener('click', () => {
      const csv = toCSV(state.data.memorial.entries, [
        { key: 'name', label: 'שם' },
        { key: 'hebrewDay', label: 'יום' },
        { key: 'hebrewMonth', label: 'חודש' },
        { key: 'notes', label: 'הערות' },
      ]);
      download('memorial.csv', csv);
    });
    qs('#mem-clear').addEventListener('click', () => {
      if (!confirm('למחוק את כל ההנצחות?')) return;
      state.data.memorial.entries = [];
      markDirty(); renderMemorial();
    });

    // -- Zmanim-calendar CSV --
    setupZmanimCSV();

  }

  // ---------- Save ----------
  // שמירה ישירה למסד. הפרסום מיידי — הצג מזהה גרסה חדשה תוך דקות ומתרענן לבד.
  async function saveAll() {
    if (!state.dirty) { status('אין שינויים לשמור'); return; }

    const btn = qs('#save-all-btn');
    btn.disabled = true;
    btn.textContent = 'שומר...';

    const sections = [
      ['config', state.data.config],
      ['rooms', state.data.rooms],
      ['memorial', state.data.memorial],
      ['announcements', state.data.announcements],
      ['special-times', state.data.specialTimes],
      ['zmanim-calendar', state.data.zmanimCalendar],
      ['media-playlist', state.data.mediaPlaylist],
      ['screens', state.data.screens],
      ['dedications', state.data.dedications],
      ['shiurim', state.data.shiurim],
      ['texts', state.data.texts],
    ];

    try {
      for (const [section, data] of sections) {
        await Api.saveSection(section, data);
      }
      markClean();
      renderHome();
      status('נשמר ופורסם ✓', 'success');
      const when = new Date().toLocaleString('he-IL');
      qs('#last-save-status').textContent = `נשמר בהצלחה ב־${when}. הצג יתעדכן תוך עד 3 דקות.`;
      Api.me().then(me => { state.me = me; renderIdentity(); }).catch(() => {});
    } catch (e) {
      if (e.status === 401) {
        status('פג תוקף החיבור — התחברו מחדש', 'error');
        qs('#app-view').style.display = 'none';
        qs('#login-view').style.display = '';
      } else {
        status(`שגיאה: ${e.message}`, 'error');
      }
      qs('#last-save-status').textContent = `שגיאה: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'שמירה ופרסום';
    }
  }

  // ---------- Zmanim calendar CSV ----------
  const ZMANIM_CSV_KEYS = [
    'alotHaShachar','misheyakir','sunrise',
    'sofZmanShmaMGA','sofZmanShma',
    'sofZmanTfillaMGA','sofZmanTfilla',
    'chatzot','minchaGedola','minchaKetana','plagHaMincha',
    'sunset','tzeit',
  ];

  function updateZmCsvCount() {
    const n = Object.keys(state.data.zmanimCalendar.entries || {}).length;
    const el = qs('#zm-csv-count');
    if (el) el.textContent = n ? `${n} תאריכים עם דריסות` : 'אין תאריכים בלוח השנתי';
  }

  function parseZmanimCsv(text) {
    const rows = parseCSV(text);
    if (!rows.length) return { entries: {}, errors: ['הקובץ ריק או לא תקין'] };
    const sample = rows[0];
    const headers = Object.keys(sample);
    const dateHeader = headers.find(h => /^(date|תאריך)$/i.test(h.trim()));
    if (!dateHeader) return { entries: {}, errors: ['חסר שדה "date" או "תאריך" בשורת הכותרת'] };

    const validKeys = headers.filter(h => ZMANIM_CSV_KEYS.includes(h.trim()));
    const unknown = headers.filter(h => h !== dateHeader && h.trim() && !ZMANIM_CSV_KEYS.includes(h.trim()));
    const errors = [];
    if (unknown.length) errors.push(`עמודות לא מוכרות: ${unknown.join(', ')}`);

    const entries = {};
    for (const row of rows) {
      const date = String(row[dateHeader] || '').trim();
      if (!date) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`תאריך לא תקני: ${date}`);
        continue;
      }
      const override = {};
      for (const k of validKeys) {
        const v = String(row[k] || '').trim();
        if (!v) continue;
        if (!/^\d{1,2}:\d{2}$/.test(v)) {
          errors.push(`שעה לא תקנית בעמודה ${k} בתאריך ${date}: ${v}`);
          continue;
        }
        const [hh, mm] = v.split(':');
        override[k.trim()] = `${hh.padStart(2,'0')}:${mm.padStart(2,'0')}`;
      }
      if (Object.keys(override).length) entries[date] = override;
    }
    return { entries, errors };
  }

  function buildZmanimCsv(entries) {
    const dates = Object.keys(entries).sort();
    const header = ['date', ...ZMANIM_CSV_KEYS];
    const esc = (v) => {
      v = v == null ? '' : String(v);
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const lines = [header.map(esc).join(',')];
    for (const d of dates) {
      const row = [d, ...ZMANIM_CSV_KEYS.map(k => entries[d][k] || '')];
      lines.push(row.map(esc).join(','));
    }
    return lines.join('\n');
  }

  function buildZmanimSample() {
    const header = ['date', ...ZMANIM_CSV_KEYS];
    const lines = [header.join(',')];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight local
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      lines.push([iso, ...ZMANIM_CSV_KEYS.map(() => '')].join(','));
    }
    return lines.join('\n');
  }

  function setupZmanimCSV() {
    const fileInp = qs('#zm-csv-file');
    const doImport = async (file, mode) => {
      if (!file) return;
      const text = await file.text();
      const { entries, errors } = parseZmanimCsv(text);
      const count = Object.keys(entries).length;
      if (errors.length && !count) {
        alert('כשל בטעינה:\n' + errors.slice(0, 10).join('\n'));
        return;
      }
      if (!count) { status('לא זוהו דריסות בקובץ', 'error'); return; }

      const msg = mode === 'replace'
        ? `להחליף את הלוח השנתי ב־${count} תאריכים חדשים (המחיקה היא מקומית עד שתלחצו שמירה)?`
        : `למזג ${count} תאריכים חדשים עם ${Object.keys(state.data.zmanimCalendar.entries).length} הקיימים?`;
      if (!confirm(msg)) return;

      if (mode === 'replace') state.data.zmanimCalendar.entries = {};
      Object.assign(state.data.zmanimCalendar.entries, entries);

      if (errors.length) {
        status(`נטען עם ${errors.length} אזהרות`, 'error');
        console.warn('Zmanim CSV warnings:', errors);
      } else {
        status(`נטענו ${count} תאריכים — לחצו "שמירה ופרסום"`, 'success');
      }
      markDirty();
      updateZmCsvCount();
    };

    fileInp.addEventListener('change', (e) => {
      doImport(e.target.files[0], 'merge');
      e.target.value = ''; // allow re-selecting same file
    });

    qs('#zm-csv-replace').addEventListener('click', () => {
      const f = fileInp.files && fileInp.files[0];
      if (!f) {
        // Trigger file picker first, then replace
        fileInp.addEventListener('change', function once(e) {
          fileInp.removeEventListener('change', once);
          doImport(e.target.files[0], 'replace');
          e.target.value = '';
        }, { once: true });
        fileInp.click();
        return;
      }
      doImport(f, 'replace');
    });

    qs('#zm-csv-sample').addEventListener('click', () => {
      download('zmanim-calendar-template.csv', buildZmanimSample());
    });

    qs('#zm-csv-download').addEventListener('click', () => {
      const entries = state.data.zmanimCalendar.entries || {};
      if (!Object.keys(entries).length) {
        status('אין נתונים להורדה', 'error');
        return;
      }
      download('zmanim-calendar.csv', buildZmanimCsv(entries));
    });

    qs('#zm-csv-clear').addEventListener('click', () => {
      const n = Object.keys(state.data.zmanimCalendar.entries).length;
      if (!n) { status('הלוח השנתי כבר ריק'); return; }
      if (!confirm(`למחוק את כל ${n} התאריכים בלוח השנתי?`)) return;
      state.data.zmanimCalendar.entries = {};
      markDirty();
      updateZmCsvCount();
      status('הלוח השנתי נוקה — לחצו "שמירה ופרסום"');
    });

    updateZmCsvCount();
  }

  // ---------- Render all ----------
  function renderAll() {
    renderGeneral();
    renderDesign();
    renderHome();
    renderZmanim();
    renderRooms();
    renderMemorial();
    renderAnnouncements();
    renderSpecial();
    renderDedications();
    renderShiurim();
    renderTexts();
    updateZmCsvCount();
    if (qs('#sc-editor')) renderScreens();
    renderPlaylist();
  }

  // מכווץ את ה-iframe (1920×1080) לרוחב שהמכל בפועל מאפשר.
  // נקרא בטעינה, בשינוי גודל חלון ובמעבר ללשונית העיצוב — הרוחב הוא 0
  // כל עוד הלשונית מוסתרת, ואז אין מה לחשב.
  function scalePreview() {
    const ratio = ASPECT_RATIO[qs('#pv-aspect')?.value || '16:9'] || 16 / 9;
    for (const sel of ['#design-preview', '#wz-preview']) {
      const pv = qs(sel);
      const box = pv && pv.parentElement;
      if (!box) continue;
      if (sel === '#design-preview') box.style.aspectRatio = `${ratio}`;
      const w = box.clientWidth;
      if (!w) continue;
      // ה-iframe מרונדר ברוחב וירטואלי קבוע, והגובה נגזר מהיחס שנבחר,
      // כך שהצג נראה בדיוק כמו על המסך האמיתי.
      const r = sel === '#design-preview' ? ratio : (ASPECT_RATIO[state.data.screens?.aspect] || 16 / 9);
      if (sel === '#wz-preview') box.style.aspectRatio = `${r}`;
      const vw = 1920;
      const vh = Math.round(vw / r);
      pv.style.width = vw + 'px';
      pv.style.height = vh + 'px';
      pv.style.transform = `scale(${w / vw})`;
    }
  }

  // התצוגה המקדימה מציגה את היחס האמיתי של המסך בבית הכנסת
  const ASPECT_RATIO = { '16:9': 16/9, '16:10': 16/10, '4:3': 4/3, '21:9': 21/9, '9:16': 9/16, '3:4': 3/4 };

  function setupPreviewAspect() {
    const sel = qs('#pv-aspect');
    if (!sel) return;
    sel.addEventListener('change', scalePreview);
  }

  // ================= עורך המסכים =================

  const GRID = { cols: 24, rows: 18 };

  const BLOCK_TYPES = Object.fromEntries(P.BLOCKS.map(b => [b.type, b.name]));
  const BLOCK_DESC = Object.fromEntries(P.BLOCKS.map(b => [b.type, b.desc]));

  // סוגים שאפשר להוסיף רק פעם אחת למסך — הם עוטפים אלמנט יחיד בדף
  const SINGLE_USE = new Set(P.BLOCKS.filter(b => b.single).map(b => b.type));

  const ASPECTS = ['16:9', '16:10', '4:3', '21:9', '9:16', '3:4'];

  function defaultScreens() {
    return {
      enabled: false,
      aspect: '16:9',
      screens: [{
        id: 'main', name: 'מסך ראשי', seconds: 20,
        blocks: [
          { id: 'b-header', type: 'header',        x: 0,  y: 0,  w: 24, h: 3 },
          { id: 'b-zmanim', type: 'zmanim',        x: 16, y: 3,  w: 8,  h: 11 },
          { id: 'b-tef',    type: 'tefillot',      x: 8,  y: 3,  w: 8,  h: 11 },
          { id: 'b-mem',    type: 'memorial',      x: 0,  y: 3,  w: 8,  h: 11 },
          { id: 'b-ment',   type: 'mentions',      x: 0,  y: 14, w: 24, h: 1 },
          { id: 'b-ann',    type: 'announcements', x: 0,  y: 15, w: 24, h: 2 },
          { id: 'b-up',     type: 'upcoming',      x: 0,  y: 17, w: 24, h: 1 },
        ],
      }],
    };
  }

  let scActive = 0;      // המסך שנערך כרגע
  let scSelected = null; // מזהה הקובייה הנבחרת

  const scData = () => state.data.screens;
  const scScreen = () => scData().screens[scActive];

  function renderScreens() {
    const wrap = qs('#sc-editor');
    if (!wrap) return;
    const data = scData();

    qs('#sc-enabled').checked = !!data.enabled;
    qs('#sc-aspect').value = data.aspect || '16:9';
    qs('#sc-canvas-wrap').style.setProperty('--sc-aspect', (data.aspect || '16:9').replace(':', ' / '));

    // לשוניות המסכים
    const tabs = qs('#sc-tabs');
    tabs.innerHTML = '';
    data.screens.forEach((s, i) => {
      tabs.appendChild(el('button', {
        class: `sc-tab${i === scActive ? ' active' : ''}`,
        title: screenHasWhen(s) ? 'למסך הזה יש תזמון' : '',
        onclick: () => { scActive = i; scSelected = null; renderScreens(); },
      }, `${s.name || `מסך ${i + 1}`}${screenHasWhen(s) ? ' ⏱' : ''}`));
    });
    tabs.appendChild(el('button', {
      class: 'sc-tab', title: 'הוספת מסך',
      onclick: addScreen,
    }, '+ מסך'));

    const screen = scScreen();
    qs('#sc-name').value = screen.name || '';
    qs('#sc-seconds').value = screen.seconds || 20;
    qs('#sc-del').disabled = data.screens.length <= 1;
    renderScreenWhen(screen);

    renderTemplates();
    renderPalette();
    renderCanvas();
    renderBlockProps();
    pushScreensPreview();
  }

  // ---------- מתי המסך מוצג ----------
  const screenHasWhen = (s) => !!(
    (Array.isArray(s?.days) && s.days.length && s.days.length < 7) ||
    s?.from || s?.to || s?.fromTime || s?.toTime);

  function renderScreenWhen(screen) {
    const box = qs('#sc-when');
    if (!box) return;
    box.innerHTML = '';
    box.appendChild(el('b', {}, 'מתי להציג:'));

    // ימים — ריק או כל השבעה = תמיד
    const active = Array.isArray(screen.days) ? screen.days.map(Number).filter(d => d >= 0 && d <= 6) : [];
    const days = el('div', { class: 'tm-days' });
    DOW_LABELS.forEach((label, d) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = active.length === 0 || active.includes(d);
      const lab = el('label', { class: cb.checked ? 'on' : '' }, cb, label);
      cb.addEventListener('change', () => {
        let list = active.length ? [...active] : [0, 1, 2, 3, 4, 5, 6];
        list = cb.checked ? [...new Set([...list, d])] : list.filter(x => x !== d);
        if (list.length === 7 || !list.length) delete screen.days; else screen.days = list.sort();
        markDirty(); renderScreens();
      });
      days.appendChild(lab);
    });
    box.appendChild(days);

    const field = (label, key, type) => {
      const inp = el('input', { type });
      inp.value = screen[key] || '';
      inp.addEventListener('change', () => {
        if (inp.value) screen[key] = inp.value; else delete screen[key];
        markDirty(); renderScreens();
      });
      return el('label', {}, label, inp);
    };
    box.appendChild(field('מתאריך', 'from', 'date'));
    box.appendChild(field('עד תאריך', 'to', 'date'));
    box.appendChild(field('משעה', 'fromTime', 'time'));
    box.appendChild(field('עד שעה', 'toTime', 'time'));

    if (screenHasWhen(screen)) {
      box.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm sc-clear', type: 'button',
        onclick: () => {
          for (const k of ['days', 'from', 'to', 'fromTime', 'toTime']) delete screen[k];
          markDirty(); renderScreens();
        },
      }, 'הצגה תמיד'));
    }
    box.appendChild(el('div', { class: 'sc-when-hint' },
      'ריק = תמיד. למשל: רק שבת — מסמנים "ש" בלבד; שבוע מסוים — ממלאים מתאריך ועד תאריך. ' +
      'היום מתחלף בשקיעה, כך ש"שבת" כולל את ליל שבת. אם אף מסך לא מתוזמן לעכשיו, מוצגים המסכים שבלי תזמון.'));
  }

  // תבניות מוכנות — סידור קוביות בלחיצה אחת (js/presets.js)
  function templateCard(t, active, onClick) {
    const thumb = el('div', { class: 'tpl-thumb', 'data-aspect': t.aspect || '16:9' });
    for (const b of t.blocks) {
      const i = el('i', { 'data-type': b.type });
      i.style.left = `${(b.x / GRID.cols) * 100}%`;
      i.style.top = `${(b.y / GRID.rows) * 100}%`;
      i.style.width = `${(b.w / GRID.cols) * 100}%`;
      i.style.height = `${(b.h / GRID.rows) * 100}%`;
      thumb.appendChild(i);
    }
    return el('button', { class: `tpl-card${active ? ' active' : ''}`, type: 'button', onclick: onClick },
      thumb, el('div', { class: 'tpl-name' }, t.name), el('div', { class: 'tpl-desc' }, t.desc));
  }

  function renderTemplates() {
    const grid = qs('#sc-templates');
    if (!grid) return;
    grid.innerHTML = '';
    for (const t of P.SCREEN_TEMPLATES) grid.appendChild(templateCard(t, false, () => applyTemplate(t)));
  }

  // מחיל תבנית על המסך הנוכחי ומדליק את מצב המסכים
  function applyTemplateSilent(t) {
    const data = scData();
    const s = scScreen();
    s.blocks = t.blocks.map(b => ({ ...b, id: `b-${b.type}-${Math.random().toString(36).slice(2, 7)}` }));
    if (t.aspect) data.aspect = t.aspect;
    data.enabled = true;
    scSelected = null;
    markDirty();
    if (qs('#sc-editor')) renderScreens();
    pushScreensPreview();
  }

  function applyTemplate(t) {
    const s = scScreen();
    if (s.blocks.length > 1 && !confirm(`להחליף את הפריסה של "${s.name}" בתבנית "${t.name}"?`)) return;
    applyTemplateSilent(t);
    status(`התבנית "${t.name}" הוחלה על "${s.name}"`, 'success');
  }

  function renderPalette() {
    const pal = qs('#sc-palette');
    const used = new Set(scScreen().blocks.map(b => b.type));
    pal.innerHTML = '';
    for (const [type, label] of Object.entries(BLOCK_TYPES)) {
      pal.appendChild(el('button', {
        disabled: SINGLE_USE.has(type) && used.has(type) ? 'disabled' : null,
        onclick: () => addBlock(type), title: BLOCK_DESC[type] || '',
      }, `+ ${label}`, el('small', {}, BLOCK_DESC[type] || '')));
    }
  }

  function renderCanvas() {
    const canvas = qs('#sc-canvas');
    canvas.innerHTML = '';
    for (const b of scScreen().blocks) {
      const div = el('div', {
        class: `sc-block${b.id === scSelected ? ' selected' : ''}`,
        'data-id': b.id, 'data-type': b.type,
      });
      div.style.left   = `${(b.x / GRID.cols) * 100}%`;
      div.style.top    = `${(b.y / GRID.rows) * 100}%`;
      div.style.width  = `${(b.w / GRID.cols) * 100}%`;
      div.style.height = `${(b.h / GRID.rows) * 100}%`;
      if (typeof b.opacity === 'number') div.style.opacity = String(Math.max(0.15, b.opacity));
      div.appendChild(el('span', { class: 'sc-label' },
        BLOCK_TYPES[b.type] || b.type,
        el('span', { class: 'sc-size', dir: 'ltr' }, `${b.w}×${b.h}`)));
      div.appendChild(el('div', { class: 'sc-handle' }));
      canvas.appendChild(div);
    }
    bindDrag();
  }

  // גרירה ושינוי גודל בעכבר ובמגע. הצמדה לרשת 24×18.
  function bindDrag() {
    const canvas = qs('#sc-canvas');

    canvas.querySelectorAll('.sc-block').forEach(div => {
      div.addEventListener('pointerdown', (ev) => {
        const id = div.dataset.id;
        const block = scScreen().blocks.find(b => b.id === id);
        if (!block) return;

        scSelected = id;
        renderBlockProps();
        canvas.querySelectorAll('.sc-block').forEach(d => d.classList.toggle('selected', d === div));

        const resizing = ev.target.classList.contains('sc-handle');
        const rect = canvas.getBoundingClientRect();
        const cellW = rect.width / GRID.cols;
        const cellH = rect.height / GRID.rows;
        const start = { px: ev.clientX, py: ev.clientY, x: block.x, y: block.y, w: block.w, h: block.h };

        div.classList.add('dragging');
        div.setPointerCapture(ev.pointerId);
        ev.preventDefault();

        const onMove = (e) => {
          const dx = Math.round((e.clientX - start.px) / cellW);
          const dy = Math.round((e.clientY - start.py) / cellH);
          if (resizing) {
            // הידית יושבת על הפינה הימנית-תחתונה של הקובייה (inset-inline-start ב-RTL),
            // והקובייה מעוגנת בשמאל (style.left). לכן גרירה החוצה — ימינה ולמטה — מגדילה.
            block.w = Math.min(GRID.cols - block.x, Math.max(1, start.w + dx));
            block.h = Math.min(GRID.rows - block.y, Math.max(1, start.h + dy));
          } else {
            block.x = Math.min(GRID.cols - block.w, Math.max(0, start.x + dx));
            block.y = Math.min(GRID.rows - block.h, Math.max(0, start.y + dy));
          }
          div.style.left   = `${(block.x / GRID.cols) * 100}%`;
          div.style.top    = `${(block.y / GRID.rows) * 100}%`;
          div.style.width  = `${(block.w / GRID.cols) * 100}%`;
          div.style.height = `${(block.h / GRID.rows) * 100}%`;
          const size = div.querySelector('.sc-size');
          if (size) size.textContent = `${block.w}×${block.h}`;   // dir=ltr נקבע ברינדור
        };

        const onUp = () => {
          div.classList.remove('dragging');
          div.removeEventListener('pointermove', onMove);
          div.removeEventListener('pointerup', onUp);
          markDirty();
          renderBlockProps();
          pushScreensPreview();
        };

        div.addEventListener('pointermove', onMove);
        div.addEventListener('pointerup', onUp);
      });
    });
  }

  // קוביות שמציגות כותרת — הערך הוא כותרת ברירת המחדל בצג
  const BLOCK_DEFAULT_TITLE = {
    zmanim: 'זמני היום', tefillot: 'זמני תפילות', memorial: 'לעילוי נשמת',
    shabbat: 'שבת קודש', today: 'היום', learning: 'לימוד יומי',
    dedications: 'הקדשות וברכות', shiurim: 'שיעורים', weather: 'מזג אוויר',
    text: 'בלי כותרת', omer: 'בלי כותרת', countdown: 'בלי כותרת',
    clock: 'בלי כותרת', date: 'בלי כותרת',
  };

  // מראות של קוביית השעון — הציור עצמו ב-display.js
  const CLOCK_FACES = {
    digital: [['plain', 'רגיל'], ['thin', 'דק'], ['seven', 'לד (שעון מעורר)'], ['flip', 'קלפים מתהפכים']],
    analog: [['classic', 'קלאסי (שנתות)'], ['numbers', 'ספרות'], ['roman', 'ספרות רומיות'], ['hebrew', 'אותיות עבריות'], ['minimal', 'מינימלי'], ['modern', 'מודרני (נקודות)']],
  };

  function renderBlockProps() {
    const box = qs('#sc-props');
    const block = scScreen().blocks.find(b => b.id === scSelected);
    if (!block) {
      box.innerHTML = '<div class="sc-hint">בחרו קובייה בלוח כדי לערוך אותה. גוררים כדי להזיז, ומושכים את הריבוע הכחול כדי לשנות גודל.</div>';
      return;
    }
    box.innerHTML = '';
    box.appendChild(el('strong', {}, BLOCK_TYPES[block.type] || block.type));

    const num = (label, key, min, max) => {
      const inp = el('input', { type: 'number', min: String(min), max: String(max), value: String(block[key]) });
      inp.addEventListener('input', () => {
        const v = Math.max(min, Math.min(max, parseInt(inp.value, 10) || min));
        block[key] = v;
        markDirty(); renderCanvas(); pushScreensPreview();
      });
      return el('label', { class: 'sc-prop' }, label, inp);
    };
    box.appendChild(num('משמאל', 'x', 0, GRID.cols - 1));
    box.appendChild(num('מלמעלה', 'y', 0, GRID.rows - 1));
    box.appendChild(num('רוחב', 'w', 1, GRID.cols));
    box.appendChild(num('גובה', 'h', 1, GRID.rows));

    const op = el('input', {
      type: 'range', min: '20', max: '100', step: '5',
      value: String(Math.round((block.opacity ?? 1) * 100)),
    });
    op.addEventListener('input', () => {
      block.opacity = parseInt(op.value, 10) / 100;
      markDirty(); renderCanvas(); pushScreensPreview();
    });
    box.appendChild(el('label', { class: 'sc-prop' }, 'שקיפות', op));

    const float = el('input', { type: 'checkbox' });
    float.checked = !!block.floating;
    float.addEventListener('change', () => {
      block.floating = float.checked;
      markDirty(); pushScreensPreview();
    });
    box.appendChild(el('label', { class: 'sc-prop' }, 'צף מעל השאר', float));

    if (BLOCK_DEFAULT_TITLE[block.type] !== undefined) {
      const t = el('input', { type: 'text', placeholder: BLOCK_DEFAULT_TITLE[block.type] });
      t.value = typeof block.title === 'string' ? block.title : '';
      t.addEventListener('input', () => {
        const v = t.value.trim();
        if (v) block.title = t.value; else delete block.title;
        markDirty(); pushScreensPreview();
      });
      box.appendChild(el('label', { class: 'sc-prop' }, 'כותרת', t));
    }

    if (block.type === 'clock') {
      const analog = block.variant === 'analog';
      const v = el('select', {});
      v.appendChild(el('option', { value: 'digital' }, 'דיגיטלי'));
      v.appendChild(el('option', { value: 'analog' }, 'אנלוגי (מחוגים)'));
      v.value = analog ? 'analog' : 'digital';
      v.addEventListener('change', () => {
        block.variant = v.value; delete block.face;
        markDirty(); renderBlockProps(); pushScreensPreview();
      });
      box.appendChild(el('label', { class: 'sc-prop' }, 'סוג שעון', v));

      const faces = analog ? CLOCK_FACES.analog : CLOCK_FACES.digital;
      const f = el('select', {});
      for (const [k, label] of faces) f.appendChild(el('option', { value: k }, label));
      f.value = faces.some(([k]) => k === block.face) ? block.face : faces[0][0];
      f.addEventListener('change', () => { block.face = f.value; markDirty(); pushScreensPreview(); });
      box.appendChild(el('label', { class: 'sc-prop' }, 'מראה', f));

      const sec = el('input', { type: 'checkbox' });
      sec.checked = block.seconds !== false;
      sec.addEventListener('change', () => { block.seconds = sec.checked; markDirty(); pushScreensPreview(); });
      box.appendChild(el('label', { class: 'sc-prop' }, analog ? 'מחוג שניות' : 'שניות', sec));

      if (!analog) {
        const dt = el('input', { type: 'checkbox' });
        dt.checked = !!block.showDate;
        dt.addEventListener('change', () => { block.showDate = dt.checked; markDirty(); pushScreensPreview(); });
        box.appendChild(el('label', { class: 'sc-prop' }, 'תאריך עברי מתחת', dt));
      }
    }

    if (block.type === 'media') {
      const fit = el('select', {});
      [['', 'לפי הגדרת חלון המודעות'], ['contain', 'כל המודעה נכנסת ללוח (בלי חיתוך)'], ['cover', 'ממלא את הלוח (עם חיתוך)']]
        .forEach(([v, l]) => fit.appendChild(el('option', { value: v }, l)));
      fit.value = block.fit === 'contain' || block.fit === 'cover' ? block.fit : '';
      fit.addEventListener('change', () => {
        if (fit.value) block.fit = fit.value; else delete block.fit;
        markDirty(); pushScreensPreview();
      });
      box.appendChild(el('label', { class: 'sc-prop' }, 'התאמה', fit));

      const page = el('select', {});
      [['portrait', 'לאורך (A4)'], ['landscape', 'לרוחב'], ['square', 'ריבועי'], ['fill', 'מותח לכל הלוח']]
        .forEach(([v, l]) => page.appendChild(el('option', { value: v }, l)));
      page.value = ['portrait', 'landscape', 'square', 'fill'].includes(block.page) ? block.page : 'portrait';
      page.addEventListener('change', () => { block.page = page.value; markDirty(); pushScreensPreview(); });
      box.appendChild(el('label', { class: 'sc-prop' }, 'צורת דף PDF', page));
      box.appendChild(el('div', { class: 'sc-hint' }, 'קובצי PDF מוצגים בשלמותם לפי צורת הדף שנבחרה. תמונות מותאמות לפי "התאמה".'));
    }

    if (block.type === 'header') {
      const clock = el('input', { type: 'checkbox' });
      clock.checked = block.showClock !== false;
      clock.addEventListener('change', () => {
        if (clock.checked) delete block.showClock; else block.showClock = false;
        markDirty(); pushScreensPreview();
      });
      box.appendChild(el('label', { class: 'sc-prop' }, 'שעון', clock));

      const sub = el('input', { type: 'checkbox' });
      sub.checked = block.showSub !== false;
      sub.addEventListener('change', () => {
        if (sub.checked) delete block.showSub; else block.showSub = false;
        markDirty(); pushScreensPreview();
      });
      box.appendChild(el('label', { class: 'sc-prop' }, 'תאריך, פרשה ושורת היום', sub));
      box.appendChild(el('div', { class: 'sc-hint' }, 'כיבוי שניהם משאיר את שם בית הכנסת בלבד — נוח כשיש קוביית שעון נפרדת.'));
    }

    if (block.type === 'decor') {
      const pick = el('select', {});
      for (const a of (window.ShulDecor?.ASSETS || [])) pick.appendChild(el('option', { value: `asset:${a.id}` }, a.name));
      const images = state.media.filter(m => m.kind === 'image');
      if (images.length) {
        const grp = el('optgroup', { label: 'תמונות שהעליתם' });
        for (const m of images) grp.appendChild(el('option', { value: `url:${m.url}` }, m.filename));
        pick.appendChild(grp);
      }
      pick.value = block.url ? `url:${block.url}` : `asset:${block.asset || 'menorah'}`;
      if (!pick.value) pick.value = 'asset:menorah';
      pick.addEventListener('change', () => {
        const [kind, ...rest] = pick.value.split(':'); const v = rest.join(':');
        if (kind === 'url') { block.url = v; delete block.asset; } else { block.asset = v; delete block.url; }
        markDirty(); pushScreensPreview();
      });
      box.appendChild(el('label', { class: 'sc-prop' }, 'אלמנט', pick));

      const flip = el('input', { type: 'checkbox' });
      flip.checked = !!block.flip;
      flip.addEventListener('change', () => { block.flip = flip.checked; markDirty(); pushScreensPreview(); });
      box.appendChild(el('label', { class: 'sc-prop' }, 'היפוך אופקי', flip));

      const anchor = el('select', {});
      [['', 'במרכז'], ['bottom', 'צמוד למטה'], ['top', 'צמוד למעלה']].forEach(([v, l]) => anchor.appendChild(el('option', { value: v }, l)));
      anchor.value = block.anchor || '';
      anchor.addEventListener('change', () => { if (anchor.value) block.anchor = anchor.value; else delete block.anchor; markDirty(); pushScreensPreview(); });
      box.appendChild(el('label', { class: 'sc-prop' }, 'יישור', anchor));
      box.appendChild(el('div', { class: 'sc-hint' }, 'תמונה עם רקע שקוף (PNG) מלשונית "קבצים ומדיה" מופיעה כאן ברשימה. "צף מעל השאר" נותן לאלמנט לחפוף ללוחות.'));
    }

    box.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm btn-danger',
      onclick: () => {
        const s = scScreen();
        s.blocks = s.blocks.filter(b => b.id !== block.id);
        scSelected = null;
        markDirty(); renderScreens();
      },
    }, 'הסרת הקובייה'));
  }

  function addBlock(type) {
    const s = scScreen();
    const id = `b-${type}-${Math.random().toString(36).slice(2, 7)}`;
    s.blocks.push(type === 'decor'
      ? { id, type, x: 10, y: 7, w: 4, h: 4, asset: 'menorah', floating: true }
      : { id, type, x: 6, y: 6, w: 8, h: 5 });
    scSelected = id;
    markDirty(); renderScreens();
  }

  function addScreen() {
    const data = scData();
    data.screens.push({
      id: `s-${Math.random().toString(36).slice(2, 7)}`,
      name: `מסך ${data.screens.length + 1}`,
      seconds: 20,
      blocks: [{ id: `b-h-${Math.random().toString(36).slice(2,6)}`, type: 'header', x: 0, y: 0, w: 24, h: 3 }],
    });
    scActive = data.screens.length - 1;
    scSelected = null;
    markDirty(); renderScreens();
  }

  // דוחף את מצב העריכה לתצוגה המקדימה בלי לשמור
  function pushScreensPreview() {
    const iframe = qs('#design-preview');
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'PREVIEW_SCREENS',
      screens: state.data.screens,
      mediaPlaylist: state.data.mediaPlaylist,
      screenIndex: scActive,
    }, location.origin);
  }

  function setupScreens() {
    if (!qs('#sc-editor')) return;

    qs('#sc-enabled').addEventListener('change', (e) => {
      scData().enabled = e.target.checked;
      markDirty(); pushScreensPreview();
    });
    qs('#sc-aspect').addEventListener('change', (e) => {
      scData().aspect = e.target.value;
      markDirty(); renderScreens();
    });
    qs('#sc-name').addEventListener('input', (e) => {
      scScreen().name = e.target.value;
      markDirty();
    });
    qs('#sc-seconds').addEventListener('input', (e) => {
      scScreen().seconds = Math.max(3, parseInt(e.target.value, 10) || 20);
      markDirty();
    });
    qs('#sc-del').addEventListener('click', () => {
      const data = scData();
      if (data.screens.length <= 1) return;
      if (!confirm(`למחוק את "${scScreen().name}"?`)) return;
      data.screens.splice(scActive, 1);
      scActive = 0; scSelected = null;
      markDirty(); renderScreens();
    });
  }

  // ---------- מדיה ----------
  const fmtSize = (n) =>
    n < 1024 ? `${n} B`
    : n < 1048576 ? `${(n / 1024).toFixed(0)} KB`
    : `${(n / 1048576).toFixed(1)} MB`;

  async function renderMedia() {
    const wrap = qs('#media-list');
    if (!wrap) return;
    const res = await Api.listMedia();
    state.media = res.items || [];

    const bar = qs('#media-quota');
    if (bar) {
      const pct = Math.min(100, Math.round((res.quota.used / res.quota.limit) * 100));
      bar.textContent = `${fmtSize(res.quota.used)} מתוך ${fmtSize(res.quota.limit)} (${pct}%)`;
    }

    wrap.innerHTML = '';
    renderLogoPicker();
    renderBgGrid();
    if (qs('#wizard-view').style.display !== 'none' && wzStep === 3) renderBgGrid('#wz-bg-grid', wzFill3);
    if (!state.media.length) {
      wrap.appendChild(el('p', { class: 'desc' }, 'עדיין לא הועלו קבצים.'));
      return;
    }

    for (const item of state.media) {
      const preview = item.kind === 'image'
        ? el('img', { src: item.url, alt: item.filename, class: 'media-thumb' })
        : el('div', { class: 'media-thumb media-thumb-doc' }, 'PDF');

      const isBg = (state.data.config.design?.backgroundImage || '') === item.url;
      const inMp = inPlaylist(item.url);

      wrap.appendChild(el('div', { class: 'media-item' },
        preview,
        el('div', { class: 'media-meta' },
          el('strong', {}, item.filename),
          el('span', { class: 'desc' },
            `${fmtSize(item.size)} · ${new Date(item.created_at).toLocaleDateString('he-IL')} · ${item.created_by || ''}`),
          el('div', { class: 'media-actions' },
            el('a', { class: 'btn btn-ghost btn-sm', href: item.url, target: '_blank' }, 'פתיחה'),
            el('button', {
              class: 'btn btn-ghost btn-sm',
              onclick: () => togglePlaylist(item),
            }, inMp ? 'הסרה מחלון המודעות' : 'הוספה לחלון המודעות'),
            item.kind === 'image'
              ? el('button', {
                  class: 'btn btn-ghost btn-sm',
                  onclick: () => {
                    state.data.config.design = state.data.config.design || {};
                    state.data.config.design.backgroundImage = isBg ? '' : item.url;
                    markDirty();
                    renderDesign();
                    pushDesignPreview();
                    renderMedia();
                    status(isBg ? 'הוסר רקע הצג' : 'הוגדר כרקע הצג — לחצו "שמירה ופרסום"', 'success');
                  },
                }, isBg ? 'הסרה מרקע הצג' : 'הגדרה כרקע הצג')
              : null,
            el('button', {
              class: 'btn btn-ghost btn-sm btn-danger',
              onclick: async () => {
                if (!confirm(`למחוק את "${item.filename}"?`)) return;
                try {
                  await Api.deleteMedia(item.id);
                  status('נמחק', 'success');
                  renderMedia();
                } catch (e) { status(e.message, 'error'); }
              },
            }, 'מחיקה'),
          ),
        ),
      ));
    }
  }

  // ---------- חלון המודעות + לוגו ----------
  const inPlaylist = (url) =>
    (state.data.mediaPlaylist.entries || []).some(e => e.url === url);

  function togglePlaylist(item) {
    const list = state.data.mediaPlaylist.entries;
    const i = list.findIndex(e => e.url === item.url);
    if (i >= 0) list.splice(i, 1);
    else list.push({ url: item.url, kind: item.kind, name: item.filename });
    markDirty();
    renderPlaylist();
    renderMedia();
  }

  function renderPlaylist() {
    const box = qs('#mp-list');
    if (!box) return;
    const mp = state.data.mediaPlaylist;
    const secs = qs('#mp-seconds'), fit = qs('#mp-fit');
    if (secs) secs.value = mp.seconds || 12;
    if (fit) fit.value = mp.fit || 'contain';

    box.innerHTML = '';
    if (!mp.entries.length) {
      box.appendChild(el('div', { class: 'sc-hint' },
        'עדיין לא נבחרו מודעות. סמנו קבצים ברשימה שלמטה.'));
      return;
    }
    mp.entries.forEach((e, i) => {
      box.appendChild(el('div', { class: 'mp-row' },
        el('span', {}, `${i + 1}. ${e.name || e.url} ${e.kind === 'pdf' ? '(PDF)' : ''}`),
        el('button', {
          class: 'btn btn-ghost btn-sm',
          onclick: () => {
            if (i === 0) return;
            const [x] = mp.entries.splice(i, 1);
            mp.entries.splice(i - 1, 0, x);
            markDirty(); renderPlaylist();
          },
        }, '↑'),
        el('button', {
          class: 'btn btn-ghost btn-sm btn-danger',
          onclick: () => { mp.entries.splice(i, 1); markDirty(); renderPlaylist(); renderMedia(); },
        }, 'הסרה'),
      ));
    });
  }

  function setupPlaylist() {
    const secs = qs('#mp-seconds'), fit = qs('#mp-fit');
    if (secs) secs.addEventListener('input', () => {
      state.data.mediaPlaylist.seconds = Math.max(3, parseInt(secs.value, 10) || 12);
      markDirty();
    });
    if (fit) fit.addEventListener('change', () => {
      state.data.mediaPlaylist.fit = fit.value;
      markDirty();
    });
  }

  function renderLogoPicker() {
    const sel = qs('#d-logo');
    if (!sel) return;
    const current = state.data.config.design?.logo?.url || '';
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, '— ללא לוגו —'));
    state.media.filter(m => m.kind === 'image').forEach(m => {
      sel.appendChild(el('option', { value: m.url }, m.filename));
    });
    sel.value = current;
    if (!sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.addEventListener('change', () => {
        state.data.config.design.logo = { url: sel.value };
        markDirty();
        pushDesignPreview();
      });
    }
  }

  function setupMedia() {
    const input = qs('#media-file');
    if (!input) return;
    const prog = qs('#media-progress');

    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.value = '';
      for (const file of files) {
        try {
          prog.textContent = `מעלה את ${file.name}… 0%`;
          await Api.uploadMedia(file, p => { prog.textContent = `מעלה את ${file.name}… ${p}%`; });
          prog.textContent = '';
          status(`${file.name} הועלה`, 'success');
        } catch (e) {
          prog.textContent = '';
          status(`${file.name}: ${e.message}`, 'error');
        }
      }
      renderMedia();
    });
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    // מילוי מוקדם של טופס הכניסה (בלי סיסמה)
    qs('#login-slug').value = new URLSearchParams(location.search).get('shul')
      || localStorage.getItem(LS_SLUG) || '';
    qs('#login-gabbai').value = localStorage.getItem(LS_GABBAI) || '';

    // אם כבר יש סשן פעיל — נכנסים ישר, בלי להקליד שוב
    enterApp().catch(() => {});

    qs('#login-btn').addEventListener('click', handleLogin);
    qs('#login-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    qs('#logout-btn').addEventListener('click', logout);
    qs('#save-all-btn').addEventListener('click', saveAll);
    qs('#save-float-btn').addEventListener('click', saveAll);

    qs('#add-room-btn').addEventListener('click', () => {
      const next = state.data.rooms.rooms.length + 1;
      const room = normalizeRoom({
        id: `room-${next}`,
        name: `חדר ${next}`,
      });
      state.data.rooms.rooms.push(room);
      markDirty(); renderRooms();
    });

    qs('#add-mem-btn').addEventListener('click', () => {
      state.data.memorial.entries.push({ name: '', hebrewDay: 0, hebrewMonth: '', notes: '' });
      markDirty(); renderMemorial();
    });
    qs('#add-ann-btn').addEventListener('click', () => {
      state.data.announcements.entries.push({ text: '', startDate: '', endDate: '' });
      markDirty(); renderAnnouncements();
    });
    qs('#add-sp-btn').addEventListener('click', () => {
      state.data.specialTimes.entries.push({
        id: String(Math.random()).slice(2),
        name: '',
        dateType: 'hebrew',
        date: '',
        hebrewDay: 0,
        hebrewMonth: '',
        times: [{ roomId: '', label: 'שחרית', time: '' }],
      });
      markDirty(); renderSpecial();
    });

    setupMedia();

    qs('#add-ded-btn').addEventListener('click', () => {
      state.data.dedications.entries.push({ type: 'neshama', text: '', from: '', startDate: '', endDate: '' });
      markDirty(); renderDedications();
    });
    qs('#add-shiur-btn').addEventListener('click', () => {
      state.data.shiurim.entries.push({ title: '', lecturer: '', days: [], time: '', place: '' });
      markDirty(); renderShiurim();
    });
    qs('#add-text-btn').addEventListener('click', () => {
      state.data.texts.entries.push({ title: '', body: '' });
      markDirty(); renderTexts();
    });

    bindGeneral();
    bindDesign();
    bindFeatures();
    setupWizard();
    setupTour();
    setupTabs();
    setupCSV();
    setupScreens();
    setupPlaylist();
    setupPreviewAspect();

    window.addEventListener('beforeunload', (e) => {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  });
})();
