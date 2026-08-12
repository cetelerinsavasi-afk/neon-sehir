import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { useParkPresence } from '../../hooks/useParkPresence';
import { enterPark, sellContrabandAtPark, buyFromBufe } from '../../services/gameActions';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import Hud from '../Hud/Hud';
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
const CHAT_BUBBLE_MS = 6000;
const PARK_SELL_PRICE = 5000;
const SPRITE_ASPECT = 320 / 580;
const SPRITE_H = 118; // ekrandaki karakter boyu (piksel)

// --- Firebase maliyet ayarları (bkz. önceki not) -------------------------
const MOVE_SYNC_INTERVAL_MS = 300;
const MOVE_SYNC_MIN_DIST = 6;
const IDLE_HEARTBEAT_MS = 12_000;

const BUFE_MENU = [
  { id: 'sosisli', label: 'Sosisli', price: 100 },
  { id: 'tost', label: 'Tost', price: 100 },
  { id: 'cay', label: 'Çay', price: 10 },
  { id: 'kahve', label: 'Kahve', price: 30 },
  { id: 'oralet', label: 'Oralet', price: 20 },
  { id: 'latte', label: 'Latte', price: 500 },
];

// --- Sahnedeki sabit nesneler --------------------------------------------
const BUFE = { cx: 340, cy: 200, hw: 92, hh: 54 };
const BENCHES = [
  { id: 'bench1', cx: 190, cy: 560 },
  { id: 'bench2', cx: 490, cy: 560 },
  { id: 'bench3', cx: 340, cy: 860 },
];
const BENCH_HW = 58;
const BENCH_HH = 20;
const SEAT_DX = 30;

function benchSeats(bench) {
  return [
    { id: `${bench.id}_L`, benchId: bench.id, x: bench.cx - SEAT_DX, y: bench.cy - 8 },
    { id: `${bench.id}_R`, benchId: bench.id, x: bench.cx + SEAT_DX, y: bench.cy - 8 },
  ];
}
const ALL_SEATS = BENCHES.flatMap(benchSeats);

const NPC_POS = { x: 118, y: 980 };
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

// Yürüme sırasında çarpışılmaması gereken katı nesneler.
const OBSTACLES = [
  { cx: BUFE.cx, cy: BUFE.cy, hw: BUFE.hw, hh: BUFE.hh },
  ...BENCHES.map((b) => ({ cx: b.cx, cy: b.cy, hw: BENCH_HW, hh: BENCH_HH })),
];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
    if (Math.abs(dx0) < o.hw + PLAYER_R && Math.abs(dy0) < o.hh + PLAYER_R) {
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

  const canvasRef = useRef(null);
  const staticCanvasRef = useRef(null);
  const posRef = useRef({ x: 340, y: 700 });
  const targetRef = useRef(null);
  const pendingActionRef = useRef(null); // { type: 'sit'|'bufe'|'npc', seat? }
  const facingRef = useRef('down');
  const sittingSeatRef = useRef(null);
  const holdingRef = useRef(null);
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
      img.onload = () => {
        entry.ready = true;
      };
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

  // --- Statik sahneyi (çim, patika, çit, ağaçlar, büfe, banklar) BİR
  // KEZ önceden çizip bir offscreen canvas'ta tutuyoruz — her karede
  // yeniden çizmek yerine sadece drawImage ile basıyoruz (performans).
  useEffect(() => {
    const sc = document.createElement('canvas');
    sc.width = W; sc.height = H;
    const sctx = sc.getContext('2d');
    buildStaticScene(sctx);
    staticCanvasRef.current = sc;
  }, []);

  function buildStaticScene(sctx) {
    // Çim zemin + biçme çizgileri
    sctx.fillStyle = '#2e5a34';
    sctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 46) {
      sctx.fillStyle = (Math.floor(y / 46) % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)';
      sctx.fillRect(0, y, W, 46);
    }

    // Kıvrılan patika
    sctx.save();
    sctx.strokeStyle = '#c9a877';
    sctx.lineWidth = 46;
    sctx.lineCap = 'round';
    sctx.lineJoin = 'round';
    sctx.beginPath();
    sctx.moveTo(BUFE.cx, BUFE.cy + 60);
    sctx.quadraticCurveTo(340, 380, 190, 500);
    sctx.moveTo(340, 420);
    sctx.quadraticCurveTo(420, 480, 490, 500);
    sctx.moveTo(190, 560);
    sctx.quadraticCurveTo(260, 700, 340, 790);
    sctx.quadraticCurveTo(280, 900, 200, 960);
    sctx.quadraticCurveTo(160, 970, NPC_POS.x, NPC_POS.y - 30);
    sctx.moveTo(490, 560);
    sctx.quadraticCurveTo(430, 700, 340, 790);
    sctx.stroke();
    sctx.strokeStyle = 'rgba(120,90,50,0.35)';
    sctx.lineWidth = 46;
    sctx.setLineDash([2, 14]);
    sctx.stroke();
    sctx.setLineDash([]);
    sctx.restore();

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

    // Dekoratif ağaç/çalılar
    [[60, 90], [W - 60, 90], [60, H - 90], [W - 60, H - 90], [600, 640], [70, 700]].forEach(([x, y]) =>
      drawTree(sctx, x, y)
    );

    drawBufeStatic(sctx);
    BENCHES.forEach((b) => drawBench(sctx, b));

    sctx.save();
    const vg = sctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.32)');
    sctx.fillStyle = vg;
    sctx.fillRect(0, 0, W, H);
    sctx.restore();
  }

  function drawTree(c, x, y) {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(0, 34, 30, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a3a22';
    roundRectC(c, -7, -6, 14, 40, 3); c.fill();
    const leafColors = ['#2f6b3f', '#357a46', '#2a5c37'];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      c.fillStyle = leafColors[i % leafColors.length];
      c.beginPath();
      c.ellipse(Math.cos(ang) * 16, -28 + Math.sin(ang) * 14, 20, 17, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#357a46';
    c.beginPath(); c.ellipse(0, -32, 24, 20, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function drawBufeStatic(c) {
    const { cx, cy, hw, hh } = BUFE;
    c.save();
    c.translate(cx, cy);
    // gölge
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath(); c.ellipse(0, hh + 6, hw + 6, 14, 0, 0, Math.PI * 2); c.fill();
    // tezgah gövdesi
    const grd = c.createLinearGradient(0, -hh, 0, hh);
    grd.addColorStop(0, '#8a5a34'); grd.addColorStop(1, '#6b4226');
    c.fillStyle = grd;
    roundRectC(c, -hw, -4, hw * 2, hh + 4, 6); c.fill();
    c.strokeStyle = '#3f2717'; c.lineWidth = 2;
    roundRectC(c, -hw, -4, hw * 2, hh + 4, 6); c.stroke();
    // tezgah üstü
    c.fillStyle = '#c9a877';
    roundRectC(c, -hw - 4, -12, hw * 2 + 8, 12, 4); c.fill();
    // çatı direkleri
    c.fillStyle = '#5a3a22';
    c.fillRect(-hw + 4, -52, 8, 42);
    c.fillRect(hw - 12, -52, 8, 42);
    // çatı / tente
    c.fillStyle = '#c9432b';
    c.beginPath();
    c.moveTo(-hw - 14, -46);
    c.lineTo(hw + 14, -46);
    c.lineTo(hw, -70);
    c.lineTo(-hw, -70);
    c.closePath();
    c.fill();
    for (let i = -hw; i < hw; i += 24) {
      c.fillStyle = (Math.floor((i + hw) / 24) % 2 === 0) ? '#e8e6df' : '#c9432b';
      c.beginPath();
      c.moveTo(i, -46); c.lineTo(i + 24, -46); c.lineTo(i + 12, -38);
      c.closePath(); c.fill();
    }
    // tabela
    c.fillStyle = '#2b1b12';
    roundRectC(c, -46, -30, 92, 18, 3); c.fill();
    c.fillStyle = '#f4e6d0';
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'center';
    c.fillText('BÜFE', 0, -17);
    // tezgah üstü ürünler (bardak/kutu şekilleri — emoji değil)
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

  function drawBench(c, b) {
    c.save();
    c.translate(b.cx, b.cy);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(0, BENCH_HH + 8, BENCH_HW + 10, 12, 0, 0, Math.PI * 2); c.fill();
    // ayaklar
    c.fillStyle = '#4a2e18';
    c.fillRect(-BENCH_HW + 6, -2, 8, 24);
    c.fillRect(BENCH_HW - 14, -2, 8, 24);
    // arkalık (dikey çıtalar)
    c.fillStyle = '#8a5a34';
    for (let i = -BENCH_HW + 4; i < BENCH_HW - 4; i += 13) {
      roundRectC(c, i, -30, 9, 30, 2); c.fill();
    }
    c.strokeStyle = '#3f2717'; c.lineWidth = 1.5;
    for (let i = -BENCH_HW + 4; i < BENCH_HW - 4; i += 13) {
      roundRectC(c, i, -30, 9, 30, 2); c.stroke();
    }
    // oturma yüzeyi (yatay çıtalar)
    for (let row = 0; row < 3; row++) {
      const yy = -4 + row * 7;
      c.fillStyle = row % 2 === 0 ? '#a9772e' : '#96682a';
      roundRectC(c, -BENCH_HW, yy, BENCH_HW * 2, 6, 2); c.fill();
      c.strokeStyle = '#3f2717'; c.lineWidth = 1;
      roundRectC(c, -BENCH_HW, yy, BENCH_HW * 2, 6, 2); c.stroke();
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
            setSittingSeatId(action.seat.id);
            updatePresence(user.uid, {
              x: action.seat.x, y: action.seat.y, facing: facingRef.current,
              pose: 'sit', seat: action.seat.id, holding: holdingRef.current,
            });
          } else if (action?.type === 'bufe') {
            setPanel('bufe');
          } else if (action?.type === 'npc') {
            setPanel('npc');
          }
        } else {
          moving = true;
          const vx = dx / d, vy = dy / d;
          const next = resolveObstacles(p.x + vx * PLAYER_SPEED * dt, p.y + vy * PLAYER_SPEED * dt);
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
    ctx.save();
    ctx.translate(x, y);
    if (type === 'cay') {
      ctx.fillStyle = '#d6432b';
      ctx.beginPath();
      ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.lineTo(3, 6); ctx.lineTo(-3, 6);
      ctx.closePath(); ctx.fill();
    } else if (type === 'kahve' || type === 'latte') {
      ctx.fillStyle = '#f4e6d0';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a2e18';
      ctx.beginPath(); ctx.arc(0, -1, 4.2, 0, Math.PI * 2); ctx.fill();
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
    ctx.translate(entity.x, entity.y);
    if (entity.facing === 'left') ctx.scale(-1, 1);
    if (img) {
      ctx.drawImage(img, -w / 2, -h, w, h);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundRectC(ctx, -w * 0.28, -h, w * 0.56, h, 12); ctx.fill();
    }
    ctx.restore();

    if (entity.holding) drawHeldIcon(ctx, entity.holding, entity.x + w * 0.32, entity.y - h * 0.42);

    ctx.fillStyle = 'rgba(20,12,8,0.75)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    if (!entity.isSelf) ctx.fillText(entity.name, entity.x, entity.y + 14);

    if (entity.bubble) drawBubble(ctx, entity.x, entity.y - h - 6, entity.bubble);
  }

  function drawBubble(ctx, x, y, text) {
    ctx.font = '12px sans-serif';
    const w = Math.min(200, ctx.measureText(text).width + 20);
    const h = 28;
    const bx = x - w / 2, by = y - h;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRectC(ctx, bx, by, w, h, 9); ctx.fill();
    ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = 1.4;
    roundRectC(ctx, bx, by, w, h, 9); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, by + h); ctx.lineTo(x + 6, by + h); ctx.lineTo(x, by + h + 7);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.fillStyle = '#3b2412';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, by + h / 2 + 4, w - 12);
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
    const myBubbleNow = myBubbleRef.current && now - myBubbleRef.current.ts < CHAT_BUBBLE_MS ? myBubbleRef.current.text : null;

    const entities = [
      { x: NPC_POS.x, y: NPC_POS.y, avatar: NPC_AVATAR, pose: 'idle', facing: 'right', name: 'Şüpheli Adam', bubble: null, holding: null },
      ...othersRef.current.map((o) => ({
        x: o.x, y: o.y, avatar: o.avatar, pose: o.pose === 'sit' ? 'idle' : (o.pose || 'idle'),
        facing: o.facing || 'down', name: o.displayName || 'Oyuncu',
        bubble: o.chatText && o.chatTs && now - o.chatTs < CHAT_BUBBLE_MS ? o.chatText : null,
        holding: o.holding || null,
      })),
      {
        x: posRef.current.x, y: posRef.current.y, avatar: myAvatar,
        pose: sittingSeatRef.current ? 'idle' : poseRef.current, facing: facingRef.current,
        name: playerRef.current?.displayName || 'Sen', bubble: myBubbleNow, holding: holdingRef.current, isSelf: true,
      },
    ].sort((a, b) => a.y - b.y);

    entities.forEach((e) => drawSprite(ctx, e));
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

  const occupiedSeatIds = useMemo(() => {
    const set = new Set();
    if (sittingSeatId) set.add(sittingSeatId);
    others.forEach((o) => { if (o.pose === 'sit' && o.seat) set.add(o.seat); });
    return set;
  }, [others, sittingSeatId]);

  function standUp() {
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

    const seat = ALL_SEATS.find((s) => !occupiedSeatIds.has(s.id) && dist(p, s) < 42);
    if (seat) {
      if (sittingSeatId) standUp();
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

    if (sittingSeatId) standUp();
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
      if (user) {
        updatePresence(user.uid, {
          x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
          pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
          holding: item.id,
        });
      }
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
        {sittingSeatId && (
          <button className="pw-standup-btn" onClick={standUp}>🧍 Kalk</button>
        )}
      </div>

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
