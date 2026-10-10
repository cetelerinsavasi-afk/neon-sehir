// v79 — SICAK BOMBA (2–4 kişi): bombası olan rakibe DOKUNARAK bombayı ona geçirir.
// Fitil bitince bomba kimdeyse elenir; yeni bomba kalanlardan birine geçer.
// Son kalan kazanır. Joystick ile koş, 💨 ile ani hızlan (kısa bekleme).
import { IN, has, clamp, r1, r2, PCOL, drawHudN, drawBanner, rnd, TAU } from './common.js';

const W = 320;
const H = 180;
const TOPY = 20;
const PR = 8;
const SPEED = 78;
const HOLD_BONUS = 1.12; // bombası olan biraz daha hızlı (kovalasın)
const DASH_T = 0.32;
const DASH_X = 2.1;
const PASS_CD = 0.7;
const OBST = [
  [110, 70, 22, 22],
  [190, 110, 22, 22],
  [150, 40, 20, 10],
  [150, 150, 20, 10],
];

const fuseFor = (s) => 9 + Math.floor(rnd((s.seed || 1) + s.rounds * 17) * 6); // 9–14 sn
function block(x, y) {
  if (x < PR || x > W - PR || y < TOPY + PR || y > H - PR) return true;
  for (const [ox, oy, ow, oh] of OBST) {
    const cx = clamp(x, ox, ox + ow);
    const cy = clamp(y, oy, oy + oh);
    if ((x - cx) ** 2 + (y - cy) ** 2 < PR * PR) return true;
  }
  return false;
}
function giveBomb(s) {
  const alive = s.p.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
  if (alive.length < 2) return;
  s.bomb = alive[Math.floor(rnd((s.seed || 1) * 3 + s.rounds * 29) * alive.length)];
  s.fuse = fuseFor(s);
  s.pcd = 1.2;
}

export default {
  id: 'bomba',
  title: 'Sıcak Bomba',
  emoji: '💣',
  desc: 'Bomba sendeyse birine dokun ve kurtul! Fitil bitince elinde patlayan elenir.',
  easy: { actions: IN.A, miss: 0.5 }, // v86: kolay bot
  how: 'Joystick: koş · 💨 hızlan',
  min: 2,
  max: 4,
  W,
  H,
  controls: { stick: true, left: [], right: ['A'], big: ['A'], labels: { A: '💨' } },
  create(names) {
    const n = names.length;
    const spots = [
      [40, 50],
      [280, 160],
      [280, 50],
      [40, 160],
    ];
    const s = { names, seed: Math.floor(Math.random() * 1e9), p: names.map((_, i) => ({ x: spots[i % 4][0], y: spots[i % 4][1], dash: 0, cd: 0, out: 0, pin: 0, run: 0 })), bomb: 0, fuse: 0, pcd: 0, rounds: 0, fx: [], pause: 2, msg: 'HAZIR', over: false, win: -1 };
    void n;
    giveBomb(s);
    return s;
  },
  step(s, inputs, dt) {
    if (s.over) return;
    s.fx = (s.fx || []).map((e) => ({ ...e, t: r2(e.t - dt) })).filter((e) => e.t > 0);
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) s.msg = '';
      return;
    }
    s.pcd = Math.max(0, s.pcd - dt);
    s.p.forEach((p, i) => {
      const inp = inputs[i] || 0;
      const press = has(inp, IN.A) && !has(p.pin, IN.A);
      p.pin = inp;
      if (p.out) return;
      p.cd = Math.max(0, p.cd - dt);
      p.dash = Math.max(0, p.dash - dt);
      if (press && p.cd <= 0) {
        p.dash = DASH_T;
        p.cd = 1.8;
      }
      let mx = (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0);
      let my = (has(inp, IN.D) ? 1 : 0) - (has(inp, IN.U) ? 1 : 0);
      const l = Math.hypot(mx, my);
      if (l) {
        mx /= l;
        my /= l;
        p.run += dt;
      }
      const sp = SPEED * (s.bomb === i ? HOLD_BONUS : 1) * (p.dash > 0 ? DASH_X : 1);
      const nx = p.x + mx * sp * dt;
      const ny = p.y + my * sp * dt;
      if (!block(nx, p.y)) p.x = nx;
      if (!block(p.x, ny)) p.y = ny;
    });
    // itişme + bomba geçişi
    for (let a = 0; a < s.p.length; a++)
      for (let b = a + 1; b < s.p.length; b++) {
        const A = s.p[a];
        const B = s.p[b];
        if (A.out || B.out) continue;
        const d = Math.hypot(B.x - A.x, B.y - A.y);
        if (d >= PR * 2 || d <= 0) continue;
        const push = (PR * 2 - d) / 2;
        const nx = (B.x - A.x) / d;
        const ny = (B.y - A.y) / d;
        if (!block(A.x - nx * push, A.y - ny * push)) {
          A.x -= nx * push;
          A.y -= ny * push;
        }
        if (!block(B.x + nx * push, B.y + ny * push)) {
          B.x += nx * push;
          B.y += ny * push;
        }
        if (!s._pred && s.pcd <= 0 && (s.bomb === a || s.bomb === b)) {
          s.bomb = s.bomb === a ? b : a;
          s.pcd = PASS_CD;
          s.fx.push({ x: r1((A.x + B.x) / 2), y: r1((A.y + B.y) / 2), t: 0.35, k: 'pass' });
        }
      }
    // fitil
    if (!s._pred) {
      s.fuse -= dt;
      if (s.fuse <= 0) {
        const v = s.p[s.bomb];
        v.out = 1;
        s.fx.push({ x: r1(v.x), y: r1(v.y), t: 0.8, k: 'boom' });
        s.rounds += 1;
        const alive = s.p.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
        if (alive.length <= 1) {
          s.over = true;
          s.win = alive[0] ?? -1;
          s.msg = s.win >= 0 ? `${s.names[s.win]} KAZANDI` : 'BERABERE';
        } else {
          s.msg = `💥 ${s.names[s.p.indexOf(v)]} patladı!`;
          s.pause = 1.5;
          giveBomb(s);
        }
      }
    }
    s.fuse = r2(s.fuse);
    s.p.forEach((p) => {
      p.x = r1(p.x);
      p.y = r1(p.y);
    });
  },
  result(s) {
    if (!s.over) return null;
    return { winner: s.win, text: s.win >= 0 ? 'Bombadan son kurtulan! 💣' : '' };
  },
  bot(s, i, mem) {
    const p = s.p[i];
    if (!p || p.out || s.pause > 0) return 0;
    mem.t = (mem.t || 0) + 1;
    let gx = 0;
    let gy = 0;
    let dash = false;
    if (s.bomb === i) {
      // en yakını kovala
      let best = Infinity;
      s.p.forEach((o, j) => {
        if (j === i || o.out) return;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < best) {
          best = d;
          gx = o.x - p.x;
          gy = o.y - p.y;
        }
      });
      dash = best < 34 && s.pcd <= 0;
    } else {
      const h = s.p[s.bomb];
      if (h && !h.out) {
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const d = Math.hypot(dx, dy) || 1;
        // kaçarken duvara sıkışma: merkeze doğru çek
        gx = dx / d + ((W / 2 - p.x) / W) * 1.4;
        gy = dy / d + ((H / 2 - p.y) / H) * 1.4;
        // yana kay (kovalayanı şaşırt)
        const side = Math.sin(mem.t / 40 + i) > 0 ? 1 : -1;
        gx += (-dy / d) * 0.6 * side;
        gy += (dx / d) * 0.6 * side;
        dash = d < 26;
      }
    }
    let a = Math.atan2(gy, gx);
    // önü engelse kenara dön
    if (block(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12)) a += Math.sin(mem.t / 30 + i) > 0 ? 1.3 : -1.3;
    let bits = 0;
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    if (ox > 0.38) bits |= IN.R;
    if (ox < -0.38) bits |= IN.L;
    if (oy > 0.38) bits |= IN.D;
    if (oy < -0.38) bits |= IN.U;
    // tepki gecikmesi (insan gibi)
    if (rnd(mem.t * 5 + i) < 0.08) bits = mem.last || 0;
    mem.last = bits;
    if (dash && p.cd <= 0 && rnd(mem.t + i * 7) < 0.3) bits |= IN.A;
    return bits;
  },
  render(c, s, me) {
    c.fillStyle = '#10140f';
    c.fillRect(0, 0, W, H);
    // zemin karoları
    for (let x = 0; x < W; x += 20)
      for (let y = TOPY; y < H; y += 20) {
        c.fillStyle = ((x + y) / 20) % 2 ? '#1a2418' : '#162014';
        c.fillRect(x, y, 20, 20);
      }
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 1;
    c.strokeRect(0.5, TOPY + 0.5, W - 1, H - TOPY - 1);
    for (const [x, y, w, h] of OBST) {
      c.fillStyle = '#5a3a1a';
      c.fillRect(x, y, w, h);
      c.strokeStyle = '#8a5a2a';
      c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + w, y + h);
      c.moveTo(x + w, y);
      c.lineTo(x, y + h);
      c.stroke();
    }
    const danger = s.fuse < 3;
    s.p.forEach((p, i) => {
      if (p.out) {
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.beginPath();
        c.arc(p.x, p.y, PR + 2, 0, TAU);
        c.fill();
        return;
      }
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(p.x, p.y + PR - 1, PR, 3, 0, 0, TAU);
      c.fill();
      if (p.dash > 0) {
        c.fillStyle = PCOL[i];
        c.globalAlpha = 0.3;
        c.beginPath();
        c.arc(p.x, p.y, PR + 4, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
      }
      const bob = Math.sin(p.run * 18) * 1.2;
      c.fillStyle = PCOL[i];
      c.beginPath();
      c.arc(p.x, p.y + bob, PR, 0, TAU);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(p.x - 3, p.y - 2 + bob, 2.4, 0, TAU);
      c.arc(p.x + 3, p.y - 2 + bob, 2.4, 0, TAU);
      c.fill();
      c.fillStyle = '#111';
      c.beginPath();
      c.arc(p.x - 3, p.y - 2 + bob, 1.1, 0, TAU);
      c.arc(p.x + 3, p.y - 2 + bob, 1.1, 0, TAU);
      c.fill();
      if (s.bomb === i) {
        // bomba (başının üstünde)
        const bx = p.x;
        const by = p.y - PR - 7 + bob;
        const flash = danger && Math.floor(s.fuse * 8) % 2;
        c.fillStyle = flash ? '#ff3b3b' : '#1b1b1b';
        c.beginPath();
        c.arc(bx, by, 5.5, 0, TAU);
        c.fill();
        c.strokeStyle = '#c9a46a';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(bx + 3, by - 4);
        c.quadraticCurveTo(bx + 6, by - 9, bx + 8, by - 7);
        c.stroke();
        c.fillStyle = Math.floor(s.fuse * 12) % 2 ? '#ffd23f' : '#ff6a1a';
        c.beginPath();
        c.arc(bx + 8, by - 7, 1.8, 0, TAU);
        c.fill();
        c.font = 'bold 7px system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = danger ? '#ff6b6b' : '#fff';
        c.fillText(Math.max(0, s.fuse).toFixed(1), bx, by - 10);
      }
      if (i === me) {
        c.strokeStyle = '#fff';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(p.x, p.y + bob, PR + 2, 0, TAU);
        c.stroke();
      }
    });
    for (const e of s.fx || []) {
      if (e.k === 'boom') {
        c.fillStyle = `rgba(255,140,40,${e.t})`;
        c.beginPath();
        c.arc(e.x, e.y, (0.8 - e.t) * 50 + 6, 0, TAU);
        c.fill();
      } else {
        c.strokeStyle = `rgba(255,255,255,${e.t * 2})`;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(e.x, e.y, (0.35 - e.t) * 40 + 4, 0, TAU);
        c.stroke();
      }
    }
    drawHudN(
      c,
      W,
      s.p.map((p, i) => ({ text: `${s.bomb === i && !p.out ? '💣' : ''}${s.names[i]}`, dead: p.out })),
      { center: `💣${Math.max(0, Math.ceil(s.fuse))}`, me, y: 3 }
    );
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? '' : s.pause > 0 && !s.rounds ? 'Bomba sendeyse birine dokun!' : '');
  },
};
