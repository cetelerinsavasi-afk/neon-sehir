// =============================================================================
// SADECE ÖNİZLEME — BİNEKTEN FIRLAMA PROTOTİPİ (npm run preview:gangs → /firlama.html)
//   • Şehirdeki binek modelleri (vehicles.js: bisiklet, at, deve, 4 motor) + 3D avatar (avatar3d.js)
//   • Sürüş ve duvara çarpma şehirle aynı yöntem (carImpact.js: temas noktası + itki)
//   • Sert çarpmada (duvara dik hız ≥ sınır) sürücü fırlar → takla → yere düşer → kayar → durur → kalkar
//     Yavaş çarpmada sadece sarsıntı (şehirdeki gibi). Fizik: src/components/City/riderEject.js
//   • Test paneli: binek seçimi, duvara sabit hızla otomatik sürüş, sınır ayarı, ağır çekim
// =============================================================================
import * as THREE from 'three';
import { buildVehicle } from '../src/components/City/vehicles.js';
import { EngineSound } from '../src/components/City/sound.js';
import { applyImpact, findContact, impactParams, yawInertia, spring } from '../src/components/City/carImpact.js';
import { Avatar3D, makeAvatar3DLook, avatar3DPlain } from '../src/components/City/avatar3d.js';
import { riderKind, ejectCheck, EJECT_MIN, makeRagdoll, stepRagdoll, ragdollFrame, ragdollHeading, ragdollSpin, limbPose, stepFallenBike } from '../src/components/City/riderEject.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (id) => document.getElementById(id);

const RIDES = [
  { id: 25, name: 'Bisiklet' },
  { id: 26, name: 'At' },
  { id: 27, name: 'Deve' },
  { id: 21, name: 'Scooter' },
  { id: 22, name: 'Cross' },
  { id: 23, name: 'Chopper' },
  { id: 24, name: 'Spor Motor' },
];
const KIND_TR = { bike: 'Bisiklet', horse: 'At', camel: 'Deve', moto: 'Motor' };
const minV = { ...EJECT_MIN }; // panelden ayarlanır
const cfg = { ride: 22, slowmo: true, autoUp: true, cam: 'chase' };

// --- sahne ---------------------------------------------------------------------------
const root = $('root');
const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#141433');
scene.fog = new THREE.Fog('#2a2450', 70, 230);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
scene.add(new THREE.HemisphereLight('#c4ccff', '#3a3028', 1.15));
const sun = new THREE.DirectionalLight('#ffd8b0', 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 160 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

function canvasTex(w, h, draw, rep = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
  }
  return t;
}

// zemin: asfalt + neon şerit çizgileri
const ARENA = 110;
{
  const tex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2b2d36';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 30 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v},${v + 8},${0.35 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(35,230,255,0.22)';
    g.lineWidth = 3;
    g.strokeRect(1, 1, w - 2, h - 2);
  }, ARENA / 5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // başlangıç şeridi
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(6, 34), new THREE.MeshBasicMaterial({ color: '#ff2bd6', transparent: true, opacity: 0.12 }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.01, 15);
  scene.add(lane);
}

// --- engeller (çarpışma kutuları) --------------------------------------------------------
const boxes = [];
const concrete = new THREE.MeshStandardMaterial({ color: '#8d8f99', roughness: 0.85 });
const neonMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 });
function addBox(b, mat = concrete, stripe = '#23e6ff') {
  boxes.push(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
  m.position.set(b.x, b.h / 2, b.z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  if (stripe) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.02, 0.08, b.d + 0.02), neonMat(stripe));
    s.position.set(b.x, b.h * 0.82, b.z);
    scene.add(s);
  }
  return m;
}
// karşıdaki uzun beton duvar (testlerin hedefi)
const WALL_Z = 40;
addBox({ x: 0, z: WALL_Z, w: 36, d: 1, h: 3.2, kind: 'duvar' });
// alçak beton bariyer (üstünden aşılır)
const BAR = { x: -32, z: 34, w: 16, d: 0.6, h: 0.85, kind: 'bariyer' };
addBox(BAR, concrete, '#ffd23f');
// park etmiş araba (tavanına düşülebilir)
const PARK = { x: 32, z: 36, w: 4.4, d: 1.9, h: 1.45, kind: 'araba' };
{
  boxes.push(PARK);
  const car = buildVehicle(3, null);
  car.root.position.set(PARK.x, 0, PARK.z);
  car.root.rotation.y = Math.PI / 2;
  scene.add(car.root);
  const bb = new THREE.Box3().setFromObject(car.root);
  PARK.w = bb.max.x - bb.min.x;
  PARK.d = bb.max.z - bb.min.z;
  PARK.h = Math.min(1.7, bb.max.y - 0.15);
  PARK.x = (bb.max.x + bb.min.x) / 2;
  PARK.z = (bb.max.z + bb.min.z) / 2;
}
// direkler + dış duvar
for (const [x, z] of [[-14, -18], [16, -26], [-40, 0], [44, 8], [-20, 62], [24, 70]]) addBox({ x, z, w: 1.4, d: 1.4, h: 5, kind: 'direk' }, concrete, '#ff2bd6');
for (const [x, z, w, d] of [[0, ARENA, ARENA * 2, 1], [0, -ARENA, ARENA * 2, 1], [ARENA, 0, 1, ARENA * 2], [-ARENA, 0, 1, ARENA * 2]]) addBox({ x, z, w, d, h: 3, kind: 'duvar' }, concrete, '#7a2bff');
const world = { boxes: [] };
// bineğin kendisi de engel (sürücü atın / devenin sırtına, devrilmiş motorun üstüne düşebilir)
function rideBox() {
  const c = car;
  const h = c.down ? 0.42 : c.kind === 'horse' || c.kind === 'camel' ? Math.max(0.6, seatH - 0.12) : 0.75;
  return { x: c.x, z: c.z, w: c.v.halfW * 2, d: c.v.len * 0.92, h, ry: c.yaw, self: 'ride', round: !c.down };
}
let seatH = 1;

// araç çarpışması (2B): daire × kutu (araç ağırlıkları yere yakın → 0,4 m'den alçak şey yok)
function circleBlocked(x, z, r) {
  for (const b of boxes) {
    const cx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
    const cz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return b;
  }
  return null;
}

// --- kıvılcım / toz ------------------------------------------------------------------------
const FX_N = 260;
const fxGeo = new THREE.BufferGeometry();
const fxPos = new Float32Array(FX_N * 3);
const fxCol = new Float32Array(FX_N * 3);
fxGeo.setAttribute('position', new THREE.BufferAttribute(fxPos, 3));
fxGeo.setAttribute('color', new THREE.BufferAttribute(fxCol, 3));
const fxPts = new THREE.Points(fxGeo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
fxPts.frustumCulled = false;
scene.add(fxPts);
const fx = [];
let fxI = 0;
function burst(x, y, z, n, kind = 'spark', dir = [0, 0, 0], sp = 6) {
  for (let i = 0; i < n; i++) {
    const p = (fx[fxI] = fx[fxI] || {});
    fxI = (fxI + 1) % FX_N;
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random()) * (kind === 'spark' ? sp * 0.5 : 1.4);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = Math.cos(a) * s + dir[0] * sp * 0.3;
    p.vz = Math.sin(a) * s + dir[2] * sp * 0.3;
    p.vy = (kind === 'spark' ? 2 : 0.6) + Math.random() * (kind === 'spark' ? 3 : 1);
    p.life = kind === 'spark' ? 0.35 + Math.random() * 0.4 : 0.8 + Math.random() * 0.6;
    p.t = 0;
    p.kind = kind;
  }
}
function stepFx(dt) {
  for (let i = 0; i < FX_N; i++) {
    const p = fx[i];
    if (!p || p.t >= p.life) {
      fxPos[i * 3 + 1] = -99;
      continue;
    }
    p.t += dt;
    const g = p.kind === 'spark' ? 9.8 : -0.3;
    p.vy -= g * dt;
    p.x += p.vx * dt;
    p.y = Math.max(0.02, p.y + p.vy * dt);
    p.z += p.vz * dt;
    if (p.kind === 'dust') {
      p.vx *= Math.exp(-dt * 3);
      p.vz *= Math.exp(-dt * 3);
    }
    const k = 1 - p.t / p.life;
    fxPos.set([p.x, p.y, p.z], i * 3);
    if (p.kind === 'spark') fxCol.set([1 * k, 0.75 * k, 0.25 * k], i * 3);
    else fxCol.set([0.35 * k, 0.33 * k, 0.32 * k], i * 3);
  }
  fxGeo.attributes.position.needsUpdate = true;
  fxGeo.attributes.color.needsUpdate = true;
}

// --- avatar (oyuncunun 3D gövdesi — prototipte elle çizilmiş ön / arka resim) -----------------
const AV = { gender: 'erkek', build: 'standart', skin: '#c68863', hairStyle: 'short', hairColor: '#2b2118', hat: 'none' };
function drawAvatar(back) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 580;
  const g = c.getContext('2d');
  const skin = AV.skin;
  // bacaklar (kot) + ayakkabı
  g.fillStyle = '#25324f';
  g.fillRect(96, 392, 60, 160);
  g.fillRect(164, 392, 60, 160);
  g.fillStyle = '#f2f2f2';
  g.fillRect(90, 540, 68, 36);
  g.fillRect(162, 540, 68, 36);
  // kollar
  g.fillStyle = '#ff2b6e';
  g.fillRect(70, 236, 34, 120);
  g.fillRect(216, 236, 34, 120);
  g.fillStyle = skin;
  g.fillRect(72, 352, 30, 46);
  g.fillRect(218, 352, 30, 46);
  // gövde (neon mont)
  g.fillStyle = '#ff2b6e';
  g.fillRect(96, 232, 128, 168);
  g.fillStyle = '#16182a';
  g.fillRect(156, 236, 8, 160);
  g.fillStyle = '#23e6ff';
  g.fillRect(96, 300, 128, 10);
  // boyun + kafa
  g.fillStyle = skin;
  g.fillRect(140, 212, 40, 30);
  g.beginPath();
  g.ellipse(160, 168, 56, 64, 0, 0, Math.PI * 2);
  g.fill();
  if (!back) {
    g.fillStyle = '#1a1210';
    g.beginPath();
    g.ellipse(140, 168, 6, 8, 0, 0, Math.PI * 2);
    g.ellipse(180, 168, 6, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7a3a2a';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(160, 196, 14, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
const look = makeAvatar3DLook(drawAvatar(false), drawAvatar(true), avatar3DPlain(AV), { plain: true });
const avatar = new Avatar3D(look);
avatar.root.traverse((o) => {
  if (o.isMesh) o.castShadow = true;
});
const HIP = avatar.hipH; // kalça yüksekliği (m)
// pivot: kalça noktası. Oturunca koltukta, fırlarken gövdenin katı cismi, yürürken kalça hizası
const pivot = new THREE.Group();
pivot.add(avatar.root);
avatar.root.position.y = -HIP;
scene.add(pivot);

// --- binek ---------------------------------------------------------------------------------
let car = null; // { v, x, z, y, yaw, vx, vz, spin, steer, pitch, roll, ... }
function makeCar(id, x = 0, z = 0, yaw = 0) {
  if (car) scene.remove(car.v.root);
  const v = buildVehicle(id, null);
  scene.add(v.root);
  car = { v, id, x, z, y: 0, yaw, vx: 0, vz: 0, spin: 0, steer: 0, pitch: 0, roll: 0, lastVF: 0, down: false, fall: 1, rollV: 0, jp: { x: 0, v: 0 }, jr: { x: 0, v: 0 }, su: { x: 0, v: 0 } };
  car.kind = riderKind(v);
  $('vname').textContent = v.def.name;
  renderThr();
  return car;
}
const carCircles = (x, z, yaw) => {
  const k = car.v.len / 2 - car.v.halfW * 0.9;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return [[x + fx * k, z + fz * k], [x, z], [x - fx * k, z - fz * k]];
};
const carR = () => car.v.halfW * 0.82;
const carFree = (x, z, yaw) => !carCircles(x, z, yaw).some(([px, pz]) => circleBlocked(px, pz, carR()));

// --- durum ---------------------------------------------------------------------------------
let mode = 'ride'; // ride | fly | getup | walk
let rd = null; // ragdoll
let up = null; // kalkış animasyonu
const walker = { x: 0, z: 0, yaw: 0, moving: false, walkT: 0 };
let cruise = null; // otomatik test: { v, until }
let slow = 0; // ağır çekim süresi
let camShake = 0;
let shock = 0;
let crashSeed = 1;
const sound = new EngineSound();

function reset(id = cfg.ride, x = 0, z = 0, yaw = 0) {
  cfg.ride = id;
  makeCar(id, x, z, yaw);
  mode = 'ride';
  rd = null;
  up = null;
  cruise = null;
  slow = 0;
  setState();
  renderList();
}

// --- giriş ----------------------------------------------------------------------------------
const keys = {};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  sound.start();
  if (car && !car.v.silent && mode === 'ride') sound.idle(true);
  if (e.code === 'KeyE') useE();
  if (e.code === 'KeyR') reset();
  if (e.code === 'KeyT') {
    cfg.slowmo = !cfg.slowmo;
    $('slowmo').checked = cfg.slowmo;
  }
  if (e.code === 'KeyC') cfg.cam = cfg.cam === 'chase' ? 'far' : 'chase';
  const n = Number(e.key);
  if (n >= 1 && n <= RIDES.length) reset(RIDES[n - 1].id);
});
addEventListener('keyup', (e) => (keys[e.code] = false));
document.querySelectorAll('#touch [data-k]').forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => {
    e.preventDefault();
    keys[k] = true;
    b.classList.add('on');
    sound.start();
    if (k === 'KeyE') useE();
  };
  const off = (e) => {
    e.preventDefault();
    keys[k] = false;
    b.classList.remove('on');
  };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
});
function useE() {
  if (mode === 'walk' && car && Math.hypot(walker.x - car.x, walker.z - car.z) < 3.2) mount();
  else if (mode === 'ride' && Math.hypot(car.vx, car.vz) < 1.5) dismount();
}
function mount() {
  // devrilmiş motoru kaldır
  car.down = false;
  car.roll = 0;
  car.rollV = 0;
  car.vx = car.vz = car.spin = 0;
  mode = 'ride';
  setState();
}
function dismount() {
  const lx = Math.cos(car.yaw);
  const lz = -Math.sin(car.yaw);
  walker.x = car.x + lx * 1.3;
  walker.z = car.z + lz * 1.3;
  walker.yaw = car.yaw;
  mode = 'walk';
  sound.idle(false);
  setState();
}

// --- sürüş (şehirdeki stepDrive'ın sade kopyası) ---------------------------------------------
function stepDrive(dt) {
  const c = car;
  const P = c.v.def.phys;
  const riding = mode === 'ride';
  let thr = 0;
  let st = 0;
  let hand = false;
  if (riding) {
    if (keys.KeyW || keys.ArrowUp) thr = 1;
    if (keys.KeyS || keys.ArrowDown) thr = -1;
    if (keys.KeyA || keys.ArrowLeft) st = -1;
    if (keys.KeyD || keys.ArrowRight) st = 1;
    if (keys.Space) hand = true;
  }
  let fx = Math.sin(c.yaw);
  let fz = Math.cos(c.yaw);
  const vF0 = c.vx * fx + c.vz * fz;
  const moto = Boolean(c.v.moto);
  const horse = c.v.ride === 'horse';
  const spd0 = Math.abs(vF0);
  const steerIn = (moto && !horse ? 2.2 : 3.6) / (horse ? 1 : 1 + Math.max(0, spd0 - 15) * 0.012);
  c.steer += (-st - c.steer) * Math.min(1, dt * (st ? steerIn : moto && !horse ? 4 : 6));
  const steerDiv = 1 + spd0 * (moto ? 0.085 : 0.045);
  const delta = (c.steer * P.steer) / steerDiv;
  let yawRate = c.down ? 0 : (vF0 * Math.tan(delta)) / c.v.wb;
  if (horse && !c.down) yawRate = ((c.steer * P.steer * 3.4) / (1 + Math.abs(vF0) * 0.07)) * (vF0 < -0.3 ? -1 : 1);
  if (hand && Math.abs(vF0) > 3) yawRate *= 1.45;
  const spinNow = c.spin || 0;
  if (spinNow) c.spin = Math.abs(spinNow) < 0.02 ? 0 : spinNow * Math.exp(-dt * (2.4 + Math.min(3, Math.abs(vF0) * 0.08)));
  yawRate += spinNow;
  c.yaw += yawRate * dt;
  fx = Math.sin(c.yaw);
  fz = Math.cos(c.yaw);
  const sx = fz;
  const sz = -fx;
  let vF = c.vx * fx + c.vz * fz;
  let vL = c.vx * sx + c.vz * sz;
  if (c.down) {
    // sürücüsüz devrilen motor / bisiklet: yan yatıp kayar
    stepFallenBike(c, dt);
    vF = c.vx * fx + c.vz * fz;
  } else {
    let acc = 0;
    if (thr > 0) acc = vF < -0.4 ? 18 : P.acc * thr * Math.max(0, 1 - Math.pow(Math.max(0, vF) / P.vmax, 1.7));
    else if (thr < 0) acc = vF > 0.4 ? -20 : vF > -P.vmax * 0.28 ? -P.acc * 0.55 : 0;
    acc -= vF * 0.06;
    if (!thr) acc -= Math.sign(vF) * (riding ? 2.4 : horse ? 9 : 2.4); // sürücüsüz at hemen durur
    if (hand) acc -= Math.sign(vF) * 7;
    const before = vF;
    vF += acc * dt;
    if (!thr && Math.sign(vF) !== Math.sign(before)) vF = 0;
    if (c.backT > 0 && !riding) {
      c.backT -= dt;
      vF = -2.2;
    }
    // otomatik test: sabit hız (hız göstergesi gerçek kalır)
    if (cruise && riding) {
      vF = cruise.v;
      c.steer = 0;
    }
    const grip = hand ? 1.4 : Math.max(3.2, P.grip - Math.abs(vF) * 0.09);
    vL *= Math.exp(-grip * dt);
    c.vx = fx * vF + sx * vL;
    c.vz = fz * vF + sz * vL;
  }
  // hareket + çarpışma (carImpact.js — şehirdeki gibi)
  const oldYaw = c.yaw - yawRate * dt;
  const nx = c.x + c.vx * dt;
  const nz = c.z + c.vz * dt;
  const spd = Math.hypot(c.vx, c.vz);
  let impact = null;
  let pre = null;
  if (carFree(nx, nz, c.yaw)) {
    c.x = nx;
    c.z = nz;
  } else {
    pre = { vx: c.vx, vz: c.vz, spd };
    const r = carR();
    const circ = (x, z) => Boolean(circleBlocked(x, z, r));
    const pt = (x, z) => Boolean(circleBlocked(x, z, 0.05));
    const k = findContact(carCircles(nx, nz, c.yaw), r, circ, pt, [c.vx / (spd || 1), c.vz / (spd || 1)]);
    if (k) {
      const res = applyImpact(c, k, { ...impactParams(c.v), I: yawInertia(c.v) });
      if (res.vn > 0 || res.vt > 0) impact = { ...res, ...k };
    }
    const tx = c.x + c.vx * dt;
    const tz = c.z + c.vz * dt;
    if (impact && carFree(tx, tz, c.yaw)) {
      c.x = tx;
      c.z = tz;
    } else if (carFree(nx, c.z, c.yaw)) {
      c.x = nx;
      c.vz = 0;
    } else if (carFree(c.x, nz, c.yaw)) {
      c.z = nz;
      c.vx = 0;
    } else {
      if (!carFree(c.x, c.z, c.yaw)) c.yaw = oldYaw;
      c.vx *= -0.2;
      c.vz *= -0.2;
    }
  }
  if (impact) onImpact(c, impact, pre);
  // görsel
  const longA = (vF - c.lastVF) / Math.max(dt, 1e-3);
  c.lastVF = vF;
  c.pitch += (clamp(-longA * 0.006, -0.05, 0.05) - c.pitch) * Math.min(1, dt * 6);
  if (!c.down) {
    const rollT = horse ? clamp(-vF * yawRate * 0.008, -0.08, 0.08) : clamp(-vF * yawRate * 0.045, -0.6, 0.6);
    c.roll += (rollT - c.roll) * Math.min(1, dt * 6);
  }
  spring(c.jp, 120, 10, dt);
  spring(c.jr, 120, 10, dt);
  spring(c.su, 150, 12, dt);
  const v = c.v;
  v.root.position.set(c.x, c.down ? Math.min(0.32, Math.abs(c.roll) * 0.22) : 0, c.z);
  v.root.rotation.set(0, c.yaw, 0);
  if (v.tiltY0 == null) v.tiltY0 = v.tilt.position.y;
  v.tilt.position.y = v.tiltY0 + clamp(c.su.x, -0.22, 0.1);
  v.tilt.rotation.set(c.pitch + clamp(c.jp.x, -0.35, 0.35), 0, c.roll + clamp(c.jr.x, -0.18, 0.18));
  v.wheels.forEach((w) => (w.spin.rotation.z -= (vF * dt) / w.r));
  v.gait?.(c.down ? 0 : vF, dt, dt > 0 ? yawRate : 0);
  if (!v.silent && riding) sound.update(Math.min(1, Math.abs(vF) / P.vmax), thr, 0);
  return vF;
}

// Çarpma: sertlik = duvara dik kapanma hızı (vn). Sınırı aşarsa sürücü fırlar.
function onImpact(c, im, pre) {
  if (im.vn > 1.5) cruise = null; // otomatik test: çarpınca gaz bırakılır
  const fx = Math.sin(c.yaw);
  const fz = Math.cos(c.yaw);
  const nf = im.nx * fx + im.nz * fz;
  const ns = im.nx * fz - im.nz * fx;
  const k = Math.min(1, im.vn / 18);
  if (im.vn > 1.5) {
    c.jp.v += -nf * 2.6 * k;
    c.jr.v += ns * 2.2 * k;
    c.su.v -= 0.9 * k;
  }
  if (im.vn > 4 && !c.v.walker) burst(im.px, 0.45, im.pz, Math.min(18, Math.round(3 + im.vn)), 'spark', [im.nx, 0, im.nz], im.vn);
  if (im.vn > 3) {
    camShake = Math.max(camShake, Math.min(0.55, im.vn * 0.035));
    sound.thump(Math.min(30, im.vn * 1.3));
  }
  if (mode !== 'ride' || im.vn < 1.5) return;
  const kmh = Math.round(im.vn * 3.6);
  const tot = Math.round(pre.spd * 3.6);
  if (ejectCheck(c.v, im.vn, minV)) {
    $('last').textContent = `${tot} km/sa · dik ${kmh} → FIRLADI`;
    showLog(`💥 Sert çarpma: ${tot} km/sa (duvara dik ${kmh}) — sınır ${Math.round(minV[c.kind] * 3.6)} → FIRLADIN!`, 'eject');
    eject(c, pre);
  } else {
    $('last').textContent = `${tot} km/sa · dik ${kmh} → hafif`;
    showLog(`Hafif çarpma: ${tot} km/sa (duvara dik ${kmh}) — sınır ${Math.round(minV[c.kind] * 3.6)}, sürücü binekte`, 'soft');
  }
}

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const ax = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function eject(c, pre) {
  cruise = null;
  placeSeated(0); // pivotun güncel koltuk konumu
  pivot.updateMatrixWorld(true);
  pivot.getWorldQuaternion(tmpQ);
  ax[0].set(1, 0, 0).applyQuaternion(tmpQ);
  ax[1].set(0, 1, 0).applyQuaternion(tmpQ);
  ax[2].set(0, 0, 1).applyQuaternion(tmpQ);
  rd = makeRagdoll({
    pelvis: [pivot.position.x, pivot.position.y, pivot.position.z],
    frame: { x: ax[0].toArray(), y: ax[1].toArray(), z: ax[2].toArray() },
    vel: [pre.vx, 0, pre.vz],
    kind: c.kind,
    speed: pre.spd,
    seed: crashSeed++,
  });
  mode = 'fly';
  shock = 1;
  if (cfg.slowmo) slow = 1.1;
  sound.idle(false);
  // motor / bisiklet sürücüsüz kalınca devrilir (çarpmanın yan tarafına doğru)
  if (c.kind === 'moto' || c.kind === 'bike') {
    c.down = true;
    c.fall = (c.spin || 0) > 0 ? -1 : 1;
    c.rollV = c.fall * 2.5;
  } else {
    // at / deve: irkilir (baş kalkar) ve birkaç adım geri çekilir
    c.jp.v -= 3.2;
    c.backT = 0.7;
  }
  flash(`FIRLADIN!`, `${KIND_TR[c.kind]} · ${Math.round(pre.spd * 3.6)} km/sa`);
  setState();
}

// --- avatarın yeri / pozu ------------------------------------------------------------------------
function placeSeated(dt) {
  const v = car.v;
  v.root.updateMatrixWorld(true);
  const sp = v.seatPts[0];
  v.body.localToWorld(tmpV.set(sp[0], sp[1], sp[2]));
  pivot.position.copy(tmpV);
  pivot.position.y += 0.03;
  seatH = tmpV.y;
  v.tilt.getWorldQuaternion(pivot.quaternion);
  avatar.pose({ dt, t: performance.now() / 1000, walkT: 0, walk: false, sit: true, drive: true });
}
const basis = new THREE.Matrix4();
function placeRagdoll(dt) {
  const f = ragdollFrame(rd);
  pivot.position.set(...f.o);
  basis.makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z));
  pivot.quaternion.setFromRotationMatrix(basis);
  avatar.pose({ dt, t: performance.now() / 1000, walkT: 0, walk: false, sit: false });
  const lp = limbPose(rd.air, rd.t, ragdollSpin(rd), shock);
  applyLimbs(lp, 1);
}
// limbPose → Avatar3D eklemleri (k: karışım)
function applyLimbs(lp, k) {
  avatar.arms.forEach((a, i) => {
    const p = lp.arms[a.sx > 0 ? 1 : 0];
    a.sh.rotation.x += (p.x - a.sh.rotation.x) * k;
    a.sh.rotation.z += (a.sx * Math.abs(p.z) - a.sh.rotation.z) * k;
    a.el.rotation.x += (p.ex - a.el.rotation.x) * k;
    void i;
  });
  avatar.legs.forEach((l, i) => {
    const p = lp.legs[i];
    l.hip.rotation.x += (p.x - l.hip.rotation.x) * k;
    l.knee.rotation.x += (p.k - l.knee.rotation.x) * k;
  });
}
const smooth = (t) => t * t * (3 - 2 * t);
function startGetUp() {
  const yaw = ragdollHeading(rd);
  up = { t: 0, q0: pivot.quaternion.clone(), p0: pivot.position.clone(), q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), yaw };
  mode = 'getup';
  setState();
}
function placeGetUp(dt) {
  up.t += dt / 1.1;
  const k = smooth(Math.min(1, up.t));
  pivot.quaternion.slerpQuaternions(up.q0, up.q1, k);
  pivot.position.set(up.p0.x, up.p0.y + (HIP - up.p0.y) * k, up.p0.z);
  avatar.pose({ dt, t: performance.now() / 1000, walkT: 0, walk: false, sit: false });
  // önce dizler bükülür (çömelme), sonra doğrulur
  const crouch = Math.sin(k * Math.PI);
  applyLimbs(limbPose(0, 0, 0, 0), 1 - k);
  avatar.legs.forEach((l) => {
    l.hip.rotation.x -= crouch * 1.1;
    l.knee.rotation.x += crouch * 1.6;
  });
  if (up.t >= 1) {
    walker.x = pivot.position.x;
    walker.z = pivot.position.z;
    walker.yaw = up.yaw;
    up = null;
    rd = null;
    mode = 'walk';
    setState();
  }
}
function stepWalk(dt) {
  let ix = 0;
  let iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  walker.moving = Boolean(ix || iz);
  if (walker.moving) {
    // kameraya göre
    const cy = camYaw;
    const fx = Math.sin(cy);
    const fz = Math.cos(cy);
    const dx = fx * iz - fz * ix;
    const dz = fz * iz + fx * ix;
    const L = Math.hypot(dx, dz);
    const sp = 3.4;
    const nx = walker.x + (dx / L) * sp * dt;
    const nz = walker.z + (dz / L) * sp * dt;
    if (!circleBlocked(nx, nz, 0.3)) {
      walker.x = nx;
      walker.z = nz;
    }
    const want = Math.atan2(dx, dz);
    walker.yaw += Math.atan2(Math.sin(want - walker.yaw), Math.cos(want - walker.yaw)) * Math.min(1, dt * 10);
    walker.walkT += dt;
  }
  pivot.position.set(walker.x, HIP, walker.z);
  pivot.quaternion.setFromEuler(new THREE.Euler(0, walker.yaw, 0));
  avatar.pose({ dt, t: performance.now() / 1000, walkT: walker.walkT * 1.3, walk: walker.moving, sit: false });
}

// --- kamera ---------------------------------------------------------------------------------
let camYaw = 0;
const camPos = new THREE.Vector3(0, 4, -8);
const camLook = new THREE.Vector3();
function stepCam(dt) {
  let tx;
  let ty;
  let tz;
  let dist = cfg.cam === 'far' ? 13 : 7.2;
  let h = cfg.cam === 'far' ? 6 : 3.1;
  if (mode === 'ride') {
    tx = car.x;
    ty = 1.2;
    tz = car.z;
    const sp = Math.hypot(car.vx, car.vz);
    const want = sp > 1 && !car.down ? Math.atan2(car.vx, car.vz) : car.yaw;
    camYaw += Math.atan2(Math.sin(want - camYaw), Math.cos(want - camYaw)) * Math.min(1, dt * 3.2);
  } else {
    tx = pivot.position.x;
    ty = Math.max(0.8, pivot.position.y + 0.3);
    tz = pivot.position.z;
    if (mode === 'walk' && walker.moving) {
      // yürürken kamera yavaşça arkaya döner
      camYaw += Math.atan2(Math.sin(walker.yaw - camYaw), Math.cos(walker.yaw - camYaw)) * Math.min(1, dt * 1.2);
    }
    if (mode === 'fly') {
      dist -= 0.8;
      h -= 0.4;
    }
  }
  const want = tmpV.set(tx - Math.sin(camYaw) * dist, ty + h, tz - Math.cos(camYaw) * dist);
  camPos.lerp(want, Math.min(1, dt * (mode === 'fly' ? 4 : 5)));
  camLook.lerp(tmpV.set(tx, ty, tz), Math.min(1, dt * 8));
  camera.position.copy(camPos);
  if (camShake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * camShake;
    camera.position.y += (Math.random() - 0.5) * camShake;
    camShake *= Math.exp(-dt * 7);
  }
  camera.lookAt(camLook);
  sun.position.set(tx + 20, 40, tz - 12);
  sun.target.position.set(tx, 0, tz);
}

// --- HUD ---------------------------------------------------------------------------------------
let logT = 0;
function showLog(t, cls) {
  const el = $('log');
  el.textContent = t;
  el.className = `hud glass ${cls}`;
  el.style.opacity = 1;
  logT = 4;
}
let msgT = 0;
function flash(t, s) {
  const el = $('msg');
  el.innerHTML = `${t}<small>${s}</small>`;
  el.style.opacity = 1;
  msgT = 1.6;
}
const STATE_TR = { ride: 'Binekte', fly: 'Havada / yerde', getup: 'Kalkıyor', walk: 'Yaya' };
function setState() {
  $('state').textContent = STATE_TR[mode];
}
function renderThr() {
  if (!car) return;
  $('thr').textContent = `${Math.round(minV[car.kind] * 3.6)} km/sa (${KIND_TR[car.kind]})`;
}
function renderList() {
  document.querySelectorAll('#vlist .btn').forEach((b) => b.classList.toggle('sel', Number(b.dataset.id) === cfg.ride));
}
{
  const vl = $('vlist');
  RIDES.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.dataset.id = r.id;
    b.textContent = `${i + 1} ${r.name}`;
    b.onclick = () => reset(r.id);
    vl.appendChild(b);
  });
  const ts = $('tests');
  [12, 20, 30, 45, 60, 80, 100].forEach((kmh) => {
    const b = document.createElement('button');
    b.className = `btn ${kmh >= 30 ? 'hot' : 'cool'}`;
    b.textContent = `${kmh} km/sa`;
    b.onclick = () => runTest(kmh, 0, 0, WALL_Z - 0.5 - 24);
    ts.appendChild(b);
  });
  document.querySelector('[data-side]').onclick = () => runTest(40, Math.PI / 2 - 0.26, -17, WALL_Z - 2.2); // duvara 15° açıyla
  document.querySelector('[data-bar]').onclick = () => runTest(45, 0, BAR.x, BAR.z - 24);
  document.querySelector('[data-car]').onclick = () => runTest(50, 0, PARK.x, PARK.z - PARK.d / 2 - 24);
  const sl = $('sliders');
  for (const k of ['bike', 'horse', 'camel', 'moto']) {
    const row = document.createElement('div');
    row.className = 'sl';
    row.innerHTML = `<span>${KIND_TR[k]}</span><input type="range" min="8" max="60" step="1" value="${Math.round(minV[k] * 3.6)}" /><b>${Math.round(minV[k] * 3.6)}</b>`;
    const inp = row.querySelector('input');
    inp.oninput = () => {
      minV[k] = Number(inp.value) / 3.6;
      row.querySelector('b').textContent = inp.value;
      renderThr();
    };
    sl.appendChild(row);
  }
  $('slowmo').onchange = (e) => (cfg.slowmo = e.target.checked);
  $('autoup').onchange = (e) => (cfg.autoUp = e.target.checked);
  $('ptitle').onclick = () => {
    $('panel').classList.toggle('min');
    $('pmin').textContent = $('panel').classList.contains('min') ? '+' : '–';
  };
  if (IS_TOUCH) $('panel').classList.add('min');
}
// otomatik test: duvara (ya da bariyere / arabaya) açıyla sabit hızla sür
function runTest(kmh, ang, x, z) {
  reset(cfg.ride, x, z, ang);
  cruise = { v: kmh / 3.6 };
  car.vx = Math.sin(ang) * cruise.v;
  car.vz = Math.cos(ang) * cruise.v;
  camYaw = ang;
  camPos.set(x - Math.sin(ang) * 7, 4, z - Math.cos(ang) * 7);
  sound.start();
  if (!car.v.silent) sound.idle(true);
}

// --- döngü -----------------------------------------------------------------------------------------
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
reset(cfg.ride);

let last = performance.now();
let restT = 0;
let paused = false; // tanı: __firlama.advance ile kare kare
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (paused) {
    requestAnimationFrame(frame);
    return;
  }
  const realDt = dt;
  if (slow > 0) {
    slow -= realDt;
    dt *= 0.32;
  }
  stepSim(dt);
  stepCam(realDt);
  // HUD
  const sp = mode === 'ride' ? Math.hypot(car.vx, car.vz) : rd ? Math.hypot(rd.ps[0].v[0], rd.ps[0].v[2]) : 0;
  $('kmh').textContent = Math.round(sp * 3.6);
  if (logT > 0 && (logT -= realDt) <= 0) $('log').style.opacity = 0;
  if (msgT > 0 && (msgT -= realDt) <= 0) $('msg').style.opacity = 0;
  const hint = $('hint');
  const near = mode === 'walk' && Math.hypot(walker.x - car.x, walker.z - car.z) < 3.2;
  const restHint = mode === 'fly' && rd?.rest && !cfg.autoUp;
  hint.style.display = near || restHint ? 'block' : 'none';
  if (near) hint.textContent = `E: ${car.v.def.name}${car.down ? ' kaldır ve bin' : ' bin'}`;
  if (restHint) hint.textContent = 'E / W: kalk';
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function stepSim(dt) {
  stepDrive(dt);
  if (mode === 'ride') placeSeated(dt);
  else if (mode === 'fly') {
    world.boxes = [...boxes, rideBox()];
    const hit = stepRagdoll(rd, dt, world);
    shock = Math.max(shock * Math.exp(-dt * 5), Math.min(1, hit / 8));
    if (hit > 2.5) {
      const p = rd.ps[0].p;
      burst(p[0], 0.1, p[2], Math.min(14, Math.round(hit * 1.2)), 'dust');
      camShake = Math.max(camShake, Math.min(0.4, hit * 0.03));
      sound.thump(Math.min(20, hit));
    }
    if (rd.slide > 3 && Math.random() < dt * 20) burst(rd.ps[0].p[0], 0.05, rd.ps[0].p[2], 1, 'dust');
    placeRagdoll(dt);
    if (rd.rest) {
      restT += dt;
      if ((cfg.autoUp && restT > 0.5) || (!cfg.autoUp && (keys.KeyE || keys.KeyW))) {
        restT = 0;
        startGetUp();
      }
    } else restT = 0;
  } else if (mode === 'getup') placeGetUp(dt);
  else stepWalk(dt);
  stepFx(dt);
}
requestAnimationFrame(frame);

// test / tanı (headless)
function advance(sec, h = 1 / 60) {
  paused = true;
  for (let t = 0; t < sec - 1e-9; t += h) {
    stepSim(h);
    stepCam(h);
  }
  renderer.render(scene, camera);
}
window.__firlama = { advance, walker, get mode() { return mode; }, get rd() { return rd; }, get car() { return car; }, runTest, reset, stepSim, minV, cfg, pivot };
