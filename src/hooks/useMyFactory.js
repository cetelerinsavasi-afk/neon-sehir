import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMyFactory — giriş yapan oyuncunun KENDİ fabrikasını (varsa) ve
 * içindeki makineleri canlı dinler. Her oyuncunun en fazla 1 fabrikası
 * olabildiği için doküman ID'si doğrudan uid.
 */
export function useMyFactory() {
  const { user } = useAuth();
  const [factory, setFactory] = useState(null);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFactory(null);
      setMachines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubFactory = onSnapshot(
      doc(db, 'factories', user.uid),
      (snap) => {
        setFactory(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error('useMyFactory (factory) dinleme hatası:', err);
        setLoading(false);
      }
    );
    const unsubMachines = onSnapshot(
      query(collection(db, 'factories', user.uid, 'machines'), orderBy('purchasedAt', 'asc')),
      (snap) => {
        setMachines(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error('useMyFactory (machines) dinleme hatası:', err)
    );
    return () => {
      unsubFactory();
      unsubMachines();
    };
  }, [user]);

  return { factory, machines, loading };
}
