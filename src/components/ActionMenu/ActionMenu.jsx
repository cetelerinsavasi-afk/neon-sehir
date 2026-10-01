import { createPortal } from 'react-dom';
import './ActionMenu.css';

// ActionMenu — v53: mesaja uzun basınca / gönderinin ⋯ düğmesine dokununca
// açılan küçük seçenek listesi. Olumlu işlemler (Kopyala, Profili gör,
// Yorumlar) üstte; "Bildir" gibi işlemler en altta, soluk ve ayrık.
// actions: [{ key, icon, label, onClick, subtle? }]
// v72: emojis + onEmoji verilirse en üstte emoji tepki satırı (ChatsApp);
// selectedEmoji vurgulanır.
export default function ActionMenu({ title, actions, onClose, emojis, selectedEmoji, onEmoji }) {
  const main = actions.filter((a) => !a.subtle);
  const subtle = actions.filter((a) => a.subtle);
  const pick = (a) => {
    onClose();
    a.onClick();
  };
  return createPortal(
    <div className="am-backdrop" onClick={onClose}>
      <div className="am-sheet" role="menu" aria-label={title || 'Seçenekler'} onClick={(e) => e.stopPropagation()}>
        {title && <p className="am-title">{title}</p>}
        {emojis?.length > 0 && onEmoji && (
          <div className="am-emojis" role="group" aria-label="Tepki ver">
            {emojis.map((e) => (
              <button
                key={e}
                className={`am-emoji${selectedEmoji === e ? ' on' : ''}`}
                onClick={() => {
                  onClose();
                  onEmoji(e);
                }}
                aria-label={`${e} tepkisi`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {main.map((a) => (
          <button key={a.key} role="menuitem" className="am-row" onClick={() => pick(a)}>
            <span className="am-ico" aria-hidden="true">
              {a.icon}
            </span>
            {a.label}
          </button>
        ))}
        {subtle.length > 0 && <div className="am-sep" />}
        {subtle.map((a) => (
          <button key={a.key} role="menuitem" className="am-row subtle" onClick={() => pick(a)}>
            <span className="am-ico" aria-hidden="true">
              {a.icon}
            </span>
            {a.label}
          </button>
        ))}
        <button className="am-cancel" onClick={onClose}>
          Vazgeç
        </button>
      </div>
    </div>,
    document.body
  );
}
