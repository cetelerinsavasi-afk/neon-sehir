// v165 — serverClock.applyServerOffset: eski apply() ile aynı kurallar (400 ms eşiği, kayıt)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } };
const { applyServerOffset, clockOffsetMs, serverNow, syncServerClock } = await import('../../src/lib/serverClock.js');

test('RTDB farkı uygulanır ve kaydedilir; Date.now düzeltilir', () => {
  applyServerOffset(5000);
  assert.equal(clockOffsetMs(), 5000);
  assert.equal(store.get('neon.srvClockOffset'), '5000');
  assert.ok(Math.abs(Date.now() - (serverNow())) < 5);
});

test('400 ms altı oynama saati zıplatmaz (eski kuralla aynı)', () => {
  applyServerOffset(5300);
  assert.equal(clockOffsetMs(), 5000);
  applyServerOffset(4500);
  assert.equal(clockOffsetMs(), 4500);
});

test('geçersiz / aşırı değer yok sayılır', () => {
  applyServerOffset(NaN);
  applyServerOffset(40 * 86400_000);
  assert.equal(clockOffsetMs(), 4500);
});

test('RTDB ile yeni senkron olduysa eski yol 10 dk içinde tekrar çağırmaz', async () => {
  let n = 0;
  await syncServerClock(async () => { n += 1; return { data: { now: Date.now() } }; });
  assert.equal(n, 0);
});
