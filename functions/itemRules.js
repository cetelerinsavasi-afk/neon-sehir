// =============================================================================
// itemRules.js — Araç/silah ömrü, tamir, geliştirme ve Atölye fiyat kuralları
// (TEK DOĞRULUK KAYNAĞI — v77)
// =============================================================================
// Sunucu (functions/index.js, functions/shop.js) ve istemci (Atölye ekranı,
// profil) bu dosyayı kullanır. Eskiden index.js içinde duran sabitler buraya
// taşındı; değerler değişmedi.
// =============================================================================

import { VEHICLE_CATALOG, WEAPON_CATALOG } from './catalogData.js';
import { vehicleRaceLevel, VEHICLE_MAX_LEVEL } from './raceSim.js';

// --- Ömür + tamir (v58 değerleri) ---------------------------------------------
export const VEHICLE_WEAPON_INITIAL_LIFE_DAYS = 20; // araç ömür tavanı
export const VEHICLE_WEAPON_MAX_REPAIRS = 10; // araç VE silah tamir hakkı
export const REPAIR_LIFE_BONUS_DAYS = 2; // araç tamiri +2 gün
export const WEAPON_INITIAL_LIFE_DAYS = 10; // silah ömür tavanı
export const WEAPON_REPAIR_LIFE_BONUS_DAYS = 1; // silah tamiri +1 gün

export function lifeCapOf(kind) {
  return kind === 'weapon' ? WEAPON_INITIAL_LIFE_DAYS : VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
}
export function repairBonusOf(kind) {
  return kind === 'weapon' ? WEAPON_REPAIR_LIFE_BONUS_DAYS : REPAIR_LIFE_BONUS_DAYS;
}
// Tamir için gereken malzeme: fiyat/100 (en az 1)
export function repairRequiredQty(price) {
  return Math.max(1, Math.round((price || 0) / 100));
}

// 2. el satış değeri oranı: (kalanTamirHakkı × bonus + kalanÖmür) / azami
export function valueRatioOf(item, kind = 'vehicle') {
  const cap = lifeCapOf(kind);
  const bonus = repairBonusOf(kind);
  const repairsUsed = item?.repairsUsed || 0;
  const remainingRepairs = Math.max(0, VEHICLE_WEAPON_MAX_REPAIRS - repairsUsed);
  const lifeDays = Math.max(0, item?.lifeDays ?? cap);
  const combined = remainingRepairs * bonus + lifeDays;
  const maxCombined = VEHICLE_WEAPON_MAX_REPAIRS * bonus + cap;
  return Math.max(0, Math.min(1, combined / maxCombined));
}

// --- Güncel katalog fiyatları (eski ürünler de yeni fiyattan hesaplanır) -------
export function vehicleLivePrice(v) {
  return VEHICLE_CATALOG[v?.catalogId]?.price ?? v?.baseGalleryValue ?? 0;
}
export function weaponLivePrice(w) {
  return WEAPON_CATALOG[w?.catalogId]?.price ?? w?.basePrice ?? 0;
}

// --- 2. el fiyat bandı (createListing / instantSellListing ile AYNI formül) ------
// max = katalog × geliştirme çarpanı × değer oranı (yuvarlanır), min = max/2.
// instant = anında satış ödemesi (yuvarlanmamış ham değerin yarısı — eski davranış).
export function itemListingBand(itemType, item) {
  let raw = 0;
  if (itemType === 'vehicle') {
    const base = VEHICLE_CATALOG[item?.catalogId]?.price || 0;
    // v78: araç seviyesi (1-3) — eski vites/depo geliştirmeleri seviyeye sayılır
    const mult = vehicleRaceLevel(item);
    raw = base * mult * valueRatioOf(item, 'vehicle');
  } else if (itemType === 'weapon') {
    const base = WEAPON_CATALOG[item?.catalogId]?.price || 0;
    raw = base * (item?.level || 1) * valueRatioOf(item, 'weapon');
  }
  const max = Math.round(raw);
  return { max, min: Math.floor(max / 2), instant: Math.floor(raw / 2) };
}

// 2. el ilan belgesindeki ürün alanları (createListing ile aynı)
export function itemListingFields(itemType, itemId, item) {
  if (itemType === 'vehicle') {
    return {
      itemType,
      vehicleId: itemId,
      vehicleModel: item.customName || item.model,
      vehicleCatalogId: item.catalogId,
      vehicleGearLevel: item.gearLevel,
      vehicleTank: (item.baseTank || 0) + (item.tankBonus || 0),
      vehicleGearUpgraded: Boolean(item.gearUpgraded),
      vehicleTankUpgraded: Boolean(item.tankUpgraded),
      vehicleRaceLevel: vehicleRaceLevel(item),
      vehicleLifeDays: item.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS,
      vehicleRepairsUsed: item.repairsUsed || 0,
    };
  }
  return {
    itemType,
    weaponId: itemId,
    weaponName: item.name,
    weaponCatalogId: item.catalogId,
    weaponLevel: item.level,
    weaponPower: item.power,
    weaponLifeDays: item.lifeDays ?? WEAPON_INITIAL_LIFE_DAYS,
    weaponRepairsUsed: item.repairsUsed || 0,
  };
}

// --- Geliştirme ---------------------------------------------------------------
export const WEAPON_MAX_LEVEL = 3;
export function weaponUpgradeQty(price) {
  return Math.round((price || 0) / 100);
}
export function vehicleUpgradeQty(price) {
  return Math.max(2, Math.round((price || 0) / 500));
}
// Seviye 2: güç ×1.5 · Seviye 3: ×2
export function weaponPowerAtLevel(basePower, level) {
  return Math.round((basePower || 0) * (level >= 3 ? 2 : level === 2 ? 1.5 : 1));
}

// --- Amazor fiyatları (malzeme alımının ve tüm Atölye fiyatlarının tabanı) -----
export const AMAZOR_PRICES = {
  tamirMalzemesi: 10,
  silahUpgrade: 100,
  arabaGelistirme: 500,
  yasakliMadde: 2500,
};

// --- Atölye (v77) ---------------------------------------------------------------
// Silahçı: silah tamiri + silah geliştirme · Modifiye: araç tamiri + araç geliştirme
export const WORKSHOP_MATERIALS = {
  silahci: ['tamirMalzemesi', 'silahUpgrade'],
  modifiye: ['tamirMalzemesi', 'arabaGelistirme'],
};
export const WORKSHOP_ITEM_TYPE = { silahci: 'weapon', modifiye: 'vehicle' };

// Fiyat bandı (Amazor fiyatına oranla, malzeme başına):
//   malzeme %70–%100 · işçilik %10–%30. Oyunun kendi dükkânı üst sınırda
//   (malzeme %100 + işçilik %30 → tamir malzemesi 10 + 3 = 13 altın).
export function workshopBand(material) {
  const a = AMAZOR_PRICES[material] || 0;
  return {
    matMin: Math.ceil(a * 0.7),
    matMax: a,
    laborMin: Math.max(1, Math.ceil(a * 0.1)),
    laborMax: Math.max(1, Math.floor(a * 0.3)),
  };
}
export function gameWorkshopPrice(material) {
  const b = workshopBand(material);
  return { mat: b.matMax, labor: b.laborMax };
}
// Sahibin fiyatını banda oturtur (eksikse oyunun fiyatı)
export function clampWorkshopPrice(material, p) {
  const b = workshopBand(material);
  const mat = Number.isFinite(Number(p?.mat)) ? Math.round(Number(p.mat)) : b.matMax;
  const labor = Number.isFinite(Number(p?.labor)) ? Math.round(Number(p.labor)) : b.laborMax;
  return { mat: Math.min(b.matMax, Math.max(b.matMin, mat)), labor: Math.min(b.laborMax, Math.max(b.laborMin, labor)) };
}

// Bir atölye işinin gereksinimi.
//   action: 'repair' | 'upgrade' · upgradeType (araç): 'gear' | 'tank'
// Döner: { material, qty, block } — block: null | 'listed' | 'life0Max' |
//   'full' | 'repairs' | 'maxLevel' | 'done' | 'type'
export function workshopJob({ itemType, item, action, upgradeType }) {
  if (!item) return { block: 'type' };
  if (item.listed) return { block: 'listed' };
  if (action === 'repair') {
    const price = itemType === 'weapon' ? weaponLivePrice(item) : vehicleLivePrice(item);
    const cap = lifeCapOf(itemType);
    const out = { material: 'tamirMalzemesi', qty: repairRequiredQty(price) };
    if ((item.repairsUsed || 0) >= VEHICLE_WEAPON_MAX_REPAIRS) return { ...out, block: 'repairs' };
    if ((item.lifeDays ?? cap) >= cap) return { ...out, block: 'full' };
    return { ...out, block: null, gain: Math.min(cap, (item.lifeDays ?? cap) + repairBonusOf(itemType)) - (item.lifeDays ?? cap) };
  }
  if (action === 'upgrade') {
    if (itemType === 'weapon') {
      const out = { material: 'silahUpgrade', qty: weaponUpgradeQty(weaponLivePrice(item)) };
      if ((item.level || 1) >= WEAPON_MAX_LEVEL) return { ...out, block: 'maxLevel' };
      return { ...out, block: null };
    }
    if (itemType === 'vehicle') {
      // v78: araçlar da silahlar gibi seviye 1 → 2 → 3 (hız/ivme/nitro artar).
      // Maliyet değişmedi (eski vites/depo geliştirmesiyle aynı). Eski
      // istemciden gelen 'gear'/'tank' de bir seviye sayılır.
      if (upgradeType && !['level', 'gear', 'tank'].includes(upgradeType)) return { block: 'type' };
      const out = { material: 'arabaGelistirme', qty: vehicleUpgradeQty(vehicleLivePrice(item)), level: vehicleRaceLevel(item) };
      if (out.level >= VEHICLE_MAX_LEVEL) return { ...out, block: 'maxLevel' };
      return { ...out, block: null };
    }
  }
  return { block: 'type' };
}

// İşçilik her adet için ZORUNLU; malzeme sadece dükkândan kullanılan kadar.
export function workshopCost({ mat, labor, qty, ownQty }) {
  const own = Math.max(0, Math.min(qty, Math.floor(ownQty || 0)));
  const shopQty = qty - own;
  const laborTotal = labor * qty;
  const matTotal = mat * shopQty;
  return { own, shopQty, labor: laborTotal, material: matTotal, total: laborTotal + matTotal };
}

// v79: kendi malzemesi her zaman önce ve otomatik kullanılır (oyuncu seçmez).
export function autoOwnQty(qty, have) {
  return Math.max(0, Math.min(qty || 0, Math.floor(Number(have) || 0)));
}

// Ürün geliştirilebilir mi? (profilde sadece bilgi olarak gösterilir)
export function upgradeSlots(itemType, item) {
  if (itemType === 'weapon') {
    const lv = item?.level || 1;
    return [lv >= 2, lv >= 3];
  }
  const lv = vehicleRaceLevel(item);
  return [lv >= 2, lv >= 3];
}
// v78: araç seviye geliştirmesinin belge yaması (eski bayraklar da tutulur —
// 2. el değeri ve eski ekranlar seviyeyi bunlardan da okuyabilsin)
export function vehicleLevelUpPatch(item) {
  const level = Math.min(VEHICLE_MAX_LEVEL, vehicleRaceLevel(item) + 1);
  return { raceLevel: level, gearUpgraded: level >= 2, tankUpgraded: level >= 3 };
}
