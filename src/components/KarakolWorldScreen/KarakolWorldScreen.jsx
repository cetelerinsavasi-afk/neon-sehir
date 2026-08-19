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
import PoliceStationScreen from '../PoliceStationScreen/PoliceStationScreen';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { createSixtagramPost, enterInterior, captureCameraSnapshot } from '../../services/gameActions';
import '../../styles/worldScreenChrome.css';
import './KarakolWorldScreen.css';

// --- Karakol içi (madde 3/4 revizyonu + madde 17 canlı/çok oyunculu) -------
// Kullanıcının başka bir Claude oturumuna hazırlattığı referans örneğe göre
// yeniden tasarlandı: komiser artık KENDİ ÖZEL/KAPALI odasında (duvar + kapı
// boşluğu çizimiyle, 2 korumasıyla birlikte), giriş memurunun artık kendine
// ait bir resepsiyon masası var (boş ayakta değil), zemin Türk bayrağı
// renklerini (kırmızı + krem ay-yıldız) çağrıştırıyor (madde 4). Duvarlar
// SADECE görsel bölme — fiziksel çarpışma bilerek eklenmedi (kod/karmaşıklık
// tasarrufu, referans örnekteki gibi tam oda-kilidi bu ilk sürümde şart
// değil); sadece masalar ve korumalar gerçek engel.
const W = 680;
const H = 1180;
const PLAYER_SPEED = 240;
const PLAYER_R = 20;
const INTERACT_RADIUS = 76;
// CAMERA_RADIUS — yeni istek (madde 2): yakındaki gerçek oyuncuları da
// fotoğraf karesine dahil etmek için, Park'takiyle AYNI değer.
const CAMERA_RADIUS = 170;

// AVATAR_SCALE (madde 13) — bina içlerinde her şey (avatar dahil) küçük
// kalıyordu; SADECE bu mekana özel bir büyütme (bkz. BankWorldScreen'deki
// aynı gerekçe/yorum).
const AVATAR_SCALE = 1.42;

// RESEPSİYON — giriş memurunun kendi masası (madde 4: "boş ayakta değil").
// Boyutlar yeni istek üzerine büyütüldü ("mekanlardaki eşyaları büyütelim").
// cy — büyüyen AVATAR_SCALE ile memurun baş üstü isim etiketi eskiden
// KOMİSER odasının alt sınırına çok yaklaşıyordu (bkz. KOMISER_ROOM'daki
// aynı gerekçe); masa biraz daha aşağı alındı ki etiket rahat sığsın.
const RESEPSIYON = { cx: 340, cy: 730, hw: 90, hh: 37 };
const OFFICER_NPC = {
  name: 'Memur Kemal',
  lines: ['Buyurun, nasıl yardımcı olabilirim?', 'Evrak için sırayı bekleyin lütfen.', 'Şüphen çoksa rüşvet işini hallederiz.', 'İyi günler.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#c68863',
    hairStyle: 'short', hairColor: '#0d0a08', clothing: 'police', clothColor: '#1a2a4a',
    hat: 'policecap', hatColor: '#12213d', pantsColor: '#12213d', background: 'transparent',
  },
};

// KOMISER_ROOM — komiserin özel/kapalı ofisi (madde 4), referans örnekteki
// "duvar + alt kenarda kapı boşluğu" deseniyle (bkz. drawRoomWalls).
// y1/y2 ve COMMISSIONER_DESK.cy — yeni istek üzerine (madde 4: "komiserin
// adı ile karakolun adı aynı noktaya denk gelmiş") AŞAĞI kaydırıldı: büyük
// AVATAR_SCALE ile komiserin baş üstü isim etiketi eskiden duvardaki
// "KARAKOL" başlığının/alt yazısının (y≈46/70, bkz. drawWalls) hemen
// üstüne denk geliyordu — masa artık duvardan yeterince uzakta ki isim
// etiketi WALL_H (150) bandının rahatça altında/dışında kalsın.
const KOMISER_ROOM = { x1: 130, y1: 200, x2: 550, y2: 460, doorX1: 300, doorX2: 380 };
const COMMISSIONER_DESK = { cx: 340, cy: 405, hw: 78, hh: 33 };
// COMMISSIONER_SEAT/COMMISSIONER_SIT_SHIFT — yeni istek ("oturan
// npclerin sandalyesi olsun ve masaya daha yakın olsunlar"): komiser
// pose:'sit' ile çiziliyordu ama altında sandalye yoktu ve baseY telafisi
// olmadığı için masanın epey gerisinde havada duruyormuş gibi
// görünüyordu. Artık masanın hemen arkasında gerçek bir sandalye var
// (bkz. drawOfficeChair) ve görünür gövde, bar taburelerinde oturan
// OYUNCU için kullanılan aynı `SPRITE_H * scale * 0.32` telafisiyle
// sandalyenin üstüne hizalanıyor.
// Sandalye + oturan gövde masadan "-24" kadar geriye (yukarı) alınıyordu;
// yeni istek (madde 18: "npclerin ayakları masanın üstündeki yazıya denk
// geliyor") — bu değer "-36"ya çıkarılarak sandalye/NPC bir tık daha
// yukarı, KOMİSER tabelasından uzağa alındı (chair sandalyeyle birlikte
// hareket ettiği için ikisi arasındaki hiza bozulmuyor).
const COMMISSIONER_SIT_SHIFT = SPRITE_H * AVATAR_SCALE * 0.32;
const COMMISSIONER_SEAT = { cx: COMMISSIONER_DESK.cx, cy: COMMISSIONER_DESK.cy - COMMISSIONER_DESK.hh - 36 };
const COMMISSIONER_BASE_Y = COMMISSIONER_SEAT.cy + COMMISSIONER_SIT_SHIFT;
const COMMISSIONER_NPC = {
  name: 'Komiser Yusuf',
  lines: ['Rapor ne durumda?', 'Başvurunu değerlendiririm.', 'Kitapçığı okumadan imza atma.', 'Nöbet listesini kontrol edin.'],
  avatar: {
    ...DEFAULT_AVATAR, gender: 'erkek', build: 'standart', skin: '#8d5524',
    hairStyle: 'slick', hairColor: '#0d0a08', facialHair: 'mustache',
    clothing: 'police', clothColor: '#2b3550', neckAcc: 'tie', pantsColor: '#0d0d0d',
    hat: 'none', background: 'transparent',
  },
};

// KORUMALAR — madde 4: komiserin 2 koruması, ofisin kapı eşiğinde nöbette
// (cy, KOMISER_ROOM'un yeni aşağı kaydırılmış kapı hizasına göre güncellendi).
const KORUMALAR = [
  {
    cx: 210, cy: 440, name: 'Koruma',
    lines: ['Her şey kontrol altında.', 'Giriş çıkışları takip ediyorum.'],
    avatar: {
      ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#c68642',
      hairStyle: 'short', hairColor: '#0d0a08', clothing: 'police', clothColor: '#12182b',
      hat: 'policecap', hatColor: '#0d0f1a', pantsColor: '#0d0f1a', background: 'transparent',
    },
  },
  {
    cx: 470, cy: 440, name: 'Koruma',
    lines: ['Komiserim şu an meşgul.', 'Sırayla lütfen.'],
    avatar: {
      ...DEFAULT_AVATAR, gender: 'erkek', build: 'iri', skin: '#f1c27d',
      hairStyle: 'short', hairColor: '#2b2118', clothing: 'police', clothColor: '#12182b',
      hat: 'policecap', hatColor: '#0d0f1a', pantsColor: '#0d0f1a', background: 'transparent',
    },
  },
];

// NEZARETHANE — dekoratif hücre bölümü — fiziksel çarpışma yok (yukarıdaki
// KOMISER_ROOM ile aynı gerekçe). Yeni istek (madde 4: "ful parmaklık
// olsun"): artık kapı boşluğu YOK — ön cephenin TAMAMI parmaklık (bkz.
// drawNezarethane/drawCellBars), bu yüzden doorX1/doorX2 kaldırıldı.
const NEZARETHANE = { x1: 60, y1: 480, x2: 300, y2: 620 };

const DOOR = { cx: 340, cy: 1080 };
const START_POS = { x: 340, y: 990 };

const OBSTACLES = [
  { cx: RESEPSIYON.cx, cy: RESEPSIYON.cy, hw: RESEPSIYON.hw, hh: RESEPSIYON.hh },
  { cx: COMMISSIONER_DESK.cx, cy: COMMISSIONER_DESK.cy, hw: COMMISSIONER_DESK.hw, hh: COMMISSIONER_DESK.hh },
  ...KORUMALAR.map((k) => ({ cx: k.cx, cy: k.cy, r: 29 })),
];

function dist(a, b) {
  const ax = a.x ?? a.cx, ay = a.y ?? a.cy;
  const bx = b.x ?? b.cx, by = b.y ?? b.cy;
  return Math.hypot(ax - bx, ay - by);
}

// drawFloor — yeni istek (madde 4): "zemindeki türk bayrağını kaldıralım
// ... zemin açık gri olsun". Eski kırmızı zemin + ay-yıldız motifi
// tamamen kaldırıldı, açık gri bir zemine (referans paletiyle aynı:
// #d7dbe0/#dde1e6/#cfd4da) geçildi.
function drawFloor(c) {
  c.fillStyle = '#d7dbe0';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(0,0,0,0.05)';
  c.lineWidth = 1;
  for (let x = 0; x <= W; x += 58) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let y = 0; y <= H; y += 58) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  // Koridor şeridi — kapıdan resepsiyona, artık nötr gri tonlarda.
  const grd = c.createLinearGradient(0, 640, 0, 1080);
  grd.addColorStop(0, 'rgba(207,212,218,0.9)');
  grd.addColorStop(1, 'rgba(221,225,230,0.5)');
  c.fillStyle = grd;
  c.fillRect(260, 640, 160, 440);
}

const WALL_H = 150;

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

// drawRoomWalls — komiser odası ve nezarethane için ORTAK, referans
// örnekteki "üst+sol+sağ tam duvar, alt duvarda kapı boşluğu" deseni.
// SADECE görsel (bkz. dosya başındaki not) — fiziksel çarpışma yok.
function drawRoomWalls(c, room, label, floorTint) {
  c.save();
  c.fillStyle = floorTint;
  c.fillRect(room.x1, room.y1, room.x2 - room.x1, room.y2 - room.y1);
  c.strokeStyle = 'rgba(232,207,122,0.55)';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(room.x1, room.y2);
  c.lineTo(room.x1, room.y1);
  c.lineTo(room.x2, room.y1);
  c.lineTo(room.x2, room.y2);
  c.stroke();
  c.beginPath();
  c.moveTo(room.x1, room.y2); c.lineTo(room.doorX1, room.y2); c.stroke();
  c.beginPath();
  c.moveTo(room.doorX2, room.y2); c.lineTo(room.x2, room.y2); c.stroke();
  c.restore();
  c.fillStyle = 'rgba(232,207,122,0.75)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText(label, (room.x1 + room.x2) / 2, room.y1 - 8);
}

// drawNezarethane — NEZARETHANE artık kapı boşluklu genel drawRoomWalls
// yerine kendi çizim fonksiyonuna sahip: üst/sol/sağ duvar TAM kapalı,
// alt (ön) cephe TAMAMEN parmaklık (bkz. drawCellBars) — kapı boşluğu yok.
function drawNezarethane(c) {
  const { x1, y1, x2, y2 } = NEZARETHANE;
  c.save();
  c.fillStyle = 'rgba(20,20,26,0.45)';
  c.fillRect(x1, y1, x2 - x1, y2 - y1);
  c.strokeStyle = 'rgba(232,207,122,0.55)';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x1, y2);
  c.lineTo(x1, y1);
  c.lineTo(x2, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.restore();
  c.fillStyle = 'rgba(232,207,122,0.75)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.fillText('NEZARETHANE', (x1 + x2) / 2, y1 - 8);
}

// drawCellBars — yeni istek (madde 4): "nezarethane ful parmaklık olsun,
// senin önceden yaptığın gibi" — artık sadece kapı boşluğu genişliğinde
// DEĞİL, hücrenin TÜM ön cephesi (x1'den x2'ye) boyunca sık parmaklık.
// Yeni istek (madde 18: "nezarethanenin içi boydan boya parmaklık olsun")
// — eski sabit `x1+10` başlangıç / `x<x2` bitişi köşelerde küçük boşluklar
// bırakıyordu (ilk çubuk x1'den 10px, son çubuk x2'den 6px içeride kalıp
// duvarlara tam değmiyordu). Artık çubuk sayısı hücre genişliğine göre
// hesaplanıp EŞİT aralıklarla, İLK çubuk tam x1'de ve SON çubuk tam x2'de
// olacak şekilde diziliyor — ön cephe gerçekten uçtan uca (köşeden köşeye)
// parmaklıklı.
// Yeni istek (madde 19: "parmaklıklar nezarethanenin içinde boydan boya
// uzasın, şu an sadece alt bölümde parmaklıklar var") — çubuklar eskiden
// SADECE `y2 - 46`'dan `y2 + 4`'e (yani hücrenin sadece ~50px'lik alt
// şeridinde, y1=480/y2=620 olan 140px'lik hücrenin en altında) çiziliyordu;
// hücrenin üst/arka duvara yakın kısmı (y1'den y2-46'ya kadar) tamamen
// parmaklıksız kalıyordu. Artık dikey çubuklar hücrenin TÜM derinliği
// boyunca, `y1`'den (üst/arka duvar hizası) `y2 + 4`'e (alt/ön kenarın
// hemen dışı — eski taşma payı korunuyor) kadar uzanıyor. Üst pekiştirme
// rayı da alt bandın ortasında değil, artık hücrenin en üstünde (`y1`
// hizasında) çiziliyor.
function drawCellBars(c) {
  const { x1, x2, y1, y2 } = NEZARETHANE;
  c.save();
  c.strokeStyle = 'rgba(232,207,122,0.6)';
  c.lineWidth = 3;
  const spacing = 14;
  const barCount = Math.max(1, Math.round((x2 - x1) / spacing));
  for (let i = 0; i <= barCount; i += 1) {
    const x = x1 + ((x2 - x1) * i) / barCount;
    c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y2 + 4); c.stroke();
  }
  c.strokeStyle = 'rgba(232,207,122,0.8)';
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y1); c.stroke();
  c.restore();
}

function drawBench(c, cx, cy) {
  c.save();
  c.translate(cx, cy);
  c.fillStyle = '#7a7f88';
  roundRectC(c, -46, -11, 92, 22, 4); c.fill();
  c.strokeStyle = '#3a3f47'; c.lineWidth = 1.5;
  roundRectC(c, -46, -11, 92, 22, 4); c.stroke();
  c.restore();
}

function drawFlag(c, cx, cy) {
  c.save();
  c.translate(cx, cy);
  c.fillStyle = '#7a5233';
  c.fillRect(-2, -6, 4, 66);
  c.fillStyle = '#c41e2a';
  roundRectC(c, 0, -6, 46, 30, 2); c.fill();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(16, 9, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c41e2a';
  c.beginPath(); c.arc(19.4, 9, 7.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff';
  const sx = 32, sy = 9;
  c.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    const a2 = a + Math.PI / 5;
    c.lineTo(sx + Math.cos(a) * 5.2, sy + Math.sin(a) * 5.2);
    c.lineTo(sx + Math.cos(a2) * 2, sy + Math.sin(a2) * 2);
  }
  c.closePath(); c.fill();
  c.restore();
}

function drawCabinet(c, cx, cy) {
  c.save();
  c.translate(cx, cy);
  c.fillStyle = '#3a3f47';
  roundRectC(c, -29, -24, 58, 86, 4); c.fill();
  c.strokeStyle = '#20232a'; c.lineWidth = 1.5;
  for (let i = 0; i < 3; i += 1) { c.strokeRect(-29, -24 + i * 29, 58, 29); }
  c.restore();
}

function drawNoticeBoard(c, cx, cy) {
  c.save();
  c.translate(cx, cy);
  c.fillStyle = '#8a5a34';
  roundRectC(c, -37, -29, 75, 55, 3); c.fill();
  c.fillStyle = '#f4e6d0';
  roundRectC(c, -32, -23, 64, 44, 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1;
  c.strokeRect(-24, -14, 48, 12);
  c.strokeRect(-24, 2, 48, 12);
  c.restore();
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
  roundRectC(c, -42, -d.hh - 16, 84, 18, 3); c.fill();
  c.fillStyle = '#e8cf7a';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText(label, 0, -d.hh - 3);
  c.restore();
}

// drawOfficeChair — yeni istek: "oturan npclerin sandalyesi olsun" —
// komiserin masasının hemen arkasına çizilen basit bir ofis sandalyesi.
function drawOfficeChair(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(0, 19, 24, 8, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1c1c22';
  roundRectC(c, -16, -2, 32, 20, 4); c.fill();
  c.fillStyle = '#2b2b33';
  roundRectC(c, -16, -32, 32, 32, 5); c.fill();
  c.strokeStyle = '#e8cf7a'; c.lineWidth = 1.2;
  roundRectC(c, -16, -32, 32, 32, 5); c.stroke();
  c.restore();
}

function drawGuard(c, guard, getAvatarImage) {
  drawAvatarSprite(c, {
    x: guard.cx, baseY: guard.cy, avatar: guard.avatar, pose: 'idle', facing: 'down',
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
  c.fillStyle = 'rgba(232,207,122,0.85)';
  c.font = 'bold 10px sans-serif';
  c.textAlign = 'center';
  c.fillText(guard.name, guard.cx, guard.cy + 16);
}

function drawDoor(c) {
  c.save();
  c.translate(DOOR.cx, DOOR.cy);
  c.fillStyle = '#1c1c22';
  c.fillRect(-52, -6, 104, 46);
  c.fillStyle = '#3a4468';
  c.fillRect(-45, -2, 43, 37);
  c.fillRect(2, -2, 43, 37);
  c.fillStyle = '#e8cf7a';
  c.beginPath(); c.arc(-9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(9, 16, 2.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

// drawKarakolSceneBackground — renderFrame'in statik kısmıyla AYNI çizim
// dizisi, dışa açık (bkz. BankWorldScreen'deki drawBankSceneBackground'la
// aynı gerekçe) — kamera fotoğrafı VE Sixtagram akışı bunu kullanır.
export function drawKarakolSceneBackground(ctx, getAvatarImage) {
  drawFloor(ctx);
  drawRoomWalls(ctx, KOMISER_ROOM, 'KOMİSER OFİSİ', 'rgba(58,26,26,0.4)');
  drawNezarethane(ctx);
  drawCellBars(ctx);
  drawBench(ctx, (NEZARETHANE.x1 + NEZARETHANE.x2) / 2, NEZARETHANE.y2 - 44);
  drawFlag(ctx, KOMISER_ROOM.x2 - 36, KOMISER_ROOM.y1 + 46);
  drawCabinet(ctx, KOMISER_ROOM.x1 + 34, KOMISER_ROOM.y1 + 50);
  drawNoticeBoard(ctx, 600, 560);
  drawWalls(ctx);
  drawDoor(ctx);
  drawDesk(ctx, COMMISSIONER_DESK, 'KOMİSER');
  drawDesk(ctx, RESEPSIYON, 'RESEPSİYON');

  drawAvatarSprite(ctx, {
    x: RESEPSIYON.cx, baseY: RESEPSIYON.cy - RESEPSIYON.hh - 30,
    avatar: OFFICER_NPC.avatar, pose: 'idle', facing: 'down', name: OFFICER_NPC.name,
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
  ctx.fillStyle = 'rgba(232,207,122,0.85)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(OFFICER_NPC.name, RESEPSIYON.cx, RESEPSIYON.cy - RESEPSIYON.hh - 30 - SPRITE_H * AVATAR_SCALE - 8);

  // pose:'sit' — yeni istek (madde 5): "komiser ... otursun", artık gerçek
  // bir sandalyede (bkz. COMMISSIONER_SEAT/drawOfficeChair yukarısı).
  drawOfficeChair(ctx, COMMISSIONER_SEAT.cx, COMMISSIONER_SEAT.cy);
  drawAvatarSprite(ctx, {
    x: COMMISSIONER_SEAT.cx, baseY: COMMISSIONER_BASE_Y,
    avatar: COMMISSIONER_NPC.avatar, pose: 'sit', facing: 'down', name: COMMISSIONER_NPC.name,
  }, getAvatarImage, { showName: false, scale: AVATAR_SCALE });
  ctx.fillText(COMMISSIONER_NPC.name, COMMISSIONER_SEAT.cx, COMMISSIONER_BASE_Y - SPRITE_H * AVATAR_SCALE - 8);

  KORUMALAR.forEach((k) => drawGuard(ctx, k, getAvatarImage));
}

export default function KarakolWorldScreen({ onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { others, updatePresence, clearPresence } = useInteriorPresence('karakol');

  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(null); // 'bribe' | 'application' | null
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneInitialApp, setPhoneInitialApp] = useState(null);
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
  // --- Canlı/çok oyunculu (madde 17) — Bank/ParkWorldScreen ile BİREBİR
  // aynı desen, bkz. hooks/useInteriorPresence.js.
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

  // Karakola giriş/çıkış — BankWorldScreen ile BİREBİR aynı desen (bkz.
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
    enterInterior('karakol')
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || START_POS;
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setReady(true);
      })
      .catch((err) => {
        console.error('Karakola giriş hatası:', err);
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
    captureCameraSnapshot({ type: 'interiorPhoto', locationId: 'karakol' }).catch(() => {});
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
        type: 'interiorPhoto', locationId: 'karakol',
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

    drawKarakolSceneBackground(ctx, getAvatarImage);

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

    // NPC konuşma baloncukları — memur, komiser, 2 koruma.
    const bubbleItems = [];
    const officerLine = cyclingLine(OFFICER_NPC.lines, { phase: 0 });
    if (officerLine) {
      const lines = wrapBubbleText(ctx, officerLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = RESEPSIYON.cy - RESEPSIYON.hh - 30 - SPRITE_H * AVATAR_SCALE - 10;
      bubbleItems.push({ x: RESEPSIYON.cx, w, h, lines, ts: 0, naturalTop: anchorY - h });
    }
    const commissionerLine = cyclingLine(COMMISSIONER_NPC.lines, { phase: 11 });
    if (commissionerLine) {
      const lines = wrapBubbleText(ctx, commissionerLine);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = COMMISSIONER_BASE_Y - SPRITE_H * AVATAR_SCALE - 10;
      bubbleItems.push({ x: COMMISSIONER_SEAT.cx, w, h, lines, ts: 1, naturalTop: anchorY - h });
    }
    KORUMALAR.forEach((k, i) => {
      const line = cyclingLine(k.lines, { phase: 20 + i * 6 });
      if (!line) return;
      const lines = wrapBubbleText(ctx, line);
      const { w, h } = measureBubble(ctx, lines);
      const anchorY = k.cy - SPRITE_H * AVATAR_SCALE - 18;
      bubbleItems.push({ x: k.cx, w, h, lines, ts: 2 + i, naturalTop: anchorY - h });
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

  function handleCanvasClick(e) {
    const p = pointerToCanvas(e);

    if (dist(p, RESEPSIYON) < RESEPSIYON.hw + 30) {
      if (dist(posRef.current, RESEPSIYON) < INTERACT_RADIUS + RESEPSIYON.hh) {
        setPanel('bribe');
      } else {
        pendingActionRef.current = { type: 'officer' };
        targetRef.current = { x: RESEPSIYON.cx, y: RESEPSIYON.cy + RESEPSIYON.hh + 46 };
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

  return (
    <div className="ws-fullscreen" style={{ '--ws-bg': '#2b2d31', '--ws-panel-bg': '#1c1c24' }}>
      <Hud suspicion={player?.suspicion ?? 0} reputation={player?.reputation ?? 0} gold={player?.gold ?? 0} />
      <button className="ws-exit-btn" onClick={onExit}>✕</button>

      <div className="ws-canvas-wrap">
        {!ready && <div className="ws-loading">Karakola giriliyor…</div>}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="ws-canvas"
          onPointerDown={handleCanvasClick}
        />
        {ready && (
          <>
            <button className="ws-chatsapp-btn" onClick={() => { setPhoneInitialApp('chatsapp'); setPhoneOpen(true); }} title="ChatsApp">💬</button>
            <button className="ws-phone-btn" onClick={() => { setPhoneInitialApp(null); setPhoneOpen(true); }} title="Telefon">📱</button>
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

      {phoneOpen && (
        <PhoneScreen
          onClose={() => { setPhoneOpen(false); setPhoneInitialApp(null); }}
          initialApp={phoneInitialApp}
          onEnterTable={() => {}}
        />
      )}

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
