// v40 yatırım rejimi / alış oranı kontrolü (Firebase gerektirmez). v63: dışlama yok.
// Çalıştır: node functions/scripts/check-investments.mjs
// index.js içindeki SAF fonksiyonları metinden alıp çalıştırır.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const code = src.slice(src.indexOf("const INVESTMENT_ASSETS = ['diamond', 'stock', 'crypto'];"), src.indexOf('async function loadInvestmentTradesLast24h'));
const { INVESTMENT_REGIME_THRESHOLD, INVESTMENT_REGIME_FLOOR_RATIO, pickInvestmentRegime, investmentTradeWeight, computeInvestmentBuyRatios } = new Function(code + '\nreturn { INVESTMENT_REGIME_THRESHOLD, INVESTMENT_REGIME_FLOOR_RATIO, pickInvestmentRegime, investmentTradeWeight, computeInvestmentBuyRatios };')();
assert.equal(INVESTMENT_REGIME_FLOOR_RATIO, 0.5);
const H = 3600_000, now = Date.now();
// D) rejim seçimi
for (const [asset, th] of Object.entries(INVESTMENT_REGIME_THRESHOLD)) {
  // taban altı: oran ne olursa olsun normal
  for (const r of [null, 0, 0.5, 0.76, 1]) assert.equal(pickInvestmentRegime(th * INVESTMENT_REGIME_FLOOR_RATIO - 1, th, r).reversed, false, `${asset} taban`);
  // v50: eski taban (eşik/10) ile yeni taban (eşik/2) arası artık koşulsuz normal
  assert.equal(pickInvestmentRegime(th / 10, th, 0.9).reversed, false, `${asset} eski taban bölgesi → normal`);
  assert.equal(pickInvestmentRegime(th * 0.49, th, 0.9).reason, 'floor');
  // eşik ve üstü: hep ters, gösterilir
  for (const r of [null, 0, 0.9]) { const x = pickInvestmentRegime(th, th, r); assert.equal(x.reversed, true); assert.equal(x.shownReversed, true); }
  // arada
  const mid = th * 0.75;
  assert.equal(pickInvestmentRegime(mid, th, null).reversed, false, 'sinyal yok → normal');
  assert.equal(pickInvestmentRegime(mid, th, 0.75).reversed, false, '0.75 → normal');
  const hid = pickInvestmentRegime(mid, th, 0.7501);
  assert.equal(hid.reversed, true); assert.equal(hid.shownReversed, false, 'gizli ters');
  assert.equal(pickInvestmentRegime(th / 2, th, 0.9).reversed, true, 'tam eşik/2 → aradadır');
}
// ağırlık kovaları (üst sınır dahil)
assert.equal(investmentTradeWeight(0), 4); assert.equal(investmentTradeWeight(3 * H), 4); assert.equal(investmentTradeWeight(3 * H + 1), 3);
assert.equal(investmentTradeWeight(6 * H), 3); assert.equal(investmentTradeWeight(12 * H), 2); assert.equal(investmentTradeWeight(24 * H), 1); assert.equal(investmentTradeWeight(24 * H + 1), 0);
// C) oran — v63: en büyük alıcı ve satıcı DAHİL, herkes sayılır
const t = (assetType, uid, type, goldAmount, ageH) => ({ assetType, uid, type, goldAmount, createdAtMs: now - ageH * H });
let r = computeInvestmentBuyRatios([
  t('crypto', 'whale', 'buy', 1_000, 1),
  t('crypto', 'a', 'buy', 100, 1), t('crypto', 'b', 'buy', 100, 1),
  t('crypto', 'c', 'sell', 600, 1), t('crypto', 'd', 'sell', 200, 1),
], now);
// alış: (1000+100+100)×4 = 4800 ; satış: (600+200)×4 = 3200 ; oran 4800/8000 = 0.6 (whale ve c dahil)
assert.equal(r.crypto, 0.6); assert.equal(r.diamond, null); assert.equal(r.stock, null);
// aynı kişi hem alıp hem satsa: ikisi de sayılır
r = computeInvestmentBuyRatios([t('stock', 'x', 'buy', 1000, 1), t('stock', 'x', 'sell', 1000, 1), t('stock', 'y', 'buy', 10, 1), t('stock', 'z', 'sell', 30, 1)], now);
assert.equal(r.stock, 1010 / 2040);
// tek oyuncu da sinyal verir (artık dışlanmıyor)
r = computeInvestmentBuyRatios([t('diamond', 'solo', 'buy', 500, 1)], now);
assert.equal(r.diamond, 1);
// 24 saatten eski sayılmaz; yaş ağırlığı uygulanır
r = computeInvestmentBuyRatios([t('crypto', 'm', 'buy', 100, 1), t('crypto', 'n', 'sell', 100, 20), t('crypto', 'old', 'buy', 1e9, 25)], now);
assert.equal(r.crypto, 400 / 500, '1 sa ×4 alış, 20 sa ×1 satış; eski kayıt yok');
console.log('YATIRIM TESTLERİ TAMAM');
