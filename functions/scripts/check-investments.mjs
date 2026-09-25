// v40 yatırım rejimi / alış oranı kontrolü (Firebase gerektirmez).
// Çalıştır: node functions/scripts/check-investments.mjs
// index.js içindeki SAF fonksiyonları metinden alıp çalıştırır.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const code = src.slice(src.indexOf("const INVESTMENT_ASSETS = ['diamond', 'stock', 'crypto'];"), src.indexOf('async function loadInvestmentTradesLast24h'));
const { INVESTMENT_REGIME_THRESHOLD, pickInvestmentRegime, investmentTradeWeight, computeInvestmentBuyRatios } = new Function(code + '\nreturn { INVESTMENT_REGIME_THRESHOLD, pickInvestmentRegime, investmentTradeWeight, computeInvestmentBuyRatios };')();
const H = 3600_000, now = Date.now();
// D) rejim seçimi
for (const [asset, th] of Object.entries(INVESTMENT_REGIME_THRESHOLD)) {
  // taban altı: oran ne olursa olsun normal
  for (const r of [null, 0, 0.5, 0.76, 1]) assert.equal(pickInvestmentRegime(th / 10 - 1, th, r).reversed, false, `${asset} taban`);
  // eşik ve üstü: hep ters, gösterilir
  for (const r of [null, 0, 0.9]) { const x = pickInvestmentRegime(th, th, r); assert.equal(x.reversed, true); assert.equal(x.shownReversed, true); }
  // arada
  const mid = th / 2;
  assert.equal(pickInvestmentRegime(mid, th, null).reversed, false, 'sinyal yok → normal');
  assert.equal(pickInvestmentRegime(mid, th, 0.75).reversed, false, '0.75 → normal');
  const hid = pickInvestmentRegime(mid, th, 0.7501);
  assert.equal(hid.reversed, true); assert.equal(hid.shownReversed, false, 'gizli ters');
  assert.equal(pickInvestmentRegime(th / 10, th, 0.9).reversed, true, 'tam eşik/10 → aradadır');
}
// ağırlık kovaları (üst sınır dahil)
assert.equal(investmentTradeWeight(0), 4); assert.equal(investmentTradeWeight(3 * H), 4); assert.equal(investmentTradeWeight(3 * H + 1), 3);
assert.equal(investmentTradeWeight(6 * H), 3); assert.equal(investmentTradeWeight(12 * H), 2); assert.equal(investmentTradeWeight(24 * H), 1); assert.equal(investmentTradeWeight(24 * H + 1), 0);
// C) oran — en büyük alıcı ve en büyük satıcı ayrı ayrı dışlanır
const t = (assetType, uid, type, goldAmount, ageH) => ({ assetType, uid, type, goldAmount, createdAtMs: now - ageH * H });
let r = computeInvestmentBuyRatios([
  t('crypto', 'whale', 'buy', 1_000_000, 1),
  t('crypto', 'a', 'buy', 100, 1), t('crypto', 'b', 'buy', 100, 1),
  t('crypto', 'c', 'sell', 100, 1), t('crypto', 'd', 'sell', 50, 1),
], now);
// alış: 4M+400+400 → whale çıkar → 800 ; satış: 400+200 → c çıkar → 200 ; oran 0.8
assert.equal(r.crypto, 0.8); assert.equal(r.diamond, null); assert.equal(r.stock, null);
// aynı kişi hem en büyük alıcı hem en büyük satıcı → iki taraftan da
r = computeInvestmentBuyRatios([t('stock', 'x', 'buy', 1000, 1), t('stock', 'x', 'sell', 1000, 1), t('stock', 'y', 'buy', 10, 1), t('stock', 'z', 'sell', 30, 1)], now);
assert.equal(r.stock, 0.25);
// tek oyuncu → sinyal yok
r = computeInvestmentBuyRatios([t('diamond', 'solo', 'buy', 500, 1)], now);
assert.equal(r.diamond, null);
// 24 saatten eski sayılmaz; parçalamak kazandırmaz
r = computeInvestmentBuyRatios([...Array.from({ length: 100 }, () => t('crypto', 'split', 'buy', 10_000, 1)), t('crypto', 'm', 'buy', 5, 1), t('crypto', 'n', 'sell', 5, 1), t('crypto', 'o', 'sell', 5, 1), t('crypto', 'old', 'buy', 1e9, 25)], now);
assert.equal(r.crypto, 0.5, 'parçalı whale dışlandı, eski kayıt yok');
console.log('YATIRIM TESTLERİ TAMAM');
