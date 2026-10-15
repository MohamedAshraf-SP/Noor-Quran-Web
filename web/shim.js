// Stand-in for the chrome.* extension APIs so the extension code runs as a plain website.
// Child frames (the reminder window) reuse the parent page's shim.
(function () {
  if (window.parent !== window && window.parent.chrome?.__web) {
    window.chrome = window.parent.chrome;
    window.close = () => window.parent.__closeReminder?.();
    return;
  }

  const listeners = (list = []) => ({ addListener: (fn) => list.push(fn), list });
  const events = {
    message: listeners(), installed: listeners(), startup: listeners(), alarm: listeners(),
    notifClick: listeners(), storageChanged: listeners(), windowRemoved: listeners(),
  };

  function area(name, backend) {
    const prefix = `noor:${name}:`;
    const read = (k) => { try { const v = backend.getItem(prefix + k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } };
    const keys = () => Object.keys(backend).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    return {
      async get(key) {
        if (key == null) return Object.fromEntries(keys().map((k) => [k, read(k)]));
        const list = Array.isArray(key) ? key : [key];
        return Object.fromEntries(list.filter((k) => read(k) !== undefined).map((k) => [k, read(k)]));
      },
      async set(obj) {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: read(k), newValue: v };
          try { backend.setItem(prefix + k, JSON.stringify(v)); } catch { /* quota or private mode */ }
        }
        setTimeout(() => events.storageChanged.list.forEach((fn) => fn(changes, name)), 0);
      },
      async remove(ks) { [].concat(ks).forEach((k) => backend.removeItem(prefix + k)); },
    };
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      setTimeout(() => {
        let answered = false;
        let pending = false;
        const respond = (v) => { if (!answered) { answered = true; resolve(v); } };
        for (const fn of events.message.list) {
          if (fn(msg, { id: 'web' }, respond) === true) pending = true;
        }
        if (!pending) respond(undefined);
      }, 0);
    });
  }

  const alarms = new Map();
  function createAlarm(name, info) {
    clearAlarm(name);
    const fire = () => events.alarm.list.forEach((fn) => fn({ name, scheduledTime: Date.now() }));
    const delay = info.when ? Math.max(0, info.when - Date.now()) : (info.delayInMinutes || 0) * 60000;
    const entry = {};
    entry.timeout = setTimeout(() => {
      fire();
      if (info.periodInMinutes) entry.interval = setInterval(fire, info.periodInMinutes * 60000);
    }, Math.min(delay, 2 ** 31 - 1));
    alarms.set(name, entry);
  }
  function clearAlarm(name) {
    const a = alarms.get(name);
    if (a) { clearTimeout(a.timeout); clearInterval(a.interval); alarms.delete(name); }
    return Promise.resolve(true);
  }

  const swReady = 'serviceWorker' in navigator
    ? navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).catch(() => null)
    : Promise.resolve(null);
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'notifClick') events.notifClick.list.forEach((fn) => fn(e.data.id));
  });

  // Android Chrome only allows notifications through a service worker registration.
  async function systemNotification(id, title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body, icon: 'icons/icon128.png', badge: 'icons/icon48.png', tag: id, data: { id } };
    const reg = await swReady;
    if (reg) return reg.showNotification(title, options);
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); events.notifClick.list.forEach((fn) => fn(id)); n.close(); };
  }

  const PRAYERS = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  function payloadText(p) {
    if (p.mode === 'prayer') {
      const name = p.key === 'dhuhr' && new Date(p.time).getDay() === 5 ? 'الجمعة' : PRAYERS[p.key];
      return p.phase === 'now'
        ? ['🕌 حان الآن موعد صلاة ' + name, p.city || '']
        : ['🕌 اقترب موعد الصلاة', `بقي ${p.preMin} دقائق على صلاة ${name}`];
    }
    if (p.mode === 'message') return [p.title, p.text];
    return [p.content?.title || '🤍 نور', [p.content?.text, p.content?.ref].filter(Boolean).join('\n')];
  }

  function openApp(url) {
    const hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    if (!url.startsWith('popup.html')) return window.open(url, '_blank', 'noopener');
    if (hash && location.hash !== hash) location.hash = hash;
  }

  let reminderEl = null;
  async function createWindow({ url }) {
    removeReminder();
    reminderEl = document.createElement('div');
    reminderEl.className = 'web-reminder';
    reminderEl.innerHTML = `<iframe src="${url}" title="تذكير"></iframe>`;
    document.body.append(reminderEl);
    if (document.hidden) {
      const { popupPayload: p } = await chrome.storage.session.get('popupPayload');
      if (p) {
        const [title, body] = payloadText(p);
        systemNotification(p.mode === 'prayer' ? 'prayer' : 'reminder', title, body);
      }
    }
    return { id: 1 };
  }
  function removeReminder() {
    if (!reminderEl) return;
    reminderEl.remove();
    reminderEl = null;
    events.windowRemoved.list.forEach((fn) => fn(1));
  }
  window.__closeReminder = removeReminder;

  const baseTitle = document.title;

  window.chrome = {
    __web: true,
    runtime: {
      id: 'nnhfbopcibdhhflpgnkgidadodcafacd',
      sendMessage,
      onMessage: events.message,
      onInstalled: events.installed,
      onStartup: events.startup,
      getPlatformInfo: async () => ({ os: 'web' }),
    },
    storage: {
      local: area('local', localStorage),
      sync: area('sync', localStorage),
      session: area('session', sessionStorage),
      onChanged: events.storageChanged,
    },
    alarms: { create: createAlarm, clear: clearAlarm, onAlarm: events.alarm },
    notifications: {
      create: (id, o) => systemNotification(id, o.title, o.message),
      clear: () => {},
      onClicked: events.notifClick,
    },
    windows: {
      create: createWindow,
      remove: async () => removeReminder(),
      getLastFocused: () => Promise.reject(new Error('n/a')),
      onRemoved: events.windowRemoved,
    },
    tabs: { create: ({ url }) => openApp(url) },
    action: {
      setBadgeText: ({ text }) => { document.title = text ? `${text} ${baseTitle}` : baseTitle; },
      setBadgeBackgroundColor: () => {},
    },
    idle: { queryState: async () => 'active' },
  };

  document.addEventListener('DOMContentLoaded', () => {
    events.installed.list.forEach((fn) => fn({ reason: 'update' }));
    events.startup.list.forEach((fn) => fn());

    const notifyBtn = document.getElementById('webNotify');
    const blockedHint = document.getElementById('webNotifyBlocked');
    if (notifyBtn) {
      const supported = 'Notification' in window;
      const refresh = () => {
        notifyBtn.hidden = !supported || Notification.permission !== 'default';
        if (blockedHint) blockedHint.hidden = !supported || Notification.permission !== 'denied';
      };
      refresh();
      notifyBtn.addEventListener('click', async () => {
        const result = await Notification.requestPermission();
        refresh();
        if (result === 'granted') {
          systemNotification('welcome', '✅ تم تفعيل الإشعارات', 'ستصلك تنبيهات الأذان والأذكار ما دام موقع «نور» مفتوحاً في أحد التبويبات.');
        }
      });
    }
  });
})();
