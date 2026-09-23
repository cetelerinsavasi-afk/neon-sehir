import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

async function gangWithStock(h) {
  const G = await setupGang(h, { members: 1, name: 'Tüccar' });
  await h.setPrestige(G.gangId, G.ids[0], 1_000_000);
  await h.setRank(G.gangId, G.ids[0], 'tetikci');
  await h.fundKasa(G.gangId, 100_000);
  await h.db.doc(`gangWorlds/test/gangs/${G.gangId}/private/depot`).set({ items: { 'araba:2': 3, yasakliMadde: 50 }, capacity: 200, usedUnits: 80, reservedUnits: 0 });
  return G;
}
const depotOf = (h, g) => h.get(`gangs/${g}/private/depot`);

test('depodan 2. ele: Baba/Sağ Kol; fiyat aralığı; ilandaki ürün depoda yer kaplar ama satılamaz/dağıtılamaz; iptal', async () => {
  const h = await createHarness();
  const G = await gangWithStock(h);
  await h.fails(G.ids[0], 'listDepotItem', { itemKey: 'araba:2', qty: 1, unitPrice: 8000 }); // Tetikçi
  await h.fails(G.baba, 'listDepotItem', { itemKey: 'araba:2', qty: 1, unitPrice: 4999 }); // < yarı fiyat
  await h.fails(G.baba, 'listDepotItem', { itemKey: 'araba:2', qty: 1, unitPrice: 10_001 }); // > mağaza
  await h.fails(G.baba, 'listDepotItem', { itemKey: 'araba:2', qty: 4, unitPrice: 8000 }); // stok yok
  const { listingId } = await h.act(G.baba, 'listDepotItem', { itemKey: 'araba:2', qty: 2, unitPrice: 8000 });
  const d = depotOf(h, G.gangId);
  assert.equal(d.items['araba:2'], 3);
  assert.equal(d.listed['araba:2'], 2);
  assert.equal(d.usedUnits, 80, 'ilandaki ürün depoda yer kaplamaya devam eder');
  await h.fails(G.baba, 'sellFromDepot', { itemKey: 'araba:2', qty: 2 }); // sadece 1 serbest
  await h.act(G.baba, 'sellFromDepot', { itemKey: 'araba:2', qty: 1 });
  await h.fails(G.baba, 'listDepotItem', { itemKey: 'araba:2', qty: 1, unitPrice: 8000 });
  await h.act(G.baba, 'cancelDepotListing', { listingId });
  assert.equal(depotOf(h, G.gangId).listed['araba:2'], 0);
  assert.equal(h.get(`market/${listingId}`).status, 'cancelled');
});

test('başka oyuncu satın alır: para çete kasasına, ürün alıcıya YENİ, depo yeri serbest; çift satış yok', async () => {
  const h = await createHarness();
  const G = await gangWithStock(h);
  const buyer = await h.persona({ displayName: 'Alıcı', gold: 30_000, power: 1, reputation: 1 });
  const { listingId } = await h.act(G.baba, 'listDepotItem', { itemKey: 'araba:2', qty: 3, unitPrice: 9000 });
  const k0 = h.state(G.gangId).kasa;
  await h.fails(buyer, 'buyMarketListing', { listingId, qty: 4 });
  const rs = await Promise.allSettled([1, 2, 3].map(() => h.act(buyer, 'buyMarketListing', { listingId, qty: 2 })));
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1, '3 adetten sadece bir kez 2 alınabilir');
  assert.equal(h.gold(buyer), 30_000 - 18_000);
  assert.equal(h.state(G.gangId).kasa, k0 + 18_000);
  const d = depotOf(h, G.gangId);
  assert.equal(d.items['araba:2'], 1);
  assert.equal(d.listed['araba:2'], 1);
  assert.equal(d.usedUnits, 60);
  assert.equal(h.raw(`gangWorlds/test/players/${buyer}`).inventory.araba_2, 2);
  await h.setPersona(buyer, { gold: 100 });
  await h.fails(buyer, 'buyMarketListing', { listingId, qty: 1 }); // parası yetmez
  assert.ok(h.chat(G.gangId).some((m) => /2\. elden 2 × Şehir Hatchback satıldı: kasaya \+18\.000/.test(m)));
});

test('canlı dünya: alıcıya 20/20 yeni araç belgesi; yasaklı madde envantere; mevcut marketplaceListings koleksiyonuna dokunulmaz', async () => {
  const h = await createHarness();
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const { liveWorldId } = h.raw('gangSystem/config');
  const act = (uid, action, payload) => h.system.handleAction({ auth: { uid }, data: { action, payload } });
  await h.db.doc('users/boss').set({ displayName: 'Boss', gold: 3_000_000, reputation: 100 });
  await h.db.doc('users/buyer').set({ displayName: 'Alıcı', gold: 100_000, reputation: 1, debtToState: 5000 });
  h.weaponsByOwner.set('boss', 50_000);
  const { gangId } = await act('boss', 'createGang', { name: 'Canlı Tüccar', logo: { emoji: '🐺', color: '#ffd23f', bg: '#231c05' } });
  await h.db.doc(`gangWorlds/${liveWorldId}/gangs/${gangId}/private/depot`).set({ items: { 'araba:2': 1, yasakliMadde: 10 }, capacity: 100, usedUnits: 20, reservedUnits: 0 });
  const l1 = await act('boss', 'listDepotItem', { itemKey: 'araba:2', qty: 1, unitPrice: 10_000 });
  const l2 = await act('boss', 'listDepotItem', { itemKey: 'yasakliMadde', qty: 10, unitPrice: 2000 });
  await act('buyer', 'buyMarketListing', { listingId: l1.listingId, qty: 1 });
  await act('buyer', 'buyMarketListing', { listingId: l2.listingId, qty: 4 });
  assert.equal(h.raw('users/buyer').gold, 100_000 - 10_000 - 8000);
  const cars = Object.values(h.db._dump('vehicles/')).filter((v) => v.ownerId === 'buyer');
  assert.equal(cars.length, 1);
  assert.equal(cars[0].lifeDays, 20);
  assert.equal(cars[0].repairsUsed, 0);
  assert.equal(h.raw('users/buyer/inventory/yasakliMadde').quantity, 4);
  assert.equal(h.raw(`gangWorlds/${liveWorldId}/gangs/${gangId}/private/state`).kasa, 18_000);
  assert.equal(Object.keys(h.db._dump('marketplaceListings/')).length, 0);
});

test('çete dağılınca açık ilanları kapanır', async () => {
  const h = await createHarness();
  const G = await gangWithStock(h);
  const { listingId } = await h.act(G.baba, 'listDepotItem', { itemKey: 'yasakliMadde', qty: 5, unitPrice: 1500 });
  await h.act(G.ids[0], 'leaveGang');
  await h.act(G.baba, 'leaveGang');
  await h.internal.clock.runClock('test');
  assert.equal(h.get(`market/${listingId}`).status, 'cancelled');
});
