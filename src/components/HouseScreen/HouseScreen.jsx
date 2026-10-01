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
import { createHouseEngine, getThumb, EMOTES } from './houseEngine';
import { CATALOG, CATALOG_MAP, CATEGORIES, TINTS } from './houseCatalog';
import { FLOORS, WALLS } from './houseTextures';
import { FREE_SURFACES, HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { TRACKS, playTrack, stopMusic, unlockAudio, setVolume, getVolume } from './houseAudio';
import ArcadeGame from './ArcadeGame';
import PhoneScreen from '../Phone/PhoneScreen';
import PlayerCard from '../PlayerCard/PlayerCard';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
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
const SAVE_DEBOUNCE_MS = 1200;
const PRIVACY = [
  { key: 'public', label: '🌐 Herkese açık', hint: 'Herkes evini listede görür ve girebilir.' },
  { key: 'friends', label: '👥 Arkadaşlar', hint: 'Sadece arkadaşların girebilir.' },
  { key: 'private', label: '🔒 Gizli', hint: 'Kimse giremez (içeridekiler atılmaz, davet ettiklerin girebilir).' },
];

// --- küçük resim kuyruğu ---------------------------------------------------------
const thumbQueue = [];
let thumbBusy = false;
function pumpThumbs() {
  if (thumbBusy) return;
  const job = thumbQueue.shift();
  if (!job) return;
  if (!job.alive()) {
    pumpThumbs();
    return;
  }
  thumbBusy = true;
  setTimeout(() => {
    const url = getThumb(job.k, job.ti);
    if (job.alive()) job.cb(url);
    thumbBusy = false;
    pumpThumbs();
  }, 12);
}
function ItemThumb({ k, ti = 0, icon }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    thumbQueue.push({ k, ti, cb: (u) => setUrl(u), alive: () => alive });
    pumpThumbs();
    return () => {
      alive = false;
    };
  }, [k, ti]);
  return url ? <img className="hs-thumb" src={url} alt="" draggable={false} /> : <span className="hs-thumb hs-thumb-emoji">{icon}</span>;
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
    return enqueue(async () => {
      try {
        await houseAction({ op: 'save', houseId, design: dsg });
        setSaveState(pendingDesignRef.current ? 'dirty' : 'saved');
      } catch (err) {
        console.error('Ev kaydı başarısız:', err);
        setSaveState('error');
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
        // ev sahibi beni çıkardıysa konum kaydım silinir
        if (!meThere && enteredRef.current && !leavingRef.current && !snap.metadata?.hasPendingWrites) {
          exit('Ev sahibi seni evden çıkardı.');
        }
      },
      (err) => console.error('Ev presence hatası:', err)
    );
  }, [phase, houseId, user?.uid, exit, engineKey]);

  useEffect(() => {
    if (phase !== 'ready') return undefined;
    let last = '';
    let lastAt = 0;
    const iv = setInterval(() => {
      const eng = engineRef.current;
      if (!eng || document.hidden || leavingRef.current) return;
      const st = eng.getSelfState();
      const em = lastEmoteRef.current;
      const sig = `${st.x}|${st.z}|${st.seat}|${st.left}|${em.ts}`;
      const now = Date.now();
      if (sig === last && now - lastAt < 10_000) return;
      last = sig;
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
    const r = engineRef.current?.interact(a);
    if (!r) return;
    if (r.kind === 'take') {
      try {
        const res = await houseAction({ op: 'take', houseId, itemId: r.itemId, product: r.product });
        flash(`${HOUSE_PRODUCTS[r.product]?.emoji || ''} ${res.data?.label || 'Ürün'} elinde (2 dk)`);
      } catch (err) {
        flash(err?.message || 'Alınamadı.');
      }
    } else if (r.kind === 'panel') {
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
  const toggleView = () => {
    const v = view === '3d' ? '2d' : '3d';
    setView(v);
    engineRef.current?.setView(v);
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
      flash(err?.message || 'Satın alınamadı.');
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

  // --- kamera ------------------------------------------------------------------------
  const openCamera = () => {
    const c = mountRef.current?.querySelector('canvas');
    let shot = null;
    try {
      shot = c?.toDataURL('image/jpeg', 0.8) || null;
    } catch {
      shot = null;
    }
    setCameraShot({ img: shot, pose: engineRef.current?.getCameraPose() });
    setCameraCaption('');
    setPanel('camera');
  };
  const shareCamera = async () => {
    setBusy(true);
    try {
      await createSixtagramPost(cameraCaption, { type: 'housePhoto', houseId, cam: cameraShot.pose });
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
              <b>🏠 {houseName}</b>
              <span>
                {online.length} kişi evde
                {isOwner && mode === 'build' && (
                  <em className={`hs-save ${saveState}`}>
                    {saveState === 'saved' ? '✓ Kaydedildi' : saveState === 'saving' ? 'Kaydediliyor…' : saveState === 'error' ? '⚠ Kaydedilemedi' : '• Değişiklik var'}
                  </em>
                )}
              </span>
            </div>
            {mode === 'walk' && (
              <button className="hs-view-btn" onClick={toggleView} title="Görünümü değiştir">
                {view === '3d' ? '3D' : '2D'}
              </button>
            )}
            {isOwner && (
              <div className="hs-seg">
                <button className={mode === 'build' ? 'on' : ''} onClick={() => switchMode('build')}><i className="hs-ico">🛠️ </i>Tasarla</button>
                <button className={mode === 'walk' ? 'on' : ''} onClick={() => switchMode('walk')}><i className="hs-ico">🚶 </i>Gez</button>
              </div>
            )}
            {isOwner && (
              <button className="hs-icon-btn" onClick={openSettings} title="Ayarlar">⚙️</button>
            )}
          </div>

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
                <button className="danger" onClick={() => engineRef.current?.deleteSelected()}>{sel.p === 1 ? '📦 Envantere' : '🗑 Kaldır'}</button>
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
                interact.actions.map((a) => (
                  <button key={a.label} className={`hs-act${a.kind === 'take' ? ' take' : ''}`} onClick={() => doAction(a)}>
                    {a.label}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === 'walk' && myHolding && (
            <div className="hs-holding">
              {HOUSE_PRODUCTS[myHolding]?.emoji} Elinde: <b>{HOUSE_PRODUCTS[myHolding]?.label}</b>
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
                        {o.holding && <span title="Elinde">{HOUSE_PRODUCTS[o.holding]?.emoji}</span>}
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
                  <b>⚙️ Ev Ayarları</b>
                  <button className="hs-x" onClick={() => setPanel(null)}>✕</button>
                </div>
                <label className="hs-field-label">Evin adı</label>
                <input className="hh-input" value={settingsDraft.name} maxLength={30} onChange={(e) => setSettingsDraft((d) => ({ ...d, name: e.target.value }))} placeholder="örn. Neon Kafe, Garaj 34, Çete Mekanı" />
                <label className="hs-field-label">Evin türü</label>
                <div className="hs-privacy">
                  {PRIVACY.map((p) => (
                    <button key={p.key} className={settingsDraft.privacy === p.key ? 'on' : ''} onClick={() => setSettingsDraft((d) => ({ ...d, privacy: p.key }))}>
                      <b>{p.label}</b>
                      <span>{p.hint}</span>
                    </button>
                  ))}
                </div>
                <button className="hs-btn gold wide" disabled={busy} onClick={saveSettings}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
              </div>
            </div>
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

          {panel === 'arcade' && <ArcadeGame onClose={() => setPanel(null)} />}

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
