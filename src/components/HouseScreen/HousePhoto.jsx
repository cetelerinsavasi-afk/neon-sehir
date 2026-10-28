import { useEffect, useState } from 'react';
import { createHouseEngine } from './houseEngine';
import { drawPhotoOverlay, ensureOverlayFonts, PHOTO_ASPECT } from '../../../functions/photoOverlay.js';

// =============================================================================
// HousePhoto — Sixtagram'da paylaşılan ev fotoğrafı ('housePhoto' eki).
// Görsel YÜKLENMEZ: sunucu çekim anındaki tasarımı, kişileri ve kamera pozunu
// dondurur (functions/houses.js buildPhotoAttachment); burada aynı sahne ekran
// dışı bir 3D motorla tek kare olarak yeniden çizilir. Kareler sırayla (tek tek)
// üretilir ve önbelleğe alınır — akışta çok sayıda ev fotoğrafı olsa da aynı
// anda tek bir ekran dışı sahne vardır.
// =============================================================================
const cache = new Map();

// Çekim pozunu hedef kadraja (kare 1 · dikey 9:16) çevirir (ortadan kırpma):
// çekim hedeften daha uzunsa yatay açı korunur (üst/alt kırpılır), daha genişse
// dikey açı korunur (yanlar kırpılır); etiket ölçeği kalan genişliğe göre.
export function cropCam(cam, a, target = 1) {
  const fov = Number(cam.fov) || 58;
  const cw = Number(cam.cw) || 400;
  if (a < target) {
    const f = (2 * Math.atan((a / target) * Math.tan((fov * Math.PI) / 360)) * 180) / Math.PI;
    return { ...cam, fov: f, cw };
  }
  return { ...cam, fov, cw: (cw * target) / a };
}

function housePhotoAspect(att) {
  const a = Number(att?.cam?.a);
  return Number.isFinite(a) && a > 0 ? Math.max(0.4, Math.min(2.5, a)) : 1;
}
let queue = Promise.resolve();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// v135 — fotoğrafın üstüne yazı + çizim katmanı
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
export function renderHousePhotoUrl(att) {
  return renderHousePhoto(att, `pre_${Date.now()}_${Math.random()}`);
}

function renderHousePhoto(att, key) {
  if (cache.has(key)) return cache.get(key);
  const job = (queue = queue
    .catch(() => {})
    .then(async () => {
      // v72 — kare her zaman KARE, ama çekim anındaki açıyla: dikey çekimde
      // yatay görüş açısı korunur (üstten/alttan kırpılır), yatay çekimde
      // dikey açı korunur (yanlardan kırpılır).
      // v135 — hikâye fotoğrafı dikey (9:16), telefon ekranı gibi
      const a = housePhotoAspect(att);
      const vert = Boolean(att.vert);
      const w = 540;
      const h = vert ? 960 : 540;
      const cam = cropCam(att.cam || {}, a, vert ? PHOTO_ASPECT : 1);
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
      document.body.appendChild(host);
      let eng = null;
      try {
        eng = createHouseEngine(host, { canEdit: false, selfUid: null, snapshot: true });
        eng.setDesign(att.design || { items: [] }, { force: true });
        if (Array.isArray(att.fade) && att.fade.length) eng.setFadedIds(att.fade);
        // v85: çekim anındaki hareket (dans vb.) ve yürüme adımı dondurulmuş gelir
        eng.setOthers((att.people || []).map((p) => ({ ...p, holdingVisible: p.holding || null, frozen: { moving: !!p.moving, wp: p.wp ? 1 : 0, emote: p.emote || null } })));
        const t0 = Date.now();
        while (!eng.avatarsReady() && Date.now() - t0 < 5000) await wait(120);
        // çekim anındaki mesaj balonları (sunucu dondurdu)
        (att.people || []).forEach((p) => (Array.isArray(p.says) ? p.says : []).slice(-3).forEach((t) => eng.say(p.uid, String(t))));
        const url = eng.renderPose(cam, w, h);
        if (!att.overlay) return url;
        await ensureOverlayFonts();
        return await withOverlay(url, att.overlay, w, h);
      } finally {
        try {
          eng?.dispose();
        } catch {
          /* yoksay */
        }
        host.remove();
      }
    }));
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return job;
}

export default function HousePhoto({ attachment }) {
  const key = JSON.stringify([attachment.houseId, attachment.cam, attachment.vert ? 1 : 0, attachment.overlay ? JSON.stringify(attachment.overlay).length : 0, attachment.people?.length, attachment.design?.items?.length, (attachment.people || []).map((p) => `${p.says?.length || 0}${p.holding || ''}${p.emote?.kind || ''}${p.emote?.at || ''}${p.x},${p.z}`)]);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    renderHousePhoto(attachment, key)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (failed) return <div className="post-att-housephoto-empty">🏠</div>;
  if (!src) return <div className="post-att-housephoto-empty">Fotoğraf yükleniyor…</div>;
  return <img className={`post-att-housephoto-img${attachment.vert ? ' vert' : ''}`} src={src} alt={attachment.houseName || 'Ev'} />;
}
