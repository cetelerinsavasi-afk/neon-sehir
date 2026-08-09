import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMySixtagramPosts — Profil sekmesinde gösterilen "kendi paylaştığım
 * postlar" listesi (sadece süresi dolmamış olanlar — 24 saat sonra zaten
 * sunucu tarafında siliniyor, bkz. cleanupSixtagramPosts).
 *
 * DİKKAT: sorguda BİLEREK orderBy KULLANMIYORUZ — where('uid','==',...)
 * ile birlikte farklı bir alanda orderBy, Firestore'da composite index
 * gerektirir (bkz. useVehicles/useMyFutbolBets — aynı sebeple onlar da
 * sıralamayı istemcide yapıyor). Böylece ekstra index kurulumu
 * gerekmiyor.
 */
export function useMySixtagramPosts() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPosts([]);
      setLoading(false);
      return undefined;
    }
    const q = query(collection(db, 'sixtagramPosts'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        setPosts(list);
        setLoading(false);
      },
      (err) => {
        console.error('useMySixtagramPosts dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  return { posts, loading };
}
