// v165 — ortak saat: RTDB'den fark + eski yol (serverTime) güvenlik ağı
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClockSync, RTDB_WAIT_MS } from '../../src/lib/clockSync.js';

function harness({ useRtdb = true, connect } = {}) {
  const timers = new Map();
  let id = 0;
  const applied = [];
  const fnCalls = [];
  let rtCb = null;
  const sync = createClockSync({
    useRtdb,
    connectRtdb: connect || (async (cb) => { rtCb = cb; }),
    syncViaFn: async (force) => { fnCalls.push(force); },
    applyOffset: (o) => applied.push(o),
    setTimer: (fn, ms) => { id += 1; timers.set(id, { fn, ms }); return id; },
    clearTimer: (t) => timers.delete(t),
  });
  const fire = () => { const all = [...timers.entries()]; timers.clear(); all.forEach(([, t]) => t.fn()); };
  const flush = () => new Promise((r) => setImmediate(r));
  return { sync, applied, fnCalls, timers, fire, flush, rt: (...a) => rtCb(...a) };
}

test('RTDB bağlanınca fark uygulanır, serverTime ÇAĞRILMAZ', async () => {
  const h = harness();
  assert.equal(h.sync.start(), 'rtdb');
  await h.flush();
  h.rt(true, 1234);
  assert.deepEqual(h.applied, [1234]);
  assert.equal(h.timers.size, 0, 'güvenlik ağı zamanlayıcısı iptal edilmeli');
  h.fire();
  await h.flush();
  assert.deepEqual(h.fnCalls, []);
});

test('RTDB süre içinde bağlanmazsa eski yol (force) bir kez çalışır', async () => {
  const h = harness();
  h.sync.start();
  await h.flush();
  assert.equal([...h.timers.values()][0].ms, RTDB_WAIT_MS);
  h.fire();
  await h.flush();
  assert.deepEqual(h.fnCalls, [true]);
});

test('RTDB modülü yüklenemezse hemen eski yola döner; sonra öne gelişlerde eski davranış', async () => {
  const h = harness({ connect: async () => { throw new Error('yok'); } });
  h.sync.start();
  await h.flush();
  await h.flush();
  assert.deepEqual(h.fnCalls, [true]);
  assert.equal(h.timers.size, 0);
  h.sync.onVisible();
  await h.flush();
  assert.deepEqual(h.fnCalls, [true, false]);
});

test('useRtdb=false (bayrak / adres yok) → BİREBİR eski davranış', async () => {
  const h = harness({ useRtdb: false });
  assert.equal(h.sync.start(), 'fn');
  h.sync.onVisible();
  h.sync.onOnline();
  await h.flush();
  assert.deepEqual(h.fnCalls, [true, false, true]);
  assert.deepEqual(h.applied, []);
});

test('bağlantı kopup geri gelince yeni fark uygulanır; bağlıyken öne gelmek çağrı yapmaz', async () => {
  const h = harness();
  h.sync.start();
  await h.flush();
  h.rt(true, 100);
  h.sync.onVisible();
  assert.equal(h.timers.size, 0);
  h.rt(false);
  h.sync.onVisible(); // kopuk → güvenlik ağı kurulur
  assert.equal(h.timers.size, 1);
  h.rt(true, 250); // yeniden bağlandı
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.applied, [100, 250]);
  await h.flush();
  assert.deepEqual(h.fnCalls, []);
});

test('geçersiz fark yok sayılır', async () => {
  const h = harness();
  h.sync.start();
  await h.flush();
  h.rt(true, 'abc');
  h.rt(true, undefined);
  assert.deepEqual(h.applied, []);
});
