// =============================================================================
// NEON KENT ORMANI — şehrin kuzeyindeki yeşil alan: orman, yürüyüş yolları, banklar, gölet,
// çocuk parkı, piknik alanı, çardak, spor aletleri, seyir tepesi, büfe. Yaban hayvanları
// (karaca, tilki, yaban domuzu, tavşan, sincap) ve gölette ördekler. Sadece yaya.
// Dünya koordinatı. Saf geometri (PARK, parkCarve, yollar) + 3B kurulum.
// =============================================================================
import * as THREE from 'three';
import { Kit, M, glowMat } from '../kit.js';
import { OUTER, PARK_GATES } from '../cityLayout.js';
import { shoreX } from '../coastShape.js';
import { terrainH } from './route.js';

const PI = Math.PI;
const ss = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const PARK = { x0: -136, x1: 236, z0: -372, z1: OUTER.z0 };
export const inPark = (x, z, m = 0) => x > PARK.x0 - m && x < PARK.x1 + m && z > PARK.z0 - m && z < PARK.z1 + m;
export const POND = { x: 98, z: -270, rx: 21, rz: 12 };
export const CLEAR = [
  { key: 'oyun', name: 'Çocuk Parkı', x: -30, z: -232, r: 12, glyph: 'ball' },
  { key: 'piknik', name: 'Piknik Alanı', x: -46, z: -306, r: 16, glyph: 'fork' },
  { key: 'spor', name: 'Açık Hava Spor', x: 168, z: -238, r: 9, glyph: 'dumbbell' },
  { key: 'tepe', name: 'Seyir Tepesi', x: 190, z: -336, r: 8, glyph: 'eye' },
  { key: 'bufe', name: 'Orman Büfesi', x: 34, z: -206, r: 9, glyph: 'cup' },
  { key: 'cardak', name: 'Çardak', x: 98, z: -248, r: 6, glyph: 'house' },
];

// --- yollar (dünya polyline) ------------------------------------------------------------
function catmull(pts, step = 2) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts.at(-1));
  return out;
}
export const PATHS = (() => {
  const L = [];
  // ana halka
  const ring = [];
  for (let i = 0; i <= 44; i++) {
    const a = (i / 44) * PI * 2;
    ring.push([40 + Math.cos(a) * (128 + 8 * Math.sin(a * 3)), -276 + Math.sin(a) * (56 + 6 * Math.cos(a * 2))]);
  }
  L.push(catmull(ring));
  // kapılardan halkaya
  PARK_GATES.forEach((g, i) => L.push(catmull([[g, OUTER.z0 - 1.2], [g + (i % 2 ? 4 : -4), OUTER.z0 - 12], [g * 0.82 + 7, -222 + (i % 2) * 3]])));
  // ortadan geçen yol (gölet kenarı) + tepeye çıkış + kumsala iniş
  L.push(catmull([[40, -221], [52, -246], [70, -262], [74, -292], [60, -318], [44, -331]]));
  L.push(catmull([[150, -320], [172, -330], [190, -336]]));
  L.push(catmull([[-86, -262], [-104, -258], [-118, -252], [-122, -250]]));
  L.push(catmull([[POND.x - POND.rx - 4, POND.z], [POND.x, POND.z + POND.rz + 4], [POND.x + POND.rx + 4, POND.z], [POND.x, POND.z - POND.rz - 4], [POND.x - POND.rx - 4, POND.z]]));
  return L;
})();
const PATH_HASH = (() => {
  const h = new Map();
  PATHS.forEach((pl) => pl.forEach(([x, z]) => {
    const k = `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
    if (!h.has(k)) h.set(k, []);
    h.get(k).push([x, z]);
  }));
  return h;
})();
export function pathDist(x, z) {
  let best = 99;
  const cx = Math.floor(x / 10);
  const cz = Math.floor(z / 10);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const arr = PATH_HASH.get(`${cx + a},${cz + b}`);
    if (arr) for (const [px, pz] of arr) best = Math.min(best, Math.hypot(px - x, pz - z));
  }
  return best;
}
const pondE = (x, z) => ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2;
export const inPond = (x, z, k = 1) => pondE(x, z) < k;

// arazi: park içinde engebe yumuşar, şehir kenarına doğru şehir seviyesine iner, gölet çanağı
function flat(x, z, h) {
  const d = Math.max(PARK.x0 - x, x - PARK.x1, PARK.z0 - z, z - PARK.z1, 0);
  const k = 1 - ss(0, 30, d);
  if (k <= 0 || x < shoreX(z) + 8) return h;
  let out = h * (1 - 0.55 * k);
  const e = ss(OUTER.z0 - 1, OUTER.z0 - 30, z); // şehir kenarında 0
  out = out * (1 - k * (1 - e)) + -0.15 * k * (1 - e);
  return out;
}
let pondLvl = null;
export function pondY() {
  if (pondLvl === null) {
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * PI * 2;
      const x = POND.x + Math.cos(a) * POND.rx * 1.2;
      const z = POND.z + Math.sin(a) * POND.rz * 1.2;
      sum += flat(x, z, terrainH(x, z));
    }
    pondLvl = sum / 16 - 0.25;
  }
  return pondLvl;
}
export function parkCarve(x, z, h) {
  let out = flat(x, z, h);
  const e = pondE(x, z);
  if (e < 1.8) {
    const lv = pondY();
    const rim = lv + 0.3;
    const bowl = lv - 1.6 * Math.max(0, 1 - e) + 0.25;
    const t = ss(1.0, 1.8, e);
    out = (Math.min(out, rim) * (1 - t) + out * t) * (e < 1 ? 0 : 1) + (e < 1 ? bowl : 0);
  }
  return out;
}

// --- 3B --------------------------------------------------------------------------------------
export function buildNorthPark(groundAt) {
  const root = new THREE.Group();
  root.name = 'neon_kent_ormani';
  const kit = new Kit('orman_park');
  root.add(kit.group);
  const y = (x, z) => groundAt(x, z);
  // yürüyüş yolları: araziye serilen şerit (stabilize toprak)
  const pathMat = new THREE.MeshStandardMaterial({ color: '#c9b38a', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#9a8a6a', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // yol şeridi: 1 m aralıkla, enine 5 nokta — arazinin üstüne tam oturur (kesik / havada kalma yok)
  const ribbon = (pl0, half, mat, yo) => {
    const pl = [];
    for (let i = 0; i < pl0.length - 1; i++) {
      const [ax, az] = pl0[i];
      const [bx, bz] = pl0[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az)));
      for (let k = 0; k < n; k++) pl.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pl.push(pl0.at(-1));
    const NC = 5;
    const pos = [];
    const idx = [];
    pl.forEach((p, i) => {
      const a = pl[Math.max(0, i - 1)];
      const c = pl[Math.min(pl.length - 1, i + 1)];
      let tx = c[0] - a[0];
      let tz = c[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      for (let k = 0; k < NC; k++) {
        const o = -half + (2 * half * k) / (NC - 1);
        const x = p[0] - tz * o;
        const z = p[1] + tx * o;
        pos.push(x, y(x, z) + yo, z);
      }
      if (i) {
        const b = (i - 1) * NC;
        for (let k = 0; k < NC - 1; k++) idx.push(b + k, b + k + 1, b + k + NC, b + k + 1, b + k + 1 + NC, b + k + NC);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    root.add(m);
  };
  PATHS.forEach((pl) => {
    ribbon(pl, 1.75, edgeMat, 0.05);
    ribbon(pl, 1.4, pathMat, 0.07);
  });
  // gölet
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: '#3f7f8f', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.9 }));
  water.scale.set(POND.rx * 1.02, POND.rz * 1.02, 1);
  water.rotation.x = -PI / 2;
  water.position.set(POND.x, pondY(), POND.z);
  root.add(water);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * PI * 2;
    const x = POND.x + Math.cos(a) * POND.rx * 1.05;
    const z = POND.z + Math.sin(a) * POND.rz * 1.05;
    if (i % 3) kit.mesh(new THREE.DodecahedronGeometry(0.5 + (i % 4) * 0.15, 0), M('#8a857a', 0.95), x, y(x, z) + 0.1, z, i);
    else for (let k = 0; k < 4; k++) kit.box(0.05, 1.1, 0.05, M('#5f7a34', 0.9), x + (k - 1.5) * 0.25, y(x, z), z + Math.sin(k) * 0.2, { cast: false }); // sazlık
  }
  // ahşap iskele (gölete)
  const dx = POND.x - POND.rx - 0.5;
  kit.box(7, 0.2, 2, M('#8a6a45', 0.85), dx + 2.6, pondY() + 0.15, POND.z);
  // banklar, lambalar, çöp kutuları (yollar boyunca)
  const benchAt = [];
  PATHS.forEach((pl, pi) => {
    for (let i = 6; i < pl.length - 4; i += 11) {
      const [x, z] = pl[i];
      const [nx, nz] = pl[i + 1];
      const yaw = Math.atan2(nx - x, nz - z);
      const side = (i + pi) % 2 ? 1 : -1;
      const ox = Math.cos(yaw) * 2.6 * side;
      const oz = -Math.sin(yaw) * 2.6 * side;
      const bx = x + ox;
      const bz = z + oz;
      if (inPond(bx, bz, 1.2)) continue;
      const k = (i / 11 + pi) % 3;
      if (k === 0) {
        const o = kit.item('parkbench', bx, bz, 0, 0, { y: y(bx, bz) });
        if (o) o.rotation.y = yaw + (side > 0 ? -PI / 2 : PI / 2);
        benchAt.push([bx, bz]);
      } else if (k === 1) kit.item('streetlamp', bx, bz, 0, 0, { y: y(bx, bz) });
      else kit.item('copkutusu', bx, bz, 0, 0, { y: y(bx, bz) });
    }
  });
  // giriş kemeri (ana kapı x = 20)
  {
    const gx = 20;
    const gz = OUTER.z0 - 5;
    const gy = y(gx, gz);
    const wood = M('#6b4a2e', 0.85);
    for (const s of [-1, 1]) kit.box(0.45, 4.2, 0.45, wood, gx + s * 3, gy, gz);
    kit.box(7.2, 0.7, 0.6, wood, gx, gy + 4.0, gz);
    kit.sign('ormangiris', 'NEON KENT ORMANI', 0.55, gx, gy + 4.35, gz + 0.32, 0, { color: '#fff6dc', bg: '#3f5a2a', font: '900 100px Georgia, serif', light: false });
    kit.sign('ormangiris2', 'NEON KENT ORMANI', 0.55, gx, gy + 4.35, gz - 0.32, PI, { color: '#fff6dc', bg: '#3f5a2a', font: '900 100px Georgia, serif', light: false });
    for (const s of [-1, 1]) kit.solid(gx + s * 3, gz, 0.25, 0.25);
    // bilgi panosu
    kit.box(0.12, 1.9, 2.4, M('#6b4a2e', 0.85), gx + 5.5, gy, gz - 2);
    kit.sign('ormanpano', 'Yürüyüş parkuru 1,1 km · Gölet · Seyir Tepesi', 0.22, gx + 5.43, gy + 1.5, gz - 2, -PI / 2, { color: '#ffffff', bg: '#2f4a22', font: '700 80px Arial, sans-serif', light: false });
  }
  // çocuk parkı
  {
    const c = CLEAR[0];
    const gy = y(c.x, c.z);
    kit.mesh(new THREE.CircleGeometry(c.r * 0.8, 24), M('#d9b98a', 0.95), c.x, gy + 0.08, c.z, 0, { rx: -PI / 2, cast: false });
    kit.item('salincak', c.x - 4, c.z - 2, 0, 0, { y: gy });
    kit.item('kaydirak', c.x + 4, c.z + 1, 2, 0, { y: gy });
    kit.item('parkbench', c.x, c.z + c.r * 0.8, 4, 0, { y: gy });
    kit.item('parkbench', c.x - 7, c.z + 6, 3, 0, { y: gy });
  }
  // piknik alanı: ahşap masalar + mangallar
  {
    const c = CLEAR[1];
    const wood = M('#8a6a45', 0.85);
    [[-6, -5], [6, -5], [-6, 5], [6, 5], [0, 0]].forEach(([ax, az], i) => {
      const x = c.x + ax;
      const z = c.z + az;
      const gy = y(x, z);
      kit.box(2.2, 0.08, 0.9, wood, x, gy + 0.74, z);
      kit.box(0.12, 0.74, 0.7, wood, x - 0.9, gy, z);
      kit.box(0.12, 0.74, 0.7, wood, x + 0.9, gy, z);
      for (const s of [-1, 1]) kit.box(2.2, 0.06, 0.3, wood, x, gy + 0.45, z + s * 0.75);
      kit.solid(x, z, 1.1, 0.9);
      if (i % 2 === 0) kit.item('mangal', x + 2.2, z, 0, 0, { y: gy });
    });
    kit.item('copkutusu', c.x + 10, c.z, 0, 0, { y: y(c.x + 10, c.z) });
  }
  // spor aletleri
  {
    const c = CLEAR[2];
    const gy = y(c.x, c.z);
    kit.item('pullup', c.x - 3, c.z, 0, 0, { y: gy });
    kit.item('pullup', c.x + 3, c.z, 0, 0, { y: gy });
    kit.item('parkbench', c.x, c.z + 5, 4, 0, { y: gy });
  }
  // seyir tepesi: ahşap teras + dürbün
  {
    const c = CLEAR[3];
    const gy = y(c.x, c.z);
    kit.box(8, 0.25, 6, M('#8a6a45', 0.85), c.x, gy + 0.3, c.z);
    kit.item('parkbench', c.x - 2, c.z - 1.5, 4, 0, { y: gy + 0.55 });
    kit.item('parkbench', c.x + 2, c.z - 1.5, 4, 0, { y: gy + 0.55 });
    kit.box(0.12, 1.1, 0.12, M('#2a2d33', 0.5, 0.6), c.x, gy + 0.55, c.z + 2.2);
    kit.cyl(0.12, 0.16, 0.6, M('#2a6fb5', 0.4, 0.6), c.x, gy + 1.8, c.z + 2.35, 10, { rx: PI / 2 });
  }
  // büfe
  {
    const c = CLEAR[4];
    const gy = y(c.x, c.z);
    kit.item('bufe', c.x, c.z - 3, 0, 0, { y: gy });
    for (const [ax, az] of [[-3, 2], [0, 3], [3, 2]]) kit.item('plastikmasa', c.x + ax, c.z + az, 0, 0, { y: y(c.x + ax, c.z + az) });
    kit.item('umbrella', c.x - 3, c.z + 2, 0, 3, { y: gy, solid: false });
    kit.item('umbrella', c.x + 3, c.z + 2, 0, 4, { y: gy, solid: false });
  }
  // çardak (gölete bakar)
  {
    const c = CLEAR[5];
    const gy = y(c.x, c.z);
    const wood = M('#7a5a3a', 0.85);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      kit.box(0.2, 2.6, 0.2, wood, c.x + Math.cos(a) * 2.6, gy, c.z + Math.sin(a) * 2.6);
      kit.solid(c.x + Math.cos(a) * 2.6, c.z + Math.sin(a) * 2.6, 0.15, 0.15);
    }
    kit.mesh(new THREE.ConeGeometry(3.6, 1.6, 6), M('#5a3d26', 0.8), c.x, gy + 3.4, c.z, PI / 6);
    kit.box(4, 0.15, 4, wood, c.x, gy + 0.05, c.z);
    kit.item('parkbench', c.x, c.z - 1.2, 0, 0, { y: gy + 0.2 });
  }
  // ağaçlar (yol / açıklık / gölet dışında sık orman)
  const trees = [];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 4200 && trees.length < 1300; i++) {
    const x = PARK.x0 + rnd() * (PARK.x1 - PARK.x0);
    const z = PARK.z0 + rnd() * (PARK.z1 - PARK.z0 - 8);
    if (x < shoreX(z) + 26) continue;
    if (pathDist(x, z) < 3.6) continue;
    if (inPond(x, z, 2.2)) continue;
    if (CLEAR.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 2)) continue;
    if (benchAt.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 2.5)) continue;
    if (z > OUTER.z0 - 8) continue;
    // çayırlık lekeler (orman kendini tekrar etmesin)
    const meadow = Math.sin(x * 0.045) * Math.cos(z * 0.06) > 0.55;
    if (meadow && rnd() < 0.85) continue;
    const sc = 0.7 + rnd() * 0.6;
    trees.push([x, y(x, z) - 0.15, z, sc, rnd() * PI * 2, rnd(), rnd() < 0.55 ? 'pine' : 'leaf']);
  }
  // kuş sesi yok; birkaç mantar / çalı
  for (let i = 0; i < 160; i++) {
    const x = PARK.x0 + rnd() * (PARK.x1 - PARK.x0);
    const z = PARK.z0 + rnd() * (PARK.z1 - PARK.z0 - 8);
    if (x < shoreX(z) + 26 || pathDist(x, z) < 2.8 || inPond(x, z, 1.6)) continue;
    kit.mesh(new THREE.IcosahedronGeometry(0.5 + rnd() * 0.5, 0), M(rnd() < 0.5 ? '#4f7a2e' : '#5e8a34', 0.9), x, y(x, z) + 0.25, z, rnd() * 3, { cast: true });
  }
  const pois = [
    { x: 20, z: OUTER.z0 - 8, name: 'Neon Kent Ormanı', glyph: 'tree', color: '#2f7a3a', big: true, key: 'orman' },
    { x: POND.x, z: POND.z, name: 'Gölet', glyph: 'eye', color: '#2a7ab8', key: 'golet' },
    ...CLEAR.map((c) => ({ x: c.x, z: c.z, name: c.name, glyph: c.glyph, color: '#2f7a3a', key: c.key, small: true })),
  ];
  // hayvan yerleri
  const wild = [];
  const spot = () => {
    for (let k = 0; k < 40; k++) {
      const x = PARK.x0 + 30 + rnd() * (PARK.x1 - PARK.x0 - 40);
      const z = PARK.z0 + 10 + rnd() * (PARK.z1 - PARK.z0 - 40);
      if (pathDist(x, z) > 6 && !inPond(x, z, 1.6) && x > shoreX(z) + 30) return [x, z];
    }
    return [40, -300];
  };
  [['karaca', 5], ['tilki', 2], ['domuz', 3], ['tavsan', 7], ['sincap', 6]].forEach(([k, n]) => {
    for (let i = 0; i < n; i++) wild.push({ kind: k, xz: spot(), v: i });
  });
  for (let i = 0; i < 5; i++) wild.push({ kind: 'ordek', xz: [POND.x + (rnd() - 0.5) * POND.rx, POND.z + (rnd() - 0.5) * POND.rz * 0.8], v: i, pond: true });
  // gece: yol lambaları kit.lights ile
  void glowMat;
  return { root, kits: [kit], trees, pois, wild };
}
