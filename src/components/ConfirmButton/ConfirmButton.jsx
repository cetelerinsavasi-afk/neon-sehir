import { useState } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmButton.css';

// v97 — dokun → onay penceresi (eski "basılı tut" butonlarının yerine).
//   title: soru · lines: kısa bilgi satırları · confirmLabel: onay butonu
//   danger: kırmızı onay butonu
export default function ConfirmButton({ onConfirm, disabled, className = '', title, lines = [], confirmLabel = 'Onayla', danger = false, children }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open &&
        createPortal(
          <div className="cfm-bg" onClick={() => !busy && setOpen(false)}>
            <div className="cfm-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <p className="cfm-title">{title || children}</p>
              {lines.filter(Boolean).map((l, i) => (
                <p key={i} className="cfm-line">
                  {l}
                </p>
              ))}
              <div className="cfm-btns">
                <button type="button" className="cfm-no" disabled={busy} onClick={() => setOpen(false)}>
                  Vazgeç
                </button>
                <button type="button" className={`cfm-yes${danger ? ' danger' : ''}`} disabled={busy} onClick={go}>
                  {busy ? '…' : confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
