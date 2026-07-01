import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useInventory } from '../../hooks/useInventory';
import { upgradeVehicle, sellMaterial } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import HeistPanel from '../HeistPanel/HeistPanel';
import './GarageScreen.css';

const SELL_PRICE = 250; // Bölüm 8.2

export default function GarageScreen() {
  const { user } = useAuth();
  const { vehicles } = useVehicles();
  const { inventory } = useInventory();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Araç geliştirmek için giriş yapmalısın." />;
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

  const vitesQty = inventory.vitesUpgrade || 0;
  const depoQty = inventory.depoUpgrade || 0;

  return (
    <div className="garage-screen">
      <div className="garage-inventory">
        <div className="garage-material">
          <span>Vites malzemesi: {vitesQty}</span>
          {vitesQty > 0 && (
            <button
              className="garage-sell-btn"
              disabled={busy === 'sell-vites'}
              onClick={() => run('sell-vites', () => sellMaterial('vitesUpgrade', vitesQty))}
            >
              Hepsini Sat ({(vitesQty * SELL_PRICE).toLocaleString('tr-TR')} altın)
            </button>
          )}
        </div>
        <div className="garage-material">
          <span>Depo malzemesi: {depoQty}</span>
          {depoQty > 0 && (
            <button
              className="garage-sell-btn"
              disabled={busy === 'sell-depo'}
              onClick={() => run('sell-depo', () => sellMaterial('depoUpgrade', depoQty))}
            >
              Hepsini Sat ({(depoQty * SELL_PRICE).toLocaleString('tr-TR')} altın)
            </button>
          )}
        </div>
      </div>

      {vehicles.length === 0 ? (
        <p className="garage-hint">
          Henüz bir araca sahip değilsin. Önce <strong>Araba Galerisi</strong>'nden bir araç al.
        </p>
      ) : (
        vehicles.map((v) => (
          <div key={v.id} className="garage-vehicle">
            <span className="garage-vehicle-name">{v.model}</span>
            <span className="garage-vehicle-stats">
              Vites {v.gearLevel} · Depo {v.baseTank + (v.tankBonus || 0)}L
            </span>
            <div className="garage-vehicle-actions">
              <button
                className="garage-action"
                disabled={v.gearUpgraded || vitesQty < 2 || busy === `${v.id}-gear`}
                onClick={() => run(`${v.id}-gear`, () => upgradeVehicle(v.id, 'gear'))}
              >
                {v.gearUpgraded ? 'Vites Geliştirildi' : 'Vites Geliştir (2 malzeme)'}
              </button>
              <button
                className="garage-action"
                disabled={v.tankUpgraded || depoQty < 2 || busy === `${v.id}-tank`}
                onClick={() => run(`${v.id}-tank`, () => upgradeVehicle(v.id, 'tank'))}
              >
                {v.tankUpgraded ? 'Depo Geliştirildi' : 'Depo Geliştir (2 malzeme)'}
              </button>
            </div>
          </div>
        ))
      )}
      {error && <p className="garage-error">{error}</p>}
      <HeistPanel target="modifiye_garaji" />
    </div>
  );
}
