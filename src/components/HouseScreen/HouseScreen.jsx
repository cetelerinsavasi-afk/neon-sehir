import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backStack';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useHeldItem } from '../../hooks/useHeldItem';
import { houseAction, giftHeldItem, createSixtagramPost } from '../../services/gameActions';
import { createHouseEngine, EMOTES } from './houseEngine';
import ItemThumb from './ItemThumb';
import { CATALOG, CATALOG_MAP, CATEGORIES, TINTS } from './houseCatalog';
import { FLOORS, WALLS } from './houseTextures';
import { FREE_SURFACES, HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { TRACKS, playTrack, stopMusic, unlockAudio, setVolume, getVolume } from './houseAudio';
import ArcadeHub from '../Arcade/ArcadeHub';
import PhoneScreen from '../Phone/PhoneScreen';
import PlayerCard from '../PlayerCard/PlayerCard';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { BizListPanel, BizSettings, BizRemovePanel } from './HouseBusiness';
import { removalBreaksBiz, parseBizError } from './houseBusinessLogic';
import { BIZ_TYPES, checkBizRequirements } from '../../../functions/businessCatalogData.js';
import Workshop from '../Workshop/Workshop';
import ShopShowcase from '../Shop/ShopShowcase';
import MenuPanel from '../Venue/MenuPanel';
import NetCreditRing from '../Venue/NetCreditRing';
import PianoPanel from '../Piano/PianoPanel';
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

// =============================================================================
// HouseScreen — 3D Ev (v66, herkese açık)
//   Herkes: evde gez (3D / 2D kuş bakışı), dokunduğun yere yürü, otur, eşyalarla
//   etkileşime gir (yiyecek/içecek/silah al, atari oyna, müzik aç), hareket yap,
//   sohbet et, fotoğraf çek, telefon / ChatsApp.
//   Ev sahibi: Tasarla (Mağaza / Envanter, sepet + satın alma), Ayarlar (ad, tür),
//   odadakileri çıkarma, davet.
// =============================================================================

const PRESENCE_STALE_MS = 45_000;
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
};
const SAVE_DEBOUNCE_MS = 1200;
const PRIVACY = [
  { key: 'public', label: '🌐 Herkese açık', hint: 'Herkes evini listede görür ve girebilir.' },
  { key: 'friends', label: '👥 Arkadaşlar', hint: 'Sadece arkadaşların girebilir.' },
  { key: 'private', label: '🔒 Gizli', hint: 'Kimse giremez (içeridekiler atılmaz, davet ettiklerin girebilir).' },
];

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

const ownedCount = (items) => {
  const m = {};
  (items || []).forEach((it) => {
    if (it.p === 1) m[it.k] = (m[it.k] || 0) + 1;
  });
  return m;
};

export default function HouseScreen({ houseId, onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const social = useSocial();
  const { isBlocked } = useBlocks();
  const { held, gift, clearGift } = useHeldItem('ev');
  const mountRef = useRef(null);
  const seenSelfRef = useRef(false);
  const rejoinRef = useRef(false);
  const houseDocRef = useRef(null);
  const engineRef = useRef(null);
  const [engineKey, setEngineKey] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [errMsg, setErrMsg] = useState('');
  const [info, setInfo] = useState(null);
  const [mode, setMode] = useState('walk');
  const [view, setView] = useState('3d');
  const [sel, setSel] = useState(null);
  const [interact, setInteract] = useState(null);
  const [tab, setTab] = useState('magaza');
  const [cat, setCat] = useState('oturma');
  const [shelfOpen, setShelfOpen] = useState(true);
  const [saveState, setSaveState] = useState('saved');
  const [design, setDesign] = useState(null);
  const [houseDoc, setHouseDoc] = useState(null);
  const [inv, setInv] = useState({ items: {}, walls: [], floors: [] });
  const [online, setOnline] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [panel, setPanel] = useState(null); // people | settings | checkout | arcade | jukebox | camera | phone | emotes
  const [phoneApp, setPhoneApp] = useState(null);
  const [panelItem, setPanelItem] = useState(null);
  const [cardTarget, setCardTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ name: '', privacy: 'public' });
  const [cameraShot, setCameraShot] = useState(null);
  // v77 — işletme: kaldırma uyarısı { type, status } · İşletmeler panelinde vurgulanan tür
  const [bizRemove, setBizRemove] = useState(null);
  const [bizFlash, setBizFlash] = useState(null);
  const allowBizCloseRef = useRef(false);
  const [cameraCaption, setCameraCaption] = useState('');
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
  const leavingRef = useRef(false);
  const enteredRef = useRef(false);
  const lastEmoteRef = useRef({ emote: null, ts: 0 });
  const isOwner = !!info?.isOwner;

  const flash = useCallback((t) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 2800);
  }, []);
  const exit = useCallback(
    (note) => {
      leavingRef.current = true;
      stopMusic();
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
    houseAction({ op: 'enter', houseId })
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        enteredRef.current = true;
        setInfo({ houseId, isOwner: !!d.isOwner, name: d.name, ownerName: d.ownerName });
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
    if (!dsg || !isOwner) return Promise.resolve();
    pendingDesignRef.current = null;
    setSaveState('saving');
    const allowBizClose = allowBizCloseRef.current;
    return enqueue(async () => {
      try {
        const res = await houseAction({ op: 'save', houseId, design: dsg, ...(allowBizClose ? { allowBizClose: true } : {}) });
        if (allowBizClose) allowBizCloseRef.current = false;
        setSaveState(pendingDesignRef.current ? 'dirty' : 'saved');
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
            engineRef.current.setDesign({ items: hd.items || [], wall: hd.wall, floor: hd.floor }, { force: true });
            setDesign(engineRef.current.getDesign());
          }
          flash(
            be.kind === 'locked'
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
  }, [enqueue, flash, houseId, isOwner]);

  useEffect(() => {
    if (phase !== 'ready' || !info || !mountRef.current) return undefined;
    const eng = createHouseEngine(mountRef.current, {
      canEdit: info.isOwner,
      selfUid: user.uid,
      onSelectionChange: setSel,
      onInteractChange: setInteract,
      onPlayerTap: (uid) => setCardTarget(uid),
      onContextLost: () => {
        flash('Grafikler yeniden yükleniyor…');
        setTimeout(() => setEngineKey((k) => k + 1), 400);
      },
      onDesignChange: (dsg) => {
        setDesign(dsg);
        if (!info.isOwner) return;
        pendingDesignRef.current = { items: dsg.items, wall: dsg.wall, floor: dsg.floor };
        setSaveState('dirty');
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => flushSave(), SAVE_DEBOUNCE_MS);
      },
    });
    engineRef.current = eng;
    if (import.meta.env?.DEV) window.__houseEngine = eng; // sadece geliştirme/önizleme
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

  useEffect(() => {
    engineRef.current?.setSelfHolding(held?.itemId || null);
    // süresi dolan ürünü konum kaydından da temizle (başkaları görmesin)
    if (!held && user && phase === 'ready') {
      setDoc(doc(db, 'housePresence', user.uid), { holding: null }, { merge: true }).catch(() => {});
    }
  }, [held, user, phase, engineKey]);

  // Telefon/arkaplan açıkken 3D çizimi duraklat (pil + kasma)
  useEffect(() => {
    engineRef.current?.setPaused(panel === 'phone' || panel === 'arcade');
  }, [panel, engineKey]);

  // --- 3) ev belgesi ---------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    return onSnapshot(
      doc(db, 'houses', houseId),
      (snap) => {
        if (!snap.exists()) {
          if (!leavingRef.current) exit('Bu ev artık yok.');
          return;
        }
        const data = snap.data();
        setHouseDoc(data);
        houseDocRef.current = data;
        const eng = engineRef.current;
        if (!eng) return;
        const dsg = { items: data.items || [], wall: data.wall, floor: data.floor };
        if (!info?.isOwner || !appliedFirstRef.current) {
          appliedFirstRef.current = true;
          eng.setDesign(dsg, { force: true });
          setDesign(eng.getDesign());
        }
        eng.setMusic(data.music?.itemId || null);
      },
      (err) => console.error('Ev dinleme hatası:', err)
    );
  }, [phase, houseId, info?.isOwner, exit, engineKey]);

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
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const q = query(collection(db, 'housePresence'), where('houseId', '==', houseId), limit(40));
    return onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const list = [];
        let meThere = false;
        snap.forEach((d) => {
          const p = d.data();
          const ms = p.updatedAt?.toMillis?.() ?? now;
          if (d.id === user.uid) meThere = true;
          if (now - ms > PRESENCE_STALE_MS && d.id !== user.uid) return;
          list.push({ uid: d.id, ...p, holdingVisible: p.holding || null });
        });
        engineRef.current?.setOthers(list.filter((p) => p.uid !== user.uid));
        setOnline(list);
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
  }, [phase, houseId, user?.uid, exit, engineKey]);

  useEffect(() => {
    if (phase !== 'ready') return undefined;
    let last = '';
    let lastKey = '';
    let lastAt = 0;
    const iv = setInterval(() => {
      const eng = engineRef.current;
      if (!eng || document.hidden || leavingRef.current) return;
      const st = eng.getSelfState();
      const em = lastEmoteRef.current;
      const sig = `${st.x}|${st.z}|${st.seat}|${st.left}|${em.ts}`;
      // v73 — maliyet: yürürken en fazla ~0,65 sn'de bir yazılır (eskiden 0,22 sn;
      // her yazma evdeki herkese bir okuma). Oturma/hareket (emote) hemen gider;
      // diğerleri aradaki boşlukta yumuşak kayar (houseEngine).
      const keySig = `${st.seat}|${em.ts}`;
      const now = Date.now();
      if (sig === last && now - lastAt < 15_000) return;
      if (sig !== last && keySig === lastKey && now - lastAt < 650) return;
      last = sig;
      lastKey = keySig;
      lastAt = now;
      setDoc(
        doc(db, 'housePresence', user.uid),
        { x: st.x, z: st.z, left: st.left, seat: st.seat, emote: em.emote, emoteTs: em.ts, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }, 220);
    return () => clearInterval(iv);
  }, [phase, user?.uid]);

  // --- 5) sohbet -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const q = query(collection(db, 'houses', houseId, 'chat'), orderBy('createdAtMs', 'desc'), limit(40));
    return onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.reverse();
        setMessages(list.filter((m) => !isBlocked(m.uid)));
        list.forEach((m) => {
          if (seenMsgRef.current.has(m.id)) return;
          seenMsgRef.current.add(m.id);
          if ((m.createdAtMs || 0) > mountedAtRef.current - 2000 && !isBlocked(m.uid)) engineRef.current?.say(m.uid, m.text);
        });
      },
      (err) => console.error('Ev sohbet hatası:', err)
    );
  }, [phase, houseId, isBlocked]);

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    try {
      await houseAction({ op: 'chat', houseId, text });
      setChatText('');
    } catch (err) {
      flash(err?.message || 'Mesaj gönderilemedi.');
    } finally {
      setChatBusy(false);
    }
  };

  // --- etkileşimler --------------------------------------------------------------------
  const doAction = async (a) => {
    unlockAudio();
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
    const seatBefore = engineRef.current?.getSelfState()?.seat || null;
    const r = engineRef.current?.interact(a);
    if (!r) return;
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
      const r = await giftHeldItem(o.uid, 'ev');
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
  const invite = async (f) => {
    try {
      await houseAction({ op: 'invite', houseId, uid: f.uid });
      flash(`💌 ${f.name} davet edildi (SMS gitti).`);
    } catch (err) {
      flash(err?.message || 'Davet edilemedi.');
    }
  };

  // --- mod / görünüm ---------------------------------------------------------------
  const switchMode = (m) => {
    setMode(m);
    engineRef.current?.setMode(m);
    if (m === 'walk') setSel(null);
    if (m === 'build') setPanel(null);
  };
  // v77: 3 görünüm sırayla — 3D (varsayılan) → 2D (kuş bakışı) → Göz (karakterin gözünden)
  const toggleView = () => {
    const v = view === '3d' ? '2d' : view === '2d' ? 'fp' : '3d';
    setView(v);
    engineRef.current?.setView(v);
    if (v === 'fp') flash('👁️ Göz görüşü: etrafa bakmak için ekranı kaydır, yürümek için yere dokun.');
  };

  // --- sepet / envanter ------------------------------------------------------------
  const serverOwned = useMemo(() => ownedCount(houseDoc?.items), [houseDoc?.items]);
  const localOwned = useMemo(() => ownedCount(design?.items), [design?.items]);
  const invView = useMemo(() => {
    const out = {};
    const keys = new Set([...Object.keys(inv.items || {}), ...Object.keys(serverOwned), ...Object.keys(localOwned)]);
    keys.forEach((k) => {
      const n = (inv.items?.[k] || 0) - ((localOwned[k] || 0) - (serverOwned[k] || 0));
      if (n > 0) out[k] = n;
    });
    return out;
  }, [inv.items, serverOwned, localOwned]);
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
      if (it.p !== 1) add(it.k, CATALOG_MAP[it.k]?.name || it.k, CATALOG_MAP[it.k]?.price);
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
  }, [design, inv.walls, inv.floors]);

  const doCheckout = async () => {
    const eng = engineRef.current;
    if (!eng || busy) return;
    setBusy(true);
    clearTimeout(saveTimerRef.current);
    pendingDesignRef.current = null;
    const dsg = eng.getDesign();
    try {
      const res = await enqueue(() => houseAction({ op: 'checkout', houseId, design: { items: dsg.items, wall: dsg.wall, floor: dsg.floor }, expect: { gold: cart.gold, gem: cart.gem } }));
      const owned = { ...dsg, items: dsg.items.map((it) => ({ ...it, p: 1 })) };
      eng.deselect();
      eng.setDesign(owned);
      setDesign(eng.getDesign());
      setSaveState('saved');
      setPanel(null);
      flash(`🎉 ${res.data?.count || ''} ürün senin! Güle güle kullan.`);
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
    setPanel('settings');
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
  const deviceOcc = (deviceId) => {
    const t = Date.now();
    return netOcc.filter((s) => s.deviceId === deviceId && s.uid !== user?.uid && t - Number(s.lastSeenMs || 0) < NET_SEEN_MS).length;
  };
  const deviceCap = (deviceId) => NET_DEVICE_CAP[(houseDoc?.items || []).find((it) => it.i === deviceId)?.k] || 1;
  const startNet = async (deviceId) => {
    try {
      const r = await shopAction({ op: 'netStart', houseId, itemId: deviceId, expect: netPrice });
      netActiveRef.current = true;
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
        } else if (r.charged) flash(`🖥️ Yeni dakika: −${r.charged.toLocaleString('tr-TR')} altın`);
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
    else flash(`✓ ${n} mobilya odaya kondu. İstersen yerlerini değiştir, sonra ⚙️ Ayarlar › İşletmeler › "${BIZ_TYPES[type].label} aç".`);
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
      } else flash(err?.message || 'Olmadı.');
    } finally {
      setBusy(false);
    }
  };

  // --- kamera ------------------------------------------------------------------------
  const openCamera = () => {
    const shot = engineRef.current?.captureFrame('image/jpeg', 0.82) || null;
    setCameraShot({ img: shot, pose: engineRef.current?.getCameraPose(), at: Date.now() });
    setCameraCaption('');
    setPanel('camera');
  };
  const shareCamera = async () => {
    setBusy(true);
    try {
      await createSixtagramPost(cameraCaption, { type: 'housePhoto', houseId, cam: cameraShot.pose, shotAgoMs: Math.max(0, Date.now() - (cameraShot.at || Date.now())) });
      setPanel(null);
      flash("📸 Sixtagram'da paylaşıldı!");
    } catch (err) {
      flash(err?.message || 'Paylaşılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const shelfItems = useMemo(() => CATALOG.filter((d) => d.cat === cat), [cat]);
  const invList = useMemo(() => Object.entries(invView).map(([k, n]) => ({ def: CATALOG_MAP[k], n })).filter((x) => x.def), [invView]);
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
    <div className="hs-root" onPointerDown={() => unlockAudio()}>
      <div ref={mountRef} className="hs-stage" key={engineKey} />

      {phase === 'loading' && (
        <div className="hs-loading">
          <div className="hs-spinner" />
          <p>Eve giriliyor…</p>
        </div>
      )}

      {phase === 'ready' && (
        <>
          {/* ÜST ÇUBUK */}
          <div className="hs-top">
            <button className="hs-icon-btn" onClick={() => exit()} title="Evden çık">✕</button>
            <div className="hs-title">
              <b>{bizType ? BIZ_TYPES[bizType].icon : '🏠'} {houseName}</b>
              <span>
                {online.length} kişi evde
                {isOwner && mode === 'build' && (
                  <em className={`hs-save ${saveState}`}>
                    {saveState === 'saved' ? '✓ Kaydedildi' : saveState === 'saving' ? 'Kaydediliyor…' : saveState === 'error' ? '⚠ Kaydedilemedi' : '• Değişiklik var'}
                  </em>
                )}
              </span>
            </div>
            <NetCreditRing houseId={houseId} />
            {mode === 'walk' && (
              <button className="hs-view-btn" onClick={toggleView} title="Görünümü değiştir">
                {view === '3d' ? '3D' : view === '2d' ? '2D' : '👁️ Göz'}
              </button>
            )}
            {isOwner && (
              <div className="hs-seg">
                <button className={mode === 'build' ? 'on' : ''} onClick={() => switchMode('build')}><i className="hs-ico">🛠️ </i>Tasarla</button>
                <button className={mode === 'walk' ? 'on' : ''} onClick={() => switchMode('walk')}><i className="hs-ico">🚶 </i>Gez</button>
              </div>
            )}
            {isOwner && (
              <button className={`hs-icon-btn${intentReady ? ' cue-pulse' : ''}${houseDoc?.bizShortagePending ? ' hb-dot' : ''}`} onClick={openSettings} title="Ayarlar">⚙️</button>
            )}
          </div>

          {/* v77 — MEKÂN ÜST BUTONLARI (işletme türüne göre) */}
          {bizType && mode === 'walk' && BIZ_TOP_BUTTONS[bizType] && (
            <div className="hb-topbtns">
              {BIZ_TOP_BUTTONS[bizType].map((b) => (
                <button key={b.panel} className="hb-topbtn" onClick={() => setPanel(b.panel)}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
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
                    flash(`${HOUSE_PRODUCTS[r.product]?.emoji || ''} ${r.label}${r.price ? ` −${r.price.toLocaleString('tr-TR')}` : ''}`);
                  }}
                />
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
          {isOwner && mode === 'build' && (
            <div className="hs-cartbar">
              <div className="hs-balance">
                <span>Bakiye</span>
                <Money gold={Number(player?.gold || 0)} gem={Number(player?.emerald || 0)} small />
                {Number(player?.emerald || 0) === 0 && <PriceTag price={{ t: 'gem', v: 0 }} small />}
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

          {isOwner && mode === 'build' && showHelp && (
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
              <span>Eşyayı <b>sürükle</b>: taşı · <b>dokun</b>: seç (döndür, renk, kaldır). Kaldırdığın satın alınmış eşya <b>Envanter</b>'e gider.</span>
              <span>Boş alanı sürükle: kamerayı çevir · İki parmak: yakınlaş/kaydır.</span>
              <i>Kapatmak için dokun</i>
            </div>
          )}

          {/* SEÇİLİ EŞYA */}
          {isOwner && mode === 'build' && sel && (
            <div className="hs-selbar">
              <div className="hs-selbar-head">
                <b>{sel.def?.name}</b>
                {sel.p === 1 ? <span className="hs-owned-badge">✓ Senin</span> : <span className="hs-trial-badge">Deneme</span>}
                {sel.p !== 1 && <PriceTag price={sel.def?.price} small />}
                <button className="hs-x" onClick={() => engineRef.current?.deselect()}>✕</button>
              </div>
              {sel.def?.tints && (
                <div className="hs-swatches">
                  {TINTS[sel.def.tints].map((t, i) => (
                    <button key={t.n} className={`hs-sw${(sel.c || 0) === i ? ' on' : ''}`} style={{ background: t.c }} title={t.n} onClick={() => engineRef.current?.tintSelected(i)} />
                  ))}
                </div>
              )}
              <div className="hs-selbar-actions">
                {!sel.def?.wall && <button onClick={() => engineRef.current?.rotateSelected(-1)}>↺</button>}
                {!sel.def?.wall && <button onClick={() => engineRef.current?.rotateSelected(1)}>↻</button>}
                <button onClick={() => engineRef.current?.duplicateSelected()}>⧉ Bir tane daha</button>
                <button className={`danger${removalBreaksBiz(houseDoc, design?.items, sel) ? ' cue-lock' : ''}`} onClick={requestDelete}>{sel.p === 1 ? '📦 Envantere' : '🗑 Kaldır'}</button>
              </div>
            </div>
          )}

          {/* TASARIM RAFI: Mağaza / Envanter */}
          {isOwner && mode === 'build' && (
            <div className={`hs-shelf${shelfOpen ? '' : ' closed'}`}>
              <div className="hs-shelf-main-tabs">
                <button className={tab === 'magaza' ? 'on' : ''} onClick={() => { setTab('magaza'); setShelfOpen(true); }}>🏬 Mağaza</button>
                <button className={tab === 'envanter' ? 'on' : ''} onClick={() => { setTab('envanter'); setShelfOpen(true); }}>
                  📦 Envanter{invList.length > 0 && <i>{invList.reduce((a, x) => a + x.n, 0)}</i>}
                </button>
                <button className="hs-undo" onClick={() => engineRef.current?.undo()} title="Geri al">↶</button>
                <button className="hs-shelf-toggle" onClick={() => setShelfOpen((v) => !v)}>{shelfOpen ? '▾' : '▴'}</button>
              </div>
              {shelfOpen && tab === 'magaza' && (
                <>
                  <div className="hs-shelf-tabs">
                    {CATEGORIES.map((c) => (
                      <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
                        {c.icon} {c.name}
                      </button>
                    ))}
                    <button className={cat === 'yuzey' ? 'on' : ''} onClick={() => setCat('yuzey')}>🎨 Duvar & Zemin</button>
                  </div>
                  {cat !== 'yuzey' && (
                    <div className="hs-shelf-items">
                      {shelfItems.map((d) => (
                        <button
                          key={d.k}
                          className="hs-card"
                          onClick={() => {
                            const r = engineRef.current?.addItem(d.k, 0);
                            if (r === 'limit') flash('Eşya sınırına ulaştın (300).');
                          }}
                        >
                          <ItemThumb k={d.k} icon={d.icon} />
                          <span className="hs-card-name">{d.name}</span>
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
                          {list.map((w) => {
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
              {shelfOpen && tab === 'envanter' && (
                <div className="hs-shelf-items">
                  {invList.length === 0 && <p className="hs-dim hs-inv-empty">Envanterin boş. Satın aldığın eşyaları odadan kaldırınca buraya gelir; buradan istediğin evine koyabilirsin.</p>}
                  {invList.map(({ def, n }) => (
                    <button key={def.k} className="hs-card" onClick={() => engineRef.current?.addItem(def.k, 0, { owned: true })}>
                      <ItemThumb k={def.k} icon={def.icon} />
                      <span className="hs-card-name">{def.name}</span>
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
                        🎮 {full ? 'Dolu' : 'Oyna'} · {occ}/{cap} kişi · <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {netPrice} / dakika
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
                  // piyano başkası tarafından çalınıyorsa: soluk + silüet
                  if (a.panel === 'piano' && pianoPlayer && pianoPlayer.uid !== user?.uid) {
                    return (
                      <button key={a.label} className="hs-act cue-dim" onClick={() => doAction(a)}>
                        🎹 Dolu — {pianoPlayer.name} çalıyor
                      </button>
                    );
                  }
                  return (
                    <button key={a.label} className={`hs-act${a.kind === 'take' ? ' take' : ''}`} onClick={() => doAction(a)}>
                      {a.kind === 'take' ? (
                        <>
                          <HeldIcon product={a.product} size={20} /> {HOUSE_PRODUCTS[a.product]?.label} al
                        </>
                      ) : (
                        a.label
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {mode === 'walk' && myHolding && (
            <div className="hs-holding">
              <HeldIcon product={myHolding} size={22} /> Elinde: <b>{HOUSE_PRODUCTS[myHolding]?.label}</b>
              <em>👥'dan ısmarlayabilirsin</em>
            </div>
          )}

          {/* SOHBET */}
          <div className={`hs-chat${mode === 'build' ? ' build' : ''}${chatExpanded ? ' expanded' : ''}`}>
            <div className="hs-chat-feed" onClick={() => setChatExpanded((v) => !v)}>
              {(chatExpanded ? messages : messages.slice(-4)).map((m) => (
                <div key={m.id} className={`hs-msg${m.uid === user.uid ? ' me' : ''}`}>
                  <b>{m.name}:</b> {m.text}
                </div>
              ))}
              {messages.length === 0 && <div className="hs-msg dim">Evdekilerle sohbet et 👋</div>}
            </div>
            <div className="hs-chat-row">
              <input value={chatText} maxLength={200} placeholder="Mesaj yaz…" onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }} />
              <button onClick={sendChat} disabled={chatBusy || !chatText.trim()}>Gönder</button>
            </div>
          </div>

          {toast && <div className="hs-toast">{toast}</div>}
          {gift && (
            <GiftNote gift={gift} onDone={clearGift} />
          )}

          {/* ODADAKİLER */}
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
                      <button onClick={() => invite(f)}>💌 Davet</button>
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
                  <b>⚙️ {bizType ? `${BIZ_TYPES[bizType].icon} ${BIZ_TYPES[bizType].label}` : 'Ev Ayarları'}</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                <label className="hs-field-label">{bizType ? 'Adı' : 'Evin adı'}</label>
                <input className="hh-input" value={settingsDraft.name} maxLength={30} onChange={(e) => setSettingsDraft((d) => ({ ...d, name: e.target.value }))} placeholder="örn. Neon Kafe, Garaj 34, Çete Mekanı" />
                {bizType ? (
                  <BizSettings houseId={houseId} houseDoc={houseDoc} />
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
                <button className={`hs-btn ghost wide hb-open-list${intentReady ? ' cue-pulse' : ''}`} disabled={busy} onClick={() => setPanel('biz')}>
                  🏪 İşletmeler{bizIntent ? ` · ${BIZ_TYPES[bizIntent].icon}` : ''}
                </button>
              </div>
            </div>
          )}

          {/* v77 — İŞLETMELER */}
          {panel === 'biz' && (
            <BizListPanel
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
            />
          )}
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
                  <span>Bakiyen</span>
                  <Money gold={Number(player?.gold || 0)} gem={Number(player?.emerald || 0)} small />
                </div>
                {(Number(player?.gold || 0) < cart.gold || Number(player?.emerald || 0) < cart.gem) && (
                  <p className="hs-err">
                    {Number(player?.gold || 0) < cart.gold ? 'Altının yetmiyor. ' : ''}
                    {Number(player?.emerald || 0) < cart.gem ? 'Zümrütün yetmiyor (Telefon > Zümrüt Mağazası).' : ''}
                  </p>
                )}
                <div className="hh-modal-row">
                  <button className="hs-btn ghost" disabled={busy} onClick={() => setPanel(null)}>Vazgeç</button>
                  <button
                    className="hs-btn gold"
                    disabled={busy || Number(player?.gold || 0) < cart.gold || Number(player?.emerald || 0) < cart.gem}
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

          {/* KAMERA */}
          {panel === 'camera' && cameraShot && (
            <div className="hs-modal-bg" onClick={() => !busy && setPanel(null)}>
              <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="hs-modal-head">
                  <b>📷 Fotoğraf Çek</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                {cameraShot.img && <img className="hs-shot" src={cameraShot.img} alt="" />}
                <input className="hh-input" value={cameraCaption} maxLength={200} placeholder="Fotoğrafa bir açıklama yaz…" onChange={(e) => setCameraCaption(e.target.value)} />
                <button className="hs-btn gold wide" disabled={busy} onClick={shareCamera}>{busy ? 'Paylaşılıyor…' : "📤 Sixtagram'da Paylaş"}</button>
              </div>
            </div>
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

function GiftNote({ gift, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4500);
    return () => clearTimeout(t);
  }, [gift, onDone]);
  const p = HOUSE_PRODUCTS[gift.itemId];
  return (
    <div className="hs-toast gift">
      🎁 <b>{gift.from}</b> sana {p ? `${p.emoji} ${p.label}` : 'bir ikram'} ısmarladı!
    </div>
  );
}
