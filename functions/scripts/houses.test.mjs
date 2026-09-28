// functions/houses.js (v65 3D Ev) için çevrimdışı test.
// Çalıştır: node --test functions/scripts/houses.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';

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
  const clock = { now: Date.UTC(2026, 8, 28, 12) };
  const houses = createHouses({
    db, FieldValue, HttpsError,
    requireAuth: (r) => r.auth.uid,
    onCall: (fn) => fn,
    isAdmin: (uid) => uid === 'boss',
    assertCanSpeak: async () => {},
    now: () => clock.now,
  });
  for (const [uid, name] of [['boss', 'Patron'], ['ali', 'Ali'], ['veli', 'Veli']]) {
    S(`users/${uid}`, { displayName: name, avatar: { skin: '#fff' } });
    S(`usernames/${name.toLocaleLowerCase('tr-TR')}`, { uid });
  }
  const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
  return { db, S, G, clock, act };
}

test('davetsiz oyuncu tadilat görür; admin kendi evine girer', async () => {
  const h = setup();
  assert.equal((await h.act('ali', { op: 'enter' })).status, 'maintenance');
  const r = await h.act('boss', { op: 'enter' });
  assert.equal(r.status, 'ok');
  assert.equal(r.isOwner, true);
  assert.equal(r.houseId, 'boss');
  assert.equal(h.G('housePresence/boss').houseId, 'boss');
  assert.equal(h.G('houses/boss').ownerName, 'Patron');
});

test('kaydetme temizler, sadece admin kaydedebilir', async () => {
  const h = setup();
  await h.act('boss', { op: 'enter' });
  await h.act('boss', {
    op: 'save',
    design: {
      wall: 'tugla',
      floor: 'dama',
      items: [
        { i: 'a1', k: 'sofa3', x: 1.25, z: -2, r: 9, c: 3, o: true, hack: 'x' },
        { i: 'a1', k: 'sofa3', x: 0, z: 0 },
        { i: 'b2', k: 'BAD KEY', x: 0, z: 0 },
        { i: 'c3', k: 'tvwall', x: 99, z: 0 },
      ],
    },
  });
  const d = h.G('houses/boss');
  assert.equal(d.wall, 'tugla');
  assert.equal(d.items.length, 1);
  assert.deepEqual(d.items[0], { i: 'a1', k: 'sofa3', x: 1.25, z: -2, r: 1, c: 3, o: true });
  await assert.rejects(h.act('ali', { op: 'save', design: { items: [] } }), /yöneticiye/);
});

test('isimle davet → davetli admin evine girer; çıkarınca tadilat', async () => {
  const h = setup();
  const inv = await h.act('boss', { op: 'invite', name: 'ali' });
  assert.equal(inv.uid, 'ali');
  assert.deepEqual(h.G('houses/boss').guestUids, ['ali']);
  assert.equal(h.G('houseInvites/ali').houseId, 'boss');
  const r = await h.act('ali', { op: 'enter' });
  assert.equal(r.status, 'ok');
  assert.equal(r.isOwner, false);
  assert.equal(r.houseId, 'boss');
  await assert.rejects(h.act('boss', { op: 'invite', name: 'yokboyle' }), /bulunamadı/);
  await assert.rejects(h.act('ali', { op: 'invite', name: 'veli' }), /yöneticiye/);
  await h.act('boss', { op: 'uninvite', uid: 'ali' });
  assert.deepEqual(h.G('houses/boss').guestUids, []);
  assert.equal(h.G('houseInvites/ali'), undefined);
  assert.equal(h.G('housePresence/ali'), undefined);
  assert.equal((await h.act('ali', { op: 'enter' })).status, 'maintenance');
});

test('sohbet: sadece sahip/davetli, hız sınırı', async () => {
  const h = setup();
  await h.act('boss', { op: 'enter' });
  await h.act('boss', { op: 'invite', uid: 'ali' });
  await h.act('ali', { op: 'enter' });
  await h.act('ali', { op: 'chat', houseId: 'boss', text: '  selam   patron ' });
  const msgs = [...h.db._store.keys()].filter((k) => k.startsWith('houses/boss/chat/'));
  assert.equal(msgs.length, 1);
  assert.equal(h.G(msgs[0]).text, 'selam patron');
  assert.equal(h.G(msgs[0]).name, 'Ali');
  await assert.rejects(h.act('ali', { op: 'chat', houseId: 'boss', text: 'tekrar' }), /yavaş/);
  h.clock.now += 1000;
  await h.act('ali', { op: 'chat', houseId: 'boss', text: 'tekrar' });
  await assert.rejects(h.act('veli', { op: 'chat', houseId: 'boss', text: 'ben de' }), /erişimin yok/);
});
