// =============================================================================
// v153 — ARABA İÇİ (birinci şahıs kokpit)
// -----------------------------------------------------------------------------
// İç kamerada aracın kendi kaba iç parçaları yerine bu ayrıntılı kokpit çizilir:
// yumuşak torpido, kapüşonlu gösterge paneli (canlı hız + devir ibreleri), deri
// direksiyon (direksiyonla birlikte döner), orta konsol + neon multimedya ekranı,
// vites kolu, A sütunları, tavan döşemesi + iç dikiz aynası, kapı panelleri, ortam
// (ambiyans) neon şeritleri ve ön camın üstünde güneş şeridi.
//
// Koordinatlar göz merkezli: +z ileri, +y yukarı, +x SOL (sağ = −x). Sürücü solda
// oturur; aracın ortası sağda (centerX < 0).
// =============================================================================
import * as THREE from 'three';

const TAU = Math.PI * 2;

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}

// iki yuvarlak gösterge (hız + devir) + ortada dijital hız / vites
function drawCluster(cv, s, accent) {
  const { g, c } = cv;
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#05070d');
  bg.addColorStop(1, '#0b0f1a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const dial = (cx, cy, r, frac, max, label, warnFrom) => {
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    g.lineCap = 'round';
    g.lineWidth = r * 0.07;
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(cx, cy, r * 0.86, a0, a1);
    g.stroke();
    // değer yayı (neon)
    const av = a0 + (a1 - a0) * Math.max(0, Math.min(1, frac));
    g.shadowColor = accent;
    g.shadowBlur = r * 0.18;
    g.strokeStyle = accent;
    g.beginPath();
    g.arc(cx, cy, r * 0.86, a0, av);
    g.stroke();
    g.shadowBlur = 0;
    // kırmızı bölge
    if (warnFrom != null) {
      g.strokeStyle = 'rgba(255,60,90,0.75)';
      g.lineWidth = r * 0.04;
      g.beginPath();
      g.arc(cx, cy, r * 0.97, a0 + (a1 - a0) * warnFrom, a1);
      g.stroke();
    }
    // çentikler + rakamlar
    g.fillStyle = '#cfd8ea';
    g.font = `700 ${Math.round(r * 0.15)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      const big = i % 2 === 0;
      g.strokeStyle = big ? '#e8eefc' : 'rgba(232,238,252,0.45)';
      g.lineWidth = big ? r * 0.035 : r * 0.02;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
      g.lineTo(cx + Math.cos(a) * r * (big ? 0.62 : 0.66), cy + Math.sin(a) * r * (big ? 0.62 : 0.66));
      g.stroke();
      if (big) g.fillText(String(Math.round((max * i) / 10)), cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.48);
    }
    // ibre
    g.save();
    g.translate(cx, cy);
    g.rotate(av);
    g.shadowColor = '#ff3b5c';
    g.shadowBlur = r * 0.12;
    g.fillStyle = '#ff3b5c';
    g.beginPath();
    g.moveTo(-r * 0.08, -r * 0.022);
    g.lineTo(r * 0.8, 0);
    g.lineTo(-r * 0.08, r * 0.022);
    g.closePath();
    g.fill();
    g.restore();
    g.shadowBlur = 0;
    g.fillStyle = '#1a1f2c';
    g.beginPath();
    g.arc(cx, cy, r * 0.09, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(207,216,234,0.7)';
    g.font = `700 ${Math.round(r * 0.11)}px Arial, sans-serif`;
    g.fillText(label, cx, cy + r * 0.42);
  };
  const r = H * 0.44;
  dial(W * 0.2, H * 0.52, r, s.kmh / s.vmaxKmh, s.vmaxKmh, 'km/s', null);
  dial(W * 0.8, H * 0.52, r, s.rpm / 8, 8, 'x1000 d/dk', 0.8);
  // orta: dijital hız + vites + saat
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = accent;
  g.shadowBlur = 14;
  g.font = `900 ${Math.round(H * 0.3)}px Arial, sans-serif`;
  g.fillText(String(s.kmh), W / 2, H * 0.42);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(207,216,234,0.65)';
  g.font = `700 ${Math.round(H * 0.08)}px Arial, sans-serif`;
  g.fillText('km/s', W / 2, H * 0.6);
  g.fillStyle = accent;
  g.font = `900 ${Math.round(H * 0.13)}px Arial, sans-serif`;
  g.fillText(s.gear, W / 2, H * 0.78);
  g.fillStyle = 'rgba(207,216,234,0.55)';
  g.font = `700 ${Math.round(H * 0.07)}px Arial, sans-serif`;
  g.fillText(s.clock, W / 2, H * 0.12);
  cv.t.needsUpdate = true;
}

// orta multimedya ekranı: saat, radyo, ekolayzer, yön oku
function drawScreen(cv, s, accent) {
  const { g, c } = cv;
  const W = c.width;
  const H = c.height;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0c1230');
  bg.addColorStop(1, '#1a0b2a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = `900 ${Math.round(H * 0.2)}px Arial, sans-serif`;
  g.fillText(s.clock, W * 0.06, H * 0.08);
  g.fillStyle = 'rgba(220,230,255,0.7)';
  g.font = `700 ${Math.round(H * 0.085)}px Arial, sans-serif`;
  g.fillText('NEON ŞEHİR', W * 0.06, H * 0.32);
  g.fillStyle = accent;
  g.font = `800 ${Math.round(H * 0.1)}px Arial, sans-serif`;
  g.fillText('♪ Neon FM 98.6', W * 0.06, H * 0.5);
  // ekolayzer
  const n = 14;
  for (let i = 0; i < n; i++) {
    const h = (0.25 + 0.75 * Math.abs(Math.sin(s.t * (2 + (i % 5) * 0.7) + i * 1.3))) * H * 0.22;
    g.fillStyle = i % 2 ? accent : '#ff3fa0';
    g.fillRect(W * 0.06 + i * ((W * 0.5) / n), H * 0.9 - h, (W * 0.5) / n - 3, h);
  }
  // sağ: pusula
  const cx = W * 0.78;
  const cy = H * 0.55;
  const R = H * 0.3;
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.stroke();
  g.save();
  g.translate(cx, cy);
  g.rotate(-s.heading);
  g.fillStyle = '#ff3b5c';
  g.beginPath();
  g.moveTo(0, -R * 0.85);
  g.lineTo(R * 0.18, 0);
  g.lineTo(-R * 0.18, 0);
  g.closePath();
  g.fill();
  g.fillStyle = '#e8eefc';
  g.beginPath();
  g.moveTo(0, R * 0.85);
  g.lineTo(R * 0.18, 0);
  g.lineTo(-R * 0.18, 0);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = '#e8eefc';
  g.textAlign = 'center';
  g.font = `800 ${Math.round(H * 0.09)}px Arial, sans-serif`;
  g.fillText('K', cx, cy - R - H * 0.12);
  cv.t.needsUpdate = true;
}

// ön camın üstündeki koyu güneş şeridi (yukarıdan aşağı saydamlaşır)
let visorTex = null;
function sunStripTex() {
  if (visorTex) return visorTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(10,18,40,0.85)');
  gr.addColorStop(0.55, 'rgba(10,18,40,0.35)');
  gr.addColorStop(1, 'rgba(10,18,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  visorTex = new THREE.CanvasTexture(c);
  visorTex.colorSpace = THREE.SRGBColorSpace;
  return visorTex;
}

// dikiz aynası: arkadaki yolun bulanık yansıması (gökyüzü + yol + arka cam)
let mirTex = null;
function mirrorTex() {
  if (mirTex) return mirTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 32);
  gr.addColorStop(0, '#6f86b8');
  gr.addColorStop(0.5, '#b9c6e0');
  gr.addColorStop(0.56, '#555b66');
  gr.addColorStop(1, '#2c3038');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = 'rgba(20,22,28,0.85)';
  g.fillRect(0, 0, 10, 32);
  g.fillRect(118, 0, 10, 32);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.moveTo(20, 0);
  g.lineTo(40, 0);
  g.lineTo(18, 32);
  g.lineTo(2, 32);
  g.closePath();
  g.fill();
  mirTex = new THREE.CanvasTexture(c);
  mirTex.colorSpace = THREE.SRGBColorSpace;
  return mirTex;
}

const clockNow = () => {
  const d = new Date(Date.now() + 3 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// iki nokta arasında kutu (sütunlar için)
function beam(a, b, w, d, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/**
 * opts: closed (tavanlı mı), accent (neon), trim (iç döşeme rengi), body (boya),
 *       halfW (aracın yarı genişliği), eyeX (gözün araç merkezine göre x'i), big (otobüs/tır)
 */
export function buildCockpit({ closed = true, accent = '#19e8ff', trim = '#1a1a1d', body = '#888888', halfW = 0.9, eyeX = 0.36, big = false } = {}) {
  const group = new THREE.Group();
  group.name = 'cockpit';
  const S = big ? 1.25 : 1;
  const centerX = -eyeX; // aracın ortası (sürücüye göre sağda)
  const xl = halfW - 0.14 - eyeX; // sol kapı iç yüzü
  const xr = -(halfW - 0.14) - eyeX; // sağ kapı iç yüzü
  const width = xl - xr;

  const mDash = new THREE.MeshStandardMaterial({ color: '#1c1d23', roughness: 0.78, metalness: 0.05, emissive: '#07080c' });
  const mSoft = new THREE.MeshStandardMaterial({ color: new THREE.Color(trim).lerp(new THREE.Color('#16171c'), 0.35), roughness: 0.9, emissive: '#060608' });
  const mPiano = new THREE.MeshStandardMaterial({ color: '#07080b', roughness: 0.18, metalness: 0.4 });
  const mChrome = new THREE.MeshStandardMaterial({ color: '#c9ced8', roughness: 0.22, metalness: 1 });
  const mLeather = new THREE.MeshStandardMaterial({ color: '#18181c', roughness: 0.55, metalness: 0.02, emissive: '#050507' });
  const mHead = new THREE.MeshStandardMaterial({ color: '#34353c', roughness: 0.96, emissive: '#0a0a0d' });
  const mBody = new THREE.MeshStandardMaterial({ color: body, roughness: 0.35, metalness: 0.5 });
  const mNeon = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
  const mNeonSoft = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const mats = [mDash, mSoft, mPiano, mChrome, mLeather, mHead, mBody, mNeon, mNeonSoft];

  // --- torpido (yan profil x boyunca uzatılır) ---------------------------------------------
  const dz = 0.42 * S; // sürücüye en yakın kenar
  const dy = -0.27 * S; // üst kenar yüksekliği
  const zf = 1.02 * S; // cam dibi
  const prof = new THREE.Shape();
  prof.moveTo(dz - 0.02, dy - 0.5);
  prof.lineTo(dz + 0.02, dy - 0.1);
  prof.quadraticCurveTo(dz + 0.03, dy, dz + 0.12, dy + 0.025);
  prof.lineTo(zf, dy + 0.07);
  prof.lineTo(zf, dy - 0.5);
  prof.closePath();
  const dashGeo = new THREE.ExtrudeGeometry(prof, { depth: width, bevelEnabled: false, curveSegments: 6 });
  dashGeo.rotateY(-Math.PI / 2);
  dashGeo.translate(xl, 0, 0);
  const dash = new THREE.Mesh(dashGeo, mDash);
  group.add(dash);
  // üst dikiş + ambiyans şeridi (torpidonun sürücü kenarı boyunca)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.006, 0.006), mNeon);
  strip.position.set((xl + xr) / 2, dy - 0.11, dz + 0.012);
  group.add(strip);
  const stripGlow = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.1, 0.05), mNeonSoft);
  stripGlow.position.set((xl + xr) / 2, dy - 0.11, dz + 0.004);
  stripGlow.rotation.y = Math.PI;
  group.add(stripGlow);
  // --- gösterge paneli (kapüşon + iki ibreli ekran) ---------------------------------------
  const cluster = canvasTex(512, 220);
  const gz = dz + 0.17;
  const gy = dy + 0.11;
  const hoodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * S, 0.22 * S, 0.16, 28, 1, true, Math.PI * 0.5, Math.PI), new THREE.MeshStandardMaterial({ color: '#121318', roughness: 0.8, side: THREE.DoubleSide }));
  mats.push(hoodMesh.material);
  hoodMesh.rotation.x = Math.PI / 2;
  hoodMesh.scale.set(1, 1, 0.38);
  hoodMesh.position.set(0, gy + 0.005, gz + 0.03);
  group.add(hoodMesh);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4 * S, 0.172 * S), new THREE.MeshBasicMaterial({ map: cluster.t, toneMapped: false }));
  mats.push(face.material);
  face.rotation.y = Math.PI;
  face.rotation.x = 0.28;
  face.position.set(0, gy - 0.02, gz + 0.06);
  group.add(face);

  // --- direksiyon --------------------------------------------------------------------------
  const wheel = new THREE.Group();
  wheel.position.set(0, dy - (big ? 0.1 : 0.07) * S, dz - 0.04);
  wheel.rotation.x = big ? 0.8 : 0.42;
  const spin = new THREE.Group();
  wheel.add(spin);
  const R = (big ? 0.2 : 0.185) * S;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.024 * S, 12, 48), mLeather);
  spin.add(rim);
  // üstte kırmızı orta işareti (spor)
  const mark = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0255 * S, 12, 6, 0.16), new THREE.MeshStandardMaterial({ color: '#d0213a', roughness: 0.5 }));
  mats.push(mark.material);
  mark.rotation.z = Math.PI / 2 - 0.08;
  spin.add(mark);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * S, 0.068 * S, 0.05, 24), mLeather);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = -0.01;
  spin.add(hub);
  const logo = new THREE.Mesh(new THREE.TorusGeometry(0.026 * S, 0.005, 6, 24), mNeon);
  logo.position.z = -0.038;
  spin.add(logo);
  [
    [0, -1],
    [1, 0.08],
    [-1, 0.08],
  ].forEach(([sx, sy]) => {
    const L = R - 0.05 * S;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(sx ? L : 0.05 * S, sx ? 0.045 * S : L, 0.02), mLeather);
    sp.position.set((sx * (L / 2 + 0.05 * S)), sy < 0 ? -(L / 2 + 0.05 * S) : 0, -0.006);
    spin.add(sp);
    if (sx) {
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.006), mChrome);
      btn.position.set(sx * 0.1 * S, 0.012, -0.018);
      spin.add(btn);
    }
  });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.26, 16), mDash);
  column.rotation.x = Math.PI / 2;
  column.position.set(0, 0, 0.14);
  wheel.add(column);
  group.add(wheel);

  // --- orta konsol + multimedya ekranı + vites -------------------------------------------
  const scr = canvasTex(384, 224);
  const scrW = 0.25 * S;
  const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(scrW, scrW * (224 / 384)), new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }));
  mats.push(scrMesh.material);
  scrMesh.rotation.y = Math.PI;
  scrMesh.rotation.x = 0.2;
  const sx0 = centerX + 0.02;
  scrMesh.position.set(sx0, dy + 0.035, dz + 0.16);
  group.add(scrMesh);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(scrW + 0.02, scrW * (224 / 384) + 0.02, 0.012), mPiano);
  bezel.rotation.x = 0.2;
  bezel.position.set(sx0, dy + 0.035, dz + 0.167);
  group.add(bezel);
  // yolcu tarafı parlak dekor şeridi (ekranın sağından kapıya)
  {
    const x0 = sx0 - scrW / 2 - 0.12;
    const x1 = xr + 0.06;
    if (x0 - x1 > 0.1) {
      const deco = new THREE.Mesh(new THREE.BoxGeometry(x0 - x1, 0.045, 0.01), mPiano);
      deco.position.set((x0 + x1) / 2, dy - 0.05, dz + 0.035);
      group.add(deco);
      const dl = new THREE.Mesh(new THREE.BoxGeometry(x0 - x1, 0.004, 0.004), mNeon);
      dl.position.set((x0 + x1) / 2, dy - 0.075, dz + 0.03);
      group.add(dl);
    }
  }
  // havalandırma ızgaraları (ekranın iki yanı)
  [-1, 1].forEach((s) => {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.02), mPiano);
    v.position.set(sx0 + s * (scrW / 2 + 0.06), dy - 0.05, dz + 0.03);
    group.add(v);
    for (let i = 0; i < 3; i++) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.003, 0.004), mChrome);
      sl.position.set(sx0 + s * (scrW / 2 + 0.06), dy - 0.06 + i * 0.01, dz + 0.018);
      group.add(sl);
    }
  });
  const cons = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.62), mSoft);
  cons.position.set(centerX, dy - 0.42, dz - 0.12);
  cons.rotation.x = -0.25;
  group.add(cons);
  const consTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.42), mPiano);
  consTop.position.set(centerX, dy - 0.29, dz - 0.22);
  consTop.rotation.x = -0.25;
  group.add(consTop);
  const gear = new THREE.Group();
  gear.position.set(centerX, dy - 0.28, dz - 0.3);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.13, 10), mChrome);
  stick.position.y = 0.065;
  gear.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mLeather);
  knob.position.y = 0.14;
  knob.scale.set(1, 0.85, 1.15);
  gear.add(knob);
  const knobRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, 6, 20), mNeon);
  knobRing.rotation.x = Math.PI / 2;
  knobRing.position.y = 0.13;
  gear.add(knobRing);
  gear.rotation.x = -0.15;
  group.add(gear);

  // --- kapı panelleri + ambiyans --------------------------------------------------------------
  const sill = dy + 0.06; // pencere alt çizgisi
  [xl, xr].forEach((x, i) => {
    const s = i === 0 ? 1 : -1;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.5), mSoft);
    door.position.set(x + s * 0.03, sill - 0.3, 0.15);
    group.add(door);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 1.5), mDash);
    top.position.set(x + s * 0.01, sill, 0.15);
    group.add(top);
    const amb = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 1.2), mNeon);
    amb.position.set(x - s * 0.015, sill - 0.08, 0.1);
    group.add(amb);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.12), mChrome);
    handle.position.set(x - s * 0.02, sill - 0.12, 0.3);
    group.add(handle);
  });
  // yan ayna (sol camın ön köşesinde, dışarıda): yuvarlak gövde + yansıma
  if (!big) {
    const mirrorL = new THREE.Group();
    const mh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), mBody);
    mh.scale.set(0.55, 0.62, 1);
    mirrorL.add(mh);
    const mg = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ map: mirrorTex(), toneMapped: false }));
    mats.push(mg.material);
    mg.scale.set(1, 0.62, 1);
    mg.rotation.y = Math.PI - 0.55;
    mg.position.set(-0.005, 0, -0.035);
    mirrorL.add(mg);
    mirrorL.position.set(xl + 0.1, sill + 0.03, zf - 0.1);
    group.add(mirrorL);
  }

  // --- kaput (boya renginde, ön cam dibinden ileri, hafif kubbeli) + silecekler ---------------
  if (!big) {
    const hw = halfW - 0.06;
    const L = 1.55;
    const hg = new THREE.PlaneGeometry(hw * 2, L, 16, 10);
    hg.rotateX(-Math.PI / 2); // yatay: y=0, z boyunca uzunluk
    const pa = hg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const xn = pa.getX(i) / hw;
      const zn = (pa.getZ(i) + L / 2) / L; // 0 arka (cam dibi) … 1 burun
      pa.setY(i, -0.09 * xn * xn - 0.05 * zn * zn - 0.02 * zn);
    }
    hg.computeVertexNormals();
    const hood = new THREE.Mesh(hg, mBody);
    hood.position.set(centerX, dy + 0.075, zf + L / 2 - 0.02);
    group.add(hood);
    // cam dibi (kaporta ile cam arası koyu şerit) + iki silecek
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.02, 0.09), mPiano);
    cowl.position.set(centerX, dy + 0.078, zf + 0.03);
    group.add(cowl);
    [0.42, -0.2].forEach((o) => {
      const wp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.012, 0.016), mPiano);
      wp.position.set(centerX + o, dy + 0.092, zf + 0.07);
      wp.rotation.y = 0.1;
      group.add(wp);
    });
  }

  // --- A sütunları, tavan, dikiz aynası, güneş şeridi -------------------------------------
  const roofY = (closed ? 0.27 : 0.2) * S;
  const hz = (closed ? 0.5 : 0.62) * S; // ön cam üst kenarı (tavanın önü)
  [xl, xr].forEach((x) => {
    const p = beam(new THREE.Vector3(x * 0.96, dy + 0.06, zf - 0.02), new THREE.Vector3(x * 0.9, roofY - 0.01, hz), 0.07, 0.05, closed ? mHead : mBody);
    group.add(p);
  });
  {
    const header = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.12), closed ? mHead : mBody);
    header.position.set((xl + xr) / 2, roofY, hz - 0.02);
    group.add(header);
  }
  if (closed) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.03, 1.4), mHead);
    roof.position.set((xl + xr) / 2, roofY + 0.03, hz - 0.72);
    group.add(roof);
    // tavan lambası
    const dome = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.09), new THREE.MeshBasicMaterial({ color: '#fff2d6', toneMapped: false }));
    mats.push(dome.material);
    dome.position.set(centerX, roofY + 0.012, hz - 0.18);
    group.add(dome);
    // güneşlikler
    [xl - 0.27, xr + 0.27].forEach((x) => {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.16), mHead);
      v.position.set(x, roofY - 0.025, hz - 0.1);
      v.rotation.x = 0.12;
      group.add(v);
    });
  }
  // dikiz aynası (otobüs / tırda aracın kendi camı var)
  const rv = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8), mPiano);
  arm.position.y = 0.04;
  rv.add(arm);
  const rvb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.065, 0.025), mPiano);
  rv.add(rvb);
  const rvg = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.052), new THREE.MeshBasicMaterial({ map: mirrorTex(), toneMapped: false }));
  mats.push(rvg.material);
  rvg.rotation.y = Math.PI;
  rvg.position.z = -0.016;
  rv.add(rvg);
  rv.position.set(centerX, roofY - 0.1, hz + 0.06);
  rv.rotation.y = 0.18;
  rv.rotation.x = -0.08;
  group.add(rv);
  // ön camın üstünde koyu güneş şeridi
  if (closed) {
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.22), new THREE.MeshBasicMaterial({ map: sunStripTex(), transparent: true, depthWrite: false, toneMapped: false }));
    mats.push(sun.material);
    const glassTilt = Math.atan2(zf - hz, roofY - (dy + 0.07));
    sun.position.set((xl + xr) / 2, roofY - 0.1, hz + 0.08);
    sun.rotation.order = 'YXZ';
    sun.rotation.y = Math.PI;
    sun.rotation.x = -glassTilt;
    group.add(sun);
  }

  // --- arka kabin (yana / arkaya bakınca): yolcu koltuğu, arka koltuk, arka cam çerçevesi ---
  if (!big) {
    const seat = (x, z, w) => {
      const g = new THREE.Group();
      const cush = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.5), mSoft);
      cush.position.set(0, -0.62, 0);
      g.add(cush);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.62, 0.12), mSoft);
      back.position.set(0, -0.28, -0.24);
      back.rotation.x = -0.18;
      g.add(back);
      const sideBol = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.1), mNeon);
      sideBol.position.set(w / 2 - 0.03, -0.3, -0.18);
      sideBol.scale.set(0.15, 1, 0.15);
      g.add(sideBol);
      g.position.set(x, 0, z);
      group.add(g);
      return g;
    };
    // ön yolcu koltuğu (sürücünün aynası — aracın ortasına göre)
    const ps = seat(centerX * 2, 0.02, 0.5);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.17, 0.09), mSoft);
    head.position.set(0, 0.12, -0.3);
    ps.add(head);
    // arka koltuk
    seat(centerX, -0.95, Math.max(0.6, width - 0.12));
    // arka cam çerçevesi (C sütunları + üst kiriş)
    const rz = -1.42;
    (closed ? [xl, xr] : []).forEach((x) => {
      group.add(beam(new THREE.Vector3(x * 0.95, sill, rz + 0.15), new THREE.Vector3(x * 0.9, roofY - 0.01, rz + 0.45), 0.09, 0.06, mHead));
    });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, 0.3), mDash);
    shelf.position.set(centerX, sill - 0.02, rz + 0.05);
    group.add(shelf);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: '#ff2a3a', toneMapped: false }));
    mats.push(brake.material);
    brake.position.set(centerX, (closed ? roofY : sill + 0.1) - 0.03, rz + 0.3);
    group.add(brake);
  }

  // --- v154: taban (halı) + orta tünel + torpido altı + kapıların alt kısmı ---------------
  // Aracın kendi gövdesi iç kamerada gizlendiği için aşağı bakınca asfalt görünüyordu.
  {
    const mCarpet = new THREE.MeshStandardMaterial({ color: '#121216', roughness: 1, emissive: '#040405' });
    mats.push(mCarpet);
    const fy = -0.92 * S; // taban yüksekliği (göze göre)
    const zBack = big ? -1.1 * S : -1.5; // arka koltuğun arkası
    const zFront = zf + 0.02;
    const len = zFront - zBack;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.04, len), mCarpet);
    floor.position.set(centerX, fy, zBack + len / 2);
    group.add(floor);
    // torpido altı (ön ayak boşluğunun önü)
    const fw = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, dy - 0.5 - fy + 0.04, 0.04), mCarpet);
    fw.position.set(centerX, (fy + dy - 0.5) / 2, zFront);
    group.add(fw);
    if (!big) {
      const tunnel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 1.7), mSoft);
      tunnel.position.set(centerX, fy + 0.07, -0.25);
      group.add(tunnel);
    }
    // kapıların alt kısmı: taban ile kapı paneli arasında boşluk kalmasın (arka kapılar dahil)
    const doorBot = sill - 0.3 - 0.275;
    [xl, xr].forEach((x, i) => {
      const s = i === 0 ? 1 : -1;
      const lo = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorBot - fy + 0.02, len), mSoft);
      lo.position.set(x + s * 0.03, (doorBot + fy) / 2, zBack + len / 2);
      group.add(lo);
      if (!big) {
        // arka kapı paneli (ön kapı panelinin arkasından arka koltuğa kadar)
        const rd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.9), mSoft);
        rd.position.set(x + s * 0.03, sill - 0.3, -1.05);
        group.add(rd);
        const rt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.9), mDash);
        rt.position.set(x + s * 0.01, sill, -1.05);
        group.add(rt);
      }
    });
  }

  // gölge yok: iç kamerada gölge haritasıyla titreşmesin
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });

  let lastDraw = 0;
  let lastKey = '';
  let lastScr = 0;
  let steerSm = 0;
  return {
    group,
    update(dt, st) {
      // direksiyon: yumuşak, en fazla ~1 tur
      steerSm += ((st.steer || 0) - steerSm) * Math.min(1, dt * 10);
      spin.rotation.z = -steerSm * (big ? 3.2 : 2.4);
      const now = st.now || performance.now();
      const clock = clockNow();
      const key = `${st.kmh}|${st.gear}|${clock}|${Math.round((st.rpm || 0) * 20)}`;
      if (key !== lastKey && now - lastDraw > 90) {
        lastKey = key;
        lastDraw = now;
        drawCluster(cluster, { kmh: st.kmh, vmaxKmh: st.vmaxKmh, rpm: st.rpm || 0, gear: st.gear, clock }, accent);
      }
      if (now - lastScr > 140) {
        lastScr = now;
        drawScreen(scr, { t: now / 1000, clock, heading: st.heading || 0 }, accent);
      }
    },
    dispose() {
      group.traverse((o) => o.isMesh && o.geometry.dispose());
      mats.forEach((m) => m.dispose());
      cluster.t.dispose();
      scr.t.dispose();
    },
  };
}
