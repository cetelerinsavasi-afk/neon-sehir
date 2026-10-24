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

// v124: yasaklı madde artık 2. ele konamaz; çete deposundan "Depoya sat" (functions/depo.js)
test('v124: çete yasaklı maddeyi 2. ele koyamaz; "Depoya sat" (oyunun deposu 1.500): sadece Baba/Sağ Kol, stok, kasa', async () => {
  const h = await createHarness();
  const G = await gangWithStock(h);
  await h.fails(G.baba, 'listDepotItem', { itemKey: 'yasakliMadde', qty: 10, unitPrice: 1500 });
  const k0 = h.state(G.gangId).kasa;
  await h.fails(G.ids[0], 'sellToDepo', { depotId: 'game_depo', qty: 5 }); // Tetikçi değil, çömez
  await h.fails(G.baba, 'sellToDepo', { depotId: 'game_depo', qty: 51 }); // stok yok
  await h.fails(G.baba, 'sellToDepo', { depotId: 'oyuncu_deposu', qty: 1 }); // test dünyasında sadece oyunun deposu
  await h.fails(G.baba, 'sellToDepo', { depotId: 'game_depo', qty: 1, expect: 1600 }); // fiyat değişti
  const r = await h.act(G.baba, 'sellToDepo', { depotId: 'game_depo', qty: 20, expect: 1500 });
  assert.deepEqual({ qty: r.qty, unit: r.unit, total: r.total }, { qty: 20, unit: 1500, total: 30_000 });
  assert.equal(h.state(G.gangId).kasa, k0 + 30_000);
  const d = depotOf(h, G.gangId);
  assert.equal(d.items.yasakliMadde, 30);
  assert.equal(d.usedUnits, 30);
  assert.ok(h.chat(G.gangId).some((m) => /20 yasaklı maddeyi bir depoya sattı/.test(m)));
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
