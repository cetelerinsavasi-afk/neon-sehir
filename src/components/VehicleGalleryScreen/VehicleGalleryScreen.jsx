import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { buyVehicle } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import HeistPanel from '../HeistPanel/HeistPanel';
import './VehicleGalleryScreen.css';

export default function VehicleGalleryScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { vehicles } = useVehicles();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Araç satın almak için giriş yapmalısın." />;
  }

  const ownedCatalogIds = new Set(vehicles.map((v) => v.catalogId));
  const gold = player?.gold ?? 0;

  const handleBuy = async (catalogId) => {
    setBusy(catalogId);
    setError(null);
    try {
      await buyVehicle(catalogId);
    } catch (err) {
      setError(err.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="vehicle-gallery">
      {vehicleCatalog.map((car) => {
        const owned = ownedCatalogIds.has(car.id);
        return (
          <div key={car.id} className="vehicle-card">
            <img className="vehicle-card-image" src={car.image} alt={car.name} />
            <div className="vehicle-card-info">
              <span className="vehicle-card-name">{car.name}</span>
              <span className="vehicle-card-stats">
                Vites {car.gearLevel} · Depo {car.baseTank}L · Bagaj {car.storage}
                {car.turboCount > 0 ? ` · ${car.turboCount} Turbo` : ''}
              </span>
              <span className="vehicle-card-price">{car.price.toLocaleString('tr-TR')} altın</span>
            </div>
            <button
              className="vehicle-card-buy"
              disabled={owned || busy === car.id || gold < car.price}
              onClick={() => handleBuy(car.id)}
            >
              {owned ? 'Sahipsin' : busy === car.id ? '…' : 'Satın Al'}
            </button>
          </div>
        );
      })}
      {error && <p className="vehicle-gallery-error">{error}</p>}
      <HeistPanel target="araba-galerisi" />
    </div>
  );
}
