// Astronomical prayer-time calculation (adapted from the public PrayTimes.org algorithm), fully offline.

export const METHODS = {
  egypt: { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
  makkah: { name: 'أم القرى — مكة المكرمة', fajr: 18.5, ishaMin: 90 },
  mwl: { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
  karachi: { name: 'جامعة العلوم الإسلامية — كراتشي', fajr: 18, isha: 18 },
  isna: { name: 'أمريكا الشمالية (ISNA)', fajr: 15, isha: 15 },
  kuwait: { name: 'الكويت', fajr: 18, isha: 17.5 },
  qatar: { name: 'قطر', fajr: 18, ishaMin: 90 },
  dubai: { name: 'دبي', fajr: 18.2, isha: 18.2 },
  turkey: { name: 'تركيا (ديانت)', fajr: 18, isha: 17 },
};

export const PRAYER_NAMES = {
  fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء',
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const sin = (d) => Math.sin(rad(d));
const cos = (d) => Math.cos(rad(d));
const tan = (d) => Math.tan(rad(d));
const arcsin = (x) => deg(Math.asin(x));
const arccos = (x) => deg(Math.acos(Math.max(-1, Math.min(1, x))));
const arctan2 = (y, x) => deg(Math.atan2(y, x));
const arccot = (x) => deg(Math.atan(1 / x));
const fix = (a, b) => { const r = a - b * Math.floor(a / b); return r < 0 ? r + b : r; };

const julian = (y, m, d) => {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
};

const sunPosition = (jd) => {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = arctan2(cos(e) * sin(L), cos(L)) / 15;
  return { declination: arcsin(sin(e) * sin(L)), equation: q / 15 - fix(RA, 24) };
};

export function computeTimes(date, lat, lng, methodKey = 'egypt', asrFactor = 1) {
  const method = METHODS[methodKey] || METHODS.egypt;
  const jDate = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
  const tz = -date.getTimezoneOffset() / 60;

  const midDay = (t) => fix(12 - sunPosition(jDate + t).equation, 24);
  const angleTime = (angle, t, ccw) => {
    const decl = sunPosition(jDate + t).declination;
    const noon = midDay(t);
    const T = arccos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    return noon + (ccw ? -T : T);
  };
  const asrTime = (t) => {
    const decl = sunPosition(jDate + t).declination;
    return angleTime(-arccot(asrFactor + tan(Math.abs(lat - decl))), t);
  };

  const t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
  const d = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 24]));
  const raw = {
    fajr: angleTime(method.fajr, d.fajr, true),
    sunrise: angleTime(0.833, d.sunrise, true),
    dhuhr: midDay(d.dhuhr),
    asr: asrTime(d.asr),
    sunset: angleTime(0.833, d.sunset),
    isha: method.isha ? angleTime(method.isha, d.isha) : 0,
  };
  const adj = (h) => h + tz - lng / 15;
  const hours = {
    fajr: adj(raw.fajr),
    sunrise: adj(raw.sunrise),
    dhuhr: adj(raw.dhuhr),
    asr: adj(raw.asr),
    maghrib: adj(raw.sunset),
    isha: method.ishaMin ? adj(raw.sunset) + method.ishaMin / 60 : adj(raw.isha),
  };

  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Object.fromEntries(
    Object.entries(hours).map(([k, h]) => [k, new Date(base.getTime() + Math.round(h * 60) * 60000)]),
  );
}

export function nextPrayer(lat, lng, methodKey, asrFactor, now = new Date()) {
  const today = computeTimes(now, lat, lng, methodKey, asrFactor);
  for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    if (today[key] > now) return { key, time: today[key] };
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { key: 'fajr', time: computeTimes(tomorrow, lat, lng, methodKey, asrFactor).fajr };
}

export const prayerName = (key, date = new Date()) => (key === 'dhuhr' && new Date(date).getDay() === 5 ? 'الجمعة' : PRAYER_NAMES[key]);
