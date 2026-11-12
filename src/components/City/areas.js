// =============================================================================
// SADECE ÖNİZLEME — haritaya doğrudan gömülü açık alanlar: Park, Yarış Pisti,
// Liman & Depo, sahil. Park artık tıklanıp girilen ayrı bir dünya değil; büyük
// haritada yürüyerek gidilir (Neon Park düzeninin büyütülmüş hali).
// =============================================================================
import { THREE, M, glowMat, basicGlow, canvasTex, floorMat, floorRep, planeGeo } from './kit.js';
import { VENUES } from '../../../functions/venueLayouts.js';

const PI = Math.PI;

function waterMaterial(key, base = '#16507a') {
  const tex = canvasTex(`su:${key}`, 256, 256, (g, w, h, r) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      g.strokeStyle = `rgba(160,220,255,${0.05 + r() * 0.12})`;
      g.lineWidth = 1 + r() * 2;
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 3, x + 16 + r() * 14, y);
      g.stroke();
    }
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, color: '#ffffff', roughness: 0.06, metalness: 0.35, emissive: base, emissiveIntensity: 0.25 });
  return m;
}

// --- NEON PARK (lot ~66 × 26) -----------------------------------------------
export function buildPark(kit, lot) {
  const { w, d } = lot;
  const V = VENUES.park;
  kit.floor('cim', w, d, 0, 0);
  // çevre çiti (çiçeklikler) — girişlerde boşluk
  const gaps = [-w / 2 + 7, -10, 6, w / 2 - 9];
  for (let x = -w / 2 + 1; x < w / 2 - 0.5; x += 1.3) {
    if (gaps.some((g) => Math.abs(g - x) < 2.2)) continue;
    kit.item('planter', x, d / 2 - 0.4, 0, (Math.floor(x) & 1) * 1);
    kit.item('planter', x, -d / 2 + 0.4, 4, 0);
  }
  // gölet (haritadaki parkın ortasındaki su)
  const pondX = -18;
  const rx = 7.5;
  const rz = 6.5;
  // v147.3: ana yol göletin İÇİNDEN geçmiyor — gölete kadar gelip halka yola bağlanır
  const pondL = pondX - rx - 1.5;
  const pondR = pondX + rx + 1.5;
  const segL = pondL - (-w / 2 + 1);
  const segR = w / 2 - 1 - pondR;
  kit.floor('kaldirim', segL, 2.6, -w / 2 + 1 + segL / 2, 0, 0.17);
  kit.floor('kaldirim', segR, 2.6, pondR + segR / 2, 0, 0.17);
  const inPond = (x, z, m = 1.6) => ((x - pondX) / (rx + m)) ** 2 + (z / (rz + m)) ** 2 < 1;
  gaps.forEach((gx) => {
    if (Math.abs(gx - pondX) < rx + 2) {
      // göletin üstündeki giriş yolu: göletin kenarında biter
      kit.floor('kaldirim', 2.6, d / 2 - rz - 1.2, gx, d / 2 - (d / 2 - rz - 1.2) / 2, 0.165);
      kit.floor('kaldirim', 2.6, d / 2 - rz - 1.2, gx, -d / 2 + (d / 2 - rz - 1.2) / 2, 0.165);
    } else kit.floor('kaldirim', 2.6, d, gx, 0, 0.165);
  });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48), waterMaterial('park', '#1a5b86'));
  pond.scale.set(rx, rz, 1);
  pond.rotation.x = -PI / 2;
  pond.position.set(pondX, 0.2, 0);
  kit.add(pond, true);
  kit.ticks.push({ obj: pond, ctl: { tick: (t) => { pond.material.map.offset.set(t * 0.01, t * 0.006); } } });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), M('#b8b0a2', 0.85));
  rim.scale.set(rx + 0.2, rz + 0.2, 4);
  rim.rotation.x = PI / 2;
  rim.position.set(pondX, 0.2, 0);
  rim.castShadow = false;
  rim.receiveShadow = true;
  kit.add(rim);
  // gölet etrafında halka yol
  const ring = new THREE.RingGeometry(1.0, 1.32, 48);
  const rep = floorRep('kaldirim');
  const uv = ring.attributes.uv;
  const pos = ring.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) * (rx + 1)) / rep, (pos.getY(i) * (rz + 1)) / rep);
  const ringM = new THREE.Mesh(ring, floorMat('kaldirim'));
  ringM.scale.set(rx + 0.1, rz + 0.1, 1);
  ringM.rotation.x = -PI / 2;
  ringM.position.set(pondX, 0.172, 0);
  ringM.receiveShadow = true;
  kit.add(ringM);
  // v147.3: gölete girilebilir — içine yürüdükçe batılır (mekânlardaki havuz gibi)
  kit.water(pondX, 0, rx, rz);
  // gölet köprüsü yerine: yol göleti ikiye ayırmasın → ana yol göletin iki yanından
  kit.item('guvercin', pondX + rx + 2.2, 2.2, 0, 0, { solid: false });
  // fıskiyeli meydan (Neon Park'ın merkezi)
  const fx = 8;
  kit.floor('kaldirim', 11, 11, fx, 0, 0.168);
  kit.item('fiskiye', fx, 0, 0, 0);
  kit.zone({ x: fx, z: 5.0, r: 0, kind: 'spawn', key: 'park', lx: fx, lz: 0 });
  kit.item('parkbench', fx - 3.6, 0, 2, 0);
  kit.item('parkbench', fx + 3.6, 0, 6, 0);
  kit.item('parkbench', fx, -3.8, 0, 0);
  kit.item('parkbench', fx - 1.6, 3.6, 4, 0);
  kit.item('planter', fx - 1.6, -4.8, 0, 2);
  kit.item('planter', fx + 1.6, -4.8, 0, 2);
  for (const [lx, lz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) kit.item('streetlamp', fx + lx, lz, lx < 0 ? 0 : 4, 0);
  // büfe (Büfeci Hasan) + masa
  const bx = fx + 9;
  kit.item('bufe', bx, -d / 2 + 3.2, 0, 0);
  kit.item('cafetable', bx + 3.4, -d / 2 + 4.6, 0, 0);
  kit.item('umbrella', bx + 3.4, -d / 2 + 4.6, 0, 0, { solid: false });
  kit.item('copkutusu', bx - 2.6, -d / 2 + 2.6, 0, 0);
  const bufeci = V.npcs.find((n) => n.id === 'npc_bufeci');
  kit.npcs.push({ ...bufeci, x: bx, z: -d / 2 + 2.98 });
  kit.zone({ x: bx, z: -d / 2 + 5, r: 2.4, kind: 'park', act: 'bufe', title: '🌭 Büfe', icon: '🌭' });
  // çocuk parkı (kum zemin)
  const px = w / 2 - 6;
  kit.floor('kum', 9, 11, px, 3, 0.169);
  kit.item('kaydirak', px - 2, 5, 2, 0);
  kit.item('salincak', px + 2, 1.5, 0, 0);
  kit.item('parkbench', px - 3.8, -3.2, 0, 0);
  // şüpheli adam — v147.4: fıskiye meydanının hemen arkasındaki gür ağaçlıkta
  const sx = 12.5;
  const sz = d / 2 - 3.6;
  kit.item('copkutusu', sx + 1.1, sz + 0.6, 0, 0);
  const sup = V.npcs.find((n) => n.id === 'npc_supheli');
  kit.npcs.push({ ...sup, x: sx, z: sz });
  kit.zone({ x: sx + 0.4, z: sz - 1.6, r: 2.4, kind: 'park', act: 'npc', title: '🕶️ Şüpheli adam', icon: '🕶️' });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + 0.3;
    const rr = 2.6 + (i % 3) * 0.9;
    const tx = sx + Math.cos(a) * rr;
    const tz = sz + Math.sin(a) * rr;
    if (Math.abs(tx - sx - 0.4) < 1.3 && tz < sz) continue; // meydandan yanına giden boşluk
    if (tz > d / 2 - 0.9 || tz < 6.2 || gaps.some((gp) => Math.abs(tx - gp) < 1.8)) continue;
    kit.item(i % 4 ? 'tree' : 'plantb', tx, tz, i, 0, { scale: 1.3 + (i % 3) * 0.25, solid: i % 4 !== 0 });
  }
  // doğma noktası: 4 banklı fıskiye meydanı (aşağıda) — parka tıklayınca orada doğulur
  // ağaçlar (haritadaki gür park) — yollara ve meydana basmayan noktalar
  const r = (() => { let q = 77; return () => ((q = (q * 16807) % 2147483647) - 1) / 2147483646; })();
  const onPath = (x, z) => Math.abs(z) < 2.6 || gaps.some((g) => Math.abs(g - x) < 2.6) || (Math.abs(x - fx) < 6.5 && Math.abs(z) < 6.5) || ((x - pondX) / (rx + 2.2)) ** 2 + (z / (rz + 2.2)) ** 2 < 1 || (x > w / 2 - 11 && z > -3) || (x > bx - 3 && x < bx + 6 && z < -d / 2 + 7) || Math.hypot(x - sx, z - sz) < 2.2;
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 34; tries++) {
    const x = -w / 2 + 1.5 + r() * (w - 3);
    const z = -d / 2 + 1.5 + r() * (d - 3);
    if (onPath(x, z)) continue;
    kit.item(r() < 0.25 ? 'palm' : 'tree', x, z, Math.floor(r() * 8), 0, { scale: 1.2 + r() * 0.7 });
    placed++;
  }
  // çalılar (büyük bitki)
  for (let tries = 0; tries < 200 && placed < 60; tries++) {
    const x = -w / 2 + 1.5 + r() * (w - 3);
    const z = -d / 2 + 1.5 + r() * (d - 3);
    if (onPath(x, z)) continue;
    kit.item('plantb', x, z, 0, 0, { scale: 1.3, solid: false });
    placed++;
  }
  // yol kenarı lamba + banklar — v147.3: göletin içine düşenler konmaz
  for (const x of [-28, -14, 0, 18, 28]) {
    if (!inPond(x, 2.0)) kit.item('streetlamp', x, 2.0, 4, 0);
    if (!inPond(x + 6, -2.0)) kit.item('streetlamp', x + 6, -2.0, 0, 0);
  }
  for (const x of [-25, -5, 23]) {
    if (!inPond(x, 2.3)) kit.item('parkbench', x, 2.3, 4, 0);
    if (!inPond(x + 2, -2.3)) kit.item('parkbench', x + 2, -2.3, 0, 0);
  }
  // göletin kıyısında, halka yolun dışında 2 bank + 2 lamba
  kit.item('parkbench', pondX, rz + 2.3, 4, 0);
  kit.item('parkbench', pondX, -rz - 2.3, 0, 0);
  kit.item('streetlamp', pondX - rx - 2.0, rz * 0.6, 0, 0);
  kit.item('streetlamp', pondX + rx + 2.0, -rz * 0.6, 4, 0);
  kit.light(pondX, 3, 0, '#9fd6ff', 6, 12);
  kit.light(fx, 3, 0, '#ffe2b0', 6, 12);
  return { mapLabel: { text: 'PARK', y: 6, z: 0, x: pondX }, center: { x: 0, z: 0 } };
}

// --- YARIŞ PİSTİ (lot ~66 × 26) ---------------------------------------------
export function buildPist(kit, lot) {
  const { w, d } = lot;
  kit.floor('cim', w, d, 0, 0);
  const R = 7.6; // virajın orta çizgi yarıçapı
  const TW = 5.2; // pist genişliği
  const L = w - 2 * (R + TW / 2) - 4; // düzlük
  const cz = 2; // pistin merkezi (arkada tribün)
  const asphalt = floorMat('asfalt');
  const rep = floorRep('asfalt');
  // düzlükler
  for (const s of [-1, 1]) kit.mesh(planeGeo(L, TW, L / rep, TW / rep), asphalt, 0, 0.18, cz + s * R, 0, { cast: false, rx: -PI / 2 });
  // virajlar
  for (const s of [-1, 1]) {
    const geo = new THREE.RingGeometry(R - TW / 2, R + TW / 2, 40, 1, s > 0 ? -PI / 2 : PI / 2, PI);
    const uv = geo.attributes.uv;
    const p = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / rep, p.getY(i) / rep);
    kit.mesh(geo, asphalt, s * L / 2, 0.181, cz, 0, { cast: false, rx: -PI / 2 });
  }
  // kerbler (kırmızı-beyaz)
  const red = M('#d62828', 0.6);
  const white = M('#f1f1f1', 0.6);
  const kerb = (x, z, ry, k) => kit.box(1.0, 0.06, 0.4, k % 2 ? red : white, x, 0.18, z, { ry, cast: false });
  for (const side of [-1, 1]) {
    for (const edge of [-1, 1]) {
      const rr = R + edge * (TW / 2 + 0.2);
      let k = 0;
      for (let x = -L / 2; x < L / 2; x += 1.0) kerb(x + 0.5, cz + side * rr, 0, k++);
      const n = Math.floor((PI * rr) / 1.0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI - PI / 2;
        // v154: sol virajda teğet aynalanır (eskiden iki virajda aynı açı → sol viraj kerbleri çapraz/bozuktu)
        kerb(side * (L / 2 + Math.cos(a) * rr), cz + Math.sin(a) * rr, side > 0 ? -a + PI / 2 : a + PI / 2, i);
      }
    }
  }
  // start / bitiş çizgisi (dama)
  const chk = canvasTex('dama', 64, 256, (g, W, H) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      g.fillRect((x * W) / 4, (y * H) / 16, W / 4, H / 16);
    }
  }, { repeat: false });
  // v154: dama pisti ENİNE keser (start kemerinin altında); eskiden pist boyunca uzanıyordu
  kit.mesh(new THREE.PlaneGeometry(1.2, TW), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7 }), 6, 0.19, cz + R, 0, { cast: false, rx: -PI / 2 });
  // ışıklı skor panosu + start kemeri
  kit.box(0.3, 4.8, 0.3, M('#2a2d33', 0.4, 0.7), 6, 0, cz + R + TW / 2 + 0.8);
  kit.box(0.3, 4.8, 0.3, M('#2a2d33', 0.4, 0.7), 6, 0, cz + R - TW / 2 - 0.8);
  kit.box(0.4, 0.8, TW + 2, M('#14161b', 0.4), 6, 4.6, cz + R);
  kit.sign('pistsign', 'NEON PİST', 0.6, 6.22, 5.0, cz + R, PI / 2, { color: '#ffe95a', glow: '#ff3a2a', font: '900 100px Arial, sans-serif', li: 5, ld: 9 });
  // tribün (arka)
  for (let i = 0; i < 7; i++) kit.item('bleacher', -15 + i * 3.2, -d / 2 + 1.6, 0, 0);
  kit.box(24, 0.25, 3.6, M('#2a2e38', 0.5, 0.4), -5.4, 4.2, -d / 2 + 1.6);
  for (let i = 0; i < 5; i++) kit.box(0.2, 4.2, 0.2, M('#3a3e47', 0.4, 0.6), -16.4 + i * 5.5, 0, -d / 2 + 0.2);
  kit.box(23, 0.08, 0.08, glowMat('#ff3a2a', 2.4), -5.4, 4.1, -d / 2 + 3.4, { cast: false });
  // v154 — PIT LOUNGE: yarışçıların dinlenme alanı (açık önlü, çatılı salon; oturulur).
  // Önü piste bakar; içeride koltuklar, bar masası, TV, içecek dolabı. Yanında "🏁 Yarış Pisti".
  {
    const px = 19;
    const back = -d / 2 + 0.4; // arka duvar
    // v157: ön kenar pistin dış kerbinin 1 m gerisinde (eskiden pit duvarları/çatısı piste taşıyordu)
    const front = Math.min(-d / 2 + 5.6, cz - R - TW / 2 - 1.0); // açık ön kenar
    const pd = front - back;
    const pz = (back + front) / 2;
    kit.floor('epoksi_siyah', 9, pd, px, pz, 0.16);
    kit.wallBox('beton_blok', 9.2, 3.6, 0.3, px, 0, back, { tint: '#2a2d35' });
    for (const sx of [-1, 1]) kit.wallBox('beton_blok', 0.3, 3.6, pd, px + sx * 4.6, 0, pz, { tint: '#2a2d35' });
    kit.box(9.8, 0.3, pd + 0.5, M('#1a1d24', 0.5, 0.4), px, 3.6, pz + 0.1);
    kit.box(9.8, 0.08, 0.08, glowMat('#ff3a2a', 2.6), px, 3.55, front + 0.33, { cast: false });
    kit.sign('pitlounge', 'PIT LOUNGE', 0.62, px, 3.05, front + 0.37, 0, { color: '#ffffff', glow: '#ff3a2a', font: '900 100px Arial, sans-serif', light: false });
    // duvarlar (çarpışma): arka + iki yan
    kit.solid(px, back, 4.6, 0.25);
    for (const sx of [-1, 1]) kit.solid(px + sx * 4.6, pz, 0.25, pd / 2);
    // içerisi: koltuklar (oturulur), sehpa, bar masası + tabureler, TV, içecek dolabı
    kit.item('sofa2', px - 2.2, back + 0.9, 0, 0);
    kit.item('armchair', px - 3.6, pz + 0.3, 2, 0);
    kit.item('tvwall', px - 2.2, back + 0.25, 0, 0, { solid: false });
    kit.item('bartable', px + 1.4, pz + 0.2, 0, 0);
    kit.item('stool', px + 0.7, pz + 0.2, 0, 0);
    kit.item('stool', px + 2.1, pz + 0.2, 0, 0);
    kit.item('drinkfridge', px + 3.8, back + 0.6, 0, 0);
    kit.item('toolchest', px + 2.2, back + 0.6, 0, 0);
    kit.item('tires', px + 3.9, front - 0.7, 0, 0);
    kit.item('neon3', px + 0.2, back + 0.2, 0, 0, { solid: false });
    kit.light(px, 3.1, pz, '#ffe9c4', 5, 10);
    kit.pool(px, front + 0.3, '#ff3a2a', 7, 0.17, 0.4);
    // pitin önü: "🏁 Yarış Pisti" (yarışlara buradan katılınır)
    kit.zone({ x: px, z: front + 0.3, r: 3.2, kind: 'pist', title: '🏁 Pit · Yarış', icon: '🏁' });
  }
  // lastik bariyerler + koniler
  // v157: lastik bariyer virajın dış kerbinin dışında (eskiden kerbe/piste biniyordu)
  const tx = Math.min(w / 2 - 0.7, L / 2 + R + TW / 2 + 1.1);
  for (const x of [-tx, tx]) for (let z = -6; z <= 8; z += 1.4) kit.item('tires', x, cz + z, 0, 0);
  kit.item('cone', 0, cz, 0, 0);
  kit.item('cone', -4, cz, 0, 0);
  kit.item('cone', 4, cz, 0, 0);
  kit.item('portlight', -w / 2 + 3, -d / 2 + 1, 2, 0);
  kit.item('portlight', w / 2 - 3, -d / 2 + 1, 6, 0);
  kit.light(-12, 6, cz, '#eef4ff', 8, 22);
  kit.light(12, 6, cz, '#eef4ff', 8, 22);
  kit.zone({ x: 2, z: d / 2 - 1.2, r: 3, kind: 'pist', title: '🏁 Yarış Pisti', icon: '🏁' });
  // v154: pist alanı — tribünde / pitte otururken de "🏁 Yarış Pisti" butonu çıksın
  kit.area(0, 0, w * 0.62, d * 0.62, 'pist'); // elips: köşedeki pit ve tribün de içinde
  // v154: tribünün çarpışması tribünün kendisi kadar (-17,4…6,6) — eskiden x=12'ye kadar uzanıp
  // tribün ile pit arasındaki geçidi görünmez duvarla kapatıyordu
  kit.solid(-5.4, -d / 2 + 1.6, 12, 1.4); // tribün
  // pistte dönen arabalar için yol (motor kullanır)
  const track = { L, R, cz, w, d };
  return { mapLabel: { text: 'YARIŞ PİSTİ', y: 7, z: cz }, track };
}

// --- LİMAN & DEPO -------------------------------------------------------------
// lot: kara tarafı (depo + konteyner sahası); rıhtım ve gemiler denizde (sahil
// yolunun güneyi) ayrıca kurulur → buildQuay
export function buildLiman(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  // depo binası
  const bw = 22;
  const bd = 12;
  const bx = -w / 2 + bw / 2 + 2;
  const bz = -d / 2 + bd / 2 + 1;
  kit.wallBox('beton_blok', bw, 8, bd, bx, 0, bz, { tint: '#9aa5b1' });
  kit.box(bw + 0.6, 0.6, bd + 0.6, M('#3a4048', 0.6, 0.4), bx, 8, bz);
  for (let i = 0; i < 3; i++) kit.item('garagedoor', bx - 7 + i * 7, bz + bd / 2, 0, 0, { solid: false });
  kit.sign('depo', 'LİMAN & DEPO', 1.3, bx, 6.6, bz + bd / 2 + 0.06, 0, { color: '#ffffff', glow: '#ffb15a', font: '900 110px Arial, sans-serif', li: 8, ld: 14 });
  kit.mass(bw, 8.6, bd, bx, bz);
  kit.item('portlight', bx + bw / 2 + 1, bz + bd / 2 + 1, 6, 0);
  // konteyner istifleri (renkli)
  const cx0 = w / 2 - 14;
  let n = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const h = 1 + ((row * 3 + col) % 3);
      for (let k = 0; k < h; k++) kit.item('container', cx0 + col * 4.6, -d / 2 + 3 + row * 2.4, 0, (n++ % 6), { y: k * 1.77, solid: k === 0 });
    }
  }
  kit.item('forklift', cx0 - 4, 2, 2, 0);
  kit.item('truck', 6, d / 2 - 4, 2, 1);
  kit.item('pallets', bx + 8, bz + bd / 2 + 2.2, 0, 0);
  kit.item('crates', bx - 9, bz + bd / 2 + 2.2, 0, 0);
  kit.pool(bx, bz + bd / 2 + 2, '#ffb15a', 12, 0.16, 0.45);
  return { door: { x: bx, z: bz + bd / 2 + 1.4 }, mapLabel: { text: 'LİMAN & DEPO', y: 11, z: bz, x: bx } };
}
export function buildQuay(kit, { w, d }) {
  // rıhtım (yerel: +z denize doğru); d = rıhtım derinliği
  kit.box(w, 0.9, d, M('#6b7078', 0.85), 0, -0.75, 0);
  kit.floor('beton', w, d, 0, 0, 0.16);
  kit.box(w, 0.3, 0.4, M('#e5b62b', 0.6), 0, 0.15, d / 2 - 0.2, { cast: false });
  for (let x = -w / 2 + 2; x < w / 2; x += 6) kit.item('bollard', x, d / 2 - 0.8, 0, 0);
  kit.item('crane', -w / 4, 0, 0, 0);
  kit.item('crane', w / 4, 0, 0, 0);
  for (let i = 0; i < 4; i++) kit.item('container', -w / 2 + 6 + i * 4.6, -d / 2 + 2.2, 0, (i * 2) % 6, { y: 0 });
  kit.item('portlight', -w / 2 + 1, 0, 2, 0);
  kit.item('portlight', w / 2 - 1, 0, 6, 0);
  kit.solid(0, d / 2 + 0.3, w / 2, 0.3); // su kenarı
  // v152: yanlar sahil kaldırımını (ilk ~3 m) kapatmasın — kaldırımın bittiği yerde görünmez duvar vardı
  kit.solid(-w / 2 - 0.3, 1.5, 0.3, d / 2 - 1.5);
  kit.solid(w / 2 + 0.3, 1.5, 0.3, d / 2 - 1.5);
}

// Kargo gemisi (gövde + konteynerler) — denizde hafifçe sallanır
export function cargoShip(kit, x, z, ry, len = 34, seed = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  kit.add(g, true);
  const hull = new THREE.Shape();
  hull.moveTo(-len / 2, -3.2);
  hull.lineTo(len / 2 - 5, -3.2);
  hull.quadraticCurveTo(len / 2 + 1, -2.6, len / 2 + 2, 0);
  hull.quadraticCurveTo(len / 2 + 1, 2.6, len / 2 - 5, 3.2);
  hull.lineTo(-len / 2, 3.2);
  hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 3.4, bevelEnabled: false });
  hg.rotateX(-PI / 2);
  const hm = new THREE.Mesh(hg, M('#1f3b4a', 0.6, 0.3));
  hm.position.y = -1.6;
  hm.castShadow = true;
  g.add(hm);
  const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 6.5), M('#b3261e', 0.7));
  band.position.y = -1.3;
  g.add(band);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 6.3), M('#3a3f46', 0.8));
  deck.position.y = 1.85;
  g.add(deck);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 5.6), M('#e8e6df', 0.6));
  bridge.position.set(-len / 2 + 2.6, 4.4, 0);
  bridge.castShadow = true;
  g.add(bridge);
  const win = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.6, 5.65), glowMat('#ffe2b0', 1.4));
  win.position.set(-len / 2 + 2.6, 6.2, 0);
  g.add(win);
  const cols = ['#c0392b', '#2471a3', '#d68910', '#1e8449', '#7d3c98', '#5d6d7e'];
  let k = seed;
  for (let i = 0; i < Math.floor((len - 9) / 3.2); i++) {
    for (let j = 0; j < 2; j++) {
      const h = 1 + ((i + j + seed) % 3);
      for (let t = 0; t < h; t++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.9), M(cols[k++ % cols.length], 0.65, 0.2));
        c.position.set(-len / 2 + 6.5 + i * 3.2, 3.15 + t * 2.45, j ? 1.5 : -1.5);
        c.castShadow = true;
        g.add(c);
      }
    }
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), basicGlow('#ff3a2a'));
  lamp.position.set(len / 2 + 1.5, 3, 0);
  g.add(lamp);
  const ph = seed * 1.7;
  kit.ticks.push({ obj: g, ctl: { tick: (t) => {
    g.position.y = Math.sin(t * 0.7 + ph) * 0.12 - 0.1;
    g.rotation.z = Math.sin(t * 0.5 + ph) * 0.012;
  } } });
  kit.solid(0, 0, len / 2 + 1, 3.4, 0);
  // yerel kutu ry ile döner: solid kitin grubuna göre; geminin dönüşünü uygula
  kit.solids[kit.solids.length - 1].o.rotation.y = ry;
  kit.solids[kit.solids.length - 1].o.position.set(x, 0, z);
}

// Deniz (sahil yolunun güneyi)
export function buildSea(kit, { x0, x1, z0, z1 }) {
  const m = waterMaterial('deniz', '#0c3555');
  m.map.repeat.set((x1 - x0) / 18, (z1 - z0) / 18);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
  sea.rotation.x = -PI / 2;
  sea.position.set((x0 + x1) / 2, -0.6, (z0 + z1) / 2);
  sea.receiveShadow = true;
  kit.add(sea, true);
  kit.ticks.push({ obj: sea, ctl: { tick: (t) => m.map.offset.set(t * 0.004, t * 0.009) } });
}


