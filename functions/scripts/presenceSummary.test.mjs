// v79 — presence özeti
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, Timestamp } from '../gang/test/fakeFirestore.js';
import { createPresenceSummary } from '../presenceSummary.js';

test('presence özeti: aktifleri sayar, değişmediyse yazmaz, 10 dk sonra canlılık için yazar', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const clock = { t: 1_800_000_000_000 };
  const ts = (ago) => Timestamp.fromMillis(clock.t - ago);
  S('parkPresence/a', { updatedAt: ts(5_000) });
  S('parkPresence/b', { updatedAt: ts(200_000) }); // bayat
  S('interiorPresence/c', { locationId: 'banka', updatedAt: ts(1_000) });
  S('interiorPresence/d', { locationId: 'banka', updatedAt: ts(1_000) });
  S('housePresence/e', { houseId: 'h1', updatedAt: ts(1_000) });
  S('housePresence/f', { houseId: 'h2', updatedAt: ts(80_000) });
  const job = createPresenceSummary({ db, Timestamp, now: () => clock.t });
  let r = await job.run();
  assert.equal(r.written, true);
  assert.deepEqual(G('stats/presence'), { park: 1, int: { banka: 2 }, house: { h1: 1, h2: 1 }, atMs: clock.t });
  clock.t += 120_000;
  S('housePresence/e', { houseId: 'h1', updatedAt: ts(1_000) });
  S('housePresence/f', { houseId: 'h2', updatedAt: ts(1_000) });
  S('interiorPresence/c', { locationId: 'banka', updatedAt: ts(1_000) });
  S('interiorPresence/d', { locationId: 'banka', updatedAt: ts(1_000) });
  S('parkPresence/a', { updatedAt: ts(1_000) });
  r = await job.run();
  assert.equal(r.written, false, 'aynı sayılar → yazma yok');
  clock.t += 10 * 60_000;
  ['parkPresence/a', 'interiorPresence/c', 'interiorPresence/d', 'housePresence/e', 'housePresence/f'].forEach((p) => S(p, { ...G(p), updatedAt: ts(1_000) }));
  r = await job.run();
  assert.equal(r.written, true, 'canlılık yazımı');
});
