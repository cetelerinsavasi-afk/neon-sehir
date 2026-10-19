// =============================================================================
// officeData.js — v100 Ofisler: ücretli mobilyalar (TEK DOĞRULUK KAYNAĞI)
// =============================================================================
// Hem sunucu (functions/office.js, houses.js, venue.js, homeOffice.js) hem istemci
// (HouseHub, HouseScreen, OfficePanel) bu dosyayı kullanır.
//
// Kurallar:
//   - Bazı mobilyalar para kazanmaya elverişlidir (OFFICE_FURN). Odaya konunca
//     içindeki ürünler ziyaretçilere ÜCRETSİZDİR; bağış kutusu kapalı, mikser
//     konsolunu sadece ev sahibi kullanır.
//   - Sahip bu mobilyaları "ücretli" yapıp fiyat belirleyebilir (houses.office).
//     Herhangi biri ücretliyse ev artık OFİS sayılır.
//   - Ücretli bir ürün odadaki başka bir eşyada da varsa (ör. meyve: manav tezgâhı +
//     yemek masası) orada da aynı fiyattan ücretlidir.
//   - Bir oyuncu bir mekânın ücretli mobilyalarına günde en fazla 10.000 harcar
//     (her mekân ayrı; officeSpend/{houseId}_{uid}_{gün}).
//   - İşletmelerde (internet kafe, galeri…) ücretli mobilya kazancı işletmenin
//     normal kazancından AYRI tutulur (officeDaily). Cafe/bar'da yiyecek-içecek
//     zaten menüden satılır; orada sadece bağış kutusu ve mikser ücretli yapılır.
//   - Sınıf: ofis (ücretli mobilyası olan) · ev (10+ mobilya) · depo (10'dan az).
// =============================================================================

import { HOUSE_TAKEABLES } from './houseCatalogData.js';

export const OFFICE_DAILY_LIMIT = 10_000;
export const HOUSE_MIN_ITEMS = 10; // depodan ev olmak için (tüm satın alınmış mobilyalar)
export const OFFICE_DONATE_AMOUNTS = [100, 250, 500, 1000];

export const OFFICE_BANDS = {
  food: { min: 10, max: 200, def: 50 },
  bar: { min: 100, max: 500, def: 200 },
  minute: { min: 100, max: 500, def: 200 },
};

// kind: 'product' (içindeki ürünler satılır) · 'donate' (bağış kutusu) · 'minute' (dakika ücreti)
export const OFFICE_FURN = {
  shelf: { kind: 'product', band: 'food', name: 'Market Rafı', icon: '🛒' },
  cakecase: { kind: 'product', band: 'food', name: 'Pasta Vitrini', icon: '🍰' },
  fruitstand: { kind: 'product', band: 'food', name: 'Manav Tezgâhı', icon: '🍎' },
  drinkfridge: { kind: 'product', band: 'food', name: 'İçecek Dolabı', icon: '🥤' },
  icecream: { kind: 'product', band: 'food', name: 'Dondurma Dolabı', icon: '🍦' },
  simit: { kind: 'product', band: 'food', name: 'Simit Arabası', icon: '🥯' },
  bar: { kind: 'product', band: 'bar', name: 'Bar Tezgâhı', icon: '🥃' },
  bufe: { kind: 'product', band: 'food', name: 'Büfe Kulübesi', icon: '🌭' },
  popcorn: { kind: 'product', band: 'food', name: 'Patlamış Mısır Makinesi', icon: '🍿' },
  bagiskutusu: { kind: 'donate', name: 'Bağış Kutusu', icon: '🤲' },
  mixer: { kind: 'minute', band: 'minute', name: 'Mikser Konsolu', icon: '🎛️' },
};
export const OFFICE_FURN_KEYS = Object.keys(OFFICE_FURN);
export const isOfficeFurn = (k) => Object.prototype.hasOwnProperty.call(OFFICE_FURN, k);

// cafe/bar'da yiyecek-içecek menüden satılır → ürün mobilyaları ofis sistemine girmez
export const MENU_BIZ_TYPES = ['cafe', 'bar'];
const WEAPONS = ['tabanca', 'tufek', 'pompali', 'altinTabanca'];
export const officeProductsOf = (key) => (OFFICE_FURN[key]?.kind === 'product' ? (HOUSE_TAKEABLES[key] || []).filter((p) => !WEAPONS.includes(p)) : []);
// Bir ürünün fiyat aralığı: bar tezgâhının ürünleri (kokteyl, viski) 100–500, diğerleri 10–200
export const productBand = (product) => (officeProductsOf('bar').includes(product) ? OFFICE_BANDS.bar : OFFICE_BANDS.food);
const clampInt = (v, b) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Math.min(b.max, Math.max(b.min, Number(v))) : b.def);

// Bu mekânda ücretli yapılabilir mi? (cafe/bar'da ürün mobilyaları menüde)
export function officeKeyAllowed(h, key) {
  if (!isOfficeFurn(key)) return false;
  if (h?.venue) return false; // oyunun mekânları
  if (MENU_BIZ_TYPES.includes(h?.biz?.type) && OFFICE_FURN[key].kind === 'product') return false;
  return true;
}
// Mekânda satın alınmış (p:1) ücretli-yapılabilir mobilya anahtarları
export function ownedOfficeKeys(h) {
  const out = new Set();
  (h?.items || []).forEach((it) => {
    if (it?.p === 1 && officeKeyAllowed(h, it.k)) out.add(it.k);
  });
  return [...out];
}
// Ücretli (aktif) olanlar: sahip açmış + odada satın alınmış hâli var
export function activeOfficeKeys(h) {
  const on = h?.office?.keys || {};
  return ownedOfficeKeys(h).filter((k) => on[k] === true);
}
export const isOfficeKeyActive = (h, key) => activeOfficeKeys(h).includes(key);

// Ücretli ürünün fiyatı (0 = ücretsiz). Kural 2: ürünü veren HERHANGİ bir aktif
// mobilya varsa ürün odadaki her eşyada ücretlidir.
export function officePriceOf(h, product) {
  const active = activeOfficeKeys(h);
  if (!active.some((k) => officeProductsOf(k).includes(product))) return 0;
  return clampInt(h?.office?.prices?.[product], productBand(product));
}
export const officeMinuteOf = (h) => clampInt(h?.office?.minute, OFFICE_BANDS.minute);

const LEGACY_HO = ['mescit', 'sinema', 'studyo'];
export const isLegacyHomeOffice = (h) => LEGACY_HO.includes(h?.biz?.type || h?.bizType);
export const ownedItemCount = (h) => (h?.items || []).filter((it) => it?.p === 1).length;

// Sınıf: 'isletme' · 'ofis' · 'ev' · 'depo'
export function houseKind(h) {
  if (!h) return 'depo';
  if (isLegacyHomeOffice(h)) return 'ofis'; // v100 göçü bitene kadar
  if (h.biz?.type || h.bizType) return 'isletme';
  if (activeOfficeKeys(h).length > 0) return 'ofis';
  return ownedItemCount(h) >= HOUSE_MIN_ITEMS ? 'ev' : 'depo';
}

// Eski home ofisin (mescit/sinema/stüdyo) yeni ofis ayarı (v100 göçü)
export const LEGACY_EMOJI = { mescit: '🕌', sinema: '🎬', studyo: '🎚️' };
export function officeFromLegacy(h) {
  const type = h?.biz?.type || h?.bizType;
  const office = { keys: {}, prices: {}, minute: OFFICE_BANDS.minute.def, emoji: LEGACY_EMOJI[type] || null, sinceMs: Number(h?.biz?.openedAtMs || 0) || null };
  if (type === 'studyo') {
    office.keys.mixer = true;
    office.minute = clampInt(h?.bizPrices?.minute, OFFICE_BANDS.minute);
  } else if (type === 'sinema') {
    office.keys.popcorn = true;
    office.keys.drinkfridge = true;
    [...officeProductsOf('popcorn'), ...officeProductsOf('drinkfridge')].forEach((p) => {
      const old = Number(h?.bizPrices?.menu?.[p]);
      office.prices[p] = clampInt(Number.isInteger(old) && old > 0 ? old : 200, productBand(p));
    });
  } else if (type === 'mescit') {
    office.keys.bagiskutusu = true;
  }
  return office;
}

// Ofis adının başına konabilecek emojiler (Unicode 11 ve öncesi — iPhone, Android, PC'de çalışır)
export const OFFICE_EMOJIS = [
  // dükkân / iş
  '🏢', '🏪', '🏬', '🏦', '🏨', '🏛️', '🏟️', '🎪', '⛺', '🏕️', '🏖️', '🏝️', '🌋', '🗻', '🏔️',
  // yiyecek / içecek
  '☕', '🍵', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹', '🥃', '🥤', '🍼', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙', '🍝', '🍜', '🍣', '🍤', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍿', '🍦', '🍧', '🍨', '🥐', '🥯', '🥨', '🥞', '🍎', '🍉', '🍓', '🍒', '🥑', '🌽', '🥕',
  // müzik / sanat / eğlence
  '🎵', '🎶', '🎤', '🎧', '🎸', '🎹', '🥁', '🎷', '🎺', '🎻', '🎚️', '🎛️', '📻', '🎬', '🎥', '📽️', '🎞️', '🎭', '🎨', '🖼️', '🎮', '🕹️', '🎲', '🃏', '🎯', '🎳', '🎰', '🎡', '🎢', '🎠',
  // spor
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏓', '🏸', '🥊', '🥋', '⛳', '🏊', '🏄', '🚴', '🏋️', '🧘', '⛸️', '🎿', '🏆', '🥇',
  // doğa
  '🌴', '🌵', '🌲', '🌳', '🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🍁', '🌊', '☀️', '🌙', '⭐', '🌟', '🔥', '❄️', '🌈', '⚡',
  // hayvanlar
  '🐶', '🐱', '🦁', '🐯', '🐻', '🐼', '🦊', '🐺', '🦄', '🐴', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦅', '🦉', '🐬', '🐳', '🦈', '🐙', '🦋', '🐝', '🐞',
  // eşyalar / semboller
  '💎', '💰', '💵', '👑', '🎩', '👓', '🕶️', '💄', '💅', '💇', '💈', '🛍️', '🎁', '🎈', '🎉', '🎊', '📚', '📖', '✏️', '🔬', '🔭', '💡', '🔧', '🔨', '⚙️', '🧲', '🧪', '💊', '🚗', '🏎️', '🏍️', '🚲', '✈️', '🚀', '⚓', '🛥️', '🚂',
  // yüzler / kalpler
  '😀', '😎', '🤩', '🥳', '😇', '🤠', '👻', '👽', '🤖', '💀', '😈', '🤡', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💖',
  // din / kültür
  '🕌', '🕋', '📿', '🤲', '🙏', '☪️', '🧿',
];
export const isOfficeEmoji = (e) => OFFICE_EMOJIS.includes(e);
