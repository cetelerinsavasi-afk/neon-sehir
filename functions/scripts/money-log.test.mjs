// v92 — Profil › Günlük rapor (functions/moneyLog.js)
// Çalıştır: node --test functions/scripts/money-log.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { goldTag, tagSource, recordGoldChange, cleanupMoneyLog } from '../moneyLog.js';

test('etiket: kaynak + benzersiz ek; geçersiz kaynak "diger"', () => {
  const a = goldTag('menu');
  const b = goldTag('menu');
  assert.notEqual(a, b);
  assert.equal(tagSource(a), 'menu');
  assert.equal(tagSource('???'), 'diger');
  assert.equal(tagSource(goldTag('a b/c')), 'abc');
});

test('altın farkı günlük özete kaynağıyla yazılır; etiketsiz değişim "diger" olur', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const G = (p) => db._store.get(p)?.data;
  const at = Date.UTC(2026, 9, 12, 21, 30); // İstanbul 13 Ekim 00:30
  const t1 = goldTag('menu');
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 1000 }, after: { gold: 900, goldTag: t1 }, atMs: at });
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 900, goldTag: t1 }, after: { gold: 950, goldTag: goldTag('garson') }, atMs: at });
  // etiket değişmeden altın değişti (etiketsiz yazma) → diger
  await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 950, goldTag: 'garson|x' }, after: { gold: 1950, goldTag: 'garson|x' }, atMs: at });
  // altın değişmedi → yazılmaz
  assert.equal(await recordGoldChange({ db, FieldValue, uid: 'u1', before: { gold: 1950 }, after: { gold: 1950, xp: 3 }, atMs: at }), null);
  const d = G('moneyLog/u1_2026-10-13');
  assert.equal(d.uid, 'u1');
  assert.equal(d.in, 1050);
  assert.equal(d.out, 100);
  assert.equal(d.by.menu.out, 100);
  assert.equal(d.by.garson.in, 50);
  assert.equal(d.by.diger.in, 1000);
  assert.equal(d.n, 3);
});

test('eski günler temizlenir (bugün + önceki 2 gün kalır)', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const S = (p, v) => db._store.set(p, { data: v, version: 1 });
  ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].forEach((day) => S(`moneyLog/u1_${day}`, { uid: 'u1', day, in: 1, out: 0 }));
  const r = await cleanupMoneyLog({ db, now: Date.UTC(2026, 9, 13, 9) });
  assert.equal(r.days, 2);
  assert.ok(db._store.get('moneyLog/u1_2026-10-11'));
  assert.equal(db._store.get('moneyLog/u1_2026-10-10'), undefined);
});
