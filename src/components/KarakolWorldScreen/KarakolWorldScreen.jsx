import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import {
  roundRectC, drawAvatarSprite, createAvatarImageCache, renderPhotoFrame,
  wrapBubbleText, measureBubble, layoutBubbles, drawBubbleBox,
  resolveObstaclePosition, cyclingLine, SPRITE_H,
} from '../../lib/canvasWorldKit';
import Hud from '../Hud/Hud';
import PhoneScreen from '../Phone/PhoneScreen';
import PoliceStationScreen from '../PoliceStationScreen/PoliceStationScreen';
import { createSixtagramPost } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';
import './KarakolWorldScreen.css';

// --- Karakol içi (madde 5) --------------------------------------------------
// Bank'takiyle BİREBİR aynı iskelet (canvasWorldKit + worldScreenChrome) —
// tek oyunculu (bkz. BankWorldScreen'deki aynı not: canlı çoklu oyuncu için
// ayrı bir Firestore/presence altyapısı gerekir, bilerek bu ilk sürüme dahil
// edilmedi). Karakol'da SADECE istenen iki istasyon var: girişte
// rüşvet alan bir memur, içeride başvuru işleyen bir komiser — Bank'taki
// numaratör/sıra sistemi gibi burada istenmeyen ekstra bir mekanik
// eklenmedi (gereksiz kod/karmaşıklık katmamak için).
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;

const OFFICER = { cx: 340, cy: 760, r: 30 };
const OFFICER_NPC = {
  name: 'Memur Kemal',
  lines: ['Dur bakalım!', 'Şüphen çoksa rüşvet işini hallederiz.', 'Kimlik kontrolü rutin.', 'Güvenli günler.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#c68863',
    hairStyle: 'short', hairColor: '#0d0a08', clothing: 'police', clothColor: '#1a2a4a',
    hat: 'policecap', hatColor: '#12213d', pantsColor: '#12213d', background: 'transparent',
  },
};

const COMMISSIONER_DESK = { cx: 340, cy: 300, hw: 74, hh: 30 };
const COMMISSIONER_NPC = {
  name: 'Komiser Yusuf',
  lines: ['Başvurunu değerlendiririm.', 'Kitapçığı okumadan imza atma.', 'Teşkilat disiplin ister.', 'Buyurun, dinliyorum.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'standart', skin: '#8d5524',
    hairStyle: 'slick', hairColor: '#0d0a08', facialHair: 'mustache',
    clothing: 'police', clothColor: '#2b3550', neckAcc: 'tie', pantsColor: '#0d0d0d',
    hat: 'none', background: 'transparent',
  },
};

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };
// OFİS_LINE — komiserin odasını görsel olarak ayıran alçak bölme (fiziksel
// çarpışma yok, sadece "burası ayrı bir oda" hissi için, bkz. drawOfficeLine).
const OFFICE_LINE_Y = 470;

const OBSTACLES = [
  { cx: OFFICER.cx, cy: OFFICER.cy, r: OFFICER.r },
  { cx: COMMISSIONER_DESK.cx, cy: COMMISSIONER_DESK.cy, hw: COMMISSIONER_DESK.hw, hh: COMMISSIONER_DESK.hh },
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

function drawFloor(c) {
  c.fillStyle = '#26262c';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,0.04)';
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
  grd.addColorStop(0, '#1a2138');
  grd.addColorStop(1, '#232c4a');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H);
  c.fillStyle = '#12182b';
  c.fillRect(0, WALL_H - 8, W, 8);
  c.fillStyle = '#e8cf7a';
  c.font = 'bold 22px sans-serif';
  c.textAlign = 'center';
  c.fillText('KARAKOL', W / 2, 46);
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(232,207,122,0.7)';
  c.fillText('Huzur ve Güvenlik Şubesi', W / 2, 70);
}

// Komiser odasını lobiden ayıran alçak, kesikli bölme çizgisi — sadece
// görsel, fiziksel engel yok (kod/karmaşıklık tasarrufu).
function drawOfficeLine(c) {
  c.save();
  c.strokeStyle = 'rgba(232,207,122,0.35)';
  c.lineWidth = 3;
  c.setLineDash([14, 10]);
  c.beginPath();
  c.moveTo(60, OFFICE_LINE_Y);
  c.lineTo(W - 60, OFFICE_LINE_Y);
  c.stroke();
  c.restore();
  c.fillStyle = 'rgba(232,207,122,0.55)';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText('— KOMİSER OFİSİ —', W / 2, OFFICE_LINE_Y - 8);
}

function drawDesk(c, d, label) {
  c.save();
  c.translate(d.cx, d.cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, d.hh + 8, d.hw + 6, 12, 0, 0, Math.PI * 2); c.fill();
  const grd = c.createLinearGradient(0, -d.hh, 0, d.hh);
  grd.addColorStop(0, '#3a3f4f'); grd.addColorStop(1, '#23262f');
  c.fillStyle = grd;
  roundRectC(c, -d.hw, -d.hh, d.hw * 2, d.hh * 2, 6); c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 1.5;
  roundRectC(c, -d.hw, -d.hh, d.hw * 2, d.hh * 2, 6); c.stroke();
  c.fillStyle = '#12241c';
  roundRectC(c, -40, -d.hh - 14, 80, 16, 3); c.fill();
  c.fillStyle = '#e8cf7a';
  c.font = 'bold 9px sans-serif';
  c.textAlign = 'center';
  c.fillText(label, 0, -d.hh - 3);
  c.restore();
}

function drawJailCell(c) {
  // Sağ alt köşede sade bir hücre siluetti — sadece atmosfer için, birkaç
  // çizgiden ibaret (etkileşimsiz, kolisyonsuz).
  c.save();
  c.translate(W - 96, H - 210);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(-64, -70, 128, 140);
  c.strokeStyle = 'rgba(232,207,122,0.4)';
  c.lineWidth = 2;
  for (let i = -56; i <= 56; i += 16) {
    c.beginPath(); c.moveTo(i, -66); c.lineTo(i, 66); c.stroke();
  }
  c.fillStyle = 'rgba(232,207,122,0.55)';
  c.font = 'bold 9px sans-serif';
  c.textAlign = 'center';
  c.fillText('NEZARETHANE', 0, 84);
  c.restore();
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#1c1c22';
  c.fillRect(-46, -6, 92, 40);
  c.fillStyle = '#3a4468';
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

// drawKarakolSceneBackground — renderFrame'in statik kısmıyla AYNI çizim
// dizisi, dışa açık (bkz. BankWorldScreen'deki drawBankSceneBackground'la
// aynı gerekçe) — kamera fotoğrafı VE Sixtagram akışı bunu kullanır.
export function drawKarakolSceneBackground(ctx, getAvatarImage) {
  drawFloor(ctx);
  drawJailCell(ctx);
  drawOfficeLine(ctx);
  drawWalls(ctx);
  drawDoor(ctx);
  drawDesk(ctx, COMMISSIONER_DESK, 'KOMİSER');

  drawAvatarSprite(ctx, {
    x: OFFICER.cx, baseY: OFFICER.cy, avatar: OFFICER_NPC.avatar, pose: 'idle', facing: 'down', name: OFFICER_NPC.name,
  }, getAvatarImage, { showName: false });
  ctx.fillStyle = 'rgba(20,12,8,0.8)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(OFFICER_NPC.name, OFFICER.cx, OFFICER.cy - SPRITE_H - 14);

  drawAvatarSprite(ctx, {
    x: COMMISSIONER_DESK.cx, baseY: COMMISSIONER_DESK.cy - COMMISSIONER_DESK.hh - 30,
    avatar: COMMISSIONER_NPC.avatar, pose: 'idle', facing: 'down', name: COMMISSIONER_NPC.name,
  }, getAvatarImage, { showName: false });
  ctx.fillText(COMMISSIONER_NPC.name, COMMISSIONER_DESK.cx, COMMISSIONER_DESK.cy - COMMISSIONER_DESK.hh - 60);
}

export default function KarakolWorldScreen({ onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();

  const [panel, setPanel] = useState(null); // 'bribe' | 'application' | null
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
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));

  useEffect(() => { playerRef.current = player; }, [player]);

  function getAvatarImage(avatar, pose) {
    return getAvatarImageRef.current(avatar, pose);
  }

  // --- Ana döngü: hareket + çizim (Firestore yok — tek oyunculu) --------
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
          if (action?.type === 'officer') {
            setPanel('bribe');
          } else if (action?.type === 'commissioner') {
            setPanel('application');
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
      drawBackground: (bgCtx) => drawKarakolSceneBackground(bgCtx, getAvatarImage),
    });
  }

  async function handleShareCamera() {
    setCameraBusy(true);
    setCameraError(null);
    try {
      const frame = cameraFrameRef.current;
      const self = frame?.entities?.[0];
      await createSixtagramPost(cameraCaption, {
        type: 'interiorPhoto', locationId: 'karakol',
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

    drawKarakolSceneBackground(ctx, getAvatarImage);

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

    // NPC konuşma baloncukları
    const bubbleItems = [];
    const officerLine = cyclingLine(OFFICER_NPC.lines, { phase: 0 });
    if (officerLine) {
      const lines = wrapBubbleText(ctx, officerLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = OFFICER.cy - SPRITE_H - 20;
      bubbleItems.push({ x: OFFICER.cx, w, h, lines, ts: 0, naturalTop: anchorY - h });
    }
    const commissionerLine = cyclingLine(COMMISSIONER_NPC.lines, { phase: 11 });
    if (commissionerLine) {
      const lines = wrapBubbleText(ctx, commissionerLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = COMMISSIONER_DESK.cy - COMMISSIONER_DESK.hh - 30 - SPRITE_H - 10;
      bubbleItems.push({ x: COMMISSIONER_DESK.cx, w, h, lines, ts: 1, naturalTop: anchorY - h });
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

  function handleCanvasClick(e) {
    const p = pointerToCanvas(e);

    if (dist(p, OFFICER) < OFFICER.r + 24) {
      if (dist(posRef.current, OFFICER) < INTERACT_RADIUS) {
        setPanel('bribe');
      } else {
        pendingActionRef.current = { type: 'officer' };
        targetRef.current = { x: OFFICER.cx, y: OFFICER.cy + 56 };
      }
      return;
    }

    if (dist(p, COMMISSIONER_DESK) < COMMISSIONER_DESK.hw + 30) {
      if (dist(posRef.current, COMMISSIONER_DESK) < INTERACT_RADIUS + COMMISSIONER_DESK.hh) {
        setPanel('application');
      } else {
        pendingActionRef.current = { type: 'commissioner' };
        targetRef.current = { x: COMMISSIONER_DESK.cx, y: COMMISSIONER_DESK.cy + COMMISSIONER_DESK.hh + 46 };
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  if (!user) {
    return (
      <div className="ws-fullscreen" style={{ '--ws-bg': '#26262c' }}>
        <button className="ws-exit-btn" onClick={onExit}>✕</button>
        <p className="ws-hint" style={{ padding: 16, color: '#f2ecdd' }}>Karakola girmek için giriş yapmalısın.</p>
      </div>
    );
  }

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#26262c', '--ws-panel-bg': '#1c1c24' }}>
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
              {panel === 'bribe' ? '👮 Karakol Girişi — Memur' : '🎖️ Komiser Ofisi'}
            </p>
            <PoliceStationScreen mode={panel} />
            <button className="ws-panel-btn" onClick={() => setPanel(null)}>
              {panel === 'bribe' ? 'Memurdan Uzaklaş' : 'Ofisten Çık'}
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
