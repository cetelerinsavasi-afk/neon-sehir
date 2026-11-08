// v146 — çete zümrüdü: bağış (1 zümrüt = 50.000 prestij), dağıtılamaz / çekilemez
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

test('v146: zümrüt bağışı kasanın zümrüdüne gider, 50.000 prestij verir; zümrüt yetmezse olmaz', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 3 });
  const who = A.ids[0];
  await h.db.doc(`gangWorlds/test/players/${who}`).update({ emerald: 5 });
  const before = h.member(A.gangId, who).prestige || 0;
  const r = await h.act(who, 'donateGem', { amount: 3 });
  assert.equal(r.donated, 3);
  assert.equal(h.state(A.gangId).gem, 3);
  assert.equal((await h.db.doc(`gangWorlds/test/players/${who}`).get()).data().emerald, 2);
  assert.equal(h.member(A.gangId, who).prestige, before + 150_000);
  assert.ok(h.chat(A.gangId).some((m) => /3 zümrüt bağışladı/.test(m)));
  const e = await h.fails(who, 'donateGem', { amount: 5 });
  assert.match(e.message, /zümrüt/);
});

test('v146: ucuz çete ilanı 3 günde otomatik satılır; eski (7 günlük) ilanın süresi bir kez 3 güne çekilir', async () => {
  const h = await createHarness();
  const G = await setupGang(h, { members: 1, name: 'Tüccar' });
  await h.db.doc(`gangWorlds/test/gangs/${G.gangId}/private/depot`).set({ items: { 'araba:2': 3 }, capacity: 1000, usedUnits: 60, reservedUnits: 0 });
  // eski kayıt: v146 öncesi 7 günlük süreyle
  const t0 = h.clock.now;
  await h.db.doc('gangWorlds/test/market/eski').set({ gangId: G.gangId, itemKey: 'araba:2', itemType: 'vehicle', label: 'Hatchback', status: 'open', quantity: 1, listedQty: 1, unitPrice: 6000, createdAtMs: t0, batches: [{ q: 1, at: t0 }], autoSellAtMs: t0 + 7 * 86400000 });
  const { listingId } = await h.act(G.baba, 'listDepotItem', { itemKey: 'araba:2', qty: 1, unitPrice: 6500 });
  const l = h.get(`market/${listingId}`);
  assert.equal(l.autoSellAtMs, h.clock.now + 3 * 86400000, 'yeni ilan: 3 gün');
  const ctx = () => h.system._internal.core.makeCtx('test', h.db._get('gangWorlds/test'));
  await h.system._internal.market.settleDepotAutoSales(ctx());
  assert.equal(h.get('market/eski').autoSellAtMs, t0 + 3 * 86400000, 'eski ilan 3 güne çekildi');
  assert.equal(h.get('market/eski').status, 'open');
  // 3 gün sonra ikisi de satılır, para kasaya
  const k0 = h.state(G.gangId).kasa;
  h.clock.now += 3 * 86400000 + 1000;
  await h.system._internal.market.settleDepotAutoSales(ctx());
  assert.equal(h.get('market/eski').status, 'sold');
  assert.equal(h.get(`market/${listingId}`).status, 'sold');
  assert.equal(h.state(G.gangId).kasa, k0 + 6000 + 6500);
  assert.ok(h.chat(G.gangId).some((m) => /3 gün içinde satılmadığı için otomatik satıldı/.test(m)));
});
