// v189 — Neon Borsa ekranı: canlı fiyat RTDB'den, Firestore piyasa belgesi dinlenmez (tek okuma +
// saat başı), metinler Türkçe ve miktar yazıyor ("BÜYÜK AL" yok), "%xx dolu" kalktı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withLive, coState, BORSA_UNITS as U, fmtShares, sortCos } from '../../functions/borsa.js';

const src = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('withLive: canlı S belgenin üstüne yazılır; eski (v1) belge de çevrilir', () => {
  // v219: seyyar satıcılar tek hisse (seyyar)
  const legacy = { v: 1, distDay: '2026-12-01', co: { seyyar: { n: 14, acc: 5, ch: [1, 2], ps: [9] } } };
  const m = withLive(legacy, { seyyar: 15.5 * U, hastane: 3 * U, bozuk: 'x' });
  assert.equal(m.v, 2);
  assert.equal(m.distDay, '2026-12-01');
  assert.equal(coState(m, 'seyyar').u, 15.5 * U);
  assert.deepEqual(coState(m, 'seyyar').ch, [1, 2]);
  assert.equal(coState(m, 'hastane').u, 3 * U);
  assert.equal(coState(withLive(legacy, null), 'seyyar').u, 14 * U, 'canlı yoksa belge');
  assert.equal(fmtShares(coState(m, 'seyyar').u), '15,5');
  assert.equal(sortCos(m)[0].id, 'seyyar', 'hisse başına gelire göre sıralı');
});

test('piyasa kancası: onSnapshot yok, getDoc + RTDB borsaFiyat', () => {
  const s = code('hooks/useBorsaMarket.js');
  assert.doesNotMatch(s, /onSnapshot/);
  assert.match(s, /getDoc\(doc\(db, 'borsa', 'piyasa'\)\)/);
  assert.match(s, /BORSA_RTDB_PATH/);
});

test('ekran: miktarlı buton yazıları, 4 buton + hepsini sat, doluluk çubuğu yok', () => {
  const s = code('components/Phone/borsa/BorsaApp.jsx');
  assert.doesNotMatch(s, /BÜYÜK|Büyük al|dolu`|borsa-fill/);
  assert.match(s, /hisse al`/);
  assert.match(s, /hisse sat`/);
  assert.match(s, /\{buyBtn\('small'\)\}\s*\{sellBtn\('small'\)\}\s*\{buyBtn\('big'\)\}\s*\{sellBtn\('big'\)\}/);
  assert.match(s, /Sat · \+\$\{fmt\(coSell\.net\)\}/, 'detayda iki adımlı hepsini sat');
  assert.doesNotMatch(s, /Hepsini sat · \+|tüm mekânlar\)|Bugün aldığın hisse/, 'v190: kaldırılanlar');
  assert.match(s, /points\.slice\(-169\)/, 'listede 7 günlük mini grafik');
  assert.doesNotMatch(s, /'Altın yetmiyor'/, 'altın yetmeyince de fiyat yazar');
  assert.match(s, /ort\. gelir: /);
  assert.match(s, /BATCH_MS = 800/);
});

test('database.rules.json: borsaFiyat okuma giriş yapmış herkese, yazma sadece sunucu', () => {
  const r = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8')).rules;
  assert.deepEqual(r.borsaFiyat, { '.read': 'auth != null', '.write': false });
});
