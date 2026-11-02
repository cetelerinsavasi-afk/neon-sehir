// =============================================================================
// v138 — MALİYET: TÜM ZAMANLANMIŞ İŞLER TEK TETİKLEYİCİDE (cronTick)
// Eskiden her zamanlanmış iş ayrı bir Cloud Scheduler işiydi (~29 iş × aylık ~₺3,3 ≈
// ₺96). Google ilk 3 işi ücretsiz veriyor: artık sadece cronTick (dakikada bir) +
// dailyReset + dailyResetRecovery var. Kod içindeki "onSchedule({ schedule }, fn)"
// tanımları AYNEN duruyor; onSchedule burada işi kaydeder, cronTick her dakika
// hangi işlerin zamanı geldiyse onları çalıştırır.
//
// Desteklenen zaman ifadeleri (kodda kullanılanlar):
//   'every N minutes' · 'every N hours' · 'every 60 minutes' · 'every 24 hours'
//   ve 5 alanlı cron: 'dk sa gün ay haftagünü' (sayı, *, liste 1,2, aralık 0-3, adım */5)
// Cron ifadeleri timeZone'a göre (verilmediyse UTC) değerlendirilir; "every …" işleri
// aynı dakikaya yığılmasın diye kayıt sırasına göre dakikalara yayılır. Günlük
// ("every 24 hours") işler gece yükünden uzak, İstanbul 04:xx'te çalışır.
// =============================================================================

const tzParts = (ms, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'UTC',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return { minute: Number(get('minute')), hour: Number(get('hour')) % 24, day: Number(get('day')), month: Number(get('month')), weekday: wd };
};

function fieldMatcher(expr, min, max) {
  if (expr === '*') return () => true;
  const allowed = new Set();
  for (const part of expr.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? Number(stepStr) : 1;
    let lo;
    let hi;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      [lo, hi] = range.split('-').map(Number);
    } else {
      lo = Number(range);
      hi = stepStr ? max : lo;
    }
    if (![lo, hi, step].every(Number.isFinite) || step <= 0) throw new Error(`cron alanı anlaşılmadı: ${expr}`);
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return (v) => allowed.has(v);
}

export function parseSchedule(schedule, timeZone, slot = 0) {
  const s = String(schedule || '').trim();
  let m = /^every (\d+) minutes?$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n >= 60 && n % 60 === 0) return parseSchedule(`every ${n / 60} hours`, timeZone, slot);
    const off = slot % n;
    return { kind: 'interval', due: (ms) => Math.floor(ms / 60_000) % n === off };
  }
  m = /^every (\d+) hours?$/.exec(s);
  if (m) {
    const h = Number(m[1]);
    const minuteOff = (slot * 7 + 3) % 60;
    if (h >= 24) {
      // günlük: İstanbul 04:xx
      return { kind: 'daily', due: (ms) => { const p = tzParts(ms, 'Europe/Istanbul'); return p.hour === 4 && p.minute === minuteOff; } };
    }
    return { kind: 'hours', due: (ms) => { const p = tzParts(ms, 'Europe/Istanbul'); return p.hour % h === 0 && p.minute === minuteOff; } };
  }
  const f = s.split(/\s+/);
  if (f.length === 5) {
    const [mi, ho, dom, mon, dow] = [fieldMatcher(f[0], 0, 59), fieldMatcher(f[1], 0, 23), fieldMatcher(f[2], 1, 31), fieldMatcher(f[3], 1, 12), fieldMatcher(f[4], 0, 6)];
    return { kind: 'cron', due: (ms) => { const p = tzParts(ms, timeZone); return mi(p.minute) && ho(p.hour) && dom(p.day) && mon(p.month) && dow(p.weekday); } };
  }
  throw new Error(`Zamanlama anlaşılmadı: ${s}`);
}

export function createCron() {
  const jobs = [];
  function register(opts, handler, label = null) {
    const slot = jobs.length;
    const spec = parseSchedule(opts?.schedule, opts?.timeZone, slot);
    jobs.push({ slot, label: label || `${opts?.schedule}#${slot}`, schedule: opts?.schedule, due: spec.due, handler });
    return handler;
  }
  // Bu dakikanın (planlanan zaman) işlerini çalıştırır. Bir işin hatası diğerlerini durdurmaz.
  async function tick(atMs, { log = console } = {}) {
    const minuteMs = Math.floor(atMs / 60_000) * 60_000;
    const due = jobs.filter((j) => j.due(minuteMs));
    const started = Date.now();
    const res = await Promise.allSettled(
      due.map(async (j) => {
        const t0 = Date.now();
        try {
          await j.handler();
          return { label: j.label, ms: Date.now() - t0 };
        } catch (err) {
          log.error?.(`cronTick iş hatası: ${j.label}`, err);
          throw err;
        }
      })
    );
    const failed = res.filter((r) => r.status === 'rejected').length;
    return { ran: due.map((j) => j.label), failed, ms: Date.now() - started };
  }
  return { register, tick, jobs };
}
