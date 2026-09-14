import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// useMyFutbolTeam — KULLANICI REVİZESİ (Menajerlik Sistemi): bir oyuncu
// SAHİP OLDUĞU bir takım (ownedTeam) İLE menajerliğini yaptığı BAŞKA bir
// takımın (managedTeam) SADECE BİRİNE aynı anda sahip olabilir — sahiplik
// ve menajerlik birbirini DIŞLAR (takım sahipleri başka takımlara menajerlik
// yapamaz; bir menajer takım satın almak isterse önce istifa etmesi gerekir
// — bkz. functions/index.js: buyFutbolTeam / applyFutbolManager /
// requestFutbolManagerHandover'daki sunucu tarafı kontroller). Bu yüzden
// normal akışta ownedTeam ve managedTeam ASLA aynı anda dolu olmaz; yine de
// güvenlik/geriye dönük uyumluluk için iki dinleyici de ayrı tutuluyor —
// `team`/`role` bu ikisinden HANGİSİ doluysa onu döner (managedTeam öncelikli;
// pratikte fark etmez, çünkü ikisi asla birlikte dolu olmuyor).
export function useMyFutbolTeam() {
  const { user } = useAuth();
  const [ownedTeam, setOwnedTeam] = useState(null);
  const [managedTeam, setManagedTeam] = useState(null);
  const [ownedLoading, setOwnedLoading] = useState(true);
  const [managedLoading, setManagedLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOwnedTeam(null);
      setOwnedLoading(false);
      return undefined;
    }
    setOwnedLoading(true);
    const q = query(collection(db, 'futbolTeams'), where('ownerUid', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setOwnedTeam(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
        setOwnedLoading(false);
      },
      (err) => {
        console.error('useMyFutbolTeam (sahip) dinleme hatası:', err);
        setOwnedLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) {
      setManagedTeam(null);
      setManagedLoading(false);
      return undefined;
    }
    setManagedLoading(true);
    const q = query(collection(db, 'futbolTeams'), where('managerUid', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setManagedTeam(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
        setManagedLoading(false);
      },
      (err) => {
        console.error('useMyFutbolTeam (menajer) dinleme hatası:', err);
        setManagedLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  const loading = ownedLoading || managedLoading;
  const team = managedTeam || ownedTeam;
  const role = managedTeam ? 'manager' : ownedTeam ? 'owner' : null;

  return { ownedTeam, managedTeam, team, role, loading };
}
