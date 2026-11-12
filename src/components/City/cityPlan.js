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
import * as J from './jobBuildings.js';
import { BUS_STOPS, LIMAN_BAY, VENDOR_SPOTS } from '../../../functions/cityJobsData.js';

import { P, BLOCK, SIDE, COLS, ROWS, cx, cz, COAST_Z, BOUNDS, LOTS, COAST_X, OUTER, PARK_GATES, EAST_GATE_Z } from './cityLayout.js';
import { buildCoast, MARINA } from './coast.js';
export { P, BLOCK, SIDE, COLS, ROWS, cx, cz, COAST_Z, BOUNDS, COAST_X, OUTER };

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
  // v151 — meslek yapıları (girilmez; tır / ambulans burada teslim eder)
  hastane: { build: J.buildHastane, name: 'Hastane', icon: '🏥', open: true },
  benzinlik: { build: J.buildBenzinlik, name: 'Benzinlik', icon: '⛽', open: true },
  taksi_duragi: { build: J.buildTaksiDuragi, name: 'Taksi Durağı', icon: '🚕', open: true },
  otogar: { build: J.buildOtogar, name: 'Otogar', icon: '🚌', open: true },
  // v157: limana uzak olan depo kaldı (kuzey deposu kaldırıldı); uzak teslim Kervankent'te
  depo_dogu: { build: J.buildDepoDogu, name: 'Doğu Lojistik Deposu', icon: '📦', open: true },
  // v157.4 — müstakil evler mahallesi (girilmez; bahçeli 4 ev) + ofis binası (girilir: danışma lobisi)
  mustakil: { build: B.buildMustakil, name: 'Müstakil Evler', icon: '🏡', open: true },
  ofis: { build: B.buildOfisDis, region: 'ofis', name: 'Ofisler', icon: '🏢', label: '🏢 Ofisler' },
};

// Seyyar satıcılar: mekân değil, sokakta (lot yerel koordinatı)
// v154: tek kaynak functions/cityJobsData.js (motokurye alma noktaları da buradan)
const VENDORS_AT = VENDOR_SPOTS;

const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

export function buildCity() {
  const kits = [];
  const lots = [];
  const used = new Set();
  const ground = new Kit('zemin');
  kits.push(ground);

  // --- asfalt + yol çizgileri ------------------------------------------------
  // v155: batı = sahil bulvarının kenarı (ötesi kordon + deniz); doğu/kuzey = dış servis yolu
  const X0 = COAST_X;
  const X1 = OUTER.x1;
  const Z0 = OUTER.z0;
  const Z1 = COAST_Z;
  const rep = floorRep('asfalt');
  ground.mesh(planeGeo(X1 - X0, Z1 - Z0, (X1 - X0) / rep, (Z1 - Z0) / rep), floorMat('asfalt'), (X0 + X1) / 2, 0, (Z0 + Z1) / 2, 0, { cast: false, rx: -Math.PI / 2 });

  // lot ayırma
  const lotDefs = LOTS.map(([type, i0, j0, i1 = i0, j1 = j0, face = 's']) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) used.add(`${i},${j}`);
    return { type, i0, j0, i1, j1, face };
  });
  // v155: batıda (i < 0) bina yok — deniz. Dış halka lotları artık uzatılmaz: aralarındaki
  // sokaklar açık, arkalarında servis yolu var (araçlar girer).
  for (let i = 0; i <= COLS + 1; i++) {
    for (let j = -2; j < ROWS; j++) {
      if (used.has(`${i},${j}`)) continue;
      const outer = i >= COLS || j < 0;
      const far = i > COLS || j < -1;
      lotDefs.push({ type: i === 2 && j === 4 ? 'plaza' : 'filler', i0: i, j0: j, i1: i, j1: j, face: 's', outer, far });
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
  for (let k = -2; k <= ROWS; k++) roadsX.push(cz(k) - P / 2);
  for (let k = 0; k <= COLS + 2; k++) roadsZ.push(cx(k) - P / 2);
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
        // v155: asfaltın dışına (yeşil alan / kordon) taşan yaya geçidi çizilmesin
        const ex = x + dx * 1.6;
        const ez = z + dz * 1.6;
        if (ex < X0 + 1 || ex > X1 - 1 || ez < Z0 + 1 || ez > Z1 - 1) continue;
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
      // v151: tır yükleme alanı (cityJobsData.LIMAN_BAY)
      J.paintBay(q, LIMAN_BAY.x - mx, LIMAN_BAY.z - (COAST_Z + 9), 9, 7, '#e8b923', 'YÜKLEME', 0.17);
    }
    if (info.mapLabel) kit.label(info.mapLabel.text, info.mapLabel.x || 0, info.mapLabel.y, info.mapLabel.z || 0, 'map');
  });

  // --- v151 otobüs durakları (iç halka, saat yönü) -------------------------------
  const stops = new Kit('duraklar');
  kits.push(stops);
  BUS_STOPS.forEach((st) => J.buildBusStop(stops, st));

  // --- seyyar satıcılar --------------------------------------------------------
  VENDORS_AT.forEach((v) => {
    const host = lots.find((l) => l.type === v.lot);
    if (!host) return;
    const k = new Kit(`vendor_${v.key}`);
    kits.push(k);
    k.group.position.set(v.x, 0, v.z);
    k.group.rotation.y = (v.r * Math.PI) / 4;
    host.kit.group.add(k.group);
    B.buildVendor(k, v.key, VENUES[v.key], { compact: Boolean(v.compact) });
    k.label(VENUES[v.key].name.toUpperCase(), 0, 4.2, 0, 'vendor');
  });

  // --- sahil: korkuluk + deniz -----------------------------------------------
  const sea = new Kit('deniz');
  kits.push(sea);
  const limanLot = lots.find((l) => l.type === 'liman');
  const qx0 = limanLot.mx - limanLot.bw / 2;
  const qx1 = limanLot.mx + limanLot.bw / 2;
  sea.box(X1 - X0, 0.7, 3, M('#6b7078', 0.85), (X0 + X1) / 2, -0.58, COAST_Z + 1.5, { cast: false });
  sea.floor('kaldirim', X1 - X0, 3, (X0 + X1) / 2, COAST_Z + 1.5, 0.125);
  const gateAt = (x) => MARINA.gates.some((g) => Math.abs(x - g) < 2.2);
  for (let x = X0 + 1; x < X1; x += 2) {
    if (x > qx0 - 1 && x < qx1 + 1) continue;
    if (gateAt(x)) continue;
    sea.item('korkuluk', x, COAST_Z + 2.8, 0, 0, { solid: false });
  }
  // korkuluk çarpışması (marina kapılarında boşluk)
  const runs = [[X0, qx0]];
  let a = qx1;
  [...MARINA.gates].sort((p, q) => p - q).forEach((g) => {
    runs.push([a, g - 2.2]);
    a = g + 2.2;
  });
  runs.push([a, X1]);
  runs.forEach(([p, q]) => sea.solid((p + q) / 2, COAST_Z + 2.9, (q - p) / 2, 0.2));
  for (let x = X0 + 10; x < X1; x += 16) {
    if (x > qx0 - 2 && x < qx1 + 2) continue;
    if (gateAt(x) || MARINA.gates.some((g) => Math.abs(x - g) < 3)) continue;
    sea.item('streetlamp', x, COAST_Z + 2.2, 4, 0);
  }
  A.buildSea(sea, { x0: X0 - 400, x1: X1 + 400, z0: COAST_Z + 2, z1: COAST_Z + 420 });
  // v155: batı denizi (kumsalın önü) — kumsal zemini coast.js'de
  A.buildSea(sea, { x0: X0 - 900, x1: X0 - 6, z0: Z0 - 600, z1: COAST_Z + 2.01 });
  // v155: "denizin ortasındaki binalar" (ufuktaki karşı kıyı kutuları) kaldırıldı

  // --- v155: dış servis yolu kenarı (doğu + kuzey): bordür + alçak duvar + ağaçlar --------------
  const edge = new Kit('dis_kenar');
  kits.push(edge);
  const edgeM = M('#a8a294', 0.9);
  // doğu kenarı: O-77 otoyol ağzında (z = −140) açık
  // v157.4: duvar uçları yola taşıyordu (±4) → bariyer hizasında biter (RAIL 6,3)
  const HW = { z0: cz(-1) - P / 2 - 6.5, z1: cz(-1) - P / 2 + 6.5 };
  // ve güneydoğu hurdalık geçidi (z = EAST_GATE_Z ± 4)
  for (const [p, q] of [[Z0 - 0.6, HW.z0], [HW.z1, EAST_GATE_Z - 4], [EAST_GATE_Z + 4, Z1 + 0.3]]) {
    edge.box(0.6, 0.7, q - p, edgeM, X1 + 0.3, 0, (p + q) / 2);
    edge.solid(X1 + 0.3, (p + q) / 2, 0.3, (q - p) / 2);
  }
  // kuzey kenarı: orman parkına yaya kapıları (araç babalarla durur)
  const GW = 2.4;
  let gx0 = X0 - 0.6;
  [...PARK_GATES, X1 + 0.6 + GW].forEach((g) => {
    const p = gx0;
    const q = g - GW;
    if (q > p) {
      edge.box(q - p, 0.7, 0.6, edgeM, (p + q) / 2, 0, Z0 - 0.3);
      edge.solid((p + q) / 2, Z0 - 0.3, (q - p) / 2, 0.3);
    }
    if (g <= X1) {
      for (const sx of [-1, 1]) edge.box(0.5, 1.6, 0.5, M('#8f8a80', 0.85), g + sx * GW, 0, Z0 - 0.3);
      for (const bx of [-1.2, 0, 1.2]) edge.cyl(0.12, 0.14, 0.85, M('#2a2d33', 0.5, 0.5), g + bx, 0, Z0 - 0.3, 8, { cast: false });
      edge.solid(g, Z0 - 0.3, GW, 0.3);
      edge.solids.at(-1).car = true;
    }
    gx0 = g + GW;
  });
  for (let z = Z0 + 14; z < Z1 - 8; z += 16) if (Math.abs(z - -140) > 9 && Math.abs(z - EAST_GATE_Z) > 8) edge.item('tree', X1 + 2.4, z, 0, 0);
  for (let x = X0 + 14; x < X1 - 8; x += 16) if (!PARK_GATES.some((g) => Math.abs(x - g) < 6)) edge.item('tree', x, Z0 - 2.4, 0, 0);

  // --- v155: batı kıyısı (kumsal, beach club, iskele) + Neon Marina ---------------------------
  kits.push(...buildCoast());

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
