// =============================================================================
// GİRİLEBİLİR MEKÂNLAR — Camii, Banka, Karakol, Belediye
// Dış cephe oyundaki binalarla aynı karakterde; gövde, oyundaki 3D mekân odasını
// (venueLayouts.js: 18 × 14 m, duvar 3,4 m) içine alacak kadar genişletildi.
// İç: oyundaki mekânla birebir — aynı duvar/zemin dokusu, aynı eşyalar aynı
// yerlerde, aynı NPC'ler ve istasyonlar. Kapı oyundaki gibi ön duvarda x = 5.
// Parçalar: base (hep görünür), low[4] (0–3,6 m duvarlar: ön/sağ/arka/sol),
// high (3,6 m üstü: üst kat, çatı, kubbe, kule — içerideyken gizlenir), int (iç).
// =============================================================================
import * as THREE from 'three';
import { Kit, M, glowMat, canvasTex, GLASS, basicGlow, roundRect } from '../kit.js';
import { tower } from '../buildings.js';
import { buildVehicle } from '../vehicles.js';
import { gameVenue, NEW_VENUES } from './layouts.js';
import './newItems.js';
import * as J from '../jobBuildings.js';
import { makeCoach } from './otogar.js';
import { surfaceTexture, wallDef, floorDef } from '../../HouseScreen/houseTextures.js';

const PI = Math.PI;
export const ROOM = { W: 18, D: 14, H: 3.4 };
const T = 0.3; // dış duvar kalınlığı
const LOWH = 3.6;
export const DOOR = { x: 5, w: 1.9, h: 2.4 };
// kapı eşyasının açıklığı [genişlik, yükseklik] — duvar boşluğu kapıyla birebir (üstünde/yanında boşluk kalmaz)
const DOOR_SIZE = { door_cam: [1.1, 2.25], door_cift: [1.9, 2.3], door_doner: [2.3, 2.35], door_market: [1.9, 2.3], door_metal: [1.05, 2.2], door_salon: [1.4, 2.3], door_hastane: [1.9, 2.3], door_beyaz: [1.0, 2.15], door_ahsap: [1.1, 2.25] };
let RX = 0; // oda merkezinin parsel içindeki x kayması (ev, liman)
// dış kapı: oyundaki açılır kapı eşyaları (yaklaşınca açılır, arkası karanlık boşluk)
const RZ = -5.2; // oda merkezi (parsel yerel z) → ön duvar z = 1.8

function archWindow(kit, x, y, z, w, h, ry, color = '#ffcf7a', inten = 1.6) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, PI, 0, true);
  s.lineTo(w / 2, 0);
  s.closePath();
  return kit.mesh(new THREE.ShapeGeometry(s, 12), glowMat(color, inten), x, y, z, ry, { cast: false });
}

// --- ortak kabuk ---------------------------------------------------------------------
// ext: (kit, w, h, d, x, y, z) → dış duvar kutusu çizer
// vitrin: ön duvar kapının iki yanında cam (dükkânlar) — sokaktan içerisi görünür
function shell(parts, { ext, extH, venue, doorKey, vitrine = false, ceil = '#1a1b20' }) {
  const base = parts.base;
  const [DW, DH] = DOOR_SIZE[doorKey] || [1.9, 2.3];
  // oda kayması: kabuk + iç gruplar birlikte kayar
  [...parts.low, parts.high].forEach((k) => (k.group.position.x = RX));
  const W = ROOM.W;
  const D = ROOM.D;
  const z0 = RZ - D / 2;
  const z1 = RZ + D / 2;
  const [front, right, back, left] = parts.low;
  const hi = parts.high;
  ext(back, W + 2 * T, LOWH, T, 0, 0, z0 - T / 2);
  ext(left, T, LOWH, D + 2 * T, -W / 2 - T / 2, 0, RZ);
  ext(right, T, LOWH, D + 2 * T, W / 2 + T / 2, 0, RZ);
  const dl = DOOR.x - DW / 2;
  const dr = DOOR.x + DW / 2;
  const fz = z1 + T / 2;
  const glassM = new THREE.MeshStandardMaterial({ color: '#cfe8f5', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const glassSpans = [];
  if (vitrine) {
    // ön: köşe ayakları + kapı yan ayakları + cam (0,55–2,9 m) + alt parapet + üst kuşak
    const PW = 0.6;
    const L0 = -W / 2 - T;
    const R0 = W / 2 + T;
    const piers = [[L0, L0 + PW], [dl - 0.35, dl], [dr, dr + 0.35], [R0 - PW, R0]];
    piers.forEach(([a, b]) => ext(front, b - a, LOWH, T, (a + b) / 2, 0, fz));
    [[L0 + PW, dl - 0.35], [dr + 0.35, R0 - PW]].forEach(([a, b]) => {
      ext(front, b - a, 0.55, T, (a + b) / 2, 0, fz);
      ext(front, b - a, LOWH - 2.9, T, (a + b) / 2, 2.9, fz);
      const g = front.mesh(new THREE.PlaneGeometry(b - a, 2.35), glassM, (a + b) / 2, 0.55 + 2.35 / 2, fz, 0, { cast: false, receive: false });
      g.renderOrder = 5;
      // ince kayıtlar
      for (let x = a + 2; x < b - 0.5; x += 2) front.box(0.06, 2.35, 0.08, M('#3a3d42', 0.4, 0.6), x, 0.55, fz);
      glassSpans.push([a, b]);
    });
    ext(front, DW, LOWH - DH, T, DOOR.x, DH, fz);
  } else {
    ext(front, dl + W / 2 + T, LOWH, T, (-W / 2 - T + dl) / 2, 0, fz);
    ext(front, W / 2 + T - dr, LOWH, T, (dr + W / 2 + T) / 2, 0, fz);
    ext(front, DW, LOWH - DH, T, DOOR.x, DH, fz);
  }
  // dış kapı: oyundaki açılır kapı (yaklaşınca açılır). Arkası boş — açılınca içerisi görünür.
  const door = front.item(doorKey, DOOR.x, z1 + T + 0.005, 0, 0, { solid: false, y: 0.02 });
  door?.traverse((o) => {
    if (o.userData.doorVoid) o.visible = false;
  });
  parts.doors.push(door);
  // dışarıdan kamera binanın içine girmesin
  base.blocker(W + 2 * T, extH, D + 2 * T, RX, 0, RZ).userData.venueShell = true;
  ext(hi, W + 2 * T, extH - LOWH, D + 2 * T, 0, LOWH, RZ);
  // çarpışma: kapı boşluğu açık. v157.1: çarpışma boşluğu kapıdan 0,35 m geniş (her yanda) —
  // dar kapıdan girmek çok zordu; görünen kapı/duvar aynı
  const cdl = dl - 0.35;
  const cdr = dr + 0.35;
  base.solid(RX, z0 - T / 2, W / 2 + T, T / 2 + 0.05);
  base.solid(RX - W / 2 - T / 2, RZ, T / 2 + 0.05, D / 2 + T);
  base.solid(RX + W / 2 + T / 2, RZ, T / 2 + 0.05, D / 2 + T);
  base.solid(RX + (-W / 2 - T + cdl) / 2, fz, (cdl + W / 2 + T) / 2, T / 2 + 0.05);
  base.solid(RX + (cdr + W / 2 + T) / 2, fz, (W / 2 + T - cdr) / 2, T / 2 + 0.05);
  // İÇ — oyundaki oda
  const inner = parts.int;
  inner.group.position.set(RX, 0, RZ);
  const f = floorDef(venue.floor);
  const fm = new THREE.MeshStandardMaterial({ map: surfaceTexture(f, W / f.rep, D / f.rep), roughness: f.rough ?? 0.5, metalness: 0.05 });
  inner.mesh(new THREE.PlaneGeometry(W, D), fm, 0, 0.16, 0, 0, { cast: false, rx: -PI / 2 }).receiveShadow = true;
  // kapı eşiği (duvar kalınlığında zemin)
  inner.mesh(new THREE.PlaneGeometry(DW, T + 0.1), fm, DOOR.x, 0.161, D / 2 + T / 2, 0, { cast: false, rx: -PI / 2 });
  const w = wallDef(venue.wall);
  const wm = (len, h = ROOM.H) => new THREE.MeshStandardMaterial({ map: w.mural ? surfaceTexture(w, len / (ROOM.H * 2), h / ROOM.H) : surfaceTexture(w, len / w.rep, h / w.rep), roughness: w.rough ?? 0.9 });
  const wallPlane = (k, len, h, x, y, z, ry) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wm(len, h));
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.receiveShadow = true;
    parts.lowInner[k].add(o);
    return o;
  };
  const Y0 = 0.16;
  wallPlane(2, W, ROOM.H, 0, ROOM.H / 2 + Y0, -D / 2 + 0.01, 0);
  wallPlane(1, D, ROOM.H, W / 2 - 0.01, ROOM.H / 2 + Y0, 0, -PI / 2);
  wallPlane(3, D, ROOM.H, -W / 2 + 0.01, ROOM.H / 2 + Y0, 0, PI / 2);
  // ön iç yüz: kapı ve vitrin camları boş
  const fzIn = D / 2 - 0.01;
  const solidSpans = [];
  let cur = -W / 2;
  const holes = [[dl, dr], ...glassSpans.map(([a, b]) => [Math.max(-W / 2, a), Math.min(W / 2, b)])].sort((p, q) => p[0] - q[0]);
  holes.forEach(([a, b]) => {
    if (a > cur) solidSpans.push([cur, a]);
    cur = Math.max(cur, b);
  });
  if (cur < W / 2) solidSpans.push([cur, W / 2]);
  solidSpans.forEach(([a, b]) => wallPlane(0, b - a, ROOM.H, (a + b) / 2, ROOM.H / 2 + Y0, fzIn, PI));
  wallPlane(0, DW, ROOM.H - DH, DOOR.x, DH + (ROOM.H - DH) / 2 + Y0, fzIn, PI);
  glassSpans.forEach(([a0, b0]) => {
    const a = Math.max(-W / 2, a0);
    const b = Math.min(W / 2, b0);
    wallPlane(0, b - a, 0.55 - Y0, (a + b) / 2, (0.55 + Y0) / 2, fzIn, PI);
    wallPlane(0, b - a, ROOM.H + Y0 - 2.9, (a + b) / 2, (2.9 + ROOM.H + Y0) / 2, fzIn, PI);
  });
  // tavan + kök duvarlar
  inner.mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: ceil, roughness: 0.9 }), 0, ROOM.H + Y0, 0, 0, { cast: false, rx: PI / 2 });
  const STUB = 0.45;
  parts.stubs = [0, 1, 2, 3].map(() => {
    const g = new THREE.Group();
    g.visible = false;
    inner.group.add(g);
    return g;
  });
  const stubP = (k, a, b, x0, z, ry, horiz) => {
    const len = b - a;
    const sg = new THREE.PlaneGeometry(len, STUB);
    const o = new THREE.Mesh(sg, wm(len, STUB));
    const c = (a + b) / 2;
    o.position.set(horiz ? c : x0, STUB / 2 + Y0, horiz ? z : c);
    o.rotation.y = ry;
    parts.stubs[k].add(o);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.06, 0.3), M('#23242a', 0.8));
    cap.position.set(o.position.x - Math.sin(ry) * 0.15, STUB + Y0 + 0.03, o.position.z - Math.cos(ry) * 0.15);
    cap.rotation.y = ry;
    parts.stubs[k].add(cap);
  };
  [[-W / 2, dl], [dr, W / 2]].forEach(([a, b]) => stubP(0, a, b, 0, D / 2 - 0.01, PI, true));
  stubP(1, -D / 2, D / 2, W / 2 - 0.01, 0, -PI / 2, false);
  stubP(2, -W / 2, W / 2, 0, -D / 2 + 0.01, 0, true);
  stubP(3, -D / 2, D / 2, -W / 2 + 0.01, 0, PI / 2, false);
  const trim = M('#141416', 0.5);
  [[2, W, 0, -D / 2 + 0.03, 0], [1, D, W / 2 - 0.03, 0, PI / 2], [3, D, -W / 2 + 0.03, 0, PI / 2]].forEach(([k, len, x, z, ry]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.04), trim);
    b.position.set(x, 0.22, z);
    b.rotation.y = ry;
    parts.lowInner[k].add(b);
  });
  venue.items.forEach((d) => {
    const isDoor = d.k.startsWith('door') || d.k === 'doordeco';
    if (isDoor) return; // gerçek kapı var — içte ayrı kapı yok
    const o = inner.item(d.k, d.x, d.z, d.r || 0, d.c || 0, { solid: true, y: Y0, dyn: true });
    if (!o) return;
    const k = Math.abs(d.z - D / 2) < 0.05 ? 0 : Math.abs(d.x - W / 2) < 0.05 ? 1 : Math.abs(d.z + D / 2) < 0.05 ? 2 : Math.abs(d.x + W / 2) < 0.05 ? 3 : -1;
    if (k >= 0) parts.lowInner[k].add(o);
  });
  inner.light(0, 3.2, -2, '#fff1d6', 6, 14);
  inner.light(-5, 3.2, 2, '#fff1d6', 4.5, 11);
  inner.light(5, 3.2, 2, '#fff1d6', 4.5, 11);
}

// üst katlar (dükkânın üstünde apartman / ofis): oyundaki kule cephesi, zemin katı boş
function upper(P, { style, h, extH, crown = null, seed = 1 }) {
  const tmp = new Kit('tmp');
  tower(tmp, { w: ROOM.W + 2 * T - 0.4, d: ROOM.D + 2 * T - 0.4, h, x: 0, z: RZ, style, crown, seed, base: { h: extH } });
  const keep = [];
  tmp.group.children.slice().forEach((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const bottom = o.position.y + o.geometry.boundingBox.min.y * o.scale.y;
    if (bottom < extH - 0.05) return; // zemin kata inen gövde / subasman → içeriyi doldurmasın
    keep.push(o);
  });
  keep.forEach((o) => P.high.group.add(o));
  P.high.box(ROOM.W + 2 * T - 0.6, h - extH, ROOM.D + 2 * T - 0.6, M('#b9b2a6', 0.9), 0, extH, RZ, { receive: false });
}

function newParts(name) {
  const root = new THREE.Group();
  root.name = name;
  const mk = (n) => {
    const k = new Kit(`${name}_${n}`);
    root.add(k.group);
    return k;
  };
  const parts = { doors: [], root, base: mk('base'), high: mk('high'), int: mk('int'), low: [mk('on'), mk('sag'), mk('arka'), mk('sol')] };
  parts.lowInner = [0, 1, 2, 3].map(() => {
    const g = new THREE.Group();
    parts.int.group.add(g);
    return g;
  });
  return parts;
}
const wallExt = (key, tint) => (kit, w, h, d, x, y, z) => kit.wallBox(key, w, h, d, x, y, z, { tint });
const colExt = (mat) => (kit, w, h, d, x, y, z) => kit.box(w, h, d, mat, x, y, z);
const FZ = RZ + ROOM.D / 2 + T; // dış ön yüz z

// =============================================================================
export function buildCamiiVenue(lot) {
  DOOR.x = 0; // kapı ortada (iç yerleşim buna göre kaydırıldı)
  const P = newParts('camii');
  const { w, d } = lot;
  const venue = gameVenue('camii');
  P.base.floor('mermer_beyaz', w, d, 0, 0);
  const lead = M('#7f8ea3', 0.35, 0.55);
  const gold = M('#d9a93c', 0.25, 1);
  const stone = M('#d8cdb6', 0.7);
  const extH = 7.4;
  shell(P, { ext: wallExt('mermer_duvar'), extH, venue, doorKey: 'door_cift', ceil: '#f6f4ee' });
  const bw = ROOM.W + 2 * T;
  const bd = ROOM.D + 2 * T;
  const bz = RZ;
  const hi = P.high;
  hi.box(bw + 0.5, 0.45, bd + 0.5, stone, 0, extH, bz);
  // kemerli pencereler: alt sıra (alçak duvarlarda), üst sıra (yüksekte)
  for (const side of [-1, 1]) {
    const k = side > 0 ? P.low[1] : P.low[3];
    for (let i = 0; i < 5; i++) {
      const zz = bz - bd / 2 + 1.8 + i * 2.75;
      archWindow(k, side * (bw / 2 + 0.02), 1.0, zz, 1.1, 2.3, side * PI / 2);
      archWindow(hi, side * (bw / 2 + 0.02), 4.5, zz, 0.8, 1.6, side * PI / 2, '#ffd99a', 1.2);
    }
  }
  for (let i = 0; i < 6; i++) archWindow(hi, -7.5 + i * 3, 4.5, FZ + 0.02, 0.8, 1.6, 0, '#ffd99a', 1.2);
  // kasnak + ana kubbe (gövde büyüdü → kubbe de)
  hi.cyl(5.2, 5.4, 1.8, stone, 0, extH + 0.4, bz, 36);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2;
    archWindow(hi, Math.sin(a) * 5.32, extH + 0.6, bz + Math.cos(a) * 5.32, 0.5, 1.1, a, '#ffe2a8', 1.6);
  }
  const dome = hi.mesh(new THREE.SphereGeometry(5.5, 40, 20, 0, PI * 2, 0, PI / 2), lead, 0, extH + 2.2, bz);
  dome.scale.y = 0.92;
  hi.cyl(0.09, 0.13, 1.5, gold, 0, extH + 7.2, bz, 8);
  hi.mesh(new THREE.SphereGeometry(0.24, 12, 10), gold, 0, extH + 8.0, bz);
  for (const [px, pz, ry] of [[0, bz + bd / 2 - 1.4, 0], [0, bz - bd / 2 + 1.4, PI], [bw / 2 - 1.4, bz, PI / 2], [-bw / 2 + 1.4, bz, -PI / 2]]) {
    const hd = hi.mesh(new THREE.SphereGeometry(3.0, 24, 12, -PI / 2, PI, 0, PI / 2), lead, px, extH + 0.3, pz, ry);
    hd.scale.y = 0.85;
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      hi.cyl(1.1, 1.1, 0.8, stone, sx * 7.0, extH + 0.3, bz + sz * 5.2, 16);
      hi.mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, PI * 2, 0, PI / 2), lead, sx * 7.0, extH + 1.1, bz + sz * 5.2);
    }
  }
  // son cemaat yeri (revak) — sütunlar kapı (x=5) önünü açık bırakır
  const pz = FZ + 1.6;
  hi.box(bw, 0.4, 3.2, stone, 0, 4.6, pz);
  for (let i = 0; i < 6; i++) hi.mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, PI * 2, 0, PI / 2), lead, -7.5 + i * 3, 5.0, pz);
  [-8.9, -6.0, -3.1, 3.1, 6.0, 8.9].forEach((px) => {
    P.low[0].cyl(0.24, 0.28, 4.6, M('#efe8da', 0.4), px, 0, pz + 1.3, 14);
    P.base.solid(px, pz + 1.3, 0.3, 0.3);
  });
  for (let i = 0; i < 5; i++) {
    const x = -7.5 + i * 3;
    if (Math.abs(x - DOOR.x) < 2) continue;
    archWindow(P.low[0], x, 0.2, FZ + 0.03, 1.4, 3.0, 0, '#ffcf7a', 0.9);
  }
  // minareler
  const mins = [[-w / 2 + 1.4, -d / 2 + 1.4], [w / 2 - 1.4, -d / 2 + 1.4], [-w / 2 + 1.4, pz + 2.6], [w / 2 - 1.4, pz + 2.6]];
  mins.forEach(([mx, mz], n) => {
    const H = n < 2 ? 23 : 20;
    const b = P.base;
    b.box(1.5, 2.2, 1.5, stone, mx, 0, mz);
    b.cyl(0.5, 0.58, H, M('#ece5d5', 0.5), mx, 2.2, mz, 16);
    for (const sh of [H * 0.62, H * 0.86]) {
      b.cyl(0.85, 0.6, 0.35, stone, mx, 2.2 + sh, mz, 16);
      b.mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 24), glowMat('#ffd27a', 3), mx, 2.2 + sh + 0.45, mz, 0, { rx: PI / 2, cast: false });
    }
    b.mesh(new THREE.ConeGeometry(0.62, 3.2, 16), lead, mx, 2.2 + H + 1.6, mz);
    b.cyl(0.04, 0.05, 0.9, gold, mx, 2.2 + H + 3.1, mz, 6);
    b.solid(mx, mz, 0.8, 0.8);
    b.light(mx, 2.2 + H * 0.86, mz, '#ffd27a', 5, 9);
  });
  P.base.item('plantb', -4.2, pz + 2.6);
  P.base.item('plantb', 4.2, pz + 2.6);
  for (const sx of [-1, 1]) P.base.pool(sx * bw / 2, FZ + 0.5, '#ffbf5a', 7, 0.16, 0.6);
  P.base.light(DOOR.x, 4.4, FZ + 3, '#ffcf7a', 9, 16);
  return finish(P, 'camii', venue, { x: DOOR.x, z: FZ + 1.2 });
}

// =============================================================================
export function buildBankaVenue(lot) {
  DOOR.x = 5;
  const P = newParts('banka');
  const { w, d } = lot;
  const venue = gameVenue('banka');
  P.base.floor('mermer_beyaz', w, d, 0, 0);
  const extH = 6;
  shell(P, { ext: wallExt('mermer_duvar'), extH, venue, doorKey: 'door_doner' });
  const bw = ROOM.W + 2 * T;
  const bd = ROOM.D + 2 * T;
  const H = 46;
  // lobi önü: cam paneller + mermer pilastırlar (kapı x=5 açık)
  const glass = glowMat('#e7f6ff', 0.9);
  [[-8.4, -0.5], [0.5, 3.7]].forEach(([a, b]) => P.low[0].mesh(new THREE.PlaneGeometry(b - a, 2.8), glass, (a + b) / 2, 1.6, FZ + 0.02, 0, { cast: false }));
  P.low[0].mesh(new THREE.PlaneGeometry(2.4, 2.8), glass, 7.75, 1.6, FZ + 0.02, 0, { cast: false });
  P.high.mesh(new THREE.PlaneGeometry(bw - 2, 1.6), glass, 0, 4.4, FZ + 0.02, 0, { cast: false });
  [-9.1, -4.5, 0, 3.6, 6.4, 9.1].forEach((x) => P.low[0].box(0.5, extH, 0.5, M('#f2efe8', 0.35), x, 0, FZ + 0.25));
  // cam kule (lobinin üstünde) — sadece görüntü; katı kutusu kaldırılır
  tower(P.high, { w: bw - 1.2, d: bd - 1.2, h: H, x: 0, z: RZ, style: 'glass_cyan', crown: '#2bd2f5', seed: 3, base: { h: extH } });
  P.high.solids.length = 0;
  P.high.blockers.length = 0;
  // kulenin içi dolu koyu gövdesi zeminden başlıyor → lobi (oyundaki oda) onun içinde kalmasın
  P.high.group.children.filter((o) => o.isMesh && Math.abs(o.position.y - H / 2) < 0.05).forEach((o) => o.removeFromParent());
  P.high.box(bw - 1.3, H - extH, bd - 1.3, M('#121319', 0.9), 0, extH, RZ, { receive: false });
  for (let i = 0; i < 8; i++) {
    const fx = -bw / 2 + 0.8 + i * ((bw - 1.6) / 7);
    P.high.box(0.18, H - extH, 0.5, M('#2b3c4a', 0.3, 0.8), fx, extH, FZ - 0.55, { cast: false });
  }
  P.high.sign('banka', 'BANKA', 3.2, 1.2, H - 4.5, FZ - 0.3, 0, { color: '#e9fdff', glow: '#19e8ff', font: '900 130px Arial, sans-serif', li: 10, ld: 18 });
  const logo = canvasTex('bankalogo', 256, 256, (g, W) => {
    g.strokeStyle = '#19e8ff';
    g.lineWidth = 16;
    g.shadowColor = '#19e8ff';
    g.shadowBlur = 24;
    g.beginPath();
    g.arc(W / 2, W / 2, 90, 0, PI * 2);
    g.stroke();
    g.font = '900 120px Arial';
    g.fillStyle = '#e9fdff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('₺', W / 2, W / 2 + 6);
  }, { repeat: false });
  P.high.mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false, depthWrite: false }), -4.6, H - 4.5, FZ - 0.3, 0, { cast: false });
  P.high.sign('bankalobi', 'PARARA BANK', 0.75, 0, 5.4, FZ + 0.06, 0, { color: '#ffffff', glow: '#5ad8ff', font: '800 100px Arial, sans-serif', li: 5, ld: 9 });
  P.base.item('atm', -3.0, FZ + 0.35, 0, 0);
  P.base.item('atm', -6.0, FZ + 0.35, 0, 0);
  // v157.4: dış ATM'ler kullanılabilir (yaklaşınca 🏧 ATM düğmesi)
  P.base.zone({ x: -3.0, z: FZ + 1.1, r: 1.3, kind: 'atm', title: '🏧 ATM' });
  P.base.zone({ x: -6.0, z: FZ + 1.1, r: 1.3, kind: 'atm', title: '🏧 ATM' });
  P.base.item('stanchion', 3.4, FZ + 2.2, 0, 0);
  P.base.item('stanchion', 6.6, FZ + 2.2, 0, 0);
  P.base.item('planter', -w / 2 + 1.2, d / 2 - 0.8, 0);
  P.base.item('planter', w / 2 - 1.2, d / 2 - 0.8, 0);
  P.base.item('streetlamp', -w / 2 + 0.8, FZ + 2.5, 0);
  P.base.item('streetlamp', w / 2 - 0.8, FZ + 2.5, 4);
  P.base.pool(DOOR.x, FZ + 2.5, '#5ad8ff', 9, 0.16, 0.45);
  P.base.light(DOOR.x, 4, FZ + 3, '#bfefff', 8, 14);
  return finish(P, 'banka', venue, { x: DOOR.x, z: FZ + 1.2 });
}

// =============================================================================
export function buildKarakolVenue(lot) {
  DOOR.x = 5;
  const P = newParts('karakol');
  const { w, d } = lot;
  const venue = gameVenue('karakol');
  P.base.floor('asfalt', w, d, 0, 0);
  const extH = 8;
  shell(P, { ext: wallExt('beton_duvar', '#b9c3d6'), extH, venue, doorKey: 'door_market' });
  const bw = ROOM.W + 2 * T;
  const bd = ROOM.D + 2 * T;
  P.high.box(bw + 0.1, 0.5, bd + 0.1, M('#1a2a6c', 0.5), 0, LOWH, RZ);
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < 6; i++) {
      const x = -bw / 2 + 1.8 + i * 3.0;
      if (f === 0 && Math.abs(x - DOOR.x) < 2) continue;
      (f ? P.high : P.low[0]).mesh(new THREE.PlaneGeometry(1.6, 1.6), glowMat(i % 2 ? '#9cc4ff' : '#cfe2ff', 0.9), x, 1.6 + f * 3.8 + 0.4, FZ + 0.02, 0, { cast: false });
    }
  }
  P.high.box(bw + 0.4, 0.35, bd + 0.4, M('#2a3140', 0.6), 0, extH, RZ);
  const gm = glowMat('#3b6bff', 3);
  P.high.box(bw + 0.5, 0.12, 0.12, gm, 0, extH + 0.4, FZ + 0.2, { cast: false });
  P.high.box(0.12, 0.12, bd + 0.5, gm, bw / 2 + 0.2, extH + 0.4, RZ, { cast: false });
  P.high.box(0.12, 0.12, bd + 0.5, gm, -bw / 2 - 0.2, extH + 0.4, RZ, { cast: false });
  P.high.sign('polis', 'POLİS', 1.5, -2, 6.2, FZ + 0.06, 0, { color: '#ffffff', glow: '#3b6bff', font: '900 130px Arial, sans-serif', li: 9, ld: 14 });
  P.high.sign('karakol', 'NEON KARAKOLU', 0.55, -2, 4.95, FZ + 0.06, 0, { color: '#dfe8ff', glow: '#3b6bff', font: '800 100px Arial, sans-serif', light: false });
  P.low[0].box(5, 0.25, 2.2, M('#1b2232', 0.5, 0.3), DOOR.x, 3.2, FZ + 1.1);
  P.base.item('bayrak', 1.6, FZ + 2.4, 0, 0);
  P.base.item('bayrak', 8.4, FZ + 2.4, 0, 0);
  for (let i = 0; i < 4; i++) P.base.box(0.12, 0.02, 4.8, M('#e8e8e8', 0.6), -9 + i * 3, 0.14, d / 2 - 3.2, { cast: false });
  // v157.4: karakolun önünde polis arabaları (oyundaki polis aracı modeli)
  for (const x of [-7.5, -4.5]) {
    const pv = buildVehicle(14);
    pv.root.position.set(x, 0.14, d / 2 - 3.2);
    pv.root.traverse((o) => o.isMesh && (o.castShadow = true));
    P.base.add(pv.root);
    P.base.solid(x, d / 2 - 3.2, (pv.halfW || 1) + 0.1, (pv.len || 4.5) / 2);
  }
  P.base.pool(DOOR.x, FZ + 2, '#3b6bff', 10, 0.16, 0.5);
  P.base.item('streetlamp', w / 2 - 1, d / 2 - 1.5, 4);
  return finish(P, 'karakol', venue, { x: DOOR.x, z: FZ + 1.3 });
}

// =============================================================================
export function buildBelediyeVenue(lot) {
  DOOR.x = 0; // kapı ortada, revakın tam karşısında
  const P = newParts('belediye');
  const { w, d } = lot;
  const venue = gameVenue('belediye');
  P.base.floor('kaldirim', w, d, 0, 0);
  const stone = M('#ddd5c4', 0.75);
  const stone2 = M('#c9c0ad', 0.8);
  const extH = 9.5;
  shell(P, { ext: colExt(stone), extH, venue, doorKey: 'door_cift' });
  const bw = ROOM.W + 2 * T;
  const bd = ROOM.D + 2 * T;
  const bz = RZ;
  P.high.box(bw + 0.6, 0.5, bd + 0.6, stone2, 0, extH, bz);
  P.high.box(bw - 1, 0.8, bd - 1, stone, 0, extH + 0.5, bz);
  // subasman: sadece duvarların dışında (eskiden tüm tabanı kaplıyordu → içeride zemin dize geliyordu)
  P.base.box(bw + 0.4, 0.5, 0.2, stone2, 0, 0, bz - bd / 2 - 0.1);
  for (const sx of [-1, 1]) P.base.box(0.2, 0.5, bd + 0.4, stone2, sx * (bw / 2 + 0.1), 0, bz);
  for (const [a, b] of [[-bw / 2 - 0.2, DOOR.x - 1], [DOOR.x + 1, bw / 2 + 0.2]]) P.base.box(b - a, 0.5, 0.2, stone2, (a + b) / 2, 0, bz + bd / 2 + 0.1);
  for (const f of [0, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = -bw / 2 + 1.4 + i * 2.45;
      if (f === 0 && Math.abs(x - DOOR.x) < 1.9) continue;
      if (Math.abs(x) < 2.4 && f === 1) continue;
      archWindow(f ? P.high : P.low[0], x, 1.0 + f * 3.8, FZ + 0.02, 1.0, 2.2, 0, '#ffe3ae', 1.1);
    }
  }
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) archWindow(side > 0 ? P.low[1] : P.low[3], side * (bw / 2 + 0.02), 1.0, bz - bd / 2 + 1.8 + i * 2.8, 1.0, 2.2, side * PI / 2, '#ffe3ae', 1.1);
  // revak: sütunlar + alınlık (ortada; kapı sağ revak aralığında)
  const pz = FZ + 2.2;
  P.base.box(12, 0.3, 4.4, stone2, 0, 0, pz - 0.2);
  for (let i = 0; i < 6; i++) {
    const x = [-6, -4, -2, 2, 4, 6][i];
    P.low[0].cyl(0.36, 0.42, 8.1, M('#f1ece2', 0.45), x, 0.3, pz + 1.4, 18);
    P.base.solid(x, pz + 1.4, 0.42, 0.42);
  }
  P.high.box(12.4, 0.9, 4.6, stone2, 0, 8.4, pz - 0.2);
  const tri = new THREE.Shape();
  tri.moveTo(-6.4, 0);
  tri.lineTo(6.4, 0);
  tri.lineTo(0, 2.8);
  tri.closePath();
  P.high.mesh(new THREE.ExtrudeGeometry(tri, { depth: 4.6, bevelEnabled: false }), stone, 0, 9.3, pz - 2.5);
  P.high.item('belediyeamblem', 0, pz + 2.12, 0, 0, { solid: false, y: 7.2, scale: 1 });
  for (let i = 0; i < 3; i++) P.base.box(12 - i * 0.3, 0.1 * (3 - i), 0.5, stone2, 0, 0, pz + 2.25 + i * 0.5, { cast: false });
  // saat kulesi
  const cz = bz - 1;
  P.high.box(4.2, 8, 4.2, stone, 0, extH + 1.3, cz);
  P.high.box(4.8, 0.5, 4.8, stone2, 0, extH + 9.3, cz);
  const clock = canvasTex('saat', 256, 256, (g, W) => {
    g.fillStyle = '#fff4d8';
    g.beginPath();
    g.arc(W / 2, W / 2, 118, 0, PI * 2);
    g.fill();
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 8;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      g.fillStyle = '#222';
      g.fillRect(W / 2 + Math.sin(a) * 96 - 4, W / 2 - Math.cos(a) * 96 - 10, 8, 20);
    }
    g.lineCap = 'round';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(W / 2, W / 2);
    g.lineTo(W / 2 + 50, W / 2 - 30);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(W / 2, W / 2);
    g.lineTo(W / 2 - 12, W / 2 - 86);
    g.stroke();
  }, { repeat: false });
  const cm = new THREE.MeshStandardMaterial({ map: clock, emissive: '#fff1c8', emissiveMap: clock, emissiveIntensity: 0.9 });
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2;
    P.high.mesh(new THREE.CircleGeometry(1.4, 32), cm, Math.sin(a) * 2.13, extH + 6.9, cz + Math.cos(a) * 2.13, a, { cast: false });
  }
  P.high.cyl(1.6, 1.9, 1.6, stone, 0, extH + 9.8, cz, 20);
  const dm = P.high.mesh(new THREE.SphereGeometry(1.7, 24, 12, 0, PI * 2, 0, PI / 2), M('#6f7f95', 0.4, 0.5), 0, extH + 11.4, cz);
  dm.scale.y = 1.2;
  P.high.cyl(0.05, 0.05, 1.6, M('#d9a93c', 0.25, 1), 0, extH + 13.3, cz, 6);
  P.high.sign('belediye', 'NEON ŞEHİR BELEDİYESİ', 0.6, 0, 7.9, pz + 2.3, 0, { color: '#3a2f1d', bg: '#e9dfc8', font: '800 100px Georgia, serif', light: false });
  P.base.item('bayrak', -7.5, FZ + 3.2, 0, 0);
  P.base.item('bayrak', 8.6, FZ + 3.2, 0, 0);
  P.base.item('streetlamp', -w / 2 + 1, d / 2 - 1.2, 0);
  P.base.item('streetlamp', w / 2 - 1, d / 2 - 1.2, 4);
  P.base.light(0, 6, pz + 3, '#ffe3ae', 8, 16);
  return finish(P, 'belediye', venue, { x: DOOR.x, z: FZ + 1.3 });
}

function finish(P, type, venue, door) {
  // içerisi ve kırpılan parçalar birleştirilmesin (görünürlükleri değişecek)
  [P.int, ...P.low].forEach((k) => k.group.traverse((o) => (o.userData.dyn = true)));
  const rx = RX;
  RX = 0;
  return { ...P, type, venue, door: { x: door.x + rx, z: door.z }, doorX: DOOR.x, kits: [P.base, P.high, P.int, ...P.low], room: { cx: rx, cz: RZ, hw: ROOM.W / 2, hd: ROOM.D / 2 } };
}

// =============================================================================
// DİĞER MEKÂNLAR — DIŞ GÖRÜNÜŞ OYUNDAKİ BİNALARIN AYNISI (buildings.js / areas.js /
// jobBuildings.js); sadece gövde oyundaki odayı (18 × 14 m) alacak kadar büyüdü,
// içi boş ve kapı gerçek. Kapı yerleri oyundakiyle aynı tutuldu.
// =============================================================================
const BW = ROOM.W + 2 * T;
const BD = ROOM.D + 2 * T;
const FRONT = FZ; // ön yüz
// ön cepheye yapışık parça: kapı aralığına denk gelmesin
const offDoor = (x, half, pad = 0.2) => Math.abs(x - DOOR.x) > half + pad + 0.6;

// --- ARABA GALERİSİ (cam vitrinli showroom) -------------------------------------
export function buildGaleriVenue(lot) {
  DOOR.x = 0;
  const P = newParts('galeri');
  const { w, d } = lot;
  P.base.floor('beton', w, d, 0, 0);
  const extH = 6;
  shell(P, { ext: wallExt('boya_antrasit'), extH, venue: gameVenue('araba_galerisi'), doorKey: 'door_cam', vitrine: true, ceil: '#1c1f25' });
  P.high.box(BW + 0.6, 0.6, BD + 0.6, M('#1c1f25', 0.5, 0.3), 0, extH, RZ);
  P.high.box(BW + 0.62, 0.1, 0.1, glowMat('#ffffff', 2), 0, extH + 0.3, FRONT + 0.31, { cast: false });
  // yanlar ve üst cephe cam (oyundaki cam kutu)
  for (const sx of [-1, 1]) P.high.mesh(new THREE.PlaneGeometry(BD, extH), GLASS(), sx * (BW / 2 + 0.02), extH / 2, RZ, PI / 2, { cast: false });
  P.high.mesh(new THREE.PlaneGeometry(BW, extH - 2.9), GLASS(), 0, 2.9 + (extH - 2.9) / 2, FRONT + 0.03, 0, { cast: false });
  for (let i = 0; i <= 6; i++) {
    const x = -BW / 2 + i * (BW / 6);
    if (offDoor(x, 0.55)) P.low[0].box(0.14, extH, 0.14, M('#262a31', 0.4, 0.7), x, 0, FRONT + 0.08);
  }
  P.high.sign('galeri', 'ARABA GALERİSİ', 1.0, 0, extH + 0.95, FRONT + 0.36, 0, { color: '#ffffff', glow: '#ff2e5a', font: '900 110px Arial, sans-serif', li: 7, ld: 12 });
  ['car_muscle', 'car_suv', 'car_classic', 'car_sedan'].forEach((k, i) => P.base.item(k, [-7.5, -4.5, 4.5, 7.5][i], d / 2 - 3.4, 0, (i * 3 + 1) % 7));
  P.base.pool(0, FRONT + 1.5, '#ffffff', 12, 0.17, 0.32);
  return finish(P, 'galeri', gameVenue('araba_galerisi'), { x: 0, z: FRONT + 1.2 });
}

// --- SİLAH MAĞAZASI (tuğla, parmaklıklı vitrin, neon tüfek) ----------------------
export function buildSilahVenue(lot) {
  DOOR.x = 0;
  const P = newParts('silah');
  const { w, d } = lot;
  P.base.floor('beton', w, d, 0, 0);
  const extH = 7;
  shell(P, { ext: wallExt('tugla', '#7a6a66'), extH, venue: gameVenue('silah_magazasi'), doorKey: 'door_metal' });
  P.high.box(BW + 0.4, 0.4, BD + 0.4, M('#1a1a1d', 0.6), 0, extH, RZ);
  for (const sx of [-1, 1]) {
    P.low[0].mesh(new THREE.PlaneGeometry(3.6, 2.4), glowMat('#3ad6ff', 0.45), sx * 4.5, 1.9, FRONT + 0.02, 0, { cast: false });
    for (let i = 0; i < 9; i++) P.low[0].box(0.05, 2.6, 0.05, M('#1b1b1d', 0.4, 0.8), sx * 4.5 - 1.8 + i * 0.45, 0.6, FRONT + 0.12, { cast: false });
  }
  const gun = canvasTex('silahneon', 1024, 420, (g, W, H) => {
    g.strokeStyle = '#3ad6ff';
    g.lineWidth = 10;
    g.shadowColor = '#3ad6ff';
    g.lineJoin = 'round';
    for (const b of [36, 18, 6]) {
      g.shadowBlur = b;
      g.beginPath();
      g.moveTo(80, 190); g.lineTo(560, 190); g.lineTo(600, 170); g.lineTo(930, 170); g.lineTo(930, 190); g.lineTo(640, 200);
      g.lineTo(620, 240); g.lineTo(520, 240); g.lineTo(500, 330); g.lineTo(440, 330); g.lineTo(450, 240); g.lineTo(360, 240);
      g.lineTo(330, 300); g.lineTo(150, 300); g.lineTo(170, 240); g.lineTo(80, 230); g.closePath();
      g.stroke();
    }
    g.shadowBlur = 0;
    g.strokeStyle = '#ff3fa0';
    g.lineWidth = 8;
    roundRect(g, 20, 20, W - 40, H - 40, 30);
    g.stroke();
  }, { repeat: false });
  P.high.mesh(new THREE.PlaneGeometry(7.2, 2.95), new THREE.MeshBasicMaterial({ map: gun, transparent: true, toneMapped: false, depthWrite: false }), 0, 5.2, FRONT + 0.05, 0, { cast: false });
  P.low[0].sign('silahyazi', 'SİLAH MAĞAZASI', 0.75, 0, 3.0, FRONT + 0.06, 0, { color: '#ffffff', glow: '#ff3fa0', font: '900 110px Arial, sans-serif', li: 7, ld: 12 });
  P.base.light(0, 5.2, FRONT + 1.5, '#3ad6ff', 8, 14);
  P.base.item('barrel', -6.6, FRONT + 0.7, 0, 0);
  P.base.item('crate', 6.4, FRONT + 0.8, 1, 0);
  P.base.item('hedef', 7.8, FRONT + 0.3, 0, 0, { solid: false });
  P.base.pool(0, FRONT + 2, '#3ad6ff', 11, 0.16, 0.5);
  return finish(P, 'silah', gameVenue('silah_magazasi'), { x: 0, z: FRONT + 1.2 });
}

// --- CASINO / NEON GAZİNO (damask, pembe şeritler, marki, ampuller) ---------------
const gazinoVenue = () => {
  const v = gameVenue('gazino');
  return { ...v, items: v.items.map((d) => (d.i === 'gz_rug' ? { ...d, x: 0 } : d)) };
};
export function buildCasinoVenue(lot) {
  DOOR.x = 0;
  const P = newParts('casino');
  const { w, d } = lot;
  P.base.floor('mermer_siyah', w, d, 0, 0, 0.14);
  P.base.floor('hali_bordo', 3.2, d / 2 - FRONT, 0, (FRONT + d / 2) / 2, 0.16);
  const extH = 9;
  const venue = gazinoVenue();
  shell(P, { ext: wallExt('damask'), extH, venue, doorKey: 'door_cift' });
  const pink = glowMat('#ff3fa0', 2.2);
  const gold = glowMat('#ffcf5a', 2.4);
  for (let i = 0; i < 11; i++) {
    const x = -BW / 2 + 0.9 + i * ((BW - 1.8) / 10);
    if (!offDoor(x, 0.95, 0)) continue;
    (i % 2 ? P.low[0] : P.low[0]).box(0.35, 3.3, 0.2, i % 2 ? pink : M('#2a0b1c', 0.4), x, 0.3, FRONT + 0.1, { cast: false });
    P.high.box(0.35, 5.1, 0.2, i % 2 ? pink : M('#2a0b1c', 0.4), x, 3.6, FRONT + 0.1, { cast: false });
  }
  P.high.box(BW + 1, 1.2, 1.6, M('#1a0710', 0.4), 0, 8.8, FRONT + 0.6);
  for (let i = 0; i < 26; i++) P.high.mesh(new THREE.SphereGeometry(0.1, 8, 6), gold, -BW / 2 + i * (BW / 25), 8.85, FRONT + 1.45, 0, { cast: false });
  P.high.sign('casino', 'CASINO', 2.6, 0, 11.3, FRONT + 0.2, 0, { color: '#fff3c4', glow: '#ff3fa0', font: 'italic 900 140px Georgia, serif', stroke: '#ffcf5a', li: 12, ld: 18 });
  const crown = P.high.mesh(new THREE.ConeGeometry(0.9, 1.4, 5), gold, 0, 13.6, FRONT + 0.2, 0, { cast: false });
  crown.rotation.x = PI;
  // giriş saçağı (ampullü)
  P.low[0].box(7, 0.4, 3.4, M('#220914', 0.4, 0.3), 0, 3.6, FRONT + 1.7);
  for (let i = 0; i < 14; i++) P.low[0].mesh(new THREE.SphereGeometry(0.08, 8, 6), gold, -3.4 + i * (6.8 / 13), 3.55, FRONT + 3.42, 0, { cast: false });
  P.low[0].sign('neongazino', 'NEON GAZİNO', 0.6, 0, 4.25, FRONT + 3.42, 0, { color: '#ffe9a8', glow: '#ffcf5a', font: '900 100px Arial, sans-serif', light: false });
  P.base.item('stanchion', -1.8, FRONT + 2.6, 2, 0);
  P.base.item('stanchion', 1.8, FRONT + 2.6, 2, 0);
  P.base.item('palm', -5.5, FRONT + 1.6, 0, 0);
  P.base.item('palm', 5.5, FRONT + 1.6, 0, 0);
  P.base.pool(0, FRONT + 2.4, '#ff3fa0', 16, 0.16, 0.55);
  P.base.pool(0, FRONT + 3, '#ffcf5a', 8, 0.17, 0.4);
  P.base.light(-6, 6, FRONT + 2, '#ff3fa0', 9, 14);
  P.base.light(6, 6, FRONT + 2, '#ff3fa0', 9, 14);
  return finish(P, 'casino', venue, { x: 0, z: FRONT + 1.4 });
}

// --- SPOR SALONU (cam kutu, içi görünen, üstte havuz) ------------------------------
export function buildSporVenue(lot) {
  DOOR.x = 0;
  const P = newParts('spor');
  const { w, d } = lot;
  P.base.floor('beton', w, d, 0, 0);
  const extH = 8.4;
  shell(P, { ext: wallExt('beton_duvar'), extH, venue: NEW_VENUES.spor, doorKey: 'door_cam', vitrine: true });
  P.high.box(BW + 0.5, 0.6, BD + 0.5, M('#1a1d24', 0.5, 0.3), 0, extH, RZ);
  P.high.box(BW, 0.3, BD, M('#222630', 0.6), 0, 4.2, RZ);
  for (const sx of [-1, 1]) P.high.mesh(new THREE.PlaneGeometry(BD, extH), GLASS(), sx * (BW / 2 + 0.02), extH / 2, RZ, PI / 2, { cast: false });
  P.high.mesh(new THREE.PlaneGeometry(BW, extH - 2.9), GLASS(), 0, 2.9 + (extH - 2.9) / 2, FRONT + 0.03, 0, { cast: false });
  for (let i = 0; i <= 5; i++) {
    const x = -BW / 2 + i * (BW / 5);
    if (offDoor(x, 0.55)) P.low[0].box(0.16, extH, 0.16, M('#2a2e36', 0.4, 0.7), x, 0, FRONT + 0.08);
  }
  // üst kat: havuz
  P.high.box(9, 0.5, 6, M('#cfe6f2', 0.2), 4.5, 4.5, RZ - 2.5);
  P.high.mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshStandardMaterial({ color: '#1c8fd8', emissive: '#0d6bb0', emissiveIntensity: 1.3, roughness: 0.05 }), 4.5, 5.02, RZ - 2.5, 0, { rx: -PI / 2, cast: false });
  for (let i = 0; i < 3; i++) P.high.box(5, 0.06, 0.4, glowMat('#e9fbff', 2.5), -6 + i * 6, 8.0, RZ, { cast: false });
  P.base.light(4, 6.8, RZ - 2, '#5ad8ff', 6, 9);
  P.high.sign('spor', 'SPOR SALONU', 1.1, -3, 9.4, FRONT + 0.3, 0, { color: '#ffffff', glow: '#5ad8ff', font: '900 110px Arial, sans-serif', li: 7, ld: 12 });
  P.base.pool(0, FRONT + 1.5, '#9fe6ff', 14, 0.17, 0.4);
  return finish(P, 'spor', NEW_VENUES.spor, { x: 0, z: FRONT + 1.2 });
}

// --- FABRİKA (tuğla, testere çatı, kırmızı-beyaz bacalar) -----------------------------
export function buildFabrikaVenue(lot) {
  DOOR.x = -3; // oyundaki metal kapı yeri
  const P = newParts('fabrika');
  const { w, d } = lot;
  P.base.floor('asfalt', w, d, 0, 0);
  const extH = 7;
  shell(P, { ext: wallExt('tugla'), extH, venue: NEW_VENUES.fabrika, doorKey: 'door_metal', ceil: '#3a3d42' });
  const tri = new THREE.Shape();
  tri.moveTo(0, 0);
  tri.lineTo(BD / 4, 0);
  tri.lineTo(0, 2.2);
  tri.closePath();
  for (let i = 0; i < 4; i++) {
    const m = P.high.mesh(new THREE.ExtrudeGeometry(tri, { depth: BW, bevelEnabled: false }), M('#3a3f48', 0.6, 0.4), 0, extH, 0);
    m.rotation.y = -PI / 2;
    m.position.set(BW / 2, extH, RZ - BD / 2 + i * (BD / 4));
    P.high.mesh(new THREE.PlaneGeometry(BW - 0.4, 2), glowMat('#ffb15a', 0.9), 0, extH + 1.0, RZ - BD / 2 + i * (BD / 4) + 0.02, 0, { cast: false });
  }
  for (let i = 0; i < 5; i++) P.high.mesh(new THREE.PlaneGeometry(2.4, 1.6), glowMat('#ff9f45', 1.1), -7 + i * 3.5, 4.6, FRONT + 0.02, 0, { cast: false });
  // bacalar (çatıdan yükselir, toplam yükseklik oyundakiyle aynı)
  for (const [cx, cz] of [[-5, RZ - 3], [-1.5, RZ - 4.5]]) {
    for (let s = 2; s < 6; s++) P.high.cyl(0.8 - s * 0.04, 0.84 - s * 0.04, 3.4, M(s % 2 ? '#e9e6df' : '#b3261e', 0.7), cx, s * 3.4, cz, 18);
    P.high.cyl(0.9, 0.9, 0.4, M('#222', 0.8), cx, 20.4, cz, 18);
    P.base.light(cx, 20.6, cz, '#ff3a2a', 2, 5);
  }
  P.high.sign('fabrika', 'FABRİKA', 1.2, 0, 6.2, FRONT + 0.06, 0, { color: '#ffe2c4', glow: '#ff7a2a', font: '900 120px Arial, sans-serif', li: 7, ld: 12 });
  P.low[0].item('garagedoor', 5, FRONT - 0.15, 0, 0, { solid: false });
  P.base.item('pallets', -7.5, FRONT + 1.4, 0, 0);
  P.base.item('barrel', -8.6, FRONT + 2.6, 0, 0);
  P.base.item('barrel', -8.0, FRONT + 3.0, 0, 0);
  P.base.item('crate', 8.2, d / 2 - 2.4, 1, 0);
  P.base.item('forklift', 2, d / 2 - 2.6, 2, 0);
  P.base.item('portlight', w / 2 - 1, FRONT + 1, 6, 0);
  P.base.pool(0, FRONT + 2, '#ff9f45', 12, 0.16, 0.4);
  return finish(P, 'fabrika', NEW_VENUES.fabrika, { x: -3, z: FRONT + 1.2 });
}

// --- İNTERNET KAFE (mor duvar, cam köşe, neon çerçeveler) ----------------------------
function neonFrame(kit, w, h, x, y, z, color, ry = 0) {
  const gm = glowMat(color, 2.6);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx, ly) => [x + lx * c, y + ly, z - lx * s];
  kit.box(w, 0.12, 0.12, gm, ...at(0, h / 2), { cast: false, ry });
  kit.box(w, 0.12, 0.12, gm, ...at(0, -h / 2), { cast: false, ry });
  kit.box(0.12, h, 0.12, gm, ...at(-w / 2, -h / 2), { cast: false, ry });
  kit.box(0.12, h, 0.12, gm, ...at(w / 2, -h / 2), { cast: false, ry });
}
export function buildNetKafeVenue(lot) {
  DOOR.x = 3.5;
  const P = newParts('netkafe');
  const { w, d } = lot;
  P.base.floor('kaldirim', w, d, 0, 0);
  const extH = 7;
  shell(P, { ext: wallExt('boya_mor'), extH, venue: NEW_VENUES.netkafe, doorKey: 'door_cam', vitrine: true, ceil: '#14161c' });
  P.high.box(BW + 0.4, 0.5, BD + 0.4, M('#181226', 0.5), 0, extH, RZ);
  P.high.mesh(new THREE.PlaneGeometry(BW, extH - 2.9), GLASS(), 0, 2.9 + (extH - 2.9) / 2, FRONT + 0.03, 0, { cast: false });
  P.high.mesh(new THREE.PlaneGeometry(BD, extH), GLASS(), BW / 2 + 0.03, extH / 2, RZ, PI / 2, { cast: false });
  neonFrame(P.high, BW + 0.4, 7.4, 0, 3.6, FRONT + 0.05, '#ff3fd1');
  neonFrame(P.high, BD + 0.4, 7.4, BW / 2 + 0.05, 3.6, RZ, '#7a5bff', PI / 2);
  P.high.sign('netcafe1', 'NET CAFE', 1.6, -3.5, 8.6, FRONT + 0.25, 0, { color: '#fff6d0', glow: '#ff7a2a', font: '900 120px Arial, sans-serif', li: 8, ld: 12 });
  P.high.sign('netcafe2', 'NET CAFE', 1.2, BW / 2 + 0.25, 8.4, RZ - 1, PI / 2, { color: '#e9f6ff', glow: '#3ad6ff', font: '900 120px Arial, sans-serif', li: 6, ld: 10 });
  P.high.sign('internetkafe', 'İNTERNET KAFE', 0.55, 3.5, 6.2, FRONT + 0.06, 0, { color: '#ffd6f4', glow: '#ff3fd1', font: '800 100px Arial, sans-serif', light: false });
  P.base.pool(0, FRONT + 1.5, '#ff3fd1', 13, 0.17, 0.5);
  return finish(P, 'netkafe', NEW_VENUES.netkafe, { x: 3.5, z: FRONT + 1.2 });
}

// --- BAR (tuğla, ahşap ön yüz, tente, teras + ip ışıklar) ----------------------------
function stringLights(kit, pts, color) {
  const gm = basicGlow(color);
  const pole = M('#1c1c1e', 0.5, 0.6);
  pts.forEach(([x, y, z]) => kit.cyl(0.05, 0.05, y, pole, x, 0, z, 6));
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i];
    const [bx, by, bz] = pts[i + 1];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const sag = Math.sin(t * PI) * 0.45;
      kit.mesh(new THREE.SphereGeometry(0.06, 6, 5), gm, ax + (bx - ax) * t, ay + (by - ay) * t - sag, az + (bz - az) * t, 0, { cast: false });
    }
  }
}
export function buildBarVenue(lot) {
  DOOR.x = 0;
  const P = newParts('bar');
  const { w, d } = lot;
  P.base.floor('kaldirim', w, d, 0, 0);
  P.base.floor('parke_ceviz', w - 4, d / 2 - FRONT - 0.5, 0, (FRONT + d / 2) / 2, 0.16);
  const extH = 8;
  shell(P, { ext: wallExt('tugla'), extH, venue: NEW_VENUES.bar, doorKey: 'door_salon' });
  P.high.box(BW + 0.5, 0.5, BD + 0.5, M('#2a1a12', 0.7), 0, extH, RZ);
  // ahşap ön yüz (kapı hariç)
  for (const [a, b] of [[-BW / 2, DOOR.x - 0.75], [DOOR.x + 0.75, BW / 2]]) P.low[0].wallBox('ahsap_panel', b - a, 3.4, 0.2, (a + b) / 2, 0, FRONT + 0.1);
  P.low[0].wallBox('ahsap_panel', 1.5, 1.0, 0.2, DOOR.x, 2.4, FRONT + 0.1);
  for (let i = 0; i < 4; i++) {
    const x = -6.6 + i * 4.4;
    if (offDoor(x, 1.3, 0)) P.low[0].mesh(new THREE.PlaneGeometry(2.6, 2.2), glowMat('#ffab4a', 1.3), x, 1.6, FRONT + 0.22, 0, { cast: false });
    P.high.mesh(new THREE.PlaneGeometry(2.2, 1.8), glowMat('#ffc06a', 1.0), x, 5.4, FRONT + 0.02, 0, { cast: false });
  }
  P.low[0].box(BW, 0.2, 2.2, M('#3a1610', 0.7), 0, 3.6, FRONT + 1.1);
  P.high.sign('bar', 'BAR', 1.8, 0, 6.9, FRONT + 0.12, 0, { color: '#fff1d0', glow: '#ff9a2a', font: '900 140px Georgia, serif', li: 8, ld: 14 });
  // v157: ön teras — şemsiye yok; fıçı masalar + bar tabureleri
  for (const [x, z] of [[-6, d / 2 - 4.5], [-2.8, d / 2 - 2.2], [3, d / 2 - 4.2], [6.4, d / 2 - 2]]) {
    P.base.item('barreltable', x, z, 0, 0);
    P.base.item('stool', x - 0.85, z, 0, 0);
    P.base.item('stool', x + 0.85, z, 0, 0);
  }
  stringLights(P.base, [[-BW / 2, 3.4, FRONT + 2.2], [-BW / 2, 3.0, d / 2 - 0.5], [BW / 2, 3.0, d / 2 - 0.5], [BW / 2, 3.4, FRONT + 2.2]], '#ffcf7a');
  P.base.pool(0, d / 2 - 3, '#ffab4a', 14, 0.15, 0.45);
  P.base.light(0, 3, d / 2 - 3, '#ffbf6a', 8, 12);
  return finish(P, 'bar', NEW_VENUES.bar, { x: 0, z: FRONT + 1.2 });
}

// --- CAFE (beyaz tuğla, ahşap ön yüz, yeşil tente, teras) ------------------------------
export function buildCafeVenue(lot) {
  DOOR.x = 0;
  const P = newParts('cafe');
  const { w, d } = lot;
  P.base.floor('kaldirim', w, d, 0, 0);
  P.base.floor('parke_mese', w - 3, d / 2 - FRONT - 0.5, 0, (FRONT + d / 2) / 2, 0.16);
  const extH = 7.5;
  shell(P, { ext: wallExt('tugla_beyaz'), extH, venue: NEW_VENUES.cafe, doorKey: 'door_cam', vitrine: true });
  P.high.box(BW + 0.4, 0.4, BD + 0.4, M('#23262c', 0.6), 0, extH, RZ);
  // ahşap ön yüz çerçevesi (camların etrafı)
  P.low[0].wallBox('ahsap_panel', BW, 0.7, 0.3, 0, 2.9, FRONT + 0.1);
  for (const x of [-BW / 2 + 0.3, BW / 2 - 0.3]) P.low[0].wallBox('ahsap_panel', 0.6, 2.9, 0.3, x, 0, FRONT + 0.1);
  for (let i = 0; i < 4; i++) P.high.mesh(new THREE.PlaneGeometry(2.4, 2.0), glowMat('#ffe3b8', 1.0), -6 + i * 4, 5.4, FRONT + 0.02, 0, { cast: false });
  P.low[0].box(BW, 0.2, 2.0, M('#2f4a3a', 0.7), 0, 3.7, FRONT + 1.0);
  P.high.sign('cafe', 'CAFE', 1.4, 0, 6.4, FRONT + 0.06, 0, { color: '#ffffff', glow: '#ffd59a', font: '900 130px Georgia, serif', li: 7, ld: 12 });
  for (const [x, z] of [[-5.5, d / 2 - 2.8], [-2.2, d / 2 - 5.2], [2.4, d / 2 - 2.6], [5.8, d / 2 - 5]]) {
    P.base.item('cafetable', x, z, 0, 2); // v157: şemsiyesiz kafe masaları
  }
  P.base.item('plantb', -BW / 2 + 0.6, FRONT + 0.8);
  P.base.item('plantb', BW / 2 - 0.6, FRONT + 0.8);
  P.base.item('menuboard', 3.2, FRONT + 0.6, 0, 0);
  P.base.pool(0, d / 2 - 3.5, '#ffd59a', 14, 0.15, 0.45);
  P.base.light(0, 3, d / 2 - 3.5, '#ffe3b8', 8, 12);
  return finish(P, 'cafe', NEW_VENUES.cafe, { x: 0, z: FRONT + 1.3 });
}

// --- EV (krem duvar, beşik çatı, baca) + yanında garaj + tam çevre çit ---------------------
export function buildEvVenue(lot) {
  const { w, d } = lot;
  RX = -w / 2 + BW / 2 + 0.6; // ev sola yaslı, sağında garaj
  DOOR.x = 5; // kapı garaj tarafında (taş yol ikisine birden çıkar)
  const P = newParts('ev');
  P.base.floor('cim', w, d, 0, 0);
  const extH = 6;
  shell(P, { ext: wallExt('boya_krem'), extH, venue: NEW_VENUES.ev, doorKey: 'door_ahsap', ceil: '#f4f1ea' });
  // beşik çatı (sırt önden arkaya)
  const roof = new THREE.Shape();
  roof.moveTo(-BW / 2 - 0.5, 0);
  roof.lineTo(BW / 2 + 0.5, 0);
  roof.lineTo(0, 3.6);
  roof.closePath();
  const rf = P.high.mesh(new THREE.ExtrudeGeometry(roof, { depth: BD + 1, bevelEnabled: false }), M('#3b2a26', 0.8), 0, extH, RZ - BD / 2 - 0.5);
  rf.castShadow = true;
  P.high.box(0.9, 2.6, 0.9, M('#5a4a44', 0.8), 4, extH + 1.5, RZ - 2);
  // pencereler (iki kat) + denizlikler
  for (const f of [0, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = -6.9 + i * 4.6;
      if (f === 0 && !offDoor(x, 0.8, 0)) continue;
      const k = f ? P.high : P.low[0];
      k.mesh(new THREE.PlaneGeometry(1.5, 1.5), glowMat('#ffcf8a', 1.2), x, 1.9 + f * 2.8, FRONT + 0.02, 0, { cast: false });
      k.box(1.8, 0.12, 0.3, M('#e8e1d4', 0.6), x, 1.05 + f * 2.8, FRONT + 0.15, { cast: false });
    }
  }
  P.low[0].box(2.6, 0.2, 1.4, M('#3b2a26', 0.8), DOOR.x, 2.7, FRONT + 0.7);
  P.base.light(RX + DOOR.x, 2.5, FRONT + 1.2, '#ffcf8a', 5, 8);
  // GARAJ (araba ve yaya girer): üç duvar + çatı, önü açık, kepenk yukarıda
  const gx0 = RX + BW / 2 + 0.6;
  const gx1 = w / 2 - 0.7;
  const gw = gx1 - gx0;
  const gcx = (gx0 + gx1) / 2;
  const gd = 8;
  const gz1 = FRONT;
  const gz0 = gz1 - gd;
  const gcz = (gz0 + gz1) / 2;
  const gH = 3.2;
  const krem = (k, ww, hh, dd, x, y, z) => k.wallBox('boya_krem', ww, hh, dd, x, y, z);
  // v157.1: garajın duvar + çatısı ayrı grupta — içerideyken gizlenir (kendini görebilesin);
  // yerde alçak duvar dipleri kalır (evdeki kesit gibi)
  const GK = new Kit('ev_garaj');
  P.root.add(GK.group);
  krem(GK, gw, gH, 0.25, gcx, 0, gz0 + 0.125);
  krem(GK, 0.25, gH, gd, gx0 + 0.125, 0, gcz);
  krem(GK, 0.25, gH, gd, gx1 - 0.125, 0, gcz);
  krem(GK, 0.55, gH, 0.25, gx0 + 0.275, 0, gz1 - 0.125);
  krem(GK, 0.55, gH, 0.25, gx1 - 0.275, 0, gz1 - 0.125);
  krem(GK, gw, 0.6, 0.25, gcx, gH - 0.6, gz1 - 0.125);
  GK.box(gw + 0.4, 0.25, gd + 0.4, M('#3b2a26', 0.8), gcx, gH, gcz);
  GK.group.traverse((o) => (o.userData.dyn = true)); // şehir birleştirmesine girmez (mergeVenue kendi içinde birleştirir)
  const stub = 0.45;
  krem(P.base, gw - 0.04, stub, 0.2, gcx, 0, gz0 + 0.125);
  krem(P.base, 0.2, stub, gd - 0.04, gx0 + 0.125, 0, gcz);
  krem(P.base, 0.2, stub, gd - 0.04, gx1 - 0.125, 0, gcz);
  P.base.floor('epoksi', gw - 0.5, gd - 0.3, gcx, gcz, 0.17);
  // otomatik kepenk: yaklaşınca (yaya / araç) açılır, uzaklaşınca kapanır (main.js)
  const gdoor = P.base.item('garagedoor', gcx, gz1 + 0.05, 0, 0, { solid: false, y: 0, scale: 1.0, dyn: true });
  gdoor.scale.set((gw - 1.1) / 2.8, (gH - 0.6) / 2.55, 1); // açıklığı tam kapatsın
  gdoor.traverse((o) => o.userData.doorVoid && (o.visible = false)); // açılınca garajın içi görünsün
  P.garage = { obj: gdoor, hw: (gw - 1.1) / 2, open: 0, shell: GK.group, gw, gd };
  P.base.item('car_classic', gcx, gcz - 0.4, 0, 6);
  P.base.item('tires', gx1 - 0.9, gz0 + 0.9, 0, 0);
  P.base.item('toolwall', gcx, gz0 + 0.26, 0, 0, { solid: false });
  P.base.light(gcx, 2.8, gcz, '#fff1d6', 4, 8);
  // çarpışma: garaj duvarları (ön ağız açık)
  P.base.solid(gcx, gz0 + 0.125, gw / 2, 0.15);
  P.base.solid(gx0 + 0.125, gcz, 0.15, gd / 2);
  P.base.solid(gx1 - 0.125, gcz, 0.15, gd / 2);
  P.base.solid(gx0 + 0.275, gz1 - 0.125, 0.3, 0.15);
  P.base.solid(gx1 - 0.275, gz1 - 0.125, 0.3, 0.15);
  const E = w / 2 - 0.3;
  // ön çit, parseldeki seyyar satıcının (z ≈ 8,5) gerisinde: satıcı sokakta kalır
  const Z = 7.4;
  const ZB = d / 2 - 0.3;
  // taş yol: evin kapısından ve garajdan sokağa (tek çıkış)
  const px0 = RX + DOOR.x - 1.0;
  const px1 = gx1;
  P.base.floor('kaldirim', px1 - px0, Z - FRONT + 0.4, (px0 + px1) / 2, (FRONT + Z + 0.4) / 2, 0.15);
  P.base.floor('kaldirim', w, d / 2 - Z, 0, (Z + d / 2) / 2, 0.15);
  // ÇİT: parselin dört yanı, sadece taş yolun çıktığı yer açık
  for (let x = -E + 1; x <= E - 0.9; x += 2) {
    if (x + 1 > px0 - 0.1 && x - 1 < px1 + 0.1) continue; // taş yol ağzı
    P.base.item('fence', x, Z, 0, 0);
  }
  for (let x = -E + 1; x <= E - 0.9; x += 2) P.base.item('fence', x, -ZB, 0, 0);
  for (let z = -ZB + 1; z <= Z - 0.9; z += 2) {
    P.base.item('fence', -E, z, 2, 0);
    if (z < gz0 - 0.4 || z > gz1 + 1) P.base.item('fence', E, z, 2, 0);
  }
  // bahçe: ağaç + mangal
  P.base.item('tree', -E + 2.0, Z - 2.0, 0, 0);
  P.base.item('mangal', -E + 5.2, Z - 2.2, 0, 0);
  return finish(P, 'ev', NEW_VENUES.ev, { x: DOOR.x, z: FRONT + 1.2 });
}

// --- LİMAN & DEPO (beton blok depo, kepenkler, konteyner istifleri) ---------------------
export function buildLimanVenue(lot) {
  const { w, d } = lot;
  RX = -w / 2 + BW / 2 + 2;
  DOOR.x = 0;
  const P = newParts('liman');
  P.base.floor('beton', w, d, 0, 0);
  const extH = 8;
  shell(P, { ext: wallExt('beton_blok', '#9aa5b1'), extH, venue: NEW_VENUES.liman, doorKey: 'door_metal', ceil: '#3a3d42' });
  P.high.box(BW + 0.6, 0.6, BD + 0.6, M('#3a4048', 0.6, 0.4), 0, extH, RZ);
  for (const x of [-6.5, 6.5]) P.low[0].item('garagedoor', x, FRONT - 0.15, 0, 0, { solid: false });
  P.high.sign('depo', 'LİMAN & DEPO', 1.3, 0, 6.6, FRONT + 0.06, 0, { color: '#ffffff', glow: '#ffb15a', font: '900 110px Arial, sans-serif', li: 8, ld: 14 });
  P.base.item('portlight', RX + BW / 2 + 1, FRONT + 1, 6, 0);
  const cx0 = w / 2 - 14;
  let n = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const h = 1 + ((row * 3 + col) % 3);
      for (let k = 0; k < h; k++) P.base.item('container', cx0 + col * 4.6, -d / 2 + 3 + row * 2.4, 0, n++ % 6, { y: k * 1.77, solid: k === 0 });
    }
  }
  P.base.item('forklift', cx0 - 4, 2, 2, 0);
  P.base.item('truck', 6, d / 2 - 4, 2, 1);
  P.base.item('pallets', RX + 8, FRONT + 2.2, 0, 0);
  P.base.item('crates', RX - 8, FRONT + 2.2, 0, 0);
  P.base.pool(RX, FRONT + 2, '#ffb15a', 12, 0.16, 0.45);
  return finish(P, 'liman', NEW_VENUES.liman, { x: 0, z: FRONT + 1.4 });
}

// --- HASTANE (beyaz, pencere bantları, kırmızı haç, acil saçağı, ambulans alanı) -------------
export function buildHastaneVenue(lot) {
  DOOR.x = 0;
  const P = newParts('hastane');
  const { w, d } = lot;
  P.base.floor('beton', w, d, 0, 0);
  const extH = 13;
  shell(P, { ext: wallExt('beton_duvar', '#eef2f6'), extH, venue: NEW_VENUES.hastane, doorKey: 'door_cam', vitrine: true });
  P.high.box(BW + 0.4, 0.4, BD + 0.4, M('#c9d3de', 0.6), 0, extH, RZ);
  for (let f = 1; f < 3; f++) P.high.box(BW - 1.5, 1.3, 0.05, glowMat('#dff2ff', 0.8), 0, 2 + f * 3.6, FRONT + 0.03, { cast: false });
  for (const sx of [-1, 1]) for (let f = 0; f < 3; f++) P.high.box(0.05, 1.3, BD - 1.5, glowMat('#dff2ff', 0.7), sx * (BW / 2 + 0.03), 5.6 + f * 2.4, RZ, { cast: false });
  const red = glowMat('#ff2a3a', 2.6);
  P.high.box(0.9, 3.2, 0.2, red, BW / 2 - 2.6, 9.4, FRONT + 0.1, { cast: false });
  P.high.box(3.2, 0.9, 0.2, red, BW / 2 - 2.6, 9.4 + 1.15, FRONT + 0.1, { cast: false });
  P.high.sign('hastane', 'HASTANE', 1.4, -3, 10.6, FRONT + 0.06, 0, { color: '#ffffff', glow: '#ff2a3a', font: '900 120px Arial, sans-serif', li: 8, ld: 14 });
  // acil girişi saçağı
  P.low[0].box(8, 0.3, 4.0, M('#d9e1ea', 0.5, 0.2), 0, 3.6, FRONT + 2.0);
  for (const x of [-3.7, 3.7]) {
    P.low[0].box(0.3, 3.6, 0.3, M('#c0c8d2', 0.5), x, 0, FRONT + 3.8);
    P.base.solid(x, FRONT + 3.8, 0.2, 0.2);
  }
  P.low[0].sign('acil', 'ACİL', 0.8, 0, 4.25, FRONT + 4.02, 0, { color: '#ffffff', glow: '#ff2a3a', bg: '#c8141e', font: '900 110px Arial, sans-serif', li: 6, ld: 10 });
  J.paintBay(P.base, 0, d / 2 - 4, 8, 6, '#ff2a3a', 'AMBULANS');
  P.base.pool(0, FRONT + 3, '#ff2a3a', 12, 0.16, 0.4);
  return finish(P, 'hastane', NEW_VENUES.hastane, { x: 0, z: FRONT + 1.2 });
}

// --- BENZİNLİK (arka: market · önde kanopi + pompalar, oyundaki benzinlik mobilyaları) -------
// v157.4: road → yol üstü Neon Petrol'ün marketi (kanopi / pompalar istasyonun kendisinde)
export function buildBenzinlikVenue(lot, { road = false } = {}) {
  DOOR.x = 0;
  const P = newParts('benzinlik');
  const { w, d } = lot;
  P.base.floor('beton', w, d, 0, 0);
  const extH = 6;
  shell(P, { ext: wallExt('beton_duvar', '#f2f2ee'), extH, venue: NEW_VENUES.market, doorKey: 'door_market', vitrine: true });
  P.high.box(BW + 0.3, 0.3, BD + 0.3, M('#d9d9d4', 0.6), 0, extH, RZ);
  P.high.sign('benzinmarket', 'MARKET 7/24', 0.7, 0, 3.95, FRONT + 0.06, 0, { color: '#ffffff', glow: '#3ad07a', font: '900 100px Arial, sans-serif', li: 5, ld: 9 });
  P.high.sign('benzinlik', 'NEON PETROL', 0.9, 0, 5.2, FRONT + 0.06, 0, { color: '#3ad07a', glow: '#3ad07a', font: '900 100px Arial, sans-serif', li: 5, ld: 9 });
  if (road) return finish(P, 'benzinlik', NEW_VENUES.market, { x: 0, z: FRONT + 1.2 });
  // v157.4: kanopi 1,2 m öne alındı — ayakları kapının hemen önündeydi, yayalar girişte takılıyordu
  const cz = FRONT + 6.6;
  for (const x of [-4.4, 4.4]) {
    P.base.item('canopy', x, cz, 0, 0, { scale: 1.55 });
    P.base.item('pump', x - 1.6, cz, 2, 0);
    P.base.item('pump', x + 1.6, cz, 2, 0);
  }
  P.base.light(0, 4.6, cz, '#f2fff6', 9, 16);
  P.base.item('pricesign', w / 2 - 1.6, d / 2 - 1.6, 0, 0, { scale: 1.6 });
  P.base.item('airpump', -w / 2 + 1.4, FRONT + 1.4, 2, 0);
  P.base.item('cone', -w / 2 + 1.5, d / 2 - 2, 0, 0);
  P.base.item('cone', -w / 2 + 1.5, d / 2 - 4, 0, 0);
  P.base.pool(0, cz, '#3ad07a', 16, 0.16, 0.3);
  return finish(P, 'benzinlik', NEW_VENUES.market, { x: 0, z: FRONT + 1.2 });
}

// --- OTOGAR (şehirlerarası otobüs terminali) -------------------------------------------
// Geniş lot (w > 50, Neon Şehir): bina bir uçta, peronlar yanda (burun perona, arka yola).
// Derin lot (Kervankent): bina ortada, peron cephenin hemen önünde, otobüs yerleri caddeye uzanır.
export function buildOtogarVenue(lot, { kk = false } = {}) {
  const { w, d } = lot;
  const side = w > 50;
  RX = side ? -w / 2 + BW / 2 + 1.5 : 0;
  DOOR.x = 0;
  const P = newParts(kk ? 'otogar_kk' : 'otogar');
  P.base.floor('beton', w, d, 0, 0);
  const name = kk ? 'Kervankent Otogarı' : 'Neon Şehir Otogarı';
  const extH = 8.2;
  const venue = { ...NEW_VENUES.otogar, name };
  shell(P, { ext: wallExt('beton_duvar', '#eef1f4'), extH, venue, doorKey: 'door_cift', vitrine: true, ceil: '#e9ecef' });
  // cephe: lacivert kuşak, cam bant, yuvarlak saat, neon yazı
  P.high.box(BW + 0.6, 0.45, BD + 0.6, M('#1d2a44', 0.5, 0.3), 0, extH, RZ);
  P.high.box(BW - 1.2, 2.6, 0.05, glowMat('#dff2ff', 0.75), 0, 4.4, FRONT + 0.03, { cast: false });
  for (let x = -BW / 2 + 1.2; x <= BW / 2 - 1.2; x += 2.2) P.high.box(0.08, 2.6, 0.08, M('#2a2f3a', 0.4, 0.6), x, 4.4, FRONT + 0.06);
  P.high.box(BW + 0.6, 0.18, 0.2, glowMat('#4fd2ff', 1.8), 0, 7.2, FRONT + 0.12, { cast: false });
  P.high.sign(`${P.root.name}_ad`, name.toLocaleUpperCase('tr-TR'), 0.95, 0, 7.75, FRONT + 0.12, 0, { color: '#ffffff', glow: '#4fd2ff', font: '900 110px Arial, sans-serif', li: 7, ld: 14 });
  P.high.cyl(0.75, 0.75, 0.12, M('#f4f4f2', 0.4), BW / 2 - 1.6, 5.1, FRONT + 0.1, 24, { rx: PI / 2 });
  P.high.box(0.05, 0.5, 0.03, M('#111', 0.5), BW / 2 - 1.6, 5.4, FRONT + 0.2, { cast: false });
  P.high.box(0.36, 0.05, 0.03, M('#111', 0.5), BW / 2 - 1.45, 5.4, FRONT + 0.2, { cast: false });
  // giriş saçağı
  P.low[0].box(7, 0.25, 2.6, M('#e9edf2', 0.5, 0.2), 0, 3.5, FRONT + 1.3);
  // peronlar + otobüs yerleri
  // iç: arka duvarda firma tabelaları + kalkış panosu (arka duvar katmanında: kesitte duvarla gizlenir)
  [['KERVAN SEYAHAT', -6.2, '#1d2a44'], ['ANADOLU EKSPRES', -1.6, '#2f8f4a'], ['HAREKET MEMURU', 3.0, '#c8141e']].forEach(([t, x, bg], i) => {
    const sg = P.int.sign(`${P.root.name}_firma${i}`, t, 0.36, x, 2.55, -ROOM.D / 2 + 0.05, 0, { color: '#ffffff', bg, font: '900 90px Arial, sans-serif', light: false });
    P.lowInner[2].add(sg);
  });
  const board = P.int.sign(`${P.root.name}_kalkis`, kk ? 'KALKIŞ · NEON ŞEHİR · PERON 3' : 'KALKIŞ · KERVANKENT · PERON 5', 0.42, -0.3, 3.15, -ROOM.D / 2 + 0.05, 0, { color: '#ffcf3a', bg: '#0b0d12', font: '900 90px "Courier New", monospace', light: false });
  P.lowInner[2].add(board);
  const coach = (i) => makeCoach(1 + (i % 2), `${kk ? '43' : '34'} K ${210 + i * 7}`);
  let yard;
  if (side) {
    const x0 = RX + BW / 2 + 2.5;
    yard = J.otogarYard(P.base, { x0, x1: w / 2 - 1, zP: -d / 2 + 6.6, name: P.root.name, parked: [1, 3, 6], makeBus: coach, roadZ: d / 2 });
    // binadan perona yaya yolu
    P.base.box(x0 - (RX + BW / 2) + 0.6, 0.05, 3.4, M('#c9c4ba', 0.75), (x0 + RX + BW / 2) / 2, 0.12, -d / 2 + 6.6 - 1.7, { cast: false });
  } else {
    yard = J.otogarYard(P.base, { x0: -w / 2 + 1, x1: w / 2 - 1, zP: FRONT + 3.6, name: P.root.name, parked: [0, 3, 5], makeBus: coach, roadZ: d / 2, clearX: DOOR.x });
    // arka bahçe: çim + ağaçlar + banklar
    P.base.floor('cim', w, d / 2 + RZ - 7.6, 0, (-d / 2 + RZ - 7.6) / 2, 0.15);
    for (const [x, z] of [[-12, -22], [-4, -27], [5, -21], [13, -28], [-13, -32], [9, -33]]) P.base.item('tree', x, z, 0, 0, { y: 0.15 });
    for (const x of [-7, 7]) P.base.item('parkbench', x, -16, 4, 0, { y: 0.15 });
  }
  // totem (yol kenarında)
  const tx = w / 2 - 2;
  const tz = d / 2 - 1.5;
  P.base.box(0.5, 7, 0.5, M('#2a2f3a', 0.5, 0.5), tx, 0, tz);
  // çift yüzlü tabela (arkadan ters yazı görünmesin)
  P.base.sign(`${P.root.name}_totem`, 'OTOGAR', 1.3, tx, 7.6, tz + 0.3, 0, { color: '#ffffff', bg: '#c8141e', glow: '#ff3a4a', font: '900 120px Arial, sans-serif', li: 5, ld: 10 });
  P.base.sign(`${P.root.name}_totem_b`, 'OTOGAR', 1.3, tx, 7.6, tz - 0.3, PI, { color: '#ffffff', bg: '#c8141e', font: '900 120px Arial, sans-serif', light: false });
  P.base.solid(tx, tz, 0.35, 0.35);
  P.base.light(RX, 4, FRONT + 4, '#e8f6ff', 9, 18);
  const out = finish(P, kk ? 'otogar_kk' : 'otogar', venue, { x: 0, z: FRONT + 1.3 });
  out.bays = yard.bays;
  return out;
}

// --- v157 TAKSİ DURAĞI (girilir: bekleme salonu + durakçı; önde sıra bekleyen taksiler) ------
export function buildTaksiVenue(lot) {
  DOOR.x = 0;
  const P = newParts('taksi_duragi');
  const { w, d } = lot;
  P.base.floor('beton', w, d, 0, 0);
  const Y = '#f6c400';
  const ym = M(Y, 0.55);
  const extH = 4.4;
  shell(P, { ext: wallExt('beton_duvar', '#f4f1e6'), extH, venue: NEW_VENUES.taksi, doorKey: 'door_cam', vitrine: true, ceil: '#e9e6dc' });
  P.high.box(BW + 1.2, 0.35, BD + 1.2, M('#1d1f24', 0.5, 0.3), 0, extH, RZ);
  P.high.box(BW + 1.22, 0.12, 0.08, glowMat(Y, 2.4), 0, extH + 0.02, FRONT + 0.62, { cast: false });
  // dama şeridi (ön cephe, camların üstü)
  for (let i = 0; i < 38; i++) P.high.box(0.5, 0.25, 0.05, M(i % 2 ? '#111111' : Y, 0.5), -BW / 2 + 0.25 + i * 0.5, 3.75, FRONT + 0.04, { cast: false });
  P.high.sign('taksidurak', 'TAKSİ DURAĞI', 0.85, 0, extH + 0.75, FRONT + 0.55, 0, { color: '#111111', bg: Y, glow: Y, font: '900 110px Arial, sans-serif', li: 6, ld: 12 });
  // totem (köşede, yoldan görünsün)
  P.base.box(0.35, 5.2, 0.35, M('#2a2f3a', 0.5, 0.5), w / 2 - 2, 0, d / 2 - 2);
  P.base.sign('taksitotem', 'TAKSİ', 1.1, w / 2 - 2, 5.6, d / 2 - 1.8, 0, { color: '#111111', bg: Y, glow: Y, font: '900 120px Arial, sans-serif', li: 5, ld: 10 });
  P.base.solid(w / 2 - 2, d / 2 - 2, 0.3, 0.3);
  P.base.item('parkbench', -6, FRONT + 1.0, 0, 0);
  P.base.item('plantb', -BW / 2 + 0.6, FRONT + 0.8);
  P.base.item('plantb', BW / 2 - 0.6, FRONT + 0.8);
  // sıra çizgileri + bekleyen taksiler (ön tarafta, yola dik)
  const slots = [-7.5, -2.5, 2.5, 7.5];
  for (const x of [-10, -5, 0, 5, 10]) P.base.box(0.14, 0.02, 5.4, ym, x, 0.14, d / 2 - 4.4, { cast: false });
  P.base.box(20, 0.02, 0.14, ym, 0, 0.14, d / 2 - 7.1, { cast: false });
  slots.slice(0, 3).forEach((x, i) => {
    const car = P.base.item('car_sedan', x, d / 2 - 4.4, 0, 4);
    if (!car) return;
    // çift yüzlü tepe lambası (arkadan ters yazı görünmesin)
    [0, PI].forEach((ry, k) => {
      const sg = P.base.sign(`taksitepe${i}_${k}`, 'TAKSİ', 0.28, 0, 0, 0, ry, { color: '#111111', bg: Y, font: '900 110px Arial, sans-serif', light: false });
      sg.position.set(car.position.x, 1.62, car.position.z + (k ? -0.03 : 0.03));
    });
  });
  P.base.sign('bay_taksi', 'TAKSİ', 0.9, slots[3], 0.17, d / 2 - 4.4, 0, { color: '#1a1a1a', bg: Y, font: '900 110px Arial, sans-serif', light: false }).rotation.x = -PI / 2;
  P.base.pool(0, FRONT + 2, Y, 12, 0.16, 0.4);
  return finish(P, 'taksi_duragi', NEW_VENUES.taksi, { x: 0, z: FRONT + 1.2 });
}

// --- v157.4 OFİS BİNASI (cam kule; girişte danışma lobisi — "🏢 Ofisler" listesi buradan) ------
export function buildOfisVenue(lot) {
  DOOR.x = 0;
  const P = newParts('ofis');
  const { w, d } = lot;
  P.base.floor('kaldirim', w, d, 0, 0);
  const extH = 4.6;
  shell(P, { ext: wallExt('mermer_duvar', '#eef0f2'), extH, venue: NEW_VENUES.ofis, doorKey: 'door_doner', vitrine: true, ceil: '#e9ecef' });
  // lobinin üstünde cam kule (7 kat)
  const glassT = new THREE.MeshStandardMaterial({ color: '#7fa6bf', roughness: 0.12, metalness: 0.55 });
  const bandM = M('#dfe4e8', 0.5, 0.2);
  const TH = 7 * 3.4;
  P.high.box(BW + 0.6, TH, BD + 0.6, glassT, 0, extH, RZ);
  for (let k = 0; k <= 7; k++) P.high.box(BW + 0.75, 0.32, BD + 0.75, bandM, 0, extH + k * 3.4 - 0.16, RZ, { cast: false });
  for (const x of [-BW / 2, -BW / 6, BW / 6, BW / 2]) P.high.box(0.3, TH, 0.3, bandM, x, extH, FRONT + 0.32, { cast: false });
  P.high.box(BW + 1.2, 0.4, BD + 1.2, M('#1d2128', 0.5, 0.4), 0, extH + TH, RZ);
  P.high.box(BW + 1.22, 0.12, 0.08, glowMat('#19e8ff', 2.2), 0, extH + TH + 0.3, FRONT + 0.92, { cast: false });
  P.high.box(BW + 0.8, 0.35, BD + 0.8, M('#2a2f38', 0.5, 0.3), 0, extH, RZ);
  P.high.sign('ofis_ad', 'NEON PLAZA · OFİSLER', 0.8, 0, extH + 0.75, FRONT + 0.75, 0, { color: '#ffffff', glow: '#19e8ff', font: '800 100px Arial, sans-serif', li: 7, ld: 14 });
  // ön meydan: bayrak direkleri, saksılar, banklar
  for (const x of [-7.5, -6, -4.5]) {
    P.base.box(0.1, 7, 0.1, M('#c9ced4', 0.3, 0.8), x, 0, d / 2 - 2.2);
    P.base.solid(x, d / 2 - 2.2, 0.12, 0.12);
  }
  [['#e30a17', -7.5], ['#1d4f9a', -6], ['#19e8ff', -4.5]].forEach(([c, x]) => P.base.box(0.9, 0.55, 0.03, M(c, 0.7), x + 0.5, 6.2, d / 2 - 2.2, { cast: false }));
  for (const x of [-BW / 2 + 0.7, BW / 2 - 0.7]) P.base.item('plantb', x, FRONT + 0.9);
  P.base.item('parkbench', 5.5, FRONT + 4.5, 0, 0);
  P.base.item('parkbench', -2.5, FRONT + 4.5, 0, 0);
  P.base.pool(0, FRONT + 2, '#19e8ff', 12, 0.14, 0.38);
  return finish(P, 'ofis', NEW_VENUES.ofis, { x: 0, z: FRONT + 1.2 });
}

// --- v157.4 ÇETE KARARGAHI (hurdalıktaki 6 hangar) ---------------------------------------------
// İçerisi çetenin kendi karargah tasarımı (houses/hq_{gangId} — sadece satın alınmış eşyalar);
// tasarım şehirde karargaha yaklaşınca okunur (HQ_CACHE) ve iç mekân yeniden kurulur.
export const HQ_SLOTS = [[-44, 1], [0, 1], [44, 1], [-44, -1], [0, -1], [44, -1]]; // [cep yerel x, taraf]
export const HQ_CACHE = { designs: {} };
const HQ_TINTS = ['#8a6a50', '#8f8a7e', '#7f6c58', '#868278', '#8a6248', '#94806a'];
export function buildHqVenue(lot, slot) {
  DOOR.x = 0;
  const P = newParts(`hq${slot}`);
  const { w, d } = lot;
  P.base.floor('beton', w, d, 0, 0);
  const design = HQ_CACHE.designs[slot] || null;
  const items = (Array.isArray(design?.items) ? design.items : []).filter((it) => it && it.p === 1 && typeof it.k === 'string' && !(Math.abs(it.x) < 1.6 && it.z > ROOM.D / 2 - 1.8)).slice(0, 220);
  const venue = { name: 'Karargah', icon: '🏴', wall: design?.wall || 'boya_beyaz', floor: design?.floor || 'parke_mese', items, npcs: [] };
  const tint = HQ_TINTS[slot % HQ_TINTS.length];
  const metal = M(tint, 0.75, 0.45);
  const extH = 6.2;
  shell(P, { ext: (kit, ww, hh, dd, x, y, z) => kit.box(ww, hh, dd, metal, x, y, z), extH, venue, doorKey: 'door_metal', ceil: '#2a2a2e' });
  // oluklu sac nervürleri + yarım silindir çatı (eski hangarlar gibi)
  const rib = M('#5a564f', 0.6, 0.6);
  for (let x = -BW / 2; x <= BW / 2 + 0.01; x += 1.55) if (Math.abs(x - DOOR.x) > 1.2) P.high.box(0.12, extH - 0.2, 0.1, rib, x, 0.1, FRONT + 0.06, { cast: false });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(BW / 2 + 0.3, BW / 2 + 0.3, BD + 0.8, 18, 1, false, PI / 2, PI), M(tint, 0.7, 0.5));
  roof.rotation.x = PI / 2;
  roof.scale.set(1, 1, 0.42);
  roof.position.set(0, extH, RZ);
  roof.castShadow = true;
  P.high.group.add(roof);
  P.high.box(BW + 0.4, 0.3, BD + 0.4, M('#3a3834', 0.7, 0.4), 0, extH - 0.15, RZ);
  // kapı üstü lamba + numara (çetenin adı şehirde karargah bilgisi gelince eklenir)
  P.high.box(0.5, 0.14, 0.22, glowMat('#ffd9a0', 1.6), DOOR.x, 4.05, FRONT + 0.12, { cast: false }); // kamera kapı arkasındayken önüne girmesin
  P.high.sign(`hq_no${slot}`, `${slot + 1}`, 0.9, BW / 2 - 1.4, 4.4, FRONT + 0.08, 0, { color: '#e8e2d0', font: '900 120px Impact, Arial Black, sans-serif', light: false });
  P.base.item('barrel', BW / 2 + 1.2, FRONT + 1.4, 0, 0);
  P.base.item('crates', -BW / 2 - 1.4, FRONT + 1.6, 0, 0);
  return finish(P, `hq${slot}`, venue, { x: DOOR.x, z: FRONT + 1.2 });
}

export const VENUE_BUILDERS = {
  camii: buildCamiiVenue,
  banka: buildBankaVenue,
  karakol: buildKarakolVenue,
  belediye: buildBelediyeVenue,
  galeri: buildGaleriVenue,
  silah: buildSilahVenue,
  casino: buildCasinoVenue,
  spor: buildSporVenue,
  fabrika: buildFabrikaVenue,
  netkafe: buildNetKafeVenue,
  bar: buildBarVenue,
  cafe: buildCafeVenue,
  ev: buildEvVenue,
  liman: buildLimanVenue,
  hastane: buildHastaneVenue,
  benzinlik: buildBenzinlikVenue,
  otogar: (lot) => buildOtogarVenue(lot),
  otogar_kk: (lot) => buildOtogarVenue(lot, { kk: true }),
  taksi_duragi: buildTaksiVenue,
  ofis: buildOfisVenue,
};
