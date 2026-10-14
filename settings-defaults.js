export const DEFAULT_SETTINGS = {
  zekrEnabled: true,
  zekrInterval: 60,
  reminderContent: 'mixed',
  reminderStyle: 'window',
  reminderAutoClose: 30,
  quietEnabled: true,
  quietFrom: '23:00',
  quietTo: '06:00',
  prayerNotify: true,
  prayerStyle: 'window',
  adhan: 'a1',
  adhanVolume: 0.8,
  preNotifyMin: 10,
  khatmaRemind: true,
  khatmaRemindTime: '21:00',
  fridayEnabled: true,
  fridayKahfTime: '09:00',
  lat: 21.3891,
  lng: 39.8579,
  cityName: 'مكة المكرمة',
  method: 'makkah',
  asrFactor: 1,
  ayahReciter: 'ar.alafasy',
  fontSize: 26,
  showTafsir: false,
  theme: 'auto',
};

export const ADHANS = [
  { id: 'none', name: 'بدون صوت' },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i + 1}`, name: `أذان ${i + 1}`, url: `https://cdn.aladhan.com/audio/adhans/a${i + 1}.mp3` })),
  ...Array.from({ length: 21 }, (_, i) => ({ id: `z${i + 1}`, name: `أذان قصير ${i + 1}`, url: `https://www.islamcan.com/audio/adhan/azan${i + 1}.mp3` })),
];

export const REMINDER_CONTENT = {
  zekr: 'ذكر',
  ayah: 'آية من القرآن',
  hadith: 'حديث شريف',
  mixed: 'منوّع (ذكر / آية / حديث)',
};
