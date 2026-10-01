import { useState } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { markAllMessagesRead, markMessageRead } from '../../services/gameActions';
import './MessagesScreen.css';

function formatTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MessagesScreen() {
  const { messages } = useMessages();
  const [busy, setBusy] = useState(false);
  const unread = messages.filter((m) => !m.read).length;

  if (messages.length === 0) {
    return <p className="messages-empty">Hiç mesajın yok.</p>;
  }

  const markAll = async () => {
    setBusy(true);
    try {
      // okunmamış çoksa (450'den fazla) birkaç tur dener
      for (let i = 0; i < 5; i++) {
        const r = await markAllMessagesRead();
        if (!r.data?.count || r.data.count < 450) break;
      }
    } catch (err) {
      console.error('markAllMessagesRead', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="messages-screen">
      {unread > 0 && (
        <div className="messages-toolbar">
          <span>{unread} okunmamış mesaj</span>
          <button type="button" className="messages-markall" disabled={busy} onClick={markAll}>
            {busy ? 'İşaretleniyor…' : '✓ Tümünü okundu yap'}
          </button>
        </div>
      )}
      {messages.map((m) => (
        <div
          key={m.id}
          className={`message-card${m.read ? '' : ' unread'}`}
          onClick={() => !m.read && markMessageRead(m.id)}
        >
          <p className="message-text">{m.text}</p>
          <span className="message-time">{formatTime(m.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
