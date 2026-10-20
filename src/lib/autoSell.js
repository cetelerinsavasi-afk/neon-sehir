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
