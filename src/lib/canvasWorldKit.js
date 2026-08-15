// canvasWorldKit.js — TAMAMEN jenerik (mekana özel HİÇBİR şey bilmeyen)
// canvas-dünya yardımcıları: yuvarlak dikdörtgen, avatar sprite çizimi,
// elde-tutulan ürün ikonu, konuşma baloncuğu düzeni, engel/çarpışma
// çözümü, NPC'lerin "arada bir konuşması" için deterministik satır
// döngüsü ve kamera-fotoğrafı render'ı. lib/parkScene.js (Park) BU
// dosyayı kullanır; Banka/Karakol/Camii/Gazino gibi diğer girilebilir
// mekanlar da AYNI temel fonksiyonları kullanır — her mekan sadece
// kendi sabit sahne çizimini (duvar/tezgah/kapı vb.) ve düzen verisini
// tanımlar.

export function roundRectC(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export const SPRITE_ASPECT = 320 / 580;
export const SPRITE_H = 118; // ekrandaki karakter boyu (piksel) — tüm mekanlarda ortak

// INTERIOR_AVATAR_SCALE — girilebilir mekanların (Banka/Karakol/Camii/
// Gazino/Araba Galerisi/Silah Mağazası/Modifiye Garajı) HER BİRİNDE kendi
// WorldScreen dosyasında tanımlı `AVATAR_SCALE` sabiti (madde 13) — hepsi
// AYNI değeri (1.42) kullanıyor ve kendi canlı kamera önizlemelerinde bunu
// `renderPhotoFrame`'e `focalScale` olarak veriyorlar (bkz. her
// WorldScreen'deki renderCameraPreview). PostAttachment.jsx (paylaşılan
// Sixtagram fotoğrafı) her mekanı TEK bir jenerik bileşenden (
// InteriorPhotoCanvas) çağırdığı için hangi mekanın hangi AVATAR_SCALE'i
// kullandığını bilmiyordu ve `focalScale` hiç vermiyordu (varsayılan 1'de
// kalıyordu) — DÜZELTME ("mekanlarda fotoğraf çektiğimizde npcler
// gözükmüyor" hata raporu): bu, paylaşılan fotoğrafın dikey kadrajının
// (CAMERA_VERTICAL_LIFT * focalScale) canlı önizlemeden ~25px farklı
// hesaplanmasına, dolayısıyla kadrajın kenarındaki dekoratif NPC'lerin
// paylaşılan karede görünmemesine sebep oluyordu. Artık PostAttachment.jsx
// bu sabiti buradan alıp TÜM mekanlar için tutarlı şekilde kullanıyor.
export const INTERIOR_AVATAR_SCALE = 1.42;

// --- Avatar görsel önbelleği (SVG -> <img>) -------------------------------
export function createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR) {
  const cache = new Map();
  return function getAvatarImage(avatar, pose) {
    const av = avatar || DEFAULT_AVATAR;
    const key = JSON.stringify(av) + '|' + pose;
    let entry = cache.get(key);
    if (!entry) {
      const markup = buildFullAvatarSvgMarkup(av, { pose });
      const img = new Image();
      entry = { img, ready: false };
      img.onload = () => { entry.ready = true; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
      cache.set(key, entry);
      if (cache.size > 50) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
    }
    return entry.ready ? entry.img : null;
  };
}

// --- Elde tutulan ürün ikonu (çay/kahve/tost/... — Park büfesi VE Gazino
// barı aynı ikon dilini kullanır) ------------------------------------------
export function drawHeldIcon(ctx, type, x, y, { animate = true } = {}) {
  if (!type) return;
  const now = animate ? performance.now() : 0;
  const bob = animate ? Math.sin(now / 480) * 2 : 0;
  const pulse = animate ? 1 + Math.max(0, Math.sin(now / 700)) * 0.18 : 1;
  const SCALE = 1.6;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(pulse * SCALE, pulse * SCALE);
  if (type === 'cay') {
    ctx.fillStyle = '#d6432b';
    ctx.beginPath();
    ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.lineTo(3, 6); ctx.lineTo(-3, 6);
    ctx.closePath(); ctx.fill();
  } else if (type === 'kahve') {
    ctx.fillStyle = '#f4e6d0';
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a2e18';
    ctx.beginPath(); ctx.arc(0, -1, 4.2, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'latte') {
    ctx.fillStyle = '#e8c68a';
    roundRectC(ctx, -5, -9, 10, 16, 3); ctx.fill();
    ctx.fillStyle = '#6b4226';
    roundRectC(ctx, -4.4, -3, 8.8, 9, 2); ctx.fill();
    ctx.fillStyle = '#f4e6d0';
    ctx.beginPath(); ctx.ellipse(0, -5, 4.4, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (animate) {
      const sparkle = Math.sin(now / 900 + 1.4);
      if (sparkle > 0.86) {
        const a = (sparkle - 0.86) / 0.14;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(5, -9); ctx.lineTo(5, -5);
        ctx.moveTo(3, -7); ctx.lineTo(7, -7);
        ctx.stroke();
      }
    }
  } else if (type === 'oralet') {
    ctx.fillStyle = '#e07a2c';
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'sosisli') {
    ctx.fillStyle = '#e8c68a';
    roundRectC(ctx, -8, -3, 16, 6, 3); ctx.fill();
    ctx.fillStyle = '#a83a2a';
    roundRectC(ctx, -6, -1.5, 12, 3, 1.5); ctx.fill();
  } else if (type === 'tost') {
    ctx.fillStyle = '#e8c68a';
    roundRectC(ctx, -7, -6, 14, 12, 2); ctx.fill();
    ctx.strokeStyle = '#a86b3c'; ctx.lineWidth = 1.2;
    roundRectC(ctx, -7, -6, 14, 12, 2); ctx.stroke();
  } else if (type === 'kokteyl') {
    // Gazino barı — martini kadehi.
    ctx.strokeStyle = '#e8c68a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(0, 1); ctx.lineTo(6, -6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 7); ctx.lineTo(4, 7); ctx.stroke();
    ctx.fillStyle = '#19e8ff';
    ctx.beginPath(); ctx.moveTo(-5.4, -5.4); ctx.lineTo(5.4, -5.4); ctx.lineTo(0, 0.4); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// drawAvatarSprite — bir varlığı world-space'teki x,baseY konumunda çizer.
// `entity`: { x, baseY, avatar, pose, facing, holding, name?, isSelf? }.
// `scale` — varsayılan 1 (tam boy); Camii'deki dilenci NPC'leri gibi küçük,
// köşeye sığdırılmış çizimler (bkz. MosqueWorldScreen drawBeggarNpcs) veya
// mekana özel büyütme (madde 13, AVATAR_SCALE) için kullanılır.
export function drawAvatarSprite(ctx, entity, getAvatarImage, { showName = true, scale = 1 } = {}) {
  const img = getAvatarImage(entity.avatar, entity.pose);
  const h = SPRITE_H * scale;
  const w = h * SPRITE_ASPECT;

  ctx.save();
  ctx.translate(entity.x, entity.baseY);
  if (entity.facing === 'left') ctx.scale(-1, 1);
  if (img) {
    ctx.drawImage(img, -w / 2, -h, w, h);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRectC(ctx, -w * 0.28, -h, w * 0.56, h, 12); ctx.fill();
  }
  ctx.restore();

  if (entity.holding) drawHeldIcon(ctx, entity.holding, entity.x + w * 0.32, entity.baseY - h * 0.42);

  if (showName && entity.name && !entity.isSelf) {
    ctx.fillStyle = 'rgba(20,12,8,0.75)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entity.name, entity.x, entity.baseY + 14);
  }
}

// --- Konuşma baloncukları (Park'ta kullanılan tasarımla BİREBİR aynı) ----
export const BUBBLE_FONT = '15px sans-serif';
export const BUBBLE_LINE_H = 20;
export const BUBBLE_MAX_TEXT_W = 176;
export const BUBBLE_PAD_X = 13;
export const BUBBLE_PAD_Y = 10;

export function wrapBubbleText(ctx, text) {
  ctx.font = BUBBLE_FONT;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';

  const addWord = (word) => {
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

export function measureBubble(ctx, lines) {
  ctx.font = BUBBLE_FONT;
  let maxW = 40;
  lines.forEach((l) => { maxW = Math.max(maxW, ctx.measureText(l).width); });
  return {
    w: Math.min(BUBBLE_MAX_TEXT_W, maxW) + BUBBLE_PAD_X * 2,
    h: lines.length * BUBBLE_LINE_H + BUBBLE_PAD_Y * 2,
  };
}

export function layoutBubbles(items) {
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

export function drawBubbleBox(ctx, item, boundsW) {
  let bx = item.x - item.w / 2;
  bx = Math.max(8, Math.min(boundsW - 8 - item.w, bx));
  const tailX = Math.max(bx + 16, Math.min(bx + item.w - 16, item.x));
  // by — yeni istek (madde 8: "gazinoda barmenin yazı balonu üstte kaldığı
  // için gözükmüyor") — bir NPC tavana çok yakınsa (dar bir niş) hesaplanan
  // naturalTop ekranın DIŞINA (negatif y) çıkabiliyordu, balon tamamen
  // görünmez oluyordu. Son güvenlik olarak burada 8px'in altına inmesin diye
  // kelepçeleniyor — X eksenindeki kelepçeyle (yukarıdaki `bx`) aynı mantık.
  const by = Math.max(8, item.top);

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

// --- Jenerik daire/dikdörtgen engel çözümü (oyuncu hareketi) --------------
// obstacles: [{cx,cy,r}] veya [{cx,cy,hw,hh}] karışık liste.
export function resolveObstaclePosition(x, y, obstacles, { playerRadius, minX, maxX, minY, maxY }) {
  let nx = x;
  let ny = y;
  for (const o of obstacles) {
    const dx0 = nx - o.cx;
    const dy0 = ny - o.cy;
    if (o.r != null) {
      const d = Math.hypot(dx0, dy0);
      const minD = o.r + playerRadius;
      if (d < minD) {
        if (d < 0.001) { nx = o.cx + minD; ny = o.cy; }
        else { const scale = minD / d; nx = o.cx + dx0 * scale; ny = o.cy + dy0 * scale; }
      }
    } else if (Math.abs(dx0) < o.hw + playerRadius && Math.abs(dy0) < o.hh + playerRadius) {
      const overlapX = o.hw + playerRadius - Math.abs(dx0);
      const overlapY = o.hh + playerRadius - Math.abs(dy0);
      if (overlapX < overlapY) nx = o.cx + Math.sign(dx0 || 1) * (o.hw + playerRadius);
      else ny = o.cy + Math.sign(dy0 || 1) * (o.hh + playerRadius);
    }
  }
  nx = Math.max(minX, Math.min(maxX, nx));
  ny = Math.max(minY, Math.min(maxY, ny));
  return { x: nx, y: ny };
}

// --- NPC'lerin "arada bir konuşması" -------------------------------------
// cyclingLine — saat bazlı DETERMİNİSTİK satır seçimi: her istemci aynı
// anda aynı satırı gösterir (ileride çoklu oyunculu olursa senkron
// gerekmez), ve satır `holdMs` boyunca sabit kalıp aradan sonra bir
// sonrakine geçer. `phase` aynı ekranda birden fazla NPC'nin AYNI ANDA
// konuşmamasını sağlamak için her NPC'ye farklı bir kayma değeri verir.
export function cyclingLine(lines, { intervalMs = 26000, holdMs = 4200, phase = 0 } = {}) {
  if (!lines || !lines.length) return null;
  const t = Date.now() + phase * 1000;
  const cyclePos = t % intervalMs;
  if (cyclePos > holdMs) return null;
  const idx = Math.floor(t / intervalMs) % lines.length;
  return lines[idx];
}

// --- Kamera karesi (jenerik) ----------------------------------------------
// renderPhotoFrame — her mekan kendi `drawBackground(ctx)` fonksiyonunu
// verir (world-space'te, translate edilmiş ctx ile çağrılır); geri kalan
// (kırpma, entity dizilimi, vignette) TÜM mekanlarda ortak.
//
// CAMERA_VERTICAL_LIFT (madde 2 düzeltmesi) — originX/originY, karakterin
// AYAKLARININ world-space konumu (drawAvatarSprite baseY'den yukarı doğru
// çiziyor). Eskiden bu nokta doğrudan kare merkezine denk geliyordu, yani
// karakterin gövdesi/başı SPRITE_H kadar yukarıda kalıp kare hep "üstte"
// görünüyordu. Bunun yerine, kadrajı karakterin gövde ortası (ayaklardan
// ~yarım boy yukarısı) kare merkezine gelecek şekilde kaydırıyoruz — hem
// tekli hem çoklu (Park) kareler için aynı düzeltme geçerli.
const CAMERA_VERTICAL_LIFT = SPRITE_H * 0.5;

// focalScale (opsiyonel, varsayılan 1) — madde 13: bina içlerinde avatarlar
// büyütülünce (bkz. her WorldScreen'deki AVATAR_SCALE), kadrajın dikey
// kaydırması da o büyümeye göre ölçeklenmeli, yoksa büyümüş avatar yine
// merkezden kayık görünür. AYRICA (yeni düzeltme): bir entity kendi
// `scale`'ini vermezse artık sabit 1 yerine BU `focalScale` kullanılır
// (aşağıdaki `e.scale ?? focalScale`) — böylece bir mekan sadece TEK bir
// `focalScale` verip hem kadraj kaymasını HEM DE o mekandaki avatarların
// (self/NPC fark etmez) fotoğraftaki gerçek çizim boyutunu birlikte kontrol
// edebiliyor; ayrı ayrı her entity'ye `scale` eklemeyi unutma riski kalmıyor.
//
// NOT — PHOTO_ZOOM kaldırıldı: "fotoğraflar daha fazla zoomlanmasın, kamera
// mesafesi iyi" isteği üzerine, eskiden TÜM sahneyi (arka plan dahil) 1.35x
// büyüten ek bir "selfie" yakınlaştırması buradaydı; bu artık YOK, kare
// canlı görünümdeki doğal mesafeyle eşleşiyor (zoom=1). "Avatar fotoğrafta
// küçülüyor" şikayetinin asıl kaynağı zoom değildi — bkz. Park'taki
// AVATAR_SCALE tutarsızlığı (ParkWorldScreen.jsx, madde 3/13).
export function renderPhotoFrame(ctx, { width, height, originX, originY, entities, getAvatarImage, drawBackground, focalScale = 1, zoom = 1 }) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-originX, -originY + CAMERA_VERTICAL_LIFT * focalScale);
  if (drawBackground) drawBackground(ctx);

  const sorted = [...entities].sort((a, b) => (a.dy ?? 0) - (b.dy ?? 0));
  sorted.forEach((e) => {
    const sitShift = e.sitShift ?? 0;
    drawAvatarSprite(
      ctx,
      {
        x: originX + (e.dx ?? 0),
        baseY: originY + (e.dy ?? 0) + sitShift,
        avatar: e.avatar,
        pose: e.pose,
        facing: e.facing,
        holding: e.holding,
        name: e.name,
        isSelf: e.isSelf,
      },
      getAvatarImage,
      { showName: false, scale: e.scale ?? focalScale }
    );
  });

  ctx.restore();

  // Konuşma baloncukları — yeni istek: "mesajlar da fotoğrafta gözükse çok
  // iyi olur". Her entity'nin (varsa) EN GÜNCEL aktif mesajı balon olarak
  // çizilir — bir fotoğraf karesi için birden fazla mesaj yığmak (canlı
  // sahnedeki gibi) kalabalık olurdu, o yüzden burada sadece TEK (en yeni)
  // balon gösteriliyor. Yukarıdaki world-space (zoom+translate) blok
  // kapatıldıktan SONRA, EKRAN (screen-space) koordinatlarına elle
  // çevirip çiziyoruz — drawBubbleBox'ın kenar-kelepçesi (boundsW) ancak
  // gerçek ekran genişliğiyle (width) anlamlı, world-space'te değil.
  ctx.save();
  const bubbleItems = [];
  sorted.forEach((e) => {
    if (!e.bubbleText) return;
    const lines = wrapBubbleText(ctx, e.bubbleText);
    const { w, h } = measureBubble(ctx, lines);
    const worldX = originX + (e.dx ?? 0);
    const worldBaseY = originY + (e.dy ?? 0) + (e.sitShift ?? 0);
    const screenX = width / 2 + (worldX - originX) * zoom;
    const screenAnchorY =
      height / 2 + (worldBaseY - originY + CAMERA_VERTICAL_LIFT * focalScale) * zoom
      - SPRITE_H * (e.scale ?? focalScale) * zoom - 8;
    bubbleItems.push({ x: screenX, w, h, lines, ts: e.bubbleTs || 0, naturalTop: screenAnchorY - h });
  });
  layoutBubbles(bubbleItems).forEach((item) => drawBubbleBox(ctx, item, width));
  ctx.restore();

  ctx.save();
  const vg = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.32,
    width / 2, height / 2, Math.max(width, height) * 0.75
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
