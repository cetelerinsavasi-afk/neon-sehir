// v60 — ChatsApp listesi / sohbet için zaman biçimleri (WhatsApp benzeri)
const TZ = 'Europe/Istanbul';
const dayKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

export function tsMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

export function clockOf(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

// Bugün → saat, dün → "Dün", bu hafta → gün adı, daha eski → tarih
export function listTimeOf(ms, now = Date.now()) {
  if (!ms) return '';
  const k = dayKey(ms);
  if (k === dayKey(now)) return clockOf(ms);
  if (k === dayKey(now - 86400000)) return 'Dün';
  if (now - ms < 6 * 86400000) return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, weekday: 'long' }).format(new Date(ms));
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(ms));
}

export function dayLabelOf(ms, now = Date.now()) {
  const k = dayKey(ms);
  if (k === dayKey(now)) return 'Bugün';
  if (k === dayKey(now - 86400000)) return 'Dün';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(ms));
}

export function sameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

export function hoursLeft(expiresAtMs, now = Date.now()) {
  const h = Math.max(0, Math.ceil((expiresAtMs - now) / 3600000));
  return h;
}
