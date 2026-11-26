// =============================================================================
// SADECE ÖNİZLEME — Gezilebilir Neon Şehir motoru (three.js).
// Gezme mekaniği oyunun ev/mekân motoruyla (houseEngine) aynı: dokunduğun yere
// yürürsün (masaüstünde WASD), parmağı sürükleyince kamera döner, iki parmak /
// tekerlek yakınlaştırır; 3D (arkadan) ve 2D (kuş bakışı — harita gibi) görünüm.
// Avatarlar oyunun SVG avatarlarından üretilen "kağıt figür"lerdir.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildFullAvatarSvgMarkup, buildFullAvatarBackSvgMarkup, buildAvatarBackLayerMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes'; // v164: ayrı arka çizim
import { heldCanvas } from '../HouseScreen/heldArt';
import { PetFollower, FireAuraFx, EMOTES } from '../HouseScreen/figureFx.js'; // v191: ev motoru (~1 MB) şehirle yüklenmesin
import { getSharedRenderer } from '../HouseScreen/sharedRenderer.js';
import { PET_ART } from '../../lib/cosmeticsArt';
import { BOUNDS, COAST_Z, cx, cz, BLOCK } from './cityPlan.js';
import { buildVehicle, hasVehicle, seatedPerson, vehicleConfig } from './vehicles.js';
import { buildCockpit } from './cockpit.js';
import { createCityHeist } from './cityHeist.js'; // v154 — soygun dizisi (sinematik)
import { createJobWorld } from './jobWorld.js';
import { EngineSound } from './sound.js';
import { createStadiumMatch, matchAvatar } from './stadiumMatch.js';
// v157 — genişletilmiş dünya (otoyol, Kervankent, köyler, orman, kumsal) + girilebilir mekânlar
import { bakeGeo, canonMat, makeLod, lodTag, dropVenueInt, buildVenueInt, swapVenueInt, prepareCityWorldSync, finishCityWorld, mergeCityWorld, mergeVenue, buildAnimals, CITY_GRID, VENUE_GAME_KEY, toRoom, fromRoom, VROOM, nearest as hwyNearest, inTunnel } from './world/outerWorld.js';
import { NEW_VENUES } from './world/layouts.js';
import { HQ_CACHE } from './world/venues.js';
import { Kit } from './kit.js';
import { AVATAR_3D_ENABLED, AVATAR_3D_HIP, Avatar3D, makeAvatar3DLook, avatar3DPlain, avatar3DUsesPlain, avatar3DBackSrc } from './avatar3d.js'; // v206: 3D avatar (geri alma: avatar3d.js)
import { CATALOG_MAP } from '../HouseScreen/houseCatalog.js'; // v198: evdeki eşya eylemleri (kit.js zaten yüklüyor)
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { ANIMAL_BY_KEY } from '../../../functions/animalData.js'; // v198: evdeki hayvanlar
import { botAvatar, botDefaults, botJobOf, botLabel, cleanBotConfig } from '../../../functions/botData.js'; // v198: evdeki botlar
import { createMap } from './world/map.js';
import { applyImpact, findContact, impactParams, yawInertia, spring, airPitch } from './carImpact.js'; // v193 çarpma + uçuş
import { riderKind, ejectCheck, makeRagdoll, stepRagdoll, ragdollFrame, ragdollHeading, ragdollSpin, limbPose, stepFallenBike } from './riderEject.js'; // v216 binekten fırlama
import { geo as rsGeo, fromPad } from './world/roadsideGeo.js';
import { LOT_TYPES } from './cityPlan.js';
import { VENUES as GAME_VENUES } from '../../../functions/venueLayouts.js';
import { isPhotoNpc } from '../../../functions/storyNpcs.js'; // v168.1

const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
const IS_MOBILE = IS_ANDROID || (typeof navigator !== 'undefined' && /iPhone|iPad|Mobile/i.test(navigator.userAgent || ''));
// v161: araca engel olan ağaç eşyaları (kaldırım / park ağaçları)
const TREE_KEYS = new Set(['tree', 'palm']);
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
  // v159: telefonda şehir "piksel piksel" görünüyordu — düşük seviyelerin çözünürlüğü biraz artırıldı
  { name: 'düşük', dpr: 1.25, shadows: false, shadowEvery: 0, pool: 4, view: 100, fps: 60 },
  { name: 'en düşük', dpr: 1.05, shadows: false, shadowEvery: 0, pool: 2, view: 80, fps: 30 },
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
// v157: şehrin dışındaki görüş mesafesi (kademe başına)
const OUTER_VIEW = [700, 520, 380, 260];

// --- avatar dokuları (houseEngine ile aynı yöntem) ----------------------------
const avCache = new Map();
// v157: NPC'ler (mekân çalışanları, köylüler, satıcılar) sadece ayakta / oturur pozla çizilir —
// her NPC için 6 poz × 320×580 doku telefon belleğini dolduruyordu
// v167 — AVATAR DOKU KUYRUĞU: bir oyuncunun 4 pozu = 4 büyük SVG'nin resme çevrilip ekran kartına
// yüklenmesi. Şehre girildiğinde çevredeki 15-20 oyuncu aynı anda geldiği için ~80 resim tek karede
// işleniyor → açılışta ve kalabalık yere girince takılma. Artık iş kuyrukta: her karede ~5 ms'lik
// bütçe (en az bir iş), sıra kendi avatarımızdan başlar (ilk oluşturulan). Oyuncular yarım saniye
// içinde tek tek belirir, kare hızı düşmez.
const texQ = [];
let texPumping = false;
function pumpTex() {
  texPumping = false;
  const t0 = performance.now();
  let n = 0;
  while (texQ.length && (n === 0 || performance.now() - t0 < 5)) {
    const job = texQ.shift();
    n += 1;
    try {
      job();
    } catch (err) {
      console.warn('avatar dokusu:', err);
    }
  }
  if (texQ.length) schedTex();
}
function schedTex() {
  if (texPumping) return;
  texPumping = true;
  // arka planda (sekme gizli) requestAnimationFrame durur — fotoğraf çizimi yine de bitsin
  if (typeof document !== 'undefined' && document.hidden) setTimeout(pumpTex, 16);
  else requestAnimationFrame(pumpTex);
}
function queueTex(job) {
  texQ.push(job);
  schedTex();
}
// SVG → (kuyrukta) resim → (kuyrukta) tuval dokusu
function rasterTex(markup, w, h, aniso, done, isDead, onFail) {
  queueTex(() => {
    if (isDead()) return;
    const img = new Image();
    if (onFail) img.onerror = () => onFail();
    img.onload = () =>
      queueTex(() => {
        if (isDead()) return;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso;
        done(t);
      });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup());
  });
}
function avatarTextures(avatar, light = false) {
  const av = avatar || DEFAULT_AVATAR;
  const key = (light ? 'L:' : '') + JSON.stringify(av);
  let e = avCache.get(key);
  if (e) return e;
  const full = { ...DEFAULT_AVATAR, ...av };
  e = { ready: false, tex: {}, full, refs: 0, last: performance.now() };
  avCache.set(key, e);
  // v164: arka pozlar (back / backIdle) BAŞTAN çizilmez — sadece figür arabada / tribünde arkadan
  // görüldüğü ilk anda (ensureBackTex). Çoğu oyuncu için avatar başına 6 yerine 4 doku.
  const poses = light ? ['idle', 'sit'] : ['idle', 'walk1', 'walk2', 'sit'];
  let left = poses.length;
  // v157.4: telefonda avatar dokuları küçük (6 poz × her oyuncu — ekran kartı belleği ~2,5 kat az)
  const AW = IS_MOBILE ? 208 : 320;
  const AH = IS_MOBILE ? 377 : 580;
  const entry = e;
  poses.forEach((pose) => {
    rasterTex(
      () => buildFullAvatarSvgMarkup(full, { pose, animFire: full?.acc?.aura === 'fire' }).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, ''),
      AW,
      AH,
      IS_MOBILE ? 1 : 4,
      (t) => {
        entry.tex[pose] = t;
        left -= 1;
        if (left === 0) entry.ready = true;
      },
      () => entry.disposed
    );
  });
  return e;
}
// v153: ek poz (haraç: 'aim' / 'handsup') — ilk istendiğinde çizilir
function ensurePoseTex(e, pose) {
  if (!e || e.tex[pose] || e.pending?.[pose]) return;
  (e.pending ||= {})[pose] = true;
  const img = new Image();
  img.onload = () => {
    if (e.disposed) return;
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 580;
    c.getContext('2d').drawImage(img, 0, 0, 320, 580);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    e.tex[pose] = t;
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildFullAvatarSvgMarkup(e.full, { pose }).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, ''));
}
// v164 — arka görünüş (back: oturan, backIdle: ayakta) ilk istendiğinde çizilir; hazır olana kadar önden poz
const BACK_BASE = { back: 'sit', backIdle: 'idle' };
function ensureBackTex(e, pose) {
  if (!e || !BACK_BASE[pose] || e.tex[pose] || e.pending?.[pose] || e.lazy) return;
  (e.pending ||= {})[pose] = true;
  // v167: kuyrukta (bkz. rasterTex)
  rasterTex(
    () => buildFullAvatarBackSvgMarkup(e.full, { pose: BACK_BASE[pose], animFire: e.full?.acc?.aura === 'fire' }).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, ''),
    IS_MOBILE ? 208 : 320,
    IS_MOBILE ? 377 : 580,
    IS_MOBILE ? 1 : 4,
    (t) => {
      e.tex[pose] = t;
    },
    () => e.disposed
  );
}
// v206 — 3D avatar: bu mesafeden (m) yakındaki ayakta / yürüyen figürler 3D çizilir; uzakta, oturunca,
// araçta, özel pozda ve "en düşük" grafik ayarında eski kâğıt figür. applyTier() ayarlar.
// v215: "en düşük" ayarda da yakındakiler 3D (zayıf telefon kendiliğinden en düşüğe inince herkes 2D kalıyordu)
const FIG3D_TIER_DIST = [42, 32, 24, 16];
function requestLook3(e) {
  if (!e || e.look3 || e.look3Q || !e.ready || !e.tex.idle) return;
  const W3 = IS_MOBILE ? 208 : 320;
  const H3 = IS_MOBILE ? 377 : 580;
  // v215: çizim / kurulum hatasında takılı kalma: 3 sn sonra tekrar (en çok 4 kez)
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    e.look3Tries = (e.look3Tries || 0) + 1;
    if (e.look3Tries < 4) setTimeout(() => (e.look3Q = false), 3000);
  };
  const make = (f, b, plain, bo) =>
    queueTex(() => {
      if (e.disposed) return;
      try {
        e.look3 = makeAvatar3DLook(f, b, e.full, { plain, backOnly: bo });
      } catch (err) {
        console.warn('3d avatar:', err);
      }
      if (!e.look3) fail(); // v215: kurulamadıysa bir süre sonra yeniden denenir (kalıcı 2D kalmasın)
      // v208: saçsız / şapkasız resimler sadece 3D dokuya kopyalanır; ekran kartına hiç yüklenmez
      if (plain) {
        f.dispose();
        b.dispose();
      }
      bo?.dispose();
    });
  // v215: pelerin / kanat katmanı (sadece varsa çizilir)
  const plainAv = avatar3DUsesPlain(e.full) ? avatar3DPlain(e.full) : e.full;
  let boSvg = '';
  try {
    boSvg = buildAvatarBackLayerMarkup(avatar3DBackSrc(e.full));
  } catch {
    boSvg = '';
  }
  const withBack = (cb) => {
    if (!boSvg) return cb(null);
    rasterTex(() => boSvg, W3, H3, 1, cb, () => e.disposed, () => cb(null)); // pelerin çizilemezse onsuz
  };
  if (!avatar3DUsesPlain(e.full)) {
    // kostüm: kafa çizimi kostümden gelir → mevcut önden / arkadan resim kullanılır
    ensureBackTex(e, 'backIdle');
    if (!e.tex.backIdle) {
      // arka resim kuyrukta; sonraki karede tekrar denenir. v215: 4 sn'de gelmezse önden resimle (2D'de kalmasın)
      e.look3Wait ||= performance.now();
      if (performance.now() - e.look3Wait < 4000 && !e.lazy) return;
    }
    e.look3Q = true;
    withBack((bo) => make(e.tex.idle, e.tex.backIdle || e.tex.idle, false, bo));
    return;
  }
  // v208: saç + şapka 3D modellenir → gövdeye saçsız / şapkasız çizim giydirilir (kuyrukta, 2 resim)
  e.look3Q = true;
  const got = { bo: boSvg ? undefined : null };
  const both = () => got.f && got.b && got.bo !== undefined && make(got.f, got.b, true, got.bo);
  withBack((t) => ((got.bo = t), both()));
  rasterTex(() => buildFullAvatarSvgMarkup(plainAv, { pose: 'idle' }).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, ''), W3, H3, 1, (t) => ((got.f = t), both()), () => e.disposed, fail);
  rasterTex(() => buildFullAvatarBackSvgMarkup(plainAv, { pose: 'idle' }).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, ''), W3, H3, 1, (t) => ((got.b = t), both()), () => e.disposed, fail);
}
const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));
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

// v157.4: avatar dokuları artık sonsuza kadar tutulmaz — hiçbir figür kullanmıyorsa 60 sn sonra
// ekran kartından silinir (uzun oturumda yanından geçen her oyuncunun 6 dokusu birikiyordu → bellek)
function texUse(prev, next) {
  if (prev === next) return next;
  if (prev && prev.refs) {
    prev.refs -= 1;
    prev.last = performance.now();
  }
  if (next && !next.lazy) next.refs = (next.refs || 0) + 1;
  return next;
}
export function sweepAvatarTextures(now = performance.now(), idleMs = 60_000) {
  for (const [k, e] of avCache) {
    if (e.refs > 0 || !e.ready || now - (e.last || 0) < idleMs) continue;
    e.disposed = true; // v164: geç gelen (tembel) arka doku bırakılmış girdiye eklenmesin
    Object.values(e.tex).forEach((t) => t?.dispose?.());
    e.look3?.dispose();
    avCache.delete(k);
  }
}
const motoHatOf = (v) => (v && v.moto && v.ride !== 'horse' ? (typeof v.paint === 'string' && v.paint[0] === '#' ? v.paint : '#1a1a1a') : null); // v157.4: atta kask yok
// v216 — binekten fırlama: 3D avatarı fizik gövdesine yerleştir. rag: { o: kalça (dünya), q: yön, lp: limbPose, k, crouch }
const ragOff = new THREE.Vector3();
function ragPlace(m3, gpos, rag) {
  const r = m3.root;
  r.quaternion.copy(rag.q);
  r.scale.setScalar(m3.baseScale);
  ragOff.set(0, m3.hipH || AVATAR_3D_HIP, 0).applyQuaternion(rag.q);
  r.position.set(rag.o.x - gpos.x - ragOff.x, rag.o.y - gpos.y - ragOff.y, rag.o.z - gpos.z - ragOff.z);
  const k = rag.k ?? 1;
  const lp = rag.lp;
  if (lp) {
    m3.arms.forEach((a) => {
      const p = lp.arms[a.sx > 0 ? 1 : 0];
      a.sh.rotation.x += (p.x - a.sh.rotation.x) * k;
      a.sh.rotation.z += (a.sx * Math.abs(p.z) - a.sh.rotation.z) * k;
      a.el.rotation.x += (p.ex - a.el.rotation.x) * k;
    });
    m3.legs.forEach((l, i) => {
      const p = lp.legs[i];
      l.hip.rotation.x += (p.x - l.hip.rotation.x) * k;
      l.knee.rotation.x += (p.k - l.knee.rotation.x) * k;
    });
  }
  if (rag.crouch) {
    m3.legs.forEach((l) => {
      l.hip.rotation.x -= rag.crouch * 1.1;
      l.knee.rotation.x += rag.crouch * 1.6;
    });
  }
}

class Fig {
  constructor(scene, layer, { id, name, avatar, isSelf = false, npc = false, lazy = false }) {
    this.scene = scene;
    this.id = id;
    this.lazy = lazy; // v157: doku ilk görüldüğünde çizilir
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
    this.av0 = avatar;
    this.avBase = avatar;
    this.hatOn = null;
    this.motoHat = null;
    this.tex = lazy ? { ready: false, tex: {}, lazy: true } : texUse(null, avatarTextures(avatar));
    this.avKey = JSON.stringify(avatar || null);
    this.avBaseKey = this.avKey;
    this.setExtras(avatar);
  }
  setAvatar(av) {
    // v191: aynı nesne tekrar gelirse metne çevirmeden çık (ağ profili oturum boyunca aynı nesnedir;
    // eskiden her konum kaydında ~8 KB'lık avatar JSON'a çevriliyordu)
    if (av && av === this.avRef) return;
    this.avRef = av || null;
    const k = JSON.stringify(av || null);
    // v166: avatar aynıysa hiçbir şey yapılmaz. Eskiden motordaki (kasklı) her oyuncu için, ağdan her
    // kayıt geldiğinde (saniyede birkaç kez) kask çıkarılıp yeniden takılıyordu → sürekli doku işi.
    if (k === (this.avBaseKey ?? this.avKey)) return;
    this.avBaseKey = k;
    this.avBase = av;
    this.hatOn = null;
    this.avKey = k;
    this.tex = texUse(this.tex, avatarTextures(av));
    this.setExtras(av);
  }
  // v157.4: motordayken motor renginde kask (sadece görünüm; avatar verisi değişmez)
  syncHat() {
    const h = this.inCar ? this.motoHat || null : null;
    if (h === this.hatOn) return;
    this.hatOn = h;
    const av = h ? { ...(this.avBase || DEFAULT_AVATAR), hat: 'helmet', hatColor: h } : this.avBase;
    if (this.tex.lazy) {
      this.av0 = av;
      return;
    }
    this.avKey = h ? `hat:${h}` : JSON.stringify(av || null);
    this.tex = texUse(this.tex, avatarTextures(av));
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
  ensureTex() {
    if (this.tex.lazy) this.tex = texUse(null, avatarTextures(this.av0, true));
    return this.tex;
  }
  setForcePose(p) {
    this.forcePose = p || null;
    if (p) ensurePoseTex(this.ensureTex(), p);
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
  // v215: yönü hemen ayarla (ışınlanma / doğma: sırt kameraya, binaya dönük)
  faceYaw(yaw) {
    if (!Number.isFinite(yaw)) return;
    this.yaw = this.yawT = wrapAng(yaw);
    this.px = undefined;
    this.pz = undefined;
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
    // v206: baktığı yön = en son yürüdüğü yön (kamera döndürünce değişmez; herkeste aynı, çünkü
    // konumdan hesaplanır — ağdan ek veri gitmez). Işınlanma gibi büyük sıçramalar sayılmaz.
    const mdx = this.x - (this.px ?? this.x);
    const mdz = this.z - (this.pz ?? this.z);
    this.px = this.x;
    this.pz = this.z;
    const md2 = mdx * mdx + mdz * mdz;
    if (md2 > 1e-6 && md2 < 9) this.yawT = Math.atan2(mdx, mdz);
    if (!this.moving && this.standYaw != null) this.yawT = this.standYaw;
    if (this.sitting && !this.inCar && (this.seat3Yaw ?? this.seatYaw) != null) this.yawT = this.seat3Yaw ?? this.seatYaw; // v207: koltuğun yönü
    if (this.inCar && this.carYaw != null) this.yaw = this.yawT = this.carYaw; // v209: araçta yön = aracın yönü (gecikmesiz)
    if (this.yawT == null) this.yawT = ang;
    if (this.yaw == null) this.yaw = this.yawT;
    this.yaw = wrapAng(this.yaw + wrapAng(this.yawT - this.yaw) * Math.min(1, dt * 12 || 1));
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
    // v162 DÜZELTME ("şehrin dışında avatarların boyu kısalıyor"): kameranın yüksekliği eskiden
    // dünyanın 0 seviyesine göre ölçülüyordu. Şehirde zemin ~0 olduğu için doğruydu; dışarıda arazi
    // yükseldikçe kamera "çok yukarıda" sanılıyor, figür gereğinden fazla geriye yatırılıp kısa
    // görünüyordu. Artık figürün kendi yüksekliğine göre ölçülür.
    const el = bbYaw != null ? camera.userData.billboardEl : Math.atan2(camera.position.y - ((this.y || 0) + AV_PLANE_H / 2), hd);
    const back = el > 0.35 ? Math.min(el - 0.35, 1.05) : 0;
    this.pivot.rotation.order = 'YXZ';
    this.pivot.rotation.set(-back, ang, tilt);
    // v157.4: oturan / araçtaki figür, kamera yukarıdayken koltuk hizasından geriye yatırılır —
    // eskiden yerden yatırılıyordu: motorda figür farın önüne kayıp küçük görünüyordu
    const pivY = this.sitting ? (this.seatY ?? 0.5) - this.y : 0;
    this.pivot.position.y = lift + pivY;
    let pose = 'idle';
    if (this.sitting) pose = 'sit';
    // v149: tribün koltuğu — kamera arkadaysa ense görünür (yüz sahaya dönük)
    if (this.sitting && this.seatYaw != null && !this.inCar && (this.x - camera.position.x) * Math.sin(this.seatYaw) + (this.z - camera.position.z) * Math.cos(this.seatYaw) > 0) pose = 'back';
    // v151: tribünde ayakta (sahaya bakarken) kamera arkadaysa da ense görünür
    else if (!this.sitting && !this.inCar && this.standYaw != null && !this.moving && (this.x - camera.position.x) * Math.sin(this.standYaw) + (this.z - camera.position.z) * Math.cos(this.standYaw) > 0) pose = 'backIdle';
    if (this.inCar) {
      // kamera arabanın arkasındaysa ense görünür (yüz yola bakıyor)
      const behind = (this.x - camera.position.x) * Math.sin(this.carYaw) + (this.z - camera.position.z) * Math.cos(this.carYaw) > 0;
      pose = behind ? 'back' : 'sit';
    }
    else if (this.moving || forceWalk) {
      this.walkT += dt * (forceWalk ? 0.7 : this.run ? 1.6 : 1);
      pose = Math.floor(this.walkT / 0.16) % 2 ? 'walk2' : 'walk1';
    }
    // v153: haraç pozu (silah doğrultma / eller havada) + titreme
    if (this.forcePose && this.tex.tex[this.forcePose] && !this.inCar && !this.sitting) pose = this.forcePose;
    this.pivot.position.x = this.shakeUntil > now ? Math.sin(now / 21) * 0.035 : 0;
    this.syncHat();
    if (this.tex.lazy) this.ensureTex();
    if (this.tex.ready) {
      const T = this.tex.tex;
      if (BACK_BASE[pose] && !T[pose]) ensureBackTex(this.tex, pose);
      const t = T[pose] || T[BACK_BASE[pose]] || T.idle;
      if (this.mat.map !== t) {
        this.mat.map = t;
        this.mat.needsUpdate = true;
      }
      this.plane.visible = true;
    }
    // v150: araç içinde biraz küçük (kapalı araçlarda baş tavandan taşmasın — camlar şeffaf)
    const kIn = this.inCar ? 0.84 : 1;
    this.plane.scale.set((this.facingLeft ? -1 : 1) * kIn, kIn, 1);
    // v147.3: suya batma (kıyıdan içeri doğru derinleşir)
    const sinkT = this.sitting || this.inCar ? 0 : this.sink || 0;
    this.sinkCur = (this.sinkCur || 0) + (sinkT - (this.sinkCur || 0)) * Math.min(1, dt * 5 || 1);
    this.plane.position.y = this.sitting ? 0.04 + kIn * (AV_WAIST_FROM_TOP - AV_PLANE_H / 2) : AV_PLANE_H / 2 - AV_FEET - this.sinkCur;
    // v206 — 3D avatar (yakında, ayakta / yürürken). Kâğıt yüzey sahnede kalır ama çizilmez
    // (malzemesi gizlenir): ateş aurası gibi ona bağlı efektler çalışmaya devam eder.
    const d3 = this.scene.userData.fig3d || 0; // v211: her motorun kendi ayarı (fotoğraf motoru canlı oyunu etkilemez)
    const use3d = d3 > 0 && hd < d3 && !(this.forcePose && this.tex.tex?.[this.forcePose]); // v209: araçta da 3D
    let look3 = null;
    if (use3d) {
      look3 = (this.tex.ready && this.tex.look3) || null;
      if (!look3 && this.tex.ready) requestLook3(this.tex);
      // v215: yeni görünüm (kıyafet / aksesuar değişti) hazırlanırken eski 3D görünüm kalır — arada 2D'ye dönmez
      if (!look3 && this.m3?.look) look3 = this.m3.look;
    }
    if (look3) {
      if (this.m3 && !this.m3.setLook(look3)) {
        this.group.add(this.held); // v213: eldeki eşya eski modelle birlikte gitmesin
        this.m3.dispose();
        this.m3 = null;
      }
      if (!this.m3) {
        this.m3 = new Avatar3D(look3);
        this.m3.hideFire = true; // v215: şehirde ateş aurası FireAuraFx ile (çift alev olmasın)
        this.group.add(this.m3.root);
      }
      const r = this.m3.root;
      r.visible = true;
      r.rotation.y = this.yaw;
      // v207: oturma / yüzme / suda durma / emote (dans, zıpla, selam, alkış, kalp)
      const deep = !this.sitting && this.sinkCur > 0.75;
      const em = this.emote ? { kind: this.emote.kind, e: (now - this.emote.t0) / 1000 } : null;
      this.m3.pose({
        dt,
        t: now / 1000,
        walkT: this.walkT * 1.3,
        walk: this.moving && !this.sitting && !this.inCar,
        sit: this.sitting || this.inCar,
        drive: this.inCar,
        swim: deep && this.moving,
        tread: deep && !this.moving,
        tilt: em ? 0 : tilt,
        emote: em,
        hold: Boolean(this.holding), // v213: yiyecek / içecek elde, kol önde bükük, ara sıra ağza
      });
      const stand = lift - this.sinkCur;
      const seatOff = (this.seatY ?? this.y) - this.y - (this.m3.hipH || AVATAR_3D_HIP) + 0.03;
      let ry = stand + (seatOff - stand) * this.m3.kSit;
      ry += (-0.12 - ry) * this.m3.kSwim; // yüzerken gövde su yüzeyinde
      r.position.set(this.pivot.position.x, ry, 0);
      r.scale.setScalar(this.m3.baseScale * (this.inCar ? 0.9 : 1)); // araçta biraz küçük (kâğıt figürdeki gibi)
      // v216: binekten fırlama — gövde fizikten gelir (kalça konumu + yön), kollar / bacaklar çırpınır / gevşer
      if (this.rag) {
        ragPlace(this.m3, this.group.position, this.rag);
        this.ragOn = true;
      } else if (this.ragOn) {
        this.ragOn = false;
        r.rotation.set(r.rotation.x, this.yaw, 0);
      }
      this.mat.visible = false;
    } else {
      if (this.m3) this.m3.root.visible = false;
      this.mat.visible = true;
    }
    // v213: 3D'de eldeki eşya gerçekten ELE bağlı (kolla birlikte sallanır, ağza gider);
    // kâğıt figürde eskisi gibi figürün yanında
    if (look3 && this.m3) {
      if (this.held.parent !== this.m3.hand) {
        this.m3.hand.add(this.held);
        this.held.scale.set(0.8, 0.8, 1);
        this.held.position.set(0, 0, 0);
      }
    } else if (this.held.parent !== this.group) {
      this.group.add(this.held);
      this.held.scale.set(0.34, 0.34, 1);
    }
    if (this.holding && !(look3 && this.m3)) {
      const bob = Math.sin(now / 480) * 0.02;
      {
        const side = this.facingLeft ? -1 : 1;
        this.held.position.set(Math.cos(ang) * side * 0.3 + Math.sin(ang) * 0.12, AV_PLANE_H * 0.47 - AV_FEET + bob, -Math.sin(ang) * side * 0.3 + Math.cos(ang) * 0.12);
      }
    }
    this.fireFx?.update(now, this.plane.visible && this.group.visible);
    // v215: tasma 3D avatarın elinden (elin dünya konumu)
    if (this.pet && look3 && this.m3) {
      this.m3.root.updateMatrixWorld(true);
      this.handWorld = this.m3.hand.getWorldPosition(this.handWorld || new THREE.Vector3());
    } else this.handWorld = null;
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
    this.group.add(this.held);
    this.m3?.dispose();
    this.m3 = null;
    texUse(this.tex, null);
    scene.remove(this.group);
    this.label.remove();
    this.mat.dispose();
    this.pet?.dispose();
    this.fireFx?.dispose();
  }
}

// --- yaya isimleri / avatarları ------------------------------------------------
// =============================================================================
// v157.9 — TELEFON BELLEĞİ: sahnedeki (henüz GPU'ya yüklenmemiş) geometriler inceltilir.
//  • dokusuz malzemelerde UV koordinatı silinir (köşe başına 8 bayt)
//  • normaller 32 bit ondalık yerine 8 bit tamsayıya (köşe başına 12 → 3 bayt)
//  • düz gölgelendirmeli (flatShading) malzemede normal hiç tutulmaz
// Aynı bellek hem işlemcide hem ekran kartında kazanılır. Paylaşılan geometrinin bütün
// kullanıcıları kontrol edilir; animasyonlu / örnekli / iç içe geçmiş tamponlar atlanır.
const TEX_SLOTS = ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'lightMap', 'alphaMap', 'displacementMap', 'specularMap', 'envMap', 'matcap', 'gradientMap', 'clearcoatMap', 'sheenColorMap', 'transmissionMap', 'iridescenceMap'];
function slimGeometries(root) {
  const users = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.isSkinnedMesh || o.morphTargetInfluences) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let u = users.get(o.geometry);
    if (!u) users.set(o.geometry, (u = { tex: false, flat: true, bad: false }));
    for (const m of mats) {
      if (!m) continue;
      if (m.isShaderMaterial || m.isPointsMaterial || m.isLineBasicMaterial) u.bad = true;
      if (TEX_SLOTS.some((k) => m[k])) u.tex = true;
      if (!m.flatShading || m.isMeshBasicMaterial) u.flat = false;
    }
  });
  users.forEach((u, g) => {
    if (u.bad || g.userData?.noSlim) return;
    const at = g.attributes;
    if (!u.tex) {
      if (at.uv && !at.uv.isInterleavedBufferAttribute) g.deleteAttribute('uv');
      if (at.uv1 && !at.uv1.isInterleavedBufferAttribute) g.deleteAttribute('uv1');
    }
    const n = at.normal;
    if (!n || n.isInterleavedBufferAttribute || !(n.array instanceof Float32Array)) return;
    if (u.flat) {
      g.deleteAttribute('normal');
      return;
    }
    const src = n.array;
    const q = new Int8Array(src.length);
    for (let i = 0; i < src.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(src[i] * 127)));
    g.setAttribute('normal', new THREE.BufferAttribute(q, n.itemSize, true));
  });
}

export function createCityEngine(container, { uid: myUid = 'me', avatar, name = 'Sen', spawn = 'ev', onInteract, onTick, onReady, onEvent, onPlayerTap, snapshot = false, world = null } = {}) {
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
  // v149: telefonda fotoğraf motoru da hafif (gölgesiz) ayarda — Sixtagram açılınca bellek taşmasın
  let tier = snapshot ? (IS_MOBILE ? 2 : 0) : readCityTier(IS_MOBILE ? 2 : 0) /* v157.4: tüm telefonlar düşük kademeden başlar (gerekirse yükselir) */;
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
  scene.userData.fig3d = AVATAR_3D_ENABLED && snapshot ? 90 : 0; // v211: fotoğraflarda da 3D (canlıda applyTier ayarlar)
  const bgCol = new THREE.Color('#0b1838');
  const isoBg = new THREE.Color('#07080c'); // v158: yalıtılmış iç mekânın (karargah) arka planı
  scene.background = bgCol;
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
    bgCol.set(P.bg);
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
  // v157: şehir + girilebilir mekânlar + dış dünya önceden (CityScreen'de adım adım) kurulur;
  // fotoğraf motoru gibi bekleyemeyenler burada tek seferde kurar.
  const W = world && world.city && !world.__used ? world : prepareCityWorldSync({ mobile: IS_MOBILE });
  W.__used = true;
  const city = W.city;
  // v151: tribünde ayakta duranın yüzü sahaya dönük (kamera arkadaysa ense görünür)
  const standLot = city.lots.find((l) => l.type === 'stadyum');
  const standsYaw = (x, z) => (standLot && heightAt(x, z) != null ? Math.atan2(standLot.mx - x, standLot.mz - z) : null);
  city.kits.forEach((k) => {
    if (k.__cut) return; // v157: yerine girilebilir mekân kurulan lotun eski cephesi
    if (!k.group.parent) scene.add(k.group);
    k.dynamic.traverse((o) => (o.userData.dyn = true));
  });
  W.venues.forEach((v) => {
    if (!v.root.parent) scene.add(v.root);
  });
  scene.updateMatrixWorld(true);
  const tv = new V();
  const yawOf = (m) => Math.atan2(m.elements[8], m.elements[10]);
  const solids = [];
  const lights = [];
  const zones = [];
  const HOME_PLAY_KEYS = new Set(['pc', 'pcstation', 'console', 'arcade', 'gamer']); // v196: evde oyun
  // v198: haritada simgesi olan zemin kat dükkânları (motor galerisi, oto tamirci)
  const SHOP_POI = { motogaleri: { glyph: 'moto', icon: '🏍️', name: 'Motor Galerisi', color: '#e9651c' }, tamirci: { glyph: 'wrench', icon: '🔧', name: 'Oto Tamirci', color: '#c99a06' } };
const HOME_GYM_FREE = new Set(['bag', 'treadmill', 'bench', 'dumbbells']); // v199
const HOME_STUDIO_KEYS = { mixer: '🎛️ Mikser konsolu', easel: '🎨 Tuval' }; // v198
  const HOME_INSTR = { piano: '🎹 Piyano', drums: '🥁 Davul' }; // v198: oturunca çal
  let waters = [];
  const labels = [];
  const blockers = [];
  const ticks = [];
  const TICK_R = IS_MOBILE ? 50 : 70; // canlı eşyalar bu mesafede oynar
  const npcDefs = [];
  const seats = [];
  // v211: koltuğun yanında masa / sehpa varsa 3D avatar masaya dönük oturur (tabure gibi yönü
  // olmayan oturakların kendi yönü rastgele; seyyar satıcı masalarında ters oturuluyordu)
  const TABLE_RE = /masa|sehpa|table|desk/i;
  const tableYaw = (x, z) => {
    let best = null;
    let bd = 1.5 * 1.5;
    for (const s of solids) {
      if (!s.key || !TABLE_RE.test(s.key)) continue;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd && d > 0.01) {
        bd = d;
        best = s;
      }
    }
    return best ? Math.atan2(best.x - x, best.z - z) : null;
  };
  // v207: bir noktaya en yakın koltuğun yönü (uzak oyuncunun 3D avatarı koltuğa dönük otursun)
  const seatYawNear = (x, z) => {
    const ty = tableYaw(x, z);
    if (ty != null) return ty;
    let best = null;
    let bd = 0.7 * 0.7;
    for (const s of seats) {
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = s.yaw;
      }
    }
    return best;
  };
  const heights = []; // v149: basamaklı zeminler (stadyum tribünü)
  const areas = []; // v149: adlandırılmış alanlar ('stadyum')
  city.kits.forEach((k) => {
    if (k.__cut) return;
    k.seats.forEach((st) => {
      const p = st.o.localToWorld(tv.set(st.x, st.y, st.z + 0.06));
      // v149: tribün koltuğunun kendi yönü (sahaya dönük) — eşya koltuklarında 0
      seats.push({ x: p.x, y: p.y, z: p.z, yaw: yawOf(st.o.matrixWorld) + (st.yaw || 0), taken: false, tier: Boolean(st.tier), reach: st.reach || 0 });
    });
    k.solids.forEach((s) => {
      const p = s.o.localToWorld(tv.set(s.x, 0, s.z));
      solids.push({ x: p.x, z: p.z, hw: s.hw, hd: s.hd, yaw: yawOf(s.o.matrixWorld), item: s.item || null, key: s.key || null, ell: Boolean(s.ell), car: Boolean(s.car) });
    });
    (k.heights || []).forEach((h) => {
      const p = h.o.getWorldPosition(new V());
      const yw = yawOf(h.o.matrixWorld);
      heights.push({ x: p.x, z: p.z, r2: h.r * h.r, c: Math.cos(yw), s: Math.sin(yw), fn: h.fn });
    });
    (k.areas || []).forEach((a) => {
      const p = a.o.getWorldPosition(new V());
      const rot = Math.abs(Math.sin(yawOf(k.group.matrixWorld))) > 0.7;
      areas.push({ x: p.x, z: p.z, rx: rot ? a.rz : a.rx, rz: rot ? a.rx : a.rz, key: a.key });
    });
    const inner = /_int$/.test(k.group.name || ''); // v196: mekân içi lambası — gündüz dışarıdan bakınca da yanar (kapı / camdan içerisi kararmasın)
    k.lights.forEach((L) => {
      const p = L.o.localToWorld(tv.set(L.x, L.y, L.z));
      lights.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(L.color), intensity: L.intensity, distance: L.distance, inner: inner || Boolean(L.inner) });
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

  // v157 — mekân kapıları: soygun dizisi kapı bölgesinden yön/konum alır (etkileşim yok: r = 0)
  W.venues.forEach((v) => {
    if (!v.lot) return;
    const p = v.root.localToWorld(new V(v.door.x, 0, v.door.z));
    zones.push({ kind: 'door', type: v.lot.type, region: v.lot.def?.region, title: `${v.lot.def?.icon || ''} ${v.lot.def?.name || v.venue.name}`, x: p.x, z: p.z, r: 0, out: v.ry, id: `vdoor_${v.lot.type}` });
  });
  // v157 — mekân içi NPC'ler (veznedar, barmen, kasiyer…) + oyunun mekân istasyonları
  // v198: gazino da oyunun istasyonlu mekânı (slot / rulet / 10 Numara / piyango / bar). v196'da şehre
  // taşınınca listeye eklenmemişti → kumarhanede hiçbir şeye dokunulamıyordu.
  const STATION_GAME_KEYS = ['camii', 'banka', 'karakol', 'belediye', 'gazino'];
  // v198: spor salonunda aletin yanına gelince alt ortada "⭐ Görev" (sadece sıradaki görevin aleti — SporPart hideAct)
  const GYM_EQ = { bag: '🥊 Boks Torbası', treadmill: '🏃 Koşu Bandı', bench: '🏋️ Bench Press', dumbbells: '💪 Dambıl' };
  // v198: cafe / bar tezgâhına yaklaşınca da "Sipariş ver" (menü) — sol üstteki menü düğmesine ek
  const CITY_MENU_KEY = { cafe: 'cafe_mekan', bar: 'bar_mekan' };
  const menuStations = (v) => Object.fromEntries(Object.entries(NEW_VENUES[v.type]?.stations || {}).filter(([, acts]) => acts.some((a) => a.act === 'cafe' || a.act === 'bar')).map(([iid]) => [iid, [{ act: 'menu', label: v.type === 'bar' ? '🍸 Sipariş ver' : '☕ Sipariş ver' }]]));
  const gymStations = (v) => Object.fromEntries((v.venue.items || []).filter((q) => GYM_EQ[q.k]).map((q) => [q.i, [{ act: `train_${q.k}`, label: `⭐ Görev: ${GYM_EQ[q.k]}` }]]));
  const venueNpcDefs = [];
  W.venues.forEach((v) => {
    const gk = VENUE_GAME_KEY[v.type];
    const list = [...(v.venue.npcs || [])];
    (v.venue.bots || []).forEach((b) => list.push({ id: b.i, name: b.cfg.n, x: b.x, z: b.z, lines: b.cfg.l, av: { gender: b.cfg.g, skin: b.cfg.s, hairColor: b.cfg.h, clothing: 'vest', clothColor: '#f4f1e8', neckAcc: 'bow', pantsColor: '#1a1a1a' } }));
    // v197: oyundaki imam (imamState) — imam yoksa NPC gizli; varsa adı + avatarıyla görünür (venueNpcSet)
    // v202: dilenci köşesindeki 3 minder — bugünün dilencileri (oyuncular) oturur; boş yer gizli (venueNpcSet)
    if (v.type === 'camii') for (let i = 0; i < 3; i++) list.push({ id: `npc_dil${i}`, off: true, sit: 0.14, name: 'Dilenci', x: -7.8 + i, z: 5.6, lines: [] });
    if (v.type === 'camii') list.push({ id: 'npc_imam', off: true, name: 'İmam', x: 0, z: -5.75, lines: ['Namaza gelin.', 'Cemaatle kılınan namaz daha faziletlidir.'], av: { clothing: 'robe', clothColor: '#f4f1e8', hat: 'kufi', hatColor: '#ffffff', facialHair: 'full', hairColor: '#3b2a1a', neckAcc: 'none', pantsColor: '#f4f1e8' } });
    list.forEach((n) => {
      const p = fromRoom(v, n.x, n.z);
      const route = Array.isArray(n.route) ? n.route.map(([rx, rz]) => fromRoom(v, rx, rz)) : null; // v196 bot garson
      venueNpcDefs.push({ id: n.id, off: Boolean(n.off), ...(n.sit ? { sit: n.sit } : {}), name: n.name, av: n.av, x: p.x, z: p.z, y: 0.16 + (v.y0 || 0), lines: n.lines || [], left: Boolean(n.left), venue: v, route, quiet: Boolean(gk && STATION_GAME_KEYS.includes(gk)) });
    });
    // istasyonlar: oyunun mekânlarında (camii, banka, karakol) oyunun panelleri; markette alışveriş + ATM
    const stations = gk && STATION_GAME_KEYS.includes(gk) ? GAME_VENUES[gk]?.stations || {} : v.type === 'benzinlik' ? NEW_VENUES.market.stations : v.type === 'netkafe' ? NEW_VENUES.netkafe.stations : v.type === 'spor' ? gymStations(v) : CITY_MENU_KEY[v.type] ? menuStations(v) : {}; // v196: internet kafe — bilgisayar / konsol / yayın seti · v198: spor aletleri
    Object.entries(stations).forEach(([iid, acts]) => {
      const it = v.venue.items.find((q) => q.i === iid);
      if (!it) return;
      const p = fromRoom(v, it.x, it.z);
      // v197: internet kafede ayakta oynanmaz / yayın açılmaz — cihazın koltuğuna oturunca düğme çıkar
      let chair = null;
      if (v.type === 'netkafe') {
        const ck = iid.startsWith('npc') ? `nkc${iid.slice(3)}` : iid.startsWith('nps') ? `nss${iid.slice(3)}` : iid;
        const ci = v.venue.items.find((q) => q.i === ck);
        if (ci) chair = { ...fromRoom(v, ci.x, ci.z), r: ci.k === 'sofa2' ? 1.3 : 0.7 };
      }
      zones.push({ kind: 'station', id: `st_${v.type}_${iid}`, station: iid, acts, venue: v.type, gameVenue: gk || (v.type === 'spor' ? 'spor_mekan' : CITY_MENU_KEY[v.type] || null), title: `${v.venue.icon || ''} ${v.venue.name}`, x: p.x, z: p.z, r: v.type === 'spor' ? 1.6 : 2.0, ...(chair ? { seatOnly: true, chairPos: chair } : {}) });
    });
  });

  // v158 — haritadaki TÜM ATM'ler + karargah kapıları (şehrin, yol üstünün, kasabanın mekânları dahil)
  const atmNear = (x, z) => zones.some((q) => (q.kind === 'atm' || (q.kind === 'station' && q.acts?.some((a) => a.act === 'atm'))) && Math.hypot(q.x - x, q.z - z) < 1.2);
  const addAtm = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || atmNear(x, z)) return;
    zones.push({ kind: 'atm', id: `atm_${Math.round(x * 10)}_${Math.round(z * 10)}`, title: '🏧 ATM', x, z, r: 1.4 });
  };
  const scanAtm = (root) => root?.traverse?.((o) => {
    if (o.userData?.itemKey !== 'atm') return;
    const p = o.localToWorld(new V(0, 0, 0.8));
    addAtm(p.x, p.z);
  });
  city.kits.forEach((k) => !k.__cut && scanAtm(k.group)); // birleştirmeden önce (eşya bilgisi kaybolmasın)
  function venueExtraZones(late) {
    W.venues.forEach((v) => {
      if (v.__z158) return;
      v.__z158 = true;
      // sonradan eklenen mekânların (yol üstü market) istasyonları: alışveriş + ATM
      if (late) {
        const gk = VENUE_GAME_KEY[v.type];
        const stations = gk && STATION_GAME_KEYS.includes(gk) ? GAME_VENUES[gk]?.stations || {} : v.type === 'benzinlik' ? NEW_VENUES.market.stations : {};
        Object.entries(stations).forEach(([iid, acts]) => {
          const it = v.venue.items.find((q) => q.i === iid);
          if (!it) return;
          const p = fromRoom(v, it.x, it.z);
          zones.push({ kind: 'station', id: `st_${v.type}_${iid}_${Math.round(v.wx)}`, station: iid, acts, venue: v.type, gameVenue: gk || null, title: `${v.venue.icon || ''} ${v.venue.name}`, x: p.x, z: p.z, r: 2.0 });
        });
      }
      // v159: kapalı dükkânın kapısı — önünde mekân düğmeleri (liste + soygun) çıkar
      if (v.closedShop) {
        const o = fromRoom(v, v.doorX ?? 0, VROOM.D / 2 + 2.2);
        zones.push({ kind: 'shopDoor', id: `shop_${v.type}_${Math.round(v.wx)}`, venue: v.type, title: v.venue?.name ? `${v.venue.icon || '🏪'} ${v.venue.name}` : '🏪 Dükkân', x: o.x, z: o.z, r: 3.2 });
      }
      // karargah kapısı: dışarıdan "İçeri gir", içeriden "Şehre çık"
      if (v.isolated) {
        const o = fromRoom(v, v.doorX ?? 0, VROOM.D / 2 + 1.7);
        // v159.1: şehirdeki karargah içi kaldırıldı — sadece kapıda "İçeri gir" (gerçek karargah ekranı açılır)
        zones.push({ kind: 'hqIn', id: `hqin_${v.type}`, slot: v.hqSlot, title: '🏴 Karargah', x: o.x, z: o.z, r: 2.2 });
      }
      // mekân kitlerinin kendi ATM bölgeleri (ör. bankanın ön cephesi)
      (v.kits || []).forEach((k) => (k.zones || []).forEach((z) => {
        if (z.kind !== 'atm' || !z.o) return;
        const p = z.o.getWorldPosition(new V());
        addAtm(p.x, p.z);
      }));
      // mekân içlerindeki ATM eşyaları (banka salonu, otogar, market…)
      (v.venue?.items || []).forEach((it) => {
        if (it.k !== 'atm') return;
        const ry = ((it.r || 0) * Math.PI) / 4;
        const p = fromRoom(v, it.x + Math.sin(ry) * 0.8, it.z + Math.cos(ry) * 0.8);
        addAtm(p.x, p.z);
      });
      scanAtm(v.root);
    });
  }
  venueExtraZones();
  // v196 — cafe / bar bahçesi (kapının önündeki masalı alan): sipariş burada da verilir
  W.venues.filter((v) => v.type === 'cafe' || v.type === 'bar').forEach((v) => {
    const p = fromRoom(v, 0, VROOM.D / 2 + 6.2);
    zones.push({ kind: 'terrace', id: `teras_${v.type}`, venue: v.type, title: v.type === 'bar' ? '🍸 Bar bahçesi' : '☕ Cafe bahçesi', x: p.x, z: p.z, r: 9 });
  });
  // v196 — Müstakil evler bloğunun ön kaldırımı: "🏘️ Evler" (başkalarının evlerini gez)
  // v197: sadece evlerin bahçe çitlerinin İÇİNDE (yolda / kaldırımda çıkmaz): bloğun kendisi, çit hattının içi
  city.lots.filter((l) => l.type === 'mustakil').forEach((l) => {
    zones.push({ kind: 'evler', id: `evler_${l.i0}_${l.j0}`, title: '🏘️ Müstakil Evler', x: l.mx, z: l.mz, hw: (l.lot?.w ?? l.bw - 6) / 2, hd: (l.lot?.d ?? l.bd - 6) / 2 - 0.45, r: 0 });
  });
  // statik geometriyi malzemeye + bölgeye göre birleştir (çizim çağrısı az olsun)
  mergeStatic(scene);
  // v158.2 — kameraya duvar gelince şeffaflaşan parçalar (ör. pit lounge duvarları / çatısı)
  const camFades = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.userData.camFade) return;
    o.updateWorldMatrix(true, false);
    o.geometry.computeBoundingSphere();
    const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
    camFades.push({ o, c, r: o.geometry.boundingSphere.radius, k: 1 });
  });
  const fadeRay = new THREE.Raycaster();
  const fadeEye = new V();
  const fadeDir = new V();
  function camFade(dt) {
    if (!camFades.length) return;
    fadeEye.set(self.x, me.y + 1.5, self.z);
    fadeDir.copy(fadeEye).sub(camera.position);
    const len = fadeDir.length();
    fadeDir.normalize();
    fadeRay.set(camera.position, fadeDir);
    fadeRay.far = Math.max(0.1, len - 0.3);
    for (const f of camFades) {
      let want = 1;
      if (f.o.visible && (f.c.x - self.x) ** 2 + (f.c.z - self.z) ** 2 < (f.r + 14) ** 2 && fadeRay.intersectObject(f.o, false).length) want = 0.22;
      if (Math.abs(f.k - want) < 0.005) continue;
      f.k += (want - f.k) * Math.min(1, dt * 10);
      if (Math.abs(f.k - want) < 0.01) f.k = want;
      const m = f.o.material;
      m.opacity = f.k;
      const tr = f.k < 0.999;
      if (m.transparent !== tr) {
        m.transparent = tr;
        m.depthWrite = !tr;
        m.needsUpdate = true;
      }
    }
  }
  // v157: mekânların duvar / iç parçaları kendi gruplarında birleşir (kesit + uzaklık kırpması korunur)
  W.venues.forEach((v) => mergeVenue(v));
  // v157.2 — telefonda mekân içleri: sadece yakında ve yavaşken kurulur (aşağıda lazyInteriors)
  const LAZY_INT = IS_MOBILE && !snapshot;
  const INT_IN = 32; // bu mesafede (ve yavaşken) kurulur
  const INT_OUT = 110; // bu mesafeden uzaklaşınca bırakılır (geri dönüşte tekrar kurmamak için geniş)
  const INT_MAX = 3; // aynı anda en fazla bu kadar mekân içi kurulu durur
  let intT = 0;
  let intLx = null;
  let intLz = 0;
  function lazyInteriors(dt) {
    intT -= dt;
    if (intT > 0) return;
    const step = 0.4;
    const px = driving && myCar ? myCar.x : self.x;
    const pz = driving && myCar ? myCar.z : self.z;
    const spd = intLx == null ? 0 : Math.hypot(px - intLx, pz - intLz) / Math.max(step, step - intT);
    intLx = px;
    intLz = pz;
    intT = step;
    let best = null;
    let bd = Infinity;
    const on = [];
    for (const v of W.venues) {
      const d = Math.hypot(px - v.wx, pz - v.wz);
      v.intD = d;
      if (v.intOn !== false && d > INT_OUT && v !== curVenue) dropVenueInt(v);
      else if (v.intOn !== false) on.push(v);
      else if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (on.length > INT_MAX) {
      on.sort((a, b) => b.intD - a.intD);
      on.slice(0, on.length - INT_MAX).forEach((v) => v !== curVenue && v.intD > 40 && dropVenueInt(v));
    }
    // hızlı geçerken kurulmaz (≈ 30 km/sa üstü); içerideyse / kapıdaysa hemen kurulur
    if (best && (bd < 12 || (bd < INT_IN && spd < 8.5))) buildVenueInt(best); // kare başına en fazla bir mekân
  }
  // v157 — şehrin dışı (arazi, otoyol, Kervankent, yol üstü, orman): ızgaralar + yardımcılar
  finishCityWorld(W, scene);
  venueExtraZones(true); // v158: yol üstü / kasaba mekânları burada eklenir (karargahlar dahil)
  (W.outerKits || []).forEach((k) => scanAtm(k.group));
  const outerKits = W.outerKits;
  outerKits.forEach((k) => {
    k.lights.forEach((L) => {
      const p = L.o.localToWorld(tv.set(L.x, L.y, L.z));
      lights.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(L.color), intensity: L.intensity, distance: L.distance });
    });
    k.seats.forEach((st) => {
      const p = st.o.localToWorld(tv.set(st.x, st.y, st.z + 0.06));
      seats.push({ x: p.x, y: p.y, z: p.z, yaw: yawOf(st.o.matrixWorld) + (st.yaw || 0), taken: false, tier: false });
    });
    k.ticks.forEach((t) => ticks.push(t));
    k.blockers.forEach((b) => blockers.push(b));
    k.labels.forEach((L) => {
      const p = L.o.getWorldPosition(new V());
      labels.push({ text: L.text, kind: L.kind, p });
    });
    k.npcs.forEach((n) => {
      const p = k.group.localToWorld(new V(n.x, 0, n.z));
      npcDefs.push({ ...n, x: p.x, z: p.z, y: p.y, outer: true });
    });
  });
  W.extraLights.forEach((L) => lights.push(L));
  W.ticks.forEach((t) => ticks.push(t));
  mergeCityWorld(W, scene);
  // görüş mesafesi için parçalar: birleşik statik bloklar + mekân grupları (hareketli eşyalar)
  const cullItems = [];
  {
    const sph = new THREE.Sphere();
    scene.getObjectByName('merged')?.children.forEach((m) => {
      m.geometry.computeBoundingSphere();
      sph.copy(m.geometry.boundingSphere);
      if (m.userData.lod) cullItems.push({ o: m, x: m.userData.cellC.x, z: m.userData.cellC.z, r: 0, lod: m.userData.lod });
      else if (sph.radius < 140) cullItems.push({ o: m, x: sph.center.x, z: sph.center.z, r: sph.radius });
    });
    // v157.4: kesme yarıçapı grubun GERÇEK kapsamından (eskiden grubun merkezi + 45 m sanılıyordu →
    // kumsal, marina gibi geniş gruplar yaklaşınca kayboluyordu: kumlar, yatlar)
    const kitSphere = (g) => {
      const bb = new THREE.Box3().setFromObject(g);
      if (bb.isEmpty()) return null;
      const c = bb.getCenter(new V());
      return { x: c.x, z: c.z, r: Math.max(8, Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2) };
    };
    city.kits.forEach((k) => {
      if (k.__cut || !k.group.parent || k.group.parent !== scene) return;
      const p = k.group.getWorldPosition(new V());
      if (Math.hypot(p.x, p.z) < 1 && (k.group.name === 'zemin' || k.group.name === 'deniz')) return;
      const sp = kitSphere(k.group);
      if (!sp || sp.r > 400) return; // çok geniş (zemin gibi): hep görünür
      cullItems.push({ o: k.group, x: sp.x, z: sp.z, r: sp.r });
    });
    // v157: mekân kökleri (canlı eşyalar, iç gruplar) + dış dünyanın birleşik parçaları
    W.venues.forEach((v) => {
      const p = v.root.getWorldPosition(new V());
      if (v.root.parent === scene) cullItems.push({ o: v.root, x: p.x, z: p.z, r: 40 });
    });
    // arazi karoları + ağaç karoları (uzakta olan / kamera dışı çizilmez)
    W.tiles.forEach((m) => cullItems.push({ o: m, x: m.userData.tile.x, z: m.userData.tile.z, r: m.userData.tile.r, outer: true, keep: true })); // ortak tampon: GPU'dan atılmaz
    W.mergedOuter?.children.forEach((m) => {
      m.geometry.computeBoundingSphere();
      sph.copy(m.geometry.boundingSphere);
      if (m.userData.lod) cullItems.push({ o: m, x: m.userData.cellC.x, z: m.userData.cellC.z, r: 0, lod: m.userData.lod, outer: true });
      else if (sph.radius < 260) cullItems.push({ o: m, x: sph.center.x, z: sph.center.z, r: sph.radius, outer: true });
    });
    outerKits.forEach((k) => {
      if (k.dynamic.children.length) {
        const sp = kitSphere(k.dynamic);
        if (sp && sp.r <= 400) cullItems.push({ o: k.dynamic, x: sp.x, z: sp.z, r: sp.r, outer: true });
      }
    });
  }

  // v157.2 — sabit (birleşik) gruplar: dünya matrisi bir kez hesaplanır, her karede binlerce
  // parçanın matris ağacı yeniden gezilmez (telefonda kare başına ciddi işlemci tasarrufu)
  [scene.getObjectByName('merged'), W.mergedOuter, ...W.tiles].forEach((g) => {
    if (!g) return;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.matrixWorldAutoUpdate = false;
    });
  });

  // --- yürüme ızgarası ------------------------------------------------------------
  // v157: şehir ızgarası kumsal, deniz, marina ve otoyol ağzını da kapsar (şehrin dışı outerWorld'de)
  const GX0 = CITY_GRID.x0;
  const GZ0 = CITY_GRID.z0;
  const GW = Math.ceil((CITY_GRID.x1 - CITY_GRID.x0) / RES);
  const GH = Math.ceil((CITY_GRID.z1 - CITY_GRID.z0) / RES);
  const grid = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) grid[j * GW + i] = W.cityWalkInit(GX0 + (i + 0.5) * RES, GZ0 + (j + 0.5) * RES) ? 1 : 0;
  }
  solids.forEach((s) => !s.car && rasterRect(s)); // v149: sadece-araba engelleri (stadyum) yayaya engel değil
  // ARABA ızgarası: sadece binalar, büyük yapılar, su ve sınırlar. Lamba, ağaç,
  // bank, çiçeklik, masa, satıcı arabası… araba için engel değil (sürüş kolay olsun)
  const carGrid = new Uint8Array(GW * GH);
  {
    const keep = grid.slice();
    grid.fill(0);
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) grid[j * GW + i] = W.cityCarInit(GX0 + (i + 0.5) * RES, GZ0 + (j + 0.5) * RES) ? 1 : 0;
    }
    // v147.3: arabalar sadece binalara / büyük yapılara çarpar — kaldırımdaki ağaç, lamba,
    // çit, bank, saksı vb. eşyalar araba için engel değil (kaldırıma çıkılabilir)
    // v161: ağaçlar araca engel (sadece gövdesi, ~0,8 m)
    solids.forEach((s) => {
      if (TREE_KEYS.has(s.key)) return rasterRect({ ...s, hw: Math.max(s.hw, 0.4), hd: Math.max(s.hd, 0.4), ell: true });
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
  // v157: şehirde ızgara; kasaba / otoyol / köy yolu outerWorld'de (curY: köprü üstü / altı ayrımı)
  let carHint = -1;
  const carBlockedAt = (x, z, r, curY = null) => {
    if (W.garages.length && W.garageBlock(x, z, r)) return true;
    const m = W.modeAt(x, z);
    if (m === 'city') return carCell(x - r, z - r) || carCell(x + r, z - r) || carCell(x - r, z + r) || carCell(x + r, z + r) || carCell(x, z);
    return W.outerCarBlocked(x, z, r, m, carHint, curY);
  };
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
  // v196 — 3 KATLI EV: şehirdeki ev binası (world/houseFloors.js). Ayak yüksekliği kat-farkında; çarpışma
  // eşyalar + kat boşlukları; içerideki eşyalar o an "evinde olunan" belgeden (setHome) gelir.
  const EV = W.venues.find((q) => q.type === 'ev' && q.ml) || null;
  let evY = 0.16; // oyuncunun ayak yüksekliği (blockedAt yükseklik bilmez)
  let evHome = null; // { id, ownerUid, items, surf, door, … }
  let evDesign = null; // tasarımda: { f, sel, add } | null
  // v196 tasarım kamerası: katın ortasına bakan yörünge (avatar gizli); sürükle = döndür, iki parmak = yakınlaştır
  const dCam = { yaw: 0, pitch: 0.95, dist: 17, x: 0, z: 0 };
  let dDrag = null; // eşya sürükleme { idx, it, moved, off }
  let streamCam = null; // v199: yayın açıkken ana kamera (oda koordinatlı poz)
  let heldUntil = 0; // v200: eldeki ürünün bitişi (ms)
  // v197: karargah tasarımıyla aynı mekanik — önce dokunarak seç, seçiliyi sürükle; seçili olmayan
  // eşyanın üstünden sürüklemek kamerayı çevirir. Tavan modu: sadece tavan eşyaları seçilir.
  let evSel = null; // seçili eşya sırası (React'tan homeSelect)
  // garajdaki araç: ev sahibinin favorisi (yoksa en pahalısı) — oyunun araç modeli (buildVehicle)
  // v197: herkes garajda KENDİ favori aracını görür (kimin evinde olursa olsun, dışarıdan da);
  // araç yoksa garaj boş. Garajdaki araca binilip gezilir (garageDrive).
  let evCar = null;
  function evSetGarageCar(key, mods = null, id = null) {
    if (!EV?.garageSpot) return;
    const sig = `${key}|${JSON.stringify(mods || null)}`;
    if (evCar?.sig === sig) {
      evCar.id = id || evCar.id;
      return;
    }
    if (evCar?.obj) evCar.obj.removeFromParent();
    if (EV.garageCar) EV.garageCar.visible = false;
    evCar = { key, sig, obj: null, id, mods: mods || null, out: false };
    if (!key) return;
    try {
      const car = buildVehicle(key, mods);
      const g = car?.root;
      if (!g?.isObject3D) return;
      g.position.set(EV.garageSpot.x, 0.17, EV.garageSpot.z);
      g.rotation.y = 0; // burnu garaj ağzına (+z)
      EV.root.add(g);
      evCar.obj = g;
      if (EV.garageCar) EV.garageCar.visible = false;
    } catch {
      /* araç modeli kurulamadı: garaj boş */
    }
  }
  // v197: (x, z) bir garajın içinde / ağzında mı? → { g, lx, lz } (lz < 0 içeri, 0 kapı çizgisi)
  function garageLane(x, z) {
    for (const g of W.garages || []) {
      if (!g.gd) continue;
      const dx = x - g.x;
      const dz = z - g.z;
      const c = Math.cos(g.ry);
      const sn = Math.sin(g.ry);
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      if (Math.abs(lx) < g.gw / 2 + 0.6 && lz > -g.gd - 0.6 && lz < 1.2) return { g, lx, lz };
    }
    return null;
  }
  // garajdaki aracın dünya konumu + burun yönü (garaj ağzı)
  function garageWorld() {
    if (!EV?.garageSpot) return null;
    EV.root.updateMatrixWorld(true);
    const p = EV.root.localToWorld(new V(EV.garageSpot.x, 0, EV.garageSpot.z));
    const q = new THREE.Quaternion();
    EV.root.getWorldQuaternion(q);
    const fwd = new V(0, 0, 1).applyQuaternion(q);
    return { x: p.x, z: p.z, yaw: Math.atan2(fwd.x, fwd.z) };
  }
  // garajdaki araç sürülürken garaj boş görünür; araç kaldırılınca / başka araç çağrılınca geri gelir
  function garageBack() {
    if (evCar?.out) {
      evCar.out = false;
      if (evCar.obj) evCar.obj.visible = true;
    }
  }
  // v198 — EVDEKİ HAYVANLAR VE BOTLAR: eski ev ekranında platformun üstünde hayvan / bot dururdu
  // (housePets, houseBots); şehirdeki evde sadece platform çiziliyordu. Hayvan: oyunun evcil hayvan
  // çizimi (PetFollower, tasmasız) platformun üstünde; bot: ayarlarındaki görünüşle (bots[eşya]) NPC.
  // Konum herkesin cihazında — Firestore'a yazma yok.
  let evFigs = [];
  function evFigsClear() {
    evFigs.forEach((o) => {
      if (o.pet) o.pet.dispose();
      if (o.fig) {
        const i = npcs.indexOf(o.fig);
        if (i >= 0) npcs.splice(i, 1);
        o.fig.group.removeFromParent();
        o.fig.label?.remove();
        o.fig.mat?.dispose();
        o.fig.plane?.geometry?.dispose();
      }
    });
    evFigs = [];
  }
  // v199: hayvan / bot platformu (eşyanın kendisi) sadece Tasarla'da görünür; normalde sadece hayvan / bot
  function evPadsVis() {
    if (!EV || !evHome) return;
    (evHome.items || []).forEach((it) => {
      if (!ANIMAL_BY_KEY[it.k] && it.k !== 'bot') return;
      const o = EV.ml.objById(it.i); // v202: kimlikle
      if (o) o.visible = Boolean(evDesign);
    });
  }
  function evFigsBuild() {
    evFigsClear();
    if (!EV || !evHome) return;
    evPadsVis();
    EV.root.updateMatrixWorld(true);
    (evHome.items || []).forEach((it) => {
      // v199: Tasarla'da hayvan / bot da platformuyla birlikte görünür (deneme eşyası dahil)
      if (it.p !== 1 && !evDesign) return;
      const a = ANIMAL_BY_KEY[it.k];
      if (!a && it.k !== 'bot') return;
      const p = fromRoom(EV, it.x, it.z);
      const y = EV.ml.floors[it.f] ?? 0.16;
      if (a) {
        try {
          const pet = new PetFollower(scene, { id: a.art, leash: false });
          pet.leash.visible = false;
          evFigs.push({ pet, x: p.x, y: y + 0.06, z: p.z });
        } catch {
          /* çizim yoksa platform kalır */
        }
      } else {
        // eski ev ekranındaki botla aynı: görünüş / ad / sözler bots[eşya] ayarından (yoksa varsayılan)
        const raw = evHome.bots?.[it.i] || null;
        const cfg = cleanBotConfig(raw);
        const f = new Fig(scene, layer, { id: `evbot_${it.i}`, name: botLabel(botDefaults(cfg).name), npc: true, lazy: true, avatar: botAvatar(cfg) });
        f.x = p.x;
        f.z = p.z;
        f.y = y + 0.05;
        f.lines = raw ? (cfg.l || []).filter(Boolean) : botJobOf(cfg).lines || [];
        f.venue = EV;
        npcs.push(f);
        evFigs.push({ fig: f });
      }
    });
  }
  // evdeki koltuklar (satın alınmış oturulabilir eşyalar) şehrin oturma listesine eklenir / çıkarılır
  function evSeats() {
    try {
      evFigsBuild(); // v198
    } catch {
      /* yoksay */
    }
    for (let i = seats.length - 1; i >= 0; i--) if (seats[i].ev) seats.splice(i, 1);
    for (let i = zones.length - 1; i >= 0; i--) if (zones[i].ev) zones.splice(i, 1);
    EV.root.updateMatrixWorld(true);
    EV.ml.seatList().forEach((st) => {
      const p = fromRoom(EV, st.x, st.z);
      const def = CATALOG_MAP[st.k];
      // v202: duşakabin ayakta (stand) — "🚿 Duş al" / "🚪 Duştan çık", içindeyken su akar
      seats.push({ x: p.x, y: st.y, z: p.z, yaw: EV.ry + st.yaw, taken: false, tier: false, ev: true, item: st.i, itemKey: st.k, ...(def?.stand ? { stand: true, label: def.seatLabel || '🚿 Duş al', exitLabel: def.exitLabel || '🚪 Duştan çık' } : {}) });
    });
    // v202: evdeki lambaların / şöminenin ışığı şehrin ışık havuzuna (aç / kapat ışığı da söndürür)
    for (let i = lights.length - 1; i >= 0; i--) if (lights[i].ev) lights.splice(i, 1);
    (evHome?.items || []).forEach((it) => {
      if (it.p !== 1) return;
      const o = EV.ml.objById(it.i);
      const L = o?.userData?.ctl?.light;
      if (!L) return;
      o.updateMatrixWorld(true);
      const lp = o.localToWorld(new V(L.x, L.y, L.z));
      lights.push({ x: lp.x, y: lp.y, z: lp.z, color: new THREE.Color(L.color), intensity: L.intensity, distance: L.distance, inner: true, ev: true, ctl: o.userData.ctl });
    });
    // v198: evdeki eşyaların eski ev ekranındaki eylemleri — ışık / TV / şömine aç-kapat, buzdolabından /
    // kahve makinesinden ürün al (elde 2 dk). Herkese açık; sadece bu cihazda (Firestore'a yazılmaz).
    (evHome?.items || []).forEach((it) => {
      if (it.p !== 1 || HOME_PLAY_KEYS.has(it.k) || HOME_STUDIO_KEYS[it.k] || HOME_INSTR[it.k]) return;
      const def = CATALOG_MAP[it.k];
      if (!def) return;
      const acts = [];
      const ctl = EV.ml.objById(it.i)?.userData?.ctl; // v202: kimlikle (sıra numarası kayıyordu)
      if (!def.panel && ctl?.act && !ctl.noToggle && typeof ctl.setOn === 'function') acts.push({ kind: 'toggle', label: ctl.act });
      // v202: müzik kutusu (sadece bu cihazda çalar) · ATM (telefonda banka)
      if (def.panel === 'jukebox') acts.push({ kind: 'jukebox', label: '🎵 Müzik' });
      if (def.panel === 'atm') acts.push({ kind: 'atm', label: '🏧 Parara Bank' });
      (def.takes || []).forEach((product) => {
        const pr = HOUSE_PRODUCTS[product];
        if (pr) acts.push({ kind: 'take', product, label: `${pr.emoji} ${pr.label} al` });
      });
      // v199: spor aletinde üyeliksiz serbest çalışma (eski ev ekranındaki gibi; güç kazandırmaz)
      if (HOME_GYM_FREE.has(it.k)) acts.push({ kind: 'gymfree', equipment: it.k, label: '💪 Serbest çalış' });
      if (!acts.length) return;
      const p = fromRoom(EV, it.x, it.z);
      zones.push({ kind: 'homeItem', id: `hi_${it.i}`, itemId: it.i, acts, title: `${def.icon || ''} ${def.name}`, x: p.x, z: p.z, y: EV.ml.floors[it.f] ?? 0, r: 1.5, ev: true });
    });
    // v198: evdeki stüdyo eşyaları (mikser konsolu, tuval) — sadece sahibine; yaklaşınca düğme çıkar.
    // Piyano / davul oturunca çalınır (aşağıda, oturma dalı) — evdeki herkes çalabilir.
    if (evHome?.mine) {
      (evHome.items || []).forEach((it) => {
        if (it.p !== 1 || !HOME_STUDIO_KEYS[it.k]) return;
        const p = fromRoom(EV, it.x, it.z);
        zones.push({ kind: 'homeStudio', id: `hs_${it.i}`, studio: it.k, itemId: it.i, title: HOME_STUDIO_KEYS[it.k], x: p.x, z: p.z, y: EV.ml.floors[it.f] ?? 0, r: 1.8, ev: true });
      });
    }
    // v196: kendi evindeki oyun cihazları (satın alınmış) sadece sahibine: "🎮 Oyun oyna" (ücretsiz)
    if (evHome?.mine) {
      (evHome.items || []).forEach((it) => {
        if (it.p !== 1 || !HOME_PLAY_KEYS.has(it.k)) return;
        const p = fromRoom(EV, it.x, it.z);
        // v197: ayakta oynanmaz — oyuncu koltuğunun kendisi ya da cihazın 1,8 m yakınındaki koltuk (aynı kat)
        let ch = it.k === 'gamer' ? it : null;
        if (!ch) {
          let bd = 1.8;
          (evHome.items || []).forEach((q) => {
            if (q.p !== 1 || q.f !== it.f || !EV.ml.isSeatKey(q.k)) return;
            const d = Math.hypot(q.x - it.x, q.z - it.z);
            if (d < bd) {
              bd = d;
              ch = q;
            }
          });
        }
        const chair = ch ? { ...fromRoom(EV, ch.x, ch.z), r: 1.3 } : null;
        // arcade makinesi ayakta oynanır; diğerleri sadece koltuktan (koltuk yoksa düğme çıkmaz)
        zones.push({ kind: 'homePlay', id: `hp_${it.i}`, title: it.k === 'gamer' ? '🎮 Oyun · 🔴 Yayın' : '🎮 Oyun', chair: it.k === 'gamer' ? it.i : null, x: p.x, z: p.z, y: EV.ml.floors[it.f] ?? 0, r: 1.7, ev: true, ...(it.k !== 'arcade' ? { seatOnly: true, chairPos: chair } : {}) });
      });
    }
  }
  // v202 — EVDEKİ CANLI EŞYALAR: ev eşyaları şehir kurulduktan SONRA (eve girince) kurulduğu için canlı
  // parçaları (TV ekranı, şömine alevi, akvaryum…) şehrin tek seferlik canlı listesine hiç girmiyordu —
  // TV açılınca ekran siyah kalıyordu. Artık içerideyken kat kitlerinin listesi her karede oynatılır.
  // Duşakabin: içinde biri (ben ya da duruşu duşta olan başka oyuncu) varsa su akar.
  const tkV = new V();
  function homeTicks(t, dt) {
    for (let f = 0; f < 3; f++) {
      const kit = EV.ml.furnKit(f);
      if (!kit) continue;
      for (const tk of kit.ticks) {
        const ctl = tk.ctl;
        if (!ctl) continue;
        if (tk.wx === undefined) {
          tk.obj.getWorldPosition(tkV);
          tk.wx = tkV.x;
          tk.wz = tkV.z;
          tk.wy = tkV.y;
        }
        if (ctl.setRunning) {
          let busy = Boolean(self.seat?.stand) && Math.hypot(self.seat.x - tk.wx, self.seat.z - tk.wz) < 0.7 && Math.abs(self.seat.y - tk.wy) < 1;
          if (!busy) {
            for (const r of remotes.values()) {
              const q = r.st;
              if (!q || q.m === 1 || !r.fig?.group.visible) continue;
              if (Math.hypot(r.fig.x - tk.wx, r.fig.z - tk.wz) < 0.45 && Math.abs((r.fig.y || 0) - tk.wy) < 1) {
                busy = true;
                break;
              }
            }
          }
          if (ctl.running !== busy) ctl.setRunning(busy);
        }
        if (ctl.tick && Math.abs(tk.wx - self.x) < 25 && Math.abs(tk.wz - self.z) < 25) ctl.tick(t, dt, Math.hypot(tk.wx - self.x, tk.wz - self.z));
      }
    }
  }
  const evLocal = (x, z) => {
    if (!EV) return null;
    const p = toRoom(EV, x, z);
    return Math.abs(p.x) < 9 && Math.abs(p.z) < 7 ? p : null;
  };
  let walkHint = -1;
  const blockedAt = (x, z, r = PLAYER_R) => {
    if (W.garages.length && W.garageBlock(x, z, r)) return true;
    if (EV) {
      const ep = evLocal(x, z);
      if (ep && EV.ml.blocked(ep.x, ep.z, Math.min(r, 0.3), evY)) return true;
    }
    const m = W.modeAt(x, z);
    if (m === 'city') return cellBlocked(x - r, z - r) || cellBlocked(x + r, z - r) || cellBlocked(x - r, z + r) || cellBlocked(x + r, z + r) || cellBlocked(x, z);
    return W.outerWalkBlocked(x, z, Math.min(r, 0.3), m, walkHint);
  };
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
  // v157.1: mekân kapıları 1 m'lik kaba ızgarada kapanabiliyordu (kapı ~1,1 m) → dokunarak
  // içeri yürünemiyordu. Kapı ekseni boyunca (dışarıdan içeri) hücreler açılır.
  W.venues.forEach((v) => {
    for (let dz = 2; dz >= -5; dz -= 0.25) {
      const p = v.root.localToWorld(new V(v.door.x, 0, v.door.z + dz));
      if (blockedAt(p.x, p.z, 0.2)) continue;
      const i = Math.floor(p.x - GX0);
      const j = Math.floor(p.z - GZ0);
      if (i >= 0 && j >= 0 && i < CW && j < CH) coarse[j * CW + i] = 0;
    }
  });
  // v167 — masa arkasındaki koltuklar (belediye başkanı koltuğu vb.): yürüme ızgarası masa ile duvar
  // arasındaki dar boşluğa sığmadığından koltuğun 1,25 m yakınına hiç varılamıyordu → "Otur" çıkmıyordu.
  // Böyle koltuklarda erişim mesafesi, koltuğa en yakın yürünebilir noktaya göre genişletilir (en çok 3,2 m).
  // Sadece GERÇEKTEN yürünebilen noktalar sayılır (kaba yol ızgarasında açık hücre — eşyalar arasındaki
  // kapalı cepler sayılmaz).
  const walkable = (x, z) => {
    if (blockedAt(x, z)) return false;
    const i = Math.floor(x - GX0);
    const j = Math.floor(z - GZ0);
    return i >= 0 && j >= 0 && i < CW && j < CH && !coarse[j * CW + i];
  };
  seats.forEach((st) => {
    if (st.tier || st.reach) return;
    for (let rr = 0.35; rr <= 1.2; rr += 0.2) {
      for (let a = 0; a < 12; a++) if (walkable(st.x + Math.cos((a / 12) * Math.PI * 2) * rr, st.z + Math.sin((a / 12) * Math.PI * 2) * rr)) return;
    }
    for (let rr = 1.3; rr <= 3.0; rr += 0.15) {
      for (let a = 0; a < 24; a++) {
        if (walkable(st.x + Math.cos((a / 24) * Math.PI * 2) * rr, st.z + Math.sin((a / 24) * Math.PI * 2) * rr)) {
          st.reach = Math.min(3.2, Math.max(2.6, rr + 0.6)); // yürüme sırasında kayma payı
          return;
        }
      }
    }
  });
  // v149 — STADYUM SAHASI KİLİDİ: maç saatinde (18:00–19:00) sahaya girilmez.
  // Saha hücreleri yürüme + yol bulma ızgarasında açılıp kapatılır (sunucu yok, cihazda).
  const pitchCells = [];
  const pitchCoarse = [];
  let pitchRect = null;
  {
    const sl = city.lots.find((l) => l.type === 'stadyum' && l.info?.match?.pitchLock);
    if (sl) {
      const { hw, hd } = sl.info.match.pitchLock;
      const yw = yawOf(sl.kit.group.matrixWorld);
      pitchRect = { x: sl.mx, z: sl.mz, hw, hd, yaw: yw, c: Math.cos(yw), s: Math.sin(yw) };
      const inside = (x, z) => {
        const dx = x - pitchRect.x;
        const dz = z - pitchRect.z;
        const lx = dx * pitchRect.c - dz * pitchRect.s;
        const lz = dx * pitchRect.s + dz * pitchRect.c;
        return Math.abs(lx) <= hw && Math.abs(lz) <= hd;
      };
      pitchRect.inside = inside;
      const ext = Math.hypot(hw, hd) + 1;
      for (let j = Math.max(0, Math.floor((sl.mz - ext - GZ0) / RES)); j <= Math.min(GH - 1, Math.floor((sl.mz + ext - GZ0) / RES)); j++) {
        for (let i = Math.max(0, Math.floor((sl.mx - ext - GX0) / RES)); i <= Math.min(GW - 1, Math.floor((sl.mx + ext - GX0) / RES)); i++) {
          const idx = j * GW + i;
          if (!grid[idx] && inside(GX0 + (i + 0.5) * RES, GZ0 + (j + 0.5) * RES)) pitchCells.push(idx);
        }
      }
      for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
        const x = GX0 + i + 0.5;
        const z = GZ0 + j + 0.5;
        if (Math.abs(x - sl.mx) > ext || Math.abs(z - sl.mz) > ext) continue;
        if (!coarse[j * CW + i] && inside(x, z)) pitchCoarse.push(j * CW + i);
      }
    }
  }
  let pitchLocked = false;
  function setPitchLock(on) {
    on = Boolean(on) && pitchCells.length > 0;
    if (on === pitchLocked) return;
    pitchLocked = on;
    const v = on ? 1 : 0;
    pitchCells.forEach((i) => (grid[i] = v));
    pitchCoarse.forEach((i) => (coarse[i] = v));
    if (on && !driving && !self.ride && pitchRect.inside(self.x, self.z)) {
      // sahadaysa kenara (en yakın boş yere) alınır
      if (self.seat) standUp();
      const f = freeNear(self.x, self.z);
      if (f) {
        self.x = f.x;
        self.z = f.z;
        self.target = null;
        self.path = null;
        ring.visible = false;
      }
    }
    if (on && self.target && pitchRect.inside(self.target.x, self.target.z)) {
      self.target = null;
      self.path = null;
      ring.visible = false;
    }
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
    // v167 — MEKÂN İÇİ YOL: başlangıç ve hedef aynı mekânın odasındaysa arama odanın içinde kalır.
    // Eskiden hedef (ör. belediye başkanı koltuğu, masanın arkası) ızgarada kapalıysa A* tüm şehri
    // tarayıp hedefe "kuş uçuşu" en yakın hücreyi seçiyordu → o hücre binanın ARKA DUVARININ
    // DIŞIYDI: avatar kapıdan çıkıp binanın arkasına yürüyordu. Artık en yakın oda içi noktada durulur.
    let room = null;
    const vs = W.inVenueRoom?.(sx, sz, -0.4);
    if (vs && W.inVenueRoom(tx, tz, -0.4) === vs) {
      const hw = VROOM.W / 2 + 0.4;
      const hd = VROOM.D / 2 + 0.4;
      room = (i, j) => {
        const p = toRoom(vs, GX0 + i + 0.5, GZ0 + j + 0.5);
        return Math.abs(p.x) < hw && Math.abs(p.z) < hd;
      };
    }
    try {
      return astar(sx, sz, tx, tz, si, sj, ti, tj, room);
    } finally {
      for (const m of tmp) coarse[m] = 0;
    }
  }
  function astar(sx, sz, tx, tz, si, sj, ti, tj, room = null) {
    // hedef hücre kaba ızgarada doluysa en yakın boş hücreye yönel
    if (coarse[tj * CW + ti]) {
      let best = null;
      for (let rr = 1; rr <= 3 && !best; rr++) {
        for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
          const ni = ti + di;
          const nj = tj + dj;
          if (ni < 0 || nj < 0 || ni >= CW || nj >= CH || coarse[nj * CW + ni] || (room && !room(ni, nj))) continue;
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
    let near = s; // v157.3: hedefe ulaşılamazsa en yakın ulaşılabilen hücreye git
    let nearH = h(si, sj);
    while (heap.length && iter++ < 120000) {
      const [, n] = pop();
      if (closed[n]) continue;
      if (n === goal) {
        found = true;
        break;
      }
      closed[n] = 1;
      const hn = h(n % CW, (n / CW) | 0);
      if (hn < nearH) {
        nearH = hn;
        near = n;
      }
      const i = n % CW;
      const j = (n / CW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= CW || nj >= CH) continue;
        const m = nj * CW + ni;
        if (coarse[m] || closed[m]) continue;
        if (room && !room(ni, nj)) continue;
        if (di && dj && (coarse[j * CW + ni] || coarse[nj * CW + i])) continue;
        const ng = g[n] + (di && dj ? 1.414 : 1);
        if (ng < g[m]) {
          g[m] = ng;
          from[m] = n;
          push(m, ng + h(ni, nj));
        }
      }
    }
    const end = found ? goal : near;
    if (end === s) return null;
    const pts = [];
    for (let n = end; n !== -1 && n !== s; n = from[n]) pts.push({ x: GX0 + (n % CW) + 0.5, z: GZ0 + ((n / CW) | 0) + 0.5 });
    pts.reverse();
    if (found) pts[pts.length - 1] = { x: tx, z: tz };
    else pts.push({ x: tx, z: tz }); // son parça düz: yürüyüş duvar boyunca kayarak dener
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
  // v149 — basamaklı zemin (stadyum tribünü): yerel koordinata çevrilip kitin fonksiyonuna sorulur
  function heightAt(x, z) {
    for (const h of heights) {
      const dx = x - h.x;
      const dz = z - h.z;
      if (dx * dx + dz * dz > h.r2) continue;
      const y = h.fn(h.c * dx - h.s * dz, h.s * dx + h.c * dz);
      if (y != null) return y;
    }
    return null;
  }
  function areaAt(x, z) {
    for (const a of areas) {
      const nx = (x - a.x) / a.rx;
      const nz = (z - a.z) / a.rz;
      if (nx * nx + nz * nz <= 1) return a.key;
    }
    return null;
  }
  void blockRects;
  // v157: zemin = şehirde kaldırım / kumsal / iskele / deniz tabanı / mekân odası; dışarıda
  // otoyol, köprü (curY: köprü üstü mü altı mı), köy yolu, cep, arazi; kasabada düz
  function groundY(x, z, hint = -1, curY = null) {
    if (EV) {
      const ep = evLocal(x, z);
      if (ep) {
        const g = EV.ml.groundAt(ep.x, ep.z, curY ?? 0.16);
        if (g != null) return g;
      }
    }
    if (heights.length) {
      const h = heightAt(x, z);
      if (h != null) return h;
    }
    const m = W.modeAt(x, z);
    if (m === 'city') return W.groundCity(x, z);
    if (m === 'town') return W.groundTown(x, z);
    return W.offY(x, z, hint, curY).y;
  }
  // v167 — SUDA ARAÇ: göl / nehir / denize araba, at, bisiklet girer (eskiden görünmez duvar gibi çarpıyordu).
  // Gövde suyun içinde kalır (dipte yürümez, su yüzeyinin biraz altında "yüzer") ve çok yavaşlar (stepDrive).
  const WADE = 0.75;
  function carGroundY(c, hint) {
    const gy = groundY(c.x, c.z, hint, c.y);
    const lv = W.waterLevel(c.x, c.z, gy, W.modeAt(c.x, c.z));
    const d = lv == null ? 0 : Math.max(0, lv - gy);
    c.wet = d;
    return d > WADE ? gy + d - WADE : gy;
  }
  // ayakta duran / yüzen kişinin yüksekliği (derin suda yüzer)
  function standY(x, z, hint = -1, curY = null) {
    const gy = groundY(x, z, hint, curY);
    const lv = W.waterLevel(x, z, gy, W.modeAt(x, z));
    if (lv !== null && gy < lv - 1.05) return lv - 1.18 + Math.sin(performance.now() / 420) * 0.04;
    return gy;
  }
  const isSwimming = (x, z) => {
    const gy = groundY(x, z);
    const lv = W.waterLevel(x, z, gy, W.modeAt(x, z));
    return lv !== null && gy < lv - 1.05;
  };

  // --- doğma noktası (harita bölgesi → kapı / satıcı / açık alan) ------------------
  const REGION_LOT = { camii: 'camii', karakol: 'karakol', banka: 'banka', spor_salonu: 'spor', belediye: 'belediye', silah_magazasi: 'silah', araba_galerisi: 'galeri', fabrika: 'fabrika', internet_kafe: 'netkafe', modifiye_garaji: 'modifiye', casino: 'casino', park: 'park', bar: 'bar', cafe: 'cafe', yaris_pisti: 'pist', stadyum: 'stadyum', ev: 'ev', liman_depo: 'liman', hastane: 'hastane', benzinlik: 'benzinlik', otogar: 'otogar', taksi_duragi: 'taksi_duragi', ofis: 'ofis' };
  // v157: girilebilir mekânın İÇİNDE, kapının iç tarafında (yüz içeriye dönük)
  function venueSpawn(type) {
    const v = W.venues.find((q) => q.type === type);
    if (!v) return null;
    // v159: kapalı dükkân → kapının önünde (dışarıda, düğmelerin içinde), yüz kapıya dönük
    // v159.1: karargah da (şehirdeki içi kaldırıldı) — kapının önünde
    if (v.closedShop || v.isolated) {
      const o = fromRoom(v, v.doorX ?? 0, VROOM.D / 2 + (v.isolated ? 1.7 : 2.4));
      return { x: o.x, z: o.z, yaw: v.ry, pitch: 0.36 };
    }
    const p = fromRoom(v, v.doorX ?? 0, VROOM.D / 2 - 3.2);
    return { x: p.x, z: p.z, yaw: v.ry, pitch: 0.36, venue: true };
  }
  function spawnPoint(key) {
    // v162: parktaki şüpheli adamın yanı ("Git" → risksiz satış hatırlatması). Düğmesinin (bölge
    // yarıçapı 2,4 m) tam ortasında doğulur → "🕶️ Şüpheli adam" düğmesi hemen çıkar; kamera
    // oyuncunun arkasında, şüpheli adama bakar.
    if (key === 'park_shady') {
      const sz = zones.find((z) => z.kind === 'park' && z.act === 'npc');
      if (sz) {
        const npc = npcDefs.find((n) => n.id === 'npc_supheli') || null;
        const yaw = npc ? Math.atan2(sz.x - npc.x, sz.z - npc.z) : Math.PI;
        return { x: sz.x, z: sz.z, yaw, pitch: 0.36 };
      }
      key = 'park';
    }
    // v177: oyunun motor galerisi (camiinin arkası) — kapısının önü, yüz kapıya dönük
    // v198: oto tamirci (hastane + belediyenin yanı) — kapısının önü
    if (key === 'tamirci' || key?.region === 'tamirci') {
      const tz = zones.find((z) => z.kind === 'shopDoor' && z.venue === 'tamirci');
      if (tz) return { x: tz.x + Math.sin(tz.out) * 1.4, z: tz.z + Math.cos(tz.out) * 1.4, yaw: tz.out, pitch: 0.36 };
    }
    if (key === 'motor_galerisi' || key?.region === 'motor_galerisi') {
      const mz = zones.find((z) => z.kind === 'shopDoor' && z.venue === 'motogaleri');
      if (mz) return { x: mz.x + Math.sin(mz.out) * 1.4, z: mz.z + Math.cos(mz.out) * 1.4, yaw: mz.out, pitch: 0.36 };
    }
    // v196: oyun açılışı — oyuncunun EVİNİN İÇİNDE (giriş katı, kapının iç tarafı), yüz odaya dönük
    if (key === 'ev' && EV) {
      EV.root.updateMatrixWorld(true);
      const p = fromRoom(EV, EV.ml.door.x, EV.ml.door.z - 0.6);
      return { x: p.x, z: p.z, yaw: EV.ry, pitch: 0.32, home: true };
    }
    // v157: Kervankent / dış dünya noktası
    if (key && typeof key === 'object' && key.world && Number.isFinite(key.x) && Number.isFinite(key.z)) return { x: key.x, z: key.z, yaw: key.yaw ?? Math.PI };
    // v157.4: oyun açılışı — evin kapısının ÖNÜNDE (dışarıda), yüz yola dönük
    if (key && typeof key === 'object' && key.region && key.out) {
      const v = W.venues.find((q) => q.type === (REGION_LOT[key.region] || key.region));
      if (v) {
        // v159.3: kapıdan biraz daha uzakta, yola yakın (kapıdaki "Evler" listesi açılış anında açılmasın)
        for (const dz of [7.2, 6.4, 5.6, 3.5]) {
          const p = fromRoom(v, v.doorX ?? 0, VROOM.D / 2 + dz);
          if (!blockedAt(p.x, p.z)) return { x: p.x, z: p.z, yaw: v.ry + Math.PI, pitch: 0.36 };
        }
      }
    }
    if (typeof key === 'string' || (key && typeof key === 'object' && key.region)) {
      const k = typeof key === 'string' ? key : key.region;
      const vs = venueSpawn(REGION_LOT[k] || k);
      if (vs) return vs;
    }
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
    // v158.2: yarış pisti — pitin önündeki "🏁 Pit · Yarış" düğmesinin TAM içinde doğulur (eskiden 3,4 m
    // ötede, düğme yarıçapının dışında kalıyordu); kamera pist tarafında, yüz pite dönük
    if (lt === 'pist') {
      const pz = zones.find((z) => z.kind === 'pist');
      if (pz) return { x: pz.x + Math.sin(pz.out) * 1.2, z: pz.z + Math.cos(pz.out) * 1.2, yaw: pz.out, pitch: 0.42 };
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
  let sp0f = sp0.home ? sp0 : freeNear(sp0.x, sp0.z) || sp0;
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
  me.y = sp0.home ? 0.16 : groundY(self.x, self.z);
  if (sp0.home) evY = 0.16;
  let view = '3d';
  const top = { az: Math.PI / 4, el: 0.98, dist: 46 };
  const topCur = { ...top };

  // hedef halkası
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32), new THREE.MeshBasicMaterial({ color: '#19e8ff', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // --- NPC'ler (satıcılar, büfeci, şüpheli adam) ----------------------------------
  // v157: mekân içi NPC'ler + yol üstü / köy / orman NPC'leri de aynı listede
  const outerNpcIds = new Set(W.npcDefs.map((n) => n.id));
  const npcs = [...npcDefs, ...venueNpcDefs, ...W.npcDefs].map((n) => {
    const f = new Fig(scene, layer, { id: n.id, name: n.name, avatar: n.av, npc: true, lazy: true });
    // v157.4: köy / yol üstü / park botlarının isim etiketi yok (konuşma balonu kalır)
    if (n.outer || outerNpcIds.has(n.id)) f.nameEl.style.display = 'none';
    f.x = n.x;
    f.z = n.z;
    f.y = n.y != null ? n.y : groundY(n.x, n.z);
    f.facingLeft = Boolean(n.left);
    f.lines = n.lines || [];
    f.vendor = n.vendor;
    f.venue = n.venue || null; // etiketi sadece o mekânın içindeyken görünür
    f.quiet = Boolean(n.quiet); // konuşmayı mekân katmanı (VenueLayer) yönetir
    f.off = Boolean(n.off); // v197: kapalı NPC (ör. imam yokken) hiç çizilmez
    if (n.sit) {
      // v202: minderde oturan NPC (camideki dilenciler)
      f.sitting = true;
      f.seatY = f.y + n.sit;
    }
    if (n.route) f.route = n.route; // v196: devriye (bot garson)
    return f;
  });
  // v151 — meslek görselleri (hedef işareti, bot yolcular, şüpheli araç) — sadece şoförde
  const jobWorld = snapshot ? null : createJobWorld({ scene, layer, Fig, groundY: (x, z) => groundY(x, z), buildVehicle, placeLabel: (...a) => placeLabel(...a) });
  // v149 — stadyumda canlı maç (cihazda simülasyon; snapshot motorunda yok)
  const stadLot = city.lots.find((l) => l.type === 'stadyum' && l.info?.match);
  const stadium = stadLot && !snapshot
    ? createStadiumMatch({
        scene,
        layer,
        Fig,
        group: stadLot.kit.group,
        info: stadLot.info.match,
        groundY: (x, z) => groundY(x, z),
        onGoal: (e) => onEvent?.({ type: 'stadiumGoal', inside: areaAt(self.x, self.z) === 'stadyum', ...e }),
      })
    : null;
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
  // v168 — Rıza Amca senaryosu: 'npc_' kimlikli uzak "oyuncular" bu cihazdaki senaryo karakterleri.
  // Sinematik sırasında gerçek oyuncular ve arabaları SADECE bu ekranda gizlenir (ağa dokunulmaz).
  const isStoryId = (id) => typeof id === 'string' && id.startsWith('npc_');
  let storyHideReal = false;
  let storyLock = false; // v168.1: sinematikte yürüme kapalı, kamerayla etrafa bakmak serbest
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
    // v154 — SAAT FARKI: sunucu zamanı (t) bu cihazın saatine çevrilir (bilgisayar saati kayıksa
    // eskiden gecikme hiç ölçülmüyor, figür ilk konumda takılı kalıp zıplıyordu). Fark = son 8 sn'nin
    // en küçük (yerel − sunucu) değeri; kalan "lat" sadece gerçek ağ gecikmesi.
    const lt = Date.now();
    const tsrv = Number(st.t) || lt;
    const last = r.buf[r.buf.length - 1];
    if (!last || tsrv > last.srv) {
      const offs = (r.offs ||= []);
      offs.push({ at: lt, v: lt - tsrv });
      while (offs.length > 1 && lt - offs[0].at > 8000) offs.shift();
      let minOff = Infinity;
      for (const o of offs) if (o.v < minOff) minOff = o.v;
      const t = tsrv + minOff;
      // v192: kayıt aralığı (kalabalıkta gönderen seyrekleşir → ara değer gecikmesi buna göre uzar)
      if (last && tsrv - last.srv < 2500) r.iv = r.iv == null ? tsrv - last.srv : r.iv + (tsrv - last.srv - r.iv) * 0.25;
      if (last && Math.hypot(st.x - last.x, st.z - last.z) > 12) r.buf.length = 0; // ışınlandı
      r.buf.push({ t, srv: tsrv, x: st.x, z: st.z });
      if (r.buf.length > 8) r.buf.shift();
      const lat = lt - t; // ≥ 0: en kısa gecikmenin üstündeki titreme
      r.lat = r.lat == null ? lat : r.lat + (lat - r.lat) * (lat < r.lat ? 0.5 : 0.15);
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
    // v150: modifiye (m: kayıtlı modifiyenin JSON'u) değişince araba yeniden kurulur
    const mk = typeof st.m === 'string' ? st.m : '';
    if (!c || c.id !== st.v || c.mk !== mk) {
      if (c) removeCar(uid);
      let mods = null;
      try {
        mods = mk ? JSON.parse(mk) : null;
      } catch {
        mods = null;
      }
      const v = buildVehicle(st.v, mods);
      v.root.rotation.order = 'YXZ'; // v157: yokuşta gövde eğimi
      if (!v.silent) {
        // v166: bisiklet / atta far ışığı yok (diğer oyuncuların atında da)
        const head = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.5), headMat('#ffe9b8', 0.45));
        head.rotation.x = -Math.PI / 2;
        head.position.set(0, 0.04, v.len / 2 + 3.9);
        v.root.add(head);
      }
      scene.add(v.root);
      c = { v, id: st.v, mk, x: st.x, z: st.z, y: groundY(st.x, st.z), yaw: st.y, tx: st.x, tz: st.z, tyaw: st.y, spd: 0, steer: 0, t: 0, yr: 0, ex: 0, ez: 0, eyaw: 0 };
      rcars.set(uid, c);
    }
    // v149: kaydın ölçüldüğü an — gönderenin (sunucuya göre düzeltilmiş) saati. Sunucu damgası
    // (t) ağ gecikmesiyle oynar; her kayıtta araba ileri-geri sıçrıyordu ("yarım saniyede bir takılma").
    // v154 — SAAT FARKI DÜZELTMESİ (bilgisayarda "ışınlanan araba"): kaydın zamanı gönderenin
    // saatiyle ölçülür, tahmin alıcının saatiyle yapılır. Telefonların saati aynıdır ama bilgisayar
    // saati sık sık birkaç saniye kayıktır → tahmin ya hiç çalışmıyor (araba sadece kayıt gelince
    // zıplıyor) ya da hep ileri gidip geri sıçrıyordu. Artık her uzak araba için "benim saatim −
    // onun saati" farkı gelen kayıtlardan ölçülür (son 8 sn'nin en küçüğü = saat farkı + en kısa
    // ağ gecikmesi) ve kayıt zamanı BENİM saatime çevrilir. Saatler ne kadar kayık olursa olsun doğru.
    const lt = Date.now();
    const ts = Number(st.t) || lt;
    const ct = Number(st.ct);
    const src = Number.isFinite(ct) && ct > 0 ? ct : ts;
    if (c.src && src <= c.src) return; // eski / aynı kayıt (gönderenin kendi saatine göre)
    const offs = (c.offs ||= []);
    offs.push({ at: lt, v: lt - src });
    while (offs.length > 1 && lt - offs[0].at > 8000) offs.shift();
    c.src = src;
    const buf = (c.buf ||= []);
    const last = buf[buf.length - 1];
    // v175: ışınlandı / yeniden doğdu → tampon sıfırlanır, araba yeni yerinde başlar
    if (last && Math.hypot(st.x - last.x, st.z - last.z) > 25 + Math.abs(last.s) * Math.max(0, (src - last.t) / 1000) * 1.5) {
      buf.length = 0;
      c.stale = [];
      c.ex = 0;
      c.ez = 0;
      c.eyaw = 0;
      c.del = null;
    }
    // kayıt beklemesi (sadece araba hareket hâlindeyken anlamlı; park halindeki seyrek kayıt sayılmaz)
    const stale = (c.stale ||= []);
    const prev = buf[buf.length - 1];
    if (prev && Math.abs(prev.s) > 0.3) stale.push({ at: lt, v: Math.min(lt - prev.t, lt - src + 1500) });
    while (stale.length && lt - stale[0].at > 6000) stale.shift();
    // ekranda şu an çizilen konum (yeni kayıt eklenmeden ÖNCE)
    const before = predictCar(c);
    if (prev) {
      let dy = st.y - prev.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const dts = (src - prev.t) / 1000;
      const yr = dts > 0.05 && dts < 1.5 ? clamp(dy / dts, -3, 3) : 0;
      c.yr = c.yr * 0.4 + yr * 0.6;
    }
    buf.push({ t: src, x: st.x, z: st.z, yaw: st.y, s: st.s || 0 });
    while (buf.length > 2 && (buf.length > 120 || src - buf[1].t > 3000)) buf.shift();
    if (c.del == null) c.del = lt - src + 60;
    c.tx = st.x;
    c.tz = st.z;
    c.tyaw = st.y;
    c.t = lt;
    c.spd = st.s || 0;
    c.steer = st.st || 0;
    if (!st.d || Math.abs(c.spd) < 0.05) c.yr = 0;
    c.name = st.n || c.name;
    // v151: j = 0 iş dışı · 1 + n = işte, n bot yolcu (sadece görüntü; yolcular RTDB'de yok)
    const j = Math.max(0, Math.min(40, Math.floor(Number(st.j) || 0)));
    if (j !== c.j) {
      c.j = j;
      setPax(c, Math.max(0, j - 1));
    }
    const after = predictCar(c);
    // ekrandaki konum = tahmin + sönümlenen hata
    c.ex = before.x + c.ex - after.x;
    c.ez = before.z + c.ez - after.z;
    let ey = before.yaw + c.eyaw - after.yaw;
    while (ey > Math.PI) ey -= Math.PI * 2;
    while (ey < -Math.PI) ey += Math.PI * 2;
    c.eyaw = ey;
    if (Math.hypot(c.ex, c.ez) > 12) {
      c.ex = 0;
      c.ez = 0;
      c.eyaw = 0;
    }
  }
  // v175 — YOLCU TİTREMESİ: uzak araba artık "son kayıttan ileri tahmin" yerine kısa bir tampondan
  // GEÇMİŞTEKİ bir anın konumu olarak çizilir (diğer oyuncuların yürüyüşü gibi). Mobil ağ kayıtları
  // çoğu zaman 3-4'ü bir arada, ~1 sn'de bir getirir; eski tahmin her toplu gelişte geri çekilip ileri
  // atılıyordu → yolcu ekranında araba "saniyede bir ilerliyor" gibi titriyordu (yavaşken çok belirgin).
  // Gecikme ağa göre kendini ayarlar (düzgün ağda kısa, toplu gelişte ~1 sn), kayıtların arası konum +
  // hız + yönle eğrisel doldurulur. Ağdan ek veri yok; Firestore / RTDB okuma-yazma aynı.
  function carSampleAt(c, T) {
    const b = c.buf;
    if (!b || !b.length) return null;
    const l = b[b.length - 1];
    if (T >= l.t) {
      // tamponun ötesi (kayıt gecikti): son kayıttan kısa tahmin (en fazla 1,2 sn)
      const age = clamp((T - l.t) / 1000, 0, 1.2);
      if (Math.abs(l.s) < 0.05) return { x: l.x, z: l.z, yaw: l.yaw };
      const yaw = l.yaw + (c.yr || 0) * age;
      const mid = l.yaw + (c.yr || 0) * age * 0.5;
      return { x: l.x + Math.sin(mid) * l.s * age, z: l.z + Math.cos(mid) * l.s * age, yaw };
    }
    if (T <= b[0].t) return { x: b[0].x, z: b[0].z, yaw: b[0].yaw };
    let i = b.length - 1;
    while (i > 1 && b[i - 1].t > T) i--;
    const a = b[i - 1];
    const e = b[i];
    const span = Math.max(1, e.t - a.t);
    const u = clamp((T - a.t) / span, 0, 1);
    let dy = e.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = a.yaw + dy * u;
    const sp = span / 1000;
    const d = Math.hypot(e.x - a.x, e.z - a.z);
    // hız yönü ile kayıtlar arası yol çok farklıysa (ani fren / geri vites) düz çizgi — eğri taşmasın
    const ok = d > 0.02 && Math.abs(Math.abs(a.s) + Math.abs(e.s)) * 0.5 * sp < d * 2 + 0.5;
    if (!ok) return { x: a.x + (e.x - a.x) * u, z: a.z + (e.z - a.z) * u, yaw };
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const ax = Math.sin(a.yaw) * a.s * sp;
    const az = Math.cos(a.yaw) * a.s * sp;
    const ex = Math.sin(e.yaw) * e.s * sp;
    const ez = Math.cos(e.yaw) * e.s * sp;
    return { x: h00 * a.x + h10 * ax + h01 * e.x + h11 * ex, z: h00 * a.z + h10 * az + h01 * e.z + h11 * ez, yaw };
  }
  function predictCar(c) {
    if (!c.buf?.length || c.del == null) return { x: c.tx, z: c.tz, yaw: c.tyaw };
    return carSampleAt(c, Date.now() - c.del) || { x: c.tx, z: c.tz, yaw: c.tyaw };
  }
  // gecikme hedefi: son 6 sn'de kayıtların en uzun beklettiği süre (+ pay), en az en kısa gecikme + 60 ms
  function carDelayTarget(c) {
    let minL = Infinity;
    for (const o of c.offs || []) if (o.v < minL) minL = o.v;
    if (!Number.isFinite(minL)) return c.del;
    let mx = minL;
    for (const o of c.stale || []) if (o.v > mx) mx = o.v;
    return clamp(mx + 50, minL + 60, minL + 1300);
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
      // v192: arabadaki oyuncunun kişi kaydı seyrek gelir (konumu araba taşır) → uzaklık arabadan
      const own = r.st?.p === 'd' ? r.uid : r.st?.p === 'r' ? r.st.ro : null;
      const oc = own && own !== myUid ? rcars.get(own) : null;
      const d = oc ? Math.hypot(oc.x - self.x, oc.z - self.z) : Math.hypot(r.fig.tx - self.x, r.fig.tz - self.z);
      r.d = d;
      r.story = isStoryId(r.uid);
      list.push(r);
    });
    // v168: senaryo karakterleri sıralamada önce (kalabalıkta en yakın 16 kişinin dışında kalmasınlar)
    list.sort((a, b) => (a.story === b.story ? a.d - b.d : a.story ? -1 : 1));
    let rank = 0;
    list.forEach((r) => {
      const f = r.fig;
      const st = r.st;
      const hid = storyHideReal && !r.story;
      const vis = !hid && rank < MAX_VIS && r.d < VIS_DIST;
      if (!hid) rank += 1;
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
        f.motoHat = motoHatOf(carObj.v);
        f.carYaw = carObj.yaw;
        f.moving = false;
        show = vis && carObj.v.open;
      } else {
        // v154: lat artık saat farkından arınmış titreme (≈0); eski gecikme bütçesi (~0,5 sn) korunur
        // v192: seyrek kayıtta (kalabalık) gecikme kayıt aralığının ~1,35 katı — bugünkü sıklıkta (≈330 ms) aynı 480 ms
        const p = sampleAt(r, Date.now() - clamp((r.lat || 0) + Math.max(480, (r.iv || 0) * 1.35), 480, 1700));
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
        f.y += (standY(f.x, f.z, -1, st.y ?? f.y) - f.y) * Math.min(1, dt * 10);
        if (st.p === 's') {
          f.sitting = true;
          f.seatY = st.sy ?? 0.5;
          f.moving = false;
          // v207: 3D avatar için en yakın koltuğun yönü (konum değişmedikçe yeniden aranmaz)
          if (f.s3x == null || Math.abs(f.s3x - f.x) + Math.abs(f.s3z - f.z) > 0.3) {
            f.s3x = f.x;
            f.s3z = f.z;
            f.seat3Yaw = seatYawNear(f.x, f.z);
          }
        } else f.seat3Yaw = null;
      }
      if (show && isoV && W.inVenueRoom(f.x, f.z) !== isoV) show = false; // v158: karargahtayken sadece içerdekiler
      // v196: herkes kendi evinde (ayrı oda). Evdeyken sadece aynı evdekiler; dışarıdayken evdekiler görünmez
      if (show && EV) {
        if (curVenue?.ml) show = Boolean(r.st.hm) && r.st.hm === (evHome?.id || '_');
        else if (r.st.hm) show = false;
      }
      f.group.visible = show;
      if (show) {
        f.sink = waters.length ? sinkAt(f.x, f.z) : 0;
        f.standYaw = !f.sitting && !f.inCar ? standsYaw(f.x, f.z) : null;
        // tribün koltuğunda oturan uzak oyuncu da sahaya dönük (ense)
        if (f.sitting && !f.inCar) f.seatYaw = standsYaw(f.x, f.z);
        f.update(dt, camera, now);
      }
      else if (f.pet) {
        f.pet.sprite.visible = false;
        f.pet.leash.visible = false;
      }
    });
  }
  function updateRemoteCars(dt) {
    rcars.forEach((c, uid) => {
      // v149: fark daha yumuşak kapanır (küçük farklar görünmez, büyükler hızlı)
      // v175: tampon gecikmesi ağa göre yavaşça ayarlanır (artarken hızlı, azalırken çok yavaş — akış bozulmaz)
      if (c.del != null) {
        const tg = carDelayTarget(c);
        if (tg != null) c.del += (tg - c.del) * Math.min(1, dt * (tg > c.del ? 2.5 : 0.35));
      }
      const big = Math.hypot(c.ex, c.ez) > 2.5;
      const decay = Math.exp(-dt * (big ? 6 : 3.2));
      c.ex *= decay;
      c.ez *= decay;
      c.eyaw *= decay;
      const p = predictCar(c);
      c.x = p.x + c.ex;
      c.z = p.z + c.ez;
      c.yaw = p.yaw + c.eyaw;
      const far = Math.hypot(c.x - self.x, c.z - self.z) > VIS_DIST + 20 || (storyHideReal && !isStoryId(uid)); // v168
      c.v.root.visible = !far;
      if (far) return;
      // v163: uzak araba da aynı yer çekimiyle zıplar / süzülür (ağdan ek veri gerekmez)
      c.gp = slopeOf(c, c.gp || 0, dt);
      carVertical(c, carGroundY(c, -1), c.spd || 0, dt); // v167: suda yüzeye yakın
      c.v.root.position.set(c.x, c.y, c.z);
      let dy = c.yaw - (c.lastYaw ?? c.yaw);
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.lastYaw = c.yaw;
      c.v.root.rotation.set(-Math.atan(c.gp), c.yaw, Math.atan(c.gr || 0));
      // motor: dönüşe yatar
      if (c.v.moto) {
        const horse = c.v.ride === 'horse';
        c.roll = (c.roll || 0) + (clamp((-c.spd * dy) / Math.max(dt, 1e-3) * (horse ? 0.008 : 0.045), horse ? -0.08 : -0.6, horse ? 0.08 : 0.6) - (c.roll || 0)) * Math.min(1, dt * 6);
        c.v.tilt.rotation.z = c.roll;
      }
      c.v.gait?.(c.spd, dt, dy / Math.max(dt, 1e-3)); // v159.4: diğer oyuncuların atı da adım atar
      c.v.wheels.forEach((w) => {
        w.spin.rotation.z -= (c.spd * dt) / w.r;
        if (w.front && !w.moto) w.pivot.rotation.y = c.steer;
      });
      stepTrailer(c, c.spd, dy, dt);
      flashVehicle(c.v, c.j > 0);
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
    me.motoHat = motoHatOf(c.v);
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
  // v151 — meslek: işteyken tepe lambası + bot yolcular (ağa j olarak gider)
  const myJob = { on: false, pax: 0 };
  let driving = false;
  let fall = null; // v216: binekten fırlama { rd, t, rest, up } — sadece bu cihazda, ağa yeni veri gitmez
  let ejectReq = null;
  const driveIn = { thr: 0, steer: 0, hand: false };
  let camShake = 0;
  let driveCamOff = 0;
  let driveCamIdle = 9;
  let driveFov = 60;
  // v149 — ARABA İÇİ KAMERA: sürücü ve yolcular koltuktan bakar; parmakla serbestçe çevrilir.
  // Sürücüde bir süre dokunulmazsa yola döner, yolcuda istediği yöne bakılı kalır.
  let carCam = 'out';
  const inLook = { yaw: 0, pitch: -0.06 };
  let interiorCar = null; // içinden bakılan araba
  let dbgPv = null; // v157.9: yalnız geliştirme önizlemesi — sürerken yolcu gözünden bak
  let inYawSm = null; // v151: iç kamerada baş ataleti
  // v150: araçların içi artık modelli (koltuk, torpido, direksiyon, şeffaf cam) — kamera
  // sadece koltuktaki göz hizasına yerleşir; ek kokpit parçası / gövde gizleme yok.
  function cockpitOf(c, k) {
    const key = `ck${k}`;
    if (c.v[key]) return c.v[key];
    const sp = c.v.seatPts[Math.min(k, c.v.seatPts.length - 1)];
    // gövde yerelinden araba köküne (gövde -90° dönük → x' = -z, z' = x)
    // v151: göz biraz daha yukarıda ve geride (torpido ekranı kaplamasın, kaput + yol görünsün)
    const up = c.v.moto ? 0.95 : 0.55;
    const back = c.v.moto ? 0.05 : 0.12;
    // kapalı arabada koyu tavan döşemesi (içeriden boya rengi tavan görünmesin)
    const cab = c.v.spec?.cab;
    if (cab && c.v.closed && !c.v.headliner && c.v.body) {
      const x0 = Math.min(cab.Bp[0], cab.Cp[0]);
      const x1 = Math.max(cab.Bp[0], cab.Cp[0]);
      const y = Math.min(cab.Bp[1], cab.Cp[1]) - 0.035;
      const hl = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.1, 0.03, (c.v.spec.Wd || 1.8) - 0.42), new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.95 }));
      hl.position.set((x0 + x1) / 2, y, 0);
      c.v.body.add(hl);
      c.v.headliner = hl;
    }
    // göz tavanın altında kalsın
    const roofY = cab && c.v.closed ? Math.min(cab.Bp[1], cab.Cp[1]) - 0.16 : Infinity;
    c.v[key] = { eye: new V(-sp[2] * (c.v.moto ? 1 : 0.92), Math.min(sp[1] + up, roofY), sp[0] - back) };
    return c.v[key];
  }
  // v154 — YOLCU İÇ KAMERASI: koltuğa göre ayrı göz noktası.
  //  · otomobil ön yolcu: sürücünün aynası (sağ koltuk), ayrıntılı kokpitle
  //  · otomobil arka yolcu: ön koltukların arasından, kokpitle
  //  · otobüs / minibüs: ön kapının yanında ayakta, ön camdan bakar (herkes aynı yerden)
  //  · motor: sürücünün kafasının üstünden ve biraz geriden
  // dönüş: { eye, rig } — rig: sürücünün kokpiti bu yolcuya da gösterilsin mi
  function passengerView(c, k) {
    const key = `pv${k}`;
    if (c.v[key]) return c.v[key];
    const d0 = cockpitOf(c, 0).eye;
    const base = cockpitOf(c, k).eye;
    const seats = c.v.def?.seats || 2;
    let pv;
    if (c.v.moto) {
      pv = { eye: new V(base.x, base.y + 0.42, base.z - 0.22), rig: false };
    } else if (seats > 4 && c.v.len > 5.2) {
      // otobüs: göz şoförün sağ arkasında, ayakta (tavanın altında kalır)
      const cab = c.v.cabin;
      const y = cab ? Math.min(cab.floor + 1.55, cab.roof - 0.3) : d0.y + 0.32; // v157.9: zemin gerçek iç zemin
      pv = { eye: new V(-d0.x * 0.55, y, d0.z - 0.55), rig: false, bus: true };
    } else if (c.v.len > 5.6) {
      // tır / ambulans / karavan: ön yolcu sürücünün aynası, arkadakiler kendi koltuğundan
      pv = k === 1 ? { eye: new V(-d0.x, d0.y, d0.z), rig: true } : { eye: base, rig: false };
    } else if (k === 1) {
      pv = { eye: new V(-d0.x, d0.y, d0.z), rig: true };
    } else {
      // arka koltuk: ortaya yakın, biraz yüksek → iki ön koltuğun arasından yol görünür
      const side = Math.sign(base.x || 1);
      pv = { eye: new V(side * Math.min(0.22, Math.abs(d0.x) * 0.6), d0.y + 0.05, d0.z - 0.95), rig: true };
    }
    c.v[key] = pv;
    return pv;
  }
  // v153 — ayrıntılı birinci şahıs kokpit (motorda yok). Aracın kendi kaba iç parçaları gizlenir.
  function cockpitRig(c, ck) {
    if (c.v.moto) return null;
    if (c.v.rig !== undefined) return c.v.rig;
    let mods = null;
    try {
      mods = c.mk ? JSON.parse(c.mk) : null;
    } catch {
      mods = null;
    }
    let cfg = {};
    try {
      cfg = vehicleConfig(c.v.catalogId, mods) || {};
    } catch {
      cfg = {};
    }
    const big = c.v.len > 6.5;
    const rig = buildCockpit({
      closed: c.v.closed !== false && cfg.cab !== false,
      accent: cfg.acc?.neon || mods?.neonColor || cfg.neonColor || '#19e8ff',
      trim: cfg.interior || '#1a1a1d',
      body: cfg.paint || '#777777',
      halfW: c.v.halfW || 0.9,
      eyeX: ck.eye.x,
      big,
    });
    const host = c.v.tilt || c.v.root;
    rig.group.position.copy(ck.eye);
    if (c.v.tilt) rig.group.position.sub(new V(c.v.tilt.position.x, c.v.tiltY0 ?? c.v.tilt.position.y, c.v.tilt.position.z)); // v193: süspansiyon salınımı hariç
    rig.group.visible = false;
    host.add(rig.group);
    c.v.rig = rig;
    return rig;
  }
  // iç kamerada aracın dış gövdesi gizlenir (kaput, sütunlar, tavan kokpitte ayrıca çizili);
  // farların yere düşen ışığı (keepFp) kalır
  function showRig(c, on) {
    const rig = c?.v?.rig;
    if (!rig) return;
    rig.group.visible = on;
    if (on) {
      const hid = [];
      c.v.root.traverse((o) => {
        if (!o.isMesh || !o.visible || o.userData.keepFp) return;
        for (let p = o; p; p = p.parent) if (p === rig.group) return;
        o.visible = false;
        hid.push(o);
      });
      c.v.fpHidden = hid;
    } else {
      (c.v.fpHidden || []).forEach((o) => {
        o.visible = true;
      });
      c.v.fpHidden = null;
    }
  }
  function setInterior(c) {
    if (interiorCar === c) return;
    if (interiorCar) showRig(interiorCar, false);
    interiorCar = c;
    const near = c ? 0.06 : IS_MOBILE ? 0.3 : 0.15;
    inYawSm = null;
    if (camera.near !== near) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  }
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
  // v193 — KIVILCIM (çarpma / sert iniş / duvara sürtünme): 48'lik havuz, ek çizim çağrısı yok denecek kadar az
  const sparkTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(0.35, 'rgba(255,190,80,0.9)');
    gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const sparks = [];
  for (let i = 0; i < 48; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sp.visible = false;
    sp.scale.setScalar(0.16);
    scene.add(sp);
    sparks.push({ sp, t: 1, life: 0.5, vx: 0, vy: 0, vz: 0 });
  }
  let sparkI = 0;
  // n kıvılcım (x, y, z) noktasından, (nx, nz) yönüne doğru yelpaze; güç = çarpma hızı (m/sn)
  function sparkBurst(x, y, z, nx, nz, power, n) {
    for (let i = 0; i < n; i++) {
      const p = sparks[sparkI++ % sparks.length];
      const a = Math.atan2(nz, nx) + (Math.random() - 0.5) * 2.2;
      const sp = (1.5 + Math.random() * 2.5) * Math.min(2.4, 0.5 + power * 0.08);
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = 1.2 + Math.random() * 2.8;
      p.t = 0;
      p.life = 0.35 + Math.random() * 0.4;
      p.sp.position.set(x, y, z);
      p.sp.visible = true;
    }
  }
  function stepSparks(dt) {
    for (const p of sparks) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / p.life);
      p.vy -= 9.8 * dt;
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      const k = 1 - p.t;
      p.sp.scale.setScalar(0.06 + 0.12 * k);
      p.sp.material.opacity = k;
      if (p.t >= 1) p.sp.visible = false;
    }
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
  // v163: havadayken engel / köprü kontrolü zemine yakın yükseklikle yapılır (yoldan ±4 m'yi aşınca
  // yol "bulunamayıp" havada duvara çarpmasın)
  const carCollideY = () => (myCar.air && myCar.airGy != null ? Math.min(myCar.y, myCar.airGy + 1.5) : myCar.y);
  function carFree(x, z, yaw) {
    const r = myCar.v.halfW * 0.82;
    // v157.4: bisiklet / at — yayaların girdiği her yere girer (araç ya da yaya ızgarasında boşsa geçer)
    if (myCar.v.walker) {
      const cy = carCollideY();
      // v167: bariyer / köprü duvarı binekleri de durdurur (zaten bariyerin üstündeyse — eski kayıt / ışınlanma — çıkabilsin)
      const rail = !W.railWalkBlocked(myCar.x, myCar.z, 0.3, cy, true, carHint);
      for (const [px, pz] of carCircles(x, z, yaw)) if ((carBlockedAt(px, pz, 0.3, cy) && blockedAt(px, pz, 0.3)) || (rail && W.railWalkBlocked(px, pz, 0.3, cy, true, carHint))) return 'wall';
      return null;
    }
    for (const [px, pz] of carCircles(x, z, yaw)) if (carBlockedAt(px, pz, r, carCollideY())) return 'wall';
    return null;
  }
  // v157: yokuş eğimi (arabanın önü ile arkası arasındaki yükseklik farkı) — şehirde düz
  // v163: şehir / kasaba dışında (otoyol, köy yolu, arazi) gövde zemine oturur: önü-arkası
  // (eğim, c.gp) VE sağı-solu (yatış, c.gr). Havadayken gövde son açısında kalır, burnu yavaşça düşer.
  function slopeOf(c, gp, dt, hint = -1) {
    const k = Math.min(1, dt * 7);
    if (c.air) {
      // v193 — HAVADA SÜZÜLME (prototipteki uçuş dengesi + hava kontrolü): burun yörüngeye döner (çıkarken
      // yukarı, inerken aşağı), rampadan dönerek çıkan araba dönmeye devam eder; gaz burnu indirir, fren
      // kaldırır, direksiyon yatırır. Girdi ancak havada bırakılıp yeniden basılınca sayılır (rampaya gazla
      // giren burnunu yere gömmesin).
      const mine = c === myCar && driving;
      const arm = (c.airArm ||= { p: false, r: false });
      const thrIn = mine ? driveIn.thr || (keys.KeyW || keys.ArrowUp ? 1 : keys.KeyS || keys.ArrowDown ? -1 : 0) : 0;
      const stIn = mine ? driveIn.steer || (keys.KeyA || keys.ArrowLeft ? -1 : keys.KeyD || keys.ArrowRight ? 1 : 0) : 0;
      if (!thrIn) arm.p = true;
      if (!stIn) arm.r = true;
      const a = { gp, gpV: c.gpV || 0 };
      airPitch(a, c.vy || 0, c.lastVF || 0, arm.p ? thrIn : 0, dt, { assist: c.v.len > 6 ? 0.9 : 0.6 });
      c.gpV = a.gpV;
      // yatış: kalkıştaki yan dönüş sürer, havada yavaş söner; direksiyon hafifçe yatırır
      c.grV = (c.grV || 0) * Math.exp(-dt * 0.9) + (arm.r ? -stIn : 0) * 1.6 * dt - (c.gr || 0) * 1.2 * dt;
      c.gr = clamp((c.gr || 0) + c.grV * dt, -0.6, 0.6);
      return a.gp;
    }
    c.airArm = null;
    let want = 0;
    let wantR = 0;
    const m = W.modeAt(c.x, c.z);
    if (m !== 'city' && m !== 'town') {
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      const L = Math.max(1.4, (c.v.len || 4) * 0.45);
      const a = groundY(c.x + fx * L, c.z + fz * L, hint, c.y);
      const b = groundY(c.x - fx * L, c.z - fz * L, hint, c.y);
      want = clamp((a - b) / (2 * L), -0.55, 0.55);
      // gövdenin sol tarafı (yerel +x) = (cos yaw, −sin yaw)
      const Wd = Math.max(0.45, (c.v.halfW || 0.9) * 0.9);
      const l = groundY(c.x + fz * Wd, c.z - fx * Wd, hint, c.y);
      const r = groundY(c.x - fz * Wd, c.z + fx * Wd, hint, c.y);
      // motor / bisiklet / at iki tekerlekte (ayakta) durur — yan eğime çok az uyar
      wantR = clamp((l - r) / (2 * Wd), -0.45, 0.45) * (c.v.moto ? 0.25 : 1);
    }
    c.gr = (c.gr || 0) + (wantR - (c.gr || 0)) * k;
    c.gpGround = want; // v193: iniş açısı farkı için
    return gp + (want - gp) * k;
  }
  // v163 — YER ÇEKİMİ: yerdeyken araba zemini izler (dikey hızı = ileri hız × eğim); zemin
  // arabanın düşebileceğinden hızlı alçalırsa (tepe, rampa ucu, basamak) araba havalanır, yer
  // çekimiyle süzülüp yere iner. Sert inişte dönüş = çarpma hızı (sarsıntı / ses için).
  const CAR_G = 22;
  function carVertical(c, gy, vF, dt) {
    if (!(dt > 0) || !Number.isFinite(c.y) || Math.abs(c.y - gy) > 30) {
      c.y = gy;
      c.vy = 0;
      c.air = false;
      c.flying = false;
      return 0;
    }
    const vyRoad = clamp(vF * (c.gp || 0), -25, 8); // en çok ~1,5 m sıçrar (bariyer / köprü kontrolleri ±4 m)
    c.airGy = gy;
    // engebede çok kısa sekmeler direksiyonu kesmesin: "uçuyor" = yerden 35 cm'den yüksekte
    c.flying = Boolean(c.air) && c.y - gy > 0.35;
    if (c.air) {
      c.vy -= CAR_G * dt;
      c.y += c.vy * dt;
      c.airT = (c.airT || 0) + dt;
      if (c.y > gy) return 0;
      const hit = -c.vy;
      c.y = gy;
      c.air = false;
      c.flying = false;
      c.vy = vyRoad;
      // v193 — İNİŞ: süspansiyon çöker ve toparlanır; burun yere uymadan (açılı) inerse gövde sekip
      // düzelir ve hız biraz kaybolur
      if (c.airT > 0.15) {
        c.su = c.su || { x: 0, v: 0 };
        c.jp = c.jp || { x: 0, v: 0 };
        c.su.v -= Math.min(2.4, hit * 0.11);
        const miss = clamp((c.gp || 0) - (c.gpGround ?? 0), -1, 1);
        c.jp.v += miss * 3.2;
        c.landMiss = Math.abs(miss);
      }
      c.gpV = 0;
      c.grV = 0;
      return c.airT > 0.25 ? hit : 0;
    }
    const groundRate = (gy - c.y) / dt;
    const vy = c.vy ?? vyRoad;
    // araba kendi hızıyla zeminden ≥ 3 m/sn hızlı ayrılıyorsa (tepe aşıldı, rampa bitti, basamak)
    if (vy - CAR_G * dt - groundRate > 3 && (Math.abs(vF) > 4 || gy < c.y - 0.06)) {
      // zemin altından kaçtı → havalan
      c.air = true;
      c.airT = 0;
      // v193: rampanın burnu döndürme hızı uçuşta sürer (rampadan çıkınca burun kalkmaya / düşmeye devam eder)
      c.gpV = clamp(((c.gp || 0) - (c.gpPrev ?? c.gp ?? 0)) / Math.max(dt, 1e-3), -2.5, 2.5);
      c.grV = clamp(((c.gr || 0) - (c.grPrev ?? c.gr ?? 0)) / Math.max(dt, 1e-3), -2, 2);
      c.vy = vy - CAR_G * dt;
      c.y += c.vy * dt;
      return 0;
    }
    // yerde: aşağı iniş birebir; yukarı basamak / yokuş yumuşak ama tekerlek yola gömülmez
    c.y = gy <= c.y ? gy : Math.max(c.y + (gy - c.y) * Math.min(1, dt * 12), gy - 0.12);
    c.vy = vyRoad;
    return 0;
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
    // v157: şehrin dışında (otoyol, köy yolu, kasaba): oyuncunun çevresinde aracın sığdığı ilk boş yer
    if (W.modeAt(x, z) !== 'city') {
      const n = hwyNearest(x, z);
      const yaw0 = n && n.dist < 30 ? Math.atan2(n.fr.tx, n.fr.tz) : self.camYaw + Math.PI;
      const fits = (px, pz, yw) => carCircles(px, pz, yw, { v: myCar.v }).every(([qx, qz]) => !carBlockedAt(qx, qz, myCar.v.halfW * 0.9, groundY(qx, qz))) && !carCircles(px, pz, yw, { v: myCar.v }).some(([qx, qz]) => (qx - self.x) ** 2 + (qz - self.z) ** 2 < (myCar.v.halfW + 1.1) ** 2);
      for (let rr = 3; rr <= 18; rr += 1.5) {
        for (let a = 0; a < 16; a++) {
          const px = x + Math.cos((a / 16) * Math.PI * 2) * rr;
          const pz = z + Math.sin((a / 16) * Math.PI * 2) * rr;
          for (const yw of [yaw0, yaw0 + Math.PI]) if (fits(px, pz, yw)) return { x: px, z: pz, yaw: yw };
        }
      }
      return null;
    }
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
        const ok = carCircles(px, pz, c.yaw, { v: myCar.v }).every(([qx, qz]) => !blockedAt(qx, qz, 1.0) && !carBlockedAt(qx, qz, 0.8)) && !carCircles(px, pz, c.yaw, { v: myCar.v }).some(([qx, qz]) => (qx - self.x) ** 2 + (qz - self.z) ** 2 < (myCar.v.halfW + 1.1) ** 2);
        if (ok) return { x: px, z: pz, yaw: c.yaw };
      }
    }
    return null;
  }
  // v150: mods — aracın kayıtlı modifiyesi (şehirde modifiyeli hali görünür, diğer oyunculara da gider)
  function callCar(id, mods = null, at = null) {
    if (driving || self.ride) return { ok: false, reason: 'Önce arabadan in' };
    if (!hasVehicle(id)) return { ok: false, reason: 'Araba bulunamadı' };
    const v = buildVehicle(id, mods);
    v.root.rotation.order = 'YXZ'; // v157: yokuşta gövde eğimi
    const mk = mods && typeof mods === 'object' && Object.keys(mods).length ? JSON.stringify(mods).slice(0, 700) : '';
    const old = myCar;
    myCar = { v };
    const spot = at || laneSpot(self.x, self.z); // v197: garajdan binince araç garajdaki yerinde
    garageBack();
    if (!spot) {
      myCar = old;
      return { ok: false, reason: 'Yakında boş şerit yok' };
    }
    if (old) {
      if (interiorCar === old) setInterior(null);
      scene.remove(old.v.root);
      old.v.rig?.dispose();
      old.v.root.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    if (!v.silent) {
      // ön farların yere düşen ışığı
      const head = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.5), headMat('#ffe9b8', 0.5));
      head.rotation.x = -Math.PI / 2;
      head.position.set(0, 0.04, v.len / 2 + 3.9);
      head.userData.keepFp = true;
      v.root.add(head);
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), headMat('#ff2a3a', 0.5));
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(0, 0.04, -v.len / 2 - 0.6);
      tail.userData.keepFp = true;
      v.root.add(tail);
    }
    myCar = { v, id, mk, x: spot.x, z: spot.z, y: groundY(spot.x, spot.z), yaw: spot.yaw, vx: 0, vz: 0, steer: 0, roll: 0, pitch: 0, lastVF: 0, spawnT: 0, skidD: 0, gp: 0 };
    setPax(myCar, myJob.on ? myJob.pax : 0); // v152: tır dorsesiz başlar
    scene.add(v.root);
    v.root.position.set(spot.x, myCar.y, spot.z);
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
    if (!myCar || driving || fall) return;
    // v216: devrilmiş motoru / bisikleti kaldır
    if (myCar.down || myCar.loose) {
      myCar.down = false;
      myCar.loose = null;
      myCar.roll = 0;
      myCar.rollV = 0;
      myCar.vx = myCar.vz = myCar.spin = 0;
    }
    driving = true;
    self.target = null;
    self.path = null;
    self.seat = null;
    ring.visible = false;
    me.sitting = myCar.v.open;
    driveCamOff = 0;
    driveCamIdle = 9;
    // v157.4: bisiklet / at — motor sesi yok
    if (!myCar.v.silent) {
      sound.start();
      sound.idle(true);
    }
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
      // v167: köprüde arabadan inerken duvarın dışına (boşluğa) konulmasın
      if (!blockedAt(px, pz) && !hitsParked(px, pz) && !W.railWalkBlocked(px, pz, PLAYER_R, c.y, false)) {
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
    me.y = groundY(self.x, self.z, -1, c.y); // v167: arabanın seviyesinde (köprü üstü / altı)
    me.sitting = false;
    me.inCar = false;
    me.group.visible = true;
    sound.idle(false);
    self.camYaw = c.yaw + Math.PI * 0.85;
    first = true;
    zoneKey = '__exit__';
  }

  // v193 — çarpma noktası + itki (carImpact.js). Dönen: { vn, vt, px, pz, nx, nz } ya da null
  function carImpactAt(c, nx, nz) {
    const r = c.v.halfW * 0.82;
    const cy = carCollideY();
    const circ = (x, z) => Boolean(carBlockedAt(x, z, r, cy)) || hitsParked(x, z);
    const pt = (x, z) => Boolean(carBlockedAt(x, z, 0.05, cy)) || hitsParked(x, z);
    const sp = Math.hypot(c.vx, c.vz) || 1;
    const k = findContact(carCircles(nx, nz, c.yaw), r, circ, pt, [c.vx / sp, c.vz / sp]);
    c.dbgImpact = k; // tanı (debugCar)
    if (!k) return null;
    const pr = impactParams(c.v);
    const res = applyImpact(c, k, { ...pr, I: yawInertia(c.v) });
    if (!(res.vn > 0) && !(res.vt > 0)) return null;
    return { ...res, ...k };
  }
  // v193 — gövde sarsıntısı: çarpma yönüne göre öne / arkaya yatma + yana yatma + süspansiyon çökmesi,
  // yay gibi toparlanır (updateCarVisual). Sert çarpmada kıvılcım.
  function carJolt(c, im, dt) {
    void dt;
    if (!(im.vn > 1.5)) return;
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    // normal araç yerel ekseninde: öne (f) ve sağa (s)
    const nf = im.nx * fx + im.nz * fz;
    const ns = im.nx * fz - im.nz * fx;
    const k = Math.min(1, im.vn / 18) * (c.v.len > 6 ? 0.55 : 1);
    c.jp = c.jp || { x: 0, v: 0 };
    c.jr = c.jr || { x: 0, v: 0 };
    c.su = c.su || { x: 0, v: 0 };
    c.jp.v += -nf * 2.6 * k; // önden çarpınca burun dalar (arka kalkar)
    c.jr.v += ns * 2.2 * k;
    c.su.v -= 0.9 * k;
    if (im.vn > 4) sparkBurst(im.px, c.y + 0.4, im.pz, im.nx, im.nz, im.vn, Math.min(16, Math.round(3 + im.vn * 0.7)));
    if (im.vn > 9) puff(im.px, c.y, im.pz);
  }
  // =============================================================================
  // v216 — BİNEKTEN FIRLAMA (motor, bisiklet, at, deve). Fizik: riderEject.js, prototip: preview/firlama.html
  // Sert çarpmada (duvara dik hız ≥ eşik) sürücü fırlar → takla → düşer → kayar → durur → kalkar.
  // Sadece bu cihazda hesaplanır: Firestore / RTDB'ye yeni alan ya da ek yazma yok (ağa normal yaya
  // konumu gider). Sadece fırlarken çalışır (~3-5 sn), 5 parçacık — akıcılığa etkisi yok.
  // =============================================================================
  const ejQ = new THREE.Quaternion();
  const ejM = new THREE.Matrix4();
  const ejA = [new V(), new V(), new V()];
  function ejectRider() {
    const c = myCar;
    const pre = ejectReq;
    ejectReq = null;
    if (!c || !driving) return;
    c.v.root.updateMatrixWorld(true);
    const s0 = c.v.seatPts?.[0] || [c.v.seat[0], c.v.seat[1], 0];
    const sp = c.v.body.localToWorld(new V(s0[0], s0[1], s0[2]));
    c.v.tilt.getWorldQuaternion(ejQ);
    ejA[0].set(1, 0, 0).applyQuaternion(ejQ);
    ejA[1].set(0, 1, 0).applyQuaternion(ejQ);
    ejA[2].set(0, 0, 1).applyQuaternion(ejQ);
    const kind = riderKind(c.v);
    const rd = makeRagdoll({ pelvis: [sp.x, sp.y + 0.03, sp.z], frame: { x: ejA[0].toArray(), y: ejA[1].toArray(), z: ejA[2].toArray() }, vel: [pre.vx, 0, pre.vz], kind, speed: pre.spd, seed: (Date.now() & 0xffff) + 1 });
    fall = { rd, rest: 0, up: null, kind, y0: c.y };
    // binekten in (exitCar gibi, ama yere bırakmadan — gövde fizikte)
    driving = false;
    self.target = null;
    self.path = null;
    me.sitting = false;
    me.inCar = false;
    me.group.visible = true;
    me.moving = false;
    sound.idle(false);
    self.camYaw = c.yaw + Math.PI;
    zoneKey = '__exit__';
    // sürücüsüz binek: motor / bisiklet yana devrilip kayar, at / deve irkilip geri çekilir
    c.loose = { kind, backT: kind === 'horse' || kind === 'camel' ? 0.7 : 0 };
    if (kind === 'moto' || kind === 'bike') {
      c.down = true;
      c.fall = (c.spin || 0) > 0 ? -1 : 1;
      c.rollV = c.fall * 2.5;
    } else if (c.jp) c.jp.v -= 3.2;
    camShake = Math.max(camShake, 0.5);
    stepFall(0);
  }
  // sürücüsüz binek: hareket + engel (carFree), devrilen iki teker yan yatar
  function stepLooseCar(c, dt) {
    const L = c.loose;
    if (L.still) {
      stepFallenBike(c, dt); // yerde yatık kalır (updateCarVisual roll'u kullanır)
      return;
    }
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    if (c.down) stepFallenBike(c, dt);
    else if (L.backT > 0) {
      L.backT -= dt;
      c.vx = -fx * 2.2;
      c.vz = -fz * 2.2;
    } else {
      const sp = Math.hypot(c.vx, c.vz);
      const k = sp > 9 * dt ? (sp - 9 * dt) / sp : 0;
      c.vx *= k;
      c.vz *= k;
    }
    c.yaw += (c.spin || 0) * dt;
    if (c.yaw > Math.PI || c.yaw < -Math.PI) c.yaw = Math.atan2(Math.sin(c.yaw), Math.cos(c.yaw));
    const nx = c.x + c.vx * dt;
    const nz = c.z + c.vz * dt;
    if (!carFree(nx, nz, c.yaw)) {
      c.x = nx;
      c.z = nz;
    } else {
      c.vx *= -0.2;
      c.vz *= -0.2;
    }
    // durduysa (ve atın geri çekilmesi bittiyse) artık hesaplanmaz; devrik motor yerde yatık kalır
    if (Math.hypot(c.vx, c.vz) < 0.05 && !(L.backT > 0) && (!c.down || Math.abs(c.roll) > 1.3)) {
      c.vx = c.vz = c.spin = 0;
      c.loose = c.down ? { kind: L.kind, still: true } : null;
    }
  }
  const fallWorld = {
    boxes: [],
    groundY: (x, z, y) => groundY(x, z, -1, y),
    blocked: (x, z, r) => blockedAt(x, z, Math.min(r, 0.3)),
  };
  function stepFall(dt) {
    const F = fall;
    const rd = F.rd;
    if (!F.up) {
      // bineğin kendisi de engel (atın sırtı yuvarlak: üstüne düşen yana kayar; devrik motor alçak)
      const c = myCar;
      if (c) {
        const h = c.down ? 0.42 : F.kind === 'horse' || F.kind === 'camel' ? 1.3 : 0.75;
        fallWorld.boxes[0] = { x: c.x, z: c.z, w: c.v.halfW * 2, d: c.v.len * 0.92, h, y0: c.y, ry: c.yaw, self: 'ride', round: !c.down };
      } else fallWorld.boxes.length = 0;
      const hit = dt > 0 ? stepRagdoll(rd, dt, fallWorld) : 0;
      if (hit > 2.5) {
        const p = rd.ps[0].p;
        puff(p[0], p[1] - 0.15, p[2]);
        camShake = Math.max(camShake, Math.min(0.4, hit * 0.03));
        sound.thump(Math.min(20, hit));
      }
      const f = ragdollFrame(rd);
      ejM.makeBasis(ejA[0].set(...f.x), ejA[1].set(...f.y), ejA[2].set(...f.z));
      ejQ.setFromRotationMatrix(ejM);
      // v216.2: yerdeyken görüntü yumuşatılır (küçük kıpırtılar ekrana titreme olarak yansımasın);
      // havada fizik birebir (takla keskin kalsın)
      const sm = !F.q || rd.air > 0.5 ? 1 : 1 - Math.exp(-dt * 14);
      F.q = F.q ? F.q.slerp(ejQ, sm) : ejQ.clone();
      F.o = F.o ? F.o.lerp(ejA[0].set(...f.o), sm) : new V(...f.o);
      if (!rd.rest) me.rag = { o: F.o, q: F.q, lp: limbPose(rd.air, rd.t, ragdollSpin(rd)), k: 1 };
      F.rest = rd.rest ? F.rest + dt : 0;
      // v216.2: durunca gövde donar, ~0,5 sn sonra kalkar (eskiden 1,4 sn + titreme). Yedek: 8 sn
      if (F.rest > 0.5 || rd.t > 8) {
        const yaw = ragdollHeading(rd);
        F.up = { t: 0, q0: F.q.clone(), p0: F.o.clone(), q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), yaw };
      }
    } else {
      const U = F.up;
      U.t += dt / 1.1;
      const k = Math.min(1, U.t);
      const e = k * k * (3 - 2 * k);
      const hip = me.m3?.hipH || AVATAR_3D_HIP;
      const gy = groundY(U.p0.x, U.p0.z, -1, U.p0.y);
      F.q.slerpQuaternions(U.q0, U.q1, e);
      F.o.set(U.p0.x, U.p0.y + (gy + hip - U.p0.y) * e, U.p0.z);
      me.rag = { o: F.o, q: F.q, lp: limbPose(0, 0, 0, 0), k: 1 - e, crouch: Math.sin(e * Math.PI) };
      if (U.t >= 1) {
        me.rag = null;
        fall = null;
        let x = U.p0.x;
        let z = U.p0.z;
        if (blockedAt(x, z)) {
          const fr = freeNear(x, z);
          if (fr) {
            x = fr.x;
            z = fr.z;
          }
        }
        self.x = x;
        self.z = z;
        me.x = x;
        me.z = z;
        me.y = groundY(x, z, -1, U.p0.y);
        me.faceYaw(U.yaw);
        self.target = null;
        self.path = null;
        return;
      }
    }
    // figür (etiket, kamera, mini harita, ağdaki konum) kalçayı izler
    const o = F.o;
    self.x = o.x;
    self.z = o.z;
    me.x = o.x;
    me.z = o.z;
    me.y = groundY(o.x, o.z, -1, o.y);
    me.moving = false;
    me.sitting = false;
    me.inCar = false;
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
    // v152: motor — direksiyon daha yavaş tepki verir ve hızlandıkça çok daha az döner
    // (yatarak geniş dönüş); otobüs / tır — kısa dönüş için daha çok direksiyon açısı
    const moto = Boolean(c.v.moto);
    const horse = c.v.ride === 'horse';
    // v185: hızlıyken direksiyon daha yumuşak döner (tuşa basınca ani savrulma olmasın); bırakınca hızlı toplar
    const spd0 = Math.abs(vF0);
    // v192: v185 biraz fazla yavaşlatıyordu (108 km/sa'te direksiyon ~1 sn'de tam kırılıyordu) → ~0,75 sn
    const steerIn = (moto && !horse ? 2.2 : 3.6) / (horse ? 1 : 1 + Math.max(0, spd0 - 15) * 0.012);
    c.steer += (-st - c.steer) * Math.min(1, dt * (st ? steerIn : moto && !horse ? 4 : 6));
    const steerDiv = 1 + spd0 * (moto ? 0.085 : c.v.len > 6 ? 0.03 : 0.045);
    const delta = (c.steer * P.steer) / steerDiv;
    let yawRate = (vF0 * Math.tan(delta)) / c.v.wb;
    // v185: hıza göre dönüş sınırı (şehirde; yarışlar ayrı oyunda) — tam kırıldığında yanal ivme ~22+0,35·v m/sn²'yi
    // geçmez: yavaşken aynı, 100+ km/sa'te tek dokunuşta şerit atlamaz. Kısmi direksiyon oranı korunur.
    if (!horse && spd0 > 8) {
      const yawFull = (spd0 * Math.tan(P.steer / steerDiv)) / c.v.wb;
      // v192: sınır gevşetildi (108 km/sa'te tam dönüş ~62 → ~78 °/sn; v184'te 160 °/sn idi)
      const cap = (26 + 0.5 * spd0) / spd0;
      if (yawFull > cap) yawRate *= cap / yawFull;
    }
    // v159.4 — AT: tekerlekli araç gibi değil — dururken de yerinde döner, yavaşken keskin, hızlanınca
    // daha geniş döner (dönüş hızdan bağımsız açısal hız), geri giderken ters
    if (horse) yawRate = (c.steer * P.steer * 3.4) / (1 + Math.abs(vF0) * 0.07) * (vF0 < -0.3 ? -1 : 1);
    if (hand && Math.abs(vF0) > 3) yawRate *= 1.45;
    if (c.flying) yawRate *= 0.15; // v163: havada tekerlek yere değmez — direksiyon neredeyse etkisiz
    // v193: çarpmadan gelen kendi etrafında dönme (açısal hız). Yerde lastik sürtünmesi hızla söndürür,
    // havada çok az söner (prototipteki gibi)
    const spinNow = c.spin || 0;
    if (spinNow) {
      c.spin = Math.abs(spinNow) < 0.02 ? 0 : spinNow * Math.exp(-dt * (c.air ? 0.3 : 2.4 + Math.min(3, Math.abs(vF0) * 0.08)));
    }
    yawRate += spinNow;
    c.yaw += yawRate * dt;
    // v154: yön (-π, π] aralığında kalsın — sınırsız büyüyünce fotoğrafta araba ters dönüyordu
    // (sunucu ±50'yi aşan yönü 0 sayar) ve RTDB kuralı (±1000) aşılınca araba yayını kesiliyordu
    if (c.yaw > Math.PI || c.yaw < -Math.PI) c.yaw = Math.atan2(Math.sin(c.yaw), Math.cos(c.yaw));
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
    if (c.flying) {
      // v163: havada gaz / fren tutmaz, sadece hava direnci
      acc = -vF * 0.02;
      braking = false;
    }
    const before = vF;
    vF += acc * dt;
    if (!thr && !c.flying && Math.sign(vF) !== Math.sign(before)) vF = 0;
    // v167: suda çok yavaş — derinleştikçe daha da yavaş (sığda ~%30, derinde ~2 m/sn); hızla girince
    // birden durmaz, birkaç saniyede yavaşlar (su sıçratarak)
    if ((c.wet || 0) > 0.15 && !c.flying) {
      const k = Math.min(1, c.wet / 1.4);
      const maxV = Math.max(2, P.vmax * (0.3 - 0.2 * k));
      if (Math.abs(vF) > maxV) vF += (Math.sign(vF) * maxV - vF) * Math.min(1, dt * 2.5);
    }
    const grip = hand ? 1.4 : Math.max(3.2, P.grip - Math.abs(vF) * 0.09);
    if (!c.flying) vL *= Math.exp(-grip * dt);
    c.vx = fx * vF + sx * vL;
    c.vz = fz * vF + sz * vL;
    // v157: otoyolda en yakın rota noktası (bariyer / köprü / tünel için)
    if (W.modeAt(c.x, c.z) === 'hwy') {
      const n = hwyNearest(c.x, c.z, carHint);
      carHint = n && n.dist < 60 ? n.i : -1;
      c.s = n ? n.s : c.s;
    } else carHint = -1;
    // yokuş: yokuş yukarı yavaşlar, aşağı hızlanır
    if (c.gp && !c.air && (thr || Math.abs(vF) > 0.5)) {
      c.vx -= fx * 9.8 * c.gp * 0.3 * dt;
      c.vz -= fz * 9.8 * c.gp * 0.3 * dt;
    }
    // 3) hareket + çarpışma (sadece binalar) — duvar boyunca kayar, takılmaz
    const oldYaw = c.yaw - yawRate * dt;
    const nx = c.x + c.vx * dt;
    const nz = c.z + c.vz * dt;
    const spd = Math.hypot(c.vx, c.vz);
    let hit = null;
    let impact = null;
    // v197: garajdan çıkış şeridi — garajın içinde (ve ağzında) araç duvarlara çarpmış sayılmaz, garajın ortasında
    // düz ilerler; eskiden binince "sıkıştı" sayılıp yana itiliyor, garajdan çıkamıyordu
    const lane = c === myCar ? garageLane(nx, nz) : null;
    if (lane) {
      const { g, lz } = lane;
      const cs = Math.cos(g.ry);
      const sn = Math.sin(g.ry);
      c.x = g.x + lz * sn;
      c.z = g.z + lz * cs;
      const out = g.ry;
      const back = g.ry + Math.PI;
      const dOut = Math.abs(Math.atan2(Math.sin(c.yaw - out), Math.cos(c.yaw - out)));
      const dBack = Math.abs(Math.atan2(Math.sin(c.yaw - back), Math.cos(c.yaw - back)));
      c.yaw = dOut <= dBack ? out : back;
      const along = c.vx * sn + c.vz * cs;
      c.vx = sn * along;
      c.vz = cs * along;
    } else if (!carFree(nx, nz, c.yaw)) {
      c.x = nx;
      c.z = nz;
    } else {
      hit = 'wall';
      // v193 — GERÇEKÇİ ÇARPMA (prototipteki itki): temas noktası + normal → hız seker / kayar, araba
      // köşeden çarpınca döner. Sonra yeni hızla hareket denenir; olmazsa eski kaydırma yolları.
      const preVx = c.vx; // v216: fırlama çarpma ÖNCESİ hızla
      const preVz = c.vz;
      impact = carImpactAt(c, nx, nz);
      if (impact && c === myCar && !fall && ejectCheck(c.v, impact.vn)) ejectReq = { vx: preVx, vz: preVz, spd };
      const tx = c.x + c.vx * dt;
      const tz = c.z + c.vz * dt;
      if (impact && !carFree(tx, tz, c.yaw)) {
        c.x = tx;
        c.z = tz;
      } else if (impact && carFree(c.x, c.z, c.yaw) === null) {
        /* yerinde kal (bu karede hareket yok, yeni hız sonraki karede) */
      } else if (!carFree(nx, c.z, c.yaw)) {
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
    if (!lane) unstick(c);
    // v193: sertlik = duvara doğru kapanma hızı (sürtünerek geçmek kaza sayılmaz); kıvılcım + gövde sarsıntısı
    const hard = impact ? impact.vn : hit ? spd * 0.5 : 0;
    if (impact) carJolt(c, impact, dt);
    if (hit && hard > 3) {
      camShake = Math.min(0.55, hard * 0.035);
      sound.thump(Math.min(30, hard * 1.3));
      onEvent?.({ type: 'crash', what: hit, speed: hard });
    } else if (impact && impact.vt > 6 && Math.random() < dt * 14) {
      sparkBurst(impact.px, c.y + 0.45, impact.pz, impact.nx, impact.nz, impact.vt * 0.4, 2); // duvara sürtünme
    }
    // 4) görsel: gövde yatışı, tekerlekler, stoplar
    const longA = (vF - c.lastVF) / Math.max(dt, 1e-3);
    c.lastVF = vF;
    c.pitch += (clamp(-longA * 0.006, -0.05, 0.05) - c.pitch) * Math.min(1, dt * 6);
    // v159.4: at motor gibi yatmaz — dönüşte gövde çok az içe eğilir
    const rollT = c.v.ride === 'horse' ? clamp(-vF * yawRate * 0.008, -0.08, 0.08) : c.v.moto ? clamp(-vF * yawRate * 0.045, -0.6, 0.6) : clamp(vF * yawRate * 0.007, -0.075, 0.075);
    c.roll += (rollT - c.roll) * Math.min(1, dt * 6);
    const slip = Math.abs(vL);
    const skidding = !c.flying && (slip > 2.2 || (hand && Math.abs(vF) > 5) || (braking && Math.abs(vF) > 10));
    updateCarVisual(c, dt, vF, delta, braking || (thr < 0 && vF > 0), skidding, yawRate * dt);
    driveStat = { kmh: Math.round(Math.abs(vF) * 3.6), gear: vF < -0.3 ? 'R' : Math.abs(vF) < 0.3 && !thr ? 'N' : String(1 + Math.min(4, Math.floor((Math.abs(vF) / P.vmax) * 5))), ratio: Math.abs(vF) / P.vmax, name: c.v.def.name };
    if (!c.v.silent) sound.update(Math.min(1, Math.abs(vF) / P.vmax), thr, skidding ? Math.min(1, slip / 6 + 0.3) : 0);
    // oyuncu arabayla taşınır (etiket, bölge, mini harita için)
    self.x = c.x;
    self.z = c.z;
  }
  // v151 — tır dorsesi: çekiciyi takip eder (yalpa açısı)
  function stepTrailer(c, speed, dyaw, dt) {
    const tr = c.v.trailer;
    if (!tr || !c.v.trailerOn) return;
    c.th = c.th || 0;
    c.th += -(speed / tr.wheelX) * Math.sin(c.th) * dt - dyaw;
    c.th = clamp(c.th, -1.35, 1.35);
    tr.pivot.rotation.y = c.th;
    tr.wheels.forEach((w) => (w.spin.rotation.z -= (speed * Math.cos(c.th) * dt) / w.r));
  }
  // v151 — tepe lambaları (polis / ambulans / tepe lambası): işteyken yanıp söner
  function flashVehicle(v, on) {
    if (!v.flashers?.length) return;
    if (!on && v.flashOff) return;
    v.flashOff = !on;
    const t = performance.now() / 1000;
    v.flashers.forEach((f) => {
      f.mat.emissiveIntensity = on ? f.base * (Math.sin(t * (f.fast ? 13 : 5) + f.phase) > 0 ? 1 : 0.08) : 0.12;
    });
  }
  // v151 — araçta görünen bot yolcular (taksi müşterisi, otobüs yolcuları, sedyedeki hasta).
  // Sadece görüntü: şoför bunları işi için görür, diğerleri "işteyken dolu" hâlini görür.
  function setPax(c, n) {
    const v = c.v;
    // v152: tırda "yolcu" = dorse — yük alınınca gelir, teslim edilince gider
    if (v.trailer) {
      const on = n > 0;
      v.trailer.pivot.visible = on;
      v.trailerOn = on;
      if (!on) c.th = 0;
      v.camK = null; // kamera uzaklığı yeniden hesaplansın
      return;
    }
    (c.pax || []).forEach((m) => {
      m.parent?.remove(m);
      m.traverse((o) => o.isMesh && o.geometry.dispose());
    });
    c.pax = [];
    const pts = v.seatPts || [];
    // v154: motokurye — siparişi alınca arkada kurye çantası (diğer oyuncular da görür)
    if (v.moto) {
      if (!v.kuryeBox) {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.46), new THREE.MeshStandardMaterial({ color: '#e8262f', roughness: 0.6 }));
        box.castShadow = true;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.48), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5 }));
        lid.position.y = 0.23;
        g.add(box, lid);
        const sp = pts[0] || [0, 0.8, 0];
        g.position.set(sp[0] - 0.62, sp[1] + 0.12, 0);
        v.body.add(g);
        v.kuryeBox = g;
      }
      v.kuryeBox.visible = n > 0;
      return;
    }
    if (!n || pts.length < 2) return;
    // arkadan öne (gerçek yolcular öndeki koltuklardan başlar)
    const order = pts.map((_, i) => i).slice(1).reverse();
    order.slice(0, n).forEach((k, i) => {
      const sp = pts[k];
      const m = seatedPerson(37 + k * 5 + i, {});
      m.position.set(sp[0] - 0.05, sp[1], sp[2]);
      m.scale.setScalar(0.92);
      v.body.add(m);
      c.pax.push(m);
    });
  }
  const wpos = new V();
  function updateCarVisual(c, dt, vF, delta, braking, skidding, dyaw = 0) {
    const v = c.v;
    c.gpPrev = c.gp || 0;
    c.grPrev = c.gr || 0;
    c.gp = slopeOf(c, c.gp || 0, dt, carHint);
    const landHit = carVertical(c, carGroundY(c, carHint), vF, dt); // v167: suda yüzeye yakın
    if (landHit > 6 && c === myCar && driving) {
      camShake = Math.min(0.5, landHit * 0.035);
      sound.thump(landHit * 0.8);
      // v193: sert inişte altından kıvılcım; burnu gömerek inerse hız kaybı
      if (landHit > 9) sparkBurst(c.x, c.y + 0.15, c.z, Math.sin(c.yaw), Math.cos(c.yaw), landHit * 0.6, Math.min(12, Math.round(landHit * 0.6)));
      if (c.landMiss > 0.25) {
        const lose = 1 - Math.min(0.35, c.landMiss * 0.5);
        c.vx *= lose;
        c.vz *= lose;
      }
    }
    // v193: gövde sarsıntısı / süspansiyon yayları (çarpma ve inişten); ağır araç daha yavaş salınır
    const heavy = v.len > 6;
    if (c.jp) spring(c.jp, heavy ? 70 : 120, heavy ? 9 : 10, dt);
    if (c.jr) spring(c.jr, heavy ? 70 : 120, heavy ? 9 : 10, dt);
    if (c.su) spring(c.su, heavy ? 90 : 150, heavy ? 11 : 12, dt);
    const jp = c.jp ? clamp(c.jp.x, -0.22, 0.22) : 0;
    const jr = c.jr ? clamp(c.jr.x, -0.18, 0.18) : 0;
    const su = c.su ? clamp(c.su.x, -0.22, 0.1) : 0;
    v.root.position.set(c.x, c.y, c.z);
    v.root.rotation.set(-Math.atan(c.gp), c.yaw, Math.atan(c.gr || 0));
    if (v.tiltY0 == null) v.tiltY0 = v.tilt.position.y;
    v.tilt.position.y = v.tiltY0 + su;
    v.tilt.rotation.set(c.pitch + jp, 0, c.roll + jr);
    v.wheels.forEach((w) => {
      w.spin.rotation.z -= (vF * dt) / w.r;
      if (w.front && !w.moto) w.pivot.rotation.y = delta;
    });
    v.gait?.(vF, dt, dt > 0 ? dyaw / dt : 0); // v157.4: atın bacakları · v159.4: dönüş hızı (yerinde dönüş)
    stepTrailer(c, vF, dyaw, dt);
    flashVehicle(v, c === myCar && myJob.on);
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
  let rotated = false; // v157: yatay mod (CSS ile 90° saat yönünde döndürülmüş ekran)
  function setNdc(e) {
    const r = canvas.getBoundingClientRect();
    if (rotated) {
      // döndürülmüş tuvalde: yerel x = ekranın yukarıdan aşağı ekseni, yerel y = sağdan sola
      ndc.set(((e.clientY - r.top) / r.height) * 2 - 1, -((r.right - e.clientX) / r.width) * 2 + 1);
      return;
    }
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  // v158.1 — karargah şehirden bağımsız: içerideyken dokunuş odanın içinde kalır (kapının ötesine
  // dokununca kapının önüne yürünür), dışarıdayken karargahın üstüne dokununca kapısına yürünür
  function hqTarget(x, z) {
    if (isoV) {
      const p = toRoom(isoV, x, z);
      const m = 0.55;
      return fromRoom(isoV, clamp(p.x, -VROOM.W / 2 + m, VROOM.W / 2 - m), clamp(p.z, -VROOM.D / 2 + m, VROOM.D / 2 - m));
    }
    for (const v of W.venues) {
      if (!v.isolated && !v.closedShop) continue; // v159: kapalı dükkâna dokununca da kapısının önüne
      const p = toRoom(v, x, z);
      if (Math.abs(p.x) < VROOM.W / 2 + 0.8 && Math.abs(p.z) < VROOM.D / 2 + 0.8) return fromRoom(v, v.doorX ?? 0, VROOM.D / 2 + (v.closedShop ? 2.2 : 1.7));
    }
    return { x, z };
  }
  // v196 — evin içinde dokunuş: ışın oda yereline çevrilir; tasarımda eşya seçilir / yer bildirilir,
  // yürürken dokunulan katın zeminine merdivenlerden geçen rota kurulur
  const evInv = new THREE.Matrix4();
  function evTap() {
    const ml = curVenue.ml;
    const root = ml.groups[0].parent;
    root.updateMatrixWorld(true);
    evInv.copy(root.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(evInv);
    const d = ray.ray.direction.clone().transformDirection(evInv);
    if (evDesign) {
      const objs = [];
      [0, 1, 2].forEach((f) => {
        if (f <= evDesign.f) objs.push(ml.furnKit(f).group);
      });
      // v197: tavan modu yok — önce yerdeki / duvardaki eşya, yoksa tavan eşyası (avize) seçilir
      const hits0 = ray.intersectObjects(objs, true).filter((h) => evPickable(h.object.userData.evIdx));
      const hit = hits0.find((h) => !ml.isCeil(h.object.userData.evIdx)) || hits0[0];
      const g = ml.pick(o, d);
      // pencereye dokunuş (eşya seçilmediyse): zeminden önce değiyorsa pencere
      if (!hit) {
        const wh = ml.pickWindow(ray.ray, evDesign.f);
        if (wh) {
          const gw = g ? ml.groups[0].parent.localToWorld(new THREE.Vector3(g.x, g.y, g.z)).distanceTo(ray.ray.origin) : Infinity;
          if (wh.dist < gw) {
            onEvent?.({ type: 'homeTap', win: wh.id, idx: null, x: null, z: null, f: evDesign.f });
            return true;
          }
        }
      }
      onEvent?.({ type: 'homeTap', idx: hit ? hit.object.userData.evIdx : null, x: g?.x ?? null, z: g?.z ?? null, f: g ? ml.level(g.y + 0.2) : null });
      return true;
    }
    const g0 = ml.pick(o, d);
    if (!g0) return false;
    const g = ml.stairGoal?.(g0, me.y) || g0; // v198: merdivene dokununca kat değiştir
    if (self.seat && seatHolds.size) return true; // v202: oyun / yayın açıkken koltuktan kalkılmaz
    if (self.seat) standUp();
    const pts = ml.route({ x: toRoom(curVenue, self.x, self.z).x, z: toRoom(curVenue, self.x, self.z).z, y: me.y }, g).map(([x, z]) => fromRoom(curVenue, x, z));
    self.path = pts;
    self.target = pts.shift();
    self.repath = 0;
    self.stuckT = 0;
    const end = fromRoom(curVenue, g.x, g.z);
    ring.position.set(end.x, g.y + 0.03, end.z);
    ring.visible = true;
    return true;
  }
  function walkTo(x0, z0) {
    const { x, z } = hqTarget(x0, z0);
    const f = freeNear(x, z);
    if (!f) return false;
    // v157.3: yol bulunamasa da (şehir ızgarası dışı, kapalı alan) dokunulan yere doğru yürünür
    let p = findPath(self.x, self.z, f.x, f.z);
    if (!p || !p.length) p = [{ x: f.x, z: f.z }];
    self.path = p;
    self.target = p.shift();
    self.repath = 0;
    self.stuckT = 0;
    ring.position.set(f.x, groundY(f.x, f.z) + 0.03, f.z);
    ring.visible = true;
    return true;
  }
  // v198 — MEKÂNIN / EVİN İÇİNDEYKEN DIŞARIYA DOKUNMA: yanlışlıkla duvarın ötesine / evin köşesine
  // dokununca avatar dışarı yürümeye başlıyordu. İçerideyken dışarıdaki bir noktaya sadece kapının önüne
  // (≈4 m) dokununca gidilir; başka yere dokunuş yok sayılır.
  function tapAllowed(x, z) {
    const v = curVenue;
    if (!v || isoV) return true;
    const lp = toRoom(v, x, z);
    const hw = v.ml ? 9.2 : VROOM.W / 2 + 0.3;
    const hd = v.ml ? 7.2 : VROOM.D / 2 + 0.3;
    if (Math.abs(lp.x) <= hw && Math.abs(lp.z) <= hd) return true; // içeride
    const dz = zones.find((q) => q.kind === 'door' && q.id === `vdoor_${v.type}`);
    if (!dz) return true;
    return Math.hypot(x - dz.x, z - dz.z) < 4;
  }
  function handleTap(e) {
    if (driving) return;
    if (storyLock) return; // v168.1: senaryo sahnesi — dokunuş yürütmez (sürükleyince kamera döner)
    if (heist?.active) return; // v154: soygun dizisi oynarken dokunma yok
    if (self.ride) return;
    setNdc(e);
    ray.setFromCamera(ndc, camera);
    // v150: oyuncuya dokunmak profil AÇMAZ (yürürken sürekli birine dokunuluyordu) —
    // profiller yandaki 👥 Yakındakiler listesinden açılır. Dokunuş yürümeye gider.
    void onPlayerTap;
    if (curVenue?.ml && evTap()) return; // v196: evin içi (katlar, merdiven, tasarım)
    if (self.seat && seatHolds.size) return; // v202: oyun / yayın açıkken koltuktan kalkılmaz
    if (self.seat) standUp();
    // önce bir binaya dokunduysa kapısına yürü
    // v157.3: girilebilir mekânların kabuğu dokunuşu yutmaz — mekânın içine / arkasına dokununca
    // oraya (kapıdan dolaşarak) yürünür; eskiden dokunuş duvarın önünde kalıyordu
    // v158.1: karargahın içindeyken şehir gizli — gizli binalara / yere dokunuş sayılmaz
    const hits = isoV ? [] : ray.intersectObjects(blockers, false).filter((h) => !h.object.userData.venueShell);
    // v157: yokuşta / kumsalda dokunulan yer: önce oyuncunun yüksekliğinde düzlem, sonra o noktanın zemini
    const ground = new THREE.Plane(new V(0, 1, 0), -(Math.max(me.y, -1) + 0.1));
    const gp = new V();
    let hitGround = ray.ray.intersectPlane(ground, gp);
    if (hitGround && W.modeAt(gp.x, gp.z) !== 'city') {
      for (let k = 0; k < 2 && hitGround; k++) {
        ground.constant = -(groundY(gp.x, gp.z, -1, me.y) + 0.05);
        hitGround = ray.ray.intersectPlane(ground, gp);
      }
    }
    const gd = hitGround ? camera.position.distanceTo(gp) : Infinity;
    if (hits.length && hits[0].distance < gd) {
      const zn = hits[0].object.userData.zone;
      if (zn) {
        if (tapAllowed(zn.x, zn.z)) walkTo(zn.x, zn.z);
        return;
      }
      const p = hits[0].point;
      if (tapAllowed(p.x, p.z)) walkTo(p.x, p.z);
      return;
    }
    if (hitGround && tapAllowed(gp.x, gp.z)) walkTo(gp.x, gp.z);
  }
  function onDown(e) {
    if (paused) return; // v157.9: ortak tuval başka ekrandayken (karargah düzenleme) şehir dokunuş almaz
    // v159 — "TEK PARMAKLA ÇEVİRİRKEN YAKINLAŞMA": bir dokunuşun bırakılışı kaçınca (tuval başka
    // ekrana taşınınca, sistem hareketi, bildirim perdesi…) o parmak listede "hayalet" kalıyordu;
    // sonraki tek parmak hareketleri iki parmak (yakınlaştırma) sayılıyordu. Yeni bir hareketin ilk
    // parmağında (isPrimary) eski kayıtlar temizlenir; yakalama kaybolunca da parmak silinir.
    if (e.isPrimary || e.pointerType === 'mouse') {
      pointers.clear();
      pinch = null;
    }
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* yoksay */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (dDrag && dDrag.moved > 8 && evDesign) onEvent?.({ type: 'homeDrop', idx: dDrag.idx, x: dDrag.it.x, z: dDrag.it.z, r: dDrag.it.r });
      dDrag = null;
      drag = null;
      return;
    }
    drag = { moved: 0, pan: e.button === 2 };
    // v197 tasarım (karargah gibi): SEÇİLİ eşyanın üstünden başlayan sürükleme onu taşır (önünde başka
    // eşya olsa bile); seçili olmayan eşyanın / boş yerin üstünden sürükleme kamerayı çevirir
    dDrag = null;
    if (evDesign && curVenue?.ml && evSel != null && !drag.pan) {
      setNdc(e);
      ray.setFromCamera(ndc, camera);
      const ml = curVenue.ml;
      const hit = ray.intersectObject(ml.furnKit(evDesign.f).group, true).find((h) => h.object.userData.evIdx === evSel && evPickable(evSel));
      if (hit) {
        const it = ml.items[evSel];
        const fp = evFloorLocal(e);
        dDrag = { idx: evSel, it: { ...it }, moved: 0, off: fp ? { x: it.x - fp.x, z: it.z - fp.z } : { x: 0, z: 0 } };
      }
    }
  }
  // v197: tasarımda dokunulabilir eşya — bu kattaki
  function evPickable(idx) {
    if (idx == null || !curVenue?.ml || !evDesign) return false;
    const it = curVenue.ml.items[idx];
    if (!it || it.f !== evDesign.f) return false;
    return true;
  }
  // ekran noktasının altındaki kat zemini (ev modelinin yereli; ml.place ile aynı)
  function evFloorLocal(e) {
    const ml = curVenue.ml;
    setNdc(e);
    ray.setFromCamera(ndc, camera);
    const root = ml.groups[0].parent;
    root.updateMatrixWorld(true);
    evInv.copy(root.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(evInv);
    const d = ray.ray.direction.clone().transformDirection(evInv);
    const fy = ml.floors[evDesign.f];
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (fy - o.y) / d.y;
    if (t <= 0) return null;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  // ekran noktasının altındaki kat zemini (oda yereli — dCam ile aynı çerçeve)
  function evFloorRoom(sx, sy) {
    const v = curVenue;
    setNdc({ clientX: sx, clientY: sy });
    ray.setFromCamera(ndc, camera);
    const fy = v.ml.floors[evDesign.f];
    const dy = ray.ray.direction.y;
    if (Math.abs(dy) < 1e-4) return null;
    const t = (fy - ray.ray.origin.y) / dy;
    if (t <= 0) return null;
    return toRoom(v, ray.ray.origin.x + ray.ray.direction.x * t, ray.ray.origin.z + ray.ray.direction.z * t);
  }
  const DCAM_LIM = { x: 16, z: 14 };
  // v197: iki parmakla kaydır — parmakların altındaki zemin parmakla birlikte gider
  function dCamPan(ax, ay, bx, by) {
    const p0 = evFloorRoom(ax, ay);
    const p1 = evFloorRoom(bx, by);
    if (!p0 || !p1) return;
    dCam.x = clamp(dCam.x + (p0.x - p1.x), -DCAM_LIM.x, DCAM_LIM.x);
    dCam.z = clamp(dCam.z + (p0.z - p1.z), -DCAM_LIM.z, DCAM_LIM.z);
  }
  // v197: ekrandaki (sx, sy) noktasına doğru yakınlaş / uzaklaş (eskiden sadece ortaya)
  function dCamZoomAt(sx, sy, ratio) {
    const nd = clamp(dCam.dist * ratio, 4, 34);
    if (nd === dCam.dist) return;
    const P = evFloorRoom(sx, sy);
    const f = nd / dCam.dist;
    dCam.dist = nd;
    if (!P) return;
    // bakış noktası c = dCam + lift·yön; c' = P + (c − P)·f  →  dCam' = P + (dCam − P)·f + lift·yön·(f − 1)
    const v = curVenue;
    const yaw = v.ry + dCam.yaw;
    const wx = Math.sin(yaw);
    const wz = Math.cos(yaw);
    const c = Math.cos(v.ry);
    const s = Math.sin(v.ry);
    const lx = (wx * c - wz * s) * (dCam.lift || 0);
    const lz = (wx * s + wz * c) * (dCam.lift || 0);
    dCam.x = clamp(P.x + (dCam.x - P.x) * f + lx * (f - 1), -DCAM_LIM.x, DCAM_LIM.x);
    dCam.z = clamp(P.z + (dCam.z - P.z) * f + lz * (f - 1), -DCAM_LIM.z, DCAM_LIM.z);
  }
  function designDragMove(e) {
    const ml = curVenue.ml;
    setNdc(e);
    ray.setFromCamera(ndc, camera);
    const root = ml.groups[0].parent;
    root.updateMatrixWorld(true);
    evInv.copy(root.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(evInv);
    const d = ray.ray.direction.clone().transformDirection(evInv);
    // katın zemin düzlemi
    const fy = ml.floors[evDesign.f];
    if (Math.abs(d.y) < 1e-4) return;
    const t = (fy - o.y) / d.y;
    if (t <= 0) return;
    const x = o.x + d.x * t;
    const z = o.z + d.z * t;
    const it2 = { ...dDrag.it };
    if (!ml.place(it2, x + (dDrag.off?.x || 0), z + (dDrag.off?.z || 0))) return;
    dDrag.it = it2;
    ml.dragTo(dDrag.idx, it2);
  }
  function onMove(e) {
    if (paused) return; // v157.9: ortak tuval başka ekrandayken (karargah düzenleme) şehir dokunuş almaz
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = rotated ? e.clientY - p.y : e.clientX - p.x;
    const dy = rotated ? p.x - e.clientX : e.clientY - p.y;
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
      } else if (evDesign && curVenue?.ml) {
        // v197 (karargah gibi): parmakların ortasına yakınlaş + iki parmakla kaydır
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        dCamZoomAt(mx, my, ratio);
        if (pinch.mx != null) dCamPan(pinch.mx, pinch.my, mx, my);
        pinch.mx = mx;
        pinch.my = my;
      } else self.camDist = clamp(self.camDist * ratio, 1.8, 16);
      pinch.d = d;
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (evDesign && curVenue?.ml) {
      if (drag.moved <= 6) return;
      if (dDrag) {
        dDrag.moved = drag.moved;
        designDragMove(e);
      } else if (drag.pan) {
        dCamPan(e.clientX - dx, e.clientY - dy, e.clientX, e.clientY);
      } else {
        dCam.yaw -= dx * 0.006;
        dCam.pitch = clamp(dCam.pitch + dy * 0.004, 0.35, 1.45);
      }
      return;
    }
    if (drag.moved > 6) {
      if (view === '2d') {
        top.az -= dx * 0.006;
        top.el = clamp(top.el + dy * 0.004, 0.55, 1.45);
      } else if ((driving || self.ride) && carCam === 'in') {
        // araba içi: serbest bakış (yolcu her yöne, sürücü yan camlara kadar)
        inLook.yaw = driving ? clamp(inLook.yaw - dx * 0.005, -2.4, 2.4) : inLook.yaw - dx * 0.005;
        inLook.pitch = clamp(inLook.pitch - dy * 0.004, -0.7, 0.55);
        driveCamIdle = 0;
      } else if (driving || self.ride) {
        // v149: yolcu da arabanın etrafında kamerayı çevirebilir
        driveCamOff -= dx * 0.006;
        driveCamIdle = 0;
        self.camPitch = clamp(self.camPitch + dy * 0.003, 0.05, 0.9);
      } else {
        self.camYaw -= dx * 0.006;
        camGlide = null;
        // v149: tribünde aşağıya (sahaya) da bakılabilsin
        self.camPitch = clamp(self.camPitch + dy * 0.004, heightAt(self.x, self.z) == null ? -0.2 : -0.55, 1.2);
      }
    }
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (dDrag && dDrag.moved > 8 && evDesign) onEvent?.({ type: 'homeDrop', idx: dDrag.idx, x: dDrag.it.x, z: dDrag.it.z, r: dDrag.it.r });
    else if (drag && drag.moved <= 8 && e.type === 'pointerup') handleTap(e);
    dDrag = null;
    drag = null;
  }
  function onWheel(e) {
    if (paused) return; // v157.9: ortak tuval başka ekrandayken (karargah düzenleme) şehir dokunuş almaz
    e.preventDefault();
    if (view === '2d') top.dist = clamp(top.dist * (1 + clamp(e.deltaY, -200, 200) * 0.0012), 14, 110);
    else if (evDesign && curVenue?.ml) dCamZoomAt(e.clientX, e.clientY, 1 + clamp(e.deltaY, -200, 200) * 0.0012);
    else self.camDist = clamp(self.camDist + e.deltaY * 0.006, 1.8, 16);
  }
  const onKeyDown = (e) => {
    if (paused) return;
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
  canvas.addEventListener('lostpointercapture', onUp); // v159: bırakılış kaçarsa parmak listede kalmasın
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // --- kare döngüsü ------------------------------------------------------------------
  const clock = new THREE.Clock();
  const camPos = new V(0, 20, 20);
  // v149 — tribün kamerası durumu
  let eyeSm = null;
  let wasInStands = false;
  let standsK = 0;
  let camGlide = null;
  let lookSm = null;
  const glideCam = (yaw, pitch) => {
    camGlide = { yaw, pitch };
  };
  const camTarget = new V();
  const head = new V();
  // v153 — haraç animasyonu (sadece bu cihazda; diğer oyuncular görmez)
  let harac = null;
  let heist = null; // v154 — soygun dizisi (aşağıda api'den önce kurulur)
  const haracCam = { k: 0, x: 0, z: 0 };
  const coinTex = (() => {
    const mk = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    let coin = null;
    let bill = null;
    return (kind) =>
      kind === 'bill'
        ? (bill ||= mk(96, 48, (g) => {
            g.fillStyle = '#1d7a3e';
            g.fillRect(0, 0, 96, 48);
            g.fillStyle = '#4fd17a';
            g.fillRect(4, 4, 88, 40);
            g.strokeStyle = '#1d7a3e';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(48, 24, 11, 0, Math.PI * 2);
            g.stroke();
            g.fillStyle = '#1d7a3e';
            g.font = '900 16px Arial';
            g.textAlign = 'center';
            g.fillText('₺', 48, 30);
          }))
        : (coin ||= mk(64, 64, (g) => {
            g.fillStyle = '#b37800';
            g.beginPath();
            g.arc(32, 32, 30, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#ffcf33';
            g.beginPath();
            g.arc(32, 32, 25, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#8a5a00';
            g.font = '900 30px Arial';
            g.textAlign = 'center';
            g.fillText('₺', 32, 43);
          }));
  })();
  function haracFx(cls, text) {
    const el = document.createElement('div');
    el.className = `cs-harac-fx ${cls}`;
    el.textContent = text;
    el.style.display = 'none';
    layer.appendChild(el);
    return el;
  }
  function haracFinish() {
    const h = harac;
    if (!h) return;
    harac = null;
    h.npc.setForcePose(null);
    h.npc.shakeUntil = 0;
    me.setForcePose(null);
    if (h.savedHold) me.setHolding(h.savedHold);
    self.camDist = h.savedDist;
    h.coins.forEach((c) => {
      scene.remove(c.sp);
      c.sp.material.dispose();
    });
    h.label?.remove();
    h.siren?.remove();
    h.resolve?.();
  }
  function stepHarac(dt, now) {
    const h = harac;
    h.t += dt;
    // ikisi birbirine baksın (ekranda soldan sağa)
    const right = new V().setFromMatrixColumn(camera.matrixWorld, 0);
    const side = (h.npc.x - me.x) * right.x + (h.npc.z - me.z) * right.z;
    if (Math.abs(side) > 0.05) {
      me.facingLeft = side < 0;
      h.npc.facingLeft = !me.facingLeft;
    }
    if (h.phase === 'aim') {
      if (!h.scared && h.t > 0.45) {
        h.scared = true;
        h.npc.setForcePose('handsup');
        h.npc.shakeUntil = now + 60000;
        h.npc.say('Tamam abi, sakin ol! Ateş etme!');
      }
      if (h.outcome && h.t >= 1.15) {
        h.phase = h.outcome.outcome;
        h.t = 0;
        if (h.phase === 'ok') {
          h.npc.say('Al abi, al! Hepsi bu!');
          h.label = haracFx('gold', `+${Number(h.outcome.reward || 0).toLocaleString('tr-TR')} altın`);
        } else if (h.phase === 'caught') {
          h.npc.say('Polis! İmdat!');
          me.say('Eyvah… 🚨');
          h.label = haracFx('police', '🚨 POLİS!');
          h.siren = document.createElement('div');
          h.siren.className = 'cs-harac-siren';
          layer.appendChild(h.siren);
        }
      }
    }
    const W = container.clientWidth;
    const H = container.clientHeight;
    const ly = me.y + AV_PLANE_H - AV_FEET + 0.25;
    const lx = (me.x + h.npc.x) / 2;
    const lz = (me.z + h.npc.z) / 2;
    if (h.phase === 'ok') {
      const from = { x: h.npc.x, y: h.npc.y + 1.85, z: h.npc.z };
      while (h.coins.length < 9 && h.t > h.coins.length * 0.11) {
        const bill = h.coins.length % 3 === 1;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: coinTex(bill ? 'bill' : 'coin'), transparent: true, toneMapped: false }));
        sp.scale.set(bill ? 0.36 : 0.24, bill ? 0.18 : 0.24, 1);
        sp.position.set(from.x, from.y, from.z);
        scene.add(sp);
        h.coins.push({ sp, t0: h.t, arc: 0.7 + Math.random() * 0.5, j: (Math.random() - 0.5) * 0.4, from });
      }
      h.coins.forEach((c) => {
        const k = clamp((h.t - c.t0) / 0.62, 0, 1);
        const to = { x: me.x + c.j * 0.3, y: me.y + 1.05, z: me.z + c.j * 0.3 };
        c.sp.position.set(c.from.x + (to.x - c.from.x) * k, c.from.y + (to.y - c.from.y) * k + Math.sin(k * Math.PI) * c.arc, c.from.z + (to.z - c.from.z) * k);
        c.sp.material.rotation = k * 9 + c.j * 5;
        c.sp.visible = k < 1;
      });
      if (h.t > 0.7) {
        const k = clamp((h.t - 0.7) / 1.6, 0, 1);
        h.label.style.opacity = String(k < 0.12 ? k / 0.12 : k > 0.85 ? (1 - k) / 0.15 : 1);
        placeLabel(h.label, lx, ly + k * 0.5, lz, W, H, 80, ` scale(${(1 + Math.max(0, 0.25 - k) * 1.6).toFixed(2)})`);
      }
      if (h.t > 1.3 && me.forcePose) me.setForcePose(null);
      if (h.t > 2.2 && h.npc.forcePose) {
        h.npc.setForcePose(null);
        h.npc.shakeUntil = 0;
      }
      if (h.t > 2.6) haracFinish();
    } else if (h.phase === 'caught') {
      h.siren.classList.toggle('blue', Math.floor(h.t / 0.16) % 2 === 1);
      h.siren.style.opacity = String(h.t > 2.2 ? Math.max(0, (2.6 - h.t) / 0.4) : 1);
      if (h.t > 0.3 && me.forcePose) me.setForcePose(null);
      placeLabel(h.label, lx, ly + 0.15, lz, W, H, 80);
      if (h.t > 2.6) haracFinish();
    } else if (h.phase === 'cancel' && h.t > 0.3) haracFinish();
  }
  // v157 — girilebilir mekânlar: içindeyken tavan / kameraya bakan duvar kesilir (oyundaki 3D mekân gibi)
  let curVenue = null;
  let venueCamK = 0;
  let gmap = null; // v157: harita (ilk açılışta kurulur)
  function setVenue(v) {
    if (v === curVenue) return;
    if (curVenue) {
      curVenue.low.forEach((k) => (k.group.visible = true));
      curVenue.lowInner.forEach((g) => (g.visible = true));
      curVenue.stubs.forEach((g) => (g.visible = false));
      if (curVenue.ml) curVenue.ml.reset(curVenue);
    }
    const wasEv = Boolean(curVenue?.ml);
    curVenue = v;
    zoneKey = '__venue__';
    if (wasEv !== Boolean(v?.ml)) onEvent?.({ type: 'home', inside: Boolean(v?.ml) }); // v196: evin içine girildi / çıkıldı
  }
  // v158 — YALITILMIŞ İÇ MEKÂN (çete karargahı): içerideyken şehir / dış dünya hiç çizilmez,
  // karargah ayrı bir mekân gibi durur (haritadaki tasarım hatalarından etkilenmez, çok daha hafif).
  let isoV = null;
  let isoSaved = null;
  function setIso(v) {
    if (isoSaved) {
      isoSaved.hidden.forEach((o) => (o.visible = true));
      if (isoSaved.parent && isoSaved.root.parent === scene) isoSaved.parent.attach(isoSaved.root);
      cullItems.forEach((c) => (c.iso = false));
      scene.background = bgCol;
      isoSaved = null;
    }
    isoV = v || null;
    if (v) {
      const parent = v.root.parent;
      if (parent && parent !== scene) scene.attach(v.root);
      const keep = new Set([v.root, me.group, ring, callRing]);
      const hidden = [];
      scene.children.forEach((o) => {
        if (keep.has(o) || o.isLight || o.isCamera || !o.visible) return;
        if (o === moonL.target || o === headSpot.target) return;
        o.visible = false;
        hidden.push(o);
      });
      cullItems.forEach((c) => (c.iso = c.o !== v.root)); // v196: yalıtılan mekânın kökü (3 katlı ev) gizlenmez
      scene.background = isoBg;
      isoSaved = { root: v.root, parent: parent !== scene ? parent : null, hidden };
    }
    cull(true);
  }
  function cutaway() {
    const v = curVenue;
    if (!v) return;
    const cp = toRoom(v, camera.position.x, camera.position.z);
    const hw = VROOM.W / 2;
    const hd = VROOM.D / 2;
    const m = 0.05;
    // [ön, sağ, arka, sol]: kamera duvarın arkasına geçince o duvar kesilir, yerinde alçak kök kalır
    const hide = [cp.z > hd + m, cp.x > hw + m, cp.z < -hd - m, cp.x < -hw - m];
    if (v.ml) {
      // v196: 3 katlı ev — bulunulan katın kameraya bakan duvarları alçalır; tasarımda seçilen katın üstü gizli
      if (evDesign) v.ml.designView(v, evDesign.f, hide);
      else v.ml.cut(v, v.ml.level(me.y), hide);
      return;
    }
    v.low.forEach((k, i) => (k.group.visible = !hide[i]));
    v.lowInner.forEach((g, i) => (g.visible = !hide[i]));
    v.stubs.forEach((g, i) => (g.visible = hide[i]));
  }
  // v157.1 — mekânın önünde kamera tentenin / saçağın içine ya da ön duvara girince (ör. barın
  // tentesi telefonda dikey ekranda tüm görüşü kapatıyordu) ön cephe kesilir, yerinde alçak dip kalır.
  let porchV = null;
  function porchCut() {
    let hit = null;
    if (!curVenue && camera.position.y > 2.2) {
      for (const v of W.venues) {
        if (v.isolated || v.noInt) continue; // v158.1: karargahın ön cephesi hiç kesilmez · v159.1: içi kaldırılan binalar da
        if ((camera.position.x - v.wx) ** 2 + (camera.position.z - v.wz) ** 2 > 40 * 40) continue;
        const cp = toRoom(v, camera.position.x, camera.position.z);
        if (Math.abs(cp.x) < VROOM.W / 2 + 1.5 && cp.z > VROOM.D / 2 - 0.2 && cp.z < VROOM.D / 2 + 5) {
          hit = v;
          break;
        }
      }
    }
    if (hit === porchV) return;
    if (porchV && porchV !== curVenue) {
      porchV.low[0].group.visible = true;
      porchV.lowInner[0].visible = true;
      porchV.stubs[0].visible = false;
    }
    porchV = hit;
    if (hit) {
      hit.low[0].group.visible = false;
      hit.lowInner[0].visible = false;
      hit.stubs[0].visible = true;
    }
  }
  // hayvanlar (orman, köyler, vadi, şehirde sokak kedileri / köpekleri) — sadece canlı motorda
  const animals = snapshot ? null : buildAnimals(W, scene, { cityFree: (x, z) => !cellBlocked(x, z), groundCity: (x, z) => W.groundCity(x, z), mobile: IS_MOBILE });
  let raf = 0;
  let paused = false;
  let lite = false; // v191: büyük harita açık
  let first = true;
  // v215: sırtı kameraya çevirme SADECE doğma / ışınlanmada (kamera her sıfırlandığında değil —
  // 2D/3D görünüm değişimi, fotoğraf vb. avatarı döndürüyordu)
  let faceAway = true;
  let lightT = 0;
  let todT = 30;
  let zoneKey = '';
  let tickT = 0;
  let npcTalkT = 3;
  const camRay = new THREE.Raycaster();

  // v147.5 — akıllı yürüme: önce düz, sonra duvar boyunca kay, olmazsa engelin etrafından dön
  // v167: köprü / tünel duvarı yayaya da engel (zemine atlanmaz) — bkz. outerWorld › railWalkBlocked
  const canStand = (x, z) => !blockedAt(x, z) && !hitsParked(x, z) && !W.railWalkBlocked(x, z, PLAYER_R, me.y, false, walkHint);
  function moveSmart(vx, vz, dt) {
    const ox = self.x;
    const oz = self.z;
    const d = Math.hypot(vx, vz);
    // bir şekilde engelin içinde kaldıysak en yakın boş yere çık
    if (!canStand(ox, oz)) {
      // v157: şehrin dışında (orman vb.) arama yapılmaz — serbest yürüyüp çıkılır (telefonda kare başı ağır arama olmasın)
      const f = W.modeAt(ox, oz) === 'city' ? freeNear(ox, oz) : null;
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
    if (harac) {
      self.target = null;
      self.path = null;
      ring.visible = false;
      me.moving = false;
      return;
    }
    let f = 0;
    let s = 0;
    if (!storyLock) {
      if (keys.KeyW || keys.ArrowUp) f += 1;
      if (keys.KeyS || keys.ArrowDown) f -= 1;
      if (keys.KeyD || keys.ArrowRight) s += 1;
      if (keys.KeyA || keys.ArrowLeft) s -= 1;
    }
    const manual = f || s;
    if (self.seat) {
      // v202: oyun / yayın açıkken (internet kafe, evdeki konsol) ok tuşları oyuna gider, avatar kalkmaz
      if (manual && !seatHolds.size) standUp();
      else {
        me.moving = false;
        return;
      }
    }
    const speed = me.swim ? (self.run ? 2.6 : 1.6) : self.run ? RUN_SPEED : WALK_SPEED;
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
    evY = me.y; // v196: kat-farkında çarpışma
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
          const p = (self.repath = (self.repath || 0) + 1) <= 3 && !(EV && evLocal(self.x, self.z)) ? findPath(self.x, self.z, fin.x, fin.z) : null; // v196: evin içinde 2B yol yok
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
    // v157: otoyol / köprü / köy yolunda en yakın rota noktası (köprü üstü-altı ayrımı için)
    if (W.modeAt(self.x, self.z) === 'hwy') {
      const n = hwyNearest(self.x, self.z, walkHint);
      walkHint = n && n.dist < 60 ? n.i : -1;
    } else walkHint = -1;
    const swim = isSwimming(self.x, self.z);
    me.swim = swim;
    me.y += (standY(self.x, self.z, walkHint, me.y) - me.y) * Math.min(1, dt * (swim ? 4 : 12));
    me.moving = moving;
    me.run = self.run && !swim;
  }

  // v175 — BİR KOLTUĞA BİR KİŞİ: başka bir oyuncu (ya da senaryo karakteri) o koltukta oturuyorsa
  // koltuk dolu sayılır (mekânlardaki gibi; üst üste oturma yok). Ağdan ek veri yok — oturan oyuncunun
  // konumu zaten koltuğun kendisi.
  function seatBusy(st) {
    for (const r of remotes.values()) {
      const q = r.st;
      if (!q || q.p !== 's') continue;
      if (Math.abs(q.x - st.x) > 0.45 || Math.abs(q.z - st.z) > 0.45) continue;
      if (Math.hypot(q.x - st.x, q.z - st.z) < 0.4 && (q.sy == null || Math.abs(q.sy - st.y) < 0.45)) return true;
    }
    return false;
  }
  // v202 — KOLTUK KİLİDİ: internet kafede / evde oyun ya da yayın açıkken ok tuşları ve dokunuş oyuncuyu
  // koltuktan kaldırmaz (eskiden PC'de oyunda sağa sola basınca avatar kalkıp yürüyordu)
  const seatHolds = new Set();
  function sitAt(st) {
    if (driving || !st || st.taken || seatBusy(st)) return;
    self.target = null;
    self.path = null;
    ring.visible = false;
    self.seat = st;
    st.taken = true;
    self.x = st.x;
    self.z = st.z;
    me.x = st.x;
    me.z = st.z;
    me.sitting = !st.stand; // v202: duşakabinde ayakta durulur
    me.seatY = st.y;
    me.seat3Yaw = st.tier ? st.yaw ?? null : tableYaw(st.x, st.z) ?? st.yaw ?? null; // v207/v211: koltuğun yönü, yanında masa varsa masaya dönük
    // v149: tribün koltuğu — yüz sahaya dönük, kamera arkadan sahaya bakar
    me.seatYaw = st.tier ? st.yaw : null;
    if (st.tier) glideCam(st.yaw + Math.PI, 0.28);
    zoneKey = '__sit__';
  }
  // v149: tribünde en yakın boş koltuk (aynı basamak hizası)
  function nearestSeat() {
    let best = null;
    let bd = 1.3;
    seats.forEach((st) => {
      if (st.taken) return;
      const dy = st.y - me.y;
      if (dy > 1.15 || dy < -0.3) return;
      const d = Math.hypot(st.x - self.x, st.z - self.z);
      if (d < bd && !seatBusy(st)) {
        bd = d;
        best = st;
      }
    });
    return best;
  }
  function standUp() {
    const st = self.seat;
    if (!st) return;
    self.seat = null;
    st.taken = false;
    me.sitting = false;
    me.seatYaw = null;
    me.seat3Yaw = null;
    // v159.1: kalkınca masa / tezgâh ile koltuk arasına sıkışılmasın — önce bolca boşluk olan yön
    // (önü, arkası, yanları; geniş yarıçapla) aranır, yoksa en yakın boş yer
    const sy = Math.sin(st.yaw);
    const cy = Math.cos(st.yaw);
    let f = null;
    for (const [fw, sd] of [[0.75, 0], [1.1, 0], [-0.75, 0], [-1.1, 0], [0, 0.85], [0, -0.85], [1.2, 0.8], [1.2, -0.8]]) {
      const x = st.x + sy * fw + cy * sd;
      const z = st.z + cy * fw - sy * sd;
      if (!blockedAt(x, z, PLAYER_R * 1.6)) {
        f = { x, z };
        break;
      }
    }
    if (!f) f = freeNear(st.x + sy * 0.75, st.z + cy * 0.75);
    if (f) {
      self.x = f.x;
      self.z = f.z;
    }
    zoneKey = '__stand__';
  }
  function placeCamera(dt) {
    camera.userData.billboardYaw = null;
    if (heist?.active && heist.cam(dt)) return; // v154
    // v199 — YAYINDA: ana ekran yayın kamerasından (izleyicinin gördüğü açı; eski evdeki setFixedCamera gibi)
    if (streamCam && !evDesign) {
      const v = W.venues.find((q) => q.type === (streamCam.room || 'ev'));
      if (v) {
        const base = v.ml ? v.ml.floors[streamCam.f || 0] : 0.16;
        const p = fromRoom(v, streamCam.px, streamCam.pz);
        const t = fromRoom(v, streamCam.tx, streamCam.tz);
        camera.position.set(p.x, base + streamCam.py, p.z);
        camPos.copy(camera.position);
        camera.lookAt(t.x, base + streamCam.ty, t.z);
        const fv = streamCam.fov || 64;
        if (camera.fov !== fv) {
          camera.fov = fv;
          camera.updateProjectionMatrix();
        }
        return;
      }
    }
    if (evDesign && curVenue?.ml) {
      const v = curVenue;
      const fy = v.ml.floors[evDesign.f];
      const yaw = v.ry + dCam.yaw;
      const c0 = fromRoom(v, dCam.x, dCam.z);
      const c = { x: c0.x + Math.sin(yaw) * (dCam.lift || 0), z: c0.z + Math.cos(yaw) * (dCam.lift || 0) };
      const want = new V(c.x + Math.sin(yaw) * Math.cos(dCam.pitch) * dCam.dist, fy + Math.sin(dCam.pitch) * dCam.dist, c.z + Math.cos(yaw) * Math.cos(dCam.pitch) * dCam.dist);
      camPos.lerp(want, first ? 1 : 1 - Math.exp(-dt * 10));
      camera.position.copy(camPos);
      const look = new V(c.x, fy + 0.4, c.z);
      lookSm = !lookSm ? look.clone() : lookSm.lerp(look, 1 - Math.exp(-dt * 12));
      camera.lookAt(lookSm);
      return;
    }
    {
      const ic = view !== '2d' && carCam === 'in' ? (driving && myCar ? myCar : !driving ? rideCar() : null) : null;
      setInterior(ic);
    }
    if (view === '2d') {
      const k = first ? 1 : 1 - Math.exp(-dt * 8);
      Object.keys(top).forEach((key) => {
        topCur[key] += (top[key] - topCur[key]) * k;
      });
      const kt = first ? 1 : 1 - Math.exp(-dt * 10);
      // v162 DÜZELTME: 2D'de kamera eskiden hep 0 yüksekliğine bakıyordu — zemin yükseldikçe (yokuş,
      // tünel yolu, Kervankent yolu) oyuncu / araba ekranın ortasından kayıp kadrajdan çıkıyordu.
      // Artık oyuncunun (araçtaysa aracın) gerçek yüksekliği takip edilir → hep ortada.
      const gy = (driving && myCar ? myCar.y : me.y) || 0;
      const ty = (Number.isFinite(gy) ? gy : 0) + 0.6;
      camTarget.set(camTarget.x + (self.x - camTarget.x) * kt, first ? ty : camTarget.y + (ty - camTarget.y) * kt, camTarget.z + (self.z - camTarget.z) * kt);
      camPos.set(camTarget.x + Math.sin(topCur.az) * Math.cos(topCur.el) * topCur.dist, camTarget.y + Math.sin(topCur.el) * topCur.dist, camTarget.z + Math.cos(topCur.az) * Math.cos(topCur.el) * topCur.dist);
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      camera.userData.billboardYaw = topCur.az;
      camera.userData.billboardEl = topCur.el;
      return;
    }
    const rc = !driving ? rideCar() : null;
    if (interiorCar && ((driving && myCar) || rc)) {
      // v149 — araba içinden: koltuktaki göz hizası, arabanın yönüne göre serbest bakış
      const c = interiorCar;
      // v154: yolcunun ayrı göz noktası (passengerView); kokpit ön/arka yolcuya da gösterilir
      const asPax = !driving || dbgPv != null; // dbgPv: geliştirme önizlemesi (yolcu gözü)
      const pv = asPax ? passengerView(c, driving ? dbgPv : self.ride.k || 1) : null;
      const ck = asPax ? pv : cockpitOf(c, 0);
      me.group.visible = false;
      const rig = !asPax || pv.rig ? cockpitRig(c, cockpitOf(c, 0)) : null;
      if (rig) {
        if (!rig.group.visible) showRig(c, true);
        const vmax = c.v.def.phys.vmax || 30;
        const spdR = Math.hypot(c.vx || 0, c.vz || 0);
        rig.update(dt, {
          steer: c.steer || 0,
          kmh: driving ? driveStat.kmh || 0 : Math.round(Math.abs(c.spd || 0) * 3.6),
          gear: driving ? driveStat.gear || 'N' : Math.abs(c.spd || 0) > 0.3 ? 'D' : 'N',
          rpm: Math.min(7.8, 0.9 + ((spdR / vmax) * 5 % 1) * 5.5 + (driveStat.gear === 'N' ? 0 : 0.6)),
          vmaxKmh: Math.max(60, Math.ceil((vmax * 3.6) / 20) * 20),
          heading: c.yaw,
          now: performance.now(),
        });
      }
      driveCamIdle += dt;
      if (driving && driveCamIdle > 2.2) {
        inLook.yaw *= Math.exp(-dt * 1.8);
        inLook.pitch += (-0.06 - inLook.pitch) * Math.min(1, dt * 1.8);
      }
      // v151 — göz gövdeyle birlikte yalpalar (yatış / fren), baş ataleti: yön yumuşak takip eder
      c.v.root.updateMatrixWorld(true);
      const eye = (c.v.tilt || c.v.root).localToWorld(ck.eye.clone());
      if (c.v.tilt) eye.sub(c.v.tilt.getWorldPosition(new V())).add(c.v.root.getWorldPosition(new V()));
      camPos.copy(eye);
      camera.position.copy(eye);
      if (camShake > 0.002) {
        camera.position.y += (Math.random() - 0.5) * camShake * 0.3;
        camShake *= Math.exp(-dt * 7);
      }
      let dyw = c.yaw - (inYawSm ?? c.yaw);
      dyw = Math.atan2(Math.sin(dyw), Math.cos(dyw));
      inYawSm = first || inYawSm == null ? c.yaw : inYawSm + dyw * Math.min(1, dt * 9);
      const spdIn = driving ? Math.hypot(c.vx || 0, c.vz || 0) : Math.abs(c.spd || 0);
      // hızlanınca hafif başın geri gitmesi / virajda dönüş yönüne bakış
      const lookAhead = clamp(dyw * 0.9, -0.25, 0.25);
      const cy = inYawSm + inLook.yaw + lookAhead;
      const rigOn = Boolean(rig && c.v.rig?.group.visible);
      // v151: ufka yakın; v153 kokpitte gösterge görünsün; v154 otobüs yolcusu yola biraz aşağı bakar
      const pitch = inLook.pitch + (rigOn ? -0.02 : pv?.bus ? -0.08 : 0.04);
      const cp = Math.cos(pitch);
      const roll = clamp(-(c.roll || 0) * 0.7, -0.08, 0.08);
      camera.up.set(Math.cos(cy) * Math.sin(roll), Math.cos(roll), -Math.sin(cy) * Math.sin(roll));
      camera.lookAt(eye.x + Math.sin(cy) * cp, eye.y + Math.sin(pitch), eye.z + Math.cos(cy) * cp);
      camera.up.set(0, 1, 0);
      const wantFov = (rigOn && camera.aspect < 1 ? 82 : 74) + Math.min(1, spdIn / (c.v.def.phys.vmax || 30)) * 8;
      if (Math.abs(camera.fov - wantFov) > 0.05) {
        camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
      // iç ışık: kabin karanlık kalmasın (ışık havuzunun sonuncusu araca girer)
      const pl = pool[pool.length - 1];
      if (pl) {
        if (rigOn) {
          // v153: kokpit ışığı — torpidonun üstünden, soğuk beyaz (tavan sarıya boyanmasın)
          const f = new V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
          pl.position.set(eye.x + f.x * 0.35, eye.y + 0.05, eye.z + f.z * 0.35);
          pl.color.set('#dfe8ff');
          pl.intensity = 1.6;
          pl.distance = 2.2;
        } else {
          pl.position.set(eye.x, eye.y + 0.35, eye.z);
          pl.color.set('#ffe9cc');
          pl.intensity = 2.4;
          pl.distance = 2.8;
        }
      }
      return;
    }
    if ((driving && myCar) || rc) {
      const c = driving ? myCar : rc;
      const spd = driving ? Math.hypot(c.vx, c.vz) : Math.abs(c.spd || 0);
      driveCamIdle += dt;
      // v149: yolcunun kamerası kendiliğinden öne dönmez (istediği yöne bakar)
      if (driving && driveCamIdle > 1.4) driveCamOff *= Math.exp(-dt * 2.2);
      const cy = c.yaw + Math.PI + driveCamOff;
      const zoom = self.camDist / 6.2;
      // v151: uzun araçlarda (otobüs, dorseli tır) kamera daha geride/yukarıda; motorda biraz yakın
      if (c.v.camK == null) {
        const trl = c.v.trailer && c.v.trailerOn ? c.v.trailer.length : 0;
        const L = c.v.len + trl;
        c.v.camK = Math.pow(clamp(L / 4.6, 0.8, 4.2), 0.6);
        // aracın merkezden arkaya uzunluğu (dorse dahil) — kamera bunun arkasında durur
        c.v.camBack = Math.max(0, c.v.len / 2 + trl - 2.4);
        // v152: yüksek araçlar (tır çekicisi, otobüs) — kamera tavanın üstünden baksın
        if (c.v.camH == null) {
          const bb = new THREE.Box3();
          (c.v.tilt || c.v.root).updateWorldMatrix(true, true);
          (c.v.tilt || c.v.root).traverseVisible((o) => {
            if (o.isMesh && o.geometry) {
              if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
              bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
            }
          });
          c.v.camH = Math.max(0, bb.max.y - c.v.root.position.y - 1.7);
        }
      }
      const ck = c.v.camK;
      const tall = c.v.camH || 0;
      let dist = ((5.4 + spd * 0.055) * zoom + c.v.camBack + tall * 0.9) * (camera.aspect < 1 ? 1.18 : 1);
      const hgt = (1.7 + self.camPitch * 2.2 + spd * 0.012) * zoom * Math.sqrt(ck) + tall * 1.1;
      head.set(c.x, c.y + 1.2, c.z);
      const dir = new V(Math.sin(cy), 0, Math.cos(cy));
      camRay.set(head, dir);
      camRay.far = dist;
      const h = camRay.intersectObjects(blockers, false);
      if (h.length) dist = Math.max(2.2, h[0].distance - 0.5);
      const want = new V(c.x + dir.x * dist, c.y + hgt, c.z + dir.z * dist);
      // v157: tünelde tavana çıkmasın, arazinin / köprünün altına girmesin
      if (W.modeAt(want.x, want.z) !== 'city') {
        const n = hwyNearest(want.x, want.z, carHint);
        if (n && inTunnel(n.s) && n.dist < 7) {
          want.y = Math.min(want.y, n.y + 6.4);
          const lim = 5.4;
          if (Math.abs(n.d) > lim) {
            const k = (Math.abs(n.d) - lim) * Math.sign(n.d);
            want.x -= n.fr.rx * k;
            want.z -= n.fr.rz * k;
          }
        } else want.y = Math.max(want.y, groundY(want.x, want.z, -1, c.y) + 1.4);
      }
      camPos.lerp(want, first ? 1 : 1 - Math.exp(-dt * 7));
      camera.position.copy(camPos);
      if (camShake > 0.002) {
        camera.position.x += (Math.random() - 0.5) * camShake;
        camera.position.y += (Math.random() - 0.5) * camShake;
        camShake *= Math.exp(-dt * 7);
      }
      const fwd = new V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      camera.lookAt(c.x + fwd.x * (2.6 * ck + tall * 0.8), c.y + 0.9 * Math.sqrt(ck) + tall * 0.35, c.z + fwd.z * (2.6 * ck + tall * 0.8));
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
    // v149: göz hizası yumuşak (tribün basamaklarında kamera zıplamasın)
    const eyeRaw = 1.55 + me.y;
    eyeSm = first || eyeSm == null ? eyeRaw : eyeSm + (eyeRaw - eyeSm) * Math.min(1, dt * 6);
    const eyeY = eyeSm;
    // v149 — tribündeyken: omuz üstü yakın kamera, ilk çıkışta sahaya döner
    const inStands = !driving && heightAt(self.x, self.z) != null;
    if (inStands && !wasInStands && !self.seat) {
      const st = city.lots.find((l) => l.type === 'stadyum');
      if (st) glideCam(Math.atan2(self.x - st.mx, self.z - st.mz), 0.3);
    }
    wasInStands = inStands;
    if (camGlide) {
      const k = Math.min(1, dt * 4.5);
      let dy = camGlide.yaw - self.camYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      self.camYaw += dy * k;
      self.camPitch += (camGlide.pitch - self.camPitch) * k;
      if (Math.abs(dy) < 0.01 && Math.abs(camGlide.pitch - self.camPitch) < 0.01) camGlide = null;
    }
    standsK = first ? (inStands ? 1 : 0) : standsK + ((inStands ? 1 : 0) - standsK) * Math.min(1, dt * 5);
    // v215: doğunca / ışınlanınca avatarın sırtı kameraya (evden / binadan çıkınca sırtı binaya) dönük
    if (faceAway && !driving && !me.sitting && !snapshot) me.faceYaw(self.camYaw + Math.PI);
    faceAway = false;
    const yaw = self.camYaw;
    const pitch = clamp(self.camPitch, -0.2, 1.2);
    const aspect = camera.aspect || 1;
    // v157: mekânın içinde oyundaki 3D mekân kamerası gibi yakın (tavanın altında, odanın dışına taşmaz)
    venueCamK += ((curVenue ? 1 : 0) - venueCamK) * Math.min(1, dt * 3);
    const baseDist = self.camDist * (1 - venueCamK) + Math.min(self.camDist, 4.8) * venueCamK;
    let dist = baseDist * (aspect < 1 ? 1 + (1 - aspect) * 0.55 : 1);
    // v153: haraçta kamera ikisinin ortasına bakar
    if (harac) {
      haracCam.x = harac.npc.x;
      haracCam.z = harac.npc.z;
    }
    haracCam.k = clamp(haracCam.k + (harac ? dt * 2.5 : -dt * 2), 0, 1);
    const hk = haracCam.k * haracCam.k * (3 - 2 * haracCam.k);
    const fx = self.x + (haracCam.x - self.x) * 0.56 * hk;
    const fz = self.z + (haracCam.z - self.z) * 0.56 * hk;
    head.set(fx, eyeY, fz);
    let want = null;
    let look = null;
    if (standsK < 0.999) {
      const dir = new V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      // kamera binaya girmesin (mekânın içindeyken duvarlar kesitle gizlenir; ışın yok)
      if (!curVenue) {
        camRay.set(head, dir);
        camRay.far = dist;
        const h = camRay.intersectObjects(blockers, false);
        if (h.length) dist = Math.max(1.2, h[0].distance - 0.4);
      }
      want = head.clone().addScaledVector(dir, dist);
      if (curVenue?.ml) {
        const v = curVenue;
        v.ml.camClamp(want, (x, z) => toRoom(v, x, z), (x, z) => fromRoom(v, x, z), evDesign ? v.ml.floors[evDesign.f] + 0.2 : me.y);
      } else if (curVenue) {
        const v = curVenue;
        const lp = toRoom(v, want.x, want.z);
        const wp = fromRoom(v, clamp(lp.x, -VROOM.W / 2 - 3.5, VROOM.W / 2 + 3.5), clamp(lp.z, -VROOM.D / 2 - 3.5, VROOM.D / 2 + 3.5));
        want.x = wp.x;
        want.z = wp.z;
        want.y = clamp(want.y, 0.4 + (v.y0 || 0), 0.16 + VROOM.H - 0.2 + (v.y0 || 0));
      } else if (W.modeAt(self.x, self.z) === 'city') want.y = Math.max(want.y, 0.5, me.y + 0.3);
      else want.y = Math.max(want.y, groundY(want.x, want.z, walkHint, me.y) + 0.8, me.y + 0.3);
      look = new V(fx, eyeY - 0.15, fz);
    }
    if (standsK > 0.001) {
      const baseY = me.sitting ? (me.seatY ?? me.y + 0.5) + 0.85 : eyeY;
      const p2 = clamp(self.camPitch, -0.55, 1.1);
      const from = new V(self.x, baseY, self.z);
      // v151: biraz daha geride/yukarıda — avatar ekranı kaplamasın
      const back = clamp(2.3 * (self.camDist / 6.2), 1.6, 3.8);
      const off = new V(Math.sin(yaw) * back, 1.0 + Math.max(0, p2) * 0.9, Math.cos(yaw) * back);
      let len = off.length();
      off.normalize();
      camRay.set(from, off);
      camRay.far = len;
      const h2 = camRay.intersectObjects(blockers, false);
      if (h2.length) len = Math.max(0.35, h2[0].distance - 0.25);
      const w2 = from.clone().addScaledVector(off, len);
      const fwd = new V(-Math.sin(yaw) * Math.cos(p2), -Math.sin(p2), -Math.cos(yaw) * Math.cos(p2));
      const l2 = w2.clone().addScaledVector(fwd, 10);
      if (want) {
        want.lerp(w2, standsK);
        look.lerp(l2, standsK);
      } else {
        want = w2;
        look = l2;
      }
    }
    camPos.lerp(want, first ? 1 : 1 - Math.exp(-dt * 12));
    camera.position.copy(camPos);
    lookSm = first || !lookSm ? look.clone() : lookSm.lerp(look, 1 - Math.exp(-dt * 14));
    camera.lookAt(lookSm);
  }

  function updateLights(force, px = self.x, pz = self.z) {
    const near = [];
    for (const L of lights) {
      if (L.ctl && L.ctl.on === false) continue; // v202: evde söndürülen lamba / şömine
      const d = (L.x - px) ** 2 + (L.z - pz) ** 2;
      if (d < 150 * 150) near.push({ L, d });
    }
    near.sort((a, b) => a.d - b.d);
    near.length = Math.min(near.length, POOL);
    // v157: mekânın içinde lambalar gündüz de yanar
    const mul = curVenue ? 1 : lampMul;
    pool.forEach((pl, i) => {
      if (interiorCar && i === pool.length - 1) return; // v151: araç içi ışığı
      const n = near[i];
      if (!n) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(n.L.x, n.L.y, n.L.z);
      pl.color.copy(n.L.color);
      pl.intensity = n.L.intensity * 1.15 * (n.L.inner ? 1 : mul);
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
    // v149: yolcuyken önce arabanın bu karedeki yeri hesaplanır, sonra koltuk + kamera
    // (eskiden bir kare geriden geliyordu → yolcu ekranında araba titriyordu)
    updateRemoteCars(dt);
    if (driving && myCar) {
      stepDrive(dt);
      if (ejectReq) ejectRider();
    } else if (fall) stepFall(dt);
    else if (self.ride) stepRide(dt);
    else if (heist?.active) heist.step(dt, now); // v154: soygun dizisi oyuncuyu ve kamerayı yönetir
    else stepWalk(dt);
    // park halindeki araba / çağırma animasyonu
    if (myCar) {
      if (!driving) {
        if (myCar.loose) stepLooseCar(myCar, dt); // v216: sürücüsüz kalan binek (devrilen motor kayar, at geri çekilir)
        updateCarVisual(myCar, dt, 0, 0, false, false);
      }
      if (myCar.spawnT < 1) {
        myCar.spawnT = Math.min(1, myCar.spawnT + dt * 2.6);
        const k = myCar.spawnT;
        const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
        myCar.v.root.scale.setScalar(Math.max(0.01, e));
      }
      const fx = Math.sin(myCar.yaw);
      const fz = Math.cos(myCar.yaw);
      headSpot.intensity = myCar.v.silent ? 0 : 55; // v157.4: bisiklet / atta far yok
      headSpot.position.set(myCar.x + fx * (myCar.v.len / 2), myCar.y + 0.75, myCar.z + fz * (myCar.v.len / 2));
      headSpot.target.position.set(myCar.x + fx * 16, 0, myCar.z + fz * 16);
      if (driving) {
        if (myCar.v.open) {
          myCar.v.root.updateMatrixWorld(true);
          // v150: sürücü koltuğu (modelli iç mekândaki gerçek koltuk noktası)
          const s0 = myCar.v.seatPts?.[0] || [myCar.v.seat[0], myCar.v.seat[1], -myCar.v.spec.Wd * 0.22];
          const sp = myCar.v.body.localToWorld(new V(s0[0], s0[1], s0[2]));
          me.x = sp.x;
          me.z = sp.z;
          me.y = myCar.y;
          me.seatY = sp.y;
          me.inCar = true;
          me.motoHat = motoHatOf(myCar.v);
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
    stepSparks(dt); // v193
    puffs.forEach((p) => {
      if (p.t >= 1) return;
      p.t = Math.min(1, p.t + dt * 1.2);
      const sc = 0.8 + p.t * 3.2;
      p.sp.scale.set(sc, sc, 1);
      p.sp.position.y += dt * 0.6;
      p.sp.material.opacity = 0.45 * (1 - p.t);
      if (p.t >= 1) p.sp.visible = false;
    });
    // v157: mekân durumu (yürürken), kesit, iç mekânların görünürlüğü, garaj kepenkleri, hayvanlar
    setVenue((!driving || myCar?.v.walker) && !self.ride && !heist?.active ? W.inVenueRoom(self.x, self.z, -0.1) : null); // v157.4: binekle mekâna girilir
    if (LAZY_INT) lazyInteriors(dt);
    {
      const want = curVenue?.isolated && view !== '2d' ? curVenue : null; // v196: evde dış dünya çizilir (kapıdan / pencereden dışarısı görünsün); diğer oyuncular gizli
      if (want !== isoV) setIso(want);
    }
    W.venues.forEach((v) => {
      // v158: içerisi sadece görülebildiğinde çizilir — içindeyken, camlı cephede uzaktan, kapalı
      // binada ancak kapıya yakınken (eskiden 45–70 m'deki her binanın içi çiziliyordu)
      // v158.1: karargahın içi sadece içerideyken çizilir
      const iv = v.noInt ? 0 : v === curVenue ? 1e9 : v.isolated ? 0 : v.vitrine ? (IS_MOBILE ? 45 : 70) : IS_MOBILE ? 24 : 32;
      const near = (camera.position.x - v.wx) ** 2 + (camera.position.z - v.wz) ** 2 < iv * iv;
      if (v.int.group.visible !== near) {
        v.int.group.visible = near;
        v.intHidT = near ? 0 : performance.now();
      }
      // v157.1: uzaklaşılan mekânın içi GPU'dan bırakılır (tekrar yaklaşınca yüklenir)
      if (!near && v.intHidT && performance.now() - v.intHidT > EVICT_MS) {
        v.intHidT = 0;
        evictGpu(v.int.group);
      }
    });
    if (W.garages.length) W.tickGarages(dt, driving && myCar ? myCar.x : self.x, driving && myCar ? myCar.z : self.z, !driving);
    animals?.update(dt, { x: self.x, z: self.z }, camera.position);
    W.water?.tick?.(t);
    npcs.forEach((n) => {
      // uzaktaki NPC çizilmez; mekân NPC'sinin etiketi sadece o mekânın içindeyken
      const near = !n.storyHidden && !n.off && (n.x - camera.position.x) ** 2 + (n.z - camera.position.z) ** 2 < 55 * 55 && (!isoV || n.venue === isoV); // v168: storyHidden
      n.group.visible = near;
      n.hideLabel = Boolean(n.venue) && n.venue !== curVenue;
      if (!near) return;
      n.moving = false;
      // v198: sipariş getiren garson — ürün elinde müşteriye yürür, yanına gelince ürün müşterinin eline geçer
      if (n.deliver) {
        const dv = n.deliver;
        dv.t += dt;
        const dx = self.x - n.x;
        const dz = self.z - n.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1 || dv.t > 25) {
          n.deliver = null;
          n.setHolding(null);
          n.say(dv.line || 'Afiyet olsun! 🙂');
          dv.done?.();
        } else {
          const st = Math.min(d - 1.0, dt * 1.9);
          n.x += (dx / d) * st;
          n.z += (dz / d) * st;
          n.facingLeft = dx < 0;
          n.moving = true;
        }
        n.update(dt, camera, now);
        return;
      }
      // v196: devriye yolu olan NPC (cafe / bar bot garsonu) noktadan noktaya yürür, her noktada biraz bekler
      if (n.route?.length > 1) {
        if (n.routeWait > 0) n.routeWait -= dt;
        else {
          const tg = n.route[n.routeI || 0];
          const dx = tg.x - n.x;
          const dz = tg.z - n.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.15) {
            n.routeI = ((n.routeI || 0) + 1) % n.route.length;
            n.routeWait = 1.5 + Math.random() * 2.5;
          } else {
            const st = Math.min(d, dt * 1.1);
            n.x += (dx / d) * st;
            n.z += (dz / d) * st;
            n.facingLeft = dx < 0;
            n.moving = true;
          }
        }
      }
      n.update(dt, camera, now);
    });
    // v198: evdeki hayvanlar platformlarının üstünde (yakındaysa çizilir)
    evFigs.forEach((o) => {
      if (!o.pet) return;
      const near = (o.x - camera.position.x) ** 2 + (o.z - camera.position.z) ** 2 < 40 * 40;
      o.pet.sprite.visible = near;
      if (!near) return;
      o.pet.x = o.x;
      o.pet.y = o.y;
      o.pet.z = o.z;
      o.pet.update(dt, now, { x: o.x, y: o.y, z: o.z, facingLeft: false, moving: false }, 0, null);
      o.pet.sprite.position.set(o.x, o.y, o.z);
      o.pet.leash.visible = false;
    });
    if (harac) stepHarac(dt, now);
    me.sink = waters.length ? sinkAt(me.x, me.z) : 0;
    me.standYaw = !me.sitting && !me.inCar ? standsYaw(self.x, self.z) : null;
    me.update(dt, camera, now);
    updateRemotes(dt, now);
    stadium?.update(dt, camera, now, self.x, self.z);
    // NPC'ler sırayla konuşur (yakındakiler)
    npcTalkT -= dt;
    if (npcTalkT <= 0) {
      npcTalkT = 5 + Math.random() * 4;
      const near = npcs.filter((n) => !n.quiet && n.group.visible && !n.hideLabel && Math.hypot(n.x - self.x, n.z - self.z) < 18);
      if (near.length) {
        const n = near[Math.floor(Math.random() * near.length)];
        if (n.lines?.length) n.say(n.lines[Math.floor(Math.random() * n.lines.length)]);
      }
    }
    // canlı eşyalar (kapılar açılır, fıskiye, ekip arabası…)
    // v157: soygun dizisinde kapılar liderin yaklaşmasıyla açılır (ekip gerçek kapıdan girer)
    const tpx = heist?.active ? me.x : self.x;
    const tpz = heist?.active ? me.z : self.z;
    // v157.2: konum bir kez hesaplanır (her karede yüzlerce eşya için matris zinciri güncelleniyordu)
    for (const tk of ticks) {
      if (!tk.ctl?.tick) continue;
      if (tk.wx === undefined) {
        const wp = tk.obj.getWorldPosition(projV);
        tk.wx = wp.x;
        tk.wz = wp.z;
      }
      if (Math.abs(tk.wx - tpx) > TICK_R || Math.abs(tk.wz - tpz) > TICK_R) continue;
      tk.ctl.tick(t, dt, Math.hypot(tk.wx - tpx, tk.wz - tpz));
    }
    if (EV && curVenue === EV) homeTicks(t, dt); // v202: evdeki TV / şömine / akvaryum… + duş suyu
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
    cutaway(); // v157: mekân içi kesit (kameraya bakan duvar)
    camFade(dt); // v158.2
    porchCut(); // v157.1: dışarıda kamera tente / saçak altına girince ön cephe kesilir
    // etkileşim bölgesi
    let best = null;
    let bd = Infinity;
    zones.forEach((z) => {
      if (z.kind === 'door') return; // v157: kapı butonu yok — mekânın içine yürüyerek girilir
      if (z.kind === 'hqIn' && curVenue) return; // v158: karargah kapısı — dışarıdayken
      if (z.kind === 'hqOut' && (!curVenue || curVenue.hqSlot !== z.slot)) return; // içerideyken
      if (z.y != null && Math.abs(me.y - z.y) > 1.6) return; // v196: evde başka kattaki cihaz
      if (z.kind === 'evler') return; // aşağıda: başka bir bölgedeyken de (durak, seyyar) düğmesi çıkar
      if (z.seatOnly) return; // v197: oturunca (aşağıda)
      const d = Math.hypot(z.x - self.x, z.z - self.z);
      if (d < z.r && d < bd) {
        best = z;
        bd = d;
      }
    });
    // v196 — Müstakil Evler: bloğun her yanında (önündeki otobüs durağı / seyyar satıcı bölgesini ezmesin)
    if (!curVenue && !driving) {
      const ez = zones.find((z) => z.kind === 'evler' && Math.abs(self.x - z.x) < z.hw && Math.abs(self.z - z.z) < z.hd);
      if (ez) best = best ? { ...best, id: `${best.id}+evler`, evlerNear: true } : ez;
    }
    // v197: garajdaki kendi aracım — yanına gelince "🚗 Bin"
    if (!driving && !self.seat && !self.ride && evCar?.key && !evCar.out && !evDesign) {
      const gw = garageWorld();
      const d = gw ? Math.hypot(gw.x - self.x, gw.z - self.z) : Infinity;
      if (d < 3.4 && Math.abs(me.y - 0.16) < 1.2 && (!best || d < bd)) {
        best = { id: `garage_${evCar.key}`, kind: 'garage', title: '🚗 Garajdaki aracın', x: gw.x, z: gw.z };
        bd = d;
      }
    }
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
      let sdBest = Infinity;
      seats.forEach((st) => {
        if (st.taken) return;
        // v149: başka basamaktaki koltuk sayılmaz (tribün)
        const dy = st.y - me.y;
        if (dy > 1.15 || dy < -0.3) return;
        const d = Math.hypot(st.x - self.x, st.z - self.z);
        // v159.3: bazı oturakların erişimi geniş (otobüs durağı banki önden de)
        if (d < Math.max(sd, st.reach || 0) && d < sdBest && !seatBusy(st)) {
          sdBest = d;
          sb = st;
        }
      });
      // v149: tribün koltuklarında bölge kimliği sabit ('Otur' düğmesi her adımda yeniden çizilmesin);
      // oturulacak koltuk dokunulduğu an en yakını seçilir
      const sid = sb ? (sb.tier ? 'seat_tier' : `seat_${sb.x.toFixed(1)}_${sb.z.toFixed(1)}`) : '';
      // v147.3: başka bir bölgedeyken (ör. seyyar satıcı) yakındaki sandalyeye de oturulabilsin
      if (sb && !best) best = { id: sid, kind: 'seat', title: sb.tier ? '🪑 Koltuk' : '🪑 Oturak', seat: sb.tier ? 'near' : sb };
      else if (sb) best = { ...best, id: `${best.id}+${sid}`, seatNear: sb.tier ? 'near' : sb };
    }
    if (self.seat) {
      const st = self.seat;
      best = { id: 'seated', kind: 'seated', title: st.stand ? '🚿 Duştasın' : '🪑 Oturuyorsun', ...(st.exitLabel ? { exitLabel: st.exitLabel } : {}) };
      // v202: evde oturduğun eşyanın kendi düğmeleri (jakuzi köpüğü, küvet…) oturunca da çıkar
      if (st.ev) {
        const hz = zones.find((z) => z.kind === 'homeItem' && z.itemId === st.item);
        if (hz) best = { ...hz, id: `${hz.id}+seated`, seatedAt: true, ...(st.exitLabel ? { exitLabel: st.exitLabel } : {}) };
      }
      // v197: oyun / yayın koltuğundayken o cihazın düğmeleri (+ Kalk)
      const cands = zones.filter((z) => z.seatOnly && z.chairPos && Math.hypot(z.chairPos.x - st.x, z.chairPos.z - st.z) < z.chairPos.r && (z.y == null || Math.abs(st.y - z.y) < 1.6));
      const sz = cands.find((z) => z.chair) || cands[0]; // yayın koltuğu (oyuncu koltuğu) önce
      if (sz) best = { ...sz, id: `${sz.id}+seated`, seatedAt: true };
      // v198: evde piyano / davul taburesinde → "Çal" (eskiden evdeki çalgılar şehirde çalınamıyordu)
      else if (st.ev && HOME_INSTR[st.itemKey]) best = { id: `instr_${st.item}+seated`, kind: 'homeInstr', instr: st.itemKey, itemId: st.item, title: HOME_INSTR[st.itemKey], seatedAt: true };
    }
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
      const md = W.modeAt(self.x, self.z);
      onTick?.({ venue: curVenue ? curVenue.type : areaAt(self.x, self.z) === 'modifiye' ? 'modifiye' : null, mode: md, place: md === 'city' ? null : W.zoneName(self.x, self.z, md, driving && myCar ? myCar.s : null), swim: Boolean(me.swim), spot: W.spotActs(self.x, self.z, !driving, driving && myCar ? Math.hypot(myCar.vx, myCar.vz) < 1 : false), area: areaAt(self.x, self.z), x: self.x, z: self.z, yaw: view === '2d' ? topCur.az : driving && myCar ? myCar.yaw + Math.PI + driveCamOff : self.camYaw, driving, riding: Boolean(self.ride), drive: driving ? driveStat : null, car: myCar ? { x: myCar.x, z: myCar.z } : null });
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
      if (!f.group.visible || f.hideLabel) {
        f.label.style.display = 'none';
        return;
      }
      const top = f.sitting ? (f.seatY ?? 0.5) + 0.04 + AV_WAIST_FROM_TOP + 0.12 : f.y + AV_PLANE_H - AV_FEET + 0.12;
      placeLabel(f.label, f.x, top, f.z, w, h, view === '2d' ? 140 : f.remote ? 32 : 40);
    });
    mapLabels.forEach((m) => {
      if (curVenue) {
        if (m.el.style.display !== 'none') m.el.style.display = 'none';
        return;
      }
      const d = Math.hypot(m.p.x - self.x, m.p.z - self.z);
      const show = view === '2d' ? (m.kind === 'map' || topCur.dist < 50) : m.kind === 'map' ? d > 26 && d < 95 : d < 30 && d > 6;
      if (!show) {
        if (m.el.style.display !== 'none') m.el.style.display = 'none';
        return;
      }
      placeLabel(m.el, m.p.x, m.p.y, m.p.z, w, h, view === '2d' ? 400 : 260);
    });
    // v151: meslek hedefi / bot yolcular / şüpheli araç
    jobWorld?.update(Math.min(0.1, dbgDt), camera, performance.now(), self.x, self.z, w, h);
    ring.material.opacity = 0.6 + Math.sin(clock.elapsedTime * 6) * 0.25;
    heist?.render(w, h); // v154
  }

  // --- görüş mesafesi + otomatik grafik ------------------------------------------------
  let cullT = 0;
  const EVICT_MS = IS_MOBILE ? 5000 : 30000;
  const LOD_NEAR0 = IS_MOBILE ? 55 : 85;
  const LOD_MID0 = IS_MOBILE ? 110 : 170;
  // v158: düşük kalite seviyelerinde ayrıntı mesafeleri de kısalır (yakın model / kutu / yok)
  const TIER_LOD = [1, 0.85, 0.7, 0.55];
  let LOD_NEAR = LOD_NEAR0;
  let LOD_MID = LOD_MID0;
  // v158 — AKIŞ BÜTÇESİ: GPU'dan bırakılmış (yeniden yüklenmesi gereken) parçalar aynı anda değil,
  // her kesme turunda en fazla bu kadar — önce bakılan yöndeki ve en yakın olanlar. Hızlı dönünce /
  // ışınlanınca onlarca parçanın aynı karede yüklenmesinden doğan takılmalar (kasma) yok olur.
  const STREAM_BUDGET = IS_MOBILE ? 5 : 12;
  const pendingShow = [];
  const camFwd = new V();
  // v158 — İÇ MEKÂN ÖRTMESİ: bir mekânın içindeyken dışarısı duvarlarla kapalı; görüş kısalır
  const INDOOR_VIEW = IS_MOBILE ? 45 : 60;
  const TEX_KEYS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'bumpMap', 'lightMap'];
  // v173 DONMA: bırakılan HER parça için bütün sahne baştan taranıyordu ("bu doku başka yerde
  // görünüyor mu?"). Telefonda açılıştan 5 sn sonra, o ana kadar hiç görünmeyen yüzlerce parça aynı
  // turda bırakılınca bu yüzlerce kez tam sahne taraması = belirgin takılma. Artık tarama bir turda
  // BİR kez yapılır (liveTex) ve bütün bırakılanlar onu paylaşır. Sonuç aynı.
  function liveTextures() {
    const live = new Set();
    scene.traverseVisible((o) => {
      const m = o.material;
      if (m && !Array.isArray(m)) TEX_KEYS.forEach((k) => m[k] && live.add(m[k].source));
    });
    return live;
  }
  function evictGpu(root, liveTex = null) {
    const texs = new Set();
    root.traverse((o) => {
      if (o.userData?.noEvict) return;
      if ((o.isMesh || o.isInstancedMesh) && o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      const m = o.material;
      if (m && !Array.isArray(m)) TEX_KEYS.forEach((k) => m[k] && texs.add(m[k]));
    });
    if (!texs.size) return;
    // o an görünen bir şeyin kullandığı doku bırakılmaz (ortak duvar / zemin dokuları)
    const live = liveTex ? liveTex() : liveTextures();
    texs.forEach((t) => {
      if (!live.has(t.source) && !t.isRenderTargetTexture && t.image) {
        t.dispose();
        t.needsUpdate = true; // tekrar kullanılınca yeniden yüklensin
      }
    });
  }
  function cull(force) {
    const now = performance.now();
    if (!force && now - cullT < 220) return;
    cullT = now;
    const t = CITY_TIERS[tier];
    // v157: şehrin dışında (otoyol, dağlar, kasaba) görüş daha uzak — arazi tek parça, ağaçlar örnekli
    const outside = W.modeAt(self.x, self.z) !== 'city';
    let view = (outside ? Math.max(t.view, OUTER_VIEW[tier] || 300) : t.view) + (view2d() ? topCur.dist * 1.2 : 0);
    if (curVenue && !view2d()) view = Math.min(view, INDOOR_VIEW);
    if (!view2d()) view *= viewK; // v159: dinamik görüş mesafesi (yavaşlayınca önce bu kısalır)
    LOD_NEAR = LOD_NEAR0 * TIER_LOD[tier] * (0.85 + 0.15 * viewK);
    LOD_MID = LOD_MID0 * TIER_LOD[tier] * viewK;
    const cx0 = view2d() ? camTarget.x : self.x;
    const cz0 = view2d() ? camTarget.z : self.z;
    camera.getWorldDirection(camFwd);
    const fl = Math.hypot(camFwd.x, camFwd.z) || 1;
    const fx = camFwd.x / fl;
    const fz = camFwd.z / fl;
    pendingShow.length = 0;
    const evict = []; // v173: bırakılacaklar tur sonunda, tek sahne taramasıyla
    for (const c of cullItems) {
      const dc = Math.hypot(c.x - cx0, c.z - cz0);
      const lim = c.outer ? view : Math.min(view, (t.view + 60) * (view2d() ? 1 : viewK));
      // v157.2 LOD: küçük eşyalar yakında tam model, ortada renkli kutu, uzakta yok
      let vis = c.lod === 'near' ? dc < LOD_NEAR : c.lod === 'mid' ? dc >= LOD_NEAR && dc < Math.min(lim, LOD_MID) : dc - c.r < lim;
      if (c.iso) vis = false; // v158: yalıtılmış iç mekândayken (karargah) dış dünya çizilmez
      if (vis && c.gone && !force && dc - c.r > 12) {
        // yeniden yüklenecek parça: bütçeye girerse görünür (bakılan yön önce)
        const ahead = dc > 1 ? ((c.x - cx0) * fx + (c.z - cz0) * fz) / dc : 1;
        c.score = dc - ahead * 40;
        pendingShow.push(c);
        continue;
      }
      c.o.visible = vis;
      // v157.1 — ekran kartı belleği: uzun süre görünmeyen parçanın GPU kopyası bırakılır
      // (CPU'daki veri kalır; tekrar görününce three.js kendisi yeniden yükler). Eskiden gezdikçe
      // her şey GPU'da birikiyordu → telefonda 1-2 dakikada bellek doluyor, oyun kapanıyordu.
      if (vis) {
        c.hidT = 0;
        c.gone = false;
      } else if (!c.gone && !c.keep) {
        if (!c.hidT) c.hidT = now;
        else if (now - c.hidT > EVICT_MS) {
          c.gone = true;
          evict.push(c);
        }
      }
    }
    if (pendingShow.length) {
      pendingShow.sort((a, b) => a.score - b.score);
      pendingShow.forEach((c, i) => {
        if (i >= STREAM_BUDGET) return; // sıradakiler bir sonraki turda (≈0,2 sn)
        c.o.visible = true;
        c.hidT = 0;
        c.gone = false;
      });
    }
    if (evict.length) {
      let live = null;
      const liveTex = () => (live ||= liveTextures());
      evict.forEach((c) => evictGpu(c.o, liveTex));
    }
    scene.fog.near = Math.min(view * 0.6 * fogK, view);
    scene.fog.far = view + 20;
    if (Math.abs(camera.far - (view + 60)) > 1) {
      camera.far = view + 60;
      camera.updateProjectionMatrix();
    }
  }
  const view2d = () => view === '2d';
  // v158 — DİNAMİK ÇÖZÜNÜRLÜK: kare süresi uzayınca çizim çözünürlüğü kademeli düşer, rahatlayınca
  // geri çıkar. Kalite seviyesi değişiminin aksine gölgelendirici yeniden derlenmez (donma olmaz);
  // seviye ancak çözünürlük en alta inmiş ve hâlâ yavaşsa düşer.
  // v159 — PİKSELLEŞME DÜZELTMESİ: eskiden telefonda çözünürlük %60'a kadar iniyor (ekran pikseli başına
  // ~0,6 çizim pikseli → "piksel piksel" şehir) ve geri çıkması ~40 sn sürüyordu. Artık:
  //  • çizim çözünürlüğü telefonda asla 1 CSS pikselinin altına inmez (PR_FLOOR)
  //  • zorlanınca ÖNCE görüş mesafesi kısalır (viewK: uzaktaki parçalar daha erken gizlenir — kare
  //    süresini çözünürlük kadar düşürür ama görüntüyü bulanıklaştırmaz), sonra çözünürlük
  //  • rahatlayınca önce çözünürlük, sonra görüş mesafesi hızlıca geri gelir
  const DRS_MIN = IS_MOBILE ? 0.8 : 0.72;
  const PR_FLOOR = IS_MOBILE ? Math.min(1, window.devicePixelRatio || 1) : 0.5;
  const VIEWK_MIN = 0.7;
  let viewK = 1;
  let drs = 1;
  let drsAcc = 0;
  let drsN = 0;
  let drsSlow = 0;
  let drsFast = 0;
  let drsAt = 0;
  const baseDpr = () => Math.min(window.devicePixelRatio || 1, CITY_TIERS[tier].dpr);
  function setDrs(v) {
    const nv = clamp(v, DRS_MIN, 1);
    if (Math.abs(nv - drs) < 0.01 && Math.abs(renderer.getPixelRatio() - Math.max(PR_FLOOR, baseDpr() * drs)) < 0.01) return;
    drs = nv;
    drsAt = performance.now();
    renderer.setPixelRatio(Math.max(PR_FLOOR, baseDpr() * drs));
  }
  function setViewK(v) {
    const nv = clamp(v, VIEWK_MIN, 1);
    if (Math.abs(nv - viewK) < 0.01) return;
    viewK = nv;
    drsAt = performance.now();
    cull(true);
  }
  function drsSample(iv, now) {
    if (iv > 400) return;
    drsAcc += iv;
    drsN += 1;
    if (drsAcc < 900) return;
    const avg = drsAcc / drsN;
    drsAcc = 0;
    drsN = 0;
    const want = 1000 / CITY_TIERS[tier].fps;
    if (avg > want * 1.22) {
      drsSlow += 1;
      drsFast = 0;
    } else if (avg < want * 1.06) {
      drsFast += 1;
      drsSlow = 0;
    } else {
      drsSlow = 0;
      drsFast = 0;
    }
    if (drsSlow >= 1 && now - drsAt > 1200 && (viewK > VIEWK_MIN || drs > DRS_MIN)) {
      const big = avg > want * 1.6;
      if (viewK > VIEWK_MIN) setViewK(viewK - (big ? 0.15 : 0.1));
      else setDrs(drs - (big ? 0.1 : 0.05));
      drsSlow = 0;
    } else if (drsFast >= 2 && now - drsAt > 2500 && (drs < 1 || viewK < 1)) {
      if (drs < 1) setDrs(drs + 0.07);
      else setViewK(viewK + 0.1);
      drsFast = 0;
    }
  }
  function applyTier() {
    const t = CITY_TIERS[tier];
    renderer.setPixelRatio(Math.max(PR_FLOOR, Math.min(window.devicePixelRatio || 1, t.dpr) * drs));
    moonL.castShadow = t.shadows;
    moonL.shadow.autoUpdate = t.shadows && t.shadowEvery <= 1;
    scene.userData.fig3d = AVATAR_3D_ENABLED ? (snapshot ? 90 : FIG3D_TIER_DIST[tier] ?? 0) : 0; // v211
    pool.forEach((l, i) => (l.visible = i < t.pool));
    cull(true);
  }
  let perfAcc = 0;
  let perfN = 0;
  let perfStart = performance.now();
  let slowWins = 0;
  let fastWins = 0;
  let lastTierAt = 0;
  let raiseSaved = false; // v154: bu oturumda "sonraki açılışta kaliteyi artır" kaydedildi
  let lastRenderAt = 0;
  let lastBusyAt = 0;
  let lastSweepAt = performance.now();
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
    if (slowWins >= 2 && tier < CITY_TIERS.length - 1 && drs <= DRS_MIN + 0.01 && viewK <= VIEWK_MIN + 0.01) setTier(tier + 1, now); // v158: önce çözünürlük
    else if (fastWins >= 8 && tier > 0 && now - lastTierAt > 20000 && !(IS_MOBILE && tier <= 1) && !raiseSaved) {
      // v154 — DONMA DÜZELTMESİ: oyun sırasında kalite ARTIRILMAZ. Her seviye değişimi ışık
      // sayısını / gölgeleri değiştirip tüm shader'ları yeniden derletiyordu (telefonda 0,5–1 sn
      // donma) ve "hızlı → kaliteyi artır → yavaş → düşür" döngüsü 30–40 sn'de bir tekrar ediyordu.
      // Artık: zorlanınca bir kez düşer; rahatsa bir üst seviye SONRAKİ açılışta denenir.
      raiseSaved = true;
      saveCityTier(tier - 1);
    }
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
  // v191 — TAKILMA KAYDI (tanı, sadece açan cihazda): localStorage 'neon.hitch' = '1' iken 120 ms'den
  // uzun süren her karede o karede ne olduğu ekranın sol üstüne yazılır: yeni derlenen gölgelendirici
  // (shader), ekran kartına yüklenen doku / geometri, çöp toplama (bellek düşüşü), oyuncu / araç sayısı,
  // kalite seviyesi. Sunucuya hiçbir şey gönderilmez, Firestore / RTDB kullanımı yok.
  let hitchOn = false;
  try {
    hitchOn = !snapshot && localStorage.getItem('neon.hitch') === '1';
  } catch {
    hitchOn = false;
  }
  let hitchEl = null;
  let hitchPrev = null;
  const hitchList = [];
  function hitchNote(iv) {
    const inf = renderer.info;
    const heap = performance.memory?.usedJSHeapSize || 0;
    const cur = { p: inf.programs?.length || 0, t: inf.memory?.textures || 0, g: inf.memory?.geometries || 0, h: heap };
    const pr = hitchPrev;
    hitchPrev = cur;
    if (!pr || iv < 120) return;
    const why = [];
    if (cur.p > pr.p) why.push(`+${cur.p - pr.p} shader`);
    if (cur.t > pr.t) why.push(`+${cur.t - pr.t} doku`);
    if (cur.g > pr.g) why.push(`+${cur.g - pr.g} geo`);
    if (pr.h && heap && pr.h - heap > 4e6) why.push(`GC −${Math.round((pr.h - heap) / 1e6)} MB`);
    const line = `${Math.round(iv)} ms · ${why.join(' ') || '?'} · ${remotes.size} oyuncu ${rcars.size} araç · ${CITY_TIERS[tier].name} ${drs.toFixed(2)}${driving ? ' · sürüş' : ''}`;
    hitchList.unshift(line);
    hitchList.length = Math.min(hitchList.length, 10);
    console.log('[neon-hitch]', line);
    if (!hitchEl) {
      hitchEl = document.createElement('div');
      hitchEl.style.cssText = 'position:absolute;left:4px;top:60px;z-index:60;max-width:92%;font:600 10px/1.35 monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 6px;border-radius:6px;pointer-events:none;white-space:pre';
      container.appendChild(hitchEl);
    }
    hitchEl.textContent = `TAKILMA KAYDI (${hitchList.length})\n` + hitchList.join('\n');
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused || renderer.__lost) {
      clock.getDelta();
      lastRenderAt = 0;
      return;
    }
    const now = performance.now();
    // v157.4: telefonda oyuncu dururken (yürümüyor, sürmüyor, ekrana dokunmuyor) 30 kare/sn —
    // pil ve ısınma yarıya iner; hareket başlayınca hemen tam hıza döner
    const still = IS_MOBILE && !driving && !self.ride && !self.target && !self.path && !me.moving && !drag && pointers.size === 0 && !Object.values(keys).some(Boolean);
    if (!still) lastBusyAt = now;
    let cap = still && now - lastBusyAt > 1500 ? Math.min(30, CITY_TIERS[tier].fps) : CITY_TIERS[tier].fps;
    // v191 — BÜYÜK HARİTA AÇIKKEN: şehir haritanın arkasında tam hızda çizilmeye devam ediyordu (iki
    // ağır çizim aynı anda → zayıf telefonda ısınma, kasma, bellek taşıp oyundan atma). Harita açıkken
    // şehir yavaş çizilir (sürerken 30, yürürken/dururken 12 kare/sn); oyun mantığı aynen sürer.
    if (lite) cap = Math.min(cap, driving || self.ride ? 30 : 12);
    if (cap < 58 && lastRenderAt && now - lastRenderAt < 1000 / cap - 3) return;
    if (hitchOn) hitchNote(lastRenderAt ? now - lastRenderAt : 0);
    if (lastRenderAt && cap >= CITY_TIERS[tier].fps) {
      perfSample(now - lastRenderAt); // boşta yavaşlatma kalite düşürmesin
      if (!snapshot) drsSample(now - lastRenderAt, now);
    }
    lastRenderAt = now;
    if (now - lastSweepAt > 15_000) {
      lastSweepAt = now;
      sweepAvatarTextures(now);
    }
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
  // v157.9: telefonda birleşik statik dünya geometrisi inceltilir (avatar / araç gibi sonradan doku
  // alan nesnelere dokunulmaz — sadece birleştirilmiş şehir ve dış dünya parçaları; arazi karoları ortak tampon kullanır, dokunulmaz)
  if (IS_MOBILE) {
    const sm = scene.getObjectByName('merged');
    if (sm) slimGeometries(sm);
    if (W.mergedOuter) slimGeometries(W.mergedOuter);
  }
  if (!snapshot || IS_MOBILE) applyTier();
  updateLights(true);
  // ilk kare (doku/gölgelendirici derlemesi) sonra hazır
  frame(0.016);
  cull(true); // v157.1: ilk karede sadece yakındakiler çizilsin (eskiden tüm dünya GPU'ya yükleniyordu)
  let engineGone = false; // v172: hazırlık sürerken şehir kapatıldıysa döngü başlamasın
  if (snapshot) {
    render();
    first = false;
    me.group.visible = false;
    me.label.style.display = 'none';
  } else {
    // v172 AÇILIŞ DONMASI: ilk karede görünen bütün malzemelerin gölgelendiricileri ekran kartında
    // TEK TEK ve oyunu durdurarak derleniyordu (telefonda açılışın en uzun donmalarından biri).
    // Artık hepsi önce birlikte, arka planda derlenir (destekleyen telefonlarda paralel); bu sırada
    // yükleme ekranı açık kalır, sayfa donmaz. Bitince ilk kare çizilir ve oyun başlar. Desteklemeyen
    // cihazda eskisi gibi olur. Takılırsa en geç 4 sn sonra yine başlar. Görüntü aynı. Bonus: o an
    // etrafta görünen ama kameranın henüz bakmadığı malzemeler de derlenmiş olur → dönünce donmaz.
    let started = false;
    const begin = () => {
      if (started || engineGone) return;
      started = true;
      render();
      first = false;
      requestAnimationFrame(() => onReady?.());
      loop();
    };
    let pre = null;
    try {
      // sadece paralel derleme destekleniyorsa (KHR_parallel_shader_compile) — desteklemeyen cihazda
      // önceden derlemek açılışı ~1 sn uzatıyordu (ölçüldü), orada eskisi gibi ilk karede derlenir
      const parallel = Boolean(renderer.extensions?.has?.('KHR_parallel_shader_compile'));
      pre = parallel && typeof renderer.compileAsync === 'function' && !renderer.__lost ? renderer.compileAsync(scene, camera) : null;
    } catch {
      pre = null;
    }
    if (pre && typeof pre.then === 'function') {
      pre.then(begin, begin);
      setTimeout(begin, 4000);
    } else begin();
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
    // v215: 3D avatarın baktığı yön (fotoğrafta herkes kameraya dönmesin)
    if (Number.isFinite(f.yaw)) o.yw = Math.round(wrapAng(f.yaw) * 1000) / 1000;
    // v151: tribündeki yön (sahaya dönük) — fotoğrafta da ense görünsün (oyundaki gibi)
    const fy = f.seatYaw ?? f.standYaw;
    if (fy != null && !f.inCar) o.sw = Math.round(fy * 1000) / 1000;
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
    const wy = (v) => r3(Math.atan2(Math.sin(v || 0), Math.cos(v || 0)));
    const cam = { px: r2(camera.position.x), py: r2(camera.position.y), pz: r2(camera.position.z), dx: r3(dir.x), dy: r3(dir.y), dz: r3(dir.z), fov: camera.fov, a: r3(camera.aspect), cw: Math.round(container.clientWidth || 400), td: view === '2d' ? 1 : 0 };
    // v160.2: motor / bisiklet / at (açık araç) üstünde iç kameradayken fotoğrafta sürücü hiç
    // görünmüyordu (iç kamerada çeken gizlenir). Açık araçta fotoğraf arkadan-yukarıdan çekilir.
    const openRide = view !== '2d' && interiorCar && interiorCar.v?.open && (interiorCar.v.moto || interiorCar.v.halfW < 0.8);
    if (openRide) {
      const c = interiorCar;
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      const py = (c.y || 0) + 2.3;
      const px = c.x - fx * 5.2;
      const pz = c.z - fz * 5.2;
      const tx = c.x + fx * 1.5;
      const ty = (c.y || 0) + 1.1;
      const tz = c.z + fz * 1.5;
      const L = Math.hypot(tx - px, ty - py, tz - pz) || 1;
      Object.assign(cam, { px: r2(px), py: r2(py), pz: r2(pz), dx: r3((tx - px) / L), dy: r3((ty - py) / L), dz: r3((tz - pz) / L), fov: 60 });
    }
    // v159: araç içi (iç kamera) fotoğrafı — fotoğraf da içeriden, kokpitle çizilsin
    if (!openRide && view !== '2d' && interiorCar && ((driving && myCar) || self.ride)) {
      cam.ic = 1;
      cam.io = driving && myCar ? myUid : self.ride.owner;
      cam.ik = driving && myCar ? 0 : self.ride.k || 1;
      cam.is = r2(interiorCar.steer || 0);
    }
    // v168: senaryo karakterleri (bu cihazda) fotoğrafa girmez — v168.1: Rıza Amca hariç (sunucu adını
    // ve görünüşünü kendi listesinden yazar, functions/storyNpcs.js)
    const shotOk = (id) => !isStoryId(id) || isPhotoNpc(id);
    const people = [figShot(myUid, me, driving && myCar ? { c: myUid, k: 0 } : self.ride && shotOk(self.ride.owner) ? { c: self.ride.owner, k: self.ride.k || 1 } : {})];
    [...remotes.values()]
      .filter((r) => shotOk(r.uid) && (r.d ?? 999) < VIS_DIST)
      .sort((a, b) => a.d - b.d)
      .slice(0, 11)
      .forEach((r) => {
        const st = r.st || {};
        if (!r.fig.group.visible && st.p !== 'd' && st.p !== 'r') return;
        people.push(figShot(r.uid, r.fig, st.p === 'd' ? { c: r.uid, k: 0 } : st.p === 'r' ? { c: st.ro, k: st.rk || 1 } : {}));
      });
    const cars = [];
    // v193: tır dorsesinin açısı (th) — fotoğrafta dorse düz çiziliyordu (tır tek parça kamyon gibi görünüyordu)
    const thOf = (c) => (c.v?.trailer && c.v.trailerOn && Math.abs(c.th || 0) > 0.005 ? { th: r3(c.th) } : {});
    if (myCar) cars.push({ o: myUid, v: myCar.id, x: r2(myCar.x), z: r2(myCar.z), y: r2(myCar.y), r: wy(myCar.yaw), st: r2(myCar.steer || 0), ...thOf(myCar) });
    // v157.4: bindiğim araç (otobüste yolcuyken iç kamerada gövde gizli) fotoğrafa her zaman girer
    const rideOwner = self.ride && shotOk(self.ride.owner) ? self.ride.owner : null;
    rcars.forEach((c, uid) => {
      if (!shotOk(uid)) return; // v168
      if (uid !== rideOwner && (!c.v.root.visible || Math.hypot(c.x - self.x, c.z - self.z) > VIS_DIST)) return;
      cars.push({ o: uid, v: c.id, x: r2(c.x), z: r2(c.z), y: r2(c.y), r: wy(c.yaw), st: r2(c.steer || 0), ...thOf(c) });
    });
    // v154: stadyumda maç oynanırken futbolcular + top da kareye girer
    const fb = stadium?.snap?.() || null;
    // bindiğim araç listenin başına (8 sınırında düşmesin)
    if (rideOwner) cars.sort((a, b) => (b.o === rideOwner) - (a.o === rideOwner));
    return { cam, people, cars: cars.slice(0, 8), tod, ...(fb ? { fb } : {}) };
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
    const fbFigs = [];
    let fbBall = null;
    try {
      (att.cars || []).slice(0, 8).forEach((c) => {
        if (!hasVehicle(c.v)) return;
        let mods = null;
        try {
          mods = typeof c.m === 'string' && c.m ? JSON.parse(c.m) : null;
        } catch {
          mods = null;
        }
        const v = buildVehicle(c.v, mods);
        setPax({ v }, Math.max(0, (Number(c.j) || 0) - 1), Number(c.j) > 0);
        if (v.trailer && v.trailerOn) v.trailer.pivot.rotation.y = clamp(Number(c.th) || 0, -1.35, 1.35); // v193: dorse açısı
        if (!v.silent) {
          const head = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.5), headMat('#ffe9b8', 0.45));
          head.rotation.x = -Math.PI / 2;
          head.position.set(0, 0.04, v.len / 2 + 3.9);
          v.root.add(head);
        }
        v.root.visible = false;
        scene.add(v.root);
        tmpCars.set(c.o, { v, x: c.x, z: c.z, y: c.y || 0, yaw: c.r || 0, steer: c.st || 0, mk: typeof c.m === 'string' ? c.m : null });
      });
      (att.people || []).slice(0, 12).forEach((p, i) => {
        const f = new Fig(scene, layer, { id: `shot_${i}`, name: p.n || 'Oyuncu', avatar: p.a || null });
        f.label.style.display = 'none';
        f.group.visible = false;
        f.shot = p;
        tmpFigs.push(f);
      });
      // v154: maç anı (futbolcular, hakem, top) — fotoğraftaki konumlarıyla
      const fb = att.fb && typeof att.fb === 'object' ? att.fb : null;
      if (fb) {
        const mk = (id, av, d) => {
          const f = new Fig(scene, layer, { id, name: '', avatar: av, npc: true });
          f.label.style.display = 'none';
          f.group.visible = false;
          f.fb = d;
          fbFigs.push(f);
        };
        (Array.isArray(fb.p) ? fb.p.slice(0, 12) : []).forEach((d, i) => mk(`shot_fb_${i}`, matchAvatar(d[0] ? 'away' : 'home', d[1] | 0, fb.hc, fb.ac), d.slice(2)));
        if (Array.isArray(fb.r)) mk('shot_fb_ref', matchAvatar('ref', 0), fb.r);
        if (Array.isArray(fb.b)) {
          fbBall = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5 }));
          fbBall.position.set(Number(fb.b[0]) || 0, Number(fb.b[1]) || 0, Number(fb.b[2]) || 0);
          fbBall.visible = false;
          scene.add(fbBall);
        }
      }
      const t0 = Date.now();
      while ([...tmpFigs, ...fbFigs].some((f) => !f.tex.ready) && Date.now() - t0 < 5000) await sleep(80);
      if (tmpFigs.some((f) => f.pet)) await sleep(60); // evcil hayvan dokuları
      // v175 — araçtaki / tribündeki kişinin ARKA dokusu (ense) canlıda ilk gerektiğinde sırayla çizilir;
      // fotoğraf tek karede çizildiği için henüz hazır olmuyordu → arabada yüz kameraya dönük, motorda /
      // suda araçta sürücü hiç görünmüyordu. Artık fotoğraftan önce hazırlanır (en çok 3 sn beklenir).
      const backs = [];
      tmpFigs.forEach((f) => {
        const p = f.shot || {};
        if (p.c) backs.push([f, 'back']);
        else if (p.sw != null) backs.push([f, p.sy != null ? 'back' : 'backIdle']);
      });
      backs.forEach(([f, pose]) => ensureBackTex(f.tex, pose));
      const t1 = Date.now();
      while (backs.some(([f, pose]) => f.tex && !f.tex.lazy && !f.tex.tex?.[pose] && f.tex.pending?.[pose]) && Date.now() - t1 < 3000) await sleep(60);
      // v211 — 3D avatarlar fotoğraftan önce hazırlanır (saç / şapka çizimi kuyrukta; en çok 4 sn beklenir)
      if ((scene.userData.fig3d || 0) > 0) {
        const figs3 = [...tmpFigs, ...fbFigs];
        const t2 = Date.now();
        while (figs3.some((f) => f.tex?.ready && !f.tex.lazy && !f.tex.look3) && Date.now() - t2 < 4000) {
          figs3.forEach((f) => requestLook3(f.tex));
          await sleep(60);
        }
      }
      // v153: stadyum reklamları fotoğrafın çekildiği andaki sponsorlar (eski fotoğraf: varsayılan)
      const stM = stadLot?.info?.match;
      const liveAds = stM?.getSponsors?.() ?? null;
      if (stM?.setSponsors) stM.setSponsors(Array.isArray(att.sp) ? att.sp.slice(0, 8).map((x) => String(x).slice(0, 40)) : null);
      try {
        return shoot(att, w, h, tmpFigs, tmpCars, fbFigs, fbBall);
      } finally {
        if (stM?.setSponsors && !snapshot) stM.setSponsors(liveAds);
      }
    } finally {
      tmpFigs.forEach((f) => f.dispose(scene));
      fbFigs.forEach((f) => f.dispose(scene));
      if (fbBall) {
        scene.remove(fbBall);
        fbBall.geometry.dispose();
        fbBall.material.dispose();
      }
      tmpCars.forEach((c) => {
        try {
          c.v.rig?.dispose?.(); // v159: iç kamera fotoğrafının kokpiti (gösterge dokuları)
        } catch {
          /* yoksay */
        }
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
  function shoot(att, w, h, tmpFigs, tmpCars, fbFigs = [], fbBall = null) {
    const cam = att.cam || {};
    const hidden = [];
    const hide = (o) => {
      if (o && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    };
    const hidden2 = []; // fotoğraf için geçici görünür yapılanlar
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
    stadium?.liveObjects?.().forEach(hide);
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
      // v160.5: canlı motorda tuval yeniden boyutlandırılmaz (telefonda her fotoğrafta çizim
      // tamponu iki kez baştan ayrılıyordu → bellek sıçraması). Kare tuvalin sol alt köşesine
      // çizilip oradan kopyalanır; tuval küçükse eski yol.
      save.inPlace = !snapshot && canvas.width >= w && canvas.height >= h;
      if (save.inPlace) {
        renderer.setViewport(0, 0, w / save.pr, h / save.pr);
      } else {
        renderer.setPixelRatio(1);
        renderer.setSize(w, h, false);
      }
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
      // v159 — İÇ KAMERA FOTOĞRAFI: eskiden araç dışarıdan görüldüğü gibi (gövde + koltuklar, kokpit
      // yok) çiziliyor ve yakın kesme düzlemi (near) içeriyi kesiyordu → fotoğraf ekrandakinden farklı
      // çıkıyordu. Artık canlı iç kameradaki gibi: gövde gizli, kokpit görünür, near küçük.
      const icCar = cam.ic ? tmpCars.get(cam.io) : null;
      save.near = camera.near;
      if (icCar) {
        camera.near = 0.06;
        camera.updateProjectionMatrix();
        try {
          const k = Number(cam.ik) || 0;
          const pv = k > 0 ? passengerView(icCar, k) : null;
          const rig = !pv || pv.rig ? cockpitRig(icCar, cockpitOf(icCar, 0)) : null;
          if (rig) {
            showRig(icCar, true);
            rig.update(1, { steer: Number(cam.is) || icCar.steer || 0, kmh: 0, gear: 'N', rpm: 0.9, vmaxKmh: 200, heading: icCar.yaw || 0, now: performance.now() });
          }
          save.icCar = icCar;
        } catch {
          /* kokpit kurulamazsa normal fotoğraf */
        }
      }
      const fp = att.people?.[0] || { x: cam.px, z: cam.pz };
      // v160.5 — FOTOĞRAF ÇEKİNCE OYUNDAN ATMA (telefon): fotoğraf karesi sabit 90/170 m mesafeyle
      // ve 300 m siste çiziliyordu; telefonda canlı görüş 80-100 m olduğundan deklanşöre basınca
      // ekran kartından bırakılmış onlarca bina/eşya bir anda yeniden yükleniyor, iPhone belleği
      // taşıp sayfayı kapatıyordu. Telefonda fotoğraf, ekranda görünen mesafe ve LOD ile çizilir
      // (paylaşılan = ekranda görülen). Bilgisayarda eskisi gibi.
      const tShot = CITY_TIERS[tier];
      const shotOutside = W.modeAt(fp.x, fp.z) !== 'city';
      const shotView = IS_MOBILE ? (shotOutside ? Math.max(tShot.view, OUTER_VIEW[tier] || 300) : tShot.view) : 170;
      const shotNear = IS_MOBILE ? Math.min(90, LOD_NEAR0 * TIER_LOD[tier]) : 90;
      const shotMid = IS_MOBILE ? Math.min(170, LOD_MID0 * TIER_LOD[tier]) : 170;
      // fotoğrafın çekildiği yer (canlı motorda oyuncu başka yerde olabilir): oranın parçaları görünür
      for (const c of cullItems) {
        // v157.8: hem çekenin hem kameranın yakını tam eşya (bank vb. kutu olarak çıkmasın)
        const d = Math.min(Math.hypot(c.x - fp.x, c.z - fp.z), Number.isFinite(cam.px) && Number.isFinite(cam.pz) ? Math.hypot(c.x - cam.px, c.z - cam.pz) : Infinity);
        const lim = !IS_MOBILE || c.outer ? shotView : Math.min(shotView, tShot.view + 60);
        // v157.4: fotoğrafta da LOD — yakında tam eşya, ötede kutu (ikisi birden değil)
        c.o.visible = c.lod === 'near' ? d < shotNear : c.lod === 'mid' ? d >= shotNear && d < Math.min(lim, shotMid) : d - c.r < lim;
      }
      const fogSave = [scene.fog.near, scene.fog.far, camera.far];
      scene.fog.near = IS_MOBILE ? shotView * 0.6 : 70;
      scene.fog.far = IS_MOBILE ? shotView + 20 : 300;
      camera.far = IS_MOBILE ? shotView + 60 : 400;
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
          f.motoHat = motoHatOf(car.v);
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
          f.seatYaw = f.sitting && p.sw != null ? p.sw : null;
          f.standYaw = !f.sitting && p.sw != null ? p.sw : null;
          f.group.visible = true;
        }
        f.facingLeft = Boolean(p.l);
        // v215: kaydedilen yön; eski fotoğraflarda kameraya tam dönük değil, yürüdüğü yana hafif dönük
        if (Number.isFinite(p.yw)) f.faceYaw(p.yw);
        else {
          const toCam = Math.atan2(camera.position.x - f.x, camera.position.z - f.z);
          f.faceYaw(toCam + (p.l ? -0.6 : 0.6));
        }
        f.walkT = p.wp ? 0.16 : 0;
        f.emote = p.e && EMOTE_EMOJI[p.e.k] ? { kind: p.e.k, t0: now - (Number(p.e.at) || 0) } : null;
        if (p.h) f.setHolding(p.h);
        f.sink = waters.length ? sinkAt(f.x, f.z) : 0;
        f.sinkCur = f.sitting || f.inCar ? 0 : f.sink;
        if (i === 0 && icCar) f.group.visible = false; // iç kamerada çekenin kendisi görünmez (canlıdaki gibi)
        f.update(0, camera, now);
        labels.push({ f, says: p.says || [], self: i === 0 });
      });
      npcs.forEach((n) => {
        // v157: sadece fotoğraf karesinin yakınındakiler (uzaktaki NPC dokusu boşuna çizilmesin)
        const vp = n.venue ? toRoom(n.venue, cam.px, cam.pz) : null;
        const near = !n.off && (n.x - cam.px) ** 2 + (n.z - cam.pz) ** 2 < 60 * 60 && (!vp || (Math.abs(vp.x) < VROOM.W / 2 + 4 && Math.abs(vp.z) < VROOM.D / 2 + 4));
        if (!near) {
          if (n.group.visible) hide(n.group);
          return;
        }
        if (!n.group.visible) {
          n.group.visible = true;
          hidden2.push(n.group);
        }
        n.update(0, camera, now);
        labels.push({ f: n, says: [] });
      });
      fbFigs.forEach((f) => {
        const [x, z, l, m, wp] = f.fb;
        f.x = Number(x) || 0;
        f.z = Number(z) || 0;
        f.y = groundY(f.x, f.z);
        f.facingLeft = Boolean(l);
        f.moving = Boolean(m);
        f.walkT = wp ? 0.16 : 0;
        f.group.visible = true;
        f.update(0, camera, now);
      });
      if (fbBall) fbBall.visible = true;
      renderer.render(scene, camera);
      const c2 = document.createElement('canvas');
      c2.width = w;
      c2.height = h;
      const ctx = c2.getContext('2d');
      if (save.inPlace) ctx.drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, w, h);
      else ctx.drawImage(canvas, 0, 0, w, h);
      try {
        drawShotLabels(ctx, w, h, w / Math.max(200, Math.min(2000, Number(cam.cw) || 400)), labels);
      } catch {
        /* etiket çizilemezse sadece kare */
      }
      return c2.toDataURL('image/jpeg', 0.86);
    } finally {
      tmpFigs.forEach((f) => (f.group.visible = false));
      fbFigs.forEach((f) => (f.group.visible = false));
      if (fbBall) fbBall.visible = false;
      tmpCars.forEach((c) => (c.v.root.visible = false));
      hidden.forEach((o) => (o.visible = true));
      hidden2.forEach((o) => (o.visible = false));
      headSpot.intensity = hsI;
      if (save.inPlace) {
        renderer.setViewport(0, 0, save.size.x, save.size.y);
      } else {
        renderer.setPixelRatio(save.pr);
        renderer.setSize(save.size.x, save.size.y, false);
      }
      camera.position.copy(save.pos);
      camera.quaternion.copy(save.quat);
      camera.fov = save.fov;
      camera.aspect = save.aspect;
      if (save.near != null) camera.near = save.near;
      if (save.icCar) showRig(save.icCar, false);
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

  // v154 — soygun dizisi (sadece canlı ekranda; fotoğraf motorunda yok)
  heist = snapshot
    ? null
    : createCityHeist({
        scene,
        layer,
        container,
        camera,
        Fig,
        me,
        self,
        zones,
        city,
        groundY: (x, z) => groundY(x, z),
        placeLabel: (...a) => placeLabel(...a),
        headMat,
        snapCam: () => {
          first = true;
          camGlide = null;
        },
        isBusy: () => Boolean(harac || driving || self.ride || self.seat || fall),
        // v156: soygun iç mekânı başlık kartı sırasında derlenir (kapıda donma olmasın)
        warm: (pos, look) => {
          renderer.compile(scene, camera);
          // iç mekânı bir kez GERÇEKTEN çiz (başlık kartı opak siyahın altında, görünmez):
          // sürücü shader'ları bağlar, dokuları yükler → kapıdan girerken ilk karede donma olmaz
          if (pos && look) {
            const c = camera.clone();
            c.position.copy(pos);
            c.lookAt(look);
            c.updateMatrixWorld();
            c.updateProjectionMatrix();
            renderer.render(scene, c);
          }
        },
      });

  const api = {
    heist,
    photoState,
    renderAtt,
    // v157.4: Sixtagram — telefonda sadece yakındaki fotoğraflar kendiliğinden çizilir
    selfPos: () => ({ x: self.x, z: self.z }),
    getPerf: () => ({ tier, name: CITY_TIERS[tier].name, dpr: renderer.getPixelRatio(), drs }),
    // v158: önizleme / hata ayıklama (performans ölçümü)
    dbg: () => ({ renderer, scene, camera, W, carBlocked: (x, z, r = 1) => carBlockedAt(x, z, r), info: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, progs: renderer.info.programs?.length } }),
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
    // v149 — stadyum: izlenecek maç (null: yok), saha kilidi, reklam panoları
    setStadiumMatch: (m) => stadium?.setMatch(m),
    stadiumState: () => stadium?.state() || null,
    setPitchLock,
    setStadiumSponsors: (names) => stadLot?.info.match.setSponsors?.(names),
    areaAt: () => areaAt(self.x, self.z),
    // v149 — araba içi / dışı kamera
    setCarCam(m) {
      carCam = m === 'in' ? 'in' : 'out';
      inLook.yaw = 0;
      inLook.pitch = -0.06;
      driveCamIdle = 9;
    },
    getCarCam: () => carCam,
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
    // v199: yayındayken başının üstünde "🔴 CANLI · 👁 n" (eski evdeki setLiveBadge)
    setLiveBadge(text) {
      if (!me.liveEl) {
        me.liveEl = document.createElement('div');
        me.liveEl.className = 'hs-live';
        me.label.insertBefore(me.liveEl, me.nameEl);
      }
      me.liveEl.textContent = text || '';
      me.liveEl.style.display = text ? '' : 'none';
    },
    // v200: elde tutulan ürünün bitiş zamanı da tutulur (ısmarlayınca kalan süre aynen gider)
    setHolding(p, untilMs = null) {
      me.setHolding(p);
      heldUntil = p ? untilMs || Date.now() + 120_000 : 0;
    },
    myHolding: () => (me.holding && heldUntil > Date.now() ? { p: me.holding, until: heldUntil } : null),
    playerHolding: (id) => remotes.get(id)?.st?.h || null,
    // v198: evdeki eşyayı aç / kapat (ışık, TV, şömine…) — sadece bu cihazda
    homeToggle(itemId) {
      const ctl = EV?.ml.objById(itemId)?.userData?.ctl; // v202: eşya kimliği
      if (!ctl?.setOn) return false;
      ctl.setOn(!ctl.on);
      updateLights(true); // v202: ışığı olan eşya hemen söner / yanar
      return true;
    },
    // v198: garson siparişi getirir (ürün garsonun elinde gelir, varınca done çağrılır)
    npcDeliver(id, product, done) {
      const n = npcs.find((q) => q.id === id);
      if (!n || n.off) {
        done?.();
        return false;
      }
      n.setHolding(product);
      n.say('Siparişiniz geliyor! 🍽️');
      n.deliver = { product, t: 0, done };
      return true;
    },
    npcSay(id, text) {
      const n = npcs.find((q) => q.id === id);
      if (n && !n.off) n.say(text);
    },
    // v197: mekân NPC'sini aç / kapat, adını + avatarını değiştir (ör. camide oyundaki imam). o = null → gizli
    venueNpcSet(id, o) {
      const n = npcs.find((q) => q.id === id);
      if (!n) return;
      n.off = !o;
      if (!o) {
        n.group.visible = false;
        return;
      }
      if (o.name) n.setName(String(o.name).slice(0, 40));
      if (Array.isArray(o.lines)) n.lines = o.lines.filter(Boolean).map((l) => String(l).slice(0, 120)); // v202
      if (!o.av || typeof o.av !== 'object' || !Object.keys(o.av).length) return;
      const av = { ...o.av };
      delete av.pet; // camide evcil hayvan dolaşmasın
      if (n.tex.lazy) {
        n.av0 = av;
        n.avBase = av;
        n.avKey = n.avBaseKey = JSON.stringify(av);
      } else n.setAvatar(av);
    },
    pause() {
      paused = true;
    },
    setLite(on) {
      lite = Boolean(on);
    },
    resume() {
      paused = false;
      clock.getDelta();
      first = true;
    },
    // v157.9: şehir başka bir ekranın (ev, işletme, karargah düzenleme) arkasında beklerken ekran
    // kartındaki kopyalar bırakılır (işlemcideki veri kalır; dönüşte görünenler yeniden yüklenir)
    releaseGpu() {
      let live = null;
      const liveTex = () => (live ||= liveTextures()); // v173: sahne bir kez taranır
      for (const c of cullItems) {
        if (c.keep || c.gone) continue;
        c.gone = true;
        c.hidT = 0;
        evictGpu(c.o, liveTex);
      }
      renderer.renderLists?.dispose?.();
    },
    // v157.9: ortak çizici başka bir ekranda (karargah düzenleme) kullanıldıysa şehre geri alınır —
    // şehir kapanıp yeniden kurulmaz (eskiden Düzenle'ye girip çıkarken iki kez uzun yükleme vardı)
    reclaim() {
      if (canvas.parentNode !== container) container.insertBefore(canvas, container.firstChild);
      canvas.className = 'hs-gl';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMappingExposure = 1.05;
      renderer.__onLost = () => onEvent?.({ type: 'contextLost' });
      applyTier();
      moonL.shadow.needsUpdate = true;
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
      me.faceYaw(out); // v215: avatar da binadan dışarı bakar
      zoneKey = '__exit__';
    },
    teleport(x, z) {
      if (driving) exitCar();
      if (self.seat) standUp();
      const f = freeNear(x, z);
      if (!f) return;
      self.x = f.x;
      self.z = f.z;
      me.y = groundY(f.x, f.z); // v167: ışınlanınca zemin baştan bulunur (köprü üstü/altı ayrımı eski yükseklikle yapılmasın)
      self.target = null;
      self.path = null;
      ring.visible = false;
      first = true;
      faceAway = true; // v215
      if (fall) {
        fall = null; // v216: ışınlanma / doğma fırlamayı keser
        me.rag = null;
      }
    },
    walkTo,
    // v196 — 3 KATLI EV ----------------------------------------------------------------------
    hasHome: () => Boolean(EV),
    homeInside: () => Boolean(curVenue?.ml),
    homeLevel: () => (EV ? EV.ml.level(me.y) : 0),
    // Evler listesi: şu an hangi evde kaç kişi var (görülen oyuncuların ağ kaydından — ek okuma yok)
    homeOccupancy() {
      const out = {};
      remotes.forEach((r) => {
        const h = r.st?.hm;
        if (h && h !== '_') out[h] = (out[h] || 0) + 1;
      });
      return out;
    },
    // içerisi kimin evi: { id, items, surf, door, garageCar } — null = boş ev (kapı önü)
    setHome(home) {
      if (!EV) return;
      evHome = home || null;
      EV.ml.setItems(home?.items || []);
      // v197: satın alınmamış (deneme) kaplama sadece ev sahibine görünür; ziyaretçi varsayılanı görür
      const surf = { ...(home?.surf || {}) };
      if (home && !home.mine) {
        Object.keys(surf).forEach((f) => {
          const v = { ...surf[f] };
          if (v.wallTry) delete v.wall;
          if (v.floorTry) delete v.floor;
          surf[f] = v;
        });
      }
      EV.ml.setSurfaces(surf);
      EV.ml.setWindows(home?.win || {});
      evSeats();
      this.homeDoor?.(home?.door?.t || 'ahsap');
      // v197: garajda her zaman benim aracım — kendi evime girince sunucudaki güncel hali gelir
      if (home?.mine && (home.garage?.cid || home.garageCar)) evSetGarageCar(home.garage?.cid || home.garageCar, home.garage?.mods || null, home.garage?.id || null);
      else if (home?.mine) evSetGarageCar(null);
    },
    // v202: bot / hayvan ayarı kaydedilince (Tasarla › ✏️ Düzenle) evdeki figür hemen güncellenir
    homeSetCfg(field, id, cfg) {
      if (!evHome || (field !== 'bots' && field !== 'pets')) return;
      evHome[field] = { ...evHome[field], [id]: cfg };
      try {
        evFigsBuild();
      } catch {
        /* yoksay */
      }
    },
    homeSetItems(items) {
      if (!EV) return;
      EV.ml.setItems(items);
      if (evHome) evHome.items = items; // v199: önce güncellenir (hayvan / bot yeni konumda kurulsun)
      evSeats();
    },
    // v196: kat başına duvar / zemin kaplaması (önizleme + kayıttan sonra)
    homeWindows(win) {
      if (!EV) return;
      EV.ml.setWindows(win || {});
      if (evHome) evHome.win = win;
    },
    // v196: telefonda merdiven zor — kat düğmesi oyuncuyu merdivenlerden o kata yürütür
    homeGoFloor(f) {
      if (!EV || curVenue !== EV || evDesign || driving) return false;
      const g = EV.ml.floorTarget(Math.max(0, Math.min(2, f | 0)));
      if (self.seat) standUp();
      const here = toRoom(EV, self.x, self.z);
      const pts = EV.ml.route({ x: here.x, z: here.z, y: me.y }, g).map(([x, z]) => fromRoom(EV, x, z));
      if (!pts.length) return false;
      self.path = pts;
      self.target = pts.shift();
      self.repath = 0;
      self.stuckT = 0;
      return true;
    },
    // v196 — şehirdeki yayın (oyunun internet kafesi / kişisel ev): yayın kamerasından küçük kare
    // pose: oda koordinatları (streamShared.streamPose) + room ('ev' | mekân türü) + f (evde kat)
    // v199: yayındayken ana ekran yayın kamerasından (null = normal kamera)
    setStreamCam(pose) {
      const was = streamCam;
      streamCam = pose && Number.isFinite(pose.px) ? { ...pose } : null;
      if (was && !streamCam) {
        camera.fov = 60;
        camera.updateProjectionMatrix();
        first = true;
      }
    },
    renderStreamView(pose, target) {
      if (!pose || !target) return false;
      const v = W.venues.find((q) => q.type === (pose.room || 'ev'));
      if (!v) return false;
      try {
        const base = v.ml ? v.ml.floors[pose.f || 0] : 0.16;
        const p = fromRoom(v, pose.px, pose.pz);
        const t = fromRoom(v, pose.tx, pose.tz);
        const cw = canvas.width;
        const ch = canvas.height;
        const want = target.width / target.height;
        let vw = cw;
        let vh = Math.round(cw / want);
        if (vh > ch) {
          vh = ch;
          vw = Math.round(ch * want);
        }
        const c = camera.clone();
        c.fov = pose.fov || 64;
        c.aspect = want;
        c.near = 0.05;
        c.position.set(p.x, base + pose.py, p.z);
        c.lookAt(t.x, base + pose.ty, t.z);
        c.updateMatrixWorld();
        c.updateProjectionMatrix();
        const pr = renderer.getPixelRatio();
        renderer.setViewport(0, 0, vw / pr, vh / pr);
        renderer.render(scene, c);
        target.getContext('2d').drawImage(canvas, 0, ch - vh, vw, vh, 0, 0, target.width, target.height);
        renderer.setViewport(0, 0, cw / pr, ch / pr);
        renderer.render(scene, camera);
        return true;
      } catch {
        return false;
      }
    },
    homeItems: () => (evHome?.items || []).map((x) => ({ ...x })),
    homeId: () => evHome?.id || null,
    // v200: uzaktaki oyuncu hangi evde (ağ kaydı st.hm; evde değilse null)
    playerHome: (id) => {
      const h = remotes.get(id)?.st?.hm;
      return h && h !== '_' ? h : null;
    },
    // v200: evden çıkarıldı → kapının dışına
    homeEject() {
      if (!EV || curVenue !== EV) return false;
      if (driving) exitCar();
      if (self.seat) standUp();
      const p = fromRoom(EV, EV.ml.door.x, 9.2);
      self.x = p.x;
      self.z = p.z;
      me.y = groundY(p.x, p.z);
      self.camYaw = EV.ry + Math.PI;
      self.target = null;
      self.path = null;
      ring.visible = false;
      first = true;
      faceAway = true; // v215
      if (fall) {
        fall = null; // v216: ışınlanma / doğma fırlamayı keser
        me.rag = null;
      }
      return true;
    },
    homeSurfaces(surf) {
      if (!EV) return;
      EV.ml.setSurfaces(surf || {});
      if (evHome) evHome.surf = surf;
    },
    // ana kapı türü (ahşap / beyaz / çift / salon) — konum aynı, açılır kapı yenisiyle değişir
    homeDoor(t) {
      if (!EV || !EV.doors?.[0]) return;
      const key = `door_${t || 'ahsap'}`;
      const old = EV.doors[0];
      old.traverse((o) => o.userData.doorVoid && (o.visible = false)); // kapının arkası siyah değil: dışarısı görünsün
      if (old.userData.doorKey === key || (!old.userData.doorKey && key === 'door_ahsap')) return;
      const kit = EV.low[0];
      const n = kit.item(key, old.position.x, old.position.z, 0, 0, { solid: false, y: 0.02 });
      if (!n) return;
      n.position.copy(old.position);
      n.rotation.copy(old.rotation);
      n.userData.doorKey = key;
      n.traverse((o) => o.userData.doorVoid && (o.visible = false));
      if (old.parent && n.parent !== old.parent) old.parent.add(n);
      old.removeFromParent();
      const tk = ticks.find((q) => q.obj === old);
      if (tk) {
        tk.obj = n;
        tk.ctl = n.userData.ctl;
      } else if (n.userData.ctl?.tick) ticks.push({ obj: n, ctl: n.userData.ctl });
      EV.doors[0] = n;
    },
    homeGarage: (key, mods, id) => evSetGarageCar(key || null, mods || null, id || null),
    // v197: garajdaki araç { cid, mods, id } (yoksa null) + garajdan bin
    garageCarInfo: () => (evCar?.key ? { cid: Number(evCar.key) || evCar.key, mods: evCar.mods || null, id: evCar.id || null } : null),
    garageDrive() {
      if (!evCar?.key || evCar.out) return { ok: false, reason: 'Garaj boş' };
      if (self.seat) standUp();
      const at = garageWorld();
      if (!at) return { ok: false, reason: 'Garaj bulunamadı' };
      const r = callCar(evCar.key, evCar.mods || null, { x: at.x, z: at.z, yaw: at.yaw });
      if (!r.ok) return r;
      evCar.out = true;
      if (evCar.obj) evCar.obj.visible = false;
      if (myCar) {
        myCar.v.root.scale.setScalar(1);
        myCar.spawnT = 1;
      }
      enterCar();
      return r;
    },
    homePlace: (it, x, z) => (EV ? EV.ml.place(it, x, z) : false),
    homeSelect: (idx) => {
      evSel = idx == null ? null : idx;
      EV?.ml.select(idx);
    },
    // v197: göz — deneme (satın alınmamış) eşyaları gerçek haliyle göster (sadece tasarımda, sadece sen)
    homeRealLook: (on) => {
      EV?.ml.setRealLook(Boolean(on));
      evPadsVis(); // eşyalar yeniden kuruldu
    },
    homeDesign(f) {
      const was = evDesign;
      evDesign = f == null ? null : { f: Math.max(0, Math.min(2, f | 0)) };
      try {
        evFigsBuild(); // v199: tasarımda hayvan / bot + platform, normalde sadece hayvan / bot
      } catch {
        /* yoksay */
      }
      me.group.visible = !evDesign; // tasarımda avatar gizli
      if (evDesign && !was) {
        dCam.yaw = 0;
        const portrait = (canvas.clientHeight || 1) > (canvas.clientWidth || 1);
        dCam.yaw = portrait ? Math.PI / 2 : 0; // dikey ekranda evin uzun kenarı dikey
        dCam.pitch = portrait ? 1.1 : 0.95;
        dCam.dist = portrait ? 25 : 19;
        dCam.lift = portrait ? 4 : 2; // alttaki eşya rafı zemini kapatmasın: bakış noktası kameraya doğru
        dCam.x = 0;
        dCam.z = 0;
      }
      if (!evDesign && EV) {
        EV.ml.select(null);
        EV.ml.setRealLook(false);
        evPadsVis();
        evSel = null;
      }
      dDrag = null;
    },
    // tasarım: ekranın ortasının denk geldiği zemin noktası (yeni eşya oraya konur) — oda yereli
    homeViewCenter() {
      if (!EV || !evDesign) return { x: 0, z: 0 };
      ndc.set(0, 0);
      ray.setFromCamera(ndc, camera);
      const root = EV.ml.groups[0].parent;
      root.updateMatrixWorld(true);
      evInv.copy(root.matrixWorld).invert();
      const o = ray.ray.origin.clone().applyMatrix4(evInv);
      const d = ray.ray.direction.clone().transformDirection(evInv);
      const fy = EV.ml.floors[evDesign.f];
      const t = Math.abs(d.y) > 1e-4 ? (fy - o.y) / d.y : -1;
      return t > 0 ? { x: o.x + d.x * t, z: o.z + d.z * t } : { x: 0, z: 0 };
    },
    // kapının iç tarafına (giriş katı) ışınlan — "Evine git" / ziyaret
    homeSpawn() {
      if (!EV) return;
      if (driving) exitCar();
      if (self.seat) standUp();
      const p = fromRoom(EV, EV.ml.door.x, EV.ml.door.z - 0.6);
      self.x = p.x;
      self.z = p.z;
      me.y = 0.16;
      evY = 0.16;
      self.camYaw = EV.ry;
      self.target = null;
      self.path = null;
      ring.visible = false;
      first = true;
      faceAway = true; // v215
      if (fall) {
        fall = null; // v216: ışınlanma / doğma fırlamayı keser
        me.rag = null;
      }
    },
    // v157 — girilebilir mekânlar / dış dünya
    venueType: () => (curVenue ? curVenue.type : null),
    venueTypes: () => W.venues.map((v) => v.type),
    enterVenue(type) {
      const p = venueSpawn(type);
      if (!p) return false;
      if (driving) exitCar();
      if (self.ride) rideEnd();
      if (self.seat) standUp();
      self.x = p.x;
      self.z = p.z;
      me.x = p.x;
      me.z = p.z;
      me.y = groundY(p.x, p.z);
      self.camYaw = p.yaw;
      self.camPitch = p.pitch ?? self.camPitch;
      self.target = null;
      self.path = null;
      ring.visible = false;
      first = true;
      faceAway = true; // v215
      if (fall) {
        fall = null; // v216: ışınlanma / doğma fırlamayı keser
        me.rag = null;
      }
      return true;
    },
    // v157.4 — ÇETE KARARGAHLARI: hangar (slot 0–5) → çetenin adı (kapının üstünde) + iç tasarımı
    hqSet(slot, { name = null, design } = {}) {
      const v = W.venues.find((q) => q.type === `hq${slot}`);
      if (!v) return false;
      if (name && v.hqName !== name) {
        v.hqName = name;
        if (v.hqSign) {
          v.root.remove(v.hqSign);
          v.hqSign.traverse((o) => o.isMesh && (o.geometry.dispose(), o.material.map?.dispose?.(), o.material.dispose?.()));
        }
        const k = new Kit(`hqname${slot}`);
        k.sign(`hqn${slot}_${name}`, String(name).toLocaleUpperCase('tr-TR').slice(0, 24), 0.7, 0, 5.1, v.door.z - 1.2 + 0.12, 0, { color: '#ffffff', glow: '#ff3b3b', font: '900 100px Impact, Arial Black, sans-serif', li: 5, ld: 9 });
        v.hqSign = k.group;
        v.root.add(k.group);
        k.group.updateMatrixWorld(true);
      }
      if (design !== undefined) {
        HQ_CACHE.designs[slot] = design || null;
        // v158.1: iç bütünüyle değişir (eskiden ikinci bir zemin eklenip eskisiyle titreşiyordu)
        if (v.intOn !== false) swapVenueInt(v);
      }
      return true;
    },
    // kendi karargahına ışınlan (Çeteler › Aç) — v158: kapıdaki "İçeri gir" de bunu kullanır
    enterHq(slot) {
      return api.exitHq(slot); // v159.1: içeri girilmez — kapının önüne
    },
    // v158: karargahtan şehre (kapının önüne, yüz yola dönük)
    exitHq(slot) {
      const v = W.venues.find((q) => q.type === `hq${slot}`);
      if (!v) return false;
      const p = fromRoom(v, v.doorX ?? 0, VROOM.D / 2 + 3.6);
      if (self.seat) standUp();
      self.x = p.x;
      self.z = p.z;
      me.x = p.x;
      me.z = p.z;
      me.y = groundY(p.x, p.z);
      self.camYaw = v.ry + Math.PI;
      self.target = null;
      self.path = null;
      ring.visible = false;
      first = true;
      faceAway = true; // v215
      if (fall) {
        fall = null; // v216: ışınlanma / doğma fırlamayı keser
        me.rag = null;
      }
      return true;
    },
    // karargahların bulunduğu cebin merkezi (yaklaşınca bilgiler okunur)
    hqArea: () => {
      const p = rsGeo().pads.find((q) => q.key === 'cete');
      return p ? { x: p.cx, z: p.cz, r: p.r } : null;
    },
    // dünya üzerindeki herhangi bir noktaya (Kervankent, köy, kumsal…) yürüyerek ışınlan
    teleportWorld(x, z, yaw) {
      if (driving) exitCar();
      if (self.ride) rideEnd();
      if (self.seat) standUp();
      let p = { x, z };
      if (blockedAt(x, z)) {
        let hit = null;
        // v157: sık ormana bırakılırsa en yakın yola / açıklığa kadar ara (90 m)
        for (let rr = 0.5; rr < 90 && !hit; rr += rr < 20 ? 0.5 : 2) {
          const na = rr < 20 ? 20 : 40;
          for (let a = 0; a < na && !hit; a++) {
            const px = x + Math.cos((a / na) * Math.PI * 2) * rr;
            const pz = z + Math.sin((a / na) * Math.PI * 2) * rr;
            if (!blockedAt(px, pz)) hit = { x: px, z: pz };
          }
        }
        if (hit) p = hit;
      }
      self.x = p.x;
      self.z = p.z;
      me.x = p.x;
      me.z = p.z;
      me.y = groundY(p.x, p.z);
      if (yaw != null) self.camYaw = yaw;
      self.target = null;
      self.path = null;
      ring.visible = false;
      first = true;
      faceAway = true; // v215
      if (fall) {
        fall = null; // v216: ışınlanma / doğma fırlamayı keser
        me.rag = null;
      }
    },
    world: () => W,
    // v157: geliştirme testleri (çarpışma / zemin simülasyonu) — canlıda yok
    ...(import.meta.env?.DEV ? { __dbg: { THREE, scene, renderer, camera, me: () => ({ x: self.x, z: self.z, y: me.y, t: self.target, p: self.path, stuck: self.stuckT, seat: Boolean(self.seat) }), findPath: (a, b, c, d) => findPath(a, b, c, d), carBlockedAt, blockedAt, groundY: (x, z, h, c) => groundY(x, z, h, c), modeAt: (x, z) => W.modeAt(x, z), car: () => myCar, pvOf: (k) => myCar && passengerView(myCar, k), seatW: (k) => myCar && seatWorld(myCar, k), paxView: (k) => { dbgPv = k; if (myCar) { myCar.v.rig && showRig(myCar, false); } } } } : {}),
    // v157 — yeni harita (mini + büyük): ilk açılışta bir kez çizilir
    map() {
      if (!gmap) {
        const vendors = city.kits.filter((k) => k.group.name.startsWith('vendor_')).map((k) => {
          const p = k.group.getWorldPosition(new V());
          const key = k.group.name.slice(7);
          return { x: p.x, z: p.z, icon: '🛒', name: { kokorecci: 'Kokoreççi', kofteci: 'Köfteci', donerci: 'Balık Ekmekçi', simitci: 'Simitçi', midyeci: 'Midyeci', dondurmaci: 'Dondurmacı' }[key] || key, vendor: key };
        });
        gmap = createMap({ city, cityExtraLots: [], solids: [...solids, ...W.townSolids], citySolidCount: solids.length, town: W.town, sample: W.groundAt, lotTypes: LOT_TYPES, vendors, extraBld: W.venues.filter((v) => v.lot).map((v) => ({ type: v.type, x: v.wx, z: v.wz, hw: VROOM.W / 2 + 0.3, hd: VROOM.D / 2 + 0.3, yaw: v.ry })), roadside: { ...rsGeo(), solids: W.rsSolids }, park: W.park, extraPois: zones.filter((z) => z.kind === 'shopDoor' && SHOP_POI[z.venue]).map((z) => ({ x: z.x, z: z.z, type: z.venue, ...SHOP_POI[z.venue] })) });
      }
      return gmap;
    },
    // harita simgesine dokununca: mekânsa İÇİNE, yol üstü / köyse oraya, diğerleri önüne
    mapGo(p) {
      if (!p) return false;
      if (p.type && W.venues.some((v) => v.type === p.type)) return api.enterVenue(p.type);
      if (p.type === 'motogaleri' || p.type === 'tamirci') {
        const sp = spawnPoint(p.type === 'tamirci' ? 'tamirci' : 'motor_galerisi'); // v178: kapının önü · v198: tamirci
        api.teleportWorld(sp.x, sp.z, sp.yaw);
        return true;
      }
      if (p.rs) {
        const pd = rsGeo().pads.find((q) => q.key === p.rs);
        if (pd) {
          const vil = pd.village || pd.kind === 'maden';
          const lx = vil ? 0 : pd.kind === 'cete' ? -62 : Math.min(pd.x1 - 4, 9.5);
          const lz = vil ? pd.z1 - 12 : pd.s == null ? 0 : pd.z0 + 8;
          const w = fromPad(pd, lx, lz);
          api.teleportWorld(w.x, w.z);
          return true;
        }
      }
      if (p.vendor) {
        const sp = spawnPoint(p.vendor);
        api.teleportWorld(sp.x, sp.z, sp.yaw);
        return true;
      }
      api.teleportWorld(p.x, p.z + 2);
      return true;
    },
    // harita çizimi için: araç / yaya konumu + bakış yönü
    mapSelf: () => ({ x: self.x, z: self.z, yaw: driving && myCar ? myCar.yaw : self.camYaw + Math.PI, mode: W.modeAt(self.x, self.z), driving, car: myCar ? { x: myCar.x, z: myCar.z, yaw: myCar.yaw } : null, speed: driving && myCar ? Math.hypot(myCar.vx, myCar.vz) : 0 }),
    venueLocal: () => (curVenue ? toRoom(curVenue, self.x, self.z) : null),
    spotText: (id) => W.spotText(id),
    // v157 — yatay mod (ekran yazılımla 90° döndürülmüşse dokunuş koordinatları çevrilir)
    setRotated(on) {
      rotated = Boolean(on);
    },
    dbgWalk: () => ({ x: self.x, z: self.z, fx: ring.position.x, fz: ring.position.z, on: ring.visible, rp: self.repath || 0, fps: Math.round(1 / Math.max(0.001, dbgDt)) }),
    callCar,
    enterCar,
    exitCar,
    sit: (st) => sitAt(st && st !== 'near' ? st : nearestSeat()),
    stand: () => standUp(),
    // v202: koltuk kilidi (anahtar başına; hepsi kalkınca kilit açılır)
    seatHold(key, on) {
      if (on) seatHolds.add(String(key));
      else seatHolds.delete(String(key));
    },
    setDrive(patch) {
      Object.assign(driveIn, patch);
    },
    horn() {
      sound.start();
      sound.horn(driving && myCar ? myCar.v?.horn : 'standart'); // v162: modifiyeli korna
    },
    setMuted(m) {
      sound.setMuted(m);
    },
    isDriving: () => driving,
    getDrive: () => driveStat,
    debugCar: () => myCar && { imp: myCar.dbgImpact || null, spin: +(myCar.spin || 0).toFixed(2), x: +myCar.x.toFixed(2), z: +myCar.z.toFixed(2), y: +(myCar.y ?? 0).toFixed(2), yaw: +myCar.yaw.toFixed(3), steer: +myCar.steer.toFixed(2), vx: +myCar.vx.toFixed(2), vz: +myCar.vz.toFixed(2) },
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
    // v168 — Rıza Amca senaryosu (story/): canlı sürümde de açık küçük kapı (eskiden sadece
    // geliştirme modundaki __dbg vardı). Sahneye efekt grubu eklemek, zemin yüksekliği, poz, gizleme.
    story: {
      THREE,
      scene,
      groundY: (x, z) => groundY(x, z),
      selfY: () => me.y,
      // poz: 'handsup' | null — id 'self' = oyuncunun kendisi, diğerleri senaryo karakteri
      pose(id, pose) {
        const f = id === 'self' ? me : remotes.get(id)?.fig;
        f?.setForcePose(pose || null);
      },
      hideNpc(name, on) {
        npcs.forEach((n) => {
          if (n.nameEl?.textContent !== name) return;
          n.storyHidden = Boolean(on);
          if (on) n.group.visible = false;
        });
      },
      hideRemotes(on) {
        storyHideReal = Boolean(on);
      },
      lockMove(on) {
        storyLock = Boolean(on);
      },
      isCrouched: () => Boolean(self.seat),
      // v168.2 — parkta çay: noktaya en yakın, yan yana iki boş oturak (aynı bank)
      benchNear(x, z, r = 45) {
        let best = null;
        for (let i = 0; i < seats.length; i++) {
          const a = seats[i];
          if (a.taken || a.tier) continue;
          const da = Math.hypot(a.x - x, a.z - z);
          if (da > r || (best && da >= best.d)) continue;
          for (let j = 0; j < seats.length; j++) {
            if (j === i) continue;
            const b = seats[j];
            if (b.taken || b.tier || Math.abs(b.y - a.y) > 0.08) continue;
            const ab = Math.hypot(a.x - b.x, a.z - b.z);
            if (ab < 0.45 || ab > 1.3) continue;
            best = { d: da, i, me: { x: a.x, y: a.y, z: a.z }, other: { x: b.x, y: b.y, z: b.z } };
            break;
          }
        }
        return best;
      },
      sitSeat(i) {
        const st = seats[i];
        if (!st || st.taken || driving || self.ride) return false;
        if (self.seat) standUp();
        sitAt(st);
        return true;
      },
      // v168.1 DÜZELTME ("hızlı koş açık ama yavaş yürüyor"): sahnedeki koşu oyuncunun koşma düğmesini
      // DEĞİŞTİRMEZ — sahne bitince düğmenin hâline döner (eskiden setRun(false) düğmeyi kapatıyordu)
      run(on) {
        self.run = Boolean(on) || runToggle;
      },
      // mekânın kapısının ÖNÜ (dışarıda) — oyunun açılışındaki gibi; Amca'nın hedefleri buradan
      doorOut(region) {
        try {
          const p = spawnPoint({ region, out: true });
          return p && Number.isFinite(p.x) ? { x: p.x, z: p.z, yaw: p.yaw } : null;
        } catch {
          return null;
        }
      },
      // senaryo karakterinin arabasında yolcu muyum? (o sırada ağda görünmeyiz — araba sadece bu cihazda)
      riding: () => Boolean(self.ride && isStoryId(self.ride.owner)),
      // oyuncu siperde / yerde çöker (senaryo karakterinin çökmesiyle aynı yükseklik: zemin + 0,2)
      crouch(on) {
        if (on) {
          if (driving || self.ride) return false;
          if (self.seat) standUp();
          sitAt({ x: self.x, z: self.z, y: me.y + 0.2, yaw: null });
          return true;
        }
        if (self.seat) standUp();
        return true;
      },
    },
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
    remoteCount: () => [...remotes.values()].filter((r) => !isStoryId(r.uid) && (r.d ?? 999) < VIS_DIST).length, // v168: senaryo karakterleri sayılmaz
    // v163 — haritadaki oyuncu noktaları: zaten indirilmiş konumlar (ek ağ trafiği yok).
    // near: sadece "X kişi yakında" sayılanlar (mini harita); değilse dinlenen 3×3 hücredeki herkes.
    remoteMapPts: (near = false) => {
      const out = [];
      remotes.forEach((r) => {
        if (isStoryId(r.uid)) return; // v168
        if (near && (r.d ?? 999) >= VIS_DIST) return;
        const f = r.fig;
        const st = r.st || {};
        const inCar = st.p === 'd' || st.p === 'r';
        const x = Number.isFinite(f.x) ? f.x : f.tx;
        const z = Number.isFinite(f.z) ? f.z : f.tz;
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        out.push({ uid: r.uid, x, z, n: f.nameEl?.textContent || st.n || '', car: inCar });
      });
      return out;
    },
    // v150 — 👥 Yakındakiler listesi (yakından uzağa)
    nearbyPlayers: () => [...remotes.values()].filter((r) => !isStoryId(r.uid) && (r.d ?? 999) < VIS_DIST).sort((a, b) => a.d - b.d).slice(0, 40).map((r) => r.uid),
    playerSay(uid, text) {
      remotes.get(uid)?.fig.say(text);
    },
    setAvatar(av) {
      me.setAvatar(av);
    },
    // v159: kendi ad etiketimiz (oyuncu belgesi sonradan gelince 'Oyuncu' kalmasın)
    setMyName(n) {
      if (n) me.setName(String(n).slice(0, 40));
    },
    // ağa gönderilecek kendi durumum (kısa alan adları → az veri)
    getNetState() {
      const st = { x: Math.round(self.x * 100) / 100, z: Math.round(self.z * 100) / 100, l: me.facingLeft ? 1 : 0, m: me.moving ? 1 : 0, p: driving ? 'd' : self.ride ? 'r' : self.seat && !self.seat.stand ? 's' : 'w' }; // v202: duşta ayakta
      if (self.run && me.moving) st.r = 1;
      if (self.seat && !self.seat.stand) st.sy = Math.round(self.seat.y * 100) / 100;
      if (self.ride) {
        st.ro = self.ride.owner;
        st.rk = self.ride.k;
      }
      if (lastEmote.e && Date.now() - lastEmote.et < 4000) {
        st.e = lastEmote.e;
        st.et = lastEmote.et;
      }
      if (me.holding) st.h = me.holding;
      // v196: evin içinde — hangi evdeyim (ayrı oda) + kat yüksekliği
      // (ev belgesi henüz gelmediyse de "evde" sayılır: dışarıdakilere kapıda görünmeyiz)
      if (curVenue?.ml) {
        st.hm = evHome?.id || '_';
        st.y = Math.round(me.y * 100) / 100;
      }
      return st;
    },
    getNetCar() {
      if (!myCar) return null;
      const fx = Math.sin(myCar.yaw);
      const fz = Math.cos(myCar.yaw);
      // ct: ölçüm anı (sunucu saatine göre) — alıcı tahmini buna göre yapar
      return { ...(myCar.mk ? { m: myCar.mk } : {}), ct: Date.now(), v: myCar.id, x: Math.round(myCar.x * 100) / 100, z: Math.round(myCar.z * 100) / 100, y: Math.round(myCar.yaw * 1000) / 1000, s: Math.round((myCar.vx * fx + myCar.vz * fz) * 10) / 10, st: Math.round((myCar.steer || 0) * 100) / 100, d: driving ? 1 : 0, ...(myJob.on ? { j: 1 + myJob.pax } : {}) };
    },
    myCarSeats: () => (myCar ? myCar.v.def.seats || 1 : 0),
    // --- v151 meslek ---------------------------------------------------------------
    setJob({ on = false, pax = 0 } = {}) {
      const p = on ? Math.max(0, Math.min(39, Math.floor(pax))) : 0;
      if (myJob.on === on && myJob.pax === p) return;
      myJob.on = on;
      myJob.pax = p;
      if (myCar) setPax(myCar, p);
    },
    jobTarget: (t) => jobWorld?.setTarget(t),
    jobRoute: (pts, color) => jobWorld?.setRoute(pts, color),
    jobRoutePts: () => jobWorld?.route?.() || null,
    jobPeople: (list) => jobWorld?.setPeople(list),
    jobSuspect: (sp) => jobWorld?.setSuspect(sp),
    jobSuspectPos: () => jobWorld?.suspect() || null,
    jobStopSuspect: () => jobWorld?.stopSuspect(),
    // şoförün aracı: konum, hız (m/s), sürüyor mu, katalog no
    // geliştirici: araba çarpışma ızgarasını sahnede kırmızı göster (görünmez engel avı)
    dbgCarGrid(on = true) {
      if (!import.meta.env?.DEV) return;
      const old = scene.getObjectByName('dbgCarGrid');
      if (old) scene.remove(old);
      // 0,9 m üstü kesilir: sadece zemindeki izler + ızgara (perspektif kayması olmasın)
      renderer.clippingPlanes = on ? [new THREE.Plane(new V(0, -1, 0), 0.9)] : [];
      if (!on) return;
      const c = document.createElement('canvas');
      c.width = GW;
      c.height = GH;
      const x = c.getContext('2d');
      const img = x.createImageData(GW, GH);
      for (let k = 0; k < GW * GH; k++) {
        const b = carGrid[k] === 1;
        const w = grid[k] === 1;
        img.data[k * 4] = b ? 255 : 0;
        img.data[k * 4 + 1] = !b && w ? 200 : 0;
        img.data[k * 4 + 2] = 0;
        img.data[k * 4 + 3] = b ? 150 : w ? 70 : 0;
      }
      x.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(GW * RES, GH * RES), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(GX0 + (GW * RES) / 2, 0.4, GZ0 + (GH * RES) / 2);
      m.renderOrder = 99;
      m.name = 'dbgCarGrid';
      scene.add(m);
    },
    jobProbe() {
      if (!myCar) return null;
      return { x: myCar.x, z: myCar.z, speed: Math.hypot(myCar.vx, myCar.vz), driving, id: myCar.id, yaw: myCar.yaw };
    },
    removeMyCar() {
      if (driving) exitCar();
      garageBack();
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
    // v154 — tanı (sadece geliştirme): en yakın koltuklar
    dbgSeats: (n = 4) => (import.meta.env?.DEV ? seats.map((st) => ({ x: +st.x.toFixed(2), y: +st.y.toFixed(2), z: +st.z.toFixed(2), d: +Math.hypot(st.x - self.x, st.z - self.z).toFixed(2) })).sort((a, b) => a.d - b.d).slice(0, n) : []),
    // v154 — tanı (sadece geliştirme): uzak arabaların ekrandaki konumu
    // v154 — tanı (sadece geliştirme): arabayı taşı (meslek testleri)
    dbgMoveCar: (x, z, yaw) => {
      if (!import.meta.env?.DEV || !myCar) return false;
      myCar.x = x;
      myCar.z = z;
      if (yaw != null) myCar.yaw = yaw;
      myCar.vx = 0;
      myCar.vz = 0;
      first = true;
      return true;
    },
    // v167 — tanı (sadece geliştirme): mekân içi koordinat → dünya, yürüme / yol testi
    dbgVenue: (type) => {
      if (!import.meta.env?.DEV) return null;
      const v = W.venues.find((x) => x.type === type || x.key === type);
      return v ? { from: (x, z) => fromRoom(v, x, z), seats: seats.filter((st) => { const r = toRoom(v, st.x, st.z); return Math.abs(r.x) < 12 && Math.abs(r.z) < 10; }).map((st) => ({ ...toRoom(v, st.x, st.z), x0: st.x, z0: st.z, reach: st.reach })) } : null;
    },
    dbgReachCount: () => (import.meta.env?.DEV ? [seats.length, seats.filter((s) => s.reach).length] : null),
    dbgW: () => (import.meta.env?.DEV ? W : null),
    dbgCarBlocked: (x, z, r = 1.1, curY = null) => {
      if (!import.meta.env?.DEV) return null;
      W.dbgWhy = '';
      const m = W.modeAt(x, z);
      const b = m === 'city' ? null : W.outerCarBlocked(x, z, r, m, -1, curY);
      return { m, b, why: W.dbgWhy };
    },
    dbgWalkTo: (x, z) => (import.meta.env?.DEV ? walkTo(x, z) : false),
    // DEV: ev odası noktası → ekran pikseli (önizlemede dokunma testi)
    dbgEvScreen(x, y, z) {
      if (!import.meta.env?.DEV || !EV) return null;
      const w = EV.ml.groups[0].parent.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((w.x + 1) / 2) * r.width, y: r.top + ((1 - w.y) / 2) * r.height, vis: w.z < 1 };
    },
    dbgCam(yaw) {
      if (import.meta.env?.DEV) self.camYaw = yaw;
    },
    dbgEvLocal() {
      if (!EV) return null;
      const p = toRoom(EV, self.x, self.z);
      return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +me.y.toFixed(2) };
    },
    dbgPath: (x, z) => (import.meta.env?.DEV ? findPath(self.x, self.z, x, z) : null),
    dbgBlocked: (x, z, r) => (import.meta.env?.DEV ? blockedAt(x, z, r) : null),
    dbgCars: () => (import.meta.env?.DEV ? [...rcars].map(([u, c]) => ({ u, x: c.x, z: c.z })) : []),
    // v154 — tanı: bellek / derlenmiş shader sayısı (donma ve çökme takibi)
    memInfo: () => ({ geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, prog: renderer.info.programs?.length || 0 }),
    // v153 — haraç animasyonu: başla (silah doğrult) → sunucu cevabı → bitir (para / polis)
    haracBegin(venueKey) {
      if (harac || driving || self.ride || self.seat) return false;
      const npc = npcs.find((n) => n.vendor === venueKey);
      if (!npc) return false;
      ensurePoseTex(me.tex, 'aim');
      ensurePoseTex(npc.ensureTex(), 'handsup');
      const savedHold = me.holding;
      me.setHolding(null);
      me.setForcePose('aim');
      me.say('Kasayı boşalt! 🔫');
      const a = Math.atan2(npc.x - self.x, npc.z - self.z);
      const yaw = [a + Math.PI / 2, a - Math.PI / 2].sort(
        (p, q) => Math.abs(Math.atan2(Math.sin(p - self.camYaw), Math.cos(p - self.camYaw))) - Math.abs(Math.atan2(Math.sin(q - self.camYaw), Math.cos(q - self.camYaw)))
      )[0];
      if (view === '3d') glideCam(yaw, 0.2);
      harac = { npc, phase: 'aim', t: 0, outcome: null, coins: [], savedHold, savedDist: self.camDist, label: null, siren: null, resolve: null };
      self.camDist = Math.max(self.camDist, 8.6);
      return true;
    },
    haracEnd(res) {
      if (!harac) return Promise.resolve();
      const h = harac;
      return new Promise((resolve) => {
        h.resolve = resolve;
        const o = res?.outcome;
        h.outcome = { outcome: o === 'ok' || o === 'caught' ? o : 'cancel', reward: res?.reward };
        if (h.outcome.outcome === 'cancel') {
          h.phase = 'cancel';
          h.t = 0;
        }
      });
    },
    haracActive: () => Boolean(harac),
    dispose() {
      engineGone = true;
      haracFinish();
      try {
        heist?.stop(); // v154
      } catch {
        /* yoksay */
      }
      cancelAnimationFrame(raf);
      try {
        stadium?.dispose();
      } catch {
        /* yoksay */
      }
      try {
        jobWorld?.dispose();
      } catch {
        /* yoksay */
      }
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
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
  const lod = makeLod();
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
    const geo = bakeGeo(g, o.matrixWorld);
    const cm = canonMat(o.material, geo);
    const lc = lod.classify(o);
    const key = `${lc ? `L${lc}` : `${Math.floor(wp.x / 32)},${Math.floor(wp.z / 32)}`}|${cm.key}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let b = buckets.get(key);
    if (!b) {
      b = { lodCell: lc, mat: cm.mat, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, geos: [] };
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
    lodTag(m, b.lodCell);
    root.add(m);
  });
  lod.boxes().forEach((m) => root.add(m));
  scene.add(root);
}

export { cx, cz, BLOCK };
