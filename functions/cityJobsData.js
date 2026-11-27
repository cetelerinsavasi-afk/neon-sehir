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

// v219: liman şehrin güneydoğusuna taşındı (yeni harita)
export const LIMAN_BAY = { key: 'liman', name: 'Liman Yükleme Alanı', x: 160, z: 112, r: 7 };
// v152: limanın (sol alt) TERS tarafında. v157: limana yakın olan kuzey deposu kaldırıldı — şehir içi
// teslim doğu deposuna, uzak teslim Kervankent'e (FAR_DEPOT)
// v219: şehir içindeki Doğu Lojistik Deposu kaldırıldı — yakın mesafe teslim Neon Elmas Madeni'ne (şehrin kuzeyi)
export const DEPOTS = [{ key: 'maden', name: 'Neon Elmas Madeni — Mal Teslim', x: 228.7, z: -660.7, r: 7.5 }];
// v157 — UZAK MESAFE (O-77 otoyolu → Kervankent). Konumlar şehir motorundaki kurulumla aynı
// (src/components/City/world/town.js · venues.js otogarYard); değişirse burası da güncellenir.
export const FAR_DEPOT = { key: 'kervankent', name: 'Kervankent Lojistik Terminali', x: 2271.6, z: -2293.6, r: 7.5 };
export const OTOGARS = [
  { key: 'neon', name: 'Neon Şehir Otogarı', x: 199, z: -100, r: 6 },
  { key: 'kervankent', name: 'Kervankent Otogarı', x: 2147.3, z: -2316.2, r: 6 },
];
export const HWY_ENTRY = { x: 160, z: -140 }; // şehirden otoyola çıkılan kavşak
export const HWY_LEN = 3583; // O-77 otoyolunun uzunluğu (m)
export const FAR_TIR_LEN = 4160; // liman → otoyol → Kervankent terminali (yaklaşık yol)
// v219: teslim noktası Neon Elmas Madeni (şehir dışı) — gerçek yol uzunlukları (yol tarifiyle ölçüldü)
export const MADEN_TIR_LEN = 1160; // liman → maden
export const FAR_BACK_TIR_LEN = 3740; // Kervankent terminali → maden
export const FAR_BUS_LEN = 3740; // Neon Şehir Otogarı → Kervankent Otogarı
export const HOSPITAL = { key: 'hastane', name: 'Hastane — Acil Girişi', x: 86, z: -120, r: 7 };
export const GAS_STATION = { key: 'benzinlik', name: 'Benzinlik', x: 180, z: -160 };

// Otobüs durakları — şehrin tamamını dolaşan tek hat. Sıra = sefer.
// v219: yeni harita — 12 durak (otogar → silahçı → park → stadyum → belediye → banka → pazar yeri →
// La Marea → su sporları → aktivite parkı → marina → hastane → başa).
// x,z: otobüsün duracağı şerit; sx,sz: durak (kaldırım); fx,fz: şeritten kaldırıma birim yön.
const S = (n, name, x, z, fx, fz) => ({ n, key: `durak${n}`, name, x, z, fx, fz, sx: x + fx * 3.6, sz: z + fz * 3.6, r: 7.5 });
export const BUS_STOPS = [
  S(1, 'Otogar', 198, -86, -1, 0),
  S(2, 'Silah Mağazası', 175, 58, 0, -1),
  S(3, 'Park', 56, 58, 0, -1),
  S(4, 'Stadyum · Spor Salonu', 2, -36, 1, 0),
  S(5, 'Belediye', -38, -75, 1, 0),
  S(6, 'Banka · Casino', -38, -115, 1, 0),
  S(7, 'Pazar Yeri', -96, -142, 0, -1),
  S(8, 'La Marea · Bar', -122, -44, -1, 0),
  S(9, 'Su Sporları', -122, 44, -1, 0),
  S(10, 'Aktivite Parkı', -90, 102, 0, 1),
  S(11, 'Neon Marina', -24, 102, 0, 1),
  S(12, 'Hastane', 82, -116, 1, 0),
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
  [4, 76, 64, 96], // v219: park (3,4)–(4,4)
  [4, 76, -96, -24], // stadyum (3,0)–(4,1)
  [4, 76, -136, -104], // inşaat alanı (3,−1)–(4,−1)
  [124, 196, 64, 96], // liman (6,4)–(7,4)
];
const covered = (x, z) => BIG.some(([x0, x1, z0, z1]) => x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1);
// yakındaki yer adı (lot merkezleri)
const PLACES = [
  ['Benzinlik', 180, -160], ['Cafe', -100, -120], ['Casino', -60, -120], ['Banka', -20, -120], ['İnşaat Alanı', 40, -120], ['Hastane', 100, -120], ['Otogar', 180, -120],
  ['Bar', -100, -80], ['Taksi Durağı', -60, -80], ['Belediye', -20, -80], ['Stadyum', 40, -60],
  ['Karakol', -20, -40], ['Motor Galerisi', 100, -40], ['Modifiyeci', 140, -40], ['Fabrika', 180, -40],
  ['Spor Salonu', 20, 0], ['İnternet Kafe', 60, 0], ['Galeri', 100, 0], ['Oto Tamirci', 140, 0], ['Konteyner Sahası', 180, 0],
  ['Camii', -60, 40], ['Evler', 20, 40], ['Müstakil Evler', 60, 40], ['Müstakil Evler', -20, 40], ['Müstakil Evler', -20, 80],
  ['Silahçı', 180, 40], ['Park', 40, 80], ['Liman', 160, 80], ['Batı Mahallesi', -100, 40],
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
    // v219: sanayi sitesinin içinden geçen dikey yollar (x = −80, 160) kısmen kapalı — yolcu konmaz
    if (x === -80 || x === 160) return;
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
// v219: yeni harita yerleşimi (yarış pisti şehrin dışına taşındı; plaza kalktı; otogar eklendi)
export const KURYE_LOTS = {
  camii: [1, 3, 1, 3, 'e', 'Camii'], banka: [2, -1, 2, -1, 'w', 'Banka'], karakol: [2, 1, 2, 1, 'w', 'Karakol'], belediye: [2, 0, 2, 0, 'w', 'Belediye'],
  galeri: [5, 2, 5, 2, 'n', 'Araba Galerisi'], silah: [7, 3, 7, 3, 's', 'Silah Mağazası'], modifiye: [6, 1, 6, 1, 's', 'Modifiye Garajı'],
  casino: [1, -1, 1, -1, 'e', 'Casino'], spor: [3, 2, 3, 2, 'e', 'Spor Salonu'], fabrika: [7, 1, 7, 1, 's', 'Fabrika'], netkafe: [4, 2, 4, 2, 'w', 'İnternet Kafe'],
  bar: [0, 0, 0, 0, 'w', 'Bar'], cafe: [0, -1, 0, -1, 'w', 'Cafe'], ev: [3, 3, 3, 3, 's', 'Evler'], stadyum: [3, 0, 4, 1, 's', 'Stadyum'],
  park: [3, 4, 4, 4, 's', 'Park'], liman: [6, 4, 7, 4, 's', 'Liman'], hastane: [5, -1, 5, -1, 'w', 'Hastane'],
  benzinlik: [7, -2, 7, -2, 's', 'Benzinlik'], otogar: [7, -1, 7, 0, 'e', 'Otogar'], taksi_duragi: [1, 0, 1, 0, 'e', 'Taksi Durağı'], mustakil: [4, 3, 4, 3, 's', 'Müstakil Evler'],
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
  { key: 'kofteci', name: 'Köfteci', food: 'köfte ekmek', lot: 'otogar', x: 26, z: 13.6, r: 0, compact: true }, // v219: otogarın önü
  { key: 'simitci', name: 'Simitçi', food: 'simit', lot: 'galeri', x: -17.5, z: 13.4, r: 0, compact: true }, // v219: araba galerisinin önü
  { key: 'midyeci', name: 'Midyeci', food: 'midye', lot: 'bar', x: 13, z: 12, r: 0 },
  { key: 'dondurmaci', name: 'Dondurmacı', food: 'dondurma', lot: 'stadyum', x: -28, z: -28, r: 7 }, // v196: stadyum köşeye taşındı → şehir tarafındaki (batı) köşe
];
// alma noktası: tezgâhın dünya konumu (motor kaldırıma çıkabilir; yarıçap geniş)
export const KURYE_PICKUPS = VENDOR_SPOTS.map((v, i) => ({ i, key: v.key, name: v.name, food: v.food, ...lotWorld(KURYE_LOTS[v.lot], v.x, v.z), r: 8 }));
// teslim noktaları: tüm mekânların önü
const DROP_KEYS = ['camii', 'banka', 'karakol', 'belediye', 'galeri', 'silah', 'modifiye', 'casino', 'spor', 'fabrika', 'netkafe', 'bar', 'cafe', 'ev', 'stadyum', 'park', 'liman', 'hastane', 'benzinlik', 'taksi_duragi']; // v219: pist şehir dışında
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
