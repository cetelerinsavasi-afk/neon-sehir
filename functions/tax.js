// =============================================================================
// v77 — Vergi altyapısı (belediye sistemi için hazırlık)
//
//   · İşletme gelirleri (tamir/geliştirme işçiliği, malzeme, menü, internet
//     dakikası, spor üyeliği, takım antrenman ücreti): cironun %10'u.
//     Örn. 2.000 altınlık üyelik → 200 vergi, sahibe 1.800.
//   · 2. el / vitrin satışları (silah, araba, malzeme, makine): %1.
//   · Fabrikalar (v87 — kademeli): günlük BRÜT üretim kazancına göre
//       0 – 100.000 altın        → %1
//       100.000 – 1.000.000      → %10
//       1.000.000 – 10.000.000   → %20
//       10.000.000 ve üzeri      → %40
//     Oran o günün brüt gelirinin TAMAMINA uygulanır (gece 00:00'da kesilir;
//     altın yetmezse kalanı devlete borç yazılır — elektrik faturası gibi).
//   · Oyunun kendi mekânları da vergi öder (kayıt amaçlı).
//
// Toplanan vergi şimdilik HİÇBİR YERE AKTARILMAZ (oyundan çıkar). Her ödeyen
// için günlük bir kayıt tutulur: taxLedger/{gün}_{uid}. Belediye sistemi
// geldiğinde bu kayıtlar (ve buradaki tek yazma noktası) belediye kasasına
// yönlendirilecek.
// =============================================================================
import { midnightDayKey } from './businessCatalogData.js';

export const BIZ_TAX_RATE = 0.1;
export const RESALE_TAX_RATE = 0.01;
export const FACTORY_TAX_RATE = 0.1; // eski sabit oran (geriye uyum; artık FACTORY_TAX_BRACKETS)
// v87 — fabrika vergi dilimleri: { from: brüt gelir alt sınırı (dahil), rate }
export const FACTORY_TAX_BRACKETS = [
  { from: 0, rate: 0.01 },
  { from: 100_000, rate: 0.1 },
  { from: 1_000_000, rate: 0.2 },
  { from: 10_000_000, rate: 0.4 },
];
export function factoryTaxRate(grossIncome) {
  const g = Math.max(0, Number(grossIncome) || 0);
  let rate = FACTORY_TAX_BRACKETS[0].rate;
  for (const b of FACTORY_TAX_BRACKETS) if (g >= b.from) rate = b.rate;
  return rate;
}

export const taxOf = (amount, rate) => Math.max(0, Math.round((Number(amount) || 0) * rate));
export const bizTax = (amount) => taxOf(amount, BIZ_TAX_RATE);
export const resaleTax = (amount) => taxOf(amount, RESALE_TAX_RATE);
export const factoryTax = (amount) => taxOf(amount, factoryTaxRate(amount));

// Kaynak anahtarları (rapor/ileride belediye ekranı için)
export const TAX_SOURCES = {
  isletme: 'İşletme geliri (%10)',
  ikinciEl: '2. el / vitrin satışı (%1)',
  fabrika: 'Fabrika üretimi (%1–%40, kademeli)',
  yayin: 'Yayın bağışı (%10)',
};

// Vergi kaydı. YAZMA (transaction ya da batch). amount ≤ 0 ise yazmaz.
//   writer: tx ya da batch · uid: ödeyen (oyunun mekânları için '__game__')
export function taxLedgerWrite(writer, db, FieldValue, { amount, source, uid, atMs = Date.now(), dayKey, ref }) {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (!amt || !uid) return 0;
  const day = dayKey || midnightDayKey(atMs);
  const patch = {
    dayKey: day,
    uid,
    total: FieldValue.increment(amt),
    bySource: { [TAX_SOURCES[source] ? source : 'isletme']: FieldValue.increment(amt) },
    count: FieldValue.increment(1),
    updatedAtMs: atMs,
  };
  if (ref) patch.refs = { [String(ref).slice(0, 80)]: FieldValue.increment(amt) };
  writer.set(db.collection('taxLedger').doc(`${day}_${uid}`), patch, { merge: true });
  return amt;
}
