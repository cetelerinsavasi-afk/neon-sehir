import { useState } from 'react';
import MessagesScreen from '../MessagesScreen/MessagesScreen';
import { useMessages } from '../../hooks/useMessages';
import './PhoneScreen.css';

const APPS = [
  { id: 'ikinci-el', label: '2.', note: 'İkinci El Satış', enabled: false },
  { id: 'banka', label: '🏦', note: 'Banka', enabled: false },
  { id: 'sms', label: '✉️', note: 'SMS', enabled: true },
];

export default function PhoneScreen({ onClose }) {
  const [openApp, setOpenApp] = useState(null);
  const { messages } = useMessages();
  const unreadCount = messages.filter((m) => !m.read).length;

  if (openApp === 'sms') {
    return (
      <div className="phone-screen">
        <div className="phone-screen-header">
          <button className="phone-back" onClick={() => setOpenApp(null)}>
            ← Uygulamalara dön
          </button>
          <span className="phone-clock">SMS</span>
        </div>
        <MessagesScreen />
      </div>
    );
  }

  return (
    <div className="phone-screen">
      <div className="phone-screen-header">
        <button className="phone-back" onClick={onClose}>
          ← Haritaya dön
        </button>
        <span className="phone-clock">Neon Şehir</span>
      </div>

      <div className="phone-apps-grid">
        {APPS.map((app) => (
          <button
            key={app.id}
            className="phone-app"
            disabled={!app.enabled}
            onClick={() => app.enabled && setOpenApp(app.id)}
          >
            <span className="phone-app-icon">
              {app.label}
              {app.id === 'sms' && unreadCount > 0 && (
                <span className="phone-app-badge">{unreadCount}</span>
              )}
            </span>
            <span className="phone-app-name">{app.note}</span>
          </button>
        ))}
      </div>

      <p className="phone-placeholder-note">
        Diğer telefon uygulamaları ilerleyen fazlarda geliştirilecek (Bölüm 9).
      </p>
    </div>
  );
}
