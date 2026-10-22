import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.js';

// v108 — İstihbarat kasası KAPANDI (v88/v91 kasa sınırı testlerinin yerine):
//  - mevcut kasa tek seferlik devlet kasasına devredilir (bir kez)
//  - yeni altın dağıtımı açılamaz; açık kalmış eski dağıtımın kalanı devlete döner
//  - İstihbaratın kazandığı her şey devlete gelir yazılır (savaş, bahis, rüşvet…)

test('v108: İstihbarat kasası tek seferlik devlet kasasına devredilir, bir daha çalışmaz', async () => {
  const h = await createHarness();
  // yeni dünyada ilk saat turunda kasa zaten boş kapanır; eski bir dünyayı taklit et
  await h.db.doc('gangWorlds/test').set({ intelKasaClosedV108: null, intelKasaResetV88: 1, intelKasaResetV91: 1 }, { merge: true });
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 2_345_678, kasaAtMidnight: 2_000_000, distributableLeft: 400_000 }, { merge: true });
  await h.internal.clock.runClock('test');
  const st = h.get('intel/main/private/state');
  assert.equal(st.kasa, 0);
  assert.equal(st.distributableLeft, 0);
  assert.equal(h.treasury().in.ist_kasa_devri, 2_345_678);
  // ikinci tur: tekrar devretmez
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 500 }, { merge: true });
  await h.internal.clock.runClock('test');
  assert.equal(h.get('intel/main/private/state').kasa, 500, 'ikinci kez çalışmaz');
  assert.equal(h.treasury().in.ist_kasa_devri, 2_345_678);
  assert.ok(Object.values(h.db._dump('gangWorlds/test/intel/main/log/')).some((l) => /kasası kapandı/.test(l.text)));
});

test('v108: İstihbarat altın dağıtamaz; açık kalmış eski dağıtımın kalanı süre dolunca devlete döner', async () => {
  const h = await createHarness();
  const ids = [];
  for (let i = 0; i < 6; i++) {
    const id = await h.persona({ displayName: `Ajan${i}`, gold: 0, power: 1000, reputation: 80 });
    await h.act(id, 'joinIntel', { codeName: `Ajan${i}` });
    ids.push(id);
  }
  const rid0 = (await h.membership(ids[0])).intelRosterId;
  await h.db.doc(`gangWorlds/test/intelRoster/${rid0}`).update({ rank: 'baskan', prestige: 9_000_000 });
  await h.db.doc(`gangWorlds/test/memberships/${ids[0]}`).set({ intelRank: 'baskan' }, { merge: true });
  assert.match((await h.fails(ids[0], 'createDistribution', { org: 'intel', group: 'hepsi', perPerson: 100, slots: 7 })).message, /kasası yok/);
  // v108 öncesinden kalma açık dağıtım (havuzda 7 × 1.000)
  const now = h.clock.now;
  await h.db.doc('gangWorlds/test/distributions/eski').set({ orgType: 'intel', orgId: 'main', group: 'hepsi', groupLabel: 'Tüm üyeler', createdByName: 'X', creatorKey: 'yok', perPerson: 1000, slots: 7, total: 7000, claims: {}, claimedCount: 0, claimedTotal: 0, status: 'open', createdAtMs: now, expiresAtMs: now + 3600_000, openUntilMs: now + 3600_000 });
  await h.act(ids[1], 'claimDistribution', { distributionId: 'eski' });
  assert.equal(h.gold(ids[1]), 1000, 'eski dağıtımdan pay alınabilir');
  h.clock.now += 2 * 3600_000;
  await h.internal.clock.runClock('test');
  assert.equal(h.get('distributions/eski').status, 'expired');
  assert.equal(h.treasury().in.ist_iade, 6000, 'kalan devlete');
  assert.equal(h.get('intel/main/private/state').kasa || 0, 0, 'İstihbarat kasasına bir şey girmez');
});
