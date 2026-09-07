-- shul-board — סכימת D1
-- דייר = בית כנסת. כל בית כנסת מזוהה ב-slug, שמשמש גם כנתיב וגם (בעתיד) כתת-דומיין.

CREATE TABLE IF NOT EXISTS shuls (
  id            TEXT PRIMARY KEY,            -- uuid
  slug          TEXT NOT NULL UNIQUE,        -- beit-yaakov  → /s/beit-yaakov, beit-yaakov.<domain>
  name          TEXT NOT NULL,               -- "בית הכנסת המרכזי"
  pass_hash     TEXT NOT NULL,               -- PBKDF2-SHA256 של סיסמת הגבאים המשותפת
  pass_salt     TEXT NOT NULL,
  contact       TEXT,                        -- טלפון/מייל לשחזור, אופציונלי
  status        TEXT NOT NULL DEFAULT 'active',  -- active | suspended
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- שמות הגבאים המורשים. הסיסמה משותפת; השם קובע מי ביצע כל שינוי.
CREATE TABLE IF NOT EXISTS gabbaim (
  id            TEXT PRIMARY KEY,
  shul_id       TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_owner      INTEGER NOT NULL DEFAULT 0,  -- הגבאי שפתח את בית הכנסת
  created_at    INTEGER NOT NULL,
  UNIQUE (shul_id, name)
);
CREATE INDEX IF NOT EXISTS idx_gabbaim_shul ON gabbaim(shul_id);

-- כל מקטע הגדרות נשמר כ-JSON, בדיוק במבנה שהצג כבר יודע לקרוא.
-- section ∈ config | rooms | memorial | announcements | special-times | zmanim-calendar | media-playlist | screens | dedications | shiurim | texts
CREATE TABLE IF NOT EXISTS settings (
  shul_id       TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  section       TEXT NOT NULL,
  json          TEXT NOT NULL,
  updated_at    INTEGER NOT NULL,
  updated_by    TEXT,
  PRIMARY KEY (shul_id, section)
);

-- מטא-דאטה של קבצים. הבייטים עצמם ב-KV (MEDIA) תחת המפתח blob_key.
CREATE TABLE IF NOT EXISTS media (
  id            TEXT PRIMARY KEY,
  shul_id       TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  blob_key      TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size          INTEGER NOT NULL,
  kind          TEXT NOT NULL,               -- image | pdf | other
  created_at    INTEGER NOT NULL,
  created_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_shul ON media(shul_id, created_at DESC);

-- יומן פעולות — מי שינה מה ומתי.
CREATE TABLE IF NOT EXISTS audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  shul_id       TEXT NOT NULL,
  gabbai        TEXT,
  action        TEXT NOT NULL,
  detail        TEXT,
  ip            TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_shul ON audit(shul_id, created_at DESC);

-- תבניות מהקהילה: מראה + פריסה שגבאי בחר לפרסם, בלי תוכן (זמנים/הנצחות).
-- הטבלה נוצרת גם בעצלנות מהקוד (CREATE IF NOT EXISTS) כדי שפריסה לא תדרוש הרצת סכימה.
CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,
  shul_id       TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  author        TEXT,                        -- שם בית הכנסת בזמן הפרסום
  json          TEXT NOT NULL,               -- { design, screens, display }
  uses          INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'public',  -- public | hidden
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status, uses DESC, created_at DESC);

-- מסכים בלייב: כל צג שולח דופק כל 3 דקות. מי שנראה ב-7 הדקות האחרונות נחשב "בלייב".
-- הטבלה נוצרת גם בעצלנות מהקוד (functions/_screens.js).
CREATE TABLE IF NOT EXISTS screens (
  shul_id       TEXT NOT NULL,               -- בלי FK: הטבלה נוצרת בעצלנות; המחיקה מפורשת ב-admin/shul
  screen_id     TEXT NOT NULL,               -- מזהה יציב מהצג (?screen=שם, או מזהה שמור בדפדפן)
  fp            TEXT,                        -- טביעת אצבע של המכשיר — לאיחוד מסך שהופעל מחדש
  label         TEXT,                        -- שם שניתן דרך ?screen= בכתובת
  user_agent    TEXT,
  width         INTEGER,
  height        INTEGER,
  app_version   TEXT,                        -- גרסת הקוד שרצה על המסך
  data_version  INTEGER,                     -- חותמת הנתונים שהמסך מציג
  ip            TEXT,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL,
  PRIMARY KEY (shul_id, screen_id)
);
CREATE INDEX IF NOT EXISTS idx_screens_seen ON screens(shul_id, last_seen DESC);

-- פניות מטופס "יצירת קשר" בדף הבית. מוצגות בדשבורד מנהל המערכת.
-- הטבלה נוצרת גם בעצלנות מהקוד (functions/_contact.js).
CREATE TABLE IF NOT EXISTS contact (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  contact       TEXT,                        -- טלפון או מייל לחזרה
  shul          TEXT,                        -- כתובת בית הכנסת, אם יש
  topic         TEXT,                        -- help | bug | idea | other
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new', -- new | read | done
  ip            TEXT,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_new ON contact(status, created_at DESC);
