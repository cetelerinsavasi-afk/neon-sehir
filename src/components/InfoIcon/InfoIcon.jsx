import { useState } from 'react';
import './InfoIcon.css';

export default function InfoIcon({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="info-icon-wrap">
      <button
        type="button"
        className="info-icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Bilgi"
      >
        i
      </button>
      {open && (
        <>
          <div className="info-icon-backdrop" onClick={() => setOpen(false)} />
          <div className="info-icon-popover">{text}</div>
        </>
      )}
    </span>
  );
}
