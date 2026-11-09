// =============================================================================
// SADECE ÖNİZLEME — Gezilebilir Neon Şehir prototipi: yapı kiti.
// Oyunun kendi eşya kataloğu (buildItem), malzemeleri (M) ve zemin/duvar
// dokularıyla (houseTextures) çalışır; oyun koduna dokunmaz, sadece içe aktarır.
// Yerel koordinat: bina önü +z, köken parsel merkezi.
// =============================================================================
import * as THREE from 'three';
// v147.1: telefonda doku süzgeci hafif (bellek + hız)
const ANISO = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '') ? 2 : 8;
import { M, buildItem, itemBoxes, CATALOG_MAP } from '../HouseScreen/houseCatalog.js';
import { floorDef, wallDef, surfaceTexture } from '../HouseScreen/houseTextures.js';

export { M, THREE };
export const V3 = THREE.Vector3;

// --- doku / malzeme önbelleği -------------------------------------------------
const texCache = new Map();
export function canvasTex(key, w, h, draw, { repeat = true, srgb = true } = {}) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h, rng(hash(key)));
  t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  texCache.set(key, t);
  return t;
}
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rng(seed) {
  let s = seed || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const matCache = new Map();
function cached(key, make) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}
// Oyunun zemin dokusu (kaldırım, asfalt, çim, mermer…) — dünya ölçekli UV ile paylaşılır
export function floorMat(key) {
  return cached(`f:${key}`, () => {
    const def = floorDef(key);
    const map = surfaceTexture(def, 1, 1);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map, roughness: def.rough ?? 0.8, metalness: 0 });
  });
}
export function floorRep(key) {
  return floorDef(key).rep || 2.5;
}
// Oyunun duvar dokusu (mermer kaplama, tuğla, brüt beton…)
export function wallMat(key, tint) {
  return cached(`w:${key}:${tint || ''}`, () => {
    const def = wallDef(key);
    const map = surfaceTexture(def, 1, 1);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map, roughness: def.rough ?? 0.85, color: tint || '#ffffff' });
  });
}
export function wallRep(key) {
  return wallDef(key).rep || 3;
}
export function glowMat(color, intensity = 2.2) {
  return cached(`g:${color}:${intensity}`, () => new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
}
export function basicGlow(color) {
  return cached(`bg:${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
}
export const GLASS = () => cached('glass', () => new THREE.MeshStandardMaterial({ color: '#8fb8cc', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
export const DARKGLASS = () => cached('dglass', () => new THREE.MeshStandardMaterial({ color: '#0e1a24', roughness: 0.08, metalness: 0.6 }));

// UV'si boyuta göre ölçeklenmiş kutu (tek malzeme → birleştirilebilir)
export function boxGeo(w, h, d, rep = 1, ou = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (a / rep) + ou, uv.getY(i) * (b / rep));
    }
  }
  return g;
}
export function planeGeo(w, h, su = 1, sv = 1, ou = 0, ov = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  return g;
}

// --- yazılı tabelalar (neon / pano) ---------------------------------------------
export function textCanvasTex(key, text, { font = '900 120px "Arial Black", Arial, sans-serif', color = '#fff', glow = null, bg = null, pad = 40, stroke = null, h = 180, border = null } = {}) {
  const ck = `txt:${key}`;
  if (txtCache.has(ck)) return txtCache.get(ck);
  const made = (() => {
    const c0 = document.createElement('canvas').getContext('2d');
    c0.font = font;
    const tw = Math.ceil(c0.measureText(text).width) + pad * 2;
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = h;
    const g = c.getContext('2d');
    if (bg) {
      g.fillStyle = bg;
      roundRect(g, 4, 4, tw - 8, h - 8, 22);
      g.fill();
    }
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 6;
      g.shadowColor = border;
      g.shadowBlur = 18;
      roundRect(g, 8, 8, tw - 16, h - 16, 20);
      g.stroke();
      g.shadowBlur = 0;
    }
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (glow) {
      g.shadowColor = glow;
      for (const b of [40, 22, 10]) {
        g.shadowBlur = b;
        g.fillStyle = glow;
        g.fillText(text, tw / 2, h / 2 + 4);
      }
      g.shadowBlur = 0;
    }
    if (stroke) {
      g.lineWidth = 8;
      g.strokeStyle = stroke;
      g.strokeText(text, tw / 2, h / 2 + 4);
    }
    g.fillStyle = color;
    g.fillText(text, tw / 2, h / 2 + 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    t.userData.aspect = tw / h;
    return t;
  })();
  txtCache.set(ck, made);
  return made;
}
const txtCache = new Map();
export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// --- cephe (pencere ızgarası) dokuları ------------------------------------------
// 8 sütun × 8 kat; hücre = 2.2 m × 3.2 m → döşeme 17.6 m × 25.6 m
export const FACADE_TILE = { w: 17.6, h: 25.6 };
const FACADES = {
  apt_warm: { wall: '#2a2530', frame: '#3a3440', glass: '#10131c', lit: ['#ffd38a', '#ffc46b', '#ffe4b0', '#fff1d6'], p: 0.42, sill: '#4a4250' },
  apt_cool: { wall: '#262a33', frame: '#353b47', glass: '#0d1119', lit: ['#bfe3ff', '#ffe2b0', '#d9f0ff', '#ffd38a'], p: 0.36, sill: '#444b57' },
  office: { wall: '#1a1f2a', frame: '#2b3242', glass: '#0b1220', lit: ['#cfe8ff', '#a9d6ff', '#e9f4ff'], p: 0.3, band: true },
  glass_cyan: { wall: '#0b2230', frame: '#1a4458', glass: '#0b2a3a', lit: ['#4fe3ff', '#8ef0ff', '#bff7ff', '#2bd2f5'], p: 0.62, band: true },
  brick: { wall: '#4a2a22', frame: '#3a2019', glass: '#120c0c', lit: ['#ffbe70', '#ffd08a', '#ffa860'], p: 0.45, sill: '#6a4032' },
  purple: { wall: '#211833', frame: '#33264d', glass: '#100a1c', lit: ['#ff7ad9', '#c58bff', '#ffd38a', '#8ad8ff'], p: 0.4 },
};
function facadeDraw(style, emissive) {
  const F = FACADES[style];
  return (g, w, h) => {
    const r = rng(hash(`facade-${style}`));
    const cw = w / 8;
    const ch = h / 8;
    g.fillStyle = emissive ? '#000' : F.wall;
    g.fillRect(0, 0, w, h);
    // hafif doku (rastgele sıra iki çizimde aynı kalsın diye her zaman tüketilir)
    for (let i = 0; i < 900; i++) {
      const a = r() * 0.035;
      const px = r() * w;
      const py = r() * h;
      if (!emissive) {
        g.fillStyle = `rgba(255,255,255,${a})`;
        g.fillRect(px, py, 2, 2);
      }
    }
    for (let fy = 0; fy < 8; fy++) {
      if (F.band && !emissive) {
        g.fillStyle = F.frame;
        g.fillRect(0, fy * ch + ch - 6, w, 6);
      }
      for (let fx = 0; fx < 8; fx++) {
        const x = fx * cw + (F.band ? 3 : 10);
        const y = fy * ch + (F.band ? 6 : 12);
        const ww = cw - (F.band ? 6 : 20);
        const hh = ch - (F.band ? 14 : 26);
        const lit = r() < F.p;
        const col = F.lit[Math.floor(r() * F.lit.length)];
        const dim = 0.55 + r() * 0.45;
        const curtain = r() < 0.35;
        if (emissive) {
          if (lit) {
            g.globalAlpha = dim;
            g.fillStyle = col;
            g.fillRect(x, y, ww, hh);
            if (curtain) {
              g.fillStyle = 'rgba(0,0,0,0.45)';
              g.fillRect(x, y, ww * 0.35, hh);
            }
            g.globalAlpha = 1;
          }
        } else {
          g.fillStyle = F.frame;
          g.fillRect(x - 3, y - 3, ww + 6, hh + 6);
          const gr = g.createLinearGradient(x, y, x + ww, y + hh);
          gr.addColorStop(0, lit ? col : F.glass);
          gr.addColorStop(1, lit ? col : '#05070c');
          g.fillStyle = gr;
          g.fillRect(x, y, ww, hh);
          if (!F.band) {
            g.fillStyle = F.frame;
            g.fillRect(x + ww / 2 - 1.5, y, 3, hh);
            if (F.sill) {
              g.fillStyle = F.sill;
              g.fillRect(x - 5, y + hh + 2, ww + 10, 5);
            }
          }
        }
      }
    }
  };
}
export function facadeMat(style) {
  return cached(`fac:${style}`, () => {
    const map = canvasTex(`fac:${style}`, 512, 512, facadeDraw(style, false));
    const em = canvasTex(`face:${style}`, 512, 512, facadeDraw(style, true));
    // aynı tohum: iki çizimde de aynı rastgele sıra (hash(key) farklı!) → tohumu eşitle
    return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: 1.25, roughness: 0.55, metalness: 0.15 });
  });
}

// =============================================================================
// Kit — bir binanın/alanın parçalarını toplar; yerleştirildikten sonra dünya
// koordinatına çevrilir (çarpışma kutuları, ışıklar, etkileşim noktaları).
// =============================================================================

// --- v147.1 düşük poligonlu şehir eşyaları ---------------------------------------
const lowGeo = new Map();
const LG = (key, mk) => {
  if (!lowGeo.has(key)) lowGeo.set(key, mk());
  return lowGeo.get(key);
};
let bulbMat = null;
function lpMesh(g, geo, m, x, y, z, rot, sc) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
  if (sc) o.scale.set(sc[0], sc[1], sc[2]);
  o.castShadow = true;
  o.receiveShadow = true;
  g.add(o);
  return o;
}
const LOW = {
  streetlamp(g) {
    const iron = M('#1b1b1d', 0.4, 0.7);
    lpMesh(g, LG('lamp_base', () => new THREE.CylinderGeometry(0.16, 0.2, 0.2, 8)), iron, 0, 0.1, 0);
    lpMesh(g, LG('lamp_pole', () => new THREE.CylinderGeometry(0.05, 0.06, 3.0, 6)), iron, 0, 1.6, 0);
    lpMesh(g, LG('lamp_arm', () => new THREE.BoxGeometry(0.62, 0.05, 0.05)), iron, 0.3, 3.08, 0);
    lpMesh(g, LG('lamp_head', () => new THREE.CylinderGeometry(0.1, 0.16, 0.22, 8)), iron, 0.6, 2.98, 0);
    bulbMat ||= new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd9a0', emissiveIntensity: 2 });
    lpMesh(g, LG('lamp_bulb', () => new THREE.IcosahedronGeometry(0.09, 1)), bulbMat, 0.6, 2.86, 0).castShadow = false;
    return { light: { x: 0.6, y: 2.7, z: 0, color: '#ffd9a0', intensity: 6, distance: 8 } };
  },
  planter(g) {
    lpMesh(g, LG('pl_pot', () => new THREE.BoxGeometry(1.2, 0.45, 0.4)), M('#3a3d42', 0.6), 0, 0.225, 0);
    lpMesh(g, LG('pl_green', () => new THREE.IcosahedronGeometry(0.5, 1)), M('#3a7a34', 0.7), 0, 0.52, 0, null, [1.1, 0.28, 0.32]);
    const cols = ['#ff2d8a', '#ffd23f', '#ffffff', '#b16bff'];
    for (let i = 0; i < 5; i++) lpMesh(g, LG('pl_fl', () => new THREE.IcosahedronGeometry(0.05, 0)), M(cols[i % 4], 0.5), -0.44 + i * 0.22, 0.64 + (i % 2) * 0.05, 0.02).castShadow = false;
  },
  plantb(g) {
    lpMesh(g, LG('pb_pot', () => new THREE.CylinderGeometry(0.24, 0.18, 0.45, 8)), M('#e8e4dc', 0.4), 0, 0.225, 0);
    const leaf = M('#2f6b2f', 0.6);
    const leaf2 = M('#3f8a3a', 0.6);
    const geo = LG('pb_leaf', () => new THREE.IcosahedronGeometry(0.32, 1));
    lpMesh(g, geo, leaf, 0, 0.85, 0, null, [1, 0.9, 1]);
    lpMesh(g, geo, leaf2, 0.12, 1.2, 0.05, null, [0.8, 0.8, 0.8]);
    lpMesh(g, geo, leaf, -0.1, 1.45, -0.05, null, [0.6, 0.7, 0.6]);
  },
  palm(g) {
    lpMesh(g, LG('pa_pot', () => new THREE.CylinderGeometry(0.3, 0.22, 0.5, 8)), M('#1b1b1d', 0.4), 0, 0.25, 0);
    lpMesh(g, LG('pa_trunk', () => new THREE.CylinderGeometry(0.045, 0.075, 1.7, 6)), M('#6a4a2a', 0.9), 0, 1.35, 0);
    const geo = LG('pa_frond', () => new THREE.IcosahedronGeometry(0.45, 0));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const f = lpMesh(g, geo, M(i % 2 ? '#2f6b2f' : '#3a7a34', 0.6), Math.cos(a) * 0.4, 2.15, Math.sin(a) * 0.4, null, [1, 0.05, 0.22]);
      f.rotation.set(0, -a, -0.45);
    }
  },
  korkuluk(g) {
    const c = M('#cfd6de', 0.3, 0.8);
    const post = LG('kk_post', () => new THREE.CylinderGeometry(0.03, 0.03, 0.95, 5));
    const rail = LG('kk_rail', () => new THREE.BoxGeometry(2.0, 0.04, 0.04));
    [-0.98, 0, 0.98].forEach((x) => lpMesh(g, post, c, x, 0.475, 0));
    [0.9, 0.55, 0.25].forEach((y) => lpMesh(g, rail, c, 0, y, 0).castShadow = false);
  },
  tires(g) {
    const geo = LG('ti_t', () => new THREE.TorusGeometry(0.26, 0.1, 6, 12));
    const m = M('#151517', 0.9);
    for (let i = 0; i < 4; i++) lpMesh(g, geo, m, (i % 2) * 0.03, 0.1 + i * 0.2, 0, [Math.PI / 2, 0, i * 0.3]);
  },
};
function lowItem(k) {
  const g = new THREE.Group();
  const ctl = LOW[k](g);
  if (ctl) g.userData.ctl = ctl;
  return g;
}

export class Kit {
  constructor(name) {
    this.group = new THREE.Group();
    this.group.name = name || 'kit';
    this.dynamic = new THREE.Group(); // birleştirilmeyecek (canlı) parçalar
    this.group.add(this.dynamic);
    this.solids = []; // { o: Object3D (referans), x, z, hw, hd }
    this.lights = []; // { o, x, y, z, color, intensity, distance }
    this.zones = [];
    this.labels = [];
    this.blockers = []; // kamera engelleri (görünmez kutular)
    this.ticks = []; // { obj, ctl, x, z }
    this.waters = []; // v147.3: su alanları (girilir, batılır)
    this.npcs = [];
    this.seats = []; // oturulabilir noktalar (bank, tabure, kafe sandalyesi, tribün)
  }
  add(o, dyn = false) {
    (dyn ? this.dynamic : this.group).add(o);
    return o;
  }
  mesh(geo, mat, x = 0, y = 0, z = 0, ry = 0, { cast = true, receive = true, dyn = false, rx = 0, rz = 0 } = {}) {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.castShadow = cast;
    o.receiveShadow = receive;
    return this.add(o, dyn);
  }
  box(w, h, d, mat, x, y, z, opts = {}) {
    return this.mesh(boxGeo(w, h, d, opts.rep || 1, opts.ou || 0), mat, x, y + (opts.center ? 0 : h / 2), z, opts.ry || 0, opts);
  }
  cyl(rt, rb, h, mat, x, y, z, seg = 24, opts = {}) {
    return this.mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, opts.open || false), mat, x, y + h / 2, z, opts.ry || 0, opts);
  }
  // duvar dokulu kutu (oyunun duvar kaplamaları)
  wallBox(key, w, h, d, x, y, z, opts = {}) {
    return this.box(w, h, d, wallMat(key, opts.tint), x, y, z, { ...opts, rep: wallRep(key) * (opts.repK || 1) });
  }
  // oyunun zemin dokusu, dünya UV'li düz alan
  floor(key, w, d, x, z, y = 0.14, opts = {}) {
    const rep = floorRep(key) * (opts.repK || 1);
    const g = planeGeo(w, d, w / rep, d / rep, (x - w / 2) / rep, (z - d / 2) / rep);
    const o = this.mesh(g, floorMat(key), x, y, z, 0, { cast: false, rx: -Math.PI / 2 });
    if (opts.offset) {
      // halı gibi üstte çizilsin
      o.renderOrder = 1;
    }
    return o;
  }
  // Oyunun eşyası — katalogdan birebir
  item(k, x, z, r = 0, ti = 0, { y = 0, solid = true, scale = 1, dyn = false } = {}) {
    const def = CATALOG_MAP[k];
    // v147.1 performans: şehirde yüzlerce kez geçen eşyaların düşük poligonlu hali
    // (çiçeklik 7.100 → ~130 üçgen, lamba 1.800 → ~120…); şehir 1,7 M → ~0,4 M üçgen
    const o = LOW[k] ? lowItem(k) : buildItem(k, { ti, live: true });
    if (!o) {
      console.warn('eşya yok', k);
      return null;
    }
    o.position.set(x, y, z);
    o.rotation.y = (r * Math.PI) / 4;
    if (scale !== 1) o.scale.setScalar(scale);
    o.userData.itemKey = k;
    o.traverse((c) => {
      if (c.isMesh && !c.userData.pickOnly) {
        if (c.castShadow === undefined) c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    const ctl = o.userData.ctl;
    const live = Boolean(ctl?.tick) || dyn;
    this.add(o, live);
    if (live && ctl?.tick) this.ticks.push({ obj: o, ctl });
    if (solid && def) {
      itemBoxes(def).forEach(([bx, bz, hw, hd]) => this.solids.push({ o, x: bx * scale, z: bz * scale, hw: hw * scale, hd: hd * scale, item: def.cat }));
    }
    if (def?.seats && def.cat !== 'araba' && def.cat !== 'motor') def.seats.forEach((sp) => this.seats.push({ o, x: sp[0] * scale, y: sp[1] * scale, z: sp[2] * scale }));
    if (ctl?.light) {
      const L = ctl.light;
      this.lights.push({ o, x: L.x, y: L.y, z: L.z, color: L.color, intensity: L.intensity, distance: L.distance });
    }
    return o;
  }
  solid(x, z, hw, hd, ry = 0) {
    const o = new THREE.Object3D();
    o.position.set(x, 0, z);
    o.rotation.y = ry;
    this.group.add(o);
    this.solids.push({ o, x: 0, z: 0, hw, hd });
  }
  // v147.1 — elips engel (stadyum): görünen duvarla birebir, köşesiz
  ellipse(x, z, rx, rz) {
    const o = new THREE.Object3D();
    o.position.set(x, 0, z);
    this.group.add(o);
    this.solids.push({ o, x: 0, z: 0, hw: rx, hd: rz, ell: true });
  }
  blocker(w, h, d, x, y, z) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    o.position.set(x, y + h / 2, z);
    o.userData.blocker = true;
    this.group.add(o);
    this.blockers.push(o);
    return o;
  }
  // katı + kamera engeli birlikte
  mass(w, h, d, x, z, y = 0) {
    this.solid(x, z, w / 2, d / 2);
    this.blocker(w, h, d, x, y, z);
  }
  light(x, y, z, color, intensity = 6, distance = 10) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    this.group.add(o);
    this.lights.push({ o, x: 0, y: 0, z: 0, color, intensity, distance });
  }
  // yerde yumuşak ışık lekesi (gece sokak lambası / neon yansıması)
  pool(x, z, color, size = 6, y = 0.16, k = 0.55) {
    const o = this.mesh(new THREE.PlaneGeometry(size, size), poolMat(color, k), x, y, z, 0, { cast: false, receive: false, rx: -Math.PI / 2 });
    o.renderOrder = 2;
    return o;
  }
  zone(z) {
    const o = new THREE.Object3D();
    o.position.set(z.x, 0, z.z);
    this.group.add(o);
    this.zones.push({ ...z, o });
  }
  label(text, x, y, z, kind = 'map') {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    this.group.add(o);
    this.labels.push({ text, o, kind });
  }
  // v147.3 — su (elips): yürüyerek girilir, içeri doğru batılır; arabalar giremez
  water(x, z, rx, rz) {
    const o = new THREE.Object3D();
    o.position.set(x, 0, z);
    this.group.add(o);
    (this.waters ||= []).push({ o, rx, rz });
  }
  // neon/pano tabela: dikdörtgen düzlem; h = yükseklik (m)
  sign(key, text, h, x, y, z, ry = 0, opts = {}) {
    const tex = textCanvasTex(key, text, opts);
    const w = h * tex.userData.aspect;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    const o = this.mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, ry, { cast: false, receive: false });
    o.renderOrder = 3;
    if (opts.light !== false && opts.glow) {
      const dx = Math.sin(ry) * 1.2;
      const dz = Math.cos(ry) * 1.2;
      this.light(x + dx, y, z + dz, opts.glow, opts.li || 7, opts.ld || 12);
    }
    o.userData.signW = w;
    return o;
  }
}

const poolCache = new Map();
function poolMat(color, k) {
  const key = `${color}|${k}`;
  let m = poolCache.get(key);
  if (m) return m;
  const tex = canvasTex(`pool:${color}`, 128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
  m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: k, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  m.userData.shared = true;
  poolCache.set(key, m);
  return m;
}
