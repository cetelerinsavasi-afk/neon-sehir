// v79 — UZAY KOŞUSU (2–4 kişi): uzay boşluğunda koridor. Herkes kendiliğinden
// koşar; EKRANA DOKUN = yerçekimi ters döner (zeminden tavana / tavandan zemine).
// Boşluğa düşen ya da ekranın gerisinde kalan elenir. Bitişe ilk varan (ya da
// son ayakta kalan) kazanır. Parkur, odanın tohumundan (seed) iki cihazda aynı üretilir.
import { IN, has, clamp, r1, PCOL, drawBanner, rnd, rrect } from './common.js';

const W = 320;
const H = 180;
const COL = 20; // sütun genişliği
const TOP = 34; // tavan yüzeyi
const BOT = 150; // zemin yüzeyi
const FINISH_COLS = 190;
const FINISH_X = FINISH_COLS * COL;
const PW = 9; // oyuncu yarı genişlik
const PH = 11; // oyuncu yarı yükseklik
const GRAV = 1100;
const RUN = 104;
const SCROLL = 88;

// --- parkur (seed → sütunlar) ---------------------------------------------------------
// her sütun: { f: zemin var mı, c: tavan var mı, fb: zemindeki blok yüksekliği, cb: tavandaki blok }
const levelCache = new Map();
function level(seed) {
  if (levelCache.has(seed)) return levelCache.get(seed);
  const cols = [];
  const safe = () => ({ f: 1, c: 1, fb: 0, cb: 0 });
  for (let i = 0; i < 12; i++) cols.push(safe());
  let k = 0;
  while (cols.length < FINISH_COLS + 20) {
    const r = rnd(seed * 31 + k++);
    const diff = Math.min(1, cols.length / FINISH_COLS); // ilerledikçe zorlaşır
    const len = 2 + Math.floor(rnd(seed + k * 7) * (2 + diff * 2));
    const push = (o) => cols.push({ ...safe(), ...o });
    if (r < 0.2) for (let j = 0; j < len; j++) push({ f: 0 }); // zeminde boşluk → tavanda ol
    else if (r < 0.4) for (let j = 0; j < len; j++) push({ c: 0 }); // tavanda boşluk → zeminde ol
    else if (r < 0.58) push({ fb: 22 + Math.floor(rnd(k * 13 + seed) * 3) * 10 }); // zeminde blok
    else if (r < 0.76) push({ cb: 22 + Math.floor(rnd(k * 17 + seed) * 3) * 10 }); // tavanda blok
    else if (r < 0.86 && diff > 0.3) {
      // zikzak: önce zemin boşluğu sonra tavan boşluğu (hızlı iki dokunuş)
      for (let j = 0; j < 2; j++) push({ f: 0 });
      push({});
      for (let j = 0; j < 2; j++) push({ c: 0 });
    }
    // her engelden sonra kısa güvenli bölge (tepki süresi)
    const rest = 2 + Math.floor((1 - diff) * 3 + rnd(k * 3 + seed) * 2);
    for (let j = 0; j < rest; j++) push({});
  }
  levelCache.set(seed, cols);
  if (levelCache.size > 8) levelCache.delete(levelCache.keys().next().value);
  return cols;
}
const colAt = (lv, x) => lv[Math.max(0, Math.floor(x / COL))] || { f: 1, c: 1, fb: 0, cb: 0 };

// oyuncu kutusunun dolu bir yere girip girmediği (blok ya da yüzey)
function solidAt(lv, x, y) {
  const c = colAt(lv, x);
  if (y >= BOT && c.f) return true;
  if (y <= TOP && c.c) return true;
  if (c.fb && y >= BOT - c.fb) return true;
  if (c.cb && y <= TOP + c.cb) return true;
  return false;
}

export default {
  id: 'uzaykosusu',
  title: 'Uzay Koşusu',
  emoji: '🚀',
  desc: 'Ekrana dokun, yerçekimi ters dönsün! Boşluğa düşme, geride kalma, bitişe ilk sen var.',
  // v86: kolay bot — tehlikeye daha geç tepki verir
  easy: { actions: IN.A, miss: 0.12, skill: 0.5, delay: 5, pause: 1 / 400 },
  how: 'Ekrana dokun / ⇅ / Boşluk: zemin ⇄ tavan',
  min: 2,
  max: 4,
  W,
  H,
  controls: { left: [], right: ['A'], big: ['A'], labels: { A: '⇅' }, tap: true, hint: 'Ekrana dokun ya da Boşluk: yerçekimini çevir' },
  create(names) {
    const seed = Math.floor(Math.random() * 1e9);
    const p = names.map((_, i) => ({ x: 70 - i * 3, y: BOT - PH, vy: 0, g: 1, pin: 0, dead: 0, fin: 0, run: 0 }));
    return { names, seed, p, cam: 0, t: 0, pause: 2.2, msg: 'HAZIR?', over: false, win: -1, place: [] };
  },
  step(s, inputs, dt) {
    if (s.over) return;
    const lv = level(s.seed);
    if (s.pause > 0) {
      s.pause -= dt;
      s.msg = s.pause > 1.2 ? 'HAZIR?' : s.pause > 0.3 ? 'DOKUN = ⇅' : 'KOŞ!';
      if (s.pause <= 0) s.msg = '';
      return;
    }
    s.t += dt;
    const speedUp = 1 + Math.min(0.35, s.t / 120);
    s.p.forEach((p, i) => {
      const inp = inputs[i] || 0;
      const press = has(inp, IN.A) && !has(p.pin, IN.A);
      p.pin = inp;
      if (p.dead || p.fin) return;
      // yerde (yüzeye değiyor) mu?
      const grounded = p.g > 0 ? solidAt(lv, p.x - PW + 2, p.y + PH + 1) || solidAt(lv, p.x + PW - 2, p.y + PH + 1) : solidAt(lv, p.x - PW + 2, p.y - PH - 1) || solidAt(lv, p.x + PW - 2, p.y - PH - 1);
      if (press && grounded) {
        p.g = -p.g;
        p.vy = p.g * 60;
      }
      p.vy = clamp(p.vy + p.g * GRAV * dt, -420, 420);
      // dikey hareket + çarpışma
      let ny = p.y + p.vy * dt;
      if (p.vy > 0 && (solidAt(lv, p.x - PW + 2, ny + PH) || solidAt(lv, p.x + PW - 2, ny + PH))) {
        // aşağı doğru yüzeye otur
        const c = colAt(lv, p.x);
        const surf = c.fb ? BOT - c.fb : BOT;
        ny = Math.min(ny, surf - PH);
        p.vy = 0;
      } else if (p.vy < 0 && (solidAt(lv, p.x - PW + 2, ny - PH) || solidAt(lv, p.x + PW - 2, ny - PH))) {
        const c = colAt(lv, p.x);
        const surf = c.cb ? TOP + c.cb : TOP;
        ny = Math.max(ny, surf + PH);
        p.vy = 0;
      }
      p.y = ny;
      // yatay: koş, bloğa çarparsa dur
      const nx = p.x + RUN * speedUp * dt;
      const front = nx + PW;
      if (solidAt(lv, front, p.y - PH + 2) || solidAt(lv, front, p.y + PH - 2) || solidAt(lv, front, p.y)) p.x = Math.floor(front / COL) * COL - PW - 0.01;
      else p.x = nx;
      p.run += dt;
      // boşluğa düştü
      if (p.y > H + 20 || p.y < -20) p.dead = 1;
      // bitiş
      if (p.x >= FINISH_X && !p.fin) {
        p.fin = 1;
        s.place.push(i);
      }
    });
    // kamera: önde gideni izler, ama hep ilerler → geride kalan elenir
    const alive = s.p.filter((p) => !p.dead && !p.fin);
    const lead = Math.max(...s.p.map((p) => (p.dead ? 0 : p.x)));
    s.cam = Math.min(FINISH_X - W + 60, Math.max(s.cam + SCROLL * speedUp * dt, lead - W * 0.62));
    s.p.forEach((p) => {
      if (!p.dead && !p.fin && p.x < s.cam - PW) p.dead = 1; // ekranın gerisinde kaldı
    });
    if (!s._pred) {
      const n = s.p.length;
      const living = s.p.filter((p) => !p.dead).length;
      if (s.place.length) {
        s.over = true;
        s.win = s.place[0];
      } else if (n > 1 && alive.length <= 1 && living <= 1) {
        s.over = true;
        s.win = living === 1 ? s.p.findIndex((p) => !p.dead) : s.p.reduce((b, p, i) => (p.x > s.p[b].x ? i : b), 0);
      }
      if (s.over) s.msg = `${s.names[s.win]} KAZANDI`;
    }
    s.p.forEach((p) => {
      p.x = r1(p.x);
      p.y = r1(p.y);
      p.vy = r1(p.vy);
    });
    s.cam = r1(s.cam);
  },
  result(s) {
    if (!s.over) return null;
    const p = s.p[s.win];
    return { winner: s.win, text: p?.fin ? 'Bitişe ilk vardı! 🏁' : 'Son ayakta kalan oldu! 🚀' };
  },
  bot(s, i, mem) {
    const p = s.p[i];
    if (!p || p.dead || p.fin || s.pause > 0) return 0;
    const lv = level(s.seed);
    mem.cd = (mem.cd || 0) - 1 / 60;
    mem.skill = mem.skill ?? 0.82 + rnd(i * 101 + s.seed) * 0.16;
    if (mem.hold) {
      mem.hold -= 1;
      return IN.A;
    }
    if (mem.delay > 0) {
      // tepki gecikmesi: tehlikeyi gördü, biraz sonra dokunacak (bazen geç kalır)
      mem.delay -= 1;
      if (mem.delay <= 0) {
        mem.cd = 0.25;
        mem.hold = 3;
        return IN.A;
      }
      return 0;
    }
    if (mem.cd > 0) return 0;
    // önümdeki tehlike: kendi yüzeyimde boşluk ya da blok
    const look = 26;
    let danger = false;
    for (let dx = 8; dx <= look + 24; dx += 4) {
      const c = colAt(lv, p.x + dx);
      if (p.g > 0 && (!c.f || c.fb)) danger = true;
      if (p.g < 0 && (!c.c || c.cb)) danger = true;
      if (danger) {
        const c2 = colAt(lv, p.x + dx + 10);
        const otherOk = p.g > 0 ? c2.c && !c2.cb : c2.f && !c2.fb;
        if (!otherOk && dx > 20) danger = false;
        break;
      }
    }
    if (danger) {
      // her engelde bir kez karar: iyi bot hemen, kötü bot geç (bazen takılır/düşer)
      mem.n = (mem.n || 0) + 1;
      const r = rnd((s.seed || 1) + i * 7919 + mem.n * 31);
      mem.delay = 1 + Math.floor(r < mem.skill ? r * 4 : 8 + r * 14);
    }
    return 0;
  },
  render(c, s, me) {
    const lv = level(s.seed);
    const cam = s.cam;
    // uzay
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05021a');
    bg.addColorStop(1, '#140a33');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    for (let layer = 1; layer <= 3; layer++) {
      c.fillStyle = `rgba(255,255,255,${0.15 * layer})`;
      for (let k = 0; k < 26; k++) {
        const sx = (((k * 97 + layer * 31) % 400) - ((cam * layer * 0.15) % 400) + 400) % 400 - 40;
        const sy = (k * 53 + layer * 19) % H;
        c.fillRect(sx, sy, layer * 0.7, layer * 0.7);
      }
    }
    // gezegen
    c.fillStyle = 'rgba(255,79,216,0.12)';
    c.beginPath();
    c.arc(250 - ((cam * 0.05) % 500), 60, 34, 0, Math.PI * 2);
    c.fill();
    // koridor
    const first = Math.floor(cam / COL) - 1;
    for (let k = first; k < first + W / COL + 3; k++) {
      const col = lv[k];
      if (!col) continue;
      const x = k * COL - cam;
      if (col.f) {
        c.fillStyle = '#1b1f4a';
        c.fillRect(x, BOT, COL + 0.5, H - BOT);
        c.fillStyle = '#19e8ff';
        c.fillRect(x, BOT, COL + 0.5, 2);
      }
      if (col.c) {
        c.fillStyle = '#1b1f4a';
        c.fillRect(x, 0, COL + 0.5, TOP);
        c.fillStyle = '#ff4fd8';
        c.fillRect(x, TOP - 2, COL + 0.5, 2);
      }
      if (col.fb) {
        c.fillStyle = '#3a1450';
        c.fillRect(x + 1, BOT - col.fb, COL - 2, col.fb);
        c.strokeStyle = '#ff4fd8';
        c.strokeRect(x + 1.5, BOT - col.fb + 0.5, COL - 3, col.fb - 1);
      }
      if (col.cb) {
        c.fillStyle = '#103a50';
        c.fillRect(x + 1, TOP, COL - 2, col.cb);
        c.strokeStyle = '#19e8ff';
        c.strokeRect(x + 1.5, TOP + 0.5, COL - 3, col.cb - 1);
      }
    }
    // bitiş çizgisi
    const fx = FINISH_X - cam;
    if (fx < W + 10) {
      for (let y = TOP; y < BOT; y += 8) {
        c.fillStyle = (y / 8) % 2 ? '#fff' : '#111';
        c.fillRect(fx, y, 6, 8);
        c.fillStyle = (y / 8) % 2 ? '#111' : '#fff';
        c.fillRect(fx + 6, y, 6, 8);
      }
    }
    // oyuncular
    s.p.forEach((p, i) => {
      const x = p.x - cam;
      if (x < -20 || x > W + 20) return;
      c.save();
      c.translate(x, p.y);
      if (p.g < 0) c.scale(1, -1);
      c.globalAlpha = p.dead ? 0.3 : 1;
      // iz
      if (!p.dead) {
        c.fillStyle = PCOL[i];
        c.globalAlpha = 0.25;
        c.fillRect(-PW - 10, -4, 10, 8);
        c.globalAlpha = 1;
      }
      // gövde (astronot)
      c.fillStyle = PCOL[i];
      rrect(c, -PW + 1, -PH + 4, PW * 2 - 2, PH * 2 - 6, 4);
      c.fill();
      // kask
      c.fillStyle = '#e8f6ff';
      c.beginPath();
      c.arc(1, -PH + 4, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0a2240';
      rrect(c, 0, -PH + 1, 6, 5, 2);
      c.fill();
      // bacaklar (koşu)
      const ph = Math.sin(p.run * 22) * (p.dead ? 0 : 3);
      c.fillStyle = '#e8f6ff';
      c.fillRect(-4 + ph, PH - 3, 3, 3);
      c.fillRect(2 - ph, PH - 3, 3, 3);
      c.restore();
      if (i === me && !p.dead) {
        c.fillStyle = PCOL[i];
        const ty = p.g > 0 ? p.y - PH - 6 : p.y + PH + 6;
        c.beginPath();
        c.moveTo(x, ty + (p.g > 0 ? 3 : -3));
        c.lineTo(x - 3, ty - (p.g > 0 ? 2 : -2));
        c.lineTo(x + 3, ty - (p.g > 0 ? 2 : -2));
        c.fill();
      }
    });
    // ilerleme çubuğu (üstte, herkesin yeri)
    c.fillStyle = 'rgba(5,8,16,0.75)';
    rrect(c, 40, 6, W - 80, 10, 5);
    c.fill();
    c.fillStyle = '#fff';
    c.fillRect(W - 44, 7, 2, 8);
    s.p.forEach((p, i) => {
      const px = 44 + clamp(p.x / FINISH_X, 0, 1) * (W - 90);
      c.globalAlpha = p.dead ? 0.35 : 1;
      c.fillStyle = PCOL[i];
      c.beginPath();
      c.arc(px, 11, i === me ? 4 : 3, 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;
    c.font = 'bold 8px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillStyle = '#fff';
    c.fillText('🏁', W - 38, 14);
    // isimler (altta)
    c.textAlign = 'center';
    s.p.forEach((p, i) => {
      const x = 40 + (i + 0.5) * ((W - 80) / s.p.length);
      c.fillStyle = PCOL[i];
      c.globalAlpha = p.dead ? 0.4 : 1;
      c.fillText(`${p.dead ? '💀 ' : p.fin ? '🏁 ' : ''}${s.names[i]}`, x, H - 6, (W - 80) / s.p.length - 4);
    });
    c.globalAlpha = 1;
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? '' : s.pause > 0 ? 'Ekrana dokun = yerçekimini çevir' : '');
  },
};
