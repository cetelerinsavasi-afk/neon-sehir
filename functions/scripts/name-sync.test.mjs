// v86.1 — functions/nameSync.js (oyuncu adı eşitleme) çevrimdışı testi
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createNameSync } from '../nameSync.js';

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  S('users/ali', { displayName: 'YeniAli', employment: { factoryId: 'veli', machineId: 'm1' }, nameChangedAtMs: Date.now() });
  S('users/veli', { displayName: 'Veli' });
  S('imamState/current', { uid: 'ali', displayName: 'EskiAli' });
  S('gangWorlds/main', { lastTickDateKey: '2026-10-10' });
  S('gangWorlds/main/memberships/ali', { gangId: 'g1' });
  S('gangWorlds/main/gangs/g1', { status: 'active', babaId: 'ali', babaName: 'EskiAli', name: 'Kartallar' });
  S('gangWorlds/main/gangs/g1/members/ali', { name: 'EskiAli', rank: 'baba' });
  S('gangWorlds/main/gangs/g1/members/veli', { name: 'Veli', rank: 'comez' });
  S('gangWorlds/main/gangs/g1/public/roster', { members: { ali: { name: 'EskiAli', rank: 'baba' }, veli: { name: 'Veli' } } });
  S('houses/h1', { ownerUid: 'ali', ownerName: 'EskiAli', name: 'Bar' });
  S('factories/ali', { ownerName: 'EskiAli' });
  S('factories/veli', { ownerName: 'Veli' });
  S('factories/veli/machines/m1', { workerId: 'ali', workerName: 'EskiAli' });
  S('sixtagramProfiles/ali', { displayName: 'EskiAli' });
  S('friendships/ali', { friends: { veli: { name: 'Veli' } } });
  S('friendships/veli', { friends: { ali: { name: 'EskiAli', sinceMs: 1 } } });
  return { db, S, G, sync: createNameSync({ db, FieldValue }) };
}

test('ad değişince tüm kopyalar yeni adı alır, başka alanlara dokunulmaz', async () => {
  const h = setup();
  const r = await h.sync.syncPlayerName('ali');
  assert.ok(r.changed >= 8);
  assert.equal(h.G('imamState/current').displayName, 'YeniAli');
  assert.equal(h.G('gangWorlds/main/gangs/g1').babaName, 'YeniAli');
  assert.equal(h.G('gangWorlds/main/gangs/g1').name, 'Kartallar');
  assert.equal(h.G('gangWorlds/main/gangs/g1/members/ali').name, 'YeniAli');
  assert.equal(h.G('gangWorlds/main/gangs/g1/members/ali').rank, 'baba');
  assert.equal(h.G('gangWorlds/main/gangs/g1/public/roster').members.ali.name, 'YeniAli');
  assert.equal(h.G('gangWorlds/main/gangs/g1/public/roster').members.ali.rank, 'baba');
  assert.equal(h.G('houses/h1').ownerName, 'YeniAli');
  assert.equal(h.G('factories/ali').ownerName, 'YeniAli');
  assert.equal(h.G('factories/veli/machines/m1').workerName, 'YeniAli');
  assert.equal(h.G('sixtagramProfiles/ali').displayName, 'YeniAli');
  assert.equal(h.G('friendships/veli').friends.ali.name, 'YeniAli');
  assert.equal(h.G('friendships/veli').friends.ali.sinceMs, 1);
  const again = await h.sync.syncPlayerName('ali');
  assert.equal(again.changed, 0, 'ikinci kez yazacak bir şey yok');
});

test('haftalık tarama eski adda kalan kopyaları düzeltir', async () => {
  const h = setup();
  h.S('users/veli', { displayName: 'VeliYeni' });
  const r = await h.sync.sweepNames();
  assert.ok(r.changed >= 6, JSON.stringify(r));
  assert.equal(h.G('gangWorlds/main/gangs/g1/members/veli').name, 'VeliYeni');
  assert.equal(h.G('gangWorlds/main/gangs/g1/public/roster').members.veli.name, 'VeliYeni');
  assert.equal(h.G('factories/veli').ownerName, 'VeliYeni');
  assert.equal(h.G('imamState/current').displayName, 'YeniAli');
  assert.equal(h.G('houses/h1').ownerName, 'YeniAli');
});
