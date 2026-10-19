// v93 — Home Ofisler (mescit / sinema / müzik stüdyosu) + şarkı projeleri + Sixtagram
// şarkı dinlenme/destek testleri. Çalıştır: node --test functions/scripts/homeoffice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { createShop } from '../shop.js';
import { createVenue, menuOf } from '../venue.js';
import { createHomeOffice, buildSongAttachment } from '../homeOffice.js';
import { createOffice } from '../office.js';
import { houseKind, officePriceOf, OFFICE_DAILY_LIMIT } from '../officeData.js';
import { BIZ_TYPES, BIZ_TYPE_KEYS, HOME_OFFICE_KEYS, BIZ_BY_REGION } from '../businessCatalogData.js';
import { SONG_PROJECT_MAX, songFileName } from '../homeOfficeData.js';
import { emptySong, sanitizeSong } from '../songData.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const splitIncomeForDebt = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: Date.UTC(2026, 9, 7, 9) };
  const now = () => clock.now;
  const business = createBusiness({ db, FieldValue, now });
  const office = createOffice({ db, FieldValue, HttpsError, splitIncomeForDebt, now });
  const venue = createVenue({ db, FieldValue, HttpsError, splitIncomeForDebt, business, office, now });
  const ho = createHomeOffice({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt, business, now, extraOps: { ...venue.ops, ...ho.ops, ...office.ops } });
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false, now, bizHooks: shop.bizHooks, officeMigrate: (id) => office.migrateOne(id) });
  S('users/sahip', { displayName: 'Sahip', gold: 2_000_000, emerald: 100 });
  S('users/ali', { displayName: 'Ali', gold: 50_000 });
  S('users/veli', { displayName: 'Veli', gold: 50_000 });
  S('users/fakir', { displayName: 'Fakir', gold: 250 });
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  return { db, S, G, clock, act, hact, present, ho, office };
}
let seq = 0;
const it = (k, extra = {}) => ({ i: `y${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1, ...extra });
async function openBizRaw(h, type) {
  const { houseId } = await h.hact('sahip', { op: 'buy' });
  return h.hact('sahip', { op: 'bizOpen', houseId, type });
}
// v100: eski home ofis türlerinin mobilyalarıyla bir ev kurar ve ilgili mobilyayı
// ücretli yapar (stüdyo → mikser, sinema → mısır + içecek dolabı, mescit → bağış kutusu)
const OFFICE_OF = { studyo: { mixer: true }, sinema: { popcorn: true, drinkfridge: true }, mescit: { bagiskutusu: true } };
async function openBiz(h, type, extra = []) {
  const { houseId } = await h.hact('sahip', { op: 'buy' });
  const items = [...extra];
  BIZ_TYPES[type].groups.forEach((g) => {
    for (let n = 0; n < g.n; n++) items.push(it(g.any[0]));
  });
  h.S(`houses/${houseId}`, { ...h.G(`houses/${houseId}`), items });
  if (OFFICE_OF[type]) await h.act('sahip', { op: 'officeSet', houseId, keys: OFFICE_OF[type] });
  else await h.hact('sahip', { op: 'bizOpen', houseId, type });
  return houseId;
}
const songWith = (title = 'Neon Gece') => {
  const s = emptySong();
  s.title = title;
  s.pats[0].d[0] = 0b1000100010001;
  return s;
};

test('home ofis türleri: işletme listesinde/haritada yok, gerekli mobilyalar doğru', () => {
  assert.deepEqual(HOME_OFFICE_KEYS, ['mescit', 'sinema', 'studyo']);
  HOME_OFFICE_KEYS.forEach((k) => assert.ok(!BIZ_TYPE_KEYS.includes(k)));
  assert.ok(!Object.values(BIZ_BY_REGION).some((k) => HOME_OFFICE_KEYS.includes(k)));
  const need = (t) => Object.fromEntries(BIZ_TYPES[t].groups.map((g) => [g.any[0], g.n]));
  assert.deepEqual(need('mescit'), { seccade: 4, camiavize: 1, bagiskutusu: 1, ayakkabilik: 1 });
  assert.deepEqual(need('sinema'), { cinescreen: 1, cineseat: 2, popcorn: 1, drinkfridge: 1 });
  assert.deepEqual(need('studyo'), { studiospk: 2, booth: 1, mixer: 1, synth: 1 });
  assert.equal(songFileName('Neon / Gece?'), 'Neon Gece - cetelerinsavasi.com.mp3');
  assert.equal(songFileName(''), 'Şarkı - cetelerinsavasi.com.mp3');
});

test('v100 bağış kutusu: kapalıyken bağış yok; açıkken 100/250/500/1000, %10 vergi, mekân başı günde 10.000', async () => {
  const h = setup();
  const { houseId: id } = await h.hact('sahip', { op: 'buy' });
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [it('bagiskutusu'), it('seccade')] });
  h.present('ali', id);
  await assert.rejects(h.act('ali', { op: 'officeDonate', houseId: id, amount: 100 }), /office-donate-off/);
  assert.equal(houseKind(h.G(`houses/${id}`)), 'depo');
  await assert.rejects(h.act('ali', { op: 'officeSet', houseId: id, keys: { bagiskutusu: true } }), /senin değil/);
  const r0 = await h.act('sahip', { op: 'officeSet', houseId: id, keys: { bagiskutusu: true }, emoji: '🕌' });
  assert.equal(r0.kind, 'ofis');
  assert.equal(h.G(`houses/${id}`).kind, 'ofis');
  assert.equal(h.G(`houses/${id}`).office.emoji, '🕌');
  const g0 = h.G('users/sahip').gold;
  await assert.rejects(h.act('ali', { op: 'officeDonate', houseId: id, amount: 300 }), /Geçersiz bağış/);
  const r = await h.act('ali', { op: 'officeDonate', houseId: id, amount: 1000 });
  assert.equal(r.spent, 1000);
  assert.equal(h.G('users/ali').gold, 49_000);
  assert.equal(h.G('users/sahip').gold, g0 + 900);
  const rep = h.G(`officeDaily/${id}_2026-10-07`);
  assert.equal(rep.byKind.bagis, 1000);
  assert.equal(rep.tax, 100);
  assert.equal(rep.ownerUid, 'sahip');
  for (let n = 0; n < 9; n++) await h.act('ali', { op: 'officeDonate', houseId: id, amount: 1000 });
  await assert.rejects(h.act('ali', { op: 'officeDonate', houseId: id, amount: 100 }), new RegExp(`office-limit:${OFFICE_DAILY_LIMIT}`));
  h.present('sahip', id);
  await assert.rejects(h.act('sahip', { op: 'officeDonate', houseId: id, amount: 100 }), /Kendi bağış/);
  h.present('fakir', id);
  await assert.rejects(h.act('fakir', { op: 'officeDonate', houseId: id, amount: 500 }), /gold/);
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, emoji: 'abc' }), /Geçersiz emoji/);
  // ertesi gün yeniden; kapatılınca ev olur (10'dan az mobilya → depo)
  h.clock.now += 15 * 60 * 60 * 1000;
  h.present('ali', id);
  await h.act('ali', { op: 'officeDonate', houseId: id, amount: 100 });
  const off = await h.act('sahip', { op: 'officeSet', houseId: id, keys: { bagiskutusu: false } });
  assert.equal(off.kind, 'depo');
});

test('v100 ücretli ürünler: varsayılan ücretsiz; ücretli yapınca fiyat 10–200, aynı ürün başka eşyada da ücretli, günlük 10.000', async () => {
  const h = setup();
  const { houseId: id } = await h.hact('sahip', { op: 'buy' });
  const fs = it('fruitstand');
  const td = it('tdining'); // meyve + pizza
  const fr = it('drinkfridge');
  const bar = it('bar');
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [fs, td, fr, bar, it('rug'), it('sofa3'), it('tvwall'), it('armchair'), it('wardrobe'), it('desk')] });
  h.present('ali', id);
  assert.equal(houseKind(h.G(`houses/${id}`)), 'ev');
  // ücretsizken herkes alır
  await h.hact('ali', { op: 'take', houseId: id, itemId: fs.i, product: 'meyve' });
  await assert.rejects(h.act('ali', { op: 'officeBuy', houseId: id, itemId: fs.i, product: 'meyve', expect: 50 }), /office-free/);
  // sahip manav tezgâhını ücretli yapar (varsayılan 50), sonra 120
  await h.act('sahip', { op: 'officeSet', houseId: id, keys: { fruitstand: true } });
  assert.equal(officePriceOf(h.G(`houses/${id}`), 'meyve'), 50);
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, prices: { meyve: 5 } }), /price-band:10:200/);
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, prices: { meyve: 250 } }), /price-band/);
  await h.act('sahip', { op: 'officeSet', houseId: id, prices: { meyve: 120 } });
  // bar tezgâhı ürünleri 100–500
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, prices: { viski: 50 } }), /price-band:100:500/);
  await h.act('sahip', { op: 'officeSet', houseId: id, keys: { bar: true }, prices: { viski: 500 } });
  // kural 2: meyve yemek masasında da ücretli; pizza (sadece masada) ücretsiz
  await assert.rejects(h.hact('ali', { op: 'take', houseId: id, itemId: td.i, product: 'meyve' }), /office-paid:120/);
  await h.hact('ali', { op: 'take', houseId: id, itemId: td.i, product: 'pizza' });
  await assert.rejects(h.act('ali', { op: 'officeBuy', houseId: id, itemId: td.i, product: 'meyve', expect: 50 }), /price-changed:120/);
  const b = await h.act('ali', { op: 'officeBuy', houseId: id, itemId: td.i, product: 'meyve', expect: 120 });
  assert.equal(b.price, 120);
  assert.equal(h.G('heldItems/ali').itemId, 'meyve');
  // market arabasına (cart) eklemek de ücretli ama ele almaz
  const c = await h.act('ali', { op: 'officeBuy', houseId: id, itemId: fs.i, product: 'meyve', expect: 120, cart: true });
  assert.equal(c.untilMs, undefined);
  // sahip ücretsiz alır (take)
  h.present('sahip', id);
  await h.hact('sahip', { op: 'take', houseId: id, itemId: fs.i, product: 'meyve' });
  await assert.rejects(h.act('sahip', { op: 'officeBuy', houseId: id, itemId: fs.i, product: 'meyve', expect: 120 }), /office-owner/);
  // içecek dolabı hâlâ ücretsiz
  await h.hact('ali', { op: 'take', houseId: id, itemId: fr.i, product: 'kola' });
  // günlük sınır: 240 harcandı; viski 500 × 19 = 9.500 → toplam 9.740, bir viski daha olmaz
  for (let n = 0; n < 19; n++) await h.act('ali', { op: 'officeBuy', houseId: id, itemId: bar.i, product: 'viski', expect: 500 });
  await assert.rejects(h.act('ali', { op: 'officeBuy', houseId: id, itemId: bar.i, product: 'viski', expect: 500 }), /office-limit:9740/);
  const rep = h.G(`officeDaily/${id}_2026-10-07`);
  assert.equal(rep.revenue, 9740);
  assert.equal(rep.products.viski, 19);
  assert.equal(rep.products.meyve, 2);
  assert.equal(h.G(`houses/${id}`).kind, 'ofis');
  // ücretli mobilya kaldırılınca ofis değil
  const items = h.G(`houses/${id}`).items.filter((x) => x.k !== 'fruitstand' && x.k !== 'bar');
  await h.hact('sahip', { op: 'save', houseId: id, design: { items, wall: null, floor: null } });
  assert.equal(h.G(`houses/${id}`).kind, 'depo'); // ofis değil; 8 mobilya → depo
  await h.hact('ali', { op: 'take', houseId: id, itemId: td.i, product: 'meyve' });
});

test('v100 cafe/bar: ürün mobilyaları menüde kalır (ücretli yapılamaz); bağış kutusu işletmede ayrı kazanç', async () => {
  const h = setup();
  const id = await openBiz(h, 'cafe', [it('bagiskutusu'), it('drinkfridge')]);
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, keys: { drinkfridge: true } }), /ücretli yapılamaz/);
  await h.act('sahip', { op: 'officeSet', houseId: id, keys: { bagiskutusu: true } });
  assert.equal(h.G(`houses/${id}`).kind, 'isletme');
  h.present('ali', id);
  await h.act('ali', { op: 'officeDonate', houseId: id, amount: 500 });
  assert.equal(h.G(`officeDaily/${id}_2026-10-07`).byKind.bagis, 500);
  assert.equal(h.G(`businessDaily/${id}_2026-10-07`), undefined); // işletme kasasından ayrı
});

test('v100 mikser: sahip ücretsiz; ücretli değilse başkası kullanamaz; ücretliyse dakika 100–500, sınır dolunca durur', async () => {
  const h = setup();
  const { houseId: id } = await h.hact('sahip', { op: 'buy' });
  const mix = it('mixer');
  const synth = it('synth');
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [mix, synth] });
  h.present('ali', id);
  h.present('sahip', id);
  await assert.rejects(h.act('ali', { op: 'netStart', houseId: id, itemId: mix.i, expect: 200 }), /mixer-private/);
  await assert.rejects(h.act('ali', { op: 'songSave', houseId: id, song: songWith() }), /studio-session/);
  const own = await h.act('sahip', { op: 'netStart', houseId: id, itemId: mix.i, expect: 0 });
  assert.equal(own.charged, 0);
  const sp = await h.act('sahip', { op: 'songSave', houseId: id, song: songWith('Sahibin') });
  assert.ok(sp.projectId);
  await h.act('sahip', { op: 'netLeave', houseId: id });
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, keys: { mixer: true }, minute: 50 }), /price-band:100:500/);
  await h.act('sahip', { op: 'officeSet', houseId: id, keys: { mixer: true }, minute: 500 });
  await assert.rejects(h.act('ali', { op: 'netStart', houseId: id, itemId: synth.i, expect: 500 }), /biz-closed|Cihaz/);
  const s = await h.act('ali', { op: 'netStart', houseId: id, itemId: mix.i, expect: 500 });
  assert.equal(s.charged, 500);
  assert.equal(h.G('users/ali').gold, 49_500);
  h.present('veli', id);
  await assert.rejects(h.act('veli', { op: 'netStart', houseId: id, itemId: mix.i, expect: 500 }), /device-full/);
  assert.equal(h.G(`officeDaily/${id}_2026-10-07`).byKind.dakika, 500);
  const p1 = await h.act('ali', { op: 'songSave', houseId: id, song: songWith('Neon Gece') });
  assert.ok(p1.created);
  // 19 dakika daha → 10.000; sonraki dakikada sınırdan durur
  for (let n = 0; n < 19; n++) {
    h.clock.now += 60_000;
    h.present('ali', id);
    const t = await h.act('ali', { op: 'netTick', houseId: id });
    assert.equal(t.charged, 500);
  }
  h.clock.now += 60_000;
  h.present('ali', id);
  const t = await h.act('ali', { op: 'netTick', houseId: id });
  assert.equal(t.stopped, 'limit');
  assert.equal(h.G(`officeSpend/${id}_ali_2026-10-07`).amount, 10_000);
  // fakir: parası bitince durur
  h.present('fakir', id);
  await assert.rejects(h.act('fakir', { op: 'netStart', houseId: id, itemId: mix.i, expect: 500 }), /gold/);
});

test('v100 göç: eski home ofisler ofis olur, fiyatlar yeni aralığa çekilir', async () => {
  const h = setup();
  const mk = (type, extra) => {
    const id = `ho_${type}`;
    h.S(`houses/${id}`, { ownerUid: 'sahip', name: type, privacy: 'friends', items: [it(type === 'studyo' ? 'mixer' : type === 'sinema' ? 'popcorn' : 'bagiskutusu'), it('drinkfridge')], biz: { type, openedAtMs: 5 }, bizType: type, ...extra });
    return id;
  };
  const st = mk('studyo', { bizPrices: { minute: 50 } });
  const si = mk('sinema', { bizPrices: { menu: { misir: 1000, kola: 150 } } });
  const me = mk('mescit', {});
  const n = await h.office.migrateLegacyHomeOffices();
  assert.equal(n, 3);
  const S1 = h.G(`houses/${st}`);
  assert.equal(S1.bizType, null);
  assert.equal(S1.kind, 'ofis');
  assert.equal(S1.privacy, 'public');
  assert.equal(S1.office.minute, 100);
  assert.equal(S1.office.emoji, '🎚️');
  const S2 = h.G(`houses/${si}`);
  assert.equal(S2.office.prices.misir, 200);
  assert.equal(S2.office.prices.kola, 150);
  assert.equal(S2.office.prices.su, 200);
  assert.equal(officePriceOf(S2, 'kola'), 150);
  assert.equal(h.G(`houses/${me}`).office.keys.bagiskutusu, true);
  assert.equal(await h.office.migrateLegacyHomeOffices(), 0);
  // eve girişte de taşınır
  const late = mk('studyo', { bizPrices: { minute: 300 } }).replace('ho_studyo', 'ho_studyo');
  h.S(`houses/${late}`, { ...h.G(`houses/${late}`), biz: { type: 'studyo' }, bizType: 'studyo', office: null });
  await h.hact('ali', { op: 'enter', houseId: late });
  assert.equal(h.G(`houses/${late}`).office.minute, 300);
  // home ofis artık işletme olarak açılamaz
  await assert.rejects(openBizRaw(h, 'mescit'), /Home ofisler artık ofis/);
});

test('proje: oyuncu başı 5 sınır, sil, 7 gün dokunulmayan silinir; başka stüdyoda devam', async () => {
  const h = setup();
  const a = await openBiz(h, 'studyo');
  const b = await openBiz(h, 'studyo');
  const mixA = h.G(`houses/${a}`).items.find((x) => x.k === 'mixer').i;
  const mixB = h.G(`houses/${b}`).items.find((x) => x.k === 'mixer').i;
  h.present('ali', a);
  await h.act('ali', { op: 'netStart', houseId: a, itemId: mixA, expect: 200 });
  const first = await h.act('ali', { op: 'songSave', houseId: a, song: songWith('Bir') });
  for (let n = 1; n < SONG_PROJECT_MAX; n++) await h.act('ali', { op: 'songSave', houseId: a, song: songWith(`P${n}`) });
  await assert.rejects(h.act('ali', { op: 'songSave', houseId: a, song: songWith('Fazla') }), new RegExp(`project-max:${SONG_PROJECT_MAX}`));
  await h.act('ali', { op: 'songDelete', projectId: first.projectId });
  assert.equal(h.G(`songProjects/${first.projectId}`), undefined);
  const again = await h.act('ali', { op: 'songSave', houseId: a, song: songWith('Yeni') });
  // başka stüdyoda aynı projeye devam
  await h.act('ali', { op: 'netLeave', houseId: a });
  h.present('ali', b);
  await h.act('ali', { op: 'netStart', houseId: b, itemId: mixB, expect: 200 });
  const cont = await h.act('ali', { op: 'songSave', houseId: b, projectId: again.projectId, song: songWith('Yeni 2') });
  assert.equal(cont.projectId, again.projectId);
  assert.equal(h.G(`songProjects/${again.projectId}`).studioHouseId, b);
  // 7 gün sonra hepsi silinir (sadece güncellenenler hariç)
  h.clock.now += 7 * 24 * 60 * 60 * 1000 + 1000;
  const c = await h.ho.cleanup();
  assert.equal(c.projects, SONG_PROJECT_MAX);
});

test('sixtagram: şarkı projeden paylaşılır; dinlenme hesap başı 5; destek 10/100/1000, günde 1.000', async () => {
  const h = setup();
  const id = await openBiz(h, 'studyo');
  const mixer = h.G(`houses/${id}`).items.find((x) => x.k === 'mixer').i;
  h.present('ali', id);
  await h.act('ali', { op: 'netStart', houseId: id, itemId: mixer, expect: 200 });
  const empty = await h.act('ali', { op: 'songSave', houseId: id, song: { ...emptySong(), title: 'Boş' } });
  const full = await h.act('ali', { op: 'songSave', houseId: id, song: songWith('Neon Gece') });
  // ek: projeden; boş proje / başkasının projesi / eski (projesiz) ek reddedilir
  assert.match((await buildSongAttachment(h.db, 'ali', { type: 'song', projectId: empty.projectId })).error, /Boş şarkı/);
  assert.match((await buildSongAttachment(h.db, 'veli', { type: 'song', projectId: full.projectId })).error, /bulunamadı/);
  assert.match((await buildSongAttachment(h.db, 'ali', { type: 'song', bpm: 100 })).error, /stüdyolarında/);
  const att = await buildSongAttachment(h.db, 'ali', { type: 'song', projectId: full.projectId });
  assert.equal(att.song.title, 'Neon Gece');
  assert.equal(att.song.type, 'song');
  h.S('sixtagramPosts/p1', { uid: 'ali', attachment: att.song, likeCount: 0, expiresAtMs: h.clock.now + 864e5 });
  // dinlenme: veli 7 kez dinler → 5 sayılır
  for (let n = 0; n < 7; n++) await h.act('veli', { op: 'songPlay', postId: 'p1' });
  assert.equal(h.G('sixtagramPosts/p1').plays, 5);
  const r = await h.act('ali', { op: 'songPlay', postId: 'p1' });
  assert.equal(r.plays, 6);
  // destek
  await assert.rejects(h.act('veli', { op: 'songTip', postId: 'p1', amount: 50 }), /Geçersiz destek/);
  await assert.rejects(h.act('ali', { op: 'songTip', postId: 'p1', amount: 100 }), /Kendi şarkına/);
  const g0 = h.G('users/ali').gold;
  await h.act('veli', { op: 'songTip', postId: 'p1', amount: 1000 });
  assert.equal(h.G('users/veli').gold, 49_000);
  assert.equal(h.G('users/ali').gold, g0 + 900);
  assert.equal(h.G('sixtagramPosts/p1').tips, 1000);
  // v100 — şarkı başı 5.000: 1.000 + 5.000 olmaz, 4 × 1.000 daha olur
  await assert.rejects(h.act('veli', { op: 'songTip', postId: 'p1', amount: 5000 }), /tip-song-limit:1000/);
  for (let n = 0; n < 4; n++) await h.act('veli', { op: 'songTip', postId: 'p1', amount: 1000 });
  await assert.rejects(h.act('veli', { op: 'songTip', postId: 'p1', amount: 100 }), /tip-song-limit:5000/);
  // sanatçıya günlük 10.000: başka şarkıya 5.000 olur, sonra 100 bile olmaz
  h.S('sixtagramPosts/p2', { uid: 'ali', attachment: att.song, likeCount: 0, expiresAtMs: h.clock.now + 864e5 });
  h.S('sixtagramPosts/p3', { uid: 'ali', attachment: att.song, likeCount: 0, expiresAtMs: h.clock.now + 864e5 });
  const r2 = await h.act('veli', { op: 'songTip', postId: 'p2', amount: 5000 });
  assert.equal(r2.given, 10_000);
  await assert.rejects(h.act('veli', { op: 'songTip', postId: 'p3', amount: 100 }), /tip-limit:10000/);
  assert.equal(h.G('users/veli').gold, 40_000);
  // ertesi gün yeniden destek verilebilir; eski sayaç temizlenir
  h.clock.now += 24 * 60 * 60 * 1000;
  await h.act('veli', { op: 'songTip', postId: 'p3', amount: 100, text: '  Harika parça!\n ' });
  await h.act('veli', { op: 'songTip', postId: 'p3', amount: 500 });
  // v99.2 — her destek yorum olur (notlu/notsuz), destek miktarıyla
  const tipComments = [...h.db._store.entries()].filter(([k]) => k.startsWith('sixtagramPosts/p3/comments/')).map(([, v]) => v.data).sort((x, y) => x.tip - y.tip);
  assert.deepEqual(tipComments.map((x) => [x.tip, x.text, x.authorName]), [[100, 'Harika parça!', 'Veli'], [500, '', 'Veli']]);
  assert.equal(h.G('sixtagramPosts/p3').commentCount, 2);
  const c = await h.ho.cleanup();
  assert.equal(c.tips, 1);
});

test('v99 sixtagram: şarkı kayıt olmadan doğrudan paylaşılır; projesi silinmek üzere döner', async () => {
  const h = setup();
  const id = await openBiz(h, 'studyo');
  const mixer = h.G(`houses/${id}`).items.find((x) => x.k === 'mixer').i;
  h.present('ali', id);
  await h.act('ali', { op: 'netStart', houseId: id, itemId: mixer, expect: 200 });
  const first = await h.act('ali', { op: 'songSave', houseId: id, song: songWith('P0') });
  for (let n = 1; n < SONG_PROJECT_MAX; n++) await h.act('ali', { op: 'songSave', houseId: id, song: songWith(`P${n}`) });
  // sınır dolu, proje yok → yine de paylaşılır
  const inl = await buildSongAttachment(h.db, 'ali', { type: 'song', houseId: id, song: songWith('Kayıtsız') }, h.clock.now);
  assert.equal(inl.error, undefined);
  assert.equal(inl.song.title, 'Kayıtsız');
  assert.equal(inl.deleteProjectId, null);
  // boş şarkı / stüdyoda olmayan / başka ev reddedilir
  assert.match((await buildSongAttachment(h.db, 'ali', { type: 'song', houseId: id, song: { ...emptySong(), title: 'x' } }, h.clock.now)).error, /Boş şarkı/);
  assert.match((await buildSongAttachment(h.db, 'veli', { type: 'song', houseId: id, song: songWith('x') }, h.clock.now)).error, /stüdyolarında/);
  // proje kimliği verilirse silinmek üzere döner (ekrandaki hâl kullanılır)
  const wp = await buildSongAttachment(h.db, 'ali', { type: 'song', houseId: id, projectId: first.projectId, song: songWith('Son Hâl') }, h.clock.now);
  assert.equal(wp.song.title, 'Son Hâl');
  assert.equal(wp.deleteProjectId, first.projectId);
  // başkasının projesi silinmek üzere dönmez
  assert.equal((await buildSongAttachment(h.db, 'ali', { type: 'song', houseId: id, projectId: 'yok123', song: songWith('a') }, h.clock.now)).deleteProjectId, null);
  // oturum bitti + 31 dk → reddedilir
  const late = h.clock.now + 31 * 60 * 1000 + 60 * 1000;
  assert.match((await buildSongAttachment(h.db, 'ali', { type: 'song', houseId: id, song: songWith('Geç') }, late)).error, /stüdyolarında/);
});

test('v99.1 şarkı Firestore\'a iç içe dizisiz yazılır (proje + paylaşım eki)', async () => {
  const nested = (v) => (Array.isArray(v) ? v.some((x) => Array.isArray(x) || nested(x)) : v && typeof v === 'object' ? Object.values(v).some(nested) : false);
  const h = setup();
  const id = await openBiz(h, 'studyo');
  const mixer = h.G(`houses/${id}`).items.find((x) => x.k === 'mixer').i;
  h.present('ali', id);
  await h.act('ali', { op: 'netStart', houseId: id, itemId: mixer, expect: 200 });
  const p = await h.act('ali', { op: 'songSave', houseId: id, song: songWith('Düz') });
  assert.equal(nested(h.G(`songProjects/${p.projectId}`)), false);
  // kayıtlı projeden tekrar yükleme + güncelleme çalışır
  await h.act('ali', { op: 'songSave', houseId: id, projectId: p.projectId, song: songWith('Düz 2') });
  const att = await buildSongAttachment(h.db, 'ali', { type: 'song', projectId: p.projectId }, h.clock.now);
  assert.equal(att.song.title, 'Düz 2');
  assert.equal(nested(att.song), false);
  const inl = await buildSongAttachment(h.db, 'ali', { type: 'song', houseId: id, song: songWith('Satır') }, h.clock.now);
  assert.equal(nested(inl.song), false);
  assert.equal(sanitizeSong(inl.song).error, undefined);
});

test('v100.1 internet kafe: içecek dolabı ücretli yapılır, kazanç işletme kasasından ayrı', async () => {
  const h = setup();
  const fr = it('drinkfridge');
  const id = await openBiz(h, 'internet', [fr]);
  const r = await h.act('sahip', { op: 'officeSet', houseId: id, keys: { drinkfridge: true }, prices: { kola: 150 } });
  assert.equal(r.kind, 'isletme');
  h.present('ali', id);
  await assert.rejects(h.hact('ali', { op: 'take', houseId: id, itemId: fr.i, product: 'kola' }), /office-paid:150/);
  await h.act('ali', { op: 'officeBuy', houseId: id, itemId: fr.i, product: 'kola', expect: 150 });
  assert.equal(h.G(`officeDaily/${id}_2026-10-07`).revenue, 150);
  assert.equal(h.G(`businessDaily/${id}_2026-10-07`), undefined);
});
