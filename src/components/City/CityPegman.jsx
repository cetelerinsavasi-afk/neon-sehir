import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAP_SIZE, homeMapping } from './cityMapMath.js';
import { regions } from '../../data/regions';
import { vendorVenueKey } from '../../../functions/vendorData.js';
import './CityPegman.css';

// =============================================================================
// v147.3 — "Şehre gir" insanı (Google Haritalar'daki gibi):
//   • dokun → evin önünde doğ (eskisi gibi)
//   • basılı tutup sürükle → insan havada sallanır; haritada bırakılan yerde doğulur
// three.js içermez (ana sayfada her zaman yüklü).
// =============================================================================
const FOOT = 34; // parmak insanı kapatmasın: ayaklar parmağın bu kadar üstünde

function dropPoint(cx, cy) {
  const img = document.querySelector('.map-aspect img');
  if (!img) return null;
  const r = img.getBoundingClientRect();
  if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
  const u = ((cx - r.left) / r.width) * MAP_SIZE;
  const v = ((cy - r.top) / r.height) * MAP_SIZE;
  const [x, z] = homeMapping().toWorld(u, v);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  // v147.4: mavi hedef bir binanın / satıcının üstündeyse tam o mekânın kapısında doğ
  // (harita resmi perspektifli; binanın üstüne bırakınca 3D'de aynı binaya varılsın).
  // Park / pist gibi açık alanlarda ise tam bırakılan noktaya.
  let region = null;
  const el = document.elementFromPoint(cx, cy)?.closest?.('[data-region-idx]');
  if (el) {
    const r = regions[Number(el.dataset.regionIdx)];
    if (r && r.id !== 'park' && r.id !== 'yaris_pisti') region = vendorVenueKey(r.id) || r.id;
  }
  return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, ...(region ? { region } : {}) };
}

export default function CityPegman({ onTap, onDrop }) {
  const st = useRef(null);
  const [drag, setDrag] = useState(null);
  const down = (e) => {
    st.current = { x0: e.clientX, y0: e.clientY, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* yoksay */
    }
  };
  const move = (e) => {
    const s = st.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 8) return;
    s.moved = true;
    const fx = e.clientX;
    const fy = e.clientY - FOOT;
    setDrag({ x: fx, y: fy, ok: Boolean(dropPoint(fx, fy)) });
  };
  const end = (e, cancel) => {
    const s = st.current;
    st.current = null;
    setDrag(null);
    if (!s) return;
    if (!s.moved) {
      if (!cancel) onTap?.();
      return;
    }
    if (cancel) return;
    const pt = dropPoint(e.clientX, e.clientY - FOOT);
    if (pt) onDrop?.(pt);
  };
  return (
    <>
      <button
        className={`map-city-btn cpm-btn${drag ? ' dragging' : ''}`}
        aria-label="Şehre gir"
        title="Şehre gir — dokun ya da haritaya sürükle"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="cpm-man">🧍</span>
      </button>
      {drag &&
        createPortal(
          <div className="cpm-drag" style={{ left: drag.x, top: drag.y }}>
            <div className={`cpm-target${drag.ok ? ' ok' : ''}`} />
            <div className="cpm-hang">🧍</div>
          </div>,
          document.body
        )}
    </>
  );
}
