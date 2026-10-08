// v77 — Ev → İşletme dönüşümü (functions/houses.js biz op'ları + business.js) testleri.
// Çalıştır: node --test functions/scripts/business.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { BIZ_TYPES, bizMinCost, checkBizRequirements, futbolDayKey, midnightDayKey, prevDayKey, bizMissing } from '../businessCatalogData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: Date.UTC(2026, 9, 7, 9) }; // 12:00 İstanbul
  const houses = createHouses({
    db, FieldValue, HttpsError,
    requireAuth: (r) => r.auth.uid,
    onCall: (fn) => fn,
    isAdmin: () => false,
    assertCanSpeak: async () => {},
    isFriend: async () => false,
    now: () => clock.now,
  });
  const business = createBusiness({ db, FieldValue, now: () => clock.now });
  S('users/zengin', { displayName: 'Zengin', gold: 3_000_000, emerald: 100 });
  S('users/ali', { displayName: 'Ali', gold: 50_000 });
  const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const fresh = () => new Timestamp(clock.now);
  return { db, S, G, clock, act, fresh, business };
}

let seq = 0;
const it = (k, extra = {}) => ({ i: `x${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1, ...extra });
const GYM = () => [it('bag'), it('bag'), it('treadmill'), it('treadmill'), it('bench'), it('bench'), it('dumbbells')];

async function gymHouse(h, items = GYM()) {
  const r = await h.act('zengin', { op: 'buy', bizIntent: 'spor' });
  const house = h.G(`houses/${r.houseId}`);
  h.S(`houses/${r.houseId}`, { ...house, items });
  return r.houseId;
}
const designOf = (h, id) => {
  const d = h.G(`houses/${id}`);
  return { items: d.items, wall: d.wall, floor: d.floor };
};

test('katalog: prompttaki en düşük maliyetler ve şart kontrolü', () => {
  const sum = (t) => {
    const c = bizMinCost(t);
    return [c.gem, c.gold];
  };
  assert.deepEqual(sum('spor'), [12, 45_000]);
  assert.deepEqual(sum('cafe'), [3, 155_000]);
  assert.deepEqual(sum('modifiye'), [10, 90_000]);
  assert.deepEqual(sum('internet'), [6, 120_000]);
  assert.deepEqual(sum('silahci'), [15, 100_000]);
  assert.deepEqual(sum('galeri'), [12, 105_000]);
  // bar: disko topu (3💎) gitardan (50.000) ucuz sayılır
  assert.deepEqual(sum('bar'), [9, 89_000]);
  assert.equal(Object.keys(BIZ_TYPES).length, 7);
  // deneme (p yok) eşya sayılmaz; aynı eşya iki şartı karşılamaz
  const items = GYM();
  assert.equal(checkBizRequirements('spor', items).ok, true);
  items[0] = { ...items[0], p: undefined };
  assert.equal(checkBizRequirements('spor', items).ok, false);
  // pahalı alternatif de şartı sağlar; motor araba sayılmaz
  assert.equal(checkBizRequirements('modifiye', [it('toolwall'), it('workbench'), it('toolchest'), it('car_super')]).ok, true);
  assert.equal(checkBizRequirements('modifiye', [it('toolwall'), it('workbench'), it('toolchest'), it('moto_cross')]).ok, false);
});

test('gün anahtarları: spor 19:00, diğerleri 00:00 sınırlı', () => {
  const at = (h, m = 0) => Date.UTC(2026, 9, 7, h - 3, m);
  assert.equal(futbolDayKey(at(18, 59)), '2026-10-06');
  assert.equal(futbolDayKey(at(19, 0)), '2026-10-07');
  assert.equal(midnightDayKey(at(0, 1)), '2026-10-07');
  assert.equal(prevDayKey('2026-10-01'), '2026-09-30');
});

test('işletme aç: şartlar, tek işletme, herkese açık zorunlu, bizIntent adı', async () => {
  const h = setup();
  const id = await gymHouse(h, GYM().slice(1));
  const house = h.G(`houses/${id}`);
  assert.equal(house.bizIntent, 'spor');
  assert.match(house.name, /Spor Salonu/);
  assert.equal(house.biz, null);
  await assert.rejects(h.act('zengin', { op: 'bizOpen', houseId: id, type: 'spor' }), /biz-required/);
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: GYM(), privacy: 'private' });
  await assert.rejects(h.act('ali', { op: 'bizOpen', houseId: id, type: 'spor' }), /senin değil/);
  await h.act('zengin', { op: 'bizOpen', houseId: id, type: 'spor' });
  const opened = h.G(`houses/${id}`);
  assert.equal(opened.biz.type, 'spor');
  assert.equal(opened.bizType, 'spor');
  assert.equal(opened.bizIntent, null);
  assert.equal(opened.privacy, 'public');
  assert.equal(h.G(`businessInventories/${id}`).type, 'spor');
  // ikinci işletme açılamaz (şart sağlansa bile)
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [...GYM(), it('checkout'), it('cafecounter'), it('cafetable'), it('cafetable'), it('menuboard')] });
  await assert.rejects(h.act('zengin', { op: 'bizOpen', houseId: id, type: 'cafe' }), /tek işletme/);
  // gizliye çekilemez; gizli bir eve işletme olunca herkes girebilir
  await assert.rejects(h.act('zengin', { op: 'settings', houseId: id, privacy: 'private' }), /herkese açık/);
  assert.equal((await h.act('ali', { op: 'enter', houseId: id })).status, 'ok');
});

test('mobilya kaldırma: onaysız reddedilir, onaylıysa işletme kapanır ve envanter sahibine döner; taşımak serbest', async () => {
  const h = setup();
  const id = await gymHouse(h);
  await h.act('zengin', { op: 'bizOpen', houseId: id, type: 'spor' });
  h.S(`businessInventories/${id}`, { ...h.G(`businessInventories/${id}`), materials: { tamirMalzemesi: 30 } });
  // taşımak: işletme açık kalır
  const moved = designOf(h, id);
  moved.items = moved.items.map((x) => ({ ...x, x: 2 }));
  await h.act('zengin', { op: 'save', houseId: id, design: moved });
  assert.equal(h.G(`houses/${id}`).biz.type, 'spor');
  // gerekli eşyayı envantere kaldırmak
  const removed = designOf(h, id);
  const dumb = removed.items.find((x) => x.k === 'dumbbells');
  removed.items = removed.items.filter((x) => x !== dumb);
  await assert.rejects(h.act('zengin', { op: 'save', houseId: id, design: removed }), /biz-required/);
  assert.equal(h.G(`houses/${id}`).items.length, 7, 'reddedilince tasarım değişmez');
  const r = await h.act('zengin', { op: 'save', houseId: id, design: removed, allowBizClose: true });
  assert.equal(r.bizClosed.type, 'spor');
  assert.deepEqual(r.bizClosed.returned.materials, { tamirMalzemesi: 30 });
  const closed = h.G(`houses/${id}`);
  assert.equal(closed.biz, null);
  assert.equal(closed.bizType, null);
  assert.equal(h.G('users/zengin/inventory/tamirMalzemesi').quantity, 30);
  assert.deepEqual(h.G(`businessInventories/${id}`).materials, {});
  assert.equal(h.G('houseInventories/zengin').items.dumbbells, 1);
  // geri koyunca anında yeniden açılabilir
  const back = designOf(h, id);
  back.items = [...back.items, { ...dumb }];
  await h.act('zengin', { op: 'save', houseId: id, design: back });
  await h.act('zengin', { op: 'bizOpen', houseId: id, type: 'spor' });
  assert.equal(h.G(`houses/${id}`).biz.type, 'spor');
});

test('kilit: içeride müşteri ya da ödenmiş/bitmemiş hizmet varken gerekli mobilya kaldırılamaz', async () => {
  const h = setup();
  const id = await gymHouse(h);
  await h.act('zengin', { op: 'bizOpen', houseId: id, type: 'spor' });
  await h.act('ali', { op: 'enter', houseId: id });
  h.S('housePresence/ali', { ...h.G('housePresence/ali'), updatedAt: h.fresh() });
  const removed = designOf(h, id);
  removed.items = removed.items.filter((x) => x.k !== 'dumbbells');
  await assert.rejects(h.act('zengin', { op: 'save', houseId: id, design: removed, allowBizClose: true }), /biz-locked:1:0/);
  await assert.rejects(h.act('zengin', { op: 'bizClose', houseId: id }), /biz-locked/);
  // müşteri içerideyken TAŞIMAK serbest
  const moved = designOf(h, id);
  moved.items = moved.items.map((x) => ({ ...x, z: 1 }));
  await h.act('zengin', { op: 'save', houseId: id, design: moved });
  // eski (2 dk'dan eski) konum kaydı müşteri sayılmaz
  h.clock.now += 3 * 60 * 1000;
  // ödenmiş hizmet kilidi (Faz 4/3 bu alanı yazar)
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), bizLockUntilMs: h.clock.now + 60_000 });
  const st = await h.act('zengin', { op: 'bizStatus', houseId: id });
  assert.equal(st.lock.locked, true);
  assert.equal(st.lock.people, 0);
  await assert.rejects(h.act('zengin', { op: 'save', houseId: id, design: removed, allowBizClose: true }), /biz-locked:0:/);
  h.clock.now += 61_000;
  const r = await h.act('zengin', { op: 'save', houseId: id, design: removed, allowBizClose: true });
  assert.equal(r.bizClosed.type, 'spor');
});

test('satın alma (checkout) sırasında gerekli eşya kaldırılırsa da aynı kural; elle kapatma', async () => {
  const h = setup();
  const id = await gymHouse(h);
  await h.act('zengin', { op: 'bizOpen', houseId: id, type: 'spor' });
  const d = designOf(h, id);
  d.items = [...d.items.filter((x) => x.k !== 'bag'), { i: 'tr1', k: 'plants', x: 0, z: 0, r: 0, c: 0 }];
  await assert.rejects(h.act('zengin', { op: 'checkout', houseId: id, design: d, expect: { gold: 2000, gem: 0 } }), /biz-required/);
  const r = await h.act('zengin', { op: 'checkout', houseId: id, design: d, expect: { gold: 2000, gem: 0 }, allowBizClose: true });
  assert.equal(r.ok, true);
  assert.equal(h.G(`houses/${id}`).biz, null);
  // elle kapatma
  const id2 = await gymHouse(h);
  await h.act('zengin', { op: 'bizOpen', houseId: id2, type: 'spor' });
  const c = await h.act('zengin', { op: 'bizClose', houseId: id2 });
  assert.equal(c.closed, 'spor');
  assert.equal(h.G(`houses/${id2}`).bizType, null);
});

test('günlük rapor + sıralama: kazanca göre, sahibin kendi alışverişi sayılmaz, tutar ev belgesine yazılmaz', async () => {
  const h = setup();
  const ids = [];
  for (let n = 0; n < 3; n++) {
    const id = await gymHouse(h);
    await h.act('zengin', { op: 'bizOpen', houseId: id, type: 'spor' });
    ids.push(id);
  }
  const house = (id) => h.G(`houses/${id}`);
  // 7 Ekim 12:00 → spor (futbol) günü 2026-10-06
  await h.db.runTransaction(async (tx) => {
    h.business.recordIncomeTx(tx, { houseId: ids[1], h: house(ids[1]), amount: 2000, kind: 'service', customerUid: 'ali' });
    h.business.recordIncomeTx(tx, { houseId: ids[1], h: house(ids[1]), amount: 2000, kind: 'service', customerUid: 'veli' });
    h.business.recordIncomeTx(tx, { houseId: ids[2], h: house(ids[2]), amount: 1500, kind: 'service', customerUid: 'ali' });
    h.business.recordIncomeTx(tx, { houseId: ids[0], h: house(ids[0]), amount: 99_999, kind: 'service', customerUid: 'zengin' });
  });
  const rep = h.G(`businessDaily/${ids[1]}_2026-10-06`);
  assert.equal(rep.revenue, 4000);
  assert.equal(rep.byKind.service, 4000);
  assert.deepEqual(Object.keys(rep.cust).sort(), ['ali', 'veli']);
  assert.equal(h.G(`businessDaily/${ids[0]}_2026-10-06`), undefined, 'sahibin alışverişi yazılmaz');
  // henüz gün kapanmadı (spor günü 7 Ekim 19:00'da biter) → sıra yazılmaz
  assert.deepEqual(await h.business.rollover(['spor']), [{ type: 'spor', dayKey: '2026-10-05', count: 3 }]);
  h.clock.now = Date.UTC(2026, 9, 7, 16, 5); // 19:05 İstanbul
  const done = await h.business.rollover(['spor']);
  assert.deepEqual(done, [{ type: 'spor', dayKey: '2026-10-06', count: 3 }]);
  assert.equal(house(ids[1]).bizRank, 1);
  assert.equal(house(ids[2]).bizRank, 2);
  assert.equal(house(ids[0]).bizRank, 3);
  assert.equal(h.G('gameVenues/spor').bizRank, 4, 'oyunun salonu da sırada (eşitlikte oyuncudan sonra)');
  assert.equal(house(ids[1]).revenue, undefined);
  assert.equal(h.G(`businessDaily/${ids[1]}_2026-10-06`).customers, 2);
  assert.equal(h.G('businessRollups/spor_2026-10-06').topRevenue, 4000);
  // aynı gün ikinci kez çalışmaz
  assert.deepEqual(await h.business.rollover(['spor']), []);
});

test('hepsini al: eksik mobilyalar envantere, evini işletmeye hazırla', async () => {
  const h = setup();
  h.S('houseInventories/zengin', { items: { bag: 1 } });
  const m = bizMissing('spor', [], { bag: 1 });
  assert.deepEqual(m.place, { bag: 1 });
  assert.deepEqual(m.buy, { bag: 1, treadmill: 2, bench: 2, dumbbells: 1 });
  await assert.rejects(h.act('zengin', { op: 'buyItems', items: m.buy, expect: { gold: 1, gem: 0 } }), /Sepet tutarı/);
  const g0 = h.G('users/zengin');
  const r = await h.act('zengin', { op: 'buyItems', items: m.buy, expect: { gold: m.gold, gem: m.gem } });
  assert.equal(r.gold, m.gold);
  assert.equal(h.G('users/zengin').gold, g0.gold - m.gold);
  assert.equal(h.G('users/zengin').emerald, g0.emerald - m.gem);
  assert.deepEqual(h.G('houseInventories/zengin').items, { bag: 2, treadmill: 2, bench: 2, dumbbells: 1 });
  assert.equal(bizMissing('spor', [], h.G('houseInventories/zengin').items).gold, 0);
  await assert.rejects(h.act('ali', { op: 'buyItems', items: { bench: 1 }, expect: { gold: 0, gem: 1 } }), /gem/);
  // mevcut evi işletmeye hazırla
  const { houseId } = await h.act('zengin', { op: 'buy' });
  await h.act('zengin', { op: 'bizIntent', houseId, type: 'spor' });
  assert.equal(h.G(`houses/${houseId}`).bizIntent, 'spor');
  await assert.rejects(h.act('ali', { op: 'bizIntent', houseId, type: 'cafe' }));
});

test('satış SMS: işletme başına tek mesaj; okunmamışken yığılmaz, okunduktan sonra tekrar okunmamış olur', async () => {
  const h = setup();
  const houseId = 'dukkan1';
  const house = { ownerUid: 'zengin', name: 'Demir Silah', biz: { type: 'silahci' } };
  const sell = (uid, amount) => h.db.runTransaction(async (tx) => h.business.recordIncomeTx(tx, { houseId, h: house, amount, kind: 'labor', customerUid: uid }));
  const msgs = () => [...h.db._store.keys()].filter((k) => k.startsWith('users/zengin/messages/'));
  await sell('ali', 500);
  assert.equal(msgs().length, 1);
  const p = msgs()[0];
  assert.match(h.G(p).text, /Demir Silah işletmende yeni satışlar var/);
  assert.equal(h.G(p).read, false);
  await sell('ali', 300);
  assert.equal(msgs().length, 1, 'okunmamışken yeni SMS yok');
  h.S(p, { ...h.G(p), read: true });
  await sell('ali', 200);
  assert.equal(msgs().length, 1);
  assert.equal(h.G(p).read, false, 'okunduktan sonraki satış yine bildirir');
  // sahibin kendi alışverişi ve oyunun dükkânı SMS üretmez
  h.db._store.delete(p);
  await sell('zengin', 100);
  assert.equal(msgs().length, 0);
});
