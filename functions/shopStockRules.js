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
export const STOCK_PRICE_STEP = 100; // (eski sabit — v132'den beri fiyata göre: stockPriceStep)
// v132: fiyat çubuğu ürünün fiyatına göre oynar — 1.000'e kadar 10, 50.000'e kadar 100,
// 500.000'e kadar 1.000, üstü 10.000 (pahalı ürünlerde fiyat belirlemek kolay olsun)
export function stockPriceStep(storePrice) {
  const p = Math.max(0, Number(storePrice) || 0);
  if (p <= 1000) return 10;
  if (p <= 50_000) return 100;
  if (p <= 500_000) return 1000;
  return 10_000;
}

export const stockUnitCost = (storePrice) => Math.round(Math.max(0, Number(storePrice) || 0) * STOCK_COST_FRAC);
// Bant adımın katları: en az = %80 (yukarı yuvarlanır), en çok = mağaza fiyatı (aşağı yuvarlanır)
export const stockPriceBand = (storePrice) => {
  const step = stockPriceStep(storePrice);
  const p = Math.max(0, Math.round(Number(storePrice) || 0));
  const max = Math.max(step, Math.floor(p / step) * step);
  const min = Math.min(max, Math.ceil((p * STOCK_MIN_PRICE_FRAC) / step) * step);
  return { min, max, step };
};
export const validStockPrice = (storePrice, price) => {
  const b = stockPriceBand(storePrice);
  return Number.isInteger(price) && price % b.step === 0 && price >= b.min && price <= b.max;
};
// Kayıtlı fiyat yoksa → mağaza fiyatı (en çok); varsa banda ve adımın katına çekilir
export function clampStockPrice(storePrice, saved) {
  const b = stockPriceBand(storePrice);
  const v = Math.round(Number(saved) / b.step) * b.step;
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

// =============================================================================
// v132 — "Vitrine ekle" artık önce 2. el pazarına bakar: hiç işlem görmemiş (ömrü
// tam, tamir hakkı hiç kullanılmamış, hiç geliştirilmemiş) bir araç / silah
// alış fiyatına (stockUnitCost) eşit ya da daha ucuza satıştaysa en ucuzu alınır
// (para ilan sahibine; ürün dükkânın stoğuna girer). Çete deposundaki ürünler her
// zaman sıfırdır. Yoksa oyunun mağazasından alış fiyatıyla alınır.
// =============================================================================
const WEAPON_LIFE_CAP = 10; // itemRules.WEAPON_INITIAL_LIFE_DAYS
const VEHICLE_LIFE_CAP = 20; // itemRules.VEHICLE_WEAPON_INITIAL_LIFE_DAYS
// Ürün belgesi (weapons / vehicles)
export function isPristineItem(kind, it) {
  if (!it) return false;
  if (Number(it.repairsUsed || 0) !== 0) return false;
  if (kind === 'weapon') return Number(it.lifeDays ?? WEAPON_LIFE_CAP) >= WEAPON_LIFE_CAP && Number(it.level || 1) === 1;
  if (it.mortgaged || it.seizedByBank) return false;
  return (
    Number(it.lifeDays ?? VEHICLE_LIFE_CAP) >= VEHICLE_LIFE_CAP &&
    !it.gearUpgraded &&
    !it.tankUpgraded &&
    !(Number(it.tankBonus || 0) > 0) &&
    !(Number(it.raceLevel || 1) > 1) &&
    !(Number(it.level || 1) > 1)
  );
}
// 2. el ilan belgesi (marketplaceListings) — ilandaki dondurulmuş alanlarla
export function isPristineListing(l) {
  if (!l || l.sold || l.shopHouseId) return false;
  if (l.itemType === 'weapon') return Number(l.weaponLifeDays ?? -1) >= WEAPON_LIFE_CAP && Number(l.weaponRepairsUsed || 0) === 0 && Number(l.weaponLevel || 1) === 1;
  if (l.itemType === 'vehicle') {
    return Number(l.vehicleLifeDays ?? -1) >= VEHICLE_LIFE_CAP && Number(l.vehicleRepairsUsed || 0) === 0 && !l.vehicleGearUpgraded && !l.vehicleTankUpgraded && !(Number(l.vehicleRaceLevel || 1) > 1);
  }
  return false;
}
// Kaynak sırası: önce ucuz, eşitse eski ilan
export const sourceOrder = (a, b) => a.price - b.price || a.at - b.at || String(a.id).localeCompare(String(b.id));
// Bir adet için en ucuz kaynak fiyatı (alış fiyatından pahalı ilan sayılmaz)
export function bestStockPrice(storePrice, sources = []) {
  const unit = stockUnitCost(storePrice);
  let best = unit;
  for (const s of sources) if (s.price > 0 && s.price < best) best = s.price;
  return best;
}
