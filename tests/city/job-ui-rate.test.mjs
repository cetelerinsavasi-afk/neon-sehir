// v192 — görev sürerken ekran (CityScreen) saniyede 10 kez baştan çizilmesin: iş koşturucusu yalnızca
// ekranda görünen bir şey değişince haber verir (pusula / mesafe en sık ~4 kez/sn).
// Çalıştır: node --test tests/city/job-ui-rate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobRunner } from '../../src/components/City/cityJobs.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const RUN = { id: 'run1', job: 'tir', task: { type: 'tir', cargo: 'Konteyner', depot: 0 }, par: 300, len: 1000 };
const flush = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('tır görevinde 3 sn sürüş: ekran güncellemesi saniyede ~4ten az, sabit dururken hiç', async () => {
  mem.clear();
  const pos = { x: 300, z: -300, speed: 15, yaw: 0.3 };
  const api = { jobProbe: () => ({ ...pos }), jobTarget: () => {}, jobRoute: () => {}, jobPeople: () => {}, jobSuspect: () => {}, jobSuspectPos: () => null, jobStopSuspect: () => {}, setJob: () => {} };
  let n = 0;
  const r = createJobRunner({ engine: () => api, call: async (p) => (p.op === 'jobStart' ? { run: RUN, left: 5, daily: 10 } : { ok: true }), onUi: () => (n += 1) });
  r.setVehicle({ id: 'tir1', catalogId: 11, job: 'tir' });
  r.start();
  await flush();
  n = 0;
  for (let i = 0; i < 30; i++) {
    pos.x -= 1.5; // 15 m/sn
    pos.yaw += 0.01;
    r.tick(0.1);
    await sleep(100);
  }
  assert.ok(n <= 14, `3 sn'de ${n} güncelleme (eskiden 30)`);
  assert.ok(n >= 3, `pusula yine de güncelleniyor: ${n}`);
  const before = n;
  pos.speed = 0;
  for (let i = 0; i < 10; i++) {
    r.tick(0.1);
    await sleep(100);
  }
  assert.ok(n - before <= 1, `dururken ${n - before} güncelleme`);
  r.stop(true);
});
