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
// v168 (Rıza Amca senaryosu): ONBOARDING_V 3 → 4.
//   • Sıra: fabrika (1) → ışınlan (21) → … → silah geliştir (19) → AMCA İLE HURDALIĞA GİT (22, yeni,
//     sadece istemcideki son sahne bitince sunucuya 'finale' olayıyla geçer) → çeteye gir (20).
//   • SIFIRLAMA (tembel, toplu tarama/yazma YOK): onboardingV !== 4 olan oyuncu
//       - görevleri bitirmişse (onboardingRewardClaimed ya da eski listede hepsi bitmiş, "Tamam"a
//         basmamış olsa da) → BİTTİ sayılır (sıfırlanmaz);
//       - bitirmemişse → 1. göreve döner. Durum görevleri (silah / araba / kredi / avatar / şüphe /
//         antrenman / şampiyona / silah geliştir / çete) sırası gelince otomatik geçer.
//     Sunucu ilk ilerlemede yeni sırayı onboardingV: 4 ile yazar.
export const ONBOARDING_V = 4;
export const ONBOARDING_REMOVED_IDS = [8, 15, 18];
export const ONBOARDING_ORDER = [1, 21, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 19, 22, 20];
export const ONBOARDING_TASK_COUNT = ONBOARDING_ORDER.length; // 19
export const AMCA_FINALE_TASK_ID = 22; // "Rıza Amca ile hurdalığa git" (istemci senaryosu)

// --- Eski (v1–v3) kayıtların çevrimi: sadece "eski listede hepsi bitmiş mi?" sorusu için ---
const V3_ORDER = [21, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20];
const V3_COUNT = V3_ORDER.length; // 18
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
// Eski kaydın v3 sırası (1 … 19)
export function legacyV3Pos(user) {
  const raw = Math.max(1, Math.floor(Number(user?.onboardingStep) || 1));
  const v = user?.onboardingV;
  const pos = v === 3 ? raw : v === 2 ? migrateV2Step(raw) : migrateV2Step(migrateOnboardingStep(raw));
  return Math.min(V3_COUNT + 1, Math.max(1, pos));
}

// Oyuncunun yeni sıradaki adımı (1 … COUNT+1)
export function onboardingPosOf(user) {
  if (user?.onboardingV === ONBOARDING_V) {
    const raw = Math.max(1, Math.floor(Number(user.onboardingStep) || 1));
    return Math.min(ONBOARDING_TASK_COUNT + 1, raw);
  }
  // v168: eski kayıt — bitirmişse bitti, bitirmemişse baştan (senaryo ile)
  if (user?.onboardingRewardClaimed || (user && legacyV3Pos(user) > V3_COUNT)) return ONBOARDING_TASK_COUNT + 1;
  return 1;
}

// Sıradaki görevin kimliği (hepsi bittiyse null)
export function onboardingTaskIdAt(pos) {
  return ONBOARDING_ORDER[pos - 1] ?? null;
}
export function currentOnboardingTaskId(user) {
  return onboardingTaskIdAt(onboardingPosOf(user));
}
