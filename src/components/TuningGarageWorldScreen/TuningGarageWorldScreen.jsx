import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInteriorPresence } from '../../hooks/useInteriorPresence';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import {
  roundRectC, drawAvatarSprite, createAvatarImageCache, renderPhotoFrame,
  wrapBubbleText, measureBubble, layoutBubbles, drawBubbleBox,
  resolveObstaclePosition, cyclingLine, SPRITE_H,
} from '../../lib/canvasWorldKit';
import Hud from '../Hud/Hud';
import PhoneScreen from '../Phone/PhoneScreen';
import GarageScreen from '../GarageScreen/GarageScreen';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { createSixtagramPost, enterInterior } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';

// --- Modifiye Garajı içi -----------------------------------------------
// BankWorldScreen ile BİREBİR aynı iskelet (sabit mekan, karakter yürüyor,
// TEK OYUNCULU görsel NPC + Firestore üzerinden canlı diğer oyuncular).
// Fark: burada tek bir "usta" NPC'si var; onunla etkileşime girince zaten
// var olan (GarageScreen bileşenindeki) araç modifiye/tamir paneli açılıyor
// — modifiye/tamir MANTIĞI burada TEKRARLANMIYOR, sadece panel içine
// gömülüyor (bkz. BankWorldScreen'in <BankScreen /> kullanımıyla aynı desen).
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;

// AVATAR_SCALE — Banka'daki gibi bina içi avatarları biraz büyütüyoruz
// (bkz. BankWorldScreen.jsx'teki aynı isimli sabitin yorumu).
const AVATAR_SCALE = 1.42;

// Duvar panosunun alt sınırı (tabela + tehlike şeridi burada biter).
const WALL_H = 160;

// Neon renk paleti (bkz. styles/theme.css --neon-cyan/--neon-pink/--neon-yellow)
// — banka/gazino gibi sıcak/eski tonlar yerine bu mekan "Neon Şehir"in
// karakteristik neon aydınlatmasını kullanıyor, kirli/yağlı garaj zeminiyle
// tezat oluşturuyor.
const ACCENT = '#19e8ff'; // alet duvarı / tezgah / parça rafı / yükseltici
const ACCENT2 = '#ff2e8c'; // boya kabini

// --- Sabit düzen (referans mockup'taki bölge fikirleri, bu projenin
// 680x1180'lik (mockup'tan daha dar/uzun) tuvaline oranlı olarak yeniden
// yerleştirildi — koordinatlar birebir kopyalanmadı). ----------------------
const LIFT = { cx: 340, cy: 460, w: 280, h: 170 };
const TOOL_WALL = { x1: 40, y1: 180, x2: 280, y2: 320 };
const WORKBENCH = { x1: 400, y1: 190, x2: 640, y2: 320 };
const TIRE_STACK = { cx: 110, cy: 660, r: 50 };
const PARTS_SHELF = { x1: 460, y1: 610, x2: 640, y2: 740 };
const PAINT_BOOTH = { x1: 60, y1: 790, x2: 340, y2: 940 };

const USTA = { cx: 420, cy: 860 };
const USTA_R = 40;

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

function rectObstacle(rect) {
  return {
    cx: (rect.x1 + rect.x2) / 2,
    cy: (rect.y1 + rect.y2) / 2,
    hw: (rect.x2 - rect.x1) / 2,
    hh: (rect.y2 - rect.y1) / 2,
  };
}

const OBSTACLES = [
  rectObstacle(TOOL_WALL),
  rectObstacle(WORKBENCH),
  { cx: LIFT.cx, cy: LIFT.cy, hw: LIFT.w / 2, hh: LIFT.h / 2 },
  { cx: TIRE_STACK.cx, cy: TIRE_STACK.cy, r: TIRE_STACK.r },
  rectObstacle(PARTS_SHELF),
  rectObstacle(PAINT_BOOTH),
  { cx: USTA.cx, cy: USTA.cy, r: USTA_R },
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

const USTA_NPC = {
  name: 'Usta',
  lines: [
    'Egzoz sesini biraz daha kabartalım mı?',
    'Süspansiyonu sertleştirdim, hemen fark edeceksin.',
    'Turbo montajı bitmek üzere.',
    'Renk değişimi için boya kabinine geçebiliriz.',
    'Bir bakalım hele şu motora.',
  ],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#c68642',
    hairStyle: 'short', hairColor: '#241813', facialHair: 'mustache',
    clothing: 'jumpsuit', clothColor: '#3a4048', neckAcc: 'none',
    pantsColor: '#22262f', hat: 'cap', hatColor: '#c0392b', background: 'transparent',
  },
};

function drawFloor(c) {
  c.fillStyle = '#24262a';
  c.fillRect(0, 0, W, H);
  const tile = 58;
  for (let y = WALL_H; y < H; y += tile) {
    for (let x = 0; x < W; x += tile) {
      const alt = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
      c.fillStyle = alt ? '#2a2c30' : '#24262a';
      c.fillRect(x, y, tile, tile);
    }
  }
  c.strokeStyle = 'rgba(25,232,255,0.05)';
  c.lineWidth = 1;
  for (let x = 0; x <= W; x += tile) {
    c.beginPath(); c.moveTo(x, WALL_H); c.lineTo(x, H); c.stroke();
  }
  for (let y = WALL_H; y <= H; y += tile) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
}

// drawHazardStripe — garaj zemin/duvar sınırlarında görülen sarı-siyah
// diyagonal "dikkat" şeridi, sadece atmosfer/kirli-garaj hissi için.
function drawHazardStripe(c, x, y, w, h) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#141416';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#ffd23f';
  const step = 18;
  for (let sx = x - h; sx < x + w + h; sx += step) {
    c.beginPath();
    c.moveTo(sx, y + h);
    c.lineTo(sx + h, y);
    c.lineTo(sx + h + step / 2, y);
    c.lineTo(sx + step / 2, y + h);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function drawWalls(c) {
  const grd = c.createLinearGradient(0, 0, 0, WALL_H);
  grd.addColorStop(0, '#1b1d22');
  grd.addColorStop(1, '#26282e');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H - 10);
  drawHazardStripe(c, 0, WALL_H - 10, W, 10);

  c.textAlign = 'center';
  c.shadowColor = ACCENT;
  c.shadowBlur = 16;
  c.fillStyle = ACCENT;
  c.font = 'bold 24px sans-serif';
  c.fillText('MODİFİYE GARAJI', W / 2, 48);
  c.shadowBlur = 0;
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(25,232,255,0.7)';
  c.fillText('Hız senin. Ayar bizim işimiz.', W / 2, 72);
}

function drawTool(c, x, y, type) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = '#8a8f96'; c.lineWidth = 2;
  c.beginPath(); c.arc(0, -14, 3, 0, Math.PI * 2); c.stroke();
  if (type === 'wrench') {
    c.fillStyle = '#c9cdd2';
    roundRectC(c, -4, -8, 8, 26, 3); c.fill();
    c.beginPath(); c.arc(0, 16, 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6a6e73'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 16, 7, 0, Math.PI * 2); c.stroke();
  } else if (type === 'hammer') {
    c.fillStyle = '#8a5a34';
    roundRectC(c, -2, -8, 4, 26, 2); c.fill();
    c.fillStyle = '#4a4d51';
    roundRectC(c, -10, -10, 20, 10, 2); c.fill();
  } else if (type === 'screwdriver') {
    c.fillStyle = '#d94f2a';
    roundRectC(c, -4, -8, 8, 12, 2); c.fill();
    c.fillStyle = '#c9cdd2';
    roundRectC(c, -2, 4, 4, 20, 1); c.fill();
  } else {
    c.strokeStyle = '#c9cdd2'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-6, -6); c.lineTo(6, 18); c.stroke();
    c.beginPath(); c.moveTo(6, -6); c.lineTo(-6, 18); c.stroke();
  }
  c.restore();
}

function drawToolWall(c) {
  const t = TOOL_WALL;
  c.fillStyle = '#1a1c1f';
  roundRectC(c, t.x1, t.y1, t.x2 - t.x1, t.y2 - t.y1, 8); c.fill();
  c.strokeStyle = ACCENT; c.lineWidth = 2.4;
  roundRectC(c, t.x1, t.y1, t.x2 - t.x1, t.y2 - t.y1, 8); c.stroke();

  const rows = 2, cols = 5;
  const cw = (t.x2 - t.x1 - 20) / cols;
  const rh = (t.y2 - t.y1 - 24) / rows;
  const tools = ['wrench', 'hammer', 'screwdriver', 'pliers', 'wrench', 'screwdriver', 'hammer', 'pliers', 'wrench', 'screwdriver'];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const tx = t.x1 + 10 + cw * col + cw / 2;
      const ty = t.y1 + 12 + rh * r + rh / 2;
      drawTool(c, tx, ty, tools[idx % tools.length]);
      idx++;
    }
  }
  c.fillStyle = ACCENT;
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('ALET DUVARI', (t.x1 + t.x2) / 2, t.y2 + 16);
}

function drawWorkbench(c) {
  const w = WORKBENCH;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(w.x1 - 4, w.y2 - 4, w.x2 - w.x1 + 8, 10);
  c.fillStyle = '#33414c';
  roundRectC(c, w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1, 8); c.fill();
  c.strokeStyle = ACCENT; c.lineWidth = 2.4;
  roundRectC(c, w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1, 8); c.stroke();
  c.fillStyle = '#c9cdd2';
  roundRectC(c, w.x1 + 10, w.y1 + 8, w.x2 - w.x1 - 20, (w.y2 - w.y1) * 0.38, 4); c.fill();
  const partColors = [ACCENT2, ACCENT, '#ffd23f'];
  for (let i = 0; i < 3; i++) {
    c.fillStyle = partColors[i];
    roundRectC(c, w.x1 + 16 + i * 44, w.y1 + (w.y2 - w.y1) * 0.55, 28, 20, 4); c.fill();
  }
  c.fillStyle = ACCENT;
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('TEZGAH', (w.x1 + w.x2) / 2, w.y2 + 16);
}

function drawCarSilhouette(c, cx, cy, w, bodyColor) {
  c.save();
  c.translate(cx, cy);
  const h = w * 0.34;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  roundRectC(c, -w / 2 - 3, -h * 0.05, w + 6, h * 0.5, 6); c.fill();

  c.fillStyle = bodyColor;
  c.beginPath();
  c.moveTo(-w / 2, h * 0.1);
  c.lineTo(-w / 2 + 18, -h * 0.05);
  c.lineTo(-w * 0.22, -h * 0.42);
  c.lineTo(w * 0.2, -h * 0.42);
  c.lineTo(w / 2 - 16, -h * 0.05);
  c.lineTo(w / 2, h * 0.1);
  c.lineTo(w / 2, h * 0.28);
  c.lineTo(-w / 2, h * 0.28);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 2;
  c.stroke();

  c.fillStyle = 'rgba(150,220,230,0.55)';
  c.beginPath();
  c.moveTo(-w * 0.18, -h * 0.38);
  c.lineTo(w * 0.16, -h * 0.38);
  c.lineTo(w * 0.24, -h * 0.08);
  c.lineTo(-w * 0.26, -h * 0.08);
  c.closePath();
  c.fill();

  c.fillStyle = '#141517';
  c.beginPath(); c.arc(-w * 0.3, h * 0.28, h * 0.22, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(w * 0.3, h * 0.28, h * 0.22, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#8a8f96';
  c.beginPath(); c.arc(-w * 0.3, h * 0.28, h * 0.1, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(w * 0.3, h * 0.28, h * 0.1, 0, Math.PI * 2); c.fill();

  c.fillStyle = '#f2e8c0';
  c.beginPath(); c.ellipse(w / 2 - 6, 0, 5, 8, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawLift(c) {
  const l = LIFT;
  const x1 = l.cx - l.w / 2;
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(l.cx, l.cy + l.h / 2 + 16, l.w / 2 + 12, 16, 0, 0, Math.PI * 2); c.fill();

  c.fillStyle = '#4a4d51';
  c.fillRect(x1 + 18, l.cy - l.h / 2, 16, l.h + 20);
  c.fillRect(x1 + l.w - 34, l.cy - l.h / 2, 16, l.h + 20);
  c.strokeStyle = ACCENT; c.lineWidth = 2;
  c.strokeRect(x1 + 18, l.cy - l.h / 2, 16, l.h + 20);
  c.strokeRect(x1 + l.w - 34, l.cy - l.h / 2, 16, l.h + 20);

  c.fillStyle = '#232527';
  roundRectC(c, x1, l.cy + l.h / 2 - 8, l.w, 16, 4); c.fill();

  drawCarSilhouette(c, l.cx, l.cy - 8, l.w * 0.8, ACCENT2);

  c.fillStyle = ACCENT;
  c.font = 'bold 13px sans-serif';
  c.textAlign = 'center';
  c.fillText('YÜKSELTİCİ', l.cx, l.cy + l.h / 2 + 40);
}

function drawTireStack(c) {
  const t = TIRE_STACK;
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath(); c.ellipse(t.cx, t.cy + t.r + 12, t.r + 10, 12, 0, 0, Math.PI * 2); c.fill();

  for (let i = 0; i < 4; i++) {
    const ty = t.cy + t.r * 0.5 - i * 18;
    c.fillStyle = '#18191b';
    c.beginPath(); c.ellipse(t.cx, ty, t.r, 16, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#4a4d51'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(t.cx, ty, t.r, 16, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#28292c';
    c.beginPath(); c.ellipse(t.cx, ty, t.r * 0.42, 7, 0, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = ACCENT;
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('LASTİKLER', t.cx, t.cy + t.r + 46);
}

function drawPartsShelf(c) {
  const s = PARTS_SHELF;
  c.fillStyle = '#1a1c1f';
  roundRectC(c, s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1, 8); c.fill();
  c.strokeStyle = ACCENT; c.lineWidth = 2.4;
  roundRectC(c, s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1, 8); c.stroke();
  c.strokeStyle = 'rgba(25,232,255,0.35)'; c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(s.x1 + 8, s.y1 + (s.y2 - s.y1) / 2);
  c.lineTo(s.x2 - 8, s.y1 + (s.y2 - s.y1) / 2);
  c.stroke();

  const colors = [ACCENT2, ACCENT, '#ffd23f', '#5aa06a', '#c9cdd2', ACCENT2];
  const cols = 3, rows = 2;
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const bx = s.x1 + 12 + col * ((s.x2 - s.x1 - 24) / cols);
      const by = s.y1 + 8 + r * ((s.y2 - s.y1 - 16) / rows);
      c.fillStyle = colors[idx % colors.length];
      roundRectC(c, bx, by, (s.x2 - s.x1 - 24) / cols - 6, (s.y2 - s.y1 - 16) / rows - 6, 3); c.fill();
      idx++;
    }
  }

  c.fillStyle = ACCENT;
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('PARÇA RAFI', (s.x1 + s.x2) / 2, s.y2 + 16);
}

function drawSprayCan(c, x, y, color) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#8a8f96';
  roundRectC(c, -8, -22, 16, 6, 2); c.fill();
  c.fillStyle = color;
  roundRectC(c, -9, -16, 18, 30, 4); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  roundRectC(c, -9, -16, 18, 30, 4); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(-6, -10, 4, 18);
  c.restore();
}

function drawPaintBooth(c) {
  const p = PAINT_BOOTH;
  c.fillStyle = '#1a1c1f';
  roundRectC(c, p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1, 10); c.fill();
  c.strokeStyle = ACCENT2; c.lineWidth = 2.4;
  roundRectC(c, p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1, 10); c.stroke();
  c.strokeStyle = 'rgba(255,46,140,0.25)'; c.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    c.beginPath();
    c.moveTo(p.x1 + 8, p.y1 + i * (p.y2 - p.y1) / 4);
    c.lineTo(p.x2 - 8, p.y1 + i * (p.y2 - p.y1) / 4);
    c.stroke();
  }

  const cansY = p.y1 + (p.y2 - p.y1) * 0.58;
  const cansColors = [ACCENT2, ACCENT, '#ffd23f', '#5aa06a'];
  cansColors.forEach((col, i) => {
    drawSprayCan(c, p.x1 + 46 + i * 54, cansY, col);
  });

  c.fillStyle = ACCENT2;
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('BOYA KABİNİ', (p.x1 + p.x2) / 2, p.y2 + 16);
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#101114';
  c.fillRect(-60, -8, 120, 50);
  c.fillStyle = '#2a2c30';
  for (let i = 0; i < 4; i++) {
    c.fillRect(-54, -4 + i * 11, 108, 8);
  }
  c.strokeStyle = ACCENT; c.lineWidth = 2;
  c.strokeRect(-60, -8, 120, 50);
  c.restore();
}

function drawUsta(c, getAvatarImage) {
  drawAvatarSprite(c, {
    x: USTA.cx, baseY: USTA.cy, avatar: USTA_NPC.avatar, pose: 'idle', facing: 'down', name: USTA_NPC.name,
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
  c.fillStyle = 'rgba(10,14,18,0.8)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText(USTA_NPC.name, USTA.cx, USTA.cy + 16);
}

// drawGarageSceneBackground — canlı ekranın statik kısmıyla AYNI çizim
// dizisi, tek bir yerde toplandı (dışa açık) — BankWorldScreen'deki
// drawBankSceneBackground ile aynı gerekçe: hem burada hem kamera
// fotoğrafında hem de ileride Sixtagram akışındaki (PostAttachment.jsx)
// interiorPhoto önizlemesinde kullanılabilsin diye.
export function drawGarageSceneBackground(ctx, getAvatarImage) {
  drawFloor(ctx);
  drawWalls(ctx);
  drawDoor(ctx);
  drawToolWall(ctx);
  drawWorkbench(ctx);
  drawLift(ctx);
  drawTireStack(ctx);
  drawPartsShelf(ctx);
  drawPaintBooth(ctx);
  drawUsta(ctx, getAvatarImage);
}

export default function TuningGarageWorldScreen({ onExit, onOpenHeist }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { others, updatePresence, clearPresence } = useInteriorPresence('modifiye_garaji');

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'garage' | null
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  // Yeni istek: "yeni mesaj yazdığımızda eskisi direkt yok olmasın, süresi
  // bitene kadar var olmaya devam etsin" — tek bir mesaj yerine, HENÜZ
  // süresi dolmamış mesajların dizisi tutuluyor (bkz. sendChat/renderFrame).
  const [myBubbles, setMyBubbles] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraCaption, setCameraCaption] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraDone, setCameraDone] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  const canvasRef = useRef(null);
  const posRef = useRef({ ...START_POS });
  const targetRef = useRef(null);
  const pendingActionRef = useRef(null);
  const facingRef = useRef('up');
  const walkAnimRef = useRef(0);
  const poseRef = useRef('idle');
  const playerRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));
  // --- Canlı/çok oyunculu — Banka/Park'takiyle BİREBİR aynı desen, bkz.
  // hooks/useInteriorPresence.js ve BankWorldScreen.jsx'teki yorumlar.
  const myBubblesRef = useRef([]);
  const othersRef = useRef([]);
  // Diğer oyuncuların mesaj geçmişi — Firestore presence dokümanı SADECE
  // tek bir "o anki" chatText/chatTs alanı taşıyor, bu yüzden istemci
  // tarafında YEREL olarak biriktiriliyor (bkz. ParkWorldScreen.jsx'teki
  // birebir aynı desen).
  const othersBubbleHistoryRef = useRef(new Map()); // uid -> [{text, ts}]
  const lastSeenChatTsRef = useRef(new Map()); // uid -> son kaydedilen chatTs
  const lastSyncRef = useRef(0);
  const lastSyncedPosRef = useRef({ ...START_POS });
  const wasMovingRef = useRef(false);
  const pausedRef = useRef(false);
  const MOVE_SYNC_INTERVAL_MS = 300;
  const MOVE_SYNC_MIN_DIST = 6;
  const IDLE_HEARTBEAT_MS = 12_000;
  const CHAT_BUBBLE_MS = 13000; // yeni istek: "bi tık daha uzun dursun" (eskisi 9500)

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { myBubblesRef.current = myBubbles; }, [myBubbles]);
  useEffect(() => {
    othersRef.current = others;
    const now = Date.now();
    others.forEach((o) => {
      if (!o.chatText || !o.chatTs) return;
      if (lastSeenChatTsRef.current.get(o.uid) === o.chatTs) return; // zaten kaydedildi
      lastSeenChatTsRef.current.set(o.uid, o.chatTs);
      const history = (othersBubbleHistoryRef.current.get(o.uid) || []).filter(
        (b) => now - b.ts < CHAT_BUBBLE_MS
      );
      history.push({ text: o.chatText, ts: o.chatTs });
      othersBubbleHistoryRef.current.set(o.uid, history);
    });
  }, [others]);

  useEffect(() => {
    if (myBubbles.length === 0) return undefined;
    const now = Date.now();
    const earliestTs = Math.min(...myBubbles.map((b) => b.ts));
    const msUntilExpiry = Math.max(0, earliestTs + CHAT_BUBBLE_MS - now);
    const id = setTimeout(() => {
      setMyBubbles((prev) => prev.filter((b) => Date.now() - b.ts < CHAT_BUBBLE_MS));
    }, msUntilExpiry);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBubbles]);

  function getAvatarImage(avatar, pose) {
    return getAvatarImageRef.current(avatar, pose);
  }

  // Garaja giriş/çıkış — BankWorldScreen'in enterInterior('banka') çağrısıyla
  // BİREBİR aynı desen, sadece locationId 'modifiye_garaji' (bkz.
  // functions/index.js enterInterior).
  useEffect(() => {
    if (!user) {
      // Misafir: sunucuya giriş bildirimi yok (enterInterior auth ister),
      // ama sahnede serbestçe yürüyebilmesi için yerel olarak hazır
      // sayıyoruz — sunucu senkronu (updatePresence, zaten `user`
      // kontrollü) devre dışı kalıyor.
      posRef.current = { ...START_POS };
      lastSyncedPosRef.current = { ...START_POS };
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    enterInterior('modifiye_garaji')
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || START_POS;
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Modifiye garajına giriş hatası:', err);
        setReady(true);
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

  // --- Ana döngü: hareket + çizim + Firestore senkronu ---------------------
  useEffect(() => {
    if (!ready) return undefined;
    let raf;
    let lastT = performance.now();

    const tick = (t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      let moving = false;

      if (targetRef.current) {
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
          if (action?.type === 'usta') {
            setPanel('garage');
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

      // --- Firestore senkronu — Banka'dakiyle BİREBİR aynı: sadece anlamlı
      // değişimde / seyrek nabız, ekonomiye dokunmayan alanlar.
      if (!pausedRef.current && user) {
        const p = posRef.current;
        const movedDist = dist(p, lastSyncedPosRef.current);
        const sinceLast = t - lastSyncRef.current;
        if (moving) {
          if (sinceLast > MOVE_SYNC_INTERVAL_MS && movedDist > MOVE_SYNC_MIN_DIST) {
            lastSyncRef.current = t; lastSyncedPosRef.current = { ...p };
            updatePresence(user.uid, { x: p.x, y: p.y, facing: facingRef.current, pose: poseRef.current, seat: null });
          }
        } else if (wasMovingRef.current) {
          lastSyncRef.current = t; lastSyncedPosRef.current = { ...p };
          updatePresence(user.uid, { x: p.x, y: p.y, facing: facingRef.current, pose: 'idle', seat: null });
        } else if (sinceLast > IDLE_HEARTBEAT_MS) {
          lastSyncRef.current = t;
          updatePresence(user.uid, { x: p.x, y: p.y, facing: facingRef.current, pose: 'idle', seat: null });
        }
      }
      wasMovingRef.current = moving;

      renderFrame();
      if (cameraOpenRef.current && !cameraDoneRef.current) renderCameraPreview();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.uid]);

  const sendChat = () => {
    const text = chatText.trim();
    if (!text || !user) return;
    const ts = Date.now();
    setMyBubbles((prev) => [...prev.filter((b) => ts - b.ts < CHAT_BUBBLE_MS), { text, ts }]);
    updatePresence(user.uid, {
      x: posRef.current.x, y: posRef.current.y, facing: facingRef.current, pose: 'idle', seat: null,
      chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  // --- Kamera — Banka'dakiyle BİREBİR aynı desen: tek oyunculu kare
  // (başka gerçek oyuncu yok), arka plan gerçek (drawGarageSceneBackground).
  // latestActiveBubble — yeni istek: "mesajlar da fotoğrafta gözükse çok
  // iyi olur" — henüz süresi dolmamış EN YENİ mesajı döner (yoksa null).
  function latestActiveBubble(list) {
    const now = Date.now();
    const active = (list || []).filter((b) => now - b.ts < CHAT_BUBBLE_MS);
    if (active.length === 0) return null;
    return active[active.length - 1];
  }

  function buildCameraEntities() {
    const p = posRef.current;
    const selfBubble = latestActiveBubble(myBubblesRef.current);
    const self = {
      dx: 0, dy: 0,
      avatar: playerRef.current?.avatar,
      pose: poseRef.current || 'idle',
      facing: facingRef.current,
      isSelf: true,
      scale: AVATAR_SCALE,
      bubbleText: selfBubble?.text || null,
      bubbleTs: selfBubble?.ts || 0,
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
      drawBackground: (bgCtx) => drawGarageSceneBackground(bgCtx, getAvatarImage),
      focalScale: AVATAR_SCALE,
    });
  }

  async function handleShareCamera() {
    setCameraBusy(true);
    setCameraError(null);
    try {
      const frame = cameraFrameRef.current;
      const self = frame?.entities?.[0];
      await createSixtagramPost(cameraCaption, {
        type: 'interiorPhoto', locationId: 'modifiye_garaji',
        pose: self?.pose, facing: self?.facing, x: frame?.originX, y: frame?.originY,
        bubbleText: self?.bubbleText || null,
      });
      setCameraDone(true);
      cameraDoneRef.current = true;
    } catch (err) {
      setCameraError(err.message || 'Paylaşılamadı.');
    } finally {
      setCameraBusy(false);
    }
  }

  function renderFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    drawGarageSceneBackground(ctx, getAvatarImage);

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(25,232,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetRef.current.x, targetRef.current.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    const now = Date.now();
    const myBubblesNow = myBubblesRef.current.filter((b) => now - b.ts < CHAT_BUBBLE_MS);

    const rawEntities = [
      ...othersRef.current.map((o) => ({
        x: o.x, y: o.y, avatar: o.avatar, pose: o.pose || 'idle',
        facing: o.facing || 'down', name: o.displayName || 'Oyuncu',
        bubbleList: (othersBubbleHistoryRef.current.get(o.uid) || []).filter((b) => now - b.ts < CHAT_BUBBLE_MS),
        isSelf: false,
      })),
      {
        x: posRef.current.x, y: posRef.current.y, avatar: playerRef.current?.avatar,
        pose: poseRef.current, facing: facingRef.current,
        name: playerRef.current?.displayName || 'Sen', bubbleList: myBubblesNow, isSelf: true,
      },
    ];
    const entities = rawEntities
      .map((e) => ({ ...e, baseY: e.y }))
      .sort((a, b) => a.y - b.y);
    entities.forEach((e) => drawAvatarSprite(ctx, e, getAvatarImage, { showName: !e.isSelf, scale: AVATAR_SCALE }));

    // Usta'nın ara sıra konuşması + oyuncuların yazı baloncukları — Banka'daki
    // vezne baloncuklarıyla AYNI mantık (deterministik cyclingLine + jenerik
    // layoutBubbles/drawBubbleBox).
    const bubbleItems = [];
    const ustaLine = cyclingLine(USTA_NPC.lines, { phase: 4 });
    if (ustaLine) {
      const lines = wrapBubbleText(ctx, ustaLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = USTA.cy - SPRITE_H * AVATAR_SCALE - 10;
      bubbleItems.push({ x: USTA.cx, w, h, lines, ts: 1, naturalTop: anchorY - h });
    }
    entities.forEach((e) => {
      const list = e.bubbleList || [];
      if (list.length === 0) return;
      // Yeni istek: aynı karakterin birden fazla (henüz süresi dolmamış)
      // mesajı üst üste yığılır — en yeni mesaj kafaya en yakın.
      let cursorBottom = e.baseY - SPRITE_H * AVATAR_SCALE - 8;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const b = list[i];
        const lines = wrapBubbleText(ctx, b.text);
        const { w, h } = measureBubble(ctx, lines);
        const naturalTop = cursorBottom - h;
        bubbleItems.push({ x: e.x, w, h, lines, ts: b.ts, naturalTop });
        cursorBottom = naturalTop - 6;
      }
    });
    layoutBubbles(bubbleItems).forEach((item) => drawBubbleBox(ctx, item, W));
  }

  function pointerToCanvas(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handleCanvasClick(e) {
    const p = pointerToCanvas(e);

    if (dist(p, USTA) < USTA_R + 30) {
      if (dist(posRef.current, USTA) < INTERACT_RADIUS + USTA_R) {
        setPanel('garage');
      } else {
        pendingActionRef.current = { type: 'usta' };
        targetRef.current = { x: USTA.cx, y: USTA.cy + USTA_R + 46 };
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#1c1d1f', '--ws-panel-bg': '#191a1e', '--ws-accent': ACCENT }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
      {onOpenHeist && (
        <button className="ws-heist-btn" onClick={() => onOpenHeist('modifiye_garaji')}>Soygun</button>
      )}
      <button className="ws-exit-btn" onClick={onExit}>✕</button>

      <div className="ws-canvas-wrap">
        {!ready && <div className="ws-loading">Garaja giriliyor…</div>}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="ws-canvas"
          onPointerDown={handleCanvasClick}
        />
        {ready && (
          <>
            <button className="ws-phone-btn" onClick={() => setPhoneOpen(true)} title="Telefon">📱</button>
            <button className="ws-camera-btn" onClick={() => (user ? openCamera() : setShowGuestPrompt(true))} title="Fotoğraf çek">📷</button>
          </>
        )}
      </div>

      <div className="ws-chat-row">
        <input
          className="ws-chat-input"
          placeholder={user ? 'Bir şey yaz…' : 'Sohbet için giriş yapmalısın'}
          value={chatText}
          maxLength={140}
          disabled={!user}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (user ? sendChat() : setShowGuestPrompt(true))}
        />
        <button className="ws-chat-send" onClick={() => (user ? sendChat() : setShowGuestPrompt(true))}>Gönder</button>
      </div>

      {phoneOpen && <PhoneScreen onClose={() => setPhoneOpen(false)} onEnterTable={() => {}} />}

      {showGuestPrompt && (
        <div className="ws-panel-backdrop" onClick={() => setShowGuestPrompt(false)}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            <SignInPrompt message="Bunun için giriş yapmalısın." />
            <button className="ws-panel-btn" onClick={() => setShowGuestPrompt(false)}>Kapat</button>
          </div>
        </div>
      )}

      {panel === 'garage' && (
        <div className="ws-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            <p className="ws-panel-title">🔧 Modifiye Garajı — Usta</p>
            <GarageScreen />
            <button className="ws-panel-btn" onClick={() => setPanel(null)}>Ustadan Uzaklaş</button>
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
