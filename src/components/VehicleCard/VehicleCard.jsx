import { useState } from 'react';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { renameVehicle } from '../../services/gameActions';
import { CarStatBars, vehicleRaceLevel } from '../RaceTrackScreen/CarStats';
import './VehicleCard.css';

// VehicleCard — Profil (HomeScreen) VE Modifiye Garajı (GarageScreen)
// TARAFINDAN ORTAK kullanılan tek bir bileşen. İkisinin "birebir aynı"
// görünmesi gerektiği için (resim + ömür barı + tamir), buraya
// çıkarıldı — iki yerde ayrı ayrı tutulursa zamanla birbirinden
// sapabilirdi.

export const INITIAL_LIFE_DAYS = 20;
export const MAX_REPAIRS = 10;
export const REPAIR_LIFE_BONUS_DAYS = 2;
// v58: silahların azami ömrü 10 gün, her tamir +1 gün (araçlar değişmedi).
// Sunucudaki ikizi: functions/index.js WEAPON_INITIAL_LIFE_DAYS.
export const WEAPON_INITIAL_LIFE_DAYS = 10;
export const WEAPON_REPAIR_LIFE_BONUS_DAYS = 1;
export function lifeCapOf(kind) {
  return kind === 'weapon' ? WEAPON_INITIAL_LIFE_DAYS : INITIAL_LIFE_DAYS;
}
export function repairBonusOf(kind) {
  return kind === 'weapon' ? WEAPON_REPAIR_LIFE_BONUS_DAYS : REPAIR_LIFE_BONUS_DAYS;
}
// v58: ömrü doluyken tamir düğmesi pasif
export function isLifeFull(item, kind = 'vehicle') {
  return (item?.lifeDays ?? lifeCapOf(kind)) >= lifeCapOf(kind);
}

export function lifeRatio(item, kind = 'vehicle') {
  const cap = lifeCapOf(kind);
  const life = item?.lifeDays ?? cap;
  return Math.max(0, Math.min(1, life / cap));
}

export function repairRequiredQty(price) {
  return Math.max(1, Math.round((price || 0) / 100));
}

export function vehicleImage(catalogId) {
  return vehicleCatalog.find((v) => v.id === catalogId)?.image;
}

// Kullanıcı revizesi: "arabalarımızın ismini değiştirebilelim" — artık
// aynı modelden birden fazla araca sahip olunabildiği için (bkz.
// functions/index.js buyVehicle) oyuncular araçlarına özel isim
// koyabiliyor. `model` katalog adı olarak sabit kalır, `customName`
// doluysa görüntülemede onun yerine kullanılır — 2. el ilanlarında,
// Sixtagram paylaşımlarında ve yarışlarda da AYNI kural geçerli (bkz.
// functions/index.js'teki ilgili vehicleModel/model snapshot noktaları).
export const VEHICLE_CUSTOM_NAME_MAX_LEN = 22;
export function vehicleDisplayName(vehicle) {
  return vehicle?.customName || vehicle?.model || '';
}

// Aracın GÜNCEL katalog fiyatı — eski araçlar da fiyat güncellemesinden
// sonra yeni fiyata göre hesaplanır (sadece zaten çekilmiş kredi borçları
// donmuş kalır, bkz. functions/index.js takeVehicleLoan).
export function vehicleLivePrice(vehicle) {
  return vehicleCatalog.find((v) => v.id === vehicle.catalogId)?.price ?? vehicle.baseGalleryValue ?? 0;
}

export function vehicleRequiredQty(vehicle) {
  // Fiyatla doğru orantılı: 1000₺ araba için 2 malzeme, 100.000₺ için 200.
  return Math.max(2, Math.round(vehicleLivePrice(vehicle) / 500));
}

export function LifeBar({ item, kind = 'vehicle' }) {
  const cap = lifeCapOf(kind);
  const life = item?.lifeDays ?? cap;
  const repairsUsed = item?.repairsUsed || 0;
  const percent = Math.round(lifeRatio(item, kind) * 100);
  return (
    <div className="vcard-life-row">
      <div className="vcard-life-label">
        <span>
          Ömür: {life} / {cap} gün
        </span>
        <span>
          Tamir hakkı: {MAX_REPAIRS - repairsUsed}/{MAX_REPAIRS}
        </span>
      </div>
      <div className="vcard-life-bar">
        <div className="vcard-life-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// v77: Profilde sadece bilgi — tamir/geliştirme dükkânların "Tamir / Geliştirme"
// ekranında (silah: Silahçı, araba: Modifiye Garajı). Yazıyla gösterilir.
//   kind 'vehicle': slots=[vites, depo] · kind 'weapon': slots=[sv2, sv3]
export function UpgradeCells({ slots, kind = 'vehicle' }) {
  if (kind === 'weapon') {
    const lv = 1 + slots.filter(Boolean).length;
    return (
      <span className="vcard-upinfo">
        Geliştirme: <b className={lv >= 3 ? 'done' : ''}>{lv >= 3 ? 'en yüksek seviye (3/3)' : `seviye ${lv}/3 · geliştirilebilir`}</b>
        <small>Silahçı › Tamir / Geliştirme</small>
      </span>
    );
  }
  // v78: araçlar da seviye 1 → 2 → 3 (hız / ivme / nitro)
  const lv = 1 + slots.filter(Boolean).length;
  return (
    <span className="vcard-upinfo">
      Geliştirme: <b className={lv >= 3 ? 'done' : ''}>{lv >= 3 ? 'en yüksek seviye (3/3)' : `seviye ${lv}/3 · geliştirilebilir`}</b>
      <small>Modifiye Garajı › Tamir / Geliştirme</small>
    </span>
  );
}

export default function VehicleCard({ vehicle, locked = false }) {
  const img = vehicleImage(vehicle.catalogId);
  const displayName = vehicleDisplayName(vehicle);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState(null);

  const startEditing = () => {
    setNameDraft(displayName);
    setNameError(null);
    setEditingName(true);
  };

  const handleNameSave = async () => {
    setNameBusy(true);
    setNameError(null);
    try {
      await renameVehicle(vehicle.id, nameDraft.trim());
      setEditingName(false);
    } catch (err) {
      setNameError(err.message || 'İsim güncellenemedi.');
    } finally {
      setNameBusy(false);
    }
  };

  return (
    <div className={`vcard-card${locked ? ' cue-dim cue-lock' : ''}`}>
      {img && <img className="vcard-photo" src={img} alt={displayName} />}
      <div className="vcard-body">
        {editingName ? (
          <div className="vcard-name-edit-row">
            <input
              className="vcard-name-input"
              type="text"
              maxLength={VEHICLE_CUSTOM_NAME_MAX_LEN}
              value={nameDraft}
              placeholder={vehicle.model}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
            />
            <button className="vcard-name-btn" disabled={nameBusy} onClick={handleNameSave}>
              {nameBusy ? '…' : 'Kaydet'}
            </button>
            <button className="vcard-name-btn" disabled={nameBusy} onClick={() => setEditingName(false)}>
              Vazgeç
            </button>
          </div>
        ) : (
          <span className="vcard-name">
            {displayName}
            <button
              type="button"
              className="vcard-name-edit-btn"
              title="Aracın adını değiştir"
              onClick={startEditing}
            >
              ✏️
            </button>
          </span>
        )}
        {nameError && <p className="vcard-name-error">{nameError}</p>}
        <span className="vcard-stats">
          Seviye {vehicleRaceLevel(vehicle)}/3
          {vehicle.mortgaged && !vehicle.seizedByBank && ' · İpotekli'}
          {vehicle.seizedByBank && ' · Bankaya el konuldu'}
        </span>
        <CarStatBars catalogId={vehicle.catalogId} level={vehicleRaceLevel(vehicle)} compact />
        <LifeBar item={vehicle} />
        <UpgradeCells slots={[vehicleRaceLevel(vehicle) >= 2, vehicleRaceLevel(vehicle) >= 3]} kind="vehicle" />
      </div>
    </div>
  );
}
