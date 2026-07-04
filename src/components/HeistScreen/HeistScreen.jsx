import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWeapons } from '../../hooks/useWeapons';
import { useOpenHeistPlanCounts } from '../../hooks/useOpenHeistPlanCounts';
import HeistPanel, { HEIST_LABELS } from '../HeistPanel/HeistPanel';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './HeistScreen.css';

// Sadece soygun hedefleri — silah geliştirme artık burada değil, Profil'de.
export default function HeistScreen({ initialTarget, onClose }) {
  const { user } = useAuth();
  const { weapons } = useWeapons();
  const planCounts = useOpenHeistPlanCounts();
  const [selected, setSelected] = useState(initialTarget || null);

  useEffect(() => {
    if (initialTarget) setSelected(initialTarget);
  }, [initialTarget]);

  if (!user) {
    return (
      <div className="heist-screen-backdrop" onClick={onClose}>
        <div className="heist-screen" onClick={(e) => e.stopPropagation()}>
          <SignInPrompt message="Soygun yapmak için giriş yapmalısın." />
        </div>
      </div>
    );
  }

  const myPower = weapons.reduce((max, w) => Math.max(max, w.power || 0), 0);

  return (
    <div className="heist-screen-backdrop" onClick={onClose}>
      <div className="heist-screen" onClick={(e) => e.stopPropagation()}>
        <div className="heist-screen-header">
          <p className="heist-screen-power">
            Gücün: <strong>{myPower.toLocaleString('tr-TR')}</strong>
          </p>
          <button className="heist-screen-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {!selected && (
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
            <button className="heist-screen-back" onClick={() => setSelected(null)}>
              ← Tüm hedefler
            </button>
            <HeistPanel target={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
