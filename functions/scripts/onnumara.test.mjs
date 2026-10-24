// v93 — On Numara eşzamanlı tur (functions/onNumara.js). Çalıştır: node --test functions/scripts/onnumara.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulAct, simulAutoStand, simulDeal, simulState, ONN_TURN_MS, ONN_GRACE_MS } from '../onNumara.js';

const T0 = 1_000_000;
function deal() {
  const hands = { a: { cards: [2, 3], status: 'playing' }, b: { cards: [4, 1], status: 'playing' }, c: { cards: [5, 5], status: 'stand' } };
  const participants = ['a', 'b', 'c'];
  return { phase: 'playing', participants, hands: simulDeal(hands, participants, T0) };
}
const apply = (round, hands) => ({ ...round, hands, phase: simulState(round, hands).phase });

test('dağıtım: oynayan herkesin süresi aynı anda başlar; 10 yapan beklemez', () => {
  const r = deal();
  assert.equal(r.hands.a.deadlineMs, T0 + ONN_TURN_MS);
  assert.equal(r.hands.b.deadlineMs, T0 + ONN_TURN_MS);
  assert.equal(r.hands.c.deadlineMs, undefined);
  assert.deepEqual(simulState(r, r.hands), { phase: 'playing', lastDeadlineMs: T0 + ONN_TURN_MS });
});

test('sıra yok: ikinci oyuncu birinciyi beklemeden oynar; kart çekmek süreyi uzatmaz', () => {
  let r = deal();
  // b önce oynar (eski sistemde sıra a'daydı)
  let x = simulAct(r, 'b', 'hit', T0 + 3000, () => 2);
  assert.ok(!x.error);
  assert.deepEqual(x.hands.b.cards, [4, 1, 2]);
  assert.equal(x.hands.b.deadlineMs, T0 + ONN_TURN_MS); // ortak tek 10 sn
  r = apply(r, x.hands);
  x = simulAct(r, 'a', 'stand', T0 + 4000);
  r = apply(r, x.hands);
  assert.equal(r.hands.a.status, 'stand');
  assert.equal(r.phase, 'playing'); // b hâlâ oynuyor
  assert.match(simulAct(r, 'a', 'hit', T0 + 4100, () => 1).error, /zaten bitirdin/);
  assert.match(simulAct(r, 'c', 'hit', T0 + 4100, () => 1).error, /zaten bitirdin/);
  assert.match(simulAct(r, 'zz', 'hit', T0 + 4100, () => 1).error, /elde değilsin/);
  // b 10'u aşar → elenir, oynayan kalmadı → kurpiyer
  x = simulAct(r, 'b', 'hit', T0 + 5000, () => 5);
  r = apply(r, x.hands);
  assert.equal(r.hands.b.status, 'bust');
  assert.equal(r.phase, 'dealer');
  assert.match(simulAct(r, 'b', 'hit', T0 + 5000, () => 1).error, /El bitti/);
});

test('süre: geç gelen kart çekme pas sayılır; otomatik pas sadece süresi dolanları geçirir', () => {
  let r = deal();
  const x = simulAct(r, 'a', 'hit', T0 + ONN_TURN_MS + ONN_GRACE_MS + 1, () => 1);
  assert.equal(x.late, true);
  assert.equal(x.hands.a.status, 'stand');
  assert.deepEqual(x.hands.a.cards, [2, 3]);
  r = deal();
  const y = simulAct(r, 'b', 'hit', T0 + 8000, () => 1); // kart çekti ama süresi uzamadı
  r = apply(r, y.hands);
  assert.equal(simulAutoStand(r, T0 + ONN_TURN_MS - 1).n, 0);
  const z = simulAutoStand(r, T0 + ONN_TURN_MS + 1);
  assert.equal(z.n, 2); // ikisi birden pas
  assert.equal(z.hands.a.status, 'stand');
  assert.equal(z.hands.b.status, 'stand');
  assert.deepEqual(z.hands.b.cards, [4, 1, 1]);
  assert.equal(apply(r, z.hands).phase, 'dealer');
});

// v125 — akıllı kurpiyer (hilesiz): sadece açık ellere bakar, kartlar rastgele
import { dealerBestMove, onnHouseNet } from '../onNumara.js';
test('v125 akıllı kurpiyer: zaten kazanıyorsa durur, kaybediyorsa çeker; beraberlik paylaşılır', () => {
  // kasa net (bahis=1): tek oyuncu 9, kurpiyer 10 → kurpiyer kazanır, pot (2) kasada → +1
  assert.equal(onnHouseNet(10, [9], 1), 1);
  // berabere 9–9 → pot ikiye bölünür: oyuncuya 1, kasaya 1 → 0
  assert.equal(onnHouseNet(9, [9], 1), 0);
  // kurpiyer battı, oyuncu ayakta → oyuncu potu alır → kasa −1
  assert.equal(onnHouseNet(11, [7], 1), -1);
  // herkes battı → berabere, iade
  assert.equal(onnHouseNet(12, [], 1), 0);
  assert.equal(dealerBestMove(8, [7], 1), 'stand', 'önde: dur');
  assert.equal(dealerBestMove(8, [9], 1), 'hit', 'geride: çek (eskiden 8’de duruyordu)');
  assert.equal(dealerBestMove(5, [], 1), 'stand', 'oyuncu battıysa risk alma');
  assert.equal(dealerBestMove(10, [10], 1), 'stand');
  // 7'de, oyuncu 6: önde → dur
  assert.equal(dealerBestMove(7, [6], 1), 'stand');
});
test('v127 sabit kurpiyer: 9 altında çeker, 9 ve 10’da durur; index.js dealerMove kullanır', async () => {
  const { dealerMove } = await import('../onNumara.js');
  assert.equal(dealerMove(8), 'hit');
  assert.equal(dealerMove(2), 'hit');
  assert.equal(dealerMove(9), 'stand');
  assert.equal(dealerMove(10), 'stand');
  const src = (await import('node:fs')).readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /dealerMove\(total\) === 'stand'/);
  assert.doesNotMatch(src, /dealerBestMove\(/);
});
