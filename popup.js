import { AZKAR, TASBEEH } from './data/azkar.js';
import { SURAHS, AYAH_RECITERS, HADITH_BOOKS, ASMA_ALHUSNA, CITIES, FEATURED_RADIOS } from './data/quran-meta.js';
import { TOTAL_PAGES, KHATMA_PLANS, dateKey, newKhatma, dailyTarget, readToday, todayRemaining, daysElapsed, expectedPages, streak, recordPages } from './lib/khatma.js';
import { computeTimes, nextPrayer, METHODS, PRAYER_NAMES, prayerName } from './lib/praytimes.js';
import { qibla, directionName } from './lib/qibla.js';
import { DEFAULT_SETTINGS, ADHANS, REMINDER_CONTENT } from './settings-defaults.js';

const QURAN_API = 'https://api.alquran.cloud/v1';
const MP3_API = 'https://www.mp3quran.net/api/v3';
const HADITH_API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const DAY = 86400000;

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const view = $('#view');
const isFull = true;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arNum = (n) => Number(n).toLocaleString('ar-EG', { useGrouping: false });
const pad3 = (n) => String(n).padStart(3, '0');
const fmtTime = (s) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
};
const clock = (d) => d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
const todayKey = () => dateKey();
const dayOfYear = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / DAY);

let settings = { ...DEFAULT_SETTINGS };
let cleanups = [];
let stateHandlers = [];
let playerState = null;
let currentTab = 'home';

// ---------- storage & network ----------

const local = {
  async get(key, fallback) { const r = await chrome.storage.local.get(key); return r[key] ?? fallback; },
  set(key, value) { return chrome.storage.local.set({ [key]: value }); },
};

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.sync.set({ settings });
}

async function cachedFetch(url, ttl = Infinity) {
  const key = `c:${url}`;
  const hit = await local.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.d;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    local.set(key, { t: Date.now(), d: data }).catch(() => {});
    return data;
  } catch (e) {
    if (hit) return hit.d;
    throw e;
  }
}

const audio = (cmd, payload = {}) => chrome.runtime.sendMessage({ to: 'bg', type: 'audio', cmd, ...payload });

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

const loader = (text = 'جارِ التحميل…') => `<div class="loader">${text}</div>`;
const errorBox = (text = 'تعذّر التحميل، تحقق من اتصال الإنترنت.') => `<div class="card muted">⚠️ ${text}</div>`;

function copy(text) {
  navigator.clipboard.writeText(text).then(() => toast('تم النسخ ✓'));
}

// ---------- router ----------

const VIEWS = { home, quran, khatma, listen, radio, tv, azkar, hadith, prayer, tasbeeh, settings: settingsView };

function go(tab, ...args) {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  stateHandlers = [];
  currentTab = tab;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $(`#tabs button[data-tab="${tab}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  view.scrollTop = 0;
  local.set('lastTab', tab);
  if (isFull) history.replaceState(null, '', `?full=1#${tab}`);
  VIEWS[tab](...args);
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) go(b.dataset.tab);
});

// ---------- home ----------

async function home() {
  const lastRead = await local.get('lastRead');
  const np = nextPrayer(settings.lat, settings.lng, settings.method, settings.asrFactor);
  view.innerHTML = `
    <div class="card">
      <h3>🕌 الصلاة القادمة <span class="muted">${esc(settings.cityName)}</span></h3>
      <div class="row spread"><b style="font-size:18px">${prayerName(np.key, np.time)}</b><span class="muted">${clock(np.time)}</span></div>
      <div class="countdown" id="cd"></div>
    </div>
    <div id="homeExtra"></div>
    ${lastRead ? `<div class="card item" id="continue"><span class="num">📖</span><div class="grow"><div class="title">تابع القراءة</div><div class="sub">سورة ${SURAHS[lastRead.surah - 1].name} — آية ${arNum(lastRead.ayah)}</div></div><span>←</span></div>` : ''}
    <div class="grid" style="margin-bottom:10px">
      <div class="tile" data-go="azkar" data-cat="morning"><b>🌅</b><span>أذكار الصباح</span></div>
      <div class="tile" data-go="azkar" data-cat="evening"><b>🌙</b><span>أذكار المساء</span></div>
      <div class="tile" data-go="azkar" data-cat="names"><b>✨</b><span>أسماء الله الحسنى</span></div>
    </div>
    <div class="card" id="aotd">${loader('آية اليوم…')}</div>
    <div class="card" id="hotd">${loader('حديث اليوم…')}</div>`;

  const cd = $('#cd');
  const tick = () => {
    const diff = Math.max(0, np.time - Date.now());
    cd.textContent = fmtTime(diff / 1000).padStart(5, '0');
    if (diff <= 0) home();
  };
  tick();
  const iv = setInterval(tick, 1000);
  cleanups.push(() => clearInterval(iv));

  $('#continue')?.addEventListener('click', () => go('quran', lastRead.surah, lastRead.ayah));
  $$('[data-go]').forEach((t) => t.addEventListener('click', () => go(t.dataset.go, t.dataset.cat)));
  renderHomeExtra();

  const ayahNo = ((dayOfYear() * 37 + new Date().getFullYear()) % 6236) + 1;
  cachedFetch(`${QURAN_API}/ayah/${ayahNo}/editions/quran-uthmani,ar.muyassar`).then(({ data }) => {
    const [a, t] = data;
    const box = $('#aotd');
    if (!box) return;
    box.innerHTML = `
      <h3>✨ آية اليوم <span class="row"><button class="btn sm" id="aPlay">▶ استمع</button><button class="btn sm" id="aOpen">فتح السورة</button></span></h3>
      <div class="quran-text" style="font-size:22px;text-align:center">${esc(a.text.replace('﻿', ''))} <span class="ayah-num">﴿${arNum(a.numberInSurah)}﴾</span></div>
      <div class="muted" style="text-align:center">سورة ${esc(SURAHS[a.surah.number - 1].name)} — آية ${arNum(a.numberInSurah)}</div>
      <div class="tafsir">${esc(t.text)}</div>`;
    $('#aPlay').addEventListener('click', () => audio('play', {
      kind: 'ayah',
      items: [{ url: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${ayahNo}.mp3`, title: 'آية اليوم', subtitle: `سورة ${SURAHS[a.surah.number - 1].name} — ${arNum(a.numberInSurah)}` }],
    }));
    $('#aOpen').addEventListener('click', () => go('quran', a.surah.number, a.numberInSurah));
  }).catch(() => { const b = $('#aotd'); if (b) b.innerHTML = errorBox(); });

  const hNo = (dayOfYear() % 42) + 1;
  cachedFetch(`${HADITH_API}/ara-nawawi/${hNo}.json`).then((d) => {
    const box = $('#hotd');
    if (!box) return;
    box.innerHTML = `<h3>📜 حديث اليوم <span class="muted">الأربعون النووية — ${arNum(hNo)}</span></h3>
      <div class="hadith-text" style="font-size:16px">${esc(d.hadiths[0].text)}</div>`;
  }).catch(() => { const b = $('#hotd'); if (b) b.innerHTML = errorBox(); });
}

async function renderHomeExtra() {
  const box = $('#homeExtra');
  const k = await local.get('khatma');
  const isFriday = new Date().getDay() === 5;
  let html = '';

  if (isFriday && settings.fridayEnabled) {
    const kahfDone = (await local.get('kahfDone')) === todayKey();
    const sal = await local.get('salawat', {});
    const count = sal.date === todayKey() ? sal.count : 0;
    html += `
      <div class="card" style="background:var(--hl)">
        <h3>🕌 جمعة مباركة</h3>
        <div class="row spread" style="margin-bottom:8px">
          <span>${kahfDone ? '✓ قرأت سورة الكهف اليوم' : 'لا تنسَ قراءة سورة الكهف'}</span>
          <button class="btn sm ${kahfDone ? '' : 'primary'}" id="kahf">📖 سورة الكهف</button>
        </div>
        <button class="btn" id="salawat" style="width:100%;justify-content:center">ﷺ اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ — <b id="salCount">${arNum(count)}</b></button>
        <div class="muted" style="margin-top:6px">«أكثروا عليّ من الصلاة يوم الجمعة وليلة الجمعة» — وآخر ساعة بعد العصر ساعة استجابة</div>
      </div>`;
  }

  if (k?.active) {
    const remaining = todayRemaining(k);
    const pct = Math.round((k.pagesDone / TOTAL_PAGES) * 100);
    html += `
      <div class="card item" id="khatmaCard" style="display:block">
        <div class="row spread"><b>📗 الختمة — ${arNum(pct)}٪</b><span class="muted">🔥 ${arNum(streak(k))}</span></div>
        <div class="progress" style="margin:8px 0"><div style="width:${pct}%"></div></div>
        <div class="sub">${remaining ? `باقي ${arNum(remaining)} صفحة من ورد اليوم ←` : '🎉 أتممت ورد اليوم'}</div>
      </div>`;
  } else {
    html += `<div class="card item" id="khatmaCard"><span class="num">📗</span><div class="grow"><div class="title">ابدأ ختمة</div><div class="sub">قسّم المصحف إلى ورد يومي مع تذكير</div></div><span>←</span></div>`;
  }

  const rate = await local.get('rate', { opens: 0, since: Date.now(), state: 'pending' });
  const showRate = rate.state === 'pending' && rate.opens >= 10 && Date.now() - rate.since > 5 * DAY;
  if (showRate) {
    html = `
      <div class="card" id="rateCard" style="border-color:var(--gold)">
        <h3>⭐ هل نفعتك الإضافة؟</h3>
        <div class="muted" style="margin-bottom:8px">تقييمك يساعد غيرك على الوصول إليها — والدالّ على الخير كفاعله.</div>
        <div class="row"><button class="btn primary" id="rateYes">⭐ قيّم الإضافة</button><button class="btn sm" id="rateNo">لاحقاً</button></div>
      </div>` + html;
  }

  box.innerHTML = html;
  const closeRate = (state) => { local.set('rate', { ...rate, state }); $('#rateCard')?.remove(); };
  $('#rateYes')?.addEventListener('click', () => {
    const reviewUrl = navigator.userAgent.includes('Firefox')
      ? `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(chrome.runtime.id)}/reviews/`
      : `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
    chrome.tabs.create({ url: reviewUrl });
    closeRate('done');
  });
  $('#rateNo')?.addEventListener('click', () => closeRate('dismissed'));
  $('#khatmaCard').addEventListener('click', () => go('khatma'));
  $('#kahf')?.addEventListener('click', () => go('quran', 18, 1));
  const sal = await local.get('salawat', {});
  let salCount = sal.date === todayKey() ? sal.count : 0;
  $('#salawat')?.addEventListener('click', () => {
    salCount += 1;
    $('#salCount').textContent = arNum(salCount);
    local.set('salawat', { date: todayKey(), count: salCount });
  });
}

function qiblaCard() {
  const { bearing, distanceKm } = qibla(settings.lat, settings.lng);
  const ticks = Array.from({ length: 12 }, (_, i) => `<line x1="100" y1="12" x2="100" y2="${i % 3 ? 20 : 26}" transform="rotate(${i * 30} 100 100)" style="stroke:var(--muted);stroke-width:2"/>`).join('');
  return `
    <div class="card">
      <h3>🧭 اتجاه القبلة <span class="muted">${esc(settings.cityName)}</span></h3>
      <div class="row" style="justify-content:center;gap:16px">
        <svg viewBox="0 0 200 200" width="170" height="170" role="img" aria-label="بوصلة القبلة">
          <circle cx="100" cy="100" r="92" style="fill:var(--surface-2);stroke:var(--border);stroke-width:2"/>
          ${ticks}
          <text x="100" y="44" text-anchor="middle" style="fill:var(--primary);font-size:15px;font-weight:700">ش</text>
          <text x="164" y="105" text-anchor="middle" style="fill:var(--muted);font-size:14px">ق</text>
          <text x="100" y="168" text-anchor="middle" style="fill:var(--muted);font-size:14px">ج</text>
          <text x="36" y="105" text-anchor="middle" style="fill:var(--muted);font-size:14px">غ</text>
          <g transform="rotate(${bearing.toFixed(1)} 100 100)">
            <polygon points="100,30 110,100 100,92 90,100" style="fill:var(--gold)"/>
            <polygon points="100,170 108,100 100,108 92,100" style="fill:var(--border)"/>
            <rect x="92" y="14" width="16" height="16" rx="2" style="fill:#1b1b1b;stroke:var(--gold);stroke-width:2"/>
          </g>
          <circle cx="100" cy="100" r="5" style="fill:var(--primary)"/>
        </svg>
        <div>
          <div style="font-size:30px;font-weight:700;color:var(--primary)">${arNum(Math.round(bearing))}°</div>
          <div>نحو ${directionName(bearing)}</div>
          <div class="muted">من الشمال باتجاه عقارب الساعة</div>
          <div class="muted" style="margin-top:6px">🕋 المسافة إلى الكعبة: ${arNum(Math.round(distanceKm))} كم</div>
        </div>
      </div>
      <div class="muted" style="margin-top:6px">💡 وجّه أعلى البوصلة (ش) نحو الشمال الحقيقي، ثم اتجه حيث يشير السهم.</div>
    </div>`;
}

// ---------- quran reader ----------

async function quran(surah, ayah) {
  if (surah) return reader(Number(surah), Number(ayah) || 1);
  const bookmarks = await local.get('bookmarks', []);
  view.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <input class="input" id="q" placeholder="ابحث باسم السورة أو رقمها…">
    </div>
    <div class="row" style="margin-bottom:10px">
      <input class="input" id="qs" placeholder="بحث في آيات القرآن (كلمة)…">
      <button class="btn primary" id="qsBtn">بحث</button>
    </div>
    ${bookmarks.length ? `<div class="chips">${bookmarks.map((b, i) => `<span class="chip" data-bm="${i}">📌 ${SURAHS[b.surah - 1].name} ${arNum(b.ayah)}</span>`).join('')}</div>` : ''}
    <div class="list" id="sl"></div>`;

  const renderList = (filter = '') => {
    const f = filter.trim();
    $('#sl').innerHTML = SURAHS.filter((s) => !f || s.name.includes(f) || String(s.number) === f)
      .map((s) => `<div class="item" data-s="${s.number}"><span class="num">${arNum(s.number)}</span>
        <div class="grow"><div class="title">سورة ${s.name}</div><div class="sub">${s.type} — ${arNum(s.ayahs)} آية</div></div></div>`).join('');
  };
  renderList();
  $('#q').addEventListener('input', (e) => renderList(e.target.value));
  $('#sl').addEventListener('click', (e) => {
    const it = e.target.closest('[data-s]');
    if (it) reader(Number(it.dataset.s), 1);
  });
  $$('[data-bm]').forEach((c) => c.addEventListener('click', () => {
    const b = bookmarks[c.dataset.bm];
    reader(b.surah, b.ayah);
  }));

  const doSearch = async () => {
    const q = $('#qs').value.trim();
    if (q.length < 2) return toast('اكتب كلمة من حرفين على الأقل');
    $('#sl').innerHTML = loader('جارِ البحث…');
    try {
      const { data } = await cachedFetch(`${QURAN_API}/search/${encodeURIComponent(q)}/all/quran-simple-clean`, DAY);
      const matches = data?.matches || [];
      $('#sl').innerHTML = `<div class="muted" style="margin-bottom:6px">${arNum(data?.count || 0)} نتيجة</div>` +
        matches.slice(0, 150).map((m) => `<div class="item" data-sr="${m.surah.number}" data-ar="${m.numberInSurah}">
          <div class="grow"><div class="quran-text" style="font-size:18px;line-height:1.8">${esc(m.text)}</div>
          <div class="sub">سورة ${SURAHS[m.surah.number - 1].name} — آية ${arNum(m.numberInSurah)}</div></div></div>`).join('');
      $$('[data-sr]').forEach((el) => el.addEventListener('click', () => reader(Number(el.dataset.sr), Number(el.dataset.ar))));
    } catch {
      $('#sl').innerHTML = `<div class="card muted">لا توجد نتائج.</div>`;
    }
  };
  $('#qsBtn').addEventListener('click', doSearch);
  $('#qs').addEventListener('keydown', (e) => e.key === 'Enter' && doSearch());
}

async function reader(n, focusAyah = 1) {
  const meta = SURAHS[n - 1];
  view.innerHTML = loader(`سورة ${meta.name}…`);
  let data;
  try {
    ({ data } = await cachedFetch(`${QURAN_API}/surah/${n}/editions/quran-uthmani,ar.muyassar`));
  } catch {
    view.innerHTML = errorBox();
    return;
  }
  if (currentTab !== 'quran') return;
  const ayahs = data[0].ayahs.map((a, i) => {
    let text = a.text.replace('﻿', '');
    const words = text.split(' ');
    if (n !== 1 && n !== 9 && i === 0 && words[0] === 'بِسْمِ' && words.length > 4) text = words.slice(4).join(' ');
    return { n: a.numberInSurah, text, tafsir: data[1].ayahs[i].text, page: a.page, juz: a.juz };
  });
  local.set('lastRead', { surah: n, ayah: focusAyah });
  if (n === 18 && new Date().getDay() === 5) local.set('kahfDone', todayKey());

  const render = () => {
    document.documentElement.style.setProperty('--qsize', `${settings.fontSize}px`);
    const body = settings.showTafsir
      ? ayahs.map((a) => `<div class="ayah-block"><div class="quran-text"><span class="ayah" data-a="${a.n}">${esc(a.text)} <span class="ayah-num">﴿${arNum(a.n)}﴾</span></span></div><div class="tafsir">${esc(a.tafsir)}</div></div>`).join('')
      : `<div class="quran-text">${ayahs.map((a) => `<span class="ayah" data-a="${a.n}">${esc(a.text)} <span class="ayah-num">﴿${arNum(a.n)}﴾</span></span>`).join(' ')}</div>`;
    view.innerHTML = `
      <div class="row spread" style="margin-bottom:8px">
        <button class="btn sm" id="back">→ الفهرس</button>
        <div class="row">
          <button class="icon-btn" id="fminus" title="تصغير الخط">A-</button>
          <button class="icon-btn" id="fplus" title="تكبير الخط">A+</button>
          <button class="btn sm ${settings.showTafsir ? 'primary' : ''}" id="tafsirBtn">التفسير الميسر</button>
        </div>
      </div>
      <div class="surah-head">
        <h2>سورة ${meta.name}</h2>
        <small>${meta.type} — ${arNum(meta.ayahs)} آية — الجزء ${arNum(ayahs[0].juz)} — صفحة ${arNum(ayahs[0].page)}</small>
        <div class="row" style="justify-content:center;margin-top:8px">
          <button class="btn sm" id="playAll">▶ استمع للسورة</button>
          <select class="input" id="rec" style="width:auto;padding:4px 8px">${AYAH_RECITERS.map((r) => `<option value="${r.id}" ${r.id === settings.ayahReciter ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
        </div>
      </div>
      ${n !== 1 && n !== 9 ? `<div class="basmala">${BASMALA}</div>` : ''}
      <div class="card" id="qbody">${body}</div>
      <div class="row spread">
        <button class="btn" id="nextS" ${n === 114 ? 'disabled' : ''}>← سورة ${n < 114 ? SURAHS[n].name : ''}</button>
        <button class="btn" id="prevS" ${n === 1 ? 'disabled' : ''}>سورة ${n > 1 ? SURAHS[n - 2].name : ''} →</button>
      </div>`;
    bind();
  };

  const playFrom = async (index) => {
    toast('جارِ تجهيز التلاوة…');
    try {
      const { data: rec } = await cachedFetch(`${QURAN_API}/surah/${n}/${settings.ayahReciter}`);
      const name = AYAH_RECITERS.find((r) => r.id === settings.ayahReciter)?.name || '';
      await audio('play', {
        kind: 'ayahs', meta: { surah: n }, index,
        items: rec.ayahs.map((a) => ({ url: a.audio, title: `سورة ${meta.name} — آية ${arNum(a.numberInSurah)}`, subtitle: name })),
      });
    } catch {
      toast('تعذّر تحميل التلاوة');
    }
  };

  const highlight = (num, scroll) => {
    $$('.ayah.current').forEach((e) => e.classList.remove('current'));
    const el = $(`.ayah[data-a="${num}"]`);
    if (!el) return;
    el.classList.add('current');
    if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  function bind() {
    $('#back').addEventListener('click', () => quran());
    $('#fplus').addEventListener('click', () => { saveSettings({ fontSize: Math.min(44, settings.fontSize + 2) }); document.documentElement.style.setProperty('--qsize', `${settings.fontSize}px`); });
    $('#fminus').addEventListener('click', () => { saveSettings({ fontSize: Math.max(16, settings.fontSize - 2) }); document.documentElement.style.setProperty('--qsize', `${settings.fontSize}px`); });
    $('#tafsirBtn').addEventListener('click', async () => { await saveSettings({ showTafsir: !settings.showTafsir }); render(); });
    $('#rec').addEventListener('change', (e) => saveSettings({ ayahReciter: e.target.value }));
    $('#playAll').addEventListener('click', () => playFrom(0));
    $('#nextS').addEventListener('click', () => reader(n + 1, 1));
    $('#prevS').addEventListener('click', () => reader(n - 1, 1));

    $('#qbody').addEventListener('click', (e) => {
      if (e.target.closest('.popover')) return;
      const el = e.target.closest('.ayah');
      if (!el) return;
      const a = ayahs[Number(el.dataset.a) - 1];
      $('.popover')?.remove();
      highlight(a.n);
      local.set('lastRead', { surah: n, ayah: a.n });
      const pop = document.createElement('div');
      pop.className = 'popover';
      pop.innerHTML = `
        <button class="btn sm" data-act="play">▶ استمع من هنا</button>
        <button class="btn sm" data-act="bm">📌 علامة</button>
        <button class="btn sm" data-act="copy">📋 نسخ</button>
        ${settings.showTafsir ? '' : '<button class="btn sm" data-act="tafsir">📖 التفسير</button>'}
        <button class="btn sm" data-act="close">✕</button>`;
      (el.closest('.ayah-block') || el).after(pop);
      pop.addEventListener('click', async (ev) => {
        const act = ev.target.closest('[data-act]')?.dataset.act;
        if (act === 'play') playFrom(a.n - 1);
        if (act === 'copy') copy(`${a.text} ﴿${arNum(a.n)}﴾ [سورة ${meta.name}]`);
        if (act === 'bm') {
          const bms = (await local.get('bookmarks', [])).filter((b) => !(b.surah === n && b.ayah === a.n));
          bms.unshift({ surah: n, ayah: a.n });
          await local.set('bookmarks', bms.slice(0, 12));
          toast('تم حفظ العلامة 📌');
        }
        if (act === 'tafsir') {
          pop.innerHTML = `<div class="tafsir" style="margin:0;color:var(--text)">${esc(a.tafsir)}</div>`;
          return;
        }
        if (act && act !== 'tafsir') pop.remove();
      });
    });
  }

  let lastAyah = 0;
  stateHandlers.push((s) => {
    if (s.kind === 'ayahs' && s.meta?.surah === n && !s.closed) {
      const num = s.index + 1;
      if (num !== lastAyah) {
        lastAyah = num;
        highlight(num, true);
      }
    }
  });

  render();
  if (focusAyah > 1) setTimeout(() => highlight(focusAyah, true), 50);
  else view.scrollTop = 0;
}

// ---------- khatma ----------

async function khatma(page) {
  const k = await local.get('khatma');
  if (!k?.active) return khatmaSetup(k);
  if (page) return khatmaPage(k, Number(page));

  const target = dailyTarget(k);
  const remaining = todayRemaining(k);
  const behind = expectedPages(k) - k.pagesDone - remaining;
  const pct = Math.round((k.pagesDone / TOTAL_PAGES) * 100);
  const from = k.pagesDone + 1;
  const to = Math.min(TOTAL_PAGES, k.pagesDone + Math.max(remaining, 1));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
  const maxLog = Math.max(target, ...days.map((d) => k.log[dateKey(d)] || 0));

  view.innerHTML = `
    <div class="surah-head">
      <h2>📗 ختمة في ${arNum(k.days)} يوماً</h2>
      <small>اليوم ${arNum(daysElapsed(k) + 1)} من ${arNum(k.days)} — الورد اليومي ${arNum(target)} صفحة</small>
    </div>
    <div class="card">
      <div class="row spread"><b>التقدم الكلي</b><span>${arNum(k.pagesDone)} / ${arNum(TOTAL_PAGES)} صفحة — ${arNum(pct)}٪</span></div>
      <div class="progress" style="height:10px;margin:8px 0"><div style="width:${pct}%"></div></div>
      <div class="row spread muted">
        <span>🔥 ${arNum(streak(k))} يوم متتالي</span>
        <span>${behind > 0 ? `⚠️ متأخر ${arNum(behind)} صفحة` : '✓ على الخطة'}</span>
        <span>🏆 ختمات: ${arNum(k.completed)}</span>
      </div>
    </div>
    <div class="card">
      <h3>📖 ورد اليوم</h3>
      ${remaining > 0
        ? `<div class="muted" style="margin-bottom:8px">من صفحة ${arNum(from)} إلى ${arNum(to)} — قرأت اليوم ${arNum(readToday(k))} صفحة</div>
           <button class="btn primary" id="readWird" style="width:100%;justify-content:center">ابدأ القراءة من صفحة ${arNum(from)}</button>`
        : `<div style="margin-bottom:8px">🎉 أتممت ورد اليوم، تقبّل الله منك</div>
           <button class="btn" id="readWird" style="width:100%;justify-content:center">اقرأ المزيد من صفحة ${arNum(from)}</button>`}
    </div>
    <div class="card">
      <h3>📊 آخر ٧ أيام</h3>
      <div class="row" style="align-items:flex-end;height:80px;gap:6px">
        ${days.map((d) => {
          const v = k.log[dateKey(d)] || 0;
          return `<div class="grow" style="text-align:center"><div style="height:${Math.round((v / maxLog) * 56)}px;min-height:2px;background:${v >= target ? 'var(--primary)' : 'var(--gold)'};border-radius:4px"></div><small class="muted">${d.toLocaleDateString('ar-EG', { weekday: 'narrow' })}</small></div>`;
        }).join('')}
      </div>
    </div>
    <div class="row spread">
      <button class="btn sm" id="newPlan">↺ خطة جديدة</button>
      <button class="btn sm" id="stopPlan">إيقاف الختمة</button>
    </div>`;

  $('#readWird').addEventListener('click', () => khatmaPage(k, from));
  $('#newPlan').addEventListener('click', () => khatmaSetup(k));
  $('#stopPlan').addEventListener('click', async () => {
    if (!confirm('إيقاف الختمة الحالية؟ سيُحفظ عدد الختمات المكتملة.')) return;
    await local.set('khatma', { ...k, active: false });
    khatma();
  });
}

function khatmaSetup(prev) {
  let days = prev?.days || 30;
  view.innerHTML = `
    <div class="surah-head"><h2>📗 ابدأ ختمة جديدة</h2><small>اختر المدة وسنقسّم لك المصحف (٦٠٤ صفحة) إلى ورد يومي</small></div>
    <div class="card">
      <h3>المدة</h3>
      <div class="chips" id="plans">${KHATMA_PLANS.map((d) => `<span class="chip" data-d="${d}">${arNum(d)} يوم</span>`).join('')}</div>
      <div class="muted" id="planInfo"></div>
      <div class="setting"><span>أبدأ من صفحة</span><input class="input" type="number" id="startPage" min="1" max="${TOTAL_PAGES}" value="1" style="width:100px"></div>
      <button class="btn primary" id="start" style="width:100%;justify-content:center;margin-top:8px">بسم الله، ابدأ</button>
    </div>
    ${prev?.completed ? `<div class="card muted">🏆 أتممت ${arNum(prev.completed)} ختمة — بارك الله فيك</div>` : ''}
    <div class="card muted">«اقرءوا القرآن فإنه يأتي يوم القيامة شفيعاً لأصحابه» — رواه مسلم</div>`;

  const update = () => {
    $$('#plans .chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.d) === days));
    $('#planInfo').textContent = `الورد اليومي: ${arNum(Math.ceil(TOTAL_PAGES / days))} صفحة (≈ ${arNum(Math.round((30 / days) * 10) / 10)} جزء)`;
  };
  update();
  $('#plans').addEventListener('click', (e) => { const c = e.target.closest('[data-d]'); if (c) { days = Number(c.dataset.d); update(); } });
  $('#start').addEventListener('click', async () => {
    const k = newKhatma(days, prev);
    k.pagesDone = Math.min(TOTAL_PAGES - 1, Math.max(0, Number($('#startPage').value) - 1));
    await local.set('khatma', k);
    toast('بدأت الختمة، أعانك الله 🤍');
    khatma();
  });
}

async function khatmaPage(k, n) {
  view.innerHTML = loader(`صفحة ${arNum(n)}…`);
  let data;
  try {
    ({ data } = await cachedFetch(`${QURAN_API}/page/${n}/quran-uthmani`));
  } catch {
    view.innerHTML = errorBox();
    return;
  }
  if (currentTab !== 'khatma') return;

  const body = data.ayahs.map((a) => {
    const s = a.surah.number;
    let text = a.text.replace('﻿', '');
    let head = '';
    if (a.numberInSurah === 1) {
      const words = text.split(' ');
      if (s !== 1 && s !== 9 && words[0] === 'بِسْمِ' && words.length > 4) text = words.slice(4).join(' ');
      head = `</div><div class="surah-head" style="padding:6px;margin:10px 0 4px"><h2 style="font-size:20px">سورة ${SURAHS[s - 1].name}</h2></div>
        ${s !== 1 && s !== 9 ? `<div class="basmala">${BASMALA}</div>` : ''}<div class="quran-text">`;
    }
    return `${head}<span class="ayah">${esc(text)} <span class="ayah-num">﴿${arNum(a.numberInSurah)}﴾</span></span>`;
  }).join(' ');

  const remaining = todayRemaining(k);
  view.innerHTML = `
    <div class="row spread" style="margin-bottom:8px">
      <button class="btn sm" id="back">→ الختمة</button>
      <span class="muted">صفحة ${arNum(n)} — الجزء ${arNum(data.ayahs[0].juz)}</span>
      <span class="muted">${remaining ? `باقي ${arNum(remaining)}` : '✓ تم الورد'}</span>
    </div>
    <div class="card"><div class="quran-text">${body}</div></div>
    <div class="row spread">
      <button class="btn primary" id="nextP" ${n >= TOTAL_PAGES ? 'disabled' : ''}>قرأتها، التالية ←</button>
      <button class="btn" id="doneP">✓ أنهيت هنا</button>
      <button class="btn" id="prevP" ${n <= 1 ? 'disabled' : ''}>→ السابقة</button>
    </div>`;
  view.scrollTop = 0;

  const markRead = async () => {
    const before = todayRemaining(k);
    recordPages(k, n);
    if (k.pagesDone >= TOTAL_PAGES) {
      k.active = false;
      k.completed += 1;
      await local.set('khatma', k);
      view.innerHTML = `<div class="surah-head" style="padding:30px 10px"><h2>🎉 مبارك! أتممت ختم القرآن الكريم</h2>
        <small>ختمتك رقم ${arNum(k.completed)} — تقبّل الله منك وجعله حجةً لك</small></div>
        <button class="btn primary" id="again" style="width:100%;justify-content:center">ابدأ ختمة جديدة</button>`;
      $('#again').addEventListener('click', () => khatmaSetup(k));
      return true;
    }
    await local.set('khatma', k);
    if (before > 0 && todayRemaining(k) === 0) toast('🎉 أتممت ورد اليوم، تقبّل الله منك');
    return false;
  };

  $('#back').addEventListener('click', () => khatma());
  $('#prevP').addEventListener('click', () => khatmaPage(k, n - 1));
  $('#nextP').addEventListener('click', async () => { if (!(await markRead())) khatmaPage(k, n + 1); });
  $('#doneP').addEventListener('click', async () => { if (!(await markRead())) khatma(); });
}

// ---------- reciters ----------

async function listen(reciterId) {
  view.innerHTML = loader('جارِ تحميل القراء…');
  let reciters;
  try {
    ({ reciters } = await cachedFetch(`${MP3_API}/reciters?language=ar`, 3 * DAY));
  } catch {
    view.innerHTML = errorBox();
    return;
  }
  if (currentTab !== 'listen') return;
  if (reciterId) return reciterView(reciters.find((r) => r.id === Number(reciterId)));

  const favs = new Set(await local.get('favReciters', []));
  view.innerHTML = `
    <input class="input" id="rq" placeholder="ابحث عن قارئ… (${arNum(reciters.length)} قارئ)" style="margin-bottom:10px">
    <div class="list" id="rl"></div>`;
  const renderList = (f = '') => {
    const list = reciters
      .filter((r) => !f || r.name.includes(f))
      .sort((a, b) => (favs.has(b.id) - favs.has(a.id)) || a.name.localeCompare(b.name, 'ar'));
    $('#rl').innerHTML = list.map((r) => `
      <div class="item ${playerState?.meta?.reciterId === r.id ? 'playing' : ''}" data-r="${r.id}">
        <span class="num">🎧</span>
        <div class="grow"><div class="title">${esc(r.name)}</div><div class="sub">${r.moshaf.map((m) => esc(m.name)).join(' • ')}</div></div>
        <button class="star ${favs.has(r.id) ? 'on' : ''}" data-fav="${r.id}" title="المفضلة">⭐</button>
      </div>`).join('');
  };
  renderList();
  $('#rq').addEventListener('input', (e) => renderList(e.target.value.trim()));
  $('#rl').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const id = Number(fav.dataset.fav);
      favs.has(id) ? favs.delete(id) : favs.add(id);
      local.set('favReciters', [...favs]);
      renderList($('#rq').value.trim());
      return;
    }
    const it = e.target.closest('[data-r]');
    if (it) reciterView(reciters.find((r) => r.id === Number(it.dataset.r)));
  });
}

function reciterView(r, moshafIdx = r.moshaf.reduce((best, m, i, all) => (m.surah_total > all[best].surah_total ? i : best), 0)) {
  const moshaf = r.moshaf[moshafIdx];
  const surahs = moshaf.surah_list.split(',').map(Number);
  const items = surahs.map((s) => ({
    url: `${moshaf.server}${pad3(s)}.mp3`, title: `سورة ${SURAHS[s - 1].name}`, subtitle: r.name,
  }));
  const meta = { reciterId: r.id, moshafId: moshaf.id };
  view.innerHTML = `
    <div class="row spread" style="margin-bottom:8px">
      <button class="btn sm" id="back">→ القراء</button>
      <button class="btn sm primary" id="playAll">▶ تشغيل الكل</button>
    </div>
    <div class="surah-head"><h2>${esc(r.name)}</h2><small>${arNum(surahs.length)} سورة</small></div>
    ${r.moshaf.length > 1 ? `<div class="chips">${r.moshaf.map((m, i) => `<span class="chip ${i === moshafIdx ? 'active' : ''}" data-m="${i}">${esc(m.name)}</span>`).join('')}</div>` : ''}
    <input class="input" id="sq" placeholder="ابحث عن سورة…" style="margin-bottom:8px">
    <div class="list" id="sl"></div>`;

  const isPlaying = (i) => playerState?.meta?.moshafId === moshaf.id && playerState?.index === i && !playerState?.closed;
  const renderList = (f = '') => {
    $('#sl').innerHTML = surahs.map((s, i) => ({ s, i })).filter(({ s }) => !f || SURAHS[s - 1].name.includes(f) || String(s) === f)
      .map(({ s, i }) => `<div class="item ${isPlaying(i) ? 'playing' : ''}" data-i="${i}">
        <span class="num">${arNum(s)}</span><div class="grow"><div class="title">سورة ${SURAHS[s - 1].name}</div></div>
        <a class="icon-btn" href="${esc(items[i].url)}" target="_blank" title="تحميل MP3" data-dl>⬇</a>
        <span>${isPlaying(i) ? '🔊' : '▶'}</span></div>`).join('');
  };
  renderList();
  $('#sq').addEventListener('input', (e) => renderList(e.target.value.trim()));
  $('#back').addEventListener('click', () => listen());
  $('#playAll').addEventListener('click', () => audio('play', { items, index: 0, kind: 'surah', meta }));
  $$('[data-m]').forEach((c) => c.addEventListener('click', () => reciterView(r, Number(c.dataset.m))));
  $('#sl').addEventListener('click', (e) => {
    if (e.target.closest('[data-dl]')) return;
    const it = e.target.closest('[data-i]');
    if (it) audio('play', { items, index: Number(it.dataset.i), kind: 'surah', meta });
  });
  stateHandlers.push(() => renderList($('#sq')?.value.trim() || ''));
}

// ---------- radio ----------

async function radio() {
  view.innerHTML = loader('جارِ تحميل الإذاعات…');
  let radios;
  try {
    ({ radios } = await cachedFetch(`${MP3_API}/radios?language=ar`, 3 * DAY));
  } catch {
    radios = [];
  }
  const featuredUrls = new Set(FEATURED_RADIOS.map((r) => r.url));
  radios = [...FEATURED_RADIOS, ...radios.filter((r) => !featuredUrls.has(r.url))];
  if (currentTab !== 'radio') return;
  const favs = new Set(await local.get('favRadios', []));
  view.innerHTML = `
    <div class="card" style="background:var(--hl)"><b>📻 إذاعات القرآن الكريم على مدار الساعة</b><div class="muted">${arNum(radios.length)} إذاعة — بث مباشر</div></div>
    <input class="input" id="rq" placeholder="ابحث عن إذاعة أو قارئ…" style="margin-bottom:10px">
    <div class="list" id="rl"></div>`;
  const renderList = (f = '') => {
    $('#rl').innerHTML = radios.filter((r) => !f || r.name.includes(f))
      .sort((a, b) => (!!b.featured - !!a.featured) || (favs.has(b.id) - favs.has(a.id)))
      .map((r) => {
        const on = playerState?.kind === 'radio' && playerState?.meta?.id === r.id && !playerState?.closed;
        return `<div class="item ${on ? 'playing' : ''}" data-r="${r.id}"><span class="num">${on ? '🔊' : '📻'}</span>
          <div class="grow"><div class="title">${esc(r.name)}</div>${r.featured ? '<div class="sub">📌 إذاعة مميزة</div>' : ''}</div>
          <button class="star ${favs.has(r.id) ? 'on' : ''}" data-fav="${r.id}">⭐</button></div>`;
      }).join('');
  };
  renderList();
  $('#rq').addEventListener('input', (e) => renderList(e.target.value.trim()));
  $('#rl').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const id = Number(fav.dataset.fav);
      favs.has(id) ? favs.delete(id) : favs.add(id);
      local.set('favRadios', [...favs]);
      return renderList($('#rq').value.trim());
    }
    const it = e.target.closest('[data-r]');
    if (!it) return;
    const r = radios.find((x) => x.id === Number(it.dataset.r));
    audio('play', { kind: 'radio', meta: { id: r.id }, items: [{ url: r.url, title: r.name, subtitle: 'بث مباشر 🔴' }] });
  });
  stateHandlers.push(() => renderList($('#rq')?.value.trim() || ''));
}

// ---------- live TV ----------

async function tv(channelIdx = 0) {
  view.innerHTML = loader('جارِ تحميل القنوات…');
  let channels = [];
  try {
    ({ livetv: channels } = await cachedFetch(`${MP3_API}/live-tv?language=ar`, DAY));
  } catch {
    channels = [
      { id: 3, name: 'قناة القرآن الكريم', url: 'https://win.holol.com/live/quran/playlist.m3u8' },
      { id: 4, name: 'قناة السنة النبوية', url: 'https://win.holol.com/live/sunnah/playlist.m3u8' },
    ];
  }
  if (currentTab !== 'tv') return;
  const ch = channels[channelIdx] || channels[0];
  view.innerHTML = `
    <div class="chips">${channels.map((c, i) => `<span class="chip ${i === channelIdx ? 'active' : ''}" data-c="${i}">${esc(c.name)}</span>`).join('')}</div>
    <video id="vid" controls autoplay playsinline></video>
    <div class="card" style="margin-top:10px">
      <h3>🔴 ${esc(ch.name)}</h3>
      <div class="muted">بث مباشر من ${ch.url.includes('quran') ? 'المسجد الحرام — مكة المكرمة' : 'المسجد النبوي — المدينة المنورة'}.</div>
      ${isFull ? '' : '<button class="btn sm" id="bigTv" style="margin-top:8px">⤢ مشاهدة بحجم أكبر</button>'}
    </div>`;
  $$('[data-c]').forEach((c) => c.addEventListener('click', () => go('tv', Number(c.dataset.c))));
  $('#bigTv')?.addEventListener('click', () => { chrome.tabs.create({ url: 'popup.html?full=1#tv' }); window.close(); });

  if (playerState?.playing) audio('pause');
  const video = $('#vid');
  if (window.Hls?.isSupported()) {
    const hls = new window.Hls({ lowLatencyMode: true });
    hls.loadSource(ch.url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.ERROR, (_e, d) => { if (d.fatal) toast('تعذّر تشغيل البث'); });
    cleanups.push(() => hls.destroy());
  } else {
    video.src = ch.url;
  }
  cleanups.push(() => { video.pause(); video.removeAttribute('src'); });
}

// ---------- azkar ----------

async function azkar(catId) {
  if (catId === 'names') return namesView();
  if (catId) return azkarCategory(AZKAR.find((c) => c.id === catId));
  view.innerHTML = `
    <div class="grid">
      ${AZKAR.map((c) => `<div class="tile" data-cat="${c.id}"><b>${c.icon}</b><span>${c.title}</span></div>`).join('')}
      <div class="tile" data-cat="names"><b>✨</b><span>أسماء الله الحسنى</span></div>
    </div>
    <div class="card" style="margin-top:10px">
      <h3>🔔 تذكير بالذكر</h3>
      <div class="muted">يظهر لك تذكير كل ${everyLabel(settings.zekrInterval)} ${settings.zekrEnabled ? '(مفعّل)' : '(متوقف)'} — غيّر ذلك من الإعدادات.</div>
    </div>`;
  $$('[data-cat]').forEach((t) => t.addEventListener('click', () => azkar(t.dataset.cat)));
}

async function azkarCategory(cat) {
  const store = await local.get('azkarProgress', {});
  const progress = store.date === todayKey() ? store : { date: todayKey() };
  const counts = progress[cat.id] || {};
  const save = () => { progress[cat.id] = counts; local.set('azkarProgress', progress); };

  view.innerHTML = `
    <div class="row spread" style="margin-bottom:8px">
      <button class="btn sm" id="back">→ الأذكار</button>
      <b>${cat.icon} ${cat.title}</b>
      <button class="btn sm" id="reset">↺ إعادة</button>
    </div>
    <div class="progress" style="margin-bottom:10px"><div id="prog"></div></div>
    <div id="zl">${cat.items.map((z, i) => `
      <div class="card zekr" data-i="${i}">
        <div class="text">${esc(z.text)}</div>
        ${z.note ? `<div class="note">💡 ${esc(z.note)}</div>` : ''}
        <button class="count-btn"></button>
      </div>`).join('')}</div>`;

  const update = () => {
    let done = 0;
    cat.items.forEach((z, i) => {
      const c = counts[i] || 0;
      const card = $(`.zekr[data-i="${i}"]`);
      card.classList.toggle('done', c >= z.count);
      card.querySelector('.count-btn').textContent = c >= z.count ? '✓ تمّ' : `${arNum(c)} / ${arNum(z.count)} — اضغط للعدّ`;
      if (c >= z.count) done++;
    });
    $('#prog').style.width = `${(done / cat.items.length) * 100}%`;
    if (done === cat.items.length) toast('تقبّل الله منك 🤍');
  };
  update();
  $('#zl').addEventListener('click', (e) => {
    const card = e.target.closest('.zekr');
    if (!card) return;
    const i = Number(card.dataset.i);
    const z = cat.items[i];
    if ((counts[i] || 0) >= z.count) return;
    counts[i] = (counts[i] || 0) + 1;
    save();
    update();
    if (counts[i] >= z.count) {
      const nextCard = $(`.zekr[data-i="${i + 1}"]`);
      nextCard?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
  $('#back').addEventListener('click', () => azkar());
  $('#reset').addEventListener('click', () => { Object.keys(counts).forEach((k) => delete counts[k]); save(); update(); });
}

function namesView() {
  view.innerHTML = `
    <div class="row spread" style="margin-bottom:8px"><button class="btn sm" id="back">→ الأذكار</button><b>✨ أسماء الله الحسنى</b><span></span></div>
    <div class="card muted">«إن لله تسعة وتسعين اسماً، مائة إلا واحداً، من أحصاها دخل الجنة» — متفق عليه</div>
    <div class="names">${ASMA_ALHUSNA.map((n, i) => `<div><i>${arNum(i + 1)}</i>${n}</div>`).join('')}</div>`;
  $('#back').addEventListener('click', () => azkar());
}

// ---------- hadith ----------

async function hadith() {
  const saved = await local.get('hadithPos', { book: 'bukhari', n: 1 });
  let book = HADITH_BOOKS.find((b) => b.id === saved.book) || HADITH_BOOKS[0];
  let n = saved.n;

  view.innerHTML = `
    <div class="chips" id="books">${HADITH_BOOKS.map((b) => `<span class="chip" data-b="${b.id}">${b.name}</span>`).join('')}</div>
    <div class="row" style="margin-bottom:10px">
      <button class="btn primary" id="rand">🎲 حديث عشوائي</button>
      <input class="input" id="hn" type="number" min="1" placeholder="رقم الحديث" style="width:110px">
      <button class="btn" id="goN">اذهب</button>
    </div>
    <div class="card" id="hc"></div>
    <div class="row spread">
      <button class="btn" id="prev">→ السابق</button>
      <button class="btn" id="copyH">📋 نسخ</button>
      <button class="btn" id="next">التالي ←</button>
    </div>`;

  let currentText = '';
  const load = async (num, tries = 0) => {
    n = Math.min(Math.max(1, num), book.max);
    $$('#books .chip').forEach((c) => c.classList.toggle('active', c.dataset.b === book.id));
    $('#hc').innerHTML = loader();
    try {
      const d = await cachedFetch(`${HADITH_API}/ara-${book.id}/${n}.json`);
      const h = d.hadiths[0];
      if (!h?.text?.trim()) throw new Error('empty');
      currentText = `${h.text}\n[${book.name} — ${h.hadithnumber}]`;
      $('#hc').innerHTML = `<h3>📜 ${book.name} <span class="muted">حديث رقم ${arNum(h.hadithnumber)}</span></h3>
        <div class="hadith-text">${esc(h.text)}</div>`;
      local.set('hadithPos', { book: book.id, n });
    } catch {
      if (tries < 3) return load(Math.floor(Math.random() * book.max) + 1, tries + 1);
      $('#hc').innerHTML = errorBox();
    }
  };
  $('#books').addEventListener('click', (e) => {
    const c = e.target.closest('[data-b]');
    if (!c) return;
    book = HADITH_BOOKS.find((b) => b.id === c.dataset.b);
    load(1);
  });
  $('#rand').addEventListener('click', () => load(Math.floor(Math.random() * book.max) + 1));
  $('#goN').addEventListener('click', () => load(Number($('#hn').value) || 1));
  $('#prev').addEventListener('click', () => load(n - 1));
  $('#next').addEventListener('click', () => load(n + 1));
  $('#copyH').addEventListener('click', () => currentText && copy(currentText));
  load(n);
}

// ---------- prayer times ----------

function prayer() {
  const render = () => {
    const times = computeTimes(new Date(), settings.lat, settings.lng, settings.method, settings.asrFactor);
    const np = nextPrayer(settings.lat, settings.lng, settings.method, settings.asrFactor);
    view.innerHTML = `
      <div class="card">
        <h3>⏳ ${prayerName(np.key, np.time)} بعد <span class="muted">${esc(settings.cityName)}</span></h3>
        <div class="countdown" id="cd"></div>
      </div>
      <div class="card">
        <table class="prayer-table">
          ${Object.entries(times).map(([k, t]) => `<tr class="${k === np.key && t.getTime() === np.time.getTime() ? 'next' : ''}"><td>${prayerName(k, t)}</td><td>${clock(t)}</td></tr>`).join('')}
        </table>
      </div>
      <div class="card">
        <h3>📍 الموقع وطريقة الحساب</h3>
        <div class="row" style="margin-bottom:8px">
          <select class="input" id="city"><option value="">— اختر مدينة —</option>${CITIES.map((c, i) => `<option value="${i}" ${c.name === settings.cityName ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
          <button class="btn" id="geo">📍 موقعي</button>
        </div>
        <div class="setting"><span>طريقة الحساب</span><select class="input" id="method">${Object.entries(METHODS).map(([k, m]) => `<option value="${k}" ${k === settings.method ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>
        <div class="setting"><span>حساب العصر</span><select class="input" id="asr"><option value="1">الجمهور (شافعي/مالكي/حنبلي)</option><option value="2" ${settings.asrFactor === 2 ? 'selected' : ''}>الحنفي</option></select></div>
        <div class="setting"><span>تنبيه عند الأذان</span><label class="switch"><input type="checkbox" id="pn" ${settings.prayerNotify ? 'checked' : ''}><span></span></label></div>
        <div class="muted">الإحداثيات: ${settings.lat.toFixed(3)}, ${settings.lng.toFixed(3)}</div>
      </div>
      ${qiblaCard()}`;

    const cd = $('#cd');
    const tick = () => {
      const diff = Math.max(0, np.time - Date.now());
      cd.textContent = fmtTime(diff / 1000);
      if (diff <= 0) render();
    };
    tick();
    const iv = setInterval(tick, 1000);
    cleanups.push(() => clearInterval(iv));

    $('#city').addEventListener('change', async (e) => {
      const c = CITIES[e.target.value];
      if (!c) return;
      await saveSettings({ lat: c.lat, lng: c.lng, cityName: c.name, method: c.method });
      render();
    });
    $('#geo').addEventListener('click', () => {
      toast('جارِ تحديد موقعك…');
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await saveSettings({ lat: pos.coords.latitude, lng: pos.coords.longitude, cityName: 'موقعي الحالي' });
        toast('تم تحديد الموقع ✓');
        render();
      }, () => toast('تعذّر تحديد الموقع — اختر مدينة من القائمة'), { timeout: 10000 });
    });
    $('#method').addEventListener('change', async (e) => { await saveSettings({ method: e.target.value }); render(); });
    $('#asr').addEventListener('change', async (e) => { await saveSettings({ asrFactor: Number(e.target.value) }); render(); });
    $('#pn').addEventListener('change', (e) => saveSettings({ prayerNotify: e.target.checked }));
  };
  render();
}

// ---------- tasbeeh ----------

async function tasbeeh() {
  const st = await local.get('tasbeeh', { zekr: 0, target: 33, count: 0, total: 0, today: 0, date: todayKey() });
  if (st.date !== todayKey()) { st.today = 0; st.date = todayKey(); }
  const targets = [33, 100, 1000, 0];

  view.innerHTML = `
    <div class="chips" id="zs">${TASBEEH.map((z, i) => `<span class="chip" data-z="${i}">${z}</span>`).join('')}</div>
    <div class="tasbeeh-wrap">
      <div class="tasbeeh-zekr" id="tz"></div>
      <button class="bead" id="bead"><div><b id="tc">0</b><br><small id="tt"></small></div></button>
      <div class="row">
        ${targets.map((t) => `<span class="chip" data-t="${t}">${t ? arNum(t) : '∞'}</span>`).join('')}
        <button class="btn sm" id="treset">↺ تصفير</button>
      </div>
      <div class="muted" id="tstats"></div>
      <div class="muted">اضغط على الخرزة أو زر المسافة للعدّ</div>
    </div>`;

  const update = () => {
    $('#tz').textContent = TASBEEH[st.zekr];
    $('#tc').textContent = arNum(st.count);
    $('#tt').textContent = st.target ? `من ${arNum(st.target)}` : 'بدون حد';
    $('#tstats').textContent = `اليوم: ${arNum(st.today)} — الإجمالي: ${arNum(st.total)}`;
    $$('[data-z]').forEach((c) => c.classList.toggle('active', Number(c.dataset.z) === st.zekr));
    $$('[data-t]').forEach((c) => c.classList.toggle('active', Number(c.dataset.t) === st.target));
    local.set('tasbeeh', st);
  };
  const inc = () => {
    st.count++; st.total++; st.today++;
    if (st.target && st.count >= st.target) {
      toast(`أتممت ${arNum(st.target)} ✓ بارك الله فيك`);
      st.count = 0;
    }
    update();
  };
  update();
  $('#bead').addEventListener('click', inc);
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); inc(); } };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));
  $('#zs').addEventListener('click', (e) => { const c = e.target.closest('[data-z]'); if (c) { st.zekr = Number(c.dataset.z); st.count = 0; update(); } });
  $$('[data-t]').forEach((c) => c.addEventListener('click', () => { st.target = Number(c.dataset.t); st.count = 0; update(); }));
  $('#treset').addEventListener('click', () => { st.count = 0; update(); });
}

// ---------- settings ----------

const INTERVALS = [5, 10, 15, 20, 30, 45, 60, 120, 180, 240];
const everyLabel = (m) => (m % 60 === 0 ? (m === 60 ? 'ساعة' : `${arNum(m / 60)} ساعات`) : `${arNum(m)} دقيقة`);
const options = (pairs, current) => pairs.map(([v, label]) => `<option value="${v}" ${String(v) === String(current) ? 'selected' : ''}>${label}</option>`).join('');
const toggle = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label>`;

function settingsView() {
  const isCustom = !INTERVALS.includes(settings.zekrInterval);
  view.innerHTML = `
    <div class="card">
      <h3>🔔 التذكير بالذكر والقرآن</h3>
      <div class="setting"><span>تفعيل التذكير</span>${toggle('ze', settings.zekrEnabled)}</div>
      <div class="setting"><span>المحتوى</span><select class="input" id="rc">${options(Object.entries(REMINDER_CONTENT), settings.reminderContent)}</select></div>
      <div class="setting"><span>التذكير كل</span><select class="input" id="zi">${options([...INTERVALS.map((m) => [m, everyLabel(m)]), ['custom', 'مدة مخصصة…']], isCustom ? 'custom' : settings.zekrInterval)}</select></div>
      <div class="setting ${isCustom ? '' : 'hidden'}" id="customRow"><span>كل (بالدقائق)</span><input class="input" type="number" id="zc" min="1" max="1440" value="${settings.zekrInterval}"></div>
      <div class="setting"><span>طريقة العرض</span><select class="input" id="rs">${options([['window', 'نافذة منبثقة على الشاشة'], ['notification', 'إشعار النظام']], settings.reminderStyle)}</select></div>
      <div class="setting"><span>إغلاق النافذة تلقائياً بعد</span><select class="input" id="ac">${options([[0, 'لا تُغلق'], [15, '١٥ ثانية'], [30, '٣٠ ثانية'], [60, 'دقيقة'], [120, 'دقيقتين']], settings.reminderAutoClose)}</select></div>
      <div class="setting"><span>أوقات الهدوء (بدون تذكير)</span>${toggle('qe', settings.quietEnabled)}</div>
      <div class="setting ${settings.quietEnabled ? '' : 'hidden'}" id="quietRow"><span>من</span><input class="input" type="time" id="qf" value="${settings.quietFrom}" style="width:110px"><span>إلى</span><input class="input" type="time" id="qt" value="${settings.quietTo}" style="width:110px"></div>
      <div class="row wrap" style="margin-top:8px">
        <button class="btn sm primary" id="testR">جرّب التذكير الآن</button>
        <button class="btn sm" data-try="ayah">📖 آية</button>
        <button class="btn sm" data-try="zekr">📿 ذكر</button>
        <button class="btn sm" data-try="hadith">📜 حديث</button>
      </div>
    </div>
    <div class="card">
      <h3>🕌 تنبيهات الصلاة</h3>
      <div class="setting"><span>تنبيه عند دخول الوقت</span>${toggle('pn', settings.prayerNotify)}</div>
      <div class="setting"><span>طريقة العرض</span><select class="input" id="ps">${options([['window', 'نافذة منبثقة على الشاشة'], ['notification', 'إشعار النظام']], settings.prayerStyle)}</select></div>
      <div class="setting"><span>صوت الأذان</span><div class="row"><select class="input" id="ad">${options(ADHANS.map((a) => [a.id, a.name]), settings.adhan)}</select><button class="icon-btn" id="adPlay" title="استماع">▶</button></div></div>
      <div class="setting"><span>مستوى صوت الأذان</span><input type="range" id="av" min="0.1" max="1" step="0.1" value="${settings.adhanVolume}"></div>
      <div class="setting"><span>تنبيه قبل الأذان</span><select class="input" id="pre">${options([0, 5, 10, 15, 20, 30].map((m) => [m, m ? `${arNum(m)} دقائق` : 'بدون']), settings.preNotifyMin)}</select></div>
      <div class="setting"><span>المدينة</span><button class="btn sm" id="toPrayer">${esc(settings.cityName)} — تغيير</button></div>
      <button class="btn sm" id="testP" style="margin-top:8px">جرّب تنبيه الصلاة والأذان</button>
    </div>
    <div class="card">
      <h3>📗 الختمة ويوم الجمعة</h3>
      <div class="setting"><span>تذكير بالورد إن لم يكتمل</span>${toggle('kr', settings.khatmaRemind)}</div>
      <div class="setting"><span>وقت تذكير الورد</span><input class="input" type="time" id="kt" value="${settings.khatmaRemindTime}" style="width:120px"></div>
      <div class="setting"><span>تذكيرات الجمعة (الكهف وساعة الاستجابة)</span>${toggle('fe', settings.fridayEnabled)}</div>
      <div class="setting"><span>وقت تذكير سورة الكهف</span><input class="input" type="time" id="ft" value="${settings.fridayKahfTime}" style="width:120px"></div>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm" id="testF">جرّب تذكير الجمعة</button><button class="btn sm" id="toKhatma">📗 إدارة الختمة</button></div>
    </div>
    <div class="card">
      <h3>📖 القراءة والاستماع</h3>
      <div class="setting"><span>القارئ في المصحف</span><select class="input" id="ar">${options(AYAH_RECITERS.map((r) => [r.id, r.name]), settings.ayahReciter)}</select></div>
      <div class="setting"><span>حجم خط المصحف</span><input type="range" id="fs" min="16" max="44" step="2" value="${settings.fontSize}"></div>
      <div class="setting"><span>إظهار التفسير الميسر</span>${toggle('tf', settings.showTafsir)}</div>
      <div class="setting"><span>المظهر</span><select class="input" id="th">${options([['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']], settings.theme)}</select></div>
    </div>
    <div class="card">
      <h3>🧹 البيانات</h3>
      <div class="setting"><span>مسح الملفات المؤقتة (السور والقوائم)</span><button class="btn sm" id="clr">مسح</button></div>
      <div class="muted">مصادر البيانات: mp3quran.net • alquran.cloud • hadith-api (fawazahmed0) • aladhan.com. الأذكار من حصن المسلم.</div>
    </div>`;

  const on = (id, event, fn) => $(`#${id}`).addEventListener(event, (e) => fn(e.target));
  on('ze', 'change', (t) => saveSettings({ zekrEnabled: t.checked }));
  on('rc', 'change', (t) => saveSettings({ reminderContent: t.value }));
  on('zi', 'change', (t) => {
    $('#customRow').classList.toggle('hidden', t.value !== 'custom');
    if (t.value !== 'custom') saveSettings({ zekrInterval: Number(t.value) });
  });
  on('zc', 'change', (t) => {
    const m = Math.min(1440, Math.max(1, Math.round(Number(t.value)) || 60));
    t.value = m;
    saveSettings({ zekrInterval: m });
    toast(`سيظهر التذكير كل ${everyLabel(m)}`);
  });
  on('rs', 'change', (t) => saveSettings({ reminderStyle: t.value }));
  on('ac', 'change', (t) => saveSettings({ reminderAutoClose: Number(t.value) }));
  on('qe', 'change', (t) => { $('#quietRow').classList.toggle('hidden', !t.checked); saveSettings({ quietEnabled: t.checked }); });
  on('qf', 'change', (t) => saveSettings({ quietFrom: t.value }));
  on('qt', 'change', (t) => saveSettings({ quietTo: t.value }));
  on('testR', 'click', () => chrome.runtime.sendMessage({ to: 'bg', type: 'testReminder' }));
  $$('[data-try]').forEach((b) => b.addEventListener('click', () => chrome.runtime.sendMessage({ to: 'bg', type: 'testReminder', override: { reminderContent: b.dataset.try } })));

  on('pn', 'change', (t) => saveSettings({ prayerNotify: t.checked }));
  on('ps', 'change', (t) => saveSettings({ prayerStyle: t.value }));
  on('ad', 'change', (t) => saveSettings({ adhan: t.value }));
  on('av', 'change', (t) => saveSettings({ adhanVolume: Number(t.value) }));
  on('adPlay', 'click', async () => {
    const a = ADHANS.find((x) => x.id === $('#ad').value);
    if (!a?.url) return;
    await audio('play', { kind: 'adhan', items: [{ url: a.url, title: a.name, subtitle: 'معاينة صوت الأذان' }] });
    audio('volume', { value: settings.adhanVolume });
  });
  on('pre', 'change', (t) => saveSettings({ preNotifyMin: Number(t.value) }));
  on('toPrayer', 'click', () => go('prayer'));
  on('testP', 'click', () => chrome.runtime.sendMessage({ to: 'bg', type: 'testPrayer' }));

  on('kr', 'change', (t) => saveSettings({ khatmaRemind: t.checked }));
  on('kt', 'change', (t) => saveSettings({ khatmaRemindTime: t.value }));
  on('fe', 'change', (t) => saveSettings({ fridayEnabled: t.checked }));
  on('ft', 'change', (t) => saveSettings({ fridayKahfTime: t.value }));
  on('testF', 'click', () => chrome.runtime.sendMessage({ to: 'bg', type: 'testFriday' }));
  on('toKhatma', 'click', () => go('khatma'));

  on('ar', 'change', (t) => saveSettings({ ayahReciter: t.value }));
  on('fs', 'input', (t) => saveSettings({ fontSize: Number(t.value) }));
  on('tf', 'change', (t) => saveSettings({ showTafsir: t.checked }));
  on('th', 'change', (t) => { saveSettings({ theme: t.value }); applyTheme(); });
  on('clr', 'click', async () => {
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('c:')));
    toast('تم المسح ✓');
  });
}

// ---------- mini player ----------

const P = { bar: $('#player'), title: $('#pTitle'), sub: $('#pSub'), seek: $('#pSeek'), toggle: $('#pToggle'), time: $('#pTime'), vol: $('#pVol'), repeat: $('#pRepeat') };
let seeking = false;
const REPEAT_NEXT = { none: 'all', all: 'one', one: 'none' };
const REPEAT_ICON = { none: '🔁', all: '🔁', one: '🔂' };

function renderPlayer(s) {
  playerState = s;
  if (!s || s.closed || !s.url) { P.bar.classList.add('hidden'); return; }
  P.bar.classList.remove('hidden');
  P.title.textContent = s.error ? `⚠️ ${s.error}` : s.title;
  P.sub.textContent = `${s.subtitle}${s.count > 1 ? ` • ${arNum(s.index + 1)}/${arNum(s.count)}` : ''}`;
  P.toggle.textContent = s.playing ? '⏸' : '▶';
  P.seek.classList.toggle('hidden', !!s.live);
  if (!seeking) { P.seek.max = s.duration || 100; P.seek.value = s.current; }
  P.time.textContent = s.live ? '🔴 مباشر' : `${fmtTime(s.current)} / ${fmtTime(s.duration)}`;
  P.vol.value = s.volume;
  P.repeat.textContent = REPEAT_ICON[s.repeat];
  P.repeat.classList.toggle('on', s.repeat !== 'none');
  $('#pPrev').disabled = $('#pNext').disabled = s.count < 2;
}

P.toggle.addEventListener('click', () => audio('toggle'));
$('#pNext').addEventListener('click', () => audio('next'));
$('#pPrev').addEventListener('click', () => audio('prev'));
$('#pClose').addEventListener('click', () => { audio('stop'); renderPlayer(null); });
P.repeat.addEventListener('click', () => audio('repeat', { value: REPEAT_NEXT[playerState?.repeat || 'none'] }));
P.vol.addEventListener('input', (e) => audio('volume', { value: Number(e.target.value) }));
P.seek.addEventListener('input', () => { seeking = true; P.time.textContent = `${fmtTime(Number(P.seek.value))} / ${fmtTime(playerState?.duration)}`; });
P.seek.addEventListener('change', () => { audio('seek', { time: Number(P.seek.value) }); seeking = false; });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.to === 'ui' && msg.type === 'state') {
    const changed = !playerState || playerState.index !== msg.state.index || playerState.url !== msg.state.url || playerState.playing !== msg.state.playing || msg.state.closed;
    renderPlayer(msg.state);
    if (changed) stateHandlers.forEach((fn) => fn(msg.state));
  }
});

// ---------- boot ----------

function applyTheme() {
  if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
}

$('#themeBtn').addEventListener('click', () => {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  saveSettings({ theme: dark ? 'light' : 'dark' });
  applyTheme();
});
$('#expandBtn').addEventListener('click', () => { chrome.tabs.create({ url: `popup.html?full=1#${currentTab}` }); window.close(); });
window.addEventListener('hashchange', () => {
  const [tab, ...args] = location.hash.slice(1).split('/');
  if (VIEWS[tab]) go(tab, ...args);
});

(async function boot() {
  if (isFull) { document.body.classList.add('full'); $('#expandBtn').classList.add('hidden'); }
  const { settings: saved } = await chrome.storage.sync.get('settings');
  settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  applyTheme();
  document.documentElement.style.setProperty('--qsize', `${settings.fontSize}px`);

  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const weekday = new Date().toLocaleDateString('ar-EG', { weekday: 'long' });
  $('#hijri').textContent = `${weekday} ${hijri}`;

  const rate = await local.get('rate', { opens: 0, since: Date.now(), state: 'pending' });
  await local.set('rate', { ...rate, opens: rate.opens + 1 });

  audio('getState').then(renderPlayer).catch(() => {});
  const [hashTab, ...args] = location.hash.slice(1).split('/');
  if (VIEWS[hashTab]) go(hashTab, ...args);
  else go('home');
})();
