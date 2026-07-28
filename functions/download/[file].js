import { normalizeSlug } from '../_shared.js';

// מתקין אחד לכולם — מותאם אישית דרך שם הקובץ.
// ה-installer קורא את $EXEFILE של עצמו, מחלץ את המזהה שאחרי "ShulBoard-Setup-",
// ומתקין קיצור דרך + הפעלה אוטומטית של הדפדפן במצב קיוסק על הכתובת של בית הכנסת.
// כך אין צורך לקמפל קובץ נפרד לכל בית כנסת, וזה נשאר חינמי לגמרי.

const EXE_RE = /^ShulBoard-Setup-([a-z0-9-]{3,40})\.exe$/;
const CMD_RE = /^ShulBoard-([a-z0-9-]{3,40})\.bat$/;

export async function onRequestGet({ request, env, params }) {
  const file = String(params.file);
  const url = new URL(request.url);

  const exeMatch = file.match(EXE_RE);
  const batMatch = file.match(CMD_RE);
  const slug = normalizeSlug((exeMatch || batMatch)?.[1]);

  if (!slug) return new Response('שם קובץ לא תקין', { status: 400 });

  const shul = await env.DB.prepare(
    'SELECT slug, name, status FROM shuls WHERE slug = ?'
  ).bind(slug).first();
  if (!shul || shul.status !== 'active') {
    return new Response('בית הכנסת לא נמצא', { status: 404 });
  }

  const displayUrl = `${url.origin}/s/${shul.slug}`;

  // חלופה ללא התקנה: קובץ אצווה שפותח את הדפדפן במצב קיוסק.
  if (batMatch) {
    return new Response(batchScript(displayUrl, shul.name), {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="ShulBoard-${shul.slug}.bat"`,
        'cache-control': 'no-store',
      },
    });
  }

  const base = await env.ASSETS.fetch(new URL('/assets/ShulBoard-Setup.exe', url.origin));

  // כשהנכס חסר, Pages מגיש את דף הבית עם 200 — לכן בודקים את חתימת ה-PE ("MZ")
  // ולא מסתמכים על הסטטוס. בלי זה המשתמש היה מוריד HTML בשם .exe.
  const bytes = base.ok ? await base.arrayBuffer() : null;
  const isPE = bytes && bytes.byteLength > 2 &&
    new Uint8Array(bytes, 0, 2)[0] === 0x4d && new Uint8Array(bytes, 0, 2)[1] === 0x5a;

  if (!isPE) {
    return new Response(
      'קובץ ההתקנה עדיין לא נבנה. השתמשו בינתיים בהורדת ה-BAT מדף הניהול — היא עושה בדיוק את אותו הדבר.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }

  return new Response(bytes, {
    headers: {
      'content-type': 'application/vnd.microsoft.portable-executable',
      'content-disposition': `attachment; filename="ShulBoard-Setup-${shul.slug}.exe"`,
      'cache-control': 'public, max-age=3600',
      'x-shul-slug': shul.slug,
    },
  });
}

function batchScript(displayUrl, name) {
  // CRLF — קובצי אצווה של Windows דורשים את זה
  return [
    '@echo off',
    'chcp 65001 >nul',
    `title ${name} - צג בית הכנסת`,
    'setlocal',
    `set "BOARD_URL=${displayUrl}"`,
    '',
    'rem מאתר דפדפן מותקן',
    'set "BROWSER="',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined BROWSER if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not defined BROWSER if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
    '',
    'if not defined BROWSER (',
    '  echo לא נמצא Chrome או Edge במחשב.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'rem בהרצה ראשונה — מעתיק את עצמו לתיקיית ההפעלה האוטומטית של Windows',
    'set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
    'if /i not "%~dp0"=="%STARTUP%\\" (',
    '  if not exist "%STARTUP%\\ShulBoard.bat" (',
    '    copy /y "%~f0" "%STARTUP%\\ShulBoard.bat" >nul 2>&1',
    '    if not errorlevel 1 echo הצג יופעל אוטומטית בכל הדלקה של המחשב.',
    '  )',
    ')',
    '',
    'start "" "%BROWSER%" --kiosk --start-fullscreen --noerrdialogs --disable-session-crashed-bubble --disable-infobars --incognito "%BOARD_URL%"',
    'exit /b 0',
    '',
  ].join('\r\n');
}
