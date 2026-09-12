import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { buyVehicle } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './VehicleGalleryScreen.css';

// Kullanıcı revizesi: "galeriden sahip olduğumuz arabadan alamıyoruz ama
// 2. elden alabiliyoruz, bu açığı kapatmayalım, artık aynı arabadan 2 ya
// da daha fazla alabilelim" — eskiden burada aynı katalog modelinden
// sadece 1 adet sahip olunabildiği için buton "Sahipsin" yazıp
// kilitleniyordu (2. elde satılmış/listed bir araç bile bunu tetikleyip
// hatalı şekilde engel oluyordu). Artık böyle bir kısıtlama yok, galeriden
// istediğin kadar aynı modeli alabilirsin — sunucu tarafı (buyVehicle)
// da aynı şekilde güncellendi.
export default function VehicleGalleryScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Araç satın almak için giriş yapmalısın." />;
  }

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
      {vehicleCatalog.map((car) => (
        <div key={car.id} className="vehicle-card">
          <img className="vehicle-card-image" src={car.image} alt={car.name} />
          <div className="vehicle-card-info">
            <span className="vehicle-card-name">{car.name}</span>
            <span className="vehicle-card-stats">
              Vites {car.gearLevel} · Depo {car.baseTank}L
              {car.turboCount > 0 ? ` · ${car.turboCount} Turbo` : ''}
            </span>
            <span className="vehicle-card-price">{car.price.toLocaleString('tr-TR')} altın</span>
          </div>
          <button
            className="vehicle-card-buy"
            disabled={busy === car.id || gold < car.price}
            onClick={() => handleBuy(car.id)}
          >
            {busy === car.id ? '…' : 'Satın Al'}
          </button>
        </div>
      ))}
      {error && <p className="vehicle-gallery-error">{error}</p>}
    </div>
  );
}
