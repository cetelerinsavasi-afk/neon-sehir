// v67 — Başarılar: tek seferlik ödül, SMS, durum taraması.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createAchievements } from '../achievements.js';
import { ACHIEVEMENTS } from '../achievementsData.js';

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const sms = (uid) => [...db._store.keys()].filter((k) => k.startsWith(`users/${uid}/messages/`)).length;
  return { db, S, G, sms, a: createAchievements({ db, FieldValue }) };
}

test('10 başarı, ödüller', () => {
  assert.equal(ACHIEVEMENTS.length, 10);
  assert.deepEqual(ACHIEVEMENTS.map((x) => x.reward), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('başarı bir kez verilir; zümrüt + SMS', async () => {
  const { S, G, sms, a } = setup();
  S('users/u1', { emerald: 3 });
  assert.equal(await a.grant('u1', 'ligSampiyonu'), true);
  assert.equal(await a.grant('u1', 'ligSampiyonu'), false);
  assert.equal(G('users/u1').emerald, 8);
  assert.ok(G('users/u1').achievements.ligSampiyonu > 0);
  assert.equal(sms('u1'), 1);
  assert.equal(await a.grant('yok', 'imam'), false, 'olmayan oyuncu');
  assert.equal(await a.grant('u1', 'uydurma'), false);
});

test('durum taraması: imam, mafya babası, istihbarat başkanı', async () => {
  const { S, G, a } = setup();
  ['u1', 'u2', 'u3'].forEach((u) => S(`users/${u}`, { emerald: 0 }));
  S('imamState/current', { uid: 'u1' });
  S('gangSystem/config', { liveOpen: true, liveWorldId: 'w' });
  S('gangWorlds/w/memberships/u2', { gangId: 'g', gangRank: 'baba' });
  S('gangWorlds/w/memberships/u3', { intelRosterId: 'r1' });
  S('gangWorlds/w/intelRoster/r1', { rank: 'baskan' });
  S('gangWorlds/w/intelRosterLinks/r1', { actorId: 'u3' });
  await a.sweep();
  assert.equal(G('users/u1').emerald, 1);
  assert.equal(G('users/u2').emerald, 4);
  assert.equal(G('users/u3').emerald, 4);
  assert.equal(G('users/u3').achievementRewards.istihbaratBaskani, 4);
  await a.syncUser('u3');
  assert.equal(G('users/u3').emerald, 4, 'tekrar ödül yok');
});

test('v76: eski başarıların farkı tek seferlik yüklenir (toplu tarama + oyuncu bazında)', async () => {
  const { S, G, sms, a } = setup();
  // u1: eski kodla 3 başarı almış (achievementRewards yok) → fark: bankaSoy +1, mafyaBabasi +2; imam farkı 0
  S('users/u1', { emerald: 10, achievements: { imam: 1, bankaSoy: 2, mafyaBabasi: 3 } });
  // u2: yeni kodla almış → fark yok
  S('users/u2', { emerald: 4, achievements: { bankaSoy: 5 }, achievementRewards: { bankaSoy: 2 } });
  // u3: başarı yok
  S('users/u3', { emerald: 1 });
  const r = await a.topupAll();
  assert.deepEqual(r, { users: 1, emerald: 3 });
  assert.equal(G('users/u1').emerald, 13);
  assert.deepEqual(G('users/u1').achievementRewards, { imam: 1, bankaSoy: 2, mafyaBabasi: 4 });
  assert.equal(sms('u1'), 1, 'tek SMS');
  assert.equal(G('users/u2').emerald, 4);
  assert.equal(G('users/u3').emerald, 1);
  // ikinci kez: bayrak var → atlanır; oyuncu bazında da tekrar verilmez
  assert.deepEqual(await a.topupAll(), { skipped: true });
  assert.equal(await a.topupUser('u1'), 0);
  assert.equal(G('users/u1').emerald, 13);
  // bayraktan sonra eski kodla başarı almış biri: Başarılar ekranını açınca (syncUser) alır
  S('users/u4', { emerald: 0, achievements: { superKupa: 7 } });
  await a.syncUser('u4');
  assert.equal(G('users/u4').emerald, 1);
});
