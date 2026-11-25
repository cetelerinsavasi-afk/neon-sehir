// =============================================================================
// v156 — BENZİNLİK: "⛽ Benzin al" (100 altın, sadece RP — hiçbir şeye etki etmez)
// ve benzinlik marketi (kola, cips… → eldeki ürün, 2 dk, seyyar satıcı menüsüyle aynı).
// v203: gelir devlete GİTMEZ (Ticaret Bakanlığı kaleminden kalktı) — altın oyundan çıkar.
// Firestore: işlem başına kullanıcı + (markette) eldeki ürün; devlet defterine yazım yok.
// =============================================================================
import { HOUSE_PRODUCTS } from './houseCatalogData.js';

export const FUEL_PRICE = 100;
// Market menüsü (ürün → fiyat). Ürünler oyunun eldeki ürünleri (HOUSE_PRODUCTS).
export const GAS_MARKET_MENU = { kola: 60, cips: 50, cikolata: 50, biskuvi: 40, enerji: 80, su: 20, meyveSuyu: 50 };

export function createGasStation({ db, FieldValue, HttpsError, goldTag, heldItemMs, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const userRef = (uid) => db.collection('users').doc(uid);

  async function charge(uid, price, extra) {
    const t = now();
    await db.runTransaction(async (tx) => {
      const u = (await tx.get(userRef(uid))).data();
      if (!u || (u.gold || 0) < price) fail('failed-precondition', 'Yetersiz altın.');
      tx.update(userRef(uid), { gold: FieldValue.increment(-price), goldTag: goldTag('benzinlik') });
      extra?.(tx, t);
    });
    return t;
  }

  // ⛽ Benzin al — sadece RP
  async function fuelBuy(uid) {
    await charge(uid, FUEL_PRICE);
    return { ok: true, price: FUEL_PRICE };
  }

  // 🛒 Market — ürün ele gelir (2 dk, ısmarlanabilir)
  async function marketBuy(uid, p) {
    const item = typeof p?.item === 'string' ? p.item : '';
    if (!Object.prototype.hasOwnProperty.call(GAS_MARKET_MENU, item) || !HOUSE_PRODUCTS[item]) fail('invalid-argument', 'Geçersiz ürün.');
    const price = GAS_MARKET_MENU[item];
    let until = 0;
    const put = (tx, t) => {
      until = t + heldItemMs;
      tx.set(db.collection('heldItems').doc(uid), { itemId: item, venue: 'ev', houseId: null, untilMs: until, boughtAtMs: t });
    };
    await charge(uid, price, put);
    return { ok: true, itemId: item, price, untilMs: until };
  }

  return { fuelBuy, marketBuy };
}
