import { useEffect, useState } from 'react';
import { createCityEngine } from './cityEngine.js';
import { getLiveCityEngine, onLiveCityChange } from './cityPhotoHub.js';
import { drawPhotoOverlay, ensureOverlayFonts, PHOTO_ASPECT } from '../../../functions/photoOverlay.js';

// =============================================================================
// v147 — CityPhoto: Sixtagram'da paylaşılan şehir fotoğrafı ('cityPhoto' eki).
// Görsel YÜKLENMEZ: sunucunun imzaladığı çekim anı (kamera + kişiler + arabalar)
// şehir motoruyla tek kare olarak yeniden çizilir → paylaşılan = çekilen.
//   • Şehir açıksa onun motoru kullanılır (ikinci 3D sahne kurulmaz).
//   • Değilse ekran dışı tek bir motor kurulur; 45 sn kullanılmazsa kapatılır.
//   • Kareler sırayla üretilir ve önbelleğe alınır.
// =============================================================================
const cache = new Map();
let queue = Promise.resolve();
let off = null;
let offHost = null;
let idleT = 0;

function release() {
  clearTimeout(idleT);
  try {
    off?.dispose();
  } catch {
    /* yoksay */
  }
  offHost?.remove();
  off = null;
  offHost = null;
}
onLiveCityChange((e) => {
  if (e) release(); // şehre girildi: ekran dışı motor gereksiz
});
function engine() {
  const live = getLiveCityEngine();
  if (live) return live;
  clearTimeout(idleT);
  if (!off) {
    offHost = document.createElement('div');
    offHost.style.cssText = 'position:fixed;left:-10000px;top:0;width:540px;height:960px;pointer-events:none;';
    document.body.appendChild(offHost);
    off = createCityEngine(offHost, { snapshot: true, uid: '__photo__' });
  }
  return off;
}

// Çekim pozunu hedef kadraja çevirir (HousePhoto.cropCam ile aynı)
function cropCam(cam, a, target = 1) {
  const fov = Number(cam.fov) || 60;
  const cw = Number(cam.cw) || 400;
  if (a < target) {
    const f = (2 * Math.atan((a / target) * Math.tan((fov * Math.PI) / 360)) * 180) / Math.PI;
    return { ...cam, fov: f, cw };
  }
  return { ...cam, fov, cw: (cw * target) / a };
}
const aspectOf = (att) => {
  const a = Number(att?.cam?.a);
  return Number.isFinite(a) && a > 0 ? Math.max(0.4, Math.min(2.5, a)) : 1;
};
function withOverlay(url, overlay, w, h) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try {
        drawPhotoOverlay(ctx, overlay, w, h);
      } catch {
        /* katman çizilemezse sadece fotoğraf */
      }
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

function render(att, key) {
  if (key && cache.has(key)) return cache.get(key);
  const job = (queue = queue
    .catch(() => {})
    .then(async () => {
      const a = aspectOf(att);
      const vert = Boolean(att.vert) && !att.sq;
      const w = 540;
      const h = vert ? 960 : 540;
      let cam = cropCam(att.cam || {}, a, vert ? PHOTO_ASPECT : 1);
      if (att.sq && att.vert) cam = cropCam(cropCam(att.cam || {}, a, PHOTO_ASPECT), PHOTO_ASPECT, 1);
      const eng = engine();
      try {
        const url = await eng.renderAtt({ ...att, cam }, w, h);
        if (!att.overlay) return url;
        await ensureOverlayFonts();
        return await withOverlay(url, att.overlay, w, h);
      } finally {
        if (eng === off) {
          clearTimeout(idleT);
          idleT = setTimeout(release, 45_000);
        }
      }
    }));
  if (key) {
    cache.set(key, job);
    job.catch(() => cache.delete(key));
    if (cache.size > 30) cache.delete(cache.keys().next().value);
  }
  return job;
}
// önizleme (paylaşmadan önce) — önbelleğe alınmaz
export const renderCityPhotoUrl = (att) => render(att, null);

export default function CityPhoto({ attachment }) {
  const key = JSON.stringify([attachment.cam, attachment.vert ? 1 : 0, attachment.sq ? 1 : 0, attachment.overlay ? JSON.stringify(attachment.overlay).length : 0, (attachment.people || []).map((p) => `${p.uid}${p.x},${p.z}`), (attachment.cars || []).length]);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    render(attachment, key)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (failed) return <div className="post-att-housephoto-empty">🌆</div>;
  if (!src) return <div className="post-att-housephoto-empty">Fotoğraf yükleniyor…</div>;
  return <img className={`post-att-housephoto-img${attachment.vert && !attachment.sq ? ' vert' : ''}`} src={src} alt="Neon Şehir" />;
}
