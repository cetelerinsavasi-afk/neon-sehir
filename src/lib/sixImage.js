// =============================================================================
// v160.2 — SIXTAGRAM FOTOĞRAF GÖRSELİ (istemci)
//   • makeShareImage: paylaşırken kameradaki son kareden küçük JPEG üretir (hikâye: dikey +
//     yazı/çizim katmanı · gönderi: ortadan kare). 3D sahne yeniden KURULMAZ.
//   • loadSixImage: gönderinin görseli (RTDB sixImg/{postId}) — önce cihaz önbelleği, yoksa bir
//     kez indirilir ve cihaza kaydedilir. Firestore okuması YOK.
// Sunucu: functions/sixImage.js (doğrulama) + createSixtagramPost.
// =============================================================================
import { app } from '../firebase';
import { getCachedPhoto, putCachedPhoto, forgetCachedPhoto } from './photoCache';
import { drawPhotoOverlay, ensureOverlayFonts } from '../../functions/photoOverlay.js';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
let modP = null;
const rt = () => {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
};

const loadImg = (src) =>
  new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });

// Hikâye 360×640, gönderi 432×432; sunucu sınırı (~150 KB) aşılırsa kalite düşürülür
export async function makeShareImage(previewUrl, { asPost = false, overlay = null } = {}) {
  if (!previewUrl) return null;
  let c = null;
  try {
    const im = await loadImg(previewUrl);
    const iw = im.naturalWidth || im.width;
    const ih = im.naturalHeight || im.height;
    if (!iw || !ih) return null;
    c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (asPost) {
      const s = Math.min(iw, ih);
      c.width = 432;
      c.height = 432;
      ctx.drawImage(im, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, 432, 432);
    } else {
      c.width = 360;
      c.height = Math.round((360 * ih) / iw);
      ctx.drawImage(im, 0, 0, c.width, c.height);
      if (overlay) {
        await ensureOverlayFonts();
        try {
          drawPhotoOverlay(ctx, overlay, c.width, c.height);
        } catch {
          /* katman çizilemezse sadece fotoğraf */
        }
      }
    }
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const u = c.toDataURL('image/jpeg', q);
      if (u.length < 190_000) return u;
    }
    return null;
  } catch {
    return null;
  } finally {
    // v160.3: düşük bellekli telefonlarda tuvali hemen bırak (hikâye paylaşırken çökme)
    if (c) {
      c.width = 0;
      c.height = 0;
    }
  }
}

const inflight = new Map();
// fresh: önbelleği atla (görsel açılamadıysa — v160.5)
export function loadSixImage(postId, { fresh = false } = {}) {
  if (!postId) return Promise.resolve(null);
  if (!fresh && inflight.has(postId)) return inflight.get(postId);
  const key = `six|${postId}`;
  const p = (async () => {
    if (fresh) forgetCachedPhoto(key);
    const hit = fresh ? null : await getCachedPhoto(key);
    if (hit) return hit;
    if (!DB_URL) return null;
    const { m, db } = await rt();
    const snap = await m.get(m.ref(db, `sixImg/${postId}/d`));
    const b64 = snap.val();
    if (typeof b64 !== 'string' || !b64) return null;
    const dataUrl = `data:image/jpeg;base64,${b64}`;
    await putCachedPhoto(key, dataUrl);
    return dataUrl; // v160.5: doğrudan (iPhone'da blob: adresi açılmıyordu)
  })().catch(() => null);
  inflight.set(postId, p);
  p.then((v) => {
    if (!v) inflight.delete(postId); // bir dahaki sefere yeniden dene
  });
  return p;
}
