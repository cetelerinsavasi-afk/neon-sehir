import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { useParkPresence } from '../../hooks/useParkPresence';
import { enterPark, sellContrabandAtPark, buyFromBufe, createSixtagramPost } from '../../services/gameActions';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR, AVATAR_FULL_VIEWBOX_H, AVATAR_WAIST_Y } from '../../lib/avatarShapes';
import Hud from '../Hud/Hud';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PhoneScreen from '../Phone/PhoneScreen';
import ResultModal from '../ResultModal/ResultModal';
import InfoIcon from '../InfoIcon/InfoIcon';
import './ParkWorldScreen.css';

// --- Sahne düzeni -------------------------------------------------------
// "Park sabit, karakter yürüyor": kamera kaydırması YOK — canvas'ın
// kendisi tüm sahne. Koordinatlar doğrudan canvas piksel uzayında.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 260; // piksel / saniye
const PLAYER_R = 20;
const INTERACT_RADIUS = 78;
const CHAT_BUBBLE_MS = 9500;
const PARK_SELL_PRICE = 5000;
const SPRITE_ASPECT = 320 / 580;
const SPRITE_H = 118; // ekrandaki karakter boyu (piksel)
const HOLDING_MS = 120_000; // elde tutulan büfe ürünü 2 dakika sonra kaybolur

// --- Firebase maliyet ayarları (bkz. önceki not) -------------------------
const MOVE_SYNC_INTERVAL_MS = 300;
const MOVE_SYNC_MIN_DIST = 6;
const IDLE_HEARTBEAT_MS = 12_000;

// Fotoğraf önizlemesinde konuma göre arka plan (Sixtagram'daki gönderi
// kartıyla BİREBİR aynı renkler — bkz. PostAttachment.jsx SCENE_BG).
const CAMERA_SCENE_BG = {
  Park: 'linear-gradient(160deg, #1d3a2e 0%, #16341c 55%, #0f2415 100%)',
  Büfe: 'linear-gradient(160deg, #6b4226 0%, #4a2e18 55%, #2b1b12 100%)',
  Gölet: 'linear-gradient(160deg, #1d4a58 0%, #163a44 55%, #0f2830 100%)',
  Bank: 'linear-gradient(160deg, #2e5a34 0%, #234226 55%, #16341c 100%)',
  Masa: 'linear-gradient(160deg, #5a3a22 0%, #3f2717 55%, #2b1b12 100%)',
};

const BUFE_MENU = [
  { id: 'sosisli', label: 'Sosisli', price: 100 },
  { id: 'tost', label: 'Tost', price: 100 },
  { id: 'cay', label: 'Çay', price: 10 },
  { id: 'kahve', label: 'Kahve', price: 30 },
  { id: 'oralet', label: 'Oralet', price: 20 },
  { id: 'latte', label: 'Latte', price: 500 },
];

// --- Sahnedeki sabit nesneler --------------------------------------------
const BUFE = { cx: 340, cy: 180, hw: 90, hh: 50 };

// 4 kişilik masalar: büfenin solunda, sağında ve parkın sağ alt köşesinde.
const TABLES = [
  { id: 'table_left', cx: 140, cy: 300, r: 44 },
  { id: 'table_right', cx: 540, cy: 300, r: 44 },
  { id: 'table_br', cx: 560, cy: 970, r: 44 },
];
const TABLE_SEAT_OFFSET = 66;
function tableSeats(t) {
  return [
    { id: `${t.id}_N`, x: t.cx, y: t.cy - TABLE_SEAT_OFFSET, facing: 'down' },
    { id: `${t.id}_S`, x: t.cx, y: t.cy + TABLE_SEAT_OFFSET, facing: 'up' },
    { id: `${t.id}_E`, x: t.cx + TABLE_SEAT_OFFSET, y: t.cy, facing: 'left' },
    { id: `${t.id}_W`, x: t.cx - TABLE_SEAT_OFFSET, y: t.cy, facing: 'right' },
  ];
}

// 2 kişilik banklar — yola PARALEL, "sağdan sola" (yatay) duruyorlar.
// Bunlar dikey ana yoldan sağa-sola ayrılan bir T-kavşağının iki
// ucunda: solda 1, sağda 1.
const BENCH_Y_ROAD = 560; // T-kavşağının (yatay kolun) bulunduğu yükseklik
const BENCHES = [
  { id: 'bench_left', cx: 170, cy: BENCH_Y_ROAD - 55 },
  { id: 'bench_right', cx: 510, cy: BENCH_Y_ROAD - 55 },
];
const SEAT_DX = 30;
function benchSeats(b) {
  return [
    { id: `${b.id}_A`, x: b.cx - SEAT_DX, y: b.cy - 8, facing: 'down' },
    { id: `${b.id}_B`, x: b.cx + SEAT_DX, y: b.cy - 8, facing: 'down' },
  ];
}

const ALL_SEATS = [...BENCHES.flatMap(benchSeats), ...TABLES.flatMap(tableSeats)];

// Gölet — sadece dekoratif + hafif çarpışma (içine yürünmesin).
const POND = { cx: 520, cy: 760, rx: 70, ry: 46 };

const NPC_POS = { x: 140, y: 1030 };
// Parktaki "şüpheli adam" — gerçek avatar sistemiyle çizilir (emoji değil),
// sabit/kendine özgü bir görünümü var.
const NPC_AVATAR = {
  ...DEFAULT_AVATAR,
  gender: 'erkek',
  build: 'iri',
  skin: '#a86b3c',
  hairStyle: 'short',
  hairColor: '#0d0a08',
  clothing: 'trenchcoat',
  clothColor: '#22262f',
  pantsColor: '#0d0d0d',
  shoeColor: '#0d0d0d',
  faceAcc: 'sunglasses',
  hat: 'fedora',
  hatColor: '#0d0d0d',
  background: 'transparent',
};

// Yürüme sırasında (serbest gezinirken) çarpışılmaması gereken katı
// nesneler. NOT: bir oturma/etkileşim hedefine YÜRÜNÜRKEN bu liste
// bilerek devre dışı bırakılıyor (bkz. tick döngüsü) — aksi halde
// karakter "kendi hedefinin içine giremediği" için sonsuza dek
// yaklaşmaya çalışır (önceki sürümdeki bank/büfe kilitlenme hatası
// tam olarak buydu).
const OBSTACLES = [
  { cx: BUFE.cx, cy: BUFE.cy, hw: BUFE.hw, hh: BUFE.hh },
  ...TABLES.map((t) => ({ cx: t.cx, cy: t.cy, r: t.r + 6 })),
  ...BENCHES.map((b) => ({ cx: b.cx, cy: b.cy, hw: 58, hh: 24 })),
  { cx: POND.cx, cy: POND.cy, r: Math.max(POND.rx, POND.ry) - 4 },
];

function dist(a, b) {
  // BÜFE gibi sabit nesneler {cx,cy} ile tanımlı, koltuk/oyuncu
  // konumları {x,y} ile — ikisini de kabul et. (Önceki sürümde bu
  // fonksiyon sadece {x,y} bekliyordu, BÜFE'ye tıklamayı sessizce
  // NaN'a düşürüp hep "yanlış" sonuç veriyordu — büfe etkileşiminin
  // hiç çalışmamasının kök nedeni buydu.)
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}
function roundRectC(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function resolveObstacles(x, y) {
  let nx = x;
  let ny = y;
  for (const o of OBSTACLES) {
    const dx0 = nx - o.cx;
    const dy0 = ny - o.cy;
    if (o.r != null) {
      const d = Math.hypot(dx0, dy0);
      const minD = o.r + PLAYER_R;
      if (d < minD) {
        if (d < 0.001) { nx = o.cx + minD; ny = o.cy; }
        else { const scale = minD / d; nx = o.cx + dx0 * scale; ny = o.cy + dy0 * scale; }
      }
    } else if (Math.abs(dx0) < o.hw + PLAYER_R && Math.abs(dy0) < o.hh + PLAYER_R) {
      const overlapX = o.hw + PLAYER_R - Math.abs(dx0);
      const overlapY = o.hh + PLAYER_R - Math.abs(dy0);
      if (overlapX < overlapY) nx = o.cx + Math.sign(dx0 || 1) * (o.hw + PLAYER_R);
      else ny = o.cy + Math.sign(dy0 || 1) * (o.hh + PLAYER_R);
    }
  }
  nx = Math.max(30, Math.min(W - 30, nx));
  ny = Math.max(30, Math.min(H - 30, ny));
  return { x: nx, y: ny };
}

// BufeItemIcon — fiyat listesindeki küçük ürün görseli. Sahnedeki
// (canvas) elde-tutulan ikonlarla aynı görsel dili kullanır (bkz.
// drawHeldIcon) — emoji değil, çizilmiş küçük şekiller.
function BufeItemIcon({ id }) {
  switch (id) {
    case 'cay':
      return (
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path d="M6 4h12l-2.2 15.5a1.5 1.5 0 0 1-1.5 1.5H9.7a1.5 1.5 0 0 1-1.5-1.5L6 4z" fill="#d6432b" />
          <rect x="5" y="3" width="14" height="2.4" rx="1.2" fill="#a8321f" />
        </svg>
      );
    case 'kahve':
      return (
        <svg viewBox="0 0 24 24" width="30" height="30">
          <circle cx="12" cy="12.5" r="9" fill="#f4e6d0" />
          <circle cx="12" cy="11.3" r="7" fill="#4a2e18" />
        </svg>
      );
    case 'latte':
      return (
        <svg viewBox="0 0 24 24" width="30" height="30">
          <rect x="6.5" y="2.5" width="11" height="19" rx="3.5" fill="#e8c68a" />
          <rect x="7.7" y="10" width="8.6" height="10.5" rx="2.5" fill="#6b4226" />
          <ellipse cx="12" cy="6.5" rx="4.6" ry="3.2" fill="#f4e6d0" />
        </svg>
      );
    case 'oralet':
      return (
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path d="M5 5h14l-1.6 14.2A2 2 0 0 1 15.4 21H8.6a2 2 0 0 1-2-1.8L5 5z" fill="#e07a2c" />
        </svg>
      );
    case 'sosisli':
      return (
        <svg viewBox="0 0 34 22" width="34" height="22">
          <rect x="1" y="4" width="32" height="14" rx="7" fill="#e8c68a" />
          <rect x="6" y="9" width="22" height="5.5" rx="2.75" fill="#a83a2a" />
        </svg>
      );
    case 'tost':
      return (
        <svg viewBox="0 0 24 22" width="30" height="27">
          <rect x="2" y="2" width="20" height="18" rx="3.5" fill="#e8c68a" stroke="#a86b3c" strokeWidth="1.6" />
          <path d="M6 8 L18 8 M6 12 L18 12 M6 16 L14 16" stroke="#c99a5c" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ParkWorldScreen({ onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { inventory } = useInventory();
  const { others, updatePresence, clearPresence } = useParkPresence();

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'npc' | 'bufe' | null
  const [sittingSeatId, setSittingSeatId] = useState(null);
  const [holding, setHolding] = useState(null);
  const [chatText, setChatText] = useState('');
  const [myBubble, setMyBubble] = useState(null);
  const [sellBusy, setSellBusy] = useState(false);
  const [sellResult, setSellResult] = useState(null);
  const [bufeBusy, setBufeBusy] = useState(null);
  const [error, setError] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFriends, setCameraFriends] = useState([]);
  const [cameraScene, setCameraScene] = useState('Park');
  const [cameraPose, setCameraPose] = useState('idle');
  const [cameraCaption, setCameraCaption] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraDone, setCameraDone] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const canvasRef = useRef(null);
  const staticCanvasRef = useRef(null);
  const posRef = useRef({ x: 340, y: 700 });
  const targetRef = useRef(null);
  const pendingActionRef = useRef(null); // { type: 'sit'|'bufe'|'npc', seat? }
  const facingRef = useRef('down');
  const sittingSeatRef = useRef(null);
  const holdingRef = useRef(null);
  const holdingTimeoutRef = useRef(null);
  const walkAnimRef = useRef(0);
  const poseRef = useRef('idle');
  const lastSyncRef = useRef(0);
  const lastSyncedPosRef = useRef({ x: 340, y: 700 });
  const wasMovingRef = useRef(false);
  const pausedRef = useRef(false);
  const imgCacheRef = useRef(new Map());
  const myBubbleRef = useRef(null);
  const othersRef = useRef([]);
  const playerRef = useRef(null);

  useEffect(() => { holdingRef.current = holding; }, [holding]);
  useEffect(() => { sittingSeatRef.current = sittingSeatId; }, [sittingSeatId]);
  useEffect(() => { myBubbleRef.current = myBubble; }, [myBubble]);
  useEffect(() => { othersRef.current = others; }, [others]);
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => () => { if (holdingTimeoutRef.current) clearTimeout(holdingTimeoutRef.current); }, []);

  // --- Avatar SVG'sini canvas'a çizilebilir bir <img>'e çeviren önbellek.
  // Arka planı YOK (şeffaf) — karakterler çim üzerine doğal oturuyor,
  // kare/renkli bir kutu içinde "yapıştırma" gibi görünmüyor.
  function getAvatarImage(avatar, pose) {
    const av = avatar || DEFAULT_AVATAR;
    const key = JSON.stringify(av) + '|' + pose;
    const cache = imgCacheRef.current;
    let entry = cache.get(key);
    if (!entry) {
      const markup = buildFullAvatarSvgMarkup(av, { pose });
      const img = new Image();
      entry = { img, ready: false };
      img.onload = () => { entry.ready = true; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
      cache.set(key, entry);
      if (cache.size > 50) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
    }
    return entry.ready ? entry.img : null;
  }

  // Park'a giriş / çıkış (bkz. functions/index.js enterPark üstündeki not).
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    enterPark()
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || { x: 340, y: 700 };
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Parka giriş hatası:', err);
        setError('Parka girilemedi. Tekrar dene.');
      });
    return () => {
      cancelled = true;
      if (user) clearPresence(user.uid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    const onVisibility = () => { pausedRef.current = document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // --- Statik sahneyi (çim, patika, çit, ağaçlar, gölet, büfe, masalar,
  // banklar) BİR KEZ önceden çizip bir offscreen canvas'ta tutuyoruz —
  // her karede yeniden çizmek yerine sadece drawImage ile basıyoruz.
  useEffect(() => {
    const sc = document.createElement('canvas');
    sc.width = W; sc.height = H;
    const sctx = sc.getContext('2d');
    buildStaticScene(sctx);
    staticCanvasRef.current = sc;
  }, []);

  function drawPathSegment(c, x1, y1, x2, y2, width) {
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = '#c9a877';
    c.lineWidth = width;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = 'rgba(122,90,50,0.3)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.restore();
  }

  function buildStaticScene(sctx) {
    // Çim zemin + biçme çizgileri
    sctx.fillStyle = '#2e5a34';
    sctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 46) {
      sctx.fillStyle = (Math.floor(y / 46) % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)';
      sctx.fillRect(0, y, W, 46);
    }

    // Düzenli, düz hatlı patika ağı: dikey ana yol + bankların olduğu
    // yerde sağa-sola ayrılan bir T-kavşağı.
    drawPathSegment(sctx, BUFE.cx, BUFE.cy + BUFE.hh + 10, BUFE.cx, 1080, 50);
    drawPathSegment(sctx, TABLES[0].cx, TABLES[0].cy, TABLES[1].cx, TABLES[1].cy, 44);
    drawPathSegment(sctx, 150, BENCH_Y_ROAD, 530, BENCH_Y_ROAD, 44);
    drawPathSegment(sctx, BUFE.cx, 900, TABLES[2].cx, TABLES[2].cy - 6, 44);
    drawPathSegment(sctx, BUFE.cx, 1030, NPC_POS.x + 10, NPC_POS.y, 44);

    // Çit sınırı
    sctx.fillStyle = '#7a5a34';
    for (let x = 14; x < W; x += 26) {
      sctx.fillRect(x, 8, 10, 26);
      sctx.fillRect(x, H - 34, 10, 26);
    }
    for (let y = 14; y < H; y += 26) {
      sctx.fillRect(8, y, 10, 26);
      sctx.fillRect(W - 18, y, 10, 26);
    }

    // Gölet
    drawPond(sctx, POND.cx, POND.cy, POND.rx, POND.ry);

    // Dekoratif ağaçlar — büyütülmüş, 2 farklı tür (yapraklı + çam)
    // karışık dağıtılmış.
    [[60, 90], [W - 60, 90], [60, H - 90], [W - 60, H - 90]].forEach(([x, y]) => drawTree(sctx, x, y));
    [[60, 470], [W - 60, 500], [60, 900], [340, 60]].forEach(([x, y]) => drawPineTree(sctx, x, y));

    drawBufeStatic(sctx);
    TABLES.forEach((t) => drawTable(sctx, t));
    BENCHES.forEach((b) => drawBench(sctx, b));

    sctx.save();
    const vg = sctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.32)');
    sctx.fillStyle = vg;
    sctx.fillRect(0, 0, W, H);
    sctx.restore();
  }

  function drawPond(c, x, y, rx, ry) {
    c.save();
    c.translate(x, y);
    c.fillStyle = '#3f5a3a';
    c.beginPath(); c.ellipse(0, 4, rx + 12, ry + 9, 0, 0, Math.PI * 2); c.fill();
    const grd = c.createRadialGradient(-rx * 0.3, -ry * 0.3, 4, 0, 0, Math.max(rx, ry));
    grd.addColorStop(0, '#7fc2d6'); grd.addColorStop(1, '#2f6b82');
    c.fillStyle = grd;
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1f4a58'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.4, ry * 0.22, 0.3, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  function drawTree(c, x, y) {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.beginPath(); c.ellipse(0, 46, 38, 13, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a3a22';
    roundRectC(c, -9, -8, 18, 54, 4); c.fill();
    const leafColors = ['#2f6b3f', '#357a46', '#2a5c37'];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      c.fillStyle = leafColors[i % leafColors.length];
      c.beginPath();
      c.ellipse(Math.cos(ang) * 21, -40 + Math.sin(ang) * 17, 25, 21, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#357a46';
    c.beginPath(); c.ellipse(0, -44, 31, 25, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function drawPineTree(c, x, y) {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.beginPath(); c.ellipse(0, 10, 30, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a2e18';
    c.fillRect(-7, -12, 14, 24);
    const tiers = [
      { y: -14, w: 52, h: 34, color: '#1f4f2e' },
      { y: -42, w: 42, h: 30, color: '#245a35' },
      { y: -66, w: 32, h: 26, color: '#2a6a3d' },
    ];
    tiers.forEach((tr) => {
      c.fillStyle = tr.color;
      c.beginPath();
      c.moveTo(0, tr.y - tr.h);
      c.lineTo(tr.w / 2, tr.y);
      c.lineTo(-tr.w / 2, tr.y);
      c.closePath();
      c.fill();
    });
    c.restore();
  }

  function drawBufeStatic(c) {
    const { cx, cy, hw, hh } = BUFE;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath(); c.ellipse(0, hh + 6, hw + 6, 14, 0, 0, Math.PI * 2); c.fill();
    const grd = c.createLinearGradient(0, -hh, 0, hh);
    grd.addColorStop(0, '#8a5a34'); grd.addColorStop(1, '#6b4226');
    c.fillStyle = grd;
    roundRectC(c, -hw, -4, hw * 2, hh + 4, 6); c.fill();
    c.strokeStyle = '#3f2717'; c.lineWidth = 2;
    roundRectC(c, -hw, -4, hw * 2, hh + 4, 6); c.stroke();
    c.fillStyle = '#c9a877';
    roundRectC(c, -hw - 4, -12, hw * 2 + 8, 12, 4); c.fill();
    c.fillStyle = '#5a3a22';
    c.fillRect(-hw + 4, -52, 8, 42);
    c.fillRect(hw - 12, -52, 8, 42);
    c.fillStyle = '#c9432b';
    c.beginPath();
    c.moveTo(-hw - 14, -46); c.lineTo(hw + 14, -46); c.lineTo(hw, -70); c.lineTo(-hw, -70);
    c.closePath(); c.fill();
    for (let i = -hw; i < hw; i += 24) {
      c.fillStyle = (Math.floor((i + hw) / 24) % 2 === 0) ? '#e8e6df' : '#c9432b';
      c.beginPath();
      c.moveTo(i, -46); c.lineTo(i + 24, -46); c.lineTo(i + 12, -38);
      c.closePath(); c.fill();
    }
    c.fillStyle = '#2b1b12';
    roundRectC(c, -46, -30, 92, 18, 3); c.fill();
    c.fillStyle = '#f4e6d0';
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'center';
    c.fillText('BÜFE', 0, -17);
    const items = [
      { x: -hw + 20, color: '#d6432b' }, { x: -hw + 44, color: '#e8e6df' },
      { x: -hw + 68, color: '#c98a1a' }, { x: hw - 60, color: '#4a2e18' },
      { x: hw - 36, color: '#f4e6d0' }, { x: hw - 14, color: '#8a1d1d' },
    ];
    items.forEach((it) => {
      c.fillStyle = it.color;
      roundRectC(c, it.x - 5, -22, 10, 12, 2); c.fill();
    });
    c.restore();
  }

  function drawTable(c, t) {
    const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
    dirs.forEach((d) => {
      const cx = t.cx + d.dx * (t.r + 22);
      const cy = t.cy + d.dy * (t.r + 22);
      c.save();
      c.translate(cx, cy);
      c.rotate(Math.atan2(t.cy - cy, t.cx - cx));
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.beginPath(); c.ellipse(0, 4, 13, 7, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5a3a22';
      roundRectC(c, -12, -11, 11, 22, 3); c.fill();
      c.fillStyle = '#8a5a34';
      roundRectC(c, -2, -10, 14, 20, 3); c.fill();
      c.restore();
    });
    c.save();
    c.translate(t.cx, t.cy);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(0, 5, t.r + 4, t.r * 0.5, 0, 0, Math.PI * 2); c.fill();
    const grd = c.createRadialGradient(-t.r * 0.3, -t.r * 0.3, 4, 0, 0, t.r);
    grd.addColorStop(0, '#dba05c'); grd.addColorStop(1, '#b4753f');
    c.fillStyle = grd;
    c.beginPath(); c.arc(0, 0, t.r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6b4226'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, t.r, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  function drawBench(c, b) {
    c.save();
    c.translate(b.cx, b.cy);
    const HW = 58, HH = 20;
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(0, HH + 8, HW + 10, 12, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a2e18';
    c.fillRect(-HW + 6, -2, 8, 24);
    c.fillRect(HW - 14, -2, 8, 24);
    c.fillStyle = '#8a5a34';
    for (let i = -HW + 4; i < HW - 4; i += 13) { roundRectC(c, i, -30, 9, 30, 2); c.fill(); }
    c.strokeStyle = '#3f2717'; c.lineWidth = 1.5;
    for (let i = -HW + 4; i < HW - 4; i += 13) { roundRectC(c, i, -30, 9, 30, 2); c.stroke(); }
    for (let row = 0; row < 3; row++) {
      const yy = -4 + row * 7;
      c.fillStyle = row % 2 === 0 ? '#a9772e' : '#96682a';
      roundRectC(c, -HW, yy, HW * 2, 6, 2); c.fill();
      c.strokeStyle = '#3f2717'; c.lineWidth = 1;
      roundRectC(c, -HW, yy, HW * 2, 6, 2); c.stroke();
    }
    c.restore();
  }

  // --- Ana döngü: hareket + Firestore senkronu (maliyet-bilinçli, bkz.
  // sabitler) ----------------------------------------------------------
  useEffect(() => {
    if (!ready) return undefined;
    let raf;
    let lastT = performance.now();

    const tick = (t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      let moving = false;

      if (!sittingSeatRef.current && targetRef.current) {
        const p = posRef.current;
        const tgt = targetRef.current;
        const dx = tgt.x - p.x;
        const dy = tgt.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < PLAYER_SPEED * dt + 2) {
          posRef.current = { x: tgt.x, y: tgt.y };
          targetRef.current = null;
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          if (action?.type === 'sit') {
            // Vardığımızda koltuk hâlâ boş mu diye SON KEZ kontrol
            // ediyoruz (en güncel `others` verisiyle) — iki oyuncu aynı
            // koltuğa neredeyse aynı anda tıklarsa, biri yürürken diğeri
            // oraya oturmuş olabilir. Doluysa oturmayı iptal ediyoruz.
            const nowOccupied = othersRef.current.some((o) => o.pose === 'sit' && o.seat === action.seat.id);
            if (!nowOccupied) {
              // Ref'i HEMEN (senkron) güncelliyoruz — sadece React
              // state'ine güvenirsek (useEffect'le ref'e yansıması bir
              // sonraki render'a kalır), birazdan aşağıdaki senkron
              // bloğu bu tick içinde hâlâ "oturmuyor" okuyup az önce
              // gönderdiğimiz 'sit' güncellemesinin üstüne 'idle' yazıp
              // eziyordu — arkadaşının ekranında "bir süre sonra
              // oturuyor" görünmesinin sebebi tam olarak buydu.
              sittingSeatRef.current = action.seat.id;
              setSittingSeatId(action.seat.id);
              updatePresence(user.uid, {
                x: action.seat.x, y: action.seat.y, facing: facingRef.current,
                pose: 'sit', seat: action.seat.id, holding: holdingRef.current,
              });
            }
          } else if (action?.type === 'bufe') {
            setPanel('bufe');
          } else if (action?.type === 'npc') {
            setPanel('npc');
          }
        } else {
          moving = true;
          const vx = dx / d, vy = dy / d;
          const rawX = p.x + vx * PLAYER_SPEED * dt;
          const rawY = p.y + vy * PLAYER_SPEED * dt;
          // Bir etkileşim hedefine (oturma yeri / büfe / NPC) yürürken
          // çarpışma kontrolünü BİLEREK atlıyoruz — o hedef zaten bir
          // eşyanın üstünde/önünde, aksi halde karakter kendi varış
          // noktasına asla ulaşamaz (önceki kilitlenme hatasının kök
          // nedeni buydu). Serbest gezinirken normal çarpışma geçerli.
          const next = pendingActionRef.current
            ? { x: Math.max(30, Math.min(W - 30, rawX)), y: Math.max(30, Math.min(H - 30, rawY)) }
            : resolveObstacles(rawX, rawY);
          posRef.current = next;
          facingRef.current = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
          walkAnimRef.current += dt;
          poseRef.current = Math.floor(walkAnimRef.current / 0.16) % 2 === 0 ? 'walk1' : 'walk2';
        }
      }
      if (!moving) poseRef.current = 'idle';

      // --- Firestore senkronu: sadece anlamlı değişimde / seyrek nabız.
      if (!pausedRef.current && user) {
        const p = posRef.current;
        const movedDist = dist(p, lastSyncedPosRef.current);
        const sinceLast = t - lastSyncRef.current;
        if (moving) {
          if (sinceLast > MOVE_SYNC_INTERVAL_MS && movedDist > MOVE_SYNC_MIN_DIST) {
            lastSyncRef.current = t; lastSyncedPosRef.current = { ...p };
            updatePresence(user.uid, {
              x: p.x, y: p.y, facing: facingRef.current, pose: poseRef.current,
              holding: holdingRef.current, seat: null,
            });
          }
        } else if (wasMovingRef.current) {
          lastSyncRef.current = t; lastSyncedPosRef.current = { ...p };
          updatePresence(user.uid, {
            x: p.x, y: p.y, facing: facingRef.current,
            pose: sittingSeatRef.current ? 'sit' : 'idle',
            holding: holdingRef.current, seat: sittingSeatRef.current,
          });
        } else if (sinceLast > IDLE_HEARTBEAT_MS) {
          lastSyncRef.current = t;
          updatePresence(user.uid, {
            x: p.x, y: p.y, facing: facingRef.current,
            pose: sittingSeatRef.current ? 'sit' : 'idle',
            holding: holdingRef.current, seat: sittingSeatRef.current,
          });
        }
      }
      wasMovingRef.current = moving;

      renderFrame();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.uid]);

  function drawHeldIcon(ctx, type, x, y) {
    if (!type) return;
    // "Arada bir yiyip içiyor" hissi için hafif bir sallanma/nabız
    // animasyonu — sürekli, sürükleyici, düşük maliyetli.
    const bob = Math.sin(performance.now() / 480) * 2;
    const pulse = 1 + Math.max(0, Math.sin(performance.now() / 700)) * 0.18;
    // Biraz büyütüldü (okunması/görünmesi için) — SCALE ile tüm çizim
    // büyür.
    const SCALE = 1.6;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(pulse * SCALE, pulse * SCALE);
    if (type === 'cay') {
      ctx.fillStyle = '#d6432b';
      ctx.beginPath();
      ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.lineTo(3, 6); ctx.lineTo(-3, 6);
      ctx.closePath(); ctx.fill();
    } else if (type === 'kahve') {
      ctx.fillStyle = '#f4e6d0';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a2e18';
      ctx.beginPath(); ctx.arc(0, -1, 4.2, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'latte') {
      // Uzun bardak + katmanlı süt köpüğü + ara sıra ufak bir parıltı.
      ctx.fillStyle = '#e8c68a';
      roundRectC(ctx, -5, -9, 10, 16, 3); ctx.fill();
      ctx.fillStyle = '#6b4226';
      roundRectC(ctx, -4.4, -3, 8.8, 9, 2); ctx.fill();
      ctx.fillStyle = '#f4e6d0';
      ctx.beginPath(); ctx.ellipse(0, -5, 4.4, 3, 0, 0, Math.PI * 2); ctx.fill();
      const sparkle = Math.sin(performance.now() / 900 + 1.4);
      if (sparkle > 0.86) {
        const a = (sparkle - 0.86) / 0.14;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(5, -9); ctx.lineTo(5, -5);
        ctx.moveTo(3, -7); ctx.lineTo(7, -7);
        ctx.stroke();
      }
    } else if (type === 'oralet') {
      ctx.fillStyle = '#e07a2c';
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'sosisli') {
      ctx.fillStyle = '#e8c68a';
      roundRectC(ctx, -8, -3, 16, 6, 3); ctx.fill();
      ctx.fillStyle = '#a83a2a';
      roundRectC(ctx, -6, -1.5, 12, 3, 1.5); ctx.fill();
    } else if (type === 'tost') {
      ctx.fillStyle = '#e8c68a';
      roundRectC(ctx, -7, -6, 14, 12, 2); ctx.fill();
      ctx.strokeStyle = '#a86b3c'; ctx.lineWidth = 1.2;
      roundRectC(ctx, -7, -6, 14, 12, 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSprite(ctx, entity) {
    const img = getAvatarImage(entity.avatar, entity.pose);
    const h = SPRITE_H;
    const w = h * SPRITE_ASPECT;

    ctx.save();
    ctx.translate(entity.x, entity.baseY);
    if (entity.facing === 'left') ctx.scale(-1, 1);
    if (img) {
      ctx.drawImage(img, -w / 2, -h, w, h);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundRectC(ctx, -w * 0.28, -h, w * 0.56, h, 12); ctx.fill();
    }
    ctx.restore();

    if (entity.holding) drawHeldIcon(ctx, entity.holding, entity.x + w * 0.32, entity.baseY - h * 0.42);

    ctx.fillStyle = 'rgba(20,12,8,0.75)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    if (!entity.isSelf) ctx.fillText(entity.name, entity.x, entity.baseY + 14);
  }

  // --- Konuşma baloncukları ------------------------------------------
  // 1) Kelime kelime SATIR SATIR sarılır (canvas'ın kendi maxWidth'i
  //    metni tek satıra SIKIŞTIRIYORDU, okunmaz hale geliyordu).
  // 2) Ekran kenarına yakın karakterlerde kutu ekranın dışına taşmasın
  //    diye içeri doğru kaydırılır (kuyruk yine karaktere işaret eder).
  // 3) Birbirine yakın iki karakterin baloncukları çakışırsa, ESKİ
  //    olan yukarı itilir — ikisi de aynı anda okunabilir kalır.
  const BUBBLE_FONT = '15px sans-serif';
  const BUBBLE_LINE_H = 20;
  const BUBBLE_MAX_TEXT_W = 176;
  const BUBBLE_PAD_X = 13;
  const BUBBLE_PAD_Y = 10;

  function wrapBubbleText(ctx, text) {
    ctx.font = BUBBLE_FONT;
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(test).width > BUBBLE_MAX_TEXT_W) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 6);
  }

  function measureBubble(ctx, lines) {
    ctx.font = BUBBLE_FONT;
    let maxW = 40;
    lines.forEach((l) => { maxW = Math.max(maxW, ctx.measureText(l).width); });
    return {
      w: Math.min(BUBBLE_MAX_TEXT_W, maxW) + BUBBLE_PAD_X * 2,
      h: lines.length * BUBBLE_LINE_H + BUBBLE_PAD_Y * 2,
    };
  }

  // Çakışan baloncukları dikeyde ayırır: iki kutu üst üste geliyorsa
  // ESKİ olanı (ts küçük olan) yeterince yukarı itilir.
  function layoutBubbles(items) {
    const placed = items.map((it) => ({ ...it, top: it.naturalTop }));
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
      for (let i = 0; i < placed.length; i++) {
        for (let j = 0; j < placed.length; j++) {
          if (i === j) continue;
          const a = placed[i], b = placed[j];
          const overlapX = a.x - a.w / 2 < b.x + b.w / 2 && b.x - b.w / 2 < a.x + a.w / 2;
          if (!overlapX) continue;
          const overlapY = a.top < b.top + b.h && b.top < a.top + a.h;
          if (!overlapY) continue;
          const older = a.ts <= b.ts ? a : b;
          const newer = older === a ? b : a;
          const desiredBottom = newer.top - 6;
          if (older.top + older.h > desiredBottom) {
            older.top = desiredBottom - older.h;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return placed;
  }

  function drawBubbleBox(ctx, item) {
    let bx = item.x - item.w / 2;
    bx = Math.max(8, Math.min(W - 8 - item.w, bx));
    const tailX = Math.max(bx + 16, Math.min(bx + item.w - 16, item.x));
    const by = item.top;

    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    roundRectC(ctx, bx, by, item.w, item.h, 11); ctx.fill();
    ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = 1.4;
    roundRectC(ctx, bx, by, item.w, item.h, 11); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tailX - 7, by + item.h); ctx.lineTo(tailX + 7, by + item.h); ctx.lineTo(tailX, by + item.h + 8);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fill();

    ctx.fillStyle = '#3b2412';
    ctx.font = BUBBLE_FONT;
    ctx.textAlign = 'center';
    const cx = bx + item.w / 2;
    item.lines.forEach((line, i) => {
      ctx.fillText(line, cx, by + BUBBLE_PAD_Y + (i + 0.78) * BUBBLE_LINE_H);
    });
  }

  function renderFrame() {
    const canvas = canvasRef.current;
    const staticCanvas = staticCanvasRef.current;
    if (!canvas || !staticCanvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(staticCanvas, 0, 0);

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(244,230,208,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetRef.current.x, targetRef.current.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    const now = Date.now();
    const myAvatar = playerRef.current?.avatar;
    const myBubbleNow = myBubbleRef.current && now - myBubbleRef.current.ts < CHAT_BUBBLE_MS ? myBubbleRef.current : null;

    const rawEntities = [
      { x: NPC_POS.x, y: NPC_POS.y, avatar: NPC_AVATAR, pose: 'idle', facing: 'right', name: 'Şüpheli Adam', bubbleData: null, holding: null },
      ...othersRef.current.map((o) => ({
        x: o.x, y: o.y, avatar: o.avatar, pose: o.pose === 'sit' ? 'sit' : (o.pose || 'idle'),
        facing: o.facing || 'down', name: o.displayName || 'Oyuncu',
        bubbleData: o.chatText && o.chatTs && now - o.chatTs < CHAT_BUBBLE_MS ? { text: o.chatText, ts: o.chatTs } : null,
        holding: o.holding || null,
      })),
      {
        x: posRef.current.x, y: posRef.current.y, avatar: myAvatar,
        pose: sittingSeatRef.current ? 'sit' : poseRef.current, facing: facingRef.current,
        name: playerRef.current?.displayName || 'Sen', bubbleData: myBubbleNow, holding: holdingRef.current, isSelf: true,
      },
    ];

    // Oturma pozunda çizim kaydırması (bkz. eski yorum) — hem avatar hem
    // baloncuk konumu bunu kullanmalı ki baloncuk doğru yerde çıksın.
    const entities = rawEntities
      .map((e) => {
        const sitShift = e.pose === 'sit'
          ? (SPRITE_H * (AVATAR_FULL_VIEWBOX_H - AVATAR_WAIST_Y)) / AVATAR_FULL_VIEWBOX_H
          : 0;
        return { ...e, baseY: e.y + sitShift };
      })
      .sort((a, b) => a.y - b.y);

    entities.forEach((e) => drawSprite(ctx, e));

    // Baloncuklar HER ZAMAN tüm karakterlerin üstünde çizilsin diye ayrı
    // (ve çakışma-çözümlü) bir son geçiş.
    const bubbleItems = [];
    entities.forEach((e) => {
      if (!e.bubbleData) return;
      const lines = wrapBubbleText(ctx, e.bubbleData.text);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = e.baseY - SPRITE_H - 8;
      bubbleItems.push({ x: e.x, w, h, lines, ts: e.bubbleData.ts, naturalTop: anchorY - h });
    });
    layoutBubbles(bubbleItems).forEach((item) => drawBubbleBox(ctx, item));
  }

  useEffect(() => {
    if (!myBubble) return undefined;
    const id = setTimeout(() => setMyBubble(null), CHAT_BUBBLE_MS);
    return () => clearTimeout(id);
  }, [myBubble]);

  function pointerToCanvas(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  // Her zaman en güncel veriyle (React re-render'ını beklemeden) dolu
  // koltukları hesaplar — hem tıklama anında hem varışta kullanılır.
  function computeOccupiedSeatIds() {
    const set = new Set();
    if (sittingSeatRef.current) set.add(sittingSeatRef.current);
    othersRef.current.forEach((o) => { if (o.pose === 'sit' && o.seat) set.add(o.seat); });
    return set;
  }

  function standUp() {
    sittingSeatRef.current = null;
    setSittingSeatId(null);
    if (user) {
      updatePresence(user.uid, {
        x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
        pose: 'idle', seat: null, holding: holdingRef.current,
      });
    }
  }

  function handleCanvasClick(e) {
    if (!ready) return;
    const p = pointerToCanvas(e);

    // Otururken herhangi bir yere tıklamak otomatik ayağa kaldırır —
    // ayrı bir "Kalk" butonuna gerek yok.
    if (sittingSeatRef.current) standUp();

    const occupied = computeOccupiedSeatIds();
    const seat = ALL_SEATS.find((s) => !occupied.has(s.id) && dist(p, s) < 42);
    if (seat) {
      pendingActionRef.current = { type: 'sit', seat };
      targetRef.current = { x: seat.x, y: seat.y };
      return;
    }

    if (dist(p, BUFE) < 100) {
      if (dist(posRef.current, BUFE) < INTERACT_RADIUS) {
        setPanel('bufe');
      } else {
        pendingActionRef.current = { type: 'bufe' };
        targetRef.current = { x: BUFE.cx, y: BUFE.cy + BUFE.hh + 44 };
      }
      return;
    }

    if (dist(p, NPC_POS) < 70) {
      if (dist(posRef.current, NPC_POS) < INTERACT_RADIUS) {
        setPanel('npc');
      } else {
        pendingActionRef.current = { type: 'npc' };
        targetRef.current = { x: NPC_POS.x + 50, y: NPC_POS.y + 10 };
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  const handleSell = async () => {
    setSellBusy(true);
    setError(null);
    try {
      const res = await sellContrabandAtPark();
      setSellResult(res.data);
    } catch (err) {
      setError(err.message || 'Satış başarısız.');
    } finally {
      setSellBusy(false);
    }
  };

  const handleBuy = async (item) => {
    setBufeBusy(item.id);
    setError(null);
    try {
      await buyFromBufe(item.id);
      setHolding(item.id);
      holdingRef.current = item.id;
      if (user) {
        updatePresence(user.uid, {
          x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
          pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
          holding: item.id,
        });
      }
      // Elde tutulan ürün 1 dakika sonra kaybolur (bkz. HOLDING_MS).
      if (holdingTimeoutRef.current) clearTimeout(holdingTimeoutRef.current);
      holdingTimeoutRef.current = setTimeout(() => {
        setHolding(null);
        holdingRef.current = null;
        if (user) {
          updatePresence(user.uid, {
            x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
            pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
            holding: null,
          });
        }
      }, HOLDING_MS);
    } catch (err) {
      setError(err.message || 'Satın alma başarısız.');
    } finally {
      setBufeBusy(null);
    }
  };

  const sendChat = () => {
    const text = chatText.trim();
    if (!text || !user) return;
    const ts = Date.now();
    setMyBubble({ text, ts });
    updatePresence(user.uid, {
      x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
      pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
      holding: holdingRef.current, chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  // --- Kamera: kendine yaklaşıp (varsa yakındaki arkadaşlarınla)
  // fotoğraf çekip anında Sixtagram'da paylaşabilme. Gerçek bir dosya
  // yükleme YOK — sadece karede kimin olduğu (uid listesi) sunucuya
  // gönderiliyor, avatarlar sunucuda GERÇEK veriden yeniden inşa
  // edilip Sixtagram'da render ediliyor (bkz. functions/index.js
  // buildSixtagramAttachment 'parkPhoto').
  const CAMERA_RADIUS = 170;
  const CAMERA_POSES = [
    { id: 'idle', label: 'Doğal' },
    { id: 'walk1', label: 'Yürüyor' },
    { id: 'walk2', label: 'Zıplıyor' },
    { id: 'sit', label: 'Oturuyor' },
  ];
  function openCamera() {
    const p = posRef.current;
    const nearby = othersRef.current
      .filter((o) => dist(p, o) < CAMERA_RADIUS)
      .slice(0, 4)
      .map((o) => ({
        uid: o.uid,
        displayName: o.displayName || 'Oyuncu',
        avatar: o.avatar,
        // Arkadaşların pozunu şu an fiilen ne yapıyorlarsa ondan
        // yakalıyoruz (yürüyor/oturuyor/duruyor) — sadece kendi pozunu
        // sen (fotoğrafı çeken) aşağıdaki seçiciyle değiştirebiliyorsun.
        pose: o.pose === 'sit' ? 'sit' : (o.pose === 'walk1' || o.pose === 'walk2' ? o.pose : 'idle'),
      }));
    setCameraFriends(nearby);
    setCameraPose('idle');

    const spots = [
      { label: 'Büfe', d: dist(p, BUFE) },
      { label: 'Gölet', d: dist(p, POND) },
      ...TABLES.map((t) => ({ label: 'Masa', d: dist(p, t) })),
      ...BENCHES.map((b) => ({ label: 'Bank', d: dist(p, b) })),
    ].sort((a, b) => a.d - b.d);
    setCameraScene(spots[0] && spots[0].d < 140 ? spots[0].label : 'Park');

    setCameraCaption('');
    setCameraError(null);
    setCameraDone(false);
    setCameraOpen(true);
  }

  async function handleShareCamera() {
    setCameraBusy(true);
    setCameraError(null);
    try {
      await createSixtagramPost(cameraCaption, {
        type: 'parkPhoto',
        selfPose: cameraPose,
        participants: cameraFriends.map((f) => ({ uid: f.uid, pose: f.pose })),
        scene: cameraScene,
      });
      setCameraDone(true);
    } catch (err) {
      setCameraError(err.message || 'Paylaşılamadı.');
    } finally {
      setCameraBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="pw-fullscreen">
        <button className="pw-exit-btn" onClick={onExit}>✕</button>
        <p className="pw-hint" style={{ padding: 16 }}>Parkta gezmek için giriş yapmalısın.</p>
      </div>
    );
  }

  const contrabandQty = inventory.yasakliMadde || 0;

  return (
    <div className="pw-fullscreen">
      {/* Bölüm 5 talebi: şüphe/saygınlık/altın kısmı oyunun geri kalanıyla
          BİREBİR AYNI — parka özel yeniden tasarlanmadı, doğrudan aynı Hud
          bileşeni kullanılıyor. */}
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
      <button className="pw-exit-btn" onClick={onExit}>✕</button>

      <div className="pw-canvas-wrap">
        {!ready && <div className="pw-loading">Parka giriliyor…</div>}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="pw-canvas"
          onPointerDown={handleCanvasClick}
        />
        {ready && (
          <>
            <button className="pw-phone-btn" onClick={() => setPhoneOpen(true)} title="Telefon">📱</button>
            <button className="pw-camera-btn" onClick={openCamera} title="Fotoğraf çek">📷</button>
          </>
        )}
      </div>

      {phoneOpen && <PhoneScreen onClose={() => setPhoneOpen(false)} onEnterTable={() => {}} />}

      <div className="pw-chat-row">
        <input
          className="pw-chat-input"
          placeholder="Bir şey yaz…"
          value={chatText}
          maxLength={140}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
        />
        <button className="pw-chat-send" onClick={sendChat}>Gönder</button>
      </div>

      {error && <p className="pw-error">{error}</p>}

      {cameraOpen && (
        <div className="pw-panel-backdrop" onClick={() => setCameraOpen(false)}>
          <div className="pw-panel" onClick={(e) => e.stopPropagation()}>
            {!cameraDone ? (
              <>
                <p className="pw-panel-title">📷 Fotoğraf Çek</p>
                <div className="pw-camera-preview" style={{ background: CAMERA_SCENE_BG[cameraScene] || CAMERA_SCENE_BG.Park }}>
                  <span className="pw-camera-scene-badge">{cameraScene}</span>
                  <div className="pw-camera-row">
                    <div className="pw-camera-person">
                      <div className="pw-camera-avatar">
                        <AvatarSvg avatar={player?.avatar} variant="full" pose={cameraPose} />
                      </div>
                      <span className="pw-camera-name">Sen</span>
                    </div>
                    {cameraFriends.map((f) => (
                      <div key={f.uid} className="pw-camera-person">
                        <div className="pw-camera-avatar">
                          <AvatarSvg avatar={f.avatar} variant="full" pose={f.pose} />
                        </div>
                        <span className="pw-camera-name">{f.displayName}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="pw-hint" style={{ marginBottom: 4 }}>Pozunu seç:</p>
                <div className="pw-camera-pose-row">
                  {CAMERA_POSES.map((cp) => (
                    <button
                      key={cp.id}
                      className={`pw-camera-pose-btn${cameraPose === cp.id ? ' active' : ''}`}
                      onClick={() => setCameraPose(cp.id)}
                    >
                      {cp.label}
                    </button>
                  ))}
                </div>
                <p className="pw-hint">
                  {cameraFriends.length > 0
                    ? `Karede sen ve ${cameraFriends.length} arkadaşın var.`
                    : 'Karede sadece sen varsın — yanına yaklaşan arkadaşların da otomatik kareye girer.'}
                </p>
                <input
                  className="pw-chat-input pw-camera-caption"
                  placeholder="Fotoğrafa bir açıklama yaz…"
                  value={cameraCaption}
                  maxLength={200}
                  onChange={(e) => setCameraCaption(e.target.value)}
                />
                {cameraError && <p className="pw-error">{cameraError}</p>}
                <button className="pw-panel-btn primary" disabled={cameraBusy} onClick={handleShareCamera}>
                  {cameraBusy ? 'Paylaşılıyor…' : '📤 Sixtagram\'da Paylaş'}
                </button>
                <button className="pw-panel-btn" onClick={() => setCameraOpen(false)}>Vazgeç</button>
              </>
            ) : (
              <>
                <p className="pw-panel-title">Paylaşıldı! 🎉</p>
                <p className="pw-hint">Fotoğrafın Sixtagram akışında.</p>
                <button className="pw-panel-btn primary" onClick={() => setCameraOpen(false)}>Tamam</button>
              </>
            )}
          </div>
        </div>
      )}

      {panel === 'npc' && (
        <div className="pw-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="pw-panel" onClick={(e) => e.stopPropagation()}>
            <p className="pw-panel-title">Şüpheli Adam</p>
            <p className="pw-hint">
              Sahip olduğun kaçak mal: <strong>{contrabandQty} adet</strong> · Satış fiyatı{' '}
              {PARK_SELL_PRICE.toLocaleString('tr-TR')} altın/adet
              <InfoIcon text="Her satışta o anki şüphe yüzden kadar ihtimalle polis seni yakalayabilir. Yakalanırsan kazanacağın altın yerine aynı miktar devlete borç yazılır. Her satış şüpheni +5 artırır." />
            </p>
            <button className="pw-panel-btn primary" disabled={sellBusy || contrabandQty < 1} onClick={handleSell}>
              {sellBusy ? 'Satılıyor…' : contrabandQty < 1 ? 'Malın yok' : 'Sat (1 adet)'}
            </button>
            <button className="pw-panel-btn" onClick={() => setPanel(null)}>Uzaklaş</button>
          </div>
        </div>
      )}

      {panel === 'bufe' && (
        <div className="pw-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="pw-panel" onClick={(e) => e.stopPropagation()}>
            <p className="pw-panel-title">Büfe</p>
            <div className="pw-bufe-grid">
              {BUFE_MENU.map((item) => (
                <button key={item.id} className="pw-bufe-item" disabled={bufeBusy === item.id} onClick={() => handleBuy(item)}>
                  <BufeItemIcon id={item.id} />
                  <span>{item.label}</span>
                  <span className="pw-bufe-price">{item.price.toLocaleString('tr-TR')} altın</span>
                </button>
              ))}
            </div>
            <button className="pw-panel-btn" onClick={() => setPanel(null)}>Kapat</button>
          </div>
        </div>
      )}

      {sellResult && (
        <ResultModal
          title={sellResult.caught ? 'Yakalandın!' : 'Satış Başarılı! 🎉'}
          message={
            sellResult.caught
              ? `${sellResult.penalty.toLocaleString('tr-TR')} altın devlete borç yazıldı.`
              : `+${sellResult.earned.toLocaleString('tr-TR')} altın kazandın.`
          }
          tone={sellResult.caught ? 'fail' : 'success'}
          onClose={() => setSellResult(null)}
        />
      )}
    </div>
  );
}
