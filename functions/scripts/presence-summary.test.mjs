// v81 — presence özeti: giriş/çıkışta hemen sayım, art arda olaylarda sınırlı
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, Timestamp } from '../gang/test/fakeFirestore.js';
import { createPresenceSummary, PRESENCE_NUDGE_GAP_MS } from '../presenceSummary.js';

test('giriş/çıkış olayı sayımı hemen tetikler; 8 sn içindeki olaylar tek sayımda toplanır', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const clock = { now: Date.UTC(2026, 9, 9, 20) };
  let runs = 0;
  const job = createPresenceSummary({ db, Timestamp, now: () => clock.now, sleep: async (ms) => { clock.now += ms; } });
  const orig = job.run;
  const count = async () => { runs++; return orig(); };
  job.run = count;
  // ilk giriş → hemen sayılır
  S('interiorPresence/a', { locationId: 'kafe', updatedAt: new Timestamp(clock.now) });
  let r = await job.nudge(clock.now);
  assert.equal(r.int.kafe, 1);
  // 2 sn sonra biri daha girer → en erken 8 sn sonra sayılır (bekler), sonra 2 olur
  clock.now += 2000;
  S('interiorPresence/b', { locationId: 'kafe', updatedAt: new Timestamp(clock.now) });
  const ev = clock.now;
  r = await job.nudge(ev);
  assert.equal(r.int.kafe, 2);
  // aynı olay için ikinci tetik (zaten kapsandı) → sayım yok
  r = await job.nudge(ev);
  assert.equal(r.skipped, true);
  // biri çıkar
  clock.now += PRESENCE_NUDGE_GAP_MS + 1000;
  db._store.delete('interiorPresence/a');
  r = await job.nudge(clock.now);
  assert.equal(r.int.kafe, 1);
  assert.equal(db._store.get('stats/presence').data.int.kafe, 1);
});
