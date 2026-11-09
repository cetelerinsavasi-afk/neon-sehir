// =============================================================================
// v151 — ŞEHİR MESLEK NOKTALARI (sunucu + istemci ORTAK, saf JS, three.js yok)
// Dünya koordinatları (src/components/City/cityLayout.js ızgarası): bloklar 40 m
// aralıkla; yollar x = -160…160, z = -140…100 çizgilerinde. Trafik sağdan akar.
//   • Liman yükleme alanı (rıhtım) → 2 lojistik deposu (şehrin dış bölgesi,
//     limandan ve birbirinden uzak)
//   • 10 otobüs durağı: iç halka yolu boyunca saat yönünde (duraklar şehir tarafında)
//   • Hastane (acil girişi) · Benzinlik
//   • Yol kenarı noktaları (taksi yolcusu, 112 vakası, polis ihbarı / devriye)
// Sunucu iş başlarken buradan nokta seçer ve süre sınırlarını mesafeye göre hesaplar.
// =============================================================================

export const LIMAN_BAY = { key: 'liman', name: 'Liman Yükleme Alanı', x: -80, z: 112, r: 7 };
export const DEPOTS = [
  { key: 'kuzey', name: 'Kuzey Lojistik Deposu', x: -140, z: -113, r: 7.5 },
  { key: 'dogu', name: 'Doğu Lojistik Deposu', x: 133, z: 80, r: 7.5 },
];
export const HOSPITAL = { key: 'hastane', name: 'Hastane — Acil Girişi', x: 131, z: -40, r: 7 };
export const GAS_STATION = { key: 'benzinlik', name: 'Benzinlik', x: 20, z: -80 };

// Otobüs durakları — sıra = güzergâh (saat yönü: üst yol doğuya, sağ yol güneye,
// sahil yolu batıya, sol yol kuzeye). x,z: otobüsün duracağı şerit; sx,sz: durak
// (kaldırım); fx,fz: şeritten kaldırıma birim yön.
const S = (n, name, x, z, fx, fz) => ({ n, key: `durak${n}`, name, x, z, fx, fz, sx: x + fx * 3.6, sz: z + fz * 3.6, r: 7.5 });
export const BUS_STOPS = [
  S(1, 'Karakol', -60, -98, 0, 1),
  S(2, 'Banka', 0, -98, 0, 1),
  S(3, 'Spor Salonu', 64, -98, 0, 1),
  S(4, 'Belediye', 118, -50, -1, 0),
  S(5, 'Stadyum', 118, 26, -1, 0),
  S(6, 'Evler', 30, 98, 0, -1),
  S(7, 'Plaza', -24, 98, 0, -1),
  S(8, 'Liman', -86, 98, 0, -1),
  S(9, 'Casino', -118, 44, 1, 0),
  S(10, 'Camii', -118, -38, 1, 0),
];

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
// halka güzergâhının uzunluğu (durak i'den başlayıp 10 durağın hepsi)
export function busRouteLen(start = 0) {
  let L = 0;
  for (let k = 1; k < BUS_STOPS.length; k++) L += manhattan(BUS_STOPS[(start + k - 1) % BUS_STOPS.length], BUS_STOPS[(start + k) % BUS_STOPS.length]);
  return L;
}

// --- yol kenarı noktaları ---------------------------------------------------------------
const XS = [-120, -80, -40, 0, 40, 80, 120];
const ZS = [-100, -60, -20, 20, 60, 100];
// birleşik büyük lotlar (yolun üstünü kaplar): park, stadyum, pist, liman
const BIG = [
  [-36, 36, -16, 16],
  [44, 116, -16, 56],
  [-76, -4, 24, 56],
  [-116, -44, 64, 96],
];
const covered = (x, z) => BIG.some(([x0, x1, z0, z1]) => x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1);
// yakındaki yer adı (lot merkezleri)
const PLACES = [
  ['Karakol', -60, -80], ['Banka', -20, -80], ['Benzinlik', 20, -80], ['Spor Salonu', 60, -80], ['Belediye', 100, -80],
  ['Camii', -100, -40], ['Galeri', -60, -40], ['Fabrika', -20, -40], ['İnternet Kafe', 20, -40], ['Bar', 60, -40], ['Cafe', 100, -40],
  ['Silahçı', -100, 0], ['Modifiyeci', -60, 0], ['Park', 0, 0], ['Stadyum', 80, 20],
  ['Casino', -100, 40], ['Yarış Pisti', -40, 40], ['Evler', 20, 40],
  ['Liman', -80, 80], ['Plaza', -20, 80], ['Sahil', 60, 80],
];
const placeName = (x, z) => {
  let best = PLACES[0];
  let bd = Infinity;
  PLACES.forEach((p) => {
    const d = (p[1] - x) ** 2 + (p[2] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  });
  return best[0];
};
function buildSpots() {
  const out = [];
  const add = (x, z, fx, fz) => {
    if (covered(x + fx * 4, z + fz * 4)) return;
    out.push({ i: out.length, x, z, fx, fz, sx: x + fx * 3.6, sz: z + fz * 3.6, name: `${placeName(x + fx * 14, z + fz * 14)} önü`, r: 7 });
  };
  // yatay yollar (z sabit): iki kenar
  ZS.forEach((z) => {
    for (let k = 0; k < XS.length - 1; k++) {
      const x = (XS[k] + XS[k + 1]) / 2;
      if (covered(x, z)) continue;
      add(x + 6, z + 2, 0, 1); // doğuya giden şerit → güney kaldırımı
      if (z !== 100) add(x - 6, z - 2, 0, -1); // batıya giden şerit → kuzey kaldırımı
    }
  });
  XS.forEach((x) => {
    for (let k = 0; k < ZS.length - 1; k++) {
      const z = (ZS[k] + ZS[k + 1]) / 2;
      if (covered(x, z)) continue;
      add(x - 2, z + 6, -1, 0); // güneye giden → batı kaldırımı
      add(x + 2, z - 6, 1, 0); // kuzeye giden → doğu kaldırımı
    }
  });
  return out;
}
export const ROAD_SPOTS = buildSpots();

// basit, tekrarlanabilir rastgele (sunucu Math.random kullanır; istemci göstermek için)
export function pickSpot(rand, { near = null, min = 0, max = Infinity, not = [] } = {}) {
  const pool = ROAD_SPOTS.filter((s) => !not.includes(s.i) && (!near || (manhattan(s, near) >= min && manhattan(s, near) <= max)));
  const list = pool.length ? pool : ROAD_SPOTS;
  return list[Math.floor(rand() * list.length) % list.length];
}
