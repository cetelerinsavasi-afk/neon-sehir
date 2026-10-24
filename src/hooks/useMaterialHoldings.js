import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { MATERIAL_HOLDER_BIZ, usableMaterials } from '../../functions/materials.js';

// v124 — Oyuncunun fabrika + silahçı/modifiyeci sahipliği → kullanabildiği
// malzemeler. Mağaza açılınca BİR KEZ okunur (canlı dinleyici yok — Firebase
// maliyeti). Sunucu her alım/ilanda aynı kuralı yeniden doğrular.
export function useMaterialHoldings() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [state, setState] = useState({ loading: true, hasFactory: false, bizTypes: [], usable: new Set() });
  useEffect(() => {
    if (!uid) {
      setState({ loading: false, hasFactory: false, bizTypes: [], usable: new Set() });
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const [fac, hs] = await Promise.all([getDoc(doc(db, 'factories', uid)), getDocs(query(collection(db, 'houses'), where('ownerUid', '==', uid), limit(50)))]);
        const bizTypes = hs.docs.map((d) => d.data()?.biz?.type).filter((t) => MATERIAL_HOLDER_BIZ.includes(t));
        const holdings = { hasFactory: fac.exists(), bizTypes };
        if (alive) setState({ loading: false, ...holdings, usable: usableMaterials(holdings) });
      } catch {
        if (alive) setState({ loading: false, hasFactory: false, bizTypes: [], usable: new Set() });
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);
  return state;
}
