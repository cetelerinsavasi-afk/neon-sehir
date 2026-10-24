// =============================================================================
// casinoRules.js — v124 GAZİNO KURALLARI (sunucu + istemci ortak, saf JS)
// =============================================================================
// Burada Node'a özgü hiçbir şey yok (istemci de içe aktarıyor). Rastgelelik
// dışarıdan verilir (sunucu: crypto.randomInt).
//
// SLOT: 3 makara × {boş, yasaklı madde, altın} — her makara bağımsız, eşit olasılık.
//   2 aynı: boş 0 · yasaklı 1 adet · altın 1.000      3 aynı: boş 0 · yasaklı 3 · altın 10.000
//   Oyunun gazinosu: çevirme 1.600 (v126: 200 devlet kârı + 1.400 maliyet/çöp).
//   Oyuncu gazinosu: 1.400–1.600 (50'şer).
//   Oyuncu gazinosunda slotun çalışması için makinede en az 3 yasaklı + 10.000 altın.
// RULET (kullanıcının örneği Rulet.html ile birebir): 0–12; sayıya veya yeşile (0)
//   bahis 12 katı, kırmızı/siyah 2 katı geri gelir.
// PİYANGO: bilet 100. Oyunun gazinosu biletten 10 alır (90 havuza); oyuncu
//   gazinosunda sahibi 1–10 belirler. Gece: kazanana havuz − %10 piyango vergisi;
//   v126: oyunun gazinosunun payının TAMAMI devlete (kâr, vergi değil) · oyuncu
//   gazinosunda payın %10'u devlete, kalanı sahibine.
// v126: oyunun gazinosunun TÜM kârı devlete — bkz. functions/gameCasinoVault.js
//   (slot 200/çevirme · rulet ve 10 Numara günlük net, artıdaysa).
// =============================================================================

export const GAME_CASINO_ID = 'game';

// ---- SLOT -------------------------------------------------------------------
export const SLOT_GAME_COST = 1600;
export const GAME_SLOT_STATE_CUT = 200; // v126: her çevirmede devletin kârı (kalan 1.400 maliyet → çöp)
export const SLOT_PRICE_MIN = 1400;
export const SLOT_PRICE_MAX = 1600;
export const SLOT_PRICE_STEP = 50;
export const SLOT_SYMBOLS = ['bos', 'yasakliMadde', 'altin'];
export const SLOT_SYMBOL_LABEL = { bos: 'Boş', yasakliMadde: 'Yasaklı Madde', altin: 'Altın' };
export const SLOT_PRIZES = {
  bos: { 2: { gold: 0, yasakliMadde: 0 }, 3: { gold: 0, yasakliMadde: 0 } },
  yasakliMadde: { 2: { gold: 0, yasakliMadde: 1 }, 3: { gold: 0, yasakliMadde: 3 } },
  altin: { 2: { gold: 1000, yasakliMadde: 0 }, 3: { gold: 10000, yasakliMadde: 0 } },
};
// Oyuncu gazinosunda slotun çalışabilmesi için makinede bulunması gereken en az stok
// (= tek çevirmede verilebilecek en büyük ödül)
export const SLOT_MIN_STOCK = { gold: 10000, yasakliMadde: 3 };

export function slotPriceOk(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= SLOT_PRICE_MIN && n <= SLOT_PRICE_MAX && (n - SLOT_PRICE_MIN) % SLOT_PRICE_STEP === 0;
}

// randInt(n) → 0..n-1
export function rollSlotReels(randInt) {
  return [0, 1, 2].map(() => SLOT_SYMBOLS[randInt(SLOT_SYMBOLS.length)]);
}
export function slotOutcome(reels) {
  const counts = {};
  reels.forEach((s) => {
    counts[s] = (counts[s] || 0) + 1;
  });
  let matchSymbol = null;
  let matchCount = 0;
  Object.entries(counts).forEach(([s, c]) => {
    if (c >= 2 && c > matchCount) {
      matchSymbol = s;
      matchCount = c;
    }
  });
  const prize = matchSymbol ? SLOT_PRIZES[matchSymbol]?.[matchCount] || { gold: 0, yasakliMadde: 0 } : { gold: 0, yasakliMadde: 0 };
  return { matchSymbol, matchCount, gold: prize.gold, yasakliMadde: prize.yasakliMadde };
}

// ---- RULET ------------------------------------------------------------------
export const ROULETTE_ORDER = [0, 7, 4, 11, 2, 9, 6, 1, 12, 5, 10, 3, 8]; // çark dizilişi
export const ROULETTE_REDS = new Set([1, 3, 5, 7, 9, 11]);
export const ROULETTE_CHIPS = [10, 100, 1000];
export const ROULETTE_MAX_TOTAL = 100000; // tek çevirmede en fazla toplam bahis (v124 kararı)
export const rouletteColor = (n) => (n === 0 ? 'green' : ROULETTE_REDS.has(n) ? 'red' : 'black');
export const ROULETTE_KEYS = ['red', 'black', 'green', ...Array.from({ length: 12 }, (_, i) => `n${i + 1}`)];
export const rouletteMult = (k) => (k === 'red' || k === 'black' ? 2 : 12);
export const rouletteKeyLabel = (k) => (k === 'red' ? 'Kırmızı' : k === 'black' ? 'Siyah' : k === 'green' ? 'Yeşil (0)' : `Sayı ${k.slice(1)}`);

// Geçerli bahisler: { anahtar: pozitif tam sayı }. Geçersizse null.
export function normalizeRouletteBets(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let total = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!ROULETTE_KEYS.includes(k)) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) return null;
    if (n === 0) continue;
    out[k] = n;
    total += n;
  }
  if (total <= 0 || total > ROULETTE_MAX_TOTAL) return null;
  return { bets: out, total };
}
// n sayısı gelince geri ödenen TOPLAM (bahis dahil)
export function roulettePayout(bets, n) {
  const m = { [`n${n}`]: 12, [rouletteColor(n)]: n === 0 ? 12 : 2 };
  let win = 0;
  for (const k of Object.keys(bets)) if (m[k]) win += bets[k] * m[k];
  return win;
}
// En kötü durumda kasanın vermesi gereken NET kazanç (ödeme − bahis), en az 0
export function rouletteMaxNetWin(bets) {
  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  let worst = 0;
  for (const n of ROULETTE_ORDER) worst = Math.max(worst, roulettePayout(bets, n) - total);
  return worst;
}

// ---- PİYANGO ----------------------------------------------------------------
export const LOTTERY_TICKET = 100; // oyunun gazinosunda bilet (90 havuz + 10 kâr)
export const GAME_LOTTERY_CUT = 10;
// v124 Faz 6 (kullanıcı düzeltmesi): bilet fiyatı = 90 (havuza) + gazinonun kârı.
// kâr 10 → 100 altın · kâr 1 → 91 altın. Havuza her bilette 90 gider.
export const LOTTERY_POOL_PER_TICKET = 90;
export const lotteryTicketPrice = (cut) => LOTTERY_POOL_PER_TICKET + Math.max(0, Math.floor(Number(cut) || 0));
export const LOTTERY_CUT_MIN = 1;
export const LOTTERY_CUT_MAX = 10;
export const CASINO_STATE_TAX_RATE = 0.1; // gazinonun piyango payının %10'u devlete
export function lotteryCutOk(c) {
  const n = Number(c);
  return Number.isInteger(n) && n >= LOTTERY_CUT_MIN && n <= LOTTERY_CUT_MAX;
}
// Gece: gazinonun toplam payı → { tax (devlete), rest (oyun: çöp · oyuncu: sahibine) }
// v127: oran Ticaret Bakanlığı (Kumarhane) — rate verilmezse varsayılan
export function splitCasinoCut(cutTotal, rate = CASINO_STATE_TAX_RATE) {
  const g = Math.max(0, Math.floor(Number(cutTotal) || 0));
  const tax = Math.floor(g * Math.max(0, Number(rate) || 0));
  return { tax, rest: g - tax };
}
