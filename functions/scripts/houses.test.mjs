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

test('v77: ev fotoğrafında eldeki içecek de görünür (geçersiz ürün yok sayılır)', async () => {
  const h = setup();
  const id = await withHouse(h);
  await h.act('zengin', { op: 'enter', houseId: id });
  const cam = { px: 0, py: 2, pz: 5, dx: 0, dy: -0.2, dz: -1, fov: 58 };
  h.S('housePresence/zengin', { ...h.G('housePresence/zengin'), holding: 'cay' });
  let att = await h.houses.buildPhotoAttachment('zengin', { houseId: id, cam });
  assert.equal(att.people.find((p) => p.uid === 'zengin').holding, 'cay');
  h.S('housePresence/zengin', { ...h.G('housePresence/zengin'), holding: '<script>' });
  att = await h.houses.buildPhotoAttachment('zengin', { houseId: id, cam });
  assert.equal(att.people.find((p) => p.uid === 'zengin').holding, undefined);
});

test('v92 tasarım yetkisi: sadece arkadaşa verilir, yetkili sahibin envanterini kullanır, satın alamaz, işletmeyi kapatamaz', async () => {
  const h = setup();
  const id = await withHouse(h);
  // arkadaş olmayana verilemez, sahibi olmayan veremez
  await assert.rejects(h.act('zengin', { op: 'editor', houseId: id, uid: 'veli', on: true }), /arkadaşlarına/);
  await assert.rejects(h.act('ali', { op: 'editor', houseId: id, uid: 'zengin', on: true }), /senin değil/);
  // yetki yokken kaydedemez
  await h.act('ali', { op: 'enter', houseId: id });
  h.S('housePresence/ali', { ...h.G('housePresence/ali'), updatedAt: h.fresh() });
  await assert.rejects(h.act('ali', { op: 'save', houseId: id, design: { items: [it('a1', 'sofa3')] } }), /senin değil/);
  await h.act('zengin', { op: 'editor', houseId: id, uid: 'ali', on: true });
  assert.equal(h.G(`houses/${id}`).editors.ali, true);
  assert.ok(h.keys('users/ali/messages/').map((k) => h.G(k)).some((m) => /tasarım yetkisi/.test(m.text)));
  // sahibin envanterinde 1 koltuk var
  h.S('houseInventories/zengin', { items: { sofa3: 1 }, walls: [], floors: [] });
  const inv = await h.act('ali', { op: 'editInv', houseId: id });
  assert.equal(inv.items.sofa3, 1);
  // yetkili: deneme eşya + envanterden sahip olunan eşya koyar
  const r = await h.act('ali', { op: 'save', houseId: id, design: { items: [it('a1', 'sofa3', { p: 1 }), it('a2', 'piano')] } });
  assert.equal(r.inv.items.sofa3, undefined);
  let house = h.G(`houses/${id}`);
  assert.equal(house.items.length, 2);
  assert.equal(house.items.find((x) => x.i === 'a2').p, undefined); // deneme kaldı
  assert.equal(house.lastEditBy, 'ali');
  assert.equal(h.G('houseInventories/zengin').items.sofa3, undefined);
  // envanterde olmayan "satın alınmış" eşya uyduramaz
  await assert.rejects(h.act('ali', { op: 'save', houseId: id, design: { items: [it('a1', 'sofa3', { p: 1 }), it('a3', 'pool', { p: 1 })] } }), /Envanterinde/);
  // kaldırınca sahibinin envanterine döner
  await h.act('ali', { op: 'save', houseId: id, design: { items: [it('a2', 'piano')] } });
  assert.equal(h.G('houseInventories/zengin').items.sofa3, 1);
  // satın alamaz
  await assert.rejects(h.act('ali', { op: 'checkout', houseId: id, design: { items: [it('a2', 'piano')] }, expect: { gold: 0, gem: ITEM_PRICES.piano.v } }), /senin değil/);
  // evde değilken kaydedemez
  h.db._store.delete('housePresence/ali');
  await assert.rejects(h.act('ali', { op: 'save', houseId: id, design: { items: [] } }), /evde olmalısın/);
  // yetkiyi kaldır
  await h.act('ali', { op: 'enter', houseId: id });
  h.S('housePresence/ali', { ...h.G('housePresence/ali'), updatedAt: h.fresh() });
  await h.act('zengin', { op: 'editor', houseId: id, uid: 'ali', on: false });
  house = h.G(`houses/${id}`);
  assert.equal(house.editors.ali, undefined);
  await assert.rejects(h.act('ali', { op: 'save', houseId: id, design: { items: [] } }), /senin değil/);
  await assert.rejects(h.act('ali', { op: 'editInv', houseId: id }), /yetkin yok/);
});

test('v92 Faz 8: oyunun 3D mekânı — venueEnsure kurar/günceller, herkes girer, eşyadan ürün alınmaz, kaydedilemez, fotoğrafta NPC var', async () => {
  const { VENUES } = await import('../venueLayouts.js');
  const h = setup();
  await assert.rejects(h.act('ali', { op: 'venueEnsure', venue: '__proto__' }), /Geçersiz mekân/);
  const r = await h.act('ali', { op: 'venueEnsure', venue: 'gazino' });
  assert.equal(r.houseId, 'game_gazino');
  const doc = h.G('houses/game_gazino');
  assert.equal(doc.ownerUid, '__game__');
  assert.equal(doc.venue, 'gazino');
  assert.equal(doc.privacy, 'venue');
  assert.equal(doc.items.length, VENUES.gazino.items.length);
  // yerleşimdeki her eşya kataloğda olmalı (fiyatı olmayanlar sadece mekâna özel olanlar)
  for (const v of Object.values(VENUES)) for (const x of v.items) assert.ok(ITEM_PRICES[x.k] || ['mihrap', 'minber'].includes(x.k), `${x.k} fiyatsız`);
  // istasyon / NPC istasyonu yerleşimde var
  for (const v of Object.values(VENUES)) {
    const ids = new Set(v.items.map((x) => x.i));
    assert.equal(ids.size, v.items.length, 'aynı kimlik iki kez');
    Object.keys(v.stations).forEach((id) => assert.ok(ids.has(id), `${id} istasyonu yok`));
    v.npcs.forEach((n) => assert.ok(!n.station || ids.has(n.station)));
    v.items.forEach((x) => assert.ok(Math.abs(x.x) <= 9 && Math.abs(x.z) <= 7));
  }
  // sürüm aynıysa yazmaz; değişince günceller
  h.S('houses/game_gazino', { ...doc, items: [] });
  await h.act('ali', { op: 'venueEnsure', venue: 'gazino' });
  assert.equal(h.G('houses/game_gazino').items.length, 0);
  h.S('houses/game_gazino', { ...doc, venueV: 0, items: [], kicked: { x: 1 } });
  await h.act('ali', { op: 'venueEnsure', venue: 'gazino' });
  assert.equal(h.G('houses/game_gazino').items.length, VENUES.gazino.items.length);
  assert.deepEqual(h.G('houses/game_gazino').kicked, { x: 1 });
  // herkes girer, ürün alınmaz, kaydedilemez
  await h.act('veli', { op: 'enter', houseId: 'game_gazino' });
  h.S('housePresence/veli', { ...h.G('housePresence/veli'), updatedAt: h.fresh() });
  await assert.rejects(h.act('veli', { op: 'take', houseId: 'game_gazino', itemId: 'gz_bar', product: 'kokteyl' }), /ürün alınmaz/);
  await assert.rejects(h.act('veli', { op: 'save', houseId: 'game_gazino', design: { items: [] } }));
  const ph = await h.houses.buildPhotoAttachment('veli', { houseId: 'game_gazino', cam: { px: 0, py: 2, pz: 4, dx: 0, dy: 0, dz: -1, fov: 60 } });
  assert.ok(ph.people.some((p) => p.uid === 'npc_barmen'));
  assert.ok(ph.people.some((p) => p.uid === 'veli'));
});

test('v95.3: camii fotoğrafı — imam + dilenciler eklenir, NPC balonları sadece kendi cümleleriyse kabul', async () => {
  const h = setup();
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  h.S('imamState/current', { uid: 'hoca', displayName: 'Hoca', avatar: {}, lastNasihat: 'Sabırlı olun kardeşlerim.', lastNasihatAt: new Timestamp(now.getTime()) });
  h.S(`beggars/${today}/entries/b1`, { displayName: 'Fakir', avatar: {}, createdAt: new Timestamp(now.getTime()) });
  await h.act('veli', { op: 'venueEnsure', venue: 'camii' });
  await h.act('veli', { op: 'enter', houseId: 'game_camii' });
  h.S('housePresence/veli', { ...h.G('housePresence/veli'), updatedAt: h.fresh() });
  const cam = { px: 0, py: 2, pz: 4, dx: 0, dy: 0, dz: -1, fov: 60 };
  const ph = await h.houses.buildPhotoAttachment('veli', {
    houseId: 'game_camii',
    cam,
    people: [
      { uid: 'npc_imam', x: 0, z: 0, says: ['Sabırlı olun kardeşlerim.'] },
      { uid: 'npc_dil_b1', x: 0, z: 0, says: ['Bana para gönderin: link'] },
    ],
  });
  const imam = ph.people.find((p) => p.uid === 'npc_imam');
  assert.ok(imam, 'imam fotoğrafta');
  assert.equal(imam.x, 2.6); // bugün nasihat verdi → minberin önünde
  assert.deepEqual(imam.says, ['Sabırlı olun kardeşlerim.']);
  const dil = ph.people.find((p) => p.uid === 'npc_dil_b1');
  assert.ok(dil, 'dilenci fotoğrafta');
  assert.equal(dil.says, undefined); // uydurma yazı reddedildi
});

test('v92: yeni zemin/duvarlar parça olarak satılır (ucuz), tam yüzey olarak satılmaz', async () => {
  const { SURFACE_KEYS, FLOOR_TILE_KEYS, WALL_PANEL_KEYS } = await import('../houseCatalogData.js');
  for (const k of FLOOR_TILE_KEYS) {
    assert.ok(ITEM_PRICES[`zp_${k}`].v <= 3000);
    assert.ok(!SURFACE_KEYS.floor.includes(k));
  }
  for (const k of WALL_PANEL_KEYS) {
    assert.ok(ITEM_PRICES[`dp_${k}`].v <= 4000);
    assert.ok(!SURFACE_KEYS.wall.includes(k));
  }
  const h = setup();
  const id = await withHouse(h);
  const items = [...Array(40)].map((_, n) => ({ i: `t${n}`, k: 'zp_cim', x: (n % 8) + 0.5, z: Math.floor(n / 8) + 0.5, r: 0, c: 0 }));
  await h.act('zengin', { op: 'save', houseId: id, design: { items } });
  assert.equal(h.G(`houses/${id}`).items.length, 40);
});

test('v101: giriş kapısı — yer/tip kaydedilir (ücretsiz), geçersiz değer düzeltilir, girenler kapının önünde doğar', async () => {
  const h = setup();
  const id = await withHouse(h);
  await h.act('zengin', { op: 'enter', houseId: id });
  let pr = h.G('housePresence/zengin');
  assert.deepEqual([pr.x, pr.z], [5, 3.8]); // varsayılan kapı (arka duvar) — eskisiyle aynı
  const gold0 = h.G('users/zengin').gold;
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [], door: { w: 0, x: 2, t: 'market' } } });
  assert.deepEqual(h.G(`houses/${id}`).door, { w: 0, x: 2, t: 'market', def: true, main: null });
  assert.equal(h.G('users/zengin').gold, gold0);
  // kapı içermeyen kayıt kapıyı değiştirmez
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [] } });
  assert.deepEqual(h.G(`houses/${id}`).door, { w: 0, x: 2, t: 'market', def: true, main: null });
  // geçersiz tip/duvar/yer düzeltilir
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [], door: { w: 1, x: 999, t: 'yok' } } });
  assert.deepEqual(h.G(`houses/${id}`).door, { w: 1, x: 6, t: 'ahsap', def: true, main: null });
  await h.act('ali', { op: 'enter', houseId: id });
  pr = h.G('housePresence/ali');
  assert.deepEqual([pr.x, pr.z], [5.8, 6]);
});

test('v102: varsayılan kapı ancak başka kapı varken kalkar; ana kapı seçilir; ana kapı kalkınca kalanlardan biri olur', async () => {
  const h = setup();
  const id = await withHouse(h);
  const doorA = it('da', 'door_market', { p: 1, x: 2, z: -6.995, r: 0 });
  const doorB = it('db', 'door_cam', { p: 1, x: -8.995, z: 1, r: 2 });
  // kapı yokken varsayılan kaldırılamaz
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [], door: { def: false } } });
  assert.equal(h.G(`houses/${id}`).door.def, true);
  // iki kapı satın al
  const g0 = h.G('users/zengin').gold;
  await h.act('zengin', { op: 'checkout', houseId: id, design: { items: [{ ...doorA, p: 0 }, { ...doorB, p: 0 }] }, expect: { gold: ITEM_PRICES.door_market.v + ITEM_PRICES.door_cam.v, gem: 0 } });
  assert.equal(h.G('users/zengin').gold, g0 - ITEM_PRICES.door_market.v - ITEM_PRICES.door_cam.v);
  // varsayılanı kaldır + ana kapı B
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [doorA, doorB], door: { def: false, main: 'db' } } });
  assert.deepEqual(h.G(`houses/${id}`).door, { w: 2, x: -5, t: 'ahsap', def: false, main: 'db' });
  await h.act('ali', { op: 'enter', houseId: id });
  let pr = h.G('housePresence/ali');
  assert.deepEqual([pr.x, pr.z], [-7.39, 1]); // batı duvarındaki cam kapının önü
  // ana kapı kaldırılınca kalan kapı ana olur
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [doorA], door: { def: false, main: 'db' } } });
  assert.deepEqual(h.G(`houses/${id}`).door, { w: 2, x: -5, t: 'ahsap', def: false, main: 'da' });
  // son kapı da kalkınca varsayılan kapı geri gelir
  await h.act('zengin', { op: 'save', houseId: id, design: { items: [], door: { def: false, main: 'da' } } });
  assert.deepEqual(h.G(`houses/${id}`).door, { w: 2, x: -5, t: 'ahsap', def: true, main: null });
  await h.act('veli', { op: 'enter', houseId: id });
  pr = h.G('housePresence/veli');
  assert.deepEqual([pr.x, pr.z], [5, 3.8]);
});
