// =============================================================================
// shopStockRules.js — v130 Silahçı / Galeri STOK sistemi (saf; sunucu + istemci)
// -----------------------------------------------------------------------------
// Oyuncu artık kendi envanterindeki silah / arabayı dükkânda satmaz. Dükkân sahibi
// oyunun mağazasındaki ürünlerden stok alır, belirlediği fiyattan müşteriye satar:
//   · Alış (stok)  : oyunun mağaza fiyatının %75'i (para oyundan çıkar)
//   · Satış fiyatı : oyunun mağaza fiyatının %80'i – %100'ü
//   · Vergi        : sadece KÂRDAN (satış − alış), Ticaret Bakanlığı
//                    "Sıfır Silah / Araba Satış Kâr Vergisi" (sfSilah / sfAraba)
// Oyunun kendi silahçısı / galerisi de aynı kâr vergisini öder (kâr = fiyatın %25'i).
//
// Belge: shopStocks/{houseId} (herkes okur, sadece sunucu yazar)
//   { ownerUid, type, items: { katalogId: adet }, paid: { katalogId: kalan stoğun ödenen tutarı },
//     prices: { katalogId: satış fiyatı }, updatedAtMs }
// =============================================================================

export const STOCK_KIND = { silahci: 'weapon', galeri: 'vehicle' };
export const STOCK_COST_FRAC = 0.75;
export const STOCK_MIN_PRICE_FRAC = 0.8;
export const STOCK_ADD_MAX = 50; // tek seferde en fazla
export const STOCK_PRICE_STEP = 100; // satış fiyatı 100'er oynar (küsurat yok)

export const stockUnitCost = (storePrice) => Math.round(Math.max(0, Number(storePrice) || 0) * STOCK_COST_FRAC);
// Bant 100'ün katları: en az = %80 (yukarı yuvarlanır), en çok = mağaza fiyatı (aşağı yuvarlanır)
export const stockPriceBand = (storePrice) => {
  const p = Math.max(0, Math.round(Number(storePrice) || 0));
  const max = Math.max(STOCK_PRICE_STEP, Math.floor(p / STOCK_PRICE_STEP) * STOCK_PRICE_STEP);
  const min = Math.min(max, Math.ceil((p * STOCK_MIN_PRICE_FRAC) / STOCK_PRICE_STEP) * STOCK_PRICE_STEP);
  return { min, max };
};
export const validStockPrice = (storePrice, price) => {
  const b = stockPriceBand(storePrice);
  return Number.isInteger(price) && price % STOCK_PRICE_STEP === 0 && price >= b.min && price <= b.max;
};
// Kayıtlı fiyat yoksa → mağaza fiyatı (en çok); varsa banda ve 100'ün katına çekilir
export function clampStockPrice(storePrice, saved) {
  const b = stockPriceBand(storePrice);
  const v = Math.round(Number(saved) / STOCK_PRICE_STEP) * STOCK_PRICE_STEP;
  if (!Number.isFinite(v) || !saved) return b.max;
  return Math.min(b.max, Math.max(b.min, v));
}
// Satılan 1 adedin maliyeti (ortalama) — stoğun ödenen tutarından
export function stockUnitPaid(stockDoc, cid, storePrice) {
  const qty = Math.max(0, Math.floor(Number(stockDoc?.items?.[cid]) || 0));
  const paid = Math.max(0, Math.round(Number(stockDoc?.paid?.[cid]) || 0));
  if (qty <= 0) return stockUnitCost(storePrice);
  return Math.round(paid / qty);
}
export const stockQty = (stockDoc, cid) => Math.max(0, Math.floor(Number(stockDoc?.items?.[cid]) || 0));
