// =============================================================================
// v150 — ŞEHİR ARABALARI (galerideki 10 araç) + MODİFİYE. "Neon Garaj" prototipinden
// aktarıldı: her araç kendi siluetiyle 3D çizilir; modifiye ayarları (renk, yüzey,
// jant, lastik, kaliper, süspansiyon, egzoz, tavan, cam filmi, iç döşeme, parçalar,
// ışıklar, plaka, kapı numarası…) aracın üzerinde görünür. Kapalı araçların camları
// şeffaf: içerisi (koltuklar, torpido, direksiyon) görünür.
//   • defaultCarConfig(id): aracın fabrika (orijinal) hali
//   • buildCarModel(id, config): 3D model (root, gövde, tekerlekler, farlar, koltuklar)
//   • buildVehicle(id, mods): şehir motorunun kullandığı kısayol (mods: kayıtlı modifiye)
// Modifiye kuralları / fiyatları: functions/vehicleMods.js (sunucu ile ortak).
// =============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { applyVehicleMods, sanitizeMods, modProfile, MOTO_KEY, TAXI_TYPES } from '../../../functions/vehicleMods.js';
import { CATALOG_MAP } from '../HouseScreen/houseCatalog.js';
import { VEHICLE_CATALOG } from '../../../functions/catalogData.js';

let matCache = new Map();
function mat(n, t = 0.6, e = 0, i) {
  let s = `${n}|${t}|${e}|${i ? JSON.stringify(i) : ''}`,
    r = matCache.get(s);
  return (r || ((r = new THREE.MeshStandardMaterial({ color: n, roughness: t, metalness: e, ...(i || {}) })), matCache.set(s, r)), r);
}
let CHROME = () => mat('#e2e2e6', 0.1, 1),
  PI = Math.PI,
  texCache = new Map();
function canvasTex(n, t, e, i) {
  if (texCache.has(n)) return texCache.get(n);
  let s = document.createElement('canvas');
  ((s.width = t), (s.height = e));
  let r = s.getContext('2d');
  i(r, t, e);
  let a = new THREE.CanvasTexture(s);
  return ((a.colorSpace = THREE.SRGBColorSpace), (a.anisotropy = 4), texCache.set(n, a), a);
}
let shade = (n) => ((n.castShadow = true), (n.receiveShadow = true), n),
  box = (n, t, e, i, s, r, a, o, l = 0) => {
    let c = new THREE.Mesh(new THREE.BoxGeometry(t, e, i), o);
    return (c.position.set(s, r, a), (c.rotation.z = l), n.add(shade(c)), c);
  },
  rbox = (n, t, e, i, s, r, a, o, l) => {
    let c = new THREE.Mesh(new RoundedBoxGeometry(t, e, i, 2, Math.min(s, t / 2 - 0.001, e / 2 - 0.001, i / 2 - 0.001)), l);
    return (c.position.set(r, a, o), n.add(shade(c)), c);
  },
  cyl = (n, t, e, i, s, r, a, o, l = 16) => {
    let c = new THREE.Mesh(new THREE.CylinderGeometry(t, e, i, l), o);
    return (c.position.set(s, r, a), n.add(shade(c)), c);
  };
function decal(n, t, e, i, s, r, a, o) {
  let l = new THREE.Mesh(
    new THREE.PlaneGeometry(e, i),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  return (l.position.set(s, r, a), o < 0 && (l.rotation.y = PI), n.add(l), l);
}
function decalFlat(n, t, e, i, s, r, a, o = 0) {
  let l = new THREE.Mesh(
    new THREE.PlaneGeometry(e, i),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  return ((l.rotation.x = -PI / 2), (l.rotation.z = o), l.position.set(s, r, a), n.add(l), l);
}
function textTex(n, t, { w: e = 512, h: i = 128, bg: s = null, fg: r = '#111', font: a = '900 84px Arial', stroke: o = null, border: l = null } = {}) {
  return canvasTex(`txt|${n}|${t}|${s}|${r}|${a}|${o}|${l}`, e, i, (c) => {
    (s && ((c.fillStyle = s), c.fillRect(0, 0, e, i)),
      l && ((c.strokeStyle = l), (c.lineWidth = 10), c.strokeRect(5, 5, e - 10, i - 10)),
      (c.font = a),
      (c.textAlign = 'center'),
      (c.textBaseline = 'middle'),
      o && ((c.strokeStyle = o), (c.lineWidth = 10), c.strokeText(t, e / 2, i / 2 + 4)),
      (c.fillStyle = r),
      c.fillText(t, e / 2, i / 2 + 4));
  });
}
function plateTex(n) {
  return canvasTex(`plate|${n}`, 256, 56, (t, e, i) => {
    ((t.fillStyle = '#f4f4f0'),
      t.fillRect(0, 0, e, i),
      (t.fillStyle = '#1b3fa0'),
      t.fillRect(0, 0, 30, i),
      (t.fillStyle = '#fff'),
      (t.font = 'bold 14px sans-serif'),
      t.fillText('TR', 5, 38),
      (t.fillStyle = '#111'),
      (t.font = 'bold 34px sans-serif'),
      (t.textAlign = 'center'),
      t.fillText(n.slice(0, 11), 143, 42));
  });
}
function plate(n, t, e, i, s, r) {
  let a = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ map: plateTex(t), roughness: 0.4 }));
  return (a.position.set(e, i, s), (a.rotation.y = r), n.add(a), a);
}
function paintMat(n, t) {
  let e = {
      parlak: { r: 0.22, m: 0.45, cc: 1 },
      metalik: { r: 0.18, m: 0.85, cc: 1 },
      mat: { r: 0.85, m: 0.1, cc: 0 },
      krom: { r: 0.06, m: 1, cc: 1 },
      sedef: { r: 0.15, m: 0.6, cc: 1, iri: 1 },
    }[t] || { r: 0.22, m: 0.45, cc: 1 },
    i = new THREE.MeshPhysicalMaterial({ color: n, roughness: e.r, metalness: e.m, clearcoat: e.cc, clearcoatRoughness: 0.05 });
  return (e.iri && ((i.iridescence = 1), (i.iridescenceIOR = 1.6)), i);
}
function wheel(n, t, e, i, s, r, a = {}) {
  let {
      rimM: o = CHROME(),
      spokes: l = 5,
      mirror: c = false,
      caliper: f = '#c8141e',
      thin: h = false,
      tire: u = '#121212',
      letter: d = false,
      deep: m = false,
      style: y = 'kol',
    } = a,
    p = new THREE.Group();
  (p.position.set(t, e, i), n.add(p));
  let g = new THREE.Group();
  p.add(g);
  let x = s * (h ? 0.82 : 0.68),
    _ = mat(u, 0.9, 0),
    v = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [x, -r / 2],
          [s - 0.03, -r / 2],
          [s, -r / 2 + 0.035],
          [s, r / 2 - 0.035],
          [s - 0.03, r / 2],
          [x, r / 2],
        ].map(([z, b]) => new THREE.Vector2(z, b)),
        32,
      ),
      _,
    );
  ((v.rotation.x = PI / 2), g.add(shade(v)));
  let C = c ? -1 : 1;
  if (d) {
    let z = new THREE.Mesh(
      new THREE.RingGeometry(x + 0.03, s - 0.04, 40),
      new THREE.MeshStandardMaterial({ map: tireLetterTex(), transparent: true, roughness: 0.7 }),
    );
    ((z.position.z = C * (r / 2 + 0.002)), c && (z.rotation.y = PI), g.add(z));
  }
  let w = new THREE.Mesh(new THREE.CylinderGeometry(x, x, r * 0.8, 24), mat('#1a1a1c', 0.4, 0.6));
  ((w.rotation.x = PI / 2), g.add(w));
  let R = new THREE.Group();
  if (((R.position.z = C * (r * 0.4 + 0.005 + (m ? 0.03 : 0))), g.add(R), y === 'disk')) {
    let z = new THREE.Mesh(new THREE.CylinderGeometry(x * 0.96, x * 0.96, 0.02, 28), o);
    ((z.rotation.x = PI / 2), R.add(z));
    for (let b = 0; b < 8; b++) {
      let S = (b / 8) * PI * 2,
        H = new THREE.Mesh(new THREE.CylinderGeometry(x * 0.13, x * 0.13, 0.03, 10), mat('#0a0a0a', 0.5));
      ((H.rotation.x = PI / 2), H.position.set(Math.cos(S) * x * 0.62, Math.sin(S) * x * 0.62, C * 0.003), R.add(H));
    }
  } else if (y === 'agac')
    for (let z = 0; z < l; z++) {
      let b = (z / l) * PI * 2;
      [-0.35, 0.35].forEach((S) => {
        let H = new THREE.Mesh(new THREE.BoxGeometry(x * 0.95, 0.018, 0.025), o);
        (H.position.set(Math.cos(b) * x * 0.5, Math.sin(b) * x * 0.5, 0), (H.rotation.z = b + S), R.add(H));
      });
    }
  else
    for (let z = 0; z < l; z++) {
      let b = (z / l) * PI * 2,
        S = new THREE.Mesh(new THREE.BoxGeometry(x * 0.9, h ? 0.02 : y === 'kalin' ? 0.09 : 0.045, 0.03), o);
      (S.position.set(Math.cos(b) * x * 0.5, Math.sin(b) * x * 0.5, 0), (S.rotation.z = b), R.add(S));
    }
  R.add(new THREE.Mesh(new THREE.TorusGeometry(x - 0.01, m ? 0.03 : 0.015, 8, 28), m ? CHROME() : o));
  let P = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), o);
  if (((P.rotation.x = PI / 2), R.add(P), !h && f)) {
    let z = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), mat(f, 0.35, 0.3));
    (z.position.set(x * 0.55, x * 0.35, C * 0.03), p.add(z));
  }
  return { pivot: p, spin: g, r: s };
}
function tireLetterTex() {
  return canvasTex('tireLetter', 512, 512, (n, t) => {
    (n.translate(t / 2, t / 2), (n.fillStyle = '#f2f2f2'), (n.font = 'bold 34px Arial'), (n.textAlign = 'center'));
    let e = 'NEON  RACING  \u2605  NEON  RACING  \u2605  ',
      i = 205;
    for (let s = 0; s < e.length; s++) (n.save(), n.rotate((s / e.length) * PI * 2), n.fillText(e[s], 0, -i), n.restore());
  });
}
let SKINS = ['#f1c9a5', '#d9a47a', '#a8724c', '#6e4a32', '#f6d7bd'],
  SHIRTS = ['#ff2e8c', '#19e8ff', '#ffd23f', '#3ad07a', '#ffffff', '#222a3a', '#e8582a', '#8b5cf6'],
  HAIRS = ['#1a1209', '#3b2412', '#7a4a1e', '#d8b46a', '#0e0e10', '#b0b0b0'];
function seatedPerson(n = 0, { uniform: t = null, cap: e = null, scale: i = 1 } = {}) {
  let s = new THREE.Group(),
    r = (u) => {
      let d = Math.abs(Math.sin(n * 12.9898 + u * 78.233) * 43758.5453);
      return d - Math.floor(d);
    },
    a = mat(SKINS[Math.floor(r(1) * SKINS.length)], 0.7),
    o = mat(t || SHIRTS[Math.floor(r(2) * SHIRTS.length)], 0.75),
    l = mat('#1f2533', 0.8),
    c = mat(HAIRS[Math.floor(r(3) * HAIRS.length)], 0.8);
  (rbox(s, 0.36, 0.14, 0.3, 0.05, 0.05, 0.07, 0, l), rbox(s, 0.2, 0.42, 0.3, 0.07, -0.08, 0.34, 0, o));
  let f = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), a);
  (f.position.set(-0.06, 0.66, 0), s.add(shade(f)));
  let h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, PI * 2, 0, PI / 2), c);
  if ((h.position.set(-0.075, 0.68, 0), (h.rotation.z = 0.25), s.add(h), e)) {
    let u = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.07, 16), mat(e, 0.6));
    (u.position.set(-0.06, 0.75, 0), s.add(u), box(s, 0.1, 0.015, 0.16, 0.06, 0.725, 0, mat(e, 0.6)));
  }
  return (
    [-1, 1].forEach((u) => {
      let d = rbox(s, 0.32, 0.08, 0.08, 0.035, 0.08, 0.4, u * 0.17, o);
      d.rotation.z = -0.5;
      let m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), a);
      (m.position.set(0.22, 0.32, u * 0.17), s.add(m));
    }),
    [-1, 1].forEach((u) => rbox(s, 0.1, 0.3, 0.1, 0.04, 0.24, -0.06, u * 0.08, l)),
    s.scale.setScalar(i),
    s
  );
}
let RUBBER = () => mat('#121212', 0.92, 0),
  VEHICLES = [
    {
      id: 1,
      name: 'Klasik Tur Arabas\u0131',
      paint: { c: '#121214', r: 0.25, m: 0.4 },
      phys: { vmax: 17, acc: 4.2, grip: 7, steer: 0.55 },
      spec: {
        L: 4.2,
        Wd: 1.42,
        y0: 0.62,
        wr: 0.45,
        tw: 0.15,
        wx: [-1.45, 1.5],
        wz: 0.78,
        spokes: 14,
        thin: true,
        rimC: '#e8dcc0',
        open: true,
        top: [
          ['Q', 2, 0.62, 2, 0.8],
          ['L', 2, 1.18],
          ['L', 0.55, 1.22],
          ['L', 0.4, 1.3],
          ['L', -1.8, 1.32],
          ['Q', -2.1, 1.32, -2.1, 1],
          ['L', -2.1, 0.8],
          ['Q', -2.1, 0.62, -1.95, 0.62],
        ],
        wind: [
          [0.45, 1.3],
          [0.4, 1.85],
        ],
        seat: [-0.6, 1.2],
        hl: null,
        tl: [-2.1, 1],
        plateR: [-2.12, 0.85],
        extra: classicCockpit,
      },
    },
    {
      id: 2,
      name: '\u015Eehir Hatchback',
      paint: { c: '#f2a51f', r: 0.25, m: 0.4 },
      phys: { vmax: 24, acc: 6.5, grip: 9, steer: 0.62 },
      spec: {
        L: 3.95,
        Wd: 1.75,
        y0: 0.32,
        wr: 0.32,
        tw: 0.22,
        wx: [-1.25, 1.3],
        spokes: 5,
        top: [
          ['Q', 1.97, 0.32, 1.98, 0.5],
          ['L', 1.95, 0.66],
          ['Q', 1.9, 0.8, 1.55, 0.85],
          ['L', 0.9, 0.95],
          ['L', -1.85, 1.02],
          ['Q', -1.97, 1.02, -1.98, 0.9],
          ['L', -1.98, 0.5],
          ['Q', -1.98, 0.32, -1.85, 0.32],
        ],
        cab: { A: [0.9, 0.94], Bp: [0.05, 1.48], Cp: [-1.62, 1.52], D: [-1.93, 1.01], ctrl: [-0.8, 1.58] },
        hl: [1.9, 0.7],
        tl: [-1.97, 0.95],
        plateF: [1.99, 0.45],
        plateR: [-1.99, 0.62],
        seat: [-0.2, 0.8],
      },
    },
    {
      id: 3,
      name: 'Pickup',
      paint: { c: '#6e1424', r: 0.22, m: 0.55 },
      phys: { vmax: 26, acc: 6.2, grip: 8, steer: 0.5 },
      spec: {
        L: 5.3,
        Wd: 2,
        y0: 0.46,
        wr: 0.42,
        tw: 0.3,
        wx: [-1.75, 1.7],
        spokes: 6,
        grilleH: 0.34,
        grilleW: 0.75,
        chromeGrille: true,
        top: [
          ['Q', 2.65, 0.46, 2.65, 0.7],
          ['L', 2.63, 1.02],
          ['Q', 2.58, 1.18, 2.3, 1.2],
          ['L', 1.2, 1.25],
          ['L', -2.55, 1.25],
          ['L', -2.65, 1.2],
          ['L', -2.65, 0.6],
          ['Q', -2.65, 0.46, -2.5, 0.46],
        ],
        cab: { A: [1.22, 1.24], Bp: [0.6, 1.9], Cp: [-0.6, 1.92], D: [-0.72, 1.25], ctrl: [0, 1.97] },
        hl: [2.6, 1],
        tl: [-2.62, 1.05],
        plateF: [2.67, 0.65],
        plateR: [-2.67, 0.75],
        seat: [0.2, 1.1],
        extra: (n) => {
          (box(n, 1.75, 0.02, 1.65, -1.68, 1.265, 0, mat('#141416', 0.9)),
            box(n, 0.06, 0.4, 1.7, -0.85, 1.45, 0, CHROME()),
            [-1, 1].forEach((t) => box(n, 3, 0.05, 0.04, -0.2, 0.62, t * 1.01, CHROME())));
        },
      },
    },
    {
      id: 4,
      name: 'Klasik Spor Coupe',
      paint: { c: '#e9651c', r: 0.24, m: 0.45 },
      phys: { vmax: 33, acc: 8, grip: 9.5, steer: 0.6 },
      spec: {
        L: 4.25,
        Wd: 1.75,
        y0: 0.28,
        wr: 0.33,
        tw: 0.24,
        wx: [-1.25, 1.22],
        spokes: 5,
        top: [
          ['Q', 2.12, 0.28, 2.13, 0.42],
          ['Q', 2.1, 0.62, 1.8, 0.7],
          ['L', 0.75, 0.82],
          ['L', -1.9, 0.86],
          ['Q', -2.14, 0.82, -2.13, 0.6],
          ['L', -2.13, 0.42],
          ['Q', -2.13, 0.28, -2, 0.28],
        ],
        cab: { A: [0.75, 0.82], Bp: [0.1, 1.24], Cp: [-0.55, 1.26], D: [-2, 0.84], ctrl: [-0.25, 1.32] },
        hl: null,
        tl: [-2.12, 0.66],
        plateF: [2.14, 0.38],
        plateR: [-2.14, 0.48],
        seat: [-0.2, 0.7],
        extra: (n, t) => {
          (roundLamps(n, 1.62, 0.74, 0.56, t),
            [-1, 1].forEach((e) => {
              (box(n, 3.4, 0.16, 0.012, -0.1, 0.42, e * 0.886, mat('#f2efe6', 0.4)), box(n, 3.4, 0.05, 0.012, -0.1, 0.53, e * 0.887, mat('#111', 0.4)));
            }));
        },
      },
    },
    {
      id: 5,
      name: 'Sedan M-Sport',
      paint: { c: '#1745b5', r: 0.2, m: 0.6 },
      phys: { vmax: 36, acc: 8.6, grip: 10, steer: 0.58 },
      spec: {
        L: 4.6,
        Wd: 1.82,
        y0: 0.28,
        wr: 0.33,
        tw: 0.24,
        wx: [-1.4, 1.38],
        spokes: 5,
        top: [
          ['Q', 2.3, 0.28, 2.31, 0.46],
          ['L', 2.29, 0.62],
          ['Q', 2.25, 0.76, 1.9, 0.8],
          ['L', 0.9, 0.9],
          ['L', -1.5, 0.94],
          ['Q', -2.25, 0.96, -2.3, 0.82],
          ['L', -2.3, 0.46],
          ['Q', -2.3, 0.28, -2.15, 0.28],
        ],
        cab: { A: [0.92, 0.9], Bp: [0.12, 1.34], Cp: [-0.95, 1.37], D: [-1.58, 0.94], ctrl: [-0.4, 1.44] },
        hl: [2.27, 0.66],
        tl: [-2.3, 0.76],
        plateF: [2.33, 0.42],
        plateR: [-2.33, 0.55],
        seat: [-0.2, 0.75],
        kidney: true,
        quad: true,
        dualExhaust: true,
      },
    },
    {
      id: 6,
      name: 'Klasik Muscle Car',
      paint: { c: '#121215', r: 0.2, m: 0.6 },
      phys: { vmax: 40, acc: 10, grip: 8, steer: 0.52 },
      spec: {
        L: 4.95,
        Wd: 1.9,
        y0: 0.3,
        wr: 0.36,
        tw: 0.3,
        wx: [-1.5, 1.6],
        spokes: 6,
        grilleH: 0.24,
        grilleW: 0.8,
        chromeGrille: true,
        top: [
          ['Q', 2.5, 0.3, 2.5, 0.48],
          ['L', 2.49, 0.82],
          ['L', 2.3, 0.86],
          ['L', 0.55, 0.96],
          ['L', -1.8, 0.98],
          ['Q', -2.45, 0.98, -2.47, 0.84],
          ['L', -2.48, 0.48],
          ['Q', -2.48, 0.3, -2.3, 0.3],
        ],
        cab: { A: [0.58, 0.95], Bp: [-0.1, 1.34], Cp: [-1.05, 1.36], D: [-1.75, 0.98], ctrl: [-0.55, 1.4] },
        hl: [2.47, 0.7],
        tl: [-2.46, 0.8],
        plateF: [2.52, 0.42],
        plateR: [-2.5, 0.56],
        dualExhaust: true,
        seat: [-0.4, 0.8],
        extra: (n, t) => {
          (rbox(n, 0.7, 0.12, 0.45, 0.04, 1.4, 0.95, 0, mat('#0a0a0b', 0.5)),
            box(n, 0.12, 0.08, 1.6, -2.4, 1.02, 0, t),
            [-1, 1].forEach((e) => box(n, 4.2, 0.005, 0.16, 0.1, 0.99, e * 0.2, mat('#8a8f99', 0.3, 0.6))));
        },
      },
    },
    {
      id: 7,
      name: 'L\xFCks GT Coupe',
      paint: { c: '#b9bdc6', r: 0.14, m: 0.92 },
      phys: { vmax: 45, acc: 11, grip: 10.5, steer: 0.56 },
      spec: {
        L: 4.75,
        Wd: 1.92,
        y0: 0.26,
        wr: 0.35,
        tw: 0.27,
        wx: [-1.42, 1.52],
        spokes: 10,
        top: [
          ['Q', 2.37, 0.26, 2.38, 0.42],
          ['Q', 2.32, 0.6, 1.95, 0.67],
          ['L', 0.55, 0.84],
          ['L', -1.6, 0.9],
          ['Q', -2.35, 0.92, -2.37, 0.66],
          ['L', -2.37, 0.42],
          ['Q', -2.37, 0.26, -2.22, 0.26],
        ],
        cab: { A: [0.55, 0.84], Bp: [-0.3, 1.24], Cp: [-0.95, 1.25], D: [-1.9, 0.9], ctrl: [-0.6, 1.3] },
        hl: [2.25, 0.58],
        tl: [-2.35, 0.74],
        plateF: [2.4, 0.38],
        plateR: [-2.39, 0.5],
        dualExhaust: true,
        seat: [-0.5, 0.72],
        grilleH: 0.01,
        extra: (n) => {
          let t = new THREE.Group();
          (t.position.set(2.4, 0.43, 0), n.add(t));
          let e = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 6), CHROME());
          (e.scale.set(1, 0.42, 1.9), (e.rotation.y = PI / 2), t.add(e));
          for (let i = -2; i <= 2; i++) box(t, 0.02, 0.012, 0.95 - Math.abs(i) * 0.08, 0, i * 0.045, 0, CHROME());
          [-1, 1].forEach((i) => box(n, 0.5, 0.06, 0.02, 1.15, 0.6, i * 0.97, CHROME()));
        },
      },
    },
    {
      id: 8,
      name: 'Track-Spec S\xFCper Spor',
      paint: { c: '#f2f2ef', r: 0.24, m: 0.35 },
      phys: { vmax: 50, acc: 13, grip: 12, steer: 0.6 },
      spec: {
        L: 4.5,
        Wd: 1.98,
        y0: 0.22,
        wr: 0.35,
        tw: 0.3,
        wx: [-1.3, 1.28],
        spokes: 10,
        rimC: '#1a1a1c',
        caliper: '#f2c400',
        top: [
          ['Q', 2.25, 0.22, 2.26, 0.38],
          ['Q', 2.23, 0.58, 1.9, 0.66],
          ['L', 0.75, 0.8],
          ['L', -1.95, 0.86],
          ['Q', -2.27, 0.84, -2.26, 0.58],
          ['L', -2.26, 0.38],
          ['Q', -2.26, 0.22, -2.1, 0.22],
        ],
        cab: { A: [0.75, 0.8], Bp: [0.08, 1.2], Cp: [-0.58, 1.22], D: [-2.05, 0.86], ctrl: [-0.28, 1.28] },
        hl: null,
        tl: [-2.25, 0.66],
        plateF: [2.27, 0.32],
        plateR: [-2.27, 0.45],
        seat: [-0.25, 0.65],
        extra: (n, t) => {
          roundLamps(n, 1.72, 0.7, 0.6, t, true);
          let e = mat('#0e0e10', 0.3, 0.5);
          (box(n, 0.42, 0.04, 1.95, -2.05, 1.32, 0, e),
            [-0.55, 0.55].forEach((i) => box(n, 0.14, 0.36, 0.03, -2, 1.12, i, e)),
            [-1, 1].forEach((i) => {
              (box(n, 2.2, 0.1, 0.01, -0.2, 0.42, i * 0.996, mat('#111', 0.5)), box(n, 0.5, 0.18, 0.02, -1.1, 0.55, i * 0.99, mat('#050505', 0.5)));
            }),
            box(n, 2.1, 0.02, 0.5, 0.3, 0.02, 0, e),
            box(n, 0.25, 0.04, 1.9, 2.2, 0.22, 0, e));
        },
      },
    },
    {
      id: 9,
      name: 'GT Yar\u0131\u015F Arabas\u0131',
      paint: { c: '#f4f4f2', r: 0.22, m: 0.35 },
      phys: { vmax: 52, acc: 13.5, grip: 12.5, steer: 0.6 },
      spec: {
        L: 4.65,
        Wd: 2.02,
        y0: 0.18,
        wr: 0.34,
        tw: 0.32,
        wx: [-1.42, 1.42],
        spokes: 6,
        rimC: '#1b1b1d',
        caliper: '#c8141e',
        top: [
          ['Q', 2.33, 0.18, 2.34, 0.34],
          ['L', 2.32, 0.52],
          ['Q', 2.28, 0.66, 1.9, 0.7],
          ['L', 0.8, 0.82],
          ['L', -1.6, 0.88],
          ['Q', -2.3, 0.9, -2.33, 0.74],
          ['L', -2.33, 0.34],
          ['Q', -2.33, 0.18, -2.18, 0.18],
        ],
        cab: { A: [0.82, 0.82], Bp: [0, 1.22], Cp: [-0.85, 1.24], D: [-1.62, 0.88], ctrl: [-0.4, 1.3] },
        hl: [2.27, 0.56],
        tl: [-2.32, 0.7],
        plateF: null,
        plateR: null,
        seat: [-0.3, 0.65],
        kidney: true,
        dualExhaust: true,
        extra: (n) => {
          let t = mat('#0e0e10', 0.3, 0.5);
          (box(n, 0.45, 0.04, 2.05, -2.1, 1.25, 0, t),
            [-0.6, 0.6].forEach((s) => box(n, 0.14, 0.33, 0.03, -2.05, 1.06, s, t)),
            box(n, 0.3, 0.04, 2, 2.3, 0.16, 0, t),
            ['#4fa3e0', '#1b2a7a', '#d0161e'].forEach((s, r) => {
              (box(n, 1.5, 0.006, 0.12, 1.55, 0.76, -0.18 + r * 0.13, mat(s, 0.4)),
                [-1, 1].forEach((a) => box(n, 2.6, 0.09, 0.006, -0.3, 0.62 - r * 0.1, a * 1.012, mat(s, 0.4))));
            }));
          let i = canvasTex('no77', 128, 128, (s, r) => {
            ((s.fillStyle = '#fff'),
              s.beginPath(),
              s.arc(r / 2, r / 2, 60, 0, 7),
              s.fill(),
              (s.strokeStyle = '#111'),
              (s.lineWidth = 6),
              s.stroke(),
              (s.fillStyle = '#111'),
              (s.font = '900 70px Arial'),
              (s.textAlign = 'center'),
              (s.textBaseline = 'middle'),
              s.fillText('77', r / 2, r / 2 + 4));
          });
          [-1, 1].forEach((s) => {
            let r = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: i, transparent: true, roughness: 0.5 }));
            (r.position.set(0.15, 0.62, s * 1.016), s < 0 && (r.rotation.y = PI), n.add(r));
          });
        },
      },
    },
    {
      id: 10,
      name: '\xDCst\xFCn Cabrio',
      paint: { c: '#26339a', r: 0.12, m: 0.75 },
      phys: { vmax: 55, acc: 14, grip: 11, steer: 0.58 },
      spec: {
        L: 4.45,
        Wd: 1.9,
        y0: 0.22,
        wr: 0.33,
        tw: 0.28,
        wx: [-1.35, 1.35],
        spokes: 5,
        open: true,
        top: [
          ['Q', 2.22, 0.22, 2.23, 0.36],
          ['Q', 2.18, 0.55, 1.8, 0.6],
          ['L', 0.35, 0.78],
          ['L', -1.7, 0.84],
          ['Q', -2.22, 0.86, -2.23, 0.62],
          ['L', -2.23, 0.36],
          ['Q', -2.23, 0.22, -2.1, 0.22],
        ],
        wind: [
          [0.35, 0.78],
          [-0.05, 1.12],
        ],
        hl: [2.08, 0.52],
        tl: [-2.22, 0.7],
        plateF: [2.24, 0.3],
        plateR: [-2.24, 0.45],
        seat: [-0.55, 0.62],
        dualExhaust: true,
        extra: (n) => {
          [-1, 1].forEach((t) => box(n, 0.6, 0.04, 0.02, 1.25, 0.5, t * 0.96, mat('#0a0a0b', 0.4)));
        },
      },
    },
  ],
  SEATS = { 1: 4, 2: 4, 3: 4, 4: 2, 5: 4, 6: 2, 7: 2, 8: 2, 9: 1, 10: 2 };
VEHICLES.forEach((n) => {
  n.seats = SEATS[n.id] || 2;
});
let VEHICLE_BY_ID = Object.fromEntries(VEHICLES.map((n) => [n.id, n]));
function roundLamps(n, t, e, i, s, r = false) {
  [-1, 1].forEach((a) => {
    let o = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), s);
    (o.scale.set(1.1, 0.8, 1), o.position.set(t, e, a * i), n.add(shade(o)));
    let l = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), n.userData.hlMat);
    if ((l.position.set(t + 0.18, e + 0.01, a * i), (l.rotation.y = PI / 2), n.add(l), r)) {
      let c = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.018, 6, 20), mat('#0a0a0a', 0.4));
      (c.position.copy(l.position), (c.rotation.y = PI / 2), n.add(c));
    }
  });
}
function classicCockpit(n, t) {
  let e = mat('#111113', 0.3, 0.4);
  ([[-1.45], [1.5]].forEach(([r]) => {
    [-1, 1].forEach((a) => {
      let o = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 8, 20, PI), e);
      (o.scale.set(1, 1, 1.25), o.position.set(r, 0.45, a * 0.78), n.add(shade(o)));
    });
  }),
    [-1, 1].forEach((r) => box(n, 1.9, 0.05, 0.3, 0.02, 0.6, r * 0.78, e)),
    box(n, 0.12, 0.72, 0.62, 2.05, 1, 0, CHROME()),
    box(n, 0.13, 0.62, 0.52, 2.06, 1, 0, mat('#1a1a1a', 0.5, 0.5)),
    box(n, 0.05, 0.05, 1.2, 2.2, 1.05, 0, CHROME()),
    [-1, 1].forEach((r) => {
      let a = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, PI), CHROME());
      ((a.rotation.y = -PI / 2), a.position.set(2.22, 1.15, r * 0.55), n.add(a));
      let o = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), n.userData.hlMat);
      (o.position.set(2.23, 1.15, r * 0.55), (o.rotation.y = PI / 2), n.add(o));
    }));
  let i = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.35, 16), mat('#6b4423', 0.85));
  ((i.rotation.x = PI / 2), i.position.set(-1.75, 1.45, 0), n.add(shade(i)));
  let s = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.1, 10, 24), RUBBER());
  ((s.rotation.y = PI / 2), s.position.set(-2.22, 1, 0), n.add(shade(s)));
}
function pathShape(n) {
  let t = new THREE.Shape();
  return (
    n.forEach((e, i) => {
      i === 0
        ? t.moveTo(e[1], e[2])
        : e[0] === 'L'
          ? t.lineTo(e[1], e[2])
          : e[0] === 'Q'
            ? t.quadraticCurveTo(e[1], e[2], e[3], e[4])
            : e[0] === 'A' && t.absarc(e[1], e[2], e[3], e[4], e[5], e[6]);
    }),
    t
  );
}
function extrudeX(n, t, e, i, s) {
  let r = new THREE.ExtrudeGeometry(n, { depth: t, bevelEnabled: true, bevelSize: e, bevelThickness: e, bevelSegments: 4, curveSegments: 18 });
  r.translate(0, 0, -t / 2);
  let a = new THREE.Mesh(r, i);
  return (s.add(shade(a)), a);
}
function roofLineFn(n, t) {
  let e = n.getPoints(24);
  return (i) => {
    let s = -1;
    for (let r = 0; r < e.length; r++) {
      let a = e[r],
        o = e[(r + 1) % e.length];
      if ((a.x - i) * (o.x - i) <= 0 && a.x !== o.x) {
        let l = (i - a.x) / (o.x - a.x);
        s = Math.max(s, a.y + (o.y - a.y) * l);
      }
    }
    return s + t;
  };
}
function defaultCarConfig(n) {
  let t = VEHICLE_BY_ID[n],
    e = t.spec;
  return {
    kind: 'car',
    id: n,
    paint: t.paint.c,
    finish: t.paint.m > 0.8 ? 'metalik' : 'parlak',
    rim: e.rimC || '#e2e2e6',
    rimStyle: e.thin ? 'tel' : 'kol',
    spokes: e.spokes || 5,
    tire: '#121212',
    letter: false,
    deep: false,
    caliper: e.caliper || '#c8141e',
    wheelScale: 1,
    ride: 0,
    roof: e.cab ? 'kapali' : 'acik',
    tint: 'seffaf',
    livery: 'sivil',
    interior: n === 1 ? '#5a3418' : '#1a1a1d',
    acc: { spoiler: false, rack: false, bullbar: false, skirts: false, fog: false, scoop: false, neon: false, beacon: false, box: false },
    neonColor: '#ff2e8c',
    exhaust: e.dualExhaust ? 'cift' : 'tek',
    plate: '34 N\u015E 777',
    sideNo: '',
    people: 0, // v150: oyunda araçtaki kişiler gerçek oyuncular (vitrin mankeni yok)
  };
}
function buildCarModel(n, t = defaultCarConfig(n)) {
  let e = VEHICLE_BY_ID[n] || VEHICLE_BY_ID[1],
    i = { ...e.spec, id: e.id },
    s = paintMat(t.paint, t.finish),
    r = mat('#0a0a0b', 0.45, 0.3),
    a = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 3.2, roughness: 0.1 }),
    o = new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#ff1010', emissiveIntensity: 1.2, roughness: 0.2 }),
    l = [],
    c = new THREE.Group(),
    f = new THREE.Group();
  c.add(f);
  let h = new THREE.Group();
  f.add(h);
  let u = new THREE.Group();
  ((u.rotation.y = -PI / 2), (u.userData.hlMat = a), h.add(u));
  let d = new THREE.Group();
  ((d.rotation.y = -PI / 2), c.add(d));
  let { L: m, Wd: y, y0: p, wr: g, tw: x } = i,
    _ = t.wheelScale || 1;
  f.position.y = (t.ride || 0) + (_ - 1) * g;
  let v = 0.1,
    C = g + 0.06 + v,
    [w, R] = i.wx,
    P = [
      ['M', -m / 2 + 0.12, p],
      ['L', w - C, p],
      ['A', w, g, C, PI, 0, true],
      ['L', R - C, p],
      ['A', R, g, C, PI, 0, true],
      ['L', m / 2 - 0.12, p],
    ],
    z = pathShape([...P, ...i.top]);
  extrudeX(z, y - 2 * v, v, s, u);
  let b = roofLineFn(z, v);
  box(u, m - 0.5, p + 0.28, y - 2 * x - 0.12, 0, (p + 0.28) / 2 + 0.08, 0, r);
  let S = !!i.cab && t.roof === 'kapali',
    H = { seffaf: 0.14, hafif: 0.42, koyu: 0.82 }[t.tint || 'seffaf'],
    W = mat('#7fa6bd', 0.04, 0.4, { transparent: true, opacity: H, depthWrite: false, side: THREE.DoubleSide }),
    V = null;
  if (i.cab) {
    let { A: J, Bp: gt, Cp: j, D: mt, ctrl: Pt } = i.cab,
      Ut = new THREE.QuadraticBezierCurve(new THREE.Vector2(gt[0], gt[1]), new THREE.Vector2(Pt[0], Pt[1]), new THREE.Vector2(j[0], j[1])),
      Tt = [J, ...Ut.getPoints(16).map((Qt) => [Qt.x, Qt.y]), mt];
    V = (Qt) => {
      for (let $t = 0; $t < Tt.length - 1; $t++) {
        let [be, L] = Tt[$t],
          [Rt, K] = Tt[$t + 1];
        if ((Qt - be) * (Qt - Rt) <= 0 && be !== Rt) return L + ((K - L) * (Qt - be)) / (Rt - be);
      }
      return Math.max(gt[1], j[1]);
    };
  }
  let Y = i.wind;
  if (S) {
    let { A: J, Bp: gt, Cp: j, D: mt, ctrl: Pt } = i.cab,
      Ut = y - 0.34,
      Qt = new THREE.QuadraticBezierCurve(new THREE.Vector2(gt[0], gt[1]), new THREE.Vector2(Pt[0], Pt[1]), new THREE.Vector2(j[0], j[1])).getPoints(20),
      $t = new THREE.Shape();
    (Qt.forEach((K, ct) => (ct ? $t.lineTo(K.x, K.y) : $t.moveTo(K.x, K.y))),
      [...Qt].reverse().forEach((K) => $t.lineTo(K.x, K.y - 0.06)),
      extrudeX($t, Ut - 0.06, 0.03, s, u));
    let be = (K, ct, wt, At = 0.08) => {
        let de = Math.hypot(ct[0] - K[0], ct[1] - K[1]),
          ke = new THREE.Mesh(new THREE.BoxGeometry(At, de + 0.04, 0.07), s);
        (ke.position.set((K[0] + ct[0]) / 2, (K[1] + ct[1]) / 2, wt), (ke.rotation.z = -Math.atan2(ct[0] - K[0], ct[1] - K[1])), u.add(shade(ke)));
      },
      L = (gt[0] + j[0]) / 2 + (J[0] - mt[0]) * 0.04;
    [-1, 1].forEach((K) => {
      let ct = K * (Ut / 2 + 0.02);
      (be(J, gt, ct), be(j, mt, ct, 0.14), be([L, (J[1] + mt[1]) / 2], [L, V(L) - 0.02], ct, 0.07));
      let wt = new THREE.Shape();
      [J, ...Qt.map((de) => [de.x, de.y - 0.04]), mt].forEach(([de, ke], dn) => (dn ? wt.lineTo(de, ke) : wt.moveTo(de, ke)));
      let At = new THREE.Mesh(new THREE.ShapeGeometry(wt), W);
      ((At.position.z = K * (Ut / 2 + 0.01)),
        u.add(At),
        rbox(u, 0.16, 0.1, 0.14, 0.03, J[0] - 0.12, J[1] + 0.06, K * (Ut / 2 + 0.12), s),
        box(u, 0.14, 0.025, 0.02, L + 0.25, J[1] - 0.12, K * (y / 2 + 0.005), CHROME()));
    });
    let Rt = (K, ct) => {
      let wt = Math.hypot(ct[0] - K[0], ct[1] - K[1]),
        At = new THREE.Mesh(new THREE.BoxGeometry(0.012, wt, Ut), W);
      (At.position.set((K[0] + ct[0]) / 2, (K[1] + ct[1]) / 2, 0), (At.rotation.z = -Math.atan2(ct[0] - K[0], ct[1] - K[1])), u.add(At));
    };
    (Rt(J, gt), Rt(j, mt), (Y = [J, gt]));
  } else {
    if (i.cab) {
      let Qt = i.cab.A;
      ((Y = [
        [Qt[0], Qt[1]],
        [Qt[0] - 0.36, Qt[1] + 0.36],
      ]),
        [-1, 1].forEach(($t) => box(u, Qt[0] - i.cab.D[0], 0.04, 0.06, (Qt[0] + i.cab.D[0]) / 2, Math.max(Qt[1], i.cab.D[1]) + 0.02, $t * (y / 2 - 0.03), r)));
    }
    let [J, gt] = Y,
      j = Math.hypot(gt[0] - J[0], gt[1] - J[1]),
      mt = mat('#a9c7d6', 0.04, 0.2, { transparent: true, opacity: 0.3, depthWrite: false }),
      Pt = new THREE.Mesh(new THREE.BoxGeometry(0.02, j, y - 0.3), mt);
    (Pt.position.set((J[0] + gt[0]) / 2, (J[1] + gt[1]) / 2, 0), (Pt.rotation.z = -Math.atan2(gt[0] - J[0], gt[1] - J[1])), u.add(Pt));
    let Ut = new THREE.Mesh(new THREE.BoxGeometry(0.045, j, 0.045), i.id === 1 ? CHROME() : r);
    [-1, 1].forEach((Qt) => {
      let $t = Ut.clone();
      ($t.position.set(Pt.position.x, Pt.position.y, Qt * (y / 2 - 0.15)), ($t.rotation.z = Pt.rotation.z), u.add($t));
    });
    let Tt = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, y - 0.3), i.id === 1 ? CHROME() : r);
    (Tt.position.set(gt[0], gt[1], 0), u.add(Tt));
  }
  let [G] = Y,
    [ot, D] = i.seat,
    ut = e.seats || 2,
    bt = G[0] - 0.05,
    yt = ot - (ut > 2 ? 1.45 : 0.55),
    Zt = mat(t.interior, 0.7),
    ae = mat('#121216', 0.85);
  for (let J = 0; J < 6; J++) {
    let gt = yt + ((bt - yt) * J) / 6,
      j = yt + ((bt - yt) * (J + 1)) / 6,
      mt = (gt + j) / 2,
      Pt = new THREE.Mesh(new THREE.BoxGeometry(j - gt + 0.01, 0.01, y - 0.32), ae);
    (Pt.position.set(mt, b(mt) + 0.004, 0), u.add(Pt));
  }
  let rt = 1,
    dt = S ? Math.max(p + 0.15, V(ot) - 0.95) : Math.max(D, b(ot) - 0.12),
    ft = S ? Math.max(p + 0.15, V(ot - 0.95) - 0.9) : Math.max(D + 0.04, b(ot - 0.95) - 0.12);
  if (
    ([-1, 1].forEach((J) => {
      rbox(u, 0.5, 0.14, 0.52, 0.05, ot, dt + 0.06, J * (y * 0.22), Zt);
      let gt = rbox(u, 0.14, 0.62, 0.52, 0.05, ot - 0.3, dt + 0.33, J * (y * 0.22), Zt);
      gt.rotation.z = 0.15;
      let j = rbox(u, 0.1, 0.16, 0.3, 0.04, ot - 0.38, dt + 0.72, J * (y * 0.22), Zt);
      j.rotation.z = 0.15;
    }),
    ut > 2)
  ) {
    let J = ft;
    rbox(u, 0.5, 0.14, y - 0.5, 0.05, ot - 0.95, J + 0.06, 0, Zt);
    let gt = rbox(u, 0.14, 0.56, y - 0.5, 0.05, ot - 1.25, J + 0.32, 0, Zt);
    gt.rotation.z = 0.15;
  }
  let pt = S ? G[0] - 0.42 : G[0] - 0.12;
  rbox(u, 0.3, 0.12, y - 0.34, 0.04, pt, b(pt) + 0.04, 0, mat('#0d0d10', 0.6));
  let St = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 22), mat('#111', 0.4));
  (St.position.set(ot + 0.55, dt + 0.42, -y * 0.22), (St.rotation.y = PI / 2), (St.rotation.x = 0.4), u.add(St));
  let Mt = [
      [ot, dt + 0.12, -y * 0.22],
      [ot, dt + 0.12, y * 0.22],
      [ot - 0.95, ft + 0.12, -y * 0.22],
      [ot - 0.95, ft + 0.12, y * 0.22],
    ].slice(0, ut),
    kt =
      t.livery === 'polis' ? '#1b2a6b' : t.livery === 'ambulans' ? '#c8141e' : t.livery === 'kurye' ? '#e8582a' : t.livery === 'yolyardim' ? '#f2a51f' : null;
  Mt.slice(0, t.people).forEach((J, gt) => {
    let j = seatedPerson(n * 7 + gt, { uniform: gt === 0 || t.livery === 'polis' ? kt : null, cap: t.livery === 'polis' ? '#1b2a6b' : null, scale: rt });
    (j.position.set(J[0] - 0.05, J[1], J[2]), u.add(j));
  });
  let Nt = !S && (t.roof === 'rollbar' || ['taksi', 'polis', 'ambulans'].includes(t.livery)),
    k = S ? (i.cab.Bp[0] + i.cab.Cp[0]) / 2 : ot - 0.5,
    E = S ? V(k) - 0.02 : dt + 0.95;
  if (Nt) {
    let J = t.roof === 'rollbar' ? CHROME() : r;
    [-1, 1].forEach((j) => {
      let mt = cyl(u, 0.035, 0.035, E - b(k) + 0.02, k, (E + b(k)) / 2, j * (y / 2 - 0.16), J, 10);
    });
    let gt = cyl(u, 0.035, 0.035, y - 0.32, k, E, 0, J, 10);
    gt.rotation.x = PI / 2;
  }
  if (i.hl) {
    let [J, gt] = i.hl;
    [-1, 1].forEach((j) => {
      i.quad
        ? [-1, 1].forEach((mt) => {
            let Pt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), a);
            ((Pt.rotation.z = PI / 2), Pt.position.set(J + 0.06 + v, gt, j * (y / 2 - 0.32 + mt * 0.1)), u.add(Pt));
          })
        : rbox(u, 0.2, 0.1, 0.38, 0.03, J + 0.04 + v, gt, j * (y / 2 - 0.32), a);
    });
  }
  if (i.tl) {
    let [J, gt] = i.tl;
    [-1, 1].forEach((j) => rbox(u, 0.2, 0.08, 0.42, 0.02, J - 0.04 - v, gt, j * (y / 2 - 0.32), o));
  }
  if (i.hl && i.id !== 1) {
    let J = i.chromeGrille ? CHROME() : mat('#0b0b0c', 0.4, 0.6);
    rbox(u, 0.16, i.grilleH || 0.14, y * (i.grilleW || 0.45), 0.03, i.hl[0] + 0.02 + v, i.hl[1] - 0.14, 0, J);
  }
  (i.kidney &&
    [-1, 1].forEach((J) => {
      (rbox(u, 0.12, 0.16, 0.2, 0.05, i.hl[0] + 0.1 + v, i.hl[1] - 0.02, J * 0.13, CHROME()),
        rbox(u, 0.13, 0.12, 0.15, 0.04, i.hl[0] + 0.11 + v, i.hl[1] - 0.02, J * 0.13, mat('#050505', 0.5)));
    }),
    i.id !== 1 &&
      (rbox(u, 0.2, 0.14, y - 0.06, 0.05, m / 2 + v - 0.04, p + 0.1, 0, r),
      rbox(u, 0.2, 0.14, y - 0.06, 0.05, -m / 2 - v + 0.04, p + 0.1, 0, r),
      [-1, 1].forEach((J) => box(u, i.wx[1] - i.wx[0] - 2 * C - 0.1, 0.07, 0.05, (i.wx[0] + i.wx[1]) / 2, p + 0.04, J * (y / 2 + 0.005), r))),
    i.plateF && plate(u, t.plate, i.plateF[0] + v + 0.012, i.plateF[1], 0, PI / 2),
    i.plateR && plate(u, t.plate, i.plateR[0] - v - 0.012, i.plateR[1], 0, -PI / 2),
    ({ tek: [-1], cift: [-1, 1], dort: [-1.15, -0.85, 0.85, 1.15] }[t.exhaust] || [-1]).forEach((J) => {
      let gt = Math.sign(J),
        j = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 14), CHROME());
      ((j.rotation.z = PI / 2), j.position.set(-m / 2 - v + 0.02, p + 0.02, gt * (y / 2 - 0.35) + (Math.abs(J) - 1) * 0.5 * gt), u.add(j));
    }),
    i.extra && i.extra(u, s, r));
  let st = t.acc || {},
    Q = mat('#0e0e10', 0.35, 0.5),
    ht = -m / 2 - v,
    Et = m / 2 + v;
  if (st.spoiler) {
    let J = ht + 0.28,
      gt = b(J) + 0.32;
    (box(u, 0.42, 0.04, y - 0.1, J, gt, 0, s),
      [-0.55, 0.55].forEach((j) => box(u, 0.12, 0.32, 0.04, J + 0.04, gt - 0.16, j * (y / 1.9), Q)),
      [-1, 1].forEach((j) => box(u, 0.46, 0.14, 0.02, J, gt + 0.03, j * (y / 2 - 0.04), Q)));
  }
  if (st.scoop) {
    let J = R - 0.25,
      gt = rbox(u, 0.62, 0.14, 0.55, 0.05, J, b(J) + 0.05, 0, s);
    box(u, 0.02, 0.08, 0.45, J + 0.32, b(J) + 0.08, 0, mat('#050505', 0.6));
  }
  if (st.rack) {
    let J = -m / 2 + 0.55,
      gt = b(J) + 0.04;
    ([-0.3, 0, 0.3].forEach((j) => box(u, 0.03, 0.03, y - 0.3, J + j, gt, 0, CHROME())),
      [-1, 1].forEach((j) => box(u, 0.7, 0.03, 0.03, J, gt + 0.04, j * (y / 2 - 0.15), CHROME())),
      rbox(u, 0.5, 0.28, 0.7, 0.04, J, gt + 0.17, -0.15, mat('#6b4423', 0.7)),
      box(u, 0.52, 0.03, 0.72, J, gt + 0.2, -0.15, mat('#2a1a0c', 0.6)));
  }
  if (st.box) {
    let J = -m / 2 + 0.55,
      gt = b(J);
    (rbox(u, 0.55, 0.5, 0.6, 0.05, J, gt + 0.27, 0, mat('#e8582a', 0.6)),
      [-1, 1].forEach((j) =>
        decal(u, textTex('kurye', 'NEON YEMEK', { w: 256, h: 128, fg: '#fff', font: '900 40px Arial' }), 0.5, 0.25, J, gt + 0.3, j * 0.305, j),
      ));
  }
  if (st.bullbar) {
    let J = Et + 0.12;
    [-1, 1].forEach((mt) => cyl(u, 0.04, 0.04, 0.55, J, p + 0.35, mt * 0.45, CHROME(), 10));
    let gt = cyl(u, 0.04, 0.04, 1, J, p + 0.62, 0, CHROME(), 10);
    gt.rotation.x = PI / 2;
    let j = cyl(u, 0.04, 0.04, y - 0.2, J - 0.02, p + 0.18, 0, CHROME(), 10);
    j.rotation.x = PI / 2;
  }
  if (
    (st.skirts &&
      ([-1, 1].forEach((J) => box(u, R - w - 2 * C + 0.1, 0.1, 0.06, (R + w) / 2, p + 0.02, J * (y / 2 + 0.03), t.finish === 'krom' ? Q : s)),
      box(u, 0.08, 0.06, y - 0.2, Et + 0.05, p - 0.01, 0, Q)),
    st.fog)
  ) {
    let J = new THREE.MeshStandardMaterial({ color: '#fff7c2', emissive: '#ffe680', emissiveIntensity: 2.5 });
    [-1, 1].forEach((gt) => {
      let j = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), J);
      ((j.rotation.z = PI / 2), j.position.set(Et + 0.02, p + 0.12, gt * (y / 2 - 0.25)), u.add(j));
    });
  }
  if (st.beacon || t.livery === 'yolyardim') {
    let J = Nt || S ? k : ot - 0.9,
      gt = Nt || S ? E + 0.05 : b(J) + 0.08,
      j = new THREE.MeshStandardMaterial({ color: '#ffae00', emissive: '#ff9900', emissiveIntensity: 2, transparent: true, opacity: 0.9 }),
      mt = cyl(u, 0.08, 0.09, 0.14, J, gt, 0, j, 14);
    l.push({ mat: j, phase: 0, base: 2.5, fast: false });
  }
  let vt = (w + R) / 2,
    A = (p + 0.12 + b(vt)) / 2,
    M = Math.min(1.7, R - w - 2 * C + 0.3),
    B = t.livery;
  if (B === 'taksi') {
    let J = t.taxiSign || '#f6c400',
      gt = canvasTex(`checker|${J}`, 512, 64, (Pt, Ut, Tt) => {
        for (let Qt = 0; Qt < 32; Qt++) for (let $t = 0; $t < 4; $t++) ((Pt.fillStyle = (Qt + $t) % 2 ? '#111' : J), Pt.fillRect(Qt * 16, $t * 16, 16, 16));
      });
    [-1, 1].forEach((Pt) => {
      (decal(u, gt, m * 0.8, 0.09, 0, A + 0.06, Pt * (y / 2 + 0.012), Pt),
        decal(
          u,
          textTex(`taxi|${J}`, t.taxiText || 'TAKS\u0130', { fg: J === '#121214' || t.paint === '#121214' ? '#e8c26a' : '#111', font: '900 90px Arial' }),
          0.9,
          0.22,
          vt,
          A - 0.1,
          Pt * (y / 2 + 0.012),
          Pt,
        ));
    });
    let j = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffe680',
        emissiveIntensity: 0.6,
        map: textTex(`taxisign|${J}`, t.taxiText || 'TAKS\u0130', { bg: J, fg: J === '#121214' ? '#e8c26a' : '#111', font: '900 96px Arial' }),
      }),
      mt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.62), [mat(J, 0.4), mat(J, 0.4), mat(J, 0.4), mat(J, 0.4), j, j]);
    (mt.position.set(k, E + 0.13, 0), (u.userData.taxiSign = j), (mt.rotation.y = PI / 2), u.add(mt));
  }
  if (B === 'polis' || B === 'ambulans') {
    let J = B === 'polis';
    if (
      ([-1, 1].forEach((mt) => {
        if (J)
          (decal(u, textTex('polis', 'POL\u0130S', { bg: '#f4f4f2', fg: '#16307a', font: '900 92px Arial' }), M, 0.28, vt, A, mt * (y / 2 + 0.012), mt),
            decal(u, textTex('155', '155', { fg: '#f4f4f2', font: '900 90px Arial' }), 0.35, 0.18, w - 0.05, A + 0.03, mt * (y / 2 + 0.012), mt));
        else {
          let Pt = canvasTex('ambchk', 512, 64, (Ut) => {
            for (let Tt = 0; Tt < 16; Tt++) ((Ut.fillStyle = Tt % 2 ? '#c8141e' : '#ffd23f'), Ut.fillRect(Tt * 32, 0, 32, 64));
          });
          (decal(u, Pt, m * 0.85, 0.12, 0, A - 0.05, mt * (y / 2 + 0.012), mt),
            decal(u, textTex('112', '112 AC\u0130L', { fg: '#c8141e', font: '900 84px Arial' }), 0.9, 0.2, vt, A + 0.1, mt * (y / 2 + 0.012), mt));
        }
      }),
      J)
    ) {
      let mt = R - 0.1;
      decalFlat(u, textTex('polishood', 'POL\u0130S', { fg: '#f4f4f2', font: '900 100px Arial' }), 0.8, 0.2, mt, b(mt) + 0.006, 0, PI / 2);
    }
    let gt = J ? '#1e5bff' : '#ff1010',
      j = J ? '#ff1010' : '#1e5bff';
    (box(u, 0.2, 0.05, y - 0.35, k, E + 0.05, 0, mat('#222', 0.5)),
      [-1, 1].forEach((mt, Pt) => {
        let Ut = new THREE.MeshStandardMaterial({ color: Pt ? j : gt, emissive: Pt ? j : gt, emissiveIntensity: 2, transparent: true, opacity: 0.92 });
        (rbox(u, 0.18, 0.1, (y - 0.45) / 2, 0.03, k, E + 0.12, (mt * (y - 0.35)) / 4, Ut), l.push({ mat: Ut, phase: Pt * PI, base: 3, fast: true }));
      }));
  }
  if (B === 'sivilpolis') {
    let J = new THREE.MeshStandardMaterial({ color: '#1e5bff', emissive: '#1e5bff', emissiveIntensity: 2 }),
      gt = new THREE.MeshStandardMaterial({ color: '#ff1010', emissive: '#ff1010', emissiveIntensity: 2 });
    (rbox(u, 0.06, 0.05, 0.2, 0.01, G[0] - 0.15, b(G[0] - 0.12) + 0.13, -0.2, J),
      rbox(u, 0.06, 0.05, 0.2, 0.01, G[0] - 0.15, b(G[0] - 0.12) + 0.13, 0.2, gt),
      l.push({ mat: J, phase: 0, base: 3, fast: true }, { mat: gt, phase: PI, base: 3, fast: true }));
  }
  if (B === 'kurye' && !st.box) {
    let J = -m / 2 + 0.55,
      gt = b(J);
    (rbox(u, 0.55, 0.5, 0.6, 0.05, J, gt + 0.27, 0, mat('#e8582a', 0.6)),
      [-1, 1].forEach((j) =>
        decal(u, textTex('kurye', 'NEON YEMEK', { w: 256, h: 128, fg: '#fff', font: '900 40px Arial' }), 0.5, 0.25, J, gt + 0.3, j * 0.305, j),
      ));
  }
  if (B === 'kurye' || B === 'yolyardim') {
    let J = B === 'kurye' ? 'NEON YEMEK' : 'YOL YARDIM';
    [-1, 1].forEach((gt) => decal(u, textTex(`lv${B}`, J, { fg: '#fff', font: '900 70px Arial', stroke: '#111' }), M, 0.24, vt, A, gt * (y / 2 + 0.012), gt));
  }
  if (B === 'yaris') {
    let J = mat(t.paint.toLowerCase() === '#f4f4f2' || t.paint.toLowerCase() === '#f2f2ef' ? '#c8141e' : '#f4f4f2', 0.4),
      gt = 26;
    for (let j = 0; j < gt; j++) {
      let mt = -m / 2 + 0.15 + ((m - 0.3) * j) / gt,
        Pt = -m / 2 + 0.15 + ((m - 0.3) * (j + 1)) / gt,
        Ut = (mt + Pt) / 2;
      if (Ut < G[0] + 0.05 && Ut > yt - 0.05) continue;
      let Tt = b(mt),
        Qt = b(Pt),
        $t = Math.hypot(Pt - mt, Qt - Tt);
      [-0.16, 0.16].forEach((be) => box(u, $t + 0.01, 0.006, 0.18, Ut, (Tt + Qt) / 2 + 0.004, be, J, Math.atan2(Qt - Tt, Pt - mt)));
    }
  }
  let tt = t.sideNo || (B === 'yaris' ? '77' : '');
  if (tt && !['polis', 'ambulans', 'taksi', 'kurye', 'yolyardim'].includes(B)) {
    let J = canvasTex(`no|${tt}`, 128, 128, (gt, j) => {
      ((gt.fillStyle = '#fff'),
        gt.beginPath(),
        gt.arc(j / 2, j / 2, 60, 0, 7),
        gt.fill(),
        (gt.strokeStyle = '#111'),
        (gt.lineWidth = 6),
        gt.stroke(),
        (gt.fillStyle = '#111'),
        (gt.font = `900 ${tt.length > 2 ? 46 : 70}px Arial`),
        (gt.textAlign = 'center'),
        (gt.textBaseline = 'middle'),
        gt.fillText(tt, j / 2, j / 2 + 4));
    });
    [-1, 1].forEach((gt) => decal(u, J, 0.4, 0.4, vt, A, gt * (y / 2 + 0.016), gt));
  }
  let lt = null;
  if (st.neon) {
    let J = canvasTex('glow', 128, 128, (mt, Pt) => {
        let Ut = mt.createRadialGradient(Pt / 2, Pt / 2, 0, Pt / 2, Pt / 2, Pt / 2);
        (Ut.addColorStop(0, 'rgba(255,255,255,1)'),
          Ut.addColorStop(0.5, 'rgba(255,255,255,0.35)'),
          Ut.addColorStop(1, 'rgba(255,255,255,0)'),
          (mt.fillStyle = Ut),
          mt.fillRect(0, 0, Pt, Pt));
      }),
      gt = new THREE.MeshBasicMaterial({ map: J, color: t.neonColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    ((lt = new THREE.Mesh(new THREE.PlaneGeometry(y * 2.2, m * 1.5), gt)), (lt.rotation.x = -PI / 2), (lt.position.y = 0.02), c.add(lt));
    let j = new THREE.MeshBasicMaterial({ color: t.neonColor });
    [-1, 1].forEach((mt) => box(u, R - w - 2 * C, 0.025, 0.025, vt, p - 0.02, mt * (y / 2 - 0.1), j));
  }
  let it = i.wz || y / 2 - x / 2 - 0.015,
    Lt = t.finish === 'krom' && t.rim === '#e2e2e6' ? CHROME() : mat(t.rim, 0.25, 0.8),
    _t = [];
  return (
    [w, R].forEach((J) =>
      [-1, 1].forEach((gt) => {
        let j = wheel(d, J, g * _, gt * (it + (t.deep ? 0.04 : 0)), g * _, x * (t.deep ? 1.15 : 1), {
          spokes: t.spokes,
          mirror: gt < 0,
          rimM: Lt,
          caliper: t.caliper,
          thin: t.rimStyle === 'tel',
          tire: t.tire,
          letter: t.letter,
          deep: t.deep,
          style: t.rimStyle,
        });
        ((j.front = J === R), _t.push(j));
      }),
    ),
    c.traverse((J) => {
      J.isMesh && !J.material.transparent && ((J.castShadow = true), (J.receiveShadow = true));
    }),
    {
      taxiSign: u.userData.taxiSign || null,
      root: c,
      tilt: h,
      body: u,
      wheels: _t,
      hlMat: a,
      tlMat: o,
      flashers: l,
      def: e,
      spec: i,
      len: m + 0.2,
      wb: R - w,
      halfW: y / 2,
      neon: lt,
      // v150 — oyun motoru için: koltuk noktaları (gövde yereli) ve "içerisi görünür mü"
      seat: i.seat,
      seatPts: Mt,
      open: !S || t.tint !== 'koyu',
      closed: S,
    }
  );
}



// =============================================================================
// v151 — OTOBÜS / AMBULANS (panelvan) / TIR — Neon Garaj prototipinden
// =============================================================================
let glassMat = () => mat("#9fc4d8", 0.05, 0.3, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
function newRig() {
  let n = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff4d6", emissiveIntensity: 3.2, roughness: 0.1 }),
    t = new THREE.MeshStandardMaterial({ color: "#330000", emissive: "#ff1010", emissiveIntensity: 1.2, roughness: 0.2 }),
    e = new THREE.Group(),
    i = new THREE.Group();
  e.add(i);
  let s = new THREE.Group();
  ((s.rotation.y = -PI / 2), i.add(s));
  let r = new THREE.Group();
  return ((r.rotation.y = -PI / 2), e.add(r), { root: e, tilt: i, body: s, wheelsG: r, hlMat: n, tlMat: t, flashers: [], wheels: [] });
}
function glowPlane(n, t, e) {
  let i = canvasTex("glow", 128, 128, (r, a) => {
      let o = r.createRadialGradient(a / 2, a / 2, 0, a / 2, a / 2, a / 2);
      (o.addColorStop(0, "rgba(255,255,255,1)"),
        o.addColorStop(0.5, "rgba(255,255,255,0.35)"),
        o.addColorStop(1, "rgba(255,255,255,0)"),
        (r.fillStyle = o),
        r.fillRect(0, 0, a, a));
    }),
    s = new THREE.Mesh(
      new THREE.PlaneGeometry(t, e),
      new THREE.MeshBasicMaterial({ map: i, color: n, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
  return ((s.rotation.x = -PI / 2), (s.position.y = 0.02), s);
}
function lightBar(n, t, e, i, s, r, a, o, l, c, f = true) {
  let h = new THREE.MeshStandardMaterial({ color: e, emissive: e, emissiveIntensity: 2, transparent: true, opacity: 0.92 });
  (rbox(n, i, s, r, 0.03, a, o, l, h), t.push({ mat: h, phase: c, base: 3, fast: f }));
}
function ledTex(n) {
  return canvasTex(`led|${n}`, 1024, 128, (t, e, i) => {
    ((t.fillStyle = "#0a0a0a"),
      t.fillRect(0, 0, e, i),
      (t.fillStyle = "#ffb000"),
      (t.font = 'bold 84px "Courier New", monospace'),
      (t.textAlign = "center"),
      (t.textBaseline = "middle"),
      t.fillText(n.toUpperCase().slice(0, 22), e / 2, i / 2 + 4));
  });
}
let BUS_TYPES = {
  minibus: {
    name: "Minib\xFCs (Dolmu\u015F)",
    L: 5.9,
    W: 2,
    H: 2.55,
    r: 0.37,
    paint: "#f4f4f2",
    accent: "#19a0d8",
    seats: 12,
    sign: "TAKS\u0130M - KADIK\xD6Y",
    vmax: 22,
  },
  otobus: {
    name: "\u015Eehir Otob\xFCs\xFC",
    L: 11.5,
    W: 2.5,
    H: 3.1,
    r: 0.5,
    paint: "#19a0d8",
    accent: "#f4f4f2",
    seats: 28,
    sign: "34 N\u015E  L\u0130MAN - MERKEZ",
    vmax: 18,
  },
  okul: {
    name: "Okul Servisi",
    L: 8.2,
    W: 2.35,
    H: 2.9,
    r: 0.46,
    paint: "#f6b800",
    accent: "#111111",
    seats: 20,
    sign: "OKUL TA\u015EITI",
    vmax: 18,
    nose: 1.35,
  },
  ambulans: { name: "Ambulans", L: 6.2, W: 2.05, H: 2.7, r: 0.38, paint: "#f4f4f2", accent: "#c8141e", seats: 4, sign: "AMBULANS", vmax: 26 },
  karavan: { name: "Karavan", L: 6.8, W: 2.25, H: 2.95, r: 0.4, paint: "#efe6d2", accent: "#7a4a1e", seats: 4, sign: "GEZG\u0130N", vmax: 20 },
  turistik: {
    name: "Turistik A\xE7\u0131k Otob\xFCs",
    L: 11,
    W: 2.5,
    H: 4.1,
    r: 0.5,
    paint: "#c8141e",
    accent: "#ffd23f",
    seats: 30,
    sign: "\u015EEH\u0130R TURU",
    vmax: 15,
    deck2: true,
  },
};
function defaultBusConfig(n = "minibus") {
  let t = BUS_TYPES[n];
  return {
    kind: "bus",
    variant: n,
    paint: t.paint,
    accent: t.accent,
    finish: "parlak",
    rim: "#c9ccd2",
    tire: "#121212",
    letter: false,
    sign: t.sign,
    people: Math.min(6, t.seats),
    plate: "34 N\u015E 155",
    acc: { rack: n === "karavan", ladder: n === "karavan", beacon: false, neon: false, bullbar: false, awning: n === "karavan", bikes: false, stopArm: n === "okul" },
    neonColor: "#19e8ff",
    siren: n === "ambulans",
  };
}
function buildBusModel(n) {
  let t = BUS_TYPES[n.variant] || BUS_TYPES.minibus,
    e = newRig(),
    { body: i, wheelsG: s, hlMat: r, tlMat: a, flashers: o } = e,
    { L: l, W: c, H: f, r: h } = t,
    u = paintMat(n.paint, n.finish),
    d = mat(n.accent, 0.4, 0.2),
    m = mat("#0c0c0e", 0.5, 0.3),
    y = glassMat(),
    p = h + 0.18,
    g = t.nose || 0,
    x = p + (t.deck2 ? 0.85 : 0.95),
    _ = t.deck2 ? p + 2 : f,
    v = l / 2,
    C = -l / 2,
    w = v - g;
  if ((rbox(i, l - g, x - p + 0.1, c, 0.12, (w + C) / 2, (x + p) / 2 - 0.05, 0, u), g)) {
    (rbox(i, g + 0.1, 0.95, c - 0.3, 0.15, v - g / 2, p + 0.45, 0, u), rbox(i, 0.12, 0.5, c - 0.6, 0.03, v + 0.02, p + 0.4, 0, CHROME()));
    for (let ft = 0; ft < 6; ft++) box(i, 0.13, 0.025, c - 0.66, v + 0.03, p + 0.2 + ft * 0.075, 0, mat("#222", 0.5));
  }
  [-1, 1].forEach((ft) => box(i, l - g - 0.1, 0.16, 0.01, (w + C) / 2, x - 0.3, ft * (c / 2 + 0.006), d));
  let R = _ - x - 0.08,
    P = Math.max(3, Math.round((l - g) / 1.3)),
    z = (w - C - 0.2) / P;
  [-1, 1].forEach((ft) => {
    for (let St = 0; St <= P; St++) box(i, 0.09, R, 0.07, C + 0.1 + St * z, x + R / 2, ft * (c / 2 - 0.035), u);
    let pt = new THREE.Mesh(new THREE.PlaneGeometry(w - C - 0.2, R), y);
    (pt.position.set((w + C) / 2, x + R / 2, ft * (c / 2 - 0.03)), i.add(pt));
  });
  let b = new THREE.Mesh(new THREE.PlaneGeometry(c - 0.12, R + (g ? 0 : 0.35)), y);
  ((b.rotation.y = PI / 2),
    b.position.set(w - 0.02, x + R / 2 - (g ? 0 : 0.17), 0),
    i.add(b),
    [-1, 1].forEach((ft) => box(i, 0.08, R + 0.3, 0.1, w - 0.04, x + R / 2 - 0.15, ft * (c / 2 - 0.05), u)));
  let S = b.clone();
  if (((S.position.x = C + 0.03), i.add(S), t.deck2 || rbox(i, l - g + 0.02, 0.14, c + 0.02, 0.06, (w + C) / 2, _, 0, u), t.deck2)) {
    rbox(i, l - g, 0.16, c, 0.05, (w + C) / 2, _, 0, u);
    let ft = mat("#ffd23f", 0.3, 0.6);
    ([-1, 1].forEach((St) => {
      (box(i, l - 0.2, 0.55, 0.04, 0, _ + 0.35, St * (c / 2 - 0.03), u),
        (cyl(i, 0.03, 0.03, l - 0.2, 0, _ + 0.75, St * (c / 2 - 0.03), ft, 8).rotation.z = PI / 2));
      for (let Mt = 0; Mt < 10; Mt++) cyl(i, 0.02, 0.02, 0.4, C + 0.3 + Mt * ((l - 0.6) / 9), _ + 0.6, St * (c / 2 - 0.03), ft, 6);
    }),
      box(i, 0.04, 0.9, c - 0.06, v - 0.03, _ + 0.5, 0, u),
      box(i, 0.04, 0.55, c - 0.06, C + 0.03, _ + 0.35, 0, u));
    let pt = 0;
    for (let St = 0; St < 7; St++) {
      let Mt = v - 1 - St * 1.25;
      [-1, 1].forEach((kt) => {
        if (
          (rbox(i, 0.45, 0.12, 0.85, 0.04, Mt, _ + 0.2, kt * 0.6, mat("#1f2533", 0.7)),
          rbox(i, 0.1, 0.5, 0.85, 0.04, Mt - 0.24, _ + 0.45, kt * 0.6, mat("#1f2533", 0.7)),
          pt < Math.max(0, n.people - 2) && (St + kt) % 2 === 0)
        ) {
          let Nt = seatedPerson(40 + pt, {});
          (Nt.position.set(Mt - 0.05, _ + 0.27, kt * 0.6 + (pt % 2 ? 0.2 : -0.2)), (Nt.rotation.y = 0), i.add(Nt));
        }
        pt++;
      });
    }
  }
  box(i, l - g - 0.2, 0.04, c - 0.2, (w + C) / 2, p + 0.1, 0, mat("#2a2f3a", 0.9));
  let H = w - 0.75;
  (rbox(i, 0.45, 0.12, 0.5, 0.04, H, p + 0.55, -c / 2 + 0.45, mat("#111", 0.7)),
    rbox(i, 0.1, 0.6, 0.5, 0.04, H - 0.25, p + 0.85, -c / 2 + 0.45, mat("#111", 0.7)));
  let W = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 22), mat("#111", 0.4));
  (W.position.set(H + 0.5, p + 1, -c / 2 + 0.45), (W.rotation.y = PI / 2), (W.rotation.x = 0.9), i.add(W));
  let V = n.variant === "ambulans" ? "#c8141e" : n.variant === "okul" ? "#ffd23f" : n.variant === "otobus" ? "#1b2a6b" : null;
  if (n.people > 0) {
    let ft = seatedPerson(77, { uniform: V, cap: n.variant === "otobus" ? "#1b2a6b" : null });
    (ft.position.set(H - 0.05, p + 0.62, -c / 2 + 0.45), i.add(ft));
  }
  // v151 — oyun motoru: koltuk noktaları (gövde yereli; 0 = şoför)
  const seatPts = [[H, p + 0.62, -c / 2 + 0.45]];
  if (n.variant === "ambulans") seatPts.push([C + 1.6, p + 0.62, -0.55], [C + 1.6, p + 0.78, 0.35], [C + 2.4, p + 0.62, -0.55]);
  else if (n.variant !== "karavan") {
    const rows = [];
    for (let Nt = w - 1.6; Nt > C + 0.5; Nt -= 0.85) rows.push(Nt);
    rows.forEach((Nt, k) => [-c / 2 + 0.45, c / 2 - 0.45].forEach((E) => !(n.variant === "minibus" && E > 0 && k === 0) && seatPts.push([Nt - 0.03, p + 0.62, E])));
    if (t.deck2) for (let St = 0; St < 7; St++) [-1, 1].forEach((kt) => seatPts.push([v - 1 - St * 1.25 - 0.05, _ + 0.27, kt * 0.6]));
  } else seatPts.push([C + 1.7, p + 0.62, 0.4], [C + 3.1, p + 0.62, 0.4]);
  let Y = mat(n.variant === "okul" ? "#3a5fa8" : "#30343f", 0.7),
    G = [];
  if (n.variant === "ambulans") {
    if (
      (rbox(i, 1.9, 0.1, 0.6, 0.03, C + 1.6, p + 0.7, 0.35, mat("#e8e8ea", 0.5)),
      box(i, 1.9, 0.5, 0.05, C + 1.6, p + 0.42, 0.35, CHROME()),
      rbox(i, 0.6, 0.6, 0.12, 0.05, C + 0.5, p + 1.4, -c / 2 + 0.15, mat("#3ad07a", 0.5)),
      n.people > 1)
    ) {
      let ft = seatedPerson(5, {});
      (ft.position.set(C + 1.6, p + 0.78, 0.35), (ft.rotation.z = -PI / 2 + 0.15), i.add(ft));
    }
    if (n.people > 2) {
      let ft = seatedPerson(6, { uniform: "#c8141e" });
      (rbox(i, 0.4, 0.12, 0.45, 0.04, C + 1.6, p + 0.55, -0.55, Y), ft.position.set(C + 1.6, p + 0.62, -0.55), (ft.rotation.y = PI / 2), i.add(ft));
    }
  } else if (n.variant === "karavan") {
    (rbox(i, 0.9, 0.06, 0.7, 0.02, C + 2.4, p + 0.85, 0.35, mat("#c9a26b", 0.5)),
      [C + 1.7, C + 3.1].forEach((ft) => rbox(i, 0.45, 0.45, 0.9, 0.05, ft, p + 0.35, 0.4, mat("#7a4a1e", 0.7))),
      rbox(i, 1.6, 0.9, 0.55, 0.03, C + 1.2, p + 0.55, -c / 2 + 0.35, mat("#e8e2d0", 0.5)));
    for (let ft = 0; ft < Math.min(n.people - 1, 2); ft++) {
      let pt = seatedPerson(20 + ft, {});
      (pt.position.set(ft ? C + 3.1 : C + 1.7, p + 0.62, 0.4), (pt.rotation.y = ft ? PI : 0), i.add(pt));
    }
  } else {
    for (let Nt = w - 1.6; Nt > C + 0.5; Nt -= 0.85) G.push(Nt);
    let ft = -c / 2 + 0.45,
      pt = c / 2 - 0.45,
      St = Math.max(0, n.people - 1),
      Mt = [];
    (G.forEach((Nt, k) => {
      [ft, pt].forEach((E) => {
        (n.variant === "minibus" && E === pt && k === 0) ||
          (rbox(i, 0.42, 0.12, 0.75, 0.04, Nt, p + 0.55, E, Y), rbox(i, 0.09, 0.55, 0.75, 0.04, Nt - 0.22, p + 0.85, E, Y), Mt.push([Nt, E, k]));
      });
    }),
      [...Mt.filter((Nt, k) => k % 2 === 0), ...Mt.filter((Nt, k) => k % 2 === 1)].slice(0, St).forEach(([Nt, k, E], et) => {
        let st = seatedPerson(100 + et * 3, {});
        (st.position.set(Nt - 0.03, p + 0.62, k + (E % 2 ? 0.15 : -0.15)), i.add(st));
      }));
  }
  (box(i, 0.9, x - p + R - 0.1, 0.02, w - 1, p + (x - p + R) / 2, c / 2 + 0.01, mat("#14181f", 0.3, 0.5, { transparent: true, opacity: 0.55 })),
    [-1, 1].forEach((ft) => {
      (rbox(i, 0.08, 0.16, 0.36, 0.03, v + 0.03, p + 0.35, ft * (c / 2 - 0.3), r), rbox(i, 0.08, 0.3, 0.18, 0.03, C - 0.03, p + 0.55, ft * (c / 2 - 0.15), a));
    }),
    rbox(i, 0.2, 0.2, c + 0.02, 0.05, v + 0.05, p + 0.08, 0, m),
    rbox(i, 0.2, 0.2, c + 0.02, 0.05, C - 0.05, p + 0.08, 0, m),
    plate(i, n.plate, v + 0.16, p + 0.12, 0, PI / 2),
    plate(i, n.plate, C - 0.16, p + 0.12, 0, -PI / 2),
    [-1, 1].forEach((ft) => {
      (box(i, 0.04, 0.04, 0.3, v - 0.05 - g, x + 0.4, ft * (c / 2 + 0.15), m), rbox(i, 0.06, 0.32, 0.18, 0.02, v - 0.05 - g, x + 0.25, ft * (c / 2 + 0.3), m));
    }));
  let ot = t.deck2 ? _ + 0.75 : _ - 0.16,
    D = new THREE.MeshStandardMaterial({ map: ledTex(n.sign || t.sign), emissive: "#ffffff", emissiveMap: ledTex(n.sign || t.sign), emissiveIntensity: 0.9 }),
    ut = new THREE.Mesh(new THREE.PlaneGeometry(c - 0.3, 0.26), D);
  ((ut.rotation.y = PI / 2), ut.position.set(t.deck2 ? v + 0.002 : w + 0.01, ot, 0), i.add(ut));
  let bt = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.24), D);
  (bt.position.set(w - 1.9, x + R - 0.12, c / 2 + 0.002), i.add(bt));
  let yt = (w + C) / 2;
  if (n.variant === "okul") {
    [-1, 1].forEach((St) => {
      (box(i, l - g - 0.1, 0.06, 0.012, yt, x - 0.55, St * (c / 2 + 0.008), mat("#111", 0.4)),
        decal(i, textTex("okul", "OKUL TA\u015EITI", { fg: "#111", font: "900 80px Arial" }), 2.4, 0.4, yt - 0.9, x - 0.25, St * (c / 2 + 0.012), St));
    });
    let ft = textTex("okulb", "OKUL TA\u015EITI", { bg: "#f6b800", fg: "#111", font: "900 80px Arial", border: "#111" }),
      pt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshStandardMaterial({ map: ft }));
    if (
      ((pt.rotation.y = -PI / 2),
      pt.position.set(C - 0.02, _ - 0.25, 0),
      i.add(pt),
      [-1, 1].forEach((St) => {
        (lightBar(i, o, "#ff9900", 0.06, 0.12, 0.12, v - g - 0.02, _ - 0.05, St * (c / 2 - 0.25), St > 0 ? 0 : PI, false),
          lightBar(i, o, "#ff9900", 0.06, 0.12, 0.12, C - 0.01, _ - 0.05, St * (c / 2 - 0.25), St > 0 ? 0 : PI, false));
      }),
      n.acc.stopArm)
    ) {
      let St = new THREE.Group();
      (St.position.set(w - 1.6, x - 0.1, -c / 2 - 0.05), i.add(St));
      let Mt = canvasTex("stop", 128, 128, (Nt, k) => {
          ((Nt.fillStyle = "#c8141e"), Nt.beginPath());
          for (let E = 0; E < 8; E++) {
            let et = (E / 8) * PI * 2 + PI / 8;
            Nt.lineTo(k / 2 + Math.cos(et) * 60, k / 2 + Math.sin(et) * 60);
          }
          (Nt.fill(), (Nt.fillStyle = "#fff"), (Nt.font = "900 34px Arial"), (Nt.textAlign = "center"), Nt.fillText("DUR", k / 2, k / 2 + 12));
        }),
        kt = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshStandardMaterial({ map: Mt, transparent: true, side: THREE.DoubleSide }));
      ((kt.position.z = -0.25), (kt.rotation.y = PI), St.add(kt), (e.stopArm = St));
    }
  }
  if (n.variant === "ambulans") {
    let ft = canvasTex("ambchk", 512, 64, (pt) => {
      for (let St = 0; St < 16; St++) ((pt.fillStyle = St % 2 ? "#c8141e" : "#ffd23f"), pt.fillRect(St * 32, 0, 32, 64));
    });
    [-1, 1].forEach((pt) => {
      (decal(i, ft, l - 0.2, 0.22, 0, x - 0.45, pt * (c / 2 + 0.012), pt),
        decal(i, textTex("amb", "AMBULANS", { fg: "#c8141e", font: "900 84px Arial" }), 2, 0.35, yt, x - 0.12, pt * (c / 2 + 0.012), pt),
        decal(i, textTex("ambx", "\u271A 112", { fg: "#1e5bff", font: "900 90px Arial" }), 1.1, 0.4, C + 1, x + 0.4, pt * (c / 2 + 0.012), pt));
    });
  }
  ((n.variant === "otobus" || n.variant === "minibus") &&
    [-1, 1].forEach((ft) =>
      decal(
        i,
        textTex(`bel${n.variant}`, n.variant === "otobus" ? "NEON \u015EEH\u0130R BELED\u0130YES\u0130" : "DOLMU\u015E", {
          w: 1024,
          fg: "#fff",
          font: "900 70px Arial",
          stroke: "#0a2a44",
        }),
        n.variant === "otobus" ? 4 : 1.6,
        0.4,
        yt,
        x - 0.55,
        ft * (c / 2 + 0.012),
        ft,
      ),
    ),
    n.variant === "turistik" &&
      [-1, 1].forEach((ft) =>
        decal(
          i,
          textTex("tur", "NEON \u015EEH\u0130R TURU", { w: 1024, fg: "#ffd23f", font: "900 80px Arial", stroke: "#5a0000" }),
          4.5,
          0.45,
          yt,
          x - 0.35,
          ft * (c / 2 + 0.012),
          ft,
        ),
      ),
    n.variant === "karavan" &&
      ([-1, 1].forEach((ft) => box(i, l - 0.3, 0.1, 0.01, 0, x - 0.2, ft * (c / 2 + 0.008), mat(n.accent, 0.5))),
      rbox(i, 0.8, 0.25, 0.7, 0.05, -0.8, _ + 0.16, 0, mat("#f4f4f2", 0.5))));
  let Zt = n.acc || {};
  if (Zt.rack && !t.deck2) {
    [-1, 1].forEach((ft) => box(i, l * 0.55, 0.05, 0.05, -0.2, _ + 0.18, ft * (c / 2 - 0.15), CHROME()));
    for (let ft = 0; ft < 6; ft++) box(i, 0.04, 0.04, c - 0.3, -0.2 - l * 0.27 + ft * (l * 0.11), _ + 0.18, 0, CHROME());
    (rbox(i, 0.9, 0.35, 0.8, 0.05, 0.3, _ + 0.38, -0.3, mat("#3a4a2a", 0.8)), rbox(i, 0.7, 0.3, 0.6, 0.05, -0.7, _ + 0.35, 0.35, mat("#6b4423", 0.7)));
  }
  if (Zt.ladder && !t.deck2) {
    [-0.3, 0.3].forEach((ft) => box(i, 0.04, _ - p, 0.04, C - 0.08, (_ + p) / 2 + 0.1, ft, CHROME()));
    for (let ft = 0; ft < 7; ft++) box(i, 0.04, 0.03, 0.6, C - 0.08, p + 0.3 + ft * 0.3, 0, CHROME());
  }
  if (Zt.awning) {
    let ft = new THREE.Group();
    (ft.position.set(-0.3, _ - 0.1, c / 2 + 0.05), i.add(ft));
    let pt = canvasTex("awning", 256, 64, (Mt, kt, Nt) => {
        for (let k = 0; k < 8; k++) ((Mt.fillStyle = k % 2 ? "#f4f4f2" : n.accent), Mt.fillRect(k * 32, 0, 32, Nt));
      }),
      St = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: pt, side: THREE.DoubleSide, roughness: 0.8 }));
    ((St.rotation.x = -PI / 2 + 0.25),
      St.position.set(0, -0.2, 0.78),
      ft.add(St),
      [-1.5, 1.5].forEach((Mt) => box(ft, 0.04, _ - 0.25, 0.04, Mt, -(_ - 0.25) / 2 - 0.3, 1.55, CHROME())));
  }
  if (
    (Zt.bikes &&
      ([-0.35, 0.35].forEach((ft, pt) => {
        let St = new THREE.Group();
        (St.position.set(C - 0.3, p + 0.9, ft),
          (St.rotation.y = PI / 2),
          i.add(St),
          [-0.45, 0.45].forEach((Mt) => {
            let kt = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 20), mat("#111", 0.8));
            ((kt.position.x = Mt), St.add(kt));
          }),
          box(St, 0.9, 0.04, 0.04, 0, 0.18, 0, mat(pt ? "#19e8ff" : "#ff2e8c", 0.4)));
      }),
      box(i, 0.3, 0.05, 1, C - 0.15, p + 0.55, 0, m)),
    Zt.bullbar)
  ) {
    [-1, 1].forEach((pt) => cyl(i, 0.045, 0.045, 0.7, v + 0.2, p + 0.35, pt * (c / 2 - 0.35), CHROME(), 10));
    let ft = cyl(i, 0.045, 0.045, c - 0.4, v + 0.2, p + 0.7, 0, CHROME(), 10);
    ft.rotation.x = PI / 2;
  }
  if (n.variant === "ambulans" || n.siren || Zt.beacon) {
    let ft = n.variant === "ambulans" || n.siren;
    (box(i, 0.25, 0.06, c - 0.4, w - 0.3, t.deck2 ? _ + 0.9 : _ + 0.1, 0, mat("#222", 0.5)),
      [-1, 1].forEach((pt, St) =>
        lightBar(
          i,
          o,
          ft ? (St ? "#1e5bff" : "#ff1010") : "#ff9900",
          0.22,
          0.12,
          (c - 0.5) / 2,
          w - 0.3,
          t.deck2 ? _ + 0.98 : _ + 0.18,
          (pt * (c - 0.4)) / 4,
          St * PI,
          ft,
        ),
      ));
  }
  let ae = v - (g ? 0.85 : 1.05),
    rt = C + (l > 9 ? 2.6 : 1.4),
    dt = mat(n.rim, 0.25, 0.8);
  return (
    [ae, rt].forEach((ft) =>
      [-1, 1].forEach((pt) => {
        let St = wheel(s, ft, h, pt * (c / 2 - 0.2), h, ft === rt && l > 7 ? 0.48 : 0.28, {
          spokes: 8,
          mirror: pt < 0,
          rimM: dt,
          caliper: null,
          tire: n.tire,
          letter: n.letter,
          style: "disk",
        });
        ((St.front = ft === ae), e.wheels.push(St));
      }),
    ),
    [ae, rt].forEach((ft) => [-1, 1].forEach((pt) => box(i, h * 2.3, 0.08, 0.02, ft, p + h * 0.55, pt * (c / 2 + 0.008), m))),
    Zt.neon && ((e.neon = glowPlane(n.neonColor, c * 2.4, l * 1.4)), e.root.add(e.neon)),
    e.root.traverse((ft) => {
      ft.isMesh && !ft.material.transparent && ((ft.castShadow = true), (ft.receiveShadow = true));
    }),
    { ...e, def: { name: t.name, seats: t.seats, phys: { vmax: t.vmax, acc: 3.2, grip: 5, steer: 0.45 } }, len: l, wb: ae - rt, halfW: c / 2, seatPts, seat: seatPts[0], open: true }
  );
}
let TRUCK_TRAILERS = {
  konteyner: { name: "Konteyner", color: "#1e6fb8" },
  tenteli: { name: "Tenteli", color: "#2f8f4a" },
  frigo: { name: "Frigorifik", color: "#f4f4f2" },
  tanker: { name: "Tanker", color: "#d8dade" },
  sal: { name: "Sal (Kereste)", color: "#3a3f4a" },
  oto: { name: "Oto Ta\u015F\u0131y\u0131c\u0131", color: "#3a3f4a" },
};
function defaultTruckConfig() {
  return {
    kind: "truck",
    paint: "#c8141e",
    finish: "metalik",
    trailer: "konteyner",
    trailerColor: "#1e6fb8",
    company: "NEON LOJ\u0130ST\u0130K",
    attached: true,
    rim: "#c9ccd2",
    tire: "#121212",
    letter: false,
    people: 1,
    plate: "34 TIR 34",
    acc: { spoiler: true, beacon: false, horns: true, stacks: false, bullbar: false, lightbar: false, fog: true, neon: false, sunvisor: true },
    neonColor: "#19e8ff",
  };
}
function truckCab(n, t, e) {
  return canvasTex(`tr|${n}|${t}|${e}`, 1024, 256, (i, s, r) => {
    if (((i.fillStyle = t), i.fillRect(0, 0, s, r), n === "konteyner" || n === "frigo"))
      for (let o = 0; o < s; o += 12) ((i.fillStyle = "rgba(0,0,0,0.13)"), i.fillRect(o, 0, 5, r));
    if (n === "tenteli") for (let o = 0; o < s; o += 64) ((i.fillStyle = "rgba(0,0,0,0.18)"), i.fillRect(o, 0, 3, r));
    let a = parseInt(t.slice(1, 3), 16) + parseInt(t.slice(3, 5), 16) + parseInt(t.slice(5, 7), 16) > 560;
    ((i.fillStyle = a ? "#13306b" : "#ffffff"),
      (i.font = "900 110px Arial"),
      (i.textAlign = "center"),
      (i.textBaseline = "middle"),
      i.fillText(e.slice(0, 16), s / 2, r / 2 - (n === "frigo" ? 20 : 0)),
      n === "frigo" && ((i.font = "bold 44px Arial"), i.fillText("\u2744 SO\u011EUK Z\u0130NC\u0130R", s / 2, r / 2 + 80)));
  });
}
function buildTruckModel(n) {
  let t = newRig(),
    { body: e, wheelsG: i, hlMat: s, tlMat: r, flashers: a } = t,
    o = paintMat(n.paint, n.finish),
    l = mat("#0c0c0e", 0.5, 0.3),
    c = glassMat(),
    f = 6.4,
    h = 2.5,
    u = 0.53,
    d = f / 2,
    m = d - 2.25,
    y = 1.15,
    p = 3.75;
  ([-0.45, 0.45].forEach((D) => box(e, f - 0.4, 0.28, 0.12, -0.1, 0.95, D, l)), rbox(e, 2.25, 1.2, h, 0.1, d - 1.125, y + 0.6, 0, o));
  let g = y + 1.2,
    x = p - g - 0.35;
  ([-1, 1].forEach((D) => {
    (box(e, 0.8, x, 0.06, m + 0.4, g + x / 2, D * (h / 2 - 0.03), o), box(e, 0.1, x, 0.08, d - 0.05, g + x / 2, D * (h / 2 - 0.04), o));
    let ut = new THREE.Mesh(new THREE.PlaneGeometry(1.35, x), c);
    (ut.position.set(d - 0.75, g + x / 2, D * (h / 2 - 0.02)), t.body.add(ut));
  }),
    box(e, 0.08, x, h - 0.1, m + 0.04, g + x / 2, 0, o));
  let _ = new THREE.Mesh(new THREE.PlaneGeometry(h - 0.18, x), c);
  ((_.rotation.y = PI / 2), _.position.set(d + 0.01, g + x / 2, 0), e.add(_), rbox(e, 2.3, 0.38, h + 0.02, 0.08, d - 1.15, p - 0.17, 0, o));
  for (let D = 0; D < 5; D++) box(e, 0.04, 0.05, h - 0.6, d + 0.06, y + 0.4 + D * 0.13, 0, CHROME());
  (rbox(e, 0.3, 0.38, h + 0.04, 0.06, d + 0.08, 0.95, 0, l),
    [-1, 1].forEach((D) => rbox(e, 0.08, 0.2, 0.42, 0.03, d + 0.08, y + 0.15, D * (h / 2 - 0.35), s)),
    plate(e, n.plate, d + 0.24, 0.9, 0, PI / 2),
    [-1, 1].forEach((D) => {
      (box(e, 0.6, 0.06, 0.25, d - 0.9, 0.75, D * (h / 2 - 0.05), CHROME()), box(e, 0.6, 0.06, 0.25, d - 0.9, 1.05, D * (h / 2 - 0.05), CHROME()));
      let ut = cyl(e, 0.32, 0.32, 1.3, -0.1, 0.85, D * (h / 2 - 0.4), CHROME(), 18);
      ut.rotation.z = PI / 2;
    }),
    [-1, 1].forEach((D) => {
      (box(e, 0.05, 0.05, 0.35, d - 0.15, g + 0.6, D * (h / 2 + 0.17), l), rbox(e, 0.07, 0.55, 0.22, 0.02, d - 0.15, g + 0.45, D * (h / 2 + 0.36), l));
    }),
    rbox(e, 0.5, 0.15, 0.55, 0.05, d - 1.05, g - 0.15, -0.6, mat("#111", 0.7)),
    rbox(e, 0.12, 0.75, 0.55, 0.05, d - 1.3, g + 0.25, -0.6, mat("#111", 0.7)),
    rbox(e, 0.5, 0.15, 0.55, 0.05, d - 1.05, g - 0.15, 0.6, mat("#111", 0.7)),
    rbox(e, 0.12, 0.75, 0.55, 0.05, d - 1.3, g + 0.25, 0.6, mat("#111", 0.7)));
  const seatPts = [[d - 1.1, g - 0.08, -0.6], [d - 1.1, g - 0.08, 0.6]];
  let v = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 22), mat("#111", 0.4));
  (v.position.set(d - 0.5, g + 0.35, -0.6), (v.rotation.y = PI / 2), (v.rotation.x = 1), e.add(v));
  for (let D = 0; D < Math.min(2, n.people); D++) {
    let ut = seatedPerson(300 + D, {});
    (ut.position.set(d - 1.1, g - 0.08, D ? 0.6 : -0.6), e.add(ut));
  }
  (cyl(e, 0.55, 0.55, 0.1, -1.2, 1.15, 0, mat("#222", 0.5, 0.5), 20),
    [-1.3, -2.6].forEach((D) => [-1, 1].forEach((ut) => box(e, 0.9, 0.06, 0.6, D, 1.18, ut * (h / 2 - 0.25), l))),
    [-1, 1].forEach((D) => rbox(e, 0.1, 0.2, 0.25, 0.03, -f / 2 + 0.05, 1.1, D * (h / 2 - 0.25), r)));
  let C = n.acc || {};
  if (C.spoiler) {
    let D = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, h - 0.1), o);
    (D.position.set(d - 1.3, p + 0.45, 0),
      (D.rotation.z = 0.32),
      e.add(shade(D)),
      [-1, 1].forEach((ut) => box(e, 1.6, 0.55, 0.05, d - 1.35, p + 0.2, ut * (h / 2 - 0.08), o, 0)));
  }
  if (
    (C.sunvisor && box(e, 0.45, 0.05, h - 0.1, d + 0.15, p - 0.32, 0, mat(n.paint, 0.3, 0.5), -0.15),
    C.horns &&
      [-0.3, 0.3].forEach((D, ut) => {
        let bt = cyl(e, 0.06, 0.1, 0.6 + ut * 0.15, d - 1, p + 0.08, D, CHROME(), 12);
        bt.rotation.z = -PI / 2;
      }),
    C.stacks &&
      [-1, 1].forEach((D) => {
        (cyl(e, 0.08, 0.08, 2.6, m - 0.1, y + 1.3, D * (h / 2 - 0.15), CHROME(), 12),
          cyl(e, 0.1, 0.08, 0.2, m - 0.1, y + 2.65, D * (h / 2 - 0.15), CHROME(), 12));
      }),
    C.bullbar)
  ) {
    [-1, 1].forEach((ut) => cyl(e, 0.05, 0.05, 1, d + 0.35, 1.2, ut * (h / 2 - 0.35), CHROME(), 10));
    let D = cyl(e, 0.05, 0.05, h - 0.4, d + 0.35, 1.7, 0, CHROME(), 10);
    D.rotation.x = PI / 2;
  }
  if (C.lightbar) {
    let D = new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff4d6", emissiveIntensity: 2.5 });
    box(e, 0.12, 0.08, h - 0.3, d - 0.1, p + 0.08, 0, l);
    for (let ut = 0; ut < 6; ut++) cyl(e, 0.06, 0.06, 0.05, d - 0.03, p + 0.08, -0.9 + ut * 0.36, D, 12).rotation.z = PI / 2;
  }
  if (C.fog) {
    let D = new THREE.MeshStandardMaterial({ color: "#fff7c2", emissive: "#ffe680", emissiveIntensity: 2.5 });
    [-1, 1].forEach((ut) => (cyl(e, 0.08, 0.08, 0.05, d + 0.24, 0.95, ut * (h / 2 - 0.25), D, 12).rotation.z = PI / 2));
  }
  (C.beacon &&
    [-1, 1].forEach((D, ut) => {
      let bt = new THREE.MeshStandardMaterial({ color: "#ffae00", emissive: "#ff9900", emissiveIntensity: 2, transparent: true, opacity: 0.9 });
      (cyl(e, 0.09, 0.1, 0.16, d - 0.4, p + 0.12, D * (h / 2 - 0.2), bt, 14), a.push({ mat: bt, phase: ut * PI, base: 2.5, fast: false }));
    }),
    [-1, 1].forEach((D) =>
      decal(
        e,
        textTex(`door|${n.company}`, n.company, { w: 512, fg: "#fff", font: "900 56px Arial", stroke: "#111" }),
        1.2,
        0.3,
        d - 0.85,
        y + 0.75,
        D * (h / 2 + 0.012),
        D,
      ),
    ));
  let w = mat(n.rim, 0.25, 0.8);
  ([
    [d - 1.1, 0.32],
    [-1.3, 0.55],
    [-2.6, 0.55],
  ].forEach(([D, ut]) =>
    [-1, 1].forEach((bt) => {
      let yt = wheel(i, D, u, bt * (h / 2 - ut / 2 - 0.02), u, ut, {
        spokes: 10,
        mirror: bt < 0,
        rimM: w,
        caliper: null,
        tire: n.tire,
        letter: n.letter,
        style: "disk",
      });
      ((yt.front = D > 0), t.wheels.push(yt));
    }),
  ),
    C.neon && ((t.neon = glowPlane(n.neonColor, h * 2.4, f * 1.5)), t.root.add(t.neon)));
  let R = new THREE.Group();
  (R.position.set(0, 0, -1.2), t.root.add(R));
  let P = new THREE.Group();
  ((P.rotation.y = -PI / 2), R.add(P));
  let z = 12.4,
    b = 1.35,
    S = 2.5,
    H = [],
    W = new THREE.Group();
  ((W.rotation.y = -PI / 2), R.add(W));
  let V = n.trailer,
    Y = n.trailerColor;
  ([-0.5, 0.5].forEach((D) => box(P, z - 0.4, 0.3, 0.14, -z / 2 + 0.6, b - 0.15, D, l)), cyl(P, 0.06, 0.06, 0.2, 0, b - 0.3, 0, mat("#333", 0.4, 0.6)));
  let G = -z + 0.6,
    ot = new THREE.Group();
  if (
    (P.add(ot),
    [-1, 1].forEach((D) => {
      (box(ot, 0.12, 1, 0.12, -2, b - 0.7, D * 0.9, mat("#555", 0.5, 0.5)), box(ot, 0.3, 0.05, 0.3, -2, b - 1.2, D * 0.9, mat("#333", 0.5)));
    }),
    V === "konteyner" || V === "frigo" || V === "tenteli")
  ) {
    let ut = truckCab(V, Y, n.company),
      bt = new THREE.MeshStandardMaterial({ map: ut, roughness: V === "tenteli" ? 0.9 : 0.5, metalness: V === "tenteli" ? 0 : 0.3 }),
      yt = mat(Y, V === "tenteli" ? 0.9 : 0.5, 0.3),
      Zt = new THREE.Mesh(new THREE.BoxGeometry(z, 2.65, S), [yt, yt, yt, yt, bt, bt]);
    (Zt.position.set(-z / 2 + 0.6, b + 2.65 / 2, 0),
      P.add(shade(Zt)),
      V === "tenteli" && [-1, 1].forEach((ae) => box(P, z, 0.08, 0.02, -z / 2 + 0.6, b + 0.05, ae * (S / 2 + 0.01), mat("#222", 0.5))),
      V === "frigo" && rbox(P, 0.45, 1.6, 2, 0.06, 0.8, b + 1.6, 0, mat("#e8e8ea", 0.5)),
      [-0.6, 0.6].forEach((ae) => box(P, 0.04, 2.65 - 0.1, 0.05, G - 0.01, b + 2.65 / 2, ae, CHROME())));
  } else if (V === "tanker") {
    let D = cyl(P, 1.15, 1.15, z - 1, -z / 2 + 0.6, b + 1.15, 0, paintMat(Y, "krom"), 32);
    ((D.rotation.z = PI / 2),
      [-1, 1].forEach((ut) => {
        let bt = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 12, 0, PI * 2, 0, PI / 2), paintMat(Y, "krom"));
        (bt.scale.set(1, 0.25, 1), (bt.rotation.z = (-ut * PI) / 2), bt.position.set(-z / 2 + 0.6 + (ut * (z - 1)) / 2, b + 1.15, 0), P.add(bt));
      }));
    for (let ut = 0; ut < 4; ut++) cyl(P, 0.2, 0.2, 0.15, -2 - ut * 2.6, b + 2.35, 0, mat("#333", 0.4, 0.6), 14);
    ([-1, 1].forEach((ut) =>
      decal(P, textTex(`tank|${n.company}`, n.company, { w: 1024, fg: "#c8141e", font: "900 100px Arial" }), 6, 0.6, -z / 2 + 0.6, b + 1.2, ut * 1.16, ut),
    ),
      box(P, 0.9, 0.08, 0.04, -z / 2, b + 2.42, 0.9, CHROME()));
  } else if ((rbox(P, z, 0.16, S, 0.04, -z / 2 + 0.6, b + 0.08, 0, mat(Y, 0.5, 0.4)), V === "sal")) {
    for (let D = 0; D < 3; D++) {
      let ut = -2.2 - D * 3.4;
      for (let bt = 0; bt < 3; bt++)
        for (let yt = 0; yt < 4; yt++)
          box(P, 3, 0.22, 0.5, ut, b + 0.28 + bt * 0.24, -0.84 + yt * 0.56, mat(["#c9a26b", "#b8925c", "#d6b07a"][(bt + yt) % 3], 0.85));
      box(P, 0.04, 0.85, S + 0.04, ut, b + 0.55, 0, mat("#e8582a", 0.6));
    }
    [-1, 1].forEach((D) => sideRails(P, D, z, b, S));
  } else
    V === "oto" &&
      ([-1, 1].forEach((D) => {
        for (let ut = 0; ut < 6; ut++) box(P, 0.08, 2, 0.08, -0.6 - ut * 2.2, b + 1, D * (S / 2 - 0.05), mat("#555", 0.5, 0.5));
        box(P, z - 1, 0.1, 0.12, -z / 2 + 0.6, b + 1.95, D * (S / 2 - 0.05), mat("#555", 0.5, 0.5));
      }),
      box(P, 6.5, 0.08, S - 0.2, -7.5, b + 1.9, 0, mat("#444", 0.5, 0.5)),
      [
        [2, -3.4, 0],
        [5, -8.6, 0],
        [8, -7.4, 1.95],
      ].forEach(([D, ut, bt]) => {
        let yt = buildCarModel(D, { ...defaultCarConfig(D), people: 0 });
        ((yt.root.rotation.y = -PI / 2), yt.root.position.set(ut, b + 0.16 + bt, 0), yt.root.scale.setScalar(0.92), P.add(yt.root));
      }));
  return (
    [-1, 1].forEach((D) => rbox(P, 0.06, 0.12, 0.35, 0.02, G - 0.05, b - 0.2, D * (S / 2 - 0.3), r)),
    plate(P, n.plate, G - 0.06, b - 0.25, 0, -PI / 2),
    box(P, 0.08, 0.15, S, G - 0.02, b - 0.45, 0, mat("#c8141e", 0.5)),
    [-9.6, -10.85, -12.1].forEach((D) =>
      [-1, 1].forEach((ut) => {
        let bt = wheel(W, D + 0.6, u, ut * (S / 2 - 0.3), u, 0.55, {
          spokes: 10,
          mirror: ut < 0,
          rimM: w,
          caliper: null,
          tire: n.tire,
          letter: n.letter,
          style: "disk",
        });
        H.push(bt);
      }),
    ),
    [-1, 1].forEach((D) => box(P, 3.6, 0.06, 0.65, -10.25, b - 0.02 + 0.2, D * (S / 2 - 0.3), l)),
    (t.trailer = { pivot: R, group: P, wheels: H, legs: ot, length: z - 0.6, wheelX: 10.85 - 0.6 }),
    t.root.traverse((D) => {
      D.isMesh && !D.material.transparent && ((D.castShadow = true), (D.receiveShadow = true));
    }),
    { ...t, def: { name: "T\u0131r", seats: 2, phys: { vmax: 20, acc: 2.6, grip: 5, steer: 0.42 } }, len: f, wb: d - 1.1 + 1.95, halfW: h / 2, seatPts, seat: seatPts[0], open: true }
  );
}
function sideRails(n, t, e, i, s) {
  for (let r = 0; r < 6; r++) box(n, 0.06, 0.9, 0.06, -0.6 - r * 2.2, i + 0.5, t * (s / 2 - 0.03), mat("#222", 0.5, 0.4));
}


// =============================================================================
// v151 — MOTORLAR (mobilyadaki 4 motorun modeli; sürücü kask + mont)
// =============================================================================
const MOTO_DEF = {
  scooter: { k: 'moto_scooter', name: 'Scooter', seats: 2, phys: { vmax: 22, acc: 6, grip: 9, steer: 0.7 } },
  cross: { k: 'moto_cross', name: 'Cross Motor', seats: 1, phys: { vmax: 33, acc: 10, grip: 9, steer: 0.7 } },
  chopper: { k: 'moto_chopper', name: 'Chopper', seats: 2, phys: { vmax: 36, acc: 8, grip: 8, steer: 0.5 } },
  sport: { k: 'moto_sport', name: 'Spor Motor', seats: 2, phys: { vmax: 48, acc: 13, grip: 11, steer: 0.62 } },
};
const MOTO_FINISH = { parlak: [0.22, 0.55], metalik: [0.15, 0.9], mat: [0.85, 0.1], krom: [0.05, 1], sedef: [0.18, 0.7] };
function buildMotoModel(n) {
  const t = MOTO_DEF[n.moto] || MOTO_DEF.scooter;
  const item = CATALOG_MAP[t.k];
  const [rgh, mtl] = MOTO_FINISH[n.finish] || MOTO_FINISH.parlak;
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const o = new THREE.Group();
  tilt.add(o);
  item.build(o, { tint: { c: n.paint, r: rgh, m: mtl }, ti: 0, live: true });
  const wheels = [];
  o.children[0].children.forEach((g) => {
    if (g.isGroup && g.children[0]?.geometry?.type === 'TorusGeometry') wheels.push({ spin: g, pivot: g, r: g.position.y, front: g.position.x > 0, moto: true });
  });
  const f = item.seats[0];
  // sürücü kaskı / montu: oyuncunun avatarı oturur (motor modelinde manken yok)
  const back = -Math.max(...item.box) - 0.05;
  plate(o, n.plate, 0, 0.55, back + 0.1, PI).scale.set(0.45, 0.8, 1);
  let neon = null;
  if (n.acc?.neon) {
    const g = canvasTex('glow', 128, 128, (x, w) => {
      const v = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      v.addColorStop(0, 'rgba(255,255,255,1)');
      v.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      v.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = v;
      x.fillRect(0, 0, w, w);
    });
    neon = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshBasicMaterial({ map: g, color: n.neonColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    neon.rotation.x = -PI / 2;
    neon.position.y = 0.02;
    root.add(neon);
  }
  root.traverse((g) => {
    if (g.isMesh && !g.material.transparent) {
      g.castShadow = true;
      g.receiveShadow = true;
    }
  });
  const len = item.box[1] * 2;
  const tlMat = new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#ff1010', emissiveIntensity: 1.2 });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), tlMat);
  tl.position.set(0, 0.72, back + 0.12);
  o.add(tl);
  // koltuk çerçevesi: arabalarla aynı düzen ([ileri, y, yan] — gövde -90° dönük)
  const seatFrame = new THREE.Group();
  seatFrame.rotation.y = -PI / 2;
  o.add(seatFrame);
  const seatPts = [
    [f[2], f[1] - 0.06, 0],
    [f[2] - 0.45, f[1] - 0.01, 0],
  ].slice(0, t.seats);
  return { root, tilt, body: seatFrame, wheels, flashers: [], tlMat, def: { name: t.name, seats: t.seats, phys: t.phys }, len, wb: len * 0.62, halfW: 0.45, neon, moto: true, seatPts, seat: seatPts[0], open: true, rider: { helmet: n.helmet, visor: n.helmetVisor, jacket: n.jacket } };
}

// =============================================================================
// v151 — KATALOG NO → ÇİZİM AYARI (kayıtlı modifiyeyle)
//   1-10 araba · 11 tır · 12 otobüs · 13 taksi · 14 polis · 15 ambulans · 21-24 motor
// =============================================================================
const WHEEL_KEYS = ['rimStyle', 'spokes', 'rim', 'tire', 'caliper', 'letter', 'deep', 'wheelScale', 'ride'];
const pickKeys = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
export function vehicleConfig(id, mods = null) {
  const n = Number(id);
  const prof = modProfile(n);
  const m = sanitizeMods(n, mods);
  if (prof === 'taxi') {
    const tt = TAXI_TYPES[m.taxiType] || TAXI_TYPES.sari;
    const base = defaultCarConfig(5);
    return { ...base, ...pickKeys(m, [...WHEEL_KEYS, 'finish', 'tint', 'interior', 'exhaust', 'neonColor', 'plate']), kind: 'taxi', id: 5, livery: 'taksi', taxiType: m.taxiType, paint: tt.paint, taxiSign: tt.sign, taxiText: tt.text, acc: { ...base.acc, ...m.acc }, people: 0 };
  }
  if (prof === 'police') {
    const bid = m.polType === 'pickup' ? 3 : 5;
    const base = defaultCarConfig(bid);
    return { ...base, ...pickKeys(m, [...WHEEL_KEYS, 'plate']), kind: 'police', id: bid, polType: m.polType, livery: m.polType === 'sivil' ? 'sivilpolis' : 'polis', paint: m.polType === 'sivil' ? '#1b1d22' : '#16307a', finish: 'parlak', acc: { ...base.acc, ...m.acc }, people: 0 };
  }
  if (prof === 'ambulance') {
    if (m.ambType === 'car') return { ...defaultCarConfig(2), kind: 'ambulance', id: 2, ambType: 'car', livery: 'ambulans', paint: '#f4f4f2', finish: 'parlak', rim: m.rim, tire: m.tire, plate: m.plate, people: 0 };
    return { ...defaultBusConfig('ambulans'), kind: 'ambulance', ambType: 'van', rim: m.rim, tire: m.tire, plate: m.plate, people: 0 };
  }
  if (prof === 'bus') {
    const base = defaultBusConfig(m.variant);
    return { ...base, ...m, kind: 'bus', acc: { ...base.acc, ...m.acc }, siren: false, people: 0 };
  }
  if (prof === 'truck') {
    const base = defaultTruckConfig();
    return { ...base, ...m, kind: 'truck', acc: { ...base.acc, ...m.acc }, attached: true, people: 0 };
  }
  if (prof === 'moto') return { ...m, kind: 'moto', moto: MOTO_KEY[n] || 'scooter', people: 0 };
  const cid = VEHICLE_BY_ID[n] ? n : 1;
  return applyVehicleMods(cid, mods, defaultCarConfig(cid));
}
export function buildFromConfig(cfg) {
  if (cfg.kind === 'moto') return buildMotoModel(cfg);
  if (cfg.kind === 'truck') return buildTruckModel(cfg);
  if (cfg.kind === 'bus' || (cfg.kind === 'ambulance' && cfg.ambType !== 'car')) return buildBusModel(cfg.kind === 'ambulance' ? { ...cfg, variant: 'ambulans' } : cfg);
  return buildCarModel(cfg.id, cfg);
}

export { VEHICLES, SEATS, VEHICLE_BY_ID, defaultCarConfig, buildCarModel, seatedPerson };
// v151: şehirde çağrılabilen her araç (araba + ticari + motor)
export const hasVehicle = (id) => Boolean(VEHICLE_BY_ID[Number(id)]) || modProfile(id) !== 'car';
// Şehir motoru / kareler / stüdyo: katalog no + kayıtlı modifiye → model
export function buildVehicle(id, mods = null) {
  const n = Number(id);
  const v = buildFromConfig(vehicleConfig(n, mods));
  v.catalogId = n;
  v.kind = modProfile(n);
  if (VEHICLE_CATALOG[n]) v.def = { ...v.def, name: VEHICLE_CATALOG[n].name };
  return v;
}
