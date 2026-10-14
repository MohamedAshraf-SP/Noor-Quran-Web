// Audio queue shared by Chrome's offscreen document and Firefox's background page.
export function createPlayer(audio, publish) {
  const player = {
    items: [],
    index: 0,
    repeat: 'none', // none | one | all
    kind: '',
    meta: {},
    error: '',
  };

  function state(extra = {}) {
    const item = player.items[player.index] || {};
    return {
      kind: player.kind,
      meta: player.meta,
      title: item.title || '',
      subtitle: item.subtitle || '',
      url: item.url || '',
      index: player.index,
      count: player.items.length,
      playing: !audio.paused && !audio.ended,
      current: audio.currentTime || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      live: player.kind === 'radio',
      repeat: player.repeat,
      volume: audio.volume,
      error: player.error,
      ...extra,
    };
  }

  let lastTick = 0;
  function broadcast(force = false, extra) {
    const now = Date.now();
    if (!force && now - lastTick < 900) return;
    lastTick = now;
    publish(state(extra));
  }

  let hls = null;
  function attachSource(url) {
    hls?.destroy();
    hls = null;
    if (url.includes('.m3u8') && globalThis.Hls?.isSupported()) {
      hls = new globalThis.Hls();
      hls.loadSource(url);
      hls.attachMedia(audio);
      return;
    }
    audio.src = url;
  }

  function load(index) {
    player.index = index;
    player.error = '';
    const item = player.items[index];
    if (!item) return;
    attachSource(item.url);
    audio.play().catch((e) => { player.error = e.message; broadcast(true); });
    broadcast(true);
  }

  function next(auto = false) {
    if (auto && player.repeat === 'one') return load(player.index);
    if (player.index + 1 < player.items.length) return load(player.index + 1);
    if (player.repeat === 'all' && player.items.length) return load(0);
    if (auto) broadcast(true);
  }

  audio.addEventListener('ended', () => next(true));
  audio.addEventListener('timeupdate', () => broadcast());
  ['play', 'pause', 'loadedmetadata', 'waiting', 'playing'].forEach((e) => audio.addEventListener(e, () => broadcast(true)));
  audio.addEventListener('error', () => {
    player.error = 'تعذّر تشغيل الملف — تحقق من الاتصال';
    broadcast(true);
  });

  const commands = {
    play({ items, index = 0, kind = '', meta = {} }) {
      player.items = items;
      player.kind = kind;
      player.meta = meta;
      load(index);
    },
    toggle() { if (audio.paused) audio.play(); else audio.pause(); },
    pause() { audio.pause(); },
    next() { next(false); },
    prev() {
      if (audio.currentTime > 4 || player.index === 0) audio.currentTime = 0;
      else load(player.index - 1);
    },
    jump({ index }) { load(index); },
    seek({ time }) { if (Number.isFinite(audio.duration)) audio.currentTime = time; },
    volume({ value }) { audio.volume = value; },
    repeat({ value }) { player.repeat = value; },
    stop() {
      audio.pause();
      hls?.destroy();
      hls = null;
      audio.removeAttribute('src');
      audio.load();
      player.items = [];
      broadcast(true, { closed: true });
    },
    getState() {},
  };

  return {
    handle(msg) {
      commands[msg.cmd]?.(msg);
      const snapshot = state();
      if (msg.cmd !== 'getState' && msg.cmd !== 'stop') broadcast(true);
      return snapshot;
    },
    isPlaying: () => !audio.paused && !audio.ended && player.items.length > 0,
  };
}
