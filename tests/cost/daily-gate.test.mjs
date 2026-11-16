// v165 — fabrika 00:00 yedeği: günde bir kez (00:00–00:20 arası kapı yok)
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDailyRun, istanbulDayAndMinute, runOncePerIstanbulDay } from '../../src/lib/dailyGate.js';

// İstanbul = UTC+3 (yaz saati yok)
const ist = (iso) => Date.parse(iso + '+03:00');

test('İstanbul günü ve dakikası', () => {
  assert.deepEqual(istanbulDayAndMinute(ist('2026-11-17T00:05:00')), { dayKey: '2026-11-17', minuteOfDay: 5 });
  assert.deepEqual(istanbulDayAndMinute(ist('2026-11-16T23:59:00')), { dayKey: '2026-11-16', minuteOfDay: 1439 });
});

test('00:00–00:20 arası her açılışta çalışır, işaretlemez (eski davranış)', () => {
  assert.deepEqual(decideDailyRun(ist('2026-11-17T00:00:30'), '2026-11-17'), { run: true, mark: null });
  assert.deepEqual(decideDailyRun(ist('2026-11-17T00:19:59'), null), { run: true, mark: null });
});

test('00:20 sonrası günün ilk açılışında çalışır, sonrakilerde atlar; ertesi gün yine çalışır', () => {
  assert.deepEqual(decideDailyRun(ist('2026-11-17T09:00:00'), '2026-11-16'), { run: true, mark: '2026-11-17' });
  assert.deepEqual(decideDailyRun(ist('2026-11-17T23:59:00'), '2026-11-17'), { run: false, mark: null });
  assert.deepEqual(decideDailyRun(ist('2026-11-18T00:25:00'), '2026-11-17'), { run: true, mark: '2026-11-18' });
});

test('runOncePerIstanbulDay: başarıda işaretler, hatada işaretlemez, storage yoksa hep çalışır', async () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
  let n = 0;
  const ok = () => { n += 1; return Promise.resolve({ ok: true }); };
  await runOncePerIstanbulDay('k', ok, ist('2026-11-17T10:00:00'));
  await runOncePerIstanbulDay('k', ok, ist('2026-11-17T11:00:00'));
  assert.equal(n, 1);
  await assert.rejects(runOncePerIstanbulDay('k2', () => Promise.reject(new Error('x')), ist('2026-11-17T10:00:00')));
  assert.equal(store.get('k2'), undefined);
  globalThis.window = {};
  await runOncePerIstanbulDay('k', ok, ist('2026-11-17T12:00:00'));
  await runOncePerIstanbulDay('k', ok, ist('2026-11-17T12:01:00'));
  assert.equal(n, 3);
});
