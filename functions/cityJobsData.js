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
// v152: limanın (sol alt) TERS tarafında. v157: limana yakın olan kuzey deposu kaldırıldı — şehir içi
// teslim doğu deposuna, uzak teslim Kervankent'e (FAR_DEPOT)
export const DEPOTS = [{ key: 'dogu', name: 'Doğu Lojistik Deposu', x: 140, z: -113, r: 7.5 }];
// v157 — UZAK MESAFE (O-77 otoyolu → Kervankent). Konumlar şehir motorundaki kurulumla aynı
// (src/components/City/world/town.js · venues.js otogarYard); değişirse burası da güncellenir.
export const FAR_DEPOT = { key: 'kervankent', name: 'Kervankent Lojistik Terminali', x: 2271.6, z: -2293.6, r: 7.5 };
export const OTOGARS = [
  { key: 'neon', name: 'Neon Şehir Otogarı', x: 180, z: -86.6, r: 6 },
  { key: 'kervankent', name: 'Kervankent Otogarı', x: 2147.3, z: -2316.2, r: 6 },
];
export const HWY_ENTRY = { x: 160, z: -140 }; // şehirden otoyola çıkılan kavşak
export const HWY_LEN = 3583; // O-77 otoyolunun uzunluğu (m)
export const FAR_TIR_LEN = 4160; // liman → otoyol → Kervankent terminali (yaklaşık yol)
export const FAR_BUS_LEN = 3740; // Neon Şehir Otogarı → Kervankent Otogarı
export const HOSPITAL = { key: 'hastane', name: 'Hastane — Acil Girişi', x: 131, z: -40, r: 7 };
export const GAS_STATION = { key: 'benzinlik', name: 'Benzinlik', x: 20, z: -80 };

// Otobüs durakları (v153) — şehrin İÇİNE girip DIŞINA çıkan tek hat (saat yönü). Sıra = sefer:
// Kuzey Kapısı (dış) → Karakol (iç) → Bar (iç) → Hastane (dış doğu) → Stadyum (iç) → Evler (iç)
// → Plaza (sahil) → Liman (sahil) → Batı Kapısı (dış batı) → Camii (iç) → başa.
// Duraklar blok ortalarında (kavşakta değil), aralarında ~80-160 m; gidiş yönünde sağ şerit,
// durak kaldırımı adını aldığı binanın önünde.
// x,z: otobüsün duracağı şerit; sx,sz: durak (kaldırım); fx,fz: şeritten kaldırıma birim yön.
const S = (n, name, x, z, fx, fz) => ({ n, key: `durak${n}`, name, x, z, fx, fz, sx: x + fx * 3.6, sz: z + fz * 3.6, r: 7.5 });
export const BUS_STOPS = [
  S(1, 'Kuzey Kapısı', -60, -138, 0, 1), // üst dış yol, doğuya
  S(2, 'Karakol', -42, -80, -1, 0), // x = -40, güneye
  S(3, 'Bar', 60, -58, 0, 1), // z = -60, doğuya
  S(4, 'Hastane', 158, -40, -1, 0), // doğu dış yol, güneye
  S(5, 'Stadyum', 100, 58, 0, -1), // z = 60, batıya (stadyumun güneyi)
  S(6, 'Evler', 13, 58, 0, -1), // z = 60, batıya (v157: ev + garaj kapısının solunda)
  S(7, 'Plaza', -20, 98, 0, -1), // sahil yolu, batıya
  S(8, 'Liman', -100, 98, 0, -1), // sahil yolu, batıya
  S(9, 'Sahil Bulvarı', -118, 0, 1, 0), // v157: batı artık deniz — sahil bulvarı, kuzeye
  S(10, 'Camii', -100, -58, 0, 1), // z = -60, doğuya
];

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
// halka güzergâhının uzunluğu (durak i'den başlayıp 10 durağın hepsi)
export function busRouteLen(start = 0) {
  let L = 0;
  for (let k = 1; k < BUS_STOPS.length; k++) L += manhattan(BUS_STOPS[(start + k - 1) % BUS_STOPS.length], BUS_STOPS[(start + k) % BUS_STOPS.length]);
  return L;
}

// --- yol kenarı noktaları ---------------------------------------------------------------
// v157: şehrin batısı deniz (x = −120 sahil bulvarı en batı cadde) — eski −160 dış halkası yok
const XS = [-120, -80, -40, 0, 40, 80, 120, 160];
const ZS = [-140, -100, -60, -20, 20, 60, 100];
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
    // dış halkada sadece şehir tarafı kaldırım (en dıştaki duvar bloklarına yolcu koyma)
    const sx = x + fx * 3.6;
    const sz = z + fz * 3.6;
    if (sx < -157 || sx > 157 || sz < -137) return;
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

// --- v154 MOTOKURYE ------------------------------------------------------------------------
// Sipariş 6 seyyar satıcıdan birinden alınır, şehirdeki bir mekânın önüne götürülür.
// Satıcı yerleri şehir planıyla AYNI kaynak (src/components/City/cityPlan.js bunu kullanır).
// lot: [i0, j0, i1, j1, yön] (cityLayout.js LOTS ile aynı — tests/city/kurye.test.mjs denetler)
const P_ = 40;
const BLOCK_ = 32;
const cxw = (i) => -100 + P_ * i;
const czw = (j) => -80 + P_ * j;
const FACE_ = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };
export const KURYE_LOTS = {
  camii: [0, 1, 0, 1, 's', 'Camii'], banka: [2, 0, 2, 0, 's', 'Banka'], karakol: [1, 0, 1, 0, 's', 'Karakol'], belediye: [5, 0, 5, 0, 's', 'Belediye'],
  galeri: [1, 1, 1, 1, 's', 'Araba Galerisi'], silah: [0, 2, 0, 2, 's', 'Silah Mağazası'], modifiye: [1, 2, 1, 2, 's', 'Modifiye Garajı'],
  casino: [0, 3, 0, 3, 'e', 'Casino'], spor: [4, 0, 4, 0, 's', 'Spor Salonu'], fabrika: [2, 1, 2, 1, 's', 'Fabrika'], netkafe: [3, 1, 3, 1, 's', 'İnternet Kafe'],
  bar: [4, 1, 4, 1, 's', 'Bar'], cafe: [5, 1, 5, 1, 's', 'Cafe'], ev: [3, 3, 3, 3, 's', 'Evler'], stadyum: [4, 2, 5, 3, 's', 'Stadyum'],
  park: [2, 2, 3, 2, 's', 'Park'], pist: [1, 3, 2, 3, 's', 'Yarış Pisti'], liman: [0, 4, 1, 4, 's', 'Liman'], hastane: [6, 1, 6, 1, 'w', 'Hastane'],
  benzinlik: [3, 0, 3, 0, 's', 'Benzinlik'], taksi_duragi: [6, 3, 6, 3, 'w', 'Taksi Durağı'], plaza: [2, 4, 2, 4, 's', 'Plaza'],
};
// lot yerel (x, z) → dünya
function lotWorld(lot, x, z) {
  const [i0, j0, i1, j1, face] = lot;
  const mx = (cxw(i0) + cxw(i1)) / 2;
  const mz = (czw(j0) + czw(j1)) / 2;
  const a = FACE_[face] || 0;
  return { x: mx + x * Math.cos(a) + z * Math.sin(a), z: mz - x * Math.sin(a) + z * Math.cos(a) };
}
// lotun önündeki yol (kaldırımın hemen dışı, sağ şerit)
function lotFront(lot) {
  const [i0, j0, i1, j1, face] = lot;
  const rot = face === 'e' || face === 'w';
  const bw = cxw(i1) - cxw(i0) + BLOCK_;
  const bd = czw(j1) - czw(j0) + BLOCK_;
  return lotWorld(lot, 0, (rot ? bw : bd) / 2 + 1.6);
}
// seyyar satıcılar (lot yerel; r = π/4 adımlı dönüş) — şehirdeki tezgâhların yeri
export const VENDOR_SPOTS = [
  { key: 'kokorecci', name: 'Kokoreççi', food: 'kokoreç', lot: 'casino', x: -8.5, z: 8.5, r: 0 },
  { key: 'donerci', name: 'Balık Ekmekçi', food: 'balık ekmek', lot: 'park', x: -26, z: 6.5, r: 0 },
  { key: 'kofteci', name: 'Köfteci', food: 'köfte ekmek', lot: 'ev', x: -12.2, z: 14.3, r: 0 }, // v157: ev + garaj kapısını kapatmasın
  { key: 'simitci', name: 'Simitçi', food: 'simit', lot: 'plaza', x: 0, z: 6.5, r: 0 },
  { key: 'midyeci', name: 'Midyeci', food: 'midye', lot: 'bar', x: 13, z: 12, r: 0 },
  { key: 'dondurmaci', name: 'Dondurmacı', food: 'dondurma', lot: 'stadyum', x: 28, z: -28, r: 1 },
];
// alma noktası: tezgâhın dünya konumu (motor kaldırıma çıkabilir; yarıçap geniş)
export const KURYE_PICKUPS = VENDOR_SPOTS.map((v, i) => ({ i, key: v.key, name: v.name, food: v.food, ...lotWorld(KURYE_LOTS[v.lot], v.x, v.z), r: 8 }));
// teslim noktaları: tüm mekânların önü
const DROP_KEYS = ['camii', 'banka', 'karakol', 'belediye', 'galeri', 'silah', 'modifiye', 'casino', 'spor', 'fabrika', 'netkafe', 'bar', 'cafe', 'ev', 'stadyum', 'park', 'pist', 'liman', 'hastane', 'benzinlik', 'taksi_duragi'];
export const KURYE_DROPS = DROP_KEYS.map((k, i) => ({ i, key: k, name: KURYE_LOTS[k][5], ...lotFront(KURYE_LOTS[k]), r: 8 }));
// ortalama teslim mesafesi (ücret çarpanı ≈ 1 olsun diye)
export const KURYE_MIN_LEN = 70;
export const KURYE_REF_LEN = (() => {
  let s = 0;
  let n = 0;
  KURYE_PICKUPS.forEach((a) =>
    KURYE_DROPS.forEach((b) => {
      const d = manhattan(a, b);
      if (d >= KURYE_MIN_LEN) {
        s += d;
        n += 1;
      }
    })
  );
  return n ? s / n : 200;
})();
// mesafeye göre ücret çarpanı (kısa ×0,6 … uzun ×1,6)
export const kuryeMul = (len) => Math.round(Math.min(1.6, Math.max(0.6, len / KURYE_REF_LEN)) * 100) / 100;
