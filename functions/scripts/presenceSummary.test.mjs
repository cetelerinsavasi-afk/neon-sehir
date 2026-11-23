// v188 — presence özeti GEÇİŞ MODU: hiçbir presence belgesi okunmaz, sadece atMs tazelenir
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeFirestore, Timestamp } from '../gang/test/fakeFirestore.js';
import { createPresenceSummary, PRESENCE_KEEPALIVE_REMOVE_AFTER } from '../presenceSummary.js';

function spyDb() {
  const db = new FakeFirestore({ yieldEvery: false });
  const reads = [];
  const origCol = db.collection.bind(db);
  db.collection = (name) => {
    const c = origCol(name);
    for (const k of ['get', 'where', 'orderBy', 'limit']) {
      if (typeof c[k] === 'function') {
        const f = c[k].bind(c);
        c[k] = (...a) => (reads.push(`${name}.${k}`), f(...a));
      }
    }
    const origDoc = c.doc.bind(c);
    c.doc = (id) => {
      const d = origDoc(id);
      const g = d.get.bind(d);
      d.get = (...a) => (reads.push(`${name}/${id}.get`), g(...a));
      return d;
    };
    return c;
  };
  return { db, reads };
}

test('sayım yok: presence koleksiyonları ve stats belgeleri hiç okunmaz', async () => {
  const { db, reads } = spyDb();
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  S('parkPresence/a', { updatedAt: Timestamp.fromMillis(1) });
  S('interiorPresence/c', { locationId: 'banka', updatedAt: Timestamp.fromMillis(1) });
  const job = createPresenceSummary({ db, now: () => 1_800_000_000_000 });
  await job.run();
  assert.deepEqual(reads, [], `okuma yapıldı: ${reads.join(', ')}`);
});

test('sadece atMs tazelenir; eski sayılar olduğu gibi kalır (eski istemciler belgeyi taze görür)', async () => {
  const { db } = spyDb();
  const clock = { t: 1_800_000_000_000 };
  db._store.set('stats/presence', { data: { park: 3, int: { banka: 2 }, house: { h1: 1 }, atMs: 1 }, version: 1 });
  const job = createPresenceSummary({ db, now: () => clock.t });
  const r = await job.run();
  assert.equal(r.written, true);
  assert.deepEqual(db._store.get('stats/presence').data, { park: 3, int: { banka: 2 }, house: { h1: 1 }, atMs: clock.t });
  clock.t += 10 * 60_000;
  await job.run();
  assert.equal(db._store.get('stats/presence').data.atMs, clock.t);
  // eski istemcinin tazelik kuralı: 15 dk
  assert.ok(clock.t - db._store.get('stats/presence').data.atMs < 15 * 60_000);
});

test('belge yoksa da yazılır (eski istemci "yok" sanmasın)', async () => {
  const { db } = spyDb();
  await createPresenceSummary({ db, now: () => 5 }).run();
  assert.deepEqual(db._store.get('stats/presence').data, { atMs: 5 });
});

test('index.js: 10 dk iş + süpürmede flushIfDirty/nudge çağrısı yok', () => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /export const presenceSummary = onSchedule\(\{ schedule: 'every 10 minutes' \}/);
  assert.doesNotMatch(src, /flushIfDirty\(|\.nudge\(/);
  assert.equal(PRESENCE_KEEPALIVE_REMOVE_AFTER, '2026-12-08');
});
