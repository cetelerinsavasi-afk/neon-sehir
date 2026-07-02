import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import { sendChatMessage } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './ChatsAppScreen.css';

function formatTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatsAppScreen() {
  const { user } = useAuth();
  const { messages } = useGlobalChat();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!user) {
    return <SignInPrompt message="Sohbete katılmak için giriş yapmalısın." />;
  }

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await sendChatMessage(trimmed);
      setText('');
    } catch (err) {
      setError(err.message || 'Mesaj gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chatsapp-screen">
      <div className="chatsapp-messages">
        {messages.map((m) => (
          <div key={m.id} className={`chatsapp-bubble${m.uid === user.uid ? ' mine' : ''}`}>
            <span className="chatsapp-sender">{m.displayName}</span>
            <span className="chatsapp-text">{m.text}</span>
            <span className="chatsapp-time">{formatTime(m.createdAt)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chatsapp-input-row">
        <input
          type="text"
          placeholder="Mesaj yaz…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          maxLength={300}
          className="chatsapp-input"
        />
        <button className="chatsapp-send" disabled={busy || !text.trim()} onClick={handleSend}>
          Gönder
        </button>
      </div>
      {error && <p className="chatsapp-error">{error}</p>}
    </div>
  );
}
