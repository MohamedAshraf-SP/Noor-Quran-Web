export const TOTAL_PAGES = 604;
export const KHATMA_PLANS = [3, 7, 10, 15, 20, 30, 40, 60, 90];

export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const newKhatma = (days, previous) => ({
  active: true,
  days,
  startDate: dateKey(),
  pagesDone: 0,
  log: {},
  completed: previous?.completed || 0,
});

export const dailyTarget = (k) => Math.ceil(TOTAL_PAGES / k.days);
export const readToday = (k) => k.log[dateKey()] || 0;
export const todayRemaining = (k) => Math.max(0, Math.min(dailyTarget(k), TOTAL_PAGES - k.pagesDone + readToday(k)) - readToday(k));

export function daysElapsed(k) {
  const [y, m, d] = k.startDate.split('-').map(Number);
  return Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d).getTime()) / 86400000);
}

// Pages that should be finished by the end of today to stay on plan.
export const expectedPages = (k) => Math.min(TOTAL_PAGES, (daysElapsed(k) + 1) * dailyTarget(k));

export function streak(k) {
  let count = 0;
  const day = new Date();
  if (!k.log[dateKey(day)]) day.setDate(day.getDate() - 1);
  while (k.log[dateKey(day)]) {
    count++;
    day.setDate(day.getDate() - 1);
  }
  return count;
}

export function recordPages(k, upToPage) {
  const added = upToPage - k.pagesDone;
  if (added <= 0) return 0;
  k.pagesDone = Math.min(TOTAL_PAGES, upToPage);
  k.log[dateKey()] = readToday(k) + added;
  return added;
}
