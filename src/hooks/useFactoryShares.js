import { useEffect, useState } from 'react';
import { collection, collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * useFactoryShares — bir fabrikanın KENDİ hisse (stok) alt koleksiyonunu
 * canlı dinler (bkz. functions/index.js listFactoryShare/buyFactoryShare/
 * dailyReset hisse temettü bloğu). "Hisse Sat" panelinde (fabrika sahibi
 * tarafı) hem listede hem satılmış (active) hisseleri göstermek için
 * kullanılır.
 */
export function useFactoryShares(factoryId) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!factoryId) {
      setShares([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'factories', factoryId, 'shares'),
      (snap) => {
        setShares(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useFactoryShares dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [factoryId]);

  const listed = shares.filter((s) => s.status === 'listed');
  const active = shares.filter((s) => s.status === 'active');

  return { shares, listed, active, loading };
}

/**
 * useListedFactoryShares — TÜM fabrikalardaki 'listed' (henüz satılmamış)
 * hisse ilanlarını collectionGroup sorgusuyla dinler. Fabrikalar listesinde
 * (BrowseFactoriesModal/BrowseView) hangi fabrikanın "Hisse Al" butonunu
 * göstereceğini belirlemek + satın alma panelini doldurmak için kullanılır.
 * Tek eşitlik filtresi (status == 'listed') olduğu için composite index
 * gerekmiyor (bkz. firestore.indexes.json'daki 'shares'.status fieldOverride).
 */
export function useListedFactoryShares() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  // error — DÜZELTME ("hisse alma butonunu göremiyorum"): bu sorgu
  // başarısız olursa (ör. firestore.indexes.json'daki 'shares'.status
  // collectionGroup indeksi henüz deploy edilmemişse) eskiden sadece
  // console.error'a yazılıp `byFactoryId` sessizce {} kalıyordu — hiçbir
  // "Hisseler" butonu görünmüyordu ve sebebi anlaşılmıyordu. Artık bu
  // hata dışa da veriliyor (bkz. FactoryScreen.jsx'teki kullanım).
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collectionGroup(db, 'shares'), where('status', '==', 'listed'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setShares(
          snap.docs.map((d) => ({ id: d.id, factoryId: d.ref.parent.parent.id, ...d.data() }))
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('useListedFactoryShares dinleme hatası:', err);
        setError(err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const byFactoryId = shares.reduce((acc, s) => {
    if (!acc[s.factoryId]) acc[s.factoryId] = [];
    acc[s.factoryId].push(s);
    return acc;
  }, {});

  return { shares, byFactoryId, loading, error };
}
