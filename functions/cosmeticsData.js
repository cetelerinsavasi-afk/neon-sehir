// =============================================================================
// v78 — EVCİL HAYVAN & AKSESUAR kataloğu (TEK DOĞRULUK KAYNAĞI)
// Sunucu (functions/cosmetics.js) fiyat/sahiplik doğrular; istemci
// (src/lib/cosmeticsArt.js) çizimleri bu kimliklerle eşler.
//
// Fiyat kuralı (istek): her kategoride en az tercih edilen 1 ürün 100.000
// altın, 1 ürün 200.000 altın; geri kalanı zümrüt: en değerli 200, sonra 150,
// 100, 50; diğerleri 2–40 zümrüt.
// =============================================================================

export const RARITY = {
  c: { label: 'Yaygın', color: '#9aa4b2' },
  r: { label: 'Nadir', color: '#3aa0ff' },
  e: { label: 'Epik', color: '#b44cff' },
  l: { label: 'Efsanevi', color: '#ffc83d' },
};

// kind: q = dört ayaklı, b = kuş · perch: duran sahibinin omzuna konar
export const PETS = [
  { id: 'hamster', name: 'Hamster', r: 'c', gold: 100_000, kind: 'q', say: '*yanaklar dolu*' },
  { id: 'sokak', name: 'Sokak Kedisi', r: 'c', gold: 200_000, kind: 'q', say: 'Miyav. (Mama?)' },
  { id: 'hindi', name: 'Tombik Hindi', r: 'c', gem: 2, kind: 'b', fun: 1, say: 'Gulu gulu gulu!' },
  { id: 'tavsan', name: 'Tavşan', r: 'c', gem: 3, kind: 'q', say: '*burun kıpırdatır*' },
  { id: 'golden', name: 'Golden Köpek', r: 'c', gem: 5, kind: 'q', say: 'Hav hav! 🐾' },
  { id: 'karakedi', name: 'Kara Kedi', r: 'c', gem: 6, kind: 'q', say: 'Uğursuz değilim, şanslıyım.' },
  { id: 'marti', name: 'Simit Martısı', r: 'r', gem: 8, kind: 'b', fun: 1, perch: 1, say: 'Simit... SİMİT!' },
  { id: 'dalmacyali', name: 'Dalmaçyalı', r: 'r', gem: 10, kind: 'q', say: 'Benekli ve havalı.' },
  { id: 'baykus', name: 'Baykuş', r: 'r', gem: 12, kind: 'b', perch: 1, say: 'Huu-huu… gece benim.' },
  { id: 'penguen', name: 'Penguen', r: 'r', gem: 15, kind: 'b', say: 'Soğuk mu geldi?' },
  { id: 'tilki', name: 'Tilki', r: 'r', gem: 18, kind: 'q', say: 'Ne diyor Tilki?' },
  { id: 'papagan', name: 'Papağan', r: 'r', gem: 20, kind: 'b', perch: 1, say: 'Merhaba patron!' },
  { id: 'maymun', name: 'Maymun', r: 'e', gem: 25, kind: 'q', say: 'Ooh ooh aah aah!' },
  { id: 'panda', name: 'Panda', r: 'e', gem: 30, kind: 'q', say: 'Bambu var mı?' },
  { id: 'zengin', name: 'Zengin Kedi', r: 'e', gem: 35, kind: 'q', fun: 1, say: 'Mamamı altın kaseye koy.' },
  { id: 'bulldog', name: 'Mafya Bulldog', r: 'e', gem: 40, kind: 'q', say: 'Hrrr. Patronu kimse rahatsız etmez.' },
  { id: 'midilli', name: 'Gökkuşağı Midilli', r: 'l', gem: 50, kind: 'q', say: 'Parıl parıl!' },
  { id: 'aslan', name: 'Aslan', r: 'l', gem: 100, kind: 'q', say: 'GÜÜÜR! (tatlı gürleme)' },
  { id: 'kurt', name: 'Neon Kurt', r: 'l', gem: 150, kind: 'q', say: 'Auuuu! (neon uluma)' },
  { id: 'ejder', name: 'Mini Ejder', r: 'l', gem: 200, kind: 'q', say: 'Sadece mum yaktım 🔥' },
];

export const ACC_SLOTS = { head: 'Baş', face: 'Yüz', neck: 'Boyun', back: 'Sırt', aura: 'Aura' };

export const ACCESSORIES = [
  { id: 'foil', name: 'Folyo Şapka (Komplo Önleyici)', slot: 'head', r: 'c', gold: 100_000, fun: 1 },
  { id: 'mustache', name: 'Sahte Bıyık', slot: 'face', r: 'c', gold: 200_000, fun: 1 },
  { id: 'chef', name: 'Şef Şapkası', slot: 'head', r: 'c', gem: 2 },
  { id: 'simit', name: 'Dev Simit Şapka', slot: 'head', r: 'c', gem: 3, fun: 1 },
  { id: 'pixel', name: 'Piksel Gözlük', slot: 'face', r: 'c', gem: 5, fun: 1 },
  { id: 'catears', name: 'Neon Kedi Kulağı', slot: 'head', r: 'r', gem: 8 },
  { id: 'monocle', name: 'Altın Monokl', slot: 'face', r: 'r', gem: 10 },
  { id: 'horns', name: 'Şeytan Boynuzları', slot: 'head', r: 'r', gem: 12 },
  { id: 'hero', name: 'Kahraman Pelerini', slot: 'back', r: 'r', gem: 15 },
  { id: 'medal', name: 'Altın Madalyon', slot: 'neck', r: 'r', gem: 18 },
  { id: 'ring', name: 'Neon Halka', slot: 'aura', r: 'r', gem: 20 },
  { id: 'kilim', name: 'Anadolu Kilim Pelerini', slot: 'back', r: 'e', gem: 22, fun: 1 },
  { id: 'halo', name: 'Parlayan Hale', slot: 'head', r: 'e', gem: 25 },
  { id: 'jet', name: 'Roket Sırt Çantası', slot: 'back', r: 'e', gem: 28 },
  { id: 'visor', name: 'Siber Vizör', slot: 'face', r: 'e', gem: 30 },
  { id: 'angel', name: 'Melek Kanatları', slot: 'back', r: 'e', gem: 35 },
  { id: 'fire', name: 'Ateş Aurası', slot: 'aura', r: 'e', gem: 38 },
  { id: 'diamond', name: 'Elmas Kolye', slot: 'neck', r: 'e', gem: 40 },
  { id: 'spark', name: 'Yıldız Tozu', slot: 'aura', r: 'l', gem: 50 },
  { id: 'royal', name: 'Kraliyet Pelerini', slot: 'back', r: 'l', gem: 100 },
  { id: 'crown', name: 'Altın Kral Tacı', slot: 'head', r: 'l', gem: 150 },
  { id: 'dragonw', name: 'Ejder Kanatları', slot: 'back', r: 'l', gem: 200 },
];

// Tasma renkleri (sadece bu palet — SVG/canvas'a güvenle girer)
export const LEASH_COLORS = ['#ff2e88', '#22d3ee', '#ffd23f', '#6dff9c', '#b44cff', '#ff6a1a', '#f4f4f4', '#111111', '#c81d3f', '#2a6bff'];

export const PET_MAP = Object.fromEntries(PETS.map((p) => [p.id, p]));
export const ACC_MAP = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]));

export function priceOf(item) {
  if (!item) return null;
  return item.gold ? { currency: 'gold', amount: item.gold } : { currency: 'gem', amount: item.gem };
}

// users/{uid}.cosmetics = { pets: { id: alınma ms }, accs: { id: alınma ms } }
// avatar.acc = { slot: id } · avatar.pet = { id, leash, leashColor }
// Sahip olunmayan / geçersiz her şeyi ayıklar (setAvatar ve kuşanma için).
export function cleanEquipped(rawAvatar, cosmetics) {
  const ownedP = cosmetics?.pets || {};
  const ownedA = cosmetics?.accs || {};
  const out = {};
  const acc = {};
  const src = rawAvatar?.acc && typeof rawAvatar.acc === 'object' ? rawAvatar.acc : {};
  for (const slot of Object.keys(ACC_SLOTS)) {
    const id = src[slot];
    if (typeof id === 'string' && ACC_MAP[id]?.slot === slot && ownedA[id]) acc[slot] = id;
  }
  if (Object.keys(acc).length) out.acc = acc;
  const p = rawAvatar?.pet;
  if (p && typeof p === 'object' && typeof p.id === 'string' && PET_MAP[p.id] && ownedP[p.id]) {
    out.pet = {
      id: p.id,
      leash: p.leash !== false,
      leashColor: LEASH_COLORS.includes(p.leashColor) ? p.leashColor : LEASH_COLORS[0],
    };
  }
  return out;
}
