// broadcastBackdrops.js — KULLANICI REVİZESİ: röportaj/TV çekiminin arka
// planı artık lib/interviewLocations.js'in ESKİ yaklaşımı gibi (oyunun
// üstten/izometrik "dünya" sahnesini — drawBankSceneBackground vb. — bir
// kamera kutusuyla kırpıp göstermek) DEĞİL. Kullanıcı bunun "sanki o
// mekanda avatarımızla geziyormuşuz gibi" durduğunu belirtti; onun yerine
// GERÇEK BİR KAMERANIN arkamızdaki mekanı çektiği, sabit/düz (izometrik
// olmayan) bir "stüdyo arka planı" istendi — mekanlar oyundaki mekanı
// AYNEN birebir tekrarlamak zorunda değil, sadece o mekanı ANDIRMALI
// (palet + birkaç tanıdık öge yeterli). Gerçek bir kamera çekiminde arka
// plan hafif odak dışı (bokeh) görünür — bu his `glow()` ile yumuşak,
// bulanık ışık lekeleri çizerek taklit ediliyor. Saf Canvas 2D, yeni
// kütüphane YOK (genel kural).
export const BROADCAST_BACKDROP_W = 480;
export const BROADCAST_BACKDROP_H = 600;

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

// blurBlob — "odak dışı" bir siluet: aynı şekli birkaç kez, azalan
// opaklık ve büyüyen ölçekle üst üste çizip gerçek bir CSS/Canvas blur
// filtresi olmadan yumuşak/bulanık bir kenar hissi verir.
function blurBlob(ctx, drawShape, { layers = 4, growth = 3, baseAlpha = 0.16 } = {}) {
  for (let i = layers; i >= 0; i--) {
    ctx.save();
    ctx.globalAlpha = baseAlpha + (1 - i / layers) * (1 - baseAlpha) * 0.35;
    ctx.translate(0, 0);
    ctx.scale(1 + (i * growth) / 200, 1 + (i * growth) / 200);
    drawShape();
    ctx.restore();
  }
}

function drawSky(ctx, top, mid, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(ctx, seedT, count = 22) {
  for (let i = 0; i < count; i++) {
    const x = (i * 137.5) % W;
    const y = (i * 91.3) % (H * 0.42);
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
// PARK — gece parkı: yumuşak mor/lacivert gökyüzü, bulanık ağaç
// siluetleri, cyan neon lamba direği (hafif nabız), alt kenarda çim.
function drawParkBackdrop(ctx, t) {
  drawSky(ctx, '#1c1438', '#182a44', '#0e1c22');
  drawStars(ctx, t, 16);

  // Bulanık ağaçlar — arka planda, kameranın odak dışında.
  const trees = [
    { x: 60, y: H * 0.5, r: 92, color: '#173a26' },
    { x: 400, y: H * 0.46, r: 104, color: '#143220' },
    { x: 210, y: H * 0.4, r: 70, color: '#1c4a2e' },
  ];
  trees.forEach((tr) => {
    ctx.save();
    ctx.translate(tr.x, tr.y);
    blurBlob(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, tr.r, tr.r * 1.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = tr.color;
      ctx.fill();
    });
    ctx.restore();
  });

  // Lamba direği + sıcak/cyan parıltı (hafif nabız — gerçek bir sahne
  // ışığı gibi tamamen sabit durmasın).
  const pulse = 0.7 + 0.3 * Math.sin(t * 1.3);
  glow(ctx, W * 0.8, H * 0.4, 130, 'rgba(25,232,255,0.9)', 0.3 * pulse);
  ctx.fillStyle = 'rgba(20,30,40,0.8)';
  ctx.fillRect(W * 0.8 - 3, H * 0.4, 6, H * 0.46);
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.4, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#bffcff';
  ctx.fill();

  // Çim şeridi — sadece kadrajın en altında ince bir bant, "üstünde
  // duruyormuşuz" hissini vermesin diye avatarın omuz hizasının epey
  // altında kalıyor.
  const grassY = H * 0.88;
  const grass = ctx.createLinearGradient(0, grassY, 0, H);
  grass.addColorStop(0, '#173a26');
  grass.addColorStop(1, '#0a2016');
  ctx.fillStyle = grass;
  ctx.fillRect(0, grassY, W, H - grassY);
}

// ---------------------------------------------------------------------
// ŞEHİR — gece şehri: bulanık gökdelen silüetleri, neon pencere/tabela
// ışıkları, uzakta bir sokak lambası parıltısı.
function drawCityBackdrop(ctx, t) {
  drawSky(ctx, '#170f2b', '#101a30', '#0a0f1c');
  drawStars(ctx, t, 14);

  const buildings = [
    { x: -20, w: 110, h: H * 0.6, color: '#111a2c', neon: 'rgba(255,46,140,0.5)' },
    { x: 90, w: 130, h: H * 0.7, color: '#131c2e', neon: 'rgba(25,232,255,0.4)' },
    { x: 260, w: 100, h: H * 0.52, color: '#0f1626', neon: 'rgba(255,210,63,0.35)' },
    { x: 360, w: 140, h: H * 0.64, color: '#111a2c', neon: 'rgba(25,232,255,0.4)' },
  ];
  buildings.forEach((b) => {
    const top = H - b.h;
    ctx.save();
    blurBlob(ctx, () => {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, top, b.w, b.h);
    }, { layers: 3, growth: 1.2, baseAlpha: 0.35 });
    ctx.restore();
    // pencere ışıkları (rastgele ama sabit desen — Math.random YOK)
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = b.neon;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 3 === 0) continue;
        ctx.fillRect(b.x + 10 + col * (b.w / 4), top + 16 + row * 22, 6, 8);
      }
    }
    ctx.globalAlpha = 1;
  });

  // Neon rooftop reklam ışığı — çok hafif nabız.
  const pulse = 0.6 + 0.4 * Math.sin(t * 2.1);
  glow(ctx, 150, H * 0.32, 90, 'rgba(255,46,140,0.8)', 0.28 * pulse);

  // Sokak lambası (ön planda, ışığı belirgin).
  glow(ctx, W * 0.85, H * 0.5, 110, 'rgba(255,210,63,0.7)', 0.3);

  const roadY = H * 0.9;
  const road = ctx.createLinearGradient(0, roadY, 0, H);
  road.addColorStop(0, '#1c2331');
  road.addColorStop(1, '#0c1119');
  ctx.fillStyle = road;
  ctx.fillRect(0, roadY, W, H - roadY);
}

// ---------------------------------------------------------------------
// KARAKOL — komiserlik ofisi duvarı: koyu bordo/lacivert panel, Türk
// bayrağı, arkada bulanık parmaklık silueti, sıcak masa lambası parıltısı.
function drawKarakolBackdrop(ctx, t) {
  drawSky(ctx, '#241417', '#1c1418', '#100b0d');

  // Duvar paneli deseni.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H * 0.78);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Bulanık parmaklık silueti (nezarethane hissi — uzak/odak dışı).
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(24 + i * 14, H * 0.1, 5, H * 0.42);
  }
  ctx.restore();

  // Türk bayrağı — köşede, bulanık/uzak.
  ctx.save();
  ctx.translate(W * 0.78, H * 0.14);
  blurBlob(ctx, () => {
    ctx.fillStyle = '#3a2718';
    ctx.fillRect(-2, 0, 4, H * 0.4);
    ctx.fillStyle = '#a41e28';
    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.lineTo(62, 20);
    ctx.lineTo(2, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(24, 20, 7, 0, Math.PI * 2);
    ctx.fill();
  }, { layers: 3, growth: 1.4, baseAlpha: 0.25 });
  ctx.restore();

  // Masa lambası sıcak parıltısı — hafif titreşen floresan hissi.
  const flicker = 0.75 + 0.25 * Math.sin(t * 5.5) * (Math.sin(t * 0.7) > 0.85 ? 0.3 : 1);
  glow(ctx, W * 0.3, H * 0.58, 140, 'rgba(232,207,122,0.55)', 0.3 * flicker);

  const deskY = H * 0.86;
  ctx.fillStyle = '#241a14';
  ctx.fillRect(0, deskY, W, H - deskY);
  ctx.fillStyle = 'rgba(58,26,26,0.4)';
  ctx.fillRect(0, deskY, W, 6);
}

// ---------------------------------------------------------------------
// CAMİİ — saygılı/minimal: sıcak altın bir mihrap kemeri, geometrik
// desen aksanları, alt kenarda kırmızı halı bandı. Bilerek sade — madde
// 2b'deki "saygılı ve minimal" ruhu görsele de yansıyor, gösterişli/parlak
// neon efektleri YOK.
function drawCamiiBackdrop(ctx, t) {
  drawSky(ctx, '#231a10', '#1c140e', '#120d09');

  // Kubbe/kemer parıltısı — çok hafif, sabit yakın nabız (kandil hissi).
  const pulse = 0.85 + 0.15 * Math.sin(t * 0.9);
  glow(ctx, W / 2, H * 0.22, 220, 'rgba(201,162,39,0.35)', 0.5 * pulse);

  // Mihrap kemeri (basit sivri kemer silueti).
  ctx.save();
  ctx.translate(W / 2, H * 0.56);
  ctx.beginPath();
  ctx.moveTo(-70, 90);
  ctx.lineTo(-70, -10);
  ctx.quadraticCurveTo(-70, -90, 0, -100);
  ctx.quadraticCurveTo(70, -90, 70, -10);
  ctx.lineTo(70, 90);
  ctx.closePath();
  ctx.fillStyle = 'rgba(58,38,18,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,162,39,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Geometrik desen aksanı (üst köşeler, çok hafif).
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(40, 40, 14 + i * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W - 40, 40, 14 + i * 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Halı bandı — alt kenar.
  const carpetY = H * 0.87;
  ctx.fillStyle = '#3a1414';
  ctx.fillRect(0, carpetY, W, H - carpetY);
  ctx.fillStyle = 'rgba(201,162,39,0.35)';
  ctx.fillRect(0, carpetY, W, 3);
}

// ---------------------------------------------------------------------
// BANKA — kurumsal lobi: soğuk mavi/teal duvar, bulanık gişe/kasa
// siluetleri, tavan aydınlatması.
function drawBankaBackdrop(ctx, t) {
  drawSky(ctx, '#0e1c2c', '#101f2e', '#0a1420');

  // Tavan aydınlatma çubukları.
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#bfe9ff';
  for (let x = 30; x < W; x += 90) {
    ctx.fillRect(x, 18, 50, 5);
  }
  ctx.globalAlpha = 1;

  // Bulanık kasa dairesi (arka planda, uzak).
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.translate(W * 0.72, H * 0.42);
  ctx.strokeStyle = '#5c8aa8';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#3a5468';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Gişe camı parıltısı — hafif nabız.
  const pulse = 0.7 + 0.3 * Math.sin(t * 1.1);
  glow(ctx, W * 0.24, H * 0.5, 130, 'rgba(120,200,255,0.35)', 0.3 * pulse);

  // Gişe tezgahı (ön planda, düz bant).
  const counterY = H * 0.85;
  ctx.fillStyle = '#16283a';
  ctx.fillRect(0, counterY, W, H - counterY);
  ctx.fillStyle = 'rgba(191,233,255,0.15)';
  ctx.fillRect(0, counterY, W, 3);
}

// ---------------------------------------------------------------------
// CASİNO — kumarhane duvarı: mor/pembe neon, bulanık slot makinesi
// silüetleri, rulet motifi parıltısı.
function drawGazinoBackdrop(ctx, t) {
  drawSky(ctx, '#1c0f2e', '#170c26', '#0d0716');

  // Bulanık slot makinesi silüetleri.
  const slots = [
    { x: 40, color: '#3a1d5c' },
    { x: 380, color: '#5c1a4a' },
  ];
  slots.forEach((s) => {
    ctx.save();
    ctx.translate(s.x, H * 0.5);
    blurBlob(ctx, () => {
      ctx.fillStyle = s.color;
      ctx.fillRect(-34, -90, 68, 150);
      ctx.fillStyle = 'rgba(255,210,63,0.5)';
      ctx.fillRect(-24, -70, 48, 30);
    }, { layers: 3, growth: 1.6, baseAlpha: 0.3 });
    ctx.restore();
  });

  // Rulet motifi parıltısı — merkeze yakın, dönen bir vurgu hissi için
  // çok yavaş bir açısal pulse.
  const pulse = 0.6 + 0.4 * Math.sin(t * 1.7);
  glow(ctx, W * 0.5, H * 0.32, 170, 'rgba(255,46,140,0.5)', 0.32 * pulse);
  glow(ctx, W * 0.5, H * 0.32, 90, 'rgba(25,232,255,0.4)', 0.22 * (1 - pulse * 0.5));

  // Kırmızı-yeşil kumarhane halısı/masa keçesi bandı.
  const tableY = H * 0.87;
  ctx.fillStyle = '#0d3a22';
  ctx.fillRect(0, tableY, W, H - tableY);
  ctx.fillStyle = 'rgba(255,46,140,0.3)';
  ctx.fillRect(0, tableY, W, 3);

  // Ara sıra yanıp sönen küçük neon noktalar (tabela ışığı hissi).
  for (let i = 0; i < 10; i++) {
    const x = (i * 47) % W;
    const y = H * 0.1 + ((i * 29) % (H * 0.2));
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
