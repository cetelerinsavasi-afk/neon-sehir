// =============================================================================
// v147 — GEZİLEBİLİR ŞEHİR (tam ekran). Haritanın büyük 3D hali: yürü, kendi
// arabanı çağır ve sür, başkalarının arabasına yolcu ol, otur, yakındakilerle
// konuş. Mekân kapılarından oyunun mevcut ekranlarına geçilir (App yönlendirir).
//
// Maliyet: şehirde Firestore'a HİÇ yazılmaz/okunmaz. Konum, araba, yakın sohbet
// ve profil Realtime Database'den (cityNet.js) akar. Satıcıdan alışveriş, büfe,
// şüpheli adam gibi işlemler oyunun mevcut sunucu fonksiyonlarını kullanır
// (bugünkü 3D mekânlardakiyle aynı çağrılar → ek maliyet yok).
// Garaj (kendi arabaların) sadece "Arabalarım" açılınca okunur.
// =============================================================================
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CarImg from '../VehicleCard/CarImg'; // v150: araç görseli = 3D model
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useInventory } from '../../hooks/useInventory';
import { useVehicles } from '../../hooks/useVehicles';
import { useBlocks } from '../../contexts/BlocksContext';
import { useBackClose } from '../../lib/backStack';
import { blockProfanity } from '../../lib/profanityGuard';
import { buyFromVendor, buyFromBufe, sellContrabandAtPark, cityAction, createSixtagramPost, shopAction } from '../../services/gameActions';
import { FUEL_PRICE, GAS_MARKET_MENU } from '../../../functions/gasStation.js';
import { GAS_STATION } from '../../../functions/cityJobsData.js';
import { createJobRunner } from './cityJobs.js';
import { JOBS } from '../../../functions/vehicleKinds.js';
import { invalidateSixtagramFeed } from '../../hooks/useSixtagramFeed';
import PhotoStoryEditor from '../HouseScreen/PhotoStoryEditor';
import { vehicleCatalog, vehicleKindOfId } from '../../data/vehicleCatalog.js';
import { VehicleKindTabs } from '../VehicleGalleryScreen/VehicleGalleryScreen';
import '../VehicleGalleryScreen/VehicleGalleryScreen.css';
import mapImg from '../../assets/sehir-haritasi.jpg';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { VENUES } from '../../../functions/venueLayouts.js';
import { VENDORS, VENDOR_COST } from '../../../functions/vendorData.js';
import HeldIcon from '../HouseScreen/HeldIcon';
import HeistPanel, { HEIST_LABELS } from '../HeistPanel/HeistPanel';
import { heistCarOf, heistOutcomeOf, heistSceneOf, rememberHeistCar } from '../HeistPanel/heistVideo';
import PhoneScreen from '../Phone/PhoneScreen';
import PlayerCard from '../PlayerCard/PlayerCard';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import GuestSignInSheet from '../Guest/GuestSignInSheet';
import NearbyPlayersButton from '../NearbyPlayers/NearbyPlayersButton';
import { useStadiumMatches } from '../../hooks/useStadiumMatches';
import { liveState } from './stadiumMatch.js';
import ShadyDealPanel from '../ShadyDeal/ShadyDealPanel';
import SaleToast from '../ShadyDeal/SaleToast';
import { EMOTES } from '../HouseScreen/houseEngine';
import { createCityEngine } from './cityEngine.js';
import { prepareCityWorld } from './world/outerWorld.js';
import CityBizList from './CityBizList';
import VenueLayer from '../Venue3D/VenueLayer';
import { IS_MOBILE_DEVICE } from '../../lib/photoCache';
import { createCityNet } from './cityNet.js';
import { MAP_SIZE, buildMapping } from './cityMapMath.js';
import { setLiveCityEngine } from './cityPhotoHub.js';
import { renderCityPhotoUrl } from './CityPhoto.jsx';
import '../HouseScreen/HouseScreen.css';
import '../Venue3D/Venue3D.css';
import '../../styles/worldScreenChrome.css';
import '../Workshop/Workshop.css';
import '../../styles/bizui.css';
import './City.css';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
// v149 — stadyumun içindeyken sağ üstteki "Futbol" düğmesiyle açılan panel
const FutbolFullScreen = lazy(() => import('../FutbolScreen/FutbolFullScreen'));
// v154 — fabrika ve yarış pisti sayfaları şehrin İÇİNDE açılır (şehir kapanmaz)
const FactoryScreen = lazy(() => import('../FactoryScreen/FactoryScreen'));
const RaceTrackScreen = lazy(() => import('../RaceTrackScreen/RaceTrackScreen'));
// kapıdan girilince şehir içinde panel olarak açılan mekânlar
const IN_CITY_REGIONS = { fabrika: '🏭 Fabrika', yaris_pisti: '🏁 Yarış Pisti' };
// v157 — haritadaki mekânın içindeyken çıkan düğmeler. Şehirdeki bina görünüştür: listeden
// istenen işletmeye gidilir (biz), oyunun tek mekânlarında işlemler içeride yapılır (game),
// soyulabilen mekânda "Soygun yap" içeride çıkar (heist).
const VENUE_UI = {
  bar: { biz: 'bar', label: '🍸 Barlar' },
  cafe: { biz: 'cafe', label: '☕ Cafeler' },
  netkafe: { biz: 'internet', label: '🖥️ İnternet kafeler', heist: 'internet_kafe' },
  spor: { biz: 'spor', label: '🏋️ Spor salonları' },
  galeri: { biz: 'galeri', label: '🚗 Araba galerileri', heist: 'araba_galerisi' },
  silah: { biz: 'silahci', label: '🔫 Silahçılar', heist: 'silah_magazasi' },
  modifiye: { biz: 'modifiye', label: '🔧 Modifiye garajları' },
  casino: { biz: 'gazino', label: '🎰 Gazinolar', heist: 'casino' },
  liman: { biz: 'depo', label: '📦 Depolar' },
  fabrika: { inCity: 'fabrika', label: '🏭 Fabrika', heist: 'fabrika' },
  ev: { region: 'ev', label: '🏠 Evler' },
  banka: { game: 'banka', heist: 'banka' },
  camii: { game: 'camii' },
  karakol: { game: 'karakol' },
  belediye: { game: 'belediye' },
};
const VENUE_TITLE = { bar: '🍸 Bar', cafe: '☕ Cafe', netkafe: '🖥️ İnternet Kafe', spor: '🏋️ Spor Salonu', galeri: '🚗 Araba Galerisi', silah: '🔫 Silah Mağazası', modifiye: '🔧 Modifiye Garajı', casino: '🎰 Casino', liman: '⚓ Liman & Depo', fabrika: '🏭 Fabrika', ev: '🏠 Ev', banka: '🏦 Banka', camii: '🕌 Camii', karakol: '🚓 Karakol', belediye: '🏛️ Belediye', hastane: '🏥 Hastane', benzinlik: '⛽ Benzinlik Market', otogar: '🚌 Otogar', otogar_kk: '🚌 Kervankent Otogarı', taksi_duragi: '🚕 Taksi Durağı' };
const VENDOR_BY_VENUE = Object.fromEntries(Object.entries(VENDORS).map(([id, v]) => [v.venue, { id, ...v }]));
const BUFE_MENU = [
  { id: 'sosisli', price: 200 },
  { id: 'tost', price: 300 },
  { id: 'cay', price: 20 },
  { id: 'kahve', price: 100 },
  { id: 'oralet', price: 40 },
  { id: 'latte', price: 500 },
];
const HOLD_MS = 120_000;

// v156 — benzinlik pompaları (lot merkezinden 3 m önde, iki kanopi) → "⛽ Benzin al"
const PUMPS = { x: GAS_STATION.x, z: GAS_STATION.z + 3, r: 9 };

function Sheet({ title, onClose, children, closeLabel = 'Uzaklaş' }) {
  return (
    <div className="wk-sheet-bg" onClick={onClose}>
      <div className="wk-sheet v3-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="v3-sheet-head">
          <b>{title}</b>
          <button className="bz-x" onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        {children}
        <button className="ws-panel-btn" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}
function HoldBtn({ className, onHold, children }) {
  const on = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.classList.add('on');
    onHold(true);
  };
  const off = (e) => {
    e.currentTarget.classList.remove('on');
    onHold(false);
  };
  return (
    <button className={className} data-hold onPointerDown={on} onPointerUp={off} onPointerCancel={off} onLostPointerCapture={off} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}
function Speedo({ kmh, gear, ratio }) {
  const R = 54;
  const start = Math.PI * 0.75;
  const span = Math.PI * 1.5;
  const arc = (k) => {
    const a = start + span * k;
    return [70 + Math.cos(a) * R, 70 + Math.sin(a) * R];
  };
  const [x0, y0] = arc(0);
  const [x1, y1] = arc(1);
  const k = Math.min(1, ratio);
  const [xv, yv] = arc(k);
  return (
    <div className="cs-speedo">
      <svg viewBox="0 0 140 140">
        <defs>
          <linearGradient id="spg" x1="0" x2="1">
            <stop offset="0" stopColor="#19e8ff" />
            <stop offset="0.6" stopColor="#ffd23f" />
            <stop offset="1" stopColor="#ff2e8c" />
          </linearGradient>
        </defs>
        <path d={`M${x0} ${y0} A${R} ${R} 0 1 1 ${x1} ${y1}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" strokeLinecap="round" />
        {k > 0.003 && <path d={`M${x0} ${y0} A${R} ${R} 0 ${k * span > Math.PI ? 1 : 0} 1 ${xv} ${yv}`} fill="none" stroke="url(#spg)" strokeWidth="9" strokeLinecap="round" />}
      </svg>
      <b>{kmh}</b>
      <span>km/s</span>
      <i>{gear}</i>
    </div>
  );
}

// "Arabalarım" — sadece açılınca okunur (Firestore okuması yalnız burada)
function GarageSheet({ onPick, onClose, onGallery }) {
  const { vehicles, loading } = useVehicles();
  const [tab, setTab] = useState('araba'); // v152: Araba / Ticari / Motor (galerideki gibi)
  const all = vehicles.filter((v) => !v.listed && !v.seizedByBank);
  const usable = all.filter((v) => vehicleKindOfId(v.catalogId) === tab);
  // açılışta: Araba sekmesi boşsa aracı olan ilk sekme
  const autoTab = useRef(false);
  useEffect(() => {
    if (loading || autoTab.current || !all.length) return;
    autoTab.current = true;
    if (!usable.length) {
      const k = ['araba', 'ticari', 'motor'].find((x) => all.some((v) => vehicleKindOfId(v.catalogId) === x));
      if (k) setTab(k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, all.length]);
  return (
    <Sheet title="🚗 Arabalarım" onClose={onClose} closeLabel="Kapat">
      <VehicleKindTabs value={tab} onChange={setTab} />
      {loading && <div className="cs-garage-empty">…</div>}
      {!loading && all.length > 0 && usable.length === 0 && <p className="vg-empty">Bu sekmede aracın yok.</p>}
      {!loading && all.length === 0 && (
        <div className="cs-garage-empty">
          <span>🚗</span>
          <button className="v3-btn primary" onClick={onGallery}>Araba Galerisi</button>
        </div>
      )}
      <div className="cs-garage">
        {usable.map((v) => {
          const c = vehicleCatalog.find((x) => x.id === v.catalogId);
          if (!c) return null;
          // v147.3: ömrü bitmiş araba sürülemez
          const dead = v.lifeDays != null && Number(v.lifeDays) <= 0;
          return (
            <button key={v.id} className={`cs-car${dead ? ' dead' : ''}`} disabled={dead} onClick={() => !dead && onPick(c, v)}>
              <CarImg catalogId={c.id} mods={v.mods || null} />
              <b>{v.customName || c.name}</b>
              <span>{dead ? '⛔ Ömrü bitti' : c.job && c.kind !== 'motor' ? `💼 ${JOBS[c.job]?.name || 'Meslek'}` : `👥 ${c.seats || ({ 1: 4, 2: 4, 3: 4, 4: 2, 5: 4, 6: 2, 7: 2, 8: 2, 9: 1, 10: 2 })[c.id] || 2}`}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// v154 — maç seçici: "Anadolu Yıldızları" → "Anadolu Y." (ilk kelime tam, kalanların baş harfi)
function shortTeam(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return w[0] || '—';
  return `${w[0]} ${w.slice(1).map((x) => `${x[0].toLocaleUpperCase('tr-TR')}.`).join(' ')}`;
}

export default function CityScreen({ spawn = 'ev', onClose, onEnterRegion, onEnterRace, onOpenBiz, raceFull = false }) {
  const { user, loading: authLoading } = useAuth();
  // v149 — misafir (giriş yapmamış) da şehri gezer: yürür, oturur, mekân kapılarından girer.
  // Ağ (diğer oyuncular / sohbet) yok, alışveriş · araba · fotoğraf giriş ister.
  const guest = !user && !authLoading;
  const [askSignIn, setAskSignIn] = useState(false);
  useEffect(() => {
    if (user) setAskSignIn(false);
  }, [user]);
  const { player } = usePlayer();
  const { actions: daily } = useDailyActions();
  const { inventory } = useInventory();
  const { isBlocked } = useBlocks();
  const stageRef = useRef(null);
  const engineRef = useRef(null);
  const netRef = useRef(null);
  const miniRef = useRef(null);
  const bigRef = useRef(null);
  const imgRef = useRef(null);
  const blockedRef = useRef(isBlocked);
  blockedRef.current = isBlocked;
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('3d');
  const [zone, setZone] = useState(null);
  const [panel, setPanel] = useState(null);
  const [haracHide, setHaracHide] = useState(false); // v153: animasyon oynarken haraç penceresi gizli
  const [heistOn, setHeistOn] = useState(false); // v154: soygun videosu oynarken şehir arayüzü gizli
  const [toast, setToast] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [run, setRun] = useState(false);
  const [muted, setMuted] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [carCam, setCarCam] = useState('out'); // v149 — araba içi kamera
  // v149 — stadyum: içindeyken Futbol düğmesi, maç saatinde maç seçici (her cihazda ayrı)
  const [inStadium, setInStadium] = useState(false);
  const [inPist, setInPist] = useState(false);
  const [atPump, setAtPump] = useState(false); // v156
  const [fueling, setFueling] = useState(false); // v156 // v154: yarış pisti alanı (tribün / pit)
  // v157 — mekânın içi / dış dünya / yükleme yüzdesi / yatay mod / sürerken sohbet
  const [venue, setVenue] = useState(null);
  const [place, setPlace] = useState(null);
  const [spot, setSpot] = useState(null);
  const [bizOpen, setBizOpen] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const landscape = false;
  const [driveChat, setDriveChat] = useState(false);
  const [gameVenueKey, setGameVenueKey] = useState(null); // oyunun mekân katmanı (VenueLayer) — çıkınca 3 sn sonra kapanır
  const venueApiRef = useRef(null);
  const gameVenueDef = useMemo(() => (gameVenueKey && VENUES[gameVenueKey] ? { ...VENUES[gameVenueKey], key: gameVenueKey } : null), [gameVenueKey]);
  // v154: şehir açıkken yarış ekranı / yarış balonu şehrin üstünde görünsün
  useEffect(() => {
    document.body.classList.add('ns-city-open');
    return () => document.body.classList.remove('ns-city-open');
  }, []);
  const [matchIdx, setMatchIdx] = useState(0);
  const [, setScoreTick] = useState(0);
  const toggleCarCam = () => {
    const m = carCam === 'in' ? 'out' : 'in';
    setCarCam(m);
    engineRef.current?.setCarCam(m);
    if (m === 'in') flash('🎥 Araba içi · etrafa bakmak için ekranı kaydır');
  };
  // v147.1 performans: konum 10 Hz gelir ama ekran (React) sadece görünen şey değişince
  // yeniden çizilir; mini harita doğrudan tuvale çizilir.
  const hudRef = useRef({ x: 0, z: 0, yaw: 0 });
  const [hud, setHud] = useState({ driving: false, riding: false, drive: null });
  const [gen, setGen] = useState(0);
  const [fatal, setFatal] = useState(false);
  const drawMiniRef = useRef(null);
  const [mapTick, setMapTick] = useState(0);
  const [imgOk, setImgOk] = useState(false);
  const [online, setOnline] = useState(0);
  const [nearby, setNearby] = useState([]);
  const [offline, setOffline] = useState(false);
  const [card, setCard] = useState(null);
  const [report, setReport] = useState(null);
  const [chatOpen, setChatOpen] = useState(false); // v151: sohbet geçmişi açık mı
  // v151 — meslek (ticari araç): sürülen aracın belgesi + iş durumu
  const [myVeh, setMyVeh] = useState(null);
  const [jobUi, setJobUi] = useState(null);
  const [jobPaid, setJobPaid] = useState(null);
  const jobRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [sellResult, setSellResult] = useState(null);
  const toastT = useRef(0);
  const holdT = useRef(0);
  const namesRef = useRef(new Map());

  const flash = useCallback((t) => {
    setToast(t);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // v151 — meslek koşturucusu (işler art arda; sunucu öder)
  useEffect(() => {
    const r = createJobRunner({
      engine: () => engineRef.current,
      call: (payload) => shopAction(payload),
      onUi: (u) => setJobUi(u),
      onToast: (t) => flash(t),
      onPaid: (p) => {
        setJobPaid(p);
        setTimeout(() => setJobPaid((x) => (x === p ? null : x)), 4200);
      },
    });
    jobRef.current = r;
    const iv = setInterval(() => r.tick(0.1), 100);
    return () => {
      clearInterval(iv);
      r.stop(true);
      jobRef.current = null;
    };
  }, [flash]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgOk(true);
    };
    img.src = mapImg;
  }, []);

  // --- motor + ağ (ekran açıkken bir kez kurulur) ---------------------------------------
  const avatar = player?.avatar || null;
  const myName = player?.displayName || user?.displayName || 'Oyuncu';
  const startRef = useRef({ avatar, myName, spawn });
  const uid = user?.uid || (guest ? '__guest__' : null);
  useEffect(() => {
    if (!uid) return undefined;
    const isGuest = uid === '__guest__';
    let eng = null;
    let net = null;
    let tickT = 0;
    let lastCrash = 0;
    const st = startRef.current;
    let tries = 0;
    let t = 0;
    let dead = false;
    const start = async () => {
      // v147.1: grafik kurulamazsa ekran çökmesin (eskiden ana sayfaya atıyordu) — birkaç kez dene
      try {
        // v157: şehir + mekânlar + dış dünya adım adım kurulur (telefonda tek uzun donma olmasın)
        const world = await prepareCityWorld({ mobile: IS_MOBILE_DEVICE, onStep: (p) => !dead && setLoadPct(p) });
        if (dead) return;
        build(world);
      } catch (err) {
        console.error('Şehir kurulamadı:', err);
        try {
          eng?.dispose();
        } catch {
          /* yoksay */
        }
        eng = null;
        tries += 1;
        if (dead) return;
        if (tries < 3) t = setTimeout(start, 700 * tries);
        else setFatal(true);
      }
    };
    const build = (world) => {
      eng = createCityEngine(stageRef.current, {
        world,
        uid,
        avatar: st.avatar,
        name: st.myName,
        spawn: st.spawn,
        onInteract: (z) => setZone(z),
        onTick: (s) => {
          hudRef.current = s;
          // v157: mekânın içi / dış dünyadaki yer adı / yol üstü istasyonu
          setVenue((v) => (v === (s.venue || null) ? v : s.venue || null));
          setPlace((v) => (v === (s.place || null) ? v : s.place || null));
          setSpot((v) => {
            const k = s.spot ? s.spot.map((a) => a.id).join('|') : '';
            return (v ? v.map((a) => a.id).join('|') : '') === k ? v : s.spot || null;
          });
          setInStadium((v) => (v === (s.area === 'stadyum') ? v : s.area === 'stadyum'));
          setInPist((v) => (v === (s.area === 'pist') ? v : s.area === 'pist'));
          // v156: arabayla pompaların yanında mı? (⛽ Benzin al)
          const atPump = Boolean(s.driving && s.car && Math.hypot(s.car.x - PUMPS.x, s.car.z - PUMPS.z) < PUMPS.r);
          setAtPump((v) => (v === atPump ? v : atPump));
          drawMiniRef.current?.();
          setHud((h) => {
            const d = s.drive;
            const hd = h.drive;
            const same = h.driving === Boolean(s.driving) && h.riding === Boolean(s.riding) && (!d ? !hd : hd && hd.name === d.name && hd.gear === d.gear && Math.round(hd.kmh) === Math.round(d.kmh) && Math.abs((hd.ratio || 0) - (d.ratio || 0)) < 0.04);
            return same ? h : { driving: Boolean(s.driving), riding: Boolean(s.riding), drive: d ? { ...d } : null };
          });
        },
        onReady: () => setReady(true),
        onPlayerTap: (id) => setCard(id),
        onEvent: (e) => {
          if (e.type === 'crash') jobRef.current?.crash(e.speed);
          if (e.type === 'crash' && e.speed > 9 && Date.now() - lastCrash > 2500) {
            lastCrash = Date.now();
            flash('💥');
          }
          if (e.type === 'stadiumGoal' && e.inside) flash(`⚽ GOOOL! ${e.name}${e.scorer ? ` · ${e.scorer}` : ''} · ${e.home} ${e.hs}-${e.as} ${e.away}`);
          if (e.type === 'rideLost') {
            netRef.current?.releaseSeat();
            flash('🚗 Araba gitti');
          }
          // telefon grafik belleğini geri aldıysa şehir sessizce yeniden kurulur
          if (e.type === 'contextLost') setTimeout(() => setGen((g) => g + 1), 400);
        },
      });
      engineRef.current = eng;
      setLiveCityEngine(eng); // v147: Sixtagram'daki şehir fotoğrafları bu motorla çizilir
      if (import.meta.env?.DEV) window.__cityEng = eng;
      if (isGuest) return; // misafir: ağ yok (Realtime Database girişli okunur)
      net = createCityNet({
        uid,
        name: st.myName,
        avatar: st.avatar,
        onPlayer: (id, rec) => {
          if (blockedRef.current(id)) return eng.removePlayer(id);
          namesRef.current.set(id, { n: rec.n, a: rec.a });
          eng.upsertPlayer(id, rec);
        },
        onPlayerGone: (id) => eng.removePlayer(id),
        onCar: (id, rec) => (blockedRef.current(id) ? eng.removeCar(id) : eng.upsertCar(id, rec)),
        onCarGone: (id) => eng.removeCar(id),
        onChat: (id, text, pr) => {
          if (blockedRef.current(id)) return;
          const n = pr?.n || namesRef.current.get(id)?.n || 'Oyuncu';
          eng.playerSay(id, text);
          setMsgs((m) => [...m.slice(-80), { id: `${id}_${Date.now()}`, uid: id, name: n, text }]);
        },
        onStatus: (s) => setOffline(s === 'offline'),
      });
      netRef.current = net;
      tickT = setInterval(() => {
        if (document.hidden) return;
        net.tick(eng.getNetState(), eng.getNetCar());
      }, 100);
    };
    setReady(false);
    setLoadPct(0);
    t = setTimeout(start, 60);
    return () => {
      dead = true;
      clearTimeout(t);
      clearInterval(tickT);
      net?.stop();
      setLiveCityEngine(null);
      eng?.dispose();
      engineRef.current = null;
      netRef.current = null;
    };
  }, [uid, flash, gen]); // sadece kullanıcı değişince / grafik yeniden kurulunca (user nesnesi yenilenince şehir baştan kurulmasın)

  // motor yeniden kurulursa kamera tercihi korunur
  useEffect(() => {
    if (ready) engineRef.current?.setCarCam(carCam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // avatar sonradan değişirse (giyinme vb.)
  useEffect(() => {
    if (!ready || !avatar) return;
    engineRef.current?.setAvatar(avatar);
    netRef.current?.setProfile(myName, avatar);
  }, [ready, avatar, myName]);
  // engellenen oyuncular anında kaybolsun
  useEffect(() => {
    namesRef.current.forEach((_, id) => {
      if (isBlocked(id)) {
        engineRef.current?.removePlayer(id);
        engineRef.current?.removeCar(id);
      }
    });
  }, [isBlocked]);
  // uygulama arka plana geçince dur
  useEffect(() => {
    const on = () => {
      const e = engineRef.current;
      if (!e) return;
      if (document.hidden) {
        e.pause();
        e.hidden(true);
      } else if (!panel || (panel.kind !== 'phone' && panel.kind !== 'map' && panel.kind !== 'futbol')) {
        e.resume();
        e.hidden(false);
      }
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [panel]);
  // telefon açıkken sahne durur (pil + ısınma)
  useEffect(() => {
    const e = engineRef.current;
    if (!e || !ready) return;
    if (panel?.kind === 'phone' || panel?.kind === 'futbol' || raceFull) e.pause();
    else e.resume();
  }, [panel, ready, raceFull]);

  // --- v149 STADYUM: sponsor panoları, maç seçici, saha kilidi ---------------------------
  const { sponsors, matches, matchHour } = useStadiumMatches(inStadium && Boolean(user));
  useEffect(() => {
    if (ready) engineRef.current?.setStadiumSponsors(sponsors);
  }, [ready, sponsors]);
  const curMatch = matches.length ? matches[((matchIdx % matches.length) + matches.length) % matches.length] : null;
  useEffect(() => {
    if (ready) engineRef.current?.setStadiumMatch(curMatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, curMatch?.id]);
  // maç saatinde (maç varsa) sahaya girilmez
  const pitchLocked = matchHour && matches.length > 0;
  useEffect(() => {
    if (ready) engineRef.current?.setPitchLock(pitchLocked);
  }, [ready, pitchLocked]);
  // seçicideki skor / dakika
  useEffect(() => {
    if (!inStadium || !curMatch) return undefined;
    const iv = setInterval(() => setScoreTick((n) => n + 1), 4000);
    return () => clearInterval(iv);
  }, [inStadium, curMatch]);
  const curLive = curMatch ? liveState(curMatch) : null;
  // v157 — mekândan çıkınca liste kapanır; oyunun mekân katmanı (camii, banka…) içeride kurulur,
  // çıkıldıktan 3 sn sonra kapanır (kapıda gidip gelince konum kaydı tekrar tekrar yazılmasın)
  useEffect(() => {
    setBizOpen(false);
    const gk = VENUE_UI[venue]?.game || null;
    if (gk) {
      setGameVenueKey(gk);
      return undefined;
    }
    const t = setTimeout(() => setGameVenueKey(null), 3000);
    return () => clearTimeout(t);
  }, [venue]);
  // mekân katmanının istediği motor işlevleri (konuşma balonu, oda içi konum)
  const venueEngRef = useRef(null);
  if (!venueEngRef.current) {
    venueEngRef.current = {
      say: (id, line) => engineRef.current?.npcSay(id, line),
      getSelfState: () => engineRef.current?.venueLocal?.() || null,
      approach: () => false,
      setSelfTicket: () => {},
    };
  }
  const rotated = false; // v157.1: yatay mod kaldırıldı

  // kişi sayısı (yakındakiler) — 2 sn'de bir motorun haritasından
  useEffect(() => {
    if (!ready) return undefined;
    const iv = setInterval(() => {
      setOnline(engineRef.current?.remoteCount?.() || 0);
      // v150 — 👥 Yakındakiler (profil buradan açılır; oyuncuya dokunmak profil açmaz)
      const ids = (engineRef.current?.nearbyPlayers?.() || []).filter((id) => !blockedRef.current(id));
      setNearby((cur) => (cur.join(',') === ids.join(',') ? cur : ids));
    }, 2000);
    return () => clearInterval(iv);
  }, [ready]);

  const lots = useMemo(() => (ready ? engineRef.current?.lots || [] : []), [ready]);
  const mapping = useMemo(() => (lots.length ? buildMapping(lots) : null), [lots]);

  // --- v157 mini harita (prototipteki çizim haritası: şehir, otoyol, Kervankent, köyler) ------------
  const mmK = useRef(1.45);
  useEffect(() => {
    if (!ready) return undefined;
    drawMiniRef.current = () => {
      const eng = engineRef.current;
      const c = miniRef.current;
      if (!eng || !c) return;
      const gm = eng.map();
      const me = eng.mapSelf();
      const g = c.getContext('2d');
      const cw = c.clientWidth || 124;
      const dpr = c.width / cw || 2;
      // şehirde yakın, otoyolda (hızlıyken) uzak
      const kT = me.mode === 'hwy' ? (me.speed > 8 ? 0.55 : 0.95) : me.mode === 'town' ? 1.25 : 1.45;
      mmK.current += (kT - mmK.current) * 0.15;
      const h = hudRef.current.yaw + Math.PI; // bakış yönü
      const rot = -Math.PI / 2 - Math.atan2(Math.cos(h), Math.sin(h));
      const jr = eng.jobRoutePts?.();
      const path = jr && jr.pts.length > 1 ? jr.pts.map((p) => [p.x, p.z]) : null;
      const target = path ? { x: path[path.length - 1][0], z: path[path.length - 1][1] } : null;
      gm.draw(g, c.width, c.height, { cx: me.x, cz: me.z, k: mmK.current * (cw / 124), rot, dpr, oy: (c.clientHeight || 124) * 0.58 }, { truck: { x: me.x, z: me.z, yaw: me.driving ? me.yaw : h }, target, path, parked: !me.driving && me.car ? me.car : null, walker: !me.driving });
      // kuzey işareti
      const nx = Math.cos(rot - Math.PI / 2);
      const ny = Math.sin(rot - Math.PI / 2);
      const r = cw / 2 - 9;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.beginPath();
      g.arc(cw / 2 + nx * r, cw / 2 + ny * r, 7, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.fillStyle = '#d0302a';
      g.font = '900 10px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('K', cw / 2 + nx * r, cw / 2 + ny * r + 0.5);
      g.setTransform(1, 0, 0, 1, 0, 0);
    };
    drawMiniRef.current();
    return () => {
      drawMiniRef.current = null;
    };
  }, [ready]);
  void mapping;
  void imgOk;

  // --- geri tuşu: panel → araba → yolculuk → şehirden çık ------------------------------------
  useBackClose(true, () => {
    const e = engineRef.current;
    if (report) return setReport(null);
    if (card) return setCard(null);
    if (mapOpen) return setMapOpen(false);
    if (chatOpen) return setChatOpen(false);
    if (panel?.kind === 'camera') return closeCamera();
    if (panel) return setPanel(null);
    if (e?.isDriving()) return e.exitCar();
    if (e?.isRiding()) {
      e.rideEnd();
      netRef.current?.releaseSeat();
      return undefined;
    }
    return onClose?.();
  });

  const toggleView = () => {
    const v = view === '3d' ? '2d' : '3d';
    setView(v);
    engineRef.current?.setView(v);
  };

  // --- araba -------------------------------------------------------------------------------
  const callCar = (c, veh) => {
    // v150: aracın kayıtlı modifiyesiyle (şehirde modifiyeli hali görünür)
    const r = engineRef.current.callCar(c.id, veh?.mods || null);
    setPanel(null);
    flash(r.ok ? `🚗 ${c.name}` : r.reason);
    // v151: ticari araçsa üstte "İşe başla"
    if (r.ok) {
      rememberHeistCar(uid, c.id, veh?.mods || null); // v154: soygun videosundaki kaçış arabası
      const v = veh && c.job ? { id: veh.id, catalogId: c.id, job: c.job } : null;
      setMyVeh(v);
      jobRef.current?.setVehicle(v);
    }
  };
  const rideIn = async (z) => {
    const k = await netRef.current?.claimSeat(z.owner, z.seats);
    if (!k) return flash('Boş koltuk yok');
    engineRef.current.rideStart(z.owner, k);
  };
  const rideOut = () => {
    engineRef.current.rideEnd();
    netRef.current?.releaseSeat();
  };

  // --- eldeki ürün (2 dk) ------------------------------------------------------------------------
  const holdFor = (product) => {
    engineRef.current?.setHolding(product);
    clearTimeout(holdT.current);
    holdT.current = setTimeout(() => engineRef.current?.setHolding(null), HOLD_MS);
  };

  // --- seyyar satıcı (oyunun sunucu fonksiyonları) -----------------------------------------
  const vendorOf = (z) => (z?.kind === 'vendor' ? VENDOR_BY_VENUE[z.vendor] : null);
  const vendorDone = (v) => Boolean(daily?.vendorPurchases?.[v.id]) || Boolean(daily?.heist?.[v.id]);
  const vendorBuy = async (z) => {
    const v = vendorOf(z);
    if (busy) return;
    setBusy('vendor');
    try {
      await buyFromVendor(v.id);
      const npc = VENUES[z.vendor].npcs?.[0];
      if (npc) engineRef.current.npcSay(npc.id, 'Allah razı olsun!');
      flash(`🤲 Bağış yaptın · −${fmt(VENDOR_COST)} · 🕵️ −5`);
    } catch (e) {
      flash(e?.message || 'Bağış yapılamadı.');
    } finally {
      setBusy(null);
    }
  };
  const vendorMenuBuy = async (z, id, price) => {
    const v = vendorOf(z);
    if (busy) return;
    setBusy(id);
    try {
      await buyFromVendor(v.id, id);
      holdFor(id);
      setPanel(null);
      flash(`${HOUSE_PRODUCTS[id]?.emoji || ''} ${HOUSE_PRODUCTS[id]?.label} · −${fmt(price)}`);
    } catch (e) {
      flash(e?.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };
  const bufeBuy = async (it) => {
    if (busy) return;
    setBusy(it.id);
    try {
      await buyFromBufe(it.id);
      holdFor(it.id);
      setPanel(null);
      flash(`${HOUSE_PRODUCTS[it.id]?.label || it.id} · −${fmt(it.price)}`);
    } catch (e) {
      flash(e?.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };
  const shadySell = async (mode) => {
    if (busy) return;
    setBusy(mode);
    try {
      const r = await sellContrabandAtPark(mode);
      setSellResult({ ...r.data, _k: Date.now() });
    } catch (e) {
      flash(e?.message || 'Satış başarısız.');
    } finally {
      setBusy(null);
    }
  };

  // --- v147 kamera: deklanşör anı sunucuda doğrulanıp imzalanır; önizleme ve paylaşılan
  // fotoğraf aynı imzalı kareden çizilir (paylaşılan = çekilen) ---------------------------
  const [cameraShot, setCameraShot] = useState(null);
  const [camBusy, setCamBusy] = useState(false);
  const openCamera = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const st = eng.photoState();
    const at = Date.now();
    setCameraShot({ at });
    setPanel({ kind: 'camera' });
    cityAction({ op: 'photoShot', ...st })
      .then(async (d) => {
        if (!d?.att || !d.shot || !d.sig) throw new Error('Fotoğraf çekilemedi, tekrar dene.');
        const img = await renderCityPhotoUrl(d.att);
        setCameraShot((c) => (c?.at === at ? { at, img, shot: d.shot, sig: d.sig } : c));
      })
      .catch((err) => setCameraShot((c) => (c?.at === at ? { at, error: err?.message || 'Fotoğraf çekilemedi.' } : c)));
  };
  const closeCamera = () => {
    if (camBusy) return;
    setPanel(null);
    setCameraShot(null);
  };
  const shareCamera = async (overlay, { asPost = false, caption = '' } = {}) => {
    if (!cameraShot?.shot || camBusy) return;
    setCamBusy(true);
    try {
      await createSixtagramPost(asPost ? caption : '', { type: 'cityPhoto', shot: cameraShot.shot, sig: cameraShot.sig, ...(asPost ? { asPost: true } : overlay ? { overlay } : {}) });
      invalidateSixtagramFeed();
      setPanel(null);
      setCameraShot(null);
      flash(asPost ? '📸 Gönderin paylaşıldı!' : '📸 Hikâyende paylaşıldı!');
    } catch (err) {
      flash(err?.message || 'Paylaşılamadı.');
    } finally {
      setCamBusy(false);
    }
  };

  // --- v156 benzinlik: benzin (RP) + market --------------------------------------------------
  const buyFuel = async () => {
    if (fueling || busy) return;
    if (gold < FUEL_PRICE) return flash('Yetersiz altın.');
    setFueling(true);
    try {
      // pompa sesi / dolum çubuğu (1,6 sn) sunucu çağrısıyla birlikte
      await Promise.all([cityAction({ op: 'fuelBuy' }), new Promise((r) => setTimeout(r, 1600))]);
      flash(`⛽ Depo full! · −${fmt(FUEL_PRICE)}`);
    } catch (e) {
      flash(e?.message || 'Benzin alınamadı.');
    } finally {
      setFueling(false);
    }
  };
  const marketBuy = async (item) => {
    if (busy) return;
    setBusy(`m_${item}`);
    try {
      await cityAction({ op: 'marketBuy', item });
      holdFor(item);
      setPanel(null);
      engineRef.current?.npcSay?.('npc_benzinci', 'Afiyet olsun! 🙂');
      flash(`${HOUSE_PRODUCTS[item]?.emoji || ''} ${HOUSE_PRODUCTS[item]?.label} · −${fmt(GAS_MARKET_MENU[item])}`);
    } catch (e) {
      flash(e?.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };

  const sendChat = (text) => {
    if (blockProfanity(text)) return false;
    if (!netRef.current?.say(text) && !netRef.current?.isOffline()) {
      flash('Biraz yavaş 🙂');
      return false;
    }
    engineRef.current?.say(text);
    setMsgs((m) => [...m.slice(-80), { id: `me_${Date.now()}`, uid: user?.uid, name: myName, text, me: true }]);
    return true;
  };

  const driving = Boolean(hud.driving);
  const riding = Boolean(hud.riding);
  const drive = hud.drive;
  const setDrive = (p) => engineRef.current?.setDrive(p);
  const gold = player?.gold ?? 0;
  const sus = Math.round(Number(player?.suspicion || 0));
  const susCls = sus >= 60 ? 'hi' : sus >= 30 ? 'mid' : '';

  // --- etkileşim butonları -------------------------------------------------------------
  let actions = null;
  if (zone && !driving && !riding && !haracHide) {
    const list = [];
    // v154: fabrika / yarış pisti → sayfası şehrin içinde açılır (şehir kapanmaz)
    const openIn = (rid) => setPanel({ kind: 'region', region: rid });
    // v157: kapı butonları kalktı — mekânın içine yürüyerek girilir, düğmeler içeride (üstte)
    // mekân istasyonları: oyunun mekânlarında (mihrap, vezne…) oyunun panelleri; markette alışveriş
    if (zone.kind === 'station') {
      (zone.acts || []).forEach((a) => {
        if (a.act === 'market') list.push({ label: '🛒 Market', cls: 'take', on: () => setPanel({ kind: 'market' }) });
        else if (a.act === 'atm') list.push({ label: '🏧 ATM', cls: 'take', on: () => setPanel({ kind: 'phone', app: 'banka' }) });
        else if (zone.gameVenue) list.push({ label: a.label, cls: 'take', on: () => venueApiRef.current?.open(a.act) });
      });
    }
    if (zone.kind === 'vendor') {
      const v = vendorOf(zone);
      if (!vendorDone(v)) {
        list.push({ label: '🤲 Bağış yap', cls: 'take', on: () => vendorBuy(zone) });
        list.push({ label: '💰 Haraç kes', cls: 'heist', on: () => setPanel({ kind: 'heist', zone }) });
      }
      list.push({ label: '🧾 Menü', on: () => setPanel({ kind: 'menu', zone }) });
    }
    if (zone.kind === 'park' && zone.act === 'bufe') list.push({ label: '🌭 Büfe', on: () => setPanel({ kind: 'bufe' }) });
    if (zone.kind === 'park' && zone.act === 'npc') list.push({ label: '🕶️ Şüpheli adam', on: () => setPanel({ kind: 'shady' }) });
    if (zone.kind === 'pist') list.push({ label: '🏁 Yarış Pisti', cls: 'take', free: true, on: () => openIn('yaris_pisti') });
    // v154: tribünde / pitte otururken de yarışlara katılınabilsin
    if (zone.kind === 'seated' && inPist) list.push({ label: '🏁 Yarış Pisti', cls: 'take', on: () => openIn('yaris_pisti') });
    if (zone.kind === 'market') list.push({ label: '🛒 Market', cls: 'take', on: () => setPanel({ kind: 'market' }) });
    if (zone.kind === 'atm') list.push({ label: '🏧 Banka', cls: 'take', on: () => setPanel({ kind: 'phone', app: 'banka' }) });
    if (zone.kind === 'car') {
      list.push({ label: '🚗 Bin', cls: 'take', on: () => engineRef.current.enterCar() });
      list.push({ label: '🔁 Başka araba', on: () => setPanel({ kind: 'garage' }) });
      list.push({ label: '🅿️ Kaldır', on: () => engineRef.current.removeMyCar() });
    }
    if (zone.kind === 'ride') list.push({ label: '🚗 Yolcu ol', cls: 'take', on: () => rideIn(zone) });
    if (zone.kind === 'seat') list.push({ label: '🪑 Otur', cls: 'take', free: true, on: () => engineRef.current.sit(zone.seat) });
    if (zone.seatNear) list.push({ label: '🪑 Otur', cls: '', free: true, on: () => engineRef.current.sit(zone.seatNear) });
    if (zone.kind === 'seated') list.push({ label: '🧍 Kalk', free: true, on: () => engineRef.current.stand() });
    // misafir: gezmek serbest, işlem yapmak giriş ister
    if (guest) list.forEach((a) => !a.free && (a.on = () => setAskSignIn(true)));
    actions = { title: zone.title, list };
  }

  const vui = !driving && !riding ? VENUE_UI[venue] || null : null;
  const zoneName = driving ? `🚗 ${drive?.name || ''}${place ? ` · ${place}` : ''}` : riding ? '🚗 Yolcu' : venue ? VENUE_TITLE[venue] || '🏢 Mekân' : zone ? zone.title : place ? `🌲 ${place}` : '🌆 Neon Şehir';
  // v157: yol üstü istasyonları (mola, çeşme, manzara… sadece RP, para yok)
  const spotList = spot && !riding ? spot : null;
  const cardInfo = card ? namesRef.current.get(card) : null;

  return (
    <div className={`hs-root cs-root${driving ? ' driving' : ''}${heistOn ? ' cs-heist-on' : ''}${rotated ? ' cs-rotated' : ''}${landscape ? ' cs-land' : ''}`}>
      <div className="hs-stage" ref={stageRef} />
      {!ready && !fatal && (
        <div className="hs-loading cs-loading">
          <div className="hs-spinner" />
          <p>Neon Şehir…</p>
          <div className="cs-load-bar"><i style={{ width: `${Math.max(4, loadPct)}%` }} /></div>
        </div>
      )}
      {fatal && (
        <div className="hs-loading cs-loading">
          <p>Şehir açılamadı</p>
          <button className="v3-btn primary" onClick={() => { setFatal(false); setGen((g) => g + 1); }}>Tekrar dene</button>
          <button className="v3-btn" onClick={() => onClose?.()}>Ana sayfa</button>
        </div>
      )}
      {ready && (
        <>
          <div className="hs-top">
            <button className="hs-icon-btn" onClick={() => onClose?.()} title="Ana sayfa">✕</button>
            {inStadium && curMatch ? (
            <div className="cs-match-pick">
              <button onClick={() => setMatchIdx((i) => i - 1)} disabled={matches.length < 2} aria-label="Önceki maç">‹</button>
              <div className="cs-match-mid">
                <b>
                  <i style={{ background: curMatch.homeColor }} />
                  {shortTeam(curMatch.homeName)} <em>vs</em> {shortTeam(curMatch.awayName)}
                  <i style={{ background: curMatch.awayColor }} />
                </b>
                <small>
                  {curMatch.kind === 'kupa' ? '🏆 Kupa · ' : ''}
                  {curLive?.phase === 'live' && !curLive.isOver
                    ? `${curLive.homeScore}-${curLive.awayScore} · ${Math.min(90, Math.floor(curLive.elapsedMinute) + 1)}'`
                    : curLive?.phase === 'live'
                      ? `${curLive.homeScore}-${curLive.awayScore} · Maç sonu`
                      : 'Başlıyor…'}
                  {matches.length > 1 ? ` · ${(((matchIdx % matches.length) + matches.length) % matches.length) + 1}/${matches.length}` : ''}
                </small>
              </div>
              <button onClick={() => setMatchIdx((i) => i + 1)} disabled={matches.length < 2} aria-label="Sonraki maç">›</button>
            </div>
            ) : (
            <div className="hs-title">
              <b>{zoneName}</b>
              <span>
                {guest ? '👀 Misafir · gezinti' : offline ? '⚠️ çevrimdışı' : `${online + 1} kişi yakında`}
              </span>
            </div>
            )}
            <button className="hs-view-btn" onClick={toggleView} title="Görünüm">{view === '3d' ? '3D' : '2D'}</button>
            {inStadium && (
              <button className="hs-view-btn cs-futbol-btn" onClick={() => setPanel({ kind: 'futbol' })} title="Futbol">
                ⚽ Futbol
              </button>
            )}
          </div>

          {/* v151 — MESLEK: ticari araçtayken "İşe başla" / iş paneli */}
          {myVeh && !guest && (driving || jobUi?.active) && (() => {
            const J = JOBS[myVeh.job];
            const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
            const cnt = (k) => (player?.jobs?.day === today ? Number(player.jobs.n?.[k]) || 0 : 0);
            const done = cnt(myVeh.job);
            const left = Math.max(0, J.daily - done);
            // v157: tır / otobüs — yakın (şehir içi) ya da uzak (O-77 → Kervankent)
            const leftFar = J.dailyFar ? Math.max(0, J.dailyFar - cnt(`${myVeh.job}_uzak`)) : 0;
            return (
              <div className={`cs-job${jobUi?.active ? ' on' : ''}`}>
                {!jobUi?.active ? (
                  J.dailyFar ? (
                    <div className="cs-job-range">
                      <button className="cs-job-start" onClick={() => jobRef.current?.start('near')} disabled={left <= 0}>
                        <span>{J.icon} Yakın mesafe</span>
                        <small>{left > 0 ? `Şehir içi · ${left}/${J.daily}` : 'Bugünkü hak doldu'}</small>
                      </button>
                      <button className="cs-job-start far" onClick={() => jobRef.current?.start('far')} disabled={leftFar <= 0}>
                        <span>🛣️ Uzak mesafe</span>
                        <small>{leftFar > 0 ? `Kervankent · ${leftFar}/${J.dailyFar}` : 'Bugünkü hak doldu'}</small>
                      </button>
                    </div>
                  ) : (
                    <button className="cs-job-start" onClick={() => jobRef.current?.start()} disabled={left <= 0}>
                      <span>{left > 0 ? `${J.icon} İşe başla` : `${J.icon} Bugünkü hakkın doldu`}</span>
                    </button>
                  )
                ) : (
                  <div className="cs-job-panel">
                    <b>
                      {jobUi.dist != null && (
                        <span className="cs-job-arrow" style={{ transform: `rotate(${jobUi.dir}deg)` }} title={`${jobUi.dist} m`}>
                          ▲
                        </span>
                      )}
                      {jobUi.title}
                      {jobUi.dist != null && <em className="cs-job-dist">{jobUi.dist >= 1000 ? `${(jobUi.dist / 1000).toFixed(1).replace('.', ',')} km` : `${jobUi.dist} m`}</em>}
                    </b>
                    {jobUi.sub && <small>{jobUi.sub}</small>}
                    {jobUi.bar != null && (
                      <div className="cs-job-bar">
                        <i style={{ width: `${Math.min(100, Math.round(jobUi.bar * 100))}%` }} />
                      </div>
                    )}
                    <div className="cs-job-foot">
                      <span>{jobUi.left != null ? `Kalan ${jobUi.left}/${jobUi.daily}` : ''}{jobUi.hits ? ` · 💥 ${jobUi.hits}` : ''}</span>
                      <button onClick={() => jobRef.current?.stop()}>⏹ İşi bırak</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {jobPaid && (
            <div className="cs-job-paid">
              <span>{JOBS[jobPaid.job]?.icon} {JOBS[jobPaid.job]?.verb} tamam</span>
              <b>+{fmt(jobPaid.total)} <i>altın</i></b>
              <small>
                ⏱️ hız ×{jobPaid.perf?.speed} · 💥 hasar ×{jobPaid.perf?.dmg}
                {jobPaid.toDebt > 0 ? ` · ${fmt(jobPaid.toDebt)} borca` : ''}
              </small>
            </div>
          )}
          {!driving && !guest && (
            <div className="v3-menu">
              <div className={`v3-badge v3-sus ${susCls}`}>🕵️ Şüphe <b>%{sus}</b></div>
              <div className="v3-badge cs-gold"><span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> <b>{fmt(gold)}</b></div>
            </div>
          )}
          <canvas className="cs-mini" ref={miniRef} width={260} height={260} onClick={() => setMapOpen(true)} />
          {/* v157 — sol sütun: araba · hızlı koş · hareketler (v157.1: yatay mod kalktı) */}
          {!driving && !riding && (
            <div className="cs-left">
              <button className="hs-side-btn cs-carbtn" onClick={() => (guest ? setAskSignIn(true) : setPanel({ kind: 'garage' }))} title="Arabalarım">🚗</button>
              <button className={`hs-side-btn${run ? ' on' : ''}`} onClick={() => { setRun(!run); engineRef.current.setRun(!run); }} title="Hızlı koş">{run ? '🏃' : '🚶'}</button>
              <button className={`hs-side-btn${panel?.kind === 'emotes' ? ' on' : ''}`} onClick={() => setPanel(panel?.kind === 'emotes' ? null : { kind: 'emotes' })} title="Hareketler">😀</button>
              {panel?.kind === 'emotes' && (
                <div className="hs-emotes cs-emotes">
                  {EMOTES.map((e) => (
                    <button key={e.key} onClick={() => { engineRef.current.emote(e.key); setPanel(null); }}>
                      <span>{e.emoji}</span>
                      {e.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* v157 — sağ sütun: ChatsApp · telefon · kamera · yakındaki oyuncular */}
          <div className={`hs-side cs-right${driving ? ' cs-drive-side' : ''}`}>
            {!guest && <button className="hs-side-btn" onClick={() => setPanel({ kind: 'phone', app: 'chatsapp' })} title="ChatsApp">💬</button>}
            {!guest && <button className="hs-side-btn" onClick={() => setPanel({ kind: 'phone', app: null })} title="Telefon">📱</button>}
            <button className="hs-side-btn" onClick={() => (guest ? setAskSignIn(true) : openCamera())} title="Fotoğraf çek">📷</button>
            {!guest && !driving && (
              <NearbyPlayersButton
                buttonClassName="hs-side-btn"
                collectionName="city"
                others={nearby.map((id) => ({ uid: id, displayName: namesRef.current.get(id)?.n || 'Oyuncu', avatar: namesRef.current.get(id)?.a || null }))}
              />
            )}
            {driving && (
              <button className={`hs-side-btn${driveChat ? ' on' : ''}`} onClick={() => setDriveChat((v) => !v)} title="Sohbet">
                🗨️
              </button>
            )}
          </div>
          {/* v157 — mekânın içindeyken: o türdeki işletmeler (açılıp kapanan liste) + soygun */}
          {vui && (vui.biz || vui.region || vui.inCity || vui.heist) && (
            <div className="cs-venue-bar">
              {vui.biz && (
                <button className={`cs-venue-btn${bizOpen ? ' on' : ''}`} onClick={() => (guest ? setAskSignIn(true) : setBizOpen((v) => !v))}>
                  {vui.label} <i>{bizOpen ? '▲' : '▼'}</i>
                </button>
              )}
              {vui.region && (
                <button className="cs-venue-btn" onClick={() => onEnterRegion?.(vui.region)}>
                  {vui.label}
                </button>
              )}
              {vui.inCity && (
                <button className="cs-venue-btn" onClick={() => (guest ? setAskSignIn(true) : setPanel({ kind: 'region', region: vui.inCity }))}>
                  {vui.label}
                </button>
              )}
              {vui.heist && HEIST_LABELS[vui.heist] && (
                <button className="cs-venue-btn heist" onClick={() => (guest ? setAskSignIn(true) : setPanel({ kind: 'heist', target: vui.heist, title: VENUE_TITLE[venue] || '' }))}>
                  💰 Soygun yap
                </button>
              )}
            </div>
          )}
          {vui?.biz && bizOpen && !guest && (
            <div className="cs-biz-panel">
              <CityBizList
                type={vui.biz}
                onPick={(pick) => {
                  setBizOpen(false);
                  onOpenBiz?.(pick);
                }}
              />
            </div>
          )}
          {/* v157 — oyunun mekânları (camii, banka, karakol, belediye): işlemler içeride */}
          {gameVenueKey && !guest && VENUES[gameVenueKey] && (
            <div className={`cs-venue-layer${venue && VENUE_UI[venue]?.game === gameVenueKey ? '' : ' away'}`}>
              <VenueLayer
                venue={gameVenueDef}
                engineRef={venueEngRef}
                interact={zone?.kind === 'station' ? { id: zone.station } : null}
                mode={venue && VENUE_UI[venue]?.game === gameVenueKey && !driving ? 'walk' : 'away'}
                apiRef={venueApiRef}
                onOpenHeist={(t) => setPanel({ kind: 'heist', target: t, title: VENUE_TITLE[venue] || '' })}
                flash={flash}
              />
            </div>
          )}
          {spotList && spotList.length > 0 && !actions?.list?.length && (
            <div className="hs-actions">
              {spotList.map((a) => (
                <button key={a.id} className="hs-act" onClick={() => flash(engineRef.current?.spotText?.(a.id) || a.label)}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {actions && actions.list.length > 0 && (
            <div className="hs-actions">
              <div className="hs-actions-title">{actions.title}</div>
              {actions.list.map((a) => (
                <button key={a.label} className={`hs-act ${a.cls || ''}`} onClick={a.on} disabled={Boolean(busy)}>{a.label}</button>
              ))}
            </div>
          )}
          {riding && (
            <div className="hs-actions">
              <button className="hs-act" onClick={toggleCarCam}>{carCam === 'in' ? '🚗 Dış kamera' : '🎥 İç kamera'}</button>
              <button className="hs-act" onClick={rideOut}>🚪 İn</button>
            </div>
          )}
          {driving && (
            <div className="cs-drive">
              <div className="cs-drive-top">
                <button className="hs-act" onClick={() => engineRef.current.exitCar()}>🚪 İn</button>
                <button className="cs-round sm" onClick={toggleCarCam} title={carCam === 'in' ? 'Dış kamera' : 'İç kamera'}>{carCam === 'in' ? '🚗' : '🎥'}</button>
                <button className="cs-round sm" onClick={() => { const m = !muted; setMuted(m); engineRef.current.setMuted(m); }}>{muted ? '🔇' : '🔊'}</button>
                {/* v156: benzinlikte pompanın yanında — sadece RP (100 altın) */}
                {(atPump || fueling) && !guest && (
                  <button className={`hs-act cs-fuel${fueling ? ' on' : ''}`} disabled={fueling} onClick={buyFuel}>
                    {fueling ? <><i />⛽ Dolduruluyor…</> : `⛽ Benzin al · ${fmt(FUEL_PRICE)}`}
                  </button>
                )}
              </div>
              <div className="cs-steer">
                <HoldBtn className="cs-round" onHold={(on) => setDrive({ steer: on ? -1 : 0 })}>◀</HoldBtn>
                <HoldBtn className="cs-round" onHold={(on) => setDrive({ steer: on ? 1 : 0 })}>▶</HoldBtn>
              </div>
              {/* v153: iç kamerada kokpitin kendi göstergeleri var */}
              {carCam !== 'in' && <Speedo kmh={drive?.kmh || 0} gear={drive?.gear || 'N'} ratio={drive?.ratio || 0} />}
              <div className="cs-pedals">
                <button className="cs-round sm" onPointerDown={() => engineRef.current.horn()}>📯</button>
                <HoldBtn className="cs-round sm hb" onHold={(on) => setDrive({ hand: on })}>🅿️</HoldBtn>
                <HoldBtn className="cs-pedal brake" onHold={(on) => setDrive({ thr: on ? -1 : 0 })}>FREN</HoldBtn>
                <HoldBtn className="cs-pedal gas" onHold={(on) => setDrive({ thr: on ? 1 : 0 })}>GAZ</HoldBtn>
              </div>
            </div>
          )}
          {!driving && guest && (
            <div className="hs-chat">
              <div className="hs-chat-feed">
                <div className="hs-msg dim" onClick={() => setAskSignIn(true)}>👋 Diğer oyuncuları görmek ve sohbet etmek için giriş yap</div>
              </div>
            </div>
          )}
          {(!driving || driveChat) && !guest && (
            <div className={`hs-chat${chatOpen ? ' expanded' : ''}${driving ? ' cs-drive-chat' : ''}`}>
              {/* v151: diğer mekânlardaki gibi — dokununca sohbet açılır (eski mesajlar); şikâyet ⚠️ ile */}
              <div className="hs-chat-feed" onClick={() => setChatOpen((v) => !v)}>
                {(chatOpen ? msgs : msgs.slice(-3)).map((m) => (
                  <div key={m.id} className={`hs-msg${m.me ? ' me' : ''}`}>
                    <b>{m.name}:</b> {m.text}
                    {chatOpen && !m.me && (
                      <button
                        className="cs-msg-report"
                        title="Şikâyet et"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReport({ uid: m.uid, name: m.name, text: m.text });
                        }}
                      >
                        ⚠️
                      </button>
                    )}
                  </div>
                ))}
                {msgs.length === 0 && <div className="hs-msg dim">Yakındakilerle sohbet et 👋</div>}
              </div>
              <ChatBox onSend={sendChat} />
            </div>
          )}
          {toast && <div className="hs-toast">{toast}</div>}
        </>
      )}
      {panel?.kind === 'garage' && (
        <GarageSheet
          onClose={() => setPanel(null)}
          onPick={(c, v) => callCar(c, v)}
          onGallery={() => {
            setPanel(null);
            onEnterRegion?.('araba_galerisi');
          }}
        />
      )}
      {panel?.kind === 'menu' && (() => {
        const v = vendorOf(panel.zone);
        return (
          <Sheet title={`${VENUES[panel.zone.vendor].icon} ${v.name}`} onClose={() => setPanel(null)} closeLabel="Kapat">
            <div className="v3-menu-grid">
              {Object.entries(v.menu).map(([id, price]) => (
                <button key={id} className="v3-item" disabled={busy === id} onClick={() => vendorMenuBuy(panel.zone, id, price)}>
                  <HeldIcon product={id} size={40} />
                  <span>{HOUSE_PRODUCTS[id]?.label || id}</span>
                  <em><span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {fmt(price)}</em>
                </button>
              ))}
            </div>
          </Sheet>
        );
      })()}
      {panel?.kind === 'bufe' && (
        <Sheet title="🌭 Büfe" onClose={() => setPanel(null)} closeLabel="Kapat">
          <div className="v3-menu-grid">
            {BUFE_MENU.map((it) => (
              <button key={it.id} className="v3-item" disabled={busy === it.id} onClick={() => bufeBuy(it)}>
                <HeldIcon product={it.id} size={40} />
                <span>{HOUSE_PRODUCTS[it.id]?.label || it.id}</span>
                <em><span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {fmt(it.price)}</em>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {panel?.kind === 'region' && IN_CITY_REGIONS[panel.region] && (
        <div className="cs-region-sheet">
          <Sheet title={IN_CITY_REGIONS[panel.region]} onClose={() => setPanel(null)} closeLabel="Kapat">
            <Suspense fallback={<div className="cs-garage-empty">…</div>}>
              {panel.region === 'fabrika' ? (
                <FactoryScreen />
              ) : (
                <RaceTrackScreen
                  onEnterRace={(roomId, o) => {
                    setPanel(null);
                    onEnterRace?.(roomId, o);
                  }}
                />
              )}
            </Suspense>
          </Sheet>
        </div>
      )}
      {panel?.kind === 'heist' && panel.target && (() => {
        // v154: mekân soygunu (banka, casino, galeri, silahçı, fabrika, net kafe) — şehrin içinde.
        // Soygunu başlatan videoyu şehrin kendi motorunda izler (Firestore yok); bitince panele döner.
        const runCityHeist = async (fn, ctx) => {
          const eng = engineRef.current;
          setHeistOn(true);
          try {
            const res = await fn();
            const oc = heistOutcomeOf(res?.data);
            const scene = heistSceneOf(ctx?.target);
            if (!oc || !scene || !eng?.heist) return { data: res?.data, played: false };
            const car = heistCarOf(uid);
            const played = await new Promise((resolve) => {
              const ok = eng.heist.start({ target: scene, crew: ctx.crew, outcome: oc.outcome, reward: oc.amount, ...car, onDone: () => resolve(true) });
              if (!ok) resolve(false);
            });
            return { data: res?.data, played };
          } finally {
            setHeistOn(false);
          }
        };
        return (
          <div className="cs-heist-sheet">
            <Sheet title={`${panel.title} · Soygun`} onClose={() => !heistOn && setPanel(null)} closeLabel="Kapat">
              <HeistPanel target={panel.target} onRun={runCityHeist} />
            </Sheet>
          </div>
        );
      })()}
      {panel?.kind === 'heist' && panel.zone && (() => {
        const v = vendorOf(panel.zone);
        if (!v) return null;
        // v153: haraç şehirde kesilir — sistem aynı (HeistPanel), sadece animasyon eklendi
        const runHarac = async (fn) => {
          const eng = engineRef.current;
          setHaracHide(true);
          const began = Boolean(eng?.haracBegin?.(panel.zone.vendor));
          const t0 = performance.now();
          let res;
          try {
            res = await fn();
          } catch (e) {
            if (began) await eng.haracEnd({ outcome: 'cancel' });
            setHaracHide(false);
            throw e;
          }
          if (began) {
            const d = res?.data || {};
            const wait = 800 - (performance.now() - t0);
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            await eng.haracEnd({ outcome: !d.started ? 'cancel' : d.caught ? 'caught' : 'ok', reward: d.reward });
          }
          setHaracHide(false);
          return res;
        };
        return (
          <div className={`cs-heist-sheet${haracHide ? ' hide' : ''}`}>
            <Sheet title={`${VENUES[panel.zone.vendor]?.icon || '💰'} ${v.name} · Haraç`} onClose={() => !haracHide && setPanel(null)} closeLabel="Kapat">
              <HeistPanel target={v.id} onRun={runHarac} />
            </Sheet>
          </div>
        );
      })()}
      {panel?.kind === 'market' && (
        <Sheet title="🛒 Benzinlik Market" onClose={() => setPanel(null)}>
          <div className="cs-market">
            {Object.entries(GAS_MARKET_MENU).map(([id, price]) => (
              <button key={id} className="cs-market-item" disabled={Boolean(busy) || gold < price} onClick={() => marketBuy(id)}>
                <span>{HOUSE_PRODUCTS[id]?.emoji}</span>
                <b>{HOUSE_PRODUCTS[id]?.label}</b>
                <em>{busy === `m_${id}` ? '…' : `${fmt(price)} altın`}</em>
              </button>
            ))}
          </div>
          <p className="cs-market-note">Aldığın ürün 2 dakika elinde kalır; yakınındakine ısmarlayabilirsin.</p>
        </Sheet>
      )}
      {panel?.kind === 'shady' && (
        <Sheet title="🕶️ Şüpheli Adam" onClose={() => setPanel(null)}>
          <ShadyDealPanel qty={inventory?.yasakliMadde || 0} busy={busy === 'risky' || busy === 'safe' ? busy : null} onSell={shadySell} />
        </Sheet>
      )}
      <SaleToast result={sellResult} onClose={() => setSellResult(null)} />
      {panel?.kind === 'phone' && <PhoneScreen onClose={() => setPanel(null)} initialApp={panel.app} />}
      {panel?.kind === 'futbol' && (
        <div className="cs-futbol-layer">
          <Suspense fallback={<div className="hs-loading cs-loading"><div className="hs-spinner" /></div>}>
            <FutbolFullScreen onClose={() => setPanel(null)} />
          </Suspense>
        </div>
      )}
      {panel?.kind === 'camera' && cameraShot && (
        <PhotoStoryEditor img={cameraShot.img || null} loading={!cameraShot.img && !cameraShot.error} error={cameraShot.error || null} busy={camBusy} onShare={shareCamera} onClose={closeCamera} />
      )}
      {card && (
        <PlayerCard
          uid={card}
          name={cardInfo?.n}
          avatar={cardInfo?.a}
          reportItems={[{ label: 'Oyuncu', targetType: 'user', targetPath: `users/${card}` }]}
          onClose={() => setCard(null)}
        />
      )}
      {report && (
        <ReportBlockSheet
          targetUid={report.uid}
          targetName={report.name}
          items={[{ label: `"${report.text.slice(0, 40)}"`, targetType: 'user', targetPath: `users/${report.uid}`, preview: report.text }]}
          onClose={() => setReport(null)}
        />
      )}
      {askSignIn && <GuestSignInSheet onClose={() => setAskSignIn(false)} message="Misafir olarak şehri gezebilirsin — bunu yapmak için giriş yapmalısın." />}
      {mapOpen && ready && (
        <CityBigMap
          engine={engineRef.current}
          onClose={() => setMapOpen(false)}
          onPick={(p) => {
            setMapOpen(false);
            if (engineRef.current?.mapGo(p)) flash(`📍 ${p.icon && !p.glyph ? `${p.icon} ` : ''}${p.name || ''}`);
          }}
        />
      )}
    </div>
  );
}

function ChatBox({ onSend }) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    if (onSend(t) !== false) setText('');
  };
  return (
    <div className="hs-chat-row">
      <input value={text} maxLength={200} placeholder="Mesaj yaz…" enterKeyHint="send" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
      <button onClick={send} disabled={!text.trim()}>Gönder</button>
    </div>
  );
}

// v157 — büyük harita: sürükle, iki parmakla yakınlaştır, simgeye dokun → oraya git (mekânsa içine)
function CityBigMap({ engine, onClose, onPick }) {
  const ref = useRef(null);
  const view = useRef(null);
  const [tab, setTab] = useState('sehir');
  const preset = useCallback((v) => {
    const c = ref.current;
    if (!c || !engine) return;
    const W = c.clientWidth;
    const H = c.clientHeight;
    const me = engine.mapSelf();
    setTab(v);
    if (v === 'sehir') view.current = { cx: 2, cz: -22, k: Math.min(W / 380, H / 300), follow: false };
    else if (v === 'bolge') view.current = { cx: 1100, cz: -1150, k: Math.min(W / 2700, H / 2700), follow: false };
    else if (v === 'kasaba') {
      const T = engine.world().town.root.position;
      view.current = { cx: T.x, cz: T.z, k: Math.min(W / 230, H / 230), follow: false };
    } else view.current = { cx: me.x, cz: me.z, k: Math.max(view.current?.k || 1.6, 1.6), follow: true };
  }, [engine]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !engine) return undefined;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.width * d));
      c.height = Math.max(1, Math.round(r.height * d));
    };
    fit();
    const me = engine.mapSelf();
    preset(me.mode === 'hwy' ? 'bolge' : me.mode === 'town' ? 'kasaba' : 'sehir');
    let raf = 0;
    const gm = engine.map();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const v = view.current;
      if (!v) return;
      const m = engine.mapSelf();
      if (v.follow) {
        v.cx = m.x;
        v.cz = m.z;
      }
      const dpr = c.width / (c.clientWidth || 1);
      const jr = engine.jobRoutePts?.();
      const path = jr && jr.pts.length > 1 ? jr.pts.map((p) => [p.x, p.z]) : null;
      gm.draw(c.getContext('2d'), c.width, c.height, { cx: v.cx, cz: v.cz, k: v.k, rot: 0, dpr }, { truck: { x: m.x, z: m.z, yaw: m.driving ? m.yaw : m.yaw }, target: path ? { x: path[path.length - 1][0], z: path[path.length - 1][1] } : null, path, labels: true, streets: true, parked: !m.driving && m.car ? m.car : null, walker: !m.driving });
    };
    draw();
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [engine, preset]);
  // sürükle / kıstır / dokun
  const pts = useRef(new Map());
  const pinch = useRef(null);
  const down = useRef(null);
  const zoomAt = (f, sx, sy) => {
    const c = ref.current;
    const v = view.current;
    if (!c || !v) return;
    const W = c.clientWidth;
    const H = c.clientHeight;
    const wx = v.cx + (sx - W / 2) / v.k;
    const wz = v.cz + (sy - H / 2) / v.k;
    v.k = Math.max(0.12, Math.min(8, v.k * f));
    v.cx = wx - (sx - W / 2) / v.k;
    v.cz = wz - (sy - H / 2) / v.k;
  };
  const onDown = (e) => {
    ref.current.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (view.current) view.current.follow = false;
    down.current = [e.clientX, e.clientY, performance.now()];
  };
  const onMove = (e) => {
    const P = pts.current;
    if (!P.has(e.pointerId) || !view.current) return;
    const [px, py] = P.get(e.pointerId);
    P.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.size === 2) {
      const [a, b] = [...P.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch.current) {
        const r = ref.current.getBoundingClientRect();
        zoomAt(d / pinch.current, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      }
      pinch.current = d;
      return;
    }
    view.current.cx -= (e.clientX - px) / view.current.k;
    view.current.cz -= (e.clientY - py) / view.current.k;
  };
  const onUp = (e) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    const d0 = down.current;
    if (d0 && Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) < 6 && performance.now() - d0[2] < 500 && view.current) {
      const c = ref.current;
      const r = c.getBoundingClientRect();
      const dpr = c.width / (c.clientWidth || 1);
      const p = engine.map().pick({ ...view.current, rot: 0, dpr }, c.width, c.height, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
      if (p) onPick(p);
    }
    down.current = null;
  };
  const onWheel = (e) => {
    const r = ref.current.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };
  return (
    <div className="cs-bigmap2" onClick={onClose}>
      <div className="cs-bigmap2-wrap" onClick={(e) => e.stopPropagation()}>
        <canvas ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} />
        <div className="cs-bm-tabs">
          {[['sehir', 'Şehir'], ['bolge', 'Bölge'], ['kasaba', 'Kervankent'], ['ben', 'Ben']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => preset(k)}>
              {l}
            </button>
          ))}
        </div>
        <button className="cs-bm-close" onClick={onClose} aria-label="Kapat">✕</button>
        <div className="cs-bm-zoom">
          <button onClick={() => { const c = ref.current; zoomAt(1.5, c.clientWidth / 2, c.clientHeight / 2); }}>+</button>
          <button onClick={() => { const c = ref.current; zoomAt(1 / 1.5, c.clientWidth / 2, c.clientHeight / 2); }}>−</button>
        </div>
      </div>
    </div>
  );
}
