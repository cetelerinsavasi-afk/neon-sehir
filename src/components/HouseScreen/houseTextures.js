import * as THREE from 'three';
import { surfacePrice } from '../../../functions/houseCatalogData.js';

// =============================================================================
// houseTextures.js — Ev için prosedürel (kodla çizilen) zemin/duvar dokuları.
// Hiçbir dış görsel dosyası yok: her şey canvas'a çizilip CanvasTexture olur.
// Böylece paket küçük kalır ve yeni bir doku eklemek = yeni bir çizim fonksiyonu.
// =============================================================================

const texCache = new Map();

function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function makeTex(key, w, h, draw, { srgb = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h, rnd(key.length * 7919 + w));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

function grain(g, w, h, n, a, r) {
  for (let i = 0; i < n; i++) {
    const v = r() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${r() * a})`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

function planks(base, dark, light) {
  return (g, w, h, r) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const rows = 8;
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < w) {
        const len = 180 + r() * 200;
        const tone = r();
        g.fillStyle = tone > 0.66 ? light : tone > 0.33 ? base : dark;
        g.globalAlpha = 0.55;
        g.fillRect(x, i * ph, len, ph);
        g.globalAlpha = 1;
        // damarlar
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          const yy = i * ph + 4 + r() * (ph - 8);
          g.beginPath();
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 6, x + len * 0.6, yy + (r() - 0.5) * 6, x + len, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(x, i * ph, 2, ph);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, i * ph, w, 2);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, i * ph + 2, w, 1);
    }
    grain(g, w, h, 5000, 0.05, r);
  };
}

function marble(base, vein, vein2) {
  return (g, w, h, r) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = i % 3 === 0 ? vein2 : vein;
      g.globalAlpha = 0.15 + r() * 0.35;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      let x = r() * w;
      let y = r() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 12; k++) {
        x += (r() - 0.3) * 70;
        y += (r() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    // karo derzleri (2 x 2)
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w / 2, h / 2);
    g.strokeRect(w / 2, 0, w / 2, h / 2);
    g.strokeRect(0, h / 2, w / 2, h / 2);
    g.strokeRect(w / 2, h / 2, w / 2, h / 2);
  };
}

function solid(color, noise = 0.04) {
  return (g, w, h, r) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 4000, noise, r);
  };
}

// ---------------------------------------------------------------------------
// ZEMİNLER — price: null = ücretsiz, { t:'gold'|'gem', v }
// ---------------------------------------------------------------------------
export const FLOORS = [
  { key: 'parke_mese', name: 'Meşe Parke', swatch: '#a07448', price: null, rough: 0.5, rep: 2.2,
    draw: planks('#a07448', '#8a5f38', '#b8875a') },
  { key: 'parke_ceviz', name: 'Ceviz Parke', swatch: '#5a3a24', price: { t: 'gold', v: 5000 }, rough: 0.45, rep: 2.2,
    draw: planks('#5a3a24', '#432a19', '#6d4a2f') },
  { key: 'parke_beyaz', name: 'Beyaz Parke', swatch: '#d8cfc2', price: { t: 'gold', v: 6000 }, rough: 0.5, rep: 2.2,
    draw: planks('#d8cfc2', '#c4b9a9', '#e6ded3') },
  { key: 'mermer_beyaz', name: 'Beyaz Mermer', swatch: '#e9e7e2', price: { t: 'gold', v: 12000 }, rough: 0.18, rep: 1.6,
    draw: marble('#e9e7e2', '#8b8b8b', '#b5a58a') },
  { key: 'mermer_siyah', name: 'Siyah Mermer', swatch: '#141416', price: { t: 'gem', v: 60 }, rough: 0.14, rep: 1.6,
    draw: marble('#141416', '#d9d9d9', '#c9a24a') },
  { key: 'mermer_altin', name: 'Altın Damarlı Mermer', swatch: '#f0ebe0', price: { t: 'gem', v: 150 }, rough: 0.12, rep: 1.6,
    draw: marble('#f0ebe0', '#c9a24a', '#e0b84a') },
  { key: 'beton', name: 'Cilalı Beton', swatch: '#5d5f63', price: null, rough: 0.55, rep: 3,
    draw: (g, w, h, r) => {
      g.fillStyle = '#5d5f63';
      g.fillRect(0, 0, w, h);
      grain(g, w, h, 12000, 0.1, r);
      for (let i = 0; i < 6; i++) {
        const x = r() * w, y = r() * h;
        const rg = g.createRadialGradient(x, y, 2, x, y, 60 + r() * 80);
        rg.addColorStop(0, 'rgba(0,0,0,.25)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, w, h);
      }
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, w, h);
    } },
  { key: 'dama', name: 'Dama Karo', swatch: '#1b1b1d', price: { t: 'gold', v: 4000 }, rough: 0.25, rep: 1.2,
    draw: (g, w, h, r) => {
      const n = 4, s = w / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? '#e8e4dc' : '#161618';
        g.fillRect(x * s, y * s, s, s);
      }
      grain(g, w, h, 3000, 0.05, r);
    } },
  { key: 'hali_gri', name: 'Gri Halıfleks', swatch: '#55585f', price: null, rough: 0.95, rep: 2,
    draw: (g, w, h, r) => {
      g.fillStyle = '#55585f';
      g.fillRect(0, 0, w, h);
      grain(g, w, h, 40000, 0.14, r);
    } },
  { key: 'hali_bordo', name: 'Bordo Halıfleks', swatch: '#5a1820', price: { t: 'gold', v: 3000 }, rough: 0.95, rep: 2,
    draw: (g, w, h, r) => {
      g.fillStyle = '#5a1820';
      g.fillRect(0, 0, w, h);
      grain(g, w, h, 40000, 0.14, r);
    } },
  { key: 'epoksi', name: 'Garaj Epoksi', swatch: '#3b4048', price: { t: 'gold', v: 3000 }, rough: 0.3, rep: 2,
    draw: (g, w, h, r) => {
      g.fillStyle = '#3b4048';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = ['#c9c9c9', '#1a1a1a', '#6a7280', '#e8b04a'][Math.floor(r() * 4)];
        g.globalAlpha = 0.5;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
      g.globalAlpha = 1;
    } },
  { key: 'karo_mavi', name: 'Mavi Seramik', swatch: '#2b5c7a', price: { t: 'gold', v: 3000 }, rough: 0.2, rep: 1.2,
    draw: (g, w, h, r) => {
      const n = 6, s = w / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        g.fillStyle = `hsl(203, ${45 + r() * 10}%, ${28 + r() * 6}%)`;
        g.fillRect(x * s, y * s, s, s);
      }
      g.strokeStyle = '#d9d9d9';
      g.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
        g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
      }
    } },
  { key: 'neon_grid', name: 'Neon Izgara', swatch: '#0b0b14', price: { t: 'gem', v: 120 }, rough: 0.2, rep: 1.5, emissive: true,
    draw: (g, w, h) => {
      g.fillStyle = '#07070d';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff2d8a';
      g.shadowColor = '#ff2d8a';
      g.shadowBlur = 12;
      g.lineWidth = 3;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.strokeStyle = '#19e8ff';
      g.shadowColor = '#19e8ff';
      g.strokeRect(w / 2 - 60, h / 2 - 60, 120, 120);
    } },
  { key: 'epoksi_siyah', name: 'Parlak Siyah Epoksi', swatch: '#0c0c0e', rough: 0.08, rep: 2,
    draw: (g, w, h, r) => {
      g.fillStyle = '#0c0c0e';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        g.fillStyle = ['#2a2a30', '#4a4a52', '#1a1a1e'][Math.floor(r() * 3)];
        g.fillRect(r() * w, r() * h, 2, 2);
      }
    } },
  ...[
    ['zemin_siyah', 'Düz Siyah', '#151517'], ['zemin_beyaz', 'Düz Beyaz', '#e8e6e0'], ['zemin_gri', 'Düz Gri', '#6a6d72'],
    ['zemin_yesil', 'Düz Yeşil', '#2d6a3e'], ['zemin_mavi', 'Düz Mavi', '#1f4a8a'], ['zemin_mor', 'Düz Mor', '#4a2a6a'],
    ['zemin_kirmizi', 'Düz Kırmızı', '#7a1a1e'],
  ].map(([key, name, c]) => ({ key, name, swatch: c, rough: 0.35, rep: 3, draw: solid(c, 0.03) })),
];

// ---------------------------------------------------------------------------
// DUVARLAR
// ---------------------------------------------------------------------------
export const WALLS = [
  { key: 'boya_beyaz', name: 'Kırık Beyaz', swatch: '#e7e3da', price: null, rough: 0.9, rep: 3, draw: solid('#e7e3da') },
  { key: 'boya_krem', name: 'Krem', swatch: '#d9c7a4', price: null, rough: 0.9, rep: 3, draw: solid('#d9c7a4') },
  { key: 'boya_gri', name: 'Açık Gri', swatch: '#a3a6ab', price: null, rough: 0.9, rep: 3, draw: solid('#a3a6ab') },
  { key: 'boya_antrasit', name: 'Antrasit', swatch: '#2c2e33', price: null, rough: 0.9, rep: 3, draw: solid('#2c2e33') },
  { key: 'boya_lacivert', name: 'Gece Mavisi', swatch: '#1b2740', price: { t: 'gold', v: 1500 }, rough: 0.9, rep: 3, draw: solid('#1b2740') },
  { key: 'boya_bordo', name: 'Bordo', swatch: '#5c1a24', price: { t: 'gold', v: 1500 }, rough: 0.9, rep: 3, draw: solid('#5c1a24') },
  { key: 'boya_zeytin', name: 'Zeytin Yeşili', swatch: '#4a5237', price: { t: 'gold', v: 1500 }, rough: 0.9, rep: 3, draw: solid('#4a5237') },
  { key: 'boya_mor', name: 'Mürdüm', swatch: '#3d2447', price: { t: 'gold', v: 1500 }, rough: 0.9, rep: 3, draw: solid('#3d2447') },
  { key: 'boya_siyah', name: 'Mat Siyah', swatch: '#111114', price: { t: 'gold', v: 1500 }, rough: 0.95, rep: 3, draw: solid('#111114') },
  { key: 'tugla', name: 'Tuğla', swatch: '#6a3526', price: { t: 'gold', v: 4000 }, rough: 0.92, rep: 4,
    draw: (g, w, h, r) => {
      g.fillStyle = '#3a2a24';
      g.fillRect(0, 0, w, h);
      for (let row = 0; row < 16; row++) {
        for (let col = -1; col < 9; col++) {
          const x = col * 64 + (row % 2 ? 32 : 0);
          g.fillStyle = `hsl(${10 + r() * 10},${38 + r() * 14}%,${24 + r() * 11}%)`;
          g.fillRect(x + 2, row * 32 + 2, 60, 28);
        }
      }
      grain(g, w, h, 8000, 0.1, r);
    } },
  { key: 'tugla_beyaz', name: 'Beyaz Tuğla', swatch: '#cfcac1', price: { t: 'gold', v: 5000 }, rough: 0.92, rep: 4,
    draw: (g, w, h, r) => {
      g.fillStyle = '#9e9a93';
      g.fillRect(0, 0, w, h);
      for (let row = 0; row < 16; row++) {
        for (let col = -1; col < 9; col++) {
          const x = col * 64 + (row % 2 ? 32 : 0);
          g.fillStyle = `hsl(40,${6 + r() * 5}%,${76 + r() * 8}%)`;
          g.fillRect(x + 2, row * 32 + 2, 60, 28);
        }
      }
      grain(g, w, h, 8000, 0.08, r);
    } },
  { key: 'beton_duvar', name: 'Brüt Beton', swatch: '#77787a', price: { t: 'gold', v: 3000 }, rough: 0.85, rep: 3,
    draw: (g, w, h, r) => {
      g.fillStyle = '#77787a';
      g.fillRect(0, 0, w, h);
      grain(g, w, h, 16000, 0.12, r);
      g.fillStyle = 'rgba(0,0,0,.35)';
      [[w * 0.25, h * 0.25], [w * 0.75, h * 0.25], [w * 0.25, h * 0.75], [w * 0.75, h * 0.75]].forEach(([x, y]) => {
        g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
      });
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.strokeRect(0, 0, w, h / 2);
      g.strokeRect(0, h / 2, w, h / 2);
    } },
  { key: 'ahsap_panel', name: 'Ahşap Panel', swatch: '#6b4428', price: { t: 'gold', v: 8000 }, rough: 0.55, rep: 3,
    draw: (g, w, h, r) => {
      const n = 8, s = w / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = `hsl(25,${38 + r() * 8}%,${24 + r() * 7}%)`;
        g.fillRect(i * s, 0, s, h);
        g.strokeStyle = 'rgba(0,0,0,.14)';
        for (let k = 0; k < 7; k++) {
          const xx = i * s + 4 + r() * (s - 8);
          g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + 5, h * 0.3, xx - 5, h * 0.6, xx, h); g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.fillRect(i * s, 0, 3, h);
      }
    } },
  { key: 'duvar_kagidi', name: 'Çizgili Duvar Kağıdı', swatch: '#2e3b33', price: { t: 'gold', v: 6000 }, rough: 0.85, rep: 3,
    draw: (g, w, h) => {
      g.fillStyle = '#2e3b33';
      g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = 'rgba(201,162,74,.35)';
        g.fillRect(x, 0, 3, h);
        g.fillStyle = 'rgba(255,255,255,.04)';
        g.fillRect(x + 10, 0, 12, h);
      }
    } },
  { key: 'damask', name: 'Damask Desen', swatch: '#3a1420', price: { t: 'gem', v: 40 }, rough: 0.8, rep: 3,
    draw: (g, w, h) => {
      g.fillStyle = '#3a1420';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(212,165,58,.28)';
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 128 + (y % 2 ? 64 : 0), cy = y * 128 + 64;
        g.beginPath();
        g.moveTo(cx, cy - 46);
        g.bezierCurveTo(cx + 34, cy - 20, cx + 34, cy + 20, cx, cy + 46);
        g.bezierCurveTo(cx - 34, cy + 20, cx - 34, cy - 20, cx, cy - 46);
        g.fill();
        g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fillStyle = 'rgba(58,20,32,1)'; g.fill();
        g.fillStyle = 'rgba(212,165,58,.28)';
      }
    } },
  { key: 'mermer_duvar', name: 'Mermer Kaplama', swatch: '#e6e2da', price: { t: 'gem', v: 80 }, rough: 0.2, rep: 2,
    draw: marble('#e6e2da', '#8a8a8a', '#b8a484') },
  { key: 'neon_panel', name: 'Neon Şeritli Panel', swatch: '#0c0c14', price: { t: 'gem', v: 120 }, rough: 0.35, rep: 3, emissive: true,
    draw: (g, w, h) => {
      g.fillStyle = '#0c0c14';
      g.fillRect(0, 0, w, h);
      g.shadowBlur = 14;
      [['#ff2d8a', h * 0.3], ['#19e8ff', h * 0.33]].forEach(([c, y]) => {
        g.fillStyle = c;
        g.shadowColor = c;
        g.fillRect(0, y, w, 4);
      });
    } },
  ...[
    ['boya_yesil', 'Yeşil', '#2f6b45'], ['boya_mavi', 'Mavi', '#2a5a9a'], ['boya_pembe', 'Pembe', '#c86a8a'],
    ['boya_turuncu', 'Turuncu', '#c8682a'], ['boya_sari', 'Sarı', '#d6b03a'], ['boya_turkuaz', 'Turkuaz', '#2a8a8a'],
  ].map(([key, name, c]) => ({ key, name, swatch: c, rough: 0.9, rep: 3, draw: solid(c) })),
];

// ---------------------------------------------------------------------------
// v92 — Dekor Atölyesi zeminleri ve duvarları (otopark zemini dahil)
// ---------------------------------------------------------------------------
const PI2 = Math.PI * 2;
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
function speck(g, w, h, r, n, cols, sz = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = pickR(r, cols);
    g.fillRect(r() * w, r() * h, sz, sz);
  }
}
function asphaltBase(g, w, h, r) {
  g.fillStyle = '#3b3f45';
  g.fillRect(0, 0, w, h);
  speck(g, w, h, r, 9000, ['#2f3338', '#4a4f56', '#55595f', '#34383d'], 2);
}
FLOORS.push(
  // Otopark: asfalt, beyaz park çizgileri, sarı tekerlek takozları, "P" işareti
  { key: 'otopark', name: 'Otopark', swatch: '#3b3f45', rough: 0.8, rep: 5,
    draw: (g, w, h, r) => {
      asphaltBase(g, w, h, r);
      // iki sıra park yeri (karşılıklı) + orta şerit
      g.fillStyle = '#f2f2f2';
      for (let i = 0; i <= 2; i++) {
        const x = (i * w) / 2;
        g.fillRect(x - 3, 0, 6, h * 0.36);
        g.fillRect(x - 3, h * 0.64, 6, h * 0.36);
      }
      g.fillRect(0, h * 0.36 - 3, w, 6);
      g.fillRect(0, h * 0.64 - 3, w, 6);
      g.fillStyle = '#ffd23f';
      [w * 0.25, w * 0.75].forEach((x) => {
        g.fillRect(x - 34, 16, 68, 12);
        g.fillRect(x - 34, h - 28, 68, 12);
      });
      // yön oku
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.moveTo(w * 0.42, h * 0.5 - 8);
      g.lineTo(w * 0.56, h * 0.5 - 8);
      g.lineTo(w * 0.56, h * 0.5 - 20);
      g.lineTo(w * 0.62, h * 0.5);
      g.lineTo(w * 0.56, h * 0.5 + 20);
      g.lineTo(w * 0.56, h * 0.5 + 8);
      g.lineTo(w * 0.42, h * 0.5 + 8);
      g.closePath();
      g.fill();
      g.font = 'bold 56px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillText('P', w * 0.25, h * 0.2);
      g.fillText('P', w * 0.75, h * 0.8);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        let x = r() * w;
        let y = r() * h;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (r() - 0.5) * 40;
          y += (r() - 0.5) * 40;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    } },
  { key: 'asfalt', name: 'Asfalt', swatch: '#3b3f45', rough: 0.85, rep: 3, draw: asphaltBase },
  { key: 'yol', name: 'Şeritli Yol', swatch: '#41454c', rough: 0.85, rep: 4,
    draw: (g, w, h, r) => {
      asphaltBase(g, w, h, r);
      g.fillStyle = '#f5f5f5';
      for (const y of [12, h - 12]) for (let a = 10; a < w; a += 128) g.fillRect(a, y - 5, 80, 10);
      g.fillStyle = '#ffd23f';
      for (let a = 0; a < w; a += 4) g.fillRect(a, h / 2 - 6, 3, 12);
    } },
  { key: 'cim', name: 'Çim', swatch: '#5cb85c', rough: 0.95, rep: 2.5,
    draw: (g, w, h, r) => {
      g.fillStyle = '#5cb85c';
      g.fillRect(0, 0, w, h);
      g.lineWidth = 2;
      for (let i = 0; i < 6000; i++) {
        const a = r() * w;
        const b = r() * h;
        g.strokeStyle = pickR(r, ['#4aa64a', '#6fcf5f', '#3e9a40', '#82d86e']);
        g.beginPath();
        g.moveTo(a, b);
        g.lineTo(a + (r() - 0.5) * 5, b - 6 - r() * 5);
        g.stroke();
      }
    } },
  { key: 'tarla', name: 'Tarla', swatch: '#8a5a33', rough: 0.95, rep: 3,
    draw: (g, w, h, r) => {
      g.fillStyle = '#8a5a33';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        g.fillStyle = '#6b4226';
        g.fillRect(0, y, w, 12);
        g.fillStyle = '#a46d3e';
        g.fillRect(0, y + 14, w, 7);
        for (let a = 8 + (y % 64 ? 16 : 0); a < w; a += 32) {
          g.strokeStyle = '#58b84a';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(a, y + 20);
          g.lineTo(a - 5, y + 10);
          g.moveTo(a, y + 20);
          g.lineTo(a + 5, y + 10);
          g.stroke();
        }
      }
      speck(g, w, h, r, 800, ['#7a4c2a', '#9b6a40'], 3);
    } },
  { key: 'kum', name: 'Kum', swatch: '#ead39d', rough: 0.95, rep: 3,
    draw: (g, w, h, r) => {
      g.fillStyle = '#ead39d';
      g.fillRect(0, 0, w, h);
      speck(g, w, h, r, 4000, ['#d9bf80', '#f4e2b4', '#cfb274'], 2);
      g.strokeStyle = 'rgba(180,140,70,.3)';
      g.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const y = (i + 0.5) * (h / 10);
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(w / 3, y - 18, (2 * w) / 3, y + 18, w, y);
        g.stroke();
      }
    } },
  { key: 'kaldirim', name: 'Kaldırım Taşı', swatch: '#aea89d', rough: 0.85, rep: 2.5,
    draw: (g, w, h, r) => {
      g.fillStyle = '#857f75';
      g.fillRect(0, 0, w, h);
      for (let y = 0, row = 0; y < h; y += 64, row++)
        for (let a = (row % 2) * -64; a < w; a += 128) {
          g.fillStyle = pickR(r, ['#bab4a9', '#aea89d', '#c5bfb4', '#a9a397']);
          g.fillRect(a + 4, y + 4, 120, 56);
        }
    } },
  { key: 'cakil', name: 'Çakıl', swatch: '#b8b0a2', rough: 0.95, rep: 2,
    draw: (g, w, h, r) => {
      g.fillStyle = '#a69f92';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = pickR(r, ['#c9c2b6', '#8e877b', '#b8b0a2', '#d8d2c7', '#7c766c']);
        g.beginPath();
        g.arc(r() * w, r() * h, 2 + r() * 5, 0, PI2);
        g.fill();
      }
    } },
  { key: 'kar', name: 'Kar', swatch: '#eef5fb', rough: 0.9, rep: 3,
    draw: (g, w, h, r) => {
      g.fillStyle = '#eef5fb';
      g.fillRect(0, 0, w, h);
      speck(g, w, h, r, 2500, ['#dce9f4', '#ffffff', '#cfe0ee'], 4);
    } },
  { key: 'havuz_karo', name: 'Havuz Karosu', swatch: '#c9dfe8', rough: 0.2, rep: 1.5,
    draw: (g, w, h, r) => {
      g.fillStyle = '#c9dfe8';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 64)
        for (let j = 0; j < h; j += 64) {
          g.fillStyle = r() < 0.12 ? '#5aa9ff' : pickR(r, ['#eef7fb', '#e4f1f7', '#f6fbfd']);
          g.fillRect(i + 3, j + 3, 58, 58);
        }
    } },
  { key: 'spor_zemin', name: 'Spor Zemini', swatch: '#262a32', rough: 0.9, rep: 2,
    draw: (g, w, h, r) => {
      g.fillStyle = '#262a32';
      g.fillRect(0, 0, w, h);
      speck(g, w, h, r, 1800, ['#3df5c4', '#ff2e5a', '#ffd23f', '#5aa9ff', '#444a55'], 3);
      g.strokeStyle = 'rgba(0,0,0,.4)';
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke();
        g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke();
      }
    } },
  { key: 'metal_izgara', name: 'Metal Izgara', swatch: '#8a9099', rough: 0.35, rep: 1.5,
    draw: (g, w, h) => {
      g.fillStyle = '#8a9099';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 32)
        for (let j = 0; j < h; j += 32) {
          const f = ((i + j) / 32) % 2;
          g.save();
          g.translate(i + 16, j + 16);
          g.rotate(f ? Math.PI / 4 : -Math.PI / 4);
          g.fillStyle = '#b4bac2';
          g.fillRect(-10, -3, 20, 6);
          g.fillStyle = '#6d737c';
          g.fillRect(-10, 3, 20, 2);
          g.restore();
        }
    } },
  { key: 'dans_pisti', name: 'Neon Dans Pisti', swatch: '#ff2e5a', rough: 0.25, rep: 3, emissive: true,
    draw: (g) => {
      const pal = ['#ff2e5a', '#3df5c4', '#ffd23f', '#5aa9ff', '#b45cff', '#ff8a3d'];
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          g.fillStyle = pal[(i * 7 + j * 13 + (i ^ j)) % pal.length];
          g.fillRect(i * 64, j * 64, 64, 64);
          g.fillStyle = 'rgba(255,255,255,.25)';
          g.fillRect(i * 64 + 6, j * 64 + 6, 52, 8);
          g.fillStyle = 'rgba(0,0,0,.45)';
          g.fillRect(i * 64, j * 64 + 60, 64, 4);
          g.fillRect(i * 64 + 60, j * 64, 4, 64);
        }
    } },
  { key: 'su', name: 'Sığ Su', swatch: '#2f8fd8', rough: 0.08, rep: 2.5,
    draw: (g, w, h, r) => {
      g.fillStyle = '#2f8fd8';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 3;
      for (let i = 0; i < 70; i++) {
        g.beginPath();
        g.arc(r() * w, r() * h, 10 + r() * 22, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
    } }
);

// Manzara duvarları ("mural"): 1024×512 doku duvarın TAM boyunu kaplar, yatayda
// 6,8 m'de bir tekrar eder (kenarlar yan yana kusursuz birleşir).
function wrapX(w, fn) {
  for (const ox of [-w, 0, w]) fn(ox);
}
function skyG(g, h, top, bot, to = 1) {
  const gr = g.createLinearGradient(0, 0, 0, h * to);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  return gr;
}
function cloudsW(g, w, h, r, n, col = 'rgba(255,255,255,0.92)') {
  const list = [];
  for (let i = 0; i < n; i++) list.push([r() * w, 40 + r() * h, 18 + r() * 26]);
  wrapX(w, (ox) => {
    g.fillStyle = col;
    list.forEach(([cx, cy, s]) => {
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(ox + cx + (k - 2) * s * 0.8, cy - (k % 2) * s * 0.5, s * (0.8 + (k % 3) * 0.15), 0, PI2);
        g.fill();
      }
    });
  });
}
// periyodik sırt (w içinde tam tur sayısı → dikişsiz)
function ridgeW(g, w, h, base, amp, cycles, col, ph = 0) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const t = (x / w) * PI2;
    g.lineTo(x, base + Math.sin(t * cycles + ph) * amp + Math.sin(t * (cycles * 3 + 1) + ph * 2) * amp * 0.35);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}
function treeW(g, x, base, s, col) {
  g.fillStyle = col;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.moveTo(x, base - s * (1.1 + k * 0.55));
    g.lineTo(x - s * (0.55 - k * 0.1), base - s * k * 0.5);
    g.lineTo(x + s * (0.55 - k * 0.1), base - s * k * 0.5);
    g.closePath();
    g.fill();
  }
}
const MURAL = { mural: true, rough: 0.9 };
WALLS.push(
  { key: 'gokyuzu', name: 'Gökyüzü', swatch: '#5aa9ff', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = skyG(g, h, '#2f86e0', '#c4e8ff');
      g.fillRect(0, 0, w, h);
      cloudsW(g, w, h * 0.7, r, 9);
    } },
  { key: 'gunbatimi', name: 'Gün Batımı', swatch: '#d53a9d', ...MURAL,
    draw: (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2b1055');
      gr.addColorStop(0.55, '#d53a9d');
      gr.addColorStop(0.8, '#ff9a3c');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      wrapX(w, (ox) => {
        g.fillStyle = '#ffd23f';
        g.beginPath();
        g.arc(ox + w * 0.62, h * 0.74, 80, 0, PI2);
        g.fill();
      });
      ridgeW(g, w, h, h * 0.78, 22, 3, '#3b1450', 0.4);
    } },
  { key: 'gece', name: 'Yıldızlı Gece', swatch: '#1d2c62', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = skyG(g, h, '#060a22', '#1d2c62');
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) {
        g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
        g.beginPath();
        g.arc(r() * w, r() * h * 0.85, r() * 1.8 + 0.3, 0, PI2);
        g.fill();
      }
      wrapX(w, (ox) => {
        g.fillStyle = '#fff4cf';
        g.beginPath();
        g.arc(ox + w * 0.76, 110, 44, 0, PI2);
        g.fill();
        g.fillStyle = '#0a1030';
        g.beginPath();
        g.arc(ox + w * 0.76 + 18, 98, 40, 0, PI2);
        g.fill();
      });
      ridgeW(g, w, h, h * 0.86, 18, 2, '#0b1238', 1.1);
    } },
  { key: 'deniz', name: 'Deniz', swatch: '#1478c2', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = skyG(g, h * 0.6, '#3fa9ff', '#d2efff');
      g.fillRect(0, 0, w, h * 0.6);
      cloudsW(g, w, h * 0.32, r, 6);
      const sea = g.createLinearGradient(0, h * 0.6, 0, h);
      sea.addColorStop(0, '#1478c2');
      sea.addColorStop(1, '#0a4a80');
      g.fillStyle = sea;
      g.fillRect(0, h * 0.6, w, h * 0.4);
      const waves = [];
      for (let i = 0; i < 90; i++) waves.push([r() * w, h * 0.62 + r() * h * 0.38]);
      wrapX(w, (ox) => {
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.lineWidth = 3;
        waves.forEach(([a, b]) => {
          const s = 6 + (b - h * 0.6) * 0.06;
          g.beginPath();
          g.arc(ox + a, b, s, Math.PI * 1.15, Math.PI * 1.85);
          g.stroke();
        });
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(ox + 300, h * 0.6 + 6);
        g.lineTo(ox + 300, h * 0.6 - 60);
        g.lineTo(ox + 340, h * 0.6 + 6);
        g.fill();
        g.fillStyle = '#7a4a24';
        g.fillRect(ox + 282, h * 0.6 + 6, 70, 10);
      });
    } },
  { key: 'neon_sehir', name: 'Neon Şehir', swatch: '#43106a', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = skyG(g, h, '#120a2e', '#43106a');
      g.fillRect(0, 0, w, h);
      const bs = [];
      for (let a = 0; a < w; ) {
        const bw = 50 + r() * 90;
        bs.push([a, bw, 160 + r() * 260]);
        a += bw + 4;
      }
      const sc = w / (bs[bs.length - 1][0] + bs[bs.length - 1][1] + 4);
      wrapX(w, (ox) => {
        bs.forEach(([a, bw, bh], i) => {
          const x = ox + a * sc;
          const ww = bw * sc;
          g.fillStyle = ['#1a1238', '#211646', '#160f30'][i % 3];
          g.fillRect(x, h - bh, ww, bh);
          for (let wy = h - bh + 14; wy < h - 10; wy += 22)
            for (let wx = x + 8; wx < x + ww - 10; wx += 16)
              if (((wx * 7 + wy * 13) | 0) % 5 < 2) {
                g.fillStyle = ['#3df5c4', '#ff2e5a', '#ffd23f', '#7aa7ff', '#ffffff'][((wx + wy) | 0) % 5];
                g.globalAlpha = 0.75;
                g.fillRect(wx, wy, 8, 10);
                g.globalAlpha = 1;
              }
        });
      });
      g.font = '900 64px Arial Black, Arial';
      g.textAlign = 'center';
      g.shadowBlur = 24;
      g.shadowColor = '#ff2e5a';
      g.fillStyle = '#ff2e5a';
      g.fillText('NEON', w * 0.25, 150);
      g.shadowColor = '#3df5c4';
      g.fillStyle = '#3df5c4';
      g.fillText('ŞEHİR', w * 0.72, 210);
      g.shadowBlur = 0;
    } },
  { key: 'uzanan_yol', name: 'Uzanan Yol', swatch: '#7cb85a', ...MURAL,
    draw: (g, w, h, r) => {
      const hz = h * 0.48;
      g.fillStyle = skyG(g, hz, '#4aa8ff', '#e1f3ff');
      g.fillRect(0, 0, w, hz);
      cloudsW(g, w, hz * 0.55, r, 5);
      g.fillStyle = '#7cb85a';
      g.fillRect(0, hz, w, h - hz);
      for (const cx of [w * 0.25, w * 0.75]) {
        g.fillStyle = '#41454c';
        g.beginPath();
        g.moveTo(cx - 8, hz);
        g.lineTo(cx + 8, hz);
        g.lineTo(cx + 200, h);
        g.lineTo(cx - 200, h);
        g.closePath();
        g.fill();
        g.fillStyle = '#ffd23f';
        for (let k = 0; k < 9; k++) {
          const t0 = k / 9;
          const t1 = t0 + 0.05;
          const y0 = hz + (h - hz) * t0 * t0;
          const y1 = hz + (h - hz) * t1 * t1;
          const w0 = 2 + t0 * 12;
          const w1 = 2 + t1 * 12;
          g.beginPath();
          g.moveTo(cx - w0 / 2, y0); g.lineTo(cx + w0 / 2, y0); g.lineTo(cx + w1 / 2, y1); g.lineTo(cx - w1 / 2, y1);
          g.closePath();
          g.fill();
        }
      }
    } },
  { key: 'tarla_ufku', name: 'Tarla Ufku', swatch: '#e9c46a', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = skyG(g, h * 0.5, '#59b4ff', '#e8f6ff');
      g.fillRect(0, 0, w, h * 0.5);
      cloudsW(g, w, h * 0.3, r, 4);
      g.fillStyle = '#e9c46a';
      g.fillRect(0, h * 0.5, w, h * 0.5);
      g.strokeStyle = '#c99a3a';
      g.lineWidth = 3;
      for (let k = 0; k < 32; k++) {
        const x = (k / 32) * w;
        g.beginPath(); g.moveTo(x, h * 0.5); g.lineTo(x + (x - w / 2) * 0.6, h); g.stroke();
      }
      const bushes = [];
      for (let i = 0; i < 16; i++) bushes.push([r() * w, 14 + r() * 10]);
      wrapX(w, (ox) => {
        g.fillStyle = '#3f7a3a';
        bushes.forEach(([x, s]) => { g.beginPath(); g.arc(ox + x, h * 0.5 - 6, s, 0, PI2); g.fill(); });
        g.fillStyle = '#b22222';
        g.fillRect(ox + 800, h * 0.5 - 46, 70, 46);
        g.beginPath(); g.moveTo(ox + 792, h * 0.5 - 46); g.lineTo(ox + 835, h * 0.5 - 80); g.lineTo(ox + 878, h * 0.5 - 46); g.fill();
        g.fillStyle = '#fff';
        g.fillRect(ox + 826, h * 0.5 - 26, 18, 26);
      });
    } },
  { key: 'orman', name: 'Orman', swatch: '#2f6b4a', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = skyG(g, h, '#9fd8ff', '#e9f8ff');
      g.fillRect(0, 0, w, h);
      const layers = [[34, h * 0.68, 60, 40, '#6aa38a'], [26, h * 0.85, 110, 60, '#2f6b4a']];
      layers.forEach(([n, base, s0, s1, col], li) => {
        const list = [];
        for (let i = 0; i < n; i++) list.push([r() * w, s0 + r() * s1]);
        wrapX(w, (ox) => list.forEach(([x, s]) => treeW(g, ox + x, base, s, col)));
        if (li === 1) {
          g.fillStyle = '#3f8a50';
          g.fillRect(0, h * 0.85, w, h * 0.15);
        }
      });
      const front = [];
      for (let i = 0; i < 14; i++) front.push([r() * w, 160 + r() * 60]);
      wrapX(w, (ox) => front.forEach(([x, s]) => treeW(g, ox + x, h + 20, s, '#1d4d33')));
    } },
  { key: 'daglar', name: 'Dağlar', swatch: '#6a7ca3', ...MURAL,
    draw: (g, w, h) => {
      g.fillStyle = skyG(g, h, '#6ec0ff', '#e8f6ff');
      g.fillRect(0, 0, w, h);
      const mt = (ox, cx, bw, ph, col, snow) => {
        const base = h * 0.75;
        g.fillStyle = col;
        g.beginPath(); g.moveTo(ox + cx - bw, base); g.lineTo(ox + cx, base - ph); g.lineTo(ox + cx + bw, base); g.fill();
        if (snow) {
          g.fillStyle = '#fff';
          g.beginPath();
          g.moveTo(ox + cx, base - ph);
          g.lineTo(ox + cx - bw * 0.22, base - ph * 0.78);
          g.lineTo(ox + cx - bw * 0.08, base - ph * 0.82);
          g.lineTo(ox + cx + bw * 0.05, base - ph * 0.74);
          g.lineTo(ox + cx + bw * 0.22, base - ph * 0.78);
          g.fill();
        }
      };
      wrapX(w, (ox) => {
        mt(ox, 150, 260, 300, '#7d8fb3', 1);
        mt(ox, 560, 330, 360, '#6a7ca3', 1);
        mt(ox, 900, 260, 280, '#7d8fb3', 1);
        mt(ox, 360, 200, 180, '#5c6f96', 0);
      });
      ridgeW(g, w, h, h * 0.74, 20, 3, '#5aa84f', 0.2);
      g.fillStyle = '#4a9643';
      g.fillRect(0, h * 0.86, w, h * 0.14);
    } },
  { key: 'col', name: 'Çöl', swatch: '#dda05a', ...MURAL,
    draw: (g, w, h) => {
      g.fillStyle = skyG(g, h * 0.55, '#ffcf7a', '#fff1d1');
      g.fillRect(0, 0, w, h * 0.55);
      wrapX(w, (ox) => {
        g.fillStyle = '#fff4b0';
        g.beginPath(); g.arc(ox + 780, 130, 60, 0, PI2); g.fill();
      });
      ridgeW(g, w, h, h * 0.55, 26, 3, '#e9b872', 0.3);
      ridgeW(g, w, h, h * 0.68, 22, 4, '#dda05a', 1.4);
      ridgeW(g, w, h, h * 0.82, 18, 5, '#c98a45', 2.2);
      const cactus = (ox, cx, by, s) => {
        g.fillStyle = '#3e8a4a';
        g.fillRect(ox + cx - 8 * s, by - 110 * s, 16 * s, 110 * s);
        g.fillRect(ox + cx - 30 * s, by - 70 * s, 10 * s, 34 * s);
        g.fillRect(ox + cx - 30 * s, by - 46 * s, 26 * s, 10 * s);
        g.fillRect(ox + cx + 20 * s, by - 86 * s, 10 * s, 40 * s);
        g.fillRect(ox + cx + 4 * s, by - 56 * s, 26 * s, 10 * s);
      };
      wrapX(w, (ox) => {
        cactus(ox, 220, h * 0.86, 1.2);
        cactus(ox, 700, h * 0.76, 0.8);
      });
    } },
  { key: 'uzay', name: 'Uzay', swatch: '#05010f', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = '#05010f';
      g.fillRect(0, 0, w, h);
      wrapX(w, (ox) => {
        [['rgba(255,46,90,.35)', 250, 200, 260], ['rgba(90,169,255,.3)', 700, 300, 300], ['rgba(61,245,196,.2)', 520, 120, 200]].forEach(([c, cx, cy, rad]) => {
          const gr = g.createRadialGradient(ox + cx, cy, 0, ox + cx, cy, rad);
          gr.addColorStop(0, c);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(ox + cx - rad, cy - rad, rad * 2, rad * 2);
        });
      });
      for (let i = 0; i < 500; i++) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(r() * w, r() * h, r() * 1.6 + 0.2, 0, PI2);
        g.fill();
      }
      wrapX(w, (ox) => {
        g.fillStyle = '#ff9a3c';
        g.beginPath(); g.arc(ox + 780, 200, 70, 0, PI2); g.fill();
        g.fillStyle = '#ffb86b';
        g.beginPath(); g.arc(ox + 796, 188, 60, 0, PI2); g.fill();
        g.strokeStyle = '#ffe2b0';
        g.lineWidth = 6;
        g.beginPath(); g.ellipse(ox + 780, 200, 130, 28, -0.3, 0, PI2); g.stroke();
      });
    } },
  { key: 'grafiti', name: 'Grafiti', swatch: '#8d9196', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = '#8d9196';
      g.fillRect(0, 0, w, h);
      speck(g, w, h, r, 4000, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.1)'], 3);
      const arcs = [];
      for (let i = 0; i < 12; i++) arcs.push([r() * w, r() * h, 30 + r() * 60, r(), pickR(r, ['#3df5c4', '#ff2e5a', '#ffd23f', '#5aa9ff'])]);
      wrapX(w, (ox) => {
        arcs.forEach(([x, y, rad, k, col]) => {
          g.strokeStyle = col;
          g.lineWidth = 6;
          g.beginPath();
          g.arc(ox + x, y, rad, 0, Math.PI * (1 + k));
          g.stroke();
        });
      });
      g.lineJoin = 'round';
      g.font = '900 170px Arial Black, Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 24;
      g.strokeStyle = '#111';
      g.strokeText('NEON', w * 0.3, h * 0.55);
      const gr = g.createLinearGradient(0, h * 0.35, 0, h * 0.75);
      gr.addColorStop(0, '#ff2e5a');
      gr.addColorStop(1, '#ffd23f');
      g.fillStyle = gr;
      g.fillText('NEON', w * 0.3, h * 0.55);
      g.font = '900 120px Arial Black, Arial';
      g.strokeText('CİTY', w * 0.78, h * 0.42);
      g.fillStyle = '#3df5c4';
      g.fillText('CİTY', w * 0.78, h * 0.42);
    } },
  { key: 'beton_blok', name: 'Beton Blok', swatch: '#9aa1a7', rough: 0.9, rep: 3,
    draw: (g, w, h, r) => {
      g.fillStyle = '#71777d';
      g.fillRect(0, 0, w, h);
      for (let y = 0, row = 0; y < h; y += 64, row++)
        for (let a = (row % 2) * -64; a < w; a += 128) {
          g.fillStyle = pickR(r, ['#9aa1a7', '#929aa0', '#a3a9ae']);
          g.fillRect(a + 3, y + 3, 122, 58);
        }
      speck(g, w, h, r, 3000, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.12)'], 3);
    } },
  { key: 'kogus', name: 'Koğuş Duvarı', swatch: '#6f8f7a', ...MURAL,
    draw: (g, w, h, r) => {
      g.fillStyle = '#e6e4d8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#6f8f7a';
      g.fillRect(0, h * 0.62, w, h * 0.38);
      g.fillStyle = '#3d5a48';
      g.fillRect(0, h * 0.62 - 8, w, 10);
      speck(g, w, h, r, 3000, ['rgba(60,50,30,.12)', 'rgba(0,0,0,.08)'], 4);
    } },
  { key: 'sabika', name: 'Sabıka Boy Cetveli', swatch: '#e9ecef', ...MURAL,
    draw: (g, w, h) => {
      // duvar 3,4 m: her çizgi 10 cm, her 50 cm'de etiket
      g.fillStyle = '#e9ecef';
      g.fillRect(0, 0, w, h);
      const px = h / 340;
      g.strokeStyle = '#2b2d33';
      g.fillStyle = '#2b2d33';
      g.font = 'bold 18px Arial';
      for (let cm = 0; cm <= 340; cm += 10) {
        const y = h - cm * px;
        g.lineWidth = cm % 50 ? 1.5 : 4;
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        if (cm % 50 === 0 && cm > 0 && cm < 340) for (const x of [12, w / 2 - 20, w - 70]) g.fillText(`${cm} cm`, x, y - 6);
      }
    } },
  { key: 'akustik', name: 'Akustik Sünger', swatch: '#2c2f37', rough: 0.98, rep: 1.4,
    draw: (g, w, h) => {
      g.fillStyle = '#1e2026';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 64)
        for (let j = 0; j < h; j += 64) {
          const f = ((i + j) / 64) % 2;
          const gr = f ? g.createLinearGradient(i, j, i + 64, j) : g.createLinearGradient(i, j, i, j + 64);
          gr.addColorStop(0, '#4a4e59');
          gr.addColorStop(0.5, '#2c2f37');
          gr.addColorStop(1, '#15171c');
          g.fillStyle = gr;
          g.fillRect(i + 2, j + 2, 60, 60);
        }
    } },
  { key: 'yesil_perde', name: 'Yeşil Perde', swatch: '#19c24b', rough: 0.95, rep: 3,
    draw: (g, w, h) => {
      g.fillStyle = '#19c24b';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,.05)';
      for (let a = 0; a < w; a += 128) g.fillRect(a, 0, 3, h);
    } }
);
// mural doku boyutu
WALLS.forEach((w) => {
  if (w.mural) {
    w.tw = 1024;
    w.th = 512;
  }
});

// v66: fiyatlar sunucuyla ortak listeden (functions/houseCatalogData.js)
FLOORS.forEach((f) => { f.price = surfacePrice('floor', f.key); });
WALLS.forEach((w) => { w.price = surfacePrice('wall', w.key); });

export function floorDef(key) {
  return FLOORS.find((f) => f.key === key) || FLOORS[0];
}
export function wallDef(key) {
  return WALLS.find((f) => f.key === key) || WALLS[0];
}

// Zemin/duvar dokusunu döndürür; her çağrıda klonlanır ki tekrar sayısı
// (repeat) yüzeyin boyutuna göre ayrı ayarlanabilsin.
export function surfaceTexture(def, repX, repY) {
  const base = makeTex(`s_${def.key}`, def.tw || 512, def.th || 512, (g, w, h, r) => def.draw(g, w, h, r));
  const t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(repX, repY);
  return t;
}

// Gece şehir manzarası (pencereler için) — neon ışıklı binalar.
export function cityTexture() {
  return makeTex('city', 512, 320, (g, w, h, r) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#05060f');
    sky.addColorStop(0.6, '#1a0f2e');
    sky.addColorStop(1, '#3a1633');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.7})`;
      g.fillRect(r() * w, r() * h * 0.4, 1.5, 1.5);
    }
    g.fillStyle = 'rgba(255,240,210,.9)';
    g.beginPath(); g.arc(w * 0.8, h * 0.18, 16, 0, 7); g.fill();
    for (let layer = 0; layer < 2; layer++) {
      let x = -10;
      while (x < w) {
        const bw = 26 + r() * 50;
        const bh = (layer ? 80 : 130) + r() * (layer ? 90 : 150);
        g.fillStyle = layer ? '#0b0b16' : '#141226';
        g.fillRect(x, h - bh, bw, bh);
        for (let yy = h - bh + 8; yy < h - 6; yy += 10) {
          for (let xx = x + 4; xx < x + bw - 4; xx += 8) {
            if (r() > 0.55) {
              g.fillStyle = r() > 0.85 ? '#ff5fb0' : r() > 0.7 ? '#19e8ff' : '#ffd98a';
              g.globalAlpha = 0.5 + r() * 0.5;
              g.fillRect(xx, yy, 4, 5);
            }
          }
        }
        g.globalAlpha = 1;
        if (r() > 0.7) {
          g.fillStyle = r() > 0.5 ? '#ff2d8a' : '#19e8ff';
          g.shadowColor = g.fillStyle;
          g.shadowBlur = 10;
          g.fillRect(x + 4, h - bh - 4, bw - 8, 3);
          g.shadowBlur = 0;
        }
        x += bw + 2;
      }
    }
  });
}

// Tek seferlik canvas dokusu (tabela, plaka, ekran vb.) — önbelleğe alınır.
export function labelTexture(key, w, h, draw) {
  return makeTex(`l_${key}`, w, h, (g, ww, hh, r) => draw(g, ww, hh, r));
}

// ---------------------------------------------------------------------------
// v92 — Manzaralı pencereler (512×320). Her manzara kendi çizimi; önbellekli.
// ---------------------------------------------------------------------------
function skyGrad(g, h, stops) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
function cloud(g, x, y, s, col = 'rgba(255,255,255,0.92)') {
  g.fillStyle = col;
  [[0, 0, 1], [0.9, 0.12, 0.8], [-0.9, 0.15, 0.75], [0.4, -0.45, 0.85], [-0.4, -0.35, 0.7]].forEach(([dx, dy, k]) => {
    g.beginPath();
    g.arc(x + dx * s, y + dy * s, s * k, 0, Math.PI * 2);
    g.fill();
  });
}
function ridge(g, w, h, base, amp, freq, col, r, seed = 0) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const y = base + Math.sin(x / freq + seed) * amp + Math.sin(x / (freq * 0.37) + seed * 2) * amp * 0.45 + (r ? (r() - 0.5) * amp * 0.15 : 0);
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}
function pine(g, x, base, s, col) {
  g.fillStyle = col;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.moveTo(x, base - s * (1.15 + k * 0.5));
    g.lineTo(x - s * (0.55 - k * 0.12), base - s * k * 0.45);
    g.lineTo(x + s * (0.55 - k * 0.12), base - s * k * 0.45);
    g.closePath();
    g.fill();
  }
  g.fillRect(x - s * 0.07, base - s * 0.05, s * 0.14, s * 0.3);
}

const VIEW_DRAW = {
  // Gün batımında uzun yol: turuncu-mor gök, ufukta güneş, ufka uzanan şeritli yol
  yol(g, w, h, r) {
    const cx = w * 0.3; // orta kayıt çıtası yolu kapatmasın
    g.fillStyle = skyGrad(g, h, [[0, '#2a1450'], [0.38, '#c0367a'], [0.6, '#ff8a3d'], [0.66, '#ffcf6a']]);
    g.fillRect(0, 0, w, h);
    const hz = h * 0.62;
    const sun = g.createRadialGradient(cx, hz - 6, 4, cx, hz - 6, 70);
    sun.addColorStop(0, '#fff4c2');
    sun.addColorStop(0.35, '#ffd25a');
    sun.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe28a';
    g.beginPath();
    g.arc(cx, hz - 4, 34, Math.PI, 0);
    g.fill();
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(42,20,80,0.55)';
      g.fillRect(cx - 40, hz - 10 - i * 7, 80, 2);
    }
    ridge(g, w, h, hz - 8, 14, 60, '#5a1e5c', r, 1.3);
    ridge(g, w, h, hz, 6, 90, '#3a1240', r, 2.1);
    g.fillStyle = '#26102e';
    g.fillRect(0, hz, w, h - hz);
    // yol
    g.fillStyle = '#17121c';
    g.beginPath();
    g.moveTo(cx - 6, hz);
    g.lineTo(cx + 6, hz);
    g.lineTo(w * 0.9, h);
    g.lineTo(w * 0.1, h);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,170,90,0.55)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 6, hz); g.lineTo(w * 0.1, h); g.stroke();
    g.beginPath(); g.moveTo(cx + 6, hz); g.lineTo(w * 0.9, h); g.stroke();
    g.fillStyle = '#ffd23f';
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8 + 0.02;
      const t1 = t0 + 0.055;
      const y0 = hz + (h - hz) * t0 * t0;
      const y1 = hz + (h - hz) * t1 * t1;
      const w0 = 1 + t0 * 9;
      const w1 = 1 + t1 * 9;
      g.beginPath();
      g.moveTo(cx - w0 / 2, y0); g.lineTo(cx + w0 / 2, y0);
      g.lineTo(cx + w1 / 2, y1); g.lineTo(cx - w1 / 2, y1);
      g.closePath();
      g.fill();
    }
    // palmiye siluetleri
    const palmS = (x, base, s) => {
      g.strokeStyle = '#140a18';
      g.lineWidth = s * 0.08;
      g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + s * 0.15, base - s * 0.6, x + s * 0.05, base - s); g.stroke();
      g.fillStyle = '#140a18';
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        g.beginPath();
        g.ellipse(x + s * 0.05 + Math.cos(a) * s * 0.28, base - s + Math.sin(a) * s * 0.12 + 4, s * 0.3, s * 0.06, a, 0, Math.PI * 2);
        g.fill();
      }
    };
    palmS(w * 0.08, h, 150);
    palmS(w * 0.92, h, 130);
    palmS(w * 0.24, hz + 26, 60);
  },
  // Gündüz şehir manzarası
  sehir(g, w, h, r) {
    g.fillStyle = skyGrad(g, h, [[0, '#3d8fe6'], [0.7, '#bfe3ff'], [1, '#e6f4ff']]);
    g.fillRect(0, 0, w, h);
    cloud(g, 90, 60, 22);
    cloud(g, 330, 40, 18);
    cloud(g, 450, 90, 14);
    for (let layer = 0; layer < 2; layer++) {
      let x = -10;
      while (x < w) {
        const bw = 30 + r() * 46;
        const bh = (layer ? 120 : 70) + r() * (layer ? 120 : 110);
        const tone = layer ? ['#6f8db3', '#7d9cc2', '#5d7aa2', '#8aa7c9'] : ['#a9bfd9', '#b7cbe2', '#9fb6d2'];
        g.fillStyle = tone[Math.floor(r() * tone.length)];
        g.fillRect(x, h - bh, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x, h - bh, bw * 0.3, bh);
        g.fillStyle = 'rgba(30,50,90,0.25)';
        for (let yy = h - bh + 6; yy < h - 4; yy += 9) for (let xx = x + 4; xx < x + bw - 4; xx += 7) if (r() > 0.35) g.fillRect(xx, yy, 4, 5);
        if (layer && r() > 0.75) {
          g.fillStyle = '#4a6286';
          g.fillRect(x + bw / 2 - 1, h - bh - 18, 2, 18);
        }
        x += bw + 3;
      }
    }
    g.fillStyle = '#3f6b3a';
    g.fillRect(0, h - 8, w, 8);
  },
  // Deniz: açık gök, martılar, yelkenli, kumsal
  deniz(g, w, h, r) {
    const hz = h * 0.55;
    g.fillStyle = skyGrad(g, hz, [[0, '#2f8fe8'], [1, '#cdeeff']]);
    g.fillRect(0, 0, w, hz);
    cloud(g, 120, 50, 18);
    cloud(g, 400, 70, 22);
    g.fillStyle = '#fffbe0';
    g.beginPath(); g.arc(w * 0.78, 48, 20, 0, Math.PI * 2); g.fill();
    const sea = g.createLinearGradient(0, hz, 0, h);
    sea.addColorStop(0, '#1d86c9');
    sea.addColorStop(1, '#0a5a96');
    g.fillStyle = sea;
    g.fillRect(0, hz, w, h - hz);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      const y = hz + 6 + r() * (h - hz - 40);
      const x = r() * w;
      const s = 4 + (y - hz) * 0.06;
      g.beginPath(); g.arc(x, y, s, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
    // yelkenli
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(170, hz + 12); g.lineTo(170, hz - 34); g.lineTo(196, hz + 12); g.closePath(); g.fill();
    g.fillStyle = '#ff5a3d';
    g.beginPath(); g.moveTo(167, hz + 12); g.lineTo(167, hz - 24); g.lineTo(150, hz + 12); g.closePath(); g.fill();
    g.fillStyle = '#6a3a1c';
    g.fillRect(150, hz + 12, 50, 6);
    // martılar
    g.strokeStyle = '#2a3340';
    g.lineWidth = 2;
    [[260, 60], [290, 76], [230, 84]].forEach(([x, y]) => {
      g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x - 4, y - 6, x, y); g.quadraticCurveTo(x + 4, y - 6, x + 8, y); g.stroke();
    });
    // kumsal
    g.fillStyle = '#efd49a';
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, h - 30); g.quadraticCurveTo(w * 0.4, h - 52, w, h - 22); g.lineTo(w, h); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, h - 32); g.quadraticCurveTo(w * 0.4, h - 54, w, h - 24); g.stroke();
  },
  // Orman: sabah sisi, katmanlı çam ağaçları
  orman(g, w, h, r) {
    g.fillStyle = skyGrad(g, h, [[0, '#8fd0ff'], [0.6, '#e4f6ff'], [1, '#f2fbff']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,250,220,0.85)';
    g.beginPath(); g.arc(w * 0.2, 56, 24, 0, Math.PI * 2); g.fill();
    ridge(g, w, h, h * 0.5, 16, 70, '#a7c9b7', r, 0.4);
    for (let i = 0; i < 26; i++) pine(g, r() * w, h * 0.62, 34 + r() * 16, '#77a58d');
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, h * 0.58, w, 24);
    for (let i = 0; i < 20; i++) pine(g, r() * w, h * 0.8, 60 + r() * 26, '#3e7a56');
    g.fillStyle = '#2f6a45';
    g.fillRect(0, h * 0.8, w, h * 0.2);
    for (let i = 0; i < 9; i++) pine(g, (i + r() * 0.5) * (w / 8), h + 14, 100 + r() * 40, '#1e4f33');
  },
  // Karlı dağlar ve göl
  dag(g, w, h, r) {
    g.fillStyle = skyGrad(g, h, [[0, '#5aa8ec'], [0.7, '#d9efff']]);
    g.fillRect(0, 0, w, h);
    cloud(g, 400, 50, 16, 'rgba(255,255,255,0.8)');
    const peak = (cx, bw, ph, col) => {
      const base = h * 0.66;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(cx - bw, base); g.lineTo(cx, base - ph); g.lineTo(cx + bw, base); g.closePath(); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(cx, base - ph);
      g.lineTo(cx - bw * 0.26, base - ph * 0.72);
      g.lineTo(cx - bw * 0.1, base - ph * 0.78);
      g.lineTo(cx + bw * 0.06, base - ph * 0.68);
      g.lineTo(cx + bw * 0.26, base - ph * 0.74);
      g.closePath();
      g.fill();
    };
    peak(110, 170, 160, '#7487ad');
    peak(330, 200, 200, '#63759c');
    peak(480, 140, 130, '#7487ad');
    ridge(g, w, h, h * 0.64, 8, 40, '#3e7a4a', r, 0.7);
    for (let i = 0; i < 24; i++) pine(g, r() * w, h * 0.7, 16 + r() * 8, '#2a5a38');
    const lake = g.createLinearGradient(0, h * 0.7, 0, h);
    lake.addColorStop(0, '#5e8fc4');
    lake.addColorStop(1, '#2d5a8a');
    g.fillStyle = lake;
    g.fillRect(0, h * 0.7, w, h * 0.3);
    g.globalAlpha = 0.25;
    g.save();
    g.translate(0, h * 1.4);
    g.scale(1, -0.55);
    peak(330, 200, 200, '#ffffff');
    g.restore();
    g.globalAlpha = 1;
  },
  // Kuzey ışıkları: gece, karlı ova, yeşil-mor aurora
  kuzey(g, w, h, r) {
    g.fillStyle = skyGrad(g, h, [[0, '#040818'], [0.7, '#0f2440'], [1, '#1d3a5a']]);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      g.fillRect(r() * w, r() * h * 0.7, 1.4, 1.4);
    }
    [['rgba(61,245,160,0.55)', 90, 0.0], ['rgba(120,255,200,0.4)', 120, 1.6], ['rgba(180,90,255,0.35)', 70, 3.1]].forEach(([c, y0, ph]) => {
      for (let x = 0; x < w; x += 2) {
        const y = y0 + Math.sin(x / 60 + ph) * 26 + Math.sin(x / 23 + ph) * 8;
        const gr = g.createLinearGradient(0, y - 70, 0, y);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(1, c);
        g.fillStyle = gr;
        g.fillRect(x, y - 70, 2, 74);
      }
    });
    ridge(g, w, h, h * 0.74, 10, 80, '#cfe2f5', r, 0.3);
    g.fillStyle = '#e8f3ff';
    g.fillRect(0, h * 0.82, w, h * 0.18);
    for (let i = 0; i < 12; i++) pine(g, r() * w, h * 0.84, 22 + r() * 14, '#0d1c2c');
    // kulübe
    g.fillStyle = '#3a2216';
    g.fillRect(360, h * 0.84 - 26, 40, 26);
    g.fillStyle = '#e8f3ff';
    g.beginPath(); g.moveTo(354, h * 0.84 - 26); g.lineTo(380, h * 0.84 - 46); g.lineTo(406, h * 0.84 - 26); g.closePath(); g.fill();
    g.fillStyle = '#ffcf6a';
    g.fillRect(372, h * 0.84 - 18, 10, 9);
  },
  // Boğaz: akşam üstü, köprü ve kubbe siluetleri
  bogaz(g, w, h, r) {
    g.fillStyle = skyGrad(g, h, [[0, '#2b2d6e'], [0.45, '#d4577a'], [0.7, '#ffb26b']]);
    g.fillRect(0, 0, w, h);
    const hz = h * 0.68;
    // tepeler + kubbeler
    g.fillStyle = '#2a1a3a';
    ridge(g, w, h, hz - 10, 8, 70, '#3a2240', r, 1.1);
    g.fillStyle = '#25152f';
    [[70, 26], [130, 18], [430, 22]].forEach(([x, rr2]) => {
      g.beginPath(); g.arc(x, hz - 16, rr2, Math.PI, 0); g.fill();
      g.fillRect(x - rr2, hz - 16, rr2 * 2, 16);
    });
    [[36, 70], [104, 64], [160, 58], [400, 66], [462, 60]].forEach(([x, hh]) => {
      g.fillRect(x - 3, hz - hh, 6, hh);
      g.beginPath(); g.moveTo(x - 4, hz - hh); g.lineTo(x, hz - hh - 14); g.lineTo(x + 4, hz - hh); g.fill();
    });
    // köprü
    g.strokeStyle = '#1a1024';
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(200, hz - 4); g.lineTo(200, hz - 92); g.stroke();
    g.beginPath(); g.moveTo(360, hz - 4); g.lineTo(360, hz - 92); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(170, hz - 26); g.lineTo(390, hz - 26); g.stroke();
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(150, hz - 30); g.quadraticCurveTo(200, hz - 92, 200, hz - 92); g.quadraticCurveTo(280, hz - 30, 360, hz - 92); g.quadraticCurveTo(360, hz - 92, 410, hz - 30); g.stroke();
    g.fillStyle = '#ffd98a';
    for (let x = 176; x < 386; x += 12) g.fillRect(x, hz - 29, 3, 3);
    const sea = g.createLinearGradient(0, hz, 0, h);
    sea.addColorStop(0, '#d06c7a');
    sea.addColorStop(1, '#3a2a5a');
    g.fillStyle = sea;
    g.fillRect(0, hz, w, h - hz);
    g.strokeStyle = 'rgba(255,210,150,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      const y = hz + 6 + r() * (h - hz - 10);
      const x = r() * w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + r() * 16, y); g.stroke();
    }
    // vapur
    g.fillStyle = '#f2f2f2';
    g.fillRect(250, hz + 30, 56, 10);
    g.fillStyle = '#1a1024';
    g.fillRect(256, hz + 22, 40, 8);
    g.fillStyle = '#ffcf6a';
    for (let x = 260; x < 296; x += 7) g.fillRect(x, hz + 24, 3, 3);
  },
  // Uzay: gezegen ve yıldız bulutu
  uzay(g, w, h, r) {
    g.fillStyle = '#05010f';
    g.fillRect(0, 0, w, h);
    [['rgba(255,46,90,0.35)', 120, 120, 180], ['rgba(90,169,255,0.32)', 380, 220, 200], ['rgba(61,245,196,0.18)', 260, 80, 140]].forEach(([c, x, y, rad]) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, c);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    const pl = g.createRadialGradient(360, 150, 10, 380, 170, 74);
    pl.addColorStop(0, '#ffd08a');
    pl.addColorStop(0.7, '#e0703a');
    pl.addColorStop(1, '#5a1e10');
    g.fillStyle = pl;
    g.beginPath(); g.arc(380, 170, 70, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,226,176,0.8)';
    g.lineWidth = 5;
    g.beginPath(); g.ellipse(380, 170, 128, 26, -0.3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d9dde6';
    g.beginPath(); g.arc(90, 250, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    [[82, 244, 6], [100, 258, 4], [88, 262, 3]].forEach(([x, y, rr2]) => { g.beginPath(); g.arc(x, y, rr2, 0, Math.PI * 2); g.fill(); });
  },
};

export const WINDOW_VIEWS = {
  yol: { light: '#ff8a5a' },
  sehir: { light: '#bfe3ff' },
  deniz: { light: '#9fd6ff' },
  orman: { light: '#d8f5c8' },
  dag: { light: '#d9efff' },
  kuzey: { light: '#6affc4' },
  bogaz: { light: '#ffb26b' },
  uzay: { light: '#8a7aff' },
};
export function viewTexture(kind) {
  return makeTex(`view_${kind}`, 512, 320, (g, w, h, r) => (VIEW_DRAW[kind] || VIEW_DRAW.sehir)(g, w, h, r));
}
