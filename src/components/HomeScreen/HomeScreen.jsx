import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { upgradeVehicle, upgradeWeapon, repairItem, setDisplayName } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import VehicleCard, { LifeBar, MAX_REPAIRS, repairRequiredQty } from '../VehicleCard/VehicleCard';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import AvatarBuilder from '../AvatarBuilder/AvatarBuilder';
import './HomeScreen.css';

const MATERIAL_LABELS = {
  tamirMalzemesi: 'Tamir Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  arabaGelistirme: 'Araba Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
};
const MATERIAL_EMOJIS = {
  tamirMalzemesi: '🔧',
  silahUpgrade: '🔫',
  arabaGelistirme: '🚗',
  yasakliMadde: '💊',
};

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

function WeaponCard({ weapon, materialQty, repairQty, busy, onUpgrade, onRepair }) {
  const requiredQty = Math.round(weapon.basePrice / 100);
  const img = weaponImage(weapon.catalogId);
  const nextMultiplier = weapon.level === 1 ? 1.5 : 2;
  const nextPower = Math.round(weapon.basePower * nextMultiplier);
  const powerGain = nextPower - weapon.power;
  const repairsUsed = weapon.repairsUsed || 0;
  const repairReq = repairRequiredQty(weapon.basePrice);
  const repairMaxed = repairsUsed >= MAX_REPAIRS;
  return (
    <div className="home-item-card">
      {img && <img className="home-item-photo" src={img} alt={weapon.name} />}
      <div className="home-item-body">
        <span className="home-item-name">
          {weapon.name} <span className="home-item-level">Sv. {weapon.level}</span>
        </span>
        <span className="home-item-stats">Güç: {weapon.power.toLocaleString('tr-TR')}</span>
        <LifeBar item={weapon} />
        <div className="home-controls">
          <button
            className="home-btn small"
            disabled={weapon.level >= 3 || materialQty < requiredQty || busy === `${weapon.id}-w`}
            onClick={() => onUpgrade(weapon.id)}
          >
            {weapon.level >= 3
              ? 'Maks. Seviye'
              : `Geliştir (${requiredQty} malzeme) +${powerGain.toLocaleString('tr-TR')} güç`}
          </button>
          <button
            className="home-btn small"
            disabled={repairMaxed || repairQty < repairReq || busy === `${weapon.id}-repair`}
            onClick={() => onRepair(weapon.id)}
          >
            {repairMaxed ? 'Tamir Hakkı Bitti' : `Tamir Et (${repairReq} malzeme) +5 gün`}
          </button>
        </div>
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

  const myVehicles = vehicles.filter((v) => !v.listed);
  const myWeapons = weapons.filter((w) => !w.listed);

  const materialsQty = {
    araba: inventory.arabaGelistirme || 0,
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
        {myVehicles.length === 0 && <p className="home-hint">Henüz bir aracın yok.</p>}
        {myVehicles.map((v) => (
          <VehicleCard
            key={v.id}
            vehicle={v}
            materialsQty={materialsQty}
            repairQty={inventory.tamirMalzemesi || 0}
            busy={busy}
            onUpgrade={(id, type) => run(`${id}-${type}`, () => upgradeVehicle(id, type))}
            onRepair={(id) => run(`${id}-repair`, () => repairItem('vehicle', id))}
          />
        ))}
      </div>

      <div className="home-section">
        <p className="home-section-title">Silahların</p>
        {myWeapons.length === 0 && <p className="home-hint">Henüz bir silahın yok.</p>}
        {myWeapons.map((w) => (
          <WeaponCard
            key={w.id}
            weapon={w}
            materialQty={inventory.silahUpgrade || 0}
            repairQty={inventory.tamirMalzemesi || 0}
            busy={busy}
            onUpgrade={(id) => run(`${id}-w`, () => upgradeWeapon(id))}
            onRepair={(id) => run(`${id}-repair`, () => repairItem('weapon', id))}
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
