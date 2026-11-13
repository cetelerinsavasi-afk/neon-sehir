// v146 — çete karargahı, polis teşkilatı (takma kimlik), evi sat, çete mobilya ilanı
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { HOUSE_PRICE, ITEM_PRICES } from '../houseCatalogData.js';
import { houseKind } from '../officeData.js';

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
  const clock = { now: Date.UTC(2026, 10, 8, 12) };
  const houses = createHouses({
    db, FieldValue, HttpsError,
    requireAuth: (r) => r.auth.uid,
    onCall: (fn) => fn,
    isAdmin: (uid) => uid === 'boss',
    assertCanSpeak: async () => {},
    isFriend: async () => true,
    now: () => clock.now,
  });
  const W = 'gangWorlds/w1';
  S('gangSystem/config', { liveWorldId: 'w1', liveOpen: true });
  // Kurtlar: baba=zengin, üyeler ali, veli · Kartallar: deniz
  S(`${W}/gangs/g1`, { name: 'Kurtlar', status: 'active', babaId: 'zengin', logo: { emoji: '🐺', color: '#fff', bg: '#000' } });
  S(`${W}/gangs/g1/private/state`, { kasa: 1_000_000, gem: 10, distributableLeft: 900_000 });
  S(`${W}/gangs/g2`, { name: 'Kartallar', status: 'active', babaId: 'deniz' });
  S(`${W}/gangs/g2/private/state`, { kasa: 0 });
  for (const [uid, g, rank] of [['zengin', 'g1', 'baba'], ['ali', 'g1', 'comez'], ['veli', 'g1', 'tetikci'], ['deniz', 'g2', 'baba']]) {
    S(`${W}/memberships/${uid}`, { gangId: g });
    S(`${W}/gangs/${g}/members/${uid}`, { rank, name: uid });
    S(`users/${uid}`, { displayName: uid[0].toUpperCase() + uid.slice(1), gold: 2_000_000, emerald: 30, avatar: { skin: '#fff' } });
  }
  S('users/yabanci', { displayName: 'Yabancı', gold: 1000 });
  // polis: ajan (kod adı Kartal-7), yetkili: başkan
  S(`${W}/memberships/ajan`, { intelRosterId: 'r77', intelCodeName: 'Kartal-7' });
  S(`${W}/intelRoster/r77`, { codeName: 'Kartal-7', rank: 'ajan' });
  S('users/ajan', { displayName: 'Gerçek Ad', gold: 10, avatar: { skin: '#000' } });
  S('belediyeStaff/baskan', { seat: 'bsk' });
  S('users/baskan', { displayName: 'Haluk', gold: 10, avatar: { skin: '#123' } });
  const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const fresh = () => new Timestamp(clock.now);
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: fresh(), x: 0, z: 0, left: false });
  return { db, S, G, keys, clock, act, fresh, present, houses, W };
}
const it = (i, k, extra = {}) => ({ i, k, x: 0, z: 0, r: 0, c: 0, ...extra });

test('v146 karargah: üye boş karargahı kurar (çeteye ait), üye olmayan misafir girer (v160), davetli çete girer', async () => {
  const h = setup();
  const r = await h.act('ali', { op: 'hqEnsure' });
  assert.equal(r.houseId, 'hq_g1');
  const doc = h.G('houses/hq_g1');
  assert.equal(doc.ownerUid, 'gang_g1');
  assert.equal(doc.kind, 'karargah');
  assert.deepEqual(doc.items, []);
  assert.equal(houseKind({ ...doc, office: { keys: { cafecounter: true } }, items: [it('a', 'cafecounter', { p: 1 })] }), 'karargah', 'ücretli ürün açılsa da karargah kalır');
  assert.equal((await h.act('veli', { op: 'enter', houseId: 'hq_g1' })).hqRole, 'uye');
  assert.equal((await h.act('zengin', { op: 'enter', houseId: 'hq_g1' })).hqRole, 'baba');
  // v160: karargahlar şehirde — herkes kapıdan misafir olarak girer (yetkisi yok)
  assert.equal((await h.act('yabanci', { op: 'enter', houseId: 'hq_g1' })).hqRole, 'misafir');
  assert.equal((await h.act('deniz', { op: 'enter', houseId: 'hq_g1' })).hqRole, 'misafir');
  // v157.4: davet sistemi kaldırıldı (karargahlar haritada) — yeni davet verilemez
  await assert.rejects(h.act('zengin', { op: 'hqInvite', houseId: 'hq_g1', gangId: 'g2', on: true }), /davetleri kaldırıldı/);
  assert.deepEqual(h.G('houses/hq_g1').hqInvites, []);
  // arkadaş daveti karargahta yok
  await assert.rejects(h.act('zengin', { op: 'invite', houseId: 'hq_g1', uid: 'yabanci' }), /arkadaş daveti/);
});

test('v146 karargah: Baba çete kasasından (altın + zümrüt) mobilya alır; üye alamaz; yetki verilen alır, çıkınca yetki düşer', async () => {
  const h = setup();
  await h.act('zengin', { op: 'hqEnsure' });
  const gemKey = Object.keys(ITEM_PRICES).find((k) => ITEM_PRICES[k].t === 'gem' && ITEM_PRICES[k].v <= 5);
  const goldKey = 'plastikmasa';
  const design = { items: [it('t1', goldKey), it('t2', gemKey)], wall: 'boya_beyaz', floor: 'parke_mese' };
  const expect = { gold: ITEM_PRICES[goldKey].v, gem: ITEM_PRICES[gemKey].v };
  h.present('ali', 'hq_g1');
  await assert.rejects(h.act('ali', { op: 'checkout', houseId: 'hq_g1', design, expect }), /senin değil/);
  h.present('zengin', 'hq_g1');
  const r = await h.act('zengin', { op: 'checkout', houseId: 'hq_g1', design, expect });
  assert.equal(r.gold, expect.gold);
  const st = h.G(`${h.W}/gangs/g1/private/state`);
  assert.equal(st.kasa, 1_000_000 - expect.gold);
  assert.equal(st.gem, 10 - expect.gem);
  assert.equal(h.G('users/zengin').gold, 2_000_000, 'Baba kendi cebinden ödemez');
  assert.equal(h.G('houses/hq_g1').items.every((x) => x.p === 1), true);
  assert.ok(h.keys(`${h.W}/gangs/g1/chat_genel/`).some((k) => /mobilya aldı/.test(h.G(k).text)), 'çete sohbetine harcama duyurusu');
  // yetki
  await assert.rejects(h.act('veli', { op: 'hqYetki', houseId: 'hq_g1', uid: 'ali', on: true }), /Mafya Babası/);
  await h.act('zengin', { op: 'hqYetki', houseId: 'hq_g1', uid: 'ali', on: true });
  assert.equal(h.G(`${h.W}/gangs/g1/members/ali`).hqYetki, true);
  assert.equal((await h.act('ali', { op: 'enter', houseId: 'hq_g1' })).hqRole, 'yetkili');
  const inv = await h.act('ali', { op: 'editInv', houseId: 'hq_g1' });
  assert.equal(inv.fund.gold, 1_000_000 - expect.gold, 'yetkili çete kasasını görür');
  const info = await h.act('ali', { op: 'hqInfo', houseId: 'hq_g1' });
  assert.equal(info.role, 'yetkili');
  assert.ok(info.members.some((m) => m.uid === 'ali' && m.yetki));
  // çeteden çıkınca (üye belgesi silinir) yetki kendiliğinden düşer
  h.db._store.delete(`${h.W}/gangs/g1/members/ali`);
  h.S(`${h.W}/memberships/ali`, {});
  await assert.rejects(h.act('ali', { op: 'editInv', houseId: 'hq_g1' }), /yetkin yok/);
  // karargah işletmeye / satışa çevrilemez
  await assert.rejects(h.act('zengin', { op: 'bizOpen', houseId: 'hq_g1', type: 'cafe' }), /senin değil|Geçersiz/);
  await assert.rejects(h.act('zengin', { op: 'sellHouse', houseId: 'hq_g1', confirm: true }), /senin değil/);
});

test('v146 karargah: dağıtılabilir pay kasadan büyük kalmaz; yetkili kişiyi çıkarır, Baba çıkarılamaz', async () => {
  const h = setup();
  await h.act('zengin', { op: 'hqEnsure' });
  h.S(`${h.W}/gangs/g1/private/state`, { kasa: 100_000, gem: 0, distributableLeft: 90_000 });
  h.present('zengin', 'hq_g1');
  const k = Object.keys(ITEM_PRICES).find((x) => ITEM_PRICES[x].t === 'gold' && ITEM_PRICES[x].v >= 50_000 && ITEM_PRICES[x].v <= 100_000);
  await h.act('zengin', { op: 'checkout', houseId: 'hq_g1', design: { items: [it('a', k)] }, expect: { gold: ITEM_PRICES[k].v, gem: 0 } });
  const st = h.G(`${h.W}/gangs/g1/private/state`);
  assert.ok(st.distributableLeft <= st.kasa, 'dağıtılabilir ≤ kasa');
  h.present('veli', 'hq_g1');
  await assert.rejects(h.act('veli', { op: 'kick', houseId: 'hq_g1', uid: 'zengin' }), /yetkin yok/);
  await h.act('zengin', { op: 'kick', houseId: 'hq_g1', uid: 'veli' });
  assert.equal(h.G('housePresence/veli'), undefined);
  await h.act('zengin', { op: 'hqYetki', houseId: 'hq_g1', uid: 'ali', on: true });
  await assert.rejects(h.act('ali', { op: 'kick', houseId: 'hq_g1', uid: 'zengin' }), /Mafya Babası çıkarılamaz/);
});

test('v146 polis teşkilatı: polis kod adı + varsayılan tip + takma kimlik; yetkili ad + makam; diğerleri giremez; fotoğraf yok', async () => {
  const h = setup();
  await h.act('ajan', { op: 'venueEnsure', venue: 'teskilat' });
  const r = await h.act('ajan', { op: 'enter', houseId: 'game_teskilat' });
  assert.equal(r.presenceId, 'pa_r77');
  assert.equal(h.G('housePresence/ajan'), undefined, 'uid ile konum kaydı YOK');
  const p = h.G('housePresence/pa_r77');
  assert.equal(p.displayName, 'Kartal-7');
  // v147: herkes aynı polis tipinde (gerçek avatar sızmaz)
  assert.equal(p.avatar.clothing, 'police');
  assert.equal(p.avatar.hat, 'policecap');
  assert.notEqual(p.avatar.skin, '#000');
  assert.equal(h.G('presenceAlias/pa_r77').uid, 'ajan');
  // sohbet de takma kimlik + kod adıyla
  h.S('housePresence/pa_r77', { ...p, updatedAt: h.fresh() });
  await h.act('ajan', { op: 'chat', houseId: 'game_teskilat', text: 'Operasyon 21:00' });
  const msg = h.keys('houses/game_teskilat/chat/').map((k) => h.G(k))[0];
  assert.equal(msg.uid, 'pa_r77');
  assert.equal(msg.name, 'Kartal-7');
  assert.ok(!JSON.stringify(msg).includes('ajan') && !JSON.stringify(msg).includes('Gerçek Ad'));
  // yetkili
  const b = await h.act('baskan', { op: 'enter', houseId: 'game_teskilat' });
  assert.equal(b.presenceId, undefined);
  assert.equal(h.G('housePresence/baskan').displayName, 'Haluk · Belediye Başkanı');
  await assert.rejects(h.act('ali', { op: 'enter', houseId: 'game_teskilat' }), /sadece polisler/);
  await assert.rejects(h.act('ajan', { op: 'photoShot', houseId: 'game_teskilat' }), /fotoğraf çekilmez/);
});

test('v146 evi sat: alış fiyatı geri, satın alınmış mobilyalar envantere, kasa geri, ev silinir; işletme satılamaz', async () => {
  const h = setup();
  const { houseId } = await h.act('zengin', { op: 'buy' });
  h.S(`houses/${houseId}`, { ...h.G(`houses/${houseId}`), items: [it('a', 'sofa2', { p: 1 }), it('b', 'sofa2', { p: 1 }), it('c', 'lamp')] });
  h.S(`houseFunds/${houseId}`, { ownerUid: 'zengin', gold: 5000, gem: 2 });
  h.S('houseInventories/zengin', { items: { sofa2: 1 }, walls: ['tugla'], floors: [] });
  h.present('veli', houseId);
  const before = h.G('users/zengin');
  await assert.rejects(h.act('veli', { op: 'sellHouse', houseId, confirm: true }), /senin değil/);
  await assert.rejects(h.act('zengin', { op: 'sellHouse', houseId }), /Onay/);
  const r = await h.act('zengin', { op: 'sellHouse', houseId, confirm: true });
  assert.equal(r.furniture, 2);
  assert.equal(h.G('users/zengin').gold, before.gold + HOUSE_PRICE + 5000);
  assert.equal(h.G('users/zengin').emerald, before.emerald + 2);
  assert.equal(h.G('houseInventories/zengin').items.sofa2, 3);
  assert.equal(h.G('houseInventories/zengin').items.lamp, undefined, 'deneme eşya düşer');
  assert.deepEqual(h.G('houseInventories/zengin').walls, ['tugla']);
  assert.equal(h.G(`houses/${houseId}`), undefined);
  assert.equal(h.G('housePresence/veli'), undefined);
  // işletme / ofis satılamaz
  const { houseId: b } = await h.act('zengin', { op: 'buy' });
  h.S(`houses/${b}`, { ...h.G(`houses/${b}`), biz: { type: 'cafe' }, bizType: 'cafe' });
  await assert.rejects(h.act('zengin', { op: 'sellHouse', houseId: b, confirm: true }), /Sadece ev/);
});

test('v146 çete mobilyası pazarda: yetkili çete envanterinden ilan koyar, satılınca para çete kasasına; çete kapanınca karargah ve ilanlar silinir', async () => {
  const h = setup();
  await h.act('zengin', { op: 'hqEnsure' });
  h.S('houseInventories/gang_g1', { items: { sofa2: 2 }, walls: [], floors: [] });
  await assert.rejects(h.act('ali', { op: 'furnList', k: 'sofa2', v: 60_000, hqId: 'hq_g1' }), /yetkin yok/);
  const l = await h.act('zengin', { op: 'furnList', k: 'sofa2', v: 60_000, hqId: 'hq_g1' });
  const row = h.G(`furnListings/${l.id}`);
  assert.equal(row.sellerUid, 'gang_g1');
  assert.equal(row.sellerName, 'Kurtlar');
  assert.equal(h.G('houseInventories/gang_g1').items.sofa2, 1);
  assert.equal(h.G('houseInventories/zengin'), undefined, 'oyuncunun envanterine karışmaz');
  // profil › mobilyalar: başka oyuncu pazardan doğrudan envantere alır
  await assert.rejects(h.act('deniz', { op: 'furnBuy', id: l.id, expect: { t: 'gold', v: 1 } }), /price-changed/);
  await h.act('deniz', { op: 'furnBuy', id: l.id, expect: { t: 'gold', v: 60_000 } });
  assert.equal(h.G('houseInventories/deniz').items.sofa2, 1);
  assert.equal(h.G('users/deniz').gold, 2_000_000 - 60_000);
  assert.equal(h.G(`${h.W}/gangs/g1/private/state`).kasa, 1_000_000 + 60_000);
  // ikinci ilan açık kalırken çete kapanır
  const l2 = await h.act('zengin', { op: 'furnList', k: 'sofa2', v: 55_000, hqId: 'hq_g1' });
  h.present('veli', 'hq_g1');
  await h.houses.dissolveHq('g1');
  assert.equal(h.G('houses/hq_g1'), undefined);
  assert.equal(h.G('houseInventories/gang_g1'), undefined);
  assert.equal(h.G(`furnListings/${l2.id}`), undefined);
  assert.equal(h.G('housePresence/veli'), undefined);
  assert.equal(h.G('furnMarket/main').best?.sofa2, undefined, 'pazar vitrini güncellendi');
});
