import { useCallback, useRef, useState } from 'react';
import { regions } from '../../data/regions';
import mapImage from '../../assets/sehir-haritasi.jpg';
import { useMapPanZoom } from './useMapPanZoom';
import MapAmbience from './MapAmbience';
import './CityMap.css';

/**
 * CityMap — interaktif-harita.html prototipinin React component'i.
 * Bölge koordinatları ve görsel asset birebir korunmuştur.
 * Tıklamalar onRegionClick(regionId, regionMeta) ile dışarı yönlendirilir.
 *
 * Zoom + pan: kullanıcı sadece içeri yakınlaştırabilir (taban "ekrana sığdır"
 * ölçeğinin altına inilemez), yakınlaştırınca sürükleyerek (mobilde tek/iki
 * parmak, masaüstünde fare + tekerlek) gezinebilir. Çift tıklama sıfırlar.
 *
 * Bölge tespiti: native `onClick` yerine koordinat bazlı yapılır (bkz.
 * useMapPanZoom.js'teki not) — `onTap` ile gelen ekran koordinatını
 * document.elementFromPoint ile çözüp hangi bölgeye dokunulduğunu buluruz.
 */
export default function CityMap({ onRegionClick }) {
  const [selectedId, setSelectedId] = useState(null);
  const viewportRef = useRef(null);
  const wrapRef = useRef(null);

  const handleClick = useCallback(
    (region) => {
      setSelectedId(region.id);
      onRegionClick?.(region.id, region);
    },
    [onRegionClick]
  );

  const handleTap = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    const regionEl = el?.closest('[data-region-idx]');
    if (!regionEl) return;
    const idx = Number(regionEl.dataset.regionIdx);
    const region = regions[idx];
    if (region) handleClick(region);
  }, [handleClick]);

  const { transform, isDragging, handlers } = useMapPanZoom(viewportRef, wrapRef, handleTap);

  return (
    <div
      className={`map-viewport${isDragging ? ' dragging' : ''}`}
      ref={viewportRef}
      {...handlers}
    >
      <div
        className="map-wrap"
        ref={wrapRef}
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        <div className="map-aspect">
          <img src={mapImage} alt="Neon Şehir Haritası" draggable={false} />
          <MapAmbience />
          {regions.map((r, i) => (
            <div
              key={`${r.id}-${i}`}
              data-region-idx={i}
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
              onKeyDown={(e) => e.key === 'Enter' && handleClick(r)}
            >
              <span className="region-label">{r.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
