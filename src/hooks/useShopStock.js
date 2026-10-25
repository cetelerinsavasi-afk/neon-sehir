import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// v130 — silahçı / galeri stoğu + satış fiyatları (shopStocks/{houseId}, functions/shop.js)
export function useShopStock(houseId) {
  const [stock, setStock] = useState(null);
  useEffect(() => {
    if (!houseId) return undefined;
    return onSnapshot(
      doc(db, 'shopStocks', houseId),
      (s) => setStock(s.exists() ? s.data() : {}),
      () => setStock({})
    );
  }, [houseId]);
  return stock;
}
