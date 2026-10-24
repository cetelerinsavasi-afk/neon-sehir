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
  S('footballers/ali', { uid: 'ali', name: 'EskiAli', position: 'FWD', power: 210 });
  S('futbolPlayers/real_ali', { real: true, realUid: 'ali', name: 'EskiAli', teamId: 't1', power: 210 });
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
  assert.equal(h.G('footballers/ali').name, 'YeniAli');
  assert.equal(h.G('futbolPlayers/real_ali').name, 'YeniAli');
  assert.equal(h.G('futbolPlayers/real_ali').power, 210);
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

test('v124: ChatsApp sohbet adı + bekleyen istekler eşitlenir; bekleyen işaret silinir; bozuk belge diğerlerini engellemez; canlı dünya config’ten', async () => {
  const h = setup();
  h.S('users/ali', { ...h.G('users/ali'), nameSyncPending: true });
  h.S('dmChats/ali__veli', { members: ['ali', 'veli'], names: { ali: 'EskiAli', veli: 'Veli' }, lastText: 'selam' });
  h.S('friendRequests/ali_zeki', { fromUid: 'ali', toUid: 'zeki', fromName: 'EskiAli', toName: 'Zeki' });
  h.S('friendRequests/mert_ali', { fromUid: 'mert', toUid: 'ali', fromName: 'Mert', toName: 'EskiAli' });
  // dünya belgesi YOK ama config canlı dünyayı gösteriyor
  h.S('gangSystem/config', { liveWorldId: 'live_x' });
  h.S('gangWorlds/live_x/memberships/ali', { gangId: 'g9' });
  h.S('gangWorlds/live_x/gangs/g9/members/ali', { name: 'EskiAli', rank: 'comez' });
  const r = await h.sync.syncPlayerName('ali');
  assert.equal(r.failed, 0);
  assert.equal(h.G('dmChats/ali__veli').names.ali, 'YeniAli');
  assert.equal(h.G('dmChats/ali__veli').names.veli, 'Veli');
  assert.equal(h.G('dmChats/ali__veli').lastText, 'selam');
  assert.equal(h.G('friendRequests/ali_zeki').fromName, 'YeniAli');
  assert.equal(h.G('friendRequests/mert_ali').toName, 'YeniAli');
  assert.equal(h.G('gangWorlds/live_x/gangs/g9/members/ali').name, 'YeniAli');
  assert.equal(h.G('users/ali').nameSyncPending, undefined, 'işaret silindi');
  // saatlik tekrar: bekleyen yoksa iş yapmaz
  assert.deepEqual(await h.sync.retryPendingNames(), { pending: 0, changed: 0 });
  h.S('users/veli', { displayName: 'VeliYeni', nameSyncPending: true });
  const rr = await h.sync.retryPendingNames();
  assert.equal(rr.pending, 1);
  assert.equal(h.G('friendships/ali').friends.veli.name, 'VeliYeni');
  assert.equal(h.G('dmChats/ali__veli').names.veli, 'VeliYeni');
});
