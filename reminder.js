import { getReminderContent } from './lib/reminder-content.js';
import { prayerName } from './lib/praytimes.js';
import { DEFAULT_SETTINGS } from './settings-defaults.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const audio = (cmd, payload = {}) => chrome.runtime.sendMessage({ to: 'bg', type: 'audio', cmd, ...payload });
const ADHAN_DUA = 'اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلَاةِ الْقَائِمَةِ، آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ';

let settings = DEFAULT_SETTINGS;
let timer = null;

function startAutoClose(seconds) {
  clearInterval(timer);
  $('#rTimer').textContent = '';
  if (!seconds) return;
  let left = seconds;
  let paused = false;
  document.body.onmouseenter = () => { paused = true; $('#rTimer').textContent = '⏸'; };
  document.body.onmouseleave = () => { paused = false; };
  timer = setInterval(() => {
    if (paused) return;
    left -= 1;
    $('#rTimer').textContent = `${left.toLocaleString('ar-EG')} ث`;
    if (left <= 0) window.close();
  }, 1000);
}

function button(label, onClick, primary = false) {
  const b = document.createElement('button');
  b.className = `btn${primary ? ' primary' : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  $('#rActions').append(b);
}

function renderReminder(c, autoClose) {
  $('#rTitle').textContent = c.title;
  $('#rBody').innerHTML = `
    <div class="r-text ${c.type === 'ayah' ? 'quran' : ''}">${c.type === 'ayah' ? `﴿ ${esc(c.text)} ﴾` : esc(c.text)}</div>
    ${c.ref ? `<div class="r-ref">${esc(c.ref)}</div>` : ''}
    ${c.note ? `<div class="r-note">${c.type === 'ayah' ? '<b>التفسير الميسر: </b>' : '💡 '}${esc(c.note)}</div>` : ''}`;
  $('#rActions').innerHTML = '';
  if (c.audio) {
    button('▶ استمع', () => audio('play', { kind: 'ayah', items: [{ url: c.audio, title: c.ref, subtitle: 'مشاري راشد العفاسي' }] }));
    button('📖 افتح السورة', () => { chrome.tabs.create({ url: `popup.html?full=1#quran/${c.surah}/${c.ayah}` }); window.close(); });
  }
  button('🔄 غيره', async () => renderReminder(await getReminderContent(settings.reminderContent), 0));
  button('✓ جزاك الله خيراً', () => window.close(), true);
  startAutoClose(autoClose);
}

function renderPrayer(p) {
  const name = prayerName(p.key, p.time);
  const time = new Date(p.time).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
  const now = p.phase === 'now';
  $('#rTitle').textContent = now ? '🕌 حان وقت الصلاة' : '🕌 اقترب موعد الصلاة';
  $('#rBody').innerHTML = `
    <div class="r-prayer">
      <div class="muted">${now ? 'حان الآن موعد صلاة' : `بقي ${Number(p.preMin).toLocaleString('ar-EG')} دقائق على صلاة`}</div>
      <div class="name">${name}</div>
      <div class="time">${time}</div>
      <div class="muted">${esc(p.city)}</div>
    </div>
    <div class="r-dua">${now ? ADHAN_DUA : '«إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَوْقُوتًا»'}</div>`;
  $('#rActions').innerHTML = '';
  if (now) button('🔇 إيقاف الأذان', () => audio('stop'));
  button('✓ حسناً', () => window.close(), true);
}

function renderMessage(m) {
  $('#rTitle').textContent = m.title;
  $('#rBody').innerHTML = `<div class="r-text">${esc(m.text)}</div>${m.note ? `<div class="r-note">${esc(m.note)}</div>` : ''}`;
  $('#rActions').innerHTML = '';
  if (m.action) button(m.action.label, () => { chrome.tabs.create({ url: `popup.html?full=1#${m.action.hash}` }); window.close(); }, true);
  button('لاحقاً', () => window.close());
}

(async function boot() {
  const { settings: saved } = await chrome.storage.sync.get('settings');
  const { popupPayload: p } = await chrome.storage.session.get('popupPayload');
  settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  if (settings.theme !== 'auto') document.documentElement.dataset.theme = settings.theme;
  if (!p) return window.close();
  if (p.mode === 'prayer') renderPrayer(p);
  else if (p.mode === 'message') renderMessage(p);
  else renderReminder(p.content, p.autoClose);
})();
