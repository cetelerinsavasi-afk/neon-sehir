import { useEffect, useState } from 'react';
import { getThumb } from './houseEngine';

// Mobilya küçük resmi (3D'den bir kez çizilir, önbellekte tutulur). Sırayla
// çizilir ki liste açılırken ekran donmasın. Çizilene kadar emoji görünür.
// --- küçük resim kuyruğu ---------------------------------------------------------
const thumbQueue = [];
let thumbBusy = false;
function pumpThumbs() {
  if (thumbBusy) return;
  const job = thumbQueue.shift();
  if (!job) return;
  if (!job.alive()) {
    pumpThumbs();
    return;
  }
  thumbBusy = true;
  setTimeout(() => {
    const url = getThumb(job.k, job.ti);
    if (job.alive()) job.cb(url);
    thumbBusy = false;
    pumpThumbs();
  }, 12);
}
export default function ItemThumb({ k, ti = 0, icon }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    thumbQueue.push({ k, ti, cb: (u) => setUrl(u), alive: () => alive });
    pumpThumbs();
    return () => {
      alive = false;
    };
  }, [k, ti]);
  return url ? <img className="hs-thumb" src={url} alt="" draggable={false} /> : <span className="hs-thumb hs-thumb-emoji">{icon}</span>;
}

