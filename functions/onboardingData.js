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

export const ONBOARDING_V = 2;
export const ONBOARDING_REMOVED_IDS = [8, 15, 18];
export const ONBOARDING_ORDER = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20];
export const ONBOARDING_TASK_COUNT = ONBOARDING_ORDER.length; // 17

// Eski (v1) adım numarası → yeni sıra
export function migrateOnboardingStep(oldStep) {
  const s = Math.max(1, Math.floor(Number(oldStep) || 1));
  return s - ONBOARDING_REMOVED_IDS.filter((r) => r < s).length;
}

// Oyuncunun yeni sıradaki adımı (1 … COUNT+1)
export function onboardingPosOf(user) {
  const raw = Math.max(1, Math.floor(Number(user?.onboardingStep) || 1));
  const pos = user?.onboardingV === ONBOARDING_V ? raw : migrateOnboardingStep(raw);
  return Math.min(ONBOARDING_TASK_COUNT + 1, Math.max(1, pos));
}

// Sıradaki görevin kimliği (hepsi bittiyse null)
export function onboardingTaskIdAt(pos) {
  return ONBOARDING_ORDER[pos - 1] ?? null;
}
export function currentOnboardingTaskId(user) {
  return onboardingTaskIdAt(onboardingPosOf(user));
}
