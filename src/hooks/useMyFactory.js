import { useEffect, useState } from 'react';
import { collection, doc, getCountFromServer, onSnapshot, orderBy, query, where } from 'firebase/firestore';
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

// =============================================================================
// v204 MALİYET — ana sayfa "⚙️ Makineleri çalıştır" hatırlatması için hafif yol.
// Eskiden useOnboarding tüm makineleri (fabrika başına ~200 belge) CANLI dinliyordu; her makine
// değişikliği açık her oturuma okuma yazıyordu (oyuncu okumalarının ~%7'si). Artık:
//   • sadece fabrika belgesi dinlenir (1 belge),
//   • sunucu "Makineleri Çalıştır"dan sonra factories/{uid}.minTrig = bugün yazar,
//   • minTrig bugün değilse (yeni makine alındı / eski kayıt) cihaz 2 SAYIM sorgusu yapar
//     (toplam kripto makinesi + bugün tetiklenen) → ~2 okuma; sonuç gün boyu bellekte kalır.
// =============================================================================

const countCache = new Map(); // `${uid}|${day}|${minTrig}` → boolean (kripto makinelerinin hepsi tetiklendi mi)

export function useMyFactoryRunNeeded(todayKey) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [factory, setFactory] = useState(undefined); // undefined = yükleniyor, null = yok
  const [miningDone, setMiningDone] = useState(null);

  useEffect(() => {
    if (!uid) {
      setFactory(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'factories', uid),
      (snap) => setFactory(snap.exists() ? snap.data() : null),
      () => setFactory(null)
    );
  }, [uid]);

  const minTrig = factory?.minTrig || null;
  const hasFactory = Boolean(factory);
  useEffect(() => {
    if (!uid || !hasFactory) {
      setMiningDone(null);
      return undefined;
    }
    if (minTrig === todayKey) {
      setMiningDone(true);
      return undefined;
    }
    const key = `${uid}|${todayKey}|${minTrig}`;
    if (countCache.has(key)) {
      setMiningDone(countCache.get(key));
      return undefined;
    }
    let alive = true;
    const base = query(collection(db, 'factories', uid, 'machines'), where('type', '==', 'mining'));
    Promise.all([getCountFromServer(base), getCountFromServer(query(base, where('miningTriggeredDateKey', '==', todayKey)))])
      .then(([all, done]) => {
        const total = Number(all.data().count || 0);
        const ok = total === 0 || Number(done.data().count || 0) >= total;
        countCache.set(key, ok);
        if (alive) setMiningDone(ok);
      })
      .catch(() => {
        if (alive) setMiningDone(true); // okunamazsa hatırlatma gösterme (yanlış uyarı vermeyelim)
      });
    return () => {
      alive = false;
    };
  }, [uid, hasFactory, minTrig, todayKey]);

  if (!factory || miningDone === null) return false;
  const dmN = Math.max(0, Math.floor(Number(factory.dm?.n) || 0));
  const dmDone = dmN === 0 || factory.dm?.trig === todayKey;
  return !(miningDone && dmDone);
}
