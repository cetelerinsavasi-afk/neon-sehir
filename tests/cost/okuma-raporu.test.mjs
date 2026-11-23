// v187 — okuma raporu scripti: log kayıtlarını dinleyici başına doğru toplar
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../../scripts/okuma-raporu.mjs';

test('toplama: etiket başına kesin/olası, örnekleme oranına göre tahmin, sıralama', () => {
  const e = (sid, b, vis = 3_600_000) => ({ timestamp: '2026-11-24T10:00:00Z', jsonPayload: { ns_read_stats: 1, v: 187, sid, rate: 0.1, vis, b } });
  const r = aggregate([
    e('a', { 'q:globalChat L1': [10, 0, 10, 1], 'doc:users/*': [5, 2, 5, 1] }),
    e('b', { 'q:globalChat L1': [20, 0, 20, 1] }),
    { jsonPayload: { msg: 'başka log' } },
  ]);
  assert.equal(r.rows, 2);
  assert.equal(r.sessions, 2);
  assert.equal(r.visHours, 2);
  assert.equal(r.total, 35);
  assert.equal(r.list[0].label, 'q:globalChat L1');
  assert.equal(r.list[0].kesin, 30);
  assert.equal(r.list[0].tahmin, 300);
  assert.equal(r.list[0].oturum.size, 2);
  assert.equal(r.list[1].olasi, 2);
});

test('boş girdi', () => {
  const r = aggregate([]);
  assert.equal(r.rows, 0);
  assert.equal(r.list.length, 0);
});
