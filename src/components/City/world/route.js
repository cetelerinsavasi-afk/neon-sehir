// =============================================================================
// OTOYOL PROTOTİPİ — rota + arazi (three.js'siz saf matematik; sunucu da kullanabilir)
// Şehrin limana en uzak köşesi (sağ üst, Doğu Lojistik Deposu yanı) → dış halka yolu
// doğuya açılır → gişe → tepeler → göl kenarı → serpantin tırmanış → Kartal Tüneli →
// Akçay Köprüsü (vadi) → orman içi iniş → KERVANKENT (tırcı kasabası)
// [x, z, y(yükseklik), etiket]
// =============================================================================
import { shoreX, coastH } from '../coastShape.js';
export { shoreX, coastH };

export const CTRL = [
  [150, -140, 0],
  [200, -140, 0],
  [245, -140, 0, 'gise'],
  [280, -140, 0],
  [315, -143, 0.5],
  [352, -162, 1.5],
  [400, -200, 3],
  [470, -260, 7],
  [550, -300, 11],
  [630, -360, 9],
  [690, -440, 6, 'gol'],
  [730, -540, 5],
  [770, -650, 8],
  [810, -750, 12, 'viraj'],
  [860, -810, 15],
  [930, -835, 18],
  [985, -860, 21],
  [995, -905, 24],
  [950, -935, 27],
  [860, -950, 31],
  [800, -975, 34],
  [790, -1020, 37],
  [840, -1050, 40],
  [930, -1065, 44],
  [990, -1095, 48],
  [1015, -1150, 52],
  [1025, -1210, 55, 'tunelA'],
  [1045, -1370, 58],
  [1070, -1520, 58, 'tunelB'],
  [1100, -1600, 55],
  [1170, -1670, 49],
  [1270, -1720, 43],
  [1350, -1745, 40, 'kopruA'],
  [1490, -1770, 40],
  [1630, -1790, 40, 'kopruB'],
  [1710, -1820, 37],
  [1780, -1890, 32, 'orman'],
  [1790, -1990, 27],
  [1850, -2090, 21],
  [1950, -2150, 15],
  [2050, -2210, 11],
  [2110, -2250, 10],
  [2150, -2275, 10, 'son'],
];

export const ROAD_HALF = 5.5; // 2 şerit × 4 m + 2 × 1,5 m banket
export const LANE = 2.0; // şerit merkezi (yol ortasından)
export const RAIL = 6.3; // bariyer
export const TOWN_Y = 10;
export const CITY_EXIT_X = 204; // şehir asfaltının bittiği yer

// --- centripetal Catmull-Rom (x, y, z) ----------------------------------------
function cr(p0, p1, p2, p3, t) {
  const a = 0.5;
  const d = (p, q) => Math.pow(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) || 1e-4, a);
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const A1 = ((t1 - tt) / (t1 - t0)) * p0[k] + ((tt - t0) / (t1 - t0)) * p1[k];
    const A2 = ((t2 - tt) / (t2 - t1)) * p1[k] + ((tt - t1) / (t2 - t1)) * p2[k];
    const A3 = ((t3 - tt) / (t3 - t2)) * p2[k] + ((tt - t2) / (t3 - t2)) * p3[k];
    const B1 = ((t2 - tt) / (t2 - t0)) * A1 + ((tt - t0) / (t2 - t0)) * A2;
    const B2 = ((t3 - tt) / (t3 - t1)) * A2 + ((tt - t1) / (t3 - t1)) * A3;
    out[k] = ((t2 - tt) / (t2 - t1)) * B1 + ((tt - t1) / (t2 - t1)) * B2;
  }
  return out;
}

// --- örnekleme: her ~2 m bir nokta ---------------------------------------------
export const STEP = 2;
function sampleRoute() {
  const P = CTRL.map(([x, z, y]) => [x, y, z]);
  const ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1], 2 * P[0][2] - P[1][2]], ...P, [2 * P.at(-1)[0] - P.at(-2)[0], 2 * P.at(-1)[1] - P.at(-2)[1], 2 * P.at(-1)[2] - P.at(-2)[2]]];
  const dense = [];
  const tagAt = {};
  for (let i = 1; i < ext.length - 2; i++) {
    const tag = CTRL[i - 1][3];
    if (tag) tagAt[tag] = dense.length;
    for (let k = 0; k < 40; k++) dense.push(cr(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / 40));
  }
  tagAt.son = dense.length;
  dense.push(P.at(-1));
  // eşit aralıklı yeniden örnekleme
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][2] - dense[i - 1][2]));
  const L = cum.at(-1);
  const n = Math.ceil(L / STEP);
  const xs = new Float32Array(n + 1);
  const ys = new Float32Array(n + 1);
  const zs = new Float32Array(n + 1);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    xs[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
    ys[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
    zs[i] = dense[j][2] + (dense[j + 1][2] - dense[j][2]) * f;
  }
  const tags = {};
  Object.entries(tagAt).forEach(([k, di]) => (tags[k] = cum[di]));
  return { xs, ys, zs, n, L, step: L / n, tags };
}

export const R = sampleRoute();
export const TAGS = R.tags; // etiket → s (m)
export const LEN = R.L;
export const inTunnel = (s) => s > TAGS.tunelA && s < TAGS.tunelB;
export const onBridge = (s) => s > TAGS.kopruA && s < TAGS.kopruB;

// s'deki nokta, teğet (yatay, birim), sağ vektör, eğim
export function frameAt(s) {
  const f = Math.max(0, Math.min(R.n - 1e-4, s / R.step));
  const i = Math.floor(f);
  const t = f - i;
  const i2 = Math.min(R.n, i + 1);
  const x = R.xs[i] + (R.xs[i2] - R.xs[i]) * t;
  const y = R.ys[i] + (R.ys[i2] - R.ys[i]) * t;
  const z = R.zs[i] + (R.zs[i2] - R.zs[i]) * t;
  const a = Math.max(0, i - 1);
  const b = Math.min(R.n, i + 2);
  let tx = R.xs[b] - R.xs[a];
  let tz = R.zs[b] - R.zs[a];
  const hl = Math.hypot(tx, tz) || 1;
  const grade = (R.ys[b] - R.ys[a]) / hl;
  tx /= hl;
  tz /= hl;
  return { x, y, z, tx, tz, rx: -tz, rz: tx, grade, yaw: Math.atan2(tx, tz) };
}

// --- en yakın nokta: uzamsal ızgara ----------------------------------------------
const CELL = 48;
const hash = new Map();
for (let i = 0; i <= R.n; i++) {
  const k = `${Math.floor(R.xs[i] / CELL)},${Math.floor(R.zs[i] / CELL)}`;
  let a = hash.get(k);
  if (!a) hash.set(k, (a = []));
  a.push(i);
}
// → { s, d (işaretli: + sağ), y, dist } | null (yakında yol yok)
export function nearest(x, z, hint = -1) {
  let best = -1;
  let bd = Infinity;
  if (hint >= 0) {
    // sürüşte: önceki konumun çevresinde ara (kendi üstünden geçen yollarda karışmasın)
    const i0 = Math.max(0, hint - 40);
    const i1 = Math.min(R.n, hint + 40);
    for (let i = i0; i <= i1; i++) {
      const d = (R.xs[i] - x) ** 2 + (R.zs[i] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  } else {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = hash.get(`${cx + a},${cz + b}`);
        if (!arr) continue;
        for (const i of arr) {
          const d = (R.xs[i] - x) ** 2 + (R.zs[i] - z) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    }
  }
  if (best < 0) return null;
  // komşu parçalara izdüşüm
  let bs = best * R.step;
  let bdist = Math.sqrt(bd);
  for (const j of [best - 1, best]) {
    if (j < 0 || j >= R.n) continue;
    const ax = R.xs[j];
    const az = R.zs[j];
    const vx = R.xs[j + 1] - ax;
    const vz = R.zs[j + 1] - az;
    const l2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const px = ax + vx * t;
    const pz = az + vz * t;
    const dd = Math.hypot(x - px, z - pz);
    if (dd <= bdist) {
      bdist = dd;
      bs = (j + t) * R.step;
    }
  }
  const fr = frameAt(bs);
  const side = (x - fr.x) * fr.rx + (z - fr.z) * fr.rz;
  return { s: bs, d: side, y: fr.y, dist: bdist, i: Math.round(bs / R.step), fr };
}

// --- ŞEHİR + KASABA ALANLARI --------------------------------------------------------
// Şehir asfaltı: x −200..200, z −190..104 (cityPlan). Arazi burada düz ve görünmez.
export const CITY_RECT = { x0: -124, x1: 204, z0: -184, z1: 104 };
// Kasaba: rotanın sonunda, yolun doğrultusunda. Yerel: +x sağ, −z ileri (şehirdeki gibi kuzey)
const endF = frameAt(LEN);
export const TOWN = (() => {
  const yaw = Math.atan2(endF.tx, endF.tz); // ileri yönü
  // yerel −z = ileri → grup dönüşü: yerel (0,0,−1) dünyada (tx, tz) olmalı
  const ry = yaw + Math.PI;
  const ENTRY = 95; // ana caddenin girişi (yerel z)
  const cx = endF.x + endF.tx * ENTRY;
  const cz = endF.z + endF.tz * ENTRY;
  return { x: cx, z: cz, ry, half: 88, zf: -72, zb: ENTRY, y: TOWN_Y };
})();
export function toTown(x, z) {
  const dx = x - TOWN.x;
  const dz = z - TOWN.z;
  const c = Math.cos(TOWN.ry);
  const s = Math.sin(TOWN.ry);
  // dünya = R(ry)·yerel → yerel = R(−ry)·dünya
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function fromTown(lx, lz) {
  const c = Math.cos(TOWN.ry);
  const s = Math.sin(TOWN.ry);
  return { x: TOWN.x + lx * c + lz * s, z: TOWN.z - lx * s + lz * c };
}
export const inTownRect = (x, z, m = 0) => {
  const p = toTown(x, z);
  return Math.abs(p.x) < TOWN.half + m && p.z > TOWN.zf - m && p.z < TOWN.zb + m;
};

// --- ARAZİ ---------------------------------------------------------------------------
function h2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = h2(xi, zi);
  const b = h2(xi + 1, zi);
  const c = h2(xi, zi + 1);
  const d = h2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 5) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * (vnoise(x * f, z * f) * 2 - 1);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
const ss = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const TERRAIN = { x0: -800, x1: 3050, z0: -2950, z1: 150 };

// özellikler
export const LAKE = { x: 585, z: -545, r: 108, y: 1.2 };
export const RIVER = (() => {
  const a = frameAt(TAGS.kopruA);
  const b = frameAt(TAGS.kopruB);
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  // nehir: köprüye dik
  return { x: mx, z: mz, nx: dx / l, nz: dz / l, y: -9, half: l / 2 };
})();
// nehrin kıvrımlı ekseni: köprüde tam ortada, uzaklaştıkça menderes yapar
export function riverAlong(x, z) {
  return (x - RIVER.x) * -RIVER.nz + (z - RIVER.z) * RIVER.nx;
}
export function riverMeander(al) {
  const k = Math.min(1, Math.abs(al) / 160);
  return k * (70 * Math.sin(al / 210) + 38 * Math.sin(al / 97 + 1.3));
}
function riverOff(x, z) {
  return (x - RIVER.x) * RIVER.nx + (z - RIVER.z) * RIVER.nz - riverMeander(riverAlong(x, z));
}
const RIDGE = (() => {
  const a = frameAt((TAGS.tunelA + TAGS.tunelB) / 2);
  return { x: a.x, z: a.z, nx: a.tx, nz: a.tz }; // sırt çizgisi yola dik → normali yol yönü
})();

function cityDist(x, z) {
  const dx = Math.max(CITY_RECT.x0 - x, 0, x - CITY_RECT.x1);
  const dz = Math.max(CITY_RECT.z0 - z, 0, z - CITY_RECT.z1);
  return Math.hypot(dx, dz);
}

// doğal arazi (yol oyulmadan)
export function naturalH(x, z) {
  // v155: şehrin batısı deniz (kumsal + koylar coast.js ile birebir)
  if (x < CITY_RECT.x0 && z > CITY_RECT.z0 - 6) return coastH(x, z);
  const h0 = naturalH0(x, z);
  const sx = shoreX(z);
  if (x > sx + 70) return h0;
  const k = ss(sx + 6, sx + 70, x);
  return coastH(x, z) * (1 - k) + Math.max(h0, coastH(x, z)) * k;
}
function naturalH0(x, z) {
  const dc = cityDist(x, z);
  if (dc <= 0) return -0.5;
  const amp = ss(0, 260, dc);
  let h = fbm(x / 230, z / 230) * 26 * amp + fbm(x / 60 + 7, z / 60) * 4 * amp;
  h += amp * 6;
  // sırt (tünelin geçtiği dağ) + geniş dağ kütlesi
  const dr = (x - RIDGE.x) * RIDGE.nx + (z - RIDGE.z) * RIDGE.nz;
  const along = (x - RIDGE.x) * -RIDGE.nz + (z - RIDGE.z) * RIDGE.nx;
  const ridgeVar = 0.75 + 0.35 * fbm(along / 260, 3.3, 3);
  const taper = 1 - ss(900, 1700, Math.abs(along));
  h += (190 * Math.exp(-((dr / 175) ** 2)) * ridgeVar + 55 * Math.exp(-((dr / 420) ** 2))) * taper;
  h += Math.max(0, fbm(x / 90, z / 90, 3)) * 40 * Math.exp(-((dr / 220) ** 2)) * taper;
  // kenarlarda çevreleyen dağlar (harita sınırı görünmesin)
  const de = Math.min(TERRAIN.x1 - x, z - TERRAIN.z0); // batı kenarı deniz: dağ yok
  h += 260 * (1 - ss(0, 520, de)) * (0.7 + 0.3 * fbm(x / 150, z / 150, 3)) * ss(60, 420, dc);
  // göl çanağı
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = Math.min(h, LAKE.y - 7 + Math.max(0, dl - LAKE.r * 0.7) * 0.32);
  // nehir kanyonu
  const rd = Math.abs(riverOff(x, z));
  const canyon = RIVER.y - 6 + Math.max(0, rd - 20) * 0.52 + fbm(x / 40, z / 40, 3) * 4;
  h = Math.min(h, canyon);
  // deniz kıyısı (şehrin güneyi)
  if (z > 60) h = Math.min(h, -3 - (z - 104) * 0.2 + (104 - Math.min(z, 104)) * 0.25);
  return h;
}

// yol + kasaba oyulmuş son arazi
export function terrainH(x, z) {
  let h = naturalH(x, z);
  // kasaba düzlüğü
  const tp = toTown(x, z);
  const tdx = Math.max(0, Math.abs(tp.x) - TOWN.half - 6);
  const tdz = Math.max(0, TOWN.zf - 6 - tp.z, tp.z - TOWN.zb - 6);
  const td = Math.hypot(tdx, tdz);
  if (td < 70) {
    const k = ss(0, 70, td);
    h = TOWN_Y - 0.35 + (h - (TOWN_Y - 0.35)) * k;
  }
  const n = nearest(x, z);
  if (!n || n.dist > 60) return h;
  const s = n.s;
  const ry = n.y - 0.35;
  const W = ROAD_HALF + 5.5;
  const tunnel = inTunnel(s);
  const bridge = onBridge(s);
  // portal ağızları açık kalsın
  const nearPortal = Math.min(Math.abs(s - TAGS.tunelA), Math.abs(s - TAGS.tunelB)) < 1.5;
  if (tunnel && !nearPortal) {
    // tünelin üstü hep dolu
    if (n.dist < 22) h = Math.max(h, n.y + 13 + (22 - n.dist) * 0.2);
    return h;
  }
  if (bridge) {
    if (n.dist < 14) h = Math.min(h, n.y - 8);
    return h;
  }
  if (n.dist < W) return ry;
  const k = ss(W, W + 40, n.dist);
  return ry + (h - ry) * k;
}
