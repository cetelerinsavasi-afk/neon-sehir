// v196 — kapanış modu: bayrak kapalıyken serbest, açıkken listelenen işlemler reddedilir; 60 sn önbellek.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore } from '../gang/test/fakeFirestore.js';
import { createClosing, CLOSING_CACHE_MS } from '../v196Closing.js';
import { CLOSING_TEXT } from '../v196Shared.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
test('kapanış modu', async () => {
  const db = new FakeFirestore({ yieldEvery: false });
  const clock = { t: 1000 };
  const c = createClosing({ db, HttpsError, now: () => clock.t });
  await c.guardOp('house', 'buy'); // kapalı değil → geçer
  db._store.set('migrations/v196', { data: { closing: true, closingAtMs: 5 }, version: 1 });
  await c.guardOp('house', 'buy'); // önbellek: hâlâ açık sayılır
  clock.t += CLOSING_CACHE_MS + 1;
  await assert.rejects(() => c.guardOp('house', 'buy'), (e) => e.code === 'failed-precondition' && e.message === CLOSING_TEXT);
  await assert.rejects(() => c.guardOp('shop', 'stockAdd'));
  await assert.rejects(() => c.guardOp('shop', 'menuPrices'));
  await assert.rejects(() => c.guardOp('stream', 'price'));
  await assert.rejects(() => c.assertOpen());
  await c.guardOp('house', 'enter'); // kapatılmayan işlem
  await c.guardOp('shop', 'menuBuy');
  await c.guardOp('house', 'furnCancel'); // ilanını geri çekmek serbest
});
