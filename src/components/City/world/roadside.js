// =============================================================================
// O-77 YOL ÜSTÜ — 3B içerik: benzinlikler (gidiş + dönüş), polis çevirmesi, karpuzcu,
// göl seyir cebi, Kervansaray dinlenme tesisi, emniyet cepleri, köylü tezgâhı, tır kantarı,
// mısırcı ve sapakla ayrılan iki köy (Gölyaka, Çamlıca).
// Her cep kendi grubunda, yerel eksende kurulur (+x yoldan dışarı). Oyunun Kit'i ve eşyaları.
// =============================================================================
import * as THREE from 'three';
import { Kit, M, glowMat, floorMat, floorRep } from '../kit.js';
import { buildVehicle } from '../vehicles.js';
import { ROAD_HALF, frameAt } from './route.js';
import { geo, fromPad, BR_HALF } from './roadsideGeo.js';

const PI = Math.PI;

// --- yardımcılar ---------------------------------------------------------------------------
// pad zemini: yol boyunca eğimli, enine düz ağ
function padGround(kit, p, x0, x1, z0, z1, matKey = 'asfalt', yOff = 0, step = 2) {
  const custom = typeof matKey !== 'string';
  const rep = custom ? 4 : floorRep(matKey);
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
  const nz = Math.max(2, Math.ceil((z1 - z0) / step) + 1);
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + ((x1 - x0) * i) / (nx - 1);
      const z = z0 + ((z1 - z0) * j) / (nz - 1);
      pos[k * 3] = x;
      pos[k * 3 + 1] = p.yAt(x, z) - p.y0 + yOff;
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / rep;
      uv[k * 2 + 1] = z / rep;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // yukarı baksın (ters sarım kontrolü)
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  const mat = custom ? matKey : floorMat(matKey).clone();
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  kit.add(m);
  return m;
}
const Yp = (p) => (x, z) => p.yAt(x, z) - p.y0; // pad grubuna göre yerel y
function lineMark(kit, p, x0, z0, x1, z1, color = '#f2f2f2', w = 0.14) {
  const y = Yp(p);
  const L = Math.hypot(x1 - x0, z1 - z0);
  const o = kit.box(L, 0.02, w, M(color, 0.6), (x0 + x1) / 2, y((x0 + x1) / 2, (z0 + z1) / 2) + 0.01, (z0 + z1) / 2, { cast: false, ry: -Math.atan2(z1 - z0, x1 - x0) });
  o.renderOrder = 1;
  return o;
}
function curb(kit, p, x0, z0, x1, z1, h = 0.18) {
  const y = Yp(p);
  const L = Math.hypot(x1 - x0, z1 - z0);
  kit.box(L, h, 0.3, M('#b8b2a6', 0.85), (x0 + x1) / 2, y((x0 + x1) / 2, (z0 + z1) / 2) - 0.02, (z0 + z1) / 2, { ry: -Math.atan2(z1 - z0, x1 - x0) });
}
function island(kit, p, x, z0, z1, w = 1.6) {
  const y = Yp(p);
  const L = z1 - z0;
  kit.box(w, 0.18, L, M('#b8b2a6', 0.85), x, y(x, (z0 + z1) / 2) - 0.02, (z0 + z1) / 2);
  kit.box(w - 0.3, 0.05, L - 0.3, M('#4f7a34', 0.95), x, y(x, (z0 + z1) / 2) + 0.16, (z0 + z1) / 2, { cast: false });
  kit.solid(x, (z0 + z1) / 2, w / 2, L / 2);
  kit.solids.at(-1).car = true;
}
// dürbün: ayak + çatal + gövde (gövde ayağın tepesine oturur)
function binocular(kit, x, y, z, ry = 0) {
  const dark = M('#2a2d33', 0.5, 0.6);
  kit.cyl(0.07, 0.09, 1.15, dark, x, y, z, 10);
  kit.box(0.26, 0.08, 0.14, dark, x, y + 1.15, z, { ry });
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  // gövde yatay, bakış yönü (ry) boyunca; merkez çatalın hemen üstünde
  for (const sd of [-0.09, 0.09]) {
    const ox = Math.cos(ry) * sd;
    const oz = -Math.sin(ry) * sd;
    const b = kit.cyl(0.075, 0.09, 0.42, M('#2a6fb5', 0.4, 0.6), x + ox, y + 1.33 - 0.21, z + oz, 12, { rx: PI / 2, ry });
    b.rotation.order = 'YXZ';
  }
  kit.box(0.08, 0.14, 0.1, dark, x - fx * 0.2, y + 1.27, z - fz * 0.2, { ry });
  kit.solid(x, z, 0.12, 0.12);
}
function signPost(kit, key, text, x, y, z, ry, { h = 0.9, bg = '#1d4f9a', color = '#ffffff', pole = 3.2, glow = null } = {}) {
  kit.box(0.14, pole, 0.14, M('#9aa0a8', 0.4, 0.7), x, y, z);
  const s = kit.sign(key, text, h, x, y + pole + h / 2 - 0.1, z + 0.09 * Math.cos(ry), ry, { color, bg, font: '900 100px Arial, sans-serif', light: Boolean(glow), glow });
  kit.solid(x, z, 0.12, 0.12);
  return s;
}
function building(kit, x, y, z, w, h, d, { wall = '#efe9dc', roof = '#3a3f47', glass = true, ry = 0 } = {}) {
  kit.box(w, h, d, M(wall, 0.75), x, y, z, { ry });
  kit.box(w + 0.6, 0.35, d + 0.6, M(roof, 0.6), x, y + h, z, { ry });
  if (glass) {
    const g = kit.box(w * 0.86, h * 0.45, 0.06, M('#9fc7d9', 0.08, 0.4), x - Math.sin(ry) * 0, y + h * 0.22, z, { ry, cast: false });
    g.position.x += Math.cos(ry) * 0 - Math.sin(ry) * 0;
    // camı ön yüze taşı (yerel −x yüzü yola bakar)
    const fx = -Math.cos(ry) * (w / 2 + 0.04);
    const fz = Math.sin(ry) * (w / 2 + 0.04);
    g.rotation.y = ry + PI / 2;
    g.position.set(x + fx, y + h * 0.22 + (h * 0.45) / 2, z + fz);
    g.scale.set(d / w, 1, 1);
  }
  kit.mass(Math.abs(Math.cos(ry)) > 0.5 ? w : d, h, Math.abs(Math.cos(ry)) > 0.5 ? d : w, x, z, y);
}
// sıcak ışıklı direk lamba (otoyol tipi)
function lampPost(kit, x, y, z, ry = 0) {
  const m = M('#8d939b', 0.4, 0.7);
  kit.box(0.18, 8, 0.18, m, x, y, z);
  kit.box(1.8, 0.12, 0.12, m, x - Math.cos(ry) * 0.9, y + 7.9, z + Math.sin(ry) * 0.9, { ry });
  kit.box(0.6, 0.12, 0.3, glowMat('#ffe2b0', 1.6), x - Math.cos(ry) * 1.7, y + 7.78, z + Math.sin(ry) * 1.7, { ry, cast: false });
  kit.light(x - Math.cos(ry) * 1.7, y + 7.4, z + Math.sin(ry) * 1.7, '#ffd9a0', 8, 18);
  kit.solid(x, z, 0.15, 0.15);
}
function parkVehicle(kit, id, x, y, z, yaw, mods = null) {
  const v = buildVehicle(id, mods);
  v.root.position.set(x, y, z);
  v.root.rotation.y = yaw;
  if (v.trailer) {
    v.trailer.pivot.visible = true;
    v.trailerOn = true;
  }
  v.root.traverse((o) => o.isMesh && (o.castShadow = true));
  kit.add(v.root);
  const L = (v.len || 4.5) + (v.trailer ? v.trailer.length : 0);
  const hw = (v.halfW || 1) + 0.1;
  // gövde katısı (yerel → dönük kutu)
  const back = v.trailer ? v.trailer.length / 2 : 0;
  kit.solid(x - Math.sin(yaw) * back, z - Math.cos(yaw) * back, hw, L / 2, yaw);
  return v;
}
function crate(kit, x, y, z, color = '#9b7a52', s = 0.6) {
  kit.box(s, s * 0.6, s * 0.8, M(color, 0.8), x, y, z);
}
// --- low-poly hayvanlar / meyveler ---------------------------------------------------------
function cow(kit, x, y, z, ry, spotted = true) {
  const g = new THREE.Group();
  const body = M(spotted ? '#f2f0ea' : '#7a4a2a', 0.8);
  const dark = M('#1d1d1d', 0.8);
  const add = (geo, m, px, py, pz) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(px, py, pz);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(1.7, 0.85, 0.75), body, 0, 1.05, 0);
  if (spotted) {
    add(new THREE.BoxGeometry(0.6, 0.5, 0.77), dark, -0.3, 1.15, 0);
    add(new THREE.BoxGeometry(0.4, 0.4, 0.77), dark, 0.45, 0.95, 0);
  }
  add(new THREE.BoxGeometry(0.5, 0.45, 0.42), spotted ? dark : body, 1.0, 1.25, 0);
  add(new THREE.BoxGeometry(0.22, 0.22, 0.36), M('#e8b0a0', 0.7), 1.28, 1.12, 0);
  for (const [lx, lz] of [[-0.62, -0.25], [-0.62, 0.25], [0.62, -0.25], [0.62, 0.25]]) add(new THREE.BoxGeometry(0.16, 0.65, 0.16), body, lx, 0.32, lz);
  for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.05, 0.2, 5), M('#e8e2d0', 0.6), 1.05, 1.55, s * 0.16);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  kit.add(g);
  kit.solid(x, z, 0.9, 0.45, ry);
}
function sheep(kit, x, y, z, ry) {
  const g = new THREE.Group();
  const wool = M('#f4f1e6', 0.95);
  const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), wool);
  o.scale.set(1.3, 0.85, 0.9);
  o.position.y = 0.72;
  o.castShadow = true;
  g.add(o);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.26), M('#2a2420', 0.8));
  h.position.set(0.66, 0.85, 0);
  g.add(h);
  for (const [lx, lz] of [[-0.3, -0.18], [-0.3, 0.18], [0.3, -0.18], [0.3, 0.18]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.45, 0.09), M('#2a2420', 0.8));
    l.position.set(lx, 0.22, lz);
    g.add(l);
  }
  g.position.set(x, y, z);
  g.rotation.y = ry;
  kit.add(g);
}
const melonGeo = new THREE.SphereGeometry(0.24, 10, 8);
let melonMat = null;
function melons(kit, x, y, z, n, spread = 1) {
  if (!melonMat) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#2f6b2a';
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#5e9a3c';
    for (let i = 0; i < 8; i++) g.fillRect(i * 8, 0, 3, 32);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    melonMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  }
  const im = new THREE.InstancedMesh(melonGeo, melonMat, n);
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let seed = Math.floor(x * 13 + z * 7) + 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / 12);
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, 0));
    const sc = 0.85 + r() * 0.4;
    mm.compose(new THREE.Vector3(x + (r() - 0.5) * spread * 1.6, y + 0.2 + layer * 0.3, z + (r() - 0.5) * spread), q, new THREE.Vector3(sc * 1.25, sc, sc));
    im.setMatrixAt(i, mm);
  }
  im.castShadow = true;
  kit.add(im);
}
// köy evi (beşik çatılı)
function prism(w, d, h) {
  const g = new THREE.BufferGeometry();
  const x = w / 2;
  const z = d / 2;
  const v = [
    -x, 0, -z, x, 0, -z, 0, h, -z, // ön üçgen
    x, 0, z, -x, 0, z, 0, h, z, // arka üçgen
    -x, 0, -z, 0, h, -z, 0, h, z, -x, 0, -z, 0, h, z, -x, 0, z, // sol eğim
    x, 0, -z, x, 0, z, 0, h, z, x, 0, -z, 0, h, z, 0, h, -z, // sağ eğim
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
function house(kit, x, y, z, ry, { w = 8, d = 7, floors = 1, wall = '#f3eee2', roof = '#b5523a', seed = 0 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  kit.group.add(g);
  const H = floors * 3 + 0.3;
  const add = (geo, m, px, py, pz, ryy = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(px, py, pz);
    o.rotation.y = ryy;
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(w, H, d), M(wall, 0.85), 0, H / 2, 0);
  add(new THREE.BoxGeometry(w + 0.2, 0.45, d + 0.2), M('#9a8f80', 0.9), 0, 0.22, 0); // subasman
  const roofG = prism(w + 1.0, d + 1.0, 2.2);
  add(roofG, M(roof, 0.8), 0, H, 0, 0).material.side = THREE.DoubleSide;
  add(new THREE.BoxGeometry(0.6, 1.4, 0.6), M('#8f857a', 0.9), w * 0.25, H + 1.4, d * 0.15);
  const winM = M('#2a3440', 0.2, 0.3);
  const frameM = M('#ffffff', 0.6);
  for (let f = 0; f < floors; f++) {
    const wy = 1.0 + f * 3;
    for (const wx of [-w * 0.3, w * 0.3]) {
      add(new THREE.BoxGeometry(1.2, 1.3, 0.08), frameM, wx, wy + 0.65, d / 2 + 0.01);
      add(new THREE.BoxGeometry(1.0, 1.1, 0.1), winM, wx, wy + 0.65, d / 2 + 0.02);
      add(new THREE.BoxGeometry(1.0, 1.1, 0.1), winM, wx, wy + 0.65, -d / 2 - 0.02);
    }
    add(new THREE.BoxGeometry(0.1, 1.1, 1.0), winM, w / 2 + 0.02, wy + 0.65, 0);
    add(new THREE.BoxGeometry(0.1, 1.1, 1.0), winM, -w / 2 - 0.02, wy + 0.65, 0);
  }
  add(new THREE.BoxGeometry(1.1, 2.1, 0.1), M(seed % 2 ? '#6b3f22' : '#2f5f8a', 0.6), 0, 1.05 + 0.2, d / 2 + 0.03);
  if (floors > 1) {
    add(new THREE.BoxGeometry(w * 0.5, 0.15, 1.2), M('#d8d2c4', 0.8), 0, 3.15, d / 2 + 0.6);
    add(new THREE.BoxGeometry(w * 0.5, 0.9, 0.06), M('#3a3f47', 0.5, 0.5), 0, 3.6, d / 2 + 1.2);
  }
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  kit.solid(x, z, (Math.abs(c) > 0.5 ? w : d) / 2, (Math.abs(c) > 0.5 ? d : w) / 2);
  kit.blocker(Math.abs(c) > 0.5 ? w : d, H + 2, Math.abs(c) > 0.5 ? d : w, x, y, z);
  void s;
}
function minaretMosque(kit, x, y, z, ry, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  kit.group.add(g);
  const wall = M('#f2efe6', 0.7);
  const lead = M('#7d8790', 0.4, 0.6);
  const add = (geo, m, px, py, pz) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(px, py, pz);
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(9, 5, 9), wall, 0, 2.5, 0);
  add(new THREE.CylinderGeometry(3.6, 3.8, 1, 16), wall, 0, 5.5, 0);
  add(new THREE.SphereGeometry(3.6, 18, 10, 0, PI * 2, 0, PI / 2), lead, 0, 6, 0);
  add(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), M('#d4af37', 0.3, 0.9), 0, 10.2, 0);
  add(new THREE.CylinderGeometry(0.6, 0.7, 14, 10), wall, 5.4, 7, -3.4);
  add(new THREE.CylinderGeometry(0.95, 0.95, 0.35, 12), wall, 5.4, 11.4, -3.4);
  add(new THREE.ConeGeometry(0.62, 3.2, 10), lead, 5.4, 15.6, -3.4);
  add(new THREE.BoxGeometry(2.2, 2.6, 0.1), M('#6b3f22', 0.6), 0, 1.3, 4.52);
  for (const wx of [-3, 3]) add(new THREE.BoxGeometry(1, 2, 0.1), M('#2a3440', 0.2, 0.3), wx, 2.6, 4.52);
  kit.solid(x, z, 4.6 * s, 4.6 * s, ry);
  kit.solid(x + (Math.cos(ry) * 5.4 + Math.sin(ry) * -3.4) * s, z + (-Math.sin(ry) * 5.4 + Math.cos(ry) * -3.4) * s, 0.8, 0.8);
}
function bigTree(kit, x, y, z, s = 1) {
  const g = new THREE.Group();
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.55 * s, 4 * s, 8), M('#5a3d26', 0.9));
  tr.position.y = 2 * s;
  tr.castShadow = true;
  g.add(tr);
  const lm = M('#3f7a34', 0.85);
  for (const [px, py, pz, r] of [[0, 5.5, 0, 3.2], [1.8, 5, 0.8, 2.2], [-1.6, 5.2, -0.6, 2.4], [0.4, 6.8, -0.4, 2.1]]) {
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), lm);
    o.position.set(px * s, py * s, pz * s);
    o.castShadow = true;
    g.add(o);
  }
  g.position.set(x, y, z);
  kit.add(g);
  kit.solid(x, z, 0.5 * s, 0.5 * s);
}
function fenceRun(kit, x0, z0, x1, z1, y) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(L / 2));
  const ry = Math.atan2(x1 - x0, z1 - z0) - PI / 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    kit.item('fence', x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0, 0, { y, solid: false }).rotation.y = ry;
  }
  kit.solid((x0 + x1) / 2, (z0 + z1) / 2, L / 2, 0.08, ry);
}

// --- CEP İÇERİKLERİ ---------------------------------------------------------------------------
// her biri: (kit, p, ctx) → zones (yerel): [{ x, z, r, acts: [{ id, label }], truck?: true }]
const B = {};

B.benzin = (kit, p, ctx) => {
  const y = Yp(p);
  const X0 = ROAD_HALF - 1.6;
  padGround(kit, p, X0, p.x1, p.z0, p.z1, 'asfalt');
  // yol ile istasyon arası ada (giriş/çıkış uçlarda)
  island(kit, p, ROAD_HALF + 2.2, p.z0 + 16, p.z1 - 16);
  curb(kit, p, p.x1, p.z0, p.x1, p.z1);
  curb(kit, p, ROAD_HALF + 1.2, p.z0, p.x1, p.z0);
  curb(kit, p, ROAD_HALF + 1.2, p.z1, p.x1, p.z1);
  // sundurma (tır geçer: 6,2 m)
  const cx = 17.5;
  const cw = 15;
  const cl = 30;
  const top = 6.2;
  const yc = y(cx, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.box(0.5, top, 0.5, M('#e9edf2', 0.4, 0.4), cx + sx * 4.2, yc, sz * 11);
    kit.solid(cx + sx * 4.2, sz * 11, 0.3, 0.3);
  }
  kit.box(cw, 1.0, cl, M('#f4f6f8', 0.4, 0.3), cx, yc + top, 0);
  kit.box(cw + 0.1, 0.32, cl + 0.1, glowMat('#ff2d8a', 1.4), cx, yc + top + 0.2, 0, { cast: false });
  for (let z = -12; z <= 12; z += 4) kit.box(1.4, 0.06, 0.5, glowMat('#fff6e0', 2.2), cx, yc + top - 0.05, z, { cast: false });
  kit.light(cx, yc + top - 0.6, -6, '#fff6e0', 10, 20);
  kit.light(cx, yc + top - 0.6, 6, '#fff6e0', 10, 20);
  kit.sign(`${p.key}_canopy`, 'NEON PETROL', 0.72, cx - cw / 2 - 0.06, yc + top + 0.5, 0, -PI / 2, { color: '#ffffff', glow: '#ff2d8a', font: '900 110px Arial, sans-serif', light: false });
  // pompa adaları (yol boyunca) — dış: otomobil, iç: TIR (motorin)
  for (const ix of [cx - 4.2, cx + 4.2]) {
    kit.box(1.2, 0.2, 12, M('#c9ccd2', 0.7), ix, y(ix, 0) - 0.04, 0);
    for (const iz of [-3.5, 3.5]) kit.item('pump', ix, iz, ix < cx ? 2 : 6, 0, { y: y(ix, iz) + 0.16 });
    kit.solid(ix, 0, 0.6, 6);
  }
  kit.sign(`${p.key}_tir`, 'TIR · MOTORİN', 0.42, cx - 4.2, yc + 3.4, -6.6, -PI / 2, { color: '#06202a', bg: '#ffd23f', font: '900 100px Arial, sans-serif', light: false });
  // market + WC (istasyonun arkası)
  const mx = p.x1 - 5;
  building(kit, mx, y(mx, 6), 6, 8, 4.2, 18, { wall: '#f4f2ec', roof: '#1d2128' });
  kit.sign(`${p.key}_market`, 'MARKET 7/24', 0.7, mx - 4.08, y(mx, 6) + 3.4, 6, -PI / 2, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', li: 5, ld: 9 });
  kit.item('door_market', mx - 4.05, 2, 6, 0, { y: y(mx, 2), solid: false });
  building(kit, mx, y(mx, -12), -12, 6, 3.2, 6, { wall: '#d9e3ea', roof: '#1d2128', glass: false });
  kit.sign(`${p.key}_wc`, 'WC · MESCİT', 0.4, mx - 3.06, y(mx, -12) + 2.5, -12, -PI / 2, { color: '#ffffff', bg: '#1d4f9a', font: '900 100px Arial, sans-serif', light: false });
  kit.item('airpump', mx - 5.6, -4, 2, 0, { y: y(mx - 5.6, -4) });
  kit.item('trash', mx - 5.3, 15, 0, 0, { y: y(mx - 5.3, 15) });
  // fiyat totemi (yoldan görünsün)
  const tx = ROAD_HALF + 4;
  const tz = p.z1 - 8;
  const ty = y(tx, tz);
  kit.box(0.5, 6, 2.6, M('#14161b', 0.5, 0.5), tx, ty, tz);
  kit.sign(`${p.key}_tot`, 'NEON', 0.7, tx - 0.27, ty + 5.2, tz, -PI / 2, { color: '#ffffff', glow: '#ff2d8a', font: '900 110px Arial, sans-serif', light: false });
  [['BENZİN', '44,90'], ['MOTORİN', '46,10'], ['LPG', '24,70']].forEach(([a, b], i) => kit.sign(`${p.key}_tp${i}`, `${a}  ${b}`, 0.42, tx - 0.27, ty + 4.1 - i * 0.62, tz, -PI / 2, { color: '#ffd23f', bg: '#0c0d10', font: '900 90px Arial, sans-serif', light: false }));
  kit.solid(tx, tz, 0.4, 1.4);
  // park etmiş araçlar
  parkVehicle(kit, 5, mx - 9, y(mx - 9, 13), 13, PI / 2);
  parkVehicle(kit, 2, mx - 9, y(mx - 9, 16.5), 16.5, PI / 2);
  for (const [x, z] of [[p.x1 - 1.2, p.z0 + 4], [p.x1 - 1.2, p.z1 - 4], [mx - 6, -20]]) lampPost(kit, x, y(x, z), z, 0);
  ctx.npc.push({ x: cx - 2.4, z: 2.5, name: 'Pompacı', av: { clothing: 'jacket', clothColor: '#ff2d8a', hat: 'cap', hatColor: '#14161b', pantsColor: '#2b3550' }, lines: ['Depoyu dolduralım mı abi?', 'Camları da silelim.', 'Motorin tarafı içeride, tır şeridi.'] });
  return [{ x: cx, z: 0, r: 9, acts: [{ id: 'yakit', label: '⛽ Depoyu doldur' }], truck: true, foot: true }, { x: mx - 4.6, z: 6, r: 3, acts: [{ id: 'market', label: '🛒 Su + simit al' }], foot: true }];
};

B.polis = (kit, p, ctx) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'asfalt');
  curb(kit, p, p.x1, p.z0, p.x1, p.z1);
  // koniler: cep girişini işaretleyen huni
  for (let i = 0; i < 8; i++) {
    const z = p.z1 - 2 - i * 2.4;
    const x = ROAD_HALF + 0.2 + Math.max(0, 6 - i) * 0.0;
    kit.item('cone', x, z, 0, 0, { y: y(x, z), solid: false });
  }
  for (let i = 0; i < 6; i++) kit.item('cone', ROAD_HALF + 0.2, p.z0 + 2 + i * 2.4, 0, 0, { y: y(ROAD_HALF, p.z0 + 2 + i * 2.4), solid: false });
  // iki polis aracı + bariyer + çadır
  parkVehicle(kit, 14, 9.8, y(9.8, -12), -12, p.dirS > 0 ? 0 : PI);
  parkVehicle(kit, 14, 9.8, y(9.8, 14), 14, p.dirS > 0 ? 0.1 : PI + 0.1);
  const tx = p.x1 - 2.4;
  kit.item('tent', tx, 0, 2, 0, { y: y(tx, 0) });
  kit.item('plastikmasa', tx - 1.6, 4, 0, 0, { y: y(tx, 4) });
  kit.item('plastiktabure', tx - 1.6, 5.2, 0, 0, { y: y(tx, 5) });
  // tabelalar
  const sz = p.z1 * (p.dirS > 0 ? 1 : -1);
  void sz;
  signPost(kit, `${p.key}_dur`, 'DUR · POLİS', ROAD_HALF + 1.6, y(ROAD_HALF, 0), 0, -PI / 2, { bg: '#d0302a', h: 0.8, pole: 2.4 });
  // ışıklı tepe (gece)
  kit.light(9.8, 2.2, -12, '#3a6bff', 6, 10);
  kit.light(9.8, 2.2, 14, '#ff3a3a', 6, 10);
  ctx.npc.push({ x: ROAD_HALF + 2.6, z: 4, name: 'Polis Memuru', av: { clothing: 'jacket', clothColor: '#16307a', hat: 'cap', hatColor: '#16307a', pantsColor: '#1b2340' }, lines: ['Ehliyet ruhsat lütfen.', 'Yavaşlayın, cebe girin!', 'Takograf kayıtları?'] });
  ctx.npc.push({ x: tx - 1.4, z: 3, name: 'Komiser', av: { clothing: 'jacket', clothColor: '#16307a', hat: 'cap', hatColor: '#0f1d4a', pantsColor: '#1b2340' }, lines: ['Hız sınırı 50, unutma.', 'İyi yolculuklar.'] });
  return [{ x: 9, z: 0, r: 26, acts: [], truck: true, polis: true }];
};

B.karpuz = (kit, p, ctx) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'cakil');
  const px = 11;
  const pv = parkVehicle(kit, 3, px, y(px, -2), -2, p.dirS > 0 ? PI : 0);
  void pv;
  melons(kit, px + 0.1, y(px, -4) + 0.85, -4.2, 40, 1.1);
  melons(kit, px - 3.3, y(px - 3, 5), 5, 30, 1.6);
  kit.item('umbrella', px - 3.4, 5, 0, 1, { y: y(px - 3.4, 5), solid: false });
  kit.item('plastikmasa', px - 3.6, 8.2, 0, 0, { y: y(px - 3.6, 8.2) });
  kit.item('plastiktabure', px - 2.4, 8.6, 0, 0, { y: y(px, 8.6) });
  for (let i = 0; i < 3; i++) crate(kit, px - 1.8, y(px, 9) + i * 0.36, 10.2, '#a57b4a');
  signPost(kit, `${p.key}_s`, 'KARPUZ · KAVUN 🍉', ROAD_HALF + 2.2, y(ROAD_HALF, p.z1 - 3), p.z1 - 3, -PI / 2, { bg: '#2f8f4a', h: 0.7, pole: 2.0 });
  ctx.npc.push({ x: px - 2.2, z: 7.4, name: 'Karpuzcu Ramazan', av: { clothing: 'tshirt', clothColor: '#e8e2d0', hat: 'cap', hatColor: '#2f8f4a', pantsColor: '#3a3226', facialHair: 'mustache' }, lines: ['Kesmece karpuz abi! Diyarbakır malı!', 'Bal gibi, kesip vereyim mi?', 'Kavun da var, kokusuna bak!'] });
  return [{ x: px - 2.5, z: 6.5, r: 4, acts: [{ id: 'karpuz', label: '🍉 Karpuz al · ₺60' }], foot: true }, { x: px, z: 0, r: 10, acts: [{ id: 'karpuz', label: '🍉 Karpuz al · ₺60' }], truck: true }];
};

B.seyir = (kit, p, ctx) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'asfalt');
  curb(kit, p, p.x1, p.z0, p.x1, p.z1);
  for (let z = p.z0 + 3; z < p.z1 - 2; z += 2) kit.item('korkuluk', p.x1 - 0.4, z, 2, 0, { y: y(p.x1, z), solid: false });
  kit.item('parkbench', p.x1 - 2.2, -6, 6, 0, { y: y(p.x1, -6) });
  kit.item('parkbench', p.x1 - 2.2, 6, 6, 0, { y: y(p.x1, 6) });
  kit.item('copkutusu', p.x1 - 1.6, 0, 0, 0, { y: y(p.x1, 0) });
  // dürbün + bilgi panosu
  const bx = p.x1 - 1.4;
  binocular(kit, bx, y(bx, 12), 12, PI / 2);
  kit.box(0.12, 1.8, 2.4, M('#6b5434', 0.8), bx, y(bx, -12), -12);
  kit.sign(`${p.key}_info`, 'KUĞU GÖLÜ · 1,2 km²', 0.32, bx - 0.08, y(bx, -12) + 1.5, -12, -PI / 2, { color: '#ffffff', bg: '#2f5f3a', font: '800 90px Arial, sans-serif', light: false });
  signPost(kit, `${p.key}_p`, 'P · SEYİR', ROAD_HALF + 1.8, y(ROAD_HALF, p.z1 - 4), p.z1 - 4, -PI / 2, { bg: '#1d4f9a', h: 0.7, pole: 2.2 });
  ctx.npc.push({ x: p.x1 - 2.6, z: 4, name: 'Fotoğrafçı', av: { clothing: 'hoodie', clothColor: '#7a8f3a', pantsColor: '#2b3550' }, lines: ['Gün batımında kuğular çok güzel.', 'Şu manzaraya bak!'] });
  return [{ x: p.x1 - 2.5, z: 0, r: 6, acts: [{ id: 'mola', label: '📸 Manzaraya bak' }], foot: true }, { x: 7, z: 0, r: 16, acts: [{ id: 'mola', label: '☕ Mola ver' }], truck: true }];
};

B.cep = (kit, p) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'asfalt');
  curb(kit, p, p.x1, p.z0, p.x1, p.z1);
  lineMark(kit, p, ROAD_HALF + 0.3, p.z0 + 6, ROAD_HALF + 0.3, p.z1 - 6, '#f2f2f2', 0.18);
  signPost(kit, `${p.key}_p`, 'P · EMNİYET CEBİ', p.x1 - 0.6, y(p.x1, p.z1 - 4), p.z1 - 4, -PI / 2, { bg: '#1d4f9a', h: 0.6, pole: 2.4 });
  // SOS telefonu
  const sx = p.x1 - 0.5;
  kit.box(0.4, 1.5, 0.35, M('#ff7a1a', 0.5), sx, y(sx, 0), 0);
  kit.sign(`${p.key}_sos`, 'SOS', 0.18, sx - 0.21, y(sx, 0) + 1.15, 0, -PI / 2, { color: '#ffffff', font: '900 100px Arial, sans-serif', light: false });
  kit.item('copkutusu', p.x1 - 0.6, -8, 0, 0, { y: y(p.x1, -8) });
  return [{ x: ROAD_HALF + 2.5, z: 0, r: 20, acts: [{ id: 'mola', label: '😴 15 dk mola' }], truck: true }, { x: sx - 0.6, z: 0, r: 1.6, acts: [{ id: 'sos', label: '📞 Yol yardım' }], foot: true }];
};

B.bal = (kit, p, ctx) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'asfalt');
  const sx = 9.5;
  const sy = y(sx, 0);
  // ahşap tezgâh + saçak
  const wood = M('#8a6a45', 0.85);
  kit.box(2, 0.95, 7, wood, sx, sy, 0);
  for (const [dx, dz] of [[-1, -3.4], [-1, 3.4], [1.4, -3.4], [1.4, 3.4]]) kit.box(0.14, 2.6, 0.14, wood, sx + dx, sy, dz);
  kit.box(3.4, 0.12, 7.6, M('#c9a46a', 0.95), sx + 0.2, sy + 2.6, 0);
  // kavanozlar (bal), peynir tekerleri
  const jarM = M('#e7a51c', 0.25, 0.1);
  for (let i = 0; i < 14; i++) kit.cyl(0.09, 0.09, 0.2, jarM, sx - 0.5 + (i % 2) * 0.3, sy + 0.95, -3 + i * 0.42, 8, { cast: false });
  for (let i = 0; i < 4; i++) kit.cyl(0.26, 0.26, 0.16, M('#f2e6b8', 0.6), sx + 0.3, sy + 0.95, 1.2 + i * 0.6, 14, { cast: false });
  for (let i = 0; i < 3; i++) crate(kit, sx + 1.8, sy + i * 0.36, -2 + i * 0.1, '#9b7a52');
  kit.solid(sx, 0, 1.1, 3.6);
  signPost(kit, `${p.key}_s`, 'BAL · PEYNİR · YUMURTA', ROAD_HALF + 2, y(ROAD_HALF, p.z1 - 3), p.z1 - 3, -PI / 2, { bg: '#8a5a1a', h: 0.6, pole: 2.0 });
  kit.item('tractor', p.x1 - 3.5, -9, 2, 0, { y: y(p.x1, -9) });
  ctx.npc.push({ x: sx + 1.4, z: 1.5, name: 'Ayşe Teyze', av: { gender: 'f', clothing: 'dress', clothColor: '#b0503a', hat: 'scarf', hatColor: '#f2e6b8', pantsColor: '#3a3226' }, lines: ['Süzme çiçek balı, kendi kovanımız!', 'Tulum peyniri de var evladım.', 'Köy yumurtası, sabah topladım.'] });
  return [{ x: sx - 1.4, z: 0, r: 3.4, acts: [{ id: 'bal', label: '🍯 Bal al · ₺250' }, { id: 'peynir', label: '🧀 Peynir al · ₺180' }], foot: true }, { x: 6, z: 0, r: 12, acts: [{ id: 'bal', label: '🍯 Bal al · ₺250' }], truck: true }];
};

B.kantar = (kit, p, ctx) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'asfalt');
  curb(kit, p, p.x1, p.z0, p.x1, p.z1);
  // tartı platformu (çelik)
  const kx = 11.5;
  const plat = kit.box(4.2, 0.08, 24, M('#6d737b', 0.35, 0.8), kx, y(kx, 0) - 0.02, 0, { cast: false });
  plat.renderOrder = 1;
  for (let z = -11; z <= 11; z += 2) kit.box(4.2, 0.09, 0.06, M('#3a3f47', 0.5, 0.7), kx, y(kx, z) - 0.02, z, { cast: false });
  for (const s of [-1, 1]) kit.box(0.2, 0.1, 24, M('#ffd23f', 0.5), kx + s * 2.2, y(kx, 0) - 0.02, 0, { cast: false });
  // kulübe
  const bx = p.x1 - 3;
  building(kit, bx, y(bx, 0), 0, 4.5, 3, 6, { wall: '#f4f2ec', roof: '#2a6fb5' });
  kit.sign(`${p.key}_s`, 'KANTAR', 0.6, bx - 2.3, y(bx, 0) + 2.4, 0, -PI / 2, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', li: 4, ld: 8 });
  // dijital ekran
  const sc = kit.sign(`${p.key}_ekran`, '00,0 t', 0.6, kx + 3.1, y(kx, 0) + 3.4, 13.5 * (p.dirS > 0 ? -1 : 1), -PI / 2, { color: '#ff3a2a', bg: '#0c0d10', font: '900 110px "Courier New", monospace', light: false });
  kit.box(0.2, 3.2, 0.2, M('#2a2d33', 0.5, 0.6), kx + 3.3, y(kx, 13), 13.5 * (p.dirS > 0 ? -1 : 1));
  ctx.kantarSign = sc;
  signPost(kit, `${p.key}_g`, 'TÜM TIRLAR KANTARA', ROAD_HALF + 1.8, y(ROAD_HALF, p.z1 - 6), p.z1 - 6, -PI / 2, { bg: '#1d4f9a', h: 0.6, pole: 2.6 });
  parkVehicle(kit, 11, p.x1 - 3.4, y(p.x1, -22), -22, PI / 2 * 0 + (p.dirS > 0 ? PI : 0), { trailer: 'tenteli', trailerColor: '#6b7f3a', paint: '#1f5fd6', plate: '06 ANK 06' });
  for (const z of [p.z0 + 6, p.z1 - 6]) lampPost(kit, p.x1 - 1, y(p.x1, z), z, 0);
  ctx.npc.push({ x: bx - 2.6, z: 3.5, name: 'Kantar Memuru', av: { clothing: 'vest', clothColor: '#ff7a1a', hat: 'cap', hatColor: '#2a6fb5', pantsColor: '#2b3550' }, lines: ['Platformun ortasında dur, tartalım.', 'Aks yükü sınırda, dikkat!', 'Fişin hazır.'] });
  return [{ x: kx, z: 0, r: 7, acts: [], truck: true, kantar: true }];
};

B.misir = (kit, p, ctx) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'asfalt');
  const cx = 9.5;
  kit.item('simit', cx, 0, 2, 0, { y: y(cx, 0) });
  // mangal + mısırlar
  kit.box(1.4, 0.8, 0.6, M('#2a2d33', 0.6, 0.6), cx - 1.6, y(cx, 2.4), 2.4);
  for (let i = 0; i < 6; i++) kit.cyl(0.06, 0.06, 0.5, M('#f2c43a', 0.5), cx - 2.1 + i * 0.2, y(cx, 2.4) + 0.84, 2.4, 6, { rx: PI / 2, cast: false });
  kit.light(cx - 1.6, y(cx, 2.4) + 1.1, 2.4, '#ff8a2a', 3, 5);
  kit.item('umbrella', cx - 1.2, 1.2, 0, 2, { y: y(cx, 1.2), solid: false });
  signPost(kit, `${p.key}_s`, 'MISIR · KESTANE', ROAD_HALF + 2, y(ROAD_HALF, p.z1 - 3), p.z1 - 3, -PI / 2, { bg: '#c8501a', h: 0.6, pole: 2.0 });
  ctx.npc.push({ x: cx - 2.6, z: 3, name: 'Mısırcı Hasan', av: { clothing: 'tshirt', clothColor: '#c8501a', hat: 'cap', hatColor: '#14161b', pantsColor: '#2b3550' }, lines: ['Közde mısır, haşlama mısır!', 'Kestane de kızardı.'] });
  return [{ x: cx - 2.6, z: 2, r: 3, acts: [{ id: 'misir', label: '🌽 Mısır al · ₺40' }], foot: true }, { x: 7, z: 0, r: 10, acts: [{ id: 'misir', label: '🌽 Mısır al · ₺40' }], truck: true }];
};

B.dinlenme = (kit, p, ctx) => {
  const y = Yp(p);
  padGround(kit, p, ROAD_HALF - 1.6, p.x1, p.z0, p.z1, 'asfalt');
  island(kit, p, ROAD_HALF + 2.4, p.z0 + 18, p.z1 - 18, 2);
  curb(kit, p, p.x1, p.z0, p.x1, p.z1);
  curb(kit, p, ROAD_HALF + 1.4, p.z0, p.x1, p.z0);
  curb(kit, p, ROAD_HALF + 1.4, p.z1, p.x1, p.z1);
  const zf = (z) => z * (p.dirS > 0 ? -1 : 1); // yerel z → "ileri" (gidiş yönü pozitif)
  // ana bina: KERVANSARAY (taş görünüm + kemerli revak + teras)
  const bx = p.x1 - 12;
  const bz = zf(10);
  const by = y(bx, bz);
  kit.box(16, 6, 34, M('#d8c7a4', 0.9), bx, by, bz);
  kit.box(17, 0.6, 35, M('#8a3a2a', 0.8), bx, by + 6, bz);
  for (let k = -3; k <= 3; k++) {
    kit.box(0.7, 3.6, 0.7, M('#c9b48c', 0.9), bx - 8.6, by, bz + k * 4.8);
  }
  kit.box(1.6, 0.6, 34, M('#c9b48c', 0.9), bx - 8.6, by + 3.6, bz);
  kit.box(0.08, 2.4, 30, M('#9fc7d9', 0.08, 0.4), bx - 8.05, by + 0.6, bz, { cast: false });
  kit.sign(`${p.key}_ad`, 'KERVANSARAY', 1.1, bx - 9.5, by + 5.1, bz, -PI / 2, { color: '#fff2c8', glow: '#ffb15a', font: '900 110px Georgia, serif', li: 9, ld: 16 });
  kit.sign(`${p.key}_alt`, 'LOKANTA · MARKET · ÇAY OCAĞI', 0.42, bx - 9.5, by + 4.2, bz, -PI / 2, { color: '#ffffff', font: '800 90px Arial, sans-serif', light: false });
  kit.mass(16, 6.6, 34, bx, bz, by);
  kit.item('door_cift', bx - 8.05, bz, 6, 0, { y: by, solid: false });
  // teras masaları (revak önü)
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    const tx = bx - 12;
    const tz = bz + k * 4.4;
    kit.item('cafetable', tx, tz, 0, 0, { y: y(tx, tz) });
  }
  kit.item('caysemaver', bx - 10.6, bz + 15, 2, 0, { y: y(bx - 10.6, bz + 15) });
  // mescit (küçük cami)
  const mzz = zf(-34);
  minaretMosque(kit, p.x1 - 9, y(p.x1 - 9, mzz), mzz, -PI / 2, 0.8);
  // WC bloğu
  building(kit, p.x1 - 7, y(p.x1, zf(-14)), zf(-14), 6, 3.2, 10, { wall: '#e9eef2', roof: '#2a6fb5', glass: false });
  kit.sign(`${p.key}_wc`, 'WC', 0.6, p.x1 - 10.1, y(p.x1, zf(-14)) + 2.4, zf(-14), -PI / 2, { color: '#ffffff', bg: '#1d4f9a', font: '900 100px Arial, sans-serif', light: false });
  // TIR parkı (yola yakın, uzun cepler) + otomobil parkı (binaya yakın)
  const tzs = [-58, -46, -34, -22];
  tzs.forEach((z, i) => {
    const zz = zf(z);
    for (let x = 12; x <= 34; x += 22) lineMark(kit, p, x, zz - 5, x, zz + 5, '#f2f2f2');
    lineMark(kit, p, 12, zz + 5, 34, zz + 5, '#f2f2f2');
    // v157.3: dönüş doğrudan verilir (eskiden sonradan çevriliyordu → çarpışma kutusu tırın ters
    // tarafında kalıyor, park yerinin çıkışında görünmez duvar oluşuyordu)
    if (i % 2 === 0) parkVehicle(kit, 11, 23, y(23, zz), zz, -PI / 2, { trailer: i ? 'tenteli' : 'konteyner', trailerColor: i ? '#8a3a2a' : '#2a6fb5', paint: i ? '#f4f4f2' : '#1f9e5a', plate: `${34 + i} TR ${100 + i}` });
  });
  kit.sign(`${p.key}_tirp`, 'TIR PARKI', 0.6, 10, y(10, zf(-40)) + 3.2, zf(-40), -PI / 2, { color: '#ffffff', bg: '#1d4f9a', font: '900 100px Arial, sans-serif', light: false });
  kit.box(0.14, 3, 0.14, M('#9aa0a8', 0.4, 0.7), 10, y(10, zf(-40)), zf(-40));
  for (let k = 0; k < 8; k++) {
    const zz = zf(34 + k * 3);
    lineMark(kit, p, 14, zz, 24, zz, '#f2f2f2');
  }
  [[19, 35.5, 1], [19, 41.5, 5], [19, 47.5, 9], [19, 53.5, 6]].forEach(([x, z, id]) => parkVehicle(kit, id, x, y(x, zf(z)), zf(z), PI / 2 + PI));
  // çocuk parkı + piknik
  const kx = p.x1 - 8;
  const kz = zf(52);
  padGround(kit, p, kx - 7, kx + 6, kz - 9, kz + 9, 'cim', 0.03);
  kit.item('salincak', kx, kz - 4, 2, 0, { y: y(kx, kz) + 0.03 });
  kit.item('kaydirak', kx, kz + 3, 2, 0, { y: y(kx, kz) + 0.03 });
  for (const [x, z] of [[kx - 4, kz - 6], [kx - 4, kz + 6]]) bigTree(kit, x, y(x, z), z, 0.8);
  for (const z of [zf(60), zf(64)]) kit.item('plastikmasa', p.x1 - 3, z, 0, 0, { y: y(p.x1, z) });
  // lambalar
  for (const z of [-60, -30, 0, 30, 60]) lampPost(kit, ROAD_HALF + 6.5, y(ROAD_HALF + 6, zf(z)), zf(z), 0);
  // giriş totemi
  signPost(kit, `${p.key}_tot`, 'DİNLENME TESİSİ', ROAD_HALF + 3.6, y(ROAD_HALF, zf(-68)), zf(-68), -PI / 2, { bg: '#1d4f9a', h: 0.7, pole: 4.2, glow: '#19e8ff' });
  // insanlar
  ctx.npc.push({ x: bx - 11.5, z: bz + 4.4, name: 'Garson Murat', av: { clothing: 'vest', clothColor: '#f4f1e8', neckAcc: 'bow', pantsColor: '#1a1a1a' }, lines: ['Buyrun, mercimek çorbası taze!', 'Çay mı içersiniz?', 'Tır şoförlerine çay bizden.'] });
  ctx.npc.push({ x: bx - 13, z: bz - 9, name: 'Tırcı Cemal', av: { clothing: 'jacket', clothColor: '#3a4a2a', hat: 'cap', hatColor: '#c8141e', pantsColor: '#2b3550', facialHair: 'mustache' }, lines: ['Kartal virajlarında yavaş git, kar varsa zincir tak.', 'Kantar ileride, yükün fazlaysa ceza yersin.', 'Kervankent\'e 2,5 km kaldı.'] });
  ctx.npc.push({ x: kx - 2, z: kz, name: 'Çocuk', av: { clothing: 'tshirt', clothColor: '#ffd23f', pantsColor: '#2f6fb8' }, lines: ['Salıncakta beni sallar mısın?'] });
  return [
    { x: bx - 11, z: bz, r: 5, acts: [{ id: 'yemek', label: '🍲 Yemek ye · ₺120' }, { id: 'cay', label: '☕ Çay · ₺10' }], foot: true },
    { x: 23, z: zf(-40), r: 22, acts: [{ id: 'mola', label: '😴 Dinlen (mola)' }], truck: true },
  ];
};

// --- ESKİ HURDALIK · ÇETE BÖLGESİ: çakıllı zemin, dikenli tel çit, 6 hangar (sağlı sollu),
// hurda araba yığınları, lastik / varil / kasa, yanan variller, gözetleme kulesi, çete üyeleri ----------
// koyu gri, iri çakıllı, çatlaklı harabe zemini
let ruinTex = null;
export function ruinGravelMat() {
  if (!ruinTex) {
    const N = 512;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = '#4b4a48';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 14000; i++) {
      const v = Math.random() * 40 - 20;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
      g.fillRect(Math.random() * N, Math.random() * N, 2, 2);
    }
    // belirgin çakıl taşları (gölgeli)
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * N;
      const y = Math.random() * N;
      const r = 1.5 + Math.random() ** 2 * 6;
      const t = Math.random();
      const base = t < 0.45 ? [120, 118, 112] : t < 0.75 ? [88, 86, 82] : t < 0.9 ? [140, 128, 110] : [62, 60, 58];
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.ellipse(x + 1.2, y + 1.4, r, r * 0.75, 0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.75, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
    // çatlaklar + yağ lekeleri
    g.strokeStyle = 'rgba(15,15,15,0.55)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) {
      let x = Math.random() * N;
      let y = Math.random() * N;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 10; i++) {
      g.fillStyle = 'rgba(10,10,12,0.35)';
      g.beginPath();
      g.ellipse(Math.random() * N, Math.random() * N, 10 + Math.random() * 30, 6 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    ruinTex = new THREE.CanvasTexture(c);
    ruinTex.colorSpace = THREE.SRGBColorSpace;
    ruinTex.wrapS = ruinTex.wrapT = THREE.RepeatWrapping;
    ruinTex.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({ map: ruinTex, roughness: 0.98 });
}
let rustTex = null;
function rustMat(base = '#8a5a3a', k = 0) {
  if (!rustTex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#d2cdc4';
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, 0, 3, 256);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 4, 0, 2, 256);
    }
    for (let i = 0; i < 260; i++) {
      const r = Math.random();
      g.fillStyle = r < 0.7 ? `rgba(150,75,30,${0.12 + Math.random() * 0.28})` : `rgba(50,32,20,${Math.random() * 0.22})`;
      const w = 4 + Math.random() * 26;
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, w, w * (0.4 + Math.random()), 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(110,50,20,0.35)';
      g.fillRect(Math.random() * 256, Math.random() * 120, 2, 40 + Math.random() * 90); // pas akıntısı
    }
    rustTex = new THREE.CanvasTexture(c);
    rustTex.colorSpace = THREE.SRGBColorSpace;
    rustTex.wrapS = rustTex.wrapT = THREE.RepeatWrapping;
  }
  const t = rustTex.clone();
  t.repeat.set(4, 2);
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, color: new THREE.Color(base).lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.7, metalness: 0.15 + k * 0.1, side: THREE.DoubleSide });
}
// yarım silindir (quonset) hangar; ön yüzü yerel +z, genişlik W, derinlik D
function quonset(kit, x, z, ry, { W = 20, D = 24, tint = '#8a6a50', open = 0 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  kit.group.add(g);
  const R = W / 2;
  const sh = new THREE.Shape();
  sh.absarc(0, 0, R, 0, Math.PI, false);
  sh.lineTo(-R + 0.3, 0);
  sh.absarc(0, 0, R - 0.3, Math.PI, 0, true);
  sh.lineTo(R, 0);
  const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 20 }), rustMat(tint));
  shell.position.z = -D / 2;
  shell.material.map.repeat.set(0.14, 0.09); // ekstrüzyon UV'si metre cinsinden
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(shell);
  // arka duvar
  const back = new THREE.Mesh(new THREE.CircleGeometry(R - 0.1, 24, 0, Math.PI), rustMat('#6b5a4a'));
  back.position.z = -D / 2 + 0.05;
  g.add(back);
  // ön duvar (kapı boşluklu) + sürgü kapı
  const fs = new THREE.Shape();
  fs.absarc(0, 0, R - 0.1, 0, Math.PI, false);
  fs.lineTo(R - 0.1, 0);
  const hole = new THREE.Path();
  hole.moveTo(-4, 0);
  hole.lineTo(-4, 6);
  hole.lineTo(4, 6);
  hole.lineTo(4, 0);
  hole.lineTo(-4, 0);
  fs.holes.push(hole);
  const front = new THREE.Mesh(new THREE.ShapeGeometry(fs, 20), rustMat('#7a5a40'));
  front.position.z = D / 2 - 0.05;
  front.material.side = THREE.DoubleSide;
  g.add(front);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshBasicMaterial({ color: open ? '#2a2016' : '#0a0a0c' }));
  inner.position.set(0, 3, D / 2 - 1.2);
  g.add(inner);
  const doorM = rustMat('#5a4636', 1);
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(4.1, 6.1, 0.12), doorM);
    d.position.set(s * (2.05 + (s > 0 ? open * 3.6 : 0)), 3.05, D / 2 + 0.08);
    d.castShadow = true;
    g.add(d);
  }
  if (open) {
    const lm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), new THREE.MeshBasicMaterial({ color: '#ffb35a' }));
    lm.position.set(0, 7, 0);
    g.add(lm);
  }
  const c = Math.cos(ry);
  kit.solid(x, z, (Math.abs(c) > 0.5 ? W : D) / 2, (Math.abs(c) > 0.5 ? D : W) / 2);
  kit.blocker(Math.abs(c) > 0.5 ? W : D, R, Math.abs(c) > 0.5 ? D : W, x, 0, z);
  return g;
}
// beşik çatılı oluklu sac hangar
function gableHangar(kit, x, z, ry, { W = 18, D = 24, H = 7, tint = '#7a7468' } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  kit.group.add(g);
  const wm = rustMat(tint);
  const add = (geo, m, px, py, pz) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(px, py, pz);
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(W, H, D), wm, 0, H / 2, 0);
  const roof = add(prism(W + 1, D + 1, 3.2), rustMat('#5a4a3e'), 0, H, 0);
  roof.material.side = THREE.DoubleSide;
  add(new THREE.BoxGeometry(7, 5.5, 0.15), rustMat('#4a3a2e', 1), 0, 2.75, D / 2 + 0.08);
  add(new THREE.BoxGeometry(W * 0.7, 0.6, 0.1), new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.3 }), 0, H - 1.2, D / 2 + 0.06);
  const c = Math.cos(ry);
  kit.solid(x, z, (Math.abs(c) > 0.5 ? W : D) / 2, (Math.abs(c) > 0.5 ? D : W) / 2);
  kit.blocker(Math.abs(c) > 0.5 ? W : D, H + 3, Math.abs(c) > 0.5 ? D : W, x, 0, z);
  return g;
}
B.cete = (kit, p, ctx) => {
  const Y = 0.08;
  padGround(kit, p, p.x0 - 4, p.x1, p.z0, p.z1, ruinGravelMat(), 0.0);
  // ana yol: daha koyu, tekerlek izli
  for (const s of [-1.6, 1.6]) kit.box(p.x1 - p.x0, 0.03, 0.7, M('#2e2d2b', 0.98), 0, Y - 0.005, s, { cast: false });
  // HARABE: yıkık beton duvarlar, moloz yığınları, kırık levhalar, yabani otlar, su birikintileri
  const conc = M('#7d7a74', 0.95);
  const concD = M('#5a5854', 0.95);
  [[-30, -33, 14, 0], [10, -33.5, 9, 0.05], [52, 33.5, 11, -0.03], [-60, 33, 8, 0], [-66, -18, 10, PI / 2], [66, 18, 8, PI / 2]].forEach(([x, z, L, ry], i) => {
    // kırık üst kenar: farklı yükseklikte bloklar
    const n = Math.ceil(L / 1.2);
    for (let k = 0; k < n; k++) {
      const h = 0.6 + Math.abs(Math.sin(k * 1.9 + i)) * 2.4 * (k % 5 === 3 ? 0.3 : 1);
      const off = -L / 2 + (k + 0.5) * (L / n);
      kit.box(L / n + 0.02, h, 0.35, k % 2 ? conc : concD, x + Math.cos(ry) * off, Y, z - Math.sin(ry) * off, { ry });
    }
    kit.solid(x, z, L / 2, 0.25, ry);
  });
  let sd = 99;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
  const rubbleM = [M('#6a6864', 0.95), M('#8a8680', 0.95), M('#5a3a2a', 0.9), M('#4a4846', 0.95)];
  for (let k = 0; k < 14; k++) {
    const x = -62 + rnd() * 124;
    const z = (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 2.5);
    if (Math.abs(x) % 44 < 12 && Math.abs(z) > 30) continue;
    for (let q = 0; q < 9; q++) kit.mesh(new THREE.DodecahedronGeometry(0.15 + rnd() * 0.4, 0), rubbleM[q % 4], x + (rnd() - 0.5) * 2.4, Y + 0.1, z + (rnd() - 0.5) * 1.6, rnd() * 3);
  }
  for (let k = 0; k < 10; k++) {
    const x = -55 + rnd() * 110;
    const z = (rnd() - 0.5) * 6;
    const sl = kit.box(1.4 + rnd() * 1.6, 0.12, 1 + rnd(), concD, x, Y, z, { ry: rnd() * 3, cast: false });
    sl.rotation.z = (rnd() - 0.5) * 0.12;
  }
  const weed = M('#5f6b3a', 0.95);
  for (let k = 0; k < 70; k++) {
    const x = p.x0 + 3 + rnd() * (p.x1 - p.x0 - 6);
    const z = p.z0 + 2 + rnd() * (p.z1 - p.z0 - 4);
    if (Math.abs(z) < 5) continue;
    for (let q = 0; q < 3; q++) kit.box(0.05, 0.3 + rnd() * 0.5, 0.05, weed, x + q * 0.12, Y, z + (q - 1) * 0.08, { cast: false, ry: rnd() * 3 });
  }
  const puddle = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
  [[-12, 2.5, 2.2], [26, -2.8, 1.6], [-48, -1.5, 2.8], [58, 2, 1.8]].forEach(([x, z, r]) => kit.mesh(new THREE.CircleGeometry(r, 16), puddle, x, Y + 0.025, z, 0, { rx: -PI / 2, cast: false }).scale.set(1, 0.6, 1));
  // 6 hangar: sağlı sollu, kapılar yola bakar
  const hz = 21;
  [[-44, 1, 'q', '#b08a6a', 0], [0, 1, 'g', '#a8a296', 0], [44, 1, 'q', '#9a8670', 0.7], [-44, -1, 'g', '#9c968a', 0], [0, -1, 'q', '#a87e5e', 0], [44, -1, 'q', '#b49478', 0]].forEach(([x, s, t, tint, open], i) => {
    const ry = s > 0 ? PI : 0; // +z yan: önü −z'ye (yola)
    if (t === 'q') quonset(kit, x, s * hz, ry, { tint, open });
    else gableHangar(kit, x, s * hz, ry, { tint });
    // numara
    kit.sign(`cete_h${i}`, `${i + 1}`, 1.2, x + 7, 4.2, s * (hz - 12.3), ry, { color: '#e8e2d0', font: '900 120px Impact, Arial Black, sans-serif', light: false });
  });
  // grafiti duvarı
  kit.item('graffiti', -22, 9.6, 0, 0, { y: Y, solid: false });
  kit.box(5, 3, 0.25, M('#6b6a66', 0.95), -22, Y, 9.2);
  kit.solid(-22, 9.2, 2.5, 0.2);
  // hurda araba yığınları (iki uçta) + tekil hurdalar
  const rust = ['#5a3a28', '#6b4a32', '#4a4a48', '#7a3a2a', '#3a4a5a', '#5a5a3a'];
  const stack = (x, z, n, r) => {
    for (let k = 0; k < n; k++) {
      kit.box(4.2, 1.3, 1.9, M(rust[(((k + Math.round(x)) % rust.length) + rust.length) % rust.length], 0.85, 0.3), x + Math.sin(k * 2.1) * 0.3, Y + k * 1.32, z + Math.cos(k * 1.7) * 0.2, { ry: r + k * 0.12 });
      kit.box(1.8, 0.5, 1.7, M('#1a1c20', 0.2, 0.5), x + Math.sin(k * 2.1) * 0.3 + 0.2, Y + k * 1.32 + 1.1, z, { ry: r + k * 0.12, cast: false });
    }
    kit.solid(x, z, 2.3, 1.2, r);
  };
  [[-62, -30, 3, 0.1], [-56, -32, 4, -0.2], [-62, 30, 2, 0.3], [62, -30, 4, 0], [56, -31, 3, 0.4], [62, 31, 3, -0.1], [-30, 34, 2, 1.4], [26, -34, 3, 1.6]].forEach(([x, z, n, r]) => stack(x, z, n, r));
  // devrilmiş / tekerleksiz hurda arabalar (oyunun araç modelleri, paslı boya)
  [[-26, -8, 0.6, 1], [18, 8.2, -0.3, 6], [52, -7.5, 2.4, 3], [-52, 8, 1.2, 9]].forEach(([x, z, r, id], i) => {
    const v = buildVehicle(id, { paint: rust[i % rust.length], finish: 'mat' });
    v.root.position.set(x, Y - 0.15, z);
    v.root.rotation.set(i % 2 ? 0.05 : -0.04, r, i === 2 ? 0.3 : 0.02);
    v.wheels?.forEach((w, k) => k % 2 === 0 && (w.spin.visible = false));
    kit.add(v.root);
    kit.solid(x, z, 1.1, 2.4, r);
  });
  // lastik / varil / kasa yığınları
  [[-35, -11], [32, 10.5], [-10, -11], [60, 12], [-60, -12]].forEach(([x, z], i) => {
    kit.item('tires', x, z, 0, 0, { y: Y });
    kit.item('tires', x + 0.7, z + 0.4, 0, 0, { y: Y });
    if (i % 2) kit.item('tires', x - 0.5, z - 0.6, 0, 0, { y: Y });
  });
  [[-18, 11], [12, -10.5], [36, -10.8], [-46, -9.8]].forEach(([x, z], i) => {
    kit.item('crates', x, z, i, 0, { y: Y });
    kit.item('pallets', x + 2.4, z, 0, 0, { y: Y });
  });
  kit.item('container', 64, 0, 2, 3, { y: Y });
  kit.item('forklift', 50, 10.4, 5, 0, { y: Y });
  // yanan variller (titrek ateş)
  [[-30, 9], [8, -9.5], [40, 9.5], [-58, 0]].forEach(([x, z], i) => {
    kit.item('barrel', x, z, 0, 0, { y: Y });
    const f = kit.mesh(new THREE.ConeGeometry(0.32, 0.9, 7), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85 }), x, Y + 1.25, z, 0, { cast: false, dyn: true });
    kit.ticks.push({ obj: f, ctl: { tick: (t) => {
      const k = 0.75 + Math.sin(t * 13 + i) * 0.15 + Math.sin(t * 7.3 + i * 2) * 0.1;
      f.scale.set(1, k, 1);
      f.material.color.setHSL(0.07 + Math.sin(t * 5 + i) * 0.015, 1, 0.55);
    } } });
    kit.light(x, Y + 1.8, z, '#ff7a2a', 7, 14);
  });
  // gözetleme kulesi + projektör (girişte)
  {
    const tx = -62;
    const tz = 14;
    const wood = M('#4a3a2c', 0.9);
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) kit.box(0.25, 6, 0.25, wood, tx + dx, Y, tz + dz);
    kit.box(3.2, 0.2, 3.2, wood, tx, Y + 6, tz);
    kit.box(3.2, 1.0, 0.1, wood, tx, Y + 6.2, tz + 1.55);
    kit.box(3.2, 1.0, 0.1, wood, tx, Y + 6.2, tz - 1.55);
    kit.box(3.6, 0.15, 3.6, rustMat('#5a4a3e'), tx, Y + 8.4, tz);
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, 1.5]]) kit.box(0.12, 2.2, 0.12, wood, tx + dx, Y + 6.2, tz + dz);
    kit.item('searchlight', tx + 1, tz - 1, 4, 0, { y: Y + 6.2, solid: false });
    kit.solid(tx, tz, 1.4, 1.4);
    kit.light(tx + 6, Y + 1, tz - 8, '#e8f0ff', 9, 22);
  }
  // DİKENLİ TEL ÇİT: direkler + tel örgü + üstte jilet tel; giriş (batı, z = 0) açık, kırık kapı
  const chain = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(160,160,155,0.9)';
    g.lineWidth = 2;
    for (let i = -64; i < 128; i += 12) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
      g.beginPath();
      g.moveTo(i + 64, 0);
      g.lineTo(i, 64);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const fenceSide = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const tex = chain.clone();
    tex.repeat.set(L / 1.2, 2.2 / 1.2);
    tex.needsUpdate = true;
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    kit.mesh(new THREE.PlaneGeometry(L, 2.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: '#9a9a96', metalness: 0.6, roughness: 0.5 }), (x0 + x1) / 2, Y + 1.15, (z0 + z1) / 2, ry, { cast: false });
    const n = Math.ceil(L / 3);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      kit.box(0.1, 2.6, 0.1, M('#55534e', 0.6, 0.6), x0 + (x1 - x0) * t, Y, z0 + (z1 - z0) * t, { cast: false });
    }
    for (const yy of [2.35, 2.55]) kit.box(L, 0.025, 0.025, M('#b0b0aa', 0.4, 0.8), (x0 + x1) / 2, Y + yy, (z0 + z1) / 2, { ry, cast: false });
    kit.solid((x0 + x1) / 2, (z0 + z1) / 2, L / 2, 0.08, ry);
  };
  const X0 = p.x0 + 1;
  const X1 = p.x1 - 1;
  const Z0 = p.z0 + 1;
  const Z1 = p.z1 - 1;
  fenceSide(X0, Z0, X1, Z0);
  fenceSide(X0, Z1, X1, Z1);
  fenceSide(X1, Z0, X1, Z1);
  fenceSide(X0, Z0, X0, -6);
  fenceSide(X0, 6, X0, Z1);
  // kırık kapı kanadı (yere yaslanmış)
  kit.box(5.6, 2.2, 0.08, M('#55534e', 0.6, 0.6), X0 + 2, Y + 0.5, -8.6, { ry: 0.4, rz: 0.15 });
  signPost(kit, 'cete_uyari', 'ÖZEL MÜLK · GİRMEYİNİZ', X0 - 0.4, Y, 8.2, -PI / 2, { bg: '#8a1a1a', h: 0.5, pole: 1.9 });
  kit.sign('cete_hurda', 'HURDACI', 0.8, X0 + 0.3, Y + 3.2, -6.4, -PI / 2, { color: '#d8c8a0', bg: '#3a2a1e', font: '900 100px Impact, Arial Black, sans-serif', light: false });
  kit.box(0.2, 3.4, 0.2, M('#4a3a2c', 0.9), X0 + 0.3, Y, -6.4);
  // titrek, zayıf lambalar
  [[-20, 0], [22, 0], [62, -18]].forEach(([x, z], i) => {
    kit.box(0.14, 5.5, 0.14, M('#3a3834', 0.6, 0.6), x, Y, z + (i === 2 ? 0 : 5.6));
    const b = kit.mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }), x, Y + 5.4, z + (i === 2 ? 0 : 5.2), 0, { cast: false, dyn: true });
    kit.ticks.push({ obj: b, ctl: { tick: (t) => (b.visible = Math.sin(t * 17 + i * 3) + Math.sin(t * 3.1 + i) > -1.2) } });
  });
  // çete üyeleri + bekçi köpekleri
  ctx.npc.push({ x: -8, z: 4.5, name: 'Kara Murat', av: { clothing: 'hoodie', clothColor: '#1a1a1c', hat: 'cap', hatColor: '#1a1a1c', facialHair: 'stubble', pantsColor: '#1a1a1c' }, lines: ['Burada ne arıyorsun?', 'Yanlış yere geldin dostum.', 'Patron 3 numaralı hangarda.'] });
  ctx.npc.push({ x: 41, z: 5, name: 'Sinsi Cemil', av: { clothing: 'jacket', clothColor: '#3a2a22', hat: 'beanie', hatColor: '#5a1a1a', pantsColor: '#222' }, lines: ['Mal geldi mi?', 'Polis yok burada, rahat ol.', 'Gözünü dört aç.'] });
  ctx.npc.push({ x: -40, z: -5, name: 'Bekçi', av: { clothing: 'jacket', clothColor: '#2a3a2a', hat: 'cap', hatColor: '#2a2a2a', facialHair: 'full', pantsColor: '#222' }, lines: ['Köpekler ısırır, uzak dur.', 'Gece kimse girmez buraya.'] });
  ctx.npc.push({ x: 18, z: -4.5, name: 'Tamirci Hayri', av: { clothing: 'vest', clothColor: '#3a3a3a', hat: 'cap', hatColor: '#8a1a1a', pantsColor: '#2b3550' }, lines: ['Bu parçalar çalıntı değil… sanırım.', 'Motor lazımsa bende var.'] });
  for (let k = 0; k < 3; k++) ctx.animals.push({ kind: 'kopek', x: -30 + k * 28, z: (k % 2 ? 1 : -1) * 3, v: 1 + (k % 3), area: [p.x0 + 3, p.z0 + 3, p.x1 - 3, p.z1 - 3], homeR: 22 });
  return [
    { x: 44, z: 9, r: 4, acts: [{ id: 'cete', label: '🕶️ Kapıyı çal' }], foot: true },
    { x: -40, z: -4, r: 3, acts: [{ id: 'cete2', label: '💬 Bekçiyle konuş' }], foot: true },
  ];
};

// --- KUĞU GÖLÜ SEYİR TERASI (göl yolu): küçük otopark (göle patika + iskele: buildPier) ---------------
B.golseyir = (kit, p, ctx) => {
  const y = Yp(p);
  const PX1 = BR_HALF + 8.5;
  padGround(kit, p, p.x0 - 0.4, PX1, -9, 9, 'asfalt');
  for (let k = 0; k <= 5; k++) lineMark(kit, p, BR_HALF + 1.4, -7 + k * 2.8, PX1 - 0.4, -7 + k * 2.8, '#f2f2f2', 0.12);
  parkVehicle(kit, 4, BR_HALF + 5, y(5, -4.2), -4.2, PI / 2);
  for (const [x, z] of [[PX1 + 2, -11], [PX1 + 2.5, 11], [PX1 + 2, 3]]) bigTree(kit, x, y(x, z), z, 0.7);
  return [{ x: BR_HALF + 5, z: 0, r: 10, acts: [{ id: 'mola', label: '☕ Mola ver' }], truck: true }];
};

// --- NEON ELMAS MADENİ: kaya tepesine açılan ocak, raylar + vagonlar, konveyör, işleme tesisi ------
B.maden = (kit, p, ctx) => {
  const Y = 0.05;
  const gm = ruinGravelMat();
  gm.color = new THREE.Color('#c9b896');
  padGround(kit, p, p.x0, p.x1, p.z0, p.z1, gm, 0);
  const rock = new THREE.MeshStandardMaterial({ color: '#6f6a62', roughness: 1, flatShading: true });
  // arkadaki kaya tepesi (ocak bunun içine açılır)
  const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), rock);
  hill.scale.set(46, 20, 22);
  hill.position.set(0, -4, p.z0 - 12);
  hill.castShadow = true;
  hill.receiveShadow = true;
  kit.add(hill);
  kit.solid(0, p.z0 - 10, 46, 16);
  // ocak ağzı: ahşap çerçeve + karanlık tünel
  const pz = p.z0 + 4;
  const timber = M('#6b4a2e', 0.85);
  kit.box(9, 7, 6, rock, 0, Y - 0.5, pz - 3.2);
  kit.mesh(new THREE.PlaneGeometry(5, 4.6), new THREE.MeshBasicMaterial({ color: '#070708' }), 0, Y + 2.3, pz - 0.15, 0, { cast: false });
  for (const sx of [-2.7, 2.7]) kit.box(0.5, 5, 0.5, timber, sx, Y, pz);
  kit.box(6.2, 0.6, 0.6, timber, 0, Y + 5, pz);
  kit.sign('maden_ocak', 'ELMAS OCAĞI · No:1', 0.55, 0, Y + 5.75, pz + 0.32, 0, { color: '#ffe9a8', bg: '#3a2a1a', font: '900 100px Arial, sans-serif', light: false });
  kit.light(0, Y + 4.2, pz + 1.5, '#ffcf7a', 6, 12);
  // raylar + traversler (ocaktan işleme tesisine)
  const railM = M('#7a7d82', 0.4, 0.8);
  const zA = pz;
  const zB = 8;
  for (const sx of [-0.55, 0.55]) kit.box(0.08, 0.12, zB - zA, railM, sx, Y, (zA + zB) / 2, { cast: false });
  for (let z = zA; z < zB; z += 0.9) kit.box(1.6, 0.08, 0.22, timber, 0, Y - 0.02, z, { cast: false });
  // vagonlar: maden + parlayan elmaslar
  const dia = new THREE.MeshStandardMaterial({ color: '#bff6ff', emissive: '#4fe6ff', emissiveIntensity: 1.8, roughness: 0.1, metalness: 0.3 });
  const diaGeo = new THREE.OctahedronGeometry(0.16, 0);
  [[pz + 6], [pz + 10], [pz + 20]].forEach(([z], i) => {
    kit.box(1.3, 0.8, 2.0, M('#4a4a4e', 0.5, 0.7), 0, Y + 0.35, z);
    kit.box(1.2, 0.25, 1.9, M('#2f2d2a', 0.95), 0, Y + 1.05, z);
    for (let k = 0; k < 6; k++) {
      const d = kit.mesh(diaGeo, dia, (k % 3 - 1) * 0.35, Y + 1.25, z + (Math.floor(k / 3) - 0.5) * 0.6, k, { cast: false, dyn: true });
      kit.ticks.push({ obj: d, ctl: { tick: (t) => (d.rotation.y = t * 1.5 + k + i) } });
    }
    kit.solid(0, z, 0.7, 1.05);
  });
  // ELMAS İŞLEME TESİSİ + konveyör
  const bx = -30;
  const bz = 6;
  const metal = rustMat('#9aa0a6');
  kit.box(20, 9, 14, metal, bx, Y, bz);
  kit.box(21, 0.5, 15, M('#3a3d42', 0.5, 0.5), bx, Y + 9, bz);
  kit.box(5, 5, 0.12, M('#2a2d33', 0.4, 0.6), bx + 10.06, Y, bz, { ry: PI / 2 });
  kit.sign('maden_tesis', 'ELMAS İŞLEME TESİSİ', 0.8, bx + 10.08, Y + 7, bz, PI / 2, { color: '#ffffff', glow: '#4fe6ff', font: '900 100px Arial, sans-serif', li: 6, ld: 12 });
  kit.mass(20, 9, 14, bx, bz, Y);
  const conv = kit.box(2, 0.4, 26, M('#2a2a2c', 0.6, 0.5), -14, Y + 4.2, pz + 12, { ry: -0.55 });
  conv.rotation.x = 0.28;
  for (let k = 0; k < 5; k++) kit.box(0.25, 3.5 + k * 0.9, 0.25, M('#c9a020', 0.5, 0.5), -6 - k * 3.1, Y, pz + 5 + k * 4.4);
  kit.cyl(2.2, 0.8, 3.2, M('#8a8e94', 0.5, 0.6), -18, Y + 6.5, -6, 10);
  // v157.3: huni havada duruyordu — çelik ayaklar + alt bilezik + boşaltma borusu
  {
    const leg = M('#c9a020', 0.5, 0.5);
    for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) kit.box(0.28, 6.7, 0.28, leg, -18 + lx, Y, -6 + lz);
    kit.box(3.3, 0.22, 3.3, M('#3a3d42', 0.5, 0.5), -18, Y + 6.3, -6);
    for (const k of [2.2, 4.4]) {
      kit.box(3.0, 0.12, 0.12, leg, -18, Y + k, -7.5);
      kit.box(3.0, 0.12, 0.12, leg, -18, Y + k, -4.5);
      kit.box(0.12, 0.12, 3.0, leg, -19.5, Y + k, -6);
      kit.box(0.12, 0.12, 3.0, leg, -16.5, Y + k, -6);
    }
    kit.cyl(0.35, 0.35, 2.4, M('#5a5e64', 0.5, 0.6), -18, Y + 3.9, -6, 8);
    kit.solid(-18, -6, 1.7, 1.7);
  }
  // cevher yığınları (parıltılı)
  [[20, -24, 6], [32, -14, 5], [24, 4, 4]].forEach(([x, z, r], i) => {
    kit.mesh(new THREE.ConeGeometry(r, r * 0.8, 9), M('#4a4642', 0.95), x, Y + r * 0.4, z, i, { cast: true });
    for (let k = 0; k < 8; k++) {
      const a = k * 0.8 + i;
      kit.mesh(diaGeo, dia, x + Math.cos(a) * r * 0.5, Y + r * 0.35, z + Math.sin(a) * r * 0.5, a, { cast: false });
    }
    kit.solid(x, z, r * 0.8, r * 0.8);
  });
  // damperli kamyon + ekskavatör (basit, sarı)
  const yel = M('#e8b023', 0.5, 0.3);
  const blk = M('#1f2024', 0.8);
  {
    const x = 34;
    const z = 22;
    kit.box(3, 2.4, 6.5, yel, x, Y + 1.2, z);
    kit.box(3, 2.2, 2.4, M('#d0a020', 0.5), x, Y + 1.2, z + 4.4);
    kit.box(2.4, 0.9, 0.1, M('#1a2a3a', 0.2, 0.5), x, Y + 2.7, z + 5.62);
    for (const [wx, wz] of [[-1.5, -2], [1.5, -2], [-1.5, 2], [1.5, 2], [-1.5, 4.6], [1.5, 4.6]]) kit.cyl(0.75, 0.75, 0.5, blk, x + wx, Y + 0.75, z + wz, 14, { rz: PI / 2 });
    kit.solid(x, z + 1.2, 1.6, 4.6);
  }
  {
    const x = -2;
    const z = -6 + 16;
    kit.box(3.2, 1.2, 4.4, blk, x + 12, Y, z);
    kit.box(3, 2.4, 3.4, yel, x + 12, Y + 1.2, z);
    const arm = kit.box(0.6, 0.6, 6, yel, x + 12, Y + 3.6, z - 3.4, { rx: -0.5 });
    void arm;
    kit.box(1.4, 1.1, 1.2, M('#6a6a6e', 0.5, 0.6), x + 12, Y + 1.2, z - 6.4);
    kit.solid(x + 12, z - 1.5, 1.7, 3.4);
  }
  // ofis + bariyer + tabela (girişte)
  const gz = p.z1 - 6;
  kit.box(5, 3, 4, M('#f2efe6', 0.7), 14, Y, gz);
  kit.box(5.6, 0.25, 4.6, M('#2a6fb5', 0.5), 14, Y + 3, gz);
  kit.box(3.6, 1.1, 0.06, M('#9fc7d9', 0.08, 0.4), 14, Y + 1.4, gz - 2.03, { cast: false });
  kit.solid(14, gz, 2.5, 2);
  kit.box(0.3, 1.1, 0.3, M('#ffd23f', 0.5), 4.5, Y, p.z1 - 3);
  kit.box(5, 0.12, 0.12, M('#d0302a', 0.5), 2.2, Y + 1.0, p.z1 - 3);
  // giriş kapısı: iki direk + üst kiriş; tabela kirişe asılı (askı çubuklarıyla)
  const gm2 = M('#2a2d33', 0.5, 0.6);
  for (const sx of [-8, 8]) {
    kit.box(0.32, 5.6, 0.32, gm2, sx, Y, p.z1 - 2.5);
    kit.box(0.8, 0.3, 0.8, M('#5a5d62', 0.8), sx, Y, p.z1 - 2.5);
    kit.solid(sx, p.z1 - 2.5, 0.2, 0.2);
  }
  kit.box(16.6, 0.4, 0.4, gm2, 0, Y + 5.3, p.z1 - 2.5);
  for (const sx of [-3.2, 3.2]) kit.box(0.06, 0.32, 0.06, gm2, sx, Y + 5.0, p.z1 - 2.5);
  kit.box(7.4, 1.1, 0.14, M('#14161b', 0.6), 0, Y + 4.0, p.z1 - 2.5);
  kit.sign('maden_giris', '💎 NEON ELMAS MADENİ', 0.9, 0, Y + 4.55, p.z1 - 2.4, 0, { color: '#ffffff', bg: '#14161b', glow: '#4fe6ff', font: '900 100px Arial, sans-serif', li: 6, ld: 12 });
  kit.sign('maden_baret', 'BARETSİZ GİRMEK YASAKTIR', 0.3, 14, Y + 2.4, gz + 2.03, 0, { color: '#111', bg: '#ffd23f', font: '900 80px Arial, sans-serif', light: false });
  // projektör kuleleri
  [[-40, -30], [40, -30], [-40, 30]].forEach(([x, z]) => {
    kit.box(0.3, 10, 0.3, M('#3a3d42', 0.5, 0.6), x, Y, z);
    kit.box(1.6, 0.6, 0.4, glowMat('#fff6e0', 2), x, Y + 10, z, { cast: false });
    kit.light(x * 0.8, Y + 9, z * 0.8, '#fff6e0', 10, 30);
    kit.solid(x, z, 0.2, 0.2);
  });
  // çit (giriş açık)
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    for (let t = 0; t <= L; t += 3) kit.box(0.1, 2.2, 0.1, M('#55534e', 0.6, 0.6), x0 + ((x1 - x0) * t) / L, Y, z0 + ((z1 - z0) * t) / L, { cast: false });
    for (const yy of [0.8, 1.6, 2.1]) kit.box(L, 0.03, 0.03, M('#9a9a96', 0.4, 0.8), (x0 + x1) / 2, Y + yy, (z0 + z1) / 2, { ry, cast: false });
    kit.solid((x0 + x1) / 2, (z0 + z1) / 2, L / 2, 0.08, ry);
  };
  fence(p.x0 + 1, p.z1 - 1, -8.2, p.z1 - 1);
  fence(8.2, p.z1 - 1, p.x1 - 1, p.z1 - 1);
  fence(p.x0 + 1, p.z0 + 1, p.x0 + 1, p.z1 - 1);
  fence(p.x1 - 1, p.z0 + 1, p.x1 - 1, p.z1 - 1);
  // işçiler
  const helmet = (c, n, x, z, lines) => ctx.npc.push({ x, z, name: n, av: { clothing: 'vest', clothColor: c, hat: 'cap', hatColor: '#ffd23f', pantsColor: '#2b3550' }, lines });
  helmet('#ff7a1a', 'Ustabaşı Kemal', 3, pz + 8, ['Bugün 3 vagon elmas çıktı!', 'Baretini tak, ocağa öyle gir.', 'Tünel 400 metre derinde.']);
  helmet('#ffd23f', 'Madenci Recep', -2.5, pz + 14, ['Kazma kürek, elmas için.', 'Gece vardiyası zor.']);
  helmet('#ff7a1a', 'Mühendis Selin', bx + 12, bz + 3, ['Ayıklama hattı tam kapasite.', 'Bu taşlar 2 karat üstü.']);
  helmet('#2f8f4a', 'Güvenlik Ahmet', 12, gz - 3, ['Kimlik kartı lütfen.', 'Elmas çıkışı kayıt altında.']);
  return [
    { x: 0, z: pz + 3, r: 4, acts: [{ id: 'kazi', label: '⛏️ Kazı yap' }], foot: true },
    { x: bx + 11, z: bz, r: 4, acts: [{ id: 'elmas', label: '💎 Elmasları teslim et' }], foot: true },
  ];
};

// --- ÇAMLIK PİKNİK ALANI (vadi yolu, ormanın içinde) + yola bitişik otopark ----------------------
B.piknik = (kit, p, ctx) => {
  const y = Yp(p);
  const PX1 = BR_HALF + 9.5;
  padGround(kit, p, p.x0 - 0.4, PX1, -17, 17, 'asfalt');
  for (let k = 0; k <= 12; k++) lineMark(kit, p, BR_HALF + 1.6, -16.8 + k * 2.8, PX1 - 0.4, -16.8 + k * 2.8, '#f2f2f2', 0.12);
  curb(kit, p, PX1, -17, PX1, -3);
  curb(kit, p, PX1, 3, PX1, 17);
  signPost(kit, `${p.key}_p`, 'P · ÇAMLIK PİKNİK ALANI', BR_HALF + 1.2, y(BR_HALF, 18.5), 18.5, -PI / 2, { bg: '#2f5a2a', h: 0.55, pole: 2.4 });
  parkVehicle(kit, 2, BR_HALF + 5.5, y(5, -8.4), -9.8, PI / 2);
  parkVehicle(kit, 6, BR_HALF + 5.5, y(5, 5.6), 6.6, -PI / 2);
  // piknik masaları + mangallar (çam altında)
  const wood = M('#8a6a45', 0.85);
  const tables = [[17, -12], [17, 0], [17, 12], [25, -6], [25, 6], [31, -14], [31, 14]];
  tables.forEach(([x, z], i) => {
    const gy = y(x, z);
    kit.box(2.2, 0.08, 0.9, wood, x, gy + 0.74, z, { ry: PI / 2 });
    kit.box(0.7, 0.74, 0.12, wood, x, gy, z - 0.9);
    kit.box(0.7, 0.74, 0.12, wood, x, gy, z + 0.9);
    for (const s of [-1, 1]) kit.box(0.3, 0.06, 2.2, wood, x + s * 0.75, gy + 0.45, z);
    kit.solid(x, z, 0.9, 1.1);
    if (i % 2 === 0) kit.item('mangal', x, z + 2.4, 0, 0, { y: gy });
  });
  kit.item('copkutusu', 14, -16, 0, 0, { y: y(14, -16) });
  kit.item('copkutusu', 14, 16, 0, 0, { y: y(14, 16) });
  kit.item('salincak', 33, 0, 2, 0, { y: y(33, 0) });
  // çeşme
  kit.box(1.8, 1.4, 0.7, M('#a8a094', 0.95), 21, y(21, 18), 18);
  kit.box(1.6, 0.35, 0.8, M('#6fa3b8', 0.1, 0.2), 21, y(21, 17.2), 17.2);
  kit.solid(21, 18, 0.9, 0.4);
  for (const [x, z] of [[14, -19], [36, -19], [36, 19], [22, -20], [28, 20], [36, 0.5]]) bigTree(kit, x, y(x, z), z, 0.75);
  ctx.npc.push({ x: 17.8, z: -11, name: 'Piknikçi Sevgi', av: { gender: 'f', clothing: 'tshirt', clothColor: '#ff7a3a', pantsColor: '#2b3550' }, lines: ['Mangal yeni yandı, köfte ister misin?', 'Burası ormanın en güzel yeri.'] });
  ctx.npc.push({ x: 25.6, z: 6.8, name: 'Tamer Bey', av: { clothing: 'hoodie', clothColor: '#3a5a8a', hat: 'cap', hatColor: '#1a1a1a', pantsColor: '#2a2420' }, lines: ['Çocuklar salıncakta.', 'Ayı görülmüş diyorlar, dikkatli olun!'] });
  ctx.npc.push({ x: 32, z: 1, name: 'Ece', av: { gender: 'f', clothing: 'tshirt', clothColor: '#ffd23f', pantsColor: '#2f6fb8' }, lines: ['Beni sallar mısın?'] });
  return [
    { x: 17, z: 0, r: 5, acts: [{ id: 'mangal', label: '🔥 Mangal yak' }, { id: 'cay', label: '☕ Çay · ₺10' }], foot: true },
    { x: BR_HALF + 5, z: 0, r: 14, acts: [{ id: 'mola', label: '🌲 Mola ver' }], truck: true },
  ];
};

// --- KÖY -----------------------------------------------------------------------------------
B.koy = (kit, p, ctx) => (p.key === 'camlica' ? koyCamlica(kit, p, ctx) : koyGolyaka(kit, p, ctx));
function koyGolyaka(kit, p, ctx) {
  const Y = 0.05;
  const W = p.x1;
  const D = p.z1;
  // çim zemin + toprak yollar
  // zemin: arazi (köy düzlüğü oyuldu) — ayrı çim düzlemi yok
  const dirt = M('#a08a63', 0.95);
  const road = (w, d, x, z) => {
    const o = kit.box(w, 0.04, d, dirt, x, 0, z, { cast: false });
    o.receiveShadow = true;
  };
  road(7, D * 2 + 4, 0, 0); // ana yol (giriş → meydan → köy sonu)
  road(W * 1.6, 6, 0, -6); // köy içi enine yol
  // meydan: çınar, çeşme, kahvehane, cami, bakkal
  const sq = { x: 0, z: -6 };
  bigTree(kit, sq.x + 9, Y, sq.z + 8, 1.4);
  // çeşme (taş)
  kit.box(2.4, 1.3, 1.2, M('#c9bfa8', 0.9), sq.x - 6, Y, sq.z + 6);
  kit.box(2.0, 0.4, 0.9, M('#6fa3b8', 0.1, 0.2), sq.x - 6, Y, sq.z + 7.1);
  kit.cyl(0.04, 0.04, 0.3, M('#c9ccd2', 0.3, 0.9), sq.x - 6, Y + 0.9, sq.z + 6.75, 6, { rx: PI / 2 });
  kit.solid(sq.x - 6, sq.z + 6.4, 1.2, 1);
  // kahvehane
  const kh = { x: -16, z: 10 };
  house(kit, kh.x, Y, kh.z, 0, { w: 10, d: 7, floors: 1, wall: '#e9dfc8', roof: '#a8452e', seed: 1 });
  kit.sign(`${p.key}_kh`, 'KÖY KAHVESİ', 0.55, kh.x, Y + 2.7, kh.z + 3.6, 0, { color: '#ffffff', bg: '#6b3f22', font: '900 100px Arial, sans-serif', light: false });
  for (let i = 0; i < 4; i++) kit.item('plastikmasa', kh.x - 4.5 + i * 3, kh.z + 6, 0, 0, { y: Y });
  for (let i = 0; i < 8; i++) kit.item('plastiktabure', kh.x - 5.3 + i * 1.5, kh.z + 7.1, 0, 0, { y: Y });
  kit.item('caysemaver', kh.x + 5.8, kh.z + 4.6, 0, 0, { y: Y });
  // bakkal
  const bk = { x: 16, z: 10 };
  house(kit, bk.x, Y, bk.z, 0, { w: 8, d: 7, floors: 1, wall: '#f1ead8', roof: '#8a3a2a', seed: 2 });
  kit.sign(`${p.key}_bk`, 'BAKKAL', 0.5, bk.x, Y + 2.7, bk.z + 3.6, 0, { color: '#ffffff', bg: '#c8141e', font: '900 100px Arial, sans-serif', light: false });
  kit.item('fruitstand', bk.x - 2, bk.z + 4.6, 0, 0, { y: Y });
  // cami
  minaretMosque(kit, -26, Y, -24, 0, 0.85);
  // evler + bahçeler
  const houses = [[-36, 18, 0], [-34, -42, PI], [-12, -38, PI], [12, -38, PI], [36, -40, PI], [38, 16, 0], [36, -14, -PI / 2], [-40, -12, PI / 2]];
  const walls = ['#f3eee2', '#efe3cc', '#f5f0e6', '#e9dccb', '#f2ece0'];
  const roofs = ['#b5523a', '#a8452e', '#9a4a34', '#b8603e'];
  houses.forEach(([x, z, ry], i) => {
    house(kit, x, Y, z, ry, { w: 8 + (i % 3), d: 7, floors: 1 + (i % 3 === 0 ? 1 : 0), wall: walls[i % walls.length], roof: roofs[i % roofs.length], seed: i });
    // bahçe çiti (ön)
    const fz = z + Math.cos(ry) * 7.5;
    const fx = x + Math.sin(ry) * 7.5;
    if (Math.abs(Math.cos(ry)) > 0.5) {
      fenceRun(kit, fx - 6, fz, fx - 1.5, fz, Y);
      fenceRun(kit, fx + 1.5, fz, fx + 6, fz, Y);
    }
    if (i % 2 === 0) kit.item('tree', x + 6, z + 2, 0, 0, { y: Y });
  });
  // ahır + hayvanlar + tarla
  const ah = { x: 30, z: 34 };
  kit.box(12, 4.2, 8, M('#8a5a3a', 0.9), ah.x, Y, ah.z);
  kit.mesh(prism(13, 9, 2), M('#5a3d26', 0.85), ah.x, Y + 4.2, ah.z, PI / 2, { cast: true });
  kit.mass(12, 5, 8, ah.x, ah.z, Y);
  fenceRun(kit, ah.x - 14, ah.z + 5, ah.x - 14, ah.z + 18, Y);
  fenceRun(kit, ah.x - 14, ah.z + 18, ah.x + 6, ah.z + 18, Y);
  fenceRun(kit, ah.x + 6, ah.z + 18, ah.x + 6, ah.z + 5, Y);
  // canlı hayvanlar (main.js'teki hayvan sistemi yürütür) — alanlar yerel dikdörtgen
  const pen = [ah.x - 13, ah.z + 6, ah.x + 5, ah.z + 17];
  ctx.animals.push({ kind: 'inek', x: ah.x - 9, z: ah.z + 10, v: 0, area: pen }, { kind: 'inek', x: ah.x - 4, z: ah.z + 13, v: 1, area: pen }, { kind: 'inek', x: ah.x + 1, z: ah.z + 9, v: 2, area: pen });
  const yard = [-W + 6, -D + 6, W - 6, D - 6];
  for (let i = 0; i < 12; i++) ctx.animals.push({ kind: 'tavuk', x: (i < 6 ? ah.x - 2 : -30) + (i % 3) * 1.5, z: (i < 6 ? ah.z - 6 : -30) + Math.floor(i / 3) * 1.2, v: i, area: yard, homeR: 9 });
  ctx.animals.push({ kind: 'kopek', x: 6, z: 20, v: 0, area: yard, homeR: 30 });
  for (const [x, z] of [[ah.x + 10, ah.z - 8], [ah.x + 12, ah.z - 5], [ah.x + 9, ah.z - 4]]) kit.item('hay', x, z, 1, 0, { y: Y });
  kit.item('tractor', ah.x - 10, ah.z - 7, 6, 0, { y: Y });
  // tarla (sebze sıraları) + korkuluk
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) kit.item('vegbed', -40 + c * 4.2, 34 + r * 2.6, 0, 0, { y: Y, solid: false });
  kit.item('scarecrow', -34, 40, 0, 0, { y: Y });
  // koyun sürüsü (çayırda)
  for (let i = 0; i < 9; i++) ctx.animals.push({ kind: 'koyun', x: -18 + (i % 3) * 2.6, z: 34 + Math.floor(i / 3) * 2.2, v: i, area: [-30, 26, -8, D - 4], homeR: 10 });
  // giriş tabelası
  const gz = D - 4;
  kit.box(0.14, 2.6, 0.14, M('#9aa0a8', 0.4, 0.7), 5, Y, gz);
  kit.sign(`${p.key}_giris`, p.name.toUpperCase(), 0.7, 5, Y + 2.8, gz + 0.09, 0, { color: '#ffffff', bg: '#1d4f9a', font: '900 100px Arial, sans-serif', light: false });
  kit.solid(5, gz, 0.12, 0.12);
  // sokak lambaları
  for (const [x, z] of [[4.5, 30], [4.5, 0], [4.5, -30], [-20, -2], [20, -2]]) kit.item('streetlamp', x, z, 0, 0, { y: Y });
  ctx.npc.push({ x: kh.x - 1.5, z: kh.z + 6.6, name: 'Muhtar Rıza', av: { clothing: 'jacket', clothColor: '#4a4036', hat: 'cap', hatColor: '#2a2420', facialHair: 'full', hairColor: '#c9c4bc', pantsColor: '#2a2420' }, lines: [`${p.name}'ne hoş geldin evlat!`, 'Bir çayımızı iç, öyle git.', 'Bu yıl hasat bereketli.'] });
  ctx.npc.push({ x: kh.x + 2.4, z: kh.z + 6.6, name: 'Hüseyin Amca', av: { clothing: 'vest', clothColor: '#5a4a3a', hat: 'cap', hatColor: '#1a1a1a', facialHair: 'mustache', hairColor: '#d8d2c4', pantsColor: '#2a2420' }, lines: ['Tavla atalım mı?', 'Şehirden mi geliyorsun?'] });
  ctx.npc.push({ x: bk.x - 1, z: bk.z + 5.4, name: 'Bakkal Fatma', av: { gender: 'f', clothing: 'dress', clothColor: '#2f6f8a', hat: 'scarf', hatColor: '#f2e6b8', pantsColor: '#2a2420' }, lines: ['Köy ekmeği yeni çıktı.', 'Yumurtalar taze.'] });
  ctx.npc.push({ x: -36, z: 12, name: 'Fadime Nine', av: { gender: 'f', clothing: 'dress', clothColor: '#7a3a5a', hat: 'scarf', hatColor: '#ffffff', pantsColor: '#3a3226' }, lines: ['Hoş geldin yavrum, bir ayran ister misin?', 'Tavuklar yine bahçeye kaçtı.'] });
  ctx.npc.push({ x: sq.x + 3, z: sq.z + 3, name: 'Ayşe', av: { gender: 'f', clothing: 'tshirt', clothColor: '#ff7aa8', pantsColor: '#2f6fb8' }, lines: ['Saklambaç oynuyoruz!', 'Ebe sensin!'] });
  ctx.npc.push({ x: sq.x + 5, z: sq.z + 1, name: 'Mehmet', av: { clothing: 'tshirt', clothColor: '#2f8f4a', pantsColor: '#3a3226' }, lines: ['Topumu gördün mü?'] });
  ctx.npc.push({ x: ah.x - 12, z: ah.z - 9, name: 'Çiftçi Osman', av: { clothing: 'jacket', clothColor: '#3a4a2a', hat: 'cap', hatColor: '#5a4a3a', facialHair: 'mustache', pantsColor: '#3a3226' }, lines: ['Traktörü yağlıyorum, yarın harman var.', 'Bu sene buğday iyi.'] });
  ctx.npc.push({ x: ah.x - 6, z: ah.z + 4, name: 'Çoban Ali', av: { clothing: 'jacket', clothColor: '#6b5434', hat: 'cap', hatColor: '#3a3226', pantsColor: '#3a3226' }, lines: ['Koyunları otlatmaya çıkaracağım.', 'İnekler bugün çok süt verdi.'] });
  return [
    { x: kh.x, z: kh.z + 6.5, r: 4, acts: [{ id: 'cay', label: '☕ Çay · ₺10' }, { id: 'tavla', label: '🎲 Tavla at' }], foot: true },
    { x: bk.x, z: bk.z + 5, r: 3, acts: [{ id: 'ekmek', label: '🥖 Köy ekmeği · ₺15' }], foot: true },
    { x: sq.x - 6, z: sq.z + 7.6, r: 2, acts: [{ id: 'su', label: '💧 Çeşmeden su iç' }], foot: true },
  ];
}

// --- ÇAMLICA: orman / yayla köyü (taş + ahşap evler, çay bahçesi, hızar, arı kovanları, keçiler) ---
function woodHouse(kit, x, y, z, ry, { w = 8, d = 7, seed = 0, roof = '#3d4a3d' } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  kit.group.add(g);
  const add = (geo, m, px, py, pz, ryy = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(px, py, pz);
    o.rotation.y = ryy;
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const stone = M('#9a948a', 0.95);
  const wood = M(['#6b4a2e', '#7a5634', '#5a3d26'][seed % 3], 0.85);
  const white = M('#f2efe6', 0.7);
  add(new THREE.BoxGeometry(w, 2.6, d), stone, 0, 1.3, 0);
  add(new THREE.BoxGeometry(w + 0.6, 2.8, d + 0.6), wood, 0, 4.0, 0); // çıkma kat (ahşap)
  for (let i = -1; i <= 1; i++) add(new THREE.BoxGeometry(0.12, 2.8, d + 0.62), M('#3a2a1a', 0.8), i * w * 0.3, 4.0, 0);
  const r = add(prism(w + 1.6, d + 1.8, 2.8), M(roof, 0.7), 0, 5.4, 0);
  r.material.side = THREE.DoubleSide;
  const winM = M('#2a3440', 0.2, 0.3);
  for (const wx of [-w * 0.3, 0, w * 0.3]) {
    add(new THREE.BoxGeometry(0.9, 1.2, 0.08), white, wx, 4.1, d / 2 + 0.33);
    add(new THREE.BoxGeometry(0.7, 1.0, 0.1), winM, wx, 4.1, d / 2 + 0.35);
  }
  add(new THREE.BoxGeometry(1.1, 2.1, 0.1), M('#3a2a1a', 0.7), seed % 2 ? -w * 0.25 : w * 0.25, 1.05, d / 2 + 0.03);
  add(new THREE.BoxGeometry(0.6, 1.6, 0.6), stone, -w * 0.3, 7.0, -d * 0.1);
  // balkon
  if (seed % 2 === 0) {
    add(new THREE.BoxGeometry(w * 0.6, 0.12, 1.2), wood, 0, 2.75, d / 2 + 0.9);
    add(new THREE.BoxGeometry(w * 0.6, 0.8, 0.06), wood, 0, 3.2, d / 2 + 1.48);
  }
  const c = Math.cos(ry);
  kit.solid(x, z, (Math.abs(c) > 0.5 ? w : d) / 2 + 0.3, (Math.abs(c) > 0.5 ? d : w) / 2 + 0.3);
  kit.blocker(Math.abs(c) > 0.5 ? w : d, 8, Math.abs(c) > 0.5 ? d : w, x, y, z);
}
function koyCamlica(kit, p, ctx) {
  const Y = 0.05;
  const W = p.x1;
  const D = p.z1;
  const dirt = M('#8f7a58', 0.95);
  // kıvrımlı ana yol: girişten (yerel +z) köyün içine
  const way = [[0, D + 2], [4, 30], [-6, 12], [-2, -6], [10, -24], [6, -38], [0, -D - 1]]; // arkadan vadi yoluna
  for (let i = 0; i < way.length - 1; i++) {
    const [ax, az] = way[i];
    const [bx, bz] = way[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    kit.box(6, 0.04, L + 3, dirt, (ax + bx) / 2, 0, (az + bz) / 2, { cast: false, ry: Math.atan2(bx - ax, bz - az) });
  }
  // ahşap evler yamaç boyunca
  const hs = [[-24, 26, 0.2], [20, 30, -0.3], [-30, 2, 0.5], [24, 6, -0.4], [-26, -26, 0.1], [30, -20, -0.2], [-10, -44, 0.3], [26, -44, -0.1], [-42, -40, 0.6]];
  const roofs = ['#3d4a3d', '#4a3a3a', '#3a4450', '#5a3d26'];
  hs.forEach(([x, z, ry], i) => {
    woodHouse(kit, x, Y, z, ry + (x > 0 ? -PI / 2 : PI / 2), { w: 8 + (i % 2), d: 7, seed: i, roof: roofs[i % roofs.length] });
    if (i % 3 === 0) kit.item('tree', x + 6, z + 5, 0, 0, { y: Y });
  });
  // ahşap cami (küçük)
  {
    const g = new THREE.Group();
    g.position.set(-2, Y, -22);
    kit.group.add(g);
    const wood = M('#7a5634', 0.85);
    const roofM = M('#5a6470', 0.5, 0.5);
    const a = (geo, m, x, y, z) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      g.add(o);
      return o;
    };
    a(new THREE.BoxGeometry(8, 4.4, 9), wood, 0, 2.2, 0);
    a(new THREE.ConeGeometry(6.6, 3, 4), roofM, 0, 5.9, 0).rotation.y = PI / 4;
    a(new THREE.BoxGeometry(1.4, 9, 1.4), wood, 5.2, 4.5, -3.6);
    a(new THREE.ConeGeometry(1.1, 2.6, 4), roofM, 5.2, 10.3, -3.6).rotation.y = PI / 4;
    a(new THREE.BoxGeometry(2, 2.4, 0.1), M('#3a2a1a', 0.7), 0, 1.2, 4.52);
    kit.solid(-2, -22, 4.2, 4.7);
    kit.solid(3.2, -25.6, 0.8, 0.8);
  }
  // ÇAY BAHÇESİ (çınar altında)
  const cb = { x: 14, z: 14 };
  bigTree(kit, cb.x, Y, cb.z, 1.3);
  for (let i = 0; i < 6; i++) {
    const tx = cb.x - 7 + (i % 3) * 5;
    const tz = cb.z + 5 + Math.floor(i / 3) * 4;
    kit.item('plastikmasa', tx, tz, 0, 0, { y: Y });
    kit.item('plastiktabure', tx - 1, tz + 0.9, 0, 0, { y: Y });
    kit.item('plastiktabure', tx + 1, tz + 0.9, 0, 0, { y: Y });
  }
  kit.item('caysemaver', cb.x + 6, cb.z, 2, 0, { y: Y });
  kit.box(0.14, 2.4, 0.14, M('#6b4a2e', 0.85), cb.x + 9, Y, cb.z + 11);
  kit.sign(`${p.key}_cay`, 'YAYLA ÇAY BAHÇESİ', 0.5, cb.x + 9, Y + 2.6, cb.z + 11.08, 0, { color: '#fff6dc', bg: '#3f5a2a', font: '900 100px Arial, sans-serif', light: false });
  // HIZAR + tomruk yığınları
  const hz = { x: -34, z: 28 };
  kit.box(10, 0.25, 6, M('#6b4a2e', 0.85), hz.x, Y, hz.z);
  for (const [dx, dz] of [[-4.8, -2.8], [4.8, -2.8], [-4.8, 2.8], [4.8, 2.8]]) kit.box(0.25, 3.6, 0.25, M('#5a3d26', 0.85), hz.x + dx, Y, hz.z + dz);
  kit.box(11, 0.3, 7, M('#5a5a5a', 0.6, 0.5), hz.x, Y + 3.6, hz.z);
  kit.cyl(0.6, 0.6, 0.08, M('#c9ccd2', 0.3, 0.9), hz.x, Y + 1.2, hz.z, 20, { rx: PI / 2 });
  kit.solid(hz.x, hz.z, 5, 3);
  const logM = M('#8a6a45', 0.85);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 5 - r; k++) kit.cyl(0.32, 0.32, 6, logM, hz.x - 2 + k * 0.66 + r * 0.33, Y + 0.32 + r * 0.56, hz.z + 7, 10, { rz: PI / 2, ry: PI / 2 });
  kit.solid(hz.x, hz.z + 7, 2, 3.1);
  kit.sign(`${p.key}_hizar`, 'HIZAR', 0.45, hz.x, Y + 4.2, hz.z + 3.55, 0, { color: '#ffffff', bg: '#6b4a2e', font: '900 100px Arial, sans-serif', light: false });
  // ARI KOVANLARI
  const cols = ['#2f6fb8', '#ffd23f', '#f2efe6', '#2f8f4a', '#c8501a'];
  for (let i = 0; i < 10; i++) {
    const x = 34 + (i % 5) * 1.8;
    const z = 28 + Math.floor(i / 5) * 2.4;
    kit.box(0.7, 0.8, 0.6, M(cols[i % cols.length], 0.6), x, Y + 0.3, z);
    kit.box(0.8, 0.08, 0.7, M('#d8d2c4', 0.7), x, Y + 1.1, z);
    kit.box(0.1, 0.3, 0.1, M('#5a3d26'), x, Y, z);
  }
  kit.solid(37.6, 29.2, 4.6, 2.2);
  fenceRun(kit, 31, 25, 46, 25, Y);
  // keçi ağılı
  const ag = [-46, -18, -34, -4];
  fenceRun(kit, ag[0], ag[1], ag[2], ag[1], Y);
  fenceRun(kit, ag[2], ag[1], ag[2], ag[3] - 4, Y);
  fenceRun(kit, ag[0], ag[3], ag[2] - 4, ag[3], Y);
  fenceRun(kit, ag[0], ag[1], ag[0], ag[3], Y);
  for (const [x, z] of [[-44, -6], [-36, -16]]) kit.item('hay', x, z, 0, 0, { y: Y });
  // çam ağaçları köy içinde
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39;
    const r = 30 + (i % 4) * 7;
    const x = Math.cos(a) * r * 1.1;
    const z = Math.sin(a) * r * 0.9;
    if (Math.abs(x) < 9 && Math.abs(z) < 40) continue;
    kit.item('tree', x, z, 0, 0, { y: Y });
  }
  // çeşme (taş, oluklu)
  kit.box(3, 1.6, 0.8, M('#a8a094', 0.95), -10, Y, 4);
  kit.box(2.6, 0.5, 1.2, M('#6fa3b8', 0.1, 0.2), -10, Y, 4.9);
  kit.solid(-10, 4.4, 1.5, 0.9);
  // giriş tabelası
  kit.box(0.14, 2.6, 0.14, M('#9aa0a8', 0.4, 0.7), 5, Y, D - 4);
  kit.sign(`${p.key}_giris`, p.name.toUpperCase(), 0.7, 5, Y + 2.8, D - 3.91, 0, { color: '#ffffff', bg: '#1d4f9a', font: '900 100px Arial, sans-serif', light: false });
  kit.solid(5, D - 4, 0.12, 0.12);
  for (const [x, z] of [[4, 34], [-4, 14], [0, -8], [8, -30]]) kit.item('streetlamp', x, z, 0, 0, { y: Y });
  // hayvanlar
  const yard = [-W + 6, -D + 6, W - 6, D - 6];
  for (let i = 0; i < 8; i++) ctx.animals.push({ kind: 'keci', x: -42 + (i % 3) * 2, z: -14 + Math.floor(i / 3) * 2.5, v: i, area: [ag[0] + 1, ag[1] + 1, ag[2] - 1, ag[3] - 1], homeR: 8 });
  for (let i = 0; i < 10; i++) ctx.animals.push({ kind: 'tavuk', x: 18 + (i % 4) * 1.2, z: -12 + Math.floor(i / 4) * 1.4, v: i + 3, area: yard, homeR: 10 });
  ctx.animals.push({ kind: 'inek', x: 34, z: -6, v: 1, area: [26, -14, 46, 4] });
  ctx.animals.push({ kind: 'inek', x: 40, z: -2, v: 4, area: [26, -14, 46, 4] });
  fenceRun(kit, 26, -14, 46, -14, Y);
  fenceRun(kit, 26, 4, 46, 4, Y);
  fenceRun(kit, 46, -14, 46, 4, Y);
  fenceRun(kit, 26, -14, 26, -6, Y);
  ctx.animals.push({ kind: 'kopek', x: 0, z: 22, v: 2, area: yard, homeR: 26 });
  // köylüler
  ctx.npc.push({ x: cb.x + 4.6, z: cb.z + 1.5, name: 'Çaycı Selim', av: { clothing: 'vest', clothColor: '#3a2a1a', hat: 'cap', hatColor: '#1a1a1a', facialHair: 'mustache', pantsColor: '#2a2420' }, lines: ['Demlik yeni demlendi, buyur!', 'Yaylanın havası başka.'] });
  ctx.npc.push({ x: cb.x - 5, z: cb.z + 6, name: 'Muhtar Kâzım', av: { clothing: 'jacket', clothColor: '#2a3a4a', hat: 'cap', hatColor: '#2a2420', facialHair: 'full', hairColor: '#e8e2d8', pantsColor: '#2a2420' }, lines: [`${p.name}'ne hoş geldin!`, 'Kervankent\'e tırlar bizim yoldan geçer.'] });
  ctx.npc.push({ x: 36, z: 24, name: 'Arıcı Hasan', av: { clothing: 'jacket', clothColor: '#f2efe6', hat: 'cap', hatColor: '#f2efe6', pantsColor: '#3a3226' }, lines: ['Çam balı bu, başka yerde bulamazsın.', 'Kovanlara çok yaklaşma!'] });
  ctx.npc.push({ x: hz.x + 3, z: hz.z + 4, name: 'Hızarcı Rıfat', av: { clothing: 'vest', clothColor: '#c8501a', hat: 'cap', hatColor: '#ffd23f', pantsColor: '#2b3550' }, lines: ['Tomruklar yarın kesilecek.', 'Kış için odun lazım mı?'] });
  ctx.npc.push({ x: -40, z: -2, name: 'Zehra Teyze', av: { gender: 'f', clothing: 'dress', clothColor: '#8a3a2a', hat: 'scarf', hatColor: '#f2e6b8', pantsColor: '#3a3226' }, lines: ['Keçi peyniri yaptım, tadına bak.', 'Keçiler yine çiti zorluyor.'] });
  ctx.npc.push({ x: 2, z: 8, name: 'Emre', av: { clothing: 'tshirt', clothColor: '#2f6fb8', pantsColor: '#3a3226' }, lines: ['Derede balık var biliyor musun?'] });
  return [
    { x: cb.x, z: cb.z + 6, r: 6, acts: [{ id: 'cay', label: '☕ Çay · ₺10' }, { id: 'gozleme', label: '🫓 Gözleme · ₺60' }], foot: true },
    { x: 36, z: 26, r: 4, acts: [{ id: 'bal', label: '🍯 Çam balı · ₺250' }], foot: true },
    { x: -10, z: 5.4, r: 2, acts: [{ id: 'su', label: '💧 Çeşmeden su iç' }], foot: true },
  ];
}

// --- köy yolu (şerit) ---------------------------------------------------------------------
let brMat = null;
function branchMat() {
  if (brMat) return brMat;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4c51';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random() * 40 - 20;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = '#ece9df';
  g.fillRect(62, 0, 4, 56);
  g.fillRect(2, 0, 3, 128);
  g.fillRect(123, 0, 3, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  brMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  return brMat;
}
function buildBranch(group, b) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = b.pts.length;
  for (let i = 0; i < n; i++) {
    const a = b.pts[Math.max(0, i - 1)];
    const c = b.pts[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0];
    let tz = c[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const rx = -tz;
    const rz = tx;
    const [x, z] = b.pts[i];
    const yy = b.ys[i] + 0.07;
    const hw = BR_HALF + (b.flare0 ? b.flare0 * Math.max(0, 1 - b.S[i] / 10) ** 2 : 0); // kavşak ağzı genişler
    pos.push(x - rx * hw, yy, z - rz * hw, x + rx * hw, yy, z + rz * hw);
    uv.push(0, b.S[i] / 8, 1, b.S[i] / 8);
  }
  for (let i = 0; i < n - 1; i++) {
    if (b.bridge?.[i] && b.bridge?.[i + 1]) continue; // köprüde ahşap tabliye var
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  let mat = branchMat();
  if (b.kind === 'cakil' || b.kind === 'maden') {
    mat = ruinGravelMat();
    if (b.kind === 'maden') mat.color = new THREE.Color('#c9b896');
    mat.map = mat.map.clone();
    mat.map.repeat.set(1.8, 1);
    mat.map.needsUpdate = true;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -3;
    mat.polygonOffsetUnits = -3;
  }
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  group.add(m);
}

// --- giriş: tüm yol üstü ---------------------------------------------------------------
// Kuğu Gölü: seyir terasından göle inen ince patika + göl üstünde ahşap iskele-teras
function buildPier(root, kits, groundAt, npcs) {
  const { patika: pk, pier: q } = geo();
  if (!pk || !q) return;
  // patika şeridi (araziye serili, 1.5 m)
  const pos = [];
  const idx = [];
  const uv = [];
  const n = pk.pts.length;
  let S = 0;
  for (let i = 0; i < n; i++) {
    const a = pk.pts[Math.max(0, i - 1)];
    const c = pk.pts[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0];
    let tz = c[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i) S += Math.hypot(pk.pts[i][0] - pk.pts[i - 1][0], pk.pts[i][1] - pk.pts[i - 1][1]);
    const [x, z] = pk.pts[i];
    for (let k = 0; k <= 4; k++) {
      const o = (k / 4 - 0.5) * pk.half * 2;
      const px = x - tz * o;
      const pz = z + tx * o;
      pos.push(px, groundAt(px, pz) + 0.05, pz);
      uv.push(k / 4, S / 3);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) {
    const a = i * 5 + k;
    idx.push(a, a + 5, a + 1, a + 1, a + 5, a + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  const pm = new THREE.MeshStandardMaterial({ color: '#9b8462', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const path = new THREE.Mesh(g, pm);
  path.receiveShadow = true;
  root.add(path);
  // iskele (yerel +z: göle doğru)
  const kit = new Kit('gol_iskele');
  kit.group.position.set(q.x, 0, q.z);
  kit.group.rotation.y = Math.atan2(q.ux, q.uz);
  root.add(kit.group);
  kits.push(kit);
  const wood = M('#8a6a45', 0.85);
  const dark = M('#5e4630', 0.9);
  const Y = q.y; // güverte üstü
  const W = 1.1;
  const L0 = q.L0; // kıyıda karadan başlar
  const LW = q.Lw;
  const L1 = q.Lw + q.PL;
  const PW = q.PW;
  // tahtalar (enine, aralıklı)
  for (let u = L0; u < LW; u += 0.32) kit.box(W * 2, 0.08, 0.28, wood, 0, Y - 0.08, u + 0.14, { cast: false });
  for (let u = LW; u < L1; u += 0.32) kit.box(PW * 2, 0.08, 0.28, wood, 0, Y - 0.08, u + 0.14, { cast: false });
  // kirişler + kazıklar (suya iner)
  for (const x of [-W + 0.15, W - 0.15]) kit.box(0.18, 0.22, LW - L0, dark, x, Y - 0.3, (L0 + LW) / 2);
  for (const x of [-PW + 0.2, 0, PW - 0.2]) kit.box(0.2, 0.22, q.PL, dark, x, Y - 0.3, (LW + L1) / 2);
  const pile = (x, u) => kit.cyl(0.13, 0.15, Y + 1.8, dark, x, -1.8, u, 8);
  for (let u = L0 + 1.5; u < LW; u += 3.5) for (const x of [-W + 0.15, W - 0.15]) pile(x, u);
  for (const u of [LW + 0.3, LW + q.PL / 2, L1 - 0.3]) for (const x of [-PW + 0.2, 0, PW - 0.2]) pile(x, u);
  // korkuluklar: dikmeler + iki kuşak
  const rail = (ax, au, bx, bu) => {
    const len = Math.hypot(bx - ax, bu - au);
    const ry = Math.atan2(bx - ax, bu - au);
    for (const h of [0.55, 1.0]) kit.box(0.07, 0.07, len, wood, (ax + bx) / 2, Y + h, (au + bu) / 2, { ry });
    const k = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= k; i++) kit.box(0.1, 1.08, 0.1, dark, ax + ((bx - ax) * i) / k, Y, au + ((bu - au) * i) / k);
  };
  rail(-W, L0 + 1.2, -W, LW);
  rail(W, L0 + 1.2, W, LW);
  rail(-PW, LW, -W, LW);
  rail(W, LW, PW, LW);
  rail(-PW, LW, -PW, L1);
  rail(PW, LW, PW, L1);
  rail(-PW, L1, PW, L1); // göle dönük ön korkuluk
  // göle bakan banklar + dürbün + fener
  for (const x of [-2.6, 2.6]) kit.item('parkbench', x, L1 - 1.6, 0, 0, { y: Y, solid: false });
  binocular(kit, 0, Y, L1 - 0.6, 0);
  kit.box(0.14, 2.6, 0.14, dark, PW - 0.3, Y, LW + 0.3);
  kit.box(0.34, 0.4, 0.34, glowMat('#ffd89a', 1.6), PW - 0.3, Y + 2.6, LW + 0.3, { cast: false });
  // bilgi panosu (iskele başında, kıyıda)
  for (const sx of [-1.1, 1.1]) kit.box(0.1, 1.3, 0.1, dark, W + 2.2 + sx, Y - 0.25, L0 + 1.4);
  kit.box(2.5, 0.9, 0.08, dark, W + 2.2, Y - 0.25 + 1.0, L0 + 1.4);
  kit.box(2.8, 0.12, 0.3, dark, W + 2.2, Y - 0.25 + 1.9, L0 + 1.4);
  kit.sign('golseyir_info', 'KUĞU GÖLÜ · kuğu, balıkçıl, yaban ördeği', 0.28, W + 2.2, Y - 0.25 + 1.45, L0 + 1.35, PI, { color: '#ffffff', bg: '#2f5f3a', font: '800 80px Arial, sans-serif', light: false });
  kit.solid(W + 2.2, L0 + 1.4, 1.25, 0.1);
  // kuşçu (platformda, dünya koordinatı)
  const nu = LW + 2.4;
  const nv = 2.8;
  npcs.push({ world: true, x: q.x + q.ux * nu + q.uz * nv, z: q.z + q.uz * nu - q.ux * nv, y: Y, name: 'Kuşçu Nermin', av: { gender: 'f', clothing: 'jacket', clothColor: '#4a6a3a', hat: 'cap', hatColor: '#c9b48c', pantsColor: '#3a3226' }, lines: ['Sabah üç kuğu saydım!', 'Dürbünle karşı kıyıya bak, balıkçıllar orada.'] });
  signPost(kit, 'gol_iskele_t', 'KUĞU İSKELESİ', -W - 0.7, Y - 0.25, L0 + 0.6, PI, { bg: '#5e4630', h: 0.45, pole: 1.6 });
}

export function buildRoadside(groundAt = () => 0) {
  const { pads, branches } = geo();
  const root = new THREE.Group();
  root.name = 'yol_ustu';
  const kits = [];
  const npcs = [];
  pads.forEach((p) => {
    const kit = new Kit(`cep_${p.key}`);
    kit.group.position.set(p.cx, p.y0, p.cz);
    kit.group.rotation.y = p.ry;
    root.add(kit.group);
    kits.push(kit);
    const ctx = { npc: [], animals: [] };
    const fn = B[p.kind];
    p.zones = fn ? fn(kit, p, ctx) || [] : [];
    p.kit = kit;
    p.kantarSign = ctx.kantarSign || null;
    ctx.npc.forEach((n) => npcs.push({ ...n, pad: p }));
    p.animals = ctx.animals;
  });
  buildPier(root, kits, groundAt, npcs);
  // köy yolları + otoyolda sapak tabelası
  const sk = new Kit('sapak_tabelalari');
  root.add(sk.group);
  kits.push(sk);
  const valleyWild = [];
  branches.forEach((b) => {
    buildBranch(root, b);
    if (b.kind === 'vadi') {
      buildValley(sk, b, valleyWild, npcs, groundAt);
      return;
    }
    if (b.s == null) return;
    const v = pads.find((q) => q.key === b.key);
    const nm = b.signName || v?.name || '';
    for (const sJ of [b.s, b.s2].filter((q) => q != null)) {
      for (const dir of [-1, 1]) {
        // her iki yönden gelen için, sapaktan 60 m önce
        const sS = sJ - dir * 60;
        const f = frameAt(sS);
        const side = dir > 0 ? 1 : -1; // gidiş yönünde sağ, dönüşte sol
        const x = f.x + f.rx * side * (ROAD_HALF + 2.4);
        const z = f.z + f.rz * side * (ROAD_HALF + 2.4);
        const face = Math.atan2(f.tx, f.tz) + (dir > 0 ? PI : 0);
        sk.box(0.16, 3.6, 0.16, M('#9aa0a8', 0.4, 0.7), x, f.y, z);
        const arrow = b.side === side ? '→' : '←';
        const txt = b.side > 0 ? `${nm} ${dir > 0 ? '→' : '←'}` : `${nm} ${arrow}`;
        sk.sign(`sapak_${b.key}_${sJ}_${dir}`, txt, 0.85, x, f.y + 3.9, z, face, { color: '#ffffff', bg: '#1d4f9a', font: '900 100px Arial, sans-serif', light: false });
      }
    }
  });
  return { root, kits, npcs, valleyWild };
}

// --- AKÇAY VADİSİ KÖY YOLU: köy köprüsü, tabelalar, yayla evi, çeşme + yaban hayvanı yerleri ---------
function buildValley(kit, b, wild, npcs, groundAt) {
  const at = (i) => {
    const a = b.pts[Math.max(0, i - 1)];
    const c = b.pts[Math.min(b.pts.length - 1, i + 1)];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    return { x: b.pts[i][0], z: b.pts[i][1], y: b.ys[i], tx: (c[0] - a[0]) / l, tz: (c[1] - a[1]) / l };
  };
  // AHŞAP KÖY KÖPRÜSÜ: kalas tabliye, kütük ayaklar, ahşap korkuluk, taş kenar ayakları
  const [bi, bj] = b.bridgeRange;
  const A = at(bi - 1);
  const Bq = at(bj + 1);
  const len = Math.hypot(Bq.x - A.x, Bq.z - A.z) + 0.6; // yolla uç uca (üst üste binmez)
  const mx = (A.x + Bq.x) / 2;
  const mz = (A.z + Bq.z) / 2;
  const yaw = Math.atan2(Bq.x - A.x, Bq.z - A.z);
  const deck = b.deck + 0.07;
  const wood = M('#9b7a52', 0.85);
  const plankDark = M('#5a4028', 0.9);
  const W = BR_HALF * 2 + 0.6;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  // tabliye: enine kalaslar
  const NP = Math.ceil(len / 0.5);
  const plank = new THREE.BoxGeometry(W, 0.12, 0.46);
  const pi = new THREE.InstancedMesh(plank, wood, NP);
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  for (let k = 0; k < NP; k++) {
    const t = -len / 2 + (k + 0.5) * (len / NP);
    mm.compose(new THREE.Vector3(mx + fx * t, deck - 0.06 + (k % 3) * 0.004, mz + fz * t), q, new THREE.Vector3(1, 1, 1));
    pi.setMatrixAt(k, mm);
  }
  pi.castShadow = true;
  pi.receiveShadow = true;
  kit.add(pi);
  // boyuna kirişler
  for (const s of [-1, 0, 1]) kit.box(0.35, 0.45, len, plankDark, mx + rx * s * (W / 2 - 0.4), deck - 0.57, mz + rz * s * (W / 2 - 0.4), { ry: yaw });
  // korkuluk: dikmeler + iki küpeşte
  for (const s of [-1, 1]) {
    const ox = rx * s * (W / 2 + 0.05);
    const oz = rz * s * (W / 2 + 0.05);
    for (let t = -len / 2; t <= len / 2 + 0.01; t += 2) kit.box(0.14, 1.05, 0.14, plankDark, mx + ox + fx * t, deck, mz + oz + fz * t);
    kit.box(0.1, 0.12, len, wood, mx + ox, deck + 0.98, mz + oz, { ry: yaw });
    kit.box(0.08, 0.08, len, wood, mx + ox, deck + 0.55, mz + oz, { ry: yaw });
  }
  // kütük ayaklar (suya iner) + karada taş ayaklar
  const log = M('#4a3626', 0.95);
  for (let t = -len / 2 + 10; t < len / 2 - 8; t += 10) {
    for (const s of [-1, 1]) {
      const px = mx + fx * t + rx * s * (W / 2 - 0.5);
      const pz = mz + fz * t + rz * s * (W / 2 - 0.5);
      const gy = Math.min(groundAt(px, pz), -9.5);
      kit.cyl(0.28, 0.32, deck - 0.6 - gy, log, px, gy, pz, 8);
    }
  }
  const stone = M('#8a857a', 0.95);
  for (const t of [-len / 2 + 2, len / 2 - 2]) {
    const px = mx + fx * t;
    const pz = mz + fz * t;
    const gy = Math.min(groundAt(px, pz), deck - 1.2);
    kit.box(W + 1, deck - 0.62 - (gy - 1.5), 4, stone, px, gy - 1.5, pz, { ry: yaw }); // üstü tabliyenin altında kalır
  }
  // tabelalar (iki uçta)
  for (const i of [30, b.pts.length - 30]) {
    const p = at(i);
    const x = p.x - p.tz * (BR_HALF + 1.6);
    const z = p.z + p.tx * (BR_HALF + 1.6);
    kit.box(0.14, 2.8, 0.14, M('#9aa0a8', 0.4, 0.7), x, p.y, z);
    kit.sign(`vadi_t${i}`, i < 100 ? 'AKÇAY VADİSİ · ÇAMLICA 3,6 km' : 'AKÇAY VADİSİ · GÖLYAKA 3,6 km', 0.5, x, p.y + 3.0, z, Math.atan2(p.tx, p.tz) + (i < 100 ? PI : 0), { color: '#ffffff', bg: '#6b4a2e', font: '900 100px Arial, sans-serif', light: false });
  }
  // TARİHİ YAPI: Akçay Su Kemeri (Roma, harabe) — yolun ilk kısmında, yola paralel, iki katlı kemerler
  {
    const i = Math.floor(b.pts.length * 0.13);
    const p = at(i);
    const side = (() => {
      const a1 = groundAt(p.x - p.tz * 40, p.z + p.tx * 40);
      const a2 = groundAt(p.x + p.tz * 40, p.z - p.tx * 40);
      return a1 >= a2 ? 1 : -1;
    })();
    const ox = -p.tz * side;
    const oz = p.tx * side;
    const cx = p.x + ox * 42;
    const cz = p.z + oz * 42;
    const ry = Math.atan2(p.tx, p.tz); // kemer hattı yol boyunca
    const stoneC = M('#cdb994', 0.95);
    const stoneD = M('#b29c74', 0.95);
    const bay = 7;
    const n = 16;
    let gmax = -1e9;
    for (let k = 0; k < n; k++) {
      const t = (k - (n - 1) / 2) * bay;
      gmax = Math.max(gmax, groundAt(cx + p.tx * t, cz + p.tz * t));
    }
    const top = gmax + 14;
    const archPanel = (w, h, r) => {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2, 0);
      sh.lineTo(w / 2, 0);
      sh.lineTo(w / 2, h);
      sh.lineTo(-w / 2, h);
      sh.lineTo(-w / 2, 0);
      const ho = new THREE.Path();
      ho.moveTo(-r, 0);
      ho.lineTo(-r, h - r - 0.6);
      ho.absarc(0, h - r - 0.6, r, PI, 0, true);
      ho.lineTo(r, 0);
      ho.lineTo(-r, 0);
      sh.holes.push(ho);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, -1.2);
      return g;
    };
    const lowerG = archPanel(bay, 8, 2.5);
    const upperG = archPanel(bay / 2, 4.2, 1.2);
    for (let k = 0; k < n; k++) {
      if (k === 6 || k === 7 || k === 13) continue; // yıkık açıklıklar
      const t = (k - (n - 1) / 2) * bay;
      const x = cx + p.tx * t;
      const z = cz + p.tz * t;
      const gy = groundAt(x, z);
      const base = top - 13.2;
      // ayak: zemine kadar uzanır
      kit.box(1.8, base - gy + 0.6, 2.6, stoneD, x - p.tx * (bay / 2 - 0.9), gy - 0.6, z - p.tz * (bay / 2 - 0.9), { ry });
      const lo = kit.mesh(lowerG, k % 2 ? stoneC : stoneD, x, base, z, ry + PI / 2);
      lo.castShadow = true;
      if (k % 5 !== 2) {
        for (const h of [-1, 1]) {
          const up = kit.mesh(upperG, stoneC, x + p.tx * h * (bay / 4), base + 8, z + p.tz * h * (bay / 4), ry + PI / 2);
          up.castShadow = true;
        }
        kit.box(bay, 0.8, 2.6, stoneD, x, base + 12.2, z, { ry: ry + PI / 2 }); // su kanalı
      }
      kit.solid(x - p.tx * (bay / 2 - 0.9), z - p.tz * (bay / 2 - 0.9), 0.9, 1.3, ry);
    }
    // devrilmiş taş blokları + sütun parçaları
    for (let k = 0; k < 9; k++) {
      const t = (6.5 - (n - 1) / 2) * bay + (k - 4) * 1.6;
      const x = cx + p.tx * t + ox * ((k % 3) - 1) * 2.2;
      const z = cz + p.tz * t + oz * ((k % 3) - 1) * 2.2;
      kit.box(1.4, 0.9, 1.1, k % 2 ? stoneC : stoneD, x, groundAt(x, z) - 0.2, z, { ry: k * 0.7 });
    }
    for (let k = 0; k < 3; k++) {
      const x = cx - ox * 8 + p.tx * (k * 4 - 4);
      const z = cz - oz * 8 + p.tz * (k * 4 - 4);
      kit.cyl(0.55, 0.6, 2.6, stoneC, x, groundAt(x, z) + 0.5, z, 12, { rz: PI / 2, ry: k });
    }
    // bilgi tabelası (yol kenarı)
    const sx = p.x + ox * (BR_HALF + 2);
    const sz = p.z + oz * (BR_HALF + 2);
    kit.box(0.14, 2.2, 0.14, M('#6b4a2e', 0.85), sx, p.y, sz);
    kit.sign('sukemeri', 'AKÇAY SU KEMERİ · MS 2. yüzyıl', 0.5, sx, p.y + 2.45, sz, ry + PI / 2 * side, { color: '#3a2a1a', bg: '#e8d8b0', font: '900 90px Georgia, serif', light: false });
    b.kemer = { x: cx, z: cz, top };
  }
  // yolun yamaç (nehrin ters) tarafı: arazisi yola en yakın / yüksek olan yan
  const uphill = (p, d) => {
    const a = groundAt(p.x - p.tz * d, p.z + p.tx * d);
    const c = groundAt(p.x + p.tz * d, p.z - p.tx * d);
    return a >= c ? 1 : -1;
  };
  // yayla evi + çoban + koyunlar (yamaç tarafında, köşelerdeki en alçak zemine oturur)
  {
    const i = Math.floor(b.pts.length * 0.42);
    const p = at(i);
    const side = uphill(p, 16);
    const nx = -p.tz * side; // yoldan eve doğru
    const nz = p.tx * side;
    const hx = p.x + nx * 15;
    const hz = p.z + nz * 15;
    const ry = Math.atan2(nx, nz); // ön yüz (yerel +z) yola baksın → ters
    const face = ry + PI;
    const HW = 3.6;
    const HD = 2.9;
    const corners = [[-HW, -HD], [HW, -HD], [-HW, HD], [HW, HD]].map(([lx, lz]) => {
      const c = Math.cos(face);
      const sn = Math.sin(face);
      return groundAt(hx + lx * c + lz * sn, hz - lx * sn + lz * c);
    });
    const gLow = Math.min(...corners);
    const gHigh = Math.max(...corners);
    const fy = gHigh + 0.15; // zemin kotu: en yüksek köşenin hemen üstü
    const g = new THREE.Group();
    g.position.set(hx, 0, hz);
    g.rotation.y = face;
    kit.group.add(g);
    const add = (geo, m, x, y, z, r = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.y = r;
      o.castShadow = true;
      o.receiveShadow = true;
      g.add(o);
      return o;
    };
    const stoneM = M('#9a948a', 0.95);
    const woodM = M('#6b4a2e', 0.85);
    const roofM = new THREE.MeshStandardMaterial({ color: '#4a3a2e', roughness: 0.85, side: THREE.DoubleSide });
    // taş temel: en alçak köşeye kadar iner
    add(new THREE.BoxGeometry(HW * 2 + 0.4, fy - gLow + 0.6, HD * 2 + 0.4), M('#7f7a70', 0.95), 0, (fy + gLow - 0.6) / 2, 0);
    add(new THREE.BoxGeometry(HW * 2, 2.4, HD * 2), stoneM, 0, fy + 1.2, 0); // taş zemin kat
    add(new THREE.BoxGeometry(HW * 2 + 0.3, 1.8, HD * 2 + 0.3), woodM, 0, fy + 3.3, 0); // ahşap üst kat
    const roof = add(prism(HW * 2 + 1.2, HD * 2 + 1.4, 2.0), roofM, 0, fy + 4.2, 0);
    roof.rotation.y = PI / 2;
    roof.scale.set((HD * 2 + 1.4) / (HW * 2 + 1.2), 1, (HW * 2 + 1.2) / (HD * 2 + 1.4));
    add(new THREE.BoxGeometry(0.6, 1.8, 0.6), stoneM, HW * 0.5, fy + 5.2, -HD * 0.3); // baca
    add(new THREE.BoxGeometry(1.1, 2.0, 0.1), M('#3a2a1a', 0.8), -1.4, fy + 1.0, HD + 0.03); // kapı
    for (const wx of [1.2, 2.6]) add(new THREE.BoxGeometry(0.8, 0.8, 0.1), M('#2a3440', 0.2, 0.3), wx, fy + 1.4, HD + 0.03);
    for (const wx of [-2.2, 0, 2.2]) add(new THREE.BoxGeometry(0.8, 0.7, 0.1), M('#2a3440', 0.2, 0.3), wx, fy + 3.3, HD + 0.2);
    // kapı önü taş basamak
    add(new THREE.BoxGeometry(1.6, fy - corners[2] + 0.2, 1.0), stoneM, -1.4, (fy + Math.min(corners[2], corners[3])) / 2 - 0.1, HD + 0.6);
    kit.solid(hx, hz, HW + 0.3, HD + 0.3, face);
    kit.blocker(HW * 2, 6, HD * 2, hx, fy, hz);
    // kamp ateşi + bank (ev ile yol arasında)
    const cx = hx - nx * 6;
    const cz = hz - nz * 6;
    kit.item('campfire', cx, cz, 0, 0, { y: groundAt(cx, cz) });
    const bx = cx + p.tx * 2.5;
    const bz = cz + p.tz * 2.5;
    const bench = kit.item('parkbench', bx, bz, 0, 0, { y: groundAt(bx, bz) });
    if (bench) bench.rotation.y = Math.atan2(cx - bx, cz - bz);
    npcs.push({ name: 'Çoban Mustafa', x: cx - p.tx * 2, z: cz - p.tz * 2, y: groundAt(cx - p.tx * 2, cz - p.tz * 2), world: true, av: { clothing: 'jacket', clothColor: '#5a4a3a', hat: 'cap', hatColor: '#2a2420', facialHair: 'full', pantsColor: '#3a3226' }, lines: ['Yaylada sürü otlatıyorum.', 'Gece kurtlar iner, köpeğim nöbette.', 'Vadide ayı izi gördüm, dikkat et.'] });
    // koyunlar evin arkasındaki çayırda
    for (let k = 0; k < 12; k++) {
      const d = 26 + Math.floor(k / 4) * 2.5;
      wild.push({ kind: 'koyun', x: p.x + nx * d + p.tx * (-4 + (k % 4) * 2.4), z: p.z + nz * d + p.tz * (-4 + (k % 4) * 2.4), v: k, homeR: 16 });
    }
    wild.push({ kind: 'kopek', x: cx + p.tx * 4, z: cz + p.tz * 4, v: 0, homeR: 20 });
    b.yayla = { x: hx, z: hz, fy, gLow, gHigh, face, road: { x: p.x, z: p.z, y: p.y } };
  }
  // çeşme: yamaç tarafında yol kenarı, taş gövde araziye oturur
  {
    const p = at(Math.floor(b.pts.length * 0.7));
    const side = uphill(p, 6);
    const x = p.x - p.tz * (BR_HALF + 1.8) * side;
    const z = p.z + p.tx * (BR_HALF + 1.8) * side;
    const gy = Math.min(groundAt(x, z), p.y);
    const ry = Math.atan2(p.tx, p.tz);
    kit.box(2.6, p.y - gy + 1.8, 0.8, M('#a8a094', 0.95), x, gy - 0.2, z, { ry: ry + PI / 2 });
    kit.box(2.2, 0.45, 1.0, M('#8f887c', 0.95), x + p.tz * 0.85 * side, p.y - 0.05, z - p.tx * 0.85 * side, { ry: ry + PI / 2 });
    kit.box(2.0, 0.06, 0.8, M('#6fa3b8', 0.1, 0.2), x + p.tz * 0.85 * side, p.y + 0.36, z - p.tx * 0.85 * side, { ry: ry + PI / 2, cast: false });
    kit.cyl(0.04, 0.04, 0.35, M('#c9ccd2', 0.3, 0.9), x + p.tz * 0.45 * side, p.y + 1.1, z - p.tx * 0.45 * side, 6, { rx: PI / 2 });
    kit.solid(x, z, 1.4, 0.9, ry + PI / 2);
  }
  // yaban hayvanları: yol boyunca dağlık yamaçlarda
  const kinds = [['karaca', 5], ['domuz', 4], ['tilki', 3], ['kurt', 4], ['ayi', 2], ['keci', 6], ['tavsan', 5], ['sincap', 5]];
  let n = 0;
  kinds.forEach(([k, c]) => {
    for (let q = 0; q < c; q++) {
      const i = Math.floor(((n * 0.137 + 0.08) % 0.92) * b.pts.length);
      const p = at(i);
      const off = (n % 2 ? 1 : -1) * (22 + (n * 13) % 45);
      wild.push({ kind: k, x: p.x - p.tz * off, z: p.z + p.tx * off, v: q, homeR: k === 'ayi' || k === 'kurt' ? 90 : 50, valley: true });
      n++;
    }
  });
  for (let q = 0; q < 3; q++) {
    const p = at(Math.floor(b.pts.length * (0.25 + q * 0.25)));
    wild.push({ kind: 'kartal', x: p.x + 40, z: p.z, v: q, homeR: 60 + q * 15, valley: true });
  }
}

// kantar okuması
export function kantarText(ton) {
  return `${ton.toFixed(1).replace('.', ',')} t`;
}
export { geo, fromPad };
