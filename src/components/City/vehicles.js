// =============================================================================
// SADECE ÖNİZLEME — Oyundaki 10 araba (src/data/vehicleCatalog.js) için 3D
// modeller. Oyunun kendi araba oluşturucusunun (houseCatalog carBuild: yan
// siluet ekstrüzyonu + kabin + jant + far) aynı yöntemiyle; her araba galeri
// görselindeki tipine benzesin diye kendi silueti, rengi ve detayı var.
// Sürüş için tekerlekler (dönme + direksiyon), gövde (yatma), farlar ve
// stop lambaları ayrı tutulur.
// =============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from '../HouseScreen/houseCatalog.js';
import { labelTexture } from '../HouseScreen/houseTextures.js';

const PI = Math.PI;
const CHROME = () => M('#e2e2e6', 0.1, 1);
const RUBBER = () => M('#121212', 0.92, 0);
const shade = (o) => {
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};
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
const box = (g, w, h, d, x, y, z, m, rz = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.z = rz;
  g.add(shade(o));
  return o;
};
const rbox = (g, w, h, d, r, x, y, z, m) => {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), m);
  o.position.set(x, y, z);
  g.add(shade(o));
  return o;
};
// tekerlek: pivot (direksiyon, y ekseni) → spin (dönme, z ekseni)
function wheel(parent, x, y, z, r, tw, { rimM = CHROME(), whitewall = false, spokes = 5, mirror = false, caliper = '#c8141e', thin = false } = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  const w = new THREE.Group();
  pivot.add(w);
  const ri = r * (thin ? 0.82 : 0.68);
  const tire = new THREE.Mesh(
    new THREE.LatheGeometry([[ri, -tw / 2], [r - 0.03, -tw / 2], [r, -tw / 2 + 0.035], [r, tw / 2 - 0.035], [r - 0.03, tw / 2], [ri, tw / 2]].map(([a, b]) => new THREE.Vector2(a, b)), 32),
    RUBBER()
  );
  tire.rotation.x = PI / 2;
  w.add(shade(tire));
  const side = mirror ? -1 : 1;
  if (whitewall) {
    const ww = new THREE.Mesh(new THREE.RingGeometry(ri + 0.01, ri + 0.07, 32), M('#f0efe8', 0.6));
    ww.position.z = side * (tw / 2 + 0.001);
    if (mirror) ww.rotation.y = PI;
    w.add(ww);
  }
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, tw * 0.8, 24), M('#1a1a1c', 0.4, 0.6));
  rim.rotation.x = PI / 2;
  w.add(rim);
  const face = new THREE.Group();
  face.position.z = side * (tw * 0.4 + 0.005);
  w.add(face);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(ri * 0.9, thin ? 0.02 : 0.045, 0.03), rimM);
    sp.position.set(Math.cos(a) * ri * 0.5, Math.sin(a) * ri * 0.5, 0);
    sp.rotation.z = a;
    face.add(sp);
  }
  face.add(new THREE.Mesh(new THREE.TorusGeometry(ri - 0.01, 0.015, 8, 28), rimM));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), rimM);
  hub.rotation.x = PI / 2;
  face.add(hub);
  if (!thin) {
    // kaliper dönmez → pivot'a
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), M(caliper, 0.35, 0.3));
    cal.position.set(ri * 0.55, ri * 0.35, side * 0.03);
    pivot.add(cal);
  }
  return { pivot, spin: w, r };
}
let plateTex = null;
function plateTexture() {
  if (plateTex) return plateTex;
  plateTex = labelTexture('plate_city', 256, 56, (c, w, h) => {
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
  });
  return plateTex;
}

// =============================================================================
// 10 ARABA (id = vehicleCatalog id). phys: vmax (m/sn), acc, grip, steer
// =============================================================================
export const VEHICLES = [
  {
    id: 1, name: 'Klasik Tur Arabası', paint: { c: '#121214', r: 0.25, m: 0.4 },
    phys: { vmax: 17, acc: 4.2, grip: 7, steer: 0.55 },
    spec: {
      L: 4.2, Wd: 1.42, y0: 0.62, wr: 0.45, tw: 0.15, wx: [-1.45, 1.5], wz: 0.78, spokes: 14, thin: true, rimC: '#e8dcc0', open: true,
      top: [['Q', 2.0, 0.62, 2.0, 0.8], ['L', 2.0, 1.18], ['L', 0.55, 1.22], ['L', 0.4, 1.3], ['L', -1.8, 1.32], ['Q', -2.1, 1.32, -2.1, 1.0], ['L', -2.1, 0.8], ['Q', -2.1, 0.62, -1.95, 0.62]],
      wind: [[0.45, 1.3], [0.4, 1.85]], seat: [-0.6, 1.2], hl: null, tl: [-2.1, 1.0], plateR: [-2.12, 0.85],
      extra: tourerExtra,
    },
  },
  {
    id: 2, name: 'Şehir Hatchback', paint: { c: '#f2a51f', r: 0.25, m: 0.4 },
    phys: { vmax: 24, acc: 6.5, grip: 9, steer: 0.62 },
    spec: {
      L: 3.95, Wd: 1.75, y0: 0.32, wr: 0.32, tw: 0.22, wx: [-1.25, 1.3], spokes: 5,
      top: [['Q', 1.97, 0.32, 1.98, 0.5], ['L', 1.95, 0.66], ['Q', 1.9, 0.8, 1.55, 0.85], ['L', 0.9, 0.95], ['L', -1.85, 1.02], ['Q', -1.97, 1.02, -1.98, 0.9], ['L', -1.98, 0.5], ['Q', -1.98, 0.32, -1.85, 0.32]],
      cab: { A: [0.9, 0.94], Bp: [0.05, 1.48], Cp: [-1.62, 1.52], D: [-1.93, 1.01], ctrl: [-0.8, 1.58] },
      hl: [1.9, 0.7], tl: [-1.97, 0.95], plateF: [1.99, 0.45], plateR: [-1.99, 0.62], seat: [-0.2, 0.8],
    },
  },
  {
    id: 3, name: 'Pickup', paint: { c: '#6e1424', r: 0.22, m: 0.55 },
    phys: { vmax: 26, acc: 6.2, grip: 8, steer: 0.5 },
    spec: {
      L: 5.3, Wd: 2.0, y0: 0.46, wr: 0.42, tw: 0.3, wx: [-1.75, 1.7], spokes: 6, grilleH: 0.34, grilleW: 0.75, chromeGrille: true,
      top: [['Q', 2.65, 0.46, 2.65, 0.7], ['L', 2.63, 1.02], ['Q', 2.58, 1.18, 2.3, 1.2], ['L', 1.2, 1.25], ['L', -2.55, 1.25], ['L', -2.65, 1.2], ['L', -2.65, 0.6], ['Q', -2.65, 0.46, -2.5, 0.46]],
      cab: { A: [1.22, 1.24], Bp: [0.6, 1.9], Cp: [-0.6, 1.92], D: [-0.72, 1.25], ctrl: [0.0, 1.97] },
      hl: [2.6, 1.0], tl: [-2.62, 1.05], plateF: [2.67, 0.65], plateR: [-2.67, 0.75], seat: [0.2, 1.1],
      extra: (car) => {
        box(car, 1.75, 0.02, 1.65, -1.68, 1.265, 0, M('#141416', 0.9));
        box(car, 0.06, 0.4, 1.7, -0.85, 1.45, 0, CHROME());
        [-1, 1].forEach((s) => box(car, 3.0, 0.05, 0.04, -0.2, 0.62, s * 1.01, CHROME()));
      },
    },
  },
  {
    id: 4, name: 'Klasik Spor Coupe', paint: { c: '#e9651c', r: 0.24, m: 0.45 },
    phys: { vmax: 33, acc: 8.0, grip: 9.5, steer: 0.6 },
    spec: {
      L: 4.25, Wd: 1.75, y0: 0.28, wr: 0.33, tw: 0.24, wx: [-1.25, 1.22], spokes: 5,
      top: [['Q', 2.12, 0.28, 2.13, 0.42], ['Q', 2.1, 0.62, 1.8, 0.7], ['L', 0.75, 0.82], ['L', -1.9, 0.86], ['Q', -2.14, 0.82, -2.13, 0.6], ['L', -2.13, 0.42], ['Q', -2.13, 0.28, -2.0, 0.28]],
      cab: { A: [0.75, 0.82], Bp: [0.1, 1.24], Cp: [-0.55, 1.26], D: [-2.0, 0.84], ctrl: [-0.25, 1.32] },
      hl: null, tl: [-2.12, 0.66], plateF: [2.14, 0.38], plateR: [-2.14, 0.48], seat: [-0.2, 0.7],
      extra: (car, paint) => {
        roundLamps(car, 1.62, 0.74, 0.56, paint);
        [-1, 1].forEach((s) => {
          box(car, 3.4, 0.16, 0.012, -0.1, 0.42, s * 0.886, M('#f2efe6', 0.4));
          box(car, 3.4, 0.05, 0.012, -0.1, 0.53, s * 0.887, M('#111', 0.4));
        });
      },
    },
  },
  {
    id: 5, name: 'Sedan M-Sport', paint: { c: '#1745b5', r: 0.2, m: 0.6 },
    phys: { vmax: 36, acc: 8.6, grip: 10, steer: 0.58 },
    spec: {
      L: 4.6, Wd: 1.82, y0: 0.28, wr: 0.33, tw: 0.24, wx: [-1.4, 1.38], spokes: 5,
      top: [['Q', 2.3, 0.28, 2.31, 0.46], ['L', 2.29, 0.62], ['Q', 2.25, 0.76, 1.9, 0.8], ['L', 0.9, 0.9], ['L', -1.5, 0.94], ['Q', -2.25, 0.96, -2.3, 0.82], ['L', -2.3, 0.46], ['Q', -2.3, 0.28, -2.15, 0.28]],
      cab: { A: [0.92, 0.9], Bp: [0.12, 1.34], Cp: [-0.95, 1.37], D: [-1.58, 0.94], ctrl: [-0.4, 1.44] },
      hl: [2.27, 0.66], tl: [-2.3, 0.76], plateF: [2.33, 0.42], plateR: [-2.33, 0.55], seat: [-0.2, 0.75], kidney: true, quad: true, dualExhaust: true,
    },
  },
  {
    id: 6, name: 'Klasik Muscle Car', paint: { c: '#121215', r: 0.2, m: 0.6 },
    phys: { vmax: 40, acc: 10.0, grip: 8, steer: 0.52 },
    spec: {
      L: 4.95, Wd: 1.9, y0: 0.3, wr: 0.36, tw: 0.3, wx: [-1.5, 1.6], spokes: 6, grilleH: 0.24, grilleW: 0.8, chromeGrille: true,
      top: [['Q', 2.5, 0.3, 2.5, 0.48], ['L', 2.49, 0.82], ['L', 2.3, 0.86], ['L', 0.55, 0.96], ['L', -1.8, 0.98], ['Q', -2.45, 0.98, -2.47, 0.84], ['L', -2.48, 0.48], ['Q', -2.48, 0.3, -2.3, 0.3]],
      cab: { A: [0.58, 0.95], Bp: [-0.1, 1.34], Cp: [-1.05, 1.36], D: [-1.75, 0.98], ctrl: [-0.55, 1.4] },
      hl: [2.47, 0.7], tl: [-2.46, 0.8], plateF: [2.52, 0.42], plateR: [-2.5, 0.56], dualExhaust: true, seat: [-0.4, 0.8],
      extra: (car, paint) => {
        rbox(car, 0.7, 0.12, 0.45, 0.04, 1.4, 0.95, 0, M('#0a0a0b', 0.5));
        box(car, 0.12, 0.08, 1.6, -2.4, 1.02, 0, paint);
        [-1, 1].forEach((s) => box(car, 4.2, 0.005, 0.16, 0.1, 0.99, s * 0.2, M('#8a8f99', 0.3, 0.6)));
      },
    },
  },
  {
    id: 7, name: 'Lüks GT Coupe', paint: { c: '#b9bdc6', r: 0.14, m: 0.92 },
    phys: { vmax: 45, acc: 11, grip: 10.5, steer: 0.56 },
    spec: {
      L: 4.75, Wd: 1.92, y0: 0.26, wr: 0.35, tw: 0.27, wx: [-1.42, 1.52], spokes: 10,
      top: [['Q', 2.37, 0.26, 2.38, 0.42], ['Q', 2.32, 0.6, 1.95, 0.67], ['L', 0.55, 0.84], ['L', -1.6, 0.9], ['Q', -2.35, 0.92, -2.37, 0.66], ['L', -2.37, 0.42], ['Q', -2.37, 0.26, -2.22, 0.26]],
      cab: { A: [0.55, 0.84], Bp: [-0.3, 1.24], Cp: [-0.95, 1.25], D: [-1.9, 0.9], ctrl: [-0.6, 1.3] },
      hl: [2.25, 0.58], tl: [-2.35, 0.74], plateF: [2.4, 0.38], plateR: [-2.39, 0.5], dualExhaust: true, seat: [-0.5, 0.72], grilleH: 0.01,
      extra: (car) => {
        // Aston tarzı geniş krom ızgara
        const g = new THREE.Group();
        g.position.set(2.4, 0.43, 0);
        car.add(g);
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 6), CHROME());
        frame.scale.set(1, 0.42, 1.9);
        frame.rotation.y = PI / 2;
        g.add(frame);
        for (let i = -2; i <= 2; i++) box(g, 0.02, 0.012, 0.95 - Math.abs(i) * 0.08, 0, i * 0.045, 0, CHROME());
        [-1, 1].forEach((s) => box(car, 0.5, 0.06, 0.02, 1.15, 0.6, s * 0.97, CHROME()));
      },
    },
  },
  {
    id: 8, name: 'Track-Spec Süper Spor', paint: { c: '#f2f2ef', r: 0.24, m: 0.35 },
    phys: { vmax: 50, acc: 13, grip: 12, steer: 0.6 },
    spec: {
      L: 4.5, Wd: 1.98, y0: 0.22, wr: 0.35, tw: 0.3, wx: [-1.3, 1.28], spokes: 10, rimC: '#1a1a1c', caliper: '#f2c400',
      top: [['Q', 2.25, 0.22, 2.26, 0.38], ['Q', 2.23, 0.58, 1.9, 0.66], ['L', 0.75, 0.8], ['L', -1.95, 0.86], ['Q', -2.27, 0.84, -2.26, 0.58], ['L', -2.26, 0.38], ['Q', -2.26, 0.22, -2.1, 0.22]],
      cab: { A: [0.75, 0.8], Bp: [0.08, 1.2], Cp: [-0.58, 1.22], D: [-2.05, 0.86], ctrl: [-0.28, 1.28] },
      hl: null, tl: [-2.25, 0.66], plateF: [2.27, 0.32], plateR: [-2.27, 0.45], seat: [-0.25, 0.65],
      extra: (car, paint) => {
        roundLamps(car, 1.72, 0.7, 0.6, paint, true);
        const dark = M('#0e0e10', 0.3, 0.5);
        box(car, 0.42, 0.04, 1.95, -2.05, 1.32, 0, dark);
        [-0.55, 0.55].forEach((z) => box(car, 0.14, 0.36, 0.03, -2.0, 1.12, z, dark));
        [-1, 1].forEach((s) => {
          box(car, 2.2, 0.1, 0.01, -0.2, 0.42, s * 0.996, M('#111', 0.5));
          box(car, 0.5, 0.18, 0.02, -1.1, 0.55, s * 0.99, M('#050505', 0.5));
        });
        box(car, 2.1, 0.02, 0.5, 0.3, 0.02, 0, dark); // difüzör/splitter
        box(car, 0.25, 0.04, 1.9, 2.2, 0.22, 0, dark);
      },
    },
  },
  {
    id: 9, name: 'GT Yarış Arabası', paint: { c: '#f4f4f2', r: 0.22, m: 0.35 },
    phys: { vmax: 52, acc: 13.5, grip: 12.5, steer: 0.6 },
    spec: {
      L: 4.65, Wd: 2.02, y0: 0.18, wr: 0.34, tw: 0.32, wx: [-1.42, 1.42], spokes: 6, rimC: '#1b1b1d', caliper: '#c8141e',
      top: [['Q', 2.33, 0.18, 2.34, 0.34], ['L', 2.32, 0.52], ['Q', 2.28, 0.66, 1.9, 0.7], ['L', 0.8, 0.82], ['L', -1.6, 0.88], ['Q', -2.3, 0.9, -2.33, 0.74], ['L', -2.33, 0.34], ['Q', -2.33, 0.18, -2.18, 0.18]],
      cab: { A: [0.82, 0.82], Bp: [0.0, 1.22], Cp: [-0.85, 1.24], D: [-1.62, 0.88], ctrl: [-0.4, 1.3] },
      hl: [2.27, 0.56], tl: [-2.32, 0.7], plateF: null, plateR: null, seat: [-0.3, 0.65], kidney: true, dualExhaust: true,
      extra: (car) => {
        const dark = M('#0e0e10', 0.3, 0.5);
        box(car, 0.45, 0.04, 2.05, -2.1, 1.25, 0, dark);
        [-0.6, 0.6].forEach((z) => box(car, 0.14, 0.33, 0.03, -2.05, 1.06, z, dark));
        box(car, 0.3, 0.04, 2.0, 2.3, 0.16, 0, dark);
        // M şeritleri (açık mavi, lacivert, kırmızı) — kaput + yanlar
        const cols = ['#4fa3e0', '#1b2a7a', '#d0161e'];
        cols.forEach((c, i) => {
          box(car, 1.5, 0.006, 0.12, 1.55, 0.76, -0.18 + i * 0.13, M(c, 0.4));
          [-1, 1].forEach((s) => box(car, 2.6, 0.09, 0.006, -0.3, 0.62 - i * 0.1, s * 1.012, M(c, 0.4)));
        });
        // kapıda yarış numarası
        const t = labelTexture('no77', 128, 128, (c, w) => {
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(w / 2, w / 2, 60, 0, 7);
          c.fill();
          c.strokeStyle = '#111';
          c.lineWidth = 6;
          c.stroke();
          c.fillStyle = '#111';
          c.font = '900 70px Arial';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('77', w / 2, w / 2 + 4);
        });
        [-1, 1].forEach((s) => {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5 }));
          p.position.set(0.15, 0.62, s * 1.016);
          if (s < 0) p.rotation.y = PI;
          car.add(p);
        });
      },
    },
  },
  {
    id: 10, name: 'Üstün Cabrio', paint: { c: '#26339a', r: 0.12, m: 0.75 },
    phys: { vmax: 55, acc: 14, grip: 11, steer: 0.58 },
    spec: {
      L: 4.45, Wd: 1.9, y0: 0.22, wr: 0.33, tw: 0.28, wx: [-1.35, 1.35], spokes: 5, open: true,
      top: [['Q', 2.22, 0.22, 2.23, 0.36], ['Q', 2.18, 0.55, 1.8, 0.6], ['L', 0.35, 0.78], ['L', -1.7, 0.84], ['Q', -2.22, 0.86, -2.23, 0.62], ['L', -2.23, 0.36], ['Q', -2.23, 0.22, -2.1, 0.22]],
      wind: [[0.35, 0.78], [-0.05, 1.12]], hl: [2.08, 0.52], tl: [-2.22, 0.7], plateF: [2.24, 0.3], plateR: [-2.24, 0.45], seat: [-0.55, 0.62], dualExhaust: true,
      extra: (car) => {
        [-1, 1].forEach((s) => box(car, 0.6, 0.04, 0.02, 1.25, 0.5, s * 0.96, M('#0a0a0b', 0.4)));
      },
    },
  },
];
// kaç kişi binebilir (sürücü dahil) — araba tipine göre
export const SEATS = { 1: 4, 2: 4, 3: 4, 4: 2, 5: 4, 6: 2, 7: 2, 8: 2, 9: 1, 10: 2 };
VEHICLES.forEach((v) => {
  v.seats = SEATS[v.id] || 2;
});
export const VEHICLE_BY_ID = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));

function roundLamps(car, x, y, z, paint, blackRing = false) {
  [-1, 1].forEach((s) => {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), paint);
    pod.scale.set(1.1, 0.8, 1);
    pod.position.set(x, y, s * z);
    car.add(shade(pod));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), car.userData.hlMat);
    lens.position.set(x + 0.18, y + 0.01, s * z);
    lens.rotation.y = PI / 2;
    car.add(lens);
    if (blackRing) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.018, 6, 20), M('#0a0a0a', 0.4));
      r.position.copy(lens.position);
      r.rotation.y = PI / 2;
      car.add(r);
    }
  });
}
function tourerExtra(car, paint) {
  const black = M('#111113', 0.3, 0.4);
  // ayrı çamurluklar + basamak
  [[-1.45], [1.5]].forEach(([x]) => {
    [-1, 1].forEach((s) => {
      const f = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 8, 20, PI), black);
      f.scale.set(1, 1, 1.25);
      f.position.set(x, 0.45, s * 0.78);
      car.add(shade(f));
    });
  });
  [-1, 1].forEach((s) => box(car, 1.9, 0.05, 0.3, 0.02, 0.6, s * 0.78, black));
  // radyatör (dik, krom)
  box(car, 0.12, 0.72, 0.62, 2.05, 1.0, 0, CHROME());
  box(car, 0.13, 0.62, 0.52, 2.06, 1.0, 0, M('#1a1a1a', 0.5, 0.5));
  // yuvarlak farlar (çubuk üstünde)
  box(car, 0.05, 0.05, 1.2, 2.2, 1.05, 0, CHROME());
  [-1, 1].forEach((s) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, PI), CHROME());
    b.rotation.y = -PI / 2;
    b.position.set(2.22, 1.15, s * 0.55);
    car.add(b);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), car.userData.hlMat);
    lens.position.set(2.23, 1.15, s * 0.55);
    lens.rotation.y = PI / 2;
    car.add(lens);
  });
  // katlanmış kahverengi tente
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.35, 16), M('#6b4423', 0.85));
  top.rotation.x = PI / 2;
  top.position.set(-1.75, 1.45, 0);
  car.add(shade(top));
  // yedek lastik
  const sp = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.1, 10, 24), RUBBER());
  sp.rotation.y = PI / 2;
  sp.position.set(-2.22, 1.0, 0);
  car.add(shade(sp));
  void paint;
}

// iç mekân (açık tavanlı arabalar): koltuk + direksiyon
function cockpit(car, spec, paint) {
  const { Wd } = spec;
  const [sx, sy] = spec.seat;
  const leather = M(spec.id === 1 ? '#5a3418' : '#1a1a1d', 0.7);
  rbox(car, 1.6, 0.06, Wd - 0.38, 0.02, sx + 0.1, sy - 0.02, 0, M('#0b0b0c', 0.9));
  [-1, 1].forEach((s) => {
    rbox(car, 0.5, 0.14, 0.52, 0.05, sx, sy + 0.06, s * (Wd * 0.22), leather);
    const back = rbox(car, 0.14, 0.55, 0.52, 0.05, sx - 0.3, sy + 0.3, s * (Wd * 0.22), leather);
    back.rotation.z = 0.15;
  });
  if ((spec.seatsN || 0) > 2) {
    rbox(car, 0.5, 0.14, Wd - 0.5, 0.05, sx - 0.95, sy + 0.1, 0, leather);
    const bb = rbox(car, 0.14, 0.5, Wd - 0.5, 0.05, sx - 1.25, sy + 0.34, 0, leather);
    bb.rotation.z = 0.15;
  }
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 22), M('#111', 0.4));
  sw.position.set(sx + 0.55, sy + 0.42, -Wd * 0.22); // sürücü solda
  sw.rotation.y = PI / 2;
  sw.rotation.x = 0.4;
  car.add(sw);
  void paint;
}

// Araba oluştur → { root, tilt, wheels[], front[], hlMat, tlMat, def }
export function buildVehicle(id) {
  const def = VEHICLE_BY_ID[id] || VEHICLES[0];
  const spec = { ...def.spec, id: def.id, seatsN: def.seats || 2 };
  const t = def.paint;
  const paint = new THREE.MeshPhysicalMaterial({ color: t.c, roughness: t.r, metalness: t.m, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glassDark = M('#0b0e14', 0.04, 0.9);
  const trim = M('#0a0a0b', 0.45, 0.3);
  const hlMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 3.2, roughness: 0.1 });
  const tlMat = new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#ff1010', emissiveIntensity: 1.2, roughness: 0.2 });
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const car = new THREE.Group();
  car.rotation.y = -PI / 2; // x (uzunluk) → dünya +z (ön)
  car.userData.hlMat = hlMat;
  tilt.add(car);
  const wheelsG = new THREE.Group();
  wheelsG.rotation.y = -PI / 2;
  root.add(wheelsG);
  const { L, Wd, y0, wr, tw } = spec;
  const bev = 0.1;
  const arch = wr + 0.06 + bev;
  const [rx, fx] = spec.wx;
  const bottom = [['M', -L / 2 + 0.12, y0], ['L', rx - arch, y0], ['A', rx, wr, arch, PI, 0, true], ['L', fx - arch, y0], ['A', fx, wr, arch, PI, 0, true], ['L', L / 2 - 0.12, y0]];
  extrudeX(pathShape([...bottom, ...spec.top]), Wd - 2 * bev, bev, paint, car);
  box(car, L - 0.5, y0 + 0.28, Wd - 2 * tw - 0.12, 0, (y0 + 0.28) / 2 + 0.08, 0, trim);
  if (spec.cab) {
    const { A, Bp, Cp, D, ctrl } = spec.cab;
    const cabShape = pathShape([['M', A[0], A[1]], ['L', Bp[0], Bp[1]], ['Q', ctrl[0], ctrl[1], Cp[0], Cp[1]], ['L', D[0], D[1]], ['L', A[0], A[1]]]);
    const cw = Wd - 0.34;
    extrudeX(cabShape, cw - 0.12, 0.06, paint, car);
    const sideZ = cw / 2 + 0.004;
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
      const bx = (inset[1][0] + inset[3][0]) / 2;
      box(car, 0.07, 0.5, 0.01, bx, (inset[0][1] + inset[2][1]) / 2, s * (sideZ + 0.002), trim);
      box(car, 0.14, 0.025, 0.02, bx + 0.25, A[1] - 0.12, s * (Wd / 2 + 0.005), CHROME());
      rbox(car, 0.16, 0.1, 0.14, 0.03, A[0] - 0.12, A[1] + 0.06, s * (cw / 2 + 0.12), paint);
      box(car, 0.008, A[1] - y0 - 0.1, 0.005, bx - 0.02, (A[1] + y0) / 2 + 0.05, s * (Wd / 2 + 0.001), trim);
    });
    const glassPanel = (P, Q) => {
      const dx = Q[0] - P[0];
      const dy = Q[1] - P[1];
      const len = Math.hypot(dx, dy);
      const o = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.01, cw - 0.02), glassDark);
      o.position.set((P[0] + Q[0]) / 2 + (dy / len) * 0.065, (P[1] + Q[1]) / 2 - (dx / len) * 0.065, 0);
      o.rotation.z = Math.atan2(dy, dx);
      car.add(o);
    };
    glassPanel(A, Bp);
    glassPanel(Cp, D);
  } else {
    // açık tavan: ön cam + kokpit
    const [P, Q] = spec.wind;
    const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, Wd - 0.3), M('#a9c7d6', 0.04, 0.2, { transparent: true, opacity: 0.35, depthWrite: false }));
    ws.position.set((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2, 0);
    ws.rotation.z = -Math.atan2(Q[0] - P[0], Q[1] - P[1]);
    car.add(ws);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.04, len, 0.04), spec.id === 1 ? CHROME() : trim);
    [-1, 1].forEach((s) => {
      const f = fr.clone();
      f.position.set(ws.position.x, ws.position.y, s * (Wd / 2 - 0.15));
      f.rotation.z = ws.rotation.z;
      car.add(f);
    });
    cockpit(car, spec, paint);
    if (spec.id === 10) [-1, 1].forEach((s) => {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 16, PI), paint);
      hoop.position.set(spec.seat[0] - 0.42, spec.seat[1] + 0.2, s * Wd * 0.22);
      hoop.rotation.y = PI / 2;
      car.add(shade(hoop));
    });
  }
  // farlar / stoplar
  if (spec.hl) {
    const [hlx, hly] = spec.hl;
    [-1, 1].forEach((s) => {
      if (spec.quad) {
        [-1, 1].forEach((k) => {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), hlMat);
          l.rotation.z = PI / 2;
          l.position.set(hlx + 0.06 + bev, hly, s * (Wd / 2 - 0.32 + k * 0.1));
          car.add(l);
        });
      } else rbox(car, 0.2, 0.1, 0.38, 0.03, hlx + 0.04 + bev, hly, s * (Wd / 2 - 0.32), hlMat);
    });
  }
  if (spec.tl) {
    const [tlx, tly] = spec.tl;
    [-1, 1].forEach((s) => rbox(car, 0.2, 0.08, 0.42, 0.02, tlx - 0.04 - bev, tly, s * (Wd / 2 - 0.32), tlMat));
  }
  if (spec.hl && spec.id !== 1) {
    const gm = spec.chromeGrille ? CHROME() : M('#0b0b0c', 0.4, 0.6);
    rbox(car, 0.16, spec.grilleH || 0.14, Wd * (spec.grilleW || 0.45), 0.03, spec.hl[0] + 0.02 + bev, spec.hl[1] - 0.14, 0, gm);
  }
  if (spec.kidney) {
    [-1, 1].forEach((s) => {
      rbox(car, 0.12, 0.16, 0.2, 0.05, spec.hl[0] + 0.1 + bev, spec.hl[1] - 0.02, s * 0.13, CHROME());
      rbox(car, 0.13, 0.12, 0.15, 0.04, spec.hl[0] + 0.11 + bev, spec.hl[1] - 0.02, s * 0.13, M('#050505', 0.5));
    });
  }
  if (spec.id !== 1) {
    rbox(car, 0.2, 0.14, Wd - 0.06, 0.05, L / 2 + bev - 0.04, y0 + 0.1, 0, trim);
    rbox(car, 0.2, 0.14, Wd - 0.06, 0.05, -L / 2 - bev + 0.04, y0 + 0.1, 0, trim);
    [-1, 1].forEach((sd) => box(car, spec.wx[1] - spec.wx[0] - 2 * arch - 0.1, 0.07, 0.05, (spec.wx[0] + spec.wx[1]) / 2, y0 + 0.04, sd * (Wd / 2 + 0.005), trim));
  }
  const pm = new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.4 });
  [[spec.plateF, 1], [spec.plateR, -1]].forEach(([p, s]) => {
    if (!p) return;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), pm);
    pl.position.set(p[0] + s * (bev + 0.012), p[1], 0);
    pl.rotation.y = s > 0 ? PI / 2 : -PI / 2;
    car.add(pl);
  });
  [-1, 1].forEach((s) => {
    if (!spec.dualExhaust && s < 0) return;
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 14), CHROME());
    ex.rotation.z = PI / 2;
    ex.position.set(-L / 2 - bev + 0.02, y0 + 0.02, s * (Wd / 2 - 0.35));
    car.add(ex);
  });
  if (spec.extra) spec.extra(car, paint, trim);
  // tekerlekler
  const wz = spec.wz || Wd / 2 - tw / 2 - 0.015;
  const rimM = spec.rimC ? M(spec.rimC, 0.25, 0.8) : CHROME();
  const wheels = [];
  [rx, fx].forEach((x) => [-1, 1].forEach((s) => {
    const w = wheel(wheelsG, x, wr, s * wz, wr, tw, { whitespace: false, spokes: spec.spokes || 5, mirror: s < 0, rimM, caliper: spec.caliper, thin: spec.thin });
    w.front = x === fx;
    wheels.push(w);
  }));
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  // koltuk noktaları (araba yereli: x boy, z en; sürücü -z / sol). 0 = sürücü
  const [sx0, sy0] = spec.seat;
  const seatPts = [[sx0, sy0, -Wd * 0.22], [sx0, sy0, Wd * 0.22], [sx0 - 0.95, sy0 + 0.04, -Wd * 0.22], [sx0 - 0.95, sy0 + 0.04, Wd * 0.22]].slice(0, def.seats || 2);
  return { root, tilt, body: car, wheels, hlMat, tlMat, def, spec, len: L, wb: fx - rx, halfW: Math.max(Wd / 2, wz + tw / 2), seat: spec.seat, seatPts, open: !spec.cab };
}
