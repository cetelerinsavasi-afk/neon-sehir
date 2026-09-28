import { lazy, Suspense, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminUid } from '../../config/admin';
import HouseMaintenance from './HouseMaintenance';
import './HouseScreen.css';

// three.js ağır bir kütüphane — sadece eve GERÇEKTEN girebilecek kişiler
// (admin ya da admin'in davet ettiği oyuncu) için yüklenir.
const HouseScreen = lazy(() => import('./HouseScreen'));

export default function HouseGate({ onClose }) {
  const { user, loading } = useAuth();
  const [state, setState] = useState(() => (user && isAdminUid(user.uid) ? 'open' : 'checking'));

  useEffect(() => {
    if (loading) return undefined;
    if (!user) {
      setState('closed');
      return;
    }
    if (isAdminUid(user.uid)) {
      setState('open');
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'houseInvites', user.uid))
      .then((snap) => { if (!cancelled) setState(snap.exists() ? 'open' : 'closed'); })
      .catch(() => { if (!cancelled) setState('closed'); });
    return () => { cancelled = true; };
  }, [user, loading]);

  if (state === 'closed') return <HouseMaintenance onClose={onClose} />;
  const loader = (
    <div className="hs-root">
      <div className="hs-loading">
        <div className="hs-spinner" />
        <p>Eve giriliyor…</p>
      </div>
    </div>
  );
  if (state === 'checking') return loader;
  return (
    <Suspense fallback={loader}>
      <HouseScreen onClose={onClose} />
    </Suspense>
  );
}
