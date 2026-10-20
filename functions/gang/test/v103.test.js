// v103 — çete: depodaki ucuz yasaklı madde ilanı 7 günde oyuna satılır (parti
// bazlı) · parktaki güvenli satıştan çeteye haraç + 00:00 özet mesajı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

async function gangWithStock(h) {
  const G = await setupGang(h, { members: 1, name: 'Tüccar' });
  await h.fundKasa(G.gangId, 100_000);
  await h.db.doc(`gangWorlds/test/gangs/${G.gangId}/private/depot`).set({ items: { yasakliMadde: 50 }, capacity: 200, usedUnits: 50, reservedUnits: 0 });
  return G;
}
const depotOf = (h, g) => h.get(`gangs/${g}/private/depot`);

test('ucuz yasaklı madde ilanı (1500 < 1875): her parti kendi 7. gününde kasaya satılır; pahalı ilan açık kalır', async () => {
  const h = await createHarness();
  const G = await gangWithStock(h);
  const { listingId } = await h.act(G.baba, 'listDepotItem', { itemKey: 'yasakliMadde', qty: 10, unitPrice: 1500 });
  const pricey = await h.act(G.baba, 'listDepotItem', { itemKey: 'yasakliMadde', qty: 5, unitPrice: 1875 }); // tam %50 → otomatik değil
  assert.ok(h.get(`market/${listingId}`).autoSellAtMs > 0);
  assert.equal(h.get(`market/${pricey.listingId}`).autoSellAtMs, undefined);
  await h.tickTo('2026-09-27', '09:00'); // 6. gün: ikinci parti
  await h.act(G.baba, 'listDepotItem', { itemKey: 'yasakliMadde', qty: 4, unitPrice: 1500 });
  assert.equal(h.get(`market/${listingId}`).quantity, 14);
  const k0 = h.state(G.gangId).kasa;
  await h.tickTo('2026-09-28', '09:05'); // ilk partinin 7. günü
  let l = h.get(`market/${listingId}`);
  assert.equal(l.quantity, 4, 'sadece ilk 10 satılır');
  assert.equal(l.status, 'open');
  assert.equal(h.state(G.gangId).kasa, k0 + 15_000);
  let d = depotOf(h, G.gangId);
  assert.equal(d.items.yasakliMadde, 40);
  assert.equal(d.listed.yasakliMadde, 9);
  assert.ok(h.chat(G.gangId).some((m) => /10 × .* otomatik satıldı: kasaya \+15\.000/.test(m)));
  // tekrar çalışmak çift satış yapmaz
  await h.internal.clock.runClock('test');
  assert.equal(h.state(G.gangId).kasa, k0 + 15_000);
  await h.tickTo('2026-10-04', '09:10');
  l = h.get(`market/${listingId}`);
  assert.equal(l.status, 'sold');
  assert.equal(h.state(G.gangId).kasa, k0 + 21_000);
  assert.equal(h.get(`market/${pricey.listingId}`).status, 'open', '%50 ve üstü ilan eskisi gibi açık');
  d = depotOf(h, G.gangId);
  assert.equal(d.listed.yasakliMadde, 5);
});

test('alıcı önce en eski partiden alır (FIFO)', async () => {
  const h = await createHarness();
  const G = await gangWithStock(h);
  const buyer = await h.persona({ displayName: 'Alıcı', gold: 100_000, power: 1, reputation: 1 });
  const { listingId } = await h.act(G.baba, 'listDepotItem', { itemKey: 'yasakliMadde', qty: 5, unitPrice: 1300 });
  await h.tickTo('2026-09-24', '09:00');
  await h.act(G.baba, 'listDepotItem', { itemKey: 'yasakliMadde', qty: 5, unitPrice: 1300 });
  await h.act(buyer, 'buyMarketListing', { listingId, qty: 7 });
  const l = h.get(`market/${listingId}`);
  assert.equal(l.quantity, 3);
  assert.equal(l.batches.length, 1, 'ilk parti tükendi');
  assert.equal(l.batches[0].q, 3);
  assert.equal(l.autoSellAtMs, l.batches[0].at + 7 * 24 * 3600_000);
});

test('güvenli satış haracı: üyenin çetesine 500, tekrar yok; çetesizde yanar; 00:00 tek özet mesajı', async () => {
  const h = await createHarness();
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const { liveWorldId } = h.raw('gangSystem/config');
  const act = (uid, action, payload) => h.system.handleAction({ auth: { uid }, data: { action, payload } });
  await h.db.doc('users/boss').set({ displayName: 'Boss', gold: 3_000_000, reputation: 100 });
  h.weaponsByOwner.set('boss', 50_000);
  const { gangId } = await act('boss', 'createGang', { name: 'Haraç', logo: { emoji: '🐺', color: '#ffd23f', bg: '#231c05' } });
  const kasa = () => h.raw(`gangWorlds/${liveWorldId}/gangs/${gangId}/private/state`)?.kasa || 0;
  const k0 = kasa();
  const r1 = await h.system.onContrabandHarac('boss', 500, 'sale_1');
  assert.equal(r1.credited, 500);
  await h.system.onContrabandHarac('boss', 500, 'sale_1'); // aynı satış
  await h.system.onContrabandHarac('boss', 500, 'sale_2');
  assert.equal(kasa(), k0 + 1000);
  const loner = await h.system.onContrabandHarac('loner', 500, 'sale_3');
  assert.equal(loner.credited, 0);
  assert.equal(loner.burned, 500);
  const chatNow = () => Object.values(h.db._dump(`gangWorlds/${liveWorldId}/gangs/${gangId}/chat_genel/`)).map((m) => m.text);
  assert.ok(!chatNow().some((m) => /haraç/.test(m)), 'satış başına mesaj yok');
  h.at('2026-09-22', '00:02');
  await h.internal.clock.runClock(liveWorldId);
  await h.internal.clock.runClock(liveWorldId);
  const msgs = chatNow().filter((m) => /haraç toplandı/.test(m));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Üyeler bugün 2 adet yasaklı madde sattı, 1\.000 haraç toplandı/);
});
