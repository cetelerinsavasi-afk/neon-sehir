// =============================================================================
// YENİ MOBİLYALAR (katalogda karşılığı olmayanlar) — oyunun eşya kataloğuna
// (CATALOG_MAP) aynı biçimde eklenir: { k, name, cat, icon, build(g), box:[yarıGen, yarıDer] }
// Ölçüler metre; zemin y=0; eşyanın önü +z.
// =============================================================================
import * as THREE from 'three';
import { CATALOG_MAP, DOOR_BUILDERS } from '../../HouseScreen/houseCatalog.js';

const mc = new Map();
const M = (color, rough = 0.55, metal = 0.05, extra = {}) => {
  const k = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`;
  if (!mc.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    m.userData.shared = true;
    mc.set(k, m);
  }
  return mc.get(k);
};
// B: yAlt tabanlı kutu
const B = (g, w, h, d, x, y, z, m) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true;
  o.receiveShadow = true;
  g.add(o);
  return o;
};
const C = (g, rt, rb, h, x, y, z, m, seg = 12, rx = 0, rz = 0) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  o.rotation.set(rx, 0, rz);
  o.castShadow = true;
  g.add(o);
  return o;
};

const ITEMS = [
  // oyundaki evin ahşap giriş kapısı (DOOR_BUILDERS.ahsap) eşya olarak: yaklaşınca açılır
  { k: 'door_ahsap', name: 'Ahşap Giriş Kapısı', cat: 'kapi', icon: '🚪', wall: true, nobox: true, build: (g, ctx) => DOOR_BUILDERS.ahsap(g, ctx) },
  {
    k: 'hastaneyatak', name: 'Hastane Yatağı', cat: 'hastane', icon: '🛏️', box: [0.52, 1.05],
    build(g) {
      const steel = M('#d9dde2', 0.35, 0.6);
      const sheet = M('#bfe0f2', 0.8);
      [-0.42, 0.42].forEach((x) => [-0.9, 0.9].forEach((z) => {
        C(g, 0.03, 0.03, 0.42, x, 0.21, z, steel, 8);
        C(g, 0.06, 0.06, 0.05, x, 0.04, z, M('#2a2d33', 0.6), 10, 0, Math.PI / 2);
      }));
      B(g, 0.94, 0.08, 1.95, 0, 0.4, 0, steel);
      B(g, 0.9, 0.16, 1.9, 0, 0.48, 0, M('#f4f6f8', 0.85));
      B(g, 0.92, 0.04, 1.3, 0, 0.64, 0.25, sheet);
      B(g, 0.6, 0.12, 0.38, 0, 0.64, -0.68, M('#ffffff', 0.9));
      B(g, 1.0, 0.75, 0.06, 0, 0.42, -1.0, steel); // baş tahtası
      B(g, 1.0, 0.45, 0.06, 0, 0.42, 1.0, steel);
      [-0.5, 0.5].forEach((x) => B(g, 0.03, 0.18, 0.9, x, 0.62, -0.2, steel));
    },
  },
  {
    k: 'perdebolme', name: 'Hastane Perdesi', cat: 'hastane', icon: '🩺', box: [1.0, 0.04],
    build(g) {
      const steel = M('#c9cdd3', 0.35, 0.6);
      B(g, 2.1, 0.04, 0.04, 0, 2.3, 0, steel);
      [-1.05, 1.05].forEach((x) => C(g, 0.02, 0.02, 2.32, x, 1.16, 0, steel, 6));
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.85, 20, 1), M('#8fcfd8', 0.9, 0, { side: THREE.DoubleSide }));
      const p = cur.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 14) * 0.04);
      cur.geometry.computeVertexNormals();
      cur.position.set(0, 1.3, 0);
      cur.castShadow = true;
      g.add(cur);
    },
  },
  {
    k: 'serum', name: 'Serum Askısı', cat: 'hastane', icon: '💧', box: [0.14, 0.14],
    build(g) {
      const steel = M('#d9dde2', 0.35, 0.6);
      [0, 1, 2, 3, 4].forEach((i) => {
        const a = (i / 5) * Math.PI * 2;
        B(g, 0.03, 0.03, 0.26, Math.sin(a) * 0.12, 0.02, Math.cos(a) * 0.12, steel).rotation.y = a;
      });
      C(g, 0.015, 0.015, 1.9, 0, 0.95, 0, steel, 6);
      B(g, 0.3, 0.02, 0.02, 0, 1.86, 0, steel);
      const bag = B(g, 0.14, 0.24, 0.05, 0.12, 1.55, 0, M('#e9f6ff', 0.2, 0, { transparent: true, opacity: 0.75 }));
      bag.castShadow = false;
      C(g, 0.004, 0.004, 0.7, 0.12, 1.18, 0, M('#e9f6ff', 0.3), 4);
    },
  },
  {
    k: 'ilacdolabi', name: 'İlaç Dolabı', cat: 'hastane', icon: '💊', box: [0.6, 0.22],
    build(g) {
      B(g, 1.2, 1.9, 0.42, 0, 0, 0, M('#f2f4f6', 0.5));
      B(g, 1.1, 1.0, 0.02, 0, 0.82, 0.21, M('#bfe3ff', 0.1, 0.1, { transparent: true, opacity: 0.45 }));
      [1.05, 1.4].forEach((y) => B(g, 1.08, 0.02, 0.36, 0, y, 0, M('#e2e6ea', 0.5)));
      const cols = ['#e04848', '#3a8ad8', '#f2c21a', '#4ab07a'];
      for (let i = 0; i < 10; i++) B(g, 0.07, 0.14, 0.07, -0.45 + i * 0.1, 1.07 + (i % 2) * 0.35, 0.05, M(cols[i % 4], 0.5));
      B(g, 0.22, 0.06, 0.02, 0, 1.72, 0.22, M('#e02a2a', 0.4));
      B(g, 0.06, 0.22, 0.02, 0, 1.64, 0.22, M('#e02a2a', 0.4));
    },
  },
  {
    k: 'konveyor', name: 'Konveyör Bant', cat: 'fabrika', icon: '🏭', box: [2.0, 0.42],
    build(g) {
      const fr = M('#3a4048', 0.5, 0.6);
      [-1.8, -0.6, 0.6, 1.8].forEach((x) => [-0.35, 0.35].forEach((z) => B(g, 0.08, 0.8, 0.08, x, 0, z, fr)));
      B(g, 4.0, 0.14, 0.8, 0, 0.8, 0, fr);
      const belt = M('#1a1b1f', 0.9);
      B(g, 3.96, 0.03, 0.66, 0, 0.94, 0, belt);
      [-1, 1].forEach((s) => B(g, 4.0, 0.12, 0.05, 0, 0.94, s * 0.38, M('#f2c21a', 0.5)));
      const box = M('#b8875a', 0.85);
      [-1.4, -0.2, 1.1].forEach((x, i) => B(g, 0.42 - i * 0.04, 0.32, 0.42, x, 0.97, 0, box));
      // kontrol kutusu
      B(g, 0.35, 0.5, 0.2, 2.15, 0.6, 0.3, M('#e8b923', 0.5));
      B(g, 0.08, 0.08, 0.04, 2.15, 0.95, 0.42, M('#ff2020', 0.3, 0, { emissive: '#ff2020', emissiveIntensity: 1.2 }));
    },
  },
  {
    k: 'pres', name: 'Pres Makinesi', cat: 'fabrika', icon: '⚙️', box: [0.8, 0.6],
    build(g) {
      const body = M('#2f6aa8', 0.45, 0.4);
      const steel = M('#a8adb5', 0.35, 0.7);
      B(g, 1.6, 0.3, 1.2, 0, 0, 0, M('#2a2d33', 0.6));
      [-0.6, 0.6].forEach((x) => B(g, 0.3, 2.4, 0.5, x, 0.3, -0.2, body));
      B(g, 1.6, 0.5, 0.6, 0, 2.7, -0.2, body);
      B(g, 0.9, 0.12, 0.7, 0, 0.9, 0.05, steel);
      B(g, 0.8, 0.4, 0.6, 0, 1.6, 0.05, steel);
      C(g, 0.08, 0.08, 0.7, 0, 2.2, 0.05, steel);
      [-1, 1].forEach((s) => B(g, 1.66, 0.12, 0.04, 0, 0.32, s * 0.6, M('#f2c21a', 0.5)));
      B(g, 0.3, 0.3, 0.12, 0.6, 1.2, 0.2, M('#e8b923', 0.5));
    },
  },
];

ITEMS.forEach((d) => {
  if (!CATALOG_MAP[d.k]) CATALOG_MAP[d.k] = d;
});
export const NEW_ITEM_KEYS = ITEMS.map((d) => d.k);
