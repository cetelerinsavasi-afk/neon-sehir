// =============================================================================
// materials.js — v124 MALZEME SİSTEMİ (sunucu + istemci ortak kurallar)
// =============================================================================
// Oyuncuların elinde artık malzeme YOK (sadece yasaklı madde). Malzemeler
// (tamir, silah geliştirme, araba geliştirme) fabrika ve işletmelerin ORTAK
// envanterindedir. Depolama yeri değişmedi: users/{uid}/inventory/{malzeme}
// — ama bu belgeler artık "oyuncunun cebi" değil, sahibinin fabrika +
// işletmelerinin ortak envanteridir.
//
// Kim hangi malzemeyi tutabilir / alabilir / görür:
//   fabrika  → hepsi
//   silahçı  → tamir + silah geliştirme
//   modifiye → tamir + araba geliştirme
// Hiçbirine sahip olmayanın malzemesi olamaz (v124 geçişinde AMAZOR
// fiyatının %75'i ödenip elinden alındı — v124Migrations.js).
//
// Kurallar:
//   • Fabrika kapatılamaz (makine satışı da yok).
//   • Silahçı / modifiyeci kapatılırken, kalan fabrika/işletmelerin
//     kullanamayacağı malzeme envanterde varsa kapanmaz; önce o malzeme
//     Mağaza'da anında satılmalı (closeBlockMaterials).
//   • Mağaza = malzeme ilanları (marketplaceListings itemType 'material');
//     sadece o malzemeyi kullanabilen alıcı alır; malzeme satışında vergi yok.
// =============================================================================

import { AMAZOR_PRICES } from './itemRules.js';

export const MATERIAL_KEYS = ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme'];
export const MATERIAL_LABELS = { tamirMalzemesi: 'Tamir Malzemesi', silahUpgrade: 'Silah Geliştirme Malzemesi', arabaGelistirme: 'Araba Geliştirme Malzemesi' };
export const HOLDER_MATERIALS = {
  factory: MATERIAL_KEYS,
  silahci: ['tamirMalzemesi', 'silahUpgrade'],
  modifiye: ['tamirMalzemesi', 'arabaGelistirme'],
};
export const MATERIAL_HOLDER_BIZ = ['silahci', 'modifiye'];
export const MATERIAL_BUYOUT_RATIO = 0.75;

// holdings: { hasFactory: bool, bizTypes: ['silahci', …] } → kullanılabilir malzemeler (Set)
export function usableMaterials({ hasFactory = false, bizTypes = [] } = {}) {
  const set = new Set();
  if (hasFactory) HOLDER_MATERIALS.factory.forEach((m) => set.add(m));
  bizTypes.forEach((t) => (HOLDER_MATERIALS[t] || []).forEach((m) => set.add(m)));
  return set;
}
export const canUseMaterial = (holdings, material) => usableMaterials(holdings).has(material);

// Oyunun %75 geri alım bedeli (AMAZOR fiyatı × adet × 0,75, aşağı yuvarlanır)
export function buyoutValue(material, qty) {
  const p = Number(AMAZOR_PRICES[material] || 0);
  return Math.floor(Math.max(0, Math.floor(Number(qty) || 0)) * p * MATERIAL_BUYOUT_RATIO);
}

// Kapanınca (ya da yer olmayınca) kalan sahipliklerin kullanamayacağı, envanterde
// olan malzemeler. inv: { malzeme: adet }
export function closeBlockMaterials(holdingsAfter, inv) {
  const ok = usableMaterials(holdingsAfter);
  return MATERIAL_KEYS.filter((m) => Number(inv?.[m] || 0) > 0 && !ok.has(m));
}

// Sahiplikleri oku. reader: transaction (tx.get) ya da null (db.get)
//   excludeHouseId: kapanmakta olan işletme sayılmaz
export async function readHoldings(db, uid, { tx = null, excludeHouseId = null } = {}) {
  const get = (refOrQuery) => (tx ? tx.get(refOrQuery) : refOrQuery.get());
  const [fac, hs] = await Promise.all([get(db.collection('factories').doc(uid)), get(db.collection('houses').where('ownerUid', '==', uid).limit(50))]);
  const bizTypes = [];
  hs.docs.forEach((d) => {
    if (d.id === excludeHouseId) return;
    const t = d.data()?.biz?.type;
    if (MATERIAL_HOLDER_BIZ.includes(t)) bizTypes.push(t);
  });
  return { hasFactory: fac.exists, bizTypes };
}
export async function readMaterialInv(db, uid, { tx = null } = {}) {
  const get = (r) => (tx ? tx.get(r) : r.get());
  const snaps = await Promise.all(MATERIAL_KEYS.map((m) => get(db.collection('users').doc(uid).collection('inventory').doc(m))));
  const inv = {};
  snaps.forEach((s, i) => {
    inv[MATERIAL_KEYS[i]] = Math.max(0, Math.floor(Number(s.exists ? s.data().quantity : 0) || 0));
  });
  return inv;
}
