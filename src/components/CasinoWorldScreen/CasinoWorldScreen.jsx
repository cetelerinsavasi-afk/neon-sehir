import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInteriorPresence } from '../../hooks/useInteriorPresence';
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
import OnNumaraTable from '../OnNumaraScreen/OnNumaraTable';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { buyFromGazinoBar, createSixtagramPost, enterInterior } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';
import './CasinoWorldScreen.css';

// --- Gazino içi (madde 15 revizyonu + madde 17 canlı/çok oyunculu) --------
// Kullanıcının başka bir Claude oturumuna hazırlattığı referans örneğe göre
// yeniden düzenlendi: üstte şişe duvarlı bar + taburelerdeki dizilim, sol
// üstte piyango standı, ortada TEK keçeli (kadife yeşil) 10 Numara masası,
// altta slot makineleri sırası — referanstaki 600×960 portre yerleşimin
// 680×1180'e uyarlanmış hali. Zemin de referanstaki bordo dama+baklava
// desenine yakınlaştırıldı. Piyango/slot/10 Numara'nın TÜM iş mantığı
// zaten mevcut ekranlarda (LotteryScreen/SlotScreen/OnNumaraScreen) —
// burada sadece istasyon çizimi/yönlendirme değişti. Sıradan (kumarsız)
// oturma sandalyeleri referansta yer almadığı için kaldırıldı (madde 15:
// "bölümlerin konumu ... attığım örnektekine yakın olsun").
// Yeni istek ("on numara masası 1 adet olsun, piyango ve bar bölümü de az
// aşağı kayabilsin, barmen düzelsin, piyango satıcısı sandalyede otursun"):
// eskiden 2 adet 10 Numara masası vardı; artık TEK masa var, boşalan dikey
// alan BAR ve PİYANGO bölümlerini aşağı kaydırmak için kullanıldı — bu da
// barı tavana yakın dar nişten kurtarıp barmenin tam boyda ve tezgahın
// ARKASINDA (üstünde değil) durmasını sağladı (bkz. BARTENDER_BASE_Y/
// BARTENDER_SCALE). Piyango biletçisi artık gerçek bir taburede
// (drawTicketStool) standın hemen arkasında oturuyor (bkz. PIYANGO_SEAT).
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;
const HOLDING_MS = 120_000; // Park büfesiyle aynı süre (bkz. ParkWorldScreen)

// AVATAR_SCALE (madde 13, ve yeni istek: "genel olarak avatarları ...
// büyütelim") — bkz. BankWorldScreen'deki aynı gerekçe.
const AVATAR_SCALE = 1.42;

// BAR — üstte, referanstaki gibi giriş banner'ının hemen altında, arkasında
// şişe duvarı ve önünde taburelerle. y1/y2 — yeni istek üzerine ("barmenin
// boyunu küçültmüşsün ... masanın üstünde gibi duruyor") AŞAĞI kaydırıldı:
// tek 10 Numara masasına inilince boşalan dikey alan burada ve PİYANGO
// bölümünde kullanılıyor, böylece barmen artık tam boyda (BARTENDER_SCALE
// kaldırıldı, aşağıda) çizilebiliyor.
const BAR = { x1: 120, y1: 290, x2: 560, y2: 330, cx: 340, cy: 310, hw: 220, hh: 20 };
// BAR_STOOLS — yeni istek (madde 3): "gazinodaki bar sandalyelerine
// oturulabilsin" — artık id'li, tıklanabilir/oturulabilir taburelerdir
// (bkz. STOOL_R, handleCanvasClick, sittingSeatId).
const BAR_STOOLS = [190, 290, 390, 490].map((x, i) => ({ id: `stool_${i}`, x, y: BAR.y2 + 22 }));
const STOOL_R = 18;
// BARTENDER_SCALE — eskiden bar tavana çok yakındı (dar bir niş) ve barmen
// bu yüzden küçültülmüştü; bu da onu tezgahın İÇİNDE/ÜSTÜNDE duruyormuş
// gibi gösteriyordu (bkz. madde: "barmen ... masanın üstünde gibi
// duruyor"). BAR aşağı kaydırılınca niş yeterince uzadı — artık diğer tüm
// NPC'lerle aynı AVATAR_SCALE kullanılıyor, küçültme YOK.
const BARTENDER_SCALE = AVATAR_SCALE;
// BARTENDER_BASE_Y — barmenin ayak noktası artık tezgahın ARKA kenarının
// (BAR.y1) hemen gerisinde — tezgahın İÇİNDE/üstünde değil, tezgahın
// gerisinde duruyormuş gibi.
const BARTENDER_BASE_Y = BAR.y1 - 10;
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

// PIYANGO — sol üstte, referanstaki gibi bar/masaların yanında ayrı bir
// köşe stant. y1/y2 — BAR ile aynı gerekçeyle (madde: "piyango ... az
// aşağı kayabilsin") tek 10 Numara masasının boşalttığı alanı kullanarak
// aşağı kaydırıldı.
const PIYANGO = { x1: 40, y1: 520, x2: 190, y2: 592, cx: 115, cy: 556, hw: 75, hh: 36 };
// PIYANGO_SEAT/PIYANGO_SIT_SHIFT — yeni istek: "piyango bilet satıcısı
// sandalyede otursun". pose:'sit' sadece bacakları kısaltır (bkz.
// avatarShapes.js SIT_LEG_H); baseY düzeltmesi yapılmazsa karakter
// sandalyenin epey üstünde havada duruyormuş gibi görünür — bar
// taburelerinde oturan OYUNCU için zaten kullanılan aynı telafi (bkz.
// renderFrame'deki `SPRITE_H * AVATAR_SCALE * 0.32` payı) burada da
// uygulanıyor, böylece görünür gövde tam sandalyenin üstüne oturuyor.
const PIYANGO_SIT_SHIFT = SPRITE_H * AVATAR_SCALE * 0.32;
const PIYANGO_SEAT = { cx: PIYANGO.cx, cy: PIYANGO.y1 - 60 };
const PIYANGO_BASE_Y = PIYANGO_SEAT.cy + PIYANGO_SIT_SHIFT;
const PIYANGO_NPC = {
  name: 'Biletçi Fatma',
  lines: ['Bugün şansın açık olabilir!', 'Bilet al, kura seni seçsin.', 'Büyük ikramiye bekliyor.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'kadin', build: 'standart', skin: '#e0ac69',
    hairStyle: 'ponytail', hairColor: '#7a1f2b', clothing: 'vest', clothColor: '#7a1f2b',
    neckAcc: 'none', pantsColor: '#22262f', background: 'transparent',
  },
};

// TABLES_10NUMARA — yeni istek: "on numara masası 1 adet olsun" — eskiden
// alt alta 2 masaydı, artık ortada tek masa (boşalan dikey alan BAR ve
// PİYANGO bölümlerini aşağı kaydırmak için kullanıldı, bkz. yukarısı).
const TABLES_10NUMARA = [
  { id: 'onnumara1', cx: 340, cy: 698, hw: 130, hh: 40 },
];

// SLOTS — altta, girişe yakın sıra (referanstaki gibi).
const SLOTS = [
  { id: 'slot1', cx: 170, cy: 850 },
  { id: 'slot2', cx: 340, cy: 850 },
  { id: 'slot3', cx: 510, cy: 850 },
];
const SLOT_HW = 30;
const SLOT_HH = 46;

// GUVENLIK — madde 12: gazinoda tam 1 güvenlik NPC'si, slot sırasının
// yanında sabit duruyor.
const GUVENLIK = { cx: 620, cy: 850 };
const GUVENLIK_NPC = {
  name: 'Güvenlik',
  lines: ['Her şey kontrol altında.', 'Lütfen düzeni koruyalım.', 'İyi akşamlar.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#f1c27d',
    hairStyle: 'short', hairColor: '#0d0a08', clothing: 'suit', clothColor: '#141821',
    neckAcc: 'tie', pantsColor: '#0d0d0d', background: 'transparent',
  },
};

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

const OBSTACLES = [
  { cx: BAR.cx, cy: BAR.cy, hw: BAR.hw, hh: BAR.hh },
  { cx: PIYANGO.cx, cy: PIYANGO.cy, hw: PIYANGO.hw, hh: PIYANGO.hh },
  ...TABLES_10NUMARA.map((t) => ({ cx: t.cx, cy: t.cy, hw: t.hw, hh: t.hh })),
  ...SLOTS.map((s) => ({ cx: s.cx, cy: s.cy, hw: SLOT_HW, hh: SLOT_HH })),
  ...BAR_STOOLS.map((s) => ({ cx: s.x, cy: s.y, r: STOOL_R })),
  { cx: GUVENLIK.cx, cy: GUVENLIK.cy, r: 26 },
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

// drawFloor — madde 15: referanstaki bordo dama + soluk altın baklava
// (diamond cross-hatch) zemin deseni.
function drawFloor(c) {
  c.fillStyle = '#3a1420';
  c.fillRect(0, 0, W, H);
  for (let y = 24; y < H - 24; y += 48) {
    for (let x = 24; x < W - 24; x += 48) {
      c.fillStyle = ((Math.floor(x / 48) + Math.floor(y / 48)) % 2 === 0) ? '#421828' : '#3a1420';
      c.fillRect(x, y, 48, 48);
    }
  }
  c.strokeStyle = 'rgba(201,162,39,0.10)';
  c.lineWidth = 1;
  for (let y = 24; y < H - 24; y += 48) {
    for (let x = 24; x < W - 24; x += 48) {
      c.beginPath();
      c.moveTo(x + 24, y); c.lineTo(x + 48, y + 24); c.lineTo(x + 24, y + 48); c.lineTo(x, y + 24);
      c.closePath(); c.stroke();
    }
  }
}

const WALL_H = 150;

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

// drawBottleWall — barın arkasındaki renkli şişe duvarı (referanstaki
// drawBarAndStools'un üst kısmıyla aynı çizim dili).
function drawBottleWall(c) {
  c.fillStyle = '#241014';
  c.fillRect(BAR.x1, WALL_H, BAR.x2 - BAR.x1, BAR.y1 - WALL_H);
  const colors = ['#7a1f1f', '#1f5c34', '#c9a227', '#2b2b6b', '#7a1f1f', '#c9a227', '#1f5c34', '#2b2b6b'];
  const n = 10;
  const stepW = (BAR.x2 - BAR.x1 - 20) / n;
  for (let i = 0; i < n; i += 1) {
    c.fillStyle = colors[i % colors.length];
    c.fillRect(BAR.x1 + 10 + i * stepW, WALL_H + 6, stepW * 0.6, BAR.y1 - WALL_H - 12);
  }
}

function drawBarAndStools(c) {
  BAR_STOOLS.forEach((s) => {
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(s.x, s.y + 12, 15, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7a1f1f';
    c.beginPath(); c.arc(s.x, s.y, 13, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#c9a227'; c.lineWidth = 1.8;
    c.beginPath(); c.arc(s.x, s.y, 13, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#3a1e14'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(s.x, s.y + 11); c.lineTo(s.x, s.y + 28); c.stroke();
  });

  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(BAR.x1 - 6, BAR.y1 + 6, BAR.x2 - BAR.x1 + 12, BAR.y2 - BAR.y1 + 4);
  c.fillStyle = '#3a1e14';
  roundRectC(c, BAR.x1, BAR.y1, BAR.x2 - BAR.x1, BAR.y2 - BAR.y1, 8); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 2.5;
  roundRectC(c, BAR.x1, BAR.y1, BAR.x2 - BAR.x1, BAR.y2 - BAR.y1, 8); c.stroke();
  c.fillStyle = '#5a3222';
  c.fillRect(BAR.x1 + 8, BAR.y1 + 4, BAR.x2 - BAR.x1 - 16, 8);
  c.font = 'bold 12px sans-serif';
  c.fillStyle = '#f3d99b';
  c.textAlign = 'center';
  c.fillText('BAR', (BAR.x1 + BAR.x2) / 2, BAR.y2 + 34);
}

function drawPiyangoStand(c) {
  const p = PIYANGO;
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(p.x1 - 4, p.y1 + 6, p.x2 - p.x1 + 8, p.y2 - p.y1 + 4);
  c.fillStyle = '#3a1e14';
  roundRectC(c, p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1, 6); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 2;
  roundRectC(c, p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1, 6); c.stroke();
  for (let i = 0; i < 5; i += 1) {
    c.beginPath();
    c.moveTo(p.x1 + i * (p.x2 - p.x1) / 5, p.y1 - 16);
    c.lineTo(p.x1 + (i + 1) * (p.x2 - p.x1) / 5, p.y1 - 16);
    c.lineTo(p.x1 + (i + 1) * (p.x2 - p.x1) / 5 - 4, p.y1);
    c.lineTo(p.x1 + i * (p.x2 - p.x1) / 5 + 4, p.y1);
    c.closePath();
    c.fillStyle = i % 2 === 0 ? '#c9a227' : '#7a1f1f';
    c.fill();
  }
  c.fillStyle = '#f3ecd8';
  for (let i = 0; i < 3; i += 1) {
    c.fillRect(p.x1 + 12 + i * 16, p.y1 + 10, 11, 18);
  }
  c.font = 'bold 11px sans-serif';
  c.fillStyle = '#f3d99b';
  c.textAlign = 'center';
  c.fillText('PİYANGO', p.cx, p.y1 - 22);
}

// drawFeltTable — referanstaki keçeli (kadife yeşil) oval masa çizimi.
function drawFeltTable(c, t, label) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.22)';
  roundRectC(c, t.cx - t.hw - 4, t.cy - t.hh + 6, t.hw * 2 + 8, t.hh * 2 + 8, t.hh); c.fill();
  c.fillStyle = '#1f5c34';
  roundRectC(c, t.cx - t.hw, t.cy - t.hh, t.hw * 2, t.hh * 2, t.hh); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 3;
  roundRectC(c, t.cx - t.hw, t.cy - t.hh, t.hw * 2, t.hh * 2, t.hh); c.stroke();
  c.strokeStyle = 'rgba(243,217,155,0.4)'; c.lineWidth = 1.5;
  roundRectC(c, t.cx - t.hw + 10, t.cy - t.hh + 10, t.hw * 2 - 20, t.hh * 2 - 20, Math.max(0, t.hh - 10)); c.stroke();
  c.fillStyle = '#f3ecd8';
  for (let i = -1; i <= 1; i += 1) {
    c.save();
    c.translate(t.cx + i * 28, t.cy + 3);
    c.rotate(i * 0.15);
    roundRectC(c, -9, -12, 18, 24, 3); c.fill();
    c.strokeStyle = '#2b2b2f'; c.lineWidth = 1;
    roundRectC(c, -9, -12, 18, 24, 3); c.stroke();
    c.restore();
  }
  c.font = 'bold 12px sans-serif';
  c.fillStyle = '#f3d99b';
  c.textAlign = 'center';
  c.fillText(label, t.cx, t.cy - t.hh - 12);
  c.restore();
}

// drawSlotMachine — referanstaki kollu makine çizimi.
function drawSlotMachine(c, cx, cy) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(cx, cy + 34, 27, 9, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#7a1f1f';
  roundRectC(c, cx - SLOT_HW, cy - SLOT_HH, SLOT_HW * 2, SLOT_HH * 2 - 12, 7); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 2;
  roundRectC(c, cx - SLOT_HW, cy - SLOT_HH, SLOT_HW * 2, SLOT_HH * 2 - 12, 7); c.stroke();
  c.fillStyle = '#141416';
  roundRectC(c, cx - 20, cy - SLOT_HH + 10, 40, 30, 3); c.fill();
  const syms = ['#c9a227', '#f3ecd8', '#1f5c34'];
  for (let i = 0; i < 3; i += 1) {
    c.fillStyle = syms[i];
    c.fillRect(cx - 18 + i * 13, cy - SLOT_HH + 13, 10, 24);
  }
  c.fillStyle = '#c9a227';
  roundRectC(c, cx - 7, cy + 10, 14, 12, 2); c.fill();
  c.fillStyle = '#3a1e14';
  c.beginPath(); c.arc(cx + 29, cy - 10, 4.5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a1e14'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(cx + 29, cy - 10); c.lineTo(cx + 29, cy + 18); c.stroke();
  c.restore();
}

// drawTicketStool — yeni istek: "piyango bilet satıcısı sandalyede
// otursun" — BAR_STOOLS ile aynı görsel dil (yuvarlak oturma yüzeyi + tek
// bacak), NPC'nin hemen altına/arkasına çizilen küçük bir tabure.
function drawTicketStool(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, 14, 16, 6, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3a1e14';
  c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 1.8;
  c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#241014'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, 12); c.lineTo(0, 30); c.stroke();
  c.restore();
}

function drawGuard(c, getAvatarImage) {
  drawAvatarSprite(c, {
    x: GUVENLIK.cx, baseY: GUVENLIK.cy, avatar: GUVENLIK_NPC.avatar, pose: 'idle', facing: 'left',
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
  c.fillStyle = 'rgba(243,217,155,0.85)';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText(GUVENLIK_NPC.name, GUVENLIK.cx, GUVENLIK.cy + 16);
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#1c1c22';
  c.fillRect(-52, -6, 104, 46);
  c.fillStyle = '#5c2a4a';
  c.fillRect(-45, -2, 43, 37);
  c.fillRect(2, -2, 43, 37);
  c.fillStyle = '#ffd23f';
  c.beginPath(); c.arc(-9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

// drawCasinoSceneBackground — canlı ekranın (renderFrame) statik kısmıyla
// AYNI çizim dizisi (NPC'ler dahil), dışa açık — hem burada hem de kamera
// fotoğrafında (bkz. openCamera/renderCameraPreview) VE Sixtagram akışında
// (PostAttachment.jsx) kullanılıyor.
export function drawCasinoSceneBackground(ctx, getAvatarImage) {
  drawFloor(ctx);
  drawDoor(ctx);
  TABLES_10NUMARA.forEach((t) => drawFeltTable(ctx, t, '10 NUMARA'));
  drawPiyangoStand(ctx);
  SLOTS.forEach((s) => drawSlotMachine(ctx, s.cx, s.cy));
  drawGuard(ctx, getAvatarImage);
  drawBottleWall(ctx);
  drawBarAndStools(ctx);
  drawWalls(ctx);

  // Barmen — artık tezgahın ARKASINDA, tam boyda (BARTENDER_BASE_Y/SCALE,
  // bkz. yukarısı) — eskiden BAR.y1'in 6px İÇİNDE duruyordu, bu da tezgahın
  // üstünde duruyormuş gibi görünmesine sebep oluyordu.
  drawAvatarSprite(ctx, {
    x: BAR.cx, baseY: BARTENDER_BASE_Y, avatar: BARTENDER_NPC.avatar, pose: 'idle', facing: 'down',
  }, getAvatarImage, { showName: false, scale: BARTENDER_SCALE });
  ctx.fillStyle = 'rgba(243,217,155,0.9)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(BARTENDER_NPC.name, BAR.cx, BARTENDER_BASE_Y - SPRITE_H * BARTENDER_SCALE - 10);

  // pose:'sit' — yeni istek: "piyango bilet satıcısı sandalyede otursun" —
  // artık PIYANGO_SEAT'te gerçek bir tabure (drawTicketStool) üstünde,
  // standın hemen arkasında/yakınında oturuyor (bkz. PIYANGO_BASE_Y).
  drawTicketStool(ctx, PIYANGO_SEAT.cx, PIYANGO_SEAT.cy);
  drawAvatarSprite(ctx, {
    x: PIYANGO_SEAT.cx, baseY: PIYANGO_BASE_Y, avatar: PIYANGO_NPC.avatar, pose: 'sit', facing: 'down',
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
  ctx.fillText(PIYANGO_NPC.name, PIYANGO_SEAT.cx, PIYANGO_BASE_Y - SPRITE_H * AVATAR_SCALE - 8);
}

// onEnterTable artık PROP olarak alınmıyor — 10 Numara masası artık
// App.jsx seviyesindeki ayrı tam ekrana (OnNumaraFullScreen) değil,
// doğrudan bu bileşenin kendi 'onnumara' panelinin içinde açılıyor (bkz.
// activeTableId/handleEnterTableLocal yukarısı).
export default function CasinoWorldScreen({ onExit, onOpenHeist }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { others, updatePresence, clearPresence } = useInteriorPresence('gazino');

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'slot' | 'piyango' | 'onnumara' | 'bar' | null
  // activeTableId — yeni istek: "10 numara oyunu gazinodayken açılsın,
  // casinodan çıkmayı gerektirmesin". Eskiden 10 Numara masasına
  // girildiğinde App.jsx seviyesinde AYRI bir tam ekran (OnNumaraFullScreen)
  // açılıyordu — bu, gazino sahnesinin tamamen kaybolup "gazinodan
  // çıkılmış" gibi görünmesine sebep oluyordu. Artık masaya girince/
  // katılınca bu YEREL state dolduruluyor ve aynı 'onnumara' panelinin
  // İÇİNDE (OnNumaraScreen lobisi yerine) doğrudan OnNumaraTable
  // (gerçek oyun) render ediliyor — gazino canvas'ı arkada görünmeye
  // devam ediyor (bkz. aşağıdaki panel JSX'i).
  const [activeTableId, setActiveTableId] = useState(null);
  // sittingSeatId — yeni istek (madde 3): "gazinodaki bar sandalyelerine
  // oturulabilsin", BankWorldScreen'deki CHAIRS mekanizmasıyla BİREBİR aynı
  // desen, sadece BAR_STOOLS'a uygulanıyor.
  const [sittingSeatId, setSittingSeatId] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [myBubble, setMyBubble] = useState(null);
  const [bufeBusy, setBufeBusy] = useState(null);
  const [barError, setBarError] = useState(null);
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
  const sittingSeatRef = useRef(null);
  const playerRef = useRef(null);
  const holdingRef = useRef(null);
  const holdingTimeoutRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));
  // --- Canlı/çok oyunculu (madde 17) — Bank/Karakol/Camii ile BİREBİR aynı
  // desen, bkz. hooks/useInteriorPresence.js.
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
  useEffect(() => { sittingSeatRef.current = sittingSeatId; }, [sittingSeatId]);

  useEffect(() => () => {
    if (holdingTimeoutRef.current) clearTimeout(holdingTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!myBubble) return undefined;
    const id = setTimeout(() => setMyBubble(null), CHAT_BUBBLE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBubble]);

  function getAvatarImage(avatar, pose) {
    return getAvatarImageRef.current(avatar, pose);
  }

  // Gazinoya giriş/çıkış — BankWorldScreen ile BİREBİR aynı desen (bkz.
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
    enterInterior('gazino')
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || START_POS;
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Gazinoya giriş hatası:', err);
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

      // --- Firestore senkronu (madde 17) — Bank/Park'takiyle BİREBİR aynı.
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
    setMyBubble({ text, ts });
    updatePresence(user.uid, {
      x: posRef.current.x, y: posRef.current.y, facing: facingRef.current,
      pose: sittingSeatRef.current ? 'sit' : 'idle', seat: sittingSeatRef.current,
      chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  function standUp() {
    sittingSeatRef.current = null;
    setSittingSeatId(null);
  }

  // Yeni istek: "o anda casinodayken 10 numara oynayan kişide, 10 numara
  // oynuyor yazsın" — masaya oturunca/katılınca kendi mekan-içi (interior
  // presence) belgeme `activity:'onnumara'` yazıyoruz; gazinodaki DİĞER
  // oyuncular bunu `others` listesinden okuyup ismimin altında bir etiket
  // olarak görüyor (bkz. renderFrame). Hareket/bekleme senkronu (yukarıdaki
  // ana döngü) `merge:true` ile yazdığı için bu alanı SİLMEZ — sadece masayı
  // terk edince (activity:null) veya gazinodan tamamen çıkınca
  // (clearPresence, mevcut giriş/çıkış efektinde) temizlenir.
  useEffect(() => {
    if (!user) return;
    updatePresence(user.uid, { activity: activeTableId ? 'onnumara' : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTableId, user?.uid]);

  function handleEnterTableLocal(tableId) {
    setActiveTableId(tableId);
  }

  function handleLeaveTable() {
    // OnNumaraTable'ın "Masadan Ayrıl" butonu leaveOnNumaraTable'ı zaten
    // çağırdıktan SONRA bu callback'i (onLeave) tetikliyor — burada sadece
    // yerel state'i temizleyip panel'i 10 Numara lobisine (OnNumaraScreen)
    // döndürüyoruz, eskiden OnNumaraFullScreen kapanınca da tam olarak bu
    // olurdu (gazino sahnesi + hâlâ açık 'onnumara' paneli).
    setActiveTableId(null);
  }

  // --- Kamera (madde 2/13) — BankWorldScreen'deki aynı desen.
  function buildCameraEntities() {
    const p = posRef.current;
    const self = {
      dx: 0, dy: 0,
      avatar: playerRef.current?.avatar,
      pose: sittingSeatRef.current ? 'sit' : (poseRef.current || 'idle'),
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
      drawBackground: (bgCtx) => drawCasinoSceneBackground(bgCtx, getAvatarImage),
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
    if (!user) {
      setShowGuestPrompt(true);
      return;
    }
    setBufeBusy(item.id);
    setBarError(null);
    try {
      await buyFromGazinoBar(item.id);
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

    const now = Date.now();
    const sitShift = sittingSeatRef.current ? SPRITE_H * AVATAR_SCALE * 0.32 : 0;
    const myBubbleNow = myBubbleRef.current && now - myBubbleRef.current.ts < CHAT_BUBBLE_MS ? myBubbleRef.current : null;

    const rawEntities = [
      ...othersRef.current.map((o) => ({
        x: o.x, y: o.y, avatar: o.avatar, pose: o.pose === 'sit' ? 'sit' : (o.pose || 'idle'),
        facing: o.facing || 'down', name: o.displayName || 'Oyuncu',
        bubbleData: o.chatText && o.chatTs && now - o.chatTs < CHAT_BUBBLE_MS ? { text: o.chatText, ts: o.chatTs } : null,
        activity: o.activity || null,
        isSelf: false,
      })),
      {
        x: posRef.current.x, y: posRef.current.y, avatar: playerRef.current?.avatar,
        pose: sittingSeatRef.current ? 'sit' : poseRef.current, facing: facingRef.current, holding: holdingRef.current,
        name: playerRef.current?.displayName || 'Sen', bubbleData: myBubbleNow, isSelf: true,
      },
    ];
    const entities = rawEntities
      .map((e) => ({ ...e, baseY: e.y + (e.pose === 'sit' ? SPRITE_H * AVATAR_SCALE * 0.32 : 0) }))
      .sort((a, b) => a.y - b.y);
    entities.forEach((e) => drawAvatarSprite(ctx, e, getAvatarImage, { showName: !e.isSelf, scale: AVATAR_SCALE }));

    // Yeni istek: "casinodayken 10 numara oynayan kişide, 10 numara
    // oynuyor yazsın" — ismin (baseY+14, bkz. drawAvatarSprite) hemen
    // altına küçük bir etiket daha çiziyoruz, SADECE diğer oyuncular için.
    entities.forEach((e) => {
      if (e.isSelf || e.activity !== 'onnumara') return;
      ctx.fillStyle = 'rgba(255,210,63,0.95)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🃏 10 Numara oynuyor', e.x, e.baseY + 27);
    });

    if (holdingRef.current) {
      drawHeldIcon(ctx, holdingRef.current, posRef.current.x + 30, posRef.current.y - SPRITE_H * AVATAR_SCALE * 0.42 + sitShift, { animate: true });
    }

    // NPC konuşma baloncukları + gerçek oyuncuların chat baloncukları.
    const bubbleItems = [];
    const piyangoLine = cyclingLine(PIYANGO_NPC.lines, { phase: 0 });
    if (piyangoLine) {
      const lines = wrapBubbleText(ctx, piyangoLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = PIYANGO_BASE_Y - SPRITE_H * AVATAR_SCALE - 10;
      bubbleItems.push({ x: PIYANGO_SEAT.cx, w, h, lines, ts: 0, naturalTop: anchorY - h });
    }
    const bartenderLine = cyclingLine(BARTENDER_NPC.lines, { phase: 11 });
    if (bartenderLine) {
      const lines = wrapBubbleText(ctx, bartenderLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = BARTENDER_BASE_Y - SPRITE_H * BARTENDER_SCALE - 12;
      bubbleItems.push({ x: BAR.cx, w, h, lines, ts: 1, naturalTop: anchorY - h });
    }
    const guardLine = cyclingLine(GUVENLIK_NPC.lines, { phase: 20 });
    if (guardLine) {
      const lines = wrapBubbleText(ctx, guardLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = GUVENLIK.cy - SPRITE_H * AVATAR_SCALE - 18;
      bubbleItems.push({ x: GUVENLIK.cx, w, h, lines, ts: 2, naturalTop: anchorY - h });
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

    // Bar taburesi (madde 3) — BankWorldScreen'deki CHAIRS ile BİREBİR aynı
    // desen: tıklanan taburenin yanına yürü, varınca otur; tekrar tıklamak
    // (yukarıdaki standUp() zaten çağrıldı) ayağa kaldırır.
    const stool = BAR_STOOLS.find((s) => dist(p, s) < STOOL_R + 16);
    if (stool) {
      pendingActionRef.current = { type: 'sit', seat: { id: stool.id, x: stool.x, y: stool.y + 4 } };
      targetRef.current = { x: stool.x, y: stool.y + 4 };
      return;
    }

    const slot = SLOTS.find((s) => dist(p, s) < SLOT_HW + 30);
    if (slot && tryStation(p, slot, SLOT_HW + 30, 'slot', SLOT_HH, SLOT_HH + 46)) return;

    if (tryStation(p, PIYANGO, PIYANGO.hw + 30, 'piyango', PIYANGO.hh, PIYANGO.hh + 46)) return;

    const table = TABLES_10NUMARA.find((t) => dist(p, t) < t.hw + 20);
    if (table && tryStation(p, table, table.hw + 20, 'onnumara', table.hh, table.hh + 46)) return;

    if (tryStation(p, BAR, BAR.hw + 30, 'bar', BAR.hh, BAR.hh + 46)) return;

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
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
        {!ready && <div className="ws-loading">Gazinoya giriliyor…</div>}
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

      {panel != null && (
        <div className="ws-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="ws-panel" onClick={(e) => e.stopPropagation()}>
            <p className="ws-panel-title">{panelTitles[panel]}</p>
            {panel === 'slot' && <SlotScreen />}
            {panel === 'piyango' && <LotteryScreen />}
            {panel === 'onnumara' && (
              activeTableId
                ? <OnNumaraTable tableId={activeTableId} myUid={user?.uid} onLeave={handleLeaveTable} />
                : <OnNumaraScreen onEnterTable={handleEnterTableLocal} />
            )}
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
