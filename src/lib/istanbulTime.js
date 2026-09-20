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

// Futbol kadro kilidi — bkz. functions/index.js futbolIsLineupLockedIstanbul.
// Saat 18:00-19:00 arası (İstanbul) o günkü maç zaten 18:00'de hesaplanıp
// dondurulduğu için kadro/dizilim/taktik/mücadele değişikliği kilitli —
// sunucu zaten reddediyor, bu arayüz tarafındaki AYNI kural (kullanıcı
// boşuna değiştirmeye çalışmasın diye).
export function isFutbolLineupLockedIstanbul(now = Date.now()) {
  return istanbulHMS(new Date(now)).hour === 18;
}

// Kilit açılana (saat 19:00'a) kadar kalan milisaniye — sadece kilitliyken
// anlamlı, geri sayım göstermek için.
export function msUntilFutbolLineupUnlock(now = Date.now()) {
  const { hour, minute, second } = istanbulHMS(new Date(now));
  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;
  return Math.max(0, (19 * 3600 - secondsSinceMidnight) * 1000);
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

// Sponsorluk saati — KULLANICI DÜZELTMESİ: fabrika↔kulüp sponsorluk
// işlemleri (yeni anlaşmanın başlaması, fesih, günlük ödeme) artık gece
// 00:00'da değil her gün 19:00'da (İstanbul) gerçekleşiyor (bkz.
// functions/index.js processFutbolSponsorshipsNightly — runFutbolDailyClock
// içinden çağrılıyor). Arayüz metinleri "yarın 00:00" gibi sabit bir zaman
// yazmak yerine, ŞU ANA göre doğru olanı söylesin: 19:00'dan önceyse
// "bugün 19:00", sonrasıysa "yarın 19:00". Sunucudaki
// sponsorshipNextSettleLabel ile AYNI mantık. `% 24`: bazı Intl
// uygulamaları gece yarısını "24" döndürebiliyor.
export const SPONSORSHIP_SETTLE_HOUR = 19;
export function nextSponsorshipSettleLabel(now = Date.now()) {
  const { hour } = istanbulHMS(new Date(now));
  return hour % 24 < SPONSORSHIP_SETTLE_HOUR ? 'bugün 19:00' : 'yarın 19:00';
}
