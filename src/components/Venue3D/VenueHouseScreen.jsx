import { lazy, Suspense, useEffect, useState } from 'react';
import { houseAction } from '../../services/gameActions';
import { VENUES } from '../../../functions/venueLayouts.js';
import '../HouseScreen/HouseScreen.css';

const HouseScreen = lazy(() => import('../HouseScreen/HouseScreen'));

// =============================================================================
// v92 Faz 8 — oyunun mekânına 3D giriş. Mekânın oyun evini (houses/game_*)
// sunucuda hazırlatır, sonra 3D ev ekranını açar. Sunucuya ulaşılamazsa eski
// 2D mekân (fallback) açılır — oyun hiçbir durumda girişsiz kalmaz.
// =============================================================================
function Loading({ text }) {
  return (
    <div className="hs-root">
      <div className="hs-loading">
        <div className="hs-spinner" />
        <p>{text}</p>
      </div>
    </div>
  );
}

export default function VenueHouseScreen({ venue, onExit, onOpenHeist, fallback }) {
  const v = VENUES[venue];
  const [state, setState] = useState('loading'); // loading | ready | failed
  useEffect(() => {
    let alive = true;
    houseAction({ op: 'venueEnsure', venue })
      .then(() => alive && setState('ready'))
      .catch((err) => {
        console.error('Mekân hazırlanamadı:', err);
        if (alive) setState('failed');
      });
    return () => {
      alive = false;
    };
  }, [venue]);
  if (!v) return fallback || null;
  if (state === 'failed') return fallback || null;
  if (state === 'loading') return <Loading text={`${v.name} — giriliyor…`} />;
  return (
    <Suspense fallback={<Loading text={`${v.name} — giriliyor…`} />}>
      <HouseScreen
        houseId={v.houseId}
        onExit={() => onExit?.()}
        onOpenHeist={
          onOpenHeist
            ? (target) => {
                // soygun ekranı mekânın altında kalmasın: önce mekândan çık
                onExit?.();
                onOpenHeist(target);
              }
            : undefined
        }
      />
    </Suspense>
  );
}
