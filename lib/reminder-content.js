import { REMINDERS } from '../data/azkar.js';
import { SURAHS } from '../data/quran-meta.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function zekr() {
  const r = pick(REMINDERS);
  return { type: 'zekr', title: '🤍 ذكّر قلبك', text: r.text, note: r.note, ref: '' };
}

async function ayah() {
  const n = Math.floor(Math.random() * 6236) + 1;
  const res = await fetch(`https://api.alquran.cloud/v1/ayah/${n}/editions/quran-uthmani,ar.muyassar`);
  const { data } = await res.json();
  const [a, t] = data;
  const surah = a.surah.number;
  return {
    type: 'ayah',
    title: '📖 آية من كتاب الله',
    text: a.text.replace('﻿', ''),
    note: t.text,
    ref: `سورة ${SURAHS[surah - 1].name} — آية ${a.numberInSurah.toLocaleString('ar-EG')}`,
    audio: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${n}.mp3`,
    surah,
    ayah: a.numberInSurah,
  };
}

async function hadith() {
  const book = pick([{ id: 'nawawi', name: 'الأربعون النووية', max: 42 }, { id: 'qudsi', name: 'الأحاديث القدسية', max: 40 }]);
  const n = Math.floor(Math.random() * book.max) + 1;
  const res = await fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-${book.id}/${n}.json`);
  const d = await res.json();
  return { type: 'hadith', title: '📜 حديث شريف', text: d.hadiths[0].text, note: '', ref: `${book.name} — ${n.toLocaleString('ar-EG')}` };
}

export async function getReminderContent(kind) {
  const type = kind === 'mixed' ? pick(['zekr', 'zekr', 'ayah', 'ayah', 'hadith']) : kind;
  try {
    if (type === 'ayah') return await ayah();
    if (type === 'hadith') return await hadith();
  } catch {
    // offline: fall back to a local zekr
  }
  return zekr();
}
