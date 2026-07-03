import { useState } from 'react';
import MessagesScreen from '../MessagesScreen/MessagesScreen';
import MarketplaceScreen from '../MarketplaceScreen/MarketplaceScreen';
import BankScreen from '../BankScreen/BankScreen';
import AmazorScreen from '../AmazorScreen/AmazorScreen';
import ChatsAppScreen from '../ChatsAppScreen/ChatsAppScreen';
import { useMessages } from '../../hooks/useMessages';
import './PhoneScreen.css';

const APPS = [
  { id: 'ikinci-el', label: '2', note: 'İkinci El Satış', enabled: true },
  { id: 'banka', label: '🏦', note: 'Banka', enabled: true },
  { id: 'sms', label: '✉️', note: 'SMS', enabled: true },
  { id: 'amazor', label: 'A', note: 'Amazor Market', enabled: true },
  { id: 'chatsapp', label: '💬', note: 'ChatsApp', enabled: true },
];

const APP_TITLES = {
  'ikinci-el': 'İkinci El Satış',
  banka: 'Banka',
  sms: 'SMS',
  amazor: 'Amazor Market',
  chatsapp: 'ChatsApp',
};

export default function PhoneScreen({ onClose }) {
  const [openApp, setOpenApp] = useState(null);
  const { messages } = useMessages();
  const unreadCount = messages.filter((m) => !m.read).length;

  if (openApp) {
    return (
      <div className="phone-screen">
        <div className="phone-screen-header">
          <button className="phone-back" onClick={() => setOpenApp(null)}>
            ← Uygulamalara dön
          </button>
          <span className="phone-clock">{APP_TITLES[openApp]}</span>
        </div>
        <div className="phone-app-body">
          {openApp === 'sms' && <MessagesScreen />}
          {openApp === 'ikinci-el' && <MarketplaceScreen />}
          {openApp === 'banka' && <BankScreen />}
          {openApp === 'amazor' && <AmazorScreen />}
          {openApp === 'chatsapp' && <ChatsAppScreen />}
        </div>
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
            <span
              className={`phone-app-icon${app.id === 'ikinci-el' ? ' phone-app-icon-2el' : ''}${
                app.id === 'amazor' ? ' phone-app-icon-amazor' : ''
              }${app.id === 'chatsapp' ? ' phone-app-icon-chatsapp' : ''}`}
            >
              {app.label}
              {app.id === 'sms' && unreadCount > 0 && (
                <span className="phone-app-badge">{unreadCount}</span>
              )}
            </span>
            <span className="phone-app-name">{app.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
