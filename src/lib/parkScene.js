import { AVATAR_FULL_VIEWBOX_H, AVATAR_WAIST_Y } from './avatarShapes';
import {
  roundRectC, createAvatarImageCache, drawAvatarSprite, drawHeldIcon,
  renderPhotoFrame as kitRenderPhotoFrame, SPRITE_ASPECT, SPRITE_H,
} from './canvasWorldKit';

// parkScene.js — Park dünyasının SABİT sahne verisi (bina/eşya konumları)
// ve bunları bir <canvas> üzerine çizen saf fonksiyonlar. Jenerik (mekana
// özel olmayan) çizim/kamera yardımcıları lib/canvasWorldKit.js'te —
// burada sadece Park'a özel sahit veriler (BUFE/TABLES/BENCHES/POND/...)
// ve Park'a özel çizimler (drawWorldLandmarks vb.) var. Bu dosya BİLEREK
// React'ten bağımsız (sadece Canvas 2D API kullanır) — hem ParkWorldScreen
// (canlı dünya + kamera önizlemesi) hem de Sixtagram/PostAttachment
// (paylaşılan fotoğrafın akışta yeniden çizilmesi) aynı fonksiyonları
// kullanır. Böylece "kamera fotoğrafı" her yerde BİREBİR aynı görsel
// dille (gerçek arka plan + gerçek göreli konum) üretilir — ayrı bir
// "SCENE_BG renk paleti" veya rastgele yerleştirme YOK (bkz. madde 12).
//
// Koordinat sistemi: ParkWorldScreen'deki ile birebir aynı world-space
// (canvas piksel uzayı, 0..W / 0..H). Bir kamera karesi bu world-space
// içinde bir "originX,originY" merkezli kırpma penceresidir.

export { roundRectC, createAvatarImageCache, drawAvatarSprite, drawHeldIcon, SPRITE_ASPECT, SPRITE_H };

export const W = 680;
export const H = 1180;

// --- Sahnedeki sabit nesneler --------------------------------------------
export const BUFE = { cx: 340, cy: 180, hw: 90, hh: 50 };

export const TABLES = [
  { id: 'table_left', cx: 140, cy: 300, r: 44 },
  { id: 'table_right', cx: 540, cy: 300, r: 44 },
  { id: 'table_br', cx: 560, cy: 970, r: 44 },
];

export const BENCH_Y_ROAD = 560;
export const BENCHES = [
  { id: 'bench_left', cx: 170, cy: BENCH_Y_ROAD - 55 },
  { id: 'bench_right', cx: 510, cy: BENCH_Y_ROAD - 55 },
];

export const POND = { cx: 520, cy: 760, rx: 70, ry: 46 };

export const NPC_POS = { x: 140, y: 1030 };

export const TREES_LEAFY = [[60, 90], [W - 60, 90], [60, H - 90], [W - 60, H - 90]];
export const TREES_PINE = [[60, 470], [W - 60, 500], [60, 900], [340, 60]];

const TABLE_SEAT_OFFSET = 66;
export function tableSeats(t) {
  return [
    { id: `${t.id}_N`, x: t.cx, y: t.cy - TABLE_SEAT_OFFSET, facing: 'down' },
    { id: `${t.id}_S`, x: t.cx, y: t.cy + TABLE_SEAT_OFFSET, facing: 'up' },
    { id: `${t.id}_E`, x: t.cx + TABLE_SEAT_OFFSET, y: t.cy, facing: 'left' },
    { id: `${t.id}_W`, x: t.cx - TABLE_SEAT_OFFSET, y: t.cy, facing: 'right' },
  ];
}
const SEAT_DX = 30;
export function benchSeats(b) {
  return [
    { id: `${b.id}_A`, x: b.cx - SEAT_DX, y: b.cy - 8, facing: 'down' },
    { id: `${b.id}_B`, x: b.cx + SEAT_DX, y: b.cy - 8, facing: 'down' },
  ];
}
export const ALL_SEATS = [...BENCHES.flatMap(benchSeats), ...TABLES.flatMap(tableSeats)];

export const OBSTACLES = [
  { cx: BUFE.cx, cy: BUFE.cy, hw: BUFE.hw, hh: BUFE.hh },
  ...TABLES.map((t) => ({ cx: t.cx, cy: t.cy, r: t.r + 6 })),
  ...BENCHES.map((b) => ({ cx: b.cx, cy: b.cy, hw: 58, hh: 24 })),
  { cx: POND.cx, cy: POND.cy, r: Math.max(POND.rx, POND.ry) - 4 },
];

export function drawPathSegment(c, x1, y1, x2, y2, width) {
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = '#c9a877';
  c.lineWidth = width;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.strokeStyle = 'rgba(122,90,50,0.3)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.restore();
}

export function drawPond(c, x, y, rx, ry) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#3f5a3a';
  c.beginPath(); c.ellipse(0, 4, rx + 12, ry + 9, 0, 0, Math.PI * 2); c.fill();
  const grd = c.createRadialGradient(-rx * 0.3, -ry * 0.3, 4, 0, 0, Math.max(rx, ry));
  grd.addColorStop(0, '#7fc2d6'); grd.addColorStop(1, '#2f6b82');
  c.fillStyle = grd;
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1f4a58'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.4, ry * 0.22, 0.3, 0, Math.PI * 2); c.stroke();
  c.restore();
}

export function drawTree(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.24)';
  c.beginPath(); c.ellipse(0, 46, 38, 13, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5a3a22';
  roundRectC(c, -9, -8, 18, 54, 4); c.fill();
  const leafColors = ['#2f6b3f', '#357a46', '#2a5c37'];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    c.fillStyle = leafColors[i % leafColors.length];
    c.beginPath();
    c.ellipse(Math.cos(ang) * 21, -40 + Math.sin(ang) * 17, 25, 21, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#357a46';
  c.beginPath(); c.ellipse(0, -44, 31, 25, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

export function drawPineTree(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.24)';
  c.beginPath(); c.ellipse(0, 10, 30, 10, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#4a2e18';
  c.fillRect(-7, -12, 14, 24);
  const tiers = [
    { y: -14, w: 52, h: 34, color: '#1f4f2e' },
    { y: -42, w: 42, h: 30, color: '#245a35' },
    { y: -66, w: 32, h: 26, color: '#2a6a3d' },
  ];
  tiers.forEach((tr) => {
    c.fillStyle = tr.color;
    c.beginPath();
    c.moveTo(0, tr.y - tr.h);
    c.lineTo(tr.w / 2, tr.y);
    c.lineTo(-tr.w / 2, tr.y);
    c.closePath();
    c.fill();
  });
  c.restore();
}

export function drawBufeStatic(c) {
  const { cx, cy, hw, hh } = BUFE;
  c.save();
  c.translate(cx, cy);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(0, hh + 6, hw + 6, 14, 0, 0, Math.PI * 2); c.fill();
  const grd = c.createLinearGradient(0, -hh, 0, hh);
  grd.addColorStop(0, '#8a5a34'); grd.addColorStop(1, '#6b4226');
  c.fillStyle = grd;
  roundRectC(c, -hw, -4, hw * 2, hh + 4, 6); c.fill();
  c.strokeStyle = '#3f2717'; c.lineWidth = 2;
  roundRectC(c, -hw, -4, hw * 2, hh + 4, 6); c.stroke();
  c.fillStyle = '#c9a877';
  roundRectC(c, -hw - 4, -12, hw * 2 + 8, 12, 4); c.fill();
  c.fillStyle = '#5a3a22';
  c.fillRect(-hw + 4, -52, 8, 42);
  c.fillRect(hw - 12, -52, 8, 42);
  c.fillStyle = '#c9432b';
  c.beginPath();
  c.moveTo(-hw - 14, -46); c.lineTo(hw + 14, -46); c.lineTo(hw, -70); c.lineTo(-hw, -70);
  c.closePath(); c.fill();
  for (let i = -hw; i < hw; i += 24) {
    c.fillStyle = (Math.floor((i + hw) / 24) % 2 === 0) ? '#e8e6df' : '#c9432b';
    c.beginPath();
    c.moveTo(i, -46); c.lineTo(i + 24, -46); c.lineTo(i + 12, -38);
    c.closePath(); c.fill();
  }
  c.fillStyle = '#2b1b12';
  roundRectC(c, -46, -30, 92, 18, 3); c.fill();
  c.fillStyle = '#f4e6d0';
  c.font = 'bold 12px sans-serif';
  c.textAlign = 'center';
  c.fillText('BÜFE', 0, -17);
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

export function drawTable(c, t) {
  const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
  dirs.forEach((d) => {
    const cx = t.cx + d.dx * (t.r + 22);
    const cy = t.cy + d.dy * (t.r + 22);
    c.save();
    c.translate(cx, cy);
    c.rotate(Math.atan2(t.cy - cy, t.cx - cx));
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(0, 4, 13, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a3a22';
    roundRectC(c, -12, -11, 11, 22, 3); c.fill();
    c.fillStyle = '#8a5a34';
    roundRectC(c, -2, -10, 14, 20, 3); c.fill();
    c.restore();
  });
  c.save();
  c.translate(t.cx, t.cy);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(0, 5, t.r + 4, t.r * 0.5, 0, 0, Math.PI * 2); c.fill();
  const grd = c.createRadialGradient(-t.r * 0.3, -t.r * 0.3, 4, 0, 0, t.r);
  grd.addColorStop(0, '#dba05c'); grd.addColorStop(1, '#b4753f');
  c.fillStyle = grd;
  c.beginPath(); c.arc(0, 0, t.r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#6b4226'; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, t.r, 0, Math.PI * 2); c.stroke();
  c.restore();
}

export function drawBench(c, b) {
  c.save();
  c.translate(b.cx, b.cy);
  const HW = 58, HH = 20;
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(0, HH + 8, HW + 10, 12, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#4a2e18';
  c.fillRect(-HW + 6, -2, 8, 24);
  c.fillRect(HW - 14, -2, 8, 24);
  c.fillStyle = '#8a5a34';
  for (let i = -HW + 4; i < HW - 4; i += 13) { roundRectC(c, i, -30, 9, 30, 2); c.fill(); }
  c.strokeStyle = '#3f2717'; c.lineWidth = 1.5;
  for (let i = -HW + 4; i < HW - 4; i += 13) { roundRectC(c, i, -30, 9, 30, 2); c.stroke(); }
  for (let row = 0; row < 3; row++) {
    const yy = -4 + row * 7;
    c.fillStyle = row % 2 === 0 ? '#a9772e' : '#96682a';
    roundRectC(c, -HW, yy, HW * 2, 6, 2); c.fill();
    c.strokeStyle = '#3f2717'; c.lineWidth = 1;
    roundRectC(c, -HW, yy, HW * 2, 6, 2); c.stroke();
  }
  c.restore();
}

// drawWorldLandmarks — çim + patika ağı + çit + gölet + ağaçlar + büfe +
// masalar + banklar. World-space'te (0..W, 0..H) SABİT konumlarda çizer.
// Hem tam park sahnesi (buildStaticScene) hem de bir kamera karesinin
// kırpılmış arka planı (renderPhotoFrame, translate edilmiş ctx ile)
// TARAFINDAN ÇAĞRILIR — böylece "büfenin yanındaysam büfe de fotoğrafta
// çıksın" isteği otomatik olarak sağlanır: fotoğraf, gerçek dünyanın o
// bölgesinin BİREBİR aynı çizimidir, ayrı bir "poster" değil.
export function drawWorldLandmarks(c) {
  c.fillStyle = '#2e5a34';
  c.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 46) {
    c.fillStyle = (Math.floor(y / 46) % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)';
    c.fillRect(0, y, W, 46);
  }

  drawPathSegment(c, BUFE.cx, BUFE.cy + BUFE.hh + 10, BUFE.cx, 1080, 50);
  drawPathSegment(c, TABLES[0].cx, TABLES[0].cy, TABLES[1].cx, TABLES[1].cy, 44);
  drawPathSegment(c, 150, BENCH_Y_ROAD, 530, BENCH_Y_ROAD, 44);
  drawPathSegment(c, BUFE.cx, 900, TABLES[2].cx, TABLES[2].cy - 6, 44);
  drawPathSegment(c, BUFE.cx, 1030, NPC_POS.x + 10, NPC_POS.y, 44);

  c.fillStyle = '#7a5a34';
  for (let x = 14; x < W; x += 26) {
    c.fillRect(x, 8, 10, 26);
    c.fillRect(x, H - 34, 10, 26);
  }
  for (let y = 14; y < H; y += 26) {
    c.fillRect(8, y, 10, 26);
    c.fillRect(W - 18, y, 10, 26);
  }

  drawPond(c, POND.cx, POND.cy, POND.rx, POND.ry);

  TREES_LEAFY.forEach(([x, y]) => drawTree(c, x, y));
  TREES_PINE.forEach(([x, y]) => drawPineTree(c, x, y));

  drawBufeStatic(c);
  TABLES.forEach((t) => drawTable(c, t));
  BENCHES.forEach((b) => drawBench(c, b));
}

export function buildStaticScene(sctx) {
  drawWorldLandmarks(sctx);
  sctx.save();
  const vg = sctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.32)');
  sctx.fillStyle = vg;
  sctx.fillRect(0, 0, W, H);
  sctx.restore();
}

// --- Kamera karesi -------------------------------------------------------
// renderPhotoFrame — Park'a özel ince sarmalayıcı: arka planı
// drawWorldLandmarks ile çizer, geri kalan (kırpma/dizilim/vignette)
// lib/canvasWorldKit.js'teki jenerik renderPhotoFrame'den gelir. Oturma
// pozu kaydırması burada hesaplanıp `sitShift` olarak geçiriliyor —
// ParkWorldScreen'in canlı render'ıyla BİREBİR aynı oran.
export function renderPhotoFrame(ctx, { width, height, originX, originY, entities, getAvatarImage }) {
  const withSitShift = entities.map((e) => ({
    ...e,
    sitShift: e.pose === 'sit'
      ? (SPRITE_H * (AVATAR_FULL_VIEWBOX_H - AVATAR_WAIST_Y)) / AVATAR_FULL_VIEWBOX_H
      : 0,
  }));
  kitRenderPhotoFrame(ctx, {
    width, height, originX, originY, entities: withSitShift, getAvatarImage,
    drawBackground: drawWorldLandmarks,
  });
}
