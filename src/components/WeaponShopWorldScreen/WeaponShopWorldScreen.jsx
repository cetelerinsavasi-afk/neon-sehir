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
import WeaponShopScreen from '../WeaponShopScreen/WeaponShopScreen';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { createSixtagramPost, enterInterior } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';
import './WeaponShopWorldScreen.css';

// --- Silah Mağazası içi ------------------------------------------------
// BankWorldScreen.jsx'teki "sabit mekan, karakter yürüyor" kalıbının
// BİREBİR aynısı — sadece burada tek bir tezgah/satıcı var (vezne/sıra
// numarası/oturma yok), ve heist bağlantısı YOK (bu mekan için soygun
// hedefi tanımlı değil). Tüm plumbing (hareket/çarpışma, kamera+Sixtagram
// paylaşımı, sohbet baloncukları, canlı varlık/presence) BankWorldScreen
// ile aynı desende, bkz. oradaki yorumlar.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;

// AVATAR_SCALE — diğer mekanlarla (Banka/Gazino) aynı büyütme.
const AVATAR_SCALE = 1.42;

const WALL_H = 195;

// RACK — duvara monte edilmiş, tamamen duvar bandının İÇİNDE kalan sergi
// silahlığı (Banka'daki numara panosuyla aynı mantık: dekoratif, engel
// DEĞİL, oyuncu asla oraya yürüyemez zira duvar bandının içinde).
const RACK = { x1: 50, y1: 56, x2: 630, y2: 176 };

// SELLER — tek silah satıcısı, tezgahın arkasında duruyor.
const SELLER = { cx: 340, cy: 430 };
const SELLER_HW = 168;
const SELLER_HH = 46;
// SELLER_BASE_Y — satıcının ayak/anchor Y'si; eskiden "SELLER.cy -
// SELLER_HH - 30" idi ama bu, ayakların tam tezgah üstündeki "SİLAH
// TEZGAHI" tabelasının hemen dibine denk gelmesine sebep oluyordu (yeni
// istek, madde 18: "npclerin ayakları masanın üstündeki yazıya denk
// geliyor"). "-30" yerine "-42" kullanılarak satıcı bir tık yukarı, tabeladan
// uzağa alındı — bkz. drawSellerCounter ve renderFrame'deki konuşma
// baloncuğu, ikisi de bu sabiti kullanıyor ki senkron kalsın.
const SELLER_BASE_Y = SELLER.cy - SELLER_HH - 42;
const SELLER_NPC = {
  name: 'Silahçı Kemal',
  lines: [
    'Hoş geldiniz, ne arıyorsunuz?',
    'Bu modelin talebi çok fazla.',
    'Ruhsat işlemlerine yardımcı olurum.',
    'Kaliteli, güvenilir, dayanıklı.',
    'Vitrindekilere göz atabilirsiniz.',
  ],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#c68863',
    hairStyle: 'short', hairColor: '#0d0a08', facialHair: 'mustache',
    clothing: 'vest', clothColor: '#241d14', neckAcc: 'bow', pantsColor: '#141210',
    background: 'transparent',
  },
};

// DISPLAY_CASES — vitrinler, sadece dekoratif/engel (tıklanabilir değil,
// istekte sadece satıcıyla etkileşim isteniyor).
const DISPLAY_CASES = [
  { cx: 168, cy: 610, hw: 96, hh: 46, weapons: ['tekli', 'deagle'], label: 'TABANCA VİTRİNİ' },
  { cx: 512, cy: 610, hw: 96, hh: 46, weapons: ['uzi'], label: 'UZI VİTRİNİ' },
];

// AMMO_SHELVES — mermi/aksesuar rafları, dekoratif engel.
const AMMO_SHELVES = [
  { cx: 128, cy: 850, hw: 82, hh: 42 },
  { cx: 552, cy: 850, hw: 82, hh: 42 },
];

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

const OBSTACLES = [
  { cx: SELLER.cx, cy: SELLER.cy, hw: SELLER_HW, hh: SELLER_HH },
  ...DISPLAY_CASES.map((d) => ({ cx: d.cx, cy: d.cy, hw: d.hw, hh: d.hh })),
  ...AMMO_SHELVES.map((s) => ({ cx: s.cx, cy: s.cy, hw: s.hw, hh: s.hh })),
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

function drawFloor(c) {
  c.fillStyle = '#131316';
  c.fillRect(0, 0, W, H);
  for (let y = 24; y < H - 24; y += 48) {
    for (let x = 24; x < W - 24; x += 48) {
      c.fillStyle = ((Math.floor(x / 48) + Math.floor(y / 48)) % 2 === 0) ? '#17171c' : '#131316';
      c.fillRect(x, y, 48, 48);
    }
  }
  // Hafif neon-kızıl baklava deseni (Gazino'daki cross-hatch ile aynı dil,
  // burada "Neon Şehir" temasına uygun kızıl/amber tonda).
  c.strokeStyle = 'rgba(255,70,70,0.06)';
  c.lineWidth = 1;
  for (let y = 24; y < H - 24; y += 48) {
    for (let x = 24; x < W - 24; x += 48) {
      c.beginPath();
      c.moveTo(x + 24, y); c.lineTo(x + 48, y + 24); c.lineTo(x + 24, y + 48); c.lineTo(x, y + 24);
      c.closePath(); c.stroke();
    }
  }
}

// --- Silah siluetleri (kullanıcının verdiği örnekten uyarlandı) ----------
// Sadece görsel/dekoratif siluetler — mekanik/işlevsel hiçbir detay
// taşımıyorlar, katalog/fiyat verisiyle bağlantısızlar (bkz. görev notu).
function drawTekli(g, x, y, scale) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = '#2b2b2e';
  roundRectC(g, -6, -30, 12, 34, 3); g.fill();
  g.fillStyle = '#1c1c1e';
  roundRectC(g, -5, -30, 10, 14, 2); g.fill();
  g.fillStyle = '#4a3324';
  g.beginPath();
  g.moveTo(-6, 2); g.lineTo(6, 2); g.lineTo(8, 26); g.lineTo(-3, 30); g.lineTo(-7, 24);
  g.closePath(); g.fill();
  g.fillStyle = '#3a3a3d';
  roundRectC(g, -9, -2, 4, 8, 2); g.fill();
  g.fillStyle = '#c9a24a';
  roundRectC(g, -4, -31, 8, 3, 1); g.fill();
  g.restore();
}

function drawDeagle(g, x, y, scale) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = '#3a3a3d';
  roundRectC(g, -9, -36, 18, 16, 2); g.fill();
  g.fillStyle = '#2b2b2e';
  roundRectC(g, -8, -20, 16, 12, 2); g.fill();
  g.fillStyle = '#4a3324';
  g.beginPath();
  g.moveTo(-7, -8); g.lineTo(8, -8); g.lineTo(11, 22); g.lineTo(-4, 28); g.lineTo(-9, 18);
  g.closePath(); g.fill();
  g.fillStyle = '#1c1c1e';
  roundRectC(g, -10, -8, 6, 10, 2); g.fill();
  g.fillStyle = '#c9a24a';
  roundRectC(g, -5, -38, 10, 3, 1); g.fill();
  g.strokeStyle = '#c9a24a'; g.lineWidth = 1;
  g.strokeRect(-9, -36, 18, 16);
  g.restore();
}

function drawUzi(g, x, y, scale) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = '#2b2b2e';
  roundRectC(g, -42, -8, 80, 16, 3); g.fill();
  g.fillStyle = '#1c1c1e';
  roundRectC(g, 32, -6, 16, 12, 2); g.fill();
  g.fillStyle = '#3a3a3d';
  g.beginPath();
  g.moveTo(-6, 6); g.lineTo(8, 6); g.lineTo(10, 32); g.lineTo(-4, 36); g.lineTo(-8, 26);
  g.closePath(); g.fill();
  g.fillStyle = '#1c1c1e';
  roundRectC(g, -2, 4, 10, 26, 2); g.fill();
  g.strokeStyle = '#3a3a3d'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-42, 0); g.lineTo(-58, 0); g.lineTo(-58, -14); g.stroke();
  g.fillStyle = '#c9a24a';
  roundRectC(g, -40, -10, 10, 3, 1); g.fill();
  g.restore();
}

function drawAkm(g, x, y, scale) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = '#5a4020';
  roundRectC(g, -110, -6, 64, 12, 3); g.fill();
  g.fillStyle = '#2b2b2e';
  roundRectC(g, -48, -9, 96, 14, 3); g.fill();
  g.fillStyle = '#1c1c1e';
  roundRectC(g, 44, -7, 26, 10, 2); g.fill();
  g.fillStyle = '#3a3a3d';
  g.beginPath();
  g.moveTo(-6, 5); g.lineTo(14, 26); g.lineTo(30, 30); g.lineTo(28, 10); g.lineTo(10, 5);
  g.closePath(); g.fill();
  g.fillStyle = '#5a4020';
  g.beginPath();
  g.moveTo(-8, 5); g.lineTo(8, 5); g.lineTo(10, 22); g.lineTo(-4, 26); g.lineTo(-10, 18);
  g.closePath(); g.fill();
  g.fillStyle = '#1c1c1e';
  roundRectC(g, -32, -16, 10, 9, 2); g.fill();
  g.fillStyle = '#c9a24a';
  roundRectC(g, 40, -9, 6, 3, 1); g.fill();
  g.restore();
}

function drawPompali(g, x, y, scale) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = '#5a4020';
  roundRectC(g, -118, -5, 50, 10, 3); g.fill();
  g.fillStyle = '#3a3a3d';
  roundRectC(g, -70, -7, 150, 14, 3); g.fill();
  g.fillStyle = '#1c1c1e';
  roundRectC(g, -70, 4, 44, 10, 3); g.fill();
  g.fillStyle = '#5a4020';
  g.beginPath();
  g.moveTo(60, 5); g.lineTo(76, 5); g.lineTo(80, 28); g.lineTo(64, 32); g.lineTo(58, 20);
  g.closePath(); g.fill();
  g.fillStyle = '#c9a24a';
  roundRectC(g, -116, -6, 4, 3, 1); g.fill();
  g.restore();
}

const WEAPON_DRAWERS = { tekli: drawTekli, deagle: drawDeagle, uzi: drawUzi, akm: drawAkm, pompali: drawPompali };

// drawWalls — üst duvar bandı: başlık + tamamen bandın İÇİNDE kalan
// (Banka'daki numara panosuyla aynı mantık) sergi silahlığı; AKM/pompalı/
// uzi asılı duruyor. Neon kırmızı parlama (shadowBlur) "Neon Şehir"
// temasına uygun küçük bir dokunuş.
function drawWalls(c) {
  const grd = c.createLinearGradient(0, 0, 0, WALL_H);
  grd.addColorStop(0, '#1c1418'); grd.addColorStop(1, '#241a1e');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H);
  c.fillStyle = '#0d0a0c';
  c.fillRect(0, WALL_H - 8, W, 8);

  c.save();
  c.shadowColor = 'rgba(255,60,60,0.85)';
  c.shadowBlur = 14;
  c.fillStyle = '#ff5252';
  c.font = 'bold 22px sans-serif';
  c.textAlign = 'center';
  c.fillText('SİLAH DEPOSU', W / 2, 34);
  c.restore();

  const r = RACK;
  c.fillStyle = '#0e0b0d';
  roundRectC(c, r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1, 8); c.fill();
  c.strokeStyle = '#c9a24a'; c.lineWidth = 2.4;
  roundRectC(c, r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1, 8); c.stroke();
  c.strokeStyle = 'rgba(201,162,74,0.28)'; c.lineWidth = 1;
  roundRectC(c, r.x1 + 8, r.y1 + 8, r.x2 - r.x1 - 16, r.y2 - r.y1 - 16, 4); c.stroke();

  const items = ['akm', 'pompali', 'uzi'];
  const spacing = (r.x2 - r.x1 - 100) / (items.length - 1);
  const gy = r.y1 + (r.y2 - r.y1) / 2 + 8;
  items.forEach((w, i) => {
    const gx = r.x1 + 55 + i * spacing;
    c.save();
    c.strokeStyle = '#c9a24a'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(gx - 26, gy - 16); c.lineTo(gx - 26, gy + 16); c.stroke();
    c.beginPath(); c.moveTo(gx + 32, gy - 16); c.lineTo(gx + 32, gy + 16); c.stroke();
    c.restore();
    WEAPON_DRAWERS[w](c, gx - 3, gy, 0.72);
  });

  c.font = 'bold 11px sans-serif';
  c.fillStyle = '#e8c574';
  c.textAlign = 'center';
  c.fillText('SERGİ DUVARI', (r.x1 + r.x2) / 2, r.y2 - 8);
}

function drawSellerCounter(c, npc, getAvatarImage) {
  c.save();
  c.translate(SELLER.cx, SELLER.cy);
  c.fillStyle = 'rgba(0,0,0,0.24)';
  c.beginPath(); c.ellipse(0, SELLER_HH + 8, SELLER_HW + 6, 12, 0, 0, Math.PI * 2); c.fill();

  const grd = c.createLinearGradient(0, -SELLER_HH, 0, SELLER_HH);
  grd.addColorStop(0, '#3a2c1e'); grd.addColorStop(1, '#241a10');
  c.fillStyle = grd;
  roundRectC(c, -SELLER_HW, -SELLER_HH, SELLER_HW * 2, SELLER_HH * 2, 7); c.fill();
  c.strokeStyle = '#c9a24a'; c.lineWidth = 2.4;
  roundRectC(c, -SELLER_HW, -SELLER_HH, SELLER_HW * 2, SELLER_HH * 2, 7); c.stroke();

  // Tezgah üstü camlı sergi bölmesi — tekli + deagle küçük siluetler.
  c.fillStyle = 'rgba(150,190,210,0.14)';
  roundRectC(c, -SELLER_HW + 10, -SELLER_HH - 34, SELLER_HW * 2 - 20, 34, 4); c.fill();
  c.strokeStyle = 'rgba(201,162,74,0.5)'; c.lineWidth = 1;
  roundRectC(c, -SELLER_HW + 10, -SELLER_HH - 34, SELLER_HW * 2 - 20, 34, 4); c.stroke();
  drawTekli(c, -30, -SELLER_HH - 14, 0.42);
  drawDeagle(c, 30, -SELLER_HH - 14, 0.42);

  // Tabela.
  c.fillStyle = '#12100c';
  roundRectC(c, -66, -SELLER_HH - 52, 132, 18, 3); c.fill();
  c.fillStyle = '#e8c574';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('SİLAH TEZGAHI', 0, -SELLER_HH - 39);
  c.restore();

  // Satıcı NPC — tezgahın arkasında ayakta.
  drawAvatarSprite(c, {
    x: SELLER.cx, baseY: SELLER_BASE_Y, avatar: npc.avatar, pose: 'idle', facing: 'down', name: npc.name,
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });

  c.fillStyle = 'rgba(240,220,200,0.85)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText(npc.name, SELLER.cx, SELLER.cy - SELLER_HH - 64 - SPRITE_H * AVATAR_SCALE + SPRITE_H * AVATAR_SCALE);
}

function drawDisplayCase(c, box) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(box.cx - box.hw - 3, box.cy + box.hh - 2, box.hw * 2 + 6, 8);

  c.fillStyle = '#1c150e';
  roundRectC(c, box.cx - box.hw, box.cy - box.hh, box.hw * 2, box.hh * 2, 6); c.fill();
  c.strokeStyle = '#c9a24a'; c.lineWidth = 2.2;
  roundRectC(c, box.cx - box.hw, box.cy - box.hh, box.hw * 2, box.hh * 2, 6); c.stroke();

  c.fillStyle = 'rgba(150,190,210,0.14)';
  roundRectC(c, box.cx - box.hw + 6, box.cy - box.hh + 6, box.hw * 2 - 12, box.hh * 1.1, 3); c.fill();
  c.fillStyle = '#4a1418';
  roundRectC(c, box.cx - box.hw + 10, box.cy - box.hh + 10, box.hw * 2 - 20, box.hh * 0.95, 3); c.fill();

  const weapons = box.weapons || [];
  const spacing = (box.hw * 2 - 50) / Math.max(1, weapons.length - 1 || 1);
  weapons.forEach((w, i) => {
    const wx = weapons.length > 1 ? box.cx - box.hw + 30 + i * spacing : box.cx - 5;
    WEAPON_DRAWERS[w](c, wx, box.cy - box.hh * 0.15, 0.6);
  });

  c.font = 'bold 10px sans-serif';
  c.fillStyle = '#e8c574';
  c.textAlign = 'center';
  c.fillText(box.label, box.cx, box.cy + box.hh + 16);
  c.restore();
}

function drawAmmoShelf(c, shelf) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(shelf.cx - shelf.hw - 3, shelf.cy + shelf.hh - 2, shelf.hw * 2 + 6, 8);
  c.fillStyle = '#100d0a';
  roundRectC(c, shelf.cx - shelf.hw, shelf.cy - shelf.hh, shelf.hw * 2, shelf.hh * 2, 6); c.fill();
  c.strokeStyle = '#c9a24a'; c.lineWidth = 2.2;
  roundRectC(c, shelf.cx - shelf.hw, shelf.cy - shelf.hh, shelf.hw * 2, shelf.hh * 2, 6); c.stroke();

  const colors = ['#4a3324', '#3a3a3d', '#5a4020', '#4a3324'];
  const boxW = 28;
  const gap = 8;
  const total = colors.length * boxW + (colors.length - 1) * gap;
  let bx = shelf.cx - total / 2;
  colors.forEach((col) => {
    c.fillStyle = col;
    roundRectC(c, bx, shelf.cy - shelf.hh + 10, boxW, shelf.hh * 1.05, 3); c.fill();
    c.strokeStyle = 'rgba(201,162,74,0.4)'; c.lineWidth = 1;
    roundRectC(c, bx, shelf.cy - shelf.hh + 10, boxW, shelf.hh * 1.05, 3); c.stroke();
    bx += boxW + gap;
  });

  c.font = 'bold 10px sans-serif';
  c.fillStyle = '#e8c574';
  c.textAlign = 'center';
  c.fillText('MERMİ / MALZEME', shelf.cx, shelf.cy + shelf.hh + 16);
  c.restore();
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#1c1c22';
  c.fillRect(-52, -6, 104, 46);
  c.fillStyle = '#3a1418';
  c.fillRect(-45, -2, 43, 37);
  c.fillRect(2, -2, 43, 37);
  c.fillStyle = '#c9a24a';
  c.beginPath(); c.arc(-9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

// drawWeaponShopSceneBackground — canlı ekranın (renderFrame) statik
// kısmıyla AYNI çizim dizisi (NPC dahil), dışa açık — hem burada hem de
// kamera fotoğrafında (openCamera/renderCameraPreview) VE Sixtagram
// akışında (PostAttachment.jsx) kullanılabilir (bkz. BankWorldScreen'deki
// drawBankSceneBackground ile aynı desen).
export function drawWeaponShopSceneBackground(ctx, getAvatarImage) {
  drawFloor(ctx);
  drawDoor(ctx);
  AMMO_SHELVES.forEach((s) => drawAmmoShelf(ctx, s));
  DISPLAY_CASES.forEach((d) => drawDisplayCase(ctx, d));
  drawSellerCounter(ctx, SELLER_NPC, getAvatarImage);
  drawWalls(ctx);
}

export default function WeaponShopWorldScreen({ onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { others, updatePresence, clearPresence } = useInteriorPresence('silah_magazasi');

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'weapon' | null
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
  // --- Canlı/çok oyunculu — BankWorldScreen/ParkWorldScreen ile BİREBİR
  // aynı desen, bkz. hooks/useInteriorPresence.js.
  const myBubblesRef = useRef([]);
  const othersRef = useRef([]);
  // Diğer oyuncuların mesaj geçmişi — Firestore presence dokümanı SADECE
  // tek bir "o anki" chatText/chatTs alanı taşıyor, bu yüzden istemci
  // tarafında YEREL olarak biriktiriliyor (bkz. BankWorldScreen.jsx'teki
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

  // Mağazaya giriş/çıkış — BankWorldScreen ile BİREBİR aynı desen (bkz.
  // functions/index.js enterInterior), sadece locationId farklı.
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
    enterInterior('silah_magazasi')
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || START_POS;
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Silah mağazasına giriş hatası:', err);
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
          if (action?.type === 'seller') {
            setPanel('weapon');
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

      // --- Firestore senkronu — BankWorldScreen ile BİREBİR aynı: sadece
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
    setMyBubbles((prev) => [...prev.filter((b) => ts - b.ts < CHAT_BUBBLE_MS), { text, ts }]);
    updatePresence(user.uid, {
      x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
      pose: 'idle', seat: null, chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  // --- Kamera — BankWorldScreen ile BİREBİR aynı desen; arka plan yine
  // gerçek (drawWeaponShopSceneBackground). Sunucuya sadece mekan +
  // kendi pozun bildirilir (bkz. functions/index.js buildSixtagramAttachment
  // 'interiorPhoto').
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
      drawBackground: (bgCtx) => drawWeaponShopSceneBackground(bgCtx, getAvatarImage),
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
        type: 'interiorPhoto', locationId: 'silah_magazasi',
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

    drawWeaponShopSceneBackground(ctx, getAvatarImage);

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(255,90,90,0.55)';
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

    // NPC konuşma baloncuğu — tek satıcı, Banka'daki vezne baloncuklarıyla
    // aynı döngüsel/deterministik satır seçimi (bkz. cyclingLine).
    const bubbleItems = [];
    const line = cyclingLine(SELLER_NPC.lines, { phase: 0 });
    if (line) {
      const lines = wrapBubbleText(ctx, line);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = SELLER_BASE_Y - SPRITE_H * AVATAR_SCALE - 10;
      bubbleItems.push({ x: SELLER.cx, w, h, lines, ts: 0, naturalTop: anchorY - h });
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

    if (dist(p, SELLER) < SELLER_HW + 30) {
      if (dist(posRef.current, SELLER) < INTERACT_RADIUS + SELLER_HH) {
        setPanel('weapon');
      } else {
        pendingActionRef.current = { type: 'seller' };
        targetRef.current = { x: SELLER.cx, y: SELLER.cy + SELLER_HH + 46 };
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#131316', '--ws-panel-bg': '#1c1c24' }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
      <button className="ws-exit-btn" onClick={onExit}>✕</button>

      <div className="ws-canvas-wrap">
        {!ready && <div className="ws-loading">Silah mağazasına giriliyor…</div>}
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

      {panel === 'weapon' && (
        <div className="ws-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            <p className="ws-panel-title">🔫 Silah Mağazası — Tezgah</p>
            <WeaponShopScreen />
            <button className="ws-panel-btn" onClick={() => setPanel(null)}>Tezgahtan Uzaklaş</button>
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
