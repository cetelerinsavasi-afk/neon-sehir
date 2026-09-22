import { DEFAULT_AVATAR } from './avatarShapes';
import { roundRectC, drawAvatarSprite } from './canvasWorldKit';

// cityScene.js — RÖPORTAJ (madde 1) "Şehir" mekanı için YENİ bir sahne.
// INTERIOR_BACKGROUNDS'ta (PostAttachment.jsx) hazır bir "genel şehir
// sokağı" sahnesi YOKTU — bu yüzden oyunun genel görsel diline (neon, gece,
// KarakolWorld/BankWorld gibi diğer World ekranlarındaki W=680/H=1180
// world-space, gradient duvarlar, neon renk paleti) uygun, tamamen yeni bir
// `drawCitySceneBackground` yazıldı. Diğer mekanlarla AYNI desende: dışa
// açık, saf Canvas 2D çizim fonksiyonu (React'ten bağımsız), hem canlı bir
// önizleme hem de Sixtagram'daki paylaşılan görsel/video için kullanılabilir.
const W = 680;
const H = 1180;

const BUILDINGS = [
  { x: 0, w: 150, h: 340, base: '#141a2c', sign: '#19e8ff', signLabel: 'NEON MARKET' },
  { x: 150, w: 190, h: 420, base: '#181f36', sign: '#ff2e8c', signLabel: 'GECE KULÜBÜ' },
  { x: 340, w: 160, h: 300, base: '#12172a', sign: '#ffd23f', signLabel: 'DÖNER 7/24' },
  { x: 500, w: 180, h: 380, base: '#161c30', sign: '#19e8ff', signLabel: 'ŞEHİR OTEL' },
];

const STREETLAMPS = [90, 280, 470, 630];

const PEDESTRIAN_NPC = {
  name: 'Yoldan Geçen',
  avatar: {
    ...DEFAULT_AVATAR,
    gender: 'kadin',
    build: 'standart',
    skin: '#c68863',
    hairStyle: 'long',
    hairColor: '#2b1a12',
    clothing: 'vest',
    clothColor: '#3a4468',
    pantsColor: '#12182b',
    background: 'transparent',
  },
};

function drawSky(c) {
  const grd = c.createLinearGradient(0, 0, 0, 420);
  grd.addColorStop(0, '#0a0e1c');
  grd.addColorStop(1, '#171d33');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, 420);
  // Uzak yıldızlar/parıltılar.
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % W;
    const y = (i * 53) % 260;
    c.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.06})`;
    c.fillRect(x, y, 2, 2);
  }
}

function drawBuilding(c, b) {
  c.save();
  c.fillStyle = b.base;
  c.fillRect(b.x, 420 - b.h, b.w, b.h);
  // Pencereler.
  const cols = Math.max(2, Math.floor(b.w / 34));
  const rows = Math.max(3, Math.floor(b.h / 44));
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const wx = b.x + 14 + cx * (b.w - 28) / Math.max(1, cols - 1 || 1);
      const wy = 420 - b.h + 26 + cy * ((b.h - 50) / Math.max(1, rows - 1 || 1));
      const lit = (cx + cy * 3 + b.x) % 5 !== 0;
      c.fillStyle = lit ? 'rgba(255,210,63,0.55)' : 'rgba(255,255,255,0.06)';
      c.fillRect(wx - 6, wy - 7, 12, 14);
    }
  }
  // Çatı neon tabelası.
  c.font = 'bold 13px sans-serif';
  c.textAlign = 'center';
  c.fillStyle = b.sign;
  c.shadowColor = b.sign;
  c.shadowBlur = 14;
  c.fillText(b.signLabel, b.x + b.w / 2, 420 - b.h - 14);
  c.shadowBlur = 0;
  c.restore();
}

function drawStreetlamp(c, x) {
  c.save();
  c.translate(x, 420);
  c.fillStyle = '#1c2136';
  c.fillRect(-3, 0, 6, 90);
  c.beginPath();
  c.moveTo(-3, 0);
  c.lineTo(-18, -14);
  c.lineTo(-10, -14);
  c.lineTo(0, 0);
  c.closePath();
  c.fill();
  const glow = c.createRadialGradient(-14, -16, 2, -14, -16, 34);
  glow.addColorStop(0, 'rgba(255, 226, 150, 0.55)');
  glow.addColorStop(1, 'rgba(255, 226, 150, 0)');
  c.fillStyle = glow;
  c.beginPath();
  c.arc(-14, -16, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ffe296';
  c.beginPath();
  c.arc(-14, -16, 4, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawRoad(c) {
  c.fillStyle = '#20232b';
  c.fillRect(0, 420, W, H - 420);
  // Kaldırım.
  c.fillStyle = '#3a3d47';
  c.fillRect(0, 420, W, 46);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < W; x += 60) c.fillRect(x, 420, 2, 46);
  // Yol şeritleri.
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 6;
  c.setLineDash([34, 26]);
  c.beginPath();
  c.moveTo(W / 2, 500);
  c.lineTo(W / 2, H);
  c.stroke();
  c.setLineDash([]);
  // Yolun ıslak-parlak yansıma hissi.
  const wetGrd = c.createLinearGradient(0, 466, 0, H);
  wetGrd.addColorStop(0, 'rgba(25,232,255,0.05)');
  wetGrd.addColorStop(1, 'rgba(255,46,140,0.03)');
  c.fillStyle = wetGrd;
  c.fillRect(0, 466, W, H - 466);
}

// drawCitySceneBackground — dışa açık: PostAttachment/Interview'daki genel
// `drawXxxSceneBackground(ctx, getAvatarImage)` imzasıyla BİREBİR aynı,
// böylece diğer mekanlarla aynı şekilde çağrılabilir.
export function drawCitySceneBackground(ctx, getAvatarImage) {
  drawSky(ctx);
  BUILDINGS.forEach((b) => drawBuilding(ctx, b));
  drawRoad(ctx);
  STREETLAMPS.forEach((x) => drawStreetlamp(ctx, x));

  drawAvatarSprite(
    ctx,
    { x: 470, baseY: 700, avatar: PEDESTRIAN_NPC.avatar, pose: 'walk1', facing: 'left', name: PEDESTRIAN_NPC.name },
    getAvatarImage,
    { showName: false, scale: 1.1 }
  );

  // Alt köşede küçük bir "ŞEHİR" tabelası (referans: diğer mekanların
  // duvarındaki isim yazısı, bkz. KarakolWorldScreen drawWalls).
  ctx.save();
  ctx.fillStyle = 'rgba(5,7,12,0.55)';
  roundRectC(ctx, 16, H - 60, 150, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#19e8ff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ŞEHİR MERKEZİ', 26, H - 38);
  ctx.restore();
}
