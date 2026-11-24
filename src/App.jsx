import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BlocksProvider } from './contexts/BlocksContext';
import Hud from './components/Hud/Hud';
import CityMap from './components/CityMap/CityMap';
import BottomBar from './components/BottomBar/BottomBar';
import PhoneScreen from './components/Phone/PhoneScreen';
import RegionModal from './components/RegionModal/RegionModal';
import { SocialProvider, useSocial } from './contexts/SocialContext';
import { OPEN_DM_EVENT, hasCityPhoneHost, openInCityPhone } from './lib/chatsappNav';
import ReferralPrompt from './components/ReferralPrompt/ReferralPrompt';
import RaceBubble from './components/RaceTrackScreen/RaceBubble';
import { GangAlertsContext, useGangAlerts } from './components/Gangs/alerts';
import { useUnreadNotifications } from './hooks/useUnreadNotifications';
import TopNotificationBanner from './components/TopNotificationBanner/TopNotificationBanner';
import OnboardingPanel from './components/OnboardingPanel/OnboardingPanel';
import PoliticsHomeButton, { leftSlotBottom } from './components/Politics/PoliticsHomeButton'; // v136
import { usePlayerSelect } from './hooks/usePlayer';
const selectHud = (p) => `${p?.suspicion ?? 0}|${p?.reputation ?? 0}|${p?.gold ?? 0}`;
import { useMyActiveRaceRoom } from './hooks/useMyActiveRaceRoom';
import { useFirestoreResume } from './hooks/useFirestoreResume';
import { regions } from './data/regions';
import { BIZ_BY_REGION, BIZ_TYPES } from '../functions/businessCatalogData.js';
import { vendorVenueKey, VENDORS } from '../functions/vendorData.js';
import CityPegman from './components/City/CityPegman'; // v147.3 — sürükle-bırak ile şehre gir
import { quietRestorePlayPurchases, playRestoreSupported } from './lib/playBilling';
import { exitApp, installBackHandler, rearmBack, useBackClose } from './lib/backStack';
import { isTaRacing } from './lib/raceGuard';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import ConfirmModal from './components/ConfirmModal/ConfirmModal';
import LiveStreamsButton from './components/Stream/LiveStreamsButton';
import UpdateAppBanner from './components/UpdateAppBanner/UpdateAppBanner';
import { retryImport, ChunkBoundary } from './lib/lazyRetry';
import { useBootStageAfter, whenBootStage } from './lib/bootStage'; // v167 — açılış sırası
import './styles/theme.css';
import './styles/cues.css';
import './App.css';


// v67 — "ilk açılışta / sekme geçişlerinde kasma": tam ekran sayfalar ve
// mekân dünyaları ana paketten ayrıldı (ilk yükleme küçüldü). Uygulama
// açıldıktan birkaç saniye sonra boşta arka planda önceden indirilir, böylece
// sekmeye ilk dokunuşta beklenmez.
const LAZY_LOADERS = [];
function lazyScreen(loader) {
  LAZY_LOADERS.push(loader);
  const C = lazy(retryImport(loader)); // v102: güncelleme sonrası eski parça → yeniden dene / yenile
  const Wrapped = (props) => (
    <ChunkBoundary onClose={props.onClose || props.onExit}>
      <Suspense fallback={<div className="app-lazy-fallback" aria-busy="true"><span /></div>}>
        <C {...props} />
      </Suspense>
    </ChunkBoundary>
  );
  return Wrapped;
}
const StreamViewer = lazyScreen(() => import('./components/Stream/StreamViewer'));
const MekanlarScreen = lazyScreen(() => import('./components/MekanlarScreen/MekanlarScreen'));
const RaceFullScreen = lazyScreen(() => import('./components/RaceTrackScreen/RaceFullScreen'));
const OnNumaraFullScreen = lazyScreen(() => import('./components/OnNumaraScreen/OnNumaraFullScreen'));
const ProfileFullScreen = lazyScreen(() => import('./components/ProfileFullScreen/ProfileFullScreen'));
const HouseHub = lazyScreen(() => import('./components/HouseScreen/HouseHub'));
// v92 Faz 8 — mekânlar 3D (giriş yapmamış oyuncu eski 2D mekânı görür)
const VenueHouseScreen = lazyScreen(() => import('./components/Venue3D/VenueHouseScreen'));
const MotorGalleryScreen = lazyScreen(() => import('./components/MotorGallery/MotorGalleryScreen')); // v177
// v173 — AÇILIŞTAN 2-3 SN SONRAKİ "YÜKLEME YUVARLAĞI": bu küçük halka da tam ekran sayfalar gibi
// yükleniyordu; dosyası inerken bütün ekranı karartan dönen yuvarlak çıkıyordu (anlık donma hissi).
// Artık sessiz yüklenir: inene kadar hiçbir şey görünmez, sonra halka (varsa) belirir.
const loadNetRing = retryImport(() => import('./components/Venue/NetCreditRing'));
const NetCreditRingLazy = lazy(() => loadNetRing().catch(() => ({ default: () => null }))); // inmezse sessizce yok
const NetCreditRing = (props) => (
  <Suspense fallback={null}>
    <NetCreditRingLazy {...props} />
  </Suspense>
);
const FutbolFullScreen = lazyScreen(() => import('./components/FutbolScreen/FutbolFullScreen'));
const GangsFullScreen = lazyScreen(() => import('./components/Gangs/GangsFullScreen'));
const GangPanel = lazyScreen(() => import('./components/Gangs/GangPanel')); // v160.3
const GangHqScreen = lazyScreen(() => import('./components/Gangs/GangHq')); // v159.1
const ParkWorldScreen = lazyScreen(() => import('./components/ParkWorldScreen/ParkWorldScreen'));
const BankWorldScreen = lazyScreen(() => import('./components/BankWorldScreen/BankWorldScreen'));
const KarakolWorldScreen = lazyScreen(() => import('./components/KarakolWorldScreen/KarakolWorldScreen'));
const MosqueWorldScreen = lazyScreen(() => import('./components/MosqueWorldScreen/MosqueWorldScreen'));
const CasinoWorldScreen = lazyScreen(() => import('./components/CasinoWorldScreen/CasinoWorldScreen'));
const CarDealershipWorldScreen = lazyScreen(() => import('./components/CarDealershipWorldScreen/CarDealershipWorldScreen'));
const WeaponShopWorldScreen = lazyScreen(() => import('./components/WeaponShopWorldScreen/WeaponShopWorldScreen'));
const TuningGarageWorldScreen = lazyScreen(() => import('./components/TuningGarageWorldScreen/TuningGarageWorldScreen'));
// v134 — misafir (giriş yapmamış) oyuncu oyunun mekânlarını yeni 3D hâliyle gezer
const GuestVenue = lazyScreen(() => import('./components/Guest/GuestVenue'));
// v167 HIZ — şehir (three.js + şehir motoru, oyunun en büyük parçası) oyun kodu açılır açılmaz
// indirilmeye başlar. Eskiden ancak React ilk kez çizip şehri açınca isteniyordu: önce ana paket,
// sonra oturum, sonra şehir → sıralı bekleme. Artık ikisi aynı anda iner (ilk girişte saniyeler kazanılır).
const loadCityScreen = () => import('./components/City/CityScreen');
loadCityScreen().catch(() => {}); // hata olursa ekran açılırken yeniden denenir (lazyRetry)
const CityScreen = lazyScreen(loadCityScreen); // v147 — gezilebilir şehir
// v171 AKICILIK — App her yeniden çizildiğinde (arkadaş / sohbet / bildirim verisi geldiğinde, altın
// değiştiğinde…) şehir ekranı da baştan çiziliyordu: App, şehre her seferinde YENİ işlevler (onClose,
// onEnterRegion…) verdiği için. Artık işlevler sabit "aracılardan" geçer (her zaman App'in en güncel
// işlevini çağırır, davranış aynı) ve şehir sadece kendi verisi (rozet, örtülme, yarış…) değişince çizilir.
const CityScreenMemo = memo(CityScreen);
function StableCityScreen(props) {
  const latest = useRef(props);
  latest.current = props;
  const proxies = useRef({});
  const next = {};
  for (const k of Object.keys(props)) {
    if (typeof props[k] === 'function') {
      if (!proxies.current[k]) proxies.current[k] = (...a) => latest.current[k]?.(...a);
      next[k] = proxies.current[k];
    } else next[k] = props[k];
  }
  return <CityScreenMemo {...next} />;
}

// v166 HIZ: ekran dosyaları sadece İNDİRİLİR (modulepreload — çalıştırılmaz). Eskiden hepsi
// import() ile çalıştırılıyordu: açılıştan sonra telefonda saniyelerce kasma + kalıcı bellek.
// Liste derlemede çıkarılır (vite.config.js › prefetchList). Liste yoksa (geliştirme) hiçbir şey yapılmaz.
function prefetchScreens() {
  void LAZY_LOADERS; // (eski yol: hepsini çalıştırmak — kullanılmıyor)
  const idle = (f) => (window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 400));
  fetch('/prefetch-list.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((list) => {
      if (!Array.isArray(list)) return;
      const have = new Set([...document.querySelectorAll('link[rel="modulepreload"], link[rel="prefetch"], script[src]')].map((l) => l.getAttribute('href') || l.getAttribute('src')));
      const urls = list.filter((u) => typeof u === 'string' && u.startsWith('/assets/') && !have.has(u));
      let i = 0;
      const next = () => {
        // aynı anda en fazla 3 dosya (oyunun kendi istekleri sıkışmasın)
        for (let k = 0; k < 3 && i < urls.length; k++) {
          const u = urls[i++];
          const l = document.createElement('link');
          l.rel = u.endsWith('.js') ? 'modulepreload' : 'prefetch';
          if (u.endsWith('.css')) l.as = 'style';
          l.crossOrigin = '';
          l.href = u;
          document.head.appendChild(l);
        }
        if (i < urls.length) idle(next);
      };
      idle(next);
    })
    .catch(() => {});
}

const RACE_TRACK_REGION = regions.find((r) => r.screen === 'yaris-pisti');


// Harita, HUD ve telefon giriş yapmadan da görülebilir/gezilebilir — giriş
// çağrısı artık haritayı bloklayan ayrı bir katman yerine, her ekranda görünen
// HUD'un içinde (sağ üstteki "Giriş Yap" butonu) yaşıyor. Bir aksiyon
// (fabrikada çalışma vb.) denendiğinde ayrıca RegionModal içinde de
// SignInPrompt gösterilir.
// v77 performans köprüleri: dinleyici yoğun hook'lar burada çalışır, sonuç
// değişmedikçe üst bileşeni yeniden çizdirmez (içerik karşılaştırması).
const EMPTY_GANG_ALERTS = {
  worldId: null,
  uid: null,
  gang: { sohbet: false, savas: false },
  intel: { sohbet: false, savas: false, operasyon: false },
  chans: { gang: { genel: false, yonetim: false, tum: false }, intel: { genel: false, yonetim: false } },
  reminders: { joinWar: false, takeMoney: false, report: false, leak: false },
  any: false,
};
const EMPTY_UNREAD = { smsUnreadCount: 0, chatsAppHasNew: false, sixtagramHasNew: false, sixtagramUnreadNotifCount: 0, totalBadge: 0 };
function useChangeEmitter(value, onChange) {
  const last = useRef('');
  useEffect(() => {
    const key = JSON.stringify(value);
    if (key === last.current) return;
    last.current = key;
    onChange(value);
  });
}
function GangAlertsBridge({ uid, onChange }) {
  useChangeEmitter(useGangAlerts(uid), onChange);
  return null;
}
function UnreadBridge({ onChange }) {
  useChangeEmitter(useUnreadNotifications(), onChange);
  return null;
}

// v108 — 3D mekân hazırlanamazsa (eski 2D'si olmayan Belediye): kapat + bildir
function VenueFallbackNotice({ onDone }) {
  const ref = useRef(onDone);
  ref.current = onDone;
  useEffect(() => {
    ref.current?.();
  }, []);
  return null;
}

function GameShell() {
  const { user } = useAuth();
  // v91.1 — Google Play: ödemesi alınmış ama zümrütü yüklenememiş (ör. internet
  // kesildi, uygulama kapandı) satın almalar uygulama açılınca ve öne
  // gelince sessizce tamamlanır. Zümrüt yüklenince oyuncuya SMS de gider.
  useEffect(() => {
    // v155: WebView'da sadece köprüsünde faturalandırma olan sürümde (v15+); v14'te hiçbir şey yapmaz.
    // Kapatma anahtarı (NATIVE_PLAY_BILLING_ON) kapalıyken de ÇALIŞIR (bekleyen ödeme iade olmasın).
    if (!playRestoreSupported() || !user) return undefined;
    // v167: açılış bittikten sonra (aşama 3) — ilk saniyelerde ağı / işlemciyi meşgul etmesin
    const offBoot = whenBootStage(3, () => quietRestorePlayPurchases());
    const onVis = () => document.visibilityState === 'visible' && quietRestorePlayPurchases();
    // native taraf: arka planda tamamlanan (yavaş kart) ya da akış dışı gelen satın almalar
    const onNative = () => quietRestorePlayPurchases();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('ns-play-purchases-updated', onNative);
    return () => {
      offBoot();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('ns-play-purchases-updated', onNative);
    };
  }, [user]);
  // Çeteler bildirim işaretleri (alt çubuk + çete içi sekmeler)
  // Telefon rozeti + haritadaki ChatsApp kısayolunun "yeni mesaj" noktası (tek dinleyici)
  // v77 performans: bu iki hook'un ~25 canlı dinleyicisi (sohbetler, savaşlar, SMS…)
  // artık küçük "köprü" bileşenlerinde çalışır; kök bileşen (harita, HUD, açık mekân)
  // sadece SONUÇ gerçekten değişince yeniden çizilir.
  const [gangAlerts, setGangAlerts] = useState(EMPTY_GANG_ALERTS);
  const [unread, setUnread] = useState(EMPTY_UNREAD);
  const [activeRegion, setActiveRegion] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneInitialApp, setPhoneInitialApp] = useState(null);
  // v60: arkadaş sohbetleri + istekler (ChatsApp rozeti) ve Oyuncu Kartı → "💬 Mesaj"
  const social = useSocial();
  const chatsAppCount = social.unreadTotal + social.requestCount;
  useEffect(() => {
    const on = () => {
      // v170: şehir görünürken sohbeti şehrin telefonu açar (bkz. chatsappNav › setCityPhoneHost)
      if (hasCityPhoneHost()) return;
      setPhoneInitialApp('chatsapp');
      setPhoneOpen(true);
    };
    window.addEventListener(OPEN_DM_EVENT, on);
    return () => window.removeEventListener(OPEN_DM_EVENT, on);
  }, []);
  const [heistTarget, setHeistTarget] = useState(undefined); // undefined=kapalı, null=açık/hedefsiz (Mekanlar ekranı)
  // mekanlarTab — Mekanlar ekranı açıkken hangi sekme aktif (yeni istek:
  // "Soygun sekmesinin adını Mekanlar yapacağız, 3 ana sekmeye ayrılacak:
  // Soygun - Şüphe - Ziyaret").
  const [mekanlarTab, setMekanlarTab] = useState('soygun');
  // visitReturnPending — Ziyaret sekmesinden bir mekana girildiyse true;
  // o mekandan çıkınca ana haritaya değil, Mekanlar ekranına (Ziyaret
  // sekmesinde) geri dönülür (yeni istek: "oradan girdiysek mekandan
  // çıktığımızda yine o ekran açık şekilde bizi bekleyecek").
  const [visitReturnPending, setVisitReturnPending] = useState(false);
  const [activeRaceRoomId, setActiveRaceRoomId] = useState(null);
  const [raceExpanded, setRaceExpanded] = useState(false);
  // raceLobbyMode — kullanıcı revizesi: "şampiyonadan/antrenmandan/
  // bahisli yarıştan çıkınca, yarışın genel ana ekranına değil, hangi
  // lobiden girdiysek ORAYA dönelim". RaceTrackScreen hangi kartı
  // (championship/bet/training) seçtiğimizi buraya bildiriyor, oda
  // kapanınca (bkz. RaceFullScreen onExit) aynı lobiyle tekrar açıyoruz.
  const [raceLobbyMode, setRaceLobbyMode] = useState(null);
  const [activeTableId, setActiveTableId] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // v66: Ev ekranı — null kapalı, { houseId } açık (houseId null → liste)
  const [houseView, setHouseView] = useState(null);
  // v77: İşletme listesi — null kapalı, { type } açık (spor, cafe, bar, internet, silahci, galeri, modifiye)
  const [businessView, setBusinessView] = useState(null);
  const [gangsOpen, setGangsOpen] = useState(false);
  const [gangsHq, setGangsHq] = useState(null); // v157.4: şehirden karargaha giriş
  // v159.1 — karargah: şehirdeki (içinden geçilen) karargah içleri kaldırıldı. Karargah kapısında
  // "İçeri gir" / Çeteler › Aç → gerçek karargah ekranı (GangHq) şehrin üstünde açılır, şehir bekler.
  const [hqView, setHqView] = useState(null); // null | { gangId }
  const [futbolOpen, setFutbolOpen] = useState(false);
  // comingSoon — "Çok yakında" mesajı (mekan adı), 2 sn sonra kendiliğinden kapanır.
  const [comingSoon, setComingSoon] = useState(null);
  const [watchStreamId, setWatchStreamId] = useState(null);
  // v136 — sol alt sütun: hangi butonlar görünüyor (boşluklar alta kayar)
  const [obVisible, setObVisible] = useState(false);
  const [liveVisible, setLiveVisible] = useState(false);
  const comingSoonTimer = useRef(null);
  const showComingSoon = (name) => {
    setComingSoon(name);
    clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = setTimeout(() => setComingSoon(null), 2200);
  };
  useEffect(() => () => clearTimeout(comingSoonTimer.current), []);
  const [parkOpen, setParkOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [karakolOpen, setKarakolOpen] = useState(false);
  const [teskilatOpen, setTeskilatOpen] = useState(false); // v146.4 — Ziyaret › Polis Teşkilatı
  const [mosqueOpen, setMosqueOpen] = useState(false);
  const [casinoOpen, setCasinoOpen] = useState(false);
  const [dealershipOpen, setDealershipOpen] = useState(false);
  const [motorShopOpen, setMotorShopOpen] = useState(false); // v177 oyunun motor galerisi
  const [weaponShopOpen, setWeaponShopOpen] = useState(false);
  const [tuningGarageOpen, setTuningGarageOpen] = useState(false);
  const [belediyeOpen, setBelediyeOpen] = useState(false); // v108 — başkanlık makam odası
  const [vendorRegion, setVendorRegion] = useState(null); // v145 — seyyar satıcı 3D mekânı (regions.js kaydı)
  // v147 — gezilebilir şehir: { spawn, k }
  // v167: oyun doğrudan şehirle açılır (eskiden ilk karede 2D harita + büyük harita resmi kurulup
  // hemen ardından kaldırılıyordu — boşa iş)
  const [city, setCity] = useState(() => ({ spawn: { region: 'ev', out: true }, k: Date.now() }));
  const [cityCovered, setCityCovered] = useState(false); // v157.9: karargah düzenlenirken şehir arkada bekler
  const [cityReturn, setCityReturn] = useState(null); // v147.1 — şehirden açılan liste/mekân kapanınca şehre (o kapıya) dön
  // v77 performans: kök bileşen sadece HUD alanları değişince yeniden çizilir
  const hudKey = usePlayerSelect(selectHud);
  // v167 açılış sırası (bkz. lib/bootStage.js) — v171: aşama 2'nin parçaları tek karede değil, sırayla açılır (bkz. useBootStageAfter)
  const bootUnread = useBootStageAfter(2, 300);
  const bootGang = useBootStageAfter(2, 650);
  const bootBanner = useBootStageAfter(2, 1000);
  const bootRing = useBootStageAfter(2, 1300);
  const [hudSusp, hudRep, hudGold] = hudKey.split('|').map(Number);

  // v68 — Android geri tuşu: açık ekran/mekân varsa onu kapatır (mekândan →
  // ana sayfa); ana sayfadayken "Çıkmak istiyor musun?" sorulur.
  const [exitAsk, setExitAsk] = useState(false);
  const [exitHint, setExitHint] = useState(false);
  useEffect(() => {
    let t = 0;
    installBackHandler(
      () => setExitAsk(true),
      () => {
        setExitHint(true);
        clearTimeout(t);
        t = setTimeout(() => setExitHint(false), 2500);
      }
    );
    return () => clearTimeout(t);
  }, []);
  const venueClose = (fn) => () => closeVenueMaybeReturnToVisit(fn);
  useBackClose(Boolean(activeRegion), () => setActiveRegion(null));
  useBackClose(profileOpen, () => setProfileOpen(false));
  useBackClose(futbolOpen, () => setFutbolOpen(false));
  useBackClose(gangsOpen, () => setGangsOpen(false));
  useBackClose(heistTarget !== undefined, () => setHeistTarget(undefined));
  useBackClose(parkOpen, venueClose(setParkOpen));
  useBackClose(bankOpen, venueClose(setBankOpen));
  useBackClose(karakolOpen, venueClose(setKarakolOpen));
  useBackClose(teskilatOpen, venueClose(setTeskilatOpen));
  useBackClose(mosqueOpen, venueClose(setMosqueOpen));
  useBackClose(casinoOpen, venueClose(setCasinoOpen));
  useBackClose(dealershipOpen, venueClose(setDealershipOpen));
  useBackClose(motorShopOpen, venueClose(setMotorShopOpen));
  useBackClose(weaponShopOpen, venueClose(setWeaponShopOpen));
  useBackClose(tuningGarageOpen, venueClose(setTuningGarageOpen));
  useBackClose(belediyeOpen, venueClose(setBelediyeOpen));
  useBackClose(Boolean(vendorRegion), venueClose(() => setVendorRegion(null)));
  // v159: yarış sürerken geri tuşu / kenardan kaydırma yarışı kapatmaz (bkz. lib/raceGuard.js)
  useBackClose(raceExpanded, () => {
    if (!isTaRacing()) setRaceExpanded(false);
  });
  useBackClose(Boolean(activeTableId), () => setActiveTableId(null));

  // Uygulama arka plana alınıp geri geldiğinde (özellikle iOS'ta) Firestore
  // dinleyicilerinin durağanlaşmasını önlemek için — bkz. hook içindeki not.
  useFirestoreResume();

  // v67 — açılıştaki kasmayı azaltmak için: eski tek seferlik göç
  // çağrıları (hepsi sunucuda bayraklı/idempotent ve gece 00:00'da zaten
  // otomatik çalışıyor) artık açılışın ilk saniyelerinde ağı meşgul etmiyor —
  // 20 sn sonra, cihaz başına GÜNDE en fazla bir kez, sırayla tetikleniyor.
  // Ekranlar da 3 sn sonra arka planda önceden indiriliyor.
  useEffect(() => {
    if (!user) return undefined;
    // v167: ekranların önceden indirilmesi açılış bittikten sonra (aşama 3)
    const offPre = whenBootStage(3, prefetchScreens);
    // v79 maliyet: tek seferlik göç çağrıları istemciden kaldırıldı — hepsi
    // sunucuda bayraklı ve her gece dailyReset içinde zaten çalışıyor. Eskiden
    // her cihaz günde bir kez 6 bulut fonksiyonu çağırıyordu (biri bayraksızdı
    // ve tüm kullanıcıları okuyordu).
    return () => {
      offPre();
    };
  }, [user]);

  // Aktif bir yarışım varsa (kurdum/katıldım/devam ediyor), harita üzerinde
  // gezinirken bile takip etmeye devam et — ama rakip beklenirken tüm
  // ekranı KAPLAMASIN, sadece küçük bir yuvarlak göstersin (bkz.
  // RaceBubble). Yarış gerçekten başladığında (status='racing') otomatik
  // olarak tam ekrana geçer.
  const { room: myActiveRoom } = useMyActiveRaceRoom();
  const effectiveRaceRoomId = activeRaceRoomId || myActiveRoom?.id || null;

  useEffect(() => {
    if (myActiveRoom?.status === 'racing') {
      setRaceExpanded(true);
    }
  }, [myActiveRoom?.status]);

  // v157 — haritadaki mekânlar şehrin İÇİNDE: haritadan tıklayınca şehirdeki binanın içine girilir.
  // (Şehrin içindeki "Barlar / Evler…" düğmesinden gelince fromCity: listeler / ekranlar açılır.)
  const CITY_VENUE_REGIONS = new Set(['camii', 'karakol', 'banka', 'spor_salonu', 'belediye', 'silah_magazasi', 'araba_galerisi', 'fabrika', 'internet_kafe', 'modifiye_garaji', 'casino', 'bar', 'cafe', 'ev', 'liman_depo']);
  const handleRegionClick = (regionId, regionMeta, { fromCity = false } = {}) => {
    if (!fromCity && CITY_VENUE_REGIONS.has(regionMeta?.id || regionId)) {
      openCity(regionMeta?.id || regionId);
      return;
    }
    // v66: "Ev" → Evler ekranı (ev satın al, evlerim, girebileceğim evler).
    // Profil alttaki 5. sekmede (👤).
    if (regionMeta?.screen === 'ev') {
      setHouseView({ houseId: null, mode: 'ev' }); // v157.4: Ev'de ofis yok (ofisler kendi binasında)
      return;
    }
    // v149 — Stadyum artık park gibi haritaya gömülü: futbol paneli açılmaz, şehirde
    // stadyumun girişine ışınlanılır. Futbol paneli stadyumun içindeki "⚽ Futbol" düğmesinde.
    if (regionMeta?.screen === 'futbol') {
      openCity('stadyum');
      return;
    }
    // v77: işletme türleri (Spor Salonu, Cafe, Bar, İnternet Kafe, Silah
    // Mağazası, Araba Galerisi, Modifiye Garajı) → o türdeki aktif dükkânlar +
    // "[tür] aç". Oyunun kendi dükkânı (silah/galeri/modifiye) listenin en üstünde.
    // v196: oyuncu işletmeleri kalktı — mekân türüne dokununca şehirdeki oyun mekânının kapısına gidilir
    const bizType = BIZ_BY_REGION[regionMeta?.id];
    if (bizType) {
      openCity(regionMeta.id);
      return;
    }
    // Henüz yapılmamış mekanlar (Belediye): kısa bir "Çok yakında" mesajı.
    if (regionMeta?.screen === 'yakinda') {
      showComingSoon(regionMeta.name);
      return;
    }
    // v108 — Belediye Binası: başkanlık makam odası (3D, şimdilik sadece gezilir)
    if (regionMeta?.screen === 'belediye') {
      setBelediyeOpen(true); // v134: misafir de girip gezer
      return;
    }
    if (regionMeta?.screen === 'park') {
      // v147 — park artık büyük şehrin içinde: oraya ışınlan
      // v149: misafir de (şehri salt gezinti modunda) aynı yere ışınlanır
      openCity('park');
      return;
    }
    // Banka artık Park gibi girilebilir bir mekan (bkz. madde 2-4) —
    // RegionModal'daki eski "hızlı panel" yerine tam ekran iç mekana
    // giriliyor.
    if (regionMeta?.screen === 'banka') {
      setBankOpen(true);
      return;
    }
    // Karakol da artık Banka gibi girilebilir bir mekan (bkz. madde 5) —
    // eski "hızlı panel" (PoliceStationScreen tek ekran) yerine tam ekran
    // iç mekana giriliyor; girişteki memur (rüşvet) ve içerideki komiser
    // (başvuru) artık ayrı NPC etkileşimleri.
    if (regionMeta?.screen === 'rüşvet') {
      setKarakolOpen(true);
      return;
    }
    // Camii de artık girilebilir bir mekan (bkz. madde 6) — eski "hızlı
    // panel" (MosqueScreen tek ekran) yerine tam ekran iç mekana giriliyor;
    // imam ve dilenci artık ayrı NPC etkileşimleri.
    if (regionMeta?.screen === 'ibadet') {
      setMosqueOpen(true);
      return;
    }
    // Gazino da artık girilebilir bir mekan (bkz. madde 7-9) — eski "hızlı
    // panel" (CasinoScreen) yerine tam ekran iç mekana giriliyor. Telefon
    // uygulaması (madde 8) hâlâ CasinoScreen'i olduğu gibi kullanıyor.
    if (regionMeta?.screen === 'casino') {
      setCasinoOpen(true);
      return;
    }
    // Araba Galerisi, Silah Mağazası ve Modifiye Garajı da artık Banka/Gazino
    // gibi girilebilir mekanlar (bkz. yeni 3 mekan talebi) — RegionModal'daki
    // eski düz panel yerine tam ekran iç mekana giriliyor.
    if (regionMeta?.screen === 'araba-galerisi') {
      setDealershipOpen(true);
      return;
    }
    if (regionMeta?.screen === 'silah-magazasi') {
      setWeaponShopOpen(true);
      return;
    }
    if (regionMeta?.screen === 'modifiye-garaji') {
      setTuningGarageOpen(true);
      return;
    }
    // v145 — seyyar satıcılar da 3D mekân (açık hava). Hazırlanamazsa eski panel açılır.
    if (regionMeta?.screen === 'seyyar-satici' && vendorVenueKey(regionMeta.id)) {
      // v147 — seyyar satıcılar şehirde sokakta duruyor: yanına ışınlan
      openCity(vendorVenueKey(regionMeta.id)); // v149: misafir de
      return;
    }
    setActiveRegion(regionMeta);
  };

  // v147 — şehre giriş: üstte açık ne varsa kapanır (mekân, liste, ev…), şehir açılır
  const closeAllForCity = () => {
    [setParkOpen, setBankOpen, setKarakolOpen, setMosqueOpen, setCasinoOpen, setDealershipOpen, setWeaponShopOpen, setTuningGarageOpen, setBelediyeOpen, setTeskilatOpen, setFutbolOpen, setGangsOpen, setProfileOpen, setPhoneOpen].forEach((f) => f(false));
    setVendorRegion(null);
    setHouseView(null);
    setBusinessView(null);
    setActiveRegion(null);
    setHeistTarget(undefined);
    setVisitReturnPending(false);
  };
  function openCity(spawn) {
    closeAllForCity();
    setCityReturn(null);
    setCity({ spawn: spawn || 'ev', k: Date.now() });
  }
  const openCityRef = useRef(openCity);
  openCityRef.current = openCity;
  const cityOpenRef = useRef(false);
  cityOpenRef.current = Boolean(city);
  // v160.3: ev / işletme / karargah içindeki hatırlatmalarda "Git" — mekân kapanır, şehirde o yere
  useEffect(() => {
    const on = (e) => {
      const t = e?.detail?.target;
      if (!t) return;
      setHouseView(null);
      setBusinessView(null);
      setHqView(null);
      setCityCovered(false);
      if (cityOpenRef.current) window.dispatchEvent(new CustomEvent('neon-city-spawn', { detail: { target: t, visit: Boolean(e.detail.visit) } }));
      else openCityRef.current(e.detail.visit ? 'ev' : t);
    };
    window.addEventListener('neon-venue-go', on);
    return () => window.removeEventListener('neon-venue-go', on);
  }, []);
  // mekânın içinde giriş kapısındaki "Şehre çık" (HouseScreen) → o mekânın kapısında doğ
  useEffect(() => {
    const on = (e) => {
      const r = e?.detail?.region;
      // v159.1: karargahın kapısındaki "Şehre çık" — şehir arkada bekliyorsa (karargaha şehirden
      // girildiyse) karargah ekranının kapanması yeter; yoksa şehir karargahın kapısının önünde açılır
      if (r === 'hq') {
        if (cityOpenRef.current) return;
        const { gangId, worldId } = e.detail || {};
        const fallback = () => openCityRef.current({ region: 'ev', out: true });
        if (!gangId || !worldId) return fallback();
        getDoc(doc(db, `gangWorlds/${worldId}/gangs`, gangId))
          .then((g) => {
            const slot = g.exists() ? g.data().hqSlot : null;
            if (Number.isInteger(slot) && slot >= 0 && slot < 6) openCityRef.current(`hq${slot}`);
            else fallback();
          })
          .catch(fallback);
        return;
      }
      if (typeof r === 'string' && r) openCityRef.current(r);
    };
    window.addEventListener('neon-city-exit', on);
    return () => window.removeEventListener('neon-city-exit', on);
  }, []);

  const openHeistScreen = (target) => {
    setActiveRegion(null);
    // Soygun köşe butonlarından (Banka/Gazino/Galeri/Garaj içi) veya alt
    // bardan açılınca her zaman Soygun sekmesinde açılır.
    setMekanlarTab('soygun');
    setHeistTarget(target ?? null);
  };

  // openVenueForVisit / closeVenueMaybeReturnToVisit — Ziyaret sekmesinden
  // bir mekana giriş/çıkış akışı. Girerken Mekanlar ekranı kapanır (mekan
  // üstte açılır), çıkarken (visitReturnPending true ise) Mekanlar ekranı
  // Ziyaret sekmesinde tekrar açılır — RaceFullScreen'in "kendi lobisine
  // dön" deseniyle AYNI mantık (bkz. aşağıdaki RACE_TRACK_REGION notu).
  const openVenueForVisit = (openFn) => {
    setHeistTarget(undefined);
    setVisitReturnPending(true);
    openFn(true);
  };

  const closeVenueMaybeReturnToVisit = (closeFn) => {
    closeFn(false);
    if (visitReturnPending) {
      setVisitReturnPending(false);
      setMekanlarTab('soygun');
      setHeistTarget(null);
    }
  };

  const VISIT_OPEN_FNS = {
    park: setParkOpen,
    banka: setBankOpen,
    karakol: setKarakolOpen,
    mosque: setMosqueOpen,
    casino: setCasinoOpen,
    dealership: setDealershipOpen,
    weaponShop: setWeaponShopOpen,
    tuningGarage: setTuningGarageOpen,
    belediye: setBelediyeOpen, // v127
    teskilat: setTeskilatOpen, // v146.4
  };

  // v146 — karargah davetinden (ekranı sağlayan yoksa) karargaha geçiş
  useEffect(() => {
    const on = (e) => {
      const id = e?.detail?.houseId;
      if (typeof id === 'string' && id) {
        setCity(null); // v157.4: şehirdeki Çeteler panelinden karargaha giriş
        setHouseView({ houseId: id });
      }
    };
    window.addEventListener('neon-open-house', on);
    return () => window.removeEventListener('neon-open-house', on);
  }, []);

  const handleVisitVenue = (openKey) => {
    // v146 — Ziyaret › seyyar satıcı mekânları (vendor:{bölge kimliği})
    if (String(openKey).startsWith('vendor:')) {
      const r = regions.find((x) => x.id === String(openKey).slice(7));
      if (r) openVenueForVisit((on) => setVendorRegion(on ? r : null));
      return;
    }
    const fn = VISIT_OPEN_FNS[openKey];
    if (fn) openVenueForVisit(fn);
  };

  // v81 — yayındayken koltuktan "Oyun oyna → Yarış Pisti": yarış pisti lobisi
  // evin (yayının) üstünde açılır; yayın arkada sürer, yarış izleyicilere gider.
  useEffect(() => {
    const on = () => setActiveRegion(RACE_TRACK_REGION);
    window.addEventListener('ns:stream-race', on);
    // v82: yayındayken 10 Numara masası (ev içinden seçilir)
    const onTable = (e) => e?.detail && setActiveTableId(e.detail);
    window.addEventListener('ns:open-table', onTable);
    return () => {
      window.removeEventListener('ns:stream-race', on);
      window.removeEventListener('ns:open-table', onTable);
    };
  }, []);

  // v121: expand — şampiyona yarışı hemen başladığı için ekran doğrudan açılır.
  // (Eskiden "racing" durumu bu çağrıdan ÖNCE gelirse ekran açıldıktan hemen sonra
  // burada kapanıyordu → "katıldın" yazıyor ama yarış açılmıyordu.)
  const openRace = (roomId, { expand = false } = {}) => {
    setActiveRegion(null);
    setActiveRaceRoomId(roomId);
    setRaceExpanded(Boolean(expand));
  };

  const openTable = (tableId) => {
    setActiveRegion(null);
    setActiveTableId(tableId);
  };

  // v77 performans: harita için sabit tıklama işleyicisi (memo bozulmasın) ve
  // üstünde tam ekran bir şey açıkken harita efektlerini durdurma bayrağı
  const regionClickRef = useRef(handleRegionClick);
  regionClickRef.current = handleRegionClick;
  const onRegionClickStable = useCallback((...a) => regionClickRef.current(...a), []);
  // v147.1 — şehirden açılan liste/mekân/soygun ekranı kapanınca (✕) ana sayfa yerine şehre,
  // girilen kapının önüne dönülür
  const somethingOpen = Boolean(
    watchStreamId || hqView || phoneOpen || profileOpen || houseView || businessView || futbolOpen || gangsOpen || parkOpen || bankOpen || karakolOpen || mosqueOpen || casinoOpen || dealershipOpen || motorShopOpen || weaponShopOpen || tuningGarageOpen || belediyeOpen || teskilatOpen || vendorRegion || heistTarget !== undefined || activeRegion || activeTableId || (effectiveRaceRoomId && raceExpanded)
  );
  // v157.4: ana sayfa yok — oyun şehirde açılır (evin önünde); hiçbir mekân / ekran açık değilse
  // oyuncu her zaman şehre (girdiği kapının önüne, yoksa evin önüne) döner → asla boşta kalmaz
  // v157.9: şehrin üstünde açılan ekranlar (ev, işletme, karargah düzenleme) kapanınca şehir devam eder
  useEffect(() => {
    if (cityCovered && (!somethingOpen || !city)) setCityCovered(false);
  }, [cityCovered, somethingOpen, city]);
  useEffect(() => {
    if (city || somethingOpen) return;
    openCityRef.current(cityReturn || 'ev'); // v196: oyun oyuncunun evinin içinde açılır
  }, [cityReturn, city, somethingOpen]);
  // v167 — şehir açıkken ana sayfa arayüzü (HUD, alt çubuk, telefon / ChatsApp / Görevler / Canlı / Seçim
  // düğmeleri) şehrin ALTINDA görünmeden çalışıyordu: şehrin kendi kopyalarıyla birlikte aynı dinleyiciler
  // iki kez açılıyordu (ör. Görevler ~12 dinleyici). Artık ancak şehir ilk kez kapanınca / örtülünce
  // kurulur; sonra eskisi gibi kurulu kalır (gidip gelirken dinleyiciler kapanıp açılmasın — okuma maliyeti).
  const [homeUiOn, setHomeUiOn] = useState(false);
  useEffect(() => {
    if (!city || cityCovered) setHomeUiOn(true);
  }, [city, cityCovered]);
  const homeUi = homeUiOn || !city || cityCovered;
  const mapCovered = Boolean(
    watchStreamId || hqView || phoneOpen || profileOpen || houseView || businessView || futbolOpen || gangsOpen || parkOpen || bankOpen || karakolOpen || mosqueOpen || casinoOpen || dealershipOpen || motorShopOpen || weaponShopOpen || tuningGarageOpen || belediyeOpen || teskilatOpen || Boolean(vendorRegion) || Boolean(city) || heistTarget !== undefined || (effectiveRaceRoomId && raceExpanded)
  );

  return (
    <div className="app-shell">
      {/* v167: ~25 canlı dinleyici (çete, SMS, ChatsApp, Sixtagram…) açılışın 2. aşamasında başlar */}
      {bootGang && <GangAlertsBridge uid={user?.uid} onChange={setGangAlerts} />}
      {bootUnread && <UnreadBridge onChange={setUnread} />}
      {exitHint && !exitAsk && <div className="exit-hint">Çıkmak için bir kez daha geri</div>}
      {exitAsk && (
        <ConfirmModal
          title="Çıkmak istiyor musun?"
          message="İlerlemen kayıtlı. Çıkmak için geri tuşuna bir kez daha bas."
          confirmLabel="Çık"
          cancelLabel="Oyunda kal"
          onCancel={() => {
            setExitAsk(false);
            rearmBack();
          }}
          onConfirm={() => exitApp()}
        />
      )}
      {homeUi && (
      <Hud
        suspicion={hudSusp}
        reputation={hudRep}
        gold={hudGold}
        onGoldClick={() => {
          // v161: her yerde Zümrüt Mağazası açılır (Android'de mağaza kapalıysa telefon ana ekranda açılır).
          // Eskiden Android'de Parara açılıyordu; Parara artık Cappstore'dan indirilen bir uygulama.
          setPhoneInitialApp('altin-magazasi');
          setPhoneOpen(true);
        }}
      />
      )}

      {/* v91: eski Android sürümü → "Güncelle" uyarısı */}
      <UpdateAppBanner />

      {/* v77: internet kafe ödenmiş süre halkası — mekân dışında da görünür */}
      {user && bootRing && <NetCreditRing className="vn-fixed" />}

      <main className="map-stage">
        {/* v157.4: oyun şehirde açılır — eski 2D harita şehir açıkken hiç kurulmaz (bellek) */}
        {!city && <CityMap onRegionClick={onRegionClickStable} paused={mapCovered} />}
      </main>

      <ReferralPrompt />

      {homeUi && (
      <BottomBar
        onHeistClick={() => openHeistScreen(null)}
        onGangsClick={() => setGangsOpen(true)}
        gangsBadge={gangAlerts.any}
        onProfileClick={() => setProfileOpen(true)}
      />
      )}

      {/* v147 — Şehre gir: telefonun üstünde; evin önünde doğulur */}
      {/* v149: misafir de şehre girer (gezinti modu) */}
      {homeUi && <CityPegman onTap={() => openCity('ev')} onDrop={(pt) => openCity(pt)} />}

      {/* Telefon kısayolu — ChatsApp butonunun TAM üstünde, aynı boyutta. */}
      {homeUi && (
      <button
        className="map-phone-btn"
        onClick={() => setPhoneOpen(true)}
        aria-label="Telefon"
        title="Telefon"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        {unread.totalBadge > 0 && (
          <span className="bottom-bar-badge">{unread.totalBadge > 9 ? '9+' : unread.totalBadge}</span>
        )}
      </button>
      )}

      {comingSoon && (
        <div className="coming-soon-toast" role="status">
          🚧 {comingSoon} — Çok yakında
        </div>
      )}

      {/* Yeni istek: "chatsapp ... anasayfada sağ alta yakın bi noktada
          kısa yolu bulunsun" — alttaki 4 sekmeden biri DEĞİL, çubuğun
          hafif üstünde/sağında, mekanlardaki kamera/telefon butonlarıyla
          aynı boyutta (52px) bağımsız bir kısayol. */}
      {homeUi && (
      <button
        className="map-chatsapp-btn"
        onClick={() => {
          setPhoneInitialApp('chatsapp');
          setPhoneOpen(true);
        }}
        aria-label="ChatsApp"
        title="ChatsApp"
      >
        💬
        {chatsAppCount > 0 ? (
          <span className="map-chatsapp-badge">{chatsAppCount > 99 ? '99+' : chatsAppCount}</span>
        ) : (
          unread.chatsAppHasNew && <span className="map-chatsapp-dot" />
        )}
      </button>
      )}

      {/* Yeni görev/hatırlatıcı paneli — ChatsApp butonunun tam simetriği,
          sol altta aynı boyut/konumda (bkz. OnboardingPanel.css). */}
      {/* v136: sol alt sütun alttan yukarı Görevler → CANLI → 🗳️ Seçim; görünmeyenin
          yeri boş kalmaz (üsttekiler alta kayar). */}
      {homeUi && (
      <OnboardingPanel
        gangReminders={gangAlerts?.reminders}
        gangChans={gangAlerts?.chans}
        slotBottom={leftSlotBottom(0)}
        onVisibleChange={setObVisible}
        onGo={(t) => {
          // v158: anasayfadan "Git" — şehir o yerde açılır; çete / teşkilat işleri Çeteler ekranında
          if (t === 'gang' || t === 'intel') {
            setGangsHq(null);
            setGangsOpen(true);
            return;
          }
          openCityRef.current(t);
        }}
      />
      )}

      {/* v80 Yayıncılık — canlı yayın varken Görevler'in tam üstünde (telefonun
          karşısında) 🔴 CANLI; yoksa görünmez. */}
      {homeUi && <LiveStreamsButton className="map-live-btn" onWatch={setWatchStreamId} slotBottom={leftSlotBottom(obVisible ? 1 : 0)} onVisibleChange={setLiveVisible} />}
      {homeUi && <PoliticsHomeButton slot={(obVisible ? 1 : 0) + (liveVisible ? 1 : 0)} />}
      {watchStreamId && <StreamViewer streamId={watchStreamId} onClose={() => setWatchStreamId(null)} />}

      {phoneOpen && (
        <PhoneScreen
          onClose={() => {
            setPhoneOpen(false);
            setPhoneInitialApp(null);
          }}
          initialApp={phoneInitialApp}
          onEnterTable={openTable}
        />
      )}
      {bootBanner && (
      <TopNotificationBanner
        onOpenPhone={(type) => {
          const app = type === 'sms' ? 'sms' : 'chatsapp';
          if (openInCityPhone(app)) return; // v170: şehir açıkken şehrin telefonunda
          setPhoneInitialApp(app);
          setPhoneOpen(true);
        }}
      />
      )}
      {profileOpen && <ProfileFullScreen onClose={() => setProfileOpen(false)} />}
      {houseView && (
        <GangAlertsContext.Provider value={gangAlerts}>
        <HouseHub
          initialHouseId={houseView.houseId}
          mode={houseView.mode || null}
          onClose={() => {
            const fromVisit = Boolean(houseView.houseId) && visitReturnPending;
            setHouseView(null);
            if (fromVisit) {
              setVisitReturnPending(false);
              setMekanlarTab('soygun');
              setHeistTarget(null);
            }
          }}
        />
        </GangAlertsContext.Provider>
      )}
      {futbolOpen && <FutbolFullScreen onClose={() => setFutbolOpen(false)} />}
      {hqView && (
        <GangAlertsContext.Provider value={gangAlerts}>
          <GangHqScreen
            gangId={hqView.gangId}
            onExit={() => {
              setHqView(null);
              setCityCovered(false);
            }}
          />
        </GangAlertsContext.Provider>
      )}
      {gangsOpen && (
        <GangAlertsContext.Provider value={gangAlerts}>
          {user ? (
            // v160.3 — 5 sekmeli Çeteler paneli
            <GangPanel
              start={gangsHq === 'gang' || gangsHq === 'intel' ? { org: gangsHq, tab: 'savas' } : { tab: 'ceteler' }}
              onClose={() => {
                setGangsOpen(false);
                setGangsHq(null);
                setCityCovered(false);
              }}
              onEnterHq={(g) => {
                setGangsOpen(false);
                setGangsHq(null);
                setCityCovered(false);
                window.dispatchEvent(new CustomEvent('neon-enter-gang-hq', { detail: { gangId: g?.id } }));
              }}
            />
          ) : (
            <GangsFullScreen
              initialHq={gangsHq}
              onClose={() => {
                setGangsOpen(false);
                setGangsHq(null);
                setCityCovered(false);
              }}
            />
          )}
        </GangAlertsContext.Provider>
      )}

      <RegionModal
        region={activeRegion}
        onClose={() => setActiveRegion(null)}
        onOpenHeist={openHeistScreen}
        onEnterRace={openRace}
        onEnterTable={openTable}
        raceLobbyMode={raceLobbyMode}
        onRaceModeChange={setRaceLobbyMode}
      />

      {parkOpen && (
        user ? (
          <VenueHouseScreen venue="park" onExit={() => closeVenueMaybeReturnToVisit(setParkOpen)} fallback={<ParkWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setParkOpen)} />} />
        ) : (
        <GuestVenue venueKey="park" onExit={() => closeVenueMaybeReturnToVisit(setParkOpen)} />
        )
      )}

      {bankOpen && (
        user ? (
          <VenueHouseScreen venue="banka" onExit={() => closeVenueMaybeReturnToVisit(setBankOpen)} onOpenHeist={openHeistScreen} fallback={<BankWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setBankOpen)} onOpenHeist={openHeistScreen} />} />
        ) : (
        <GuestVenue venueKey="banka" onExit={() => closeVenueMaybeReturnToVisit(setBankOpen)} />
        )
      )}

      {karakolOpen && (
        user ? (
          <VenueHouseScreen venue="karakol" onExit={() => closeVenueMaybeReturnToVisit(setKarakolOpen)} fallback={<KarakolWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setKarakolOpen)} />} />
        ) : (
        <GuestVenue venueKey="karakol" onExit={() => closeVenueMaybeReturnToVisit(setKarakolOpen)} />
        )
      )}

      {belediyeOpen && user && (
        <VenueHouseScreen
          venue="belediye"
          onExit={() => closeVenueMaybeReturnToVisit(setBelediyeOpen)}
          fallback={<VenueFallbackNotice onDone={() => { setBelediyeOpen(false); showComingSoon('Belediye Binası'); }} />}
        />
      )}
      {belediyeOpen && !user && <GuestVenue venueKey="belediye" onExit={() => closeVenueMaybeReturnToVisit(setBelediyeOpen)} />}

      {teskilatOpen && user && (
        <VenueHouseScreen
          venue="teskilat"
          onExit={() => closeVenueMaybeReturnToVisit(setTeskilatOpen)}
          fallback={<VenueFallbackNotice onDone={() => closeVenueMaybeReturnToVisit(setTeskilatOpen)} />}
        />
      )}

      {vendorRegion && user && (
        <VenueHouseScreen
          key={vendorRegion.id}
          venue={vendorVenueKey(vendorRegion.id)}
          onExit={() => closeVenueMaybeReturnToVisit(() => setVendorRegion(null))}
          onOpenHeist={openHeistScreen}
          fallback={
            <VenueFallbackNotice
              onDone={() => {
                const r = vendorRegion;
                setVendorRegion(null);
                setActiveRegion(r);
              }}
            />
          }
        />
      )}
      {vendorRegion && !user && <GuestVenue key={vendorRegion.id} venueKey={vendorVenueKey(vendorRegion.id)} onExit={() => closeVenueMaybeReturnToVisit(() => setVendorRegion(null))} />}

      {mosqueOpen && (
        user ? (
          <VenueHouseScreen venue="camii" onExit={() => closeVenueMaybeReturnToVisit(setMosqueOpen)} fallback={<MosqueWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setMosqueOpen)} />} />
        ) : (
        <GuestVenue venueKey="camii" onExit={() => closeVenueMaybeReturnToVisit(setMosqueOpen)} />
        )
      )}

      {casinoOpen && (
        user ? (
          <VenueHouseScreen venue="gazino" onExit={() => closeVenueMaybeReturnToVisit(setCasinoOpen)} onOpenHeist={openHeistScreen} fallback={<CasinoWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setCasinoOpen)} onOpenHeist={openHeistScreen} />} />
        ) : (
        <GuestVenue venueKey="gazino" onExit={() => closeVenueMaybeReturnToVisit(setCasinoOpen)} />
        )
      )}

      {dealershipOpen && (
        user ? (
          <VenueHouseScreen venue="araba_galerisi" onExit={() => closeVenueMaybeReturnToVisit(setDealershipOpen)} onOpenHeist={openHeistScreen} fallback={<CarDealershipWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setDealershipOpen)} onOpenHeist={openHeistScreen} />} />
        ) : (
        <GuestVenue venueKey="araba_galerisi" onExit={() => closeVenueMaybeReturnToVisit(setDealershipOpen)} />
        )
      )}

      {/* v177: oyunun motor galerisi — araba galerisi gibi 3D mekân (açılamazsa düz liste) */}
      {motorShopOpen &&
        (user ? (
          <VenueHouseScreen venue="motor_galerisi" onExit={() => closeVenueMaybeReturnToVisit(setMotorShopOpen)} fallback={<MotorGalleryScreen onClose={() => closeVenueMaybeReturnToVisit(setMotorShopOpen)} />} />
        ) : (
          <MotorGalleryScreen onClose={() => closeVenueMaybeReturnToVisit(setMotorShopOpen)} />
        ))}

      {weaponShopOpen && (
        user ? (
          <VenueHouseScreen venue="silah_magazasi" onExit={() => closeVenueMaybeReturnToVisit(setWeaponShopOpen)} fallback={<WeaponShopWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setWeaponShopOpen)} />} />
        ) : (
        <GuestVenue venueKey="silah_magazasi" onExit={() => closeVenueMaybeReturnToVisit(setWeaponShopOpen)} />
        )
      )}

      {tuningGarageOpen && (
        user ? (
          <VenueHouseScreen venue="modifiye_garaji" onExit={() => closeVenueMaybeReturnToVisit(setTuningGarageOpen)} onOpenHeist={openHeistScreen} fallback={<TuningGarageWorldScreen onExit={() => closeVenueMaybeReturnToVisit(setTuningGarageOpen)} onOpenHeist={openHeistScreen} />} />
        ) : (
        <GuestVenue venueKey="modifiye_garaji" onExit={() => closeVenueMaybeReturnToVisit(setTuningGarageOpen)} />
        )
      )}

      {city && (
        // v154: şehir açıkken yarış ekranı ve yarış balonu şehrin üstünde (ns-city-open)
        <StableCityScreen
          key={city.k}
          spawn={city.spawn}
          onClose={() => setCity(null)}
          gangAlerts={gangAlerts}
          // v158: şehirdeki 📱 düğmesinde okunmamış sayısı (SMS + ChatsApp + Sixtagram bildirimi)
          phoneBadge={unread.smsUnreadCount + (chatsAppCount || (unread.chatsAppHasNew ? 1 : 0)) + unread.sixtagramUnreadNotifCount}
          covered={cityCovered}
          onEnterHq={(kind, slot, gangId) => {
            // v159.1: karargah kapısı / Çeteler › Aç → gerçek karargah şehrin üstünde (şehir bekler,
            // çıkınca karargahın kapısının önündesin). Teşkilat paneli eskisi gibi Çeteler'de.
            if (Number.isInteger(slot)) setCityReturn(`hq${slot}`);
            setCityCovered(true);
            // v160.3: ev / işletme içindeki Çeteler › Karargaha gir — açık mekân kapanır
            setHouseView(null);
            setBusinessView(null);
            if (kind === 'intel') {
              setGangsHq(kind);
              setGangsOpen(true);
              return;
            }
            setHqView({ gangId: gangId || null });
          }}
          // v157.4: şehrin Soygun panelindeki Ziyaret → mekân / ev (çıkınca şehre dönülür)
          onVisitVenue={(k) => {
            setCity(null);
            handleVisitVenue(k);
            // v157.4: mekândan çıkınca Ziyaret listesine değil, şehirde o mekânın önüne dönülür
            setVisitReturnPending(false);
            const vr = String(k).startsWith('vendor:') ? regions.find((x) => x.id === String(k).slice(7)) : null;
            setCityReturn(vr ? vendorVenueKey(vr.id) || 'ev' : { teskilat: 'karakol', mosque: 'camii', dealership: 'araba_galerisi', weaponShop: 'silah_magazasi', tuningGarage: 'modifiye_garaji' }[k] || k);
          }}
          onVisitHouse={(houseId) => {
            setCity(null);
            setVisitReturnPending(true);
            setHouseView({ houseId });
          }}
          // v154: şehirdeki pist panelinden yarışa giriş → yarış ekranı şehrin üstünde, şehir durur
          onEnterRace={(roomId, o) => openRace(roomId, { expand: true, ...(o || {}) })}
          raceFull={Boolean(effectiveRaceRoomId && raceExpanded)}
          onEnterRegion={(rid) => {
            // kapıdan içeri: şehir kapanır (araba kalkar), mekân/liste mevcut yoldan açılır
            setCity(null);
            setCityReturn(rid);
            // v157.4: Ofis binasının danışmasından "🏢 Ofisler" listesi
            if (rid === 'ofis') {
              setHouseView({ houseId: null, mode: 'ofis' });
              return;
            }
            const r = regions.find((x) => x.id === rid);
            if (r) handleRegionClick(r.id, r, { fromCity: true });
          }}
          // v157 — şehirdeki mekânın listesinden seçilen işletmeye git (çıkınca şehre, o mekânın içine)
          // v157.8 — Ev / Ofis binasındaki listeden bir eve / ofise gir (çıkınca o binanın içine dönülür)
          onOpenHouse={(houseId, region) => {
            setCityCovered(true); // v157.9: şehir kapanmaz, arkada bekler (dönüşte yeniden kurulmaz)
            setCityReturn(region === 'ofis' ? 'ofis' : 'ev');
            setHouseView({ houseId });
          }}
          onOpenBiz={({ type, houseId, game, buy }) => {
            const region = BIZ_TYPES[type]?.region || 'ev';
            setCityCovered(true); // v157.9: şehir arkada bekler
            setCityReturn(region);
            // v196: sadece oyunun mekânları (oyuncu işletmesi / açma penceresi yok)
            void buy;
            void game;
            void houseId;
            const open = { silahci: setWeaponShopOpen, galeri: setDealershipOpen, motogaleri: setMotorShopOpen, modifiye: setTuningGarageOpen, gazino: setCasinoOpen }[type];
            if (open) open(true);
          }}
          onOpenHeist={(t) => {
            setCity(null);
            setCityReturn(VENDORS[t]?.venue || 'ev');
            openHeistScreen(t);
          }}
        />
      )}

      {heistTarget !== undefined && (
        <MekanlarScreen
          tab={mekanlarTab}
          onTabChange={setMekanlarTab}
          initialHeistTarget={heistTarget}
          onClose={() => setHeistTarget(undefined)}
          onVisitVenue={handleVisitVenue}
          onVisitHouse={(houseId) => {
            setHeistTarget(undefined);
            setVisitReturnPending(true);
            setHouseView({ houseId });
          }}
        />
      )}

      {effectiveRaceRoomId && user && raceExpanded && (
        <RaceFullScreen
          roomId={effectiveRaceRoomId}
          myUid={user.uid}
          onCollapse={() => setRaceExpanded(false)}
          onSwitchRoom={(id) => {
            setActiveRaceRoomId(id);
            setRaceExpanded(true);
          }}
          onExit={() => {
            setActiveRaceRoomId(null);
            setRaceExpanded(false);
            // Ana haritaya değil, doğrudan Yarış Pisti'nin kendi lobisine
            // dön — "Lobiye Dön" tam olarak bunu vaat ediyor.
            setActiveRegion(RACE_TRACK_REGION);
          }}
        />
      )}

      {effectiveRaceRoomId && user && !raceExpanded && (
        <RaceBubble roomId={effectiveRaceRoomId} onExpand={() => setRaceExpanded(true)} />
      )}

      {activeTableId && user && (
        <OnNumaraFullScreen
          tableId={activeTableId}
          myUid={user.uid}
          onExit={() => setActiveTableId(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/* UGC D2: engelleme listesi — tek dinleyici, tüm ekranlar buradan okur */}
      <BlocksProvider>
        {/* v60: arkadaşlar, istekler, özel sohbetler — tek sağlayıcı */}
        <SocialProvider>
          <GameShell />
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
}
