import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useInventory } from '../../hooks/useInventory';
import { upgradeVehicle } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import './GarageScreen.css';

// Modifiye Garajı SADECE araç geliştirme yapılan bir yer — malzeme
// alım/satımı buradan kaldırıldı (alım: Telefon > Amazor, satım: Liman &
// Depo > Depo).
function requiredQty(vehicle) {
  // Fiyatla doğru orantılı: 1000₺ araba için 2 malzeme, 100.000₺ için 200.
  return Math.max(2, Math.round((vehicle.baseGalleryValue || 0) / 500));
}

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
      <p className="garage-hint">
        Elindeki malzeme: Vites {vitesQty} · Depo {depoQty}
        <InfoIcon text="Malzeme almak için Telefon > Amazor'a, satmak için Liman & Depo > Depo'ya git." />
      </p>

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
                disabled={v.gearUpgraded || vitesQty < requiredQty(v) || busy === `${v.id}-gear`}
                onClick={() => run(`${v.id}-gear`, () => upgradeVehicle(v.id, 'gear'))}
              >
                {v.gearUpgraded ? 'Vites Geliştirildi' : `Vites Geliştir (${requiredQty(v)} malzeme)`}
              </button>
              <button
                className="garage-action"
                disabled={v.tankUpgraded || depoQty < requiredQty(v) || busy === `${v.id}-tank`}
                onClick={() => run(`${v.id}-tank`, () => upgradeVehicle(v.id, 'tank'))}
              >
                {v.tankUpgraded ? 'Depo Geliştirildi' : `Depo Geliştir (${requiredQty(v)} malzeme)`}
              </button>
            </div>
          </div>
        ))
      )}
      {error && <p className="garage-error">{error}</p>}
    </div>
  );
}
