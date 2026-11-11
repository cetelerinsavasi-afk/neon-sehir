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
// v147.3: şehrin çevresinde bir sokak daha (dış halka)
// v147.5: sınır = en dış binaların cephesi (dış kaldırım da sürülebilir; görünmez duvar yok)
export const BOUNDS = { x0: -167.6, x1: 167.6, z0: -147.6, z1: COAST_Z + 19 };

// [tür, i0, j0, i1, j1, yön]
export const LOTS = [
  ['karakol', 1, 0], ['banka', 2, 0], ['spor', 4, 0], ['belediye', 5, 0],
  ['camii', 0, 1], ['galeri', 1, 1], ['fabrika', 2, 1], ['netkafe', 3, 1], ['bar', 4, 1], ['cafe', 5, 1],
  ['silah', 0, 2], ['modifiye', 1, 2], ['park', 2, 2, 3, 2], ['stadyum', 4, 2, 5, 3],
  ['casino', 0, 3, 0, 3, 'e'], ['pist', 1, 3, 2, 3], ['ev', 3, 3],
  ['liman', 0, 4, 1, 4],
  // v151 — meslek yapıları: dış bölgede limandan ve birbirinden uzak 2 lojistik deposu (v152: limanın ters tarafında),
  // hastane (ambulans), benzinlik (functions/cityJobsData.js koordinatlarıyla aynı)
  ['depo_kuzey', 2, -1, 2, -1, 's'],
  ['depo_dogu', 6, -1, 6, -1, 's'],
  ['hastane', 6, 1, 6, 1, 'w'],
  ['benzinlik', 3, 0],
  // v154 — taksi durağı (şehrin dışı: doğu dış halka, stadyumun karşısı)
  ['taksi_duragi', 6, 3, 6, 3, 'w'],
];

// lot merkezleri (dünya) — harita eşlemesi için
export const LAYOUT_LOTS = LOTS.map(([type, i0, j0, i1 = i0, j1 = j0]) => ({
  type,
  x0: cx(i0) - BLOCK / 2,
  x1: cx(i1) + BLOCK / 2,
  z0: cz(j0) - BLOCK / 2,
  z1: cz(j1) + BLOCK / 2,
}));
