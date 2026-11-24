// =============================================================================
// v151 — ARAÇ TÜRLERİ + MESLEKLER (sunucu + istemci ORTAK, saf JS)
//
//   araba  (1-10)  : yarış, tamir, geliştirme, modifiye (eskisi gibi)
//   ticari (11-15) : tır / otobüs / taksi / polis / ambulans — şehirde "İşe başla"
//   motor  (21-24) : scooter / cross / chopper / spor
//   v195: ticari de arabalar gibi 10 gün ömür + 10 tamir (her tamir +1 gün); GELİŞTİRME sadece arabada.
//   Motorda tamir + geliştirme YOK (ömür 20 gün), modifiye VAR, 2. elde satılır.
// =============================================================================
import { VEHICLE_CATALOG } from './catalogData.js';

export const CAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const TICARI_IDS = [11, 12, 13, 14, 15];
export const MOTOR_IDS = [21, 22, 23, 24, 25, 26, 27]; // v157.4: 25 bisiklet, 26 at · v177: 27 deve
// yaya alanlarına girebilen binekler (bisiklet, at, deve) — meslek yok
export const RIDE_IDS = [25, 26, 27];
export const isRideId = (id) => RIDE_IDS.includes(Number(id));
export const ALL_VEHICLE_IDS = [...CAR_IDS, ...TICARI_IDS, ...MOTOR_IDS];

export const VEHICLE_KINDS = [
  { key: 'araba', name: 'Araba', icon: '🚗', ids: CAR_IDS },
  { key: 'ticari', name: 'Ticari', icon: '🚚', ids: TICARI_IDS },
  { key: 'motor', name: 'Motor', icon: '🏍️', ids: MOTOR_IDS },
];

export function vehicleKindOf(id) {
  const k = VEHICLE_CATALOG[Number(id)]?.kind;
  return k === 'ticari' || k === 'motor' ? k : 'araba';
}
export const isVehicleId = (id) => Boolean(VEHICLE_CATALOG[Number(id)]);
export const isCarId = (id) => CAR_IDS.includes(Number(id));
export const isMotorId = (id) => MOTOR_IDS.includes(Number(id));
export const isTicariId = (id) => TICARI_IDS.includes(Number(id));
// v195: TAMİR araba + ticari · GELİŞTİRME (yarış seviyesi) sadece araba
export const canRepairVehicle = (id) => isCarId(id) || isTicariId(id);
export const canUpgradeVehicle = (id) => isCarId(id);

// --- MESLEKLER -----------------------------------------------------------------------
// daily: araç başına günlük iş hakkı · avg: bir işin ortalama kazancı (altın)
export const JOBS = {
  // v157: tır ve otobüste iki mesafe — yakın (şehir içi) ve uzak (O-77 → Kervankent). dailyFar: uzak hak,
  // farMul: uzak işin kazanç çarpanı (yol uzun + kaza riski fazla)
  // v177: şoförlük vergisi + %10 şirket payı geldi → iş başı ücretler arttı (tır 5.000→6.000, otobüs 10.000→12.500,
  // taksi 1.000→1.500, ambulans 3.000→3.500). Polis arabası oyundan kalktı (görev kayıtları için tanım duruyor).
  // v195: ticari ücretler ×1,5 (tır 6.000→9.000, otobüs 12.500→18.750, taksi 1.500→2.250, ambulans 3.500→5.250).
  // farMul, jobPerf, vergi ve şirket payı aynı. Polis ve kurye değişmedi.
  tir: { id: 11, name: 'Tır', icon: '🚛', daily: 5, dailyFar: 2, farMul: 3, avg: 9000, unit: 'sevkiyat', verb: 'Sevkiyat' },
  otobus: { id: 12, name: 'Otobüs', icon: '🚌', daily: 1, dailyFar: 1, farMul: 1.5, avg: 18750, unit: 'sefer', verb: 'Sefer' },
  taksi: { id: 13, name: 'Taksi', icon: '🚕', daily: 10, avg: 2250, unit: 'yolcu', verb: 'Yolcu' },
  polis: { id: 14, name: 'Polis', icon: '🚓', daily: 10, avg: 4000, unit: 'görev', verb: 'Görev' },
  ambulans: { id: 15, name: 'Ambulans', icon: '🚑', daily: 10, avg: 5250, unit: 'hasta', verb: 'Hasta' },
  // v154: motokurye — HER motorla (21-24); satıcıdan al → mekâna götür. Ücret mesafeyle artar.
  kurye: { id: 21, name: 'Motokurye', icon: '🛵', daily: 10, avg: 500, unit: 'sipariş', verb: 'Teslimat', motor: true },
};
// v154: motorlar motokurye mesleği yapar (katalogda job: 'kurye')
export const jobOf = (catalogId) => VEHICLE_CATALOG[Number(catalogId)]?.job || null;
// v157: günlük hak sayacı anahtarı (uzak işler ayrı sayılır) ve hak sayısı
export const jobCountKey = (job, far) => (far ? `${job}_uzak` : job);
export const jobDailyOf = (job, far) => (far ? JOBS[job]?.dailyFar || 0 : JOBS[job]?.daily || 0);

// Performans çarpanı: hız (hedef süreye göre) × hasar. Ortalama sürüşte ≈ 1.
//   t / par = 1 → ×1 · yarı sürede → ×1,18 · iki katı sürede → ×0,65 (alt sınır 0,6, üst 1,35)
//   her çarpma %7 (en fazla %50)
export function jobPerf(t, par, hits) {
  const r = par > 0 ? Math.max(0, t) / par : 1;
  const speed = Math.min(1.35, Math.max(0.6, 1.35 - 0.35 * r));
  const dmg = Math.max(0.5, 1 - 0.07 * Math.max(0, Math.floor(hits || 0)));
  return { speed, dmg, k: speed * dmg };
}
export const jobReward = (avg, mul, perf) => Math.max(10, Math.round((avg * mul * perf.k) / 10) * 10);
