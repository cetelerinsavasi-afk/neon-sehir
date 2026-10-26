import { useEffect, useState } from 'react';
import { getThumb } from './houseEngine';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { botAvatar } from '../../../functions/botData.js';

// v132.1 — Bot mobilyası: platform yerine üstündeki başlangıç botu (boydan) görünür
const BOT_THUMB_AV = botAvatar(null);
function BotThumb() {
  return (
    <span className="hs-thumb hs-thumb-bot" aria-hidden="true">
      <i className="hs-thumb-bot-pad" />
      <span className="hs-thumb-bot-av">
        <AvatarSvg avatar={BOT_THUMB_AV} variant="full" />
      </span>
    </span>
  );
}

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
  if (k === 'bot') return <BotThumb />;
  return <ThumbImg k={k} ti={ti} icon={icon} />;
}
function ThumbImg({ k, ti, icon }) {
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

