// =============================================================================
// HARİTA — mini harita (yön yukarıda, navigasyon) + büyük harita (kuzey yukarıda,
// kaydır/yakınlaştır, sokak adları, mekân ikonları). Şehrin gerçek verisinden çizilir:
// parseller, bina tabanları (çarpışma kutuları), yol ızgarası, otoyol, kasaba.
// Oyunun eski düz harita resminin yerine geçebilecek şekilde tasarlandı.
// =============================================================================
import { R, TERRAIN, LAKE, RIVER, TOWN, fromTown, frameAt, TAGS, LEN, shoreX } from './route.js';
import { COAST_X, KORDON_X, OUTER, COAST_Z } from '../cityLayout.js';
import { DECKS, BEACH_POIS } from '../coast.js';
import { fromPad } from './roadsideGeo.js';
import { PATHS as PARK_PATHS, POND, PARK } from './northPark.js';

const PI = Math.PI;
export const PAL = {
  land: '#e8ecdf',
  urban: '#efece6',
  block: '#e6e1d7',
  blockEdge: '#d3ccbe',
  road: '#ffffff',
  roadEdge: '#cfc8ba',
  bld: '#d9d2c5',
  bldEdge: '#bfb6a6',
  park: '#c6e3b1',
  parkPath: '#eef2e4',
  water: '#a5d1f0',
  waterEdge: '#86bde4',
  hwy: '#f7c35f',
  hwyEdge: '#d9922e',
  route: '#2f7cf6',
  sand: '#efe3c2',
};
// mekân türü → bina rengi + ikon rengi
const TYPE_COL = {
  banka: '#c7d6ea', karakol: '#c4cce0', belediye: '#e6dbc4', camii: '#cfe3dc', galeri: '#e2d6e8', silah: '#d9cfcf',
  modifiye: '#d8d5cc', casino: '#e3cde6', spor: '#d3e0ea', fabrika: '#d6d1c4', netkafe: '#cfdbe6', bar: '#ead1d8', cafe: '#eadfcc',
  ev: '#e8dcc8', hastane: '#f0d4d4', benzinlik: '#d4e6d4', taksi_duragi: '#f2e3a6', otogar: '#e6d0d0', ofis: '#dfe6ee', mustakil: '#e4ead2',
};
const ICON_COL = {
  banka: '#2f6fd0', karakol: '#1d3f8a', belediye: '#a8792a', camii: '#2d8a7a', galeri: '#7d3fa8', silah: '#8a2b2b', modifiye: '#5a5f68',
  casino: '#a8318a', spor: '#2f8ac2', fabrika: '#6b5a3a', netkafe: '#2a7ab8', bar: '#c23a6a', cafe: '#a8682a', ev: '#c2702a',
  stadyum: '#2f9e44', park: '#2f9e44', pist: '#d0402a', liman: '#1d6fa8', hastane: '#d0302a', benzinlik: '#2f9e5a', taksi_duragi: '#d9a400', otogar: '#c8141e', ofis: '#2a6fb5', mustakil: '#5a8a3a',
};
// sokak adları (yer tutucu — oyunda değiştirilebilir)
const STREETS_X = [ // yatay yollar: z
  [-180, 'Kuzey Servis Yolu'], [-140, 'Kuzey Çevre Yolu'], [-100, 'Banka Caddesi'], [-60, 'Cumhuriyet Caddesi'], [-20, 'Park Caddesi'], [20, 'Stadyum Caddesi'], [60, 'Liman Caddesi'], [100, 'Sahil Yolu'],
];
const STREETS_Z = [ // dikey yollar: x
  [-120, 'Sahil Bulvarı'], [-80, 'Galeri Sokak'], [-40, 'Fabrika Sokak'], [0, 'Merkez Bulvarı'], [40, 'Kafe Sokak'], [80, 'Spor Sokak'], [120, 'Belediye Sokak'], [160, 'Doğu Çevre Yolu'], [200, 'Doğu Servis Yolu'],
];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}
function rrect(g, x, z, hw, hd, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // yerel → dünya: x = lx c + lz s, z = −lx s + lz c (three.js rotation.y)
  const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
  g.beginPath();
  pts.forEach(([px, pz], i) => (i ? g.lineTo(px, pz) : g.moveTo(px, pz)));
  g.closePath();
}

// --- harita ikonları: emoji yerine çizilmiş beyaz semboller (renkli iğne üzerinde) -----------
const GLYPH_OF = {
  camii: 'mosque', banka: 'bank', karakol: 'police', belediye: 'gov', galeri: 'car', silah: 'target', modifiye: 'wrench',
  casino: 'spade', spor: 'dumbbell', fabrika: 'factory', netkafe: 'monitor', bar: 'cocktail', cafe: 'cup', ev: 'house',
  stadyum: 'ball', park: 'tree', pist: 'flag', liman: 'anchor', hastane: 'cross', benzinlik: 'fuel', taksi_duragi: 'car', otogar: 'bus', ofis: 'gov', mustakil: 'house',
  melon: 'fork', rest: 'cup', honey: 'fork', corn: 'fork', village: 'house', light: 'flag', anchor2: 'anchor', boat: 'anchor', view: 'eye', beach: 'umbrella',
};
// birim koordinat (−1…1), beyaz
function glyph(g, key) {
  const L = (pts, close = false) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (close) g.closePath();
  };
  const fill = () => g.fill();
  const stroke = () => g.stroke();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 0.16;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (key) {
    case 'mosque':
      g.beginPath();
      g.arc(-0.1, 0.05, 0.5, PI, 0);
      g.lineTo(0.4, 0.6);
      g.lineTo(-0.6, 0.6);
      g.closePath();
      fill();
      g.fillRect(0.55, -0.55, 0.16, 1.15);
      L([[0.63, -0.85], [0.5, -0.55], [0.76, -0.55]], true);
      fill();
      break;
    case 'bank':
      L([[-0.75, -0.25], [0, -0.75], [0.75, -0.25]], true);
      fill();
      [-0.5, 0, 0.5].forEach((x) => g.fillRect(x - 0.1, -0.15, 0.2, 0.6));
      g.fillRect(-0.75, 0.5, 1.5, 0.18);
      break;
    case 'police':
      L([[0, -0.8], [0.62, -0.55], [0.55, 0.15], [0, 0.8], [-0.55, 0.15], [-0.62, -0.55]], true);
      fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(0, -0.05, 0.22, 0, PI * 2);
      fill();
      break;
    case 'gov':
      L([[-0.8, -0.3], [0, -0.8], [0.8, -0.3]], true);
      fill();
      [-0.55, -0.18, 0.18, 0.55].forEach((x) => g.fillRect(x - 0.08, -0.2, 0.16, 0.65));
      g.fillRect(-0.8, 0.5, 1.6, 0.2);
      break;
    case 'car':
      L([[-0.8, 0.25], [-0.75, -0.05], [-0.45, -0.1], [-0.25, -0.45], [0.35, -0.45], [0.55, -0.1], [0.8, -0.02], [0.82, 0.25]], true);
      fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      [-0.45, 0.48].forEach((x) => {
        g.beginPath();
        g.arc(x, 0.3, 0.17, 0, PI * 2);
        fill();
      });
      break;
    case 'target':
      g.beginPath();
      g.arc(0, 0, 0.6, 0, PI * 2);
      stroke();
      g.beginPath();
      g.arc(0, 0, 0.22, 0, PI * 2);
      fill();
      L([[0, -0.85], [0, -0.45]]);
      stroke();
      L([[0, 0.45], [0, 0.85]]);
      stroke();
      L([[-0.85, 0], [-0.45, 0]]);
      stroke();
      L([[0.45, 0], [0.85, 0]]);
      stroke();
      break;
    case 'wrench':
      g.lineWidth = 0.28;
      L([[-0.5, 0.5], [0.25, -0.25]]);
      stroke();
      g.lineWidth = 0.16;
      g.beginPath();
      g.arc(0.38, -0.38, 0.3, PI * 0.9, PI * 2.6);
      stroke();
      break;
    case 'spade':
      g.beginPath();
      g.moveTo(0, -0.8);
      g.bezierCurveTo(0.9, -0.1, 0.55, 0.55, 0, 0.18);
      g.bezierCurveTo(-0.55, 0.55, -0.9, -0.1, 0, -0.8);
      fill();
      L([[0, 0.1], [0.28, 0.75], [-0.28, 0.75]], true);
      fill();
      break;
    case 'dumbbell':
      g.fillRect(-0.55, -0.08, 1.1, 0.16);
      [-0.62, 0.48].forEach((x) => g.fillRect(x, -0.42, 0.14, 0.84));
      [-0.8, 0.66].forEach((x) => g.fillRect(x, -0.28, 0.14, 0.56));
      break;
    case 'factory':
      L([[-0.8, 0.65], [-0.8, -0.05], [-0.4, -0.35], [-0.4, -0.05], [0, -0.35], [0, -0.05], [0.4, -0.35], [0.4, -0.85], [0.65, -0.85], [0.65, 0.65]], true);
      fill();
      break;
    case 'monitor':
      g.fillRect(-0.75, -0.6, 1.5, 0.95);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-0.6, -0.47, 1.2, 0.68);
      g.fillStyle = '#fff';
      g.fillRect(-0.1, 0.35, 0.2, 0.22);
      g.fillRect(-0.4, 0.55, 0.8, 0.14);
      break;
    case 'cocktail':
      L([[-0.65, -0.65], [0.65, -0.65], [0, 0.05]], true);
      fill();
      L([[0, 0.05], [0, 0.6]]);
      stroke();
      L([[-0.35, 0.65], [0.35, 0.65]]);
      stroke();
      break;
    case 'cup':
      L([[-0.6, -0.3], [0.35, -0.3], [0.28, 0.55], [-0.53, 0.55]], true);
      fill();
      g.beginPath();
      g.arc(0.42, 0.05, 0.22, -PI / 2, PI / 2);
      stroke();
      L([[-0.3, -0.85], [-0.2, -0.5]]);
      stroke();
      L([[0.05, -0.85], [0.15, -0.5]]);
      stroke();
      break;
    case 'house':
      L([[-0.75, -0.05], [0, -0.75], [0.75, -0.05], [0.55, -0.05], [0.55, 0.7], [-0.55, 0.7], [-0.55, -0.05]], true);
      fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(-0.14, 0.25, 0.28, 0.45);
      break;
    case 'ball':
      g.beginPath();
      g.arc(0, 0, 0.7, 0, PI * 2);
      fill();
      g.fillStyle = 'rgba(0,0,0,0.45)';
      L([[0, -0.3], [0.28, -0.08], [0.18, 0.25], [-0.18, 0.25], [-0.28, -0.08]], true);
      fill();
      break;
    case 'tree':
      g.beginPath();
      g.arc(0, -0.25, 0.55, 0, PI * 2);
      fill();
      g.fillRect(-0.1, 0.2, 0.2, 0.6);
      break;
    case 'flag':
      g.fillRect(-0.6, -0.8, 0.14, 1.6);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.fillRect(-0.46 + i * 0.3, -0.75 + j * 0.27, 0.3, 0.27);
      g.strokeRect(-0.46, -0.75, 1.2, 0.81);
      break;
    case 'anchor':
      g.beginPath();
      g.arc(0, -0.62, 0.16, 0, PI * 2);
      stroke();
      L([[0, -0.46], [0, 0.72]]);
      stroke();
      L([[-0.35, -0.2], [0.35, -0.2]]);
      stroke();
      g.beginPath();
      g.arc(0, 0.12, 0.62, PI * 0.15, PI * 0.85);
      stroke();
      break;
    case 'box':
      L([[0, -0.75], [0.7, -0.4], [0.7, 0.4], [0, 0.75], [-0.7, 0.4], [-0.7, -0.4]], true);
      fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.1;
      L([[-0.7, -0.4], [0, -0.05], [0.7, -0.4]]);
      stroke();
      L([[0, -0.05], [0, 0.75]]);
      stroke();
      break;
    case 'cross':
      g.fillRect(-0.2, -0.7, 0.4, 1.4);
      g.fillRect(-0.7, -0.2, 1.4, 0.4);
      break;
    case 'fuel':
      g.fillRect(-0.6, -0.7, 0.8, 1.4);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(-0.47, -0.55, 0.54, 0.38);
      g.fillStyle = '#fff';
      L([[0.2, -0.3], [0.55, -0.1], [0.55, 0.45], [0.7, 0.45]]);
      stroke();
      break;
    case 'parking':
      g.font = '900 1.5px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('P', 0, 0.08);
      break;
    case 'fork':
      L([[-0.35, -0.75], [-0.35, 0.75]]);
      stroke();
      [-0.55, -0.15].forEach((x) => {
        L([[x, -0.75], [x, -0.3]]);
        stroke();
      });
      L([[-0.55, -0.3], [-0.15, -0.3]]);
      stroke();
      g.beginPath();
      g.moveTo(0.35, 0.75);
      g.lineTo(0.35, -0.75);
      g.quadraticCurveTo(0.7, -0.4, 0.55, 0);
      g.lineTo(0.35, 0);
      fill();
      stroke();
      break;
    case 'bed':
      g.fillRect(-0.8, -0.05, 1.6, 0.4);
      g.fillRect(-0.8, -0.45, 0.16, 1.0);
      g.fillRect(-0.55, -0.3, 0.45, 0.25);
      L([[0.8, 0.35], [0.8, 0.55]]);
      stroke();
      break;
    case 'truck':
      g.fillRect(-0.85, -0.45, 1.05, 0.7);
      g.fillRect(0.3, -0.2, 0.5, 0.45);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      [-0.5, 0.0, 0.55].forEach((x) => {
        g.beginPath();
        g.arc(x, 0.35, 0.15, 0, PI * 2);
        g.fill();
      });
      break;
    case 'bus':
      g.fillRect(-0.85, -0.5, 1.7, 0.85);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(-0.7, -0.38, 1.4, 0.32);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      [-0.5, 0.5].forEach((x) => {
        g.beginPath();
        g.arc(x, 0.38, 0.16, 0, PI * 2);
        g.fill();
      });
      break;
    case 'toll':
      g.fillRect(-0.75, -0.3, 0.25, 1.0);
      g.fillRect(-0.5, -0.35, 1.3, 0.24);
      g.fillStyle = '#d0302a';
      [-0.25, 0.25].forEach((x) => g.fillRect(x, -0.35, 0.22, 0.24));
      break;
    case 'umbrella':
      g.beginPath();
      g.arc(0, -0.05, 0.75, PI, 0);
      g.closePath();
      fill();
      g.fillRect(-0.07, -0.05, 0.14, 0.8);
      g.fillRect(-0.35, 0.68, 0.7, 0.14);
      break;
    case 'eye':
      g.beginPath();
      g.ellipse(0, 0, 0.8, 0.45, 0, 0, PI * 2);
      fill();
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.arc(0, 0, 0.26, 0, PI * 2);
      fill();
      break;
    case 'scale':
      g.fillRect(-0.08, -0.7, 0.16, 1.3);
      g.fillRect(-0.75, -0.55, 1.5, 0.14);
      g.fillRect(-0.45, 0.55, 0.9, 0.16);
      [-0.6, 0.6].forEach((x) => {
        g.beginPath();
        g.arc(x, -0.1, 0.28, 0, PI);
        fill();
      });
      break;
    default:
      g.beginPath();
      g.arc(0, 0, 0.35, 0, PI * 2);
      fill();
  }
}
// renkli iğne + beyaz sembol
function drawPin(g, x, y, r, color, key, small) {
  g.save();
  g.translate(x, y);
  g.shadowColor = 'rgba(0,0,0,0.3)';
  g.shadowBlur = r * 0.5;
  g.shadowOffsetY = r * 0.15;
  g.fillStyle = color;
  if (small) {
    g.beginPath();
    g.arc(0, 0, r, 0, PI * 2);
    g.fill();
  } else {
    // damla iğne: üstte daire, altı sivri (ucu konumda)
    g.translate(0, -r * 1.25);
    g.beginPath();
    g.arc(0, 0, r, PI * 0.78, PI * 0.22);
    g.lineTo(0, r * 1.25);
    g.closePath();
    g.fill();
  }
  g.shadowColor = 'transparent';
  g.lineWidth = r * 0.14;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.scale(r * 0.58, r * 0.58);
  glyph(g, key);
  g.restore();
}

export function createMap({ city, cityExtraLots, solids, citySolidCount, town, sample, lotTypes, vendors, extraBld = [], roadside = null, park = null }) {
  // --- 1) BÖLGE katmanı: arazi gölgelendirmesi (kabartma) + su ---------------------------
  const WS = 0.25;
  const T = TERRAIN;
  const wc = canvas((T.x1 - T.x0) * WS, (T.z1 - T.z0) * WS);
  {
    const g = wc.getContext('2d');
    const img = g.createImageData(wc.width, wc.height);
    const st = 1 / WS;
    for (let j = 0; j < wc.height; j++) {
      for (let i = 0; i < wc.width; i++) {
        const x = T.x0 + i * st;
        const z = T.z0 + j * st;
        const h = sample(x, z);
        const hx = sample(x + st, z) - h;
        const hz = sample(x, z + st) - h;
        // kuzeybatıdan ışık
        const shade = Math.max(-1, Math.min(1, (-hx - hz) / st * 0.9));
        let col;
        const west = x < shoreX(z) + 60;
        const water = (h < LAKE.y && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.6) || h < RIVER.y + 0.3 || (z > 100 && h < -0.4) || (west && h < -0.6);
        if (water) col = [165, 209, 240];
        else if (h > 150) col = [244, 246, 247];
        else if (h > 85) col = [214, 214, 204];
        else if (h > 40) col = [216, 228, 200];
        else col = [222, 234, 206];
        if (!water && ((z > 70 && h < 1.4) || (west && h < 1.2))) col = [239, 227, 194];
        const k = water ? 0 : shade * 26;
        const o = (j * wc.width + i) * 4;
        img.data[o] = Math.max(0, Math.min(255, col[0] + k));
        img.data[o + 1] = Math.max(0, Math.min(255, col[1] + k));
        img.data[o + 2] = Math.max(0, Math.min(255, col[2] + k * 0.8));
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  // --- 2) ŞEHİR katmanı (3 px/m) ---------------------------------------------------------
  const CS = 3;
  const CB = { x0: -215, x1: 220, z0: -200, z1: 200 };
  const cc = canvas((CB.x1 - CB.x0) * CS, (CB.z1 - CB.z0) * CS);
  const cityLots = [...city.lots.filter((l) => !l.kit.__cut), ...cityExtraLots];
  {
    const g = cc.getContext('2d');
    g.setTransform(CS, 0, 0, CS, -CB.x0 * CS, -CB.z0 * CS);
    // deniz (güney + batı) + kumsal + rıhtım
    g.fillStyle = PAL.water;
    g.fillRect(CB.x0, 105.5, CB.x1 - CB.x0, CB.z1 - 105.5);
    const shore = [];
    for (let z = CB.z0; z <= 106; z += 2) shore.push([shoreX(z), z]);
    g.beginPath();
    g.moveTo(CB.x0, CB.z0);
    shore.forEach(([x, z]) => g.lineTo(x, z));
    g.lineTo(CB.x0, 106);
    g.closePath();
    g.fill();
    g.fillStyle = PAL.sand;
    g.beginPath();
    shore.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.lineTo(KORDON_X, 106);
    g.lineTo(KORDON_X, CB.z0);
    g.closePath();
    g.fill();
    g.fillStyle = PAL.block;
    g.fillRect(KORDON_X, OUTER.z0, COAST_X - KORDON_X, COAST_Z - OUTER.z0);
    // iskeleler, marina, mendirek
    DECKS.forEach((d) => {
      g.fillStyle = d.name === 'mendirek' ? '#c9c3b6' : '#d8bd93';
      g.fillRect(d.x0, d.z0, d.x1 - d.x0, d.z1 - d.z0);
    });
    const liman = city.lots.find((l) => l.type === 'liman');
    g.fillStyle = '#d9d5cb';
    g.fillRect(liman.mx - liman.bw / 2, 104, liman.bw, 18);
    g.fillStyle = '#c9c3b6';
    g.fillRect(liman.mx - liman.bw / 2, 104, liman.bw, 0.6);
    // yollar: asfalt alanı beyaz, üstüne bloklar
    g.fillStyle = PAL.road;
    g.fillRect(COAST_X, OUTER.z0, OUTER.x1 - COAST_X, COAST_Z + 2 - OUTER.z0);
    g.fillRect(OUTER.x1 - 2, -144, 18, 8); // otoyol ağzı
    // bloklar
    cityLots.forEach((l) => {
      const x0 = l.mx - l.bw / 2;
      const z0 = l.mz - l.bd / 2;
      g.fillStyle = PAL.blockEdge;
      g.fillRect(x0 - 0.6, z0 - 0.6, l.bw + 1.2, l.bd + 1.2);
      let f = PAL.block;
      if (l.type === 'park') f = PAL.park;
      if (l.type === 'stadyum') f = '#cfe5c0';
      if (l.type === 'pist') f = '#dedbd3';
      if (l.type === 'liman') f = '#dcd8cf';
      g.fillStyle = f;
      g.fillRect(x0, z0, l.bw, l.bd);
    });
    // özel alanlar
    cityLots.forEach((l) => {
      if (l.type === 'park') {
        g.strokeStyle = PAL.parkPath;
        g.lineWidth = 2.2;
        g.beginPath();
        g.ellipse(l.mx, l.mz, l.bw * 0.32, l.bd * 0.3, 0, 0, PI * 2);
        g.moveTo(l.mx - l.bw / 2, l.mz);
        g.lineTo(l.mx + l.bw / 2, l.mz);
        g.moveTo(l.mx, l.mz - l.bd / 2);
        g.lineTo(l.mx, l.mz + l.bd / 2);
        g.stroke();
        g.fillStyle = PAL.water;
        g.beginPath();
        g.ellipse(l.mx - l.bw * 0.22, l.mz + 2, 6, 4, 0, 0, PI * 2);
        g.fill();
      } else if (l.type === 'stadyum') {
        g.fillStyle = '#bdb6a8';
        g.beginPath();
        g.ellipse(l.mx, l.mz, l.bw * 0.46, l.bd * 0.44, 0, 0, PI * 2);
        g.fill();
        g.fillStyle = '#7cc46a';
        g.fillRect(l.mx - l.bw * 0.27, l.mz - l.bd * 0.2, l.bw * 0.54, l.bd * 0.4);
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 0.5;
        g.strokeRect(l.mx - l.bw * 0.25, l.mz - l.bd * 0.18, l.bw * 0.5, l.bd * 0.36);
        g.beginPath();
        g.moveTo(l.mx, l.mz - l.bd * 0.18);
        g.lineTo(l.mx, l.mz + l.bd * 0.18);
        g.stroke();
        g.beginPath();
        g.arc(l.mx, l.mz, 4, 0, PI * 2);
        g.stroke();
      } else if (l.type === 'pist') {
        g.strokeStyle = '#9a958a';
        g.lineWidth = 4;
        g.beginPath();
        g.roundRect(l.mx - l.bw * 0.42, l.mz - l.bd * 0.3, l.bw * 0.84, l.bd * 0.6, 8);
        g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 0.4;
        g.setLineDash([2, 2]);
        g.stroke();
        g.setLineDash([]);
      }
    });
    // bina tabanları (sadece büyük katılar: bina gövdeleri)
    const lotOf = (x, z) => cityLots.find((l) => Math.abs(x - l.mx) < l.bw / 2 && Math.abs(z - l.mz) < l.bd / 2);
    for (let i = 0; i < citySolidCount; i++) {
      const s = solids[i];
      if (s.ell || s.car) continue;
      if (s.item && Math.min(s.hw, s.hd) < 1.4) continue;
      if (Math.max(s.hw, s.hd) < 1.6 || Math.min(s.hw, s.hd) < 0.5) continue;
      const l = lotOf(s.x, s.z);
      if (l && (l.type === 'park' || l.type === 'pist' || l.type === 'stadyum')) continue;
      g.fillStyle = (l && TYPE_COL[l.type]) || PAL.bld;
      g.strokeStyle = PAL.bldEdge;
      g.lineWidth = 0.35;
      rrect(g, s.x, s.z, s.hw, s.hd, s.yaw);
      g.fill();
      g.stroke();
    }
    // girilebilir mekânlar (ince duvar katıları yerine bina tabanı)
    extraBld.forEach((b) => {
      g.fillStyle = TYPE_COL[b.type] || PAL.bld;
      g.strokeStyle = PAL.bldEdge;
      g.lineWidth = 0.35;
      rrect(g, b.x, b.z, b.hw, b.hd, b.yaw || 0);
      g.fill();
      g.stroke();
    });
    // konteynerler (liman)
    const lm = liman;
    const cols = ['#d0563a', '#2f7ab8', '#3a9a5a', '#e0a33a', '#8a4ab0'];
    for (let k = 0; k < 14; k++) {
      g.fillStyle = cols[k % 5];
      g.fillRect(lm.mx - lm.bw / 2 + 4 + (k % 7) * 9, 108 + Math.floor(k / 7) * 4, 7.5, 2.6);
    }
    // şerit çizgileri (kesikli, açık)
    g.strokeStyle = '#e4dfd3';
    g.lineWidth = 0.35;
    g.setLineDash([2.2, 2.8]);
    for (let k = -2; k <= 5; k++) {
      const z = -80 + 40 * k - 20;
      g.beginPath();
      g.moveTo(COAST_X + 4, z);
      g.lineTo(OUTER.x1 - 4, z);
      g.stroke();
    }
    for (let k = 0; k <= 8; k++) {
      const x = -100 + 40 * k - 20;
      g.beginPath();
      g.moveTo(x, OUTER.z0 + 4);
      g.lineTo(x, 102);
      g.stroke();
    }
    g.setLineDash([]);
    // bloklar yol çizgilerini örtsün diye blok kenarlarını tekrar çiz (çizgiler sadece yolda)
    cityLots.forEach((l) => {
      g.strokeStyle = PAL.blockEdge;
      g.lineWidth = 0.6;
      g.strokeRect(l.mx - l.bw / 2, l.mz - l.bd / 2, l.bw, l.bd);
    });
  }

  // --- 3) KASABA katmanı (dünyaya hizalı, 3 px/m) ----------------------------------------
  const corners = [[-TOWN.half - 6, TOWN.zf - 6], [TOWN.half + 6, TOWN.zf - 6], [TOWN.half + 6, TOWN.zb + 6], [-TOWN.half - 6, TOWN.zb + 6]].map(([a, b]) => fromTown(a, b));
  const TB = { x0: Math.min(...corners.map((p) => p.x)) - 4, x1: Math.max(...corners.map((p) => p.x)) + 4, z0: Math.min(...corners.map((p) => p.z)) - 4, z1: Math.max(...corners.map((p) => p.z)) + 4 };
  const tc = canvas((TB.x1 - TB.x0) * CS, (TB.z1 - TB.z0) * CS);
  {
    const g = tc.getContext('2d');
    g.setTransform(CS, 0, 0, CS, -TB.x0 * CS, -TB.z0 * CS);
    const poly = (pts) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
      g.closePath();
    };
    const rectL = (x0, x1, z0, z1) => poly([fromTown(x0, z0), fromTown(x1, z0), fromTown(x1, z1), fromTown(x0, z1)]);
    rectL(-TOWN.half - 4, TOWN.half + 4, TOWN.zf - 4, TOWN.zb + 4);
    g.fillStyle = PAL.road;
    g.fill();
    g.strokeStyle = PAL.roadEdge;
    g.lineWidth = 0.8;
    g.stroke();
    town.lots.forEach((l) => {
      rectL(l.x0, l.x1, l.z0, l.z1);
      g.fillStyle = l.name === 'tirparki' ? '#dcdad3' : PAL.block;
      g.fill();
      g.strokeStyle = PAL.blockEdge;
      g.lineWidth = 0.6;
      g.stroke();
    });
    const c0 = fromTown(0, 0);
    g.fillStyle = PAL.park;
    g.beginPath();
    g.arc(c0.x, c0.z, 7.6, 0, PI * 2);
    g.fill();
    for (let i = citySolidCount; i < solids.length; i++) {
      const s = solids[i];
      if (s.ell || s.car) continue;
      if (s.item && Math.min(s.hw, s.hd) < 1.4) continue;
      if (Math.max(s.hw, s.hd) < 1.6 || Math.min(s.hw, s.hd) < 0.5) continue;
      if (Math.hypot(s.x - c0.x, s.z - c0.z) < 9) continue;
      g.fillStyle = PAL.bld;
      g.strokeStyle = PAL.bldEdge;
      g.lineWidth = 0.35;
      rrect(g, s.x, s.z, s.hw, s.hd, s.yaw);
      g.fill();
      g.stroke();
    }
  }

  // --- 4) otoyol çizgisi ------------------------------------------------------------------
  const hwy = [];
  for (let i = 0; i <= R.n; i += 3) hwy.push([R.xs[i], R.zs[i]]);
  hwy.push([R.xs[R.n], R.zs[R.n]]);
  const tunnel = [];
  for (let s = TAGS.tunelA; s <= TAGS.tunelB; s += 6) {
    const f = frameAt(s);
    tunnel.push([f.x, f.z]);
  }

  // --- 5) ikonlar ---------------------------------------------------------------------------
  const pois = [];
  city.lots.forEach((l) => {
    const d = lotTypes[l.type];
    if (!d || l.kit.__cut) return;
    let p = { x: l.mx, z: l.mz };
    if (l.info?.door && l.kit.group.parent) {
      const v = l.kit.group.localToWorld(l.kit.group.position.clone().set(l.info.door.x, 0, l.info.door.z));
      p = { x: v.x, z: v.z };
    }
    pois.push({ ...p, type: l.type, glyph: GLYPH_OF[l.type], icon: d.icon, name: d.name, color: ICON_COL[l.type] || '#555', big: ['stadyum', 'park', 'liman', 'belediye', 'banka'].includes(l.type) });
  });
  vendors.forEach((v) => pois.push({ ...v, small: true, glyph: 'fork', color: '#e07a1f' }));
  town.pois.forEach((p) => pois.push(p));
  pois.push({ ...frameAt(TAGS.gise), type: 'gise', glyph: 'toll', icon: '🚧', name: 'Gişeler', color: '#1f6fd0' });
  pois.push({ ...frameAt(LEN - 46), type: 'gise', glyph: 'toll', icon: '🚧', name: 'Kervankent Gişeleri', color: '#1f6fd0' });
  const RS_COL = { cete: '#6a1a1a', piknik: '#2f7a3a', benzin: '#2f9e5a', polis: '#1d3f8a', karpuz: '#2f8f4a', seyir: '#2a7ab8', dinlenme: '#a8682a', cep: '#1d4f9a', bal: '#c2862a', kantar: '#5a5f68', misir: '#c8501a', koy: '#6b8f2a' };
  const GL_OF = { fuel: 'fuel', police: 'police', melon: 'fork', view: 'eye', rest: 'cup', parking: 'parking', honey: 'fork', scale: 'scale', corn: 'fork', village: 'house', skull: 'target' };
  let rsDraw = null;
  if (roadside) {
    roadside.pads.forEach((pd) => {
      const big = pd.kind === 'koy' || pd.kind === 'dinlenme' || pd.kind === 'benzin';
      pois.push({ x: pd.mx, z: pd.mz, type: `rs_${pd.key}`, rs: pd.key, glyph: GL_OF[pd.glyph] || 'house', name: pd.name, color: RS_COL[pd.kind] || '#555', big, small: pd.kind === 'cep' });
    });
    rsDraw = {
      branches: roadside.branches.map((b) => b.pts),
      pads: roadside.pads.map((pd) => ({ village: Boolean(pd.village), poly: [[pd.road ? 4.5 : pd.x0, pd.z0], [pd.x1, pd.z0], [pd.x1, pd.z1], [pd.road ? 4.5 : pd.x0, pd.z1]].map(([a, b]) => { const w = fromPad(pd, a, b); return [w.x, w.z]; }) })),
      bld: (roadside.solids || []).filter((q) => !q.ell && !q.car && !q.item && Math.max(q.hw, q.hd) > 1.6 && Math.min(q.hw, q.hd) > 0.8),
    };
  }
  if (park) park.pois.forEach((q) => pois.push({ ...q, type: `park_${q.key}` }));
  BEACH_POIS.forEach((b) => pois.push({ ...b, type: `plaj_${b.key}`, glyph: GLYPH_OF[b.glyph] || b.glyph, color: b.key === 'marina' || b.key === 'yatkulubu' ? '#1d6fa8' : '#e07a1f', big: b.key === 'neon_plaji' || b.key === 'marina' }));
  // yer adları
  const places = [
    { x: 0, z: -40, name: 'NEON ŞEHİR', cls: 'city', min: 0, max: 1.2 },
    { ...fromTown(0, 10), name: 'KERVANKENT', cls: 'city', min: 0, max: 1.4 },
    { x: LAKE.x, z: LAKE.z, name: 'Kuğu Gölü', cls: 'water' },
    { x: RIVER.x + RIVER.nz * 220, z: RIVER.z - RIVER.nx * 220, name: 'Akçay', cls: 'water' },
    { ...(() => { const f = frameAt((TAGS.tunelA + TAGS.tunelB) / 2); return { x: f.x + 260, z: f.z + 40 }; })(), name: '▲ Kartal Dağı', cls: 'peak' },
    { ...frameAt((TAGS.tunelA + TAGS.tunelB) / 2), name: 'Kartal Tüneli', cls: 'poi', min: 0.25 },
    { ...frameAt((TAGS.kopruA + TAGS.kopruB) / 2), name: 'Akçay Köprüsü', cls: 'poi', min: 0.25 },
    { x: -175, z: -40, name: 'Batı Denizi', cls: 'water', min: 0.3 },
  ];
  if (roadside) places.push(...roadside.pads.filter((pd) => pd.village).map((pd) => ({ x: pd.mx, z: pd.mz - 64, name: pd.name, cls: 'poi', min: 0.15 })));

  // --- ÇİZİM ----------------------------------------------------------------------------------
  // view: { cx, cz, k (px/m, CSS px), rot (rad), dpr, ox, oy (ekran merkezi, CSS px) }
  let lastScr = [];
  function pick(view, W, H, sx, sy) {
    void view;
    void W;
    void H;
    let best = null;
    let bd = 22 * (view.dpr || 1);
    lastScr.forEach(([p, x, y]) => {
      const d = Math.hypot(x - sx, y - sy);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    return best;
  }
  function draw(g, W, H, view, { truck, target, path, labels = false, streets = false, icons = true, parked = null, walker = false } = {}) {
    if (labels) lastScr = [];
    const { cx, cz, k, rot, dpr } = view;
    const ox = view.ox ?? W / 2 / dpr;
    const oy = view.oy ?? H / 2 / dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PAL.land;
    g.fillRect(0, 0, W, H);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(ox, oy);
    g.rotate(rot);
    g.scale(k, k);
    g.translate(-cx, -cz);
    g.imageSmoothingEnabled = true;
    g.drawImage(wc, T.x0, T.z0, wc.width / WS, wc.height / WS);
    // şehir çevresi (kentsel zemin) + katman
    g.fillStyle = PAL.urban;
    g.fillRect(COAST_X - 1, OUTER.z0 - 2, OUTER.x1 - COAST_X + 3, COAST_Z + 2 - OUTER.z0 + 2);
    g.drawImage(cc, CB.x0, CB.z0, cc.width / CS, cc.height / CS);
    g.drawImage(tc, TB.x0, TB.z0, tc.width / CS, tc.height / CS);
    // otoyol (piksel kalınlığı sabit)
    const line = (pts, w, col, dash) => {
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
      g.lineWidth = w / k;
      g.strokeStyle = col;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      if (dash) g.setLineDash(dash.map((d) => d / k));
      g.stroke();
      if (dash) g.setLineDash([]);
    };
    const hw = Math.max(5, Math.min(14, 11 * k));
    line(hwy, hw + 2.5, PAL.hwyEdge);
    line(hwy, hw, PAL.hwy);
    line(tunnel, hw + 3, '#9a9488');
    line(tunnel, hw - 1, '#d9d4c8', [6, 4]);
    // köprü
    const kb = [];
    for (let s = TAGS.kopruA; s <= TAGS.kopruB; s += 8) {
      const f = frameAt(s);
      kb.push([f.x, f.z]);
    }
    line(kb, hw + 5, '#6b6f78');
    line(kb, hw, PAL.hwy);
    // Neon Kent Ormanı: orman zemini, yürüyüş yolları, gölet
    if (park && k > 0.2) {
      g.fillStyle = 'rgba(120,170,100,0.35)';
      g.fillRect(PARK.x0 + 6, PARK.z0, PARK.x1 - PARK.x0 - 6, PARK.z1 - PARK.z0 - 1);
      PARK_PATHS.forEach((pl) => {
        line(pl, Math.max(2.5, 3 * k) + 1.5, '#b8a47c');
        line(pl, Math.max(2.5, 3 * k), '#f4ecd6');
      });
      g.fillStyle = PAL.water;
      g.beginPath();
      g.ellipse(POND.x, POND.z, POND.rx, POND.rz, 0, 0, PI * 2);
      g.fill();
    }
    // yol üstü: cepler, köyler, köy yolları
    if (rsDraw && k > 0.12) {
      rsDraw.branches.forEach((b) => {
        line(b, Math.max(3, hw * 0.6) + 2, PAL.roadEdge);
        line(b, Math.max(3, hw * 0.6), '#ffffff');
      });
      rsDraw.pads.forEach((pd) => {
        g.beginPath();
        pd.poly.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
        g.closePath();
        g.fillStyle = pd.village ? '#e3ebcf' : '#e3dfd5';
        g.fill();
        g.lineWidth = 0.8 / k;
        g.strokeStyle = pd.village ? '#c7d3b0' : '#cfc8ba';
        g.stroke();
      });
      if (k > 0.5) rsDraw.bld.forEach((b) => {
        g.fillStyle = PAL.bld;
        g.strokeStyle = PAL.bldEdge;
        g.lineWidth = 0.35;
        rrect(g, b.x, b.z, b.hw, b.hd, b.yaw);
        g.fill();
        g.stroke();
      });
    }
    // rota (GPS)
    if (path && path.length > 1) {
      line(path, Math.max(6, hw * 0.7) + 3, '#ffffff');
      line(path, Math.max(6, hw * 0.7), PAL.route);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // dünya → ekran
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const scr = (x, z) => {
      const dx = (x - cx) * k;
      const dz = (z - cz) * k;
      return [(ox + dx * c - dz * s) * dpr, (oy + dx * s + dz * c) * dpr];
    };
    const inView = ([x, y], m = 20) => x > -m && y > -m && x < W + m && y < H + m;
    // sokak adları (büyük haritada, yeterince yakınken)
    if (streets && k > 1.1) {
      g.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const put = (x, z, txt, horiz) => {
        const p = scr(x, z);
        if (!inView(p, -10)) return;
        g.save();
        g.translate(p[0], p[1]);
        let a = rot + (horiz ? 0 : PI / 2);
        while (a > PI / 2) a -= PI;
        while (a < -PI / 2) a += PI;
        g.rotate(a);
        g.lineWidth = 3 * dpr;
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.strokeText(txt, 0, 0);
        g.fillStyle = '#6a6458';
        g.fillText(txt, 0, 0);
        g.restore();
      };
      STREETS_X.forEach(([z, n], i) => put(i % 2 ? -60 : 60, z, n, true));
      STREETS_Z.forEach(([x, n], i) => put(x, i % 2 ? -80 : 0 + (i % 3) * 30 - 20, n, false));
    }
    // ikonlar
    if (icons) {
      const R0 = (labels ? 11 : 9) * dpr;
      pois.forEach((p) => {
        if (k < 0.45) return; // bölge ölçeğinde sadece yer adları
        if (p.small && k < 0.9) return;
        if (!p.big && !labels && k < 0.7) return;
        const q = scr(p.x, p.z);
        if (!inView(q)) return;
        const r = p.small ? R0 * 0.8 : R0;
        if (labels && p.type !== 'gise') lastScr.push([p, q[0], q[1]]);
        drawPin(g, q[0], q[1], r, p.color, p.glyph, p.small);
        if (labels && k > 0.9) {
          g.font = `700 ${11 * dpr}px system-ui, sans-serif`;
          g.lineWidth = 3 * dpr;
          g.strokeStyle = 'rgba(255,255,255,0.95)';
          g.strokeText(p.name, q[0], q[1] + (p.small ? r + 9 * dpr : 9 * dpr));
          g.fillStyle = p.color;
          g.fillText(p.name, q[0], q[1] + (p.small ? r + 9 * dpr : 9 * dpr));
        }
      });
    }
    // yer adları
    if (labels) {
      places.forEach((p) => {
        if (p.min != null && k < p.min) return;
        if (p.max != null && k > p.max) return;
        const q = scr(p.x, p.z);
        if (!inView(q)) return;
        const big = p.cls === 'city';
        g.font = big ? `900 ${15 * dpr}px system-ui, sans-serif` : p.cls === 'water' ? `italic 600 ${12 * dpr}px Georgia, serif` : `700 ${11 * dpr}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = 3.5 * dpr;
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.strokeText(p.name, q[0], q[1]);
        g.fillStyle = p.cls === 'water' ? '#2a6fa8' : p.cls === 'peak' ? '#6a5a3a' : '#3a3530';
        g.fillText(p.name, q[0], q[1]);
      });
    }
    // hedef
    if (target) {
      let q = scr(target.x, target.z);
      const off = !inView(q, -14);
      if (off) q = [Math.max(16 * dpr, Math.min(W - 16 * dpr, q[0])), Math.max(16 * dpr, Math.min(H - 16 * dpr, q[1]))];
      g.save();
      g.translate(q[0], q[1]);
      g.fillStyle = '#e8336a';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2 * dpr;
      g.beginPath();
      const r = 8 * dpr;
      g.arc(0, -r * 1.3, r, PI * 0.85, PI * 0.15);
      g.lineTo(0, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(0, -r * 1.3, r * 0.4, 0, PI * 2);
      g.fill();
      g.restore();
    }
    // park edilmiş tır (yayayken)
    if (parked) {
      const q = scr(parked.x, parked.z);
      if (inView(q, 10)) drawPin(g, q[0], q[1], 9 * dpr, '#c8141e', 'truck', true);
    }
    // tır / yaya
    if (truck) {
      const q = scr(truck.x, truck.z);
      g.save();
      g.translate(q[0], q[1]);
      // dünyada ileri (sin yaw, cos yaw) → ekrandaki açı
      const fx = Math.sin(truck.yaw);
      const fz = Math.cos(truck.yaw);
      g.rotate(Math.atan2(fx * c - fz * s, -(fx * s + fz * c)));
      const a = 10 * dpr;
      g.shadowColor = 'rgba(0,0,0,0.35)';
      g.shadowBlur = 4 * dpr;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, a * 0.95, 0, PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = walker ? '#19a35a' : PAL.route;
      g.beginPath();
      g.moveTo(0, -a * 0.75);
      g.lineTo(a * 0.55, a * 0.55);
      g.lineTo(0, a * 0.25);
      g.lineTo(-a * 0.55, a * 0.55);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  return { draw, pick, pois, CB, TB };
}
