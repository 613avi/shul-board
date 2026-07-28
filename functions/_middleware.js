// כותרות אבטחה לכל התשובות + מדידת זמן בקצה.

export async function onRequest({ request, next }) {
  const t0 = Date.now();
  const response = await next();
  const res = new Response(response.body, response);

  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('server-timing', `edge;dur=${Date.now() - t0}`);

  // דף הצג מיועד לרוץ במסך מלא בבית הכנסת — לא בתוך iframe של אחרים
  if ((res.headers.get('content-type') || '').includes('text/html')) {
    res.headers.set('x-frame-options', 'SAMEORIGIN');
  }
  return res;
}
