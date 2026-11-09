// =============================================================================
// v151 — MESLEKLER (shopAction op'ları): jobStart / jobDone / jobInfo
//
//   Ticari aracın SAHİBİ şehirde araca binip "İşe başla" der → jobStart: sunucu
//   işi seçer (tır: hangi depo; taksi: yolcu nereden nereye; ambulans: vaka yeri;
//   polis: kovalamaca ya da devriye; otobüs: 10 durak) ve başlangıç anını yazar.
//   İş bitince jobDone: süre ve çarpma sayısı → kazanç (vehicleKinds.jobPerf).
//   Hile koruması: işin en kısa mümkün süresi (mesafe / araç azami hızı) dolmadan
//   bitirilemez; süre ve çarpma çarpanı sınırlıdır (×0,6 – ×1,35 · en az ×0,5).
//   Günlük hak OYUNCU + MESLEK başına: 10 tır alan da günde toplam 10 sevkiyat yapar
//   (users/{uid}.jobs = { day, n: { tir: 3, … } }). Süren iş araçta: vehicles/{id}.job.run
//   Firestore: iş başına 2 yazma (başla + bitir) — şehirdeki hareket RTDB'de.
// =============================================================================
import { JOBS, jobOf, jobPerf, jobReward } from './vehicleKinds.js';
import { LIMAN_BAY, DEPOTS, HOSPITAL, BUS_STOPS, ROAD_SPOTS, manhattan, busRouteLen } from './cityJobsData.js';
import { goldTag } from './moneyLog.js';

const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const dayKey = (ms = Date.now()) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10); // İstanbul günü

// yük çeşitleri (tır) — çarpan kazancı değiştirir (ortalama ≈ 1)
export const CARGO = [
  ['Elektronik', 1.15],
  ['Tekstil', 0.95],
  ['Mobilya', 1.0],
  ['Makine Parçası', 1.1],
  ['Dondurulmuş Gıda', 1.05],
  ['Kereste', 0.85],
  ['Oyuncak', 0.9],
];
const CRIMES = ['Araç hırsızlığı', 'Banka soygunu şüphelisi', 'Hız ihlali + kaçma', 'Kırmızı ışık + kaçma', 'Kapkaç şüphelisi'];
const CASES = [
  ['Trafik kazası', 'Yaralı yerde, bilinci açık'],
  ['Kalp krizi şüphesi', 'Yaşlı hasta, acil!'],
  ['Düşme', 'Bacağı kırık olabilir'],
  ['Bayılma', 'Sıcaktan bayılmış'],
  ['Spor sakatlığı', 'Maçta sakatlandı'],
];
const PAX = ['Ayşe Hanım', 'Mehmet Bey', 'Turist Hans', 'Kerem', 'Zeynep', 'İş insanı', 'Teyze', 'Öğrenci Ece', 'Ahmet Usta'];

// araçların azami hızı (m/s) — en kısa süre sınırı için (şehir motorundaki değerlerle aynı / biraz üstü)
const VMAX = { tir: 22, otobus: 20, taksi: 32, polis: 40, ambulans: 30 };

const pick = (a, r = Math.random) => a[Math.floor(r() * a.length) % a.length];
function spotAway(from, min, max, not = []) {
  const pool = ROAD_SPOTS.filter((s) => !not.includes(s.i) && (!from || (manhattan(s, from) >= min && manhattan(s, from) <= max)));
  return pick(pool.length ? pool : ROAD_SPOTS);
}

// İşi seç: istemcinin göstereceği her şey + sunucunun süre sınırları
export function planJob(job, near = null) {
  const at = near && Number.isFinite(near.x) && Number.isFinite(near.z) ? { x: near.x, z: near.z } : null;
  if (job === 'tir') {
    const d = Math.floor(Math.random() * DEPOTS.length);
    const [cargo, mul] = pick(CARGO);
    const len = manhattan(LIMAN_BAY, DEPOTS[d]);
    return { task: { type: 'tir', depot: d, cargo, ton: 6 + Math.floor(Math.random() * 18) }, mul, len, par: len / 8 + 25, minT: len / VMAX.tir + 4 };
  }
  if (job === 'otobus') {
    // en yakın duraktan başlar, 10 durağın hepsini sırayla gezer
    let s = 0;
    if (at) {
      let bd = Infinity;
      BUS_STOPS.forEach((st, i) => {
        const d = manhattan(st, at);
        if (d < bd) {
          bd = d;
          s = i;
        }
      });
    }
    const len = busRouteLen(s);
    return { task: { type: 'otobus', start: s, waiting: BUS_STOPS.map(() => 1 + Math.floor(Math.random() * 4)) }, mul: 1, len, par: len / 7 + BUS_STOPS.length * 6, minT: len / VMAX.otobus + BUS_STOPS.length * 3 };
  }
  if (job === 'taksi') {
    const from = spotAway(at, 30, 220);
    const to = spotAway(from, 110, 420, [from.i]);
    const len = manhattan(from, to);
    return { task: { type: 'taksi', from: from.i, to: to.i, pax: pick(PAX), rush: Math.random() < 0.35 }, mul: 1, len, par: len / 9 + 12, minT: len / VMAX.taksi + 2 };
  }
  if (job === 'ambulans') {
    const from = spotAway(at, 60, 300);
    const len = manhattan(from, HOSPITAL);
    const [title, desc] = pick(CASES);
    return { task: { type: 'ambulans', from: from.i, title, desc }, mul: 1, len, par: len / 10 + 12, minT: len / VMAX.ambulans + 3 };
  }
  if (job === 'polis') {
    if (Math.random() < 0.6) {
      const sp = spotAway(at, 70, 220);
      return { task: { type: 'polis', mode: 'chase', from: sp.i, crime: pick(CRIMES), car: pick([2, 4, 5, 6, 7]) }, mul: 1.08, len: 0, par: 75, minT: 12 };
    }
    const a = spotAway(at, 60, 200);
    const b = spotAway(a, 80, 220, [a.i]);
    const c = spotAway(b, 80, 220, [a.i, b.i]);
    const len = manhattan(a, b) + manhattan(b, c);
    return { task: { type: 'polis', mode: 'patrol', pts: [a.i, b.i, c.i] }, mul: 0.88, len, par: len / 10 + 20, minT: len / VMAX.polis + 2 };
  }
  return null;
}

export function createJobs({ db, FieldValue, HttpsError, splitIncomeForDebt, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const vRef = (id) => db.collection('vehicles').doc(id);
  const uRef = (uid) => db.collection('users').doc(uid);

  function ownedWorkVehicle(v, uid) {
    if (!v || v.ownerId !== uid) fail('permission-denied', 'Bu araç senin değil.');
    const job = jobOf(v.catalogId);
    if (!job || !JOBS[job]) fail('failed-precondition', 'not-work-vehicle');
    if (v.listed) fail('failed-precondition', 'listed');
    if (v.seizedByBank) fail('failed-precondition', 'seized');
    if ((v.lifeDays ?? 20) <= 0) fail('failed-precondition', 'life0');
    return job;
  }
  // oyuncunun bugün bu meslekte tamamladığı iş sayısı (araç sayısından bağımsız)
  const todayCount = (u, job) => (u?.jobs?.day === dayKey(now()) ? Number(u.jobs.n?.[job]) || 0 : 0);

  // { vehicleId, x?, z? } → { run: { id, job, task, par }, left }
  async function jobStart(uid, p) {
    if (!isId(p?.vehicleId)) fail('invalid-argument', 'Geçersiz araç.');
    return db.runTransaction(async (tx) => {
      const [s, us] = await Promise.all([tx.get(vRef(p.vehicleId)), tx.get(uRef(uid))]);
      const v = s.exists ? s.data() : null;
      const job = ownedWorkVehicle(v, uid);
      const n = todayCount(us.data(), job);
      const J = JOBS[job];
      if (n >= J.daily) fail('resource-exhausted', 'job-limit');
      const plan = planJob(job, { x: Number(p.x), z: Number(p.z) });
      const id = `${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const run = { id, job, at: now(), task: plan.task, mul: plan.mul, len: Math.round(plan.len), par: Math.round(plan.par), minT: Math.round(plan.minT * 10) / 10 };
      tx.update(vRef(p.vehicleId), { job: { run } });
      return { ok: true, run: { id, job, task: plan.task, par: run.par, len: run.len }, left: J.daily - n, daily: J.daily };
    });
  }

  // { vehicleId, runId, t (sn, ölçülen bölüm), hits } → { total, perf, left }
  async function jobDone(uid, p) {
    if (!isId(p?.vehicleId) || typeof p?.runId !== 'string') fail('invalid-argument', 'Geçersiz iş.');
    return db.runTransaction(async (tx) => {
      const [s, us] = await Promise.all([tx.get(vRef(p.vehicleId)), tx.get(uRef(uid))]);
      const v = s.exists ? s.data() : null;
      const job = ownedWorkVehicle(v, uid);
      const run = v.job?.run;
      if (!run || run.id !== p.runId) fail('failed-precondition', 'no-run');
      const J = JOBS[job];
      const u = us.data() || {};
      const n = todayCount(u, job);
      if (n >= J.daily) fail('resource-exhausted', 'job-limit');
      const elapsed = (now() - Number(run.at)) / 1000;
      if (elapsed < (run.minT || 0)) fail('failed-precondition', 'too-fast');
      // ölçülen süre: istemcinin bildirdiği (en az minT, en çok gerçek geçen süre)
      const tRaw = Number(p.t);
      const t = Math.min(elapsed, Math.max(run.minT || 0, Number.isFinite(tRaw) ? tRaw : elapsed));
      const hits = Math.max(0, Math.min(50, Math.floor(Number(p.hits) || 0)));
      const perf = jobPerf(t, run.par, hits);
      const total = jobReward(J.avg, Number(run.mul) || 1, perf);
      const { goldDelta, debtDelta } = splitIncomeForDebt(u.debtToState, total);
      const nn = n + 1;
      const day = dayKey(now());
      const counts = u.jobs?.day === day ? { ...(u.jobs.n || {}) } : {};
      counts[job] = nn;
      tx.update(uRef(uid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('meslek'), debtToState: FieldValue.increment(debtDelta), jobs: { day, n: counts } });
      tx.update(vRef(p.vehicleId), {
        job: { run: null, last: { at: now(), total, t: Math.round(t), hits } },
        jobEarned: FieldValue.increment(total),
      });
      return { ok: true, total, toDebt: total - goldDelta, perf: { speed: Math.round(perf.speed * 100) / 100, dmg: Math.round(perf.dmg * 100) / 100 }, t: Math.round(t), hits, left: J.daily - nn, daily: J.daily };
    });
  }

  // iş bırakıldı (hak harcanmaz)
  async function jobCancel(uid, p) {
    if (!isId(p?.vehicleId)) fail('invalid-argument', 'Geçersiz araç.');
    return db.runTransaction(async (tx) => {
      const s = await tx.get(vRef(p.vehicleId));
      const v = s.exists ? s.data() : null;
      if (!v || v.ownerId !== uid) fail('permission-denied', 'Bu araç senin değil.');
      if (v.job?.run) tx.update(vRef(p.vehicleId), { 'job.run': null });
      return { ok: true };
    });
  }

  return { ops: { jobStart, jobDone, jobCancel } };
}
