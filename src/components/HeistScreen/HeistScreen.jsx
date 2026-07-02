import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWeapons } from '../../hooks/useWeapons';
import HeistPanel, { HEIST_LABELS } from '../HeistPanel/HeistPanel';
import MyWeaponsPanel from './MyWeaponsPanel';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './HeistScreen.css';

export default function HeistScreen({ initialTarget, onClose }) {
  const { user } = useAuth();
  const { weapons } = useWeapons();
  const [selected, setSelected] = useState(initialTarget || null);
  const [view, setView] = useState('targets'); // 'targets' | 'weapons'

  useEffect(() => {
    if (initialTarget) {
      setSelected(initialTarget);
      setView('targets');
    }
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

        <div className="heist-screen-tabs">
          <button
            className={`heist-screen-tab${view === 'targets' ? ' active' : ''}`}
            onClick={() => {
              setView('targets');
              setSelected(null);
            }}
          >
            Hedefler
          </button>
          <button
            className={`heist-screen-tab${view === 'weapons' ? ' active' : ''}`}
            onClick={() => setView('weapons')}
          >
            Silahlarım
          </button>
        </div>

        {view === 'weapons' && <MyWeaponsPanel />}

        {view === 'targets' && !selected && (
          <div className="heist-screen-list">
            {Object.entries(HEIST_LABELS).map(([target, meta]) => (
              <button
                key={target}
                className="heist-target-card"
                onClick={() => setSelected(target)}
              >
                <span className="heist-target-name">{meta.title}</span>
                <span className="heist-target-meta">
                  Güvenlik: {meta.requiredPower.toLocaleString('tr-TR')} · Ödül:{' '}
                  {meta.reward.toLocaleString('tr-TR')} altın
                </span>
                <span className={`heist-target-status ${myPower >= meta.requiredPower ? 'ready' : ''}`}>
                  {myPower >= meta.requiredPower ? 'Gücün yetiyor' : 'Ekip gerekir'}
                </span>
              </button>
            ))}
          </div>
        )}

        {view === 'targets' && selected && (
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
