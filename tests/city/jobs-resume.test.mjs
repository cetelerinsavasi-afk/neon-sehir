// v154 — yarım kalan meslek işi sayfa yenilense de kaldığı yerden sürer (Firestore'a ek çağrı yok)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobRunner } from '../../src/components/City/cityJobs.js';
import { BUS_STOPS } from '../../functions/cityJobsData.js';

// tarayıcı localStorage yerine bellek
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

function fakeEngine() {
  const e = { pos: { x: 0, z: 0, speed: 0, yaw: 0 }, pax: 0, target: null };
  return {
    e,
    api: {
      jobProbe: () => ({ ...e.pos }),
      jobTarget: (t) => (e.target = t),
      jobRoute: () => {},
      jobPeople: () => {},
      jobSuspect: () => {},
      jobSuspectPos: () => null,
      jobStopSuspect: () => {},
      setJob: ({ pax = 0 } = {}) => (e.pax = pax),
    },
  };
}
const RUN = { id: 'run1', job: 'otobus', task: { type: 'otobus', start: 0, waiting: BUS_STOPS.map(() => 2) }, par: 300, len: 1000 };
function runner(calls, eng) {
  return createJobRunner({
    engine: () => eng.api,
    call: async (p) => {
      calls.push(p.op);
      if (p.op === 'jobStart') return { run: RUN, left: 5, daily: 10 };
      if (p.op === 'jobDone') return { total: 500, perf: {}, t: p.t, hits: p.hits, left: 4, daily: 10 };
      return { ok: true };
    },
  });
}
const flush = () => new Promise((r) => setTimeout(r, 0));
// bir durağa git, dur, kapılar 3 sn
function serveStop(r, eng, k) {
  const s = BUS_STOPS[k];
  eng.e.pos = { x: s.x, z: s.z, speed: 0, yaw: 0 };
  r.tick(0.1);
  for (let i = 0; i < 35; i++) r.tick(0.1);
}

test('otobüs 3 durak → sayfa yenilendi → aynı iş 4. duraktan sürer, yeni iş istenmez, sonunda aynı iş ödenir', async () => {
  mem.clear();
  const calls1 = [];
  const eng1 = fakeEngine();
  const r1 = runner(calls1, eng1);
  r1.setVehicle({ id: 'bus1', catalogId: 12, job: 'otobus' });
  r1.start();
  await flush();
  for (let k = 0; k < 3; k++) serveStop(r1, eng1, k);
  assert.deepEqual(calls1, ['jobStart']);
  const saved = JSON.parse(mem.get('ns_jobRun_v1'));
  assert.equal(saved.st.idx, 3, '3 durak kaydedildi');
  const onboard = saved.st.onboard;

  // --- sayfa yenilendi (eski runner yok olur, stop çağrılmaz) ---
  const calls2 = [];
  const eng2 = fakeEngine();
  const r2 = runner(calls2, eng2);
  r2.setVehicle({ id: 'bus1', catalogId: 12, job: 'otobus' });
  r2.start();
  await flush();
  assert.deepEqual(calls2, [], 'jobStart yeniden çağrılmadı (aynı iş sürüyor)');
  assert.equal(eng2.e.pax, onboard, 'yolcular otobüste');
  assert.match(eng2.e.target?.name || '', new RegExp(`Durak ${BUS_STOPS[3].n}:`), 'hedef 4. durak');
  for (let k = 3; k < BUS_STOPS.length; k++) serveStop(r2, eng2, k);
  await flush();
  assert.deepEqual(calls2, ['jobDone'], 'iş bitince aynı iş ödendi');
  assert.equal(mem.has('ns_jobRun_v1'), false, 'kayıt silindi');
});

test('başka araçla ya da iş bırakılınca kayıt devam ettirilmez', async () => {
  mem.clear();
  const calls = [];
  const eng = fakeEngine();
  const r = runner(calls, eng);
  r.setVehicle({ id: 'bus1', catalogId: 12, job: 'otobus' });
  r.start();
  await flush();
  serveStop(r, eng, 0);
  r.stop(true);
  assert.equal(mem.has('ns_jobRun_v1'), false);
  // eski kayıt elle konsa bile başka araçta kullanılmaz
  mem.set('ns_jobRun_v1', JSON.stringify({ vid: 'bus1', at: Date.now() / 1000, run: RUN, st: { idx: 2 } }));
  const calls2 = [];
  const r2 = runner(calls2, fakeEngine());
  r2.setVehicle({ id: 'bus2', catalogId: 12, job: 'otobus' });
  r2.start();
  await flush();
  assert.deepEqual(calls2, ['jobStart']);
});
