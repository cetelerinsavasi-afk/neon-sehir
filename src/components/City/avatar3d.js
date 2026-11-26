// =============================================================================
// v206 — 3D AVATAR ("çizgi film" gövde)
// Oyuncunun ZATEN üretilen önden (idle) ve arkadan (backIdle) avatar resmi, basit 3D
// hacimlere (kafa, gövde, kollar, bacaklar) giydirilir. Pelerin, kanat, şapka kenarı,
// kulak, kılıç gibi gövde dışına taşan parçalar gövdenin hemen arkasında ince bir
// "kesik kart" olarak durur. Böylece bütün kıyafetler, aksesuarlar ve 100 kostüm
// kendiliğinden 3D olur; yeni kostüm eklenince ayrıca bir şey yapmak gerekmez.
//
// Performans:
//   • Geometri avatara değil SADECE vücut yapısına bağlı → oyunun tamamında 3 set
//     (zayıf / standart / iri), bir kez kurulur, herkes paylaşır.
//   • Avatar başına 2 doku (ön|arka yan yana): mevcut idle + backIdle resimlerinden
//     kopyalanır, SVG yeniden çizilmez. Aynı avatarı giyen herkes aynı dokuyu kullanır.
//   • Işık hesabı yok: tek bir hazır "çizgi film" gölge resmi (matcap).
//   • ~3 bin üçgen, 9 çizim çağrısı / avatar. Uzaktakiler ve "en düşük" grafik
//     ayarında eski kâğıt figür kullanılır (bkz. cityEngine.js › Fig).
//
// GERİ ALMA: aşağıdaki AVATAR_3D_ENABLED = false yapılırsa oyun eski kâğıt figürlere
// döner (bu dosya dışında hiçbir şey değiştirmeye gerek yok). Tamamen kaldırmak için
// proje klasöründeki geri-al-3d-avatar.bat çalıştırılır.
// =============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const AVATAR_3D_ENABLED = true;

// 1 model birimi = 100 SVG pikseli; şehirdeki kâğıt figürle aynı ölçek (AV_UNIT = 1.75 / 507)
const MODEL_SCALE = (1.75 / 507) * 100;
const SW = 320;
const SH = 580;

// 2D ölçüleri (avatarShapes.js ile aynı: torsoShape B, legHipX, legsShape halfW)
const B2 = {
  zayif: { tl: 98, tr: 222, ty: 264, cx: 138, hw: 15, armR: 0.12 },
  standart: { tl: 70, tr: 250, ty: 262, cx: 132, hw: 19, armR: 0.15 },
  iri: { tl: 50, tr: 270, ty: 258, cx: 122, hw: 24, armR: 0.19 },
};
// Gövde şekli × kalınlık: kare / oval, ince / normal / kalın (bkz. shapeOf, SIZE_K)
// Gövde şekli oyuncunun seçimi (avatar.bodyShape: kare / oval); seçmemişse kadın → oval, erkek → kare.
// Kalınlık vücut yapısından gelir: zayıf → ince, standart → normal, iri yarı → kalın.
export const BODY_SHAPES = ['kare', 'oval'];
const shapeOf = (av) => (BODY_SHAPES.includes(av?.bodyShape) ? av.bodyShape : av?.gender === 'kadin' ? 'oval' : 'kare');
const TORSO = {
  kare: { w: 1.3, d: 0.72, sh: 0.97, cy: 2.29, ry: 0.59 },
  oval: { w: 1.18, d: 0.74, sh: 0.86, cy: 2.22, ry: 0.7 },
};
const SIZE_K = { zayif: 0.8, standart: 1, iri: 1.24 };
const HEAD_SVG = { x0: 102, x1: 218, y0: 104, y1: 236 };
const HEAD_Y = 3.78;
const HIP_Y = 1.72;
const KNEE = 0.8; // kalçadan dize (model birimi)
// oturunca kalçanın yerden yüksekliği (m) — koltuk yüksekliğine hizalamak için
export const AVATAR_3D_HIP = (1.72 * 1.75 / 507) * 100;

const buildOf = (av) => (B2[av?.build] ? av.build : 'standart');

// --- çizgi film gölgesi (matcap): 3 ton, ışıktan bağımsız --------------------------
let matcapTex = null;
function matcap() {
  if (matcapTex) return matcapTex;
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const img = x.createImageData(N, N);
  const L = new THREE.Vector3(-0.45, 0.55, 0.7).normalize();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const nx = ((i + 0.5) / N) * 2 - 1;
      const ny = 1 - ((j + 0.5) / N) * 2;
      const r2 = nx * nx + ny * ny;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      const d = nx * L.x + ny * L.y + nz * L.z;
      let v = d > 0.45 ? 1 : d > 0.05 ? 0.86 : 0.7;
      if (r2 > 0.86) v *= 0.93;
      const k = (j * N + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(v * 255);
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  matcapTex = new THREE.CanvasTexture(c);
  matcapTex.colorSpace = THREE.SRGBColorSpace;
  return matcapTex;
}

// --- geometri: parça kutusu → 2D bölgesi eşlemesi -----------------------------------
// Her üçgen öne bakıyorsa ön resimden, arkaya bakıyorsa arka resimden (aynalı) boyanır.
function bake(g, m, box, sv) {
  g = g.index ? g.toNonIndexed() : g.clone();
  g.applyMatrix4(m);
  const p = g.attributes.position;
  const n = p.count;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromBufferAttribute(p, t);
    b.fromBufferAttribute(p, t + 1);
    c.fromBufferAttribute(p, t + 2);
    const back = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let sx;
      let sy;
      if (sv.pt) {
        [sx, sy] = sv.pt;
      } else {
        const fx = (v.x - box.x0) / (box.x1 - box.x0);
        const fy = (box.y1 - v.y) / (box.y1 - box.y0);
        sx = sv.x0 + fx * (sv.x1 - sv.x0);
        sy = sv.y0 + fy * (sv.y1 - sv.y0);
        if (back) sx = SW - sx;
      }
      sx = Math.min(SW - 0.5, Math.max(0.5, sx));
      sy = Math.min(SH - 0.5, Math.max(0.5, sy));
      uv[(t + k) * 2] = (sx / SW) * 0.5 + (back && !sv.pt ? 0.5 : 0);
      uv[(t + k) * 2 + 1] = 1 - sy / SH;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const mtx = (p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
// Üçgen süzgeci: keep(cx, cy, cz) false dönen üçgenler atılır (indekssiz geometri).
function keepTris(g, keep) {
  const names = Object.keys(g.attributes);
  const src = names.map((n) => g.attributes[n]);
  const p = g.attributes.position;
  const outs = src.map(() => []);
  for (let t = 0; t < p.count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    if (!keep(cx, cy, cz, t)) continue;
    src.forEach((a, k) => {
      for (let v = t; v < t + 3; v++) for (let i = 0; i < a.itemSize; i++) outs[k].push(a.array[v * a.itemSize + i]);
    });
  }
  const r = new THREE.BufferGeometry();
  names.forEach((n, k) => r.setAttribute(n, new THREE.BufferAttribute(new Float32Array(outs[k]), src[k].itemSize)));
  g.dispose();
  return r;
}
const merge = (list) => {
  const g = mergeGeometries(list);
  list.forEach((x) => x.dispose());
  g.computeBoundingSphere();
  g.userData.noSlim = true;
  return g;
};

const PARTS = {};
function parts(build, body) {
  const pk = build + '|' + body;
  if (PARTS[pk]) return PARTS[pk];
  const s2 = B2[build];
  const F = SIZE_K[build];
  const TS = TORSO[body];
  const W = TS.w * F;
  const D = TS.d * (0.8 + F * 0.2);
  const TY = TS.cy;
  const RY = TS.ry;
  const top = TY + RY;
  const sph = new THREE.SphereGeometry(1, 16, 11);
  const torsoG = body === 'kare' ? new RoundedBoxGeometry(1, 1, 1, 2, 0.12) : sph;
  const tScale = body === 'kare' ? [W, RY * 2, D] : [W / 2, RY, D / 2];

  const out = { W, D, top };
  out.upper = merge([
    bake(torsoG, mtx([0, TY, 0], tScale), { x0: -W / 2, x1: W / 2, y0: TY - RY, y1: top }, { x0: s2.tl, x1: s2.tr, y0: s2.ty, y1: 380 }),
    bake(new THREE.CylinderGeometry(0.19, 0.21, 0.6, 10), mtx([0, 3.0, 0]), { x0: -0.21, x1: 0.21, y0: 2.7, y1: 3.3 }, { x0: 140, x1: 180, y0: 222, y1: 274 }),
  ]);
  out.head = merge([bake(sph, mtx([0, 0, 0], [0.58, 0.66, 0.56]), { x0: -0.58, x1: 0.58, y0: -0.66, y1: 0.66 }, HEAD_SVG)]);
  // kesik kart: ön + arka yüz, gövdenin biraz arkasında
  const cardZ = -Math.min(0.16, D * 0.25);
  const pl = new THREE.PlaneGeometry(3.2, 5.8);
  const raw = { x0: -1.6, x1: 1.6, y0: -0.32, y1: 5.48 };
  const rawS = { x0: 0, x1: SW, y0: 0, y1: SH };
  out.card = merge([bake(pl, mtx([0, 2.58, cardZ]), raw, rawS), bake(pl, mtx([0, 2.58, cardZ - 0.002], [1, 1, 1], [0, Math.PI, 0]), raw, rawS)]);

  const armR = s2.armR;
  const yMid = s2.ty + (380 - s2.ty) * 0.5;
  out.arms = [-1, 1].map((sx) => {
    const strip = sx < 0 ? { x0: s2.tl + 3, x1: s2.tl + 3 + armR * 140 } : { x0: s2.tr - 3 - armR * 140, x1: s2.tr - 3 };
    // omuz başı: gövde ile kol arasında yuvarlak omuz; 2D çizimin omuz köşesinden boyanır
    // (kostümde omuzluk / zırh buraya gelir, düz kart olarak havada kalmaz)
    const pos = [sx * ((W / 2) * TS.sh + armR * 0.8), top - 0.2, 0];
    const cr = [armR * 1.75, armR * 1.45, Math.min(D * 0.5, armR * 1.7)];
    const cx = sx < 0 ? { x0: s2.tl - 16, x1: s2.tl + 30 } : { x0: s2.tr - 30, x1: s2.tr + 16 };
    out.upper = merge([
      out.upper,
      bake(sph, mtx([pos[0] - sx * armR * 0.35, pos[1] + 0.02, 0], cr), { x0: pos[0] - sx * armR * 0.35 - cr[0], x1: pos[0] - sx * armR * 0.35 + cr[0], y0: pos[1] + 0.02 - cr[1], y1: pos[1] + 0.02 + cr[1] }, { ...cx, y0: s2.ty - 8, y1: s2.ty + 42 }),
    ]);
    return {
      sx,
      pos,
      upperArm: merge([bake(new THREE.CapsuleGeometry(armR, 0.56, 3, 8), mtx([0, -0.28, 0]), { x0: -armR, x1: armR, y0: -0.56 - armR, y1: armR }, { ...strip, y0: s2.ty + 6, y1: yMid })]),
      foreArm: merge([
        bake(new THREE.CapsuleGeometry(armR * 0.92, 0.46, 3, 8), mtx([0, -0.24, 0]), { x0: -armR, x1: armR, y0: -0.47 - armR, y1: 0 }, { ...strip, y0: yMid, y1: 376 }),
        // el: boyun renginden (kostümde eldiven olur)
        bake(sph, mtx([0, -0.65, 0.01], [armR * 1.05, armR * 1.3, armR * 0.95]), null, { pt: [160, 252] }),
      ]),
    };
  });
  // bacak: uyluk (kalçadan) + diz eklemi + baldır ve ayakkabı
  out.legs = [-1, 1].map((sx) => {
    const hw = s2.hw / 100;
    const cx = sx < 0 ? s2.cx : SW - s2.cx;
    const sv = { x0: cx - s2.hw, x1: cx + s2.hw };
    return {
      pos: [sx * ((160 - s2.cx) / 100), HIP_Y, 0],
      thigh: merge([bake(new THREE.CapsuleGeometry(hw, KNEE - hw, 3, 8), mtx([0, -KNEE / 2, 0]), { x0: -hw, x1: hw, y0: -KNEE, y1: 0 }, { ...sv, y0: 380, y1: 380 + KNEE * 100 })]),
      shin: merge([
        bake(new THREE.CapsuleGeometry(hw * 0.96, 1.55 - KNEE - hw, 3, 8), mtx([0, -(1.55 - KNEE) / 2, 0]), { x0: -hw, x1: hw, y0: -(1.55 - KNEE), y1: 0 }, { ...sv, y0: 380 + KNEE * 100, y1: 535 }),
        bake(new RoundedBoxGeometry(0.36, 0.16, 0.52, 1, 0.06), mtx([0, -1.62 + KNEE, 0.09]), { x0: -0.18, x1: 0.18, y0: -1.7 + KNEE, y1: -1.54 + KNEE }, { x0: cx - 16, x1: cx + 18, y0: 534, y1: 547 }),
      ]),
    };
  });
  sph.dispose();
  torsoG.dispose?.();
  pl.dispose();
  PARTS[pk] = out;
  return out;
}

// --- dokular -------------------------------------------------------------------
// Kart dokusunda gövdeyle örtüşen bölgeler silinir: sadece taşan parçalar kalır.
function eraseBody(x, build, head) {
  const s = B2[build];
  x.beginPath();
  x.ellipse(head.cx, head.cy, head.rx - 2, head.ry - 2, 0, 0, Math.PI * 2);
  x.fill();
  // gövde kutusu biraz geniş silinir: kıyafetin kenar gölgesi / dikişi kartta ince çubuk gibi kalmasın
  x.fillRect(s.tl - 10, s.ty - 6, s.tr - s.tl + 20, 386 - s.ty);
  // omuz köşeleri (omuzluk / zırh / kabarık omuz): 3D omuz başına giydiriliyor
  x.fillRect(s.tl - 48, s.ty - 26, 80, 84);
  x.fillRect(s.tr - 32, s.ty - 26, 80, 84);
  // gövdenin iki yanı (kalçaya kadar): kostümlerin 2D'de yana çizdiği eller / eldivenler / tutulan
  // eşyalar (harita, kalkan…) 3D kolların yanında havada duran düz parça olarak kalmasın
  x.fillRect(s.tl - 56, s.ty, 58, 410 - s.ty);
  x.fillRect(s.tr - 2, s.ty, 58, 410 - s.ty);
  x.fillRect(138, 220, 44, 56);
  for (const cx of [s.cx, SW - s.cx]) x.fillRect(cx - s.hw - 3, 376, s.hw * 2 + 6, 174);
}
function atlas(front, back, build, erase, ears = false, head = HEAD_FIT0, fillHead = false) {
  const w = front.width;
  const h = front.height;
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h;
  const x = c.getContext('2d');
  x.drawImage(front, 0, 0, w, h);
  x.drawImage(back, w, 0, w, h);
  if (!erase) {
    // Boş (şeffaf) kenarlar siyah görünmesin: resim kaydırılarak altına tekrar çizilir,
    // kenar renkleri boşluğa taşar (kostüm gövdesi 2D kutudan dar olduğunda kollar / bacaklar).
    x.globalCompositeOperation = 'destination-over';
    if (fillHead) {
      // büyütülmüş (kostüm) kafada çene yanlarındaki boşluk boyun / gövde rengiyle değil, başlığın
      // kendi renkleriyle dolsun: kafa bölgesi biraz büyütülüp altına çizilir
      for (const [img, ox] of [[front, 0], [back, w]]) {
        x.save();
        x.beginPath();
        x.rect(ox, 0, w, h * (240 / SH));
        x.clip();
        const s = 1.3;
        const cx = (160 / SW) * w;
        const cy = (head.cy / SH) * h;
        x.drawImage(img, ox + cx * (1 - s), cy * (1 - s), w * s, h * s);
        x.restore();
      }
    }
    for (const d of [2, 4, 7, 11, 16, 23, 32]) {
      for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) {
        x.drawImage(front, ox, oy, w, h);
        x.drawImage(back, w + ox, oy, w, h);
      }
    }
    x.globalCompositeOperation = 'source-over';
  }
  if (erase) {
    x.globalCompositeOperation = 'destination-out';
    for (const side of [0, 1]) {
      x.save();
      x.translate(side * w, 0);
      x.scale(w / SW, h / SH);
      eraseBody(x, build, head);
      if (ears) {
        // kulaklar (ve küpeler) 3D modelleniyor
        x.beginPath();
        x.ellipse(101, 180, 13, 20, 0, 0, Math.PI * 2);
        x.ellipse(219, 180, 13, 20, 0, 0, Math.PI * 2);
        x.fill();
      }
      x.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Önden + arkadan resimlerden (CanvasTexture) avatarın 3D malzemelerini üret.
// Dönen nesne avatar doku önbelleğinde saklanır; dispose() ile bırakılır.
// Normal kafa (2D'deki kafa elipsi, SVG pikseli)
const HEAD_FIT0 = { cx: 160, cy: 170, rx: 58, ry: 66 };
const HEAD_KEY0 = '160,170,58,66';
// Kostümde kafa çiziminin (kask, başlık, maske) kapladığı alan ölçülür: çene hizası sabit kalır,
// kafa en fazla belli bir boyuta kadar büyür; tepede taşan ince parçalar (yüzgeç, boynuz) kartta kalır.
function fitHead(img) {
  try {
    const w = 80;
    const h = 145;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const k = w / SW;
    const on = (sx, sy) => d[(Math.round(sy * k) * w + Math.round(sx * k)) * 4 + 3] > 128;
    // Her satırda kafanın ortasından (x=160) dışa doğru KESİNTİSİZ dolu genişlik: kanat, kılıç,
    // omuzluk gibi kafaya bitişik olmayan parçalar sayılmaz. Omuz hizasının (y≈205) altı bakılmaz.
    let half = 0;
    let top = 104;
    for (let sy = 40; sy <= 205; sy += 2) {
      if (!on(160, sy)) continue;
      let l = 0;
      let r = 0;
      while (160 - l - 2 > 0 && on(160 - l - 2, sy)) l += 2;
      while (160 + r + 2 < SW && on(160 + r + 2, sy)) r += 2;
      const hw = Math.min(l, r) + Math.abs(l - r) * 0.25; // tek yana taşan parça (yelken, yüzgeç) az sayılır
      if (sy >= 120) half = Math.max(half, hw);
      // tepe: en az normal kafanın %60'ı genişliğindeki ilk satır (ince yüzgeç / boynuz / püskül hariç)
      if (hw >= 35 && sy < top) top = sy;
    }
    const rx = Math.round(Math.min(80, Math.max(58, half)));
    const chin = 236;
    const ry = Math.round(Math.min(80, Math.max(66, (chin - top) / 2)));
    if (rx <= 62 && ry <= 68) return HEAD_FIT0; // normal boy kafa
    return { cx: 160, cy: chin - ry, rx, ry };
  } catch {
    return HEAD_FIT0; // okunamayan resim (güvenlik kısıtı) → normal kafa
  }
}
const HEADS = new Map();
function headGeo(f) {
  const key = [f.cx, f.cy, f.rx, f.ry].join(',');
  let g = HEADS.get(key);
  if (g) return g;
  const rx = f.rx / 100;
  const ry = f.ry / 100;
  const rz = Math.max(0.56, Math.min(0.8, rx * 0.95));
  const dy = (170 - f.cy) / 100;
  const sph = new THREE.SphereGeometry(1, 18, 13);
  g = merge([bake(sph, mtx([0, dy, 0], [rx, ry, rz]), { x0: -rx, x1: rx, y0: dy - ry, y1: dy + ry }, { x0: f.cx - f.rx, x1: f.cx + f.rx, y0: f.cy - f.ry, y1: f.cy + f.ry })]);
  sph.dispose();
  HEADS.set(key, g);
  return g;
}

// plain: resimler saçsız + şapkasız çizildi (avatar3DPlain) → saç, şapka, kulak 3D modellenir.
// Kostümde (look) ya da başlık aksesuarında başın çevresi kavisli kabuğa giydirilir.
export function makeAvatar3DLook(frontTex, backTex, avatar, { plain = false } = {}) {
  const fi = frontTex?.image;
  const bi = backTex?.image;
  if (!fi || !bi) return null;
  const build = buildOf(avatar);
  const body = shapeOf(avatar);
  const gear = plain ? gearOf(avatar) : null;
  // kostüm: kask / başlık / maske kafanın kendisi olur → kafa, başlık çiziminin boyutuna büyütülür
  const head = plain ? HEAD_FIT0 : fitHead(fi);
  const tb = atlas(fi, bi, build, false, false, head, head !== HEAD_FIT0);
  const tc = atlas(fi, bi, build, true, plain, head);
  const bodyMat = new THREE.MeshMatcapMaterial({ map: tb, matcap: matcap(), toneMapped: false });
  const card = new THREE.MeshMatcapMaterial({ map: tc, matcap: matcap(), toneMapped: false, alphaTest: 0.5 });
  return {
    build,
    shape: body,
    body: bodyMat,
    card,
    gear,
    gearKey: gear ? gear.key : '',
    head,
    headKey: [head.cx, head.cy, head.rx, head.ry].join(','),
    dispose() {
      tb.dispose();
      tc.dispose();
      bodyMat.dispose();
      card.dispose();
    },
  };
}

// --- saç, şapka, kulak (3D) --------------------------------------------------------
// Kostümsüz avatarlarda gövdeye SAÇSIZ + ŞAPKASIZ çizim giydirilir (avatar3DPlain), saç ve şapka
// buradaki gerçek 3D parçalardan gelir: avatarın kendi saç / şapka / ten renkleriyle.
// Geometri + renk birleşimi önbellekte; aynı saç / şapkayı taşıyan herkes paylaşır.
export const avatar3DPlain = (av) => ({ ...av, hairStyle: 'kel', hat: 'none' });
// Kostüm (look) giyen avatarda kafa çizimi kostümden gelir → saç / şapka modellenmez.
export const avatar3DUsesPlain = (av) => !av?.look;

const HR = [0.58, 0.66, 0.56]; // kafa yarıçapları (kafa yereli)
function shade(hex, p) {
  const f = parseInt(String(hex || '#000000').slice(1), 16);
  const t = p < 0 ? 0 : 255;
  const q = Math.abs(p) / 100;
  const R = f >> 16;
  const G = (f >> 8) & 255;
  const B = f & 255;
  return '#' + (0x1000000 + (Math.round((t - R) * q) + R) * 65536 + (Math.round((t - G) * q) + G) * 256 + (Math.round((t - B) * q) + B)).toString(16).slice(1);
}
export function gearOf(av) {
  const g = {
    hair: av?.hairStyle || 'short',
    hairColor: av?.hairColor || '#2b2118',
    hat: av?.acc?.head ? 'none' : av?.hat || 'none', // başlık aksesuarı şapkayı gizler (2D ile aynı)
    hatColor: av?.hatColor || '#0d0d0d',
    skin: av?.skin || '#c68863',
    earring: av?.earring || 'yok',
  };
  g.key = [g.hair, g.hairColor, g.hat, g.hatColor, g.skin, g.earring].join('|');
  return g;
}
const MATS = new Map();
function colorMat(c) {
  let m = MATS.get(c);
  if (!m) {
    m = new THREE.MeshMatcapMaterial({ color: c, matcap: matcap(), toneMapped: false, side: THREE.DoubleSide });
    MATS.set(c, m);
  }
  return m;
}
const SPH = (w = 14, h = 10) => new THREE.SphereGeometry(1, w, h);
const E = (p, s, r = [0, 0, 0], seg = [12, 9]) => SPH(...seg).applyMatrix4(mtx(p, s, r));
// Saç başlığı: kafayı saran küre, saç çizgisinin altı kesilir. Saç çizgisi önde yüksek (alın),
// yanlarda kulak üstünde, arkada ense hizasında: y = front → back (normalize, -1..1).
function hairCap(front, back, k = 1.07, sideDrop = 0.1) {
  // Saç çizgisini tam takip eden pürüzsüz yüzey: her açıda alt kenar saç çizgisinde başlar, tepede birleşir.
  const cols = 40;
  const rows = 10;
  const line = (a) => {
    const f = (1 - Math.cos(a)) / 2; // 0 ön, 1 arka
    return front + (back - front) * f - sideDrop * Math.sin(a) ** 2 * (1 - f);
  };
  const pos = [];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const h = line(a);
      const y = h + (1 - h) * (i / rows) ** 0.85;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos.push(Math.sin(a) * r * HR[0] * k, y * HR[1] * k, Math.cos(a) * r * HR[2] * k - 0.01);
    }
  }
  const idx = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 2;
      const d = a + cols + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const surfZ = (x, y, k = 1.07) => HR[2] * k * Math.sqrt(Math.max(0, 1 - (x / (HR[0] * k)) ** 2 - (y / (HR[1] * k)) ** 2));
// alındaki perçem tutamları: düz saç çizgisini kırar, daha doğal durur
function fringe(n, y, size = 1, k = 1.07, spread = 0.13) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i - (n - 1) / 2;
    const x = u * spread;
    const yy = y - Math.abs(u) * 0.03;
    out.push(E([x, yy, surfZ(x, yy, k) - 0.03], [0.12 * size, 0.085 * size, 0.07 * size], [-0.55, 0, u * 0.18]));
  }
  return out;
}
// kafanın üst yüzeyinde fibonacci dağılımlı bukleler
function clumps(n, r, k, yMin) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * (1 - yMin);
    const rad = Math.sqrt(1 - y * y);
    const th = i * 2.39996;
    const p = [Math.sin(th) * rad * HR[0] * k, y * HR[1] * k, Math.cos(th) * rad * HR[2] * k];
    if (p[2] > 0.3 && p[1] < 0.3) continue; // yüzün önüne düşmesin
    out.push(E(p, [r, r * 0.85, r]));
  }
  return out;
}

const HAT_COVERS = new Set(['helmet', 'hoodup', 'beanie', 'bandana']); // saçın üstünü tamamen örter
const HAT_TOP = new Set(['fedora', 'tophat', 'policecap', 'cap', 'beret', 'crown', 'kufi']); // tepedeki hacimli saçı keser

function hairGeos(st, hat) {
  const top = []; // başlık + tepe hacmi (şapka varsa kısmen gizlenir)
  const long = []; // omuza inen parçalar (her zaman)
  switch (st) {
    case 'kel':
      break;
    case 'short':
      top.push(hairCap(0.47, -0.55), ...fringe(5, 0.31));
      break;
    case 'slick':
      top.push(hairCap(0.5, -0.62, 1.06), E([0, 0.34, 0.42], [0.42, 0.1, 0.12], [-0.7, 0, 0]));
      break;
    case 'wavy':
      top.push(hairCap(0.42, -0.7, 1.1), ...fringe(4, 0.3, 1.35, 1.1, 0.17), ...clumps(9, 0.2, 1.08, 0.35));
      break;
    case 'long':
      top.push(hairCap(0.44, -0.75, 1.08, 0.25), ...fringe(5, 0.3));
      long.push(
        new RoundedBoxGeometry(1.06, 1.55, 0.22, 2, 0.1).applyMatrix4(mtx([0, -0.62, -0.38], [1, 1, 1], [0.08, 0, 0])),
        new THREE.CapsuleGeometry(0.12, 1.15, 3, 8).applyMatrix4(mtx([-0.54, -0.6, 0.0], [1, 1, 0.8], [0, 0, -0.06])),
        new THREE.CapsuleGeometry(0.12, 1.15, 3, 8).applyMatrix4(mtx([0.54, -0.6, 0.0], [1, 1, 0.8], [0, 0, 0.06]))
      );
      break;
    case 'mohawk': {
      top.push(E([0, 0.34, -0.06], [0.12, 0.62, 0.58], [0, 0, 0], [12, 12]));
      for (let i = 0; i < 7; i++) {
        const th = -0.55 + i * 0.4;
        const len = 0.5 - Math.abs(th - 0.2) * 0.16;
        const n = [0, Math.cos(th), -Math.sin(th)];
        const base = [0, n[1] * HR[1], n[2] * HR[2]];
        top.push(new THREE.ConeGeometry(0.1, len, 6).applyMatrix4(mtx([0, base[1] + n[1] * len * 0.42, base[2] + n[2] * len * 0.42], [0.8, 1, 1.4], [-th, 0, 0])));
      }
      break;
    }
    case 'afro':
      top.push(hairCap(0.45, -0.5, 1.08), E([0, 0.34, -0.22], [0.9, 0.82, 0.74], [0, 0, 0], [16, 12]));
      break;
    case 'bun':
      top.push(hairCap(0.47, -0.55, 1.06), E([0, 0.62, -0.32], [0.23, 0.22, 0.23]), new THREE.TorusGeometry(0.17, 0.04, 5, 12).applyMatrix4(mtx([0, 0.55, -0.27], [1, 1, 1], [1.0, 0, 0])));
      break;
    case 'braids':
      top.push(hairCap(0.44, -0.6, 1.07), ...fringe(4, 0.31));
      for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) long.push(E([sx * (0.5 - i * 0.008), -0.08 - i * 0.19, 0.02 + i * 0.012], [0.095, 0.11, 0.09], [0, 0, sx * 0.4]));
      break;
    case 'undercut':
      top.push(hairCap(0.62, 0.2, 1.05, 0), E([0.03, 0.56, 0.08], [0.44, 0.17, 0.48], [0.25, 0, -0.12]));
      break;
    case 'ponytail':
      top.push(hairCap(0.47, -0.42, 1.07), ...fringe(4, 0.31));
      long.push(E([0, 0.3, -0.62], [0.08, 0.08, 0.08]), new THREE.CapsuleGeometry(0.13, 0.75, 3, 8).applyMatrix4(mtx([0, -0.2, -0.74], [1, 1, 0.85], [0.22, 0, 0])));
      break;
    case 'curly':
      top.push(hairCap(0.44, -0.58, 1.06), ...clumps(18, 0.15, 1.1, 0.0), ...fringe(5, 0.3, 1.2));
      break;
    case 'pixie':
      top.push(hairCap(0.5, -0.38, 1.06), E([-0.1, 0.32, 0.48], [0.38, 0.11, 0.17], [-0.3, 0, 0.35]), E([0.55, 0.02, 0.16], [0.1, 0.22, 0.12], [0, 0, -0.15]));
      break;
    default:
      top.push(hairCap(0.47, -0.55), ...fringe(5, 0.31));
  }
  if (HAT_COVERS.has(hat)) return long; // tamamen örten başlık: sadece omuza inen saç görünür
  if (HAT_TOP.has(hat)) {
    // şapka tepeyi örter: sadece saç başlığının kenarı + perçem + uzun parçalar
    if (st === 'mohawk' || st === 'afro' || st === 'bun' || st === 'undercut') return [hairCap(0.47, -0.55, 1.06), ...long];
    return [...top.filter((g, i) => i === 0 || st !== 'curly' && st !== 'wavy'), ...long];
  }
  return [...top, ...long];
}

function hatGeos(hat, c) {
  const acc = shade(c, 60);
  const L = []; // [geo, renk]
  const add = (g, col = c) => L.push([g, col]);
  switch (hat) {
    case 'fedora':
      add(new THREE.CylinderGeometry(0.38, 0.47, 0.5, 18).applyMatrix4(mtx([0, 0.78, 0], [1, 1, 0.9])));
      add(E([0, 1.02, 0], [0.38, 0.06, 0.32], [0, 0, 0], [14, 6]));
      add(new THREE.CylinderGeometry(0.475, 0.48, 0.09, 18).applyMatrix4(mtx([0, 0.58, 0], [1, 1, 0.9])), acc);
      add(new THREE.CylinderGeometry(0.95, 0.95, 0.04, 26).applyMatrix4(mtx([0, 0.52, 0], [1, 1, 0.9])));
      break;
    case 'beret':
      add(E([-0.08, 0.6, 0.02], [0.66, 0.2, 0.62], [0, 0, 0.16], [18, 10]));
      add(E([0.12, 0.82, 0], [0.05, 0.06, 0.05]), acc);
      break;
    case 'bandana':
      add(hairCap(0.32, -0.2, 1.09, 0.05));
      add(E([0.05, 0.12, -0.63], [0.1, 0.09, 0.08]));
      add(new THREE.BoxGeometry(0.1, 0.38, 0.03).applyMatrix4(mtx([0.13, -0.08, -0.64], [1, 1, 1], [0.2, 0, 0.35])));
      add(new THREE.BoxGeometry(0.1, 0.32, 0.03).applyMatrix4(mtx([-0.03, -0.06, -0.65], [1, 1, 1], [0.2, 0, -0.25])));
      break;
    case 'cap': {
      add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).applyMatrix4(mtx([0, 0.3, -0.02], [0.63, 0.46, 0.61])));
      // siper: 2D'deki gibi biraz yana dönük
      const bill = new THREE.CylinderGeometry(0.34, 0.34, 0.035, 16, 1, false, -Math.PI / 2, Math.PI);
      add(bill.applyMatrix4(mtx([0.18, 0.31, 0.42], [1, 1, 1.1], [0.12, 0.55, 0])), acc);
      add(E([0, 0.76, -0.02], [0.05, 0.03, 0.05]), acc);
      break;
    }
    case 'crown': {
      const gold = '#d4af37';
      add(new THREE.CylinderGeometry(0.47, 0.44, 0.24, 18, 1, true).applyMatrix4(mtx([0, 0.6, 0])), gold);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.08, 0.26, 5).applyMatrix4(mtx([Math.sin(a) * 0.45, 0.84, Math.cos(a) * 0.45])), gold);
      }
      add(E([0, 0.62, 0.47], [0.06, 0.06, 0.04]), '#ff2e88');
      break;
    }
    case 'tophat':
      add(new THREE.CylinderGeometry(0.82, 0.82, 0.04, 26).applyMatrix4(mtx([0, 0.5, 0], [1, 1, 0.9])));
      add(new THREE.CylinderGeometry(0.4, 0.38, 0.8, 18).applyMatrix4(mtx([0, 0.9, 0], [1, 1, 0.9])));
      add(new THREE.CylinderGeometry(0.39, 0.39, 0.13, 18).applyMatrix4(mtx([0, 0.6, 0], [1, 1, 0.9])), acc);
      break;
    case 'hoodup': {
      // kapüşon: yüzü açık bırakan büyük kabuk
      const g = keepTris(new THREE.SphereGeometry(1, 24, 18).toNonIndexed(), (x, y, z) => !(z > 0.35 && y < 0.55 && Math.abs(x) < 0.78));
      add(g.applyMatrix4(mtx([0, 0.06, -0.04], [0.78, 0.84, 0.76])));
      break;
    }
    case 'helmet':
      add(new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62).applyMatrix4(mtx([0, 0.08, -0.02], [0.72, 0.8, 0.72])));
      add(new THREE.SphereGeometry(1, 18, 6, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.42, Math.PI * 0.2).applyMatrix4(mtx([0, 0.08, 0], [0.74, 0.8, 0.75])), '#9fd8f0');
      add(new THREE.BoxGeometry(0.16, 0.06, 0.9).applyMatrix4(mtx([0, 0.86, -0.05])), acc);
      break;
    case 'policecap':
      add(new THREE.CylinderGeometry(0.56, 0.46, 0.3, 18).applyMatrix4(mtx([0, 0.62, -0.02], [1, 1, 0.95])), '#1d3557');
      add(new THREE.CylinderGeometry(0.47, 0.47, 0.1, 18).applyMatrix4(mtx([0, 0.5, -0.02], [1, 1, 0.95])), '#14263f');
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 16, 1, false, -Math.PI / 2, Math.PI).applyMatrix4(mtx([0, 0.46, 0.4], [1, 1, 0.8], [0.2, 0, 0])), '#0d0d0d');
      add(E([0, 0.66, 0.52], [0.07, 0.07, 0.03]), '#d4af37');
      break;
    case 'beanie':
      add(hairCap(0.2, -0.15, 1.1, 0.05));
      add(new THREE.TorusGeometry(1, 0.12, 6, 24).applyMatrix4(mtx([0, 0.16, -0.01], [0.65, 0.62, 0.63], [Math.PI / 2, 0, 0])), acc);
      add(E([0, 0.78, -0.02], [0.1, 0.1, 0.1]), acc);
      break;
    case 'headband':
      add(new THREE.TorusGeometry(1, 0.07, 6, 26).applyMatrix4(mtx([0, 0.3, -0.01], [0.64, 0.6, 0.62], [Math.PI / 2 - 0.2, 0, 0])));
      add(E([0, 0.38, 0.6], [0.06, 0.06, 0.04]), acc);
      break;
    case 'kufi':
      add(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).applyMatrix4(mtx([0, 0.02, -0.02], [0.64, 0.72, 0.62])));
      break;
    default:
      break;
  }
  return L;
}

const GEAR = new Map();
function gearParts(g) {
  let out = GEAR.get(g.key);
  if (out) return out;
  const byColor = new Map();
  const put = (geo, col) => {
    if (!byColor.has(col)) byColor.set(col, []);
    const ng = geo.index ? geo.toNonIndexed() : geo;
    if (ng !== geo) geo.dispose();
    ng.deleteAttribute('uv');
    byColor.get(col).push(ng);
  };
  hairGeos(g.hair, g.hat).forEach((geo) => put(geo, g.hairColor));
  hatGeos(g.hat, g.hatColor).forEach(([geo, col]) => put(geo, col));
  // kulaklar + küpeler (uzun saç, afro, kapüşon ve kask kulağı örter)
  const earsHidden = g.hair === 'long' || g.hair === 'afro' || g.hat === 'hoodup' || g.hat === 'helmet';
  for (const sx of earsHidden ? [] : [-1, 1]) {
    put(E([sx * 0.57, -0.06, -0.02], [0.08, 0.14, 0.09]), g.skin);
    put(E([sx * 0.6, -0.06, 0.01], [0.03, 0.08, 0.04]), shade(g.skin, -18));
    if (g.earring === 'cift' || (g.earring === 'sol' && sx < 0) || (g.earring === 'sag' && sx > 0)) put(E([sx * 0.6, -0.22, 0.02], [0.035, 0.035, 0.035], [0, 0, 0], [8, 6]), '#d4af37');
  }
  out = [...byColor].map(([color, list]) => ({ color, geo: merge(list) }));
  GEAR.set(g.key, out);
  return out;
}

// --- model ----------------------------------------------------------------------
export class Avatar3D {
  constructor(look) {
    const P = parts(look.build, look.shape);
    this.root = new THREE.Group();
    this.root.scale.setScalar(MODEL_SCALE);
    this.baseScale = MODEL_SCALE;
    this.upper = new THREE.Group();
    this.root.add(this.upper);
    this.meshes = [];
    const mk = (geo, mat, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.userData.avatar3d = true;
      parent.add(m);
      this.meshes.push(m);
      return m;
    };
    mk(P.upper, look.body, this.upper);
    this.head = new THREE.Group();
    this.head.position.y = HEAD_Y;
    this.upper.add(this.head);
    mk(look.headKey === HEAD_KEY0 ? P.head : headGeo(look.head), look.body, this.head);
    mk(P.card, look.card, this.upper);
    if (look.gear) for (const g of gearParts(look.gear)) mk(g.geo, colorMat(g.color), this.head).userData.gear = true;
    this.arms = P.arms.map((a) => {
      const sh = new THREE.Group();
      sh.position.set(...a.pos);
      sh.rotation.z = a.sx * 0.08;
      this.upper.add(sh);
      mk(a.upperArm, look.body, sh);
      const el = new THREE.Group();
      el.position.y = -0.58;
      el.rotation.x = -0.12;
      sh.add(el);
      mk(a.foreArm, look.body, el);
      return { sh, el, sx: a.sx };
    });
    // v213: eldeki eşyanın tutma noktası (karakterin sol eli — 2D çizimdeki taraf); avucun biraz önü
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.74, 0.13);
    this.arms[1].el.add(this.hand);
    this.legs = P.legs.map((l) => {
      const pv = new THREE.Group();
      pv.position.set(...l.pos);
      this.root.add(pv);
      mk(l.thigh, look.body, pv);
      const knee = new THREE.Group();
      knee.position.y = -KNEE;
      pv.add(knee);
      mk(l.shin, look.body, knee);
      return { hip: pv, knee };
    });
    this.root.rotation.order = 'YXZ';
    this.kSit = 0;
    this.kSwim = 0;
    this.kTread = 0;
    this.look = look;
    this.handX = P.arms[1].pos[0] * MODEL_SCALE;
  }
  setLook(look) {
    if (look === this.look) return true;
    // vücut yapısı / saç / şapka / kabuk değişti → yeniden kur
    if (look.build !== this.look.build || look.shape !== this.look.shape || look.gearKey !== this.look.gearKey || look.headKey !== this.look.headKey) return false;
    this.meshes.forEach((m) => {
      if (m.userData.gear) return;
      m.material = m.material === this.look.card ? look.card : look.body;
    });
    this.look = look;
    return true;
  }
  // o: { dt, t, walkT, walk, sit, drive, swim, tread, tilt, hold, emote: { kind, e } }
  //   sit: oturuyor · swim: suda ilerliyor (yatay kulaç) · tread: suda duruyor (ayak çırpma)
  //   emote: dans / zipla / selam / alkis / kalp (e = başlangıçtan beri geçen saniye)
  pose(o) {
    // dt = 0: tek karelik çizim (fotoğraf) → pozlar geçişsiz, doğrudan son hallerinde
    const snap = !(o.dt > 0);
    const dt = Math.min(o.dt || 0.016, 0.1);
    const t = o.t;
    const ease = (k, want, rate) => (snap ? (want ? 1 : 0) : k + ((want ? 1 : 0) - k) * Math.min(1, dt * rate));
    this.kSit = ease(this.kSit, o.sit, 9);
    this.kSwim = ease(this.kSwim, o.swim, 5);
    this.kTread = ease(this.kTread, o.tread, 5);
    const L = this.legs;
    const A = this.arms;
    // --- temel: duruş / yürüyüş ---
    const ph = o.walkT * 7;
    const s = o.walk ? Math.sin(ph) : 0;
    const leg = L.map((_, i) => ({ x: (i ? -s : s) * 0.45, k: o.walk ? Math.max(0, -Math.cos(ph + i * Math.PI)) * 0.7 : 0 }));
    const arm = A.map((a, i) => {
      const sw = (i ? s : -s) * 0.42;
      return { x: o.walk ? sw : Math.sin(t * 1.8 + i) * 0.03, z: a.sx * 0.08, ex: o.walk ? -0.18 - Math.max(0, -sw) * 0.6 : -0.12, ez: 0 };
    });
    let bob = o.walk ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 1.8) * 0.012;
    let roll = o.tilt || 0;
    let twist = 0;
    const mix = (a, b, k) => a + (b - a) * k;

    // --- emote ---
    const em = o.emote;
    if (em && !o.sit && this.kSwim < 0.3 && this.kTread < 0.3) {
      const e = em.e;
      const w = Math.min(1, e / 0.2) * Math.min(1, Math.max(0, (3.2 - e) / 0.3));
      const set = (i, x, z, ex, ez = 0) => {
        arm[i].x = mix(arm[i].x, x, w);
        arm[i].z = mix(arm[i].z, z, w);
        arm[i].ex = mix(arm[i].ex, ex, w);
        arm[i].ez = mix(arm[i].ez, ez, w);
      };
      if (em.kind === 'selam') {
        // sağ el havada sallanır
        set(0, -0.15, -2.55, -0.25, Math.sin(e * 12) * 0.5);
        roll = Math.sin(e * 6) * 0.03 * w;
      } else if (em.kind === 'alkis') {
        const c = Math.abs(Math.sin(e * 14));
        A.forEach((a, i) => set(i, -1.15, -a.sx * (0.12 + 0.18 * c), -0.6));
      } else if (em.kind === 'dans') {
        A.forEach((a, i) => {
          const q = Math.sin(e * 8 + i * Math.PI);
          set(i, -0.3 + q * 0.3, a.sx * (1.7 + q * 0.55), -0.5 - Math.max(0, q) * 0.6);
        });
        L.forEach((_, i) => {
          const q = Math.sin(e * 8 + i * Math.PI);
          leg[i].x = mix(leg[i].x, -Math.max(0, q) * 0.5, w);
          leg[i].k = mix(leg[i].k, Math.max(0, q) * 0.8, w);
        });
        roll = Math.sin(e * 8) * 0.13 * w;
        twist = Math.sin(e * 4) * 0.45 * w;
        bob = mix(bob, Math.abs(Math.sin(e * 8)) * 0.08, w);
      } else if (em.kind === 'zipla') {
        const up = Math.abs(Math.sin(e * 6));
        A.forEach((a, i) => set(i, -0.2, a.sx * (0.6 + 1.9 * up), -0.2));
        L.forEach((_, i) => {
          leg[i].x = mix(leg[i].x, -0.45 * up, w);
          leg[i].k = mix(leg[i].k, 0.9 * up, w);
        });
      } else if (em.kind === 'kalp') {
        // eller göğüste
        A.forEach((a, i) => set(i, -0.55, -a.sx * 0.5, -2.25));
        roll = Math.sin(e * 3) * 0.05 * w;
      }
    }

    // --- elde yiyecek / içecek: kol önde bükük, yürürken sallanmaz (hafif yaylanır);
    //     her ~7 sn'de bir ağza götürülür (ısırma / yudum) ---
    if (o.hold && !em && this.kSwim < 0.5 && this.kTread < 0.5) {
      const a = A[1];
      const cyc = (t + 2.1) % 7;
      const bite = cyc < 1.3 ? Math.sin((cyc / 1.3) * Math.PI) : 0;
      const sway = o.walk ? Math.sin(ph * 2) * 0.05 : Math.sin(t * 1.8) * 0.02;
      arm[1].x = -0.38 - bite * 0.5 + sway;
      arm[1].z = a.sx * (0.1 - bite * 0.95);
      arm[1].ex = -1.28 - bite * 1.12;
      arm[1].ez = 0;
    }
    // --- oturma: uyluk öne, baldır aşağı, eller dizlerde ---
    if (this.kSit > 0.001) {
      const k = this.kSit;
      L.forEach((_, i) => {
        leg[i].x = mix(leg[i].x, -1.5, k);
        leg[i].k = mix(leg[i].k, 1.5, k);
      });
      A.forEach((a, i) => {
        if (o.hold && i === 1 && !o.drive) return; // elde yiyecek varken o kol dizde değil
        arm[i].x = mix(arm[i].x, -0.42, k);
        arm[i].z = mix(arm[i].z, a.sx * 0.12, k);
        arm[i].ex = mix(arm[i].ex, -0.6, k);
      });
      bob *= 1 - k;
    }
    // --- araçta: eller direksiyonda / gidonda ---
    if (o.drive && this.kSit > 0.001) {
      const k = this.kSit;
      A.forEach((a, i) => {
        arm[i].x = mix(arm[i].x, -1.05, k);
        arm[i].z = mix(arm[i].z, -a.sx * 0.14, k);
        arm[i].ex = mix(arm[i].ex, -0.4, k);
      });
    }
    // --- suda durma: ayak çırpma + kollar yanlarda kürek ---
    if (this.kTread > 0.001) {
      const k = this.kTread;
      L.forEach((_, i) => {
        leg[i].x = mix(leg[i].x, Math.sin(t * 3 + i * Math.PI) * 0.35, k);
        leg[i].k = mix(leg[i].k, 0.5 + Math.sin(t * 3 + i * Math.PI) * 0.3, k);
      });
      A.forEach((a, i) => {
        arm[i].x = mix(arm[i].x, Math.sin(t * 4 + i) * 0.25, k);
        arm[i].z = mix(arm[i].z, a.sx * (0.95 + Math.sin(t * 4) * 0.3), k);
        arm[i].ex = mix(arm[i].ex, -0.35, k);
      });
      bob = mix(bob, Math.sin(t * 2.2) * 0.06, k);
    }
    // --- yüzme: gövde yatay, serbest stil kulaç, ayak çırpma ---
    const sk = this.kSwim;
    if (sk > 0.001) {
      L.forEach((_, i) => {
        leg[i].x = mix(leg[i].x, Math.sin(t * 11 + i * Math.PI) * 0.3, sk);
        leg[i].k = mix(leg[i].k, 0.15 + Math.max(0, Math.sin(t * 11 + i * Math.PI)) * 0.3, sk);
      });
      A.forEach((a, i) => {
        // kol tam tur atar (açı sürekli artar); geçişte karışmasın diye yarıdan sonra doğrudan
        const stroke = -((t * 4.2 + i * Math.PI) % (Math.PI * 2));
        arm[i].x = sk > 0.5 ? stroke : mix(arm[i].x, -0.2, sk);
        arm[i].z = mix(arm[i].z, a.sx * 0.18, sk);
        arm[i].ex = mix(arm[i].ex, -0.15, sk);
      });
      roll = mix(roll, Math.sin(t * 4.2) * 0.25, sk);
      bob *= 1 - sk;
    }
    this.root.rotation.x = sk * 1.32;

    L.forEach((l, i) => {
      l.hip.rotation.x = leg[i].x;
      l.knee.rotation.x = leg[i].k;
    });
    A.forEach((a, i) => {
      a.sh.rotation.x = arm[i].x;
      a.sh.rotation.z = arm[i].z;
      a.el.rotation.x = arm[i].ex;
      a.el.rotation.z = arm[i].ez;
    });
    this.upper.position.y = bob;
    this.upper.rotation.z = roll;
    this.upper.rotation.y = twist;
  }
  dispose() {
    this.root.removeFromParent();
    // geometri ve malzemeler paylaşımlı: burada silinmez
  }
}
