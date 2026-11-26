// =============================================================================
// v212 — 3D avatar önizlemesi (avatar düzenleyici, kostüm sahnesi) ve 3D küçük resimler
// (kostüm kartları). Şehirdeki 3D avatarla aynı kod (components/City/avatar3d.js):
// avatarın önden / arkadan çizimi 3D gövdeye giydirilir, saç / şapka 3D modellenir.
//
//  • AvatarViewer: bir <canvas>'ta avatarı gösterir. Kendi kendine DÖNMEZ; oyuncu
//    parmağıyla / faresiyle yana sürükleyerek çevirir (dikey kaydırma sayfaya kalır).
//    Pozlar: idle (dur), walk (yerinde yürü), sit (tabureye otur), dans, selam.
//  • avatarThumb3D: tek bir gizli çizici ile avatarın 3D resmini çıkarır (data URL).
//    Sırayla, kare başına bir tane üretilir; aynı avatar tekrar istenirse önbellekten.
// =============================================================================
import * as THREE from 'three';
import { Avatar3D, makeAvatar3DLook, avatar3DPlain, avatar3DUsesPlain, avatar3DBackSrc, AVATAR_3D_HIP } from '../components/City/avatar3d.js';
import { buildFullAvatarSvgMarkup, buildFullAvatarBackSvgMarkup, buildAvatarBackLayerMarkup, DEFAULT_AVATAR } from './avatarShapes';

const SHADOW_RE = /<ellipse cx="160" cy="562"[^>]*\/>/;
const IS_MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');

// --- SVG → tuval (avatar3d.js sadece .image okur) ---------------------------------
function raster(svg, w, h) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      res({ image: c });
    };
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(SHADOW_RE, ''));
  });
}

// --- avatar → 3D görünüm (önbellekli) ---------------------------------------------
// v217: önbellekten düşen görünümün dokuları AÇIKÇA bırakılır. Eskiden "GC ile bırakılır"
// sanılıyordu ama WebGL dokuları çöp toplayıcıyla silinmez: kostüm kostüm gezdikçe ekran kartı
// belleği dolup telefonda WebView çöküyordu (oyundan atma). Bırakılan bir görünüm tekrar
// kullanılırsa three.js dokusunu yeniden yükler — sorun çıkmaz.
const LOOKS = new Map();
const LOOKS_MAX = IS_MOBILE ? 6 : 16;
const keyOf = (av, q) => q + JSON.stringify(av);
const dropLook = (p) => p?.then((l) => l?.dispose?.()).catch(() => {});
function buildLook3D(avatar, quality) {
  const full = { ...DEFAULT_AVATAR, ...(avatar || {}) };
  const plain = avatar3DUsesPlain(full);
  const src = plain ? avatar3DPlain(full) : full;
  const [w, h] = quality === 'hi' ? (IS_MOBILE ? [288, 522] : [384, 696]) : [208, 377];
  // v215: pelerin / kanat katmanı ayrıca (varsa) → 3D'de sırt kartı
  const bo = buildAvatarBackLayerMarkup(avatar3DBackSrc(full));
  return Promise.all([raster(buildFullAvatarSvgMarkup(src, { pose: 'idle' }), w, h), raster(buildFullAvatarBackSvgMarkup(src, { pose: 'idle' }), w, h), bo ? raster(bo, w, h) : null]).then(([f, b, k]) => makeAvatar3DLook(f, b, full, { plain, backOnly: k }));
}
export function getAvatarLook3D(avatar, quality = 'hi') {
  const full = { ...DEFAULT_AVATAR, ...(avatar || {}) };
  const k = keyOf(full, quality);
  let p = LOOKS.get(k);
  if (p) {
    LOOKS.delete(k); // en son kullanılan sona
    LOOKS.set(k, p);
    return p;
  }
  p = buildLook3D(full, quality);
  p.catch(() => LOOKS.delete(k));
  LOOKS.set(k, p);
  while (LOOKS.size > LOOKS_MAX) {
    const old = LOOKS.keys().next().value;
    dropLook(LOOKS.get(old));
    LOOKS.delete(old);
  }
  return p;
}

// --- ortak sahne parçaları -----------------------------------------------------------
let blobMat = null;
function shadowMesh() {
  if (!blobMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}
const STOOL_H = 0.45;

// --- etkileşimli önizleme ---------------------------------------------------------------
export class AvatarViewer {
  constructor(canvas, { yaw = -0.35, frame = 'full', drag = true } = {}) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    this.frame = frame;
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.holder.add(shadowMesh());
    this.stool = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, STOOL_H, 20), new THREE.MeshBasicMaterial({ color: '#2a2f45' }));
    this.stool.position.set(0, STOOL_H / 2, -0.06);
    this.stool.visible = false;
    this.holder.add(this.stool);
    this.yaw = yaw;
    this.pose = 'idle';
    this.m = null;
    this.tok = 0;
    this.t0 = performance.now();
    this.walkT = 0;
    this.visible = true;
    this.dead = false;
    if (drag) this._drag();
    this.io = new IntersectionObserver((es) => (this.visible = es.some((e) => e.isIntersecting)));
    this.io.observe(canvas);
    let last = performance.now();
    const loop = (now) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.visible || document.hidden) return;
      this._frame(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
  }
  // yana sürükle → çevir (dikey hareket sayfayı kaydırır)
  _drag() {
    const c = this.canvas;
    let id = null;
    let x0 = 0;
    let y0 = 0;
    let yaw0 = 0;
    let lock = null;
    c.style.touchAction = 'pan-y';
    c.style.cursor = 'grab';
    this._down = (e) => {
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      yaw0 = this.yaw;
      lock = null;
    };
    this._move = (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (lock == null && Math.abs(dx) + Math.abs(dy) > 6) {
        lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (lock === 'x') {
          try {
            c.setPointerCapture(id);
          } catch {
            /* yoksay */
          }
          c.style.cursor = 'grabbing';
        }
      }
      if (lock === 'x') this.yaw = yaw0 + dx * 0.012;
    };
    this._up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerdown', this._down);
    c.addEventListener('pointermove', this._move);
    c.addEventListener('pointerup', this._up);
    c.addEventListener('pointercancel', this._up);
  }
  async setAvatar(avatar) {
    const tok = ++this.tok;
    let look;
    try {
      look = await getAvatarLook3D(avatar, 'hi');
    } catch {
      return false;
    }
    if (tok !== this.tok || this.dead || !look) return false;
    if (this.m && this.m.setLook(look)) return true;
    if (this.m) this.m.dispose();
    this.m = new Avatar3D(look);
    this.holder.add(this.m.root);
    return true;
  }
  // v215: elin (tasma / eşya tutan) tuval üstündeki yeri, CSS pikseli
  handScreen() {
    const m = this.m;
    const c = this.canvas;
    if (!m || !c.clientWidth) return null;
    this.scene.updateMatrixWorld();
    const v = new THREE.Vector3();
    m.hand.getWorldPosition(v);
    v.project(this.cam);
    return { x: (v.x * 0.5 + 0.5) * c.clientWidth, y: (0.5 - v.y * 0.5) * c.clientHeight };
  }
  setPose(p) {
    this.pose = p || 'idle';
    this.t0 = performance.now();
    this.stool.visible = this.pose === 'sit';
  }
  _frame(dt, now) {
    const c = this.canvas;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    const pr = this.r.getPixelRatio();
    if (c.width !== Math.round(W * pr) || c.height !== Math.round(H * pr)) {
      this.r.setSize(W, H, false);
      this.cam.aspect = W / H;
      this.cam.updateProjectionMatrix();
    }
    // çerçeve: boy ~1.9 m sığsın (sitte biraz aşağı)
    const tall = this.frame === 'full' ? 2.15 : 1.25;
    const ty = this.frame === 'full' ? (this.pose === 'sit' ? 0.78 : 0.98) : 1.28;
    const fitH = tall / 2 / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const fitW = fitH / Math.min(1, this.cam.aspect / 0.62);
    const dist = Math.max(fitH, fitW);
    this.cam.position.set(0, ty + 0.12, dist);
    this.cam.lookAt(0, ty, 0);
    this.holder.rotation.y = this.yaw;
    const m = this.m;
    if (m) {
      const t = (now - this.t0) / 1000;
      const walk = this.pose === 'walk';
      if (walk) this.walkT += dt;
      const em = this.pose === 'dans' || this.pose === 'selam' ? { kind: this.pose, e: 0.3 + (t % 2.6) } : null;
      m.pose({ dt, t: now / 1000, walkT: this.walkT, walk, sit: this.pose === 'sit', emote: em });
      const sitY = STOOL_H - (m.hipH || AVATAR_3D_HIP) + 0.03;
      m.root.position.y = sitY * m.kSit + (em && em.kind === 'dans' ? Math.abs(Math.sin(t * 8)) * 0.03 : 0);
    }
    this.r.render(this.scene, this.cam);
  }
  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    const c = this.canvas;
    if (this._down) c.removeEventListener('pointerdown', this._down);
    c.removeEventListener('pointermove', this._move);
    c.removeEventListener('pointerup', this._up);
    c.removeEventListener('pointercancel', this._up);
    this.m?.dispose();
    this.stool.geometry.dispose();
    this.stool.material.dispose();
    this.r.dispose();
    this.r.forceContextLoss?.();
  }
}

// --- 3D küçük resim (kostüm kartları) ---------------------------------------------------
let TH = null;
function thumbRig() {
  if (TH) return TH;
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
  TH = { r, scene, cam };
  return TH;
}
const THUMBS = new Map();
const queue = [];
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      job.res(await drawThumb(job));
    } catch (e) {
      job.rej(e);
    }
    await new Promise((r) => requestAnimationFrame(() => r())); // kare başına bir resim: kaydırma takılmasın
  }
  pumping = false;
}
async function drawThumb({ avatar, w, h, yaw, frame }) {
  // v217: küçük resim görünümü önbelleğe girmez; resim çıkınca dokuları hemen bırakılır
  // (100 kostüm kartı = 100 doku takımı ekran kartında birikiyordu)
  const look = await buildLook3D(avatar, 'lo');
  if (!look) throw new Error('look');
  const { r, scene, cam } = thumbRig();
  const pr = Math.min(2, window.devicePixelRatio || 1);
  r.setPixelRatio(pr);
  r.setSize(w, h, false);
  cam.aspect = w / h;
  const m = new Avatar3D(look);
  m.pose({ dt: 0, t: 0, walkT: 0 });
  m.root.rotation.y = yaw;
  scene.add(m.root);
  // bust: kafadan bele; full: tüm boy
  const tall = frame === 'bust' ? 1.2 : 2.1;
  const ty = frame === 'bust' ? 1.3 : 0.97;
  cam.fov = 24;
  cam.updateProjectionMatrix();
  const dist = tall / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.min(1, cam.aspect / 0.8);
  cam.position.set(0, ty + 0.05, dist);
  cam.lookAt(0, ty, 0);
  r.render(scene, cam);
  let url;
  try {
    url = r.domElement.toDataURL('image/webp', 0.86);
    if (!url.startsWith('data:image/webp')) url = r.domElement.toDataURL('image/png');
  } finally {
    m.dispose();
    look.dispose?.();
  }
  return url;
}
// avatarın 3D resmi (data URL). frame: 'bust' (kafa–bel) | 'full'
export function avatarThumb3D(avatar, { w = 200, h = 230, yaw = 0.32, frame = 'bust' } = {}) {
  const k = `${w}x${h}|${yaw}|${frame}|${JSON.stringify(avatar)}`;
  let p = THUMBS.get(k);
  if (p) return p;
  p = new Promise((res, rej) => queue.push({ avatar, w, h, yaw, frame, res, rej }));
  p.catch(() => THUMBS.delete(k));
  THUMBS.set(k, p);
  if (THUMBS.size > (IS_MOBILE ? 140 : 260)) THUMBS.delete(THUMBS.keys().next().value);
  pump();
  return p;
}
// WebGL yoksa (çok eski cihaz) 2D'ye düşülür
let GL_OK = null;
export function webglOk() {
  if (GL_OK != null) return GL_OK;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    GL_OK = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    GL_OK = false;
  }
  return GL_OK;
}
