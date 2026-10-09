import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { setDisplayName } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import VehicleCard, { LifeBar, UpgradeCells } from '../VehicleCard/VehicleCard';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import AvatarBuilder from '../AvatarBuilder/AvatarBuilder';
import AccessoryShop from '../AccessoryShop/AccessoryShop';
import DeleteAccountRequest from '../DeleteAccountRequest/DeleteAccountRequest';
import BlockedPlayersList from '../BlockedPlayersList/BlockedPlayersList';
import AdminPanelEntry from '../AdminPanel/AdminPanelEntry';
import LegalLinks from '../LegalLinks/LegalLinks';
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

function ProfileHeader({ player, onEditAvatar, onAccessories }) {
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
      {/* v78 — evcil hayvan & aksesuar mağazası */}
      <button className="home-btn home-btn-acc" onClick={onAccessories}>
        🐾 Aksesuarlar
      </button>
    </div>
  );
}

// v77: profilde sadece ömür + "geliştirilebilir mi" (Sv.2 / Sv.3 hücreleri).
// Tamir ve geliştirme Silahçı Atölyesi'nde.
function WeaponCard({ weapon, locked = false }) {
  const img = weaponImage(weapon.catalogId);
  const lv = weapon.level || 1;
  return (
    <div className={`home-item-card${locked ? ' cue-dim cue-lock' : ''}`}>
      {img && <img className="home-item-photo" src={img} alt={weapon.name} />}
      <div className="home-item-body">
        <span className="home-item-name">
          {weapon.name} <span className="home-item-level">Sv. {weapon.level}</span>
        </span>
        <span className="home-item-stats">Güç: {weapon.power.toLocaleString('tr-TR')}</span>
        <LifeBar item={weapon} kind="weapon" />
        <UpgradeCells slots={[lv >= 2, lv >= 3]} kind="weapon" />
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
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [accShop, setAccShop] = useState(false);

  if (!user) {
    return <SignInPrompt message="Evine girmek için giriş yapmalısın." />;
  }

  if (editingAvatar) {
    return <AvatarBuilder onBack={() => setEditingAvatar(false)} />;
  }
  if (accShop) {
    return <AccessoryShop onBack={() => setAccShop(false)} />;
  }

  // v77: vitrindeki (dükkândaki) ürünler kilitli — soluk ve 🔒 ile gösterilir
  const myVehicles = vehicles.filter((v) => !v.listed || v.shopHouseId);
  const myWeapons = weapons.filter((w) => !w.listed || w.shopHouseId);

  return (
    <div className="home-screen">
      <ProfileHeader player={player} onEditAvatar={() => setEditingAvatar(true)} onAccessories={() => setAccShop(true)} />

      {/* UGC D3: yalnızca yetkililere görünür */}
      <AdminPanelEntry uid={user.uid} player={player} />

      <div className="home-referral-box">
        <span className="home-referral-emoji">🎁</span>
        <p className="home-hint">
          Referans Kodun: <strong>{player?.displayName || '—'}</strong> — bu kodu kullanarak
          katılan her yeni oyuncu için <strong>10.000 altın</strong> kazanırsın!
        </p>
      </div>

      <div className="home-section">
        <p className="home-section-title">Araçların</p>
        {myVehicles.length === 0 && <p className="home-hint">Henüz bir aracın yok.</p>}
        {myVehicles.map((v) => (
          <VehicleCard key={v.id} vehicle={v} locked={Boolean(v.shopHouseId)} />
        ))}
      </div>

      <div className="home-section">
        <p className="home-section-title">Silahların</p>
        {myWeapons.length === 0 && <p className="home-hint">Henüz bir silahın yok.</p>}
        {myWeapons.map((w) => (
          <WeaponCard key={w.id} weapon={w} locked={Boolean(w.shopHouseId)} />
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

      <BlockedPlayersList />

      <DeleteAccountRequest />

      {/* Play: gizlilik politikası ve hesap silme bağlantıları uygulama içinde de erişilebilir */}
      <LegalLinks />
    </div>
  );
}
