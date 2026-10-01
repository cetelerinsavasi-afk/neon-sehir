import { useEffect } from 'react';
import './NearbyPlayersButton.css';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';

// v64 — biri sana yiyecek/içecek ısmarlayınca mekânda kısa bir bildirim.
const LABELS = {
  ...Object.fromEntries(Object.entries(HOUSE_PRODUCTS).map(([k, v]) => [k, v.label])),
  sosisli: 'Sosisli', tost: 'Tost', cay: 'Çay', kahve: 'Kahve', oralet: 'Oralet', latte: 'Latte', kokteyl: 'Kokteyl',
};

export default function GiftToast({ gift, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4500);
    return () => clearTimeout(t);
  }, [gift, onDone]);
  return (
    <div className="gift-toast" role="status">
      🎁 <b>{gift.from}</b> sana {LABELS[gift.itemId] || 'bir ikram'} ısmarladı!
    </div>
  );
}
