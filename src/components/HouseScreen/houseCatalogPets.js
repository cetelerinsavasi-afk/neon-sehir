import * as THREE from 'three';
import { ANIMALS, PET_TINTS, petTintsKey } from '../../../functions/animalData.js';

// =============================================================================
// houseCatalogPets.js — v137 HAYVANLAR + PETSHOP mobilyaları
//   • Hayvanlar: yerde pati izli küçük platform (sadece Tasarla'da görünür); satın
//     alınınca üstünde hayvan durur / gezer (housePets.js). Renk = renk seçeneği.
//   • Petshop: mama / su kabı, kum kabı, mama çuvalı, oyuncaklar, tasma askısı,
//     evcil yatağı, hamster çarkı, kuş kafesi, tırmalama ağacı, köpek kulübesi,
//     kümes, mini ahır, 💎 Neon Kedi Sarayı. Hayvanlar bunların yanına gider.
// Ölçüler METRE; zemin y=0; eşyanın önü +z. B(g, w, h, d, renk, x, yAlt, z).
// Fiyatlar functions/houseCatalogData.js (ITEM_PRICES).
// =============================================================================

const PI = Math.PI;
const matCache = new Map();
function M(color, rough = 0.55, metal = 0.05) {
  const key = `${color}|${rough}|${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}
function K(c, o) {
  o = o || {};
  if (c && c.isMaterial) return c;
  if (!o.e && o.op == null) return M(c, o.r ?? 0.55, o.m ?? 0.05);
  const p = { color: new THREE.Color(c), roughness: o.r ?? 0.5, metalness: o.m ?? 0.05 };
  if (o.e) {
    p.emissive = new THREE.Color(o.e);
    p.emissiveIntensity = o.ei ?? 1;
  }
  if (o.op != null) {
    p.transparent = true;
    p.opacity = o.op;
    p.depthWrite = o.op > 0.7;
  }
  const m = new THREE.MeshStandardMaterial(p);
  m.userData.own = true;
  return m;
}
function add(g, geo, m, x, y, z) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = !(m.transparent && m.opacity < 0.7);
  me.receiveShadow = true;
  g.add(me);
  return me;
}
const B = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => add(g, new THREE.BoxGeometry(w, h, d), K(c, o), x, y + h / 2, z);
const Cy = (g, r, h, c, x = 0, y = 0, z = 0, o, seg = 18, rt) => add(g, new THREE.CylinderGeometry(rt ?? r, r, h, seg), K(c, o), x, y + h / 2, z);
const Sp = (g, r, c, x = 0, y = 0, z = 0, o, seg = 14) => add(g, new THREE.SphereGeometry(r, seg, Math.max(8, (seg * 0.75) | 0)), K(c, o), x, y, z);
const Tor = (g, r, t, c, x, y, z, rot = [PI / 2, 0, 0], o, arc = PI * 2) => {
  const me = add(g, new THREE.TorusGeometry(r, t, 8, 28, arc), K(c, o), x, y, z);
  me.rotation.set(...rot);
  return me;
};
function rod(g, a, b, r, c) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8), K(c));
  me.position.copy(va).add(vb).multiplyScalar(0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  me.castShadow = true;
  g.add(me);
  return me;
}
// beşgen çatı (iki eğik plaka)
function roof(g, w, d, y, h, c) {
  const half = w / 2;
  const sl = Math.hypot(half, h) + 0.03;
  const ang = Math.atan2(h, half);
  for (const s of [1, -1]) {
    const me = add(g, new THREE.BoxGeometry(sl, 0.035, d + 0.08), K(c), (s * half) / 2, y + h / 2, 0);
    me.rotation.z = -s * ang;
  }
}

// ── HAYVAN PLATFORMU (Tasarla'da görünür; hayvan üstünde durur)
export function petPad(g) {
  Cy(g, 0.26, 0.025, '#2a1d14', 0, 0, 0, { r: 0.6 });
  Tor(g, 0.24, 0.012, '#ffb347', 0, 0.028, 0, [PI / 2, 0, 0], { e: '#ffb347', ei: 1.2 });
  // pati izi
  const paw = '#ffd9a8';
  Sp(g, 0.06, paw, 0, 0.03, 0.03, { e: '#ffb347', ei: 0.5 }, 10).scale.set(1, 0.18, 0.85);
  for (const [x, z] of [[-0.07, -0.05], [-0.025, -0.08], [0.025, -0.08], [0.07, -0.05]]) Sp(g, 0.024, paw, x, 0.03, z, { e: '#ffb347', ei: 0.5 }, 8).scale.set(1, 0.25, 1);
}

// ── PETSHOP
function bowl(g, c, fill, x = 0, z = 0) {
  Cy(g, 0.12, 0.06, c, x, 0, z, { r: 0.35, m: 0.2 }, 22, 0.14);
  Cy(g, 0.105, 0.012, fill, x, 0.05, z, { r: 0.9 }, 20);
}
function mamaKabi(g) {
  bowl(g, '#c81d3f', '#8a5a2a');
  // mama taneleri
  for (let i = 0; i < 9; i++) Sp(g, 0.018, i % 2 ? '#a0682e' : '#6a3f1a', Math.cos(i * 2.4) * 0.06, 0.068, Math.sin(i * 2.4) * 0.06, null, 6);
}
function suKabi(g) {
  bowl(g, '#1f6fd6', '#7fd3ff');
  Cy(g, 0.1, 0.006, '#bfeaff', 0, 0.062, 0, { op: 0.6, r: 0.05 }, 20);
}
function kumKabi(g) {
  B(g, 0.5, 0.12, 0.38, '#7a8a9a', 0, 0, 0, { r: 0.4 });
  B(g, 0.44, 0.02, 0.32, '#d9c9a0', 0, 0.1, 0, { r: 1 });
  B(g, 0.5, 0.03, 0.04, '#5f6d7a', 0, 0.12, 0.17);
}
function mamaCuvali(g) {
  const s = Sp(g, 0.2, '#d9b45a', 0, 0.26, 0, { r: 0.9 }, 14);
  s.scale.set(1, 1.35, 0.7);
  B(g, 0.22, 0.12, 0.01, '#c81d3f', 0, 0.22, 0.14);
  Sp(g, 0.03, '#ffffff', 0, 0.28, 0.15, null, 8).scale.set(1, 1, 0.3);
  Cy(g, 0.12, 0.04, '#c4a048', 0, 0.5, 0, null, 12, 0.06);
}
function oyuncak(g) {
  Sp(g, 0.07, '#ffd23f', -0.12, 0.07, 0.02, { r: 0.3 });
  Tor(g, 0.07, 0.008, '#ff2e88', -0.12, 0.07, 0.02, [0, 0, 0]);
  // kemik
  rod(g, [0.02, 0.03, -0.04], [0.22, 0.03, 0.04], 0.022, '#f4ede0');
  for (const [x, z] of [[0.02, -0.04], [0.22, 0.04]]) {
    Sp(g, 0.03, '#f4ede0', x, 0.03, z - 0.025, null, 8);
    Sp(g, 0.03, '#f4ede0', x, 0.03, z + 0.025, null, 8);
  }
  // halat oyuncak
  rod(g, [-0.05, 0.025, 0.14], [0.12, 0.025, 0.16], 0.02, '#e8742a');
}
function tasmaAski(g) {
  B(g, 0.5, 0.08, 0.025, '#6a4426', 0, 1.25, 0.012);
  const cols = ['#ff2e88', '#22d3ee', '#ffd23f'];
  cols.forEach((c, i) => {
    const x = -0.16 + i * 0.16;
    Cy(g, 0.012, 0.05, '#c0c4cc', x, 1.24, 0.04, { m: 0.8, r: 0.3 });
    rod(g, [x, 1.24, 0.06], [x + 0.02, 0.9, 0.05], 0.012, c);
    Tor(g, 0.05, 0.012, c, x + 0.02, 0.86, 0.05, [0, 0, 0]);
  });
}
function evcilYatak(g, ctx) {
  const c = ctx.tint?.c || '#7a5a9a';
  Cy(g, 0.4, 0.06, '#3a2a1c', 0, 0, 0, { r: 0.8 }, 26);
  Tor(g, 0.33, 0.085, c, 0, 0.13, 0, [PI / 2, 0, 0], { r: 0.95 });
  Cy(g, 0.32, 0.06, shade(c, 0.25), 0, 0.05, 0, { r: 1 }, 24);
}
function hamsterCark(g) {
  B(g, 0.36, 0.04, 0.24, '#f4f4f0', 0, 0, 0);
  for (const s of [-1, 1]) rod(g, [s * 0.12, 0.04, 0], [s * 0.04, 0.24, 0], 0.012, '#c0c4cc');
  const wheel = new THREE.Group();
  wheel.position.set(0, 0.24, 0);
  g.add(wheel);
  Tor(wheel, 0.17, 0.014, '#22d3ee', 0, 0, -0.05, [0, 0, 0], { e: '#22d3ee', ei: 0.6 });
  Tor(wheel, 0.17, 0.014, '#22d3ee', 0, 0, 0.05, [0, 0, 0], { e: '#22d3ee', ei: 0.6 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    add(wheel, new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), K('#e8f4ff'), Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0).rotation.x = PI / 2;
  }
  return { tick: (t) => (wheel.rotation.z = -t * 2.2) };
}
function kusKafesi(g) {
  Cy(g, 0.16, 0.04, '#d4af37', 0, 0.9, 0, { m: 0.8, r: 0.3 }, 20);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    rod(g, [Math.cos(a) * 0.16, 0.94, Math.sin(a) * 0.16], [Math.cos(a) * 0.06, 1.4, Math.sin(a) * 0.06], 0.005, '#d4af37');
  }
  Sp(g, 0.03, '#d4af37', 0, 1.42, 0, { m: 0.8, r: 0.3 }, 10);
  rod(g, [-0.12, 1.02, 0], [0.12, 1.02, 0], 0.008, '#8a5a2a');
  // ayak
  Cy(g, 0.02, 0.88, '#2b2b33', 0, 0.02, 0, { m: 0.6, r: 0.4 }, 10);
  Cy(g, 0.16, 0.025, '#2b2b33', 0, 0, 0, { m: 0.6, r: 0.4 }, 18);
}
function tirmalama(g, ctx) {
  const c = ctx.tint?.c || '#b8a07a';
  Cy(g, 0.36, 0.06, c, 0, 0, 0, { r: 1 }, 6);
  Cy(g, 0.06, 0.55, '#c9a26a', -0.12, 0.06, 0, { r: 1 }, 10); // sisal
  Cy(g, 0.06, 0.95, '#c9a26a', 0.14, 0.06, -0.06, { r: 1 }, 10);
  Cy(g, 0.22, 0.05, c, -0.12, 0.61, 0, { r: 1 }, 18);
  Cy(g, 0.2, 0.05, c, 0.14, 1.01, -0.06, { r: 1 }, 18);
  // küçük ev
  B(g, 0.3, 0.26, 0.28, c, 0.06, 0.06, 0.1, { r: 1 });
  Cy(g, 0.08, 0.02, '#2a1d14', 0.06, 0.12, 0.25, null, 16).rotation.x = PI / 2;
  // sallanan top
  rod(g, [-0.24, 0.64, 0], [-0.3, 0.42, 0.02], 0.004, '#f4ede0');
  Sp(g, 0.035, '#ff2e88', -0.3, 0.4, 0.02, null, 10);
}
function kulube(g, ctx) {
  const c = ctx.tint?.c || '#a0522d';
  const r = ctx.tint?.r || '#5a2a1a';
  B(g, 0.8, 0.6, 0.9, c, 0, 0, -0.05, { r: 0.9 });
  roof(g, 0.86, 0.96, 0.6, 0.34, r);
  // kapı
  B(g, 0.34, 0.42, 0.02, '#1a120c', 0, 0.02, 0.405);
  Cy(g, 0.17, 0.02, '#1a120c', 0, 0.44, 0.405, null, 20).rotation.x = PI / 2;
  // isim levhası
  B(g, 0.3, 0.08, 0.02, '#f4ede0', 0, 0.68, 0.43);
  B(g, 0.2, 0.025, 0.01, '#5a2a1a', 0, 0.705, 0.442);
}
function kumes(g) {
  const w = '#c9a26a';
  B(g, 1.0, 0.55, 0.7, w, 0, 0.35, 0, { r: 0.9 });
  roof(g, 1.06, 0.76, 0.9, 0.3, '#8a3a2a');
  for (const [x, z] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) B(g, 0.06, 0.36, 0.06, '#6a4426', x, 0, z);
  // kapı + rampa
  B(g, 0.22, 0.26, 0.02, '#3a2414', 0.2, 0.4, 0.36);
  const rp = add(g, new THREE.BoxGeometry(0.22, 0.02, 0.5), K('#8a6a3a'), 0.2, 0.18, 0.56);
  rp.rotation.x = 0.68;
  for (let i = 0; i < 4; i++) B(g, 0.22, 0.015, 0.02, '#5a3a1c', 0.2, 0.08 + i * 0.07, 0.72 - i * 0.08);
  // pencere
  B(g, 0.18, 0.14, 0.02, '#1a120c', -0.24, 0.6, 0.36);
  // saman
  for (let i = 0; i < 6; i++) B(g, 0.12, 0.02, 0.03, '#e8c75a', -0.32 + i * 0.12, 0.35, 0.36, null).rotation.z = (i % 2 ? 1 : -1) * 0.3;
}
function ahir(g) {
  const w = '#7a4a2a';
  // arka duvar + yan bölmeler
  B(g, 1.6, 1.3, 0.08, w, 0, 0, -0.66, { r: 0.9 });
  for (const s of [-1, 1]) B(g, 0.08, 1.1, 1.3, w, s * 0.78, 0, 0, { r: 0.9 });
  roof(g, 1.72, 1.45, 1.3, 0.35, '#8a2a1a');
  // yarım kapı (X çapraz)
  B(g, 0.72, 0.6, 0.05, '#a0623a', -0.38, 0, 0.62);
  rod(g, [-0.72, 0.05, 0.65], [-0.04, 0.55, 0.65], 0.022, '#f4ede0');
  rod(g, [-0.72, 0.55, 0.65], [-0.04, 0.05, 0.65], 0.022, '#f4ede0');
  // saman balyası + yemlik
  B(g, 0.5, 0.3, 0.32, '#e8c75a', 0.4, 0, -0.4, { r: 1 });
  for (let i = 0; i < 3; i++) B(g, 0.51, 0.02, 0.33, '#c9a23a', 0.4, 0.08 + i * 0.09, -0.4);
  B(g, 0.6, 0.2, 0.22, '#5a3a1c', -0.4, 0.4, -0.5);
  // nal
  Tor(g, 0.07, 0.014, '#c0c4cc', 0, 1.1, -0.61, [0, 0, PI], { m: 0.8, r: 0.3 }, PI * 1.4);
}
function neonSaray(g) {
  // 💎 çok katlı kedi sarayı: neon şeritli kuleler, ev, köprü, taç
  const base = '#1b1230';
  const neon = { e: '#ff2e88', ei: 1.6 };
  const neon2 = { e: '#22d3ee', ei: 1.6 };
  B(g, 1.0, 0.07, 0.6, base, 0, 0, 0, { r: 0.6 });
  B(g, 1.0, 0.012, 0.6, '#ff2e88', 0, 0.07, 0, neon);
  Cy(g, 0.07, 1.1, '#c9a26a', -0.34, 0.07, -0.12, { r: 1 }, 10);
  Cy(g, 0.07, 1.6, '#c9a26a', 0.36, 0.07, -0.12, { r: 1 }, 10);
  // katlar
  B(g, 0.42, 0.05, 0.42, base, -0.34, 0.6, -0.04);
  B(g, 0.42, 0.012, 0.42, '#22d3ee', -0.34, 0.65, -0.04, neon2);
  B(g, 0.42, 0.05, 0.42, base, 0.36, 1.1, -0.04);
  B(g, 0.42, 0.012, 0.42, '#ff2e88', 0.36, 1.15, -0.04, neon);
  B(g, 0.46, 0.05, 0.46, base, 0.36, 1.67, -0.06);
  // ev (alt kat)
  B(g, 0.46, 0.36, 0.4, '#2b1d4a', 0.1, 0.07, 0.04, { r: 0.6 });
  Cy(g, 0.1, 0.02, '#0a0612', 0.1, 0.2, 0.25, null, 20).rotation.x = PI / 2;
  Tor(g, 0.1, 0.012, '#22d3ee', 0.1, 0.2, 0.25, [0, 0, 0], neon2);
  // köprü
  const br = add(g, new THREE.BoxGeometry(0.62, 0.03, 0.18), K(base), 0.01, 0.88, -0.04);
  br.rotation.z = 0.78;
  // taç
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    add(g, new THREE.ConeGeometry(0.035, 0.12, 8), K('#ffd23f', { e: '#ffb300', ei: 0.9, m: 0.6 }), 0.36 + Math.cos(a) * 0.14, 1.78, -0.06 + Math.sin(a) * 0.14);
  }
  Tor(g, 0.15, 0.015, '#ffd23f', 0.36, 1.73, -0.06, [PI / 2, 0, 0], { e: '#ffb300', ei: 1, m: 0.6 });
  // minder
  Cy(g, 0.17, 0.05, '#ff2e88', -0.34, 0.65, -0.04, { r: 1 }, 18);
}
function shade(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a))));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const PET_CATEGORIES = [
  { key: 'hayvan', name: 'Hayvanlar', icon: '🐾' },
  { key: 'petshop', name: 'Petshop', icon: '🦴' },
];

export const PETSHOP_TINTS = {
  petbed: [
    { n: 'Mor', c: '#7a5a9a' }, { n: 'Kırmızı', c: '#c81d3f' }, { n: 'Mavi', c: '#2a6bff' }, { n: 'Gri', c: '#8f959e' },
    { n: 'Pembe', c: '#ff7ab8' }, { n: 'Krem', c: '#e8d6b4' }, { n: 'Siyah', c: '#22222a' },
  ],
  kulube: [
    { n: 'Kiremit', c: '#a0522d', r: '#5a2a1a' }, { n: 'Beyaz', c: '#ecebe6', r: '#b8141e' }, { n: 'Mavi', c: '#3a6ea5', r: '#1d2f4a' },
    { n: 'Yeşil', c: '#4f8a4a', r: '#2a3a1c' }, { n: 'Sarı', c: '#e0a800', r: '#6a3a1c' },
  ].map((t) => ({ ...t, sw: `linear-gradient(135deg, ${t.c} 55%, ${t.r} 55%)` })),
  catwood: [{ n: 'Bej', c: '#b8a07a' }, { n: 'Gri', c: '#8f959e' }, { n: 'Beyaz', c: '#ecebe6' }, { n: 'Antrasit', c: '#3a3d44' }],
};

export function petCatalogEntries() {
  const out = [];
  ANIMALS.forEach((a) => out.push({ k: a.k, name: a.name, cat: 'hayvan', icon: a.icon, build: petPad, nobox: true, flat: true, tints: petTintsKey(a.k), animal: a.art }));
  const P = (k, name, icon, build, opts = {}) => out.push({ k, name, cat: 'petshop', icon, build, ...opts });
  P('ps_mama', 'Mama Kabı', '🥣', mamaKabi, { box: [0.14, 0.14] });
  P('ps_su', 'Su Kabı', '💧', suKabi, { box: [0.14, 0.14] });
  P('ps_kumkabi', 'Kum Kabı', '🧺', kumKabi, { box: [0.25, 0.19] });
  P('ps_cuval', 'Mama Çuvalı', '🛍️', mamaCuvali, { box: [0.2, 0.15] });
  P('ps_oyuncak', 'Top & Kemik', '🦴', oyuncak, { nobox: true, flat: true });
  P('ps_tasma', 'Tasma Askısı', '🦮', tasmaAski, { wall: true, nobox: true });
  P('ps_yatak', 'Evcil Yatağı', '🛏️', evcilYatak, { tints: 'petbed', nobox: true, flat: true });
  P('ps_cark', 'Hamster Çarkı', '🎡', hamsterCark, { box: [0.18, 0.12] });
  P('ps_kafes', 'Kuş Kafesi', '🪺', kusKafesi, { box: [0.17, 0.17] });
  P('ps_tirmalama', 'Tırmalama Ağacı', '🐈', tirmalama, { tints: 'catwood', box: [0.36, 0.3] });
  P('ps_kulube', 'Köpek Kulübesi', '🏠', kulube, { tints: 'kulube', box: [0.43, 0.5] });
  P('ps_kumes', 'Kümes', '🐔', kumes, { box: [0.52, 0.38] });
  P('ps_ahir', 'Mini Ahır', '🐴', ahir, { boxes: [[0, -0.66, 0.8, 0.06], [-0.78, 0, 0.06, 0.65], [0.78, 0, 0.06, 0.65]] });
  P('ps_saray', 'Neon Kedi Sarayı', '🏰', neonSaray, { box: [0.5, 0.3] });
  return out;
}
export { PET_TINTS };
