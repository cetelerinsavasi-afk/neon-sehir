import * as THREE from 'three';
import { labelTexture } from './houseTextures';

// =============================================================================
// houseCatalogV92.js — v92 "Dekor Atölyesi" mobilyaları.
// Prototipteki (Neon Şehir Dekor Atölyesi) eşyaların oyuna uyarlanmış hali:
//   • Stüdyo, Hapishane, Helikopter, Havuz & Bahçe, Boks, Benzinlik, Yayın Seti,
//     Mafya, Sinema, Çiftlik, Kamp + Market Arabası / Simit Arabası / AÇIK neonu.
//   • Oyunda zaten olanlar (bilardo, koltuklar, avize, jakuzi, ATM, buzdolabı,
//     kum torbası, DJ kabini, disko topu…) ve iptal edilen konseptler (Casino
//     Royale, Mahkeme, Arcade) eklenmedi.
// Ölçüler METRE; zemin y=0; eşyanın önü +z. Bu dosyadaki yardımcılar prototipin
// imzasını korur: B(g, w, h, d, renk, x, yAlt, z, opsiyon) → y = parçanın ALTI.
// Fiyatlar functions/houseCatalogData.js (ITEM_PRICES) içinde.
// =============================================================================

const PI = Math.PI;

// paylaşılan düz malzemeler (houseCatalog.M ile aynı mantık; döngüsel import olmasın diye ayrı)
const matCache = new Map();
function M(color, rough = 0.6, metal = 0) {
  const key = `${color}|${rough}|${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

// --- malzeme ------------------------------------------------------------------
// o: { e: emissive, ei: yoğunluk, op: opaklık, map, side: çift yüz, r: pürüzlülük,
//      m: metallik, u: paylaşılmayan (animasyonlu) malzeme }
function K(c, o = {}) {
  if (c && c.isMaterial) return c;
  const plain = !o.e && o.op == null && !o.map && !o.side && !o.u;
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
  return new THREE.MeshStandardMaterial(p);
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
const Sp = (g, r, c, x = 0, y = 0, z = 0, o, seg = 16) => add(g, new THREE.SphereGeometry(r, seg, Math.max(8, (seg * 0.75) | 0)), mm(c, o), x, y, z);
const Co = (g, r, h, c, x = 0, y = 0, z = 0, o, seg = 16) => add(g, new THREE.ConeGeometry(r, h, seg), mm(c, o), x, y + h / 2, z);
const To = (g, r, t, c, x = 0, y = 0, z = 0, o, arc = PI * 2) => add(g, new THREE.TorusGeometry(r, t, 8, 32, arc), mm(c, o), x, y, z);
const Pl = (g, w, h, m, x = 0, y = 0, z = 0) => {
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  me.position.set(x, y, z);
  g.add(me);
  return me;
};
function CyX(g, r, len, c, x, y, z, o, seg = 18) {
  const m = add(g, new THREE.CylinderGeometry(r, r, len, seg), mm(c, o), x, y, z);
  m.rotation.z = PI / 2;
  return m;
}
function CyZ(g, r, len, c, x, y, z, o, seg = 18) {
  const m = add(g, new THREE.CylinderGeometry(r, r, len, seg), mm(c, o), x, y, z);
  m.rotation.x = PI / 2;
  return m;
}
function sub(g, x = 0, y = 0, z = 0, ry = 0) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  return s;
}
function tripod(g, h, c = '#202330') {
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * PI) / 3;
    const l = B(g, 0.03, 0.62, 0.03, c, Math.sin(a) * 0.16, 0, Math.cos(a) * 0.16);
    l.rotation.x = Math.cos(a) * 0.42;
    l.rotation.z = -Math.sin(a) * 0.42;
  }
  Cy(g, 0.022, h - 0.5, c, 0, 0.5, 0);
}
function chair(g, x, z, ry, c = '#3b2a20', seat = c) {
  const s = sub(g, x, 0, z, ry);
  for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) B(s, 0.04, 0.45, 0.04, c, a, 0, b);
  B(s, 0.42, 0.06, 0.42, seat, 0, 0.45, 0);
  B(s, 0.42, 0.5, 0.06, c, 0, 0.5, -0.19);
  return s;
}
function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const blink = (m, t, sp = 2, lo = 0.2, hi = 1.4) => {
  m.emissiveIntensity = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(t * sp));
};

// --- küçük dokular (prototipten) -----------------------------------------------
function line(x, a, b, c, d) {
  x.beginPath();
  x.moveTo(a, b);
  x.lineTo(c, d);
  x.stroke();
}
function circle(x, cx, cy, rad, col) {
  x.fillStyle = col;
  x.beginPath();
  x.arc(cx, cy, rad, 0, PI * 2);
  x.fill();
}
function txt(x, s, cx, cy, font, col, glow) {
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (glow) {
    x.shadowColor = glow;
    x.shadowBlur = 24;
  }
  x.fillStyle = col;
  x.fillText(s, cx, cy);
  x.shadowBlur = 0;
}
const TEX = {
  daw: [256, 128, (x) => {
    x.fillStyle = '#0d1020';
    x.fillRect(0, 0, 256, 128);
    const c = ['#3df5c4', '#ff2e5a', '#ffd23f', '#5aa9ff', '#b45cff'];
    for (let i = 0; i < 5; i++) {
      x.fillStyle = c[i];
      for (let a = 20; a < 250; a += 38) x.fillRect(a + ((i * 7) % 20), 12 + i * 22, 22 + ((i * 9) % 14), 14);
    }
    x.fillStyle = '#fff';
    x.fillRect(150, 4, 2, 120);
  }],
  onair: [256, 96, (x) => {
    x.fillStyle = '#3a0008';
    x.fillRect(0, 0, 256, 96);
    txt(x, 'ON AIR', 128, 50, '900 52px Arial Black,Arial', '#fff', '#ff2e5a');
  }],
  cctv: [256, 192, (x) => {
    x.fillStyle = '#111';
    x.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 4; i++) {
      const a = (i % 2) * 128;
      const b = (i >> 1) * 96;
      x.fillStyle = '#4f6b5c';
      x.fillRect(a + 3, b + 3, 122, 90);
      x.fillStyle = '#2f4237';
      x.fillRect(a + 20 + i * 10, b + 40, 30, 40);
      x.fillRect(a + 70, b + 20, 4, 70);
      x.fillStyle = '#d9ffe8';
      x.font = 'bold 11px monospace';
      x.fillText('KAM' + (i + 1), a + 8, b + 16);
    }
  }],
  helipad: [512, 512, (x) => {
    x.fillStyle = '#34383e';
    x.fillRect(0, 0, 512, 512);
    x.strokeStyle = '#ffd23f';
    x.lineWidth = 18;
    x.beginPath();
    x.arc(256, 256, 200, 0, PI * 2);
    x.stroke();
    x.fillStyle = '#fff';
    x.fillRect(166, 136, 44, 240);
    x.fillRect(302, 136, 44, 240);
    x.fillRect(166, 234, 180, 44);
    x.strokeStyle = '#fff';
    x.lineWidth = 8;
    x.setLineDash([24, 18]);
    x.beginPath();
    x.arc(256, 256, 238, 0, PI * 2);
    x.stroke();
    x.setLineDash([]);
  }],
  ring: [512, 512, (x) => {
    x.fillStyle = '#d6dde6';
    x.fillRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(0,0,0,.08)';
    for (let i = 0; i < 512; i += 16) line(x, i, 0, i, 512);
    circle(x, 256, 256, 92, '#ff2e5a');
    circle(x, 256, 256, 78, '#d6dde6');
    txt(x, 'NŞ', 256, 262, '900 84px Arial Black,Arial', '#ff2e5a');
  }],
  umbrella: [256, 32, (x) => {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#fff' : '#ff4d5e';
      x.fillRect(i * 32, 0, 32, 32);
    }
  }],
  pump: [128, 96, (x) => {
    x.fillStyle = '#091109';
    x.fillRect(0, 0, 128, 96);
    txt(x, '95', 64, 34, 'bold 34px monospace', '#5dff8a', '#5dff8a');
    txt(x, '52.40', 64, 74, 'bold 22px monospace', '#ffd23f');
  }],
  prices: [128, 384, (x) => {
    x.fillStyle = '#14161c';
    x.fillRect(0, 0, 128, 384);
    x.fillStyle = '#ff2e5a';
    x.fillRect(0, 0, 128, 70);
    txt(x, 'NEON', 64, 36, '900 30px Arial Black,Arial', '#fff');
    [['BENZİN', '52.40'], ['DİZEL', '54.10'], ['LPG', '26.90']].forEach(([a, b], i) => {
      txt(x, a, 64, 110 + i * 95, 'bold 18px Arial', '#ddd');
      txt(x, b, 64, 145 + i * 95, 'bold 32px monospace', '#ff9a3c', '#ff9a3c');
    });
  }],
  crate: [128, 128, (x) => {
    x.fillStyle = '#b5834a';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#9a6a36';
    for (let i = 0; i < 128; i += 32) x.fillRect(0, i + 28, 128, 4);
    x.strokeStyle = '#7a5226';
    x.lineWidth = 12;
    x.strokeRect(6, 6, 116, 116);
    line(x, 10, 10, 118, 118);
    txt(x, 'KARGO', 64, 64, '900 20px Arial Black,Arial', 'rgba(40,20,0,.55)');
  }],
  stream: [256, 144, (x) => {
    x.fillStyle = '#1b1033';
    x.fillRect(0, 0, 256, 144);
    x.fillStyle = '#2c1b55';
    x.fillRect(6, 6, 170, 132);
    x.fillStyle = '#ff2e5a';
    x.fillRect(12, 12, 44, 16);
    txt(x, 'CANLI', 34, 21, 'bold 11px Arial', '#fff');
    for (let i = 0; i < 7; i++) {
      x.fillStyle = ['#3df5c4', '#ffd23f', '#ccc'][i % 3];
      x.fillRect(184, 12 + i * 18, 40 + ((i * 23) % 30), 8);
    }
    circle(x, 90, 90, 26, '#ffd23f');
  }],
  keys: [512, 64, (x) => {
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 512, 64);
    x.strokeStyle = '#999';
    for (let i = 0; i <= 36; i++) line(x, (i * 512) / 36, 0, (i * 512) / 36, 64);
    x.fillStyle = '#111';
    for (let i = 0; i < 36; i++) {
      const n = i % 7;
      if (n !== 2 && n !== 6) x.fillRect(((i + 1) * 512) / 36 - 4, 0, 8, 38);
    }
  }],
  foam: [256, 256, (x) => {
    x.fillStyle = '#1e2026';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 64)
      for (let j = 0; j < 256; j += 64) {
        const f = ((i + j) / 64) % 2;
        const gr = f ? x.createLinearGradient(i, j, i + 64, j) : x.createLinearGradient(i, j, i, j + 64);
        gr.addColorStop(0, '#4a4e59');
        gr.addColorStop(0.5, '#2c2f37');
        gr.addColorStop(1, '#15171c');
        x.fillStyle = gr;
        x.fillRect(i + 2, j + 2, 60, 60);
      }
  }],
  water: [256, 256, (x) => {
    x.fillStyle = '#3fb2ea';
    x.fillRect(0, 0, 256, 256);
    const r = rng('w');
    x.strokeStyle = 'rgba(255,255,255,.55)';
    x.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      const a = r() * 256;
      const b = r() * 256;
      x.beginPath();
      x.moveTo(a, b);
      x.bezierCurveTo(a + 10, b - 8, a + 20, b + 8, a + 34, b);
      x.stroke();
    }
  }],
  plaid: [64, 64, (x) => {
    x.fillStyle = '#c0392b';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fillRect(0, 20, 64, 8);
    x.fillRect(20, 0, 8, 64);
    x.fillStyle = 'rgba(255,255,255,.2)';
    x.fillRect(0, 46, 64, 4);
    x.fillRect(46, 0, 4, 64);
  }],
  cola: [128, 64, (x) => {
    x.fillStyle = '#c4161c';
    x.fillRect(0, 0, 128, 64);
    x.strokeStyle = '#fff';
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(0, 40);
    x.bezierCurveTo(40, 20, 80, 56, 128, 30);
    x.stroke();
  }],
};
function T(name) {
  const def = TEX[name];
  const t = labelTexture(`v92_${name}`, def[0], def[1], (x) => def[2](x));
  return t;
}

// --- yardımcı: ürün modelleri (market rafı + market arabası) -------------------
// v92 — rafta 5 çeşit ürün: çikolata, cips, bisküvi, makarna, kola
export const MARKET_PRODUCTS = ['cikolata', 'cips', 'biskuvi', 'makarna', 'kola'];
const PROD_LOOK = {
  cikolata: { c: '#5b2a86', band: '#f2e2c4' },
  cips: { c: '#f2b70c', band: '#d8261c' },
  biskuvi: { c: '#d9a35a', band: '#2a64c4' },
  makarna: { c: '#1f4fa8', band: '#f6d36b' },
  kola: { c: '#c4161c', band: '#ffffff' },
};
// tek bir ürün (y = altı). s: ölçek
export function productMesh(g, kind, x, y, z, s = 1, ry = 0) {
  const L = PROD_LOOK[kind] || PROD_LOOK.kola;
  const p = sub(g, x, y, z, ry);
  p.scale.setScalar(s);
  if (kind === 'kola') {
    Cy(p, 0.04, 0.17, L.c, 0, 0, 0, null, 12);
    Cy(p, 0.041, 0.05, L.band, 0, 0.07, 0, null, 12);
    Cy(p, 0.025, 0.05, L.c, 0, 0.17, 0, null, 10, 0.014);
    Cy(p, 0.016, 0.02, '#f2f2f2', 0, 0.22, 0, null, 8);
  } else if (kind === 'cips') {
    const bag = Sp(p, 0.08, L.c, 0, 0.11, 0, null, 12);
    bag.scale.set(0.95, 1.35, 0.5);
    B(p, 0.15, 0.025, 0.05, L.band, 0, 0.21, 0);
    B(p, 0.15, 0.025, 0.05, L.band, 0, 0.0, 0);
    Sp(p, 0.035, '#ffe08a', 0, 0.11, 0.035, null, 8).scale.set(1, 0.7, 0.3);
  } else if (kind === 'cikolata') {
    B(p, 0.17, 0.045, 0.08, L.c, 0, 0, 0);
    B(p, 0.06, 0.047, 0.082, L.band, -0.04, 0, 0);
  } else if (kind === 'biskuvi') {
    B(p, 0.2, 0.07, 0.07, L.c, 0, 0, 0);
    B(p, 0.03, 0.072, 0.072, L.band, -0.06, 0, 0);
    B(p, 0.03, 0.072, 0.072, L.band, 0.06, 0, 0);
  } else if (kind === 'makarna') {
    B(p, 0.11, 0.2, 0.05, L.c, 0, 0, 0);
    B(p, 0.07, 0.08, 0.052, L.band, 0, 0.07, 0);
  }
  return p;
}
function marketShelfV92(g, ctx) {
  const frame = M(ctx.tint ? ctx.tint.c : '#e8e4dc', 0.4, 0.3);
  B(g, 1.6, 1.8, 0.05, frame, 0, 0, -0.22);
  [-0.8, 0.8].forEach((x) => B(g, 0.04, 1.8, 0.5, frame, x, 0, 0));
  // her rafta bir ürün türü (üst: kola · cips · çikolata + bisküvi · alt: makarna)
  const rows = [
    [0.1, [['makarna', -0.72, 0.72, 0.125]]],
    [0.55, [['cikolata', -0.72, -0.04, 0.19], ['biskuvi', 0.06, 0.72, 0.22]]],
    [1.0, [['cips', -0.72, 0.72, 0.17]]],
    [1.45, [['kola', -0.72, 0.72, 0.1]]],
  ];
  rows.forEach(([y, groups]) => {
    B(g, 1.58, 0.03, 0.48, frame, 0, y - 0.015, 0);
    B(g, 1.58, 0.05, 0.01, '#d23a3a', 0, y - 0.015, 0.245);
    groups.forEach(([kind, x0, x1, step]) => {
      for (let x = x0; x <= x1 + 0.001; x += step) {
        productMesh(g, kind, x, y + 0.015, 0.06, 1);
        if (kind === 'cikolata' || kind === 'biskuvi') productMesh(g, kind, x, y + 0.015 + (kind === 'cikolata' ? 0.047 : 0.072), 0.06, 1);
        else productMesh(g, kind, x, y + 0.015, -0.1, 1);
      }
    });
    // raf etiketleri
    groups.forEach(([kind, x0, x1]) => B(g, 0.12, 0.035, 0.012, PROD_LOOK[kind].band, (x0 + x1) / 2, y - 0.005, 0.252));
  });
  B(g, 1.6, 0.14, 0.04, '#d23a3a', 0, 1.78, 0.2);
}

// Market arabası (elde itilen kopyası da aynı model). items: ürün anahtarları
export function cartModel(g, items = []) {
  const steel = K('#c9d1d9', { m: 0.85, r: 0.25 });
  const dark = '#2a2d33';
  // tel sepet: yarı saydam tabanlar + çerçeve + dikey teller
  const mesh = K('#dfe6ee', { op: 0.28, m: 0.6, r: 0.3, side: 1 });
  B(g, 0.5, 0.36, 0.68, mesh, 0, 0.46, 0.02);
  const y0 = 0.46;
  const y1 = 0.84;
  for (const y of [y0, y1, (y0 + y1) / 2])
    for (const [w, d, x, z] of [[0.52, 0.02, 0, -0.33], [0.52, 0.02, 0, 0.37], [0.02, 0.7, -0.26, 0.02], [0.02, 0.7, 0.26, 0.02]]) B(g, w, 0.015, d, steel, x, y, z);
  for (let i = 0; i < 7; i++) {
    const x = -0.24 + i * 0.08;
    B(g, 0.01, y1 - y0, 0.01, steel, x, y0, 0.37);
    B(g, 0.01, y1 - y0, 0.01, steel, x, y0, -0.33);
  }
  for (let i = 0; i < 9; i++) {
    const z = -0.31 + i * 0.085;
    B(g, 0.01, y1 - y0, 0.01, steel, -0.26, y0, z);
    B(g, 0.01, y1 - y0, 0.01, steel, 0.26, y0, z);
  }
  // alt şasi + tekerler
  B(g, 0.44, 0.02, 0.6, steel, 0, 0.16, 0.02);
  for (const a of [-0.2, 0.2])
    for (const b of [-0.28, 0.32]) {
      B(g, 0.025, 0.42, 0.025, steel, a, 0.06, b);
      const w = CyX(g, 0.045, 0.03, dark, a, 0.045, b, { r: 0.8 }, 12);
      w.castShadow = false;
    }
  // tutma kolu (kırmızı plastik)
  B(g, 0.02, 0.2, 0.02, steel, -0.25, y1, -0.36);
  B(g, 0.02, 0.2, 0.02, steel, 0.25, y1, -0.36);
  CyX(g, 0.022, 0.56, '#e3122d', 0, y1 + 0.2, -0.38, { r: 0.4 });
  fillCart(g, items);
}
export function fillCart(g, items = []) {
  let box = g.getObjectByName('cartGoods');
  if (box) {
    g.remove(box);
    box.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  box = new THREE.Group();
  box.name = 'cartGoods';
  g.add(box);
  items.slice(0, 12).forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3) % 2;
    const layer = Math.floor(i / 6);
    productMesh(box, k, -0.15 + col * 0.15, 0.48 + layer * 0.11, -0.14 + row * 0.26, 0.85, (i * 0.7) % 1.2);
  });
}

// --- 1 dakikalık çizgi film (Sinema Perdesi) ----------------------------------
// Herkes aynı kareyi görür: zaman = gerçek saat % 60 sn.
export const CARTOON_SECONDS = 60;
function drawCat(x, cx, cy, s, t, hurt = false) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.fillStyle = '#ff8a3d';
  x.strokeStyle = '#1a0b33';
  x.lineWidth = 3;
  // kuyruk
  x.beginPath();
  x.moveTo(-26, -6);
  x.quadraticCurveTo(-48, -30 + Math.sin(t * 8) * 6, -40, -46);
  x.stroke();
  // gövde
  x.beginPath();
  x.ellipse(0, -8, 28, 18, 0, 0, PI * 2);
  x.fill();
  x.stroke();
  // bacaklar
  const st = Math.sin(t * 14) * 6;
  [[-14, st], [14, -st]].forEach(([lx, o]) => {
    x.beginPath();
    x.moveTo(lx, 4);
    x.lineTo(lx + o, 18);
    x.stroke();
  });
  // kafa
  x.beginPath();
  x.arc(26, -26, 15, 0, PI * 2);
  x.fill();
  x.stroke();
  x.beginPath();
  x.moveTo(16, -36);
  x.lineTo(19, -50);
  x.lineTo(26, -40);
  x.moveTo(30, -40);
  x.lineTo(36, -50);
  x.lineTo(38, -34);
  x.fill();
  x.stroke();
  x.fillStyle = '#1a0b33';
  if (hurt) {
    x.font = 'bold 12px Arial';
    x.fillText('x', 25, -26);
    x.fillText('x', 33, -26);
  } else {
    x.beginPath();
    x.arc(25, -28, 2.5, 0, PI * 2);
    x.arc(33, -28, 2.5, 0, PI * 2);
    x.fill();
  }
  x.restore();
}
function drawMouse(x, cx, cy, s, t, cheese = true) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.fillStyle = '#c9cfd8';
  x.strokeStyle = '#1a0b33';
  x.lineWidth = 2.5;
  x.beginPath();
  x.moveTo(-14, -4);
  x.quadraticCurveTo(-30, -2, -34, -14 + Math.sin(t * 10) * 3);
  x.stroke();
  x.beginPath();
  x.ellipse(0, -8, 15, 10, 0, 0, PI * 2);
  x.fill();
  x.stroke();
  x.beginPath();
  x.arc(14, -14, 8, 0, PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = '#ff9fb8';
  x.beginPath();
  x.arc(10, -24, 6, 0, PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = '#1a0b33';
  x.beginPath();
  x.arc(17, -15, 1.8, 0, PI * 2);
  x.fill();
  const st = Math.sin(t * 18) * 4;
  x.beginPath();
  x.moveTo(-6, 0);
  x.lineTo(-6 + st, 8);
  x.moveTo(6, 0);
  x.lineTo(6 - st, 8);
  x.stroke();
  if (cheese) {
    x.fillStyle = '#ffd23f';
    x.beginPath();
    x.moveTo(20, -8);
    x.lineTo(36, -16);
    x.lineTo(36, -4);
    x.closePath();
    x.fill();
    x.stroke();
  }
  x.restore();
}
function drawCity(x, w, h, off, night) {
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, night ? '#0b0a2a' : '#5ab0ff');
  sky.addColorStop(1, night ? '#3a1650' : '#cfeaff');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  if (night) {
    circle(x, w * 0.8, 50, 26, '#fff4c8');
    for (let i = 0; i < 40; i++) {
      x.fillStyle = 'rgba(255,255,255,0.7)';
      x.fillRect((i * 97) % w, (i * 53) % (h * 0.5), 2, 2);
    }
  } else {
    circle(x, w * 0.15, 46, 24, '#fff2a8');
  }
  for (let i = -1; i < 9; i++) {
    const bx = ((i * 70 - off * 0.3) % (w + 140) + w + 140) % (w + 140) - 70;
    const bh = 70 + ((i * 37 + 200) % 90);
    x.fillStyle = night ? '#1a1238' : '#7d93b8';
    x.fillRect(bx, h - 60 - bh, 60, bh);
    x.fillStyle = night ? '#ffd23f' : '#dbe7f6';
    for (let yy = h - 60 - bh + 10; yy < h - 70; yy += 16) for (let xx = bx + 8; xx < bx + 52; xx += 14) x.fillRect(xx, yy, 6, 8);
  }
  x.fillStyle = night ? '#2a2440' : '#5d6b7a';
  x.fillRect(0, h - 60, w, 60);
  x.fillStyle = night ? '#ffd23f' : '#f2f2f2';
  for (let i = 0; i < 12; i++) x.fillRect(((i * 60 - off) % (w + 60) + w + 60) % (w + 60) - 30, h - 32, 30, 5);
}
export function drawCartoon(x, w, h, t) {
  x.save();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (t < 6) {
    // jenerik + geri sayım
    x.fillStyle = '#1a0b33';
    x.fillRect(0, 0, w, h);
    const k = Math.min(1, t / 1.2);
    x.globalAlpha = k;
    txt(x, 'NEON ŞEHİR SİNEMASI', w / 2, 50, '900 26px Arial Black,Arial', '#ffd23f', '#ff2e5a');
    txt(x, 'KEDİ ile FARE', w / 2, 112, '900 46px Arial Black,Arial', '#ffffff', '#3df5c4');
    x.globalAlpha = 1;
    if (t > 3) {
      const n = 3 - Math.floor((t - 3) / 1);
      x.strokeStyle = '#ffffff';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(w / 2, 200, 40, -PI / 2, -PI / 2 + ((t - 3) % 1) * PI * 2);
      x.stroke();
      txt(x, String(Math.max(1, n)), w / 2, 202, '900 42px Arial Black,Arial', '#ffffff');
    }
  } else if (t < 20) {
    // kovalamaca: fare peyniri kapıp kaçar, kedi peşinde
    const u = t - 6;
    drawCity(x, w, h, u * 120, false);
    const mx = 80 + ((u * 70) % (w + 160)) - 40;
    drawMouse(x, Math.min(mx + 60, w + 40), h - 40, 1.4, t);
    drawCat(x, Math.min(mx - 80, w - 20), h - 34, 1.4, t);
    if (u < 3) txt(x, 'Peynir benim!', 140, 40, 'bold 20px Arial', '#1a0b33');
  } else if (t < 32) {
    // kedi direğe çarpar, başında yıldızlar
    const u = t - 20;
    drawCity(x, w, h, 0, false);
    x.fillStyle = '#2b2f3a';
    x.fillRect(360, h - 200, 10, 140);
    circle(x, 365, h - 205, 14, '#ffd23f');
    const catX = Math.min(330, 60 + u * 110);
    const hit = catX >= 330;
    drawCat(x, catX, h - 34, 1.4, hit ? 0 : t, hit);
    drawMouse(x, Math.min(470, 160 + u * 140), h - 40, 1.3, t);
    if (hit) {
      for (let i = 0; i < 5; i++) {
        const a = t * 4 + (i * PI * 2) / 5;
        txt(x, '★', catX + 36 + Math.cos(a) * 26, h - 100 + Math.sin(a) * 8, 'bold 18px Arial', '#ffd23f');
      }
      txt(x, 'BOİİNG!', 360, 50, '900 34px Arial Black,Arial', '#ff2e5a', '#ffffff');
    }
  } else if (t < 44) {
    // gece çatısı: fare el sallar, kedi tırmanır, köpek gelince kaçar
    const u = t - 32;
    drawCity(x, w, h, 0, true);
    x.fillStyle = '#3d2a5a';
    x.fillRect(300, h - 150, 212, 90);
    drawMouse(x, 420, h - 152, 1.3, u < 6 ? 0 : t, false);
    if (u < 6) txt(x, '👋', 455, h - 200, '28px Arial', '#fff');
    const catY = h - 34 - Math.min(1, u / 5) * 110;
    const catX = u < 7 ? 270 : 270 - (u - 7) * 120;
    drawCat(x, catX, catY + (u >= 7 ? Math.min(110, (u - 7) * 200) : 0), 1.3, t);
    if (u >= 6) {
      // köpek
      const dx = 560 - (u - 6) * 120;
      x.save();
      x.translate(dx, h - 36);
      x.fillStyle = '#8b5a2b';
      x.strokeStyle = '#1a0b33';
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(0, -10, 34, 20, 0, 0, PI * 2);
      x.fill();
      x.stroke();
      x.beginPath();
      x.arc(-36, -28, 17, 0, PI * 2);
      x.fill();
      x.stroke();
      x.fillStyle = '#5a3618';
      x.beginPath();
      x.ellipse(-30, -40, 7, 14, 0.4, 0, PI * 2);
      x.fill();
      x.restore();
      txt(x, 'HAV HAV!', Math.max(80, dx), 46, '900 28px Arial Black,Arial', '#ffd23f', '#ff2e5a');
    }
  } else if (t < 56) {
    // barış: ay altında peynir paylaşımı
    const u = t - 44;
    drawCity(x, w, h, 0, true);
    drawCat(x, 200, h - 34, 1.4, 0);
    drawMouse(x, 300, h - 40, 1.4, 0, false);
    x.fillStyle = '#ffd23f';
    x.strokeStyle = '#1a0b33';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(236, h - 50);
    x.lineTo(270, h - 66);
    x.lineTo(270, h - 44);
    x.closePath();
    x.fill();
    x.stroke();
    for (let i = 0; i < 4; i++) {
      const yy = h - 100 - ((u * 30 + i * 40) % 140);
      txt(x, '❤', 230 + i * 18, yy, 'bold 20px Arial', '#ff2e5a');
    }
    if (u > 2) txt(x, 'Arkadaş olalım mı?', w / 2, 44, 'bold 22px Arial', '#ffffff');
  } else {
    x.fillStyle = '#1a0b33';
    x.fillRect(0, 0, w, h);
    txt(x, 'SON', w / 2, h / 2 - 10, '900 64px Arial Black,Arial', '#ffffff', '#ff2e5a');
    txt(x, 'Yeniden başlıyor…', w / 2, h / 2 + 50, 'bold 18px Arial', '#ffd23f');
  }
  // film şeridi kenarları + hafif kumlanma
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(0, 0, w, 6);
  x.fillRect(0, h - 6, w, 6);
  x.restore();
}
function cinemaPoster(x, w, h) {
  const gr = x.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2b1055');
  gr.addColorStop(1, '#ff6a5a');
  x.fillStyle = gr;
  x.fillRect(0, 0, w, h);
  circle(x, 256, 230, 70, '#ffd23f');
  x.fillStyle = '#1a0b33';
  for (let a = 0; a < 512; a += 34) {
    const hh = 40 + ((a * 7) % 90);
    x.fillRect(a, 288 - hh, 30, hh);
  }
  txt(x, 'NEON ŞEHİR', 256, 76, '900 52px Arial Black,Arial', '#fff', '#ff2e5a');
  txt(x, 'KEDİ ile FARE · 1 dk', 256, 126, 'bold 22px Arial', '#ffd23f');
}

// =============================================================================
// EŞYALAR
// =============================================================================
// def: { k, name, cat, icon, w, d (prototip ızgarası), build(g, ctx, r), opts }
const DEFS = [];
function I(k, cat, name, icon, build, opts = {}) {
  DEFS.push({ k, cat, name, icon, build, opts });
}

// ── Müzik stüdyosu
I('mixer', 'studyo', 'Mikser Konsolu', '🎛️', (g) => {
  B(g, 1.9, 0.74, 0.85, '#2b2f3a');
  const p = sub(g, 0, 0.78, 0.04);
  p.rotation.x = -0.28;
  B(p, 1.84, 0.06, 0.72, '#3a3f4d');
  for (let i = 0; i < 14; i++) {
    B(p, 0.05, 0.05, 0.22, '#dfe6ee', -0.8 + i * 0.123, 0.06, 0.12);
    Cy(p, 0.028, 0.05, ['#3df5c4', '#ff2e5a', '#ffd23f'][i % 3], -0.8 + i * 0.123, 0.06, -0.18, null, 10);
  }
  B(g, 0.95, 0.55, 0.05, '#111', 0, 0.95, -0.36);
  Pl(g, 0.88, 0.48, K('#fff', { map: T('daw'), e: '#fff', ei: 0.9 }), 0, 1.225, -0.333);
  for (const s of [-1, 1]) B(g, 0.05, 0.5, 0.05, '#222', s * 0.4, 0.75, -0.38);
  return { light: { x: 0, y: 1.25, z: 0.5, color: '#5aa9ff', intensity: 1, distance: 3 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.95, 0.43] });
I('studiospk', 'studyo', 'Stüdyo Hoparlörü', '🔈', (g) => {
  Cy(g, 0.2, 0.04, '#222');
  Cy(g, 0.045, 0.86, '#30333d', 0, 0.04, 0);
  B(g, 0.36, 0.52, 0.38, '#1d1f26', 0, 0.9, 0);
  CyZ(g, 0.13, 0.03, '#2c2f38', 0, 1.04, 0.2);
  CyZ(g, 0.08, 0.035, '#ffd23f', 0, 1.04, 0.2);
  CyZ(g, 0.05, 0.03, '#3a3a3a', 0, 1.3, 0.2);
}, { box: [0.2, 0.2] });
I('vocalmic', 'studyo', 'Vokal Mikrofonu', '🎙️', (g) => {
  Cy(g, 0.2, 0.04, '#222');
  Cy(g, 0.022, 1.45, '#9aa0aa', 0, 0.04, 0);
  B(g, 0.03, 0.03, 0.3, '#9aa0aa', 0, 1.48, 0.12);
  Cy(g, 0.045, 0.16, '#2b2d33', 0, 1.38, 0.27);
  Sp(g, 0.07, '#c0c6d0', 0, 1.6, 0.27);
  To(g, 0.11, 0.012, '#222', 0, 1.6, 0.42);
  Pl(g, 0.2, 0.2, K('#111', { op: 0.35, side: 1 }), 0, 1.6, 0.42);
}, { box: [0.18, 0.18] });
I('drums', 'studyo', 'Davul Seti', '🥁', (g) => {
  const red = '#d62839';
  CyZ(g, 0.34, 0.36, red, 0, 0.36, 0.05);
  CyZ(g, 0.31, 0.37, '#f3f3f3', 0, 0.36, 0.05);
  Cy(g, 0.17, 0.15, red, -0.25, 0.72, 0.05);
  Cy(g, 0.17, 0.15, red, 0.25, 0.72, 0.05);
  Cy(g, 0.18, 0.14, '#e8e8e8', -0.5, 0.55, 0.4);
  Cy(g, 0.03, 0.55, '#999', -0.5, 0, 0.4);
  Cy(g, 0.21, 0.42, red, 0.55, 0.08, 0.35);
  for (const s of [-1, 1]) {
    Cy(g, 0.015, 0.95, '#999', s * 0.78, 0, -0.35);
    Cy(g, 0.24, 0.015, '#d4a93a', s * 0.78, 0.95, -0.35, { m: 0.8, r: 0.3 }, 24);
  }
  Cy(g, 0.02, 1.25, '#999', 0.3, 0, -0.6);
  Cy(g, 0.27, 0.015, '#d4a93a', 0.3, 1.25, -0.6, { m: 0.8, r: 0.3 }, 24);
  // v99.4 — tabure ÖNDE: bateristin önünde trampet/tom, zillar arkada (uzakta)
  Cy(g, 0.18, 0.5, '#222', 0, 0, 0.85);
}, { box: [0.85, 0.85], seats: [[0, 0.5, 0.85]] });
I('amp', 'studyo', 'Amfi + Gitar', '🎸', (g) => {
  B(g, 0.72, 0.62, 0.42, '#1b1b1e', 0, 0, -0.15);
  B(g, 0.62, 0.4, 0.02, '#5a4a3a', 0, 0.08, 0.07);
  B(g, 0.62, 0.08, 0.02, '#d4a93a', 0, 0.5, 0.07);
  const gt = sub(g, 0.22, 0, 0.32);
  gt.rotation.z = 0.25;
  const body = Sp(gt, 0.17, '#e63946', 0, 0.3, 0);
  body.scale.set(1, 1.2, 0.35);
  const b2 = Sp(gt, 0.12, '#e63946', 0, 0.5, 0);
  b2.scale.set(1, 1, 0.35);
  B(gt, 0.05, 0.62, 0.03, '#7a4a1c', 0, 0.55, 0);
  B(gt, 0.08, 0.12, 0.03, '#222', 0, 1.17, 0);
}, { box: [0.38, 0.38] });
I('synth', 'studyo', 'Synth Klavye', '🎹', (g) => {
  for (const s of [-1, 1]) {
    const l = B(g, 0.05, 0.85, 0.05, '#222', s * 0.45, 0, 0);
    l.rotation.z = s * 0.35;
    const l2 = B(g, 0.05, 0.85, 0.05, '#222', s * 0.45, 0, 0);
    l2.rotation.z = -s * 0.35;
  }
  B(g, 1.6, 0.1, 0.42, '#24262e', 0, 0.78, 0);
  const k = Pl(g, 1.5, 0.26, K('#fff', { map: T('keys') }), 0, 0.885, 0.06);
  k.rotation.x = -PI / 2;
  for (let i = 0; i < 8; i++) Cy(g, 0.02, 0.03, ['#ff2e5a', '#3df5c4'][i % 2], -0.7 + i * 0.07, 0.88, -0.13, { e: ['#ff2e5a', '#3df5c4'][i % 2], ei: 0.6 }, 8);
}, { box: [0.82, 0.24] });
I('booth', 'studyo', 'Vokal Kabini', '🚪', (g) => {
  B(g, 1.95, 0.06, 1.95, '#2c2e35');
  for (const [a, b] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) B(g, 0.08, 2.25, 0.08, '#1b1c20', a, 0, b);
  const f = K('#fff', { map: T('foam') });
  B(g, 1.9, 2.2, 0.06, f, 0, 0.05, -0.93);
  B(g, 0.06, 2.2, 1.9, f, -0.93, 0.05, 0);
  B(g, 0.04, 2.2, 1.9, K('#9fe7ff', { op: 0.22 }), 0.95, 0.05, 0);
  B(g, 1.2, 2.2, 0.04, K('#9fe7ff', { op: 0.22 }), 0.35, 0.05, 0.95);
  B(g, 1.95, 0.08, 1.95, '#1b1c20', 0, 2.25, 0);
  Cy(g, 0.18, 0.03, '#222', 0, 0.06, -0.2);
  Cy(g, 0.02, 1.3, '#aaa', 0, 0.06, -0.2);
  Sp(g, 0.07, '#c0c6d0', 0, 1.42, -0.12);
  B(g, 0.3, 0.12, 0.06, '#ff2e5a', -0.6, 1.9, 0.97, { e: '#ff2e5a', ei: 0.8 });
}, { boxes: [[0, -0.95, 1.0, 0.06], [-0.95, 0, 0.06, 1.0], [0.95, 0, 0.06, 1.0], [0.35, 0.95, 0.6, 0.05]] });
I('onair', 'studyo', 'ON AIR Lambası', '🔴', (g) => {
  Cy(g, 0.18, 0.04, '#222');
  Cy(g, 0.03, 1.5, '#333', 0, 0.04, 0);
  B(g, 0.7, 0.28, 0.12, '#300', 0, 1.5, 0);
  const m = K('#fff', { map: T('onair'), e: '#fff', ei: 1, u: 1 });
  Pl(g, 0.66, 0.24, m, 0, 1.64, 0.065);
  let on = true;
  return {
    act: 'Lambayı aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; m.emissiveIntensity = v ? 1 : 0.05; },
    tick(t) { if (on) blink(m, t, 3, 0.4, 1.3); },
    light: { x: 0, y: 1.64, z: 0.5, color: '#ff2e5a', intensity: 1.2, distance: 3 },
  };
}, { box: [0.18, 0.18] });
I('neon_acik', 'duvar', 'Neon "AÇIK" Tabelası', '🟥', null, { neonText: 'AÇIK' });

// ── Hapishane
function bars(g, col) {
  B(g, 1, 0.1, 0.1, col, 0, 0, 0);
  B(g, 1, 0.1, 0.1, col, 0, 2.4, 0);
  B(g, 1, 0.06, 0.08, col, 0, 1.2, 0);
  for (let i = 0; i < 7; i++) Cy(g, 0.028, 2.4, col, -0.43 + i * 0.143, 0.05, 0, { m: 0.7, r: 0.35 }, 8);
}
I('bars', 'hapis', 'Hücre Parmaklığı', '⛓️', (g) => bars(g, '#6b7280'), { box: [0.5, 0.06] });
I('celldoor', 'hapis', 'Hücre Kapısı', '🚪', (g) => {
  bars(g, '#4b5563');
  B(g, 0.22, 0.3, 0.16, '#2b2f36', 0.32, 1.05, 0);
  Cy(g, 0.03, 0.06, '#ffd23f', 0.32, 1.25, 0.09, { e: '#ffd23f', ei: 0.6 });
  B(g, 0.3, 0.14, 0.03, '#e5e7eb', 0, 2.1, 0.06);
}, { box: [0.5, 0.06] });
I('bunk', 'hapis', 'Ranza', '🛏️', (g) => {
  for (const a of [-0.9, 0.9]) for (const b of [-0.38, 0.38]) B(g, 0.07, 1.75, 0.07, '#6b7280', a, 0, b);
  for (const y of [0.32, 1.25]) {
    B(g, 1.86, 0.07, 0.8, '#4b5563', 0, y, 0);
    B(g, 1.8, 0.14, 0.74, '#e5e7eb', 0, y + 0.07, 0);
    B(g, 0.4, 0.1, 0.5, '#fff', -0.66, y + 0.21, 0);
  }
  for (let i = 0; i < 4; i++) B(g, 0.04, 0.04, 0.36, '#9aa3ad', 0.92, 0.35 + i * 0.3, 0);
}, { box: [0.95, 0.42], seats: [[-0.3, 0.5, 0.1], [0.3, 0.5, 0.1]] });
I('guarddesk', 'hapis', 'Gardiyan Masası', '👮', (g) => {
  B(g, 1.9, 0.78, 0.8, '#3d4451');
  B(g, 1.95, 0.05, 0.85, '#1f2937', 0, 0.78, 0);
  B(g, 0.9, 0.6, 0.06, '#111', -0.3, 0.83, -0.3);
  Pl(g, 0.84, 0.54, K('#fff', { map: T('cctv'), e: '#fff', ei: 0.8 }), -0.3, 1.13, -0.265);
  B(g, 0.14, 0.28, 0.08, '#222', 0.6, 0.83, 0);
  Cy(g, 0.012, 0.2, '#222', 0.64, 1.1, 0);
  Cy(g, 0.05, 0.12, '#e5e7eb', 0.3, 0.83, 0.2);
  chair(g, 0, 0.62, PI, '#222', '#333').scale.setScalar(0.85);
}, { box: [0.97, 0.42], seats: [[0, 0.42, 0.62]] });
I('canteen', 'hapis', 'Yemekhane Masası', '🍽️', (g) => {
  B(g, 2.8, 0.07, 0.5, '#9aa3ad', 0, 0.72, 0);
  for (const a of [-1.2, 1.2]) B(g, 0.08, 0.72, 0.08, '#6b7280', a, 0, 0);
  for (const s of [-1, 1]) {
    B(g, 2.8, 0.06, 0.2, '#6b7280', 0, 0.42, s * 0.4);
    for (const a of [-1.2, 1.2]) B(g, 0.06, 0.42, 0.06, '#4b5563', a, 0, s * 0.4);
  }
  for (let i = 0; i < 3; i++) B(g, 0.36, 0.03, 0.26, '#c0c7d1', -0.9 + i * 0.9, 0.79, -0.08);
}, { box: [1.42, 0.5], seats: [[-0.9, 0.47, 0.42], [0, 0.47, 0.42], [0.9, 0.47, 0.42], [-0.9, 0.47, -0.42], [0, 0.47, -0.42], [0.9, 0.47, -0.42]] });
I('searchlight', 'hapis', 'Gözetleme Projektörü', '🔦', (g) => {
  Cy(g, 0.25, 0.1, '#333');
  Cy(g, 0.06, 2.1, '#444', 0, 0.1, 0);
  const h = sub(g, 0, 2.3, 0);
  CyZ(h, 0.18, 0.32, '#2b2f36', 0, 0, 0.05);
  CyZ(h, 0.15, 0.02, '#fff6c8', 0, 0, 0.22, { e: '#fff6c8', ei: 1 });
  const c = add(h, new THREE.ConeGeometry(0.9, 3, 20, 1, true), K('#fff6c8', { op: 0.12, side: 1, e: '#fff6c8', ei: 0.6 }), 0, -0.4, 1.6);
  c.rotation.x = PI / 2 - 0.45;
  c.castShadow = false;
  return { tick(t) { h.rotation.y = Math.sin(t * 0.6) * 1.1; }, light: { x: 0, y: 2.3, z: 0.6, color: '#fff6c8', intensity: 1.4, distance: 6 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.25, 0.25] });
I('wire', 'hapis', 'Dikenli Tel Çit', '🪤', (g) => {
  for (const a of [-0.45, 0.45]) B(g, 0.07, 1.9, 0.07, '#6b7280', a, 0, 0);
  for (let i = 0; i < 4; i++) CyX(g, 0.008, 1, '#9aa3ad', 0, 0.35 + i * 0.4, 0, null, 6);
  for (let i = 0; i < 5; i++) {
    const t = To(g, 0.13, 0.01, '#b8c0ca', -0.4 + i * 0.2, 1.98, 0);
    t.rotation.y = PI / 2;
  }
}, { box: [0.5, 0.06] });
I('interrog', 'hapis', 'Sorgu Masası', '🕵️', (g) => {
  B(g, 1, 0.05, 0.6, '#9aa3ad', 0, 0.72, 0);
  for (const a of [-0.45, 0.45]) for (const b of [-0.25, 0.25]) B(g, 0.04, 0.72, 0.04, '#555', a, 0, b);
  chair(g, -0.75, 0, PI / 2, '#555', '#777').scale.setScalar(0.9);
  chair(g, 0.75, 0, -PI / 2, '#555', '#777').scale.setScalar(0.9);
  Cy(g, 0.006, 0.7, '#222', 0, 2.3, 0);
  const l = Co(g, 0.22, 0.2, '#2b2f36', 0, 2.1, 0);
  l.rotation.x = PI;
  Sp(g, 0.06, '#fff6c8', 0, 2.12, 0, { e: '#fff6c8', ei: 1.2 });
  return { light: { x: 0, y: 2.0, z: 0, color: '#fff2c8', intensity: 1.6, distance: 4 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.52, 0.32], seats: [[-0.75, 0.42, 0], [0.75, 0.42, 0]] });

// ── Helikopter
I('helipad', 'heli', 'Helikopter Pisti', '🅷', (g) => {
  Cy(g, 2.45, 0.06, '#2a2d32', 0, 0, 0, null, 40);
  const top = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), K('#fff', { map: T('helipad') }));
  top.rotation.x = -PI / 2;
  top.position.y = 0.065;
  top.receiveShadow = true;
  g.add(top);
  const ms = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    const m = K('#3df5c4', { e: '#3df5c4', u: 1 });
    ms.push(m);
    Sp(g, 0.06, m, Math.sin(a) * 2.3, 0.1, Math.cos(a) * 2.3, null, 8);
  }
  return { tick(t) { ms.forEach((m, i) => { m.emissiveIntensity = Math.floor(t * 6) % 12 === i ? 2 : 0.25; }); } };
}, { flat: true, nobox: true });
I('helicopter', 'heli', 'Helikopter', '🚁', (g) => {
  const c = '#ff2e5a';
  const b = Sp(g, 0.85, c, 0, 1.05, 0.55, { r: 0.3, m: 0.4 }, 20);
  b.scale.set(0.95, 0.85, 1.35);
  const gl = Sp(g, 0.62, '#9fe7ff', 0, 1.18, 1.05, { op: 0.55, r: 0.05 }, 20);
  gl.scale.set(1, 0.8, 0.9);
  const tb = add(g, new THREE.CylinderGeometry(0.08, 0.17, 1.8, 10), K(c, { r: 0.3, m: 0.4 }), 0, 1.15, -0.95);
  tb.rotation.x = PI / 2;
  B(g, 0.06, 0.5, 0.3, c, 0, 1.15, -1.8);
  B(g, 0.5, 0.05, 0.18, c, 0, 1.25, -1.6);
  const tr = sub(g, 0.06, 1.45, -1.85);
  for (let i = 0; i < 2; i++) {
    const bl = B(tr, 0.02, 0.55, 0.06, '#222', 0, -0.275, 0);
    bl.rotation.x = (i * PI) / 2;
  }
  for (const s of [-1, 1]) {
    CyZ(g, 0.04, 2.1, '#2b2d33', s * 0.6, 0.08, 0.55);
    B(g, 0.04, 0.55, 0.04, '#2b2d33', s * 0.5, 0.08, 0.1);
    B(g, 0.04, 0.55, 0.04, '#2b2d33', s * 0.5, 0.08, 1);
  }
  Cy(g, 0.07, 0.3, '#2b2d33', 0, 1.75, 0.45);
  const ro = sub(g, 0, 2.08, 0.45);
  for (let i = 0; i < 4; i++) {
    const p = sub(ro, 0, 0, 0, (i * PI) / 2);
    B(p, 1.55, 0.03, 0.14, '#1d1f26', 0.8, 0, 0);
  }
  let on = false;
  return {
    act: 'Motoru çalıştır / durdur',
    get on() { return on; },
    setOn(v) { on = v; },
    tick(t, dt) {
      if (on) {
        ro.rotation.y += (dt || 0.016) * 22;
        tr.rotation.x += (dt || 0.016) * 30;
      }
    },
  };
}, { box: [0.9, 1.6], seats: [[-0.3, 0.75, 0.9], [0.3, 0.75, 0.9]], seatLabel: '🚁 Helikoptere bin' });
I('windsock', 'heli', 'Rüzgâr Hortumu', '🎐', (g) => {
  Cy(g, 0.04, 2.4, '#ddd');
  const s = sub(g, 0, 2.3, 0);
  for (let i = 0; i < 4; i++) {
    const m = add(s, new THREE.CylinderGeometry(0.16 - i * 0.025, 0.14 - i * 0.025, 0.25, 12, 1, true), K(i % 2 ? '#fff' : '#ff6a1a', { side: 1 }), 0.15 + i * 0.25, 0, 0);
    m.rotation.z = PI / 2;
  }
  return { tick(t) { s.rotation.y = Math.sin(t * 0.7) * 0.5; s.rotation.z = -0.2 + Math.sin(t * 2.3) * 0.06; } };
}, { box: [0.1, 0.1] });
I('padlight', 'heli', 'Pist Işığı', '💡', (g) => {
  B(g, 0.3, 0.12, 0.3, '#333');
  const m = K('#ffd23f', { e: '#ffd23f', u: 1 });
  Sp(g, 0.1, m, 0, 0.18, 0);
  return { tick(t) { blink(m, t, 5, 0.1, 2); } };
}, { nobox: true });

// ── Havuz & bahçe
I('poolout', 'havuz', 'Açık Yüzme Havuzu', '🏊', (g) => {
  const w = 4;
  const d = 5;
  const rim = '#f1f5f9';
  B(g, w, 0.3, 0.25, rim, 0, 0, -d / 2 + 0.125);
  B(g, w, 0.3, 0.25, rim, 0, 0, d / 2 - 0.125);
  B(g, 0.25, 0.3, d - 0.5, rim, -w / 2 + 0.125, 0, 0);
  B(g, 0.25, 0.3, d - 0.5, rim, w / 2 - 0.125, 0, 0);
  B(g, w - 0.5, 0.12, d - 0.5, '#2a7fbf');
  const wt = T('water');
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), K('#ffffff', { map: wt, op: 0.88, r: 0.08, u: 1 }));
  wm.rotation.x = -PI / 2;
  wm.position.y = 0.24;
  wm.material.map = wt.clone();
  wm.material.map.needsUpdate = true;
  wm.material.map.repeat.set(2, 2.5);
  wm.material.userData.tex = wm.material.map;
  g.add(wm);
  for (const s of [-0.25, 0.25]) {
    const l = To(g, 0.2, 0.025, '#d6dde6', 1.62, 0.3, -1.6 + s, { m: 0.8, r: 0.3 }, PI);
    l.rotation.y = PI / 2;
  }
  return { tick(t) { wm.material.map.offset.set(t * 0.03, t * 0.02); } };
}, { flat: true, nobox: true });
I('lounger', 'havuz', 'Şezlong', '🏖️', (g) => {
  for (const a of [-0.25, 0.25]) for (const b of [-0.8, 0.6]) B(g, 0.04, 0.25, 0.04, '#e5e7eb', a, 0, b);
  B(g, 0.56, 0.06, 1.3, '#e5e7eb', 0, 0.25, 0.12);
  B(g, 0.52, 0.08, 1.22, '#2ec4b6', 0, 0.31, 0.12);
  const bk = sub(g, 0, 0.3, -0.55);
  bk.rotation.x = -0.9;
  B(bk, 0.52, 0.08, 0.6, '#2ec4b6', 0, 0, -0.3);
}, { box: [0.3, 0.75], seats: [[0, 0.42, 0.2]] });
I('umbrella', 'havuz', 'Plaj Şemsiyesi', '⛱️', (g) => {
  Cy(g, 0.18, 0.06, '#e5e7eb');
  Cy(g, 0.025, 2.1, '#ddd');
  const tx = T('umbrella');
  add(g, new THREE.ConeGeometry(0.95, 0.4, 16, 1, true), K('#fff', { map: tx, side: 1 }), 0, 2.1, 0);
}, { box: [0.1, 0.1] });
I('diveboard', 'havuz', 'Tramplen', '🤸', (g) => {
  B(g, 0.5, 0.5, 0.4, '#cbd5e1', 0, 0, -0.75);
  const b = B(g, 0.42, 0.06, 1.6, '#3fb2ea', 0, 0.5, 0.1);
  b.rotation.x = 0.04;
  Cy(g, 0.02, 0.5, '#aaa', -0.2, 0.5, -0.85);
  Cy(g, 0.02, 0.5, '#aaa', 0.2, 0.5, -0.85);
}, { boxes: [[0, -0.75, 0.25, 0.2]] });
I('lifeguard', 'havuz', 'Cankurtaran Kulesi', '🛟', (g) => {
  for (const a of [-0.3, 0.3]) for (const b of [-0.3, 0.3]) B(g, 0.06, 1.6, 0.06, '#f1f5f9', a * 0.7, 0, b * 0.7);
  B(g, 0.6, 0.06, 0.6, '#f1f5f9', 0, 1.6, 0);
  B(g, 0.6, 0.6, 0.06, '#e3122d', 0, 1.66, -0.28);
  B(g, 0.08, 0.24, 0.02, '#fff', 0, 1.84, -0.24);
  B(g, 0.24, 0.08, 0.02, '#fff', 0, 1.92, -0.24);
  for (let i = 0; i < 5; i++) B(g, 0.5, 0.04, 0.04, '#f1f5f9', 0, 0.3 + i * 0.28, 0.32);
}, { box: [0.3, 0.3], seats: [[0, 1.66, 0]] });
I('mangal', 'havuz', 'Mangal', '🍖', (g) => {
  for (const a of [-0.32, 0.32]) for (const b of [-0.15, 0.15]) B(g, 0.04, 0.62, 0.04, '#222', a, 0, b);
  B(g, 0.8, 0.18, 0.38, '#2b2d33', 0, 0.62, 0);
  const km = K('#ff6a1a', { e: '#ff4500', ei: 1, u: 1 });
  B(g, 0.72, 0.04, 0.3, km, 0, 0.78, 0);
  for (let i = 0; i < 5; i++) {
    CyX(g, 0.008, 0.5, '#ccc', 0, 0.84, -0.12 + i * 0.06, null, 6);
    for (let k = 0; k < 3; k++) B(g, 0.06, 0.05, 0.04, '#8b3a1a', -0.12 + k * 0.12, 0.84, -0.12 + i * 0.06);
  }
  return { tick(t) { km.emissiveIntensity = 0.7 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.15; }, light: { x: 0, y: 1.0, z: 0, color: '#ff6a1a', intensity: 1.4, distance: 3 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.42, 0.22] });
I('flamingo', 'havuz', 'Flamingo Simit', '🦩', (g) => {
  const t = To(g, 0.32, 0.13, '#ff8fab', 0, 0.2, 0);
  t.rotation.x = PI / 2;
  const n = Cy(g, 0.05, 0.55, '#ff8fab', 0, 0.22, -0.28, null, 8);
  n.rotation.x = -0.2;
  Sp(g, 0.09, '#ff8fab', 0, 0.8, -0.38);
  Co(g, 0.035, 0.12, '#222', 0, 0.74, -0.44, null, 6).rotation.x = -PI / 2.4;
}, { nobox: true, seats: [[0, 0.3, 0.05]] });

// ── Boks
I('ring', 'boks', 'Boks Ringi', '🥊', (g) => {
  // v92 — oyunda yükseklik olmadığı için ring alçak bir platform: içine girilebilir
  B(g, 4.8, 0.14, 4.8, '#1f2a44');
  const top = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 4.7), K('#fff', { map: T('ring') }));
  top.rotation.x = -PI / 2;
  top.position.y = 0.145;
  top.receiveShadow = true;
  g.add(top);
  const posts = [[-2.25, -2.25, '#e3122d'], [2.25, 2.25, '#2f6be0'], [2.25, -2.25, '#f1f5f9'], [-2.25, 2.25, '#f1f5f9']];
  for (const [a, b, c] of posts) {
    Cy(g, 0.08, 1.4, '#c0c7d1', a, 0.14, b, { m: 0.7, r: 0.3 });
    B(g, 0.22, 0.8, 0.22, c, a, 0.59, b);
  }
  const rc = ['#e3122d', '#f1f5f9', '#2f6be0'];
  for (let i = 0; i < 3; i++) {
    const y = 0.6 + i * 0.32;
    CyX(g, 0.025, 4.5, rc[i], 0, y, -2.25, null, 8);
    CyX(g, 0.025, 4.5, rc[i], 0, y, 2.25, null, 8);
    CyZ(g, 0.025, 4.5, rc[i], -2.25, y, 0, null, 8);
    CyZ(g, 0.025, 4.5, rc[i], 2.25, y, 0, null, 8);
  }
}, { flat: true, boxes: [[-2.25, -2.25, 0.12, 0.12], [2.25, 2.25, 0.12, 0.12], [2.25, -2.25, 0.12, 0.12], [-2.25, 2.25, 0.12, 0.12]] });
I('speedbag', 'boks', 'Hız Topu', '🥊', (g) => {
  B(g, 0.1, 1.9, 0.1, '#30333d', 0, 0, -0.4);
  B(g, 0.7, 0.06, 0.5, '#5a3618', 0, 1.9, -0.18);
  const p = sub(g, 0, 1.88, 0);
  const b = Sp(p, 0.11, '#c4161c', 0, -0.2, 0);
  b.scale.set(1, 1.4, 1);
  return { tick(t) { p.rotation.x = Math.sin(t * 14) * 0.6; } };
}, { boxes: [[0, -0.4, 0.06, 0.06]] });
I('cornerstool', 'boks', 'Köşe Taburesi', '🪑', (g) => {
  Cy(g, 0.2, 0.05, '#222', 0, 0.5);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    B(g, 0.04, 0.5, 0.04, '#888', Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14);
  }
  Cy(g, 0.13, 0.3, '#2f6be0', 0.28, 0, 0.28);
  B(g, 0.3, 0.03, 0.2, '#fff', 0, 0.56, 0);
}, { box: [0.2, 0.2], seats: [[0, 0.55, 0]] });
I('gong', 'boks', 'Gong', '🔔', (g) => {
  for (const a of [-0.42, 0.42]) B(g, 0.08, 1.8, 0.08, '#5a3618', a, 0, 0);
  B(g, 0.92, 0.08, 0.08, '#5a3618', 0, 1.8, 0);
  CyZ(g, 0.36, 0.04, '#d4a93a', 0, 1.1, 0, { m: 0.9, r: 0.25 }, 28);
  To(g, 0.36, 0.02, '#a77d1a', 0, 1.1, 0.02, { m: 0.9, r: 0.3 });
  Cy(g, 0.01, 0.3, '#333', 0, 1.45, 0);
}, { box: [0.48, 0.08] });
I('bleacher', 'boks', 'Tribün', '🏟️', (g) => {
  for (let i = 0; i < 3; i++) {
    B(g, 3, 0.35 + i * 0.35, 0.62, '#3b4252', 0, 0, 0.66 - i * 0.66);
    B(g, 3, 0.08, 0.3, ['#ff2e5a', '#3df5c4', '#ffd23f'][i], 0, 0.35 + i * 0.35, 0.7 - i * 0.66);
  }
}, { box: [1.5, 1.0], seats: [[-1, 0.43, 0.7], [0, 0.43, 0.7], [1, 0.43, 0.7], [-1, 0.78, 0.04], [0, 0.78, 0.04], [1, 0.78, 0.04], [-1, 1.13, -0.62], [0, 1.13, -0.62], [1, 1.13, -0.62]] });

// ── Market (Market Rafı mevcut eşyanın yeni hali — aşağıda override)
I('cart', 'dukkan', 'Market Arabası', '🛒', (g) => cartModel(g, []), { box: [0.27, 0.37], panel: 'cart' });
// v94 — Bantlı Market Kasası: yürüyen bant + yazar kasa + POS + ayırıcı çubuk
I('beltcheckout', 'dukkan', 'Bantlı Market Kasası', '🛒', (g) => {
  const body = '#e9edf2';
  B(g, 2.2, 0.82, 0.62, body, 0, 0, 0); // gövde
  B(g, 2.24, 0.04, 0.66, '#2b2f36', 0, 0.82, 0); // tezgah kenarı
  B(g, 2.2, 0.06, 0.04, '#d6182a', 0, 0.6, 0.315); // ön şerit
  // bant: koyu kauçuk + iki ucunda silindir
  B(g, 1.45, 0.025, 0.46, '#17191d', -0.33, 0.86, 0);
  for (const x of [-1.06, 0.4]) CyX(g, 0.03, 0.46, '#8c939c', x, 0.875, 0, { m: 0.8, r: 0.3 });
  // banttaki kaymalı çizgiler (yürüyen bant)
  const stripes = [];
  for (let i = 0; i < 9; i++) {
    const st = B(g, 0.02, 0.006, 0.44, '#3a3e45', 0, 0.886, 0);
    stripes.push(st);
  }
  // ürünler ve ayırıcı çubuk
  B(g, 0.03, 0.04, 0.4, '#ffd23f', -0.15, 0.89, 0);
  B(g, 0.12, 0.16, 0.08, '#ff6f3c', -0.75, 0.89, -0.08);
  Cy(g, 0.05, 0.18, '#3fa9f5', -0.55, 0.89, 0.08);
  B(g, 0.14, 0.09, 0.1, '#7ac943', -0.38, 0.89, -0.1);
  // kasiyer tarafı: yazar kasa ekranı + tarayıcı + POS
  B(g, 0.62, 0.05, 0.6, '#c9ced6', 0.78, 0.86, 0);
  B(g, 0.22, 0.12, 0.2, '#2b2f36', 0.82, 0.91, -0.12);
  const scr = K('#39ff88', { e: '#39ff88', ei: 0.9 });
  B(g, 0.28, 0.2, 0.03, '#1b1d22', 0.82, 1.03, -0.12);
  Pl(g, 0.24, 0.15, scr, 0.82, 1.13, -0.104);
  B(g, 0.2, 0.02, 0.16, K('#c8e6ff', { op: 0.5 }), 0.55, 0.89, 0.02); // barkod camı
  const laser = K('#ff2e3d', { e: '#ff2e3d', ei: 1.4 });
  B(g, 0.16, 0.004, 0.004, laser, 0.55, 0.9, 0.02);
  B(g, 0.08, 0.12, 0.05, '#222', 0.98, 0.89, 0.16); // POS
  Pl(g, 0.05, 0.03, K('#9fd3ff', { e: '#9fd3ff', ei: 0.6 }), 0.98, 0.99, 0.188);
  // kasa numarası direği
  Cy(g, 0.015, 0.9, '#9aa1aa', 1.05, 0.86, -0.27);
  B(g, 0.22, 0.22, 0.04, '#d6182a', 1.05, 1.72, -0.27);
  Pl(g, 0.16, 0.16, K('#fff', { e: '#fff', ei: 0.5 }), 1.05, 1.83, -0.248);
  return {
    tick(t) {
      stripes.forEach((st, i) => {
        st.position.x = -1.03 + (((i / 9) + t * 0.18) % 1) * 1.4;
      });
      laser.emissiveIntensity = 0.8 + Math.abs(Math.sin(t * 9)) * 1.2;
    },
  };
}, { box: [1.1, 0.31] });
I('simit', 'dukkan', 'Simit Arabası', '🥯', (g) => {
  B(g, 0.8, 0.55, 0.5, '#e3122d', 0, 0.3, 0);
  for (const a of [-0.32, 0.32]) CyX(g, 0.14, 0.04, '#222', a, 0.15, 0.26);
  B(g, 0.76, 0.5, 0.46, K('#dff7ff', { op: 0.35 }), 0, 0.85, 0);
  for (let i = 0; i < 6; i++) {
    const t = To(g, 0.08, 0.03, '#c47a2c', -0.2 + (i % 3) * 0.2, 0.92 + Math.floor(i / 3) * 0.12, 0);
    t.rotation.x = PI / 2;
  }
  B(g, 0.84, 0.04, 0.54, '#fff', 0, 1.35, 0);
}, { box: [0.42, 0.27] });

// ── Benzinlik
I('pump', 'benzin', 'Akaryakıt Pompası', '⛽', (g) => {
  B(g, 0.9, 0.15, 0.9, '#d9dee5');
  B(g, 0.55, 1.55, 0.38, '#f8fafc', 0, 0.15, 0);
  B(g, 0.57, 0.25, 0.4, '#e3122d', 0, 1.5, 0);
  Pl(g, 0.4, 0.3, K('#fff', { map: T('pump'), e: '#fff', ei: 0.9 }), 0, 1.1, 0.195);
  for (const s of [-1, 1]) {
    B(g, 0.07, 0.2, 0.08, '#222', s * 0.2, 0.6, 0.23);
    const h = To(g, 0.18, 0.02, '#222', s * 0.33, 0.55, 0.12, null, PI);
    h.rotation.y = PI / 2;
  }
}, { box: [0.45, 0.45] });
I('canopy', 'benzin', 'Benzinlik Sundurması', '🏪', (g) => {
  for (const a of [-2.6, 2.6]) for (const b of [-1.6, 1.6]) Cy(g, 0.14, 2.7, '#e5e7eb', a, 0, b);
  B(g, 6, 0.3, 4, '#f8fafc', 0, 2.7, 0);
  const n = K('#ff2e5a', { e: '#ff2e5a', ei: 0.9 });
  B(g, 6.04, 0.12, 4.04, n, 0, 2.78, 0);
  for (let i = 0; i < 4; i++) B(g, 0.6, 0.03, 0.3, '#fff', -2.1 + i * 1.4, 2.69, 0, { e: '#fff', ei: 0.9 });
  return { light: { x: 0, y: 2.5, z: 0, color: '#ffffff', intensity: 1.6, distance: 6 }, on: true, setOn() {}, noToggle: true };
}, { flat: true, boxes: [[-2.6, -1.6, 0.16, 0.16], [2.6, -1.6, 0.16, 0.16], [-2.6, 1.6, 0.16, 0.16], [2.6, 1.6, 0.16, 0.16]] });
I('airpump', 'benzin', 'Hava / Su Makinesi', '🛞', (g) => {
  B(g, 0.5, 1.1, 0.4, '#2f6be0');
  Cy(g, 0.12, 0.04, '#fff', 0, 0.8, 0.2).rotation.x = PI / 2;
  Cy(g, 0.1, 0.02, '#111', 0, 0.8, 0.215).rotation.x = PI / 2;
  const h = To(g, 0.16, 0.02, '#222', 0.32, 0.45, 0);
  h.rotation.y = PI / 2;
}, { box: [0.25, 0.2] });
I('cone', 'benzin', 'Trafik Konisi', '🚧', (g) => {
  for (const [a, b] of [[-0.2, -0.15], [0.22, -0.1], [0, 0.22]]) {
    B(g, 0.3, 0.04, 0.3, '#ff6a1a', a, 0, b);
    Co(g, 0.12, 0.5, '#ff6a1a', a, 0.04, b);
    Cy(g, 0.075, 0.07, '#fff', a, 0.26, b, null, 12, 0.06);
  }
}, { box: [0.35, 0.35] });
I('carwash', 'benzin', 'Oto Yıkama', '🧽', (g) => {
  for (const a of [-1.4, 1.4]) for (const b of [-0.85, 0.85]) B(g, 0.14, 2.7, 0.14, '#9aa3ad', a, 0, b);
  for (const b of [-0.85, 0.85]) B(g, 2.94, 0.18, 0.14, '#2f6be0', 0, 2.6, b);
  B(g, 2.94, 0.12, 1.84, '#2f6be0', 0, 2.68, 0);
  const br = [];
  for (const a of [-1, 1]) {
    const s = sub(g, a, 0, 0);
    for (let i = 0; i < 8; i++) {
      const st = B(s, 0.05, 1.9, 0.34, i % 2 ? '#2f6be0' : '#e3122d', 0, 0.2, 0);
      st.rotation.y = (i / 8) * PI;
      st.position.set(0, 1.15, 0);
    }
    br.push(s);
  }
  let on = true;
  return {
    act: 'Fırçaları çalıştır / durdur',
    get on() { return on; },
    setOn(v) { on = v; },
    tick(t) { if (on) br.forEach((b, i) => { b.rotation.y = t * (i ? 6 : -6); }); },
  };
}, { boxes: [[-1.4, -0.85, 0.1, 0.1], [1.4, -0.85, 0.1, 0.1], [-1.4, 0.85, 0.1, 0.1], [1.4, 0.85, 0.1, 0.1]] });
I('pricesign', 'benzin', 'Fiyat Totemi', '🪧', (g) => {
  B(g, 0.6, 2.7, 0.3, '#14161c');
  Pl(g, 0.56, 1.68, K('#fff', { map: T('prices'), e: '#fff', ei: 0.9 }), 0, 1.85, 0.155);
}, { box: [0.3, 0.15] });

// ── Yayın seti
I('cyc', 'yayin', 'Yeşil Perde Fonu', '🟩', (g) => {
  const gm = K('#1fbf4a', { e: '#0f8a33', ei: 0.35 });
  B(g, 4, 0.03, 1.6, gm, 0, 0, 0.2);
  B(g, 4, 2.6, 0.04, gm, 0, 0, -0.9);
  const c = add(g, new THREE.CylinderGeometry(0.4, 0.4, 4, 12, 1, true, PI, PI / 2), K('#1fbf4a', { e: '#0f8a33', ei: 0.35, side: 1 }), 0, 0.4, -0.5);
  c.rotation.z = PI / 2;
  for (const a of [-2, 2]) B(g, 0.05, 2.8, 0.05, '#222', a, 0, -0.95);
  B(g, 4.05, 0.05, 0.05, '#222', 0, 2.8, -0.95);
}, { flat: true, boxes: [[0, -0.92, 2.0, 0.05]] });
I('softbox', 'yayin', 'Softbox Işık', '💡', (g) => {
  tripod(g, 1.7);
  const h = sub(g, 0, 1.8, 0);
  h.rotation.x = -0.3;
  B(h, 0.62, 0.62, 0.26, '#111');
  Pl(h, 0.56, 0.56, K('#fff', { e: '#fff', ei: 1 }), 0, 0.31, 0.135);
  return { light: { x: 0, y: 1.9, z: 0.6, color: '#ffffff', intensity: 1.8, distance: 4 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.2, 0.2] });
I('ringlight', 'yayin', 'Halka Işık', '⭕', (g) => {
  tripod(g, 1.55);
  To(g, 0.3, 0.04, '#fff', 0, 1.75, 0, { e: '#fff', ei: 1.1 });
  B(g, 0.08, 0.15, 0.02, '#111', 0, 1.68, 0);
  return { light: { x: 0, y: 1.75, z: 0.5, color: '#fff6ea', intensity: 1.4, distance: 3 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.2, 0.2] });
I('streamcam', 'yayin', 'Yayın Kamerası', '🎥', (g) => {
  tripod(g, 1.4);
  B(g, 0.32, 0.22, 0.2, '#1b1b1e', 0, 1.4, 0);
  CyZ(g, 0.08, 0.22, '#111', 0, 1.51, 0.2);
  const m = K('#ff2e5a', { e: '#ff2e5a', u: 1 });
  Sp(g, 0.025, m, 0.12, 1.66, 0.05, null, 8);
  return { tick(t) { blink(m, t, 4, 0, 2); } };
}, { box: [0.2, 0.2] });
I('streamdesk', 'yayin', 'Yayıncı Masası', '🖥️', (g) => {
  B(g, 1.9, 0.05, 0.8, '#1b1b1e', 0, 0.74, 0);
  for (const a of [-0.9, 0.9]) B(g, 0.05, 0.74, 0.7, '#111', a, 0, 0);
  const led = K('#b45cff', { e: '#b45cff', ei: 1.2, u: 1 });
  B(g, 1.9, 0.03, 0.02, led, 0, 0.7, 0.4);
  for (const a of [-0.42, 0.42]) {
    B(g, 0.8, 0.46, 0.04, '#111', a, 0.95, -0.25);
    Pl(g, 0.75, 0.42, K('#fff', { map: T('stream'), e: '#fff', ei: 0.8 }), a, 1.18, -0.228);
    B(g, 0.06, 0.2, 0.06, '#222', a, 0.76, -0.27);
  }
  B(g, 0.6, 0.03, 0.2, '#2b2d33', 0, 0.77, 0.15);
  const arm = B(g, 0.03, 0.5, 0.03, '#222', 0.8, 0.77, -0.2);
  arm.rotation.z = 0.4;
  Sp(g, 0.06, '#2b2d33', 0.62, 1.22, -0.05);
  return { tick(t) { led.emissive.setHSL((t * 0.1) % 1, 1, 0.55); }, light: { x: 0, y: 1.2, z: 0.4, color: '#b45cff', intensity: 1, distance: 3 }, on: true, setOn() {}, noToggle: true };
}, { box: [0.95, 0.4], venueOnly: true }); // v93: mağazadan kaldırıldı (yayın: Oyuncu Bilgisayarı); eldekiler çalışır

// ── Mafya
// Patron Masası: renk seçenekleri (masa ahşabı + sandalye döşemesi + lamba)
export const BOSSTABLE_TINTS = [
  { n: 'Ceviz & Bordo', c: '#3d1d07', s: '#5a0a1a', l: '#1f5a3a' },
  { n: 'Siyah & Altın', c: '#141416', s: '#c9a227', l: '#141416' },
  { n: 'Beyaz Mermer', c: '#e8e4dc', s: '#1f2a48', l: '#c9a227' },
  { n: 'Meşe & Krem', c: '#a3764a', s: '#e6dfd2', l: '#2d5a3a' },
  { n: 'Kiraz & Siyah Deri', c: '#7a2e22', s: '#171513', l: '#7a2e22' },
  { n: 'Gri & Zümrüt', c: '#4c4d53', s: '#1d4d3c', l: '#1d4d3c' },
  { n: 'Lacivert & Pirinç', c: '#18213a', s: '#b8862e', l: '#b8862e' },
  { n: 'Neon Mor', c: '#1b1230', s: '#b16bff', l: '#ff2d8a' },
];
I('bosstable', 'mafya', 'Patron Masası', '🕴️', (g, ctx) => {
  const t = ctx.tint || BOSSTABLE_TINTS[0];
  const wood = K(t.c, { r: 0.35, m: 0.1 });
  const darker = K(new THREE.Color(t.c).multiplyScalar(0.7).getStyle(), { r: 0.4 });
  Cy(g, 0.7, 0.06, wood, 0, 0.72, 0, null, 28);
  Cy(g, 0.1, 0.72, darker);
  Cy(g, 0.35, 0.04, darker);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + PI / 2;
    chair(g, Math.cos(a) * 1.0, Math.sin(a) * 0.82, -a - PI / 2, darker, K(t.s, { r: 0.6 }));
  }
  Cy(g, 0.006, 0.8, '#222', 0, 2.2);
  const l = Co(g, 0.3, 0.22, K(t.l, { r: 0.4, m: 0.3 }), 0, 2.0, 0, null, 16);
  l.rotation.x = PI;
  Sp(g, 0.07, '#fff6c8', 0, 2.02, 0, { e: '#ffd88a', ei: 1.4 });
  Cy(g, 0.07, 0.03, '#888', 0.2, 0.78, 0.1);
  Cy(g, 0.03, 0.09, '#d4a93a', -0.2, 0.78, -0.15, { op: 0.7 });
  return { light: { x: 0, y: 1.9, z: 0, color: '#ffd88a', intensity: 1.8, distance: 4 }, on: true, setOn() {}, noToggle: true };
}, {
  box: [0.72, 0.72],
  seats: [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * PI * 2 + PI / 2;
    return [Math.cos(a) * 1.0, 0.48, Math.sin(a) * 0.82];
  }),
  tints: 'bosstable',
});
I('crates', 'mafya', 'Kaçak Kasalar', '📦', (g) => {
  const m = K('#fff', { map: T('crate') });
  B(g, 0.9, 0.9, 0.9, m, -0.45, 0, -0.45);
  B(g, 0.9, 0.9, 0.9, m, 0.47, 0, -0.42);
  B(g, 0.9, 0.9, 0.9, m, -0.42, 0, 0.47);
  B(g, 0.85, 0.85, 0.85, m, -0.45, 0.9, -0.45).rotation.y = 0.2;
}, { boxes: [[0, -0.43, 0.92, 0.47], [-0.42, 0.47, 0.47, 0.45]] });
I('bulb', 'mafya', 'Sallanan Ampul', '💡', (g, ctx) => {
  const H = ctx.H || 3.4;
  const p = sub(g, 0, H, 0);
  Cy(p, 0.006, 0.75, '#222', 0, -0.75, 0);
  Sp(p, 0.08, '#ffe9a8', 0, -0.82, 0, { e: '#ffcf5a', ei: 1.4 });
  Cy(p, 0.04, 0.06, '#888', 0, -0.76, 0);
  let on = true;
  return {
    act: 'Ampulü aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; },
    tick(t) { p.rotation.z = Math.sin(t * 1.3) * 0.12; },
    light: { x: 0, y: H - 0.9, z: 0, color: '#ffcf5a', intensity: 2, distance: 5 },
  };
}, { ceil: true, nobox: true });

// ── Sinema
I('cinescreen', 'sinema', 'Sinema Perdesi', '🎬', (g, ctx) => {
  B(g, 4, 2.3, 0.12, '#111', 0, 0.45, -0.3);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const cx = c.getContext('2d');
  cinemaPoster(cx, 512, 288);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  const sm = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.85, roughness: 0.6 });
  sm.userData.tex = tx;
  Pl(g, 3.6, 2.0, sm, 0, 1.6, -0.235);
  for (const a of [-1.85, 1.85]) {
    B(g, 0.3, 2.9, 0.3, '#a3161c', a, 0, -0.15);
    B(g, 0.06, 0.45, 0.06, '#222', a * 0.8, 0, -0.3);
  }
  B(g, 4, 0.3, 0.3, '#7a1018', 0, 2.75, -0.15);
  let on = false;
  let last = -1;
  const live = ctx.live !== false;
  return {
    act: '🎬 Filmi başlat / durdur',
    get on() { return on; },
    setOn(v) {
      on = v;
      if (!on) {
        cinemaPoster(cx, 512, 288);
        tx.needsUpdate = true;
      }
    },
    tick() {
      if (!on || !live) return;
      const now = performance.now();
      if (now - last < 50) return; // ~20 kare/sn
      last = now;
      // herkes aynı kareyi görsün: gerçek saatle senkron 60 sn döngü
      const t = (Date.now() / 1000) % CARTOON_SECONDS;
      drawCartoon(cx, 512, 288, t);
      tx.needsUpdate = true;
    },
    light: { x: 0, y: 1.6, z: 1.2, color: '#9ab8ff', intensity: 2.2, distance: 7 },
  };
}, { boxes: [[0, -0.3, 2.0, 0.08], [-1.85, -0.15, 0.15, 0.15], [1.85, -0.15, 0.15, 0.15]] });
I('cineseat', 'sinema', 'Sinema Koltuğu (çift)', '🍿', (g) => {
  for (const a of [-0.45, 0.45]) {
    B(g, 0.78, 0.42, 0.7, '#c4161c', a, 0, 0.05);
    B(g, 0.78, 0.62, 0.18, '#a3121a', a, 0.38, -0.27);
  }
  for (const a of [-0.92, 0, 0.92]) {
    B(g, 0.12, 0.6, 0.75, '#2b1608', a, 0, 0);
    Cy(g, 0.05, 0.06, '#111', a, 0.6, 0.2, null, 10);
  }
}, { box: [0.98, 0.4], seats: [[-0.45, 0.45, 0.08], [0.45, 0.45, 0.08]] });
I('popcorn', 'sinema', 'Patlamış Mısır Makinesi', '🍿', (g) => {
  const r = rng('popcorn');
  B(g, 0.6, 0.8, 0.5, '#e3122d');
  for (const a of [-0.22, 0.22]) Cy(g, 0.06, 0.04, '#222', a, 0, 0.18);
  B(g, 0.56, 0.55, 0.46, K('#fffbe6', { op: 0.35 }), 0, 0.8, 0);
  for (let i = 0; i < 40; i++) Sp(g, 0.035, i % 5 ? '#fff4c2' : '#ffd23f', (r() - 0.5) * 0.44, 0.84 + r() * 0.16, (r() - 0.5) * 0.36, null, 6);
  B(g, 0.62, 0.12, 0.52, '#e3122d', 0, 1.35, 0);
  Co(g, 0.12, 0.12, '#ffd23f', 0, 1.47, 0, { e: '#ffd23f', ei: 0.4 });
}, { box: [0.3, 0.25] });

// ── Çiftlik
I('hay', 'ciftlik', 'Saman Balyası', '🌾', (g) => {
  CyX(g, 0.42, 0.85, '#e9c46a', 0, 0.42, 0, { r: 0.95 }, 20);
  To(g, 0.25, 0.02, '#d4a940', 0.43, 0.42, 0).rotation.y = PI / 2;
  To(g, 0.12, 0.02, '#d4a940', 0.43, 0.42, 0).rotation.y = PI / 2;
}, { box: [0.43, 0.42], seats: [[0, 0.85, 0]] });
I('scarecrow', 'ciftlik', 'Korkuluk', '🎃', (g) => {
  Cy(g, 0.04, 1.8, '#8b5a2b');
  CyX(g, 0.035, 1.1, '#8b5a2b', 0, 1.35, 0);
  B(g, 0.45, 0.55, 0.25, K('#fff', { map: T('plaid') }), 0, 1.05, 0);
  Sp(g, 0.17, '#d9b77a', 0, 1.82, 0);
  Cy(g, 0.32, 0.03, '#6b4226', 0, 1.95);
  Co(g, 0.16, 0.28, '#6b4226', 0, 1.97, 0);
}, { box: [0.15, 0.15] });
I('vegbed', 'ciftlik', 'Sebze Tarhı', '🥕', (g) => {
  B(g, 1.9, 0.25, 0.8, '#8b5a2b');
  B(g, 1.8, 0.04, 0.7, '#5a3a1f', 0, 0.25, 0);
  for (let i = 0; i < 6; i++) {
    Sp(g, 0.12, '#5fbf4a', -0.75 + i * 0.3, 0.38, -0.15, null, 8);
    Co(g, 0.04, 0.18, '#ff8a3d', -0.75 + i * 0.3, 0.18, 0.18, null, 6).rotation.x = PI;
    Co(g, 0.03, 0.14, '#40c057', -0.75 + i * 0.3, 0.29, 0.18, null, 5);
  }
}, { box: [0.95, 0.4] });
I('tree', 'ciftlik', 'Ağaç', '🌳', (g) => {
  Cy(g, 0.12, 1.2, '#7a4a24', 0, 0, 0, null, 10);
  Sp(g, 0.6, '#3f9e4a', 0, 1.6, 0, { r: 0.9 }, 12);
  Sp(g, 0.45, '#56b85e', 0.3, 1.85, 0.15, { r: 0.9 }, 12);
  Sp(g, 0.4, '#2f8a3e', -0.3, 1.9, -0.1, { r: 0.9 }, 12);
}, { box: [0.15, 0.15] });
I('tractor', 'ciftlik', 'Traktör', '🚜', (g) => {
  const red = '#d62828';
  B(g, 0.9, 0.6, 1.4, red, 0, 0.45, 0.55);
  B(g, 0.92, 0.08, 1.42, '#222', 0, 0.42, 0.55);
  Cy(g, 0.05, 0.6, '#333', 0.25, 1.05, 0.95);
  B(g, 1.1, 0.08, 1.1, '#f1f5f9', 0, 1.9, -0.55);
  for (const a of [-0.5, 0.5]) for (const b of [-1.05, -0.05]) B(g, 0.05, 1, 0.05, '#333', a, 0.95, b);
  B(g, 0.4, 0.12, 0.4, '#111', 0, 0.95, -0.6);
  for (const s of [-1, 1]) {
    CyX(g, 0.58, 0.32, '#1b1b1e', s * 0.72, 0.58, -0.55, { r: 0.9 }, 20);
    CyX(g, 0.3, 0.33, '#ffd23f', s * 0.72, 0.58, -0.55, null, 14);
    CyX(g, 0.32, 0.22, '#1b1b1e', s * 0.6, 0.32, 0.95, { r: 0.9 }, 16);
    CyX(g, 0.16, 0.23, '#ffd23f', s * 0.6, 0.32, 0.95, null, 10);
  }
  B(g, 0.6, 0.3, 0.06, '#ccc', 0, 0.5, 1.26);
}, { box: [0.85, 1.35], seats: [[0, 1.1, -0.6]], seatLabel: '🚜 Traktöre bin' });

// ── Kamp
I('tent', 'kamp', 'Çadır', '⛺', (g) => {
  const t = Co(g, 1.05, 1.4, '#ff8a3d', 0, 0, 0, null, 4);
  t.rotation.y = PI / 4;
  const d = Co(g, 0.4, 0.7, '#3a2a1a', 0, 0, 0.62, null, 3);
  d.rotation.y = PI;
  d.scale.z = 0.15;
}, { box: [0.72, 0.72] });
I('campfire', 'kamp', 'Kamp Ateşi', '🔥', (g) => {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    Sp(g, 0.1, '#8a8a8a', Math.cos(a) * 0.34, 0.06, Math.sin(a) * 0.34, { r: 0.9 }, 8);
  }
  for (let i = 0; i < 3; i++) {
    const l = CyX(g, 0.05, 0.55, '#6b4226', 0, 0.08, 0, null, 8);
    l.rotation.y = (i * PI) / 3;
  }
  const f1 = K('#ff6a1a', { e: '#ff4500', ei: 1.2, u: 1 });
  const f2 = K('#ffd23f', { e: '#ffb000', ei: 1.2, u: 1 });
  const a = Co(g, 0.18, 0.5, f1, 0, 0.1, 0, null, 8);
  const b = Co(g, 0.1, 0.32, f2, 0, 0.12, 0, null, 8);
  a.castShadow = b.castShadow = false;
  let on = true;
  return {
    act: 'Ateşi yak / söndür',
    get on() { return on; },
    setOn(v) { on = v; a.visible = b.visible = v; },
    tick(t) {
      if (!on) return;
      a.scale.y = 1 + Math.sin(t * 9) * 0.15;
      b.scale.y = 1 + Math.sin(t * 13 + 1) * 0.2;
      a.rotation.y = t;
    },
    light: { x: 0, y: 0.6, z: 0, color: '#ff8a3d', intensity: 2.2, distance: 5 },
  };
}, { box: [0.38, 0.38] });


// =============================================================================
// v92 Faz 8 — Mekân mobilyaları (Camii, Banka, Gazino, Karakol, Galeri,
// Silahçı, Modifiye, Park). Mekânlar 3D'ye taşınırken eksik kalan eşyalar.
// venueOnly: sadece oyunun mekânlarında kullanılır (mağazada satılmaz).
// =============================================================================
Object.assign(TEX, {
  cini: [256, 256, (x) => {
    x.fillStyle = '#f4efe2';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const cx = 32 + i * 64;
        const cy = 32 + j * 64;
        x.strokeStyle = '#1d5fa8';
        x.lineWidth = 3;
        x.strokeRect(cx - 30, cy - 30, 60, 60);
        circle(x, cx, cy, 20, '#1d5fa8');
        circle(x, cx, cy, 13, '#3ab0a5');
        circle(x, cx, cy, 6, '#c8322f');
        for (let k = 0; k < 4; k++) {
          const a = (k * PI) / 2 + PI / 4;
          circle(x, cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 4, '#3ab0a5');
        }
      }
  }],
  seccade: [256, 512, (x) => {
    x.fillStyle = '#7a1424';
    x.fillRect(0, 0, 256, 512);
    x.strokeStyle = '#e8c766';
    x.lineWidth = 10;
    x.strokeRect(14, 14, 228, 484);
    x.fillStyle = '#1f5c3a';
    x.fillRect(34, 34, 188, 444);
    x.fillStyle = '#7a1424';
    x.beginPath();
    x.moveTo(52, 470);
    x.lineTo(52, 170);
    x.quadraticCurveTo(128, 40, 204, 170);
    x.lineTo(204, 470);
    x.closePath();
    x.fill();
    x.strokeStyle = '#e8c766';
    x.lineWidth = 4;
    x.stroke();
    circle(x, 128, 300, 30, '#e8c766');
    circle(x, 128, 300, 18, '#1f5c3a');
    for (let i = 0; i < 6; i++) circle(x, 70 + i * 23, 440, 5, '#e8c766');
  }],
  minder: [128, 128, (x) => {
    x.fillStyle = '#8c2f39';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#e8c766';
    x.lineWidth = 6;
    x.strokeRect(10, 10, 108, 108);
    circle(x, 64, 64, 22, '#e8c766');
    circle(x, 64, 64, 12, '#8c2f39');
  }],
  queue: [256, 128, (x) => {
    x.fillStyle = '#0b1220';
    x.fillRect(0, 0, 256, 128);
    txt(x, 'SIRA', 70, 34, 'bold 26px Arial', '#9fb3c8');
    txt(x, 'VEZNE', 190, 34, 'bold 26px Arial', '#9fb3c8');
    [['047', '1'], ['048', '2'], ['049', '3']].forEach(([a, b], i) => {
      txt(x, a, 70, 64 + i * 22, 'bold 22px monospace', '#ff3b3b', '#ff3b3b');
      txt(x, b, 190, 64 + i * 22, 'bold 22px monospace', '#ff3b3b', '#ff3b3b');
    });
  }],
  ticket: [128, 96, (x) => {
    x.fillStyle = '#0a0f18';
    x.fillRect(0, 0, 128, 96);
    txt(x, 'NUMARA AL', 64, 24, 'bold 15px Arial', '#cfe3ff');
    txt(x, '050', 64, 62, 'bold 36px monospace', '#3df58a', '#3df58a');
  }],
  wanted: [256, 192, (x) => {
    x.fillStyle = '#c9a66b';
    x.fillRect(0, 0, 256, 192);
    txt(x, 'ARANIYOR', 128, 22, '900 24px Arial Black,Arial', '#3a1a08');
    for (let i = 0; i < 3; i++) {
      x.fillStyle = '#efe2c4';
      x.fillRect(14 + i * 80, 44, 68, 96);
      x.fillStyle = '#2b2b2b';
      x.beginPath();
      x.arc(48 + i * 80, 78, 16, 0, PI * 2);
      x.fill();
      x.fillRect(32 + i * 80, 96, 32, 40);
      txt(x, ['5.000', '12.000', '40.000'][i], 48 + i * 80, 160, 'bold 15px monospace', '#7a1010');
    }
  }],
  flag: [384, 256, (x) => {
    x.fillStyle = '#e30a17';
    x.fillRect(0, 0, 384, 256);
    circle(x, 140, 128, 64, '#fff');
    circle(x, 156, 128, 51, '#e30a17');
    x.fillStyle = '#fff';
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 13 : 32;
      const a = -PI / 2 + (i * PI) / 5;
      const px = 228 + Math.cos(a) * r;
      const py = 128 + Math.sin(a) * r;
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    x.closePath();
    x.fill();
  }],
  police: [256, 64, (x) => {
    x.fillStyle = '#123a7a';
    x.fillRect(0, 0, 256, 64);
    txt(x, 'POLİS', 128, 34, '900 38px Arial Black,Arial', '#fff');
  }],
  reels: [256, 128, (x) => {
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 256, 128);
    ['7', '🍒', 'BAR'].forEach((s, i) => {
      x.fillStyle = i % 2 ? '#fff6dc' : '#fff';
      x.fillRect(i * 85 + 2, 0, 81, 128);
      txt(x, s, i * 85 + 43, 66, s === 'BAR' ? '900 28px Arial Black,Arial' : '900 54px Arial', '#d1142c');
    });
  }],
  roulette: [512, 512, (x) => {
    x.fillStyle = '#5a3416';
    x.fillRect(0, 0, 512, 512);
    const n = 37;
    for (let i = 0; i < n; i++) {
      x.fillStyle = i === 0 ? '#0f8a3a' : i % 2 ? '#c4161c' : '#111';
      x.beginPath();
      x.moveTo(256, 256);
      x.arc(256, 256, 240, (i / n) * PI * 2, ((i + 1) / n) * PI * 2);
      x.closePath();
      x.fill();
    }
    circle(x, 256, 256, 170, '#8a5a2b');
    circle(x, 256, 256, 120, '#5a3416');
    circle(x, 256, 256, 40, '#e8c766');
  }],
  felt: [256, 256, (x) => {
    x.fillStyle = '#0d5a34';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,.35)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(128, 128, 80, 0, PI * 2);
    x.stroke();
    txt(x, '10', 128, 132, '900 46px Arial Black,Arial', 'rgba(255,215,90,.75)');
  }],
  piyango: [256, 96, (x) => {
    x.fillStyle = '#7a1f2b';
    x.fillRect(0, 0, 256, 96);
    txt(x, 'MİLLİ PİYANGO', 128, 34, '900 26px Arial Black,Arial', '#ffd76a', '#ffb000');
    txt(x, 'Bilet burada', 128, 72, 'bold 20px Arial', '#fff');
  }],
  bufe: [256, 80, (x) => {
    x.fillStyle = '#ffcf33';
    x.fillRect(0, 0, 256, 80);
    txt(x, 'BÜFE', 128, 44, '900 46px Arial Black,Arial', '#c4161c');
  }],
  target: [256, 256, (x) => {
    x.fillStyle = '#f4f1e8';
    x.fillRect(0, 0, 256, 256);
    [110, 88, 66, 44, 22].forEach((r, i) => circle(x, 128, 128, r, i % 2 ? '#f4f1e8' : '#111'));
    circle(x, 128, 128, 10, '#d1142c');
  }],
  showroom: [512, 96, (x) => {
    const gr = x.createLinearGradient(0, 0, 512, 0);
    gr.addColorStop(0, '#0b1a3a');
    gr.addColorStop(1, '#1a3b7a');
    x.fillStyle = gr;
    x.fillRect(0, 0, 512, 96);
    txt(x, 'NEON MOTORS', 256, 50, '900 54px Arial Black,Arial', '#fff', '#5aa9ff');
  }],
  vault: [256, 256, (x) => {
    const gr = x.createRadialGradient(128, 128, 20, 128, 128, 128);
    gr.addColorStop(0, '#d9dde3');
    gr.addColorStop(1, '#7c8590');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#59616b';
    x.lineWidth = 6;
    for (const r of [118, 96]) {
      x.beginPath();
      x.arc(128, 128, r, 0, PI * 2);
      x.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * PI * 2;
      circle(x, 128 + Math.cos(a) * 107, 128 + Math.sin(a) * 107, 5, '#4a5059');
    }
  }],
  mihrap: [256, 512, (x) => {
    x.fillStyle = '#f4efe2';
    x.fillRect(0, 0, 256, 512);
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 4; i++) {
        const cx = 32 + i * 64;
        const cy = 32 + j * 64;
        circle(x, cx, cy, 22, '#1d5fa8');
        circle(x, cx, cy, 14, '#3ab0a5');
        circle(x, cx, cy, 6, '#f4efe2');
      }
    x.fillStyle = 'rgba(20,40,80,.55)';
    x.beginPath();
    x.moveTo(60, 512);
    x.lineTo(60, 200);
    x.quadraticCurveTo(128, 90, 196, 200);
    x.lineTo(196, 512);
    x.closePath();
    x.fill();
    x.strokeStyle = '#e8c766';
    x.lineWidth = 10;
    x.stroke();
  }],
});

// ── Camii
I('mihrap', 'cami', 'Mihrap', '🕌', (g) => {
  B(g, 2.4, 3.1, 0.35, '#e9e1cf', 0, 0, -0.1);
  Pl(g, 1.7, 2.7, K('#fff', { map: T('mihrap') }), 0, 1.35, 0.08);
  B(g, 2.6, 0.18, 0.5, '#c9a24a', 0, 3.1, -0.05, { m: 0.6, r: 0.35 });
  for (const s of [-1, 1]) Cy(g, 0.11, 3.0, '#d8cdb3', s * 1.08, 0, 0.12);
  B(g, 1.0, 0.12, 0.35, '#c9a24a', 0, 0, 0.2, { m: 0.5, r: 0.4 });
}, { box: [1.25, 0.32], venueOnly: true });
I('minber', 'cami', 'Minber', '🪜', (g) => {
  const wood = '#6b3f1f';
  for (let i = 0; i < 7; i++) B(g, 0.9, 0.22, 0.42, wood, 0, i * 0.22, 1.2 - i * 0.36);
  for (const s of [-1, 1]) {
    const rail = B(g, 0.06, 0.06, 2.9, '#c9a24a', s * 0.46, 1.45, -0.05, { m: 0.6 });
    rail.rotation.x = -0.57;
  }
  B(g, 1.0, 1.6, 0.9, wood, 0, 0, -1.25);
  for (const s of [-1, 1]) Cy(g, 0.05, 0.6, '#c9a24a', s * 0.45, 1.6, -1.25, { m: 0.6 });
  Co(g, 0.62, 0.7, '#2e6b4a', 0, 2.2, -1.25, null, 8);
  Sp(g, 0.06, '#e8c766', 0, 2.95, -1.25, { m: 0.7 });
}, { box: [0.5, 1.65], venueOnly: true });
I('seccade', 'cami', 'Seccade', '🟥', (g) => {
  Pl(g, 0.9, 1.6, K('#fff', { map: T('seccade') }), 0, 0.006, 0).rotation.x = -PI / 2;
}, { nobox: true, flat: true });
I('camiavize', 'cami', 'Cami Avizesi', '🕯️', (g, ctx) => {
  const H = ctx.H || 3.4;
  const p = sub(g, 0, H, 0);
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * PI) / 3;
    const ch = Cy(p, 0.006, 0.62, '#222', Math.cos(a) * 0.6, -0.62, Math.sin(a) * 0.6);
    ch.rotation.z = Math.cos(a) * 0.5;
    ch.rotation.x = -Math.sin(a) * 0.5;
  }
  const ring = To(p, 1.2, 0.035, '#c9a24a', 0, -0.66, 0, { m: 0.7, r: 0.3 });
  ring.rotation.x = PI / 2;
  const glow = K('#fff7d6', { e: '#ffcf5a', ei: 1.5, u: 1 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    Sp(p, 0.06, glow, Math.cos(a) * 1.2, -0.58, Math.sin(a) * 1.2, null, 8);
  }
  let on = true;
  return {
    act: 'Avizeyi aç/kapat',
    get on() { return on; },
    setOn(v) { on = v; glow.emissiveIntensity = v ? 1.5 : 0; },
    light: { x: 0, y: H - 0.8, z: 0, color: '#ffd89a', intensity: 1.8, distance: 8 },
  };
}, { ceil: true, nobox: true });
I('rahle', 'cami', 'Rahle', '📖', (g) => {
  const w = '#7a4a24';
  for (const s of [-1, 1]) {
    const a = B(g, 0.42, 0.34, 0.03, w, 0, 0, s * 0.06);
    a.rotation.x = s * 0.5;
  }
  const bk = sub(g, 0, 0.34, 0);
  for (const s of [-1, 1]) {
    const pg = B(bk, 0.17, 0.02, 0.24, '#f6f0e0', s * 0.09, 0, 0);
    pg.rotation.z = -s * 0.25;
  }
  B(bk, 0.38, 0.015, 0.26, '#1f5c3a', 0, -0.02, 0);
}, { box: [0.22, 0.18] });
I('ayakkabilik', 'cami', 'Ayakkabılık', '👞', (g) => {
  B(g, 1.6, 1.1, 0.03, '#6b4320', 0, 0, -0.17);
  for (const sx of [-1, 1]) B(g, 0.04, 1.1, 0.38, '#8a5a2b', sx * 0.78, 0, 0);
  B(g, 1.6, 0.04, 0.38, '#8a5a2b', 0, 1.06, 0);
  for (let r = 0; r < 3; r++) {
    B(g, 1.5, 0.02, 0.34, '#5e3a1a', 0, 0.1 + r * 0.34, 0.02);
    for (let i = 0; i < 4; i++) {
      const c = ['#222', '#5b3a24', '#1d2a44', '#3a3a3a'][(i + r) % 4];
      B(g, 0.13, 0.08, 0.26, c, -0.55 + i * 0.37 - 0.08, 0.12 + r * 0.34, 0.03);
      B(g, 0.13, 0.08, 0.26, c, -0.55 + i * 0.37 + 0.08, 0.12 + r * 0.34, 0.03);
    }
  }
}, { box: [0.8, 0.19] });
I('cini', 'cami', 'Çini Pano', '🔷', (g) => {
  B(g, 1.3, 1.3, 0.04, '#c9a24a', 0, 0.95, 0.02, { m: 0.5 });
  Pl(g, 1.2, 1.2, K('#fff', { map: T('cini') }), 0, 1.6, 0.045);
}, { wall: true, wallW: 0.65 });
I('minder', 'cami', 'Yer Minderi', '🟫', (g) => {
  const m = K('#fff', { map: T('minder') });
  B(g, 0.6, 0.12, 0.6, m, 0, 0, 0);
}, { box: [0.3, 0.3], seats: [[0, 0.14, 0]] });
I('bagiskutusu', 'cami', 'Bağış Kutusu', '🤲', (g) => {
  B(g, 0.36, 0.9, 0.3, '#2e6b4a');
  B(g, 0.4, 0.06, 0.34, '#c9a24a', 0, 0.9, 0, { m: 0.6 });
  B(g, 0.16, 0.012, 0.02, '#111', 0, 0.96, 0);
  B(g, 0.38, 0.08, 0.32, '#c9a24a', 0, 0.5, 0, { m: 0.6 });
}, { box: [0.18, 0.15] });

// ── Banka
I('vezne', 'banka', 'Vezne Gişesi', '🏦', (g) => {
  B(g, 1.8, 1.05, 0.7, '#e7e2d8');
  B(g, 1.9, 0.06, 0.8, '#3c4654', 0, 1.05, 0, { m: 0.2, r: 0.3 });
  B(g, 1.8, 0.3, 0.06, '#1d3d5c', 0, 0.55, 0.36);
  Pl(g, 1.7, 0.9, K('#cfe6ff', { op: 0.22, side: 1, r: 0.05 }), 0, 1.55, 0.05);
  for (const s of [-1, 1]) B(g, 0.05, 0.95, 0.05, '#9aa4b2', s * 0.88, 1.1, 0.05, { m: 0.7 });
  B(g, 1.8, 0.05, 0.08, '#9aa4b2', 0, 2.03, 0.05, { m: 0.7 });
  B(g, 0.4, 0.04, 0.1, '#111', 0, 1.1, 0.2);
  const s = sub(g, 0, 0, -0.75);
  chair(s, 0, 0, 0, '#2a2f38', '#1d3d5c');
}, { box: [0.95, 0.38], boxes: [[0, 0, 0.95, 0.38], [0, -0.75, 0.25, 0.25]] });
I('numarator', 'banka', 'Sıramatik', '🎫', (g) => {
  B(g, 0.42, 1.25, 0.32, '#c8ced6', 0, 0, 0, { m: 0.3, r: 0.35 });
  B(g, 0.36, 0.28, 0.02, '#0a0f18', 0, 0.98, 0.16);
  Pl(g, 0.32, 0.24, K('#fff', { map: T('ticket'), e: '#fff', ei: 0.8 }), 0, 1.12, 0.172);
  B(g, 0.2, 0.05, 0.05, '#222', 0, 0.82, 0.17);
  B(g, 0.08, 0.02, 0.06, '#f4f1e8', 0, 0.78, 0.2);
  Cy(g, 0.05, 0.04, '#ff3b3b', 0.12, 0.9, 0.16, { e: '#ff3b3b', ei: 0.8 });
}, { box: [0.21, 0.16] });
I('siraekran', 'banka', 'Sıra Ekranı', '🔢', (g) => {
  B(g, 1.3, 0.68, 0.06, '#111', 0, 1.95, 0.03);
  Pl(g, 1.22, 0.6, K('#fff', { map: T('queue'), e: '#fff', ei: 1 }), 0, 2.29, 0.062);
}, { wall: true, wallW: 0.65 });
I('vaultdoor', 'banka', 'Kasa Dairesi Kapısı', '🔒', (g) => {
  B(g, 2.2, 2.4, 0.25, '#4a5059', 0, 0, 0.12, { m: 0.6, r: 0.4 });
  const d = CyZ(g, 0.95, 0.3, '#a9b0ba', 0, 1.2, 0.38, { m: 0.85, r: 0.25 }, 32);
  d.rotation.x = PI / 2;
  Pl(g, 1.8, 1.8, K('#fff', { map: T('vault'), m: 0.6, r: 0.35 }), 0, 1.2, 0.535);
  for (let i = 0; i < 4; i++) {
    const s = B(g, 0.06, 0.6, 0.06, '#d9dde3', 0, 0.9, 0.6, { m: 0.9, r: 0.2 });
    s.position.y = 1.2;
    s.rotation.z = (i * PI) / 4;
  }
  Sp(g, 0.12, '#c9a24a', 0, 1.2, 0.62, { m: 0.8, r: 0.3 });
}, { wall: true, wallW: 1.1 });
I('stanchion', 'banka', 'Sıra Bariyeri', '🚧', (g) => {
  for (const s of [-1, 1]) {
    Cy(g, 0.14, 0.04, '#c9a24a', s * 0.6, 0, 0, { m: 0.8, r: 0.3 });
    Cy(g, 0.025, 0.95, '#c9a24a', s * 0.6, 0.04, 0, { m: 0.8, r: 0.3 });
    Sp(g, 0.045, '#c9a24a', s * 0.6, 1.0, 0, { m: 0.8 });
  }
  const rope = CyX(g, 0.025, 1.18, '#8a1424', 0, 0.86, 0, { r: 0.8 });
  rope.scale.set(1, 1, 1);
}, { box: [0.7, 0.08] });
I('waitseats', 'banka', 'Bekleme Koltuğu (3\'lü)', '💺', (g) => {
  B(g, 1.9, 0.05, 0.5, '#9aa4b2', 0, 0.38, 0, { m: 0.7 });
  for (const s of [-1, 1]) B(g, 0.05, 0.38, 0.45, '#9aa4b2', s * 0.9, 0, 0, { m: 0.7 });
  for (let i = -1; i <= 1; i++) {
    B(g, 0.56, 0.08, 0.46, '#1d3d5c', i * 0.62, 0.42, 0.02);
    B(g, 0.56, 0.5, 0.07, '#1d3d5c', i * 0.62, 0.5, -0.22);
  }
}, { box: [0.95, 0.26], seats: [[-0.62, 0.48, 0.04], [0, 0.48, 0.04], [0.62, 0.48, 0.04]] });

// ── Gazino
I('slotm', 'gazino', 'Slot Makinesi', '🎰', (g) => {
  B(g, 0.7, 0.85, 0.6, '#5a0f1a');
  B(g, 0.66, 0.9, 0.5, '#b0121f', 0, 0.85, -0.04, { r: 0.35, m: 0.3 });
  B(g, 0.56, 0.32, 0.04, '#111', 0, 1.15, 0.21);
  Pl(g, 0.52, 0.28, K('#fff', { map: T('reels'), e: '#fff', ei: 0.6 }), 0, 1.31, 0.232);
  const top = B(g, 0.7, 0.22, 0.52, '#ffcf33', 0, 1.75, -0.04, { e: '#ffb000', ei: 0.5 });
  top.material = K('#ffcf33', { e: '#ffb000', ei: 0.6, u: 1 });
  B(g, 0.6, 0.06, 0.18, '#1a1a1a', 0, 0.85, 0.32);
  const arm = sub(g, 0.4, 1.0, 0.05);
  Cy(arm, 0.02, 0.45, '#c0c6d0', 0, 0, 0, { m: 0.8 });
  Sp(arm, 0.06, '#e3122d', 0, 0.48, 0);
  const lamp = top.material;
  return { tick(t) { lamp.emissiveIntensity = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4)); }, on: true, setOn() {}, noToggle: true };
}, { box: [0.36, 0.32] });
I('rulet', 'gazino', 'Rulet Masası', '🎡', (g) => {
  B(g, 2.4, 0.8, 1.2, '#3b2410');
  B(g, 2.5, 0.08, 1.3, '#5a3416', 0, 0.8, 0);
  B(g, 1.4, 0.02, 1.1, '#0d5a34', 0.45, 0.88, 0);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) B(g, 0.1, 0.005, 0.32, (i + j) % 2 ? '#c4161c' : '#111', -0.1 + i * 0.105, 0.9, -0.36 + j * 0.36);
  Cy(g, 0.48, 0.1, '#5a3416', -0.75, 0.88, 0, null, 32);
  const wheel = sub(g, -0.75, 0.99, 0);
  const top = Cy(wheel, 0.44, 0.02, K('#fff', { map: T('roulette') }), 0, 0, 0, null, 37);
  top.material = K('#fff', { map: T('roulette') });
  Cy(wheel, 0.05, 0.12, '#e8c766', 0, 0, 0, { m: 0.8 });
  const ball = Sp(g, 0.025, '#fff', -0.75, 1.03, 0.36);
  return {
    on: true,
    setOn() {},
    noToggle: true,
    tick(t) {
      wheel.rotation.y = t * 0.8;
      ball.position.x = -0.75 + Math.cos(-t * 2.2) * 0.36;
      ball.position.z = Math.sin(-t * 2.2) * 0.36;
    },
  };
}, { box: [1.25, 0.65] });
I('kartmasa', 'gazino', 'Kart Masası', '🃏', (g) => {
  Cy(g, 0.12, 0.72, '#2b1a0c', 0, 0, 0);
  Cy(g, 0.85, 0.08, '#4a2b12', 0, 0.72, 0, null, 32);
  Pl(g, 1.5, 1.5, K('#fff', { map: T('felt') }), 0, 0.805, 0).rotation.x = -PI / 2;
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2;
    chair(g, Math.sin(a) * 1.2, Math.cos(a) * 1.2, a + PI, '#2b1a0c', '#7a1424');
    B(g, 0.1, 0.004, 0.14, '#fff', Math.sin(a) * 0.5, 0.81, Math.cos(a) * 0.5);
  }
}, { box: [0.9, 0.9], seats: [0, 1, 2, 3].map((i) => [Math.sin((i * PI) / 2) * 1.2, 0.5, Math.cos((i * PI) / 2) * 1.2]) });
I('piyangogise', 'gazino', 'Piyango Gişesi', '🎟️', (g) => {
  B(g, 1.6, 1.0, 0.7, '#7a1f2b');
  B(g, 1.7, 0.06, 0.8, '#e8c766', 0, 1.0, 0, { m: 0.5 });
  for (const s of [-1, 1]) B(g, 0.08, 1.2, 0.08, '#e8c766', s * 0.8, 1.06, 0.3, { m: 0.5 });
  B(g, 1.7, 0.4, 0.1, '#5a0f1a', 0, 2.26, 0.3);
  Pl(g, 1.6, 0.36, K('#fff', { map: T('piyango'), e: '#fff', ei: 0.7 }), 0, 2.46, 0.356);
  for (let i = 0; i < 5; i++) B(g, 0.12, 0.004, 0.2, '#ffd76a', -0.4 + i * 0.2, 1.065, 0.1);
  const s = sub(g, 0, 0, -0.75);
  chair(s, 0, 0, 0, '#2b1a0c', '#7a1f2b');
}, { box: [0.85, 0.38], boxes: [[0, 0, 0.85, 0.38], [0, -0.75, 0.25, 0.25]] });

// ── Karakol
I('polismasa', 'karakol', 'Polis Bankosu', '👮', (g) => {
  B(g, 2.4, 1.1, 0.7, '#22344f');
  B(g, 2.5, 0.06, 0.8, '#d6dde6', 0, 1.1, 0);
  B(g, 2.4, 0.3, 0.02, '#123a7a', 0, 0.62, 0.36);
  Pl(g, 1.2, 0.3, K('#fff', { map: T('police'), e: '#fff', ei: 0.5 }), 0, 0.77, 0.372);
  B(g, 0.5, 0.35, 0.05, '#111', -0.6, 1.16, -0.15);
  B(g, 0.46, 0.3, 0.01, '#3b6fb6', -0.6, 1.19, -0.12, { e: '#3b6fb6', ei: 0.5 });
  B(g, 0.3, 0.04, 0.2, '#f4f1e8', 0.5, 1.16, 0);
  const s = sub(g, 0, 0, -0.8);
  chair(s, 0, 0, 0, '#1a1d24', '#22344f');
}, { box: [1.25, 0.38], boxes: [[0, 0, 1.25, 0.38], [0, -0.8, 0.25, 0.25]] });
I('bayrak', 'karakol', 'Türk Bayrağı (Direkli)', '🇹🇷', (g) => {
  Cy(g, 0.18, 0.06, '#c9a24a', 0, 0, 0, { m: 0.7 });
  Cy(g, 0.025, 2.6, '#d9dde3', 0, 0.06, 0, { m: 0.7 });
  Sp(g, 0.06, '#c9a24a', 0, 2.7, 0, { m: 0.8 });
  const f = Pl(g, 1.2, 0.8, K('#fff', { map: T('flag'), side: 1, u: 1 }), 0.62, 2.2, 0);
  return { tick(t) { f.rotation.y = Math.sin(t * 1.6) * 0.12; }, on: true, setOn() {}, noToggle: true };
}, { box: [0.15, 0.15] });
I('aranan', 'karakol', 'Arananlar Panosu', '📌', (g) => {
  B(g, 1.3, 1.0, 0.04, '#5e3a1a', 0, 1.1, 0.02);
  Pl(g, 1.2, 0.9, K('#fff', { map: T('wanted') }), 0, 1.6, 0.045);
}, { wall: true, wallW: 0.65 });

// ── Galeri
I('carplatform', 'galeri', 'Döner Sergi Platformu', '💿', (g) => {
  Cy(g, 2.2, 0.12, '#1b1f27', 0, 0, 0, { m: 0.6, r: 0.3 }, 48);
  const ring = To(g, 2.15, 0.03, '#5aa9ff', 0, 0.12, 0, { e: '#5aa9ff', ei: 1.4 });
  ring.rotation.x = PI / 2;
  Cy(g, 2.0, 0.01, '#2a303b', 0, 0.12, 0, { m: 0.8, r: 0.2 }, 48);
}, { nobox: true, flat: true });
I('showroom', 'galeri', 'Showroom Tabelası', '🚘', (g) => {
  B(g, 2.6, 0.55, 0.08, '#0b1a3a', 0, 2.3, 0.04);
  Pl(g, 2.5, 0.47, K('#fff', { map: T('showroom'), e: '#fff', ei: 0.9 }), 0, 2.575, 0.082);
}, { wall: true, wallW: 1.3 });

// ── Silahçı
I('hedef', 'silah', 'Atış Hedefi', '🎯', (g) => {
  for (const s of [-1, 1]) B(g, 0.05, 1.6, 0.05, '#5e3a1a', s * 0.35, 0, 0);
  B(g, 0.8, 0.05, 0.3, '#5e3a1a', 0, 0, 0);
  B(g, 0.66, 0.66, 0.03, '#d8cdb3', 0, 1.0, 0);
  Pl(g, 0.62, 0.62, K('#fff', { map: T('target') }), 0, 1.33, 0.017);
}, { box: [0.4, 0.15] });

// ── Modifiye
I('carlift', 'garaj', 'Araba Lifti', '🛗', (g) => {
  for (const s of [-1, 1]) {
    B(g, 0.3, 2.6, 0.3, '#c4161c', s * 1.45, 0, 0, { m: 0.4, r: 0.4 });
    B(g, 0.12, 0.12, 1.5, '#9aa4b2', s * 1.1, 0.75, 0, { m: 0.8 });
  }
  B(g, 3.2, 0.2, 0.3, '#c4161c', 0, 2.6, 0, { m: 0.4 });
  B(g, 0.5, 0.4, 0.4, '#3a3f4d', 1.45, 0, 0.45);
  B(g, 0.16, 0.12, 0.02, '#3df58a', 1.45, 0.25, 0.66, { e: '#3df58a', ei: 0.8 });
}, { boxes: [[-1.45, 0, 0.17, 0.17], [1.45, 0, 0.17, 0.17]] });

// ── Park
I('fiskiye', 'dis', 'Fıskiyeli Havuz', '⛲', (g) => {
  Cy(g, 1.5, 0.45, '#b8b2a6', 0, 0, 0, { r: 0.85 }, 40);
  Cy(g, 1.35, 0.02, K('#fff', { map: T('water'), r: 0.1, m: 0.1 }), 0, 0.4, 0, null, 40);
  Cy(g, 0.22, 0.9, '#b8b2a6', 0, 0.4, 0);
  Cy(g, 0.6, 0.12, '#b8b2a6', 0, 1.2, 0, null, 24, 0.5);
  const jets = [];
  const wm = K('#cfefff', { op: 0.55, e: '#bfe9ff', ei: 0.4, u: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const j = Co(g, 0.05, 0.6, wm, Math.cos(a) * 0.45, 1.3, Math.sin(a) * 0.45, null, 6);
    j.rotation.z = -Math.cos(a) * 0.5;
    j.rotation.x = Math.sin(a) * 0.5;
    jets.push(j);
  }
  const top = Co(g, 0.08, 0.7, wm, 0, 1.3, 0, null, 8);
  return {
    act: 'Fıskiyeyi aç/kapat',
    on: true,
    setOn(v) { this.on = v; [...jets, top].forEach((m) => (m.visible = v)); },
    tick(t) { top.scale.y = 1 + Math.sin(t * 5) * 0.15; jets.forEach((m, i) => (m.scale.y = 1 + Math.sin(t * 6 + i) * 0.2)); },
  };
}, { box: [1.5, 1.5] });
I('kaydirak', 'dis', 'Kaydırak', '🛝', (g) => {
  for (const a of [-0.35, 0.35]) for (const b of [-1.0, -0.4]) Cy(g, 0.05, 1.6, '#2b6cb0', a, 0, b, { m: 0.4 });
  B(g, 0.8, 0.06, 0.7, '#ffd23f', 0, 1.55, -0.7);
  for (let i = 0; i < 6; i++) B(g, 0.6, 0.04, 0.08, '#e3122d', 0, 0.25 * i + 0.1, -1.15);
  const sl = B(g, 0.6, 0.06, 2.0, '#e3122d', 0, 0.75, 0.45, { r: 0.3 });
  sl.rotation.x = 0.68;
  for (const s of [-1, 1]) {
    const r = B(g, 0.05, 0.12, 2.0, '#ffd23f', s * 0.3, 0.8, 0.45);
    r.rotation.x = 0.68;
  }
}, { box: [0.45, 1.2] });
I('salincak', 'dis', 'Salıncak', '🎠', (g) => {
  for (const s of [-1, 1]) {
    const l1 = B(g, 0.07, 2.3, 0.07, '#2e8b57', s * 1.1, 0, 0.35);
    l1.rotation.x = -0.16;
    const l2 = B(g, 0.07, 2.3, 0.07, '#2e8b57', s * 1.1, 0, -0.35);
    l2.rotation.x = 0.16;
  }
  CyX(g, 0.05, 2.3, '#2e8b57', 0, 2.22, 0);
  const seats = [];
  for (const s of [-0.5, 0.5]) {
    const sw = sub(g, s, 2.2, 0);
    for (const d of [-0.2, 0.2]) Cy(sw, 0.008, 1.6, '#888', d, -1.6, 0);
    B(sw, 0.5, 0.04, 0.22, '#ff7a1a', 0, -1.65, 0);
    seats.push(sw);
  }
  return { tick(t) { seats.forEach((s, i) => (s.rotation.x = Math.sin(t * 1.8 + i) * 0.08)); }, on: true, setOn() {}, noToggle: true };
}, { boxes: [[-1.1, 0, 0.08, 0.45], [1.1, 0, 0.08, 0.45]], seats: [[-0.5, 0.58, 0.05], [0.5, 0.58, 0.05]] });
I('bufe', 'dis', 'Büfe Kulübesi', '🌭', (g) => {
  B(g, 2.2, 2.3, 1.4, '#f4f1e8', 0, 0, -0.1);
  B(g, 2.0, 0.9, 0.05, '#1a1a1a', 0, 1.05, 0.62, { op: 0.35 });
  B(g, 2.3, 0.08, 0.5, '#d6dde6', 0, 1.0, 0.75);
  const aw = sub(g, 0, 2.15, 0.65);
  aw.rotation.x = 0.35;
  for (let i = 0; i < 8; i++) B(aw, 0.29, 0.03, 0.7, i % 2 ? '#fff' : '#e3122d', -1.0 + i * 0.29, 0, 0.3);
  B(g, 2.2, 0.36, 0.06, '#ffcf33', 0, 2.38, 0.55);
  Pl(g, 2.1, 0.3, K('#fff', { map: T('bufe'), e: '#fff', ei: 0.5 }), 0, 2.56, 0.585);
  for (let i = 0; i < 4; i++) B(g, 0.14, 0.24, 0.14, ['#c4161c', '#2b6cb0', '#ffd23f', '#2e8b57'][i], -0.6 + i * 0.4, 1.08, 0.75);
}, { box: [1.15, 1.0] });
I('copkutusu', 'dis', 'Park Çöp Kutusu', '🗑️', (g) => {
  Cy(g, 0.25, 0.85, '#2e5e3a', 0, 0, 0, { m: 0.3 }, 16);
  Cy(g, 0.27, 0.06, '#1d3d26', 0, 0.85, 0, { m: 0.3 }, 16);
  Cy(g, 0.03, 0.06, '#888', 0, 0.91, 0);
}, { box: [0.25, 0.25] });
I('guvercin', 'dis', 'Güvercinler', '🐦', (g) => {
  const r = rng('guv');
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const b = sub(g, (r() - 0.5) * 1.4, 0, (r() - 0.5) * 1.0, r() * 6);
    Sp(b, 0.07, ['#8a8f99', '#6f747d', '#a0a4ab'][i % 3], 0, 0.08, 0, null, 10).scale.set(1, 0.8, 1.4);
    Sp(b, 0.045, '#5a5f68', 0, 0.16, 0.08, null, 8);
    Co(b, 0.012, 0.04, '#e0a33a', 0, 0.15, 0.13, null, 6).rotation.x = PI / 2;
    birds.push(b);
  }
  return { tick(t) { birds.forEach((b, i) => (b.rotation.x = Math.max(0, Math.sin(t * 3 + i * 1.7)) * 0.35)); }, on: true, setOn() {}, noToggle: true };
}, { nobox: true });

// =============================================================================
// Kataloğa çevir
// =============================================================================
// v92 — sade kategori listesi: küçük konseptler mevcut kategorilere katıldı
// (Kamp → Çiftlik, Karakol → Hapishane, Yayın → Stüdyo, Boks → Spor, Havuz → Dış
// Mekan, Benzinlik → Garaj, Helikopter → Lüks, Galeri → Arabalar, Sinema + Gazino).
export const V92_CATEGORIES = [
  { key: 'zemin_parca', name: 'Zemin Parçaları', icon: '🧩' },
  { key: 'duvar_parca', name: 'Duvar Panelleri', icon: '🖼️' },
  { key: 'studyo', name: 'Stüdyo & Yayın', icon: '🎛️' },
  { key: 'eglence', name: 'Sinema & Gazino', icon: '🎬' },
  { key: 'mafya', name: 'Mafya', icon: '🕴️' },
  { key: 'hapis', name: 'Karakol & Hapis', icon: '⛓️' },
  { key: 'ciftlik', name: 'Çiftlik & Kamp', icon: '🚜' },
  { key: 'cami', name: 'Camii', icon: '🕌' },
  { key: 'banka', name: 'Banka', icon: '🏦' },
];
const CAT_MERGE = { yayin: 'studyo', sinema: 'eglence', gazino: 'eglence', havuz: 'dis', boks: 'spor', benzin: 'garaj', heli: 'luks', kamp: 'ciftlik', karakol: 'hapis', galeri: 'araba' };

// neonBuild houseCatalog'da; döngüsel import olmasın diye dışarıdan verilir
export function v92CatalogEntries({ neonBuild }) {
  return DEFS.map((d) => {
    const o = d.opts;
    const e = { k: d.k, name: d.name, cat: CAT_MERGE[d.cat] || d.cat, icon: d.icon };
    if (o.neonText) {
      Object.assign(e, { tints: 'neon', build: neonBuild(o.neonText, 'bold 120px sans-serif'), wall: true, nobox: true });
      return e;
    }
    e.build = (g, ctx) => d.build(g, ctx || {});
    if (o.box) e.box = o.box;
    if (o.boxes) e.boxes = o.boxes;
    if (o.nobox) e.nobox = true;
    if (o.flat) e.flat = true;
    if (o.ceil) e.ceil = true;
    if (o.seats) e.seats = o.seats;
    if (o.seatLabel) e.seatLabel = o.seatLabel;
    if (o.tints) e.tints = o.tints;
    if (o.panel) e.panel = o.panel;
    if (o.wall) Object.assign(e, { wall: true, nobox: true });
    if (o.wallW) e.wallW = o.wallW;
    if (o.venueOnly) e.venueOnly = true; // sadece oyunun mekânlarında (mağazada yok)
    return e;
  });
}
export { marketShelfV92 };
