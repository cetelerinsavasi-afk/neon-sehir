// v219 — seyyar hisse birleştirme, görünüm dükkânı fiyatı, kapanan hisseler
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSeyyarMerge, sellQuote, BORSA_UNITS as U, sortCos, isClosedCo, borsaCompanyStatKey, borsaCoOfVendor } from '../borsa.js';
import { avShopQuote, avCurrent, avFieldPrice, AV_PRICES, AV_COLOR_PRICES } from '../avatarShopData.js';
import { RESTORAN_MENU, MENU_PRICES } from '../v196Shared.js';

test('seyyar birleştirme: herkesin "hepsini sat" tutarı korunur (kayıp yok, kazanç ≤ %10)', () => {
  const S = { kokorecci: 120, simitci: 40, donerci: 10, kofteci: 300, midyeci: 5, dondurmaci: 60 };
  const market = { v: 2, distDay: '2026-11-26', co: {} };
  for (const [k, v] of Object.entries(S)) market.co[k] = { u: v * U, h: 3, A: '0', inc: [1000, 2000], ps: [], ch: [] };
  const H = [
    { kokorecci: 100, kofteci: 10 },
    { kokorecci: 20, simitci: 40, donerci: 10 },
    { kofteci: 290, midyeci: 5, dondurmaci: 60 },
  ];
  const holders = H.map((m, i) => ({ uid: `u${i}`, user: { borsa: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { v: 2, u: v * U, a: '0', pq: String(BigInt(i + 1) * 10n ** 18n * 5n), c: v * 1000 }])) } }));
  const p = planSeyyarMerge(holders, market);
  assert.equal(p.S, p.rows.reduce((a, r) => a + r.u, 0));
  for (const r of p.rows) {
    const nv = sellQuote(p.S, r.u).net;
    assert.ok(nv >= r.V, `${r.uid} kaybetti`);
    assert.ok(nv <= r.V * 1.1, `${r.uid} çok kazandı`);
  }
  // biriken gelir aynen taşınır (her oyuncunun her hissesi için 5·(i+1) altın)
  assert.equal(p.rows[0].pq, 2n * 5n * 10n ** 18n);
  assert.deepEqual(p.inc, [6000, 12000]);
});

test('seyyar: 6 tezgâh tek hisse; kurye payı eski koduyla yazılır (birleşik hissede sayılır)', () => {
  assert.equal(borsaCoOfVendor('seyyar_satici_4').id, 'seyyar');
  assert.equal(borsaCompanyStatKey('kofteci'), 'hs_kf');
});

test('cafe / bar hisseleri: alım kapalı, piyasada kalmayınca listeden kalkar', () => {
  assert.ok(isClosedCo('mk_cafe') && isClosedCo('mk_bar') && !isClosedCo('mk_spor'));
  const ids = (m) => sortCos(m).map((c) => c.id);
  assert.ok(!ids({ v: 2, co: {} }).includes('mk_cafe'));
  assert.ok(ids({ v: 2, co: { mk_bar: { u: 5 } } }).includes('mk_bar'));
});

test('görünüm dükkânı: her değişiklik ücretli, 100–10.000; başka dükkânın alanı satılmaz', () => {
  const all = [...Object.values(AV_PRICES).flatMap((o) => Object.values(o)), ...Object.values(AV_COLOR_PRICES)];
  assert.ok(Math.min(...all) >= 100 && Math.max(...all) <= 10000);
  const cur = avCurrent({ hairStyle: 'short' });
  assert.equal(avShopQuote('berber', cur, { ...cur }).total, 0);
  const q = avShopQuote('berber', cur, { ...cur, hairStyle: 'afro', hairColor: '#111111', clothing: 'tuxedo' });
  assert.equal(q.total, AV_PRICES.hairStyle.afro + AV_COLOR_PRICES.hairColor);
  assert.deepEqual(Object.keys(q.changes).sort(), ['hairColor', 'hairStyle']);
  assert.equal(avShopQuote('berber', cur, { hairStyle: '<x>' }).bad, 'hairStyle');
  assert.equal(avFieldPrice('skin', 'red'), null);
});

test('La Marea: bar fiyatlarının 2–3 katı', () => {
  for (const k of ['kokteyl', 'su']) assert.ok(RESTORAN_MENU[k] >= MENU_PRICES[k] * 2 && RESTORAN_MENU[k] <= MENU_PRICES[k] * 3);
});
