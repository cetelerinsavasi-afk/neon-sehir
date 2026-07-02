import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { setDisplayName, upgradeVehicle, upgradeWeapon } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './HomeScreen.css';

const MATERIAL_LABELS = {
  depoUpgrade: 'Depo Geliştirme Malzemesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
};

function ProfileSection({ player }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await setDisplayName(name.trim());
      setOk(true);
      setName('');
    } catch (err) {
      setError(err.message || 'İsim kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-section">
      <p className="home-section-title">Profilin</p>
      <p className="home-hint">
        Şu anki oyun içi adın: <strong>{player?.displayName || '—'}</strong>
      </p>
      <div className="home-controls">
        <input
          type="text"
          placeholder="Yeni isim (3-20 karakter)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="home-input"
          maxLength={20}
        />
        <button className="home-btn" disabled={busy || !name.trim()} onClick={handleSave}>
          Kaydet
        </button>
      </div>
      <p className="home-hint">Her ismi sadece tek bir oyuncu kullanabilir.</p>
      {ok && <p className="home-success">İsmin güncellendi!</p>}
      {error && <p className="home-error">{error}</p>}
    </div>
  );
}

function vehicleRequiredQty(vehicle) {
  // Fiyatla doğru orantılı: 1000₺ araba için 2 malzeme, 100.000₺ için 200.
  return Math.max(2, Math.round((vehicle.baseGalleryValue || 0) / 500));
}

function VehicleCard({ vehicle, materialsQty, busy, onUpgrade }) {
  const req = vehicleRequiredQty(vehicle);
  return (
    <div className="home-item-card">
      <span className="home-item-name">{vehicle.model}</span>
      <span className="home-item-stats">
        Vites {vehicle.gearLevel} · Depo {vehicle.baseTank + (vehicle.tankBonus || 0)}L
        {vehicle.mortgaged && !vehicle.seizedByBank && ' · İpotekli'}
        {vehicle.seizedByBank && ' · Bankaya el konuldu'}
      </span>
      <div className="home-controls">
        <button
          className="home-btn small"
          disabled={vehicle.gearUpgraded || materialsQty.vites < req || busy === `${vehicle.id}-gear`}
          onClick={() => onUpgrade(vehicle.id, 'gear')}
        >
          {vehicle.gearUpgraded ? 'Vites Geliştirildi' : `Vites Geliştir (${req} malzeme)`}
        </button>
        <button
          className="home-btn small"
          disabled={vehicle.tankUpgraded || materialsQty.depo < req || busy === `${vehicle.id}-tank`}
          onClick={() => onUpgrade(vehicle.id, 'tank')}
        >
          {vehicle.tankUpgraded ? 'Depo Geliştirildi' : `Depo Geliştir (${req} malzeme)`}
        </button>
      </div>
    </div>
  );
}

function WeaponCard({ weapon, materialQty, busy, onUpgrade }) {
  const requiredQty = Math.round(weapon.basePrice / 100);
  return (
    <div className="home-item-card">
      <span className="home-item-name">
        {weapon.name} <span className="home-item-level">Sv. {weapon.level}</span>
      </span>
      <span className="home-item-stats">Güç: {weapon.power.toLocaleString('tr-TR')}</span>
      <button
        className="home-btn small"
        disabled={weapon.level >= 3 || materialQty < requiredQty || busy === `${weapon.id}-w`}
        onClick={() => onUpgrade(weapon.id)}
      >
        {weapon.level >= 3 ? 'Maks. Seviye' : `Geliştir (${requiredQty} malzeme)`}
      </button>
    </div>
  );
}

// Ev — oyuncunun profili. Polislik başvurusu artık burada değil, Karakol'da.
export default function HomeScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { vehicles } = useVehicles();
  const { weapons } = useWeapons();
  const { inventory } = useInventory();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Evine girmek için giriş yapmalısın." />;
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

  const materialsQty = {
    depo: inventory.depoUpgrade || 0,
    vites: inventory.vitesUpgrade || 0,
  };

  return (
    <div className="home-screen">
      <ProfileSection player={player} />

      <div className="home-section">
        <p className="home-section-title">Araçların</p>
        {vehicles.length === 0 && <p className="home-hint">Henüz bir aracın yok.</p>}
        {vehicles.map((v) => (
          <VehicleCard
            key={v.id}
            vehicle={v}
            materialsQty={materialsQty}
            busy={busy}
            onUpgrade={(id, type) => run(`${id}-${type}`, () => upgradeVehicle(id, type))}
          />
        ))}
      </div>

      <div className="home-section">
        <p className="home-section-title">Silahların</p>
        {weapons.length === 0 && <p className="home-hint">Henüz bir silahın yok.</p>}
        {weapons.map((w) => (
          <WeaponCard
            key={w.id}
            weapon={w}
            materialQty={inventory.silahUpgrade || 0}
            busy={busy}
            onUpgrade={(id) => run(`${id}-w`, () => upgradeWeapon(id))}
          />
        ))}
      </div>

      <div className="home-section">
        <p className="home-section-title">Malzemelerin</p>
        {Object.entries(MATERIAL_LABELS).map(([key, label]) => (
          <p key={key} className="home-hint">
            {label}: {inventory[key] || 0}
          </p>
        ))}
      </div>

      {error && <p className="home-error">{error}</p>}
    </div>
  );
}
