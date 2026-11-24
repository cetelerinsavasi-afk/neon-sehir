// v191 — AÇILIŞ HIZI: eşya küçük resimleri (katalog rafı) ev motorundan ayrıldı. Şehirdeki eldeki eşya
// simgesi (ItemThumb) eskiden bunun için ev motorunun tamamını şehirle birlikte yüklüyordu. Kod aynı.
import * as THREE from 'three';
import { buildItem, disposeObject, M } from './houseCatalog';
import { makeRenderer, envFor } from './sharedRenderer.js';

const ROOM_H = 3.4; // houseEngine.js ROOM.H ile AYNI

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
// v196: şehirde tasarım rafı kapanınca ikinci WebGL bağlamı bırakılır (telefonda bellek / ısınma);
// çizilmiş resimler önbellekte kalır, yeniden açınca sadece eksikler çizilir.
export function releaseThumbRenderer() {
  if (!thumbCtx) return;
  try {
    thumbCtx.r.dispose();
    thumbCtx.r.forceContextLoss?.();
  } catch {
    /* yoksay */
  }
  thumbCtx = null;
}
export function getThumb(k, ti = 0) {
  const key = `${k}|${ti}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  try {
    const { r, s, cam } = thumbRenderer();
    const obj = buildItem(k, { ti, live: false, H: ROOM_H, wallMat: M('#cfcac1', 0.9) });
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
    const url = r.domElement.toDataURL('image/webp', 0.85); // v196: png yerine webp (bellek ↓); desteklemeyen tarayıcı png verir
    s.remove(obj);
    disposeObject(obj);
    thumbCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

