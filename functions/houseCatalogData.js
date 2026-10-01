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
export const MAX_ITEMS_PER_HOUSE = 300;

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
  // YAPI
  wall2: g(10000), wall4: g(20000), walldoor: g(30000), glassdiv: g(50000), column: g(100000), podium: z(5), doordeco: g(20000),
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
  su: { label: 'Su', emoji: '💧' },
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
  gunrack: ['tabanca', 'tufek', 'pompali'],
  gunrackg: ['altinTabanca'],
};

export function priceOf(k) {
  return ITEM_PRICES[k] || null;
}
