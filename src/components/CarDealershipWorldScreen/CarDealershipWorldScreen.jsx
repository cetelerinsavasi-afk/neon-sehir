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
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { createSixtagramPost, enterInterior } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';

// --- Araba Galerisi içi --------------------------------------------------
// BankWorldScreen/WeaponShopWorldScreen/TuningGarageWorldScreen ile BİREBİR
// aynı iskelet (sabit mekan, karakter yürüyor, TEK OYUNCULU görsel NPC +
// Firestore üzerinden canlı diğer oyuncular). Fark: burada tek bir
// "galerici" NPC'si var; onunla etkileşime girince zaten var olan
// (VehicleGalleryScreen bileşenindeki) araç satın alma/fiyat listesi paneli
// açılıyor — satın alma MANTIĞI burada TEKRARLANMIYOR, sadece panel içine
// gömülüyor. Bu mekan için soygun hedefi TANIMLI (bkz. HeistPanel.jsx
// 'araba_galerisi'), bu yüzden Banka/ModifiyeGarajı'ndaki gibi onOpenHeist
// prop'u ve ws-heist-btn butonu var.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;

// AVATAR_SCALE — diğer mekanlarla (Banka/Silah Mağazası/Garaj) aynı büyütme.
const AVATAR_SCALE = 1.42;

const WALL_H = 190;

// Lüks galeri paleti — sıcak şampanya altını + soğuk vitrin beyazı, koyu
// zemin üzerinde "Neon Şehir"in karakteristik parlaklığıyla.
const GOLD = '#e8c574';
const GOLD_DIM = 'rgba(232,197,116,0.35)';
const SPOT = 'rgba(255,244,214,0.16)';

// --- Sabit düzen -----------------------------------------------------------
// İki yan sıra sergi arabası + ortada spot ışıklı kürsü üzerinde "vitrin
// arabası" + en altta galericinin resepsiyon kürsüsü.
const CAR_A = { cx: 150, cy: 300 }; // sol üst — spor coupe
const CAR_B = { cx: 530, cy: 300 }; // sağ üst — SUV
const CAR_C = { cx: 150, cy: 500 }; // sol alt — sedan
const CAR_D = { cx: 530, cy: 500 }; // sağ alt — roadster/cabrio
const PEDESTAL = { cx: 340, cy: 690, r: 118 }; // orta kürsü — vitrin arabası (hero)

const DEALER = { cx: 340, cy: 900 };
const DEALER_HW = 168;
const DEALER_HH = 46;
const DEALER_NPC = {
  name: 'Galerici Yusuf',
  lines: [
    'Hoş geldiniz, size özel fiyat listemiz burada.',
    'Bu model sınırlı sayıda üretildi.',
    'Kredi ve takas seçeneklerimiz mevcut.',
    'Vitrindeki o arabaya bayılmayan yok.',
    'Test sürüşü ayarlayabilirim, ilgilenir misiniz?',
  ],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'ince', skin: '#caa07a',
    hairStyle: 'short', hairColor: '#171310', facialHair: 'goatee',
    clothing: 'tuxedo', clothColor: '#14151a', neckAcc: 'bow', pantsColor: '#101114',
    background: 'transparent',
  },
};

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

function rectObstacle(cx, cy, hw, hh) {
  return { cx, cy, hw, hh };
}

const OBSTACLES = [
  rectObstacle(CAR_A.cx, CAR_A.cy, 96, 46),
  rectObstacle(CAR_B.cx, CAR_B.cy, 96, 50),
  rectObstacle(CAR_C.cx, CAR_C.cy, 96, 44),
  rectObstacle(CAR_D.cx, CAR_D.cy, 92, 38),
  { cx: PEDESTAL.cx, cy: PEDESTAL.cy, r: PEDESTAL.r },
  { cx: DEALER.cx, cy: DEALER.cy, hw: DEALER_HW, hh: DEALER_HH },
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

// drawFloor — parlak/yansımalı vitrin zemini: koyu, cilalı karo + hafif
// dikey "parlaklık" degrade şeridi (yansıma hissi).
function drawFloor(c) {
  c.fillStyle = '#0e0e13';
  c.fillRect(0, 0, W, H);
  const tile = 60;
  for (let y = WALL_H; y < H; y += tile) {
    for (let x = 0; x < W; x += tile) {
      const alt = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
      c.fillStyle = alt ? '#15151c' : '#111116';
      c.fillRect(x, y, tile, tile);
    }
  }
  // Cila/yansıma — hafif dikey parlaklık bantları.
  c.save();
  c.globalAlpha = 0.05;
  for (let x = 20; x < W; x += 140) {
    const grd = c.createLinearGradient(x, WALL_H, x, H);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd;
    c.fillRect(x, WALL_H, 46, H - WALL_H);
  }
  c.restore();
  // İnce altın çizgi kılavuzu (galeri koridoru).
  c.strokeStyle = GOLD_DIM;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(W / 2, WALL_H); c.lineTo(W / 2, H);
  c.stroke();
}

function drawSpotlight(c, cx, cy, r) {
  c.save();
  const grd = c.createRadialGradient(cx, cy, 4, cx, cy, r);
  grd.addColorStop(0, SPOT);
  grd.addColorStop(1, 'rgba(255,244,214,0)');
  c.fillStyle = grd;
  c.beginPath(); c.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawWalls(c) {
  const grd = c.createLinearGradient(0, 0, 0, WALL_H);
  grd.addColorStop(0, '#171319');
  grd.addColorStop(1, '#1e1a22');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H - 10);
  c.fillStyle = '#0a0810';
  c.fillRect(0, WALL_H - 10, W, 10);
  c.strokeStyle = GOLD_DIM;
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, WALL_H - 10); c.lineTo(W, WALL_H - 10); c.stroke();

  c.save();
  c.shadowColor = GOLD;
  c.shadowBlur = 18;
  c.fillStyle = GOLD;
  c.textAlign = 'center';
  c.font = 'bold 25px sans-serif';
  c.fillText('LÜKS OTO GALERİSİ', W / 2, 46);
  c.shadowBlur = 0;
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(232,197,116,0.7)';
  c.fillText('Hayalinizdeki araba bir adım ötede.', W / 2, 70);
  c.restore();

  // Dev cam vitrin çerçevesi — büyük pencereler hissi.
  c.strokeStyle = GOLD_DIM;
  c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const x = 30 + i * ((W - 60) / 3);
    roundRectC(c, x, 90, (W - 60) / 3 - 14, 76, 6);
    c.stroke();
  }
}

// --- Araba siluetleri --------------------------------------------------
// Farklı gövde tipleri (coupe/SUV/sedan/roadster/hero) görsel olarak
// birbirinden ayırt edilsin diye ayrı fonksiyonlarda — sadece
// dekoratif/sergi amaçlı, mekanik/fiyat verisiyle bağlantısız (gerçek
// katalog VehicleGalleryScreen panelinde).
function drawWheel(c, x, y, r) {
  c.fillStyle = '#0a0a0c';
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(232,197,116,0.55)'; c.lineWidth = 1.4;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#3a3a3f';
  c.beginPath(); c.arc(x, y, r * 0.42, 0, Math.PI * 2); c.fill();
}

function drawGroundShadow(c, cx, cy, w, h) {
  c.fillStyle = 'rgba(0,0,0,0.32)';
  c.beginPath(); c.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2); c.fill();
}

// Spor Coupe — alçak, kısa, keskin çatı hattı.
function drawCoupe(c, cx, cy, color) {
  c.save();
  c.translate(cx, cy);
  drawGroundShadow(c, 0, 30, 92, 14);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-88, 14);
  c.lineTo(-70, -4);
  c.lineTo(-26, -30);
  c.lineTo(22, -30);
  c.lineTo(60, -6);
  c.lineTo(88, 14);
  c.lineTo(88, 26);
  c.lineTo(-88, 26);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = 'rgba(170,215,235,0.5)';
  c.beginPath();
  c.moveTo(-20, -27); c.lineTo(18, -27); c.lineTo(30, -8); c.lineTo(-30, -8);
  c.closePath(); c.fill();
  drawWheel(c, -52, 26, 15);
  drawWheel(c, 52, 26, 15);
  c.fillStyle = '#fff6d8';
  c.beginPath(); c.ellipse(84, 8, 5, 8, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

// SUV — yüksek, kutu gövdeli.
function drawSUV(c, cx, cy, color) {
  c.save();
  c.translate(cx, cy);
  drawGroundShadow(c, 0, 36, 96, 15);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-94, 20);
  c.lineTo(-84, -34);
  c.lineTo(80, -34);
  c.lineTo(94, 20);
  c.lineTo(94, 32);
  c.lineTo(-94, 32);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = 'rgba(170,215,235,0.5)';
  roundRectC(c, -76, -30, 148, 24, 4); c.fill();
  c.strokeStyle = 'rgba(20,20,25,0.5)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-2, -30); c.lineTo(-2, -6); c.stroke();
  drawWheel(c, -58, 32, 17);
  drawWheel(c, 58, 32, 17);
  c.fillStyle = '#fff6d8';
  c.beginPath(); c.ellipse(90, 6, 5, 9, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

// Sedan — uzun, alçak-orta yükseklik, belirgin bagaj.
function drawSedan(c, cx, cy, color) {
  c.save();
  c.translate(cx, cy);
  drawGroundShadow(c, 0, 28, 100, 13);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-98, 12);
  c.lineTo(-80, -2);
  c.lineTo(-46, -24);
  c.lineTo(20, -24);
  c.lineTo(46, -6);
  c.lineTo(80, -2);
  c.lineTo(98, 12);
  c.lineTo(98, 24);
  c.lineTo(-98, 24);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = 'rgba(170,215,235,0.5)';
  c.beginPath();
  c.moveTo(-42, -21); c.lineTo(16, -21); c.lineTo(38, -5); c.lineTo(-38, -5);
  c.closePath(); c.fill();
  drawWheel(c, -58, 24, 14);
  drawWheel(c, 58, 24, 14);
  c.fillStyle = '#fff6d8';
  c.beginPath(); c.ellipse(94, 6, 4, 7, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

// Roadster/Cabrio — çok alçak, üstü açık, küçük.
function drawRoadster(c, cx, cy, color) {
  c.save();
  c.translate(cx, cy);
  drawGroundShadow(c, 0, 22, 78, 11);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-76, 8);
  c.lineTo(-60, -10);
  c.lineTo(-20, -18);
  c.lineTo(18, -18);
  c.lineTo(48, -4);
  c.lineTo(76, 8);
  c.lineTo(76, 18);
  c.lineTo(-76, 18);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = '#221c1a';
  roundRectC(c, -18, -18, 30, 12, 3); c.fill();
  drawWheel(c, -44, 18, 12);
  drawWheel(c, 44, 18, 12);
  c.fillStyle = '#fff6d8';
  c.beginPath(); c.ellipse(72, 4, 4, 6, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

// Hero/vitrin arabası — kürsü üzerinde, geniş, spoiler + alt neon aydınlatma.
function drawHeroCar(c, cx, cy, color) {
  c.save();
  c.translate(cx, cy);
  drawGroundShadow(c, 0, 40, 118, 16);
  // Alt neon parlaklık.
  c.save();
  c.shadowColor = color;
  c.shadowBlur = 22;
  c.fillStyle = color;
  c.fillRect(-100, 34, 200, 4);
  c.restore();

  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-112, 22);
  c.lineTo(-92, 2);
  c.lineTo(-34, -26);
  c.lineTo(30, -26);
  c.lineTo(78, -4);
  c.lineTo(112, 22);
  c.lineTo(112, 34);
  c.lineTo(-112, 34);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5; c.stroke();

  c.fillStyle = 'rgba(180,225,245,0.55)';
  c.beginPath();
  c.moveTo(-28, -23); c.lineTo(24, -23); c.lineTo(42, -3); c.lineTo(-42, -3);
  c.closePath(); c.fill();

  // Spoiler.
  c.fillStyle = '#141417';
  c.fillRect(70, -30, 30, 6);
  c.fillRect(88, -30, 6, 20);

  drawWheel(c, -66, 34, 18);
  drawWheel(c, 66, 34, 18);
  c.fillStyle = '#fff6d8';
  c.beginPath(); c.ellipse(108, 12, 6, 10, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawPedestal(c) {
  const p = PEDESTAL;
  drawSpotlight(c, p.cx, p.cy - 40, p.r + 40);
  c.save();
  c.fillStyle = '#1a1620';
  c.beginPath(); c.ellipse(p.cx, p.cy + 46, p.r - 6, 26, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = GOLD; c.lineWidth = 2.4;
  c.beginPath(); c.ellipse(p.cx, p.cy + 46, p.r - 6, 26, 0, 0, Math.PI * 2); c.stroke();
  c.restore();

  // Kadife kordon — kürsünün etrafında, sadece dekoratif.
  const poleR = p.r + 20;
  const poleCount = 8;
  const poles = [];
  for (let i = 0; i < poleCount; i++) {
    const a = (i / poleCount) * Math.PI * 2;
    poles.push({ x: p.cx + Math.cos(a) * poleR, y: p.cy + Math.sin(a) * poleR * 0.5 + 30 });
  }
  c.save();
  c.strokeStyle = 'rgba(180,20,50,0.85)';
  c.lineWidth = 3;
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i];
    const b = poles[(i + 1) % poles.length];
    const midY = Math.max(a.y, b.y) + 6;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.quadraticCurveTo((a.x + b.x) / 2, midY, b.x, b.y);
    c.stroke();
  }
  c.fillStyle = GOLD;
  poles.forEach((pt) => {
    c.beginPath(); c.arc(pt.x, pt.y - 4, 3.4, 0, Math.PI * 2); c.fill();
  });
  c.restore();

  drawHeroCar(c, p.cx, p.cy - 4, '#141417');

  c.fillStyle = GOLD;
  c.font = 'bold 12px sans-serif';
  c.textAlign = 'center';
  c.fillText('AYIN VİTRİN ARABASI', p.cx, p.cy + 88);
}

function drawDealerDesk(c, npc, getAvatarImage) {
  c.save();
  c.translate(DEALER.cx, DEALER.cy);
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath(); c.ellipse(0, DEALER_HH + 8, DEALER_HW + 6, 12, 0, 0, Math.PI * 2); c.fill();

  const grd = c.createLinearGradient(0, -DEALER_HH, 0, DEALER_HH);
  grd.addColorStop(0, '#241f1a'); grd.addColorStop(1, '#171310');
  c.fillStyle = grd;
  roundRectC(c, -DEALER_HW, -DEALER_HH, DEALER_HW * 2, DEALER_HH * 2, 8); c.fill();
  c.strokeStyle = GOLD; c.lineWidth = 2.4;
  roundRectC(c, -DEALER_HW, -DEALER_HH, DEALER_HW * 2, DEALER_HH * 2, 8); c.stroke();

  // Kürsü üstü cam/parlak vurgu.
  c.fillStyle = 'rgba(232,197,116,0.1)';
  roundRectC(c, -DEALER_HW + 10, -DEALER_HH + 8, DEALER_HW * 2 - 20, 12, 3); c.fill();

  // Tabela.
  c.fillStyle = '#0f0d0a';
  roundRectC(c, -78, -DEALER_HH - 52, 156, 20, 3); c.fill();
  c.fillStyle = GOLD;
  c.font = 'bold 12px sans-serif';
  c.textAlign = 'center';
  c.fillText('GÜNCEL FİYAT LİSTESİ', 0, -DEALER_HH - 38);
  c.restore();

  drawAvatarSprite(c, {
    x: DEALER.cx, baseY: DEALER.cy - DEALER_HH - 30, avatar: npc.avatar, pose: 'idle', facing: 'down', name: npc.name,
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#141218';
  c.fillRect(-56, -6, 112, 46);
  c.fillStyle = 'rgba(180,215,235,0.28)';
  c.fillRect(-48, -2, 44, 37);
  c.fillRect(4, -2, 44, 37);
  c.strokeStyle = GOLD; c.lineWidth = 2;
  c.strokeRect(-56, -6, 112, 46);
  c.restore();
}

// drawDealershipSceneBackground — canlı ekranın (renderFrame) statik
// kısmıyla AYNI çizim dizisi (NPC dahil), dışa açık — hem burada hem de
// kamera fotoğrafında (openCamera/renderCameraPreview) VE Sixtagram
// akışında (PostAttachment.jsx) kullanılabilir (bkz. diğer WorldScreen'lerdeki
// drawXSceneBackground ile aynı desen).
export function drawDealershipSceneBackground(ctx, getAvatarImage) {
  drawFloor(ctx);
  drawDoor(ctx);
  drawSpotlight(ctx, CAR_A.cx, CAR_A.cy - 10, 100);
  drawSpotlight(ctx, CAR_B.cx, CAR_B.cy - 10, 104);
  drawSpotlight(ctx, CAR_C.cx, CAR_C.cy - 10, 100);
  drawSpotlight(ctx, CAR_D.cx, CAR_D.cy - 10, 92);
  drawCoupe(ctx, CAR_A.cx, CAR_A.cy, '#7a1030');
  drawSUV(ctx, CAR_B.cx, CAR_B.cy, '#eef1f4');
  drawSedan(ctx, CAR_C.cx, CAR_C.cy, '#16294f');
  drawRoadster(ctx, CAR_D.cx, CAR_D.cy, '#caa227');
  drawPedestal(ctx);
  drawDealerDesk(ctx, DEALER_NPC, getAvatarImage);
  drawWalls(ctx);
}

export default function CarDealershipWorldScreen({ onExit, onOpenHeist }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { others, updatePresence, clearPresence } = useInteriorPresence('araba_galerisi');

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'gallery' | null
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [myBubble, setMyBubble] = useState(null);
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
  // --- Canlı/çok oyunculu — diğer WorldScreen'ler ile BİREBİR aynı desen,
  // bkz. hooks/useInteriorPresence.js.
  const myBubbleRef = useRef(null);
  const othersRef = useRef([]);
  const lastSyncRef = useRef(0);
  const lastSyncedPosRef = useRef({ ...START_POS });
  const wasMovingRef = useRef(false);
  const pausedRef = useRef(false);
  const MOVE_SYNC_INTERVAL_MS = 300;
  const MOVE_SYNC_MIN_DIST = 6;
  const IDLE_HEARTBEAT_MS = 12_000;
  const CHAT_BUBBLE_MS = 9500;

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { myBubbleRef.current = myBubble; }, [myBubble]);
  useEffect(() => { othersRef.current = others; }, [others]);

  useEffect(() => {
    if (!myBubble) return undefined;
    const id = setTimeout(() => setMyBubble(null), CHAT_BUBBLE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBubble]);

  function getAvatarImage(avatar, pose) {
    return getAvatarImageRef.current(avatar, pose);
  }

  // Galeriye giriş/çıkış — diğer WorldScreen'ler ile BİREBİR aynı desen
  // (bkz. functions/index.js enterInterior), sadece locationId farklı.
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
    enterInterior('araba_galerisi')
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || START_POS;
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Araba galerisine giriş hatası:', err);
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

  // --- Ana döngü: hareket + çizim + Firestore senkronu -------------------
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
          if (action?.type === 'dealer') {
            setPanel('gallery');
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

      // --- Firestore senkronu — diğer WorldScreen'lerle BİREBİR aynı: sadece
      // anlamlı değişimde / seyrek nabız, ekonomiye dokunmayan alanlar.
      if (!pausedRef.current && user) {
        const p = posRef.current;
        const movedDist = dist(p, lastSyncedPosRef.current);
        const sinceLast = t - lastSyncRef.current;
        if (moving) {
          if (sinceLast > MOVE_SYNC_INTERVAL_MS && movedDist > MOVE_SYNC_MIN_DIST) {
            lastSyncRef.current = t; lastSyncedPosRef.current = { ...p };
            updatePresence(user.uid, {
              x: p.x, y: p.y, facing: facingRef.current, pose: poseRef.current, seat: null,
            });
          }
        } else if (wasMovingRef.current) {
          lastSyncRef.current = t; lastSyncedPosRef.current = { ...p };
          updatePresence(user.uid, {
            x: p.x, y: p.y, facing: facingRef.current, pose: 'idle', seat: null,
          });
        } else if (sinceLast > IDLE_HEARTBEAT_MS) {
          lastSyncRef.current = t;
          updatePresence(user.uid, {
            x: p.x, y: p.y, facing: facingRef.current, pose: 'idle', seat: null,
          });
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
    setMyBubble({ text, ts });
    updatePresence(user.uid, {
      x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
      pose: 'idle', seat: null, chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  // --- Kamera — diğer WorldScreen'lerle BİREBİR aynı desen; arka plan yine
  // gerçek (drawDealershipSceneBackground). Sunucuya sadece mekan + kendi
  // pozun bildirilir (bkz. functions/index.js buildSixtagramAttachment
  // 'interiorPhoto').
  function buildCameraEntities() {
    const p = posRef.current;
    const self = {
      dx: 0, dy: 0,
      avatar: playerRef.current?.avatar,
      pose: poseRef.current || 'idle',
      facing: facingRef.current,
      isSelf: true,
      scale: AVATAR_SCALE,
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
      drawBackground: (bgCtx) => drawDealershipSceneBackground(bgCtx, getAvatarImage),
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
        type: 'interiorPhoto', locationId: 'araba_galerisi',
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

  function renderFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    drawDealershipSceneBackground(ctx, getAvatarImage);

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(232,197,116,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetRef.current.x, targetRef.current.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    const now = Date.now();
    const myBubbleNow = myBubbleRef.current && now - myBubbleRef.current.ts < CHAT_BUBBLE_MS ? myBubbleRef.current : null;

    const rawEntities = [
      ...othersRef.current.map((o) => ({
        x: o.x, y: o.y, avatar: o.avatar, pose: o.pose || 'idle',
        facing: o.facing || 'down', name: o.displayName || 'Oyuncu',
        bubbleData: o.chatText && o.chatTs && now - o.chatTs < CHAT_BUBBLE_MS ? { text: o.chatText, ts: o.chatTs } : null,
        isSelf: false,
      })),
      {
        x: posRef.current.x, y: posRef.current.y, avatar: playerRef.current?.avatar,
        pose: poseRef.current, facing: facingRef.current,
        name: playerRef.current?.displayName || 'Sen', bubbleData: myBubbleNow, isSelf: true,
      },
    ];
    const entities = rawEntities
      .map((e) => ({ ...e, baseY: e.y }))
      .sort((a, b) => a.y - b.y);
    entities.forEach((e) => drawAvatarSprite(ctx, e, getAvatarImage, { showName: !e.isSelf, scale: AVATAR_SCALE }));

    // NPC konuşma baloncuğu — tek galerici, diğer WorldScreen'lerdeki
    // vezne/satıcı baloncuklarıyla aynı döngüsel/deterministik satır seçimi
    // (bkz. cyclingLine).
    const bubbleItems = [];
    const line = cyclingLine(DEALER_NPC.lines, { phase: 2 });
    if (line) {
      const lines = wrapBubbleText(ctx, line);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = DEALER.cy - DEALER_HH - 30 - SPRITE_H * AVATAR_SCALE - 10;
      bubbleItems.push({ x: DEALER.cx, w, h, lines, ts: 0, naturalTop: anchorY - h });
    }
    entities.forEach((e, i) => {
      if (!e.bubbleData) return;
      const lines = wrapBubbleText(ctx, e.bubbleData.text);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = e.baseY - SPRITE_H * AVATAR_SCALE - 8;
      bubbleItems.push({ x: e.x, w, h, lines, ts: 100 + i, naturalTop: anchorY - h });
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

    if (dist(p, DEALER) < DEALER_HW + 30) {
      if (dist(posRef.current, DEALER) < INTERACT_RADIUS + DEALER_HH) {
        setPanel('gallery');
      } else {
        pendingActionRef.current = { type: 'dealer' };
        targetRef.current = { x: DEALER.cx, y: DEALER.cy + DEALER_HH + 46 };
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#0e0e13', '--ws-panel-bg': '#1c1a22', '--ws-accent': GOLD }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
      {onOpenHeist && (
        <button className="ws-heist-btn" onClick={() => onOpenHeist('araba_galerisi')}>Soygun</button>
      )}
      <button className="ws-exit-btn" onClick={onExit}>✕</button>

      <div className="ws-canvas-wrap">
        {!ready && <div className="ws-loading">Galeriye giriliyor…</div>}
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

      {panel === 'gallery' && (
        <div className="ws-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            <p className="ws-panel-title">🚗 Araba Galerisi — Güncel Fiyat Listesi</p>
            <VehicleGalleryScreen />
            <button className="ws-panel-btn" onClick={() => setPanel(null)}>Galericiden Uzaklaş</button>
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
