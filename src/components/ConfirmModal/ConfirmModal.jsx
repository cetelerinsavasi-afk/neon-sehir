import './ConfirmModal.css';

// ConfirmModal — window.confirm() yerine kullanılan, oyunun kendi
// görünümüne uygun onay penceresi. "Anında Sat" gibi geri alınamaz
// işlemlerden önce gösterilir.
export default function ConfirmModal({ title, message, confirmLabel = 'Onayla', cancelLabel = 'Vazgeç', onConfirm, onCancel }) {
  return (
    <div className="confirm-modal-backdrop" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {title && <p className="confirm-modal-title">{title}</p>}
        {message && <p className="confirm-modal-message">{message}</p>}
        <div className="confirm-modal-actions">
          <button className="confirm-modal-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="confirm-modal-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
