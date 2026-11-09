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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useInventory } from '../../hooks/useInventory';
import { useVehicles } from '../../hooks/useVehicles';
import { useBlocks } from '../../contexts/BlocksContext';
import { useBackClose } from '../../lib/backStack';
import { blockProfanity } from '../../lib/profanityGuard';
import { buyFromVendor, buyFromBufe, sellContrabandAtPark, cityAction, createSixtagramPost } from '../../services/gameActions';
import { invalidateSixtagramFeed } from '../../hooks/useSixtagramFeed';
import PhotoStoryEditor from '../HouseScreen/PhotoStoryEditor';
import { vehicleCatalog } from '../../data/vehicleCatalog.js';
import mapImg from '../../assets/sehir-haritasi.jpg';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { VENUES } from '../../../functions/venueLayouts.js';
import { VENDORS, VENDOR_COST } from '../../../functions/vendorData.js';
import HeldIcon from '../HouseScreen/HeldIcon';
import PhoneScreen from '../Phone/PhoneScreen';
import PlayerCard from '../PlayerCard/PlayerCard';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import ShadyDealPanel from '../ShadyDeal/ShadyDealPanel';
import SaleToast from '../ShadyDeal/SaleToast';
import { EMOTES } from '../HouseScreen/houseEngine';
import { createCityEngine } from './cityEngine.js';
import { createCityNet } from './cityNet.js';
import { setLiveCityEngine } from './cityPhotoHub.js';
import { renderCityPhotoUrl } from './CityPhoto.jsx';
import '../HouseScreen/HouseScreen.css';
import '../Venue3D/Venue3D.css';
import '../../styles/worldScreenChrome.css';
import '../Workshop/Workshop.css';
import '../../styles/bizui.css';
import './City.css';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
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

// --- gerçek harita resmi ↔ dünya eşlemesi ---------------------------------------
const MAP_PX = {
  camii: [180, 400], karakol: [370, 330], banka: [665, 320], galeri: [560, 490], spor: [1030, 420], belediye: [1360, 500],
  silah: [75, 560], modifiye: [330, 600], fabrika: [800, 620], netkafe: [1050, 710], casino: [130, 750], park: [640, 820],
  bar: [1240, 850], cafe: [1450, 1020], pist: [400, 980], stadyum: [1050, 1150], ev: [690, 1200], liman: [300, 1230],
};
const MAP_SIZE = 1600;
function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = m[k][i] / m[i][i];
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = m[i][3];
    for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}
function buildMapping(lots) {
  const pts = [];
  lots.forEach((l) => {
    const px = MAP_PX[l.type];
    if (px) pts.push({ x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2, u: px[0], v: px[1], lot: l });
  });
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const bu = [0, 0, 0];
  const bv = [0, 0, 0];
  pts.forEach((p) => {
    const r = [p.x, p.z, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j];
      bu[i] += r[i] * p.u;
      bv[i] += r[i] * p.v;
    }
  });
  const a = solve3(A, bu);
  const b = solve3(A, bv);
  const aff = (x, z) => [a[0] * x + a[1] * z + a[2], b[0] * x + b[1] * z + b[2]];
  pts.forEach((p) => {
    const [u, v] = aff(p.x, p.z);
    p.du = p.u - u;
    p.dv = p.v - v;
  });
  const S2 = 2 * 26 * 26;
  const toImg = (x, z) => {
    let [u, v] = aff(x, z);
    let su = 0;
    let sv = 0;
    let sw = 0;
    pts.forEach((p) => {
      const w = Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / S2);
      su += w * p.du;
      sv += w * p.dv;
      sw += w;
    });
    const k = 1 / Math.max(1, sw);
    return [u + su * k, v + sv * k];
  };
  return { toImg, pts };
}

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
  const usable = vehicles.filter((v) => !v.listed && !v.seizedByBank);
  return (
    <Sheet title="🚗 Arabalarım" onClose={onClose} closeLabel="Kapat">
      {loading && <div className="cs-garage-empty">…</div>}
      {!loading && usable.length === 0 && (
        <div className="cs-garage-empty">
          <span>🚗</span>
          <button className="v3-btn primary" onClick={onGallery}>Araba Galerisi</button>
        </div>
      )}
      <div className="cs-garage">
        {usable.map((v) => {
          const c = vehicleCatalog.find((x) => x.id === v.catalogId);
          if (!c) return null;
          return (
            <button key={v.id} className="cs-car" onClick={() => onPick(c, v)}>
              <img src={c.image} alt="" />
              <b>{v.customName || c.name}</b>
              <span>👥 {({ 1: 4, 2: 4, 3: 4, 4: 2, 5: 4, 6: 2, 7: 2, 8: 2, 9: 1, 10: 2 })[c.id] || 2}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export default function CityScreen({ spawn = 'ev', onClose, onEnterRegion, onOpenHeist }) {
  const { user } = useAuth();
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
  const [toast, setToast] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [run, setRun] = useState(false);
  const [muted, setMuted] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
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
  const [offline, setOffline] = useState(false);
  const [card, setCard] = useState(null);
  const [report, setReport] = useState(null);
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
  const uid = user?.uid || null;
  useEffect(() => {
    if (!uid) return undefined;
    let eng = null;
    let net = null;
    let tickT = 0;
    let lastCrash = 0;
    const st = startRef.current;
    let tries = 0;
    let t = 0;
    const start = () => {
      // v147.1: grafik kurulamazsa ekran çökmesin (eskiden ana sayfaya atıyordu) — birkaç kez dene
      try {
        build();
      } catch (err) {
        console.error('Şehir kurulamadı:', err);
        try {
          eng?.dispose();
        } catch {
          /* yoksay */
        }
        eng = null;
        tries += 1;
        if (tries < 3) t = setTimeout(start, 700 * tries);
        else setFatal(true);
      }
    };
    const build = () => {
      eng = createCityEngine(stageRef.current, {
        uid,
        avatar: st.avatar,
        name: st.myName,
        spawn: st.spawn,
        onInteract: (z) => setZone(z),
        onTick: (s) => {
          hudRef.current = s;
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
          if (e.type === 'crash' && e.speed > 9 && Date.now() - lastCrash > 2500) {
            lastCrash = Date.now();
            flash('💥');
          }
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
          setMsgs((m) => [...m.slice(-30), { id: `${id}_${Date.now()}`, uid: id, name: n, text }]);
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
    t = setTimeout(start, 60);
    return () => {
      clearTimeout(t);
      clearInterval(tickT);
      net?.stop();
      setLiveCityEngine(null);
      eng?.dispose();
      engineRef.current = null;
      netRef.current = null;
    };
  }, [uid, flash, gen]); // sadece kullanıcı değişince / grafik yeniden kurulunca (user nesnesi yenilenince şehir baştan kurulmasın)

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
      } else if (!panel || (panel.kind !== 'phone' && panel.kind !== 'map')) {
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
    if (panel?.kind === 'phone') e.pause();
    else e.resume();
  }, [panel, ready]);
  // kişi sayısı (yakındakiler) — 2 sn'de bir motorun haritasından
  useEffect(() => {
    if (!ready) return undefined;
    const iv = setInterval(() => setOnline(engineRef.current?.remoteCount?.() || 0), 2000);
    return () => clearInterval(iv);
  }, [ready]);

  const lots = useMemo(() => (ready ? engineRef.current?.lots || [] : []), [ready]);
  const mapping = useMemo(() => (lots.length ? buildMapping(lots) : null), [lots]);

  // --- mini harita (gerçek harita resmi) ------------------------------------------------
  useEffect(() => {
    drawMiniRef.current = () => {
    const hud = hudRef.current;
    const c = miniRef.current;
    const img = imgRef.current;
    if (!c || !img || !mapping) return;
    const g = c.getContext('2d');
    const W = c.width;
    const [u, v] = mapping.toImg(hud.x, hud.z);
    const span = hud.driving ? 520 : 380;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0b0e18';
    g.fillRect(0, 0, W, W);
    g.drawImage(img, u - span / 2, v - span / 2, span, span, 0, 0, W, W);
    const k = W / span;
    if (hud.car && !hud.driving) {
      const [cu, cv] = mapping.toImg(hud.car.x, hud.car.z);
      g.font = `${Math.round(W * 0.12)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🚗', W / 2 + (cu - u) * k, W / 2 + (cv - v) * k);
    }
    const fx = -Math.sin(hud.yaw);
    const fz = -Math.cos(hud.yaw);
    const [au, av] = mapping.toImg(hud.x + fx * 6, hud.z + fz * 6);
    const ang = Math.atan2(av - v, au - u);
    g.translate(W / 2, W / 2);
    g.rotate(ang);
    g.fillStyle = 'rgba(25,232,255,0.28)';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, W * 0.32, -0.5, 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd23f';
    g.strokeStyle = '#111';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W * 0.09, 0);
    g.lineTo(-W * 0.055, W * 0.055);
    g.lineTo(-W * 0.025, 0);
    g.lineTo(-W * 0.055, -W * 0.055);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    };
    drawMiniRef.current();
    return () => {
      drawMiniRef.current = null;
    };
  }, [mapping, imgOk]);

  const bigLayout = useRef(null);
  useEffect(() => {
    if (!mapOpen) return undefined;
    const iv = setInterval(() => setMapTick((n) => n + 1), 500);
    return () => clearInterval(iv);
  }, [mapOpen]);
  useEffect(() => {
    if (!mapOpen) return;
    const hud = hudRef.current;
    const c = bigRef.current;
    const img = imgRef.current;
    if (!c || !img || !mapping) return;
    c.width = c.clientWidth * 2;
    c.height = c.clientHeight * 2;
    const g = c.getContext('2d');
    const s = Math.min(c.width, c.height) / MAP_SIZE;
    const ox = (c.width - MAP_SIZE * s) / 2;
    const oy = (c.height - MAP_SIZE * s) / 2;
    bigLayout.current = { s, ox, oy };
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, ox, oy, MAP_SIZE * s, MAP_SIZE * s);
    const dot = (x, z, col, r, label) => {
      const [u, v] = mapping.toImg(x, z);
      const px = ox + u * s;
      const py = oy + v * s;
      g.fillStyle = col;
      g.strokeStyle = '#000';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (label) {
        g.font = `${r * 2.2}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, px, py - r * 2.2);
      }
    };
    if (hud.car && !hud.driving) dot(hud.car.x, hud.car.z, '#19e8ff', 10, '🚗');
    dot(hud.x, hud.z, '#ffd23f', 14, '📍');
  }, [mapOpen, mapping, imgOk, mapTick]);
  const onBigTap = (e) => {
    const c = bigRef.current;
    const L = bigLayout.current;
    if (!c || !L || !mapping) return;
    const r = c.getBoundingClientRect();
    const u = (((e.clientX - r.left) / r.width) * c.width - L.ox) / L.s;
    const v = (((e.clientY - r.top) / r.height) * c.height - L.oy) / L.s;
    let best = null;
    let bd = Infinity;
    mapping.pts.forEach((p) => {
      const d = Math.hypot(p.u - u, p.v - v);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    if (best && bd < 170) {
      setMapOpen(false);
      const l = best.lot;
      const tgt = l.door || { x: (l.x0 + l.x1) / 2, z: l.z1 + 1.5 };
      engineRef.current.teleport(tgt.x, tgt.z + 2.5);
      flash(`📍 ${l.icon} ${l.name}`);
    }
  };

  // --- geri tuşu: panel → araba → yolculuk → şehirden çık ------------------------------------
  useBackClose(true, () => {
    const e = engineRef.current;
    if (report) return setReport(null);
    if (card) return setCard(null);
    if (mapOpen) return setMapOpen(false);
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
  const callCar = (c) => {
    const r = engineRef.current.callCar(c.id);
    setPanel(null);
    flash(r.ok ? `🚗 ${c.name}` : r.reason);
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
      holdFor(v.product);
      const npc = VENUES[z.vendor].npcs?.[0];
      if (npc) engineRef.current.npcSay(npc.id, 'Afiyet olsun!');
      flash(`${HOUSE_PRODUCTS[v.product]?.emoji || '🛍️'} ${HOUSE_PRODUCTS[v.product]?.label} · −${fmt(VENDOR_COST)} · 🕵️ −5`);
    } catch (e) {
      flash(e?.message || 'Alışveriş yapılamadı.');
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

  const sendChat = (text) => {
    if (blockProfanity(text)) return false;
    if (!netRef.current?.say(text) && !netRef.current?.isOffline()) {
      flash('Biraz yavaş 🙂');
      return false;
    }
    engineRef.current?.say(text);
    setMsgs((m) => [...m.slice(-30), { id: `me_${Date.now()}`, uid: user?.uid, name: myName, text, me: true }]);
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
  if (zone && !driving && !riding) {
    const list = [];
    if (zone.kind === 'door') list.push({ label: zone.label || `${zone.title.split(' ')[0]} İçeri gir`, cls: 'take', on: () => onEnterRegion?.(zone.region) });
    if (zone.kind === 'vendor') {
      const v = vendorOf(zone);
      if (!vendorDone(v)) {
        list.push({ label: '🛍️ Alışveriş yap', cls: 'take', on: () => vendorBuy(zone) });
        list.push({ label: '💰 Haraç kes', cls: 'heist', on: () => onOpenHeist?.(v.id) });
      }
      list.push({ label: '🧾 Menü', on: () => setPanel({ kind: 'menu', zone }) });
    }
    if (zone.kind === 'park' && zone.act === 'bufe') list.push({ label: '🌭 Büfe', on: () => setPanel({ kind: 'bufe' }) });
    if (zone.kind === 'park' && zone.act === 'npc') list.push({ label: '🕶️ Şüpheli adam', on: () => setPanel({ kind: 'shady' }) });
    if (zone.kind === 'pist') list.push({ label: '🏁 Yarış Pisti', cls: 'take', on: () => onEnterRegion?.('yaris_pisti') });
    if (zone.kind === 'atm') list.push({ label: '🏧 Banka', cls: 'take', on: () => setPanel({ kind: 'phone', app: 'banka' }) });
    if (zone.kind === 'car') {
      list.push({ label: '🚗 Bin', cls: 'take', on: () => engineRef.current.enterCar() });
      list.push({ label: '🔁 Başka araba', on: () => setPanel({ kind: 'garage' }) });
      list.push({ label: '🅿️ Kaldır', on: () => engineRef.current.removeMyCar() });
    }
    if (zone.kind === 'ride') list.push({ label: '🚗 Yolcu ol', cls: 'take', on: () => rideIn(zone) });
    if (zone.kind === 'seat') list.push({ label: '🪑 Otur', cls: 'take', on: () => engineRef.current.sit(zone.seat) });
    if (zone.kind === 'seated') list.push({ label: '🧍 Kalk', on: () => engineRef.current.stand() });
    actions = { title: zone.title, list };
  }

  const zoneName = driving ? `🚗 ${drive?.name || ''}` : riding ? '🚗 Yolcu' : zone ? zone.title : '🌆 Neon Şehir';
  const cardInfo = card ? namesRef.current.get(card) : null;

  return (
    <div className={`hs-root cs-root${driving ? ' driving' : ''}`}>
      <div className="hs-stage" ref={stageRef} />
      {!ready && !fatal && (
        <div className="hs-loading cs-loading">
          <div className="hs-spinner" />
          <p>Neon Şehir…</p>
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
            <div className="hs-title">
              <b>{zoneName}</b>
              <span>
                {offline ? '⚠️ çevrimdışı' : `${online + 1} kişi yakında`}
              </span>
            </div>
            <button className="hs-view-btn" onClick={toggleView} title="Görünüm">{view === '3d' ? '3D' : '2D'}</button>
          </div>
          {!driving && (
            <div className="v3-menu">
              <div className={`v3-badge v3-sus ${susCls}`}>🕵️ Şüphe <b>%{sus}</b></div>
              <div className="v3-badge cs-gold"><span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> <b>{fmt(gold)}</b></div>
            </div>
          )}
          <canvas className="cs-mini" ref={miniRef} width={260} height={260} onClick={() => setMapOpen(true)} />
          <div className={`hs-side${driving ? ' cs-drive-side' : ''}`}>
            {!driving && !riding && (
              <button className={`hs-side-btn${panel?.kind === 'emotes' ? ' on' : ''}`} onClick={() => setPanel(panel?.kind === 'emotes' ? null : { kind: 'emotes' })} title="Hareketler">😀</button>
            )}
            {panel?.kind === 'emotes' && (
              <div className="hs-emotes">
                {EMOTES.map((e) => (
                  <button key={e.key} onClick={() => { engineRef.current.emote(e.key); setPanel(null); }}>
                    <span>{e.emoji}</span>
                    {e.label}
                  </button>
                ))}
              </div>
            )}
            {!driving && !riding && <button className="hs-side-btn cs-carbtn" onClick={() => setPanel({ kind: 'garage' })} title="Arabalarım">🚗</button>}
            {!driving && !riding && <button className={`hs-side-btn${run ? ' on' : ''}`} onClick={() => { setRun(!run); engineRef.current.setRun(!run); }} title="Koş">{run ? '🏃' : '🚶'}</button>}
            <button className="hs-side-btn" onClick={() => setPanel({ kind: 'phone', app: 'chatsapp' })} title="ChatsApp">💬</button>
            <button className="hs-side-btn" onClick={() => setPanel({ kind: 'phone', app: null })} title="Telefon">📱</button>
            <button className="hs-side-btn" onClick={openCamera} title="Fotoğraf çek">📷</button>
          </div>
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
              <button className="hs-act" onClick={rideOut}>🚪 İn</button>
            </div>
          )}
          {driving && (
            <div className="cs-drive">
              <div className="cs-drive-top">
                <button className="hs-act" onClick={() => engineRef.current.exitCar()}>🚪 İn</button>
                <button className="cs-round sm" onClick={() => { const m = !muted; setMuted(m); engineRef.current.setMuted(m); }}>{muted ? '🔇' : '🔊'}</button>
              </div>
              <div className="cs-steer">
                <HoldBtn className="cs-round" onHold={(on) => setDrive({ steer: on ? -1 : 0 })}>◀</HoldBtn>
                <HoldBtn className="cs-round" onHold={(on) => setDrive({ steer: on ? 1 : 0 })}>▶</HoldBtn>
              </div>
              <Speedo kmh={drive?.kmh || 0} gear={drive?.gear || 'N'} ratio={drive?.ratio || 0} />
              <div className="cs-pedals">
                <button className="cs-round sm" onPointerDown={() => engineRef.current.horn()}>📯</button>
                <HoldBtn className="cs-round sm hb" onHold={(on) => setDrive({ hand: on })}>🅿️</HoldBtn>
                <HoldBtn className="cs-pedal brake" onHold={(on) => setDrive({ thr: on ? -1 : 0 })}>FREN</HoldBtn>
                <HoldBtn className="cs-pedal gas" onHold={(on) => setDrive({ thr: on ? 1 : 0 })}>GAZ</HoldBtn>
              </div>
            </div>
          )}
          {!driving && (
            <div className="hs-chat">
              <div className="hs-chat-feed">
                {msgs.slice(-3).map((m) => (
                  <div
                    key={m.id}
                    className={`hs-msg${m.me ? ' me' : ''}`}
                    onClick={() => !m.me && setReport({ uid: m.uid, name: m.name, text: m.text })}
                  >
                    <b>{m.name}:</b> {m.text}
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
          onPick={(c) => callCar(c)}
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
      {panel?.kind === 'shady' && (
        <Sheet title="🕶️ Şüpheli Adam" onClose={() => setPanel(null)}>
          <ShadyDealPanel qty={inventory?.yasakliMadde || 0} busy={busy === 'risky' || busy === 'safe' ? busy : null} onSell={shadySell} />
        </Sheet>
      )}
      <SaleToast result={sellResult} onClose={() => setSellResult(null)} />
      {panel?.kind === 'phone' && <PhoneScreen onClose={() => setPanel(null)} initialApp={panel.app} />}
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
      {mapOpen && (
        <div className="cs-bigmap" onClick={() => setMapOpen(false)}>
          <div className="cs-bigmap-head" onClick={(e) => e.stopPropagation()}>
            <b>🗺️ Neon Şehir</b>
            <span>📍</span>
            <button className="bz-x" onClick={() => setMapOpen(false)}>✕</button>
          </div>
          <canvas ref={bigRef} onClick={(e) => { e.stopPropagation(); onBigTap(e); }} />
        </div>
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
