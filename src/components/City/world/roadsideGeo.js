// =============================================================================
// O-77 YOL ÜSTÜ — geometri (three.js yok): yol kenarı cepleri, köy sapakları, köy düzlükleri.
// Cep (pad) yerel ekseni: +x yoldan dışarı, z yol boyunca. Sağ (+1) = Neon Şehir → Kervankent
// gidiş şeridinin yanı; sol (−1) = dönüş şeridinin yanı.
// =============================================================================
import { frameAt, ROAD_HALF, RIVER, riverMeander, naturalH } from './route.js';

const PI = Math.PI;
export const ss = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// tür → { ad, glyph }
export const SPOT_DEFS = [
  { key: 'benzin_gidis', kind: 'benzin', s: 290, side: 1, len: 72, wid: 34, name: 'Neon Petrol · Gidiş', glyph: 'fuel' },
  { key: 'polis', kind: 'polis', s: 470, side: 1, len: 56, wid: 13, name: 'Polis Çevirmesi', glyph: 'police' },
  { key: 'karpuz', kind: 'karpuz', s: 700, side: 1, len: 26, wid: 12, name: 'Karpuzcu', glyph: 'melon' },
  { key: 'gol_cebi', kind: 'seyir', s: 742, side: -1, len: 44, wid: 12, name: 'Kuğu Gölü Seyir Cebi', glyph: 'view' },
  { key: 'dinlenme', kind: 'dinlenme', s: 835, side: 1, len: 140, wid: 62, name: 'Kervansaray Dinlenme Tesisi', glyph: 'rest' },
  { key: 'cep1', kind: 'cep', s: 1100, side: 1, len: 44, wid: 5.5, name: 'Emniyet Cebi', glyph: 'parking' },
  { key: 'bal', kind: 'bal', s: 1600, side: -1, len: 28, wid: 12, name: 'Köylü Tezgâhı · Bal & Peynir', glyph: 'honey' },
  { key: 'kantar', kind: 'kantar', s: 2420, side: 1, len: 64, wid: 18, name: 'Tır Kantarı', glyph: 'scale' },
  { key: 'cep2', kind: 'cep', s: 2470, side: -1, len: 44, wid: 5.5, name: 'Emniyet Cebi', glyph: 'parking' },
  { key: 'benzin_donus', kind: 'benzin', s: 3420, side: -1, len: 72, wid: 34, name: 'Neon Petrol · Dönüş', glyph: 'fuel' },
  { key: 'misir', kind: 'misir', s: 3478, side: 1, len: 22, wid: 11, name: 'Mısırcı', glyph: 'corn' },
];
// köyler: sapak s'i, yönü, köy merkezi (yoldan uzaklık d), köy yüksekliği
export const VILLAGE_DEFS = [
  { key: 'golyaka', name: 'Gölyaka Köyü', s: 560, side: 1, d: 158, along: 22, y: 4.2, W: 110, D: 92 },
  { key: 'camlica', name: 'Çamlıca Köyü', s: 3330, side: -1, d: 190, along: 18, y: 2.0, W: 110, D: 92 },
];
export const BR_HALF = 3.4; // köy yolu yarı genişliği
const LAKE_C = { x: 585, z: -545 };

// --- dönüşümler -----------------------------------------------------------------------------
export function toPad(p, x, z) {
  const dx = x - p.cx;
  const dz = z - p.cz;
  const c = Math.cos(p.ry);
  const s = Math.sin(p.ry);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function fromPad(p, lx, lz) {
  const c = Math.cos(p.ry);
  const s = Math.sin(p.ry);
  return { x: p.cx + lx * c + lz * s, z: p.cz - lx * s + lz * c };
}

// --- cepler (yol kenarı düzlükleri) --------------------------------------------------------
function roadPad(def) {
  const f = frameAt(def.s);
  const ry = def.side > 0 ? f.yaw + PI : f.yaw; // yerel +x dışarı
  const dirS = def.side > 0 ? -1 : 1; // yerel +z → s yönü
  const p = {
    ...def,
    road: true,
    cx: f.x,
    cz: f.z,
    ry,
    y0: f.y,
    dirS,
    x0: 3.4,
    x1: ROAD_HALF + 0.6 + def.wid,
    z0: -def.len / 2,
    z1: def.len / 2,
  };
  p.yAt = (lx, lz) => frameAt(def.s + dirS * Math.max(p.z0, Math.min(p.z1, lz))).y + 0.05;
  p.r = Math.hypot(p.x1, p.len / 2) + 2;
  // pad merkezi (dünya) — harita / yakınlık
  const m = fromPad(p, (ROAD_HALF + p.x1) / 2, 0);
  p.mx = m.x;
  p.mz = m.z;
  return p;
}

// --- köy yolları (Catmull-Rom, 2 m örnek) ---------------------------------------------------
function catmull(pts, step = 2) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts.at(-1));
  return out;
}
function makeVillage(v) {
  const f = frameAt(v.s);
  const side = v.side;
  const rx = f.rx * side;
  const rz = f.rz * side;
  const P = (d, a) => [f.x + rx * d + f.tx * a, f.z + rz * d + f.tz * a];
  const center = P(v.d, v.along);
  // köy düzlüğü: girişi yola bakar (yerel +z → yola doğru)
  const dirX = f.x - center[0];
  const dirZ = f.z - center[1];
  const ry = Math.atan2(dirX, dirZ);
  const pad = { key: v.key, kind: 'koy', name: v.name, glyph: 'village', village: true, cx: center[0], cz: center[1], ry, y0: v.y, x0: -v.W / 2, x1: v.W / 2, z0: -v.D / 2, z1: v.D / 2, yAt: () => v.y + 0.05, r: Math.hypot(v.W, v.D) / 2 + 2, mx: center[0], mz: center[1] };
  // yol: otoyol kenarı → kıvrılarak köyün girişine (yerel z = D/2 + 2)
  const gate = fromPad(pad, 0, v.D / 2 + 0.5);
  const appr = fromPad(pad, 0, v.D / 2 + 18);
  const s1 = (v.along > 0 ? 1 : -1) * 8;
  // son 18 m köyün ana yoluyla aynı doğrultuda → asfalt ile köy yolu tam hizada birleşir
  const ctrl = [P(ROAD_HALF - 1.2, -s1 * 0.6), P(ROAD_HALF + 10, s1), P(v.d * 0.42, v.along * 0.25 + s1 * 2.2), [appr.x, appr.z], [gate.x, gate.z]];
  const pts = catmull(ctrl, 2);
  const y0 = f.y + 0.06;
  let L = 0;
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push((L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
  const sGate = (() => {
    let bi = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.hypot(p[0] - gate.x, p[1] - gate.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return S[bi];
  })();
  const ys = S.map((s) => (s >= sGate ? pad.y0 + 0.05 : y0 + (pad.y0 + 0.05 - y0) * ss(0, sGate, s)));
  const br = { key: v.key, kind: 'sapak', pts, ys, S, L, s: v.s, side, x0: Math.min(...pts.map((p) => p[0])) - 6, x1: Math.max(...pts.map((p) => p[0])) + 6, z0: Math.min(...pts.map((p) => p[1])) - 6, z1: Math.max(...pts.map((p) => p[1])) + 6 };
  return { pad, br };
}

// --- AKÇAY VADİSİ KÖY YOLU: Gölyaka'nın arkasından nehir vadisi boyunca (otoyol köprüsünün
// altından geçer, Kartal Dağı'nı boğazdan aşar), köy köprüsüyle karşıya, Çamlıca'nın arkasına ---------
const RT = [-RIVER.nz, RIVER.nx]; // nehir boyu
const riverPt = (al, o) => {
  const m = riverMeander(al) + o;
  return [RIVER.x + RT[0] * al + RIVER.nx * m, RIVER.z + RT[1] * al + RIVER.nz * m];
};
export const VADI = { bridgeAl: -430, bank: 37 };
// uzun kontrol aralıklarını böl (düzgün catmull ilmek / sivri dönüş yapmasın)
function densify(ctrl, maxSeg = 70) {
  const out = [ctrl[0]];
  for (let i = 1; i < ctrl.length; i++) {
    const [ax, az] = ctrl[i - 1];
    const [bx, bz] = ctrl[i];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / maxSeg);
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}
function makeBackRoad(gol, cam) {
  const out = (pad, d) => {
    const w = fromPad(pad, 0, -pad.z1 - d);
    return [w.x, w.z];
  };
  const a0 = 1460;
  const seg1 = [out(gol, -2), out(gol, 18), out(gol, 60), out(gol, 120)];
  const B0 = VADI.bridgeAl;
  const v0 = VADI.bank + 6;
  const R = 42; // köprüye geniş yay
  for (let al = a0; al >= B0 + R + 150; al -= 90) seg1.push(riverPt(al, -VADI.bank));
  // ~50 m önce dere kenarından uzaklaş, geniş bir yayla dönüp köprüye düz gir
  seg1.push(riverPt(B0 + R + 95, -VADI.bank - 6), riverPt(B0 + R + 55, -v0 - R + 6), riverPt(B0 + R + 25, -v0 - R), riverPt(B0 + R, -v0 - R));
  const arc1 = [];
  for (let k = 1; k <= 30; k++) {
    const t = (-90 - (90 * k) / 30) * (PI / 180);
    arc1.push(riverPt(B0 + R + R * Math.cos(t), -v0 + R * Math.sin(t)));
  }
  const A = [...catmull(densify(seg1), 2), ...arc1];
  // köprü (düz)
  const p0 = riverPt(VADI.bridgeAl, -VADI.bank - 6);
  const p1 = riverPt(VADI.bridgeAl, VADI.bank + 6);
  const Bn = Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 2);
  const Bp = [];
  for (let k = 1; k <= Bn; k++) Bp.push([p0[0] + ((p1[0] - p0[0]) * k) / Bn, p0[1] + ((p1[1] - p0[1]) * k) / Bn]);
  const c2 = out(cam, 70);
  const arc2 = [];
  for (let k = 1; k <= 30; k++) {
    const t = ((-90 * k) / 30) * (PI / 180);
    arc2.push(riverPt(B0 - R + R * Math.cos(t), v0 - R * Math.sin(t)));
  }
  const e0 = arc2.at(-1);
  const seg3 = [e0, riverPt(B0 - R - 25, v0 + R + 1), riverPt(B0 - R - 55, v0 + R + 8), riverPt(B0 - R - 80, v0 + R + 22), [(p1[0] + c2[0]) / 2, (p1[1] + c2[1]) / 2 + 20], c2, out(cam, 18), out(cam, -2)];
  const C = [...arc2, ...catmull(densify(seg3), 2).slice(1)];
  const pts = [...A, ...Bp, ...C];
  const bridge = [...A.map(() => false), ...Bp.map(() => true), ...C.map(() => false)];
  let L = 0;
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push((L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
  // yükseklik: araziyi yumuşat (±45 m), vadi tabanında suyun üstünde kal, köprü düz, uçlar köye otursun
  const raw = pts.map(([x, z]) => naturalH(x, z));
  const ys = raw.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - 22); j <= Math.min(raw.length - 1, i + 22); j++) {
      sum += raw[j];
      n++;
    }
    return Math.max(-4.4, sum / n);
  });
  const bi = bridge.indexOf(true);
  const bj = bridge.lastIndexOf(true);
  const deck = Math.max(ys[bi - 1], ys[bj + 1], -3.6) + 0.4;
  for (let i = bi - 6; i <= bj + 6; i++) ys[i] = i >= bi && i <= bj ? deck : ys[i] + (deck - ys[i]) * (1 - Math.min(Math.abs(i - (i < bi ? bi : bj)) / 6, 1));
  const yG = gol.y0 + 0.05;
  const yC = cam.y0 + 0.05;
  for (let i = 0; i < ys.length; i++) {
    const kA = 1 - ss(0, 70, S[i]);
    const kB = 1 - ss(0, 70, L - S[i]);
    ys[i] = ys[i] * (1 - kA) + yG * kA;
    ys[i] = ys[i] * (1 - kB) + yC * kB;
  }
  // eğim sınırı (%9): ileri + geri geçiş — vadi kenarındaki dik inişler yumuşasın
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < ys.length; i++) {
      if (bridge[i]) {
        ys[i] = deck; // köprü tabliyesi sabit (eğim sınırı onu değiştirmesin)
        continue;
      }
      const g = 0.09 * (S[i] - S[i - 1]);
      ys[i] = Math.min(ys[i - 1] + g, Math.max(ys[i - 1] - g, ys[i]));
    }
    for (let i = ys.length - 2; i >= 0; i--) {
      if (bridge[i]) {
        ys[i] = deck;
        continue;
      }
      const g = 0.09 * (S[i + 1] - S[i]);
      ys[i] = Math.min(ys[i + 1] + g, Math.max(ys[i + 1] - g, ys[i]));
    }
  }
  return { key: 'vadi', kind: 'vadi', name: 'Akçay Vadisi Köy Yolu', pts, ys, S, L, bridge, bridgeRange: [bi, bj], deck, x0: Math.min(...pts.map((p) => p[0])) - 6, x1: Math.max(...pts.map((p) => p[0])) + 6, z0: Math.min(...pts.map((p) => p[1])) - 6, z1: Math.max(...pts.map((p) => p[1])) + 6 };
}
// Çamlık piknik alanı + yol kenarı otoparkı (vadi yolunun ormanlık kesiminde, düz ve az kavisli yerde)
export const PIKNIK_AT = 0.56;
function picnicPad(b) {
  const n = b.pts.length;
  let best = Math.floor(n * PIKNIK_AT);
  let bs = Infinity;
  for (let i = Math.floor(n * 0.5); i < Math.floor(n * 0.62); i++) {
    const a = b.pts[i - 12];
    const c = b.pts[i + 12];
    const m = b.pts[i];
    const dev = Math.abs((c[0] - a[0]) * (m[1] - a[1]) - (c[1] - a[1]) * (m[0] - a[0])) / Math.hypot(c[0] - a[0], c[1] - a[1]);
    const gr = Math.abs(b.ys[i + 12] - b.ys[i - 12]);
    const sc = dev * 3 + gr;
    if (sc < bs) {
      bs = sc;
      best = i;
    }
  }
  const i0 = best;
  const [x, z] = b.pts[i0];
  const a = b.pts[i0 - 2];
  const c = b.pts[i0 + 2];
  const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const tx = (c[0] - a[0]) / l;
  const tz = (c[1] - a[1]) / l;
  // yamaç tarafı (yüksek olan)
  const hR = naturalH(x - tz * 30, z + tx * 30);
  const hL = naturalH(x + tz * 30, z - tx * 30);
  const side = hR >= hL ? 1 : -1;
  const ox = -tz * side; // dışarı (+x yerel)
  const oz = tx * side;
  const ry = Math.atan2(ox, oz) - PI / 2; // yerel +x → (ox, oz)
  const p = { key: 'piknik', kind: 'piknik', name: 'Çamlık Piknik Alanı', glyph: 'fork', cx: x, cz: z, ry, y0: b.ys[i0], x0: BR_HALF - 0.4, x1: BR_HALF + 34, z0: -22, z1: 22, soft: true, branchIdx: i0 };
  // yerel z → yol boyunca örnek (2 m aralık); yerel +z yönü yolun hangi yönü?
  const fz = Math.cos(ry) * 0 + 1;
  void fz;
  const lzDir = (Math.sin(ry) * tx + Math.cos(ry) * tz) >= 0 ? 1 : -1; // yerel +z = tx,tz ise +1
  p.yAt = (lx, lz) => {
    const f = i0 + (lzDir * Math.max(p.z0, Math.min(p.z1, lz))) / 2;
    const k = Math.max(0, Math.min(b.ys.length - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - k));
    return b.ys[k] + (b.ys[k + 1] - b.ys[k]) * t + 0.06;
  };
  p.r = Math.hypot(p.x1, p.z1) + 2;
  const m = fromPad(p, (p.x0 + p.x1) / 2, 0);
  p.mx = m.x;
  p.mz = m.z;
  return p;
}
// --- genel yol yapıcı: kontrol noktaları → 2 m örnek, arazi + uçlar + %9 eğim ---------------------
function makeRoad(key, kind, ctrl, { y0 = null, y1 = null, minY = -1e9, smooth = 22, extra = {} } = {}) {
  const pts = catmull(densify(ctrl, 60), 2);
  let L = 0;
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push((L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
  const raw = pts.map(([x, z]) => naturalH(x, z));
  const ys = raw.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - smooth); j <= Math.min(raw.length - 1, i + smooth); j++) {
      sum += raw[j];
      n++;
    }
    return Math.max(minY, sum / n);
  });
  for (let i = 0; i < ys.length; i++) {
    if (y0 !== null) {
      const k = 1 - ss(0, 50, S[i]);
      ys[i] = ys[i] * (1 - k) + y0 * k;
    }
    if (y1 !== null) {
      const k = 1 - ss(0, 50, L - S[i]);
      ys[i] = ys[i] * (1 - k) + y1 * k;
    }
  }
  if (y0 !== null) ys[0] = y0;
  if (y1 !== null) ys[ys.length - 1] = y1;
  const last = ys.length - 1;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < ys.length; i++) {
      if (i === last && y1 !== null) continue;
      const g = 0.085 * (S[i] - S[i - 1]);
      ys[i] = Math.min(ys[i - 1] + g, Math.max(ys[i - 1] - g, ys[i]));
    }
    for (let i = ys.length - 2; i >= 0; i--) {
      if (i === 0 && y0 !== null) continue;
      const g = 0.085 * (S[i + 1] - S[i]);
      ys[i] = Math.min(ys[i + 1] + g, Math.max(ys[i + 1] - g, ys[i]));
    }
  }
  const b = { key, kind, pts, ys, S, L, x0: Math.min(...pts.map((p) => p[0])) - 6, x1: Math.max(...pts.map((p) => p[0])) + 6, z0: Math.min(...pts.map((p) => p[1])) - 6, z1: Math.max(...pts.map((p) => p[1])) + 6, ...extra };
  return b;
}
// yol üstünde düz cep (yolun bir yanına; yerel +x dışarı, z yol boyunca) — seyir, piknik vb.
function sidePad(b, i0, def, preferLeft = null) {
  const [x, z] = b.pts[i0];
  const a = b.pts[i0 - 2];
  const c = b.pts[i0 + 2];
  const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const tx = (c[0] - a[0]) / l;
  const tz = (c[1] - a[1]) / l;
  let side = preferLeft;
  if (side === null) side = naturalH(x - tz * 30, z + tx * 30) >= naturalH(x + tz * 30, z - tx * 30) ? 1 : -1;
  const ox = -tz * side;
  const oz = tx * side;
  const ry = Math.atan2(ox, oz) - PI / 2;
  const p = { ...def, cx: x, cz: z, ry, y0: b.ys[i0], x0: BR_HALF - 0.4, soft: true, branchIdx: i0 };
  const lzDir = Math.sin(ry) * tx + Math.cos(ry) * tz >= 0 ? 1 : -1;
  p.yAt = (lx, lz) => {
    const f = i0 + (lzDir * Math.max(p.z0, Math.min(p.z1, lz))) / 2;
    const k = Math.max(0, Math.min(b.ys.length - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - k));
    return b.ys[k] + (b.ys[k + 1] - b.ys[k]) * t + 0.06;
  };
  p.r = Math.hypot(p.x1, p.z1) + 2;
  const m = fromPad(p, (p.x0 + p.x1) / 2, 0);
  p.mx = m.x;
  p.mz = m.z;
  return p;
}
// uzamsal ızgara (16 m)
function hashBranch(b) {
  b.hash = new Map();
  b.pts.forEach(([x, z], i) => {
    const k = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    if (!b.hash.has(k)) b.hash.set(k, []);
    b.hash.get(k).push(i);
  });
}

let patika = null;
let pier = null;
// patika: en yakın nokta (yalnız yaya)
export function patikaAt(x, z) {
  const p = geo().patika;
  if (!p || x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return null;
  let bd = Infinity;
  let bi = 0;
  p.pts.forEach(([px, pz], i) => {
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return { d: Math.sqrt(bd), y: p.ys[bi] };
}
// iskele: yerel (u: göle doğru, v: sağa); güverte üstünde mi, korkuluğa çarpıyor mu
export function pierLocal(x, z) {
  const q = geo().pier;
  if (!q) return null;
  const dx = x - q.x;
  const dz = z - q.z;
  const u = dx * q.ux + dz * q.uz;
  const v = dx * -q.uz + dz * q.ux;
  if (u < q.L0 - 0.5 || u > q.Lw + q.PL + 1 || Math.abs(v) > q.PW + 1) return null;
  const onWalk = u >= q.L0 && u <= q.Lw + 0.2 && Math.abs(v) <= 1.1;
  const onPlat = u >= q.Lw && u <= q.Lw + q.PL && Math.abs(v) <= q.PW;
  const R = 0.28;
  const rail = (onWalk && u > q.L0 + 1.2 && Math.abs(v) > 1.1 - R) || (onPlat && (u > q.Lw + q.PL - R || Math.abs(v) > q.PW - R || (u < q.Lw + R && Math.abs(v) > 1.1)));
  return { u, v, on: onWalk || onPlat, rail, y: q.y };
}

let G = null;
export function geo() {
  if (G) return G;
  const pads = SPOT_DEFS.map(roadPad);
  const branches = [];
  VILLAGE_DEFS.forEach((v) => {
    const { pad, br } = makeVillage(v);
    pads.push(pad);
    branches.push(br);
  });
  const vadi = makeBackRoad(pads.find((p) => p.key === 'golyaka'), pads.find((p) => p.key === 'camlica'));
  branches.push(vadi);
  branches.forEach(hashBranch);
  pads.push(picnicPad(vadi));
  // KUĞU GÖLÜ YOLU: şehirden çıkınca sola ayrılır, gölün arkasından dolaşıp ileride otoyola bağlanır
  {
    const J = (s, d, a = 0) => {
      const f = frameAt(s);
      return [f.x - f.rx * d + f.tx * a, f.z - f.rz * d + f.tz * a];
    };
    const sA = 230;
    const sB = 1000;
    const ctrl = [J(sA, ROAD_HALF - 1.2, -4), J(sA, ROAD_HALF + 12, 10), J(sA, 40, 30), [332, -300], [318, -400], [322, -500], [345, -610], [400, -715], [480, -785], [575, -805], [680, -812], J(sB, 45, -45), J(sB, ROAD_HALF + 12, -14), J(sB, ROAD_HALF - 1.2, 4)];
    const gl = makeRoad('gol_yolu', 'sapak', ctrl, { y0: frameAt(sA).y + 0.06, y1: frameAt(sB).y + 0.06, minY: 1.8, extra: { s: sA, s2: sB, side: -1, signName: 'Kuğu Gölü Yolu · Elmas Madeni' } });
    hashBranch(gl);
    branches.push(gl);
    // göl seyir terası + oturma + küçük otopark (gölün batı kıyısına bakan yerde)
    let bi = 0;
    let bd = Infinity;
    gl.pts.forEach(([x, z], i) => {
      const d = Math.hypot(x - 330, z - 520 * -1 * -1 - 0);
      void d;
      const dl = Math.hypot(x - LAKE_C.x, z - LAKE_C.z);
      if (dl < bd && i > 20 && i < gl.pts.length - 20 && x < 520) {
        bd = dl;
        bi = i;
      }
    });
    const [px, pz] = gl.pts[bi];
    const a = gl.pts[bi - 2];
    const c = gl.pts[bi + 2];
    const cross = (c[0] - a[0]) * (LAKE_C.z - pz) - (c[1] - a[1]) * (LAKE_C.x - px);
    const sp = sidePad(gl, bi, { key: 'gol_seyir', kind: 'golseyir', name: 'Kuğu Gölü Seyir Terası', glyph: 'view', x1: BR_HALF + 13, z0: -16, z1: 16 }, cross > 0 ? -1 : 1);
    pads.push(sp);
    // göle inen patika (yolun göl tarafından) + ucunda göl üstünde ahşap iskele-teras
    {
      const o = fromPad(sp, 0, 0);
      const e = fromPad(sp, 10, 0);
      let nx = (e.x - o.x) / 10;
      let nz = (e.z - o.z) / 10;
      if (nx * (LAKE_C.x - o.x) + nz * (LAKE_C.z - o.z) < 0) {
        nx = -nx;
        nz = -nz;
      }
      const start = [o.x + nx * (BR_HALF + 1.4), o.z + nz * (BR_HALF + 1.4)];
      const dl = Math.hypot(LAKE_C.x - start[0], LAKE_C.z - start[1]);
      const ux = (LAKE_C.x - start[0]) / dl;
      const uz = (LAKE_C.z - start[1]) / dl;
      const len = dl - 171; // su kenarı (göl suyu ≈ 173 m yarıçap)
      const shore = [start[0] + ux * len, start[1] + uz * len];
      const mid1 = [start[0] + ux * len * 0.35 - uz * 4, start[1] + uz * len * 0.35 + ux * 4];
      const mid2 = [start[0] + ux * len * 0.7 + uz * 3, start[1] + uz * len * 0.7 - ux * 3];
      const at = (k) => [start[0] + ux * (len + k), start[1] + uz * (len + k)];
      const pts = catmull([start, mid1, mid2, at(-16), at(-7.6)], 1.5); // son kısım iskele ekseninde, iskele başında biter
      const y0 = gl.ys[bi] + 0.05;
      const ys = pts.map((_, i) => y0 + (2.05 - y0) * ss(0, pts.length - 1, i));
      patika = { pts, ys, half: 0.75, x0: Math.min(...pts.map((q) => q[0])) - 4, x1: Math.max(...pts.map((q) => q[0])) + 4, z0: Math.min(...pts.map((q) => q[1])) - 4, z1: Math.max(...pts.map((q) => q[1])) + 4 };
      pier = { x: shore[0], z: shore[1], ux, uz, L0: -8, Lw: 20, PL: 7, PW: 4.5, y: 2.05 };
    }
    // ELMAS MADENİ sapağı (göl yolunun ortalarından batıya)
    let mi = 0;
    bd = Infinity;
    gl.pts.forEach(([x, z], i) => {
      const d = Math.hypot(x - 322, z + 470);
      if (d < bd) {
        bd = d;
        mi = i;
      }
    });
    const m0 = gl.pts[mi];
    const mine = { key: 'maden', kind: 'maden', name: 'Neon Elmas Madeni', glyph: 'diamond', cx: 196, cz: -676, ry: 0, y0: 0, x0: -55, x1: 55, z0: -42, z1: 42, gravel: true };
    // girişi (yerel +z) sapağa doğru
    mine.ry = Math.atan2(m0[0] - mine.cx, m0[1] - mine.cz);
    const gate = fromPad(mine, 0, mine.z1 + 0.5);
    const appr = fromPad(mine, 0, mine.z1 + 20);
    mine.y0 = Math.max(4, naturalH(mine.cx, mine.cz));
    mine.yAt = () => mine.y0 + 0.05;
    mine.r = Math.hypot(55, 42) + 2;
    mine.mx = mine.cx;
    mine.mz = mine.cz;
    pads.push(mine);
    // T kavşak: göl yolunun kenarından dik çıkar, sonra yumuşakça madene kıvrılır
    const ta = gl.pts[Math.max(0, mi - 2)];
    const tb = gl.pts[Math.min(gl.pts.length - 1, mi + 2)];
    let qx = -(tb[1] - ta[1]);
    let qz = tb[0] - ta[0];
    const pl = Math.hypot(qx, qz);
    qx /= pl;
    qz /= pl;
    if (qx * (mine.cx - m0[0]) + qz * (mine.cz - m0[1]) < 0) {
      qx = -qx;
      qz = -qz;
    }
    const P = (d, a = 0) => [m0[0] + qx * d + ((tb[0] - ta[0]) / pl) * a, m0[1] + qz * d + ((tb[1] - ta[1]) / pl) * a];
    const mr = makeRoad('maden_yolu', 'maden', [P(BR_HALF - 0.35), P(BR_HALF + 8), P(BR_HALF + 22, 4), P(BR_HALF + 40, 16), [(m0[0] + appr.x) / 2 - 10, (m0[1] + appr.z) / 2], [appr.x, appr.z], [gate.x, gate.z]], { y0: gl.ys[mi] + 0.0, y1: mine.y0 + 0.05 });
    mr.flare0 = 4.5;
    hashBranch(mr);
    branches.push(mr);
  }
  // GÜNEYDOĞU HURDALIĞI (çete bölgesi): şehrin doğu kenarından çakıllı yol + çitli alan
  const cete = { key: 'cete', kind: 'cete', name: 'Eski Hurdalık', glyph: 'skull', cx: 330, cz: 30, ry: 0, y0: 0.05, x0: -70, x1: 70, z0: -38, z1: 38, gravel: true };
  cete.yAt = () => 0.08;
  cete.r = Math.hypot(70, 38) + 2;
  cete.mx = cete.cx;
  cete.mz = cete.cz;
  pads.push(cete);
  {
    const ctrl = [[201, 60], [214, 60], [232, 57], [248, 42], [258, 31], [262, 30]];
    const pts = catmull(ctrl, 2);
    const S = [0];
    let L = 0;
    for (let i = 1; i < pts.length; i++) S.push((L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
    const br = { key: 'cete_yol', kind: 'cakil', pts, ys: pts.map(() => 0.02), S, L, x0: 195, x1: 268, z0: 22, z1: 68 };
    hashBranch(br);
    branches.push(br);
  }
  // bariyer boşlukları (yan + s aralığı)
  const gaps = pads.filter((p) => p.road).map((p) => ({ side: p.side, s0: p.s - p.len / 2 - 2, s1: p.s + p.len / 2 + 2 }));
  branches.filter((b) => b.s != null).forEach((b) => {
    gaps.push({ side: b.side, s0: b.s - 14, s1: b.s + 14 });
    if (b.s2 != null) gaps.push({ side: b.side, s0: b.s2 - 14, s1: b.s2 + 14 });
  });
  G = { pads, branches, gaps, patika, pier };
  return G;
}

export function padAt(x, z, m = 0) {
  for (const p of geo().pads) {
    if (Math.abs(x - p.mx) > p.r + 40 || Math.abs(z - p.mz) > p.r + 40) continue;
    const l = toPad(p, x, z);
    if (l.x >= p.x0 - m && l.x <= p.x1 + m && l.z >= p.z0 - m && l.z <= p.z1 + m) return p;
  }
  return null;
}
// en yakın köy yolu noktası → { d, y, b }
export function branchAt(x, z) {
  let best = null;
  for (const b of geo().branches) {
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    let bd = Infinity;
    let bi = -1;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
      const arr = b.hash.get(`${cx + a},${cz + c}`);
      if (!arr) continue;
      for (const i of arr) {
        const d = (b.pts[i][0] - x) ** 2 + (b.pts[i][1] - z) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
    }
    if (bi < 0) continue;
    // komşu parçaya izdüşüm
    let dist = Math.sqrt(bd);
    let y = b.ys[bi];
    for (const j of [bi - 1, bi]) {
      if (j < 0 || j >= b.pts.length - 1) continue;
      const [ax, az] = b.pts[j];
      const vx = b.pts[j + 1][0] - ax;
      const vz = b.pts[j + 1][1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      const dd = Math.hypot(x - ax - vx * t, z - az - vz * t);
      if (dd <= dist) {
        dist = dd;
        y = b.ys[j] + (b.ys[j + 1] - b.ys[j]) * t;
      }
    }
    if (b.flare0) dist = Math.max(0, dist - b.flare0 * Math.max(0, 1 - b.S[bi] / 10) ** 2); // kavşak ağzı
    if (!best || dist < best.d) best = { d: dist, y, b, i: bi, bridge: Boolean(b.bridge?.[bi]) };
  }
  return best;
}

// arazi oyma: cepler ve köy yolları düzlensin. h → yeni h
export function carve(x, z, h) {
  const g = geo();
  let out = h;
  for (const p of g.pads) {
    if (Math.abs(x - p.mx) > p.r + 60 || Math.abs(z - p.mz) > p.r + 60) continue;
    const l = toPad(p, x, z);
    const cx = Math.max(p.road ? 0 : p.x0, Math.min(p.x1, l.x));
    const cz = Math.max(p.z0, Math.min(p.z1, l.z));
    const dd = Math.hypot(l.x - cx, l.z - cz);
    if (dd > 46) continue;
    const ty = p.yAt(cx, cz) - (p.village || p.soft ? 0.12 : 0.35);
    const k = ss(2, 46, dd);
    out = ty + (out - ty) * k;
  }
  const pk = patikaAt(x, z);
  if (pk && pk.d < 22) {
    const ty = pk.y - 0.1;
    const k = ss(5, 22, pk.d); // arazi hücresi 8 m: geniş düz omuz
    out = ty + (out - ty) * k;
  }
  const b = branchAt(x, z);
  if (b && b.d < 30 && !b.bridge) {
    const ty = b.y - 0.25;
    const k = ss(BR_HALF + 1.5, 30, b.d);
    out = ty + (out - ty) * k;
  }
  return out;
}
// ağaç / kaya koymama
export function nearFeature(x, z, m = 8) {
  if (padAt(x, z, m)) return true;
  const b = branchAt(x, z);
  return Boolean(b && b.d < BR_HALF + m);
}
