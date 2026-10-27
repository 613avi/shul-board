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
        "text": "Kiddush this Shabbos is sponsored by the Friedman family in honor of their son Moshe's Bar Mitzvah. Mazal Tov!"
      },
      {
        "text": "Night Seder Mon–Thu, 8:30–10:00 PM in the Beis Medrash. Chavrusos available — see the Gabbai."
      },
      {
        "text": "Pre-Chanukah Toy Drive: drop off new, wrapped toys in the lobby through Rosh Chodesh Kislev."
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
      "candleLightingMinutes": 18,
      "zmanimMethod": "itim"
    },
    "displayedZmanim": {
      "alotHaShachar": true,
      "misheyakir": true,
      "sunrise": true,
      "sofZmanShmaMGA": true,
      "sofZmanShma": true,
      "sofZmanTfillaMGA": false,
      "sofZmanTfilla": true,
      "chatzot": true,
      "minchaGedola": true,
      "minchaKetana": false,
      "plagHaMincha": true,
      "sunset": true,
      "tzeit": true,
      "tzeit72": true,
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
      "theme": "midnight",
      "style": "pearl",
      "layout": "3col",
      "font": "classic",
      "accent": "#d9b46a",
      "scale": 0.9,
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
      "headerLogo": false,
      "lang": "en",
      "time12": true,
      "todayLine": true,
      "fastTimes": true,
      "nextHighlight": true,
      "hidePast": false,
      "extendedMentions": true,
      "learning": [
        "dafyomi",
        "mishnayomi",
        "nachyomi",
        "kitzurshulchanaruch"
      ],
      "weather": {
        "enabled": true,
        "unit": "f"
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
    "schemaVersion": 6
  },
  "dedications": {
    "entries": [
      {
        "type": "neshama",
        "text": "Reb Yaakov Moshe ben Reb Avraham z\"l",
        "from": "Sponsored by his children"
      },
      {
        "type": "refua",
        "text": "Chaya Rivka bas Leah",
        "from": "Please include her in your tefillos"
      },
      {
        "type": "mazal",
        "text": "The Friedman family on the Bar Mitzvah of Moshe",
        "from": "From all your friends at the shul"
      }
    ]
  },
  "media-playlist": {
    "seconds": 12,
    "fit": "contain",
    "entries": []
  },
  "memorial": {
    "entries": [
      {
        "name": "Reb Yaakov Moshe ben Reb Avraham z\"l",
        "hebrewDay": 7,
        "hebrewMonth": "חשון"
      },
      {
        "name": "Chaya Sarah bas Reb Yisroel a\"h",
        "hebrewDay": 12,
        "hebrewMonth": "חשון"
      },
      {
        "name": "Reb Shmuel Dovid ben Reb Eliezer z\"l",
        "hebrewDay": 19,
        "hebrewMonth": "חשון"
      },
      {
        "name": "Rivka bas Reb Chaim a\"h",
        "hebrewDay": 3,
        "hebrewMonth": "כסלו"
      },
      {
        "name": "Reb Mordechai ben Reb Yosef z\"l",
        "hebrewDay": 22,
        "hebrewMonth": "כסלו"
      }
    ]
  },
  "rooms": {
    "rooms": [
      {
        "id": "main",
        "name": "Main Shul",
        "notes": "",
        "weekday": {
          "shacharit": [
            "06:15",
            "07:00",
            "08:00"
          ],
          "mincha": [
            "13:45",
            {
              "type": "relative",
              "base": "sunset",
              "offset": -15,
              "round": 5,
              "days": []
            }
          ],
          "arvit": [
            {
              "type": "relative",
              "base": "tzeit",
              "offset": 0,
              "round": 5,
              "days": []
            },
            "21:45"
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
          "mincha": [
            {
              "type": "relative",
              "base": "sunset",
              "offset": -20,
              "round": 5,
              "days": []
            }
          ],
          "arvitMotzashOffsets": []
        }
      },
      {
        "id": "bm",
        "name": "Beis Medrash",
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
        "name": "Main",
        "seconds": 30,
        "blocks": [
          {
            "id": "b-header",
            "type": "header",
            "x": 0,
            "y": 0,
            "w": 11,
            "h": 3,
            "showClock": false,
            "showSub": false
          },
          {
            "id": "b-date",
            "type": "date",
            "x": 11,
            "y": 0,
            "w": 7,
            "h": 3
          },
          {
            "id": "b-clock",
            "type": "clock",
            "x": 18,
            "y": 0,
            "w": 6,
            "h": 3,
            "variant": "digital",
            "face": "plain",
            "seconds": true,
            "showDate": false
          },
          {
            "id": "b-tefillot",
            "type": "tefillot",
            "x": 0,
            "y": 3,
            "w": 8,
            "h": 13
          },
          {
            "id": "b-countdown",
            "type": "countdown",
            "x": 8,
            "y": 3,
            "w": 8,
            "h": 6
          },
          {
            "id": "b-shabbat",
            "type": "shabbat",
            "x": 8,
            "y": 9,
            "w": 8,
            "h": 7
          },
          {
            "id": "b-zmanim",
            "type": "zmanim",
            "x": 16,
            "y": 3,
            "w": 8,
            "h": 13
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
      },
      {
        "id": "learning",
        "name": "Learning & Community",
        "seconds": 20,
        "blocks": [
          {
            "id": "c-header",
            "type": "header",
            "x": 0,
            "y": 0,
            "w": 11,
            "h": 3,
            "showClock": false,
            "showSub": false
          },
          {
            "id": "c-date",
            "type": "date",
            "x": 11,
            "y": 0,
            "w": 7,
            "h": 3
          },
          {
            "id": "c-clock",
            "type": "clock",
            "x": 18,
            "y": 0,
            "w": 6,
            "h": 3,
            "variant": "digital",
            "face": "plain",
            "seconds": true,
            "showDate": false
          },
          {
            "id": "c-shiurim",
            "type": "shiurim",
            "x": 0,
            "y": 3,
            "w": 8,
            "h": 13
          },
          {
            "id": "c-learning",
            "type": "learning",
            "x": 8,
            "y": 3,
            "w": 8,
            "h": 6
          },
          {
            "id": "c-dedications",
            "type": "dedications",
            "x": 8,
            "y": 9,
            "w": 8,
            "h": 7
          },
          {
            "id": "c-memorial",
            "type": "memorial",
            "x": 16,
            "y": 3,
            "w": 8,
            "h": 7
          },
          {
            "id": "c-weather",
            "type": "weather",
            "x": 16,
            "y": 10,
            "w": 8,
            "h": 6
          },
          {
            "id": "c-mentions",
            "type": "mentions",
            "x": 0,
            "y": 16,
            "w": 24,
            "h": 1
          },
          {
            "id": "c-announcements",
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
        "title": "Daf Yomi",
        "lecturer": "Rabbi Dovid Klein",
        "time": "05:45",
        "days": [],
        "place": "Beis Medrash"
      },
      {
        "title": "Halacha Shiur — Hilchos Shabbos",
        "lecturer": "Rabbi Eliezer Gold",
        "time": "21:30",
        "days": [
          1,
          3
        ]
      },
      {
        "title": "Chumash with Rashi",
        "lecturer": "Rabbi Yehuda Stern",
        "time": "20:00",
        "days": [
          0,
          2,
          4
        ]
      },
      {
        "title": "Mishna Brura Chabura (before Mincha)",
        "lecturer": "",
        "type": "relative",
        "base": "sunset",
        "offset": -35,
        "round": 5,
        "days": []
      },
      {
        "title": "Daf Yomi (evening)",
        "lecturer": "Rabbi Dovid Klein",
        "time": "21:00",
        "days": []
      }
    ]
  },
  "special-times": {
    "entries": []
  },
  "texts": {
    "entries": [
      {
        "title": "Halacha of the Day",
        "body": "One who forgot to say Mashiv Haruach and has already concluded the bracha must go back to the beginning of Shemoneh Esrei."
      },
      {
        "title": "A Thought on the Parsha",
        "body": "Lech Lecha — Avraham's greatness was not that he heard the call, but that he went without knowing where."
      }
    ]
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
