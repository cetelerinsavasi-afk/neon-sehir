// =============================================================================
// politicsRules.js — v136 SEÇİM SİSTEMİ · saf kurallar (sunucu + istemci ortak)
// -----------------------------------------------------------------------------
// Bir seçim döngüsü (cycle = imzaların başladığı CUMA günü, F):
//   F    Cuma     00:00  adaylık başvurusu + imza dönemi başlar
//   F+2  Pazar    00:00  10 imza toplayan adaylarla seçim başlar (oylar gizli)
//   F+2  Pazar    21:00  oylama biter → 3 saat sayım (21 saatin oyları sırayla,
//                        3 saate sıkıştırılmış hâlde açıklanır)
//   F+3  Pazartesi 00:00 sonuç kesinleşir, yeni başkan göreve başlar
//   F+4  Salı     00:00  sonuç ekranı (belediyedeki "Seçimler") kalkar
// Hükümet: göreve başladığı günden 21 gün geçtikten sonraki ilk Cuma yeni imza
// dönemi başlar (seçimle gelen ve darbeyle gelen için aynı). Seçim yapılamazsa
// (başvuru yok / kimse 10 imza toplayamadı) ekip devam eder, bir sonraki Cuma
// başvurular yeniden açılır.
// =============================================================================

export const POLITICS = {
  FIRST_SIGNUP_DAY: '2026-10-30', // ilk imza dönemi (Cuma)
  FEE: 500_000, // adaylık ücreti → belediye kasası (iade yok)
  NEED: 10, // gereken imza
  TERM_DAYS: 21,
  COUP_GUARD_DAYS: 7, // yeni hükümetin darbe koruması
  VOTE_END_HOUR: 21,
  COUNT_HOURS: 3,
  TEXT_MAX: 800,
  TEXT_PREVIEW: 120,
  TEXT_MIN_INTERVAL_MS: 5000,
};

const H = 3_600_000;
const D = 24 * H;

export const polDayKey = (ms = Date.now()) => new Date(ms + 3 * H).toISOString().slice(0, 10);
export const polAddDays = (k, n) => polDayKey(Date.parse(`${k}T12:00:00+03:00`) + n * D);
export const polMidnight = (k) => Date.parse(`${k}T00:00:00+03:00`);
// 0 = Pazar … 5 = Cuma … 6 = Cumartesi
export const polWeekday = (k) => new Date(`${k}T12:00:00Z`).getUTCDay();

/** dayKey'den itibaren (dahil) ilk Cuma */
export function fridayOnOrAfter(k) {
  return polAddDays(k, (5 - polWeekday(k) + 7) % 7);
}
/** dayKey'den SONRAKİ ilk Cuma (dayKey Cuma ise bir hafta sonrası) */
export function fridayAfter(k) {
  return fridayOnOrAfter(polAddDays(k, 1));
}
/** Hükümet sinceDay'de göreve başladı → 21 gün dolduktan sonraki ilk Cuma */
export function termSignupDay(sinceDay) {
  return fridayOnOrAfter(polAddDays(sinceDay, POLITICS.TERM_DAYS + 1));
}

export function cycleTimes(cycle) {
  const signupStart = polMidnight(cycle);
  const signupEnd = polMidnight(polAddDays(cycle, 2));
  return {
    signupStart,
    signupEnd,
    voteEnd: signupEnd + POLITICS.VOTE_END_HOUR * H,
    countEnd: polMidnight(polAddDays(cycle, 3)),
    resultsEnd: polMidnight(polAddDays(cycle, 4)),
  };
}

/**
 * Saate göre beklenen evre (kayıtlı evre gece işinde ilerler; işlemler ikisinin
 * de uyuşmasını ister — 00:00 ile gece işi arasındaki birkaç dakikada işlem yok).
 */
export function phaseAt(cycle, ms) {
  if (!cycle) return 'idle';
  const t = cycleTimes(cycle);
  if (ms < t.signupStart) return 'idle';
  if (ms < t.signupEnd) return 'signup';
  if (ms < t.voteEnd) return 'election';
  if (ms < t.countEnd) return 'counting';
  if (ms < t.resultsEnd) return 'results';
  return 'idle';
}

/** Sayım: oy anı (Pazar 00:00–21:00) → açıklanma anı (21:00–24:00), sıra korunur */
export function revealAtMs(cycle, voteAtMs) {
  const t = cycleTimes(cycle);
  const off = Math.min(Math.max(0, voteAtMs - t.signupEnd), t.voteEnd - t.signupEnd - 1);
  return t.voteEnd + Math.floor(off / ((t.voteEnd - t.signupEnd) / (t.countEnd - t.voteEnd)));
}

/** Adaylar: 10 imzaya ulaşanlar (en hızlı ulaşan önde), sonra imza bekleyenler */
export function splitCandidates(cands) {
  const list = Object.entries(cands || {}).map(([uid, c]) => ({ uid, ...c, sigs: Number(c?.sigs || 0) }));
  const full = list.filter((c) => c.sigs >= POLITICS.NEED && c.fullAtMs).sort((a, b) => a.fullAtMs - b.fullAtMs || (a.uid < b.uid ? -1 : 1));
  const pending = list.filter((c) => !(c.sigs >= POLITICS.NEED && c.fullAtMs)).sort((a, b) => b.sigs - a.sigs || a.appliedAtMs - b.appliedAtMs || (a.uid < b.uid ? -1 : 1));
  return { full, pending };
}

export function cleanPoliticsText(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, POLITICS.TEXT_MAX);
}
