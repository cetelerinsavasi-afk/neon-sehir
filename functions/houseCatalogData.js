// =============================================================================
// houseCatalogData.js — 3D Ev fiyat listesi (TEK DOĞRULUK KAYNAĞI)
// =============================================================================
// Hem sunucu (functions/houses.js — satın alma burada doğrulanır) hem istemci
// (src/components/HouseScreen/houseCatalog.js — mağaza etiketleri) BU dosyayı
// kullanır. Fiyat değiştirmek için sadece burayı düzenle; iki taraf da güncel
// kalır. g = altın, z = zümrüt.
// =============================================================================

export const HOUSE_PRICE = 500_000; // altın (v70: 1.000.000 → 500.000)
// v68: ev sayısı sınırı kaldırıldı (eski istemciler için sabit duruyor, kullanılmıyor)
export const MAX_HOUSES_PER_PLAYER = Infinity;
export const MAX_ITEMS_PER_HOUSE = 400; // v92: parça zemin/duvar panelleri için 300 → 400

const g = (v) => ({ t: 'gold', v });
const z = (v) => ({ t: 'gem', v });

export const ITEM_PRICES = {
  // OTURMA
  sofa3: g(150000), sofa2: g(100000), armchair: g(50000), sofaL: g(250000), chester: z(5), wingchair: z(2),
  chairw: g(4000), gamer: z(3), stool: g(16000), beanbag: g(8000), ottoman: g(12000), chairm: g(12000),
  // MASALAR
  tround: g(8000), tdining: g(12000), tcoffee: g(24000), desk: g(45000), tside: g(15000),
  cafetable: g(30000), bartable: g(25000), officedesk: g(90000),
  // MUTFAK
  kcounter: g(9000), ksink: g(18000), stove: g(45000), fridge: z(5), kisland: z(1), kupper: g(12000), kcoffee: z(2),
  // BANYO
  toilet: g(5000), bsink: g(10000), shower: g(20000), bathtub: g(40000), jacuzzi: z(4),
  washer: g(45000), dryer: g(40000),
  // YATAK
  bed2: z(1), bed1: g(60000), wardrobe: g(40000), dresser: g(14000), nightst: g(7000),
  // ELEKTRONİK
  tvstand: g(60000), tvwall: g(70000), speaker: g(20000), pc: z(6), arcade: z(4), jukebox: z(2), dj: z(12),
  pcstation: z(4), console: z(2),
  // SİLAH
  gunrack: z(4), gunrackg: z(6), guncab: g(100000), safe: z(9), safeg: z(18), ammo: g(50000), guntable: z(2),
  // ARABA
  car_sedan: z(10), car_sport: z(15), car_suv: z(30), car_muscle: z(40), car_super: z(50), car_classic: z(20), car_pickup: z(25),
  // MOTOR
  moto_sport: z(3), moto_chopper: z(5), moto_scooter: g(50000), moto_cross: z(1),
  // GARAJ
  toolwall: g(32000), workbench: g(40000), toolchest: g(18000), tires: g(12000), barrel: g(24000), crate: g(6000),
  // DEKOR
  plantb: g(12000), plants: g(2000), palm: g(24000), rug: g(40000), rugr: g(20000), lamp: g(15000), painting: g(8000),
  bookshelf: g(32000), neon1: g(40000), neon2: g(50000), neon3: g(30000), neon4: g(20000), window: z(1), fanc: g(10000),
  // v92 — manzaralı pencereler
  win_yol: z(1), win_sehir: g(40000), win_deniz: g(40000), win_orman: g(40000), win_dag: g(40000), win_kuzey: z(1), win_bogaz: z(1), win_uzay: z(1),
  rugkilim: g(30000), rugshag: g(25000), rugrunner: g(15000), ruggeo: g(35000),
  painting2: g(12000), painting3: g(10000), triptych: z(1), cityframe: g(18000), graffiti: z(1), goldrecords: z(2),
  clock: g(12000), wallshelf: g(10000), curtain: g(20000), vase: g(9000), trash: g(3000), extinguisher: g(5000),
  planter: g(15000),
  // LÜKS
  chandelier: z(1), fireplace: g(150000), aquarium: z(5), statue: z(30), bar: z(1), money: z(10), goldbars: z(20),
  piano: z(12), atm: z(8),
  // SPOR & OYUN
  pool: z(10), bag: z(3), bench: z(1), treadmill: z(2), dart: g(10000),
  dumbbells: g(45000), bike: z(1), yogamat: g(6000), pullup: g(30000), foosball: z(2), pingpong: z(2), guitar: g(50000),
  // DÜKKAN & İŞLETME
  shelf: g(60000), checkout: g(80000), glasscounter: g(70000), drinkfridge: z(2), icecream: g(90000), fruitstand: g(25000),
  cafecounter: z(3), cakecase: z(2), menuboard: g(15000), clothesrack: g(35000), mannequin: g(20000), mirrorfull: g(18000),
  stagemic: z(6), discoball: z(3), filecab: g(20000), watercooler: g(15000),
  // DIŞ MEKAN
  fence: g(8000), parkbench: g(20000), streetlamp: g(30000), turf: g(25000),
  // v92 — DEKOR ATÖLYESİ
  // Müzik stüdyosu
  mixer: g(90000), studiospk: g(25000), vocalmic: g(15000), drums: z(3), amp: g(45000), synth: g(60000), booth: z(4), onair: g(12000),
  neon_acik: g(30000),
  // Hapishane
  bars: g(8000), celldoor: g(15000), bunk: g(30000), guarddesk: g(45000), canteen: g(35000), searchlight: g(40000), wire: g(6000), interrog: g(30000),
  // Helikopter
  helipad: g(150000), helicopter: z(40), windsock: g(12000), padlight: g(5000),
  // Havuz & bahçe
  poolout: z(15), lounger: g(20000), umbrella: g(12000), diveboard: g(30000), lifeguard: g(40000), mangal: g(35000), flamingo: g(10000),
  // Boks
  ring: z(10), speedbag: g(18000), cornerstool: g(6000), gong: g(25000), bleacher: g(60000),
  // Market
  cart: g(15000), simit: g(30000), beltcheckout: g(30000), // v94 bantlı market kasası
  // Benzinlik
  pump: g(50000), canopy: g(120000), airpump: g(20000), cone: g(3000), carwash: z(6), pricesign: g(25000),
  // Yayın seti
  cyc: g(50000), softbox: g(15000), ringlight: g(10000), streamcam: g(20000), streamdesk: z(3),
  // Mafya
  bosstable: z(4), crates: g(20000), bulb: g(4000),
  // Sinema
  cinescreen: z(5), cineseat: g(30000), popcorn: g(40000),
  // Çiftlik
  hay: g(5000), scarecrow: g(8000), vegbed: g(15000), tree: g(12000), tractor: z(12),
  // Kamp
  tent: g(25000), campfire: g(15000),
  // v92 Faz 8 — mekân mobilyaları (Mihrap ve Minber satılmaz: sadece oyunun Camii'sinde)
  seccade: g(8000), camiavize: z(2), rahle: g(6000), ayakkabilik: g(14000), cini: g(12000), minder: g(5000), bagiskutusu: g(8000),
  vezne: g(85000), numarator: g(25000), siraekran: g(20000), vaultdoor: z(6), stanchion: g(6000), waitseats: g(30000),
  slotm: z(3), rulet: z(6), kartmasa: g(90000), piyangogise: g(60000),
  polismasa: g(70000), bayrak: g(12000), aranan: g(8000),
  carplatform: g(120000), showroom: g(30000), hedef: g(10000), carlift: z(3),
  fiskiye: z(4), kaydirak: g(45000), salincak: g(40000), bufe: g(90000), copkutusu: g(4000), guvercin: g(6000),
  // YAPI
  wall2: g(10000), wall4: g(20000), walldoor: g(30000), glassdiv: g(50000), column: g(100000), podium: z(5), doordeco: g(20000), garagedoor: g(150000),
};

// Duvar & zemin kaplamaları bir kez alınır, oyuncunun TÜM evlerinde kullanılır.
export const FREE_SURFACES = { wall: ['boya_beyaz'], floor: ['parke_mese'] };
const SURFACE_DEFAULT = g(100000);
const SURFACE_SPECIAL = {
  wall: { tugla: z(5), tugla_beyaz: z(5), ahsap_panel: z(5) },
  floor: { mermer_siyah: z(5) },
};
export function surfacePrice(type, key) {
  if (FREE_SURFACES[type]?.includes(key)) return null;
  return SURFACE_SPECIAL[type]?.[key] || SURFACE_DEFAULT;
}
// v92 — yeni zeminler ve duvarlar PARÇA PARÇA satılır (eşya gibi): zemin
// parçası 1 m × 1 m, duvar paneli 1 m genişlik × tam yükseklik. Bahçe, otopark,
// manzaralı köşe gibi bölgeleri odanın bir kısmına döşemek için.
export const FLOOR_TILE_KEYS = ['otopark', 'asfalt', 'yol', 'cim', 'tarla', 'kum', 'kaldirim', 'cakil', 'kar', 'havuz_karo', 'spor_zemin', 'metal_izgara', 'dans_pisti', 'su'];
export const WALL_PANEL_KEYS = [
  'gokyuzu', 'gunbatimi', 'gece', 'deniz', 'neon_sehir', 'uzanan_yol', 'tarla_ufku', 'orman', 'daglar', 'col', 'uzay',
  'grafiti', 'beton_blok', 'kogus', 'sabika', 'akustik', 'yesil_perde',
];
const TILE_SPECIAL = { dans_pisti: 3000, su: 2500, havuz_karo: 2000, otopark: 2000, yol: 2000 };
const PANEL_MURAL = ['gokyuzu', 'gunbatimi', 'gece', 'deniz', 'neon_sehir', 'uzanan_yol', 'tarla_ufku', 'orman', 'daglar', 'col', 'uzay'];
FLOOR_TILE_KEYS.forEach((k) => {
  ITEM_PRICES[`zp_${k}`] = g(TILE_SPECIAL[k] || 1500);
});
WALL_PANEL_KEYS.forEach((k) => {
  ITEM_PRICES[`dp_${k}`] = g(PANEL_MURAL.includes(k) ? 4000 : 3000);
});

export const SURFACE_KEYS = {
  wall: [
    'boya_beyaz', 'boya_krem', 'boya_gri', 'boya_antrasit', 'boya_lacivert', 'boya_bordo', 'boya_zeytin', 'boya_mor', 'boya_siyah',
    'boya_yesil', 'boya_mavi', 'boya_pembe', 'boya_turuncu', 'boya_sari', 'boya_turkuaz',
    'tugla', 'tugla_beyaz', 'beton_duvar', 'ahsap_panel', 'duvar_kagidi', 'damask', 'mermer_duvar', 'neon_panel',
  ],
  floor: [
    'parke_mese', 'parke_ceviz', 'parke_beyaz', 'mermer_beyaz', 'mermer_siyah', 'mermer_altin', 'beton', 'dama',
    'hali_gri', 'hali_bordo', 'epoksi', 'epoksi_siyah', 'karo_mavi', 'neon_grid',
    'zemin_siyah', 'zemin_beyaz', 'zemin_yesil', 'zemin_mavi', 'zemin_mor', 'zemin_kirmizi', 'zemin_gri',
  ],
};

// Eşyadan alınabilen yiyecek/içecek/silah (eldeki ürün, 2 dk, ısmarlanabilir).
// Sadece SATIN ALINMIŞ (deneme olmayan) eşyalardan alınır; ücretsizdir.
export const HOUSE_PRODUCTS = {
  kola: { label: 'Kola', emoji: '🥤' },
  ayran: { label: 'Ayran', emoji: '🥛' },
  meyveSuyu: { label: 'Meyve Suyu', emoji: '🧃' },
  enerji: { label: 'Enerji İçeceği', emoji: '🥫' },
  su: { label: 'Su', emoji: '🚰' },
  kahve: { label: 'Kahve', emoji: '☕' },
  latte: { label: 'Latte', emoji: '☕' },
  espresso: { label: 'Espresso', emoji: '☕' },
  cay: { label: 'Çay', emoji: '🍵' },
  pasta: { label: 'Pasta', emoji: '🍰' },
  kurabiye: { label: 'Kurabiye', emoji: '🍪' },
  meyve: { label: 'Meyve', emoji: '🍎' },
  pizza: { label: 'Pizza', emoji: '🍕' },
  kebap: { label: 'Kebap', emoji: '🥙' },
  kokteyl: { label: 'Kokteyl', emoji: '🍹' },
  viski: { label: 'Viski', emoji: '🥃' },
  dondurma: { label: 'Dondurma', emoji: '🍦' },
  // v92 — market rafı, simit arabası, mısır makinesi
  cikolata: { label: 'Çikolata', emoji: '🍫' },
  cips: { label: 'Cips', emoji: '🥔' },
  biskuvi: { label: 'Bisküvi', emoji: '🍘' },
  makarna: { label: 'Makarna', emoji: '🍝' },
  simit: { label: 'Simit', emoji: '🥯' },
  misir: { label: 'Patlamış Mısır', emoji: '🍿' },
  tabanca: { label: 'Tabanca', emoji: '🔫' },
  tufek: { label: 'Tüfek', emoji: '🔫' },
  pompali: { label: 'Pompalı', emoji: '🔫' },
  altinTabanca: { label: 'Altın Tabanca', emoji: '🔫' },
};

export const HOUSE_TAKEABLES = {
  fridge: ['kola', 'ayran', 'meyveSuyu'],
  drinkfridge: ['kola', 'enerji', 'su', 'meyveSuyu'],
  kcoffee: ['kahve', 'latte'],
  cafecounter: ['kahve', 'latte', 'espresso'],
  cakecase: ['pasta', 'kurabiye'],
  tdining: ['meyve', 'pizza'],
  tround: ['meyve'],
  cafetable: ['cay', 'kahve'],
  bar: ['kokteyl', 'viski'],
  icecream: ['dondurma'],
  fruitstand: ['meyve'],
  watercooler: ['su'],
  stove: ['kebap', 'pizza'],
  guncab: ['tabanca', 'tufek', 'pompali'],
  // v92
  shelf: ['cikolata', 'cips', 'biskuvi', 'makarna', 'kola'],
  simit: ['simit'],
  popcorn: ['misir'],
  mangal: ['kebap'],
  vegbed: ['meyve'],
  gunrack: ['tabanca', 'tufek', 'pompali'],
  gunrackg: ['altinTabanca'],
};

export function priceOf(k) {
  return ITEM_PRICES[k] || null;
}
