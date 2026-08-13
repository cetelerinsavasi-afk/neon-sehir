import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useImamState } from '../../hooks/useImamState';
import { useMosqueAttendance } from '../../hooks/useMosqueAttendance';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import {
  drawAvatarSprite, createAvatarImageCache, renderPhotoFrame,
  wrapBubbleText, measureBubble, layoutBubbles, drawBubbleBox,
  resolveObstaclePosition, cyclingLine, SPRITE_H,
} from '../../lib/canvasWorldKit';
import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import { ImamPanel, BeggarsSection, WINDOW_HOURS } from '../MosqueScreen/MosqueScreen';
import { prayAtMosque, createSixtagramPost } from '../../services/gameActions';
import Hud from '../Hud/Hud';
import PhoneScreen from '../Phone/PhoneScreen';
import '../../styles/worldScreenChrome.css';
import './MosqueWorldScreen.css';

// --- Camii içi (madde 6) -----------------------------------------------
// Bank/Karakol'la BİREBİR aynı iskelet — tek oyunculu. Camii'nin TÜM iş
// mantığı (ibadet, imamlık başvurusu/nasihat/maaş, dilencilik/bağış) zaten
// MosqueScreen.jsx'te tam olarak var — burada SADECE iki NPC'ye (imam,
// dilenci) tıklayınca hangi bölümün açılacağını yönlendiriyoruz, hiçbir
// yeni Firestore/Cloud Function mantığı eklenmedi.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;

const MIHRAB = { cx: 340, cy: 290, hw: 70, hh: 34 };
const BEGGAR = { cx: 340, cy: 830, r: 26 };
// Ambient (etkileşimsiz) cemaat NPC'leri — sadece madde 6'daki "genel
// NPC'ler arada bir bir şeyler söylüyormuş gibi ~30sn'de bir konuşsun"
// isteği için, cyclingLine zaten bunu destekliyor (yeni kod yok).
const AMBIENT_NPCS = [
  {
    cx: 220, cy: 650,
    lines: ['Selamünaleyküm.', 'Bugün cemaat kalabalık.', 'Allah kabul etsin.'],
    avatar: { ...DEFAULT_AVATAR, gender: 'erkek', build: 'zayif', skin: '#c68863', hairStyle: 'kel', clothing: 'vest', clothColor: '#4a4a52', pantsColor: '#22262f', background: 'transparent' },
  },
  {
    cx: 460, cy: 650,
    lines: ['Hayırlı cumalar.', 'Vaktinde gelmeye çalışıyorum.', 'Huzur veriyor burası.'],
    avatar: { ...DEFAULT_AVATAR, gender: 'kadin', build: 'standart', skin: '#e0ac69', hairStyle: 'bun', hairColor: '#3a2a1c', clothing: 'trenchcoat', clothColor: '#5c3a21', neckAcc: 'scarf', pantsColor: '#22262f', background: 'transparent' },
  },
];

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

const OBSTACLES = [
  { cx: MIHRAB.cx, cy: MIHRAB.cy, hw: MIHRAB.hw, hh: MIHRAB.hh },
  { cx: BEGGAR.cx, cy: BEGGAR.cy, r: BEGGAR.r },
  ...AMBIENT_NPCS.map((n) => ({ cx: n.cx, cy: n.cy, r: 26 })),
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

function istanbulDateKey(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// İmamın "şu an ne yaptığı" — sunucuda ayrı bir alan yok, bu yüzden madde
// 6'nın istediği "cyclic nasihat mi veriyor, namaz mı kıldırıyor" ayrımını
// Bank'taki numaratör gibi saat bazlı deterministik bir kozmetik döngüyle
// veriyoruz (60sn'de bir değişir) — gerçek bir durum senkronizasyonu
// gerektirmiyor, tamamen görsel.
function imamActivity(now) {
  return Math.floor(now / 60000) % 3 === 0 ? 'namaz' : 'nasihat';
}

function drawFloor(c) {
  c.fillStyle = '#241a10';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(232,207,122,0.06)';
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
  grd.addColorStop(0, '#1f3a2e'); grd.addColorStop(1, '#2c4f3d');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H);
  c.fillStyle = '#14251c';
  c.fillRect(0, WALL_H - 8, W, 8);
  c.fillStyle = '#e8cf7a';
  c.font = 'bold 22px sans-serif';
  c.textAlign = 'center';
  c.fillText('CAMİİ', W / 2, 46);
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(232,207,122,0.7)';
  c.fillText('Huzur ve İbadet Mekanı', W / 2, 70);
}

function drawMihrab(c, hasImam) {
  c.save();
  c.translate(MIHRAB.cx, MIHRAB.cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, MIHRAB.hh + 10, MIHRAB.hw + 20, 14, 0, 0, Math.PI * 2); c.fill();
  // Kemerli mihrap nişi
  c.fillStyle = '#3a2f1d';
  c.beginPath();
  c.moveTo(-MIHRAB.hw, MIHRAB.hh);
  c.lineTo(-MIHRAB.hw, -MIHRAB.hh);
  c.arc(0, -MIHRAB.hh, MIHRAB.hw, Math.PI, 0);
  c.lineTo(MIHRAB.hw, MIHRAB.hh);
  c.closePath();
  c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 2;
  c.stroke();
  c.fillStyle = '#241a10';
  c.beginPath();
  c.moveTo(-MIHRAB.hw + 12, MIHRAB.hh);
  c.lineTo(-MIHRAB.hw + 12, -MIHRAB.hh + 6);
  c.arc(0, -MIHRAB.hh + 6, MIHRAB.hw - 12, Math.PI, 0);
  c.lineTo(MIHRAB.hw - 12, MIHRAB.hh);
  c.closePath();
  c.fill();
  if (!hasImam) {
    c.fillStyle = 'rgba(232,207,122,0.6)';
    c.font = 'bold 10px sans-serif';
    c.textAlign = 'center';
    c.fillText('İMAM YOK', 0, 0);
  }
  c.restore();
}

// Cemaat alanı — "o vakitte ibadet edip şu an orada olmayanlar" (bkz.
// madde 6), useMosqueAttendance'tan gelen gerçek listeyi küçük ikonlarla
// pasif olarak gösteriyoruz (tıklanamaz, sadece görsel roster).
function drawCongregation(c, members, win, getAvatarImage) {
  const areaY = 420;
  c.fillStyle = 'rgba(232,207,122,0.55)';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText(`— ${win}. VAKİT CEMAATİ (${members.length}) —`, W / 2, areaY - 10);
  const maxShown = 8;
  const shown = members.slice(0, maxShown);
  const cols = 4;
  shown.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = W / 2 - ((cols - 1) * 70) / 2 + col * 70;
    const y = areaY + 26 + row * 58;
    drawAvatarSprite(c, {
      x, baseY: y, avatar: m.avatar, pose: 'idle', facing: 'down',
    }, getAvatarImage, { showName: false, scale: 0.55 });
  });
  if (members.length > maxShown) {
    c.fillStyle = 'rgba(232,207,122,0.5)';
    c.font = '10px sans-serif';
    c.fillText(`+${members.length - maxShown} daha`, W / 2, areaY + 26 + Math.ceil(shown.length / cols) * 58 + 6);
  }
}

function drawBeggar(c) {
  c.save();
  c.translate(BEGGAR.cx, BEGGAR.cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, 22, 26, 8, 0, 0, Math.PI * 2); c.fill();
  // Basit bir kase (dilencinin önündeki bağış kabı)
  c.fillStyle = '#5c4a2f';
  c.beginPath(); c.ellipse(0, 18, 12, 5, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 1;
  c.stroke();
  c.restore();
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#1c1c22';
  c.fillRect(-46, -6, 92, 40);
  c.fillStyle = '#2c4f3d';
  c.fillRect(-40, -2, 38, 32);
  c.fillRect(2, -2, 38, 32);
  c.fillStyle = '#e8cf7a';
  c.beginPath(); c.arc(-8, 14, 2.4, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(8, 14, 2.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText('ÇIKIŞ', 0, 46);
  c.restore();
}

// drawMosqueSceneBackground — renderFrame'in statik+canlı-ama-deterministik
// kısmıyla AYNI çizim dizisi, dışa açık (bkz. BankWorldScreen'deki
// drawBankSceneBackground'la aynı gerekçe). imam/members/win burada da
// PARAMETRE olarak veriliyor — kamera fotoğrafı da canlı state'in AYNI
// anlık halini gösterir (rastgele/eski veri yok).
export function drawMosqueSceneBackground(ctx, getAvatarImage, { imam, members, win } = {}) {
  const now = Date.now();
  drawFloor(ctx);
  drawBeggar(ctx);
  drawCongregation(ctx, members || [], win || 1, getAvatarImage);
  drawWalls(ctx);
  drawDoor(ctx);
  drawMihrab(ctx, Boolean(imam));

  AMBIENT_NPCS.forEach((npc) => {
    drawAvatarSprite(ctx, { x: npc.cx, baseY: npc.cy, avatar: npc.avatar, pose: 'idle', facing: 'down' }, getAvatarImage, { showName: false });
  });

  if (imam) {
    drawAvatarSprite(ctx, {
      x: MIHRAB.cx, baseY: MIHRAB.cy - 6, avatar: imam.avatar, pose: 'idle', facing: 'down',
    }, getAvatarImage, { showName: false });
    ctx.fillStyle = 'rgba(20,12,8,0.85)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(imam.displayName || 'İmam', MIHRAB.cx, MIHRAB.cy - SPRITE_H - 44);
    const activity = imamActivity(now);
    ctx.fillStyle = 'rgba(232,207,122,0.85)';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(activity === 'namaz' ? '🕌 Namaz Kıldırıyor' : '📖 Nasihat Veriyor', MIHRAB.cx, MIHRAB.cy - SPRITE_H - 30);
  }
}

export default function MosqueWorldScreen({ onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { imam } = useImamState();
  const { members, window: win } = useMosqueAttendance();

  const [panel, setPanel] = useState(null); // 'imam' | 'beggars' | null
  const [phoneOpen, setPhoneOpen] = useState(false);
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
  const walkAnimRef = useRef(0);
  const poseRef = useRef('idle');
  const playerRef = useRef(null);
  const imamRef = useRef(null);
  const membersRef = useRef([]);
  const winRef = useRef(win);
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { imamRef.current = imam; }, [imam]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { winRef.current = win; }, [win]);

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
          if (action?.type === 'imam') {
            setPanel('imam');
          } else if (action?.type === 'beggar') {
            setPanel('beggars');
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

  // --- Kamera (madde 11/12) — bkz. BankWorldScreen'deki aynı desen.
  function buildCameraEntities() {
    const p = posRef.current;
    const self = {
      dx: 0, dy: 0,
      avatar: playerRef.current?.avatar,
      pose: poseRef.current || 'idle',
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
      drawBackground: (bgCtx) => drawMosqueSceneBackground(bgCtx, getAvatarImage, {
        imam: imamRef.current, members: membersRef.current, win: winRef.current,
      }),
    });
  }

  async function handleShareCamera() {
    setCameraBusy(true);
    setCameraError(null);
    try {
      const frame = cameraFrameRef.current;
      const self = frame?.entities?.[0];
      await createSixtagramPost(cameraCaption, {
        type: 'interiorPhoto', locationId: 'camii',
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

    drawMosqueSceneBackground(ctx, getAvatarImage, {
      imam: imamRef.current, members: membersRef.current, win: winRef.current,
    });

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(30,30,40,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetRef.current.x, targetRef.current.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    const myEntity = {
      x: posRef.current.x, baseY: posRef.current.y,
      avatar: playerRef.current?.avatar, pose: poseRef.current,
      facing: facingRef.current, isSelf: true,
    };
    drawAvatarSprite(ctx, myEntity, getAvatarImage, { showName: false });

    // Konuşma baloncukları — imam (nasihat metni varsa onu döngüyle
    // gösterir, yoksa genel bir davet cümlesi) + ambient NPC'ler (~30sn).
    const bubbleItems = [];
    const curImam = imamRef.current;
    if (curImam) {
      const gaveSermonToday = curImam.lastNasihatAt
        && istanbulDateKey(curImam.lastNasihatAt.toDate?.() ?? new Date(0)) === istanbulDateKey(new Date());
      const imamLines = gaveSermonToday && curImam.lastNasihat
        ? [curImam.lastNasihat]
        : ['Namaza gelin.', 'Cemaatle kılınan namaz daha faziletlidir.'];
      const line = cyclingLine(imamLines, { intervalMs: 30000, phase: 3 });
      if (line) {
        const lines = wrapBubbleText(ctx, line);
        const { w, h } = measureBubble(ctx, lines);
        const anchorY = MIHRAB.cy - SPRITE_H - 50;
        bubbleItems.push({ x: MIHRAB.cx, w, h, lines, ts: 0, naturalTop: anchorY - h });
      }
    }
    AMBIENT_NPCS.forEach((npc, i) => {
      const line = cyclingLine(npc.lines, { intervalMs: 30000, phase: 9 + i * 13 });
      if (!line) return;
      const lines = wrapBubbleText(ctx, line);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = npc.cy - SPRITE_H - 14;
      bubbleItems.push({ x: npc.cx, w, h, lines, ts: i + 1, naturalTop: anchorY - h });
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

    if (dist(p, MIHRAB) < MIHRAB.hw + 30) {
      if (dist(posRef.current, MIHRAB) < INTERACT_RADIUS + MIHRAB.hh) {
        setPanel('imam');
      } else {
        pendingActionRef.current = { type: 'imam' };
        // +85 (Bank/Karakol'daki +46'dan fazla) — mihrap kemeri daha yüksek
        // olduğu için oyuncu yeterince geride dursun, "İMAM YOK"/imam adı
        // yazısıyla kafası çakışmasın (bkz. Bank'ta düzeltilen benzer sorun).
        targetRef.current = { x: MIHRAB.cx, y: MIHRAB.cy + MIHRAB.hh + 85 };
      }
      return;
    }

    if (dist(p, BEGGAR) < BEGGAR.r + 24) {
      if (dist(posRef.current, BEGGAR) < INTERACT_RADIUS) {
        setPanel('beggars');
      } else {
        pendingActionRef.current = { type: 'beggar' };
        targetRef.current = { x: BEGGAR.cx, y: BEGGAR.cy + 56 };
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  if (!user) {
    return (
      <div className="ws-fullscreen" style={{ '--ws-bg': '#241a10' }}>
        <button className="ws-exit-btn" onClick={onExit}>✕</button>
        <p className="ws-hint" style={{ padding: 16, color: '#f2ecdd' }}>Camiye girmek için giriş yapmalısın.</p>
      </div>
    );
  }

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#241a10', '--ws-panel-bg': '#1c1c24' }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
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
            <p className="ws-panel-title">
              {panel === 'imam' ? '🕌 Mihrap — İbadet ve İmam' : '🤲 Cami Girişi — Dilenciler'}
            </p>
            {panel === 'imam' ? (
              <>
                <SimpleActionScreen
                  signInMessage="İbadet etmek için giriş yapmalısın."
                  description={`Günde 5 vakit (${WINDOW_HOURS[win]} şu an ${win}. vakit) ibadet ederek her seferinde şüpheni 5 azaltabilirsin. Ücretsiz.`}
                  buttonLabel="İbadet Et (Şüphe -5)"
                  doneLabel="Bu vakitte zaten ibadet ettin"
                  isDone={(actions) => Boolean(actions.prayedWindows?.[win])}
                  actionFn={prayAtMosque}
                />
                <ImamPanel />
              </>
            ) : (
              <BeggarsSection />
            )}
            <button className="ws-panel-btn" onClick={() => setPanel(null)}>
              {panel === 'imam' ? 'Mihraptan Uzaklaş' : 'Girişten Uzaklaş'}
            </button>
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
