// broadcastBackdrops.js — röportaj/TV çekiminin arka planı. Kullanıcı iki
// aşamada revize etti:
//  1) Oyunun üstten/izometrik "dünya" sahnesini (drawBankSceneBackground
//     vb.) bir kamera kutusuyla kırpan ESKİ yaklaşım "sanki o mekanda
//     avatarımızla geziyormuşuz gibi" duruyordu — bunun yerine GERÇEK bir
//     kameranın arkamızdaki mekanı çektiği, sabit/düz (izometrik olmayan)
//     bir "stüdyo arka planı" istendi.
//  2) İlk halinde bu arka planlar çok "bulanık/bokeh" ve soluktu — "hangi
//     mekanda olduğumuzu gördüğümüz anda hissedelim" isteği üzerine, HER
//     mekanın 1-2 tane BÜYÜK, NET, yüksek kontrastlı ve tartışmasız o
//     mekana ait bir simgesi (camide mihrap kemeri + kubbe + minare,
//     karakolda parmaklık + POLİS tabelası + bayrak, bankada kasa kapısı,
//     kumarhanede rulet + neon tabela, parkta salıncak + bank + ağaç, şehirde
//     gökdelen + neon tabela + yaya geçidi) net biçimde, bulanıklaştırma
//     OLMADAN çiziliyor. Bulanıklık (blurBlob) sadece İKİNCİL/arka planda
//     kalan dolgu ögeler için (uzak binalar, uzak ağaçlar) kullanılıyor —
//     kimliği belirleyen ana simgeler HER ZAMAN net/keskin.
//
// Mekanlar oyundaki mekanı AYNEN birebir tekrarlamak zorunda değil (bkz.
// kullanıcının kendi ifadesi), sadece o mekanı ANDIRMALI ve tek bakışta
// tanınmalı. Saf Canvas 2D, yeni kütüphane YOK (genel kural).
export const BROADCAST_BACKDROP_W = 480;
export const BROADCAST_BACKDROP_H = 552;

const W = BROADCAST_BACKDROP_W;
const H = BROADCAST_BACKDROP_H;

function glow(ctx, x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// blurBlob — SADECE ikincil/dolgu ögeler için "odak dışı" bir siluet.
function blurBlob(ctx, drawShape, { layers = 3, growth = 2.5, baseAlpha = 0.22 } = {}) {
  for (let i = layers; i >= 0; i--) {
    ctx.save();
    ctx.globalAlpha = baseAlpha + (1 - i / layers) * (1 - baseAlpha) * 0.4;
    ctx.scale(1 + (i * growth) / 200, 1 + (i * growth) / 200);
    drawShape();
    ctx.restore();
  }
}

function neonText(ctx, text, x, y, { size = 20, color = '#19e8ff', align = 'center' } = {}) {
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px "Segoe UI", sans-serif`;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.9;
  ctx.fillStyle = color;
  // İki geçiş: glow'lu bir alt katman + üstüne net (gölgesiz) bir katman —
  // WeaponShopWorldScreen.jsx'teki AYNI "neon tabela" tekniği (shadowBlur).
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawSky(ctx, top, mid, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(ctx, seedT, count = 20) {
  for (let i = 0; i < count; i++) {
    const x = (i * 137.5) % W;
    const y = (i * 91.3) % (H * 0.38);
    const tw = 0.5 + 0.5 * Math.sin(seedT * 1.6 + i * 1.7);
    ctx.globalAlpha = 0.25 + tw * 0.45;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, i % 5 === 0 ? 1.6 : 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// PARK — gece parkı: büyük net bir ağaç, salıncak, bank ve cyan lamba.
// Salıncak + bank + ağaç üçlüsü "park" olduğunu tek bakışta anlatıyor.
function drawParkBackdrop(ctx, t) {
  drawSky(ctx, '#1c1438', '#182a44', '#0e1c22');
  drawStars(ctx, t, 14);

  // Uzak/bulanık ikinci sıra ağaçlar (dolgu, kimlik taşımıyor).
  [{ x: 30, r: 60 }, { x: 440, r: 68 }].forEach((tr) => {
    ctx.save();
    ctx.translate(tr.x, H * 0.42);
    blurBlob(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, tr.r, tr.r * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#143220';
      ctx.fill();
    });
    ctx.restore();
  });

  // BÜYÜK, NET ana ağaç — sol tarafta, gövde + yuvarlak yaprak kütlesi.
  ctx.save();
  ctx.translate(90, H * 0.4);
  ctx.fillStyle = '#3a2417';
  ctx.fillRect(-9, 40, 18, 130);
  const canopy = ctx.createRadialGradient(-15, -20, 10, 0, 0, 95);
  canopy.addColorStop(0, '#2f6b3f');
  canopy.addColorStop(1, '#173a26');
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(0, -10, 92, 88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Salıncak — "park" kimliğini tartışmasız yapan ikinci öge.
  ctx.save();
  ctx.translate(345, H * 0.3);
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-55, 0); ctx.lineTo(0, -95); ctx.lineTo(55, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,200,200,0.7)';
  ctx.lineWidth = 2.5;
  [-14, 14].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(dx * 0.55, -78);
    ctx.lineTo(dx, 60);
    ctx.stroke();
  });
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(-16, 56, 32, 8);
  ctx.restore();

  // Lamba direği + sıcak/cyan parıltı (hafif nabız).
  const pulse = 0.7 + 0.3 * Math.sin(t * 1.3);
  glow(ctx, W * 0.5, H * 0.16, 100, 'rgba(25,232,255,0.9)', 0.32 * pulse);
  ctx.fillStyle = '#1c2430';
  ctx.fillRect(W * 0.5 - 4, H * 0.16, 8, H * 0.28);
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.16, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#bffcff';
  ctx.fill();

  // Park banki — geniş, net, ön planda.
  ctx.save();
  ctx.translate(W * 0.5, H * 0.62);
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(-90, -8, 180, 10);
  ctx.fillRect(-90, 14, 180, 10);
  ctx.fillStyle = '#3a2417';
  [-78, -20, 20, 78].forEach((lx) => ctx.fillRect(lx - 4, -8, 8, 42));
  ctx.restore();

  // Alçak demir parmaklıklı bahçe çiti — ön planda, tanıdık park detayı.
  ctx.save();
  ctx.strokeStyle = 'rgba(20,30,20,0.6)';
  ctx.lineWidth = 3;
  for (let x = 10; x < W; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, H * 0.78);
    ctx.lineTo(x, H * 0.7);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, H * 0.7);
  ctx.lineTo(W, H * 0.7);
  ctx.stroke();
  ctx.restore();

  // Çim şeridi — kadrajın en altı.
  const grassY = H * 0.87;
  const grass = ctx.createLinearGradient(0, grassY, 0, H);
  grass.addColorStop(0, '#173a26');
  grass.addColorStop(1, '#0a2016');
  ctx.fillStyle = grass;
  ctx.fillRect(0, grassY, W, H - grassY);
}

// ---------------------------------------------------------------------
// ŞEHİR — gece şehri: net gökdelen silüetleri + parlak neon tabelalar +
// yaya geçidi + trafik lambası. Neon tabela metinleri kimliği güçlendiriyor.
function drawCityBackdrop(ctx, t) {
  drawSky(ctx, '#170f2b', '#101a30', '#0a0f1c');
  drawStars(ctx, t, 12);

  // Uzak/bulanık arka sıra binalar (dolgu).
  [{ x: -10, w: 90, h: H * 0.4 }, { x: 400, w: 100, h: H * 0.44 }].forEach((b) => {
    ctx.save();
    blurBlob(ctx, () => {
      ctx.fillStyle = '#0d1524';
      ctx.fillRect(b.x, H - b.h, b.w, b.h);
    }, { layers: 2, growth: 1, baseAlpha: 0.5 });
    ctx.restore();
  });

  // NET ön sıra binalar + pencere/neon ışıkları.
  const buildings = [
    { x: 60, w: 110, h: H * 0.56, color: '#131c2e', neon: '#ff2e8c' },
    { x: 300, w: 130, h: H * 0.62, color: '#111a2c', neon: '#19e8ff' },
  ];
  buildings.forEach((b) => {
    const top = H - b.h;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, top, b.w, b.h);
    ctx.fillStyle = b.neon;
    ctx.globalAlpha = 0.55;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 3 === 0) continue;
        ctx.fillRect(b.x + 10 + col * (b.w / 4), top + 16 + row * 22, 7, 9);
      }
    }
    ctx.globalAlpha = 1;
  });

  // Büyük, net, parlayan neon dükkan tabelası — "şehir" kimliğinin en
  // güçlü ögesi.
  const pulse = 0.75 + 0.25 * Math.sin(t * 1.6);
  neonText(ctx, '7/24 MARKET', 115, H * 0.42, { size: 15, color: '#ffd23f' });
  neonText(ctx, 'NEON ŞEHİR', W / 2, H * 0.14, { size: 20, color: '#ff2e8c' });
  glow(ctx, W / 2, H * 0.14, 90, 'rgba(255,46,140,0.7)', 0.3 * pulse);
  neonText(ctx, 'TAKSİ', 365, H * 0.5, { size: 14, color: '#19e8ff' });

  // Trafik lambası — direk + üç renkli göz.
  ctx.save();
  ctx.translate(30, H * 0.62);
  ctx.fillStyle = '#1a1f2a';
  ctx.fillRect(-3, -70, 6, 70);
  ctx.fillRect(-14, -100, 28, 34);
  ['#ff4444', '#ffd23f', '#3ddc84'].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(0, -92 + i * 11, 4, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.globalAlpha = i === 2 ? 0.35 + 0.5 * Math.max(0, Math.sin(t * 2)) : 0.35;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  // Yol + yaya geçidi (zebra) — ön planda, net.
  const roadY = H * 0.84;
  const road = ctx.createLinearGradient(0, roadY, 0, H);
  road.addColorStop(0, '#1c2331');
  road.addColorStop(1, '#0c1119');
  ctx.fillStyle = road;
  ctx.fillRect(0, roadY, W, H - roadY);
  ctx.fillStyle = 'rgba(232,237,246,0.75)';
  for (let x = 20; x < W; x += 44) {
    ctx.fillRect(x, roadY + 10, 26, H - roadY - 20);
  }
}

// ---------------------------------------------------------------------
// KARAKOL — komiserlik: NET, kalın parmaklıklar, parlayan "POLİS"
// tabelası, Türk bayrağı, aranıyor panosu — tartışmasız bir karakol.
function drawKarakolBackdrop(ctx, t) {
  drawSky(ctx, '#241417', '#1c1418', '#100b0d');

  // Duvar paneli deseni.
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H * 0.78);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Parlayan "POLİS" tabelası — en güçlü kimlik ögesi.
  const pulse = 0.75 + 0.25 * Math.sin(t * 1.4);
  neonText(ctx, 'POLİS', W / 2, H * 0.14, { size: 30, color: '#3b7dff' });
  glow(ctx, W / 2, H * 0.14, 130, 'rgba(59,125,255,0.6)', 0.35 * pulse);

  // BÜYÜK, NET nezarethane parmaklıkları — kalın, yüksek kontrastlı.
  ctx.save();
  ctx.fillStyle = '#0b0b0b';
  ctx.strokeStyle = '#2a2a2a';
  for (let i = 0; i < 6; i++) {
    const x = 26 + i * 20;
    ctx.fillRect(x, H * 0.24, 8, H * 0.42);
  }
  ctx.fillRect(20, H * 0.24 - 6, 130, 8);
  ctx.fillRect(20, H * 0.24 + H * 0.42 - 2, 130, 8);
  ctx.restore();

  // Türk bayrağı — köşede, net.
  ctx.save();
  ctx.translate(W * 0.76, H * 0.15);
  ctx.fillStyle = '#3a2718';
  ctx.fillRect(-2, 0, 5, H * 0.36);
  ctx.fillStyle = '#a41e28';
  ctx.beginPath();
  ctx.moveTo(3, 4);
  ctx.lineTo(74, 24);
  ctx.lineTo(3, 46);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(28, 24, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a41e28';
  ctx.beginPath();
  ctx.arc(31, 24, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // "ARANIYOR" panosu — net, küçük ama okunaklı.
  ctx.save();
  ctx.translate(W * 0.78, H * 0.56);
  ctx.fillStyle = '#3a2f22';
  ctx.fillRect(-42, -30, 84, 60);
  ctx.fillStyle = '#e8dcb8';
  ctx.fillRect(-34, -22, 68, 44);
  ctx.fillStyle = '#8a1d1d';
  ctx.font = '900 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ARANIYOR', 0, -8);
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(0, 8, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Masa lambası sıcak parıltısı.
  const flicker = 0.75 + 0.25 * Math.sin(t * 5.5);
  glow(ctx, W * 0.22, H * 0.6, 120, 'rgba(232,207,122,0.5)', 0.28 * flicker);

  const deskY = H * 0.86;
  ctx.fillStyle = '#241a14';
  ctx.fillRect(0, deskY, W, H - deskY);
  ctx.fillStyle = 'rgba(58,26,26,0.4)';
  ctx.fillRect(0, deskY, W, 6);
}

// ---------------------------------------------------------------------
// CAMİİ — saygılı ama TARTIŞMASIZ tanınır: kubbe silueti + minare + net
// altın mihrap kemeri + geometrik yıldız deseni + halı medalyonu. Renkli/
// gösterişli neon YOK (madde 2b'nin saygılı ruhu korunuyor), ama şekiller
// artık büyük ve net.
function drawCamiiBackdrop(ctx, t) {
  drawSky(ctx, '#231a10', '#1c140e', '#120d09');

  // Kubbe silueti — en üstte, yarım daire.
  ctx.save();
  ctx.fillStyle = '#2a1f14';
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.1, W * 0.42, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,162,39,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Kubbe tepesindeki hilal.
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.1 - W * 0.42, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Minare — sağ tarafta, ince kule + külah + hilal.
  ctx.save();
  ctx.translate(W * 0.84, 0);
  ctx.fillStyle = '#2a1f14';
  ctx.fillRect(-13, H * 0.06, 26, H * 0.34);
  ctx.beginPath();
  ctx.moveTo(-16, H * 0.06);
  ctx.lineTo(0, H * 0.06 - 46);
  ctx.lineTo(16, H * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.arc(0, H * 0.06 - 54, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Kandil parıltısı — çok hafif, sabit yakın nabız.
  const pulse = 0.85 + 0.15 * Math.sin(t * 0.9);
  glow(ctx, W / 2, H * 0.24, 210, 'rgba(201,162,39,0.4)', 0.55 * pulse);

  // BÜYÜK, NET mihrap kemeri — sivri/atnalı kemer, kalın altın kontur.
  ctx.save();
  ctx.translate(W / 2, H * 0.58);
  ctx.beginPath();
  ctx.moveTo(-92, 110);
  ctx.lineTo(-92, -10);
  ctx.quadraticCurveTo(-92, -118, 0, -132);
  ctx.quadraticCurveTo(92, -118, 92, -10);
  ctx.lineTo(92, 110);
  ctx.closePath();
  ctx.fillStyle = 'rgba(58,38,18,0.7)';
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 5;
  ctx.stroke();
  // İç kemer çizgisi (çift kontur — mimari derinlik hissi).
  ctx.beginPath();
  ctx.moveTo(-74, 110);
  ctx.lineTo(-74, -6);
  ctx.quadraticCurveTo(-74, -96, 0, -108);
  ctx.quadraticCurveTo(74, -96, 74, -6);
  ctx.lineTo(74, 110);
  ctx.strokeStyle = 'rgba(201,162,39,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Geometrik 8 köşeli yıldız deseni — üst köşeler, net (soluk değil).
  const star8 = (cx, cy, r) => {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const rad = i % 2 === 0 ? r : r * 0.55;
      const ang = (Math.PI / 8) * i - Math.PI / 2;
      const px = cx + rad * Math.cos(ang);
      const py = cy + rad * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  ctx.strokeStyle = 'rgba(201,162,39,0.45)';
  ctx.lineWidth = 1.6;
  star8(46, 46, 26);
  ctx.stroke();
  star8(W - 46, 46, 26);
  ctx.stroke();

  // Halı bandı + medalyon deseni — alt kenar, net.
  const carpetY = H * 0.86;
  ctx.fillStyle = '#3a1414';
  ctx.fillRect(0, carpetY, W, H - carpetY);
  ctx.fillStyle = 'rgba(201,162,39,0.4)';
  ctx.fillRect(0, carpetY, W, 4);
  ctx.strokeStyle = 'rgba(201,162,39,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(W / 2, carpetY + (H - carpetY) / 2, 34, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------------------------------------------------------------------
// BANKA — kurumsal lobi: NET, büyük dairesel kasa kapısı + "BANKA"
// tabelası + mermer sütunlar + gişe grileri.
function drawBankaBackdrop(ctx, t) {
  drawSky(ctx, '#0e1c2c', '#101f2e', '#0a1420');

  // "BANKA" tabelası — parlak, net.
  const pulse = 0.75 + 0.25 * Math.sin(t * 1.2);
  neonText(ctx, 'PARARA BANK', W / 2, H * 0.12, { size: 17, color: '#7fd8ff' });
  glow(ctx, W / 2, H * 0.12, 110, 'rgba(127,216,255,0.5)', 0.3 * pulse);

  // Mermer sütunlar — iki yanda, net.
  [40, W - 40].forEach((cx) => {
    const colGrad = ctx.createLinearGradient(cx - 14, 0, cx + 14, 0);
    colGrad.addColorStop(0, '#3a4a58');
    colGrad.addColorStop(0.5, '#6a8090');
    colGrad.addColorStop(1, '#3a4a58');
    ctx.fillStyle = colGrad;
    ctx.fillRect(cx - 14, H * 0.2, 28, H * 0.62);
    ctx.fillStyle = '#8fa5b5';
    ctx.fillRect(cx - 20, H * 0.18, 40, 10);
  });

  // BÜYÜK, NET dairesel kasa kapısı — merkezde, cıvatalar + kolu ile.
  ctx.save();
  ctx.translate(W / 2, H * 0.46);
  const doorGrad = ctx.createRadialGradient(-20, -20, 10, 0, 0, 100);
  doorGrad.addColorStop(0, '#8fa5b5');
  doorGrad.addColorStop(1, '#3a4a58');
  ctx.fillStyle = doorGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c2732';
  ctx.lineWidth = 6;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const ang = (Math.PI / 6) * i;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * 78, Math.sin(ang) * 78, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#1c2732';
    ctx.fill();
  }
  ctx.fillStyle = '#2a3844';
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7fd8ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(28, -14);
  ctx.stroke();
  ctx.restore();

  // Gişe grileri (teller bars) — ön plan bandında.
  const counterY = H * 0.85;
  ctx.fillStyle = '#16283a';
  ctx.fillRect(0, counterY, W, H - counterY);
  ctx.strokeStyle = 'rgba(191,233,255,0.3)';
  ctx.lineWidth = 3;
  for (let x = 20; x < W; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, counterY - 30);
    ctx.lineTo(x, counterY);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------
// CASİNO — kumarhane: NET rulet çarkı + parlayan "CASİNO" neon tabelası +
// iskambil motifleri + fiş yığını.
function drawGazinoBackdrop(ctx, t) {
  drawSky(ctx, '#1c0f2e', '#170c26', '#0d0716');

  // Parlayan "CASİNO" tabelası.
  const pulse = 0.65 + 0.35 * Math.sin(t * 1.8);
  neonText(ctx, 'CASİNO', W / 2, H * 0.12, { size: 26, color: '#ff2e8c' });
  glow(ctx, W / 2, H * 0.12, 130, 'rgba(255,46,140,0.6)', 0.35 * pulse);

  // BÜYÜK, NET rulet çarkı — merkez-üst, kırmızı/siyah dilimler.
  ctx.save();
  ctx.translate(W * 0.28, H * 0.34);
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 66, (Math.PI * 2 * i) / segs, (Math.PI * 2 * (i + 1)) / segs);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#a41e28' : '#111';
    ctx.fill();
  }
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#d4af37';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Poker fiş yığını — sağda, net renkli disk yığını.
  ctx.save();
  ctx.translate(W * 0.78, H * 0.42);
  ['#ff2e8c', '#19e8ff', '#ffd23f', '#3ddc84'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(0, -i * 9, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();

  // İskambil motifleri (♠ ♦) — dekoratif, net ama küçük.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '28px serif';
  ctx.textAlign = 'center';
  ctx.fillText('♠', W * 0.12, H * 0.5);
  ctx.fillStyle = 'rgba(255,60,110,0.55)';
  ctx.fillText('♦', W * 0.9, H * 0.62);
  ctx.restore();

  // Kırmızı-yeşil kumarhane masa keçesi bandı.
  const tableY = H * 0.86;
  ctx.fillStyle = '#0d3a22';
  ctx.fillRect(0, tableY, W, H - tableY);
  ctx.fillStyle = 'rgba(255,46,140,0.35)';
  ctx.fillRect(0, tableY, W, 4);

  // Ara sıra yanıp sönen küçük neon noktalar (tabela ışığı hissi).
  for (let i = 0; i < 8; i++) {
    const x = (i * 61) % W;
    const y = H * 0.72 + ((i * 23) % (H * 0.1));
    const tw = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + i * 2.1));
    ctx.globalAlpha = tw * 0.6;
    ctx.fillStyle = i % 2 === 0 ? '#ff2e8c' : '#19e8ff';
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const DRAWERS = {
  park: drawParkBackdrop,
  sehir: drawCityBackdrop,
  karakol: drawKarakolBackdrop,
  camii: drawCamiiBackdrop,
  banka: drawBankaBackdrop,
  gazino: drawGazinoBackdrop,
};

// drawBroadcastBackdrop(ctx, locationId, t) — `t` saniye cinsinden geçen
// süre, sahnedeki yumuşak nabız/parıltı animasyonları için (tamamen
// dekoratif — dünya koordinatı/kamera YOK, sabit bir "stüdyo arka planı").
export function drawBroadcastBackdrop(ctx, locationId, t = 0) {
  ctx.clearRect(0, 0, W, H);
  (DRAWERS[locationId] || DRAWERS.sehir)(ctx, t);
}
