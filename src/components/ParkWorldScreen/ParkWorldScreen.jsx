import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { useParkPresence } from '../../hooks/useParkPresence';
import { enterPark, sellContrabandAtPark, buyFromBufe, createSixtagramPost, captureCameraSnapshot } from '../../services/gameActions';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR, AVATAR_FULL_VIEWBOX_H, AVATAR_WAIST_Y } from '../../lib/avatarShapes';
import {
  W, H, SPRITE_H, BUFE, NPC_POS, ALL_SEATS, OBSTACLES,
  roundRectC, buildStaticScene, drawAvatarSprite,
  createAvatarImageCache, renderPhotoFrame,
} from '../../lib/parkScene';
import { INTERIOR_AVATAR_SCALE } from '../../lib/canvasWorldKit';
import Hud from '../Hud/Hud';
import PhoneScreen from '../Phone/PhoneScreen';
import ResultModal from '../ResultModal/ResultModal';
import InfoIcon from '../InfoIcon/InfoIcon';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './ParkWorldScreen.css';

// --- Sahne düzeni -------------------------------------------------------
// "Park sabit, karakter yürüyor": kamera kaydırması YOK — canvas'ın
// kendisi tüm sahne. Koordinatlar doğrudan canvas piksel uzayında.
// Sabit sahne verisi (W,H,BUFE,TABLES,BENCHES,POND,NPC_POS,ALL_SEATS,
// OBSTACLES) artık lib/parkScene.js'te — hem burada hem kamera
// fotoğrafı render'ında (bkz. madde 12) aynı kaynaktan kullanılıyor.
const PLAYER_SPEED = 260; // piksel / saniye
const PLAYER_R = 20;
const INTERACT_RADIUS = 78;
const CHAT_BUBBLE_MS = 13000; // yeni istek: "bi tık daha uzun dursun" (eskisi 9500)
// AVATAR_SCALE — yeni istek: "parkta avatarımız diğer mekanlara göre daha
// küçük... her mekanda boyumuz aynı olsun". Park eskiden HİÇ scale
// vermiyordu (varsayılan 1), oysa Banka/Karakol/Camii/Gazino/Araba
// Galerisi/Silah Mağazası/Modifiye Garajı hepsi kendi AVATAR_SCALE'i
// (1.42, bkz. canvasWorldKit INTERIOR_AVATAR_SCALE) ile çiziyordu — Park
// bu yüzden gözle görülür şekilde daha küçük kalıyordu. Artık Park da AYNI
// değeri kullanıyor (hem canlı sahnede hem kamera karesinde, bkz. aşağı).
const AVATAR_SCALE = INTERIOR_AVATAR_SCALE;
const PARK_SELL_PRICE = 5000;
const HOLDING_MS = 120_000; // elde tutulan büfe ürünü 2 dakika sonra kaybolur
const CAMERA_RADIUS = 170;

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
// (BUFE, TABLES, BENCHES, POND, NPC_POS, ALL_SEATS, OBSTACLES artık
// lib/parkScene.js'ten import ediliyor — bkz. dosya başı.)

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
// nesneler (OBSTACLES) — bkz. lib/parkScene.js. NOT: bir oturma/
// etkileşim hedefine YÜRÜNÜRKEN bu liste bilerek devre dışı bırakılıyor
// (bkz. tick döngüsü) — aksi halde karakter "kendi hedefinin içine
// giremediği" için sonsuza dek yaklaşmaya çalışır (önceki sürümdeki
// bank/büfe kilitlenme hatası tam olarak buydu).

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
  // Yeni istek: "yeni mesaj yazdığımızda eskisi direkt yok olmasın, süresi
  // bitene kadar var olmaya devam etsin" — tek bir mesaj yerine, HENÜZ
  // süresi dolmamış mesajların dizisi tutuluyor (bkz. sendChat/renderFrame).
  const [myBubbles, setMyBubbles] = useState([]);
  const [sellBusy, setSellBusy] = useState(false);
  const [sellResult, setSellResult] = useState(null);
  const [bufeBusy, setBufeBusy] = useState(null);
  const [error, setError] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFrame, setCameraFrame] = useState(null); // { originX, originY, entities }
  const [cameraCaption, setCameraCaption] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraDone, setCameraDone] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneInitialApp, setPhoneInitialApp] = useState(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

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
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const myBubblesRef = useRef([]);
  const othersRef = useRef([]);
  const playerRef = useRef(null);
  // Diğer oyuncuların mesaj geçmişi — Firestore presence dokümanı SADECE
  // tek bir "o anki" chatText/chatTs alanı taşıyor (senkron maliyeti
  // yüzünden dizi olarak yazılmıyor), bu yüzden istemci tarafında YEREL
  // olarak biriktiriliyor: chatTs her değiştiğinde (yeni mesaj) bu
  // oyuncunun geçmiş dizisine eklenir, eskiler kendi süresi bitince
  // (renderFrame'de zaten filtrelendiği için) görünmez olur.
  const othersBubbleHistoryRef = useRef(new Map()); // uid -> [{text, ts}]
  const lastSeenChatTsRef = useRef(new Map()); // uid -> son kaydedilen chatTs

  useEffect(() => { holdingRef.current = holding; }, [holding]);
  useEffect(() => { sittingSeatRef.current = sittingSeatId; }, [sittingSeatId]);
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
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => () => { if (holdingTimeoutRef.current) clearTimeout(holdingTimeoutRef.current); }, []);

  // --- Avatar SVG'sini canvas'a çizilebilir bir <img>'e çeviren önbellek.
  // Arka planı YOK (şeffaf) — karakterler çim üzerine doğal oturuyor,
  // kare/renkli bir kutu içinde "yapıştırma" gibi görünmüyor. Ortak
  // fabrika (lib/parkScene.js) kullanılıyor — kamera fotoğrafı önizlemesi
  // de AYNI önbelleği paylaşıyor (bkz. getAvatarImageRef).
  function getAvatarImage(avatar, pose) {
    return getAvatarImageRef.current(avatar, pose);
  }

  // Park'a giriş / çıkış (bkz. functions/index.js enterPark üstündeki not).
  useEffect(() => {
    if (!user) {
      // Misafir: Firestore'a giriş bildirimi yok (enterPark auth ister),
      // ama sahnede serbestçe yürüyebilmesi için yerel olarak hazır
      // sayıyoruz — sadece sunucu senkronu (updatePresence, zaten `user`
      // kontrollü) devre dışı kalıyor.
      posRef.current = { x: 340, y: 700 };
      lastSyncedPosRef.current = { x: 340, y: 700 };
      setReady(true);
      return undefined;
    }
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

  // (Statik sahne çizim fonksiyonları lib/parkScene.js'e taşındı: drawPathSegment,
  // buildStaticScene, drawPond, drawTree, drawPineTree, drawBufeStatic, drawTable,
  // drawBench — hepsi yukarıdan import ediliyor.)

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
      if (cameraOpenRef.current && !cameraDoneRef.current) renderCameraPreview();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.uid]);

  // (drawHeldIcon, drawSprite -> lib/parkScene.js'ten import ediliyor: drawHeldIcon, drawAvatarSprite.)

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

    const addWord = (word) => {
      // Normal durum: kelime tek başına sığıyor, satıra normal ekle.
      if (ctx.measureText(word).width <= BUBBLE_MAX_TEXT_W) {
        const test = cur ? `${cur} ${word}` : word;
        if (cur && ctx.measureText(test).width > BUBBLE_MAX_TEXT_W) {
          lines.push(cur);
          cur = word;
        } else {
          cur = test;
        }
        return;
      }
      // Boşluksuz ÇOK UZUN bir "kelime" (ör. bitişik yazılmış uzun bir
      // yazı) — kelime sınırında kırmak yetmez, karakter karakter
      // uygun bir yerden kesip alt satıra taşıyoruz. Bu olmadan metin
      // balonun dışına taşıyordu.
      if (cur) { lines.push(cur); cur = ''; }
      let chunk = '';
      for (const ch of word) {
        const test = chunk + ch;
        if (chunk && ctx.measureText(test).width > BUBBLE_MAX_TEXT_W) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = test;
        }
      }
      cur = chunk;
    };

    words.forEach(addWord);
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
    const myBubblesNow = myBubblesRef.current.filter((b) => now - b.ts < CHAT_BUBBLE_MS);

    const rawEntities = [
      { x: NPC_POS.x, y: NPC_POS.y, avatar: NPC_AVATAR, pose: 'idle', facing: 'right', name: 'Şüpheli Adam', bubbleList: [], holding: null },
      ...othersRef.current.map((o) => ({
        x: o.x, y: o.y, avatar: o.avatar, pose: o.pose === 'sit' ? 'sit' : (o.pose || 'idle'),
        facing: o.facing || 'down', name: o.displayName || 'Oyuncu',
        bubbleList: (othersBubbleHistoryRef.current.get(o.uid) || []).filter((b) => now - b.ts < CHAT_BUBBLE_MS),
        holding: o.holding || null,
      })),
      {
        x: posRef.current.x, y: posRef.current.y, avatar: myAvatar,
        pose: sittingSeatRef.current ? 'sit' : poseRef.current, facing: facingRef.current,
        name: playerRef.current?.displayName || 'Sen', bubbleList: myBubblesNow, holding: holdingRef.current, isSelf: true,
      },
    ];

    // Oturma pozunda çizim kaydırması (bkz. eski yorum) — hem avatar hem
    // baloncuk konumu bunu kullanmalı ki baloncuk doğru yerde çıksın.
    const entities = rawEntities
      .map((e) => {
        const sitShift = e.pose === 'sit'
          ? ((SPRITE_H * (AVATAR_FULL_VIEWBOX_H - AVATAR_WAIST_Y)) / AVATAR_FULL_VIEWBOX_H) * AVATAR_SCALE
          : 0;
        return { ...e, baseY: e.y + sitShift };
      })
      .sort((a, b) => a.y - b.y);

    entities.forEach((e) => drawAvatarSprite(ctx, e, getAvatarImage, { scale: AVATAR_SCALE }));

    // Baloncuklar HER ZAMAN tüm karakterlerin üstünde çizilsin diye ayrı
    // (ve çakışma-çözümlü) bir son geçiş. Yeni istek: aynı karakterin
    // birden fazla (henüz süresi dolmamış) mesajı varsa ÜST ÜSTE
    // yığılır — en yeni mesaj kafaya en yakın, eski mesaj(lar) onun
    // biraz üstünde. Eskiden yeniye doğru yığıyoruz ki en yeni en alta
    // (kafaya en yakın konuma) düşsün.
    const bubbleItems = [];
    entities.forEach((e) => {
      const list = e.bubbleList || [];
      if (list.length === 0) return;
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
    layoutBubbles(bubbleItems).forEach((item) => drawBubbleBox(ctx, item));
  }

  // Dizideki her mesaj KENDİ süresi bitince tek tek düşer (hepsi birden
  // değil) — bir sonraki süresi dolacak mesaja göre zamanlanır, o
  // tetiklendiğinde süresi geçmiş olanlar filtrelenir ve (varsa kalanlar
  // için) tekrar zamanlanır.
  useEffect(() => {
    if (myBubbles.length === 0) return undefined;
    const now = Date.now();
    const earliestTs = Math.min(...myBubbles.map((b) => b.ts));
    const msUntilExpiry = Math.max(0, earliestTs + CHAT_BUBBLE_MS - now);
    const id = setTimeout(() => {
      setMyBubbles((prev) => prev.filter((b) => Date.now() - b.ts < CHAT_BUBBLE_MS));
    }, msUntilExpiry);
    return () => clearTimeout(id);
  }, [myBubbles]);

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
    if (!user) {
      setShowGuestPrompt(true);
      return;
    }
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
    if (!user) {
      setShowGuestPrompt(true);
      return;
    }
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
    // Yeni mesaj ESKİSİNİ silmiyor, diziye ekleniyor — her biri kendi
    // süresi (CHAT_BUBBLE_MS) bitene kadar ekranda kalmaya devam eder.
    setMyBubbles((prev) => [...prev.filter((b) => ts - b.ts < CHAT_BUBBLE_MS), { text, ts }]);
    updatePresence(user.uid, {
      x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
      pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
      holding: holdingRef.current, chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  // --- Kamera: "gerçekten o an neredeysen, ne yapıyorsan, arkanda ne
  // varsa" onu yakalayan bir enstantane. Poz SEÇİLMEZ — bankta
  // oturuyorsan fotoğrafta da oturuyorsun, yürüyorsan yürürken
  // yakalanırsın; tıpkı birinin seni o an görüp fotoğrafını çekmesi
  // gibi. Gerçek bir dosya yükleme YOK — kare, oyunun kendi vektörel
  // sahne çizimiyle (lib/parkScene.js — renderPhotoFrame) yeniden
  // üretiliyor: gerçek arka plan (büfenin yanındaysan büfe çıkar),
  // gerçek göreli konum (arkadaşların ekranda GERÇEKTEN durdukları
  // yönde/uzaklıkta görünür) — rastgele bir dizilim YOK. Sunucuya sadece
  // "fotoğraf çekildi" bildirilir; kimin karede olduğu, nerede durduğu
  // ve pozu sunucuda GERÇEK veriden (parkPresence + users) yeniden inşa
  // edilir (bkz. functions/index.js buildSixtagramAttachment
  // 'parkPhoto') — istemciden hiçbir konum/poz verisi TRUST edilmez.
  // latestActiveBubble — bir mesaj geçmişi dizisinden, HENÜZ süresi
  // dolmamış EN YENİ mesajı döner (yoksa null). Fotoğrafta (canlı
  // sahnenin aksine) tek bir balon gösterildiği için sadece en yenisi
  // yeterli — bkz. renderPhotoFrame'deki bubbleText/bubbleTs kullanımı.
  function latestActiveBubble(list) {
    const now = Date.now();
    const active = (list || []).filter((b) => now - b.ts < CHAT_BUBBLE_MS);
    if (active.length === 0) return null;
    return active[active.length - 1];
  }

  function buildCameraEntities() {
    const p = posRef.current;
    const nearby = othersRef.current
      .filter((o) => dist(p, o) < CAMERA_RADIUS)
      .slice(0, 4)
      .map((o) => {
        const bubble = latestActiveBubble(othersBubbleHistoryRef.current.get(o.uid));
        return {
          dx: o.x - p.x,
          dy: o.y - p.y,
          avatar: o.avatar,
          pose: o.pose === 'sit' ? 'sit' : (o.pose === 'walk1' || o.pose === 'walk2' ? o.pose : 'idle'),
          facing: o.facing || 'down',
          holding: o.holding || null,
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
      holding: holdingRef.current,
      isSelf: true,
      bubbleText: selfBubble?.text || null,
      bubbleTs: selfBubble?.ts || 0,
    };
    // Yeni istek (madde 5): "parktaki şüpheli adam fotoğraflarda
    // gözükmüyor" — NPC diğer oyuncular gibi gerçek konumundan (NPC_POS)
    // göreli ofsetle (dx/dy) karede yakınsa dahil edilir. Sunucu tarafında
    // da AYNI eklenmeli (bkz. functions/index.js buildSixtagramAttachment
    // 'parkPhoto') — istemci önizlemesi kadar paylaşılan fotoğraf da NPC'yi
    // göstersin diye.
    const npcDx = NPC_POS.x - p.x;
    const npcDy = NPC_POS.y - p.y;
    const npc =
      Math.hypot(npcDx, npcDy) < CAMERA_RADIUS
        ? [{
            dx: npcDx, dy: npcDy, avatar: NPC_AVATAR, pose: 'idle', facing: 'right',
            holding: null, isSelf: false, bubbleText: null, bubbleTs: 0,
          }]
        : [];
    return { originX: p.x, originY: p.y, entities: [self, ...nearby, ...npc] };
  }

  function openCamera() {
    const frame = buildCameraEntities();
    cameraFrameRef.current = frame;
    setCameraFrame(frame);
    setCameraCaption('');
    setCameraError(null);
    setCameraDone(false);
    cameraDoneRef.current = false;
    setCameraOpen(true);
    cameraOpenRef.current = true;
    // Yeni istek (madde 1): "fotoğraf çektiğimiz an neyse onu paylaşsın" —
    // makine AÇILDIĞI anda o anki kareyi sunucuda dondur (bkz.
    // functions/index.js captureCameraSnapshot/tryUseFrozenSnapshot).
    // Başarısız olursa sessizce yutulur — sunucu tarafında CANLI veri
    // yedek katmanı zaten var, fotoğraf özelliği bu yüzden engellenmez.
    captureCameraSnapshot({ type: 'parkPhoto' }).catch(() => {});
  }

  function closeCamera() {
    setCameraOpen(false);
    cameraOpenRef.current = false;
  }

  // renderCameraPreview — ana döngüden (tick) her karede çağrılır (bkz.
  // yukarısı), böylece avatar SVG'leri henüz yüklenmemişse bir sonraki
  // karede otomatik tamamlanır — ayrı bir polling/interval gerekmez.
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
      focalScale: AVATAR_SCALE,
    });
  }

  async function handleShareCamera() {
    setCameraBusy(true);
    setCameraError(null);
    try {
      await createSixtagramPost(cameraCaption, { type: 'parkPhoto' });
      setCameraDone(true);
      cameraDoneRef.current = true;
    } catch (err) {
      setCameraError(err.message || 'Paylaşılamadı.');
    } finally {
      setCameraBusy(false);
    }
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
            <button className="pw-chatsapp-btn" onClick={() => { setPhoneInitialApp('chatsapp'); setPhoneOpen(true); }} title="ChatsApp">💬</button>
            <button className="pw-phone-btn" onClick={() => { setPhoneInitialApp(null); setPhoneOpen(true); }} title="Telefon">📱</button>
            <button className="pw-camera-btn" onClick={() => (user ? openCamera() : setShowGuestPrompt(true))} title="Fotoğraf çek">📷</button>
          </>
        )}
      </div>

      {phoneOpen && (
        <PhoneScreen
          onClose={() => { setPhoneOpen(false); setPhoneInitialApp(null); }}
          initialApp={phoneInitialApp}
          onEnterTable={() => {}}
        />
      )}

      <div className="pw-chat-row">
        <input
          className="pw-chat-input"
          placeholder={user ? 'Bir şey yaz…' : 'Sohbet için giriş yapmalısın'}
          value={chatText}
          maxLength={140}
          disabled={!user}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (user ? sendChat() : setShowGuestPrompt(true))}
        />
        <button className="pw-chat-send" onClick={() => (user ? sendChat() : setShowGuestPrompt(true))}>Gönder</button>
      </div>

      {error && <p className="pw-error">{error}</p>}

      {showGuestPrompt && (
        <div className="pw-panel-backdrop" onClick={() => setShowGuestPrompt(false)}>
          <div className="pw-panel" onClick={(e) => e.stopPropagation()}>
            <SignInPrompt message="Bunun için giriş yapmalısın." />
            <button className="pw-panel-btn" onClick={() => setShowGuestPrompt(false)}>Kapat</button>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="pw-panel-backdrop" onClick={closeCamera}>
          <div className="pw-panel" onClick={(e) => e.stopPropagation()}>
            {!cameraDone ? (
              <>
                <p className="pw-panel-title">📷 Fotoğraf Çek</p>
                <div className="pw-camera-preview">
                  <canvas ref={cameraCanvasRef} width={320} height={320} className="pw-camera-canvas" />
                </div>
                <p className="pw-hint">
                  {cameraFrame && cameraFrame.entities.length > 1
                    ? `Karede sen ve ${cameraFrame.entities.length - 1} arkadaşın var — o an gerçekten nerede duruyorsanız, ne yapıyorsanız öyle.`
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
                <button className="pw-panel-btn" onClick={closeCamera}>Vazgeç</button>
              </>
            ) : (
              <>
                <p className="pw-panel-title">Paylaşıldı! 🎉</p>
                <p className="pw-hint">Fotoğrafın Sixtagram akışında.</p>
                <button className="pw-panel-btn primary" onClick={closeCamera}>Tamam</button>
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
