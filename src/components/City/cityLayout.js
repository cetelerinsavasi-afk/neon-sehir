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
// v147.3: şehrin çevresinde bir sokak daha (dış halka) — sınır artık en dıştaki yolun kenarı
export const BOUNDS = { x0: -163.5, x1: 163.5, z0: -143.5, z1: COAST_Z + 19 };

// [tür, i0, j0, i1, j1, yön]
export const LOTS = [
  ['karakol', 1, 0], ['banka', 2, 0], ['spor', 4, 0], ['belediye', 5, 0],
  ['camii', 0, 1], ['galeri', 1, 1], ['fabrika', 2, 1], ['netkafe', 3, 1], ['bar', 4, 1], ['cafe', 5, 1],
  ['silah', 0, 2], ['modifiye', 1, 2], ['park', 2, 2, 3, 2], ['stadyum', 4, 2, 5, 3],
  ['casino', 0, 3, 0, 3, 'e'], ['pist', 1, 3, 2, 3], ['ev', 3, 3],
  ['liman', 0, 4, 1, 4],
];

// lot merkezleri (dünya) — harita eşlemesi için
export const LAYOUT_LOTS = LOTS.map(([type, i0, j0, i1 = i0, j1 = j0]) => ({
  type,
  x0: cx(i0) - BLOCK / 2,
  x1: cx(i1) + BLOCK / 2,
  z0: cz(j0) - BLOCK / 2,
  z1: cz(j1) + BLOCK / 2,
}));
