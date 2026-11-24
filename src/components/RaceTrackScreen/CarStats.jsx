import { carStats, statBars, VEHICLE_MAX_LEVEL, vehicleRaceLevel } from '../../../functions/raceSim.js';
import CarImg from '../VehicleCard/CarImg';
import './CarStats.css';

// =============================================================================
// v78 — Araç yarış göstergeleri: HIZ / İVME / NİTRO çubukları + üstten araç
// resmi (v197: gerçek 3D model). Galeri, araç kartı, Atölye ve yarış lobisinde ortak kullanılır.
//   <CarStatBars catalogId level next? />  next: bir sonraki seviyenin
//   kazandıracağı kısım açık renkle gösterilir (geliştirmeye teşvik).
// =============================================================================

export { vehicleRaceLevel, VEHICLE_MAX_LEVEL };

// v197: üstten (kuşbakışı) çizim yerine aracın gerçek 3D modeli (oyunun her yerindeki araç resmiyle aynı)
export function CarThumb({ catalogId, mods = null, className = '' }) {
  return <CarImg catalogId={catalogId} mods={mods} className={`car-thumb ${className}`} alt="" />;
}

const ROWS = [
  { key: 'speed', label: 'HIZ', cls: 'spd' },
  { key: 'accel', label: 'İVME', cls: 'acc' },
  { key: 'nitro', label: 'NİTRO', cls: 'nit' },
];

export function CarStatBars({ catalogId, level = 1, next = false, compact = false }) {
  const cur = statBars(carStats(catalogId, level));
  const nx = next && level < VEHICLE_MAX_LEVEL ? statBars(carStats(catalogId, level + 1)) : null;
  return (
    <div className={`car-stats${compact ? ' compact' : ''}`}>
      {ROWS.map((r) => (
        <div className="car-stats-row" key={r.key}>
          <span className="car-stats-lbl">{r.label}</span>
          <span className="car-stats-bar">
            {nx && <i className={`car-stats-next ${r.cls}`} style={{ width: `${nx[r.key]}%` }} />}
            <i className={`car-stats-fill ${r.cls}`} style={{ width: `${cur[r.key]}%` }} />
          </span>
        </div>
      ))}
      {!compact && (
        <span className="car-stats-meta">
          {cur.kmh} km/h · Nitro {cur.nitroSec.toLocaleString('tr-TR')} sn
          {nx && (
            <em>
              {' '}
              → {nx.kmh} km/h · {nx.nitroSec.toLocaleString('tr-TR')} sn
            </em>
          )}
        </span>
      )}
    </div>
  );
}

export function LevelPips({ level = 1 }) {
  return (
    <span className="car-level" title={`Seviye ${level}/${VEHICLE_MAX_LEVEL}`}>
      {Array.from({ length: VEHICLE_MAX_LEVEL }, (_, i) => (
        <i key={i} className={i < level ? 'on' : ''} />
      ))}
      <b>Sv {level}</b>
    </span>
  );
}

// "Seviye 2 · 165 km/h" — kısa açıklama satırı
export function vehicleRaceLine(v) {
  const lv = vehicleRaceLevel(v);
  return `Seviye ${lv}/${VEHICLE_MAX_LEVEL}${lv > 1 ? ' · geliştirilmiş' : ''}`;
}

// 2. el / vitrin ilanı için aynı satır
export function listingRaceLine(l) {
  return vehicleRaceLine({ catalogId: l?.vehicleCatalogId, raceLevel: l?.vehicleRaceLevel, gearUpgraded: l?.vehicleGearUpgraded, tankUpgraded: l?.vehicleTankUpgraded });
}

// v80: 2. el / vitrin ilanının yarış seviyesi (profil kartıyla aynı hesap)
export function listingRaceLevel(l) {
  return vehicleRaceLevel({ catalogId: l?.vehicleCatalogId, raceLevel: l?.vehicleRaceLevel, gearUpgraded: l?.vehicleGearUpgraded, tankUpgraded: l?.vehicleTankUpgraded });
}
// ilan kartı: "Seviye 2/3" + HIZ / İVME / NİTRO çubukları (sayı yok, profildeki gibi)
export function ListingCarStats({ listing, vehicle }) {
  const catalogId = vehicle ? vehicle.catalogId : listing?.vehicleCatalogId;
  const lv = vehicle ? vehicleRaceLevel(vehicle) : listingRaceLevel(listing);
  return (
    <div className="car-stats-listing">
      <span className="car-stats-lvtxt">Seviye {lv}/{VEHICLE_MAX_LEVEL}{lv > 1 ? ' · geliştirilmiş' : ''}</span>
      <CarStatBars catalogId={catalogId || 1} level={lv} compact />
    </div>
  );
}
