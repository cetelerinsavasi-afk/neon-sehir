// v187 — Silahçı soygun ödülü 40.000 (sunucu ve ekran aynı değeri söyler)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../../src/components/HeistPanel/HeistPanel.jsx', import.meta.url), 'utf8');
const num = (src, re) => Number(src.match(re)?.[1]);

test('sunucu: silahçı ödülü 40.000, güç ve şüphe aynı', () => {
  const line = server.match(/^\s*silah_magazasi: \{ suspicionCost: \d+, reward: \d+, requiredPower: \d+ \},$/m)?.[0] || '';
  assert.equal(num(line, /reward: (\d+)/), 40000);
  assert.equal(num(line, /requiredPower: (\d+)/), 40000);
  assert.equal(num(line, /suspicionCost: (\d+)/), 20);
});

test('ekran (HeistPanel) sunucuyla aynı ödülü gösterir', () => {
  const line = panel.match(/^\s*silah_magazasi: \{ title: 'Silahçı Soygunu'.*$/m)?.[0] || '';
  assert.equal(num(line, /reward: (\d+)/), 40000);
  assert.equal(num(line, /requiredPower: (\d+)/), 40000);
});
