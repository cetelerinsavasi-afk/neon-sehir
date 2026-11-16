// v165 — ölçüm AÇIKKEN (örneklenen oturum): uygulama aynı veriyi aynı sırayla alır,
// dinleyici kapatma / ağ aç-kapa aynen geçer; ek Firestore çağrısı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const fake = new URL('./fakeFirestore.mjs', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@firebase/firestore') return { url: ${JSON.stringify(fake)}, shortCircuit: true };
  return next(spec, ctx);
}`));
const store = new Map([['neon.readStats', '1']]);
globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null } };
globalThis.document = { visibilityState: 'visible', addEventListener: () => {} };
globalThis.navigator ??= { userAgent: 'node' };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ readStats: false }) });
globalThis.setInterval = () => 0;

const shim = await import('../../src/lib/fsMeter/firestoreShim.js');
const { calls } = await import(fake);
const { meter } = await import('../../src/lib/fsMeter/runtime.js');

test('ölçüm açık', () => assert.ok(meter));

test('onSnapshot: aynı ref, aynı sayıda argüman, uygulama aynı anlık görüntüyü alır; kapatma geçer', () => {
  const got = [];
  const err = () => {};
  const ref = { type: 'document', path: 'users/AbCdEfGhIjKlMnOpQrStUvWxYz12' };
  const unsub = shim.onSnapshot(ref, (s) => got.push(s), err);
  const c = calls.at(-1);
  assert.equal(c.fn, 'onSnapshot');
  assert.equal(c.ref, ref);
  assert.equal(c.args.length, 2);
  assert.equal(c.args[1], err, 'hata geri çağrısı aynen');
  const snap = { metadata: { fromCache: false }, exists: () => true };
  c.args[0](snap);
  assert.deepEqual(got, [snap]);
  unsub();
  assert.equal(calls.at(-1).fn, 'unsub');
  assert.deepEqual(meter.take().b['doc:users/*'], [1, 0, 1, 1]);
});

test('getDocs/getDoc aynı sonucu döndürür; ağ aç/kapa aynen geçer', async () => {
  const before = calls.length;
  assert.equal((await shim.getDocs({ type: 'collection', path: 'a' })).tag, 'S');
  assert.equal((await shim.getDoc({ type: 'document', path: 'a/b' })).tag, 'D');
  assert.equal(await shim.disableNetwork({}), 'off');
  assert.equal(await shim.enableNetwork({}), 'on');
  assert.deepEqual(calls.slice(before).map((c) => c.fn), ['getDocs', 'getDoc', 'disableNetwork', 'enableNetwork'], 'ek Firestore çağrısı yok');
});
