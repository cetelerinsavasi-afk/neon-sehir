import * as THREE from 'three';
import { labelTexture } from './houseTextures';

// =============================================================================
// houseCatalogV146.js — v146.2 Karargah kategorisi
//   Çete karargahları için yeni mobilyalar: Strateji Masası, Operasyon Panosu,
//   Baba Koltuğu, Çete Sancağı, Güvenlik Ekranları, Kum Torbası Barikatı,
//   Telsiz İstasyonu, Para Sayma Masası, Viski Arabası, KARARGAH neonu.
//   (Konuşma Kürsüsü + Meclis Toplantı Masası da bu kategoriye taşındı ve
//   satılır oldu — houseCatalog.js KARARGAH_MOVE.)
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
const Co = (g, r, h, c, x = 0, y = 0, z = 0, o, seg = 14) => add(g, new THREE.ConeGeometry(r, h, seg), mm(c, o), x, y + h / 2, z);
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
const tex = (key, w, h, fn) => labelTexture(`v146_${key}`, w, h, (x) => fn(x, w, h));
const rnd = (seed) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};
const GOLD = () => M('#c9a24a', 0.3, 0.85);
const DARKWOOD = () => M('#2e1a0c', 0.55, 0.05);

// =============================================================================
// DOKULAR
// =============================================================================
// Şehir haritası (strateji masası): bloklar, ana caddeler, nehir, bölge çizgileri
function mapTex() {
  return tex('map', 512, 320, (x, w, h) => {
    x.fillStyle = '#d9cfae';
    x.fillRect(0, 0, w, h);
    const r = rnd(29);
    x.fillStyle = '#c6b98f';
    for (let i = 0; i < 90; i++) x.fillRect(r() * w, r() * h, 18 + r() * 30, 12 + r() * 22);
    // nehir
    x.strokeStyle = '#5e8fb0';
    x.lineWidth = 18;
    x.beginPath();
    x.moveTo(-10, h * 0.7);
    x.bezierCurveTo(w * 0.3, h * 0.45, w * 0.55, h * 0.95, w + 10, h * 0.6);
    x.stroke();
    // caddeler
    x.strokeStyle = '#f4efe0';
    x.lineWidth = 6;
    for (let i = 1; i < 6; i++) {
      x.beginPath();
      x.moveTo((w * i) / 6, 0);
      x.lineTo((w * i) / 6 + 20, h);
      x.stroke();
    }
    for (let i = 1; i < 4; i++) {
      x.beginPath();
      x.moveTo(0, (h * i) / 4);
      x.lineTo(w, (h * i) / 4 - 14);
      x.stroke();
    }
    // bölgeler (kesikli kırmızı / mavi)
    x.setLineDash([10, 8]);
    x.lineWidth = 4;
    x.strokeStyle = '#b3202a';
    x.strokeRect(40, 30, 170, 120);
    x.strokeStyle = '#1f4f9a';
    x.strokeRect(300, 150, 170, 130);
    x.setLineDash([]);
    // hedef işaretleri
    x.strokeStyle = '#b3202a';
    x.lineWidth = 5;
    for (const [cx, cy] of [[120, 90], [380, 210], [260, 70]]) {
      x.beginPath();
      x.arc(cx, cy, 14, 0, Math.PI * 2);
      x.stroke();
      x.beginPath();
      x.moveTo(cx - 20, cy);
      x.lineTo(cx + 20, cy);
      x.moveTo(cx, cy - 20);
      x.lineTo(cx, cy + 20);
      x.stroke();
    }
    x.strokeStyle = 'rgba(60,40,20,0.6)';
    x.lineWidth = 10;
    x.strokeRect(5, 5, w - 10, h - 10);
  });
}
// Operasyon panosu: mantar zemin, fotoğraflar, notlar, kırmızı ipler
function boardTex() {
  return tex('board', 512, 320, (x, w, h) => {
    x.fillStyle = '#b08455';
    x.fillRect(0, 0, w, h);
    const r = rnd(41);
    for (let i = 0; i < 2500; i++) {
      x.fillStyle = `rgba(${90 + r() * 60},${60 + r() * 40},${30 + r() * 20},0.35)`;
      x.fillRect(r() * w, r() * h, 2, 2);
    }
    const pins = [];
    const photo = (px, py, rot, sky) => {
      x.save();
      x.translate(px, py);
      x.rotate(rot);
      x.fillStyle = '#f6f3ea';
      x.fillRect(-36, -42, 72, 84);
      x.fillStyle = sky;
      x.fillRect(-30, -36, 60, 54);
      // siluet
      x.fillStyle = '#1b1b1f';
      x.beginPath();
      x.arc(0, -16, 11, 0, Math.PI * 2);
      x.fill();
      x.fillRect(-16, -4, 32, 22);
      x.fillStyle = '#333';
      x.font = 'bold 11px sans-serif';
      x.textAlign = 'center';
      x.fillText('???', 0, 34);
      x.restore();
      pins.push([px, py - 38]);
    };
    photo(80, 80, -0.08, '#8aa6b8');
    photo(250, 70, 0.05, '#b8a28a');
    photo(420, 95, -0.04, '#9bb88a');
    photo(150, 230, 0.07, '#b88a9a');
    photo(360, 240, -0.06, '#8a96b8');
    // notlar
    const notes = [[250, 190, '#f7e36b', 'DEPO'], [470, 230, '#8fe0f0', 'LİMAN'], [40, 200, '#f7a6c9', '02:00']];
    for (const [nx, ny, c, t] of notes) {
      x.fillStyle = c;
      x.fillRect(nx - 28, ny - 22, 56, 44);
      x.fillStyle = '#222';
      x.font = 'bold 14px sans-serif';
      x.textAlign = 'center';
      x.fillText(t, nx, ny + 5);
      pins.push([nx, ny - 20]);
    }
    // kırmızı ipler
    x.strokeStyle = '#d0202a';
    x.lineWidth = 2.5;
    const link = [[0, 1], [1, 2], [0, 3], [3, 4], [1, 5], [4, 6], [2, 6], [3, 7]];
    for (const [a, b] of link) {
      x.beginPath();
      x.moveTo(pins[a][0], pins[a][1]);
      x.lineTo(pins[b][0], pins[b][1]);
      x.stroke();
    }
    for (const [px, py] of pins) {
      x.fillStyle = '#e02030';
      x.beginPath();
      x.arc(px, py, 5, 0, Math.PI * 2);
      x.fill();
    }
  });
}
// Sancak: siyah zemin, kırmızı şerit, ortada çapraz kılıçlar + yıldız
function bannerTex() {
  return tex('banner', 256, 384, (x, w, h) => {
    x.fillStyle = '#121216';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#b3121f';
    x.fillRect(0, 0, w, 28);
    x.fillRect(0, h - 40, w, 12);
    // alt kırlangıç kuyruk (saydam)
    x.clearRect(0, h - 26, w, 26);
    x.fillStyle = '#121216';
    x.beginPath();
    x.moveTo(0, h - 26);
    x.lineTo(w / 2, h - 2);
    x.lineTo(w, h - 26);
    x.fill();
    x.save();
    x.translate(w / 2, h * 0.47);
    x.strokeStyle = '#d8b04a';
    x.lineWidth = 12;
    x.lineCap = 'round';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(s * -70, -80);
      x.lineTo(s * 70, 80);
      x.stroke();
      x.beginPath();
      x.moveTo(s * -40, 50);
      x.lineTo(s * -80, 10);
      x.stroke();
    }
    x.fillStyle = '#e2202e';
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 18 : 44;
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.fill();
    x.restore();
  });
}
// Güvenlik kamerası görüntüsü (her ekran ayrı oda)
function camTex(i) {
  return tex(`cam${i}`, 256, 160, (x, w, h) => {
    const r = rnd(97 + i * 13);
    const base = ['#30403a', '#3a3a44', '#40382e', '#2e3a44', '#3a3030', '#33402e'][i % 6];
    x.fillStyle = base;
    x.fillRect(0, 0, w, h);
    // perspektif koridor / oda
    x.strokeStyle = 'rgba(200,230,210,0.35)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, h);
    x.lineTo(w * 0.35, h * 0.45);
    x.lineTo(w * 0.65, h * 0.45);
    x.lineTo(w, h);
    x.moveTo(w * 0.35, h * 0.45);
    x.lineTo(w * 0.35, 0);
    x.moveTo(w * 0.65, h * 0.45);
    x.lineTo(w * 0.65, 0);
    x.stroke();
    for (let k = 0; k < 3; k++) {
      x.fillStyle = 'rgba(20,24,22,0.7)';
      x.fillRect(r() * w * 0.8, h * 0.45 + r() * h * 0.4, 30 + r() * 30, 16 + r() * 20);
    }
    if (i % 2 === 0) {
      x.fillStyle = 'rgba(10,12,12,0.85)';
      x.beginPath();
      x.arc(w * (0.4 + r() * 0.2), h * 0.55, 7, 0, Math.PI * 2);
      x.fill();
      x.fillRect(w * 0.47, h * 0.6, 12, 26);
    }
    for (let k = 0; k < 900; k++) {
      x.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
      x.fillRect(r() * w, r() * h, 1, 1);
    }
    for (let yy = 0; yy < h; yy += 3) {
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(0, yy, w, 1);
    }
    x.fillStyle = '#e8f5e8';
    x.font = 'bold 13px monospace';
    x.fillText(`CAM ${i + 1}`, 8, 18);
    x.fillStyle = '#ff3b3b';
    x.beginPath();
    x.arc(w - 14, 13, 5, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#e8f5e8';
    x.fillText('REC', w - 54, 18);
  });
}
// Banknot üstü (para destesi)
function cashTex() {
  return tex('cash', 128, 64, (x, w, h) => {
    x.fillStyle = '#7fae7a';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#3e6b3e';
    x.lineWidth = 3;
    x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#4c7f4c';
    x.beginPath();
    x.arc(w / 2, h / 2, 16, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#e9f2e0';
    x.font = 'bold 16px serif';
    x.textAlign = 'center';
    x.fillText('₺', w / 2, h / 2 + 6);
    x.fillStyle = '#2d522d';
    x.font = 'bold 12px serif';
    x.fillText('200', 18, 18);
    x.fillText('200', w - 18, h - 10);
    // banderol
    x.fillStyle = '#f2e6c4';
    x.fillRect(w / 2 - 34, 0, 10, h);
  });
}

// =============================================================================
// EŞYALAR
// =============================================================================
const OUT = [];
function I(k, cat, name, icon, build, opts = {}) {
  OUT.push({ k, cat, name, icon, build, ...opts });
}

// ── STRATEJİ MASASI: haritalı masa, piyonlar, kırmızı/ mavi işaretler, eğik masa lambası
I('stratejimasa', 'karargah', 'Strateji Masası', '🗺️', (g) => {
  const W = 2.0;
  const D = 1.2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.12, 0.74, 0.12, DARKWOOD(), sx * (W / 2 - 0.12), 0, sz * (D / 2 - 0.12));
  B(g, W - 0.1, 0.12, D - 0.1, DARKWOOD(), 0, 0.62, 0);
  B(g, W, 0.06, D, M('#4a2a14', 0.45), 0, 0.74, 0);
  const map = Pl(g, W - 0.16, D - 0.16, K('#ffffff', { map: mapTex(), r: 0.8 }), 0, 0.802, 0);
  map.rotation.x = -PI / 2;
  // masa kenarı pirinç şerit
  for (const s of [-1, 1]) {
    B(g, W, 0.02, 0.02, GOLD(), 0, 0.8, s * (D / 2 - 0.01));
    B(g, 0.02, 0.02, D, GOLD(), s * (W / 2 - 0.01), 0.8, 0);
  }
  // piyonlar (kırmızı ve mavi)
  const r = rnd(5);
  for (let i = 0; i < 10; i++) {
    const red = i < 5;
    const x0 = (red ? -0.55 : 0.4) + (r() - 0.5) * 0.5;
    const z0 = (red ? -0.25 : 0.2) + (r() - 0.5) * 0.4;
    const c = red ? '#c0202a' : '#2257b5';
    Cy(g, 0.025, 0.05, c, x0, 0.805, z0, { r: 0.4 }, 10, 0.016);
    Sp(g, 0.018, c, x0, 0.87, z0, { r: 0.4 }, 10);
  }
  // pusula + cetvel
  Cy(g, 0.06, 0.012, GOLD(), 0.75, 0.805, -0.4, null, 18);
  B(g, 0.5, 0.006, 0.04, M('#e8e2d0', 0.6), -0.2, 0.805, 0.42);
  // eğik masa lambası (köşede)
  const l = sub(g, -W / 2 + 0.15, 0.8, -D / 2 + 0.15);
  Cy(l, 0.08, 0.03, M('#1c1d22', 0.4, 0.6), 0, 0, 0, null, 14);
  const arm = Cy(l, 0.012, 0.6, M('#1c1d22', 0.4, 0.6), 0.08, 0.03, 0.08, null, 6);
  arm.rotation.z = -0.5;
  arm.rotation.x = 0.5;
  const shade = Co(l, 0.11, 0.14, M('#1f5f3a', 0.4, 0.3), 0.32, 0.55, 0.32, null, 14);
  shade.rotation.x = -0.6;
  shade.rotation.z = 0.6;
  Sp(l, 0.035, K('#fff3cf', { e: '#ffe7a0', ei: 2 }), 0.34, 0.5, 0.34, null, 8);
  return { light: { x: -W / 2 + 0.5, y: 1.2, z: -D / 2 + 0.5, color: '#ffe7b0', intensity: 0.7, distance: 3 }, on: true, setOn() {}, noToggle: true };
}, { box: [1.0, 0.6] });

// ── OPERASYON PANOSU (duvar): mantar pano, fotoğraflar, kırmızı ipler
I('opspano', 'karargah', 'Operasyon Panosu', '📌', (g) => {
  const W = 1.8;
  const H = 1.12;
  const y0 = 1.0;
  B(g, W + 0.1, H + 0.1, 0.05, DARKWOOD(), 0, y0 - 0.05, 0.025);
  Pl(g, W, H, K('#ffffff', { map: boardTex(), r: 0.9 }), 0, y0 + H / 2, 0.052);
  // alt lamba (resim lambası gibi, üstte)
  B(g, 0.9, 0.05, 0.08, GOLD(), 0, y0 + H + 0.12, 0.16);
  B(g, 0.03, 0.03, 0.14, GOLD(), 0, y0 + H + 0.12, 0.08);
}, { wall: true, wallW: 0.95, nobox: true });

// ── BABA KOLTUĞU: yüksek sırtlı, kapitone deri, altın çivi, aslan pençesi ayak
I('babakoltuk', 'karargah', 'Baba Koltuğu', '👑', (g) => {
  const leather = M('#5a1018', 0.38, 0.08);
  const dark = M('#3c0a10', 0.45, 0.05);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    Cy(g, 0.05, 0.14, GOLD(), sx * 0.38, 0, sz * 0.3, null, 10, 0.035);
    Sp(g, 0.05, GOLD(), sx * 0.38, 0.03, sz * 0.3 + 0.02, null, 10);
  }
  B(g, 0.92, 0.26, 0.8, dark, 0, 0.14, 0, { r: 0.45 });
  B(g, 0.66, 0.14, 0.66, leather, 0, 0.4, 0.05);
  // yüksek sırt (taç gibi tepe)
  B(g, 0.92, 1.25, 0.2, leather, 0, 0.4, -0.32);
  B(g, 0.6, 0.18, 0.2, leather, 0, 1.65, -0.32);
  Sp(g, 0.07, GOLD(), 0, 1.86, -0.32, null, 12);
  for (const s of [-1, 1]) Sp(g, 0.05, GOLD(), s * 0.42, 1.68, -0.32, null, 10);
  // kapitone düğmeler
  for (let row = 0; row < 4; row++) for (let col = -1; col <= 1; col++) Sp(g, 0.02, dark, col * 0.24 + (row % 2) * 0.12 - (row % 2 && col === 1 ? 0.48 : 0), 0.65 + row * 0.25, -0.215, null, 8);
  // kolçaklar
  for (const s of [-1, 1]) {
    B(g, 0.16, 0.3, 0.72, leather, s * 0.42, 0.4, 0.02);
    CyX(g, 0.09, 0.18, leather, s * 0.42, 0.72, 0.02);
    for (let i = 0; i < 5; i++) Sp(g, 0.014, GOLD(), s * 0.51, 0.5, -0.25 + i * 0.13, null, 6);
  }
}, { box: [0.48, 0.42], seats: [[0, 0.54, 0.05]], seatLabel: '👑 Baba koltuğuna otur' });

// ── ÇETE SANCAĞI: direkli, çapraz kılıç + yıldız, rüzgârda hafif dalgalanır
I('sancak', 'karargah', 'Çete Sancağı', '🚩', (g) => {
  Cy(g, 0.22, 0.06, M('#1c1d22', 0.4, 0.6), 0, 0, 0, null, 18);
  Cy(g, 0.12, 0.08, GOLD(), 0, 0.06, 0, null, 14, 0.06);
  Cy(g, 0.025, 2.5, M('#2a1a0e', 0.5), 0, 0.12, 0, null, 10);
  Co(g, 0.05, 0.16, GOLD(), 0, 2.62, 0, null, 10);
  CyX(g, 0.015, 0.95, GOLD(), 0, 2.48, 0.03, null, 8);
  for (const s of [-1, 1]) Sp(g, 0.03, GOLD(), s * 0.48, 2.48, 0.03, null, 8);
  const flag = sub(g, 0, 2.47, 0.04);
  const m = K('#ffffff', { map: bannerTex(), side: true, r: 0.8 });
  m.transparent = true;
  m.alphaTest = 0.5;
  const pl = Pl(flag, 0.9, 1.35, m, 0, -0.675, 0);
  pl.castShadow = true;
  return {
    tick(t) {
      flag.rotation.x = Math.sin(t * 1.3) * 0.04;
      flag.rotation.y = Math.sin(t * 0.9) * 0.08;
    },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { box: [0.22, 0.22] });

// ── GÜVENLİK EKRANLARI: 2×3 monitör duvarı, CCTV görüntüleri, titreşen ekran
I('guvenlikekran', 'karargah', 'Güvenlik Ekranları', '📹', (g) => {
  const frame = M('#1a1c22', 0.5, 0.5);
  for (const s of [-1, 1]) B(g, 0.06, 1.95, 0.3, frame, s * 0.72, 0, 0);
  B(g, 1.5, 0.75, 0.55, M('#24262e', 0.5, 0.3), 0, 0, 0.12);
  B(g, 1.56, 0.04, 0.6, M('#33363f', 0.4, 0.4), 0, 0.75, 0.12);
  // klavye + kumanda kolu
  B(g, 0.5, 0.02, 0.16, M('#111', 0.6), -0.2, 0.79, 0.25);
  Cy(g, 0.05, 0.03, M('#111', 0.6), 0.35, 0.79, 0.25, null, 10);
  Cy(g, 0.012, 0.12, M('#222', 0.5), 0.35, 0.82, 0.25, null, 6);
  Sp(g, 0.025, M('#c0202a', 0.4), 0.35, 0.95, 0.25, null, 8);
  const mats = [];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      const x = -0.47 + col * 0.47;
      const y = 1.05 + row * 0.42;
      B(g, 0.45, 0.32, 0.08, frame, x, y - 0.16, 0);
      const mt = K('#ffffff', { map: camTex(i), e: '#ffffff', ei: 0.75 });
      mats.push(mt);
      Pl(g, 0.41, 0.27, mt, x, y, 0.042);
    }
  return {
    tick(t) {
      for (let i = 0; i < mats.length; i++) mats[i].emissiveIntensity = 0.7 + Math.sin(t * 9 + i * 1.7) * 0.04 + (Math.sin(t * 0.7 + i) > 0.97 ? -0.3 : 0);
    },
    light: { x: 0, y: 1.3, z: 0.5, color: '#bfe8ff', intensity: 0.45, distance: 2.5 },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { box: [0.76, 0.4] });

// ── KUM TORBASI BARİKATI: üç sıra, yumuşak çuvallar
I('kumtorbasi', 'karargah', 'Kum Torbası Barikatı', '🧱', (g) => {
  // yassı çuvallar, tuğla gibi şaşırtmalı üç sıra
  const cols = ['#b9a27a', '#a8916a', '#c2ad86', '#b09a70'];
  const r = rnd(17);
  const geo = new THREE.CapsuleGeometry(0.12, 0.2, 4, 10);
  const rows = [[4, 0, 0], [4, 0.13, 0.22], [3, 0.26, 0.44]];
  rows.forEach(([n, shift, y], ri) => {
    for (let i = 0; i < n; i++) {
      const me = new THREE.Mesh(geo, M(cols[(i + ri) % cols.length], 0.95));
      me.position.set(-0.66 + shift + i * 0.44 + (ri === 2 ? 0.09 : 0) + (r() - 0.5) * 0.03, y + 0.08, (r() - 0.5) * 0.03);
      me.rotation.z = PI / 2 + (r() - 0.5) * 0.08;
      me.rotation.y = (r() - 0.5) * 0.12;
      me.scale.set(0.62, 1, 1.75);
      me.castShadow = true;
      me.receiveShadow = true;
      g.add(me);
    }
  });
}, { box: [0.9, 0.26] });

// ── TELSİZ İSTASYONU: masa, telsiz cihazları, anten, yanıp sönen ışıklar, kulaklık
I('telsiz', 'karargah', 'Telsiz İstasyonu', '📻', (g) => {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.05, 0.74, 0.05, M('#3a3d44', 0.4, 0.7), sx * 0.55, 0, sz * 0.28);
  B(g, 1.2, 0.05, 0.66, M('#4a4f3a', 0.6, 0.2), 0, 0.74, 0);
  const box = M('#2f3326', 0.6, 0.3);
  B(g, 0.6, 0.32, 0.36, box, -0.2, 0.79, -0.1);
  B(g, 0.5, 0.18, 0.3, box, 0.32, 0.79, -0.12);
  // kadranlar
  Pl(g, 0.3, 0.1, K('#1a2a10', { e: '#9cff6a', ei: 0.9 }), -0.28, 1.0, 0.082);
  for (let i = 0; i < 4; i++) {
    const kn = Cy(g, 0.025, 0.03, M('#111', 0.5), -0.42 + i * 0.1, 0.86, 0.08, null, 10);
    kn.rotation.x = PI / 2;
  }
  const leds = [];
  for (let i = 0; i < 4; i++) {
    const m = K('#ff3b3b', { e: i % 2 ? '#ffb020' : '#ff2a2a', ei: 1.5 });
    leds.push(m);
    Sp(g, 0.012, m, 0.16 + i * 0.07, 0.92, 0.031, null, 6);
  }
  // anten
  Cy(g, 0.006, 0.9, M('#999', 0.3, 0.8), 0.5, 0.97, -0.22, null, 6);
  Sp(g, 0.015, M('#c0202a', 0.4), 0.5, 1.88, -0.22, null, 6);
  // el telsizi + kulaklık
  B(g, 0.06, 0.18, 0.04, M('#16181c', 0.5), 0.45, 0.79, 0.2);
  Cy(g, 0.004, 0.12, M('#16181c', 0.5), 0.47, 0.97, 0.2, null, 6);
  const hp = To(g, 0.09, 0.012, M('#16181c', 0.5), -0.05, 0.84, 0.18);
  hp.rotation.x = PI / 2 - 0.2;
  for (const s of [-1, 1]) Cy(g, 0.035, 0.03, M('#16181c', 0.5), -0.05 + s * 0.09, 0.8, 0.18, null, 10);
  // mikrofon
  Cy(g, 0.04, 0.02, M('#16181c', 0.5), -0.4, 0.79, 0.18, null, 10);
  Cy(g, 0.008, 0.18, M('#666', 0.4, 0.6), -0.4, 0.81, 0.18, null, 6);
  Sp(g, 0.03, M('#2a2a2a', 0.6), -0.4, 1.01, 0.18, null, 8);
  return {
    tick(t) {
      for (let i = 0; i < leds.length; i++) leds[i].emissiveIntensity = Math.sin(t * (3 + i) + i) > 0 ? 1.8 : 0.15;
    },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { box: [0.6, 0.33] });

// ── PARA SAYMA MASASI: deste deste para, sayma makinesi (banknot döner), lastik bantlar
I('parasayma', 'karargah', 'Para Sayma Masası', '💵', (g) => {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.06, 0.74, 0.06, M('#202227', 0.4, 0.7), sx * 0.62, 0, sz * 0.32);
  B(g, 1.36, 0.04, 0.76, M('#e6e2d8', 0.5), 0, 0.74, 0);
  const cashTop = K('#ffffff', { map: cashTex(), r: 0.8 });
  const cashSide = M('#8db487', 0.85);
  const stack = (x, z, n, ry = 0) => {
    for (let i = 0; i < n; i++) {
      const s = sub(g, x + (i % 2) * 0.005, 0.78 + i * 0.04, z, ry + (i % 3) * 0.04);
      B(s, 0.16, 0.04, 0.08, cashSide, 0, 0, 0);
      const p = Pl(s, 0.16, 0.08, cashTop, 0, 0.041, 0);
      p.rotation.x = -PI / 2;
    }
  };
  stack(-0.5, -0.2, 6);
  stack(-0.3, -0.2, 4, 0.1);
  stack(-0.5, 0.05, 3);
  stack(-0.3, 0.08, 5, -0.08);
  stack(-0.1, -0.22, 2);
  // gevşek banknotlar
  for (let i = 0; i < 5; i++) {
    const p = Pl(g, 0.16, 0.08, cashTop, 0.05 + i * 0.05, 0.763 + i * 0.001, 0.2 - i * 0.02);
    p.rotation.x = -PI / 2;
    p.rotation.z = i * 0.4;
  }
  // sayma makinesi
  const mc = sub(g, 0.4, 0.78, -0.08);
  B(mc, 0.32, 0.2, 0.28, M('#30343c', 0.4, 0.5), 0, 0, 0);
  B(mc, 0.2, 0.04, 0.12, M('#1a1c20', 0.5), 0, 0.2, -0.04);
  Pl(mc, 0.12, 0.05, K('#0a1a10', { e: '#3dff8a', ei: 1.2 }), -0.06, 0.13, 0.141);
  const flip = sub(mc, 0, 0.24, -0.04);
  const bills = [];
  for (let i = 0; i < 6; i++) {
    const p = Pl(flip, 0.16, 0.08, cashTop, 0, 0, 0);
    p.material = cashTop;
    bills.push(p);
  }
  // kâğıt bant (lastik)
  for (const z of [-0.2, 0.05]) To(g, 0.04, 0.006, M('#c9a24a', 0.5), -0.5, 0.86, z);
  // altın el lambası (yeşil abajur)
  Cy(g, 0.06, 0.02, GOLD(), 0.55, 0.78, 0.25, null, 12);
  Cy(g, 0.01, 0.3, GOLD(), 0.55, 0.8, 0.25, null, 6);
  const sh = Cy(g, 0.12, 0.08, M('#1f6b3a', 0.35, 0.2), 0.55, 1.08, 0.2, null, 14, 0.08);
  sh.rotation.x = 0.3;
  return {
    tick(t) {
      for (let i = 0; i < bills.length; i++) {
        const a = ((t * 2.5 + i / bills.length) % 1) * PI;
        bills[i].rotation.x = -a;
        bills[i].position.y = 0.02 + Math.sin(a) * 0.03;
      }
    },
    light: { x: 0.5, y: 1.2, z: 0.2, color: '#fff0c0', intensity: 0.5, distance: 2 },
    on: true,
    setOn() {},
    noToggle: true,
  };
}, { box: [0.68, 0.38] });

// ── VİSKİ ARABASI: pirinç servis arabası, şişeler, sürahi, kadehler
I('viskiaraba', 'karargah', 'Viski Arabası', '🥃', (g) => {
  const brass = GOLD();
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) Cy(g, 0.012, 0.85, brass, sx * 0.36, 0.06, sz * 0.2, null, 8);
  for (const sx of [-1, 1]) {
    const w = CyX(g, 0.06, 0.03, M('#151515', 0.6), sx * 0.36, 0.06, 0.2, null, 14);
    w.rotation.y = PI / 2;
  }
  const glass = K('#d8f0ff', { op: 0.35, r: 0.05 });
  B(g, 0.76, 0.015, 0.44, glass, 0, 0.3, 0);
  B(g, 0.76, 0.015, 0.44, glass, 0, 0.78, 0);
  CyX(g, 0.012, 0.74, brass, 0, 0.86, -0.22, null, 8);
  // şişeler
  const amber = K('#9a5a1a', { op: 0.85, r: 0.1 });
  const bottles = [[-0.25, -0.08, 0.3], [-0.12, -0.1, 0.26], [0.02, -0.1, 0.32]];
  for (const [x, z, h] of bottles) {
    Cy(g, 0.045, h, amber, x, 0.795, z, null, 12);
    Cy(g, 0.016, 0.08, amber, x, 0.795 + h, z, null, 8);
    Cy(g, 0.02, 0.025, M('#1a1a1a', 0.5), x, 0.875 + h, z, null, 8);
    Pl(g, 0.06, 0.07, M('#efe6cf', 0.8), x, 0.795 + h * 0.45, z + 0.046);
  }
  // sürahi + kadehler
  Sp(g, 0.07, amber, 0.22, 0.88, -0.06, null, 14);
  Cy(g, 0.022, 0.08, glass, 0.22, 0.93, -0.06, null, 10);
  Sp(g, 0.03, glass, 0.22, 1.03, -0.06, null, 10);
  for (let i = 0; i < 3; i++) {
    Cy(g, 0.032, 0.07, glass, 0.12 + i * 0.09, 0.795, 0.12, null, 10);
    Cy(g, 0.026, 0.025, amber, 0.12 + i * 0.09, 0.8, 0.12, null, 10);
  }
  // alt raf: buz kovası + şişe yatırılmış
  Cy(g, 0.08, 0.14, M('#c9ced6', 0.25, 0.9), -0.15, 0.315, 0, null, 14, 0.09);
  for (let i = 0; i < 2; i++) {
    const b = CyX(g, 0.045, 0.3, M('#2f5a2a', 0.2, 0.1), 0.15, 0.36 + i * 0.09, -0.05 + i * 0.03, null, 12);
    b.rotation.y = PI / 2;
  }
}, { box: [0.42, 0.26] });

export function v146CatalogEntries({ neonBuild }) {
  const out = OUT.map((d) => ({ ...d }));
  out.push({ k: 'neon_karargah', name: 'KARARGAH Neon', cat: 'karargah', icon: '🟥', tints: 'neon', build: neonBuild('KARARGAH', 'bold 104px sans-serif'), wall: true, nobox: true });
  return out;
}

export const V146_CATEGORIES = [{ key: 'karargah', name: 'Karargah', icon: '🏴' }];
// mevcut mekân eşyaları da Karargah'ta satılır olur
export const KARARGAH_MOVE = { kursu: 1, toplantimasa: 1 };
