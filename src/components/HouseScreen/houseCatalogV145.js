import * as THREE from 'three';
import { labelTexture } from './houseTextures';

// =============================================================================
// houseCatalogV145.js — v145 Seyyar satıcılar 3D
//   • Satıcı arabaları: Kokoreç Arabası, Döner Arabası, Simit Tezgâhı, Köfte
//     Arabası (mağazada da satılır; evde/işletmede ürünü alınır — kafe/bar
//     menüsüne de girer). Oyunun seyyar satıcı mekânlarında ürünler ücretli
//     (mekânın paneli), eşyadan ücretsiz alınmaz.
//   • Plastik masa + plastik tabure (renkli), sahil korkuluğu, neon tabelalar
//     (KOKOREÇ / DÖNER / SİMİT / KÖFTE).
//   • Sadece mekânlarda (venueOnly): 18 m'lik asfalt yol şeridi (bordür taşıyla),
//     yaya geçidi, deniz şeridi (rıhtım kenarı; üstüne yürünmez).
// Ölçüler METRE; zemin y=0; eşyanın önü +z. B(g, w, h, d, renk, x, yAlt, z) → y = parçanın ALTI.
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
// o: { e: emissive, ei, op: opaklık, map, side, r, m }
function K(c, o = {}) {
  if (c && c.isMaterial) return c;
  const plain = !o.e && o.op == null && !o.map && !o.side;
  if (plain) return M(c, o.r ?? 0.55, o.m ?? 0.05);
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
  if (o.map) {
    p.map = o.map;
    if (o.e) p.emissiveMap = o.map;
  }
  if (o.side) p.side = THREE.DoubleSide;
  const m = new THREE.MeshStandardMaterial(p);
  m.userData.own = true;
  return m;
}
const mm = (c, o) => (c && c.isMaterial ? c : K(c, o || {}));
function add(g, geo, m, x, y, z) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  const tr = m.transparent && m.opacity < 0.7;
  me.castShadow = !tr;
  me.receiveShadow = true;
  g.add(me);
  return me;
}
const B = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => add(g, new THREE.BoxGeometry(w, h, d), mm(c, o), x, y + h / 2, z);
const Cy = (g, r, h, c, x = 0, y = 0, z = 0, o, seg = 18, rt) => add(g, new THREE.CylinderGeometry(rt ?? r, r, h, seg), mm(c, o), x, y + h / 2, z);
const Sp = (g, r, c, x = 0, y = 0, z = 0, o, seg = 14) => add(g, new THREE.SphereGeometry(r, seg, Math.max(8, (seg * 0.75) | 0)), mm(c, o), x, y, z);
const To = (g, r, t, c, x = 0, y = 0, z = 0, o) => add(g, new THREE.TorusGeometry(r, t, 8, 20), mm(c, o), x, y, z);
const Pl = (g, w, h, m, x = 0, y = 0, z = 0) => {
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  me.position.set(x, y, z);
  me.receiveShadow = true;
  g.add(me);
  return me;
};
function CyX(g, r, len, c, x, y, z, o, seg = 18) {
  const m = add(g, new THREE.CylinderGeometry(r, r, len, seg), mm(c, o), x, y, z);
  m.rotation.z = PI / 2;
  return m;
}
function sub(g, x = 0, y = 0, z = 0, ry = 0) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  return s;
}
const tex = (key, w, h, fn) => labelTexture(`v145_${key}`, w, h, (x) => fn(x, w, h));

// =============================================================================
// DOKULAR
// =============================================================================
// Araba tabelası: renkli zemin, kalın beyaz yazı, ince çerçeve
function signTex(text, bg, fg = '#ffffff', edge = '#1a1a1a') {
  return tex(`sign_${text}_${bg}`, 512, 128, (x, w, h) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = edge;
    x.lineWidth = 8;
    x.strokeRect(6, 6, w - 12, h - 12);
    x.font = '900 78px "Arial Black", Arial, sans-serif';
    const tw = x.measureText(text).width;
    if (tw > w * 0.86) x.font = `900 ${Math.floor((78 * w * 0.86) / tw)}px "Arial Black", Arial, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 10;
    x.strokeStyle = edge;
    x.strokeText(text, w / 2, h / 2 + 4);
    x.fillStyle = fg;
    x.fillText(text, w / 2, h / 2 + 4);
  });
}
// Asfalt yol: koyu zemin + kumlanma, ortada kesikli şerit, kenarlarda düz çizgi.
// 18 m × 3 m → 1152 × 192 piksel (64 px / m)
function roadTex() {
  return tex('road', 1152, 192, (x, w, h) => {
    x.fillStyle = '#2c2f35';
    x.fillRect(0, 0, w, h);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      const v = 30 + Math.floor(r() * 40);
      x.fillStyle = `rgba(${v},${v + 2},${v + 6},0.55)`;
      x.fillRect(r() * w, r() * h, 2, 2);
    }
    // yama / leke
    for (let i = 0; i < 7; i++) {
      x.fillStyle = 'rgba(15,16,20,0.35)';
      x.beginPath();
      x.ellipse(r() * w, r() * h, 30 + r() * 50, 10 + r() * 20, r() * PI, 0, PI * 2);
      x.fill();
    }
    x.fillStyle = '#e9e6dc';
    x.fillRect(0, 10, w, 4);
    x.fillRect(0, h - 14, w, 4);
    x.fillStyle = '#f2c230';
    for (let a = 20; a < w; a += 120) x.fillRect(a, h / 2 - 3, 64, 6);
  });
}
// Kaldırım kenarı (bordür): kırmızı-beyaz boyalı taş
function curbTex() {
  return tex('curb', 1152, 32, (x, w, h) => {
    for (let a = 0, k = 0; a < w; a += 64, k++) {
      x.fillStyle = k % 2 ? '#f1efe8' : '#c62a2f';
      x.fillRect(a, 0, 64, h);
    }
    x.fillStyle = 'rgba(0,0,0,0.18)';
    for (let a = 0; a < w; a += 64) x.fillRect(a, 0, 2, h);
  });
}
// Deniz: lacivert → turkuaz, dalga çizgileri, ışık yansımaları
function seaTex() {
  return tex('sea', 512, 256, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0b2a4a');
    gr.addColorStop(1, '#14507a');
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const yy = r() * h;
      const xx = r() * w;
      const len = 20 + r() * 50;
      x.strokeStyle = `rgba(160,220,255,${0.15 + r() * 0.25})`;
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(xx, yy);
      x.quadraticCurveTo(xx + len / 2, yy - 4, xx + len, yy);
      x.stroke();
    }
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(255,${200 + Math.floor(r() * 50)},${120 + Math.floor(r() * 80)},${0.15 + r() * 0.3})`;
      x.fillRect(r() * w, r() * h, 3 + r() * 8, 2);
    }
  });
}

// =============================================================================
// RENK SEÇENEKLERİ
// =============================================================================
export const V145_TINTS = {
  plastik: [
    { n: 'Beyaz', c: '#f2f1ec' },
    { n: 'Kırmızı', c: '#d32f2f' },
    { n: 'Yeşil', c: '#2e8b57' },
    { n: 'Mavi', c: '#1f5fa8' },
    { n: 'Sarı', c: '#f2c12e' },
    { n: 'Turuncu', c: '#ef7d22' },
  ],
};

// =============================================================================
// ORTAK PARÇALAR
// =============================================================================
const STEEL = () => M('#c9ced6', 0.3, 0.85);
const TIRE = () => M('#1b1c1f', 0.85, 0);
// Arabanın iki yanında birer tekerlek + öne çekme kolu
function cartBase(g, w, d, color, { y0 = 0.2, h = 0.72 } = {}) {
  B(g, w, h, d, K(color, { r: 0.45, m: 0.15 }), 0, y0, 0);
  // alt etek ve kenar şeritleri
  B(g, w + 0.02, 0.05, d + 0.02, STEEL(), 0, y0, 0);
  B(g, w + 0.02, 0.04, d + 0.02, STEEL(), 0, y0 + h - 0.04, 0);
  [-1, 1].forEach((s) => {
    const wh = CyX(g, 0.21, 0.08, TIRE(), s * (w / 2 + 0.05), 0.21, 0, null, 20);
    wh.castShadow = true;
    CyX(g, 0.09, 0.09, STEEL(), s * (w / 2 + 0.06), 0.21, 0, null, 12);
  });
  // ayak (arabanın önü düz dursun)
  Cy(g, 0.03, y0, STEEL(), 0, 0, -d / 2 + 0.08, null, 8);
  // tezgâh üstü (paslanmaz)
  B(g, w + 0.1, 0.04, d + 0.1, STEEL(), 0, y0 + h, 0);
  return y0 + h + 0.04; // tezgâh yüksekliği
}
// Dört direk + çatı + öndeki ışıklı tabela
function cartRoof(g, w, d, top, roofCol, text, signBg) {
  const yTop = 2.15;
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => Cy(g, 0.022, yTop - top, STEEL(), sx * (w / 2 - 0.02), top, sz * (d / 2 - 0.02), null, 8)));
  B(g, w + 0.24, 0.07, d + 0.3, roofCol, 0, yTop, 0.05);
  B(g, w + 0.28, 0.03, d + 0.34, '#f4f1e8', 0, yTop + 0.07, 0.05);
  // tabela
  B(g, w + 0.2, 0.36, 0.05, '#15161a', 0, yTop + 0.1, d / 2 + 0.2);
  const sm = K('#ffffff', { map: signTex(text, signBg), e: '#ffffff', ei: 0.55 });
  Pl(g, w + 0.14, 0.31, sm, 0, yTop + 0.28, d / 2 + 0.228);
  // ampuller (çatının ön kenarı)
  const n = Math.max(4, Math.round(w / 0.32));
  const bulb = K('#fff4c8', { e: '#ffd77a', ei: 1.4 });
  for (let i = 0; i < n; i++) Sp(g, 0.03, bulb, -w / 2 + (i + 0.5) * (w / n), yTop - 0.03, d / 2 + 0.18, null, 8);
  return yTop;
}
// Çizgili tente (öne eğik)
function awning(g, w, depth, y, z, c1, c2, tilt = 0.32) {
  const a = sub(g, 0, y, z);
  a.rotation.x = tilt;
  const n = Math.max(6, Math.round(w / 0.22));
  for (let i = 0; i < n; i++) B(a, w / n + 0.002, 0.025, depth, i % 2 ? c2 : c1, -w / 2 + (i + 0.5) * (w / n), 0, depth / 2);
  // fırfır kenar
  for (let i = 0; i < n; i++) {
    const f = B(a, w / n - 0.01, 0.1, 0.02, i % 2 ? c2 : c1, -w / 2 + (i + 0.5) * (w / n), -0.1, depth);
    f.castShadow = false;
  }
  return a;
}
// Yarım ekmek (somun)
function loaf(g, x, y, z, ry = 0, len = 0.28) {
  const s = sub(g, x, y, z, ry);
  const m = Sp(s, 0.06, '#d9a35a', 0, 0.04, 0, { r: 0.8 }, 12);
  m.scale.set(len / 0.12, 0.7, 1);
  return s;
}
function bowl(g, x, y, z, fill) {
  Cy(g, 0.075, 0.05, '#e9e6de', x, y, z, null, 14, 0.09);
  Cy(g, 0.08, 0.012, fill, x, y + 0.04, z, null, 14);
}
function ayranCups(g, x, y, z, n = 4) {
  for (let i = 0; i < n; i++) {
    Cy(g, 0.032, 0.1, '#f7f7f2', x + (i % 2) * 0.08, y, z + Math.floor(i / 2) * 0.08, null, 10, 0.038);
    Cy(g, 0.039, 0.012, '#2b6cb0', x + (i % 2) * 0.08, y + 0.1, z + Math.floor(i / 2) * 0.08, null, 10);
  }
}

// =============================================================================
// EŞYALAR
// =============================================================================
const OUT = [];
function I(k, cat, name, icon, build, opts = {}) {
  OUT.push({ k, cat, name, icon, build, ...opts });
}

// ── KOKOREÇ ARABASI: turuncu gövde, camlı ocak içinde yatay dönen kokoreç
I('kokorecarabasi', 'dukkan', 'Kokoreç Arabası', '🌯', (g) => {
  const W = 1.6;
  const D = 0.8;
  const top = cartBase(g, W, D, '#e8742a');
  // gövde önünde tabela şeridi
  Pl(g, 1.3, 0.24, K('#ffffff', { map: signTex('KOKOREÇ', '#f6efe0', '#c2410c', '#7c2d12') }), 0, 0.62, D / 2 + 0.002);
  // camlı ocak (arka yarı)
  const zc = -0.15;
  B(g, 1.36, 0.05, 0.42, '#2a2b30', 0, top, zc);
  const coal = B(g, 1.2, 0.03, 0.3, K('#ff6a1a', { e: '#ff4a00', ei: 1.4 }), 0, top + 0.05, zc);
  coal.castShadow = false;
  B(g, 1.36, 0.48, 0.42, K('#dff4ff', { op: 0.22, r: 0.05 }), 0, top + 0.05, zc);
  [-1, 1].forEach((s) => B(g, 0.03, 0.5, 0.44, STEEL(), s * 0.68, top + 0.05, zc));
  B(g, 1.4, 0.03, 0.46, STEEL(), 0, top + 0.53, zc);
  // dönen kokoreç
  const spit = sub(g, 0, top + 0.27, zc);
  CyX(spit, 0.008, 1.38, STEEL(), 0, 0, 0, null, 6);
  CyX(spit, 0.085, 1.0, K('#7a4320', { r: 0.75 }), 0, 0, 0, null, 14);
  for (let i = 0; i < 9; i++) {
    const t = add(spit, new THREE.TorusGeometry(0.087, 0.012, 6, 14), M('#5a2f14', 0.8), -0.44 + i * 0.11, 0, 0);
    t.rotation.y = PI / 2;
  }
  // kesme tahtası + doğranmış kokoreç + ekmekler
  B(g, 0.46, 0.025, 0.26, '#b07a45', 0.36, top, 0.2);
  for (let i = 0; i < 10; i++) B(g, 0.04, 0.02, 0.03, '#6b3a1a', 0.22 + (i % 5) * 0.06, top + 0.025, 0.14 + Math.floor(i / 5) * 0.08);
  loaf(g, -0.42, top, 0.18, 0.15);
  loaf(g, -0.42, top, 0.3, -0.1);
  loaf(g, -0.18, top, 0.24, 0.3);
  // baharat: pul biber, kekik
  Cy(g, 0.025, 0.08, '#b91c1c', 0.66, top, 0.28, null, 8);
  Cy(g, 0.025, 0.08, '#4d7c0f', 0.6, top, 0.32, null, 8);
  cartRoof(g, W, D, top, K('#e8742a', { r: 0.4, m: 0.2 }), 'KOKOREÇ', '#c2410c');
  return {
    tick(t) {
      spit.children.forEach((c) => {
        c.rotation.x = t * 1.6;
      });
      coal.material.emissiveIntensity = 1.2 + Math.sin(t * 7) * 0.25;
    },
    light: { x: 0, y: 1.6, z: 0.6, color: '#ffc27a', intensity: 1.6, distance: 4 },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { box: [0.85, 0.45] });

// ── DÖNER ARABASI: kırmızı gövde, çizgili tente, dikey dönen döner + ızgara rezistansı
I('donerarabasi', 'dukkan', 'Döner Arabası', '🥙', (g) => {
  const W = 1.6;
  const D = 0.8;
  const top = cartBase(g, W, D, '#c62a2f');
  Pl(g, 1.3, 0.24, K('#ffffff', { map: signTex('DÖNER', '#fff6e0', '#b91c1c', '#7f1d1d') }), 0, 0.62, D / 2 + 0.002);
  // döner ocağı (arka sol)
  const dx = -0.38;
  const dz = -0.12;
  const heat = B(g, 0.5, 0.75, 0.06, K('#ff7a1a', { e: '#ff5a00', ei: 1.1 }), dx, top, dz - 0.25);
  heat.castShadow = false;
  B(g, 0.58, 0.82, 0.04, STEEL(), dx, top, dz - 0.29);
  Cy(g, 0.17, 0.03, STEEL(), dx, top, dz, null, 18);
  const spin = sub(g, dx, top + 0.03, dz);
  Cy(spin, 0.012, 0.86, STEEL(), 0, 0, 0, null, 6);
  const meat = Cy(spin, 0.11, 0.6, K('#8a4b22', { r: 0.8 }), 0, 0.08, 0, null, 16, 0.19);
  meat.castShadow = true;
  for (let i = 0; i < 6; i++) Cy(spin, 0.122 + i * 0.012, 0.018, M('#5e2f12', 0.85), 0, 0.12 + i * 0.1, 0, null, 16);
  Sp(spin, 0.05, '#e3c9a0', 0, 0.73, 0, null, 8); // üstteki domates/yağ
  // tezgâh: lavaş yığını, kaseler (domates, soğan, maydanoz), ayran
  B(g, 0.3, 0.05, 0.3, '#f0dfb6', 0.2, top, 0.18);
  B(g, 0.29, 0.02, 0.29, '#e7cf98', 0.2, top + 0.05, 0.18);
  bowl(g, 0.48, top, 0.08, '#d83a2e');
  bowl(g, 0.48, top, 0.26, '#f4f1e6');
  bowl(g, 0.66, top, 0.17, '#3f8f3a');
  ayranCups(g, -0.05, top, 0.2, 2);
  const yTop = cartRoof(g, W, D, top, K('#b81f25', { r: 0.4, m: 0.2 }), 'DÖNER', '#b91c1c');
  awning(g, W + 0.3, 0.62, yTop - 0.02, D / 2 + 0.17, '#d62d2d', '#f6f3ea');
  return {
    tick(t) {
      spin.rotation.y = t * 0.9;
      heat.material.emissiveIntensity = 0.95 + Math.sin(t * 5) * 0.15;
    },
    light: { x: 0, y: 1.6, z: 0.7, color: '#ffd29a', intensity: 1.6, distance: 4 },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { box: [0.85, 0.45] });

// ── SİMİT TEZGÂHI: sarı gövde, pembe-beyaz tente, camlı vitrin + simit direği
I('simittezgahi', 'dukkan', 'Simit Tezgâhı', '🥯', (g) => {
  const W = 1.4;
  const D = 0.72;
  const top = cartBase(g, W, D, '#f2c12e');
  Pl(g, 1.1, 0.24, K('#ffffff', { map: signTex('SİMİT', '#fff8e1', '#b45309', '#78350f') }), 0, 0.62, D / 2 + 0.002);
  // camlı vitrin
  B(g, 1.2, 0.5, 0.5, K('#e9f8ff', { op: 0.22, r: 0.05 }), 0, top, -0.04);
  B(g, 1.24, 0.03, 0.54, STEEL(), 0, top + 0.5, -0.04);
  [-1, 1].forEach((s) => B(g, 0.025, 0.5, 0.52, STEEL(), s * 0.61, top, -0.04));
  const sim = M('#c47a2c', 0.75);
  const ses = M('#f1d9a6', 0.9);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 5; i++) {
      const t = To(g, 0.07, 0.024, sim, -0.44 + i * 0.22, top + 0.04 + row * 0.05, -0.12 + row * 0.12);
      t.rotation.x = PI / 2;
      Sp(g, 0.008, ses, -0.44 + i * 0.22, top + 0.07 + row * 0.05, -0.12 + row * 0.12 + 0.05, null, 6);
    }
  // klasik simit direği (üst üste dizili)
  Cy(g, 0.012, 0.75, STEEL(), 0.42, top + 0.53, -0.04, null, 6);
  for (let i = 0; i < 7; i++) {
    const t = To(g, 0.075, 0.026, sim, 0.42, top + 0.58 + i * 0.07, -0.04);
    t.rotation.x = PI / 2;
    t.rotation.z = i * 0.6;
  }
  // çay termosu + kâğıt peçete
  Cy(g, 0.07, 0.26, '#c62a2f', -0.5, top + 0.53, -0.1, { r: 0.35, m: 0.3 }, 14);
  Cy(g, 0.03, 0.04, '#1a1a1a', -0.5, top + 0.79, -0.1, null, 8);
  B(g, 0.1, 0.06, 0.08, '#ffffff', -0.25, top + 0.53, 0.08);
  const yTop = cartRoof(g, W, D, top, K('#ec4899', { r: 0.45 }), 'SİMİT', '#d97706');
  awning(g, W + 0.3, 0.55, yTop - 0.02, D / 2 + 0.17, '#f472b6', '#fdf2f8');
  return { light: { x: 0, y: 1.6, z: 0.6, color: '#fff0c8', intensity: 1.3, distance: 4 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.75, 0.42] });

// ── KÖFTE ARABASI: kırmızı gövde, pembe-beyaz tente, kömür ızgarası + tüten duman
I('koftearabasi', 'dukkan', 'Köfte Arabası', '🍔', (g) => {
  const W = 1.6;
  const D = 0.8;
  const top = cartBase(g, W, D, '#b91c1c');
  Pl(g, 1.3, 0.24, K('#ffffff', { map: signTex('KÖFTE EKMEK', '#fff1f2', '#be123c', '#881337') }), 0, 0.62, D / 2 + 0.002);
  // ızgara (sol)
  const gx = -0.28;
  B(g, 0.9, 0.16, 0.5, '#1d1e22', gx, top, -0.05, { r: 0.6, m: 0.4 });
  const coal = B(g, 0.84, 0.02, 0.44, K('#ff5a1a', { e: '#ff3d00', ei: 1.3 }), gx, top + 0.14, -0.05);
  coal.castShadow = false;
  for (let i = 0; i < 9; i++) B(g, 0.012, 0.012, 0.48, STEEL(), gx - 0.4 + i * 0.1, top + 0.17, -0.05);
  const kofte = M('#5b3317', 0.85);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 6; c++) {
      const k = Sp(g, 0.035, kofte, gx - 0.3 + c * 0.12, top + 0.2, -0.2 + r * 0.14, null, 8);
      k.scale.set(1.5, 0.65, 1);
    }
  for (let i = 0; i < 3; i++) {
    const p = Sp(g, 0.022, '#3f8f3a', gx + 0.36, top + 0.2, -0.2 + i * 0.12, null, 8);
    p.scale.set(1, 1, 3);
  }
  // duman
  const smoke = [];
  for (let i = 0; i < 5; i++) {
    const s = Sp(g, 0.09, K('#d9dde3', { op: 0.32 }), gx + (i - 2) * 0.12, top + 0.4, -0.05, null, 10);
    s.castShadow = false;
    smoke.push(s);
  }
  // ekmek sepeti + ayran
  B(g, 0.36, 0.1, 0.28, '#a16207', 0.42, top, 0.12, { r: 0.85 });
  loaf(g, 0.36, top + 0.08, 0.08, 0.1, 0.24);
  loaf(g, 0.48, top + 0.08, 0.16, -0.15, 0.24);
  ayranCups(g, 0.62, top, -0.22, 4);
  const yTop = cartRoof(g, W, D, top, K('#db2777', { r: 0.45 }), 'KÖFTE', '#be123c');
  awning(g, W + 0.3, 0.6, yTop - 0.02, D / 2 + 0.17, '#f472b6', '#fdf2f8');
  return {
    tick(t) {
      smoke.forEach((s, i) => {
        const k = (t * 0.35 + i / smoke.length) % 1;
        s.position.y = top + 0.3 + k * 1.2;
        s.position.x = gx + (i - 2) * 0.1 + Math.sin(t + i) * 0.06;
        const sc = 0.6 + k * 1.6;
        s.scale.set(sc, sc, sc);
        s.material.opacity = 0.36 * (1 - k);
      });
      coal.material.emissiveIntensity = 1.1 + Math.sin(t * 8) * 0.25;
    },
    light: { x: -0.3, y: 1.4, z: 0.6, color: '#ffb36b', intensity: 1.7, distance: 4 },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { box: [0.85, 0.45] });

// ── PLASTİK MASA (kare) ve PLASTİK TABURE
I('plastikmasa', 'masa', 'Plastik Masa', '🪑', (g, ctx) => {
  const c = ctx.tint?.c || '#f2f1ec';
  const pm = M(c, 0.5, 0.02);
  B(g, 0.72, 0.035, 0.72, pm, 0, 0.7, 0);
  B(g, 0.74, 0.05, 0.74, pm, 0, 0.66, 0);
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => {
      const l = B(g, 0.05, 0.68, 0.05, pm, sx * 0.31, 0, sz * 0.31);
      l.rotation.z = sx * 0.04;
      l.rotation.x = -sz * 0.04;
    })
  );
}, { box: [0.37, 0.37], tints: 'plastik' });
I('plastiktabure', 'oturma', 'Plastik Tabure', '🪑', (g, ctx) => {
  const c = ctx.tint?.c || '#d32f2f';
  const pm = M(c, 0.5, 0.02);
  Cy(g, 0.17, 0.035, pm, 0, 0.42, 0, null, 18);
  Cy(g, 0.15, 0.06, pm, 0, 0.37, 0, null, 18, 0.17);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    const l = B(g, 0.035, 0.4, 0.035, pm, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    l.rotation.z = Math.cos(a) * 0.1;
    l.rotation.x = -Math.sin(a) * 0.1;
  }
}, { box: [0.17, 0.17], tints: 'plastik', seats: [[0, 0.46, 0]] });

// ── SAHİL KORKULUĞU (2 m)
I('korkuluk', 'dis', 'Sahil Korkuluğu (2 m)', '🛤️', (g) => {
  const c = M('#cfd6de', 0.3, 0.8);
  [-0.98, 0, 0.98].forEach((x) => {
    Cy(g, 0.03, 0.95, c, x, 0, 0, null, 10);
    Sp(g, 0.04, c, x, 0.97, 0, null, 10);
  });
  CyX(g, 0.022, 2.0, c, 0, 0.9, 0, null, 10);
  CyX(g, 0.016, 2.0, c, 0, 0.55, 0, null, 10);
  CyX(g, 0.016, 2.0, c, 0, 0.25, 0, null, 10);
}, { box: [1.0, 0.06] });

// ── NEON TABELALAR (duvara) — houseCatalog'daki neonBuild ile çizilir
const NEONS = [
  ['neon_kokorec', 'Neon "KOKOREÇ" Tabelası', 'KOKOREÇ'],
  ['neon_doner', 'Neon "DÖNER" Tabelası', 'DÖNER'],
  ['neon_simit', 'Neon "SİMİT" Tabelası', 'SİMİT'],
  ['neon_kofte', 'Neon "KÖFTE" Tabelası', 'KÖFTE'],
];

// ── SADECE MEKÂNDA: yol, yaya geçidi, deniz
// Yol şeridi: 18 m × 3 m, ön (+z) kenarında kırmızı-beyaz bordür
I('vz_yol', 'dis', 'Yol Şeridi (18 m)', '🛣️', (g) => {
  const me = Pl(g, 18, 3, K('#ffffff', { map: roadTex(), r: 0.9 }), 0, 0.006, 0);
  me.rotation.x = -PI / 2;
  B(g, 18, 0.07, 0.22, K('#ffffff', { map: curbTex(), r: 0.8 }), 0, 0, 1.39);
}, { nobox: true, flat: true, venueOnly: true });
// Yaya geçidi: 2,4 m (yol boyunca) × 3 m
I('vz_yaya', 'dis', 'Yaya Geçidi', '🚸', (g) => {
  const wm = M('#ecebe4', 0.8);
  for (let i = 0; i < 6; i++) {
    const p = Pl(g, 2.4, 0.26, wm, 0, 0.009, -1.2 + i * 0.48);
    p.rotation.x = -PI / 2;
  }
}, { nobox: true, flat: true, venueOnly: true });
// Deniz şeridi: 18 m × 3 m, ön kenarı rıhtım taşı; üstüne yürünmez (çarpışma kutusu)
I('vz_deniz', 'dis', 'Deniz (18 m)', '🌊', (g) => {
  const t = seaTex();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.needsUpdate = true;
  const wm = K('#ffffff', { map: t, e: '#0b3d66', ei: 0.35, r: 0.15, m: 0.1 });
  const me = Pl(g, 18, 3, wm, 0, -0.08, 0);
  me.rotation.x = -PI / 2;
  // rıhtım kenarı (beton taş) ve suya inen yüz
  B(g, 18, 0.12, 0.3, M('#9a958a', 0.85), 0, 0, 1.35);
  const face = Pl(g, 18, 0.2, M('#6f6a61', 0.9), 0, -0.04, 1.2);
  face.rotation.y = 0;
  return {
    tick(tt) {
      t.offset.x = (tt * 0.01) % 1;
      t.offset.y = Math.sin(tt * 0.4) * 0.01;
    },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { boxes: [[0, -0.15, 9, 1.35]], flat: true, venueOnly: true });

export function v145CatalogEntries({ neonBuild }) {
  const out = OUT.map((d) => ({ ...d }));
  NEONS.forEach(([k, name, text]) => out.push({ k, name, cat: 'duvar', icon: '🟥', tints: 'neon', build: neonBuild(text, 'bold 120px sans-serif'), wall: true, nobox: true }));
  return out;
}
