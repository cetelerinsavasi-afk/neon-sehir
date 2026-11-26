// =============================================================================
// SADECE ÖNİZLEME — PİST PROTOTİPİ (npm run preview:gangs → /pist.html)
//   • şehirdeki araba modelleri (vehicles.js) ve şehirle aynı sürüş fiziği (functions/pistSim.js)
//   • Serbest tur: pistte istediğin gibi tur at (tur / sektör süreleri tutulur)
//   • Yarışı başlat: grid'e ışınlan → 5 kırmızı ışık → tek tur, pistten çıkmadan
//   • Test paneli: 10 araç × 3 seviye, nitro aç/kapa, hayalet (mükemmel tur / rekorum), kamera
// =============================================================================
import * as THREE from 'three';
import { buildVehicle } from '../src/components/City/vehicles.js';
import { EngineSound } from '../src/components/City/sound.js';
import * as PS from '../functions/pistSim.js';
import { PIST_BEST, ESKI_PIST_MS } from './pistBest.js';
import { championshipTimePrize } from '../functions/championshipPrizes.js';

const T = PS.PIST;
const N = T.N;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const fmt = (ms) => (ms == null || !Number.isFinite(ms) ? '–' : (ms / 1000).toFixed(2));
const fmtF = (f) => fmt(PS.framesToMs(f));
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* depolama yok */
    }
  },
};
const PRIZE_MS = 25000; // ödül eşiği (şampiyona: 25 sn altı)

// --- ayarlar ---------------------------------------------------------------------
const cfg = Object.assign({ car: 10, lv: 3, nitro: true, denge: 'sehir', ghost: 'perfect', cam: 'chase' }, store.get('pist_cfg') || {});
const saveCfg = () => store.set('pist_cfg', cfg);
const bestKeyOf = (id, lv, nitro, denge) => `pist_best_${id}_${lv}_${nitro ? 1 : 0}${denge === 'eski' ? '_e' : ''}`;
const bestKey = () => bestKeyOf(cfg.car, cfg.lv, cfg.nitro, cfg.denge);
const perfectOf = (id, lv, nitro = true, denge = cfg.denge) => (nitro ? PIST_BEST[`${denge === 'eski' ? 'e_' : ''}${id}_${lv}`] : null) || null;
const statsOpts = () => ({ nitro: cfg.nitro, denge: cfg.denge });

// --- sahne ---------------------------------------------------------------------------
const root = document.getElementById('root');
const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1840');
scene.fog = new THREE.Fog('#4a3a66', 160, 620);
const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 1500);
const hemi = new THREE.HemisphereLight('#b8c4ff', '#3a3028', 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffd2a8', 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

function canvasTex(w, h, draw, rep = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rnd(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const R = rnd(7);

// gökyüzü (akşam: neon mor-turuncu ufuk)
{
  const tex = canvasTex(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0b0f2e');
    gr.addColorStop(0.42, '#2a2266');
    gr.addColorStop(0.5, '#6b3b86');
    gr.addColorStop(0.535, '#ff8a5c');
    gr.addColorStop(0.56, '#4a3a66');
    gr.addColorStop(1, '#2a2440');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, false);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  scene.add(dome);
  // yıldızlar
  const sp = [];
  for (let i = 0; i < 600; i++) {
    const a = R() * Math.PI * 2;
    const e = 0.15 + R() * 1.3;
    sp.push(Math.cos(a) * Math.cos(e) * 1100, Math.sin(e) * 1100, Math.sin(a) * Math.cos(e) * 1100);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
  // uzakta şehir silueti (Neon Şehir)
  const sky = canvasTex(1024, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r2 = rnd(3);
    for (let x = 0; x < w; ) {
      const bw = 10 + r2() * 26;
      const bh = 20 + r2() * 90;
      g.fillStyle = '#141432';
      g.fillRect(x, h - bh, bw, bh);
      for (let k = 0; k < bh / 7; k++) {
        if (r2() < 0.35) {
          g.fillStyle = r2() < 0.5 ? '#ff2bd6' : r2() < 0.5 ? '#23e6ff' : '#ffd27a';
          g.fillRect(x + 2 + r2() * (bw - 5), h - bh + 4 + k * 7, 2, 2);
        }
      }
      x += bw + 1;
    }
  }, false);
  sky.wrapS = THREE.RepeatWrapping;
  sky.repeat.set(3, 1);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1000, 1000, 120, 48, 1, true), new THREE.MeshBasicMaterial({ map: sky, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  ring.position.y = 40;
  ring.renderOrder = -9;
  scene.add(ring);
}

// --- doku ve malzemeler -----------------------------------------------------------
const texAsphalt = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#34373e';
  g.fillRect(0, 0, w, h);
  const r2 = rnd(11);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + r2() * 40;
    g.fillStyle = `rgba(${v},${v + 2},${v + 6},${0.35 + r2() * 0.4})`;
    g.fillRect(r2() * w, r2() * h, 1 + r2() * 1.5, 1 + r2() * 1.5);
  }
  // yarış çizgisi lastik izi (ortada koyu)
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0.25, 'rgba(0,0,0,0)');
  gr.addColorStop(0.5, 'rgba(10,10,12,0.25)');
  gr.addColorStop(0.75, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
});
const texKerb = canvasTex(32, 64, (g, w, h) => {
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d91e2a';
  g.fillRect(0, 0, w, h / 2);
});
const texGravel = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#b89a6a';
  g.fillRect(0, 0, w, h);
  const r2 = rnd(5);
  for (let i = 0; i < 3000; i++) {
    const v = 140 + r2() * 80;
    g.fillStyle = `rgb(${v},${v * 0.86},${v * 0.62})`;
    g.fillRect(r2() * w, r2() * h, 1.5, 1.5);
  }
});
const texGrass = canvasTex(256, 256, (g, w, h) => {
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#2f6a2c' : '#357431';
    g.fillRect(0, (i * h) / 8, w, h / 8);
  }
  const r2 = rnd(9);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${20 + r2() * 40},${70 + r2() * 60},${20 + r2() * 30},0.5)`;
    g.fillRect(r2() * w, r2() * h, 1, 2);
  }
});
const texChecker = canvasTex(64, 16, (g, w, h) => {
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
    g.fillRect(x * 4, y * 4, 4, 4);
  }
});
const texFence = canvasTex(64, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(200,210,220,0.55)';
  g.lineWidth = 2;
  for (let k = -64; k < 128; k += 16) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 64, 64);
    g.moveTo(k + 64, 0);
    g.lineTo(k, 64);
    g.stroke();
  }
});
const texWall = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#c9ccd2';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#b3b7bf';
  g.fillRect(0, 0, 2, h);
  g.fillStyle = '#d91e2a';
  g.fillRect(0, 0, w, 10);
});
const M = {
  asphalt: new THREE.MeshStandardMaterial({ map: texAsphalt, roughness: 0.92, metalness: 0 }),
  line: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.6 }),
  kerb: new THREE.MeshStandardMaterial({ map: texKerb, roughness: 0.7 }),
  gravel: new THREE.MeshStandardMaterial({ map: texGravel, roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ map: texGrass, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ map: texWall, roughness: 0.8, side: THREE.DoubleSide }),
  fence: new THREE.MeshStandardMaterial({ map: texFence, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }),
  checker: new THREE.MeshStandardMaterial({ map: texChecker, roughness: 0.6 }),
  neonA: new THREE.MeshStandardMaterial({ color: '#ff2bd6', emissive: '#ff2bd6', emissiveIntensity: 2.4 }),
  neonB: new THREE.MeshStandardMaterial({ color: '#23e6ff', emissive: '#23e6ff', emissiveIntensity: 2.4 }),
};

// --- pist geometrisi (kapalı döngü boyunca kesit süpürme) -------------------------
// prof(i) → [[lat, y], ...] (her i için aynı uzunluk) · mask(i) → bu dilim çizilsin mi
function sweep(prof, mat, { mask = () => true, vRep = 10, uMode = 'norm', shadow = true } = {}) {
  const pos = [];
  const uv = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (!mask(i) || !mask(j)) continue;
    const A = prof(i);
    const B = prof(j);
    const tot = A.reduce((s, p, k) => (k ? s + Math.hypot(p[0] - A[k - 1][0], p[1] - A[k - 1][1]) : 0), 0) || 1;
    let ul = 0;
    for (let k = 0; k < A.length - 1; k++) {
      const seg = Math.hypot(A[k + 1][0] - A[k][0], A[k + 1][1] - A[k][1]);
      const u0 = uMode === 'norm' ? ul / tot : ul / uMode;
      const u1 = uMode === 'norm' ? (ul + seg) / tot : (ul + seg) / uMode;
      ul += seg;
      const P = (i2, pr) => [T.PT[i2][0] + T.NRM[i2][0] * pr[0], pr[1], T.PT[i2][1] + T.NRM[i2][1] * pr[0]];
      const a0 = P(i, A[k]);
      const a1 = P(i, A[k + 1]);
      const b0 = P(j, B[k]);
      const b1 = P(j, B[k + 1]);
      const v0 = (i * PS.STEP) / vRep;
      const v1 = ((i + 1) * PS.STEP) / vRep;
      pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      uv.push(u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = shadow;
  scene.add(m);
  return m;
}
const { HALF, KERB, BAR } = PS;
// asfalt
sweep(() => [[-HALF - 0.05, 0.02], [HALF + 0.05, 0.02]], M.asphalt, { vRep: 13 });
// beyaz kenar çizgileri
for (const s of [-1, 1]) sweep(() => [[s * (HALF - 0.45), 0.031], [s * (HALF - 0.2), 0.031]], M.line, { vRep: 50 });
// kerbler (virajlarda)
const kerbMask = (i) => T.KERBS[i] || T.KERBS[(i + 2) % N] || T.KERBS[(i - 2 + N) % N];
for (const s of [-1, 1]) sweep(() => [[s * HALF, 0.045], [s * (HALF + KERB), 0.03]], M.kerb, { mask: kerbMask, vRep: 4 });
// çakıl havuzları (sıkı virajların dışı)
for (const s of [-1, 1]) sweep(() => [[s * (HALF + KERB + 1.5), 0.012], [s * (BAR - 0.3), 0.012]], M.gravel, { mask: (i) => T.GRAVEL[i] === s, vRep: 8 });
// zemin (çim)
{
  const xs = T.PT.map((p) => p[0]);
  const zs = T.PT.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  texGrass.repeat.set(70, 70);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0, cz);
  ground.receiveShadow = true;
  scene.add(ground);
}
// bariyer: beton duvar + üstünde neon şerit + tel çit
for (const s of [-1, 1]) {
  sweep(() => [[s * BAR, 0], [s * BAR, 1.1], [s * (BAR + 0.45), 1.1], [s * (BAR + 0.45), 0]], M.wall, { vRep: 4, shadow: true });
  const sector = (i) => Math.floor((i / N) * 3);
  sweep(() => [[s * (BAR + 0.1), 1.12], [s * (BAR + 0.35), 1.12]], M.neonA, { mask: (i) => sector(i) !== 1, vRep: 10, shadow: false });
  sweep(() => [[s * (BAR + 0.1), 1.12], [s * (BAR + 0.35), 1.12]], M.neonB, { mask: (i) => sector(i) === 1, vRep: 10, shadow: false });
  sweep(() => [[s * (BAR + 0.25), 1.1], [s * (BAR + 0.25), 4.2]], M.fence, { vRep: 3, shadow: false });
}
// lastik bariyerleri (virajlarda duvar önü) — instanced
{
  const pts = [];
  for (let i = 0; i < N; i++) {
    const near = T.GRAVEL[i] || T.KERBS[i];
    if (!near) continue;
    for (const s of [-1, 1]) {
      if (T.GRAVEL[i] && T.GRAVEL[i] !== s && !T.KERBS[i]) continue;
      for (const f of [0, 0.5]) {
        const k = (i + f) % N;
        const i0 = Math.floor(k);
        const i1 = (i0 + 1) % N;
        const t = k - i0;
        const px = T.PT[i0][0] * (1 - t) + T.PT[i1][0] * t;
        const pz = T.PT[i0][1] * (1 - t) + T.PT[i1][1] * t;
        const nx = T.NRM[i0][0];
        const nz = T.NRM[i0][1];
        pts.push([px + nx * s * (BAR - 0.36), pz + nz * s * (BAR - 0.36)]);
      }
    }
  }
  const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 12);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const inst = new THREE.InstancedMesh(geo, mat, pts.length * 3);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let n = 0;
  pts.forEach(([x, z], k) => {
    for (let h = 0; h < 3; h++) {
      m4.makeTranslation(x, 0.15 + h * 0.29, z);
      inst.setMatrixAt(n, m4);
      col.set(Math.floor(k / 6) % 2 ? (h === 1 ? '#f2f2f2' : '#d91e2a') : '#1b1b1d');
      inst.setColorAt(n++, col);
    }
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  scene.add(inst);
}
// başlangıç / bitiş çizgisi + grid kutuları
const outward = (() => {
  // ana düzlükte pistin "dışı" (döngü merkezinden uzak taraf)
  const cx = T.PT.reduce((s, p) => s + p[0], 0) / N;
  const cz = T.PT.reduce((s, p) => s + p[1], 0) / N;
  const i = 30;
  return Math.sign((T.PT[i][0] - cx) * T.NRM[i][0] + (T.PT[i][1] - cz) * T.NRM[i][1]) || 1;
})();
function placeAt(obj, i, lat, y = 0, rotY = 0) {
  const p = T.PT[(i + N) % N];
  const n = T.NRM[(i + N) % N];
  obj.position.set(p[0] + n[0] * lat, y, p[1] + n[1] * lat);
  obj.rotation.y = T.ANG[(i + N) % N] + rotY;
  scene.add(obj);
  return obj;
}
{
  const fin = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 1.6), M.checker);
  fin.geometry.rotateX(-Math.PI / 2);
  placeAt(fin, T.START, 0, 0.04);
  // grid kutuları (kademeli, iki sıra)
  for (let k = 0; k < 6; k++) {
    const gi = T.START - PS.GRID_BACK - k * 4;
    const lat = k % 2 ? -3 : 3;
    const g = new THREE.Group();
    const bar = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.line);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0, z);
      g.add(m);
    };
    bar(2.4, 0.18, 0, 2.9);
    bar(0.18, 1.2, -1.2, 2.4);
    bar(0.18, 1.2, 1.2, 2.4);
    placeAt(g, gi, k === 0 ? 0 : lat, 0.035);
  }
}
// başlangıç kulesi (gantry) + 5 ışık
const gantryLights = [];
{
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.5, metalness: 0.7 });
  const span = BAR * 2 + 2;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), steel);
    p.position.set(s * (BAR + 1), 4, 0);
    p.castShadow = true;
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 1.4, 0.8), steel);
  beam.position.set(0, 7.6, 0);
  g.add(beam);
  const board = canvasTex(1024, 96, (c, w, h) => {
    c.fillStyle = '#0a0a18';
    c.fillRect(0, 0, w, h);
    c.font = '900 64px Arial Black, Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#ff2bd6';
    c.shadowBlur = 18;
    c.fillStyle = '#ffffff';
    c.fillText('NEON ŞEHİR PİSTİ', w / 2, h / 2 + 4);
  }, false);
  for (const sz of [1, -1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.62, 1.2), new THREE.MeshStandardMaterial({ map: board, emissive: '#ffffff', emissiveMap: board, emissiveIntensity: 1.2 }));
    b.position.set(0, 7.6, sz * 0.41);
    if (sz < 0) b.rotation.y = Math.PI;
    g.add(b);
  }
  for (let k = 0; k < 5; k++) {
    const m = new THREE.MeshStandardMaterial({ color: '#330609', emissive: '#ff1d2e', emissiveIntensity: 0 });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), m);
    l.position.set((k - 2) * 1.3, 6.3, -0.41);
    l.rotation.y = Math.PI;
    g.add(l);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.3), steel);
    back.position.set((k - 2) * 1.3, 6.3, -0.25);
    g.add(back);
    gantryLights.push(m);
  }
  placeAt(g, T.START + 1, 0, 0);
}
// tribünler (ana düzlük dışı) + seyirci
{
  const seatM = new THREE.MeshStandardMaterial({ color: '#2a3550', roughness: 0.8 });
  const roofM = new THREE.MeshStandardMaterial({ color: '#d8dce6', roughness: 0.5, metalness: 0.3 });
  const crowd = [];
  for (let i = 8; i < 120; i += 14) {
    const g = new THREE.Group();
    for (let r = 0; r < 7; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(26, 0.9 + r * 0.9, 1.6), seatM);
      step.position.set(0, (0.9 + r * 0.9) / 2, r * 1.6);
      step.castShadow = true;
      step.receiveShadow = true;
      g.add(step);
      for (let x = -12; x <= 12; x += 1.1) if (R() < 0.8) crowd.push([g, x + (R() - 0.5) * 0.3, 0.9 + r * 0.9 + 0.45, r * 1.6 - 0.2]);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(27, 0.3, 13), roofM);
    roof.position.set(0, 10.5, 4.6);
    roof.castShadow = true;
    g.add(roof);
    for (const x of [-12.5, 12.5]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10.5, 0.4), roofM);
      p.position.set(x, 5.25, 10.5);
      g.add(p);
    }
    placeAt(g, i, outward * (BAR + 5), 0, outward > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  scene.updateMatrixWorld(true);
  const geo = new THREE.BoxGeometry(0.45, 0.8, 0.35);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowd.length);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const col = new THREE.Color();
  const pal = ['#ff2bd6', '#23e6ff', '#ffd23f', '#ffffff', '#ff5a3c', '#3c7bff', '#1f1f1f', '#4dff8a'];
  crowd.forEach(([g, x, y, z], k) => {
    v.set(x, y, z).applyMatrix4(g.matrixWorld);
    m4.makeTranslation(v.x, v.y, v.z);
    inst.setMatrixAt(k, m4);
    inst.setColorAt(k, col.set(pal[Math.floor(R() * pal.length)]));
  });
  scene.add(inst);
}
// pit binası (iç tarafta) + "PIT" yazısı
{
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: '#e9ecf2', roughness: 0.6 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(110, 7, 14), bm);
  b.position.set(0, 3.5, 0);
  b.castShadow = true;
  b.receiveShadow = true;
  g.add(b);
  const doorT = canvasTex(512, 64, (c, w, h) => {
    for (let k = 0; k < 12; k++) {
      c.fillStyle = '#1b2233';
      c.fillRect(k * (w / 12) + 4, 6, w / 12 - 8, h - 6);
      c.fillStyle = k % 2 ? '#ff2bd6' : '#23e6ff';
      c.fillRect(k * (w / 12) + 4, 0, w / 12 - 8, 5);
    }
  }, false);
  const doors = new THREE.Mesh(new THREE.PlaneGeometry(108, 5), new THREE.MeshStandardMaterial({ map: doorT, emissive: '#ffffff', emissiveMap: doorT, emissiveIntensity: 0.25 }));
  doors.position.set(0, 2.6, -7.01);
  doors.rotation.y = Math.PI;
  g.add(doors);
  const sign = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#0a0a18';
    c.fillRect(0, 0, w, h);
    c.font = '900 92px Arial Black, Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#23e6ff';
    c.shadowBlur = 20;
    c.fillStyle = '#e8fbff';
    c.fillText('PIT · PADOK', w / 2, h / 2 + 6);
  }, false);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshStandardMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 1 }));
  s.position.set(0, 9.6, -6);
  s.rotation.y = Math.PI;
  g.add(s);
  placeAt(g, 60, -outward * (BAR + 18), 0, outward > 0 ? -Math.PI / 2 : Math.PI / 2);
}
// fren mesafesi tabelaları (ilk sıkı viraj öncesi) + reklam panoları + ışık direkleri
{
  let c1 = 0;
  for (let i = 10; i < N; i++) if (Math.abs(T.CURV[i]) > 1 / 45) {
    c1 = i;
    break;
  }
  const brd = (txt) =>
    canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#111';
      c.lineWidth = 8;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.font = '900 64px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#111';
      c.fillText(txt, w / 2, h / 2 + 4);
    }, false);
  for (const d of [150, 100, 50]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: brd(String(d)), side: THREE.DoubleSide }));
    const post = new THREE.Group();
    m.position.y = 1.6;
    post.add(m);
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), M.line);
    pl.position.y = 0.8;
    post.add(pl);
    placeAt(post, c1 - Math.round(d / PS.STEP), outward * (HALF + KERB + 2.6), 0, Math.PI);
  }
  const ads = ['NEON PETROL', 'ELMAS MADENİ', 'KERVANKENT', 'NEON GARAJ', 'SİXTAGRAM', 'NEON ŞEHİR'];
  const adT = ads.map((t, k) =>
    canvasTex(512, 96, (c, w, h) => {
      c.fillStyle = k % 2 ? '#14062a' : '#03141f';
      c.fillRect(0, 0, w, h);
      c.font = '900 58px Arial Black, Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = k % 2 ? '#ff2bd6' : '#23e6ff';
      c.shadowBlur = 16;
      c.fillStyle = '#ffffff';
      c.fillText(t, w / 2, h / 2 + 3);
    }, false),
  );
  for (let i = 0, k = 0; i < N; i += 22, k++) {
    if (i < 130 && i > 0) continue; // ana düzlükte tribün var
    for (const s of [-1, 1]) {
      const t = adT[(k + (s > 0 ? 0 : 3)) % ads.length];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
      placeAt(m, i, s * (BAR + 0.6), 2.1, -s * Math.PI / 2);
    }
  }
  // ışık direkleri
  const poleM = new THREE.MeshStandardMaterial({ color: '#30343e', metalness: 0.6, roughness: 0.4 });
  const lampM = new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: '#fff1c8', emissiveIntensity: 3 });
  for (let i = 4; i < N; i += 26) {
    for (const s of [-1, 1]) {
      if ((i + (s > 0 ? 13 : 0)) % 52 > 26) continue;
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 8), poleM);
      p.position.y = 7;
      g.add(p);
      const h = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 1.2), lampM);
      h.position.set(0, 14, 0);
      g.add(h);
      placeAt(g, i, s * (BAR + 3), 0, 0);
    }
  }
}
// ağaçlar (pistten uzak) — instanced
{
  const xs = T.PT.map((p) => p[0]);
  const zs = T.PT.map((p) => p[1]);
  const x0 = Math.min(...xs) - 160;
  const x1 = Math.max(...xs) + 160;
  const z0 = Math.min(...zs) - 160;
  const z1 = Math.max(...zs) + 160;
  const far = (x, z, d) => {
    for (let i = 0; i < N; i += 3) if ((T.PT[i][0] - x) ** 2 + (T.PT[i][1] - z) ** 2 < d * d) return false;
    return true;
  };
  const ps = [];
  for (let k = 0; k < 2600 && ps.length < (IS_TOUCH ? 380 : 700); k++) {
    const x = x0 + R() * (x1 - x0);
    const z = z0 + R() * (z1 - z0);
    if (far(x, z, BAR + 30)) ps.push([x, z, 0.8 + R() * 0.7]);
  }
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 8, 7), new THREE.MeshStandardMaterial({ color: '#1f4a2a', roughness: 1 }), ps.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 }), ps.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  ps.forEach(([x, z, s], k) => {
    sc.set(s, s, s);
    m4.compose(new THREE.Vector3(x, 1.2 * s + 4 * s, z), q, sc);
    cone.setMatrixAt(k, m4);
    m4.compose(new THREE.Vector3(x, 1.2 * s, z), q, sc);
    trunk.setMatrixAt(k, m4);
  });
  cone.castShadow = true;
  scene.add(cone, trunk);
}

// --- fren izi (instanced halka tampon) ------------------------------------------------
const SKID_MAX = 900;
const skids = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 0.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0b0b0d', transparent: true, opacity: 0.55, depthWrite: false }), SKID_MAX);
skids.count = 0;
skids.frustumCulled = false;
scene.add(skids);
let skidN = 0;
function addSkid(x, z, yaw) {
  const m4 = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0.05, z);
  skids.setMatrixAt(skidN % SKID_MAX, m4);
  skidN++;
  skids.count = Math.min(SKID_MAX, skidN);
  skids.instanceMatrix.needsUpdate = true;
}

// --- araç (oyuncu + hayalet) ----------------------------------------------------------
let car = null; // { v, nitroFx }
let ghost = null;
function disposeVehicle(v) {
  scene.remove(v.root);
  v.root.traverse((o) => o.isMesh && o.geometry?.dispose());
}
function makeCar(id) {
  const v = buildVehicle(id, null);
  v.root.rotation.order = 'YXZ';
  // nitro alevi
  const fx = new THREE.Group();
  const flameM = new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.9, 10).rotateX(-Math.PI / 2), flameM);
    f.position.set(s * 0.45, 0.35, -v.len / 2 - 0.4);
    fx.add(f);
  }
  fx.visible = false;
  v.root.add(fx);
  scene.add(v.root);
  return { v, fx };
}
function makeGhost(id) {
  const v = buildVehicle(id, null);
  v.root.rotation.order = 'YXZ';
  v.root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const cl = ms.map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.32;
      c.depthWrite = false;
      if (c.emissive) c.emissive.set('#23e6ff'), (c.emissiveIntensity = 0.35);
      return c;
    });
    o.material = Array.isArray(o.material) ? cl : cl[0];
  });
  scene.add(v.root);
  return { v };
}
function poseCar(c, S, P, prev, alpha, dt) {
  const v = c.v;
  const x = prev ? prev.x + (S.x - prev.x) * alpha : S.x;
  const z = prev ? prev.z + (S.z - prev.z) * alpha : S.z;
  let yaw = S.yaw;
  if (prev) {
    let d = S.yaw - prev.yaw;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    yaw = prev.yaw + d * alpha;
  }
  v.root.position.set(x, 0, z);
  v.root.rotation.y = yaw;
  const vF = S.vF || 0;
  const delta = (S.steer * P.steer) / (1 + Math.abs(vF) * 0.045);
  c.lastVF ??= vF;
  c.pitch ??= 0;
  c.roll ??= 0;
  const longA = (vF - c.lastVF) / Math.max(dt, 1e-3);
  c.lastVF = vF;
  c.pitch += (Math.max(-0.05, Math.min(0.05, -longA * 0.006)) - c.pitch) * Math.min(1, dt * 6);
  c.roll += (Math.max(-0.075, Math.min(0.075, vF * (S.yawRate || 0) * 0.007)) - c.roll) * Math.min(1, dt * 6);
  v.tilt?.rotation.set(c.pitch, 0, c.roll);
  v.wheels.forEach((w) => {
    w.spin.rotation.z -= (vF * dt) / w.r;
    if (w.front) w.pivot.rotation.y = delta;
  });
  return { x, z, yaw, vF };
}

// --- durum ---------------------------------------------------------------------------
let P = PS.pistStats(cfg.car, cfg.lv, statsOpts());
let S = PS.newState();
let prevS = null;
let mode = 'free'; // free | countdown | racing | finished
let rec = null;
let autoRuns = null; // "Bot sürsün": mükemmel turun tuşları
let autoPtr = null;
let gS = null; // hayalet durumu
let gRuns = null;
let gPtr = null;
let gTimeline = null; // prog → kare (delta için)
let countT = 0;
let goDelay = 0;
// serbest tur
let lapStartF = null;
let lapK = 0;
let lastLap = null;
let sectors = [];
let freeBest = null;
let lastHitSound = 0;

function runsReader(runs) {
  let i = 0;
  let left = runs.length ? runs[1] : 0;
  return () => {
    if (i >= runs.length) return 0;
    const b = runs[i];
    left -= 1;
    if (left <= 0) {
      i += 2;
      left = runs[i + 1] || 0;
    }
    return b;
  };
}
function timelineOf(runs, Pg) {
  const tl = new Int32Array(N + PS.GRID_BACK + 2).fill(-1);
  const s = PS.newState();
  const rd = runsReader(runs);
  while (!s.done && s.f < PS.MAX_FRAMES) {
    PS.stepCar(s, Pg, rd(), PS.RACE_FINISH);
    const k = s.prog + PS.GRID_BACK;
    if (k >= 0 && k < tl.length && tl[k] < 0) tl[k] = s.f;
  }
  for (let k = 1; k < tl.length; k++) if (tl[k] < 0) tl[k] = tl[k - 1];
  return tl;
}

function setupCar() {
  P = PS.pistStats(cfg.car, cfg.lv, statsOpts());
  if (car) disposeVehicle(car.v);
  car = makeCar(cfg.car);
  if (ghost) disposeVehicle(ghost.v);
  ghost = null;
  gS = null;
}
function ghostSource() {
  if (cfg.ghost === 'perfect') return perfectOf(cfg.car, cfg.lv, cfg.nitro);
  if (cfg.ghost === 'mine') return store.get(bestKey());
  return null;
}
function startFree() {
  mode = 'free';
  S = PS.newState();
  prevS = null;
  rec = null;
  autoRuns = null;
  lapStartF = null;
  lapK = 0;
  lastLap = null;
  sectors = [];
  freeBest = null;
  if (ghost) {
    disposeVehicle(ghost.v);
    ghost = null;
  }
  gS = null;
  hideRes();
  setLights(0);
  flash('SERBEST TUR', 'Pistte istediğin gibi tur at · tur süren tutulur', 1600);
  sound.start();
  sound.idle(true);
}
function startRace(auto = false) {
  mode = 'countdown';
  S = PS.newState(); // grid'e ışınlan
  prevS = null;
  rec = PS.createInputRecorder();
  autoRuns = null;
  autoPtr = null;
  if (auto) {
    const pf = perfectOf(cfg.car, cfg.lv, cfg.nitro);
    if (pf) {
      autoRuns = pf.runs;
      autoPtr = runsReader(pf.runs);
    }
  }
  const src = ghostSource();
  if (ghost) disposeVehicle(ghost.v);
  ghost = null;
  gS = null;
  gTimeline = null;
  if (src?.runs) {
    ghost = makeGhost(cfg.car);
    gS = PS.newState();
    gRuns = src.runs;
    gPtr = runsReader(src.runs);
    gTimeline = timelineOf(src.runs, P);
  }
  countT = 0;
  goDelay = 0.3 + Math.random() * 0.9;
  hideRes();
  sound.start();
  sound.idle(true);
}
function finishRace() {
  mode = 'finished';
  const ms = PS.framesToMs(S.f);
  // sunucuyla aynı doğrulama: tuş kaydını baştan oynat
  const ver = PS.replayRun(cfg.car, cfg.lv, rec.runs, statsOpts());
  const pf = perfectOf(cfg.car, cfg.lv, cfg.nitro);
  let isBest = false;
  if (!autoRuns) {
    const old = store.get(bestKey());
    if (ver.ok && (!old || ver.ms < old.ms)) {
      store.set(bestKey(), { ms: ver.ms, runs: rec.runs, hits: ver.hits, at: Date.now() });
      isBest = true;
    }
  }
  showRes({ ms, ver, pf, isBest });
}

// --- giriş ---------------------------------------------------------------------------
const keys = {};
const touchIn = { L: 0, R: 0, G: 0, B: 0, N: 0, H: 0 };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'KeyR') startRace(false);
  if (e.code === 'KeyF') startFree();
  if (e.code === 'KeyC') cycleCam();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  sound.start();
});
addEventListener('keyup', (e) => (keys[e.code] = false));
addEventListener('blur', () => Object.keys(keys).forEach((k) => (keys[k] = false)));
function inputBits() {
  let b = 0;
  if (keys.KeyA || keys.ArrowLeft || touchIn.L) b |= PS.IN_L;
  if (keys.KeyD || keys.ArrowRight || touchIn.R) b |= PS.IN_R;
  if (keys.KeyW || keys.ArrowUp || touchIn.G) b |= PS.IN_G;
  if (keys.KeyS || keys.ArrowDown || touchIn.B) b |= PS.IN_B;
  if (keys.ShiftLeft || keys.ShiftRight || keys.KeyN || touchIn.N) b |= PS.IN_N;
  if (keys.Space || touchIn.H) b |= PS.IN_H;
  return b;
}

// --- arayüz --------------------------------------------------------------------------
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstChild;
};
const hud = {
  tl: document.body.appendChild(el(`<div id="tl" class="hud glass"><div class="mode" id="hMode">SERBEST TUR</div><div class="big" id="hTime">0.00</div>
    <div class="row">Mükemmel tur <b id="hPerf">–</b></div><div class="row">Rekorum <b id="hBest">–</b></div><div class="row" id="hDeltaR">Fark <b id="hDelta">–</b></div>
    <div class="row">S1 · S2 <b id="hSec">–</b></div><div class="row">Duvar <b id="hHits">0</b></div></div>`)),
  map: document.body.appendChild(el(`<div id="map" class="hud glass"><canvas width="${IS_TOUCH ? 150 : 200}" height="${IS_TOUCH ? 96 : 128}"></canvas></div>`)),
  spd: document.body.appendChild(el(`<div id="spd" class="hud glass"><span class="gear" id="hGear">N</span><div class="v" id="hSpd">0</div><div class="u">KM/S</div><div id="nitro"><i></i></div></div>`)),
  msg: document.body.appendChild(el(`<div id="msg" class="hud"><div id="lights"><i></i><i></i><i></i><i></i><i></i></div><div class="t" id="mT"></div><div class="s" id="mS"></div></div>`)),
  warn: document.body.appendChild(el(`<div id="warn" class="hud">ÇİM</div>`)),
  keys: document.body.appendChild(el(`<div id="keys" class="hud glass">W/↑ gaz · S/↓ fren · A/D direksiyon · Shift nitro · Space el freni · R yarış · F serbest · C kamera</div>`)),
};
const $ = (id) => document.getElementById(id);
const lightsEl = $('lights');
lightsEl.style.display = 'none';
let flashUntil = 0;
function flash(t, s = '', ms = 1400) {
  $('mT').textContent = t;
  $('mS').textContent = s;
  flashUntil = performance.now() + ms;
}
function setLights(n) {
  lightsEl.style.display = n > 0 ? 'flex' : 'none';
  [...lightsEl.children].forEach((d, k) => d.classList.toggle('on', k < n));
  gantryLights.forEach((m, k) => (m.emissiveIntensity = k < n ? 4 : 0));
}

// panel
const pbtn = document.body.appendChild(el(`<button id="pbtn" class="btn pri">⚙ Test paneli</button>`));
const panel = document.body.appendChild(el(`<div id="panel" class="glass"></div>`));
const tbl = document.body.appendChild(el(`<div id="tbl"><div class="card glass"></div></div>`));
const res = document.body.appendChild(el(`<div id="res" class="glass"></div>`));
pbtn.onclick = () => {
  panel.classList.toggle('open');
  renderPanel();
};
tbl.onclick = (e) => e.target === tbl && tbl.classList.remove('open');
const CAR_NAMES = PS.CAR_IDS.map((id) => PS.pistStats(id, 1));
function renderPanel() {
  const pf = (id) => perfectOf(id, cfg.lv, cfg.nitro);
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h2>Pist prototipi</h2><button class="btn" id="pClose">✕</button></div>
    <div class="note" style="margin-top:6px">Pist ${Math.round(T.LEN)} m · 13 m genişlik · tek tur yarış. Şampiyona ödül eşiği: <b style="color:#4dff8a">25,00 sn</b>.</div>
    <h3>ARAÇ</h3>
    <div class="cars">${CAR_NAMES.map((c) => `<div class="car ${c.catalogId === cfg.car ? 'sel' : ''}" data-car="${c.catalogId}"><span>${c.catalogId}. ${c.name}<br><small>${c.price.toLocaleString('tr-TR')} altın · ${Math.round(PS.pistStats(c.catalogId, cfg.lv, statsOpts()).vmax * 3.6)} km/s</small></span><span class="pt">${pf(c.catalogId) ? fmt(pf(c.catalogId).ms) : '–'}</span></div>`).join('')}</div>
    <h3>SEVİYE</h3><div class="seg">${[1, 2, 3].map((l) => `<button class="btn ${l === cfg.lv ? 'sel' : ''}" data-lv="${l}">Seviye ${l}</button>`).join('')}</div>
    <h3>HIZ DENGESİ</h3><div class="seg"><button class="btn ${cfg.denge === 'sehir' ? 'sel' : ''}" data-denge="sehir">Şehirdeki gibi</button><button class="btn ${cfg.denge === 'eski' ? 'sel' : ''}" data-denge="eski">Eski yarış dengesi</button></div>
    <p class="note" style="margin:6px 0 0">${cfg.denge === 'eski' ? 'Her araç/seviye eski pistteki sürelerine denk gelecek şekilde hızlandırıldı (ödül tablosu aynen kalır). En pahalı araç sv3 değişmez.' : 'Araçlar şehirdeki hız ve ivmeleriyle yarışır (seviye çarpanı hariç). Ucuz araçlar eski piste göre belirgin yavaş.'}</p>
    <h3>NİTRO</h3><div class="seg"><button class="btn ${cfg.nitro ? 'sel' : ''}" data-nitro="1">Açık (${P.ncap.toFixed(1)} sn)</button><button class="btn ${!cfg.nitro ? 'sel' : ''}" data-nitro="0">Kapalı</button></div>
    <h3>HAYALET (YARIŞTA)</h3><div class="seg"><button class="btn ${cfg.ghost === 'perfect' ? 'sel' : ''}" data-ghost="perfect">Mükemmel tur</button><button class="btn ${cfg.ghost === 'mine' ? 'sel' : ''}" data-ghost="mine">Rekorum</button><button class="btn ${cfg.ghost === 'off' ? 'sel' : ''}" data-ghost="off">Kapalı</button></div>
    <h3>KAMERA</h3><div class="seg">${CAMS.map(([k, n]) => `<button class="btn ${cfg.cam === k ? 'sel' : ''}" data-cam="${k}">${n}</button>`).join('')}</div>
    <div class="acts"><button class="btn go" id="pRace">🏁 Yarışı başlat</button><button class="btn" id="pFree">Serbest tur</button><button class="btn" id="pAuto">🤖 Bot sürsün</button><button class="btn" id="pTbl">📊 Tüm araçlar</button></div>
    <p class="note">"Mükemmel tur": bilgisayarın binlerce tuş dizisini deneyerek bulduğu en hızlı tur (insanın ulaşabileceği tavan). Eski pistte aynı yöntem en pahalı araç (sv3) için 24,15 sn buluyor; oyuncu rekoru 24,5 sn. Yeni pist bu noktaya ayarlandı. ${!cfg.nitro ? '<br><b>Nitro kapalıyken mükemmel tur hesaplanmadı.</b>' : ''}</p>
    <p class="note">Sürüş fiziği şehirdekiyle aynıdır (stepDrive). Seviye: hız ×${PS.LEVEL_MUL.vmax.join(' / ')}, ivme ×${PS.LEVEL_MUL.acc.join(' / ')}, yol tutuş ×${PS.LEVEL_MUL.grip.join(' / ')}.</p>`;
  $('pClose').onclick = () => panel.classList.remove('open');
  panel.querySelectorAll('[data-car]').forEach((b) => (b.onclick = () => change({ car: Number(b.dataset.car) })));
  panel.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => change({ lv: Number(b.dataset.lv) })));
  panel.querySelectorAll('[data-denge]').forEach((b) => (b.onclick = () => change({ denge: b.dataset.denge })));
  panel.querySelectorAll('[data-nitro]').forEach((b) => (b.onclick = () => change({ nitro: b.dataset.nitro === '1' })));
  panel.querySelectorAll('[data-ghost]').forEach((b) => (b.onclick = () => change({ ghost: b.dataset.ghost }, false)));
  panel.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => change({ cam: b.dataset.cam }, false)));
  $('pRace').onclick = () => {
    panel.classList.remove('open');
    startRace(false);
  };
  $('pFree').onclick = () => {
    panel.classList.remove('open');
    startFree();
  };
  $('pAuto').onclick = () => {
    panel.classList.remove('open');
    if (!perfectOf(cfg.car, cfg.lv, cfg.nitro)) return flash('Kayıt yok', 'Bu araç/seviye (nitro kapalı) için mükemmel tur hesaplanmadı', 2200);
    startRace(true);
  };
  $('pTbl').onclick = () => renderTable();
}
function change(p, rebuild = true) {
  Object.assign(cfg, p);
  saveCfg();
  if (rebuild) {
    setupCar();
    startFree();
  }
  renderPanel();
}
let tblLv = 3;
function renderTable() {
  const lv = tblLv;
  const pr = (ms) => (ms ? championshipTimePrize(ms) : 0);
  const prS = (ms) => (pr(ms) ? pr(ms).toLocaleString('tr-TR') : '–');
  const rows = PS.CAR_IDS.map((id) => {
    const c = PS.pistStats(id, 1);
    const old = ESKI_PIST_MS?.[`${id}_${lv}`];
    const a = perfectOf(id, lv, true, 'sehir');
    const e = perfectOf(id, lv, true, 'eski');
    const meA = store.get(bestKeyOf(id, lv, true, 'sehir'));
    const meE = store.get(bestKeyOf(id, lv, true, 'eski'));
    const cell = (ms) => `<td class="${ms && ms < PRIZE_MS ? 'u25' : ''}">${ms ? fmt(ms) : '…'}</td>`;
    return `<tr><td>${id}. ${c.name}</td>${cell(old)}<td>${prS(old)}</td>${cell(a?.ms)}<td>${prS(a?.ms)}</td>${cell(e?.ms)}<td class="me">${meA ? fmt(meA.ms) : '–'}${meE ? ' / ' + fmt(meE.ms) : ''}</td></tr>`;
  }).join('');
  tbl.firstChild.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0;font-size:17px">Mükemmel turlar · Seviye ${lv} · nitro açık</h2><button class="btn" id="tClose">✕</button></div>
    <div class="seg" style="margin:10px 0">${[1, 2, 3].map((l) => `<button class="btn ${l === lv ? 'sel' : ''}" data-tlv="${l}">Seviye ${l}</button>`).join('')}</div>
    <p class="note">Mükemmel tur = bilgisayarın binlerce tuş dizisi deneyerek bulduğu en hızlı tur (gerçek oyuncunun tavanı). Ödül: şu anki şampiyona süre tablosu (championshipPrizes.js). Yeşil: 25 sn altı.</p>
    <table><thead><tr><th>Araç</th><th>Eski pist</th><th>Ödül</th><th>Yeni · şehir</th><th>Ödül</th><th>Yeni · eski denge</th><th>Ben (şehir / denge)</th></tr></thead><tbody>${rows}</tbody></table>`;
  $('tClose').onclick = () => tbl.classList.remove('open');
  tbl.querySelectorAll('[data-tlv]').forEach((b) => (b.onclick = () => ((tblLv = Number(b.dataset.tlv)), renderTable())));
  tbl.classList.add('open');
}
function hideRes() {
  res.classList.remove('open');
}
function showRes({ ms, ver, pf, isBest }) {
  const best = store.get(bestKey());
  const under = ms < PRIZE_MS;
  res.innerHTML = `<div class="note" style="letter-spacing:1.5px;color:#23e6ff;font-weight:800">${autoRuns ? 'BOT TURU' : 'YARIŞ BİTTİ'}${isBest ? ' · YENİ REKOR!' : ''}</div>
    <div class="t" style="color:${under ? '#4dff8a' : '#fff'}">${fmt(ms)}</div>
    <div class="row">Araç <b>${P.name} · Sv${P.level}${cfg.nitro ? '' : ' · nitrosuz'}${cfg.denge === 'eski' ? ' · eski denge' : ''}</b></div>
    <div class="row">Mükemmel tur <b>${pf ? fmt(pf.ms) : '–'}${pf ? ` (+${((ms - pf.ms) / 1000).toFixed(2)})` : ''}</b></div>
    <div class="row">Rekorum <b>${best ? fmt(best.ms) : '–'}</b></div>
    <div class="row">Duvara çarpma <b>${S.hits}</b></div>
    <div class="row">Şampiyona ödülü (bu süreyle) <b style="color:${under ? '#4dff8a' : '#ffd23f'}">${championshipTimePrize(ms) ? championshipTimePrize(ms).toLocaleString('tr-TR') + ' altın' : '–'}</b></div>
    <div class="row">Sunucu doğrulaması <b style="color:${ver.ok && ver.ms === ms ? '#4dff8a' : '#ff4d6d'}">${ver.ok ? (ver.ms === ms ? `✓ aynı süre (${fmt(ver.ms)})` : `✗ ${fmt(ver.ms)}`) : '✗ ' + ver.reason}</b></div>
    <div class="acts"><button class="btn go" id="rAgain">Tekrar (R)</button><button class="btn" id="rFree">Serbest (F)</button><button class="btn" id="rPanel">Panel</button></div>`;
  res.classList.add('open');
  $('rAgain').onclick = () => startRace(Boolean(autoRuns));
  $('rFree').onclick = () => startFree();
  $('rPanel').onclick = () => {
    panel.classList.add('open');
    renderPanel();
  };
}

// dokunmatik düğmeler
if (IS_TOUCH) {
  const tw = document.body.appendChild(el(`<div id="touch"></div>`));
  const mk = (id, label, key) => {
    const b = tw.appendChild(el(`<div class="tb" id="${id}">${label}</div>`));
    const on = (e) => {
      e.preventDefault();
      touchIn[key] = 1;
      b.classList.add('on');
      sound.start();
    };
    const off = (e) => {
      e.preventDefault();
      touchIn[key] = 0;
      b.classList.remove('on');
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  };
  mk('tL', '◀', 'L');
  mk('tR', '▶', 'R');
  mk('tG', 'GAZ', 'G');
  mk('tB', 'FREN', 'B');
  mk('tN', 'NİTRO', 'N');
  mk('tH', 'EL F.', 'H');
}

// mini harita
const mapC = hud.map.querySelector('canvas');
const mapG = mapC.getContext('2d');
const mapTf = (() => {
  const xs = T.PT.map((p) => p[0]);
  const zs = T.PT.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const k = Math.min((mapC.width - 16) / (x1 - x0), (mapC.height - 16) / (z1 - z0));
  // sürücünün sağı haritada da sağ kalsın (x → sağ, z → aşağı)
  return (x, z) => [8 + (x - x0) * k + ((mapC.width - 16) - (x1 - x0) * k) / 2, 8 + (z - z0) * k + ((mapC.height - 16) - (z1 - z0) * k) / 2];
})();
function drawMap() {
  const g = mapG;
  g.clearRect(0, 0, mapC.width, mapC.height);
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  T.PT.forEach((p, i) => {
    const [x, y] = mapTf(p[0], p[1]);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.closePath();
  g.stroke();
  // sektör renkleri
  [[0, T.S1, '#ff2bd6'], [T.S1, T.S2, '#23e6ff'], [T.S2, N, '#ff2bd6']].forEach(([a, b, c]) => {
    g.strokeStyle = c;
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = a; i <= b; i++) {
      const p = T.PT[i % N];
      const [x, y] = mapTf(p[0], p[1]);
      i === a ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  });
  const [sx, sy] = mapTf(T.PT[0][0], T.PT[0][1]);
  g.fillStyle = '#fff';
  g.fillRect(sx - 1, sy - 5, 2, 10);
  if (gS && ghost) {
    const [x, y] = mapTf(gS.x, gS.z);
    g.fillStyle = 'rgba(35,230,255,0.8)';
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  const [x, y] = mapTf(S.x, S.z);
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.arc(x, y, 4, 0, Math.PI * 2);
  g.fill();
}

// --- kamera ---------------------------------------------------------------------------
const CAMS = [
  ['chase', 'Takip'],
  ['far', 'Uzak'],
  ['hood', 'Kaput'],
  ['top', 'Üstten'],
];
function cycleCam() {
  const k = CAMS.findIndex(([c]) => c === cfg.cam);
  cfg.cam = CAMS[(k + 1) % CAMS.length][0];
  saveCfg();
  renderPanel();
}
const camPos = new THREE.Vector3();
let camFirst = true;
let camShake = 0;
let fov = 60;
function updateCamera(pose, dt) {
  const spd = Math.abs(pose.vF);
  const fx = Math.sin(pose.yaw);
  const fz = Math.cos(pose.yaw);
  let want;
  let look;
  if (cfg.cam === 'top') {
    want = new THREE.Vector3(pose.x - fx * 6, 70, pose.z - fz * 6);
    look = new THREE.Vector3(pose.x + fx * 8, 0, pose.z + fz * 8);
  } else if (cfg.cam === 'hood') {
    want = new THREE.Vector3(pose.x + fx * 0.6, 1.25, pose.z + fz * 0.6);
    look = new THREE.Vector3(pose.x + fx * 20, 1.0, pose.z + fz * 20);
  } else {
    // şehirdeki takip kamerasıyla aynı formül (camDist 6,2 · camPitch 0,32)
    const far = cfg.cam === 'far' ? 1.7 : 1;
    const camBack = Math.max(0, car.v.len / 2 - 2.4);
    const dist = (5.4 + spd * 0.055) * far + camBack;
    const hgt = (1.7 + 0.32 * 2.2 + spd * 0.012) * (far > 1 ? 1.5 : 1);
    want = new THREE.Vector3(pose.x - fx * dist, hgt, pose.z - fz * dist);
    look = new THREE.Vector3(pose.x + fx * 2.6, 0.9, pose.z + fz * 2.6);
  }
  if (camFirst || cfg.cam === 'hood') camPos.copy(want);
  else camPos.lerp(want, 1 - Math.exp(-dt * 7));
  camFirst = false;
  camera.position.copy(camPos);
  if (camShake > 0.002) {
    camera.position.x += (Math.random() - 0.5) * camShake;
    camera.position.y += (Math.random() - 0.5) * camShake;
    camShake *= Math.exp(-dt * 7);
  }
  camera.lookAt(look);
  const wantFov = (cfg.cam === 'hood' ? 70 : 60) + Math.min(1, spd / P.vmax) * 16 + (S.nos ? 6 : 0);
  fov += (wantFov - fov) * Math.min(1, dt * 3);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  // gölge ışığı arabayı izler
  sun.position.set(pose.x + 40, 70, pose.z - 30);
  sun.target.position.set(pose.x, 0, pose.z);
  car.v.root.visible = cfg.cam !== 'hood';
}

// --- ses --------------------------------------------------------------------------------
const sound = new EngineSound();

// --- döngü ------------------------------------------------------------------------------
function onResize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

function stepOnce() {
  prevS = { x: S.x, z: S.z, yaw: S.yaw };
  if (mode === 'free') {
    const b = inputBits();
    const before = S.prog;
    PS.stepCar(S, P, b);
    // tur / sektör zamanlaması
    const k0 = Math.floor(before / N);
    const k1 = Math.floor(S.prog / N);
    if (k1 > k0 && S.prog >= 0) {
      if (lapStartF != null && k1 === lapK + 1) {
        lastLap = S.f - lapStartF;
        if (freeBest == null || lastLap < freeBest) freeBest = lastLap;
        flash(fmtF(lastLap), freeBest === lastLap ? 'Tur süresi · en iyi turun' : 'Tur süresi', 1800);
      }
      lapStartF = S.f;
      lapK = k1;
      sectors = [];
    }
    const pm = ((S.prog % N) + N) % N;
    if (lapStartF != null && S.prog >= lapK * N) {
      if (sectors.length === 0 && pm >= T.S1 && pm < T.S2) sectors.push(S.f - lapStartF);
      if (sectors.length === 1 && pm >= T.S2) sectors.push(S.f - lapStartF);
    }
  } else if (mode === 'racing') {
    const b = autoPtr ? autoPtr() : inputBits();
    rec.push(b);
    PS.stepCar(S, P, b, PS.RACE_FINISH);
    const pm = S.prog;
    if (sectors.length === 0 && pm >= T.S1) sectors.push(S.f);
    if (sectors.length === 1 && pm >= T.S2) sectors.push(S.f);
    if (gS && !gS.done) PS.stepCar(gS, P, gPtr(), PS.RACE_FINISH);
    if (S.done) finishRace();
  } else if (mode === 'finished') {
    // bitişten sonra araç yavaşça durur (kayıt dışı)
    PS.stepCar(S, P, PS.IN_B);
    if (gS && !gS.done) PS.stepCar(gS, P, gPtr(), PS.RACE_FINISH);
  }
}

let last = performance.now();
let acc = 0;
let gPrev = null;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  // geri sayım (fizik durur, saat başlamaz)
  if (mode === 'countdown') {
    countT += dt;
    const n = Math.min(5, Math.floor(countT / 0.8) + (countT > 0 ? 1 : 0));
    if (countT < 4) {
      setLights(n);
      $('mT').textContent = '';
      $('mS').textContent = 'Işıklar sönünce bas!';
      flashUntil = now + 100;
    } else if (countT >= 4 + goDelay) {
      setLights(0);
      mode = 'racing';
      sectors = [];
      acc = 0;
      flash('GİT!', '', 700);
    } else setLights(5);
    sound.update(Math.min(1, (inputBits() & (PS.IN_G | PS.IN_N) ? 0.55 : 0.05)), inputBits() & PS.IN_G ? 1 : 0);
  } else {
    acc += dt;
    let n = 0;
    while (acc >= PS.DT && n < 20) {
      gPrev = gS ? { x: gS.x, z: gS.z, yaw: gS.yaw } : null;
      stepOnce();
      acc -= PS.DT;
      n++;
    }
  }
  const alpha = Math.min(1, acc / PS.DT);
  const pose = poseCar(car, S, P, mode === 'countdown' ? null : prevS, alpha, dt);
  if (ghost && gS) {
    poseCar(ghost, gS, P, gPrev, alpha, dt);
    ghost.v.root.visible = mode !== 'free';
  }
  // efektler
  const fwdL = Math.abs(S.vF);
  const vL = Math.abs(-S.vx * Math.cos(S.yaw) + S.vz * Math.sin(S.yaw));
  const skid = vL > 2.2 || (keys.Space && fwdL > 5);
  if (skid && mode !== 'countdown' && S.surf <= 1) {
    car.skD = (car.skD || 0) + fwdL * dt;
    if (car.skD > 0.35) {
      car.skD = 0;
      const fx = Math.sin(S.yaw);
      const fz = Math.cos(S.yaw);
      for (const s of [-1, 1]) addSkid(S.x - fx * P.wb * 0.5 + fz * s * 0.8, S.z - fz * P.wb * 0.5 - fx * s * 0.8, S.yaw);
    }
  }
  car.fx.visible = Boolean(S.nos);
  if (S.nos) car.fx.children.forEach((f) => f.scale.set(1, 1, 0.7 + Math.random() * 0.6));
  car.v.tlMat && (car.v.tlMat.emissiveIntensity = inputBits() & PS.IN_B && S.vF > 0.4 ? 5 : 1.4);
  if (S.hit && now - lastHitSound > 250) {
    camShake = Math.min(0.45, Math.abs(S.hit) * 0.03);
    sound.thump(Math.abs(S.hit));
    lastHitSound = now;
  }
  if (mode !== 'countdown') sound.update(Math.min(1, fwdL / P.vmax), inputBits() & (PS.IN_G | PS.IN_N) ? 1 : inputBits() & PS.IN_B ? -1 : 0, skid ? Math.min(1, vL / 6 + 0.3) : 0);
  updateCamera(pose, dt);
  updateHud(now);
  renderer.render(scene, camera);
}

function updateHud(now) {
  const kmh = Math.round(Math.abs(S.vF) * 3.6);
  $('hSpd').textContent = kmh;
  $('hGear').textContent = S.vF < -0.3 ? 'R' : Math.abs(S.vF) < 0.3 ? 'N' : String(1 + Math.min(4, Math.floor((Math.abs(S.vF) / P.vmax) * 5)));
  const nb = $('nitro');
  nb.style.visibility = P.nitro ? 'visible' : 'hidden';
  nb.firstChild.style.width = `${Math.round(S.nitro * 100)}%`;
  nb.classList.toggle('on', Boolean(S.nos));
  const pf = perfectOf(cfg.car, cfg.lv, cfg.nitro);
  const best = store.get(bestKey());
  $('hPerf').textContent = pf ? fmt(pf.ms) : '–';
  $('hHits').textContent = S.hits;
  const modeTxt = { free: 'SERBEST TUR', countdown: 'YARIŞ · HAZIR OL', racing: autoRuns ? 'YARIŞ · BOT SÜRÜYOR' : 'YARIŞ', finished: 'YARIŞ BİTTİ' }[mode];
  $('hMode').textContent = `${modeTxt} · ${P.name} Sv${P.level}${cfg.denge === 'eski' ? ' · E' : ''}`;
  if (mode === 'free') {
    $('hTime').textContent = lapStartF != null ? fmtF(S.f - lapStartF) : '0.00';
    $('hBest').textContent = freeBest != null ? `${fmtF(freeBest)} (tur)` : best ? fmt(best.ms) : '–';
    $('hDelta').textContent = lastLap != null ? `son tur ${fmtF(lastLap)}` : '–';
    $('hDelta').className = '';
  } else {
    const f = mode === 'countdown' ? 0 : S.f;
    $('hTime').textContent = fmtF(f);
    $('hBest').textContent = best ? fmt(best.ms) : '–';
    if (gTimeline && mode !== 'countdown') {
      const k = Math.max(0, Math.min(gTimeline.length - 1, S.prog + PS.GRID_BACK));
      const d = PS.framesToMs(S.f - gTimeline[k]) / 1000;
      $('hDelta').textContent = `${d >= 0 ? '+' : ''}${d.toFixed(2)}`;
      $('hDelta').className = d <= 0 ? 'dpos' : 'dneg';
    } else {
      $('hDelta').textContent = '–';
      $('hDelta').className = '';
    }
  }
  $('hSec').textContent = sectors.length ? sectors.map((f, i) => fmtF(i ? f - sectors[i - 1] : f)).join(' · ') : '–';
  // uyarı
  const w = hud.warn;
  if (S.surf >= 2 && mode !== 'countdown') {
    w.style.display = 'block';
    w.textContent = S.surf === 3 ? 'ÇAKIL!' : 'PİST DIŞI';
    w.className = `hud${S.surf === 3 ? ' gravel' : ''}`;
  } else w.style.display = 'none';
  if (now > flashUntil && mode !== 'countdown') {
    $('mT').textContent = '';
    $('mS').textContent = '';
  }
  drawMap();
}

setupCar();
startFree();
requestAnimationFrame(frame);
// test için
window.__pist = { PS, get S() { return S; }, get mode() { return mode; }, startRace, startFree, cfg, change };
