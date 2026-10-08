import { useState } from 'react';
import './PlaceTypePicker.css';

// v77 — Açılır/kapanır mekân türü seçici. Kapalıyken seçili tür görünür;
// dokununca diğer türler listelenir, birine dokununca seçilip kapanır.
//   options: [{ key, icon, label }] · value: seçili key · onChange(key)
export default function PlaceTypePicker({ options, value, onChange, title = 'Mekân türü' }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.key === value) || options[0];
  return (
    <div className={`ptp${open ? ' open' : ''}`}>
      <button type="button" className="ptp-head" onClick={() => setOpen((v) => !v)}>
        <span className="ptp-ico">{cur?.icon}</span>
        <span className="ptp-main">
          <small>{title}</small>
          <b>{cur?.label}</b>
        </span>
        <span className="ptp-caret">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ptp-list">
          {options.map((o) => (
            <button
              type="button"
              key={o.key}
              className={`ptp-item${o.key === value ? ' on' : ''}`}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
            >
              <span className="ptp-ico">{o.icon}</span>
              <span>{o.label}</span>
              {o.key === value && <span className="ptp-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
