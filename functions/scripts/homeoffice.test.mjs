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
import { BIZ_TYPES, BIZ_TYPE_KEYS, HOME_OFFICE_KEYS, BIZ_BY_REGION } from '../businessCatalogData.js';
import { MESCIT_DAILY_LIMIT, SONG_PROJECT_MAX, songFileName } from '../homeOfficeData.js';
import { emptySong } from '../songData.js';

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
  const venue = createVenue({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now });
  const ho = createHomeOffice({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt, business, now, extraOps: { ...venue.ops, ...ho.ops } });
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false, now, bizHooks: shop.bizHooks });
  S('users/sahip', { displayName: 'Sahip', gold: 2_000_000, emerald: 100 });
  S('users/ali', { displayName: 'Ali', gold: 50_000 });
  S('users/veli', { displayName: 'Veli', gold: 50_000 });
  S('users/fakir', { displayName: 'Fakir', gold: 250 });
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  return { db, S, G, clock, act, hact, present, ho };
}
let seq = 0;
const it = (k, extra = {}) => ({ i: `y${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1, ...extra });
async function openBiz(h, type, extra = []) {
  const { houseId } = await h.hact('sahip', { op: 'buy', bizIntent: type });
  const items = [...extra];
  BIZ_TYPES[type].groups.forEach((g) => {
    for (let n = 0; n < g.n; n++) items.push(it(g.any[0]));
  });
  h.S(`houses/${houseId}`, { ...h.G(`houses/${houseId}`), items });
  await h.hact('sahip', { op: 'bizOpen', houseId, type });
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

test('mescit: bağış %10 vergiyle sahibine; günde mescit başına 10.000; sahip bağış yapamaz', async () => {
  const h = setup();
  const id = await openBiz(h, 'mescit');
  const g0 = h.G('users/sahip').gold;
  await assert.rejects(h.act('ali', { op: 'mescitDonate', houseId: id, amount: 1000 }), /not-present/);
  h.present('ali', id);
  const r = await h.act('ali', { op: 'mescitDonate', houseId: id, amount: 1000 });
  assert.equal(r.spent, 1000);
  assert.equal(h.G('users/ali').gold, 49_000);
  assert.equal(h.G('users/sahip').gold, g0 + 900);
  const rep = h.G(`businessDaily/${id}_2026-10-07`);
  assert.equal(rep.byKind.bagis, 1000);
  assert.equal(rep.tax, 100);
  await h.act('ali', { op: 'mescitDonate', houseId: id, amount: 9000 });
  await assert.rejects(h.act('ali', { op: 'mescitDonate', houseId: id, amount: 10 }), new RegExp(`limit:${MESCIT_DAILY_LIMIT}`));
  await assert.rejects(h.act('veli', { op: 'mescitDonate', houseId: id, amount: 20_000 }), /Geçersiz bağış/);
  h.present('sahip', id);
  await assert.rejects(h.act('sahip', { op: 'mescitDonate', houseId: id, amount: 100 }), /Kendi mescidine/);
  h.present('fakir', id);
  await assert.rejects(h.act('fakir', { op: 'mescitDonate', houseId: id, amount: 500 }), /gold/);
  // ertesi gün yeniden
  h.clock.now += 15 * 60 * 60 * 1000;
  h.present('ali', id);
  await h.act('ali', { op: 'mescitDonate', houseId: id, amount: 100 });
});

test('sinema: içecek + patlamış mısır menüden 100–1.000, garson yok, günlük sınır', async () => {
  const h = setup();
  const id = await openBiz(h, 'sinema');
  assert.deepEqual(Object.keys(menuOf(h.G(`houses/${id}`).items)).sort(), ['enerji', 'kola', 'meyveSuyu', 'misir', 'su']);
  await assert.rejects(h.act('sahip', { op: 'menuPrices', houseId: id, prices: { misir: 50 } }), /price-band/);
  await assert.rejects(h.act('sahip', { op: 'menuPrices', houseId: id, prices: { misir: 1500 } }), /price-band/);
  await h.act('sahip', { op: 'menuPrices', houseId: id, prices: { misir: 1000 } });
  h.present('ali', id);
  // varsayılan fiyat 200
  const k = await h.act('ali', { op: 'menuBuy', houseId: id, product: 'kola', expect: 200 });
  assert.equal(k.price, 200);
  for (let n = 0; n < 9; n++) await h.act('ali', { op: 'menuBuy', houseId: id, product: 'misir', expect: 1000 });
  await assert.rejects(h.act('ali', { op: 'menuBuy', houseId: id, product: 'misir', expect: 1000 }), /limit:9200/);
  // ücretsiz alma kapalı; garson başvurusu yok
  const pop = h.G(`houses/${id}`).items.find((x) => x.k === 'popcorn');
  await assert.rejects(h.hact('ali', { op: 'take', houseId: id, itemId: pop.i, product: 'misir' }), /biz-menu/);
  await assert.rejects(h.act('ali', { op: 'waiterJoin', houseId: id }), /biz-closed/);
  assert.equal(h.G(`businessDaily/${id}_2026-10-07`).byKind.menu, 9200);
});

test('stüdyo: mikser tek kişi, dakika 100–400, para bitince durur; proje kaydı oturum ister', async () => {
  const h = setup();
  const id = await openBiz(h, 'studyo');
  const mixer = h.G(`houses/${id}`).items.find((x) => x.k === 'mixer').i;
  const synth = h.G(`houses/${id}`).items.find((x) => x.k === 'synth').i;
  await assert.rejects(h.act('sahip', { op: 'netPrice', houseId: id, price: 50 }), /price-band/);
  await assert.rejects(h.act('sahip', { op: 'netPrice', houseId: id, price: 500 }), /price-band/);
  await h.act('sahip', { op: 'netPrice', houseId: id, price: 100 });
  h.present('ali', id);
  h.present('veli', id);
  // oturum yokken proje kaydedilemez
  await assert.rejects(h.act('ali', { op: 'songSave', houseId: id, song: songWith() }), /studio-session/);
  await assert.rejects(h.act('ali', { op: 'netStart', houseId: id, itemId: synth, expect: 100 }), /Cihaz bulunamadı/);
  const s = await h.act('ali', { op: 'netStart', houseId: id, itemId: mixer, expect: 100 });
  assert.equal(s.charged, 100);
  assert.equal(h.G('users/ali').gold, 49_900);
  await assert.rejects(h.act('veli', { op: 'netStart', houseId: id, itemId: mixer, expect: 100 }), /device-full/);
  // boş proje de kaydedilir; sonra güncellenir
  const p1 = await h.act('ali', { op: 'songSave', houseId: id, song: { ...emptySong(), title: 'Taslak' } });
  assert.ok(p1.created);
  const p2 = await h.act('ali', { op: 'songSave', houseId: id, projectId: p1.projectId, song: songWith('Neon Gece') });
  assert.equal(p2.projectId, p1.projectId);
  assert.equal(h.G(`songProjects/${p1.projectId}`).title, 'Neon Gece');
  assert.equal(h.G(`songProjects/${p1.projectId}`).uid, 'ali');
  // başkasının projesine yazılamaz → yeni proje olur
  h.present('sahip', id);
  // gelir: dakika ücreti sahibine (vergi düşülerek) ve rapora
  assert.equal(h.G(`businessDaily/${id}_2026-10-07`).byKind.service, 100);
  // fakir: 1 dakika öder, ikincide durur; durunca 3 dk içinde otomatik kayıt yapılabilir
  await h.act('ali', { op: 'netLeave', houseId: id });
  h.present('fakir', id);
  await h.act('fakir', { op: 'netStart', houseId: id, itemId: mixer, expect: 100 });
  h.clock.now += 58_000;
  h.present('fakir', id);
  await h.act('fakir', { op: 'netTick', houseId: id });
  h.clock.now += 61_000;
  h.present('fakir', id);
  const t = await h.act('fakir', { op: 'netTick', houseId: id });
  assert.equal(t.stopped, 'gold');
  const fp = await h.act('fakir', { op: 'songSave', houseId: id, song: songWith('Son') });
  assert.ok(fp.projectId);
  h.clock.now += 5 * 60_000;
  await assert.rejects(h.act('fakir', { op: 'songSave', houseId: id, song: songWith('Geç') }), /studio-session/);
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
  await assert.rejects(h.act('ali', { op: 'songTip', postId: 'p1', amount: 10 }), /Kendi şarkına/);
  const g0 = h.G('users/ali').gold;
  await h.act('veli', { op: 'songTip', postId: 'p1', amount: 1000 });
  assert.equal(h.G('users/veli').gold, 49_000);
  assert.equal(h.G('users/ali').gold, g0 + 900);
  assert.equal(h.G('sixtagramPosts/p1').tips, 1000);
  await assert.rejects(h.act('veli', { op: 'songTip', postId: 'p1', amount: 10 }), /tip-limit:1000/);
  // ertesi gün yeniden destek verilebilir; eski sayaç temizlenir
  h.clock.now += 24 * 60 * 60 * 1000;
  await h.act('veli', { op: 'songTip', postId: 'p1', amount: 100 });
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
