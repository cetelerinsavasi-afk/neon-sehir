// v79 — TANK SAVAŞI (2–4 kişi): kuşbakışı arena. Joystick ile tankı istediğin
// yöne sür (tank o yöne döner ve ilerler), 💥 ile ateş et. Mermiler duvardan bir
// kez seker. Herkesin 3 canı var; vurulan kısa bir kalkanla yeniden doğar.
// Son ayakta kalan kazanır (2 dk dolarsa en çok canı kalan).
import { IN, has, clamp, r1, r2, PCOL, drawHudN, drawBanner, rnd, rrect, angNorm, TAU } from './common.js';

const W = 320;
const H = 180;
const TOPY = 20; // HUD altı
const R = 7; // tank yarıçapı
const SPEED = 62;
const TURN = 6.5;
const BSPEED = 165;
const LIVES = 3;
const MATCH_S = 120;
const MAPS = [
  [[150, 60, 20, 60], [60, 50, 40, 10], [220, 50, 40, 10], [60, 140, 40, 10], [220, 140, 40, 10], [30, 92, 12, 22], [278, 92, 12, 22]],
  [[100, 40, 12, 50], [208, 110, 12, 50], [140, 92, 40, 12], [40, 120, 40, 10], [240, 50, 40, 10]],
  [[80, 70, 30, 30], [210, 70, 30, 30], [145, 34, 30, 14], [145, 140, 30, 14], [30, 40, 14, 14], [276, 140, 14, 14]],
];
const SPAWN = [
  [24, TOPY + 14],
  [W - 24, H - 14],
  [W - 24, TOPY + 14],
  [24, H - 14],
];
const wallsOf = (s) => MAPS[s.map % MAPS.length];

function hitWall(walls, x, y, r) {
  if (x < r || x > W - r || y < TOPY + r || y > H - r) return true;
  for (const [wx, wy, ww, wh] of walls) {
    const cx = clamp(x, wx, wx + ww);
    const cy = clamp(y, wy, wy + wh);
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
  }
  return false;
}
function los(walls, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  for (let t = 6; t < d; t += 5) if (hitWall(walls, ax + ((bx - ax) * t) / d, ay + ((by - ay) * t) / d, 1)) return false;
  return true;
}
function spawn(p, i) {
  const [x, y] = SPAWN[i % 4];
  p.x = x;
  p.y = y;
  p.a = Math.atan2(H / 2 + TOPY / 2 - y, W / 2 - x);
  p.inv = 1.6;
}

export default {
  id: 'tank',
  title: 'Tank Savaşı',
  emoji: '🪖',
  desc: 'Arenada son ayakta kalan tank ol! Mermiler duvardan seker, 3 canın var.',
  how: 'Joystick: sür · 💥 ateş',
  min: 2,
  max: 4,
  W,
  H,
  controls: { stick: true, left: [], right: ['A'], big: ['A'], labels: { A: '💥' } },
  noLerp: ['ac'],
  create(names) {
    const p = names.map((_, i) => {
      const t = { x: 0, y: 0, a: 0, hp: LIVES, inv: 0, cd: 0, out: 0, pin: 0, ac: 0 };
      spawn(t, i);
      return t;
    });
    return { names, map: Math.floor(Math.random() * MAPS.length), p, bul: [], fx: [], t: MATCH_S, pause: 2, msg: 'HAZIR', over: false, win: -1, tick: 0, nb: 0 };
  },
  step(s, inputs, dt) {
    if (s.over) return;
    s.fx = (s.fx || []).map((e) => ({ ...e, t: r2(e.t - dt) })).filter((e) => e.t > 0);
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) s.msg = '';
      return;
    }
    s.tick += 1;
    s.t = Math.max(0, s.t - dt);
    const walls = wallsOf(s);
    s.p.forEach((p, i) => {
      const inp = inputs[i] || 0;
      const fire = has(inp, IN.A) && !has(p.pin, IN.A);
      p.pin = inp;
      if (p.out) return;
      p.inv = Math.max(0, p.inv - dt);
      p.cd = Math.max(0, p.cd - dt);
      const mx = (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0);
      const my = (has(inp, IN.D) ? 1 : 0) - (has(inp, IN.U) ? 1 : 0);
      if (mx || my) {
        const want = Math.atan2(my, mx);
        const d = angNorm(want - p.a);
        p.a = angNorm(p.a + clamp(d, -TURN * dt, TURN * dt));
        if (Math.abs(d) < 1.1) {
          const nx = p.x + Math.cos(p.a) * SPEED * dt;
          const ny = p.y + Math.sin(p.a) * SPEED * dt;
          if (!hitWall(walls, nx, p.y, R)) p.x = nx;
          if (!hitWall(walls, p.x, ny, R)) p.y = ny;
        }
      }
      const mine = s.bul.filter((b) => b.o === i).length;
      if (fire && p.cd <= 0 && mine < 2) {
        p.cd = 0.45;
        p.ac = 0.12;
        s.nb = (s.nb || 0) + 1;
        s.bul.push({ id: s.nb, x: r1(p.x + Math.cos(p.a) * (R + 3)), y: r1(p.y + Math.sin(p.a) * (R + 3)), vx: r1(Math.cos(p.a) * BSPEED), vy: r1(Math.sin(p.a) * BSPEED), o: i, b: 1, life: 2.6 });
      }
      p.ac = Math.max(0, p.ac - dt);
    });
    // tanklar birbirine girmesin
    for (let a = 0; a < s.p.length; a++)
      for (let b = a + 1; b < s.p.length; b++) {
        const A = s.p[a];
        const B = s.p[b];
        if (A.out || B.out) continue;
        const d = Math.hypot(B.x - A.x, B.y - A.y);
        if (d > 0 && d < R * 2) {
          const push = (R * 2 - d) / 2;
          const nx = (B.x - A.x) / d;
          const ny = (B.y - A.y) / d;
          if (!hitWall(walls, A.x - nx * push, A.y - ny * push, R)) {
            A.x -= nx * push;
            A.y -= ny * push;
          }
          if (!hitWall(walls, B.x + nx * push, B.y + ny * push, R)) {
            B.x += nx * push;
            B.y += ny * push;
          }
        }
      }
    // mermiler
    const keep = [];
    for (const b of s.bul) {
      b.life -= dt;
      let nx = b.x + b.vx * dt;
      let ny = b.y + b.vy * dt;
      let dead = b.life <= 0;
      if (!dead && hitWall(walls, nx, ny, 1.5)) {
        if (b.b > 0) {
          b.b -= 1;
          if (hitWall(walls, nx, b.y, 1.5)) b.vx = -b.vx;
          if (hitWall(walls, b.x, ny, 1.5)) b.vy = -b.vy;
          nx = b.x;
          ny = b.y;
        } else dead = true;
      }
      b.x = r1(nx);
      b.y = r1(ny);
      if (!dead) {
        for (let i = 0; i < s.p.length; i++) {
          const p = s.p[i];
          if (p.out || p.inv > 0) continue;
          if (i === b.o && b.b > 0) continue; // sekmeden kendi mermisi vurmaz
          if (Math.hypot(p.x - b.x, p.y - b.y) < R + 1.5) {
            dead = true;
            if (!s._pred) {
              p.hp -= 1;
              s.fx.push({ x: r1(p.x), y: r1(p.y), t: 0.5 });
              if (p.hp <= 0) p.out = 1;
              else spawn(p, i);
            }
            break;
          }
        }
      }
      if (!dead) keep.push(b);
      else s.fx.push({ x: b.x, y: b.y, t: 0.18, s: 1 });
    }
    s.bul = keep;
    if (!s._pred) {
      const alive = s.p.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
      if (alive.length <= 1 || s.t <= 0) {
        s.over = true;
        if (alive.length === 1) s.win = alive[0];
        else {
          const best = Math.max(...s.p.map((p) => p.hp));
          const tops = s.p.map((p, i) => (p.hp === best && !p.out ? i : -1)).filter((i) => i >= 0);
          s.win = tops.length === 1 ? tops[0] : -1;
        }
        s.msg = s.win >= 0 ? `${s.names[s.win]} KAZANDI` : 'BERABERE';
      }
    }
    s.p.forEach((p) => {
      p.x = r1(p.x);
      p.y = r1(p.y);
      p.a = r2(p.a);
    });
  },
  result(s) {
    if (!s.over) return null;
    return { winner: s.win, text: s.win >= 0 ? `Son ayakta kalan: ${s.names[s.win]}` : 'Süre bitti, canlar eşit' };
  },
  bot(s, i, mem) {
    const p = s.p[i];
    if (!p || p.out || s.pause > 0) return 0;
    const walls = wallsOf(s);
    // en yakın düşman
    let tgt = null;
    let best = Infinity;
    s.p.forEach((o, j) => {
      if (j === i || o.out) return;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < best) {
        best = d;
        tgt = o;
      }
    });
    if (!tgt) return 0;
    mem.t = (mem.t || 0) + 1;
    let bits = 0;
    const see = los(walls, p.x, p.y, tgt.x, tgt.y);
    const aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    let want = aim;
    if (!see || best < 40) {
      // görüş yoksa dolaş; çok yakınsa yana kaç
      if (!mem.wd || mem.t % 90 === 0) mem.wd = rnd(mem.t * 7 + i) < 0.5 ? 1 : -1;
      want = aim + mem.wd * (see ? 1.4 : 0.6);
      // önü duvarsa dön
      if (hitWall(walls, p.x + Math.cos(want) * 14, p.y + Math.sin(want) * 14, R)) want += mem.wd * 1.6;
    }
    // gelen mermiden kaç
    for (const b of s.bul) {
      if (b.o === i) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const along = (dx * b.vx + dy * b.vy) / BSPEED;
      if (along > 0 && along < 50 && Math.abs((dx * b.vy - dy * b.vx) / BSPEED) < 10) want = Math.atan2(b.vx, -b.vy);
    }
    const ox = Math.cos(want);
    const oy = Math.sin(want);
    if (ox > 0.38) bits |= IN.R;
    if (ox < -0.38) bits |= IN.L;
    if (oy > 0.38) bits |= IN.D;
    if (oy < -0.38) bits |= IN.U;
    // nişan tuttuysa ateş (bazen ıskalasın)
    if (see && Math.abs(angNorm(aim - p.a)) < 0.18 && p.cd <= 0 && rnd(mem.t * 3 + i * 11) < 0.35) bits |= IN.A;
    if (see && Math.abs(angNorm(aim - p.a)) < 0.6 && best > 40) {
      // önce döndür, sonra yürü: hedefe dönükken ateş için hafif bekle
      bits &= ~(IN.L | IN.R | IN.U | IN.D);
      const ax = Math.cos(aim);
      const ay = Math.sin(aim);
      if (mem.t % 40 < 30) {
        if (ax > 0.38) bits |= IN.R;
        if (ax < -0.38) bits |= IN.L;
        if (ay > 0.38) bits |= IN.D;
        if (ay < -0.38) bits |= IN.U;
      }
    }
    return bits;
  },
  render(c, s, me) {
    c.fillStyle = '#0b1020';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(25,232,255,0.06)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 16) {
      c.beginPath();
      c.moveTo(x, TOPY);
      c.lineTo(x, H);
      c.stroke();
    }
    for (let y = TOPY; y <= H; y += 16) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    c.strokeStyle = 'rgba(25,232,255,0.4)';
    c.strokeRect(0.5, TOPY + 0.5, W - 1, H - TOPY - 1);
    for (const [x, y, w, h] of wallsOf(s)) {
      c.fillStyle = '#20264a';
      rrect(c, x, y, w, h, 2);
      c.fill();
      c.strokeStyle = '#7a5cff';
      c.lineWidth = 1;
      c.stroke();
    }
    // mermiler
    for (const b of s.bul) {
      c.fillStyle = PCOL[b.o];
      c.shadowColor = PCOL[b.o];
      c.shadowBlur = 6;
      c.beginPath();
      c.arc(b.x, b.y, 2, 0, TAU);
      c.fill();
      c.shadowBlur = 0;
    }
    // tanklar
    s.p.forEach((p, i) => {
      if (p.out) return;
      c.save();
      c.translate(p.x, p.y);
      if (p.inv > 0 && Math.floor(p.inv * 10) % 2) c.globalAlpha = 0.45;
      c.rotate(p.a);
      // paletler
      c.fillStyle = '#111';
      c.fillRect(-R, -R, R * 2, 3);
      c.fillRect(-R, R - 3, R * 2, 3);
      // gövde
      c.fillStyle = PCOL[i];
      rrect(c, -R + 1, -R + 2, R * 2 - 2, R * 2 - 4, 2);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath();
      c.arc(0, 0, 3.4, 0, TAU);
      c.fill();
      // namlu (ateşte geri teper)
      c.fillStyle = '#e8edf6';
      c.fillRect(1 - (p.ac > 0 ? 2 : 0), -1.2, R + 3, 2.4);
      c.restore();
      if (p.inv > 0) {
        c.strokeStyle = 'rgba(255,255,255,0.5)';
        c.beginPath();
        c.arc(p.x, p.y, R + 3, 0, TAU);
        c.stroke();
      }
      // canlar
      for (let k = 0; k < LIVES; k++) {
        c.fillStyle = k < p.hp ? '#ff4d6d' : 'rgba(255,255,255,0.15)';
        c.fillRect(p.x - 6 + k * 4.5, p.y - R - 6, 3.5, 2.5);
      }
      if (i === me) {
        c.fillStyle = PCOL[i];
        c.beginPath();
        c.moveTo(p.x, p.y - R - 8);
        c.lineTo(p.x - 3, p.y - R - 13);
        c.lineTo(p.x + 3, p.y - R - 13);
        c.fill();
      }
    });
    // patlamalar
    for (const e of s.fx || []) {
      const big = !e.s;
      c.fillStyle = big ? `rgba(255,170,60,${e.t * 1.6})` : `rgba(255,255,255,${e.t * 4})`;
      c.beginPath();
      c.arc(e.x, e.y, big ? (0.5 - e.t) * 34 + 4 : 3, 0, TAU);
      c.fill();
    }
    drawHudN(
      c,
      W,
      s.p.map((p, i) => ({ text: `${s.names[i]} ${'♥'.repeat(Math.max(0, p.hp))}`, dead: p.out })),
      { center: `⏱${Math.ceil(s.t)}`, me, y: 3 }
    );
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? '' : 'Joystick: sür · 💥 ateş');
  },
};
