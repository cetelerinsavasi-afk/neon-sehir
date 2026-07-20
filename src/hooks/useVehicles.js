import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export function useVehicles() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'vehicles'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        // Galerideki sırayla (catalogId artan, yani fiyat artan) hizalanıyor
        // — kullanıcı bir modelden en fazla 1 tane sahip olabildiği için bu
        // sıralama her yerde (garaj, profil, bahisli yarış/antrenman araç
        // seçimi, 2. el satış "senin ilanların" vb.) tutarlı ve tekrar
        // eden bir düzen sağlıyor.
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.catalogId || 0) - (b.catalogId || 0));
        setVehicles(list);
        setLoading(false);
      },
      (err) => {
        console.error('useVehicles dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { vehicles, loading };
}
