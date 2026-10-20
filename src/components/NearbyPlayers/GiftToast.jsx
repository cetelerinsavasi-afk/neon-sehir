import { useEffect, useRef } from 'react';
import './NearbyPlayersButton.css';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';

// v64 — biri sana yiyecek/içecek ısmarlayınca mekânda kısa bir bildirim.
const LABELS = {
  ...Object.fromEntries(Object.entries(HOUSE_PRODUCTS).map(([k, v]) => [k, v.label])),
  sosisli: 'Sosisli', tost: 'Tost', cay: 'Çay', kahve: 'Kahve', oralet: 'Oralet', latte: 'Latte', kokteyl: 'Kokteyl',
};

// v105: 4,5 sn sonra kendiliğinden kaybolur, dokununca hemen kapanır
export default function GiftToast({ gift, onDone }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => doneRef.current?.(), 4500);
    return () => clearTimeout(t);
  }, [gift]);
  return (
    <div className="gift-toast" role="status" onClick={(e) => { e.stopPropagation(); doneRef.current?.(); }} onPointerDown={(e) => e.stopPropagation()}>
      🎁 <b>{gift.from}</b> sana {LABELS[gift.itemId] || 'bir ikram'} ısmarladı!
    </div>
  );
}
