import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { setDisplayName } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { VehicleKindTabs, kindOfCar } from '../VehicleGalleryScreen/VehicleGalleryScreen'; // v169: galerideki 3 sekme
import VehicleCard, { LifeBar, UpgradeCells } from '../VehicleCard/VehicleCard';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import AvatarBuilder from '../AvatarBuilder/AvatarBuilder';
import AccessoryShop from '../AccessoryShop/AccessoryShop';
import DailyReport from '../DailyReport/DailyReport';
import DeleteAccountRequest from '../DeleteAccountRequest/DeleteAccountRequest';
import BlockedPlayersList from '../BlockedPlayersList/BlockedPlayersList';
import AdminPanelEntry from '../AdminPanel/AdminPanelEntry';
import AdminStoryReset from '../AdminPanel/AdminStoryReset'; // v168.1
import LegalLinks from '../LegalLinks/LegalLinks';
import { retryImport } from '../../lib/lazyRetry';
import { buildInviteText, shareInvite } from '../../lib/shareInvite'; // v203: Arkadaşını Davet Et
import './HomeScreen.css';

// v146 — Profil › Mobilyalar (3D katalog / three.js ana pakete girmesin diye ayrı parça)
const CostumeShop = lazy(retryImport(() => import('../CostumeShop/CostumeShop'))); // v160
const FurnitureScreen = lazy(retryImport(() => import('../Furniture/FurnitureScreen'))); // v196: mobilya pazarı devam

// v203 — "Arkadaşını Davet Et": sadece oyuncu dokununca paylaşır. Ödül mantığı değişmedi
// (sunucuda applyReferralCode); mesaj panelde gösterilen davet adını içerir.
function InviteShareButton({ inviteName }) {
  const [note, setNote] = useState('');
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const text = buildInviteText(inviteName);
  const onShare = async () => {
    if (!text) return;
    const r = await shareInvite(text);
    const msg = r === 'copied' ? 'Davet mesajı kopyalandı' : r === 'failed' ? 'Paylaşılamadı, tekrar dene' : '';
    clearTimeout(timer.current);
    setNote(msg);
    if (msg) timer.current = setTimeout(() => setNote(''), 2500);
  };
  return (
    <div className="home-referral-share">
      <button type="button" className="home-btn home-referral-share-btn" disabled={!text} onClick={onShare}>
        📤 Arkadaşını Davet Et
      </button>
      {note && (
        <span className="home-hint home-referral-share-note" role="status">
          {note}
        </span>
      )}
    </div>
  );
}

function weaponImage(catalogId) {
  return weaponCatalog.find((w) => w.id === catalogId)?.image;
}

// v161 — profildeki şüphe / saygınlık / zümrüt / altın: dokununca ne olduğu kısa bir etiketle
// görünür (2,5 sn sonra kaybolur). Aynı anda tek etiket açık kalır.
const STAT_TIP_EVENT = 'neon:stat-tip';
function StatChip({ label, children }) {
  const [show, setShow] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    const other = (e) => e.detail !== label && setShow(false);
    window.addEventListener(STAT_TIP_EVENT, other);
    return () => {
      window.removeEventListener(STAT_TIP_EVENT, other);
      clearTimeout(timer.current);
    };
  }, [label]);
  const tap = () => {
    window.dispatchEvent(new CustomEvent(STAT_TIP_EVENT, { detail: label }));
    clearTimeout(timer.current);
    setShow(true);
    timer.current = setTimeout(() => setShow(false), 2500);
  };
  return (
    <button type="button" className="home-stat" onClick={tap} aria-label={label} title={label}>
      {children}
      {show && (
        <span className="home-stat-tip" role="status">
          {label}
        </span>
      )}
    </button>
  );
}

function ProfileHeader({ player, onEditAvatar, onCostumes, onAccessories, onReport, onFurniture }) {
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

      {/* v157.4 — profilde şüphe · saygınlık · zümrüt · altın */}
      <div className="home-stats">
        <StatChip label="Şüphe">🕵️ <b>%{Math.max(0, Math.round(Number(player?.suspicion) || 0))}</b></StatChip>
        <StatChip label="Saygınlık">⭐ <b>{Math.round(Number(player?.reputation) || 0).toLocaleString('tr-TR')}</b></StatChip>
        <StatChip label="Zümrüt"><i className="emerald-icon" style={{ width: 14, height: 14 }} /> <b>{Math.round(Number(player?.emerald) || 0).toLocaleString('tr-TR')}</b></StatChip>
        <StatChip label="Altın"><i className="gold-coin-icon" style={{ width: 14, height: 14 }} /> <b>{Math.round(Number(player?.gold) || 0).toLocaleString('tr-TR')}</b></StatChip>
      </div>

      <button className="home-btn" onClick={onEditAvatar}>
        🎭 Avatarımı Düzenle
      </button>
      {/* v146 — yan yana kare butonlar: Aksesuarlar (v78) · Günlük Rapor (v92) · Mobilyalar */}
      <div className="home-sq-row">
        {/* v160 — Kostümler (hazır tipler, zümrütle) aksesuarlardan önce */}
        <button className="home-sq home-sq-cos" onClick={onCostumes}>
          <span>🎭</span>
          Kostümler
        </button>
        <button className="home-sq home-sq-acc" onClick={onAccessories}>
          <span>🐾</span>
          Aksesuarlar
        </button>
        <button className="home-sq home-sq-report" onClick={onReport}>
          <span>📊</span>
          Günlük Rapor
        </button>
        <button className="home-sq home-sq-furn" onClick={onFurniture}>
          <span>🛋️</span>
          Mobilyalar
        </button>
      </div>
    </div>
  );
}

// v169 — profilde Araçlar / Silahlar açılır-kapanır panel (açık/kapalı durumu cihazda hatırlanır)
function useFold(key) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`ns_fold_${key}`) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(`ns_fold_${key}`, o ? '0' : '1');
      } catch {
        /* yoksay */
      }
      return !o;
    });
  };
  return [open, toggle];
}
function FoldHead({ icon, title, count, open, onToggle }) {
  return (
    <button type="button" className={`home-fold-head${open ? ' open' : ''}`} onClick={onToggle} aria-expanded={open}>
      <span className="home-fold-icon">{icon}</span>
      <span className="home-fold-title">{title}</span>
      <span className="home-fold-count">{count}</span>
      <span className="home-fold-chev">▾</span>
    </button>
  );
}
const KIND_BY_ID = new Map(vehicleCatalog.map((c) => [c.id, kindOfCar(c)]));
const vehicleKind = (v) => KIND_BY_ID.get(Number(v.catalogId)) || 'araba';

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
  const [cosShop, setCosShop] = useState(false); // v160
  const [report, setReport] = useState(false);
  const [furn, setFurn] = useState(false); // v146 / v196: Profil › Mobilyalar (pazar)
  const [vehOpen, toggleVeh] = useFold('veh'); // v169
  const [wepOpen, toggleWep] = useFold('wep');
  const [vehTab, setVehTab] = useState('araba');

  if (!user) {
    return <SignInPrompt message="Evine girmek için giriş yapmalısın." />;
  }

  if (editingAvatar) {
    return <AvatarBuilder onBack={() => setEditingAvatar(false)} />;
  }
  if (cosShop) {
    return (
      <Suspense fallback={<div className="app-lazy-fallback" aria-busy="true"><span /></div>}>
        <CostumeShop onBack={() => setCosShop(false)} />
      </Suspense>
    );
  }
  if (accShop) {
    return <AccessoryShop onBack={() => setAccShop(false)} />;
  }
  if (furn) {
    return (
      <Suspense fallback={<div className="app-lazy-fallback" aria-busy="true"><span /></div>}>
        <FurnitureScreen onBack={() => setFurn(false)} />
      </Suspense>
    );
  }
  if (report) {
    return <DailyReport onBack={() => setReport(false)} />;
  }

  // v77: vitrindeki (dükkândaki) ürünler kilitli — soluk ve 🔒 ile gösterilir
  const myVehicles = vehicles.filter((v) => !v.listed || v.shopHouseId);
  const myWeapons = weapons.filter((w) => !w.listed || w.shopHouseId);

  return (
    <div className="home-screen">
      <ProfileHeader player={player} onEditAvatar={() => setEditingAvatar(true)} onCostumes={() => setCosShop(true)} onAccessories={() => setAccShop(true)} onReport={() => setReport(true)} onFurniture={() => setFurn(true)} />

      {/* UGC D3: yalnızca yetkililere görünür */}
      <AdminPanelEntry uid={user.uid} player={player} />
      <AdminStoryReset uid={user.uid} />

      <div className="home-referral-box">
        <span className="home-referral-emoji">🎁</span>
        <p className="home-hint">
          Referans Kodun: <strong>{player?.displayName || '—'}</strong> — bu kodu kullanarak
          katılan her yeni oyuncu için <strong>1 zümrüt + 10.000 altın</strong> kazanırsın!
        </p>
        <InviteShareButton inviteName={player?.displayName} />
      </div>

      {/* v124: oyuncunun elinde malzeme yok (fabrika/işletme envanterinde) — sadece yasaklı madde */}
      <div className="home-material-row home-contraband-row">
        <span className="home-material-emoji">💊</span>
        <span className="home-hint">
          Yasaklı madde: <strong>{(inventory.yasakliMadde || 0).toLocaleString('tr-TR')}</strong>
        </span>
      </div>

      {/* v169: Araçlar ve Silahlar açılır / kapanır; araçlar galerideki gibi Araba · Ticari · Motor */}
      <div className={`home-section home-fold${vehOpen ? ' open' : ''}`}>
        <FoldHead icon="🚗" title="Araçların" count={myVehicles.length} open={vehOpen} onToggle={toggleVeh} />
        {vehOpen && (
          <>
            <div className="home-veh-tabs">
              <VehicleKindTabs value={vehTab} onChange={setVehTab} />
            </div>
            {myVehicles.length === 0 ? (
              <p className="home-hint">Henüz bir aracın yok.</p>
            ) : (
              (() => {
                const list = myVehicles.filter((v) => vehicleKind(v) === vehTab);
                if (!list.length) return <p className="home-hint">Bu sekmede aracın yok.</p>;
                return list.map((v) => <VehicleCard key={v.id} vehicle={v} locked={Boolean(v.shopHouseId)} />); // v197: favori kalbi Arabalarım'da
              })()
            )}
          </>
        )}
      </div>

      <div className={`home-section home-fold${wepOpen ? ' open' : ''}`}>
        <FoldHead icon="🔫" title="Silahların" count={myWeapons.length} open={wepOpen} onToggle={toggleWep} />
        {wepOpen && (
          <>
            {myWeapons.length === 0 && <p className="home-hint">Henüz bir silahın yok.</p>}
            {myWeapons.map((w) => (
              <WeaponCard key={w.id} weapon={w} locked={Boolean(w.shopHouseId)} />
            ))}
          </>
        )}
      </div>

      <BlockedPlayersList />

      <DeleteAccountRequest />

      {/* Play: gizlilik politikası ve hesap silme bağlantıları uygulama içinde de erişilebilir */}
      <LegalLinks />
    </div>
  );
}
