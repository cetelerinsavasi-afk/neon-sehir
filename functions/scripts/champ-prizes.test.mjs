// v96 — şampiyona ilk 3 ödülü
import test from 'node:test';
import assert from 'node:assert/strict';
import { championshipPrize, mergeChampionshipTop, championshipPodium } from '../championshipPrizes.js';

test('ödüller: 1.000.000 → 250.000 / 100.000 / 50.000', () => {
  assert.equal(championshipPrize(1_000_000, 1), 250_000);
  assert.equal(championshipPrize(1_000_000, 2), 100_000);
  assert.equal(championshipPrize(1_000_000, 3), 50_000);
  assert.equal(championshipPrize(1_000_000, 4), 0);
});

test('sıralama: süreye göre, oyuncu başına en iyi süre, eşitlikte önce bitiren', () => {
  let top = [];
  top = mergeChampionshipTop(top, { uid: 'a', timeMs: 30000, at: 1 });
  top = mergeChampionshipTop(top, { uid: 'b', timeMs: 28000, at: 2 });
  top = mergeChampionshipTop(top, { uid: 'c', timeMs: 28000, at: 3 });
  top = mergeChampionshipTop(top, { uid: 'a', timeMs: 31000, at: 4 }); // kötü süre yok sayılır
  assert.deepEqual(top.map((e) => e.uid), ['b', 'c', 'a']);
  top = mergeChampionshipTop(top, { uid: 'a', timeMs: 20000, at: 5 }); // iyileşme
  assert.deepEqual(top.map((e) => e.uid), ['a', 'b', 'c']);
  for (let i = 0; i < 20; i++) top = mergeChampionshipTop(top, { uid: `x${i}`, timeMs: 40000 + i, at: 10 + i });
  assert.equal(top.length, 10);
});

test('podyum: ilk 3 + ödül; eski kayıt (top yok) → lider 1.', () => {
  const doc = { top: [{ uid: 'a', name: 'A', timeMs: 1 }, { uid: 'b', name: 'B', timeMs: 2 }, { uid: 'c', name: 'C', timeMs: 3 }, { uid: 'd', name: 'D', timeMs: 4 }] };
  const p = championshipPodium(doc, 400000);
  assert.deepEqual(p.map((x) => [x.uid, x.place, x.reward]), [['a', 1, 100000], ['b', 2, 40000], ['c', 3, 20000]]);
  const old = championshipPodium({ leaderUid: 'z', leaderName: 'Z', leaderTimeMs: 9 }, 100000);
  assert.deepEqual(old.map((x) => [x.uid, x.place, x.reward]), [['z', 1, 25000]]);
  assert.deepEqual(championshipPodium(null, 1), []);
});

// ---------------------------------------------------------------------------
// v128 — süreye göre ödül + geçiş
// ---------------------------------------------------------------------------
import { championshipTimePrize, rankChampionshipBoard, CHAMP_V2_START_DAY } from '../championshipPrizes.js';
import { createChampionshipV2 } from '../championshipV2.js';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { VEHICLE_CATALOG } from '../catalogData.js';

test('v128 ödül tablosu (süre → altın)', () => {
  const s = (sec) => championshipTimePrize(Math.round(sec * 1000));
  assert.equal(s(60), 1000);
  assert.equal(s(60.001), 0, '1 dakikanın üstü ödülsüz');
  assert.equal(s(57), 1000);
  assert.equal(s(55), 1000, 'sınır: tam 55 sn üst kademede');
  assert.equal(s(54.999), 2000);
  assert.equal(s(50), 2000);
  assert.equal(s(47), 4000);
  assert.equal(s(42), 7000);
  assert.equal(s(38), 10000);
  assert.equal(s(34), 20000);
  assert.equal(s(31), 30000);
  assert.equal(s(29.5), 40000);
  assert.equal(s(28.5), 50000);
  assert.equal(s(27.5), 100000);
  assert.equal(s(26.5), 150000);
  assert.equal(s(25.5), 250000);
  assert.equal(s(22), 500000);
  assert.equal(s(18), 500000);
  assert.equal(championshipTimePrize(0), 0);
  assert.equal(championshipTimePrize(null), 0);
});

test('v128 günün listesi sıralaması', () => {
  const r = rankChampionshipBoard({ a: { timeMs: 40000, at: 2 }, b: { timeMs: 35000, at: 3 }, c: { timeMs: 40000, at: 1 } });
  assert.deepEqual(r.map((e) => e.uid), ['b', 'c', 'a']);
});

function champSetup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const split = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 });
  const grants = [];
  const champ = createChampionshipV2({ db, FieldValue, splitIncomeForDebt: split, goldTag: (x) => x, catalog: VEHICLE_CATALOG, grantAchievement: async (u, id) => grants.push([u, id]) });
  return { db, S, G, champ, grants };
}
const legacyRoom = (uid, vehicleId, catalogId, timeMs, day, extra = {}) => ({
  engine: 'ta', status: 'finished', isChampionship: true, creatorUid: uid, participantUids: [uid],
  championshipCatalogId: catalogId, championshipDateKey: day, championshipResult: timeMs ? 'completed' : 'dnf', championshipTimeMs: timeMs || null,
  players: { [uid]: { displayName: uid.toUpperCase(), vehicleId, vehicleModel: 'Araç', catalogId, level: 1 } }, ...extra,
});

test('v128 geçiş: bugünkü eski yarışlar süresine göre ödenir, listeye girer, araç işaretlenir, tekrar çalıştırmak çift ödemez', async () => {
  const h = champSetup();
  const day = CHAMP_V2_START_DAY;
  h.S('users/ali', { gold: 0 });
  h.S('users/veli', { gold: 0 });
  h.S('vehicles/va1', { ownerId: 'ali', catalogId: 3 });
  h.S('vehicles/va2', { ownerId: 'ali', catalogId: 3 });
  h.S('vehicles/vv1', { ownerId: 'veli', catalogId: 10 });
  h.S('raceRooms/r1', legacyRoom('ali', 'va1', 3, 47000, day));
  h.S('raceRooms/r2', legacyRoom('veli', 'vv1', 10, 31000, day));
  h.S('raceRooms/r3', legacyRoom('ali', 'va2', 3, null, day)); // yarım kaldı
  h.S('raceRooms/r4', legacyRoom('ali', 'va2', 3, 20000, day, { champV: 2, champPrizePaid: true })); // yeni sistem — dokunulmaz
  h.S(`championshipDaily/3_${day}`, { catalogId: 3, dateKey: day, top: [{ uid: 'ali', timeMs: 47000 }] });
  const r = await h.champ.migrateLegacyDay(day, { todayKey: day });
  assert.equal(r.paid, 2);
  assert.equal(h.G('users/ali').gold, 4000);
  assert.equal(h.G('users/veli').gold, 30000);
  assert.equal(h.G(`championshipBoard/${day}`).entries.veli.timeMs, 31000);
  assert.equal(h.G(`championshipBoard/${day}`).legacyOwned, true);
  assert.equal(h.G('championshipBoard/allTime').top[0].uid, 'veli');
  assert.equal(h.G('vehicles/va1').champDay, day);
  assert.equal(h.G('vehicles/va2').champDay, day, 'yarım kalan yarışın aracı da kullanılmış sayılır');
  assert.equal(h.G(`championshipDaily/3_${day}`).finalized, true, 'eski gece ödemesi yapılmaz');
  assert.equal(await h.champ.ownsLegacyDay(day), true);
  await h.champ.migrateLegacyDay(day, { todayKey: day });
  assert.equal(h.G('users/ali').gold, 4000, 'çift ödeme yok');
  assert.equal(h.G(`championshipBoard/${day}`).runs, 2);
  // gece: liste kesinleşir. v130: Üstün Cabrio ile birinci olmak yetmez — 250.000+ ödül gerekir (31 sn → 30.000)
  await h.champ.finalizeDay(day);
  assert.equal(h.G(`championshipBoard/${day}`).winnerUid, 'veli');
  assert.deepEqual(h.grants, []);
});

test('v130 Üstün Cabrio başarısı: Cabrio ile 250.000 / 500.000 ödül (26 sn altı) → başarı; başka araç ya da yavaş süre → yok', async () => {
  const h = champSetup();
  const day = CHAMP_V2_START_DAY;
  for (const u of ['ali', 'veli', 'can', 'ece']) h.S(`users/${u}`, { gold: 0 });
  h.S('raceRooms/c1', legacyRoom('ali', 'x1', 10, 25500, day)); // 250.000 → başarı
  h.S('raceRooms/c2', legacyRoom('veli', 'x2', 10, 24000, day)); // 500.000 → başarı
  h.S('raceRooms/c3', legacyRoom('can', 'x3', 10, 26500, day)); // 200.000 → yok
  h.S('raceRooms/c4', legacyRoom('ece', 'x4', 9, 24000, day)); // başka araç → yok
  await h.champ.migrateLegacyDay(day, { todayKey: day });
  assert.deepEqual(h.grants.map((g) => g[0]).sort(), ['ali', 'veli']);
  assert.ok(h.grants.every((g) => g[1] === 'cabrioSampiyon'));
  // gece yedeği aynı kişilere (başarı verme tekrarı zararsız)
  h.grants.length = 0;
  await h.champ.finalizeDay(day);
  assert.deepEqual(h.grants.map((g) => g[0]).sort(), ['ali', 'veli']);
});

test('v128 geçiş: eski sistemle gece ödenmiş güne dokunmaz; pencere dışı gün atlanır', async () => {
  const h = champSetup();
  const day = CHAMP_V2_START_DAY;
  h.S('users/ali', { gold: 0 });
  h.S('raceRooms/r1', legacyRoom('ali', 'va1', 3, 47000, day));
  h.S(`championshipDaily/3_${day}`, { catalogId: 3, dateKey: day, finalized: true, winners: [{ uid: 'ali' }] });
  const r = await h.champ.migrateLegacyDay(day, { todayKey: '2026-10-26' });
  assert.equal(r.skipped, 'old-paid');
  assert.equal(h.G('users/ali').gold, 0);
  assert.equal(await h.champ.ownsLegacyDay(day), false);
  assert.equal((await h.champ.migrateLegacyDay('2026-10-01')).skipped, 'window');
  assert.equal((await h.champ.migrateLegacyDay('2027-01-01')).skipped, 'window');
});
