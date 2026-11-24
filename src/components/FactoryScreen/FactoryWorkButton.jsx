// =============================================================================
// v196 — "ÇALIŞ" BUTONU: fabrikaya (şehirdeki bölgeye) giren herkes ekranın alt ortasında görür.
// Günde 1 kez: altın yakalama oyunu biter → 5.000 altın (functions/index.js factoryWork).
// Bugün çalıştı mı: dailyActions/{uid}_{gün} (tek okuma, buton görününce bir kez).
// =============================================================================
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import FactoryMiniGame from './FactoryMiniGame';
import { factoryWork } from '../../services/gameActions';
import './FactoryScreen.css';

const dayKey = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export default function FactoryWorkButton({ flash }) {
  const { user } = useAuth();
  const [done, setDone] = useState(null); // null: bilinmiyor
  const [game, setGame] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    getDoc(doc(db, 'dailyActions', `${user.uid}_${dayKey()}`))
      .then((s) => alive && setDone(Boolean(s.exists() && s.data()?.factoryWork)))
      .catch(() => alive && setDone(false));
    return () => {
      alive = false;
    };
  }, [user]);
  if (!user) return null;
  const finish = async () => {
    setGame(false);
    setBusy(true);
    try {
      const r = await factoryWork();
      setDone(true);
      flash?.(`⚒️ Mesai bitti: +${Number(r.data?.earned || 5000).toLocaleString('tr-TR')} altın.`);
    } catch (e) {
      if (/doldurdun/.test(e?.message || '')) setDone(true);
      flash?.(e?.message || 'Olmadı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="fw-work-wrap">
        <button className={`fw-work-btn${done ? ' done' : ''}`} disabled={busy || done !== false} onClick={() => setGame(true)}>
          {done ? '✅ Bugünkü mesai bitti' : busy ? '…' : '⚒️ Çalış · 5.000 altın'}
        </button>
      </div>
      {game && <FactoryMiniGame onComplete={finish} onClose={() => setGame(false)} />}
    </>
  );
}
