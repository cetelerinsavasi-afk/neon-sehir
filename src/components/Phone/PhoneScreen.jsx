import { useEffect, useState } from 'react';
import MessagesScreen from '../MessagesScreen/MessagesScreen';
import MarketplaceScreen from '../MarketplaceScreen/MarketplaceScreen';
import BankScreen from '../BankScreen/BankScreen';
import AmazorScreen from '../AmazorScreen/AmazorScreen';
import ChatsAppScreen from '../ChatsAppScreen/ChatsAppScreen';
import CasinoScreen from '../CasinoScreen/CasinoScreen';
import NewspaperScreen from '../NewspaperScreen/NewspaperScreen';
import FlappyBirdScreen from '../FlappyBirdScreen/FlappyBirdScreen';
import GoldStoreScreen from '../GoldStoreScreen/GoldStoreScreen';
import SixtagramScreen from '../Sixtagram/SixtagramScreen';
import InstallAppButton from '../InstallAppButton/InstallAppButton';
import { useMessages } from '../../hooks/useMessages';
import { usePlayer } from '../../hooks/usePlayer';
import { useUnreadNotifications, markChatsAppSeen, markSixtagramSeen } from '../../hooks/useUnreadNotifications';
import './PhoneScreen.css';

// Uygulamalar: ana ekran ızgarası + alttaki dock (gerçek telefon düzeni).
// id'ler geriye dönük uyumluluk için korunuyor (bkz. initialApp kullanımları).
const APPS = [
  { id: 'amazor', glyph: 'a', note: 'Amazor', tone: 'amazor' },
  { id: 'casino', glyph: '🎰', note: 'Casino', tone: 'casino' },
  // gazete -> TV: id korunuyor (useNewspaper verisi TV'nin Haber kanalı)
  { id: 'gazete', glyph: '📺', note: 'TV', tone: 'tv' },
  { id: 'sixtagram', glyph: '📸', note: 'Sixtagram', tone: 'sixtagram' },
  { id: 'flappy', glyph: '🐤', note: 'Flappy Kuş', tone: 'flappy' },
  { id: 'altin-magazasi', glyph: '', note: 'Altın', tone: 'gold' },
];
const DOCK = [
  { id: 'sms', glyph: '✉️', note: 'SMS', tone: 'sms' },
  { id: 'chatsapp', glyph: '💬', note: 'ChatsApp', tone: 'chatsapp' },
  { id: 'ikinci-el', glyph: '2', note: '2. El', tone: 'ikinciel' },
  { id: 'banka', glyph: 'P', note: 'Parara', tone: 'banka' },
];

const APP_TITLES = {
  'ikinci-el': 'İkinci El Satış',
  banka: 'Parara Bank',
  sms: 'SMS',
  amazor: 'Amazor Market',
  chatsapp: 'ChatsApp',
  casino: 'Casino',
  gazete: 'Neon TV',
  flappy: 'Flappy Kuş',
  sixtagram: 'Sixtagram',
  'altin-magazasi': 'Altın Mağazası',
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const time = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return { time, date };
}

// Gerçek telefon durum çubuğu: saat · (geri bağlantısı) · sinyal / wifi / pil
function StatusBar({ time, backLabel, onBack }) {
  return (
    <div className="phone-status">
      <span className="phone-status-left">
        <b className="phone-status-time">{time}</b>
        {backLabel && (
          <button className="phone-status-back" onClick={onBack}>
            ◀ {backLabel}
          </button>
        )}
      </span>
      <span className="phone-status-right" aria-hidden="true">
        <span className="phone-signal">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="phone-carrier">NEON</span>
        <span className="phone-wifi" />
        <span className="phone-battery">
          <span />
        </span>
      </span>
    </div>
  );
}

function AppIcon({ app, badge, dot, onOpen }) {
  return (
    <button className="phone-app" onClick={() => onOpen(app.id)}>
      <span className={`phone-app-icon tone-${app.tone}`}>
        {app.tone === 'gold' ? <span className="phone-gold-glyph" /> : <span className="phone-app-glyph">{app.glyph}</span>}
        {badge > 0 && <span className="phone-app-badge">{badge > 99 ? '99+' : badge}</span>}
        {dot && <span className="phone-app-dot" />}
      </span>
      <span className="phone-app-name">{app.note}</span>
    </button>
  );
}

export default function PhoneScreen({ onClose, initialApp = null, onEnterTable }) {
  const [openApp, setOpenApp] = useState(initialApp);
  const { messages } = useMessages();
  const { player } = usePlayer();
  const unreadCount = messages.filter((m) => !m.read).length;
  const { chatsAppHasNew, sixtagramHasNew } = useUnreadNotifications();
  const { time, date } = useClock();

  const handleOpenApp = (id) => {
    setOpenApp(id);
    if (id === 'chatsapp') markChatsAppSeen();
    if (id === 'sixtagram') markSixtagramSeen();
  };
  const badgeOf = (id) => (id === 'sms' ? unreadCount : 0);
  const dotOf = (id) => (id === 'chatsapp' && chatsAppHasNew) || (id === 'sixtagram' && sixtagramHasNew);

  if (openApp) {
    return (
      <div className="phone-screen in-app">
        <StatusBar time={time} backLabel="Harita" onBack={onClose} />
        <div className="phone-navbar">
          <button className="phone-nav-back" onClick={() => setOpenApp(null)} aria-label="Ana ekran">
            ‹
          </button>
          <span className="phone-nav-title">{APP_TITLES[openApp]}</span>
          <span className="phone-nav-right">
            {openApp === 'banka' && (
              <span className="phone-header-gold">
                <span className="phone-header-gold-coin" />
                {(player?.gold ?? 0).toLocaleString('tr-TR')}
              </span>
            )}
          </span>
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
          {openApp === 'gazete' && <NewspaperScreen />}
          {openApp === 'flappy' && <FlappyBirdScreen />}
          {openApp === 'sixtagram' && <SixtagramScreen />}
          {openApp === 'altin-magazasi' && <GoldStoreScreen />}
        </div>
        <button className="phone-home-bar" onClick={() => setOpenApp(null)} aria-label="Ana ekran">
          <span />
        </button>
      </div>
    );
  }

  return (
    <div className="phone-screen home">
      <StatusBar time={time} backLabel="Harita" onBack={onClose} />
      <div className="phone-widget">
        <div className="phone-widget-time">{time}</div>
        <div className="phone-widget-date">{date}</div>
        <div className="phone-widget-gold">
          <span className="phone-header-gold-coin" /> {(player?.gold ?? 0).toLocaleString('tr-TR')}
        </div>
      </div>

      <div className="phone-apps-grid">
        {APPS.map((app) => (
          <AppIcon key={app.id} app={app} badge={badgeOf(app.id)} dot={dotOf(app.id)} onOpen={handleOpenApp} />
        ))}
      </div>

      <div className="phone-home-spacer" />
      <div className="phone-install-row">
        <InstallAppButton />
      </div>
      <div className="phone-dock">
        {DOCK.map((app) => (
          <AppIcon key={app.id} app={app} badge={badgeOf(app.id)} dot={dotOf(app.id)} onOpen={handleOpenApp} />
        ))}
      </div>
      <button className="phone-home-bar" onClick={onClose} aria-label="Haritaya dön">
        <span />
      </button>
    </div>
  );
}
