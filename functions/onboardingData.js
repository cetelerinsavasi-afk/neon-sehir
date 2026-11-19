// =============================================================================
// onboardingData.js — v124 YENİ OYUNCU GÖREVLERİ (sunucu + istemci ortak)
// -----------------------------------------------------------------------------
// Görevlerin KİMLİĞİ (id) eski 20'lik listedeki numarasıdır ve değişmez —
// kodun her yerindeki advanceOnboardingStep(uid, id) çağrıları bu kimlikle
// çalışır. Görevlerin SIRASI ONBOARDING_ORDER'dadır; oyuncunun ilerlemesi
// users/{uid}.onboardingStep = bu listedeki SIRA (1'den başlar,
// ONBOARDING_TASK_COUNT + 1 = hepsi bitti).
//
// v124: kaldırılan görevler — 8 (Casino'da slot oyna), 15 (2. el'den
// alışveriş yap), 18 (silah geliştirme malzemesi al). Liste 20 → 17.
//
// GÜVENLİ GEÇİŞ (tembel, toplu tarama yok): onboardingV !== 2 olan oyuncunun
// kayıtlı adımı ESKİ numaradır. Yeni sıra = eski adım − (eski adımdan KÜÇÜK
// kaldırılan görev sayısı). Böylece:
//   • kaldırılan görevdeyse → bir sonraki göreve geçer (eski 8 → yeni 8 = eski 9)
//   • kaldırılan görevlerin gerisindeyse → onları yapmasına gerek kalmaz
//   • ilerisindeyse → başa dönmez, kaldığı yerden devam eder
//   • hepsini bitirmişse (eski 21) → yeni 18 = bitti
// Sunucu oyuncunun adımını ilk ilerlemede yeni sırayla yazar (onboardingV: 2).
// =============================================================================

// v167: ONBOARDING_V 2 → 3 — "Fabrikada çalış" (id 1) 1. ile 2. görevin arasına geri eklendi.
// v2 kaydı olan oyuncunun 2. ve sonraki sıraları +1 kayar (yeni görevi YAPMAK ZORUNDA kalmaz, geri
// gitmez); 1. sıradakiler (ışınlanma görevi) ve yeni oyuncular yeni görevi sırası gelince yapar.
export const ONBOARDING_V = 3;
export const ONBOARDING_REMOVED_IDS = [8, 15, 18];
// v160.3: 1. görev (fabrikada çalış, id 1) → "mini haritadan ışınlan" (id 21).
// v167: fabrikada çalış (id 1) 2. sıraya geri geldi — maaş alınınca (sunucu: fabrika üretimi) geçer.
export const ONBOARDING_ORDER = [21, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20];
export const ONBOARDING_TASK_COUNT = ONBOARDING_ORDER.length; // 18
const V2_INSERT_AT = 2; // v167: v2 listesinde bu sıra ve sonrası +1 kayar

// Eski (v1) adım numarası → v2 sırası (v124 geçişi; v2 listesine göre: 17 görev)
export function migrateOnboardingStep(oldStep) {
  const s = Math.max(1, Math.floor(Number(oldStep) || 1));
  return s - ONBOARDING_REMOVED_IDS.filter((r) => r < s).length;
}
// v2 sırası → v3 sırası
export function migrateV2Step(pos2) {
  const p = Math.max(1, Math.floor(Number(pos2) || 1));
  return p >= V2_INSERT_AT ? p + 1 : p;
}

// Oyuncunun yeni sıradaki adımı (1 … COUNT+1)
export function onboardingPosOf(user) {
  const raw = Math.max(1, Math.floor(Number(user?.onboardingStep) || 1));
  const v = user?.onboardingV;
  const pos = v === ONBOARDING_V ? raw : v === 2 ? migrateV2Step(raw) : migrateV2Step(migrateOnboardingStep(raw));
  return Math.min(ONBOARDING_TASK_COUNT + 1, Math.max(1, pos));
}

// Sıradaki görevin kimliği (hepsi bittiyse null)
export function onboardingTaskIdAt(pos) {
  return ONBOARDING_ORDER[pos - 1] ?? null;
}
export function currentOnboardingTaskId(user) {
  return onboardingTaskIdAt(onboardingPosOf(user));
}
