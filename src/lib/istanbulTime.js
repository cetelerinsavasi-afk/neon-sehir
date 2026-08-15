// istanbulTime.js — İstanbul saatine göre "gece yarısına kalan süre" ve
// "sıradaki ibadet vaktine kalan süre" için paylaşılan, saf (React'ten
// bağımsız) yardımcı fonksiyonlar. Yeni Şüphe sekmesindeki (bkz.
// MekanlarScreen/SuspicionTab.jsx) Camii/Karakol/Seyyar Satıcı canlı geri
// sayımları için kullanılır. Sunucudaki istanbulDateKey/istanbulPrayerWindow
// (functions/index.js) ile AYNI mantık — sabit bir UTC ofseti VARSAYILMIYOR,
// Intl ile gerçek Europe/Istanbul saati okunuyor.

function istanbulHMS(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { hour: get('hour'), minute: get('minute'), second: get('second') };
}

// Gece yarısına (İstanbul) kalan milisaniye — Karakol rüşveti ve Seyyar
// Satıcı alışverişi için (ikisi de günlük hak, sıfırlanma anı İstanbul
// 00:00, bkz. functions/index.js istanbulDateKey).
export function msUntilIstanbulMidnight(now = Date.now()) {
  const { hour, minute, second } = istanbulHMS(new Date(now));
  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;
  return Math.max(0, (24 * 3600 - secondsSinceMidnight) * 1000);
}

// bkz. functions/index.js istanbulPrayerWindow / hooks/useMosqueAttendance.js
// currentPrayerWindow — AYNI vakit sınırları: 1: 00-12, 2: 12-15, 3: 15-18,
// 4: 18-21, 5: 21-24.
const PRAYER_WINDOW_END_HOUR = { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 };

// Şu anki vakit bitene (bir sonraki vakit başlayana) kadar kalan milisaniye.
export function msUntilNextPrayerWindow(win, now = Date.now()) {
  const { hour, minute, second } = istanbulHMS(new Date(now));
  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;
  const endHour = PRAYER_WINDOW_END_HOUR[win] ?? 24;
  return Math.max(0, (endHour * 3600 - secondsSinceMidnight) * 1000);
}

// mm:ss (saat >0 ise hh:mm:ss) biçiminde okunabilir geri sayım metni.
export function formatCountdown(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
