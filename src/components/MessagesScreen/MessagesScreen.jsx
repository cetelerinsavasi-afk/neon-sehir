import { useMessages } from '../../hooks/useMessages';
import { markMessageRead } from '../../services/gameActions';
import './MessagesScreen.css';

function formatTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MessagesScreen() {
  const { messages } = useMessages();

  if (messages.length === 0) {
    return <p className="messages-empty">Hiç mesajın yok.</p>;
  }

  return (
    <div className="messages-screen">
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
