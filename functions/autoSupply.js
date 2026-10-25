// =============================================================================
// v128 — Silahçı / Modifiye: eksik malzemeyi Mağaza'dan OTOMATİK tamamlama
// -----------------------------------------------------------------------------
// Müşteri tamir/geliştirme istediğinde dükkân sahibinin envanteri yetmiyorsa,
// Mağaza'daki (2. el malzeme ilanları) sahibin malzeme fiyatı VE ALTINDAKİ
// ilanlardan eksik kadar alınır — sanki sahip gidip almış ve satmış gibi:
//   - Önce en ucuz ilan; fiyat aynıysa stoğu EN AZ olan; o da aynıysa eski ilan.
//   - v129: sahibin KENDİ ilanı önce (envanter gibi, para el değiştirmez);
//     iptal edilmiş / boş ilan kullanılmaz.
//   - KÂR KORUMASI: alınan kısmın getirisi (işçilik + malzeme) − bu kısmın
//     vergisi − alış maliyeti ≥ 1 altın olmalı. 0 ya da eksi ise alım yapılmaz,
//     müşteriye "malzeme yok" denir (sahip istemediği bir işten zarar etmez).
//     Vergi, işin TOPLAM vergisinden (gerçek yuvarlamayla) sadece envanterden
//     karşılanan kısmın vergisi çıkarılarak bulunur → kuruşu kuruşuna doğru.
//   - Eksiğin tamamı bu koşullarla bulunamazsa hiç alım yapılmaz (iş yarım kalmaz).
// Saf fonksiyon (Firestore'a dokunmaz) — shop.js workshop transaction'ı kullanır.
// =============================================================================

export const AUTO_SUPPLY_MAT_NAMES = {
  tamirMalzemesi: 'tamir malzemesi',
  silahUpgrade: 'silah geliştirme malzemesi',
  arabaGelistirme: 'araba geliştirme malzemesi',
};

const unitOf = (l) => {
  const u = Number(l.unitPrice);
  if (Number.isFinite(u) && u > 0) return Math.round(u);
  const q = Number(l.quantity || 0);
  return q > 0 ? Math.round(Number(l.price || 0) / q) : Infinity;
};
const atOf = (l) => Number(l.createdAt?.toMillis?.() ?? l.createdAtMs ?? 0) || 0;

const sortCheapest = (a, b) => a.unit - b.unit || a.stock - b.stock || atOf(a.l) - atOf(b.l) || String(a.l.id).localeCompare(String(b.l.id));
const usable = (listings) =>
  (listings || [])
    .filter((l) => l && !l.sold && !l.cancelled && l.itemType === 'material')
    .map((l) => ({ l, unit: unitOf(l), stock: Math.floor(Number(l.quantity || 0)) }))
    .filter((c) => c.stock > 0 && Number.isFinite(c.unit) && c.unit > 0);

// OYUNCU dükkânı. Sıra: envanter → (v129) sahibin KENDİ ilanları (para el
// değiştirmez, envanter gibi) → başkalarının ilanları (fiyat ≤ sahibin fiyatı,
// en ucuz / eşitse stoğu az). Kâr koruması yalnızca başkasından alınan kısma.
// Döner: null ("malzeme yok") ya da
//   { need, ownQty, extQty, cost (sadece dış alım), profit, takes: [{ listing, qty, unit, own }] }
export function planAutoSupply({ listings, need, have, qty, mat, labor, ownerUid, taxOf }) {
  const n = Math.floor(Number(need) || 0);
  if (!(n > 0)) return null;
  const all = usable(listings);
  const own = all.filter((c) => c.l.sellerId === ownerUid).sort(sortCheapest);
  const ext = all.filter((c) => c.l.sellerId !== ownerUid && c.unit <= mat).sort(sortCheapest);
  const takes = [];
  let left = n;
  let ownQty = 0;
  let cost = 0;
  for (const c of own) {
    if (left <= 0) break;
    const take = Math.min(left, c.stock);
    takes.push({ listing: c.l, qty: take, unit: c.unit, own: true });
    ownQty += take;
    left -= take;
  }
  const extQty = left;
  for (const c of ext) {
    if (left <= 0) break;
    const take = Math.min(left, c.stock);
    takes.push({ listing: c.l, qty: take, unit: c.unit, own: false });
    cost += take * c.unit;
    left -= take;
  }
  if (left > 0) return null;
  let profit = null;
  if (extQty > 0) {
    // vergi: işin tamamının vergisi − (envanter + kendi ilanı) kısmının vergisi
    const fromInv = Math.max(0, Math.floor(Number(have) || 0)) + ownQty;
    const taxAll = taxOf(labor * qty) + taxOf(mat * qty);
    const taxInv = taxOf(labor * fromInv) + taxOf(mat * fromInv);
    profit = (labor + mat) * extQty - (taxAll - taxInv) - cost;
    if (profit < 1) return null;
  }
  return { need: n, ownQty, extQty, cost, profit, takes };
}

// v129 — OYUNUN dükkânı: kendi envanteri YOK. Malzemenin tamamı Mağaza'dan en
// ucuzdan (eşitse stoğu az olandan) alınır; Mağaza'da yetmeyen kısım tavan
// fiyatından (maxUnit) "yoktan" tamamlanır — oyunun dükkânında malzeme hiç
// bitmez ama oyuncuların ilanları varken yoktan üretilmez.
// Döner: { takes, boughtQty, virtualQty, listingCost, cost }
export function planGameSupply({ listings, qty, maxUnit }) {
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const cands = usable(listings).filter((c) => c.unit <= maxUnit).sort(sortCheapest);
  const takes = [];
  let left = n;
  let listingCost = 0;
  for (const c of cands) {
    if (left <= 0) break;
    const take = Math.min(left, c.stock);
    takes.push({ listing: c.l, qty: take, unit: c.unit, own: false });
    listingCost += take * c.unit;
    left -= take;
  }
  return { takes, boughtQty: n - left, virtualQty: left, listingCost, cost: listingCost + left * maxUnit };
}
