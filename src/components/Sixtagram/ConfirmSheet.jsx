import { useState } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmSheet.css';

// v135 — Instagram tarzı onay penceresi ("Gönderi silinsin mi?" · Sil / Vazgeç)
export default function ConfirmSheet({ title, text, confirm = 'Sil', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="ig-cf-bg" onClick={() => !busy && onClose()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ig-cf" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={title}>
        <div className="ig-cf-txt">
          <b>{title}</b>
          {text && <p>{text}</p>}
        </div>
        <button className="ig-cf-btn danger" disabled={busy} onClick={go}>
          {busy ? '…' : confirm}
        </button>
        <button className="ig-cf-btn" disabled={busy} onClick={onClose}>
          Vazgeç
        </button>
      </div>
    </div>,
    document.body
  );
}
