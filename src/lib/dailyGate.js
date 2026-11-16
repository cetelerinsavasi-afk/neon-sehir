// =============================================================================
// v165 — "GÜNDE BİR KEZ" kapısı (saf mantık; cihazda localStorage ile tutulur).
//
// Fabrika ekranı her açılışta `ensureFactoryMigrationsV38` çağırıyordu (haftada ~1.600
// çağrı, çoğu soğuk başlatma). İçindeki geçişler çoktan bitti (migrations bayrakları
// var); geriye kalan tek iş `releaseLeftFactoryWorkers` — 00:00 işi (dailyReset)
// aksarsa DÜNKÜ ve öncesi kayıtları boşaltan güvenlik ağı. Gün içinde birden çok kez
// çalıştırmanın sonucu tek seferle AYNI (sadece dateKey < bugün kayıtlarına bakar).
// Kural: İstanbul saatiyle 00:00–00:20 arası her açılışta eskisi gibi çağrılır
// (gece yarısı sınırında hiçbir kayıt kaçmasın); 00:20'den sonra cihaz başına günde 1.
// localStorage yoksa (gizli sekme vb.) eskisi gibi her açılışta çağrılır.
// =============================================================================
export const GATE_FREE_UNTIL_MIN = 20; // İstanbul 00:00–00:20 arası kapı yok

export function istanbulDayAndMinute(nowMs) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const g = (t) => parts.find((p) => p.type === t)?.value || '00';
  return { dayKey: `${g('year')}-${g('month')}-${g('day')}`, minuteOfDay: Number(g('hour')) * 60 + Number(g('minute')) };
}

// Döner: { run: bool, mark: string|null } — mark doluysa çağrıdan sonra kaydedilecek gün
export function decideDailyRun(nowMs, lastDayKey) {
  const { dayKey, minuteOfDay } = istanbulDayAndMinute(nowMs);
  if (minuteOfDay < GATE_FREE_UNTIL_MIN) return { run: true, mark: null };
  if (lastDayKey === dayKey) return { run: false, mark: null };
  return { run: true, mark: dayKey };
}

function storage() {
  try {
    const s = globalThis.window?.localStorage;
    if (!s) return null;
    const k = '__neon_probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

// fn: () => Promise. Başarılı biterse gün işaretlenir; hata olursa işaretlenmez (sonraki açılış tekrar dener).
export function runOncePerIstanbulDay(key, fn, nowMs = Date.now()) {
  const s = storage();
  if (!s) return fn();
  let last = null;
  try {
    last = s.getItem(key);
  } catch {
    /* yoksay */
  }
  const d = decideDailyRun(nowMs, last);
  if (!d.run) return Promise.resolve({ skipped: 'today' });
  return Promise.resolve()
    .then(fn)
    .then((r) => {
      if (d.mark) {
        try {
          s.setItem(key, d.mark);
        } catch {
          /* yoksay */
        }
      }
      return r;
    });
}
