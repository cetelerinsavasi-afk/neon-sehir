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
const CHIN_Y = 3.12; // çene hizası (model birimi) — kafa tipi ne olursa olsun çene boyunda durur
// v214 — avatar tipleri: kafa boyu / şekli, boyun, bacak boyu. Prototipte karşılaştırılır,
// oyunda bir tanesi varsayılan yapılır (setAvatar3DStyle).
export const AVATAR_STYLES = {
  klasik: { name: 'Klasik (şimdiki)', s: 1, rx: 1, ry: 1, rz: 1, taper: 0, flat: 1, box: false, legs: 1, neck: 0 },
  dengeli: { name: 'Dengeli', s: 0.84, rx: 0.95, ry: 1.03, rz: 0.92, taper: 0.26, flat: 0.88, box: false, legs: 1.06, neck: 0.04 },
  gercekci: { name: 'Gerçekçi', s: 0.72, rx: 0.88, ry: 1.1, rz: 0.9, taper: 0.32, flat: 0.86, box: false, legs: 1.15, neck: 0.1 },
  koseli: { name: 'Köşeli', s: 0.84, rx: 0.98, ry: 1.0, rz: 0.9, taper: 0.14, flat: 1, box: true, legs: 1.06, neck: 0.04 },
  uzun: { name: 'Uzun oval', s: 0.8, rx: 0.84, ry: 1.16, rz: 0.88, taper: 0.18, flat: 0.9, box: false, legs: 1.09, neck: 0.06 },
  // v216 — Dengeli + çene: görünüm aynı (saç, yüz, gövde, gölge), sadece kafa–boyun bağlantısı düzeltildi.
  //   jaw: çene öne-aşağı çıkar, çene hattı (kulak altı) geniş kalır · nape: kafatasının arka-altı düzleşir
  //   hz: kafa boynun biraz önünde · nk: boyun (kısalık, geriye kayma, öne eğim, kalınlık)
  cene: { name: 'Dengeli + çene', s: 0.84, rx: 0.95, ry: 1.03, rz: 0.92, taper: 0.26, flat: 0.88, box: false, legs: 1.06, neck: -0.06, jaw: 1, nape: 1, hz: 0.01, nk: { z: -0.02, tilt: 0.04, r: 1.12 } }, // v220: dik duruş (kafa öne, boyun eğik → kambur görünüyordu)
  cene2: { name: 'Çene + kısa boyun', s: 0.86, rx: 0.95, ry: 1.03, rz: 0.92, taper: 0.26, flat: 0.88, box: false, legs: 1.06, neck: -0.13, jaw: 1.25, nape: 1, hz: 0.06, nk: { z: -0.08, tilt: 0.22, r: 1.2 } },
};
let STYLE_ID = 'cene'; // v218: oyunun avatar tipi (Dengeli + çene). Geri almak için 'dengeli'
export function setAvatar3DStyle(id) {
  if (AVATAR_STYLES[id]) STYLE_ID = id;
}
export const getAvatar3DStyle = () => STYLE_ID;
// v218 — KAFA TİPİ (avatar.faceShape, düzenleyicide "Kafa Tipi"): 3D kafanın şekli. Eskiden sadece 2D
// çizimi değiştiriyordu, 3D kafa hep aynı küreydi. Yeni alan yok — mevcut seçim kullanılır.
// Çarpanlar oyunun tipinin (STYLE_ID) üstüne uygulanır; saç / şapka kafayla birlikte şekil alır.
//   rx / ry / rz / taper / jaw: çarpan · sq: köşeli çene hattı · dia: elmacık kemiği (geniş orta, dar tepe)
export const FACE_3D = {
  oval: {},
  round: { rx: 1.06, ry: 0.94, rz: 1.03, taper: 0.4, jaw: 0.55 },
  square: { rx: 1.04, ry: 0.98, taper: 0.15, jaw: 1.2, sq: 0.24 },
  heart: { rx: 1.08, ry: 1.02, taper: 1.75, jaw: 1.1 },
  long: { rx: 0.91, ry: 1.12, rz: 0.97, taper: 0.9 },
  diamond: { rx: 1.02, taper: 1.3, dia: 0.3 },
};
const faceOf = (av) => (FACE_3D[av?.faceShape] ? av.faceShape : 'oval');
const STF = new Map();
// oyunun tipi + kafa tipi → birleşik şekil (önbellekli)
function styleFace(face = 'oval', sid = STYLE_ID) {
  const k = sid + '/' + face;
  let r = STF.get(k);
  if (r) return r;
  const st = AVATAR_STYLES[sid] || AVATAR_STYLES.klasik;
  const m = FACE_3D[face] || {};
  r = { ...st, key: k, rx: st.rx * (m.rx ?? 1), ry: st.ry * (m.ry ?? 1), rz: st.rz * (m.rz ?? 1), taper: st.taper * (m.taper ?? 1), jaw: (st.jaw || 0) * (m.jaw ?? 1), sq: m.sq || 0, dia: m.dia || 0 };
  STF.set(k, r);
  return r;
}
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
  // v218: her köşede hem ön hem arka resim koordinatı (auv = önU, önV, arkaU, arkaV): gölgelendirici
  // yan yüzlerde ikisini yumuşakça karıştırır (eskiden yanda keskin "yama" sınırı vardı)
  const auv = new Float32Array(n * 4);
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
      // ön resim: ön yüzdeki eşleme · arka resim: aynalı (arkadan bakış)
      const fx = back && !sv.pt ? SW - sx : sx;
      const o = (t + k) * 4;
      auv[o] = (fx / SW) * 0.5;
      auv[o + 1] = 1 - sy / SH;
      auv[o + 2] = sv.pt ? auv[o] : ((SW - fx) / SW) * 0.5 + 0.5;
      auv[o + 3] = 1 - sy / SH;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('auv', new THREE.BufferAttribute(auv, 4));
  return g;
}
// v218: gövde malzemesi — ön / arka resim yüzey yönüne göre yumuşak karışır (yan yüzde yama sınırı yok)
const BLEND_W = '0.22';
function blendMat(map) {
  const m = new THREE.MeshMatcapMaterial({ map, matcap: matcap(), toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute vec4 auv;\nvarying vec4 vAuv;\nvarying float vNz;\nvoid main() {')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvAuv = auv;\n\tvNz = normal.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'varying vec4 vAuv;\nvarying float vNz;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `float bw = smoothstep(-${BLEND_W}, ${BLEND_W}, vNz);
\tdiffuseColor *= mix(texture2D(map, vAuv.zw), texture2D(map, vAuv.xy), bw);`
      );
  };
  m.customProgramCacheKey = () => 'av-blend';
  return m;
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
function parts(build, body, nk = null) {
  const pk = build + '|' + body + (nk ? '|' + nk.z + ',' + nk.tilt + ',' + nk.r : '');
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
    nk
      ? // boyun omuzdan kafatasının arka-altına doğru hafif öne eğik çıkar (dimdik çubuk değil)
        bake(new THREE.CylinderGeometry(0.19 * nk.r, 0.23 * nk.r, 0.6, 10), mtx([0, 3.0, nk.z], [1, 1, 1], [nk.tilt, 0, 0]), { x0: -0.21 * nk.r, x1: 0.21 * nk.r, y0: 2.7, y1: 3.3 }, { x0: 140, x1: 180, y0: 222, y1: 274 })
      : bake(new THREE.CylinderGeometry(0.19, 0.21, 0.6, 10), mtx([0, 3.0, 0]), { x0: -0.21, x1: 0.21, y0: 2.7, y1: 3.3 }, { x0: 140, x1: 180, y0: 222, y1: 274 }),
  ]);
  out.head = merge([bake(sph, mtx([0, 0, 0], [0.58, 0.66, 0.56]), { x0: -0.58, x1: 0.58, y0: -0.66, y1: 0.66 }, HEAD_SVG)]);
  // v214 — kartlar ikiye ayrıldı:
  //  • gövde kartı (çene altı): SADECE kostümün arka katmanı (pelerin, kanat). Sırtın arkasında,
  //    yanlara doğru hafif kıvrık (pelerin sırtı sarar). Eller / eşyalar / pantolon kenarı yok.
  //  • kafa kartı (çene üstü): şapka kenarı, yüzgeç, boynuz, kulak… kafaya bağlı, kafayla büyür/küçülür.
  // v218: kart sırtın ARKASINDA (pelerin / kanat sırta takılı; eskiden gövdenin içindeydi, sırtta görünmüyordu)
  const cardZ = -D / 2 - 0.09;
  const bodyBox = { x0: -1.6, x1: 1.6, y0: -0.32, y1: CHIN_Y };
  const bodyS = { x0: 0, x1: SW, y0: 236, y1: SH };
  const curve = (g, z0, dir) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, z0 - dir * 0.26 * (p.getX(i) / 1.6) ** 2);
    g.computeVertexNormals();
    return g;
  };
  const plB = () => new THREE.PlaneGeometry(3.2, CHIN_Y + 0.32, 24, 1).translate(0, (CHIN_Y - 0.32) / 2, 0);
  const pf = curve(plB(), cardZ, 1);
  const pb = curve(plB().rotateY(Math.PI), cardZ - 0.002, 1);
  out.cardBody = merge([bake(pf, new THREE.Matrix4(), bodyBox, bodyS), bake(pb, new THREE.Matrix4(), bodyBox, bodyS)]);
  pf.dispose();
  pb.dispose();
  const headBox = { x0: -1.6, x1: 1.6, y0: CHIN_Y - HEAD_Y, y1: 5.48 - HEAD_Y };
  const headS = { x0: 0, x1: SW, y0: 0, y1: 236 };
  const plH = new THREE.PlaneGeometry(3.2, 5.48 - CHIN_Y).translate(0, (5.48 + CHIN_Y) / 2 - HEAD_Y, 0);
  out.cardHead = merge([bake(plH, mtx([0, 0, -0.1]), headBox, headS), bake(plH, mtx([0, 0, -0.102], [1, 1, 1], [0, Math.PI, 0]), headBox, headS)]);
  plH.dispose();

  // v218 — kostüm SAÇ KARTI (uzun saç kafanın ve sırtın ARKASINDA): çene üstü kafaya bağlı (kafayla büyür),
  // çene altı gövdeye bağlı, sırtın hemen arkasında; yanlara doğru öne kıvrılır (omuzları / kafayı sarar).
  // Doku tek yüzlü önden resim (u = x / SW); arkadan bakınca aynı resim aynalı görünür (doğru taraf).
  const hairPlane = (y0, y1, sy0, sy1, segY, zf) => {
    const g = new THREE.PlaneGeometry(3.2, y1 - y0, 24, segY).translate(0, (y0 + y1) / 2, 0);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, zf(x, y));
      uv.setXY(i, (x + 1.6) / 3.2, 1 - (sy0 + ((y1 - y) / (y1 - y0)) * (sy1 - sy0)) / SH);
    }
    g.computeVertexNormals();
    g.userData.noSlim = true;
    return g;
  };
  const backZ = -D / 2 - 0.05;
  out.hairBody = hairPlane(-0.32, CHIN_Y, 236, SH, 6, (x) => backZ + 0.32 * Math.min(1, (x / 1.25) ** 2));
  out.hairHead = hairPlane(CHIN_Y - HEAD_Y, 5.48 - HEAD_Y, 0, 236, 6, (x) => -0.56 + 0.42 * Math.min(1, (x / 0.95) ** 2));

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
  PARTS[pk] = out;
  return out;
}

// --- dokular -------------------------------------------------------------------
// Kart dokusunda gövdeyle örtüşen bölgeler silinir: sadece taşan parçalar kalır.
function eraseHead(x, head, ears) {
  x.beginPath();
  // kafa çizgisi (kontur) de silinir: kartta kalırsa yandan bakınca yüzün yanında ince bir çizgi gibi havada durur
  x.ellipse(head.cx, head.cy, head.rx + 5, head.ry + 5, 0, 0, Math.PI * 2);
  x.fill();
  if (ears) {
    // kulaklar (ve küpeler) 3D modelleniyor
    x.beginPath();
    x.ellipse(101, 180, 13, 20, 0, 0, Math.PI * 2);
    x.ellipse(219, 180, 13, 20, 0, 0, Math.PI * 2);
    x.fill();
  }
}
// v215 — kartta kalan ince çizgi ve noktalar (kolye ipi, kontur artığı, toz) silinir: alfa kanalına
// "açma" (önce aşındır, sonra genişlet) uygulanır; pelerin, kanat, şapka kenarı gibi dolu parçalar kalır.
function dropThin(x, w, h, r) {
  let d;
  try {
    d = x.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const px = d.data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  const pass = (src, horiz, op) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        let v = op;
        for (let k = -r; k <= r && v === op; k++) {
          const sx = horiz ? xx + k : xx;
          const sy = horiz ? y : y + k;
          const s = sx < 0 || sy < 0 || sx >= w || sy >= h ? 0 : src[sy * w + sx];
          if (s !== op) v = s;
        }
        out[y * w + xx] = v;
      }
    }
    return out;
  };
  // aşındır (1 → hepsi 1 ise 1), genişlet (0 → hepsi 0 ise 0)
  const open = pass(pass(pass(pass(a, true, 1), false, 1), true, 0), false, 0);
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && !open[i]) {
      px[i * 4 + 3] = 0;
      n++;
    }
  }
  if (n) x.putImageData(d, 0, 0);
}
// v214 — kart dokusu: çene üstü tam çizimden (kafa silinir), çene altı SADECE arka katmandan
function cardAtlas(front, back, backOnly, head, ears) {
  const w = front.width;
  const h = front.height;
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h;
  const x = c.getContext('2d');
  const top = Math.round(h * (236 / SH));
  for (const [img, side] of [[front, 0], [back, 1]]) {
    const ox = side * w;
    if (backOnly) {
      x.save();
      x.beginPath();
      x.rect(ox, top, w, h - top);
      x.clip();
      x.drawImage(backOnly, ox, 0, w, h);
      x.restore();
    }
    x.save();
    x.beginPath();
    x.rect(ox, 0, w, top);
    x.clip();
    x.drawImage(img, ox, 0, w, h);
    x.globalCompositeOperation = 'destination-out';
    x.translate(ox, 0);
    x.scale(w / SW, h / SH);
    eraseHead(x, head, ears);
    x.restore();
  }
  dropThin(x, c.width, c.height, Math.max(1, Math.round((2.5 * w) / SW)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    // v218: 46 / 64 eklendi — kostümde arka katman çizilmeyince omuz / kol bölgesi daha geniş boş kalabiliyor (siyah leke)
    for (const d of [2, 4, 7, 11, 16, 23, 32, 46, 64]) {
      for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) {
        x.drawImage(front, ox, oy, w, h);
        x.drawImage(back, w + ox, oy, w, h);
      }
    }
    x.globalCompositeOperation = 'source-over';
  }
  if (erase) {
    // (v214: kart artık cardAtlas ile çiziliyor)
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
// v215 — kafa şekli (çeneye daralma + yüz düzlüğü) dokudan SONRA uygulanır: 2D kafa elipsinin tamamı
// (sakal, çene, yanaklar) kafa yüzeyine biner, kart üzerinde kafadan kopuk parça / boşluk kalmaz.
// Aynı dönüşüm saç / şapka / kulağa da uygulanır → saç ve kulaklar yüze yapışık kalır.
function shapeHead(g, st, cy, rx, ry, rz) {
  if (!st.taper && st.flat === 1 && !st.jaw && !st.sq && !st.dia) return g;
  const jaw = st.jaw || 0;
  const nape = st.nape || 0;
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const uy = (p.getY(i) - cy) / ry;
    let sx = 1;
    let sz = 1;
    let dy = 0;
    let dz = 0;
    if (uy < 0) {
      const k = Math.pow(Math.min(1.25, -uy), 1.4);
      // çeneli tipte daralma önde (çene ucu) güçlü, arkada (çene köşesi / kulak altı) zayıf
      const uz0 = Math.max(-1, Math.min(1, p.getZ(i) / rz));
      const tf = jaw ? 0.55 + 0.45 * Math.max(0, uz0) : 1;
      sx = 1 - st.taper * k * tf;
      sz = 1 - st.taper * 0.45 * k;
      if (jaw) {
        const ux = Math.min(1, Math.abs(p.getX(i) / rx));
        const m = Math.min(1, -uy) ** 1.6;
        const fr = Math.max(0, uz0);
        // çene: ön-alt bölge öne ve aşağı çıkar (ortada en çok)
        const w = m * fr * fr * (1 - 0.55 * ux * ux);
        dy -= jaw * 0.13 * ry * w;
        dz += jaw * 0.2 * rz * w;
        // çene altı: yüzden boyuna düz bir hat (yumurta gibi yuvarlak dip yerine)
        const bk = Math.max(0, -uz0);
        if (nape) dy += nape * 0.26 * ry * m * m * bk;
        // çene altı düz: en alttaki noktalar (çene ucu hariç) yukarı toplanır
        if (uy < -0.75 && fr < 0.6) dy += (-uy - 0.75) * 0.35 * ry * (1 - fr / 0.6) * Math.max(jaw, nape) * 0.6;
      }
    }
    if (st.dia) {
      // elmacık: orta bant geniş, tepe dar
      sx *= 1 + st.dia * 0.4 * Math.max(0, 1 - Math.abs(uy) * 2);
      if (uy > 0) sx *= 1 - st.dia * uy * uy * 1.1;
    }
    if (st.sq) {
      // köşeli: yatay kesit kareye yaklaşır (çene hattında en çok)
      const ux = p.getX(i) / rx;
      const uz = p.getZ(i) / rz;
      const f = 1 + st.sq * Math.min(1, 4 * (ux * uz) ** 2) * (uy < 0.2 ? 1 : 0.55);
      sx *= f;
      sz *= f;
    }
    if (p.getZ(i) > 0) sz *= st.flat;
    p.setXYZ(i, p.getX(i) * sx, p.getY(i) + dy, p.getZ(i) * sz + dz);
    // yumuşak normal korunur (yeniden hesaplanırsa indekssiz geometride basamaklı gölge olur)
    if (n) {
      v.set(n.getX(i) / sx, n.getY(i), n.getZ(i) / sz).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  p.needsUpdate = true;
  if (n) n.needsUpdate = true;
  return g;
}
const HEADS = new Map();
function headGeo(f, st = styleFace()) {
  const key = [f.cx, f.cy, f.rx, f.ry, st.key].join(',');
  let g = HEADS.get(key);
  if (g) return g;
  const rx = (f.rx / 100) * st.rx;
  const ry = (f.ry / 100) * st.ry;
  const rz = Math.max(0.56, Math.min(0.8, (f.rx / 100) * 0.95)) * st.rz;
  const dy = (170 - f.cy) / 100;
  // birim kafa: küre ya da yuvarlatılmış küp; çeneye doğru daralır (taper), yüz biraz düzleşir (flat)
  const base = st.box ? new RoundedBoxGeometry(2, 2, 2, 4, 0.62) : new THREE.SphereGeometry(1, 24, 18);
  g = merge([shapeHead(bake(base, mtx([0, dy * st.ry, 0], [rx, ry, rz]), { x0: -rx, x1: rx, y0: dy * st.ry - ry, y1: dy * st.ry + ry }, { x0: f.cx - f.rx, x1: f.cx + f.rx, y0: f.cy - f.ry, y1: f.cy + f.ry }), st, dy * st.ry, rx, ry, rz)]);
  base.dispose();
  HEADS.set(key, g);
  return g;
}

// v218 — ŞAPKALI KOSTÜMLER: şapka 3D modellenir (eskiden kafaya boyanıyordu, kenarı düz karttı; arkadan
// saç gibi duruyordu). Kafa normal boyda kalır, kafa kartı (düz şapka kenarı) çizilmez. Renk kostümün
// kendi çiziminden okunur (at: SVG noktası) → oyuncu kostümü boyadıysa şapka da o renkte.
export const LOOK_3D = {
  kovboy: { hat: 'cowboy', at: [160, 96] },
  sihirbaz: { hat: 'tophat', at: [160, 70] },
  mafyababasi: { hat: 'fedora', at: [160, 100] },
  colkasifi: { hat: 'pith', at: [160, 96] },
  korsankaptan: { hat: 'tricorn', at: [160, 100] },
  yildizbuyucusu: { hat: 'wizard', at: [160, 80] },
  cadi: { hat: 'wizard', at: [160, 76] },
  astronot: { hat: 'bubble', at: [112, 120], fixed: '#e9eef5' },
};
function samplePx(img, [sx, sy], fallback) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, (sx / SW) * img.width, (sy / SH) * img.height, 1, 1, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    if (d[3] < 100) return fallback;
    return '#' + ((1 << 24) + (d[0] << 16) + (d[1] << 8) + d[2]).toString(16).slice(1);
  } catch {
    return fallback;
  }
}

// plain: resimler saçsız + şapkasız çizildi (avatar3DPlain) → saç, şapka, kulak 3D modellenir.
// Kostümde (look) ya da başlık aksesuarında başın çevresi kavisli kabuğa giydirilir.
// hairCard: (v218, kostüm) arka saç kartı resmi ({ image }) — yoksa null
export function makeAvatar3DLook(frontTex, backTex, avatar, { plain = false, backOnly = null, hairCard = null } = {}) {
  const fi = frontTex?.image;
  const bi = backTex?.image;
  if (!fi || !bi) return null;
  const build = buildOf(avatar);
  const body = shapeOf(avatar);
  const l3 = !plain && LOOK_3D[avatar?.look];
  let gear = plain ? gearOf(avatar) : null;
  if (l3) {
    const hc = l3.fixed || samplePx(fi, l3.at, '#222222');
    gear = { hair: 'kel', hairColor: '#000000', hat: l3.hat, hatColor: hc, skin: avatar?.skin || '#c68863', earring: 'yok', headAcc: '', cigar: false, face: 'oval', noEars: true };
    gear.key = 'L|' + l3.hat + '|' + hc;
  }
  const props = propsOf(avatar, plain);
  // kostüm: kask / başlık / maske kafanın kendisi olur → kafa, başlık çiziminin boyutuna büyütülür
  // (v218: 3D şapkalı kostümde kafa normal boyda — şapka çizimi kafayı uzatmasın)
  const head = plain || l3 ? HEAD_FIT0 : fitHead(fi);
  const tb = atlas(fi, bi, build, false, false, head, head !== HEAD_FIT0);
  const bo = backOnly?.image || null; // pelerin / kanat katmanı (yoksa gövde kartı çizilmez)
  const tc = cardAtlas(fi, bi, bo, head, plain);
  const bodyMat = blendMat(tb);
  const card = new THREE.MeshMatcapMaterial({ map: tc, matcap: matcap(), toneMapped: false, alphaTest: 0.5 });
  // v218: saç kartı — düşük çözünürlük yeter (düz renkli saç, en çok 176 px); çift yüzlü
  let th = null;
  let hairMat = null;
  const hi = hairCard?.image;
  if (hi) {
    const c = document.createElement('canvas');
    c.width = Math.min(hi.width, 176);
    c.height = Math.round((c.width * SH) / SW);
    c.getContext('2d').drawImage(hi, 0, 0, c.width, c.height);
    th = new THREE.CanvasTexture(c);
    th.colorSpace = THREE.SRGBColorSpace;
    hairMat = new THREE.MeshMatcapMaterial({ map: th, matcap: matcap(), toneMapped: false, alphaTest: 0.5, side: THREE.DoubleSide });
  }
  // v220: pardösü — gövdenin altından dizlere inen gerçek 3D etek (eskiden palto eteği bacaklara boyanıyor, ceket gibi duruyordu)
  const coat = plain && avatar?.clothing === 'trenchcoat' ? avatar?.clothColor || '#8a6a44' : null;
  return {
    build,
    shape: body,
    coat,
    coatKey: coat || '',
    body: bodyMat,
    card,
    gear,
    gearKey: gear ? gear.key : '',
    props,
    propsKey: props.key,
    head,
    face: plain ? faceOf(avatar) : 'oval', // kostümde kafa çizimi kostümden → normal şekil
    headKey: [head.cx, head.cy, head.rx, head.ry, plain ? faceOf(avatar) : 'oval'].join(','),
    hasBack: Boolean(bo),
    noHeadCard: Boolean(l3),
    hair: hairMat,
    hasHair: Boolean(hairMat),
    dispose() {
      tb.dispose();
      tc.dispose();
      th?.dispose();
      hairMat?.dispose();
      bodyMat.dispose();
      card.dispose();
    },
  };
}

// --- saç, şapka, kulak (3D) --------------------------------------------------------
// Kostümsüz avatarlarda gövdeye SAÇSIZ + ŞAPKASIZ çizim giydirilir (avatar3DPlain), saç ve şapka
// buradaki gerçek 3D parçalardan gelir: avatarın kendi saç / şapka / ten renkleriyle.
// Geometri + renk birleşimi önbellekte; aynı saç / şapkayı taşıyan herkes paylaşır.
// v215: elde tutulan eşya, puro, başlık aksesuarı (taç, boynuz…) ve aura da 3D modellenir →
// çizimden çıkarılır (düz resim olarak gövdeye / karta yapışıp kötü duruyordu).
const stripAcc = (acc, slots) => {
  if (!acc || typeof acc !== 'object') return acc;
  const o = { ...acc };
  slots.forEach((k) => delete o[k]);
  return o;
};
export const avatar3DPlain = (av) => ({
  ...av,
  hairStyle: 'kel',
  hat: 'none',
  heldItem: 'yok',
  faceAcc: av?.faceAcc === 'cigar' ? 'none' : av?.faceAcc,
  acc: stripAcc(av?.acc, ['head', 'aura']),
});
// Kostüm (look) giyen avatarda kafa çizimi kostümden gelir → saç / şapka modellenmez.
export const avatar3DUsesPlain = (av) => !av?.look;
// v215: sırt kartının (pelerin / kanat) çizileceği avatar — aura (yerdeki halka, alev, yıldız) 3D'de ayrı
export const avatar3DBackSrc = (av) => (avatar3DUsesPlain(av) ? avatar3DPlain(av) : { ...av, acc: stripAcc(av?.acc, ['aura']) });
const HEAD_ACC = ['simit', 'foil', 'chef', 'horns', 'catears', 'halo', 'crown'];
const HELD = ['tabanca', 'bicak', 'sopa', 'para', 'canta', 'telefon', 'kadeh'];
const AURAS = ['ring', 'spark', 'fire'];
// elde tutulan eşya + aura (kostümde de aura)
export function propsOf(av, plain) {
  const held = plain && HELD.includes(av?.heldItem) ? av.heldItem : '';
  const aura = AURAS.includes(av?.acc?.aura) ? av.acc.aura : '';
  return { held, aura, key: held + '|' + aura };
}

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
    headAcc: HEAD_ACC.includes(av?.acc?.head) ? av.acc.head : '',
    cigar: av?.faceAcc === 'cigar' && !av?.acc?.face,
    face: faceOf(av),
  };
  g.key = [g.hair, g.hairColor, g.hat, g.hatColor, g.skin, g.earring, g.headAcc, g.cigar ? 1 : 0, g.face].join('|');
  return g;
}
const MATS = new Map();
function colorMat(c) {
  if (c === 'glass') {
    let g = MATS.get(c);
    if (!g) {
      g = new THREE.MeshMatcapMaterial({ color: '#cfe8ff', matcap: matcap(), toneMapped: false, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
      MATS.set(c, g);
    }
    return g;
  }
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
    // v218 — kostüm şapkaları
    case 'cowboy': {
      add(new THREE.CylinderGeometry(0.4, 0.45, 0.46, 18).applyMatrix4(mtx([0, 0.76, 0], [1, 1, 0.92])));
      add(E([0, 0.98, 0], [0.4, 0.07, 0.34], [0, 0, 0], [14, 6]));
      add(E([0, 1.0, 0.0], [0.08, 0.05, 0.26], [0, 0, 0], [8, 6]), shade(c, -30)); // tepe çukuru
      add(new THREE.CylinderGeometry(0.455, 0.46, 0.08, 18).applyMatrix4(mtx([0, 0.57, 0], [1, 1, 0.92])), shade(c, -45));
      // geniş kenar, yanları yukarı kıvrık
      const br = new THREE.CylinderGeometry(1.02, 1.02, 0.04, 30, 1);
      const p = br.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.2 * Math.min(1, Math.abs(p.getX(i)) / 1.02) ** 2.2 - 0.04 * (p.getZ(i) / 1.02) ** 2);
      br.computeVertexNormals();
      add(br.applyMatrix4(mtx([0, 0.52, 0], [1, 1, 0.88])));
      break;
    }
    case 'pith': {
      add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).applyMatrix4(mtx([0, 0.36, -0.02], [0.68, 0.56, 0.66])));
      const br = new THREE.CylinderGeometry(0.86, 0.86, 0.035, 28, 1);
      const p = br.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - 0.09 * (p.getZ(i) / 0.86) ** 2);
      br.computeVertexNormals();
      add(br.applyMatrix4(mtx([0, 0.38, -0.02], [0.92, 1, 1])));
      add(new THREE.CylinderGeometry(0.685, 0.685, 0.07, 22, 1, true).applyMatrix4(mtx([0, 0.42, -0.02], [1, 1, 0.97])), shade(c, -35));
      add(E([0, 0.92, -0.02], [0.06, 0.04, 0.06], [0, 0, 0], [8, 6]), shade(c, -20));
      break;
    }
    case 'tricorn': {
      add(E([0, 0.56, -0.02], [0.6, 0.3, 0.58], [0, 0, 0], [18, 10]));
      const br = new THREE.CylinderGeometry(0.9, 0.9, 0.05, 36, 1);
      const p = br.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getX(i), p.getZ(i)); // 0 = ön (uç öne bakar)
        p.setY(i, p.getY(i) + 0.32 * ((1 + Math.cos(3 * a)) / 2) ** 1.5);
      }
      br.computeVertexNormals();
      add(br.applyMatrix4(mtx([0, 0.5, -0.02], [1, 1, 1])));
      add(new THREE.TorusGeometry(0.88, 0.025, 4, 36).applyMatrix4(mtx([0, 0.5, -0.02], [1, 1, 1], [Math.PI / 2, 0, 0])), '#d4af37');
      add(E([0, 0.72, 0.5], [0.09, 0.09, 0.03], [0, 0, 0], [8, 6]), '#f2efe6'); // kafatası arması
      break;
    }
    case 'wizard': {
      const br = new THREE.CylinderGeometry(0.9, 0.9, 0.035, 30, 1);
      const bp = br.attributes.position;
      for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) - 0.05 * ((bp.getX(i) ** 2 + bp.getZ(i) ** 2) / 0.81) ** 2);
      br.computeVertexNormals();
      add(br.applyMatrix4(mtx([0, 0.5, -0.02])));
      // uzun külah, ucu arkaya kıvrık
      const cone = new THREE.ConeGeometry(0.5, 1.35, 18, 8).translate(0, 0.675, 0);
      const cp = cone.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const t = cp.getY(i) / 1.35;
        cp.setZ(i, cp.getZ(i) - 0.35 * t * t);
        cp.setY(i, cp.getY(i) - 0.12 * t * t);
      }
      cone.computeVertexNormals();
      add(cone.applyMatrix4(mtx([0, 0.5, -0.02])));
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.09, 20, 1, true).applyMatrix4(mtx([0, 0.56, -0.02])), shade(c, 45));
      break;
    }
    case 'bubble':
      add(E([0, 0.02, 0.02], [0.88, 0.92, 0.86], [0, 0, 0], [24, 16]), 'glass');
      add(new THREE.TorusGeometry(0.56, 0.09, 8, 28).applyMatrix4(mtx([0, -0.78, 0], [1, 1, 0.92], [Math.PI / 2, 0, 0])), '#e9eef5');
      break;
    default:
      break;
  }
  return L;
}

// v215 — başlık aksesuarları (kafa yereli: kafa yarıçapı 0.58 / 0.66 / 0.56, tepe y = 0.66; saçla ~0.74)
function headAccGeos(id) {
  const L = [];
  const add = (g, col) => L.push([g, col]);
  switch (id) {
    case 'simit': {
      add(new THREE.TorusGeometry(0.46, 0.13, 10, 28).applyMatrix4(mtx([0, 0.5, -0.02], [1, 1, 0.95], [Math.PI / 2 - 0.12, 0, 0])), '#c47a30');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        add(E([Math.cos(a) * 0.46, 0.63 - Math.sin(a) * 0.05, Math.sin(a) * 0.44 - 0.02], [0.03, 0.012, 0.018], [0, a, 0], [6, 4]), '#f7e7c4');
      }
      break;
    }
    case 'foil':
      add(new THREE.ConeGeometry(0.5, 0.95, 9).applyMatrix4(mtx([0, 0.86, -0.02], [1, 1, 0.95])), '#cfd6df');
      add(new THREE.TorusGeometry(0.49, 0.04, 6, 24).applyMatrix4(mtx([0, 0.4, -0.02], [1, 1, 0.95], [Math.PI / 2, 0, 0])), '#8b95a3');
      break;
    case 'chef':
      add(new THREE.CylinderGeometry(0.48, 0.48, 0.46, 20).applyMatrix4(mtx([0, 0.62, -0.02], [1, 1, 0.95])), '#ffffff');
      for (const [x, z] of [[-0.26, 0.05], [0.26, 0.05], [0, -0.2], [0, 0.24]]) add(E([x, 0.92, z], [0.32, 0.25, 0.3], [0, 0, 0], [12, 8]), '#f4f6fa');
      add(E([0, 0.98, 0], [0.34, 0.3, 0.33], [0, 0, 0], [12, 8]), '#ffffff');
      break;
    case 'horns':
      for (const sx of [-1, 1]) {
        add(new THREE.ConeGeometry(0.1, 0.34, 10).applyMatrix4(mtx([sx * 0.36, 0.64, 0.1], [1, 1, 1], [0.15, 0, -sx * 0.5])), '#d7263d');
        add(new THREE.ConeGeometry(0.055, 0.2, 8).applyMatrix4(mtx([sx * 0.45, 0.84, 0.12], [1, 1, 1], [0.15, 0, -sx * 0.15])), '#d7263d');
      }
      break;
    case 'catears':
      add(new THREE.TorusGeometry(0.56, 0.035, 6, 24, Math.PI).applyMatrix4(mtx([0, 0.12, -0.02], [1, 1.12, 1])), '#ff2e88');
      for (const sx of [-1, 1]) {
        add(new THREE.ConeGeometry(0.17, 0.32, 4).applyMatrix4(mtx([sx * 0.34, 0.74, 0], [1, 1, 0.45], [0, 0, -sx * 0.32])), '#ff2e88');
        add(new THREE.ConeGeometry(0.09, 0.2, 4).applyMatrix4(mtx([sx * 0.34, 0.72, 0.05], [1, 1, 0.3], [0, 0, -sx * 0.32])), '#ffc2dc');
      }
      break;
    case 'halo':
      add(new THREE.TorusGeometry(0.4, 0.045, 8, 32).applyMatrix4(mtx([0, 0.96, -0.04], [1, 1, 1], [Math.PI / 2 - 0.1, 0, 0])), '#ffe566');
      break;
    case 'crown': {
      const gold = '#ffd23f';
      add(new THREE.CylinderGeometry(0.47, 0.45, 0.26, 20, 1, true).applyMatrix4(mtx([0, 0.52, -0.02])), gold);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.09, 0.3, 5).applyMatrix4(mtx([Math.sin(a) * 0.47, 0.79, Math.cos(a) * 0.47 - 0.02])), gold);
        add(E([Math.sin(a) * 0.47, 0.95, Math.cos(a) * 0.47 - 0.02], [0.035, 0.035, 0.035], [0, 0, 0], [6, 4]), '#fff3b0');
      }
      add(E([0, 0.52, 0.46], [0.07, 0.07, 0.04]), '#ff2e88');
      add(E([-0.3, 0.52, 0.36], [0.05, 0.05, 0.03]), '#22d3ee');
      add(E([0.3, 0.52, 0.36], [0.05, 0.05, 0.03]), '#22d3ee');
      break;
    }
    default:
      break;
  }
  return L;
}
// v215 — elde tutulan eşyalar (el yereli: kol aşağı sarkık, -y kol boyunca aşağı, +z öne)
function heldGeos(id) {
  const L = [];
  const add = (g, col) => L.push([g, col]);
  const B = (w, h, d, p, r = [0, 0, 0]) => new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.3).applyMatrix4(mtx(p, [1, 1, 1], r));
  switch (id) {
    case 'tabanca':
      add(B(0.075, 0.09, 0.34, [0, 0.03, 0.12]), '#2b2b2b');
      add(B(0.07, 0.19, 0.09, [0, -0.05, -0.01], [0.25, 0, 0]), '#1a1a1a');
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8).applyMatrix4(mtx([0, 0.04, 0.31], [1, 1, 1], [Math.PI / 2, 0, 0])), '#0d0d0d');
      break;
    case 'bicak':
      add(B(0.055, 0.065, 0.17, [0, 0, 0]), '#3a2f1d');
      add(B(0.03, 0.13, 0.025, [0, 0, 0.09]), '#8a8a8a');
      add(new THREE.BoxGeometry(0.012, 0.06, 0.3).applyMatrix4(mtx([0, 0.008, 0.25])), '#d9dde3');
      add(new THREE.ConeGeometry(0.03, 0.08, 4).applyMatrix4(mtx([0, 0.008, 0.43], [0.4, 1, 1], [Math.PI / 2, 0, 0])), '#d9dde3');
      break;
    case 'sopa':
      // beyzbol sopası: elden öne-aşağı
      add(new THREE.CylinderGeometry(0.075, 0.035, 0.95, 12).applyMatrix4(mtx([0, -0.18, 0.4], [1, 1, 1], [-1.15, 0, 0])), '#c9a066');
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10).applyMatrix4(mtx([0, 0.02, -0.04], [1, 1, 1], [-1.15, 0, 0])), '#7a5230');
      break;
    case 'para':
      for (let i = 0; i < 3; i++) add(B(0.09, 0.045, 0.24, [0, -0.02 + i * 0.045, 0.05 + i * 0.012], [0, 0.08 * (i - 1), 0]), i === 2 ? '#2a8a4a' : i ? '#22703f' : '#1d5c3a');
      add(new THREE.BoxGeometry(0.095, 0.15, 0.04).applyMatrix4(mtx([0, 0.025, 0.05])), '#d4af37');
      break;
    case 'canta':
      // evrak çantası: sapından tutulur, aşağı sarkar
      add(new THREE.TorusGeometry(0.06, 0.016, 6, 12, Math.PI).applyMatrix4(mtx([0, -0.02, 0.02], [1, 1, 1], [0, Math.PI / 2, 0])), '#2a2014');
      add(B(0.12, 0.3, 0.42, [0, -0.22, 0.02]), '#3a2f1d');
      add(B(0.13, 0.04, 0.08, [0, -0.11, 0.02]), '#d4af37');
      break;
    case 'telefon':
      add(B(0.1, 0.2, 0.022, [0, 0.06, 0.08], [-0.5, 0, 0]), '#111111');
      add(new THREE.PlaneGeometry(0.08, 0.15).applyMatrix4(mtx([0, 0.066, 0.093], [1, 1, 1], [-0.5, 0, 0])), '#4ab8e0');
      break;
    case 'kadeh':
      add(new THREE.CylinderGeometry(0.075, 0.012, 0.13, 14, 1, true).applyMatrix4(mtx([0, 0.2, 0.06])), '#e8d27a');
      add(new THREE.CylinderGeometry(0.066, 0.02, 0.09, 14).applyMatrix4(mtx([0, 0.185, 0.06])), '#8a1d3a');
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.13, 6).applyMatrix4(mtx([0, 0.07, 0.06])), '#d4af37');
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14).applyMatrix4(mtx([0, 0.005, 0.06])), '#d4af37');
      break;
    default:
      break;
  }
  return L;
}
// v215 — aura (model birimi, ayak tabanı y = 0)
function auraGeos(id) {
  const L = [];
  const add = (g, col, tag) => L.push([g, col, tag]);
  switch (id) {
    case 'ring':
      add(new THREE.TorusGeometry(1.25, 0.06, 8, 48).applyMatrix4(mtx([0, 0.06, 0], [1, 1, 0.75], [Math.PI / 2, 0, 0])), '#22d3ee', 'ring');
      add(new THREE.TorusGeometry(1.0, 0.025, 6, 40).applyMatrix4(mtx([0, 0.04, 0], [1, 1, 0.75], [Math.PI / 2, 0, 0])), '#7ef9ff', 'ring');
      break;
    case 'spark':
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39;
        const r = 1.15 + (i % 3) * 0.25;
        add(new THREE.OctahedronGeometry(0.11 - (i % 3) * 0.02).applyMatrix4(mtx([Math.cos(a) * r, 0.6 + ((i * 0.53) % 1) * 4.6, Math.sin(a) * r * 0.7], [0.7, 1.4, 0.35])), i % 2 ? '#fff6a8' : '#ffd23f', 'spark');
      }
      break;
    case 'fire':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const h = 0.7 + (i % 3) * 0.3;
        add(new THREE.ConeGeometry(0.2, h, 7).applyMatrix4(mtx([Math.cos(a) * 0.95, h / 2, Math.sin(a) * 0.7])), '#ff6a1a', 'fire');
        add(new THREE.ConeGeometry(0.14, h * 0.6, 6).applyMatrix4(mtx([Math.cos(a) * 0.95, h * 0.3, Math.sin(a) * 0.7 + 0.05])), '#ffd23f', 'fire');
      }
      break;
    default:
      break;
  }
  return L;
}
const PROPS = new Map();
function propParts(kind, id) {
  const k = kind + ':' + id;
  let out = PROPS.get(k);
  if (out) return out;
  const list = kind === 'held' ? heldGeos(id) : auraGeos(id);
  const by = new Map();
  for (const [geo, col, tag] of list) {
    const kk = col + '|' + (tag || '');
    if (!by.has(kk)) by.set(kk, { color: col, tag, list: [] });
    const ng = geo.index ? geo.toNonIndexed() : geo;
    if (ng !== geo) geo.dispose();
    ng.deleteAttribute('uv');
    by.get(kk).list.push(ng);
  }
  out = [...by.values()].map((v) => ({ color: v.color, tag: v.tag, geo: merge(v.list) }));
  PROPS.set(k, out);
  return out;
}
const GLOW = new Map();
function glowMat(c) {
  let m = GLOW.get(c);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false });
    GLOW.set(c, m);
  }
  return m;
}

const GEAR = new Map();
function gearParts(g) {
  const st = styleFace(g.face);
  const gk = g.key + '|' + STYLE_ID;
  let out = GEAR.get(gk);
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
  headAccGeos(g.headAcc).forEach(([geo, col]) => put(geo, col));
  if (g.cigar) {
    // puro: ağzın sağ köşesinden öne-yana uzanır, ucu kor
    const dir = new THREE.Vector3(0.42, -0.22, 0.88).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const base = new THREE.Vector3(0.11, -0.38, 0.47);
    const at = (d) => base.clone().addScaledVector(dir, d);
    const cyl = new THREE.CylinderGeometry(0.034, 0.034, 0.26, 10);
    cyl.applyQuaternion(q).translate(...at(0.13).toArray());
    put(cyl, '#7a5230');
    const band = new THREE.CylinderGeometry(0.037, 0.037, 0.03, 10);
    band.applyQuaternion(q).translate(...at(0.05).toArray());
    put(band, '#d4af37');
    put(E(at(0.265).toArray(), [0.034, 0.034, 0.034], [0, 0, 0], [8, 6]), '#ff5a2a');
  }
  // kulaklar + küpeler (uzun saç, afro, kapüşon ve kask kulağı örter)
  const earsHidden = g.noEars || g.hair === 'long' || g.hair === 'afro' || g.hat === 'hoodup' || g.hat === 'helmet';
  for (const sx of earsHidden ? [] : [-1, 1]) {
    put(E([sx * 0.57, -0.06, -0.02], [0.08, 0.14, 0.09]), g.skin);
    put(E([sx * 0.6, -0.06, 0.01], [0.03, 0.08, 0.04]), shade(g.skin, -18));
    if (g.earring === 'cift' || (g.earring === 'sol' && sx < 0) || (g.earring === 'sag' && sx > 0)) put(E([sx * 0.6, -0.22, 0.02], [0.035, 0.035, 0.035], [0, 0, 0], [8, 6]), '#d4af37');
  }
  // kafayla aynı şekil (gear grubu ayrıca st.rx/ry/rz ile ölçeklenir → burada sade kafa yarıçapları)
  out = [...byColor].map(([color, list]) => ({ color, geo: shapeHead(merge(list), st, 0, 0.58, 0.66, 0.56) }));
  GEAR.set(gk, out);
  return out;
}

// --- model ----------------------------------------------------------------------
const COAT_G = new Map(); // v220: pardösü eteği geometrileri
export class Avatar3D {
  constructor(look) {
    const st = styleFace(look.face);
    const P = parts(look.build, look.shape, st.nk || null);
    this.styleId = STYLE_ID;
    this.root = new THREE.Group();
    this.root.scale.setScalar(MODEL_SCALE);
    this.baseScale = MODEL_SCALE;
    // bacak boyu: kalça yükselir, gövde onunla kalkar
    this.lift = new THREE.Group();
    this.lift.position.y = HIP_Y * (st.legs - 1);
    this.root.add(this.lift);
    this.upper = new THREE.Group();
    this.lift.add(this.upper);
    this.hipH = AVATAR_3D_HIP * st.legs;
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
    this.head.scale.setScalar(st.s);
    this.head.position.y = CHIN_Y + st.neck + 0.66 * st.ry * st.s;
    this.head.position.z = st.hz || 0; // çeneli tip: kafa boynun biraz önünde
    this.upper.add(this.head);
    mk(headGeo(look.head, st), look.body, this.head);
    if (look.hasBack) mk(P.cardBody, look.card, this.upper);
    if (look.hasHair) {
      mk(P.hairBody, look.hair, this.upper).userData.hair = true;
      mk(P.hairHead, look.hair, this.head).userData.hair = true;
    }
    // kafa kartı kafayla aynı en / boy oranında (kafa dışına taşan şapka kenarı, yüzgeç kafaya yapışık kalır)
    if (!look.noHeadCard) mk(P.cardHead, look.card, this.head).scale.set(st.rx, st.ry, 1);
    // saç / şapka / kulak: kafa şekline uysun (köşeli kafada biraz daha geniş)
    this.gearG = new THREE.Group();
    this.gearG.scale.set(st.rx * (st.box ? 1.07 : 1), st.ry, st.rz * (st.box ? 1.07 : 1));
    this.head.add(this.gearG);
    if (look.gear) for (const g of gearParts(look.gear)) mk(g.geo, colorMat(g.color), this.gearG).userData.gear = true;
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
    // v215: elde tutulan eşya (tabanca, bıçak, sopa…) ve aura (halka, yıldız, alev)
    this.heldProp = new THREE.Group();
    this.heldProp.scale.setScalar(1.55); // 2D çizimdeki boyuna yakın (elle orantılı)
    this.hand.add(this.heldProp);
    if (look.props?.held) for (const g of propParts('held', look.props.held)) mk(g.geo, colorMat(g.color), this.heldProp).userData.gear = true;
    this.auraG = new THREE.Group();
    this.root.add(this.auraG);
    this.fireG = null;
    if (look.props?.aura) {
      for (const g of propParts('aura', look.props.aura)) {
        const m = mk(g.geo, g.tag === 'spark' ? colorMat(g.color) : glowMat(g.color), this.auraG);
        m.userData.gear = true;
        m.userData.aura = g.tag;
      }
      if (look.props.aura === 'fire') this.fireG = this.auraG;
    }
    this.legs = P.legs.map((l) => {
      const pv = new THREE.Group();
      pv.position.set(l.pos[0], l.pos[1] * st.legs, l.pos[2]);
      pv.scale.y = st.legs;
      this.root.add(pv);
      mk(l.thigh, look.body, pv);
      const knee = new THREE.Group();
      knee.position.y = -KNEE;
      pv.add(knee);
      mk(l.shin, look.body, knee);
      return { hip: pv, knee };
    });
    // v220: pardösü eteği (kalçadan diz altına, hafif açılan; oturunca / yüzerken gizlenir)
    this.coatG = null;
    if (look.coat) {
      const g = new THREE.Group();
      g.position.y = HIP_Y + 0.04; // lift zaten bacak boyu kadar yükseltilmiş
      this.lift.add(g);
      const H = KNEE * st.legs * 1.12;
      const rx = (P.W / 2) * 1.02;
      const rz = (P.D / 2) * 1.08;
      const ck = [H, rx, rz].map((v) => v.toFixed(3)).join('|');
      let cg = COAT_G.get(ck);
      if (!cg) {
        cg = {
          sk: new THREE.CylinderGeometry(1, 1.22, H, 20, 1, true).translate(0, -H / 2, 0).scale(rx, 1, rz),
          // önde düğme hattı + kuşak
          ln: new THREE.BoxGeometry(0.05, H * 0.98, 0.03).translate(0, -H / 2, rz * 1.11 + 0.005),
          belt: new THREE.CylinderGeometry(1.02, 1.02, 0.1, 20, 1, true).scale(rx, 1, rz),
        };
        COAT_G.set(ck, cg); // paylaşımlı (aynı vücut yapısındaki herkes)
      }
      mk(cg.sk, colorMat(shade(look.coat, -6)), g).userData.gear = true;
      mk(cg.ln, colorMat(shade(look.coat, -35)), g).userData.gear = true;
      mk(cg.belt, colorMat(shade(look.coat, -30)), g).userData.gear = true;
      this.coatG = g;
    }
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
    if (this.styleId !== STYLE_ID || look.build !== this.look.build || look.shape !== this.look.shape || look.gearKey !== this.look.gearKey || look.propsKey !== this.look.propsKey || look.headKey !== this.look.headKey || look.hasBack !== this.look.hasBack || look.hasHair !== this.look.hasHair || look.noHeadCard !== this.look.noHeadCard || (look.coatKey || '') !== (this.look.coatKey || '')) return false;
    this.meshes.forEach((m) => {
      if (m.userData.gear) return;
      if (m.userData.hair) {
        m.material = look.hair;
        return;
      }
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
    if (this.coatG) this.coatG.visible = this.kSit < 0.35 && sk < 0.3 && this.kTread < 0.3;

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
    // v215: yiyecek / içecek elde iken eşya gizlenir; aura canlı
    this.heldProp.visible = !o.hold && sk < 0.3;
    if (this.auraG.children.length) {
      const kind = this.look.props?.aura;
      if (kind === 'spark') this.auraG.rotation.y = t * 0.6;
      else if (kind === 'ring') this.auraG.scale.set(1 + Math.sin(t * 3) * 0.04, 1, 1 + Math.sin(t * 3) * 0.04);
      else if (kind === 'fire') this.auraG.scale.set(1, 0.85 + Math.abs(Math.sin(t * 7.3)) * 0.2 + Math.sin(t * 13) * 0.05, 1);
      this.auraG.visible = sk < 0.3 && this.kTread < 0.5 && !(this.hideFire && kind === 'fire');
    }
  }
  dispose() {
    this.root.removeFromParent();
    // geometri ve malzemeler paylaşımlı: burada silinmez
  }
}
