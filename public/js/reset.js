// שחזור סיסמה — שני מצבים באותו דף:
// בלי ?t=  → טופס בקשת קישור.  עם ?t=  → טופס קביעת סיסמה חדשה.
(() => {
  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    for (const s of ['rs-request', 'rs-set', 'rs-dead', 'rs-done']) $(s).hidden = s !== id;
  };

  const token = new URLSearchParams(location.search).get('t') || '';

  // ---------- שלב א׳: בקשת קישור ----------
  async function requestLink() {
    const btn = $('rs-send');
    const msg = $('rs-msg');
    const slug = $('rs-slug').value.trim();
    if (!slug) {
      msg.textContent = 'נא למלא את כתובת בית הכנסת';
      msg.className = 'msg bad';
      return;
    }
    btn.disabled = true;
    msg.textContent = 'שולח…';
    msg.className = 'msg';
    try {
      await Api.requestReset(slug);
      // התשובה זהה תמיד, גם לבית כנסת שלא קיים — ולכן גם ההודעה כאן כללית
      msg.innerHTML = 'אם לבית הכנסת הזה רשום מייל לשחזור, הקישור נשלח אליו עכשיו.<br>'
        + 'בדקו גם בתיקיית הספאם. הקישור תקף לשעה אחת.';
      msg.className = 'msg ok';
    } catch (e) {
      msg.textContent = e.message || 'השליחה נכשלה';
      msg.className = 'msg bad';
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- שלב ב׳: קביעת סיסמה ----------
  async function saveNew() {
    const btn = $('rs-save');
    const msg = $('rs-set-msg');
    const pass = $('rs-pass').value;
    const pass2 = $('rs-pass2').value;
    const fail = (t) => { msg.textContent = t; msg.className = 'msg bad'; };

    if (pass.length < 6) return fail('הסיסמה חייבת להיות באורך 6 תווים לפחות');
    if (pass !== pass2) return fail('שתי הסיסמאות לא זהות');

    btn.disabled = true;
    msg.textContent = 'קובע…';
    msg.className = 'msg';
    try {
      await Api.confirmReset({ token, password: pass });
      show('rs-done');
    } catch (e) {
      // 410 = הקישור פג או כבר שימש; אין טעם להשאיר את הטופס פתוח
      if (/פג תוקף|שימש/.test(e.message || '')) { $('rs-dead-msg').textContent = e.message; show('rs-dead'); }
      else fail(e.message || 'הקביעה נכשלה');
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('rs-send').addEventListener('click', requestLink);
    $('rs-slug').addEventListener('keydown', (e) => { if (e.key === 'Enter') requestLink(); });
    $('rs-save').addEventListener('click', saveNew);
    $('rs-pass2').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNew(); });

    if (!token) { show('rs-request'); $('rs-slug').focus(); return; }

    // בודקים את האסימון לפני שמבקשים סיסמה חדשה, כדי לא לבזבז הקלדה על קישור מת
    try {
      const res = await Api.checkReset(token);
      $('rs-slug-name').textContent = res.slug;
      show('rs-set');
      $('rs-pass').focus();
    } catch (e) {
      $('rs-dead-msg').textContent = e.message || 'הקישור כבר לא בתוקף.';
      show('rs-dead');
    }
  });
})();
