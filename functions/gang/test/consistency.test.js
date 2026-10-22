// Mevcut sistemle tutarlılık: fiyat tabloları ve index.js entegrasyonu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AMAZOR_PRICES } from './harness.js';
import { AMAZOR_PRICES as SHARED_AMAZOR_PRICES } from '../../itemRules.js';
import { computeGangRanks, computeIntelRanks } from '../ranks.js';
import { dateKeyOf, hourOf, addDays, midnightMsOf, weekdayOfKey } from '../time.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexSrc = fs.readFileSync(path.join(here, '../../index.js'), 'utf8');

// v77: AMAZOR_PRICES index.js'ten functions/itemRules.js'e taşındı (Atölye ile ortak);
// index.js onu oradan içe aktarır.
test('AMAZOR fiyatları index.js ile aynı (ticaret yolu yarı fiyat / anlık değer bunlardan)', () => {
  assert.ok(/AMAZOR_PRICES,[\s\S]*?from '\.\/itemRules\.js'/.test(indexSrc), 'index.js AMAZOR_PRICES\'ı itemRules.js\'ten almalı');
  assert.ok(!/const AMAZOR_PRICES = \{/.test(indexSrc), 'index.js içinde ikinci bir AMAZOR_PRICES tanımı olmamalı');
  assert.deepEqual(SHARED_AMAZOR_PRICES, AMAZOR_PRICES);
});

test('index.js: dailyReset içinde sadece v109 polis kancaları (best-effort) var; çete fonksiyonları export ediliyor', () => {
  const start = indexSrc.indexOf('export const dailyReset');
  const end = indexSrc.indexOf('export const hourlyInvestmentUpdate');
  const body = indexSrc.slice(start, end);
  // v109: eski usul bekleyen istifa → teşkilattan ayrılma; geçiş gecesi imam kontrolü
  const calls = [...body.matchAll(/gangFunctions\.system\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['getRoleStatus', 'resignPolice']);
  for (const m of body.matchAll(/gangFunctions\.system\.\w+\([^)]*\)/g)) assert.ok(body.slice(m.index, m.index + 200).includes('.catch('), 'kanca hatası gece işini durdurmamalı');
  assert.ok(!/gangWorlds|createGangSystem/.test(body), 'dailyReset çete dünyasına doğrudan dokunmaz');
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

test('index.js (v108): soygun/kaçak cezaları ve soygun ödemeleri devlet kasasına AYNI işlemde yazılır; polis kancası best-effort', () => {
  assert.ok(!indexSrc.includes('onSuspicionFine'), 'İstihbarat ceza kancası kaldırıldı');
  assert.ok(!indexSrc.includes('onPoliceBustReward'), 'İstihbarat polis prestiji kaldırıldı');
  const heist = indexSrc.slice(indexSrc.indexOf('export const attemptHeist'), indexSrc.indexOf('export const sellContrabandToDepo'));
  assert.ok(/heistStateEntries\(caught \? \{ fines: penalty \} : \{ paidToCriminals: reward \}\)/.test(heist), 'tek başına soygun: ceza ya da ödeme');
  assert.ok(heist.indexOf('stateWrite(tx') < heist.indexOf('result = {'), 'transaction içinde');
  const park = indexSrc.slice(indexSrc.indexOf('export const sellContrabandAtPark'));
  assert.ok(/fines: penaltyAmount, contraband: true/.test(park.slice(0, 4000)));
  const plan = indexSrc.slice(indexSrc.indexOf('export const executeHeistPlan'), indexSrc.indexOf('export const expireHeistPlans'));
  assert.ok(plan.includes('policeBustSplit(totalReward, policeIdx.length)'));
  assert.ok(plan.indexOf('stateWrite(batch') < plan.indexOf('await batch.commit()'), 'aynı batch');
  const hook = plan.indexOf('.onPoliceBust(');
  assert.ok(hook > 0 && plan.slice(hook, hook + 260).includes('.catch('), 'polis kancası hata verse de soygun etkilenmez');
});
