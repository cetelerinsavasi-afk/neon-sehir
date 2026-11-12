// =============================================================================
// v151 — MESLEK YAPILARI: 2 lojistik deposu, hastane (acil girişi), benzinlik,
// 10 otobüs durağı, liman yükleme alanı. Koordinatlar functions/cityJobsData.js ile
// aynı (lot yereli: +z = lotun önü / yola bakan taraf).
// =============================================================================
import { THREE, M, glowMat } from './kit.js';

const YELLOW = () => M('#e8b923', 0.6);

// yerde boyalı alan (sarı çerçeve + çapraz çizgiler) — tır/ambulans burada durur
export function paintBay(kit, x, z, w, d, color = '#e8b923', label = null, y = 0.15) {
  const m = M(color, 0.6);
  kit.box(w, 0.02, 0.3, m, x, y, z - d / 2, { cast: false });
  kit.box(w, 0.02, 0.3, m, x, y, z + d / 2, { cast: false });
  kit.box(0.3, 0.02, d, m, x - w / 2, y, z, { cast: false });
  kit.box(0.3, 0.02, d, m, x + w / 2, y, z, { cast: false });
  for (let i = -2; i <= 2; i++) kit.box(0.22, 0.02, Math.hypot(w, d) * 0.28, m, x + i * (w / 6), y, z, { cast: false, ry: 0.6 });
  if (label) {
    const g = kit.sign(`bay_${label}`, label, 0.9, x, y + 0.02, z, 0, { color: '#1a1a1a', bg: color, font: '900 110px Arial, sans-serif', light: false });
    g.rotation.x = -Math.PI / 2;
  }
}

// --- LOJİSTİK DEPOSU (dış bölge) ---------------------------------------------------------
export function buildLojistik(kit, lot, { name = 'LOJİSTİK DEPOSU', accent = '#ffb15a' } = {}) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  const bw = 22;
  const bd = 10;
  const bz = -d / 2 + bd / 2 + 0.5;
  kit.wallBox('beton_blok', bw, 9, bd, 0, 0, bz, { tint: '#8d97a6' });
  kit.box(bw + 0.6, 0.6, bd + 0.6, M('#3a4048', 0.6, 0.4), 0, 9, bz);
  // yükleme kapıları + rampalar
  for (let i = 0; i < 3; i++) {
    const x = -7 + i * 7;
    kit.item('garagedoor', x, bz + bd / 2, 0, 0, { solid: false });
    kit.box(4.2, 0.8, 1.2, M('#55606e', 0.8), x, 0, bz + bd / 2 + 0.6);
  }
  kit.sign(`lojistik_${name}`, name, 1.15, 0, 7.4, bz + bd / 2 + 0.06, 0, { color: '#ffffff', glow: accent, font: '900 104px Arial, sans-serif', li: 8, ld: 14 });
  kit.box(bw, 0.12, 0.12, glowMat(accent, 2.4), 0, 6.5, bz + bd / 2 + 0.05, { cast: false });
  kit.mass(bw, 9.6, bd, 0, bz);
  kit.solid(0, bz + bd / 2 + 0.6, bw / 2 - 1, 0.6);
  // yan istifler (yolu kapatmaz): konteyner + palet
  for (let k = 0; k < 2; k++) kit.item('container', -w / 2 + 2.6, -2 + k * 2.4, 2, (k + 2) % 6);
  kit.item('container', -w / 2 + 2.6, -2, 2, 4, { y: 1.77, solid: false });
  kit.item('pallets', w / 2 - 2, -1, 0, 0);
  kit.item('crates', w / 2 - 2, 2, 0, 0);
  kit.item('forklift', w / 2 - 3.5, -4, 6, 0);
  // teslim alanı (cityJobsData.DEPOTS ile aynı: lot önünden 6 m içeride)
  paintBay(kit, 0, d / 2 - 6, 9, 7, '#e8b923', 'TESLİM');
  kit.pool(0, d / 2 - 6, accent, 12, 0.16, 0.35);
  kit.item('portlight', -w / 2 + 1, d / 2 - 1, 0, 0);
  kit.item('portlight', w / 2 - 1, d / 2 - 1, 0, 0);
  return { mapLabel: { text: name, y: 13, z: bz } };
}
export const buildDepoKuzey = (kit, lot) => buildLojistik(kit, lot, { name: 'KUZEY LOJİSTİK DEPOSU', accent: '#ffb15a' });
export const buildDepoDogu = (kit, lot) => buildLojistik(kit, lot, { name: 'DOĞU LOJİSTİK DEPOSU', accent: '#19e8ff' });

// --- HASTANE (acil girişi önde) -------------------------------------------------------------
export function buildHastane(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  const bw = 20;
  const bd = 11;
  const bz = -d / 2 + bd / 2 + 0.5;
  kit.wallBox('beton_duvar', bw, 13, bd, 0, 0, bz, { tint: '#eef2f6' });
  kit.box(bw + 0.4, 0.4, bd + 0.4, M('#c9d3de', 0.6), 0, 13, bz);
  // pencere bantları
  for (let f = 0; f < 3; f++) kit.box(bw - 1.5, 1.3, 0.05, glowMat(f === 0 ? '#bfe6ff' : '#dff2ff', 0.8), 0, 2 + f * 3.6, bz + bd / 2 + 0.03, { cast: false });
  // kırmızı haç + yazı
  const red = glowMat('#ff2a3a', 2.6);
  kit.box(0.9, 3.2, 0.2, red, bw / 2 - 2.6, 9.4, bz + bd / 2 + 0.1, { cast: false });
  kit.box(3.2, 0.9, 0.2, red, bw / 2 - 2.6, 9.4, bz + bd / 2 + 0.1, { cast: false });
  kit.sign('hastane', 'HASTANE', 1.4, -3, 10.6, bz + bd / 2 + 0.06, 0, { color: '#ffffff', glow: '#ff2a3a', font: '900 120px Arial, sans-serif', li: 8, ld: 14 });
  // acil girişi saçağı
  kit.box(8, 0.3, 4.5, M('#d9e1ea', 0.5, 0.2), 0, 3.6, bz + bd / 2 + 2.25);
  for (const x of [-3.7, 3.7]) kit.box(0.3, 3.6, 0.3, M('#c0c8d2', 0.5), x, 0, bz + bd / 2 + 4.3);
  kit.sign('acil', 'ACİL', 0.8, 0, 4.25, bz + bd / 2 + 4.52, 0, { color: '#ffffff', glow: '#ff2a3a', bg: '#c8141e', font: '900 110px Arial, sans-serif', li: 6, ld: 10 });
  kit.item('door_cam', 0, bz + bd / 2, 0, 0, { solid: false });
  kit.mass(bw, 13.4, bd, 0, bz);
  kit.solid(-3.7, bz + bd / 2 + 4.3, 0.2, 0.2);
  kit.solid(3.7, bz + bd / 2 + 4.3, 0.2, 0.2);
  // ambulans alanı (cityJobsData.HOSPITAL: lot önünden 4 m içeride)
  paintBay(kit, 0, d / 2 - 4, 8, 6, '#ff2a3a', 'AMBULANS');
  kit.pool(0, bz + bd / 2 + 3, '#ff2a3a', 12, 0.16, 0.4);
  return { mapLabel: { text: 'HASTANE', y: 16, z: bz } };
}

// --- BENZİNLİK --------------------------------------------------------------------------------
export function buildBenzinlik(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  // market (arkada) — v156: cam vitrinli gerçek market; içi oyunun market mobilyaları, kasada kasiyer.
  // Bina girilmez (kütle); kapının önünde "🛒 Market" düğmesi (sunucu: cityAction marketBuy).
  const bw = 12;
  const bd = 7;
  const bz = -d / 2 + bd / 2 + 0.5;
  const mx = -5;
  const fz = bz + bd / 2; // ön cephe (cam)
  const H = 4.4;
  kit.floor('zemin_beyaz', bw - 0.4, bd - 0.4, mx, bz, 0.16);
  kit.wallBox('beton_duvar', bw, H, 0.25, mx, 0, bz - bd / 2 + 0.125, { tint: '#f2f2ee' }); // arka
  kit.wallBox('beton_duvar', 0.25, H, bd, mx - bw / 2 + 0.125, 0, bz, { tint: '#f2f2ee' }); // sol
  kit.wallBox('beton_duvar', 0.25, H, bd, mx + bw / 2 - 0.125, 0, bz, { tint: '#f2f2ee' }); // sağ
  kit.box(bw + 0.3, 0.3, bd + 0.3, M('#e6e8ea', 0.6), mx, H, bz); // çatı
  kit.box(bw + 0.3, 0.9, 0.12, M('#1c7a46', 0.5, 0.2), mx, H - 0.9, fz + 0.02); // yeşil saçak bandı
  // cam vitrin + otomatik kapı (kapı boşluğu x = mx + 3)
  const glass = new THREE.MeshStandardMaterial({ color: '#bfe6ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const dx = mx + 3;
  const seg = (x0, x1) => {
    const w = x1 - x0;
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, H - 1.0, 0.05), glass);
    g.position.set((x0 + x1) / 2, (H - 1.0) / 2 + 0.12, fz);
    kit.add(g);
  };
  seg(mx - bw / 2 + 0.25, dx - 0.8);
  seg(dx + 0.8, mx + bw / 2 - 0.25);
  for (const x of [mx - bw / 2 + 0.25, dx - 0.8, dx + 0.8, mx + bw / 2 - 0.25]) kit.box(0.08, H - 0.9, 0.1, M('#2a2f3a', 0.5, 0.5), x, 0.12, fz);
  kit.item('door_market', dx, fz, 0, 0, { solid: false });
  // içerisi: içecek dolapları (arka duvar), raf sıraları, kasa
  for (const x of [-9.6, -8.7, -7.8, -6.9]) kit.item('drinkfridge', x, bz - bd / 2 + 0.55, 0, 0);
  for (const z of [bz - 0.9, bz + 1.0]) {
    kit.item('shelf', mx - 3.2, z, 0, 0);
    kit.item('shelf', mx - 1.2, z, 0, 0);
  }
  kit.item('beltcheckout', mx + 3.6, bz + 0.2, 6, 0);
  kit.item('plantb', mx + bw / 2 - 0.7, fz - 0.6, 0, 0);
  kit.light(mx, H - 0.5, bz, '#f4fbff', 5, 9);
  kit.box(bw - 0.6, 0.06, 0.4, glowMat('#eaf6ff', 1.6), mx, H - 0.1, bz, { cast: false });
  kit.sign('benzinmarket', 'MARKET 7/24', 0.7, mx, H - 0.45, fz + 0.09, 0, { color: '#ffffff', glow: '#3ad07a', font: '900 100px Arial, sans-serif', li: 5, ld: 9 });
  kit.mass(bw, H + 0.2, bd, mx, bz);
  // kasiyer (cam arkasında görünür) + kapı önünde market düğmesi
  kit.npcs.push({
    id: 'npc_benzinci',
    name: 'Kasiyer Selin',
    av: { gender: 'kadin', build: 'standart', skin: '#e0ac69', hairStyle: 'ponytail', hairColor: '#3b2a1a', clothing: 'vest', clothColor: '#1c7a46', neckAcc: 'none', pantsColor: '#22262f' },
    x: mx + 4.6,
    z: bz + 0.2,
    lines: ['Hoş geldiniz!', 'Kola soğuk, cips taze!', 'Benzin dışarıda, pompalarda.'],
  });
  kit.zone({ x: dx, z: fz + 1.4, r: 2.4, kind: 'market', title: '🛒 Benzinlik Market' });
  // v152: kanopi, pompalar, fiyat totemi, hava makinesi, oto yıkama — Benzinlik mobilyaları
  const cz = 3;
  for (const x of [-4.4, 4.4]) {
    kit.item('canopy', x, cz, 0, 0, { scale: 1.55 });
    kit.item('pump', x - 1.6, cz, 2, 0);
    kit.item('pump', x + 1.6, cz, 2, 0);
  }
  kit.light(0, 4.6, cz, '#f2fff6', 9, 16);
  kit.item('pricesign', w / 2 - 1.6, d / 2 - 1.6, 0, 0, { scale: 1.6 });
  kit.item('airpump', 3.5, bz + bd / 2 + 1.2, 4, 0);
  kit.item('carwash', w / 2 - 3.2, -d / 2 + 4.5, 2, 0);
  kit.item('cone', -w / 2 + 1.5, d / 2 - 2, 0, 0);
  kit.item('cone', -w / 2 + 1.5, d / 2 - 4, 0, 0);
  kit.sign('benzinlik', 'NEON PETROL', 0.9, -5, 5.2, bz + bd / 2 + 0.12, 0, { color: '#3ad07a', glow: '#3ad07a', font: '900 100px Arial, sans-serif', li: 5, ld: 9 });
  kit.pool(0, cz, '#3ad07a', 16, 0.16, 0.3);
  return { mapLabel: { text: 'BENZİNLİK', y: 9, z: cz } };
}

// --- OTOBÜS DURAĞI (kaldırımda, yola bakar) -------------------------------------------------
// kit dünya kökünde; stop: { n, name, sx, sz, fx, fz } (f: şeritten kaldırıma)
export function buildBusStop(kit, stop) {
  const g = new THREE.Group();
  g.position.set(stop.sx + stop.fx * 0.4, 0.12, stop.sz + stop.fz * 0.4);
  g.rotation.y = Math.atan2(-stop.fx, -stop.fz); // açık yüz yola dönük
  kit.add(g);
  const add = (geo, mat, x, y, z) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const frame = M('#2a2f3a', 0.5, 0.5);
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd8ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  add(new THREE.BoxGeometry(3.6, 0.12, 1.6), M('#e8eef4', 0.5), 0, 2.5, -0.2); // çatı
  add(new THREE.BoxGeometry(3.6, 0.06, 1.62), glowMat('#19e8ff', 2), 0, 2.43, -0.2);
  add(new THREE.BoxGeometry(3.5, 2.3, 0.04), glass, 0, 1.2, -0.95); // arka cam
  for (const x of [-1.75, 1.75]) {
    add(new THREE.BoxGeometry(0.08, 2.5, 0.08), frame, x, 1.25, -0.95);
    add(new THREE.BoxGeometry(0.08, 2.5, 0.08), frame, x, 1.25, 0.55);
    add(new THREE.BoxGeometry(0.04, 2.1, 1.4), glass, x, 1.25, -0.2); // yan camlar
  }
  add(new THREE.BoxGeometry(2.6, 0.08, 0.45), M('#6b4423', 0.7), 0, 0.5, -0.65); // bank
  // tabela direği + durak levhası
  add(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 8), frame, 2.1, 1.55, 0.55);
  const tex = signTex(stop);
  const pm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), pm);
  p.position.set(2.1, 2.75, 0.56);
  g.add(p);
  // durak çizgisi (şeritte sarı "OTOBÜS" alanı)
  const bay = new THREE.Group();
  bay.position.set(stop.x, 0.01, stop.z);
  bay.rotation.y = Math.abs(stop.fx) > 0.5 ? Math.PI / 2 : 0; // yerel x = yol yönü
  kit.add(bay);
  const ym = YELLOW();
  const zig = (x, z, w2, d2, ry = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.02, d2), ym);
    o.position.set(x, 0.005, z);
    o.rotation.y = ry;
    bay.add(o);
  };
  for (let i = -5; i <= 5; i++) zig(i * 1.2, 0, 0.18, 1.4, i % 2 ? 0.7 : -0.7);
  const alongX = Math.abs(stop.fz) > 0.5;
  kit.solid(stop.sx + stop.fx * 0.6, stop.sz + stop.fz * 0.6, alongX ? 1.8 : 0.8, alongX ? 0.8 : 1.8);
  kit.label(`🚏 ${stop.name}`, stop.sx, 3.4, stop.sz, 'vendor');
}
function signTex(stop) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1745b5';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#ffffff';
  x.font = '900 120px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('🚌', 128, 92);
  x.font = '900 46px Arial';
  x.fillText(`DURAK ${stop.n}`, 128, 196);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- v154 TAKSİ DURAĞI (şehrin doğu dış halkası, stadyumun karşısı) ------------------------
// Girilmez; yola bakan kulübe + tabela + sıra bekleyen 3 sarı taksi. Sunucu/Firestore yok.
export function buildTaksiDuragi(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  const Y = '#f6c400';
  const ym = M(Y, 0.55);
  // kulübe (arka orta)
  const bw = 8;
  const bd = 4.6;
  const bz = -d / 2 + bd / 2 + 1.2;
  kit.wallBox('beton_duvar', bw, 3.4, bd, 0, 0, bz, { tint: '#f4f1e6' });
  kit.box(bw + 1.6, 0.3, bd + 2.4, M('#1d1f24', 0.5, 0.3), 0, 3.4, bz + 0.9); // saçak
  kit.box(bw + 1.6, 0.12, 0.08, glowMat(Y, 2.4), 0, 3.42, bz + bd / 2 + 2.1, { cast: false });
  kit.box(bw - 1.4, 1.2, 0.05, glowMat('#ffe9a8', 0.9), 0, 1.3, bz + bd / 2 + 0.03, { cast: false }); // vitrin
  // dama şeridi
  for (let i = 0; i < 16; i++) kit.box(0.5, 0.25, 0.05, M(i % 2 ? '#111111' : Y, 0.5), -bw / 2 + 0.25 + i * 0.5, 2.85, bz + bd / 2 + 0.04, { cast: false });
  kit.sign('taksidurak', 'TAKSİ DURAĞI', 0.85, 0, 4.15, bz + bd / 2 + 0.6, 0, { color: '#111111', bg: Y, glow: Y, font: '900 110px Arial, sans-serif', li: 6, ld: 12 });
  kit.item('door_cam', -2.4, bz + bd / 2, 0, 0, { solid: false });
  kit.item('parkbench', 1.8, bz + bd / 2 + 1.1, 0, 0);
  kit.mass(bw, 3.6, bd, 0, bz);
  // totem (köşede, yoldan görünsün)
  kit.box(0.35, 5.2, 0.35, M('#2a2f3a', 0.5, 0.5), w / 2 - 2, 0, d / 2 - 2);
  kit.sign('taksitotem', 'TAKSİ', 1.1, w / 2 - 2, 5.6, d / 2 - 1.8, 0, { color: '#111111', bg: Y, glow: Y, font: '900 120px Arial, sans-serif', li: 5, ld: 10 });
  kit.solid(w / 2 - 2, d / 2 - 2, 0.3, 0.3);
  // sıra çizgileri + bekleyen taksiler (ön tarafta, yola dik)
  const slots = [-7.5, -2.5, 2.5, 7.5];
  for (const x of [-10, -5, 0, 5, 10]) kit.box(0.14, 0.02, 5.4, ym, x, 0.14, d / 2 - 4.4, { cast: false });
  kit.box(20, 0.02, 0.14, ym, 0, 0.14, d / 2 - 7.1, { cast: false });
  slots.slice(0, 3).forEach((x, i) => {
    const car = kit.item('car_sedan', x, d / 2 - 4.4, 0, 4);
    if (!car) return;
    const s = kit.sign(`taksitepe${i}`, 'TAKSİ', 0.28, 0, 0, 0, 0, { color: '#111111', bg: Y, font: '900 110px Arial, sans-serif', light: false });
    s.position.set(car.position.x, 1.62, car.position.z);
  });
  kit.sign('bay_taksi', 'TAKSİ', 0.9, slots[3], 0.17, d / 2 - 4.4, 0, { color: '#1a1a1a', bg: Y, font: '900 110px Arial, sans-serif', light: false }).rotation.x = -Math.PI / 2;
  kit.pool(0, bz + bd / 2 + 2, Y, 12, 0.16, 0.4);
  return { mapLabel: { text: 'TAKSİ DURAĞI', y: 8, z: bz } };
}

// --- v156 OTOGAR (şehirlerarası otobüs terminali) ------------------------------------------
// Peron: x0…x1 boyunca, z = zP'nin arkasında 3,2 m (yolcu tarafı, kanopili). Otobüs yerleri
// peronun önünde (+z), otobüs burnu perona dönük park eder. Dönüş: peron yerleri (lot yereli).
// makeBus(i) verilirse dolu peronlara park etmiş otobüs koyar (kök grup döner).
export function otogarYard(kit, { x0, x1, zP, name = 'OTOGAR', parked = [], makeBus = null, roadZ = null, clearX = null }) {
  const BAY = 5.2;
  const n = Math.max(1, Math.floor((x1 - x0) / BAY));
  const span = n * BAY;
  const xs = x0 + (x1 - x0 - span) / 2;
  const yel = YELLOW();
  const white = M('#f2f2f2', 0.6);
  // peron zemini (granit, alçak — yürürken gömülmez) + sarı hissedilebilir şerit
  kit.box(span + 1, 0.05, 3.4, M('#c9c4ba', 0.75), xs + span / 2, 0.12, zP - 1.7, { cast: false });
  kit.box(span + 1, 0.03, 0.4, yel, xs + span / 2, 0.15, zP - 0.35, { cast: false });
  // araç tarafı: peron bordürü (sadece araç engeli)
  kit.box(span + 1, 0.22, 0.25, M('#8f8a80', 0.85), xs + span / 2, 0.1, zP + 0.12);
  kit.solid(xs + span / 2, zP - 1.6, span / 2 + 0.5, 1.75);
  kit.solids.at(-1).car = true;
  // kanopi: direkler peronun arka kenarında, saçak otobüs burnunun üstüne uzanır
  const post = M('#2a2f3a', 0.45, 0.6);
  // yarı saydam polikarbon saçak (araçtaki takip kamerası üstten bakınca peron görünsün)
  const roofM = new THREE.MeshStandardMaterial({ color: '#dfe8f0', roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i <= n; i++) {
    const x = xs + i * BAY;
    kit.box(0.22, 4.4, 0.22, post, x, 0.12, zP - 3.0);
    kit.solid(x, zP - 3.0, 0.16, 0.16);
  }
  kit.box(span + 1.4, 0.12, 6.4, roofM, xs + span / 2, 4.6, zP - 1.4, { cast: false });
  for (const z of [zP - 4.5, zP + 1.7]) kit.box(span + 1.4, 0.22, 0.25, M('#2a2f3a', 0.45, 0.6), xs + span / 2, 4.5, z);
  for (let i = 0; i <= n; i++) kit.box(0.14, 0.18, 6.4, M('#2a2f3a', 0.45, 0.6), xs + i * BAY, 4.52, zP - 1.4);
  kit.box(span + 1.4, 0.34, 0.12, glowMat('#4fd2ff', 1.6), xs + span / 2, 4.46, zP + 1.8, { cast: false });
  kit.box(span + 1.4, 0.5, 0.18, M('#c8141e', 0.5), xs + span / 2, 4.2, zP + 1.85);
  // peron numaraları, banklar, otobüs yerleri
  const bays = [];
  for (let i = 0; i < n; i++) {
    const cx = xs + BAY * (i + 0.5);
    kit.sign(`${name}_peron${i}`, `PERON ${i + 1}`, 0.42, cx, 3.75, zP + 1.92, 0, { color: '#ffffff', bg: '#1d2a44', font: '900 100px Arial, sans-serif', light: false });
    if (clearX == null || Math.abs(cx - clearX) > 2.4) kit.item('parkbench', cx, zP - 2.2, 0, 0, { y: 0.15 }); // kapı önü boş
    // yer çizgileri
    kit.box(0.16, 0.02, 12.6, white, xs + BAY * i, 0.14, zP + 6.6, { cast: false });
    const lbl = kit.sign(`${name}_bay${i}`, `${i + 1}`, 1.1, cx, 0.16, zP + 10.6, 0, { color: '#e8b923', font: '900 120px Arial, sans-serif', light: false });
    lbl.rotation.x = -Math.PI / 2;
    bays.push({ x: cx, z: zP + 6.4 });
  }
  kit.box(0.16, 0.02, 12.6, white, xs + span, 0.14, zP + 6.6, { cast: false });
  kit.box(span, 0.02, 0.16, white, xs + span / 2, 0.14, zP + 12.9, { cast: false });
  if (roadZ != null) {
    // manevra alanı oku
    for (let x = xs + 4; x < xs + span - 2; x += 10) kit.box(2.6, 0.02, 0.3, white, x, 0.14, (zP + 12.9 + roadZ) / 2, { cast: false });
  }
  // dolu peronlar: park etmiş otobüsler (burun perona)
  if (makeBus) {
    parked.forEach((i) => {
      if (i >= n) return;
      const b = makeBus(i);
      b.root.position.set(bays[i].x, 0.13, bays[i].z);
      b.root.rotation.y = Math.PI;
      kit.add(b.root);
      kit.solid(bays[i].x, bays[i].z, (b.halfW || 1.25) + 0.1, (b.len || 11.5) / 2 + 0.1);
    });
  }
  kit.pool(xs + span / 2, zP - 1.5, '#4fd2ff', Math.min(30, span), 0.16, 0.25);
  return { bays, n, xs, span };
}

// Oyundaki şehir lotu (girilmez dış cephe; prototipte içi gezilebilir mekân olarak açılır)
export function buildOtogar(kit, lot) {
  const { w, d } = lot;
  kit.floor('beton', w, d, 0, 0);
  const bw = 19;
  const bd = 15;
  const bx = -w / 2 + bw / 2 + 1.5;
  const bz = -d / 2 + bd / 2 + 0.5;
  kit.wallBox('beton_duvar', bw, 7, bd, bx, 0, bz, { tint: '#eef1f4' });
  kit.box(bw + 0.6, 0.4, bd + 0.6, M('#1d2a44', 0.5, 0.3), bx, 7, bz);
  kit.box(bw - 2, 2.4, 0.06, glowMat('#dff2ff', 0.8), bx, 0.6, bz + bd / 2 + 0.03, { cast: false });
  kit.box(bw - 2, 1.2, 0.06, glowMat('#dff2ff', 0.6), bx, 4.3, bz + bd / 2 + 0.03, { cast: false });
  kit.sign('otogar_cephe', 'NEON ŞEHİR OTOGARI', 1.1, bx, 6.2, bz + bd / 2 + 0.08, 0, { color: '#ffffff', glow: '#4fd2ff', font: '900 110px Arial, sans-serif', li: 7, ld: 14 });
  kit.item('door_cift', bx, bz + bd / 2, 0, 0, { solid: false });
  kit.mass(bw, 7.4, bd, bx, bz);
  otogarYard(kit, { x0: bx + bw / 2 + 3, x1: w / 2 - 1, zP: -d / 2 + 6.6, name: 'otogar', roadZ: d / 2 });
  // totem (yoldan görünsün)
  kit.box(0.5, 7, 0.5, M('#2a2f3a', 0.5, 0.5), w / 2 - 2, 0, d / 2 - 1.5);
  kit.sign('otogar_totem', 'OTOGAR', 1.3, w / 2 - 2, 7.6, d / 2 - 1.2, 0, { color: '#ffffff', bg: '#c8141e', glow: '#ff3a4a', font: '900 120px Arial, sans-serif', li: 5, ld: 10 });
  kit.sign('otogar_totem_b', 'OTOGAR', 1.3, w / 2 - 2, 7.6, d / 2 - 1.8, Math.PI, { color: '#ffffff', bg: '#c8141e', font: '900 120px Arial, sans-serif', light: false });
  kit.solid(w / 2 - 2, d / 2 - 1.5, 0.35, 0.35);
  return { mapLabel: { text: 'OTOGAR', y: 10, z: bz } };
}
