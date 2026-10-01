import { useEffect, useState } from 'react';
import { createHouseEngine } from './houseEngine';

// =============================================================================
// HousePhoto — Sixtagram'da paylaşılan ev fotoğrafı ('housePhoto' eki).
// Görsel YÜKLENMEZ: sunucu çekim anındaki tasarımı, kişileri ve kamera pozunu
// dondurur (functions/houses.js buildPhotoAttachment); burada aynı sahne ekran
// dışı bir 3D motorla tek kare olarak yeniden çizilir. Kareler sırayla (tek tek)
// üretilir ve önbelleğe alınır — akışta çok sayıda ev fotoğrafı olsa da aynı
// anda tek bir ekran dışı sahne vardır.
// =============================================================================
const cache = new Map();

function housePhotoAspect(att) {
  const a = Number(att?.cam?.a);
  return Number.isFinite(a) && a > 0 ? Math.max(0.4, Math.min(2.5, a)) : 1;
}
let queue = Promise.resolve();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function renderHousePhoto(att, key) {
  if (cache.has(key)) return cache.get(key);
  const job = (queue = queue
    .catch(() => {})
    .then(async () => {
      // v71 — kare çekim anındaki en/boy oranıyla çizilir (eskiden hep kareydi →
      // dikey telefonda çekilen fotoğraf çok daha geniş açılı görünüyordu).
      const a = housePhotoAspect(att);
      const w = a >= 1 ? 640 : 480;
      const h = Math.round(w / a);
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
      document.body.appendChild(host);
      let eng = null;
      try {
        eng = createHouseEngine(host, { canEdit: false, selfUid: null, snapshot: true });
        eng.setDesign(att.design || { items: [] }, { force: true });
        eng.setOthers((att.people || []).map((p) => ({ ...p, holdingVisible: null })));
        const t0 = Date.now();
        while (!eng.avatarsReady() && Date.now() - t0 < 5000) await wait(120);
        // çekim anındaki mesaj balonları (sunucu dondurdu)
        (att.people || []).forEach((p) => (Array.isArray(p.says) ? p.says : []).slice(-3).forEach((t) => eng.say(p.uid, String(t))));
        return eng.renderPose(att.cam, w, h);
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
  const key = JSON.stringify([attachment.houseId, attachment.cam, attachment.people?.length, attachment.design?.items?.length, (attachment.people || []).map((p) => p.says?.length || 0)]);
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
  return <img className="post-att-housephoto-img" src={src} alt={attachment.houseName || 'Ev'} />;
}
