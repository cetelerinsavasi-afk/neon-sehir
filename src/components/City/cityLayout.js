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
// v177: seyyar bisikletçi — x = 100 kapısının hemen içinde, yolun doğusunda (satış + kiralama).
// Yaya r metre yaklaşınca "🚲 Bisikletçi" düğmesi çıkar.
export const BIKE_SHOP = { x: 105.4, z: -191.5, r: 3.4 };
// v155: doğu kenarında çakıllı yola açılan geçit (z) — şehrin güneydoğusundaki hurdalık / çete bölgesi
export const EAST_GATE_Z = 60;
export const BOUNDS = { x0: KORDON_X + 1.4, x1: OUTER.x1 - 0.6, z0: OUTER.z0 + 0.6, z1: COAST_Z + 19 };

// [tür, i0, j0, i1, j1, yön, ek]  — ek: { ex0, ex1 } lotu batı/doğu yoluna doğru uzatır (m)
// v219 — YENİ HARİTA: mekânlar yeniden yerleşti. Kuzeyde banka · casino · cafe · hastane · inşaat alanı,
// ortada stadyum, doğuda sanayi sitesi (motor galerisi · modifiye · fabrika · araba galerisi · oto tamirci ·
// konteyner sahası), güneyde park + liman (tır yükleme), batıda bar · restoran · aktivite parkı.
// Yarış pisti şehrin dışına (Neon Petrol'ün ötesi) taşındı; Doğu Lojistik Deposu kalktı (tır → Elmas Madeni).
export const LOTS = [
  ['benzinlik', 7, -2],
  ['cafe', 0, -1, 0, -1, 'w'], ['casino', 1, -1, 1, -1, 'e'], ['banka', 2, -1, 2, -1, 'w'], ['bos', 3, -1, 4, -1], ['hastane', 5, -1, 5, -1, 'w'],
  ['otogar', 7, -1, 7, 0, 'e'],
  ['bar', 0, 0, 0, 0, 'w'], ['taksi_duragi', 1, 0, 1, 0, 'e'], ['belediye', 2, 0, 2, 0, 'w'], ['stadyum', 3, 0, 4, 1],
  ['karakol', 2, 1, 2, 1, 'w'],
  ['motor', 5, 1, 5, 1, 's', { ex1: 4 }], ['modifiye', 6, 1, 6, 1, 's', { ex0: 4, ex1: 4 }], ['fabrika', 7, 1, 7, 1, 's', { ex0: 4 }],
  ['spor', 3, 2, 3, 2, 'e'], ['netkafe', 4, 2, 4, 2, 'w'],
  ['galeri', 5, 2, 5, 2, 'n', { ex1: 4 }], ['tamir', 6, 2, 6, 2, 'n', { ex0: 4, ex1: 4 }], ['konteyner', 7, 2, 7, 2, 'n', { ex0: 4 }],
  ['camii', 1, 3, 1, 3, 'e'], ['ev', 3, 3], ['mustakil', 2, 3], ['mustakil', 2, 4], ['mustakil', 4, 3], ['silah', 7, 3],
  ['park', 3, 4, 4, 4], ['liman', 6, 4, 7, 4],
];
// v219: dolgu hücrelerinin yerine geçen mekânlar (dolgu sırası korunur → kaldırım lambaları / ağaçlar aynı yerde)
export const CELL_LOTS = {
  '0,1': { type: 'restoran', face: 'w' }, // La Marea Restoran (lüks)
  '1,1': { type: 'otopark2', face: 's' }, // açık otopark
  // dükkânlar sokağı (z = 60): karşılıklı 3 + 3 dükkân. Liste kulenin kendi ekseninde soldan sağa —
  // 5,4 caddeye kuzeyden baktığı için listesi dünyada sağdan sola: petshop ile özel aksesuarcı karşı karşıya (doğu ucu)
  '5,3': { shops: ['berber', 'giyim', 'petshop'] }, // berber + giyim + petshop
  '5,4': { face: 'n', shops: ['ozel', 'kostum', 'aksesuar'] }, // aksesuarcı (özel) + kostümcü + takı & şapka
};
// v219: dolgulardan SONRA eklenen birleşik lotlar (bu hücrelerde dolgu yok)
export const EXTRA_LOTS = [['aktivite', 0, 4, 1, 4]]; // aktivite parkı: halı saha, basket sahası, kaykay rampaları
// v219: sıradan blokların bina tohumu + yükseklik çarpanı (eski görünümler korunsun diye sabit)
export const FILLER_SEEDS = {
  '0,-2': [780, 1.7], '0,1': [850, 1], '0,2': [894, 1], '0,3': [938, 1], '0,4': [982, 1], '1,-2': [942, 1.7], '1,1': [1012, 1], '1,2': [1056, 1], '1,4': [1113, 1],
  '2,-2': [1073, 1.7], '2,2': [1156, 1], '2,3': [1200, 1], '2,4': [1244, 1], '3,-2': [1204, 1.7], '4,-2': [1242, 1.7], '5,-2': [1280, 1.7], '6,-1': [1324, 1.25],
  '5,0': [1368, 1], '5,3': [1438, 1], '5,4': [1482, 1], '6,-2': [1442, 1.7], '6,0': [1499, 1.25], '6,3': [1569, 1.25],
};
// v219: dar sokaklar (x) — iki yanındaki bloklar yola 4 m uzar (sanayi + batı ara sokağı)
export const ALLEY_X = [cx(1) - P / 2, cx(7) - P / 2];
export const ALLEY_EXT = (P - BLOCK) / 2;
export const alleyExt = (x) => (ALLEY_X.includes(x) ? ALLEY_EXT : 0);
// v219: sanayi sitesinin iç caddesi (z) — motor galerisi / modifiye / fabrika ile galeri / tamirci / konteyner arası
export const SANAYI = { x0: cx(5) - BLOCK / 2, x1: cx(7) + BLOCK / 2, z: cz(1) + P / 2, gaps: [cx(5) + P / 2, cx(6) + P / 2] };

// lot merkezleri (dünya) — harita eşlemesi için
export const LAYOUT_LOTS = [...LOTS, ...EXTRA_LOTS, ...Object.entries(CELL_LOTS).filter(([, v]) => v.type).map(([k, v]) => [v.type, ...k.split(',').map(Number), ...k.split(',').map(Number), v.face])].map(([type, i0, j0, i1 = i0, j1 = j0, , ext = {}]) => ({
  type,
  x0: cx(i0) - BLOCK / 2 - Math.max(ext.ex0 || 0, alleyExt(cx(i0) - P / 2)),
  x1: cx(i1) + BLOCK / 2 + Math.max(ext.ex1 || 0, alleyExt(cx(i1) + P / 2)),
  z0: cz(j0) - BLOCK / 2,
  z1: cz(j1) + BLOCK / 2,
}));
