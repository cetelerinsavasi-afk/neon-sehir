// =============================================================================
// v155 — ŞEHRİN İKİ DENİZİ
//   • BATI: sahil bulvarı (x = −120) → kordon → kumsallar, koy, burun, beach club,
//     su sporları iskelesi. Kumsal + deniz yürünür / yüzülür, araç kordonda durur.
//   • GÜNEY (sağ): liman solda kalır, sağda NEON MARİNA — mendirek, fener, iskeleler, tekneler.
// Tüm sayılar dünya koordinatı (cityLayout ile aynı). three.js + Kit; sunucu yok.
// =============================================================================
import * as THREE from 'three';
import { Kit, M, glowMat, floorMat, floorRep, planeGeo } from './kit.js';
import { COAST_Z, COAST_X, KORDON_X, OUTER } from './cityLayout.js';
import { SEA_Y, HEADLAND, shoreX, coastH, isRock } from './coastShape.js';
export { SEA_Y, HEADLAND, shoreX, coastH, isRock };

const PI = Math.PI;


// --- YÜRÜNEBİLİR İSKELELER (dünya dikdörtgenleri; y = güverte) ------------------------------
export const DECKS = [];
const deck = (x0, z0, x1, z1, y = -0.05, name = '') => DECKS.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y, name });

// --- malzemeler ------------------------------------------------------------------------
const MATS = {};
function mats() {
  if (MATS.sand) return MATS;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e6d3a3';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(120,95,50,${Math.random() * 0.16})` : `rgba(255,250,235,${Math.random() * 0.25})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  MATS.sand = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.97 });
  const w = document.createElement('canvas');
  w.width = w.height = 128;
  const wg = w.getContext('2d');
  wg.fillStyle = '#9b7a52';
  wg.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {
    wg.fillStyle = i % 2 ? '#8d6d47' : '#a5845a';
    wg.fillRect(0, i * 16, 128, 15);
    wg.fillStyle = 'rgba(0,0,0,0.35)';
    wg.fillRect(0, i * 16 + 15, 128, 1);
  }
  const wt = new THREE.CanvasTexture(w);
  wt.colorSpace = THREE.SRGBColorSpace;
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  MATS.wood = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.85 });
  MATS.foam = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
  return MATS;
}
function woodBox(kit, w, h, d, x, y, z, ry = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 2, uv.getY(i) * Math.max(0.3, Math.min(w, d)) / 2);
  return kit.mesh(geo, mats().wood, x, y + h / 2, z, ry, { cast: true });
}

// --- KUMSAL ZEMİNİ (ince ağ; kıyı çizgisini düzgün çizmek için) ----------------------------
export const BEACH_RECT = { x0: -360, x1: COAST_X, z0: -300, z1: COAST_Z + 8 };
function buildBeachMesh(kit, cell = 2) {
  const R = BEACH_RECT;
  const nx = Math.ceil((R.x1 - R.x0) / cell) + 1;
  const nz = Math.ceil((R.z1 - R.z0) / cell) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const sand = new THREE.Color('#ffffff');
  const wet = new THREE.Color('#a8957a');
  const deep = new THREE.Color('#4f6f73');
  const rock = new THREE.Color('#6d6a66');
  const grassC = new THREE.Color('#8fa36a');
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = Math.min(R.x1, R.x0 + i * cell);
      const z = Math.min(R.z1, R.z0 + j * cell);
      const h = coastH(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / 7;
      uv[k * 2 + 1] = z / 7;
      c.copy(sand);
      if (h < SEA_Y + 0.12) c.lerp(wet, Math.min(1, (SEA_Y + 0.12 - h) * 3));
      if (h < SEA_Y - 0.6) c.lerp(deep, Math.min(1, (SEA_Y - 0.6 - h) * 0.6));
      if (isRock(x, z)) c.copy(rock).multiplyScalar(0.85 + 0.3 * Math.abs(Math.sin(x * 1.3 + z)));
      if (z < -190 && h > 0.6) c.lerp(grassC, Math.min(1, (h - 0.6) * 0.8));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mats().sand);
  m.receiveShadow = true;
  m.name = 'kumsal';
  kit.add(m);
  // kıyıda köpük çizgisi
  const fpos = [];
  for (let z = R.z0; z < Math.min(R.z1, 74); z += 2) {
    const a = shoreX(z);
    const b = shoreX(z + 2);
    if (isRock(a + 1, z)) continue;
    fpos.push(a - 0.2, SEA_Y + 0.03, z, a + 1.4, SEA_Y + 0.03, z, b - 0.2, SEA_Y + 0.03, z + 2);
    fpos.push(a + 1.4, SEA_Y + 0.03, z, b + 1.4, SEA_Y + 0.03, z + 2, b - 0.2, SEA_Y + 0.03, z + 2);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  fg.computeVertexNormals();
  const foam = new THREE.Mesh(fg, mats().foam);
  foam.renderOrder = 2;
  kit.add(foam, true);
  kit.ticks.push({ obj: foam, ctl: { tick: (t) => { foam.material.opacity = 0.28 + 0.2 * Math.sin(t * 1.3); foam.position.x = -0.5 + Math.sin(t * 0.9) * 0.5; } } });
}

// --- TEKNELER ------------------------------------------------------------------------------
function hullShape(L, W) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -W / 2 * 0.86);
  s.lineTo(-L / 2, W / 2 * 0.86);
  s.quadraticCurveTo(-L * 0.36, W / 2, -L * 0.1, W / 2);
  s.quadraticCurveTo(L * 0.3, W / 2, L / 2, 0);
  s.quadraticCurveTo(L * 0.3, -W / 2, -L * 0.1, -W / 2);
  s.quadraticCurveTo(-L * 0.36, -W / 2, -L / 2, -W / 2 * 0.86);
  return s;
}
function hullMesh(L, W, H, mat) {
  const g = new THREE.ExtrudeGeometry(hullShape(L, W), { depth: H, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-PI / 2); // şekil xz düzlemine, ekstrüzyon +y
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const deckMatC = () => MATS.teak || (MATS.teak = new THREE.MeshStandardMaterial({ color: '#b8875a', roughness: 0.8 }));
// tür: 'yat' | 'yelken' | 'balikci' | 'surat' | 'jetski' | 'pedalo'
export function makeBoat(kind, L, color = '#f4f4f2', accent = '#16324f') {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, ry = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const white = M(color, 0.35, 0.1);
  const acc = M(accent, 0.4, 0.2);
  const glass = M('#13202c', 0.08, 0.6);
  const chrome = M('#d9dde2', 0.25, 0.9);
  if (kind === 'jetski') {
    g.add(hullMesh(L, L * 0.38, 0.45, white)).position.y = -0.25;
    add(new THREE.BoxGeometry(L * 0.42, 0.28, L * 0.2), acc, -L * 0.08, 0.32, 0);
    add(new THREE.BoxGeometry(0.1, 0.4, 0.6), chrome, L * 0.18, 0.55, 0);
    return g;
  }
  if (kind === 'pedalo') {
    for (const s of [-0.55, 0.55]) add(new THREE.CapsuleGeometry(0.28, L - 0.6, 4, 8), white, 0, 0.05, s).rotation.z = PI / 2;
    add(new THREE.BoxGeometry(L * 0.7, 0.12, 1.5), acc, 0, 0.32, 0);
    add(new THREE.BoxGeometry(0.5, 0.5, 1.3), acc, -L * 0.18, 0.6, 0);
    const slide = add(new THREE.BoxGeometry(1.2, 0.08, 0.5), M('#ffd23f', 0.4), L * 0.15, 0.9, 0);
    slide.rotation.z = -0.5;
    return g;
  }
  const W = kind === 'yelken' ? L * 0.3 : kind === 'balikci' ? L * 0.34 : L * 0.3;
  const H = kind === 'yat' ? Math.max(1.4, L * 0.11) : kind === 'surat' ? 0.9 : 1.2;
  const hull = hullMesh(L, W, H, white);
  hull.position.y = -0.55;
  g.add(hull);
  // su hattı şeridi
  const band = hullMesh(L * 1.004, W * 1.01, 0.22, acc);
  band.position.y = -0.48;
  g.add(band);
  const deckY = -0.55 + H + 0.12;
  const dk = new THREE.Mesh(new THREE.ShapeGeometry(hullShape(L * 0.96, W * 0.94)), kind === 'balikci' ? M('#8a6a45', 0.8) : deckMatC());
  dk.rotation.x = -PI / 2;
  dk.position.y = deckY + 0.01;
  dk.receiveShadow = true;
  g.add(dk);
  if (kind === 'yat') {
    // iki katlı üst yapı, koyu camlar, flybridge
    add(new THREE.BoxGeometry(L * 0.46, 1.25, W * 0.72), white, -L * 0.06, deckY + 0.62, 0);
    add(new THREE.BoxGeometry(L * 0.44, 0.5, W * 0.74), glass, -L * 0.04, deckY + 0.78, 0);
    add(new THREE.BoxGeometry(L * 0.3, 0.9, W * 0.62), white, -L * 0.12, deckY + 1.7, 0);
    add(new THREE.BoxGeometry(L * 0.28, 0.36, W * 0.64), glass, -L * 0.1, deckY + 1.78, 0);
    add(new THREE.BoxGeometry(L * 0.34, 0.08, W * 0.8), white, -L * 0.16, deckY + 2.2, 0);
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), chrome, -L * 0.14, deckY + 2.8, 0);
    // küpeşte
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(L * 0.5, 0.04, 0.04), chrome, L * 0.2, deckY + 0.7, s * W * 0.4);
    add(new THREE.BoxGeometry(L * 0.18, 0.12, W * 0.7), deckMatC(), -L * 0.47, -0.25, 0); // yüzme platformu
  } else if (kind === 'yelken') {
    add(new THREE.BoxGeometry(L * 0.3, 0.55, W * 0.56), white, -L * 0.02, deckY + 0.27, 0);
    add(new THREE.BoxGeometry(L * 0.28, 0.2, W * 0.58), glass, -L * 0.01, deckY + 0.36, 0);
    const mastH = L * 1.25;
    add(new THREE.CylinderGeometry(0.07, 0.09, mastH, 8), chrome, L * 0.08, deckY + mastH / 2, 0);
    const boom = add(new THREE.CylinderGeometry(0.06, 0.06, L * 0.42, 6), chrome, -L * 0.13, deckY + 1.6, 0);
    boom.rotation.z = PI / 2;
    const sail = add(new THREE.CylinderGeometry(0.16, 0.16, L * 0.38, 8), M(accent, 0.7), -L * 0.13, deckY + 1.8, 0);
    sail.rotation.z = PI / 2;
    // stay telleri
    const wire = new THREE.LineBasicMaterial({ color: '#d0d4da', transparent: true, opacity: 0.7 });
    const pts = [new THREE.Vector3(L * 0.48, deckY, 0), new THREE.Vector3(L * 0.08, deckY + mastH, 0), new THREE.Vector3(-L * 0.46, deckY, 0)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
  } else if (kind === 'balikci') {
    add(new THREE.BoxGeometry(L * 0.22, 1.5, W * 0.6), white, -L * 0.12, deckY + 0.75, 0);
    add(new THREE.BoxGeometry(L * 0.23, 0.4, W * 0.62), glass, -L * 0.11, deckY + 1.15, 0);
    add(new THREE.BoxGeometry(L * 0.26, 0.1, W * 0.7), acc, -L * 0.12, deckY + 1.55, 0);
    add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), M('#6b5434', 0.8), L * 0.2, deckY + 1.3, 0);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.5, 0.35, 0.5), M('#2f6fb8', 0.6), L * 0.18 - i * 0.6, deckY + 0.18, W * 0.2);
    add(new THREE.TorusGeometry(0.3, 0.07, 6, 12), M('#ff7a2a', 0.6), -L * 0.12, deckY + 0.9, W * 0.31);
  } else {
    // sürat teknesi
    add(new THREE.BoxGeometry(L * 0.14, 0.5, W * 0.7), glass, L * 0.05, deckY + 0.25, 0).rotation.z = 0.5;
    add(new THREE.BoxGeometry(L * 0.3, 0.35, W * 0.7), M('#e9e1d2', 0.7), -L * 0.18, deckY + 0.18, 0);
    add(new THREE.BoxGeometry(0.4, 0.8, 0.5), M('#222', 0.5), -L * 0.5, -0.1, 0);
  }
  return g;
}
// suda sallanan tekne: kit'e dinamik ekler
function moorBoat(kit, kind, L, x, z, yaw, color, accent, seed = 0) {
  const b = makeBoat(kind, L, color, accent);
  b.position.set(x, SEA_Y + 0.05, z);
  b.rotation.y = yaw;
  kit.add(b, true);
  const ph = seed * 1.7;
  kit.ticks.push({ obj: b, ctl: { tick: (t) => {
    b.position.y = SEA_Y + 0.05 + Math.sin(t * 1.1 + ph) * 0.06;
    b.rotation.z = Math.sin(t * 0.8 + ph) * 0.025;
    b.rotation.x = Math.sin(t * 0.6 + ph * 2) * 0.012;
  } } });
  return b;
}

// --- yardımcılar -----------------------------------------------------------------------------
function palmTree(kit, x, z, h = 6, y = 0) {
  const trunk = M('#7a5a3a', 0.9);
  const leaf = M('#2f7a34', 0.7);
  const leaf2 = M('#3d8f3a', 0.7);
  const g = new THREE.Group();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.17 - i * 0.015, 0.2 - i * 0.015, h / n + 0.05, 7), trunk);
    s.position.set(Math.sin(i * 0.5) * 0.12 * i, (i + 0.5) * (h / n), 0);
    s.castShadow = true;
    g.add(s);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 0.55), i % 2 ? leaf : leaf2);
    f.position.set(Math.cos(a) * 1.25 + 0.5, h + 0.05, Math.sin(a) * 1.25);
    f.rotation.set(0, -a, -0.38);
    f.castShadow = true;
    g.add(f);
  }
  g.position.set(x, y, z);
  g.rotation.y = x * 0.37 + z;
  kit.add(g);
  kit.solid(x, z, 0.25, 0.25);
}
function cabin(kit, x, z, color, y, ry = 0) {
  kit.box(1.3, 2.2, 1.3, M(color, 0.6), x, y, z, { ry });
  kit.box(1.5, 0.12, 1.5, M('#f4f1e8', 0.6), x, y + 2.2, z, { ry });
  kit.solid(x, z, 0.65, 0.65, ry);
}
function shower(kit, x, z, y) {
  const c = M('#cfd6de', 0.3, 0.8);
  kit.box(0.12, 2.5, 0.12, c, x, y, z);
  kit.box(0.6, 0.06, 0.06, c, x + 0.3, y + 2.45, z);
  kit.cyl(0.14, 0.18, 0.08, c, x + 0.58, y + 2.38, z, 10);
  kit.box(1.2, 0.06, 1.2, M('#b8875a', 0.8), x + 0.3, y, z);
  kit.solid(x, z, 0.1, 0.1);
}
function volleyCourt(kit, x, z, y, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  kit.group.add(g);
  const line = M('#2e7bd1', 0.6);
  const L = 16;
  const W = 8;
  const seg = (w, d, px, pz) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), line);
    o.position.set(px, 0.02, pz);
    g.add(o);
  };
  seg(L, 0.1, 0, W / 2);
  seg(L, 0.1, 0, -W / 2);
  seg(0.1, W, L / 2, 0);
  seg(0.1, W, -L / 2, 0);
  const post = M('#e8e8e8', 0.4, 0.6);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), post);
    p.position.set(0, 1.3, s * (W / 2 + 0.6));
    p.castShadow = true;
    g.add(p);
  }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.2, 0.9), new THREE.MeshStandardMaterial({ color: '#1b1b1b', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(0, 2.05, 0);
  net.rotation.y = PI / 2;
  g.add(net);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), M('#ffe14a', 0.5));
  ball.position.set(3.2, 0.12, 1.4);
  g.add(ball);
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  for (const s of [-1, 1]) kit.solid(x + sn * s * (W / 2 + 0.6), z + cs * s * (W / 2 + 0.6), 0.1, 0.1);
}

// --- BATI KIYISI ---------------------------------------------------------------------------
export const BEACH_POIS = [];
function buildWestCoast(kit) {
  const m = mats();
  buildBeachMesh(kit);
  const KX = KORDON_X;
  const z0 = OUTER.z0;
  const z1 = COAST_Z;
  // kordon (yükseltilmiş kaldırım) + deniz tarafında alçak taş duvar
  const kRep = floorRep('kaldirim');
  const kw = COAST_X - KX;
  kit.box(kw, 0.12, z1 - z0, M('#8f8a80', 0.85), (KX + COAST_X) / 2, 0, (z0 + z1) / 2, { cast: false });
  kit.mesh(planeGeo(kw, z1 - z0, kw / kRep, (z1 - z0) / kRep, KX / kRep, z0 / kRep), floorMat('kaldirim'), (KX + COAST_X) / 2, 0.121, (z0 + z1) / 2, 0, { cast: false, rx: -PI / 2 });
  // kordon duvarı (kumsala iniş): yüz + üst taş
  const wallM = M('#c9bfa8', 0.85);
  kit.box(0.5, 0.9, z1 - z0, wallM, KX - 0.15, -0.78, (z0 + z1) / 2, { cast: false });
  kit.box(0.6, 0.06, z1 - z0, M('#e2dccd', 0.7), KX, 0.12, (z0 + z1) / 2, { cast: false });
  // araç bariyeri: babalar (yaya geçer, araç geçemez)
  const bolM = M('#2a2d33', 0.5, 0.5);
  const capM = M('#e8b923', 0.5);
  for (let z = z0 + 2; z < z1 - 1; z += 3) {
    kit.cyl(0.13, 0.15, 0.85, bolM, KX + 0.9, 0.12, z, 8, { cast: false });
    kit.cyl(0.14, 0.14, 0.08, capM, KX + 0.9, 0.97, z, 8, { cast: false });
  }
  kit.solid(KX + 0.9, (z0 + z1) / 2, 0.3, (z1 - z0) / 2);
  kit.solids.at(-1).car = true;
  // rıhtım duvarı kısmında (limana yakın) korkuluk: yaya da geçmez
  for (let z = 74; z < z1 - 1; z += 2) kit.item('korkuluk', KX + 0.35, z, 2, 0, { solid: false, y: 0.12 });
  kit.solid(KX + 0.35, (74 + z1) / 2, 0.12, (z1 - 74) / 2);
  // kordon boyunca palmiye + lamba + bank
  for (let z = z0 + 8; z < z1 - 4; z += 12) {
    const k = Math.round((z - z0) / 12);
    if (k % 2) palmTree(kit, KX + 2.8, z, 5.5 + (k % 3) * 0.6, 0.12);
    else kit.item('streetlamp', KX + 2.6, z, 4, 0, { y: 0.12 });
    if (k % 3 === 0) kit.item('parkbench', KX + 1.6, z + 5, 6, 0, { y: 0.12 });
  }
  kit.label('SAHİL BULVARI', COAST_X + 4, 0.5, -20, 'street');

  const sy = (x, z) => coastH(x, z);
  const itemAt = (k, x, z, r = 0, ti = 0, o = {}) => kit.item(k, x, z, r, ti, { ...o, y: sy(x, z) });

  // ===== 1) NEON PLAJI (halk plajı) — z −176 … −96 =====
  {
    const zA = -176;
    const zB = -96;
    // giriş kemeri
    const gx = KX - 1.5;
    const gz = -136;
    const archM = M('#2b6fb5', 0.5);
    for (const s of [-1, 1]) kit.box(0.35, 3.6, 0.35, archM, gx, -0.2, gz + s * 2.4);
    kit.box(0.4, 0.5, 5.4, archM, gx, 3.3, gz);
    kit.sign('neonplaji', 'NEON PLAJI', 0.7, gx + 0.25, 3.55, gz, PI / 2, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', li: 5, ld: 10 });
    kit.sign('neonplaji2', 'NEON PLAJI', 0.7, gx - 0.25, 3.55, gz, -PI / 2, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', light: false });
    for (const s of [-1, 1]) kit.solid(gx, gz + s * 2.4, 0.2, 0.2);
    // şezlong + şemsiye sıraları (denize bakar: −x)
    const colors = [0, 1, 2, 3, 4];
    for (let z = zA + 4; z < zB; z += 4.2) {
      if (Math.abs(z - gz) < 4 || Math.abs(z + 116) < 9.5) continue; // giriş + voleybol
      const sx = shoreX(z);
      const rows = [KX - 6, KX - 11, KX - 16].filter((x) => x > sx + 4);
      rows.forEach((x, ri) => {
        const ti = colors[(Math.round(z) + ri) % colors.length];
        itemAt('umbrella', x, z, 0, ti, { solid: false });
        itemAt('lounger', x - 0.2, z - 0.95, 6, 0);
        itemAt('lounger', x - 0.2, z + 0.95, 6, 0);
      });
    }
    // voleybol sahası
    volleyCourt(kit, KX - 11, -116, sy(KX - 11, -116), PI / 2);
    // cankurtaran kulesi
    itemAt('lifeguard', shoreX(-150) + 6, -150, 6, 0);
    itemAt('lifeguard', shoreX(-108) + 6, -108, 6, 0);
    // büfe, duşlar, soyunma kabinleri
    itemAt('bufe', KX - 3.4, -160, 2, 0);
    itemAt('plastikmasa', KX - 7, -164, 0, 0);
    itemAt('plastikmasa', KX - 7, -157, 0, 0);
    for (const [dx, dz] of [[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]]) {
      itemAt('plastiktabure', KX - 7 + dx, -164 + dz, 0, 0);
      itemAt('plastiktabure', KX - 7 + dx, -157 + dz, 0, 0);
    }
    for (const z of [-146, -126, -102]) shower(kit, KX - 3, z, sy(KX - 3, z));
    ['#ff5a5f', '#ffd23f', '#2ec4b6', '#4d7cff'].forEach((c, i) => cabin(kit, KX - 2.2, -172 + i * 1.6, c, sy(KX - 2.2, -172 + i * 1.6)));
    itemAt('flamingo', shoreX(-130) - 4, -130, 0, 0, { solid: false });
    BEACH_POIS.push({ key: 'neon_plaji', name: 'Neon Plajı', glyph: 'beach', x: KX - 10, z: -136 });
  }

  // ===== 2) BURUN: kayalar + seyir terası + küçük fener =====
  {
    const z = HEADLAND.z;
    const px = KX - 9;
    const py = 0.4;
    // ahşap seyir terası (kayaların üstünde)
    woodBox(kit, 10, 0.3, 8, px - 4, py - 0.3, z);
    for (const [dx, dz] of [[-9, -4], [-9, 4], [1, -4], [1, 4]]) kit.box(0.2, 1.5, 0.2, M('#6b5434', 0.8), px - 4 + dx / 2 + (dx < 0 ? -0.5 : 0), py - 1.5, z + dz * 0.95);
    for (const s of [-1, 1]) kit.item('korkuluk', px - 4 + s * 0, z + s * 3.9, 0, 0, { solid: false, y: py });
    kit.item('korkuluk', px - 8.9, z, 2, 0, { solid: false, y: py });
    kit.item('parkbench', px - 2, z - 2.6, 0, 0, { y: py });
    kit.item('parkbench', px - 2, z + 2.6, 4, 0, { y: py });
    // dürbün
    kit.box(0.12, 1.1, 0.12, M('#2a2d33', 0.5, 0.6), px - 7.6, py, z);
    kit.cyl(0.12, 0.16, 0.6, M('#2a6fb5', 0.4, 0.6), px - 7.75, py + 1.25, z, 10, { rz: PI / 2 });
    kit.solid(px - 4, z - 4.05, 5, 0.12);
    kit.solid(px - 4, z + 4.05, 5, 0.12);
    kit.solid(px - 8.95, z, 0.12, 4);
    // burnun ucunda küçük fener
    const fx = shoreX(z) + 3;
    const fy = sy(fx, z);
    kit.cyl(1.1, 1.4, 1.0, M('#e8e4dc', 0.7), fx, fy, z, 14);
    kit.cyl(0.75, 0.95, 6.5, M('#f6f6f2', 0.5), fx, fy + 1, z, 14);
    kit.cyl(0.76, 0.76, 0.9, M('#d0302a', 0.5), fx, fy + 3.6, z, 14, { cast: false });
    kit.cyl(0.55, 0.55, 0.9, glowMat('#ffe9a8', 2.6), fx, fy + 7.5, z, 12, { cast: false });
    kit.cyl(0.85, 0.85, 0.12, M('#2a2d33', 0.5), fx, fy + 7.45, z, 12);
    kit.cyl(0.1, 0.65, 0.6, M('#d0302a', 0.5), fx, fy + 8.4, z, 12);
    kit.light(fx, fy + 7.9, z, '#ffe9a8', 10, 26);
    kit.solid(fx, z, 1.2, 1.2);
    BEACH_POIS.push({ key: 'burun', name: 'Fener Burnu', glyph: 'light', x: fx, z });
  }

  // ===== 3) SUNSET BEACH CLUB — z −34 … 30 =====
  {
    const z0b = -34;
    const z1b = 30;
    const dx0 = KX - 0.6;
    const dx1 = KX - 18;
    const dy = 0.0;
    // ahşap güverte (kordon seviyesine yakın, kumun üstünde)
    woodBox(kit, dx0 - dx1, 0.25, z1b - z0b, (dx0 + dx1) / 2, dy - 0.25, (z0b + z1b) / 2);
    deck(dx1, z0b, dx0, z1b, dy, 'beachclub');
    // bar (beyaz sıva + saz çatı)
    const bx = KX - 4.5;
    const bz = -2;
    kit.box(3.2, 1.1, 10, M('#f2efe6', 0.6), bx, dy, bz);
    kit.box(3.6, 0.08, 10.4, M('#2a2d33', 0.4), bx, dy + 1.1, bz);
    kit.box(8, 0.35, 14, M('#c9a46a', 0.95), bx + 0.5, dy + 3.4, bz);
    for (const [px, pz] of [[-1.6, -6.5], [-1.6, 6.5], [3, -6.5], [3, 6.5]]) kit.box(0.2, 3.4, 0.2, M('#6b5434', 0.8), bx + px, dy, bz + pz);
    kit.item('drinkfridge', bx + 2.2, bz - 3, 6, 0, { y: dy });
    kit.item('drinkfridge', bx + 2.2, bz + 3, 6, 0, { y: dy });
    // v159.1: bar tabureleri tezgâhtan biraz uzakta ve geçilebilir — oturup kalkınca tezgâh ile
    // tabure arasında sıkışılıyordu
    for (let i = -2; i <= 2; i++) kit.item('stool', bx - 2.75, bz + i * 2, 2, 0, { y: dy, solid: false });
    kit.solid(bx, bz, 1.6, 5);
    kit.sign('sunsetclub', 'SUNSET BEACH CLUB', 0.75, bx + 0.5, dy + 4.15, bz, -PI / 2, { color: '#ffffff', glow: '#ff7a3a', font: '900 110px Arial, sans-serif', li: 8, ld: 14 });
    kit.sign('sunsetclub2', 'SUNSET BEACH CLUB', 0.75, bx + 4.55, dy + 4.15, bz, PI / 2, { color: '#ffffff', glow: '#ff7a3a', font: '900 110px Arial, sans-serif', light: false });
    // DJ kabini
    kit.item('dj', KX - 10, 22, 2, 0, { y: dy });
    kit.item('speaker', KX - 10, 19.5, 2, 0, { y: dy });
    kit.item('speaker', KX - 10, 24.5, 2, 0, { y: dy });
    // kabana yataklar (beyaz tenteli) + beyaz şemsiyeli şezlonglar
    const canvasM = M('#f7f5ee', 0.8);
    for (const z of [-28, -20, 8, 16]) {
      const x = KX - 13;
      for (const [px, pz] of [[-1.3, -1.3], [-1.3, 1.3], [1.3, -1.3], [1.3, 1.3]]) kit.box(0.1, 2.4, 0.1, M('#d9cfbd', 0.6), x + px, dy, z + pz);
      kit.box(2.8, 0.06, 2.8, canvasM, x, dy + 2.4, z);
      kit.box(2.2, 0.4, 2.2, M('#ffffff', 0.85), x, dy, z);
      kit.box(0.5, 0.3, 2.0, M('#ff9a7a', 0.8), x + 0.85, dy + 0.4, z);
      kit.solid(x, z, 1.3, 1.3);
    }
    for (let z = z0b + 3; z < z1b - 2; z += 3.2) {
      if (Math.abs(z + 2) < 7.5 || Math.abs(z - 22) < 4) continue;
      kit.item('lounger', KX - 7.5, z, 6, 0, { y: dy });
    }
    for (let z = z0b - 4; z > -50; z -= 3.6) {
      const x = KX - 8;
      if (x < shoreX(z) + 3) continue;
      itemAt('umbrella', x, z, 0, 5, { solid: false });
      itemAt('lounger', x - 0.2, z + 0.9, 6, 0);
    }
    // güverte kenarı korkuluk (kumsala açık iki merdiven boşluğu)
    for (let z = z0b + 1; z < z1b; z += 2) if (Math.abs(z - -10) > 2 && Math.abs(z - 12) > 2) kit.item('korkuluk', dx1 + 0.2, z, 2, 0, { solid: false, y: dy });
    for (let i = 0; i < 6; i++) palmTree(kit, dx1 + 2 + (i % 2) * 1.5, z0b + 4 + i * 11, 6 + (i % 3) * 0.7, dy);
    for (let x = dx1 + 3; x < dx0 - 1; x += 4) kit.box(0.04, 0.04, 0.04, glowMat('#ffd27a', 3), x, dy + 3.2, z1b - 0.5, { cast: false });
    kit.light(KX - 8, 3, -2, '#ffb27a', 6, 16);
    kit.light(KX - 10, 3, 20, '#ff6ad5', 6, 14);
    BEACH_POIS.push({ key: 'beachclub', name: 'Sunset Beach Club', glyph: 'cocktail', x: KX - 9, z: -2 });
  }

  // ===== 4) SU SPORLARI İSKELESİ — z ≈ 46 =====
  {
    const iz = 46;
    const ix0 = KX - 1;
    const ix1 = shoreX(iz) - 34;
    const iy = 0.05;
    woodBox(kit, ix0 - ix1, 0.22, 3, (ix0 + ix1) / 2, iy - 0.22, iz);
    deck(ix1, iz - 1.5, ix0, iz + 1.5, iy, 'iskele');
    for (let x = ix1 + 1; x < ix0; x += 4) for (const s of [-1, 1]) kit.cyl(0.13, 0.13, 3.2, M('#5a4630', 0.9), x, iy - 3.2, iz + s * 1.35, 6);
    // T-başı
    woodBox(kit, 4, 0.22, 12, ix1 + 2, iy - 0.22, iz);
    deck(ix1, iz - 6, ix1 + 4, iz + 6, iy, 'iskele');
    for (let x = ix1 + 3; x < ix0 - 2; x += 6) kit.item('bollard', x, iz + 1.3, 0, 0, { y: iy, solid: false });
    // jet ski, pedalo, kano, sürat teknesi
    [['jetski', 3.2, ix1 + 8, iz + 3.4, 0, '#ffffff', '#ff3a2a'], ['jetski', 3.2, ix1 + 13, iz + 3.4, 0.1, '#ffffff', '#1f6fd6'], ['jetski', 3.2, ix1 + 18, iz - 3.4, 0, '#222428', '#a6ff00'],
      ['pedalo', 3.4, ix1 + 8, iz - 3.6, 0, '#ffffff', '#ffd23f'], ['surat', 7.5, ix1 - 3, iz + 4, PI / 2, '#ffffff', '#d0302a'], ['balikci', 8, ix1 - 3, iz - 7, PI / 2 + 0.05, '#f2f2ee', '#1f5fd6']]
      .forEach(([k, L, x, z, yaw, c, a], i) => moorBoat(kit, k, L, x, z, yaw, c, a, i + 3));
    // kulübe: SU SPORLARI
    const kx = KX - 6;
    const kz = iz + 8;
    const ky = sy(kx, kz);
    kit.box(4, 2.6, 3.2, M('#2f8fd6', 0.6), kx, ky, kz);
    kit.box(4.6, 0.15, 3.8, M('#f7f5ee', 0.6), kx, ky + 2.6, kz);
    kit.sign('susporlari', 'SU SPORLARI', 0.55, kx - 2.05, ky + 2.05, kz, -PI / 2, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', li: 4, ld: 8 });
    kit.solid(kx, kz, 2, 1.6);
    // kano rafı
    const rack = M('#6b5434', 0.8);
    kit.box(0.12, 1.4, 4, rack, kx - 0.5, ky, kz - 5);
    ['#ffd23f', '#ff5a5f', '#2ec4b6'].forEach((c, i) => kit.cyl(0.22, 0.22, 3.6, M(c, 0.5), kx - 0.5, ky + 0.4 + i * 0.4, kz - 5, 8, { rx: PI / 2 }));
    kit.solid(kx - 0.5, kz - 5, 0.3, 2);
    // kumda çekilmiş balıkçı kayıkları
    moorBoat(kit, 'balikci', 6.5, shoreX(60) + 3, 60, -PI / 2 + 0.2, '#ffffff', '#2f8f4a', 9).position.y = sy(shoreX(60) + 3, 60) + 0.45;
    BEACH_POIS.push({ key: 'susporlari', name: 'Su Sporları', glyph: 'boat', x: kx - 6, z: iz });
  }
  // denizde yüzen şamandıra hattı (yüzme alanı)
  const buoyM = M('#ff7a1a', 0.5);
  for (let z = -170; z < 40; z += 6) {
    const x = shoreX(z) - 34;
    if (Math.abs(z - HEADLAND.z) < 26) continue;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), buoyM);
    b.position.set(x, SEA_Y + 0.1, z);
    kit.add(b, true);
    const ph = z * 0.3;
    kit.ticks.push({ obj: b, ctl: { tick: (t) => (b.position.y = SEA_Y + 0.1 + Math.sin(t * 1.4 + ph) * 0.07) } });
  }
}

// --- NEON MARİNA (güney kıyısı, liman sağında) ------------------------------------------
export const MARINA = { x0: 30, x1: OUTER.x1, z0: COAST_Z + 2.9, z1: COAST_Z + 80, gates: [62, 170] };
function buildMarina(kit) {
  const MZ = COAST_Z + 2.9;
  const Y = -0.05;
  const wood = mats().wood;
  const pont = (x0, z0, x1, z1) => {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    woodBox(kit, w, 0.28, d, (x0 + x1) / 2, Y - 0.28, (z0 + z1) / 2);
    kit.box(w + 0.1, 0.35, d + 0.1, M('#d8d8d4', 0.7), (x0 + x1) / 2, Y - 0.62, (z0 + z1) / 2, { cast: false });
    deck(x0, z0, x1, z1, Y, 'marina');
  };
  void wood;
  // ana yürüyüş iskelesi (kıyıya paralel) + iki giriş rampası
  const mainZ0 = MZ + 4;
  const mainZ1 = MZ + 7.5;
  pont(36, mainZ0, 196, mainZ1);
  MARINA.gates.forEach((gx) => {
    pont(gx - 1.6, MZ - 0.4, gx + 1.6, mainZ0);
    // giriş kemeri
    const archM = M('#14161b', 0.4, 0.6);
    for (const s of [-1, 1]) kit.box(0.25, 3.4, 0.25, archM, gx + s * 1.9, 0, MZ - 1.2);
    kit.box(4.2, 0.6, 0.3, archM, gx, 3.0, MZ - 1.2);
    kit.sign(`marinakapi${gx}`, 'NEON MARİNA', 0.42, gx, 3.3, MZ - 1.0, 0, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', li: 4, ld: 8 });
    kit.sign(`marinakapib${gx}`, 'NEON MARİNA', 0.42, gx, 3.3, MZ - 1.4, PI, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', light: false });
    for (const s of [-1, 1]) kit.solid(gx + s * 1.9, MZ - 1.2, 0.15, 0.15);
    // araç girmesin
    kit.solid(gx, MZ - 1.6, 1.7, 0.3);
    kit.solids.at(-1).car = true;
  });
  // parmak iskeleler + tekneler
  const fingers = [];
  for (let x = 44; x <= 188; x += 16) fingers.push(x);
  const palette = [['#ffffff', '#16324f'], ['#f4f4f2', '#7a1f2b'], ['#ffffff', '#1f6fd6'], ['#eceae4', '#2a2d33'], ['#ffffff', '#0e7c6b']];
  let bi = 0;
  fingers.forEach((x, k) => {
    if (x > 156) return; // kulüp güvertesi
    pont(x - 0.8, mainZ1, x + 0.8, mainZ1 + 24);
    for (let z = mainZ1 + 4; z < mainZ1 + 24; z += 6) kit.item('bollard', x + 0.6, z, 0, 0, { y: Y, solid: false });
    // her parmağın iki yanında bir tekne (son parmakta tek)
    for (const s of [-1, 1]) {
      if (k === 0 && s < 0) continue;
      const kinds = ['yat', 'yelken', 'yelken', 'yat', 'surat', 'yelken'];
      const kind = kinds[(bi + k) % kinds.length];
      const L = kind === 'yat' ? 13 : kind === 'yelken' ? 11 : 8;
      const [c, a] = palette[bi % palette.length];
      moorBoat(kit, kind, L, x + s * 4.3, mainZ1 + 3 + L / 2, -PI / 2, c, a, bi);
      bi++;
    }
  });
  // köprü + dış uzun iskele (büyük yatlar dış tarafa yanaşır)
  const outZ0 = mainZ1 + 32;
  const outZ1 = outZ0 + 3.4;
  pont(116, mainZ1 + 24, 119.4, outZ0);
  pont(50, outZ0, 188, outZ1);
  [[66, 22, 'yat', '#ffffff', '#16324f'], [96, 26, 'yat', '#f4f4f2', '#2a2d33'], [140, 20, 'yelken', '#ffffff', '#7a1f2b'], [170, 24, 'yat', '#ffffff', '#0e7c6b']]
    .forEach(([x, L, kind, c, a], i) => moorBoat(kit, kind, L, x, outZ1 + 3.6, i % 2 ? 0 : PI, c, a, 20 + i));
  // akaryakıt iskelesi (dış iskelenin doğu ucu)
  kit.item('pump', 186, outZ0 + 1.7, 4, 0, { y: Y });
  kit.sign('marinayakit', 'MARİNA YAKIT', 0.4, 186, Y + 2.6, outZ0 + 1.7, PI, { color: '#ffffff', bg: '#1f9e5a', font: '900 110px Arial, sans-serif', light: false });
  // YAT KULÜBÜ: su üstünde güverte + cam bina + teras
  const cx0 = 160;
  const cx1 = 196;
  const cz0 = mainZ1;
  const cz1 = mainZ1 + 20;
  pont(cx0, cz0, cx1, cz1);
  const bx = 182;
  const bz = cz0 + 7;
  const glass = M('#9fc7d9', 0.08, 0.4);
  kit.box(20, 0.25, 11, M('#f2f2ee', 0.5), bx - 1, Y, bz);
  kit.box(18, 3.4, 9, M('#f7f7f4', 0.4), bx - 1, Y + 0.25, bz);
  kit.box(18.1, 2.2, 9.1, glass, bx - 1, Y + 0.85, bz, { cast: false });
  kit.box(21, 0.3, 12.5, M('#1d2128', 0.4, 0.4), bx - 1, Y + 3.65, bz + 0.6);
  kit.box(21, 0.08, 0.08, glowMat('#19e8ff', 2.6), bx - 1, Y + 3.7, bz + 6.9, { cast: false });
  kit.sign('yatkulubu', 'NEON YAT KULÜBÜ', 0.7, bx - 1, Y + 4.45, bz + 6.4, 0, { color: '#ffffff', glow: '#19e8ff', font: '900 110px Arial, sans-serif', li: 8, ld: 14 });
  kit.mass(18, 3.6, 9, bx - 1, bz, Y);
  // teras: masalar
  for (const [x, z] of [[166, cz0 + 15], [172, cz0 + 15], [178, cz0 + 15], [184, cz0 + 15], [190, cz0 + 15], [166, cz0 + 6], [166, cz0 + 11]]) kit.item('cafetable', x, z, 0, 0, { y: Y });
  for (const x of [164, 194]) kit.item('umbrella', x, cz0 + 18, 0, 6, { y: Y, solid: false });
  for (let x = cx0 + 1; x < cx1; x += 2) kit.item('korkuluk', x, cz1 - 0.2, 0, 0, { solid: false, y: Y });
  kit.solid((cx0 + cx1) / 2, cz1 - 0.2, (cx1 - cx0) / 2, 0.12);
  kit.light(bx - 1, Y + 2.8, bz + 7, '#e9f6ff', 6, 14);
  // mendirek (taş + beton): güney kolu ve doğu kolu; batı ucunda yeşil fener
  const BZ = COAST_Z + 84;
  const rockM = M('#77736c', 0.95);
  const concM = M('#bdb8ae', 0.85);
  const brk = (x0, z0, x1, z1) => {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    kit.box(w + 4, 1.6, d + 4, rockM, (x0 + x1) / 2, -1.9, (z0 + z1) / 2, { cast: false });
    kit.box(w, 0.9, d, concM, (x0 + x1) / 2, -0.4, (z0 + z1) / 2);
    deck(x0, z0, x1, z1, 0.5, 'mendirek');
  };
  brk(18, BZ, OUTER.x1, BZ + 5);
  brk(OUTER.x1 - 5, MZ + 0.2, OUTER.x1, BZ);
  for (let i = 0; i < 40; i++) {
    const x = 18 + ((i * 37) % (OUTER.x1 - 18));
    const z = BZ + 6.5 + Math.sin(i) * 1.2;
    kit.mesh(new THREE.DodecahedronGeometry(1 + (i % 3) * 0.4, 0), rockM, x, -0.9, z, i, { cast: false });
  }
  // fener
  const fx = 21;
  const fz = BZ + 2.5;
  kit.cyl(1.2, 1.5, 1.2, concM, fx, 0.5, fz, 14);
  kit.cyl(0.8, 1.0, 7, M('#f2f2ee', 0.5), fx, 1.7, fz, 14);
  for (let k = 0; k < 3; k++) kit.cyl(0.82 - k * 0.04, 0.86 - k * 0.04, 0.9, M('#1f9e5a', 0.5), fx, 2.4 + k * 2, fz, 14, { cast: false });
  kit.cyl(0.6, 0.6, 0.9, glowMat('#7dff9e', 2.8), fx, 8.8, fz, 12, { cast: false });
  kit.cyl(0.1, 0.7, 0.6, M('#1f9e5a', 0.5), fx, 9.8, fz, 12);
  kit.light(fx, 9.2, fz, '#7dff9e', 10, 24);
  kit.solid(fx, fz, 1.4, 1.4);
  kit.label('NEON MARİNA', 110, 6, MZ + 30, 'map');
  BEACH_POIS.push({ key: 'marina', name: 'Neon Marina', glyph: 'anchor2', x: 110, z: MZ + 6 });
  BEACH_POIS.push({ key: 'yatkulubu', name: 'Neon Yat Kulübü', glyph: 'cocktail', x: bx - 1, z: bz + 7 });
}

// --- giriş ----------------------------------------------------------------------------------
export function buildCoast() {
  DECKS.length = 0;
  BEACH_POIS.length = 0;
  const west = new Kit('bati_sahil');
  buildWestCoast(west);
  const marina = new Kit('marina');
  buildMarina(marina);
  return [west, marina];
}
