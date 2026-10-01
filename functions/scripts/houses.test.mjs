// functions/houses.js (v66 3D Ev) için çevrimdışı test.
// Çalıştır: node --test functions/scripts/houses.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { HOUSE_PRICE, ITEM_PRICES } from '../houseCatalogData.js';

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
  const keys = (prefix) => [...db._store.keys()].filter((k) => k.startsWith(prefix));
  const clock = { now: Date.UTC(2026, 9, 1, 12) };
  const friends = new Set(['zengin>ali', 'ali>zengin']);
  const houses = createHouses({
    db, FieldValue, HttpsError,
    requireAuth: (r) => r.auth.uid,
    onCall: (fn) => fn,
    isAdmin: (uid) => uid === 'boss',
    assertCanSpeak: async () => {},
    isFriend: async (a, b) => friends.has(`${a}>${b}`),
    now: () => clock.now,
  });
  S('users/zengin', { displayName: 'Zengin', gold: 3_000_000, emerald: 20, avatar: { skin: '#fff' } });
  S('users/ali', { displayName: 'Ali', gold: 1000 });
  S('users/veli', { displayName: 'Veli', gold: 1000 });
  const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const fresh = () => new Timestamp(clock.now);
  return { db, S, G, keys, clock, act, fresh, houses };
}
async function withHouse(h) {
  const r = await h.act('zengin', { op: 'buy' });
  return r.houseId;
}
const it = (i, k, extra = {}) => ({ i, k, x: 0, z: 0, r: 0, c: 0, ...extra });

test('ev satın alma: 1M altın düşer, boş ev oluşur; parası yetmeyen alamaz', async () => {
  const h = setup();
  const id = await withHouse(h);
  const house = h.G(`houses/${id}`);
  assert.equal(h.G('users/zengin').gold, 3_000_000 - HOUSE_PRICE);
  assert.equal(house.ownerUid, 'zengin');
  assert.equal(house.name, "Zengin'in Evi");
  assert.equal(house.privacy, 'public');
  assert.deepEqual(house.items, []);
  await assert.rejects(h.act('ali', { op: 'buy' }), /Yetersiz altın/);
  await h.act('zengin', { op: 'buy', name: 'Kafe Neon' });
  assert.equal(h.G('users/zengin').gold, 3_000_000 - 2 * HOUSE_PRICE);
});

test('giriş kuralları: herkese açık / arkadaşlar / gizli / atılan / davetli / içerideyken gizliye çekilen', async () => {
  const h = setup();
  const id = await withHouse(h);
  assert.equal((await h.act('veli', { op: 'enter', houseId: id })).status, 'ok');
  await h.act('zengin', { op: 'settings', houseId: id, privacy: 'friends' });
  h.db._store.delete('housePresence/veli');
  await assert.rejects(h.act('veli', { op: 'enter', houseId: id }), /arkadaşlarına/);
  assert.equal((await h.act('ali', { op: 'enter', houseId: id })).status, 'ok');
  await h.act('zengin', { op: 'settings', houseId: id, privacy: 'private' });
  // ali zaten içeride → atılmaz (yeniden bağlanabilir)
  h.S('housePresence/ali', { ...h.G('housePresence/ali'), updatedAt: h.fresh() });
  assert.equal((await h.act('ali', { op: 'enter', houseId: id })).status, 'ok');
  await assert.rejects(h.act('veli', { op: 'enter', houseId: id }), /gizli/);
  // davet: gizli olsa da girer (sadece arkadaş davet edilebilir)
  await assert.rejects(h.act('zengin', { op: 'invite', houseId: id, uid: 'veli' }), /arkadaşlarını/);
  await h.act('zengin', { op: 'invite', houseId: id, uid: 'ali' });
  const sms = h.keys('users/ali/messages/').map((k) => h.G(k));
  assert.equal(sms.length, 1);
  assert.match(sms[0].text, /davet/);
  // at: 15 dk giremez, presence silinir
  await h.act('zengin', { op: 'kick', houseId: id, uid: 'ali' });
  assert.equal(h.G('housePresence/ali'), undefined);
  await assert.rejects(h.act('ali', { op: 'enter', houseId: id }), /çıkarıldın/);
  h.clock.now += 16 * 60 * 1000;
  await h.act('zengin', { op: 'settings', houseId: id, privacy: 'public' });
  assert.equal((await h.act('ali', { op: 'enter', houseId: id })).status, 'ok');
});

test('sepet: deneme eşyalar görünür ama satın alınınca sahip olunur; para yetmezse hiçbir şey alınmaz', async () => {
  const h = setup();
  const id = await withHouse(h);
  const design = { items: [it('a1', 'sofa3'), it('a2', 'fridge'), it('a3', 'chairw')], wall: 'tugla', floor: 'parke_mese' };
  // kaydet: deneme eşyalar kaydedilir; sahip olunmayan duvar uygulanmaz
  const s = await h.act('zengin', { op: 'save', houseId: id, design });
  assert.equal(s.wall, 'boya_beyaz');
  assert.equal(h.G(`houses/${id}`).items.length, 3);
  const q = await h.act('zengin', { op: 'quote', houseId: id, design });
  assert.equal(q.gold, ITEM_PRICES.sofa3.v + ITEM_PRICES.chairw.v);
  assert.equal(q.gem, ITEM_PRICES.fridge.v + 5);
  await assert.rejects(h.act('zengin', { op: 'checkout', houseId: id, design, expect: { gold: 1, gem: 1 } }), /değişti/);
  h.S('users/zengin', { ...h.G('users/zengin'), emerald: 3 });
  await assert.rejects(h.act('zengin', { op: 'checkout', houseId: id, design, expect: { gold: q.gold, gem: q.gem } }), /Yetersiz zümrüt/);
  assert.equal(h.G('users/zengin').gold, 3_000_000 - HOUSE_PRICE, 'hiçbir şey düşmedi');
  h.S('users/zengin', { ...h.G('users/zengin'), emerald: 20 });
  const c = await h.act('zengin', { op: 'checkout', houseId: id, design, expect: { gold: q.gold, gem: q.gem } });
  assert.equal(c.count, 4);
  assert.equal(h.G('users/zengin').gold, 3_000_000 - HOUSE_PRICE - q.gold);
  assert.equal(h.G('users/zengin').emerald, 20 - q.gem);
  const house = h.G(`houses/${id}`);
  assert.ok(house.items.every((x) => x.p === 1));
  assert.equal(house.wall, 'tugla');
  assert.deepEqual(h.G('houseInventories/zengin').walls, ['tugla']);
});

test('envanter: satın alınan eşya kaldırılınca envantere döner, başka eve konunca düşer; olmayan eşya konamaz', async () => {
  const h = setup();
  const id = await withHouse(h);
  const id2 = (await h.act('zengin', { op: 'buy', name: 'Garaj' })).houseId;
  const d1 = { items: [it('a1', 'sofa3')], wall: 'boya_beyaz', floor: 'parke_mese' };
  const q = await h.act('zengin', { op: 'quote', houseId: id, design: d1 });
  await h.act('zengin', { op: 'checkout', houseId: id, design: d1, expect: q });
  // odadan kaldır → envanter
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [] } });
  assert.equal(h.G('houseInventories/zengin').items.sofa3, 1);
  // hile denemesi: 2 adet "sahip olunan" koltuk koy
  await assert.rejects(
    h.act('zengin', { op: 'save', houseId: id2, design: { items: [it('b1', 'sofa3', { p: 1 }), it('b2', 'sofa3', { p: 1 })] } }),
    /Envanterinde/
  );
  await h.act('zengin', { op: 'save', houseId: id2, design: { items: [it('b1', 'sofa3', { p: 1, c: 5 })] } });
  assert.equal(h.G('houseInventories/zengin').items.sofa3, undefined);
  assert.equal(h.G(`houses/${id2}`).items[0].c, 5, 'renk sonradan değişebilir');
  // satın alınmış eşyayı taşıma/boyama envanteri değiştirmez
  await h.act('zengin', { op: 'save', houseId: id2, design: { items: [it('b1', 'sofa3', { p: 1, x: 2, c: 1 })] } });
  assert.equal(h.G(`houses/${id2}`).items[0].x, 2);
  await assert.rejects(h.act('ali', { op: 'save', houseId: id2, design: { items: [] } }), /senin değil/);
});

test('sohbet, ürün alma, müzik: sadece evdekiler; deneme eşyadan ürün alınamaz', async () => {
  const h = setup();
  const id = await withHouse(h);
  const design = { items: [it('f1', 'fridge'), it('j1', 'jukebox'), it('t1', 'tdining')] };
  await h.act('zengin', { op: 'save', houseId: id, design });
  await h.act('ali', { op: 'enter', houseId: id });
  h.S('housePresence/ali', { ...h.G('housePresence/ali'), updatedAt: h.fresh() });
  await assert.rejects(h.act('ali', { op: 'take', houseId: id, itemId: 'f1', product: 'kola' }), /deneme/);
  const q = await h.act('zengin', { op: 'quote', houseId: id, design });
  await h.act('zengin', { op: 'checkout', houseId: id, design, expect: q });
  await assert.rejects(h.act('ali', { op: 'take', houseId: id, itemId: 'f1', product: 'viski' }), /alınamaz/);
  const t = await h.act('ali', { op: 'take', houseId: id, itemId: 'f1', product: 'kola' });
  assert.equal(t.label, 'Kola');
  assert.equal(h.G('heldItems/ali').venue, 'ev');
  assert.equal(h.G('housePresence/ali').holding, 'kola');
  await h.act('ali', { op: 'music', houseId: id, itemId: 'j1', track: 2 });
  assert.equal(h.G(`houses/${id}`).music.track, 2);
  await h.act('ali', { op: 'music', houseId: id, itemId: 'j1', track: null });
  assert.equal(h.G(`houses/${id}`).music, null);
  await h.act('ali', { op: 'chat', houseId: id, text: '  selam  ' });
  assert.equal(h.keys(`houses/${id}/chat/`).length, 1);
  await assert.rejects(h.act('veli', { op: 'chat', houseId: id, text: 'x' }), /evde değilsin/);
  await assert.rejects(h.act('veli', { op: 'take', houseId: id, itemId: 't1', product: 'meyve' }), /evde değilsin/);
});

test('ayarlar: isim doğrulama', async () => {
  const h = setup();
  const id = await withHouse(h);
  await assert.rejects(h.act('zengin', { op: 'settings', houseId: id, name: 'ab' }), /3-30/);
  await assert.rejects(h.act('zengin', { op: 'settings', houseId: id, privacy: 'herkes' }), /Geçersiz/);
  const r = await h.act('zengin', { op: 'settings', houseId: id, name: 'Neon Kafe & Bar' });
  assert.equal(r.name, 'Neon Kafe & Bar');
  await assert.rejects(h.act('ali', { op: 'settings', houseId: id, name: 'Benim' }), /senin değil/);
});

test('v71: L koltuk (büyük harfli anahtar) sepette atılmaz, fiyatı doğru; mobilya alışverişinde SMS gelmez', async () => {
  const h = setup();
  const id = await withHouse(h);
  const before = h.keys('users/zengin/messages/').length;
  const design = { items: [it('l1', 'sofaL')], wall: null, floor: null };
  const q = await h.act('zengin', { op: 'quote', houseId: id, design });
  assert.equal(q.gold, ITEM_PRICES.sofaL.v);
  const c = await h.act('zengin', { op: 'checkout', houseId: id, design, expect: { gold: ITEM_PRICES.sofaL.v, gem: 0 } });
  assert.equal(c.count, 1);
  assert.equal(h.G(`houses/${id}`).items[0].k, 'sofaL');
  assert.equal(h.G(`houses/${id}`).items[0].p, 1);
  assert.equal(h.keys('users/zengin/messages/').length, before, 'SMS yok');
});

test('v71: ev fotoğrafı en/boy oranını ve çekim anındaki mesaj balonlarını dondurur', async () => {
  const h = setup();
  const id = await withHouse(h);
  await h.act('zengin', { op: 'enter', houseId: id });
  await h.act('zengin', { op: 'chat', houseId: id, text: 'eski mesaj' });
  h.clock.now += 20_000;
  await h.act('zengin', { op: 'chat', houseId: id, text: 'selam millet' });
  h.clock.now += 3000;
  const cam = { px: 0, py: 2, pz: 5, dx: 0, dy: -0.2, dz: -1, fov: 58, a: 0.5, cw: 390 };
  const att = await h.houses.buildPhotoAttachment('zengin', { houseId: id, cam, shotAgoMs: 1000 });
  assert.equal(att.cam.a, 0.5);
  assert.equal(att.cam.cw, 390);
  const me = att.people.find((p) => p.uid === 'zengin');
  assert.deepEqual(me.says, ['selam millet']);
  // eski istemci: oran yok → kare; balon yok
  const old = await h.houses.buildPhotoAttachment('zengin', { houseId: id, cam: { ...cam, a: undefined, cw: undefined } });
  assert.equal(old.cam.a, 1);
  assert.equal(old.people.find((p) => p.uid === 'zengin').says, undefined);
  // uç değerler sınırlanır
  const ext = await h.houses.buildPhotoAttachment('zengin', { houseId: id, cam: { ...cam, a: 99 }, shotAgoMs: 1e12 });
  assert.equal(ext.cam.a, 2.5);
});
