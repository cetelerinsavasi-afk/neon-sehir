// v103 — 2. el malzeme ilanı otomatik satış kuralı (sunucu: functions/listingBatches.js).
// Adet fiyatı izin verilen aralığın %50'sinin ALTINDAYSA, satılmayan her parti
// 7 gün sonra oyuna otomatik satılır; tam %50 ve üstü eskisi gibi iade edilir.
// Örn. tamir malzemesi 5–10 → 7 ve altı otomatik satılır, 8 ve üstü satılmaz.
export function autoSellsAt(unitPrice, min, max) {
  const p = Number(unitPrice);
  if (!Number.isFinite(p) || !(Number(max) > Number(min))) return false;
  return 2 * p < Number(min) + Number(max);
}

export const AUTO_SELL_HINT = '⏱️ 7 gün içinde otomatik satılır';

// v115 — araç / silah ilanı (2. el + galerici/silahçı vitrini). Sunucu:
// functions/listingBatches.js (itemCancelPenalty) — ikisi birlikte değişmeli.
// İlan konduğu İstanbul gününde (00:00'dan önce) iptal bedelsiz; 00:00
// geçtiyse iptal ürünün ömrünü 1 gün kısaltır.
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
export function istanbulDayKeyOf(ms) {
  return new Date(Number(ms) + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}
export function itemCancelPenalty(listing, nowMs = Date.now()) {
  const startMs = Number(listing?.listedAtMs) || listing?.createdAt?.toMillis?.() || 0;
  const startKey = listing?.listedDayKey || (startMs ? istanbulDayKeyOf(startMs) : null);
  if (!startKey) return true;
  return istanbulDayKeyOf(nowMs) !== startKey;
}
export const ITEM_CANCEL_PENALTY_TEXT = 'İlanı iptal edersen ömrü 1 gün kısalır.';
export const ITEM_EXPIRE_HINT = '⏱️ 7 gün içinde satılmazsa ilandan kaldırılır (ömrü azalmaz)';
export const ITEM_LISTING_RULES = 'İlandayken ömrü azalmaz · 00:00\'dan önce bedelsiz iptal edebilirsin, sonrasında iptal ömrü 1 gün kısaltır.';
