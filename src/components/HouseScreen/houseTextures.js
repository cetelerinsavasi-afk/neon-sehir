import * as THREE from 'three';

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
];

export function floorDef(key) {
  return FLOORS.find((f) => f.key === key) || FLOORS[0];
}
export function wallDef(key) {
  return WALLS.find((f) => f.key === key) || WALLS[0];
}

// Zemin/duvar dokusunu döndürür; her çağrıda klonlanır ki tekrar sayısı
// (repeat) yüzeyin boyutuna göre ayrı ayarlanabilsin.
export function surfaceTexture(def, repX, repY) {
  const base = makeTex(`s_${def.key}`, 512, 512, (g, w, h, r) => def.draw(g, w, h, r));
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
