import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

// BlocksContext — oyuncunun engellediği oyuncular (userBlocks/{uid}).
// TEK dinleyici: tüm uygulama bu sağlayıcıdan okur; sohbet/feed sorguları
// değişmez, filtreleme bellekte yapılır (bkz. docs/ugc-moderasyon/00-FAZ0-ANALIZ.md §3.2).
const EMPTY = { blockedMap: {}, list: [], isBlocked: () => false, ready: false };
const BlocksContext = createContext(EMPTY);

export function BlocksProvider({ children }) {
  const { user } = useAuth();
  const [blockedMap, setBlockedMap] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setBlockedMap({});
      setReady(false);
      return undefined;
    }
    const unsub = onSnapshot(
      doc(db, 'userBlocks', user.uid),
      (snap) => {
        setBlockedMap(snap.exists() ? snap.data()?.blocked || {} : {});
        setReady(true);
      },
      (err) => {
        // Kural/bağlantı hatası oyunu bozmasın: engelleme listesi boş kabul edilir
        console.error('userBlocks dinleme hatası:', err);
        setReady(true);
      }
    );
    return unsub;
  }, [user]);

  const value = useMemo(() => {
    const list = Object.entries(blockedMap)
      .map(([uid, v]) => ({ uid, name: v?.name || 'Oyuncu', at: v?.at || 0 }))
      .sort((a, b) => b.at - a.at);
    return { blockedMap, list, isBlocked: (uid) => Boolean(uid && blockedMap[uid]), ready };
  }, [blockedMap, ready]);

  return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>;
}

// Sağlayıcı yoksa (ör. önizleme ortamı) güvenli varsayılan döner: kimse engelli değil.
// eslint-disable-next-line react-refresh/only-export-components -- sağlayıcı ve hook birlikte (AuthContext ile aynı desen)
export function useBlocks() {
  return useContext(BlocksContext) || EMPTY;
}
