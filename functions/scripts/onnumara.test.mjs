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
