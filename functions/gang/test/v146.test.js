// v146 — çete zümrüdü: bağış (1 zümrüt = 50.000 prestij), dağıtılamaz / çekilemez
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

test('v146: zümrüt bağışı kasanın zümrüdüne gider, 50.000 prestij verir; zümrüt yetmezse olmaz', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 3 });
  const who = A.ids[0];
  await h.db.doc(`gangWorlds/test/players/${who}`).update({ emerald: 5 });
  const before = h.member(A.gangId, who).prestige || 0;
  const r = await h.act(who, 'donateGem', { amount: 3 });
  assert.equal(r.donated, 3);
  assert.equal(h.state(A.gangId).gem, 3);
  assert.equal((await h.db.doc(`gangWorlds/test/players/${who}`).get()).data().emerald, 2);
  assert.equal(h.member(A.gangId, who).prestige, before + 150_000);
  assert.ok(h.chat(A.gangId).some((m) => /3 zümrüt bağışladı/.test(m)));
  const e = await h.fails(who, 'donateGem', { amount: 5 });
  assert.match(e.message, /zümrüt/);
});
