// =============================================================================
// SADECE ÖNİZLEME — Neon Şehir binaları (dış cepheler).
// Her bina haritadaki görüntüsüne ve oyundaki iç mekânına benzesin diye
// iç mekânın duvar/zemin kaplaması ve kapı eşyası dışarıda da kullanılır
// (ör. Camii: mermer kaplama + ahşap kapı; Silahçı: tuğla + metal kapı).
// Yerel koordinat: önü +z. lot = { w, d } parsel iç ölçüsü.
// =============================================================================
import { THREE, M, boxGeo, planeGeo, facadeMat, FACADE_TILE, glowMat, basicGlow, GLASS, canvasTex, rng, hash, roundRect } from './kit.js';

const PI = Math.PI;

// --- ortak parçalar -----------------------------------------------------------
// Pencereli kule: 4 yan düzlem (UV ölçekli, paylaşılan cephe malzemesi) + çatı
export function tower(kit, { w, d, h, x = 0, z = 0, style = 'apt_warm', roof = '#16181f', crown = null, seed = 0, base = null }) {
  const mat = facadeMat(style);
  const ou = (seed % 8) / 8;
  const ov = ((seed * 3) % 8) / 8;
  const sides = [
    [w, 0, d / 2, 0],
    [w, 0, -d / 2, PI],
    [d, w / 2, 0, PI / 2],
    [d, -w / 2, 0, -PI / 2],
  ];
  const y0 = base ? base.h : 0;
  const hh = h - y0;
  sides.forEach(([sw, sx, sz, ry]) => {
    const g = planeGeo(sw, hh, sw / FACADE_TILE.w, hh / FACADE_TILE.h, ou, ov);
    kit.mesh(g, mat, x + sx, y0 + hh / 2, z + sz, ry, { cast: false });
  });
  // gölge için içi dolu gövde (görünmez değil: koyu, yanlardan biraz içeride)
  kit.box(w - 0.08, h, d - 0.08, M('#121319', 0.9), x, 0, z, { receive: false });
  kit.box(w + 0.3, 0.5, d + 0.3, M(roof, 0.85), x, h, z); // korkuluk / parapet
  kit.box(w - 0.6, 0.12, d - 0.6, M('#1d2028', 0.95), x, h + 0.02, z, { cast: false });
  const r = rng(hash(`roof${x},${z},${seed}`));
  // çatı ayrıntıları: klima, su deposu
  for (let i = 0; i < 3; i++) {
    const ax = x + (r() - 0.5) * (w - 3);
    const az = z + (r() - 0.5) * (d - 3);
    kit.box(1.2, 0.9, 0.9, M('#3a3e47', 0.6, 0.4), ax, h + 0.1, az, { cast: true });
  }
  if (r() < 0.5) {
    kit.cyl(0.9, 0.9, 1.6, M('#4a4f59', 0.6, 0.3), x + (r() - 0.5) * (w - 4), h + 1.4, z + (r() - 0.5) * (d - 4), 14);
    kit.box(0.1, 1.4, 0.1, M('#2a2d33', 0.6, 0.5), x, h, z);
  }
  if (crown) {
    // tepe neon şeridi (haritadaki kulelerin ışıklı kenarları)
    const gm = glowMat(crown, 2.4);
    kit.box(w + 0.34, 0.12, 0.12, gm, x, h + 0.5, z + d / 2 + 0.15, { cast: false });
    kit.box(w + 0.34, 0.12, 0.12, gm, x, h + 0.5, z - d / 2 - 0.15, { cast: false });
    kit.box(0.12, 0.12, d + 0.34, gm, x + w / 2 + 0.15, h + 0.5, z, { cast: false });
    kit.box(0.12, 0.12, d + 0.34, gm, x - w / 2 - 0.15, h + 0.5, z, { cast: false });
  }
  kit.mass(w, h, d, x, z);
  return { top: h };
}

// Zemin kat dükkânı (vitrin + tabela + tente) — kulelerin altını canlandırır
export function shopfront(kit, { x, z, w, ry = 0, text, color = '#ffd38a', awn = '#7a1f2b' }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  kit.add(g);
  const add = (geo, mat, px, py, pz, cast = false) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(px, py, pz);
    o.castShadow = cast;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  add(boxGeo(w, 3.2, 0.25), M('#17181d', 0.7), 0, 1.6, 0.05);
  add(new THREE.PlaneGeometry(w - 0.8, 2.3), glowMat(color, 0.55), 0, 1.35, 0.19);
  add(boxGeo(w, 0.18, 1.3), M(awn, 0.7), 0, 3.05, 0.75, true);
  const tex = textCanvas(text, color);
  const sw = Math.min(w - 0.6, 0.62 * tex.userData.aspect);
  add(new THREE.PlaneGeometry(sw, 0.62), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }), 0, 3.55, 0.25);
  const o = new THREE.Object3D();
  o.position.set(0, 2.6, 1.6);
  g.add(o);
  kit.lights.push({ o, x: 0, y: 0, z: 0, color, intensity: 4, distance: 7 });
  kit.pool(x + Math.sin(ry) * 2.2, z + Math.cos(ry) * 2.2, color, 5, 0.17, 0.35);
}
const tcache = new Map();
function textCanvas(text, color) {
  const k = `${text}|${color}`;
  if (tcache.has(k)) return tcache.get(k);
  const c0 = document.createElement('canvas').getContext('2d');
  const font = '900 92px "Arial Black", Arial, sans-serif';
  c0.font = font;
  const tw = Math.ceil(c0.measureText(text).width) + 70;
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = 140;
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.fillStyle = color;
  g.fillText(text, tw / 2, 74);
  g.shadowBlur = 0;
  g.fillStyle = '#fff';
  g.globalAlpha = 0.85;
  g.fillText(text, tw / 2, 74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.aspect = tw / 140;
  tcache.set(k, t);
  return t;
}

// kenar neon şeridi (dikdörtgenin çevresi)
function neonFrame(kit, w, h, x, y, z, color, ry = 0, t = 0.1) {
  const gm = glowMat(color, 2.6);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  kit.add(g);
  [[w, t, 0, h / 2], [w, t, 0, -h / 2], [t, h, w / 2, 0], [t, h, -w / 2, 0]].forEach(([a, b, px, py]) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(a, b, t), gm);
    o.position.set(px, py, 0);
    g.add(o);
  });
}

// Kemerli pencere (cami / belediye) — ışık saçan
function archWindow(kit, x, y, z, w, h, ry, color = '#ffcf7a', inten = 1.6) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, PI, 0, true);
  s.lineTo(w / 2, 0);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s, 12);
  const o = kit.mesh(geo, glowMat(color, inten), x, y, z, ry, { cast: false });
  return o;
}


// =============================================================================
// LANDMARK BİNALAR
// =============================================================================

// --- CAMİİ -------------------------------------------------------------------
export function buildCamii(kit, lot) {
  const { w, d } = lot;
  kit.floor('mermer_beyaz', w, d, 0, 0);
  const wallK = 'mermer_duvar';
  const lead = M('#7f8ea3', 0.35, 0.55);
  const gold = M('#d9a93c', 0.25, 1);
  const stone = M('#d8cdb6', 0.7);
  // ana gövde
  const bw = 15;
  const bd = 12;
  const bz = -d / 2 + bd / 2 + 1;
  kit.wallBox(wallK, bw, 7, bd, 0, 0, bz);
  kit.box(bw + 0.5, 0.45, bd + 0.5, stone, 0, 7, bz); // korniş
  // kemerli pencereler (iki sıra, sıcak ışık)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const zz = bz - bd / 2 + 2 + i * 2.7;
      archWindow(kit, side * (bw / 2 + 0.02), 1.4, zz, 1.1, 2.4, side * PI / 2);
      archWindow(kit, side * (bw / 2 + 0.02), 4.6, zz, 0.8, 1.6, side * PI / 2, '#ffd99a', 1.2);
    }
  }
  for (let i = 0; i < 5; i++) archWindow(kit, -6 + i * 3, 4.6, bz + bd / 2 + 0.02, 0.8, 1.6, 0, '#ffd99a', 1.2);
  // kasnak + ana kubbe
  kit.cyl(4.3, 4.5, 1.6, stone, 0, 7.4, bz, 32);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    archWindow(kit, Math.sin(a) * 4.42, 7.6, bz + Math.cos(a) * 4.42, 0.45, 1.0, a, '#ffe2a8', 1.6);
  }
  const dome = kit.mesh(new THREE.SphereGeometry(4.6, 40, 20, 0, PI * 2, 0, PI / 2), lead, 0, 9.0, bz);
  dome.scale.y = 0.92;
  kit.cyl(0.08, 0.12, 1.4, gold, 0, 13.2, bz, 8); // alem
  kit.mesh(new THREE.SphereGeometry(0.22, 12, 10), gold, 0, 14.0, bz);
  // yarım kubbeler
  for (const [px, pz, ry] of [[0, bz + bd / 2 - 1.2, 0], [0, bz - bd / 2 + 1.2, PI], [bw / 2 - 1.2, bz, PI / 2], [-bw / 2 + 1.2, bz, -PI / 2]]) {
    const hd = kit.mesh(new THREE.SphereGeometry(2.6, 24, 12, -PI / 2, PI, 0, PI / 2), lead, px, 7.3, pz, ry);
    hd.scale.y = 0.85;
  }
  // köşe küçük kubbeler
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.cyl(1.0, 1.0, 0.8, stone, sx * 5.6, 7.3, bz + sz * 4.3, 16);
      kit.mesh(new THREE.SphereGeometry(1.0, 16, 8, 0, PI * 2, 0, PI / 2), lead, sx * 5.6, 8.1, bz + sz * 4.3);
    }
  }
  // son cemaat yeri (revak): sütunlar + küçük kubbeler
  const pz = bz + bd / 2 + 1.6;
  kit.box(bw, 0.4, 3.2, stone, 0, 4.6, pz);
  for (let i = 0; i < 6; i++) {
    const px = -bw / 2 + 0.6 + i * ((bw - 1.2) / 5);
    kit.cyl(0.24, 0.28, 4.6, M('#efe8da', 0.4), px, 0, pz + 1.3, 14);
    kit.solid(px, pz + 1.3, 0.3, 0.3);
  }
  for (let i = 0; i < 5; i++) kit.mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, PI * 2, 0, PI / 2), lead, -6 + i * 3, 5.0, pz);
  // ışıklı kemer dizisi (revak içi)
  for (let i = 0; i < 5; i++) archWindow(kit, -6 + i * 3, 0.2, bz + bd / 2 + 0.03, 1.4, 3.2, 0, '#ffcf7a', 0.9);
  // kapı (oyundaki camiinin kapısı: Ahşap Kapı)
  kit.item('doordeco', 0, bz + bd / 2, 0, 0, { solid: false });
  // minareler (4)
  const mins = [[-w / 2 + 1.6, -d / 2 + 1.6], [w / 2 - 1.6, -d / 2 + 1.6], [-w / 2 + 1.6, pz + 1.2], [w / 2 - 1.6, pz + 1.2]];
  mins.forEach(([mx, mz], n) => {
    const H = n < 2 ? 21 : 18;
    kit.box(1.5, 2.2, 1.5, stone, mx, 0, mz);
    kit.cyl(0.5, 0.58, H, M('#ece5d5', 0.5), mx, 2.2, mz, 16);
    for (const sh of [H * 0.62, H * 0.86]) {
      kit.cyl(0.85, 0.6, 0.35, stone, mx, 2.2 + sh, mz, 16);
      const ring = kit.mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 24), glowMat('#ffd27a', 3), mx, 2.2 + sh + 0.45, mz, 0, { rx: PI / 2, cast: false });
      ring.castShadow = false;
    }
    kit.mesh(new THREE.ConeGeometry(0.62, 3.2, 16), lead, mx, 2.2 + H + 1.6, mz);
    kit.cyl(0.04, 0.05, 0.9, gold, mx, 2.2 + H + 3.1, mz, 6);
    kit.mass(1.6, 2.2 + H, 1.6, mx, mz);
    kit.light(mx, 2.2 + H * 0.86, mz, '#ffd27a', 5, 9);
  });
  // avlu: çiçeklik ve aydınlatma
  kit.item('ayakkabilik', 4.6, pz + 2.6, 0, 0);
  kit.item('plantb', -4.2, pz + 2.6);
  kit.item('plantb', 4.2 + 2.2, pz + 2.6);
  kit.item('streetlamp', -w / 2 + 1, d / 2 - 1.2, 0);
  kit.item('streetlamp', w / 2 - 1, d / 2 - 1.2, 4);
  // altın aydınlatma (yerden yukarı)
  for (const sx of [-1, 1]) kit.pool(sx * bw / 2, bz + bd / 2 + 0.5, '#ffbf5a', 7, 0.16, 0.6);
  kit.light(0, 5, bz + bd / 2 + 4, '#ffcf7a', 9, 16);
  kit.light(0, 12, bz, '#ffd99a', 6, 14);
  kit.mass(bw, 9, bd, 0, bz);
  kit.solid(0, pz, bw / 2, 0.4); // revak çatısının arkası (giriş ortadan)
  return { door: { x: 0, z: bz + bd / 2 + 1.0 }, mapLabel: { text: 'CAMİİ', y: 16, z: bz } };
}

// --- BANKA -------------------------------------------------------------------
export function buildBanka(kit, lot) {
  const { w, d } = lot;
  kit.floor('mermer_beyaz', w, d, 0, 0);
  const tw = 14;
  const td = 13;
  const tz = -1.5;
  const H = 46;
  // lobi (çift yükseklik, mermer kaplama + cam)
  kit.wallBox('mermer_duvar', tw, 6, td, 0, 0, tz);
  kit.mesh(new THREE.PlaneGeometry(tw - 2, 4.6), glowMat('#e7f6ff', 0.9), 0, 2.6, tz + td / 2 + 0.02, 0, { cast: false });
  for (let i = 0; i < 5; i++) kit.box(0.5, 6, 0.5, M('#f2efe8', 0.35), -tw / 2 + 1 + i * ((tw - 2) / 4), 0, tz + td / 2 + 0.4);
  // cam kule
  tower(kit, { w: tw - 0.6, d: td - 0.6, h: H, x: 0, z: tz, style: 'glass_cyan', crown: '#2bd2f5', seed: 3, base: { h: 6 } });
  // dikey kanatlar (fins)
  for (let i = 0; i < 7; i++) {
    const fx = -tw / 2 + 0.6 + i * ((tw - 1.2) / 6);
    kit.box(0.18, H - 6, 0.5, M('#2b3c4a', 0.3, 0.8), fx, 6, tz + td / 2 - 0.05, { cast: false });
  }
  // tepe tabela "BANKA" (oyunda Parara Bank)
  kit.sign('banka', 'BANKA', 3.2, 1.2, H - 4.5, tz + td / 2 + 0.3, 0, { color: '#e9fdff', glow: '#19e8ff', font: '900 130px Arial, sans-serif', li: 10, ld: 18 });
  // logo
  const logo = canvasTex('bankalogo', 256, 256, (g, W) => {
    g.strokeStyle = '#19e8ff';
    g.lineWidth = 16;
    g.shadowColor = '#19e8ff';
    g.shadowBlur = 24;
    g.beginPath();
    g.arc(W / 2, W / 2, 90, 0, PI * 2);
    g.stroke();
    g.font = '900 120px Arial';
    g.fillStyle = '#e9fdff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('₺', W / 2, W / 2 + 6);
  }, { repeat: false });
  kit.mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false, depthWrite: false }), -4.6, H - 4.5, tz + td / 2 + 0.3, 0, { cast: false });
  kit.sign('bankalobi', 'PARARA BANK', 0.7, 0, 5.3, tz + td / 2 + 0.75, 0, { color: '#ffffff', glow: '#5ad8ff', font: '800 100px Arial, sans-serif', li: 5, ld: 9 });
  // kapı: döner kapı + ATM'ler
  kit.item('door_doner', 0, tz + td / 2, 0, 0, { solid: false });
  kit.item('atm', -4.2, tz + td / 2 + 0.35, 0, 0);
  kit.item('atm', 4.2, tz + td / 2 + 0.35, 0, 0);
  kit.zone({ x: -4.2, z: tz + td / 2 + 1.1, r: 1.3, kind: 'atm', title: '🏧 ATM' });
  kit.zone({ x: 4.2, z: tz + td / 2 + 1.1, r: 1.3, kind: 'atm', title: '🏧 ATM' });
  kit.item('stanchion', -2.4, tz + td / 2 + 2.2, 0, 0);
  kit.item('stanchion', 2.4, tz + td / 2 + 2.2, 0, 0);
  kit.item('planter', -w / 2 + 1.2, d / 2 - 0.8, 0);
  kit.item('planter', w / 2 - 1.2, d / 2 - 0.8, 0);
  kit.item('streetlamp', -w / 2 + 0.8, tz + td / 2 + 2.5, 0);
  kit.item('streetlamp', w / 2 - 0.8, tz + td / 2 + 2.5, 4);
  kit.pool(0, tz + td / 2 + 2.5, '#5ad8ff', 9, 0.16, 0.45);
  kit.light(0, 4, tz + td / 2 + 3, '#bfefff', 8, 14);
  return { door: { x: 0, z: tz + td / 2 + 1.2 }, mapLabel: { text: 'BANKA', y: H + 4, z: tz } };
}

// --- KARAKOL -----------------------------------------------------------------
export function buildKarakol(kit, lot) {
  const { w, d } = lot;
  kit.floor('asfalt', w, d, 0, 0);
  const bw = 17;
  const bd = 11;
  const bz = -d / 2 + bd / 2 + 1;
  kit.wallBox('beton_duvar', bw, 8, bd, 0, 0, bz, { tint: '#b9c3d6' });
  // mavi kuşak ve pencereler
  kit.box(bw + 0.1, 0.5, bd + 0.1, M('#1a2a6c', 0.5), 0, 3.6, bz);
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < 6; i++) {
      if (f === 0 && (i === 2 || i === 3)) continue;
      const x = -bw / 2 + 1.6 + i * 2.75;
      kit.mesh(new THREE.PlaneGeometry(1.6, 1.6), glowMat(i % 2 ? '#9cc4ff' : '#cfe2ff', 0.9), x, 1.6 + f * 3.8 + 0.4, bz + bd / 2 + 0.02, 0, { cast: false });
    }
  }
  kit.box(bw + 0.4, 0.35, bd + 0.4, M('#2a3140', 0.6), 0, 8, bz);
  // parapette mavi neon
  const gm = glowMat('#3b6bff', 3);
  kit.box(bw + 0.5, 0.12, 0.12, gm, 0, 8.4, bz + bd / 2 + 0.2, { cast: false });
  kit.box(0.12, 0.12, bd + 0.5, gm, bw / 2 + 0.2, 8.4, bz, { cast: false });
  kit.box(0.12, 0.12, bd + 0.5, gm, -bw / 2 - 0.2, 8.4, bz, { cast: false });
  kit.sign('polis', 'POLİS', 1.5, 0, 6.2, bz + bd / 2 + 0.06, 0, { color: '#ffffff', glow: '#3b6bff', font: '900 130px Arial, sans-serif', li: 9, ld: 14 });
  kit.sign('karakol', 'NEON KARAKOLU', 0.55, 0, 4.95, bz + bd / 2 + 0.06, 0, { color: '#dfe8ff', glow: '#3b6bff', font: '800 100px Arial, sans-serif', light: false });
  // giriş saçağı
  kit.box(5, 0.25, 2.2, M('#1b2232', 0.5, 0.3), 0, 3.0, bz + bd / 2 + 1.1);
  kit.item('door_cam', 0, bz + bd / 2, 0, 0, { solid: false });
  kit.item('bayrak', -5.5, bz + bd / 2 + 2.4, 0, 0);
  kit.item('bayrak', 5.5, bz + bd / 2 + 2.4, 0, 0);
  // otopark çizgileri + ekip arabaları
  for (let i = 0; i < 4; i++) kit.box(0.12, 0.02, 4.8, M('#e8e8e8', 0.6), -9 + i * 3, 0.14, d / 2 - 3.2, { cast: false });
  const p1 = kit.item('car_sedan', -7.5, d / 2 - 3.2, 0, 3);
  const p2 = kit.item('car_sedan', -4.5, d / 2 - 3.2, 0, 3);
  [p1, p2].forEach((p) => p && policeBar(kit, p));
  kit.pool(0, bz + bd / 2 + 2, '#3b6bff', 10, 0.16, 0.5);
  kit.item('streetlamp', w / 2 - 1, d / 2 - 1.5, 4);
  kit.mass(bw, 8.4, bd, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.3 }, mapLabel: { text: 'KARAKOL', y: 11, z: bz } };
}
// ekip arabası tepe lambası (yanıp söner)
function policeBar(kit, car) {
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.24), new THREE.MeshBasicMaterial({ color: '#ff2a3a', toneMapped: false }));
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.24), new THREE.MeshBasicMaterial({ color: '#2a5bff', toneMapped: false }));
  r.position.set(-0.25, 1.52, -0.2);
  b.position.set(0.25, 1.52, -0.2);
  const g = new THREE.Group();
  g.add(r, b);
  g.position.copy(car.position);
  g.rotation.copy(car.rotation);
  kit.add(g, true);
  kit.ticks.push({ obj: g, ctl: { tick: (t) => {
    const on = Math.floor(t * 5) % 2;
    r.material.color.set(on ? '#ff2a3a' : '#3a0a0e');
    b.material.color.set(on ? '#14183a' : '#2a5bff');
  } } });
}

// --- BELEDİYE ----------------------------------------------------------------
export function buildBelediye(kit, lot) {
  const { w, d } = lot;
  kit.floor('kaldirim', w, d, 0, 0);
  const stone = M('#ddd5c4', 0.75);
  const stone2 = M('#c9c0ad', 0.8);
  const bw = 20;
  const bd = 12;
  const bz = -d / 2 + bd / 2 + 0.8;
  // podyum + ana blok
  kit.box(bw + 1, 1.0, bd + 1, stone2, 0, 0, bz);
  kit.box(bw, 8.5, bd, stone, 0, 1, bz);
  kit.box(bw + 0.6, 0.5, bd + 0.6, stone2, 0, 9.5, bz);
  kit.box(bw - 1, 0.8, bd - 1, stone, 0, 10, bz);
  for (const f of [0, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = -bw / 2 + 1.4 + i * 2.45;
      if (Math.abs(x) < 4.2) continue;
      archWindow(kit, x, 2.2 + f * 3.8, bz + bd / 2 + 0.02, 1.0, 2.2, 0, '#ffe3ae', 1.1);
    }
  }
  // revak: 6 sütun + alınlık
  const pz = bz + bd / 2 + 2.2;
  kit.box(10, 1.0, 4.4, stone2, 0, 0, pz - 0.2);
  for (let i = 0; i < 6; i++) {
    kit.cyl(0.36, 0.42, 7.4, M('#f1ece2', 0.45), -4.2 + i * 1.68, 1.0, pz + 1.4, 18);
    kit.solid(-4.2 + i * 1.68, pz + 1.4, 0.42, 0.42);
  }
  kit.box(10.4, 0.9, 4.6, stone2, 0, 8.4, pz - 0.2);
  const tri = new THREE.Shape();
  tri.moveTo(-5.4, 0);
  tri.lineTo(5.4, 0);
  tri.lineTo(0, 2.6);
  tri.closePath();
  kit.mesh(new THREE.ExtrudeGeometry(tri, { depth: 4.6, bevelEnabled: false }), stone, 0, 9.3, pz - 2.5);
  kit.item('belediyeamblem', 0, pz + 2.12, 0, 0, { solid: false, y: 7.2, scale: 1 });
  // merdivenler
  // merdiven: en yüksek basamak binaya (podyuma) yakın, aşağı inerek yola doğru
  for (let i = 0; i < 4; i++) kit.box(9 - i * 0.2, 0.25 * (4 - i), 0.5, stone2, 0, 0, pz + 2.25 + i * 0.5, { cast: false });
  // saat kulesi
  const cz = bz - 1;
  kit.box(4.2, 8, 4.2, stone, 0, 10.8, cz);
  kit.box(4.8, 0.5, 4.8, stone2, 0, 18.8, cz);
  const clock = canvasTex('saat', 256, 256, (g, W) => {
    g.fillStyle = '#fff4d8';
    g.beginPath();
    g.arc(W / 2, W / 2, 118, 0, PI * 2);
    g.fill();
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 8;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      g.fillStyle = '#222';
      g.fillRect(W / 2 + Math.sin(a) * 96 - 4, W / 2 - Math.cos(a) * 96 - 10, 8, 20);
    }
    g.lineCap = 'round';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(W / 2, W / 2);
    g.lineTo(W / 2 + 50, W / 2 - 30);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(W / 2, W / 2);
    g.lineTo(W / 2 - 12, W / 2 - 86);
    g.stroke();
  }, { repeat: false });
  const cm = new THREE.MeshStandardMaterial({ map: clock, emissive: '#fff1c8', emissiveMap: clock, emissiveIntensity: 0.9 });
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2;
    kit.mesh(new THREE.CircleGeometry(1.4, 32), cm, Math.sin(a) * 2.13, 16.4, cz + Math.cos(a) * 2.13, a, { cast: false });
  }
  kit.cyl(1.6, 1.9, 1.6, stone, 0, 19.3, cz, 20);
  const dm = kit.mesh(new THREE.SphereGeometry(1.7, 24, 12, 0, PI * 2, 0, PI / 2), M('#6f7f95', 0.4, 0.5), 0, 20.9, cz);
  dm.scale.y = 1.2;
  kit.cyl(0.05, 0.05, 1.6, M('#d9a93c', 0.25, 1), 0, 22.8, cz, 6);
  kit.light(0, 16.4, cz + 3, '#fff1c8', 5, 8);
  // kapı + bayraklar + çim
  kit.item('door_cift', 0, bz + bd / 2, 0, 0, { solid: false, y: 1.0 });
  kit.floor('cim', 5.5, 5, -w / 2 + 3.2, d / 2 - 3, 0.15);
  kit.floor('cim', 5.5, 5, w / 2 - 3.2, d / 2 - 3, 0.15);
  kit.item('bayrak', -w / 2 + 3.2, d / 2 - 3, 0, 0);
  kit.item('bayrak', w / 2 - 3.2, d / 2 - 3, 0, 0);
  kit.item('streetlamp', -5.6, d / 2 - 1.2, 0);
  kit.item('streetlamp', 5.6, d / 2 - 1.2, 4);
  kit.pool(0, pz + 1.5, '#ffe3ae', 12, 0.16, 0.45);
  kit.light(0, 6, pz + 4, '#ffe9c4', 10, 16);
  kit.mass(bw + 1, 11, bd + 1, 0, bz);
  kit.solid(-3.1, pz, 1.9, 2.2);
  kit.solid(3.1, pz, 1.9, 2.2);
  // podyum yüksekliği: kapıya merdivenden çıkılır (kapı noktası merdiven önü)
  return { door: { x: 0, z: pz + 3.2 }, mapLabel: { text: 'BELEDİYE BİNASI', y: 24, z: bz } };
}

// --- ARABA GALERİSİ ----------------------------------------------------------
export function buildGaleri(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  const bw = 18;
  const bd = 11;
  const bz = -d / 2 + bd / 2 + 1;
  kit.floor('mermer_beyaz', bw, bd, 0, bz, 0.16);
  // arka duvar (antrasit), çatı, cam cephe
  kit.wallBox('boya_antrasit', bw, 6, 0.4, 0, 0, bz - bd / 2);
  kit.box(bw + 0.6, 0.6, bd + 0.6, M('#1c1f25', 0.5, 0.3), 0, 6, bz);
  kit.box(bw + 0.62, 0.1, 0.1, glowMat('#ffffff', 2), 0, 6.3, bz + bd / 2 + 0.31, { cast: false });
  for (const sx of [-1, 1]) kit.mesh(new THREE.PlaneGeometry(bd, 6), GLASS(), sx * bw / 2, 3, bz, PI / 2, { cast: false });
  kit.mesh(new THREE.PlaneGeometry(bw, 6), GLASS(), 0, 3, bz + bd / 2, 0, { cast: false });
  for (let i = 0; i <= 6; i++) kit.box(0.14, 6, 0.14, M('#262a31', 0.4, 0.7), -bw / 2 + i * (bw / 6), 0, bz + bd / 2);
  // içerideki tavan ışıkları
  for (let i = 0; i < 3; i++) kit.box(3, 0.06, 0.4, glowMat('#ffffff', 2.5), -6 + i * 6, 5.6, bz, { cast: false });
  kit.light(0, 4.6, bz, '#ffffff', 10, 14);
  // vitrindeki arabalar (döner platform)
  kit.item('carplatform', -4, bz - 0.5, 0, 0);
  kit.item('car_super', -4, bz - 0.5, 1, 1, { y: 0.25 });
  kit.item('car_sport', 3.5, bz - 0.5, 7, 4);
  kit.item('plantb', 7.8, bz - 4.3);
  kit.sign('galeri', 'ARABA GALERİSİ', 1.0, 0, 6.95, bz + bd / 2 + 0.36, 0, { color: '#ffffff', glow: '#ff2e5a', font: '900 110px Arial, sans-serif', li: 7, ld: 12 });
  kit.item('door_cam', 0, bz + bd / 2, 0, 0, { solid: false });
  // dışarıdaki satılık arabalar
  const ox = [-7.5, -4.5, 4.5, 7.5];
  const cars = ['car_muscle', 'car_suv', 'car_classic', 'car_sedan'];
  ox.forEach((x, i) => kit.item(cars[i], x, d / 2 - 3.4, 0, (i * 3 + 1) % 7));
  kit.pool(0, bz + bd / 2 + 1.5, '#ffffff', 12, 0.17, 0.32);
  kit.mass(bw, 6.6, bd, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.2 }, mapLabel: { text: 'ARABA GALERİSİ', y: 9, z: bz } };
}

// --- SİLAH MAĞAZASI ----------------------------------------------------------
export function buildSilah(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  const bw = 15;
  const bd = 12;
  const bz = -d / 2 + bd / 2 + 1.5;
  kit.wallBox('tugla', bw, 7, bd, 0, 0, bz, { tint: '#7a6a66' });
  kit.box(bw + 0.4, 0.4, bd + 0.4, M('#1a1a1d', 0.6), 0, 7, bz);
  // vitrin (parmaklıklı)
  for (const sx of [-1, 1]) {
    kit.mesh(new THREE.PlaneGeometry(3.6, 2.4), glowMat('#3ad6ff', 0.45), sx * 4.5, 1.9, bz + bd / 2 + 0.02, 0, { cast: false });
    for (let i = 0; i < 9; i++) kit.box(0.05, 2.6, 0.05, M('#1b1b1d', 0.4, 0.8), sx * 4.5 - 1.8 + i * 0.45, 0.6, bz + bd / 2 + 0.12, { cast: false });
  }
  // büyük neon tüfek tabelası
  const gun = canvasTex('silahneon', 1024, 420, (g, W, H) => {
    g.strokeStyle = '#3ad6ff';
    g.lineWidth = 10;
    g.shadowColor = '#3ad6ff';
    g.lineJoin = 'round';
    for (const b of [36, 18, 6]) {
      g.shadowBlur = b;
      g.beginPath();
      // stilize tüfek silueti
      g.moveTo(80, 190); g.lineTo(560, 190); g.lineTo(600, 170); g.lineTo(930, 170); g.lineTo(930, 190); g.lineTo(640, 200);
      g.lineTo(620, 240); g.lineTo(520, 240); g.lineTo(500, 330); g.lineTo(440, 330); g.lineTo(450, 240); g.lineTo(360, 240);
      g.lineTo(330, 300); g.lineTo(150, 300); g.lineTo(170, 240); g.lineTo(80, 230); g.closePath();
      g.stroke();
    }
    g.shadowBlur = 0;
    g.strokeStyle = '#ff3fa0';
    g.lineWidth = 8;
    roundRect(g, 20, 20, W - 40, H - 40, 30);
    g.stroke();
  }, { repeat: false });
  kit.mesh(new THREE.PlaneGeometry(7.2, 2.95), new THREE.MeshBasicMaterial({ map: gun, transparent: true, toneMapped: false, depthWrite: false }), 0, 5.2, bz + bd / 2 + 0.05, 0, { cast: false });
  kit.sign('silahyazi', 'SİLAH MAĞAZASI', 0.75, 0, 3.4, bz + bd / 2 + 0.06, 0, { color: '#ffffff', glow: '#ff3fa0', font: '900 110px Arial, sans-serif', li: 7, ld: 12 });
  kit.light(0, 5.2, bz + bd / 2 + 1.5, '#3ad6ff', 8, 14);
  kit.item('door_metal', 0, bz + bd / 2, 0, 0, { solid: false });
  kit.item('barrel', -6.6, bz + bd / 2 + 0.7, 0, 0);
  kit.item('crate', 6.4, bz + bd / 2 + 0.8, 1, 0);
  kit.item('hedef', 6.8, bz + bd / 2 + 0.3, 0, 0, { solid: false });
  kit.pool(0, bz + bd / 2 + 2, '#3ad6ff', 11, 0.16, 0.5);
  kit.mass(bw, 7.4, bd, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.2 }, mapLabel: { text: 'SİLAH MAĞAZASI', y: 10, z: bz } };
}

// --- MODİFİYE GARAJI ---------------------------------------------------------
export function buildModifiye(kit, lot) {
  const { w, d } = lot;
  kit.floor('epoksi', w, d, 0, 0);
  const bw = 20;
  const bd = 11;
  const bz = -d / 2 + bd / 2 + 1;
  // garaj gövdesi (beton blok), 3 açık bölme
  kit.wallBox('beton_blok', bw, 6.5, 0.4, 0, 0, bz - bd / 2);
  kit.wallBox('beton_blok', 0.4, 6.5, bd, -bw / 2, 0, bz);
  kit.wallBox('beton_blok', 0.4, 6.5, bd, bw / 2, 0, bz);
  kit.box(bw + 0.4, 0.6, bd + 0.4, M('#22252b', 0.6), 0, 6.5, bz);
  kit.floor('epoksi_siyah', bw, bd, 0, bz, 0.16);
  // bölme sütunları + üst kirişte neon
  for (const x of [-bw / 6, bw / 6]) kit.wallBox('beton_blok', 0.8, 6.5, 1.2, x, 0, bz + bd / 2 - 0.6);
  kit.wallBox('beton_blok', bw, 1.8, 0.5, 0, 4.7, bz + bd / 2 - 0.25);
  kit.sign('modifiye', 'MODİFİYE GARAJI', 1.0, 0, 5.6, bz + bd / 2 + 0.02, 0, { color: '#eaffef', glow: '#39ff88', font: '900 110px Arial, sans-serif', li: 8, ld: 14 });
  kit.box(bw, 0.1, 0.1, glowMat('#39ff88', 2.4), 0, 4.6, bz + bd / 2 + 0.02, { cast: false });
  // içeride lift + arabalar + takımlar
  kit.item('carlift', -bw / 3, bz - 0.5, 0, 0);
  kit.item('car_muscle', -bw / 3, bz - 0.5, 0, 2, { y: 0.9 });
  kit.item('car_super', 0, bz, 0, 6);
  kit.item('toolwall', bw / 3, bz - bd / 2 + 0.2, 0, 0, { solid: false });
  kit.item('toolchest', bw / 3 + 2.5, bz - bd / 2 + 0.8, 0, 0);
  kit.item('workbench', bw / 3 - 1.8, bz - bd / 2 + 0.8, 0, 0);
  for (let i = 0; i < 3; i++) kit.box(2.4, 0.06, 0.3, glowMat('#ffffff', 2.4), -bw / 3 + i * (bw / 3), 6.2, bz, { cast: false });
  kit.light(-bw / 3, 4.5, bz + 2, '#e8fff0', 7, 10);
  kit.light(bw / 3, 4.5, bz + 2, '#e8fff0', 7, 10);
  // önde lastik, koni ve bekleyen araba
  kit.item('tires', -bw / 2 + 1.2, d / 2 - 1.5, 0, 0);
  kit.item('tires', -bw / 2 + 2.0, d / 2 - 1.2, 0, 0);
  kit.item('cone', -2, d / 2 - 2.2, 0, 0);
  kit.item('cone', 2, d / 2 - 2.2, 0, 0);
  kit.item('car_sport', bw / 2 - 3, d / 2 - 3.4, 2, 2);
  kit.item('door_metal', bw / 2 - 0.2, bz + 2.5, 2, 0, { solid: false });
  kit.pool(0, bz + bd / 2 + 1.5, '#39ff88', 13, 0.17, 0.42);
  kit.solid(0, bz - bd / 2, bw / 2, 0.3);
  kit.solid(-bw / 2, bz, 0.3, bd / 2);
  kit.solid(bw / 2, bz, 0.3, bd / 2);
  kit.solid(-bw / 3, bz - 0.5, 1.6, 2.8);
  kit.blocker(bw, 6.5, bd, 0, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.0 }, mapLabel: { text: 'MODİFİYE GARAJI', y: 9, z: bz } };
}

// --- CASINO (Neon Gazino) ----------------------------------------------------
export function buildCasino(kit, lot) {
  const { w, d } = lot;
  kit.floor('hali_bordo', 3.2, d / 2 + 1, 0, d / 4 - 0.5, 0.16); // kırmızı halı
  kit.floor('mermer_siyah', w, d, 0, 0, 0.14);
  const bw = 20;
  const bd = 12;
  const bz = -d / 2 + bd / 2 + 1;
  kit.wallBox('damask', bw, 9, bd, 0, 0, bz);
  // kavisli pembe cephe şeritleri
  const pink = glowMat('#ff3fa0', 2.2);
  const gold = glowMat('#ffcf5a', 2.4);
  for (let i = 0; i < 11; i++) {
    const x = -bw / 2 + 0.9 + i * ((bw - 1.8) / 10);
    kit.box(0.35, 8.4, 0.2, i % 2 ? pink : M('#2a0b1c', 0.4), x, 0.3, bz + bd / 2 + 0.1, { cast: false });
  }
  // marki + ampuller
  kit.box(bw + 1, 1.2, 1.6, M('#1a0710', 0.4), 0, 8.8, bz + bd / 2 + 0.6);
  for (let i = 0; i < 26; i++) kit.mesh(new THREE.SphereGeometry(0.1, 8, 6), gold, -bw / 2 + i * (bw / 25), 8.85, bz + bd / 2 + 1.45, 0, { cast: false });
  kit.sign('casino', 'CASINO', 2.6, 0, 11.3, bz + bd / 2 + 0.2, 0, { color: '#fff3c4', glow: '#ff3fa0', font: 'italic 900 140px Georgia, serif', stroke: '#ffcf5a', li: 12, ld: 18 });
  // taç
  const crown = kit.mesh(new THREE.ConeGeometry(0.9, 1.4, 5), gold, 0, 13.6, bz + bd / 2 + 0.2, 0, { cast: false });
  crown.rotation.x = PI;
  // giriş saçağı (ampullü)
  kit.box(7, 0.4, 3.4, M('#220914', 0.4, 0.3), 0, 3.6, bz + bd / 2 + 1.7);
  for (let i = 0; i < 14; i++) kit.mesh(new THREE.SphereGeometry(0.08, 8, 6), gold, -3.4 + i * (6.8 / 13), 3.55, bz + bd / 2 + 3.42, 0, { cast: false });
  kit.sign('neongazino', 'NEON GAZİNO', 0.6, 0, 4.25, bz + bd / 2 + 3.42, 0, { color: '#ffe9a8', glow: '#ffcf5a', font: '900 100px Arial, sans-serif', light: false });
  kit.item('door_cift', 0, bz + bd / 2, 0, 0, { solid: false });
  kit.item('stanchion', -1.8, bz + bd / 2 + 2.6, 2, 0);
  kit.item('stanchion', 1.8, bz + bd / 2 + 2.6, 2, 0);
  kit.item('palm', -5.5, bz + bd / 2 + 1.6, 0, 0);
  kit.item('palm', 5.5, bz + bd / 2 + 1.6, 0, 0);
  kit.pool(0, bz + bd / 2 + 2.4, '#ff3fa0', 16, 0.16, 0.55);
  kit.pool(0, bz + bd / 2 + 3, '#ffcf5a', 8, 0.17, 0.4);
  kit.light(-6, 6, bz + bd / 2 + 2, '#ff3fa0', 9, 14);
  kit.light(6, 6, bz + bd / 2 + 2, '#ff3fa0', 9, 14);
  kit.mass(bw, 9.5, bd, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.4 }, mapLabel: { text: 'CASINO', y: 15, z: bz } };
}

// --- SPOR SALONU (cam kutu, içi görünen) --------------------------------------
export function buildSpor(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  const bw = 20;
  const bd = 13;
  const bz = -d / 2 + bd / 2 + 1;
  kit.floor('spor_zemin', bw, bd, 0, bz, 0.16);
  kit.box(bw, 0.3, bd, M('#222630', 0.6), 0, 4.2, bz);
  kit.box(bw + 0.5, 0.6, bd + 0.5, M('#1a1d24', 0.5, 0.3), 0, 8.4, bz);
  for (const sx of [-1, 1]) kit.mesh(new THREE.PlaneGeometry(bd, 8.4), GLASS(), sx * bw / 2, 4.2, bz, PI / 2, { cast: false });
  kit.mesh(new THREE.PlaneGeometry(bw, 8.4), GLASS(), 0, 4.2, bz + bd / 2, 0, { cast: false });
  kit.wallBox('beton_duvar', bw, 8.4, 0.4, 0, 0, bz - bd / 2);
  for (let i = 0; i <= 5; i++) kit.box(0.16, 8.4, 0.16, M('#2a2e36', 0.4, 0.7), -bw / 2 + i * (bw / 5), 0, bz + bd / 2);
  for (let i = 0; i < 4; i++) kit.item('treadmill', -7 + i * 2.2, bz - 3.5, 0, 0);
  kit.item('bench', 5, bz - 3.3, 0, 0);
  kit.item('bag', 7.5, bz + 1.5, 0, 0);
  kit.item('dumbbells', 3, bz + 1.5, 0, 0);
  // üst kat: havuz (haritadaki mavi havuz)
  kit.box(9, 0.5, 6, M('#cfe6f2', 0.2), 4.5, 4.5, bz - 2.5);
  kit.mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshStandardMaterial({ color: '#1c8fd8', emissive: '#0d6bb0', emissiveIntensity: 1.3, roughness: 0.05 }), 4.5, 5.02, bz - 2.5, 0, { rx: -PI / 2, cast: false });
  for (let i = 0; i < 3; i++) kit.box(5, 0.06, 0.4, glowMat('#e9fbff', 2.5), -6 + i * 6, 8.0, bz, { cast: false });
  kit.light(-4, 3.5, bz, '#dff6ff', 9, 12);
  kit.light(4, 6.8, bz - 2, '#5ad8ff', 6, 9);
  kit.sign('spor', 'SPOR SALONU', 1.1, -3, 9.4, bz + bd / 2 + 0.3, 0, { color: '#ffffff', glow: '#5ad8ff', font: '900 110px Arial, sans-serif', li: 7, ld: 12 });
  kit.item('door_cam', 0, bz + bd / 2, 0, 0, { solid: false });
  kit.pool(0, bz + bd / 2 + 1.5, '#9fe6ff', 14, 0.17, 0.4);
  kit.mass(bw, 8.8, bd, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.2 }, mapLabel: { text: 'SPOR SALONU', y: 12, z: bz } };
}

// --- FABRİKA (tuğla, testere çatı, bacalar) -----------------------------------
export function buildFabrika(kit, lot) {
  const { w, d } = lot;
  kit.floor('asfalt', w, d, 0, 0);
  const bw = 18;
  const bd = 13;
  const bz = -d / 2 + bd / 2 + 1;
  kit.wallBox('tugla', bw, 7, bd, 0, 0, bz);
  // testere çatı
  const tri = new THREE.Shape();
  tri.moveTo(0, 0);
  tri.lineTo(bd / 4, 0);
  tri.lineTo(0, 2.2);
  tri.closePath();
  for (let i = 0; i < 4; i++) {
    const m = kit.mesh(new THREE.ExtrudeGeometry(tri, { depth: bw, bevelEnabled: false }), M('#3a3f48', 0.6, 0.4), -bw / 2, 7, bz - bd / 2 + i * (bd / 4), PI / 2);
    m.rotation.y = -PI / 2;
    m.position.set(bw / 2, 7, bz - bd / 2 + i * (bd / 4));
    kit.mesh(new THREE.PlaneGeometry(bw - 0.4, 2), glowMat('#ffb15a', 0.9), 0, 8.0, bz - bd / 2 + i * (bd / 4) + 0.02, 0, { cast: false });
  }
  // pencereler (sıcak, endüstriyel)
  for (let i = 0; i < 5; i++) kit.mesh(new THREE.PlaneGeometry(2.4, 1.6), glowMat('#ff9f45', 1.1), -7 + i * 3.5, 4.6, bz + bd / 2 + 0.02, 0, { cast: false });
  // bacalar (kırmızı-beyaz)
  for (const [cx, cz] of [[-5, bz - 3], [-1.5, bz - 4.5]]) {
    for (let s = 0; s < 6; s++) kit.cyl(0.8 - s * 0.04, 0.84 - s * 0.04, 3.4, M(s % 2 ? '#e9e6df' : '#b3261e', 0.7), cx, s * 3.4, cz, 18);
    kit.cyl(0.9, 0.9, 0.4, M('#222', 0.8), cx, 20.4, cz, 18);
    kit.label('__smoke', cx, 21, cz, 'smoke');
    kit.light(cx, 20.6, cz, '#ff3a2a', 2, 5);
  }
  kit.sign('fabrika', 'FABRİKA', 1.2, 0, 6.2, bz + bd / 2 + 0.06, 0, { color: '#ffe2c4', glow: '#ff7a2a', font: '900 120px Arial, sans-serif', li: 7, ld: 12 });
  // yükleme rampası
  kit.item('garagedoor', 5, bz + bd / 2, 0, 0, { solid: false });
  kit.item('door_metal', -3, bz + bd / 2, 0, 0, { solid: false });
  kit.item('pallets', -7.5, bz + bd / 2 + 1.4, 0, 0);
  kit.item('barrel', -8.6, bz + bd / 2 + 2.6, 0, 0);
  kit.item('barrel', -8.0, bz + bd / 2 + 3.0, 0, 0);
  kit.item('crate', 8.2, d / 2 - 2.4, 1, 0);
  kit.item('forklift', 2, d / 2 - 2.6, 2, 0);
  kit.item('portlight', w / 2 - 1, bz + bd / 2 + 1, 6, 0);
  kit.pool(0, bz + bd / 2 + 2, '#ff9f45', 12, 0.16, 0.4);
  kit.mass(bw, 9, bd, 0, bz);
  return { door: { x: -3, z: bz + bd / 2 + 1.2 }, mapLabel: { text: 'FABRİKA', y: 12, z: bz } };
}

// --- İNTERNET KAFE ----------------------------------------------------------
export function buildNetKafe(kit, lot) {
  const { w, d } = lot;
  kit.floor('kaldirim', w, d, 0, 0);
  const bw = 16;
  const bd = 12;
  const bz = -d / 2 + bd / 2 + 2;
  kit.floor('neon_grid', bw, bd, 0, bz, 0.16);
  kit.wallBox('boya_mor', bw, 7, 0.4, 0, 0, bz - bd / 2);
  kit.wallBox('boya_mor', 0.4, 7, bd, -bw / 2, 0, bz);
  kit.box(bw + 0.4, 0.5, bd + 0.4, M('#181226', 0.5), 0, 7, bz);
  kit.mesh(new THREE.PlaneGeometry(bw, 7), GLASS(), 0, 3.5, bz + bd / 2, 0, { cast: false });
  kit.mesh(new THREE.PlaneGeometry(bd, 7), GLASS(), bw / 2, 3.5, bz, PI / 2, { cast: false });
  // içeride bilgisayar istasyonları (oyundaki İnternet Kafe İstasyonu)
  for (let i = 0; i < 3; i++) kit.item('pcstation', -5 + i * 4.2, bz - bd / 2 + 1.2, 0, i);
  for (let i = 0; i < 3; i++) kit.item('pcstation', -5 + i * 4.2, bz + 0.6, 4, i + 2);
  kit.item('arcade', 6.6, bz + 3.4, 6, 0);
  kit.light(0, 5, bz, '#c58bff', 9, 14);
  // köşe neon çerçeveleri (haritadaki pembe-mor kenarlar)
  neonFrame(kit, bw + 0.4, 7.4, 0, 3.6, bz + bd / 2 + 0.05, '#ff3fd1');
  neonFrame(kit, bd + 0.4, 7.4, bw / 2 + 0.05, 3.6, bz, '#7a5bff', PI / 2);
  kit.sign('netcafe1', 'NET CAFE', 1.6, -3.5, 8.6, bz + bd / 2 + 0.25, 0, { color: '#fff6d0', glow: '#ff7a2a', font: '900 120px Arial, sans-serif', li: 8, ld: 12 });
  kit.sign('netcafe2', 'NET CAFE', 1.2, bw / 2 + 0.25, 8.4, bz - 1, PI / 2, { color: '#e9f6ff', glow: '#3ad6ff', font: '900 120px Arial, sans-serif', li: 6, ld: 10 });
  kit.sign('internetkafe', 'İNTERNET KAFE', 0.55, 3.5, 6.2, bz + bd / 2 + 0.06, 0, { color: '#ffd6f4', glow: '#ff3fd1', font: '800 100px Arial, sans-serif', light: false });
  kit.item('door_cam', 3.5, bz + bd / 2, 0, 0, { solid: false });
  kit.pool(0, bz + bd / 2 + 1.5, '#ff3fd1', 13, 0.17, 0.5);
  kit.mass(bw, 7.4, bd, 0, bz);
  return { door: { x: 3.5, z: bz + bd / 2 + 1.2 }, mapLabel: { text: 'İNTERNET KAFE', y: 11, z: bz } };
}

// --- BAR ---------------------------------------------------------------------
export function buildBar(kit, lot) {
  const { w, d } = lot;
  kit.floor('kaldirim', w, d, 0, 0);
  kit.floor('parke_ceviz', w - 4, 7.5, 0, d / 2 - 3.9, 0.16);
  kit.box(w - 4, 0.1, 7.5, M('#3a2418', 0.8), 0, 0.02, d / 2 - 3.9, { cast: false });
  const bw = 16;
  const bd = 11;
  const bz = -d / 2 + bd / 2 + 1;
  kit.wallBox('tugla', bw, 8, bd, 0, 0, bz);
  kit.box(bw + 0.5, 0.5, bd + 0.5, M('#2a1a12', 0.7), 0, 8, bz);
  kit.wallBox('ahsap_panel', bw + 0.1, 3.4, 0.2, 0, 0, bz + bd / 2 + 0.05);
  for (let i = 0; i < 4; i++) {
    kit.mesh(new THREE.PlaneGeometry(2.6, 2.2), glowMat('#ffab4a', 1.3), -5.6 + i * 3.73 + (i > 1 ? 0.0 : 0), 1.6, bz + bd / 2 + 0.17, 0, { cast: false });
    kit.mesh(new THREE.PlaneGeometry(2.2, 1.8), glowMat('#ffc06a', 1.0), -5.6 + i * 3.73, 5.4, bz + bd / 2 + 0.02, 0, { cast: false });
  }
  // tente + tabela
  kit.box(bw, 0.2, 2.2, M('#3a1610', 0.7), 0, 3.6, bz + bd / 2 + 1.1);
  kit.sign('bar', 'BAR', 1.8, 0, 6.9, bz + bd / 2 + 0.12, 0, { color: '#fff1d0', glow: '#ff9a2a', font: '900 140px Georgia, serif', li: 8, ld: 14 });
  kit.item('door_salon', 0, bz + bd / 2 + 0.15, 0, 0, { solid: false });
  // teras: bar masaları + şemsiyeler + ip ışıklar
  for (const [x, z] of [[-6, d / 2 - 4.5], [-2.5, d / 2 - 2.2], [3, d / 2 - 4.2], [6.4, d / 2 - 2]]) kit.item('bartable', x, z, 0, 0);
  kit.item('umbrella', -6, d / 2 - 4.5, 0, 0, { solid: false });
  kit.item('umbrella', 3, d / 2 - 4.2, 0, 0, { solid: false });
  stringLights(kit, [[-bw / 2, 3.4, bz + bd / 2 + 2.2], [-bw / 2, 3.0, d / 2 - 0.5], [bw / 2, 3.0, d / 2 - 0.5], [bw / 2, 3.4, bz + bd / 2 + 2.2]], '#ffcf7a');
  kit.pool(0, d / 2 - 3, '#ffab4a', 14, 0.15, 0.45);
  kit.light(0, 3, d / 2 - 3, '#ffbf6a', 8, 12);
  kit.mass(bw, 8.5, bd, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.2 }, mapLabel: { text: 'BAR', y: 11, z: bz } };
}
function stringLights(kit, pts, color) {
  const gm = basicGlow(color);
  const pole = M('#1c1c1e', 0.5, 0.6);
  pts.forEach(([x, y, z]) => kit.cyl(0.05, 0.05, y, pole, x, 0, z, 6));
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i];
    const [bx, by, bz] = pts[i + 1];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const sag = Math.sin(t * PI) * 0.45;
      kit.mesh(new THREE.SphereGeometry(0.06, 6, 5), gm, ax + (bx - ax) * t, ay + (by - ay) * t - sag, az + (bz - az) * t, 0, { cast: false });
    }
  }
}

// --- CAFE --------------------------------------------------------------------
export function buildCafe(kit, lot) {
  const { w, d } = lot;
  kit.floor('kaldirim', w, d, 0, 0);
  kit.floor('parke_mese', w - 3, 7.5, 0, d / 2 - 3.9, 0.16);
  const bw = 15;
  const bd = 11;
  const bz = -d / 2 + bd / 2 + 1;
  kit.wallBox('tugla_beyaz', bw, 7.5, bd, 0, 0, bz);
  kit.box(bw + 0.4, 0.4, bd + 0.4, M('#23262c', 0.6), 0, 7.5, bz);
  kit.wallBox('ahsap_panel', bw, 3.6, 0.3, 0, 0, bz + bd / 2 + 0.1);
  kit.mesh(new THREE.PlaneGeometry(bw - 2, 2.8), glowMat('#ffd59a', 1.2), 0, 1.7, bz + bd / 2 + 0.26, 0, { cast: false });
  for (let i = 0; i < 4; i++) kit.mesh(new THREE.PlaneGeometry(2.4, 2.0), glowMat('#ffe3b8', 1.0), -5 + i * 3.33, 5.4, bz + bd / 2 + 0.02, 0, { cast: false });
  kit.box(bw, 0.2, 2.0, M('#2f4a3a', 0.7), 0, 3.7, bz + bd / 2 + 1.0);
  kit.sign('cafe', 'CAFE', 1.4, 0, 6.4, bz + bd / 2 + 0.06, 0, { color: '#ffffff', glow: '#ffd59a', font: '900 130px Georgia, serif', li: 7, ld: 12 });
  kit.item('door_cam', 0, bz + bd / 2 + 0.25, 0, 0, { solid: false });
  for (const [x, z] of [[-5.5, d / 2 - 2.8], [-1.8, d / 2 - 5], [2.2, d / 2 - 2.6], [5.8, d / 2 - 4.8]]) {
    kit.item('cafetable', x, z, 0, 2);
    kit.item('umbrella', x, z, 0, 0, { solid: false });
  }
  kit.item('plantb', -bw / 2 + 0.6, bz + bd / 2 + 0.8);
  kit.item('plantb', bw / 2 - 0.6, bz + bd / 2 + 0.8);
  kit.item('menuboard', 3.2, bz + bd / 2 + 0.6, 0, 0);
  kit.pool(0, d / 2 - 3.5, '#ffd59a', 14, 0.15, 0.45);
  kit.light(0, 3, d / 2 - 3.5, '#ffe3b8', 8, 12);
  kit.mass(bw, 8, bd, 0, bz);
  return { door: { x: 0, z: bz + bd / 2 + 1.3 }, mapLabel: { text: 'CAFE', y: 10, z: bz } };
}

// --- EV ----------------------------------------------------------------------
export function buildEv(kit, lot) {
  const { w, d } = lot;
  kit.floor('cim', w, d, 0, 0);
  const bw = 11;
  const bd = 8;
  const bx = -w / 2 + bw / 2 + 1.5;
  const bz = -d / 2 + bd / 2 + 2;
  kit.floor('kaldirim', 1.6, d / 2 - bz - bd / 2, bx, (bz + bd / 2 + d / 2) / 2, 0.15);
  kit.wallBox('boya_krem', bw, 6, bd, bx, 0, bz);
  // beşik çatı
  const roof = new THREE.Shape();
  roof.moveTo(-bw / 2 - 0.5, 0);
  roof.lineTo(bw / 2 + 0.5, 0);
  roof.lineTo(0, 3.2);
  roof.closePath();
  const rf = kit.mesh(new THREE.ExtrudeGeometry(roof, { depth: bd + 1, bevelEnabled: false }), M('#3b2a26', 0.8), bx, 6, bz - bd / 2 - 0.5);
  rf.castShadow = true;
  kit.box(0.9, 2.2, 0.9, M('#5a4a44', 0.8), bx + 3, 7.5, bz - 1.5);
  for (const f of [0, 1]) {
    for (let i = 0; i < 3; i++) {
      if (f === 0 && i === 1) continue;
      kit.mesh(new THREE.PlaneGeometry(1.5, 1.5), glowMat('#ffcf8a', 1.2), bx - 3.5 + i * 3.5, 1.9 + f * 2.8, bz + bd / 2 + 0.02, 0, { cast: false });
      kit.box(1.8, 0.12, 0.3, M('#e8e1d4', 0.6), bx - 3.5 + i * 3.5, 1.05 + f * 2.8, bz + bd / 2 + 0.15, { cast: false });
    }
  }
  kit.item('doordeco', bx, bz + bd / 2, 0, 0, { solid: false });
  kit.box(2.6, 0.2, 1.4, M('#3b2a26', 0.8), bx, 2.7, bz + bd / 2 + 0.7);
  kit.light(bx, 2.5, bz + bd / 2 + 1.2, '#ffcf8a', 5, 8);
  // bahçe çiti + ağaç + mangal
  for (let i = 0; i < 4; i++) {
    if (i === 1) continue;
    kit.item('fence', -w / 2 + 1 + i * 2.2, d / 2 - 0.4, 0, 0);
  }
  kit.item('tree', bx + bw / 2 + 2.2, bz + 2, 0, 0);
  kit.item('mangal', bx + bw / 2 + 1.5, d / 2 - 3, 0, 0);
  kit.item('car_classic', bx + bw / 2 + 2.6, bz - 1.5, 0, 6);
  kit.mass(bw, 9, bd, bx, bz);
  return { door: { x: bx, z: bz + bd / 2 + 1.2 }, mapLabel: { text: 'EV', y: 11, z: bz, x: bx } };
}

// --- STADYUM -----------------------------------------------------------------
export function buildStadyum(kit, lot) {
  const { w, d } = lot;
  kit.floor('kaldirim', w, d, 0, 0);
  const R = Math.min(w, d) / 2 - 3;
  const sx = 1.12; // hafif oval
  const g = new THREE.Group();
  g.scale.set(sx, 1, 0.9);
  kit.add(g);
  const addG = (geo, mat, y = 0, cast = true) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.y = y;
    o.castShadow = cast;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  // dış cephe halkası + ışık şeritleri
  addG(new THREE.CylinderGeometry(R, R, 14, 64, 1, true), M('#3a4150', 0.5, 0.3), 7);
  for (const y of [4, 8.5, 12.5]) addG(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.25, 64, 1, true), glowMat(y === 8.5 ? '#ff3fa0' : '#dfe8ff', 2.2), y, false);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * PI * 2;
    const o = addG(new THREE.BoxGeometry(0.5, 14, 0.6), M('#565f70', 0.4, 0.5), 7);
    o.position.x = Math.sin(a) * (R + 0.2);
    o.position.z = Math.cos(a) * (R + 0.2);
    o.rotation.y = a;
  }
  // tribün içi (eğimli halka) + saha
  const bowl = new THREE.LatheGeometry([new THREE.Vector2(R - 15, 0.3), new THREE.Vector2(R - 13, 1.5), new THREE.Vector2(R - 0.5, 13)], 64);
  addG(bowl, M('#2a2f3c', 0.8), 0, false);
  const seats = new THREE.LatheGeometry([new THREE.Vector2(R - 13.2, 1.6), new THREE.Vector2(R - 0.8, 12.6)], 64);
  const seatTex = canvasTex('stadkoltuk', 512, 64, (c, W, H) => {
    for (let i = 0; i < 40; i++) {
      c.fillStyle = i % 2 ? '#1f2433' : '#272d3e';
      c.fillRect(0, (i * H) / 40, W, H / 40);
    }
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = ['#ff3fa0', '#ffd23f', '#19e8ff', '#ffffff', '#ff6a3a'][i % 5];
      c.globalAlpha = 0.55;
      c.fillRect(Math.random() * W, Math.random() * H, 2, 1.5);
    }
  });
  seatTex.repeat.set(6, 1);
  addG(seats, new THREE.MeshStandardMaterial({ map: seatTex, roughness: 0.8, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: seatTex, emissiveIntensity: 0.25 }), 0.05, false);
  // çatı halkası (yarı saydam)
  const roof = new THREE.RingGeometry(R - 9, R + 0.8, 64);
  const rm = addG(roof, new THREE.MeshStandardMaterial({ color: '#c9d2e0', roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.82, side: THREE.DoubleSide }), 14.2, false);
  rm.rotation.x = -PI / 2;
  const ringIn = addG(new THREE.TorusGeometry(R - 9, 0.18, 6, 64), glowMat('#e9f4ff', 2.6), 14.25, false);
  ringIn.rotation.x = PI / 2;
  // saha
  const pitch = canvasTex('saha', 512, 340, (c, W, H) => {
    for (let i = 0; i < 12; i++) {
      c.fillStyle = i % 2 ? '#2f8f3a' : '#36a043';
      c.fillRect((i * W) / 12, 0, W / 12 + 1, H);
    }
    c.strokeStyle = '#eaf6ea';
    c.lineWidth = 4;
    c.strokeRect(20, 20, W - 40, H - 40);
    c.beginPath();
    c.moveTo(W / 2, 20);
    c.lineTo(W / 2, H - 20);
    c.stroke();
    c.beginPath();
    c.arc(W / 2, H / 2, 46, 0, PI * 2);
    c.stroke();
    c.strokeRect(20, H / 2 - 70, 70, 140);
    c.strokeRect(W - 90, H / 2 - 70, 70, 140);
  }, { repeat: false });
  const pm = new THREE.Mesh(new THREE.PlaneGeometry((R - 15) * 1.75, (R - 15) * 1.25), new THREE.MeshStandardMaterial({ map: pitch, roughness: 0.9, emissive: '#ffffff', emissiveMap: pitch, emissiveIntensity: 0.45 }));
  pm.rotation.x = -PI / 2;
  pm.position.y = 0.32;
  pm.scale.set(1 / sx, 1 / 0.9, 1);
  g.add(pm);
  // projektörler
  for (const [px, pz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = px * R * 0.78 * sx;
    const z = pz * R * 0.72 * 0.9;
    kit.cyl(0.25, 0.35, 22, M('#4a505c', 0.4, 0.7), x, 0, z, 10);
    kit.box(3, 1.6, 0.4, basicGlow('#f4f8ff'), x, 22, z, { cast: false, ry: Math.atan2(-x, -z) });
    kit.light(x * 0.8, 18, z * 0.8, '#eef4ff', 10, 30);
  }
  kit.light(0, 10, 0, '#eef4ff', 10, 36);
  // giriş kapısı (güney) + dev ekranlar
  const gz = R * 0.9 + 0.4;
  kit.box(8, 5, 1.2, M('#1b1f28', 0.5, 0.4), 0, 0, gz);
  kit.sign('macgunu', 'MAÇ GÜNÜ', 1.3, -0.0, 6.4, gz + 0.65, 0, { color: '#ffffff', bg: 'rgba(10,12,18,0.92)', border: '#ff3fa0', font: '900 110px Arial, sans-serif', glow: '#ff3fa0', li: 6, ld: 12 });
  kit.mesh(new THREE.PlaneGeometry(6, 3.2), glowMat('#ffe9a8', 0.6), 0, 2.4, gz + 0.62, 0, { cast: false });
  kit.sign('stadgir', 'NEON ARENA', 0.8, 0, 2.4, gz + 0.66, 0, { color: '#1a1a1a', font: '900 100px Arial, sans-serif', light: false });
  kit.pool(0, gz + 3, '#ff3fa0', 12, 0.16, 0.45);
  // çarpışma: elips yaklaşık (kare halkalar)
  const ex = R * sx;
  const ez = R * 0.9;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * PI * 2;
    kit.solid(Math.sin(a) * ex * 0.82, Math.cos(a) * ez * 0.82, ex * 0.28, ez * 0.28);
  }
  kit.solid(0, 0, ex * 0.8, ez * 0.8);
  kit.blocker(ex * 1.6, 14, ez * 1.6, 0, 0, 0);
  return { door: { x: 0, z: gz + 1.8 }, mapLabel: { text: 'STADYUM', y: 18, z: 0 } };
}

// --- FİLLER: şehir blokları (kuleler + zemin kat dükkânları) ------------------
const SHOPS = [
  ['ECZANE', '#39ff88', '#1d5c3a'], ['MARKET', '#ffd23f', '#7a1f2b'], ['BERBER', '#5ad8ff', '#1d3d5c'], ['OTEL', '#ff7ad9', '#4a1d5c'],
  ['DÖNER', '#ff9f45', '#7a1f2b'], ['TEKEL', '#ffe3ae', '#3a2f1d'], ['PİDE', '#ffbf6a', '#5c1a24'], ['KUAFÖR', '#ff7ad9', '#4a1d5c'],
  ['BÜFE', '#ffd23f', '#1d5c3a'], ['OPTİK', '#bfe3ff', '#1d3d5c'], ['ÇAY OCAĞI', '#ffcf7a', '#5c1a24'], ['TERZİ', '#e8e6df', '#22262f'],
];
const STYLES = ['apt_warm', 'apt_cool', 'office', 'brick', 'apt_warm', 'purple'];
const CROWNS = [null, null, '#ff3fa0', '#19e8ff', null, '#ff7ad9', null, '#ffd23f'];
export function buildFiller(kit, lot, seed, { tall = 1, plaza = false } = {}) {
  const { w, d } = lot;
  const r = rng(seed * 7919 + 13);
  kit.floor('kaldirim', w, d, 0, 0);
  const n = plaza ? 1 : r() < 0.4 ? 2 : r() < 0.6 ? 4 : 1;
  const cells = n === 1 ? [[0, plaza ? -d / 4 : 0, w - 2, plaza ? d / 2 - 1 : d - 2]] : n === 2 ? [[-w / 4, 0, w / 2 - 1.4, d - 2], [w / 4, 0, w / 2 - 1.4, d - 2]] : [[-w / 4, -d / 4, w / 2 - 1.4, d / 2 - 1.4], [w / 4, -d / 4, w / 2 - 1.4, d / 2 - 1.4], [-w / 4, d / 4, w / 2 - 1.4, d / 2 - 1.4], [w / 4, d / 4, w / 2 - 1.4, d / 2 - 1.4]];
  cells.forEach(([x, z, cw, cd], i) => {
    const tw = cw - r() * 2;
    const td = cd - r() * 2;
    const h = (12 + Math.floor(r() * 10) * 3.2) * tall;
    const style = STYLES[Math.floor(r() * STYLES.length)];
    tower(kit, { w: tw, d: td, h, x, z, style, crown: CROWNS[Math.floor(r() * CROWNS.length)], seed: seed + i * 5 });
    // ön yüzde dükkân (yola bakan taraf: +z)
    if (z + td / 2 > d / 2 - 4 || n === 1 || r() < 0.4) {
      const sh = SHOPS[Math.floor(r() * SHOPS.length)];
      shopfront(kit, { x, z: z + td / 2 + 0.05, w: Math.min(tw - 1, 8), text: sh[0], color: sh[1], awn: sh[2] });
    }
  });
  if (!plaza) {
    kit.item('streetlamp', w / 2 - 0.6, d / 2 - 0.6, 4);
    if (r() < 0.6) kit.item('trash', -w / 2 + 0.8, d / 2 - 0.8, 0, 0);
  }
}

// =============================================================================
// SEYYAR SATICI — kendi mekânı yok, doğrudan sokakta (v145 düzeninin özü)
// =============================================================================
export const VENDOR_STYLE = {
  kokorecci: { cart: 'kokorecarabasi', neon: 'neon_kokorec', glow: '#ff9f45', npc: 'npc_kokorecci' },
  simitci: { cart: 'simittezgahi', neon: 'neon_simit', glow: '#ffcf7a', npc: 'npc_simitci' },
  donerci: { cart: 'donerarabasi', neon: 'neon_doner', glow: '#ff6a3a', npc: 'npc_donerci' },
  kofteci: { cart: 'koftearabasi', neon: 'neon_kofte', glow: '#ff7ad9', npc: 'npc_kofteci' },
};
export function buildVendor(kit, key, venue) {
  const st = VENDOR_STYLE[key];
  // tabela direği + neon tabela (oyundaki aynı tabela)
  kit.box(0.12, 4.6, 0.12, M('#1b1b1d', 0.4, 0.7), -1.9, 0, -1.3);
  kit.box(0.12, 4.6, 0.12, M('#1b1b1d', 0.4, 0.7), 1.9, 0, -1.3);
  kit.box(4.0, 0.12, 0.12, M('#1b1b1d', 0.4, 0.7), 0, 4.5, -1.3);
  kit.item(st.neon, 0, -1.25, 0, 0, { solid: false, y: 1.5 });
  kit.item(st.cart, 0, 0, 0, 0);
  kit.item('streetlamp', -3.4, 0.2, 0, 0);
  kit.item('copkutusu', 3.2, -0.6, 0, 0);
  // plastik masalar
  for (const [mx, mz] of [[-2.2, 2.6], [1.8, 3.0]]) {
    kit.item('plastikmasa', mx, mz, 0, 0);
    kit.item('plastiktabure', mx - 0.75, mz, 0, 1);
    kit.item('plastiktabure', mx + 0.75, mz, 0, 1);
    kit.item('plastiktabure', mx, mz + 0.75, 0, 1);
  }
  kit.item('umbrella', -2.2, 2.6, 0, 0, { solid: false });
  kit.pool(0, 1, st.glow, 8, 0.17, 0.55);
  kit.light(0, 2.4, 0.8, st.glow, 6, 9);
  const npc = venue.npcs?.[0];
  if (npc) kit.npcs.push({ id: npc.id, name: npc.name, av: npc.av, x: 0.5, z: -0.7, lines: npc.lines, vendor: key });
  kit.zone({ x: 0, z: 1.2, r: 2.6, kind: 'vendor', vendor: key, title: venue.name, icon: venue.icon });
}
