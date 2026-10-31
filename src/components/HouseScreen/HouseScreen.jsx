import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backStack';
import { presenceNow, serverNow } from '../../lib/presenceClock';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { liveReady, liveWrite, liveRemove, watchLive, mergeLive } from '../../lib/liveNet';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useHeldItem } from '../../hooks/useHeldItem';
import { houseAction, giftHeldItem, createSixtagramPost } from '../../services/gameActions';
import { createHouseEngine, EMOTES, CART_MAX } from './houseEngine';
import ItemThumb from './ItemThumb';
import { MarketShelf, SellSheet, useFurnBest, useListingWatch } from './FurnMarket'; // v132 mobilya pazarı
import { useHouseBots } from './houseBots'; // v132 botlar
import { BotWaiterButton, BotEditor } from './BotUi';
import { useHousePets } from './housePets'; // v137 ev hayvanları
import { PetEditor } from './PetUi';
import { isAnimalKey } from '../../../functions/animalData.js';
import { furnPriceBand } from '../../../functions/furnMarket.js';
import { CATALOG, CATALOG_MAP, CATEGORIES, TINTS } from './houseCatalog';
import { FLOORS, WALLS } from './houseTextures';
import { FREE_SURFACES, HOUSE_PRODUCTS, SURFACE_KEYS } from '../../../functions/houseCatalogData.js';
import { TRACKS, playTrack, stopMusic, unlockAudio, setVolume, getVolume } from './houseAudio';
import ArcadeHub from '../Arcade/ArcadeHub';
import PhoneScreen from '../Phone/PhoneScreen';
import PlayerCard from '../PlayerCard/PlayerCard';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { BizListPanel, BizSettings, BizRemovePanel } from './HouseBusiness';
import { removalBreaksBiz, parseBizError } from './houseBusinessLogic';
import { BIZ_TYPES, BIZ_TYPE_KEYS, isHomeOffice, checkBizRequirements } from '../../../functions/businessCatalogData.js';
import { houseKind, officePriceOf, ownedOfficeKeys, isOfficeFurn } from '../../../functions/officeData.js';
import OfficePanel from '../HomeOffice/OfficePanel';
import { bizErrText, materialBlockText } from '../../lib/bizErrors';
import Workshop from '../Workshop/Workshop';
import { DepoTradeSheet } from '../Depo/DepoPanels';
import { CasinoGamesSheet } from '../Casino/PlayerCasino';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import { StreamCasinoSheet } from '../Casino/StreamCasino';
import ShopShowcase from '../Shop/ShopShowcase';
import MenuPanel from '../Venue/MenuPanel';
import NetCreditRing from '../Venue/NetCreditRing';
import PianoPanel from '../Piano/PianoPanel';
import DrumPanel, { drumKey } from '../Piano/DrumPanel';
import { hitDrum } from '../../lib/songEngine';
import { claimPiano, releasePiano, watchPiano } from '../Piano/pianoNet';
import { playPianoKey } from '../Piano/pianoSynth';
import { useNetCredits, useNetOccupancy } from '../../hooks/useVenueData';
import { useMyGymMembership } from '../../hooks/useGym';
import GymPanel from '../Gym/GymPanel';
import TaskTree from '../Gym/TaskTree';
import HeldIcon from './HeldIcon';
import GymMiniGame from '../Gym/GymMiniGame';
import GymResult from '../Gym/GymResult';
import { EQUIP } from '../Gym/gymMeta';
import '../Gym/Gym.css';
import { shopAction } from '../../services/gameActions';
import { MENU_TYPES, isMenuProduct, netPriceOf, NET_DEVICE_CAP, NET_SEEN_MS } from '../../../functions/venue.js';
import '../Venue/Venue.css';
import '../Piano/Piano.css';
import '../Workshop/Workshop.css';
import './HouseScreen.css';
import { streamAction } from '../../services/gameActions';
import { StreamStartSheet, StreamHostPanel, StreamSummary, StreamPlaySheet } from '../Stream/StreamHost';
import StreamMatchView from '../Stream/StreamMatchView';
import VenueLayer from '../Venue3D/VenueLayer';
import { VENUE_BY_HOUSE, NPC_AVATARS } from '../../../functions/venueLayouts.js';
import { streamBroadcast, clearGameFrame, closeStreamChannel, streamPose, useLiveStreams, useStreamDoc, watchViewers } from '../Stream/streamShared';
import { streamPriceOf, cafeDevicePrice, isStreamSetPc } from '../../../functions/stream.js';
import { attachHScroll } from '../../lib/hscroll';
import HomeOfficeLayer from '../HomeOffice/HomeOfficeLayer';
import PhotoStoryEditor from './PhotoStoryEditor';
import { invalidateSixtagramFeed } from '../../hooks/useSixtagramFeed';
import EntranceDoorBar from './EntranceDoorPicker';
import { armStallWatchdog } from '../../hooks/useFirestoreResume';
import { doorKey, isDoorItemKey, resolveEntrance } from '../../../functions/houseDoor.js';

// =============================================================================
// HouseScreen — 3D Ev (v66, herkese açık)
//   Herkes: evde gez (3D / 2D kuş bakışı), dokunduğun yere yürü, otur, eşyalarla
//   etkileşime gir (yiyecek/içecek/silah al, atari oyna, müzik aç), hareket yap,
//   sohbet et, fotoğraf çek, telefon / ChatsApp.
//   Ev sahibi: Tasarla (Mağaza / Envanter, sepet + satın alma), Ayarlar (ad, tür),
//   odadakileri çıkarma, davet.
// =============================================================================

const PRESENCE_STALE_MS = 90_000; // v130: nabız 30 sn
const CHAT_TTL_MS = 60 * 60 * 1000; // mekân sohbet mesajları 1 saat görünür
// v77 — işletmeye girince üstte çıkan butonlar
const BIZ_TOP_BUTTONS = {
  silahci: [
    { panel: 'showcase', label: '🔫 Satılık silahlar' },
    { panel: 'workshop', label: '🛠️ Tamir / Geliştirme' },
  ],
  modifiye: [{ panel: 'workshop', label: '🛠️ Tamir / Geliştirme' }],
  galeri: [{ panel: 'showcase', label: '🚗 Satılık arabalar' }],
  cafe: [{ panel: 'menu', label: '🍽️ Menü' }],
  bar: [{ panel: 'menu', label: '🍽️ Menü' }],
  spor: [{ panel: 'gym', label: '🏋️ Spor yap (üyelik)' }],
  depo: [{ panel: 'depo', label: '💊 Yasaklı madde satın al' }], // v124
};
// v124 Faz 6 — oyuncu gazinosu: üst buton yok; oyuncu makinenin yanına gidip oynar
const CASINO_ITEM_ACTS = {
  slotm: [{ act: 'slot', label: '🎰 Slot oyna' }],
  rulet: [{ act: 'rulet', label: '🎡 Rulet oyna' }],
  kartmasa: [{ act: 'onnumara', label: '🃏 10 Numara' }],
  piyangogise: [{ act: 'piyango', label: '🎟️ Piyango bileti' }],
};
const SAVE_DEBOUNCE_MS = 1200;
const PRIVACY = [
  { key: 'public', label: '🌐 Herkese açık', hint: 'Herkes evini listede görür ve girebilir.' },
  { key: 'friends', label: '👥 Arkadaşlar', hint: 'Sadece arkadaşların girebilir.' },
  { key: 'private', label: '🔒 Gizli', hint: 'Kimse giremez (içeridekiler atılmaz, davet ettiklerin girebilir).' },
];

// v127 — MOBİLYA KASASI (Tasarım yetkisi panelinin en üstü): sahip bu mekân için
// altın / zümrüt koyar; yetkili tasarımcılar mobilya alırken buradan harcar.
// İstediği zaman bedelsiz geri alır (functions/houses.js fundMove).
function FundBox({ houseId, fund, player, flash }) {
  const [asset, setAsset] = useState('gold');
  const [amt, setAmt] = useState(0);
  const [busy, setBusy] = useState(false);
  const mine = asset === 'gold' ? Number(player?.gold || 0) : Number(player?.emerald || 0);
  const inFund = asset === 'gold' ? fund.gold : fund.gem;
  const move = async (dir) => {
    if (!amt || busy) return;
    setBusy(true);
    try {
      await houseAction({ op: 'fund', houseId, dir, [asset === 'gold' ? 'gold' : 'gem']: amt });
      flash(dir === 'in' ? '🏦 Mobilya kasasına eklendi.' : '🏦 Kasadan geri alındı.');
      setAmt(0);
    } catch (err) {
      flash(err?.message || 'Olmadı.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="hs-fund">
      <div className="hs-fund-head">
        <b>🏦 Mobilya kasası</b>
        <Money gold={fund.gold} gem={fund.gem} small />
      </div>
      <div className="hs-fund-tabs">
        <button className={asset === 'gold' ? 'on' : ''} onClick={() => { setAsset('gold'); setAmt(0); }}>Altın</button>
        <button className={asset === 'gem' ? 'on' : ''} onClick={() => { setAsset('gem'); setAmt(0); }}>Zümrüt</button>
      </div>
      <QuantityStepper value={amt} onChange={(v) => setAmt(Math.floor(v))} min={0} max={Math.max(mine, inFund)} quickAmounts={asset === 'gold' ? [1000, 10000, 100000, 1000000] : [1, 10, 100]} />
      <div className="hh-modal-row">
        <button className="hs-btn ghost" disabled={busy || !amt || amt > inFund} onClick={() => move('out')}>Geri al</button>
        <button className="hs-btn gold" disabled={busy || !amt || amt > mine} onClick={() => move('in')}>Kasaya ekle</button>
      </div>
    </div>
  );
}

export function PriceTag({ price, small }) {
  if (!price) return <span className={`hs-price free${small ? ' sm' : ''}`}>Ücretsiz</span>;
  if (price.t === 'gem')
    return (
      <span className={`hs-price gem${small ? ' sm' : ''}`}>
        <span className="emerald-icon" style={{ width: small ? 11 : 13, height: small ? 11 : 13 }} />
        {price.v.toLocaleString('tr-TR')}
      </span>
    );
  return (
    <span className={`hs-price gold${small ? ' sm' : ''}`}>
      <span className="gold-coin-icon" style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} />
      {price.v.toLocaleString('tr-TR')}
    </span>
  );
}
function Money({ gold = 0, gem = 0, small }) {
  return (
    <span className="hs-money">
      {(gold > 0 || gem === 0) && <PriceTag price={{ t: 'gold', v: gold }} small={small} />}
      {gem > 0 && <PriceTag price={{ t: 'gem', v: gem }} small={small} />}
    </span>
  );
}

// v92 — iki tasarımı karşılaştırmak için kısa imza (sıra bağımsız)
const designSig = (d) =>
  `${d?.wall}|${d?.floor}|${doorKey(d?.door)}|` +
  (d?.items || [])
    .map((it) => `${it.i}:${it.k}:${it.x}:${it.z}:${it.r || 0}:${it.c || 0}:${it.p === 1 ? 1 : 0}:${it.o === true ? 1 : it.o === false ? 0 : '-'}`)
    .sort()
    .join(',');

const ownedCount = (items) => {
  const m = {};
  (items || []).forEach((it) => {
    if (it.p === 1) m[it.k] = (m[it.k] || 0) + 1;
  });
  return m;
};

export default function HouseScreen({ houseId, onExit, onOpenHeist }) {
  if (import.meta.env?.DEV) window.__hsRenders = (window.__hsRenders || 0) + 1; // önizleme: çizim sayacı
  const { user } = useAuth();
  const { player } = usePlayer();
  const social = useSocial();
  const { isBlocked } = useBlocks();
  // v92 Faz 8 — oyunun 3D mekânı (camii, banka, gazino…) ise yapılandırması
  const venue = VENUE_BY_HOUSE[houseId] || null;
  // gazino barı / park büfesi eldeki ürünü kendi mekân adıyla yazar
  const heldVenue = venue?.key === 'gazino' ? 'gazino' : venue?.key === 'park' ? 'park' : 'ev';
  const { held, gift, clearGift } = useHeldItem(heldVenue);
  const venueApiRef = useRef(null);
  const hoApiRef = useRef(null); // v93 home ofis katmanı
  const venueNpcsRef = useRef([]);
  const itemNpcsRef = useRef([]); // v100: büfe kulübesinin içindeki büfeci (evlerde)
  const botNpcsRef = useRef([]); // v132: botlar (houseBots.js)
  const botsApiRef = useRef(null);
  const petNpcsRef = useRef([]); // v137: ev hayvanları (housePets.js)
  const petsApiRef = useRef(null);
  const itemNpcKeyRef = useRef('');
  const mountRef = useRef(null);
  const seenSelfRef = useRef(false);
  const rejoinRef = useRef(false);
  const houseDocRef = useRef(null);
  const engineRef = useRef(null);
  const [engineKey, setEngineKey] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [errMsg, setErrMsg] = useState('');
  const [info, setInfo] = useState(null);
  const [entered, setEntered] = useState(false); // sunucu girişi onayladı mı (v77: sahne öncesinden kurulur)
  const [mode, setMode] = useState('walk');
  const [view, setView] = useState('3d');
  const [freeCam, setFreeCam] = useState(false); // v92 — 2D'de kamera serbest mi
  const [streamMatch, setStreamMatch] = useState(false); // v92 — yayında maç izleme
  const [sel, setSel] = useState(null);
  const [interact, setInteract] = useState(null);
  const [tab, setTab] = useState('magaza');
  const [cat, setCat] = useState(CATEGORIES[0]?.key || 'oturma'); // v132: ilk kategori (Dükkan & Kafe)
  const [shelfOpen, setShelfOpen] = useState(true);
  const [saveState, setSaveState] = useState('saved');
  const [design, setDesign] = useState(null);
  const [houseDoc, setHouseDoc] = useState(null);
  // v92 — bu oturumda davet edilenler (butonda ✓ görünsün)
  const [invitedUids, setInvitedUids] = useState({});
  // v92 — market arabası (null = yok). Mekândan çıkınca / bırakınca içindekilerle kaybolur.
  const [myCart, setMyCart] = useState(null);
  const [inv, setInv] = useState({ items: {}, walls: [], floors: [] });
  const [online, setOnline] = useState([]);
  const onlineKeyRef = useRef('');
  const [messages, setMessages] = useState([]);
  // mekân sohbeti: 1 saatten eski mesajlar görünmez
  const [chatClock, setChatClock] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setChatClock(serverNow()), 60_000);
    return () => clearInterval(t);
  }, []);
  const liveMessages = useMemo(() => messages.filter((m) => Number(m.createdAtMs || 0) > chatClock - CHAT_TTL_MS), [messages, chatClock]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [panel, setPanel] = useState(null); // people | settings | checkout | arcade | jukebox | camera | phone | emotes
  const [phoneApp, setPhoneApp] = useState(null);
  const [panelItem, setPanelItem] = useState(null);
  // v80 — yayın
  const [streamAsk, setStreamAsk] = useState(null); // { chairId, pcId } → "Yayın aç" paneli
  const [myStream, setMyStream] = useState(null); // { id, chairId, pcId }
  // v92: yayın bitince maç ekranı da kapanır (sonraki yayında kendiliğinden açılmasın)
  if (!myStream && streamMatch) setStreamMatch(false);
  const [streamBusy, setStreamBusy] = useState(false);
  const [streamSum, setStreamSum] = useState(null); // { summary, reason, cost }
  const [playAsk, setPlayAsk] = useState(false); // v81: yayında "Oyun oyna" seçimi
  const streamCostRef = useRef({ cafe: false, play: 0 }); // v81: yayın sırasındaki internet kafe masrafı
  const lastStreamIdRef = useRef(null); // v82: yayın sonu raporunu Sixtagram'da paylaşmak için
  const [noStream, setNoStream] = useState(false);
  const [streamWarn, setStreamWarn] = useState(false);
  const [cardTarget, setCardTarget] = useState(null);
  // v93 — PC: mobilya rafı / sekmeler / renkler tekerlek ve fareyle yatay kayar
  const hsDetachRef = useRef(null);
  const hsRootRef = useCallback((el) => {
    hsDetachRef.current?.();
    hsDetachRef.current = el ? attachHScroll(el, '.hs-shelf-tabs, .hs-shelf-items, .hs-surf-row, .hs-swatches, .hs-tabs-scroll') : null;
  }, []);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ name: '', privacy: 'public' });
  const [cameraShot, setCameraShot] = useState(null);
  // v77 — işletme: kaldırma uyarısı { type, status } · İşletmeler panelinde vurgulanan tür
  const [bizRemove, setBizRemove] = useState(null);
  const [bizFlash, setBizFlash] = useState(null);
  const allowBizCloseRef = useRef(false);
  const [muted, setMuted] = useState(getVolume() === 0);
  const [showHelp, setShowHelp] = useState(() => {
    try {
      return !localStorage.getItem('hs_help_seen');
    } catch {
      return true;
    }
  });

  const pendingDesignRef = useRef(null);
  const saveTimerRef = useRef(null);
  const writeChainRef = useRef(Promise.resolve());
  const appliedFirstRef = useRef(false);
  const seenMsgRef = useRef(new Set());
  const mountedAtRef = useRef(Date.now());
  const stopStreamRef = useRef(null); // v80: yayını kapat (evden çıkarken)
  const leavingRef = useRef(false);
  const enteredRef = useRef(false);
  const lastEmoteRef = useRef({ emote: null, ts: 0 });
  const waiterLeaveRef = useRef(null); // v92 — çıkarken garsonluğu bırak
  const isOwner = !!info?.isOwner;
  // v92 — tasarım yetkisi verilmiş arkadaş (sahibin envanteriyle döşer, satın alamaz)
  const isEditor = !isOwner && Boolean(user?.uid && houseDoc?.editors?.[user.uid] === true);
  const canDesign = isOwner || isEditor;
  const canDesignRef = useRef(canDesign);
  canDesignRef.current = canDesign;
  const [realLook, setRealLook] = useState(false); // v92 — göz: denemeleri gerçek göster
  // v114 — tavan modu (Tasarla): açıkken sadece tavan eşyalarına dokunulur
  // v132 — zemin modu da var: açıkken sadece zemin parçalarına dokunulur (katman: 'ceil' | 'floor' | null)
  const [layer, setLayerState] = useState(null);
  const ceilMode = layer === 'ceil';
  const floorMode = layer === 'floor';
  const [ceilNote, setCeilNote] = useState(0); // "Tavan / Zemin modu açıldı" yazısı (anahtar)
  const layerRef = useRef(null);
  const setLayer = useCallback((l) => {
    const v = l === 'ceil' || l === 'floor' ? l : null;
    if (v && layerRef.current !== v) setCeilNote(Date.now());
    if (!v) setCeilNote(0);
    layerRef.current = v;
    setLayerState(v);
  }, []);
  const setCeil = useCallback((on) => setLayer(on ? 'ceil' : null), [setLayer]);
  // kategori / eşya → katman (Tavanlar → tavan, Zemin Parçaları → zemin, diğerleri kapalı)
  const layerOfCat = (k) => (k === 'tavan' ? 'ceil' : k === 'zemin_parca' ? 'floor' : null);
  // v101.1 — sunucudaki son duvar/zemin/kapı (her biri AYRI karşılaştırılır) ve
  // bu evde senin en son denediğin kaplamalar (motor yeniden kurulsa da kaybolmasın)
  const lastRemoteSurfRef = useRef(null);
  const localSurfRef = useRef(null);

  const flash = useCallback((t) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 2800);
  }, []);
  const exit = useCallback(
    (note) => {
      leavingRef.current = true;
      waiterLeaveRef.current?.();
      stopMusic();
      stopStreamRef.current?.('left');
      if (user) deleteDoc(doc(db, 'housePresence', user.uid)).catch(() => {});
      onExit?.(note);
    },
    [onExit, user]
  );
  // v68 — Android geri tuşu: açık panel varsa onu kapatır, yoksa evden çıkar
  useBackClose(true, () => (panel ? setPanel(null) : exit()));

  // Sunucu yazımları tek sıradan geçer (kayıt / satın alma birbirini ezmesin)
  const enqueue = useCallback((fn) => {
    const next = writeChainRef.current.then(fn, fn);
    writeChainRef.current = next.catch(() => {});
    return next;
  }, []);

  // --- 1) giriş ---------------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setErrMsg('Eve girmek için giriş yapmalısın.');
      setPhase('error');
      return undefined;
    }
    let cancelled = false;
    // v77 performans: sahne, giriş isteğinin (bulut fonksiyonu; soğuk başlangıçta
    // birkaç saniye sürebilir) dönmesini BEKLEMEDEN ev belgesinden hemen kurulur.
    // Sunucu girişi onaylayınca konum/sohbet başlar; reddederse ekrandan çıkılır.
    getDoc(doc(db, 'houses', houseId))
      .then((s) => {
        if (cancelled || !s.exists() || enteredRef.current) return;
        const h = s.data();
        const isOwnerEarly = h.ownerUid === user.uid;
        if (!isOwnerEarly && (h.privacy || 'public') !== 'public' && !h.biz?.type) return; // izin gerekiyorsa sunucuyu bekle
        if (Number(h.kicked?.[user.uid] || 0) > Date.now()) return;
        setInfo((cur) => cur || { houseId, isOwner: isOwnerEarly, name: h.name, ownerName: h.ownerName });
        setPhase((ph) => (ph === 'loading' ? 'ready' : ph));
      })
      .catch(() => {});
    // v102: geçici hatada (soğuk başlangıç, ağ) 2 kez daha dener; hemen çıkarmaz
    const TRANSIENT = ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/aborted', 'functions/unknown', 'unavailable', 'deadline-exceeded', 'internal', 'aborted', 'unknown'];
    const enterTry = (n) =>
      houseAction({ op: 'enter', houseId }).catch((err) => {
        if (cancelled || n >= 2 || !TRANSIENT.includes(err?.code)) throw err;
        return new Promise((r) => setTimeout(r, 1200 * (n + 1))).then(() => enterTry(n + 1));
      });
    enterTry(0)
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        enteredRef.current = true;
        setEntered(true);
        setInfo((cur) => (cur && cur.isOwner === !!d.isOwner ? { ...cur, name: d.name, ownerName: d.ownerName } : { houseId, isOwner: !!d.isOwner, name: d.name, ownerName: d.ownerName }));
        setPhase('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        onExit?.(err?.message || 'Eve girilemedi.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, houseId]);

  // --- 2) motor ----------------------------------------------------------------------
  const flushSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const dsg = pendingDesignRef.current;
    if (!dsg || !canDesignRef.current) return Promise.resolve();
    pendingDesignRef.current = null;
    setSaveState('saving');
    const allowBizClose = allowBizCloseRef.current;
    return enqueue(async () => {
      try {
        const res = await houseAction({ op: 'save', houseId, design: dsg, ...(allowBizClose ? { allowBizClose: true } : {}) });
        if (allowBizClose) allowBizCloseRef.current = false;
        setSaveState(pendingDesignRef.current ? 'dirty' : 'saved');
        // v92 — yetkili: sahibinin güncel envanteri
        if (res?.data?.inv) setInv({ items: res.data.inv.items || {}, walls: res.data.inv.walls || [], floors: res.data.inv.floors || [] });
        const closed = res?.data?.bizClosed;
        if (closed) flash(`${BIZ_TYPES[closed.type]?.icon || '🏪'} ${BIZ_TYPES[closed.type]?.label || 'İşletme'} kapandı; içindekiler envanterine döndü.`);
      } catch (err) {
        console.error('Ev kaydı başarısız:', err);
        allowBizCloseRef.current = false;
        const be = parseBizError(err);
        setSaveState(be ? 'saved' : 'error');
        if (be) {
          // v77: gerekli mobilya kaldırılamadı → eşya yerine döner (sunucudaki hâl)
          pendingDesignRef.current = null;
          const hd = houseDocRef.current;
          if (hd && engineRef.current) {
            engineRef.current.setDesign({ items: hd.items || [], wall: hd.wall, floor: hd.floor, door: hd.door || null }, { force: true });
            setDesign(engineRef.current.getDesign());
          }
          flash(
            be.kind === 'materials'
              ? materialBlockText(be.list)
              : be.kind === 'locked'
              ? be.people
                ? `🔒 İçeride ${be.people} müşteri var; gerekli mobilyalar şu an kaldırılamaz.`
                : '🔒 Süren bir hizmet var (üyelik / antrenman / internet süresi); gerekli mobilyalar şimdi kaldırılamaz.'
              : '🔒 Bu mobilya işletme için gerekli.'
          );
          return;
        }
        flash(err?.message || 'Kaydedilemedi.');
        // sunucu reddettiyse (örn. envanter) sunucudaki hâle dön
        appliedFirstRef.current = false;
      }
    });
  }, [enqueue, flash, houseId]);

  useEffect(() => {
    if (phase !== 'ready' || !info || !mountRef.current) return undefined;
    const eng = createHouseEngine(mountRef.current, {
      canEdit: info.isOwner || canDesignRef.current,
      selfUid: user.uid,
      onSelectionChange: setSel,
      onInteractChange: setInteract,
      onPlayerTap: (uid) => {
        // v92 Faz 8: mekân NPC'si → istasyonuna git / paneli aç.
        // v93: oyuncuya dokununca profil AÇILMAZ (profil: 👥 kişiler listesinden).
        if (String(uid).startsWith('npc_bot_')) return Boolean(botsApiRef.current?.tap(uid)); // v132
        if (String(uid).startsWith('npc_pet_')) return Boolean(petsApiRef.current?.tap(uid)); // v137
        return Boolean(String(uid).startsWith('npc_') && venueApiRef.current?.npcTap(uid));
      },
      onFreeCamChange: setFreeCam,
      onContextLost: () => {
        flash('Grafikler yeniden yükleniyor…');
        setTimeout(() => setEngineKey((k) => k + 1), 400);
      },
      onDesignChange: (dsg) => {
        setDesign(dsg);
        if (!canDesignRef.current) return;
        pendingDesignRef.current = { items: dsg.items, wall: dsg.wall, floor: dsg.floor, door: dsg.door };
        localSurfRef.current = { houseId, wall: dsg.wall, floor: dsg.floor, door: dsg.door };
        setSaveState('dirty');
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => flushSave(), SAVE_DEBOUNCE_MS);
      },
    });
    engineRef.current = eng;
    if (import.meta.env?.DEV) window.__houseEngine = eng; // sadece geliştirme/önizleme
    if (venue) {
      eng.setVenueStations(venue.stations);
      if (venue.outdoor) eng.setOutdoor(true);
    }
    eng.setMode(mode);
    eng.setView(view);
    appliedFirstRef.current = false;
    return () => {
      clearTimeout(saveTimerRef.current);
      if (pendingDesignRef.current) {
        const dsg = pendingDesignRef.current;
        pendingDesignRef.current = null;
        enqueue(() => houseAction({ op: 'save', houseId, design: dsg }).catch(() => {}));
      }
      eng.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, info?.houseId, engineKey]);

  // çıkışta presence sil + müziği durdur
  useEffect(
    () => () => {
      stopMusic();
      if (user && enteredRef.current) deleteDoc(doc(db, 'housePresence', user.uid)).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    engineRef.current?.setSelf({ uid: user?.uid, name: player?.displayName || 'Sen', avatar: player?.avatar || null });
  }, [player?.displayName, player?.avatar, user, phase, engineKey]);

  // v92 — market arabası: motora ve (diğerleri görsün diye) konum kaydına.
  // Ayrı yazılır: kurallar henüz yüklenmemişse sadece bu yazma reddedilir.
  useEffect(() => {
    engineRef.current?.setSelfCart(myCart);
    if (!user || phase !== 'ready' || !enteredRef.current) return undefined;
    const t = setTimeout(() => {
      setDoc(doc(db, 'housePresence', user.uid), { cart: myCart }, { merge: true }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [myCart, user, phase, engineKey]);

  useEffect(() => {
    engineRef.current?.setSelfHolding(held?.itemId || null);
    // süresi dolan ürünü konum kaydından da temizle (başkaları görmesin)
    if (!held && user && phase === 'ready' && enteredRef.current) {
      setDoc(doc(db, 'housePresence', user.uid), { holding: null }, { merge: true }).catch(() => {});
    }
  }, [held, user, phase, engineKey]);

  // Telefon/arkaplan açıkken 3D çizimi duraklat (pil + kasma)
  // v81: yayında yarış pisti evin üstünde açıkken de duraklat (yarışın ok tuşları
  // avatarı koltuktan kaldırıp yayını kapatmasın)
  const [raceUp, setRaceUp] = useState(false);
  useEffect(() => {
    engineRef.current?.setPaused(panel === 'phone' || panel === 'arcade' || raceUp);
  }, [panel, engineKey, raceUp]);

  // --- 3) ev belgesi ---------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const done = armStallWatchdog(); // v102: ev verisi gelmezse bağlantıyı tazele
    const unsub = onSnapshot(
      doc(db, 'houses', houseId),
      (snap) => {
        done();
        if (!snap.exists()) {
          if (!leavingRef.current) exit('Bu ev artık yok.');
          return;
        }
        const data = snap.data();
        setHouseDoc(data);
        houseDocRef.current = data;
        const eng = engineRef.current;
        if (!eng) return;
        const dsg = { items: data.items || [], wall: data.wall, floor: data.floor, door: data.door || null };
        // v101.1: kapı sırası/varsayılanı fark yaratmasın diye kanonik anahtar
        const remote = { wall: data.wall || null, floor: data.floor || null, door: doorKey(data.door) };
        const designer = info?.isOwner || data.editors?.[user?.uid] === true;
        if (!designer || !appliedFirstRef.current) {
          appliedFirstRef.current = true;
          lastRemoteSurfRef.current = remote;
          const loc = designer && localSurfRef.current?.houseId === houseId ? localSurfRef.current : null;
          // tasarımcı: denediğin (henüz alınmamış) kaplamalar yeniden kurulumda korunur
          eng.setDesign(loc ? { ...dsg, wall: loc.wall || dsg.wall, floor: loc.floor || dsg.floor, door: loc.door || dsg.door } : dsg, { force: true });
          setDesign(eng.getDesign());
        } else if (!pendingDesignRef.current && !eng.isBusy()) {
          // v92 — birlikte tasarım: yetkili/sahip başkasının değişikliğini canlı görür.
          // Kendi bekleyen değişikliğin varsa uygulanmaz (kaydın gidince eşitlenir).
          // v101.1: duvar, zemin ve kapı AYRI AYRI — sadece sunucuda gerçekten değişen
          // alınır; denediğin kaplama başka bir alanın değişmesiyle silinmez.
          const cur = eng.getDesign();
          const last = lastRemoteSurfRef.current || remote;
          lastRemoteSurfRef.current = remote;
          const next = {
            items: dsg.items,
            wall: remote.wall !== last.wall ? dsg.wall : cur.wall,
            floor: remote.floor !== last.floor ? dsg.floor : cur.floor,
            door: remote.door !== last.door ? dsg.door : cur.door,
          };
          if (designSig(next) !== designSig(cur)) {
            eng.setDesign(next);
            setDesign(eng.getDesign());
          }
        }
        eng.setMusic(data.music?.itemId || null);
      },
      (err) => {
        done();
        console.error('Ev dinleme hatası:', err);
      }
    );
    return () => {
      done();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, houseId, info?.isOwner, exit, engineKey]);

  // v92 — yetki değişince motor da güncellenir; yetkisi alınan Gez'e döner
  useEffect(() => {
    engineRef.current?.setCanEdit(canDesign);
    if (!canDesign && mode === 'build') {
      setMode('walk');
      setSel(null);
      flash('🛠️ Tasarım yetkin kaldırıldı.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDesign, engineKey]);
  useEffect(() => {
    engineRef.current?.setRealLook(realLook);
  }, [realLook, engineKey]);
  useEffect(() => {
    engineRef.current?.setCeilMode?.(ceilMode && mode === 'build');
    engineRef.current?.setFloorMode?.(floorMode && mode === 'build');
  }, [ceilMode, floorMode, mode, engineKey]);
  // v92 — yetkili: sahibin envanteri (belge sadece sahibine açık → sunucudan)
  const houseUpdatedAt = houseDoc?.updatedAtMs || 0;
  useEffect(() => {
    if (phase !== 'ready' || !isEditor || mode !== 'build') return undefined;
    let alive = true;
    const t = setTimeout(() => {
      houseAction({ op: 'editInv', houseId })
        .then((r) => alive && setInv({ items: r.data?.items || {}, walls: r.data?.walls || [], floors: r.data?.floors || [] }))
        .catch(() => {});
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [phase, isEditor, mode, houseId, houseUpdatedAt]);

  // v127 — mobilya kasası (sahip koyar, yetkili tasarımcı harcar): sahip + yetkili okur
  const [fund, setFund] = useState({ gold: 0, gem: 0 });
  useEffect(() => {
    if (phase !== 'ready' || !canDesign || houseDoc?.venue) return undefined;
    return onSnapshot(
      doc(db, 'houseFunds', houseId),
      (s) => setFund({ gold: Number(s.data()?.gold || 0), gem: Number(s.data()?.gem || 0) }),
      () => {}
    );
  }, [phase, canDesign, houseId, houseDoc?.venue]);

  // envanter (sadece sahibi)
  useEffect(() => {
    if (phase !== 'ready' || !isOwner) return undefined;
    return onSnapshot(doc(db, 'houseInventories', user.uid), (s) => {
      const d = s.exists() ? s.data() : {};
      setInv({ items: d.items || {}, walls: d.walls || [], floors: d.floors || [] });
    });
  }, [phase, isOwner, user?.uid]);

  // müzik (evdeki herkes aynı şarkıyı duyar)
  const music = houseDoc?.music || null;
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    if (music && Number.isInteger(music.track)) playTrack(music.track);
    else stopMusic();
    return undefined;
  }, [phase, music?.track, music?.atMs, music]);
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      if (music && Number.isInteger(music.track)) playTrack(music.track);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [music]);

  // --- 4) canlı oyuncular -----------------------------------------------------------
  // v79 maliyet: konumlar RTDB'den (live/house/{evId}) akar; Firestore kaydı
  // kim içeride / ad / avatar / eldeki ürün için. İkisi zamanına göre birleşir.
  const fsOthersRef = useRef([]);
  const liveMapRef = useRef({});
  const pushOthers = useCallback(() => {
    const merged = fsOthersRef.current.map((p) => mergeLive(p, liveMapRef.current[p.uid], p.updatedAt?.toMillis?.() ?? 0));
    const extra = [...venueNpcsRef.current, ...itemNpcsRef.current, ...botNpcsRef.current, ...petNpcsRef.current];
    engineRef.current?.setOthers(extra.length ? [...merged, ...extra] : merged);
  }, []);
  // v100 — eşya NPC'leri: satın alınmış her büfe kulübesinin içinde bir büfeci durur
  useEffect(() => {
    if (venue) return;
    const list = [];
    (houseDoc?.items || []).forEach((it) => {
      if (it.k !== 'bufe' || it.p !== 1) return;
      const ry = (it.r || 0) * (Math.PI / 4);
      const lz = -0.22;
      list.push({ uid: `npc_bufe_${it.i}`, displayName: 'Büfeci', avatar: NPC_AVATARS.bufeci, x: it.x + lz * Math.sin(ry), z: it.z + lz * Math.cos(ry), left: false, seat: null, holdingVisible: null });
    });
    const key = list.map((n) => `${n.uid}:${n.x.toFixed(2)}:${n.z.toFixed(2)}`).join('|');
    if (key === itemNpcKeyRef.current) return;
    itemNpcKeyRef.current = key;
    itemNpcsRef.current = list;
    pushOthers();
  }, [houseDoc?.items, venue, pushOthers]);
  // v132 — botlar (Lüks › Bot; belediyede çaycı garson)
  const botDesignItems = mode === 'build' ? design?.items || houseDoc?.items || null : null; // v132.1: Tasarla'da platformla birlikte
  const bots = useHouseBots({ engineRef, engineKey, phase, houseId, houseDoc, designItems: botDesignItems, venue, mode, isOwner, user, npcsRef: botNpcsRef, pushOthers, flash });
  botsApiRef.current = bots;
  const pets = useHousePets({ engineRef, engineKey, phase, houseDoc, designItems: botDesignItems, venue, mode, npcsRef: petNpcsRef, pushOthers });
  petsApiRef.current = pets;
  const [petEdit, setPetEdit] = useState(null); // { i, k, c }
  const [botEdit, setBotEdit] = useState(null); // { i }
  const onVenueNpcs = useCallback(
    (list) => {
      venueNpcsRef.current = list || [];
      pushOthers();
    },
    [pushOthers]
  );
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    return watchLive(`house/${houseId}`, (m) => {
      liveMapRef.current = m;
      pushOthers();
    });
  }, [phase, houseId, engineKey, pushOthers]);
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const q = query(collection(db, 'housePresence'), where('houseId', '==', houseId), limit(40));
    return onSnapshot(
      q,
      (snap) => {
        // bayatlık sunucu saatine göre (cihaz saati yanlış olan oyuncu kimseyi görmüyordu)
        const now = presenceNow(snap, user.uid);
        const list = [];
        let meThere = false;
        snap.forEach((d) => {
          const p = d.data();
          const ms = p.updatedAt?.toMillis?.() ?? now;
          if (d.id === user.uid) meThere = true;
          if (now - ms > PRESENCE_STALE_MS && d.id !== user.uid) return;
          list.push({ uid: d.id, ...p, holdingVisible: p.holding || null });
        });
        fsOthersRef.current = list.filter((p) => p.uid !== user.uid);
        pushOthers();
        // v77 performans: konumlar 3D motora doğrudan gider; ekranı (React) sadece
        // kişi listesi/isim/avatar/eldeki ürün değişince yeniden çiz
        const onlineKey = list.map((p) => `${p.uid}|${p.displayName || ''}|${p.holding || ''}|${JSON.stringify(p.avatar || null)}`).join(';');
        if (onlineKey !== onlineKeyRef.current) {
          onlineKeyRef.current = onlineKey;
          setOnline(list);
        }
        // ev sahibi beni çıkardıysa konum kaydım silinir.
        // v70: girişte ilk anlık görüntüler (önbellekten) kaydımı henüz
        // içermeyebilir → "çıkarıldın" yanlış alarmı. Kaydımı sunucudan en az
        // bir kez gördükten SONRA kaybolursa çıkarılmış sayılırım.
        if (meThere && !snap.metadata?.fromCache) seenSelfRef.current = true;
        if (!meThere && seenSelfRef.current && enteredRef.current && !leavingRef.current && !snap.metadata?.hasPendingWrites && !snap.metadata?.fromCache) {
          const kickedUntil = Number(houseDocRef.current?.kicked?.[user.uid] || 0);
          if (kickedUntil > Date.now()) {
            exit('Ev sahibi seni evden çıkardı.');
          } else if (!rejoinRef.current) {
            // kaydım başka bir sebeple düştü (ör. uygulama uzun süre arka planda kaldı) → sessizce yeniden gir
            rejoinRef.current = true;
            seenSelfRef.current = false;
            houseAction({ op: 'enter', houseId })
              .catch((err) => exit(err?.message || 'Evden ayrıldın.'))
              .finally(() => {
                rejoinRef.current = false;
              });
          }
        }
      },
      (err) => console.error('Ev presence hatası:', err)
    );
  }, [phase, houseId, user?.uid, exit, engineKey, pushOthers]);

  useEffect(() => {
    if (phase !== 'ready' || !entered) return undefined; // konum, sunucu girişi onaylayınca
    const room = `house/${houseId}`;
    let last = '';
    let lastKey = '';
    let lastFsAt = 0;
    let lastLiveAt = 0;
    let moving = false;
    const iv = setInterval(() => {
      const eng = engineRef.current;
      if (!eng || document.hidden || leavingRef.current) return;
      const st = eng.getSelfState();
      const em = lastEmoteRef.current;
      const sig = `${st.x}|${st.z}|${st.seat}|${st.left}|${em.ts}`;
      const keySig = `${st.seat}|${em.ts}`;
      const now = Date.now();
      const pos = { x: st.x, z: st.z, left: st.left, seat: st.seat, emote: em.emote, emoteTs: em.ts };
      const writeFs = () => {
        lastFsAt = now;
        setDoc(doc(db, 'housePresence', user.uid), { ...pos, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      };
      if (liveReady()) {
        // v79 — maliyet + akıcılık: yürürken konum RTDB'ye ~0,35 sn'de bir (ucuz,
        // hızlı); Firestore'a sadece oturma/hareket değişince, durunca ve 15 sn'de
        // bir nabız (sunucunun "içeride mi" kontrolleri ve fotoğraf için).
        const changed = sig !== last;
        const keyChanged = keySig !== lastKey;
        if (changed && !keyChanged && now - lastLiveAt < 350) return;
        if (changed) {
          liveWrite(room, user.uid, pos);
          lastLiveAt = now;
        }
        const stopped = moving && !changed;
        if (keyChanged || stopped || now - lastFsAt >= 30_000) writeFs(); // v130: nabız 15 → 30 sn
        moving = changed && !keyChanged;
        last = sig;
        lastKey = keySig;
        return;
      }
      // RTDB yoksa eski yol (v73): yürürken ~0,65 sn'de bir Firestore
      if (sig === last && now - lastFsAt < 30_000) return;
      if (sig !== last && keySig === lastKey && now - lastFsAt < 650) return;
      last = sig;
      lastKey = keySig;
      writeFs();
    }, 120);
    return () => {
      clearInterval(iv);
      liveRemove(room, user.uid);
    };
  }, [phase, user?.uid, entered, houseId]);

  // --- 5) sohbet -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready' || !entered) return undefined; // sohbet okuma izni girişten sonra
    const q = query(collection(db, 'houses', houseId, 'chat'), orderBy('createdAtMs', 'desc'), limit(40));
    return onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.reverse();
        setMessages(list.filter((m) => !isBlocked(m.uid)));
        setChatClock(serverNow());
        list.forEach((m) => {
          if (seenMsgRef.current.has(m.id)) return;
          seenMsgRef.current.add(m.id);
          // v86: yayıncının yayından yazdığı (viaStream) kendi mesajı zaten yerelde balon oldu
          if (m.viaStream && m.uid === user?.uid) return;
          if (m.nb) return; // v92: maç ekranından yayına yazılan — balon yok
          if ((m.createdAtMs || 0) > mountedAtRef.current - 2000 && !isBlocked(m.uid)) engineRef.current?.say(m.uid, m.text);
        });
      },
      (err) => console.error('Ev sohbet hatası:', err)
    );
  }, [phase, houseId, isBlocked, entered, user?.uid]);

  // v106: yazı kutusunun durumu ChatBox içinde — her harfte bütün mekân ekranı yeniden çizilmez
  const sendChat = async (raw) => {
    const text = String(raw || '').trim();
    if (!text || chatBusy) return false;
    setChatBusy(true);
    try {
      await houseAction({ op: 'chat', houseId, text });
      return true;
    } catch (err) {
      flash(err?.message || 'Mesaj gönderilemedi.');
      return false;
    } finally {
      setChatBusy(false);
    }
  };

  // --- etkileşimler --------------------------------------------------------------------
  const doAction = async (a) => {
    unlockAudio();
    // v93 — home ofis eşyası (bağış kutusu, mikser konsolu)
    if (a.kind === 'ho') {
      hoApiRef.current?.act(a);
      return;
    }
    // v77 Faz 4: spor salonu görevi → mini oyun
    if (a.kind === 'gym') {
      if (a.equipment === gymTaskKey) {
        setGymFree(false);
        setGymGame(a.equipment);
      }
      return;
    }
    // v77: üyeliksiz serbest çalışma (güç kazandırmaz, sosyal)
    if (a.kind === 'gymfree') {
      setGymFree(true);
      setGymGame(a.equipment);
      return;
    }
    // v124 Faz 6 — oyuncu gazinosu: mobilyadan oyun
    if (a.kind === 'casino') {
      setCasinoGame(a.act);
      setPanel('casino');
      return;
    }
    // v80 — yayın aç
    if (a.kind === 'stream') {
      if (myStream || (!isOwner && bizType !== 'internet')) return;
      setStreamAsk({ chairId: a.chairId, pcId: a.pcId });
      return;
    }
    const seatBefore = engineRef.current?.getSelfState()?.seat || null;
    const r = engineRef.current?.interact(a);
    if (!r) return;
    // v92 Faz 8 — mekân istasyonu (Mihrap, Vezne, Bar…)
    if (r.kind === 'panel' && String(r.panel).startsWith('v:')) {
      venueApiRef.current?.open(r.panel.slice(2), r.itemId);
      return;
    }
    // v77: dolu koltuk (ör. piyano) → silüet + sarsılma
    if (a.kind === 'sit' && r.kind === 'sit' && !seatBefore && !engineRef.current?.getSelfState()?.seat) {
      setSeatFull(Date.now());
      return;
    }
    // v77: cafe/bar işletmesinde yiyecek-içecek menüden (ücretli) alınır
    if (r.kind === 'take' && bizType && MENU_TYPES.includes(bizType) && !isOwner && isMenuProduct(r.product)) {
      setPanel('menu');
      return;
    }
    // v77: internet kafede cihaza dokun → öde → oyna
    if (r.kind === 'panel' && r.panel === 'arcade' && bizType === 'internet' && !isOwner) {
      await startNet(r.itemId);
      return;
    }
    if (r.kind === 'panel' && r.panel === 'piano') {
      const c = await claimPiano(houseId, { uid: user.uid, name: player?.displayName });
      if (!c.ok) {
        setSeatFull(Date.now());
        flash(`🎹 Piyano dolu — şu an ${c.holder?.name || 'başka biri'} çalıyor.`);
        return;
      }
      setPianoLocal(Boolean(c.local));
      setPanel('piano');
      return;
    }
    if (r.kind === 'panel' && r.panel === 'drums') {
      const c = await claimPiano(drumKey(houseId), { uid: user.uid, name: player?.displayName });
      if (!c.ok) {
        setSeatFull(Date.now());
        flash(`🥁 Davul dolu — şu an ${c.holder?.name || 'başka biri'} çalıyor.`);
        return;
      }
      setDrumLocal(Boolean(c.local));
      setPanel('drums');
      return;
    }
    if (r.kind === 'cart') {
      setMyCart([]);
      flash('🛒 Market arabası elinde — raftan aldıkların arabaya girer.');
      return;
    }
    if (r.kind === 'cartadd') {
      if ((myCart || []).length >= CART_MAX) {
        flash(`🛒 Araba dolu (${CART_MAX} ürün).`);
        return;
      }
      // v100: ücretli ürün arabaya eklenirken ödenir
      const cost = paidPriceOf(r.product);
      if (cost > 0) {
        try {
          await shopAction({ op: 'officeBuy', houseId, itemId: r.itemId, product: r.product, expect: cost, cart: true });
          flash(`🛒 ${HOUSE_PRODUCTS[r.product]?.label || 'Ürün'} arabada · −${cost.toLocaleString('tr-TR')} altın`);
        } catch (err) {
          flash(bizErrText(err));
          return;
        }
      }
      setMyCart((c) => [...(c || []), r.product].slice(0, CART_MAX));
      return;
    }
    if (r.kind === 'take' && paidPriceOf(r.product) > 0) {
      const cost = paidPriceOf(r.product);
      try {
        const res = await shopAction({ op: 'officeBuy', houseId, itemId: r.itemId, product: r.product, expect: cost });
        flash(`${HOUSE_PRODUCTS[r.product]?.emoji || ''} ${res.label || 'Ürün'} elinde (2 dk) · −${cost.toLocaleString('tr-TR')} altın`);
      } catch (err) {
        flash(bizErrText(err));
      }
      return;
    }
    if (r.kind === 'take') {
      try {
        const res = await houseAction({ op: 'take', houseId, itemId: r.itemId, product: r.product });
        flash(`${HOUSE_PRODUCTS[r.product]?.emoji || ''} ${res.data?.label || 'Ürün'} elinde (2 dk)`);
      } catch (err) {
        flash(err?.message || 'Alınamadı.');
      }
    } else if (r.kind === 'panel') {
      if (r.panel === 'atm') {
        // v76: ATM → telefonda Parara (banka) uygulaması açılır
        setPhoneApp('banka');
        setPanel('phone');
        return;
      }
      setPanel(r.panel === 'arcade' ? 'arcade' : 'jukebox');
      setPanelItem(r.itemId);
    }
  };
  const setTrack = async (track) => {
    unlockAudio();
    try {
      await houseAction({ op: 'music', houseId, itemId: panelItem, track });
    } catch (err) {
      flash(err?.message || 'Müzik değiştirilemedi.');
    }
  };
  const emote = (kind) => {
    engineRef.current?.emote(kind);
    lastEmoteRef.current = { emote: kind, ts: Date.now() };
    setPanel(null);
  };
  const giftTo = async (o) => {
    try {
      const r = await giftHeldItem(o.uid, heldVenue);
      flash(`🎁 ${o.displayName || 'Oyuncu'} için ${r?.label || 'ikram'} ısmarladın.`);
    } catch (err) {
      flash(err?.message || 'Ismarlanamadı.');
    }
  };
  const kick = async (o) => {
    try {
      await houseAction({ op: 'kick', houseId, uid: o.uid });
      flash(`${o.displayName || 'Oyuncu'} evden çıkarıldı.`);
    } catch (err) {
      flash(err?.message || 'Çıkarılamadı.');
    }
  };
  // v92 — arkadaşa tasarım yetkisi ver / kaldır
  const [editorBusy, setEditorBusy] = useState(null);
  const setEditor = async (uid, on, name) => {
    if (editorBusy) return;
    setEditorBusy(uid);
    try {
      await houseAction({ op: 'editor', houseId, uid, on });
      flash(on ? `🛠️ ${name || 'Oyuncu'} artık burayı düzenleyebilir (SMS gitti).` : `${name || 'Oyuncu'} için yetki kaldırıldı.`);
    } catch (err) {
      flash(err?.message || 'Olmadı.');
    } finally {
      setEditorBusy(null);
    }
  };
  const invite = async (f) => {
    if (invitedUids[f.uid] === 'busy') return;
    setInvitedUids((m) => ({ ...m, [f.uid]: 'busy' }));
    try {
      await houseAction({ op: 'invite', houseId, uid: f.uid });
      setInvitedUids((m) => ({ ...m, [f.uid]: 'ok' }));
      flash(`💌 ${f.name} davet edildi (SMS gitti).`);
    } catch (err) {
      setInvitedUids((m) => {
        const n = { ...m };
        delete n[f.uid];
        return n;
      });
      flash(err?.message || 'Davet edilemedi.');
    }
  };

  // --- mod / görünüm ---------------------------------------------------------------
  const switchMode = (m) => {
    setMode(m);
    engineRef.current?.setMode(m);
    if (m === 'walk') setSel(null);
    if (m === 'build') setPanel(null);
    // v114 — tavan modu sadece Tasarla'da; geri dönünce Tavanlar açıksa yine açık
    setLayer(m === 'build' && tab === 'magaza' ? layerOfCat(cat) : null);
  };
  // v114 — kategori değişince: Tavanlar → tavan modu açık, diğerleri → kapalı (v132: Zemin Parçaları → zemin modu)
  const pickCat = (k) => {
    setCat(k);
    setLayer(layerOfCat(k));
  };
  // v77: 3 görünüm sırayla — 3D (varsayılan) → 2D (kuş bakışı) → Göz (karakterin gözünden)
  const toggleView = () => {
    const v = view === '3d' ? '2d' : view === '2d' ? 'fp' : '3d';
    setView(v);
    engineRef.current?.setView(v);
    if (v === 'fp') flash('👁️ Göz görüşü: etrafa bakmak için ekranı kaydır, yürümek için yere dokun.');
    if (v === '2d') flash('🗺️ 2D: kaydırarak gez, iki parmakla istediğin yere yakınlaş / çevir.');
  };

  // --- sepet / envanter ------------------------------------------------------------
  const serverOwned = useMemo(() => ownedCount(houseDoc?.items), [houseDoc?.items]);
  const localOwned = useMemo(() => ownedCount(design?.items), [design?.items]);
  // v132 — odadaki pazar eşyaları: ilanları dinlenir; satılınca / iptal edilince odadan kalkar
  const marketIds = useMemo(() => (design?.items || []).filter((it) => it.p !== 1 && it.m).map((it) => it.m), [design?.items]);
  const marketWatch = useListingWatch(canDesign ? marketIds : []);
  const marketPriceRef = useRef({});
  useEffect(() => {
    const closed = Object.values(marketWatch).filter((l) => l.status && l.status !== 'open').map((l) => l.id);
    if (!closed.length || !canDesign) return;
    const n = engineRef.current?.removeMarketItems?.(closed) || 0;
    if (n) flash(`🛋️ Pazardaki ${n > 1 ? `${n} eşya` : 'eşya'} satıldı ya da kaldırıldı; odadan çıktı.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketWatch]);
  const furnBest = useFurnBest(canDesign && mode === 'build' && shelfOpen && tab === 'pazar');
  const placeFromMarket = (k, b) => {
    if ((design?.items || []).some((it) => it.m === b.id && it.p !== 1)) {
      flash('🛋️ Bu ilan zaten odanda.');
      return;
    }
    marketPriceRef.current[b.id] = { t: b.t, v: b.v };
    setLayer(layerOfCat(CATALOG_MAP[k]?.cat));
    const r = engineRef.current?.addItem(k, 0, { market: b.id });
    if (r === 'limit') flash('Eşya sınırına ulaştın (500).');
  };
  // v132 — odadaki satın alınmış eşyayı pazara koy (önce envantere döner, sonra ilan)
  const [sellAsk, setSellAsk] = useState(null); // { k }
  const [sellBusy, setSellBusy] = useState(false);
  const doSell = async (v) => {
    const eng = engineRef.current;
    if (!eng || !sellAsk || !sel || sel.k !== sellAsk.k || sel.p !== 1) {
      setSellAsk(null);
      return;
    }
    if (removalBreaksBiz(houseDoc, design?.items, sel)) {
      setSellAsk(null);
      flash('🔒 Bu mobilya işletme için gerekli.');
      return;
    }
    setSellBusy(true);
    const k = sellAsk.k;
    try {
      eng.deleteSelected();
      await flushSave();
      await enqueue(() => houseAction({ op: 'furnList', k, v }));
      setSellAsk(null);
      flash(`🏷️ ${CATALOG_MAP[k]?.name || 'Mobilya'} pazarda satışta.`);
    } catch (err) {
      const m = String(err?.message || '').match(/furn-price:(\d+):(\d+)/);
      flash(m ? `Fiyat ${m[1]} – ${m[2]} arasında olmalı.` : err?.message || 'Satışa konamadı; eşya envanterinde.');
      setSellAsk(null);
    } finally {
      setSellBusy(false);
    }
  };

  // v136 — envanter + bu evdeki satın alınmış eşya toplamı kayıt boyunca değişmez; envanter ve ev
  // anlık görüntüleri ayrı ayrı geldiği için ara anlarda yanlış sayı görünmesin diye toplam
  // kısa bir süre oturduktan sonra kabul edilir (sayı zıplaması / kart kaybolup gelmesi yok).
  const rawTotals = useMemo(() => {
    const out = {};
    new Set([...Object.keys(inv.items || {}), ...Object.keys(serverOwned)]).forEach((k) => {
      out[k] = (inv.items?.[k] || 0) + (serverOwned[k] || 0);
    });
    return out;
  }, [inv.items, serverOwned]);
  const [stableTotals, setStableTotals] = useState(null);
  const rawTotalsKey = JSON.stringify(rawTotals);
  useEffect(() => {
    const next = JSON.parse(rawTotalsKey);
    let t;
    setStableTotals((cur) => {
      if (!cur) return next;
      t = setTimeout(() => setStableTotals(next), 1500);
      return cur;
    });
    return () => clearTimeout(t);
  }, [rawTotalsKey]);
  // kartların yeri sabit: ilk görüldüğü sırada kalır
  const invOrderRef = useRef(new Map());
  const invView = useMemo(() => {
    const out = {};
    const totals = stableTotals || rawTotals;
    const keys = new Set([...Object.keys(totals), ...Object.keys(localOwned)]);
    keys.forEach((k) => {
      const n = (totals[k] || 0) - (localOwned[k] || 0);
      if (n > 0) out[k] = n;
    });
    return out;
  }, [stableTotals, rawTotals, localOwned]);
  const ownsSurface = (type, key) => FREE_SURFACES[type].includes(key) || (type === 'wall' ? inv.walls : inv.floors).includes(key);
  const cart = useMemo(() => {
    const lines = {};
    let gold = 0;
    let gem = 0;
    const add = (key, name, price) => {
      if (!price) return;
      if (!lines[key]) lines[key] = { name, price, n: 0 };
      lines[key].n += 1;
      if (price.t === 'gem') gem += price.v;
      else gold += price.v;
    };
    (design?.items || []).forEach((it) => {
      if (it.p === 1) return;
      // v132: pazardan konan eşya ilan fiyatıyla (ilan kapandıysa odadan kalkar)
      if (it.m) {
        const l = marketWatch[it.m];
        const pr = l && l.status === 'open' ? { t: l.t, v: l.v } : marketPriceRef.current[it.m];
        if (pr) add(`m:${it.m}`, `${CATALOG_MAP[it.k]?.name || it.k} (pazar)`, pr);
        return;
      }
      add(it.k, CATALOG_MAP[it.k]?.name || it.k, CATALOG_MAP[it.k]?.price);
    });
    if (design?.wall && !ownsSurface('wall', design.wall)) {
      const w = WALLS.find((x) => x.key === design.wall);
      add(`w:${design.wall}`, `Duvar: ${w?.name}`, w?.price);
    }
    if (design?.floor && !ownsSurface('floor', design.floor)) {
      const f = FLOORS.find((x) => x.key === design.floor);
      add(`f:${design.floor}`, `Zemin: ${f?.name}`, f?.price);
    }
    return { lines: Object.values(lines), gold, gem, count: Object.values(lines).reduce((a, l) => a + l.n, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, inv.walls, inv.floors, marketWatch]);

  // satın alırken kullanılacak bakiye: sahip → kendi cebi · yetkili → mobilya kasası
  const payGold = isEditor ? fund.gold : Number(player?.gold || 0);
  const payGem = isEditor ? fund.gem : Number(player?.emerald || 0);
  const doCheckout = async () => {
    const eng = engineRef.current;
    if (!eng || busy) return;
    setBusy(true);
    clearTimeout(saveTimerRef.current);
    pendingDesignRef.current = null;
    const dsg = eng.getDesign();
    try {
      const res = await enqueue(() => houseAction({ op: 'checkout', houseId, design: { items: dsg.items, wall: dsg.wall, floor: dsg.floor, door: dsg.door }, expect: { gold: cart.gold, gem: cart.gem } }));
      if (res.data?.inv) setInv(res.data.inv); // v127: yetkili — sahibin güncel envanteri
      // v132: pazar ilanı kapanmış eşyalar sunucuda alınmadı → odadan da kalkar
      const owned = { ...dsg, items: dsg.items.filter((it) => !it.m || marketWatch[it.m]?.status === 'open' || !marketWatch[it.m]).map(({ m: _m, ...it }) => ({ ...it, p: 1 })) };
      eng.deselect();
      eng.setDesign(owned);
      setDesign(eng.getDesign());
      setSaveState('saved');
      setPanel(null);
      flash(res.data?.fromFund ? `🎉 ${res.data?.count || ''} ürün mobilya kasasından alındı (${houseDoc?.ownerName || 'sahibine'} ait).` : `🎉 ${res.data?.count || ''} ürün senin! Güle güle kullan.`);
    } catch (err) {
      // v77: sepette gerekli bir işletme mobilyası eksikse (ör. geri alma ile kaldırıldı)
      flash(parseBizError(err) ? '🔒 🏪' : err?.message || 'Satın alınamadı.');
    } finally {
      setBusy(false);
    }
  };
  const cancelCart = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.removeTrials();
    if (design?.wall && !ownsSurface('wall', design.wall)) eng.setWall(houseDoc?.wall || 'boya_beyaz');
    if (design?.floor && !ownsSurface('floor', design.floor)) eng.setFloor(houseDoc?.floor || 'parke_mese');
    flash('Sepet boşaltıldı.');
  };

  // --- ayarlar -------------------------------------------------------------------------
  const openSettings = () => {
    setSettingsDraft({ name: houseDoc?.name || info?.name || '', privacy: houseDoc?.privacy || 'public' });
    // v102 — kendi ofisinde ⚙️ doğrudan ofis panelini (ad/simge, fiyatlar, rapor) açar.
    // Tür her açılışta yeniden hesaplanır: ev → ofis olunca bir sonraki açılışta değişir.
    if (isOwner && !houseDoc?.biz?.type && houseKind(houseDoc) === 'ofis') setPanel('office');
    else setPanel('settings');
  };
  const renameOffice = async (name) => {
    try {
      await houseAction({ op: 'settings', houseId, name });
      flash('Ad kaydedildi.');
    } catch (err) {
      flash(err?.message || 'Kaydedilemedi.');
    }
  };
  const saveSettings = async () => {
    setBusy(true);
    try {
      await houseAction({ op: 'settings', houseId, name: settingsDraft.name.trim(), privacy: settingsDraft.privacy });
      setPanel(null);
      flash('Ayarlar kaydedildi.');
    } catch (err) {
      flash(err?.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  // --- işletme (v77) ------------------------------------------------------------------
  const bizType = houseDoc?.biz?.type || null;
  // v124 Faz 6 — oyuncu gazinosu: hangi oyun açılsın (null = oyunlar listesi) + mobilya eylemleri
  const [casinoGame, setCasinoGame] = useState(null);
  useEffect(() => {
    engineRef.current?.setCasinoActs?.(bizType === 'gazino' && !venue ? CASINO_ITEM_ACTS : null);
  }, [bizType, venue, engineKey, phase]);
  // v100 — ofis: ücretli mobilyalar (bağış kutusu / mikser eylemleri HomeOfficeLayer'da)
  const kind = houseKind(houseDoc);
  const officeOwnedKeys = ownedOfficeKeys(houseDoc);
  const paidPriceOf = (product) => (!isOwner && !venue && houseDoc ? officePriceOf(houseDoc, product) : 0);
  // v92 — garson (cafe/bar)
  const menuVenue = Boolean(bizType && MENU_TYPES.includes(bizType));
  // v132: oyuncu garsonluğu kaldırıldı — garsonluk botlarda (useHouseBots / BotWaiter)

  // --- v80 — YAYINCILIK -----------------------------------------------------------------
  const myStreamDoc = useStreamDoc(myStream?.id || null);
  const streamStatsRef = useRef({ viewers: 0, seen: 0 });
  const streamPoseNow = useMemo(() => (myStream ? streamPose(houseDoc?.items, myStream.chairId, myStream.pcId) : null), [myStream, houseDoc?.items]);
  const cafeStreamPrice = bizType === 'internet' && !isOwner ? streamPriceOf(houseDoc) : 0;
  const streamErr = (e) => {
    const m = String(e?.message || '');
    if (m === 'gold') return '💰 Altının yetmiyor.';
    if (m === 'no-set') return '🎮 Yayın için Oyuncu Koltuğu ve yakınında Oyuncu Bilgisayarı gerekli.';
    if (m === 'seat-busy') return '🔴 Bu koltukta zaten canlı yayın var.';
    if (m === 'not-present') return 'Odada olmalısın.';
    if (m === 'not-owner') return '🔒 Sadece kendi evinde/dükkânında ya da internet kafede yayın açabilirsin.';
    if (m.startsWith('price-changed')) return `💲 Yayın seti ücreti değişti: ${Number(m.split(':')[1] || 0).toLocaleString('tr-TR')} altın/dk. Tekrar dene.`;
    return m || 'Yayın açılamadı.';
  };
  const startStream = async (title) => {
    if (!streamAsk || streamBusy) return;
    setStreamBusy(true);
    try {
      const r = await streamAction({ op: 'start', houseId, chairId: streamAsk.chairId, title, expect: cafeStreamPrice });
      streamBroadcast.uid = user.uid;
      streamBroadcast.streamId = r.streamId;
      streamCostRef.current = { cafe: cafeStreamPrice > 0, play: 0 };
      lastStreamIdRef.current = r.streamId;
      setMyStream({ id: r.streamId, chairId: streamAsk.chairId, pcId: streamAsk.pcId });
      setStreamAsk(null);
      flash(r.charged ? `🔴 Yayındasın! −${r.charged.toLocaleString('tr-TR')} altın (1 dk)` : '🔴 Yayındasın!');
    } catch (e) {
      flash(streamErr(e));
      if (String(e?.message || '').startsWith('price-changed')) setStreamAsk(null);
    } finally {
      setStreamBusy(false);
    }
  };
  const endStreamLocal = useCallback((summary, reason) => {
    if (streamBroadcast.uid) closeStreamChannel(streamBroadcast.uid);
    streamBroadcast.uid = null;
    streamBroadcast.streamId = null;
    clearGameFrame();
    setMyStream(null);
    setPlayAsk(false);
    if (summary) setStreamSum({ summary, reason, cost: { ...streamCostRef.current }, streamId: lastStreamIdRef.current });
  }, []);
  const stopStream = useCallback(
    async (reason = 'stop') => {
      const st = myStreamRef.current;
      if (!st) return;
      myStreamRef.current = null;
      setStreamBusy(true);
      // önce yerelde kapat (oyun yayını vb. hemen dursun), özet sunucudan
      clearGameFrame();
      if (streamBroadcast.uid) closeStreamChannel(streamBroadcast.uid);
      streamBroadcast.uid = null;
      try {
        const r = await streamAction({ op: 'stop', streamId: st.id, viewers: streamStatsRef.current.viewers, seen: streamStatsRef.current.seen });
        endStreamLocal(r?.summary, reason);
      } catch {
        endStreamLocal(null);
      } finally {
        setStreamBusy(false);
      }
    },
    [endStreamLocal]
  );
  const myStreamRef = useRef(null);
  myStreamRef.current = myStream;
  stopStreamRef.current = stopStream;
  // koltuktan kalkınca yayın kapanır
  useEffect(() => {
    if (!myStream) return undefined;
    const iv = setInterval(() => {
      const seat = engineRef.current?.getSelfState()?.seat || '';
      if (seat.split(':')[0] !== myStream.chairId) stopStream('stood');
    }, 500);
    return () => clearInterval(iv);
  }, [myStream, stopStream]);
  // v81 — yayın TÜM EKRANI kaplar: ana kamera yayın kamerasına geçer (izleyicinin
  // gördüğünün aynısı), evin diğer düğmeleri gizlenir (bkz. .hs-root.streaming)
  useEffect(() => {
    const eng = engineRef.current;
    if (!myStream || !streamPoseNow || !eng) return undefined;
    eng.setFixedCamera(streamPoseNow);
    return () => engineRef.current?.setFixedCamera(null);
  }, [myStream, streamPoseNow, engineKey]);
  useEffect(() => {
    if (!myStream) return undefined;
    document.body.classList.add('ns-streaming');
    const iv = setInterval(() => setRaceUp(Boolean(document.querySelector('.region-modal-backdrop, .race-fullscreen, ta-root:not(.st-race), .onnumara-fullscreen, .st-casino-sheet'))), 400);
    return () => {
      clearInterval(iv);
      setRaceUp(false);
      document.body.classList.remove('ns-streaming');
    };
  }, [myStream]);
  const playArcade = () => {
    setPlayAsk(false);
    const a = interact?.actions?.find((x) => x.kind === 'panel' && x.panel === 'arcade');
    if (a) doAction(a);
    else setPanel('arcade');
  };
  // v124 Faz 7: Casinolar — gazino seç → On Numara / Rulet / Slot (10 Numara masası App'te
  // yayının üstünde tam ekran açılır; rulet / slot yayına StreamCasinoSheet'ten gider)
  const playCasino = () => {
    setPlayAsk(false);
    setPanel('streamCasino');
  };
  const playRace = () => {
    setPlayAsk(false);
    // yarış pisti App seviyesinde açılır; yayındayken evin üstünde görünür (body.ns-streaming)
    window.dispatchEvent(new CustomEvent('ns:stream-race'));
  };
  // ekran kapanırken açık yayın kalmasın
  useEffect(() => () => stopStreamRef.current?.('left'), []);

  // odada canlı yayın var mı (başkasının) → 🔴 YAYIN VAR + girişte uyarı
  const liveAll = useLiveStreams(phase === 'ready');
  const roomStreams = useMemo(() => liveAll.filter((x) => x.houseId === houseId), [liveAll, houseId]);
  const othersLive = roomStreams.filter((x) => x.uid !== user?.uid);
  const warnedRef = useRef(false);
  useEffect(() => {
    if (phase === 'ready' && entered && othersLive.length && !warnedRef.current) {
      warnedRef.current = true;
      setStreamWarn(true);
    }
  }, [phase, entered, othersLive.length]);
  const toggleNoStream = async (v = !noStream) => {
    setNoStream(v);
    try {
      await setDoc(doc(db, 'housePresence', user.uid), { noStream: v }, { merge: true });
      flash(v ? '🙈 Yayınlarda görünmüyorsun.' : '👀 Kameranın gördüğü yerde yayında görünürsün.');
    } catch {
      setNoStream(!v);
    }
  };
  // diğer yayıncıların başında "🔴 CANLI · 👁 n"
  const [roomViewers, setRoomViewers] = useState({});
  const roomKey = othersLive.map((x) => x.id).join(',');
  useEffect(() => {
    if (!roomKey) return undefined;
    const offs = othersLive.map((x) => watchViewers(x.id, ({ count }) => setRoomViewers((v) => ({ ...v, [x.id]: count }))));
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);
  useEffect(() => {
    if (!othersLive.length) return undefined;
    const apply = () => othersLive.forEach((x) => engineRef.current?.setLiveBadge?.(x.uid, `🔴 CANLI · 👁 ${roomViewers[x.id] || 0}`));
    apply();
    const iv = setInterval(apply, 2000); // sonradan yüklenen avatarlar için
    return () => {
      clearInterval(iv);
      othersLive.forEach((x) => engineRef.current?.setLiveBadge?.(x.uid, null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, roomViewers, engineKey]);
  const bizIntent = !bizType ? houseDoc?.bizIntent || null : null;
  const intentReady = Boolean(bizIntent && checkBizRequirements(bizIntent, design?.items).ok);
  // --- v77 Faz 4: spor salonu (üyelik → 3 görev → güç) ---------------------------------
  const { active: gymMembership } = useMyGymMembership();
  const gymActive = bizType === 'spor' && gymMembership?.gymId === houseId && gymMembership.step < 3 ? gymMembership : null;
  const gymTaskKey = gymActive ? gymActive.tasks[gymActive.step] : null;
  const [gymGame, setGymGame] = useState(null);
  const [gymFree, setGymFree] = useState(false); // üyeliksiz serbest çalışma
  const [gymResult, setGymResult] = useState(null);
  useEffect(() => {
    engineRef.current?.setGymTask?.(gymTaskKey);
  }, [gymTaskKey, phase, engineKey]);
  const onGymStepDone = useCallback((r) => {
    setGymGame(null);
    setGymFree(false);
    if (r?.done) setGymResult(r);
    if (r?.free) flash(bizType === 'spor' ? '💪 Güzel çalıştın! Güç kazanmak için üyelik al.' : '💪 Güzel çalıştın!');
  }, [flash, bizType]);
  // --- v77 Faz 3: internet kafe (öde → oyna; kredi mekâna bağlı) -----------------------
  const [seatFull, setSeatFull] = useState(0);
  const netCredits = useNetCredits();
  const myNet = netCredits.find((r) => r.houseId === houseId) || null;
  const myNetRef = useRef(null);
  myNetRef.current = myNet;
  const netOcc = useNetOccupancy(houseId, bizType === 'internet');
  const netActiveRef = useRef(false);
  const netPrice = netPriceOf(houseDoc);
  // v81: yayın setindeki bilgisayar yayın seti ücretiyle (oyun da yayın da aynı fiyat)
  const devicePrice = (deviceId) => cafeDevicePrice(houseDoc, deviceId, netPrice);
  const deviceOcc = (deviceId) => {
    const t = Date.now();
    return netOcc.filter((s) => s.deviceId === deviceId && s.uid !== user?.uid && t - Number(s.lastSeenMs || 0) < NET_SEEN_MS).length;
  };
  const deviceCap = (deviceId) => NET_DEVICE_CAP[(houseDoc?.items || []).find((it) => it.i === deviceId)?.k] || 1;
  const startNet = async (deviceId) => {
    try {
      const r = await shopAction({ op: 'netStart', houseId, itemId: deviceId, expect: devicePrice(deviceId) });
      netActiveRef.current = true;
      if (r.charged && myStreamRef.current) streamCostRef.current.play += Number(r.charged) || 0;
      setPanel('arcade');
      if (r.charged) flash(`🖥️ 1 dakika başladı: −${r.charged.toLocaleString('tr-TR')} altın`);
    } catch (err) {
      const m = String(err?.message || '');
      if (m === 'device-full') {
        setSeatFull(Date.now());
        flash('🖥️ Bu cihaz dolu, başka bir cihaz dene.');
      } else if (m === 'gold') flash('💰 Altının yetmiyor.');
      else if (m.startsWith('price-changed')) flash(`💲 Dakika ücreti değişti: ${Number(m.split(':')[1] || 0).toLocaleString('tr-TR')} altın. Tekrar dene.`);
      else flash(m || 'Olmadı.');
    }
  };
  // Oyun açıkken nabız: 20 sn'de bir ya da kredi bitmek üzereyken (sunucu sadece
  // süre bitiyorsa yeni dakikayı çeker). Oyun kapanınca cihazdan kalkılır.
  useEffect(() => {
    if (panel !== 'arcade' || !netActiveRef.current) return undefined;
    let lastTick = Date.now();
    let busyTick = false;
    const iv = setInterval(async () => {
      const until = Number(myNetRef.current?.creditUntilMs || 0);
      const t = Date.now();
      if (busyTick || (until - t > 4000 && t - lastTick < 20_000)) return;
      busyTick = true;
      lastTick = t;
      try {
        const r = await shopAction({ op: 'netTick', houseId });
        if (r.stopped && r.stopped !== 'none') {
          setPanel(null);
          flash(r.stopped === 'gold' ? '💰 Altının bitti, oyun kapandı.' : '🖥️ Oyun kapandı.');
        } else if (r.charged) {
          if (myStreamRef.current) streamCostRef.current.play += Number(r.charged) || 0;
          flash(`🖥️ Yeni dakika: −${r.charged.toLocaleString('tr-TR')} altın`);
        }
      } catch {
        /* bir sonraki nabızda yeniden denenir */
      } finally {
        busyTick = false;
      }
    }, 2000);
    return () => {
      clearInterval(iv);
      if (netActiveRef.current) {
        netActiveRef.current = false;
        shopAction({ op: 'netLeave', houseId }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, houseId]);

  // --- v77 Faz 3: piyano (tek kişi çalar, herkes duyar) ---------------------------------
  const hasPiano = (houseDoc?.items || []).some((it) => it.k === 'piano' && it.p === 1);
  const [pianoPlayer, setPianoPlayer] = useState(null);
  const [pianoLocal, setPianoLocal] = useState(false);
  const [pianoMuted, setPianoMuted] = useState(() => {
    try {
      return localStorage.getItem('ns_piano_muted') === '1';
    } catch {
      return false;
    }
  });
  const pianoMutedRef = useRef(pianoMuted);
  pianoMutedRef.current = pianoMuted;
  useEffect(() => {
    if (phase !== 'ready' || !hasPiano || !user) return undefined;
    return watchPiano(houseId, ({ player: pl, note }) => {
      setPianoPlayer(pl);
      if (note && note.uid !== user.uid && !pianoMutedRef.current) playPianoKey(Number(note.k), 0.5 * (getVolume() || 0.6));
    });
  }, [phase, hasPiano, houseId, user]);
  useEffect(() => {
    if (panel === 'piano' || !user) return undefined;
    if (pianoPlayer?.uid === user.uid) releasePiano(houseId, user.uid).catch(() => {});
    return undefined;
  }, [panel, pianoPlayer?.uid, houseId, user]);
  useEffect(() => () => user && releasePiano(houseId, user.uid).catch(() => {}), [houseId, user]);
  // v99.4 — davul seti (piyano altyapısı, ayrı anahtar)
  const hasDrums = (houseDoc?.items || []).some((it) => it.k === 'drums' && it.p === 1);
  const [drumPlayer, setDrumPlayer] = useState(null);
  const [drumLocal, setDrumLocal] = useState(false);
  useEffect(() => {
    if (phase !== 'ready' || !hasDrums || !user) return undefined;
    return watchPiano(drumKey(houseId), ({ player: pl, note }) => {
      setDrumPlayer(pl);
      if (note && note.uid !== user.uid && !pianoMutedRef.current) hitDrum(Number(note.k), 0.5 * (getVolume() || 0.6));
    });
  }, [phase, hasDrums, houseId, user]);
  useEffect(() => {
    if (panel === 'drums' || !user) return undefined;
    if (drumPlayer?.uid === user.uid) releasePiano(drumKey(houseId), user.uid).catch(() => {});
    return undefined;
  }, [panel, drumPlayer?.uid, houseId, user]);
  useEffect(() => () => user && releasePiano(drumKey(houseId), user.uid).catch(() => {}), [houseId, user]);
  const toggleMute = () => {
    setPianoMuted((m) => {
      try {
        localStorage.setItem('ns_piano_muted', m ? '0' : '1');
      } catch {
        /* */
      }
      return !m;
    });
  };

  const requestDelete = async () => {
    const eng = engineRef.current;
    if (!eng || !sel) return;
    if (!removalBreaksBiz(houseDoc, design?.items, sel)) {
      eng.deleteSelected();
      return;
    }
    if (!isOwner) {
      flash('🔒 Bu mobilya işletme için gerekli; sadece işletme sahibi kaldırabilir.');
      return;
    }
    setBizRemove({ type: bizType, status: null });
    try {
      const r = await houseAction({ op: 'bizStatus', houseId });
      setBizRemove((cur) => (cur ? { ...cur, status: r.data } : cur));
    } catch (err) {
      setBizRemove(null);
      flash(err?.message || 'Olmadı.');
    }
  };
  const confirmBizRemove = async () => {
    const eng = engineRef.current;
    setBizRemove(null);
    if (!eng) return;
    allowBizCloseRef.current = true;
    eng.deleteSelected();
    await flushSave();
  };
  // v77 — "Eksikleri al": onay ekranından sonra eksikler ENVANTERE satın alınır,
  // sonra envanterdekilerle birlikte odaya yerleştirilir (yerlerini sonra değiştirebilirsin).
  const fillMissing = async (type, m) => {
    const eng = engineRef.current;
    if (!eng) return false;
    const nBuy = Object.values(m.buy).reduce((a, b) => a + b, 0);
    setBusy(true);
    try {
      if (nBuy > 0) await houseAction({ op: 'buyItems', items: m.buy, expect: { gold: m.gold, gem: m.gem } });
    } catch (err) {
      flash(err?.message === 'gold' ? 'Altının yetmiyor.' : err?.message === 'gem' ? 'Zümrütün yetmiyor.' : err?.message || 'Satın alınamadı.');
      setBusy(false);
      return false;
    }
    setBusy(false);
    switchMode('build');
    let n = 0;
    let full = false;
    const place = { ...m.place };
    Object.entries(m.buy).forEach(([k, q]) => {
      place[k] = (place[k] || 0) + q;
    });
    Object.entries(place).forEach(([k, q]) => {
      for (let i = 0; i < q; i++) {
        const r = eng.addItem(k, 0, { owned: true });
        if (r === 'limit') full = true;
        else if (r) n += 1;
      }
    });
    eng.deselect?.();
    setPanel(null);
    if (full) flash('🪑 Odadaki eşya sınırı doldu; kalanlar envanterinde.');
    else flash(`✓ ${n} mobilya odaya kondu. İstersen yerlerini değiştir, sonra ⚙️ Ayarlar › ${BIZ_TYPES[type].ho ? 'Home Ofisler' : 'İşletmeler'} › "${BIZ_TYPES[type].label} aç".`);
    return true;
  };
  const openBiz = async (type) => {
    setBusy(true);
    try {
      await flushSave();
      await houseAction({ op: 'bizOpen', houseId, type });
      setPanel(null);
      flash(`${BIZ_TYPES[type].icon} ${BIZ_TYPES[type].label} açıldı! Fiyatları ⚙️ Ayarlar'dan belirleyebilirsin.`);
    } catch (err) {
      if (parseBizError(err)) {
        setBizFlash(type);
        setTimeout(() => setBizFlash(null), 1200);
      } else flash(err?.message || 'Açılamadı.');
    } finally {
      setBusy(false);
    }
  };
  const closeBiz = async () => {
    setBusy(true);
    try {
      await houseAction({ op: 'bizClose', houseId });
      flash('🏠 İşletme kapandı, burası yeniden ev.');
    } catch (err) {
      const be = parseBizError(err);
      if (be?.kind === 'locked') {
        setBizFlash(bizType);
        setTimeout(() => setBizFlash(null), 1200);
        flash(be.people ? `🔒 İçeride ${be.people} müşteri var, şu an kapatamazsın.` : '🔒 Süren bir hizmet var (üyelik / antrenman / internet süresi), şu an kapatamazsın.');
      } else flash(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };

  // --- kamera ------------------------------------------------------------------------
  // v135 — fotoğraf telefon ekranı gibi DİKEY çekilir ve HİKÂYE olarak paylaşılır.
  // Deklanşöre basınca sunucu o anki sahneyi (tasarım + kişiler + kamera) imzalı bir
  // ek olarak döndürür; önizleme bu ekten çizilir → paylaşılan = görülen.
  const openCamera = () => {
    const eng = engineRef.current;
    const pose = eng?.getCameraPose() || null;
    const people = eng?.getPeopleState?.() || [];
    const at = Date.now();
    setCameraShot({ loading: true, at });
    setPanel('camera');
    const fade = eng?.getFadedIds?.() || [];
    houseAction({ op: 'photoShot', houseId, people, cam: pose, vert: true, fade })
      .then(async (r) => {
        const d = r?.data || r || null;
        if (!d?.att || !d?.shot || !d?.sig) throw new Error('Fotoğraf çekilemedi, tekrar dene.');
        const { renderHousePhotoUrl } = await import('./HousePhoto');
        const img = await renderHousePhotoUrl(d.att);
        setCameraShot((c) => (c?.at === at ? { at, img, shot: d.shot, sig: d.sig } : c));
      })
      .catch((err) => setCameraShot((c) => (c?.at === at ? { at, error: err?.message || 'Fotoğraf çekilemedi.' } : c)));
  };
  // v136 — Hikâye (dikey, yazı/çizimli) ya da Gönderi (kare, açıklamalı)
  const shareCamera = async (overlay, { asPost = false, caption = '' } = {}) => {
    if (!cameraShot?.shot) return;
    setBusy(true);
    try {
      await createSixtagramPost(asPost ? caption : '', { type: 'housePhoto', houseId, shot: cameraShot.shot, sig: cameraShot.sig, ...(asPost ? { asPost: true } : overlay ? { overlay } : {}) });
      invalidateSixtagramFeed();
      setPanel(null);
      setCameraShot(null);
      flash(asPost ? '📸 Gönderin paylaşıldı!' : '📸 Hikâyende paylaşıldı!');
    } catch (err) {
      flash(err?.message || 'Paylaşılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const shelfItems = useMemo(() => CATALOG.filter((d) => d.cat === cat && !d.venueOnly), [cat]);
  const invList = useMemo(() => {
    const ord = invOrderRef.current;
    Object.keys(invView).forEach((k) => {
      if (!ord.has(k)) ord.set(k, ord.size);
    });
    return Object.entries(invView)
      .map(([k, n]) => ({ def: CATALOG_MAP[k], n }))
      .filter((x) => x.def)
      .sort((a, b) => ord.get(a.def.k) - ord.get(b.def.k));
  }, [invView]);
  const others = online.filter((o) => o.uid !== user?.uid);
  const houseName = houseDoc?.name || info?.name || 'Ev';
  const myHolding = held?.itemId || null;

  if (phase === 'error') {
    return (
      <div className="hs-root">
        <div className="hs-loading">
          <p>⚠️ {errMsg}</p>
          <button className="hs-btn" onClick={() => onExit?.()}>Kapat</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={hsRootRef} className={`hs-root${myStream ? ' streaming' : ''}`} onPointerDown={() => unlockAudio()}>
      <div ref={mountRef} className="hs-stage" key={engineKey} />

      {phase === 'loading' && (
        <div className="hs-loading">
          <div className="hs-spinner" />
          <p>{venue ? `${venue.name} — giriliyor…` : 'Eve giriliyor…'}</p>
        </div>
      )}

      {phase === 'ready' && (
        <>
          {/* ÜST ÇUBUK */}
          <div className="hs-top">
            <button className="hs-icon-btn" onClick={() => exit()} title="Evden çık">✕</button>
            <div className="hs-title">
              <b>{venue ? venue.icon : bizType ? BIZ_TYPES[bizType].icon : kind === 'ofis' ? houseDoc?.office?.emoji || '🏢' : kind === 'depo' ? '📦' : '🏠'} {venue ? venue.name : houseName}</b>
              <span>
                {online.length} kişi {venue || bizType ? 'burada' : 'evde'}
                {canDesign && mode === 'build' && (
                  <em className={`hs-save ${saveState}`}>
                    {saveState === 'saved' ? '✓ Kaydedildi' : saveState === 'saving' ? 'Kaydediliyor…' : saveState === 'error' ? '⚠ Kaydedilemedi' : '• Değişiklik var'}
                  </em>
                )}
              </span>
            </div>
            <NetCreditRing houseId={houseId} />
            {othersLive.length > 0 && (
              <button className={`st-room-badge${noStream ? ' off' : ''}`} onClick={() => setStreamWarn(true)} title="Bu odada canlı yayın var">
                {noStream ? '🙈 Yayında değilsin' : '🔴 YAYIN VAR'}
              </button>
            )}
            {mode === 'walk' && (
              <button className="hs-view-btn" onClick={toggleView} title="Görünümü değiştir">
                {view === '3d' ? '3D' : view === '2d' ? '2D' : '👁️ Göz'}
              </button>
            )}
            {mode === 'walk' && view === '2d' && freeCam && (
              <button className="hs-view-btn" onClick={() => engineRef.current?.recenter()} title="Kamerayı bana döndür">
                🎯
              </button>
            )}
            {canDesign && (
              <div className="hs-seg">
                <button className={mode === 'build' ? 'on' : ''} onClick={() => switchMode('build')}><i className="hs-ico">🛠️ </i>Tasarla</button>
                <button className={mode === 'walk' ? 'on' : ''} onClick={() => switchMode('walk')}><i className="hs-ico">🚶 </i>Gez</button>
              </div>
            )}
            {isOwner && (
              <button className={`hs-icon-btn${intentReady ? ' cue-pulse' : ''}${houseDoc?.bizShortagePending ? ' hb-dot' : ''}`} onClick={openSettings} title="Ayarlar">⚙️</button>
            )}
          </div>
          {/* v92 — GÖZ: satın alınmamış (deneme) eşyaları gerçek haliyle gör (sadece sen; Tasarla'da) */}
          {canDesign && mode === 'build' && (
            <button
              className={`hs-eye-btn${realLook ? ' on' : ''}${isOwner ? '' : ' solo'}`}
              onClick={() => {
                setRealLook((v) => !v);
                flash(realLook ? '👁️ Deneme eşyalar yine saydam.' : '👁️ Deneme eşyaları gerçek haliyle görüyorsun (ziyaretçiler saydam görür).');
              }}
              title="Satın alınmamış eşyaları gerçek haliyle gör"
              aria-pressed={realLook}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3.2" fill={realLook ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
                {!realLook && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
              </svg>
            </button>
          )}
          {/* v114 — TAVAN MODU: tavan eşyalarını seç/taşı (göz butonunun yanında) */}
          {canDesign && mode === 'build' && (
            <button
              className={`hs-eye-btn hs-ceil-btn${ceilMode ? ' on' : ''}`}
              onClick={() => setCeil(!ceilMode)}
              title="Tavan modu: tavan eşyalarını düzenle"
              aria-pressed={ceilMode}
            >
              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                <path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4z" fill="currentColor" fillOpacity={ceilMode ? 0.22 : 0.08} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M3.5 16.6 12 12M20.5 16.6 12 12M12 2.8V12" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" strokeDasharray="1.6 1.6" />
              </svg>
            </button>
          )}
          {/* v132 — ZEMİN MODU: zemin parçalarını seç/taşı (tavan modunun altında) */}
          {canDesign && mode === 'build' && (
            <button
              className={`hs-eye-btn hs-floor-btn${floorMode ? ' on' : ''}`}
              onClick={() => setLayer(floorMode ? null : 'floor')}
              title="Zemin modu: zemin parçalarını düzenle"
              aria-pressed={floorMode}
            >
              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                <path d="M12 7.2 21 12l-9 4.8L3 12z" fill="currentColor" fillOpacity={floorMode ? 0.28 : 0.1} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M7.5 9.6 16.5 14.4M16.5 9.6 7.5 14.4" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.55" />
              </svg>
            </button>
          )}
          {ceilNote > 0 && layer && mode === 'build' && <CeilNote key={ceilNote} floor={floorMode} onDone={() => setCeilNote(0)} />}

          {/* v92 Faz 8 — oyunun 3D mekânı: menü, NPC'ler, istasyon panelleri */}
          {venue && (
            <VenueLayer
              venue={venue}
              engineRef={engineRef}
              interact={interact}
              mode={mode}
              apiRef={venueApiRef}
              onNpcs={onVenueNpcs}
              onOpenHeist={onOpenHeist}
              flash={flash}
            />
          )}
          {/* v100 — OFİS katmanı (bağış kutusu / mikser konsolu) — her evde */}
          {!venue && houseDoc && (
            <HomeOfficeLayer apiRef={hoApiRef} houseId={houseId} houseDoc={houseDoc} isOwner={isOwner} engineRef={engineRef} engineKey={engineKey} online={online} flash={flash} />
          )}
          {/* v77 — MEKÂN ÜST BUTONLARI (işletme türüne göre) */}
          {/* cafe/bar: garson varsa menü butonu yok (garson aynı işi görür); yoksa menü solda */}
          {bizType && mode === 'walk' && BIZ_TOP_BUTTONS[bizType] && !(MENU_TYPES.includes(bizType) && bots.waiterReady) && (
            <div className={`hb-topbtns${MENU_TYPES.includes(bizType) ? ' left' : ''}`}>
              {BIZ_TOP_BUTTONS[bizType].map((b) => (
                <button key={b.panel} className="hb-topbtn" onClick={() => (b.panel.startsWith('ho:') ? hoApiRef.current?.open(b.panel.slice(3)) : setPanel(b.panel))}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
          {/* v132 — GARSON BOT (sol üst): içeride garson bot + yiyecek/içecek varsa sipariş */}
          {bots.waiterReady && mode === 'walk' && <BotWaiterButton bots={bots} />}
          {panel === 'workshop' && bizType && (
            <div className="wk-sheet-bg" onClick={() => setPanel(null)}>
              <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
                <Workshop
                  shop={{ kind: 'player', type: bizType, houseId, houseDoc }}
                  onClose={() => setPanel(null)}
                />
              </div>
            </div>
          )}
          {panel === 'menu' && bizType && (
            <div className="wk-sheet-bg" onClick={() => setPanel(null)}>
              <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
                <MenuPanel
                  houseId={houseId}
                  houseDoc={houseDoc}
                  onClose={() => setPanel(null)}
                  onBought={(r) => {
                    setPanel(null);
                    if (r.queued) {
                      // v92 — sipariş garsona gitti; süre dolarsa müşteri tarafı da süpürür
                      flash(`🧑‍🍳 Siparişin garson ${r.waiterName}'a iletildi (${HOUSE_PRODUCTS[r.product]?.emoji || ''} ${r.label}) · en geç 20 sn`);
                      const wait = Math.max(0, Number(r.deadlineMs || 0) - Date.now()) + 1800;
                      setTimeout(() => shopAction({ op: 'orderSweep', houseId }).catch(() => {}), wait);
                      return;
                    }
                    flash(`${HOUSE_PRODUCTS[r.product]?.emoji || ''} ${r.label}${r.price ? ` −${r.price.toLocaleString('tr-TR')}` : ''}`);
                  }}
                />
              </div>
            </div>
          )}
          {panel === 'casino' && bizType === 'gazino' && (
            <div className="wk-sheet-bg" onClick={() => setPanel(null)}>
              <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
                <CasinoGamesSheet key={casinoGame || 'menu'} casinoId={houseId} houseDoc={houseDoc} initialGame={casinoGame} onClose={() => setPanel(null)} />
              </div>
            </div>
          )}
          {panel === 'depo' && bizType === 'depo' && (
            <div className="wk-sheet-bg" onClick={() => setPanel(null)}>
              <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
                <DepoTradeSheet depotId={houseId} houseDoc={houseDoc} onClose={() => setPanel(null)} />
              </div>
            </div>
          )}
          {panel === 'gym' && bizType === 'spor' && (
            <div className="wk-sheet-bg" onClick={() => setPanel(null)}>
              <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
                <GymPanel houseId={houseId} houseDoc={houseDoc} onClose={() => setPanel(null)} onStarted={() => setPanel(null)} />
              </div>
            </div>
          )}
          {gymActive && mode === 'walk' && !gymGame && (
            <TaskTree membership={gymActive} onTapCurrent={(k) => engineRef.current?.approachNearest?.(k)} />
          )}
          {gymGame && (
            <div className="wk-sheet-bg">
              <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
                <GymMiniGame key={`${gymGame}${gymFree ? 'f' : ''}`} equipment={gymGame} free={gymFree} onDone={onGymStepDone} onClose={() => setGymGame(null)} />
              </div>
            </div>
          )}
          {gymResult && <GymResult result={gymResult} onClose={() => setGymResult(null)} />}
          {panel === 'piano' && user && <PianoPanel houseId={houseId} local={pianoLocal} me={{ uid: user.uid, name: player?.displayName }} onClose={() => setPanel(null)} />}
          {panel === 'drums' && user && <DrumPanel houseId={houseId} local={drumLocal} me={{ uid: user.uid, name: player?.displayName }} onClose={() => setPanel(null)} />}
          {hasDrums && drumPlayer && drumPlayer.uid !== user?.uid && mode === 'walk' && !(hasPiano && pianoPlayer && pianoPlayer.uid !== user?.uid) && (
            <div className="pn-listen">
              <span className="pn-notes">🥁 ♪</span>
              <b>{drumPlayer.name} davul çalıyor</b>
              <button onClick={toggleMute} title={pianoMuted ? 'Sesi aç' : 'Sessize al'}>
                {pianoMuted ? '🔇 Sesi aç' : '🔊 Sessize al'}
              </button>
            </div>
          )}
          {hasPiano && pianoPlayer && pianoPlayer.uid !== user?.uid && mode === 'walk' && (
            <div className="pn-listen">
              <span className="pn-notes">🎹 ♪</span>
              <b>{pianoPlayer.name} piyano çalıyor</b>
              <button onClick={toggleMute} title={pianoMuted ? 'Sesi aç' : 'Sessize al'}>
                {pianoMuted ? '🔇 Sesi aç' : '🔊 Sessize al'}
              </button>
            </div>
          )}
          {seatFull > 0 && Date.now() - seatFull < 1500 && (
            <div className="hb-seatfull cue-shake" key={seatFull}>
              👤 Dolu
            </div>
          )}
          {panel === 'showcase' && bizType && (
            <div className="wk-sheet-bg" onClick={() => setPanel(null)}>
              <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
                <ShopShowcase houseId={houseId} kind={bizType === 'galeri' ? 'vehicle' : 'weapon'} onClose={() => setPanel(null)} />
              </div>
            </div>
          )}

          {/* TASARIM: bakiye + sepet */}
          {canDesign && mode === 'build' && !houseDoc?.venue && (
            <div className="hs-cartbar">
              <div className="hs-balance">
                <span>{isEditor ? '🏦 Mobilya kasası' : 'Bakiye'}</span>
                <Money gold={payGold} gem={payGem} small />
                {payGem === 0 && <PriceTag price={{ t: 'gem', v: 0 }} small />}
              </div>
              {cart.count > 0 && (
                <div className="hs-cart">
                  <span className="hs-cart-label">🛒 Sepet ({cart.count})</span>
                  <Money gold={cart.gold} gem={cart.gem} small />
                  <div className="hs-cart-actions">
                    <button className="ghost" onClick={cancelCart}>İptal</button>
                    <button className="go" onClick={() => setPanel('checkout')}>Alışverişi Tamamla</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isEditor && mode === 'build' && (
            <div className="hs-editor-note">🛠️ Tasarım yetkin var · alışveriş <b>{houseDoc?.ownerName || 'ev sahibinin'}</b> mobilya kasasından yapılır, eşyalar ona aittir.</div>
          )}

          {canDesign && mode === 'build' && showHelp && (
            <div
              className="hs-help"
              onClick={() => {
                setShowHelp(false);
                try {
                  localStorage.setItem('hs_help_seen', '1');
                } catch {
                  /* */
                }
              }}
            >
              <b>Nasıl tasarlanır?</b>
              <span><b>Mağaza</b>'dan ürün seç → odaya <b>deneme</b> olarak gelir (yarı saydam). Beğendiklerini sepetten satın al.</span>
              <span>Önce eşyaya <b>dokun</b>: seç (döndür, renk, kaldır) · sonra <b>seçili eşyayı sürükle</b>: taşı. Kaldırdığın satın alınmış eşya <b>Envanter</b>'e gider.</span>
              <span>Boş alanı ya da seçili olmayan eşyayı sürükle: kamerayı çevir · İki parmak: yakınlaş/kaydır.</span>
              <i>Kapatmak için dokun</i>
            </div>
          )}

          {/* SEÇİLİ EŞYA */}
          {canDesign && mode === 'build' && sel && (
            <div className="hs-selbar">
              <div className="hs-selbar-head">
                <b>{sel.def?.name}</b>
                {sel.p === 1 ? <span className="hs-owned-badge">{isOwner ? '✓ Senin' : '✓ Satın alınmış'}</span> : <span className="hs-trial-badge">Deneme</span>}
                {sel.p !== 1 && <PriceTag price={sel.def?.price} small />}
                <button className="hs-x" onClick={() => engineRef.current?.deselect()}>✕</button>
              </div>
              {sel.def?.tints && (
                <div className="hs-swatches">
                  {TINTS[sel.def.tints].map((t, i) => (
                    <button key={t.n} className={`hs-sw${(sel.c || 0) === i ? ' on' : ''}`} style={{ background: t.sw || t.c }} title={t.n} onClick={() => engineRef.current?.tintSelected(i)} />
                  ))}
                </div>
              )}
              <div className="hs-selbar-actions">
                {!sel.def?.wall && !sel.def?.tile && <button onClick={() => engineRef.current?.rotateSelected(-1)}>↺</button>}
                {!sel.def?.wall && !sel.def?.tile && <button onClick={() => engineRef.current?.rotateSelected(1)}>↻</button>}
                {/* v92 — parça zemin / duvar paneli: yanına bir parça daha (yön okları) */}
                {sel.def?.tile ? (
                  <span className="hs-tile-dirs" title="Yanına bir parça daha ekle">
                    <button onClick={() => engineRef.current?.duplicateSelected('l', invView[sel.k] > 0)} aria-label="Sola ekle">◀</button>
                    {sel.def.tile !== 'wall' && <button onClick={() => engineRef.current?.duplicateSelected('u', invView[sel.k] > 0)} aria-label="İleri ekle">▲</button>}
                    {sel.def.tile !== 'wall' && <button onClick={() => engineRef.current?.duplicateSelected('d', invView[sel.k] > 0)} aria-label="Geri ekle">▼</button>}
                    <button onClick={() => engineRef.current?.duplicateSelected('r', invView[sel.k] > 0)} aria-label="Sağa ekle">▶</button>
                  </span>
                ) : (
                  <button onClick={() => engineRef.current?.duplicateSelected(null, invView[sel.k] > 0)}>⧉ Bir tane daha</button>
                )}
                {/* v102 — satın alınmış kapı: ana (giriş) kapı yap */}
                {!venue && sel.p === 1 && isDoorItemKey(sel.k) &&
                  (resolveEntrance(design?.door, design?.items).item?.i === sel.i ? (
                    <button className="hs-main-door on" disabled>⭐ Ana kapı</button>
                  ) : (
                    <button className="hs-main-door" onClick={() => engineRef.current?.setDoor({ main: sel.i })}>⭐ Ana kapı yap</button>
                  ))}
                <button className={`danger${removalBreaksBiz(houseDoc, design?.items, sel) ? ' cue-lock' : ''}`} onClick={requestDelete}>{sel.p === 1 ? '📦 Envantere' : '🗑 Kaldır'}</button>
                {/* v132 — bot: görünüm / sözler / hareket / garson */}
                {sel.k === 'bot' && sel.p === 1 && !venue && (
                  <button className="hs-bot-edit" onClick={() => setBotEdit({ i: sel.i })}>✏️ Düzenle</button>
                )}
                {/* v137 — ev hayvanı: ad / sözler / hareket */}
                {isAnimalKey(sel.k) && sel.p === 1 && !venue && (
                  <button className="hs-bot-edit" onClick={() => setPetEdit({ i: sel.i, k: sel.k, c: sel.c || 0 })}>✏️ Düzenle</button>
                )}
                {/* v132 — pazara koy (sadece sahibi; fiyatı yarısı – 1 birim altı) */}
                {isOwner && sel.p === 1 && furnPriceBand(sel.k) && !venue && (
                  <button className="hs-sell-btn" onClick={() => setSellAsk({ k: sel.k })}>🏷️ Sat</button>
                )}
              </div>
            </div>
          )}

          {/* TASARIM RAFI: Mağaza / Envanter */}
          {canDesign && mode === 'build' && (
            <div className={`hs-shelf${shelfOpen ? '' : ' closed'}`}>
              <div className="hs-shelf-main-tabs">
                <button className={tab === 'magaza' ? 'on' : ''} onClick={() => { setTab('magaza'); setShelfOpen(true); }}>🏬 Mağaza</button>
                <button className={tab === 'envanter' ? 'on' : ''} onClick={() => { setTab('envanter'); setShelfOpen(true); }}>
                  📦 {isOwner ? 'Envanter' : 'Sahibin envanteri'}{invList.length > 0 && <i>{invList.reduce((a, x) => a + x.n, 0)}</i>}
                </button>
                <button className={tab === 'pazar' ? 'on' : ''} onClick={() => { setTab('pazar'); setShelfOpen(true); setLayer(null); }}>🛒 Pazar</button>
                {isOwner && (
                  <button className={`hs-undo hs-perm-btn${Object.keys(houseDoc?.editors || {}).length ? ' has' : ''}`} onClick={() => setPanel('editors')} title="Arkadaşlarına tasarım yetkisi ver">
                    ＋
                  </button>
                )}
                <button className="hs-undo" onClick={() => engineRef.current?.undo()} title="Geri al">↶</button>
                <button className="hs-shelf-toggle" onClick={() => setShelfOpen((v) => !v)}>{shelfOpen ? '▾' : '▴'}</button>
              </div>
              {shelfOpen && tab === 'magaza' && (
                <>
                  <div className="hs-shelf-tabs">
                    {/* v132: kategoriler 4 grupta (işletme · araç & kurum · ev · yapı), aralarında ince çizgi */}
                    {CATEGORIES.map((c, i) => (
                      <Fragment key={c.key}>
                        {i > 0 && CATEGORIES[i - 1].g !== c.g && <i className="hs-shelf-sep" aria-hidden="true" />}
                        <button className={cat === c.key ? 'on' : ''} onClick={() => pickCat(c.key)}>
                          {c.icon} {c.name}
                        </button>
                      </Fragment>
                    ))}
                    <button className={cat === 'yuzey' ? 'on' : ''} onClick={() => pickCat('yuzey')}>🎨 Duvar & Zemin</button>
                  </div>
                  {cat === 'kapi' && !venue && <EntranceDoorBar design={design} onChange={(d) => engineRef.current?.setDoor(d)} />}
                  {cat !== 'yuzey' && (
                    <div className="hs-shelf-items">
                      {shelfItems.map((d) => (
                        <button
                          key={d.k}
                          className="hs-card"
                          onClick={() => {
                            // v100: envanterde bu eşyadan varsa satın alınmış olarak (envanterden) konur
                            const fromInv = invView[d.k] > 0;
                            const r = engineRef.current?.addItem(d.k, 0, { owned: fromInv });
                            if (r === 'limit') flash('Eşya sınırına ulaştın (500).');
                            else if (r && fromInv) flash(`📦 Envanterindeki ${d.name} kondu.`);
                          }}
                        >
                          <ItemThumb k={d.k} icon={d.icon} />
                          <span className={`hs-card-name${isOfficeFurn(d.k) ? ' paid' : ''}`} title={isOfficeFurn(d.k) ? 'Para kazandırabilir: ⚙️ Ayarlar › Ücretli Ürünler' : undefined}>{d.name}</span>
                          <PriceTag price={d.price} small />
                          {d.tints && <span className="hs-card-tints">{TINTS[d.tints].length} renk</span>}
                          {invView[d.k] > 0 && <span className="hs-card-own">📦 {invView[d.k]}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {cat === 'yuzey' && (
                    <div className="hs-shelf-surfaces">
                      {[['wall', 'Duvar', WALLS], ['floor', 'Zemin', FLOORS]].map(([type, label, list]) => (
                        <div className="hs-surf-row" key={type}>
                          <span className="hs-surf-label">{label}</span>
                          {/* v92: yeni zeminler/duvarlar parça olarak satılır (Zemin Parçaları / Duvar Panelleri) */}
                          {list.filter((w) => SURFACE_KEYS[type].includes(w.key)).map((w) => {
                            const ownedS = ownsSurface(type, w.key);
                            const on = design?.[type] === w.key;
                            return (
                              <button key={w.key} className={`hs-surf${on ? ' on' : ''}`} onClick={() => (type === 'wall' ? engineRef.current?.setWall(w.key) : engineRef.current?.setFloor(w.key))}>
                                <i style={{ background: w.swatch }} />
                                <span>{w.name}</span>
                                {ownedS ? <span className="hs-price free sm">✓ Senin</span> : <PriceTag price={w.price} small />}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {shelfOpen && tab === 'pazar' && <MarketShelf uid={user?.uid} best={furnBest} Price={PriceTag} onPlace={placeFromMarket} flash={flash} />}
              {shelfOpen && tab === 'envanter' && (
                <div className="hs-shelf-items">
                  {invList.length === 0 && !isOwner && <p className="hs-dim hs-inv-empty">Ev sahibinin envanteri boş. Mağazadan deneme eşya koyabilirsin; satın almayı sahibi yapar.</p>}
                  {invList.length === 0 && isOwner && <p className="hs-dim hs-inv-empty">Envanterin boş. Satın aldığın eşyaları odadan kaldırınca buraya gelir; buradan istediğin evine koyabilirsin.</p>}
                  {invList.map(({ def, n }) => (
                    <button
                      key={def.k}
                      className="hs-card"
                      onClick={() => {
                        // v114: envanterden tavan eşyası konunca tavan modu açılır, diğerlerinde kapanır
                        setLayer(layerOfCat(def.cat));
                        engineRef.current?.addItem(def.k, 0, { owned: true });
                      }}
                    >
                      <ItemThumb k={def.k} icon={def.icon} />
                      <span className={`hs-card-name${isOfficeFurn(def.k) ? ' paid' : ''}`}>{def.name}</span>
                      <span className="hs-card-own big">× {n}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GEZ: sağ buton sütunu */}
          {mode === 'walk' && (
            <div className="hs-side">
              <button className={`hs-side-btn${panel === 'emotes' ? ' on' : ''}`} onClick={() => setPanel(panel === 'emotes' ? null : 'emotes')} title="Hareketler">😀</button>
              {panel === 'emotes' && (
                <div className="hs-emotes">
                  {EMOTES.map((e) => (
                    <button key={e.key} onClick={() => emote(e.key)}>
                      <span>{e.emoji}</span>
                      {e.label}
                    </button>
                  ))}
                </div>
              )}
              <button className="hs-side-btn" onClick={() => setPanel('people')} title="Odadakiler">
                👥{others.length > 0 && <span className="hs-side-count">{others.length}</span>}
              </button>
              <button className="hs-side-btn" onClick={() => { setPhoneApp('chatsapp'); setPanel('phone'); }} title="ChatsApp">💬</button>
              <button className="hs-side-btn" onClick={() => { setPhoneApp(null); setPanel('phone'); }} title="Telefon">📱</button>
              <button className="hs-side-btn" onClick={openCamera} title="Fotoğraf çek">📷</button>
            </div>
          )}

          {/* GEZ: etkileşim butonları */}
          {mode === 'walk' && interact && (
            <div className="hs-actions">
              <div className="hs-actions-title">{interact.name}</div>
              {interact.trial ? (
                <div className="hs-trial-note">🛒 Deneme ürünü — ev sahibi satın alınca kullanılabilir</div>
              ) : (
                interact.actions.map((a) => {
                  // v77: internet kafede cihaz: doluluk (👤 n/kapasite) + dakika ücreti
                  if (bizType === 'internet' && !isOwner && a.panel === 'arcade' && a.deviceId) {
                    const occ = deviceOcc(a.deviceId);
                    const cap = deviceCap(a.deviceId);
                    const full = occ >= cap;
                    return (
                      <button key={a.label} className={`hs-act${full ? ' cue-dim' : ''}`} onClick={() => doAction(a)}>
                        🎮 {full ? 'Dolu' : 'Oyna'} · {occ}/{cap} kişi · <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {devicePrice(a.deviceId)} / dakika
                        {isStreamSetPc(houseDoc?.items, a.deviceId) ? ' · 🔴 yayın seti' : ''}
                      </button>
                    );
                  }
                  // cafe/bar: yiyecek-içecek fiyatıyla (menüden alınır)
                  if (a.kind === 'take' && bizType && MENU_TYPES.includes(bizType) && !isOwner && isMenuProduct(a.product)) {
                    return (
                      <button key={a.label} className="hs-act take" onClick={() => doAction(a)}>
                        <HeldIcon product={a.product} size={20} /> {HOUSE_PRODUCTS[a.product]?.label} — menüden satın al
                      </button>
                    );
                  }
                  if (a.kind === 'gym') {
                    // görev az önce ilerlediyse motorun eski etiketi bir kare kalabilir
                    if (a.equipment !== gymTaskKey) return null;
                    return (
                      <button key={a.label} className="hs-act take cue-pulse" onClick={() => doAction(a)}>
                        ⭐ Görevi yap: {EQUIP[a.equipment]?.icon || '🏋️'} {EQUIP[a.equipment]?.name || ''}
                      </button>
                    );
                  }
                  // v80 — yayın aç (yayındaysan bilgi)
                  // v81: sadece kendi evinde/dükkânında ya da internet kafede (ücretli);
                  // başkasının setinde yalnızca "🎮 Oyna" görünür
                  if (a.kind === 'stream' && !isOwner && bizType !== 'internet') return null;
                  if (a.kind === 'stream') {
                    return (
                      <button key={a.label} className={`hs-act st-act${myStream ? ' cue-dim' : ''}`} disabled={Boolean(myStream)} onClick={() => doAction(a)}>
                        {myStream ? '🔴 Yayındasın' : cafeStreamPrice ? `🔴 Yayın aç · ${cafeStreamPrice.toLocaleString('tr-TR')}/dk` : '🔴 Yayın aç'}
                      </button>
                    );
                  }
                  // v93 — home ofis eşyası: etiket katmandan (fiyat / doluluk)
                  if (a.kind === 'ho') {
                    return (
                      <button key={a.label} className={`hs-act take${hoApiRef.current?.dim?.(a) ? ' cue-dim' : ''}`} onClick={() => doAction(a)}>
                        {hoApiRef.current?.label?.(a) || a.label}
                      </button>
                    );
                  }
                  // piyano başkası tarafından çalınıyorsa: soluk + silüet
                  if (a.panel === 'drums' && drumPlayer && drumPlayer.uid !== user?.uid) {
                    return (
                      <button key={a.label} className="hs-act cue-dim" onClick={() => doAction(a)}>
                        🥁 Dolu — {drumPlayer.name} çalıyor
                      </button>
                    );
                  }
                  if (a.panel === 'piano' && pianoPlayer && pianoPlayer.uid !== user?.uid) {
                    return (
                      <button key={a.label} className="hs-act cue-dim" onClick={() => doAction(a)}>
                        🎹 Dolu — {pianoPlayer.name} çalıyor
                      </button>
                    );
                  }
                  // v100 — ofiste ücretli ürün: fiyatıyla
                  const cost = (a.kind === 'take' || a.kind === 'cartadd') && !(bizType && MENU_TYPES.includes(bizType)) ? paidPriceOf(a.product) : 0;
                  const costTag = cost > 0 && (
                    <span className="hs-act-price">
                      {' '}
                      · <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {cost.toLocaleString('tr-TR')}
                    </span>
                  );
                  return (
                    <button key={a.label} className={`hs-act${a.kind === 'take' ? ' take' : ''}`} onClick={() => doAction(a)}>
                      {a.kind === 'take' ? (
                        <>
                          <HeldIcon product={a.product} size={20} /> {HOUSE_PRODUCTS[a.product]?.label} al{costTag}
                        </>
                      ) : (
                        <>
                          {a.label}
                          {costTag}
                        </>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {mode === 'walk' && myCart && (
            <div className={`hs-holding hs-mcart${menuVenue || bots.waiterReady ? ' low' : ''}`}>
              🛒 Market arabası · <b>{myCart.length}</b>/{CART_MAX} ürün
              <button onClick={() => setMyCart(null)}>Arabayı bırak</button>
            </div>
          )}
          {/* v132.1: "Elinde: … · 👥'dan ısmarlayabilirsin" paneli kaldırıldı (gereksiz; ürün avatarın elinde görünüyor) */}

          {/* SOHBET */}
          <div className={`hs-chat${mode === 'build' ? ' build' : ''}${chatExpanded ? ' expanded' : ''}`}>
            <div className="hs-chat-feed" onClick={() => setChatExpanded((v) => !v)}>
              {(chatExpanded ? liveMessages : liveMessages.slice(-4)).map((m) => (
                <div key={m.id} className={`hs-msg${m.uid === user.uid ? ' me' : ''}`}>
                  <b>{m.name}:</b> {m.text}
                </div>
              ))}
              {liveMessages.length === 0 && <div className="hs-msg dim">{venue ? 'Buradakilerle' : 'Evdekilerle'} sohbet et 👋</div>}
            </div>
            <ChatBox busy={chatBusy} onSend={sendChat} onTyping={(on) => engineRef.current?.setTyping?.(on)} />
          </div>

          {toast && <div className="hs-toast">{toast}</div>}
          {gift && (
            <GiftNote gift={gift} onDone={clearGift} />
          )}

          {/* ODADAKİLER */}
          {/* v92 — TASARIM YETKİSİ */}
          {panel === 'editors' && isOwner && (
            <div className="hs-modal-bg" onClick={() => setPanel(null)}>
              <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="hs-modal-head">
                  <b>🛠️ Tasarım yetkisi</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                {!houseDoc?.venue && <FundBox houseId={houseId} fund={fund} player={player} flash={flash} />}
                <p className="hs-dim hs-perm-info">Yetki verdiğin arkadaşın, içerideyken Tasarla ile eşya koyup kaldırabilir; mobilya kasasındaki parayla senin adına satın alabilir. Kendi cebinden alamaz.</p>
                {(social.friends || []).length === 0 && <p className="hs-dim">Arkadaş listen boş. ChatsApp'tan arkadaş ekleyebilirsin.</p>}
                {(social.friends || []).slice(0, 80).map((f) => {
                  const on = houseDoc?.editors?.[f.uid] === true;
                  return (
                    <div key={f.uid} className="hs-person">
                      <span className="hs-person-main static">
                        <AvatarSvg avatar={f.avatar} size={30} rounded />
                        <span className="hs-person-name">
                          {f.name}
                          {on && <em> · 🛠️ yetkili</em>}
                        </span>
                      </span>
                      <button className={on ? 'ghost' : 'hs-perm-give'} disabled={editorBusy === f.uid} onClick={() => setEditor(f.uid, !on, f.name)}>
                        {editorBusy === f.uid ? '…' : on ? 'Yetkiyi kaldır' : 'Yetki ver'}
                      </button>
                    </div>
                  );
                })}
                {Object.keys(houseDoc?.editors || {})
                  .filter((uid) => !(social.friends || []).some((f) => f.uid === uid))
                  .map((uid) => (
                    <div key={uid} className="hs-person">
                      <span className="hs-person-main static">
                        <span className="hs-person-name">
                          Artık arkadaşın değil <em>· 🛠️ yetkili</em>
                        </span>
                      </span>
                      <button className="ghost" disabled={editorBusy === uid} onClick={() => setEditor(uid, false)}>
                        Yetkiyi kaldır
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {panel === 'people' && (
            <div className="hs-modal-bg" onClick={() => setPanel(null)}>
              <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="hs-modal-head">
                  <b>👥 Odadakiler ({online.length})</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                {online.map((o) => {
                  const me = o.uid === user.uid;
                  return (
                    <div key={o.uid} className="hs-person">
                      <button className="hs-person-main" onClick={() => !me && setCardTarget(o.uid)}>
                        <AvatarSvg avatar={o.avatar} size={30} rounded />
                        <span className="hs-person-name">
                          {o.displayName || 'Oyuncu'}
                          {me && <em> (sen)</em>}
                          {o.uid === houseDoc?.ownerUid && <em> 👑</em>}
                        </span>
                        {o.holding && <HeldIcon product={o.holding} size={18} />}
                      </button>
                      {!me && myHolding && !o.holding && !isBlocked(o.uid) && <button onClick={() => giftTo(o)}>🎁 Ismarla</button>}
                      {!me && isOwner && <button className="ghost" onClick={() => kick(o)}>Çıkar</button>}
                    </div>
                  );
                })}
                <div className="hs-list-title">Arkadaşlarını davet et</div>
                {(social.friends || []).length === 0 && <p className="hs-dim">Arkadaş listen boş. ChatsApp'tan arkadaş ekleyebilirsin.</p>}
                {(social.friends || [])
                  .filter((f) => !online.some((o) => o.uid === f.uid))
                  .slice(0, 40)
                  .map((f) => (
                    <div key={f.uid} className="hs-person">
                      <span className="hs-person-main static">
                        <AvatarSvg avatar={f.avatar} size={30} rounded />
                        <span className="hs-person-name">{f.name}</span>
                      </span>
                      {invitedUids[f.uid] === 'ok' || Number(houseDoc?.invites?.[f.uid] || 0) > Date.now() ? (
                        <button className="hs-invited" disabled>
                          ✓ Davet edildi
                        </button>
                      ) : (
                        <button onClick={() => invite(f)} disabled={invitedUids[f.uid] === 'busy'}>
                          {invitedUids[f.uid] === 'busy' ? '…' : '💌 Davet'}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* AYARLAR */}
          {panel === 'settings' && (
            <div className="hs-modal-bg" onClick={() => !busy && setPanel(null)}>
              <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="hs-modal-head">
                  <b>⚙️ {bizType ? `${BIZ_TYPES[bizType].icon} ${BIZ_TYPES[bizType].label}` : kind === 'ofis' ? `${houseDoc?.office?.emoji || '🏢'} Ofis Ayarları` : kind === 'depo' ? '📦 Depo Ayarları' : 'Ev Ayarları'}</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                <label className="hs-field-label">{bizType ? 'Adı' : 'Evin adı'}</label>
                <input className="hh-input" value={settingsDraft.name} maxLength={30} onChange={(e) => setSettingsDraft((d) => ({ ...d, name: e.target.value }))} placeholder="örn. Neon Kafe, Garaj 34, Çete Mekanı" />
                {bizType ? (
                  <BizSettings houseId={houseId} houseDoc={houseDoc} />
                ) : kind === 'ofis' ? (
                  <p className="hs-dim hs-office-note">🏢 Ofisler her zaman herkese açıktır.</p>
                ) : (
                  <>
                    <label className="hs-field-label">Evin türü</label>
                    <div className="hs-privacy">
                      {PRIVACY.map((p) => (
                        <button key={p.key} className={settingsDraft.privacy === p.key ? 'on' : ''} onClick={() => setSettingsDraft((d) => ({ ...d, privacy: p.key }))}>
                          <b>{p.label}</b>
                          <span>{p.hint}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button className="hs-btn gold wide" disabled={busy} onClick={saveSettings}>{busy ? 'Kaydediliyor…' : bizType ? '💾 Adı kaydet' : '💾 Ev ayarlarını kaydet'}</button>
                <button className={`hs-btn ghost wide hb-open-list${intentReady && !isHomeOffice(bizIntent) ? ' cue-pulse' : ''}`} disabled={busy} onClick={() => setPanel('biz')}>
                  🏪 İşletmeler{bizIntent && !isHomeOffice(bizIntent) ? ` · ${BIZ_TYPES[bizIntent].icon}` : ''}
                </button>
                {/* v100 — Ücretli Ürünler (eski Home Ofisler): odada ücretli yapılabilir mobilya varsa */}
                {isOwner && officeOwnedKeys.length > 0 && (
                  <button className="hs-btn ghost wide hb-open-list hs-paid-btn" disabled={busy} onClick={() => setPanel('office')}>
                    💰 Ücretli Ürünler{kind === 'ofis' ? ` · ${houseDoc?.office?.emoji || '🏢'} ofis` : ''}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* v77 — İŞLETMELER · v93 HOME OFİSLER (aynı panel, farklı türler) */}
          {panel === 'office' && isOwner && <OfficePanel houseId={houseId} houseDoc={houseDoc} onClose={() => setPanel(null)} flash={flash} onRename={renameOffice} onOpenBiz={() => setPanel('biz')} />}
          {panel === 'biz' && (
            <BizListPanel
              keys={BIZ_TYPE_KEYS}
              title="🏪 İşletmeler"
              items={design?.items}
              invItems={inv?.items}
              gold={Number(player?.gold || 0)}
              gem={Number(player?.emerald || 0)}
              onFillMissing={fillMissing}
              houseDoc={houseDoc}
              busy={busy}
              flashType={bizFlash}
              onOpenBiz={openBiz}
              onCloseBiz={closeBiz}
              onClose={() => setPanel(null)}
              houseId={houseId}
            />
          )}
          {petEdit && <PetEditor houseId={houseId} item={petEdit} cfg={houseDoc?.pets?.[petEdit.i] || null} flash={flash} onClose={() => setPetEdit(null)} />}
          {botEdit && <BotEditor houseId={houseId} itemId={botEdit.i} cfg={houseDoc?.bots?.[botEdit.i] || null} flash={flash} onClose={() => setBotEdit(null)} />}
          {sellAsk && <SellSheet k={sellAsk.k} Price={PriceTag} busy={sellBusy} onConfirm={doSell} onClose={() => setSellAsk(null)} />}
          {bizRemove && (
            <BizRemovePanel type={bizRemove.type} status={bizRemove.status} busy={busy} onConfirm={confirmBizRemove} onCancel={() => setBizRemove(null)} />
          )}

          {/* SATIN ALMA ONAYI */}
          {panel === 'checkout' && (
            <div className="hs-modal-bg" onClick={() => !busy && setPanel(null)}>
              <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="hs-modal-head">
                  <b>🛒 Alışverişi Tamamla</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                <div className="hs-receipt">
                  {cart.lines.map((l) => (
                    <div key={l.name} className="hs-receipt-row">
                      <span>{l.n > 1 ? `${l.n} × ` : ''}{l.name}</span>
                      <PriceTag price={{ t: l.price.t, v: l.price.v * l.n }} small />
                    </div>
                  ))}
                </div>
                <div className="hs-receipt-total">
                  <span>Toplam</span>
                  <Money gold={cart.gold} gem={cart.gem} />
                </div>
                <div className="hs-receipt-bal">
                  <span>{isEditor ? '🏦 Mobilya kasası' : 'Bakiyen'}</span>
                  <Money gold={payGold} gem={payGem} small />
                </div>
                {(payGold < cart.gold || payGem < cart.gem) && (
                  <p className="hs-err">
                    {isEditor
                      ? `Mobilya kasası yetmiyor — ${houseDoc?.ownerName || 'sahibi'} kasaya ekleyebilir.`
                      : `${payGold < cart.gold ? 'Altının yetmiyor. ' : ''}${payGem < cart.gem ? 'Zümrütün yetmiyor (Telefon > Zümrüt Mağazası).' : ''}`}
                  </p>
                )}
                <div className="hh-modal-row">
                  <button className="hs-btn ghost" disabled={busy} onClick={() => setPanel(null)}>Vazgeç</button>
                  <button
                    className="hs-btn gold"
                    disabled={busy || payGold < cart.gold || payGem < cart.gem}
                    onClick={doCheckout}
                  >
                    {busy ? 'İşleniyor…' : 'Onayla ve Satın Al'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MÜZİK KUTUSU */}
          {panel === 'jukebox' && (
            <div className="hs-modal-bg" onClick={() => setPanel(null)}>
              <div className="hs-modal juke" onClick={(e) => e.stopPropagation()}>
                <div className="hs-modal-head">
                  <b>🎵 Müzik Kutusu</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                <p className="hs-dim">{music ? `Çalıyor: ${TRACKS[music.track]?.title} · ${music.byName || ''} açtı` : 'Şu an müzik kapalı.'} Evdeki herkes aynı şarkıyı duyar.</p>
                {TRACKS.map((t) => (
                  <button key={t.index} className={`juke-pick${music?.track === t.index ? ' on' : ''}`} style={{ '--ta': t.color }} onClick={() => setTrack(t.index)}>
                    <b>{t.title}</b>
                    <span>{t.mood}</span>
                  </button>
                ))}
                <div className="hh-modal-row">
                  <button className="hs-btn ghost" onClick={() => setTrack(null)} disabled={!music}>⏹ Kapat</button>
                  <button
                    className="hs-btn ghost"
                    onClick={() => {
                      const m = !muted;
                      setMuted(m);
                      setVolume(m ? 0 : 0.7);
                    }}
                  >
                    {muted ? '🔇 Sesim kapalı' : '🔊 Sesim açık'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {panel === 'arcade' && <ArcadeHub onClose={() => setPanel(null)} />}
          {/* v80 — yayın */}
          {streamAsk && !myStream && <StreamStartSheet cafePrice={cafeStreamPrice} busy={streamBusy} onStart={startStream} onCancel={() => setStreamAsk(null)} />}
          {myStream && myStreamDoc && (
            <StreamHostPanel
              stream={myStreamDoc}
              roomChat={liveMessages}
              pose={streamPoseNow}
              engineRef={engineRef}
              statsRef={streamStatsRef}
              stopping={streamBusy}
              onStopRequest={stopStream}
              onEnded={endStreamLocal}
              onPlay={() => setPlayAsk(true)}
              onMatch={() => setStreamMatch(true)}
              compact={panel === 'arcade' || raceUp || streamMatch}
            />
          )}
          {myStream && streamMatch && <StreamMatchView streamId={myStream.id} onClose={() => setStreamMatch(false)} />}
          {myStream && playAsk && <StreamPlaySheet onArcade={playArcade} onRace={playRace} onCasino={playCasino} onClose={() => setPlayAsk(false)} />}
          {panel === 'streamCasino' && myStream && (
            <StreamCasinoSheet onClose={() => setPanel(null)} onEnterTable={(tableId) => window.dispatchEvent(new CustomEvent('ns:open-table', { detail: tableId }))} />
          )}
          {streamSum && <StreamSummary summary={streamSum.summary} reason={streamSum.reason} cost={streamSum.cost} streamId={streamSum.streamId} onClose={() => setStreamSum(null)} />}
          {streamWarn && (
            <div className="st-sheet-bg" onClick={() => setStreamWarn(false)}>
              <div className="st-sheet" onClick={(e) => e.stopPropagation()}>
                <p className="st-sheet-title">🔴 Bu odada canlı yayın var</p>
                <p className="st-sum-why" style={{ color: '#f2ecdd' }}>
                  {othersLive.map((x) => x.name).join(', ')} şu an yayında. Yayın kamerasının gördüğü yerde durursan izleyiciler seni görür (sesin değil, sadece avatarın ve hareketlerin).
                </p>
                <div className="st-sheet-btns">
                  <button className="st-btn ghost" onClick={() => toggleNoStream(!noStream).then(() => setStreamWarn(false))}>
                    {noStream ? '👀 Yayında görün' : '🙈 Yayında görünme'}
                  </button>
                  <button className="st-btn gold" onClick={() => setStreamWarn(false)}>
                    Anladım
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* KAMERA */}
          {panel === 'camera' && cameraShot && (
            <PhotoStoryEditor
              img={cameraShot.img || null}
              loading={!cameraShot.img && !cameraShot.error}
              error={cameraShot.error || null}
              busy={busy}
              onShare={shareCamera}
              onClose={() => {
                if (busy) return;
                setPanel(null);
                setCameraShot(null);
              }}
            />
          )}

          {panel === 'phone' && (
            <PhoneScreen
              onClose={() => {
                setPanel(null);
                setPhoneApp(null);
              }}
              initialApp={phoneApp}
              onEnterTable={() => {}}
            />
          )}

          {cardTarget && (
            <PlayerCard
              uid={cardTarget}
              name={online.find((o) => o.uid === cardTarget)?.displayName}
              avatar={online.find((o) => o.uid === cardTarget)?.avatar}
              reportItems={[]}
              onClose={() => setCardTarget(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// v106 — sohbet yazı kutusu: kendi durumunu tutar (harf başına sadece bu küçük
// parça yeniden çizilir). Odaktayken 3D sahne klavye yüzünden yeniden boyutlanmaz.
// v106.1: Gönder'e (ya da klavyedeki gönder tuşuna) basınca klavye kapanır.
const ChatBox = memo(function ChatBox({ busy, onSend, onTyping }) {
  const [text, setText] = useState('');
  const sendRef = useRef(onSend);
  sendRef.current = onSend;
  const typingRef = useRef(onTyping);
  typingRef.current = onTyping;
  useEffect(() => () => typingRef.current?.(false), []);
  const inputRef = useRef(null);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    inputRef.current?.blur(); // v106.1: gönderince klavye kapanır
    if (await sendRef.current(t)) setText('');
  };
  return (
    <div className="hs-chat-row">
      <input
        ref={inputRef}
        value={text}
        maxLength={200}
        placeholder="Mesaj yaz…"
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => typingRef.current?.(true)}
        onBlur={() => typingRef.current?.(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send();
        }}
      />
      <button onClick={send} disabled={busy || !text.trim()}>
        Gönder
      </button>
    </div>
  );
});

// v114 — "Tavan modu açıldı": dokununca ya da 3 sn sonra kendiliğinden kaybolur
function CeilNote({ onDone, floor = false }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => doneRef.current?.(), 3000);
    return () => clearTimeout(t);
  }, []);
  const close = (e) => {
    e.stopPropagation();
    doneRef.current?.();
  };
  return (
    <div className="hs-toast ceilnote tappable" onClick={close} onPointerDown={(e) => e.stopPropagation()}>
      {floor ? '🧩 Zemin modu açıldı' : '🧊 Tavan modu açıldı'}
    </div>
  );
}

// v105: kendiliğinden kaybolur (onDone değişse bile sayaç sıfırlanmaz), dokununca hemen kapanır
function GiftNote({ gift, onDone }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => doneRef.current?.(), 4500);
    return () => clearTimeout(t);
  }, [gift]);
  const close = (e) => {
    e.stopPropagation();
    doneRef.current?.();
  };
  const p = HOUSE_PRODUCTS[gift.itemId];
  if (gift.served) {
    // v92 — garson siparişi getirdi / süre dolunca kendiliğinden geldi
    return (
      <div className="hs-toast gift tappable" onClick={close} onPointerDown={(e) => e.stopPropagation()}>
        {gift.from ? (
          <>
            🧑‍🍳 Garson <b>{gift.from}</b> siparişini getirdi: {p ? `${p.emoji} ${p.label}` : 'siparişin'}
          </>
        ) : (
          <>⏱️ Siparişin geldi: {p ? `${p.emoji} ${p.label}` : 'ürün'}</>
        )}
      </div>
    );
  }
  return (
    <div className="hs-toast gift tappable" onClick={close} onPointerDown={(e) => e.stopPropagation()}>
      🎁 <b>{gift.from}</b> sana {p ? `${p.emoji} ${p.label}` : 'bir ikram'} ısmarladı!
    </div>
  );
}
