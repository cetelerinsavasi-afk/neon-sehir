// v169 — karargahta Baba / yetkili botu düzenleyebilir (eskiden "Bu ev senin değil" hatası)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, Timestamp } from '../gang/test/fakeFirestore.js';
import { createHouses } from '../houses.js';
import { BOT_ITEM_KEY } from '../botData.js';
class HttpsError extends Error { constructor(c, m) { super(m); this.code = c; } }
test('v169: karargah Babası / yetkilisi botu düzenler, üye düzenleyemez', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const houses = createHouses({ db, FieldValue, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, isAdmin: () => false, assertCanSpeak: async () => {}, isFriend: async () => true, now: () => Date.UTC(2026, 10, 8, 12) });
  const W = 'gangWorlds/w1';
  S('gangSystem/config', { liveWorldId: 'w1', liveOpen: true });
  S(`${W}/gangs/g1`, { name: 'K', status: 'active', babaId: 'zengin' });
  for (const [u, r, y] of [['zengin', 'baba', false], ['ali', 'comez', false], ['veli', 'tetikci', true]]) {
    S(`${W}/memberships/${u}`, { gangId: 'g1' });
    S(`${W}/gangs/g1/members/${u}`, { rank: r, name: u, ...(y ? { hqYetki: true } : {}) });
    S(`users/${u}`, { displayName: u, gold: 1 });
  }
  S('houses/hq_g1', { ownerUid: 'gang_g1', kind: 'karargah', hq: { gangId: 'g1', worldId: 'w1' }, items: [{ i: 'b1', k: BOT_ITEM_KEY, x: 0, z: 0, r: 0, c: 0, p: 1 }] });
  const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
  const r = await act('zengin', { op: 'botSet', houseId: 'hq_g1', i: 'b1', cfg: { n: 'Bodyguard', l: ['Merhaba'] } });
  assert.equal(r.ok, true);
  assert.equal(G('houses/hq_g1').bots.b1.n, 'Bodyguard');
  assert.equal((await act('veli', { op: 'botSet', houseId: 'hq_g1', i: 'b1', cfg: { n: 'Koruma' } })).ok, true);
  await assert.rejects(act('ali', { op: 'botSet', houseId: 'hq_g1', i: 'b1', cfg: { n: 'X' } }), /yetkin yok/);
  await assert.rejects(act('yabanci', { op: 'botSet', houseId: 'hq_g1', i: 'b1', cfg: { n: 'X' } }), /yetkin yok/);
});
