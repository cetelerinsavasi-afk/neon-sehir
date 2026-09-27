// functions/social.js (v60 Arkadaşlık + özel sohbet) için çevrimdışı test.
// Çalıştır: node --test functions/scripts/social.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createModeration } from '../moderation.js';
import { createSocial, SOCIAL, chatIdOf } from '../social.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const keys = (prefix) => [...db._store.keys()].filter((k) => k.startsWith(prefix));
  const clock = { now: Date.UTC(2026, 8, 27, 12) };
  let social = null;
  const base = { db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, now: () => clock.now, dateKey: () => '2026-09-27' };
  const mod = createModeration({ ...base, onBlocked: (a, b) => social.onBlocked(a, b) });
  social = createSocial({ ...base, assertCanSpeak: mod.assertCanSpeak, isBlockedBy: mod.isBlockedBy });
  for (const [uid, name] of [['ali', 'Ali'], ['veli', 'Veli'], ['ayse', 'Ayşe'], ['can', 'Can']]) S(`users/${uid}`, { displayName: name, avatar: { skin: '#fff' } });
  const act = (uid, action, payload = {}) => social.socialAction({ auth: { uid }, data: { action, payload } });
  const friends = (uid) => Object.keys(G(`friendships/${uid}`)?.friends || {}).sort();
  const block = (uid, targetUid) => mod.blockUser({ auth: { uid }, data: { targetUid } });
  return { db, S, G, keys, clock, social, act, friends, block };
}
async function befriend(h, a, b) {
  await h.act(a, 'sendFriendRequest', { targetUid: b });
  await h.act(b, 'respondFriendRequest', { fromUid: a, accept: true });
}

test('istek → kabul: iki taraf arkadaş olur, istek silinir; tekrar istek/kendine istek yok', async () => {
  const h = setup();
  const r = await h.act('ali', 'sendFriendRequest', { targetUid: 'veli' });
  assert.equal(r.result, 'sent');
  const req = h.G('friendRequests/ali_veli');
  assert.equal(req.fromName, 'Ali');
  assert.equal(req.expiresAtMs - req.createdAtMs, 48 * HOUR);
  await assert.rejects(h.act('ali', 'sendFriendRequest', { targetUid: 'veli' }), /zaten gönderildi/);
  await assert.rejects(h.act('ali', 'sendFriendRequest', { targetUid: 'ali' }), /Geçersiz/);
  await h.act('veli', 'respondFriendRequest', { fromUid: 'ali', accept: true });
  assert.deepEqual(h.friends('ali'), ['veli']);
  assert.deepEqual(h.friends('veli'), ['ali']);
  assert.equal(h.G('friendships/ali').friends.veli.name, 'Veli');
  assert.equal(h.G('friendRequests/ali_veli'), undefined);
  await assert.rejects(h.act('ali', 'sendFriendRequest', { targetUid: 'veli' }), /Zaten arkadaşsınız/);
});

test('karşılıklı istek otomatik kabul; red ve geri çekme isteği siler', async () => {
  const h = setup();
  await h.act('ali', 'sendFriendRequest', { targetUid: 'ayse' });
  const r = await h.act('ayse', 'sendFriendRequest', { targetUid: 'ali' });
  assert.equal(r.result, 'accepted');
  assert.deepEqual(h.friends('ayse'), ['ali']);
  await h.act('can', 'sendFriendRequest', { targetUid: 'veli' });
  await h.act('veli', 'respondFriendRequest', { fromUid: 'can', accept: false });
  assert.equal(h.G('friendRequests/can_veli'), undefined);
  assert.deepEqual(h.friends('veli'), []);
  await h.act('can', 'sendFriendRequest', { targetUid: 'ali' });
  await h.act('can', 'cancelFriendRequest', { targetUid: 'ali' });
  assert.equal(h.G('friendRequests/can_ali'), undefined);
});

test('48 saat: süresi dolan istek kabul edilemez ve temizlikte silinir', async () => {
  const h = setup();
  await h.act('ali', 'sendFriendRequest', { targetUid: 'veli' });
  h.clock.now += 48 * HOUR + 1000;
  await assert.rejects(h.act('veli', 'respondFriendRequest', { fromUid: 'ali', accept: true }), /süresi dolmuş/);
  const c = await h.social.cleanup();
  assert.equal(c.requests, 1);
  assert.equal(h.G('friendRequests/ali_veli'), undefined);
  // süresi dolmuş istek yeni istek göndermeyi engellemez
  await h.act('ali', 'sendFriendRequest', { targetUid: 'veli' });
  assert.ok(h.G('friendRequests/ali_veli'));
});

test('mesaj: yalnızca arkadaşa; sohbet belgesi, okunmamış sayısı, okundu', async () => {
  const h = setup();
  await assert.rejects(h.act('ali', 'sendDm', { targetUid: 'veli', text: 'selam' }), /Yalnızca arkadaşlarına/);
  await befriend(h, 'ali', 'veli');
  await h.act('ali', 'sendDm', { targetUid: 'veli', text: 'selam' });
  h.clock.now += 1000;
  await h.act('ali', 'sendDm', { targetUid: 'veli', text: 'nasılsın' });
  const id = chatIdOf('ali', 'veli');
  const chat = h.G(`dmChats/${id}`);
  assert.deepEqual(chat.members, ['ali', 'veli']);
  assert.equal(chat.lastText, 'nasılsın');
  assert.equal(chat.lastSenderUid, 'ali');
  assert.equal(chat.unread.veli, 2);
  assert.equal(chat.unread.ali, 0);
  assert.equal(chat.names.veli, 'Veli');
  assert.equal(h.keys(`dmChats/${id}/dmMessages/`).length, 2);
  await h.act('veli', 'markDmRead', { targetUid: 'ali' });
  assert.equal(h.G(`dmChats/${id}`).unread.veli, 0);
  h.clock.now += 1000;
  await h.act('veli', 'sendDm', { targetUid: 'ali', text: 'iyi' });
  assert.equal(h.G(`dmChats/${id}`).unread.ali, 1);
  // hız sınırı
  await assert.rejects(h.act('veli', 'sendDm', { targetUid: 'ali', text: 'hızlı' }), /yavaş/);
  // boş / uzun
  h.clock.now += 1000;
  await assert.rejects(h.act('veli', 'sendDm', { targetUid: 'ali', text: '   ' }), /boş/);
  await assert.rejects(h.act('veli', 'sendDm', { targetUid: 'ali', text: 'x'.repeat(SOCIAL.MESSAGE_MAX + 1) }), /en fazla/);
});

test('susturulan oyuncu özel mesaj gönderemez', async () => {
  const h = setup();
  await befriend(h, 'ali', 'veli');
  h.S('mutes/ali', { untilMs: h.clock.now + DAY, level: 'mute' });
  await assert.rejects(h.act('ali', 'sendDm', { targetUid: 'veli', text: 'selam' }), /yazı yazamazsın/);
});

test('arkadaşlıktan çıkarma: iki taraftan da düşer, sohbet ve mesajlar silinir', async () => {
  const h = setup();
  await befriend(h, 'ali', 'veli');
  await h.act('ali', 'sendDm', { targetUid: 'veli', text: 'selam' });
  const id = chatIdOf('ali', 'veli');
  await h.act('veli', 'removeFriend', { targetUid: 'ali' });
  assert.deepEqual(h.friends('ali'), []);
  assert.deepEqual(h.friends('veli'), []);
  assert.equal(h.G(`dmChats/${id}`), undefined);
  assert.equal(h.keys(`dmChats/${id}/`).length, 0);
  await assert.rejects(h.act('ali', 'sendDm', { targetUid: 'veli', text: 'hey' }), /Yalnızca arkadaşlarına/);
});

test('engelleme: arkadaşlık, sohbet ve bekleyen istek silinir; engellenen istek gönderemez', async () => {
  const h = setup();
  await befriend(h, 'ali', 'veli');
  await h.act('ali', 'sendDm', { targetUid: 'veli', text: 'selam' });
  await h.act('can', 'sendFriendRequest', { targetUid: 'ali' });
  await h.block('ali', 'veli');
  await h.block('ali', 'can');
  assert.deepEqual(h.friends('ali'), []);
  assert.deepEqual(h.friends('veli'), []);
  assert.equal(h.G(`dmChats/${chatIdOf('ali', 'veli')}`), undefined);
  assert.equal(h.G('friendRequests/can_ali'), undefined);
  await assert.rejects(h.act('veli', 'sendFriendRequest', { targetUid: 'ali' }), /gönderilemiyor/);
  await assert.rejects(h.act('ali', 'sendFriendRequest', { targetUid: 'veli' }), /engellemişsin/);
});

test('7 gün: eski mesajlar gönderimde budanır; sessiz sohbet temizlikte silinir', async () => {
  const h = setup();
  await befriend(h, 'ali', 'veli');
  await h.act('ali', 'sendDm', { targetUid: 'veli', text: 'eski' });
  const id = chatIdOf('ali', 'veli');
  h.clock.now += 7 * DAY + 1000;
  await h.act('veli', 'sendDm', { targetUid: 'ali', text: 'yeni' });
  const texts = h.keys(`dmChats/${id}/dmMessages/`).map((k) => h.G(k).text);
  assert.deepEqual(texts, ['yeni']);
  h.clock.now += 7 * DAY + 1000;
  const c = await h.social.cleanup();
  assert.equal(c.chats, 1);
  assert.equal(h.G(`dmChats/${id}`), undefined);
  assert.equal(h.keys(`dmChats/${id}/`).length, 0);
  assert.deepEqual(h.friends('ali'), ['veli'], 'arkadaşlık kalır');
});

test('günlük istek sınırı ve arkadaş sınırı', async () => {
  const h = setup();
  for (let i = 0; i < SOCIAL.REQUESTS_PER_DAY; i++) h.S(`users/x${i}`, { displayName: `X${i}` });
  for (let i = 0; i < SOCIAL.REQUESTS_PER_DAY; i++) await h.act('can', 'sendFriendRequest', { targetUid: `x${i}` });
  await assert.rejects(h.act('can', 'sendFriendRequest', { targetUid: 'ali' }), /yeterince/);
  const full = {};
  for (let i = 0; i < SOCIAL.MAX_FRIENDS; i++) full[`f${i}`] = { name: 'F', sinceMs: 1 };
  h.S('friendships/ayse', { friends: full });
  await assert.rejects(h.act('ayse', 'sendFriendRequest', { targetUid: 'ali' }), /En fazla/);
  await h.act('ali', 'sendFriendRequest', { targetUid: 'ayse' });
  await assert.rejects(h.act('ayse', 'respondFriendRequest', { fromUid: 'ali', accept: true }), /En fazla/);
});

test('özel mesaj bildirme: yalnızca sohbet üyesi', async () => {
  const h = setup();
  const mod = createModeration({ db: h.db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, now: () => h.clock.now, dateKey: () => '2026-09-27' });
  await befriend(h, 'ali', 'veli');
  const { id } = await h.act('ali', 'sendDm', { targetUid: 'veli', text: 'kötü söz' });
  const path = `dmChats/${chatIdOf('ali', 'veli')}/dmMessages/${id}`;
  const report = (uid) => mod.reportContent({ auth: { uid }, data: { targetType: 'dmMessage', targetPath: path, reason: 'hakaret' } });
  await assert.rejects(report('can'), /bildiremezsin/);
  await report('veli');
  const r = h.keys('reports/').map((k) => h.G(k))[0];
  assert.equal(r.targetUid, 'ali');
  assert.equal(r.textSnapshot, 'kötü söz');
});
