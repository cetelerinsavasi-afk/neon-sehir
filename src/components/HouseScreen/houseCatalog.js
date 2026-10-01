import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { labelTexture, cityTexture } from './houseTextures';
import { ITEM_PRICES, HOUSE_TAKEABLES } from '../../../functions/houseCatalogData.js';

// =============================================================================
// houseCatalog.js — Ev eşyaları kataloğu.
//
// Her eşya = { k, name, cat, icon, price, tints?, build(g, ctx), box/boxes,
//              seats?, wall?, ceil?, act? }
//   - Ölçüler METRE. Zemin y=0. Eşyanın "önü" +z yönüne bakar.
//   - wall: duvara monte eşya → arka yüzü z=0'da, +z'ye doğru çıkıntı yapar.
//     Motor bu eşyaları en yakın duvara yapıştırır.
//   - ceil: tavana asılan eşya (avize vb.) → ctx.H tavan yüksekliği.
//   - seats: oturulabilir noktalar (yerel koordinat).
//   - price: null = ücretsiz · { t:'gold', v } oyun altını · { t:'gem', v }
//     ileride gerçek parayla satılacak değerli para birimi (Elmas 💎).
//   - build(): opsiyonel olarak { act, on, setOn(v), tick(t,dt), light } döner.
//     act = etkileşim etiketi ("TV aç/kapat"), light = açıkken yanacak ışık.
// =============================================================================

const V3 = THREE.Vector3;
const matCache = new Map();

export function M(color, rough = 0.6, metal = 0, opts) {
  const key = `${color}|${rough}|${metal}|${opts ? JSON.stringify(opts) : ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(opts || {}) });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

// Sık kullanılan malzemeler
const CHROME = () => M('#e2e2e6', 0.1, 1);
const GOLD = () => M('#d9a93c', 0.25, 1);
const BLACK = () => M('#0e0e10', 0.5, 0.2);
const RUBBER = () => M('#121212', 0.92, 0);
const WHITE_CER = () => M('#f2f1ee', 0.12, 0.05);
const STEEL = () => M('#9aa0a6', 0.3, 0.9);
const DARKSTEEL = () => M('#3a3d42', 0.35, 0.85);
const GLASS = () => M('#a9c7d6', 0.04, 0.2, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const MIRROR = () => M('#ffffff', 0.02, 1);

function shade(o, cast = true) {
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}
function add(g, geo, m, x = 0, y = 0, z = 0, r) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  if (r) o.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
  g.add(shade(o));
  return o;
}
const B = (g, w, h, d, x, y, z, m, r) => add(g, new THREE.BoxGeometry(w, h, d), m, x, y, z, r);
const RB = (g, w, h, d, rad, x, y, z, m, r) =>
  add(g, new RoundedBoxGeometry(w, h, d, 3, Math.min(rad, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), m, x, y, z, r);
const C = (g, rt, rb, h, x, y, z, m, r, seg = 24) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, r);
const SP = (g, rad, x, y, z, m, sx = 1, sy = 1, sz = 1) => {
  const o = add(g, new THREE.SphereGeometry(rad, 22, 16), m, x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
};
const TOR = (g, R, t, x, y, z, m, r, arc = Math.PI * 2) => add(g, new THREE.TorusGeometry(R, t, 12, 36, arc), m, x, y, z, r);
function LATHE(g, pts, m, x = 0, y = 0, z = 0, seg = 32) {
  return add(g, new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg), m, x, y, z);
}
function TUBE(g, a, b, r, m, seg = 12) {
  const va = new V3(...a);
  const vb = new V3(...b);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg), m);
  o.position.copy(va).add(vb).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new V3(0, 1, 0), vb.clone().sub(va).normalize());
  g.add(shade(o));
  return o;
}
function PLANE(g, w, h, m, x, y, z, r) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  o.position.set(x, y, z);
  if (r) o.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
  o.receiveShadow = true;
  g.add(o);
  return o;
}
function own(m) {
  m.userData.own = true;
  return m;
}
function emissiveMat(color, intensity = 1.5) {
  return own(new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
}

// ---------------------------------------------------------------------------
// RENK / VARYANT SETLERİ
// ---------------------------------------------------------------------------
export const TINTS = {
  fabric: [
    { n: 'Bordo', c: '#6b1a22' }, { n: 'Lacivert', c: '#1f2a48' }, { n: 'Zümrüt', c: '#1d4d3c' },
    { n: 'Füme', c: '#4c4d53' }, { n: 'Bej', c: '#c7b595' }, { n: 'Siyah', c: '#19191b' },
    { n: 'Mor', c: '#553075' }, { n: 'Hardal', c: '#b8862e' }, { n: 'Petrol', c: '#1f5f68' },
    { n: 'Krem', c: '#e6dfd2' }, { n: 'Pudra', c: '#cf9a98' }, { n: 'Taba', c: '#7a4a2a' },
  ],
  leather: [
    { n: 'Konyak', c: '#6a3a1c' }, { n: 'Siyah Deri', c: '#171513' }, { n: 'Bordo Deri', c: '#4a1216' },
    { n: 'Beyaz Deri', c: '#e3ddd2' }, { n: 'Yeşil Deri', c: '#1c3a2c' }, { n: 'Lacivert Deri', c: '#18213a' },
  ],
  wood: [
    { n: 'Meşe', c: '#a3764a' }, { n: 'Ceviz', c: '#5a3a24' }, { n: 'Beyaz', c: '#e8e4dc' },
    { n: 'Siyah', c: '#1b1b1d' }, { n: 'Gri', c: '#6d7075' }, { n: 'Kiraz', c: '#7a2e22' },
  ],
  car: [
    { n: 'Kırmızı', c: '#a10d18', r: 0.22, m: 0.55 }, { n: 'Gece Siyahı', c: '#0b0b0e', r: 0.2, m: 0.6 },
    { n: 'İnci Beyaz', c: '#ecebe8', r: 0.25, m: 0.35 }, { n: 'Kraliyet Mavisi', c: '#15347a', r: 0.22, m: 0.6 },
    { n: 'Sarı', c: '#e0a800', r: 0.22, m: 0.45 }, { n: 'Yarış Yeşili', c: '#15452a', r: 0.22, m: 0.55 },
    { n: 'Gümüş', c: '#8b9099', r: 0.2, m: 0.85 }, { n: 'Turuncu', c: '#ff5a14', r: 0.22, m: 0.5 },
    { n: 'Mor', c: '#5c1a8a', r: 0.22, m: 0.6 }, { n: 'Turkuaz', c: '#0f98b0', r: 0.22, m: 0.55 },
    { n: 'Mat Siyah', c: '#1a1a1c', r: 0.75, m: 0.2 }, { n: 'Mat Gri', c: '#50555c', r: 0.7, m: 0.25 },
    { n: 'Krom', c: '#e8e8ec', r: 0.06, m: 1 }, { n: 'Altın', c: '#d4a53a', r: 0.15, m: 1 },
    { n: 'Neon Pembe', c: '#ff2d8a', r: 0.25, m: 0.4 },
  ],
  neon: [
    { n: 'Pembe', c: '#ff2d8a' }, { n: 'Camgöbeği', c: '#19e8ff' }, { n: 'Altın', c: '#ffc23d' },
    { n: 'Yeşil', c: '#39ff88' }, { n: 'Mor', c: '#b16bff' }, { n: 'Kırmızı', c: '#ff3b3b' }, { n: 'Beyaz', c: '#f4f0ff' },
  ],
  appliance: [
    { n: 'İnoks', c: '#b9bec4' }, { n: 'Siyah', c: '#1a1a1c' }, { n: 'Beyaz', c: '#eeeeee' },
    { n: 'Retro Kırmızı', c: '#b8141e' }, { n: 'Retro Mint', c: '#8fd6c0' },
  ],
  metal: [
    { n: 'Siyah', c: '#1a1a1c', m: 0.5 }, { n: 'Krom', c: '#e2e2e6', m: 1 }, { n: 'Altın', c: '#d9a93c', m: 1 },
    { n: 'Bakır', c: '#b0643a', m: 1 }, { n: 'Beyaz', c: '#eeeeee', m: 0.1 },
  ],
  art: [
    { n: 'Gün Batımı', c: '#ff6a3d' }, { n: 'Okyanus', c: '#1f6fb8' }, { n: 'Neon', c: '#ff2d8a' },
    { n: 'Orman', c: '#2d8a4a' }, { n: 'Altın', c: '#d4a53a' }, { n: 'Gece', c: '#3a2a8a' },
  ],
  bed: [
    { n: 'Beyaz', c: '#ecebe6' }, { n: 'Gri', c: '#7c7f86' }, { n: 'Lacivert', c: '#23305a' },
    { n: 'Bordo', c: '#6b1a22' }, { n: 'Siyah Saten', c: '#141416' }, { n: 'Altın Saten', c: '#c9a24a' },
  ],
};

const tintHex = (ctx, fallback) => (ctx.tint ? ctx.tint.c : fallback);

export const CATEGORIES = [
  { key: 'oturma', name: 'Oturma', icon: '🛋️' },
  { key: 'masa', name: 'Masalar', icon: '🪑' },
  { key: 'mutfak', name: 'Mutfak', icon: '🍳' },
  { key: 'banyo', name: 'Banyo', icon: '🚽' },
  { key: 'yatak', name: 'Yatak Odası', icon: '🛏️' },
  { key: 'elektronik', name: 'Elektronik', icon: '📺' },
  { key: 'dukkan', name: 'Dükkan & Kafe', icon: '🏪' },
  { key: 'silah', name: 'Silahlık', icon: '🔫' },
  { key: 'araba', name: 'Arabalar', icon: '🏎️' },
  { key: 'motor', name: 'Motorlar', icon: '🏍️' },
  { key: 'garaj', name: 'Garaj', icon: '🔧' },
  { key: 'dekor', name: 'Dekor', icon: '🪴' },
  { key: 'duvar', name: 'Duvar Süsleri', icon: '🖼️' },
  { key: 'hali', name: 'Halılar', icon: '🟥' },
  { key: 'luks', name: 'Lüks', icon: '💎' },
  { key: 'spor', name: 'Spor & Oyun', icon: '🎱' },
  { key: 'dis', name: 'Dış Mekan', icon: '🌳' },
  { key: 'yapi', name: 'Yapı', icon: '🧱' },
];

// =============================================================================
// OTURMA
// =============================================================================
function sofaBuild(len, { deep = 0.95, leather = false, tufted = false, legs = 'gold' } = {}) {
  return (g, ctx) => {
    const col = tintHex(ctx, leather ? '#6a3a1c' : '#6b1a22');
    const fab = leather ? M(col, 0.38, 0.05) : M(col, 0.88, 0);
    const h = len / 2;
    RB(g, len, 0.2, deep, 0.04, 0, 0.19, 0, M('#141416', 0.7));
    const inner = len - 0.5;
    const n = Math.max(1, Math.round(inner / 0.72));
    const cw = inner / n;
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + cw * (i + 0.5);
      RB(g, cw - 0.02, 0.2, deep - 0.28, 0.07, x, 0.39, 0.1, fab);
      RB(g, cw - 0.03, 0.5, 0.2, 0.08, x, 0.72, -deep / 2 + 0.24, fab, [-0.13, 0, 0]);
    }
    RB(g, len, 0.66, 0.16, 0.06, 0, 0.56, -deep / 2 + 0.08, fab);
    [-1, 1].forEach((s) => {
      RB(g, 0.25, 0.44, deep, 0.09, s * (h - 0.125), 0.5, 0, fab);
      [-1, 1].forEach((z) => C(g, 0.03, 0.02, 0.09, s * (h - 0.08), 0.045, z * (deep / 2 - 0.08), legs === 'gold' ? GOLD() : BLACK()));
    });
    if (tufted) {
      const btn = M('#0c0a09', 0.4, 0.3);
      for (let x = -inner / 2 + 0.15; x < inner / 2; x += 0.3) {
        for (let y = 0.62; y < 0.86; y += 0.15) SP(g, 0.018, x, y, -deep / 2 + 0.165, btn);
      }
    }
  };
}
function sofaSeats(len, deep = 0.95) {
  const inner = len - 0.5;
  const n = Math.max(1, Math.round(inner / 0.72));
  const cw = inner / n;
  return Array.from({ length: n }, (_, i) => [-inner / 2 + cw * (i + 0.5), 0.5, 0.12 + (deep - 0.95) / 2]);
}

const lSofaBuild = (g, ctx) => {
  const col = tintHex(ctx, '#4c4d53');
  const fab = M(col, 0.88);
  sofaBuild(2.8)(g, ctx);
  // şezlong uzantısı (sağ ön)
  const x = 1.4 - 0.45;
  RB(g, 0.9, 0.2, 1.1, 0.04, x, 0.19, 1.0, M('#141416', 0.7));
  RB(g, 0.86, 0.2, 1.05, 0.07, x, 0.39, 1.0, fab);
  RB(g, 0.25, 0.44, 1.1, 0.09, 1.4 - 0.125, 0.5, 1.0, fab);
  C(g, 0.03, 0.02, 0.09, x, 0.045, 1.45, GOLD());
};

function chairWood(g, ctx) {
  const w = M(tintHex(ctx, '#a3764a'), 0.55);
  RB(g, 0.46, 0.05, 0.46, 0.015, 0, 0.46, 0, w);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => C(g, 0.022, 0.018, 0.46, a * 0.2, 0.23, b * 0.2, w));
  [-1, 1].forEach((a) => C(g, 0.02, 0.02, 0.5, a * 0.2, 0.72, -0.2, w));
  B(g, 0.44, 0.06, 0.025, 0, 0.92, -0.2, w);
  B(g, 0.44, 0.05, 0.025, 0, 0.72, -0.2, w);
  RB(g, 0.42, 0.04, 0.4, 0.015, 0, 0.495, 0.01, M('#3b3b40', 0.9));
}
function chairModern(g, ctx) {
  const shell = M(tintHex(ctx, '#e6dfd2'), 0.45);
  RB(g, 0.48, 0.06, 0.46, 0.03, 0, 0.46, 0, shell);
  RB(g, 0.48, 0.42, 0.06, 0.03, 0, 0.7, -0.22, shell, [-0.14, 0, 0]);
  const leg = M('#7a5a3a', 0.5);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => TUBE(g, [a * 0.14, 0.44, b * 0.14], [a * 0.22, 0, b * 0.22], 0.015, leg));
}
function stoolBar(g, ctx) {
  const seat = M(tintHex(ctx, '#171513'), 0.35, 0.05);
  C(g, 0.2, 0.18, 0.08, 0, 0.78, 0, seat, null, 28);
  C(g, 0.025, 0.025, 0.74, 0, 0.38, 0, CHROME());
  TOR(g, 0.16, 0.012, 0, 0.3, 0, CHROME(), [Math.PI / 2, 0, 0]);
  C(g, 0.2, 0.22, 0.03, 0, 0.015, 0, CHROME());
}
function gamingChair(g, ctx) {
  const acc = M(tintHex(ctx, '#ff2d8a'), 0.5);
  const blk = M('#141416', 0.6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    TUBE(g, [0, 0.1, 0], [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], 0.02, blk);
    SP(g, 0.035, Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3, blk);
  }
  C(g, 0.03, 0.03, 0.34, 0, 0.26, 0, CHROME());
  RB(g, 0.54, 0.1, 0.52, 0.05, 0, 0.47, 0, blk);
  RB(g, 0.54, 0.8, 0.12, 0.06, 0, 0.95, -0.26, blk, [-0.12, 0, 0]);
  [-1, 1].forEach((s) => {
    RB(g, 0.08, 0.72, 0.13, 0.03, s * 0.23, 0.95, -0.25, acc, [-0.12, 0, 0]);
    RB(g, 0.06, 0.04, 0.3, 0.02, s * 0.3, 0.68, 0, blk);
    C(g, 0.015, 0.015, 0.2, s * 0.3, 0.57, 0, blk);
  });
  RB(g, 0.3, 0.14, 0.12, 0.05, 0, 1.25, -0.33, acc, [-0.12, 0, 0]);
}
function beanBag(g, ctx) {
  const f = M(tintHex(ctx, '#b8862e'), 0.95);
  SP(g, 0.45, 0, 0.3, 0, f, 1, 0.66, 1);
  SP(g, 0.36, 0, 0.5, -0.18, f, 1, 0.85, 0.7);
}
function armchairWing(g, ctx) {
  sofaBuild(1.05, { deep: 0.9, leather: true, tufted: true, legs: 'dark' })(g, ctx);
}
function ottoman(g, ctx) {
  const f = M(tintHex(ctx, '#553075'), 0.85);
  C(g, 0.32, 0.32, 0.36, 0, 0.22, 0, f, null, 30);
  TOR(g, 0.31, 0.02, 0, 0.4, 0, f, [Math.PI / 2, 0, 0]);
  C(g, 0.29, 0.29, 0.04, 0, 0.02, 0, GOLD());
}

// =============================================================================
// MASALAR
// =============================================================================
function tableDining(g, ctx) {
  const w = M(tintHex(ctx, '#5a3a24'), 0.4);
  RB(g, 2.1, 0.06, 1.0, 0.02, 0, 0.75, 0, w);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B(g, 0.07, 0.72, 0.07, a * 0.95, 0.36, b * 0.42, w));
  B(g, 1.9, 0.08, 0.04, 0, 0.66, 0.42, w);
  B(g, 1.9, 0.08, 0.04, 0, 0.66, -0.42, w);
  // masa ortası süs
  C(g, 0.12, 0.08, 0.06, 0, 0.81, 0, M('#e8e4dc', 0.2));
  SP(g, 0.05, -0.03, 0.87, 0.02, M('#e0a800', 0.5));
  SP(g, 0.05, 0.04, 0.87, -0.02, M('#d23a3a', 0.5));
}
function tableRound(g, ctx) {
  const w = M(tintHex(ctx, '#e8e4dc'), 0.3);
  C(g, 0.6, 0.6, 0.05, 0, 0.75, 0, M('#f4f2ee', 0.08, 0.05), null, 40);
  C(g, 0.05, 0.05, 0.7, 0, 0.37, 0, w);
  C(g, 0.3, 0.34, 0.05, 0, 0.025, 0, w);
}
function coffeeTable(g, ctx) {
  const frame = M(tintHex(ctx, '#d9a93c'), 0.25, 1);
  B(g, 1.2, 0.02, 0.62, 0, 0.42, 0, GLASS());
  B(g, 1.1, 0.02, 0.55, 0, 0.12, 0, M('#1a1a1c', 0.2, 0.3));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B(g, 0.025, 0.42, 0.025, a * 0.58, 0.21, b * 0.29, frame));
  [-1, 1].forEach((b) => B(g, 1.18, 0.025, 0.025, 0, 0.405, b * 0.29, frame));
  [-1, 1].forEach((a) => B(g, 0.025, 0.025, 0.6, a * 0.58, 0.405, 0, frame));
  // kitaplar
  B(g, 0.28, 0.04, 0.2, -0.25, 0.155, 0.05, M('#6b1a22', 0.7));
  B(g, 0.24, 0.035, 0.18, -0.25, 0.19, 0.04, M('#1f2a48', 0.7));
}
function desk(g, ctx) {
  const w = M(tintHex(ctx, '#1b1b1d'), 0.45);
  RB(g, 1.5, 0.04, 0.7, 0.01, 0, 0.75, 0, w);
  B(g, 0.45, 0.72, 0.66, 0.5, 0.36, 0, w);
  for (let i = 0; i < 3; i++) {
    B(g, 0.4, 0.005, 0.005, 0.5, 0.2 + i * 0.22, 0.332, M('#000', 0.5));
    B(g, 0.12, 0.015, 0.02, 0.5, 0.26 + i * 0.22, 0.34, CHROME());
  }
  [-1, 1].forEach((b) => B(g, 0.04, 0.72, 0.04, -0.7, 0.36, b * 0.3, w));
  // lamba + laptop
  C(g, 0.08, 0.08, 0.02, -0.55, 0.78, -0.2, BLACK());
  TUBE(g, [-0.55, 0.78, -0.2], [-0.5, 1.1, -0.15], 0.01, BLACK());
  C(g, 0.03, 0.08, 0.1, -0.44, 1.09, -0.08, M('#1a1a1a', 0.4), [0.5, 0, 0]);
  B(g, 0.36, 0.015, 0.25, 0.05, 0.775, 0.1, M('#8b9099', 0.3, 0.8));
  B(g, 0.36, 0.23, 0.012, 0.05, 0.89, -0.03, M('#8b9099', 0.3, 0.8), [-0.2, 0, 0]);
}
function sideTable(g, ctx) {
  const w = M(tintHex(ctx, '#5a3a24'), 0.45);
  RB(g, 0.5, 0.55, 0.42, 0.02, 0, 0.3, 0, w);
  [0.2, 0.42].forEach((y) => {
    B(g, 0.44, 0.004, 0.004, 0, y, 0.211, M('#000', 0.5));
    B(g, 0.1, 0.015, 0.02, 0, y - 0.08, 0.215, GOLD());
  });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => C(g, 0.015, 0.012, 0.05, a * 0.2, 0.012, b * 0.16, GOLD()));
}

// =============================================================================
// MUTFAK
// =============================================================================
function counterBody(g, ctx, w = 1.0) {
  const body = M(tintHex(ctx, '#e8e4dc'), 0.35);
  B(g, w, 0.82, 0.6, 0, 0.45, 0, body);
  B(g, w, 0.1, 0.54, 0, 0.05, -0.03, M('#141416', 0.6));
  RB(g, w + 0.02, 0.04, 0.64, 0.008, 0, 0.88, 0.01, M('#1a1a1c', 0.12, 0.1));
  const n = Math.max(1, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    B(g, w / n - 0.02, 0.7, 0.01, x, 0.47, 0.301, body);
    B(g, 0.12, 0.012, 0.02, x, 0.76, 0.315, CHROME());
  }
}
function kitchenCounter(g, ctx) {
  counterBody(g, ctx, 1.0);
  // üstünde küçük eşyalar
  C(g, 0.1, 0.1, 0.18, -0.3, 0.99, -0.12, M('#b0643a', 0.3, 0.9));
  B(g, 0.35, 0.02, 0.22, 0.2, 0.91, 0.05, M('#a3764a', 0.5));
}
function kitchenSink(g, ctx) {
  counterBody(g, ctx, 1.2);
  B(g, 0.62, 0.03, 0.42, 0, 0.897, 0, DARKSTEEL());
  B(g, 0.56, 0.02, 0.36, 0, 0.89, 0, M('#0c0c0e', 0.3, 0.8));
  C(g, 0.02, 0.025, 0.3, 0, 1.05, -0.24, CHROME());
  TOR(g, 0.1, 0.018, 0, 1.2, -0.14, CHROME(), [0, Math.PI / 2, 0], Math.PI);
}
function stove(g, ctx) {
  const st = M(tintHex(ctx, '#9aa0a6'), 0.3, 0.9);
  B(g, 0.8, 0.86, 0.62, 0, 0.45, 0, st);
  B(g, 0.8, 0.02, 0.62, 0, 0.89, 0, M('#070708', 0.05, 0.3));
  const burners = [];
  [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.15], [0.2, 0.15]].forEach(([x, z]) => {
    const m = own(new THREE.MeshStandardMaterial({ color: '#222', emissive: '#ff3a10', emissiveIntensity: 0, roughness: 0.4 }));
    burners.push(m);
    TOR(g, 0.08, 0.006, x, 0.902, z, m, [Math.PI / 2, 0, 0]);
    TOR(g, 0.045, 0.005, x, 0.902, z, m, [Math.PI / 2, 0, 0]);
  });
  B(g, 0.64, 0.4, 0.01, 0, 0.42, 0.312, M('#0a0a0c', 0.05, 0.4));
  B(g, 0.6, 0.02, 0.03, 0, 0.7, 0.33, CHROME());
  for (let i = 0; i < 4; i++) C(g, 0.022, 0.022, 0.03, -0.27 + i * 0.18, 0.8, 0.32, M('#111'), [Math.PI / 2, 0, 0]);
  let on = false;
  return {
    act: 'Ocağı yak/söndür',
    setOn(v) {
      on = v;
      burners.forEach((m) => (m.emissiveIntensity = on ? 2.2 : 0));
    },
    get on() { return on; },
    light: { x: 0, y: 1.2, z: 0, color: '#ff6a2a', intensity: 3, distance: 3 },
  };
}
function fridge(g, ctx) {
  const st = M(tintHex(ctx, '#b9bec4'), 0.28, 0.85);
  RB(g, 0.85, 1.95, 0.72, 0.03, 0, 0.98, 0, st);
  B(g, 0.004, 1.9, 0.01, 0, 0.98, 0.362, M('#222', 0.5));
  [-1, 1].forEach((s) => B(g, 0.025, 0.6, 0.04, s * 0.06, 1.2, 0.39, M('#2a2a2e', 0.3, 0.9)));
  B(g, 0.22, 0.3, 0.01, -0.2, 1.25, 0.362, M('#0b0b0d', 0.1, 0.5));
  const scr = emissiveMat('#19e8ff', 0.8);
  PLANE(g, 0.12, 0.05, scr, -0.2, 1.3, 0.368);
}
function kitchenIsland(g, ctx) {
  const body = M(tintHex(ctx, '#1b1b1d'), 0.45);
  B(g, 2.0, 0.86, 0.8, 0, 0.45, -0.05, body);
  RB(g, 2.2, 0.05, 1.05, 0.01, 0, 0.9, 0.05, M('#f0ebe0', 0.12, 0.05));
  for (let i = 0; i < 4; i++) B(g, 0.46, 0.7, 0.01, -0.75 + i * 0.5, 0.47, -0.456, body);
  // meyve kasesi
  C(g, 0.16, 0.08, 0.07, 0.3, 0.96, 0.05, M('#ececec', 0.1));
  [['#e0a800', 0.25, 0.02], ['#d23a3a', 0.35, 0.05], ['#3a9a3a', 0.3, 0.1]].forEach(([c, x, z]) => SP(g, 0.045, x, 1.0, z, M(c, 0.5)));
}
function upperCabinet(g, ctx) {
  const body = M(tintHex(ctx, '#e8e4dc'), 0.35);
  B(g, 1.0, 0.7, 0.36, 0, 1.85, 0.18, body);
  [-0.25, 0.25].forEach((x) => {
    B(g, 0.48, 0.66, 0.01, x, 1.85, 0.365, body);
    B(g, 0.015, 0.12, 0.02, x + (x < 0 ? 0.2 : -0.2), 1.62, 0.38, CHROME());
  });
  B(g, 0.96, 0.01, 0.3, 0, 1.49, 0.18, emissiveMat('#fff2d0', 1.2));
}
function coffeeMachine(g) {
  counterBody(g, { tint: null }, 0.8);
  RB(g, 0.34, 0.42, 0.34, 0.03, 0, 1.12, -0.05, M('#141416', 0.3, 0.6));
  B(g, 0.2, 0.03, 0.12, 0, 0.98, 0.08, CHROME());
  C(g, 0.04, 0.035, 0.08, 0, 1.03, 0.08, WHITE_CER());
  PLANE(g, 0.1, 0.05, emissiveMat('#39ff88', 1), 0, 1.25, 0.121);
}

// =============================================================================
// BANYO
// =============================================================================
function toilet(g) {
  LATHE(g, [[0, 0], [0.16, 0], [0.19, 0.1], [0.2, 0.3], [0.23, 0.38], [0.2, 0.4], [0, 0.4]], WHITE_CER(), 0, 0, 0.04).scale.set(1, 1, 1.25);
  TOR(g, 0.18, 0.025, 0, 0.415, 0.04, WHITE_CER(), [Math.PI / 2, 0, 0]).scale.set(1, 1.25, 1);
  RB(g, 0.42, 0.4, 0.18, 0.04, 0, 0.62, -0.26, WHITE_CER());
  RB(g, 0.44, 0.03, 0.2, 0.01, 0, 0.835, -0.26, WHITE_CER());
  C(g, 0.025, 0.025, 0.012, 0, 0.855, -0.26, CHROME());
}
function sinkBath(g, ctx) {
  const body = M(tintHex(ctx, '#5a3a24'), 0.45);
  B(g, 0.8, 0.5, 0.48, 0, 0.55, 0, body);
  B(g, 0.76, 0.46, 0.01, 0, 0.55, 0.241, body);
  B(g, 0.2, 0.015, 0.02, 0, 0.7, 0.25, GOLD());
  LATHE(g, [[0, 0.02], [0.14, 0.02], [0.2, 0.1], [0.21, 0.14], [0.19, 0.14], [0.13, 0.05], [0, 0.05]], WHITE_CER(), 0, 0.8, 0);
  C(g, 0.018, 0.02, 0.22, 0, 0.91, -0.19, GOLD());
  B(g, 0.02, 0.02, 0.12, 0, 1.01, -0.14, GOLD());
  // ayna
  RB(g, 0.72, 0.9, 0.04, 0.02, 0, 1.6, -0.22, GOLD());
  B(g, 0.66, 0.84, 0.01, 0, 1.6, -0.198, MIRROR());
}
function shower(g) {
  B(g, 1.0, 0.08, 1.0, 0, 0.04, 0, WHITE_CER());
  B(g, 0.01, 2.0, 1.0, 0.5, 1.08, 0, GLASS());
  B(g, 1.0, 2.0, 0.01, 0, 1.08, 0.5, GLASS());
  [[0.5, 0.5], [0.5, -0.5], [-0.5, 0.5]].forEach(([x, z]) => B(g, 0.025, 2.0, 0.025, x, 1.08, z, CHROME()));
  B(g, 0.02, 2.0, 1.0, -0.5, 1.08, 0, M('#d6d3cc', 0.3));
  B(g, 1.0, 2.0, 0.02, 0, 1.08, -0.5, M('#d6d3cc', 0.3));
  C(g, 0.015, 0.015, 1.1, -0.45, 1.6, -0.45, CHROME());
  TUBE(g, [-0.45, 2.1, -0.45], [-0.2, 2.1, -0.2], 0.015, CHROME());
  C(g, 0.12, 0.12, 0.02, -0.18, 2.08, -0.18, CHROME());
}
function bathtub(g, ctx) {
  const outer = M(tintHex(ctx, '#f2f1ee'), 0.15, 0.05);
  RB(g, 1.75, 0.58, 0.82, 0.12, 0, 0.3, 0, outer);
  const water = own(new THREE.MeshStandardMaterial({ color: '#6fb7d6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8 }));
  B(g, 1.55, 0.02, 0.62, 0, 0.53, 0, water);
  [[0, 0.585, 0.35, 1.7, 0.1], [0, 0.585, -0.35, 1.7, 0.1]].forEach(([x, y, z, w, d]) => B(g, w, 0.04, d, x, y, z, outer));
  [-0.82, 0.82].forEach((x) => B(g, 0.1, 0.04, 0.8, x, 0.585, 0, outer));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => SP(g, 0.05, a * 0.7, 0.03, b * 0.3, GOLD()));
  C(g, 0.02, 0.02, 0.3, -0.8, 0.75, 0, GOLD());
  B(g, 0.14, 0.02, 0.02, -0.74, 0.9, 0, GOLD());
  // köpük
  for (let i = 0; i < 9; i++) SP(g, 0.06 + (i % 3) * 0.02, -0.4 + (i % 5) * 0.2, 0.55, -0.15 + (i % 3) * 0.14, M('#ffffff', 0.9), 1, 0.5, 1);
}
function jacuzzi(g) {
  LATHE(g, [[0, 0], [1.05, 0], [1.1, 0.55], [1.18, 0.6], [1.18, 0.66], [1.0, 0.66], [0.98, 0.3], [0, 0.3]], M('#e8e4dc', 0.3), 0, 0, 0, 48);
  const water = own(new THREE.MeshStandardMaterial({ color: '#1f9bd6', emissive: '#0b6fae', emissiveIntensity: 0.6, roughness: 0.05, transparent: true, opacity: 0.85 }));
  const w = C(g, 0.99, 0.99, 0.02, 0, 0.56, 0, water, null, 48);
  const bubbles = [];
  const bm = M('#ffffff', 0.4, 0, { transparent: true, opacity: 0.7 });
  for (let i = 0; i < 18; i++) bubbles.push(SP(g, 0.03 + Math.random() * 0.03, (Math.random() - 0.5) * 1.5, 0.58, (Math.random() - 0.5) * 1.5, bm));
  let on = true;
  return {
    act: 'Köpükleri aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; bubbles.forEach((b) => (b.visible = v)); water.emissiveIntensity = v ? 0.6 : 0.15; },
    tick(t) {
      if (!on) return;
      bubbles.forEach((b, i) => { b.position.y = 0.57 + Math.abs(Math.sin(t * 3 + i)) * 0.04; });
      w.rotation.y = t * 0.1;
    },
    light: { x: 0, y: 0.9, z: 0, color: '#3ab8ff', intensity: 3, distance: 4 },
  };
}

// =============================================================================
// YATAK ODASI
// =============================================================================
function bedBuild(w) {
  return (g, ctx) => {
    const frame = M('#2a1d15', 0.5);
    const duvet = M(tintHex(ctx, '#ecebe6'), 0.85);
    RB(g, w + 0.1, 0.3, 2.15, 0.04, 0, 0.2, 0, frame);
    RB(g, w, 0.22, 2.0, 0.08, 0, 0.45, 0.02, M('#f5f4f0', 0.9));
    RB(g, w + 0.04, 0.12, 1.45, 0.06, 0, 0.53, 0.3, duvet);
    RB(g, w + 0.06, 0.06, 0.4, 0.03, 0, 0.6, 0.55, M('#1a1a1c', 0.7));
    const pw = w > 1.2 ? 2 : 1;
    for (let i = 0; i < pw; i++) {
      RB(g, w / pw - 0.12, 0.14, 0.4, 0.07, -w / 2 + (w / pw) * (i + 0.5), 0.64, -0.72, M('#fbfaf6', 0.9));
    }
    RB(g, w + 0.2, 1.1, 0.12, 0.05, 0, 0.8, -1.08, M(tintHex(ctx, '#ecebe6') === '#ecebe6' ? '#3b3b40' : tintHex(ctx), 0.8));
  };
}
function wardrobe(g, ctx) {
  const w = M(tintHex(ctx, '#e8e4dc'), 0.4);
  B(g, 1.8, 2.2, 0.62, 0, 1.12, 0, w);
  B(g, 1.8, 0.06, 0.6, 0, 0.03, 0, M('#141416'));
  for (let i = 0; i < 3; i++) {
    const x = -0.6 + i * 0.6;
    B(g, 0.58, 2.1, 0.012, x, 1.13, 0.312, w);
    B(g, 0.015, 0.5, 0.03, x + (i === 1 ? -0.26 : 0.26), 1.15, 0.33, GOLD());
  }
  B(g, 0.5, 1.9, 0.005, 0, 1.13, 0.319, MIRROR());
}
function dresser(g, ctx) {
  const w = M(tintHex(ctx, '#5a3a24'), 0.45);
  RB(g, 1.3, 0.85, 0.5, 0.02, 0, 0.46, 0, w);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    B(g, 0.6, 0.24, 0.01, -0.31 + c * 0.62, 0.2 + r * 0.26, 0.252, w);
    B(g, 0.12, 0.015, 0.02, -0.31 + c * 0.62, 0.24 + r * 0.26, 0.26, GOLD());
  }
  TOR(g, 0.34, 0.025, 0, 1.3, -0.2, GOLD(), null).scale.set(1, 1.3, 1);
  C(g, 0.33, 0.33, 0.005, 0, 1.3, -0.2, MIRROR(), [Math.PI / 2, 0, 0]).scale.set(1, 1, 1.3);
  C(g, 0.06, 0.05, 0.1, 0.45, 0.93, 0.05, M('#b16bff', 0.2, 0.2, { transparent: true, opacity: 0.8 }));
}
function nightstand(g, ctx) {
  sideTable(g, ctx);
  C(g, 0.06, 0.08, 0.2, 0.08, 0.68, -0.05, M('#e8e4dc', 0.3));
  const sm = own(new THREE.MeshStandardMaterial({ color: '#fff0d0', emissive: '#ffb060', emissiveIntensity: 1.2, side: THREE.DoubleSide }));
  add(g, new THREE.CylinderGeometry(0.09, 0.14, 0.16, 24, 1, true), sm, 0.08, 0.86, -0.05);
  let on = true;
  return {
    act: 'Lambayı aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; sm.emissiveIntensity = v ? 1.2 : 0.05; },
    light: { x: 0.08, y: 0.9, z: 0, color: '#ffb060', intensity: 2.2, distance: 4 },
  };
}

// =============================================================================
// ELEKTRONİK
// =============================================================================
function tvScreen(g, w, h, x, y, z, live) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const cx = c.getContext('2d');
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  const sm = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0, roughness: 0.15, metalness: 0.2 }));
  sm.userData.tex = tx;
  PLANE(g, w, h, sm, x, y, z);
  let on = false;
  let last = 0;
  const news = 'SON DAKİKA  •  LİMANDA HAREKETLİLİK  •  KRİPTO REKOR KIRDI  •  NEON ŞEHİR DERBİSİ BU AKŞAM  •  ';
  return {
    act: 'TV aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; sm.emissiveIntensity = on ? 1.1 : 0; },
    tick(t) {
      if (!on || !live || t - last < 0.05) return;
      last = t;
      const hh = (t * 25) % 360;
      const gr = cx.createLinearGradient(0, 0, 512, 288);
      gr.addColorStop(0, `hsl(${hh},70%,36%)`);
      gr.addColorStop(1, `hsl(${hh + 90},70%,12%)`);
      cx.fillStyle = gr;
      cx.fillRect(0, 0, 512, 288);
      cx.fillStyle = 'rgba(255,255,255,.85)';
      cx.beginPath();
      cx.arc(256 + Math.sin(t) * 150, 110 + Math.cos(t * 1.3) * 40, 38, 0, 7);
      cx.fill();
      cx.fillStyle = '#a00';
      cx.fillRect(0, 238, 512, 50);
      cx.fillStyle = '#fff';
      cx.font = 'bold 26px sans-serif';
      cx.fillText(news, 512 - ((t * 90) % 1500), 272);
      cx.fillStyle = '#e8b04a';
      cx.fillRect(14, 14, 90, 26);
      cx.fillStyle = '#000';
      cx.font = 'bold 16px sans-serif';
      cx.fillText('CANLI', 30, 33);
      tx.needsUpdate = true;
    },
    light: { x, y, z: z + 0.8, color: '#7aa8ff', intensity: 2.5, distance: 6 },
  };
}
function tvStand(g, ctx) {
  const w = M(tintHex(ctx, '#3a2216'), 0.45, 0.1);
  B(g, 2.2, 0.5, 0.48, 0, 0.27, 0, w);
  B(g, 2.24, 0.035, 0.52, 0, 0.535, 0, GOLD());
  [-0.55, 0, 0.55].forEach((x) => B(g, 0.7, 0.4, 0.01, x, 0.27, 0.241, M('#0d0d0f', 0.1, 0.3)));
  B(g, 0.45, 0.12, 0.2, 0, 0.61, -0.05, BLACK());
  RB(g, 1.95, 1.13, 0.06, 0.01, 0, 1.25, -0.02, BLACK());
  return tvScreen(g, 1.85, 1.04, 0, 1.25, 0.012, ctx.live);
}
function tvWall(g, ctx) {
  RB(g, 2.1, 1.22, 0.06, 0.01, 0, 1.55, 0.05, BLACK());
  B(g, 1.1, 0.08, 0.1, 0, 0.84, 0.07, M('#1a1a1c', 0.4, 0.4));
  return tvScreen(g, 2.0, 1.12, 0, 1.55, 0.082, ctx.live);
}
function speaker(g, ctx) {
  const b = M(tintHex(ctx, '#141416'), 0.5);
  RB(g, 0.34, 1.15, 0.36, 0.02, 0, 0.6, 0, b);
  [0.35, 0.65].forEach((y) => {
    C(g, 0.12, 0.12, 0.02, 0, y, 0.18, M('#2a2a2c', 0.8), [Math.PI / 2, 0, 0]);
    C(g, 0.04, 0.04, 0.03, 0, y, 0.19, DARKSTEEL(), [Math.PI / 2, 0, 0]);
    TOR(g, 0.12, 0.008, 0, y, 0.19, GOLD());
  });
  C(g, 0.04, 0.04, 0.02, 0, 0.92, 0.18, DARKSTEEL(), [Math.PI / 2, 0, 0]);
}
function codeTexture() {
  return labelTexture('code', 256, 160, (g, w, h, r) => {
    g.fillStyle = '#0a0e14';
    g.fillRect(0, 0, w, h);
    const cols = ['#19e8ff', '#ff2d8a', '#39ff88', '#e8e6df', '#ffc23d'];
    for (let y = 10; y < h; y += 10) {
      let x = 8 + Math.floor(r() * 4) * 12;
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const ww = 12 + r() * 50;
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.fillRect(x, y, ww, 4);
        x += ww + 6;
      }
    }
  });
}
function pcSetup(g, ctx) {
  const rgb = tintHex(ctx, '#b16bff');
  RB(g, 1.8, 0.05, 0.8, 0.01, 0, 0.75, 0, M('#141416', 0.35));
  [-1, 1].forEach((s) => { B(g, 0.06, 0.73, 0.7, s * 0.85, 0.365, 0, M('#141416', 0.35)); });
  B(g, 1.78, 0.02, 0.02, 0, 0.72, 0.39, emissiveMat(rgb, 2.2));
  const scr = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: codeTexture(), emissiveIntensity: 0.9 }));
  [[-0.55, 0.35], [0, 0], [0.55, -0.35]].forEach(([x, ry]) => {
    const m = new THREE.Group();
    m.position.set(x, 1.1, -0.2 + Math.abs(ry) * 0.25);
    m.rotation.y = ry;
    g.add(m);
    RB(m, 0.58, 0.36, 0.03, 0.01, 0, 0, 0, BLACK());
    PLANE(m, 0.55, 0.33, scr, 0, 0, 0.016);
    C(m, 0.012, 0.012, 0.3, 0, -0.2, -0.03, BLACK());
  });
  B(g, 0.5, 0.02, 0.16, 0, 0.785, 0.15, BLACK());
  B(g, 0.46, 0.005, 0.12, 0, 0.797, 0.15, emissiveMat(rgb, 1.2));
  RB(g, 0.08, 0.03, 0.12, 0.012, 0.4, 0.79, 0.15, BLACK());
  // kasa
  RB(g, 0.24, 0.5, 0.48, 0.01, 0.75, 1.03, -0.1, BLACK());
  B(g, 0.005, 0.44, 0.42, 0.63, 1.03, -0.1, GLASS());
  [0.9, 1.05, 1.18].forEach((y) => C(g, 0.06, 0.06, 0.02, 0.64, y, -0.1, emissiveMat(rgb, 2), [0, 0, Math.PI / 2]));
  return { light: { x: 0, y: 1.0, z: 0.3, color: rgb, intensity: 2.5, distance: 4 }, on: true, setOn() {}, noToggle: true };
}
function arcade(g, ctx) {
  const body = M(tintHex(ctx, '#1f2a48'), 0.5);
  B(g, 0.7, 1.75, 0.72, 0, 0.875, 0, body);
  B(g, 0.72, 0.9, 0.02, 0, 0.45, 0.36, M('#111', 0.5));
  RB(g, 0.72, 0.1, 0.4, 0.02, 0, 1.02, 0.42, BLACK(), [0.25, 0, 0]);
  const scrC = document.createElement('canvas');
  scrC.width = 128;
  scrC.height = 128;
  const sg = scrC.getContext('2d');
  const stx = new THREE.CanvasTexture(scrC);
  stx.colorSpace = THREE.SRGBColorSpace;
  const sm = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: stx, emissiveIntensity: 1.1 }));
  sm.userData.tex = stx;
  PLANE(g, 0.52, 0.44, sm, 0, 1.36, 0.3, [-0.2, 0, 0]);
  const marquee = labelTexture('arcade_mq', 256, 64, (c, w, h) => {
    c.fillStyle = '#12051c';
    c.fillRect(0, 0, w, h);
    c.font = 'bold 40px sans-serif';
    c.textAlign = 'center';
    c.shadowColor = '#ff2d8a';
    c.shadowBlur = 16;
    c.fillStyle = '#ffd0e6';
    c.fillText('NEON ARCADE', w / 2, 46);
  });
  PLANE(g, 0.68, 0.17, own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: marquee, emissiveIntensity: 1.3 })), 0, 1.66, 0.365);
  C(g, 0.012, 0.012, 0.08, -0.15, 1.1, 0.46, CHROME());
  SP(g, 0.025, -0.15, 1.14, 0.46, M('#d23a3a', 0.3));
  ['#19e8ff', '#ff2d8a', '#ffc23d', '#39ff88'].forEach((c, i) => C(g, 0.022, 0.022, 0.02, 0.02 + i * 0.07, 1.09, 0.47, M(c, 0.3), [0.25, 0, 0]));
  let on = true;
  let last = 0;
  return {
    act: 'Atariyi aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; sm.emissiveIntensity = v ? 1.1 : 0; },
    tick(t) {
      if (!on || !ctx.live || t - last < 0.06) return;
      last = t;
      sg.fillStyle = '#05050c';
      sg.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 5; i++) {
        sg.fillStyle = ['#39ff88', '#ff2d8a', '#19e8ff', '#ffc23d', '#b16bff'][i];
        const x = ((t * 40 + i * 30) % 150) - 10;
        sg.fillRect(x, 20 + i * 14, 10, 8);
      }
      sg.fillStyle = '#ffc23d';
      sg.beginPath();
      sg.arc(64 + Math.sin(t * 2) * 40, 104, 8, 0.3, 5.9);
      sg.lineTo(64 + Math.sin(t * 2) * 40, 104);
      sg.fill();
      stx.needsUpdate = true;
    },
    light: { x: 0, y: 1.4, z: 0.7, color: '#ff4fb0', intensity: 2.2, distance: 4 },
  };
}
function jukebox(g) {
  const wood = M('#5a1a14', 0.4);
  B(g, 0.9, 1.1, 0.55, 0, 0.55, 0, wood);
  C(g, 0.45, 0.45, 0.55, 0, 1.1, 0, wood, [Math.PI / 2, 0, 0], 32);
  const tubes = [];
  for (let i = 0; i < 3; i++) {
    const m = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff2d8a', emissiveIntensity: 1.8 }));
    tubes.push(m);
    TOR(g, 0.38 - i * 0.06, 0.02, 0, 1.1, 0.28, m, null, Math.PI);
  }
  B(g, 0.5, 0.35, 0.02, 0, 0.72, 0.28, GLASS());
  B(g, 0.46, 0.3, 0.01, 0, 0.72, 0.27, M('#c9a24a', 0.3, 0.8));
  for (let i = 0; i < 6; i++) B(g, 0.05, 0.4, 0.01, -0.32 + i * 0.128, 0.25, 0.28, M('#d9a93c', 0.3, 1));
  let on = true;
  return {
    act: 'Müzik kutusunu aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; if (!v) tubes.forEach((m) => (m.emissiveIntensity = 0.05)); },
    tick(t) {
      if (!on) return;
      tubes.forEach((m, i) => { m.emissive.setHSL(((t * 0.15 + i * 0.2) % 1), 1, 0.55); m.emissiveIntensity = 1.8; });
    },
    light: { x: 0, y: 1.2, z: 0.6, color: '#ff4fb0', intensity: 2.5, distance: 4 },
  };
}
function djBooth(g) {
  B(g, 2.0, 1.0, 0.8, 0, 0.5, 0, M('#141416', 0.4));
  const led = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#19e8ff', emissiveIntensity: 1.6 }));
  B(g, 1.9, 0.8, 0.01, 0, 0.5, 0.401, led);
  B(g, 2.02, 0.04, 0.84, 0, 1.02, 0, M('#0a0a0c', 0.2, 0.5));
  const plates = [];
  [-0.6, 0.6].forEach((x) => {
    B(g, 0.5, 0.06, 0.45, x, 1.07, 0, M('#1f1f22', 0.3, 0.6));
    const p = C(g, 0.18, 0.18, 0.012, x, 1.107, 0, M('#050505', 0.3), null, 32);
    plates.push(p);
    C(g, 0.05, 0.05, 0.014, x, 1.11, 0, M('#d23a3a', 0.4));
  });
  B(g, 0.4, 0.05, 0.4, 0, 1.065, 0, M('#1f1f22', 0.3, 0.6));
  for (let i = 0; i < 4; i++) C(g, 0.015, 0.015, 0.03, -0.12 + i * 0.08, 1.1, -0.05, CHROME());
  let on = true;
  return {
    act: 'DJ setini aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; led.emissiveIntensity = v ? 1.6 : 0.02; },
    tick(t) {
      if (!on) return;
      plates.forEach((p) => (p.rotation.y = t * 3.5));
      led.emissive.setHSL((t * 0.1) % 1, 1, 0.5);
    },
    light: { x: 0, y: 1.3, z: 0.8, color: '#19e8ff', intensity: 3, distance: 5 },
  };
}

// =============================================================================
// SİLAHLAR (duvar/vitrin için modeller — x ekseni boyunca yatık, +z'ye bakar)
// =============================================================================
function gunModel(type, gold = false) {
  const g = new THREE.Group();
  const met = gold ? GOLD() : M('#1d1f22', 0.35, 0.8);
  const met2 = gold ? M('#b8862e', 0.3, 1) : M('#2c2f33', 0.4, 0.7);
  const wood = M('#6a3a1c', 0.5);
  const poly = M('#16171a', 0.6, 0.1);
  if (type === 'pistol') {
    B(g, 0.2, 0.038, 0.028, 0, 0.03, 0, met);
    B(g, 0.045, 0.1, 0.026, -0.065, -0.035, 0, gold ? M('#f2efe6', 0.4) : poly, [0, 0, -0.25]);
    TOR(g, 0.018, 0.004, -0.02, -0.005, 0, met2, null, Math.PI);
  } else if (type === 'deagle') {
    B(g, 0.26, 0.05, 0.034, 0, 0.035, 0, met);
    B(g, 0.055, 0.12, 0.03, -0.08, -0.04, 0, M('#1a1a1a', 0.6), [0, 0, -0.22]);
    TOR(g, 0.022, 0.005, -0.02, -0.005, 0, met2, null, Math.PI);
  } else if (type === 'uzi') {
    B(g, 0.26, 0.07, 0.04, 0, 0.02, 0, met);
    C(g, 0.012, 0.012, 0.08, 0.17, 0.03, 0, met2, [0, 0, Math.PI / 2]);
    B(g, 0.035, 0.2, 0.03, 0.01, -0.1, 0, poly);
    B(g, 0.2, 0.012, 0.012, -0.2, 0.03, 0, met2);
  } else if (type === 'ak') {
    B(g, 0.34, 0.07, 0.045, 0, 0.02, 0, met);
    C(g, 0.012, 0.012, 0.42, 0.38, 0.035, 0, met2, [0, 0, Math.PI / 2]);
    B(g, 0.22, 0.045, 0.05, 0.25, 0.005, 0, gold ? met2 : wood);
    B(g, 0.3, 0.07, 0.04, -0.3, -0.01, 0, gold ? met2 : wood, [0, 0, 0.12]);
    B(g, 0.04, 0.1, 0.035, -0.12, -0.06, 0, gold ? met2 : wood, [0, 0, -0.35]);
    for (let i = 0; i < 3; i++) B(g, 0.05, 0.07, 0.036, 0.06 + i * 0.02, -0.05 - i * 0.06, 0, met2, [0, 0, 0.18 + i * 0.12]);
    B(g, 0.015, 0.05, 0.015, 0.5, 0.07, 0, met2);
  } else if (type === 'shotgun') {
    C(g, 0.016, 0.016, 0.7, 0.2, 0.03, 0, met, [0, 0, Math.PI / 2]);
    C(g, 0.013, 0.013, 0.55, 0.14, 0.0, 0, met2, [0, 0, Math.PI / 2]);
    C(g, 0.024, 0.024, 0.2, 0.26, 0.0, 0, gold ? met2 : wood, [0, 0, Math.PI / 2]);
    B(g, 0.18, 0.06, 0.045, -0.2, 0.015, 0, met);
    B(g, 0.32, 0.07, 0.04, -0.44, -0.02, 0, gold ? met2 : wood, [0, 0, 0.15]);
  } else if (type === 'sniper') {
    C(g, 0.012, 0.014, 0.75, 0.33, 0.035, 0, met, [0, 0, Math.PI / 2]);
    B(g, 0.32, 0.06, 0.045, -0.05, 0.02, 0, met);
    C(g, 0.028, 0.028, 0.3, -0.02, 0.1, 0, M('#101012', 0.3, 0.6), [0, 0, Math.PI / 2]);
    C(g, 0.035, 0.03, 0.05, 0.14, 0.1, 0, M('#101012', 0.3, 0.6), [0, 0, Math.PI / 2]);
    B(g, 0.36, 0.08, 0.04, -0.36, -0.01, 0, gold ? met2 : M('#3d4a2a', 0.6), [0, 0, 0.1]);
    B(g, 0.04, 0.1, 0.035, -0.14, -0.06, 0, poly, [0, 0, -0.3]);
    B(g, 0.03, 0.12, 0.03, -0.02, -0.04, 0, met2);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}
function gunRackWall(gold) {
  return (g, ctx) => {
    const panel = gold ? M('#141416', 0.4) : M(tintHex(ctx, '#3a2216'), 0.55);
    RB(g, 2.2, 1.4, 0.06, 0.02, 0, 1.5, 0.03, panel);
    RB(g, 2.26, 1.46, 0.04, 0.02, 0, 1.5, 0.01, gold ? GOLD() : M('#1a1a1c', 0.4, 0.4));
    const layout = [['sniper', 2.04], ['ak', 1.8], ['shotgun', 1.56], ['uzi', 1.3], ['deagle', 1.08]];
    layout.forEach(([t, y], i) => {
      const gun = gunModel(t, gold);
      gun.position.set(t === 'uzi' || t === 'deagle' ? (i % 2 ? -0.5 : 0.5) : 0, y, 0.1);
      gun.scale.setScalar(t === 'uzi' || t === 'deagle' ? 1.3 : 1.25);
      g.add(gun);
      [-0.35, 0.35].forEach((x) => B(g, 0.02, 0.02, 0.07, x, y - 0.05, 0.08, gold ? GOLD() : M('#888', 0.3, 0.9)));
    });
    const p2 = gunModel('pistol', gold);
    p2.position.set(0.5, 1.3, 0.1);
    p2.scale.setScalar(1.4);
    g.add(p2);
    const p3 = gunModel('pistol', gold);
    p3.position.set(-0.5, 1.08, 0.1);
    p3.scale.setScalar(1.4);
    g.add(p3);
    if (gold) {
      const strip = emissiveMat('#ffc23d', 1.5);
      B(g, 2.1, 0.015, 0.02, 0, 2.18, 0.08, strip);
      return { light: { x: 0, y: 1.8, z: 0.6, color: '#ffc23d', intensity: 2, distance: 3.5 }, on: true, setOn() {}, noToggle: true };
    }
    return null;
  };
}
function gunCabinet(g, ctx) {
  const body = M(tintHex(ctx, '#141416'), 0.4, 0.3);
  B(g, 1.4, 2.1, 0.5, 0, 1.05, 0, body);
  B(g, 1.3, 1.9, 0.01, 0, 1.08, -0.2, M('#0a0a0c', 0.6));
  B(g, 1.3, 1.9, 0.01, 0, 1.08, 0.251, GLASS());
  [-0.34, 0.34].forEach((x) => B(g, 0.02, 0.06, 0.03, x, 1.1, 0.27, CHROME()));
  ['ak', 'shotgun', 'sniper', 'ak'].forEach((t, i) => {
    const gun = gunModel(t, false);
    gun.rotation.z = Math.PI / 2;
    gun.position.set(-0.48 + i * 0.32, 1.12, -0.05);
    gun.scale.setScalar(1.3);
    g.add(gun);
  });
  const led = emissiveMat('#ffffff', 1.4);
  B(g, 1.28, 0.02, 0.05, 0, 2.02, 0.0, led);
  return { light: { x: 0, y: 1.8, z: 0.6, color: '#e8f0ff', intensity: 1.8, distance: 3 }, on: true, setOn() {}, noToggle: true };
}
function safe(gold) {
  return (g) => {
    const m = gold ? GOLD() : M('#3a3d42', 0.35, 0.85);
    RB(g, 0.8, 1.0, 0.7, 0.03, 0, 0.5, 0, m);
    B(g, 0.66, 0.86, 0.02, 0, 0.5, 0.35, gold ? M('#b8862e', 0.25, 1) : M('#2a2d32', 0.35, 0.85));
    C(g, 0.09, 0.09, 0.04, 0.05, 0.55, 0.37, CHROME(), [Math.PI / 2, 0, 0], 32);
    C(g, 0.02, 0.02, 0.06, 0.05, 0.55, 0.39, BLACK(), [Math.PI / 2, 0, 0]);
    B(g, 0.18, 0.025, 0.03, 0.05, 0.36, 0.37, CHROME());
    [-0.25, 0.25].forEach((y) => B(g, 0.05, 0.08, 0.03, -0.3, 0.5 + y, 0.37, CHROME()));
  };
}
function ammoCrate(g) {
  const tx = labelTexture('ammo', 256, 128, (c, w, h) => {
    c.fillStyle = '#3d4a2a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8e2c8';
    c.font = 'bold 54px monospace';
    c.textAlign = 'center';
    c.fillText('AMMO', w / 2, 70);
    c.font = 'bold 20px monospace';
    c.fillText('7.62 x 39', w / 2, 104);
  });
  const face = own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 }));
  const side = M('#3d4a2a', 0.8);
  add(g, new THREE.BoxGeometry(0.9, 0.45, 0.5), [side, side, side, side, face, side], 0, 0.225, 0);
  add(g, new THREE.BoxGeometry(0.9, 0.4, 0.5), [side, side, side, side, face, side], 0.02, 0.65, 0, [0, 0.08, 0]);
  [[-0.3, 0.46], [0.3, 0.46]].forEach(([x, y]) => B(g, 0.12, 0.03, 0.52, x, y, 0, M('#222', 0.5, 0.6)));
}
function weaponTable(g) {
  const w = M('#2a2d32', 0.35, 0.8);
  B(g, 1.6, 0.05, 0.8, 0, 0.9, 0, w);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B(g, 0.05, 0.88, 0.05, a * 0.75, 0.44, b * 0.35, w));
  B(g, 1.5, 0.02, 0.7, 0, 0.3, 0, w);
  B(g, 1.2, 0.005, 0.55, 0, 0.927, 0, M('#1d3d2a', 0.95));
  const gun = gunModel('ak');
  gun.rotation.x = -Math.PI / 2;
  gun.position.set(0, 0.95, 0);
  gun.scale.setScalar(1.3);
  g.add(gun);
  for (let i = 0; i < 6; i++) C(g, 0.006, 0.006, 0.04, -0.4 + i * 0.03, 0.935, 0.2, GOLD(), [0, 0, Math.PI / 2]);
}

// =============================================================================
// ARABALAR
// =============================================================================
function pathShape(cmds) {
  const s = new THREE.Shape();
  cmds.forEach((c, i) => {
    if (i === 0) s.moveTo(c[1], c[2]);
    else if (c[0] === 'L') s.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') s.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === 'A') s.absarc(c[1], c[2], c[3], c[4], c[5], c[6]);
  });
  return s;
}
function extrudeX(shape, depth, bevel, m, g) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 18 });
  geo.translate(0, 0, -depth / 2);
  const o = new THREE.Mesh(geo, m);
  g.add(shade(o));
  return o;
}
function wheel(g, x, y, z, r, tw, { rimM = CHROME(), whitewall = false, spokes = 5, mirror = false } = {}) {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  g.add(w);
  const ri = r * 0.68;
  const tire = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[ri, -tw / 2], [r - 0.03, -tw / 2], [r, -tw / 2 + 0.035], [r, tw / 2 - 0.035], [r - 0.03, tw / 2], [ri, tw / 2]].map(([a, b]) => new THREE.Vector2(a, b)),
      36
    ),
    RUBBER()
  );
  tire.rotation.x = Math.PI / 2;
  w.add(shade(tire));
  const side = mirror ? -1 : 1;
  if (whitewall) {
    const ww = new THREE.Mesh(new THREE.RingGeometry(ri + 0.01, ri + 0.07, 32), M('#f0efe8', 0.6));
    ww.position.z = side * (tw / 2 + 0.001);
    if (mirror) ww.rotation.y = Math.PI;
    w.add(ww);
  }
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, tw * 0.8, 28), M('#1a1a1c', 0.4, 0.6));
  rim.rotation.x = Math.PI / 2;
  w.add(rim);
  const face = new THREE.Group();
  face.position.z = side * (tw * 0.4 + 0.005);
  w.add(face);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(ri * 0.9, 0.045, 0.03), rimM);
    sp.position.set(Math.cos(a) * ri * 0.5, Math.sin(a) * ri * 0.5, 0);
    sp.rotation.z = a;
    face.add(sp);
  }
  const lip = new THREE.Mesh(new THREE.TorusGeometry(ri - 0.01, 0.015, 8, 32), rimM);
  face.add(lip);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), rimM);
  hub.rotation.x = Math.PI / 2;
  face.add(hub);
  // fren diski + kaliper
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.8, ri * 0.8, 0.02, 24), M('#6a6d72', 0.3, 0.9));
  disc.rotation.x = Math.PI / 2;
  disc.position.z = side * 0.02;
  w.add(disc);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), M('#c8141e', 0.35, 0.3));
  cal.position.set(ri * 0.55, ri * 0.35, side * 0.04);
  w.add(cal);
  return w;
}
function plateTexture() {
  return labelTexture('plate', 256, 56, (c, w, h) => {
    c.fillStyle = '#f4f4f0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b3fa0';
    c.fillRect(0, 0, 30, h);
    c.fillStyle = '#fff';
    c.font = 'bold 14px sans-serif';
    c.fillText('TR', 5, 38);
    c.fillStyle = '#111';
    c.font = 'bold 36px sans-serif';
    c.fillText('34 NŞ 777', 40, 42);
    c.strokeStyle = '#111';
    c.lineWidth = 3;
    c.strokeRect(1, 1, w - 2, h - 2);
  });
}

// spec: L, Wd, y0, wr, tw, wx:[arka, ön], top (gövde üst kontur komutları ön-alttan arkaya),
//       cab: {A,B,C,D, ctrl} (ön cam alt, ön cam üst, arka tavan, arka cam alt), lights...
function carBuild(spec) {
  return (g, ctx) => {
    const t = ctx.tint || TINTS.car[0];
    const paint = own(new THREE.MeshPhysicalMaterial({ color: t.c, roughness: t.r ?? 0.22, metalness: t.m ?? 0.55, clearcoat: 1, clearcoatRoughness: 0.05 }));
    const glassDark = M('#0b0e14', 0.04, 0.9);
    const trim = M('#0a0a0b', 0.45, 0.3);
    const car = new THREE.Group();
    car.rotation.y = -Math.PI / 2; // x ekseni (uzunluk) → dünya +z (ön)
    g.add(car);
    const { L, Wd, y0, wr, tw } = spec;
    const bev = 0.1;
    const arch = wr + 0.06 + bev;
    const [rx, fx] = spec.wx;
    const bottom = [
      ['M', -L / 2 + 0.12, y0],
      ['L', rx - arch, y0], ['A', rx, wr, arch, Math.PI, 0, true],
      ['L', fx - arch, y0], ['A', fx, wr, arch, Math.PI, 0, true],
      ['L', L / 2 - 0.12, y0],
    ];
    const body = extrudeX(pathShape([...bottom, ...spec.top]), Wd - 2 * bev, bev, paint, car);
    body.userData.paint = true;
    // şasi/iç kemer (davlumbaz içi karanlık görünsün)
    B(car, L - 0.5, y0 + 0.28, Wd - 2 * tw - 0.12, 0, (y0 + 0.28) / 2 + 0.08, 0, trim);
    // kabin
    const { A, Bp, Cp, D, ctrl } = spec.cab;
    const cabShape = pathShape([['M', A[0], A[1]], ['L', Bp[0], Bp[1]], ['Q', ctrl[0], ctrl[1], Cp[0], Cp[1]], ['L', D[0], D[1]], ['L', A[0], A[1]]]);
    const cw = Wd - 0.34;
    extrudeX(cabShape, cw - 2 * 0.06, 0.06, paint, car);
    const sideZ = cw / 2 + 0.004;
    // yan camlar (kabin şeklinin içe küçültülmüşü)
    const pts = [A, Bp, [ctrl[0] * 0.5 + (Bp[0] + Cp[0]) * 0.25, ctrl[1] * 0.5 + (Bp[1] + Cp[1]) * 0.25], Cp, D];
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const inset = pts.map(([x, y]) => [cx + (x - cx) * 0.84, cy + (y - cy) * 0.8 - 0.01]);
    const winShape = new THREE.Shape();
    inset.forEach(([x, y], i) => (i ? winShape.lineTo(x, y) : winShape.moveTo(x, y)));
    [-1, 1].forEach((s) => {
      const wm = new THREE.Mesh(new THREE.ShapeGeometry(winShape), M('#0b0e14', 0.04, 0.9, { side: THREE.DoubleSide }));
      wm.position.z = s * sideZ;
      car.add(wm);
      // B direği
      const bx = (inset[1][0] + inset[3][0]) / 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.01), trim);
      post.position.set(bx, (inset[0][1] + inset[2][1]) / 2, s * (sideZ + 0.002));
      car.add(post);
      // kapı kolları + ayna
      const hdl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.02), CHROME());
      hdl.position.set(bx + 0.25, A[1] - 0.12, s * (Wd / 2 + 0.005));
      car.add(hdl);
      const mir = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.1, 0.14, 2, 0.03), paint);
      mir.position.set(A[0] - 0.12, A[1] + 0.06, s * (cw / 2 + 0.12));
      car.add(shade(mir));
      // kapı çizgisi
      const dl = new THREE.Mesh(new THREE.BoxGeometry(0.008, A[1] - y0 - 0.1, 0.005), trim);
      dl.position.set(bx - 0.02, (A[1] + y0) / 2 + 0.05, s * (Wd / 2 + 0.001));
      car.add(dl);
    });
    // ön/arka cam (düz levha)
    const glassPanel = (P, Q, sgn) => {
      const dx = Q[0] - P[0];
      const dy = Q[1] - P[1];
      const len = Math.hypot(dx, dy);
      const nx = -dy / len * sgn;
      const ny = dx / len * sgn;
      const o = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.01, cw - 0.02), glassDark);
      o.position.set((P[0] + Q[0]) / 2 + nx * 0.065, (P[1] + Q[1]) / 2 + ny * 0.065, 0);
      o.rotation.z = Math.atan2(dy, dx);
      car.add(o);
    };
    glassPanel(A, Bp, -1);
    glassPanel(Cp, D, -1);
    // farlar / stoplar
    const hl = own(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0.25, roughness: 0.1 }));
    const tl = own(new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#ff1010', emissiveIntensity: 0.6, roughness: 0.2 }));
    const [hlx, hly] = spec.hl;
    const [tlx, tly] = spec.tl;
    [-1, 1].forEach((s) => {
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.1, 0.38, 2, 0.03), hl);
      h.position.set(hlx + 0.04 + bev, hly, s * (Wd / 2 - 0.32));
      car.add(h);
      const tb = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.08, 0.42, 2, 0.02), tl);
      tb.position.set(tlx - 0.04 - bev, tly, s * (Wd / 2 - 0.32));
      car.add(tb);
    });
    // ızgara + plakalar
    const grille = new THREE.Mesh(new RoundedBoxGeometry(0.16, spec.grilleH || 0.14, Wd * 0.45, 2, 0.03), M('#0b0b0c', 0.4, 0.6));
    grille.position.set(hlx + 0.02 + bev, hly - 0.14, 0);
    car.add(grille);
    // tamponlar + marşpiyel
    const fb = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.14, Wd - 0.06, 2, 0.05), trim);
    fb.position.set(L / 2 + bev - 0.04, y0 + 0.1, 0);
    car.add(shade(fb));
    const rb = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.14, Wd - 0.06, 2, 0.05), trim);
    rb.position.set(-L / 2 - bev + 0.04, y0 + 0.1, 0);
    car.add(shade(rb));
    [-1, 1].forEach((sd) => {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(spec.wx[1] - spec.wx[0] - 2 * arch - 0.1, 0.07, 0.05), trim);
      sk.position.set((spec.wx[0] + spec.wx[1]) / 2, y0 + 0.04, sd * (Wd / 2 + 0.005));
      car.add(sk);
    });
    const pm = own(new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.4 }));
    [[spec.plateF, 1], [spec.plateR, -1]].forEach(([p, s]) => {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), pm);
      pl.position.set(p[0] + s * (bev + 0.012), p[1], 0);
      pl.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.add(pl);
    });
    // egzoz
    [-1, 1].forEach((s) => {
      if (!spec.dualExhaust && s < 0) return;
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 16), CHROME());
      ex.rotation.z = Math.PI / 2;
      ex.position.set(-L / 2 - bev + 0.02, y0 + 0.02, s * (Wd / 2 - 0.35));
      car.add(ex);
    });
    // tekerlekler
    const z = Wd / 2 - tw / 2 - 0.015;
    [rx, fx].forEach((x) => [-1, 1].forEach((s) => wheel(car, x, wr, s * z, wr, tw, { whitewall: spec.whitewall, spokes: spec.spokes || 5, mirror: s < 0, rimM: spec.rimM ? spec.rimM() : CHROME() })));
    if (spec.extra) spec.extra(car, paint, trim);
    let on = false;
    return {
      act: 'Farları aç/kapat',
      get on() { return on; },
      setOn(v) { on = v; hl.emissiveIntensity = v ? 4 : 0.25; tl.emissiveIntensity = v ? 1.5 : 0.6; },
      light: { x: 0, y: 0.7, z: L / 2 + 1.2, color: '#fff0c8', intensity: 6, distance: 7 },
    };
  };
}

const CAR_SPECS = {
  sedan: {
    L: 4.7, Wd: 1.85, y0: 0.3, wr: 0.34, tw: 0.24, wx: [-1.45, 1.45],
    top: [['Q', 2.4, 0.3, 2.4, 0.5], ['L', 2.38, 0.68], ['Q', 2.35, 0.84, 2.0, 0.88], ['L', 0.95, 0.98], ['L', -1.55, 1.0], ['Q', -2.3, 1.0, -2.36, 0.85], ['L', -2.4, 0.5], ['Q', -2.4, 0.3, -2.23, 0.3]],
    cab: { A: [0.98, 0.97], Bp: [0.18, 1.42], Cp: [-0.95, 1.45], D: [-1.62, 0.99], ctrl: [-0.38, 1.52] },
    hl: [2.32, 0.7], tl: [-2.35, 0.8], plateF: [2.42, 0.45], plateR: [-2.42, 0.58], dualExhaust: true,
  },
  sport: {
    L: 4.45, Wd: 1.92, y0: 0.24, wr: 0.34, tw: 0.27, wx: [-1.36, 1.4], spokes: 10,
    top: [['Q', 2.28, 0.24, 2.3, 0.42], ['L', 2.27, 0.56], ['Q', 2.2, 0.72, 1.8, 0.76], ['L', 0.7, 0.88], ['L', -1.5, 0.92], ['Q', -2.2, 0.95, -2.23, 0.78], ['L', -2.25, 0.42], ['Q', -2.25, 0.24, -2.1, 0.24]],
    cab: { A: [0.75, 0.87], Bp: [-0.15, 1.26], Cp: [-0.8, 1.27], D: [-1.95, 0.92], ctrl: [-0.45, 1.33] },
    hl: [2.2, 0.62], tl: [-2.22, 0.72], plateF: [2.31, 0.38], plateR: [-2.26, 0.5], dualExhaust: true,
    extra: (car, paint) => { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 1.5), paint); sp.position.set(-2.05, 0.97, 0); car.add(sp); },
  },
  suv: {
    L: 4.85, Wd: 1.98, y0: 0.44, wr: 0.42, tw: 0.3, wx: [-1.5, 1.5],
    top: [['Q', 2.45, 0.44, 2.45, 0.66], ['L', 2.43, 0.95], ['Q', 2.4, 1.12, 2.1, 1.14], ['L', 1.05, 1.22], ['L', -2.2, 1.24], ['Q', -2.42, 1.24, -2.43, 1.05], ['L', -2.45, 0.6], ['Q', -2.45, 0.44, -2.3, 0.44]],
    cab: { A: [1.08, 1.21], Bp: [0.45, 1.84], Cp: [-2.15, 1.86], D: [-2.3, 1.25], ctrl: [-0.9, 1.9] },
    hl: [2.4, 0.95], tl: [-2.42, 1.05], plateF: [2.47, 0.62], plateR: [-2.47, 0.8], grilleH: 0.24,
    extra: (car) => { [-1, 1].forEach((s) => { const r = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.04, 0.05), CHROME()); r.position.set(-0.7, 1.92, s * 0.75); car.add(r); }); },
  },
  muscle: {
    L: 4.95, Wd: 1.9, y0: 0.3, wr: 0.36, tw: 0.3, wx: [-1.5, 1.6], spokes: 6,
    top: [['Q', 2.5, 0.3, 2.5, 0.48], ['L', 2.49, 0.82], ['L', 2.3, 0.86], ['L', 0.55, 0.96], ['L', -1.8, 0.98], ['Q', -2.45, 0.98, -2.47, 0.84], ['L', -2.48, 0.48], ['Q', -2.48, 0.3, -2.3, 0.3]],
    cab: { A: [0.58, 0.95], Bp: [-0.1, 1.34], Cp: [-1.05, 1.36], D: [-1.75, 0.98], ctrl: [-0.55, 1.4] },
    hl: [2.47, 0.7], tl: [-2.46, 0.8], plateF: [2.52, 0.42], plateR: [-2.5, 0.56], dualExhaust: true, grilleH: 0.2,
    extra: (car, paint) => {
      const sc = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.12, 0.45, 2, 0.04), M('#0a0a0b', 0.5));
      sc.position.set(1.4, 0.95, 0);
      car.add(sc);
      const dk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.6), paint);
      dk.position.set(-2.4, 1.02, 0);
      car.add(dk);
      [-1, 1].forEach((s) => { const st = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.005, 0.18), M('#f4f4f0', 0.3)); st.position.set(0.1, 0.99, s * 0.18); car.add(st); });
    },
  },
  super: {
    L: 4.6, Wd: 2.0, y0: 0.18, wr: 0.35, tw: 0.3, wx: [-1.42, 1.38], spokes: 10, rimM: () => M('#1a1a1c', 0.2, 0.9),
    top: [['Q', 2.32, 0.18, 2.33, 0.3], ['L', 2.25, 0.46], ['Q', 1.9, 0.62, 1.2, 0.72], ['L', 0.9, 0.76], ['L', -1.6, 0.9], ['Q', -2.28, 0.95, -2.3, 0.7], ['L', -2.3, 0.3], ['Q', -2.3, 0.18, -2.15, 0.18]],
    cab: { A: [0.95, 0.75], Bp: [-0.05, 1.12], Cp: [-0.75, 1.13], D: [-1.75, 0.9], ctrl: [-0.4, 1.18] },
    hl: [2.12, 0.5], tl: [-2.28, 0.72], plateF: [2.34, 0.26], plateR: [-2.31, 0.45], dualExhaust: true, grilleH: 0.1,
    extra: (car, paint) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 1.9), M('#0e0e10', 0.3, 0.5));
      wing.position.set(-2.05, 1.22, 0);
      car.add(wing);
      [-0.6, 0.6].forEach((z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.03), M('#0e0e10', 0.3, 0.5)); p.position.set(-2.0, 1.06, z); car.add(p); });
      [-1, 1].forEach((s) => { const intake = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.02), M('#050505', 0.5)); intake.position.set(-0.9, 0.5, s * 1.0); car.add(intake); });
      void paint;
    },
  },
  classic: {
    L: 4.7, Wd: 1.88, y0: 0.32, wr: 0.36, tw: 0.24, wx: [-1.5, 1.45], whitewall: true, spokes: 8,
    top: [['Q', 2.45, 0.32, 2.46, 0.52], ['Q', 2.45, 0.9, 1.9, 0.95], ['L', 1.0, 1.0], ['L', -1.4, 1.0], ['Q', -2.4, 1.0, -2.42, 0.62], ['Q', -2.42, 0.32, -2.2, 0.32]],
    cab: { A: [0.95, 0.99], Bp: [0.3, 1.5], Cp: [-0.9, 1.52], D: [-1.5, 1.0], ctrl: [-0.3, 1.62] },
    hl: [2.4, 0.78], tl: [-2.38, 0.78], plateF: [2.47, 0.44], plateR: [-2.44, 0.5],
    extra: (car) => { [[2.44, 1], [-2.42, -1]].forEach(([x]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.9), CHROME()); b.position.set(x + (x > 0 ? 0.04 : -0.04), 0.4, 0); car.add(b); }); },
  },
  pickup: {
    L: 5.3, Wd: 2.0, y0: 0.46, wr: 0.42, tw: 0.3, wx: [-1.75, 1.7],
    top: [['Q', 2.65, 0.46, 2.65, 0.7], ['L', 2.63, 1.02], ['Q', 2.58, 1.18, 2.3, 1.2], ['L', 1.2, 1.25], ['L', -2.55, 1.25], ['L', -2.65, 1.2], ['L', -2.65, 0.6], ['Q', -2.65, 0.46, -2.5, 0.46]],
    cab: { A: [1.22, 1.24], Bp: [0.6, 1.9], Cp: [-0.6, 1.92], D: [-0.72, 1.25], ctrl: [0.0, 1.97] },
    hl: [2.6, 1.0], tl: [-2.62, 1.05], plateF: [2.67, 0.65], plateR: [-2.67, 0.75], grilleH: 0.3,
    extra: (car) => {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.02, 1.65), M('#141416', 0.9));
      bed.position.set(-1.68, 1.265, 0);
      car.add(bed);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 1.7), CHROME());
      bar.position.set(-0.85, 1.45, 0);
      car.add(bar);
    },
  },
};
const carSeats = (spec) => [[-0.4, spec.y0 + 0.35, spec.Wd * 0.22 - 0.2]];

// =============================================================================
// MOTORLAR
// =============================================================================
function motoWheel(g, x, r, t, knobby = false) {
  const w = new THREE.Group();
  w.position.set(x, r, 0);
  g.add(w);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r - t, t, 14, 40), RUBBER());
  w.add(shade(tire));
  if (knobby) {
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, t * 1.8), RUBBER());
      k.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      k.rotation.z = a;
      w.add(k);
    }
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - t * 1.9, 0.015, 8, 36), CHROME());
  w.add(rim);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry((r - t * 2) * 2, 0.02, 0.012), M('#1a1a1c', 0.3, 0.8));
    sp.rotation.z = (i / 6) * Math.PI;
    w.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16), CHROME());
  hub.rotation.x = Math.PI / 2;
  w.add(hub);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.01, 24), M('#8a8d92', 0.3, 0.9));
  disc.rotation.x = Math.PI / 2;
  disc.position.z = 0.07;
  w.add(disc);
}
function motoBuild(type) {
  return (g, ctx) => {
    const t = ctx.tint || TINTS.car[0];
    const paint = own(new THREE.MeshPhysicalMaterial({ color: t.c, roughness: t.r ?? 0.22, metalness: t.m ?? 0.55, clearcoat: 1, clearcoatRoughness: 0.05 }));
    const blk = M('#141416', 0.5, 0.3);
    const m = new THREE.Group();
    m.rotation.y = -Math.PI / 2;
    g.add(m);
    const hl = own(new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4d6', emissiveIntensity: 0.3 }));
    if (type === 'sport') {
      motoWheel(m, -0.7, 0.31, 0.065);
      motoWheel(m, 0.72, 0.31, 0.06);
      [-1, 1].forEach((s) => {
        TUBE(m, [0.72, 0.31, s * 0.09], [0.5, 0.95, s * 0.09], 0.025, CHROME());
        TUBE(m, [-0.7, 0.31, s * 0.1], [-0.05, 0.48, s * 0.1], 0.03, blk);
      });
      RB(m, 0.5, 0.35, 0.3, 0.06, 0.02, 0.52, 0, M('#2a2d32', 0.4, 0.8));
      RB(m, 0.55, 0.5, 0.42, 0.12, 0.42, 0.78, 0, paint, [0, 0, -0.5]);
      RB(m, 0.5, 0.24, 0.36, 0.1, 0.05, 0.94, 0, paint);
      RB(m, 0.42, 0.08, 0.28, 0.04, -0.33, 0.9, 0, blk);
      RB(m, 0.5, 0.18, 0.24, 0.07, -0.62, 1.0, 0, paint, [0, 0, 0.28]);
      B(m, 0.02, 0.28, 0.32, 0.6, 1.08, 0, M('#1a2530', 0.05, 0.3, { transparent: true, opacity: 0.6 }), [0, 0, -0.5]);
      TUBE(m, [0.45, 1.0, -0.26], [0.45, 1.0, 0.26], 0.015, blk);
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.08, 0.2, 2, 0.02), hl);
      h.position.set(0.7, 0.86, 0);
      m.add(h);
      C(m, 0.06, 0.07, 0.4, -0.45, 0.5, 0.18, CHROME(), [0, 0, Math.PI / 2 - 0.2]);
    } else if (type === 'chopper') {
      motoWheel(m, -0.75, 0.34, 0.1);
      motoWheel(m, 1.05, 0.33, 0.055);
      [-1, 1].forEach((s) => {
        TUBE(m, [1.05, 0.33, s * 0.08], [0.55, 1.08, s * 0.08], 0.022, CHROME());
        TUBE(m, [-0.75, 0.34, s * 0.12], [-0.1, 0.4, s * 0.12], 0.028, CHROME());
        TUBE(m, [0.55, 1.08, s * 0.08], [0.35, 1.45, s * 0.35], 0.018, CHROME());
      });
      SP(m, 0.22, 0.25, 0.88, 0, paint, 1.5, 0.7, 0.8);
      RB(m, 0.45, 0.1, 0.32, 0.05, -0.25, 0.68, 0, M('#3a2216', 0.6));
      RB(m, 0.2, 0.25, 0.3, 0.05, -0.48, 0.8, 0, M('#3a2216', 0.6));
      C(m, 0.1, 0.12, 0.35, 0.12, 0.52, 0, CHROME(), [0, 0, 0.45]);
      C(m, 0.1, 0.12, 0.35, -0.08, 0.52, 0, CHROME(), [0, 0, -0.45]);
      B(m, 0.35, 0.2, 0.2, 0.02, 0.35, 0, M('#1f2124', 0.4, 0.8));
      TUBE(m, [0.1, 0.33, 0.18], [-1.0, 0.36, 0.2], 0.04, CHROME());
      TUBE(m, [0.0, 0.28, 0.2], [-1.0, 0.26, 0.22], 0.04, CHROME());
      TOR(m, 0.36, 0.035, -0.75, 0.36, 0, paint, [0, 0, 0.3], Math.PI * 0.7);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), hl);
      h.position.set(0.66, 1.0, 0);
      h.scale.set(0.6, 1, 1);
      m.add(h);
    } else if (type === 'scooter') {
      motoWheel(m, -0.55, 0.22, 0.06);
      motoWheel(m, 0.62, 0.22, 0.06);
      RB(m, 0.7, 0.08, 0.36, 0.03, 0.05, 0.3, 0, blk);
      RB(m, 0.18, 0.75, 0.46, 0.08, 0.5, 0.65, 0, paint, [0, 0, -0.15]);
      RB(m, 0.72, 0.42, 0.44, 0.16, -0.38, 0.48, 0, paint);
      RB(m, 0.58, 0.1, 0.32, 0.05, -0.32, 0.74, 0, M('#3a2216', 0.6));
      TUBE(m, [0.6, 0.3, 0], [0.55, 1.05, 0], 0.03, CHROME());
      TUBE(m, [0.55, 1.05, -0.3], [0.55, 1.05, 0.3], 0.018, CHROME());
      RB(m, 0.14, 0.14, 0.24, 0.04, 0.6, 1.02, 0, paint);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), hl);
      h.rotation.z = Math.PI / 2;
      h.position.set(0.68, 1.02, 0);
      m.add(h);
      C(m, 0.28, 0.28, 0.2, -0.75, 0.9, 0, M('#ececec', 0.3), [Math.PI / 2, 0, 0], 4);
    } else {
      // cross / enduro
      motoWheel(m, -0.72, 0.36, 0.055, true);
      motoWheel(m, 0.78, 0.38, 0.05, true);
      [-1, 1].forEach((s) => {
        TUBE(m, [0.78, 0.38, s * 0.1], [0.5, 1.2, s * 0.1], 0.028, M('#d9a93c', 0.3, 0.9));
        TUBE(m, [-0.72, 0.36, s * 0.1], [0.0, 0.55, s * 0.1], 0.028, blk);
        RB(m, 0.4, 0.3, 0.05, 0.02, 0.28, 0.9, s * 0.17, paint);
      });
      B(m, 0.3, 0.28, 0.24, 0.05, 0.55, 0, M('#2a2d32', 0.4, 0.8));
      RB(m, 0.9, 0.1, 0.26, 0.04, -0.18, 1.02, 0, blk);
      RB(m, 0.55, 0.06, 0.18, 0.03, 0.85, 0.82, 0, paint, [0, 0, 0.25]);
      RB(m, 0.5, 0.08, 0.2, 0.03, -0.72, 1.02, 0, paint, [0, 0, 0.2]);
      TUBE(m, [0.47, 1.25, -0.38], [0.47, 1.25, 0.38], 0.016, blk);
      RB(m, 0.14, 0.22, 0.24, 0.04, 0.62, 1.1, 0, paint, [0, 0, -0.3]);
      TUBE(m, [0.1, 0.5, 0.16], [-0.8, 0.95, 0.16], 0.04, CHROME());
      const num = labelTexture('mx', 64, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText('34', w / 2, 48); });
      PLANE(m, 0.2, 0.2, own(new THREE.MeshStandardMaterial({ map: num })), 0.64, 1.1, 0.125, [0, 0, -0.3]);
    }
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), blk);
    stand.position.set(-0.1, 0.16, 0.2);
    stand.rotation.x = 0.5;
    m.add(stand);
    let on = false;
    return {
      act: 'Farı aç/kapat',
      get on() { return on; },
      setOn(v) { on = v; hl.emissiveIntensity = v ? 4 : 0.3; },
      light: { x: 0, y: 0.9, z: 1.5, color: '#fff0c8', intensity: 4, distance: 5 },
    };
  };
}

// =============================================================================
// GARAJ
// =============================================================================
function toolWall(g) {
  const tx = labelTexture('peg', 256, 128, (c, w, h) => {
    c.fillStyle = '#b89968';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,.45)';
    for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) { c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
  });
  const pm = own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 }));
  B(g, 2.0, 1.1, 0.03, 0, 1.5, 0.015, pm);
  const red = M('#c8141e', 0.4, 0.3);
  const tools = [
    () => { const t = new THREE.Group(); B(t, 0.03, 0.3, 0.02, 0, 0, 0, red); B(t, 0.1, 0.04, 0.03, 0, 0.16, 0, STEEL()); return t; },
    () => { const t = new THREE.Group(); B(t, 0.025, 0.25, 0.02, 0, 0, 0, STEEL()); TOR(t, 0.03, 0.01, 0, 0.14, 0, STEEL()); return t; },
    () => { const t = new THREE.Group(); B(t, 0.03, 0.18, 0.025, 0, -0.05, 0, M('#e0a800', 0.5)); B(t, 0.012, 0.16, 0.012, 0, 0.12, 0, STEEL()); return t; },
    () => { const t = new THREE.Group(); B(t, 0.3, 0.12, 0.02, 0, 0, 0, STEEL()); B(t, 0.1, 0.04, 0.03, -0.18, 0.03, 0, M('#141416', 0.6)); return t; },
  ];
  for (let i = 0; i < 12; i++) {
    const t = tools[i % 4]();
    t.position.set(-0.85 + (i % 6) * 0.34, i < 6 ? 1.75 : 1.3, 0.05);
    t.rotation.z = (i % 3 - 1) * 0.1;
    g.add(t);
  }
}
function tireStack(g) {
  for (let i = 0; i < 4; i++) {
    const t = TOR(g, 0.26, 0.1, (i % 2) * 0.03, 0.1 + i * 0.2, 0, RUBBER(), [Math.PI / 2, 0, 0]);
    t.rotation.z = i * 0.3;
  }
}
function workbench(g) {
  const w = M('#8a6a42', 0.7);
  B(g, 2.0, 0.08, 0.75, 0, 0.9, 0, w);
  B(g, 1.9, 0.6, 0.65, 0, 0.45, -0.02, M('#c8141e', 0.4, 0.4));
  for (let i = 0; i < 4; i++) {
    B(g, 0.9, 0.12, 0.01, -0.47, 0.22 + i * 0.14, 0.31, M('#a50f18', 0.4, 0.4));
    B(g, 0.18, 0.02, 0.02, -0.47, 0.24 + i * 0.14, 0.325, CHROME());
  }
  B(g, 0.9, 0.55, 0.01, 0.47, 0.45, 0.31, M('#a50f18', 0.4, 0.4));
  B(g, 0.2, 0.14, 0.14, 0.7, 1.0, 0.25, M('#2a4a7a', 0.4, 0.6));
  TUBE(g, [0.7, 1.0, 0.32], [0.7, 1.0, 0.45], 0.012, STEEL());
  B(g, 0.45, 0.2, 0.22, -0.5, 1.04, -0.1, M('#c8141e', 0.4, 0.4));
}
function barrel(g, ctx) {
  const m = M(tintHex(ctx, '#1f4a4a'), 0.4, 0.6);
  C(g, 0.33, 0.33, 0.92, 0, 0.46, 0, m);
  [0.18, 0.74].forEach((y) => C(g, 0.342, 0.342, 0.05, 0, y, 0, M('#111', 0.4, 0.8)));
  C(g, 0.3, 0.3, 0.02, 0, 0.93, 0, M('#2a2a2e', 0.3, 0.8));
}
function crate(g) {
  const w = M('#9a7443', 0.85);
  const d = M('#6a4a26', 0.9);
  B(g, 0.86, 0.86, 0.86, 0, 0.43, 0, w);
  [-1, 1].forEach((a) => [-1, 1].forEach((b) => B(g, 0.1, 0.92, 0.1, a * 0.43, 0.46, b * 0.43, d)));
  [0.04, 0.86].forEach((y) => B(g, 0.92, 0.08, 0.92, 0, y, 0, d));
}
function toolChest(g) {
  RB(g, 0.9, 1.1, 0.5, 0.02, 0, 0.6, 0, M('#c8141e', 0.35, 0.4));
  for (let i = 0; i < 6; i++) {
    B(g, 0.82, 0.14, 0.01, 0, 0.18 + i * 0.16, 0.251, M('#a50f18', 0.35, 0.4));
    B(g, 0.5, 0.02, 0.025, 0, 0.23 + i * 0.16, 0.26, CHROME());
  }
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => C(g, 0.04, 0.04, 0.03, a * 0.38, 0.04, b * 0.2, BLACK(), [Math.PI / 2, 0, 0]));
}

// =============================================================================
// DEKOR
// =============================================================================
function potLathe(g, r, h, m) {
  LATHE(g, [[0, 0], [r * 0.75, 0], [r, h], [r * 1.05, h], [r * 1.05, h + 0.02], [r * 0.95, h + 0.02], [0, h - 0.05]], m);
}
function plantBig(g, ctx) {
  potLathe(g, 0.24, 0.45, M(tintHex(ctx, '#e8e4dc'), 0.4));
  C(g, 0.22, 0.22, 0.02, 0, 0.44, 0, M('#3a2a1c', 1));
  const leaf = M('#2f6b2f', 0.6);
  const leaf2 = M('#3f8a3a', 0.6);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4;
    const h = 0.8 + (i % 4) * 0.25;
    const x = Math.cos(a) * 0.3;
    const z = Math.sin(a) * 0.3;
    TUBE(g, [0, 0.45, 0], [x * 0.8, h, z * 0.8], 0.012, M('#3a5a2a', 0.7));
    const l = SP(g, 0.2, x, h + 0.05, z, i % 2 ? leaf : leaf2, 1, 0.12, 0.55);
    l.rotation.set(0.5 * Math.sin(a), -a, 0.4);
  }
}
function plantSmall(g, ctx) {
  potLathe(g, 0.14, 0.25, M(tintHex(ctx, '#b0643a'), 0.7));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const l = add(g, new THREE.ConeGeometry(0.04, 0.3, 8), M('#4a7a3a', 0.5), Math.cos(a) * 0.05, 0.38, Math.sin(a) * 0.05);
    l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
  }
}
function palm(g) {
  potLathe(g, 0.3, 0.5, M('#1b1b1d', 0.4));
  for (let i = 0; i < 6; i++) C(g, 0.06 - i * 0.004, 0.07 - i * 0.004, 0.3, Math.sin(i) * 0.02, 0.62 + i * 0.28, 0, M('#6a4a2a', 0.9), [0.03 * i, 0, 0.02 * i]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const f = SP(g, 0.45, Math.cos(a) * 0.4, 2.15, Math.sin(a) * 0.4, M(i % 2 ? '#2f6b2f' : '#3a7a34', 0.6), 1, 0.05, 0.22);
    f.rotation.set(0, -a, -0.45);
  }
}
function rugBuild(round) {
  return (g, ctx) => {
    const col = tintHex(ctx, '#6b1a22');
    const tx = labelTexture(`rug_${round}_${col}`, 512, 360, (c, w, h, r) => {
      c.fillStyle = col;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#d4a53a';
      c.lineWidth = 10;
      c.strokeRect(18, 18, w - 36, h - 36);
      c.lineWidth = 3;
      c.strokeRect(38, 38, w - 76, h - 76);
      c.beginPath();
      c.moveTo(w / 2, 60); c.lineTo(w - 90, h / 2); c.lineTo(w / 2, h - 60); c.lineTo(90, h / 2); c.closePath();
      c.stroke();
      c.fillStyle = 'rgba(212,165,58,.8)';
      c.beginPath(); c.arc(w / 2, h / 2, 24, 0, 7); c.fill();
      for (let i = 0; i < 12; i++) {
        c.beginPath();
        c.arc(60 + (i % 6) * 78, i < 6 ? 60 : h - 60, 6, 0, 7);
        c.fill();
      }
      for (let i = 0; i < 6000; i++) {
        c.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
        c.fillRect(r() * w, r() * h, 2, 2);
      }
    });
    const m = own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.95 }));
    const geo = round ? new THREE.CircleGeometry(1.2, 48) : new THREE.PlaneGeometry(3.2, 2.2);
    const o = new THREE.Mesh(geo, m);
    o.rotation.x = -Math.PI / 2;
    o.position.y = 0.012;
    o.receiveShadow = true;
    g.add(o);
  };
}
function floorLamp(g, ctx) {
  const m = tintHex(ctx, '#d9a93c');
  const met = M(m, 0.3, 0.9);
  C(g, 0.2, 0.22, 0.04, 0, 0.02, 0, met);
  C(g, 0.018, 0.018, 1.6, 0, 0.8, 0, met);
  const sm = own(new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: '#ffb060', emissiveIntensity: 1.5, side: THREE.DoubleSide }));
  add(g, new THREE.CylinderGeometry(0.16, 0.3, 0.36, 28, 1, true), sm, 0, 1.65, 0);
  let on = true;
  return {
    act: 'Lambayı aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; sm.emissiveIntensity = v ? 1.5 : 0.05; },
    light: { x: 0, y: 1.6, z: 0, color: '#ffb060', intensity: 4, distance: 7 },
  };
}
function neonBuild(text, font = 'italic bold 110px Georgia, serif') {
  return (g, ctx) => {
    const col = tintHex(ctx, '#ff2d8a');
    const tx = labelTexture(`neon_${text}_${col}`, 512, 192, (c, w, h) => {
      c.fillStyle = '#060608';
      c.fillRect(0, 0, w, h);
      c.font = font;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = col;
      c.shadowBlur = 30;
      c.fillStyle = col;
      c.fillText(text, w / 2, h / 2 + 6);
      c.shadowBlur = 8;
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.75;
      c.fillText(text, w / 2, h / 2 + 6);
    });
    const m = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 1.5 }));
    B(g, 1.9, 0.75, 0.05, 0, 1.7, 0.025, M('#0a0a0e', 0.4, 0.5));
    PLANE(g, 1.84, 0.7, m, 0, 1.7, 0.052);
    let on = true;
    return {
      act: 'Neonu aç/kapat',
      get on() { return on; },
      setOn(v) { on = v; m.emissiveIntensity = v ? 1.5 : 0.03; },
      light: { x: 0, y: 1.7, z: 0.7, color: col, intensity: 3, distance: 5 },
    };
  };
}
function painting(g, ctx) {
  const idx = ctx.ti || 0;
  const base = tintHex(ctx, '#ff6a3d');
  const tx = labelTexture(`art_${idx}`, 256, 192, (c, w, h, r) => {
    const gr = c.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, base);
    gr.addColorStop(1, '#0a0a14');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      c.globalAlpha = 0.3 + r() * 0.5;
      c.fillStyle = ['#ffffff', '#111111', base, '#e8b04a', '#19e8ff'][Math.floor(r() * 5)];
      if (idx % 2) { c.beginPath(); c.arc(r() * w, r() * h, 8 + r() * 40, 0, 7); c.fill(); } else c.fillRect(r() * w, r() * h, 10 + r() * 80, 4 + r() * 30);
    }
    c.globalAlpha = 1;
  });
  RB(g, 1.3, 0.98, 0.05, 0.01, 0, 1.6, 0.025, GOLD());
  PLANE(g, 1.2, 0.88, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 })), 0, 1.6, 0.052);
}
function aquarium(g) {
  B(g, 1.6, 0.8, 0.5, 0, 0.4, 0, M('#141416', 0.4));
  const water = own(new THREE.MeshStandardMaterial({ color: '#2a8ad6', emissive: '#0b5fa0', emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.05 }));
  B(g, 1.56, 0.66, 0.46, 0, 1.14, 0, water);
  B(g, 1.6, 0.7, 0.5, 0, 1.15, 0, GLASS());
  B(g, 1.62, 0.06, 0.52, 0, 1.52, 0, M('#141416', 0.4));
  B(g, 1.5, 0.05, 0.4, 0, 0.83, 0, M('#d9c7a4', 1));
  for (let i = 0; i < 6; i++) SP(g, 0.05, -0.6 + i * 0.24, 0.87, (i % 2 - 0.5) * 0.2, M('#6a6a6a', 0.9), 1, 0.6, 1);
  const weeds = M('#2f8a3a', 0.6);
  for (let i = 0; i < 7; i++) add(g, new THREE.ConeGeometry(0.03, 0.4, 6), weeds, -0.65 + i * 0.22, 1.05, -0.12);
  const fish = [];
  ['#ff7a1a', '#ffd23d', '#19e8ff', '#ff2d8a', '#ff7a1a'].forEach((c, i) => {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), M(c, 0.4));
    body.scale.set(1.6, 1, 0.5);
    f.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 4), M(c, 0.4));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.07;
    f.add(tail);
    f.userData.o = i;
    g.add(f);
    fish.push(f);
  });
  let on = true;
  return {
    act: 'Akvaryum ışığı',
    get on() { return on; },
    setOn(v) { on = v; water.emissiveIntensity = v ? 0.9 : 0.1; },
    tick(t) {
      fish.forEach((f) => {
        const o = f.userData.o;
        const a = t * (0.4 + o * 0.07) + o * 1.3;
        f.position.set(Math.sin(a) * 0.65, 0.98 + o * 0.08 + Math.sin(a * 2) * 0.03, Math.cos(a * 0.7) * 0.12);
        f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
      });
    },
    light: { x: 0, y: 1.2, z: 0.6, color: '#3ab8ff', intensity: 2.5, distance: 4 },
  };
}
function bookshelf(g, ctx) {
  const w = M(tintHex(ctx, '#5a3a24'), 0.5);
  B(g, 1.2, 2.1, 0.04, 0, 1.05, -0.17, w);
  [-0.58, 0.58].forEach((x) => B(g, 0.04, 2.1, 0.36, x, 1.05, 0, w));
  const cols = ['#6b1a22', '#1f2a48', '#1d4d3c', '#b8862e', '#e6dfd2', '#141416', '#553075'];
  for (let s = 0; s < 5; s++) {
    const y = 0.05 + s * 0.5;
    B(g, 1.16, 0.03, 0.36, 0, y, 0, w);
    if (s === 4) break;
    let x = -0.52;
    let i = s * 3;
    while (x < 0.48) {
      const bw = 0.03 + ((i * 7) % 5) * 0.012;
      const bh = 0.28 + ((i * 3) % 4) * 0.035;
      B(g, bw, bh, 0.24, x + bw / 2, y + 0.015 + bh / 2, 0.02, M(cols[i % cols.length], 0.7));
      x += bw + 0.004;
      i++;
      if (i % 11 === 0) x += 0.1;
    }
  }
}
function fireplace(g) {
  const stone = M('#d6d0c4', 0.5);
  B(g, 1.8, 1.2, 0.5, 0, 0.6, 0.25, stone);
  B(g, 2.0, 0.08, 0.6, 0, 1.24, 0.3, M('#1b1b1d', 0.3, 0.2));
  B(g, 1.1, 0.75, 0.02, 0, 0.5, 0.505, M('#050505', 0.8));
  B(g, 1.1, 0.02, 0.35, 0, 0.14, 0.33, M('#1a1a1a', 0.8));
  for (let i = 0; i < 3; i++) C(g, 0.05, 0.05, 0.7, -0.05 + (i - 1) * 0.02, 0.2 + i * 0.05, 0.35 - i * 0.03, M('#4a2a1a', 0.9), [0, 0.3 * (i - 1), Math.PI / 2]);
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const fm = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: i % 2 ? '#ffb020' : '#ff5010', emissiveIntensity: 2.5, transparent: true, opacity: 0.9 }));
    const f = add(g, new THREE.ConeGeometry(0.07, 0.3, 8), fm, -0.3 + i * 0.12, 0.42, 0.38);
    f.castShadow = false;
    flames.push(f);
  }
  let on = true;
  return {
    act: 'Şömineyi yak/söndür',
    get on() { return on; },
    setOn(v) { on = v; flames.forEach((f) => (f.visible = v)); },
    tick(t) {
      if (!on) return;
      flames.forEach((f, i) => { f.scale.y = 0.8 + Math.abs(Math.sin(t * 7 + i * 1.7)) * 0.6; f.position.y = 0.32 + f.scale.y * 0.1; });
    },
    light: { x: 0, y: 0.6, z: 0.9, color: '#ff7a2a', intensity: 5, distance: 6 },
  };
}
function statue(g) {
  B(g, 0.6, 0.9, 0.6, 0, 0.45, 0, M('#141416', 0.2, 0.3));
  B(g, 0.66, 0.04, 0.66, 0, 0.92, 0, GOLD());
  const k = add(g, new THREE.TorusKnotGeometry(0.22, 0.065, 120, 16, 2, 3), GOLD(), 0, 1.35, 0);
  k.rotation.x = Math.PI / 2;
  return { tick(t) { k.rotation.z = t * 0.3; } };
}
function chandelier(g, ctx) {
  const H = ctx.H;
  C(g, 0.12, 0.12, 0.05, 0, H - 0.025, 0, GOLD());
  C(g, 0.01, 0.01, 0.6, 0, H - 0.3, 0, GOLD());
  const bulbM = own(new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd9a0', emissiveIntensity: 2 }));
  [0.5, 0.33].forEach((r, ri) => {
    const y = H - 0.65 - ri * 0.2;
    TOR(g, r, 0.015, 0, y, 0, GOLD(), [Math.PI / 2, 0, 0]);
    const n = ri ? 6 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = SP(g, 0.035, Math.cos(a) * r, y + 0.05, Math.sin(a) * r, bulbM);
      b.castShadow = false;
      for (let k = 0; k < 3; k++) {
        const cr = SP(g, 0.02, Math.cos(a) * r, y - 0.06 - k * 0.05, Math.sin(a) * r, M('#e8f4ff', 0.02, 0.1, { transparent: true, opacity: 0.6 }));
        cr.castShadow = false;
      }
    }
  });
  let on = true;
  return {
    act: 'Avizeyi aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; bulbM.emissiveIntensity = v ? 2 : 0.05; },
    light: { x: 0, y: H - 0.9, z: 0, color: '#ffd9a0', intensity: 8, distance: 10 },
  };
}
function ceilingFan(g, ctx) {
  const H = ctx.H;
  C(g, 0.08, 0.08, 0.05, 0, H - 0.025, 0, BLACK());
  C(g, 0.015, 0.015, 0.35, 0, H - 0.2, 0, BLACK());
  const rot = new THREE.Group();
  rot.position.y = H - 0.4;
  g.add(rot);
  C(rot, 0.12, 0.1, 0.1, 0, 0, 0, BLACK());
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.13), M('#5a3a24', 0.5));
    const a = (i / 4) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
    b.rotation.y = -a;
    rot.add(b);
  }
  let on = true;
  return {
    act: 'Pervaneyi aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; },
    tick(t, dt) { if (on) rot.rotation.y += dt * 5; },
    noLight: true,
  };
}
function bar(g) {
  const go = GOLD();
  B(g, 2.6, 1.05, 0.7, 0, 0.525, 0, M('#2b1a12', 0.5));
  RB(g, 2.72, 0.08, 0.86, 0.02, 0, 1.09, 0.05, M('#9a6a35', 0.25, 0.1));
  B(g, 2.62, 0.04, 0.02, 0, 0.75, 0.36, go);
  B(g, 2.62, 0.04, 0.02, 0, 0.3, 0.36, go);
  ['#c9a227', '#1e6b3a', '#6b1a1a', '#2a4a7a', '#999999', '#e8e2d6'].forEach((c, i) => {
    const x = -1.0 + i * 0.38;
    const bm = M(c, 0.08, 0.2, { transparent: true, opacity: 0.85 });
    C(g, 0.06, 0.06, 0.26, x, 1.26, -0.12, bm);
    C(g, 0.022, 0.03, 0.12, x, 1.45, -0.12, bm);
  });
  [-0.3, 0.5].forEach((x) => LATHE(g, [[0, 0], [0.03, 0], [0.005, 0.01], [0.005, 0.08], [0.05, 0.14], [0.045, 0.14], [0, 0.1]], M('#ffffff', 0.05, 0.1, { transparent: true, opacity: 0.5 }), x, 1.13, 0.3));
  const led = emissiveMat('#ffb030', 1.4);
  B(g, 2.5, 0.02, 0.02, 0, 0.05, 0.37, led);
  return { light: { x: 0, y: 0.5, z: 0.8, color: '#ffb030', intensity: 1.5, distance: 3 }, on: true, setOn() {}, noToggle: true };
}
function moneyPile(g) {
  const cash = M('#3f7a4a', 0.8);
  const band = M('#e8e2c8', 0.6);
  B(g, 1.2, 0.1, 0.8, 0, 0.05, 0, M('#1b1b1d', 0.4));
  for (let l = 0; l < 4; l++) {
    const n = 4 - l;
    for (let i = 0; i < n; i++) for (let j = 0; j < 3 - (l > 1 ? 1 : 0); j++) {
      const x = (i - (n - 1) / 2) * 0.24;
      const z = (j - 1) * 0.14;
      B(g, 0.22, 0.07, 0.12, x, 0.135 + l * 0.075, z, cash);
      B(g, 0.04, 0.072, 0.122, x, 0.135 + l * 0.075, z, band);
    }
  }
}
function goldBars(g) {
  B(g, 1.0, 0.8, 0.7, 0, 0.4, 0, M('#141416', 0.25, 0.4));
  const geo = () => {
    const s = new THREE.Shape();
    s.moveTo(-0.13, 0); s.lineTo(0.13, 0); s.lineTo(0.1, 0.07); s.lineTo(-0.1, 0.07); s.lineTo(-0.13, 0);
    const ge = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
    ge.translate(0, 0, -0.04);
    return ge;
  };
  for (let l = 0; l < 3; l++) {
    const n = 3 - l;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      add(g, geo(), GOLD(), (i - (n - 1) / 2) * 0.28, 0.8 + l * 0.07, (j - 0.5) * 0.22 + l * 0.01);
    }
  }
}
function poolTable(g) {
  const wood = M('#3a2216', 0.4);
  B(g, 2.5, 0.12, 1.4, 0, 0.76, 0, wood);
  B(g, 2.3, 0.02, 1.2, 0, 0.83, 0, M('#1f6b3a', 0.95));
  [[0, 0.64, 2.5, 0.08], [0, -0.64, 2.5, 0.08]].forEach(([x, z, w, d]) => B(g, w, 0.07, d, x, 0.86, z, wood));
  [-1.2, 1.2].forEach((x) => B(g, 0.08, 0.07, 1.36, x, 0.86, 0, wood));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { C(g, 0.08, 0.06, 0.72, a * 1.1, 0.36, b * 0.55, wood); C(g, 0.05, 0.05, 0.02, a * 1.14, 0.845, b * 0.59, M('#050505')); });
  [[0, 0.59], [0, -0.59]].forEach(([x, z]) => C(g, 0.05, 0.05, 0.02, x, 0.845, z, M('#050505')));
  const cols = ['#ffffff', '#e0a800', '#1f3a9a', '#c8141e', '#553075', '#ff5a14', '#1d6b3a', '#7a1a14', '#111111'];
  cols.forEach((c, i) => {
    const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
    const x = i === 0 ? -0.6 : 0.5 + row * 0.055;
    const z = i === 0 ? 0 : (i - (row * (row + 1)) / 2 - row / 2) * 0.062;
    SP(g, 0.028, x, 0.868, z, M(c, 0.15, 0.1));
  });
  TUBE(g, [-0.2, 0.86, 0.3], [1.0, 0.95, 0.5], 0.012, M('#c9a24a', 0.5));
}
function punchingBag(g) {
  B(g, 0.8, 0.05, 0.8, 0, 0.025, 0, BLACK());
  C(g, 0.04, 0.04, 2.3, -0.35, 1.15, 0, BLACK());
  B(g, 0.8, 0.05, 0.05, 0.05, 2.28, 0, BLACK());
  TUBE(g, [0.4, 2.27, 0], [0.4, 1.75, 0], 0.008, CHROME());
  const bag = C(g, 0.18, 0.18, 1.0, 0.4, 1.2, 0, M('#b8141e', 0.4, 0.1), null, 24);
  C(g, 0.18, 0.18, 0.06, 0.4, 1.72, 0, BLACK());
  return { tick(t) { bag.rotation.z = Math.sin(t * 1.2) * 0.03; } };
}
function benchPress(g) {
  RB(g, 0.3, 0.08, 1.2, 0.03, 0, 0.45, 0, M('#141416', 0.6));
  [-0.5, 0.5].forEach((z) => B(g, 0.05, 0.42, 0.05, 0, 0.21, z, BLACK()));
  [-1, 1].forEach((s) => C(g, 0.02, 0.02, 1.0, s * 0.3, 0.62, -0.45, BLACK(), null));
  C(g, 0.015, 0.015, 1.8, 0, 1.1, -0.45, CHROME(), [0, 0, Math.PI / 2]);
  [-0.75, -0.65, 0.65, 0.75].forEach((x) => C(g, 0.2, 0.2, 0.04, x, 1.1, -0.45, M('#1a1a1c', 0.5, 0.3), [0, 0, Math.PI / 2]));
}
function treadmill(g) {
  B(g, 0.8, 0.15, 1.8, 0, 0.1, 0, M('#1a1a1c', 0.5, 0.3));
  B(g, 0.6, 0.01, 1.6, 0, 0.18, 0, M('#0a0a0a', 0.9));
  [-1, 1].forEach((s) => TUBE(g, [s * 0.37, 0.15, -0.6], [s * 0.35, 1.25, -0.8], 0.03, STEEL()));
  RB(g, 0.8, 0.3, 0.12, 0.03, 0, 1.3, -0.82, M('#1a1a1c', 0.4, 0.4), [-0.4, 0, 0]);
  PLANE(g, 0.4, 0.14, emissiveMat('#39ff88', 1), 0, 1.33, -0.745, [-0.4, 0, 0]);
}
function dartBoard(g) {
  const tx = labelTexture('dart', 256, 256, (c, w) => {
    const cx = w / 2;
    for (let i = 0; i < 20; i++) {
      c.fillStyle = i % 2 ? '#111' : '#efe6c8';
      c.beginPath(); c.moveTo(cx, cx); c.arc(cx, cx, 120, (i / 20) * Math.PI * 2, ((i + 1) / 20) * Math.PI * 2); c.fill();
    }
    [[100, 92], [62, 54]].forEach(([a, b]) => { for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? '#c8141e' : '#1d6b3a'; c.beginPath(); c.arc(cx, cx, a, (i / 20) * Math.PI * 2, ((i + 1) / 20) * Math.PI * 2); c.arc(cx, cx, b, ((i + 1) / 20) * Math.PI * 2, (i / 20) * Math.PI * 2, true); c.fill(); } });
    c.fillStyle = '#1d6b3a'; c.beginPath(); c.arc(cx, cx, 14, 0, 7); c.fill();
    c.fillStyle = '#c8141e'; c.beginPath(); c.arc(cx, cx, 6, 0, 7); c.fill();
  });
  RB(g, 0.7, 0.8, 0.05, 0.02, 0, 1.73, 0.025, M('#2b1a12', 0.5));
  C(g, 0.23, 0.23, 0.04, 0, 1.73, 0.07, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 })), [Math.PI / 2, 0, 0], 40).rotation.set(Math.PI / 2, Math.PI / 2, 0);
}

// =============================================================================
// YAPI
// =============================================================================
function wallDivider(len) {
  return (g, ctx) => {
    const m = ctx.wallMat || M('#e7e3da', 0.9);
    const w = add(g, new THREE.BoxGeometry(len, ctx.H - 0.01, 0.14), m, 0, (ctx.H - 0.01) / 2, 0);
    w.userData.wallSurface = true;
    B(g, len + 0.005, 0.1, 0.16, 0, 0.05, 0, M('#141416', 0.5));
    B(g, len + 0.02, 0.03, 0.16, 0, ctx.H - 0.025, 0, M('#1b1b1f', 0.8));
  };
}
function wallDoor(g, ctx) {
  const m = ctx.wallMat || M('#e7e3da', 0.9);
  const H = ctx.H;
  [-1, 1].forEach((s) => {
    const w = add(g, new THREE.BoxGeometry(0.8, H - 0.01, 0.14), m, s * 0.8, (H - 0.01) / 2, 0);
    w.userData.wallSurface = true;
    B(g, 0.805, 0.1, 0.16, s * 0.8, 0.05, 0, M('#141416', 0.5));
  });
  const top = add(g, new THREE.BoxGeometry(0.8, H - 2.2, 0.14), m, 0, 2.2 + (H - 2.2) / 2, 0);
  top.userData.wallSurface = true;
  const fr = M('#1b1b1d', 0.4);
  [-0.41, 0.41].forEach((x) => B(g, 0.04, 2.2, 0.18, x, 1.1, 0, fr));
  B(g, 0.86, 0.04, 0.18, 0, 2.2, 0, fr);
}
function glassDivider(g) {
  B(g, 2.0, 2.4, 0.02, 0, 1.25, 0, GLASS());
  const fr = M('#141416', 0.4, 0.6);
  [-1, 1].forEach((s) => B(g, 0.04, 2.5, 0.06, s * 1.0, 1.25, 0, fr));
  B(g, 2.04, 0.04, 0.06, 0, 2.48, 0, fr);
  B(g, 2.04, 0.06, 0.08, 0, 0.03, 0, fr);
  [0.83, 1.66].forEach((y) => B(g, 2.0, 0.015, 0.03, 0, y, 0, fr));
}
function column(g, ctx) {
  const H = ctx.H;
  const m = M(tintHex(ctx, '#e6e2da'), 0.3);
  B(g, 0.5, H, 0.5, 0, H / 2, 0, m);
  B(g, 0.6, 0.12, 0.6, 0, 0.06, 0, m);
  B(g, 0.6, 0.12, 0.6, 0, H - 0.06, 0, m);
}
function podium(g, ctx) {
  const col = tintHex(ctx, '#19e8ff');
  RB(g, 3.0, 0.3, 2.0, 0.02, 0, 0.15, 0, M('#141416', 0.3, 0.3));
  const led = emissiveMat(col, 2);
  B(g, 3.0, 0.02, 0.02, 0, 0.29, 1.0, led);
  B(g, 0.02, 0.02, 2.0, 1.5, 0.29, 0, led);
  B(g, 0.02, 0.02, 2.0, -1.5, 0.29, 0, led);
  return { light: { x: 0, y: 0.6, z: 1.3, color: col, intensity: 2, distance: 3.5 }, on: true, setOn() {}, noToggle: true };
}
function windowCity(g) {
  const fr = M('#15151a', 0.4, 0.5);
  RB(g, 1.9, 1.5, 0.08, 0.02, 0, 1.65, 0.03, fr);
  const cm = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: cityTexture(), emissiveIntensity: 0.9 }));
  PLANE(g, 1.76, 1.36, cm, 0, 1.65, 0.075);
  B(g, 0.03, 1.36, 0.04, 0, 1.65, 0.09, fr);
  B(g, 1.76, 0.03, 0.04, 0, 1.65, 0.09, fr);
  B(g, 2.0, 0.05, 0.22, 0, 0.88, 0.1, M('#e6e2da', 0.3));
  return { light: { x: 0, y: 1.65, z: 0.6, color: '#8a7aff', intensity: 1.2, distance: 4 }, on: true, setOn() {}, noToggle: true };
}
function doorDecor(g) {
  const fr = M('#1b1b1d', 0.4);
  B(g, 1.2, 2.3, 0.1, 0, 1.15, 0.05, fr);
  B(g, 1.0, 2.15, 0.06, 0, 1.08, 0.08, M('#3a2216', 0.45));
  for (let i = 0; i < 3; i++) B(g, 0.8, 0.5, 0.01, 0, 0.4 + i * 0.66, 0.112, M('#2e1a10', 0.45));
  B(g, 0.03, 0.2, 0.05, 0.38, 1.05, 0.13, GOLD());
}

// =============================================================================
// v66 — YENİ EŞYALAR (dükkan, kafe, kulüp, spor, ofis, dış mekan, duvar süsleri)
// =============================================================================
const PRODUCT_COLS = ['#d23a3a', '#e0a800', '#1f6fb8', '#2d8a4a', '#ff7a1a', '#ececec', '#7a1f8a', '#19a0b8'];
function productRow(g, x0, x1, y, z, depth, seed = 0) {
  let x = x0;
  let i = seed;
  while (x < x1 - 0.06) {
    const kind = i % 3;
    const col = M(PRODUCT_COLS[(i * 5) % PRODUCT_COLS.length], 0.5);
    if (kind === 0) {
      B(g, 0.1, 0.16, depth, x + 0.05, y + 0.08, z, col);
      x += 0.12;
    } else if (kind === 1) {
      C(g, 0.035, 0.035, 0.18, x + 0.04, y + 0.09, z, col, null, 10);
      x += 0.09;
    } else {
      B(g, 0.14, 0.09, depth, x + 0.07, y + 0.045, z, col);
      x += 0.16;
    }
    i++;
  }
}
function marketShelf(g, ctx) {
  const m = M(tintHex(ctx, '#e8e4dc'), 0.4, 0.3);
  B(g, 1.6, 1.8, 0.05, 0, 0.9, -0.22, m);
  [-0.8, 0.8].forEach((x) => B(g, 0.04, 1.8, 0.5, x, 0.9, 0, m));
  [0.1, 0.55, 1.0, 1.45].forEach((y, k) => {
    B(g, 1.58, 0.03, 0.48, 0, y, 0, m);
    B(g, 1.58, 0.05, 0.01, 0, y + 0.01, 0.245, M('#d23a3a', 0.4));
    productRow(g, -0.76, 0.76, y + 0.015, 0.02, 0.3, k * 3);
  });
}
function checkoutCounter(g, ctx) {
  const body = M(tintHex(ctx, '#1b1b1d'), 0.4);
  B(g, 1.8, 0.95, 0.65, 0, 0.475, 0, body);
  RB(g, 1.84, 0.04, 0.7, 0.01, 0, 0.97, 0, M('#e8e4dc', 0.15));
  B(g, 1.0, 0.02, 0.4, -0.35, 0.995, 0.05, M('#141416', 0.9));
  // yazar kasa
  RB(g, 0.4, 0.14, 0.32, 0.03, 0.55, 1.06, 0, M('#2a2d32', 0.4, 0.5));
  RB(g, 0.32, 0.22, 0.04, 0.01, 0.55, 1.26, -0.08, M('#141416', 0.3), [-0.3, 0, 0]);
  PLANE(g, 0.28, 0.17, emissiveMat('#39ff88', 0.9), 0.55, 1.26, -0.056, [-0.3, 0, 0]);
  B(g, 0.12, 0.08, 0.08, 0.2, 1.03, 0.15, M('#d23a3a', 0.5));
  for (let i = 0; i < 4; i++) B(g, 0.12, 0.2, 0.08, -0.75 + i * 0.15, 0.3 + (i % 2) * 0.2, 0.33, M(PRODUCT_COLS[i], 0.5));
}
function glassCounter(g, ctx) {
  const frame = M(tintHex(ctx, '#d9a93c'), 0.25, 1);
  B(g, 1.6, 0.25, 0.6, 0, 0.125, 0, M('#1b1b1d', 0.4));
  B(g, 1.6, 0.7, 0.6, 0, 0.6, 0, GLASS());
  B(g, 1.56, 0.02, 0.56, 0, 0.6, 0, GLASS());
  [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].forEach(([x, z]) => B(g, 0.025, 0.72, 0.025, x, 0.6, z, frame));
  B(g, 1.62, 0.025, 0.62, 0, 0.96, 0, frame);
  for (let i = 0; i < 5; i++) {
    const x = -0.6 + i * 0.3;
    TOR(g, 0.06, 0.012, x, 0.3, 0.05, i % 2 ? GOLD() : M('#e8e8f0', 0.1, 1), [Math.PI / 2, 0, 0]);
    SP(g, 0.025, x, 0.7, 0.05, M(['#ff2d8a', '#19e8ff', '#39ff88', '#ffc23d', '#b16bff'][i], 0.05, 0.3));
  }
  B(g, 1.5, 0.02, 0.02, 0, 0.94, 0.28, emissiveMat('#fff4d6', 1.2));
}
function drinkFridge(g, ctx) {
  const body = M(tintHex(ctx, '#c8141e'), 0.35, 0.3);
  B(g, 0.85, 2.0, 0.7, 0, 1.0, 0, body);
  B(g, 0.75, 1.6, 0.02, 0, 1.0, 0.351, GLASS());
  const light = emissiveMat('#e8f6ff', 0.6);
  B(g, 0.72, 1.56, 0.02, 0, 1.0, -0.3, light);
  [0.4, 0.8, 1.2, 1.6].forEach((y, k) => {
    B(g, 0.72, 0.02, 0.55, 0, y - 0.1, 0, M('#cfd4da', 0.3, 0.8));
    for (let i = 0; i < 6; i++) C(g, 0.035, 0.035, 0.16, -0.3 + i * 0.12, y - 0.01, 0.05, M(PRODUCT_COLS[(i + k) % 8], 0.3, 0.3), null, 10);
  });
  const sign = labelTexture('drinkf', 256, 64, (c, w, h) => { c.fillStyle = '#c8141e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('SOĞUK İÇECEK', w / 2, 46); });
  PLANE(g, 0.78, 0.2, own(new THREE.MeshStandardMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.4 })), 0, 1.88, 0.352);
  return { light: { x: 0, y: 1.0, z: 0.6, color: '#d8f0ff', intensity: 1.2, distance: 3 }, on: true, setOn() {}, noToggle: true };
}
function iceCream(g) {
  B(g, 1.4, 0.8, 0.7, 0, 0.4, 0, M('#ececec', 0.3, 0.2));
  B(g, 1.3, 0.02, 0.6, 0, 0.81, 0, GLASS());
  ['#ffb3c7', '#7a4a2a', '#fff4d6', '#39c46a', '#ffd23f', '#b16bff'].forEach((c, i) => {
    B(g, 0.2, 0.06, 0.25, -0.5 + (i % 3) * 0.25, 0.77, i > 2 ? 0.13 : -0.13, M(c, 0.7));
  });
  const sign = labelTexture('icecr', 256, 64, (c, w, h) => { c.fillStyle = '#ff7aa8'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('DONDURMA', w / 2, 46); });
  PLANE(g, 1.2, 0.3, own(new THREE.MeshStandardMaterial({ map: sign })), 0, 0.45, 0.352);
}
function fruitStand(g) {
  const wood = M('#8a6a42', 0.8);
  B(g, 1.4, 0.7, 0.8, 0, 0.35, 0, wood);
  [-0.35, 0, 0.35].forEach((z, r) => {
    B(g, 1.3, 0.1, 0.25, 0, 0.78 + r * 0.12, z * 0.8, wood, [-0.25, 0, 0]);
    for (let i = 0; i < 9; i++) SP(g, 0.055, -0.55 + i * 0.14, 0.88 + r * 0.12, z * 0.8, M(['#d23a3a', '#ff9a1a', '#e0d000', '#3a9a3a'][(i + r) % 4], 0.5));
  });
  [-0.68, 0.68].forEach((x) => B(g, 0.04, 1.8, 0.04, x, 0.9, -0.38, wood));
  B(g, 1.5, 0.04, 0.9, 0, 1.8, 0, M('#d23a3a', 0.8), [0.15, 0, 0]);
}
function cafeCounter(g, ctx) {
  const body = M(tintHex(ctx, '#5a3a24'), 0.5);
  B(g, 2.0, 1.0, 0.65, 0, 0.5, 0, body);
  for (let i = 0; i < 8; i++) B(g, 0.22, 0.95, 0.02, -0.88 + i * 0.25, 0.5, 0.33, M('#4a2e1c', 0.5));
  RB(g, 2.06, 0.05, 0.72, 0.01, 0, 1.02, 0, M('#1a1a1c', 0.15, 0.2));
  // espresso makinesi
  RB(g, 0.55, 0.4, 0.4, 0.04, -0.5, 1.25, -0.08, M('#c0c4ca', 0.15, 1));
  [-0.62, -0.38].forEach((x) => { C(g, 0.03, 0.03, 0.1, x, 1.08, 0.08, M('#111')); C(g, 0.035, 0.03, 0.06, x, 1.07, 0.16, WHITE_CER()); });
  // fincan kuleleri + kasa
  for (let i = 0; i < 3; i++) C(g, 0.045, 0.035, 0.06, 0.1, 1.08 + i * 0.065, -0.1, WHITE_CER());
  RB(g, 0.3, 0.12, 0.25, 0.02, 0.65, 1.1, 0, M('#2a2d32', 0.4, 0.5));
  B(g, 1.9, 0.02, 0.02, 0, 0.05, 0.34, emissiveMat('#ffb030', 1.2));
}
function cakeCase(g) {
  B(g, 1.0, 0.85, 0.6, 0, 0.425, 0, M('#ececec', 0.3, 0.2));
  B(g, 1.0, 0.6, 0.6, 0, 1.15, 0, GLASS());
  B(g, 1.02, 0.03, 0.62, 0, 1.46, 0, M('#d9a93c', 0.3, 1));
  [0.95, 1.2].forEach((y, r) => {
    B(g, 0.96, 0.015, 0.56, 0, y - 0.04, 0, GLASS());
    for (let i = 0; i < 3; i++) {
      const x = -0.3 + i * 0.3;
      C(g, 0.1, 0.1, 0.1, x, y + 0.01, 0, M(['#ffb3c7', '#7a4a2a', '#fff4d6'][(i + r) % 3], 0.7), null, 20);
      SP(g, 0.025, x, y + 0.08, 0, M('#d23a3a', 0.4));
    }
  });
  B(g, 0.96, 0.01, 0.02, 0, 1.44, 0.27, emissiveMat('#fff4d6', 1.2));
}
function cafeTable(g, ctx) {
  const top = M(tintHex(ctx, '#e8e4dc'), 0.25);
  C(g, 0.38, 0.38, 0.04, 0, 0.74, 0, top, null, 32);
  C(g, 0.03, 0.03, 0.72, 0, 0.36, 0, BLACK());
  C(g, 0.2, 0.22, 0.03, 0, 0.015, 0, BLACK());
  [-1, 1].forEach((s) => {
    const ch = new THREE.Group();
    ch.position.set(s * 0.62, 0, 0);
    ch.rotation.y = s * Math.PI / 2 * -1;
    g.add(ch);
    chairModern(ch, { tint: { c: '#1b1b1d' } });
  });
  C(g, 0.04, 0.03, 0.06, 0.1, 0.79, 0.05, WHITE_CER());
  C(g, 0.02, 0.02, 0.08, -0.12, 0.8, -0.05, M('#c8141e', 0.3), null, 8);
}
function menuBoard(g) {
  const tx = labelTexture('menu', 256, 192, (c, w, h) => {
    c.fillStyle = '#1b2a22';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4f0e6';
    c.font = 'bold 24px Georgia, serif';
    c.textAlign = 'center';
    c.fillText('MENÜ', w / 2, 30);
    c.font = '15px Georgia, serif';
    c.textAlign = 'left';
    [['Çay', '20'], ['Türk Kahvesi', '60'], ['Latte', '90'], ['Pasta', '120'], ['Tost', '80'], ['Limonata', '70']].forEach(([a, b], i) => {
      c.fillText(a, 20, 60 + i * 21);
      c.textAlign = 'right';
      c.fillText(b + ' ₺', w - 20, 60 + i * 21);
      c.textAlign = 'left';
    });
  });
  RB(g, 1.1, 0.85, 0.05, 0.01, 0, 1.75, 0.025, M('#5a3a24', 0.5));
  PLANE(g, 1.0, 0.75, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9 })), 0, 1.75, 0.052);
}
function clothesRack(g, ctx) {
  const m = CHROME();
  [-0.7, 0.7].forEach((x) => { C(g, 0.015, 0.015, 1.6, x, 0.8, 0, m); B(g, 0.05, 0.03, 0.5, x, 0.015, 0, m); });
  C(g, 0.015, 0.015, 1.42, 0, 1.58, 0, m, [0, 0, Math.PI / 2]);
  const cols = ['#1b1b1d', '#6b1a22', '#1f2a48', '#e8e4dc', '#b8862e', '#2d8a4a', '#7a1f8a', '#4c4d53'];
  for (let i = 0; i < 9; i++) {
    const x = -0.6 + i * 0.15;
    TOR(g, 0.03, 0.005, x, 1.6, 0, m, null, Math.PI);
    RB(g, 0.04, 0.7, 0.42, 0.015, x, 1.2, 0, M(cols[(i + (ctx.ti || 0)) % cols.length], 0.85));
  }
}
function mannequin(g, ctx) {
  const skin = M('#e8e4dc', 0.3);
  C(g, 0.18, 0.2, 0.03, 0, 0.015, 0, BLACK());
  C(g, 0.015, 0.015, 0.8, 0, 0.42, 0, CHROME());
  SP(g, 0.11, 0, 1.68, 0, skin, 0.9, 1.15, 0.95);
  C(g, 0.045, 0.05, 0.1, 0, 1.53, 0, skin);
  const cloth = M(tintHex(ctx, '#6b1a22'), 0.85);
  RB(g, 0.4, 0.55, 0.22, 0.08, 0, 1.22, 0, cloth);
  RB(g, 0.32, 0.25, 0.2, 0.06, 0, 0.88, 0, M('#1b1b1d', 0.8));
  [-1, 1].forEach((s) => RB(g, 0.09, 0.5, 0.1, 0.04, s * 0.25, 1.2, 0, cloth, [0, 0, s * 0.12]));
}
function mirrorFull(g, ctx) {
  RB(g, 0.7, 1.9, 0.06, 0.02, 0, 1.0, 0.03, M(tintHex(ctx, '#d9a93c'), 0.3, 0.9));
  B(g, 0.62, 1.8, 0.01, 0, 1.0, 0.062, MIRROR());
}
function barTable(g, ctx) {
  const top = M(tintHex(ctx, '#1b1b1d'), 0.3, 0.2);
  C(g, 0.35, 0.35, 0.04, 0, 1.08, 0, top, null, 32);
  C(g, 0.04, 0.04, 1.06, 0, 0.53, 0, CHROME());
  C(g, 0.25, 0.28, 0.04, 0, 0.02, 0, CHROME());
  LATHE(g, [[0, 0], [0.03, 0], [0.005, 0.01], [0.005, 0.08], [0.05, 0.14], [0.045, 0.14], [0, 0.1]], M('#ffffff', 0.05, 0.1, { transparent: true, opacity: 0.5 }), 0.1, 1.1, 0);
}
function stageMic(g, ctx) {
  const col = tintHex(ctx, '#ff2d8a');
  RB(g, 3.0, 0.4, 2.0, 0.02, 0, 0.2, 0, M('#141416', 0.3, 0.3));
  B(g, 3.0, 0.02, 0.02, 0, 0.39, 1.0, emissiveMat(col, 2));
  // mikrofon
  C(g, 0.15, 0.17, 0.02, 0, 0.41, 0.4, BLACK());
  C(g, 0.012, 0.012, 1.3, 0, 1.06, 0.4, CHROME());
  SP(g, 0.04, 0, 1.75, 0.42, M('#2a2d32', 0.5, 0.8), 1, 1.3, 1);
  // hoparlörler + ışık direği
  [-1.3, 1.3].forEach((x) => {
    RB(g, 0.45, 0.8, 0.4, 0.02, x, 0.8, -0.6, BLACK());
    C(g, 0.14, 0.14, 0.02, x, 0.85, -0.39, M('#2a2a2c', 0.8), [Math.PI / 2, 0, 0]);
    C(g, 0.025, 0.025, 2.4, x, 1.6, -0.9, BLACK());
    const spot = emissiveMat(col, 2.5);
    C(g, 0.08, 0.1, 0.18, x, 2.7, -0.75, spot, [0.9, 0, x > 0 ? 0.3 : -0.3]);
  });
  const backdrop = labelTexture('stage', 512, 160, (c, w, h) => { c.fillStyle = '#0a0a12'; c.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${Math.random()})`; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); } });
  PLANE(g, 3.0, 1.0, own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: backdrop, emissiveIntensity: 0.8 })), 0, 2.0, -0.99);
  return { light: { x: 0, y: 2.4, z: 0.8, color: col, intensity: 4, distance: 6 }, on: true, setOn() {}, noToggle: true };
}
function discoBall(g, ctx) {
  const H = ctx.H;
  C(g, 0.006, 0.006, 0.5, 0, H - 0.25, 0, CHROME());
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 2), M('#e8e8ee', 0.05, 1, { flatShading: true }));
  ball.position.y = H - 0.75;
  g.add(ball);
  const spots = [];
  for (let i = 0; i < 6; i++) {
    const m = own(new THREE.MeshBasicMaterial({ color: ['#ff2d8a', '#19e8ff', '#39ff88', '#ffc23d', '#b16bff', '#ffffff'][i], transparent: true, opacity: 0.7, depthWrite: false }));
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), m);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.015;
    g.add(s);
    spots.push(s);
  }
  let on = true;
  return {
    act: 'Disko topunu aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; spots.forEach((s) => (s.visible = v)); },
    tick(t) {
      ball.rotation.y = t * 0.8;
      if (!on) return;
      spots.forEach((s, i) => {
        const a = t * 0.9 + (i / 6) * Math.PI * 2;
        const r = 1.6 + Math.sin(t * 0.7 + i) * 0.8;
        s.position.x = Math.cos(a) * r;
        s.position.z = Math.sin(a) * r;
      });
    },
    light: { x: 0, y: H - 1.0, z: 0, color: '#b16bff', intensity: 4, distance: 7 },
  };
}
function washer(dryer) {
  return (g, ctx) => {
    RB(g, 0.62, 0.86, 0.6, 0.03, 0, 0.43, 0, M(tintHex(ctx, '#eeeeee'), 0.3, 0.1));
    B(g, 0.6, 0.1, 0.02, 0, 0.78, 0.3, M('#d6d9de', 0.3, 0.3));
    C(g, 0.03, 0.03, 0.02, 0.18, 0.78, 0.315, M('#2a2d32'), [Math.PI / 2, 0, 0]);
    PLANE(g, 0.12, 0.04, emissiveMat('#19e8ff', 1), -0.12, 0.78, 0.312);
    TOR(g, 0.19, 0.025, 0, 0.4, 0.3, CHROME());
    const glass = C(g, 0.17, 0.17, 0.02, 0, 0.4, 0.3, M(dryer ? '#2a2d32' : '#3a6a8a', 0.05, 0.5, { transparent: true, opacity: 0.8 }), [Math.PI / 2, 0, 0], 28);
    let on = false;
    return {
      act: dryer ? 'Kurutmayı çalıştır' : 'Çamaşır yıka',
      get on() { return on; },
      setOn(v) { on = v; },
      tick(t) { if (on) glass.rotation.y = t * 8; },
      noLight: true,
    };
  };
}
function fence(g, ctx) {
  const w = M(tintHex(ctx, '#e8e4dc'), 0.7);
  for (let i = 0; i < 9; i++) {
    const x = -0.9 + i * 0.225;
    B(g, 0.09, 1.0, 0.03, x, 0.5, 0, w);
    B(g, 0.064, 0.064, 0.03, x, 1.0, 0, w, [0, 0, Math.PI / 4]);
  }
  [0.3, 0.75].forEach((y) => B(g, 2.0, 0.07, 0.03, 0, y, -0.03, w));
}
function parkBench(g, ctx) {
  const wood = M(tintHex(ctx, '#8a5a36'), 0.7);
  const iron = M('#1b1b1d', 0.4, 0.7);
  for (let i = 0; i < 4; i++) B(g, 1.6, 0.04, 0.09, 0, 0.45, -0.18 + i * 0.12, wood);
  for (let i = 0; i < 3; i++) B(g, 1.6, 0.09, 0.03, 0, 0.62 + i * 0.13, -0.27, wood, [-0.15, 0, 0]);
  [-0.7, 0.7].forEach((x) => {
    B(g, 0.05, 0.45, 0.05, x, 0.22, 0.15, iron);
    B(g, 0.05, 0.9, 0.05, x, 0.45, -0.24, iron);
    B(g, 0.05, 0.05, 0.45, x, 0.66, -0.02, iron);
  });
}
function streetLamp(g) {
  const iron = M('#1b1b1d', 0.4, 0.7);
  C(g, 0.16, 0.2, 0.2, 0, 0.1, 0, iron);
  C(g, 0.05, 0.06, 3.0, 0, 1.6, 0, iron);
  TOR(g, 0.3, 0.025, 0.3, 3.08, 0, iron, null, Math.PI);
  const m = own(new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd9a0', emissiveIntensity: 2 }));
  C(g, 0.1, 0.16, 0.22, 0.6, 2.98, 0, iron);
  SP(g, 0.09, 0.6, 2.86, 0, m);
  let on = true;
  return {
    act: 'Lambayı aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; m.emissiveIntensity = v ? 2 : 0.05; },
    light: { x: 0.6, y: 2.7, z: 0, color: '#ffd9a0', intensity: 6, distance: 8 },
  };
}
function turf(g) {
  const tx = labelTexture('turf', 256, 256, (c, w, h, r) => {
    c.fillStyle = '#2d7a34';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = r() > 0.5 ? '#3f9a44' : '#225e28'; c.fillRect(r() * w, r() * h, 1.5, 3); }
  });
  tx.repeat.set(2, 2);
  const o = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), own(new THREE.MeshStandardMaterial({ map: tx, roughness: 1 })));
  o.rotation.x = -Math.PI / 2;
  o.position.y = 0.011;
  o.receiveShadow = true;
  g.add(o);
}
function planter(g, ctx) {
  B(g, 1.2, 0.45, 0.4, 0, 0.225, 0, M(tintHex(ctx, '#3a3d42'), 0.6));
  B(g, 1.12, 0.02, 0.32, 0, 0.44, 0, M('#3a2a1c', 1));
  for (let i = 0; i < 10; i++) {
    const x = -0.5 + i * 0.11;
    TUBE(g, [x, 0.44, 0], [x + 0.02, 0.62 + (i % 3) * 0.05, 0.02], 0.006, M('#3a7a34', 0.6));
    SP(g, 0.04, x + 0.02, 0.64 + (i % 3) * 0.05, 0.02, M(['#ff2d8a', '#ffd23f', '#ffffff', '#b16bff'][i % 4], 0.5));
  }
}
function wallClock(g) {
  const tx = labelTexture('clock', 256, 256, (c, w) => {
    const r = w / 2;
    c.fillStyle = '#f4f0e6';
    c.beginPath(); c.arc(r, r, r - 4, 0, 7); c.fill();
    c.fillStyle = '#1b1b1d';
    c.font = 'bold 26px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      c.fillText(String(i), r + Math.cos(a) * (r - 30), r + Math.sin(a) * (r - 30));
    }
  });
  C(g, 0.3, 0.3, 0.05, 0, 2.2, 0.025, M('#1b1b1d', 0.4, 0.6), [Math.PI / 2, 0, 0], 40);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.27, 40), own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6 })));
  face.position.set(0, 2.2, 0.052);
  g.add(face);
  const hand = (len, w, m) => {
    const p = new THREE.Group();
    p.position.set(0, 2.2, 0.058);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.005), m);
    b.position.y = len / 2 - 0.02;
    p.add(b);
    g.add(p);
    return p;
  };
  const hh = hand(0.15, 0.022, M('#111'));
  const mh = hand(0.22, 0.014, M('#111'));
  const sh = hand(0.23, 0.006, M('#c8141e'));
  return {
    tick() {
      const d = new Date();
      const s = d.getSeconds();
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      sh.rotation.z = -(s / 60) * Math.PI * 2;
      mh.rotation.z = -(m / 60) * Math.PI * 2;
      hh.rotation.z = -(h / 12) * Math.PI * 2;
    },
  };
}
function wallShelf(g, ctx) {
  const w = M(tintHex(ctx, '#5a3a24'), 0.5);
  [1.4, 1.85].forEach((y, r) => {
    B(g, 1.2, 0.04, 0.25, 0, y, 0.125, w);
    if (r === 0) {
      for (let i = 0; i < 7; i++) B(g, 0.04, 0.26, 0.18, -0.5 + i * 0.05, y + 0.15, 0.12, M(['#6b1a22', '#1f2a48', '#b8862e', '#1d4d3c'][i % 4], 0.7));
      C(g, 0.06, 0.04, 0.16, 0.3, y + 0.1, 0.12, M('#3a6a8a', 0.2));
    } else {
      SP(g, 0.08, -0.35, y + 0.08, 0.12, GOLD());
      RB(g, 0.2, 0.25, 0.03, 0.01, 0.2, y + 0.145, 0.06, M('#1b1b1d', 0.4));
      C(g, 0.07, 0.05, 0.12, 0.45, y + 0.08, 0.12, M('#4a7a3a', 0.6));
    }
  });
}
function goldRecords(g) {
  for (let i = 0; i < 3; i++) {
    const x = -0.55 + i * 0.55;
    RB(g, 0.45, 0.55, 0.04, 0.01, x, 1.7, 0.02, M('#141416', 0.3));
    C(g, 0.17, 0.17, 0.01, x, 1.75, 0.045, GOLD(), [Math.PI / 2, 0, 0], 32);
    C(g, 0.05, 0.05, 0.012, x, 1.75, 0.046, M('#c8141e', 0.4), [Math.PI / 2, 0, 0], 16);
    B(g, 0.3, 0.05, 0.005, x, 1.5, 0.045, M('#d9a93c', 0.3, 0.9));
  }
}
function cityFrame(g) {
  const tx = labelTexture('cmap', 256, 192, (c, w, h, r) => {
    c.fillStyle = '#e8e0cc';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a7a5a';
    for (let i = 0; i < 18; i++) { c.lineWidth = 1 + r() * 3; c.beginPath(); c.moveTo(r() * w, 0); c.lineTo(r() * w, h); c.stroke(); c.beginPath(); c.moveTo(0, r() * h); c.lineTo(w, r() * h); c.stroke(); }
    c.fillStyle = '#7aaad6';
    c.beginPath(); c.moveTo(0, h * 0.7); c.bezierCurveTo(w * 0.3, h * 0.6, w * 0.6, h * 0.9, w, h * 0.75); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = '#c8141e';
    c.beginPath(); c.arc(w * 0.55, h * 0.4, 6, 0, 7); c.fill();
    c.fillStyle = '#3a2a1a'; c.font = 'bold 16px Georgia, serif'; c.fillText('NEON ŞEHİR', 10, 22);
  });
  RB(g, 1.5, 1.1, 0.05, 0.01, 0, 1.65, 0.025, M('#2a1d15', 0.4));
  PLANE(g, 1.4, 1.0, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 })), 0, 1.65, 0.052);
}
function graffiti(g, ctx) {
  const col = tintHex(ctx, '#ff2d8a');
  const tx = labelTexture(`graf_${col}`, 512, 256, (c, w, h, r) => {
    c.fillStyle = '#2a2a30';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { c.globalAlpha = 0.6; c.fillStyle = ['#19e8ff', '#ffd23f', col, '#39ff88'][i % 4]; c.beginPath(); c.arc(r() * w, r() * h, 4 + r() * 18, 0, 7); c.fill(); }
    c.globalAlpha = 1;
    c.font = 'italic 900 110px Impact, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 12;
    c.strokeStyle = '#111';
    c.strokeText('NEON', w / 2, 160);
    c.fillStyle = col;
    c.fillText('NEON', w / 2, 160);
    c.lineWidth = 3;
    c.strokeStyle = '#fff';
    c.strokeText('NEON', w / 2, 160);
  });
  PLANE(g, 2.6, 1.3, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9 })), 0, 1.7, 0.01);
}
function painting2(g, ctx) {
  const idx = ctx.ti || 0;
  const tx = labelTexture(`land_${idx}`, 256, 160, (c, w, h, r) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, ['#f6a04d', '#7ab8e8', '#2a1a4a', '#ffd0a0', '#9ad0e8', '#401a30'][idx % 6]);
    sky.addColorStop(1, '#fff2d0');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,240,200,.9)';
    c.beginPath(); c.arc(w * 0.75, h * 0.3, 18, 0, 7); c.fill();
    [['#4a6a8a', 0.55], ['#2a4a3a', 0.7], ['#1a2a1a', 0.85]].forEach(([col, base]) => {
      c.fillStyle = col;
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, h * base - r() * 40);
      c.lineTo(w, h); c.fill();
    });
  });
  RB(g, 1.6, 1.05, 0.05, 0.01, 0, 1.65, 0.025, M('#5a3a24', 0.5));
  PLANE(g, 1.5, 0.95, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 })), 0, 1.65, 0.052);
}
function painting3(g, ctx) {
  const col = tintHex(ctx, '#ff6a3d');
  const tx = labelTexture(`geo_${col}`, 192, 256, (c, w, h, r) => {
    c.fillStyle = '#f4f0e6';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = [col, '#1b1b1d', '#e0a800', '#1f6fb8', '#e8e4dc'][i % 5];
      if (i % 2) c.fillRect(r() * w * 0.7, r() * h * 0.8, 30 + r() * 60, 30 + r() * 80);
      else { c.beginPath(); c.arc(r() * w, r() * h, 15 + r() * 35, 0, 7); c.fill(); }
    }
  });
  RB(g, 0.8, 1.1, 0.04, 0.01, 0, 1.65, 0.02, M('#141416', 0.3));
  PLANE(g, 0.72, 1.02, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 })), 0, 1.65, 0.042);
}
function triptych(g, ctx) {
  const col = tintHex(ctx, '#ff6a3d');
  const tx = labelTexture(`trip_${col}`, 384, 192, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, col);
    gr.addColorStop(0.5, '#1a1a2e');
    gr.addColorStop(1, '#19e8ff');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.8)';
    c.lineWidth = 4;
    c.beginPath(); c.arc(w / 2, h / 2, 60, 0, 7); c.stroke();
  });
  [-1, 0, 1].forEach((i) => {
    const t = tx.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / 3, 1);
    t.offset.set((i + 1) / 3, 0);
    RB(g, 0.62, 1.0, 0.04, 0.01, i * 0.68, 1.7, 0.02, M('#141416', 0.3));
    PLANE(g, 0.58, 0.96, own(new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })), i * 0.68, 1.7, 0.042);
  });
}
function curtain(g, ctx) {
  const col = tintHex(ctx, '#6b1a22');
  C(g, 0.02, 0.02, 2.4, 0, 2.6, 0.12, GOLD(), [0, 0, Math.PI / 2]);
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 5; i++) {
      const f = C(g, 0.07, 0.09, 2.45, s * (0.75 + i * 0.09), 1.36, 0.12, M(col, 0.9), null, 10);
      f.scale.z = 0.6;
    }
  });
  B(g, 2.3, 0.25, 0.08, 0, 2.5, 0.14, M(col, 0.9));
}
function vase(g, ctx) {
  LATHE(g, [[0, 0], [0.08, 0], [0.13, 0.15], [0.1, 0.32], [0.06, 0.4], [0.07, 0.44], [0, 0.44]], M(tintHex(ctx, '#1f6fb8'), 0.15, 0.1));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    TUBE(g, [0, 0.4, 0], [Math.cos(a) * 0.15, 0.75 + (i % 2) * 0.1, Math.sin(a) * 0.15], 0.006, M('#3a7a34', 0.6));
    SP(g, 0.05, Math.cos(a) * 0.15, 0.77 + (i % 2) * 0.1, Math.sin(a) * 0.15, M(['#ff2d8a', '#ffffff', '#ffd23f'][i % 3], 0.6));
  }
}
function trashBin(g, ctx) {
  C(g, 0.18, 0.15, 0.6, 0, 0.3, 0, M(tintHex(ctx, '#3a3d42'), 0.4, 0.7), null, 20);
  C(g, 0.19, 0.19, 0.04, 0, 0.62, 0, M('#1b1b1d', 0.4, 0.7), null, 20);
}
function extinguisher(g) {
  B(g, 0.06, 0.1, 0.05, 0, 1.1, 0.03, BLACK());
  C(g, 0.08, 0.08, 0.5, 0, 0.85, 0.11, M('#c8141e', 0.3, 0.3), null, 18);
  SP(g, 0.08, 0, 1.1, 0.11, M('#c8141e', 0.3, 0.3), 1, 0.5, 1);
  C(g, 0.02, 0.025, 0.08, 0, 1.17, 0.11, BLACK());
  TUBE(g, [0.02, 1.15, 0.11], [0.12, 0.8, 0.14], 0.01, BLACK());
}
function pcStation(g, ctx) {
  const rgb = tintHex(ctx, '#19e8ff');
  B(g, 2.2, 0.04, 0.75, 0, 0.75, 0, M('#141416', 0.35));
  B(g, 2.2, 0.7, 0.03, 0, 0.37, -0.36, M('#141416', 0.35));
  [-1.08, 0, 1.08].forEach((x) => B(g, 0.04, 0.73, 0.72, x, 0.365, 0, M('#141416', 0.35)));
  B(g, 0.02, 0.4, 0.7, 0, 0.97, 0, M('#2a2d32', 0.4));
  const scr = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: codeTexture(), emissiveIntensity: 0.9 }));
  [-0.55, 0.55].forEach((x) => {
    RB(g, 0.6, 0.36, 0.03, 0.01, x, 1.08, -0.22, BLACK());
    PLANE(g, 0.56, 0.32, scr, x, 1.08, -0.204);
    C(g, 0.012, 0.012, 0.25, x, 0.9, -0.24, BLACK());
    B(g, 0.45, 0.02, 0.15, x, 0.78, 0.08, BLACK());
    B(g, 0.42, 0.005, 0.12, x, 0.792, 0.08, emissiveMat(rgb, 1.2));
    RB(g, 0.2, 0.42, 0.42, 0.01, x + 0.38, 0.22, 0.05, BLACK());
    B(g, 0.005, 0.36, 0.36, x + 0.27, 0.22, 0.05, emissiveMat(rgb, 1.5));
  });
  return { light: { x: 0, y: 1.0, z: 0.4, color: rgb, intensity: 2.5, distance: 4 }, on: true, setOn() {}, noToggle: true };
}
function consoleSet(g, ctx) {
  const body = M(tintHex(ctx, '#1b1b1d'), 0.4);
  B(g, 1.6, 0.45, 0.45, 0, 0.225, 0, body);
  RB(g, 0.4, 0.08, 0.3, 0.02, -0.3, 0.49, 0, M('#ececec', 0.3));
  B(g, 0.2, 0.01, 0.005, -0.3, 0.49, 0.15, emissiveMat('#19e8ff', 1.5));
  [0.1, 0.35].forEach((x, i) => {
    const p = new THREE.Group();
    p.position.set(x, 0.47, 0.05);
    p.rotation.y = 0.3 - i * 0.6;
    g.add(p);
    RB(p, 0.16, 0.035, 0.09, 0.02, 0, 0, 0, M(i ? '#c8141e' : '#1f6fb8', 0.4));
  });
  RB(g, 1.4, 0.82, 0.06, 0.01, 0, 0.95, -0.15, BLACK());
  const tv = tvScreen(g, 1.32, 0.74, 0, 0.95, -0.118, ctx.live);
  return tv;
}
function dumbbells(g) {
  const iron = M('#1b1b1d', 0.4, 0.7);
  B(g, 1.4, 0.05, 0.4, 0, 0.55, 0, iron, [0.15, 0, 0]);
  B(g, 1.4, 0.05, 0.4, 0, 0.25, 0, iron, [0.15, 0, 0]);
  [-0.68, 0.68].forEach((x) => B(g, 0.05, 0.7, 0.4, x, 0.35, 0, iron));
  [0.6, 0.3].forEach((y, r) => {
    for (let i = 0; i < 5; i++) {
      const x = -0.5 + i * 0.25;
      const s = 0.04 + i * 0.008 + r * 0.01;
      C(g, 0.012, 0.012, 0.22, x, y, 0, CHROME(), [0, 0, Math.PI / 2]);
      [-1, 1].forEach((k) => C(g, s, s, 0.05, x + k * 0.09, y, 0, M('#2a2d32', 0.5, 0.6), [0, 0, Math.PI / 2], 6));
    }
  });
}
function exerciseBike(g, ctx) {
  const frame = M(tintHex(ctx, '#c8141e'), 0.4, 0.4);
  B(g, 0.5, 0.05, 1.0, 0, 0.03, 0, BLACK());
  TUBE(g, [0, 0.05, 0.4], [0, 0.85, 0.25], 0.04, frame);
  TUBE(g, [0, 0.05, -0.35], [0, 0.7, -0.15], 0.04, frame);
  TUBE(g, [0, 0.3, 0.32], [0, 0.4, -0.3], 0.035, frame);
  C(g, 0.22, 0.22, 0.06, 0, 0.35, 0.32, BLACK(), [0, 0, Math.PI / 2], 24);
  RB(g, 0.22, 0.06, 0.3, 0.03, 0, 0.75, -0.15, BLACK());
  TUBE(g, [-0.22, 1.0, 0.25], [0.22, 1.0, 0.25], 0.018, BLACK());
  RB(g, 0.18, 0.12, 0.04, 0.01, 0, 0.98, 0.3, BLACK(), [-0.5, 0, 0]);
}
function yogaMat(g, ctx) {
  RB(g, 0.65, 0.012, 1.8, 0.005, 0, 0.006, 0, M(tintHex(ctx, '#b16bff'), 0.9));
  C(g, 0.06, 0.06, 0.65, 0, 0.06, -0.85, M(tintHex(ctx, '#b16bff'), 0.9), [0, 0, Math.PI / 2]);
}
function pullup(g) {
  const iron = M('#1b1b1d', 0.4, 0.7);
  [-0.6, 0.6].forEach((x) => {
    B(g, 0.08, 2.3, 0.08, x, 1.15, 0, iron);
    B(g, 0.08, 0.06, 0.8, x, 0.03, 0, iron);
  });
  C(g, 0.02, 0.02, 1.3, 0, 2.25, 0, CHROME(), [0, 0, Math.PI / 2]);
  C(g, 0.02, 0.02, 1.3, 0, 1.2, 0.2, CHROME(), [0, 0, Math.PI / 2]);
}
function foosball(g) {
  const wood = M('#2b1a12', 0.5);
  B(g, 1.3, 0.25, 0.8, 0, 0.8, 0, wood);
  B(g, 1.2, 0.01, 0.7, 0, 0.73, 0, M('#1f6b3a', 0.9));
  [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]].forEach(([x, z]) => B(g, 0.08, 0.72, 0.08, x, 0.36, z, wood));
  for (let i = 0; i < 6; i++) {
    const x = -0.5 + i * 0.2;
    C(g, 0.012, 0.012, 1.1, x, 0.84, 0, CHROME(), [Math.PI / 2, 0, 0]);
    C(g, 0.03, 0.03, 0.1, x, 0.84, 0.55 * (i % 2 ? 1 : -1), BLACK(), [Math.PI / 2, 0, 0]);
    for (let k = -1; k <= 1; k++) RB(g, 0.04, 0.12, 0.05, 0.01, x, 0.8, k * 0.2, M(i % 2 ? '#c8141e' : '#1f3a9a', 0.4));
  }
  SP(g, 0.02, 0.05, 0.75, 0.05, WHITE_CER());
}
function pingpong(g) {
  B(g, 2.74, 0.04, 1.52, 0, 0.76, 0, M('#1f4a8a', 0.4));
  B(g, 2.74, 0.005, 0.02, 0, 0.782, 0, M('#ffffff', 0.5));
  B(g, 0.02, 0.005, 1.52, 0, 0.782, 0, M('#ffffff', 0.5));
  B(g, 0.01, 0.15, 1.6, 0, 0.86, 0, M('#f4f4f4', 0.9, 0, { transparent: true, opacity: 0.6 }));
  [[-1.2, -0.65], [1.2, -0.65], [-1.2, 0.65], [1.2, 0.65]].forEach(([x, z]) => B(g, 0.05, 0.74, 0.05, x, 0.37, z, BLACK()));
  SP(g, 0.02, 0.6, 0.8, 0.3, M('#ff9a1a', 0.5));
  [-1, 1].forEach((s) => {
    C(g, 0.08, 0.08, 0.01, s * 1.0, 0.79, -0.4, M('#c8141e', 0.6), null, 20);
    B(g, 0.03, 0.01, 0.1, s * 1.0, 0.79, -0.27, M('#8a5a36', 0.6));
  });
}
function guitar(g) {
  C(g, 0.15, 0.2, 0.03, 0, 0.015, 0, BLACK());
  TUBE(g, [0, 0.02, -0.1], [0, 0.85, -0.15], 0.012, BLACK());
  const body = M('#b8141e', 0.25, 0.2);
  SP(g, 0.18, 0, 0.42, 0.02, body, 1, 1.0, 0.25);
  SP(g, 0.14, 0, 0.66, 0.02, body, 1, 1.0, 0.25);
  C(g, 0.05, 0.05, 0.01, 0, 0.55, 0.07, M('#111'), [Math.PI / 2, 0, 0]);
  B(g, 0.05, 0.6, 0.025, 0, 1.05, 0.02, M('#3a2216', 0.5));
  B(g, 0.08, 0.14, 0.03, 0, 1.4, 0.02, M('#1b1b1d', 0.4));
}
function piano(g) {
  const black = M('#0a0a0c', 0.08, 0.3);
  RB(g, 1.5, 1.0, 1.6, 0.05, 0, 1.0, 0, black);
  B(g, 1.5, 0.02, 1.6, 0, 1.52, -0.1, black, [-0.5, 0, 0]);
  B(g, 1.4, 0.06, 0.25, 0, 0.78, 0.9, black);
  B(g, 1.3, 0.025, 0.16, 0, 0.82, 0.93, WHITE_CER());
  for (let i = 0; i < 26; i++) if ([1, 2, 4, 5, 6].includes(i % 7)) B(g, 0.025, 0.02, 0.09, -0.62 + i * 0.05, 0.84, 0.89, M('#111'));
  [[-0.6, -0.6], [0.6, -0.6], [0, 0.7]].forEach(([x, z]) => C(g, 0.05, 0.04, 0.5, x, 0.25, z, black));
  RB(g, 0.7, 0.08, 0.35, 0.02, 0, 0.5, 1.4, black);
  [-0.3, 0.3].forEach((x) => C(g, 0.03, 0.03, 0.46, x, 0.23, 1.4, black));
}
function atmMachine(g) {
  RB(g, 0.8, 1.7, 0.6, 0.03, 0, 0.85, 0, M('#2a2d32', 0.35, 0.6));
  B(g, 0.7, 0.4, 0.05, 0, 1.25, 0.3, M('#141416', 0.3));
  const scr = labelTexture('atm', 128, 96, (c, w, h) => { c.fillStyle = '#0a3a6a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillText('PARARA', w / 2, 40); c.font = '12px sans-serif'; c.fillText('Kartınızı takın', w / 2, 66); });
  PLANE(g, 0.4, 0.3, own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: scr, emissiveIntensity: 1 })), 0, 1.27, 0.326);
  B(g, 0.6, 0.04, 0.25, 0, 0.98, 0.35, M('#3a3d42', 0.4, 0.6));
  for (let i = 0; i < 12; i++) B(g, 0.06, 0.02, 0.05, -0.12 + (i % 3) * 0.08, 1.0, 0.27 + Math.floor(i / 3) * 0.05, M('#cfd4da', 0.3, 0.5));
  B(g, 0.3, 0.02, 0.02, 0, 0.8, 0.31, M('#000'));
  const sign = labelTexture('atms', 256, 64, (c, w, h) => { c.fillStyle = '#ff2d8a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText('ATM', w / 2, 48); });
  PLANE(g, 0.7, 0.18, own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: sign, emissiveIntensity: 1.2 })), 0, 1.6, 0.302);
  return { light: { x: 0, y: 1.4, z: 0.6, color: '#ff4fb0', intensity: 1.5, distance: 3 }, on: true, setOn() {}, noToggle: true };
}
function officeDesk(g, ctx) {
  const w = M(tintHex(ctx, '#3a2216'), 0.35);
  RB(g, 2.0, 0.06, 0.9, 0.02, 0, 0.76, 0, w);
  B(g, 1.9, 0.7, 0.04, 0, 0.38, -0.4, w);
  [-0.95, 0.95].forEach((x) => B(g, 0.06, 0.73, 0.88, x, 0.365, 0, w));
  B(g, 0.6, 0.02, 0.45, -0.5, 0.795, 0.1, M('#141416', 0.9));
  B(g, 0.3, 0.2, 0.22, 0.6, 0.86, -0.2, M('#141416', 0.4));
  C(g, 0.04, 0.035, 0.1, 0.2, 0.84, 0.15, GOLD());
  RB(g, 0.5, 0.32, 0.02, 0.01, 0, 1.02, -0.25, BLACK(), [-0.1, 0, 0]);
  PLANE(g, 0.46, 0.28, own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: codeTexture(), emissiveIntensity: 0.8 })), 0, 1.02, -0.238, [-0.1, 0, 0]);
  // makam koltuğu
  const chair = new THREE.Group();
  chair.position.set(0, 0, -0.95);
  chair.rotation.y = Math.PI;
  g.add(chair);
  gamingChair(chair, { tint: { c: '#3a2216' } });
}
function fileCabinet(g, ctx) {
  const m = M(tintHex(ctx, '#6d7075'), 0.35, 0.7);
  B(g, 0.5, 1.3, 0.6, 0, 0.65, 0, m);
  for (let i = 0; i < 4; i++) {
    B(g, 0.46, 0.29, 0.01, 0, 0.18 + i * 0.31, 0.301, m);
    B(g, 0.14, 0.02, 0.03, 0, 0.27 + i * 0.31, 0.31, CHROME());
    B(g, 0.08, 0.04, 0.005, 0, 0.22 + i * 0.31, 0.307, WHITE_CER());
  }
}
function waterCooler(g) {
  B(g, 0.35, 0.95, 0.35, 0, 0.475, 0, M('#ececec', 0.3, 0.2));
  LATHE(g, [[0, 0], [0.15, 0.02], [0.16, 0.3], [0.13, 0.36], [0.04, 0.4], [0.04, 0.46], [0, 0.46]], M('#5ab0e8', 0.05, 0.1, { transparent: true, opacity: 0.6 }), 0, 0.95, 0);
  [-0.06, 0.06].forEach((x, i) => B(g, 0.04, 0.05, 0.04, x, 0.72, 0.19, M(i ? '#1f6fb8' : '#c8141e', 0.4)));
  B(g, 0.25, 0.02, 0.1, 0, 0.55, 0.15, M('#2a2d32', 0.4));
}

function rugPattern(kind) {
  return (g, ctx) => {
    const col = tintHex(ctx, '#6b1a22');
    const dims = { kilim: [2.6, 1.7], shag: [2.0, 2.0], runner: [3.4, 0.9], geo: [3.0, 2.0] }[kind];
    const tx = labelTexture(`rug${kind}_${col}`, 512, 340, (c, w, h, r) => {
      c.fillStyle = col;
      c.fillRect(0, 0, w, h);
      if (kind === 'kilim') {
        const cols = ['#e8d8b0', '#1f2a48', '#d4a53a', '#2d4a3a'];
        for (let row = 0; row < 5; row++) {
          for (let i = 0; i < 9; i++) {
            c.fillStyle = cols[(row + i) % 4];
            const x = 30 + i * 52;
            const y = 40 + row * 60;
            c.beginPath(); c.moveTo(x, y); c.lineTo(x + 22, y + 22); c.lineTo(x, y + 44); c.lineTo(x - 22, y + 22); c.closePath(); c.fill();
          }
        }
        c.strokeStyle = '#e8d8b0'; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20);
      } else if (kind === 'shag') {
        for (let i = 0; i < 26000; i++) { c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.18)'; c.fillRect(r() * w, r() * h, 2, 4); }
      } else if (kind === 'runner') {
        c.strokeStyle = '#d4a53a'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
        for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#1f2a48' : '#d4a53a'; c.beginPath(); c.arc(60 + i * 65, h / 2, 26, 0, 7); c.fill(); }
      } else {
        const cols = ['#e8e4dc', '#1b1b1d', '#d4a53a', '#4c4d53'];
        for (let i = 0; i < 14; i++) {
          c.fillStyle = cols[i % 4];
          c.beginPath(); c.moveTo(r() * w, r() * h); c.lineTo(r() * w, r() * h); c.lineTo(r() * w, r() * h); c.closePath(); c.fill();
        }
      }
    });
    const geo = kind === 'shag' ? new THREE.CircleGeometry(dims[0] / 2, 48) : new THREE.PlaneGeometry(dims[0], dims[1]);
    const o = new THREE.Mesh(geo, own(new THREE.MeshStandardMaterial({ map: tx, roughness: 1 })));
    o.rotation.x = -Math.PI / 2;
    o.position.y = 0.013;
    o.receiveShadow = true;
    g.add(o);
  };
}

// =============================================================================
// KATALOG
// =============================================================================
const G = (v) => ({ t: 'gold', v });
const E = (v) => ({ t: 'gem', v });

export const CATALOG = [
  // OTURMA
  { k: 'sofa3', name: "3'lü Koltuk", cat: 'oturma', icon: '🛋️', price: G(15000), tints: 'fabric', build: sofaBuild(2.6), box: [1.3, 0.48], seats: sofaSeats(2.6) },
  { k: 'sofa2', name: "2'li Koltuk", cat: 'oturma', icon: '🛋️', price: G(10000), tints: 'fabric', build: sofaBuild(1.9), box: [0.95, 0.48], seats: sofaSeats(1.9) },
  { k: 'armchair', name: 'Tekli Koltuk', cat: 'oturma', icon: '💺', price: G(6000), tints: 'fabric', build: sofaBuild(1.1, { deep: 0.9 }), box: [0.55, 0.45], seats: [[0, 0.5, 0.1]] },
  { k: 'sofaL', name: 'L Köşe Koltuk', cat: 'oturma', icon: '🛋️', price: G(28000), tints: 'fabric', build: lSofaBuild, boxes: [[0, 0, 1.4, 0.48], [0.95, 1.0, 0.45, 0.55]], seats: [...sofaSeats(2.8), [0.95, 0.5, 1.1]] },
  { k: 'chester', name: 'Chesterfield Deri Koltuk', cat: 'oturma', icon: '🛋️', price: E(90), tints: 'leather', build: sofaBuild(2.5, { leather: true, tufted: true, legs: 'dark' }), box: [1.25, 0.48], seats: sofaSeats(2.5) },
  { k: 'wingchair', name: 'Deri Berjer', cat: 'oturma', icon: '💺', price: E(40), tints: 'leather', build: armchairWing, box: [0.53, 0.45], seats: [[0, 0.5, 0.1]] },
  { k: 'chairw', name: 'Ahşap Sandalye', cat: 'oturma', icon: '🪑', price: null, tints: 'wood', build: chairWood, box: [0.23, 0.23], seats: [[0, 0.52, 0.02]] },
  { k: 'chairm', name: 'Modern Sandalye', cat: 'oturma', icon: '🪑', price: G(1500), tints: 'fabric', build: chairModern, box: [0.24, 0.24], seats: [[0, 0.52, 0.02]] },
  { k: 'stool', name: 'Bar Taburesi', cat: 'oturma', icon: '🪑', price: G(1200), tints: 'leather', build: stoolBar, box: [0.2, 0.2], seats: [[0, 0.84, 0]] },
  { k: 'gamer', name: 'Oyuncu Koltuğu', cat: 'oturma', icon: '🎮', price: E(35), tints: 'neon', build: gamingChair, box: [0.3, 0.3], seats: [[0, 0.55, 0.02]] },
  { k: 'beanbag', name: 'Armut Koltuk', cat: 'oturma', icon: '🟠', price: G(2500), tints: 'fabric', build: beanBag, box: [0.42, 0.42], seats: [[0, 0.42, 0.1]] },
  { k: 'ottoman', name: 'Puf', cat: 'oturma', icon: '🟣', price: G(1800), tints: 'fabric', build: ottoman, box: [0.32, 0.32], seats: [[0, 0.45, 0]] },

  // MASALAR
  { k: 'tdining', name: 'Yemek Masası', cat: 'masa', icon: '🍽️', price: G(8000), tints: 'wood', build: tableDining, box: [1.05, 0.5] },
  { k: 'tround', name: 'Yuvarlak Masa', cat: 'masa', icon: '⚪', price: G(5000), tints: 'wood', build: tableRound, box: [0.58, 0.58] },
  { k: 'tcoffee', name: 'Cam Sehpa', cat: 'masa', icon: '🔲', price: G(4000), tints: 'metal', build: coffeeTable, box: [0.6, 0.31] },
  { k: 'desk', name: 'Çalışma Masası', cat: 'masa', icon: '💻', price: G(7000), tints: 'wood', build: desk, box: [0.75, 0.35] },
  { k: 'tside', name: 'Yan Sehpa', cat: 'masa', icon: '🟫', price: G(1500), tints: 'wood', build: sideTable, box: [0.25, 0.21] },

  // MUTFAK
  { k: 'kcounter', name: 'Mutfak Tezgahı', cat: 'mutfak', icon: '🗄️', price: G(4000), tints: 'wood', build: kitchenCounter, box: [0.5, 0.31] },
  { k: 'ksink', name: 'Evyeli Tezgah', cat: 'mutfak', icon: '🚰', price: G(5000), tints: 'wood', build: kitchenSink, box: [0.6, 0.31] },
  { k: 'stove', name: 'Ocak & Fırın', cat: 'mutfak', icon: '🍳', price: G(6000), tints: 'appliance', build: stove, box: [0.4, 0.31] },
  { k: 'fridge', name: 'Buzdolabı', cat: 'mutfak', icon: '🧊', price: G(9000), tints: 'appliance', build: fridge, box: [0.43, 0.36] },
  { k: 'kisland', name: 'Mutfak Adası', cat: 'mutfak', icon: '🏝️', price: E(45), tints: 'wood', build: kitchenIsland, box: [1.1, 0.53] },
  { k: 'kupper', name: 'Üst Dolap', cat: 'mutfak', icon: '🗃️', price: G(2500), tints: 'wood', build: upperCabinet, wall: true, nobox: true },
  { k: 'kcoffee', name: 'Kahve Köşesi', cat: 'mutfak', icon: '☕', price: G(5500), build: coffeeMachine, box: [0.4, 0.31] },

  // BANYO
  { k: 'toilet', name: 'Klozet', cat: 'banyo', icon: '🚽', price: null, build: toilet, box: [0.22, 0.34], seats: [[0, 0.5, 0.05]] },
  { k: 'bsink', name: 'Lavabo & Ayna', cat: 'banyo', icon: '🪞', price: G(4000), tints: 'wood', build: sinkBath, box: [0.4, 0.25] },
  { k: 'shower', name: 'Duşakabin', cat: 'banyo', icon: '🚿', price: G(7000), build: shower, box: [0.5, 0.5] },
  { k: 'bathtub', name: 'Küvet', cat: 'banyo', icon: '🛁', price: G(9000), build: bathtub, box: [0.88, 0.42], seats: [[0, 0.45, 0]] },
  { k: 'jacuzzi', name: 'Jakuzi', cat: 'banyo', icon: '🫧', price: E(120), build: jacuzzi, box: [1.15, 1.15], seats: [[0, 0.45, 0.6], [0.6, 0.45, 0], [-0.6, 0.45, 0]] },

  // YATAK
  { k: 'bed2', name: 'Çift Kişilik Yatak', cat: 'yatak', icon: '🛏️', price: G(12000), tints: 'bed', build: bedBuild(1.6), box: [0.85, 1.08], seats: [[-0.4, 0.6, 0.8], [0.4, 0.6, 0.8]] },
  { k: 'bed1', name: 'Tek Kişilik Yatak', cat: 'yatak', icon: '🛏️', price: G(6000), tints: 'bed', build: bedBuild(0.95), box: [0.53, 1.08], seats: [[0, 0.6, 0.8]] },
  { k: 'wardrobe', name: 'Gardırop', cat: 'yatak', icon: '🚪', price: G(8000), tints: 'wood', build: wardrobe, box: [0.9, 0.32] },
  { k: 'dresser', name: 'Şifonyer & Ayna', cat: 'yatak', icon: '🪞', price: G(6000), tints: 'wood', build: dresser, box: [0.65, 0.26] },
  { k: 'nightst', name: 'Komodin & Lamba', cat: 'yatak', icon: '🛋️', price: G(2000), tints: 'wood', build: nightstand, box: [0.25, 0.21] },

  // ELEKTRONİK
  { k: 'tvstand', name: 'TV Ünitesi', cat: 'elektronik', icon: '📺', price: G(12000), tints: 'wood', build: tvStand, box: [1.1, 0.26] },
  { k: 'tvwall', name: 'Duvar TV', cat: 'elektronik', icon: '📺', price: G(10000), build: tvWall, wall: true, nobox: true },
  { k: 'speaker', name: 'Kule Hoparlör', cat: 'elektronik', icon: '🔊', price: G(3500), tints: 'wood', build: speaker, box: [0.17, 0.18] },
  { k: 'pc', name: 'Oyuncu Bilgisayarı', cat: 'elektronik', icon: '🖥️', price: E(80), tints: 'neon', build: pcSetup, box: [0.9, 0.4] },
  { k: 'arcade', name: 'Atari Makinesi', cat: 'elektronik', icon: '🕹️', price: E(60), tints: 'fabric', build: arcade, box: [0.35, 0.4] },
  { k: 'jukebox', name: 'Müzik Kutusu', cat: 'elektronik', icon: '🎵', price: E(70), build: jukebox, box: [0.45, 0.3] },
  { k: 'dj', name: 'DJ Kabini', cat: 'elektronik', icon: '🎧', price: E(110), build: djBooth, box: [1.0, 0.4] },

  // SİLAH
  { k: 'gunrack', name: 'Silah Askılığı', cat: 'silah', icon: '🔫', price: G(25000), tints: 'wood', build: gunRackWall(false), wall: true, nobox: true },
  { k: 'gunrackg', name: 'Altın Silah Askılığı', cat: 'silah', icon: '🔱', price: E(200), build: gunRackWall(true), wall: true, nobox: true },
  { k: 'guncab', name: 'Camlı Silah Dolabı', cat: 'silah', icon: '🗄️', price: E(95), tints: 'wood', build: gunCabinet, box: [0.7, 0.25] },
  { k: 'safe', name: 'Çelik Kasa', cat: 'silah', icon: '🔐', price: G(15000), build: safe(false), box: [0.4, 0.35] },
  { k: 'safeg', name: 'Altın Kasa', cat: 'silah', icon: '💰', price: E(150), build: safe(true), box: [0.4, 0.35] },
  { k: 'ammo', name: 'Mühimmat Sandığı', cat: 'silah', icon: '📦', price: G(3000), build: ammoCrate, box: [0.45, 0.25] },
  { k: 'guntable', name: 'Silah Bakım Masası', cat: 'silah', icon: '🛠️', price: G(9000), build: weaponTable, box: [0.8, 0.4] },

  // ARABALAR
  { k: 'car_sedan', name: 'Sedan', cat: 'araba', icon: '🚘', price: G(60000), tints: 'car', build: carBuild(CAR_SPECS.sedan), box: [0.93, 2.35], seats: carSeats(CAR_SPECS.sedan) },
  { k: 'car_sport', name: 'Spor Coupe', cat: 'araba', icon: '🏎️', price: E(180), tints: 'car', build: carBuild(CAR_SPECS.sport), box: [0.96, 2.22], seats: carSeats(CAR_SPECS.sport) },
  { k: 'car_suv', name: 'Arazi (SUV)', cat: 'araba', icon: '🚙', price: G(90000), tints: 'car', build: carBuild(CAR_SPECS.suv), box: [0.99, 2.42], seats: carSeats(CAR_SPECS.suv) },
  { k: 'car_muscle', name: 'Muscle Car', cat: 'araba', icon: '🚗', price: E(220), tints: 'car', build: carBuild(CAR_SPECS.muscle), box: [0.95, 2.47], seats: carSeats(CAR_SPECS.muscle) },
  { k: 'car_super', name: 'Süper Spor', cat: 'araba', icon: '🏁', price: E(450), tints: 'car', build: carBuild(CAR_SPECS.super), box: [1.0, 2.3], seats: carSeats(CAR_SPECS.super) },
  { k: 'car_classic', name: 'Klasik 60lar', cat: 'araba', icon: '🚖', price: E(260), tints: 'car', build: carBuild(CAR_SPECS.classic), box: [0.94, 2.4], seats: carSeats(CAR_SPECS.classic) },
  { k: 'car_pickup', name: 'Pikap', cat: 'araba', icon: '🛻', price: G(80000), tints: 'car', build: carBuild(CAR_SPECS.pickup), box: [1.0, 2.65], seats: carSeats(CAR_SPECS.pickup) },

  // MOTORLAR
  { k: 'moto_sport', name: 'Spor Motor', cat: 'motor', icon: '🏍️', price: E(90), tints: 'car', build: motoBuild('sport'), box: [0.22, 1.05], seats: [[0, 0.95, -0.3]] },
  { k: 'moto_chopper', name: 'Chopper', cat: 'motor', icon: '🏍️', price: E(120), tints: 'car', build: motoBuild('chopper'), box: [0.3, 1.4], seats: [[0, 0.78, -0.25]] },
  { k: 'moto_scooter', name: 'Scooter', cat: 'motor', icon: '🛵', price: G(18000), tints: 'car', build: motoBuild('scooter'), box: [0.25, 0.85], seats: [[0, 0.8, -0.3]] },
  { k: 'moto_cross', name: 'Cross Motor', cat: 'motor', icon: '🏍️', price: G(35000), tints: 'car', build: motoBuild('cross'), box: [0.22, 1.15], seats: [[0, 1.08, -0.2]] },

  // GARAJ
  { k: 'toolwall', name: 'Alet Panosu', cat: 'garaj', icon: '🔧', price: G(3000), build: toolWall, wall: true, nobox: true },
  { k: 'workbench', name: 'Tezgah & Takım', cat: 'garaj', icon: '🧰', price: G(6000), build: workbench, box: [1.0, 0.38] },
  { k: 'toolchest', name: 'Takım Dolabı', cat: 'garaj', icon: '🗄️', price: G(4000), build: toolChest, box: [0.45, 0.25] },
  { k: 'tires', name: 'Lastik Yığını', cat: 'garaj', icon: '🛞', price: null, build: tireStack, box: [0.36, 0.36] },
  { k: 'barrel', name: 'Varil', cat: 'garaj', icon: '🛢️', price: null, tints: 'fabric', build: barrel, box: [0.34, 0.34] },
  { k: 'crate', name: 'Tahta Sandık', cat: 'garaj', icon: '📦', price: null, build: crate, box: [0.46, 0.46] },

  // DEKOR
  { k: 'plantb', name: 'Büyük Bitki', cat: 'dekor', icon: '🪴', price: G(1500), tints: 'wood', build: plantBig, box: [0.25, 0.25] },
  { k: 'plants', name: 'Küçük Bitki', cat: 'dekor', icon: '🌵', price: G(600), tints: 'wood', build: plantSmall, box: [0.15, 0.15] },
  { k: 'palm', name: 'Palmiye', cat: 'dekor', icon: '🌴', price: G(3500), build: palm, box: [0.3, 0.3] },
  { k: 'rug', name: 'Halı', cat: 'hali', icon: '🟥', price: G(2500), tints: 'fabric', build: rugBuild(false), nobox: true, flat: true },
  { k: 'rugr', name: 'Yuvarlak Halı', cat: 'hali', icon: '⭕', price: G(2000), tints: 'fabric', build: rugBuild(true), nobox: true, flat: true },
  { k: 'lamp', name: 'Lambader', cat: 'dekor', icon: '💡', price: G(2000), tints: 'metal', build: floorLamp, box: [0.2, 0.2] },
  { k: 'painting', name: 'Tablo', cat: 'duvar', icon: '🖼️', price: G(3000), tints: 'art', build: painting, wall: true, nobox: true },
  { k: 'bookshelf', name: 'Kitaplık', cat: 'dekor', icon: '📚', price: G(5000), tints: 'wood', build: bookshelf, box: [0.6, 0.19] },
  { k: 'neon1', name: 'Neon "FAMILIA"', cat: 'duvar', icon: '💗', price: E(30), tints: 'neon', build: neonBuild('FAMILIA'), wall: true, nobox: true },
  { k: 'neon2', name: 'Neon "BOSS"', cat: 'duvar', icon: '💗', price: E(30), tints: 'neon', build: neonBuild('BOSS', 'bold 130px sans-serif'), wall: true, nobox: true },
  { k: 'neon3', name: 'Neon "NEON ŞEHİR"', cat: 'duvar', icon: '💗', price: E(30), tints: 'neon', build: neonBuild('NEON ŞEHİR', 'italic bold 78px Georgia, serif'), wall: true, nobox: true },
  { k: 'neon4', name: 'Neon Kalp', cat: 'duvar', icon: '❤️', price: E(25), tints: 'neon', build: neonBuild('♥', 'bold 160px sans-serif'), wall: true, nobox: true },
  { k: 'window', name: 'Şehir Manzaralı Pencere', cat: 'duvar', icon: '🪟', price: G(4000), build: windowCity, wall: true, nobox: true },
  { k: 'fanc', name: 'Tavan Pervanesi', cat: 'dekor', icon: '🌀', price: G(3000), build: ceilingFan, ceil: true, nobox: true },

  // LÜKS
  { k: 'chandelier', name: 'Kristal Avize', cat: 'luks', icon: '✨', price: E(100), build: chandelier, ceil: true, nobox: true },
  { k: 'fireplace', name: 'Şömine', cat: 'luks', icon: '🔥', price: E(85), build: fireplace, wall: true, boxWall: [0.95, 0.35] },
  { k: 'aquarium', name: 'Akvaryum', cat: 'luks', icon: '🐠', price: E(75), build: aquarium, box: [0.8, 0.26] },
  { k: 'statue', name: 'Altın Heykel', cat: 'luks', icon: '🗿', price: E(130), build: statue, box: [0.32, 0.32] },
  { k: 'bar', name: 'Bar Tezgahı', cat: 'luks', icon: '🥃', price: E(65), build: bar, box: [1.35, 0.45] },
  { k: 'money', name: 'Para Yığını', cat: 'luks', icon: '💵', price: E(160), build: moneyPile, box: [0.6, 0.4] },
  { k: 'goldbars', name: 'Altın Külçeler', cat: 'luks', icon: '🪙', price: E(250), build: goldBars, box: [0.5, 0.35] },

  // SPOR & OYUN
  { k: 'pool', name: 'Bilardo Masası', cat: 'spor', icon: '🎱', price: E(110), build: poolTable, box: [1.27, 0.72] },
  { k: 'bag', name: 'Boks Torbası', cat: 'spor', icon: '🥊', price: G(4500), build: punchingBag, box: [0.4, 0.4] },
  { k: 'bench', name: 'Bench Press', cat: 'spor', icon: '🏋️', price: G(6000), build: benchPress, box: [0.9, 0.62], seats: [[0, 0.52, 0.2]] },
  { k: 'treadmill', name: 'Koşu Bandı', cat: 'spor', icon: '🏃', price: G(7500), build: treadmill, box: [0.4, 0.9] },
  { k: 'dart', name: 'Dart Tahtası', cat: 'duvar', icon: '🎯', price: G(1500), build: dartBoard, wall: true, nobox: true },

  // YAPI
  { k: 'wall2', name: 'Duvar Bölücü (2 m)', cat: 'yapi', icon: '🧱', price: null, build: wallDivider(2), box: [1.0, 0.08] },
  { k: 'wall4', name: 'Duvar Bölücü (4 m)', cat: 'yapi', icon: '🧱', price: null, build: wallDivider(4), box: [2.0, 0.08] },
  { k: 'walldoor', name: 'Kapılı Bölme', cat: 'yapi', icon: '🚪', price: null, build: wallDoor, boxes: [[-0.8, 0, 0.42, 0.08], [0.8, 0, 0.42, 0.08]] },
  { k: 'glassdiv', name: 'Cam Bölme', cat: 'yapi', icon: '🔳', price: G(3000), build: glassDivider, box: [1.02, 0.05] },
  { k: 'column', name: 'Kolon', cat: 'yapi', icon: '🏛️', price: G(2000), tints: 'wood', build: column, box: [0.3, 0.3] },
  { k: 'podium', name: 'LED Sahne', cat: 'yapi', icon: '🎤', price: E(50), tints: 'neon', build: podium, nobox: true, flat: true },
  { k: 'doordeco', name: 'Ahşap Kapı', cat: 'yapi', icon: '🚪', price: G(2500), build: doorDecor, wall: true, nobox: true },

  // v66 — YENİ EŞYALAR
  { k: 'cafetable', name: 'Kafe Masası (2 Sandalye)', cat: 'masa', icon: '☕', tints: 'wood', build: cafeTable, box: [0.95, 0.4] },
  { k: 'bartable', name: 'Bar Masası', cat: 'masa', icon: '🍸', tints: 'wood', build: barTable, box: [0.35, 0.35] },
  { k: 'officedesk', name: 'Makam Masası', cat: 'masa', icon: '💼', tints: 'wood', build: officeDesk, boxes: [[0, 0, 1.0, 0.45], [0, -0.95, 0.3, 0.3]], seats: [[0, 0.55, -0.97]] },
  { k: 'washer', name: 'Çamaşır Makinesi', cat: 'banyo', icon: '🫧', tints: 'appliance', build: washer(false), box: [0.31, 0.3] },
  { k: 'dryer', name: 'Kurutma Makinesi', cat: 'banyo', icon: '🌀', tints: 'appliance', build: washer(true), box: [0.31, 0.3] },
  { k: 'pcstation', name: 'İnternet Kafe İstasyonu', cat: 'elektronik', icon: '🖥️', tints: 'neon', build: pcStation, box: [1.1, 0.38] },
  { k: 'console', name: 'Konsol & TV Seti', cat: 'elektronik', icon: '🎮', tints: 'wood', build: consoleSet, box: [0.8, 0.23] },
  { k: 'shelf', name: 'Market Rafı', cat: 'dukkan', icon: '🛒', tints: 'appliance', build: marketShelf, box: [0.82, 0.26] },
  { k: 'checkout', name: 'Kasa Tezgahı', cat: 'dukkan', icon: '🧾', tints: 'wood', build: checkoutCounter, box: [0.92, 0.35] },
  { k: 'glasscounter', name: 'Cam Tezgah (Vitrin)', cat: 'dukkan', icon: '💍', tints: 'metal', build: glassCounter, box: [0.82, 0.31] },
  { k: 'drinkfridge', name: 'İçecek Dolabı', cat: 'dukkan', icon: '🥤', tints: 'appliance', build: drinkFridge, box: [0.43, 0.36] },
  { k: 'icecream', name: 'Dondurma Dolabı', cat: 'dukkan', icon: '🍦', build: iceCream, box: [0.7, 0.36] },
  { k: 'fruitstand', name: 'Manav Tezgahı', cat: 'dukkan', icon: '🍎', build: fruitStand, box: [0.72, 0.42] },
  { k: 'cafecounter', name: 'Kafe Bar Tezgahı', cat: 'dukkan', icon: '☕', tints: 'wood', build: cafeCounter, box: [1.02, 0.36] },
  { k: 'cakecase', name: 'Pasta Vitrini', cat: 'dukkan', icon: '🍰', build: cakeCase, box: [0.5, 0.31] },
  { k: 'menuboard', name: 'Menü Tahtası', cat: 'dukkan', icon: '📋', build: menuBoard, wall: true, nobox: true },
  { k: 'clothesrack', name: 'Kıyafet Askılığı', cat: 'dukkan', icon: '👕', tints: 'fabric', build: clothesRack, box: [0.75, 0.27] },
  { k: 'mannequin', name: 'Manken', cat: 'dukkan', icon: '🧍', tints: 'fabric', build: mannequin, box: [0.2, 0.2] },
  { k: 'mirrorfull', name: 'Boy Aynası', cat: 'dukkan', icon: '🪞', tints: 'metal', build: mirrorFull, wall: true, nobox: true },
  { k: 'stagemic', name: 'Mikrofonlu Sahne', cat: 'dukkan', icon: '🎤', tints: 'neon', build: stageMic, boxes: [[-1.3, -0.6, 0.25, 0.22], [1.3, -0.6, 0.25, 0.22]], flat: true },
  { k: 'discoball', name: 'Disko Topu', cat: 'dukkan', icon: '🪩', build: discoBall, ceil: true, nobox: true },
  { k: 'filecab', name: 'Dosya Dolabı', cat: 'dukkan', icon: '🗂️', tints: 'appliance', build: fileCabinet, box: [0.26, 0.31] },
  { k: 'watercooler', name: 'Su Sebili', cat: 'dukkan', icon: '🚰', build: waterCooler, box: [0.2, 0.2] },
  { k: 'atm', name: 'ATM', cat: 'luks', icon: '🏧', build: atmMachine, box: [0.41, 0.31] },
  { k: 'piano', name: 'Kuyruklu Piyano', cat: 'luks', icon: '🎹', build: piano, box: [0.75, 0.85], seats: [[0, 0.58, 1.4]] },
  { k: 'vase', name: 'Çiçekli Vazo', cat: 'dekor', icon: '💐', tints: 'neon', build: vase, box: [0.14, 0.14] },
  { k: 'trash', name: 'Çöp Kutusu', cat: 'dekor', icon: '🗑️', tints: 'appliance', build: trashBin, box: [0.18, 0.18] },
  { k: 'extinguisher', name: 'Yangın Tüpü', cat: 'duvar', icon: '🧯', build: extinguisher, wall: true, nobox: true },
  { k: 'painting2', name: 'Manzara Tablosu', cat: 'duvar', icon: '🏞️', tints: 'art', build: painting2, wall: true, nobox: true },
  { k: 'painting3', name: 'Modern Tablo', cat: 'duvar', icon: '🎨', tints: 'art', build: painting3, wall: true, nobox: true },
  { k: 'triptych', name: 'Üçlü Tablo', cat: 'duvar', icon: '🖼️', tints: 'art', build: triptych, wall: true, nobox: true },
  { k: 'cityframe', name: 'Şehir Haritası', cat: 'duvar', icon: '🗺️', build: cityFrame, wall: true, nobox: true },
  { k: 'graffiti', name: 'Grafiti Duvarı', cat: 'duvar', icon: '🎨', tints: 'neon', build: graffiti, wall: true, nobox: true },
  { k: 'goldrecords', name: 'Altın Plaklar', cat: 'duvar', icon: '💿', build: goldRecords, wall: true, nobox: true },
  { k: 'clock', name: 'Duvar Saati', cat: 'duvar', icon: '🕰️', build: wallClock, wall: true, nobox: true },
  { k: 'wallshelf', name: 'Duvar Rafı', cat: 'duvar', icon: '📚', tints: 'wood', build: wallShelf, wall: true, nobox: true },
  { k: 'curtain', name: 'Perde', cat: 'duvar', icon: '🎭', tints: 'fabric', build: curtain, wall: true, nobox: true },
  { k: 'rugkilim', name: 'Kilim', cat: 'hali', icon: '🧶', tints: 'fabric', build: rugPattern('kilim'), nobox: true, flat: true },
  { k: 'rugshag', name: 'Peluş Halı', cat: 'hali', icon: '⚪', tints: 'fabric', build: rugPattern('shag'), nobox: true, flat: true },
  { k: 'rugrunner', name: 'Yolluk', cat: 'hali', icon: '➖', tints: 'fabric', build: rugPattern('runner'), nobox: true, flat: true },
  { k: 'ruggeo', name: 'Modern Halı', cat: 'hali', icon: '🔷', tints: 'fabric', build: rugPattern('geo'), nobox: true, flat: true },
  { k: 'dumbbells', name: 'Dambıl Seti', cat: 'spor', icon: '🏋️', build: dumbbells, box: [0.72, 0.25] },
  { k: 'bike', name: 'Kondisyon Bisikleti', cat: 'spor', icon: '🚴', tints: 'fabric', build: exerciseBike, box: [0.25, 0.5], seats: [[0, 0.82, -0.15]] },
  { k: 'yogamat', name: 'Yoga Matı', cat: 'spor', icon: '🧘', tints: 'neon', build: yogaMat, nobox: true, flat: true },
  { k: 'pullup', name: 'Barfiks İstasyonu', cat: 'spor', icon: '💪', build: pullup, boxes: [[-0.6, 0, 0.06, 0.4], [0.6, 0, 0.06, 0.4]] },
  { k: 'foosball', name: 'Langırt', cat: 'spor', icon: '⚽', build: foosball, box: [0.65, 0.42] },
  { k: 'pingpong', name: 'Masa Tenisi', cat: 'spor', icon: '🏓', build: pingpong, box: [1.37, 0.78] },
  { k: 'guitar', name: 'Elektro Gitar', cat: 'spor', icon: '🎸', build: guitar, box: [0.18, 0.18] },
  { k: 'fence', name: 'Çit (2 m)', cat: 'dis', icon: '🚧', tints: 'wood', build: fence, box: [1.0, 0.05] },
  { k: 'parkbench', name: 'Park Bankı', cat: 'dis', icon: '🪑', tints: 'wood', build: parkBench, box: [0.82, 0.3], seats: [[-0.4, 0.5, -0.02], [0.4, 0.5, -0.02]] },
  { k: 'streetlamp', name: 'Sokak Lambası', cat: 'dis', icon: '🏮', build: streetLamp, box: [0.2, 0.2] },
  { k: 'turf', name: 'Çim Halı', cat: 'dis', icon: '🟩', build: turf, nobox: true, flat: true },
  { k: 'planter', name: 'Çiçeklik', cat: 'dis', icon: '🌷', tints: 'appliance', build: planter, box: [0.6, 0.2] },
];

// v66: fiyatlar ve eşyadan alınabilen ürünler TEK kaynaktan (sunucuyla ortak dosya)
CATALOG.forEach((d) => {
  d.price = ITEM_PRICES[d.k] || null;
  d.takes = HOUSE_TAKEABLES[d.k] || null;
});
CATALOG.find((d) => d.k === 'arcade').panel = 'arcade';
CATALOG.find((d) => d.k === 'jukebox').panel = 'jukebox';
export const CATALOG_MAP = Object.fromEntries(CATALOG.map((d) => [d.k, d]));

export function formatPrice(p) {
  if (!p) return 'Ücretsiz';
  if (p.t === 'gem') return `💎 ${p.v}`;
  return `🪙 ${p.v >= 1000 ? `${(p.v / 1000).toLocaleString('tr-TR')}K` : p.v}`;
}

// Bir eşyanın 3D nesnesini üretir. live=false → önizleme/küçük resim (ışık yok).
export function buildItem(k, { ti = 0, live = true, wallMat = null, H = 3.4 } = {}) {
  const def = CATALOG_MAP[k];
  if (!def) return null;
  const g = new THREE.Group();
  const tints = def.tints ? TINTS[def.tints] : null;
  const tint = tints ? tints[Math.max(0, Math.min(tints.length - 1, ti || 0))] : null;
  const ret = def.build(g, { tint, ti: ti || 0, live, wallMat, H }) || null;
  g.userData.def = def;
  g.userData.ctl = ret;
  return g;
}

// Oturulabilecek / etkileşilebilecek her şeyin yerel çarpışma kutuları.
export function itemBoxes(def) {
  if (def.nobox) return [];
  if (def.boxes) return def.boxes;
  if (def.boxWall) return [[0, def.boxWall[1], def.boxWall[0], def.boxWall[1]]];
  if (def.box) return [[0, 0, def.box[0], def.box[1]]];
  return [];
}

export function disposeObject(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      [].concat(c.material).forEach((m) => {
        if (m.userData?.shared) return;
        if (m.userData?.tex) m.userData.tex.dispose();
        m.dispose();
      });
    }
  });
}
