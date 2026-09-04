// לקוח הפלטפורמה — מחליף את js/github.js של הגרסה המקורית.
// אין כאן טוקנים ואין GitHub: הכל עובר דרך Pages Functions עם עוגיית סשן.

window.Api = (() => {
  async function call(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers: {
        ...(opts.body && !(opts.body instanceof FormData)
          ? { 'content-type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    });
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = (body && body.error) || `שגיאה ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    // כל נתיבי ה-API מחזירים JSON. תשובת HTML עם 200 היא ה-fallback הסטטי,
    // כלומר ה-Function לא נותב — פעם אחת זה גרם לממשק להיפתח בלי חשבון אמיתי.
    if (!isJson) {
      const err = new Error('השרת לא זמין כרגע — נסו שוב בעוד רגע');
      err.status = 503;
      throw err;
    }
    return body;
  }

  const j = (v) => JSON.stringify(v);

  return {
    // ---- חשבון ----
    register: (payload) => call('/api/register', { method: 'POST', body: j(payload) }),
    checkSlug: (slug) => call(`/api/register?slug=${encodeURIComponent(slug)}`),
    login: (payload) => call('/api/login', { method: 'POST', body: j(payload) }),
    logout: () => call('/api/logout', { method: 'POST' }),
    me: () => call('/api/me'),

    // ---- הגדרות ----
    loadAll: () => call('/api/data'),
    saveSection: (section, data) =>
      call(`/api/data/${encodeURIComponent(section)}`, { method: 'PUT', body: j(data) }),

    // ---- מדיה ----
    listMedia: () => call('/api/media'),
    uploadMedia: (file, onProgress) => {
      const form = new FormData();
      form.append('file', file);
      if (!onProgress) return call('/api/media', { method: 'POST', body: form });
      // XHR כדי לקבל אחוזי התקדמות — fetch לא חושף אותם בהעלאה
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media');
        xhr.withCredentials = true;
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.onload = () => {
          let body = {};
          try { body = JSON.parse(xhr.responseText); } catch {}
          if (xhr.status >= 200 && xhr.status < 300) resolve(body);
          else reject(new Error(body.error || `שגיאה ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('ההעלאה נכשלה'));
        xhr.send(form);
      });
    },
    deleteMedia: (id) => call(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // ---- תבניות מהקהילה ----
    listTemplates: () => call('/api/templates'),
    publishTemplate: (payload) => call('/api/templates', { method: 'POST', body: j(payload) }),
    useTemplate: (id) => call(`/api/templates/${encodeURIComponent(id)}`, { method: 'POST' }),
    deleteTemplate: (id) => call(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
})();
