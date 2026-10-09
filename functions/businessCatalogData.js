// =============================================================================
// businessCatalogData.js — Ev → İşletme dönüşümü (TEK DOĞRULUK KAYNAĞI)
// =============================================================================
// Hem sunucu (functions/houses.js, functions/business.js) hem istemci
// (HouseScreen, BusinessHub) bu dosyayı kullanır. Gerekli mobilyalar burada
// tanımlanır; fiyatlar houseCatalogData.js'deki ITEM_PRICES'tan okunur.
//
// Kurallar:
//   - Bir ev aynı anda sadece TEK işletme olabilir.
//   - Sadece SATIN ALINMIŞ (p:1) eşyalar şartı sağlar (deneme eşyalar sayılmaz).
//   - "any" listesindeki eşyalardan herhangi biri o şartı sağlar (ör. Çelik
//     Kasa veya Altın Kasa). Aynı eşya iki şartı birden karşılamaz.
//   - Dekor araba mobilyası (car_*) satılık araç DEĞİLDİR; sadece şart sağlar.
//     Motorlar araç mobilyası sayılmaz.
// =============================================================================

import { ITEM_PRICES } from './houseCatalogData.js';

export const CAR_DECOR_KEYS = ['car_sedan', 'car_sport', 'car_suv', 'car_muscle', 'car_super', 'car_classic', 'car_pickup'];

// Gün sınırı: 'midnight' = 00:00, 'futbol' = 19:00 (spor salonu, futbol günüyle aynı)
export const BIZ_TYPES = {
  silahci: {
    label: 'Silahçı',
    icon: '🔫',
    region: 'silah_magazasi',
    day: 'midnight',
    groups: [
      { any: ['gunrack', 'gunrackg'], n: 1 },
      { any: ['guntable'], n: 1 },
      { any: ['guncab'], n: 1 },
      { any: ['safe', 'safeg'], n: 1 },
    ],
  },
  galeri: {
    label: 'Araba Galerisi',
    icon: '🚗',
    region: 'araba_galerisi',
    day: 'midnight',
    groups: [
      { any: CAR_DECOR_KEYS, n: 1 },
      { any: ['officedesk'], n: 1 },
      { any: ['watercooler'], n: 1 },
      { any: ['kcoffee'], n: 1 },
    ],
  },
  modifiye: {
    label: 'Modifiye Garajı',
    icon: '🔧',
    region: 'modifiye_garaji',
    day: 'midnight',
    groups: [
      { any: ['toolwall'], n: 1 },
      { any: ['workbench'], n: 1 },
      { any: ['toolchest'], n: 1 },
      { any: CAR_DECOR_KEYS, n: 1 },
    ],
  },
  spor: {
    label: 'Spor Salonu',
    icon: '🏋️',
    region: 'spor_salonu',
    day: 'futbol',
    groups: [
      { any: ['bag'], n: 2 },
      { any: ['treadmill'], n: 2 },
      { any: ['bench'], n: 2 },
      { any: ['dumbbells'], n: 1 },
    ],
  },
  internet: {
    label: 'İnternet Kafe',
    icon: '🖥️',
    region: 'internet_kafe',
    day: 'midnight',
    groups: [
      { any: ['pcstation', 'pc'], n: 1 },
      { any: ['console', 'arcade'], n: 1 },
      { any: ['checkout', 'officedesk'], n: 1 },
      { any: ['speaker'], n: 2 },
    ],
  },
  bar: {
    label: 'Bar',
    icon: '🍸',
    region: 'bar',
    day: 'midnight',
    groups: [
      { any: ['podium', 'stagemic'], n: 1 },
      { any: ['discoball', 'guitar'], n: 1 },
      { any: ['bar'], n: 1 },
      { any: ['bartable'], n: 1 },
      { any: ['stool'], n: 4 },
    ],
  },
  cafe: {
    label: 'Cafe',
    icon: '☕',
    region: 'cafe',
    day: 'midnight',
    groups: [
      { any: ['checkout'], n: 1 },
      { any: ['cafecounter'], n: 1 },
      { any: ['cafetable'], n: 2 },
      { any: ['menuboard'], n: 1 },
    ],
  },
};

// Harita/İşletme listesi ekranı için hafif etiketler (three.js'li houseCatalog'u
// yüklememek için). Adlar houseCatalog.js ile aynı.
export const BIZ_ITEM_LABELS = {
  gunrack: { name: 'Silah Askılığı', icon: '🔫' },
  gunrackg: { name: 'Altın Silah Askılığı', icon: '🔱' },
  guntable: { name: 'Silah Bakım Masası', icon: '🛠️' },
  guncab: { name: 'Camlı Silah Dolabı', icon: '🗄️' },
  safe: { name: 'Çelik Kasa', icon: '🔐' },
  safeg: { name: 'Altın Kasa', icon: '💰' },
  car_sedan: { name: 'Araba', icon: '🚘' },
  car_sport: { name: 'Spor Araba', icon: '🏎️' },
  car_suv: { name: 'SUV', icon: '🚙' },
  car_muscle: { name: 'Muscle', icon: '🚗' },
  car_super: { name: 'Süper Araba', icon: '🏎️' },
  car_classic: { name: 'Klasik', icon: '🚗' },
  car_pickup: { name: 'Pikap', icon: '🛻' },
  officedesk: { name: 'Makam Masası', icon: '💼' },
  watercooler: { name: 'Su Sebili', icon: '🚰' },
  kcoffee: { name: 'Kahve Köşesi', icon: '☕' },
  toolwall: { name: 'Alet Panosu', icon: '🔧' },
  workbench: { name: 'Tezgah & Takım', icon: '🧰' },
  toolchest: { name: 'Takım Dolabı', icon: '🗄️' },
  bag: { name: 'Boks Torbası', icon: '🥊' },
  treadmill: { name: 'Koşu Bandı', icon: '🏃' },
  bench: { name: 'Bench Press', icon: '🏋️' },
  dumbbells: { name: 'Dambıl Seti', icon: '🏋️' },
  pcstation: { name: 'İnternet Kafe İstasyonu', icon: '🖥️' },
  pc: { name: 'Oyuncu Bilgisayarı', icon: '🖥️' },
  console: { name: 'Konsol & TV Seti', icon: '🎮' },
  arcade: { name: 'Atari Makinesi', icon: '🕹️' },
  checkout: { name: 'Kasa Tezgahı', icon: '🧾' },
  speaker: { name: 'Kule Hoparlör', icon: '🔊' },
  podium: { name: 'LED Sahne', icon: '🎤' },
  stagemic: { name: 'Mikrofonlu Sahne', icon: '🎤' },
  discoball: { name: 'Disko Topu', icon: '🪩' },
  guitar: { name: 'Elektro Gitar', icon: '🎸' },
  bar: { name: 'Bar Tezgahı', icon: '🥃' },
  bartable: { name: 'Bar Masası', icon: '🍸' },
  stool: { name: 'Bar Taburesi', icon: '🪑' },
  cafecounter: { name: 'Kafe Bar Tezgahı', icon: '☕' },
  cafetable: { name: 'Kafe Masası', icon: '☕' },
  menuboard: { name: 'Menü Tahtası', icon: '📋' },
};

// İşletme envanterine girebilen malzemeler (Faz 2: silahçı/modifiye atölyesi)
export const BIZ_MATERIALS = {
  tamirMalzemesi: { name: 'Tamir Malzemesi', icon: '🔧' },
  silahUpgrade: { name: 'Silah Geliştirme Malzemesi', icon: '🔫' },
  arabaGelistirme: { name: 'Araba Geliştirme Malzemesi', icon: '🚗' },
};

export const BIZ_TYPE_KEYS = Object.keys(BIZ_TYPES);
export const BIZ_BY_REGION = Object.fromEntries(Object.entries(BIZ_TYPES).map(([k, v]) => [v.region, k]));

// Bir şartı karşılayan en ucuz eşya (işletme aç ekranındaki maliyet için).
// Altın ve zümrüt farklı para birimi → zümrütlü seçenek her zaman "pahalı"
// sayılmaz; 1 zümrüt ≈ 600 altın (Zümrüt Mağazası: 49💎 → 30.000) ile kıyaslanır.
const GEM_IN_GOLD = 600;
function priceScore(p) {
  if (!p) return Infinity;
  return p.t === 'gem' ? p.v * GEM_IN_GOLD : p.v;
}
export function cheapestOf(keys) {
  let best = null;
  for (const k of keys) {
    const p = ITEM_PRICES[k];
    if (!p) continue;
    if (!best || priceScore(p) < priceScore(ITEM_PRICES[best])) best = k;
  }
  return best;
}

// İşletme açmanın en düşük mobilya maliyeti: { gold, gem, lines:[{key, n, price}] }
export function bizMinCost(type) {
  const t = BIZ_TYPES[type];
  const out = { gold: 0, gem: 0, lines: [] };
  if (!t) return out;
  for (const g of t.groups) {
    const key = cheapestOf(g.any);
    const p = ITEM_PRICES[key];
    out.lines.push({ key, any: g.any, n: g.n, price: p });
    if (p?.t === 'gem') out.gem += p.v * g.n;
    else if (p) out.gold += p.v * g.n;
  }
  return out;
}

// Satın alınmış eşyaların sayımı { key: adet }
export function ownedCounts(items) {
  const m = {};
  (items || []).forEach((it) => {
    if (it && it.p === 1) m[it.k] = (m[it.k] || 0) + 1;
  });
  return m;
}

// Şart kontrolü. Aynı eşya iki şartı karşılamasın diye sayılar tüketilir.
// Döner: { ok, groups:[{ any, n, have, ok }] }
export function checkBizRequirements(type, items) {
  const t = BIZ_TYPES[type];
  if (!t) return { ok: false, groups: [] };
  const pool = ownedCounts(items);
  const groups = t.groups.map((g) => {
    let have = 0;
    for (const k of g.any) {
      while (have < g.n && (pool[k] || 0) > 0) {
        pool[k] -= 1;
        have += 1;
      }
    }
    return { any: g.any, n: g.n, have, ok: have >= g.n };
  });
  return { ok: groups.every((g) => g.ok), groups };
}

// v77 — "Hepsini al": şartları karşılamak için ne eksik?
//   placedItems: evdeki eşyalar (sadece p:1 sayılır) · invItems: { key: adet } envanter
// Önce evdekiler, sonra envanterdekiler kullanılır; kalan eksik en ucuz seçenekten
// satın alınır. Döner: { ok, groups:[{ any, n, placed, fromInv:{k:n}, buyKey, buy }],
//   place:{k:n} (envanterden yerleştirilecek), buy:{k:n}, gold, gem }
export function bizMissing(type, placedItems, invItems) {
  const t = BIZ_TYPES[type];
  const out = { ok: true, groups: [], place: {}, buy: {}, gold: 0, gem: 0 };
  if (!t) return { ...out, ok: false };
  const placedPool = ownedCounts(placedItems);
  const invPool = {};
  Object.entries(invItems || {}).forEach(([k, n]) => {
    const q = Math.max(0, Math.floor(Number(n) || 0));
    if (q) invPool[k] = q;
  });
  for (const g of t.groups) {
    let placed = 0;
    for (const k of g.any) {
      while (placed < g.n && (placedPool[k] || 0) > 0) {
        placedPool[k] -= 1;
        placed += 1;
      }
    }
    const fromInv = {};
    let have = placed;
    for (const k of g.any) {
      while (have < g.n && (invPool[k] || 0) > 0) {
        invPool[k] -= 1;
        have += 1;
        fromInv[k] = (fromInv[k] || 0) + 1;
        out.place[k] = (out.place[k] || 0) + 1;
      }
    }
    const buy = g.n - have;
    const buyKey = buy > 0 ? cheapestOf(g.any) : null;
    if (buy > 0) {
      out.ok = false;
      out.buy[buyKey] = (out.buy[buyKey] || 0) + buy;
      const p = ITEM_PRICES[buyKey];
      if (p?.t === 'gem') out.gem += p.v * buy;
      else if (p) out.gold += p.v * buy;
    }
    if (Object.keys(fromInv).length) out.ok = false;
    out.groups.push({ any: g.any, n: g.n, placed, fromInv, buyKey, buy });
  }
  return out;
}

// v79 — "Eksikleri al" ekranında birden çok seçeneği olan şartlarda oyuncunun
// seçtiği ürünü uygular. choice: { grupSırası: anahtar } (geçersizse en ucuz kalır).
// bizMissing sonucunu değiştirmeden yeni bir sonuç döner (buy/gold/gem yeniden).
export function applyBizChoice(m, choice = {}) {
  if (!m?.groups) return m;
  const out = { ...m, buy: {}, gold: 0, gem: 0, groups: [] };
  m.groups.forEach((g, i) => {
    const want = choice[i];
    const buyKey = g.buy > 0 && typeof want === 'string' && g.any.includes(want) ? want : g.buyKey;
    out.groups.push({ ...g, buyKey });
    if (g.buy > 0 && buyKey) {
      out.buy[buyKey] = (out.buy[buyKey] || 0) + g.buy;
      const p = ITEM_PRICES[buyKey];
      if (p?.t === 'gem') out.gem += p.v * g.buy;
      else if (p) out.gold += p.v * g.buy;
    }
  });
  return out;
}

// Bir eşya (anahtar) bu işletme türü için gerekli mi?
export function isBizRequiredKey(type, key) {
  const t = BIZ_TYPES[type];
  return Boolean(t && t.groups.some((g) => g.any.includes(key)));
}

// --- Gün anahtarları (İstanbul, sabit UTC+3) ---------------------------------
const H = 60 * 60 * 1000;
const OFFSET = 3 * H;
const keyOf = (ms) => new Date(ms + OFFSET).toISOString().slice(0, 10);
export function midnightDayKey(ms) {
  return keyOf(ms);
}
// Futbol günü 19:00'da başlar: 7 Ekim 18:59 → '2026-10-06', 19:00 → '2026-10-07'
export function futbolDayKey(ms) {
  return keyOf(ms - 19 * H);
}
export function bizDayKey(type, ms) {
  return BIZ_TYPES[type]?.day === 'futbol' ? futbolDayKey(ms) : midnightDayKey(ms);
}
// Günün başlangıç anı (ms): gece yarısı ya da futbol günü 19:00 (İstanbul)
export function bizDayStartMs(type, dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - OFFSET + (BIZ_TYPES[type]?.day === 'futbol' ? 19 * H : 0);
}
// İşletme o günün TAMAMINDA açık mıydı? (spor bonusu: yeni salon ilk kapanışta
// bonuslu olamaz; ancak tam bir gün geçirdikten sonraki kapanışta değerlendirilir)
export function bizOpenAllDay(openedAtMs, type, dayKey) {
  return Number(openedAtMs || 0) > 0 && Number(openedAtMs) <= bizDayStartMs(type, dayKey);
}
export function prevDayKey(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 24 * H + 12 * H).toISOString().slice(0, 10);
}

export const BIZ_DEFAULT_NAME = (ownerName, type) => `${String(ownerName || 'Oyuncu').slice(0, 14)} ${BIZ_TYPES[type]?.label || 'İşletme'}`.slice(0, 30);
