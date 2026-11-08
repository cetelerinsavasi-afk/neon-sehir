// =============================================================================
// v146 — Çete karargahına giriş: sunucu karargahı hazırlar (yoksa boş kurar),
// sonra 3D ev ekranı açılır. Savaş › Davetler'den başka bir çetenin karargahına
// geçilebilir (aynı ekran, farklı mekân).
// =============================================================================
import { Suspense, lazy, useEffect, useState } from 'react';
import { houseAction } from '../../services/gameActions';
import { retryImport } from '../../lib/lazyRetry';
import '../HouseScreen/HouseScreen.css';

const HouseScreen = lazy(retryImport(() => import('../HouseScreen/HouseScreen')));

function Loading({ text = 'Karargaha giriliyor…' }) {
  return (
    <div className="hs-root">
      <div className="hs-loading">
        <div className="hs-spinner" />
        <p>{text}</p>
      </div>
    </div>
  );
}

export default function GangHq({ gangId, onExit, initialHouseId = null }) {
  const [houseId, setHouseId] = useState(initialHouseId);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (houseId) return undefined;
    let alive = true;
    houseAction({ op: 'hqEnsure', gangId: gangId || undefined })
      .then((r) => alive && setHouseId(r.data?.houseId || null))
      .catch((e) => alive && setErr(e?.message || 'Karargaha girilemedi.'));
    return () => {
      alive = false;
    };
  }, [houseId, gangId]);
  useEffect(() => {
    if (!err) return undefined;
    const t = setTimeout(() => onExit?.(err), 1800);
    return () => clearTimeout(t);
  }, [err, onExit]);
  if (err) return <Loading text={err} />;
  if (!houseId) return <Loading />;
  return (
    <Suspense fallback={<Loading />}>
      <HouseScreen key={houseId} houseId={houseId} onExit={() => onExit?.()} onSwitchHouse={(id) => setHouseId(id)} />
    </Suspense>
  );
}
