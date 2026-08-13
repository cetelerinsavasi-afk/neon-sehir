import { useEffect, useState } from 'react';
import { useWeapons } from '../../hooks/useWeapons';
import { useOpenHeistPlanCounts } from '../../hooks/useOpenHeistPlanCounts';
import { useMyActiveHeistPlans } from '../../hooks/useMyActiveHeistPlan';
import HeistPanel, { HEIST_LABELS } from '../HeistPanel/HeistPanel';
import GuestOverlay from '../GuestOverlay/GuestOverlay';
import './HeistScreen.css';

// Sadece soygun hedefleri — silah geliştirme artık burada değil, Profil'de.
// Giriş yapmamış (misafir) oyuncular hedef listesini ve soygun panelini
// salt-okunur görebilir; GuestOverlay tüm gerçek aksiyonları (soygun
// planlama/katılma/başlatma) engelleyip giriş kartı gösterir. Başlık
// (güç, kapatma ✕) her zaman GuestOverlay'in dışında/üstünde kalır ki
// misafir oyuncu paneli her zaman kapatabilsin (bkz. HeistScreen.css
// .heist-screen-close z-index).
export default function HeistScreen({ initialTarget, onClose }) {
  const { weapons } = useWeapons();
  const planCounts = useOpenHeistPlanCounts();
  const myActivePlans = useMyActiveHeistPlans();
  const [selected, setSelected] = useState(initialTarget || null);
  const [showMyPlans, setShowMyPlans] = useState(false);

  useEffect(() => {
    if (initialTarget) {
      setSelected(initialTarget);
      setShowMyPlans(false);
    }
  }, [initialTarget]);

  const myPower = weapons.reduce((max, w) => Math.max(max, w.power || 0), 0);

  return (
    <div className="heist-screen-backdrop" onClick={onClose}>
      <div className="heist-screen" onClick={(e) => e.stopPropagation()}>
        <div className="heist-screen-header">
          <p className="heist-screen-power">
            Gücün: <strong>{myPower.toLocaleString('tr-TR')}</strong>
          </p>
          {myActivePlans.length > 0 && (
            <button
              className="heist-screen-myplan-btn"
              onClick={() => {
                if (myActivePlans.length === 1) {
                  setSelected(myActivePlans[0].target);
                  setShowMyPlans(false);
                } else {
                  setSelected(null);
                  setShowMyPlans(true);
                }
              }}
            >
              Ekip Soygunlarım{myActivePlans.length > 1 ? ` (${myActivePlans.length})` : ''}
            </button>
          )}
          <button className="heist-screen-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <GuestOverlay>
          <>
            {showMyPlans && !selected && (
              <div className="heist-screen-list">
                <p className="heist-screen-myplans-hint">
                  Şu an {myActivePlans.length} farklı hedefte açık ekip soygun planın var:
                </p>
                {myActivePlans.map((p) => {
                  const meta = HEIST_LABELS[p.target];
                  return (
                    <button
                      key={p.planId}
                      className="heist-target-card"
                      onClick={() => {
                        setSelected(p.target);
                        setShowMyPlans(false);
                      }}
                    >
                      <span className="heist-target-name">{meta?.title || p.target}</span>
                      {meta && (
                        <span className="heist-target-meta">
                          Güvenlik: {meta.requiredPower.toLocaleString('tr-TR')} · Ödül:{' '}
                          {meta.reward.toLocaleString('tr-TR')} altın · Şüphe: +{meta.suspicionCost}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button className="heist-screen-back" onClick={() => setShowMyPlans(false)}>
                  ← Tüm hedefler
                </button>
              </div>
            )}

            {!selected && !showMyPlans && (
              <div className="heist-screen-list">
                {Object.entries(HEIST_LABELS).map(([target, meta]) => (
                  <button
                    key={target}
                    className="heist-target-card"
                    onClick={() => setSelected(target)}
                  >
                    <span className="heist-target-name">
                      {meta.title}
                      {planCounts[target] > 0 && (
                        <span className="heist-target-plan-badge">({planCounts[target]})</span>
                      )}
                    </span>
                    <span className="heist-target-meta">
                      Güvenlik: {meta.requiredPower.toLocaleString('tr-TR')} · Ödül:{' '}
                      {meta.reward.toLocaleString('tr-TR')} altın · Şüphe: +{meta.suspicionCost}
                    </span>
                    <span className={`heist-target-status ${myPower >= meta.requiredPower ? 'ready' : ''}`}>
                      {myPower >= meta.requiredPower ? 'Gücün yetiyor' : 'Ekip gerekir'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="heist-screen-detail">
                <button
                  className="heist-screen-back"
                  onClick={() => {
                    setSelected(null);
                    setShowMyPlans(false);
                  }}
                >
                  ← Tüm hedefler
                </button>
                <HeistPanel target={selected} />
              </div>
            )}
          </>
        </GuestOverlay>
      </div>
    </div>
  );
}
