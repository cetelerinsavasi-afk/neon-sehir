import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang, FieldValue } from './harness.js';

async function twoGangs(h) {
  const A = await setupGang(h, { members: 2, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  return { A, B };
}
const logTexts = (h, g) => Object.values(h.db._dump(`gangWorlds/test/gangs/${g}/log/`)).map((m) => m.text);

test('v37: bahis tutarı savaş belgesinde yok, sadece gizli belgede; genel sohbet ve kayıtta tutar yok', async () => {
  const h = await createHarness();
  const { A, B } = await twoGangs(h);
  const { warId } = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 123_000 });
  assert.equal(h.get(`wars/${warId}`).stake, undefined);
  assert.equal(h.get(`wars/${warId}/secret/stake`).stake, 123_000);
  for (const g of [A.gangId, B.gangId]) {
    assert.ok(!h.chat(g).some((m) => /123\.000/.test(m)), 'genel sohbette tutar olmamalı');
    assert.ok(!logTexts(h, g).some((m) => /123\.000/.test(m)), 'kayıtta tutar olmamalı');
    assert.ok(h.chat(g, 'yonetim').some((m) => /123\.000/.test(m)), 'yönetim sohbetinde tutar var');
  }
  await h.act(B.baba, 'respondBet', { warId, accept: true });
  assert.equal(h.state(A.gangId).kasa, 1_000_000 - 123_000);
  assert.equal(h.state(B.gangId).kasa, 1_000_000 - 123_000);
  h.at('2026-09-21', '12:00');
  await h.act(A.baba, 'rollDice', { warId });
  h.at('2026-09-22', '12:01');
  await h.internal.clock.runClock('test');
  const w = h.get(`wars/${warId}`);
  assert.equal(w.status, 'resolved');
  assert.equal(w.result.pot, undefined, 'pot savaş belgesine yazılmaz');
  assert.equal(h.get(`wars/${warId}/secret/stake`).pot, 246_000);
  assert.equal(h.state(A.gangId).kasa, 1_000_000 + 123_000);
  assert.ok(!logTexts(h, A.gangId).some((m) => /246\.000/.test(m)));
  assert.ok(h.chat(A.gangId, 'yonetim').some((m) => /246\.000/.test(m)));
});

test('v37: reddet / geri çek / zaman aşımı tutarı gizli belgeden iade eder', async () => {
  const h = await createHarness();
  const { A, B } = await twoGangs(h);
  const r1 = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 70_000 });
  await h.act(B.baba, 'respondBet', { warId: r1.warId, accept: false });
  assert.equal(h.state(A.gangId).kasa, 1_000_000);
  const r2 = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 80_000 });
  await h.act(A.baba, 'withdrawBet', { warId: r2.warId });
  assert.equal(h.state(A.gangId).kasa, 1_000_000);
  await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 90_000 });
  await h.tickTo('2026-09-22', '00:10');
  assert.equal(h.state(A.gangId).kasa, 1_000_000);
});

test('v37: eski belgedeki tutar kaybolmadan gizli belgeye taşınır (idempotent) ve sonuç doğru', async () => {
  const h = await createHarness();
  const { A, B } = await twoGangs(h);
  const { warId } = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 50_000 });
  await h.act(B.baba, 'respondBet', { warId, accept: true });
  // eski biçime çevir: tutar savaş belgesinde, gizli belge yok, taşıma bayrağı yok
  await h.db.doc(`gangWorlds/test/wars/${warId}`).update({ stake: 50_000 });
  await h.db.doc(`gangWorlds/test/wars/${warId}/secret/stake`).delete();
  await h.db.doc('gangWorlds/test').set({ betSecretV37: FieldValue.delete() }, { merge: true });
  // eski, sonuçlanmış bir bahis (pot savaş belgesinde)
  await h.db.doc('gangWorlds/test/wars/eski1').set({ type: 'bet', status: 'resolved', gangIds: [A.gangId, B.gangId], stake: 10_000, result: { winner: A.gangId, pot: 20_000 } });
  await h.internal.clock.runClock('test');
  assert.equal(h.get(`wars/${warId}`).stake, undefined);
  assert.equal(h.get(`wars/${warId}/secret/stake`).stake, 50_000);
  assert.equal(h.get('wars/eski1').stake, undefined);
  assert.equal(h.get('wars/eski1').result.pot, undefined);
  assert.equal(h.get('wars/eski1').result.winner, A.gangId);
  assert.deepEqual([h.get('wars/eski1/secret/stake').stake, h.get('wars/eski1/secret/stake').pot], [10_000, 20_000]);
  assert.equal(h.raw('gangWorlds/test').betSecretV37, true);
  await h.internal.clock.runClock('test'); // tekrar: değişiklik yok
  assert.equal(h.get(`wars/${warId}/secret/stake`).stake, 50_000);
  h.at('2026-09-21', '12:00');
  await h.act(A.baba, 'rollDice', { warId });
  h.at('2026-09-22', '12:01');
  await h.internal.clock.runClock('test');
  assert.equal(h.state(A.gangId).kasa, 1_000_000 + 50_000);
});
