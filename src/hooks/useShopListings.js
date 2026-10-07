import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// v77 — Bir dükkânın vitrindeki açık ilanları (dükkân ilanı = 2. el ilanı)
export function useShopListings(houseId) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!houseId) return undefined;
    return onSnapshot(
      query(collection(db, 'marketplaceListings'), where('shopHouseId', '==', houseId), where('sold', '==', false)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('useShopListings:', e)
    );
  }, [houseId]);
  return rows;
}

