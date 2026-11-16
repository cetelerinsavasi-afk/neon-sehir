// v165 — ölçüm KAPALIYKEN (örneklenmeyen oturumlar = oyuncuların ~%90'ı) shim, gerçek
// Firestore SDK'sıyla birebir aynı dışa aktarımları verir ve doğrudan orijinali çağırır.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as real from '@firebase/firestore';
import * as shim from '../../src/lib/fsMeter/firestoreShim.js';
import { meter } from '../../src/lib/fsMeter/runtime.js';

test('ölçüm kapalı (tarayıcı dışı / örneklenmedi)', () => {
  assert.equal(meter, null);
});

test('dışa aktarılan adlar gerçek SDK ile aynı', () => {
  assert.deepEqual(Object.keys(shim).sort(), Object.keys(real).sort());
  // sarılmayanlar AYNI nesne
  for (const k of ['collection', 'doc', 'query', 'where', 'limit', 'orderBy', 'setDoc', 'updateDoc', 'serverTimestamp', 'Timestamp', 'initializeFirestore']) {
    assert.equal(shim[k], real[k], k);
  }
});

test('gerçek SDK ile belge okuma/dinleme aynı sonucu verir (yerel önbellek, ağsız)', async () => {
  const { initializeApp } = await import('firebase/app');
  const app = initializeApp({ projectId: 'demo-neon', apiKey: 'x' }, 'shimoff');
  const db = real.getFirestore(app);
  await real.disableNetwork(db);
  const ref = real.doc(db, 'demo', 'a');
  real.setDoc(ref, { n: 1 }); // çevrimdışı: yerel yazma
  const viaReal = await new Promise((res) => { const u = real.onSnapshot(ref, (s) => { u(); res(s.data()); }); });
  const viaShim = await new Promise((res) => { const u = shim.onSnapshot(ref, (s) => { u(); res(s.data()); }); });
  assert.deepEqual(viaShim, viaReal);
  assert.deepEqual(viaShim, { n: 1 });
  await real.terminate(db);
});
