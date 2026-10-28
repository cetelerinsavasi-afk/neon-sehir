import * as THREE from 'three';
import { labelTexture } from './houseTextures';

// =============================================================================
// houseCatalogV135.js — v135 yeni mobilyalar
//   • Stüdyo › Haber Stüdyosu (tek parça: kavisli LED fon + yarım ay masa +
//     gömme ekranlar + mikrofon + tek kişilik sunucu koltuğu). Ofis mobilyası:
//     oturunca "🎙️ Röportaj yap".
//   • Resim Atölyesi: Tuval (renk seçeneği = tuvaldeki desen; ofis mobilyası,
//     yaklaşınca "🎨 Resim çiz"), boya masası, tabure, malzeme rafı, boyalı örtü,
//     kil büst, boya kovaları, atölye lambası.
//   • Liman & Depo: konteyner (renkli), konteyner tırı, liman vinci, forklift,
//     palet yığını, halat babası, liman projektörü (+ Gazino'dan taşınan patron
//     masası, kaçak kasalar, sallanan ampul — houseCatalog.js CAT_MOVE).
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
  if (o.side) p.side = o.side === 'back' ? THREE.BackSide : THREE.DoubleSide;
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
const Sp = (g, r, c, x = 0, y = 0, z = 0, o, seg = 16) => add(g, new THREE.SphereGeometry(r, seg, Math.max(8, (seg * 0.75) | 0)), mm(c, o), x, y, z);
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
function rod(g, a, b, r, c) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8), mm(c));
  me.position.copy(va).add(vb).multiplyScalar(0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  me.castShadow = true;
  g.add(me);
  return me;
}
function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tex = (key, w, h, fn) => labelTexture(`v135_${key}`, w, h, (x) => fn(x, w, h));

// =============================================================================
// DOKULAR
// =============================================================================
// Haber stüdyosu LED fonu: lacivert → mavi, ışıklı dünya ağı, skyline, logo
function newsWallTex() {
  return tex('newswall', 2048, 768, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#040a24');
    gr.addColorStop(0.55, '#0b2a78');
    gr.addColorStop(1, '#06143e');
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
    // ışık hüzmeleri
    const r = rng('beams');
    for (let i = 0; i < 9; i++) {
      const cx = w * (0.08 + i * 0.105);
      const bg = x.createLinearGradient(cx, 0, cx, h);
      bg.addColorStop(0, 'rgba(120,190,255,0.16)');
      bg.addColorStop(1, 'rgba(120,190,255,0)');
      x.fillStyle = bg;
      x.beginPath();
      x.moveTo(cx - 14, 0);
      x.lineTo(cx + 14, 0);
      x.lineTo(cx + 90 + r() * 60, h);
      x.lineTo(cx - 90 - r() * 60, h);
      x.fill();
    }
    // ince ızgara
    x.strokeStyle = 'rgba(110,170,255,0.08)';
    x.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 48) {
      x.beginPath();
      x.moveTo(gx, 0);
      x.lineTo(gx, h);
      x.stroke();
    }
    for (let gy = 0; gy < h; gy += 48) {
      x.beginPath();
      x.moveTo(0, gy);
      x.lineTo(w, gy);
      x.stroke();
    }
    // şehir silueti
    x.fillStyle = 'rgba(4,10,36,0.85)';
    const r2 = rng('sky');
    for (let sx = 0; sx < w; sx += 34 + r2() * 30) {
      const bh = 60 + r2() * 170;
      const bw = 26 + r2() * 46;
      x.fillRect(sx, h - 120 - bh, bw, bh + 120);
      x.fillStyle = 'rgba(255,214,120,0.55)';
      for (let wy = h - 110 - bh; wy < h - 130; wy += 16) for (let wx = sx + 5; wx < sx + bw - 6; wx += 10) if (r2() < 0.35) x.fillRect(wx, wy, 4, 6);
      x.fillStyle = 'rgba(4,10,36,0.85)';
    }
    // dünya ağı (ortada)
    const gx = w / 2;
    const gy = h * 0.43;
    const R = h * 0.33;
    const glow = x.createRadialGradient(gx, gy, R * 0.2, gx, gy, R * 1.5);
    glow.addColorStop(0, 'rgba(70,150,255,0.45)');
    glow.addColorStop(1, 'rgba(70,150,255,0)');
    x.fillStyle = glow;
    x.fillRect(gx - R * 1.6, gy - R * 1.6, R * 3.2, R * 3.2);
    x.strokeStyle = 'rgba(150,205,255,0.55)';
    x.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      x.beginPath();
      x.ellipse(gx, gy, R, (R * i) / 8, 0, 0, PI * 2);
      x.stroke();
      x.beginPath();
      x.ellipse(gx, gy, (R * i) / 8, R, 0, 0, PI * 2);
      x.stroke();
    }
    x.lineWidth = 4;
    x.strokeStyle = 'rgba(190,225,255,0.85)';
    x.beginPath();
    x.arc(gx, gy, R, 0, PI * 2);
    x.stroke();
    // yan kırmızı kuşaklar
    x.fillStyle = 'rgba(224,38,54,0.92)';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(w * 0.13, 0);
    x.lineTo(w * 0.05, h);
    x.lineTo(0, h);
    x.fill();
    x.beginPath();
    x.moveTo(w, 0);
    x.lineTo(w * 0.87, 0);
    x.lineTo(w * 0.95, h);
    x.lineTo(w, h);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(w * 0.13 - 6, 0, 6, h);
    // logo
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = 'rgba(80,170,255,0.9)';
    x.shadowBlur = 40;
    x.fillStyle = '#ffffff';
    x.font = '900 170px "Arial Black", Arial, sans-serif';
    const tw = x.measureText('NEON HABER').width;
    const tx0 = gx - 100;
    x.fillText('NEON HABER', tx0, gy);
    x.shadowBlur = 0;
    // kırmızı "24" rozeti (yazının hemen sağında)
    const bx = tx0 + tw / 2 + 110;
    x.fillStyle = '#e02636';
    x.beginPath();
    x.roundRect(bx - 82, gy - 92, 164, 184, 22);
    x.fill();
    x.fillStyle = '#fff';
    x.font = '900 120px "Arial Black", Arial, sans-serif';
    x.fillText('24', bx, gy + 6);
    x.font = '600 46px Arial, sans-serif';
    x.fillStyle = 'rgba(220,235,255,0.92)';
    x.fillText('GÜNDEM  •  EKONOMİ  •  ŞEHİR  •  SPOR', gx, gy + 150);
  });
}
function tickerTex() {
  const t = tex('ticker', 1024, 64, (x, w, h) => {
    x.fillStyle = '#0a1230';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#e02636';
    x.fillRect(0, 0, 210, h);
    x.fillStyle = '#fff';
    x.font = '900 30px Arial, sans-serif';
    x.textBaseline = 'middle';
    x.fillText('SON DAKİKA', 18, h / 2 + 1);
    x.font = '600 28px Arial, sans-serif';
    x.fillText('Neon Şehir’de gündem yoğun  •  Borsa güne yükselişle başladı  •  Liman’da yeni konteyner rekoru', 228, h / 2 + 1);
  });
  return t;
}
function screenTex() {
  return tex('newsscreen', 256, 144, (x, w, h) => {
    x.fillStyle = '#16306e';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#e02636';
    x.fillRect(0, h * 0.74, w, h * 0.14);
    x.fillStyle = '#fff';
    x.font = 'bold 26px Arial';
    x.fillText('SON DAKİKA', 14, h * 0.5);
    x.font = 'bold 16px Arial';
    x.fillText('CANLI', 14, h * 0.84);
  });
}
// tuval desenleri (Tuval'in renk seçenekleri = üstündeki desen)
export const EASEL_ART = [
  ['Boş Tuval', '#f4f1ea', () => {}],
  ['Gün Batımı', '#f3a64b', (x, w, h) => {
    const s = x.createLinearGradient(0, 0, 0, h);
    s.addColorStop(0, '#f3794b');
    s.addColorStop(0.6, '#f7d58a');
    s.addColorStop(1, '#fbe9bd');
    x.fillStyle = s;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff3c9';
    x.beginPath();
    x.arc(w * 0.62, h * 0.52, h * 0.14, 0, PI * 2);
    x.fill();
    x.fillStyle = '#4a2f5e';
    x.beginPath();
    x.moveTo(w * 0.05, h * 0.72);
    x.lineTo(w * 0.42, h * 0.34);
    x.lineTo(w * 0.95, h * 0.72);
    x.fill();
    x.fillStyle = '#2f6f8f';
    x.fillRect(0, h * 0.72, w, h * 0.28);
  }],
  ['Kır Evi', '#6aa84f', (x, w, h) => {
    x.fillStyle = '#8cc3e8';
    x.fillRect(0, 0, w, h * 0.5);
    x.fillStyle = '#6aa84f';
    x.fillRect(0, h * 0.5, w, h * 0.5);
    x.fillStyle = '#4f8a35';
    x.beginPath();
    x.arc(w * 0.27, h * 0.55, h * 0.2, 0, PI * 2);
    x.fill();
    x.fillStyle = '#7a4a2a';
    x.fillRect(w * 0.25, h * 0.6, w * 0.04, h * 0.18);
    x.fillStyle = '#f2e6cf';
    x.fillRect(w * 0.58, h * 0.47, w * 0.3, h * 0.25);
    x.fillStyle = '#b8323a';
    x.beginPath();
    x.moveTo(w * 0.54, h * 0.48);
    x.lineTo(w * 0.73, h * 0.28);
    x.lineTo(w * 0.92, h * 0.48);
    x.fill();
    x.fillStyle = '#5a3a24';
    x.fillRect(w * 0.7, h * 0.58, w * 0.06, h * 0.14);
  }],
  ['Renkli Daireler', '#1d4f91', (x, w, h) => {
    x.fillStyle = '#e9dfcf';
    x.fillRect(0, 0, w, h);
    [['#d6262f', 0.32, 0.32, 0.26], ['#1d4f91', 0.62, 0.42, 0.22], ['#e8b923', 0.42, 0.7, 0.2], ['#2f8f4f', 0.72, 0.74, 0.12]].forEach(([c, a, b, r]) => {
      x.globalAlpha = 0.9;
      x.fillStyle = c;
      x.beginPath();
      x.arc(w * a, h * b, w * r, 0, PI * 2);
      x.fill();
    });
    x.globalAlpha = 1;
  }],
  ['Deniz', '#1f6fb8', (x, w, h) => {
    const s = x.createLinearGradient(0, 0, 0, h);
    s.addColorStop(0, '#9fd3f2');
    s.addColorStop(0.45, '#d9f0fb');
    s.addColorStop(0.46, '#2a7fc0');
    s.addColorStop(1, '#0f3f74');
    x.fillStyle = s;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.7)';
    x.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      const y = h * (0.55 + i * 0.07);
      for (let a = 0; a <= w; a += 8) x.lineTo(a, y + Math.sin(a / 14 + i) * 3);
      x.stroke();
    }
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(w * 0.6, h * 0.44);
    x.lineTo(w * 0.66, h * 0.2);
    x.lineTo(w * 0.66, h * 0.44);
    x.fill();
    x.fillStyle = '#7a4a2a';
    x.fillRect(w * 0.55, h * 0.44, w * 0.16, h * 0.04);
  }],
  ['Gece Şehri', '#3a2a8a', (x, w, h) => {
    const s = x.createLinearGradient(0, 0, 0, h);
    s.addColorStop(0, '#120a35');
    s.addColorStop(1, '#3a2a8a');
    x.fillStyle = s;
    x.fillRect(0, 0, w, h);
    const r = rng('night');
    for (let i = 0; i < 40; i++) {
      x.fillStyle = 'rgba(255,255,255,0.8)';
      x.fillRect(r() * w, r() * h * 0.5, 2, 2);
    }
    x.fillStyle = '#ffe9a8';
    x.beginPath();
    x.arc(w * 0.78, h * 0.2, h * 0.08, 0, PI * 2);
    x.fill();
    for (let sx = 0; sx < w; sx += 24 + r() * 20) {
      const bh = h * (0.2 + r() * 0.35);
      x.fillStyle = '#0a0620';
      x.fillRect(sx, h - bh, 22, bh);
      x.fillStyle = r() < 0.5 ? '#ff2e88' : '#19e8ff';
      for (let wy = h - bh + 6; wy < h - 6; wy += 12) if (r() < 0.5) x.fillRect(sx + 6, wy, 4, 5);
    }
  }],
  ['Soyut', '#ff2d8a', (x, w, h) => {
    x.fillStyle = '#fbf7ef';
    x.fillRect(0, 0, w, h);
    const r = rng('abs');
    const cols = ['#ff2d8a', '#1d4f91', '#e8b923', '#111', '#2f8f4f'];
    for (let i = 0; i < 9; i++) {
      x.strokeStyle = cols[i % cols.length];
      x.lineWidth = 6 + r() * 14;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(r() * w, r() * h);
      x.bezierCurveTo(r() * w, r() * h, r() * w, r() * h, r() * w, r() * h);
      x.stroke();
    }
  }],
  ['Portre Eskizi', '#999999', (x, w, h) => {
    x.fillStyle = '#f6f1e6';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#6b6258';
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(w / 2, h * 0.38, w * 0.18, h * 0.2, 0, 0, PI * 2);
    x.stroke();
    x.beginPath();
    x.moveTo(w * 0.2, h);
    x.quadraticCurveTo(w / 2, h * 0.55, w * 0.8, h);
    x.stroke();
    x.beginPath();
    x.moveTo(w * 0.43, h * 0.36);
    x.lineTo(w * 0.46, h * 0.36);
    x.moveTo(w * 0.54, h * 0.36);
    x.lineTo(w * 0.57, h * 0.36);
    x.moveTo(w * 0.47, h * 0.47);
    x.quadraticCurveTo(w / 2, h * 0.5, w * 0.53, h * 0.47);
    x.stroke();
  }],
];
function easelArtTex(i) {
  const [, , fn] = EASEL_ART[i] || EASEL_ART[0];
  return tex(`easel_${i}`, 256, 256, (x, w, h) => {
    x.fillStyle = '#f4f1ea';
    x.fillRect(0, 0, w, h);
    fn(x, w, h);
  });
}
function splatTex() {
  return tex('splat', 512, 320, (x, w, h) => {
    x.fillStyle = '#f6f3ec';
    x.fillRect(0, 0, w, h);
    const r = rng('splat');
    ['#d6262f', '#e8b923', '#1d4f91', '#2f8f4f', '#7a3fa0', '#e8742a'].forEach((c) => {
      for (let i = 0; i < 16; i++) {
        x.fillStyle = c;
        x.beginPath();
        x.arc(r() * w, r() * h, 3 + r() * 10, 0, PI * 2);
        x.fill();
      }
    });
    x.strokeStyle = 'rgba(0,0,0,0.08)';
    x.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      x.beginPath();
      x.moveTo(0, r() * h);
      x.lineTo(w, r() * h);
      x.stroke();
    }
  });
}
function ribTex() {
  return tex('rib', 256, 64, (x, w, h) => {
    for (let i = 0; i < 32; i++) {
      x.fillStyle = i % 2 ? '#cfcfcf' : '#ffffff';
      x.fillRect(i * 8, 0, 8, h);
    }
  });
}
function plateTex(text) {
  return tex(`plate_${text}`, 256, 64, (x, w, h) => {
    x.fillStyle = '#f4f4f4';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#1a3a8a';
    x.fillRect(0, 0, 34, h);
    x.fillStyle = '#111';
    x.font = 'bold 40px Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2 + 14, h / 2 + 2);
  });
}

// =============================================================================
// RENK SEÇENEKLERİ
// =============================================================================
export const V135_TINTS = {
  easelart: EASEL_ART.map(([n, c], i) => ({ n, c, i })),
  container: [
    { n: 'Kırmızı', c: '#c62a2f' }, { n: 'Lacivert', c: '#1d4f91' }, { n: 'Yeşil', c: '#2f8f4f' }, { n: 'Turuncu', c: '#e8742a' },
    { n: 'Sarı', c: '#e8b923' }, { n: 'Mor', c: '#7a3fa0' }, { n: 'Gri', c: '#8a8f98' }, { n: 'Turkuaz', c: '#1f9fa8' },
    { n: 'Beyaz', c: '#e8e6e0' }, { n: 'Siyah', c: '#22252b' },
  ],
  truck: [
    { n: 'Mavi · Kırmızı konteyner', c: '#1d4f91', s: '#c62a2f' }, { n: 'Kırmızı · Lacivert konteyner', c: '#b8141e', s: '#1d4f91' },
    { n: 'Beyaz · Yeşil konteyner', c: '#e8e6e0', s: '#2f8f4f' }, { n: 'Siyah · Turuncu konteyner', c: '#1a1a1c', s: '#e8742a' },
    { n: 'Sarı · Gri konteyner', c: '#e0a800', s: '#8a8f98' },
  ].map((t) => ({ ...t, sw: `linear-gradient(135deg, ${t.c} 50%, ${t.s} 50%)` })),
};

// =============================================================================
// EŞYALAR
// =============================================================================
const OUT = [];
function I(k, cat, name, icon, build, opts = {}) {
  OUT.push({ k, cat, name, icon, build, ...opts });
}

// ── Stüdyo › HABER STÜDYOSU (tek parça)
const NEWS_CHAIR_Z = -0.5;
function newsChair(g) {
  const ch = sub(g, 0, 0, NEWS_CHAIR_Z);
  const k = '#15181e';
  const c = M('#c4c9d2', 0.25, 0.9);
  Cy(ch, 0.035, 0.36, c, 0, 0.1, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i * PI * 2) / 5;
    const l = B(ch, 0.32, 0.035, 0.05, c, Math.sin(a) * 0.16, 0.06, Math.cos(a) * 0.16);
    l.rotation.y = a - PI / 2;
    Sp(ch, 0.035, k, Math.sin(a) * 0.31, 0.035, Math.cos(a) * 0.31);
  }
  B(ch, 0.54, 0.09, 0.52, k, 0, 0.44, 0, { r: 0.65 });
  const back = B(ch, 0.52, 0.66, 0.08, k, 0, 0.53, -0.25, { r: 0.65 });
  back.rotation.x = -0.08;
  B(ch, 0.3, 0.13, 0.07, k, 0, 1.22, -0.29, { r: 0.65 }).rotation.x = -0.08;
  [-1, 1].forEach((s) => {
    B(ch, 0.05, 0.05, 0.34, k, s * 0.3, 0.68, -0.02);
    B(ch, 0.035, 0.18, 0.035, c, s * 0.3, 0.52, 0.08);
  });
}
I('newsdesk', 'studyo', 'Haber Stüdyosu', '📺', (g) => {
  // zemin platformu (parlak)
  B(g, 3.7, 0.05, 2.7, K('#0b1226', { r: 0.15, m: 0.6 }), 0, 0, -0.35);
  B(g, 3.72, 0.012, 0.03, K('#38d1ff', { e: '#38d1ff', ei: 1.6 }), 0, 0.045, 1.0);
  // kavisli LED fon (iç yüz görünür)
  const wt = newsWallTex();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2.6, 48, 1, true, PI - 0.72, 1.44), K('#ffffff', { map: wt, e: '#ffffff', ei: 0.85, side: 'back' }));
  wall.position.set(0, 0.05 + 1.3, 0.9);
  wall.scale.x = -1; // doku ayna olmasın (iç yüzden bakılıyor)
  g.add(wall);
  // fon arkası (kasa) + kenar neonları
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(2.58, 2.58, 2.7, 48, 1, true, PI - 0.74, 1.48), K('#10131c', { side: 'double', r: 0.6 }));
  shell.position.set(0, 0.05 + 1.35, 0.9);
  shell.castShadow = true;
  g.add(shell);
  [[0.08, '#e02636'], [2.62, '#38d1ff']].forEach(([y, c]) => {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(2.47, 2.47, 0.05, 48, 1, true, PI - 0.72, 1.44), K(c, { e: c, ei: 1.8, side: 'back' }));
    n.position.set(0, 0.05 + y, 0.9);
    g.add(n);
  });
  // kayan haber bandı (fonun altında)
  const tk = tickerTex();
  const tmat = K('#ffffff', { map: tk, e: '#ffffff', ei: 0.9, side: 'back' });
  const ticker = new THREE.Mesh(new THREE.CylinderGeometry(2.46, 2.46, 0.22, 48, 1, true, PI - 0.6, 1.2), tmat);
  ticker.position.set(0, 0.05 + 2.3, 0.9);
  ticker.scale.x = -1;
  g.add(ticker);
  // yarım ay sunucu masası (sunucuya doğru açık)
  const a0 = PI / 2 - 0.95;
  const a1 = PI / 2 + 0.95;
  const sh = new THREE.Shape();
  sh.absarc(0, 0, 1.25, a0, a1, false);
  sh.absarc(0, 0, 0.66, a1, a0, true);
  sh.closePath();
  const ex = (d) => {
    const e = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 40 });
    e.rotateX(PI / 2);
    return e;
  };
  const deskG = sub(g, 0, 0, NEWS_CHAIR_Z);
  add(deskG, ex(0.7), M('#e9edf5', 0.3, 0.1), 0, 0.75, 0);
  add(deskG, ex(0.06), M('#1a2236', 0.15, 0.4), 0, 0.81, 0);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.255, 1.255, 0.04, 40, 1, true, -0.95, 1.9), K('#e02636', { e: '#e02636', ei: 1.2 }));
  stripe.position.set(0, 0.16, 0);
  deskG.add(stripe);
  const logo = Pl(deskG, 0.62, 0.3, K('#ffffff', { map: tex('desk24', 256, 128, (x, w, h) => {
    x.fillStyle = '#e02636';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    x.font = '900 52px "Arial Black", Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('NEON 24', w / 2, h / 2 + 2);
  }), e: '#ffffff', ei: 0.6 }), 0, 0.42, 1.258);
  logo.castShadow = false;
  // gömme ekranlar (sunucuya dönük)
  const scr = K('#ffffff', { map: screenTex(), e: '#ffffff', ei: 0.9 });
  [-0.5, 0.5].forEach((sx) => {
    const m = sub(deskG, sx, 0.81, 0.92, PI + sx * 0.6);
    B(m, 0.5, 0.3, 0.03, '#111317', 0, 0.06, 0);
    const p = Pl(m, 0.46, 0.26, scr, 0, 0.21, -0.017);
    p.rotation.y = PI;
  });
  // mikrofon, kâğıtlar, bardak
  Cy(deskG, 0.01, 0.26, '#111', 0.22, 0.81, 0.78);
  Sp(deskG, 0.035, '#111', 0.22, 1.08, 0.76);
  B(deskG, 0.24, 0.01, 0.17, '#ffffff', -0.2, 0.81, 0.8).rotation.y = 0.2;
  Cy(deskG, 0.035, 0.1, K('#cfe8ff', { op: 0.45 }), -0.7, 0.81, 0.58);
  newsChair(g);
  let t0 = 0;
  return {
    light: { x: 0, y: 2.2, z: 0.4, color: '#4a8cff', intensity: 1.3, distance: 5 },
    on: true,
    setOn() {},
    noToggle: true,
    tick(t) {
      // kayan haber bandı
      if (t - t0 > 0.05) {
        t0 = t;
        tk.offset.x = -((t * 0.04) % 1);
      }
    },
  };
}, {
  boxes: [[0, 0.4, 1.05, 0.36], [0, -1.55, 1.75, 0.18]],
  seats: [[0, 0.5, NEWS_CHAIR_Z]],
  seatLabel: '🪑 Sunucu koltuğuna otur',
});

// ── RESİM ATÖLYESİ
I('easel', 'resim', 'Tuval', '🎨', (g, ctx) => {
  const wd = M('#b98a52', 0.7);
  [-1, 1].forEach((s) => {
    const l = B(g, 0.045, 1.95, 0.045, wd, s * 0.36, 0, 0.12);
    l.rotation.z = s * 0.08;
    l.rotation.x = -0.08;
  });
  B(g, 0.045, 1.95, 0.045, wd, 0, 0, -0.26).rotation.x = 0.22;
  B(g, 0.92, 0.04, 0.12, wd, 0, 0.74, 0.16);
  B(g, 0.6, 0.04, 0.06, wd, 0, 1.78, 0.1);
  const w = 0.82;
  const h = 0.72;
  const cy = 0.78 + h / 2;
  B(g, w, h, 0.035, '#f4f1ea', 0, cy - h / 2, 0.14);
  const i = ctx.tint?.i ?? ctx.ti ?? 0;
  const art = Pl(g, w - 0.02, h - 0.02, K('#ffffff', { map: easelArtTex(i), r: 0.9 }), 0, cy, 0.159);
  art.castShadow = false;
  // fırça sehpası küçük kap
  Cy(g, 0.04, 0.08, '#d9d4c8', 0.32, 0.78, 0.2);
}, { box: [0.45, 0.3], tints: 'easelart' });
I('painttable', 'resim', 'Boya Masası', '🖌️', (g) => {
  const wd = M('#8a5a33', 0.6);
  B(g, 1.4, 0.06, 0.66, wd, 0, 0.76, 0);
  [[-0.64, -0.27], [0.64, -0.27], [-0.64, 0.27], [0.64, 0.27]].forEach(([a, b]) => B(g, 0.06, 0.76, 0.06, wd, a, 0, b));
  B(g, 1.3, 0.03, 0.56, wd, 0, 0.2, 0);
  const pal = Cy(g, 0.2, 0.015, '#d9b98a', -0.32, 0.82, 0.05, null, 28);
  pal.scale.z = 0.65;
  ['#d6262f', '#e8b923', '#1d4f91', '#2f8f4f', '#ffffff'].forEach((c, k) => Sp(g, 0.032, c, -0.48 + k * 0.075, 0.84, 0.02 + (k % 2) * 0.06, null, 10));
  Cy(g, 0.065, 0.18, K('#cfe8ff', { op: 0.45 }), 0.38, 0.82, -0.1);
  ['#d6262f', '#1d4f91', '#e8b923', '#2f8f4f'].forEach((c, k) => {
    const d = k - 1.5;
    const br = Cy(g, 0.007, 0.28, '#c9a36a', 0.38 + d * 0.022, 0.86, -0.1, null, 8);
    br.rotation.z = d * 0.12;
    Cy(g, 0.011, 0.04, c, 0.38 + d * 0.05, 1.12, -0.1, null, 8);
  });
  ['#d6262f', '#e8b923', '#1d4f91'].forEach((c, k) => CyX(g, 0.017, 0.12, c, 0.08 + k * 0.07, 0.84, 0.2));
  // alttaki kavanozlar
  ['#e8742a', '#7a3fa0', '#2f8f4f'].forEach((c, k) => Cy(g, 0.07, 0.14, c, -0.4 + k * 0.2, 0.23, 0, { m: 0.3 }));
}, { box: [0.72, 0.35] });
I('artstool', 'resim', 'Ressam Taburesi', '🪑', (g) => {
  const sw = M('#6a4528', 0.6);
  Cy(g, 0.19, 0.05, sw, 0, 0.6, 0, null, 22);
  [0, 1, 2].forEach((k) => {
    const a = (k * PI * 2) / 3;
    rod(g, [Math.sin(a) * 0.15, 0.6, Math.cos(a) * 0.15], [Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22], 0.02, sw);
  });
  To0(g, 0.17, 0.012, sw, 0.3);
}, { box: [0.22, 0.22], seats: [[0, 0.65, 0]] });
function To0(g, r, t, c, y) {
  const m = add(g, new THREE.TorusGeometry(r, t, 6, 24), mm(c), 0, y, 0);
  m.rotation.x = PI / 2;
}
I('artshelf', 'resim', 'Malzeme Rafı', '🗄️', (g) => {
  const sw = M('#6a4528', 0.6);
  [-0.8, 0.8].forEach((s) => B(g, 0.04, 2.0, 0.4, sw, s, 0, 0));
  [0.05, 0.7, 1.35, 1.96].forEach((y) => B(g, 1.64, 0.04, 0.4, sw, 0, y, 0));
  // kitaplar / eskiz defterleri
  ['#d6262f', '#1d4f91', '#e8b923', '#2f8f4f', '#7a3fa0'].forEach((c, k) => {
    const b = B(g, 0.06, 0.48 + (k % 2) * 0.08, 0.3, c, -0.7 + k * 0.08, 1.39, 0);
    b.rotation.z = k === 4 ? 0.2 : 0;
  });
  // boya tüpleri / kutular
  ['#d6262f', '#e8b923', '#1d4f91', '#2f8f4f', '#7a3fa0'].forEach((c, k) => Cy(g, 0.065, 0.12, c, -0.6 + k * 0.3, 0.74, 0, { m: 0.3 }));
  [0, 1, 2].forEach((k) => B(g, 0.5, 0.04, 0.32, ['#f4f1ea', '#e9dfcf', '#ffffff'][k], 0.3, 1.39 + k * 0.045, 0));
  // tuval rulosu + boş tuvaller
  [0, 1, 2].forEach((k) => B(g, 0.03, 0.55 - k * 0.07, 0.4 - k * 0.05, '#f4f1ea', -0.6 + k * 0.05, 0.09, 0));
  CyX(g, 0.08, 0.7, '#e9e2d0', 0.35, 0.18, 0);
}, { box: [0.82, 0.21] });
I('dropcloth', 'resim', 'Boyalı Örtü', '🧻', (g) => {
  const p = Pl(g, 3.2, 2.0, K('#ffffff', { map: splatTex(), r: 1 }), 0, 0.012, 0);
  p.rotation.x = -PI / 2;
  p.castShadow = false;
}, { nobox: true, flat: true });
I('paintbuckets', 'resim', 'Boya Kovaları', '🪣', (g) => {
  [['#d6262f', -0.18, 0], ['#1d4f91', 0.18, 0.04], ['#e8b923', 0, -0.2]].forEach(([c, x, z]) => {
    Cy(g, 0.13, 0.26, '#c8ccd2', x, 0, z, { m: 0.7, r: 0.3 }, 20, 0.15);
    Cy(g, 0.125, 0.02, c, x, 0.26, z, null, 20);
    const dr = B(g, 0.04, 0.12, 0.012, c, x + 0.12, 0.14, z + 0.06);
    dr.rotation.y = 0.6;
  });
  const br = Cy(g, 0.012, 0.32, '#c9a36a', 0.25, 0.2, -0.15, null, 8);
  br.rotation.z = 0.9;
}, { box: [0.34, 0.3] });
I('clay', 'resim', 'Kil Büst', '🗿', (g) => {
  B(g, 0.42, 0.9, 0.42, '#efeae2', 0, 0, 0);
  Cy(g, 0.17, 0.08, '#d9d4c8', 0, 0.9, 0);
  const n = Cy(g, 0.07, 0.14, '#b98a66', 0, 0.98, 0, { r: 0.85 });
  void n;
  const head = Sp(g, 0.14, '#b98a66', 0, 1.24, 0, { r: 0.85 }, 20);
  head.scale.set(0.9, 1.15, 1);
  Sp(g, 0.03, '#a97a58', 0, 1.24, 0.13, { r: 0.85 }, 10);
  B(g, 0.3, 0.12, 0.18, '#b98a66', 0, 1.0, 0, { r: 0.85 });
}, { box: [0.22, 0.22] });
I('artlamp', 'resim', 'Atölye Lambası', '💡', (g) => {
  Cy(g, 0.18, 0.04, '#222');
  Cy(g, 0.02, 1.5, '#2a2c33', 0, 0.04, 0);
  const arm = sub(g, 0, 1.54, 0);
  rod(arm, [0, 0, 0], [0, 0.18, 0.42], 0.016, '#2a2c33');
  const sh = add(arm, new THREE.ConeGeometry(0.16, 0.22, 18, 1, true), K('#d8dde4', { side: 'double', m: 0.6, r: 0.3 }), 0, 0.12, 0.48);
  sh.rotation.x = PI * 0.82;
  Sp(arm, 0.05, '#fff6c8', 0, 0.08, 0.52, { e: '#ffe3a0', ei: 1.6 });
  let on = true;
  return {
    act: 'Lambayı aç/kapat',
    get on() {
      return on;
    },
    setOn(v) {
      on = v;
    },
    light: { x: 0, y: 1.5, z: 0.55, color: '#fff1d0', intensity: 1.8, distance: 4.5 },
  };
}, { box: [0.18, 0.18] });

// ── LİMAN & DEPO
function containerBody(g, col, x = 0, y = 0, z = 0) {
  const L = 4.0;
  const H = 1.75;
  const W = 1.65;
  const c = sub(g, x, y, z);
  B(c, L, H, W, K(col, { map: ribTex(), r: 0.6, m: 0.2 }), 0, 0, 0);
  const dark = new THREE.Color(col).multiplyScalar(0.55).getStyle();
  // üst / alt çerçeve rayları (sadece kenarlar)
  [0, H - 0.08].forEach((y) => {
    [-1, 1].forEach((sz) => B(c, L + 0.04, 0.08, 0.08, dark, 0, y, sz * (W / 2 - 0.02)));
    [-1, 1].forEach((sx) => B(c, 0.08, 0.08, W + 0.04, dark, sx * (L / 2 - 0.02), y, 0));
  });
  B(c, L - 0.1, 0.02, W - 0.1, K(col, { r: 0.7, m: 0.15 }), 0, H, 0);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => B(c, 0.1, H, 0.1, '#2a2a2a', sx * (L / 2 - 0.05), 0, sz * (W / 2 - 0.05))));
  // arka kapı kolları
  [-0.5, -0.17, 0.17, 0.5].forEach((k) => Cy(c, 0.015, H * 0.9, M('#bbbbbb', 0.3, 0.8), L / 2 + 0.03, H * 0.05, k, null, 8));
  return c;
}
I('container', 'liman', 'Konteyner', '📦', (g, ctx) => {
  containerBody(g, ctx.tint?.c || '#c62a2f');
}, { box: [2.02, 0.84], tints: 'container' });
I('truck', 'liman', 'Konteyner Tırı', '🚛', (g, ctx) => {
  const tt = ctx.tint || V135_TINTS.truck[0];
  const bl = K(tt.c, { r: 0.4, m: 0.3 });
  const bk = M('#111111', 0.9, 0);
  const ch = M('#c8ccd2', 0.25, 0.9);
  B(g, 7.2, 0.16, 0.8, '#2a2a2a', -0.2, 0.45, 0);
  B(g, 4.5, 0.1, 1.5, '#3a3f47', -1.5, 0.6, 0);
  // kabin
  B(g, 1.25, 1.5, 1.42, bl, 2.55, 0.62, 0);
  B(g, 0.6, 0.5, 1.3, bl, 2.1, 2.12, 0);
  B(g, 0.04, 0.62, 1.25, K('#0a1a2a', { m: 0.6, r: 0.1 }), 3.18, 1.35, 0);
  [-1, 1].forEach((s) => B(g, 0.9, 0.5, 0.03, K('#0a1a2a', { m: 0.6, r: 0.1 }), 2.6, 1.45, s * 0.715));
  B(g, 0.05, 0.38, 1.05, ch, 3.19, 0.78, 0);
  B(g, 0.12, 0.16, 1.5, ch, 3.22, 0.5, 0);
  B(g, 1.27, 0.08, 1.44, '#ffffff', 2.55, 0.98, 0);
  [-0.55, 0.55].forEach((z) => B(g, 0.04, 0.12, 0.18, K('#fff0b0', { e: '#fff0b0', ei: 1.4 }), 3.2, 0.8, z));
  [-1, 1].forEach((s) => {
    Cy(g, 0.05, 1.3, ch, 1.9, 1.15, s * 0.68, null, 10);
    B(g, 0.1, 0.32, 0.06, bk, 3.05, 1.55, s * 0.76);
  });
  const pl = Pl(g, 0.5, 0.12, K('#ffffff', { map: plateTex('34 NŞ 135') }), 3.29, 0.5, 0);
  pl.rotation.y = PI / 2;
  const wh = (x, z) => {
    CyZ(g, 0.38, 0.28, bk, x, 0.38, z, null, 22);
    CyZ(g, 0.17, 0.3, ch, x, 0.38, z, null, 12);
  };
  [2.6, 1.0, 0.4, -2.7, -3.3].forEach((x) => [-0.66, 0.66].forEach((z) => wh(x, z)));
  containerBody(g, tt.s || '#c62a2f', -1.5, 0.7, 0);
}, {
  boxes: [[-0.15, 0, 3.5, 0.8]],
  seats: [[2.55, 1.25, 0.2]],
  seatLabel: '🚛 Tıra bin',
  exitLabel: '⬆️ Tırdan in',
  tints: 'truck',
});
I('crane', 'liman', 'Liman Vinci', '🏗️', (g, ctx) => {
  // portal vinç: tavana göre boylanır (tır ve konteynerlerin üstünden geçer)
  const H = ctx.H || 3.4;
  const top = Math.max(2.7, Math.min(5.4, H - 0.75));
  const SX = 2.5;
  const SZ = 1.15;
  const cr = M('#f0a020', 0.5, 0.2);
  const dk = M('#2b2f36', 0.5, 0.4);
  [[-SX, -SZ], [SX, -SZ], [-SX, SZ], [SX, SZ]].forEach(([x, z]) => {
    B(g, 0.22, top, 0.22, cr, x, 0, z);
    B(g, 0.5, 0.26, 0.5, dk, x, 0, z);
    CyX(g, 0.1, 0.42, '#111', x, 0.1, z + 0.18);
  });
  [-SZ, SZ].forEach((z) => B(g, SX * 2 + 0.3, 0.26, 0.26, cr, 0, top, z));
  [-SX, SX].forEach((x) => {
    B(g, 0.26, 0.26, SZ * 2 + 0.2, cr, x, top, 0);
    B(g, 0.16, 0.16, SZ * 2, cr, x, top * 0.35, 0);
    rod(g, [x, 0.3, -SZ], [x, top, SZ], 0.05, cr);
  });
  // bom (öne uzanan kol) + makine dairesi + operatör kabini
  B(g, 0.48, 0.3, 5.4, cr, 0, top + 0.26, 0.8);
  B(g, 1.1, 0.42, 1.1, M('#d98a14', 0.5, 0.2), 0, top + 0.56, -1.4);
  B(g, 0.9, 0.6, 0.8, M('#e8e6e0', 0.4), 0, top - 0.62, 1.55);
  B(g, 0.92, 0.3, 0.02, K('#0a1a2a', { m: 0.6, r: 0.1 }), 0, top - 0.4, 1.96);
  // araba (trolley) + halatlar + yayıcı (spreader)
  const tr = sub(g, 0, top + 0.02, 0.6);
  B(tr, 0.8, 0.22, 0.6, dk, 0, 0, 0);
  const drop = Math.max(0.5, top - 2.75);
  [-1, 1].forEach((a) => [-1, 1].forEach((b) => rod(tr, [a * 0.3, 0, b * 0.2], [a * 0.55, -drop, b * 0.2], 0.014, dk)));
  const spr = B(tr, 1.7, 0.1, 0.5, '#f5c518', 0, -drop - 0.1, 0);
  void spr;
  // ikaz lambaları
  [-SX, SX].forEach((x) => Sp(g, 0.07, '#ff3b3b', x, top + 0.3, SZ, { e: '#ff3b3b', ei: 1.6 }));
  let t1 = 0;
  return {
    on: true,
    setOn() {},
    noToggle: true,
    tick(t) {
      if (t - t1 < 0.033) return;
      t1 = t;
      tr.position.z = 0.6 + Math.sin(t * 0.3) * 1.6; // araba bom boyunca gider gelir
    },
  };
}, { boxes: [[-2.5, -1.15, 0.26, 0.26], [2.5, -1.15, 0.26, 0.26], [-2.5, 1.15, 0.26, 0.26], [2.5, 1.15, 0.26, 0.26]] });
I('forklift', 'liman', 'Forklift', '🚜', (g) => {
  const y = M('#f2b705', 0.45, 0.2);
  const bk = M('#151515', 0.9);
  B(g, 0.95, 0.55, 1.5, y, 0, 0.25, -0.1);
  B(g, 0.9, 0.4, 0.5, '#2a2a2a', 0, 0.3, -0.85);
  [[-0.42, -0.6], [0.42, -0.6], [-0.42, 0.45], [0.42, 0.45]].forEach(([x, z]) => {
    const w = CyX(g, z > 0 ? 0.25 : 0.2, 0.2, bk, x, z > 0 ? 0.25 : 0.2, z, null, 18);
    void w;
  });
  // koltuk + direksiyon + kafes
  B(g, 0.5, 0.1, 0.45, '#1d1d1f', 0, 0.8, -0.35);
  B(g, 0.5, 0.45, 0.08, '#1d1d1f', 0, 0.85, -0.58);
  Cy(g, 0.03, 0.4, '#333', 0, 0.8, 0.2);
  const sw = add(g, new THREE.TorusGeometry(0.15, 0.02, 6, 20), mm('#222'), 0, 1.2, 0.18);
  sw.rotation.x = PI / 2.6;
  [[-0.44, -0.62], [0.44, -0.62], [-0.44, 0.42], [0.44, 0.42]].forEach(([x, z]) => B(g, 0.05, 1.45, 0.05, '#222', x, 0.8, z));
  B(g, 0.95, 0.05, 1.1, '#222', 0, 2.24, -0.1);
  // direk + çatal + palet
  [-0.28, 0.28].forEach((x) => B(g, 0.08, 2.1, 0.08, '#3a3d42', x, 0.05, 0.72));
  B(g, 0.66, 0.08, 0.1, '#3a3d42', 0, 1.0, 0.76);
  [-0.2, 0.2].forEach((x) => B(g, 0.1, 0.05, 1.0, '#3a3d42', x, 0.3, 1.25));
  pallet(g, 0, 0.35, 1.25, 0.8);
  [0, 1].forEach((k) => B(g, 0.7, 0.42, 0.7, K('#c9a36a', { r: 0.8 }), 0, 0.5 + k * 0.42, 1.25));
}, { box: [0.5, 1.2], seats: [[0, 0.88, -0.32]], seatLabel: '🚜 Forklifte bin', exitLabel: '⬆️ Forkliftten in' });
function pallet(g, x, y, z, s = 1) {
  const p = sub(g, x, y, z);
  p.scale.setScalar(s);
  const w = M('#b98a52', 0.85);
  [-0.5, 0, 0.5].forEach((zz) => B(p, 1.2, 0.08, 0.14, w, 0, 0, zz));
  [-0.55, -0.27, 0, 0.27, 0.55].forEach((xx) => B(p, 0.16, 0.03, 1.2, w, xx, 0.08, 0));
  return p;
}
I('pallets', 'liman', 'Palet Yığını', '🪵', (g) => {
  [0, 1, 2, 3].forEach((k) => {
    const p = pallet(g, 0, k * 0.12, 0);
    p.rotation.y = (k % 2) * 0.05;
  });
  // üstte streçlenmiş koliler
  B(g, 1.1, 0.7, 1.1, K('#d8c79e', { r: 0.8 }), 0, 0.5, 0);
  B(g, 1.12, 0.72, 1.12, K('#cfe8ff', { op: 0.28 }), 0, 0.49, 0);
}, { box: [0.62, 0.62] });
I('bollard', 'liman', 'Halat Babası', '⚓', (g) => {
  const dk = M('#1f2228', 0.5, 0.6);
  Cy(g, 0.32, 0.12, dk, 0, 0, 0, null, 24);
  Cy(g, 0.2, 0.45, dk, 0, 0.12, 0, null, 22, 0.17);
  Cy(g, 0.26, 0.1, dk, 0, 0.55, 0, null, 22);
  // halat sargısı
  const rope = M('#c9a36a', 0.9);
  for (let k = 0; k < 3; k++) {
    const t = add(g, new THREE.TorusGeometry(0.205, 0.03, 8, 24), rope, 0, 0.22 + k * 0.07, 0);
    t.rotation.x = PI / 2;
  }
  rod(g, [0.2, 0.28, 0], [0.9, 0.03, 0.3], 0.03, rope);
}, { box: [0.32, 0.32], seats: [[0, 0.66, 0]] });
I('portlight', 'liman', 'Liman Projektörü', '🔦', (g, ctx) => {
  const H = ctx.H || 3.4;
  const top = Math.max(2.4, H - 0.3);
  const dk = M('#2b2f36', 0.5, 0.4);
  Cy(g, 0.22, 0.12, '#f5c518', 0, 0, 0);
  Cy(g, 0.06, top - 0.12, dk, 0, 0.12, 0, null, 12, 0.05);
  B(g, 0.9, 0.06, 0.08, dk, 0, top - 0.06, 0);
  const heads = [];
  [-0.32, 0.32].forEach((x) => {
    const hd = sub(g, x, top - 0.18, 0.08);
    hd.rotation.x = 0.5;
    B(hd, 0.3, 0.22, 0.14, dk, 0, -0.11, 0);
    heads.push(Pl(hd, 0.26, 0.18, K('#fff6d8', { e: '#fff1c0', ei: 1.8 }), 0, 0, 0.072));
  });
  let on = true;
  return {
    act: 'Projektörü aç/kapat',
    get on() {
      return on;
    },
    setOn(v) {
      on = v;
      heads.forEach((h) => {
        h.material.emissiveIntensity = v ? 1.8 : 0.05;
      });
    },
    light: { x: 0, y: top - 0.4, z: 0.6, color: '#fff1d0', intensity: 2.4, distance: 7 },
  };
}, { box: [0.22, 0.22] });

export function v135CatalogEntries() {
  return OUT.map((d) => ({ ...d }));
}
