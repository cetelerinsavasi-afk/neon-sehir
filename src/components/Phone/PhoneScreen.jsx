import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MessagesScreen from '../MessagesScreen/MessagesScreen';
import MarketplaceScreen from '../MarketplaceScreen/MarketplaceScreen';
import BankScreen from '../BankScreen/BankScreen';
import ChatsAppScreen from '../ChatsAppScreen/ChatsAppScreen';
import NewspaperScreen from '../NewspaperScreen/NewspaperScreen';
import SixtagramScreen from '../Sixtagram/SixtagramScreen';
import GuideScreen from '../GuideScreen/GuideScreen';
import GazeteScreen from '../Gazete/GazeteScreen';
import IdeasScreen from '../IdeasScreen/IdeasScreen';
import AchievementsScreen from '../AchievementsScreen/AchievementsScreen';
import InstallAppButton from '../InstallAppButton/InstallAppButton';
import { useUnreadSmsCount } from '../../hooks/useMessages';
import { usePlayer } from '../../hooks/usePlayer';
import { useUnreadNotifications, markSixtagramSeen } from '../../hooks/useUnreadNotifications';
import { useSocial } from '../../contexts/SocialContext';
import { OPEN_DM_EVENT } from '../../lib/chatsappNav';
import { IS_ANDROID_APP, IS_ANDROID_WEBVIEW } from '../../lib/platform';
import { webViewStoreOpen } from '../../lib/playBilling';
import { useBackClose } from '../../lib/backStack';
import { useAuth } from '../../contexts/AuthContext';
import { retryImport } from '../../lib/lazyRetry';
import CappstoreScreen from './CappstoreScreen';
import { STORE_BY_ID, usePhoneApps } from './cappstoreApps';
import { PhoneSvgIcon } from './phoneIcons';
import './PhoneScreen.css';

// Altın Mağazası ayrı bir JS parçasına (chunk) bölünüyor: Shopier
// linkleri/fiyatlar ana pakette yer almıyor, parça yalnızca mağaza ilk
// açıldığında indiriliyor. Davranış aynı; sadece ilk açılışta çok kısa
// bir yükleme anı olabilir.
const GoldStoreScreen = lazy(() => import('../GoldStoreScreen/GoldStoreScreen'));
// v161 — Cappstore uygulamaları (ağır ekranlar ayrı parça; sadece açılınca indirilir)
const FactoryScreen = lazy(retryImport(() => import('../FactoryScreen/FactoryScreen')));
const FutbolFullScreen = lazy(retryImport(() => import('../FutbolScreen/FutbolFullScreen')));
const BelediyeScreen = lazy(retryImport(() => import('../Belediye/BelediyeScreen')));
const BusinessesApp = lazy(retryImport(() => import('./BusinessesApp')));

// Telefon 3 sayfa, gerçek telefondaki gibi yana kaydırılır:
//   [ Gazete ]  ←  [ Ana ekran ]  →  [ Altın · Neon Şehir · Bi fikrin mi var? ]
// v159: sol sayfadaki haberler (Neon TV) kaldırıldı — sola kaydırınca Neon Şehir Gazetesi açılır.
//       Flappy Kuş telefondan kaldırıldı → bilgisayar oyunları (internet kafe) arasında; skorlar aynı.
// id'ler geriye dönük uyumluluk için korunuyor (bkz. initialApp kullanımları).
// v161 — ana ekran: Cappstore (sabit, silinmez) + Cappstore'dan indirilen uygulamalar (bkz. cappstoreApps.js)
// v124: Amazor / Casino uygulamaları kaldırıldı · v159: Flappy Kuş internet kafede, Gazete sol sayfada
const CAPPSTORE_APP = { id: 'cappstore', note: 'Cappstore', tone: 'cappstore', svg: true };
const STORE_ICON = {
  parara: { id: 'parara', glyph: 'P', note: 'Parara', tone: 'banka' },
  fabrika: { id: 'fabrika', note: 'Fabrika', tone: 'fabrika', svg: true },
  isletme: { id: 'isletme', note: 'İşletme', tone: 'isletme', svg: true },
  futbol: { id: 'futbol', note: 'Futbol', tone: 'futbol', svg: true },
  belediye: { id: 'belediye', note: 'Belediye', tone: 'belediye', svg: true },
};
const ICON_OF = { cappstore: CAPPSTORE_APP, ...STORE_ICON };
const EXTRA_APPS = [
  { id: 'altin-magazasi', glyph: '', note: 'Zümrüt Mağazası', tone: 'emerald' },
  { id: 'rehber', glyph: 'N', note: 'Neon Şehir', tone: 'rehber' },
  { id: 'fikir', glyph: '💡', note: 'Bi fikrin mi var?', tone: 'fikir' },
  { id: 'basarilar', glyph: '🏆', note: 'Başarılar', tone: 'basarilar' },
];

// Android (Google Play TWA) içinde Altın Mağazası hiçbir yoldan açılamaz:
// ikon listeden çıkarılır, initialApp/handleOpenApp ile gelse bile
// yok sayılır ve render satırı da ayrıca korunur. Web'de (IS_ANDROID_APP
// = false) VISIBLE_EXTRA_APPS birebir EXTRA_APPS'in kendisidir.
const GOLD_STORE_APP_ID = 'altin-magazasi';
// v91: Android'de de Zümrüt Mağazası AÇIK — ama içinde Shopier yok, satın
// alma Google Play Faturalandırma ile yapılıyor (bkz. GoldStoreScreen /
// lib/playBilling.js). Gerekirse tekrar kapatmak için bu bayrağı false yap.
const ANDROID_STORE_ENABLED = true;
// v148: Yeni Android WebView uygulamasında Digital Goods API yok → bu adımda
// mağaza SADECE WebView kabuğunda kapalı (native Play Faturalandırma 2. adımda).
// Eski TWA'da (IS_ANDROID_TWA) ANDROID_STORE_ENABLED davranışı aynen sürer.
// v155: WebView'da mağaza SADECE köprüsünde faturalandırma olan sürümde (v15+) ve kapatma
// anahtarı (lib/playBilling.js NATIVE_PLAY_BILLING_ON) açıkken görünür. Senkron karar → titreme yok.
const STORE_BLOCKED = IS_ANDROID_WEBVIEW ? !webViewStoreOpen() : IS_ANDROID_APP && !ANDROID_STORE_ENABLED;
const isAppBlocked = (id) => STORE_BLOCKED && id === GOLD_STORE_APP_ID;
const VISIBLE_EXTRA_APPS = STORE_BLOCKED
  ? EXTRA_APPS.filter((app) => app.id !== GOLD_STORE_APP_ID)
  : EXTRA_APPS;
const DOCK = [
  { id: 'sms', glyph: '✉️', note: 'SMS', tone: 'sms' },
  { id: 'chatsapp', glyph: '💬', note: 'ChatsApp', tone: 'chatsapp' },
  { id: 'ikinci-el', glyph: '2', note: '2. El', tone: 'ikinciel' },
  // v161: Parara Cappstore'a taşındı; yerine Sixtagram geldi. Dock sabit (silinmez, taşınmaz).
  { id: 'sixtagram', glyph: '📸', note: 'Sixtagram', tone: 'sixtagram' },
];
const PAGES = 3;
const HOME_PAGE = 1;

const APP_TITLES = {
  'ikinci-el': 'İkinci El Satış',
  banka: 'Parara Bank',
  sms: 'SMS',
  chatsapp: 'ChatsApp',
  gazete: 'Neon TV',
  flappy: 'Flappy Kuş',
  sixtagram: 'Sixtagram',
  'altin-magazasi': 'Zümrüt Mağazası',
  rehber: 'Neon Şehir',
  fikir: 'Bi Fikrin mi Var?',
  basarilar: 'Başarılar',
  'neon-gazete': 'Neon Şehir Gazetesi',
  cappstore: 'Cappstore',
  parara: 'Parara Bank',
  fabrika: 'Fabrika',
  isletme: 'İşletmelerim',
};
// v161: eski 'banka' kısayolları (ör. altın butonu) artık Parara uygulamasını açar
const normApp = (id) => (id === 'banka' ? 'parara' : id);

function useClock() {
  const [now, setNow] = useState(() => new Date(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now())), 15_000);
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

function IconFace({ app, size = 58 }) {
  const k = size / 58;
  return app.svg ? (
    <PhoneSvgIcon id={app.id} size={Math.round(32 * k)} />
  ) : app.tone === 'gold' ? (
    <span className="phone-gold-glyph" />
  ) : app.tone === 'emerald' ? (
    <span className="emerald-icon" style={{ width: 30, height: 30 }} />
  ) : (
    <span className="phone-app-glyph" style={size !== 58 ? { fontSize: Math.round(30 * k) } : undefined}>
      {app.glyph}
    </span>
  );
}
// v161: Cappstore'un içinde de aynı ikonlar (boyutlu)
export function StoreAppIcon({ id, size = 58 }) {
  const app = ICON_OF[id];
  if (!app) return null;
  return (
    <span className={`phone-app-icon tone-${app.tone}`} style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), flexShrink: 0 }}>
      <IconFace app={app} size={size} />
    </span>
  );
}

function AppIcon({ app, badge, dot, onOpen }) {
  return (
    <button className="phone-app" onClick={() => onOpen(app.id)}>
      <span className={`phone-app-icon tone-${app.tone}`}>
        <IconFace app={app} />
        {badge > 0 && <span className="phone-app-badge">{badge > 9 ? '9+' : badge}</span>}
        {dot && <span className="phone-app-dot" />}
      </span>
      <span className="phone-app-name">{app.note}</span>
    </button>
  );
}

// v161 — ana ekran ızgarası: basılı tut → düzenleme (sallanma), sürükle → yer değiştir, "−" → sil.
// Cappstore sabit (ilk sırada, silinmez). İndirilmekte olanlar soluk ikon + ilerleme halkasıyla görünür.
function HomeGrid({ items, edit, setEdit, onOpen, onReorder, onAskDelete }) {
  const [drag, setDrag] = useState(null); // { id, x, y }
  const lp = useRef(0);
  const st = useRef({ down: null, long: false, moved: false, sx: 0, sy: 0 });
  const gridRef = useRef(null);
  useEffect(() => () => clearTimeout(lp.current), []);
  const rel = (e) => {
    const r = gridRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left - 29, y: e.clientY - r.top - 34 };
  };
  const down = (it, e) => {
    if (e.button != null && e.button !== 0) return;
    const s = st.current;
    s.down = it.id;
    s.long = false;
    s.moved = false;
    s.sx = e.clientX;
    s.sy = e.clientY;
    if (edit) {
      if (!it.movable) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* yoksay */
      }
      setDrag({ id: it.id, ...rel(e) });
      return;
    }
    clearTimeout(lp.current);
    lp.current = setTimeout(() => {
      s.long = true;
      try {
        navigator.vibrate?.(12);
      } catch {
        /* yoksay */
      }
      setEdit(true);
    }, 480);
  };
  const move = (e) => {
    const s = st.current;
    if (!drag) {
      if (s.down && (Math.abs(e.clientX - s.sx) > 10 || Math.abs(e.clientY - s.sy) > 10)) {
        s.moved = true; // sayfa kaydırılıyor → uzun basma / açma iptal
        clearTimeout(lp.current);
      }
      return;
    }
    e.preventDefault();
    setDrag((d) => (d ? { ...d, ...rel(e) } : d));
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tid = el?.closest?.('[data-slot]')?.getAttribute('data-slot');
    if (tid && tid !== drag.id) onReorder(drag.id, tid);
  };
  const up = (it) => {
    const s = st.current;
    clearTimeout(lp.current);
    if (drag) {
      setDrag(null);
      s.down = null;
      return;
    }
    const tap = s.down === it.id && !s.long && !s.moved && !edit;
    s.down = null;
    if (tap && !it.loading) onOpen(it.id);
  };
  const cancel = () => {
    clearTimeout(lp.current);
    st.current.down = null;
    setDrag(null);
  };
  return (
    <div ref={gridRef} className={`phone-apps-grid${edit ? ' editing' : ''}`} onPointerMove={move}>
      {items.map((it, i) => (
        <div key={it.id} data-slot={it.id} className={`phone-slot${drag?.id === it.id ? ' dragging' : ''}`}>
          <button
            className={`phone-app${edit && drag?.id !== it.id ? (i % 2 ? ' jig jig2' : ' jig') : ''}`}
            onPointerDown={(e) => down(it, e)}
            onPointerUp={() => up(it)}
            onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => e.detail === 0 && !edit && !it.loading && onOpen(it.id)}
            aria-label={it.app.note}
          >
            <span className={`phone-app-icon tone-${it.app.tone}${it.loading ? ' loading' : ''}`}>
              <IconFace app={it.app} />
              {it.loading && (
                <span className="phone-app-progress" aria-hidden="true">
                  <svg width="34" height="34" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.4" />
                    <circle cx="12" cy="12" r="10" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={`${((it.pct / 100) * 62.83).toFixed(1)} 62.83`} transform="rotate(-90 12 12)" />
                  </svg>
                </span>
              )}
            </span>
            <span className="phone-app-name">{it.loading ? 'Yükleniyor…' : it.app.note}</span>
          </button>
          {edit && it.movable && (
            <button className="phone-app-del" onPointerDown={(e) => e.stopPropagation()} onClick={() => onAskDelete(it.id)} aria-label={`${it.app.note} uygulamasını sil`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
                <path d="M5 12h14" />
              </svg>
            </button>
          )}
        </div>
      ))}
      {drag && (
        <span className="phone-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <span className={`phone-app-icon tone-${ICON_OF[drag.id]?.tone}`}>
            <IconFace app={ICON_OF[drag.id]} />
          </span>
        </span>
      )}
    </div>
  );
}

export default function PhoneScreen({ onClose, initialApp = null, onAppChange = null }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  // v161 — Cappstore: kurulu uygulamalar (Belediye sadece görevliye; görevden çıkınca silinir)
  const staff = Boolean(player?.belediyeSeat);
  const apps = usePhoneApps(user?.uid || null, { staff, playerReady: Boolean(player) });
  const [storeDetail, setStoreDetail] = useState(null);
  const [bizSel, setBizSel] = useState(null); // { id, name }
  const [edit, setEdit] = useState(false);
  const [askDelete, setAskDelete] = useState(null);
  // eski 'banka' kısayolu: Parara kuruluysa açılır, değilse Cappstore'da Parara sayfası
  const [openApp, setOpenAppRaw] = useState(() => {
    const id = normApp(initialApp);
    if (isAppBlocked(id) || id === 'flappy') return null;
    return id;
  });
  const setOpenApp = (id) => {
    setOpenAppRaw(id);
    if (id !== 'cappstore') setStoreDetail(null);
    if (id !== 'isletme') setBizSel(null);
  };
  useEffect(() => {
    if (STORE_BY_ID[openApp] && !apps.order.includes(openApp)) {
      // kurulu değil (ör. kısayol) ya da az önce silindi / görevden alındı
      setStoreDetail(openApp);
      setOpenAppRaw('cappstore');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openApp, apps.order]);
  useEffect(() => {
    if (!apps.notice) return undefined;
    const t = setTimeout(apps.clearNotice, 3600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps.notice]);
  const [page, setPage] = useState(HOME_PAGE);
  const [gazeteSeen, setGazeteSeen] = useState(false);
  useEffect(() => {
    if (page === 0) setGazeteSeen(true);
  }, [page]);
  // v160.5: açık uygulama dışarı bildirilir (şehir, Sixtagram açıkken telefonda grafik belleğini bırakır)
  useEffect(() => {
    onAppChange?.(openApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openApp]);
  useEffect(() => () => onAppChange?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  // v68 — Android geri tuşu: önce açık uygulama kapanır, sonra telefon
  useBackClose(true, onClose);
  useBackClose(Boolean(openApp), () => setOpenApp(null));
  // v161: uygulama içi alt sayfa (Cappstore detayı / işletme ayarları) önce kapanır
  useBackClose(Boolean(storeDetail || bizSel), () => {
    setStoreDetail(null);
    setBizSel(null);
  });
  useBackClose(edit, () => setEdit(false));
  // Kısayoldan / bildirimden doğrudan açılan uygulama da "görüldü" sayılır
  // v60: ChatsApp'ta "görüldü" artık Neon Şehir grubu açılınca işaretlenir (GroupChat)
  useEffect(() => {
    if (initialApp === 'sixtagram') markSixtagramSeen();
  }, [initialApp]);
  // v60: Oyuncu Kartı → "💬 Mesaj" telefon açıkken de ChatsApp'a geçsin
  useEffect(() => {
    const on = () => setOpenApp('chatsapp');
    window.addEventListener(OPEN_DM_EVENT, on);
    return () => window.removeEventListener(OPEN_DM_EVENT, on);
  }, []);
  const social = useSocial();
  const chatsAppCount = social.unreadTotal + social.requestCount;
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
  const unreadCount = useUnreadSmsCount();
  const { chatsAppHasNew, sixtagramHasNew } = useUnreadNotifications();
  const { time, date } = useClock();

  const handleOpenApp = (raw) => {
    const id = normApp(raw);
    if (isAppBlocked(id) || edit) return;
    setOpenApp(id);
    if (id === 'sixtagram') markSixtagramSeen();
  };
  // ana ekran ızgarası
  const dlIds = Object.keys(apps.downloading).filter((id) => !apps.order.includes(id));
  const gridItems = [
    { id: 'cappstore', app: CAPPSTORE_APP, movable: false },
    ...apps.order.map((id) => ({ id, app: STORE_ICON[id], movable: true })),
    ...dlIds.map((id) => ({ id, app: STORE_ICON[id], movable: false, loading: true, pct: apps.downloading[id] || 0 })),
  ].filter((it) => it.app);
  const reorder = (from, to) =>
    apps.setOrder((o) => {
      if (!o.includes(from) || !o.includes(to)) return o;
      const ti = o.indexOf(to);
      const rest = o.filter((x) => x !== from);
      rest.splice(ti, 0, from);
      return rest;
    });
  const doDelete = () => {
    const id = askDelete;
    setAskDelete(null);
    if (!id) return;
    apps.remove(id);
    apps.setNotice({ app: id, title: `${STORE_BY_ID[id]?.name || 'Uygulama'} silindi`, body: 'Cappstore’dan tekrar indirebilirsin; verilerin yerinde.' });
    if (apps.order.length <= 1) setEdit(false);
  };
  const noticeEl = apps.notice && (
    <div className="phone-notice" role="status" onClick={apps.clearNotice}>
      <StoreAppIcon id={apps.notice.app} size={38} />
      <span>
        <b>{apps.notice.title}</b>
        <small>{apps.notice.body}</small>
      </span>
    </div>
  );
  const badgeOf = (id) => (id === 'sms' ? unreadCount : id === 'chatsapp' ? chatsAppCount : 0);
  const dotOf = (id) => (id === 'chatsapp' && chatsAppHasNew) || (id === 'sixtagram' && sixtagramHasNew);

  // v161 — tam ekran uygulamalar (stadyumdaki futbol paneli · belediye paneli): kendi başlık ve ✕'leri var
  if (openApp === 'futbol' || openApp === 'belediye') {
    return (
      <Suspense fallback={<div className="phone-screen in-app"><div className="phone-app-loading">Yükleniyor…</div></div>}>
        {openApp === 'futbol' ? <FutbolFullScreen onClose={() => setOpenApp(null)} /> : <BelediyeScreen onClose={() => setOpenApp(null)} />}
      </Suspense>
    );
  }

  if (openApp) {
    return (
      <div className="phone-screen in-app">
        <StatusBar onBack={onClose} />
        <div className="phone-navbar">
          <button
            className="phone-nav-back"
            onClick={() => {
              if (storeDetail || bizSel) {
                setStoreDetail(null);
                setBizSel(null);
              } else setOpenApp(null);
            }}
            aria-label="Geri"
          >
            ‹
          </button>
          <span className="phone-nav-title">{openApp === 'isletme' && bizSel ? bizSel.name : APP_TITLES[openApp]}</span>
          <span className="phone-nav-right">
            {openApp === 'parara' && (
              <span className="phone-header-gold">
                <span className="phone-header-gold-coin" />
                {(player?.gold ?? 0).toLocaleString('tr-TR')}
              </span>
            )}
          </span>
        </div>
        <div className={`phone-app-body${openApp === 'rehber' || openApp === 'neon-gazete' || openApp === 'sixtagram' || openApp === 'cappstore' ? ' full' : ''}`}>
          {openApp === 'sms' && <MessagesScreen />}
          {openApp === 'ikinci-el' && <MarketplaceScreen />}
          {openApp === 'parara' && <BankScreen />}
          {openApp === 'cappstore' && <CappstoreScreen apps={apps} staff={staff} detail={storeDetail} onDetail={setStoreDetail} onOpenApp={handleOpenApp} AppIcon={StoreAppIcon} />}
          {openApp === 'fabrika' && (
            <Suspense fallback={<div className="phone-app-loading">Yükleniyor…</div>}>
              <FactoryScreen />
            </Suspense>
          )}
          {openApp === 'isletme' && (
            <Suspense fallback={<div className="phone-app-loading">Yükleniyor…</div>}>
              <BusinessesApp selected={bizSel?.id || null} onSelect={(id, name) => setBizSel({ id, name })} />
            </Suspense>
          )}
          {openApp === 'chatsapp' && <ChatsAppScreen />}
          {openApp === 'gazete' && <NewspaperScreen />}
          {openApp === 'sixtagram' && <SixtagramScreen />}
          {openApp === GOLD_STORE_APP_ID && !isAppBlocked(GOLD_STORE_APP_ID) && (
            <Suspense fallback={null}>
              <GoldStoreScreen />
            </Suspense>
          )}
          {openApp === 'rehber' && <GuideScreen />}
          {openApp === 'neon-gazete' && <GazeteScreen />}
          {openApp === 'fikir' && <IdeasScreen />}
          {openApp === 'basarilar' && <AchievementsScreen />}
        </div>
        {noticeEl}
      </div>
    );
  }

  return (
    <div className={`phone-screen home${page === 0 ? ' on-tv' : ''}${edit ? ' editing' : ''}`}>
      <StatusBar onBack={onClose} />
      <div className="phone-pager" ref={pagerRef} onScroll={onPagerScroll}>
        {/* Sol sayfa: v159 — Neon Şehir Gazetesi (sola kaydırınca kendiliğinden açılır; sayfaya ilk
            gelindiğinde yüklenir, sonra açık kalır → tekrar okuma yok) */}
        <section className="phone-page phone-page-gazete" aria-label="Neon Şehir Gazetesi">
          {gazeteSeen || page === 0 ? <GazeteScreen /> : <div className="phone-tv-idle">📰</div>}
        </section>

        {/* Ana sayfa */}
        <section className="phone-page phone-page-home" aria-label="Ana ekran">
          <div className="phone-widget">
            <div className="phone-widget-time">{time}</div>
            <div className="phone-widget-date">{date}</div>
            {/* v161: altına dokununca Zümrüt Mağazası açılır */}
            <button type="button" className="phone-widget-gold" onClick={() => handleOpenApp(GOLD_STORE_APP_ID)} disabled={isAppBlocked(GOLD_STORE_APP_ID)} aria-label="Zümrüt Mağazası'nı aç">
              <span className="phone-header-gold-coin" /> {(player?.gold ?? 0).toLocaleString('tr-TR')}
            </button>
          </div>
          {edit && (
            <div className="phone-edit-bar">
              <span>
                Sürükle: taşı · <b>−</b> ile sil
              </span>
              <button onClick={() => setEdit(false)}>Bitti</button>
            </div>
          )}
          <HomeGrid items={gridItems} edit={edit} setEdit={setEdit} onOpen={handleOpenApp} onReorder={reorder} onAskDelete={setAskDelete} />
          <div className="phone-home-spacer" onClick={() => edit && setEdit(false)} />
          <div className="phone-install-row">
            <InstallAppButton />
          </div>
        </section>

        {/* Sağ sayfa */}
        <section className="phone-page phone-page-extra" aria-label="Diğer uygulamalar">
          <div className="phone-apps-grid">
            {VISIBLE_EXTRA_APPS.map((app) => (
              <AppIcon key={app.id} app={app} badge={0} dot={false} onOpen={handleOpenApp} />
            ))}
          </div>
        </section>
      </div>

      <div className="phone-dots" role="tablist" aria-label="Sayfalar">
        {Array.from({ length: PAGES }, (_, i) => (
          <button key={i} role="tab" aria-selected={page === i} aria-label={i === 0 ? 'Gazete' : i === 1 ? 'Ana ekran' : 'Diğer'} className={`phone-dot${page === i ? ' on' : ''}${i === 0 ? ' tv' : ''}`} onClick={() => goPage(i)} />
        ))}
      </div>
      <div className="phone-dock">
        {DOCK.map((app) => (
          <AppIcon key={app.id} app={app} badge={badgeOf(app.id)} dot={dotOf(app.id)} onOpen={handleOpenApp} />
        ))}
      </div>
      {noticeEl}
      {askDelete && (
        <div className="phone-confirm-bg" onClick={() => setAskDelete(null)}>
          <div className="phone-confirm" role="dialog" aria-label="Uygulamayı sil" onClick={(e) => e.stopPropagation()}>
            <div className="phone-confirm-body">
              <StoreAppIcon id={askDelete} size={54} />
              <b>“{STORE_BY_ID[askDelete]?.name}” silinsin mi?</b>
              <span>Ana ekrandan kaldırılır. Cappstore’dan istediğin zaman tekrar indirebilirsin; verilerin yerinde kalır.</span>
            </div>
            <button className="danger" onClick={doDelete}>
              Uygulamayı Sil
            </button>
            <button onClick={() => setAskDelete(null)}>Vazgeç</button>
          </div>
        </div>
      )}
    </div>
  );
}
