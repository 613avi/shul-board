/**
 * ShulBoard — ממסר מייל דרך Gmail.
 *
 * למה: ל-Cloudflare Workers אין SMTP, וספק מייל חיצוני ששולח "מטעם" כתובת
 * @gmail.com לא מתיישר ב-DMARC — חלק מהמיילים נוחתים בספאם. הסקריפט הזה רץ
 * בתוך חשבון Google שלכם, ולכן המייל יוצא באמת מהתיבה שלכם: SPF ו-DKIM
 * תקינים, בלי דומיין ובלי ספק חיצוני.
 *
 * ── התקנה ─────────────────────────────────────────────────────────────────
 * 1. נכנסים ל-https://script.google.com עם החשבון שממנו רוצים לשלוח,
 *    ויוצרים פרויקט חדש ("New project").
 * 2. מוחקים את מה שיש שם ומדביקים את כל הקובץ הזה.
 * 3. מחליפים את SECRET למחרוזת אקראית ארוכה. אפשר לייצר אחת בטרמינל:
 *      openssl rand -hex 32
 *    שומרים אותה בצד — היא נכנסת גם ל-Cloudflare בשלב 6.
 * 4. Deploy → New deployment → Type: **Web app**
 *      Execute as:      Me  ← קריטי, אחרת השליחה לא תהיה מהחשבון שלכם
 *      Who has access:  Anyone
 *    בפעם הראשונה Google מבקש הרשאה לשלוח מייל — מאשרים. יופיע מסך
 *    "Google hasn't verified this app": Advanced → Go to ... (unsafe).
 *    זה תקין, מדובר בסקריפט שלכם עצמכם.
 * 5. מעתיקים את ה-Web app URL. הוא נראה כך:
 *      https://script.google.com/macros/s/AKfycb.../exec
 * 6. מגדירים שני סודות ב-Cloudflare:
 *      wrangler pages secret put GAS_MAIL_URL    --project-name shul-board
 *      wrangler pages secret put GAS_MAIL_SECRET --project-name shul-board
 *
 * ── דברים שכדאי לדעת ──────────────────────────────────────────────────────
 * • הכתובת ציבורית. מה שמגן עליה זה SECRET בלבד — אז שיהיה ארוך ואקראי,
 *   ואל תפרסמו אותו. אם דלף: מייצרים חדש, מעדכנים כאן וב-Cloudflare
 *   ועושים Deploy → Manage deployments → עריכה → New version.
 * • מכסה: 100 נמענים ביום בחשבון Gmail רגיל (2,000 ב-Workspace). לשחזורי
 *   סיסמה זה הרבה מעבר למספיק.
 * • כל שינוי בקובץ מחייב Deploy מחדש כדי שייכנס לתוקף.
 * • אם תמחקו את הפרויקט, שחזור הסיסמה במייל יפסיק לעבוד. שאר המערכת
 *   לא מושפעת — הגבאים פשוט יופנו לטופס יצירת הקשר.
 */

var SECRET = 'החליפו-אותי-במחרוזת-אקראית-ארוכה';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // השוואה באורך קבוע. לא קריטי מול סוד אקראי ארוך, אבל זול.
    if (!safeEqual(String(body.secret || ''), SECRET)) return out('err: bad secret');

    var to = String(body.to || '').trim();
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(to)) return out('err: bad address');

    // תקרות שפויות: הסקריפט הזה שולח קישורי שחזור, לא ניוזלטרים
    var subject = String(body.subject || 'ShulBoard').slice(0, 200);
    var text = String(body.text || '').slice(0, 20000);
    var html = String(body.html || '').slice(0, 50000);

    var options = { name: String(body.fromName || 'ShulBoard').slice(0, 60) };
    if (html) options.htmlBody = html;

    GmailApp.sendEmail(to, subject, text, options);
    return out('ok');
  } catch (err) {
    return out('err: ' + err);
  }
}

// גישה ב-GET מחזירה משהו קריא, כדי שבדיקה מהדפדפן לא תיראה כמו תקלה
function doGet() {
  return out('ShulBoard mail relay is running. Use POST.');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function out(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}
