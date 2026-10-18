// לוח ההדגמה: /s/demo-shul לצג, ו-/demo לניהול בלי סיסמה.
//
// בית הכנסת נוצר כאן בעצלות, בכניסה הראשונה ל-/demo, מהתוכן שבקובץ — אין לו
// סיסמה שמישהו יודע, ואין דרך להירשם לכתובת (היא ב-RESERVED). כל כתיבה של סשן
// הדגמה נחסמת ב-_middleware.js, כך שכל מי שנכנס רואה בדיוק את אותו לוח, ומה
// שהוא משנה חי רק בתצוגה המקדימה של הדפדפן שלו.

import { uuid, now, hashPassword, SECTIONS } from './_shared.js';

export const DEMO_SLUG = 'demo-shul';
export const DEMO_GABBAI = 'Guest';

export const isDemo = (session) => session?.slug === DEMO_SLUG;

const DEMO_DATA = {
  "announcements": {
    "entries": [
      {
        "text": "הקידוש בשבת הקרובה בחסות משפחת פרידמן לרגל בר המצווה של בנם. מזל טוב!"
      },
      {
        "text": "סדר ערב בימים ב'-ה' 20:30-22:00 בבית המדרש. יש חברותות, פנו לגבאי."
      }
    ]
  },
  "config": {
    "synagogueName": "Khal Bnei Torah",
    "location": {
      "address": "Lakewood, NJ",
      "latitude": 40.0821,
      "longitude": -74.2097,
      "timezone": "America/New_York",
      "candleLightingMinutes": 18
    },
    "displayedZmanim": {
      "alotHaShachar": true,
      "misheyakir": true,
      "sunrise": true,
      "sofZmanShma": true,
      "sofZmanTfilla": true,
      "chatzot": true,
      "minchaGedola": true,
      "minchaKetana": true,
      "plagHaMincha": true,
      "sunset": true,
      "tzeit": true,
      "sofZmanShmaMGA": true,
      "sofZmanTfillaMGA": true,
      "tzeit72": false,
      "chatzotNight": false
    },
    "theme": {
      "accent": "#d4af37",
      "background": "#0e1320"
    },
    "rotation": {
      "enabled": false,
      "intervalSeconds": 20
    },
    "zmanimOverrides": {},
    "design": {
      "preset": "pearl",
      "theme": "ivory",
      "style": "pearl",
      "layout": "3col",
      "font": "classic",
      "accent": "",
      "scale": 1,
      "backgroundImage": "",
      "backgroundOverlay": 0.45,
      "backgroundFit": "cover",
      "backgroundBlur": 0,
      "logo": {
        "url": ""
      }
    },
    "display": {
      "showUpcoming": true,
      "headerLogo": true,
      "lang": "he",
      "todayLine": true,
      "fastTimes": true,
      "nextHighlight": true,
      "hidePast": false,
      "extendedMentions": true,
      "learning": [
        "dafyomi"
      ],
      "weather": {
        "enabled": false
      },
      "sleep": {
        "enabled": false,
        "from": "23:30",
        "to": "05:00"
      },
      "textsSeconds": 15
    },
    "tachanun": {
      "rules": {
        "rc": true,
        "nisan": true,
        "pesachSheni": true,
        "lagBaomer": true,
        "sivan": true,
        "tishaBav": true,
        "tuBav": true,
        "erevRH": true,
        "tishrei": true,
        "chanukah": true,
        "tuBishvat": true,
        "purim": true,
        "purimKatan": true,
        "shabbat": true
      },
      "extra": []
    },
    "setup": {
      "done": true,
      "step": 5
    },
    "schemaVersion": 5
  },
  "dedications": {
    "entries": []
  },
  "media-playlist": {
    "seconds": 12,
    "fit": "contain",
    "entries": []
  },
  "memorial": {
    "entries": [
      {
        "name": "ר' יעקב משה ב\"ר אברהם ז\"ל",
        "hebrewDay": 8,
        "hebrewMonth": "חשון"
      },
      {
        "name": "חיה שרה בת ר' ישראל ע\"ה",
        "hebrewDay": 12,
        "hebrewMonth": "חשון"
      },
      {
        "name": "ר' שמואל דוד ב\"ר אליעזר ז\"ל",
        "hebrewDay": 19,
        "hebrewMonth": "חשון"
      },
      {
        "name": "רבקה בת ר' חיים ע\"ה",
        "hebrewDay": 3,
        "hebrewMonth": "כסלו"
      },
      {
        "name": "ר' מרדכי ב\"ר יוסף ז\"ל",
        "hebrewDay": 22,
        "hebrewMonth": "כסלו"
      }
    ]
  },
  "rooms": {
    "rooms": [
      {
        "id": "main",
        "name": "היכל מרכזי",
        "notes": "",
        "weekday": {
          "shacharit": [
            "06:15",
            "07:00",
            "07:45",
            "08:30"
          ],
          "mincha": [
            "13:45",
            "16:45"
          ],
          "arvit": [
            "19:45",
            "21:45",
            "22:30"
          ]
        },
        "shabbat": {
          "kabbalat": [],
          "minchaErevOffsets": [
            {
              "type": "relative",
              "base": "candle",
              "offset": 0,
              "round": 0,
              "days": []
            }
          ],
          "shacharit": [
            "07:00",
            "09:00"
          ],
          "mincha": [],
          "arvitMotzashOffsets": [
            {
              "type": "relative",
              "base": "havdalah",
              "offset": 0,
              "round": 0,
              "days": []
            }
          ]
        }
      },
      {
        "id": "bm",
        "name": "בית המדרש",
        "notes": "",
        "weekday": {
          "shacharit": [
            "06:40"
          ],
          "mincha": [],
          "arvit": [
            "20:30"
          ]
        },
        "shabbat": {
          "kabbalat": [],
          "minchaErevOffsets": [],
          "shacharit": [
            "08:15"
          ],
          "mincha": [],
          "arvitMotzashOffsets": []
        }
      }
    ]
  },
  "screens": {
    "enabled": true,
    "aspect": "16:9",
    "screens": [
      {
        "id": "main",
        "name": "מסך ראשי",
        "seconds": 20,
        "blocks": [
          {
            "id": "b-clock",
            "type": "clock",
            "x": 18,
            "y": 0,
            "w": 6,
            "h": 4,
            "variant": "digital",
            "face": "plain",
            "seconds": false,
            "showDate": false
          },
          {
            "id": "b-date",
            "type": "date",
            "x": 6,
            "y": 0,
            "w": 12,
            "h": 4
          },
          {
            "id": "b-header",
            "type": "header",
            "x": 0,
            "y": 0,
            "w": 6,
            "h": 4,
            "showClock": false,
            "showSub": false
          },
          {
            "id": "b-zmanim",
            "type": "zmanim",
            "x": 16,
            "y": 4,
            "w": 8,
            "h": 12
          },
          {
            "id": "b-tefillot",
            "type": "tefillot",
            "x": 8,
            "y": 4,
            "w": 8,
            "h": 12
          },
          {
            "id": "b-shabbat",
            "type": "shabbat",
            "x": 0,
            "y": 4,
            "w": 8,
            "h": 6
          },
          {
            "id": "b-shiurim",
            "type": "shiurim",
            "x": 0,
            "y": 10,
            "w": 8,
            "h": 6
          },
          {
            "id": "b-mentions",
            "type": "mentions",
            "x": 0,
            "y": 16,
            "w": 24,
            "h": 1
          },
          {
            "id": "b-announcements",
            "type": "announcements",
            "x": 0,
            "y": 17,
            "w": 24,
            "h": 1
          }
        ]
      }
    ]
  },
  "shiurim": {
    "entries": [
      {
        "title": "דף היומי",
        "lecturer": "הרב דוד קליין",
        "time": "20:30",
        "days": []
      },
      {
        "title": "שיעור הלכה - הלכות שבת",
        "lecturer": "הרב אליעזר גולד",
        "time": "21:30",
        "days": [
          1,
          3
        ]
      }
    ]
  },
  "special-times": {
    "entries": []
  },
  "texts": {
    "entries": []
  },
  "zmanim-calendar": {
    "entries": {}
  }
};

export async function ensureDemo(env) {
  const found = await env.DB.prepare('SELECT id FROM shuls WHERE slug = ?').bind(DEMO_SLUG).first();
  if (found) return found.id;

  const id = uuid();
  const t = now();
  // סיסמה אקראית שלא נשמרת בשום מקום: לסשן נכנסים רק דרך /demo
  const { hash, salt } = await hashPassword(
    [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16)).join('')
  );
  const stmts = [
    env.DB.prepare(
      `INSERT INTO shuls (id, slug, name, pass_hash, pass_salt, contact, status, created_at, updated_at)
       VALUES (?,?,?,?,?,NULL,'active',?,?)`
    ).bind(id, DEMO_SLUG, DEMO_DATA.config.synagogueName, hash, salt, t, t),
    env.DB.prepare(
      'INSERT INTO gabbaim (id, shul_id, name, is_owner, created_at) VALUES (?,?,?,1,?)'
    ).bind(uuid(), id, DEMO_GABBAI, t),
    ...SECTIONS.filter(s => DEMO_DATA[s]).map(s => env.DB.prepare(
      'INSERT INTO settings (shul_id, section, json, updated_at, updated_by) VALUES (?,?,?,?,?)'
    ).bind(id, s, JSON.stringify(DEMO_DATA[s]), t, DEMO_GABBAI)),
  ];
  try {
    await env.DB.batch(stmts);
  } catch {
    // שתי כניסות ראשונות במקביל: השנייה נופלת על ה-UNIQUE של slug, והראשונה כבר יצרה
  }
  const row = await env.DB.prepare('SELECT id FROM shuls WHERE slug = ?').bind(DEMO_SLUG).first();
  return row?.id || null;
}
