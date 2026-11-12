// =============================================================================
// HAYVANLAR — düşük poligonlu, yürüyen / kaçan hayvanlar (prototip; oyuna aynen taşınabilir)
// Türkiye'de yaşayan türler: karaca, kızıl tilki, yaban domuzu, yabani tavşan, kızıl sincap;
// köyde inek, koyun, tavuk, horoz, çoban köpeği; şehirde sokak kedileri ve köpekleri.
// =============================================================================
import * as THREE from 'three';

const PI = Math.PI;
const matCache = new Map();
const M = (c, r = 0.85) => {
  const k = `${c}|${r}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r }));
  return matCache.get(k);
};
const geoCache = new Map();
const BOX = (w, h, d) => {
  const k = `b${w}|${h}|${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
};
const SPH = (r) => {
  const k = `s${r}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.IcosahedronGeometry(r, 1));
  return geoCache.get(k);
};
const CONE = (r, h) => {
  const k = `c${r}|${h}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.ConeGeometry(r, h, 5));
  return geoCache.get(k);
};
function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  parent.add(o);
  return o;
}
// bacak: üstünden döner (pivot)
function leg(parent, x, y, z, w, h, mat) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  part(p, BOX(w, h, w), mat, 0, -h / 2, 0);
  return p;
}

// --- türler: { build(variant) → { g, legs, head, tail }, hız, davranış } -------------------------
// yerel eksen: +x ileri (burun), y yukarı
const KINDS = {
  kedi: {
    speed: 1.1, run: 3.6, flee: 3.2, wander: 6, idle: [2, 9], scale: 1,
    build(v) {
      const cols = [['#e08a3a', '#f4d6b0'], ['#1c1c1e', '#1c1c1e'], ['#9a9ea4', '#e8e8e8'], ['#f2efe8', '#f2efe8'], ['#6b4a2e', '#d9c4a8']][v % 5];
      const g = new THREE.Group();
      const b = M(cols[0]);
      const w = M(cols[1]);
      part(g, BOX(0.42, 0.18, 0.16), b, 0, 0.27, 0);
      part(g, BOX(0.16, 0.12, 0.17), w, 0.12, 0.2, 0);
      const head = new THREE.Group();
      head.position.set(0.25, 0.36, 0);
      g.add(head);
      part(head, BOX(0.15, 0.13, 0.15), b, 0.04, 0, 0);
      part(head, CONE(0.035, 0.07), b, 0.02, 0.09, 0.045);
      part(head, CONE(0.035, 0.07), b, 0.02, 0.09, -0.045);
      part(head, BOX(0.02, 0.025, 0.1), M('#3a8a3a', 0.3), 0.12, 0.02, 0);
      const tail = new THREE.Group();
      tail.position.set(-0.21, 0.32, 0);
      g.add(tail);
      part(tail, BOX(0.04, 0.26, 0.04), b, -0.02, 0.12, 0, 0, 0, 0.35);
      const legs = [[0.15, 0.06], [0.15, -0.06], [-0.15, 0.06], [-0.15, -0.06]].map(([x, z]) => leg(g, x, 0.2, z, 0.045, 0.2, b));
      return { g, legs, head, tail };
    },
  },
  kopek: {
    speed: 1.3, run: 4.2, flee: 0, wander: 9, idle: [3, 12], scale: 1,
    build(v) {
      // sokak köpeği: kangal kırması (krem gövde, koyu maske), siyah, kahve
      const cols = [['#d9c39a', '#2a2420'], ['#2a2726', '#2a2726'], ['#8a5a32', '#4a3020'], ['#e8e2d6', '#c9a87a']][v % 4];
      const g = new THREE.Group();
      const b = M(cols[0]);
      const d = M(cols[1]);
      part(g, BOX(0.8, 0.32, 0.3), b, 0, 0.6, 0);
      const head = new THREE.Group();
      head.position.set(0.46, 0.78, 0);
      g.add(head);
      part(head, BOX(0.26, 0.24, 0.24), b, 0.04, 0, 0);
      part(head, BOX(0.16, 0.13, 0.15), d, 0.22, -0.05, 0);
      part(head, BOX(0.06, 0.12, 0.05), d, -0.02, 0.06, 0.13, 0.3);
      part(head, BOX(0.06, 0.12, 0.05), d, -0.02, 0.06, -0.13, -0.3);
      if (v % 4 !== 1) part(head, BOX(0.03, 0.05, 0.03), M('#ffcc00', 0.5), -0.02, 0.0, 0.15); // belediye küpesi
      const tail = new THREE.Group();
      tail.position.set(-0.4, 0.68, 0);
      g.add(tail);
      part(tail, BOX(0.06, 0.32, 0.06), b, -0.06, 0.12, 0, 0, 0, 0.6);
      const legs = [[0.28, 0.1], [0.28, -0.1], [-0.28, 0.1], [-0.28, -0.1]].map(([x, z]) => leg(g, x, 0.46, z, 0.09, 0.46, b));
      return { g, legs, head, tail };
    },
  },
  tavuk: {
    speed: 0.7, run: 2.6, flee: 2.2, wander: 4, idle: [1, 4], scale: 1, peck: true,
    build(v) {
      const g = new THREE.Group();
      const horoz = v % 5 === 0;
      const b = M(horoz ? '#b8562a' : v % 2 ? '#f4f0e6' : '#a8723e');
      part(g, SPH(0.15), b, 0, 0.27, 0).scale.set(1.2, 1, 0.9);
      const head = new THREE.Group();
      head.position.set(0.14, 0.42, 0);
      g.add(head);
      part(head, SPH(0.07), b, 0, 0, 0);
      part(head, BOX(0.07, horoz ? 0.08 : 0.04, 0.02), M('#d0202a', 0.5), 0.0, 0.07, 0);
      part(head, CONE(0.02, 0.05), M('#e8a020', 0.5), 0.07, 0, 0, 0, 0, -PI / 2);
      const tail = new THREE.Group();
      tail.position.set(-0.16, 0.32, 0);
      g.add(tail);
      part(tail, BOX(0.06, horoz ? 0.24 : 0.12, 0.08), horoz ? M('#1f3f2a', 0.5) : b, -0.02, 0.06, 0, 0, 0, 0.5);
      const lm = M('#e8a020', 0.6);
      const legs = [[0.02, 0.05], [0.02, -0.05]].map(([x, z]) => leg(g, x, 0.17, z, 0.025, 0.17, lm));
      return { g, legs, head, tail };
    },
  },
  inek: {
    speed: 0.45, run: 1.4, flee: 0, wander: 7, idle: [6, 18], scale: 1, peck: true,
    build(v) {
      const g = new THREE.Group();
      const spotted = v % 3 !== 1;
      const b = M(spotted ? '#f2f0ea' : '#7a4a2a');
      const dk = M('#1d1d1d');
      part(g, BOX(1.7, 0.85, 0.75), b, 0, 1.05, 0);
      if (spotted) {
        part(g, BOX(0.6, 0.5, 0.77), dk, -0.3, 1.15, 0);
        part(g, BOX(0.4, 0.4, 0.77), dk, 0.45, 0.95, 0);
      }
      const head = new THREE.Group();
      head.position.set(0.95, 1.3, 0);
      g.add(head);
      part(head, BOX(0.5, 0.45, 0.42), spotted ? dk : b, 0.05, -0.05, 0);
      part(head, BOX(0.22, 0.22, 0.36), M('#e8b0a0', 0.7), 0.33, -0.18, 0);
      part(head, CONE(0.05, 0.2), M('#e8e2d0', 0.6), 0.05, 0.25, 0.16);
      part(head, CONE(0.05, 0.2), M('#e8e2d0', 0.6), 0.05, 0.25, -0.16);
      const tail = new THREE.Group();
      tail.position.set(-0.85, 1.35, 0);
      g.add(tail);
      part(tail, BOX(0.05, 0.6, 0.05), b, 0, -0.3, 0);
      const legs = [[-0.62, -0.25], [-0.62, 0.25], [0.62, -0.25], [0.62, 0.25]].map(([x, z]) => leg(g, x, 0.65, z, 0.16, 0.65, b));
      return { g, legs, head, tail };
    },
  },
  koyun: {
    speed: 0.5, run: 2.2, flee: 2.5, wander: 6, idle: [3, 10], scale: 1, peck: true,
    build() {
      const g = new THREE.Group();
      const wool = M('#f4f1e6', 0.95);
      const dk = M('#2a2420');
      part(g, SPH(0.5), wool, 0, 0.72, 0).scale.set(1.3, 0.85, 0.9);
      const head = new THREE.Group();
      head.position.set(0.66, 0.85, 0);
      g.add(head);
      part(head, BOX(0.3, 0.3, 0.24), dk, 0, 0, 0);
      const legs = [[-0.3, -0.18], [-0.3, 0.18], [0.3, -0.18], [0.3, 0.18]].map(([x, z]) => leg(g, x, 0.45, z, 0.09, 0.45, dk));
      return { g, legs, head, tail: null };
    },
  },
  keci: {
    speed: 0.6, run: 3, flee: 2.5, wander: 7, idle: [2, 8], scale: 1, peck: true,
    build(v) {
      const g = new THREE.Group();
      const b = M(['#2a2420', '#8a6a48', '#f2ede2', '#4a3a2a'][v % 4]);
      const hm = M('#5a5040', 0.6);
      part(g, BOX(0.8, 0.38, 0.32), b, 0, 0.7, 0);
      const head = new THREE.Group();
      head.position.set(0.46, 0.92, 0);
      g.add(head);
      part(head, BOX(0.26, 0.2, 0.18), b, 0.05, 0, 0);
      part(head, BOX(0.06, 0.14, 0.06), b, 0.14, -0.15, 0); // sakal
      for (const s of [-1, 1]) {
        part(head, BOX(0.04, 0.22, 0.04), hm, -0.04, 0.16, s * 0.06, s * 0.15, 0, 0.5);
        part(head, BOX(0.12, 0.04, 0.06), b, -0.02, 0.03, s * 0.12, s * 0.4);
      }
      const tail = new THREE.Group();
      tail.position.set(-0.4, 0.86, 0);
      g.add(tail);
      part(tail, BOX(0.05, 0.12, 0.05), b, 0, 0.05, 0, 0, 0, 0.5);
      const legs = [[-0.28, -0.1], [-0.28, 0.1], [0.28, -0.1], [0.28, 0.1]].map(([x, z]) => leg(g, x, 0.52, z, 0.06, 0.52, b));
      return { g, legs, head, tail };
    },
  },
  ayi: {
    speed: 0.7, run: 3.5, flee: 7, wander: 22, idle: [4, 14], scale: 1, peck: true,
    build() {
      const g = new THREE.Group();
      const b = M('#4a3220', 0.95);
      part(g, BOX(1.4, 0.8, 0.75), b, 0, 0.95, 0);
      part(g, BOX(0.5, 0.35, 0.7), b, 0.35, 1.35, 0); // omuz kamburu
      const head = new THREE.Group();
      head.position.set(0.85, 1.05, 0);
      g.add(head);
      part(head, BOX(0.42, 0.38, 0.42), b, 0.02, 0, 0);
      part(head, BOX(0.2, 0.16, 0.2), M('#6b4a30'), 0.28, -0.06, 0);
      part(head, BOX(0.06, 0.06, 0.06), M('#111', 0.4), 0.39, -0.02, 0);
      for (const s of [-1, 1]) part(head, BOX(0.1, 0.1, 0.06), b, -0.08, 0.24, s * 0.15);
      const legs = [[-0.48, -0.24], [-0.48, 0.24], [0.48, -0.24], [0.48, 0.24]].map(([x, z]) => leg(g, x, 0.62, z, 0.22, 0.62, b));
      return { g, legs, head, tail: null };
    },
  },
  kurt: {
    speed: 1.1, run: 6.5, flee: 12, wander: 26, idle: [2, 8], scale: 1,
    build(v) {
      const g = new THREE.Group();
      const b = M(v % 2 ? '#7a746a' : '#8a7f70');
      const lt = M('#c9c2b4');
      part(g, BOX(0.95, 0.34, 0.3), b, 0, 0.72, 0);
      part(g, BOX(0.3, 0.2, 0.28), lt, 0.3, 0.6, 0);
      const head = new THREE.Group();
      head.position.set(0.55, 0.86, 0);
      g.add(head);
      part(head, BOX(0.26, 0.24, 0.24), b, 0, 0, 0);
      part(head, BOX(0.2, 0.12, 0.13), lt, 0.2, -0.05, 0);
      part(head, CONE(0.05, 0.14), b, -0.04, 0.17, 0.08);
      part(head, CONE(0.05, 0.14), b, -0.04, 0.17, -0.08);
      const tail = new THREE.Group();
      tail.position.set(-0.48, 0.74, 0);
      g.add(tail);
      part(tail, BOX(0.4, 0.11, 0.11), b, -0.18, -0.1, 0, 0, 0, 0.5);
      const legs = [[-0.32, -0.1], [-0.32, 0.1], [0.32, -0.1], [0.32, 0.1]].map(([x, z]) => leg(g, x, 0.56, z, 0.07, 0.56, b));
      return { g, legs, head, tail };
    },
  },
  kartal: {
    speed: 9, run: 9, flee: 0, wander: 0, idle: [1, 1], scale: 1, fly: true,
    build() {
      const g = new THREE.Group();
      const b = M('#4a3626');
      part(g, BOX(0.8, 0.2, 0.24), b, 0, 0, 0);
      part(g, BOX(0.22, 0.2, 0.2), M('#e8e2d0'), 0.48, 0.03, 0);
      part(g, CONE(0.05, 0.12), M('#e8b020', 0.5), 0.62, 0.0, 0, 0, 0, -PI / 2);
      const wings = [-1, 1].map((s) => {
        const w = new THREE.Group();
        w.position.set(0.05, 0.05, s * 0.12);
        g.add(w);
        part(w, BOX(0.5, 0.04, 1.1), b, 0, 0, s * 0.55);
        part(w, BOX(0.3, 0.035, 0.4), M('#2a1d14'), -0.05, 0, s * 1.2);
        return w;
      });
      part(g, BOX(0.3, 0.04, 0.32), b, -0.5, 0, 0);
      return { g, legs: [], head: null, tail: null, wings };
    },
  },
  karaca: {
    speed: 0.9, run: 7.5, flee: 14, wander: 18, idle: [3, 10], scale: 1, peck: true,
    build(v) {
      const g = new THREE.Group();
      const b = M('#8a5a32');
      part(g, BOX(1.0, 0.42, 0.34), b, 0, 0.95, 0);
      part(g, BOX(0.14, 0.3, 0.3), M('#f2ead8'), -0.5, 0.97, 0);
      const head = new THREE.Group();
      head.position.set(0.55, 1.2, 0);
      g.add(head);
      part(head, BOX(0.12, 0.42, 0.14), b, -0.04, 0.05, 0, 0, 0, -0.35);
      part(head, BOX(0.26, 0.16, 0.16), b, 0.1, 0.25, 0);
      part(head, BOX(0.06, 0.06, 0.08), M('#1d1d1d', 0.4), 0.24, 0.22, 0);
      part(head, BOX(0.05, 0.16, 0.06), b, 0.0, 0.38, 0.09, 0.3);
      part(head, BOX(0.05, 0.16, 0.06), b, 0.0, 0.38, -0.09, -0.3);
      if (v % 2 === 0) {
        const am = M('#5a4630', 0.7);
        for (const s of [-1, 1]) {
          part(head, BOX(0.03, 0.26, 0.03), am, 0.06, 0.48, s * 0.06, s * 0.2);
          part(head, BOX(0.03, 0.1, 0.03), am, 0.12, 0.52, s * 0.08, s * 0.2, 0, -0.7);
        }
      }
      const legs = [[-0.38, -0.12], [-0.38, 0.12], [0.38, -0.12], [0.38, 0.12]].map(([x, z]) => leg(g, x, 0.78, z, 0.06, 0.78, b));
      return { g, legs, head, tail: null };
    },
  },
  tilki: {
    speed: 1.0, run: 6, flee: 11, wander: 16, idle: [2, 8], scale: 1,
    build() {
      const g = new THREE.Group();
      const b = M('#d0602a');
      const w = M('#f4ece0');
      const dk = M('#2a1d16');
      part(g, BOX(0.62, 0.22, 0.2), b, 0, 0.38, 0);
      part(g, BOX(0.24, 0.12, 0.18), w, 0.22, 0.3, 0);
      const head = new THREE.Group();
      head.position.set(0.36, 0.5, 0);
      g.add(head);
      part(head, BOX(0.18, 0.16, 0.18), b, 0, 0, 0);
      part(head, BOX(0.14, 0.08, 0.09), w, 0.14, -0.04, 0);
      part(head, CONE(0.05, 0.12), dk, -0.02, 0.13, 0.06);
      part(head, CONE(0.05, 0.12), dk, -0.02, 0.13, -0.06);
      const tail = new THREE.Group();
      tail.position.set(-0.32, 0.4, 0);
      g.add(tail);
      part(tail, BOX(0.42, 0.13, 0.13), b, -0.2, -0.02, 0, 0, 0, 0.25);
      part(tail, BOX(0.1, 0.12, 0.12), w, -0.42, -0.07, 0, 0, 0, 0.25);
      const legs = [[-0.2, -0.07], [-0.2, 0.07], [0.2, -0.07], [0.2, 0.07]].map(([x, z]) => leg(g, x, 0.3, z, 0.05, 0.3, dk));
      return { g, legs, head, tail };
    },
  },
  domuz: {
    speed: 0.7, run: 4.5, flee: 5, wander: 12, idle: [3, 12], scale: 1, peck: true,
    build() {
      const g = new THREE.Group();
      const b = M('#3d3128', 0.95);
      part(g, BOX(1.05, 0.5, 0.42), b, 0, 0.62, 0);
      part(g, BOX(0.5, 0.18, 0.3), b, 0.2, 0.92, 0);
      const head = new THREE.Group();
      head.position.set(0.58, 0.62, 0);
      g.add(head);
      part(head, BOX(0.36, 0.3, 0.3), b, 0.05, 0, 0);
      part(head, BOX(0.1, 0.13, 0.15), M('#5a4a40'), 0.26, -0.06, 0);
      for (const s of [-1, 1]) part(head, CONE(0.02, 0.12), M('#efe6d4', 0.4), 0.24, -0.02, s * 0.09, 0, 0, -0.6);
      const legs = [[-0.36, -0.13], [-0.36, 0.13], [0.36, -0.13], [0.36, 0.13]].map(([x, z]) => leg(g, x, 0.42, z, 0.09, 0.42, b));
      return { g, legs, head, tail: null };
    },
  },
  tavsan: {
    speed: 0.6, run: 6, flee: 8, wander: 10, idle: [1, 5], scale: 1, hop: true, peck: true,
    build(v) {
      const g = new THREE.Group();
      const b = M(v % 2 ? '#8a7356' : '#a08a6a');
      part(g, SPH(0.15), b, 0, 0.18, 0).scale.set(1.3, 1, 1);
      const head = new THREE.Group();
      head.position.set(0.17, 0.27, 0);
      g.add(head);
      part(head, SPH(0.09), b, 0, 0, 0);
      part(head, BOX(0.04, 0.2, 0.05), b, -0.02, 0.15, 0.04, 0.15);
      part(head, BOX(0.04, 0.2, 0.05), b, -0.02, 0.15, -0.04, -0.15);
      part(g, SPH(0.05), M('#f4f0e6'), -0.2, 0.2, 0);
      return { g, legs: [], head, tail: null };
    },
  },
  sincap: {
    speed: 0.8, run: 5, flee: 6, wander: 8, idle: [1, 4], scale: 1, hop: true,
    build() {
      const g = new THREE.Group();
      const b = M('#a8482a');
      part(g, BOX(0.18, 0.1, 0.09), b, 0, 0.1, 0);
      const head = new THREE.Group();
      head.position.set(0.11, 0.15, 0);
      g.add(head);
      part(head, BOX(0.08, 0.08, 0.08), b, 0, 0, 0);
      part(head, CONE(0.02, 0.05), b, -0.01, 0.06, 0.025);
      part(head, CONE(0.02, 0.05), b, -0.01, 0.06, -0.025);
      const tail = new THREE.Group();
      tail.position.set(-0.09, 0.12, 0);
      g.add(tail);
      part(tail, BOX(0.08, 0.24, 0.1), b, -0.05, 0.1, 0, 0, 0, 0.3);
      return { g, legs: [], head, tail };
    },
  },
  ordek: {
    speed: 0.35, run: 1.2, flee: 3, wander: 6, idle: [1, 6], scale: 1, swim: true,
    build(v) {
      const g = new THREE.Group();
      const b = M(v % 2 ? '#8a6a48' : '#d8d2c4');
      part(g, SPH(0.13), b, 0, 0.06, 0).scale.set(1.4, 0.8, 1);
      const head = new THREE.Group();
      head.position.set(0.14, 0.18, 0);
      g.add(head);
      part(head, SPH(0.065), v % 2 ? b : M('#2f6b3a', 0.4), 0, 0, 0);
      part(head, BOX(0.08, 0.025, 0.05), M('#e8a020', 0.5), 0.07, -0.01, 0);
      return { g, legs: [], head, tail: null };
    },
  },
};

// --- sürü yöneticisi -------------------------------------------------------------------------
// region: { pick(rnd) → {x,z}, free(x,z) → bool, y(x,z) → yükseklik }
export class Animals {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.seed = 12345;
  }
  rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  add(kind, x, z, region, variant = 0, opts = {}) {
    const K = KINDS[kind];
    const b = K.build(variant);
    b.g.traverse((o) => o.isMesh && (o.castShadow = true));
    const root = new THREE.Group();
    root.add(b.g);
    if (opts.scale) b.g.scale.setScalar(opts.scale);
    this.scene.add(root);
    const a = { kind, K, ...b, root, x, z, yaw: this.rnd() * PI * 2, region, state: 'idle', t: this.rnd() * 4, tx: x, tz: z, ph: this.rnd() * 10, home: { x, z }, homeR: opts.homeR || K.wander * 2.2, sp: 0 };
    a.y = region.y(x, z);
    root.position.set(x, a.y, z);
    this.list.push(a);
    return a;
  }
  update(dt, player, cam) {
    for (const a of this.list) {
      const dc = (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2;
      const vis = dc < (a.K.fly ? 600 * 600 : 140 * 140);
      a.root.visible = vis;
      if (!vis) continue;
      const K = a.K;
      if (K.fly) {
        // daire çizerek süzülen kartal
        a.ph += dt;
        const R = a.homeR;
        const ang = a.ph * (K.speed / R) + a.t;
        a.x = a.home.x + Math.cos(ang) * R;
        a.z = a.home.z + Math.sin(ang) * R;
        a.yaw = ang + PI / 2;
        const y = a.region.y(a.x, a.z) + 48 + Math.sin(a.ph * 0.3) * 6;
        a.root.position.set(a.x, y, a.z);
        a.root.rotation.set(Math.sin(a.ph * 0.5) * 0.15, -a.yaw, -0.25);
        const flap = Math.sin(a.ph * 0.7) > 0.6 ? Math.sin(a.ph * 9) * 0.5 : 0.05;
        a.wings.forEach((w, i) => (w.rotation.x = (i ? -1 : 1) * flap));
        continue;
      }
      const dp = player ? Math.hypot(a.x - player.x, a.z - player.z) : 99;
      a.t -= dt;
      // kaçma
      if (K.flee && dp < K.flee && a.state !== 'flee') {
        a.state = 'flee';
        const ang = Math.atan2(a.z - player.z, a.x - player.x) + (this.rnd() - 0.5) * 0.8;
        const d = K.flee * 1.8;
        a.tx = a.x + Math.cos(ang) * d;
        a.tz = a.z + Math.sin(ang) * d;
        a.t = 4;
      }
      if (a.state === 'idle' && a.t <= 0) {
        // yeni hedef (yuvanın çevresinde)
        for (let k = 0; k < 6; k++) {
          const ang = this.rnd() * PI * 2;
          const r = (0.3 + this.rnd() * 0.7) * K.wander;
          let tx = a.x + Math.cos(ang) * r;
          let tz = a.z + Math.sin(ang) * r;
          if (Math.hypot(tx - a.home.x, tz - a.home.z) > a.homeR) {
            tx = a.home.x + (this.rnd() - 0.5) * a.homeR;
            tz = a.home.z + (this.rnd() - 0.5) * a.homeR;
          }
          if (a.region.free(tx, tz)) {
            a.tx = tx;
            a.tz = tz;
            a.state = 'walk';
            a.t = 20;
            break;
          }
        }
        if (a.state === 'idle') a.t = 1;
      }
      let speed = 0;
      if (a.state === 'walk' || a.state === 'flee') {
        const dx = a.tx - a.x;
        const dz = a.tz - a.z;
        const d = Math.hypot(dx, dz);
        const want = a.state === 'flee' ? K.run : K.speed;
        if (d < 0.3 || a.t <= 0) {
          a.state = 'idle';
          a.t = K.idle[0] + this.rnd() * (K.idle[1] - K.idle[0]);
        } else {
          const ty = Math.atan2(dz, dx);
          let dy = ty - a.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          a.yaw += dy * Math.min(1, dt * (a.state === 'flee' ? 8 : 3));
          speed = want * Math.max(0.2, Math.cos(dy));
          const nx = a.x + Math.cos(a.yaw) * speed * dt;
          const nz = a.z + Math.sin(a.yaw) * speed * dt;
          if (a.region.free(nx, nz)) {
            a.x = nx;
            a.z = nz;
          } else {
            a.state = 'idle';
            a.t = 0.5;
          }
        }
      }
      a.sp += (speed - a.sp) * Math.min(1, dt * 6);
      // yükseklik + animasyon
      const gy = a.region.y(a.x, a.z);
      a.y += (gy - a.y) * Math.min(1, dt * 10);
      a.ph += dt * (2 + a.sp * 4.5);
      const sw = Math.min(1, a.sp / Math.max(0.3, K.speed)) * 0.55;
      a.legs.forEach((l, i) => (l.rotation.z = Math.sin(a.ph + (i % 2 === (i < 2 ? 0 : 1) ? 0 : PI)) * sw));
      let hop = 0;
      if (K.hop && a.sp > 0.1) hop = Math.abs(Math.sin(a.ph * 0.8)) * 0.18 * Math.min(1, a.sp);
      if (K.swim) hop = Math.sin(a.ph * 0.4) * 0.02;
      if (a.head) {
        // otlama / gagalama: dururken başı eğ
        const graze = K.peck && a.state === 'idle' ? (Math.sin(a.ph * 0.35) > 0.2 ? 0.6 : 0) : 0;
        a.head.rotation.z += (-graze - a.head.rotation.z) * Math.min(1, dt * 4);
      }
      if (a.tail) a.tail.rotation.x = Math.sin(a.ph * 1.7) * 0.4;
      a.root.position.set(a.x, a.y + hop, a.z);
      a.root.rotation.y = -a.yaw; // +x ileri → dünya açısı
    }
  }
}
