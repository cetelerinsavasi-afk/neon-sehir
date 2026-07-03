import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { weaponCatalog } from '../../data/weaponCatalog';
import { buyWeapon } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './WeaponShopScreen.css';

// Silah Mağazası SADECE silah SATIN ALMA yeri — geliştirme Profil'den
// yapılıyor.
export default function WeaponShopScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Silah satın almak için giriş yapmalısın." />;
  }

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  const gold = player?.gold ?? 0;

  return (
    <div className="weapon-shop">
      {weaponCatalog.map((w) => (
        <div key={w.id} className="weapon-card">
          <img className="weapon-card-image" src={w.image} alt={w.name} />
          <div className="weapon-card-info">
            <span className="weapon-card-name">{w.name}</span>
            <span className="weapon-card-stats">
              Güç {w.power.toLocaleString('tr-TR')} · {w.price.toLocaleString('tr-TR')} altın
            </span>
          </div>
          <button
            className="weapon-card-buy"
            disabled={busy === `buy-${w.id}` || gold < w.price}
            onClick={() => run(`buy-${w.id}`, () => buyWeapon(w.id))}
          >
            {busy === `buy-${w.id}` ? '…' : 'Satın Al'}
          </button>
        </div>
      ))}

      {error && <p className="weapon-shop-error">{error}</p>}
    </div>
  );
}
