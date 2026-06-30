import { useState } from 'react';
import { regions } from '../../data/regions';
import mapImage from '../../assets/sehir-haritasi.jpg';
import './CityMap.css';

/**
 * CityMap — interaktif-harita.html prototipinin React component'i.
 * Bölge koordinatları ve görsel asset birebir korunmuştur.
 * Tıklamalar onRegionClick(regionId, regionMeta) ile dışarı yönlendirilir.
 */
export default function CityMap({ onRegionClick }) {
  const [selectedId, setSelectedId] = useState(null);

  const handleClick = (region) => {
    setSelectedId(region.id);
    onRegionClick?.(region.id, region);
  };

  return (
    <div className="map-wrap">
      <div className="map-aspect">
        <img src={mapImage} alt="Neon Şehir Haritası" draggable={false} />
        {regions.map((r, i) => (
          <div
            key={`${r.id}-${i}`}
            className={`region${selectedId === r.id ? ' selected' : ''}`}
            style={{
              left: `${r.left}%`,
              top: `${r.top}%`,
              width: `${r.width}%`,
              height: `${r.height}%`,
            }}
            tabIndex={0}
            role="button"
            aria-label={r.name}
            onClick={() => handleClick(r)}
            onKeyDown={(e) => e.key === 'Enter' && handleClick(r)}
          >
            <span className="region-label">{r.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
