// =============================================================================
// v147.3 — Şehir planının sabitleri (three.js yok; plan + ana sayfa haritası paylaşır)
// =============================================================================
export const P = 40; // blok aralığı
export const BLOCK = 32; // asfaltın arasındaki blok (kaldırım dahil)
export const SIDE = 3; // kaldırım genişliği
export const COLS = 6;
export const ROWS = 5;
export const cx = (i) => -100 + P * i;
export const cz = (j) => -80 + P * j;
export const COAST_Z = 104; // sahil yolu bitişi → rıhtım/deniz
// v155: şehrin BATISI deniz — sol dış halka (i < 0) kalktı. x = −120 caddesi sahil bulvarı;
// batısında kordon (−130…−124), sonra kumsal ve deniz (coast.js).
export const COAST_X = cx(0) - P / 2 - (P - BLOCK) / 2; // −124: sahil bulvarının batı kenarı
export const KORDON_X = COAST_X - 6; // −130: kordonun deniz kenarı (araçlar buraya kadar)
// v155: en dış halkanın arkasında servis yolu (dış binaların arasındaki sokaklara araç girer)
export const OUTER = { x1: cx(COLS + 1) + BLOCK / 2 + (P - BLOCK), z0: cz(-2) - BLOCK / 2 - (P - BLOCK) }; // x 204, z −184
// v147.3: şehrin çevresinde bir sokak daha (dış halka)
// v155: sınır = dış servis yolunun kenarı (doğu/kuzey), kordon (batı), rıhtım (güney)
// v155: kuzeydeki orman parkına yaya kapıları (dış servis yolunun kuzey kenarında, x)
export const PARK_GATES = [-60, 20, 100, 180];
// v155: doğu kenarında çakıllı yola açılan geçit (z) — şehrin güneydoğusundaki hurdalık / çete bölgesi
export const EAST_GATE_Z = 60;
export const BOUNDS = { x0: KORDON_X + 1.4, x1: OUTER.x1 - 0.6, z0: OUTER.z0 + 0.6, z1: COAST_Z + 19 };

// [tür, i0, j0, i1, j1, yön]
export const LOTS = [
  ['karakol', 1, 0], ['banka', 2, 0], ['spor', 4, 0], ['belediye', 5, 0],
  ['camii', 0, 1], ['galeri', 1, 1], ['fabrika', 2, 1], ['netkafe', 3, 1], ['bar', 4, 1], ['cafe', 5, 1],
  ['silah', 0, 2], ['modifiye', 1, 2], ['park', 2, 2, 3, 2], ['stadyum', 4, 2, 5, 3],
  ['casino', 0, 3, 0, 3, 'e'], ['pist', 1, 3, 2, 3], ['ev', 3, 3],
  ['liman', 0, 4, 1, 4],
  // v151 — meslek yapıları: hastane (ambulans), benzinlik (functions/cityJobsData.js koordinatlarıyla aynı)
  // v157: limana yakın kuzey deposu kaldırıldı; doğu deposu (şehir içi teslim) kaldı.
  // Uzak teslim: Kervankent Lojistik Terminali (O-77 otoyolunun sonu)
  ['depo_dogu', 6, -1, 6, -1, 's'],
  ['hastane', 6, 1, 6, 1, 'w'],
  ['benzinlik', 3, 0],
  // v154 — taksi durağı (şehrin dışı: doğu dış halka, stadyumun karşısı)
  ['taksi_duragi', 6, 3, 6, 3, 'w'],
  // v157.4 — evin karşısı: müstakil evler mahallesi (eski eczane/optik/pide blokları) + ofis binası
  ['mustakil', 3, 4],
  ['ofis', 4, 4],
  // v156 — şehirlerarası OTOGAR (dış halka, otoyol ağzının yanı; iki parsel, batıya bakar)
  ['otogar', 7, -1, 7, 0, 'w'],
];

// lot merkezleri (dünya) — harita eşlemesi için
export const LAYOUT_LOTS = LOTS.map(([type, i0, j0, i1 = i0, j1 = j0]) => ({
  type,
  x0: cx(i0) - BLOCK / 2,
  x1: cx(i1) + BLOCK / 2,
  z0: cz(j0) - BLOCK / 2,
  z1: cz(j1) + BLOCK / 2,
}));
