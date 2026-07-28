# ShulBoard

פלטפורמה רב-קהילתית לצגי בתי כנסת. כל בית כנסת נרשם בעצמו, מקבל כתובת קבועה
לצג, ומנוהל מרחוק על ידי הגבאים — הכל בתוך המסלול החינמי של Cloudflare.

**חי:** https://shul-board.pages.dev

מבוסס על [smart-zmanim](https://github.com/613avi/smart-zmanim) — אותו מנוע צג
(חישובי זמנים, פרשה, יארצייט), עם שכבת פלטפורמה חדשה במקום GitHub Pages + Actions.

## מה השתנה מול smart-zmanim

| | smart-zmanim | ShulBoard |
|---|---|---|
| בתי כנסת | אחד לכל ריפו | ריבוי בתי כנסת על מערכת אחת |
| הרשמה | fork + הגדרות ידניות | טופס עצמי, דקה |
| כניסת גבאי | PAT של GitHub + סיסמה | שם + סיסמה משותפת, עוגיית סשן |
| אחסון נתונים | קבצי JSON בריפו | D1 (SQLite) |
| שמירה | GitHub Action → commit | כתיבה ישירה, מיידית |
| מדיה | — | העלאת תמונות ו-PDF |
| ריפו | חייב ציבורי | פרטי |
| התקנה על המסך | ידנית | קובץ מותאם להורדה |

## ארכיטקטורה

```
public/                 נכסים סטטיים
  index.html            דף הבית + הרשמה
  admin.html            ממשק הגבאים
  display.html          תבנית הצג (מוגשת דרך /s/<slug>)
  js/api.js             לקוח הפלטפורמה (החליף את js/github.js)
  js/{display,admin,site}.js
  css/{board,site}.css

functions/              קוד שרץ בקצה
  _shared.js            סשנים, סיסמאות, זיהוי דייר, ברירות מחדל
  _middleware.js        כותרות אבטחה
  api/register.js       הרשמה + בדיקת זמינות כתובת
  api/{login,logout,me}.js
  api/data/             קריאה/כתיבה של מקטעי הגדרות (מאומת)
  api/public/[slug].js  המנה שהצג צורך (ציבורי, נשמר ב-cache 60 שניות)
  api/media/            העלאה, רשימה, מחיקה
  m/[id].js             הגשת קובץ מדיה (cache שנה)
  s/[slug].js           הגשת הצג של בית כנסת
  download/[file].js    מתקין מותאם לפי שם הקובץ

installer/shulboard.nsi  מקור המתקין ל-Windows
schema.sql               סכימת D1
```

### זיהוי בית הכנסת

`resolveSlug()` ב-`functions/_shared.js` בודק **קודם תת-דומיין ואז נתיב**.
היום עובד הנתיב `/s/<slug>`. ביום שיחובר דומיין משלכם, `beit-yaakov.example.com`
יעבוד מיד — בלי שינוי קוד.

## המתקין ל-Windows

לא מקמפלים קובץ לכל בית כנסת. יש **מתקין גנרי אחד**, וה-Function מגיש אותו תחת
שם קובץ אישי — `ShulBoard-Setup-<slug>.exe`. המתקין קורא את `$EXEFILE` של עצמו,
מחלץ את המזהה, ומתקין קיצור דרך + הפעלה אוטומטית של הדפדפן במצב קיוסק.

בניית הקובץ (חד-פעמית):

```bash
sudo apt-get install -y nsis
makensis -DBASE_URL=https://shul-board.pages.dev installer/shulboard.nsi
mkdir -p public/assets && mv installer/ShulBoard-Setup.exe public/assets/
wrangler pages deploy --project-name shul-board --branch main --commit-dirty=true
```

עד שזה נבנה, `/download/ShulBoard-<slug>.bat` נותן את אותה תוצאה בלי התקנה:
פותח את הצג במסך מלא ומעתיק את עצמו לתיקיית ההפעלה האוטומטית של Windows.
ה-Function בודקת חתימת `MZ` לפני שהיא מגישה EXE, כדי לא לשלוח HTML בטעות.

## פיתוח

```bash
export PATH=$HOME/.nvm/versions/node/v24.14.1/bin:$PATH   # ב-WSL, ראו הערה למטה
npm install
wrangler d1 execute shul-board --local --file=schema.sql   # פעם אחת
wrangler pages dev --port 8790
```

> ב-WSL `npx`/`npm` מצביעים ל-Node של Windows ונשברים על נתיבי UNC. השתמשו ב-Node
> של nvm. `wrangler` מותקן גלובלית דרך shim ב-`~/.local/bin/wrangler` שמצמיד Node 24.

פריסה:

```bash
wrangler pages deploy --project-name shul-board --branch main --commit-dirty=true
```

## משאבי Cloudflare

| משאב | Binding | מזהה |
|---|---|---|
| D1 | `DB` | `5377db8f-d686-4aac-be69-54a31e918a6f` |
| KV — סשנים | `SESSIONS` | `e1172fc79d7c40fe94619c3d43a7ad7f` |
| KV — מדיה | `MEDIA` | `05ee29fe2e80494cb421b2f2d798e21a` |

## המכסה החינמית — החישוב האמיתי

הכל רץ במסלול החינמי, בלי כרטיס אשראי. המגבלה הצרה ביותר היא **100,000 בקשות
ליום** ל-Functions:

- הצג מחשב שעון וזמנים **מקומית** ובודק שינויים כל 3 דקות → ~480 בקשות ליום למסך.
- המנה הציבורית נשמרת ב-cache של הקצה ל-60 שניות, כך שכמה מסכים באותו בית כנסת
  חולקים תשובה אחת.
- מדיה מוגשת עם `immutable` לשנה — נטענת מה-CDN, לא מה-Function.

בפועל: מרווח נוח ל-**150–200 מסכים** לפני שצריך לשקול שדרוג.

מגבלות נוספות: D1 — 5GB; KV — 1GB אחסון, 1,000 כתיבות ליום. לכן מדיה מוגבלת
ל-5MB לקובץ ו-60MB לבית כנסת. R2 (10GB) היה מרווח יותר אבל דורש כרטיס אשראי
גם במסלול החינמי, ולכן לא בשימוש.

## מה עוד אפשר להוסיף

- דומיין משלכם → תת-דומיין אמיתי לכל בית כנסת (הקוד כבר תומך)
- מסך ניהול-על: רשימת כל בתי הכנסת, השהיה, מכסות
- שחזור סיסמה דרך הטלפון שנרשם
- הצגת PDF/תמונות בסבב על הצג (הטבלה `media` ומקטע `media-playlist` כבר קיימים)
