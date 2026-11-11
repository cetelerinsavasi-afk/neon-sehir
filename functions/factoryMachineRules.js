// =============================================================================
// v154 — MALZEME MAKİNESİ KURALLARI (sunucu + istemci ortak)
// =============================================================================
//   • Günlük üretim 1,5 katı: tamir 1–3000, silah gel. 1–300, araba gel. 1–60
//   • İşçisiz (sahip çalıştırınca, 00:00'da) verim 1/5 → 1/3:
//       tamir 1–1000, silah gel. 1–100, araba gel. 1–20
//   • Fiyat: her makine KENDİ türüyle yarışır — aynı türden elindeki her makine
//     için +1.000 altın (vergi bu fiyat üzerinden hesaplanır).
//       10 tamir makinesi varken 11. tamir makinesi  = 50.000 + 10 × 1.000 = 60.000 + vergi
//       1 araba gel. makinesi varken 2. araba gel.   = 50.000 +  1 × 1.000 = 51.000 + vergi
//   • Mining makinesi kendi (kripto) kademesinde kalır; burası etkilemez.
// =============================================================================

export const MACHINE_BASE_PRICE = { tamirMalzemesi: 50000, silahUpgrade: 50000, arabaGelistirme: 50000 };
export const TIERED_MACHINE_TYPES = Object.keys(MACHINE_BASE_PRICE);
export const MACHINE_PRICE_STEP = 1000;

// işçiyle günlük üretim aralığı
export const MACHINE_PROD_RANGE = { tamirMalzemesi: [1, 3000], silahUpgrade: [1, 300], arabaGelistirme: [1, 60] };
// işçisiz (1/3 verim)
export const WORKERLESS_RANGE = { tamirMalzemesi: [1, 1000], silahUpgrade: [1, 100], arabaGelistirme: [1, 20] };

const cnt = (n) => Math.max(0, Math.floor(Number(n) || 0));

// owned: bu alımdan ÖNCE aynı türden sahip olunan makine sayısı
export function tieredMachinePrice(type, owned) {
  const base = MACHINE_BASE_PRICE[type];
  if (!base) return null;
  return base + MACHINE_PRICE_STEP * cnt(owned);
}

// aynı türden n makinenin bugünkü fiyatlarla toplam değeri (bilgi amaçlı fabrika değeri)
export function tieredFleetValue(type, n) {
  const base = MACHINE_BASE_PRICE[type];
  const k = cnt(n);
  if (!base || !k) return 0;
  return k * base + (MACHINE_PRICE_STEP * k * (k - 1)) / 2;
}

export const prodRangeLabel = (type, workerless = false) => {
  const r = (workerless ? WORKERLESS_RANGE : MACHINE_PROD_RANGE)[type];
  return r ? `${r[0]}-${r[1].toLocaleString('tr-TR')}` : '';
};
