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
import BankScreen from '../BankScreen/BankScreen';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { createSixtagramPost, enterInterior, captureCameraSnapshot } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';
import './BankWorldScreen.css';

// --- Banka içi (madde 2-4) -------------------------------------------------
// Park'takiyle aynı "sabit mekan, karakter yürüyor" mantığı — ama TEK
// OYUNCULU: bankanın içinde başka gerçek oyuncular gösterilmiyor (bunun
// için Park'taki gibi ayrı bir canlı-konum/Firestore altyapısı gerekir;
// bu ilk sürümde bilerek dahil edilmedi). 3 vezne NPC'si, numaratör ve
// oturma alanı TAMAMEN buradaki tek oyuncu için çalışır.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;
// CAMERA_RADIUS — yeni istek (madde 2): "camiide arkadaşımla fotoğraf
// çekecektim arkadaşım fotoğrafta çıkmıyor" — Park'takiyle AYNI değer,
// yakındaki gerçek oyuncuları da kareye dahil etmek için.
const CAMERA_RADIUS = 170;

// AVATAR_SCALE (madde 13) — bina içlerinde her şey (avatar dahil) küçük
// kalıyordu; bu SADECE bu mekana özel bir büyütme, paylaşılan SPRITE_H
// varsayılanına (Park dahil tüm mekanların ortak temeli) DOKUNULMUYOR —
// bkz. lib/canvasWorldKit.js drawAvatarSprite'ın `scale` parametresi.
const AVATAR_SCALE = 1.42;
// Yeni istek: "mekanlardaki eşyaları büyütelim" — vezne tezgahı/sandalye/
// numaratör boyutları ~%10 büyütüldü (pozisyonlar AYNI kaldı, sadece
// boyutlar — komşu veznelerin çakışmaması için sınırlı tutuldu, bkz.
// TELLER_HW).

// NOT: NPC'lerin başı sprite boyu (SPRITE_H=118) kadar counter'ın
// ÜSTÜNE çıkıyor (bkz. drawTeller) — cy bu yüzden duvar panosunun
// (0-160) rahatça altında kalacak kadar aşağıda seçildi, aksi halde
// NPC başı duvardaki yazı/panoyla çakışıyordu.
const TELLERS = [
  { id: 'vezne1', cx: 170, cy: 350, label: 'VEZNE 1' },
  { id: 'vezne2', cx: 340, cy: 350, label: 'VEZNE 2' },
  { id: 'vezne3', cx: 510, cy: 350, label: 'VEZNE 3' },
];
const TELLER_HW = 82;
const TELLER_HH = 40;
// TELLER_SIT_SHIFT — yeni istek ("oturan npclerin sandalyesi olsun ve
// masaya daha yakın olsunlar"): veznedarlar pose:'sit' ile çiziliyor ama
// altlarında sandalye yoktu, ve baseY telafisi olmadığı için görünür
// gövde tezgahın epey gerisinde havada duruyormuş gibi görünüyordu —
// bar taburelerinde oturan OYUNCU için zaten kullanılan aynı telafi
// (`SPRITE_H * scale * 0.32`) burada da uygulanıyor (bkz. drawTeller).
// tellerSeatY'deki "-24" sandalyeyi/veznedarı tezgahtan geriye (yukarı)
// alıyordu; yeni istek (madde 18: "veznedeki npclerin ayakları masanın
// üstündeki VEZNE yazısına denk geliyor") — "-36"ya çıkarılarak sandalye +
// oturan gövde bir tık daha yukarı, tabeladan uzağa alındı (chair
// sandalyeyle birlikte hareket ettiği için ikisi arasındaki hiza bozulmuyor).
const TELLER_SIT_SHIFT = SPRITE_H * AVATAR_SCALE * 0.32;
function tellerSeatY(t) { return t.cy - TELLER_HH - 36; }
function tellerBaseY(t) { return tellerSeatY(t) + TELLER_SIT_SHIFT; }

// GUVENLIK — madde 12: bankada tam 1 güvenlik NPC'si, veznelerin uzağında
// (duvar kenarı) sabit duruyor, sadece dekoratif/atmosferik.
const GUVENLIK = { cx: 610, cy: 560 };
const GUVENLIK_NPC = {
  name: 'Güvenlik',
  lines: ['Sıraya girer misiniz.', 'Güvenli bankacılık.', 'İyi günler.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#8d5524',
    hairStyle: 'short', hairColor: '#0d0a08', clothing: 'suit', clothColor: '#14171c',
    neckAcc: 'tie', pantsColor: '#0d0d0d', background: 'transparent',
  },
};

const TELLER_NPCS = {
  vezne1: {
    name: 'Ahmet (Veznedar)',
    lines: ['Sıradaki lütfen!', 'İmza atar mısınız?', 'Kart mı nakit mi?', 'İyi günler dilerim.'],
    avatar: {
      ...DEFAULT_AVATAR, gender: 'erkek', build: 'standart', skin: '#c68863',
      hairStyle: 'short', hairColor: '#2b2118', clothing: 'suit', clothColor: '#1d3d5c',
      neckAcc: 'tie', pantsColor: '#22262f', background: 'transparent',
    },
  },
  vezne2: {
    name: 'Elif (Veznedar)',
    lines: ['Hoş geldiniz!', 'Bakiyenizi kontrol edeyim.', 'Bir dakika lütfen.', 'Başka bir isteğiniz var mı?'],
    avatar: {
      ...DEFAULT_AVATAR, gender: 'kadin', build: 'zayif', skin: '#e0ac69',
      hairStyle: 'bun', hairColor: '#5c3a21', clothing: 'vest', clothColor: '#5c1a24',
      neckAcc: 'none', pantsColor: '#22262f', background: 'transparent',
    },
  },
  vezne3: {
    name: 'Mehmet (Veznedar)',
    lines: ['Buyurun efendim.', 'Kredi mi yatırım mı?', 'Kasada yoğunluk var, kusura bakmayın.', 'Faiz oranları güncel.'],
    avatar: {
      ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#8d5524',
      hairStyle: 'slick', hairColor: '#0d0a08', facialHair: 'mustache',
      clothing: 'suit', clothColor: '#22262f', neckAcc: 'tie', pantsColor: '#0d0d0d',
      background: 'transparent',
    },
  },
};

const NUMARATOR = { cx: 340, cy: 550, r: 40 };

// Oturma/bekleme bölümü — tek tek sandalyeler (masa yok, sadece bekleme).
const CHAIRS = [
  { id: 'chair_1', cx: 200, cy: 710 }, { id: 'chair_2', cx: 340, cy: 710 }, { id: 'chair_3', cx: 480, cy: 710 },
  { id: 'chair_4', cx: 200, cy: 810 }, { id: 'chair_5', cx: 340, cy: 810 }, { id: 'chair_6', cx: 480, cy: 810 },
];
const CHAIR_R = 31;

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

const OBSTACLES = [
  ...TELLERS.map((t) => ({ cx: t.cx, cy: t.cy, hw: TELLER_HW, hh: TELLER_HH })),
  { cx: NUMARATOR.cx, cy: NUMARATOR.cy, r: NUMARATOR.r },
  ...CHAIRS.map((c) => ({ cx: c.cx, cy: c.cy, r: CHAIR_R })),
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

function ambientTellerNumber(tellerIndex, now) {
  // Diğer (görünmeyen) müşterilerin numarası gibi — SADECE görsel canlılık
  // için, saat bazlı deterministik sahte-rastgele, ~9sn'de bir değişir.
  const bucket = Math.floor(now / 9000 + tellerIndex * 3.3);
  const seed = Math.sin(bucket * 12.9898 + tellerIndex * 78.233) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return 10 + Math.floor(frac * 90);
}

function drawFloor(c) {
  c.fillStyle = '#dcd6c8';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(0,0,0,0.06)';
  c.lineWidth = 1;
  for (let x = 0; x <= W; x += 58) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let y = 0; y <= H; y += 58) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
}

// WALL_H — duvar panosunun alt sınırı. Vezneler (TELLERS.cy=340) ve
// NPC başları bunun rahatça altında kalacak şekilde seçildi (bkz.
// TELLERS tanımındaki not) — numara panosu da tamamen bu bandın İÇİNDE,
// böylece hiçbir zaman NPC'lerle çakışmıyor.
const WALL_H = 160;

function drawWalls(c) {
  const grd = c.createLinearGradient(0, 0, 0, WALL_H);
  grd.addColorStop(0, '#2b3550');
  grd.addColorStop(1, '#3a4468');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H);
  c.fillStyle = '#1d2440';
  c.fillRect(0, WALL_H - 8, W, 8);
  c.fillStyle = '#e8cf7a';
  c.font = 'bold 22px sans-serif';
  c.textAlign = 'center';
  c.fillText('PARARA BANK', W / 2, 42);
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(232,207,122,0.7)';
  c.fillText('Güvenilir. Hızlı. Sizin Bankanız.', W / 2, 140);
}

// Vezne üstü numara panosu — duvar panosunun İÇİNDE, 3 veznenin
// çağırdığı numaraları gösterir.
function drawNumberBoard(c, calledInfo, now) {
  const bx = 170, by = 66, bw = 340, bh = 30;
  c.fillStyle = '#0d0d14';
  roundRectC(c, bx, by, bw, bh, 5); c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 1.4;
  roundRectC(c, bx, by, bw, bh, 5); c.stroke();
  c.font = 'bold 14px monospace';
  c.textAlign = 'center';
  TELLERS.forEach((t, i) => {
    const isCalled = calledInfo && calledInfo.tellerId === t.id && calledInfo.until > now;
    const num = isCalled ? calledInfo.number : ambientTellerNumber(i, now);
    c.fillStyle = isCalled ? '#ff5fa8' : '#4ee88a';
    const x = bx + bw * ((i + 0.5) / 3);
    c.fillText(`V${i + 1}: ${String(num).padStart(2, '0')}`, x, by + 20);
  });
}

function drawTeller(c, t, npc, getAvatarImage) {
  c.save();
  c.translate(t.cx, t.cy);
  // Gölge
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(0, TELLER_HH + 8, TELLER_HW + 6, 12, 0, 0, Math.PI * 2); c.fill();
  // Tezgah
  const grd = c.createLinearGradient(0, -TELLER_HH, 0, TELLER_HH);
  grd.addColorStop(0, '#5c4a2f'); grd.addColorStop(1, '#3a2f1d');
  c.fillStyle = grd;
  roundRectC(c, -TELLER_HW, -TELLER_HH, TELLER_HW * 2, TELLER_HH * 2, 6); c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 1.5;
  roundRectC(c, -TELLER_HW, -TELLER_HH, TELLER_HW * 2, TELLER_HH * 2, 6); c.stroke();
  // Cam bölme
  c.fillStyle = 'rgba(150,200,220,0.28)';
  roundRectC(c, -TELLER_HW + 8, -TELLER_HH - 46, TELLER_HW * 2 - 16, 46, 4); c.fill();
  c.strokeStyle = 'rgba(232,207,122,0.6)'; c.lineWidth = 1;
  roundRectC(c, -TELLER_HW + 8, -TELLER_HH - 46, TELLER_HW * 2 - 16, 46, 4); c.stroke();
  // Tabela
  c.fillStyle = '#12241c';
  roundRectC(c, -40, -TELLER_HH - 16, 80, 18, 3); c.fill();
  c.fillStyle = '#e8cf7a';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText(t.label, 0, -TELLER_HH - 3);
  c.restore();

  // NPC (tezgahın arkasında OTURUYOR — yeni istek: "veznede çalışanlar ...
  // otursun", ve sonra: "oturan npclerin sandalyesi olsun ve masaya daha
  // yakın olsunlar" — artık gerçek bir sandalyede (bkz. drawTellerChair) ve
  // baseY, bar taburelerinde oturan OYUNCU için kullanılan aynı
  // `SPRITE_H * scale * 0.32` telafisiyle sandalyeye hizalanıyor (bkz.
  // TELLER_SIT_SHIFT/tellerSeatY/tellerBaseY).
  const seatY = tellerSeatY(t);
  const baseY = tellerBaseY(t);
  drawTellerChair(c, t.cx, seatY);
  drawAvatarSprite(c, {
    x: t.cx, baseY, avatar: npc.avatar, pose: 'sit', facing: 'down', name: npc.name,
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });

  c.fillStyle = 'rgba(20,12,8,0.8)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText(npc.name, t.cx, baseY - SPRITE_H * AVATAR_SCALE - 8);
}

// drawTellerChair — yeni istek: "oturan npclerin sandalyesi olsun" —
// veznedarın tezgahının hemen arkasına çizilen basit bir ofis sandalyesi
// (sırtlığı tezgahın üstünden görünüyor).
function drawTellerChair(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(0, 17, 20, 7, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2b2318';
  roundRectC(c, -14, -26, 28, 28, 4); c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 1.2;
  roundRectC(c, -14, -26, 28, 28, 4); c.stroke();
  c.restore();
}

function drawGuard(c, getAvatarImage) {
  drawAvatarSprite(c, {
    x: GUVENLIK.cx, baseY: GUVENLIK.cy, avatar: GUVENLIK_NPC.avatar, pose: 'idle', facing: 'left',
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
  c.fillStyle = 'rgba(20,12,8,0.8)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText(GUVENLIK_NPC.name, GUVENLIK.cx, GUVENLIK.cy + 16);
}

function drawNumaratorKiosk(c) {
  c.save();
  c.translate(NUMARATOR.cx, NUMARATOR.cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, NUMARATOR.r + 4, NUMARATOR.r + 4, 12, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#22262f';
  roundRectC(c, -27, -79, 53, 132, 8); c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 1.6;
  roundRectC(c, -27, -79, 53, 132, 8); c.stroke();
  c.fillStyle = '#0d1a12';
  roundRectC(c, -20, -68, 40, 29, 4); c.fill();
  c.fillStyle = '#4ee88a';
  c.font = 'bold 12px monospace';
  c.textAlign = 'center';
  c.fillText('SIRA', 0, -49);
  c.fillStyle = '#c9432b';
  roundRectC(c, -16, -26, 33, 14, 3); c.fill();
  c.fillStyle = '#f4e6d0';
  c.font = 'bold 9px sans-serif';
  c.fillText('NUMARA AL', 0, -16);
  c.restore();
}

function drawChair(c, seat) {
  c.save();
  c.translate(seat.cx, seat.cy);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(0, 21, 27, 10, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#4a2e18';
  roundRectC(c, -19, -2, 37, 21, 4); c.fill();
  c.fillStyle = '#6b4226';
  roundRectC(c, -19, -36, 37, 34, 5); c.fill();
  c.strokeStyle = '#2b1b12'; c.lineWidth = 1.2;
  roundRectC(c, -19, -36, 37, 34, 5); c.stroke();
  c.restore();
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#2b1b12';
  c.fillRect(-52, -6, 104, 46);
  c.fillStyle = '#8a5a34';
  c.fillRect(-45, -2, 43, 37);
  c.fillRect(2, -2, 43, 37);
  c.fillStyle = '#e8cf7a';
  c.beginPath(); c.arc(-9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

// drawBankSceneBackground — canlı ekranın (renderFrame) statik kısmıyla
// AYNI çizim dizisi, tek bir yerde toplandı (dışa açık) — hem burada hem
// de kamera fotoğrafında (bkz. openCamera/renderCameraPreview) VE
// Sixtagram akışında (PostAttachment.jsx) kullanılıyor, böylece "gerçek
// arka plan" her yerde birebir aynı (bkz. madde 11/12).
export function drawBankSceneBackground(ctx, getAvatarImage, calledInfo = null) {
  const now = Date.now();
  drawFloor(ctx);
  drawWalls(ctx);
  drawNumberBoard(ctx, calledInfo, now);
  drawDoor(ctx);
  CHAIRS.forEach((s) => drawChair(ctx, s));
  drawNumaratorKiosk(ctx);
  TELLERS.forEach((t) => drawTeller(ctx, t, TELLER_NPCS[t.id], getAvatarImage));
  drawGuard(ctx, getAvatarImage);
}

export default function BankWorldScreen({ onExit, onOpenHeist }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { others, updatePresence, clearPresence } = useInteriorPresence('banka');

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'bank' | null
  const [sittingSeatId, setSittingSeatId] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  // Yeni istek: "yeni mesaj yazdığımızda eskisi direkt yok olmasın, süresi
  // bitene kadar var olmaya devam etsin" — tek bir mesaj yerine, HENÜZ
  // süresi dolmamış mesajların dizisi tutuluyor (bkz. sendChat/renderFrame).
  const [myBubbles, setMyBubbles] = useState([]);
  const [myNumber, setMyNumber] = useState(null);
  const [calledInfo, setCalledInfo] = useState(null);
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
  const sittingSeatRef = useRef(null);
  const walkAnimRef = useRef(0);
  const poseRef = useRef('idle');
  const numberTimeoutRef = useRef(null);
  const calledClearRef = useRef(null);
  const calledInfoRef = useRef(null);
  const playerRef = useRef(null);
  // myNumberRef — handleTakeNumber, numaratöre YÜRÜYEREK varılınca (bkz. Ana
  // döngü effect'i içindeki 'numarator' action dalı) mount anındaki eski
  // (stale) closure'dan çağrılıyor; `myNumber` state'ini DOĞRUDAN okuyan bir
  // guard orada hep `null` görür ve aynı anda birden çok numara alınabilirdi.
  // Diğer ref'lerle aynı desen: ref'e aynala, guard'ı ref'ten oku.
  const myNumberRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));
  // --- Canlı/çok oyunculu (madde 17) — Park'takiyle BİREBİR aynı desen,
  // bkz. hooks/useInteriorPresence.js ve ParkWorldScreen.jsx'teki yorumlar.
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

  useEffect(() => { sittingSeatRef.current = sittingSeatId; }, [sittingSeatId]);
  // calledInfoRef — renderFrame, mount'ta BİR KEZ kurulan requestAnimationFrame
  // döngüsü içinden çağrılıyor (bkz. aşağıdaki "Ana döngü" effect'i, deps=[]),
  // yani orada `calledInfo` state'ini DOĞRUDAN okumak mount anındaki eski
  // (stale) değerde donup kalırdı — Park'taki desenle aynı şekilde ref'e
  // aynalıyoruz.
  useEffect(() => { calledInfoRef.current = calledInfo; }, [calledInfo]);
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { myNumberRef.current = myNumber; }, [myNumber]);
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

  useEffect(() => () => {
    if (numberTimeoutRef.current) clearTimeout(numberTimeoutRef.current);
    if (calledClearRef.current) clearTimeout(calledClearRef.current);
  }, []);

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

  // Bankaya giriş/çıkış — enterPark/ParkWorldScreen ile BİREBİR aynı desen
  // (bkz. functions/index.js enterInterior).
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
    enterInterior('banka')
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || START_POS;
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Bankaya giriş hatası:', err);
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

  // --- Ana döngü: hareket + çizim + Firestore senkronu (madde 17) -------
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
            sittingSeatRef.current = action.seat.id;
            setSittingSeatId(action.seat.id);
          } else if (action?.type === 'teller') {
            setPanel('bank');
          } else if (action?.type === 'numarator') {
            handleTakeNumber();
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

      // --- Firestore senkronu (madde 17) — Park'takiyle BİREBİR aynı: sadece
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
            x: p.x, y: p.y, facing: facingRef.current,
            pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
          });
        } else if (sinceLast > IDLE_HEARTBEAT_MS) {
          lastSyncRef.current = t;
          updatePresence(user.uid, {
            x: p.x, y: p.y, facing: facingRef.current,
            pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
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
      pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
      chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  // --- Kamera (madde 11/12) — Park'takiyle BİREBİR aynı desen, ama tek
  // oyunculu olduğu için karede sadece kendin varsın (başka gerçek oyuncu
  // yok) — arka plan yine gerçek (drawBankSceneBackground), rastgele
  // yerleştirme YOK. Sunucuya sadece hangi mekanda olduğun + kendi pozun
  // bildirilir; avatar/isim yine users/{uid}'den (trusted) okunur (bkz.
  // functions/index.js buildSixtagramAttachment 'interiorPhoto').
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
    // DÜZELTME (madde 2): "camiide arkadaşımla fotoğraf çekecektim arkadaşım
    // fotoğrafta çıkmıyor" — Park'takiyle aynı şekilde, yakındaki gerçek
    // oyuncular da (othersRef.current, CAMERA_RADIUS içinde) kareye dahil
    // ediliyor; sunucu tarafı da AYNI mantıkla doğrulanıyor (bkz.
    // functions/index.js buildPresenceEntities).
    const nearby = othersRef.current
      .filter((o) => dist(p, o) < CAMERA_RADIUS)
      .slice(0, 4)
      .map((o) => {
        const bubble = latestActiveBubble(othersBubbleHistoryRef.current.get(o.uid));
        return {
          dx: o.x - p.x,
          dy: o.y - p.y,
          avatar: o.avatar,
          pose: o.pose === 'sit' ? 'sit' : (o.pose || 'idle'),
          facing: o.facing || 'down',
          isSelf: false,
          bubbleText: bubble?.text || null,
          bubbleTs: bubble?.ts || 0,
        };
      });
    const selfBubble = latestActiveBubble(myBubblesRef.current);
    const self = {
      dx: 0, dy: 0,
      avatar: playerRef.current?.avatar,
      pose: sittingSeatRef.current ? 'sit' : (poseRef.current || 'idle'),
      facing: facingRef.current,
      isSelf: true,
      scale: AVATAR_SCALE,
      bubbleText: selfBubble?.text || null,
      bubbleTs: selfBubble?.ts || 0,
    };
    return { originX: p.x, originY: p.y, entities: [self, ...nearby] };
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
    // Yeni istek (madde 1): makine AÇILDIĞI anda o anki kareyi sunucuda
    // dondur (bkz. functions/index.js captureCameraSnapshot).
    captureCameraSnapshot({ type: 'interiorPhoto', locationId: 'banka' }).catch(() => {});
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
      drawBackground: (bgCtx) => drawBankSceneBackground(bgCtx, getAvatarImage, calledInfoRef.current),
      focalScale: AVATAR_SCALE,
    });
  }

  // drawTicketIcon (madde 7) — numaratörden alınan sıra numarasını elde
  // tutulan küçük bir kağıt olarak gösterir. drawHeldIcon (canvasWorldKit)
  // sabit ürün türleri için — burada sayı DİNAMİK olduğundan ayrı, basit
  // bir çizim yeterli (aynı görsel dil: küçük, elin yanında, hafif salınım).
  function drawTicketIcon(c, number, x, y) {
    const now = performance.now();
    const bob = Math.sin(now / 480) * 2;
    c.save();
    c.translate(x, y + bob);
    c.fillStyle = '#f4e6d0';
    roundRectC(c, -9, -12, 18, 24, 2); c.fill();
    c.strokeStyle = '#a86b3c'; c.lineWidth = 1.2;
    roundRectC(c, -9, -12, 18, 24, 2); c.stroke();
    c.fillStyle = '#22262f';
    c.font = 'bold 9px monospace';
    c.textAlign = 'center';
    c.fillText(String(number).padStart(2, '0'), 0, 3);
    c.restore();
  }

  async function handleShareCamera() {
    setCameraBusy(true);
    setCameraError(null);
    try {
      const frame = cameraFrameRef.current;
      const self = frame?.entities?.[0];
      await createSixtagramPost(cameraCaption, {
        type: 'interiorPhoto', locationId: 'banka',
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

  function handleTakeNumber() {
    if (myNumberRef.current != null) return;
    const n = 10 + Math.floor(Math.random() * 90);
    myNumberRef.current = n;
    setMyNumber(n);
    if (numberTimeoutRef.current) clearTimeout(numberTimeoutRef.current);
    numberTimeoutRef.current = setTimeout(() => {
      const teller = TELLERS[Math.floor(Math.random() * TELLERS.length)];
      const until = Date.now() + 4000;
      setCalledInfo({ tellerId: teller.id, number: n, until });
      if (calledClearRef.current) clearTimeout(calledClearRef.current);
      calledClearRef.current = setTimeout(() => {
        setCalledInfo(null);
        myNumberRef.current = null;
        setMyNumber(null);
      }, 4200);
    }, 10_000);
  }

  function renderFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    drawBankSceneBackground(ctx, getAvatarImage, calledInfoRef.current);

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(30,30,40,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetRef.current.x, targetRef.current.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    const now = Date.now();
    const sitShift = sittingSeatRef.current ? SPRITE_H * AVATAR_SCALE * 0.32 : 0;
    const myBubblesNow = myBubblesRef.current.filter((b) => now - b.ts < CHAT_BUBBLE_MS);

    const rawEntities = [
      ...othersRef.current.map((o) => ({
        x: o.x, y: o.y, avatar: o.avatar, pose: o.pose === 'sit' ? 'sit' : (o.pose || 'idle'),
        facing: o.facing || 'down', name: o.displayName || 'Oyuncu',
        bubbleList: (othersBubbleHistoryRef.current.get(o.uid) || []).filter((b) => now - b.ts < CHAT_BUBBLE_MS),
        isSelf: false,
      })),
      {
        x: posRef.current.x, y: posRef.current.y, avatar: playerRef.current?.avatar,
        pose: sittingSeatRef.current ? 'sit' : poseRef.current, facing: facingRef.current,
        name: playerRef.current?.displayName || 'Sen', bubbleList: myBubblesNow, isSelf: true,
      },
    ];
    const entities = rawEntities
      .map((e) => ({ ...e, baseY: e.y + (e.pose === 'sit' ? SPRITE_H * AVATAR_SCALE * 0.32 : 0) }))
      .sort((a, b) => a.y - b.y);
    entities.forEach((e) => drawAvatarSprite(ctx, e, getAvatarImage, { showName: !e.isSelf, scale: AVATAR_SCALE }));

    if (myNumberRef.current != null) {
      drawTicketIcon(ctx, myNumberRef.current, posRef.current.x + 30, posRef.current.y - SPRITE_H * AVATAR_SCALE * 0.5 + sitShift);
    }

    // NPC konuşma baloncukları — çağrılan vezne varsa (madde 8) o an
    // NORMAL sohbetin yerine "Sıra XX!" seslenişini gösterir.
    const bubbleItems = [];
    TELLERS.forEach((t, i) => {
      const npc = TELLER_NPCS[t.id];
      const called = calledInfoRef.current;
      const isCalling = called && called.tellerId === t.id && called.until > now;
      const line = isCalling ? `Sıra ${String(called.number).padStart(2, '0')}!` : cyclingLine(npc.lines, { phase: i * 7 });
      if (!line) return;
      const lines = wrapBubbleText(ctx, line);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = tellerBaseY(t) - SPRITE_H * AVATAR_SCALE - 10;
      bubbleItems.push({ x: t.cx, w, h, lines, ts: isCalling ? 999 + i : i, naturalTop: anchorY - h });
    });
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

  function standUp() {
    sittingSeatRef.current = null;
    setSittingSeatId(null);
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

    const teller = TELLERS.find((t) => dist(p, t) < TELLER_HW + 30);
    if (teller) {
      if (dist(posRef.current, teller) < INTERACT_RADIUS + TELLER_HH) {
        setPanel('bank');
      } else {
        pendingActionRef.current = { type: 'teller' };
        targetRef.current = { x: teller.cx, y: teller.cy + TELLER_HH + 46 };
      }
      return;
    }

    if (dist(p, NUMARATOR) < 60) {
      if (dist(posRef.current, NUMARATOR) < INTERACT_RADIUS) {
        handleTakeNumber();
      } else {
        pendingActionRef.current = { type: 'numarator' };
        targetRef.current = { x: NUMARATOR.cx, y: NUMARATOR.cy + 60 };
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#dcd6c8', '--ws-panel-bg': '#1c1c24' }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
      {onOpenHeist && (
        <button className="ws-heist-btn" onClick={() => onOpenHeist('banka')}>Soygun</button>
      )}
      <button className="ws-exit-btn" onClick={onExit}>✕</button>

      <div className="ws-canvas-wrap">
        {!ready && <div className="ws-loading">Bankaya giriliyor…</div>}
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
        {myNumber != null && (
          <div className="bw-number-badge">
            Numaranız: <strong>{String(myNumber).padStart(2, '0')}</strong>
          </div>
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

      {panel === 'bank' && (
        <div className="ws-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            <p className="ws-panel-title">🏦 Parara Bank — Vezne</p>
            <BankScreen />
            <button className="ws-panel-btn" onClick={() => setPanel(null)}>Vezneden Uzaklaş</button>
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
