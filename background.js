import { computeTimes, nextPrayer, prayerName } from './lib/praytimes.js';
import { todayRemaining, dateKey } from './lib/khatma.js';
import { getReminderContent } from './lib/reminder-content.js';
import { createPlayer } from './lib/player.js';
import { DEFAULT_SETTINGS, ADHANS } from './settings-defaults.js';

const ICON = 'icons/icon128.png';
const POPUP_W = 400;
const POPUP_H = 400;
const MISSED_PRAYER_GRACE = 10 * 60000;
const DAY = 86400000;

async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

// ---------- scheduling ----------

async function scheduleZekr(s) {
  await chrome.alarms.clear('zekr');
  const every = Number(s.zekrInterval);
  if (s.zekrEnabled && every > 0) {
    chrome.alarms.create('zekr', { delayInMinutes: every, periodInMinutes: every });
  }
}

async function schedulePrayer(s, from = new Date()) {
  await chrome.alarms.clear('prayer');
  await chrome.alarms.clear('prayer-pre');
  if (!s.prayerNotify) return;
  const next = nextPrayer(s.lat, s.lng, s.method, s.asrFactor, from);
  await chrome.storage.session.set({ nextPrayer: { key: next.key, time: next.time.getTime() } });
  chrome.alarms.create('prayer', { when: next.time.getTime() });
  const pre = next.time.getTime() - s.preNotifyMin * 60000;
  if (s.preNotifyMin > 0 && pre > Date.now()) chrome.alarms.create('prayer-pre', { when: pre });
}

function nextAt(hhmm, weekday = null, from = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  while (d <= from || (weekday !== null && d.getDay() !== weekday)) d.setDate(d.getDate() + 1);
  return d;
}

function nextFridayDuaTime(s) {
  const friday = nextAt('00:00', 5, new Date(Date.now() - DAY));
  for (let i = 0; i < 2; i++) {
    const maghrib = computeTimes(friday, s.lat, s.lng, s.method, s.asrFactor).maghrib;
    const at = new Date(maghrib.getTime() - 60 * 60000);
    if (at > Date.now()) return at;
    friday.setDate(friday.getDate() + 7);
  }
  return null;
}

async function scheduleKhatma(s) {
  await chrome.alarms.clear('khatma');
  if (s.khatmaRemind) chrome.alarms.create('khatma', { when: nextAt(s.khatmaRemindTime).getTime() });
}

async function scheduleFriday(s) {
  await chrome.alarms.clear('friday-kahf');
  await chrome.alarms.clear('friday-dua');
  if (!s.fridayEnabled) return;
  chrome.alarms.create('friday-kahf', { when: nextAt(s.fridayKahfTime, 5).getTime() });
  const dua = nextFridayDuaTime(s);
  if (dua) chrome.alarms.create('friday-dua', { when: dua.getTime() });
}

async function scheduleAll() {
  const s = await getSettings();
  await scheduleZekr(s);
  await schedulePrayer(s);
  await scheduleKhatma(s);
  await scheduleFriday(s);
  chrome.alarms.create('daily-refresh', { periodInMinutes: 360 });
}

// ---------- display ----------

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function inQuietHours(s) {
  if (!s.quietEnabled) return false;
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const from = toMinutes(s.quietFrom);
  const to = toMinutes(s.quietTo);
  return from <= to ? now >= from && now < to : now >= from || now < to;
}

function notify(id, title, message) {
  chrome.notifications.create(`${id}-${Date.now()}`, {
    type: 'basic', iconUrl: ICON, title, message: message.length > 300 ? `${message.slice(0, 300)}…` : message,
  });
}

async function openPopupWindow(payload) {
  const { popupWindowId } = await chrome.storage.session.get('popupWindowId');
  if (popupWindowId) await chrome.windows.remove(popupWindowId).catch(() => {});
  await chrome.storage.session.set({ popupPayload: payload });

  let left;
  let top;
  try {
    const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    left = Math.max(0, w.left + w.width - POPUP_W - 24);
    top = Math.max(0, w.top + w.height - POPUP_H - 24);
  } catch {
    // no normal window open: let Chrome place it
  }
  const win = await chrome.windows.create({
    url: 'reminder.html', type: 'popup', width: POPUP_W, height: POPUP_H, left, top, focused: true,
  });
  await chrome.storage.session.set({ popupWindowId: win.id });
}

async function playAdhan(s, key) {
  const adhan = ADHANS.find((a) => a.id === s.adhan);
  if (!adhan?.url) return;
  await sendToPlayer({
    cmd: 'play', kind: 'adhan',
    items: [{ url: adhan.url, title: `الأذان — صلاة ${prayerName(key)}`, subtitle: s.cityName }],
  });
  await sendToPlayer({ cmd: 'volume', value: s.adhanVolume });
}

async function showReminder(s, force = false) {
  if (!force) {
    if (inQuietHours(s)) return;
    const idle = await chrome.idle.queryState(60);
    if (idle === 'locked') return;
  }
  const content = await getReminderContent(s.reminderContent);
  if (s.reminderStyle === 'window') {
    await openPopupWindow({ mode: 'reminder', content, autoClose: s.reminderAutoClose });
    return;
  }
  const id = content.type === 'ayah' ? `ayah_${content.surah}_${content.ayah}` : content.type;
  const body = [content.text, content.ref, content.note].filter(Boolean).join('\n');
  notify(id, content.title, body);
}

async function showPrayer(s, np, phase) {
  const name = prayerName(np.key, np.time);
  if (phase === 'now') playAdhan(s, np.key);
  if (s.prayerStyle === 'window') {
    await openPopupWindow({ mode: 'prayer', phase, key: np.key, time: np.time, city: s.cityName, preMin: s.preNotifyMin });
    return;
  }
  if (phase === 'pre') notify('prayer', '🕌 اقترب موعد الصلاة', `بقي ${s.preNotifyMin} دقائق على صلاة ${name}`);
  else notify('prayer', `🕌 حان الآن موعد صلاة ${name}`, `${s.cityName || ''} — «إن الصلاة كانت على المؤمنين كتاباً موقوتاً»`);
}

const MESSAGES = {
  khatma: (k) => ({
    id: 'khatma',
    title: '📗 وردك اليومي',
    text: `باقي ${todayRemaining(k).toLocaleString('ar-EG')} صفحة من ورد اليوم`,
    note: '«اقرءوا القرآن فإنه يأتي يوم القيامة شفيعاً لأصحابه»',
    action: { label: '📖 أكمل وردي', hash: 'khatma' },
  }),
  kahf: () => ({
    id: 'kahf',
    title: '🕌 جمعة مباركة',
    text: 'لا تنسَ قراءة سورة الكهف اليوم',
    note: '«من قرأ سورة الكهف في يوم الجمعة أضاء له من النور ما بين الجمعتين»',
    action: { label: '📖 اقرأ سورة الكهف', hash: 'quran/18/1' },
  }),
  dua: () => ({
    id: 'dua',
    title: '🤲 ساعة الاستجابة',
    text: 'آخر ساعة من يوم الجمعة — أكثِر من الدعاء والصلاة على النبي ﷺ',
    note: '«فيه ساعة لا يوافقها عبد مسلم وهو قائم يصلي يسأل الله شيئاً إلا أعطاه إياه»',
    action: { label: '🤲 أدعية من القرآن', hash: 'azkar/quranic' },
  }),
};

async function showMessage(s, msg) {
  if (s.reminderStyle === 'window') {
    await openPopupWindow({ mode: 'message', ...msg });
    return;
  }
  notify(msg.id, msg.title, `${msg.text}\n${msg.note}`);
}

// ---------- events ----------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } });
  await scheduleAll();
  if (reason === 'install') chrome.tabs.create({ url: 'popup.html?full=1#settings' });
});

chrome.runtime.onStartup.addListener(scheduleAll);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const s = await getSettings();
  const stale = Date.now() - alarm.scheduledTime > 2 * 60 * 60000;
  if (alarm.name === 'zekr') {
    await showReminder(s);
  } else if (alarm.name === 'prayer-pre' || alarm.name === 'prayer') {
    const { nextPrayer: np } = await chrome.storage.session.get('nextPrayer');
    const late = np && Date.now() - np.time > MISSED_PRAYER_GRACE;
    if (np && !late) await showPrayer(s, np, alarm.name === 'prayer' ? 'now' : 'pre');
    if (alarm.name === 'prayer') await schedulePrayer(s, new Date(Date.now() + 60000));
  } else if (alarm.name === 'daily-refresh') {
    await schedulePrayer(s);
  } else if (alarm.name === 'khatma') {
    const { khatma: k } = await chrome.storage.local.get('khatma');
    if (!stale && k?.active && todayRemaining(k) > 0) await showMessage(s, MESSAGES.khatma(k));
    await scheduleKhatma(s);
  } else if (alarm.name === 'friday-kahf') {
    const { kahfDone } = await chrome.storage.local.get('kahfDone');
    if (!stale && kahfDone !== dateKey()) await showMessage(s, MESSAGES.kahf());
    await scheduleFriday(s);
  } else if (alarm.name === 'friday-dua') {
    if (!stale) await showMessage(s, MESSAGES.dua());
    await scheduleFriday(s);
  }
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  const [kind, surah, ayah] = id.split('-')[0].split('_');
  const hash = { prayer: 'prayer', ayah: `quran/${surah}/${ayah}`, hadith: 'hadith', khatma: 'khatma', kahf: 'quran/18/1', dua: 'azkar/quranic' }[kind] || 'azkar';
  chrome.tabs.create({ url: `popup.html?full=1#${hash}` });
});

chrome.windows.onRemoved.addListener(async (id) => {
  const { popupWindowId } = await chrome.storage.session.get('popupWindowId');
  if (id === popupWindowId) chrome.storage.session.remove('popupWindowId');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) scheduleAll();
});

// ---------- audio: Chrome plays in an offscreen document, Firefox in this background page ----------

const HAS_OFFSCREEN = Boolean(chrome.offscreen?.createDocument);

let creating = null;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'تشغيل تلاوات القرآن والإذاعات والأذان في الخلفية',
    }).finally(() => { creating = null; });
  }
  await creating;
}

function updateBadge(state) {
  chrome.action.setBadgeText({ text: state?.playing ? '♪' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#0d6b4f' });
}

let localPlayer = null;
let keepAlive = null;
function getLocalPlayer() {
  if (localPlayer) return localPlayer;
  const hlsScript = document.createElement('script');
  hlsScript.src = 'lib/hls.min.js';
  document.head.append(hlsScript);
  localPlayer = createPlayer(new Audio(), (state) => {
    updateBadge(state);
    chrome.runtime.sendMessage({ to: 'ui', type: 'state', state }).catch(() => {});
    // Firefox suspends idle event pages; extension API calls keep it alive while audio plays.
    clearInterval(keepAlive);
    if (localPlayer?.isPlaying()) keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  });
  return localPlayer;
}

async function sendToPlayer(msg) {
  if (!HAS_OFFSCREEN) {
    if (msg.cmd === 'getState' && !localPlayer) return null;
    return getLocalPlayer().handle(msg);
  }
  if (msg.cmd === 'getState') {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!contexts.length) return null;
  } else {
    await ensureOffscreen();
  }
  return chrome.runtime.sendMessage({ ...msg, to: 'offscreen' });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.to !== 'bg' && !(msg?.to === 'ui' && msg.type === 'state')) return false;

  if (msg.type === 'audio') {
    sendToPlayer(msg).then(sendResponse);
    return true;
  }
  if (msg.type === 'state') {
    updateBadge(msg.state);
    if (msg.state?.closed && HAS_OFFSCREEN) chrome.offscreen.closeDocument().catch(() => {});
    return false;
  }
  if (msg.type === 'testFriday') {
    getSettings().then((s) => showMessage(s, MESSAGES.kahf())).then(() => sendResponse(true));
    return true;
  }
  if (msg.type === 'testReminder' || msg.type === 'testPrayer') {
    (async () => {
      const s = await getSettings();
      if (msg.type === 'testReminder') {
        await showReminder({ ...s, ...(msg.override || {}) }, true);
      } else {
        const np = nextPrayer(s.lat, s.lng, s.method, s.asrFactor);
        await showPrayer(s, { key: np.key, time: np.time.getTime() }, 'now');
      }
      sendResponse(true);
    })();
    return true;
  }
  if (msg.type === 'reschedule') {
    scheduleAll().then(() => sendResponse(true));
    return true;
  }
  return false;
});
