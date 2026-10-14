export const SURAH_NAMES = 'الفاتحة البقرة آل_عمران النساء المائدة الأنعام الأعراف الأنفال التوبة يونس هود يوسف الرعد إبراهيم الحجر النحل الإسراء الكهف مريم طه الأنبياء الحج المؤمنون النور الفرقان الشعراء النمل القصص العنكبوت الروم لقمان السجدة الأحزاب سبأ فاطر يس الصافات ص الزمر غافر فصلت الشورى الزخرف الدخان الجاثية الأحقاف محمد الفتح الحجرات ق الذاريات الطور النجم القمر الرحمن الواقعة الحديد المجادلة الحشر الممتحنة الصف الجمعة المنافقون التغابن الطلاق التحريم الملك القلم الحاقة المعارج نوح الجن المزمل المدثر القيامة الإنسان المرسلات النبأ النازعات عبس التكوير الانفطار المطففين الانشقاق البروج الطارق الأعلى الغاشية الفجر البلد الشمس الليل الضحى الشرح التين العلق القدر البينة الزلزلة العاديات القارعة التكاثر العصر الهمزة الفيل قريش الماعون الكوثر الكافرون النصر المسد الإخلاص الفلق الناس'
  .split(' ')
  .map((n) => n.replace('_', ' '));

export const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const MEDINAN = new Set([2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 99, 110]);

export const SURAHS = SURAH_NAMES.map((name, i) => ({
  number: i + 1,
  name,
  ayahs: AYAH_COUNTS[i],
  type: MEDINAN.has(i + 1) ? 'مدنية' : 'مكية',
}));

export const AYAH_RECITERS = [
  { id: 'ar.alafasy', name: 'مشاري راشد العفاسي' },
  { id: 'ar.husary', name: 'محمود خليل الحصري' },
  { id: 'ar.husarymujawwad', name: 'محمود خليل الحصري (مجود)' },
  { id: 'ar.minshawi', name: 'محمد صديق المنشاوي' },
  { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد (مرتل)' },
  { id: 'ar.abdurrahmaansudais', name: 'عبد الرحمن السديس' },
  { id: 'ar.saoodshuraym', name: 'سعود الشريم' },
  { id: 'ar.mahermuaiqly', name: 'ماهر المعيقلي' },
  { id: 'ar.hudhaify', name: 'علي الحذيفي' },
  { id: 'ar.muhammadayyoub', name: 'محمد أيوب' },
  { id: 'ar.ahmedajamy', name: 'أحمد بن علي العجمي' },
  { id: 'ar.abdullahbasfar', name: 'عبد الله بصفر' },
];

export const HADITH_BOOKS = [
  { id: 'bukhari', name: 'صحيح البخاري', max: 7563 },
  { id: 'muslim', name: 'صحيح مسلم', max: 7563 },
  { id: 'abudawud', name: 'سنن أبي داود', max: 5274 },
  { id: 'tirmidhi', name: 'جامع الترمذي', max: 3956 },
  { id: 'nasai', name: 'سنن النسائي', max: 5758 },
  { id: 'ibnmajah', name: 'سنن ابن ماجه', max: 4341 },
  { id: 'malik', name: 'موطأ مالك', max: 1858 },
  { id: 'nawawi', name: 'الأربعون النووية', max: 42 },
  { id: 'qudsi', name: 'الأحاديث القدسية', max: 40 },
];

export const ASMA_ALHUSNA = 'الرَّحْمَنُ الرَّحِيمُ الْمَلِكُ الْقُدُّوسُ السَّلَامُ الْمُؤْمِنُ الْمُهَيْمِنُ الْعَزِيزُ الْجَبَّارُ الْمُتَكَبِّرُ الْخَالِقُ الْبَارِئُ الْمُصَوِّرُ الْغَفَّارُ الْقَهَّارُ الْوَهَّابُ الرَّزَّاقُ الْفَتَّاحُ الْعَلِيمُ الْقَابِضُ الْبَاسِطُ الْخَافِضُ الرَّافِعُ الْمُعِزُّ الْمُذِلُّ السَّمِيعُ الْبَصِيرُ الْحَكَمُ الْعَدْلُ اللَّطِيفُ الْخَبِيرُ الْحَلِيمُ الْعَظِيمُ الْغَفُورُ الشَّكُورُ الْعَلِيُّ الْكَبِيرُ الْحَفِيظُ الْمُقِيتُ الْحَسِيبُ الْجَلِيلُ الْكَرِيمُ الرَّقِيبُ الْمُجِيبُ الْوَاسِعُ الْحَكِيمُ الْوَدُودُ الْمَجِيدُ الْبَاعِثُ الشَّهِيدُ الْحَقُّ الْوَكِيلُ الْقَوِيُّ الْمَتِينُ الْوَلِيُّ الْحَمِيدُ الْمُحْصِي الْمُبْدِئُ الْمُعِيدُ الْمُحْيِي الْمُمِيتُ الْحَيُّ الْقَيُّومُ الْوَاجِدُ الْمَاجِدُ الْوَاحِدُ الْأَحَدُ الصَّمَدُ الْقَادِرُ الْمُقْتَدِرُ الْمُقَدِّمُ الْمُؤَخِّرُ الْأَوَّلُ الْآخِرُ الظَّاهِرُ الْبَاطِنُ الْوَالِي الْمُتَعَالِي الْبَرُّ التَّوَّابُ الْمُنْتَقِمُ الْعَفُوُّ الرَّءُوفُ مَالِكُ_الْمُلْكِ ذُو_الْجَلَالِ_وَالْإِكْرَامِ الْمُقْسِطُ الْجَامِعُ الْغَنِيُّ الْمُغْنِي الْمَانِعُ الضَّارُّ النَّافِعُ النُّورُ الْهَادِي الْبَدِيعُ الْبَاقِي الْوَارِثُ الرَّشِيدُ الصَّبُورُ'
  .split(' ')
  .map((n) => n.replaceAll('_', ' '));

export const CITIES = [
  { name: 'القاهرة', lat: 30.0444, lng: 31.2357, method: 'egypt' },
  { name: 'الإسكندرية', lat: 31.2001, lng: 29.9187, method: 'egypt' },
  { name: 'مكة المكرمة', lat: 21.3891, lng: 39.8579, method: 'makkah' },
  { name: 'المدينة المنورة', lat: 24.5247, lng: 39.5692, method: 'makkah' },
  { name: 'الرياض', lat: 24.7136, lng: 46.6753, method: 'makkah' },
  { name: 'جدة', lat: 21.4858, lng: 39.1925, method: 'makkah' },
  { name: 'دبي', lat: 25.2048, lng: 55.2708, method: 'dubai' },
  { name: 'أبوظبي', lat: 24.4539, lng: 54.3773, method: 'dubai' },
  { name: 'الكويت', lat: 29.3759, lng: 47.9774, method: 'kuwait' },
  { name: 'الدوحة', lat: 25.2854, lng: 51.531, method: 'qatar' },
  { name: 'المنامة', lat: 26.2285, lng: 50.586, method: 'makkah' },
  { name: 'مسقط', lat: 23.588, lng: 58.3829, method: 'makkah' },
  { name: 'عمّان', lat: 31.9454, lng: 35.9284, method: 'mwl' },
  { name: 'القدس', lat: 31.7683, lng: 35.2137, method: 'mwl' },
  { name: 'بيروت', lat: 33.8938, lng: 35.5018, method: 'mwl' },
  { name: 'دمشق', lat: 33.5138, lng: 36.2765, method: 'mwl' },
  { name: 'بغداد', lat: 33.3152, lng: 44.3661, method: 'mwl' },
  { name: 'الخرطوم', lat: 15.5007, lng: 32.5599, method: 'egypt' },
  { name: 'طرابلس', lat: 32.8872, lng: 13.1913, method: 'egypt' },
  { name: 'تونس', lat: 36.8065, lng: 10.1815, method: 'mwl' },
  { name: 'الجزائر', lat: 36.7538, lng: 3.0588, method: 'mwl' },
  { name: 'الدار البيضاء', lat: 33.5731, lng: -7.5898, method: 'mwl' },
  { name: 'إسطنبول', lat: 41.0082, lng: 28.9784, method: 'turkey' },
  { name: 'كراتشي', lat: 24.8607, lng: 67.0011, method: 'karachi' },
  { name: 'جاكرتا', lat: -6.2088, lng: 106.8456, method: 'mwl' },
  { name: 'كوالالمبور', lat: 3.139, lng: 101.6869, method: 'mwl' },
  { name: 'لندن', lat: 51.5074, lng: -0.1278, method: 'mwl' },
  { name: 'باريس', lat: 48.8566, lng: 2.3522, method: 'mwl' },
  { name: 'برلين', lat: 52.52, lng: 13.405, method: 'mwl' },
  { name: 'نيويورك', lat: 40.7128, lng: -74.006, method: 'isna' },
  { name: 'تورونتو', lat: 43.6532, lng: -79.3832, method: 'isna' },
];

export const FEATURED_RADIOS = [
  { id: -1, name: 'إذاعة القرآن الكريم من القاهرة', url: 'https://stream.radiojar.com/8s5u5tpdtwzuv', featured: true },
  { id: -2, name: 'إذاعة الشارقة للقرآن الكريم', url: 'https://l3.itworkscdn.net/smcquranlive/quranradiolive/icecast.audio', featured: true },
  { id: -3, name: 'إذاعة القرآن الكريم — السعودية', url: 'https://stream.radiojar.com/0tpy1h0kxtzuv', featured: true },
  { id: -4, name: 'إذاعة القرآن الكريم — مكة المكرمة (بث الحرم)', url: 'https://edge.mixlr.com/channel/rwumx', featured: true },
  { id: -5, name: 'إذاعة القرآن الكريم — الكويت', url: 'https://radio.mp3islam.com/listen/quran_radio/radio.mp3', featured: true },
  { id: -6, name: 'إذاعة القرآن الكريم — الأردن', url: 'https://jrtv-live.ercdn.net/jrradio/quranradio.m3u8', featured: true },
  { id: -7, name: 'إذاعة القرآن الكريم — سلطنة عُمان', url: 'https://partwota.cdn.mgmlcdn.com/quranrdoorg/quranrdo.stream_aac/chunklist.m3u8', featured: true },
  { id: -8, name: 'إذاعة القرآن الكريم — البحرين', url: 'https://5c7b683162943.streamlock.net/live/ngrp:radio-106-1_all/playlist.m3u8', featured: true },
  { id: -9, name: 'إذاعة القرآن الكريم — صنعاء', url: 'https://halo.streamerr.co/listen/quran_kareem/radio.mp3', featured: true },
  { id: -10, name: 'إذاعة القرآن الكريم — الجزائر', url: 'https://webradio1.tda.dz:8001/Coran_64K.mp3', featured: true },
  { id: -11, name: 'إذاعة الزيتونة — تونس', url: 'https://radio.radiotunisienne.tn/radiozaitouna', featured: true },
  { id: -12, name: 'صوت القرآن — باكستان', url: 'https://whmsonic.radio.gov.pk:7002/stream?type=http&nocache=12', featured: true },
  { id: -13, name: 'إذاعة تفسير القرآن الكريم', url: 'https://qurango.net/radio/tafseer', featured: true },
  { id: -14, name: 'إذاعة التراتيل القصيرة', url: 'https://qurango.net/radio/tarateel', featured: true },
  { id: -15, name: 'إذاعة منوّعة لمختلف القراء', url: 'https://qurango.net/radio/mix', featured: true },
];
