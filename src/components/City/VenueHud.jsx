// =============================================================================
// v160.3 — MEKÂN İÇİ (ev, işletme, ofis, karargah) şehirdeki gibi:
//   • Hatırlatmalar (Görevler) sağ sütunun en üstünde
//   • Sağ altta Çeteler · Soygun · Profil (şehirdeki yan çubuk)
//   Hatırlatmadaki "Git": çete / teşkilat → Çeteler paneli; diğerleri → mekândan çıkıp şehirde o yere.
// =============================================================================
import { Suspense, lazy, useState } from 'react';
import OnboardingPanel from '../OnboardingPanel/OnboardingPanel';
import { useGangAlertsCtx } from '../Gangs/alerts';
import { retryImport } from '../../lib/lazyRetry';
import './City.css';

const GangPanel = lazy(retryImport(() => import('../Gangs/GangPanel')));
const MekanlarScreen = lazy(retryImport(() => import('../MekanlarScreen/MekanlarScreen')));
const ProfileFullScreen = lazy(retryImport(() => import('../ProfileFullScreen/ProfileFullScreen')));

const goCity = (target, visit = false) => window.dispatchEvent(new CustomEvent('neon-venue-go', { detail: { target, visit } }));
const enterGangHq = (g) => window.dispatchEvent(new CustomEvent('neon-enter-gang-hq', { detail: { gangId: g?.id } }));

// Hatırlatmalar düğmesi (sağ sütuna konur)
export function VenueReminders({ onGang }) {
  const alerts = useGangAlertsCtx();
  return (
    <OnboardingPanel
      inline
      gangReminders={alerts?.reminders}
      gangChans={alerts?.chans}
      onGo={(t) => {
        if (t === 'gang' || t === 'intel') return onGang(t);
        goCity(t);
        return undefined;
      }}
    />
  );
}

// Çeteler · Soygun · Profil + açtıkları pencereler
export function VenueDock({ gangStart, setGangStart }) {
  const alerts = useGangAlertsCtx();
  const [panel, setPanel] = useState(null); // 'soygun' | 'profile'
  const [mekTab, setMekTab] = useState('soygun');
  return (
    <>
      <div className="cs-dock cs-dock-side hs-venue-dock">
        <button className="cs-dock-btn" onClick={() => setGangStart({ tab: 'ceteler' })}>
          <span>🏴</span>Çeteler
          {alerts?.any && <i className="cs-dock-dot" />}
        </button>
        <button
          className="cs-dock-btn"
          onClick={() => {
            setMekTab('soygun');
            setPanel('soygun');
          }}
        >
          <span>💰</span>Soygun
        </button>
        <button className="cs-dock-btn" onClick={() => setPanel('profile')}>
          <span>👤</span>Profil
        </button>
      </div>
      <Suspense fallback={null}>
        {gangStart && <GangPanel start={gangStart} onClose={() => setGangStart(null)} onEnterHq={(g) => {
          setGangStart(null);
          enterGangHq(g);
        }} />}
        {panel === 'soygun' && (
          <div className="cs-panel-layer hs-venue-layer">
            <MekanlarScreen
              tab={mekTab}
              onTabChange={setMekTab}
              initialHeistTarget={null}
              onClose={() => setPanel(null)}
              onVisitVenue={(k) => {
                setPanel(null);
                goCity(k, true);
              }}
              onVisitHouse={(id) => {
                setPanel(null);
                window.dispatchEvent(new CustomEvent('neon-open-house', { detail: { houseId: id } }));
              }}
              onVisitHq={(gid) => {
                setPanel(null);
                enterGangHq({ id: gid });
              }}
            />
          </div>
        )}
        {panel === 'profile' && (
          <div className="cs-sheet-back hs-venue-layer" onClick={() => setPanel(null)}>
            <div className="cs-sheet-box" onClick={(e) => e.stopPropagation()}>
              <ProfileFullScreen onClose={() => setPanel(null)} />
            </div>
          </div>
        )}
      </Suspense>
    </>
  );
}
