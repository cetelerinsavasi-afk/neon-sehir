// v135 — haber stüdyosu (röportaj) + tuval (resim) ofis mobilyaları, Sixtagram desteği,
// takip sistemi, hikâye görüntülenmeleri, hikâye fotoğrafı katmanı.
// Çalıştır: node --test functions/scripts/v135.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { createBusiness } from '../business.js';
import { createShop } from '../shop.js';
import { createVenue } from '../venue.js';
import { createHomeOffice, buildNewsInterviewAttachment, buildPaintingAttachment } from '../homeOffice.js';
import { createOffice } from '../office.js';
import { createSixtagramSocial } from '../sixtagramSocial.js';
import { houseKind, officeMinuteOf, isOfficeFurn } from '../officeData.js';
import { ITEM_PRICES } from '../houseCatalogData.js';
import { sanitizeDrawing } from '../drawingData.js';
import { sanitizeOverlay, PHOTO_H } from '../photoOverlay.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const split = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: Date.UTC(2026, 9, 28, 9) };
  const now = () => clock.now;
  const business = createBusiness({ db, FieldValue, now });
  const office = createOffice({ db, FieldValue, HttpsError, splitIncomeForDebt: split, now });
  const venue = createVenue({ db, FieldValue, HttpsError, splitIncomeForDebt: split, business, office, now });
  const ho = createHomeOffice({ db, FieldValue, HttpsError, splitIncomeForDebt: split, business, now });
  const six = createSixtagramSocial({ db, FieldValue, HttpsError, now, isBlockedBy: async (a, b) => a === 'engelli' || b === 'engelli' });
  const shop = createShop({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, splitIncomeForDebt: split, business, now, extraOps: { ...venue.ops, ...ho.ops, ...office.ops, ...six.ops } });
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => false, now, bizHooks: shop.bizHooks });
  S('users/sahip', { displayName: 'Sahip', gold: 2_000_000, emerald: 100, avatar: { gender: 'erkek' } });
  S('users/ali', { displayName: 'Ali', gold: 50_000, avatar: { gender: 'erkek' } });
  S('users/veli', { displayName: 'Veli', gold: 50_000 });
  const act = (uid, data) => shop.shopAction({ auth: { uid }, data });
  const hact = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const present = (uid, houseId) => S(`housePresence/${uid}`, { houseId, updatedAt: new Timestamp(clock.now) });
  return { db, S, G, clock, act, hact, present, houses };
}
let seq = 0;
const it = (k, extra = {}) => ({ i: `v${(seq++).toString(36)}`, k, x: 0, z: 0, r: 0, c: 0, p: 1, ...extra });
const drawing = () => ({ type: 'drawing', bg: 0, strokes: [{ c: 4, s: 1, p: [10, 10, 200, 200] }] });

test('v135 katalog: haber stüdyosu 10 zümrüt, liman fiyatları, yeni ofis mobilyaları yeşil', () => {
  assert.deepEqual(ITEM_PRICES.newsdesk, { t: 'gem', v: 10 });
  assert.equal(ITEM_PRICES.container.v, 100_000);
  assert.equal(ITEM_PRICES.truck.v, 50_000);
  assert.equal(ITEM_PRICES.crane.v, 80_000);
  ['easel', 'painttable', 'artstool', 'artshelf', 'dropcloth', 'paintbuckets', 'clay', 'artlamp'].forEach((k) => {
    assert.equal(ITEM_PRICES[k].t, 'gold');
    assert.ok(ITEM_PRICES[k].v >= 5000 && ITEM_PRICES[k].v <= 50_000, k);
  });
  assert.ok(isOfficeFurn('newsdesk') && isOfficeFurn('easel'));
});

test('v135 haber masası: sahip ücretsiz; ücretsizken başkası kullanamaz; ücretliyse 200–800/dk, ev ofis olur', async () => {
  const h = setup();
  const { houseId: id } = await h.hact('sahip', { op: 'buy' });
  const desk = it('newsdesk');
  const easel = it('easel');
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [desk, easel] });
  h.present('ali', id);
  h.present('sahip', id);
  await assert.rejects(h.act('ali', { op: 'netStart', houseId: id, itemId: desk.i, expect: 400 }), /mixer-private/);
  const own = await h.act('sahip', { op: 'netStart', houseId: id, itemId: desk.i, expect: 0 });
  assert.equal(own.charged, 0);
  await h.act('sahip', { op: 'netLeave', houseId: id });
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, keys: { newsdesk: true }, minutes: { newsdesk: 150 } }), /price-band:200:800/);
  await assert.rejects(h.act('sahip', { op: 'officeSet', houseId: id, keys: { easel: true }, minutes: { easel: 450 } }), /price-band:100:400/);
  const r = await h.act('sahip', { op: 'officeSet', houseId: id, keys: { newsdesk: true, easel: true }, minutes: { newsdesk: 800, easel: 100 } });
  assert.equal(r.kind, 'ofis');
  assert.equal(houseKind(h.G(`houses/${id}`)), 'ofis');
  assert.equal(officeMinuteOf(h.G(`houses/${id}`), 'newsdesk'), 800);
  assert.equal(officeMinuteOf(h.G(`houses/${id}`), 'easel'), 100);
  const s = await h.act('ali', { op: 'netStart', houseId: id, itemId: desk.i, expect: 800 });
  assert.equal(s.charged, 800);
  assert.equal(h.G('users/ali').gold, 49_200);
  // tuvale geçince (farklı cihaz) yeni dakika tuvalin fiyatıyla
  const e = await h.act('ali', { op: 'netStart', houseId: id, itemId: easel.i, expect: 100 });
  assert.equal(e.charged, 100);
  h.clock.now += 60_000;
  h.present('ali', id);
  const t = await h.act('ali', { op: 'netTick', houseId: id });
  assert.equal(t.charged, 100);
  assert.equal(h.G(`officeDaily/${id}_2026-10-28`).byKind.dakika, 1000);
});

test('v135 röportaj ve resim paylaşımı sadece ilgili mobilyada yakın zamanda oturumla', async () => {
  const h = setup();
  const { houseId: id } = await h.hact('sahip', { op: 'buy', name: 'Kanal 7' });
  const desk = it('newsdesk');
  const easel = it('easel');
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [desk, easel] });
  const t0 = h.clock.now;
  let r = await buildNewsInterviewAttachment(h.db, 'sahip', { houseId: id, text: 'Merhaba' }, t0);
  assert.match(r.error, /haber stüdyolarında/);
  h.present('sahip', id);
  await h.act('sahip', { op: 'netStart', houseId: id, itemId: desk.i, expect: 0 });
  r = await buildNewsInterviewAttachment(h.db, 'sahip', { houseId: id, text: '  Merhaba Neon Şehir  ' }, t0);
  assert.equal(r.type, 'interview');
  assert.equal(r.locationId, 'haber');
  assert.equal(r.text, 'Merhaba Neon Şehir');
  assert.equal(r.channel, 'Kanal 7');
  // tuval oturumu yokken resim olmaz; haber masası oturumu resim için sayılmaz
  let d = await buildPaintingAttachment(h.db, 'sahip', { ...drawing(), houseId: id }, sanitizeDrawing, t0);
  assert.match(d.error, /resim atölyelerinde/);
  await h.act('sahip', { op: 'netStart', houseId: id, itemId: easel.i, expect: 0 });
  d = await buildPaintingAttachment(h.db, 'sahip', { ...drawing(), houseId: id }, sanitizeDrawing, t0);
  assert.equal(d.drawing.type, 'drawing');
  assert.equal(d.drawing.houseId, id);
  // 30 dk sonra paylaşım kapanır
  d = await buildPaintingAttachment(h.db, 'sahip', { ...drawing(), houseId: id }, sanitizeDrawing, t0 + 40 * 60_000);
  assert.ok(d.error);
});

test('v135 destek: resim ve röportaja altın verilir, bildirim Sixtagram\'a gider (SMS değil)', async () => {
  const h = setup();
  h.S('sixtagramPosts/r1', { uid: 'sahip', attachment: { type: 'drawing', bg: 0, strokes: [] }, expiresAtMs: h.clock.now + 864e5 });
  h.S('sixtagramPosts/r2', { uid: 'sahip', attachment: { type: 'interview', locationId: 'haber' }, expiresAtMs: h.clock.now + 864e5 });
  h.S('sixtagramPosts/x', { uid: 'sahip', attachment: { type: 'gold', amount: 5 }, expiresAtMs: h.clock.now + 864e5 });
  const a = await h.act('ali', { op: 'postTip', postId: 'r1', amount: 500, text: 'Harika' });
  assert.equal(a.amount, 500);
  await h.act('ali', { op: 'postTip', postId: 'r2', amount: 100 });
  await assert.rejects(h.act('ali', { op: 'postTip', postId: 'x', amount: 100 }), /bulunamadı/);
  await assert.rejects(h.act('sahip', { op: 'postTip', postId: 'r1', amount: 100 }), /Kendi resmine/);
  const notes = [...h.db._store.keys()].filter((k) => k.startsWith('users/sahip/sixtagramNotifications/')).map((k) => h.G(k));
  assert.equal(notes.length, 2);
  assert.ok(notes.every((n) => n.type === 'tip'));
  assert.ok(notes.some((n) => n.what === 'resmine' && n.amount === 500 && n.textPreview === 'Harika'));
  assert.equal([...h.db._store.keys()].filter((k) => k.startsWith('users/sahip/messages/')).length, 0);
});

test('v135 takip: takip et / bırak, sayaçlar, listeler, bildirim; engelli takip edemez', async () => {
  const h = setup();
  let r = await h.act('ali', { op: 'sixFollow', targetUid: 'sahip', on: true });
  assert.equal(r.following, true);
  assert.equal(h.G('sixtagramUserLikes/ali').following.sahip.n, 'Sahip');
  assert.equal(h.G('sixtagramUserLikes/sahip').followers.ali.n, 'Ali');
  assert.equal(h.G('sixtagramProfiles/sahip').followerCount, 1);
  assert.equal(h.G('sixtagramProfiles/ali').followingCount, 1);
  assert.equal(h.G('users/sahip/sixtagramNotifications/follow_ali').type, 'follow');
  // ikinci kez takip sayacı artırmaz
  r = await h.act('ali', { op: 'sixFollow', targetUid: 'sahip', on: true });
  assert.equal(r.changed, false);
  assert.equal(h.G('sixtagramProfiles/sahip').followerCount, 1);
  await h.act('ali', { op: 'sixFollow', targetUid: 'sahip', on: false });
  assert.equal(h.G('sixtagramProfiles/sahip').followerCount, 0);
  assert.equal(h.G('sixtagramUserLikes/ali').following.sahip, undefined);
  await assert.rejects(h.act('ali', { op: 'sixFollow', targetUid: 'ali', on: true }), /Geçersiz/);
  h.S('users/engelli', { displayName: 'E' });
  await assert.rejects(h.act('ali', { op: 'sixFollow', targetUid: 'engelli', on: true }), /takip edemezsin/);
});

test('v135 hikâye görüntülenme: görenler listesine eklenir, tekrarlar sayılmaz', async () => {
  const h = setup();
  h.S('sixtagramPosts/s1', { uid: 'sahip', story: true, viewers: [] });
  await h.act('ali', { op: 'storyView', postIds: ['s1', 's1', 'yok'] });
  await h.act('veli', { op: 'storyView', postIds: ['s1'] });
  await h.act('ali', { op: 'storyView', postIds: ['s1'] });
  assert.deepEqual(h.G('sixtagramPosts/s1').viewers.sort(), ['ali', 'veli']);
});

test('v135 hikâye fotoğrafı katmanı: yazı/çizim doğrulanır ve kırpılır', () => {
  const ok = sanitizeOverlay({ texts: [{ t: '  Selam  ', x: 2000, y: -5, c: 3, z: 999, f: 2, b: 2, bc: 14, a: 1, r: 400 }, { t: '', x: 1, y: 1 }], strokes: [{ c: 1, k: 2, w: 500, p: [0, 0, 1000, PHOTO_H] }] });
  assert.deepEqual(ok.overlay.texts, [{ t: 'Selam', x: 1000, y: 0, c: 3, z: 240, f: 2, b: 2, bc: 14, a: 1, r: 180 }]);
  assert.deepEqual(ok.overlay.strokes[0], { c: 1, k: 2, w: 80, p: [0, 0, 1000, PHOTO_H] });
  // ilk sürüm kayıtları (s = boy / kalınlık indeksi) hâlâ geçerli
  const old = sanitizeOverlay({ texts: [{ t: 'Eski', x: 5, y: 5, c: 0, s: 2, b: 1 }], strokes: [{ c: 4, s: 0, p: [1, 1] }] });
  assert.equal(old.overlay.texts[0].z, 96);
  assert.equal(old.overlay.texts[0].b, 1);
  assert.equal(old.overlay.strokes[0].w, 6);
  assert.equal(sanitizeOverlay(null).overlay, null);
  assert.equal(sanitizeOverlay({ texts: [], strokes: [] }).overlay, null);
  assert.ok(sanitizeOverlay({ strokes: [{ c: 99, s: 0, p: [1, 1] }] }).error);
});

test('v135 hikâye fotoğrafı: çekimde imzalanan ek paylaşımda AYNEN kullanılır (sonradan gelen/çıkan değiştirmez)', async () => {
  const h = setup();
  const { houseId: id } = await h.hact('sahip', { op: 'buy', name: 'Foto Evi' });
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [it('sofa3')] });
  h.S('housePresence/sahip', { houseId: id, displayName: 'Sahip', x: 0, z: 0, updatedAt: new Timestamp(h.clock.now) });
  const cam = { px: 0, py: 1.6, pz: 3, dx: 0, dy: -0.2, dz: -1, fov: 58, a: 0.5, cw: 400 };
  const shot = await h.hact('sahip', { op: 'photoShot', houseId: id, people: [{ uid: 'sahip', x: 1, z: 2 }], cam, vert: true });
  assert.equal(shot.att.type, 'housePhoto');
  assert.equal(shot.att.vert, true);
  assert.equal(shot.att.people.length, 1);
  // çekimden sonra biri girer, eşya değişir, çeken odadan çıkar
  h.S('housePresence/ali', { houseId: id, displayName: 'Ali', x: 0, z: 0, updatedAt: new Timestamp(h.clock.now) });
  h.S(`houses/${id}`, { ...h.G(`houses/${id}`), items: [] });
  h.S('housePresence/sahip', { houseId: 'baska', updatedAt: new Timestamp(h.clock.now) });
  h.clock.now += 60_000;
  const att = await h.houses.buildPhotoAttachment('sahip', { houseId: id, shot: shot.shot, sig: shot.sig, overlay: { texts: [{ t: 'Selam', x: 500, y: 300 }] } });
  assert.deepEqual(att.people, shot.att.people);
  assert.deepEqual(att.design, shot.att.design);
  assert.equal(att.overlay.texts[0].t, 'Selam');
  // v136 — gönderi olarak: kare, yazı katmanı yok, aynı kare
  const post = await h.houses.buildPhotoAttachment('sahip', { houseId: id, shot: shot.shot, sig: shot.sig, asPost: true, overlay: { texts: [{ t: 'Yok', x: 1, y: 1 }] } });
  assert.equal(post.sq, true);
  assert.equal(post.overlay, undefined);
  assert.deepEqual(post.people, shot.att.people);
  // imza bozulursa eski yol (odada olmak gerekir)
  await assert.rejects(h.houses.buildPhotoAttachment('sahip', { houseId: id, shot: shot.shot.replace('Foto', 'Fot0'), sig: shot.sig, cam }), /evde olmalısın/);
});
