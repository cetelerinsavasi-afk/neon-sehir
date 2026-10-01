// v72 — ChatsApp: mesaja yanıt + emoji tepkileri (genel ve özel sohbet ortak).
// Sunucu ikizi: functions/chatExtras.js
import { CHAT_REACTIONS } from '../../../functions/chatExtras.js';

export { CHAT_REACTIONS };

// Yanıtlanan mesaj kutusu (balonun içinde, metnin üstünde). Dokununca o mesaja gider.
export function ReplyQuote({ replyTo, myUid, hidden }) {
  if (!replyTo) return null;
  const jump = (e) => {
    e.stopPropagation();
    const el = document.getElementById(`ca-msg-${replyTo.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('ca-flash');
    void el.offsetWidth;
    el.classList.add('ca-flash');
  };
  return (
    <button type="button" className="ca-quote" onClick={jump} onPointerDown={(e) => e.stopPropagation()}>
      <span className="ca-quote-name">{replyTo.uid === myUid ? 'Sen' : replyTo.name || 'Oyuncu'}</span>
      <span className="ca-quote-text">{hidden ? 'Engellediğin bir oyuncunun mesajı' : replyTo.text}</span>
    </button>
  );
}

// Balonun altındaki tepki rozetleri (emoji + sayı). Dokununca aynı tepkiyi ver/kaldır.
export function ReactionChips({ reactions, myUid, onReact }) {
  const entries = Object.entries(reactions || {}).filter(([, e]) => CHAT_REACTIONS.includes(e));
  if (!entries.length) return null;
  const counts = new Map();
  entries.forEach(([, e]) => counts.set(e, (counts.get(e) || 0) + 1));
  const mine = reactions?.[myUid];
  return (
    <div className="ca-reacts">
      {CHAT_REACTIONS.filter((e) => counts.has(e)).map((e) => (
        <button
          key={e}
          type="button"
          className={`ca-react${mine === e ? ' mine' : ''}`}
          onClick={() => onReact(e)}
          onPointerDown={(ev) => ev.stopPropagation()}
          aria-label={`${e} tepkisi (${counts.get(e)})`}
        >
          {e}
          {counts.get(e) > 1 && <span>{counts.get(e)}</span>}
        </button>
      ))}
    </div>
  );
}

// Mesaj kutusunun üstündeki "yanıtlanıyor" çubuğu
export function ReplyBar({ replyTo, myUid, onCancel }) {
  if (!replyTo) return null;
  return (
    <div className="ca-replybar">
      <span className="ca-replybar-main">
        <span className="ca-quote-name">↩️ Yanıtlanıyor · {replyTo.uid === myUid ? 'Kendi mesajın' : replyTo.name || 'Oyuncu'}</span>
        <span className="ca-quote-text">{replyTo.text}</span>
      </span>
      <button type="button" className="ca-replybar-x" onClick={onCancel} aria-label="Yanıtı iptal et">
        ✕
      </button>
    </div>
  );
}

// Uzun basma menüsü için: mesajdan yanıt taslağı
export const replyDraftOf = (m, name) => ({ id: m.id, uid: m.uid, name, text: String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 120) });
