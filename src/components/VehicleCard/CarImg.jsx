import { useEffect, useState } from 'react';
import './CarImg.css';

// =============================================================================
// v150 — CarImg: aracın görseli artık fotoğraf değil, 3D modelinin (modifiyesiyle)
// karesi. <img> ile aynı sınıfı alır; kare hazırlanana kadar aynı yerde ışıltı görünür.
//   catalogId: araç tipi (1-10) · mods: vehicles/{id}.mods (yoksa orijinal hali)
// =============================================================================
let thumbMod = null;
const loadThumb = () => (thumbMod ||= import('../../lib/carThumb.js'));

export default function CarImg({ catalogId, mods = null, className = '', alt = '', ...rest }) {
  const key = `${catalogId}|${mods ? JSON.stringify(mods) : ''}`;
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!catalogId) return undefined;
    let alive = true;
    setSrc(null);
    loadThumb()
      .then((m) => m.carThumb(catalogId, mods))
      .then((u) => alive && setSrc(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!src) return <span className={`${className} car-img-wait`} aria-busy="true" {...rest} />;
  return <img className={className} src={src} alt={alt} {...rest} />;
}
