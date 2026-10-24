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
//   · v123 — Maaşlar: futbolcu, menajer ve fabrika işçisi maaşlarından %10
//     (işveren tam maaşı öder, çalışana %90'ı yatar, %10 devlete).
//   · v123 — Piyango kazançları: %10 (kazanana %90'ı yatar).
//
// v108: Toplanan TÜM vergiler devlet (belediye) kasasına gelir yazılır
// (functions/stateTreasury.js — kaynak başına ayrı kalem). Her ödeyen için
// günlük kayıt da sürer: taxLedger/{gün}_{uid}. Tek yazma noktası burası.
// =============================================================================
import { midnightDayKey } from './businessCatalogData.js';
import { stateWrite } from './stateTreasury.js';

export const BIZ_TAX_RATE = 0.1;
export const RESALE_TAX_RATE = 0.01;
export const SALARY_TAX_RATE = 0.1; // v123 — futbolcu / menajer / fabrika işçisi maaşı
export const LOTTERY_TAX_RATE = 0.1; // v123 — piyango kazancı
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
// v123: brüt → { tax, net } (net + tax = brüt; yuvarlama vergiden yana değil)
export function splitSalaryTax(gross) {
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const tax = Math.min(g, Math.floor(g * SALARY_TAX_RATE));
  return { gross: g, tax, net: g - tax };
}
export function splitLotteryTax(gross) {
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const tax = Math.min(g, Math.floor(g * LOTTERY_TAX_RATE));
  return { gross: g, tax, net: g - tax };
}

// Kaynak anahtarları (rapor/ileride belediye ekranı için)
export const TAX_SOURCES = {
  isletme: 'İşletme geliri (%10)',
  ikinciEl: '2. el / vitrin satışı (%1)',
  fabrika: 'Fabrika üretimi (%1–%40, kademeli)',
  yayin: 'Yayın bağışı (%10)',
  sanatci: 'Şarkı desteği (%10)', // v93
  ofis: 'Ofis geliri — ücretli mobilyalar (%10)', // v100
  maas: 'Maaş — futbolcu / menajer / fabrika işçisi (%10)', // v123
  piyango: 'Piyango kazancı (%10)', // v123
  gazino: 'Gazino piyango payı (%10)', // v124
  gazinoCekim: 'Gazino kasasından çekim (%10)', // v124 Faz 6 — oyuncu gazinosu makine kasası
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
  // v108 — devlet kasasına gelir (oyunun kendi mekânları ayrı kalemde)
  const src = TAX_SOURCES[source] ? source : 'isletme';
  stateWrite(writer, db, FieldValue, { kind: 'in', cat: uid === '__game__' ? 'vergi_oyun' : `vergi_${src}`, amount: amt, atMs, dayKey: day });
  return amt;
}
