import { useState } from 'react';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { renameVehicle } from '../../services/gameActions';
import './VehicleCard.css';

// VehicleCard — Profil (HomeScreen) VE Modifiye Garajı (GarageScreen)
// TARAFINDAN ORTAK kullanılan tek bir bileşen. İkisinin "birebir aynı"
// görünmesi gerektiği için (resim + ömür barı + tamir), buraya
// çıkarıldı — iki yerde ayrı ayrı tutulursa zamanla birbirinden
// sapabilirdi.

export const INITIAL_LIFE_DAYS = 20;
export const MAX_REPAIRS = 10;
export const REPAIR_LIFE_BONUS_DAYS = 2;

export function lifeRatio(item) {
  const life = item?.lifeDays ?? INITIAL_LIFE_DAYS;
  return Math.max(0, Math.min(1, life / INITIAL_LIFE_DAYS));
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

export function LifeBar({ item }) {
  const life = item?.lifeDays ?? INITIAL_LIFE_DAYS;
  const repairsUsed = item?.repairsUsed || 0;
  const percent = Math.round(lifeRatio(item) * 100);
  return (
    <div className="vcard-life-row">
      <div className="vcard-life-label">
        <span>
          Ömür: {life} / {INITIAL_LIFE_DAYS} gün
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

export default function VehicleCard({ vehicle, materialsQty, repairQty, busy, onUpgrade, onRepair }) {
  const req = vehicleRequiredQty(vehicle);
  const img = vehicleImage(vehicle.catalogId);
  const repairsUsed = vehicle.repairsUsed || 0;
  const repairReq = repairRequiredQty(vehicleLivePrice(vehicle));
  const repairMaxed = repairsUsed >= MAX_REPAIRS;
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
    <div className="vcard-card">
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
          Vites {vehicle.gearLevel} · Depo {vehicle.baseTank + (vehicle.tankBonus || 0)}L
          {vehicle.mortgaged && !vehicle.seizedByBank && ' · İpotekli'}
          {vehicle.seizedByBank && ' · Bankaya el konuldu'}
        </span>
        <LifeBar item={vehicle} />
        <div className="vcard-controls">
          <button
            className="vcard-btn"
            disabled={vehicle.gearUpgraded || materialsQty.araba < req || busy === `${vehicle.id}-gear`}
            onClick={() => onUpgrade(vehicle.id, 'gear')}
          >
            {vehicle.gearUpgraded ? 'Vites Geliştirildi' : `Vites Geliştir (${req} malzeme) +1 vites`}
          </button>
          <button
            className="vcard-btn"
            disabled={vehicle.tankUpgraded || materialsQty.araba < req || busy === `${vehicle.id}-tank`}
            onClick={() => onUpgrade(vehicle.id, 'tank')}
          >
            {vehicle.tankUpgraded ? 'Depo Geliştirildi' : `Depo Geliştir (${req} malzeme) +50 depo`}
          </button>
          <button
            className="vcard-btn"
            disabled={repairMaxed || repairQty < repairReq || busy === `${vehicle.id}-repair`}
            onClick={() => onRepair(vehicle.id)}
          >
            {repairMaxed ? 'Tamir Hakkı Bitti' : `Tamir Et (${repairReq} malzeme) +${REPAIR_LIFE_BONUS_DAYS} gün`}
          </button>
        </div>
      </div>
    </div>
  );
}
