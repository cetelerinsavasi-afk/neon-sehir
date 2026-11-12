// =============================================================================
// OTOYOL PROTOTİPİ — dünya: arazi, yol, bariyer, gişe, tünel, köprü, tabelalar, ağaçlar
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floorMat } from '../kit.js';
import { R, TAGS, LEN, frameAt, nearest, terrainH, naturalH, inTunnel, onBridge, ROAD_HALF, RAIL, TERRAIN, LAKE, RIVER, CITY_RECT, inTownRect, fbm, CITY_EXIT_X, shoreX } from './route.js';
import { BEACH_RECT } from '../coast.js';
// tünelin ötesindeki soğuk bölge (0…1)
export const snowK = (x, z) => {
  const t = Math.max(0, Math.min(1, (-1480 - z) / 320));
  return t * t * (3 - 2 * t);
};
const inBeach = (x, z, m = 0) => x > BEACH_RECT.x0 + m && x < BEACH_RECT.x1 - m && z > BEACH_RECT.z0 + m && z < BEACH_RECT.z1 - m;

const PI = Math.PI;
export const S_EXIT = (() => {
  // şehir asfaltının bittiği s
  for (let i = 0; i <= R.n; i++) if (R.xs[i] >= CITY_EXIT_X - 4) return i * R.step;
  return 50;
})();
export const GISE = { s0: TAGS.gise - 14, s1: TAGS.gise + 14, s: TAGS.gise, name: 'NEON ŞEHİR GİŞELERİ' };
// v155: Kervankent girişi gişeleri (otoyolun sonu)
export const GISE2 = { s0: LEN - 60, s1: LEN - 32, s: LEN - 46, name: 'KERVANKENT GİŞELERİ' };
export const GISES = [GISE, GISE2];

// --- kesit süpürme ------------------------------------------------------------------
// profile: [[a (sağa), b (yukarı)], ...] → yol çerçevesinde süpür
function sweep(s0, s1, profile, { vRep = 12, uRep = null, closed = false, yOff = 0, step = R.step } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const P = closed ? [...profile, profile[0]] : profile;
  const ul = [0];
  for (let k = 1; k < P.length; k++) ul.push(ul[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const uTot = ul.at(-1) || 1;
  const ss = [];
  for (let s = s0; s < s1; s += step) ss.push(s);
  ss.push(s1);
  ss.forEach((s) => {
    const f = frameAt(s);
    P.forEach(([a, b], k) => {
      pos.push(f.x + f.rx * a, f.y + b + yOff, f.z + f.rz * a);
      uv.push(uRep ? ul[k] / uRep : ul[k] / uTot, s / vRep);
    });
  });
  const m = P.length;
  for (let i = 0; i < ss.length - 1; i++) {
    for (let k = 0; k < m - 1; k++) {
      const a = i * m + k;
      const b = a + 1;
      const c = a + m;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// aralıkları çıkar: [[a,b],...] içinden hariçleri
function ranges(s0, s1, excl) {
  let out = [[s0, s1]];
  excl.forEach(([a, b]) => {
    const n = [];
    out.forEach(([x, y]) => {
      if (b <= x || a >= y) n.push([x, y]);
      else {
        if (a > x) n.push([x, a]);
        if (b < y) n.push([b, y]);
      }
    });
    out = n;
  });
  return out.filter(([a, b]) => b - a > 1);
}

// --- dokular ---------------------------------------------------------------------------
function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function noiseFill(g, w, h, base, amp, n = 9000, size = 2) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * amp * 2 - amp);
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}
// yol: 11 m genişlik × 12 m boy; kenar çizgileri ±4 m, ortada kesikli çizgi
function roadTexture(solidCenter = false) {
  return canvasTexture(256, 280, (g, w, h) => {
    noiseFill(g, w, h, '#45474c', 22, 14000, 2);
    const px = (m) => ((m + ROAD_HALF) / (ROAD_HALF * 2)) * w;
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, px(-4), h);
    g.fillRect(px(4), 0, w - px(4), h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; // tekerlek izleri
    for (const m of [-3, -1, 1, 3]) g.fillRect(px(m) - 6, 0, 12, h);
    g.fillStyle = '#ece9df';
    const lw = (0.16 / 11) * w;
    g.fillRect(px(-4) - lw / 2, 0, lw, h);
    g.fillRect(px(4) - lw / 2, 0, lw, h);
    if (solidCenter) g.fillRect(px(0) - lw / 2, 0, lw, h);
    else g.fillRect(px(0) - lw / 2, 0, lw, h * (5 / 12));
  });
}

const MAT = {};
function mats() {
  if (MAT.road) return MAT;
  const rt = roadTexture(false);
  MAT.road = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.roadSolid = new THREE.MeshStandardMaterial({ map: roadTexture(true), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.gravel = new THREE.MeshStandardMaterial({ map: canvasTexture(128, 128, (g, w, h) => noiseFill(g, w, h, '#8a8072', 40, 5000, 2)), roughness: 1, side: THREE.DoubleSide });
  MAT.rail = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide });
  MAT.post = new THREE.MeshStandardMaterial({ color: '#8a8e96', metalness: 0.5, roughness: 0.5 });
  const conc = canvasTexture(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#b9b5ad', 26, 9000, 2);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
  MAT.concrete = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.88 });
  MAT.concreteD = new THREE.MeshStandardMaterial({ map: conc, color: '#9a968f', roughness: 0.9, side: THREE.DoubleSide });
  MAT.tunnel = new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#d8d2c4', 14, 6000, 2);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 128) g.fillRect(0, y, w, 3);
  }), roughness: 0.6, side: THREE.DoubleSide, color: '#bdb6a6' });
  MAT.tunnelLamp = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb347', emissiveIntensity: 1.6, toneMapped: false });
  MAT.cable = new THREE.LineBasicMaterial({ color: '#e8ecf2', transparent: true, opacity: 0.85 });
  MAT.water = new THREE.MeshStandardMaterial({ color: '#2a6f8a', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.88 });
  const wm = floorMat('su');
  if (wm?.map) {
    MAT.water.map = wm.map.clone();
    MAT.water.map.wrapS = MAT.water.map.wrapT = THREE.RepeatWrapping;
    MAT.water.map.needsUpdate = true;
  }
  MAT.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: canvasTexture(256, 256, (g, w, h) => noiseFill(g, w, h, '#bdbdbd', 46, 16000, 2)) });
  return MAT;
}

// --- ARAZİ ---------------------------------------------------------------------------
export function buildTerrain(cell = 8, { carve = null } = {}) {
  const T = TERRAIN;
  const nx = Math.ceil((T.x1 - T.x0) / cell) + 1;
  const nz = Math.ceil((T.z1 - T.z0) / cell) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = T.x0 + i * cell;
    const z = T.z0 + j * cell;
    H[j * nx + i] = carve ? carve(x, z, terrainH(x, z)) : terrainH(x, z);
  }
  // kumsal (coast.js ince ağı) altında kaba arazi biraz aşağıda kalsın
  const Hd = H.slice();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (inBeach(T.x0 + i * cell, T.z0 + j * cell, -0.01)) Hd[j * nx + i] -= 0.45;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const c = new THREE.Color();
  const grass = new THREE.Color('#5f8f3a');
  const dry = new THREE.Color('#9a9a4a');
  const forest = new THREE.Color('#3f6b2c');
  const rock = new THREE.Color('#857f76');
  const snow = new THREE.Color('#eef2f6');
  const sand = new THREE.Color('#c9b98a');
  const frost = new THREE.Color('#2e4f27'); // karlı bölgede koyu yeşil çimen
  const dirt = new THREE.Color('#8a7656');
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = T.x0 + i * cell;
      const z = T.z0 + j * cell;
      const h = H[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = Hd[k];
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / 9;
      uv[k * 2 + 1] = z / 9;
      const hx = (H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)]) / (2 * cell);
      const hz = (H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i]) / (2 * cell);
      const slope = Math.hypot(hx, hz);
      const nv = fbm(x / 70, z / 70, 3);
      c.copy(grass).lerp(dry, Math.max(0, nv) * 0.9).lerp(forest, Math.max(0, -nv) * 0.9);
      if (h > 95) c.lerp(rock, Math.min(1, (h - 95) / 40) * 0.6);
      c.lerp(rock, Math.min(1, Math.max(0, (slope - 0.45) / 0.35)));
      if (h > 150) c.lerp(snow, Math.min(1, (h - 150) / 25) * (slope < 0.9 ? 1 : 0.4));
      // v155: Kartal Tüneli'nin ötesi (kuzey) daha soğuk — kırağılı çimen, alçalan kar çizgisi
      const sn = snowK(x, z);
      if (sn > 0) {
        c.lerp(frost, sn * 0.7);
        const line = 140 - 112 * sn + fbm(x / 90, z / 90, 3) * 10;
        if (h > line) c.lerp(snow, Math.min(1, (h - line) / 10) * (slope < 1.1 ? 0.95 : 0.45) * sn);
        // zemin de karlı: geniş kar örtüsü, arada koyu yeşil çimen lekeleri
        const patch = Math.max(0, Math.min(1, 0.7 + fbm(x / 38, z / 38, 3) * 1.3));
        c.lerp(snow, sn * patch * (slope < 1.1 ? 0.9 : 0.45));
      }
      const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
      if (dl < LAKE.r * 1.35 && h < LAKE.y + 2.2) c.lerp(sand, 0.85);
      if (h < RIVER.y + 3) c.lerp(sand, 0.6);
      if (z > 70 && h < 1.5) c.lerp(sand, 0.9);
      if (x < shoreX(z) + 24 && h < 2.5) c.lerp(sand, 0.85);
      const n = nearest(x, z);
      if (n && n.dist < ROAD_HALF + 4 && !inTunnel(n.s) && !onBridge(n.s)) c.lerp(dirt, 0.45 * Math.min(1, 1 - (n.dist - ROAD_HALF) / 4));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }
  const pA = frameAt(TAGS.tunelA);
  const pB = frameAt(TAGS.tunelB);
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const d = cc + 1;
      // şehir dikdörtgeni içi çizilmez (asfaltın altında kalır)
      const x = T.x0 + (i + 0.5) * cell;
      const z = T.z0 + (j + 0.5) * cell;
      if (x > CITY_RECT.x0 + cell && x < CITY_RECT.x1 - cell && z > CITY_RECT.z0 + cell && z < CITY_RECT.z1 - 20) continue;
      if (inBeach(x, z, cell)) continue; // kumsal ince ağı
      // tünel ağızları: dağdan yol seviyesine geçen eğim tüpün içinden görünmesin
      if (Math.abs(x - pA.x) < 40 && Math.abs(z - pA.z) < 40 || Math.abs(x - pB.x) < 40 && Math.abs(z - pB.z) < 40) {
        const n = nearest(x, z);
        if (n && Math.abs(n.d) < 17 && ((n.s > TAGS.tunelA - 6 && n.s < TAGS.tunelA + 14) || (n.s > TAGS.tunelB - 14 && n.s < TAGS.tunelB + 6))) continue;
      }
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mats().terrain);
  mesh.receiveShadow = true;
  mesh.name = 'arazi';
  // örneklenmiş yükseklik (ağaç / tabela yerleşimi için hızlı)
  const sample = (x, z) => {
    const fi = (x - T.x0) / cell;
    const fj = (z - T.z0) / cell;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fi)));
    const j = Math.max(0, Math.min(nz - 2, Math.floor(fj)));
    const u = fi - i;
    const v = fj - j;
    const a = H[j * nx + i];
    const b = H[j * nx + i + 1];
    const c2 = H[(j + 1) * nx + i];
    const d = H[(j + 1) * nx + i + 1];
    return u + v < 1 ? a + (b - a) * u + (c2 - a) * v : d + (c2 - d) * (1 - u) + (b - d) * (1 - v);
  };
  return { mesh, sample };
}

// --- SU ---------------------------------------------------------------------------------
export function buildWater(group) {
  const m = mats();
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 1.6, 64), m.water);
  lake.rotation.x = -PI / 2;
  lake.position.set(LAKE.x, LAKE.y, LAKE.z);
  group.add(lake);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(320, 3400), m.water);
  river.rotation.order = 'YXZ';
  river.rotation.set(-PI / 2, Math.atan2(RIVER.nx, RIVER.nz) + PI / 2, 0);
  river.position.set(RIVER.x, RIVER.y, RIVER.z);
  group.add(river);
  if (m.water.map) m.water.map.repeat.set(6, 6);
  return { tick: (t) => m.water.map && m.water.map.offset.set(t * 0.01, t * 0.02) };
}

// --- YOL ----------------------------------------------------------------------------------
export function buildRoad(group, { gaps = [] } = {}) {
  const m = mats();
  const hw = ROAD_HALF;
  const roadP = [[-hw, 0], [hw, 0]];
  // virajlarda (serpantin) sürekli orta çizgi
  const sVir0 = TAGS.viraj + 40;
  const sVir1 = TAGS.tunelA - 30;
  ranges(S_EXIT - 6, LEN, [[sVir0, sVir1]]).forEach(([a, b]) => group.add(mesh(sweep(a, b, roadP, { yOff: 0.06 }), m.road, false, true)));
  group.add(mesh(sweep(sVir0, sVir1, roadP, { yOff: 0.06 }), m.roadSolid, false, true));
  // banket / şev (köprü ve tünel dışında)
  const off = ranges(S_EXIT, LEN - 2, [[TAGS.tunelA + 1, TAGS.tunelB - 1], [TAGS.kopruA, TAGS.kopruB]]);
  off.forEach(([a, b]) => {
    group.add(mesh(sweep(a, b, [[-hw - 3, -1.1], [-hw, 0.05]], { uRep: 4, vRep: 4 }), m.gravel, false, true));
    group.add(mesh(sweep(a, b, [[hw, 0.05], [hw + 3, -1.1]], { uRep: 4, vRep: 4 }), m.gravel, false, true));
  });
  // bariyerler
  const baseEx = [[GISE.s0 - 6, GISE.s1 + 6], [GISE2.s0 - 6, GISE2.s1 + 6], [TAGS.tunelA - 2, TAGS.tunelB + 2], [TAGS.kopruA - 1, TAGS.kopruB + 1]];
  const posts = [];
  for (const sd of [-1, 1]) {
    const ex = [...baseEx, ...gaps.filter((g) => g.side === sd).map((g) => [g.s0, g.s1])];
    ranges(S_EXIT + 4, LEN - 6, ex).forEach(([a, b]) => {
      group.add(mesh(sweep(a, b, [[sd * RAIL, 0.5], [sd * RAIL, 0.62], [sd * (RAIL + 0.08), 0.72], [sd * RAIL, 0.82], [sd * RAIL, 0.9]], { uRep: 1, vRep: 4, yOff: 0.06 }), m.rail, true, true));
      for (let s = a; s < b; s += 4) posts.push([s, sd * (RAIL + 0.12)]);
    });
  }
  const pg = new THREE.BoxGeometry(0.14, 0.95, 0.14);
  pg.translate(0, 0.47, 0);
  const pi = new THREE.InstancedMesh(pg, m.post, posts.length);
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  posts.forEach(([s, a], i) => {
    const f = frameAt(s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
    mm.compose(new THREE.Vector3(f.x + f.rx * a, f.y - 0.1, f.z + f.rz * a), q, new THREE.Vector3(1, 1, 1));
    pi.setMatrixAt(i, mm);
  });
  group.add(pi);
}

function mesh(g, m, cast = false, receive = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = receive;
  return o;
}

// --- TÜNEL -----------------------------------------------------------------------------
export const TUNNEL_R = 6.9;
export function buildTunnel(group) {
  const m = mats();
  const s0 = TAGS.tunelA - 1;
  const s1 = TAGS.tunelB + 1;
  const prof = [[-TUNNEL_R, -0.4], [-TUNNEL_R, 2.2]];
  for (let k = 1; k < 16; k++) {
    const a = PI - (k / 16) * PI;
    prof.push([TUNNEL_R * Math.cos(a), 2.2 + TUNNEL_R * 0.95 * Math.sin(a)]);
  }
  prof.push([TUNNEL_R, 2.2], [TUNNEL_R, -0.4]);
  group.add(mesh(sweep(s0, s1, prof, { uRep: 6, vRep: 6 }), m.tunnel, false, true));
  // duvarda sarı reflektif bant
  const band = new THREE.MeshStandardMaterial({ color: '#f2c21a', emissive: '#f2a01a', emissiveIntensity: 0.35, side: THREE.DoubleSide });
  for (const sd of [-1, 1]) group.add(mesh(sweep(s0, s1, [[sd * (TUNNEL_R - 0.02), 1.1], [sd * (TUNNEL_R - 0.02), 1.5]], { uRep: 1, vRep: 4 }), band));
  // yaya kaldırımları
  for (const sd of [-1, 1]) group.add(mesh(sweep(s0, s1, [[sd * ROAD_HALF, 0.06], [sd * ROAD_HALF, 0.36], [sd * TUNNEL_R, 0.36]], { uRep: 2, vRep: 4 }), m.concreteD));
  // tavan lambaları
  const lamps = [];
  for (let s = s0 + 3; s < s1 - 3; s += 7) for (const a of [-3.2, 3.2]) lamps.push([s, a]);
  const lg = new THREE.BoxGeometry(0.28, 0.08, 1.4);
  const li = new THREE.InstancedMesh(lg, m.tunnelLamp, lamps.length);
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  lamps.forEach(([s, a], i) => {
    const f = frameAt(s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
    const ay = 2.2 + TUNNEL_R * 0.95 * Math.sin(Math.acos(Math.abs(a) / TUNNEL_R)) - 0.12;
    mm.compose(new THREE.Vector3(f.x + f.rx * a, f.y + ay, f.z + f.rz * a), q, new THREE.Vector3(1, 1, 1));
    li.setMatrixAt(i, mm);
  });
  group.add(li);
  // portallar (kemerli beton cephe)
  const shape = new THREE.Shape();
  shape.moveTo(-13, -0.6);
  shape.lineTo(13, -0.6);
  shape.lineTo(13, 15);
  shape.lineTo(-13, 15);
  shape.lineTo(-13, -0.6);
  const hole = new THREE.Path();
  hole.moveTo(-TUNNEL_R - 0.05, -0.6);
  for (let k = 0; k <= 24; k++) {
    const a = PI - (k / 24) * PI;
    hole.lineTo((TUNNEL_R + 0.05) * Math.cos(a), 2.2 + (TUNNEL_R + 0.05) * 0.95 * Math.sin(a));
  }
  hole.lineTo(TUNNEL_R + 0.05, -0.6);
  shape.holes.push(hole);
  const pgeo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
  pgeo.translate(0, 0, -1.2);
  const uvA = pgeo.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) / 6, uvA.getY(i) / 6);
  [[s0 + 1.2, 1], [s1 - 1.2, -1]].forEach(([s, dir], k) => {
    const f = frameAt(s);
    const p = new THREE.Mesh(pgeo, m.concrete);
    p.position.set(f.x, f.y, f.z);
    p.rotation.y = f.yaw;
    p.castShadow = true;
    p.receiveShadow = true;
    group.add(p);
    // tabela: tünele giren sürücüye bakar
    const sg = textPanel(['KARTAL TÜNELİ', `${Math.round(TAGS.tunelB - TAGS.tunelA)} m`], { w: 9, h: 2.2, bg: '#f2f2ee', fg: '#1d2430', border: '#1d2430' });
    sg.position.set(f.x - f.tx * dir * 1.25, f.y + 11.3, f.z - f.tz * dir * 1.25);
    sg.rotation.y = f.yaw + (dir > 0 ? PI : 0);
    group.add(sg);
    void k;
    // ağız: kaya yamaç cephesi + üst örtü (arazideki ağız boşluğunu kapatır; tüpün içinden arazi görünmez)
    MAT.cap ||= new THREE.MeshStandardMaterial({ color: '#7c776d', roughness: 1, flatShading: true, side: THREE.DoubleSide });
    const inner = (q) => frameAt(s + dir * q); // q>0: tünelin içine doğru
    let Hc = 15;
    for (let d = -16; d <= 16; d += 4) {
      const g = inner(15);
      Hc = Math.max(Hc, terrainH(g.x + g.rx * d, g.z + g.rz * d) - f.y + 1.5);
    }
    Hc = Math.min(Hc, 95);
    const cliff = new THREE.Shape();
    cliff.moveTo(-18.5, -0.6);
    cliff.lineTo(18.5, -0.6);
    cliff.lineTo(18.5, Hc);
    cliff.lineTo(-18.5, Hc);
    cliff.lineTo(-18.5, -0.6);
    const ch = new THREE.Path();
    ch.moveTo(-12.9, -0.6);
    ch.lineTo(-12.9, 14.9);
    ch.lineTo(12.9, 14.9);
    ch.lineTo(12.9, -0.6);
    ch.lineTo(-12.9, -0.6);
    cliff.holes.push(ch);
    const cgeo = new THREE.ExtrudeGeometry(cliff, { depth: 1.6, bevelEnabled: false });
    cgeo.translate(0, 0, -0.4);
    const cm = new THREE.Mesh(cgeo, MAT.cap);
    cm.position.set(f.x, f.y, f.z);
    cm.rotation.y = f.yaw + (dir > 0 ? 0 : PI);
    cm.castShadow = true;
    cm.receiveShadow = true;
    group.add(cm);
    // üst örtü: cephe tepesinden içerideki araziye
    const rowsQ = [0, 3, 6, 9, 12, 15, 17];
    const cols = [-18.5, -14, -9, -4, 0, 4, 9, 14, 18.5];
    const pos = [];
    const idx = [];
    rowsQ.forEach((q) => {
      const g = inner(q);
      const t = q / 17;
      cols.forEach((d) => {
        const x = g.x + g.rx * d;
        const z = g.z + g.rz * d;
        const hi = terrainH(x, z);
        const y = f.y + Hc + (Math.max(hi, f.y + Hc) - f.y - Hc) * t + 0.3 * Math.sin(q + d);
        pos.push(x, y, z);
      });
    });
    const nc = cols.length;
    for (let r = 0; r < rowsQ.length - 1; r++) for (let c = 0; c < nc - 1; c++) {
      const a0 = r * nc + c;
      idx.push(a0, a0 + nc, a0 + 1, a0 + 1, a0 + nc, a0 + nc + 1);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setIndex(idx);
    cg.computeVertexNormals();
    const cap = new THREE.Mesh(cg, MAT.cap);
    cap.receiveShadow = true;
    group.add(cap);
  });
}

// --- KÖPRÜ ------------------------------------------------------------------------------
export function buildBridge(group, groundAt) {
  const m = mats();
  const s0 = TAGS.kopruA - 2;
  const s1 = TAGS.kopruB + 2;
  // tabliye (kutu kesit)
  group.add(mesh(sweep(s0, s1, [[-7, 0.04], [7, 0.04], [7, -1.9], [5, -2.6], [-5, -2.6], [-7, -1.9]], { closed: true, uRep: 6, vRep: 6 }), m.concrete, true, true));
  // korkuluk duvarları + metal parmaklık
  for (const sd of [-1, 1]) {
    group.add(mesh(sweep(s0, s1, [[sd * 6.2, 0.04], [sd * 6.2, 0.95], [sd * 6.9, 0.95], [sd * 6.9, 0.04]], { uRep: 3, vRep: 6 }), m.concreteD, true, true));
    group.add(mesh(sweep(s0, s1, [[sd * 6.55, 1.25], [sd * 6.55, 1.33]], { uRep: 1, vRep: 4 }), m.rail));
  }
  // ayaklar
  const pg = [];
  for (let s = s0 + 22; s < s1 - 18; s += 34) {
    const f = frameAt(s);
    const gy = groundAt(f.x, f.z) - 3;
    const h = f.y - 2.6 - gy;
    if (h < 2) continue;
    const g = new THREE.BoxGeometry(6, h, 3.2);
    g.translate(0, gy + h / 2, 0);
    g.rotateY(f.yaw);
    g.translate(f.x, 0, f.z);
    pg.push(g);
  }
  // pilonlar (ortada, iki yanda) + eğik askı halatları
  const sm = (s0 + s1) / 2;
  const fm = frameAt(sm);
  const gy = groundAt(fm.x, fm.z) - 3;
  const top = fm.y + 46;
  const cables = [];
  for (const sd of [-1, 1]) {
    const g = new THREE.BoxGeometry(2.2, top - gy, 2.6);
    g.translate(sd * 8.4, gy + (top - gy) / 2, 0);
    g.rotateY(fm.yaw);
    g.translate(fm.x, 0, fm.z);
    pg.push(g);
    for (let k = 1; k <= 9; k++) {
      for (const dir of [-1, 1]) {
        const fs = frameAt(sm + dir * k * 13);
        const hy = top - 2 - k * 1.4;
        cables.push(fm.x + fm.rx * sd * 8.4, hy, fm.z + fm.rz * sd * 8.4, fs.x + fs.rx * sd * 6.9, fs.y + 0.6, fs.z + fs.rz * sd * 6.9);
      }
    }
  }
  for (const hh of [fm.y + 44, fm.y + 22]) {
    const g = new THREE.BoxGeometry(19, 1.6, 2.2);
    g.translate(0, hh, 0);
    g.rotateY(fm.yaw);
    g.translate(fm.x, 0, fm.z);
    pg.push(g);
  }
  const merged = mergeGeometries(pg.map((g) => g.toNonIndexed()));
  const pu = merged.attributes.uv;
  const pp = merged.attributes.position;
  for (let i = 0; i < pu.count; i++) pu.setXY(i, (pp.getX(i) + pp.getZ(i)) / 6, pp.getY(i) / 6);
  group.add(mesh(merged, m.concrete, true, true));
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
  group.add(new THREE.LineSegments(cg, m.cable));
  // pilon tepesinde kırmızı uçak ikaz lambaları
  for (const sd of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false }));
    b.position.set(fm.x + fm.rx * sd * 8.4, top + 0.5, fm.z + fm.rz * sd * 8.4);
    group.add(b);
  }
}

// --- GİŞE ----------------------------------------------------------------------------------
export function buildToll(group, G = GISE) {
  const m = mats();
  const f = frameAt(G.s);
  const g = new THREE.Group();
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.yaw;
  group.add(g);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(30, 1.1, 12), new THREE.MeshStandardMaterial({ color: '#e8e6e0', roughness: 0.6 }));
  roof.position.y = 7.2;
  roof.castShadow = true;
  g.add(roof);
  const band = new THREE.Mesh(new THREE.BoxGeometry(30.2, 0.35, 12.2), new THREE.MeshStandardMaterial({ color: '#1f6fd0', emissive: '#1f6fd0', emissiveIntensity: 0.6 }));
  band.position.y = 6.6;
  g.add(band);
  // v157.9: gişe meydanı — yolun iki yanında dış adalara kadar asfalt (araçlar buradan da geçer)
  const plazaM = new THREE.MeshStandardMaterial({ color: '#3b3c40', roughness: 0.95 });
  for (const sd of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 38), plazaM);
    pl.position.set(sd * (ROAD_HALF + 1.2), 0.015, 0);
    pl.receiveShadow = true;
    g.add(pl);
  }
  const islandM = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.8 });
  const stripeM = new THREE.MeshStandardMaterial({ color: '#f2c21a', roughness: 0.6 });
  const boothM = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.5 });
  const glassM = new THREE.MeshStandardMaterial({ color: '#7fb6d8', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6 });
  for (const a of [-7.4, 0, 7.4]) {
    const isl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 16), islandM);
    isl.position.set(a, 0.15, 0);
    g.add(isl);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.0, 1.2), stripeM);
    nose.position.set(a, 0.5, -8.2);
    g.add(nose);
    const nose2 = nose.clone();
    nose2.position.z = 8.2;
    g.add(nose2);
    const booth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 2.4), boothM);
    booth.position.set(a, 1.6, 0);
    booth.castShadow = true;
    g.add(booth);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(1.14, 1.0, 2.0), glassM);
    gl.position.set(a, 2.1, 0);
    g.add(gl);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.5), boothM);
    col.position.set(a, 5, 4.5);
    g.add(col);
    const col2 = col.clone();
    col2.position.z = -4.5;
    g.add(col2);
  }
  // şerit üstü HGS ışıkları (yeşil ok)
  for (const a of [-3.7, 3.7]) {
    for (const dz of [-6.1, 6.1]) {
      const p = textPanel(['HGS ⬇'], { w: 2.4, h: 0.8, bg: '#0d2a14', fg: '#3dff6a', glow: true });
      p.position.set(a, 6.1, dz);
      p.rotation.y = dz < 0 ? PI : 0;
      g.add(p);
    }
  }
  for (const dz of [-6.12, 6.12]) {
    const p = textPanel([G.name], { w: 16, h: 1.0, bg: '#1f6fd0', fg: '#ffffff' });
    p.position.set(0, 7.25, dz);
    p.rotation.y = dz < 0 ? PI : 0;
    g.add(p);
  }
  // ışık (gece)
  return { x: f.x, y: f.y + 6, z: f.z };
}

// --- TABELALAR ------------------------------------------------------------------------------
const panelCache = new Map();
export function textPanel(lines, { w = 4, h = 2, bg = '#0f6b3a', fg = '#ffffff', border = '#ffffff', glow = false, font = 'Arial Black, Arial, sans-serif', radius = 0.08, arrow = null } = {}) {
  const key = JSON.stringify([lines, w, h, bg, fg, border, arrow]);
  let tex = panelCache.get(key);
  if (!tex) {
    const PX = 96;
    tex = canvasTexture(Math.round(w * PX), Math.round(h * PX), (g, cw, ch) => {
      const r = radius * PX;
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(0, 0, cw, ch, r);
      g.fill();
      if (border) {
        g.strokeStyle = border;
        g.lineWidth = PX * 0.07;
        g.beginPath();
        g.roundRect(PX * 0.09, PX * 0.09, cw - PX * 0.18, ch - PX * 0.18, r * 0.7);
        g.stroke();
      }
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = lines.length;
      const lh = (ch * 0.78) / n;
      lines.forEach((t, i) => {
        let fs = lh * 0.72;
        g.font = `900 ${fs}px ${font}`;
        const maxW = cw * (arrow ? 0.72 : 0.88);
        const mw = g.measureText(t).width;
        if (mw > maxW) {
          fs *= maxW / mw;
          g.font = `900 ${fs}px ${font}`;
        }
        g.fillText(t, arrow ? cw * 0.42 : cw / 2, ch * 0.11 + lh * (i + 0.5));
      });
      if (arrow) {
        g.save();
        g.translate(cw * 0.86, ch / 2);
        g.rotate(arrow);
        g.fillStyle = fg;
        g.beginPath();
        const a = ch * 0.3;
        g.moveTo(0, -a);
        g.lineTo(a * 0.75, 0);
        g.lineTo(a * 0.25, 0);
        g.lineTo(a * 0.25, a);
        g.lineTo(-a * 0.25, a);
        g.lineTo(-a * 0.25, 0);
        g.lineTo(-a * 0.75, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
    }, false);
    panelCache.set(key, tex);
  }
  const mat = glow ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.18 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#7a7f88', metalness: 0.5, roughness: 0.5 }));
  back.rotation.y = PI;
  back.position.z = -0.02;
  o.add(back);
  return o;
}
function circleSign(text, { r = 0.45, ring = '#d81e1e', bg = '#ffffff', fg = '#111' } = {}) {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = ring;
    g.beginPath();
    g.arc(64, 64, 62, 0, PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(64, 64, 46, 0, PI * 2);
    g.fill();
    g.fillStyle = fg;
    g.font = '900 52px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 67);
  }, false);
  const o = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#fff', emissiveMap: tex, emissiveIntensity: 0.15 }));
  return o;
}
function triSign(symbol) {
  const tex = canvasTexture(128, 116, (g) => {
    g.fillStyle = '#d81e1e';
    g.beginPath();
    g.moveTo(64, 2);
    g.lineTo(126, 112);
    g.lineTo(2, 112);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(64, 26);
    g.lineTo(106, 100);
    g.lineTo(22, 100);
    g.closePath();
    g.fill();
    g.fillStyle = '#111';
    g.font = '900 44px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(symbol, 64, 76);
  }, false);
  return new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.0), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, emissive: '#fff', emissiveMap: tex, emissiveIntensity: 0.15, side: THREE.DoubleSide }));
}
let chevTex = null;
function chevron() {
  chevTex ||= canvasTexture(64, 96, (g) => {
    g.fillStyle = '#f2c21a';
    g.fillRect(0, 0, 64, 96);
    g.fillStyle = '#111';
    g.beginPath();
    g.moveTo(14, 12);
    g.lineTo(46, 48);
    g.lineTo(14, 84);
    g.lineTo(30, 84);
    g.lineTo(54, 48);
    g.lineTo(30, 12);
    g.closePath();
    g.fill();
  }, false);
  return new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshStandardMaterial({ map: chevTex, roughness: 0.5, emissive: '#fff', emissiveMap: chevTex, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
}
const postMat = () => new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.6, roughness: 0.4 });
// yol kenarı direkli tabela: s, side(+1 sağ), panel; facing: +1 → şehirden gelen sürücüye bakar
function roadside(group, s, side, panel, { off = 8.4, h = 2.4, facing = 1, posts = 2 } = {}) {
  const f = frameAt(s);
  const g = new THREE.Group();
  g.position.set(f.x + f.rx * side * off, f.y, f.z + f.rz * side * off);
  g.rotation.y = f.yaw + (facing > 0 ? PI : 0);
  const pw = panel.geometry.parameters?.width || 1;
  const ph = panel.geometry.parameters?.height || 1;
  panel.position.y = h + ph / 2;
  g.add(panel);
  const pm = postMat();
  const px = posts === 2 ? [-pw / 2 + 0.3, pw / 2 - 0.3] : [0];
  px.forEach((x) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h + ph * 0.6, 8), pm);
    p.position.set(x, (h + ph * 0.6) / 2, -0.06);
    p.castShadow = true;
    g.add(p);
  });
  group.add(g);
  return g;
}
export function buildSigns(group) {
  const km = (s) => `${((LEN - s) / 1000).toFixed(1).replace('.', ',')} km`;
  const kmBack = (s) => `${(s / 1000).toFixed(1).replace('.', ',')} km`;
  // şehir çıkışı: yol üstü portal tabela
  {
    const f = frameAt(S_EXIT + 26);
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = f.yaw + PI;
    const pm = postMat();
    for (const a of [-7.4, 7.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 7.6, 10), pm);
      p.position.set(a, 3.8, 0);
      p.castShadow = true;
      g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.4, 0.4), pm);
    beam.position.y = 7.1;
    g.add(beam);
    const p1 = textPanel(['O-77', 'KERVANKENT', km(S_EXIT + 26)], { w: 6.4, h: 3.2, arrow: 0 });
    p1.position.set(2.2, 7.1, 0.25);
    g.add(p1);
    const p2 = textPanel(['GİŞELER'], { w: 3.6, h: 1.1, bg: '#1f6fd0' });
    p2.position.set(-3.6, 7.6, 0.25);
    g.add(p2);
    group.add(g);
  }
  roadside(group, GISE.s1 + 60, 1, circleSign('90'), { off: 7.6, posts: 1, h: 1.9 });
  roadside(group, GISE.s1 + 70, 1, textPanel(['KERVANKENT', km(GISE.s1 + 70)], { w: 4.2, h: 1.8 }));
  roadside(group, TAGS.gol, 1, textPanel(['KUĞU GÖLÜ ←'], { w: 3.6, h: 0.9, bg: '#7a4a1a' }));
  // serpantin uyarısı
  roadside(group, TAGS.viraj - 20, 1, triSign('〰'), { off: 7.6, posts: 1, h: 1.9 });
  roadside(group, TAGS.viraj - 10, 1, textPanel(['Virajlı yol', '3 km'], { w: 2.4, h: 1.2, bg: '#ffffff', fg: '#111', border: '#111' }), { off: 7.6, posts: 1, h: 1.4 });
  roadside(group, TAGS.viraj + 10, 1, circleSign('50'), { off: 7.6, posts: 1, h: 1.9 });
  // virajların dış tarafına şevron levhalar (eğrilik yüksekse)
  for (let s = TAGS.viraj; s < TAGS.tunelA - 20; s += 7) {
    const a = frameAt(s - 6);
    const b = frameAt(s + 6);
    const turn = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz) / 12; // rad/m
    if (Math.abs(turn) < 1 / 38) continue;
    // sola dönüş (turn<0? işaret kontrolü): dış taraf = dönüşün tersi
    const side = turn > 0 ? -1 : 1;
    const c = chevron();
    if (side > 0) c.scale.x = -1; // sola dönüşte ok sola baksın
    roadside(group, s, side, c, { off: RAIL + 0.6, posts: 1, h: 0.6 });
  }
  roadside(group, TAGS.tunelA - 70, 1, textPanel(['KARTAL TÜNELİ', 'Farları yakınız'], { w: 4.4, h: 1.7 }));
  roadside(group, TAGS.kopruA - 50, 1, textPanel(['AKÇAY KÖPRÜSÜ', 'Rüzgâr ⚠'], { w: 4.4, h: 1.7, bg: '#7a4a1a' }));
  roadside(group, TAGS.kopruB + 70, 1, textPanel(['KERVANKENT', km(TAGS.kopruB + 70)], { w: 4.2, h: 1.8 }));
  roadside(group, LEN - 100, 1, textPanel(['KERVANKENT'], { w: 5.2, h: 1.3, bg: '#1d4fa8' }));
  // dönüş yönü (sol taraf, kasabadan gelen sürücüye bakar)
  roadside(group, LEN - 112, -1, textPanel(['O-77', 'NEON ŞEHİR', kmBack(LEN - 112)], { w: 4.6, h: 2.4, arrow: 0 }), { facing: -1 });
  roadside(group, TAGS.kopruA - 60, -1, textPanel(['NEON ŞEHİR', kmBack(TAGS.kopruA - 60)], { w: 4.2, h: 1.8 }), { facing: -1 });
  roadside(group, TAGS.gol - 40, -1, textPanel(['NEON ŞEHİR', kmBack(TAGS.gol - 40)], { w: 4.2, h: 1.8 }), { facing: -1 });
  roadside(group, TAGS.tunelB + 60, -1, textPanel(['KARTAL TÜNELİ', 'Farları yakınız'], { w: 4.4, h: 1.7 }), { facing: -1 });
  // kilometre taşları
  for (let s = 500; s < LEN - 50; s += 500) {
    if (inTunnel(s) || onBridge(s)) continue;
    roadside(group, s, 1, textPanel([`km ${(s / 1000).toFixed(1).replace('.', ',')}`], { w: 0.9, h: 0.5, bg: '#ffffff', fg: '#111', border: null }), { off: RAIL + 0.7, posts: 1, h: 0.5 });
  }
}

// --- AĞAÇLAR ----------------------------------------------------------------------------------
export function buildTrees(group, groundAt, { count = 5200, skip = null, extra = [] } = {}) {
  const T = TERRAIN;
  const pine = [];
  const leaf = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const forestS = TAGS.orman;
  const fo = frameAt(forestS);
  let tries = 0;
  while (pine.length + leaf.length < count && tries < count * 9) {
    tries++;
    const x = T.x0 + 120 + rnd() * (T.x1 - T.x0 - 240);
    const z = T.z0 + 120 + rnd() * (T.z1 - T.z0 - 260);
    if (x > CITY_RECT.x0 - 30 && x < CITY_RECT.x1 + 30 && z > CITY_RECT.z0 - 30 && z < CITY_RECT.z1 + 30) continue;
    if (inTownRect(x, z, 14)) continue;
    const dens = fbm(x / 160, z / 160, 3) + (Math.hypot(x - fo.x, z - fo.z) < 380 ? 0.55 : 0) - 0.05;
    if (rnd() > dens * 1.6) continue;
    const n = nearest(x, z);
    if (n && n.dist < 13) continue;
    const h = groundAt(x, z);
    if (h < LAKE.y + 1.2 && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.5) continue;
    if (h < RIVER.y + 3 || h > 150 || (z > 60 && h < 1.5)) continue;
    if (x < shoreX(z) + 22 || h < 0.4) continue;
    if (skip && skip(x, z)) continue;
    const sl = Math.abs(groundAt(x + 3, z) - h) + Math.abs(groundAt(x, z + 3) - h);
    if (sl > 3.6) continue;
    const sc = 0.75 + rnd() * 0.7;
    const item = [x, h - 0.2, z, sc, rnd() * PI * 2, rnd()];
    (h > 45 || rnd() < 0.62 ? pine : leaf).push(item);
  }
  extra.forEach((t) => (t[6] === 'pine' ? pine : leaf).push(t.slice(0, 6)));
  const trunkM = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 0.9 });
  const pineM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true });
  const leafM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true });
  // çam: üst üste 3 koni
  const pg = mergeGeometries([0, 1, 2].map((k) => {
    const g = new THREE.ConeGeometry(2.6 - k * 0.6, 3.8, 7);
    g.translate(0, 2.6 + k * 2.1, 0);
    return g.toNonIndexed();
  }));
  const tg = new THREE.CylinderGeometry(0.22, 0.32, 2.6, 6);
  tg.translate(0, 1.3, 0);
  const lg = new THREE.IcosahedronGeometry(2.6, 0);
  lg.scale(1, 1.15, 1);
  lg.translate(0, 4.6, 0);
  const tg2 = new THREE.CylinderGeometry(0.25, 0.35, 3.4, 6);
  tg2.translate(0, 1.7, 0);
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const snowWhite = new THREE.Color('#eef3f6');
  const make = (list, fg, fm, tgeo, colors) => {
    const fi = new THREE.InstancedMesh(fg, fm, list.length);
    const ti = new THREE.InstancedMesh(tgeo, trunkM, list.length);
    list.forEach(([x, y, z, sc, r, c], i) => {
      q.setFromAxisAngle(up, r);
      mm.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc * (0.9 + c * 0.3), sc));
      fi.setMatrixAt(i, mm);
      ti.setMatrixAt(i, mm);
      col.set(colors[Math.floor(c * colors.length)]);
      const sn = snowK(x, z);
      if (sn > 0 && (c * 7.3) % 1 < 0.6 + sn * 0.3) col.lerp(snowWhite, sn * (fg === pg ? 0.55 : 0.3)); // karlı çam tepeleri
      fi.setColorAt(i, col);
    });
    fi.castShadow = true;
    fi.receiveShadow = true;
    group.add(fi, ti);
  };
  make(pine, pg, pineM, tg, ['#2f5a2a', '#3a6b30', '#284d26', '#41713a']);
  make(leaf, lg, leafM, tg2, ['#5d8f34', '#6c9c3a', '#7aa63f', '#c58a2a', '#4f8030']);
  return [...pine, ...leaf].map(([x, , z, sc]) => [x, z, sc]);
}

// --- uzak dağ silüeti (ufuk) -------------------------------------------------------------------
export function buildHorizon(group) {
  const pts = [];
  const cx = 1000;
  const cz = -1300;
  const N = 96;
  const m = new THREE.MeshBasicMaterial({ color: '#7f92a8', fog: false, side: THREE.DoubleSide });
  const pos = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * PI * 2;
    const r = 2900;
    let h = 220 + Math.abs(fbm(Math.cos(a) * 3, Math.sin(a) * 3, 4)) * 520;
    // deniz yönünde (batı + güney) ufuk açık
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    if (px < -300 || pz > 200) h = -60;
    pts.push([cx + Math.cos(a) * r, h, cz + Math.sin(a) * r]);
  }
  for (let i = 0; i < N; i++) {
    const [x0, h0, z0] = pts[i];
    const [x1, h1, z1] = pts[i + 1];
    pos.push(x0, -40, z0, x1, -40, z1, x0, h0, z0, x1, -40, z1, x1, h1, z1, x0, h0, z0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const o = new THREE.Mesh(g, m);
  o.renderOrder = -5;
  group.add(o);
  return o;
}

export { naturalH };
