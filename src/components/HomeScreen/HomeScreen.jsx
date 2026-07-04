import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { upgradeVehicle, upgradeWeapon, setDisplayName } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { weaponCatalog } from '../../data/weaponCatalog';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import AvatarBuilder from '../AvatarBuilder/AvatarBuilder';
import './HomeScreen.css';

const MATERIAL_LABELS = {
  depoUpgrade: 'Depo Geliştirme Malzemesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
};
const MATERIAL_EMOJIS = {
  depoUpgrade: '📦',
  vitesUpgrade: '⚙️',
  silahUpgrade: '🔧',
  yasakliMadde: '💊',
};

function vehicleImage(catalogId) {
  return vehicleCatalog.find((v) => v.id === catalogId)?.image;
}
function weaponImage(catalogId) {
  return weaponCatalog.find((w) => w.id === catalogId)?.image;
}

function ProfileHeader({ player, onEditAvatar }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await setDisplayName(name.trim());
      setEditingName(false);
      setName('');
    } catch (err) {
      setError(err.message || 'İsim kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-profile-header">
      <div className="home-avatar-frame">
        <AvatarSvg avatar={player?.avatar} />
      </div>

      {editingName ? (
        <div className="home-name-edit-row">
          <input
            type="text"
            className="home-name-input"
            placeholder={player?.displayName || 'İsim'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
          />
          <button className="home-btn small" disabled={busy || !name.trim()} onClick={handleSave}>
            Kaydet
          </button>
          <button className="home-btn small" disabled={busy} onClick={() => setEditingName(false)}>
            Vazgeç
          </button>
        </div>
      ) : (
        <p className="home-profile-name">
          {player?.displayName || 'İsimsiz'}
          <button
            className="home-name-edit-btn"
            onClick={() => setEditingName(true)}
            aria-label="İsmi düzenle"
          >
            ✏️
          </button>
        </p>
      )}
      {error && <p className="home-error">{error}</p>}

      <button className="home-btn" onClick={onEditAvatar}>
        🎭 Avatarımı Düzenle
      </button>
    </div>
  );
}

function vehicleRequiredQty(vehicle) {
  // Fiyatla doğru orantılı: 1000₺ araba için 2 malzeme, 100.000₺ için 200.
  return Math.max(2, Math.round((vehicle.baseGalleryValue || 0) / 500));
}

function VehicleCard({ vehicle, materialsQty, busy, onUpgrade }) {
  const req = vehicleRequiredQty(vehicle);
  const img = vehicleImage(vehicle.catalogId);
  return (
    <div className="home-item-card">
      {img && <img className="home-item-photo" src={img} alt={vehicle.model} />}
      <div className="home-item-body">
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
            {vehicle.gearUpgraded ? 'Vites Geliştirildi' : `Vites Geliştir (${req} malzeme) +1 vites`}
          </button>
          <button
            className="home-btn small"
            disabled={vehicle.tankUpgraded || materialsQty.depo < req || busy === `${vehicle.id}-tank`}
            onClick={() => onUpgrade(vehicle.id, 'tank')}
          >
            {vehicle.tankUpgraded ? 'Depo Geliştirildi' : `Depo Geliştir (${req} malzeme) +50 depo`}
          </button>
        </div>
      </div>
    </div>
  );
}

function WeaponCard({ weapon, materialQty, busy, onUpgrade }) {
  const requiredQty = Math.round(weapon.basePrice / 100);
  const img = weaponImage(weapon.catalogId);
  const nextMultiplier = weapon.level === 1 ? 1.5 : 2;
  const nextPower = Math.round(weapon.basePower * nextMultiplier);
  const powerGain = nextPower - weapon.power;
  return (
    <div className="home-item-card">
      {img && <img className="home-item-photo" src={img} alt={weapon.name} />}
      <div className="home-item-body">
        <span className="home-item-name">
          {weapon.name} <span className="home-item-level">Sv. {weapon.level}</span>
        </span>
        <span className="home-item-stats">Güç: {weapon.power.toLocaleString('tr-TR')}</span>
        <button
          className="home-btn small"
          disabled={weapon.level >= 3 || materialQty < requiredQty || busy === `${weapon.id}-w`}
          onClick={() => onUpgrade(weapon.id)}
        >
          {weapon.level >= 3
            ? 'Maks. Seviye'
            : `Geliştir (${requiredQty} malzeme) +${powerGain.toLocaleString('tr-TR')} güç`}
        </button>
      </div>
    </div>
  );
}

// Ev / Profil — şu an aynı işleve sahip. Polislik başvurusu artık burada
// değil, Karakol'da.
export default function HomeScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { vehicles } = useVehicles();
  const { weapons } = useWeapons();
  const { inventory } = useInventory();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [editingAvatar, setEditingAvatar] = useState(false);

  if (!user) {
    return <SignInPrompt message="Evine girmek için giriş yapmalısın." />;
  }

  if (editingAvatar) {
    return <AvatarBuilder onBack={() => setEditingAvatar(false)} />;
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
      <ProfileHeader player={player} onEditAvatar={() => setEditingAvatar(true)} />

      <div className="home-referral-box">
        <span className="home-referral-emoji">🎁</span>
        <p className="home-hint">
          Referans Kodun: <strong>{player?.displayName || '—'}</strong> — bu kodu kullanarak
          katılan her yeni oyuncu için <strong>2000 altın</strong> kazanırsın!
        </p>
      </div>

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
          <div key={key} className="home-material-row">
            <span className="home-material-emoji">{MATERIAL_EMOJIS[key]}</span>
            <span className="home-hint">
              {label}: {inventory[key] || 0}
            </span>
          </div>
        ))}
      </div>

      {error && <p className="home-error">{error}</p>}
    </div>
  );
}
