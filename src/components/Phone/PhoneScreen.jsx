import { useState } from 'react';
import MessagesScreen from '../MessagesScreen/MessagesScreen';
import MarketplaceScreen from '../MarketplaceScreen/MarketplaceScreen';
import BankScreen from '../BankScreen/BankScreen';
import AmazorScreen from '../AmazorScreen/AmazorScreen';
import ChatsAppScreen from '../ChatsAppScreen/ChatsAppScreen';
import CasinoScreen from '../CasinoScreen/CasinoScreen';
import InstallAppButton from '../InstallAppButton/InstallAppButton';
import { useMessages } from '../../hooks/useMessages';
import { usePlayer } from '../../hooks/usePlayer';
import { useUnreadNotifications, markChatsAppSeen } from '../../hooks/useUnreadNotifications';
import './PhoneScreen.css';

const APPS = [
  { id: 'ikinci-el', label: '2', note: 'İkinci El Satış', enabled: true },
  { id: 'banka', label: 'P', note: 'Parara Bank', enabled: true },
  { id: 'sms', label: '✉️', note: 'SMS', enabled: true },
  { id: 'amazor', label: 'A', note: 'Amazor Market', enabled: true },
  { id: 'chatsapp', label: '💬', note: 'ChatsApp', enabled: true },
  { id: 'casino', label: '🎰', note: 'Casino', enabled: true },
];

const APP_TITLES = {
  'ikinci-el': 'İkinci El Satış',
  banka: 'Parara Bank',
  sms: 'SMS',
  amazor: 'Amazor Market',
  chatsapp: 'ChatsApp',
  casino: 'Casino',
};

export default function PhoneScreen({ onClose, initialApp = null, onEnterTable }) {
  const [openApp, setOpenApp] = useState(initialApp);
  const { messages } = useMessages();
  const { player } = usePlayer();
  const unreadCount = messages.filter((m) => !m.read).length;
  const { chatsAppHasNew } = useUnreadNotifications();

  const handleOpenApp = (id) => {
    setOpenApp(id);
    if (id === 'chatsapp') markChatsAppSeen();
  };

  if (openApp) {
    return (
      <div className="phone-screen">
        <div className="phone-screen-header">
          <button className="phone-back" onClick={() => setOpenApp(null)}>
            ← Uygulamalara dön
          </button>
          <span className="phone-clock">{APP_TITLES[openApp]}</span>
          {openApp === 'banka' && (
            <span className="phone-header-gold">
              <span className="phone-header-gold-coin" />
              {(player?.gold ?? 0).toLocaleString('tr-TR')}
            </span>
          )}
        </div>
        <div className="phone-app-body">
          {openApp === 'sms' && <MessagesScreen />}
          {openApp === 'ikinci-el' && <MarketplaceScreen />}
          {openApp === 'banka' && <BankScreen />}
          {openApp === 'amazor' && <AmazorScreen />}
          {openApp === 'chatsapp' && <ChatsAppScreen />}
          {openApp === 'casino' && (
            <CasinoScreen
              onEnterTable={(tableId) => {
                onClose();
                onEnterTable?.(tableId);
              }}
            />
          )}
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
            onClick={() => app.enabled && handleOpenApp(app.id)}
          >
            <span
              className={`phone-app-icon${app.id === 'ikinci-el' ? ' phone-app-icon-2el' : ''}${
                app.id === 'amazor' ? ' phone-app-icon-amazor' : ''
              }${app.id === 'chatsapp' ? ' phone-app-icon-chatsapp' : ''}${
                app.id === 'banka' ? ' phone-app-icon-banka' : ''
              }`}
            >
              {app.label}
              {app.id === 'sms' && unreadCount > 0 && (
                <span className="phone-app-badge">{unreadCount}</span>
              )}
              {app.id === 'chatsapp' && chatsAppHasNew && <span className="phone-app-dot" />}
            </span>
            <span className="phone-app-name">{app.note}</span>
          </button>
        ))}
      </div>

      <div className="phone-install-row">
        <InstallAppButton />
      </div>
    </div>
  );
}
