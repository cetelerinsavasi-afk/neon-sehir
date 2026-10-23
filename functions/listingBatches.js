// v103 — 2. EL MALZEME İLANLARI: parti (batch) bazlı 7 gün + otomatik satış
// -----------------------------------------------------------------------------
// Aynı satıcı + aynı malzeme + aynı adet fiyatı tek ilanda birleşir, ama her
// ekleme kendi 7 gününü taşır: 6 gün önce 100.000, bugün 100.000 eklendiyse
// 7. gün sadece ilk 100.000'in süresi dolar, yenisi kendi gününde. Satışlar
// en eski partiden düşer (FIFO).
//
// Süresi dolan parti:
//   - adet fiyatı, izin verilen aralığın %50'sinin ALTINDAYSA → oyun satın
//     alır (satıcıya parası ödenir).
//   - %50 ve üstündeyse (tam %50 dahil) → eskisi gibi ilandan kalkar, ürün
//     sahibine iade edilir.
// Örnek tamir malzemesi 5–10: orta nokta 7,5 → 7 ve altı otomatik satılır,
// 8 ve üstü iade edilir.
//
// Oyuncu ilanları (marketplaceListings) ve çete deposu ilanları
// (gangWorlds/{dünya}/market) aynı kuralları kullanır. İstemci kopyası:
// src/lib/autoSell.js (aynı formül — ikisi birlikte değişmeli).

export const LISTING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Aralığın %50'sinin altında mı? Tamsayı karşılaştırma: 2p < min + max.
export function autoSellsAt(unitPrice, min, max) {
  const p = Number(unitPrice);
  if (!Number.isFinite(p) || !(max > min)) return false;
  return 2 * p < Number(min) + Number(max);
}

// Malzeme fiyat aralığı: Amazor (mağaza) fiyatının yarısı – tamamı.
export function materialRange(storePrice) {
  const max = Math.floor(Number(storePrice) || 0);
  return { min: Math.floor(max / 2), max };
}

// İlanın partileri. Eski (partisiz) ilan tek parti sayılır: createdAt anı.
export function batchesOf(listing, createdAtMs) {
  const qty = Math.max(0, Math.floor(Number(listing?.quantity || 0)));
  if (Array.isArray(listing?.batches)) {
    const list = listing.batches
      .map((b) => ({ q: Math.max(0, Math.floor(Number(b?.q || 0))), at: Number(b?.at || 0) }))
      .filter((b) => b.q > 0)
      .sort((a, b) => a.at - b.at);
    // Güvenlik ağı: partiler toplamı ilandaki adetle tutmazsa en yeni partiden düzelt
    let sum = list.reduce((s, b) => s + b.q, 0);
    if (sum > qty) {
      for (let i = list.length - 1; i >= 0 && sum > qty; i -= 1) {
        const cut = Math.min(list[i].q, sum - qty);
        list[i].q -= cut;
        sum -= cut;
      }
    } else if (sum < qty) {
      list.push({ q: qty - sum, at: list.length ? list[list.length - 1].at : Number(createdAtMs || 0) });
    }
    return list.filter((b) => b.q > 0);
  }
  return qty > 0 ? [{ q: qty, at: Number(createdAtMs || 0) }] : [];
}

// Yeni parti ekle (aynı an tekrar eklenirse birleşir).
export function addBatch(batches, qty, atMs) {
  const out = batches.map((b) => ({ ...b }));
  const last = out[out.length - 1];
  if (last && last.at === atMs) last.q += qty;
  else out.push({ q: qty, at: atMs });
  return out;
}

// Satış: en eski partiden düş (FIFO).
export function consumeBatches(batches, qty) {
  let left = Math.max(0, Math.floor(Number(qty) || 0));
  const out = [];
  for (const b of batches) {
    if (left <= 0) {
      out.push({ ...b });
      continue;
    }
    const take = Math.min(b.q, left);
    left -= take;
    if (b.q - take > 0) out.push({ q: b.q - take, at: b.at });
  }
  return out;
}

// Süresi dolan partileri ayır.
export function splitDue(batches, nowMs, ttlMs = LISTING_TTL_MS) {
  const due = [];
  const keep = [];
  for (const b of batches) (b.at + ttlMs <= nowMs ? due : keep).push(b);
  return { dueQty: due.reduce((s, b) => s + b.q, 0), keep };
}

// Bir sonraki süre dolumu (ilk partinin 7. günü) — yoksa null.
export function nextExpireAtMs(batches, ttlMs = LISTING_TTL_MS) {
  if (!batches.length) return null;
  return Math.min(...batches.map((b) => b.at)) + ttlMs;
}

// -----------------------------------------------------------------------------
// v115 — ARAÇ / SİLAH İLANLARI (2. el + galerici/silahçı vitrin ilanı)
// -----------------------------------------------------------------------------
// - İlandayken ömür azalmaz (dailyReset).
// - İlan konduğu İstanbul gününde (00:00'dan önce) iptal bedelsiz; 00:00
//   geçtikten sonra iptal edilirse ürünün ömrü 1 gün kısalır.
// - 7. gün: fiyat, ilan konduğu andaki bandın tam ortasının ALTINDAYSA oyun
//   satın alır; %50 ve üstündeyse ilan kalkar, ömür azalmaz.
// İstemci kopyası: src/lib/autoSell.js (aynı kurallar — birlikte değişmeli).
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
export function istanbulDayKeyOf(ms) {
  return new Date(Number(ms) + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

// İlan belgesine yazılan zaman + bant alanları
export function itemListingTimeFields(nowMs, band) {
  return {
    listedAtMs: nowMs,
    listedDayKey: istanbulDayKeyOf(nowMs),
    expireAtMs: nowMs + LISTING_TTL_MS,
    bandMin: Math.floor(Number(band?.min) || 0),
    bandMax: Math.floor(Number(band?.max) || 0),
  };
}

// İlan konduğundan beri 00:00 geçti mi? (eski ilanda createdAt'ten)
export function itemCancelPenalty(listing, nowMs) {
  const startMs = Number(listing?.listedAtMs) || listing?.createdAt?.toMillis?.() || 0;
  const startKey = listing?.listedDayKey || (startMs ? istanbulDayKeyOf(startMs) : null);
  if (!startKey) return true;
  return istanbulDayKeyOf(nowMs) !== startKey;
}
