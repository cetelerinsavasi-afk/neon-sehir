// v191 — AÇILIŞ HIZI: ortak WebGL çizici (şehir, ev, mekân, modifiye, araba önizlemesi) ev motorundan
// (houseEngine.js, ~1 MB) ayrıldı. Şehir eskiden sadece bu birkaç fonksiyon için ev motorunun tamamını
// indirip çalıştırıyordu. Davranış aynı; houseEngine.js bunları buradan yeniden dışa aktarır.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || ''); // houseEngine.js ile AYNI

// --- Ortak renderer'lar ------------------------------------------------------
export function makeRenderer(opts) {
  // v106: Android'de kenar yumuşatma (MSAA) kapalı — yüksek çözünürlükte farkı az, maliyeti büyük
  // v157.4: telefonlarda (iPhone dahil) kenar yumuşatma kapalı — yüksek çözünürlüklü ekranda farkı az,
  // ekran kartı belleği ve ısınma maliyeti büyük (iPhone'da oyundan atmaların bir sebebi)
  const PHONE = IS_ANDROID || (typeof navigator !== 'undefined' && /iPhone|iPad|Mobile/i.test(navigator.userAgent || ''));
  const r = new THREE.WebGLRenderer({ antialias: !PHONE, powerPreference: 'high-performance', ...opts });
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  // v170 DONMA / AÇILIŞ: three.js her yeni gölgelendiriciden (malzeme) sonra "derlendi mi, hata var mı"
  // diye ekran kartına SORUP cevabı bekliyordu — tarayıcıda bu soru oyunu (dokunuş, arayüz dahil)
  // derleme bitene kadar durdurur: açılışta onlarca kez, şehirde yeni bir şey (araba, mekân, oyuncu)
  // göründükçe birkaç kez. Yayındaki oyunda sorulmaz; derleme ekran kartında arka planda biter.
  // Görüntü aynıdır (geliştirmede hata ayıklama için açık kalır).
  if (import.meta.env?.PROD) r.debug.checkShaderErrors = false;
  r.__lost = false;
  r.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    r.__lost = true;
    r.__onLost?.();
  });
  return r;
}
const shared = { main: null, mainEnv: null, snap: null, snapEnv: null, spec: null, specEnv: null };
export function envFor(r) {
  const pm = new THREE.PMREMGenerator(r);
  const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return tex;
}
// v147.1: şehir de aynı ortak çiziciyi kullanır (telefonda tek grafik bağlamı → bellek, çökme yok)
export function getSharedRenderer(kind = 'main') {
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

// v149 — ekran dışı fotoğraf çizicisini (ör. 'snap') tamamen bırak: telefonda Sixtagram
// fotoğrafları çizildikten sonra ikinci grafik bağlamı bellekte kalmasın.
export function releaseSharedRenderer(kind) {
  const r = shared[kind];
  if (!r) return;
  shared[kind] = null;
  try {
    shared[`${kind}Env`]?.dispose?.();
  } catch {
    /* yoksay */
  }
  shared[`${kind}Env`] = null;
  try {
    r.dispose();
    r.forceContextLoss?.();
  } catch {
    /* bağlam zaten yok */
  }
  r.domElement?.remove?.();
}
