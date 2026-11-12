// =============================================================================
// KERVANKENT — otoyolun sonundaki küçük tırcı kasabası
// Yerel eksen: +x sağ, −z ileri (otoyoldan gelince). Ana cadde x=0, ara cadde z=0,
// ortada göbek (tır anıtı). Oyunun kendi yapı kitleri kullanıldı (lojistik deposu,
// benzinlik, camii, kule cepheleri, sokak lambaları…).
// =============================================================================
import * as THREE from 'three';
import { Kit, M, floorMat, floorRep, planeGeo, glowMat } from '../kit.js';
import * as B from '../buildings.js';
import * as J from '../jobBuildings.js';
import { buildVehicle } from '../vehicles.js';
import { TOWN, fromTown } from './route.js';
import { VENUE_BUILDERS } from './venues.js';

const ST = 9; // cadde yarı genişliği
const SIDE = 3;
const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

export function buildTown() {
  const root = new THREE.Group();
  root.name = 'kervankent';
  root.position.set(TOWN.x, TOWN.y, TOWN.z);
  root.rotation.y = TOWN.ry;
  const kits = [];
  const H = TOWN.half;
  const Z0 = TOWN.zf;
  const Z1 = TOWN.zb;

  // --- zemin ---------------------------------------------------------------------
  const ground = new Kit('kasaba_zemin');
  kits.push(ground);
  root.add(ground.group);
  const rep = floorRep('asfalt');
  const gw = H * 2 + 8;
  const gd = Z1 - Z0 + 8;
  ground.mesh(planeGeo(gw, gd, gw / rep, gd / rep), floorMat('asfalt'), 0, 0.02, (Z0 + Z1) / 2, 0, { cast: false, rx: -Math.PI / 2 });
  // kenar: alçak beton duvar (kasabanın sınırı) — giriş ağzı açık
  const wallM = M('#a8a294', 0.9);
  const wall = (w, d, x, z) => ground.box(w, 0.9, d, wallM, x, 0, z);
  wall(gw, 0.5, 0, Z0 - 3.8);
  wall(0.5, gd, -H - 3.8, (Z0 + Z1) / 2);
  wall(0.5, gd, H + 3.8, (Z0 + Z1) / 2);
  wall(H - ST + 4, 0.5, -(H + ST) / 2 - 2, Z1 + 3.8);
  wall(H - ST + 4, 0.5, (H + ST) / 2 + 2, Z1 + 3.8);
  // yol çizgileri
  const lineM = M('#e9e4d4', 0.7);
  for (let z = Z0 + 4; z < Z1 - 2; z += 5) if (Math.abs(z) > 16) ground.box(0.16, 0.02, 2.2, lineM, 0, 0.03, z, { cast: false });
  for (let x = -H + 4; x < H - 2; x += 5) if (Math.abs(x) > 16) ground.box(2.2, 0.02, 0.16, lineM, x, 0.03, 0, { cast: false });
  // göbek: çimen + tır anıtı
  const isl = ground.cyl(7.5, 7.8, 0.35, M('#8f8a80', 0.85), 0, 0, 0, 40);
  void isl;
  const grass = new THREE.Mesh(new THREE.CircleGeometry(7.3, 40), floorMat('cim'));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.36;
  grass.receiveShadow = true;
  ground.add(grass);
  ground.cyl(2.2, 2.6, 2.2, M('#d9d4c8', 0.7), 0, 0.35, 0, 24);
  ground.ellipse(0, 0, 7.85, 7.85); // yuvarlak göbek (kare kutu köşeleri görünmez çarpıyordu)
  const mon = buildVehicle(11, { paint: '#e8b923', trailer: 'tenteli', trailerColor: '#c8141e', company: 'KERVANKENT' });
  mon.root.scale.setScalar(0.42);
  mon.root.position.set(0, 2.55, 0);
  mon.root.rotation.y = 0.7;
  ground.add(mon.root);
  ground.sign('kk_anit', 'KERVANKENT', 0.55, 0, 1.4, 2.62, 0, { color: '#1a1a1a', bg: '#d9d4c8', font: '900 100px Arial, sans-serif', light: false });

  // --- parseller -----------------------------------------------------------------------
  const curbM = M('#8f8a80', 0.85);
  const kRep = floorRep('kaldirim');
  const lots = {};
  function lot(name, x0, x1, z0, z1, face, build) {
    const bw = x1 - x0;
    const bd = z1 - z0;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    ground.box(bw, 0.12, bd, curbM, mx, 0, mz, { cast: false });
    ground.mesh(planeGeo(bw, bd, bw / kRep, bd / kRep, x0 / kRep, z0 / kRep), floorMat('kaldirim'), mx, 0.121, mz, 0, { cast: false, rx: -Math.PI / 2 });
    const kit = new Kit(name);
    kits.push(kit);
    kit.group.position.set(mx, 0, mz);
    kit.group.rotation.y = FACE[face];
    root.add(kit.group);
    const rot = face === 'e' || face === 'w';
    const L = { w: (rot ? bd : bw) - SIDE * 2, d: (rot ? bw : bd) - SIDE * 2 };
    build(kit, L);
    // köşe lambaları
    for (const [px, pz] of [[-L.w / 2 - 1, L.d / 2 + 1.2], [L.w / 2 + 1, L.d / 2 + 1.2]]) kit.item('streetlamp', px, pz, 4, 0, { y: 0.12 });
    lots[name] = { kit, mx, mz, face, L, x0, x1, z0, z1, name };
    return lots[name];
  }

  // KK TERMİNALİ (teslim alanı) — ön yüzü ara caddeye bakar
  const term = lot('terminal', ST, H, Z0, -ST, 's', (kit, L) => {
    J.buildLojistik(kit, L, { name: 'KERVANKENT TERMİNALİ', accent: '#ffb15a' });
    // yan depolar
    for (const sx of [-1, 1]) {
      const x = sx * 25;
      const bz = -L.d / 2 + 6;
      kit.wallBox('beton_blok', 20, 7, 10, x, 0, bz, { tint: sx < 0 ? '#9aa6b4' : '#b4a68f' });
      kit.box(20.6, 0.5, 10.6, M('#3a4048', 0.6, 0.4), x, 7, bz);
      kit.item('garagedoor', x - 4, bz + 5, 0, 0, { solid: false });
      kit.item('garagedoor', x + 4, bz + 5, 0, 0, { solid: false });
      kit.mass(20, 7.4, 10, x, bz);
    }
    for (let k = 0; k < 3; k++) {
      kit.item('container', L.w / 2 - 2.8, -L.d / 2 + 16 + k * 2.6, 2, k);
      kit.item('container', L.w / 2 - 2.8, -L.d / 2 + 16 + k * 2.6, 2, k + 3, { y: 1.77, solid: false });
    }
  });

  // BENZİNLİK + TIR PARKI
  lot('benzinlik', -50, -ST, Z0, -ST, 's', (kit, L) => J.buildBenzinlik(kit, L));
  const park = lot('tirparki', -H, -50, Z0, -ST, 'e', (kit, L) => {
    kit.floor('otopark', L.w, L.d, 0, 0);
    kit.sign('tirparki', 'TIR PARKI', 0.9, 0, 5.4, -L.d / 2 + 0.6, 0, { color: '#ffffff', bg: '#1d4fa8', font: '900 100px Arial, sans-serif', light: false });
    const pm = M('#2a2d33', 0.6, 0.5);
    kit.box(0.2, 5, 0.2, pm, -2.4, 0, -L.d / 2 + 0.5);
    kit.box(0.2, 5, 0.2, pm, 2.4, 0, -L.d / 2 + 0.5);
  });
  // park yeri çizgileri + park etmiş tırlar (dünya grubu: dönmeden kolay yerleşim)
  {
    const yel = M('#e8b923', 0.6);
    const x0 = -H + 3;
    const x1 = -50 - 3;
    for (let i = 0; i < 5; i++) {
      const z = Z0 + 6 + i * 11.5;
      ground.box(x1 - x0 - 2, 0.02, 0.22, yel, (x0 + x1) / 2, 0.14, z, { cast: false });
    }
    const types = [['tanker', '#d8dade', '#1d4fa8'], ['tenteli', '#2f8f4a', '#f4f4f2'], ['frigo', '#f4f4f2', '#2a2d33']];
    types.forEach(([tr, tc, paint], i) => {
      const v = buildVehicle(11, { trailer: tr, trailerColor: tc, paint, company: ['ANADOLU NAKLİYAT', 'YEŞİL YOL', 'SOĞUK ZİNCİR'][i] });
      const z = Z0 + 11.75 + i * 11.5;
      // çekici sokağa bakar, dorse parselin içinde (eskiden ters dönüktü: dorse sokağa taşıyor,
      // çarpışma kutusu ise boş zeminde duruyordu)
      v.root.position.set(-56, 0.12, z);
      v.root.rotation.y = Math.PI / 2;
      ground.add(v.root);
      const back = v.trailer ? v.trailer.length : 0;
      const front = (v.len || 6) / 2;
      ground.solid(-56 + (front - back) / 2, z, (front + back) / 2 + 0.2, (v.halfW || 1.25) + 0.15);
    });
  }

  // TIRCI LOKANTASI
  lot('lokanta', ST, 52, ST, 46, 'n', (kit, L) => {
    kit.floor('beton', L.w, L.d, 0, 0);
    B.tower(kit, { w: 24, d: 11, h: 5.4, x: 0, z: -L.d / 2 + 7, style: 'krem', crown: '#ffb15a' });
    B.shopfront(kit, { x: 0, z: -L.d / 2 + 12.6, w: 14, text: 'TIRCI LOKANTASI', color: '#ffcf7a', awn: '#7a1f2b' });
    kit.sign('lokanta_neon', 'LOKANTA 24 SAAT', 1.1, 0, 7.2, -L.d / 2 + 12.4, 0, { color: '#ffffff', glow: '#ff6a3a', font: '900 104px Arial, sans-serif', li: 6, ld: 12 });
    for (const x of [-7, 0, 7]) kit.item('parkbench', x, 4, 0, 0);
    kit.item('trash', L.w / 2 - 1, L.d / 2 - 1, 0, 0);
  });
  // MOTEL
  lot('motel', 52, H, ST, 62, 'n', (kit, L) => {
    kit.floor('kaldirim', L.w, L.d, 0, 0);
    B.tower(kit, { w: 26, d: 12, h: 8.4, x: 0, z: -L.d / 2 + 9, style: 'somon', crown: '#ff3fa0' });
    kit.sign('motel_neon', 'KERVAN MOTEL', 1.3, 0, 10.4, -L.d / 2 + 15.2, 0, { color: '#ffffff', glow: '#ff3fa0', font: '900 104px Arial, sans-serif', li: 7, ld: 14 });
    kit.item('palm', -10, 6, 0, 0);
    kit.item('palm', 10, 6, 0, 0);
  });
  // KÖY CAMİİ
  lot('camii', -52, -ST, ST, 50, 'n', (kit, L) => B.buildCamii(kit, L));
  // evler / dükkânlar (alçak)
  lot('ev1', ST, 52, 52, Z1, 'w', (kit, L) => B.buildFiller(kit, L, 4401, { tall: 0.34 }));
  lot('ev2', 52, H, 68, Z1, 'n', (kit, L) => B.buildFiller(kit, L, 4402, { tall: 0.3 }));
  lot('ev3', -H, -52, ST, 50, 'n', (kit, L) => B.buildFiller(kit, L, 4403, { tall: 0.32 }));
  // KERVANKENT OTOGARI (eski ev4 + ev5): içi gezilebilir, ön yüzü ana caddeye (doğu) bakar
  const otogar = (() => {
    const x0 = -H;
    const x1 = -ST;
    const z0 = 56;
    const z1 = Z1;
    const bw = x1 - x0;
    const bd = z1 - z0;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    ground.box(bw, 0.12, bd, curbM, mx, 0, mz, { cast: false });
    ground.mesh(planeGeo(bw, bd, bw / kRep, bd / kRep, x0 / kRep, z0 / kRep), floorMat('kaldirim'), mx, 0.121, mz, 0, { cast: false, rx: -Math.PI / 2 });
    const v = VENUE_BUILDERS.otogar_kk({ w: bd - SIDE * 2, d: bw - SIDE * 2 });
    v.rebuild = () => VENUE_BUILDERS.otogar_kk({ w: bd - SIDE * 2, d: bw - SIDE * 2 }); // v157.2: iç mekân yeniden kurulumu
    v.root.position.set(mx, 0, mz);
    v.root.rotation.y = FACE.e;
    v.townFace = FACE.e;
    root.add(v.root);
    kits.push(...v.kits);
    lots.otogar = { kit: v.base, mx, mz, face: 'e', L: { w: bd - 6, d: bw - 6 }, x0, x1, z0, z1, name: 'otogar' };
    return v;
  })();

  // teslim alanı (dünya): terminal parselinde lot önünden 6 m içeride
  const bayLocal = { x: term.mx, z: term.mz + term.L.d / 2 - 6 };
  const bay = { ...fromTown(bayLocal.x, bayLocal.z), r: 6.5, name: 'Kervankent Terminali' };
  void park;
  const P = (lx, lz) => fromTown(lx, lz);
  const pois = [
    { ...P(term.mx, term.mz + term.L.d / 2 - 6), glyph: 'box', icon: '📦', name: 'Kervankent Terminali', color: '#e8890c' },
    { ...P(-29.5, -20), glyph: 'fuel', icon: '⛽', name: 'Benzinlik', color: '#2f9e5a' },
    { ...P(-69, -40), glyph: 'parking', icon: '🅿️', name: 'Tır Parkı', color: '#1d4fa8' },
    { ...P(30.5, 18), glyph: 'fork', icon: '🍽️', name: 'Tırcı Lokantası', color: '#d2553a' },
    { ...P(70, 22), glyph: 'bed', icon: '🛏️', name: 'Kervan Motel', color: '#c2407a' },
    { ...P(-30.5, 20), glyph: 'mosque', icon: '🕌', name: 'Camii', color: '#2d8a7a' },
    { ...P(-30, 75.5), glyph: 'bus', icon: '🚌', name: 'Kervankent Otogarı', color: '#c8141e' },
  ];
  return { root, kits, bay, lots: Object.values(lots), pois, H, Z0, Z1, ST, otogar };
}
