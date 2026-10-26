// v132 — "price-changed:N" sunucu hatası → kısa metin (fiyat az önce değişti)
export function priceChangedText(err) {
  const m = String(err?.message || '').match(/price-changed:(\d+)/);
  return m ? `Fiyat az önce değişti: ${Number(m[1]).toLocaleString('tr-TR')} altın. Tekrar dene.` : null;
}
