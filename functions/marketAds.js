// v96 — 2. el reklam ücreti, "📢 Reklam Verilen Ürünler" panelindeki reklam sayısına göre artar:
// 0 reklam → 1.000 · 9 reklam → 10.000 (her reklam +1.000, süresi dolan / satılan düşer).
// Sayılan: oyuncu ilanları + çete ilanları (aynı çete + ürün + fiyat panelde tek kart → tek sayılır).
export const AD_BASE_PRICE = 1000;
export const adPriceFor = (activeAds) => AD_BASE_PRICE * (Math.max(0, Math.floor(Number(activeAds) || 0)) + 1);

export function countAdsFrom({ playerListings = [], gangListings = [], nowMs = Date.now() }) {
  const ms = (t) => (typeof t?.toMillis === 'function' ? t.toMillis() : Number(t || 0));
  const players = playerListings.filter((l) => !l.sold && ms(l.adExpiresAt) > nowMs).length;
  const groups = new Set(
    gangListings
      .filter((l) => l.status === 'open' && Number(l.quantity || 0) > 0 && Number(l.adExpiresAtMs || 0) > nowMs)
      .map((l) => `${l.gangId}|${l.itemKey}|${l.unitPrice}`)
  );
  return players + groups.size;
}

// Sunucu: şu anki reklam sayısı (playersCol: marketplaceListings, gangMarketCol: gangWorlds/{w}/market | null)
export async function countActiveAds({ playersCol, gangMarketCol, Timestamp, nowMs = Date.now() }) {
  const [p, g] = await Promise.all([
    playersCol.where('adExpiresAt', '>', Timestamp ? Timestamp.fromMillis(nowMs) : new Date(nowMs)).limit(300).get(),
    gangMarketCol ? gangMarketCol.where('adExpiresAtMs', '>', nowMs).limit(300).get() : Promise.resolve({ docs: [] }),
  ]);
  return countAdsFrom({ playerListings: p.docs.map((d) => d.data()), gangListings: g.docs.map((d) => d.data()), nowMs });
}
