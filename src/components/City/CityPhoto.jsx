import { useEffect, useRef, useState } from 'react';
import { getCachedPhoto, putCachedPhoto, photoKey, whenVisible, runPhotoJob, registerPhotoReleaser, IS_MOBILE_DEVICE } from '../../lib/photoCache';
import { releaseSharedRenderer } from '../HouseScreen/houseEngine';
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
let off = null;
let offHost = null;
let idleT = 0;

function release() {
  clearTimeout(idleT);
  const had = Boolean(off);
  try {
    off?.dispose();
  } catch {
    /* yoksay */
  }
  offHost?.remove();
  off = null;
  offHost = null;
  // v149: telefonda fotoğraf çizicisinin grafik bağlamı da bırakılır (bellek)
  if (had && IS_MOBILE_DEVICE) releaseSharedRenderer('snap');
}
// v149: ev fotoğrafı çizilmeden önce ekran dışı şehir motoru kapatılır (aynı anda tek sahne)
registerPhotoReleaser('city', release);
// v149: telefonda boşta kalan motor hemen kapanır (45 sn tüm şehri bellekte tutmak çökme sebebiydi)
const IDLE_MS = IS_MOBILE_DEVICE ? 2500 : 45_000;
onLiveCityChange((e) => {
  // şehre girildi: ekran dışı motor gereksiz (v149: kuyrukta — o an çizilen fotoğraf bozulmasın)
  if (e && off) runPhotoJob('city-release', release);
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
  const job = runPhotoJob('city', async () => {
      const a = aspectOf(att);
      const vert = Boolean(att.vert) && !att.sq;
      // v152: telefonda daha küçük kare (bellek)
      const w = IS_MOBILE_DEVICE ? 432 : 540;
      const h = vert ? Math.round((w * 16) / 9) : w;
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
          // kapatma da kuyruğa girer: başka bir fotoğraf çizilirken motor elden alınmaz
          idleT = setTimeout(() => runPhotoJob('city-release', release), IDLE_MS);
        }
      }
    });
  if (key) {
    cache.set(key, job);
    job.catch(() => cache.delete(key));
    if (cache.size > 30) cache.delete(cache.keys().next().value);
  }
  return job;
}
// önizleme (paylaşmadan önce) — önbelleğe alınmaz
export const renderCityPhotoUrl = (att) => render(att, null);

// v152: telefonda akıştaki şehir fotoğrafları, şehir açık değilse dokununca çizilir — her
// gönderi için ekran dışında koca şehri kurmak bellek yetmeyince oyunu kapatabiliyordu
// ("Sixtagram'a girince bazen atıyor"). Cihazda kayıtlıysa yine anında görünür.
export default function CityPhoto({ attachment, manual = IS_MOBILE_DEVICE }) {
  const [asked, setAsked] = useState(false);
  const key = JSON.stringify([attachment.cam, attachment.vert ? 1 : 0, attachment.sq ? 1 : 0, attachment.overlay ? JSON.stringify(attachment.overlay).length : 0, (attachment.people || []).map((p) => `${p.uid}${p.x},${p.z}`), (attachment.cars || []).length]);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    // v147.3: önce cihaz önbelleği (anında, 3D sahne hiç kurulmaz); yoksa ekrana yaklaşınca çiz + kaydet
    let alive = true;
    const pk = photoKey(`c|${JSON.stringify(attachment)}`);
    let stop = () => {};
    getCachedPhoto(pk).then((hit) => {
      if (!alive) return;
      if (hit) return setSrc(hit);
      if (manual && !asked && !getLiveCityEngine()) return setWaiting(true);
      stop = whenVisible(boxRef.current, () => {
        render(attachment, key)
          .then((u) => {
            putCachedPhoto(pk, u);
            if (alive) setSrc(u);
          })
          .catch(() => alive && setFailed(true));
      });
    });
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, asked]);
  if (failed) return <div className="post-att-housephoto-empty">🌆</div>;
  if (!src && waiting && !asked)
    return (
      <button
        type="button"
        className="post-att-housephoto-empty post-att-cityphoto-tap"
        onClick={(e) => {
          e.stopPropagation();
          setWaiting(false);
          setAsked(true);
        }}
      >
        🌆 Şehir fotoğrafı — göstermek için dokun
      </button>
    );
  if (!src) return <div ref={boxRef} className="post-att-housephoto-empty">Fotoğraf yükleniyor…</div>;
  return <img className={`post-att-housephoto-img${attachment.vert && !attachment.sq ? ' vert' : ''}`} src={src} alt="Neon Şehir" />;
}
