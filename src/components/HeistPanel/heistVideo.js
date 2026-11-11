// =============================================================================
// heistVideo.js — v154 soygun videosu yardımcıları (React yok, küçük dosya)
//   • Sadece soygunu BAŞLATAN izler (tek başına soygun / ekibi kuran + Başlat).
//   • Sonuç sunucuda belli olur; video sonucu sonda gösterir. Diğer ekip üyeleri videoyu
//     izlemez, sonucu bugünkü gibi SMS / bildirimle görür.
//   • Firestore okuması YOK: ekip avatarları zaten açık olan plan kartından, araba bu
//     cihazda şehirde en son kullanılan arabadan (localStorage) gelir.
// =============================================================================

// oyun hedefi → sahne anahtarı (City/cityHeist.js HEIST_SCENES)
const SCENE_OF = {
  banka: 'banka',
  casino: 'casino',
  araba_galerisi: 'galeri',
  silah_magazasi: 'silah',
  fabrika: 'fabrika',
  internet_kafe: 'netkafe',
};
export const heistSceneOf = (target) => SCENE_OF[target] || null;
export const isVendorHeist = (target) => String(target || '').startsWith('seyyar_satici');

// Sunucu sonucu → videodaki sonuç. null: video yok (başlamadı / polis tuzağı kuran polis).
//   'ok' başarılı · 'caught' şüpheden yakalandı · 'busted' ekipte gizli polis vardı
export function heistOutcomeOf(res) {
  if (!res || !res.started) return null;
  if (res.reward !== undefined) {
    // tek başına
    return res.caught ? { outcome: 'caught', amount: Number(res.penalty ?? res.reward) || 0 } : { outcome: 'ok', amount: Number(res.reward) || 0 };
  }
  if (res.viaPoliceTrap) return null; // tuzağı kuran polis: sonucu kendi ekranında görür
  const total = Number(res.totalReward) || 0;
  if (res.busted) return { outcome: 'busted', amount: total };
  if (res.caughtBySuspicion) return { outcome: 'caught', amount: total };
  return { outcome: 'ok', amount: total };
}

// --- son kullanılan araba (cihazda) -------------------------------------------------
const carKey = (uid) => `ns_lastCar_${uid}`;
export function rememberHeistCar(uid, catalogId, mods) {
  if (!uid || !(Number(catalogId) > 0)) return;
  // sadece otomobiller (ticari araç / motor kaçış arabası olmaz)
  if (Number(catalogId) > 10) return;
  try {
    localStorage.setItem(carKey(uid), JSON.stringify({ id: Number(catalogId), mods: mods || null }));
  } catch {
    /* depolama kapalı olabilir */
  }
}
export function heistCarOf(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(carKey(uid)) || 'null');
    if (v && Number(v.id) >= 1 && Number(v.id) <= 10) return { carId: Number(v.id), carMods: v.mods || null };
  } catch {
    /* yoksay */
  }
  return { carId: 5, carMods: null }; // varsayılan: Sedan M-Sport
}
