// v189 — hesap silme (accountDeletion borsaRelease): küsuratlı hisseler havuza döner, eski (v188)
// piyasa belgesi de doğru çevrilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { applyPlan } from '../accountDeletion.js';
import { BORSA_UNITS as U } from '../borsa.js';

const plan = (uid) => ({ uid, names: [], delete: [], anonymize: [], flow: [{ what: 'Neon Borsa hisseleri', ops: [{ phase: 1, type: 'borsaRelease' }] }] });

test('yeni biçim: birimler + bu dönem sayacı düşer', async () => {
  const db = new FakeFirestore();
  await db.doc('borsa/piyasa').set({ v: 2, distDay: '2026-12-01', co: { simitci: { u: 5.5 * U, h: 2, A: '0', bt: 2 * U, btd: '2026-12-01', aH: [], inc: [], ps: [], ch: [] } } });
  await db.doc('users/a').set({ gold: 1, borsaSon: 5, borsa: { simitci: { v: 2, u: 2.5 * U, a: '0', pq: '0', c: 100, b: 1.5 * U, bd: '2026-12-01' } } });
  await applyPlan({ db, auth: {}, FieldValue, callables: {}, plan: plan('a') });
  const m = (await db.doc('borsa/piyasa').get()).data();
  assert.equal(m.co.simitci.u, 3 * U);
  assert.equal(m.co.simitci.h, 1);
  assert.equal(m.co.simitci.bt, 0.5 * U);
  const u = (await db.doc('users/a').get()).data();
  assert.equal(u.borsa, undefined);
  assert.equal(u.borsaSon, undefined);
});

test('eski biçim: piyasa v2 olur, tam hisseler düşer', async () => {
  const db = new FakeFirestore();
  await db.doc('borsa/piyasa').set({ v: 1, distDay: '2026-12-01', co: { midyeci: { n: 4, h: 2, acc: 50 }, kofteci: { n: 1, h: 1, acc: 7 } } });
  await db.doc('users/a').set({ gold: 1, borsa: { midyeci: { n: 3, a: 0, p: 0, c: 6000 } } });
  await applyPlan({ db, auth: {}, FieldValue, callables: {}, plan: plan('a') });
  const m = (await db.doc('borsa/piyasa').get()).data();
  assert.equal(m.v, 2);
  assert.equal(m.co.midyeci.u, U);
  assert.equal(m.co.midyeci.h, 1);
  assert.equal(m.co.midyeci.n, undefined);
  assert.equal(m.co.kofteci.u, U, 'dokunulmayan mekân da çevrildi');
  assert.equal(m.co.kofteci.A, String(7n * 10n ** 9n));
});
