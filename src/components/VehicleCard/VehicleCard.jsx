import { useState } from 'react';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { renameVehicle } from '../../services/gameActions';
import { CarStatBars, vehicleRaceLevel } from '../RaceTrackScreen/CarStats';
import CarImg from './CarImg';
import './VehicleCard.css';
import {
  VEHICLE_WEAPON_INITIAL_LIFE_DAYS,
  VEHICLE_WEAPON_MAX_REPAIRS,
  REPAIR_LIFE_BONUS_DAYS,
  WEAPON_INITIAL_LIFE_DAYS,
  WEAPON_REPAIR_LIFE_BONUS_DAYS,
  MOTOR_LIFE_DAYS,
  lifeCapOf,
  repairBonusOf,
} from '../../../functions/itemRules.js';
import { canRepairVehicle, canUpgradeVehicle } from '../../../functions/vehicleKinds.js';

// VehicleCard — Profil (HomeScreen) VE Modifiye Garajı (GarageScreen)
// TARAFINDAN ORTAK kullanılan tek bir bileşen. İkisinin "birebir aynı"
// görünmesi gerektiği için (resim + ömür barı + tamir), buraya
// çıkarıldı — iki yerde ayrı ayrı tutulursa zamanla birbirinden
// sapabilirdi.

// v195: ömür / tamir sabitleri artık TEK KAYNAKTAN (functions/itemRules.js) — eskiden burada
// ikizi duruyordu (araç 20 gün / +2). Araba + ticari 10 gün, 10 tamir, her tamir +1 gün;
// motor / bisiklet / at / deve 20 gün (tamirsiz); silah 10 gün / +1.
export const INITIAL_LIFE_DAYS = VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
export const MAX_REPAIRS = VEHICLE_WEAPON_MAX_REPAIRS;
export { REPAIR_LIFE_BONUS_DAYS, WEAPON_INITIAL_LIFE_DAYS, WEAPON_REPAIR_LIFE_BONUS_DAYS, MOTOR_LIFE_DAYS, lifeCapOf, repairBonusOf };
// v58: ömrü doluyken tamir düğmesi pasif · v195: araçta tavan katalog numarasına göre (motor 20)
export function isLifeFull(item, kind = 'vehicle') {
  const cap = lifeCapOf(kind, item);
  return (item?.lifeDays ?? cap) >= cap;
}

export function lifeRatio(item, kind = 'vehicle') {
  const cap = lifeCapOf(kind, item);
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
  const cap = lifeCapOf(kind, item);
  const life = item?.lifeDays ?? cap;
  const repairsUsed = item?.repairsUsed || 0;
  const percent = Math.round(lifeRatio(item, kind) * 100);
  // v195: motorda tamir yok — tamir hakkı yazılmaz
  const repairable = kind === 'weapon' || item?.catalogId == null || canRepairVehicle(item.catalogId);
  return (
    <div className="vcard-life-row">
      <div className="vcard-life-label">
        <span>
          Ömür: {life} / {cap} gün
        </span>
        {repairable && (
          <span>
            Tamir hakkı: {MAX_REPAIRS - repairsUsed}/{MAX_REPAIRS}
          </span>
        )}
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
export function UpgradeCells({ slots, kind = 'vehicle', catalogId = null }) {
  // v195: ticari araç ve motor geliştirilemez (ticari tamir edilir)
  if (kind === 'vehicle' && catalogId != null && !canUpgradeVehicle(catalogId)) {
    return (
      <span className="vcard-upinfo">
        Geliştirme: <b>yok</b>
        <small>{canRepairVehicle(catalogId) ? 'Tamir: Modifiye Garajı › Tamir' : 'Bu araç tamir / geliştirme almaz'}</small>
      </span>
    );
  }
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

export default function VehicleCard({ vehicle, locked = false, fav = false, onFav = null }) {
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
      {/* v150: fotoğraf yerine aracın modifiyeli 3D hali */}
      <CarImg className="vcard-photo" catalogId={vehicle.catalogId} mods={vehicle.mods || null} alt={displayName} />
      {/* v196: favori araç (evin garajında durur) — tek araç seçilir */}
      {onFav && (
        <button type="button" className={`vcard-fav${fav ? ' on' : ''}`} title={fav ? 'Favori araç (garajında) — kaldırmak için dokun' : 'Favori yap: evinin garajında dursun'} aria-pressed={fav} onClick={() => onFav(vehicle)}>
          {fav ? '❤️' : '🤍'}
        </button>
      )}
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
        <UpgradeCells slots={[vehicleRaceLevel(vehicle) >= 2, vehicleRaceLevel(vehicle) >= 3]} kind="vehicle" catalogId={vehicle.catalogId} />
      </div>
    </div>
  );
}
