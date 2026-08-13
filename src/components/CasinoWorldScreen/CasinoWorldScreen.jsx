import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import {
  roundRectC, drawAvatarSprite, createAvatarImageCache, drawHeldIcon, renderPhotoFrame,
  wrapBubbleText, measureBubble, layoutBubbles, drawBubbleBox,
  resolveObstaclePosition, cyclingLine, SPRITE_H,
} from '../../lib/canvasWorldKit';
import Hud from '../Hud/Hud';
import PhoneScreen from '../Phone/PhoneScreen';
import LotteryScreen from '../LotteryScreen/LotteryScreen';
import SlotScreen from '../SlotScreen/SlotScreen';
import OnNumaraScreen from '../OnNumaraScreen/OnNumaraScreen';
import { buyFromGazinoBar, createSixtagramPost } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';
import './CasinoWorldScreen.css';

// --- Gazino içi (madde 7-9) ---------------------------------------------
// Bank/Karakol/Camii'yle BİREBİR aynı iskelet — tek oyunculu. Piyango,
// slot ve 10 Numara'nın TÜMÜ mevcut ekranlar (LotteryScreen/SlotScreen/
// OnNumaraScreen) — sadece hangi istasyona tıklandığında hangisinin
// açılacağını yönlendiriyoruz. SADECE bar YENİ bir mekanik (madde 9) —
// Park büfesindeki `buyFromBufe`yle birebir aynı yapıda ama kendi fiyat
// listesiyle `buyFromGazinoBar` Cloud Function'ı eklendi (bkz.
// functions/index.js). Casino'nun telefon uygulaması (madde 8) hiç
// dokunulmadan CasinoScreen üzerinden aynen çalışmaya devam ediyor.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;
const HOLDING_MS = 120_000; // Park büfesiyle aynı süre (bkz. ParkWorldScreen)

// NOT: sıra aralıkları bilerek geniş tutuldu — bir istasyonun ARKASINDAKİ
// NPC sprite'ı (SPRITE_H=118) tezgahın üstünde epey yükseğe çıkıyor, bir
// önceki satırdaki nesnenin altına çakışmaması için (bkz. Bank/Camii'de
// düzeltilen benzer taşma sorunları) satırlar arası boşluk buna göre
// hesaplandı.
const SLOTS = [
  { id: 'slot1', cx: 170, cy: 230 },
  { id: 'slot2', cx: 340, cy: 230 },
  { id: 'slot3', cx: 510, cy: 230 },
];
const SLOT_HW = 34;
const SLOT_HH = 46;

const PIYANGO = { cx: 340, cy: 500, hw: 62, hh: 26 };
const PIYANGO_NPC = {
  name: 'Biletçi Fatma',
  lines: ['Bugün şansın açık olabilir!', 'Bilet al, kura seni seçsin.', 'Büyük ikramiye bekliyor.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'kadin', build: 'standart', skin: '#e0ac69',
    hairStyle: 'ponytail', hairColor: '#7a1f2b', clothing: 'vest', clothColor: '#7a1f2b',
    neckAcc: 'none', pantsColor: '#22262f', background: 'transparent',
  },
};

const TABLES_10NUMARA = [
  { id: 'onnumara1', cx: 190, cy: 630 },
  { id: 'onnumara2', cx: 490, cy: 630 },
];
const TABLE_R = 52;

const BAR = { cx: 340, cy: 880, hw: 140, hh: 26 };
const BARTENDER_NPC = {
  name: 'Barmen Coşkun',
  lines: ['Ne alırdın?', 'Kokteylimiz meşhurdur.', 'Kazandın mı bari?'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#c68863',
    hairStyle: 'slick', hairColor: '#0d0a08', clothing: 'vest', clothColor: '#1a1a1a',
    neckAcc: 'bow', pantsColor: '#0d0d0d', background: 'transparent',
  },
};
const BAR_MENU = [
  { id: 'cay', label: 'Çay', price: 20, emoji: '🍵' },
  { id: 'kahve', label: 'Kahve', price: 50, emoji: '☕' },
  { id: 'kokteyl', label: 'Kokteyl', price: 500, emoji: '🍸' },
];

// Sıradan (kumarsız) oturma masaları — sadece dekoratif, Bank'taki
// sandalye/oturma mekaniğiyle BİREBİR aynı (tıkla, otur, panel yok).
const CHAIRS = [
  { id: 'chair_1', cx: 130, cy: 970 }, { id: 'chair_2', cx: 230, cy: 970 },
  { id: 'chair_3', cx: 450, cy: 970 }, { id: 'chair_4', cx: 550, cy: 970 },
];
const CHAIR_R = 24;

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

const OBSTACLES = [
  ...SLOTS.map((s) => ({ cx: s.cx, cy: s.cy, hw: SLOT_HW, hh: SLOT_HH })),
  { cx: PIYANGO.cx, cy: PIYANGO.cy, hw: PIYANGO.hw, hh: PIYANGO.hh },
  ...TABLES_10NUMARA.map((t) => ({ cx: t.cx, cy: t.cy, r: TABLE_R })),
  { cx: BAR.cx, cy: BAR.cy, hw: BAR.hw, hh: BAR.hh },
  ...CHAIRS.map((c) => ({ cx: c.cx, cy: c.cy, r: CHAIR_R })),
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

function drawFloor(c) {
  c.fillStyle = '#1a0f1c';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,46,140,0.05)';
  c.lineWidth = 1;
  for (let x = 0; x <= W; x += 58) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let y = 0; y <= H; y += 58) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
}

const WALL_H = 128;

function drawWalls(c) {
  const grd = c.createLinearGradient(0, 0, 0, WALL_H);
  grd.addColorStop(0, '#3a1030'); grd.addColorStop(1, '#4d1640');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H);
  c.fillStyle = '#240a1e';
  c.fillRect(0, WALL_H - 8, W, 8);
  c.fillStyle = '#ffd23f';
  c.font = 'bold 22px sans-serif';
  c.textAlign = 'center';
  c.fillText('GAZİNO', W / 2, 46);
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(255,210,63,0.7)';
  c.fillText('Şans Bu Gece Senin Tarafında', W / 2, 70);
}

function drawSlot(c, s) {
  c.save();
  c.translate(s.cx, s.cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, SLOT_HH + 8, SLOT_HW + 8, 10, 0, 0, Math.PI * 2); c.fill();
  const grd = c.createLinearGradient(0, -SLOT_HH, 0, SLOT_HH);
  grd.addColorStop(0, '#3a1030'); grd.addColorStop(1, '#1a0518');
  c.fillStyle = grd;
  roundRectC(c, -SLOT_HW, -SLOT_HH, SLOT_HW * 2, SLOT_HH * 2, 8); c.fill();
  c.strokeStyle = '#ffd23f'; c.lineWidth = 1.5;
  roundRectC(c, -SLOT_HW, -SLOT_HH, SLOT_HW * 2, SLOT_HH * 2, 8); c.stroke();
  c.fillStyle = '#0d0510';
  roundRectC(c, -SLOT_HW + 6, -SLOT_HH + 8, SLOT_HW * 2 - 12, 26, 4); c.fill();
  c.fillStyle = '#ff5fa8';
  c.font = 'bold 16px sans-serif';
  c.textAlign = 'center';
  c.fillText('🎰', 0, -SLOT_HH + 27);
  c.restore();
}

function drawPiyango(c) {
  c.save();
  c.translate(PIYANGO.cx, PIYANGO.cy);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(0, PIYANGO.hh + 8, PIYANGO.hw + 6, 12, 0, 0, Math.PI * 2); c.fill();
  const grd = c.createLinearGradient(0, -PIYANGO.hh, 0, PIYANGO.hh);
  grd.addColorStop(0, '#5c1a4a'); grd.addColorStop(1, '#3a0f30');
  c.fillStyle = grd;
  roundRectC(c, -PIYANGO.hw, -PIYANGO.hh, PIYANGO.hw * 2, PIYANGO.hh * 2, 6); c.fill();
  c.strokeStyle = '#ffd23f'; c.lineWidth = 1.5;
  roundRectC(c, -PIYANGO.hw, -PIYANGO.hh, PIYANGO.hw * 2, PIYANGO.hh * 2, 6); c.stroke();
  c.fillStyle = '#1c0a18';
  roundRectC(c, -36, -PIYANGO.hh - 14, 72, 16, 3); c.fill();
  c.fillStyle = '#ffd23f';
  c.font = 'bold 9px sans-serif';
  c.textAlign = 'center';
  c.fillText('PİYANGO', 0, -PIYANGO.hh - 3);
  c.restore();
}

function drawGamblingTable(c, t) {
  c.save();
  c.translate(t.cx, t.cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, TABLE_R * 0.5 + 8, TABLE_R + 8, 14, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0d5c3a';
  c.beginPath(); c.ellipse(0, 0, TABLE_R, TABLE_R * 0.62, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#ffd23f'; c.lineWidth = 2.5;
  c.stroke();
  c.fillStyle = 'rgba(255,210,63,0.85)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('10', 0, 5);
  c.fillStyle = 'rgba(255,210,63,0.7)';
  c.font = 'bold 9px sans-serif';
  c.fillText('NUMARA', 0, TABLE_R * 0.62 + 16);
  c.restore();
}

function drawBar(c, getAvatarImage) {
  c.save();
  c.translate(BAR.cx, BAR.cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, BAR.hh + 10, BAR.hw + 10, 14, 0, 0, Math.PI * 2); c.fill();
  const grd = c.createLinearGradient(0, -BAR.hh, 0, BAR.hh);
  grd.addColorStop(0, '#4a2e18'); grd.addColorStop(1, '#2a1a0e');
  c.fillStyle = grd;
  roundRectC(c, -BAR.hw, -BAR.hh, BAR.hw * 2, BAR.hh * 2, 8); c.fill();
  c.strokeStyle = '#ffd23f'; c.lineWidth = 1.5;
  roundRectC(c, -BAR.hw, -BAR.hh, BAR.hw * 2, BAR.hh * 2, 8); c.stroke();
  c.fillStyle = '#1c0a18';
  roundRectC(c, -30, -BAR.hh - 14, 60, 16, 3); c.fill();
  c.fillStyle = '#ffd23f';
  c.font = 'bold 9px sans-serif';
  c.textAlign = 'center';
  c.fillText('BAR', 0, -BAR.hh - 3);
  c.restore();

  drawAvatarSprite(c, {
    x: BAR.cx, baseY: BAR.cy - BAR.hh - 30, avatar: BARTENDER_NPC.avatar, pose: 'idle', facing: 'down',
  }, getAvatarImage, { showName: false });
  c.fillStyle = 'rgba(20,12,8,0.85)';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText(BARTENDER_NPC.name, BAR.cx, BAR.cy - BAR.hh - 60);
}

function drawChair(c, seat) {
  c.save();
  c.translate(seat.cx, seat.cy);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(0, 16, 20, 8, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3a1a30';
  roundRectC(c, -14, -2, 28, 16, 3); c.fill();
  c.fillStyle = '#5c2a4a';
  roundRectC(c, -14, -28, 28, 26, 4); c.fill();
  c.strokeStyle = '#ffd23f'; c.lineWidth = 1;
  roundRectC(c, -14, -28, 28, 26, 4); c.stroke();
  c.restore();
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#1c1c22';
  c.fillRect(-46, -6, 92, 40);
  c.fillStyle = '#5c2a4a';
  c.fillRect(-40, -2, 38, 32);
  c.fillRect(2, -2, 38, 32);
  c.fillStyle = '#ffd23f';
  c.beginPath(); c.arc(-8, 14, 2.4, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(8, 14, 2.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText('ÇIKIŞ', 0, 46);
  c.restore();
}

// drawCasinoSceneBackground — canlı ekranın (renderFrame) statik kısmıyla
// AYNI çizim dizisi (piyango NPC dahil), dışa açık — hem burada hem de
// kamera fotoğrafında (bkz. openCamera/renderCameraPreview) VE Sixtagram
// akışında (PostAttachment.jsx) kullanılıyor (bkz. madde 11/12). Bar'daki
// barmen NPC'si zaten drawBar içinde çiziliyor, ayrıca eklemeye gerek yok.
export function drawCasinoSceneBackground(ctx, getAvatarImage) {
  drawFloor(ctx);
  CHAIRS.forEach((s) => drawChair(ctx, s));
  drawDoor(ctx);
  TABLES_10NUMARA.forEach((t) => drawGamblingTable(ctx, t));
  drawBar(ctx, getAvatarImage);
  drawWalls(ctx);
  drawPiyango(ctx);
  SLOTS.forEach((s) => drawSlot(ctx, s));

  // Piyango NPC — büfenin/standın önünde sabit duruyor.
  drawAvatarSprite(ctx, {
    x: PIYANGO.cx, baseY: PIYANGO.cy - PIYANGO.hh - 30, avatar: PIYANGO_NPC.avatar, pose: 'idle', facing: 'down',
  }, getAvatarImage, { showName: false });
  ctx.fillStyle = 'rgba(20,12,8,0.85)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(PIYANGO_NPC.name, PIYANGO.cx, PIYANGO.cy - PIYANGO.hh - 60);
}

export default function CasinoWorldScreen({ onExit, onOpenHeist, onEnterTable }) {
  const { user } = useAuth();
  const { player } = usePlayer();

  const [panel, setPanel] = useState(null); // 'slot' | 'piyango' | 'onnumara' | 'bar' | null
  const [sittingSeatId, setSittingSeatId] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [bufeBusy, setBufeBusy] = useState(null);
  const [barError, setBarError] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraCaption, setCameraCaption] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraDone, setCameraDone] = useState(false);

  const canvasRef = useRef(null);
  const posRef = useRef({ ...START_POS });
  const targetRef = useRef(null);
  const pendingActionRef = useRef(null);
  const facingRef = useRef('up');
  const sittingSeatRef = useRef(null);
  const walkAnimRef = useRef(0);
  const poseRef = useRef('idle');
  const playerRef = useRef(null);
  const holdingRef = useRef(null);
  const holdingTimeoutRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));

  useEffect(() => { sittingSeatRef.current = sittingSeatId; }, [sittingSeatId]);
  useEffect(() => { playerRef.current = player; }, [player]);

  useEffect(() => () => {
    if (holdingTimeoutRef.current) clearTimeout(holdingTimeoutRef.current);
  }, []);

  function getAvatarImage(avatar, pose) {
    return getAvatarImageRef.current(avatar, pose);
  }

  // --- Ana döngü: hareket + çizim (Firestore yazma yok — tek oyunculu) --
  useEffect(() => {
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
            sittingSeatRef.current = action.seat.id;
            setSittingSeatId(action.seat.id);
          } else if (action?.type) {
            setPanel(action.type);
          }
        } else {
          moving = true;
          const vx = dx / d, vy = dy / d;
          const rawX = p.x + vx * PLAYER_SPEED * dt;
          const rawY = p.y + vy * PLAYER_SPEED * dt;
          const next = pendingActionRef.current
            ? { x: Math.max(30, Math.min(W - 30, rawX)), y: Math.max(30, Math.min(H - 30, rawY)) }
            : resolveObstaclePosition(rawX, rawY, OBSTACLES, { playerRadius: PLAYER_R, minX: 30, maxX: W - 30, minY: 30, maxY: H - 30 });
          posRef.current = next;
          facingRef.current = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
          walkAnimRef.current += dt;
          poseRef.current = Math.floor(walkAnimRef.current / 0.16) % 2 === 0 ? 'walk1' : 'walk2';
        }
      }
      if (!moving) poseRef.current = 'idle';

      renderFrame();
      if (cameraOpenRef.current && !cameraDoneRef.current) renderCameraPreview();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Kamera (madde 11/12) — diğer üç mekanla BİREBİR aynı desen; Casino
  // oturma mekaniğine sahip olduğu için poz seçimi Bank'takiyle aynı
  // (oturuyorsa 'sit', değilse canlı poseRef).
  function buildCameraEntities() {
    const p = posRef.current;
    const self = {
      dx: 0, dy: 0,
      avatar: playerRef.current?.avatar,
      pose: sittingSeatRef.current ? 'sit' : (poseRef.current || 'idle'),
      facing: facingRef.current,
      isSelf: true,
    };
    return { originX: p.x, originY: p.y, entities: [self] };
  }

  function openCamera() {
    const frame = buildCameraEntities();
    cameraFrameRef.current = frame;
    setCameraCaption('');
    setCameraError(null);
    setCameraDone(false);
    cameraDoneRef.current = false;
    setCameraOpen(true);
    cameraOpenRef.current = true;
  }

  function closeCamera() {
    setCameraOpen(false);
    cameraOpenRef.current = false;
  }

  function renderCameraPreview() {
    const canvas = cameraCanvasRef.current;
    const frame = cameraFrameRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext('2d');
    renderPhotoFrame(ctx, {
      width: canvas.width,
      height: canvas.height,
      originX: frame.originX,
      originY: frame.originY,
      entities: frame.entities,
      getAvatarImage,
      drawBackground: (bgCtx) => drawCasinoSceneBackground(bgCtx, getAvatarImage),
    });
  }

  async function handleShareCamera() {
    setCameraBusy(true);
    setCameraError(null);
    try {
      const frame = cameraFrameRef.current;
      const self = frame?.entities?.[0];
      await createSixtagramPost(cameraCaption, {
        type: 'interiorPhoto', locationId: 'gazino',
        pose: self?.pose, facing: self?.facing, x: frame?.originX, y: frame?.originY,
      });
      setCameraDone(true);
      cameraDoneRef.current = true;
    } catch (err) {
      setCameraError(err.message || 'Paylaşılamadı.');
    } finally {
      setCameraBusy(false);
    }
  }

  const handleBuyDrink = async (item) => {
    setBufeBusy(item.id);
    setBarError(null);
    try {
      await buyFromGazinoBar(item.id);
      // Tek oyunculu (Firestore presence yok) — sadece ref'e yazmak yeterli,
      // canvas döngüsü zaten her karede holdingRef.current'i okuyor.
      holdingRef.current = item.id;
      if (holdingTimeoutRef.current) clearTimeout(holdingTimeoutRef.current);
      holdingTimeoutRef.current = setTimeout(() => {
        holdingRef.current = null;
      }, HOLDING_MS);
    } catch (err) {
      setBarError(err.message || 'Satın alma başarısız.');
    } finally {
      setBufeBusy(null);
    }
  };

  function renderFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    drawCasinoSceneBackground(ctx, getAvatarImage);

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetRef.current.x, targetRef.current.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sitShift = sittingSeatRef.current ? SPRITE_H * 0.32 : 0;
    const myEntity = {
      x: posRef.current.x, baseY: posRef.current.y + sitShift,
      avatar: playerRef.current?.avatar, pose: sittingSeatRef.current ? 'sit' : poseRef.current,
      facing: facingRef.current, isSelf: true, holding: holdingRef.current,
    };
    drawAvatarSprite(ctx, myEntity, getAvatarImage, { showName: false });
    if (holdingRef.current) {
      drawHeldIcon(ctx, holdingRef.current, posRef.current.x + 26, posRef.current.y - SPRITE_H * 0.42 + sitShift, { animate: true });
    }

    // NPC konuşma baloncukları
    const bubbleItems = [];
    const piyangoLine = cyclingLine(PIYANGO_NPC.lines, { phase: 0 });
    if (piyangoLine) {
      const lines = wrapBubbleText(ctx, piyangoLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = PIYANGO.cy - PIYANGO.hh - 30 - SPRITE_H - 10;
      bubbleItems.push({ x: PIYANGO.cx, w, h, lines, ts: 0, naturalTop: anchorY - h });
    }
    const bartenderLine = cyclingLine(BARTENDER_NPC.lines, { phase: 11 });
    if (bartenderLine) {
      const lines = wrapBubbleText(ctx, bartenderLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = BAR.cy - BAR.hh - 30 - SPRITE_H - 10;
      bubbleItems.push({ x: BAR.cx, w, h, lines, ts: 1, naturalTop: anchorY - h });
    }
    layoutBubbles(bubbleItems).forEach((item) => drawBubbleBox(ctx, item, W));
  }

  function pointerToCanvas(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function standUp() {
    sittingSeatRef.current = null;
    setSittingSeatId(null);
  }

  function tryStation(p, station, radiusForClick, panelType, interactExtra = 0, standoff = 60) {
    if (dist(p, station) < radiusForClick) {
      if (dist(posRef.current, station) < INTERACT_RADIUS + interactExtra) {
        setPanel(panelType);
      } else {
        pendingActionRef.current = { type: panelType };
        targetRef.current = { x: station.cx, y: station.cy + standoff };
      }
      return true;
    }
    return false;
  }

  function handleCanvasClick(e) {
    const p = pointerToCanvas(e);
    if (sittingSeatRef.current) standUp();

    const chair = !sittingSeatRef.current && CHAIRS.find((s) => dist(p, s) < CHAIR_R + 16);
    if (chair) {
      pendingActionRef.current = { type: 'sit', seat: { id: chair.id, x: chair.cx, y: chair.cy + 6 } };
      targetRef.current = { x: chair.cx, y: chair.cy + 6 };
      return;
    }

    const slot = SLOTS.find((s) => dist(p, s) < SLOT_HW + 30);
    if (slot && tryStation(p, slot, SLOT_HW + 30, 'slot', SLOT_HH, SLOT_HH + 46)) return;

    if (tryStation(p, PIYANGO, PIYANGO.hw + 30, 'piyango', PIYANGO.hh, PIYANGO.hh + 46)) return;

    const table = TABLES_10NUMARA.find((t) => dist(p, t) < TABLE_R + 20);
    if (table && tryStation(p, table, TABLE_R + 20, 'onnumara', TABLE_R * 0.5, TABLE_R + 40)) return;

    if (tryStation(p, BAR, BAR.hw + 30, 'bar', BAR.hh, BAR.hh + 46)) return;

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  if (!user) {
    return (
      <div className="ws-fullscreen" style={{ '--ws-bg': '#1a0f1c' }}>
        <button className="ws-exit-btn" onClick={onExit}>✕</button>
        <p className="ws-hint" style={{ padding: 16, color: '#f2ecdd' }}>Gazinoya girmek için giriş yapmalısın.</p>
      </div>
    );
  }

  const panelTitles = {
    slot: '🎰 Slot Makinesi',
    piyango: '🎟️ Piyango Bileti',
    onnumara: '🃏 10 Numara Masası',
    bar: '🍸 Bar',
  };

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#1a0f1c', '--ws-panel-bg': '#1c1c24' }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
      {onOpenHeist && (
        <button className="ws-heist-btn" onClick={() => onOpenHeist('casino')}>Soygun</button>
      )}
      <button className="ws-exit-btn" onClick={onExit}>✕</button>

      <div className="ws-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="ws-canvas"
          onPointerDown={handleCanvasClick}
        />
        <button className="ws-phone-btn" onClick={() => setPhoneOpen(true)} title="Telefon">📱</button>
        <button className="ws-camera-btn" onClick={openCamera} title="Fotoğraf çek">📷</button>
      </div>

      {phoneOpen && <PhoneScreen onClose={() => setPhoneOpen(false)} onEnterTable={() => {}} />}

      {panel != null && (
        <div className="ws-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            <p className="ws-panel-title">{panelTitles[panel]}</p>
            {panel === 'slot' && <SlotScreen />}
            {panel === 'piyango' && <LotteryScreen />}
            {panel === 'onnumara' && <OnNumaraScreen onEnterTable={onEnterTable} />}
            {panel === 'bar' && (
              <div className="cw-bar-grid">
                {BAR_MENU.map((item) => (
                  <button
                    key={item.id}
                    className="cw-bar-item"
                    disabled={bufeBusy === item.id}
                    onClick={() => handleBuyDrink(item)}
                  >
                    <span className="cw-bar-emoji">{item.emoji}</span>
                    <span>{item.label}</span>
                    <span className="cw-bar-price">{item.price.toLocaleString('tr-TR')} altın</span>
                  </button>
                ))}
                {barError && <p className="cw-bar-error">{barError}</p>}
              </div>
            )}
            <button className="ws-panel-btn" onClick={() => setPanel(null)}>Uzaklaş</button>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="ws-panel-backdrop" onClick={closeCamera}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            {!cameraDone ? (
              <>
                <p className="ws-panel-title">📷 Fotoğraf Çek</p>
                <div className="ws-camera-preview">
                  <canvas ref={cameraCanvasRef} width={320} height={320} className="ws-camera-canvas" />
                </div>
                <p className="ws-hint">
                  Bulunduğun yerin gerçek görüntüsüyle bir kare — o an gerçekten nerede duruyorsan öyle.
                </p>
                <input
                  className="ws-camera-caption"
                  placeholder="Fotoğrafa bir açıklama yaz…"
                  value={cameraCaption}
                  maxLength={200}
                  onChange={(e) => setCameraCaption(e.target.value)}
                />
                {cameraError && <p className="ws-error">{cameraError}</p>}
                <button className="ws-panel-btn primary" disabled={cameraBusy} onClick={handleShareCamera}>
                  {cameraBusy ? 'Paylaşılıyor…' : "📤 Sixtagram'da Paylaş"}
                </button>
                <button className="ws-panel-btn" onClick={closeCamera}>Vazgeç</button>
              </>
            ) : (
              <>
                <p className="ws-panel-title">Paylaşıldı! 🎉</p>
                <p className="ws-hint">Fotoğrafın Sixtagram akışında.</p>
                <button className="ws-panel-btn primary" onClick={closeCamera}>Tamam</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
