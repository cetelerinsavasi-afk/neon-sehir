// Mevcut sistemle tutarlılık: fiyat tabloları ve index.js entegrasyonu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AMAZOR_PRICES } from './harness.js';
import { computeGangRanks, computeIntelRanks } from '../ranks.js';
import { dateKeyOf, hourOf, addDays, midnightMsOf, weekdayOfKey } from '../time.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexSrc = fs.readFileSync(path.join(here, '../../index.js'), 'utf8');

test('AMAZOR fiyatları index.js ile aynı (ticaret yolu yarı fiyat / anlık değer bunlardan)', () => {
  const m = indexSrc.match(/const AMAZOR_PRICES = \{([^}]+)\}/);
  assert.ok(m);
  const obj = Object.fromEntries(m[1].split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split(':').map((y) => y.trim())).map(([k, v]) => [k, Number(v)]));
  assert.deepEqual(obj, AMAZOR_PRICES);
});

test('index.js: dailyReset içine çete kodu eklenmedi; çete fonksiyonları export ediliyor', () => {
  const start = indexSrc.indexOf('export const dailyReset');
  const end = indexSrc.indexOf('export const hourlyInvestmentUpdate');
  const body = indexSrc.slice(start, end);
  assert.ok(!/gang/i.test(body), 'dailyReset gövdesinde çete kodu olmamalı');
  for (const f of ['gangAction', 'gangClock']) assert.ok(indexSrc.includes(`export const ${f}`));
  // v32: admin paneli / test şifresi canlıda yok
  assert.ok(!indexSrc.includes('export const gangAdmin'), 'gangAdmin export edilmemeli');
  assert.ok(!/GANG_TEST_PASSWORD/.test(fs.readFileSync(new URL('../firebase.js', import.meta.url), 'utf8')), 'test şifresi secret kaldırıldı');
});

test('İstanbul zaman yardımcıları mevcut istanbulDateKey ile uyumlu', () => {
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  for (let i = 0; i < 2000; i++) {
    const ms = Date.UTC(2026, 0, 1) + i * 4.37 * 3600_000;
    assert.equal(dateKeyOf(ms), fmt(new Date(ms)));
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date(ms)));
    assert.equal(hourOf(ms), h % 24);
  }
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dateKeyOf(midnightMsOf('2026-09-27')), '2026-09-27');
  assert.equal(weekdayOfKey('2026-09-27'), 0);
});

test('rütbe hesabı saf fonksiyon: sınır değerleri', () => {
  const mk = (id, prestige, joinedAtMs = 0) => ({ id, prestige, joinedAtMs });
  const r = computeGangRanks([mk('b', 0), mk('a', 1_000_000), mk('c', 999_999), mk('d', 1_000_000, 5)], 'b');
  assert.deepEqual(r, { b: 'baba', a: 'sagkol', d: 'sagkol', c: 'comez' });
  const many = Array.from({ length: 10 }, (_, i) => mk(`m${i}`, 10_000_000 - i));
  const r2 = computeGangRanks([mk('b', 1), ...many], 'b');
  assert.equal(Object.values(r2).filter((x) => x === 'sagkol').length, 2);
  assert.equal(Object.values(r2).filter((x) => x === 'kidemli').length, 4);
  assert.equal(Object.values(r2).filter((x) => x === 'tetikci').length, 4);
  const i = computeIntelRanks(many);
  assert.equal(i.m0, 'baskan');
  assert.equal(Object.values(i).filter((x) => x === 'sef').length, 2);
  assert.equal(Object.values(i).filter((x) => x === 'uzman').length, 4);
  assert.equal(computeIntelRanks([mk('z', 5)]).z, 'muhbir');
});

test('index.js: şüpheyle yakalanma cezası kancaları best-effort ve polis yakalamasında çağrılmaz', () => {
  const idx = [...indexSrc.matchAll(/\.onSuspicionFine\(/g)].map((m) => m.index);
  assert.equal(idx.length, 3, 'attemptHeist + sellContrabandAtPark + executeHeistPlan');
  for (const i of idx) assert.ok(indexSrc.slice(i, i + 220).includes('.catch('), 'hata soygunu etkilememeli');
  const plan = indexSrc.slice(indexSrc.indexOf('export const executeHeistPlan'));
  const i = plan.indexOf('onSuspicionFine');
  assert.ok(/if \(caughtBySuspicion\) \{\s*await Promise\.all\(\s*captureSmsList/.test(plan.slice(i - 400, i)), 'sadece caughtBySuspicion dalında');
});
