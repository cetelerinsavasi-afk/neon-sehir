// v124 — Gazino kuralları (functions/casinoRules.js) + sunucu bağlantıları
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  slotOutcome,
  rollSlotReels,
  SLOT_SYMBOLS,
  slotPriceOk,
  normalizeRouletteBets,
  roulettePayout,
  rouletteMaxNetWin,
  rouletteColor,
  ROULETTE_ORDER,
  splitCasinoCut,
  LOTTERY_TICKET,
  GAME_LOTTERY_CUT,
} from '../casinoRules.js';
import { splitLotteryTax } from '../tax.js';

test('slot ödül tablosu (kullanıcı notu)', () => {
  assert.deepEqual(slotOutcome(['bos', 'bos', 'altin']), { matchSymbol: 'bos', matchCount: 2, gold: 0, yasakliMadde: 0 });
  assert.deepEqual(slotOutcome(['bos', 'bos', 'bos']), { matchSymbol: 'bos', matchCount: 3, gold: 0, yasakliMadde: 0 });
  assert.deepEqual(slotOutcome(['yasakliMadde', 'altin', 'yasakliMadde']), { matchSymbol: 'yasakliMadde', matchCount: 2, gold: 0, yasakliMadde: 1 });
  assert.deepEqual(slotOutcome(['yasakliMadde', 'yasakliMadde', 'yasakliMadde']).yasakliMadde, 3);
  assert.equal(slotOutcome(['altin', 'bos', 'altin']).gold, 1000);
  assert.equal(slotOutcome(['altin', 'altin', 'altin']).gold, 10000);
  assert.equal(slotOutcome(['bos', 'yasakliMadde', 'altin']).matchSymbol, null);
  // tüm 27 sonuç: beklenen altın ödemesi < çevirme ücreti
  let gold = 0;
  let ym = 0;
  for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS) {
    const o = slotOutcome([a, b, c]);
    gold += o.gold;
    ym += o.yasakliMadde;
  }
  assert.ok(gold / 27 < 700 && ym / 27 < 0.34);
  let i = 0;
  assert.deepEqual(rollSlotReels(() => i++ % 3), ['bos', 'yasakliMadde', 'altin']);
  assert.ok(slotPriceOk(1400) && slotPriceOk(1550) && slotPriceOk(1600));
  assert.ok(!slotPriceOk(1425) && !slotPriceOk(1650) && !slotPriceOk(1350));
});

test('rulet: Rulet.html ile aynı ödemeler, bahis doğrulama', () => {
  assert.equal(rouletteColor(0), 'green');
  assert.equal(rouletteColor(7), 'red');
  assert.equal(rouletteColor(8), 'black');
  assert.equal(ROULETTE_ORDER.length, 13);
  assert.equal(roulettePayout({ n7: 10 }, 7), 120);
  assert.equal(roulettePayout({ red: 100 }, 7), 200);
  assert.equal(roulettePayout({ red: 100 }, 0), 0);
  assert.equal(roulettePayout({ green: 10 }, 0), 120);
  assert.equal(roulettePayout({ black: 100, n8: 10 }, 8), 320);
  assert.equal(normalizeRouletteBets({}), null);
  assert.equal(normalizeRouletteBets({ n13: 10 }), null);
  assert.equal(normalizeRouletteBets({ red: 1.5 }), null);
  assert.equal(normalizeRouletteBets({ red: -1 }), null);
  assert.equal(normalizeRouletteBets({ red: 100001 }), null);
  assert.deepEqual(normalizeRouletteBets({ red: 100, n3: 0 }), { bets: { red: 100 }, total: 100 });
  // en kötü durumda kasanın net ödemesi
  assert.equal(rouletteMaxNetWin({ n1: 100 }), 1100);
  assert.equal(rouletteMaxNetWin({ red: 100, black: 100 }), 0);
});

test('piyango: 100 bilet → kazanana 8.100, devlete 900 + 100, gazinoya 900', () => {
  const tickets = 100;
  const pool = tickets * (LOTTERY_TICKET - GAME_LOTTERY_CUT);
  const cut = tickets * GAME_LOTTERY_CUT;
  assert.equal(pool, 9000);
  const w = splitLotteryTax(pool);
  assert.deepEqual([w.net, w.tax], [8100, 900]);
  assert.deepEqual(splitCasinoCut(cut), { tax: 100, rest: 900 });
});

test('index.js: slot 1.600 + yeni semboller, rulet sunucuda, piyango 90/10, ücretsiz slot yok', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const slot = src.slice(src.indexOf('export const spinSlot'), src.indexOf('export const spinRoulette'));
  assert.ok(slot.includes('SLOT_GAME_COST') && slot.includes('rollSlotReels(randInt)') && !slot.includes('dailyActions'));
  const rul = src.slice(src.indexOf('export const spinRoulette')).slice(0, 1500);
  assert.ok(rul.includes('normalizeRouletteBets') && rul.includes('payout - nb.total'));
  const buy = src.slice(src.indexOf('export const buyLotteryTicket')).slice(0, 2500);
  assert.ok(buy.includes('LOTTERY_POOL_PER_TICKET') && buy.includes('casinoCut'));
  assert.ok(src.includes('const LOTTERY_BASE_JACKPOT = 0;'));
  // v126: oyunun gazinosunun bilet kârının tamamı devlete (vergi değil)
  assert.ok(src.includes("cat: 'gazino_piyango', amount: Number(lottery.casinoCut || 0)"));
  assert.ok(!src.includes("source: 'gazino', uid: '__game__'"));
});
