// functions/playerCard.js (v53 Oyuncu Kartı) için çevrimdışı test.
// Çalıştır: node --test functions/scripts/player-card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore } from '../gang/test/fakeFirestore.js';
import { createPlayerCard } from '../playerCard.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function setup({ live = true } = {}) {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const pc = createPlayerCard({ db, HttpsError, requireAuth: (r) => r.auth.uid, onCall: (fn) => fn, factoryDisplayName: (f) => f?.name || `${f?.ownerName || 'Oyuncu'}'in Fabrikası` });
  S('gangSystem/config', { liveOpen: live, liveWorldId: 'w1' });
  S('users/boss', { displayName: 'Boss', avatar: { skin: '#fff' }, gold: 999999, debtToState: 5, suspicion: 40, profession: 'polis' });
  S('users/boss/private/meta', { isPolice: true });
  S('gangWorlds/w1/memberships/boss', { gangId: 'g1', gangRank: 'baba', intelRosterId: 'r1', intelRank: 'baskan' });
  S('gangWorlds/w1/gangs/g1', { name: 'Kurtlar', logo: { emoji: '🐺' }, status: 'active' });
  S('gangWorlds/w1/intelRoster/r1', { codeName: 'KARTAL' });
  S('factories/boss', { ownerName: 'Boss', name: 'Demir Çelik' });
  S('futbolTeams/t1', { name: 'Neon FK', ownerUid: 'boss', logo: { shape: 'shield' } });
  S('futbolTeams/t2', { name: 'Gece SK', ownerUid: 'x', managerUid: 'boss' });
  S('sixtagramProfiles/boss', { totalLikes: 42 });
  S('users/spy', { displayName: 'Casus' });
  S('gangWorlds/w1/memberships/spy', { gangId: null, intelRosterId: 'r2', intelRank: 'ajan' });
  S('users/plain', { displayName: 'Sade' });
  S('factories/plain2', { ownerName: 'Sade2' });
  return { card: (viewer, uid) => pc._impl.getPlayerCardImpl(viewer, { uid }) };
}

test('kart: avatar, çete (ad+logo+rütbe), fabrika, sahibi/menajeri olduğu takımlar, beğeni', async () => {
  const c = await setup().card('me', 'boss');
  assert.equal(c.name, 'Boss');
  assert.deepEqual(c.avatar, { skin: '#fff' });
  assert.deepEqual(c.gang, { name: 'Kurtlar', logo: { emoji: '🐺' }, rank: 'baba', rankLabel: 'Mafya Babası' });
  assert.deepEqual(c.factory, { name: 'Demir Çelik' });
  assert.deepEqual(c.teams.map((t) => [t.name, t.role]), [['Neon FK', 'owner'], ['Gece SK', 'manager']]);
  assert.equal(c.sixtagramLikes, 42);
  assert.equal(c.isSelf, false);
});

test('gizlilik: İstihbarat, polislik, altın, borç, şüphe, meslek asla dönülmez', async () => {
  const c = await setup().card('me', 'boss');
  const json = JSON.stringify(c);
  for (const bad of ['intel', 'KARTAL', 'baskan', 'isPolice', 'polis', 'gold', '999999', 'debt', 'suspicion', 'profession']) assert.ok(!json.includes(bad), bad);
});

test('sadece İstihbarattaysa çete boş; hiçbir şeyi olmayan oyuncu; canlı dünya kapalı', async () => {
  const h = setup();
  const spy = await h.card('me', 'spy');
  assert.equal(spy.gang, null);
  assert.ok(!JSON.stringify(spy).includes('ajan'));
  const p = await h.card('plain', 'plain');
  assert.deepEqual([p.gang, p.factory, p.teams, p.sixtagramLikes, p.isSelf], [null, null, [], 0, true]);
  const off = await setup({ live: false }).card('me', 'boss');
  assert.equal(off.gang, null);
});

test('hatalar: geçersiz / olmayan oyuncu', async () => {
  const h = setup();
  await assert.rejects(h.card('me', '../x'), /Geçersiz/);
  await assert.rejects(h.card('me', 'nobody'), /bulunamadı/);
});
