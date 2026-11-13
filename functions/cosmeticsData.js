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
  { id: 'aslan', name: 'Aslan', r: 'l', gem: 50, kind: 'q', say: 'GÜÜÜR! (tatlı gürleme)' },
  { id: 'ejder', name: 'Mini Ejder', r: 'l', gem: 100, kind: 'q', say: 'Sadece mum yaktım 🔥' },
  { id: 'kurt', name: 'Neon Kurt', r: 'l', gem: 150, kind: 'q', say: 'Auuuu! (neon uluma)' },
  { id: 'midilli', name: 'Gökkuşağı Midilli', r: 'l', gem: 200, kind: 'q', say: 'Parıl parıl!' },
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
  { id: 'kilim', name: 'Anadolu Kilim Pelerini', slot: 'back', r: 'e', gem: 20, fun: 1 },
  { id: 'halo', name: 'Parlayan Hale', slot: 'head', r: 'e', gem: 22 },
  { id: 'visor', name: 'Siber Vizör', slot: 'face', r: 'e', gem: 25 },
  { id: 'diamond', name: 'Elmas Kolye', slot: 'neck', r: 'e', gem: 28 },
  { id: 'angel', name: 'Melek Kanatları', slot: 'back', r: 'e', gem: 30 },
  { id: 'royal', name: 'Kraliyet Pelerini', slot: 'back', r: 'e', gem: 35 },
  { id: 'crown', name: 'Altın Kral Tacı', slot: 'head', r: 'e', gem: 38 },
  { id: 'dragonw', name: 'Ejder Kanatları', slot: 'back', r: 'e', gem: 40 },
  { id: 'jet', name: 'Roket Sırt Çantası', slot: 'back', r: 'l', gem: 50 },
  { id: 'ring', name: 'Neon Halka', slot: 'aura', r: 'l', gem: 100 },
  { id: 'spark', name: 'Yıldız Tozu', slot: 'aura', r: 'l', gem: 150 },
  { id: 'fire', name: 'Ateş Aurası', slot: 'aura', r: 'l', gem: 200 },
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
  const ownedL = cosmetics?.looks || {};
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
  // v160 — kuşanılmış kostüm (hazır tip) + renkleri; sadece sahip olunan
  const lk = rawAvatar?.look;
  if (typeof lk === 'string' && LOOK_MAP[lk] && ownedL[lk]) {
    out.look = lk;
    const t = cleanLookTint(rawAvatar?.lookTint);
    if (t) out.lookTint = t;
  }
  return out;
}

// =============================================================================
// v160 — KOSTÜMLER (hazır tipler) kataloğu (TEK DOĞRULUK KAYNAĞI)
// Sunucu (functions/cosmetics.js) fiyat/sahiplik doğrular; istemci (src/lib/avatarLooks.js)
// çizimleri bu kimliklerle eşler. Fiyat: en ucuzu 10, en pahalısı 200 zümrüt — ilgi çekici,
// kaliteli (Efsanevi / Epik) olanlar pahalı.
// v160.2: Volt, periler, Elf Okçu, Yeşil Gezgin, Zombi pahalandı; Lale Muhafızı, Gizli Ajan,
// Gladyatör, Büyük Sihirbaz, Baba ucuzladı (nadirlik fiyata göre).
// users/{uid}.cosmetics.looks = { id: alınma ms } · avatar.look = id · avatar.lookTint = { 0|1|2|s: #hex }
// =============================================================================
export const LOOK_CATS = [
  { id: 'kahraman', name: 'Süper Kahraman', icon: '⚡' },
  { id: 'dovus', name: 'Dövüşçü', icon: '🥊' },
  { id: 'sihir', name: 'Büyü & Peri', icon: '✨' },
  { id: 'uzay', name: 'Uzay & Robot', icon: '🚀' },
  { id: 'cizgi', name: 'Çizgi Film', icon: '🎈' },
  { id: 'film', name: 'Film Tipleri', icon: '🎬' },
  { id: 'korku', name: 'Korku', icon: '🦇' },
  { id: 'mitoloji', name: 'Mitoloji', icon: '🔱' },
  { id: 'turk', name: 'Türk Efsaneleri', icon: '🌙' },
  { id: 'neon', name: 'Neon Siber', icon: '🌆' },
];

export const LOOKS = [
  { id: 'volt', name: 'Volt', cat: 'kahraman', r: 'e', gem: 90, desc: 'Şehrin elektrik şebekesinden güç alan gece devriyesi.' },
  { id: 'gecekartali', name: 'Gece Kartalı', cat: 'kahraman', r: 'e', gem: 70, desc: 'Çatılardan süzülen, kanat pelerinli sessiz muhafız.' },
  { id: 'alevkralice', name: 'Alev Kraliçesi', cat: 'kahraman', r: 'e', gem: 80, desc: 'Saçları gerçekten yanıyor. Dokunma.' },
  { id: 'buzmuhafiz', name: 'Buz Muhafızı', cat: 'kahraman', r: 'e', gem: 60, desc: 'Kristal zırhlı dev; nefesi bile donduruyor.' },
  { id: 'dalgakaptani', name: 'Dalga Kaptanı', cat: 'kahraman', r: 'r', gem: 30, desc: 'Boğaz’ın akıntılarını avucunda tutan kahraman.' },
  { id: 'kuantum', name: 'Kuantum', cat: 'kahraman', r: 'e', gem: 60, desc: 'Aynı anda iki yerde olabilen gizemli kahraman.' },
  { id: 'golgehancer', name: 'Gölge Hançer', cat: 'kahraman', r: 'r', gem: 35, desc: 'Karanlıkta kaybolan çift hançerli suikastçı.' },
  { id: 'demirtitan', name: 'Demir Titan', cat: 'kahraman', r: 'l', gem: 175, desc: 'Altıgen çekirdekli dev zırh. Şehrin son savunma hattı.' },
  { id: 'yildiztozu', name: 'Yıldız Tozu', cat: 'kahraman', r: 'l', gem: 150, desc: 'Galaksi pelerinli, yıldızlardan güç alan kraliçe.' },
  { id: 'kasirga', name: 'Kasırga', cat: 'kahraman', r: 'c', gem: 15, desc: 'Rüzgârdan hızlı koşan gözlüklü genç kahraman.' },
  { id: 'kozmikmuhafiz', name: 'Kozmik Muhafız', cat: 'kahraman', r: 'l', gem: 190, desc: 'Altın-siyah zırh, ışıyan hale. Evrenin bekçisi.' },
  { id: 'miknatis', name: 'Mıknatıs', cat: 'kahraman', r: 'r', gem: 25, desc: 'Metal olan her şey ona doğru çekilir.' },
  { id: 'zirhlibozkurt', name: 'Zırhlı Bozkurt', cat: 'kahraman', r: 'e', gem: 80, desc: 'Kurt kulaklı gümüş başlık, bozkırın kahramanı.' },
  { id: 'isikhizi', name: 'Işık Hızı', cat: 'kahraman', r: 'e', gem: 50, desc: 'Işık kanatlarıyla şehrin üstünde parlayan kahraman.' },
  { id: 'kumfirtinasi', name: 'Kum Fırtınası', cat: 'kahraman', r: 'c', gem: 15, desc: 'Çölden gelen, atkılı ve gözlüklü gezgin kahraman.' },
  { id: 'lalemuhafizi', name: 'Lale Muhafızı', cat: 'kahraman', r: 'e', gem: 50, desc: 'Altın laleli kızıl kostüm, İstanbul’un koruyucusu.' },
  { id: 'karakusak', name: 'Kara Kuşak', cat: 'dovus', r: 'c', gem: 10, desc: 'Beyaz kimono, siyah kuşak. Disiplin her şeydir.' },
  { id: 'kungfu', name: 'Kung Fu Ustası', cat: 'dovus', r: 'r', gem: 25, desc: 'Kırmızı ipek gömlekli, akıcı stilin ustası.' },
  { id: 'boksor', name: 'Ağır Sıklet', cat: 'dovus', r: 'c', gem: 10, desc: 'Eldivenleri boynunda, kemeri belinde.' },
  { id: 'ejderyumruk', name: 'Ejder Yumruk', cat: 'dovus', r: 'e', gem: 50, desc: 'Beyaz dikenli saç, kırmızı aura. Anime ruhu.' },
  { id: 'ninja', name: 'Gölge Ninja', cat: 'dovus', r: 'r', gem: 30, desc: 'Sırtında katana, belinde shuriken.' },
  { id: 'kunoichi', name: 'Mor Kunoichi', cat: 'dovus', r: 'r', gem: 30, desc: 'Hızlı, sessiz, mor peçeli kadın ninja.' },
  { id: 'samuray', name: 'Kızıl Samuray', cat: 'dovus', r: 'e', gem: 70, desc: 'Hilal miğferli, lake zırhlı onurlu savaşçı.' },
  { id: 'baspehlivan', name: 'Başpehlivan', cat: 'dovus', r: 'l', gem: 120, desc: 'Kırkpınar’ın altın kemerli yağlı güreş şampiyonu.' },
  { id: 'sumo', name: 'Yokozuna', cat: 'dovus', r: 'r', gem: 25, desc: 'Ringin en ağır, en saygın güreşçisi.' },
  { id: 'sokakdovuscusu', name: 'Sokak Dövüşçüsü', cat: 'dovus', r: 'c', gem: 10, desc: 'Kırmızı bandana, yırtık kapüşonlu, zincirli.' },
  { id: 'lucha', name: 'El Relámpago', cat: 'dovus', r: 'e', gem: 50, desc: 'Renkli maskeli, pelerinli serbest güreş yıldızı.' },
  { id: 'shaolin', name: 'Dağ Keşişi', cat: 'dovus', r: 'c', gem: 15, desc: 'Turuncu cübbe, tespih ve asa. Sabır ustası.' },
  { id: 'ruzgarkilici', name: 'Rüzgâr Kılıcı', cat: 'dovus', r: 'e', gem: 60, desc: 'Beyaz uzun saçlı, haorili gezgin kılıç ustası.' },
  { id: 'ringkralicesi', name: 'Ringin Kraliçesi', cat: 'dovus', r: 'r', gem: 30, desc: 'Altın kemerli, örgü saçlı şampiyon.' },
  { id: 'atesperisi', name: 'Kor Perisi', cat: 'sihir', r: 'l', gem: 140, desc: 'Kor renkli kanatlar, alevli asa.' },
  { id: 'superisi', name: 'Dalga Perisi', cat: 'sihir', r: 'l', gem: 130, desc: 'Su kabarcıkları arasında süzülen peri.' },
  { id: 'ormanperisi', name: 'Orman Perisi', cat: 'sihir', r: 'l', gem: 120, desc: 'Yaprak elbiseli, çiçek taçlı.' },
  { id: 'ayperisi', name: 'Ay Perisi', cat: 'sihir', r: 'l', gem: 150, desc: 'Hilal taçlı, gümüş-lila gece perisi.' },
  { id: 'safakperisi', name: 'Şafak Perisi', cat: 'sihir', r: 'l', gem: 130, desc: 'Gün doğumunun pembe-altın renkleri.' },
  { id: 'kristalprenses', name: 'Kristal Prenses', cat: 'sihir', r: 'l', gem: 140, desc: 'Buz kristali kanatlar ve taç.' },
  { id: 'yildizbuyucusu', name: 'Yıldız Büyücüsü', cat: 'sihir', r: 'r', gem: 35, desc: 'Yıldızlı külah, uzun ak sakal.' },
  { id: 'karabuyucu', name: 'Kara Büyücü', cat: 'sihir', r: 'e', gem: 80, desc: 'Kapüşonun altında sadece mor gözler parlar.' },
  { id: 'kelebekkralice', name: 'Kelebek Kraliçesi', cat: 'sihir', r: 'e', gem: 60, desc: 'Turuncu-siyah dev kanatlar.' },
  { id: 'elfokcu', name: 'Elf Okçu', cat: 'sihir', r: 'e', gem: 70, desc: 'Sivri kulaklar, yeşil pelerin, sırtında yay.' },
  { id: 'yesilgezgin', name: 'Yeşil Gezgin', cat: 'uzay', r: 'e', gem: 60, desc: 'Klasik uzaylı. Barış için geldi (galiba).' },
  { id: 'kristaluzayli', name: 'Kristal Kafa', cat: 'uzay', r: 'e', gem: 50, desc: 'Kafası tek parça mavi kristal.' },
  { id: 'tentakul', name: 'Tentakül Bey', cat: 'uzay', r: 'r', gem: 25, desc: 'Tek gözlü, dokunaç sakallı mor misafir.' },
  { id: 'lavagolemi', name: 'Lav Golemi', cat: 'uzay', r: 'e', gem: 70, desc: 'İçinden lav akan kaya dev.' },
  { id: 'tenekerobot', name: 'Teneke Robot', cat: 'uzay', r: 'c', gem: 10, desc: 'Antenli, perçinli, kadranlı retro robot.' },
  { id: 'androidx', name: 'Android X', cat: 'uzay', r: 'l', gem: 130, desc: 'Beyaz porselen yüz, mavi ışık hatları.' },
  { id: 'astronot', name: 'Astronot', cat: 'uzay', r: 'r', gem: 25, desc: 'Cam kasklı, bayraksız, her gezegene hazır.' },
  { id: 'galaksikorsani', name: 'Galaksi Korsanı', cat: 'uzay', r: 'e', gem: 60, desc: 'Mavi tenli, göz bantlı uzay haydudu.' },
  { id: 'mechpilot', name: 'Mech Pilotu', cat: 'uzay', r: 'c', gem: 15, desc: 'Turuncu uçuş tulumu, vizörlü kask.' },
  { id: 'superteyze', name: 'Süper Teyze', cat: 'cizgi', r: 'e', gem: 50, desc: 'Bigudili, pelerinli, oklavalı mahalle kahramanı.' },
  { id: 'kurnaztilki', name: 'Kurnaz Tilki', cat: 'cizgi', r: 'r', gem: 30, desc: 'Yelekli, sırıtkan tilki.' },
  { id: 'uykucupanda', name: 'Uykucu Panda', cat: 'cizgi', r: 'c', gem: 10, desc: 'Panda tulumu, yastık, sonsuz uyku.' },
  { id: 'cilginbilim', name: 'Çılgın Profesör', cat: 'cizgi', r: 'r', gem: 25, desc: 'Diken diken ak saç, gözlük, köpüren iksir.' },
  { id: 'kopekbaligi', name: 'Köpekbalığı Tulumu', cat: 'cizgi', r: 'c', gem: 15, desc: 'Kafası köpekbalığının ağzından çıkıyor.' },
  { id: 'dinozor', name: 'Dino Tulum', cat: 'cizgi', r: 'c', gem: 15, desc: 'Yeşil, dikenli, ROAR!' },
  { id: 'kartonrobot', name: 'Karton Robot', cat: 'cizgi', r: 'c', gem: 10, desc: 'Koli kutusundan robot kostümü.' },
  { id: 'palyaco', name: 'Şakşak Palyaço', cat: 'cizgi', r: 'r', gem: 25, desc: 'Gökkuşağı saç, kırmızı burun, puantiye.' },
  { id: 'morcanavar', name: 'Pofuduk Canavar', cat: 'cizgi', r: 'r', gem: 30, desc: 'Mor tüylü, koca gülüşlü sevimli canavar.' },
  { id: 'hamburger', name: 'Hamburger Maskot', cat: 'cizgi', r: 'c', gem: 10, desc: 'Ekstra peynirli kostüm.' },
  { id: 'korsankaptan', name: 'Korsan Kaptan', cat: 'film', r: 'r', gem: 35, desc: 'Üç köşe şapka, kırmızı ceket, pala.' },
  { id: 'kovboy', name: 'Şerif', cat: 'film', r: 'c', gem: 15, desc: 'Kovboy şapkası, yelek, şerif yıldızı.' },
  { id: 'gizliajan', name: 'Gizli Ajan', cat: 'film', r: 'c', gem: 15, desc: 'Smokin, güneş gözlüğü, kulaklık.' },
  { id: 'gladyator', name: 'Gladyatör', cat: 'film', r: 'r', gem: 25, desc: 'Izgaralı tunç miğfer, deri kayışlar.' },
  { id: 'spartali', name: 'Hoplit', cat: 'film', r: 'e', gem: 70, desc: 'Sorguçlu miğfer, kızıl pelerin, mızrak.' },
  { id: 'uzaykomando', name: 'Uzay Komandosu', cat: 'film', r: 'l', gem: 120, desc: 'Beyaz-turuncu zırh, karanlık vizör.' },
  { id: 'colkasifi', name: 'Çöl Kâşifi', cat: 'film', r: 'c', gem: 10, desc: 'Mantar şapka, haki gömlek, harita.' },
  { id: 'kiyamet', name: 'Kıyamet Savaşçısı', cat: 'film', r: 'r', gem: 30, desc: 'Dikenli omuzluk, gözlük, çöl tozu.' },
  { id: 'rockyildizi', name: 'Rock Yıldızı', cat: 'film', r: 'r', gem: 35, desc: 'Deri ceket, mohawk, elektro gitar.' },
  { id: 'sihirbaz', name: 'Büyük Sihirbaz', cat: 'film', r: 'r', gem: 25, desc: 'Silindir şapka, pelerin, yıldızlı değnek.' },
  { id: 'mafyababasi', name: 'Baba', cat: 'film', r: 'e', gem: 60, desc: 'Çizgili takım, fötr, puro, yakada gül.' },
  { id: 'kontvlad', name: 'Kont Vlad', cat: 'korku', r: 'e', gem: 70, desc: 'Yüksek yakalı pelerin, sivri dişler.' },
  { id: 'kurtadam', name: 'Kurt Adam', cat: 'korku', r: 'e', gem: 60, desc: 'Dolunay gecesi gömleği yırtıldı.' },
  { id: 'zombi', name: 'Zombi', cat: 'korku', r: 'r', gem: 45, desc: 'Dikişli, yırtık, biraz da aç.' },
  { id: 'iskeletkral', name: 'İskelet Kral', cat: 'korku', r: 'l', gem: 120, desc: 'Taçlı kafatası, mor kraliyet cübbesi.' },
  { id: 'kabakkafa', name: 'Kabak Kafa', cat: 'korku', r: 'r', gem: 30, desc: 'Kafasında mum yanan korkuluk.' },
  { id: 'cadi', name: 'Mor Cadı', cat: 'korku', r: 'r', gem: 25, desc: 'Sivri şapka, süpürge, mor saç.' },
  { id: 'mumya', name: 'Mumya', cat: 'korku', r: 'c', gem: 15, desc: 'Sargı bezleri arasından iki parlak göz.' },
  { id: 'olummelegi', name: 'Ölüm Meleği', cat: 'korku', r: 'l', gem: 150, desc: 'Kara kapüşon, parlayan gözler, tırpan.' },
  { id: 'zeus', name: 'Zeus', cat: 'mitoloji', r: 'l', gem: 190, desc: 'Defne taçlı, şimşek tutan gök tanrısı.' },
  { id: 'anubis', name: 'Anubis', cat: 'mitoloji', r: 'l', gem: 150, desc: 'Çakal başlı, altın yakalı ölüler rehberi.' },
  { id: 'medusa', name: 'Medusa', cat: 'mitoloji', r: 'e', gem: 80, desc: 'Saçları yılan. Gözlerine bakma.' },
  { id: 'vikingjarl', name: 'Viking Jarl', cat: 'mitoloji', r: 'r', gem: 35, desc: 'Örgü sakal, kürk pelerin, balta.' },
  { id: 'valkur', name: 'Valkür', cat: 'mitoloji', r: 'e', gem: 70, desc: 'Kanatlı miğfer, gümüş zırh, mızrak.' },
  { id: 'firavun', name: 'Firavun', cat: 'mitoloji', r: 'e', gem: 60, desc: 'Altın-mavi başlık, asa, geniş yaka.' },
  { id: 'poseidon', name: 'Poseidon', cat: 'mitoloji', r: 'e', gem: 70, desc: 'Mercan taç, deniz yeşili sakal, üç dişli mızrak.' },
  { id: 'ejdersovalye', name: 'Ejder Şövalyesi', cat: 'mitoloji', r: 'r', gem: 35, desc: 'Ejder armalı zırh ve kılıç.' },
  { id: 'kitsune', name: 'Dokuz Kuyruk', cat: 'mitoloji', r: 'l', gem: 140, desc: 'Dokuz kuyruklu tilki ruhu.' },
  { id: 'keloglan', name: 'Keloğlan', cat: 'turk', r: 'c', gem: 15, desc: 'Yamalı yelek, şalvar, kocaman gülüş.' },
  { id: 'nasreddinhoca', name: 'Nasreddin Hoca', cat: 'turk', r: 'e', gem: 60, desc: 'Kavuk, ak sakal ve doğuran kazan.' },
  { id: 'karagoz', name: 'Karagöz', cat: 'turk', r: 'r', gem: 30, desc: 'Gölge oyununun kara sakallı, dobra kahramanı.' },
  { id: 'hacivat', name: 'Hacivat', cat: 'turk', r: 'r', gem: 30, desc: 'Sivri sakallı, kavuklu, laf ustası.' },
  { id: 'dedekorkut', name: 'Dede Korkut', cat: 'turk', r: 'e', gem: 70, desc: 'Kalpaklı, ak sakallı, kopuzlu ozan.' },
  { id: 'yeniceri', name: 'Yeniçeri', cat: 'turk', r: 'e', gem: 80, desc: 'Ak börk, kaşıklık, yatağan.' },
  { id: 'gokturkalp', name: 'Gök Alp', cat: 'turk', r: 'l', gem: 150, desc: 'Pullu zırh, sivri miğfer, bozkurt sancağı.' },
  { id: 'zeybek', name: 'Zeybek', cat: 'turk', r: 'r', gem: 35, desc: 'Saçaklı başlık, cepken, kuşakta yatağan.' },
  { id: 'siberninja', name: 'Siber Ninja', cat: 'neon', r: 'e', gem: 80, desc: 'Pembe neon hatlar, ışın katana.' },
  { id: 'pikselmaske', name: 'Piksel Maske', cat: 'neon', r: 'r', gem: 30, desc: 'LED maskeli anonim hacker.' },
  { id: 'neonsamuray', name: 'Neon Samuray', cat: 'neon', r: 'l', gem: 175, desc: 'Camgöbeği ışıklı beyaz zırh.' },
  { id: 'hologramdj', name: 'Hologram DJ', cat: 'neon', r: 'r', gem: 35, desc: 'Dev kulaklık, holo ceket, vizör.' },
  { id: 'siberbaba', name: 'Siber Baba', cat: 'neon', r: 'l', gem: 200, desc: 'Yarı krom yüz, kırmızı göz, beyaz takım.' },
];
export const LOOK_MAP = Object.fromEntries(LOOKS.map((l) => [l.id, l]));
const LOOK_TINT_KEYS = ['0', '1', '2', 's'];
const HEX6 = /^#[0-9a-fA-F]{6}$/;
// Kostüm renkleri: sadece 0/1/2 (renk yuvası) ve s (ten) anahtarları, sadece #rrggbb (SVG'ye güvenle girer)
export function cleanLookTint(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  for (const k of LOOK_TINT_KEYS) if (typeof t[k] === 'string' && HEX6.test(t[k])) out[k] = t[k].toLowerCase();
  return Object.keys(out).length ? out : null;
}
