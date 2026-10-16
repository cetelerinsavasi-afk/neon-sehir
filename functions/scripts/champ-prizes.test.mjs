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
