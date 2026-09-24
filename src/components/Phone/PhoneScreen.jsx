import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import GuideScreen from '../GuideScreen/GuideScreen';
import IdeasScreen from '../IdeasScreen/IdeasScreen';
import InstallAppButton from '../InstallAppButton/InstallAppButton';
import { useMessages } from '../../hooks/useMessages';
import { usePlayer } from '../../hooks/usePlayer';
import { useUnreadNotifications, markChatsAppSeen, markSixtagramSeen } from '../../hooks/useUnreadNotifications';
import './PhoneScreen.css';

// Telefon 3 sayfa, gerçek telefondaki gibi yana kaydırılır:
//   [ TV (haberler) ]  ←  [ Ana ekran ]  →  [ Altın · Neon Şehir · Bi fikrin mi var? ]
// id'ler geriye dönük uyumluluk için korunuyor (bkz. initialApp kullanımları).
const APPS = [
  { id: 'amazor', glyph: 'a', note: 'Amazor', tone: 'amazor' },
  { id: 'casino', glyph: '🎰', note: 'Casino', tone: 'casino' },
  { id: 'sixtagram', glyph: '📸', note: 'Sixtagram', tone: 'sixtagram' },
  { id: 'flappy', glyph: '🐤', note: 'Flappy Kuş', tone: 'flappy' },
];
const EXTRA_APPS = [
  { id: 'altin-magazasi', glyph: '', note: 'Altın Mağazası', tone: 'gold' },
  { id: 'rehber', glyph: 'N', note: 'Neon Şehir', tone: 'rehber' },
  { id: 'fikir', glyph: '💡', note: 'Bi fikrin mi var?', tone: 'fikir' },
];
const DOCK = [
  { id: 'sms', glyph: '✉️', note: 'SMS', tone: 'sms' },
  { id: 'chatsapp', glyph: '💬', note: 'ChatsApp', tone: 'chatsapp' },
  { id: 'ikinci-el', glyph: '2', note: '2. El', tone: 'ikinciel' },
  { id: 'banka', glyph: 'P', note: 'Parara', tone: 'banka' },
];
const PAGES = 3;
const HOME_PAGE = 1;

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
  rehber: 'Neon Şehir',
  fikir: 'Bi Fikrin mi Var?',
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

// Durum çubuğu: solda belirgin "‹ Harita" (telefonu kapatır), sağda sinyal / wifi / pil
function StatusBar({ onBack }) {
  return (
    <div className="phone-status">
      <button className="phone-status-back" onClick={onBack} aria-label="Haritaya dön">
        <span aria-hidden="true">‹</span> Harita
      </button>
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
  const [page, setPage] = useState(HOME_PAGE);
  const pagerRef = useRef(null);
  // Ana ekrana her dönüşte kaldığın sayfaya (ilk açılışta ana sayfaya) kaydır
  useLayoutEffect(() => {
    const el = pagerRef.current;
    if (el) el.scrollLeft = el.clientWidth * page;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openApp]);
  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (!el || !el.clientWidth) return;
    const p = Math.round(el.scrollLeft / el.clientWidth);
    if (p !== page) setPage(Math.max(0, Math.min(PAGES - 1, p)));
  };
  const goPage = (p) => pagerRef.current?.scrollTo({ left: pagerRef.current.clientWidth * p, behavior: 'smooth' });
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
        <StatusBar onBack={onClose} />
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
        <div className={`phone-app-body${openApp === 'rehber' ? ' full' : ''}`}>
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
          {openApp === 'rehber' && <GuideScreen />}
          {openApp === 'fikir' && <IdeasScreen />}
        </div>
      </div>
    );
  }

  return (
    <div className={`phone-screen home${page === 0 ? ' on-tv' : ''}`}>
      <StatusBar onBack={onClose} />
      <div className="phone-pager" ref={pagerRef} onScroll={onPagerScroll}>
        {/* Sol sayfa: TV (haberler) */}
        <section className="phone-page phone-page-tv" aria-label="Neon TV">
          <div className="phone-tv-head">
            <span className="phone-tv-logo">📺</span> Neon TV
          </div>
          {/* TV sadece bu sayfa görünürken çalışır (sesi/animasyonu arka planda sürmesin) */}
          <div className="phone-tv-body">{page === 0 ? <NewspaperScreen /> : <div className="phone-tv-idle">📺</div>}</div>
        </section>

        {/* Ana sayfa */}
        <section className="phone-page phone-page-home" aria-label="Ana ekran">
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
        </section>

        {/* Sağ sayfa */}
        <section className="phone-page phone-page-extra" aria-label="Diğer uygulamalar">
          <div className="phone-apps-grid">
            {EXTRA_APPS.map((app) => (
              <AppIcon key={app.id} app={app} badge={0} dot={false} onOpen={handleOpenApp} />
            ))}
          </div>
        </section>
      </div>

      <div className="phone-dots" role="tablist" aria-label="Sayfalar">
        {Array.from({ length: PAGES }, (_, i) => (
          <button key={i} role="tab" aria-selected={page === i} aria-label={i === 0 ? 'TV' : i === 1 ? 'Ana ekran' : 'Diğer'} className={`phone-dot${page === i ? ' on' : ''}${i === 0 ? ' tv' : ''}`} onClick={() => goPage(i)} />
        ))}
      </div>
      <div className="phone-dock">
        {DOCK.map((app) => (
          <AppIcon key={app.id} app={app} badge={badgeOf(app.id)} dot={dotOf(app.id)} onOpen={handleOpenApp} />
        ))}
      </div>
    </div>
  );
}
