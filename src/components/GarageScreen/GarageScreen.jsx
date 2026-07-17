import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useInventory } from '../../hooks/useInventory';
import { upgradeVehicle, repairItem } from '../../services/gameActions';
import VehicleCard from '../VehicleCard/VehicleCard';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import './GarageScreen.css';

// Modifiye Garajı SADECE araç geliştirme (+ tamir) yapılan bir yer —
// malzeme alım/satımı buradan kaldırıldı (alım: Telefon > Amazor, satım:
// Liman & Depo > Depo). Araç kartları Profil (HomeScreen) ile BİREBİR
// AYNI paylaşılan <VehicleCard> bileşenini kullanır — resim, ömür barı
// ve tamir butonu dahil.
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

  const materialsQty = { vites: inventory.vitesUpgrade || 0, depo: inventory.depoUpgrade || 0 };
  const repairQty = inventory.tamirMalzemesi || 0;

  return (
    <div className="garage-screen">
      <p className="garage-hint">
        Elindeki malzeme: Vites {materialsQty.vites} · Depo {materialsQty.depo} · Tamir {repairQty}
        <InfoIcon text="Malzeme almak için Telefon > Amazor'a git." />
      </p>

      {vehicles.length === 0 ? (
        <p className="garage-hint">
          Henüz bir araca sahip değilsin. Önce <strong>Araba Galerisi</strong>'nden bir araç al.
        </p>
      ) : (
        vehicles.map((v) => (
          <VehicleCard
            key={v.id}
            vehicle={v}
            materialsQty={materialsQty}
            repairQty={repairQty}
            busy={busy}
            onUpgrade={(id, type) => run(`${id}-${type}`, () => upgradeVehicle(id, type))}
            onRepair={(id) => run(`${id}-repair`, () => repairItem('vehicle', id))}
          />
        ))
      )}
      {error && <p className="garage-error">{error}</p>}
    </div>
  );
}
