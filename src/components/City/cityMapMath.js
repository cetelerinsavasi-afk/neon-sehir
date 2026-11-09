// =============================================================================
// v147.3 — Şehir haritası resmi ↔ 3D dünya eşlemesi (three.js içermez; ana sayfadan
// da kullanılır: "Şehre gir" insanını haritaya sürükleyip bırakma).
// =============================================================================
import { LAYOUT_LOTS } from './cityLayout.js';

// --- gerçek harita resmi ↔ dünya eşlemesi ---------------------------------------
export const MAP_PX = {
  camii: [180, 400], karakol: [370, 330], banka: [665, 320], galeri: [560, 490], spor: [1030, 420], belediye: [1360, 500],
  silah: [75, 560], modifiye: [330, 600], fabrika: [800, 620], netkafe: [1050, 710], casino: [130, 750], park: [640, 820],
  bar: [1240, 850], cafe: [1450, 1020], pist: [400, 980], stadyum: [1050, 1150], ev: [690, 1200], liman: [300, 1230],
};
export const MAP_SIZE = 1600;
function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = m[k][i] / m[i][i];
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = m[i][3];
    for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}
export function buildMapping(lots) {
  const pts = [];
  lots.forEach((l) => {
    const px = MAP_PX[l.type];
    if (px) pts.push({ x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2, u: px[0], v: px[1], lot: l });
  });
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const bu = [0, 0, 0];
  const bv = [0, 0, 0];
  pts.forEach((p) => {
    const r = [p.x, p.z, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j];
      bu[i] += r[i] * p.u;
      bv[i] += r[i] * p.v;
    }
  });
  const a = solve3(A, bu);
  const b = solve3(A, bv);
  const aff = (x, z) => [a[0] * x + a[1] * z + a[2], b[0] * x + b[1] * z + b[2]];
  pts.forEach((p) => {
    const [u, v] = aff(p.x, p.z);
    p.du = p.u - u;
    p.dv = p.v - v;
  });
  const S2 = 2 * 26 * 26;
  const toImg = (x, z) => {
    let [u, v] = aff(x, z);
    let su = 0;
    let sv = 0;
    let sw = 0;
    pts.forEach((p) => {
      const w = Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / S2);
      su += w * p.du;
      sv += w * p.dv;
      sw += w;
    });
    const k = 1 / Math.max(1, sw);
    return [u + su * k, v + sv * k];
  };
  // resim pikseli → dünya (afinin tersiyle başla, birkaç adımda düzelt)
  const det = a[0] * b[1] - a[1] * b[0];
  const invAff = (u, v) => {
    const du = u - a[2];
    const dv = v - b[2];
    return [(du * b[1] - dv * a[1]) / det, (dv * a[0] - du * b[0]) / det];
  };
  const linInv = (du, dv) => [(du * b[1] - dv * a[1]) / det, (dv * a[0] - du * b[0]) / det];
  const toWorld = (u, v) => {
    let [x, z] = invAff(u, v);
    for (let i = 0; i < 8; i++) {
      const [cu, cv] = toImg(x, z);
      const [dx, dz] = linInv(u - cu, v - cv);
      x += dx;
      z += dz;
    }
    return [x, z];
  };
  return { toImg, toWorld, pts };
}

// Ana sayfa için: lot merkezleri plandan (motor kurulmadan)
let homeMap = null;
export function homeMapping() {
  if (!homeMap) homeMap = buildMapping(LAYOUT_LOTS);
  return homeMap;
}
