import { vehicleCatalog } from '../../data/vehicleCatalog';
import './VehicleCard.css';

// VehicleCard — Profil (HomeScreen) VE Modifiye Garajı (GarageScreen)
// TARAFINDAN ORTAK kullanılan tek bir bileşen. İkisinin "birebir aynı"
// görünmesi gerektiği için (resim + ömür barı + tamir), buraya
// çıkarıldı — iki yerde ayrı ayrı tutulursa zamanla birbirinden
// sapabilirdi.

export const INITIAL_LIFE_DAYS = 50;
export const MAX_REPAIRS = 10;

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

export function vehicleRequiredQty(vehicle) {
  // Fiyatla doğru orantılı: 1000₺ araba için 2 malzeme, 100.000₺ için 200.
  return Math.max(2, Math.round((vehicle.baseGalleryValue || 0) / 500));
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
  const repairReq = repairRequiredQty(vehicle.baseGalleryValue);
  const repairMaxed = repairsUsed >= MAX_REPAIRS;
  return (
    <div className="vcard-card">
      {img && <img className="vcard-photo" src={img} alt={vehicle.model} />}
      <div className="vcard-body">
        <span className="vcard-name">{vehicle.model}</span>
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
            {repairMaxed ? 'Tamir Hakkı Bitti' : `Tamir Et (${repairReq} malzeme) +5 gün`}
          </button>
        </div>
      </div>
    </div>
  );
}
