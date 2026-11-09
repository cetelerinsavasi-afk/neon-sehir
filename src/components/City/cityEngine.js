// =============================================================================
// SADECE ÖNİZLEME — Gezilebilir Neon Şehir motoru (three.js).
// Gezme mekaniği oyunun ev/mekân motoruyla (houseEngine) aynı: dokunduğun yere
// yürürsün (masaüstünde WASD), parmağı sürükleyince kamera döner, iki parmak /
// tekerlek yakınlaştırır; 3D (arkadan) ve 2D (kuş bakışı — harita gibi) görünüm.
// Avatarlar oyunun SVG avatarlarından üretilen "kağıt figür"lerdir.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { heldCanvas } from '../HouseScreen/heldArt';
import { PetFollower, FireAuraFx, EMOTES, getSharedRenderer } from '../HouseScreen/houseEngine';
import { PET_ART } from '../../lib/cosmeticsArt';
import { buildCity, BOUNDS, COAST_Z, cx, cz, BLOCK } from './cityPlan.js';
import { buildVehicle, VEHICLE_BY_ID } from './vehicles.js';
import { EngineSound } from './sound.js';

const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
const IS_MOBILE = IS_ANDROID || (typeof navigator !== 'undefined' && /iPhone|iPad|Mobile/i.test(navigator.userAgent || ''));
const WALK_SPEED = 3.0; // oyundaki ile aynı
const RUN_SPEED = 6.2;
const PLAYER_R = 0.32;
const RES = 0.5; // yürüme ızgarası (m)
const AV_UNIT = 1.75 / 507;
const AV_PLANE_H = 580 * AV_UNIT;
const AV_PLANE_W = 320 * AV_UNIT;
const AV_FEET = (580 - 562) * AV_UNIT;
const AV_WAIST_FROM_TOP = 380 * AV_UNIT;
const EMOTE_MS = 3200;
const EMOTE_EMOJI = Object.fromEntries(EMOTES.map((e) => [e.key, e.emoji]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// v147.1 — OTOMATİK GRAFİK AYARI (mekânlardaki gibi): kare süresi ölçülür, telefon
// zorlanırsa çözünürlük / gölge / ışık / görüş mesafesi kademeli düşer; rahatsa geri
// yükselir. Seçilen kademe cihazda hatırlanır. Uzaktaki şehir parçaları çizilmez.
const CITY_PERF_KEY = 'city-perf-tier-v1';
export const CITY_TIERS = [
  { name: 'yüksek', dpr: 1.75, shadows: true, shadowEvery: 1, pool: 10, view: 170, fps: 60 },
  { name: 'orta', dpr: 1.35, shadows: true, shadowEvery: 2, pool: 6, view: 125, fps: 60 },
  { name: 'düşük', dpr: 1.1, shadows: false, shadowEvery: 0, pool: 4, view: 100, fps: 60 },
  { name: 'en düşük', dpr: 0.9, shadows: false, shadowEvery: 0, pool: 2, view: 80, fps: 30 },
];
function readCityTier(def) {
  try {
    const v = Number(localStorage.getItem(CITY_PERF_KEY));
    if (localStorage.getItem(CITY_PERF_KEY) != null && Number.isInteger(v) && v >= 0 && v < CITY_TIERS.length) return v;
  } catch {
    /* yoksay */
  }
  return def;
}
function saveCityTier(v) {
  try {
    localStorage.setItem(CITY_PERF_KEY, String(v));
  } catch {
    /* yoksay */
  }
}
const V = THREE.Vector3;

// --- avatar dokuları (houseEngine ile aynı yöntem) ----------------------------
const avCache = new Map();
function avatarTextures(avatar) {
  const av = avatar || DEFAULT_AVATAR;
  const key = JSON.stringify(av);
  let e = avCache.get(key);
  if (e) return e;
  e = { ready: false, tex: {} };
  avCache.set(key, e);
  const poses = ['idle', 'walk1', 'walk2', 'sit', 'back'];
  let left = poses.length;
  const full = { ...DEFAULT_AVATAR, ...av };
  poses.forEach((pose) => {
    let markup = buildFullAvatarSvgMarkup(full, { pose: pose === 'back' ? 'sit' : pose, animFire: full?.acc?.aura === 'fire' }).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, '');
    // arkadan görünüş (arabada sürücü): yüzün üstü saç rengiyle kapanır, ense ve kulaklar görünür
    if (pose === 'back') markup = markup.replace('</svg>', backOfHead(full) + '</svg>');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 580;
      c.getContext('2d').drawImage(img, 0, 0, 320, 580);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      e.tex[pose] = t;
      left -= 1;
      if (left === 0) e.ready = true;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  });
  return e;
}
function backOfHead(s) {
  const bald = !s.hairStyle || s.hairStyle === 'kel';
  const hair = bald ? s.skin : s.hairColor;
  const shadeC = bald ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.28)';
  const hat = s.hat && s.hat !== 'none' ? `<path d="M96,150 Q98,92 160,88 Q222,92 224,150 Z" fill="${s.hatColor || '#111'}"/>` : '';
  return `<g>
    <rect x="138" y="214" width="44" height="60" rx="10" fill="${s.skin}"/>
    <ellipse cx="101" cy="178" rx="9" ry="14" fill="${s.skin}"/>
    <ellipse cx="219" cy="178" rx="9" ry="14" fill="${s.skin}"/>
    <ellipse cx="160" cy="170" rx="64" ry="72" fill="${hair}"/>
    <path d="M100,186 Q160,250 220,186 Q214,236 160,244 Q106,236 100,186 Z" fill="${shadeC}"/>
    ${bald ? '' : `<path d="M112,206 Q160,232 208,206" stroke="rgba(0,0,0,0.25)" stroke-width="5" fill="none"/>`}
    ${hat}
  </g>`;
}
let blobTex = null;
function blobShadow() {
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
const heldTex = new Map();
function heldTexture(p) {
  if (heldTex.has(p)) return heldTex.get(p);
  const t = new THREE.CanvasTexture(heldCanvas(p));
  t.colorSpace = THREE.SRGBColorSpace;
  heldTex.set(p, t);
  return t;
}

class Fig {
  constructor(scene, layer, { id, name, avatar, isSelf = false, npc = false }) {
    this.scene = scene;
    this.id = id;
    this.isSelf = isSelf;
    this.npc = npc;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, toneMapped: false, side: THREE.DoubleSide });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(AV_PLANE_W, AV_PLANE_H), this.mat);
    this.plane.position.y = AV_PLANE_H / 2 - AV_FEET;
    this.plane.visible = false;
    this.plane.userData.figId = id;
    this.pivot = new THREE.Group();
    this.pivot.add(this.plane);
    this.group.add(this.pivot);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    this.group.add(sh);
    this.held = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, toneMapped: false }));
    this.held.scale.set(0.34, 0.34, 1);
    this.held.visible = false;
    this.group.add(this.held);
    scene.add(this.group);
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.moving = false;
    this.walkT = 0;
    this.facingLeft = false;
    this.bubbles = [];
    this.emote = null;
    this.label = document.createElement('div');
    this.label.className = `hs-label${isSelf ? ' self' : ''}${npc ? ' cs-npc' : ''}`;
    this.bubbleBox = document.createElement('div');
    this.bubbleBox.className = 'hs-bubbles';
    this.emoteEl = document.createElement('div');
    this.emoteEl.className = 'hs-emote';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'hs-name';
    this.nameEl.textContent = name;
    this.label.append(this.bubbleBox, this.emoteEl, this.nameEl);
    layer.appendChild(this.label);
    this.tex = avatarTextures(avatar);
    this.avKey = JSON.stringify(avatar || null);
    this.setExtras(avatar);
  }
  setAvatar(av) {
    const k = JSON.stringify(av || null);
    if (k === this.avKey) return;
    this.avKey = k;
    this.tex = avatarTextures(av);
    this.setExtras(av);
  }
  setName(n) {
    if (n && this.nameEl.textContent !== n) this.nameEl.textContent = n;
  }
  // evcil hayvan + ateş aurası (oyundaki 3D mekânlarla aynı sınıflar)
  setExtras(avatar) {
    const fire = avatar?.acc?.aura === 'fire';
    if (fire && !this.fireFx) this.fireFx = new FireAuraFx(this.plane);
    else if (!fire && this.fireFx) {
      this.fireFx.dispose();
      this.fireFx = null;
    }
    const pet = avatar?.pet && PET_ART[avatar.pet.id] ? avatar.pet : null;
    if (!pet || this.pet?.id !== pet.id) {
      this.pet?.dispose();
      this.pet = pet ? new PetFollower(this.scene, pet) : null;
    } else this.pet.set(pet);
  }
  setHolding(p) {
    this.holding = p || null;
    if (p) {
      this.held.material.map = heldTexture(p);
      this.held.material.needsUpdate = true;
    }
    this.held.visible = Boolean(p);
  }
  say(text) {
    const el = document.createElement('div');
    el.className = 'hs-bubble';
    el.textContent = text;
    this.bubbleBox.appendChild(el);
    const b = { el, until: performance.now() + 7000 };
    this.bubbles.push(b);
    while (this.bubbles.length > 2) this.bubbles.shift().el.remove();
  }
  playEmote(kind) {
    if (!EMOTE_EMOJI[kind]) return;
    this.emote = { kind, t0: performance.now() };
    this.emoteEl.textContent = EMOTE_EMOJI[kind];
    this.emoteEl.classList.remove('on');
    void this.emoteEl.offsetWidth;
    this.emoteEl.classList.add('on');
  }
  update(dt, camera, now) {
    this.group.position.set(this.x, this.y, this.z);
    const bbYaw = camera.userData.billboardYaw;
    const ang = bbYaw != null ? bbYaw : Math.atan2(camera.position.x - this.x, camera.position.z - this.z);
    let tilt = 0;
    let lift = 0;
    let forceWalk = false;
    if (this.emote) {
      const e = (now - this.emote.t0) / 1000;
      if (e > EMOTE_MS / 1000) {
        this.emote = null;
        this.emoteEl.classList.remove('on');
      } else {
        const k = this.emote.kind;
        if (k === 'dans') {
          tilt = Math.sin(e * 11) * 0.16;
          lift = Math.abs(Math.sin(e * 11)) * 0.07;
          forceWalk = true;
        } else if (k === 'zipla') lift = Math.abs(Math.sin(e * 6)) * 0.4;
        else if (k === 'selam') tilt = Math.sin(e * 8) * 0.06;
        else if (k === 'alkis') lift = Math.abs(Math.sin(e * 14)) * 0.04;
        else if (k === 'kalp') lift = Math.sin(e * 3) * 0.03 + 0.03;
      }
    }
    const hd = Math.hypot(camera.position.x - this.x, camera.position.z - this.z);
    const el = bbYaw != null ? camera.userData.billboardEl : Math.atan2(camera.position.y - AV_PLANE_H / 2, hd);
    const back = el > 0.35 ? Math.min(el - 0.35, 1.05) : 0;
    this.pivot.rotation.order = 'YXZ';
    this.pivot.rotation.set(-back, ang, tilt);
    this.pivot.position.y = lift;
    let pose = 'idle';
    if (this.sitting) pose = 'sit';
    if (this.inCar) {
      // kamera arabanın arkasındaysa ense görünür (yüz yola bakıyor)
      const behind = (this.x - camera.position.x) * Math.sin(this.carYaw) + (this.z - camera.position.z) * Math.cos(this.carYaw) > 0;
      pose = behind ? 'back' : 'sit';
    }
    else if (this.moving || forceWalk) {
      this.walkT += dt * (forceWalk ? 0.7 : this.run ? 1.6 : 1);
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
    this.plane.scale.set(this.facingLeft ? -1 : 1, 1, 1);
    // v147.3: suya batma (kıyıdan içeri doğru derinleşir)
    const sinkT = this.sitting || this.inCar ? 0 : this.sink || 0;
    this.sinkCur = (this.sinkCur || 0) + (sinkT - (this.sinkCur || 0)) * Math.min(1, dt * 5 || 1);
    this.plane.position.y = this.sitting ? (this.seatY ?? 0.5) - this.y + 0.04 + AV_WAIST_FROM_TOP - AV_PLANE_H / 2 : AV_PLANE_H / 2 - AV_FEET - this.sinkCur;
    if (this.holding) {
      const side = this.facingLeft ? -1 : 1;
      const bob = Math.sin(now / 480) * 0.02;
      this.held.position.set(Math.cos(ang) * side * 0.3 + Math.sin(ang) * 0.12, AV_PLANE_H * 0.47 - AV_FEET + bob, -Math.sin(ang) * side * 0.3 + Math.cos(ang) * 0.12);
    }
    this.fireFx?.update(now, this.plane.visible && this.group.visible);
    if (this.pet) {
      const show = this.group.visible && !this.inCar;
      this.pet.sprite.visible = show;
      this.pet.leash.visible = show && this.pet.pet?.leash !== false;
      if (show) this.pet.update(Math.max(dt, 0.016), now, this, ang, this.sitting ? { x: this.x, y: this.seatY ?? 0.5, z: this.z } : null);
    }
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.el.remove();
        return false;
      }
      return true;
    });
  }
  dispose(scene) {
    scene.remove(this.group);
    this.label.remove();
    this.mat.dispose();
    this.pet?.dispose();
    this.fireFx?.dispose();
  }
}

// --- yaya isimleri / avatarları ------------------------------------------------
// =============================================================================
export function createCityEngine(container, { uid: myUid = 'me', avatar, name = 'Sen', spawn = 'ev', onInteract, onTick, onReady, onEvent, onPlayerTap, snapshot = false } = {}) {
  // snapshot: ekran dışı, döngüsüz motor — sadece paylaşılan şehir fotoğraflarını çizer (CityPhoto)
  // v147.1: telefonda logaritmik derinlik KAPALI (GPU'nun erken derinlik testini bozuyor → çok yavaş)
  // v147.1: mekânlarla AYNI ortak çizici (WebGL bağlamı) — şehir ↔ mekân geçişinde yeni bağlam
  // açılmaz (telefonda bellek taşması / "oyundan atma" buydu). Fotoğraf motoru 'snap' çizicisini kullanır.
  const shared = getSharedRenderer(snapshot ? 'snap' : 'main');
  const renderer = shared.renderer;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let tier = snapshot ? 0 : readCityTier(IS_ANDROID ? 2 : IS_MOBILE ? 1 : 0);
  renderer.setPixelRatio(snapshot ? 1 : Math.min(window.devicePixelRatio || 1, CITY_TIERS[tier].dpr));
  renderer.toneMappingExposure = 1.05;
  if (!snapshot) renderer.__onLost = () => onEvent?.({ type: 'contextLost' });
  const canvas = renderer.domElement;
  canvas.className = 'hs-gl';
  // v147.3: ortak çizici mekândan gelince tuvalin satır içi boyutu (px) mekânınkiydi → şehir
  // uzun/ince görünüyordu. Tuval her zaman kabın tamamını kaplar.
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);
  const layer = document.createElement('div');
  layer.className = 'hs-labels';
  container.appendChild(layer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1838');
  // v147.4: sis ufuk rengiyle aynı ve daha seyrek (eskiden karanlık, kasvetli)
  scene.fog = new THREE.Fog('#3a3560', 90, 320);
  const env = shared.env;
  scene.environment = env;
  scene.environmentIntensity = 0.22;

  // --- v147.4 GÖKYÜZÜ ---------------------------------------------------------------
  // Kubbe kameraya bağlı, her zaman çizim mesafesinin içinde (eskiden görüş mesafesi
  // kısalınca kubbe kesiliyor, gökyüzü tek renk kalıyordu). Gece mavisi tepe, şehir
  // ışığıyla aydınlanan ufuk, ince bulutlar, ay + hale, yıldızlar ve uzakta devam eden
  // şehir silueti (şehir ufka kadar sürüyor hissi; bina değil, tek doku).
  const skyG = new THREE.Group();
  skyG.renderOrder = -10;
  scene.add(skyG);
  // v147.4 — GÜNÜN SAATİNE GÖRE GÖKYÜZÜ (cihaz saati): 10–17 gündüz · 17–22 gün batımı ·
  // 22–05 gece · 05–10 gün doğumu. Işık, sis, güneş/ay, yıldızlar ve lambalar da değişir.
  const TOD = {
    day: { sky: [[0, '#1c58b0'], [0.28, '#2f77cf'], [0.42, '#559ae0'], [0.48, '#8dbdea'], [0.5, '#b5d3ee'], [0.53, '#9fb7cc'], [1, '#6d7a86']], cloud: [255, 255, 255], cloudA: 0.14, fog: '#93b4dc', bg: '#3f80d0', hemi: ['#d0e0ff', '#5e5246', 0.85], sun: ['#fff1d6', 1.7], lo: [-35, 80, 25], env: 0.5, fogK: 1.5, exp: 1.0, lamps: 0, stars: 0, disc: 'sun', discDir: [-0.35, 0.72, -0.6], band: 0.55 },
    sunset: { sky: [[0, '#1d2a5c'], [0.25, '#3b3f7e'], [0.4, '#8a5a8e'], [0.47, '#e0785e'], [0.5, '#ffb15a'], [0.53, '#a85c5e'], [1, '#3a2a3a']], cloud: [255, 150, 120], cloudA: 0.2, fog: '#9a6a78', bg: '#5a4a80', hemi: ['#ffc4a8', '#4a3430', 1.0], sun: ['#ffae72', 1.5], lo: [-80, 18, -40], env: 0.45, exp: 1.05, lamps: 0.75, stars: 0.15, disc: 'sun', discDir: [-0.7, 0.08, -0.7], band: 0.9 },
    night: { sky: [[0, '#050a1c'], [0.22, '#0b1838'], [0.38, '#1a2a5a'], [0.46, '#3d3f78'], [0.495, '#8a5a7e'], [0.5, '#b5737a'], [0.53, '#5b4a7c'], [1, '#1c1830']], cloud: [150, 140, 200], cloudA: 0.1, fog: '#3a3560', bg: '#0b1838', hemi: ['#a3b0ff', '#3a2e28', 0.85], sun: ['#b9c6ff', 0.85], lo: [30, 70, 18], env: 0.22, exp: 1.05, lamps: 1, stars: 1, disc: 'moon', discDir: [-0.42, 0.62, -0.66], band: 1 },
    sunrise: { sky: [[0, '#3a5ea8'], [0.3, '#6f8ccc'], [0.42, '#c7a6c8'], [0.48, '#ffc7a0'], [0.5, '#ffe0b0'], [0.53, '#b8a6b8'], [1, '#55506a']], cloud: [255, 200, 190], cloudA: 0.2, fog: '#c9b6c4', bg: '#8aa0d0', hemi: ['#ffe0d0', '#5a4a44', 1.05], sun: ['#ffd2a0', 1.7], lo: [80, 22, 30], env: 0.5, exp: 1.0, lamps: 0.35, stars: 0, disc: 'sun', discDir: [0.75, 0.12, 0.62], band: 0.75 },
  };
  const todOf = (d = new Date()) => {
    const h = d.getHours();
    if (h >= 10 && h < 17) return 'day';
    if (h >= 17 && h < 22) return 'sunset';
    if (h >= 22 || h < 5) return 'night';
    return 'sunrise';
  };
  const skyTexCache = new Map();
  function skyTex(key) {
    if (skyTexCache.has(key)) return skyTexCache.get(key);
    const P = TOD[key];
    const W = 1024;
    const H = 512;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    // uv.y: 0 = alt kutup, 0.5 = ufuk, 1 = tepe → tuvalde y=0 tepe, y=H/2 ufuk
    const gr = g.createLinearGradient(0, 0, 0, H);
    P.sky.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // bulutlar: yumuşak lekeler (gece altları şehir ışığıyla aydınlanır)
    let q = 97;
    const r = () => ((q = (q * 16807) % 2147483647) - 1) / 2147483646;
    const [cr, cg, cb] = P.cloud;
    for (let i = 0; i < 220; i++) {
      const y = H * (0.18 + r() * 0.3);
      const x = r() * W;
      const rw = 30 + r() * 110;
      const rh = rw * (0.18 + r() * 0.2);
      const low = (y - H * 0.18) / (H * 0.3);
      for (const dx of [0, -W, W]) {
        const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, rw);
        const a = (0.4 + r() * 0.6) * P.cloudA * (0.6 + low * 0.6);
        rg.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
        rg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        g.save();
        g.translate(x + dx, y);
        g.scale(1, rh / rw);
        g.translate(-(x + dx), -y);
        g.fillStyle = rg;
        g.fillRect(x + dx - rw, y - rw, rw * 2, rw * 2);
        g.restore();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    skyTexCache.set(key, t);
    return t;
  }
  let q0 = 41;
  const skyRnd = () => ((q0 = (q0 * 16807) % 2147483647) - 1) / 2147483646;
  let dome = null;
  let stars = null;
  let moonS = null;
  let band = null;
  const discTex = {};
  {
    const r = skyRnd;
    dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex('night'), side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false, toneMapped: false }));
    dome.renderOrder = -10;
    skyG.add(dome);
    // yıldızlar (sadece yukarıda, ufka yaklaştıkça sönük)
    const N = 1200;
    const sp = new Float32Array(N * 3);
    const sc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2;
      const e = 0.12 + Math.pow(r(), 0.7) * 1.45;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * 0.97;
      sp[i * 3 + 1] = Math.sin(e) * 0.97;
      sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 0.97;
      const k = Math.min(1, (e - 0.12) / 0.5) * (0.4 + r() * 0.6);
      sc[i * 3] = 0.8 * k + 0.2 * k * r();
      sc[i * 3 + 1] = 0.85 * k;
      sc[i * 3 + 2] = k;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, fog: false, vertexColors: true, transparent: true, depthWrite: false, depthTest: false }));
    stars.renderOrder = -9;
    skyG.add(stars);
    // ay + hale
    const halo = document.createElement('canvas');
    halo.width = halo.height = 128;
    const hg = halo.getContext('2d');
    const hr = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
    hr.addColorStop(0, 'rgba(255,246,225,1)');
    hr.addColorStop(0.16, 'rgba(255,240,210,1)');
    hr.addColorStop(0.2, 'rgba(210,215,255,0.35)');
    hr.addColorStop(0.5, 'rgba(150,160,230,0.1)');
    hr.addColorStop(1, 'rgba(120,130,220,0)');
    hg.fillStyle = hr;
    hg.fillRect(0, 0, 128, 128);
    const ht = new THREE.CanvasTexture(halo);
    ht.colorSpace = THREE.SRGBColorSpace;
    discTex.moon = ht;
    // güneş: sıcak, geniş hale
    const sunC = document.createElement('canvas');
    sunC.width = sunC.height = 128;
    const sg2 = sunC.getContext('2d');
    const sr = sg2.createRadialGradient(64, 64, 0, 64, 64, 64);
    sr.addColorStop(0, 'rgba(255,255,245,1)');
    sr.addColorStop(0.12, 'rgba(255,250,225,1)');
    sr.addColorStop(0.2, 'rgba(255,220,160,0.55)');
    sr.addColorStop(0.5, 'rgba(255,190,120,0.15)');
    sr.addColorStop(1, 'rgba(255,170,100,0)');
    sg2.fillStyle = sr;
    sg2.fillRect(0, 0, 128, 128);
    discTex.sun = new THREE.CanvasTexture(sunC);
    discTex.sun.colorSpace = THREE.SRGBColorSpace;
    moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: ht, fog: false, depthWrite: false, depthTest: false, transparent: true }));
    moonS.position.set(-0.42, 0.62, -0.66).normalize().multiplyScalar(0.95);
    moonS.scale.setScalar(0.22);
    moonS.renderOrder = -8;
    skyG.add(moonS);
    // uzak şehir silueti (ufkun hemen üstü; ışıklı pencereler)
    const SW = 2048;
    const SH = 128;
    const sc2 = document.createElement('canvas');
    sc2.width = SW;
    sc2.height = SH;
    const s2 = sc2.getContext('2d');
    let x = 0;
    while (x < SW) {
      const bw = 14 + r() * 46;
      const bh = 18 + r() * (r() < 0.15 ? 105 : 60);
      s2.fillStyle = `rgb(${18 + r() * 10},${16 + r() * 10},${34 + r() * 16})`;
      s2.fillRect(x, SH - bh, bw, bh);
      for (let wy = SH - bh + 4; wy < SH - 3; wy += 5) {
        for (let wx = x + 3; wx < x + bw - 3; wx += 4) {
          if (r() < 0.22) {
            s2.fillStyle = r() < 0.7 ? 'rgba(255,214,140,0.85)' : 'rgba(150,220,255,0.8)';
            s2.fillRect(wx, wy, 1.5, 2);
          }
        }
      }
      if (r() < 0.08) {
        s2.fillStyle = 'rgba(255,60,80,0.9)';
        s2.fillRect(x + bw / 2 - 1, SH - bh - 3, 2, 2);
      }
      x += bw + r() * 3;
    }
    const st = new THREE.CanvasTexture(sc2);
    st.colorSpace = THREE.SRGBColorSpace;
    st.wrapS = THREE.RepeatWrapping;
    st.repeat.set(2, 1);
    band = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.11, 64, 1, true), new THREE.MeshBasicMaterial({ map: st, side: THREE.BackSide, fog: false, transparent: true, depthWrite: false, depthTest: false }));
    band.position.y = 0.055 - 0.004;
    band.renderOrder = -7;
    skyG.add(band);
  }
  // kubbe her karede kameranın etrafında, çizim mesafesinin içinde
  function placeSky(cam = camera) {
    skyG.position.set(cam.position.x, 0, cam.position.z);
    skyG.scale.setScalar(Math.max(60, cam.far * 0.9));
    skyG.updateMatrixWorld(true);
  }

  const camera = new THREE.PerspectiveCamera(60, 1, IS_MOBILE ? 0.3 : 0.15, 900);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight('#a3b0ff', '#3a2e28', 0.85);
  scene.add(hemi);
  const moonL = new THREE.DirectionalLight('#b9c6ff', 0.85);
  moonL.castShadow = true;
  const smap = IS_MOBILE ? 1024 : 2048;
  moonL.shadow.mapSize.set(smap, smap);
  Object.assign(moonL.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
  moonL.shadow.bias = -0.0006;
  moonL.shadow.normalBias = 0.03;
  scene.add(moonL);
  scene.add(moonL.target);
  const POOL = IS_MOBILE ? 8 : 12;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight('#ffffff', 0, 10, 2);
    scene.add(l);
    pool.push(l);
  }
  // --- günün saati uygula ---------------------------------------------------------------
  let tod = null;
  let fogK = 1; // gündüz sis daha uzakta (berrak hava)
  let lightsReady = false; // ışık listesi şehir kurulunca hazır
  let lampMul = 1;
  let sunLo = TOD.night.lo;
  function applyTod(key) {
    if (!TOD[key] || key === tod) return;
    tod = key;
    const P = TOD[key];
    dome.material.map = skyTex(key);
    dome.material.needsUpdate = true;
    scene.background.set(P.bg);
    scene.fog.color.set(P.fog);
    hemi.color.set(P.hemi[0]);
    hemi.groundColor.set(P.hemi[1]);
    hemi.intensity = P.hemi[2];
    moonL.color.set(P.sun[0]);
    moonL.intensity = P.sun[1];
    sunLo = P.lo;
    scene.environmentIntensity = P.env;
    fogK = P.fogK || 1; // cull() 0,2 sn içinde sisi günceller
    renderer.toneMappingExposure = P.exp;
    lampMul = P.lamps;
    stars.visible = P.stars > 0;
    stars.material.opacity = P.stars;
    moonS.material.map = discTex[P.disc];
    moonS.material.needsUpdate = true;
    moonS.position.set(...P.discDir).normalize().multiplyScalar(0.95);
    moonS.scale.setScalar(P.disc === 'sun' ? 0.3 : 0.22);
    band.material.opacity = P.band;
    if (lightsReady) updateLights(true);
  }
  applyTod(todOf());

  // --- şehri kur ---------------------------------------------------------------
  const city = buildCity();
  city.kits.forEach((k) => {
    if (!k.group.parent) scene.add(k.group);
    k.dynamic.traverse((o) => (o.userData.dyn = true));
  });
  scene.updateMatrixWorld(true);
  const tv = new V();
  const yawOf = (m) => Math.atan2(m.elements[8], m.elements[10]);
  const solids = [];
  const lights = [];
  const zones = [];
  let waters = [];
  const labels = [];
  const blockers = [];
  const ticks = [];
  const npcDefs = [];
  const seats = [];
  city.kits.forEach((k) => {
    k.seats.forEach((st) => {
      const p = st.o.localToWorld(tv.set(st.x, st.y, st.z + 0.06));
      seats.push({ x: p.x, y: p.y, z: p.z, yaw: yawOf(st.o.matrixWorld), taken: false });
    });
    k.solids.forEach((s) => {
      const p = s.o.localToWorld(tv.set(s.x, 0, s.z));
      solids.push({ x: p.x, z: p.z, hw: s.hw, hd: s.hd, yaw: yawOf(s.o.matrixWorld), item: s.item || null, ell: Boolean(s.ell) });
    });
    k.lights.forEach((L) => {
      const p = L.o.localToWorld(tv.set(L.x, L.y, L.z));
      lights.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(L.color), intensity: L.intensity, distance: L.distance });
    });
    let doorZone = null;
    k.zones.forEach((z, i) => {
      const p = z.o.getWorldPosition(tv);
      const zz = { ...z, o: undefined, id: `${k.group.name}_${i}_${Math.round(p.x)}_${Math.round(p.z)}`, x: p.x, z: p.z, out: yawOf(k.group.matrixWorld) };
      zones.push(zz);
      if (z.kind === 'door') doorZone = zz;
    });
    k.labels.forEach((L) => {
      const p = L.o.getWorldPosition(new V());
      labels.push({ text: L.text, kind: L.kind, p });
    });
    (k.waters || []).forEach((wt) => {
      const p = wt.o.getWorldPosition(new V());
      const rot = Math.abs(Math.sin(yawOf(k.group.matrixWorld))) > 0.7;
      waters.push({ x: p.x, z: p.z, rx: rot ? wt.rz : wt.rx, rz: rot ? wt.rx : wt.rz });
    });
    k.blockers.forEach((b) => {
      b.userData.zone = doorZone;
      blockers.push(b);
    });
    k.ticks.forEach((t) => ticks.push(t));
    k.npcs.forEach((n) => {
      const p = k.group.localToWorld(new V(n.x, 0, n.z));
      npcDefs.push({ ...n, x: p.x, z: p.z });
    });
  });

  // statik geometriyi malzemeye + bölgeye göre birleştir (çizim çağrısı az olsun)
  mergeStatic(scene);
  // görüş mesafesi için parçalar: birleşik statik bloklar + mekân grupları (hareketli eşyalar)
  const cullItems = [];
  {
    const sph = new THREE.Sphere();
    scene.getObjectByName('merged')?.children.forEach((m) => {
      m.geometry.computeBoundingSphere();
      sph.copy(m.geometry.boundingSphere);
      if (sph.radius < 140) cullItems.push({ o: m, x: sph.center.x, z: sph.center.z, r: sph.radius });
    });
    city.kits.forEach((k) => {
      if (!k.group.parent || k.group.parent !== scene) return;
      const p = k.group.getWorldPosition(new V());
      if (Math.hypot(p.x, p.z) < 1 && (k.group.name === 'zemin' || k.group.name === 'deniz')) return;
      cullItems.push({ o: k.group, x: p.x, z: p.z, r: 45 });
    });
  }

  // --- yürüme ızgarası ------------------------------------------------------------
  const GX0 = BOUNDS.x0 - 2;
  const GZ0 = BOUNDS.z0 - 2;
  const GW = Math.ceil((BOUNDS.x1 - BOUNDS.x0 + 4) / RES);
  const GH = Math.ceil((BOUNDS.z1 - BOUNDS.z0 + 4) / RES);
  const grid = new Uint8Array(GW * GH);
  const limanLot = city.lots.find((l) => l.type === 'liman');
  const quay = { x0: limanLot.mx - limanLot.bw / 2, x1: limanLot.mx + limanLot.bw / 2, z0: COAST_Z, z1: COAST_Z + 17.7 };
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const x = GX0 + (i + 0.5) * RES;
      const z = GZ0 + (j + 0.5) * RES;
      let b = x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1;
      if (!b && z > COAST_Z + 2.9 && !(x > quay.x0 && x < quay.x1 && z < quay.z1)) b = true;
      grid[j * GW + i] = b ? 1 : 0;
    }
  }
  solids.forEach((s) => rasterRect(s));
  // ARABA ızgarası: sadece binalar, büyük yapılar, su ve sınırlar. Lamba, ağaç,
  // bank, çiçeklik, masa, satıcı arabası… araba için engel değil (sürüş kolay olsun)
  const carGrid = new Uint8Array(GW * GH);
  {
    const keep = grid.slice();
    grid.fill(0);
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const x = GX0 + (i + 0.5) * RES;
        const z = GZ0 + (j + 0.5) * RES;
        let b = x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1;
        if (!b && z > COAST_Z + 2.9 && !(x > quay.x0 && x < quay.x1 && z < quay.z1)) b = true;
        grid[j * GW + i] = b ? 1 : 0;
      }
    }
    // v147.3: arabalar sadece binalara / büyük yapılara çarpar — kaldırımdaki ağaç, lamba,
    // çit, bank, saksı vb. eşyalar araba için engel değil (kaldırıma çıkılabilir)
    solids.forEach((s) => {
      if (s.item && s.item !== 'araba' && Math.min(s.hw, s.hd) < 1.2) return;
      rasterRect(s);
    });
    waters.forEach((w) => rasterRect({ x: w.x, z: w.z, hw: w.rx + 0.4, hd: w.rz + 0.4, yaw: 0, ell: true }));
    carGrid.set(grid);
    grid.set(keep);
  }
  const carCell = (x, z) => {
    const i = Math.floor((x - GX0) / RES);
    const j = Math.floor((z - GZ0) / RES);
    if (i < 0 || j < 0 || i >= GW || j >= GH) return true;
    return carGrid[j * GW + i] === 1;
  };
  const carBlockedAt = (x, z, r) => carCell(x - r, z - r) || carCell(x + r, z - r) || carCell(x - r, z + r) || carCell(x + r, z + r) || carCell(x, z);
  function rasterRect({ x, z, hw, hd, yaw, ell }) {
    if (ell) {
      // elips (eksen hizalı; parsel 90° dönükse eksenler yer değiştirir): içindeki hücreler dolu
      if (Math.abs(Math.sin(yaw)) > 0.7) [hw, hd] = [hd, hw];
      const i0 = Math.max(0, Math.floor((x - hw - GX0) / RES));
      const i1 = Math.min(GW - 1, Math.floor((x + hw - GX0) / RES));
      const j0 = Math.max(0, Math.floor((z - hd - GZ0) / RES));
      const j1 = Math.min(GH - 1, Math.floor((z + hd - GZ0) / RES));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const px = (GX0 + (i + 0.5) * RES - x) / hw;
          const pz = (GZ0 + (j + 0.5) * RES - z) / hd;
          if (px * px + pz * pz <= 1) grid[j * GW + i] = 1;
        }
      }
      return;
    }
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const ex = Math.abs(c) * hw + Math.abs(sn) * hd;
    const ez = Math.abs(sn) * hw + Math.abs(c) * hd;
    const i0 = Math.max(0, Math.floor((x - ex - GX0) / RES));
    const i1 = Math.min(GW - 1, Math.floor((x + ex - GX0) / RES));
    const j0 = Math.max(0, Math.floor((z - ez - GZ0) / RES));
    const j1 = Math.min(GH - 1, Math.floor((z + ez - GZ0) / RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = GX0 + (i + 0.5) * RES - x;
        const pz = GZ0 + (j + 0.5) * RES - z;
        // dünya → kutu yereli (yaw ters)
        const lx = px * c - pz * sn;
        const lz = px * sn + pz * c;
        if (Math.abs(lx) <= hw + 0.05 && Math.abs(lz) <= hd + 0.05) grid[j * GW + i] = 1;
      }
    }
  }
  const cellBlocked = (x, z) => {
    const i = Math.floor((x - GX0) / RES);
    const j = Math.floor((z - GZ0) / RES);
    if (i < 0 || j < 0 || i >= GW || j >= GH) return true;
    return grid[j * GW + i] === 1;
  };
  const blockedAt = (x, z, r = PLAYER_R) => cellBlocked(x - r, z - r) || cellBlocked(x + r, z - r) || cellBlocked(x - r, z + r) || cellBlocked(x + r, z + r) || cellBlocked(x, z);
  function freeNear(x, z) {
    if (!blockedAt(x, z)) return { x, z };
    // v147.3: büyük binanın (stadyum vb.) ortasına bırakılsa da en yakın boş yeri bul
    for (let rr = 0.5; rr < 70; rr += rr < 14 ? 0.5 : 1) {
      const n = Math.max(16, Math.round(rr * 2));
      for (let a = 0; a < n; a++) {
        const px = x + Math.cos((a / n) * Math.PI * 2) * rr;
        const pz = z + Math.sin((a / n) * Math.PI * 2) * rr;
        if (!blockedAt(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }
  // A* (1 m kaba ızgara) + görüş hattıyla yumuşatma
  const CW = Math.floor(GW / 2);
  const CH = Math.floor(GH / 2);
  const coarse = new Uint8Array(CW * CH);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    const x = GX0 + (i + 0.5) * 1;
    const z = GZ0 + (j + 0.5) * 1;
    coarse[j * CW + i] = blockedAt(x, z, 0.35) ? 1 : 0;
  }
  function lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.25);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      // v147.5: yürüyüşle aynı yarıçap (+pay) — köşeden kesip takılmasın; park etmiş arabam da engel
      if (blockedAt(px, pz, PLAYER_R + 0.06) || hitsParked(px, pz)) return false;
    }
    return true;
  }
  function findPath(sx, sz, tx, tz) {
    if (lineFree(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
    const toC = (x, z) => [clamp(Math.floor(x - GX0), 0, CW - 1), clamp(Math.floor(z - GZ0), 0, CH - 1)];
    const [si, sj] = toC(sx, sz);
    const [ti, tj] = toC(tx, tz);
    // v147.5: park etmiş arabamı geçici olarak engel say (A* içinden geçip takılmasın)
    const tmp = [];
    if (myCar && !driving) {
      const rr = myCar.v.halfW + 0.28 + 0.4;
      carCircles(myCar.x, myCar.z, myCar.yaw).forEach(([px, pz]) => {
        for (let j = Math.floor(pz - rr - GZ0); j <= Math.floor(pz + rr - GZ0); j++) for (let i = Math.floor(px - rr - GX0); i <= Math.floor(px + rr - GX0); i++) {
          if (i < 0 || j < 0 || i >= CW || j >= CH) continue;
          const cx0 = GX0 + i + 0.5 - px;
          const cz0 = GZ0 + j + 0.5 - pz;
          const m = j * CW + i;
          if (cx0 * cx0 + cz0 * cz0 < rr * rr && !coarse[m]) {
            coarse[m] = 1;
            tmp.push(m);
          }
        }
      });
    }
    try {
      return astar(sx, sz, tx, tz, si, sj, ti, tj);
    } finally {
      for (const m of tmp) coarse[m] = 0;
    }
  }
  function astar(sx, sz, tx, tz, si, sj, ti, tj) {
    // hedef hücre kaba ızgarada doluysa en yakın boş hücreye yönel
    if (coarse[tj * CW + ti]) {
      let best = null;
      for (let rr = 1; rr <= 3 && !best; rr++) {
        for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
          const ni = ti + di;
          const nj = tj + dj;
          if (ni < 0 || nj < 0 || ni >= CW || nj >= CH || coarse[nj * CW + ni]) continue;
          const d = di * di + dj * dj;
          if (!best || d < best[2]) best = [ni, nj, d];
        }
      }
      if (!best) return null;
      [ti, tj] = best;
    }
    // başlangıç hücresi doluysa (duvarın dibi) komşu boş hücreden başla
    if (coarse[sj * CW + si]) {
      let best = null;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = si + di;
        const nj = sj + dj;
        if (ni < 0 || nj < 0 || ni >= CW || nj >= CH || coarse[nj * CW + ni]) continue;
        const cx0 = GX0 + ni + 0.5;
        const cz0 = GZ0 + nj + 0.5;
        const d = (cx0 - sx) ** 2 + (cz0 - sz) ** 2;
        if (!best || d < best[2]) best = [ni, nj, d];
      }
      if (best) [si, sj] = best;
    }
    const N = CW * CH;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (n, f) => {
      heap.push([f, n]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const h = (i, j) => {
      const dx = Math.abs(i - ti);
      const dz = Math.abs(j - tj);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    const s = sj * CW + si;
    const goal = tj * CW + ti;
    g[s] = 0;
    push(s, h(si, sj));
    let found = false;
    let iter = 0;
    while (heap.length && iter++ < 120000) {
      const [, n] = pop();
      if (closed[n]) continue;
      if (n === goal) {
        found = true;
        break;
      }
      closed[n] = 1;
      const i = n % CW;
      const j = (n / CW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= CW || nj >= CH) continue;
        const m = nj * CW + ni;
        if (coarse[m] || closed[m]) continue;
        if (di && dj && (coarse[j * CW + ni] || coarse[nj * CW + i])) continue;
        const ng = g[n] + (di && dj ? 1.414 : 1);
        if (ng < g[m]) {
          g[m] = ng;
          from[m] = n;
          push(m, ng + h(ni, nj));
        }
      }
    }
    if (!found) return null;
    const pts = [];
    for (let n = goal; n !== -1 && n !== s; n = from[n]) pts.push({ x: GX0 + (n % CW) + 0.5, z: GZ0 + ((n / CW) | 0) + 0.5 });
    pts.reverse();
    pts[pts.length - 1] = { x: tx, z: tz };
    // yumuşat
    const out = [];
    let ax = sx;
    let az = sz;
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) {
        if (lineFree(ax, az, pts[m].x, pts[m].z)) {
          far = m;
          break;
        }
      }
      out.push(pts[far]);
      ax = pts[far].x;
      az = pts[far].z;
      k = far + 1;
    }
    return out;
  }

  // zemin yüksekliği (kaldırım / rıhtım)
  const blockRects = city.lots.map((l) => ({ x0: l.mx - l.bw / 2, x1: l.mx + l.bw / 2, z0: l.mz - l.bd / 2, z1: l.mz + l.bd / 2 }));
  // v147.3 — su: kıyıdan içeri doğru batma (mekânlardaki havuzla aynı ölçüler)
  function sinkAt(x, z) {
    for (const w of waters) {
      const nx = (x - w.x) / w.rx;
      const nz = (z - w.z) / w.rz;
      const r = Math.hypot(nx, nz);
      if (r >= 1) continue;
      const dist = (1 - r) * Math.min(w.rx, w.rz);
      const t = clamp((dist - 0.3) / 3.3, 0, 1);
      return 0.55 + (1.2 - 0.55) * t;
    }
    return 0;
  }
  function groundY(x, z) {
    if (z > COAST_Z) return 0.13;
    for (const r of blockRects) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return 0.13;
    return 0;
  }

  // --- doğma noktası (harita bölgesi → kapı / satıcı / açık alan) ------------------
  const REGION_LOT = { camii: 'camii', karakol: 'karakol', banka: 'banka', spor_salonu: 'spor', belediye: 'belediye', silah_magazasi: 'silah', araba_galerisi: 'galeri', fabrika: 'fabrika', internet_kafe: 'netkafe', modifiye_garaji: 'modifiye', casino: 'casino', park: 'park', bar: 'bar', cafe: 'cafe', yaris_pisti: 'pist', stadyum: 'stadyum', ev: 'ev', liman_depo: 'liman' };
  function spawnPoint(key) {
    // v147.3: ana sayfada haritaya bırakılan nokta { x, z }
    if (key && typeof key === 'object' && key.region && (REGION_LOT[key.region] || zones.some((z) => z.kind === 'vendor' && z.vendor === key.region))) return spawnPoint(key.region);
    if (key && typeof key === 'object' && Number.isFinite(key.x) && Number.isFinite(key.z)) {
      return { x: clamp(key.x, BOUNDS.x0 + 2, BOUNDS.x1 - 2), z: clamp(key.z, BOUNDS.z0 + 2, Math.min(BOUNDS.z1 - 2, COAST_Z + 1)), yaw: Math.PI };
    }
    const vz = zones.find((z) => z.kind === 'vendor' && z.vendor === key);
    if (vz) return { x: vz.x + Math.sin(vz.out) * 2.2, z: vz.z + Math.cos(vz.out) * 2.2, yaw: vz.out };
    const lt = REGION_LOT[key] || key;
    // v147.3: özel doğma noktası (park: 4 banklı fıskiye meydanı) — yüz meydana dönük
    const sz = zones.find((z) => z.kind === 'spawn' && z.key === lt);
    if (sz) {
      const k = city.kits.find((q) => q.zones?.some((zz) => zz.kind === 'spawn' && zz.key === lt));
      const lp = k ? k.group.localToWorld(new V(sz.lx ?? 0, 0, sz.lz ?? 0)) : { x: sz.x, z: sz.z - 1 };
      return { x: sz.x, z: sz.z, yaw: Math.atan2(sz.x - lp.x, sz.z - lp.z) };
    }
    const dz = zones.find((z) => z.kind === 'door' && z.type === lt) || (lt === 'pist' ? zones.find((z) => z.kind === 'pist') : null);
    // v147.3: kapının önünde, yüz YOLA dönük (kamera arkada, binanın tarafında)
    // kapıdan biraz uzakta + kamera yukarıdan (kamera binaya çarpıp avatarın dibine girmesin)
    if (dz) return { x: dz.x + Math.sin(dz.out) * 3.4, z: dz.z + Math.cos(dz.out) * 3.4, yaw: dz.out + Math.PI, pitch: 0.62 };
    const l = city.lots.find((q) => q.type === lt) || city.lots.find((q) => q.type === 'ev');
    return { x: l.mx, z: l.mz + l.bd / 2 + 1.6, yaw: Math.PI };
  }
  // --- oyuncu --------------------------------------------------------------------
  const sp0 = spawnPoint(spawn);
  let sp0f = freeNear(sp0.x, sp0.z) || sp0;
  // v147.3: haritaya bırakılan nokta suya denk gelirse kıyıda doğ
  if (sinkAt(sp0f.x, sp0f.z) > 0) {
    for (let rr = 1; rr < 30; rr += 1) {
      let hit = null;
      for (let a = 0; a < 24 && !hit; a++) {
        const px = sp0f.x + Math.cos((a / 24) * Math.PI * 2) * rr;
        const pz = sp0f.z + Math.sin((a / 24) * Math.PI * 2) * rr;
        if (!sinkAt(px, pz) && !blockedAt(px, pz)) hit = { x: px, z: pz };
      }
      if (hit) {
        sp0f = hit;
        break;
      }
    }
  }
  const self = { x: sp0f.x, z: sp0f.z, camYaw: sp0.yaw, camPitch: sp0.pitch ?? 0.32, camDist: 6.2, target: null, path: null, run: false, ride: null };
  let lastEmote = { e: null, et: 0 };
  const me = new Fig(scene, layer, { id: 'self', name, avatar, isSelf: true });
  me.x = self.x;
  me.z = self.z;
  let view = '3d';
  const top = { az: Math.PI / 4, el: 0.98, dist: 46 };
  const topCur = { ...top };

  // hedef halkası
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32), new THREE.MeshBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // --- NPC'ler (satıcılar, büfeci, şüpheli adam) ----------------------------------
  const npcs = npcDefs.map((n) => {
    const f = new Fig(scene, layer, { id: n.id, name: n.name, avatar: n.av, npc: true });
    f.x = n.x;
    f.z = n.z;
    f.y = groundY(n.x, n.z);
    f.lines = n.lines || [];
    f.vendor = n.vendor;
    return f;
  });
  // fabrika dumanı
  const smokeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(200,200,215,0.55)');
    r.addColorStop(1, 'rgba(200,200,215,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const smoke = [];
  labels.filter((l) => l.kind === 'smoke').forEach((l) => {
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5 }));
      s.userData = { base: l.p.clone(), t: k / 10 };
      scene.add(s);
      smoke.push(s);
    }
  });


  // =============================================================================
  // DİĞER OYUNCULAR (çevrimiçi) — konum/araba verisi dışarıdan (cityNet) gelir.
  // Sadece en yakın MAX_VIS kişi çizilir; uzaktakiler gizli (telefon kasmasın).
  // =============================================================================
  const MAX_VIS = IS_MOBILE ? 16 : 24;
  const VIS_DIST = 85;
  const remotes = new Map(); // uid → { fig, st, lastEt, seen }
  const rcars = new Map(); // uid → { v, id, x, z, y, yaw, tx, tz, tyaw, spd, steer, name }
  function upsertPlayer(uid, st) {
    let r = remotes.get(uid);
    if (!r) {
      const fig = new Fig(scene, layer, { id: uid, name: st.n || 'Oyuncu', avatar: st.a || null });
      fig.x = st.x;
      fig.z = st.z;
      fig.y = groundY(st.x, st.z);
      fig.tx = st.x;
      fig.tz = st.z;
      fig.remote = true;
      r = { fig, st, lastEt: st.et || 0, uid, buf: [] };
      remotes.set(uid, r);
    }
    const f = r.fig;
    if (st.n) f.setName(st.n);
    if (st.a) f.setAvatar(st.a);
    // v147.1 — akıcı hareket: her konum sunucu zamanıyla (t) tampona girer; ekranda
    // ~0,4 sn geriden iki kayıt arasında ara değer çizilir (takılma/ışınlanma yok)
    const t = Number(st.t) || Date.now();
    const last = r.buf[r.buf.length - 1];
    if (!last || t > last.t) {
      if (last && Math.hypot(st.x - last.x, st.z - last.z) > 12) r.buf.length = 0; // ışınlandı
      r.buf.push({ t, x: st.x, z: st.z });
      if (r.buf.length > 8) r.buf.shift();
      const lat = Date.now() - t; // sadece YENİ kayıtta (eski kaydın yaşı gecikme değildir)
      if (lat > -2000 && lat < 10000) r.lat = r.lat == null ? lat : r.lat + (lat - r.lat) * (lat < r.lat ? 0.5 : 0.15);
    }
    if (!r.buf.length || r.buf.length === 1) {
      f.x = st.x;
      f.z = st.z;
    }
    f.tx = st.x;
    f.tz = st.z;
    if (st.et && st.et !== r.lastEt && st.e) {
      r.lastEt = st.et;
      f.playEmote(st.e);
    }
    if ((st.h || null) !== (f.holding || null)) f.setHolding(st.h || null);
    r.st = st;
  }
  function removePlayer(uid) {
    const r = remotes.get(uid);
    if (!r) return;
    r.fig.dispose(scene);
    remotes.delete(uid);
  }
  function upsertCar(uid, st) {
    let c = rcars.get(uid);
    if (!c || c.id !== st.v) {
      if (c) removeCar(uid);
      const v = buildVehicle(st.v);
      const head = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.5), headMat('#ffe9b8', 0.45));
      head.rotation.x = -Math.PI / 2;
      head.position.set(0, 0.04, v.len / 2 + 3.9);
      v.root.add(head);
      scene.add(v.root);
      c = { v, id: st.v, x: st.x, z: st.z, y: groundY(st.x, st.z), yaw: st.y, tx: st.x, tz: st.z, tyaw: st.y, spd: 0, steer: 0, t: 0, yr: 0, ex: 0, ez: 0, eyaw: 0 };
      rcars.set(uid, c);
    }
    const t = Number(st.t) || Date.now();
    if (c.t && t <= c.t) return; // eski / aynı kayıt
    // v147.1 — TAHMİN: son kayıttan (konum + hız + dönüş hızı) arabanın ŞU AN nerede
    // olduğu hesaplanır; ekrandaki araba kayıt beklemeden akar, yeni kayıt gelince
    // aradaki küçük fark yumuşakça kapatılır → yanındaki oyuncu gecikme görmez.
    if (c.t) {
      let dy = st.y - c.tyaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const dts = (t - c.t) / 1000;
      const yr = dts > 0.05 && dts < 1.5 ? clamp(dy / dts, -3, 3) : 0;
      c.yr = c.yr * 0.4 + yr * 0.6;
    }
    const before = predictCar(c);
    c.tx = st.x;
    c.tz = st.z;
    c.tyaw = st.y;
    c.t = t;
    c.spd = st.s || 0;
    c.steer = st.st || 0;
    if (!st.d || Math.abs(c.spd) < 0.05) c.yr = 0;
    c.name = st.n || c.name;
    const after = predictCar(c);
    // ekrandaki konum = tahmin + sönümlenen hata
    c.ex = before.x + c.ex - after.x;
    c.ez = before.z + c.ez - after.z;
    let ey = before.yaw + c.eyaw - after.yaw;
    while (ey > Math.PI) ey -= Math.PI * 2;
    while (ey < -Math.PI) ey += Math.PI * 2;
    c.eyaw = ey;
    if (Math.hypot(c.ex, c.ez) > 20) {
      c.ex = 0;
      c.ez = 0;
      c.eyaw = 0;
    }
  }
  function predictCar(c) {
    if (!c.t) return { x: c.tx, z: c.tz, yaw: c.tyaw };
    const age = clamp((Date.now() - c.t) / 1000, 0, 0.8);
    const s = c.spd || 0;
    if (Math.abs(s) < 0.05) return { x: c.tx, z: c.tz, yaw: c.tyaw };
    const yaw = c.tyaw + c.yr * age;
    const mid = c.tyaw + c.yr * age * 0.5;
    return { x: c.tx + Math.sin(mid) * s * age, z: c.tz + Math.cos(mid) * s * age, yaw };
  }
  function removeCar(uid) {
    const c = rcars.get(uid);
    if (!c) return;
    scene.remove(c.v.root);
    c.v.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material?.userData?.shared !== true && !Array.isArray(o.material)) o.material.dispose?.();
      }
    });
    rcars.delete(uid);
  }
  // arabanın k. koltuğunun dünya konumu
  const seatV = new V();
  function seatWorld(carObj, k) {
    const sp = carObj.v.seatPts[Math.min(k, carObj.v.seatPts.length - 1)];
    carObj.v.root.updateMatrixWorld(true);
    return carObj.v.body.localToWorld(seatV.set(sp[0], sp[1], sp[2]));
  }
  // tampondan verilen (sunucu) zamandaki konum + hız
  function sampleAt(r, T) {
    const b = r.buf;
    if (!b.length) return { x: r.fig.tx, z: r.fig.tz, v: 0 };
    if (T <= b[0].t) return { x: b[0].x, z: b[0].z, v: 0 };
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1];
      const c = b[i];
      if (T >= a.t && T <= c.t) {
        const span = Math.max(1, c.t - a.t);
        const k = (T - a.t) / span;
        const v = Math.hypot(c.x - a.x, c.z - a.z) / (span / 1000);
        // uzun boşluk (duruş + nabız) yürüme sayılmasın
        return { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, v: span > 1500 ? 0 : v };
      }
    }
    const L = b[b.length - 1];
    const P = b[b.length - 2];
    // son kayıttan sonrası: yürüyorsa kısa süre aynı hızla devam (en fazla 0,35 sn)
    if (P && r.st?.m === 1 && L.t - P.t < 1200) {
      const ex = Math.min(0.35, (T - L.t) / 1000);
      const s = (L.t - P.t) / 1000 || 1;
      return { x: L.x + ((L.x - P.x) / s) * ex, z: L.z + ((L.z - P.z) / s) * ex, v: Math.hypot(L.x - P.x, L.z - P.z) / s };
    }
    return { x: L.x, z: L.z, v: 0 };
  }
  function updateRemotes(dt, now) {
    // görünürlük: en yakın MAX_VIS kişi
    const list = [];
    remotes.forEach((r) => {
      const d = Math.hypot(r.fig.tx - self.x, r.fig.tz - self.z);
      r.d = d;
      list.push(r);
    });
    list.sort((a, b) => a.d - b.d);
    list.forEach((r, i) => {
      const f = r.fig;
      const st = r.st;
      const vis = i < MAX_VIS && r.d < VIS_DIST;
      f.inCar = false;
      f.sitting = false;
      let show = vis;
      // araçta (sürücü ya da yolcu): koltuğa otur, kapalı arabada görünmez
      const carOwner = st.p === 'd' ? r.uid : st.p === 'r' ? st.ro : null;
      const carObj = carOwner ? (carOwner === myUid ? (myCar ? { v: myCar.v, yaw: myCar.yaw } : null) : rcars.get(carOwner)) : null;
      if (carObj) {
        const k = st.p === 'd' ? 0 : st.rk || 1;
        const p = seatWorld(carObj, k);
        f.x = p.x;
        f.z = p.z;
        f.y = carObj.v.root.position.y;
        f.seatY = p.y;
        f.sitting = true;
        f.inCar = true;
        f.carYaw = carObj.yaw;
        f.moving = false;
        show = vis && carObj.v.open;
      } else {
        const p = sampleAt(r, Date.now() - clamp((r.lat || 120) + 380, 380, 1100));
        const dx = p.x - f.x;
        const dz = p.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d > 6) {
          f.x = p.x;
          f.z = p.z;
        } else {
          // küçük düzeltmeler yumuşak (ağ titremesi görünmesin)
          const k = 1 - Math.exp(-dt * 18);
          f.x += dx * k;
          f.z += dz * k;
        }
        f.moving = p.v > 0.35 || (st.m === 1 && p.v > 0.05);
        f.run = st.r === 1;
        f.facingLeft = st.l === 1;
        f.y += (groundY(f.x, f.z) - f.y) * Math.min(1, dt * 10);
        if (st.p === 's') {
          f.sitting = true;
          f.seatY = st.sy ?? 0.5;
          f.moving = false;
        }
      }
      f.group.visible = show;
      if (show) {
        f.sink = waters.length ? sinkAt(f.x, f.z) : 0;
        f.update(dt, camera, now);
      }
      else if (f.pet) {
        f.pet.sprite.visible = false;
        f.pet.leash.visible = false;
      }
    });
  }
  function updateRemoteCars(dt) {
    rcars.forEach((c) => {
      const decay = Math.exp(-dt * 6);
      c.ex *= decay;
      c.ez *= decay;
      c.eyaw *= decay;
      const p = predictCar(c);
      c.x = p.x + c.ex;
      c.z = p.z + c.ez;
      c.yaw = p.yaw + c.eyaw;
      c.y += (groundY(c.x, c.z) - c.y) * Math.min(1, dt * 10);
      const far = Math.hypot(c.x - self.x, c.z - self.z) > VIS_DIST + 20;
      c.v.root.visible = !far;
      if (far) return;
      c.v.root.position.set(c.x, c.y, c.z);
      c.v.root.rotation.y = c.yaw;
      c.v.wheels.forEach((w) => {
        w.spin.rotation.z -= (c.spd * dt) / w.r;
        if (w.front) w.pivot.rotation.y = c.steer;
      });
    });
  }
  // yolcu olarak başka birinin arabasında
  function rideCar() {
    if (!self.ride) return null;
    return rcars.get(self.ride.owner) || null;
  }
  let rideLostT = 0;
  function stepRide(dt) {
    const c = rideCar();
    if (!c) {
      rideLostT += dt;
      if (rideLostT > 4) {
        rideEnd();
        onEvent?.({ type: 'rideLost' });
      }
      return;
    }
    rideLostT = 0;
    const p = seatWorld(c, self.ride.k);
    self.x = c.x;
    self.z = c.z;
    me.x = p.x;
    me.z = p.z;
    me.y = c.y;
    me.seatY = p.y;
    me.sitting = true;
    me.inCar = true;
    me.carYaw = c.yaw;
    me.moving = false;
    me.group.visible = c.v.open;
  }
  function rideStart(owner, k) {
    if (driving) return false;
    if (self.seat) standUp();
    self.ride = { owner, k };
    self.target = null;
    self.path = null;
    ring.visible = false;
    rideLostT = 0;
    driveCamOff = 0;
    zoneKey = '__ride__';
    return true;
  }
  function rideEnd() {
    const c = rideCar();
    self.ride = null;
    me.inCar = false;
    me.sitting = false;
    me.group.visible = true;
    if (c) {
      const lx = Math.cos(c.yaw);
      const lz = -Math.sin(c.yaw);
      for (const sgn of [1, -1]) {
        const px = c.x + lx * sgn * 1.9;
        const pz = c.z + lz * sgn * 1.9;
        if (!blockedAt(px, pz)) {
          self.x = px;
          self.z = pz;
          break;
        }
      }
    }
    const f = freeNear(self.x, self.z);
    if (f) {
      self.x = f.x;
      self.z = f.z;
    }
    first = true;
    zoneKey = '__rideend__';
  }

  // =============================================================================
  // KENDİ ARABAN — çağır, bin, sür
  // =============================================================================
  let myCar = null; // { v, id, x, z, y, yaw, vx, vz, steer, roll, pitch, lastVF, spawnT }
  let driving = false;
  const driveIn = { thr: 0, steer: 0, hand: false };
  let camShake = 0;
  let driveCamOff = 0;
  let driveCamIdle = 9;
  let driveFov = 60;
  let driveStat = { kmh: 0, gear: 'N', ratio: 0 };
  const sound = new EngineSound();
  const headSpot = new THREE.SpotLight('#fff1d0', 0, 36, 0.52, 0.55, 1.2);
  scene.add(headSpot);
  scene.add(headSpot.target);
  // fren izleri (halka tampon)
  const SKID_N = 700;
  const skidMat = new THREE.MeshBasicMaterial({ color: '#050505', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  const skidGeo = new THREE.PlaneGeometry(0.24, 0.42);
  skidGeo.rotateX(-Math.PI / 2);
  const skids = new THREE.InstancedMesh(skidGeo, skidMat, SKID_N);
  skids.count = 0;
  skids.frustumCulled = false;
  scene.add(skids);
  let skidI = 0;
  const skidM = new THREE.Matrix4();
  const skidQ = new THREE.Quaternion();
  const skidS = new V(1, 1, 1);
  const skidP = new V();
  function addSkid(x, y, z, yaw) {
    skidQ.setFromAxisAngle(new V(0, 1, 0), yaw);
    skidP.set(x, y + 0.02, z);
    skidM.compose(skidP, skidQ, skidS);
    skids.setMatrixAt(skidI, skidM);
    skidI = (skidI + 1) % SKID_N;
    skids.count = Math.min(SKID_N, skids.count + 1);
    skids.instanceMatrix.needsUpdate = true;
  }
  // lastik dumanı
  const puffs = [];
  for (let i = 0; i < 28; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: '#d9dbe4' }));
    sp.visible = false;
    scene.add(sp);
    puffs.push({ sp, t: 1 });
  }
  let puffI = 0;
  function puff(x, y, z) {
    const p = puffs[puffI++ % puffs.length];
    p.t = 0;
    p.sp.position.set(x, y + 0.3, z);
    p.sp.visible = true;
  }
  // çağırma efekti (halka)
  const callRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 40), new THREE.MeshBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
  callRing.rotation.x = -Math.PI / 2;
  scene.add(callRing);
  let callRingT = 9;

  const carCircles = (x, z, yaw, c = myCar) => {
    const k = c.v.len / 2 - c.v.halfW * 0.9;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    return [[x + fx * k, z + fz * k], [x, z], [x - fx * k, z - fz * k]];
  };
  function carFree(x, z, yaw) {
    const r = myCar.v.halfW * 0.82;
    for (const [px, pz] of carCircles(x, z, yaw)) if (carBlockedAt(px, pz, r)) return 'wall';
    return null;
  }
  // sıkıştıysa en yakın boş yere çıkar (asla takılı kalmasın)
  function unstick(c) {
    if (!carFree(c.x, c.z, c.yaw)) return false;
    for (let rr = 0.4; rr <= 6; rr += 0.4) {
      for (let a = 0; a < 16; a++) {
        const px = c.x + Math.cos((a / 16) * Math.PI * 2) * rr;
        const pz = c.z + Math.sin((a / 16) * Math.PI * 2) * rr;
        if (!carFree(px, pz, c.yaw)) {
          c.x = px;
          c.z = pz;
          return true;
        }
      }
    }
    return false;
  }
  // park halindeki arabaya yürüyerek girilmesin
  function hitsParked(x, z) {
    if (!myCar || driving) return false;
    const r = myCar.v.halfW + 0.28;
    return carCircles(myCar.x, myCar.z, myCar.yaw).some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < r * r);
  }
  // en yakın şerit noktası (sağdan gidiş yönüyle)
  function laneSpot(x, z) {
    const cands = [];
    city.roadsX.forEach((zr) => {
      cands.push({ x, z: zr + 2.1, yaw: Math.PI / 2 }, { x, z: zr - 2.1, yaw: -Math.PI / 2 });
    });
    city.roadsZ.forEach((xr) => {
      cands.push({ x: xr - 2.1, z, yaw: 0 }, { x: xr + 2.1, z, yaw: Math.PI });
    });
    cands.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const c of cands.slice(0, 6)) {
      for (const off of [0, 4, -4, 8, -8, 12, -12, 16, -16]) {
        const along = c.yaw === 0 || c.yaw === Math.PI ? [0, off] : [off, 0];
        const px = c.x + along[0];
        const pz = c.z + along[1];
        if (city.covered(px, pz) || pz > COAST_Z - 2) continue;
        const ok = carCircles(px, pz, c.yaw, { v: myCar.v }).every(([qx, qz]) => !blockedAt(qx, qz, 1.0)) && !carCircles(px, pz, c.yaw, { v: myCar.v }).some(([qx, qz]) => (qx - self.x) ** 2 + (qz - self.z) ** 2 < (myCar.v.halfW + 1.1) ** 2);
        if (ok) return { x: px, z: pz, yaw: c.yaw };
      }
    }
    return null;
  }
  function callCar(id) {
    if (driving || self.ride) return { ok: false, reason: 'Önce arabadan in' };
    if (!VEHICLE_BY_ID[id]) return { ok: false, reason: 'Araba bulunamadı' };
    const v = buildVehicle(id);
    const old = myCar;
    myCar = { v };
    const spot = laneSpot(self.x, self.z);
    if (!spot) {
      myCar = old;
      return { ok: false, reason: 'Yakında boş şerit yok' };
    }
    if (old) {
      scene.remove(old.v.root);
      old.v.root.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    // ön farların yere düşen ışığı
    const head = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.5), headMat('#ffe9b8', 0.5));
    head.rotation.x = -Math.PI / 2;
    head.position.set(0, 0.04, v.len / 2 + 3.9);
    v.root.add(head);
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), headMat('#ff2a3a', 0.5));
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, 0.04, -v.len / 2 - 0.6);
    v.root.add(tail);
    myCar = { v, id, x: spot.x, z: spot.z, y: 0, yaw: spot.yaw, vx: 0, vz: 0, steer: 0, roll: 0, pitch: 0, lastVF: 0, spawnT: 0, skidD: 0 };
    scene.add(v.root);
    v.root.position.set(spot.x, 0, spot.z);
    v.root.rotation.y = spot.yaw;
    v.root.scale.setScalar(0.01);
    callRing.position.set(spot.x, 0.06, spot.z);
    callRingT = 0;
    // araba oyuncunun üstüne geldiyse oyuncuyu kenara al (içine sıkışmasın)
    if (hitsParked(self.x, self.z)) {
      const fx = Math.sin(spot.yaw);
      const fz = Math.cos(spot.yaw);
      for (let d = v.halfW + 1.1; d < 6; d += 0.5) {
        for (const [ax, az] of [[fz, -fx], [-fz, fx]]) {
          const px = spot.x + ax * d;
          const pz = spot.z + az * d;
          if (!blockedAt(px, pz) && !hitsParked(px, pz)) {
            self.x = px;
            self.z = pz;
            me.x = px;
            me.z = pz;
            d = 99;
            break;
          }
        }
      }
    }
    self.target = null;
    self.path = null;
    return { ok: true, name: v.def.name, x: spot.x, z: spot.z };
  }
  function enterCar() {
    if (!myCar || driving) return;
    driving = true;
    self.target = null;
    self.path = null;
    self.seat = null;
    ring.visible = false;
    me.sitting = myCar.v.open;
    driveCamOff = 0;
    driveCamIdle = 9;
    sound.start();
    sound.idle(true);
    zoneKey = '__drive__';
  }
  function exitCar() {
    if (!driving) return;
    const c = myCar;
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    // sürücü kapısı (sol), olmazsa sağ, arka
    const lx = fz;
    const lz = -fx;
    const tries = [[lx, lz, 1.9], [-lx, -lz, 1.9], [-fx, -fz, c.v.len / 2 + 1], [fx, fz, c.v.len / 2 + 1]];
    driving = false;
    let placed = false;
    for (const [dx, dz, d] of tries) {
      const px = c.x + dx * d;
      const pz = c.z + dz * d;
      if (!blockedAt(px, pz) && !hitsParked(px, pz)) {
        self.x = px;
        self.z = pz;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const f = freeNear(c.x + lx * 2.5, c.z + lz * 2.5);
      if (f) {
        self.x = f.x;
        self.z = f.z;
      }
    }
    c.vx = 0;
    c.vz = 0;
    me.sitting = false;
    me.inCar = false;
    me.group.visible = true;
    sound.idle(false);
    self.camYaw = c.yaw + Math.PI * 0.85;
    first = true;
    zoneKey = '__exit__';
  }

  function stepDrive(dt) {
    const c = myCar;
    const P = c.v.def.phys;
    let thr = driveIn.thr;
    let st = driveIn.steer;
    let hand = driveIn.hand;
    if (keys.KeyW || keys.ArrowUp) thr = 1;
    if (keys.KeyS || keys.ArrowDown) thr = -1;
    if (keys.KeyA || keys.ArrowLeft) st = -1;
    if (keys.KeyD || keys.ArrowRight) st = 1;
    if (keys.Space) hand = true;
    // 1) direksiyon (hızlandıkça daha az döner)
    let fx = Math.sin(c.yaw);
    let fz = Math.cos(c.yaw);
    const vF0 = c.vx * fx + c.vz * fz;
    c.steer += (-st - c.steer) * Math.min(1, dt * (st ? 3.6 : 6));
    const delta = (c.steer * P.steer) / (1 + Math.abs(vF0) * 0.045);
    let yawRate = (vF0 * Math.tan(delta)) / c.v.wb;
    if (hand && Math.abs(vF0) > 3) yawRate *= 1.45;
    c.yaw += yawRate * dt;
    // 2) hız yeni yöne göre ileri / yan bileşen
    fx = Math.sin(c.yaw);
    fz = Math.cos(c.yaw);
    const sx = fz;
    const sz = -fx;
    let vF = c.vx * fx + c.vz * fz;
    let vL = c.vx * sx + c.vz * sz;
    let acc = 0;
    let braking = false;
    if (thr > 0) {
      if (vF < -0.4) {
        acc = 18;
        braking = true;
      } else acc = P.acc * thr * Math.max(0, 1 - Math.pow(Math.max(0, vF) / P.vmax, 1.7));
    } else if (thr < 0) {
      if (vF > 0.4) {
        acc = -20;
        braking = true;
      } else acc = vF > -P.vmax * 0.28 ? -P.acc * 0.55 : 0;
    }
    acc -= vF * 0.06;
    if (!thr) acc -= Math.sign(vF) * 2.4;
    if (hand) {
      acc -= Math.sign(vF) * 7;
      braking = true;
    }
    const before = vF;
    vF += acc * dt;
    if (!thr && Math.sign(vF) !== Math.sign(before)) vF = 0;
    const grip = hand ? 1.4 : Math.max(3.2, P.grip - Math.abs(vF) * 0.09);
    vL *= Math.exp(-grip * dt);
    c.vx = fx * vF + sx * vL;
    c.vz = fz * vF + sz * vL;
    // 3) hareket + çarpışma (sadece binalar) — duvar boyunca kayar, takılmaz
    const oldYaw = c.yaw - yawRate * dt;
    const nx = c.x + c.vx * dt;
    const nz = c.z + c.vz * dt;
    const spd = Math.hypot(c.vx, c.vz);
    let hit = null;
    if (!carFree(nx, nz, c.yaw)) {
      c.x = nx;
      c.z = nz;
    } else {
      hit = 'wall';
      if (!carFree(nx, c.z, c.yaw)) {
        c.x = nx;
        c.vz = 0;
        c.vx *= 0.92;
      } else if (!carFree(c.x, nz, c.yaw)) {
        c.z = nz;
        c.vx = 0;
        c.vz *= 0.92;
      } else if (!carFree(nx, nz, oldYaw)) {
        c.yaw = oldYaw;
        c.x = nx;
        c.z = nz;
      } else {
        if (carFree(c.x, c.z, c.yaw)) c.yaw = oldYaw;
        c.vx *= -0.2;
        c.vz *= -0.2;
      }
    }
    unstick(c);
    if (hit && spd > 5) {
      camShake = Math.min(0.45, spd * 0.03);
      sound.thump(spd);
      onEvent?.({ type: 'crash', what: hit, speed: spd });
    }
    // 4) görsel: gövde yatışı, tekerlekler, stoplar
    const longA = (vF - c.lastVF) / Math.max(dt, 1e-3);
    c.lastVF = vF;
    c.pitch += (clamp(-longA * 0.006, -0.05, 0.05) - c.pitch) * Math.min(1, dt * 6);
    c.roll += (clamp(vF * yawRate * 0.007, -0.075, 0.075) - c.roll) * Math.min(1, dt * 6);
    const slip = Math.abs(vL);
    const skidding = slip > 2.2 || (hand && Math.abs(vF) > 5) || (braking && Math.abs(vF) > 10);
    updateCarVisual(c, dt, vF, delta, braking || (thr < 0 && vF > 0), skidding);
    driveStat = { kmh: Math.round(Math.abs(vF) * 3.6), gear: vF < -0.3 ? 'R' : Math.abs(vF) < 0.3 && !thr ? 'N' : String(1 + Math.min(4, Math.floor((Math.abs(vF) / P.vmax) * 5))), ratio: Math.abs(vF) / P.vmax, name: c.v.def.name };
    sound.update(Math.min(1, Math.abs(vF) / P.vmax), thr, skidding ? Math.min(1, slip / 6 + 0.3) : 0);
    // oyuncu arabayla taşınır (etiket, bölge, mini harita için)
    self.x = c.x;
    self.z = c.z;
  }
  const wpos = new V();
  function updateCarVisual(c, dt, vF, delta, braking, skidding) {
    const v = c.v;
    c.y += (groundY(c.x, c.z) - c.y) * Math.min(1, dt * 10);
    v.root.position.set(c.x, c.y, c.z);
    v.root.rotation.y = c.yaw;
    v.tilt.rotation.set(c.pitch, 0, c.roll);
    v.wheels.forEach((w) => {
      w.spin.rotation.z -= (vF * dt) / w.r;
      if (w.front) w.pivot.rotation.y = delta;
    });
    v.tlMat.emissiveIntensity = braking ? 5 : 1.4;
    if (skidding) {
      v.root.updateMatrixWorld(true);
      c.skidD += Math.abs(vF) * dt;
      if (c.skidD > 0.3) {
        c.skidD = 0;
        v.wheels.forEach((w) => {
          if (w.front) return;
          w.pivot.getWorldPosition(wpos);
          addSkid(wpos.x, c.y, wpos.z, c.yaw);
          if (Math.random() < 0.6) puff(wpos.x, c.y, wpos.z);
        });
      }
    }
  }

  // harita etiketleri (haritadaki siyah kutulu yazılar)
  const mapLabels = labels.filter((l) => l.kind === 'map' || l.kind === 'vendor').map((l) => {
    const el = document.createElement('div');
    el.className = `cs-maplabel ${l.kind}`;
    el.textContent = l.text;
    layer.appendChild(el);
    return { ...l, el };
  });

  // --- giriş ----------------------------------------------------------------------
  const keys = {};
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function walkTo(x, z) {
    const f = freeNear(x, z);
    if (!f) return false;
    const p = findPath(self.x, self.z, f.x, f.z);
    if (!p || !p.length) return false;
    self.path = p;
    self.target = p.shift();
    self.repath = 0;
    self.stuckT = 0;
    ring.position.set(f.x, groundY(f.x, f.z) + 0.03, f.z);
    ring.visible = true;
    return true;
  }
  function handleTap(e) {
    if (driving) return;
    if (self.ride) return;
    setNdc(e);
    ray.setFromCamera(ndc, camera);
    // bir oyuncuya dokunduysa → oyuncu kartı
    const planes = [];
    remotes.forEach((r) => r.fig.group.visible && r.fig.plane.visible && planes.push(r.fig.plane));
    const ph = planes.length ? ray.intersectObjects(planes, false) : [];
    if (ph.length) {
      onPlayerTap?.(ph[0].object.userData.figId);
      return;
    }
    if (self.seat) standUp();
    // önce bir binaya dokunduysa kapısına yürü
    const hits = ray.intersectObjects(blockers, false);
    const ground = new THREE.Plane(new V(0, 1, 0), -0.1);
    const gp = new V();
    const hitGround = ray.ray.intersectPlane(ground, gp);
    const gd = hitGround ? camera.position.distanceTo(gp) : Infinity;
    if (hits.length && hits[0].distance < gd) {
      const zn = hits[0].object.userData.zone;
      if (zn) {
        walkTo(zn.x, zn.z);
        return;
      }
      const p = hits[0].point;
      walkTo(p.x, p.z);
      return;
    }
    if (hitGround) walkTo(gp.x, gp.z);
  }
  function onDown(e) {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
      drag = null;
      return;
    }
    drag = { moved: 0 };
  }
  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = pinch.d / Math.max(d, 1);
      if (view === '2d') {
        top.dist = clamp(top.dist * ratio, 14, 110);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        let da = ang - pinch.a;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 0.5) top.az -= da;
        pinch.a = ang;
      } else self.camDist = clamp(self.camDist * ratio, 1.8, 16);
      pinch.d = d;
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 6) {
      if (view === '2d') {
        top.az -= dx * 0.006;
        top.el = clamp(top.el + dy * 0.004, 0.55, 1.45);
      } else if (driving) {
        driveCamOff -= dx * 0.006;
        driveCamIdle = 0;
        self.camPitch = clamp(self.camPitch + dy * 0.003, 0.05, 0.9);
      } else {
        self.camYaw -= dx * 0.006;
        self.camPitch = clamp(self.camPitch + dy * 0.004, -0.2, 1.2);
      }
    }
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && drag.moved <= 8 && e.type === 'pointerup') handleTap(e);
    drag = null;
  }
  function onWheel(e) {
    e.preventDefault();
    if (view === '2d') top.dist = clamp(top.dist * (1 + clamp(e.deltaY, -200, 200) * 0.0012), 14, 110);
    else self.camDist = clamp(self.camDist + e.deltaY * 0.006, 1.8, 16);
  }
  const onKeyDown = (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys[e.code] = true;
    if (e.code === 'ShiftLeft') self.run = true;
  };
  const onKeyUp = (e) => {
    keys[e.code] = false;
    if (e.code === 'ShiftLeft') self.run = runToggle;
  };
  let runToggle = false;
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // --- kare döngüsü ------------------------------------------------------------------
  const clock = new THREE.Clock();
  const camPos = new V(0, 20, 20);
  const camTarget = new V();
  const head = new V();
  let raf = 0;
  let paused = false;
  let first = true;
  let lightT = 0;
  let todT = 30;
  let zoneKey = '';
  let tickT = 0;
  let npcTalkT = 3;
  const camRay = new THREE.Raycaster();

  // v147.5 — akıllı yürüme: önce düz, sonra duvar boyunca kay, olmazsa engelin etrafından dön
  const canStand = (x, z) => !blockedAt(x, z) && !hitsParked(x, z);
  function moveSmart(vx, vz, dt) {
    const ox = self.x;
    const oz = self.z;
    const d = Math.hypot(vx, vz);
    // bir şekilde engelin içinde kaldıysak en yakın boş yere çık
    if (!canStand(ox, oz)) {
      const f = freeNear(ox, oz);
      if (f && Math.hypot(f.x - ox, f.z - oz) < 1.6) {
        self.x = f.x;
        self.z = f.z;
      } else {
        self.x += vx;
        self.z += vz;
      }
      return d;
    }
    if (canStand(ox + vx, oz + vz)) {
      self.x = ox + vx;
      self.z = oz + vz;
      return d;
    }
    // eksen eksen kayma
    let sx = ox;
    let sz = oz;
    if (canStand(ox + vx, oz)) sx = ox + vx;
    if (canStand(sx, oz + vz)) sz = oz + vz;
    const slid = Math.hypot(sx - ox, sz - oz);
    if (slid > d * 0.6) {
      self.x = sx;
      self.z = sz;
      return slid;
    }
    // köşe/direk: yönü iki yana çevirerek dene; son başarılı tarafı tercih et (titreme olmasın)
    self.steerT = Math.max(0, (self.steerT || 0) - dt);
    const pref = self.steerT > 0 ? self.steerSide || 1 : 0;
    const a0 = Math.atan2(vx, vz);
    let best = null;
    for (const da of [0.45, 0.9, 1.35]) {
      for (const sg of pref ? [pref, -pref] : [1, -1]) {
        const a = a0 + da * sg;
        const px = ox + Math.sin(a) * d;
        const pz = oz + Math.cos(a) * d;
        if (!canStand(px, pz)) continue;
        // aynı açıdaysa ileride de açık olan tarafı seç
        const ahead = canStand(ox + Math.sin(a) * d * 6, oz + Math.cos(a) * d * 6) ? 1 : 0;
        const sc = Math.cos(da) + ahead * 0.5 + (sg === pref ? 0.2 : 0);
        if (!best || sc > best.sc) best = { px, pz, sc, sg, da };
      }
      if (best) break;
    }
    if (best) {
      self.x = best.px;
      self.z = best.pz;
      self.steerSide = best.sg;
      self.steerT = 0.6;
      return d * Math.cos(best.da);
    }
    self.x = sx;
    self.z = sz;
    return slid;
  }
  function stepWalk(dt) {
    let f = 0;
    let s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
    const manual = f || s;
    if (self.seat) {
      if (manual) standUp();
      else {
        me.moving = false;
        return;
      }
    }
    const speed = self.run ? RUN_SPEED : WALK_SPEED;
    if (manual && self.target) {
      self.target = null;
      self.path = null;
      ring.visible = false;
    }
    let vx = 0;
    let vz = 0;
    if (manual) {
      const m = Math.hypot(f, s);
      const yaw = view === '2d' ? topCur.az : self.camYaw;
      vx = ((-Math.sin(yaw) * f + Math.cos(yaw) * s) / m) * speed * dt;
      vz = ((-Math.cos(yaw) * f - Math.sin(yaw) * s) / m) * speed * dt;
    } else if (self.target) {
      const dx = self.target.x - self.x;
      const dz = self.target.z - self.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        if (self.path?.length) self.target = self.path.shift();
        else {
          self.target = null;
          self.path = null;
          ring.visible = false;
        }
      } else {
        const st = Math.min(d, speed * dt);
        vx = (dx / d) * st;
        vz = (dz / d) * st;
      }
    }
    const moving = Math.hypot(vx, vz) > 0.0005;
    if (moving) {
      const want = Math.hypot(vx, vz);
      const got = moveSmart(vx, vz, dt);
      // v147.5: hedefe giderken takıldıysa yolu baştan hesapla (en kısa yoldan dolaş)
      if (!manual && self.target) {
        if (got < want * 0.35) self.stuckT = (self.stuckT || 0) + dt;
        else self.stuckT = Math.max(0, (self.stuckT || 0) - dt * 2);
        if (self.stuckT > 0.35) {
          self.stuckT = 0;
          const fin = self.path?.length ? self.path[self.path.length - 1] : self.target;
          const p = (self.repath = (self.repath || 0) + 1) <= 3 ? findPath(self.x, self.z, fin.x, fin.z) : null;
          if (p && p.length) {
            self.path = p;
            self.target = p.shift();
          } else {
            self.target = null;
            self.path = null;
            ring.visible = false;
          }
        }
      }
      const camRight = new V().setFromMatrixColumn(camera.matrixWorld, 0);
      const sx = vx * camRight.x + vz * camRight.z;
      if (Math.abs(sx) > 0.0008) me.facingLeft = sx < 0;
    }
    me.x = self.x;
    me.z = self.z;
    me.y += (groundY(self.x, self.z) - me.y) * Math.min(1, dt * 12);
    me.moving = moving;
    me.run = self.run;
  }

  function sitAt(st) {
    if (driving || !st || st.taken) return;
    self.target = null;
    self.path = null;
    ring.visible = false;
    self.seat = st;
    st.taken = true;
    self.x = st.x;
    self.z = st.z;
    me.x = st.x;
    me.z = st.z;
    me.sitting = true;
    me.seatY = st.y;
    zoneKey = '__sit__';
  }
  function standUp() {
    const st = self.seat;
    if (!st) return;
    self.seat = null;
    st.taken = false;
    me.sitting = false;
    const f = freeNear(st.x + Math.sin(st.yaw) * 0.75, st.z + Math.cos(st.yaw) * 0.75);
    if (f) {
      self.x = f.x;
      self.z = f.z;
    }
    zoneKey = '__stand__';
  }
  function placeCamera(dt) {
    camera.userData.billboardYaw = null;
    if (view === '2d') {
      const k = first ? 1 : 1 - Math.exp(-dt * 8);
      Object.keys(top).forEach((key) => {
        topCur[key] += (top[key] - topCur[key]) * k;
      });
      const kt = first ? 1 : 1 - Math.exp(-dt * 10);
      camTarget.set(camTarget.x + (self.x - camTarget.x) * kt, 0.6, camTarget.z + (self.z - camTarget.z) * kt);
      camPos.set(camTarget.x + Math.sin(topCur.az) * Math.cos(topCur.el) * topCur.dist, 0.6 + Math.sin(topCur.el) * topCur.dist, camTarget.z + Math.cos(topCur.az) * Math.cos(topCur.el) * topCur.dist);
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      camera.userData.billboardYaw = topCur.az;
      camera.userData.billboardEl = topCur.el;
      return;
    }
    const rc = !driving ? rideCar() : null;
    if ((driving && myCar) || rc) {
      const c = driving ? myCar : rc;
      const spd = driving ? Math.hypot(c.vx, c.vz) : Math.abs(c.spd || 0);
      driveCamIdle += dt;
      if (driveCamIdle > 1.4) driveCamOff *= Math.exp(-dt * 2.2);
      const cy = c.yaw + Math.PI + driveCamOff;
      const zoom = self.camDist / 6.2;
      let dist = (5.4 + spd * 0.055) * zoom * (camera.aspect < 1 ? 1.18 : 1);
      const hgt = (1.7 + self.camPitch * 2.2 + spd * 0.012) * zoom;
      head.set(c.x, c.y + 1.2, c.z);
      const dir = new V(Math.sin(cy), 0, Math.cos(cy));
      camRay.set(head, dir);
      camRay.far = dist;
      const h = camRay.intersectObjects(blockers, false);
      if (h.length) dist = Math.max(2.2, h[0].distance - 0.5);
      const want = new V(c.x + dir.x * dist, c.y + hgt, c.z + dir.z * dist);
      camPos.lerp(want, first ? 1 : 1 - Math.exp(-dt * 7));
      camera.position.copy(camPos);
      if (camShake > 0.002) {
        camera.position.x += (Math.random() - 0.5) * camShake;
        camera.position.y += (Math.random() - 0.5) * camShake;
        camShake *= Math.exp(-dt * 7);
      }
      const fwd = new V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      camera.lookAt(c.x + fwd.x * 2.6, c.y + 0.9, c.z + fwd.z * 2.6);
      const wantFov = 60 + Math.min(1, spd / c.v.def.phys.vmax) * 16;
      driveFov += (wantFov - driveFov) * Math.min(1, dt * 3);
      if (Math.abs(camera.fov - driveFov) > 0.05) {
        camera.fov = driveFov;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (camera.fov !== 60) {
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
    const eyeY = 1.55 + me.y;
    const yaw = self.camYaw;
    const pitch = self.camPitch;
    const aspect = camera.aspect || 1;
    let dist = self.camDist * (aspect < 1 ? 1 + (1 - aspect) * 0.55 : 1);
    head.set(self.x, eyeY, self.z);
    const dir = new V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // kamera binaya girmesin
    camRay.set(head, dir);
    camRay.far = dist;
    const h = camRay.intersectObjects(blockers, false);
    if (h.length) dist = Math.max(1.2, h[0].distance - 0.4);
    const want = head.clone().addScaledVector(dir, dist);
    want.y = Math.max(want.y, 0.5);
    camPos.lerp(want, first ? 1 : 1 - Math.exp(-dt * 12));
    camera.position.copy(camPos);
    camera.lookAt(self.x, eyeY - 0.15, self.z);
  }

  function updateLights(force, px = self.x, pz = self.z) {
    const near = lights.map((L) => ({ L, d: (L.x - px) ** 2 + (L.z - pz) ** 2 })).sort((a, b) => a.d - b.d).slice(0, POOL);
    pool.forEach((pl, i) => {
      const n = near[i];
      if (!n) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(n.L.x, n.L.y, n.L.z);
      pl.color.copy(n.L.color);
      pl.intensity = n.L.intensity * 1.15 * lampMul;
      pl.distance = n.L.distance * 1.2;
    });
    void force;
  }

  const projV = new V();
  function placeLabel(el, wx, wy, wz, w, h, maxD = 60, extra = '') {
    projV.set(wx, wy, wz);
    const dist = camera.position.distanceTo(projV);
    projV.project(camera);
    if (projV.z > 1 || dist > maxD || projV.x < -1.2 || projV.x > 1.2 || projV.y < -1.2 || projV.y > 1.2) {
      if (el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    if (el.style.display === 'none') el.style.display = '';
    const sx = ((projV.x + 1) / 2) * w;
    const sy = ((1 - projV.y) / 2) * h;
    el.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)${extra}`;
  }

  let dbgDt = 0.016;
  function frame(dt) {
    dbgDt = dt;
    const t = clock.elapsedTime;
    const now = performance.now();
    if (driving && myCar) stepDrive(dt);
    else if (self.ride) stepRide(dt);
    else stepWalk(dt);
    // park halindeki araba / çağırma animasyonu
    if (myCar) {
      if (!driving) updateCarVisual(myCar, dt, 0, 0, false, false);
      if (myCar.spawnT < 1) {
        myCar.spawnT = Math.min(1, myCar.spawnT + dt * 2.6);
        const k = myCar.spawnT;
        const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
        myCar.v.root.scale.setScalar(Math.max(0.01, e));
      }
      const fx = Math.sin(myCar.yaw);
      const fz = Math.cos(myCar.yaw);
      headSpot.intensity = 55;
      headSpot.position.set(myCar.x + fx * (myCar.v.len / 2), myCar.y + 0.75, myCar.z + fz * (myCar.v.len / 2));
      headSpot.target.position.set(myCar.x + fx * 16, 0, myCar.z + fz * 16);
      if (driving) {
        if (myCar.v.open) {
          myCar.v.root.updateMatrixWorld(true);
          const sp = myCar.v.body.localToWorld(new V(myCar.v.seat[0], myCar.v.seat[1], -myCar.v.spec.Wd * 0.22));
          me.x = sp.x;
          me.z = sp.z;
          me.y = myCar.y;
          me.seatY = sp.y;
          me.inCar = true;
          me.carYaw = myCar.yaw;
          me.group.visible = true;
        } else me.group.visible = false;
        me.moving = false;
      }
    }
    if (callRingT < 1.2) {
      callRingT += dt;
      const k = callRingT / 1.2;
      callRing.scale.setScalar(1 + k * 5);
      callRing.material.opacity = 0.9 * (1 - k);
    } else callRing.material.opacity = 0;
    puffs.forEach((p) => {
      if (p.t >= 1) return;
      p.t = Math.min(1, p.t + dt * 1.2);
      const sc = 0.8 + p.t * 3.2;
      p.sp.scale.set(sc, sc, 1);
      p.sp.position.y += dt * 0.6;
      p.sp.material.opacity = 0.45 * (1 - p.t);
      if (p.t >= 1) p.sp.visible = false;
    });
    npcs.forEach((n) => {
      n.moving = false;
      n.update(dt, camera, now);
    });
    me.sink = waters.length ? sinkAt(me.x, me.z) : 0;
    me.update(dt, camera, now);
    updateRemoteCars(dt);
    updateRemotes(dt, now);
    // NPC'ler sırayla konuşur (yakındakiler)
    npcTalkT -= dt;
    if (npcTalkT <= 0) {
      npcTalkT = 5 + Math.random() * 4;
      const near = npcs.filter((n) => Math.hypot(n.x - self.x, n.z - self.z) < 18);
      if (near.length) {
        const n = near[Math.floor(Math.random() * near.length)];
        if (n.lines?.length) n.say(n.lines[Math.floor(Math.random() * n.lines.length)]);
      }
    }
    // canlı eşyalar (kapılar açılır, fıskiye, ekip arabası…)
    ticks.forEach(({ obj, ctl }) => {
      if (!ctl?.tick) return;
      const wp = obj.getWorldPosition(projV);
      if (Math.abs(wp.x - self.x) > 70 || Math.abs(wp.z - self.z) > 70) return;
      ctl.tick(t, dt, Math.hypot(wp.x - self.x, wp.z - self.z));
    });
    smoke.forEach((s) => {
      const u = s.userData;
      u.t = (u.t + dt * 0.08) % 1;
      s.position.set(u.base.x + u.t * 6, u.base.y + u.t * 12, u.base.z - u.t * 3);
      const sc = 1.5 + u.t * 7;
      s.scale.set(sc, sc, 1);
      s.material.opacity = 0.45 * (1 - u.t);
    });
    // ışıklar
    lightT -= dt;
    if (lightT <= 0) {
      lightT = 0.25;
      updateLights();
    }
    moonL.position.set(self.x + sunLo[0], sunLo[1], self.z + sunLo[2]);
    todT -= dt;
    if (todT <= 0) {
      todT = 30;
      applyTod(todOf());
    }
    moonL.target.position.set(self.x, 0, self.z);
    placeCamera(dt);
    // etkileşim bölgesi
    let best = null;
    let bd = Infinity;
    zones.forEach((z) => {
      const d = Math.hypot(z.x - self.x, z.z - self.z);
      if (d < z.r && d < bd) {
        best = z;
        bd = d;
      }
    });
    if (!driving && myCar && !self.seat) {
      const d = Math.hypot(myCar.x - self.x, myCar.z - self.z);
      if (d < myCar.v.len / 2 + 2.2 && (!best || d < bd)) {
        best = { id: `mycar_${myCar.id}`, kind: 'car', title: `🚗 ${myCar.v.def.name}`, x: myCar.x, z: myCar.z };
        bd = d;
      }
    }
    if (!driving && !self.seat && !self.ride && (!best || best.kind !== 'car')) {
      let sb = null;
      let sd = 1.25;
      seats.forEach((st) => {
        if (st.taken) return;
        const d = Math.hypot(st.x - self.x, st.z - self.z);
        if (d < sd) {
          sd = d;
          sb = st;
        }
      });
      // v147.3: başka bir bölgedeyken (ör. seyyar satıcı) yakındaki sandalyeye de oturulabilsin
      if (sb && !best) best = { id: `seat_${sb.x.toFixed(1)}_${sb.z.toFixed(1)}`, kind: 'seat', title: '🪑 Oturak', seat: sb };
      else if (sb) best = { ...best, id: `${best.id}+seat_${sb.x.toFixed(1)}_${sb.z.toFixed(1)}`, seatNear: sb };
    }
    if (self.seat) best = { id: 'seated', kind: 'seated', title: '🪑 Oturuyorsun' };
    if (!best && !driving && !self.ride && !self.seat) {
      let rb = null;
      let rd = Infinity;
      rcars.forEach((c, uid) => {
        if ((c.v.def.seats || 1) < 2) return;
        const d = Math.hypot(c.x - self.x, c.z - self.z);
        if (d < c.v.len / 2 + 2 && d < rd) {
          rd = d;
          rb = { id: `ride_${uid}`, kind: 'ride', owner: uid, seats: c.v.def.seats, title: `🚗 ${c.v.def.name}` };
        }
      });
      if (rb) best = rb;
    }
    if (driving || self.ride) best = null;
    const zk = best ? best.id : '';
    if (zk !== zoneKey) {
      zoneKey = zk;
      onInteract?.(best);
    }
    tickT -= dt;
    if (tickT <= 0) {
      tickT = 0.1;
      onTick?.({ x: self.x, z: self.z, yaw: view === '2d' ? topCur.az : driving && myCar ? myCar.yaw + Math.PI + driveCamOff : self.camYaw, driving, riding: Boolean(self.ride), drive: driving ? driveStat : null, car: myCar ? { x: myCar.x, z: myCar.z } : null });
    }
  }

  function render() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()) || Math.abs(camera.aspect - w / Math.max(1, h)) > 0.001) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    placeSky();
    renderer.render(scene, camera);
    // etiketler
    const figs = [me, ...npcs];
    remotes.forEach((r) => figs.push(r.fig));
    figs.forEach((f) => {
      if (!f.group.visible) {
        f.label.style.display = 'none';
        return;
      }
      const top = f.sitting ? (f.seatY ?? 0.5) + 0.04 + AV_WAIST_FROM_TOP + 0.12 : f.y + AV_PLANE_H - AV_FEET + 0.12;
      placeLabel(f.label, f.x, top, f.z, w, h, view === '2d' ? 140 : f.remote ? 32 : 40);
    });
    mapLabels.forEach((m) => {
      const d = Math.hypot(m.p.x - self.x, m.p.z - self.z);
      const show = view === '2d' ? (m.kind === 'map' || topCur.dist < 50) : m.kind === 'map' ? d > 26 && d < 95 : d < 30 && d > 6;
      if (!show) {
        if (m.el.style.display !== 'none') m.el.style.display = 'none';
        return;
      }
      placeLabel(m.el, m.p.x, m.p.y, m.p.z, w, h, view === '2d' ? 400 : 260);
    });
    ring.material.opacity = 0.6 + Math.sin(clock.elapsedTime * 6) * 0.25;
  }

  // --- görüş mesafesi + otomatik grafik ------------------------------------------------
  let cullT = 0;
  function cull(force) {
    const now = performance.now();
    if (!force && now - cullT < 220) return;
    cullT = now;
    const t = CITY_TIERS[tier];
    const view = t.view + (view2d() ? topCur.dist * 1.2 : 0);
    const cx0 = view2d() ? camTarget.x : self.x;
    const cz0 = view2d() ? camTarget.z : self.z;
    for (const c of cullItems) c.o.visible = Math.hypot(c.x - cx0, c.z - cz0) - c.r < view;
    scene.fog.near = Math.min(view * 0.6 * fogK, view);
    scene.fog.far = view + 20;
    if (Math.abs(camera.far - (view + 60)) > 1) {
      camera.far = view + 60;
      camera.updateProjectionMatrix();
    }
  }
  const view2d = () => view === '2d';
  function applyTier() {
    const t = CITY_TIERS[tier];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.dpr));
    moonL.castShadow = t.shadows;
    moonL.shadow.autoUpdate = t.shadows && t.shadowEvery <= 1;
    pool.forEach((l, i) => (l.visible = i < t.pool));
    cull(true);
  }
  let perfAcc = 0;
  let perfN = 0;
  let perfStart = performance.now();
  let slowWins = 0;
  let fastWins = 0;
  let lastTierAt = 0;
  let lastRenderAt = 0;
  let frameNo = 0;
  function perfSample(iv) {
    const now = performance.now();
    if (now - perfStart < 2500 || iv > 600) return;
    perfAcc += iv;
    perfN += 1;
    if (perfN < 60 && !(perfN >= 8 && perfAcc >= 2000)) return;
    const avg = perfAcc / perfN;
    perfAcc = 0;
    perfN = 0;
    const want = 1000 / CITY_TIERS[tier].fps;
    if (avg > want * 1.35) {
      slowWins += 1;
      fastWins = 0;
    } else if (avg < want * 1.08) {
      fastWins += 1;
      slowWins = 0;
    } else {
      slowWins = 0;
      fastWins = 0;
    }
    if (slowWins >= 2 && tier < CITY_TIERS.length - 1) setTier(tier + 1, now);
    else if (fastWins >= 8 && tier > 0 && now - lastTierAt > 20000 && !(IS_MOBILE && tier <= 1)) setTier(tier - 1, now);
  }
  function setTier(t, now) {
    tier = t;
    saveCityTier(t);
    applyTier();
    lastTierAt = now;
    perfStart = now;
    slowWins = 0;
    fastWins = 0;
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused || renderer.__lost) {
      clock.getDelta();
      lastRenderAt = 0;
      return;
    }
    const now = performance.now();
    const cap = CITY_TIERS[tier].fps;
    if (cap < 58 && lastRenderAt && now - lastRenderAt < 1000 / cap - 3) return;
    if (lastRenderAt) perfSample(now - lastRenderAt);
    lastRenderAt = now;
    const dt = Math.min(clock.getDelta(), 0.05);
    frame(dt);
    cull(false);
    const t = CITY_TIERS[tier];
    if (t.shadows && t.shadowEvery > 1) moonL.shadow.needsUpdate = frameNo % t.shadowEvery === 0;
    frameNo += 1;
    render();
    first = false;
  }
  lightsReady = true;
  if (!snapshot) applyTier();
  updateLights(true);
  // ilk kare (doku/gölgelendirici derlemesi) sonra hazır
  frame(0.016);
  render();
  first = false;
  if (snapshot) {
    me.group.visible = false;
    me.label.style.display = 'none';
  } else {
    requestAnimationFrame(() => onReady?.());
    loop();
  }

  // --- v147 FOTOĞRAF ----------------------------------------------------------------
  // photoState: deklanşöre basıldığı anki sahne (kamera + görünen oyuncular + arabalar).
  // renderAtt: imzalı ekteki sahneyi tek kare olarak çizer (canlı motorda: oyun sahnesi
  // bir anlığına gizlenip fotoğraf karesi çizilir ve aynı karede geri yüklenir).
  const r2 = (v) => Math.round(v * 100) / 100;
  function figShot(uid, f, extra) {
    const now = performance.now();
    const o = { uid, x: r2(f.x), z: r2(f.z), y: r2(f.y), l: f.facingLeft ? 1 : 0, m: f.moving ? 1 : 0, wp: Math.floor(f.walkT / 0.16) % 2 ? 1 : 0 };
    if (f.sitting && !f.inCar) o.sy = r2(f.seatY ?? 0.5);
    if (f.emote && now - f.emote.t0 < EMOTE_MS) o.e = { k: f.emote.kind, at: Math.round(now - f.emote.t0) };
    if (f.holding) o.h = f.holding;
    const says = f.bubbles.filter((b) => now <= b.until).map((b) => b.el.textContent);
    if (says.length) o.says = says;
    return { ...o, ...extra };
  }
  function photoState() {
    const dir = new V();
    camera.getWorldDirection(dir);
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const cam = { px: r2(camera.position.x), py: r2(camera.position.y), pz: r2(camera.position.z), dx: r3(dir.x), dy: r3(dir.y), dz: r3(dir.z), fov: camera.fov, a: r3(camera.aspect), cw: Math.round(container.clientWidth || 400), td: view === '2d' ? 1 : 0 };
    const people = [figShot(myUid, me, driving && myCar ? { c: myUid, k: 0 } : self.ride ? { c: self.ride.owner, k: self.ride.k || 1 } : {})];
    [...remotes.values()]
      .filter((r) => (r.d ?? 999) < VIS_DIST)
      .sort((a, b) => a.d - b.d)
      .slice(0, 11)
      .forEach((r) => {
        const st = r.st || {};
        if (!r.fig.group.visible && st.p !== 'd' && st.p !== 'r') return;
        people.push(figShot(r.uid, r.fig, st.p === 'd' ? { c: r.uid, k: 0 } : st.p === 'r' ? { c: st.ro, k: st.rk || 1 } : {}));
      });
    const cars = [];
    if (myCar) cars.push({ o: myUid, v: myCar.id, x: r2(myCar.x), z: r2(myCar.z), y: r2(myCar.y), r: r3(myCar.yaw), st: r2(myCar.steer || 0) });
    rcars.forEach((c, uid) => {
      if (!c.v.root.visible || Math.hypot(c.x - self.x, c.z - self.z) > VIS_DIST) return;
      cars.push({ o: uid, v: c.id, x: r2(c.x), z: r2(c.z), y: r2(c.y), r: r3(c.yaw), st: r2(c.steer || 0) });
    });
    return { cam, people, cars: cars.slice(0, 8), tod };
  }
  function drawShotLabels(ctx, W, H, s, list) {
    const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const v = new V();
    const items = [];
    list.forEach(({ f, says, self: isMe }) => {
      if (!f.group.visible) return;
      const top = f.sitting ? (f.seatY ?? 0.5) + 0.04 + AV_WAIST_FROM_TOP + 0.12 : f.y + AV_PLANE_H - AV_FEET + 0.12;
      v.set(f.x, top, f.z);
      const d = v.distanceTo(camera.position);
      if (d > (f.npc ? 40 : 60)) return;
      v.project(camera);
      if (!(v.z < 1) || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) return;
      items.push({ f, says, isMe, d, x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H });
    });
    items.sort((a, b) => b.d - a.d);
    const rr = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const wrap = (text, maxW) => {
      const out = [];
      let line = '';
      String(text)
        .split(/\s+/)
        .forEach((w) => {
          const t = line ? `${line} ${w}` : w;
          if (ctx.measureText(t).width > maxW && line) {
            out.push(line);
            line = w;
          } else line = t;
        });
      if (line) out.push(line);
      return out.slice(0, 4);
    };
    items.forEach(({ f, says, isMe, x, y }) => {
      const name = f.nameEl.textContent || '';
      ctx.font = `700 ${11 * s}px ${font}`;
      const nw = ctx.measureText(name).width + 16 * s;
      const nh = 17 * s;
      let top = y - nh;
      rr(x - nw / 2, top, nw, nh, nh / 2);
      ctx.fillStyle = 'rgba(8,10,18,0.72)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, s);
      ctx.strokeStyle = isMe ? 'rgba(255,210,63,0.55)' : f.npc ? 'rgba(255,140,220,0.4)' : 'rgba(25,232,255,0.35)';
      ctx.stroke();
      ctx.fillStyle = isMe ? '#ffe9a8' : '#dff9ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x, top + nh / 2 + 0.5 * s);
      if (f.emote && EMOTE_EMOJI[f.emote.kind]) {
        ctx.font = `${22 * s}px ${font}`;
        ctx.fillText(EMOTE_EMOJI[f.emote.kind], x + nw / 2 + 14 * s, top + nh / 2);
      }
      (says || []).slice(-2).reverse().forEach((t) => {
        ctx.font = `${13 * s}px ${font}`;
        const lines = wrap(t, 170 * s);
        const lh = 13 * 1.3 * s;
        const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20 * s;
        const bh = lines.length * lh + 12 * s;
        top -= bh + 6 * s;
        rr(x - bw / 2, top, bw, bh, 10 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        ctx.fill();
        ctx.fillStyle = '#111';
        lines.forEach((l, i) => ctx.fillText(l, x, top + 6 * s + lh * (i + 0.5)));
      });
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function renderAtt(att, w, h) {
    const tmpFigs = [];
    const tmpCars = new Map();
    try {
      (att.cars || []).slice(0, 8).forEach((c) => {
        if (!VEHICLE_BY_ID[c.v]) return;
        const v = buildVehicle(c.v);
        const head = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.5), headMat('#ffe9b8', 0.45));
        head.rotation.x = -Math.PI / 2;
        head.position.set(0, 0.04, v.len / 2 + 3.9);
        v.root.add(head);
        v.root.visible = false;
        scene.add(v.root);
        tmpCars.set(c.o, { v, x: c.x, z: c.z, y: c.y || 0, yaw: c.r || 0, steer: c.st || 0 });
      });
      (att.people || []).slice(0, 12).forEach((p, i) => {
        const f = new Fig(scene, layer, { id: `shot_${i}`, name: p.n || 'Oyuncu', avatar: p.a || null });
        f.label.style.display = 'none';
        f.group.visible = false;
        f.shot = p;
        tmpFigs.push(f);
      });
      const t0 = Date.now();
      while (tmpFigs.some((f) => !f.tex.ready) && Date.now() - t0 < 5000) await sleep(80);
      if (tmpFigs.some((f) => f.pet)) await sleep(60); // evcil hayvan dokuları
      return shoot(att, w, h, tmpFigs, tmpCars);
    } finally {
      tmpFigs.forEach((f) => f.dispose(scene));
      tmpCars.forEach((c) => {
        scene.remove(c.v.root);
        c.v.root.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            if (o.material?.userData?.shared !== true && !Array.isArray(o.material) && o.material !== headMat('#ffe9b8', 0.45)) o.material.dispose?.();
          }
        });
      });
    }
  }
  function shoot(att, w, h, tmpFigs, tmpCars) {
    const cam = att.cam || {};
    const hidden = [];
    const hide = (o) => {
      if (o && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    };
    const hideFig = (f) => {
      hide(f.group);
      if (f.pet) {
        hide(f.pet.sprite);
        hide(f.pet.leash);
      }
    };
    hideFig(me);
    remotes.forEach((r) => hideFig(r.fig));
    rcars.forEach((c) => hide(c.v.root));
    if (myCar) hide(myCar.v.root);
    hide(ring);
    hide(callRing);
    const hsI = headSpot.intensity;
    headSpot.intensity = 0;
    const save = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, aspect: camera.aspect, bb: camera.userData.billboardYaw, bbe: camera.userData.billboardEl, pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), moon: moonL.position.clone(), moonT: moonL.target.position.clone() };
    try {
      tmpCars.forEach((c) => {
        c.v.root.visible = true;
        c.v.root.scale.setScalar(1);
        c.v.root.position.set(c.x, c.y, c.z);
        c.v.root.rotation.y = c.yaw;
        c.v.wheels.forEach((wh) => {
          if (wh.front) wh.pivot.rotation.y = c.steer;
        });
        c.v.root.updateMatrixWorld(true);
      });
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = Number(cam.fov) || 60;
      camera.updateProjectionMatrix();
      camera.position.set(cam.px, cam.py, cam.pz);
      camera.lookAt(cam.px + cam.dx, cam.py + cam.dy, cam.pz + cam.dz);
      if (cam.td) {
        camera.userData.billboardYaw = Math.atan2(-cam.dx, -cam.dz);
        camera.userData.billboardEl = Math.asin(clamp(-cam.dy, -1, 1));
      } else camera.userData.billboardYaw = null;
      camera.updateMatrixWorld(true);
      const fp = att.people?.[0] || { x: cam.px, z: cam.pz };
      // fotoğrafın çekildiği yer (canlı motorda oyuncu başka yerde olabilir): oranın parçaları görünür
      for (const c of cullItems) c.o.visible = Math.hypot(c.x - fp.x, c.z - fp.z) - c.r < 170;
      const fogSave = [scene.fog.near, scene.fog.far, camera.far];
      scene.fog.near = 70;
      scene.fog.far = 300;
      camera.far = 400;
      camera.updateProjectionMatrix();
      save.fog = fogSave;
      updateLights(true, fp.x, fp.z);
      // fotoğraf çekildiği saatin ışığıyla
      const todSave = tod;
      if (att.tod && TOD[att.tod]) applyTod(att.tod);
      save.tod = todSave;
      moonL.position.set(fp.x + sunLo[0], sunLo[1], fp.z + sunLo[2]);
      moonL.target.position.set(fp.x, 0, fp.z);
      moonL.target.updateMatrixWorld();
      const now = performance.now();
      const labels = [];
      tmpFigs.forEach((f, i) => {
        const p = f.shot;
        f.inCar = false;
        f.sitting = false;
        const car = p.c ? tmpCars.get(p.c) : null;
        if (car) {
          const sp = seatWorld(car, p.k || 0);
          f.x = sp.x;
          f.z = sp.z;
          f.y = car.y;
          f.seatY = sp.y;
          f.sitting = true;
          f.inCar = true;
          f.carYaw = car.yaw;
          f.moving = false;
          f.group.visible = car.v.open;
        } else {
          f.x = p.x;
          f.z = p.z;
          f.y = p.y ?? groundY(p.x, p.z);
          f.moving = Boolean(p.m);
          if (p.sy != null) {
            f.sitting = true;
            f.seatY = p.sy;
            f.moving = false;
          }
          f.group.visible = true;
        }
        f.facingLeft = Boolean(p.l);
        f.walkT = p.wp ? 0.16 : 0;
        f.emote = p.e && EMOTE_EMOJI[p.e.k] ? { kind: p.e.k, t0: now - (Number(p.e.at) || 0) } : null;
        if (p.h) f.setHolding(p.h);
        f.sink = waters.length ? sinkAt(f.x, f.z) : 0;
        f.sinkCur = f.sitting || f.inCar ? 0 : f.sink;
        f.update(0, camera, now);
        labels.push({ f, says: p.says || [], self: i === 0 });
      });
      npcs.forEach((n) => {
        n.update(0, camera, now);
        labels.push({ f: n, says: [] });
      });
      placeSky();
      renderer.render(scene, camera);
      const c2 = document.createElement('canvas');
      c2.width = w;
      c2.height = h;
      const ctx = c2.getContext('2d');
      ctx.drawImage(canvas, 0, 0, w, h);
      try {
        drawShotLabels(ctx, w, h, w / Math.max(200, Math.min(2000, Number(cam.cw) || 400)), labels);
      } catch {
        /* etiket çizilemezse sadece kare */
      }
      return c2.toDataURL('image/jpeg', 0.86);
    } finally {
      tmpFigs.forEach((f) => (f.group.visible = false));
      tmpCars.forEach((c) => (c.v.root.visible = false));
      hidden.forEach((o) => (o.visible = true));
      headSpot.intensity = hsI;
      renderer.setPixelRatio(save.pr);
      renderer.setSize(save.size.x, save.size.y, false);
      camera.position.copy(save.pos);
      camera.quaternion.copy(save.quat);
      camera.fov = save.fov;
      camera.aspect = save.aspect;
      if (save.fog) {
        [scene.fog.near, scene.fog.far, camera.far] = save.fog;
        if (!snapshot) cull(true);
      }
      camera.updateProjectionMatrix();
      camera.userData.billboardYaw = save.bb;
      camera.userData.billboardEl = save.bbe;
      if (save.tod && save.tod !== tod) applyTod(save.tod);
      moonL.position.copy(save.moon);
      moonL.target.position.copy(save.moonT);
      moonL.target.updateMatrixWorld();
      updateLights(true);
      if (!snapshot) {
        // canlı ekranda fotoğraf karesi görünmesin: oyun karesini hemen yeniden çiz
        const now2 = performance.now();
        npcs.forEach((n) => n.update(0, camera, now2));
        try {
          renderer.render(scene, camera);
        } catch {
          /* yoksay */
        }
      }
    }
  }

  const api = {
    photoState,
    renderAtt,
    getPerf: () => ({ tier, name: CITY_TIERS[tier].name, dpr: renderer.getPixelRatio() }),
    setPerfTier: (v) => setTier(clamp(Math.round(v), 0, CITY_TIERS.length - 1), performance.now()),
    setView(v) {
      view = v;
      first = true;
      if (v === '2d') {
        top.az = self.camYaw;
        topCur.az = self.camYaw;
      } else self.camYaw = topCur.az;
      camera.fov = v === '2d' ? 50 : 60;
      camera.updateProjectionMatrix();
    },
    getView: () => view,
    setRun(on) {
      runToggle = on;
      self.run = on;
    },
    emote(k) {
      me.playEmote(k);
      lastEmote = { e: k, et: Date.now() };
    },
    say(text) {
      me.say(text);
    },
    setHolding(p) {
      me.setHolding(p);
    },
    npcSay(id, text) {
      npcs.find((n) => n.id === id)?.say(text);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      clock.getDelta();
      first = true;
    },
    // kapıdan çıkınca: kapının önüne, yüz binadan dışarı
    exitAt(zone) {
      const out = zone.out || 0;
      const fx = Math.sin(out);
      const fz = Math.cos(out);
      const f = freeNear(zone.x + fx * 1.2, zone.z + fz * 1.2) || { x: zone.x, z: zone.z };
      self.x = f.x;
      self.z = f.z;
      self.target = null;
      self.path = null;
      ring.visible = false;
      self.camYaw = out; // kamera binanın önünde, sırtın binaya dönük
      zoneKey = '__exit__';
    },
    teleport(x, z) {
      if (driving) exitCar();
      if (self.seat) standUp();
      const f = freeNear(x, z);
      if (!f) return;
      self.x = f.x;
      self.z = f.z;
      self.target = null;
      self.path = null;
      ring.visible = false;
      first = true;
    },
    walkTo,
    dbgWalk: () => ({ x: self.x, z: self.z, fx: ring.position.x, fz: ring.position.z, on: ring.visible, rp: self.repath || 0, fps: Math.round(1 / Math.max(0.001, dbgDt)) }),
    callCar,
    enterCar,
    exitCar,
    sit: (st) => sitAt(st),
    stand: () => standUp(),
    setDrive(patch) {
      Object.assign(driveIn, patch);
    },
    horn() {
      sound.start();
      sound.horn();
    },
    setMuted(m) {
      sound.setMuted(m);
    },
    isDriving: () => driving,
    getDrive: () => driveStat,
    debugCar: () => myCar && { x: +myCar.x.toFixed(2), z: +myCar.z.toFixed(2), yaw: +myCar.yaw.toFixed(3), steer: +myCar.steer.toFixed(2), vx: +myCar.vx.toFixed(2), vz: +myCar.vz.toFixed(2) },
    hasCar: () => Boolean(myCar),
    setCam(yaw, pitch, dist) {
      if (yaw != null) self.camYaw = yaw;
      if (pitch != null) self.camPitch = pitch;
      if (dist != null) self.camDist = dist;
      first = true;
    },
    setTop(az, el, dist) {
      Object.assign(top, { az, el, dist });
      first = true;
    },
    getSelf: () => ({ x: self.x, z: self.z }),
    // --- çevrimiçi ---------------------------------------------------------
    upsertPlayer,
    removePlayer,
    upsertCar,
    removeCar,
    debugRemote: (id) => ({ car: rcars.get(id) && { x: rcars.get(id).x, z: rcars.get(id).z }, fig: remotes.get(id) && { x: remotes.get(id).fig.x, z: remotes.get(id).fig.z } }),
    setTod: (k) => applyTod(k),
    look(yaw, pitch) {
      if (yaw != null) self.camYaw = yaw;
      if (pitch != null) self.camPitch = pitch;
    },
    remoteCount: () => [...remotes.values()].filter((r) => (r.d ?? 999) < VIS_DIST).length,
    playerSay(uid, text) {
      remotes.get(uid)?.fig.say(text);
    },
    setAvatar(av) {
      me.setAvatar(av);
    },
    // ağa gönderilecek kendi durumum (kısa alan adları → az veri)
    getNetState() {
      const st = { x: Math.round(self.x * 100) / 100, z: Math.round(self.z * 100) / 100, l: me.facingLeft ? 1 : 0, m: me.moving ? 1 : 0, p: driving ? 'd' : self.ride ? 'r' : self.seat ? 's' : 'w' };
      if (self.run && me.moving) st.r = 1;
      if (self.seat) st.sy = Math.round(self.seat.y * 100) / 100;
      if (self.ride) {
        st.ro = self.ride.owner;
        st.rk = self.ride.k;
      }
      if (lastEmote.e && Date.now() - lastEmote.et < 4000) {
        st.e = lastEmote.e;
        st.et = lastEmote.et;
      }
      if (me.holding) st.h = me.holding;
      return st;
    },
    getNetCar() {
      if (!myCar) return null;
      const fx = Math.sin(myCar.yaw);
      const fz = Math.cos(myCar.yaw);
      return { v: myCar.id, x: Math.round(myCar.x * 100) / 100, z: Math.round(myCar.z * 100) / 100, y: Math.round(myCar.yaw * 1000) / 1000, s: Math.round((myCar.vx * fx + myCar.vz * fz) * 10) / 10, st: Math.round((myCar.steer || 0) * 100) / 100, d: driving ? 1 : 0 };
    },
    myCarSeats: () => (myCar ? myCar.v.def.seats || 1 : 0),
    removeMyCar() {
      if (driving) exitCar();
      if (!myCar) return;
      scene.remove(myCar.v.root);
      myCar.v.root.traverse((o) => o.isMesh && o.geometry.dispose());
      myCar = null;
      headSpot.intensity = 0;
    },
    rideStart,
    rideEnd,
    isRiding: () => Boolean(self.ride),
    spawnAt(key) {
      const p = spawnPoint(key);
      api.teleport(p.x, p.z);
      self.camYaw = p.yaw;
      if (p.pitch != null) self.camPitch = p.pitch;
    },
    hidden(on) {
      if (on) sound.idle(false);
      else if (driving) sound.idle(true);
    },
    lots: city.lots.map((l) => ({ type: l.type, outer: l.outer, x0: l.mx - l.bw / 2, x1: l.mx + l.bw / 2, z0: l.mz - l.bd / 2, z1: l.mz + l.bd / 2, name: l.def?.name, icon: l.def?.icon, door: zones.find((z) => z.kind === 'door' && z.type === l.type) || null })),
    zones,
    stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      remotes.forEach((r) => r.fig.dispose(scene));
      remotes.clear();
      sound.idle(false);
      try {
        sound.ctx?.close();
      } catch {
        /* yoksay */
      }
      scene.traverse((o) => {
        if (o.isMesh || o.isSprite || o.isPoints) {
          o.geometry?.dispose?.();
          [].concat(o.material || []).forEach((m) => {
            if (m.map) m.map.dispose();
            if (m.emissiveMap) m.emissiveMap.dispose();
            m.dispose?.();
          });
        }
      });
      // ortak çizici + ortam dokusu DİSPOSE EDİLMEZ (mekânlar da kullanıyor)
      renderer.__onLost = null;
      renderer.renderLists?.dispose?.();
      if (canvas.parentNode === container) container.removeChild(canvas);
      layer.remove();
    },
  };
  return api;
}

const headCache = new Map();
function headMat(color, op) {
  const k = `${color}${op}`;
  if (headCache.has(k)) return headCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  r.addColorStop(0, color);
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  headCache.set(k, m);
  return m;
}

// --- statik birleştirme ------------------------------------------------------------
function mergeStatic(scene) {
  const buckets = new Map();
  const remove = [];
  const wp = new V();
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (o.userData.dyn || o.userData.blocker || o.userData.pickOnly) return;
    if (Array.isArray(o.material) || !o.material || o.material.vertexColors) return;
    if (o.material.visible === false) return;
    let p = o;
    while (p) {
      if (!p.visible) return;
      p = p.parent;
    }
    const g = o.geometry;
    if (!g?.attributes?.position || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return;
    if (o.geometry.type === 'SphereGeometry' && o.material.map?.isCanvasTexture && o.material.side === THREE.BackSide) return;
    o.getWorldPosition(wp);
    if (Math.abs(wp.x) > 400 || Math.abs(wp.z) > 400) return;
    const key = `${Math.floor(wp.x / 48)},${Math.floor(wp.z / 48)}|${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let geo = g.index ? g.toNonIndexed() : g.clone();
    Object.keys(geo.attributes).forEach((n) => {
      if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    });
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    geo.morphAttributes = {};
    geo.applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0) {
      // ayna ölçek: üçgen sırasını çevir
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i += 3) {
        for (const at of [pos, nor, uv]) {
          const s = at.itemSize;
          for (let c = 0; c < s; c++) {
            const a = at.array[(i + 1) * s + c];
            at.array[(i + 1) * s + c] = at.array[(i + 2) * s + c];
            at.array[(i + 2) * s + c] = a;
          }
        }
      }
    }
    let b = buckets.get(key);
    if (!b) {
      b = { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] };
      buckets.set(key, b);
    }
    b.geos.push(geo);
    remove.push(o);
  });
  remove.forEach((o) => o.parent?.remove(o));
  const root = new THREE.Group();
  root.name = 'merged';
  buckets.forEach((b) => {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) return;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.renderOrder = b.order;
    m.matrixAutoUpdate = false;
    root.add(m);
  });
  scene.add(root);
}

export { cx, cz, BLOCK };
