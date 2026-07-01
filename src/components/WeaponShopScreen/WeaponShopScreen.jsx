import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { weaponCatalog } from '../../data/weaponCatalog';
import {
  buyWeapon,
  upgradeWeapon,
  buySilahMaterial,
  sellSilahMaterial,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './WeaponShopScreen.css';

export default function WeaponShopScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { weapons } = useWeapons();
  const { inventory } = useInventory();
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
  const materialQty = inventory.silahUpgrade || 0;

  return (
    <div className="weapon-shop">
      <div className="weapon-shop-material">
        <span>Gelişim malzemesi: {materialQty}</span>
        <div className="weapon-shop-material-buttons">
          <button
            className="weapon-shop-small-btn"
            disabled={busy === 'buy-material' || gold < 100}
            onClick={() => run('buy-material', buySilahMaterial)}
          >
            Al (100 altın)
          </button>
          <button
            className="weapon-shop-small-btn"
            disabled={busy === 'sell-material' || materialQty < 1}
            onClick={() => run('sell-material', sellSilahMaterial)}
          >
            Sat (50 altın)
          </button>
        </div>
      </div>

      <p className="weapon-shop-heading">Mağaza</p>
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

      {weapons.length > 0 && (
        <>
          <p className="weapon-shop-heading">Silahlarım</p>
          {weapons.map((w) => {
            const requiredQty = Math.round(w.basePrice / 100);
            return (
              <div key={w.id} className="weapon-owned-card">
                <div className="weapon-owned-info">
                  <span className="weapon-owned-name">
                    {w.name} <span className="weapon-owned-level">Seviye {w.level}</span>
                  </span>
                  <span className="weapon-owned-power">Güç: {w.power.toLocaleString('tr-TR')}</span>
                </div>
                <button
                  className="weapon-card-buy"
                  disabled={w.level >= 3 || materialQty < requiredQty || busy === `upgrade-${w.id}`}
                  onClick={() => run(`upgrade-${w.id}`, () => upgradeWeapon(w.id))}
                >
                  {w.level >= 3 ? 'Maks. Seviye' : `Geliştir (${requiredQty} malzeme)`}
                </button>
              </div>
            );
          })}
        </>
      )}

      {error && <p className="weapon-shop-error">{error}</p>}
    </div>
  );
}
