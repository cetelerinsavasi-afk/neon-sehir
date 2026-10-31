// =============================================================================
// animalData.js — v137 EV HAYVANLARI (Mobilya › Hayvanlar) + PETSHOP
// Saf modül — sunucu (houses.js petSet doğrulaması) ve istemci (katalog, hayvan
// düzenleyici, odada gezen hayvan) AYNI tanımları kullanır.
//
// Hayvan eşyası (houses/{id}.items, k: 'hy_*'): yerde küçük bir pati platformu;
// satın alınınca üstünde bir hayvan durur / gezer. Rengi eşyanın renk seçeneği
// (items[].ti → PET_TINTS). Ad, 3 söz, hareket: houses/{id}.pets[eşyaKimliği]
//   { n: ad, l: [3 söz], mv: 'sabit'|'hareket'|'serbest' }
// Konumlar herkesin kendi cihazında hesaplanır (Firebase'e yazma YOK).
// Fiyatlar functions/houseCatalogData.js (ITEM_PRICES).
// =============================================================================

export const PET_NAME_MAX = 20;
export const PET_LINE_MAX = 80;
export const PET_LINES = 3;
// v137.1 — sabit modda duruş
export const PET_POSES = [
  { id: 'ayakta', label: 'Ayakta', icon: '🧍' },
  { id: 'otur', label: 'Otur', icon: '🪑' },
];
export const PET_MOVES = [
  { id: 'sabit', label: 'Sabit dur', icon: '🧍' },
  { id: 'hareket', label: 'Hareket et', icon: '🐾' },
  { id: 'serbest', label: 'Serbest gez', icon: '🗺️' },
];

// art: src/lib/cosmeticsArt.js PET_ART kimliği · kind: q dört ayaklı, b kuş, m iki ayaklı
const A = (art, name, icon, kind, lines) => ({ k: `hy_${art}`, art, name, icon, kind, lines, g: PET_GROUP[art] || 'diger' });
// v137.1 — tür grupları (petshop eşyalarıyla etkileşim: kedi tırmalama ağacına çıkar,
// köpek kulübesine, tavuk kümese girer, at ahıra, hamster çarkta koşar…)
const PET_GROUP = {
  sokak: 'kedi', karakedi: 'kedi', zengin: 'kedi',
  golden: 'kopek', kangal: 'kopek', dalmacyali: 'kopek', mops: 'kopek', bulldog: 'kopek',
  tavuk: 'kumes', ordek: 'kumes', hindi: 'kumes',
  papagan: 'kafes', baykus: 'kafes',
  at: 'at', midilli: 'at',
  hamster: 'kemirgen', tavsan: 'kemirgen',
};
export const ANIMALS = [
  A('hamster', 'Hamster', '🐹', 'm', ['*yanakları dolu*', 'Çark nerede?', '*burnunu kıpırdatır*']),
  A('tavuk', 'Tavuk', '🐔', 'b', ['Gıt gıt gıdak!', '*yemleri eşeler*', 'Bugün yumurta var mı?']),
  A('ordek', 'Ördek', '🦆', 'b', ['Vak vak!', '*kanatlarını silker*', 'Havuz var mı burada?']),
  A('sokak', 'Sokak Kedisi', '🐱', 'q', ['Miyav. (Mama?)', '*kuyruğunu dikip sürtünür*', 'Mrrr…']),
  A('tavsan', 'Tavşan', '🐰', 'm', ['*burnunu kıpırdatır*', 'Havuç?', '*zıplar*']),
  A('hindi', 'Hindi', '🦃', 'b', ['Gulu gulu gulu!', '*kabarır*', 'Gulu!']),
  A('mops', 'Mops', '🐶', 'q', ['Hrrf hrrf!', '*horlar*', 'Hav!']),
  A('marti', 'Martı', '🕊️', 'b', ['Simit... SİMİT!', '*bağırır*', 'Çay var mı?']),
  A('karakedi', 'Kara Kedi', '🐈‍⬛', 'q', ['Uğursuz değilim, şanslıyım.', '*gözlerini kısar*', 'Miyav.']),
  A('golden', 'Golden Köpek', '🐕', 'q', ['Hav hav! 🐾', '*kuyruk sallar*', 'Top atar mısın?']),
  A('baykus', 'Baykuş', '🦉', 'b', ['Huu-huu… gece benim.', '*başını çevirir*', 'Huu?']),
  A('kangal', 'Kangal', '🐕', 'q', ['HAV!', '*kapıyı bekler*', 'Bu ev bana emanet.']),
  A('dalmacyali', 'Dalmaçyalı', '🐶', 'q', ['Benekli ve havalı.', 'Hav!', '*koklar*']),
  A('penguen', 'Penguen', '🐧', 'b', ['Soğuk mu geldi?', '*paytak paytak yürür*', 'Balık?']),
  A('tilki', 'Tilki', '🦊', 'q', ['Ne diyor Tilki?', '*sinsice bakar*', 'Kiiik!']),
  A('papagan', 'Papağan', '🦜', 'b', ['Merhaba patron!', 'Çay koy! Çay koy!', '*taklit eder*']),
  A('maymun', 'Maymun', '🐒', 'm', ['Ooh ooh aah aah!', '*muz arar*', '*kafasını kaşır*']),
  A('at', 'At', '🐎', 'q', ['İhahaha!', '*toynaklarını vurur*', '*kişner*']),
  A('bulldog', 'Mafya Bulldog', '🐶', 'q', ['Hrrr. Patronu kimse rahatsız etmez.', '*zinciri şıngırdar*', 'Hav.']),
  A('zengin', 'Zengin Kedi', '😼', 'q', ['Mamamı altın kaseye koy.', '*monoklünü düzeltir*', 'Miyav, şampanya lütfen.']),
  A('panda', 'Panda', '🐼', 'm', ['Bambu var mı?', '*yuvarlanır*', '*esner*']),
  A('aslan', 'Aslan', '🦁', 'q', ['GÜÜÜR! (tatlı gürleme)', '*yelesini savurur*', 'Kral benim.']),
  A('ejder', 'Mini Ejder', '🐉', 'q', ['Sadece mum yaktım 🔥', '*duman üfler*', 'Hazine nerede?']),
  A('kurt', 'Neon Kurt', '🐺', 'q', ['Auuuu! (neon uluma)', '*gözleri parlar*', 'Sürü benim.']),
  A('midilli', 'Gökkuşağı Midilli', '🦄', 'q', ['Parıl parıl!', '*gökkuşağı saçar*', 'İhihi!']),
];
export const ANIMAL_BY_KEY = Object.fromEntries(ANIMALS.map((a) => [a.k, a]));
export const isAnimalKey = (k) => Boolean(ANIMAL_BY_KEY[k]);
export const MAX_ROOM_PETS = 16;

// Renk seçenekleri (eşya renk seçeneği = items[].ti). İlk seçenek: doğal renk.
const sw = (c, c2) => `linear-gradient(135deg, ${c} 55%, ${c2} 55%)`;
const T = (n, c, c2) => ({ n, c, c2, sw: sw(c, c2) });
export const PET_TINTS = {
  pet_q: [
    { n: 'Doğal', c: null, c2: null, sw: 'conic-gradient(#e2ae58 0 25%, #1d1d26 0 50%, #f4f2ee 0 75%, #8a5a34 0)' },
    T('Siyah', '#1d1d26', '#3a3a48'),
    T('Beyaz', '#f4f2ee', '#ffffff'),
    T('Kahverengi', '#7a4a2a', '#b07a50'),
    T('Gri', '#8f959e', '#cfd4da'),
    T('Sarı', '#e2ae58', '#f6deae'),
    T('Kızıl', '#c4622a', '#f0b384'),
    T('Krem', '#e8d6b4', '#f7eedc'),
  ],
  pet_b: [
    { n: 'Doğal', c: null, c2: null, sw: 'conic-gradient(#f4f6f8 0 33%, #e3262f 0 66%, #1b2230 0)' },
    T('Beyaz', '#f4f6f8', '#cfd6de'),
    T('Siyah', '#1b1b22', '#4a4a58'),
    T('Kahverengi', '#8a5a34', '#c49a6c'),
    T('Yeşil', '#2fae5f', '#ffcc1a'),
    T('Mavi', '#2a6bff', '#9cc0ff'),
    T('Kırmızı', '#d62828', '#ffb347'),
  ],
  pet_m: [
    { n: 'Doğal', c: null, c2: null, sw: 'conic-gradient(#d9944a 0 33%, #f1ece4 0 66%, #7a4a2a 0)' },
    T('Beyaz', '#f1ece4', '#ffffff'),
    T('Gri', '#9aa0a8', '#dfe3e8'),
    T('Kahverengi', '#7a4a2a', '#e8c9a0'),
    T('Altın', '#d9944a', '#fbeedd'),
    T('Siyah', '#22222a', '#5a5a66'),
  ],
};
export const petTintsKey = (k) => `pet_${ANIMAL_BY_KEY[k]?.kind || 'q'}`;
export function petTintOf(k, ti) {
  const list = PET_TINTS[petTintsKey(k)];
  const t = list[Math.max(0, Math.min(list.length - 1, Number(ti) || 0))];
  return t.c ? { c: t.c, c2: t.c2 } : null;
}

// Petshop eşyalarıyla etkileşim (v137.1). p: eşyanın yerel konumu [x, z] (önü +z),
// y: yükseklik (yatak / raf / kafes çubuğu), act: eat | drink | bed (yatar) | enter
// (içeri girer, bir süre görünmez) | perch (üstüne çıkar) | play | stall (ahırda durur).
// who: hangi tür grupları (yoksa herkes)
export const PETSHOP_SPOTS = {
  ps_mama: { act: 'eat', p: [0, 0.2] },
  ps_su: { act: 'drink', p: [0, 0.2] },
  ps_yatak: { act: 'bed', p: [0, 0], y: 0.1, who: ['kedi', 'kopek', 'kemirgen', 'diger'] },
  ps_kulube: { act: 'enter', p: [0, 0.6], who: ['kopek'] },
  ps_kumes: { act: 'enter', p: [0.2, 0.8], who: ['kumes'] },
  ps_ahir: { act: 'stall', p: [-0.35, 0.05], who: ['at'] },
  ps_saray: { act: 'perch', p: [-0.34, -0.04], y: 0.7, who: ['kedi'] },
  ps_tirmalama: { act: 'perch', p: [-0.12, 0], y: 0.66, who: ['kedi'] },
  ps_kafes: { act: 'perch', p: [0, 0], y: 1.03, who: ['kafes'] },
  ps_cark: { act: 'play', p: [0, 0], y: 0.08, who: ['kemirgen'] },
  ps_oyuncak: { act: 'play', p: [0, 0.15], who: ['kopek', 'kedi'] },
};
export const spotFor = (k, group) => {
  const s = PETSHOP_SPOTS[k];
  return s && (!s.who || s.who.includes(group)) ? s : null;
};

const clip = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// İstemciden gelen ayarı temizle
export function cleanPetConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const n = clip(r.n, PET_NAME_MAX);
  const l = (Array.isArray(r.l) ? r.l : []).slice(0, PET_LINES).map((x) => clip(x, PET_LINE_MAX));
  while (l.length && !l[l.length - 1]) l.pop();
  const mv = PET_MOVES.some((m) => m.id === r.mv) ? r.mv : 'hareket';
  const ps = r.ps === 'otur' ? 'otur' : 'ayakta';
  return { n, l, mv, ps };
}
// Ad (düzenlenmemişse türün adı) ve sözler (düzenlenmemişse türün sesleri)
export function petName(k, cfg) {
  return clip(cfg?.n, PET_NAME_MAX) || ANIMAL_BY_KEY[k]?.name || 'Hayvan';
}
export function petLines(k, rawCfg) {
  if (!rawCfg) return ANIMAL_BY_KEY[k]?.lines || [];
  return cleanPetConfig(rawCfg).l.filter(Boolean);
}
