import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { drawPet, isPerchPet, petCollarAt, PET_ART } from '../../lib/cosmeticsArt';
import { CATALOG_MAP, buildItem, itemBoxes, disposeObject, TINTS, M } from './houseCatalog';
import { FLOORS, WALLS, floorDef, wallDef, surfaceTexture } from './houseTextures';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { heldCanvas, heldDataUrl } from './heldArt';

// =============================================================================
// houseEngine.js — Ev'in 3D motoru (three.js). React'ten bağımsız; HouseScreen
// bir <div> verir, motor içine canvas + isim/balon katmanı kurar.
//
// Modlar:
//   'walk' (varsayılan) → evde gez. view '3d' = 3. şahıs kamera, view '2d' =
//                          kuş bakışı. Dokunduğun yere yürürsün (masaüstünde WASD).
//   'build'             → sahibi için tasarım: eşya ekle / sürükle / döndür / boya / sil.
//
// Avatarlar: oyunun mevcut SVG avatarları birebir dokuya çevrilip kameraya dönen
// "kağıt figür" (billboard) olarak çiziliyor — 2D'deki tipler hiç bozulmuyor.
//
// KARARLILIK (v66): Tarayıcılar aynı anda ~16 WebGL bağlamına izin verir. Eskiden
// eve her girişte YENİ bir renderer açılıyordu; birkaç giriş-çıkıştan sonra tarayıcı
// eski bağlamları düşürüp oyunu bozuyordu ("arka plandan silip tekrar gir" sorunu).
// Artık TEK ortak renderer var (getSharedRenderer) ve kaybolursa yeniden kurulur.
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
const EMOTE_MS = 3200;
const STREAM_CHAIR_KEYS = ['gamer']; // v80 yayın seti
const STREAM_PC_KEYS = ['pc', 'pcstation'];
export const EMOTES = [
  { key: 'dans', label: 'Dans et', emoji: '💃' },
  { key: 'selam', label: 'El salla', emoji: '👋' },
  { key: 'alkis', label: 'Alkışla', emoji: '👏' },
  { key: 'zipla', label: 'Zıpla', emoji: '🤸' },
  { key: 'kalp', label: 'Kalp at', emoji: '❤️' },
];
const EMOTE_EMOJI = Object.fromEntries(EMOTES.map((e) => [e.key, e.emoji]));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = (v) => Math.round(v / SNAP) * SNAP;
let idSeq = 0;
export const newItemId = () => `${Date.now().toString(36).slice(-5)}${(idSeq++ % 1296).toString(36).padStart(2, '0')}`;

// --- Ortak renderer'lar ------------------------------------------------------
function makeRenderer(opts) {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', ...opts });
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.__lost = false;
  r.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    r.__lost = true;
    r.__onLost?.();
  });
  return r;
}
const shared = { main: null, mainEnv: null, snap: null, snapEnv: null, spec: null, specEnv: null };
function envFor(r) {
  const pm = new THREE.PMREMGenerator(r);
  const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return tex;
}
function getSharedRenderer(kind = 'main') {
  let r = shared[kind];
  if (r && r.__lost) {
    try {
      r.dispose();
    } catch {
      /* bağlam zaten yok */
    }
    r = null;
    shared[kind] = null;
  }
  if (!r) {
    r = makeRenderer(kind === 'snap' ? { preserveDrawingBuffer: true } : {});
    shared[kind] = r;
    shared[`${kind}Env`] = envFor(r);
  }
  return { renderer: r, env: shared[`${kind}Env`] };
}

// --- Avatar dokuları ---------------------------------------------------------
const avatarTexCache = new Map();
function avatarTextures(avatar) {
  const av = avatar || DEFAULT_AVATAR;
  const key = JSON.stringify(av);
  let entry = avatarTexCache.get(key);
  if (entry) return entry;
  entry = { ready: false, tex: {} };
  avatarTexCache.set(key, entry);
  if (avatarTexCache.size > 60) avatarTexCache.delete(avatarTexCache.keys().next().value);
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

// v70 — eldeki ürün (içecek/yiyecek/silah): diğer mekânlardaki gibi elde
// görünen küçük ikon (kameraya dönük sprite, hafifçe sallanır).
const heldTexCache = new Map();
const GYM_FREE_KEYS = ['bag', 'treadmill', 'bench', 'dumbbells'];
function heldTexture(product) {
  if (heldTexCache.has(product)) return heldTexCache.get(product);
  // v77 — emoji yerine her ürünün kendi çizimi (heldArt.js)
  const t = new THREE.CanvasTexture(heldCanvas(product));
  t.colorSpace = THREE.SRGBColorSpace;
  heldTexCache.set(product, t);
  return t;
}

// v78 — evcil hayvan (avatar.pet): sahibinin yanında yürüyen, kameraya dönük
// küçük sprite + tasma çizgisi. Papağan/baykuş/martı sahibi durunca omzuna konar.
const PET_CV = 256;
const PET_PX = 140; // canvas'ta hayvan boyu
const PET_OX = 110;
const PET_OY = 220;
class PetFollower {
  constructor(scene, pet) {
    this.scene = scene;
    this.id = pet.id;
    this.perch = isPerchPet(pet.id);
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = PET_CV;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, alphaTest: 0.2, toneMapped: false }));
    this.sm = ((PET_ART[pet.id]?.s || 40) * 0.72 * 1.75) / 159; // metre (avatar 1,75 m)
    const k = (PET_CV / PET_PX) * this.sm;
    this.sprite.scale.set(k, k, 1);
    this.sprite.center.set(PET_OX / PET_CV, 1 - PET_OY / PET_CV);
    scene.add(this.sprite);
    this.leashGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
    this.leash = new THREE.Line(this.leashGeo, new THREE.LineBasicMaterial({ color: 0xff2e88, toneMapped: false }));
    scene.add(this.leash);
    this.x = null;
    this.y = 0;
    this.z = 0;
    this.flip = false;
    this.lastDraw = 0;
    this.set(pet);
  }
  set(pet) {
    this.pet = pet;
    this.leash.material.color.set(pet.leashColor || '#ff2e88');
  }
  update(dt, now, owner, ang, seatPos) {
    const rx = Math.cos(ang);
    const rz = -Math.sin(ang);
    const side = owner.facingLeft ? -1 : 1;
    let tx;
    let ty;
    let tz;
    let flying = false;
    if (this.perch && !owner.moving) {
      tx = owner.x - rx * 0.16 * side;
      tz = owner.z - rz * 0.16 * side;
      ty = (seatPos ? seatPos.y + 0.95 : 1.42) - 0.02;
    } else if (this.perch) {
      flying = true;
      tx = owner.x - rx * 0.3 * side + Math.sin(now / 420) * 0.15;
      tz = owner.z - rz * 0.3 * side;
      ty = 1.95 + Math.sin(now / 260) * 0.06;
    } else {
      tx = owner.x + rx * (0.5 + this.sm * 0.3) * side;
      tz = owner.z + rz * (0.5 + this.sm * 0.3) * side;
      ty = 0;
    }
    if (this.x === null) {
      this.x = tx;
      this.y = ty;
      this.z = tz;
    }
    const k = Math.min(1, dt * (this.perch ? 5 : 3.5));
    const dx = tx - this.x;
    const dz = tz - this.z;
    this.x += dx * k;
    this.y += (ty - this.y) * k;
    this.z += dz * k;
    const lateral = dx * rx + dz * rz;
    if (Math.abs(lateral) > 0.01) this.flip = lateral < 0;
    if (this.perch && !owner.moving && Math.hypot(dx, dz, ty - this.y) > 0.05) flying = true;
    const moving = Math.hypot(dx, dz) * k / Math.max(dt, 0.001) > 0.25;
    this.sprite.position.set(this.x, this.y, this.z);
    // doku ~20 fps (yürüme/kuyruk animasyonu)
    if (now - this.lastDraw > 50) {
      this.lastDraw = now;
      const c = this.ctx;
      c.clearRect(0, 0, PET_CV, PET_CV);
      const showLeash = this.pet.leash !== false && !this.perch;
      drawPet(c, this.id, PET_OX, PET_OY, now, { moving, flip: this.perch && !flying ? side < 0 : this.flip, flying, collar: showLeash ? this.pet.leashColor || '#ff2e88' : null, size: PET_PX });
      this.tex.needsUpdate = true;
    }
    // tasma: el → tasma halkası
    const showLeash = this.pet.leash !== false && !this.perch;
    this.leash.visible = showLeash;
    if (showLeash) {
      const hx = owner.x + rx * 0.24 * side;
      const hz = owner.z + rz * 0.24 * side;
      const hy = seatPos ? seatPos.y + 0.5 : 0.92;
      const fdir = this.flip ? -1 : 1;
      const [ccx, ccy] = petCollarAt(this.id);
      const px = this.x + rx * ccx * this.sm * fdir;
      const pz = this.z + rz * ccx * this.sm * fdir;
      const py = this.y - ccy * this.sm;
      const pos = this.leashGeo.attributes.position;
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const sag = Math.sin(t * Math.PI) * 0.18;
        pos.setXYZ(i, hx + (px - hx) * t, hy + (py - hy) * t - sag, hz + (pz - hz) * t);
      }
      pos.needsUpdate = true;
    }
  }
  dispose() {
    this.scene.remove(this.sprite);
    this.scene.remove(this.leash);
    this.sprite.material.dispose();
    this.tex.dispose();
    this.leashGeo.dispose();
    this.leash.material.dispose();
  }
}

class AvatarFigure {
  constructor(scene, labelLayer, { uid, name, avatar, isSelf }) {
    this.scene = scene;
    this.uid = uid;
    this.isSelf = isSelf;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, toneMapped: false, side: THREE.DoubleSide });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(AV_PLANE_W, AV_PLANE_H), this.mat);
    this.plane.visible = false;
    this.plane.userData.playerUid = uid;
    this.group.add(this.plane);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.group.add(this.shadow);
    this.heldSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: true, toneMapped: false }));
    this.heldSprite.scale.set(0.34, 0.34, 1);
    this.heldSprite.visible = false;
    this.group.add(this.heldSprite);
    scene.add(this.group);
    this.x = 0;
    this.z = 0;
    this.tx = 0;
    this.tz = 0;
    this.moving = false;
    this.walkT = 0;
    this.facingLeft = false;
    this.bubbles = [];
    this.emote = null;
    this.label = null;
    if (labelLayer) {
      this.label = document.createElement('div');
      this.label.className = `hs-label${isSelf ? ' self' : ''}`;
      this.bubbleBox = document.createElement('div');
      this.bubbleBox.className = 'hs-bubbles';
      this.emoteEl = document.createElement('div');
      this.emoteEl.className = 'hs-emote';
      this.nameEl = document.createElement('div');
      this.nameEl.className = 'hs-name';
      this.label.append(this.bubbleBox, this.emoteEl, this.nameEl);
      labelLayer.appendChild(this.label);
    }
    this.setIdentity(name, avatar);
  }
  setIdentity(name, avatar) {
    this.name = name || 'Oyuncu';
    this.renderName();
    const key = JSON.stringify(avatar || DEFAULT_AVATAR);
    if (key !== this.avKey) {
      this.avKey = key;
      this.tex = avatarTextures(avatar);
    }
    // v78 evcil hayvan
    const pet = avatar?.pet && PET_ART[avatar.pet.id] ? avatar.pet : null;
    if (!pet || this.pet?.id !== pet.id) {
      this.pet?.dispose();
      this.pet = pet && this.scene ? new PetFollower(this.scene, pet) : null;
    } else this.pet.set(pet);
  }
  setHolding(product) {
    if (product === this.holding) return;
    this.holding = product || null;
    if (this.holding) {
      this.heldSprite.material.map = heldTexture(this.holding);
      this.heldSprite.material.needsUpdate = true;
    }
    this.heldSprite.visible = Boolean(this.holding);
    this.renderName();
  }
  renderName() {
    if (!this.nameEl) return;
    this.nameEl.textContent = this.name;
    if (this.holding) {
      const img = document.createElement('img');
      img.className = 'hs-name-held';
      img.alt = HOUSE_PRODUCTS[this.holding]?.label || '';
      img.src = heldDataUrl(this.holding);
      this.nameEl.prepend(img);
    }
  }
  say(text) {
    // v71 — metin her zaman tutulur (fotoğrafa balon çizmek için; snapshot
    // motorunda DOM etiketi yoktur).
    const b = { el: null, text: String(text || ''), until: performance.now() + 9000 };
    if (this.bubbleBox) {
      const el = document.createElement('div');
      el.className = 'hs-bubble';
      el.textContent = b.text;
      this.bubbleBox.appendChild(el);
      b.el = el;
    }
    this.bubbles.push(b);
    while (this.bubbles.length > 3) this.bubbles.shift().el?.remove();
  }
  playEmote(kind, at = performance.now()) {
    if (!EMOTE_EMOJI[kind]) return;
    this.emote = { kind, t0: at };
    if (this.emoteEl) {
      this.emoteEl.textContent = EMOTE_EMOJI[kind];
      this.emoteEl.classList.remove('on');
      void this.emoteEl.offsetWidth;
      this.emoteEl.classList.add('on');
    }
  }
  // stand: oturma noktası ayakta kullanılıyor (duşakabin)
  update(dt, camera, now, seatPos, stand = false) {
    if (seatPos) {
      this.x = seatPos.x;
      this.z = seatPos.z;
    } else if (!this.isSelf) {
      const dx = this.tx - this.x;
      const dz = this.tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 4) {
        this.x = this.tx;
        this.z = this.tz;
      } else if (d > 0.001) {
        // sabit hızla hedefe (ağ aralıklarında takılmasın)
        // v73: konum ~0,65 sn'de bir geldiği için orantılı yaklaşım (araya duraklama girmesin)
        const step = Math.min(d, Math.max(WALK_SPEED * 0.6, d * 2.2) * dt);
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
      }
      this.moving = d > 0.05;
    }
    this.group.position.set(this.x, 0, this.z);
    const ang = Math.atan2(camera.position.x - this.x, camera.position.z - this.z);
    // hareket animasyonu (dans, el sallama...)
    let tilt = 0;
    let lift = 0;
    let forceWalk = false;
    if (this.emote) {
      const e = (now - this.emote.t0) / 1000;
      if (e > EMOTE_MS / 1000) {
        this.emote = null;
        this.emoteEl?.classList.remove('on');
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
    // kamera yukarıdaysa (2D kuş bakışı) avatar düzlemi kameraya doğru yatırılır,
    // yoksa tepeden bakınca ince bir çizgi gibi görünür.
    const hd = Math.hypot(camera.position.x - this.x, camera.position.z - this.z);
    const el = Math.atan2(camera.position.y - AV_PLANE_H / 2, hd);
    const back = el > 0.35 ? Math.min(el - 0.35, 1.05) : 0;
    this.plane.rotation.order = 'YXZ';
    this.plane.rotation.set(-back, ang, tilt);
    let pose = 'idle';
    if (seatPos && !stand) pose = 'sit';
    else if (this.moving || forceWalk) {
      this.walkT += dt * (forceWalk ? 0.7 : 1);
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
    if (this.holding) {
      // el hizası: gövdenin yanında, kameraya doğru biraz önde
      const side = this.facingLeft ? -1 : 1;
      const rx = Math.cos(ang) * side;
      const rz = -Math.sin(ang) * side;
      const bob = Math.sin(now / 480) * 0.02;
      const handY = (seatPos && !stand ? seatPos.y + 0.55 : AV_PLANE_H * 0.47 - AV_FEET + (seatPos ? seatPos.y : 0)) + bob;
      this.heldSprite.position.set(rx * 0.3 + Math.sin(ang) * 0.12, handY, rz * 0.3 + Math.cos(ang) * 0.12);
    }
    if (seatPos && stand) {
      this.plane.position.y = AV_PLANE_H / 2 - AV_FEET + seatPos.y + lift;
      this.shadow.visible = false;
    } else if (seatPos) {
      const topY = seatPos.y + 0.04 + AV_WAIST_FROM_TOP;
      this.plane.position.y = topY - AV_PLANE_H / 2 + lift;
      this.shadow.visible = false;
    } else {
      this.plane.position.y = AV_PLANE_H / 2 - AV_FEET + lift;
      this.shadow.visible = true;
    }
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.el?.remove();
        return false;
      }
      return true;
    });
    this.pet?.update(Math.max(dt, 0.016), now, this, ang, seatPos && !stand ? seatPos : null);
  }
  headWorld(v) {
    const top = this.plane.position.y + AV_PLANE_H / 2 - 0.12;
    return v.set(this.x, top, this.z);
  }
  dispose(scene) {
    scene.remove(this.group);
    this.plane.geometry.dispose();
    this.mat.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.heldSprite.material.dispose();
    this.label?.remove();
    this.pet?.dispose();
    this.pet = null;
  }
}

// --- Küçük resimler (katalog rafı) ------------------------------------------
let thumbCtx = null;
const thumbCache = new Map();
function thumbRenderer() {
  if (thumbCtx && !thumbCtx.r.__lost) return thumbCtx;
  const r = makeRenderer({ alpha: true, preserveDrawingBuffer: true });
  r.shadowMap.enabled = false;
  r.setSize(160, 160, false);
  r.setPixelRatio(1);
  r.toneMappingExposure = 1.1;
  const s = new THREE.Scene();
  s.environment = envFor(r);
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

// Deneme (henüz satın alınmamış) eşyayı yarı saydam "hologram" yap.
function ghostify(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.material = [].concat(o.material).map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = Math.min(c.opacity ?? 1, 0.6);
      c.depthWrite = false;
      if (c.emissive) {
        c.emissive = new THREE.Color('#19e8ff');
        c.emissiveIntensity = 0.14;
      }
      c.userData = { own: true };
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
}

// =============================================================================
// MOTOR
// =============================================================================
export function createHouseEngine(
  container,
  { canEdit, selfUid, onSelectionChange, onDesignChange, onInteractChange, onPlayerTap, onContextLost, snapshot = false, spectate = false } = {}
) {
  // v80 — spectate: yayın izleyicisi. Kendi WebGL bağlamı, giriş dinlemez, kamera
  // sabit pozda (bilgisayarın üstü → koltuk), sürekli çizer.
  const { renderer, env } = getSharedRenderer(snapshot ? 'snap' : spectate ? 'spec' : 'main');
  renderer.__onLost = snapshot ? null : () => onContextLost?.();
  renderer.setPixelRatio(snapshot ? 1 : Math.min(window.devicePixelRatio || 1, spectate ? 1.5 : 1.75));
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.className = 'hs-gl';
  container.appendChild(canvas);
  let labelLayer = null;
  if (!snapshot) {
    labelLayer = document.createElement('div');
    labelLayer.className = 'hs-labels';
    container.appendChild(labelLayer);
  }
  const owned = []; // bu sahneye ait, dispose edilecek kaynaklar

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07080d');
  scene.environment = env;
  scene.environmentIntensity = 0.32;

  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 120);
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
  const stripMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffe2b0', emissiveIntensity: 2.4 });
  owned.push(stripMat);
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
  dividerMat.userData.shared = true; // eşyalar dispose ederken dokunmasın
  const trimMat = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.5 });
  const capMat = new THREE.MeshStandardMaterial({ color: '#23242a', roughness: 0.8 });
  owned.push(floorMat, wallMatLong, wallMatShort, dividerMat, trimMat, capMat, outside.material, ceiling.material);
  const STUB_H = 0.45;
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
    door.traverse((o) => {
      if (o.isMesh) {
        o.receiveShadow = true;
        owned.push(o.material);
      }
    });
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
  // yürüme hedefi işareti
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 32), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false }));
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.025;
  targetRing.visible = false;
  scene.add(targetRing);
  owned.push(selMat, selRing.material, targetRing.material, grid.material);

  // --- Durum ---------------------------------------------------------------------
  let design = { items: [], wall: WALLS[0].key, floor: FLOORS[0].key };
  const objs = new Map(); // id -> { obj, data, sig }
  let selectedId = null;
  let mode = 'walk';
  let view = '3d';
  const undoStack = [];
  const orbit = { az: 0.35, el: 0.95, dist: 20, tx: 0, tz: 0 };
  const orbitCur = { ...orbit };
  const top = { az: 0.0, el: 1.3, dist: 21 }; // 2D kuş bakışı (oyuncuyu takip eder)
  const topCur = { ...top };
  // fpPitch: göz görüşünde yukarı/aşağı bakış (v77)
  const self = { x: SPAWN.x, z: SPAWN.z, camYaw: 0, camPitch: 0.34, camDist: 4.8, fpPitch: -0.12, seat: null, fig: null, target: null, stuckT: 0, lastD: 0 };
  const keys = {};
  const others = new Map();
  let disposed = false;
  let musicItemId = null;

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
  // --- v77: bölme duvarlarına duvar eşyası takma ----------------------------------
  // Duvar eşyaları (TV, raf, saat, garaj kapısı…) odanın 4 duvarının yanında
  // bölme duvarlarının iki yüzüne de takılır. Yüzeyler: düz bölmelerde tüm boy,
  // kapılı bölmede kapı boşluğu hariç iki parça. Cam bölmeye takılmaz.
  const DIV_FACE = 0.075; // bölme kalınlığının yarısı + pay
  const DIVIDER_SEGS = { wall2: [[-1, 1]], wall4: [[-2, 2]], walldoor: [[-1.2, -0.42], [0.42, 1.2]] };
  const isDivider = (k) => Boolean(DIVIDER_SEGS[k]);
  const toLocal = (div, x, z) => {
    const th = (div.r || 0) * (Math.PI / 4);
    const c = Math.cos(th);
    const s2 = Math.sin(th);
    const dx = x - div.x;
    const dz = z - div.z;
    return { lx: dx * c - dz * s2, lz: dx * s2 + dz * c };
  };
  const toWorld = (div, lx, lz) => {
    const th = (div.r || 0) * (Math.PI / 4);
    const c = Math.cos(th);
    const s2 = Math.sin(th);
    return { x: div.x + lx * c + lz * s2, z: div.z - lx * s2 + lz * c };
  };
  // Eşya bir bölme yüzüne takılıysa o bölme ve yerel konumu
  function attachedWallItems(divData) {
    const out = [];
    const segs = DIVIDER_SEGS[divData.k];
    if (!segs) return out;
    objs.forEach((e) => {
      if (!CATALOG_MAP[e.data.k]?.wall) return;
      const { lx, lz } = toLocal(divData, e.data.x, e.data.z);
      if (Math.abs(Math.abs(lz) - (DIV_FACE + 0.005)) > 0.03) return;
      if (!segs.some(([a0, a1]) => lx >= a0 - 0.05 && lx <= a1 + 0.05)) return;
      out.push({ e, lx, lz, dr: ((((e.data.r || 0) - (divData.r || 0)) % 8) + 8) % 8 });
    });
    return out;
  }
  function moveAttached(divData, list) {
    list.forEach(({ e, lx, lz, dr }) => {
      const w = toWorld(divData, lx, lz);
      e.data.x = w.x;
      e.data.z = w.z;
      e.data.r = ((divData.r || 0) + dr) % 8;
      applyTransform(e);
    });
  }
  function snapToWall(data) {
    const dists = [data.z + D / 2, W / 2 - data.x, D / 2 - data.z, data.x + W / 2];
    let wi = 0;
    dists.forEach((d, i) => {
      if (d < dists[wi]) wi = i;
    });
    const half = CATALOG_MAP[data.k]?.wallW || 0.45;
    // en yakın bölme yüzü (oda duvarından daha yakınsa oraya takılır)
    let best = null;
    objs.forEach((e) => {
      const segs = DIVIDER_SEGS[e.data.k];
      if (!segs || e.data.i === data.i) return;
      const { lx, lz } = toLocal(e.data, data.x, data.z);
      segs.forEach(([a0, a1]) => {
        if (a1 - a0 < half * 2 - 0.01) return; // eşya bu parçaya sığmıyor
        const cx = clamp(lx, a0 + half, a1 - half);
        const side = lz >= 0 ? 1 : -1;
        const d = Math.hypot(lx - cx, lz - side * DIV_FACE);
        if (d < 1.2 && (!best || d < best.d)) best = { d, div: e.data, cx, side };
      });
    });
    if (best && best.d < dists[wi]) {
      const w = toWorld(best.div, best.cx, best.side * (DIV_FACE + 0.005));
      Object.assign(data, { x: w.x, z: w.z, r: (((best.div.r || 0) + (best.side > 0 ? 0 : 4)) % 8 + 8) % 8 });
      return;
    }
    const m = Math.max(0.9, half);
    if (wi === 0) Object.assign(data, { z: -D / 2 + 0.005, r: 0, x: clamp(data.x, -W / 2 + m, W / 2 - m) });
    if (wi === 2) Object.assign(data, { z: D / 2 - 0.005, r: 4, x: clamp(data.x, -W / 2 + m, W / 2 - m) });
    if (wi === 3) Object.assign(data, { x: -W / 2 + 0.005, r: 2, z: clamp(data.z, -D / 2 + m, D / 2 - m) });
    if (wi === 1) Object.assign(data, { x: W / 2 - 0.005, r: 6, z: clamp(data.z, -D / 2 + m, D / 2 - m) });
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
  const sigOf = (d) => `${d.k}|${d.c || 0}|${d.p === 1 ? 1 : 0}`;
  function buildEntry(data) {
    const obj = buildItem(data.k, { ti: data.c || 0, live: !snapshot, wallMat: dividerMat, H });
    if (!obj) return null;
    const isOwned = data.p === 1;
    const ctl = obj.userData.ctl;
    if (!isOwned) {
      ghostify(obj);
      if (ctl?.setOn) ctl.setOn(false);
    }
    obj.traverse((o) => {
      o.userData.itemId = data.i;
    });
    obj.userData.itemId = data.i;
    scene.add(obj);
    const entry = { obj, data: { ...data }, sig: sigOf(data) };
    applyTransform(entry);
    if (isOwned && ctl?.setOn && typeof data.o === 'boolean') ctl.setOn(data.o);
    if (isOwned && data.k === 'jukebox' && ctl?.setOn) ctl.setOn(musicItemId === data.i);
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
      if (e && e.sig === sigOf(d)) {
        e.data = { ...d };
        applyTransform(e);
        const ctl = e.obj.userData.ctl;
        if (d.p === 1 && ctl?.setOn && typeof d.o === 'boolean' && ctl.on !== d.o) ctl.setOn(d.o);
      } else {
        if (e) removeEntry(d.i);
        const ne = buildEntry(d);
        if (ne) objs.set(d.i, ne);
      }
    });
    [...objs.keys()].forEach((id) => {
      if (!seen.has(id)) removeEntry(id);
    });
    if (selectedId && !objs.has(selectedId)) select(null);
    if (self.seat && !isUsable(self.seat.id)) self.seat = null;
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
  const isUsable = (id) => objs.get(id)?.data.p === 1;

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

  const overhead = () => mode === 'build' || view === '2d';
  function updateWalls() {
    const p = camera.position;
    walls.forEach((w) => {
      let hide = false;
      // kuş bakışında duvara yakınken, 3D gezide ise kamera duvarın
      // arkasına geçince o duvar kesilir (Sims tarzı) — oyuncu hep görünür.
      const m = overhead() ? 0.5 : -0.05;
      if (w.i === 0) hide = p.z < -D / 2 + m;
      if (w.i === 2) hide = p.z > D / 2 - m;
      if (w.i === 3) hide = p.x < -W / 2 + m;
      if (w.i === 1) hide = p.x > W / 2 - m;
      if (hide !== w.hidden) {
        w.hidden = hide;
        w.full.visible = !hide;
        w.stub.visible = hide;
      }
    });
    objs.forEach((e) => {
      const def = CATALOG_MAP[e.data.k];
      if (!def?.wall) return;
      // v77: sadece dış duvardakiler o duvarla birlikte gizlenir (bölme duvarındakiler değil)
      const onOuter = Math.abs(e.data.z + D / 2) < 0.05 || Math.abs(e.data.z - D / 2) < 0.05 || Math.abs(e.data.x + W / 2) < 0.05 || Math.abs(e.data.x - W / 2) < 0.05;
      e.obj.visible = !onOuter || !walls[wallIndexForRot(e.data.r)].hidden;
    });
    const showCeil = !overhead();
    ceiling.visible = showCeil;
    ceilLights.forEach((o) => {
      if (o.isMesh) o.visible = showCeil;
    });
  }

  // --- v77: kamera ile karakter arasındaki eşyalar/duvarlar yarı saydam -------------
  // Sadece 3D gezide: kameradan karakterin göğsüne ve başına giden çizgiyi kesen
  // eşyalar (bölme duvarları, dolaplar…) saydamlaşır; karakter hep görünür.
  const fadeMatCache = new WeakMap();
  const fadedMat = (m) => {
    if (!m) return m;
    let f = fadeMatCache.get(m);
    if (!f) {
      f = m.clone();
      f.transparent = true;
      f.opacity = Math.min(m.opacity ?? 1, 0.22);
      f.depthWrite = false;
      fadeMatCache.set(m, f);
      owned.push(f);
    }
    return f;
  };
  function setFaded(e, on) {
    if (Boolean(e.faded) === on) return;
    e.faded = on;
    e.obj.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        o.userData.origMat = o.material;
        o.material = Array.isArray(o.material) ? o.material.map(fadedMat) : fadedMat(o.material);
      } else if (o.userData.origMat) {
        o.material = o.userData.origMat;
        delete o.userData.origMat;
      }
    });
  }
  const fadeRay = new THREE.Raycaster();
  const fadeTo = new THREE.Vector3();
  const fadeDir = new THREE.Vector3();
  let fadeTimer = 0;
  function updateOccluders(dt) {
    fadeTimer -= dt;
    if (fadeTimer > 0) return;
    fadeTimer = 0.12;
    const active = mode === 'walk' && view === '3d' && !paused;
    const hit = new Set();
    if (active) {
      const sw = self.seat ? seatWorld(self.seat, new THREE.Vector3()) : null;
      const px = sw ? sw.x : self.x;
      const pz = sw ? sw.z : self.z;
      const base = sw ? sw.y : 0;
      const list = [];
      objs.forEach((e) => {
        if (e.data.p === 1 || canEdit) list.push(e.obj);
      });
      [0.9, 1.5].forEach((hy) => {
        fadeTo.set(px, base + hy, pz);
        fadeDir.subVectors(fadeTo, camera.position);
        const far = fadeDir.length() - 0.35;
        if (far <= 0.05) return;
        fadeRay.set(camera.position, fadeDir.normalize());
        fadeRay.far = far;
        fadeRay.intersectObjects(list, true).forEach((h) => {
          let o = h.object;
          while (o && !o.userData?.itemId && o.parent) o = o.parent;
          const id = o?.userData?.itemId;
          if (id && id !== self.seat?.id) hit.add(id);
        });
      });
    }
    objs.forEach((e, id) => setFaded(e, hit.has(id)));
  }

  let lightTimer = 0;
  const lp = new THREE.Vector3();
  function updateLightPool(focus) {
    const list = [];
    objs.forEach((e) => {
      const ctl = e.obj.userData.ctl;
      if (!ctl?.light || !ctl.on || !e.obj.visible || e.data.p !== 1) return;
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

  // --- Çarpışma ------------------------------------------------------------------
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

  const seatStand = (seat) => Boolean(seat && CATALOG_MAP[objs.get(seat.id)?.data.k]?.stand);
  // v77 — duşakabin: içinde biri varken su akar
  function updateShowers() {
    objs.forEach((e) => {
      const ctl = e.obj.userData.ctl;
      if (!ctl?.setRunning) return;
      const busy = (self.seat?.id === e.data.i && mode === 'walk') || [...others.values()].some((o) => o.seat?.id === e.data.i);
      if (ctl.running !== busy) ctl.setRunning(busy);
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

  // --- Etkileşim --------------------------------------------------------------------
  let currentInteract = null;
  let gymTask = null;
  function actionsFor(e) {
    const def = CATALOG_MAP[e.data.k];
    const ctl = e.obj.userData.ctl;
    const acts = [];
    if (def.seats?.length) acts.push({ kind: 'sit', label: def.stand ? '🚿 Duş al' : def.cat === 'araba' ? '🚗 Arabaya bin' : def.cat === 'motor' ? '🏍️ Motora bin' : '🪑 Otur' });
    if (def.game) acts.push({ kind: 'panel', panel: 'arcade', label: '🎮 Oyna', deviceId: e.data.i });
    // v77: piyanoya oturunca çal (aynı anda tek kişi — HouseScreen/pianoNet)
    if (e.data.k === 'piano' && self.seat?.id === e.data.i) acts.push({ kind: 'panel', panel: 'piano', label: '🎹 Çal' });
    if (def.panel === 'jukebox') acts.push({ kind: 'panel', panel: 'jukebox', label: '🎵 Müzik' });
    if (def.panel === 'atm') acts.push({ kind: 'panel', panel: 'atm', label: '🏧 Parara Bank' });
    if (!def.panel && ctl?.act && !ctl.noToggle) acts.push({ kind: 'toggle', label: ctl.act });
    (def.takes || []).forEach((product) => {
      const p = HOUSE_PRODUCTS[product];
      if (p) acts.push({ kind: 'take', product, label: `${p.emoji} ${p.label} al` });
    });
    // v77: spor salonu — aktif görevin aletinde "⭐ Görev"
    if (gymTask && e.data.k === gymTask && e.data.p === 1) acts.unshift({ kind: 'gym', equipment: gymTask, label: '⭐ Görev' });
    // v77: aletler üyeliksiz de kullanılır (serbest çalışma; güç kazandırmaz)
    else if (GYM_FREE_KEYS.includes(e.data.k) && e.data.p === 1) acts.push({ kind: 'gymfree', equipment: e.data.k, label: '💪 Serbest çalış' });
    return acts;
  }
  function findInteract() {
    if (mode !== 'walk') return null;
    if (self.seat) {
      const e = objs.get(self.seat.id);
      if (!e) return null;
      const acts = [{ kind: 'sit', label: CATALOG_MAP[e.data.k].stand ? '🚪 Duştan çık' : '⬆️ Kalk' }, ...actionsFor(e).filter((a) => a.kind !== 'sit')];
      // v75 — konsolun/bilgisayarın karşısındaki koltukta oturuyorsan oradan da oyna
      if (!acts.some((a) => a.panel === 'arcade')) {
        const sp = seatWorld(self.seat, new THREE.Vector3());
        // v77: en yakın oyun cihazı (internet kafede cihaz doluluğu/ödemesi için)
        let near = null;
        let nd = 3.2;
        if (sp) {
          objs.forEach((o) => {
            if (!CATALOG_MAP[o.data.k]?.game || o.data.p !== 1) return;
            const d = Math.hypot(o.data.x - sp.x, o.data.z - sp.z);
            if (d < nd) {
              nd = d;
              near = o;
            }
          });
        }
        if (near) acts.push({ kind: 'panel', panel: 'arcade', label: '🎮 Oyna', deviceId: near.data.i });
      }
      // v80 — YAYIN: Oyuncu Koltuğu + yakınında Oyuncu Bilgisayarı / İnternet Kafe
      // İstasyonu (≤3,2 m, satın alınmış) → "🔴 Yayın aç"
      if (STREAM_CHAIR_KEYS.includes(e.data.k) && e.data.p === 1) {
        let pc = null;
        let pd = 3.2;
        objs.forEach((o) => {
          if (!STREAM_PC_KEYS.includes(o.data.k) || o.data.p !== 1) return;
          const d = Math.hypot(o.data.x - e.data.x, o.data.z - e.data.z);
          if (d <= pd) {
            pd = d;
            pc = o;
          }
        });
        if (pc) acts.push({ kind: 'stream', label: '🔴 Yayın aç', chairId: e.data.i, pcId: pc.data.i });
      }
      return { id: self.seat.id, name: CATALOG_MAP[e.data.k].name, actions: acts };
    }
    if (self.target) return null;
    let best = null;
    let bd = 1.25;
    const v = new THREE.Vector3();
    objs.forEach((e) => {
      const def = CATALOG_MAP[e.data.k];
      if (!def) return;
      const acts = e.data.p === 1 ? actionsFor(e) : [];
      if (!acts.length && e.data.p === 1) return;
      if (e.data.p !== 1 && !actionsFor(e).length) return;
      let d = Infinity;
      def.seats?.forEach((s) => {
        v.set(s[0], 0, s[2]);
        e.obj.localToWorld(v);
        d = Math.min(d, Math.hypot(v.x - self.x, v.z - self.z) - 0.35);
      });
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
      if (!boxes.length) {
        v.set(0, 0, def.wall ? 0.3 : 0);
        e.obj.localToWorld(v);
        d = Math.min(d, Math.hypot(v.x - self.x, v.z - self.z) - 0.25);
      }
      // oyuncunun dokunup yanına gittiği eşya, daha yakın başka eşya olsa da öncelikli
      const dd = e.data.i === self.focusId && d < 1.7 ? -1 : d;
      if (dd < bd) {
        bd = dd;
        best = { id: e.data.i, name: def.name, trial: e.data.p !== 1, actions: acts };
      }
    });
    return best;
  }

  // --- Girdi -----------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointers = new Map();
  let drag = null;
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
    objs.forEach((en) => {
      if (en.obj.visible) list.push(en.obj);
    });
    const hits = ray.intersectObjects(list, true);
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
  // v78: dokunulan noktada seçili eşya var mı? (önünde başka eşya olsa bile
  // ışın seçili eşyaya da değiyorsa ya da zemindeki izdüşümü seçili eşyanın
  // kutusunun içindeyse) — sürükleme sadece seçili eşyayı taşır.
  function hitsSelected(e) {
    if (!selectedId || !objs.has(selectedId)) return false;
    const en = objs.get(selectedId);
    setNdc(e);
    const hits = ray.intersectObject(en.obj, true);
    if (hits.length) return true;
    const fp = floorPoint(e);
    if (!fp) return false;
    const def = CATALOG_MAP[en.data.k];
    const boxes = def ? itemBoxes(def) : [];
    const ry = en.obj.rotation.y;
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const dx = fp.x - en.data.x;
    const dz = fp.z - en.data.z;
    return boxes.some(([bx, bz, hx, hz]) => {
      const lx = dx * c - dz * sn - bx;
      const lz = dx * sn + dz * c - bz;
      return Math.abs(lx) <= hx + 0.12 && Math.abs(lz) <= hz + 0.12;
    });
  }
  function pickPlayer(e) {
    setNdc(e);
    const planes = [];
    others.forEach((o) => {
      if (o.fig.plane.visible) planes.push(o.fig.plane);
    });
    const hit = ray.intersectObjects(planes, false)[0];
    return hit?.object.userData.playerUid || null;
  }

  // --- v77: yol bulma (ızgara üzerinde A*) ------------------------------------------
  // Dokunulan yere düz gitmek yerine eşyaların etrafından dolaşan en kısa yol
  // bulunur. Hedef bir eşyanın içindeyse ona en yakın boş noktaya gidilir.
  const PATH_CELL = 0.2;
  // engeller: eşya kutuları (dönüş + kabaca çevreleyen yarıçap; uzaktakiler hızla atlanır)
  let obstCache = null;
  function obstacles() {
    if (obstCache) return obstCache;
    const list = [];
    objs.forEach((e) => {
      const def = CATALOG_MAP[e.data.k];
      if (!def) return;
      const boxes = itemBoxes(def);
      if (!boxes.length) return;
      const ry = e.obj.rotation.y;
      let rad = 0;
      boxes.forEach(([bx, bz, hx, hz]) => (rad = Math.max(rad, Math.hypot(Math.abs(bx) + hx, Math.abs(bz) + hz))));
      list.push({ x: e.data.x, z: e.data.z, c: Math.cos(ry), s: Math.sin(ry), boxes, rad });
    });
    obstCache = list;
    return list;
  }
  function blockedAt(x, z, r = PLAYER_R * 0.92) {
    if (Math.abs(x) > W / 2 - r || Math.abs(z) > D / 2 - r) return true;
    for (const o of obstacles()) {
      const dx = x - o.x;
      const dz = z - o.z;
      if (Math.abs(dx) > o.rad + r || Math.abs(dz) > o.rad + r) continue;
      for (const [bx, bz, hx, hz] of o.boxes) {
        const lx = dx * o.c - dz * o.s - bx;
        const lz = dx * o.s + dz * o.c - bz;
        if (Math.abs(lx) < hx + r && Math.abs(lz) < hz + r) return true;
      }
    }
    return false;
  }
  function clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / (PATH_CELL * 0.5)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (blockedAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }
  function findPath(sx, sz, tx, tz) {
    obstCache = null; // eşyalar yer değiştirmiş olabilir
    const nx = Math.max(1, Math.floor(W / PATH_CELL));
    const nz = Math.max(1, Math.floor(D / PATH_CELL));
    const cx = (i) => -W / 2 + (i + 0.5) * (W / nx);
    const cz = (j) => -D / 2 + (j + 0.5) * (D / nz);
    const ci = (x) => clamp(Math.floor(((x + W / 2) / W) * nx), 0, nx - 1);
    const cj = (z) => clamp(Math.floor(((z + D / 2) / D) * nz), 0, nz - 1);
    const block = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) block[j * nx + i] = blockedAt(cx(i), cz(j)) ? 1 : 0;
    const start = cj(sz) * nx + ci(sx);
    let goal = cj(tz) * nx + ci(tx);
    let goalFree = !block[goal];
    if (!goalFree) {
      // hedefe en yakın boş hücre (genişleyen halka)
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < nx * nz; k++) {
        if (block[k]) continue;
        const d = Math.hypot(cx(k % nx) - tx, cz(Math.floor(k / nx)) - tz);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best < 0) return null;
      goal = best;
    }
    block[start] = 0; // oyuncu bir eşyaya yaslanmış olabilir
    if (start === goal) return [{ x: goalFree ? tx : cx(goal % nx), z: goalFree ? tz : cz(Math.floor(goal / nx)) }];
    const g = new Float32Array(nx * nz).fill(Infinity);
    const from = new Int32Array(nx * nz).fill(-1);
    const open = [start];
    const inOpen = new Uint8Array(nx * nz);
    const closed = new Uint8Array(nx * nz);
    const gi = goal % nx;
    const gj = Math.floor(goal / nx);
    const h = (k) => {
      const dx = Math.abs((k % nx) - gi);
      const dz = Math.abs(Math.floor(k / nx) - gj);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    const f = new Float32Array(nx * nz).fill(Infinity);
    g[start] = 0;
    f[start] = h(start);
    inOpen[start] = 1;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    let guard = 0;
    let nearK = start; // hedefe ulaşılamazsa (ör. etrafı duvarla kapalı) en yakın erişilebilir nokta
    let nearH = h(start);
    while (open.length && guard++ < 20000) {
      let bi = 0;
      for (let q = 1; q < open.length; q++) if (f[open[q]] < f[open[bi]]) bi = q;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      inOpen[cur] = 0;
      if (cur === goal) {
        found = true;
        break;
      }
      if (h(cur) < nearH) {
        nearH = h(cur);
        nearK = cur;
      }
      closed[cur] = 1;
      const i0 = cur % nx;
      const j0 = Math.floor(cur / nx);
      for (const [di, dj, cost] of DIRS) {
        const i1 = i0 + di;
        const j1 = j0 + dj;
        if (i1 < 0 || j1 < 0 || i1 >= nx || j1 >= nz) continue;
        const k = j1 * nx + i1;
        if (block[k] || closed[k]) continue;
        // çaprazda köşe kesme yok
        if (di && dj && (block[j0 * nx + i1] || block[j1 * nx + i0])) continue;
        const ng = g[cur] + cost;
        if (ng < g[k]) {
          g[k] = ng;
          from[k] = cur;
          f[k] = ng + h(k);
          if (!inOpen[k]) {
            inOpen[k] = 1;
            open.push(k);
          }
        }
      }
    }
    if (!found) {
      if (nearK === start || guard >= 20000) return null;
      goal = nearK;
      goalFree = false;
    }
    const cells = [];
    for (let k = goal; k !== -1 && k !== start; k = from[k]) cells.push({ x: cx(k % nx), z: cz(Math.floor(k / nx)) });
    cells.reverse();
    if (goalFree) cells[cells.length - 1] = { x: tx, z: tz };
    // yolu sadeleştir: görüş hattı olan noktaları atla
    const out = [];
    let ax = sx;
    let az = sz;
    let idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let q = cells.length - 1; q > idx; q--) {
        if (clearLine(ax, az, cells[q].x, cells[q].z)) {
          far = q;
          break;
        }
      }
      out.push(cells[far]);
      ax = cells[far].x;
      az = cells[far].z;
      idx = far + 1;
    }
    return out;
  }
  function walkTo(x, z) {
    if (self.seat) standUp();
    const tx = clamp(x, -W / 2 + PLAYER_R, W / 2 - PLAYER_R);
    const tz = clamp(z, -D / 2 + PLAYER_R, D / 2 - PLAYER_R);
    let path = null;
    try {
      path = findPath(self.x, self.z, tx, tz);
    } catch {
      path = null;
    }
    if (!path || !path.length) path = [{ x: tx, z: tz }];
    self.path = path;
    self.target = self.path.shift();
    self.repaths = 0;
    self.stuckT = 0;
    self.lastD = Infinity;
    const end = path.length ? path[path.length - 1] : self.target;
    targetRing.position.set(end.x, 0.025, end.z);
    targetRing.visible = true;
  }
  function approachItem(id) {
    const e = objs.get(id);
    if (!e) return;
    const def = CATALOG_MAP[e.data.k];
    // en yakın oturma noktası ya da eşyanın kenarı
    const v = new THREE.Vector3();
    let best = null;
    let bd = Infinity;
    const cands = [];
    const box = def.box || (def.boxWall ? [def.boxWall[0], def.boxWall[1] * 2] : [0.4, 0.4]);
    // v78: oturma noktasının önü eşyanın kendi kutusunun içindeyse (ör. kafe
    // masasının yandaki sandalyeleri) yaklaşma noktası kutunun dışına, yana alınır.
    def.seats?.forEach((s) => {
      const fz = s[2] + 0.45;
      if (def.box && Math.abs(s[0]) < def.box[0] && Math.abs(fz) < def.box[1]) cands.push([Math.sign(s[0] || 1) * (def.box[0] + 0.45), s[2]]);
      else cands.push([s[0], fz]);
    });
    const bz = def.boxWall ? def.boxWall[1] : 0;
    const off = def.wall ? 0.75 : 0.5;
    cands.push([0, bz + box[1] + off], [0, bz - box[1] - off], [box[0] + off, bz], [-box[0] - off, bz]);
    cands.forEach(([lx, lz]) => {
      v.set(lx, 0, lz);
      e.obj.localToWorld(v);
      if (Math.abs(v.x) > W / 2 - PLAYER_R || Math.abs(v.z) > D / 2 - PLAYER_R) return;
      const d = Math.hypot(v.x - self.x, v.z - self.z);
      if (d < bd) {
        bd = d;
        best = v.clone();
      }
    });
    self.focusId = id;
    if (best) walkTo(best.x, best.z);
  }
  function handleWalkTap(e) {
    const pu = pickPlayer(e);
    if (pu) {
      onPlayerTap?.(pu);
      return;
    }
    const id = pickItem(e);
    if (id && !CATALOG_MAP[objs.get(id)?.data.k]?.flat) {
      // v80: sadece KULLANILABİLEN eşyaya (oturulan, oynanan, alınan…) ya da
      // henüz satın alınmamış eşyaya dokununca ona yürü. Duvar, bölme, dolap gibi
      // kullanılmayan bir engel önüne geçmişse dokunuş arkasındaki zemine sayılır
      // ve yol bulma engelin etrafından dolaşır (kenar duvarlarındaki gibi).
      const en = objs.get(id);
      if (en.data.p !== 1 || actionsFor(en).length) {
        approachItem(id);
        return;
      }
    }
    const fp = floorPoint(e);
    if (fp) {
      self.focusId = null;
      walkTo(fp.x, fp.z);
    }
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (drag?.type === 'item') emitDesign();
      drag = null;
      return;
    }
    if (mode === 'build') {
      // v78: önce dokunarak seç, sonra sürükle. Seçili eşyanın üstünden başlayan
      // sürükleme onu taşır; başka bir eşyanın üstünden başlayan sürükleme sadece
      // kamerayı çevirir (kısa dokunuş o eşyayı seçer).
      if (canEdit && hitsSelected(e)) drag = { type: 'itemCandidate', id: selectedId, moved: 0, canMove: true };
      else {
        const id = pickItem(e);
        if (id && canEdit) drag = { type: 'itemCandidate', id, moved: 0, canMove: false, orbitType: e.button === 2 ? 'pan' : 'orbit' };
        else drag = { type: e.button === 2 ? 'pan' : 'orbit', moved: 0, tapEmpty: true };
      }
    } else {
      drag = { type: 'look', moved: 0, tap: true };
    }
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
      const ratio = pinch.d / Math.max(d, 1);
      if (mode === 'build') {
        orbit.dist = clamp(orbit.dist * ratio, 5, 38);
        panBy(mx - pinch.mx, my - pinch.my);
      } else if (view === '2d') top.dist = clamp(top.dist * ratio, 6, 32);
      else if (view !== 'fp') self.camDist = clamp(self.camDist * ratio, 1.8, 8);
      pinch = { d, mx, my };
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.type === 'itemCandidate' && drag.moved > 6 && !drag.canMove) {
      // seçili olmayan eşya: taşınmaz, kamera döner
      drag = { type: drag.orbitType || 'orbit', moved: drag.moved };
    }
    if (drag.type === 'itemCandidate' && drag.moved > 6) {
      const e0 = objs.get(drag.id);
      if (!e0) {
        drag = null;
        return;
      }
      pushUndo();
      if (selectedId !== drag.id) select(drag.id);
      const fp = floorPoint(e);
      drag = { type: 'item', id: drag.id, off: fp ? { x: e0.data.x - fp.x, z: e0.data.z - fp.z } : { x: 0, z: 0 }, moved: drag.moved, attached: isDivider(e0.data.k) ? attachedWallItems(e0.data) : null };
    }
    if (drag.type === 'item') {
      const en = objs.get(drag.id);
      const fp = floorPoint(e);
      if (en && fp) {
        en.data.x = fp.x + drag.off.x;
        en.data.z = fp.z + drag.off.z;
        normalizePlacement(en.data);
        applyTransform(en);
        if (drag.attached?.length) moveAttached(en.data, drag.attached); // bölmeyle birlikte üstündekiler
        updateSelectionVisual();
      }
    } else if (drag.type === 'orbit' && drag.moved > 4) {
      orbit.az -= dx * 0.006;
      orbit.el = clamp(orbit.el + dy * 0.005, 0.2, 1.45);
    } else if (drag.type === 'pan') {
      panBy(dx, dy);
    } else if (drag.type === 'look' && drag.moved > 6) {
      if (view === '2d') {
        top.az -= dx * 0.006;
        top.el = clamp(top.el + dy * 0.004, 0.55, 1.45);
      } else if (view === 'fp') {
        // göz görüşü: parmak hangi yöne kayarsa o yöne dönülür (sağa kaydır → sağa dön)
        self.camYaw -= dx * 0.005;
        self.fpPitch = clamp(self.fpPitch - dy * 0.004, -1.2, 1.0);
      } else {
        self.camYaw -= dx * 0.006;
        self.camPitch = clamp(self.camPitch + dy * 0.004, -0.25, 1.1);
      }
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
    else if (drag.type === 'item') emitDesign();
    else if (drag.tapEmpty && drag.moved <= 6 && mode === 'build') select(null);
    else if (drag.type === 'look' && drag.moved <= 8 && e.type === 'pointerup') handleWalkTap(e);
    drag = null;
  }
  function onWheel(e) {
    e.preventDefault();
    if (mode === 'build') orbit.dist = clamp(orbit.dist + e.deltaY * 0.012, 5, 38);
    else if (view === '2d') top.dist = clamp(top.dist + e.deltaY * 0.01, 6, 32);
    else if (view !== 'fp') self.camDist = clamp(self.camDist + e.deltaY * 0.004, 1.8, 8);
  }
  const onKeyDown = (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys[e.code] = true;
    if (mode === 'build' && canEdit) {
      if (e.code === 'KeyR') api.rotateSelected(1);
      if (e.code === 'Delete') api.deleteSelected();
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) api.undo();
    }
  };
  const onKeyUp = (e) => {
    keys[e.code] = false;
  };
  const onCtx = (e) => e.preventDefault();
  if (!snapshot && !spectate) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  // --- Boyut --------------------------------------------------------------------
  let sized = false;
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    if (!sized && w > 50 && h > 50) {
      sized = true;
      if (w / h < 0.8) Object.assign(orbit, { az: Math.PI / 2 + 0.3, el: 1.05, dist: 27 });
      else Object.assign(orbit, { az: 0.35, el: 0.95, dist: 20 });
      Object.assign(orbitCur, orbit);
      if (w / h < 0.8) Object.assign(top, { dist: 15 });
      Object.assign(topCur, top);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = snapshot ? null : new ResizeObserver(resize);
  ro?.observe(container);
  resize();

  // --- Ana döngü ----------------------------------------------------------------
  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 12, 18);
  const head = new THREE.Vector3();
  const seatV = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  let raf = 0;
  let firstFrame = true;
  let lastInteractKey = '';
  let paused = false;

  function stepWalk(dt) {
    let f = 0;
    let s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
    const manual = Math.hypot(f, s) > 0;
    const fig = self.fig;
    if (manual && self.target) {
      self.path = null;
      self.target = null;
      targetRing.visible = false;
    }
    if (self.seat) {
      if (manual) standUp();
      else {
        if (fig) fig.moving = false;
        return;
      }
    }
    let vx = 0;
    let vz = 0;
    if (manual) {
      const mag = Math.hypot(f, s);
      f /= mag;
      s /= mag;
      const yaw = view === '2d' ? topCur.az : self.camYaw;
      vx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * WALK_SPEED * dt;
      vz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * WALK_SPEED * dt;
    } else if (self.target) {
      const dx = self.target.x - self.x;
      const dz = self.target.z - self.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12 && self.path?.length) {
        // sıradaki ara noktaya geç
        self.target = self.path.shift();
        self.lastD = Infinity;
        self.stuckT = 0;
      } else if (d < 0.12) {
        self.target = null;
        self.path = null;
        targetRing.visible = false;
      } else {
        const step = Math.min(d, WALK_SPEED * dt);
        vx = (dx / d) * step;
        vz = (dz / d) * step;
        // takılma kontrolü (eşyaya çarpıp ilerleyemiyorsa dur)
        if (d > self.lastD - 0.004) self.stuckT += dt;
        else self.stuckT = 0;
        self.lastD = d;
        if (self.stuckT > 0.5) {
          // takıldıysa bulunduğu yerden yolu bir kez daha hesapla, olmazsa dur
          const end = self.path?.length ? self.path[self.path.length - 1] : self.target;
          if ((self.repaths || 0) < 2 && end) {
            const tries = (self.repaths || 0) + 1;
            walkTo(end.x, end.z);
            self.repaths = tries;
          } else {
            self.target = null;
            self.path = null;
            targetRing.visible = false;
          }
        }
      }
    }
    const moving = Math.hypot(vx, vz) > 0.0005;
    if (moving) {
      self.x += vx;
      self.z += vz;
      collide(self);
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      const sx = vx * camRight.x + vz * camRight.z;
      if (fig && Math.abs(sx) > 0.0008) fig.facingLeft = sx < 0;
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
      const v = new THREE.Vector3(sp[0], 0, sp[2] + 0.75);
      if (def.cat === 'araba' || def.cat === 'motor') v.set((def.box?.[0] ?? 0.5) + 0.6, 0, sp[2]);
      e.obj.localToWorld(v);
      self.x = v.x;
      self.z = v.z;
      collide(self);
    }
  }

  let fixedPose = null; // v80: yayın kamerası
  function placeCamera(dt) {
    if (fixedPose) {
      if (camera.fov !== fixedPose.fov) {
        camera.fov = fixedPose.fov;
        camera.updateProjectionMatrix();
      }
      camPos.set(fixedPose.px, fixedPose.py, fixedPose.pz);
      camera.position.copy(camPos);
      camera.lookAt(fixedPose.tx, fixedPose.ty, fixedPose.tz);
      focus.set(fixedPose.tx, 1, fixedPose.tz);
      return;
    }
    if (mode === 'build') {
      const k = 1 - Math.exp(-dt * 9);
      Object.keys(orbit).forEach((key) => {
        orbitCur[key] += (orbit[key] - orbitCur[key]) * k;
      });
      camTarget.set(orbitCur.tx, 0.4, orbitCur.tz);
      const asp = camera.aspect || 1;
      const od = orbitCur.dist * (asp < 1 ? 1 + (1 - asp) * 0.7 : 1);
      camPos.set(
        camTarget.x + Math.sin(orbitCur.az) * Math.cos(orbitCur.el) * od,
        camTarget.y + Math.sin(orbitCur.el) * od,
        camTarget.z + Math.cos(orbitCur.az) * Math.cos(orbitCur.el) * od
      );
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      focus.copy(camTarget);
      return;
    }
    const sw = self.seat ? seatWorld(self.seat, seatV) : null;
    const px = sw ? sw.x : self.x;
    const pz = sw ? sw.z : self.z;
    if (view === '2d') {
      const k = firstFrame ? 1 : 1 - Math.exp(-dt * 8);
      Object.keys(top).forEach((key) => {
        topCur[key] += (top[key] - topCur[key]) * k;
      });
      // oyuncuyu takip et ama görüntü odanın dışına taşmasın (boş siyah alan kalmaz)
      const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const halfW = tv * (camera.aspect || 1) * topCur.dist;
      const halfD = (tv * topCur.dist) / Math.max(0.5, Math.sin(topCur.el));
      const lim = (v, half, room) => (half >= room / 2 ? 0 : clamp(v, -room / 2 + half, room / 2 - half));
      // v70: görünür alanın döndürülmüş kutusu SÜREKLİ hesaplanır (eskiden 45°'de
      // eksen değiştiriyordu → açı değiştirirken görüntü sıçrıyordu)
      const ca = Math.abs(Math.cos(topCur.az));
      const sa = Math.abs(Math.sin(topCur.az));
      const tx = lim(px, ca * halfW + sa * halfD, W);
      const tz = lim(pz, sa * halfW + ca * halfD, D);
      // hedef yumuşak takip edilir; kamera konumu açıdan DOĞRUDAN hesaplanır
      // (çift yumuşatma döndürürken yakınlaşıp uzaklaşma/titreme yapıyordu)
      const kt = firstFrame ? 1 : 1 - Math.exp(-dt * 10);
      camTarget.set(camTarget.x + (tx - camTarget.x) * kt, 0.6, camTarget.z + (tz - camTarget.z) * kt);
      camPos.set(
        camTarget.x + Math.sin(topCur.az) * Math.cos(topCur.el) * topCur.dist,
        0.6 + Math.sin(topCur.el) * topCur.dist,
        camTarget.z + Math.cos(topCur.az) * Math.cos(topCur.el) * topCur.dist
      );
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      focus.set(px, 1, pz);
      return;
    }
    if (view === 'fp') {
      // v77 — göz görüşü: kamera karakterin göz hizasında, baktığı yöne
      const ey = sw ? (seatStand(self.seat) ? sw.y + 1.62 : sw.y + 1.05) : 1.62;
      const fy = self.camYaw;
      const fpch = self.fpPitch;
      camPos.set(px, ey, pz);
      camera.position.copy(camPos);
      camera.lookAt(px - Math.sin(fy) * Math.cos(fpch), ey + Math.sin(fpch), pz - Math.cos(fy) * Math.cos(fpch));
      focus.set(px, 1, pz);
      return;
    }
    const eyeY = sw ? sw.y + 1.0 : 1.55;
    const yaw = self.camYaw;
    const pitch = self.camPitch;
    // dikey (telefon) ekranda yatay görüş dar → kamera biraz geri çekilir
    const aspect = camera.aspect || 1;
    const dist = self.camDist * (aspect < 1 ? 1 + (1 - aspect) * 0.55 : 1);
    const want = new THREE.Vector3(px + Math.sin(yaw) * Math.cos(pitch) * dist, eyeY + Math.sin(pitch) * dist, pz + Math.cos(yaw) * Math.cos(pitch) * dist);
    want.x = clamp(want.x, -W / 2 - 3.5, W / 2 + 3.5);
    want.z = clamp(want.z, -D / 2 - 3.5, D / 2 + 3.5);
    want.y = clamp(want.y, 0.4, H - 0.2);
    camPos.lerp(want, firstFrame ? 1 : 1 - Math.exp(-dt * 12));
    camera.position.copy(camPos);
    camera.lookAt(px, eyeY - 0.15, pz);
    focus.set(px, 1, pz);
  }

  function frame(dt) {
    const t = clock.elapsedTime;
    const now = performance.now();
    updateShowers();
    objs.forEach((e) => {
      if (e.data.p === 1) e.obj.userData.ctl?.tick?.(t, dt);
    });
    if (mode === 'walk') stepWalk(dt);
    placeCamera(dt);
    updateOccluders(dt);
    firstFrame = false;
    updateWalls();
    if (targetRing.visible) targetRing.scale.setScalar(1 + Math.sin(t * 6) * 0.12);

    if (self.fig) {
      const sw = self.seat ? seatWorld(self.seat, seatV) : null;
      self.fig.update(dt, camera, now, sw ? sw.clone() : null, seatStand(self.seat));
      // v81: yayın kamerası açıkken (göz görüşünde bile) kendi avatarın görünür
      const selfVis = mode === 'walk' && (view !== 'fp' || Boolean(fixedPose));
      self.fig.group.visible = selfVis;
      if (self.fig.label) self.fig.label.style.display = selfVis ? '' : 'none';
    }
    others.forEach((o) => {
      const sw = o.seat && isUsable(o.seat.id) ? seatWorld(o.seat, new THREE.Vector3()) : null;
      o.fig.update(dt, camera, now, sw, seatStand(o.seat));
    });

    lightTimer -= dt;
    if (lightTimer <= 0) {
      lightTimer = 0.3;
      updateLightPool(focus);
    }

    const it = findInteract();
    const key = it ? `${it.id}|${it.trial ? 1 : 0}|${it.actions.map((a) => a.label).join(',')}` : '';
    if (key !== lastInteractKey) {
      lastInteractKey = key;
      currentInteract = it;
      onInteractChange?.(it);
    }

    renderer.render(scene, camera);

    if (labelLayer) {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      const place = (fig) => {
        if (!fig.label) return;
        if (!fig.group.visible) return;
        fig.headWorld(head);
        head.project(camera);
        const vis = head.z < 1 && Math.abs(head.x) < 1.2 && Math.abs(head.y) < 1.2;
        fig.label.style.visibility = vis ? 'visible' : 'hidden';
        if (vis) fig.label.style.transform = `translate(${((head.x + 1) / 2) * rw}px, ${((1 - head.y) / 2) * rh}px) translate(-50%, -100%)`;
      };
      if (self.fig) place(self.fig);
      others.forEach((o) => place(o.fig));
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (document.hidden || paused || renderer.__lost) return;
    frame(dt);
  }

  // --- v71 — fotoğraf: WebGL karesi + isim/balon etiketleri tek görselde --------
  function rrect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function wrapText(ctx, text, maxW) {
    const lines = [];
    let cur = '';
    const push = (w) => {
      // tek başına sığmayan uzun kelimeler harf harf bölünür
      let word = w;
      while (ctx.measureText(word).width > maxW && word.length > 1) {
        let i = word.length - 1;
        while (i > 1 && ctx.measureText(word.slice(0, i)).width > maxW) i--;
        if (cur) {
          lines.push(cur);
          cur = '';
        }
        lines.push(word.slice(0, i));
        word = word.slice(i);
      }
      const t = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(t).width > maxW) {
        lines.push(cur);
        cur = word;
      } else cur = t;
    };
    String(text).split(/\s+/).filter(Boolean).forEach(push);
    if (cur) lines.push(cur);
    return lines.slice(0, 6);
  }
  function drawFigLabels(ctx, W, H, s, minY = 0) {
    const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const figs = [];
    if (self.fig) figs.push(self.fig);
    others.forEach((o) => figs.push(o.fig));
    const v = new THREE.Vector3();
    const list = [];
    const now = performance.now();
    figs.forEach((fig) => {
      if (!fig.group.visible || !fig.plane.visible) return;
      fig.headWorld(v);
      const d = v.distanceTo(camera.position);
      v.project(camera);
      if (!(v.z < 1) || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return;
      list.push({ fig, d, x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H });
    });
    list.sort((a, b) => b.d - a.d); // uzaktan yakına: yakındakiler üstte
    list.forEach(({ fig, x, y: y0 }) => {
      let y = y0;
      // isim
      const name = fig.name;
      const held = fig.holding ? heldCanvas(fig.holding) : null;
      const iw = held ? 15 * s : 0;
      ctx.font = `700 ${11 * s}px ${font}`;
      const nw = ctx.measureText(name).width + 16 * s + iw;
      const nh = 17 * s;
      // v72 — etiket+balon yığını kadrajın üstünden taşarsa aşağı itilir (kesilmesin)
      const bubbles = fig.bubbles.filter((b) => b.text && now <= b.until);
      ctx.font = `${13 * s}px ${font}`;
      const lh = 13 * 1.3 * s;
      const laid = bubbles.map((b, i) => {
        const lines = wrapText(ctx, b.text, 170 * s);
        return { lines, bw: Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20 * s, bh: lines.length * lh + 12 * s, gap: (i === bubbles.length - 1 ? 10 : 4) * s };
      });
      const stackH = nh + laid.reduce((a, l) => a + l.bh + l.gap, 0);
      if (y - stackH < minY + 4 * s) y = minY + 4 * s + stackH;
      ctx.font = `700 ${11 * s}px ${font}`;
      let top = y - nh;
      rrect(ctx, x - nw / 2, top, nw, nh, nh / 2);
      ctx.fillStyle = 'rgba(8,10,18,0.72)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, s);
      ctx.strokeStyle = fig.isSelf ? 'rgba(255,210,63,0.55)' : 'rgba(25,232,255,0.35)';
      ctx.stroke();
      ctx.fillStyle = fig.isSelf ? '#ffe9a8' : '#dff9ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x + iw / 2, top + nh / 2 + 0.5 * s);
      if (held) ctx.drawImage(held, x - nw / 2 + 5 * s, top + 1 * s, nh - 2 * s, nh - 2 * s);
      // balonlar (en yenisi altta, ismin hemen üstünde)
      ctx.font = `${13 * s}px ${font}`;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const { lines, bw, bh, gap } = laid[i];
        top = top - gap - bh;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 12 * s;
        ctx.shadowOffsetY = 4 * s;
        rrect(ctx, x - bw / 2, top, bw, bh, 12 * s);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
        if (i === bubbles.length - 1) {
          ctx.beginPath();
          ctx.moveTo(x - 6 * s, top + bh - 0.5);
          ctx.lineTo(x + 6 * s, top + bh - 0.5);
          ctx.lineTo(x, top + bh + 6 * s);
          ctx.closePath();
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
        ctx.fillStyle = '#151515';
        ctx.textBaseline = 'top';
        lines.forEach((l, j) => ctx.fillText(l, x, top + 6 * s + j * lh + 1.5 * s));
        ctx.textBaseline = 'middle';
      }
    });
  }
  // Son çizilen WebGL karesini 2D tuvale kopyalayıp etiketleri ekler (aynı
  // görev içinde çağrılmalı — tampon henüz temizlenmemişken).
  function composeShot(type, quality, s, square = false) {
    const W = canvas.width;
    const H = canvas.height;
    try {
      const c2 = document.createElement('canvas');
      c2.width = W;
      c2.height = H;
      const ctx = c2.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      try {
        drawFigLabels(ctx, W, H, s, square && H > W ? (H - W) / 2 : 0);
      } catch {
        /* etiket çizilemezse sadece kare */
      }
      if (square && W !== H) {
        const side = Math.min(W, H);
        const c3 = document.createElement('canvas');
        c3.width = side;
        c3.height = side;
        c3.getContext('2d').drawImage(c2, (W - side) / 2, (H - side) / 2, side, side, 0, 0, side, side);
        return c3.toDataURL(type, quality);
      }
      return c2.toDataURL(type, quality);
    } catch {
      return canvas.toDataURL(type, quality);
    }
  }

  // --- API ---------------------------------------------------------------------
  const api = {
    get mode() {
      return mode;
    },
    get view() {
      return view;
    },
    setMode(m) {
      if (!canEdit && m === 'build') return;
      mode = m;
      grid.visible = m === 'build';
      if (m === 'walk') {
        select(null);
        firstFrame = true;
      } else {
        self.target = null;
        self.path = null;
        targetRing.visible = false;
      }
      camera.fov = m === 'build' ? 52 : view === '2d' ? 50 : view === 'fp' ? 72 : 62;
      camera.updateProjectionMatrix();
      updateSelectionVisual();
    },
    setView(v) {
      view = v === '2d' ? '2d' : v === 'fp' ? 'fp' : '3d';
      if (view === 'fp') self.fpPitch = -0.12;
      firstFrame = true;
      if (view === '2d') {
        top.az = self.camYaw;
        topCur.az = top.az;
      }
      api.setMode(mode);
    },
    setPaused(p) {
      paused = !!p;
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
    getDesign() {
      return design;
    },
    addItem(k, ti = 0, { owned: isOwned = false } = {}) {
      if (!canEdit || !CATALOG_MAP[k]) return null;
      if (objs.size >= MAX_ITEMS) return 'limit';
      pushUndo();
      const data = { i: newItemId(), k, x: orbit.tx, z: orbit.tz, r: 0, c: ti || 0 };
      if (isOwned) data.p = 1;
      const def = CATALOG_MAP[k];
      if (!def.wall) {
        // v77: toplu ekleme (işletme "Hepsini al") için daha geniş boş yer araması
        const cand = [];
        for (let a = -5; a <= 5; a++) for (let b = -4; b <= 4; b++) cand.push([a, b]);
        cand.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
        for (const [a, b] of cand) {
          const x = orbit.tx + a * 1.5;
          const z = orbit.tz + b * 1.5;
          if (Math.abs(x) > W / 2 - 1 || Math.abs(z) > D / 2 - 1) continue;
          let free = true;
          objs.forEach((e) => {
            if (Math.hypot(e.data.x - x, e.data.z - z) < 1.2) free = false;
          });
          if (free) {
            data.x = x;
            data.z = z;
            break;
          }
        }
      } else {
        data.x = orbit.tx - Math.sin(orbit.az) * 20;
        data.z = orbit.tz - Math.cos(orbit.az) * 20;
      }
      normalizePlacement(data);
      const e = buildEntry(data);
      if (!e) return null;
      e.obj.scale.setScalar(0.01);
      objs.set(data.i, e);
      const grow = () => {
        if (disposed || !objs.has(data.i)) return;
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
      const att = isDivider(e.data.k) ? attachedWallItems(e.data) : null;
      e.data.r = ((((e.data.r || 0) + dir) % 8) + 8) % 8;
      applyTransform(e);
      if (att?.length) moveAttached(e.data, att);
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
      // kopya her zaman "deneme" olarak eklenir (satın alınmadan kullanılamaz)
      const data = { ...e.data, i: newItemId(), x: e.data.x + 0.75, z: e.data.z + 0.75 };
      delete data.p;
      delete data.o;
      normalizePlacement(data);
      const ne = buildEntry(data);
      objs.set(data.i, ne);
      select(data.i);
      emitDesign();
    },
    deleteSelected() {
      if (!selectedId || !canEdit) return;
      pushUndo();
      // v77: bölme kaldırılınca üstündeki duvar eşyaları da kalkar (kaydedince envantere döner)
      const sel = objs.get(selectedId);
      if (sel && isDivider(sel.data.k)) attachedWallItems(sel.data).forEach(({ e }) => removeEntry(e.data.i));
      removeEntry(selectedId);
      select(null);
      emitDesign();
    },
    removeTrials() {
      if (!canEdit) return;
      pushUndo();
      [...objs.values()].filter((e) => e.data.p !== 1).forEach((e) => removeEntry(e.data.i));
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
    setWall(key) {
      if (!canEdit) return;
      design = { ...design, wall: key };
      setSurfaces();
      onDesignChange?.(design);
    },
    setFloor(key) {
      if (!canEdit) return;
      design = { ...design, floor: key };
      setSurfaces();
      onDesignChange?.(design);
    },
    // v77: spor salonunda aktif görev aleti (null = yok)
    setGymTask(k) {
      gymTask = k || null;
      lastInteractKey = null;
    },
    // v77: en yakın k türü alete yürü
    approachNearest(k) {
      if (mode !== 'walk') return false;
      let best = null;
      let bd = Infinity;
      objs.forEach((e) => {
        if (e.data.k !== k || e.data.p !== 1) return;
        const d = Math.hypot(e.data.x - self.x, e.data.z - self.z);
        if (d < bd) {
          bd = d;
          best = e.data.i;
        }
      });
      if (!best) return false;
      approachItem(best);
      return true;
    },
    // v77: eşyanın yanına yürü (spor salonu görev ağacı → sıradaki alet)
    approach(id) {
      if (mode !== 'walk' || !objs.has(id)) return false;
      approachItem(id);
      return true;
    },
    // v77: kimliğiyle seç (önizleme/test ve ileride "eksik mobilyayı göster" için)
    selectById(id) {
      if (!canEdit || !objs.has(id)) return false;
      select(id);
      return true;
    },
    deselect() {
      select(null);
    },
    setOrbit(v) {
      Object.assign(orbit, v);
    },
    // sırayla: etkileşim butonu tıklandı
    interact(action) {
      const it = currentInteract;
      if (!it || !action) return null;
      const e = objs.get(it.id);
      if (!e || e.data.p !== 1) return null;
      if (action.kind === 'sit') {
        if (self.seat) {
          standUp();
          return { kind: 'sit' };
        }
        const def = CATALOG_MAP[e.data.k];
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
        if (best >= 0) {
          self.seat = { id: it.id, idx: best };
          self.target = null;
          targetRing.visible = false;
        }
        return { kind: 'sit' };
      }
      if (action.kind === 'toggle') {
        const ctl = e.obj.userData.ctl;
        ctl.setOn(!ctl.on);
        lightTimer = 0;
        if (canEdit) {
          e.data.o = ctl.on;
          emitDesign();
        }
        return { kind: 'toggle' };
      }
      if (action.kind === 'take') return { kind: 'take', itemId: it.id, product: action.product };
      if (action.kind === 'panel') return { kind: 'panel', panel: action.panel, itemId: action.deviceId || it.id };
      return null;
    },
    setMusic(itemId) {
      musicItemId = itemId || null;
      objs.forEach((e) => {
        if (e.data.k === 'jukebox' && e.data.p === 1) e.obj.userData.ctl?.setOn(e.data.i === musicItemId);
      });
      lightTimer = 0;
    },
    // --- oyuncular
    setSelf({ uid, name, avatar }) {
      if (!self.fig) {
        self.fig = new AvatarFigure(scene, labelLayer, { uid, name, avatar, isSelf: true });
        self.fig.x = self.x;
        self.fig.z = self.z;
      } else self.fig.setIdentity(name, avatar);
    },
    setSelfPos(x, z) {
      self.x = x;
      self.z = z;
      if (self.fig) {
        self.fig.x = x;
        self.fig.z = z;
      }
    },
    setSelfHolding(product) {
      self.fig?.setHolding(product);
    },
    emote(kind) {
      self.fig?.playEmote(kind);
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
          o = { fig: new AvatarFigure(scene, labelLayer, { uid: p.uid, name: p.displayName, avatar: p.avatar, isSelf: false }), emoteTs: p.emoteTs || 0 };
          o.fig.x = o.fig.tx = Number(p.x) || 0;
          o.fig.z = o.fig.tz = Number(p.z) || 0;
          others.set(p.uid, o);
        }
        o.fig.setIdentity(p.displayName, p.avatar);
        o.fig.tx = Number(p.x) || 0;
        o.fig.tz = Number(p.z) || 0;
        o.fig.facingLeft = !!p.left;
        o.fig.setHolding(p.holdingVisible || null);
        const [sid, sidx] = typeof p.seat === 'string' ? p.seat.split(':') : [];
        o.seat = sid ? { id: sid, idx: Number(sidx) || 0 } : null;
        if (p.emote && Number(p.emoteTs || 0) > o.emoteTs) {
          o.emoteTs = Number(p.emoteTs);
          if (Date.now() - o.emoteTs < EMOTE_MS) o.fig.playEmote(p.emote);
        }
      });
      [...others.keys()].forEach((uid) => {
        if (!seen.has(uid)) {
          others.get(uid).fig.dispose(scene);
          others.delete(uid);
        }
      });
    },
    hasOther(uid) {
      return others.has(uid);
    },
    say(uid, text) {
      if (uid === selfUid) self.fig?.say(text);
      else others.get(uid)?.fig.say(text);
    },
    // v80 — yayın kamerası (izleyici): { px,py,pz, tx,ty,tz, fov } | null
    // v81: yayıncının ana ekranında da kullanılır (yayın tüm ekranı kaplar);
    // kapatınca görünümün kendi görüş açısına dönülür.
    setFixedCamera(pose) {
      const had = Boolean(fixedPose);
      fixedPose = pose ? { fov: 64, ...pose } : null;
      if (had && !fixedPose && !spectate) {
        camera.fov = mode === 'build' ? 52 : view === '2d' ? 50 : view === 'fp' ? 72 : 62;
        camera.updateProjectionMatrix();
        firstFrame = true;
      }
    },
    // v80 — yayıncının kendi küçük önizlemesi: ana sahneyi yayın kamerasından
    // tek kare çizip hedef 2B tuvale kopyalar, sonra normal kareyi geri çizer
    // (aynı görev içinde → titreme yok). ~2 kez/sn çağrılır.
    renderStreamView(pose, target) {
      if (!pose || !target || renderer.__lost) return false;
      try {
        const cw = canvas.width;
        const ch = canvas.height;
        const want = target.width / target.height;
        let vw = cw;
        let vh = Math.round(cw / want);
        if (vh > ch) {
          vh = ch;
          vw = Math.round(ch * want);
        }
        const saved = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, asp: camera.aspect };
        camera.fov = pose.fov || 64;
        camera.aspect = want;
        camera.updateProjectionMatrix();
        camera.position.set(pose.px, pose.py, pose.pz);
        camera.lookAt(pose.tx, pose.ty, pose.tz);
        const pr = renderer.getPixelRatio();
        renderer.setViewport(0, 0, vw / pr, vh / pr);
        renderer.render(scene, camera);
        const g = target.getContext('2d');
        g.drawImage(canvas, 0, ch - vh, vw, vh, 0, 0, target.width, target.height);
        renderer.setViewport(0, 0, cw / pr, ch / pr);
        camera.position.copy(saved.p);
        camera.quaternion.copy(saved.q);
        camera.fov = saved.fov;
        camera.aspect = saved.asp;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        return true;
      } catch {
        return false;
      }
    },
    // v80 — yayıncının başında "🔴 CANLI · 👁 n" rozeti
    setLiveBadge(uid, text) {
      const fig = uid === selfUid ? self.fig : others.get(uid)?.fig;
      if (!fig?.label) return;
      let b = fig.label.querySelector('.hs-live-badge');
      if (!text) {
        b?.remove();
        return;
      }
      if (!b) {
        b = document.createElement('span');
        b.className = 'hs-live-badge';
        if (fig.nameEl && fig.nameEl.parentNode === fig.label) fig.label.insertBefore(b, fig.nameEl);
        else fig.label.prepend(b);
      }
      if (b.textContent !== text) b.textContent = text;
    },
    getCameraPose() {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const r = (v) => Math.round(v * 100) / 100;
      // v71 — a: çekim anındaki en/boy oranı, cw: ekran genişliği (etiket ölçeği)
      return {
        px: r(camera.position.x),
        py: r(camera.position.y),
        pz: r(camera.position.z),
        dx: r(dir.x),
        dy: r(dir.y),
        dz: r(dir.z),
        fov: camera.fov,
        a: Math.round(camera.aspect * 1000) / 1000,
        cw: Math.round(container.clientWidth || 400),
      };
    },
    // v70 — ekran görüntüsü: WebGL tamponu çizimden sonra temizlendiği için
    // (preserveDrawingBuffer kapalı) kare AYNI anda çizilip okunur → siyah çıkmaz.
    // v71 — isim etiketleri ve mesaj balonları da kareye çizilir.
    captureFrame(type = 'image/jpeg', quality = 0.85) {
      try {
        renderer.render(scene, camera);
        // v72 — paylaşılan kare gibi ortadan KARE kırpılır
        return composeShot(type, quality, canvas.width / Math.max(1, container.clientWidth || canvas.width), true);
      } catch {
        return null;
      }
    },
    // fotoğraf (Sixtagram) için tek kare: verilen kamera pozuyla
    renderPose(pose, w = 480, h = 480) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = pose.fov || 58;
      camera.updateProjectionMatrix();
      camera.position.set(pose.px, pose.py, pose.pz);
      camera.lookAt(pose.px + pose.dx, pose.py + pose.dy, pose.pz + pose.dz);
      mode = 'walk';
      view = pose.py > H ? '2d' : '3d';
      updateWalls();
      updateLightPool(new THREE.Vector3(pose.px, 1, pose.pz));
      others.forEach((o) => {
        o.fig.x = o.fig.tx;
        o.fig.z = o.fig.tz;
        const sw = o.seat ? seatWorld(o.seat, new THREE.Vector3()) : null;
        o.fig.update(0, camera, performance.now(), sw, seatStand(o.seat));
      });
      updateShowers();
      objs.forEach((e) => e.data.p === 1 && e.obj.userData.ctl?.tick?.(1.3, 0.016));
      renderer.render(scene, camera);
      return composeShot('image/jpeg', 0.85, canvas.width / Math.max(200, Math.min(2000, Number(pose.cw) || 400)));
    },
    avatarsReady() {
      return [...others.values()].every((o) => o.fig.tex.ready);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (!snapshot && !spectate) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onCtx);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      }
      [...objs.keys()].forEach(removeEntry);
      others.forEach((o) => o.fig.dispose(scene));
      self.fig?.dispose(scene);
      // sahneye ait geometri/malzemeler (renderer ORTAK — dispose edilmez)
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      owned.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose?.();
      });
      renderer.__onLost = null;
      renderer.renderLists?.dispose?.();
      if (canvas.parentNode === container) container.removeChild(canvas);
      labelLayer?.remove();
    },
  };

  setSurfaces();
  api.setMode('walk');
  if (!snapshot) loop();
  return api;
}

export { TINTS };
