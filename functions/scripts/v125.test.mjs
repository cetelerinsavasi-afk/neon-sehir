// v125 — küçük güncellemeler: makine %1 vergisi, gazino raporu, v124 geçişi sağlamlığı
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { machineTax, withMachineTax, TAX_SOURCES } from '../tax.js';
import { STATE_IN } from '../stateTreasury.js';
import { createCasino } from '../casino.js';
import { createV124Migrations } from '../v124Migrations.js';
import { goldTag } from '../moneyLog.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

test('makine alımı: fiyat + %5 vergi (v126; devlete ayrı kalem); fabrika kuruluşunda sadece makinelere', () => {
  assert.equal(machineTax(50_000), 2500);
  assert.equal(withMachineTax(50_000), 52_500);
  assert.equal(withMachineTax(123_457), 123_457 + 6173);
  assert.ok(TAX_SOURCES.makine && STATE_IN.vergi_makine);
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /source: 'makine', uid, atMs: Date\.now\(\), ref: 'fabrika_kurulus'/);
  assert.match(src, /increment\(-\(price \+ tax\)\)/);
  assert.match(src, /return \{ base: FACTORY_CREATE_COST \+ machines, tax, total: FACTORY_CREATE_COST \+ machines \+ tax, stat \}/);
  assert.match(src, /const mt = machineTax\(p, t\)/, 'v127: makine türüne göre oran');
  const ui = fs.readFileSync(new URL('../../src/components/FactoryScreen/FactoryScreen.jsx', import.meta.url), 'utf8');
  assert.match(ui, /withMachineTax\(machinePrice\(t, cryptoPrice \|\| 0\), t, rates\)/, 'istemci kuruluş bedeli sunucuyla aynı (v127: belediye oranı)');
});

test('gazino raporu: verilen 0 olan 10 Numara eli makine raporunu boş haritayla EZMEZ', async () => {
  const writes = [];
  const db = new FakeFirestore({ yieldEvery: false });
  const casino = createCasino({ db, FieldValue, HttpsError, splitIncomeForDebt: (d, a) => ({ goldDelta: a, debtDelta: 0 }) });
  const tx = { set: (ref, data, opts) => writes.push({ path: ref.path, data, opts }) };
  casino.resolveWrite(tx, { casinoId: 'g1', casinoOwnerUid: 'p', betAmount: 100 }, { houseBack: 0, paidOut: 0 });
  const daily = writes.filter((w) => w.path.startsWith('businessDaily/'));
  assert.ok(daily.every((w) => !('casino' in w.data)), 'boş casino alanı yazılmadı');
  writes.length = 0;
  casino.resolveWrite(tx, { casinoId: 'g1', casinoOwnerUid: 'p', betAmount: 100 }, { houseBack: 0, paidOut: 300 });
  assert.ok(writes.some((w) => w.path.startsWith('businessDaily/') && w.data.casino?.onnumara?.out));
});

test('v124 geçişi: dağılmış çetenin (depo belgesi yok) ilanı geçişi kilitlemez; tüm adımlar sırayla biter', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  S('users/ali', { gold: 0 });
  S('marketplaceListings/c1', { itemType: 'material', materialType: 'yasakliMadde', quantity: 3, sellerId: 'ali', sold: false });
  S('marketplaceListings/m1', { itemType: 'material', materialType: 'tamirMalzemesi', quantity: 40, sellerId: 'ali', sold: false });
  S('gangWorlds/live/market/x1', { gangId: 'olu', itemKey: 'yasakliMadde', quantity: 5, status: 'open' });
  const mig = createV124Migrations({ db, FieldValue, goldTag, log: () => {} });
  const r = await mig.runAll({ liveWorldId: 'live' });
  assert.equal(r.contraband2el.players, 1);
  assert.equal(r.contraband2el.gangs, 1);
  assert.equal(G('marketplaceListings/c1').cancelled, true);
  assert.equal(G('users/ali/inventory/yasakliMadde').quantity, 3);
  assert.equal(G('marketplaceListings/m1').cancelled, true);
  assert.ok(G('migrations/v124_contraband2el'));
  assert.ok(G('migrations/v124_materialListings'));
  assert.equal(G('gangWorlds/live/market/x1').status, 'cancelled');
  // ikinci çalıştırma: hiçbir şey iki kez iade edilmez
  await mig.runAll({ liveWorldId: 'live' });
  assert.equal(G('users/ali/inventory/yasakliMadde').quantity, 3);
});

test('v124 geçişi: bir adım hata verse de sonraki adımlar çalışır; malzeme alımı iade adımlarında hata varken bekler', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const mig = createV124Migrations({ db, FieldValue, goldTag, log: () => {} });
  const real = db.collection.bind(db);
  db.collection = (p) => {
    if (p === 'limanOrders') throw new Error('limanOrders okunamadı');
    return real(p);
  };
  const r = await mig.runAll({});
  assert.match(r.liman.error, /okunamadı/);
  assert.ok(r.contraband2el && !r.contraband2el.error, 'sonraki adım yine çalıştı');
  assert.ok(r.materialsBuyout && !r.materialsBuyout.waiting);
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /export const runV124MigrationsNow = onRequest/);
});
