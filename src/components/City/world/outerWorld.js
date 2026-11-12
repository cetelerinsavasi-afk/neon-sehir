// =============================================================================
// v157 — GENİŞLETİLMİŞ ŞEHİR DÜNYASI (O-77 / Kervankent prototipinden oyuna taşındı)
//   • Girilebilir mekânlar: lotların dış cephesi yerine içi gezilebilen bina (venues.js)
//   • Şehrin dışı: arazi, O-77 otoyolu (tünel, köprü, gişe), Kervankent, yol üstü cepleri,
//     köyler + köy yolları, Neon Kent Ormanı, kumsal / marina (cityPlan), hayvanlar
//   • Çarpışma + zemin yüksekliği: şehir ızgarası motorda (cityEngine); şehrin dışı burada
//     (kasaba / cep / orman ızgaraları, otoyol şeridi, köy yolları).
// Sunucu / Firestore yok: hepsi cihazda kurulur.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCity, BOUNDS, COAST_Z } from '../cityPlan.js';
import { VENUE_BUILDERS, ROOM as VROOM } from './venues.js';
import { Kit, M } from '../kit.js';
import { buildSea } from '../areas.js';
import { nearest, frameAt, inTunnel, RAIL, LANE, TOWN, toTown, fromTown, inTownRect, LAKE, RIVER, TERRAIN, TAGS, LEN, ROAD_HALF } from './route.js';
import { buildTerrain, buildRoad, buildTunnel, buildBridge, buildToll, buildSigns, buildTrees, buildWater, buildHorizon, S_EXIT, GISES } from './world.js';
import { buildTown } from './town.js';
import { buildRoadside } from './roadside.js';
import { Animals } from './animals.js';
import { PARK, inPark, parkCarve, buildNorthPark, pondY, inPond, pathDist as parkPathDist, CLEAR as PARK_CLEAR } from './northPark.js';
import { BEACH_RECT, DECKS, coastH, SEA_Y } from '../coast.js';
import { geo as rsGeo, padAt, branchAt, toPad, fromPad, carve as rsCarve, nearFeature, BR_HALF, pierLocal } from './roadsideGeo.js';
import { KORDON_X, COAST_X, OUTER, EAST_GATE_Z } from '../cityLayout.js';

const PI = Math.PI;
const V = THREE.Vector3;
export { nearest, frameAt, inTunnel, TOWN, toTown, fromTown, LEN, TAGS, LANE, ROAD_HALF, VROOM, SEA_Y };

// şehir modunun yürünebilir sınırı (kumsal / deniz / marina) + otoyol ağzı
export const WALK = { x0: -345, z1: COAST_Z + 120 };
export const EXIT = { x0: 196, x1: 206, z0: -143.6, z1: -136.4 };
export const inExit = (x, z) => x > EXIT.x0 && x < EXIT.x1 && z > EXIT.z0 && z < EXIT.z1;
// motordaki şehir ızgarasının kapsadığı alan
export const CITY_GRID = { x0: WALK.x0 - 2, x1: EXIT.x1 + 12, z0: BOUNDS.z0 - 2, z1: WALK.z1 + 1 };

// mekân türü → oyundaki 3D mekân (functions/venueLayouts.js VENUES) — içeride oyunun işlemleri
export const VENUE_GAME_KEY = { camii: 'camii', banka: 'banka', karakol: 'karakol', belediye: 'belediye', galeri: 'araba_galerisi', silah: 'silah_magazasi', casino: 'gazino' };

const yawOf = (m) => Math.atan2(m.elements[8], m.elements[10]);

// --- ızgara yardımcısı ------------------------------------------------------------------
const RES = 0.5;
function makeGrid(x0, z0, x1, z1, blockedFn) {
  const W = Math.ceil((x1 - x0) / RES);
  const H = Math.ceil((z1 - z0) / RES);
  const g = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) g[j * W + i] = blockedFn(x0 + (i + 0.5) * RES, z0 + (j + 0.5) * RES) ? 1 : 0;
  const raster = ({ x, z, hw, hd, yaw = 0, ell }) => {
    if (!ell) {
      if (hw < 0.5) hw += RES / 2;
      if (hd < 0.5) hd += RES / 2;
    }
    const r = Math.hypot(hw, hd);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const i0 = Math.max(0, Math.floor((x - r - x0) / RES));
    const i1 = Math.min(W - 1, Math.ceil((x + r - x0) / RES));
    const j0 = Math.max(0, Math.floor((z - r - z0) / RES));
    const j1 = Math.min(H - 1, Math.ceil((z + r - z0) / RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * RES - x;
        const pz = z0 + (j + 0.5) * RES - z;
        const lx = px * c - pz * s;
        const lz = px * s + pz * c;
        const inside = ell ? (lx / hw) ** 2 + (lz / hd) ** 2 <= 1 : Math.abs(lx) <= hw && Math.abs(lz) <= hd;
        if (inside) g[j * W + i] = 1;
      }
    }
  };
  const cell = (x, z) => {
    const i = Math.floor((x - x0) / RES);
    const j = Math.floor((z - z0) / RES);
    if (i < 0 || j < 0 || i >= W || j >= H) return true;
    return g[j * W + i] === 1;
  };
  return { raster, cell };
}

// kitlerin engelleri (dünya koordinatı)
function collectSolids(kits) {
  const out = [];
  const tv = new V();
  kits.forEach((k) => {
    k.solids.forEach((s) => {
      const p = s.o.localToWorld(tv.set(s.x, 0, s.z));
      out.push({ x: p.x, z: p.z, hw: s.hw, hd: s.hd, yaw: yawOf(s.o.matrixWorld), item: s.item || null, ell: Boolean(s.ell), car: Boolean(s.car) });
    });
  });
  return out;
}

// --- GİRİLEBİLİR MEKÂNLAR: lotun dış cephesi yerine içi oyundaki mekân olan kabuk ----------
function patchCity(city) {
  const venues = [];
  city.lots.filter((l) => VENUE_BUILDERS[l.type]).forEach((l) => {
    l.kit.group.removeFromParent();
    l.kit.__cut = true;
    const rot = l.face === 'e' || l.face === 'w';
    const v = VENUE_BUILDERS[l.type]({ w: (rot ? l.bd : l.bw) - 6, d: (rot ? l.bw : l.bd) - 6 });
    v.root.position.set(l.mx, 0, l.mz);
    v.ry = { s: 0, e: PI / 2, n: PI, w: -PI / 2 }[l.face] || 0;
    v.root.rotation.y = v.ry;
    // parselde duran seyyar satıcılar yeni binanın grubuna taşınır (aynı parsel dönüşü)
    l.kit.group.children.filter((c) => c.name?.startsWith('vendor_')).forEach((c) => v.root.add(c));
    // tır kapıdan sığmasın (sadece araç engeli)
    v.base.solid(v.door.x, v.door.z - 1.3, 1.4, 0.4);
    v.base.solids.at(-1).car = true;
    city.kits.push(...v.kits);
    l.kit = v.base;
    l.info = { ...(l.info || {}), door: v.door };
    v.lot = l;
    v.wx = l.mx + v.room.cx * Math.cos(v.ry) + v.room.cz * Math.sin(v.ry);
    v.wz = l.mz - v.room.cx * Math.sin(v.ry) + v.room.cz * Math.cos(v.ry);
    v.y0 = 0;
    venues.push(v);
  });
  // otoyol ağzına çıkış oku
  const ground = city.kits[0];
  const arrowM = M('#e9e4d4', 0.7);
  for (const x of [176, 186]) {
    ground.box(3.2, 0.02, 0.3, arrowM, x, 0.03, -138, { cast: false });
    ground.box(0.9, 0.02, 0.9, arrowM, x + 1.9, 0.03, -138, { cast: false, ry: PI / 4 });
  }
  return venues;
}

// dünya ↔ oda yereli (oda merkezine göre; +z = kapı tarafı)
export function toRoom(v, x, z) {
  const dx = x - v.wx;
  const dz = z - v.wz;
  const c = Math.cos(v.ry);
  const s = Math.sin(v.ry);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function fromRoom(v, lx, lz) {
  const c = Math.cos(v.ry);
  const s = Math.sin(v.ry);
  return { x: v.wx + lx * c + lz * s, z: v.wz - lx * s + lz * c };
}

// statik birleştirme (şehrin dışı; uzaklığa göre görünürlük için 96 m'lik parçalar)
function mergeOuter(root) {
  const buckets = new Map();
  const remove = [];
  const wp = new V();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (o.userData.dyn || o.userData.blocker || o.userData.pickOnly || o.userData.noMerge) return;
    if (Array.isArray(o.material) || !o.material || o.material.vertexColors) return;
    if (o.material.visible === false) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const g = o.geometry;
    if (!g?.attributes?.position || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return;
    if (g.attributes.position.count > 60000) return; // arazi gibi dev parçalar kendi başına
    o.getWorldPosition(wp);
    const key = `${Math.floor(wp.x / 96)},${Math.floor(wp.z / 96)}|${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    const geo = g.index ? g.toNonIndexed() : g.clone();
    Object.keys(geo.attributes).forEach((n) => {
      if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    });
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    geo.morphAttributes = {};
    geo.applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0) {
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i += 3) {
        for (const at of [pos, nor, uv]) {
          const s = at.itemSize;
          for (let c = 0; c < s; c++) {
            const a = at.array[(i + 1) * s + c];
            at.array[(i + 1) * s + c] = at.array[(i + 2) * s + c];
            at.array[(i + 2) * s + c] = a;
          }
        }
      }
    }
    let b = buckets.get(key);
    if (!b) {
      b = { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] };
      buckets.set(key, b);
    }
    b.geos.push(geo);
    remove.push(o);
  });
  remove.forEach((o) => o.parent?.remove(o));
  const out = new THREE.Group();
  out.name = 'merged_outer';
  buckets.forEach((b) => {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) return;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.renderOrder = b.order;
    m.matrixAutoUpdate = false;
    merged.computeBoundingSphere();
    out.add(m);
  });
  return out;
}

// --- v157 performans: dev arazi tek parça yerine karolara bölünür (kamera dışı / uzak karo çizilmez) ---
function tileTerrain(mesh, tile = 256) {
  const g = mesh.geometry;
  const pos = g.attributes.position.array;
  const idx = g.index.array;
  const buckets = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const key = `${Math.floor(pos[a] / tile)},${Math.floor(pos[a + 2] / tile)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const out = [];
  buckets.forEach((list) => {
    const sub = new THREE.BufferGeometry();
    Object.entries(g.attributes).forEach(([n, at]) => sub.setAttribute(n, at));
    sub.setIndex(list);
    // sınır küresi sadece bu karonun köşelerinden
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const i of list) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    const c = new V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    sub.boundingSphere = new THREE.Sphere(c, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2);
    sub.boundingBox = new THREE.Box3(new V(x0, y0, z0), new V(x1, y1, z1));
    const m = new THREE.Mesh(sub, mesh.material);
    m.receiveShadow = true;
    m.castShadow = false;
    m.userData.noMerge = true;
    m.userData.tile = { x: c.x, z: c.z, r: sub.boundingSphere.radius };
    m.matrixAutoUpdate = false;
    out.push(m);
  });
  return out;
}
// örnekli ağaçlar (her biri binlerce) karolara: kamera dışındakiler çizilmez, gölge sadece yakındakiler
function tileInstanced(group, tile = 240) {
  const src = [];
  group.traverse((o) => o.isInstancedMesh && o.count > 64 && src.push(o));
  const out = [];
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  src.forEach((im) => {
    const buckets = new Map();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m4);
      const x = m4.elements[12];
      const z = m4.elements[14];
      const key = `${Math.floor(x / tile)},${Math.floor(z / tile)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(i);
    }
    buckets.forEach((list) => {
      const n = new THREE.InstancedMesh(im.geometry, im.material, list.length);
      let sx = 0;
      let sz = 0;
      list.forEach((i, k) => {
        im.getMatrixAt(i, m4);
        n.setMatrixAt(k, m4);
        sx += m4.elements[12];
        sz += m4.elements[14];
        if (im.instanceColor) {
          im.getColorAt(i, col);
          n.setColorAt(k, col);
        }
      });
      n.castShadow = false;
      n.receiveShadow = im.receiveShadow;
      n.computeBoundingSphere();
      n.userData.noMerge = true;
      n.userData.tile = { x: sx / list.length, z: sz / list.length, r: n.boundingSphere ? n.boundingSphere.radius : tile };
      out.push(n);
    });
    im.parent.remove(im);
    im.dispose?.();
  });
  out.forEach((o) => group.add(o));
  return out;
}

// --- v157 performans: bir grubun (görünürlüğü birlikte değişen) statik parçaları malzemeye göre
// birleştirilir; grup yerinde kalır (mekân kesiti / uzaklık kırpması çalışmaya devam eder) -------------
export function mergeInPlace(root, skip = new Set()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  const m4 = new THREE.Matrix4();
  const walk = (o, visible) => {
    if (o !== root && (skip.has(o) || o.userData?.ctl?.tick || o.userData?.noMerge)) return;
    const vis = visible && o.visible;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && vis) {
      const g = o.geometry;
      const mat = o.material;
      const ok = mat && !Array.isArray(mat) && !mat.vertexColors && mat.visible !== false && !o.userData.pickOnly && !o.userData.blocker && g?.attributes?.position && !(g.morphAttributes && Object.keys(g.morphAttributes).length);
      if (ok) {
        const geo = g.index ? g.toNonIndexed() : g.clone();
        Object.keys(geo.attributes).forEach((n) => {
          if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
        });
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.clearGroups();
        geo.morphAttributes = {};
        m4.multiplyMatrices(inv, o.matrixWorld);
        geo.applyMatrix4(m4);
        if (m4.determinant() < 0) {
          const pos = geo.attributes.position;
          const nor = geo.attributes.normal;
          const uv = geo.attributes.uv;
          for (let i = 0; i < pos.count; i += 3) {
            for (const at of [pos, nor, uv]) {
              const sz = at.itemSize;
              for (let c = 0; c < sz; c++) {
                const t = at.array[(i + 1) * sz + c];
                at.array[(i + 1) * sz + c] = at.array[(i + 2) * sz + c];
                at.array[(i + 2) * sz + c] = t;
              }
            }
          }
        }
        const key = `${mat.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] }));
        b.geos.push(geo);
        remove.push(o);
      }
    }
    if (!vis) return; // gizli alt dallar olduğu gibi kalır
    o.children.slice().forEach((c) => walk(c, vis));
  };
  walk(root, true);
  if (remove.length < 2) {
    buckets.forEach((b) => b.geos.forEach((g) => g.dispose()));
    return 0;
  }
  remove.forEach((o) => o.parent?.remove(o));
  buckets.forEach((b) => {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) return;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.renderOrder = b.order;
    m.userData.dyn = true; // şehir birleştirmesine tekrar girmesin
    root.add(m);
  });
  return remove.length;
}
// mekânın tüm parçaları: alçak duvarlar (yön başına), iç yüzler, kökler, iç eşyalar
export function mergeVenue(v) {
  v.low.forEach((k) => mergeInPlace(k.group));
  v.lowInner.forEach((g) => mergeInPlace(g));
  (v.stubs || []).forEach((g) => {
    const was = g.visible;
    g.visible = true;
    mergeInPlace(g);
    g.visible = was;
  });
  mergeInPlace(v.int.group, new Set([...v.lowInner, ...(v.stubs || [])]));
}

// =============================================================================
// Kurulum adımları — mobilde aralarda tarayıcıya nefes aldırılır (uzun donma / ANR olmasın)
// =============================================================================
function worldSteps(W, mobile) {
  const S = [];
  const step = (pct, fn) => S.push([pct, fn]);
  step(12, () => {
    W.city = buildCity();
    W.venues = patchCity(W.city);
  });
  W.outerRoot = new THREE.Group();
  W.outerRoot.name = 'dis_dunya';
  W.outerKits = [];
  W.ticks = [];
  W.extraLights = [];
  step(30, () => {
    const terr = buildTerrain(mobile ? 12 : 8, { carve: (x, z, h) => parkCarve(x, z, rsCarve(x, z, h)) });
    terr.mesh.userData.noMerge = true;
    W.terrain = new THREE.Group();
    W.terrain.name = 'arazi';
    W.tiles = tileTerrain(terr.mesh, mobile ? 320 : 256);
    W.tiles.forEach((m) => W.terrain.add(m));
    W.groundAt = terr.sample;
    W.outerRoot.add(W.terrain);
  });
  step(46, () => {
    const hw = new THREE.Group();
    hw.name = 'otoyol';
    W.outerRoot.add(hw);
    buildRoad(hw, { gaps: rsGeo().gaps });
    buildTunnel(hw);
    buildBridge(hw, (x, z) => W.groundAt(x, z));
    GISES.forEach((G) => {
      const L = buildToll(hw, G);
      W.extraLights.push({ x: L.x, y: L.y, z: L.z, color: new THREE.Color('#f2fff6'), intensity: 10, distance: 26 });
    });
    buildSigns(hw);
    W.water = buildWater(hw);
    // deniz: şehrin denizini iki yana uzat
    const sk = new Kit('uzak_deniz');
    buildSea(sk, { x0: -3200, x1: 3600, z0: 100, z1: 3400 });
    buildSea(sk, { x0: -3200, x1: -126, z0: -3200, z1: 100.5 });
    sk.group.position.y = -0.08;
    sk.group.traverse((o) => (o.userData.noMerge = true));
    W.outerRoot.add(sk.group);
    sk.ticks.forEach((t) => W.ticks.push(t));
    buildHorizon(W.outerRoot);
    W.hw = hw;
  });
  step(60, () => {
    W.park = buildNorthPark((x, z) => terrainY(x, z));
    W.outerRoot.add(W.park.root);
    W.outerKits.push(...W.park.kits);
  });
  step(72, () => {
    // Akçay vadisi: sık çam ormanı + otoyol boyu ağaçlar
    const vadiTrees = [];
    const vb = rsGeo().branches.find((b) => b.key === 'vadi');
    if (vb) {
      let sd = 777;
      const rnd = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
      const n = vb.pts.length;
      for (let i = Math.floor(n * 0.46); i < Math.floor(n * 0.8); i += mobile ? 4 : 2) {
        for (let k = 0; k < 3; k++) {
          const [x0, z0] = vb.pts[i];
          const ang = rnd() * PI * 2;
          const r = 9 + rnd() * 95;
          const x = x0 + Math.cos(ang) * r;
          const z = z0 + Math.sin(ang) * r;
          const b = branchAt(x, z);
          if (b && b.d < BR_HALF + 4) continue;
          if (padAt(x, z, 4)) continue;
          const h = W.groundAt(x, z);
          if (h < -7.4) continue;
          vadiTrees.push([x, h - 0.2, z, 0.75 + rnd() * 0.6, rnd() * PI * 2, rnd(), rnd() < 0.72 ? 'pine' : 'leaf']);
        }
      }
    }
    const treePts = buildTrees(W.hw, (x, z) => W.groundAt(x, z), { count: mobile ? 2200 : 5200, skip: (x, z) => nearFeature(x, z, 6) || inPark(x, z, 6), extra: [...W.park.trees, ...vadiTrees] });
    W.tiles.push(...tileInstanced(W.hw, 240));
    W.treeHash = new Map();
    treePts.forEach(([x, z, sc]) => {
      const k = `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
      if (!W.treeHash.has(k)) W.treeHash.set(k, []);
      W.treeHash.get(k).push([x, z, 0.32 * sc + 0.1]);
    });
  });
  step(82, () => {
    const town = buildTown();
    W.town = town;
    W.outerRoot.add(town.root);
    W.outerKits.push(...town.kits);
    W.townBay = town.bay;
  });
  step(90, () => {
    const rs = buildRoadside((x, z) => W.groundAt(x, z));
    W.rs = rs;
    W.outerRoot.add(rs.root);
    W.outerKits.push(...rs.kits);
  });
  function terrainY(x, z) {
    if (x < BEACH_RECT.x1 && x > BEACH_RECT.x0 && z > BEACH_RECT.z0 && z < BEACH_RECT.z1) return coastH(x, z);
    return W.groundAt ? W.groundAt(x, z) : 0;
  }
  W.terrainY = terrainY;
  return S;
}
// mobilde adımlar arasında tarayıcıya nefes aldırılır (uzun donma / "uygulama yanıt vermiyor" olmasın)
export async function prepareCityWorld({ mobile = false, onStep = null } = {}) {
  const W = { mobile };
  for (const [pct, fn] of worldSteps(W, mobile)) {
    fn();
    onStep?.(pct);
    await new Promise((r) => setTimeout(r, 0));
  }
  return W;
}
// fotoğraf motoru (CityPhoto) gibi bekleyemeyen yerler için tek seferde
export function prepareCityWorldSync({ mobile = false } = {}) {
  const W = { mobile };
  worldSteps(W, mobile).forEach(([, fn]) => fn());
  return W;
}

// =============================================================================
// Kurulum sonrası: sahnedeki dünya matrisleri hazırken engeller + ızgaralar + yardımcılar
// =============================================================================
export function finishCityWorld(W, scene) {
  const { city, venues } = W;
  scene.add(W.outerRoot);
  scene.updateMatrixWorld(true);
  // Kervankent otogarı: içi gezilebilir mekân (kasaba grubunda; dünya konumu matristen)
  if (W.town?.otogar) {
    const v = W.town.otogar;
    const c = v.root.localToWorld(new V(v.room.cx, 0, v.room.cz));
    v.wx = c.x;
    v.wz = c.z;
    v.ry = TOWN.ry + v.townFace;
    v.y0 = TOWN.y;
    v.town = true;
    venues.push(v);
  }
  // kasaba / cep / orman engelleri
  const townSolids = collectSolids(W.town.kits);
  const rsSolids = collectSolids(W.rs.kits);
  W.townSolids = townSolids;
  W.rsSolids = rsSolids;
  const parkSolids = collectSolids(W.park.kits);
  const H = TOWN.half;
  const townGrid = makeGrid(-H - 6, TOWN.zf - 6, H + 6, TOWN.zb + 8, (x, z) => {
    if (z > TOWN.zb - 2 && Math.abs(x) < ROAD_HALF - 0.2) return false; // otoyol ağzı
    return Math.abs(x) > H + 3 || z < TOWN.zf - 3 || z > TOWN.zb + 3;
  });
  const walkTown = makeGrid(-H - 6, TOWN.zf - 6, H + 6, TOWN.zb + 8, (x, z) => {
    if (z > TOWN.zb - 2 && Math.abs(x) < ROAD_HALF + 1) return false;
    return Math.abs(x) > H + 3 || z < TOWN.zf - 3 || z > TOWN.zb + 3;
  });
  townSolids.forEach((s) => {
    const p = toTown(s.x, s.z);
    const o = { x: p.x, z: p.z, hw: s.hw, hd: s.hd, yaw: s.yaw - TOWN.ry, ell: s.ell };
    if (!(s.item && s.item !== 'araba' && Math.min(s.hw, s.hd) < 1.2)) townGrid.raster(o);
    if (!s.car) walkTown.raster(o);
  });
  rsGeo().pads.forEach((p) => {
    p.grid = makeGrid(p.x0 - 2, p.z0 - 2, p.x1 + 2, p.z1 + 2, () => false);
    p.walk = makeGrid(p.x0 - 2, p.z0 - 2, p.x1 + 2, p.z1 + 2, () => false);
  });
  rsSolids.forEach((s) => {
    const p = padAt(s.x, s.z, 3);
    if (!p) return;
    const l = toPad(p, s.x, s.z);
    const o = { x: l.x, z: l.z, hw: s.hw, hd: s.hd, yaw: s.yaw - p.ry, ell: s.ell };
    if (!(s.item && s.item !== 'araba' && Math.min(s.hw, s.hd) < 1.2)) p.grid.raster(o);
    if (!s.car) p.walk.raster(o);
  });
  const parkGrid = makeGrid(PARK.x0, PARK.z0, PARK.x1, PARK.z1 + 1, (x, z) => !inPark(x, z) || inPond(x, z, 0.72));
  parkSolids.forEach((s) => !s.car && inPark(s.x, s.z, 3) && parkGrid.raster(s));
  W.parkGrid = parkGrid;

  const treeHit = (x, z, r) => {
    const cx = Math.floor(x / 8);
    const cz = Math.floor(z / 8);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = W.treeHash.get(`${cx + a},${cz + b}`);
      if (arr) for (const [tx, tz, tr] of arr) if ((tx - x) ** 2 + (tz - z) ** 2 < (tr + r) ** 2) return true;
    }
    return false;
  };
  W.treeHit = treeHit;
  // v157: sık orman (24 m'lik karede ≥ 10 ağaç; telefonda ≥ 5) yayaya kapalı — ağaçların arasına girilmez.
  // Otoyol banketi, köy yolları ve cepler açık kalır (aşağıda hwyFree).
  const forest = new Set();
  for (const k of W.treeHash.keys()) {
    const [cx, cz] = k.split(',').map(Number);
    let n = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += W.treeHash.get(`${cx + a},${cz + b}`)?.length || 0;
    if (n >= (W.mobile ? 5 : 10)) forest.add(k); // telefonda ağaç sayısı yarı
  }
  const inForest = (x, z) => forest.has(`${Math.floor(x / 8)},${Math.floor(z / 8)}`);
  W.inForest = inForest;

  // --- mod: şehir / kasaba / otoyol (+ dış arazi) ------------------------------------------
  function modeAt(x, z) {
    if (inTownRect(x, z, 2)) return 'town';
    if (x > BOUNDS.x1 - 2 && Math.abs(z - EAST_GATE_Z) < 4 && x < BOUNDS.x1 + 3) return x < BOUNDS.x1 ? 'city' : 'hwy';
    if ((x >= WALK.x0 && x <= BOUNDS.x1 + 1 && z >= OUTER.z0 && z <= WALK.z1) || inExit(x, z)) return 'city';
    return 'hwy';
  }
  W.modeAt = modeAt;
  const limanLot = city.lots.find((l) => l.type === 'liman');
  const quay = { x0: limanLot.mx - limanLot.bw / 2, x1: limanLot.mx + limanLot.bw / 2, z1: COAST_Z + 17.7 };
  W.quay = quay;
  // şehir ızgaralarının başlangıç değeri (motor engelleri bunun üstüne çizer)
  W.cityCarInit = (x, z) => {
    if (x > EXIT.x0 && z > EXIT.z0 && z < EXIT.z1) return false;
    if (x > BOUNDS.x1 - 2 && Math.abs(z - EAST_GATE_Z) < 3.6) return false; // hurdalık geçidi
    let b = x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1;
    if (!b && z > COAST_Z + 2.9 && !(x > quay.x0 && x < quay.x1 && z < quay.z1)) b = true;
    return b;
  };
  W.cityWalkInit = (x, z) => {
    if (x > EXIT.x0 && z > EXIT.z0 && z < EXIT.z1) return false;
    if (x > BOUNDS.x1 - 2 && Math.abs(z - EAST_GATE_Z) < 3.6) return false;
    if (x < KORDON_X + 0.5) return x < WALK.x0 + 2 || (z > COAST_Z + 2.9 && x > KORDON_X - 2); // kumsal + deniz (yüzülür)
    if (z > COAST_Z + 2.9) return z > WALK.z1 - 2 || x > BOUNDS.x1; // güney denizi + marina (yüzülür)
    return x < BOUNDS.x0 - 3 || x > BOUNDS.x1 || z > BOUNDS.z1;
  };

  // otoyol dışı: cep / köy / köy yolu — yerel ızgaralar
  const padBlocked = (p, x, z, r, walk) => {
    const l = toPad(p, x, z);
    const g = (walk ? p.walk : p.grid).cell;
    return g(l.x - r, l.z - r) || g(l.x + r, l.z - r) || g(l.x - r, l.z + r) || g(l.x + r, l.z + r) || g(l.x, l.z);
  };
  function hwyFree(px, pz, r, hint, walk, curY = null) {
    const p = padAt(px, pz);
    if (p) return !padBlocked(p, px, pz, walk ? 0.24 : r, walk);
    if (walk) {
      const q = pierLocal(px, pz);
      if (q && q.rail) return false; // iskele korkuluğu
      if (q && q.on) return true;
      // yaya: arazinin her yeri (orman, tepe, kıyı) — sadece ağaç gövdeleri, park eşyaları ve dünya sınırı
      if (inPark(px, pz)) {
        // v157: ormanın sık yerine girilmez — yürüyüş yolları, açıklıklar ve çayırlar açık
        if (inForest(px, pz) && parkPathDist(px, pz) > 3.4 && !PARK_CLEAR.some((c) => Math.hypot(px - c.x, pz - c.z) < c.r + 2)) return false;
        return !parkGrid.cell(px, pz);
      }
      if (px < TERRAIN.x0 + 40 || px > TERRAIN.x1 - 40 || pz < TERRAIN.z0 + 40 || pz > TERRAIN.z1 + 400) return false;
      if (inTownRect(px, pz, 6)) return false;
      if (inForest(px, pz)) {
        const n = nearest(px, pz, hint);
        const nearRoad = n && n.dist < 60 && Math.abs(n.d) < RAIL + 4;
        const br = branchAt(px, pz);
        if (!nearRoad && !(br && br.d < BR_HALF + 5)) return false;
      }
      return !treeHit(px, pz, 0.2);
    }
    const n = nearest(px, pz, hint);
    if (n && n.s >= S_EXIT - 30 && n.dist < 40) {
      const lim = RAIL - 0.45 - r;
      if (Math.abs(n.d) <= lim && (curY === null || Math.abs(n.y - curY) < 4)) {
        for (const G of GISES) if (Math.abs(n.s - G.s) < 8.6) for (const a of [-7.4, 0, 7.4]) if (Math.abs(n.d - a) < 0.6 + r) return false;
        return true;
      }
    }
    const b = branchAt(px, pz);
    if (b && b.d <= BR_HALF + 2.2 - r * 0.6 && (curY === null || Math.abs(b.y - curY) < 4)) return true; // köy yolu + hafif çim payı
    return false;
  }
  W.hwyFree = hwyFree;
  // otoyol dışı zemin yüksekliği
  function offY(x, z, hint, curY = null) {
    const q = pierLocal(x, z);
    if (q && q.on && (curY === null || curY > q.y - 2.4)) return { y: q.y, pier: true };
    const p = padAt(x, z);
    if (p) {
      const l = toPad(p, x, z);
      return { y: p.yAt(l.x, l.z), pad: p };
    }
    const n = nearest(x, z, hint);
    const b = branchAt(x, z);
    if (b && b.d < BR_HALF + 3 && n && n.dist < 60 && Math.abs(n.d) < RAIL + 0.3 && curY !== null && Math.abs(b.y - curY) < Math.abs(n.y - curY)) return { y: b.y + 0.07, br: b };
    if (b && (!n || Math.abs(n.d) > ROAD_HALF + 0.5 || n.dist > 40) && b.d < BR_HALF + 3) return { y: b.y + 0.07, br: b };
    if (n && n.dist < 60 && Math.abs(n.d) < RAIL + 0.3 && n.s > S_EXIT - 30) return { y: n.y + 0.06, n };
    return { y: W.terrainY(x, z), terrain: true };
  }
  W.offY = offY;

  // şehrin dışında yaya engeli (kasaba + otoyol + arazi)
  W.outerWalkBlocked = (x, z, r, mode, hint = -1) => {
    if (mode === 'town') {
      const p = toTown(x, z);
      const g = walkTown.cell;
      return g(p.x - r, p.z - r) || g(p.x + r, p.z - r) || g(p.x - r, p.z + r) || g(p.x + r, p.z + r) || g(p.x, p.z);
    }
    return !hwyFree(x, z, r, hint, true);
  };
  // şehrin dışında araç engeli
  W.outerCarBlocked = (x, z, r, mode, hint = -1, curY = null) => {
    if (mode === 'town') {
      const p = toTown(x, z);
      const g = townGrid.cell;
      return g(p.x - r, p.z - r) || g(p.x + r, p.z - r) || g(p.x - r, p.z + r) || g(p.x + r, p.z + r) || g(p.x, p.z);
    }
    return !hwyFree(x, z, r, hint, false, curY);
  };

  // --- zemin yüksekliği ---------------------------------------------------------------------
  const lotBoxes = city.lots.map((l) => ({ x0: l.mx - l.bw / 2, x1: l.mx + l.bw / 2, z0: l.mz - l.bd / 2, z1: l.mz + l.bd / 2 }));
  const onLot = (x, z) => {
    for (const b of lotBoxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
    return false;
  };
  function inVenueRoom(x, z, m = 0) {
    for (const v of venues) {
      const p = toRoom(v, x, z);
      if (Math.abs(p.x) < VROOM.W / 2 - m && Math.abs(p.z) < VROOM.D / 2 - m) return v;
    }
    return null;
  }
  W.inVenueRoom = inVenueRoom;
  // şehir içi yürüme zemini (iskele / kumsal / deniz / kaldırım / mekân odası)
  W.groundCity = (x, z) => {
    for (const d of DECKS) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) return d.y;
    if (x < KORDON_X) return coastH(x, z);
    if (z > COAST_Z + 2.9) {
      if (x > quay.x0 && x < quay.x1 && z < quay.z1) return 0.13;
      return -5; // güney denizi
    }
    if (z > COAST_Z && z < COAST_Z + 3) return 0.13; // sahil korkuluğunun kaldırımı
    if (onLot(x, z) || x < COAST_X) return inVenueRoom(x, z) ? 0.16 : 0.13;
    return 0;
  };
  W.groundTown = (x, z) => {
    const p = toTown(x, z);
    void p;
    const v = inVenueRoom(x, z);
    return TOWN.y + (v ? 0.16 : 0.12);
  };
  // su seviyesi (yüzme): göl, nehir, gölet, deniz
  W.waterLevel = (x, z, gy, mode) => {
    if (mode === 'town') return null;
    if (mode === 'city') return x < KORDON_X || z > COAST_Z + 2.9 ? SEA_Y : null;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.6 && gy < LAKE.y) return LAKE.y;
    if (inPond(x, z, 1.05)) return pondY();
    if (gy < RIVER.y + 0.05 && x > 600) return RIVER.y;
    if (gy < SEA_Y && (x < COAST_X || z > COAST_Z)) return SEA_Y;
    return null;
  };

  // --- mekân kapıları (yaklaşınca açılır), otomatik garaj kepenkleri --------------------------
  W.doorObjs = [];
  venues.forEach((v) => (v.doors || []).forEach((o) => {
    if (!o?.userData?.ctl?.tick) return;
    const p = o.getWorldPosition(new V());
    W.doorObjs.push({ ctl: o.userData.ctl, x: p.x, z: p.z });
  }));
  W.garages = [];
  venues.forEach((v) => {
    if (!v.garage) return;
    const o = v.garage.obj;
    const p = o.getWorldPosition(new V());
    W.garages.push({ ...v.garage, x: p.x, z: p.z, ry: v.ry, base: o.position.y, open: 0, want: 0 });
  });
  W.garageBlock = (x, z, r) => {
    for (const g of W.garages) {
      if (g.open > 0.85) continue;
      const dx = x - g.x;
      const dz = z - g.z;
      const c = Math.cos(g.ry);
      const s = Math.sin(g.ry);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < g.hw + r && Math.abs(lz) < 0.2 + r) return true;
    }
    return false;
  };
  W.tickGarages = (dt, px, pz, walking) => {
    W.garages.forEach((g) => {
      const want = Math.hypot(px - g.x, pz - g.z) < (walking ? 5 : 12) ? 1 : 0;
      if (want !== g.want) {
        g.want = want;
        g.obj.userData.ctl?.setOn?.(Boolean(want));
      }
      g.open += Math.sign(want - g.open) * Math.min(Math.abs(want - g.open), dt / 1.2);
    });
  };

  // --- yol üstü / park / köy NPC'leri (dünya koordinatı) -------------------------------------
  W.npcDefs = [];
  let ni = 0;
  W.rs.npcs.forEach((n) => {
    const w = n.world ? { x: n.x, z: n.z } : fromPad(n.pad, n.x, n.z);
    const y = n.world ? n.y + 0.02 : n.pad.yAt(n.x, n.z) + 0.02;
    W.npcDefs.push({ id: `npc_dis_${ni++}`, name: n.name, av: n.av, x: w.x, z: w.z, y, lines: n.lines || [], left: Boolean(n.left) });
  });
  [
    { name: 'Koşucu Elif', x: 60, z: -224, av: { gender: 'kadin', clothing: 'tshirt', clothColor: '#ff3fa0', pantsColor: '#1a1a1a' }, lines: ['Halka parkur tam 1 km!', 'Sabah koşusu gibisi yok.'] },
    { name: 'Emekli Nuri', x: -46, z: -298, av: { clothing: 'jacket', clothColor: '#6b5a44', hat: 'cap', hatColor: '#3a3226', facialHair: 'mustache', hairColor: '#d8d2c4', pantsColor: '#3a3226' }, lines: ['Mangal yakmayı unutma, yasak değil burada.', 'Karacalar sabah erken çıkar.'] },
    { name: 'Ressam Deniz', x: 98, z: -253, av: { gender: 'kadin', clothing: 'hoodie', clothColor: '#4a7a9a', pantsColor: '#2b3550' }, lines: ['Göletin ışığı bu saatte çok güzel.'] },
    { name: 'Büfeci Kemal', x: 34, z: -208, av: { clothing: 'vest', clothColor: '#f4f1e8', hat: 'cap', hatColor: '#2f7a3a', pantsColor: '#2a2420' }, lines: ['Gözleme, ayran, çay!', 'Sincaplara fındık atma, alışıyorlar.'] },
  ].forEach((n) => W.npcDefs.push({ id: `npc_dis_${ni++}`, ...n, y: W.terrainY(n.x, n.z) + 0.05 }));

  // --- yol üstü istasyonları (sadece RP; para yok) -------------------------------------------
  const FREE_ACTS = { mola: '😴 Mola verdin — dinç devam!', mangal: '🔥 Mangal yandı — köfteler cızırdıyor!', manzara: '🦢 Gölde kuğular süzülüyor…', su: '💧 Buz gibi çeşme suyu', tavla: null, sos: '📞 Yol yardım: "Aracınız sağlam, iyi yolculuklar."', cete: '🕶️ Kapı aralandı: "Şifre?" … kapı yüzüne kapandı.', cete2: '💬 Bekçi: "Burada gördüklerini kimseye anlatma."' };
  W.spotActs = (x, z, walking, slow) => {
    if (walking) {
      const q = pierLocal(x, z);
      if (q && q.on && q.u > rsGeo().pier.Lw - 1) return [{ id: 'manzara', label: '🦢 Göle bak' }];
    }
    for (const pad of rsGeo().pads) {
      if (Math.abs(x - pad.mx) > pad.r + 30 || Math.abs(z - pad.mz) > pad.r + 30) continue;
      for (const zn of pad.zones || []) {
        if (!zn.acts?.length) continue;
        const w = fromPad(pad, zn.x, zn.z);
        const d = Math.hypot(x - w.x, z - w.z);
        const acts = zn.acts.filter((a) => a.id in FREE_ACTS);
        if (!acts.length) continue;
        if (walking && zn.foot && d < zn.r) return acts;
        if (!walking && zn.truck && d < zn.r && slow) return acts;
      }
    }
    return null;
  };
  W.spotText = (id) => (id === 'tavla' ? (Math.random() < 0.5 ? '🎲 Muhtarı 5-3 yendin!' : '🎲 Hüseyin Amca seni mars etti 😅') : FREE_ACTS[id] || null);

  // --- bölge adı (üst şeritte) ---------------------------------------------------------------
  W.zoneName = (x, z, mode, s) => {
    if (mode === 'town') return 'Kervankent';
    if (mode === 'city') return null;
    const b = branchAt(x, z);
    if (b && b.d < 14) return { vadi: 'Akçay Vadisi Köy Yolu', golyaka: 'Gölyaka Köyü', camlica: 'Çamlıca Köyü', gol_yolu: 'Kuğu Gölü Yolu', maden_yolu: 'Maden Yolu', cete_yol: 'Hurdalık Yolu' }[b.b.key] || 'Köy yolu';
    const p = padAt(x, z);
    if (p && (p.village || p.kind === 'cete' || p.kind === 'piknik' || p.kind === 'maden')) return p.name;
    if (inPark(x, z)) return 'Neon Kent Ormanı';
    if (s != null) {
      if (inTunnel(s)) return 'Kartal Tüneli';
      if (s > TAGS.kopruA && s < TAGS.kopruB) return 'Akçay Köprüsü';
      if (s < TAGS.viraj - 80 && s > TAGS.gol - 160) return 'Kuğu Gölü';
      if (s > TAGS.viraj - 20 && s < TAGS.tunelA) return 'Kartal Dağı virajları';
      if (s > TAGS.orman - 150 && s < LEN - 200) return 'Çam Ormanı';
    }
    return 'O-77 Otoyolu';
  };

  return W;
}
// motor kitlerden ışık / koltuk / NPC topladıktan SONRA çağrılır
export function mergeCityWorld(W, scene) {
  W.outerKits.forEach((k) => k.dynamic.traverse((o) => (o.userData.dyn = true)));
  const merged = mergeOuter(W.outerRoot);
  W.outerRoot.add(merged);
  W.mergedOuter = merged;
  scene.updateMatrixWorld(true);
  return merged;
}

// --- hayvanlar (şehir yürüme ızgarası hazır olunca) ----------------------------------------
export function buildAnimals(W, scene, { cityFree, groundCity, mobile }) {
  const animals = new Animals(scene);
  const forest = { free: (x, z) => inPark(x, z, -4) && !W.parkGrid.cell(x, z) && !W.treeHit(x, z, 0.3), y: (x, z) => W.terrainY(x, z) };
  const pond = { free: (x, z) => inPond(x, z, 0.7), y: () => pondY() };
  W.park.wild.forEach((w, i) => {
    if (mobile && i % 2) return;
    animals.add(w.kind, w.xz[0], w.xz[1], w.pond ? pond : forest, w.v, { homeR: w.pond ? 30 : 60 });
  });
  // köyler: inek, koyun, tavuk, köpek
  rsGeo().pads.forEach((p) => (p.animals || []).forEach((a) => {
    const [ax0, az0, ax1, az1] = a.area;
    const reg = {
      free: (x, z) => {
        const l = toPad(p, x, z);
        return l.x > ax0 && l.x < ax1 && l.z > az0 && l.z < az1 && !p.walk.cell(l.x, l.z);
      },
      y: (x, z) => {
        const l = toPad(p, x, z);
        return p.yAt(l.x, l.z);
      },
    };
    const w = fromPad(p, a.x, a.z);
    animals.add(a.kind, w.x, w.z, reg, a.v, { homeR: a.homeR || 12 });
  }));
  // Akçay vadisi: yaban hayvanları, kartallar
  const valley = {
    free: (x, z) => {
      const b = branchAt(x, z);
      if (!b || b.d > 120) return false;
      return W.terrainY(x, z) > -8 && !W.treeHit(x, z, 0.4);
    },
    y: (x, z) => {
      const b = branchAt(x, z);
      return b && b.d < BR_HALF + 1 ? b.y + 0.07 : W.terrainY(x, z);
    },
  };
  (W.rs.valleyWild || []).forEach((w, i) => {
    if (mobile && i % 2) return;
    animals.add(w.kind, w.x, w.z, valley, w.v, { homeR: w.homeR });
  });
  // şehir: sokak kedileri + köpekleri (kaldırımlarda)
  const cityReg = (hx, hz, R) => ({ free: (x, z) => Math.hypot(x - hx, z - hz) < R && cityFree(x, z), y: (x, z) => groundCity(x, z) });
  const spots = [['camii', 'kedi', 3], ['park', 'kedi', 2], ['plaza', 'kedi', 2], ['liman', 'kedi', 2], ['cafe', 'kedi', 1], ['ev', 'kopek', 1], ['bar', 'kopek', 1], ['belediye', 'kopek', 1], ['stadyum', 'kopek', 1], ['fabrika', 'kedi', 1]];
  let vi = 0;
  spots.forEach(([type, kind, n]) => {
    const l = W.city.lots.find((q) => q.type === type);
    if (!l) return;
    for (let i = 0; i < n; i++) {
      const sx = (i % 2 ? 1 : -1) * (l.bw / 2 - 1.4);
      const x = l.mx + sx * (0.4 + (0.5 * (i % 3)) / 2);
      const z = l.mz + l.bd / 2 - 1.3;
      animals.add(kind, x, z, cityReg(x, z, kind === 'kedi' ? 7 : 12), vi++, { homeR: kind === 'kedi' ? 6 : 10 });
    }
  });
  return animals;
}

// otoyol üzerindeki mesafe (navigasyon / iş rotası için) — şehirden kasabaya giden şerit
export function hwyLanePts(s0, s1) {
  const k = s1 >= s0 ? 1 : -1;
  const out = [];
  const off = (s) => {
    let o = LANE;
    for (const G of GISES) o = Math.max(o, LANE + (3.2 - LANE) * Math.max(0, Math.min(1, (34 - Math.abs(s - G.s)) / 12)));
    return o;
  };
  for (let s = s0; k > 0 ? s < s1 : s > s1; s += 8 * k) {
    const f = frameAt(s);
    out.push({ x: f.x + f.rx * off(s) * k, z: f.z + f.rz * off(s) * k });
  }
  const f = frameAt(s1);
  out.push({ x: f.x + f.rx * LANE * k, z: f.z + f.rz * LANE * k });
  return out;
}
