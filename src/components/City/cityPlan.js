// =============================================================================
// SADECE ÖNİZLEME — Neon Şehir haritasının gezilebilir planı.
// Harita resmindeki yerleşim (Camii sol üst, Banka kulesi üstte, Park ortada,
// Stadyum sağ altta, Liman sol altta denizde…) ızgaraya oturtuldu.
// Dünya: x → haritada sağ-aşağı, z → haritada sol-aşağı. Varsayılan kamera
// haritadaki gibi güneydoğudan bakar.
// =============================================================================
import { Kit, M, floorMat, floorRep, planeGeo, glowMat } from './kit.js';
import * as B from './buildings.js';
import * as A from './areas.js';
import { VENUES } from '../../../functions/venueLayouts.js';

import { P, BLOCK, SIDE, COLS, ROWS, cx, cz, COAST_Z, BOUNDS, LOTS } from './cityLayout.js';
export { P, BLOCK, SIDE, COLS, ROWS, cx, cz, COAST_Z, BOUNDS };

// tür → oluşturucu. enter: oyundaki gerçek 3D mekân anahtarı (VenueHouseScreen)
const T = {
  camii: { build: B.buildCamii, region: 'camii', name: 'Camii', icon: '🕌' },
  banka: { build: B.buildBanka, region: 'banka', name: 'Banka', icon: '🏦' },
  karakol: { build: B.buildKarakol, region: 'karakol', name: 'Karakol', icon: '🚓' },
  belediye: { build: B.buildBelediye, region: 'belediye', name: 'Belediye', icon: '🏛️' },
  galeri: { build: B.buildGaleri, region: 'araba_galerisi', name: 'Araba Galerisi', icon: '🚗' },
  silah: { build: B.buildSilah, region: 'silah_magazasi', name: 'Silah Mağazası', icon: '🔫' },
  modifiye: { build: B.buildModifiye, region: 'modifiye_garaji', name: 'Modifiye Garajı', icon: '🔧' },
  casino: { build: B.buildCasino, region: 'casino', name: 'Casino', icon: '🎰' },
  spor: { build: B.buildSpor, region: 'spor_salonu', name: 'Spor Salonu', icon: '🏋️' },
  fabrika: { build: B.buildFabrika, region: 'fabrika', name: 'Fabrika', icon: '🏭' },
  netkafe: { build: B.buildNetKafe, region: 'internet_kafe', name: 'İnternet Kafe', icon: '🖥️' },
  bar: { build: B.buildBar, region: 'bar', name: 'Bar', icon: '🍸' },
  cafe: { build: B.buildCafe, region: 'cafe', name: 'Cafe', icon: '☕' },
  ev: { build: B.buildEv, region: 'ev', name: 'Ev', icon: '🏠', label: '🏠 Evler' },
  stadyum: { build: B.buildStadyum, region: 'stadyum', name: 'Stadyum', icon: '🏟️', label: '⚽ Maça gir' },
  park: { build: A.buildPark, region: 'park', name: 'Park', icon: '🌳', open: true },
  pist: { build: A.buildPist, region: 'yaris_pisti', name: 'Yarış Pisti', icon: '🏁', open: true },
  liman: { build: A.buildLiman, region: 'liman_depo', name: 'Liman & Depo', icon: '⚓' },
};

// Seyyar satıcılar: mekân değil, sokakta (lot yerel koordinatı)
const VENDORS_AT = [
  { key: 'kokorecci', lot: 'casino', x: -8.5, z: 8.5, r: 0 },
  { key: 'kofteci', lot: 'park', x: -26, z: 6.5, r: 0 },
  { key: 'donerci', lot: 'ev', x: 6.5, z: 8.5, r: 0 },
  { key: 'simitci', lot: 'plaza', x: 0, z: 6.5, r: 0 },
];

const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

export function buildCity() {
  const kits = [];
  const lots = [];
  const used = new Set();
  const ground = new Kit('zemin');
  kits.push(ground);

  // --- asfalt + yol çizgileri ------------------------------------------------
  const X0 = -200;
  const X1 = 200;
  const Z0 = -190;
  const Z1 = COAST_Z;
  const rep = floorRep('asfalt');
  ground.mesh(planeGeo(X1 - X0, Z1 - Z0, (X1 - X0) / rep, (Z1 - Z0) / rep), floorMat('asfalt'), (X0 + X1) / 2, 0, (Z0 + Z1) / 2, 0, { cast: false, rx: -Math.PI / 2 });

  // lot ayırma
  const lotDefs = LOTS.map(([type, i0, j0, i1 = i0, j1 = j0, face = 's']) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) used.add(`${i},${j}`);
    return { type, i0, j0, i1, j1, face };
  });
  for (let i = -2; i <= COLS + 1; i++) {
    for (let j = -2; j < ROWS; j++) {
      if (used.has(`${i},${j}`)) continue;
      const outer = i < 0 || i >= COLS || j < 0;
      // en dış halka (yolun öbür yanı): sadece görünen bina cepheleri (girilmez, sınır)
      const far = i < -1 || i > COLS || j < -1;
      const d = { type: i === 2 && j === 4 ? 'plaza' : 'filler', i0: i, j0: j, i1: i, j1: j, face: 's', outer, far };
      // v147.5: en dış halka kesintisiz bina duvarı — aradaki (girilemeyen) ara yolları kapat
      const gap = (P - BLOCK) / 2;
      if (far && (i < -1 || i > COLS)) {
        d.ez0 = gap;
        d.ez1 = j === ROWS - 1 ? COAST_Z + 3 - (cz(j) + BLOCK / 2) : gap; // sahil yolunu da kapat
      } else if (far) {
        d.ex0 = i === -1 ? gap * 2 : gap;
        d.ex1 = i === COLS ? gap * 2 : gap;
      }
      lotDefs.push(d);
    }
  }

  // yol orta çizgileri (kesikli) ve yaya geçitleri
  const lineM = M('#e9e4d4', 0.7);
  const yellowM = M('#e8b923', 0.6);
  const cellOf = (x, z) => {
    const i = Math.round((x + 100) / P);
    const j = Math.round((z + 80) / P);
    return lotDefs.find((l) => i >= l.i0 && i <= l.i1 && j >= l.j0 && j <= l.j1);
  };
  const covered = (x, z) => {
    // bir yol noktası birleşik bir lotun içinde mi?
    return lotDefs.some((l) => {
      const { bx0, bx1, bz0, bz1 } = lotBox(l);
      return x > bx0 + 0.5 && x < bx1 - 0.5 && z > bz0 + 0.5 && z < bz1 - 0.5;
    });
  };
  void cellOf;
  const roadsX = []; // yatay yollar (z sabit)
  const roadsZ = []; // dikey yollar (x sabit)
  for (let k = -1; k <= ROWS; k++) roadsX.push(cz(k) - P / 2);
  for (let k = -1; k <= COLS + 1; k++) roadsZ.push(cx(k) - P / 2);
  const dash = (x, z, alongX) => ground.box(alongX ? 2.2 : 0.16, 0.02, alongX ? 0.16 : 2.2, lineM, x, 0.005, z, { cast: false, receive: true });
  roadsX.forEach((z) => {
    for (let x = X0 + 4; x < X1 - 4; x += 5) if (!covered(x, z) && !nearCross(x, roadsZ)) dash(x, z, true);
  });
  roadsZ.forEach((x) => {
    for (let z = Z0 + 4; z < Z1 - 6; z += 5) if (!covered(x, z) && !nearCross(z, roadsX)) dash(x, z, false);
  });
  // yaya geçitleri: her kavşağın dört kolu
  roadsX.forEach((z) => {
    roadsZ.forEach((x) => {
      if (covered(x, z)) return;
      for (const [dx, dz, along] of [[0, 6.2, true], [0, -6.2, true], [6.2, 0, false], [-6.2, 0, false]]) {
        if (covered(x + dx * 1.6, z + dz * 1.6)) continue;
        for (let k = -3; k <= 3; k++) {
          ground.box(along ? 0.55 : 2.4, 0.02, along ? 2.4 : 0.55, lineM, x + dx + (along ? k * 1.05 : 0), 0.006, z + dz + (along ? 0 : k * 1.05), { cast: false });
        }
      }
    });
  });
  void yellowM;

  // --- bloklar: kaldırım + lot içeriği ---------------------------------------
  const kRep = floorRep('kaldirim');
  const curbM = M('#8f8a80', 0.85);
  lotDefs.forEach((l, n) => {
    const { bx0, bx1, bz0, bz1 } = lotBox(l);
    const bw = bx1 - bx0;
    const bd = bz1 - bz0;
    const mx = (bx0 + bx1) / 2;
    const mz = (bz0 + bz1) / 2;
    // kaldırım (yükseltilmiş, oyunun kaldırım taşı dokusu)
    ground.box(bw, 0.12, bd, curbM, mx, 0, mz, { cast: false });
    ground.mesh(planeGeo(bw, bd, bw / kRep, bd / kRep, bx0 / kRep, bz0 / kRep), floorMat('kaldirim'), mx, 0.121, mz, 0, { cast: false, rx: -Math.PI / 2 });
    const kit = new Kit(l.type);
    kits.push(kit);
    const ry = FACE[l.face];
    kit.group.position.set(mx, 0, mz);
    kit.group.rotation.y = ry;
    const rot = l.face === 'e' || l.face === 'w';
    const lot = { w: (rot ? bd : bw) - SIDE * 2, d: (rot ? bw : bd) - SIDE * 2 };
    let info = {};
    const def = T[l.type];
    if (def) info = def.build(kit, lot) || {};
    else if (l.type === 'plaza') {
      B.buildFiller(kit, lot, 900 + n, { plaza: true });
      kit.floor('kaldirim', lot.w, lot.d / 2, 0, lot.d / 4, 0.15);
      for (const x of [-9, 9]) kit.item('palm', x, lot.d / 2 - 2, 0, 0);
      kit.item('parkbench', -5, lot.d / 2 - 1.2, 4, 0);
      kit.item('parkbench', 5, lot.d / 2 - 1.2, 4, 0);
    } else B.buildFiller(kit, lot, n * 31 + l.i0 * 7 + l.j0 * 13, { tall: l.far ? 1.7 : l.outer ? 1.25 : 1 });
    // kaldırım lambaları + ağaçlar (blok kenarları)
    if (l.type !== 'park') sidewalkProps(kit, lot, n, l);
    const entry = { ...l, kit, info, def, mx, mz, bw, bd, ry, lot };
    lots.push(entry);
    if (def && info.door) {
      kit.zone({ x: info.door.x, z: info.door.z, r: 2.6, kind: 'door', type: l.type, region: def.region, title: `${def.icon} ${def.name}`, label: def.label });
    }
    if (l.type === 'liman') {
      // rıhtım (sahil yolunun güneyi)
      const q = new Kit('rihtim');
      kits.push(q);
      q.group.position.set(mx, 0, COAST_Z + 9);
      A.buildQuay(q, { w: bw, d: 18 });
      A.cargoShip(q, -12, 15, 0, 38, 1);
      A.cargoShip(q, 22, 16, 0.05, 30, 4);
    }
    if (info.mapLabel) kit.label(info.mapLabel.text, info.mapLabel.x || 0, info.mapLabel.y, info.mapLabel.z || 0, 'map');
  });

  // --- seyyar satıcılar --------------------------------------------------------
  VENDORS_AT.forEach((v) => {
    const host = lots.find((l) => l.type === v.lot);
    if (!host) return;
    const k = new Kit(`vendor_${v.key}`);
    kits.push(k);
    k.group.position.set(v.x, 0, v.z);
    k.group.rotation.y = (v.r * Math.PI) / 4;
    host.kit.group.add(k.group);
    B.buildVendor(k, v.key, VENUES[v.key]);
    k.label(VENUES[v.key].name.toUpperCase(), 0, 4.2, 0, 'vendor');
  });

  // --- sahil: korkuluk + deniz -----------------------------------------------
  const sea = new Kit('deniz');
  kits.push(sea);
  const limanLot = lots.find((l) => l.type === 'liman');
  const qx0 = limanLot.mx - limanLot.bw / 2;
  const qx1 = limanLot.mx + limanLot.bw / 2;
  sea.box(X1 - X0, 0.7, 3, M('#6b7078', 0.85), 0, -0.58, COAST_Z + 1.5, { cast: false });
  sea.floor('kaldirim', X1 - X0, 3, 0, COAST_Z + 1.5, 0.125);
  const EDGE = cx(COLS + 1) - BLOCK / 2; // dış bina duvarı (v147.5)
  for (let x = X0 + 1; x < X1; x += 2) {
    if (x > qx0 - 1 && x < qx1 + 1) continue;
    if (Math.abs(x) > EDGE - 0.5) continue;
    sea.item('korkuluk', x, COAST_Z + 2.8, 0, 0, { solid: false });
  }
  sea.solid((X0 + qx0) / 2, COAST_Z + 2.9, (qx0 - X0) / 2, 0.2);
  sea.solid((qx1 + X1) / 2, COAST_Z + 2.9, (X1 - qx1) / 2, 0.2);
  for (let x = X0 + 10; x < X1; x += 16) {
    if (x > qx0 - 2 && x < qx1 + 2) continue;
    if (Math.abs(x) > EDGE - 1) continue;
    sea.item('streetlamp', x, COAST_Z + 2.2, 4, 0);
  }
  A.buildSea(sea, { x0: X0 - 200, x1: X1 + 200, z0: COAST_Z + 2, z1: COAST_Z + 300 });
  // ufukta karşı kıyı ışıkları
  for (let i = 0; i < 40; i++) {
    const x = -260 + i * 13 + Math.sin(i * 7.1) * 4;
    const h = 6 + Math.abs(Math.sin(i * 3.3)) * 26;
    sea.box(8, h, 6, M('#0d0f18', 0.9), x, -0.6, 300 + Math.sin(i) * 10, { cast: false });
    sea.box(8.05, 0.3, 6.05, glowMat(i % 3 ? '#ffcf7a' : '#ff3fa0', 2), x, h - 1.4, 300 + Math.sin(i) * 10, { cast: false });
  }

  return { kits, lots, roadsX, roadsZ, covered, X0, X1, Z0, Z1 };
}

function nearCross(v, lines) {
  return lines.some((l) => Math.abs(l - v) < 8.5);
}

// blok kenarı kaldırım donatıları (yerel lot koordinatında: kaldırım lotun dışında)
// lot kutusu (dünya) — v147.5: dış halka lotları ara yolları kapatacak kadar uzar
function lotBox(l) {
  return {
    bx0: cx(l.i0) - BLOCK / 2 - (l.ex0 || 0),
    bx1: cx(l.i1) + BLOCK / 2 + (l.ex1 || 0),
    bz0: cz(l.j0) - BLOCK / 2 - (l.ez0 || 0),
    bz1: cz(l.j1) + BLOCK / 2 + (l.ez1 || 0),
  };
}
function sidewalkProps(kit, lot, n, l) {
  const hw = lot.w / 2 + SIDE / 2 + 0.3;
  const hd = lot.d / 2 + SIDE / 2 + 0.3;
  const sides = [
    [0, hd, lot.w, 0],
    [hw, 0, lot.d, 6],
    [0, -hd, lot.w, 4],
    [-hw, 0, lot.d, 2],
  ];
  sides.forEach(([sx, sz, len, r], s) => {
    const nL = Math.max(1, Math.floor(len / 14));
    for (let k = 0; k < nL; k++) {
      const t = (k + 0.5) / nL - 0.5;
      let px = sx === 0 ? t * len : sx;
      // ön kaldırımın ortası (kapı önü) boş kalsın
      if (s === 0 && Math.abs(px) < 6) px = px < 0 ? -len * 0.36 : len * 0.36;
      const pz = sz === 0 ? t * len : sz;
      // lamba: yola baksın (r ters yönde)
      if ((k + s + n) % 2 === 0) kit.item('streetlamp', px, pz, (r + 4) % 8 === 0 ? 0 : (r + 4) % 8, 0, { y: 0.12 });
      else if (!l.outer && (k + n) % 3 === 0) kit.item('tree', px, pz, 0, 0, { y: 0.12 });
    }
  });
}

export { T as LOT_TYPES };
