// =============================================================================
// v150 — ARAÇ GÖRSELLERİ artık fotoğraf değil: aracın şehirdeki 3D modelinden
// (modifiyesiyle) çekilen kare. Galeri, profil, garaj, pazar, yarış… her yerde aynı.
//   • Kareler Sixtagram fotoğraflarıyla aynı ortak kuyrukta, tek tek çizilir.
//   • Çizilen kare cihaza kaydedilir (IndexedDB) → bir daha 3D çizilmez.
//   • Telefonda kuyruk boşalınca grafik bağlamı bırakılır (bellek).
// Bu dosya three.js'i ana pakete sokmamak için CarImg'den tembel yüklenir.
// =============================================================================
import * as THREE from 'three';
import { getSharedRenderer, releaseSharedRenderer } from '../components/HouseScreen/houseEngine.js';
import { buildVehicle } from '../components/City/vehicles.js';
import { modsKey } from '../../functions/vehicleMods.js';
import { getCachedPhoto, putCachedPhoto, photoKey, runPhotoJob, onPhotoQueueIdle, IS_MOBILE_DEVICE } from './photoCache.js';

// v151: kare (eski araba resimleri gibi) — ön 3/4, alçak açı, araç kareyi doldurur
const W = 480;
const H = 480;
// v152: kendi grafik bağlamı YOK — Sixtagram / ev fotoğraflarıyla aynı ortak çizici ('snap').
// Telefonda ikinci-üçüncü WebGL bağlamı belleği zorlayıp oyunu kapatıyordu.
let R = null; // { scene, camera, bgTex, ring, floor }
const mem = new Map();

function studio() {
  if (R) return R;
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.9;
  // koyu stüdyo zemini + pembe / turkuaz neon parıltı
  const bg = document.createElement('canvas');
  bg.width = 512;
  bg.height = 320;
  const g = bg.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 320);
  lg.addColorStop(0, '#1c2342');
  lg.addColorStop(0.55, '#0c1122');
  lg.addColorStop(1, '#080b16');
  g.fillStyle = lg;
  g.fillRect(0, 0, 512, 320);
  [[0.15, 'rgba(255,46,140,0.28)'], [0.85, 'rgba(25,232,255,0.22)']].forEach(([x, c]) => {
    const rg = g.createRadialGradient(512 * x, 64, 0, 512 * x, 64, 220);
    rg.addColorStop(0, c);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 512, 320);
  });
  const bgTex = new THREE.CanvasTexture(bg);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
  scene.add(new THREE.HemisphereLight('#b8c8ff', '#120a18', 0.6));
  const key = new THREE.DirectionalLight('#fff4e8', 2.6);
  key.position.set(6, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fdcff', 1.1);
  rim.position.set(-7, 4, -6);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshStandardMaterial({ color: '#141a2c', roughness: 0.35, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.05, 4.2, 64), new THREE.MeshBasicMaterial({ color: '#ff2e8c', toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  scene.add(ring);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  R = { scene, camera, bgTex, ring, floor };
  return R;
}
// telefonda kuyruk boşalınca ortak çizici bırakılır (bellek)
if (IS_MOBILE_DEVICE) onPhotoQueueIdle(() => releaseSharedRenderer('snap'));
// ortak çiziciyi bu kare için ayarla, sonra eski ayarlarına döndür
function withRenderer(fn) {
  const { renderer, env } = getSharedRenderer('snap');
  const keep = { tm: renderer.toneMapping, ex: renderer.toneMappingExposure, pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), sh: renderer.shadowMap.enabled };
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = false;
  try {
    return fn(renderer, env);
  } finally {
    renderer.toneMapping = keep.tm;
    renderer.toneMappingExposure = keep.ex;
    renderer.setPixelRatio(keep.pr);
    renderer.setSize(keep.size.x, keep.size.y, false);
    renderer.shadowMap.enabled = keep.sh;
  }
}

function disposeTree(o) {
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.geometry?.dispose?.();
  });
}

function draw(catalogId, mods) {
  const S = studio();
  const v = buildVehicle(catalogId, mods);
  v.root.updateMatrixWorld(true);
  S.scene.add(v.root);
  try {
    // kutu: sadece görünen opak parçalar (zemin parıltısı / şeffaf düzlemler sayılmaz)
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    v.root.traverse((o) => {
      if (!o.isMesh || !o.visible || o.material?.transparent || o.material?.blending === THREE.AdditiveBlending) return;
      o.geometry.computeBoundingBox?.();
      if (!o.geometry.boundingBox) return;
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
    if (box.isEmpty()) box.setFromObject(v.root);
    // kutu aracın kendi ekseninde ölçüldü; şimdi döndür (köşeler araçla birlikte döner)
    v.root.rotation.y = -0.78; // burun sol-öne (eski resimlerdeki açı)
    v.root.updateMatrixWorld(true);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3()).applyMatrix4(v.root.matrixWorld);
    const span = Math.max(size.x, size.z, 1.6);
    const k = Math.max(0.4, (span * 0.6) / 4.1);
    S.ring.scale.setScalar(k);
    S.floor.scale.setScalar(k);
    // kareye sığdır: kutunun 8 köşesi ekranın %88'ine sığana kadar uzaklık ayarlanır
    const dir = new THREE.Vector3(0.2, 0.15, 1).normalize();
    const look = new THREE.Vector3(c.x, c.y - size.y * 0.08, c.z);
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(v.root.matrixWorld));
    let dist = span * 1.6;
    const pv = new THREE.Vector3();
    for (let it = 0; it < 6; it++) {
      S.camera.position.copy(look).addScaledVector(dir, dist);
      S.camera.lookAt(look);
      S.camera.updateMatrixWorld(true);
      let ext = 0;
      corners.forEach((p) => {
        pv.copy(p).project(S.camera);
        ext = Math.max(ext, Math.abs(pv.x), Math.abs(pv.y));
      });
      dist *= Math.max(0.5, Math.min(2, ext / 0.88));
    }
    S.camera.position.copy(look).addScaledVector(dir, dist);
    S.camera.lookAt(look);
    S.camera.updateProjectionMatrix();
    return withRenderer((renderer, env) => {
      S.scene.environment = env;
      renderer.render(S.scene, S.camera);
      return renderer.domElement.toDataURL('image/jpeg', 0.86);
    });
  } finally {
    S.scene.remove(v.root);
    disposeTree(v.root);
  }
}

// Aracın görseli (data URL / blob URL). Aynı araç + modifiye için bir kez çizilir.
export function carThumb(catalogId, mods = null) {
  const id = Number(catalogId) || 1;
  const k = modsKey(id, mods);
  if (mem.has(k)) return mem.get(k);
  const pk = photoKey(`car8|${k}`);
  const job = getCachedPhoto(pk).then((hit) => {
    if (hit) return hit;
    return runPhotoJob('car', () => draw(id, mods)).then((url) => {
      putCachedPhoto(pk, url);
      return url;
    });
  });
  mem.set(k, job);
  job.catch(() => mem.delete(k));
  if (mem.size > 80) mem.delete(mem.keys().next().value);
  return job;
}
