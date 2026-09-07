# -*- coding: utf-8 -*-
# מייצר את public/js/decor.js (ספריית אלמנטים גרפיים ב-SVG) ואת public/css/elements.css
# (סגנון "אלמנטים": מסגרות זהב, סרטי כותרת, קלף) — מאותם ציורים.
import json, urllib.parse, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

DEFS = ('<defs>'
        '<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#f8e9a0"/><stop offset=".45" stop-color="#d4ad55"/><stop offset="1" stop-color="#8b6524"/>'
        '</linearGradient>'
        '<linearGradient id="pr" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#fbf3dd"/><stop offset="1" stop-color="#e9d6a6"/>'
        '</linearGradient>'
        '</defs>')

def svg(vb, body, extra=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" {extra}>{DEFS}{body}</svg>'

def corner_group(x=0, y=0):
    # עיטור פינה בארוקי — קווי זהב מסולסלים
    return (f'<g transform="translate({x} {y})" fill="none" stroke="url(#gl)" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M6 94V30Q6 6 30 6H94" stroke-width="5"/>'
            '<path d="M18 84V42Q18 18 42 18H84" stroke-width="2.4"/>'
            '<path d="M42 18c-7 0-12 5-12 12 0 5 4 9 9 9 4 0 7-3 7-7 0-3-2-5-5-5" stroke-width="3"/>'
            '<path d="M18 42c0-7-5-12-12-12-5 0-9 4-9 9 0 4 3 7 7 7 3 0 5-2 5-5" stroke-width="3"/>'
            '<path d="M84 18c9-7 16 0 13 7-2 5-9 6-13 2" stroke-width="3"/>'
            '<path d="M18 84c-7 9 0 16 7 13 5-2 6-9 2-13" stroke-width="3"/>'
            '<path d="M6 30c-4 4-4 10 0 14M30 6c4-4 10-4 14 0" stroke-width="2"/>'
            '</g>'
            f'<circle cx="{x+24}" cy="{y+24}" r="4.5" fill="url(#gl)"/>')

ASSETS = []

# --- סרט כותרת ---
ribbon_body = ('<path d="M62 30H0l22 32L0 94h62z" fill="#a4762d"/>'
               '<path d="M338 30h62l-22 32 22 32h-62z" fill="#a4762d"/>'
               '<path d="M62 62l24 32H62zM338 62l-24 32h24z" fill="#6a4712"/>'
               '<path d="M62 10Q200-6 338 10v64Q200 90 62 74z" fill="url(#pr)" stroke="url(#gl)" stroke-width="5" stroke-linejoin="round"/>'
               '<path d="M74 22Q200 8 326 22" fill="none" stroke="#c9a24d" stroke-width="1.5" opacity=".7"/>')
RIBBON = svg('0 0 400 100', ribbon_body, 'preserveAspectRatio="none"')
ASSETS.append(('ribbon', 'סרט כותרת', RIBBON))

# --- פינה ---
ASSETS.append(('corner', 'עיטור פינה', svg('0 0 100 100', corner_group())))

# --- מסגרת מלאה (9 חלקים; משמשת גם ל-border-image) ---
def frame_corner(rot):
    return (f'<g transform="rotate({rot} 60 60)">'
            '<path d="M13 34V19q0-6 6-6h15" fill="none" stroke="url(#gl)" stroke-width="4" stroke-linecap="round"/>'
            '<path d="M19 30c0-7 4-11 11-11" fill="none" stroke="#f8e9a0" stroke-width="1.8"/>'
            '<path d="M34 13c6-4 10 0 8 4-2 3-6 3-8 0M13 34c-4 6 0 10 4 8 3-2 3-6 0-8" fill="none" stroke="url(#gl)" stroke-width="2.2" stroke-linecap="round"/>'
            '<circle cx="20" cy="20" r="4" fill="url(#gl)"/>'
            '</g>')
frame_body = ('<rect x="8" y="8" width="104" height="104" fill="none" stroke="url(#gl)" stroke-width="7"/>'
              '<rect x="8" y="8" width="104" height="104" fill="none" stroke="#f8e9a0" stroke-width="1" opacity=".6"/>'
              '<rect x="18" y="18" width="84" height="84" fill="none" stroke="#8b6524" stroke-width="1.4"/>'
              + ''.join(frame_corner(r) for r in (0, 90, 180, 270)))
FRAME = svg('0 0 120 120', frame_body)
ASSETS.append(('frame', 'מסגרת זהב', FRAME))

# --- מנורה ---
cups = ''.join(f'<path d="M{x-9} 70h18l-3-14h-12z" fill="url(#gl)"/>'
               f'<ellipse cx="{x}" cy="44" rx="5.5" ry="10" fill="#f39a1e"/><ellipse cx="{x}" cy="47" rx="2.4" ry="5" fill="#fff0b3"/>'
               for x in (40, 60, 80, 100, 120, 140, 160))
menorah_body = ('<g fill="none" stroke="url(#gl)" stroke-width="9" stroke-linecap="round">'
                '<path d="M100 200V70"/>'
                '<path d="M40 70v30a60 60 0 0 0 120 0V70"/>'
                '<path d="M60 70v30a40 40 0 0 0 80 0V70"/>'
                '<path d="M80 70v30a20 20 0 0 0 40 0V70"/>'
                '</g>'
                '<path d="M60 200h80l12 14H48z" fill="url(#gl)"/>'
                '<path d="M78 176h44l6 10H72z" fill="url(#gl)"/>' + cups)
ASSETS.append(('menorah', 'מנורה', svg('0 0 200 224', menorah_body)))

# --- ספר פתוח ---
def page_lines(sign):
    out = ''
    for y in (44, 60, 76, 92):
        x0 = 120 + sign * 14; x1 = 120 + sign * 92
        out += f'<path d="M{x0} {y}C{120+sign*40} {y-4} {120+sign*66} {y-4} {x1} {y+2}" fill="none" stroke="#b39a6a" stroke-width="2"/>'
    return out
book_body = ('<path d="M120 30C90 12 40 10 10 20v100c30-10 80-8 110 10z" fill="url(#pr)" stroke="url(#gl)" stroke-width="4" stroke-linejoin="round"/>'
             '<path d="M120 30c30-18 80-20 110-10v100c-30-10-80-8-110 10z" fill="url(#pr)" stroke="url(#gl)" stroke-width="4" stroke-linejoin="round"/>'
             + page_lines(-1) + page_lines(1) +
             '<path d="M120 30v100" stroke="#8b6524" stroke-width="3"/>'
             '<path d="M10 120c30-10 80-8 110 10 30-18 80-20 110-10v9c-30-10-80-8-110 10-30-18-80-20-110-10z" fill="url(#gl)"/>')
ASSETS.append(('book', 'ספר פתוח', svg('0 0 240 142', book_body)))

# --- ספר תורה ---
torah_lines = ''.join(f'<path d="M62 {y}h76" stroke="#7a6136" stroke-width="2.2"/>' for y in range(58, 170, 12))
torah_body = ('<rect x="52" y="40" width="96" height="140" fill="url(#pr)" stroke="#c9a24d" stroke-width="2"/>' + torah_lines +
              ''.join(f'<rect x="{x-11}" y="18" width="22" height="184" rx="7" fill="url(#gl)"/>'
                      f'<circle cx="{x}" cy="12" r="12" fill="#c9a24d" stroke="#8b6524" stroke-width="2"/>'
                      f'<circle cx="{x}" cy="208" r="12" fill="#c9a24d" stroke="#8b6524" stroke-width="2"/>' for x in (40, 160)))
ASSETS.append(('torah', 'ספר תורה', svg('0 0 200 222', torah_body)))

# --- מגן דוד ---
magen_body = ('<path d="M50 8L88 72H12zM50 92L12 28h76z" fill="none" stroke="url(#gl)" stroke-width="6" stroke-linejoin="round"/>'
              '<path d="M50 8L88 72H12zM50 92L12 28h76z" fill="none" stroke="#f8e9a0" stroke-width="1.2" opacity=".7"/>')
ASSETS.append(('magen', 'מגן דוד', svg('0 0 100 100', magen_body)))

# --- נרות שבת ---
def candle(x):
    return (f'<ellipse cx="{x}" cy="182" rx="28" ry="8" fill="url(#gl)"/>'
            f'<rect x="{x-6}" y="128" width="12" height="54" fill="url(#gl)"/>'
            f'<ellipse cx="{x}" cy="128" rx="17" ry="6" fill="url(#gl)"/>'
            f'<rect x="{x-8}" y="58" width="16" height="72" fill="#fbf3dd" stroke="#d8c48f" stroke-width="2"/>'
            f'<ellipse cx="{x}" cy="40" rx="8" ry="17" fill="#f39a1e"/><ellipse cx="{x}" cy="45" rx="3.4" ry="8" fill="#fff0b3"/>')
ASSETS.append(('candles', 'נרות שבת', svg('0 0 200 200', candle(68) + candle(132))))

# --- כתר תורה ---
crown_body = ('<path d="M30 100C30 46 72 42 100 74c28-32 70-28 70 26" fill="none" stroke="url(#gl)" stroke-width="14" stroke-linecap="round"/>'
              '<path d="M100 74V32" stroke="url(#gl)" stroke-width="9" stroke-linecap="round"/>'
              '<circle cx="100" cy="24" r="9" fill="#f8e9a0" stroke="#8b6524" stroke-width="2"/>'
              '<circle cx="36" cy="50" r="7" fill="#f8e9a0" stroke="#8b6524" stroke-width="2"/>'
              '<circle cx="164" cy="50" r="7" fill="#f8e9a0" stroke="#8b6524" stroke-width="2"/>'
              '<rect x="28" y="98" width="144" height="32" rx="4" fill="url(#gl)" stroke="#8b6524" stroke-width="2"/>'
              '<circle cx="60" cy="114" r="7" fill="#b0332e"/><circle cx="100" cy="114" r="7" fill="#1f4e6b"/><circle cx="140" cy="114" r="7" fill="#b0332e"/>')
ASSETS.append(('crown', 'כתר תורה', svg('0 0 200 140', crown_body)))

# --- קו מפריד ---
divider_body = ('<path d="M0 20h168M232 20h168" stroke="url(#gl)" stroke-width="3" stroke-linecap="round"/>'
                '<path d="M168 20c-8-11-21-11-30 0 9 11 22 11 30 0M232 20c8-11 21-11 30 0-9 11-22 11-30 0" fill="none" stroke="url(#gl)" stroke-width="2.5"/>'
                '<path d="M200 5l15 15-15 15-15-15z" fill="url(#gl)"/>')
ASSETS.append(('divider', 'קו מפריד', svg('0 0 400 40', divider_body, 'preserveAspectRatio="none"')))

# ---------- decor.js ----------
js = ['// ספריית אלמנטים גרפיים — SVG מוטמע, אפס בקשות רשת. משותף לצג ולניהול.',
      '// נוצר מ-scratch/gen-decor.py; לעריכה משנים שם ומריצים שוב.',
      '(function () {',
      '  const ASSETS = [']
for key, name, s in ASSETS:
    js.append(f'    {{ id: {json.dumps(key)}, name: {json.dumps(name, ensure_ascii=False)}, svg: {json.dumps(s)} }},')
js += ['  ];',
       '  window.ShulDecor = {',
       '    ASSETS,',
       '    get: (id) => ASSETS.find(a => a.id === id) || null,',
       '  };',
       '})();', '']
(ROOT / 'public/js/decor.js').write_text('\n'.join(js), encoding='utf-8')

# ---------- elements.css ----------
def uri(s):
    # '#' חייב להיות מקודד — אחרת הדפדפן קורא אותו כעוגן ו-url(#gl) שובר את כל הציור
    return "url(\"data:image/svg+xml," + urllib.parse.quote(s, safe="-_.~ =:/,()").replace("'", "%27") + "\")"

FRAME_URI = uri(FRAME)
RIBBON_URI = uri(RIBBON)
CORNER_URI = uri(svg('0 0 100 100', corner_group()))

css = f'''/* סגנון "אלמנטים מעוטרים" (data-style="elements") — מסגרות זהב מגולפות סביב כל לוח,
   כותרות על סרטי קלף, רקע עץ עם מרכז שמיים, ואלמנטים גרפיים חופשיים (קוביית decor).
   כל הציורים הם SVG מוטמע שנוצר מ-gen-decor.py — אותם ציורים כמו ב-js/decor.js. */

#display-root[data-style="elements"] {{
  --el-ink: #2b1d0c;
  --el-ink-soft: #5d4527;
  --el-gold: #b08d4f;
  --el-gold-deep: #8b6524;
  --el-parchment: #f6ead0;
  --el-parchment-deep: #ead8ad;
  --el-sky: #a9cbdb;
  --el-wood: #6a4526;
  --el-wood-deep: #3f2712;
  --text: var(--el-ink);
  --text-dim: var(--el-ink-soft);
  --accent: #8a5a1c;
  --accent-2: #1f4e6b;
  --bg-card: var(--el-parchment);
  --border: var(--el-gold);
  --frame-w: 3.2vmin;
  background:
    radial-gradient(ellipse 62% 55% at 50% 46%, #d9eaf1 0%, var(--el-sky) 45%, rgba(169,203,219,0) 78%),
    linear-gradient(165deg, #8a5c34 0%, var(--el-wood) 35%, var(--el-wood-deep) 100%);
  box-sizing: border-box;
  padding: calc(var(--frame-w) * 0.9);
  position: relative;
}}

/* מסגרת חיצונית לכל הלוח — על הגבול של השורש עצמו (פסאודו-אלמנט לא נצבע כאן) */
#display-root[data-style="elements"] {{
  border: var(--frame-w) solid transparent;
  border-image: {FRAME_URI} 36 / var(--frame-w) / 0 round;
  background-clip: padding-box;
}}
body:has(#display-root[data-style="elements"]) {{
  background: linear-gradient(165deg, #8a5c34 0%, var(--el-wood) 35%, var(--el-wood-deep) 100%);
}}

/* ---------- לוחות: קלף בתוך מסגרת זהב ---------- */
#display-root[data-style="elements"] .card {{
  background:
    radial-gradient(ellipse at 50% 30%, rgba(255,255,255,.35), transparent 70%),
    linear-gradient(180deg, var(--el-parchment) 0%, var(--el-parchment-deep) 100%);
  border: calc(var(--frame-w) * 0.75) solid transparent;
  border-image: {FRAME_URI} 36 / calc(var(--frame-w) * 0.75) / 0 round;
  border-radius: 0;
  box-shadow: 0 0.6vmin 1.6vmin rgba(0,0,0,.35), inset 0 0 3vmin rgba(139,101,36,.18);
  padding: 2vmin 1.6vmin 1.4vmin;
  overflow: visible;
  color: var(--el-ink);
}}

/* כותרת על סרט קלף שיוצא מעל שפת הלוח */
#display-root[data-style="elements"] .card h2 {{
  background: {RIBBON_URI} center / 100% 100% no-repeat;
  border: 0;
  color: var(--el-ink);
  font-family: 'Frank Ruhl Libre', 'David Libre', serif;
  font-weight: 900;
  text-align: center;
  width: max-content; max-width: 92%;
  margin: calc(var(--frame-w) * -1.9) auto 1vmin;
  padding: 0.28em 1.9em 0.34em;
  line-height: 1.1;
  font-size: calc(var(--fs, 1) * clamp(1.6rem, 2.6vw, 3rem));
  filter: drop-shadow(0 0.25vmin 0.5vmin rgba(0,0,0,.35));
  position: relative; z-index: 2;
}}
#display-root[data-style="elements"] .blk h2 {{ flex: 0 0 auto; }}

/* צבעי דיו בתוך הלוחות */
#display-root[data-style="elements"] .card,
#display-root[data-style="elements"] .card td,
#display-root[data-style="elements"] .card li {{ color: var(--el-ink); }}
#display-root[data-style="elements"] .zmanim-card td:last-child,
#display-root[data-style="elements"] .tefillot-card .prayer-block td.ptime {{ color: var(--accent); font-weight: 800; }}
#display-root[data-style="elements"] .tefillot-card .prayer-block h3 {{ color: var(--el-ink); border-color: var(--el-gold); }}
#display-root[data-style="elements"] .tefillot-card tr.next-minyan td {{ color: var(--accent-2); }}
#display-root[data-style="elements"] .mem-date {{ color: var(--el-ink-soft); }}

/* כותרת הצג (הקלאסי וקוביית הכותרת): שם בית הכנסת על סרט, שעון בקלף */
#display-root[data-style="elements"] .display-header {{
  background: transparent; border: 0; box-shadow: none;
}}
#display-root[data-style="elements"] .display-header h1 {{
  background: {RIBBON_URI} center / 100% 100% no-repeat;
  color: var(--el-ink);
  font-family: 'Frank Ruhl Libre', 'David Libre', serif;
  font-weight: 900;
  padding: 0.3em 1.6em 0.38em;
  display: inline-block;
  max-width: 100%;
  filter: drop-shadow(0 0.25vmin 0.5vmin rgba(0,0,0,.35));
}}
#display-root[data-style="elements"] .display-header .clock {{
  background: linear-gradient(180deg, var(--el-parchment), var(--el-parchment-deep));
  border: 0.9vmin solid transparent;
  border-image: {FRAME_URI} 36 / 0.9vmin / 0 round;
  color: var(--el-ink);
  font-family: 'Frank Ruhl Libre', serif;
  padding: 0.1em 0.5em;
  box-shadow: 0 0.4vmin 1vmin rgba(0,0,0,.35);
}}
#display-root[data-style="elements"] .display-header .clock > div {{ color: var(--el-ink); }}
#display-root[data-style="elements"] .display-header .sub {{ color: #fbf3dd; text-shadow: 0 1px 2px rgba(0,0,0,.65); }}

/* פסי הזכרות והודעות והכותרת התחתונה — קלף צר במסגרת */
#display-root[data-style="elements"] .mentions-bar,
#display-root[data-style="elements"] .announcements-container,
#display-root[data-style="elements"] .display-footer {{
  background: linear-gradient(180deg, var(--el-parchment), var(--el-parchment-deep));
  color: var(--el-ink);
  border: 0.9vmin solid transparent;
  border-image: {FRAME_URI} 36 / 0.9vmin / 0 round;
  border-radius: 0;
}}
#display-root[data-style="elements"] .mentions-bar .mention,
#display-root[data-style="elements"] #announcements-ticker,
#display-root[data-style="elements"] .display-footer span {{ color: var(--el-ink); }}

/* קוביית אלמנט גרפי — בלי לוח, בלי מסגרת, רק הציור */
.blk-decor, #display-root[data-style="elements"] .blk-decor {{
  background: none !important; border: 0 !important; border-image: none !important;
  box-shadow: none !important; padding: 0 !important; background-image: none !important;
  align-items: center; justify-content: center;
}}
.blk-decor .blk-body {{ width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }}
.blk-decor svg, .blk-decor img {{ width: 100%; height: 100%; object-fit: contain; display: block; }}
.blk-decor.flip svg, .blk-decor.flip img {{ transform: scaleX(-1); }}
.blk-decor.anchor-bottom .blk-body {{ align-items: flex-end; }}
.blk-decor.anchor-top .blk-body {{ align-items: flex-start; }}

/* קוביות קטנות (שעון, תאריך, לוגו): מסגרת דקה יותר וריווח קטן, כדי שהתוכן ייכנס */
#display-root[data-style="elements"] .blk-clock,
#display-root[data-style="elements"] .blk-date {{ padding: 0.6vmin 1vmin; border-width: calc(var(--frame-w) * 0.55); border-image-width: calc(var(--frame-w) * 0.55); }}

/* שעון בקובייה — דיו על קלף */
#display-root[data-style="elements"] .blk-clock .big-time {{ color: var(--el-ink); font-family: 'Frank Ruhl Libre', serif; }}
#display-root[data-style="elements"] .blk-clock .face {{ fill: var(--el-parchment); stroke: var(--el-gold); }}
#display-root[data-style="elements"] .blk-clock .hand {{ stroke: var(--el-ink); }}
#display-root[data-style="elements"] .blk-clock .num {{ fill: var(--el-ink); }}
#display-root[data-style="elements"] .blk-date .d-heb {{ color: var(--el-ink); }}
'''
(ROOT / 'public/css/elements.css').write_text(css, encoding='utf-8')
print('assets:', [a[0] for a in ASSETS], '| css bytes:', len(css))
