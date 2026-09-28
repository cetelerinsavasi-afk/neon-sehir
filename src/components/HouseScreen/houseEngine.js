import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { CATALOG_MAP, buildItem, itemBoxes, disposeObject, TINTS, M } from './houseCatalog';
import { FLOORS, WALLS, floorDef, wallDef, surfaceTexture } from './houseTextures';

// =============================================================================
// houseEngine.js — Ev'in 3D motoru (three.js). React'ten bağımsız; HouseScreen
// bir <div> verir, motor içine canvas + isim/balon katmanı kurar.
//
// İki mod:
//   'build' → yukarıdan yörünge kamera. Eşya ekle / sürükle / döndür / boya / sil.
//   'walk'  → 3. şahıs kamera, joystick/WASD ile yürü, otur, TV aç vb.
//
// Avatarlar: oyunun mevcut SVG avatarları (buildFullAvatarSvgMarkup) birebir
// dokuya çevrilip kameraya dönen "kağıt figür" (billboard) olarak çiziliyor —
// böylece 2D'deki tipler hiç bozulmadan 3D evin içinde yürüyor.
// =============================================================================

export const ROOM = { W: 18, D: 14, H: 3.4 };
const { W, D, H } = ROOM;
const SNAP = 0.25;
const PLAYER_R = 0.3;
const WALK_SPEED = 3.0;
const MAX_ITEMS = 300;
const AV_UNIT = 1.75 / 507; // avatar SVG birimi → metre (figür ~507 birim = 1.75 m)
const AV_PLANE_H = 580 * AV_UNIT;
const AV_PLANE_W = 320 * AV_UNIT;
const AV_FEET = (580 - 562) * AV_UNIT;
const AV_WAIST_FROM_TOP = 380 * AV_UNIT;
const SPAWN = { x: 5, z: D / 2 - 3.2 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = (v) => Math.round(v / SNAP) * SNAP;
let idSeq = 0;
export const newItemId = () => `${Date.now().toString(36).slice(-5)}${(idSeq++ % 1296).toString(36).padStart(2, '0')}`;

// --- Avatar dokuları ---------------------------------------------------------
const avatarTexCache = new Map();
function avatarTextures(avatar) {
  const av = avatar || DEFAULT_AVATAR;
  const key = JSON.stringify(av);
  let entry = avatarTexCache.get(key);
  if (entry) return entry;
  entry = { ready: false, tex: {} };
  avatarTexCache.set(key, entry);
  const poses = ['idle', 'walk1', 'walk2', 'sit'];
  let left = poses.length;
  poses.forEach((pose) => {
    const markup = buildFullAvatarSvgMarkup(av, { pose }).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, '');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 580;
      c.getContext('2d').drawImage(img, 0, 0, 320, 580);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      entry.tex[pose] = t;
      left -= 1;
      if (left === 0) entry.ready = true;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  });
  return entry;
}

let blobTex = null;
function blobShadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(0,0,0,0.55)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

class AvatarFigure {
  constructor(scene, labelLayer, { uid, name, avatar, isSelf }) {
    this.uid = uid;
    this.isSelf = isSelf;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, toneMapped: false, side: THREE.DoubleSide });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(AV_PLANE_W, AV_PLANE_H), this.mat);
    this.plane.visible = false;
    this.group.add(this.plane);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.group.add(this.shadow);
    scene.add(this.group);
    this.x = 0;
    this.z = 0;
    this.tx = 0;
    this.tz = 0;
    this.moving = false;
    this.walkT = 0;
    this.facingLeft = false;
    this.seat = null;
    this.bubbles = [];
    this.label = document.createElement('div');
    this.label.className = `hs-label${isSelf ? ' self' : ''}`;
    this.bubbleBox = document.createElement('div');
    this.bubbleBox.className = 'hs-bubbles';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'hs-name';
    this.label.append(this.bubbleBox, this.nameEl);
    labelLayer.appendChild(this.label);
    this.setIdentity(name, avatar);
  }
  setIdentity(name, avatar) {
    this.nameEl.textContent = name || 'Oyuncu';
    const key = JSON.stringify(avatar || DEFAULT_AVATAR);
    if (key !== this.avKey) {
      this.avKey = key;
      this.tex = avatarTextures(avatar);
    }
  }
  say(text) {
    const el = document.createElement('div');
    el.className = 'hs-bubble';
    el.textContent = text;
    this.bubbleBox.appendChild(el);
    const b = { el, until: performance.now() + 9000 };
    this.bubbles.push(b);
    while (this.bubbles.length > 3) this.bubbles.shift().el.remove();
  }
  update(dt, camera, now, seatPos) {
    // konum
    if (seatPos) {
      this.x = seatPos.x;
      this.z = seatPos.z;
    } else if (!this.isSelf) {
      const dx = this.tx - this.x;
      const dz = this.tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 3) {
        this.x = this.tx;
        this.z = this.tz;
      } else {
        const k = 1 - Math.exp(-dt * 10);
        this.x += dx * k;
        this.z += dz * k;
      }
      this.moving = d > 0.04;
    }
    this.group.position.set(this.x, 0, this.z);
    // kameraya dön (sadece y ekseni)
    const ang = Math.atan2(camera.position.x - this.x, camera.position.z - this.z);
    this.plane.rotation.y = ang;
    // yürüme karesi
    let pose = 'idle';
    if (seatPos) pose = 'sit';
    else if (this.moving) {
      this.walkT += dt;
      pose = Math.floor(this.walkT / 0.16) % 2 ? 'walk2' : 'walk1';
    }
    if (this.tex.ready) {
      const t = this.tex.tex[pose];
      if (this.mat.map !== t) {
        this.mat.map = t;
        this.mat.needsUpdate = true;
      }
      this.plane.visible = true;
    }
    const sx = this.facingLeft ? -1 : 1;
    this.plane.scale.set(sx, 1, 1);
    if (seatPos) {
      const topY = seatPos.y + 0.04 + AV_WAIST_FROM_TOP;
      this.plane.position.y = topY - AV_PLANE_H / 2;
      this.shadow.visible = false;
    } else {
      this.plane.position.y = AV_PLANE_H / 2 - AV_FEET;
      this.shadow.visible = true;
    }
    // balonların süresi
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.el.remove();
        return false;
      }
      return true;
    });
  }
  headWorld(v) {
    // saçın tepesi SVG'de ~y=55 → düzlemin üstünden ~0.19 m aşağıda
    const top = this.plane.position.y + AV_PLANE_H / 2 - 0.12;
    return v.set(this.x, top, this.z);
  }
  dispose(scene) {
    scene.remove(this.group);
    this.plane.geometry.dispose();
    this.mat.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.label.remove();
  }
}

// --- Küçük resimler (katalog rafı) ------------------------------------------
let thumbCtx = null;
const thumbCache = new Map();
function thumbRenderer() {
  if (thumbCtx) return thumbCtx;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(160, 160, false);
  r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  s.environmentIntensity = 0.9;
  s.add(new THREE.HemisphereLight('#dfe8ff', '#302420', 1.2));
  const dl = new THREE.DirectionalLight('#fff4e0', 2.2);
  dl.position.set(3, 6, 5);
  s.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  thumbCtx = { r, s, cam };
  return thumbCtx;
}
export function getThumb(k, ti = 0) {
  const key = `${k}|${ti}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  try {
    const { r, s, cam } = thumbRenderer();
    const obj = buildItem(k, { ti, live: false, H: ROOM.H, wallMat: M('#cfcac1', 0.9) });
    if (!obj) return null;
    s.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.05;
    const dir = new THREE.Vector3(0.9, 0.7, 1.4).normalize();
    cam.position.copy(center).addScaledVector(dir, radius / Math.tan((cam.fov * Math.PI) / 360));
    cam.lookAt(center);
    r.render(s, cam);
    const url = r.domElement.toDataURL('image/png');
    s.remove(obj);
    disposeObject(obj);
    thumbCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

// =============================================================================
// MOTOR
// =============================================================================
export function createHouseEngine(container, { canEdit, selfUid, onSelectionChange, onDesignChange, onInteractChange, onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'hs-gl';
  container.appendChild(canvas);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'hs-labels';
  container.appendChild(labelLayer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07080d');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;

  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 120);
  camera.rotation.order = 'YXZ';

  // --- Işıklar ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#c9d4ff', '#2a211c', 0.9));
  const sun = new THREE.DirectionalLight('#ffe8cc', 1.5);
  sun.position.set(5, 14, 7);
  sun.castShadow = true;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  // tavan şerit ışıkları (sabit)
  const stripMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffe2b0', emissiveIntensity: 2.4 });
  const ceilLights = [];
  for (let x = -6; x <= 6; x += 6) {
    for (let z = -4; z <= 4; z += 8) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.3), stripMat);
      b.position.set(x, H - 0.03, z);
      scene.add(b);
      const l = new THREE.PointLight('#ffd9a8', 9, 11, 2);
      l.position.set(x, H - 0.4, z);
      scene.add(l);
      ceilLights.push(b, l);
    }
  }
  // eşya ışıkları havuzu (sabit sayıda → shader yeniden derlenmez)
  const LIGHT_POOL = 6;
  const pool = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const l = new THREE.PointLight('#ffffff', 0, 5, 2);
    scene.add(l);
    pool.push(l);
  }

  // --- Oda ---------------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: '#0b0c12', roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.03;
  outside.receiveShadow = true;
  scene.add(outside);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#1a1b20', roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  const wallMatLong = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const wallMatShort = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const dividerMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.5 });
  const capMat = new THREE.MeshStandardMaterial({ color: '#23242a', roughness: 0.8 });
  const STUB_H = 0.45;
  // duvar: 0=arka (z=-D/2), 1=sağ (x=W/2), 2=ön (z=D/2), 3=sol (x=-W/2)
  const walls = [
    { len: W, pos: [0, -D / 2], ry: 0, mat: wallMatLong },
    { len: D, pos: [W / 2, 0], ry: -Math.PI / 2, mat: wallMatShort },
    { len: W, pos: [0, D / 2], ry: Math.PI, mat: wallMatLong },
    { len: D, pos: [-W / 2, 0], ry: Math.PI / 2, mat: wallMatShort },
  ].map((w, i) => {
    const grp = new THREE.Group();
    grp.position.set(w.pos[0], 0, w.pos[1]);
    grp.rotation.y = w.ry;
    const full = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w.len, H), w.mat);
    plane.position.y = H / 2;
    plane.receiveShadow = true;
    full.add(plane);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w.len, 0.12, 0.03), trimMat);
    base.position.set(0, 0.06, 0.015);
    full.add(base);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w.len + 0.3, 0.12, 0.3), capMat);
    cap.position.set(0, H + 0.06, -0.15);
    full.add(cap);
    const stub = new THREE.Group();
    const sg = new THREE.PlaneGeometry(w.len, STUB_H);
    const uv = sg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (STUB_H / H));
    const sp = new THREE.Mesh(sg, w.mat);
    sp.position.y = STUB_H / 2;
    stub.add(sp);
    const scap = new THREE.Mesh(new THREE.BoxGeometry(w.len + 0.3, 0.06, 0.3), capMat);
    scap.position.set(0, STUB_H + 0.03, -0.15);
    stub.add(scap);
    stub.visible = false;
    grp.add(full, stub);
    scene.add(grp);
    return { ...w, i, grp, full, stub, hidden: false };
  });
  // sabit ön kapı (spawn noktası)
  {
    const door = new THREE.Group();
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.12), new THREE.MeshStandardMaterial({ color: '#15151a', roughness: 0.4 }));
    fr.position.set(0, 1.2, 0.06);
    const pn = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.25, 0.08), new THREE.MeshStandardMaterial({ color: '#3a2216', roughness: 0.45 }));
    pn.position.set(0, 1.13, 0.1);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.06), new THREE.MeshStandardMaterial({ color: '#d9a93c', roughness: 0.25, metalness: 1 }));
    hd.position.set(0.42, 1.05, 0.16);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshStandardMaterial({ color: '#2a1e18', roughness: 1 }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.012, 0.6);
    door.add(fr, pn, hd, mat);
    door.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    // ön duvar grubunun yerel koordinatında: x ekseni ters (ry=PI)
    door.position.set(-SPAWN.x, 0, 0);
    walls[2].full.add(door);
  }
  const grid = new THREE.GridHelper(Math.max(W, D), Math.max(W, D) * 2, '#19e8ff', '#3a4250');
  grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
  grid.position.y = 0.006;
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  grid.material.depthWrite = false;
  scene.add(grid);

  // seçim göstergesi
  const selMat = new THREE.LineBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0.95, depthTest: false });
  const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), selMat);
  selBox.renderOrder = 999;
  selBox.visible = false;
  scene.add(selBox);
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0.5, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2;
  selRing.position.y = 0.02;
  selRing.visible = false;
  scene.add(selRing);

  // --- Durum ---------------------------------------------------------------------
  let design = { items: [], wall: WALLS[0].key, floor: FLOORS[0].key };
  const objs = new Map(); // id -> { obj, data, sig }
  let selectedId = null;
  let mode = canEdit ? 'build' : 'walk';
  const undoStack = [];
  // yörünge kamera
  const orbit = { az: 0.35, el: 0.95, dist: 20, tx: 0, tz: 0 };
  const orbitCur = { ...orbit };
  // yürüme
  const self = { x: SPAWN.x, z: SPAWN.z, camYaw: 0, camPitch: 0.36, camDist: 3.8, seat: null, fig: null };
  const joy = { x: 0, y: 0 };
  const keys = {};
  const others = new Map();
  let disposed = false;

  function setSurfaces() {
    const f = floorDef(design.floor);
    if (floorMat.map) floorMat.map.dispose();
    floorMat.map = surfaceTexture(f, W / f.rep, D / f.rep);
    floorMat.roughness = f.rough;
    floorMat.emissiveMap = f.emissive ? floorMat.map : null;
    floorMat.emissive = new THREE.Color(f.emissive ? '#ffffff' : '#000000');
    floorMat.emissiveIntensity = f.emissive ? 0.8 : 0;
    floorMat.needsUpdate = true;
    const w = wallDef(design.wall);
    [[wallMatLong, W], [wallMatShort, D], [dividerMat, 4]].forEach(([m, len]) => {
      if (m.map) m.map.dispose();
      m.map = surfaceTexture(w, len / w.rep, H / w.rep);
      m.roughness = w.rough;
      m.emissiveMap = w.emissive ? m.map : null;
      m.emissive = new THREE.Color(w.emissive ? '#ffffff' : '#000000');
      m.emissiveIntensity = w.emissive ? 0.7 : 0;
      m.needsUpdate = true;
    });
  }

  // --- Eşya yerleşimi ---------------------------------------------------------
  function wallIndexForRot(r) {
    const rr = ((r % 8) + 8) % 8;
    return rr === 0 ? 0 : rr === 2 ? 3 : rr === 4 ? 2 : 1;
  }
  function snapToWall(data) {
    const dists = [data.z + D / 2, W / 2 - data.x, D / 2 - data.z, data.x + W / 2];
    let wi = 0;
    dists.forEach((d, i) => { if (d < dists[wi]) wi = i; });
    const m = 0.9;
    if (wi === 0) { data.z = -D / 2 + 0.005; data.r = 0; data.x = clamp(data.x, -W / 2 + m, W / 2 - m); }
    if (wi === 2) { data.z = D / 2 - 0.005; data.r = 4; data.x = clamp(data.x, -W / 2 + m, W / 2 - m); }
    if (wi === 3) { data.x = -W / 2 + 0.005; data.r = 2; data.z = clamp(data.z, -D / 2 + m, D / 2 - m); }
    if (wi === 1) { data.x = W / 2 - 0.005; data.r = 6; data.z = clamp(data.z, -D / 2 + m, D / 2 - m); }
  }
  function normalizePlacement(data) {
    const def = CATALOG_MAP[data.k];
    data.x = snap(data.x);
    data.z = snap(data.z);
    if (def?.wall) snapToWall(data);
    else {
      data.x = clamp(data.x, -W / 2 + 0.2, W / 2 - 0.2);
      data.z = clamp(data.z, -D / 2 + 0.2, D / 2 - 0.2);
    }
  }
  function applyTransform(entry) {
    const { obj, data } = entry;
    obj.position.set(data.x, 0, data.z);
    obj.rotation.y = (data.r || 0) * (Math.PI / 4);
    obj.updateMatrixWorld(true);
  }
  function buildEntry(data) {
    const obj = buildItem(data.k, { ti: data.c || 0, live: true, wallMat: dividerMat, H });
    if (!obj) return null;
    obj.traverse((o) => { o.userData.itemId = data.i; });
    obj.userData.itemId = data.i;
    scene.add(obj);
    const entry = { obj, data: { ...data }, sig: `${data.k}|${data.c || 0}` };
    applyTransform(entry);
    const ctl = obj.userData.ctl;
    if (ctl?.setOn && typeof data.o === 'boolean') ctl.setOn(data.o);
    return entry;
  }
  function removeEntry(id) {
    const e = objs.get(id);
    if (!e) return;
    scene.remove(e.obj);
    disposeObject(e.obj);
    objs.delete(id);
  }
  function syncFromDesign() {
    const seen = new Set();
    design.items.forEach((d) => {
      seen.add(d.i);
      const e = objs.get(d.i);
      const sig = `${d.k}|${d.c || 0}`;
      if (e && e.sig === sig) {
        e.data = { ...d };
        applyTransform(e);
        const ctl = e.obj.userData.ctl;
        if (ctl?.setOn && typeof d.o === 'boolean' && ctl.on !== d.o) ctl.setOn(d.o);
      } else {
        if (e) removeEntry(d.i);
        const ne = buildEntry(d);
        if (ne) objs.set(d.i, ne);
      }
    });
    [...objs.keys()].forEach((id) => { if (!seen.has(id)) removeEntry(id); });
    if (selectedId && !objs.has(selectedId)) select(null);
    updateSelectionVisual();
  }
  function emitDesign() {
    design = { ...design, items: [...objs.values()].map((e) => ({ ...e.data })) };
    onDesignChange?.(design);
  }
  function pushUndo() {
    undoStack.push(JSON.stringify(design));
    if (undoStack.length > 40) undoStack.shift();
  }

  function select(id) {
    selectedId = id;
    updateSelectionVisual();
    const e = id ? objs.get(id) : null;
    onSelectionChange?.(e ? { ...e.data, def: CATALOG_MAP[e.data.k] } : null);
  }
  const tmpBox = new THREE.Box3();
  const tmpV = new THREE.Vector3();
  function updateSelectionVisual() {
    const e = selectedId ? objs.get(selectedId) : null;
    if (!e || mode !== 'build') {
      selBox.visible = false;
      selRing.visible = false;
      return;
    }
    tmpBox.setFromObject(e.obj);
    tmpBox.getSize(tmpV);
    selBox.scale.set(tmpV.x + 0.06, tmpV.y + 0.06, tmpV.z + 0.06);
    tmpBox.getCenter(selBox.position);
    selBox.visible = true;
    const rad = Math.max(tmpV.x, tmpV.z) * 0.62 + 0.15;
    selRing.scale.setScalar(rad);
    selRing.position.set(selBox.position.x, 0.02, selBox.position.z);
    selRing.visible = true;
  }

  // --- Duvar gizleme (tasarım modunda kameraya bakan duvarlar alçalır) -------
  function updateWalls() {
    const p = camera.position;
    walls.forEach((w) => {
      let hide = false;
      if (mode === 'build') {
        if (w.i === 0) hide = p.z < -D / 2 + 0.5;
        if (w.i === 2) hide = p.z > D / 2 - 0.5;
        if (w.i === 3) hide = p.x < -W / 2 + 0.5;
        if (w.i === 1) hide = p.x > W / 2 - 0.5;
      }
      if (hide !== w.hidden) {
        w.hidden = hide;
        w.full.visible = !hide;
        w.stub.visible = hide;
      }
    });
    objs.forEach((e) => {
      const def = CATALOG_MAP[e.data.k];
      if (!def?.wall) return;
      e.obj.visible = !walls[wallIndexForRot(e.data.r)].hidden;
    });
    ceiling.visible = mode === 'walk';
    ceilLights.forEach((o) => { if (o.isMesh) o.visible = mode === 'walk'; });
  }

  // --- Işık havuzu ---------------------------------------------------------------
  let lightTimer = 0;
  const lp = new THREE.Vector3();
  function updateLightPool(focus) {
    const list = [];
    objs.forEach((e) => {
      const ctl = e.obj.userData.ctl;
      if (!ctl?.light || !ctl.on || !e.obj.visible) return;
      lp.set(ctl.light.x, ctl.light.y, ctl.light.z);
      e.obj.localToWorld(lp);
      list.push({ p: lp.clone(), l: ctl.light, d: lp.distanceToSquared(focus) });
    });
    list.sort((a, b) => a.d - b.d);
    pool.forEach((l, i) => {
      const it = list[i];
      if (!it) {
        l.intensity = 0;
        return;
      }
      l.position.copy(it.p);
      l.color.set(it.l.color);
      l.intensity = it.l.intensity * 2.2;
      l.distance = it.l.distance;
    });
  }

  // --- Çarpışma (yürüme) ------------------------------------------------------
  function collide(p) {
    p.x = clamp(p.x, -W / 2 + PLAYER_R, W / 2 - PLAYER_R);
    p.z = clamp(p.z, -D / 2 + PLAYER_R, D / 2 - PLAYER_R);
    objs.forEach((e) => {
      const def = CATALOG_MAP[e.data.k];
      if (!def) return;
      const boxes = itemBoxes(def);
      if (!boxes.length) return;
      const ry = e.obj.rotation.y;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      boxes.forEach(([bx, bz, hx, hz]) => {
        const dx = p.x - e.data.x;
        const dz = p.z - e.data.z;
        // dünya → yerel (R_y(-ry))
        let lx = dx * c - dz * s - bx;
        let lz = dx * s + dz * c - bz;
        const px = hx + PLAYER_R - Math.abs(lx);
        const pz = hz + PLAYER_R - Math.abs(lz);
        if (px > 0 && pz > 0) {
          if (px < pz) lx = Math.sign(lx || 1) * (hx + PLAYER_R);
          else lz = Math.sign(lz || 1) * (hz + PLAYER_R);
          const ux = lx + bx;
          const uz = lz + bz;
          p.x = e.data.x + ux * c + uz * s;
          p.z = e.data.z - ux * s + uz * c;
        }
      });
    });
  }

  function seatWorld(seat, out = new THREE.Vector3()) {
    if (!seat) return null;
    const e = objs.get(seat.id);
    const def = e && CATALOG_MAP[e.data.k];
    const sp = def?.seats?.[seat.idx];
    if (!sp) return null;
    out.set(sp[0], sp[1], sp[2] + 0.06);
    e.obj.localToWorld(out);
    return out;
  }

  // --- Etkileşim bulma ------------------------------------------------------------
  let currentInteract = null;
  function findInteract() {
    if (mode !== 'walk') return null;
    if (self.seat) {
      const e = objs.get(self.seat.id);
      const ctl = e?.obj.userData.ctl;
      return { id: self.seat.id, sit: 'Kalk', toggle: ctl?.act && !ctl.noToggle ? ctl.act : null };
    }
    let best = null;
    let bd = 1.4;
    const v = new THREE.Vector3();
    objs.forEach((e) => {
      const def = CATALOG_MAP[e.data.k];
      const ctl = e.obj.userData.ctl;
      const canToggle = ctl?.act && !ctl.noToggle;
      const hasSeat = def?.seats?.length;
      if (!canToggle && !hasSeat) return;
      // en yakın kutu kenarı / oturma noktası
      let d = Infinity;
      if (hasSeat) {
        def.seats.forEach((s) => {
          v.set(s[0], 0, s[2]);
          e.obj.localToWorld(v);
          d = Math.min(d, Math.hypot(v.x - self.x, v.z - self.z) - 0.35);
        });
      }
      const boxes = itemBoxes(def);
      const ry = e.obj.rotation.y;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const dx = self.x - e.data.x;
      const dz = self.z - e.data.z;
      boxes.forEach(([bx, bz, hx, hz]) => {
        const lx = dx * c - dz * s - bx;
        const lz = dx * s + dz * c - bz;
        d = Math.min(d, Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0)));
      });
      if (!boxes.length && def.wall) {
        v.set(0, 0, 0.3);
        e.obj.localToWorld(v);
        d = Math.min(d, Math.hypot(v.x - self.x, v.z - self.z) - 0.2);
      }
      if (d < bd) {
        bd = d;
        best = { id: e.data.i, sit: hasSeat ? (def.cat === 'araba' ? 'Arabaya bin' : def.cat === 'motor' ? 'Motora bin' : 'Otur') : null, toggle: canToggle ? ctl.act : null };
      }
    });
    return best;
  }

  // --- Girdi -----------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointers = new Map();
  let drag = null; // { type:'orbit'|'item'|'pan'|'look', ... }
  let pinch = null;

  function setNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function floorPoint(e, out = new THREE.Vector3()) {
    setNdc(e);
    return ray.ray.intersectPlane(floorPlane, out);
  }
  function pickItem(e) {
    setNdc(e);
    const list = [];
    objs.forEach((en) => { if (en.obj.visible) list.push(en.obj); });
    const hits = ray.intersectObjects(list, true);
    // halı/sahne gibi düz eşyalar en son tercih edilir
    let flatHit = null;
    for (const h of hits) {
      const id = h.object.userData.itemId;
      if (!id) continue;
      const def = CATALOG_MAP[objs.get(id)?.data.k];
      if (def?.flat) {
        flatHit = flatHit || id;
        continue;
      }
      return id;
    }
    return flatHit;
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (drag?.type === 'item') finishItemDrag();
      drag = null;
      return;
    }
    if (mode === 'build') {
      const id = pickItem(e);
      if (id && canEdit) {
        drag = { type: 'itemCandidate', id, moved: 0, button: e.button };
      } else {
        drag = { type: e.button === 2 ? 'pan' : 'orbit', moved: 0, tapEmpty: true };
      }
    } else {
      drag = { type: 'look', moved: 0 };
    }
  }
  function finishItemDrag() {
    if (drag?.type === 'item') emitDesign();
  }
  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (mode === 'build') {
        orbit.dist = clamp(orbit.dist * (pinch.d / Math.max(d, 1)), 5, 38);
        panBy(mx - pinch.mx, my - pinch.my);
      } else {
        self.camDist = clamp(self.camDist * (pinch.d / Math.max(d, 1)), 1.8, 7);
      }
      pinch = { d, mx, my };
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.type === 'itemCandidate' && drag.moved > 6) {
      const e0 = objs.get(drag.id);
      if (!e0) {
        drag = null;
        return;
      }
      pushUndo();
      if (selectedId !== drag.id) select(drag.id);
      const fp = floorPoint(e);
      drag = { type: 'item', id: drag.id, off: fp ? { x: e0.data.x - fp.x, z: e0.data.z - fp.z } : { x: 0, z: 0 }, moved: drag.moved };
    }
    if (drag.type === 'item') {
      const en = objs.get(drag.id);
      const fp = floorPoint(e);
      if (en && fp) {
        en.data.x = fp.x + drag.off.x;
        en.data.z = fp.z + drag.off.z;
        normalizePlacement(en.data);
        applyTransform(en);
        updateSelectionVisual();
      }
    } else if (drag.type === 'orbit' && drag.moved > 4) {
      orbit.az -= dx * 0.006;
      orbit.el = clamp(orbit.el + dy * 0.005, 0.2, 1.45);
    } else if (drag.type === 'pan') {
      panBy(dx, dy);
    } else if (drag.type === 'look') {
      self.camYaw -= dx * 0.006;
      self.camPitch = clamp(self.camPitch + dy * 0.004, -0.25, 1.1);
    }
  }
  function panBy(dx, dy) {
    const s = orbit.dist * 0.0018;
    const c = Math.cos(orbit.az);
    const sn = Math.sin(orbit.az);
    orbit.tx = clamp(orbit.tx - (dx * c + dy * sn) * s, -W / 2, W / 2);
    orbit.tz = clamp(orbit.tz - (-dx * sn + dy * c) * s, -D / 2, D / 2);
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    if (drag.type === 'itemCandidate' && drag.moved <= 6) select(drag.id);
    else if (drag.type === 'item') finishItemDrag();
    else if (drag.tapEmpty && drag.moved <= 6 && mode === 'build') select(null);
    drag = null;
  }
  function onWheel(e) {
    e.preventDefault();
    if (mode === 'build') orbit.dist = clamp(orbit.dist + e.deltaY * 0.012, 5, 38);
    else self.camDist = clamp(self.camDist + e.deltaY * 0.004, 1.8, 7);
  }
  const onKeyDown = (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys[e.code] = true;
    if (mode === 'walk' && e.code === 'KeyE') api.interact('sit');
    if (mode === 'walk' && e.code === 'KeyF') api.interact('toggle');
    if (mode === 'build' && canEdit) {
      if (e.code === 'KeyR') api.rotateSelected(1);
      if (e.code === 'Delete' || e.code === 'Backspace') api.deleteSelected();
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) api.undo();
    }
  };
  const onKeyUp = (e) => { keys[e.code] = false; };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // --- Boyut --------------------------------------------------------------------
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    // dar (telefon) ekranda oda sığsın diye kamera biraz geri çekilir
    if (!resize.done && w > 50 && h > 50) {
      resize.done = true;
      if (w / h < 0.8) {
        // dikey telefon: odanın uzun kenarı ekranın dikeyine gelsin
        Object.assign(orbit, { az: Math.PI / 2 + 0.3, el: 1.05, dist: 27 });
      } else {
        Object.assign(orbit, { az: 0.35, el: 0.95, dist: 20 });
      }
      Object.assign(orbitCur, orbit);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // --- Ana döngü ----------------------------------------------------------------
  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 12, 18);
  const head = new THREE.Vector3();
  const seatV = new THREE.Vector3();
  let raf = 0;
  let firstFrame = true;
  let lastInteractKey = '';

  function stepWalk(dt) {
    let f = -joy.y;
    let s = joy.x;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
    const mag = Math.hypot(f, s);
    if (mag > 1) {
      f /= mag;
      s /= mag;
    }
    const fig = self.fig;
    if (self.seat) {
      if (mag > 0.4) {
        standUp();
      } else {
        if (fig) fig.moving = false;
        return;
      }
    }
    const moving = mag > 0.08;
    if (moving) {
      const yaw = self.camYaw;
      const vx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * WALK_SPEED * dt;
      const vz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * WALK_SPEED * dt;
      self.x += vx;
      self.z += vz;
      collide(self);
      if (fig) {
        // ekran-uzayında sola gidiyorsa aynala
        const sx = vx * Math.cos(yaw) - vz * Math.sin(yaw);
        if (Math.abs(sx) > 0.001) fig.facingLeft = sx < 0;
      }
    }
    if (fig) {
      fig.x = self.x;
      fig.z = self.z;
      fig.moving = moving;
    }
  }
  function standUp() {
    const seat = self.seat;
    self.seat = null;
    const e = seat && objs.get(seat.id);
    const def = e && CATALOG_MAP[e.data.k];
    const sp = def?.seats?.[seat.idx];
    if (e && sp) {
      const v = new THREE.Vector3(sp[0], 0, (def.box?.[1] ?? 0.5) + 0.55);
      if (def.cat === 'araba' || def.cat === 'motor') v.set((def.box?.[0] ?? 0.5) + 0.6, 0, sp[2]);
      e.obj.localToWorld(v);
      self.x = v.x;
      self.z = v.z;
      collide(self);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    const now = performance.now();
    objs.forEach((e) => e.obj.userData.ctl?.tick?.(t, dt));

    if (mode === 'build') {
      const k = 1 - Math.exp(-dt * 9);
      Object.keys(orbit).forEach((key) => { orbitCur[key] += (orbit[key] - orbitCur[key]) * k; });
      camTarget.set(orbitCur.tx, 0.4, orbitCur.tz);
      camPos.set(
        camTarget.x + Math.sin(orbitCur.az) * Math.cos(orbitCur.el) * orbitCur.dist,
        camTarget.y + Math.sin(orbitCur.el) * orbitCur.dist,
        camTarget.z + Math.cos(orbitCur.az) * Math.cos(orbitCur.el) * orbitCur.dist
      );
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      focus.copy(camTarget);
    } else {
      stepWalk(dt);
      const sw = self.seat ? seatWorld(self.seat, seatV) : null;
      const px = sw ? sw.x : self.x;
      const pz = sw ? sw.z : self.z;
      const eyeY = sw ? sw.y + 1.0 : 1.55;
      const yaw = self.camYaw;
      const pitch = self.camPitch;
      const dist = self.camDist;
      const want = new THREE.Vector3(
        px + Math.sin(yaw) * Math.cos(pitch) * dist,
        eyeY + Math.sin(pitch) * dist,
        pz + Math.cos(yaw) * Math.cos(pitch) * dist
      );
      want.x = clamp(want.x, -W / 2 + 0.15, W / 2 - 0.15);
      want.z = clamp(want.z, -D / 2 + 0.15, D / 2 - 0.15);
      want.y = clamp(want.y, 0.4, H - 0.15);
      const k = firstFrame ? 1 : 1 - Math.exp(-dt * 12);
      camPos.lerp(want, k);
      camera.position.copy(camPos);
      camera.lookAt(px, eyeY - 0.15, pz);
      focus.set(px, 1, pz);
    }
    firstFrame = false;
    updateWalls();

    // avatarlar
    if (self.fig) {
      const sw = self.seat ? seatWorld(self.seat, seatV) : null;
      self.fig.update(dt, camera, now, sw ? sw.clone() : null);
      self.fig.group.visible = mode === 'walk';
      self.fig.label.style.display = mode === 'walk' ? '' : 'none';
    }
    others.forEach((o) => {
      const sw = o.seat ? seatWorld(o.seat, new THREE.Vector3()) : null;
      o.fig.update(dt, camera, now, sw);
    });

    lightTimer -= dt;
    if (lightTimer <= 0) {
      lightTimer = 0.3;
      updateLightPool(focus);
    }

    // etkileşim ipucu
    const it = findInteract();
    const key = it ? `${it.id}|${it.sit}|${it.toggle}` : '';
    if (key !== lastInteractKey) {
      lastInteractKey = key;
      currentInteract = it;
      onInteractChange?.(it ? { sit: it.sit, toggle: it.toggle } : null);
    }

    renderer.render(scene, camera);

    // isim/balon etiketleri
    const rw = container.clientWidth;
    const rh = container.clientHeight;
    const place = (fig) => {
      if (!fig.group.visible) return;
      fig.headWorld(head);
      head.project(camera);
      const vis = head.z < 1 && Math.abs(head.x) < 1.2 && Math.abs(head.y) < 1.2;
      fig.label.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) fig.label.style.transform = `translate(${((head.x + 1) / 2) * rw}px, ${((1 - head.y) / 2) * rh}px) translate(-50%, -100%)`;
    };
    if (self.fig) place(self.fig);
    others.forEach((o) => {
      o.fig.label.style.display = '';
      place(o.fig);
    });
  }

  // --- API ---------------------------------------------------------------------
  const api = {
    get mode() { return mode; },
    setMode(m) {
      if (!canEdit && m === 'build') return;
      mode = m;
      grid.visible = m === 'build';
      if (m === 'walk') {
        select(null);
        firstFrame = true;
        camera.fov = 62;
      } else {
        camera.fov = 52;
      }
      camera.updateProjectionMatrix();
      updateSelectionVisual();
    },
    setDesign(next, { force = false } = {}) {
      if (!next) return;
      const wallChanged = next.wall !== design.wall || next.floor !== design.floor || force;
      design = {
        items: Array.isArray(next.items) ? next.items.filter((d) => CATALOG_MAP[d.k]) : [],
        wall: next.wall || WALLS[0].key,
        floor: next.floor || FLOORS[0].key,
      };
      if (wallChanged) setSurfaces();
      syncFromDesign();
    },
    getDesign() { return design; },
    addItem(k, ti = 0) {
      if (!canEdit || !CATALOG_MAP[k]) return;
      if (objs.size >= MAX_ITEMS) return 'limit';
      pushUndo();
      const data = { i: newItemId(), k, x: orbit.tx, z: orbit.tz, r: 0, c: ti || 0 };
      // görüş merkezine yakın, mümkünse boş bir nokta
      const def = CATALOG_MAP[k];
      if (!def.wall) {
        const cand = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, 1], [2, -1], [-2, -1]];
        for (const [a, b] of cand) {
          const x = orbit.tx + a * 1.5;
          const z = orbit.tz + b * 1.5;
          let free = true;
          objs.forEach((e) => { if (Math.hypot(e.data.x - x, e.data.z - z) < 1.2) free = false; });
          if (free) {
            data.x = x;
            data.z = z;
            break;
          }
        }
      } else {
        // kameranın baktığı en uzak duvar
        data.x = orbit.tx - Math.sin(orbit.az) * 20;
        data.z = orbit.tz - Math.cos(orbit.az) * 20;
      }
      normalizePlacement(data);
      const e = buildEntry(data);
      if (!e) return;
      e.obj.scale.setScalar(0.01);
      e.grow = true;
      objs.set(data.i, e);
      const grow = () => {
        if (disposed) return;
        const s = Math.min(1, e.obj.scale.x + 0.12);
        e.obj.scale.setScalar(s);
        if (s < 1) requestAnimationFrame(grow);
        else updateSelectionVisual();
      };
      requestAnimationFrame(grow);
      select(data.i);
      emitDesign();
      return data.i;
    },
    rotateSelected(dir = 1) {
      const e = selectedId && objs.get(selectedId);
      if (!e || !canEdit) return;
      if (CATALOG_MAP[e.data.k].wall) return;
      pushUndo();
      e.data.r = (((e.data.r || 0) + dir) % 8 + 8) % 8;
      applyTransform(e);
      updateSelectionVisual();
      emitDesign();
    },
    tintSelected(ti) {
      const e = selectedId && objs.get(selectedId);
      if (!e || !canEdit) return;
      pushUndo();
      const data = { ...e.data, c: ti };
      removeEntry(e.data.i);
      const ne = buildEntry(data);
      objs.set(data.i, ne);
      select(data.i);
      emitDesign();
    },
    duplicateSelected() {
      const e = selectedId && objs.get(selectedId);
      if (!e || !canEdit || objs.size >= MAX_ITEMS) return;
      pushUndo();
      const data = { ...e.data, i: newItemId(), x: e.data.x + 0.75, z: e.data.z + 0.75 };
      normalizePlacement(data);
      const ne = buildEntry(data);
      objs.set(data.i, ne);
      select(data.i);
      emitDesign();
    },
    deleteSelected() {
      if (!selectedId || !canEdit) return;
      pushUndo();
      removeEntry(selectedId);
      select(null);
      emitDesign();
    },
    undo() {
      const prev = undoStack.pop();
      if (!prev) return false;
      api.setDesign(JSON.parse(prev), { force: true });
      select(null);
      onDesignChange?.(design);
      return true;
    },
    canUndo() { return undoStack.length > 0; },
    clearAll() {
      if (!canEdit) return;
      pushUndo();
      [...objs.keys()].forEach(removeEntry);
      select(null);
      emitDesign();
    },
    setWall(key) {
      if (!canEdit) return;
      pushUndo();
      design = { ...design, wall: key };
      setSurfaces();
      onDesignChange?.(design);
    },
    setFloor(key) {
      if (!canEdit) return;
      pushUndo();
      design = { ...design, floor: key };
      setSurfaces();
      onDesignChange?.(design);
    },
    deselect() { select(null); },
    setView(v) { Object.assign(orbit, v); },
    setJoystick(x, y) {
      joy.x = x;
      joy.y = y;
    },
    interact(kind) {
      const it = currentInteract;
      if (!it) return;
      const e = objs.get(it.id);
      if (!e) return;
      if (kind === 'sit' && it.sit) {
        if (self.seat) {
          standUp();
          return;
        }
        const def = CATALOG_MAP[e.data.k];
        // en yakın boş koltuk
        let best = -1;
        let bd = Infinity;
        const v = new THREE.Vector3();
        def.seats.forEach((s, idx) => {
          const taken = [...others.values()].some((o) => o.seat?.id === it.id && o.seat?.idx === idx);
          if (taken) return;
          v.set(s[0], 0, s[2]);
          e.obj.localToWorld(v);
          const d = Math.hypot(v.x - self.x, v.z - self.z);
          if (d < bd) {
            bd = d;
            best = idx;
          }
        });
        if (best >= 0) self.seat = { id: it.id, idx: best };
      } else if (kind === 'toggle' && it.toggle) {
        const ctl = e.obj.userData.ctl;
        ctl.setOn(!ctl.on);
        lightTimer = 0;
        if (canEdit) {
          e.data.o = ctl.on;
          emitDesign();
        }
      }
    },
    // --- oyuncular
    setSelf({ uid, name, avatar }) {
      if (!self.fig) {
        self.fig = new AvatarFigure(scene, labelLayer, { uid, name, avatar, isSelf: true });
        self.fig.x = self.x;
        self.fig.z = self.z;
      } else self.fig.setIdentity(name, avatar);
    },
    getSelfState() {
      return {
        x: Math.round(self.x * 100) / 100,
        z: Math.round(self.z * 100) / 100,
        moving: !!self.fig?.moving,
        left: !!self.fig?.facingLeft,
        seat: self.seat ? `${self.seat.id}:${self.seat.idx}` : null,
      };
    },
    setOthers(list) {
      const seen = new Set();
      (list || []).forEach((p) => {
        if (!p?.uid || p.uid === selfUid) return;
        seen.add(p.uid);
        let o = others.get(p.uid);
        if (!o) {
          o = { fig: new AvatarFigure(scene, labelLayer, { uid: p.uid, name: p.displayName, avatar: p.avatar, isSelf: false }) };
          o.fig.x = o.fig.tx = Number(p.x) || 0;
          o.fig.z = o.fig.tz = Number(p.z) || 0;
          others.set(p.uid, o);
        }
        o.fig.setIdentity(p.displayName, p.avatar);
        o.fig.tx = Number(p.x) || 0;
        o.fig.tz = Number(p.z) || 0;
        o.fig.facingLeft = !!p.left;
        const [sid, sidx] = typeof p.seat === 'string' ? p.seat.split(':') : [];
        o.seat = sid ? { id: sid, idx: Number(sidx) || 0 } : null;
      });
      [...others.keys()].forEach((uid) => {
        if (!seen.has(uid)) {
          others.get(uid).fig.dispose(scene);
          others.delete(uid);
        }
      });
    },
    say(uid, text) {
      if (uid === selfUid) self.fig?.say(text);
      else others.get(uid)?.fig.say(text);
    },
    screenshot() {
      renderer.render(scene, camera);
      return canvas.toDataURL('image/jpeg', 0.85);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      [...objs.keys()].forEach(removeEntry);
      others.forEach((o) => o.fig.dispose(scene));
      self.fig?.dispose(scene);
      renderer.dispose();
      pmrem.dispose();
      canvas.remove();
      labelLayer.remove();
    },
  };

  setSurfaces();
  api.setMode(mode);
  loop();
  onReady?.();
  return api;
}

export { TINTS };
