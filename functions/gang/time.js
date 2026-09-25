// İstanbul saati yardımcıları. Türkiye 2016'dan beri sabit UTC+3 (yaz saati
// uygulaması yok) → deterministik aritmetik; mevcut istanbulDateKey() ile
// aynı sonucu verir. Tüm çete zamanları "ms" sayıları olarak tutulur.
import { MS_DAY, MS_HOUR, WINDOW_HOURS } from './config.js';

export const ISTANBUL_OFFSET_MS = 3 * MS_HOUR;

function shifted(ms) {
  return new Date(ms + ISTANBUL_OFFSET_MS);
}

export function dateKeyOf(ms) {
  return shifted(ms).toISOString().slice(0, 10);
}

export function hourOf(ms) {
  return shifted(ms).getUTCHours();
}

// 0 = Pazar ... 6 = Cumartesi
export function weekdayOfKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function midnightMsOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - ISTANBUL_OFFSET_MS;
}

export function addDays(dateKey, n) {
  return dateKeyOf(midnightMsOf(dateKey) + n * MS_DAY + MS_HOUR);
}

export function nextMidnightMs(ms) {
  return midnightMsOf(addDays(dateKeyOf(ms), 1));
}

export function windowSlotOf(ms) {
  return Math.floor(hourOf(ms) / WINDOW_HOURS);
}

export function daysBetweenKeys(fromKey, toKey) {
  return Math.round((midnightMsOf(toKey) - midnightMsOf(fromKey)) / MS_DAY);
}

export function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Bir sonraki saldırı diliminin başlangıcı (v38: 3 saatlik — 00·03·06·…·21),
// "şu an"dan KESİNLİKLE sonra.
export function nextWindowStartMs(ms) {
  return midnightMsOf(dateKeyOf(ms)) + (windowSlotOf(ms) + 1) * WINDOW_HOURS * MS_HOUR;
}
export function windowStartMs(ms) {
  return midnightMsOf(dateKeyOf(ms)) + windowSlotOf(ms) * WINDOW_HOURS * MS_HOUR;
}
// v38: savaş hakkı belgesi kimliği (3 saatlik dilim; eski 6 saatlik kimliklerle çakışmasın diye 'w' ön eki)
export function slotIdOf(actorId, ms) {
  return `${actorId}_${dateKeyOf(ms)}_w${windowSlotOf(ms)}`;
}
export function hhmmOf(ms) {
  const d = shifted(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
