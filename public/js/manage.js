// דשבורד מנהל המערכת.

(() => {
  const $ = (id) => document.getElementById(id);
  let data = null;
  let filter = '';

  // ---------- עזרים ----------
  const fmtBytes = (n) =>
    !n ? '0'
    : n < 1024 ? `${n} B`
    : n < 1048576 ? `${(n / 1024).toFixed(0)} KB`
    : `${(n / 1048576).toFixed(1)} MB`;

  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('he-IL') : '—';

  function fmtAgo(ms) {
    if (!ms) return '—';
    const d = Date.now() - ms;
    const min = Math.floor(d / 60000);
    if (min < 1) return 'עכשיו';
    if (min < 60) return `לפני ${min} דק׳`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `לפני ${hr} שע׳`;
    const days = Math.floor(hr / 24);
    if (days < 30) return `לפני ${days} ימים`;
    return fmtDate(ms);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, kind = '') {
    const t = $('mg-toast');
    t.textContent = msg;
    t.className = `mg-toast show ${kind}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 3800);
  }

  async function call(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) },
    });
    const body = (res.headers.get('content-type') || '').includes('json')
      ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error((body && body.error) || `שגיאה ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  // ---------- כניסה ----------
  async function login() {
    const btn = $('mg-login-btn');
    const msg = $('mg-msg');
    msg.textContent = '';
    msg.className = 'msg';
    btn.disabled = true;
    try {
      await call('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('mg-pass').value }),
      });
      $('mg-pass').value = '';
      await enter();
    } catch (e) {
      msg.textContent = e.message;
      msg.className = 'msg bad';
    } finally {
      btn.disabled = false;
    }
  }

  async function enter() {
    data = await call('/api/admin/overview');
    $('mg-login').hidden = true;
    $('mg-app').hidden = false;
    render();
  }

  async function logout() {
    try { await call('/api/admin/login', { method: 'DELETE' }); } catch {}
    location.reload();
  }

  async function refresh() {
    try {
      data = await call('/api/admin/overview');
      render();
      toast('הנתונים עודכנו', 'ok');
    } catch (e) {
      if (e.status === 401) return location.reload();
      toast(e.message, 'bad');
    }
  }

  // ---------- תצוגה ----------
  function render() {
    renderTiles();
    renderShuls();
    renderSpark();
    renderAudit();
    $('mg-refreshed').textContent = `עודכן ${new Date().toLocaleTimeString('he-IL')}`;
  }

  function renderTiles() {
    const t = data.totals;
    const lim = data.limits;

    // הערכת עומס: כל מסך פונה כ-480 פעם ביום, בהנחת מסך אחד לבית כנסת
    const estReq = t.active * 480;
    const reqPct = Math.min(100, Math.round((estReq / lim.functionRequestsPerDay) * 100));
    const kvPct = Math.min(100, Math.round((t.media_bytes / lim.kvStorageBytes) * 100));
    const level = (p) => p < 60 ? '' : p < 85 ? 'warn' : 'hot';

    $('mg-tiles').innerHTML = `
      <div class="mg-tile gold">
        <div class="k">בתי כנסת</div>
        <div class="v">${t.shuls}</div>
        <div class="sub">${t.active} פעילים${t.shuls - t.active ? ` · ${t.shuls - t.active} מושהים` : ''}</div>
      </div>
      <div class="mg-tile">
        <div class="k">גבאים רשומים</div>
        <div class="v">${t.gabbaim}</div>
        <div class="sub">${t.shuls ? (t.gabbaim / t.shuls).toFixed(1) : 0} בממוצע לבית כנסת</div>
      </div>
      <div class="mg-tile">
        <div class="k">פעילים היום</div>
        <div class="v">${t.activeToday}</div>
        <div class="sub">בתי כנסת עם פעולה ב-24 שעות</div>
      </div>
      <div class="mg-tile">
        <div class="k">קבצי מדיה</div>
        <div class="v">${t.media_files}</div>
        <div class="sub">${fmtBytes(t.media_bytes)} מתוך 1GB ב-KV</div>
        <div class="mg-meter ${level(kvPct)}"><i style="width:${Math.max(kvPct, 1)}%"></i></div>
      </div>
      <div class="mg-tile">
        <div class="k">עומס משוער</div>
        <div class="v">${reqPct}%</div>
        <div class="sub">~${estReq.toLocaleString('he-IL')} מ-100k בקשות ליום</div>
        <div class="mg-meter ${level(reqPct)}"><i style="width:${Math.max(reqPct, 1)}%"></i></div>
      </div>
      <div class="mg-tile">
        <div class="k">רשומות יומן</div>
        <div class="v">${t.audit_rows}</div>
        <div class="sub">כל הפעולות מאז ההקמה</div>
      </div>`;
  }

  function renderShuls() {
    const q = filter.trim().toLowerCase();
    const rows = data.shuls.filter(s =>
      !q || s.name.toLowerCase().includes(q) || s.slug.includes(q));

    $('mg-empty').hidden = data.shuls.length > 0;
    const tbody = $('mg-shuls').querySelector('tbody');
    tbody.innerHTML = rows.map(s => `
      <tr data-id="${esc(s.id)}">
        <td class="mg-name">${esc(s.name)}</td>
        <td><a class="mono" href="/s/${esc(s.slug)}" target="_blank">/s/${esc(s.slug)}</a></td>
        <td><span class="mg-pill ${s.status}">${s.status === 'active' ? 'פעיל' : 'מושהה'}</span></td>
        <td>${s.gabbaim}</td>
        <td>${s.media_files ? `${s.media_files} · ${fmtBytes(s.media_bytes)}` : '—'}</td>
        <td>${fmtDate(s.created_at)}</td>
        <td>${fmtAgo(s.last_active)}</td>
        <td>
          <div class="mg-actions">
            <button class="btn btn-ghost" data-act="toggle">${s.status === 'active' ? 'השהיה' : 'הפעלה'}</button>
            <button class="btn btn-ghost btn-danger" data-act="delete">מחיקה</button>
          </div>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('tr').dataset.id;
        const shul = data.shuls.find(s => s.id === id);
        btn.dataset.act === 'toggle' ? toggleShul(shul) : deleteShul(shul);
      });
    });
  }

  function renderSpark() {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(data.serverTime - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, n: data.signups[key] || 0, label: d.toLocaleDateString('he-IL') });
    }
    const max = Math.max(1, ...days.map(d => d.n));
    $('mg-spark').innerHTML = days.map(d =>
      `<div class="bar" data-n="${d.n}" style="height:${Math.max(4, (d.n / max) * 100)}%" title="${d.label}: ${d.n}"></div>`
    ).join('');
  }

  // אחרי מחיקה ה-JOIN לא מוצא שם, ונשאר מזהה UUID — עדיף להגיד את זה במפורש
  function shulLabel(a) {
    if (a.shul_id === 'platform') return '— מערכת —';
    if (!a.shul_name || a.shul_name === a.shul_id) return '(נמחק)';
    return a.shul_name;
  }

  function renderAudit() {
    const tbody = $('mg-audit').querySelector('tbody');
    tbody.innerHTML = data.audit.map(a => `
      <tr>
        <td>${new Date(a.created_at).toLocaleString('he-IL')}</td>
        <td>${esc(shulLabel(a))}</td>
        <td>${esc(a.gabbai || '—')}</td>
        <td>${esc(a.action)}</td>
        <td class="wrap">${esc(a.detail || '')}</td>
      </tr>`).join('');
  }

  // ---------- פעולות ----------
  async function toggleShul(shul) {
    const next = shul.status === 'active' ? 'suspended' : 'active';
    const verb = next === 'suspended' ? 'להשהות' : 'להפעיל מחדש';
    if (!confirm(`${verb} את "${shul.name}"?${next === 'suspended' ? '\n\nהצג יפסיק לעבוד והגבאים לא יוכלו להיכנס.' : ''}`)) return;
    try {
      await call(`/api/admin/shul/${shul.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      toast(next === 'suspended' ? 'בית הכנסת הושהה' : 'בית הכנסת הופעל', 'ok');
      refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function deleteShul(shul) {
    const typed = prompt(
      `מחיקה סופית של "${shul.name}".\n\n` +
      `יימחקו כל ההגדרות, הגבאים והקבצים. אין ביטול.\n` +
      `להמשך הקלידו את הכתובת: ${shul.slug}`
    );
    if (typed === null) return;
    if (typed.trim() !== shul.slug) return toast('הכתובת לא תואמת — המחיקה בוטלה', 'bad');
    try {
      const res = await call(
        `/api/admin/shul/${shul.id}?confirm=${encodeURIComponent(shul.slug)}`,
        { method: 'DELETE' }
      );
      toast(`נמחק: ${res.deleted}${res.mediaRemoved ? ` (${res.mediaRemoved} קבצים)` : ''}`, 'ok');
      refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }

  // ---------- הפעלה ----------
  document.addEventListener('DOMContentLoaded', () => {
    $('mg-login-btn').addEventListener('click', login);
    $('mg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    $('mg-refresh').addEventListener('click', refresh);
    $('mg-logout').addEventListener('click', logout);
    $('mg-search').addEventListener('input', e => { filter = e.target.value; renderShuls(); });

    // אם כבר יש סשן מנהל פעיל — נכנסים ישר
    enter().catch(() => {});
  });
})();
