import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useImamState } from '../../hooks/useImamState';
import { useMosqueAttendance } from '../../hooks/useMosqueAttendance';
import { useBeggars } from '../../hooks/useBeggars';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useInteriorPresence } from '../../hooks/useInteriorPresence';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import {
  roundRectC, drawAvatarSprite, createAvatarImageCache, renderPhotoFrame,
  wrapBubbleText, measureBubble, layoutBubbles, drawBubbleBox,
  resolveObstaclePosition, cyclingLine, SPRITE_H,
} from '../../lib/canvasWorldKit';
import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ImamBooklet from '../ImamBooklet/ImamBooklet';
import { ImamPanel, BeggarsSection, WINDOW_HOURS } from '../MosqueScreen/MosqueScreen';
import { prayAtMosque, createSixtagramPost, enterInterior, captureCameraSnapshot } from '../../services/gameActions';
import Hud from '../Hud/Hud';
import PhoneScreen from '../Phone/PhoneScreen';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import '../../styles/worldScreenChrome.css';
import './MosqueWorldScreen.css';

// --- Camii içi (madde 5 revizyonu + madde 17 canlı/çok oyunculu) ----------
// Kullanıcının başka bir Claude oturumuna hazırlattığı referans örneğe göre
// yeniden tasarlandı: kemerli/çinili mihrap, basamaklı minber, avize,
// bordo-yeşil çizgili seccade/halı — hepsi referanstaki renk/desen diliyle.
// Dilenciler artık AYRI, kendine özel bir köşede (DİLENCİ), gerçek
// dilenci oyuncular (useBeggars) orada NPC olarak duruyor. Devamlı konuşan
// 2 ambient NPC VE fiziksel "vakitteki cemaat" NPC'leri TAMAMEN kaldırıldı
// (madde 5) — cemaat artık X butonunun yanındaki "Vakitteki Cemaat"
// menüsünden (panel) görülüyor. Camide artık SADECE imam (varsa) ve
// dilenci(ler) NPC olarak duruyor, başka hiçbir sahte NPC yok.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;
// CAMERA_RADIUS — yeni istek (madde 2): "camiide arkadaşımla fotoğraf
// çekecektim arkadaşım fotoğrafta çıkmıyor" — yakındaki gerçek oyuncuları
// da fotoğraf karesine dahil etmek için, Park'takiyle AYNI değer.
const CAMERA_RADIUS = 170;

// AVATAR_SCALE (madde 13, ve yeni istek: "genel olarak avatarları ...
// büyütelim") — bkz. BankWorldScreen'deki aynı gerekçe.
const AVATAR_SCALE = 1.42;

// MIHRAB — imamın "nasihat vermediği" zamanlarda bulunduğu makam, kemerli
// çinili niş (referanstaki gibi). x1/y1/x2/y2 + türetilmiş cx/cy/hw/hh.
const MIHRAB = { x1: 230, y1: 160, x2: 450, y2: 330, cx: 340, cy: 245, hw: 110, hh: 85 };
// MINBER — imamın nasihat verdiği (bugün nasihat verdiyse) durduğu basamaklı
// kürsü, mihrabın sağında. Yeni istek üzerine büyütüldü (r: 48 → 60).
const MINBER = { cx: 560, cy: 250, r: 60 };
// CARPET — yeni istek: "imam makamına kadar olan bölümdeki tüm zemini
// kaplasın" — artık dar bir şerit değil, mihrap/minberin hemen altından
// kapı girişine kadar TÜM zemin genişliğini kaplıyor (dilenci köşesi de
// bunun içinde kalıyor, bkz. DILENCI ve drawDilenciCorner).
const CARPET = { x1: 30, y1: 345, x2: 650, y2: 1010 };
// DILENCI — dilencilerin AYRI, kendine özel köşesi (madde 5: "dilencilerin
// bölümü ayrı bi yer olsun. dilenciler orada dilensin."). Gerçek
// dilenciler (useBeggars) burada NPC olarak duruyor. Zemini artık ayrı bir
// çini değil, CARPET'in bir parçası (bkz. drawDilenciCorner).
// Yeni istek ("dilenci bölümünün etrafı kapalı olsun, biraz daha aşağıda
// olsun"): köşe ~120px aşağı kaydırıldı (eskiden y1:640/y2:860) VE dört
// taraftan ahşap çit/parmaklıkla çevrildi (bkz. drawDilenciEnclosure) —
// artık açık bir köşe değil, sınırları belli, kapalı bir alan. Yeni konum
// hâlâ CARPET (y2:1010) içinde kalıyor ve mihrap/minber/kapı/START_POS ile
// çakışmıyor (bkz. OBSTACLES ve handleCanvasClick approach noktası).
const DILENCI = { x1: 40, y1: 760, x2: 220, y2: 980 };
// DILENCI_RAIL — çitin kalınlığı, hem çizimde hem OBSTACLES çarpışma
// kutusunda kullanılıyor (çit görsel olarak nereye kadar uzanıyorsa
// çarpışma da oraya kadar).
const DILENCI_RAIL = 10;
// BEGGAR_SCALE/BEGGAR_SIT_SHIFT — yeni istek ("oturan npclerin sandalyesi
// olsun ... çok saçma gözüküyor"): dilenciler pose:'sit' ile çiziliyor ama
// altlarında hiçbir oturma eşyası yoktu ve pose:'sit' bacakları kısalttığı
// için baseY telafisi olmadan görünür gövde tam bir avuç yukarıda havada
// duruyormuş gibi görünüyordu — bar taburelerinde oturan OYUNCU için
// zaten kullanılan aynı telafi (bkz. CasinoWorldScreen/BankWorldScreen
// `SPRITE_H * scale * 0.32`) burada da uygulanıyor (bkz. drawBeggarNpcs).
const BEGGAR_SCALE = AVATAR_SCALE * 0.68;
const BEGGAR_SIT_SHIFT = SPRITE_H * BEGGAR_SCALE * 0.32;

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

const OBSTACLES = [
  { cx: MIHRAB.cx, cy: MIHRAB.cy, hw: MIHRAB.hw, hh: MIHRAB.hh },
  { cx: MINBER.cx, cy: MINBER.cy, r: MINBER.r },
  // DILENCI çiti — köşe artık dört taraftan kapalı olduğu için oyuncu
  // serbest yürüyüşte çitin içinden geçemesin (etkileşim hâlâ mümkün,
  // çünkü handleCanvasClick'teki approach noktası çitin DIŞINDA kalıyor
  // ve pendingActionRef'li hareket zaten OBSTACLES'ı atlıyor).
  {
    cx: (DILENCI.x1 + DILENCI.x2) / 2,
    cy: (DILENCI.y1 + DILENCI.y2) / 2,
    hw: (DILENCI.x2 - DILENCI.x1) / 2 + DILENCI_RAIL,
    hh: (DILENCI.y2 - DILENCI.y1) / 2 + DILENCI_RAIL,
  },
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

function inRect(p, r) {
  return p.x >= r.x1 - 20 && p.x <= r.x2 + 20 && p.y >= r.y1 - 20 && p.y <= r.y2 + 20;
}

function istanbulDateKey(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// gaveSermonToday — madde 5: "nasihat verdiyse minberde nasihatını okusun
// npc olarak, nasihat vermediyse imam makamında bulunsun." Rastgele/kozmetik
// döngü DEĞİL, imamState'teki GERÇEK lastNasihatAt tarihine bakıyor.
function gaveSermonToday(imam) {
  if (!imam?.lastNasihatAt) return false;
  const at = imam.lastNasihatAt.toDate?.() ?? null;
  if (!at) return false;
  return istanbulDateKey(at) === istanbulDateKey(new Date());
}

function drawFloor(c) {
  c.fillStyle = '#ded0ab';
  c.fillRect(0, 0, W, H);
  for (let y = 24, row = 0; y < H - 24; y += 44, row += 1) {
    for (let x = 24; x < W; x += 44) {
      c.fillStyle = ((Math.floor(x / 44) + row) % 2 === 0) ? '#e6dab8' : '#dccca4';
      c.fillRect(x, y, 44, 44);
    }
  }
}

// drawCarpet — bordo+yeşil çizgili, kemer desenli seccade şeridi (referans
// örnekteki drawCarpet ile aynı çizim mantığı).
function drawCarpet(c) {
  const { x1, y1, x2, y2 } = CARPET;
  const maroonH = 34, greenH = 7, unit = maroonH + greenH;
  c.save();
  c.beginPath(); c.rect(x1, y1, x2 - x1, y2 - y1); c.clip();
  for (let y = y1; y < y2; y += unit) {
    c.fillStyle = '#6b1420';
    c.fillRect(x1, y, x2 - x1, maroonH);
    c.fillStyle = '#1f5c34';
    c.fillRect(x1, y + maroonH, x2 - x1, greenH);
    c.strokeStyle = 'rgba(201,162,39,0.55)';
    c.lineWidth = 1.3;
    for (let x = x1 + 20; x < x2 - 10; x += 42) {
      const midY = y + maroonH / 2 + 6;
      c.beginPath();
      c.moveTo(x - 14, y + maroonH - 3);
      c.lineTo(x - 14, midY);
      c.quadraticCurveTo(x, y + 6, x + 14, midY);
      c.lineTo(x + 14, y + maroonH - 3);
      c.stroke();
    }
  }
  c.restore();
}

// drawDilenciEnclosure — yeni istek: "dilenci bölümünün etrafı kapalı
// olsun" — köşe artık dört taraftan alçak bir ahşap çit/parmaklıkla
// çevrili, camideki diğer ahşap öğelerle (bench, SADAKA kutusu, minber)
// AYNI palet (koyu kahve gövde #6b4226, koyu kahve dış çizgi #3a2a18,
// altın direk başlıkları #c9a227 — mihrap/minberdeki gold trim ile aynı).
// Zemin çizimini (drawDilenciCorner) ve NPC'leri ETKİLEMİYOR, sadece
// köşenin dört kenarını çerçeveliyor.
function drawDilenciEnclosure(c) {
  const { x1, y1, x2, y2 } = DILENCI;
  const rail = DILENCI_RAIL;

  c.fillStyle = 'rgba(0,0,0,0.16)';
  c.fillRect(x1 - rail, y1 - rail + 4, (x2 - x1) + rail * 2, (y2 - y1) + rail * 2);

  const drawRail = (rx1, ry1, rx2, ry2) => {
    c.fillStyle = '#6b4226';
    c.fillRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
    c.strokeStyle = '#3a2a18';
    c.lineWidth = 1.4;
    c.strokeRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
  };
  // Üst (arka), alt (ön), sol, sağ — dört taraf da kapalı.
  drawRail(x1 - rail, y1 - rail, x2 + rail, y1);
  drawRail(x1 - rail, y2, x2 + rail, y2 + rail);
  drawRail(x1 - rail, y1 - rail, x1, y2 + rail);
  drawRail(x2, y1 - rail, x2 + rail, y2 + rail);

  // Köşe direkleri — altın başlıklı, camideki gold trim diliyle uyumlu.
  const postR = 5;
  [
    [x1 - rail / 2, y1 - rail / 2], [x2 + rail / 2, y1 - rail / 2],
    [x1 - rail / 2, y2 + rail / 2], [x2 + rail / 2, y2 + rail / 2],
  ].forEach(([px, py]) => {
    c.fillStyle = '#3a2a18';
    c.beginPath(); c.arc(px, py, postR, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c9a227';
    c.beginPath(); c.arc(px, py, postR * 0.45, 0, Math.PI * 2); c.fill();
  });
}

// drawDilenciCorner — madde 5: dilencilerin AYRI köşesi (bank + "SADAKA"
// kutusu). Zemin artık kendi çinisi DEĞİL — CARPET zaten bu köşenin
// altını da kaplıyor (yeni istek: "dilenci bölümünün zemini de halı
// olsun"), burada SADECE mobilya çiziliyor.
function drawDilenciCorner(c) {
  const { x1, y1, x2, y2 } = DILENCI;
  c.fillStyle = '#6b4226';
  roundRectC(c, x1 + 16, y1 + 18, x2 - x1 - 32, 20, 5); c.fill();
  c.fillStyle = '#8a5a34';
  roundRectC(c, x1 + 16, y1 + 14, x2 - x1 - 32, 8, 4); c.fill();
  const bx = (x1 + x2) / 2 - 17, by = y2 - 58;
  c.fillStyle = '#3a2a18';
  roundRectC(c, bx, by, 34, 26, 4); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 1.5;
  roundRectC(c, bx, by, 34, 26, 4); c.stroke();
  c.fillStyle = '#c9a227';
  c.fillRect(bx + 13, by + 4, 8, 2.5);
  // NOT: etiket renkleri artık koyu halının üstünde okunsun diye açık/altın
  // tonlara çevrildi (eskiden krem çini zemine göre koyu kahverengiydi).
  c.font = 'bold 9px sans-serif'; c.fillStyle = '#f3d99b'; c.textAlign = 'center';
  c.fillText('SADAKA', bx + 17, by - 8);
  c.fillStyle = 'rgba(243,217,155,0.85)';
  c.font = 'bold 10px sans-serif';
  c.fillText('DİLENCİLER', (x1 + x2) / 2, y1 - 8);
}

// drawBeggarStool — yeni istek: "oturan npclerin sandalyesi olsun" —
// dilencilerin köşedeki bench'iyle aynı ahşap/altın palette küçük bir
// tabure/minder, her dilencinin tam altına çiziliyor.
function drawBeggarStool(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(0, 12, 15, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#6b4226';
  roundRectC(c, -14, -3, 28, 14, 4); c.fill();
  c.strokeStyle = '#3a2a18'; c.lineWidth = 1.2;
  roundRectC(c, -14, -3, 28, 14, 4); c.stroke();
  c.restore();
}

// drawBeggarNpcs — madde 5: "dilenci olanların npcsi olsun" — gerçek
// dilenci oyuncular (useBeggars) köşede NPC olarak duruyor, sahte/scripted
// NPC DEĞİL.
function drawBeggarNpcs(c, beggars, getAvatarImage) {
  const { x1, x2, y1 } = DILENCI;
  const maxShown = 4;
  const shown = (beggars || []).slice(0, maxShown);
  const cols = 2;
  shown.forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = x1 + 60 + col * 75;
    const y = y1 + 100 + row * 52;
    drawBeggarStool(c, x, y);
    drawAvatarSprite(c, {
      x, baseY: y + BEGGAR_SIT_SHIFT, avatar: b.avatar, pose: 'sit', facing: 'down',
    }, getAvatarImage, { showName: false, scale: BEGGAR_SCALE });
  });
  if (!shown.length) {
    c.fillStyle = 'rgba(74,58,34,0.6)';
    c.font = '10px sans-serif';
    c.textAlign = 'center';
    c.fillText('Bugün dilenci yok', (x1 + x2) / 2, y1 + 100);
  }
}

const WALL_H = 150;

function drawWalls(c) {
  const grd = c.createLinearGradient(0, 0, 0, WALL_H);
  grd.addColorStop(0, '#3a2c18'); grd.addColorStop(1, '#4a3a22');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, WALL_H);
  c.fillStyle = '#2a1f10';
  c.fillRect(0, WALL_H - 8, W, 8);
  c.fillStyle = '#c9a227';
  c.font = 'bold 22px sans-serif';
  c.textAlign = 'center';
  c.fillText('CAMİİ', W / 2, 46);
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(201,162,39,0.75)';
  c.fillText('Huzur ve İbadet Mekanı', W / 2, 70);
}

// drawMihrab — kemerli, çinili niş (referanstaki drawMihrab ile aynı çizim
// mantığı: mavi/turkuaz çini zemin + krem baklava deseni + bordo noktalar).
function drawMihrab(c, hasImam) {
  const { x1, y1, x2, y2, cx } = MIHRAB;
  c.save();
  c.beginPath();
  c.moveTo(x1, y2);
  c.lineTo(x1, y1 + 40);
  c.quadraticCurveTo(x1, y1 - 10, cx, y1 - 10);
  c.quadraticCurveTo(x2, y1 - 10, x2, y1 + 40);
  c.lineTo(x2, y2);
  c.closePath();
  c.clip();
  const tile = 16;
  const cA = '#1c4f8c', cB = '#2e8b8b', cC = '#f5f0e0', cD = '#8c2e3a';
  for (let y = y1 - 20; y < y2 + 10; y += tile) {
    for (let x = x1 - 10; x < x2 + 10; x += tile) {
      const gx = Math.round(x / tile), gy = Math.round(y / tile);
      c.fillStyle = (gx + gy) % 2 === 0 ? cA : cB;
      c.fillRect(x, y, tile, tile);
      c.save();
      c.translate(x + tile / 2, y + tile / 2);
      c.rotate(Math.PI / 4);
      c.fillStyle = cC;
      c.fillRect(-tile * 0.22, -tile * 0.22, tile * 0.44, tile * 0.44);
      c.restore();
      if ((gx * 3 + gy) % 7 === 0) {
        c.fillStyle = cD;
        c.beginPath(); c.arc(x + tile / 2, y + tile / 2, 2.2, 0, Math.PI * 2); c.fill();
      }
    }
  }
  c.restore();

  c.strokeStyle = '#c9a227'; c.lineWidth = 4;
  c.beginPath();
  c.moveTo(x1, y2);
  c.lineTo(x1, y1 + 40);
  c.quadraticCurveTo(x1, y1 - 10, cx, y1 - 10);
  c.quadraticCurveTo(x2, y1 - 10, x2, y1 + 40);
  c.lineTo(x2, y2);
  c.stroke();

  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(cx, y2 + 6, (x2 - x1) / 2, 10, 0, 0, Math.PI * 2); c.fill();

  c.font = 'bold 12px sans-serif';
  c.fillStyle = '#c9a227';
  c.textAlign = 'center';
  c.fillText('M İ H R A P', cx, y1 - 16);

  if (!hasImam) {
    c.fillStyle = 'rgba(245,240,224,0.85)';
    c.font = 'bold 10px sans-serif';
    c.fillText('İMAM YOK', cx, y2 - 16);
  }
}

// drawMinber — basamaklı kürsü + hilal tepelik (referanstaki drawMinber ile
// aynı çizim mantığı).
function drawMinber(c) {
  const { cx, cy, r } = MINBER;
  c.save();
  c.translate(cx, cy);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, 8, r - 4, (r - 4) * 0.5, 0, 0, Math.PI * 2); c.fill();
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const w = r * 1.5 - i * 9;
    const yy = 24 - i * 10;
    c.fillStyle = i % 2 === 0 ? '#6b4226' : '#7a5233';
    roundRectC(c, -w / 2, yy - 8, w, 10, 2); c.fill();
  }
  c.fillStyle = '#5a3a22';
  roundRectC(c, -20, -32, 40, 22, 4); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 2;
  roundRectC(c, -20, -32, 40, 22, 4); c.stroke();
  c.fillStyle = '#c9a227';
  c.beginPath();
  c.moveTo(-22, -32); c.lineTo(0, -54); c.lineTo(22, -32);
  c.closePath(); c.fill();
  c.beginPath(); c.arc(0, -54, 3, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a2a18'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-r * 0.7, 16); c.lineTo(-13, -8); c.stroke();
  c.beginPath(); c.moveTo(r * 0.7, 16); c.lineTo(13, -8); c.stroke();
  c.font = 'bold 10px sans-serif';
  c.fillStyle = '#4a3a22'; c.textAlign = 'center';
  c.fillText('MİNBER', 0, 32);
  c.restore();
}

// drawChandelier — madde 5: avize. Referanstaki gibi yanan/dönen ışıklarla
// animasyonlu (performance.now() ile), her karede yeniden çiziliyor.
function drawChandelier(c) {
  const cx = 340, cy = 470;
  const now = performance.now();
  const glow = c.createRadialGradient(cx, cy, 10, cx, cy, 130);
  glow.addColorStop(0, 'rgba(255,224,150,0.32)');
  glow.addColorStop(1, 'rgba(255,224,150,0)');
  c.fillStyle = glow;
  c.beginPath(); c.arc(cx, cy, 130, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#c9a227'; c.lineWidth = 2;
  c.beginPath(); c.arc(cx, cy, 54, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(cx, cy, 36, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 + now / 6000;
    const lx = cx + Math.cos(a) * 54, ly = cy + Math.sin(a) * 54;
    c.fillStyle = '#ffe08a';
    c.beginPath(); c.arc(lx, ly, 3, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = '#c9a227';
  c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#1c1c22';
  c.fillRect(-52, -6, 104, 46);
  c.fillStyle = '#4a3a22';
  c.fillRect(-45, -2, 43, 37);
  c.fillRect(2, -2, 43, 37);
  c.fillStyle = '#c9a227';
  c.beginPath(); c.arc(-9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

// drawMosqueSceneBackground — renderFrame'in statik+canlı kısmıyla AYNI
// çizim dizisi, dışa açık (bkz. BankWorldScreen'deki aynı gerekçe). imam/
// members/win/beggars PARAMETRE olarak veriliyor — kamera fotoğrafı da
// canlı state'in AYNI anlık halini gösterir (rastgele/eski veri yok).
// Camide artık SADECE imam (varsa, konumu nasihat durumuna göre değişir)
// ve dilenci(ler) NPC olarak var — başka hiçbir scripted NPC YOK (madde 5).
export function drawMosqueSceneBackground(ctx, getAvatarImage, { imam, beggars } = {}) {
  drawFloor(ctx);
  drawCarpet(ctx);
  drawDilenciEnclosure(ctx);
  drawDilenciCorner(ctx);
  drawBeggarNpcs(ctx, beggars, getAvatarImage);
  drawWalls(ctx);
  drawDoor(ctx);
  drawMihrab(ctx, Boolean(imam));
  drawMinber(ctx);
  drawChandelier(ctx);

  if (imam) {
    const onMinber = gaveSermonToday(imam);
    const standX = onMinber ? MINBER.cx : MIHRAB.cx;
    const standY = onMinber ? MINBER.cy - 26 : MIHRAB.cy + 12;
    drawAvatarSprite(ctx, {
      x: standX, baseY: standY, avatar: imam.avatar, pose: 'idle', facing: 'down',
    }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
    ctx.fillStyle = 'rgba(20,12,8,0.85)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(imam.displayName || 'İmam', standX, standY - SPRITE_H * AVATAR_SCALE - 14);
    ctx.fillStyle = 'rgba(201,162,39,0.9)';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(onMinber ? '📖 Nasihat Veriyor' : '🕌 Makamda', standX, standY - SPRITE_H * AVATAR_SCALE);
  }
}

export default function MosqueWorldScreen({ onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { imam } = useImamState();
  const { members, window: win } = useMosqueAttendance();
  const { beggars } = useBeggars();
  const { actions } = useDailyActions();
  const { others, updatePresence, clearPresence } = useInteriorPresence('camii');

  // hasPrayedThisWindow — yeni istek: imam makamının üstünde yüzen "İbadet
  // Et" butonu, bu vakitte zaten ibadet ettiysek kaybolsun.
  const hasPrayedThisWindow = Boolean(actions.prayedWindows?.[win]);

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'imam' | 'beggars' | 'congregation' | null
  const [bookletOpen, setBookletOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  // Yeni istek: "yeni mesaj yazdığımızda eskisi direkt yok olmasın, süresi
  // bitene kadar var olmaya devam etsin" — tek bir mesaj yerine, HENÜZ
  // süresi dolmamış mesajların dizisi tutuluyor (bkz. sendChat/renderFrame).
  const [myBubbles, setMyBubbles] = useState([]);
  const [prayBusy, setPrayBusy] = useState(false);
  const [prayError, setPrayError] = useState(null);
  const [prayBtnPos, setPrayBtnPos] = useState(null);
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
  const imamRef = useRef(null);
  const beggarsRef = useRef([]);
  const cameraCanvasRef = useRef(null);
  const cameraFrameRef = useRef(null);
  const cameraOpenRef = useRef(false);
  const cameraDoneRef = useRef(false);
  const getAvatarImageRef = useRef(createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR));
  // --- Canlı/çok oyunculu (madde 17) — Bank/Karakol ile BİREBİR aynı desen.
  const myBubblesRef = useRef([]);
  const othersRef = useRef([]);
  // Diğer oyuncuların mesaj geçmişi — Firestore presence dokümanı SADECE
  // tek bir "o anki" chatText/chatTs alanı taşıyor, bu yüzden istemci
  // tarafında YEREL olarak biriktiriliyor (bkz. Bank/ParkWorldScreen'deki
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
  useEffect(() => { imamRef.current = imam; }, [imam]);
  useEffect(() => { beggarsRef.current = beggars; }, [beggars]);
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

  // Camiye giriş/çıkış — BankWorldScreen ile BİREBİR aynı desen (bkz.
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
    enterInterior('camii')
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || START_POS;
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Camiye giriş hatası:', err);
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
      x: posRef.current.x, y: posRef.current.y, facing: facingRef.current, pose: 'idle', seat: null,
      chatText: text, chatTs: ts,
    });
    setChatText('');
  };

  // prayBtnPos — yeni istek: imam makamının (MIHRAB) TAM ÜSTÜNDE, ekranda
  // gerçekten göründüğü yerde yüzen bir "İbadet Et" butonu. Canvas CSS ile
  // (max-width/max-height:100%) oranı koruyarak küçültülüp ortalandığı için
  // sabit bir yüzde/piksel HESAPLANAMAZ — canvas'ın o anki gerçek ekran
  // dikdörtgeni (getBoundingClientRect) okunup MIHRAB'ın dünya koordinatı
  // aynı ölçekle ekran koordinatına çevriliyor (bkz. pointerToCanvas'ın
  // TERSİ). Pencere/ekran boyutu değiştiğinde yeniden hesaplanır.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const update = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scaleX = rect.width / W;
      const scaleY = rect.height / H;
      setPrayBtnPos({
        x: rect.left + MIHRAB.cx * scaleX,
        y: rect.top + (MIHRAB.cy + MIHRAB.hh + 46) * scaleY,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [ready]);

  async function handlePrayClick() {
    if (!user) {
      setShowGuestPrompt(true);
      return;
    }
    setPrayBusy(true);
    setPrayError(null);
    try {
      await prayAtMosque();
    } catch (err) {
      setPrayError(err.message || 'İbadet edilemedi.');
    } finally {
      setPrayBusy(false);
    }
  }

  // --- Kamera (madde 2/13) — BankWorldScreen'deki aynı desen.
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
    // DÜZELTME (madde 2): yakındaki gerçek oyuncular da (othersRef.current,
    // CAMERA_RADIUS içinde) kareye dahil ediliyor; sunucu tarafı da AYNI
    // mantıkla doğrulanıyor (bkz. functions/index.js buildPresenceEntities).
    const nearby = othersRef.current
      .filter((o) => dist(p, o) < CAMERA_RADIUS)
      .slice(0, 4)
      .map((o) => {
        const bubble = latestActiveBubble(othersBubbleHistoryRef.current.get(o.uid));
        return {
          dx: o.x - p.x,
          dy: o.y - p.y,
          avatar: o.avatar,
          pose: o.pose || 'idle',
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
      pose: poseRef.current || 'idle',
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
    captureCameraSnapshot({ type: 'interiorPhoto', locationId: 'camii' }).catch(() => {});
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
        imam: imamRef.current, beggars: beggarsRef.current,
      }),
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
        type: 'interiorPhoto', locationId: 'camii',
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

    drawMosqueSceneBackground(ctx, getAvatarImage, {
      imam: imamRef.current, beggars: beggarsRef.current,
    });

    if (targetRef.current) {
      const pulse = 6 + Math.sin(performance.now() / 160) * 3;
      ctx.strokeStyle = 'rgba(30,30,40,0.5)';
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

    // Konuşma baloncukları — SADECE imam (nasihat metni varsa onu, yoksa
    // genel bir davet cümlesi) + gerçek oyuncuların chat baloncukları.
    // Ambient/cemaat NPC baloncukları TAMAMEN kaldırıldı (madde 5).
    const bubbleItems = [];
    const curImam = imamRef.current;
    if (curImam) {
      const onMinber = gaveSermonToday(curImam);
      const imamLines = onMinber && curImam.lastNasihat
        ? [curImam.lastNasihat]
        : ['Namaza gelin.', 'Cemaatle kılınan namaz daha faziletlidir.'];
      const line = cyclingLine(imamLines, { intervalMs: 30000, phase: 3 });
      if (line) {
        const lines = wrapBubbleText(ctx, line);
        const { w, h } = measureBubble(ctx, lines);
        const standX = onMinber ? MINBER.cx : MIHRAB.cx;
        const standY = onMinber ? MINBER.cy - 26 : MIHRAB.cy + 12;
        const anchorY = standY - SPRITE_H * AVATAR_SCALE - 16;
        bubbleItems.push({ x: standX, w, h, lines, ts: 0, naturalTop: anchorY - h });
      }
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

    if (inRect(p, MIHRAB) || dist(p, MINBER) < MINBER.r + 30) {
      const approach = { x: MIHRAB.cx, y: MIHRAB.cy + MIHRAB.hh + 90 };
      if (dist(posRef.current, approach) < INTERACT_RADIUS + 20) {
        setPanel('imam');
      } else {
        pendingActionRef.current = { type: 'imam' };
        targetRef.current = approach;
      }
      return;
    }

    if (inRect(p, DILENCI)) {
      const approach = { x: (DILENCI.x1 + DILENCI.x2) / 2, y: DILENCI.y2 + 50 };
      if (dist(posRef.current, approach) < INTERACT_RADIUS + 30) {
        setPanel('beggars');
      } else {
        pendingActionRef.current = { type: 'beggar' };
        targetRef.current = approach;
      }
      return;
    }

    pendingActionRef.current = null;
    targetRef.current = { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) };
  }

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#241a10', '--ws-panel-bg': '#1c1c24' }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />

      {/* mww-menu-row — yeni istek: imamlık başvurusu - imam kitapçığı -
          vakitteki cemaat - x, tek satırda yan yana. */}
      <div className="mww-menu-row">
        <button className="mww-menu-btn" onClick={() => setPanel('imam')}>
          {imam ? `İmam: ${imam.displayName}` : 'İmamlık Başvurusu'}
        </button>
        <button className="mww-menu-btn" onClick={() => setBookletOpen(true)}>İmam Kitapçığı</button>
        <button className="mww-menu-btn" onClick={() => setPanel('congregation')}>Vakitteki Cemaat</button>
        <button className="mww-exit-btn" onClick={onExit}>✕</button>
      </div>

      <div className="ws-canvas-wrap">
        {!ready && <div className="ws-loading">Camiye giriliyor…</div>}
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
        {/* mww-pray-btn — yeni istek: imam makamının üstünde yüzen "İbadet
            Et" butonu, sadece henüz bu vakitte ibadet etmediysek görünür. */}
        {ready && prayBtnPos && !hasPrayedThisWindow && (
          <button
            className="mww-pray-btn"
            style={{ left: prayBtnPos.x, top: prayBtnPos.y }}
            disabled={prayBusy}
            onClick={handlePrayClick}
          >
            {prayBusy ? 'İbadet ediliyor…' : '🤲 İbadet Et (Şüphe -5)'}
          </button>
        )}
      </div>
      {prayError && <p className="ws-error mww-pray-error">{prayError}</p>}

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
      {bookletOpen && <ImamBooklet onClose={() => setBookletOpen(false)} />}

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
            <p className="ws-panel-title">
              {panel === 'imam' ? '🕌 Mihrap — İbadet ve İmam' : panel === 'beggars' ? '🤲 Dilenciler' : `📿 ${win}. Vakitteki Cemaat`}
            </p>
            {panel === 'imam' && (
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
            )}
            {panel === 'beggars' && <BeggarsSection />}
            {panel === 'congregation' && (
              <div className="mosque-congregation-list">
                {members.length === 0 && <p className="mosque-hint">Bu vakitte henüz ibadet eden yok.</p>}
                {members.map((m) => (
                  <div key={m.id} className="mosque-member">
                    <AvatarSvg avatar={m.avatar} size={30} rounded />
                    <span>{m.displayName}</span>
                  </div>
                ))}
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
