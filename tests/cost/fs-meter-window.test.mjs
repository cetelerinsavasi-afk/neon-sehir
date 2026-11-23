// v187 — ikinci ölçüm penceresi: 3 gün, oran %10, alias yerinde
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { READ_STATS_END, READ_STATS_RATE } from '../../src/lib/fsMeter/meter.js';

test('bitiş 27 Kasım 00:00 (İstanbul), oran %10', () => {
  assert.equal(READ_STATS_END, Date.parse('2026-11-27T00:00:00+03:00'));
  assert.equal(READ_STATS_RATE, 0.1);
});

test('vite.config.js firebase/firestore → fsMeter sarmalayıcısı', () => {
  const s = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  assert.match(s, /find: \/\^firebase\\\/firestore\$\/, replacement: .*fsMeter\/firestoreShim\.js/);
});

test('bayrak açık', () => {
  assert.equal(JSON.parse(readFileSync(new URL('../../public/neon-flags.json', import.meta.url), 'utf8')).readStats, true);
});
