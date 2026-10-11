import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.js';

// v88 — İstihbarat kasa sınırı: üye × 100.000; aşan gelir yanar; üye azalınca fazlası silinmez.
async function live(h) {
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const w = h.raw('gangSystem/config').liveWorldId;
  const set = (path, data) => h.db.doc(`gangWorlds/${w}/${path}`).set(data, { merge: true });
  const kasa = () => h.raw(`gangWorlds/${w}/intel/main/private/state`)?.kasa || 0;
  return { w, set, kasa };
}

test('v88: gelir sınıra kadar girer, aşanı yanar; sınırdayken hiç girmez', async () => {
  const h = await createHarness();
  const L = await live(h);
  await L.set('intel/main', { memberCount: 10 }); // sınır 1.000.000
  await L.set('intel/main/private/state', { kasa: 900_000 });
  // ceza 400.000 → yarısı (200.000) kasaya gidecekti; sadece 100.000 girer, 100.000 yanar
  const r = await h.system.onSuspicionFine('u1', 400_000, 'f1');
  assert.deepEqual(r, { credited: 100_000, burned: 300_000 });
  assert.equal(L.kasa(), 1_000_000);
  const r2 = await h.system.onSuspicionFine('u2', 50_000, 'f2');
  assert.equal(r2.credited, 0, 'sınırdayken girmez');
  assert.equal(L.kasa(), 1_000_000);
});

test('v88: üye azalınca fazla silinmez; harcanıp sınırın altına inince gelir yeniden girer', async () => {
  const h = await createHarness();
  const L = await live(h);
  await L.set('intel/main', { memberCount: 11 });
  await L.set('intel/main/private/state', { kasa: 1_100_000 });
  await L.set('intel/main', { memberCount: 10 }); // sınır 1.000.000'a indi
  const r = await h.system.onSuspicionFine('u1', 100_000, 'f1');
  assert.equal(r.credited, 0);
  assert.equal(L.kasa(), 1_100_000, 'fazlası silinmedi');
  await L.set('intel/main/private/state', { kasa: 950_000 }); // harcandı
  const r2 = await h.system.onSuspicionFine('u2', 200_000, 'f2'); // 100.000 kasaya gidecekti
  assert.equal(r2.credited, 50_000, 'sadece sınıra kadar');
  assert.equal(L.kasa(), 1_000_000);
});

test('v88: tek seferlik sıfırlama — kasa 1.000.000a iner, dağıtım hakkı orantılı küçülür, bir daha çalışmaz', async () => {
  const h = await createHarness();
  await h.db.doc('gangWorlds/test').set({ intelKasaResetV88: null }, { merge: true });
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 4_500_000, distributableLeft: 900_000, kasaAtMidnight: 4_500_000, midnightDateKey: '2026-09-21' }, { merge: true });
  await h.internal.clock.runClock('test');
  const st = h.get('intel/main/private/state');
  assert.equal(st.kasa, 1_000_000);
  assert.equal(st.distributableLeft, 200_000);
  assert.equal(st.kasaAtMidnight, 1_000_000);
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 3_000_000 }, { merge: true });
  await h.internal.clock.runClock('test');
  assert.equal(h.get('intel/main/private/state').kasa, 3_000_000, 'ikinci kez çalışmaz');
});
