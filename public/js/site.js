// דף הבית: תצוגה מקדימה של הכתובת, בדיקת זמינות, והרשמה.

(() => {
  const $ = (id) => document.getElementById(id);

  // תעתיק עברי→לטיני. בלעדיו שם בעברית מייצר כתובת ריקה.
  // התוצאה היא הצעה בלבד — הגבאי תמיד יכול לערוך את השדה.
  const HEB = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'o', 'ז': 'z',
    'ח': 'ch', 'ט': 't', 'י': 'i', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
    'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'f',
    'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't',
  };

  const translit = (s) => String(s || '')
    .replace(/[֑-ׇ]/g, '')          // ניקוד וטעמים
    .replace(/["'׳״]/g, '')
    .replace(/[א-ת]/g, c => HEB[c] ?? '');

  const slugify = (s) => translit(s)
    .trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  let slugTouched = false;
  let checkTimer = null;

  function renderPreview() {
    const slug = slugify($('r-slug').value);
    $('r-preview').textContent = slug
      ? `${location.origin}/s/${slug}`
      : `${location.origin}/s/…`;
  }

  async function checkSlug() {
    const slug = slugify($('r-slug').value);
    const state = $('r-slug-state');
    if (!slug) { state.textContent = ''; state.className = 'slug-state'; return; }
    if (slug.length < 3) {
      state.textContent = 'לפחות 3 תווים';
      state.className = 'slug-state bad';
      return;
    }
    try {
      const res = await Api.checkSlug(slug);
      if (res.available) {
        state.textContent = '✓ הכתובת פנויה';
        state.className = 'slug-state ok';
      } else {
        state.textContent = res.reason === 'taken' ? '✗ הכתובת כבר תפוסה' : '✗ כתובת שמורה — בחרו אחרת';
        state.className = 'slug-state bad';
      }
    } catch {
      state.textContent = '';
      state.className = 'slug-state';
    }
  }

  function scheduleCheck() {
    renderPreview();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkSlug, 400);
  }

  async function register() {
    const msg = $('r-msg');
    const btn = $('r-submit');
    msg.textContent = '';
    msg.className = 'msg';

    const payload = {
      name: $('r-name').value.trim(),
      slug: slugify($('r-slug').value),
      gabbai: $('r-gabbai').value.trim(),
      password: $('r-password').value,
      contact: $('r-contact').value.trim(),
    };

    if (payload.name.length < 2) { fail('הזינו את שם בית הכנסת'); return; }
    if (payload.slug.length < 3) { fail('בחרו שם באנגלית, לפחות 3 תווים'); return; }
    if (payload.gabbai.length < 2) { fail('הזינו את שמכם'); return; }
    if (payload.password.length < 6) { fail('הסיסמה חייבת להיות באורך 6 תווים לפחות'); return; }

    btn.disabled = true;
    msg.textContent = 'פותח את בית הכנסת…';
    try {
      const res = await Api.register(payload);
      const displayUrl = `${location.origin}/s/${res.slug}`;
      msg.textContent = '';
      $('r-success').innerHTML = `
        <div class="success-box">
          <h3 style="margin:0 0 8px;">בית הכנסת נפתח ✓</h3>
          <p style="margin:0 0 10px;">כתובת הצג שלכם:<br><a href="${displayUrl}" target="_blank">${displayUrl}</a></p>
          <p style="margin:0 0 14px;" class="desc">שמרו את הקישור. אפשר לפתוח אותו על כל מסך בבית הכנסת.</p>
          <a class="btn btn-primary" href="/admin.html">להמשך ההקמה — 4 שלבים קצרים</a>
        </div>`;
      $('r-success').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      fail(e.message);
    } finally {
      btn.disabled = false;
    }

    function fail(text) {
      msg.textContent = text;
      msg.className = 'msg bad';
      btn.disabled = false;
    }
  }

  // באנר ההרצה: מוצג עד שסוגרים אותו, ואז נשאר סגור בדפדפן הזה
  const BANNER_KEY = 'sb_beta_banner_v1';
  function setupBanner() {
    const banner = $('beta-banner');
    if (!banner) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(BANNER_KEY) === '1'; } catch {}
    banner.hidden = dismissed;
    const link = $('beta-link');
    if (link && link.dataset.feedbackUrl) link.href = link.dataset.feedbackUrl;
    $('beta-close').addEventListener('click', () => {
      banner.hidden = true;
      try { localStorage.setItem(BANNER_KEY, '1'); } catch {}
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupBanner();
    renderPreview();

    $('r-name').addEventListener('input', () => {
      if (!slugTouched) { $('r-slug').value = slugify($('r-name').value); scheduleCheck(); }
    });
    $('r-slug').addEventListener('input', () => { slugTouched = true; scheduleCheck(); });
    $('r-submit').addEventListener('click', register);
    $('r-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') register(); });

    const missing = new URLSearchParams(location.search).get('missing');
    if (missing) {
      $('r-msg').textContent = `בית הכנסת "${missing}" לא נמצא. אפשר לפתוח אותו כאן.`;
      $('r-msg').className = 'msg bad';
      $('r-slug').value = missing;
      slugTouched = true;
      scheduleCheck();
      location.hash = '#register';
    }
  });
})();
