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
import { VENUE_BUILDERS, ROOM as VROOM, stripVenueInt } from './venues.js';
import { Kit, M } from '../kit.js';
import { buildSea } from '../areas.js';
import { nearest, frameAt, inTunnel, RAIL, LANE, TOWN, toTown, fromTown, inTownRect, LAKE, RIVER, TERRAIN, TAGS, LEN, ROAD_HALF } from './route.js';
import { buildTerrain, buildRoad, buildTunnel, buildBridge, buildToll, buildSigns, buildTrees, buildWater, buildHorizon, S_EXIT, GISES } from './world.js';
import { buildTown } from './town.js';
import { buildRoadside } from './roadside.js';
import { Animals } from './animals.js';
import { PARK, inPark, parkCarve, buildNorthPark, pondY, inPond } from './northPark.js';
import { BEACH_RECT, DECKS, coastH, SEA_Y } from '../coast.js';
import { geo as rsGeo, padAt, branchAt, toPad, fromPad, carve as rsCarve, nearFeature, BR_HALF, pierLocal } from './roadsideGeo.js';
import { KORDON_X, COAST_X, OUTER, EAST_GATE_Z } from '../cityLayout.js';

const PI = Math.PI;
const V = THREE.Vector3;
export { nearest, frameAt, inTunnel, TOWN, toTown, fromTown, LEN, TAGS, LANE, ROAD_HALF, VROOM, SEA_Y };

// şehir modunun yürünebilir sınırı (kumsal / deniz / marina) + otoyol ağzı
export const WALK = { x0: -345, z1: COAST_Z + 120 };
export const EXIT = { x0: 196, x1: 206, z0: -146.4, z1: -133.6 }; // v158: yol + banket genişliğinde (eskiden 7 m — dış şeritlerde görünmez duvar vardı)
export const inExit = (x, z) => x > EXIT.x0 && x < EXIT.x1 && z > EXIT.z0 && z < EXIT.z1;
// motordaki şehir ızgarasının kapsadığı alan
export const CITY_GRID = { x0: WALK.x0 - 2, x1: EXIT.x1 + 12, z0: BOUNDS.z0 - 2, z1: WALK.z1 + 1 };

// mekân türü → oyundaki 3D mekân (functions/venueLayouts.js VENUES) — içeride oyunun işlemleri
// v159 — oyuncuların işletme açabildiği dükkânlar artık şehirde içine girilmeyen binalar: kapı kapalı
// ve geçilmez; kapının önünde mekân düğmeleri çıkar (ör. "🚗 Araba galerileri" listesi + "💰 Soygun yap").
// Oyuncu listeden istediği işletmeye girer.
// v159.1: ev, ofis ve depo (liman) binaları da — kapıda "🏠 Evler" / "🏢 Ofisler" / "📦 Depolar" düğmesi
export const CLOSED_SHOPS = new Set(['bar', 'cafe', 'netkafe', 'spor', 'galeri', 'silah', 'casino', 'modifiye', 'ev', 'ofis', 'liman']);
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
    v.rebuild = () => VENUE_BUILDERS[l.type]({ w: (rot ? l.bd : l.bw) - 6, d: (rot ? l.bw : l.bd) - 6 }); // v157.2: iç mekân yeniden kurulumu
    v.root.position.set(l.mx, 0, l.mz);
    v.ry = { s: 0, e: PI / 2, n: PI, w: -PI / 2 }[l.face] || 0;
    v.root.rotation.y = v.ry;
    // parselde duran seyyar satıcılar yeni binanın grubuna taşınır (aynı parsel dönüşü)
    l.kit.group.children.filter((c) => c.name?.startsWith('vendor_')).forEach((c) => v.root.add(c));
    // tır kapıdan sığmasın (sadece araç engeli)
    // v159: kapalı dükkânlarda kapı yayalara da geçilmez (kapı aralığının tamamı)
    v.closedShop = CLOSED_SHOPS.has(l.type);
    v.base.solid(v.door.x, v.door.z - 1.3, v.closedShop ? 1.6 : 1.4, 0.4);
    if (!v.closedShop) v.base.solids.at(-1).car = true;
    // v159.1: kapalı dükkânın kapısı yaklaşınca AÇILMAZ (oyuncular girmeye çalışmasın) — karargah kapısı gibi
    // içi görünmeyen (camsız) kapalı binanın iç eşyaları tamamen kaldırılır
    if (v.closedShop && !v.vitrine) stripVenueInt(v);
    if (v.closedShop) {
      (v.doors || []).forEach((dr) => {
        if (dr?.userData?.ctl) dr.userData.ctl.tick = undefined;
        dr?.traverse?.((o) => o.userData.doorVoid && (o.visible = true));
      });
    }
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
  const lod = makeLod();
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
    const geo = bakeGeo(g, o.matrixWorld);
    const cm = canonMat(o.material, geo);
    const lc = lod.classify(o);
    const key = `${lc ? `L${lc}` : `${Math.floor(wp.x / 96)},${Math.floor(wp.z / 96)}`}|${cm.key}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let b = buckets.get(key);
    if (!b) {
      b = { lodCell: lc, mat: cm.mat, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] };
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
    lodTag(m, b.lodCell);
    out.add(m);
  });
  lod.boxes().forEach((m) => out.add(m));
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
// v157.2 — malzeme birleştirme: aynı görünen malzemeler (renk / pürüzlülük / doku kaynağı …)
// tek malzemeye indirilir → birleştirmede çok daha az parça = çok daha az çizim çağrısı.
// Dokulu ve sadece 'map' kullanan malzemelerde tekrar/kaydırma UV'ye işlenir, böylece aynı
// dokunun farklı ölçekli kopyaları da tek malzemede birleşir.
const OTHER_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'lightMap', 'envMap', 'specularMap', 'displacementMap'];
const canonCache = new Map();
const hex = (c) => (c ? c.getHexString() : '-');
export function canonMat(mat, geo) {
  if (!mat || mat.isShaderMaterial || mat.onBeforeCompile?.toString() !== THREE.Material.prototype.onBeforeCompile.toString() || mat.userData?.noDedupe) {
    return { key: `u:${mat?.uuid}`, mat };
  }
  const map = mat.map;
  const others = OTHER_MAPS.some((k) => mat[k]);
  let mapKey = '-';
  let bake = false;
  if (map) {
    bake = !others && map.wrapS === THREE.RepeatWrapping && map.wrapT === THREE.RepeatWrapping && map.rotation === 0 && map.matrixAutoUpdate && geo?.attributes?.uv && !map.isVideoTexture;
    mapKey = bake ? `s:${map.source.uuid}|${map.magFilter}|${map.minFilter}|${map.colorSpace}|${map.anisotropy}|${map.flipY}` : `t:${map.uuid}`;
  }
  if (others) return { key: `u:${mat.uuid}`, mat };
  // dokusuz, opak, ışımasız standart malzemeler: renk + pürüzlülük/metallik köşelere işlenir →
  // farklı renkteki binlerce parça (duvar, çerçeve, eşya) TEK malzemede birleşir (çizim çağrısı ↓).
  // Bellek: uv (8 bayt) yerine renk (6) + pürüzlülük/metallik (2) — aynı.
  if (!map && mat.type === 'MeshStandardMaterial' && !mat.transparent && mat.opacity === 1 && mat.emissive.getHex() === 0 && geo?.attributes?.position && mat.alphaTest === 0) {
    const key = `vc|${mat.side}|${mat.flatShading ? 1 : 0}|${mat.fog ? 1 : 0}|${mat.depthWrite ? 1 : 0}|${mat.polygonOffset ? `${mat.polygonOffsetFactor},${mat.polygonOffsetUnits}` : 0}`;
    const n = geo.attributes.position.count;
    const col = new Uint16Array(n * 3);
    const rm = new Uint8Array(n * 2);
    const cr = Math.round(Math.min(1, mat.color.r) * 65535);
    const cg = Math.round(Math.min(1, mat.color.g) * 65535);
    const cb = Math.round(Math.min(1, mat.color.b) * 65535);
    const rr = Math.round(THREE.MathUtils.clamp(mat.roughness, 0, 1) * 255);
    const mm = Math.round(THREE.MathUtils.clamp(mat.metalness, 0, 1) * 255);
    for (let i = 0; i < n; i++) {
      col[i * 3] = cr;
      col[i * 3 + 1] = cg;
      col[i * 3 + 2] = cb;
      rm[i * 2] = rr;
      rm[i * 2 + 1] = mm;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setAttribute('rm', new THREE.BufferAttribute(rm, 2, true));
    geo.deleteAttribute('uv');
    let m = canonCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: mat.side, flatShading: mat.flatShading, fog: mat.fog, depthWrite: mat.depthWrite, polygonOffset: mat.polygonOffset, polygonOffsetFactor: mat.polygonOffsetFactor, polygonOffsetUnits: mat.polygonOffsetUnits });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
          .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
      };
      m.customProgramCacheKey = () => 'neon-vc-rm';
      m.userData.shared = true;
      m.userData.vcrm = true;
      canonCache.set(key, m);
    }
    return { key, mat: m };
  }
  const key = [
    mat.type, hex(mat.color), hex(mat.emissive), mat.emissiveIntensity ?? '-', mat.roughness ?? '-', mat.metalness ?? '-',
    mat.opacity, mat.transparent ? 1 : 0, mat.side, mat.alphaTest, mat.depthWrite ? 1 : 0, mat.depthTest ? 1 : 0,
    mat.flatShading ? 1 : 0, mat.fog ? 1 : 0, mat.toneMapped ? 1 : 0, mat.polygonOffset ? `${mat.polygonOffsetFactor},${mat.polygonOffsetUnits}` : 0,
    mat.blending, mat.colorWrite ? 1 : 0, mat.wireframe ? 1 : 0, mapKey,
  ].join('|');
  if (bake) {
    // uv' = uv * tekrar + kaydırma (döndürme yok; merkez hesaba katılır)
    const { repeat: r, offset: o, center: c } = map;
    if (r.x !== 1 || r.y !== 1 || o.x !== 0 || o.y !== 0) {
      const uv = geo.attributes.uv;
      const a = uv.array;
      const tx = -r.x * c.x + c.x + o.x;
      const ty = -r.y * c.y + c.y + o.y;
      for (let i = 0; i < a.length; i += 2) {
        a[i] = a[i] * r.x + tx;
        a[i + 1] = a[i + 1] * r.y + ty;
      }
      uv.needsUpdate = true;
    }
  }
  let m = canonCache.get(key);
  if (!m) {
    if (bake && (map.repeat.x !== 1 || map.repeat.y !== 1 || map.offset.x !== 0 || map.offset.y !== 0)) {
      m = mat.clone();
      m.map = map.clone();
      m.map.repeat.set(1, 1);
      m.map.offset.set(0, 0);
      m.map.center.set(0, 0);
      m.map.updateMatrix();
    } else m = mat;
    canonCache.set(key, m);
  }
  return { key, mat: m };
}

// v157.2 — MESAFEYE GÖRE DETAY (LOD). Küçük eşyalar (koltuk, masa, saksı, tabure…):
//   yakın  → tam model
//   orta   → eşyanın kendi renginde tek kutu (uzaktan kırmızı koltuk = kırmızı kutu)
//   uzak   → hiç çizilmez
// Binalar, yollar, büyük parçalar her mesafede tam kalır. Eşyalar 32 m'lik hücrelere toplanır;
// hücre merkezinin kameraya uzaklığına göre "yakın" ya da "orta" parçası görünür (ikisi birden asla).
export const LOD_CELL = 32;
const LOD_ITEM_R = 2.6;
const avgTexCache = new Map();
function avgTexColor(map) {
  const k = map.source.uuid;
  if (avgTexCache.has(k)) return avgTexCache.get(k);
  let c = new THREE.Color(1, 1, 1);
  try {
    const img = map.image;
    if (img && img.width) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 2;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 2, 2);
      const d = g.getImageData(0, 0, 2, 2).data;
      let r = 0;
      let gg = 0;
      let b = 0;
      for (let i = 0; i < 16; i += 4) {
        r += d[i];
        gg += d[i + 1];
        b += d[i + 2];
      }
      c = new THREE.Color().setRGB(r / 1020, gg / 1020, b / 1020, THREE.SRGBColorSpace);
    }
  } catch {
    /* yoksay */
  }
  avgTexCache.set(k, c);
  return c;
}
export function lodTag(m, cell) {
  if (!cell) return;
  const [i, j] = cell.split(',').map(Number);
  m.userData.lod = 'near';
  m.userData.cellC = { x: (i + 0.5) * LOD_CELL, z: (j + 0.5) * LOD_CELL };
}
export function makeLod() {
  const info = new Map();
  const v3 = new THREE.Vector3();
  const itemRoot = (o) => {
    for (let p = o; p; p = p.parent) if (p.userData?.itemKey) return p;
    return null;
  };
  // parça bir LOD eşyasına aitse hücre anahtarını döndürür (yoksa null)
  function classify(o) {
    const root = itemRoot(o);
    if (!root) return null;
    let inf = info.get(root);
    if (!inf) {
      const bb = new THREE.Box3().setFromObject(root);
      const r = bb.isEmpty() ? 0 : bb.getSize(v3).length() / 2;
      if (r > LOD_ITEM_R || r < 0.04 || root.userData.noLod) inf = { skip: true };
      else {
        const c = bb.getCenter(new THREE.Vector3());
        const ci = Math.floor(c.x / LOD_CELL);
        const cj = Math.floor(c.z / LOD_CELL);
        inf = { bb, cell: `${ci},${cj}`, color: new THREE.Color(0.6, 0.6, 0.6), w: -1 };
      }
      info.set(root, inf);
    }
    if (inf.skip) return null;
    const m = o.material;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const w = g.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z);
    if (w > inf.w && m && !m.transparent) {
      inf.w = w;
      const col = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
      if (m.map?.image) col.multiply(avgTexColor(m.map));
      if (m.emissive && col.getHex() === 0) col.copy(m.emissive);
      inf.color = col;
    }
    return inf.cell;
  }
  // hücre başına eşya kutuları (tek geometri)
  // v159.3: uzaktaki eşyaların renkli KUTU hâli kaldırıldı ("küp küp" görünüyordu) — eşya yakında tam
  // model, ötesinde hiç çizilmez (kutular da artık kurulmuyor → daha az bellek)
  const LOD_BOXES = false;
  function boxes() {
    if (!LOD_BOXES) return [];
    const cells = new Map();
    info.forEach((inf) => {
      if (inf.skip) return;
      const size = inf.bb.getSize(new THREE.Vector3());
      const c = inf.bb.getCenter(new THREE.Vector3());
      const bg = new THREE.BoxGeometry(Math.max(0.05, size.x), Math.max(0.05, size.y), Math.max(0.05, size.z));
      bg.translate(c.x, c.y, c.z);
      bg.deleteAttribute('uv');
      const dummy = new THREE.MeshStandardMaterial({ color: inf.color, roughness: 0.8 });
      const cm = canonMat(dummy, bg);
      dummy.dispose();
      let L = cells.get(inf.cell);
      if (!L) cells.set(inf.cell, (L = { mat: cm.mat, geos: [] }));
      L.geos.push(bg);
    });
    const out = [];
    cells.forEach((L, cell) => {
      const merged = mergeGeometries(L.geos, false);
      L.geos.forEach((g) => g.dispose());
      if (!merged) return;
      const m = new THREE.Mesh(merged, L.mat);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.userData.dyn = true;
      m.userData.lod = 'mid';
      const [i, j] = cell.split(',').map(Number);
      m.userData.cellC = { x: (i + 0.5) * LOD_CELL, z: (j + 0.5) * LOD_CELL };
      out.push(m);
    });
    return out;
  }
  return { classify, boxes };
}

// v157.1 — birleştirme için geometri hazırlığı: İNDEKSLİ kalır (eskiden toNonIndexed ile her
// köşe her üçgende ayrı kopyalanıyordu → silindir/küre eşyalarında 2-3 kat fazla bellek).
// Sadece position/normal/uv; dünya/yerel matris uygulanır, ayna ölçekte üçgen yönü çevrilir.
export function bakeGeo(g, m4) {
  const inter = ['position', 'normal', 'uv'].some((n) => g.attributes[n]?.isInterleavedBufferAttribute);
  let geo;
  if (inter) {
    geo = g.index ? g.toNonIndexed() : g.clone();
    Object.keys(geo.attributes).forEach((n) => {
      if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    });
  } else {
    // sadece gereken öznitelikler kopyalanır (g.clone() hepsini kopyalıyordu — yüklemenin en ağır kısmı)
    geo = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach((n) => g.attributes[n] && geo.setAttribute(n, g.attributes[n].clone()));
    if (g.index) geo.setIndex(g.index.clone());
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  geo.clearGroups();
  geo.morphAttributes = {};
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.applyMatrix4(m4);
  if (m4.determinant() < 0) {
    const ix = geo.index.array;
    for (let i = 0; i + 2 < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  return geo;
}

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
        m4.multiplyMatrices(inv, o.matrixWorld);
        const geo = bakeGeo(g, m4);
        const cm = canonMat(mat, geo);
        const key = `${cm.key}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat: cm.mat, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] }));
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
    m.userData.merged = true;
    root.add(m);
  });
  return remove.length;
}
// mekânın tüm parçaları: alçak duvarlar (yön başına), iç yüzler, kökler, iç eşyalar
// v157.2 — telefonda mekân içi (eşyalar) sadece yakında + yavaşken kurulur, uzaklaşınca bırakılır.
// İç duvarlar, çarpışma, oturma yerleri, NPC'ler hep kalır; sadece birleştirilmiş eşya görüntüsü gider/gelir.
export function dropVenueInt(v) {
  if (v.intOn === false || v.noInt) return;
  [...v.int.group.children].forEach((m) => {
    if (!m.userData.merged && !m.userData.rb) return;
    v.int.group.remove(m);
    if (m.userData.merged) m.geometry.dispose();
  });
  v.intOn = false;
}
// v158.1 — yalıtılmış mekânın (çete karargahı) içi BÜTÜNÜYLE yenilenir: zemin, tavan, iç duvarlar, kökler,
// eşyalar. Eskiden yenilemede sadece birleşik parçalar eklenip ilk kurulumun zemini / tavanı yerinde
// kalıyordu → iki zemin üst üste (farklı dokular) titreşip "devamlı değişiyordu"; duvar seçimi de görünmüyordu.
export function swapVenueInt(v) {
  if (!v.rebuild || v.noInt) return;
  const P2 = v.rebuild();
  const walls = [...P2.lowInner, ...(P2.stubs || [])];
  mergeInPlace(P2.int.group, new Set(walls));
  P2.lowInner.forEach((g) => mergeInPlace(g));
  (P2.stubs || []).forEach((g) => {
    g.visible = true;
    mergeInPlace(g);
  });
  P2.lowInner.forEach((g, i) => (g.visible = v.lowInner[i] ? v.lowInner[i].visible : true));
  (P2.stubs || []).forEach((g, i) => (g.visible = v.stubs?.[i] ? v.stubs[i].visible : false));
  // eski iç: ışık / çarpışma işaretleri (boş Object3D) kalır, görünen her şey gider
  [...v.int.group.children].forEach((m) => {
    if (m.type === 'Object3D') return;
    v.int.group.remove(m);
    m.traverse((o) => o.isMesh && o.userData.merged && o.geometry.dispose());
  });
  [...P2.int.group.children].forEach((m) => {
    if (m.type === 'Object3D') return;
    if (!walls.includes(m)) m.userData.rb = true;
    v.int.group.add(m);
  });
  v.lowInner = P2.lowInner;
  v.stubs = P2.stubs || [];
  v.intOn = true;
}
export function buildVenueInt(v) {
  if (v.intOn !== false || !v.rebuild || v.noInt) return;
  if (v.isolated) return swapVenueInt(v);
  const P2 = v.rebuild();
  mergeInPlace(P2.int.group, new Set([...P2.lowInner, ...(P2.stubs || [])]));
  [...P2.int.group.children].forEach((m) => {
    if (!m.userData.merged) return;
    P2.int.group.remove(m);
    v.int.group.add(m);
  });
  v.intOn = true;
}
export function mergeVenue(v) {
  v.low.forEach((k) => mergeInPlace(k.group));
  if (v.garage?.shell) mergeInPlace(v.garage.shell);
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
      W.treeHash.get(k).push([x, z, 0.26 * sc + 0.06]); // v157.3: sadece gövde (ağaç arası rahat geçilsin)
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
  // v157.4: yol üstü mekânlar (Neon Petrol marketleri) — cebin grubunda; dünya konumu matristen
  (W.rs.venues || []).forEach((v) => {
    const c = v.root.localToWorld(new V(v.room.cx, 0, v.room.cz));
    const o = v.root.getWorldPosition(new V());
    v.wx = c.x;
    v.wz = c.z;
    v.ry = v.pad.ry + v.padRy;
    v.y0 = o.y;
    venues.push(v);
  });
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
  // v157.3 — yan yolların ana yola bağlandığı ağızlar: araç için geniş tutulur (köşelere takılmadan
  // otoyola çıkılsın / sapılsın). Ağzın 18 m çevresinde otoyol bandı ve köy yolu payı genişler.
  const JUNCS = [];
  rsGeo().branches.forEach((b) => {
    [b.pts[0], b.pts[b.pts.length - 1]].forEach(([x, z]) => {
      const n = nearest(x, z, -1);
      if (n && n.dist < 60 && Math.abs(n.d) < RAIL + 14) JUNCS.push([x, z]);
    });
  });
  const atJunc = (x, z) => JUNCS.some(([jx, jz]) => (x - jx) ** 2 + (z - jz) ** 2 < 18 * 18);
  function hwyFree(px, pz, r, hint, walk, curY = null) {
    const p = padAt(px, pz);
    if (p) return !padBlocked(p, px, pz, walk ? 0.24 : r, walk);
    if (walk) {
      const q = pierLocal(px, pz);
      if (q && q.rail) return false; // iskele korkuluğu
      if (q && q.on) return true;
      // yaya: arazinin her yeri (orman, tepe, kıyı) — sadece ağaç gövdeleri, park eşyaları ve dünya sınırı
      if (inPark(px, pz)) {
        // v157.3: ormanda serbest yürünür (sadece ağaç gövdeleri / park eşyaları engel)
        return !parkGrid.cell(px, pz);
      }
      if (px < TERRAIN.x0 + 40 || px > TERRAIN.x1 - 40 || pz < TERRAIN.z0 + 40 || pz > TERRAIN.z1 + 400) return false;
      if (inTownRect(px, pz, 6)) return false;
      return !treeHit(px, pz, 0.2);
    }
    const n = nearest(px, pz, hint);
    if (n && n.s >= S_EXIT - 30 && n.dist < 40) {
      // v157.9: gişe meydanında bariyer yok, şeritler dış adaya kadar geniş — görünmez duvar kalktı
      const atToll = GISES.some((G) => Math.abs(n.s - G.s) < 19);
      const lim = (atToll ? 7.4 - 0.6 : RAIL - 0.45) - r;
      if (Math.abs(n.d) <= lim && (curY === null || Math.abs(n.y - curY) < 4)) {
        for (const G of GISES) if (Math.abs(n.s - G.s) < 8.6) for (const a of [-7.4, 0, 7.4]) if (Math.abs(n.d - a) < 0.6 + r) return false;
        return true;
      }
    }
    const b = branchAt(px, pz);
    if (b && b.d <= BR_HALF + 3 - r * 0.6 && (curY === null || Math.abs(b.y - curY) < 4)) return true; // köy yolu + çim payı
    if (atJunc(px, pz)) {
      if (n && n.dist < 40 && Math.abs(n.d) <= RAIL + 2.5 && (curY === null || Math.abs(n.y - curY) < 4)) return true;
      if (b && b.d <= BR_HALF + 6 && (curY === null || Math.abs(b.y - curY) < 4)) return true;
    }
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
    if (v.isolated || v.closedShop) return; // v158: karargah kapısı kendiliğinden açılmaz (düğmeyle girilir) · v159: kapalı dükkân
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
      // v157.1: garajın içindeyken (yaya / araç) duvar + çatı gizlenir, alçak dipler kalır
      if (g.shell) {
        const dx = px - g.x;
        const dz = pz - g.z;
        const c = Math.cos(g.ry);
        const sn = Math.sin(g.ry);
        const lx = dx * c - dz * sn;
        const lz = dx * sn + dz * c;
        const inside = Math.abs(lx) < g.gw / 2 + 0.3 && lz < 0.6 && lz > -g.gd - 0.3;
        if (g.shell.visible === inside) {
          g.shell.visible = !inside;
          g.obj.visible = !inside; // kepenk de (kamera dışarıda kalabiliyor)
        }
      }
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
