// v75 — KAFA TOPU: iki koca kafalı oyuncu, 60 sn, en çok golü atan kazanır.
// Kontrol: ◀ ▶ hareket · ⤴ zıpla · 👟 şut
import { IN, has, clamp, r1, PCOL, drawHud, drawBanner } from './common.js';

const W = 320;
const H = 180;
const GROUND = 160;
const PR = 15; // oyuncu (kafa) yarıçapı
const BR = 7; // top
const GOAL_W = 18;
const BAR_Y = 98; // üst direk
const MATCH_S = 60;
const G_P = 760;
const G_B = 520;

function kickoff(s, scorer) {
  s.p = [
    { x: 80, y: GROUND - PR, vx: 0, vy: 0, kick: 0, cd: 0 },
    { x: W - 80, y: GROUND - PR, vx: 0, vy: 0, kick: 0, cd: 0 },
  ];
  s.b = { x: W / 2, y: 60, vx: scorer === 0 ? 40 : scorer === 1 ? -40 : 0, vy: 0 };
}

export default {
  id: 'kafatopu',
  title: 'Kafa Topu',
  emoji: '⚽',
  desc: '60 saniyede en çok golü at. Kafa vur, zıpla, şut çek!',
  W,
  H,
  controls: { left: ['L', 'R'], right: ['U', 'A'], labels: { U: '⤴', A: '👟' } },
  create(names) {
    const s = { names, t: MATCH_S, sc: [0, 0], pause: 1.2, msg: 'HAZIR', over: false };
    kickoff(s, -1);
    return s;
  },
  step(s, inputs, dt) {
    if (s.over) return;
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) s.msg = '';
      return;
    }
    s.t = Math.max(0, s.t - dt);
    s.p.forEach((p, i) => {
      const inp = inputs[i] || 0;
      const dir = i === 0 ? 1 : -1;
      const move = (has(inp, IN.R) ? 1 : 0) - (has(inp, IN.L) ? 1 : 0);
      p.vx = move * 120;
      const onGround = p.y >= GROUND - PR - 0.5;
      if (has(inp, IN.U) && onGround) p.vy = -280;
      p.vy += G_P * dt;
      p.x = clamp(p.x + p.vx * dt, GOAL_W + PR, W - GOAL_W - PR);
      p.y = Math.min(GROUND - PR, p.y + p.vy * dt);
      if (p.y >= GROUND - PR) p.vy = 0;
      p.cd = Math.max(0, p.cd - dt);
      p.kick = Math.max(0, p.kick - dt);
      if (has(inp, IN.A) && p.cd <= 0) {
        p.kick = 0.18;
        p.cd = 0.35;
        // ayak önde-aşağıda: topa yakınsa şut
        const fx = p.x + dir * 14;
        const fy = p.y + PR - 2;
        const dx = s.b.x - fx;
        const dy = s.b.y - fy;
        if (Math.hypot(dx, dy) < 22) {
          s.b.vx = dir * 330 + p.vx * 0.3;
          s.b.vy = -230 - Math.random() * 40;
        }
      }
    });
    // oyuncular birbirine girmesin
    const [a, c] = s.p;
    const d = Math.hypot(c.x - a.x, c.y - a.y);
    if (d < PR * 2 && d > 0) {
      const push = (PR * 2 - d) / 2;
      const nx = (c.x - a.x) / d;
      a.x -= nx * push;
      c.x += nx * push;
    }
    // top
    const b = s.b;
    b.vy += G_B * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= 1 - 0.55 * dt;
    if (b.y > GROUND - BR) {
      b.y = GROUND - BR;
      b.vy = -Math.abs(b.vy) * 0.72;
      if (Math.abs(b.vy) < 25) b.vy = 0;
      b.vx *= 0.96;
    }
    if (b.y < BR + 20) {
      b.y = BR + 20;
      b.vy = Math.abs(b.vy) * 0.6;
    }
    // üst direkler
    for (const gx of [0, W - GOAL_W]) {
      if (b.x + BR > gx && b.x - BR < gx + GOAL_W && Math.abs(b.y - BAR_Y) < BR + 2) {
        b.vy = b.y < BAR_Y ? -Math.abs(b.vy) * 0.7 - 30 : Math.abs(b.vy) * 0.7;
        b.y = b.y < BAR_Y ? BAR_Y - BR - 2 : BAR_Y + BR + 2;
      }
    }
    // yan duvarlar (direk üstü)
    if (b.y < BAR_Y) {
      if (b.x < BR) {
        b.x = BR;
        b.vx = Math.abs(b.vx) * 0.5;
      }
      if (b.x > W - BR) {
        b.x = W - BR;
        b.vx = -Math.abs(b.vx) * 0.5;
      }
    }
    // oyuncu-top çarpışması (kafa)
    s.p.forEach((p) => {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < PR + BR && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = p.x + nx * (PR + BR);
        b.y = p.y + ny * (PR + BR);
        const rel = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
        if (rel < 0) {
          b.vx -= 1.75 * rel * nx;
          b.vy -= 1.75 * rel * ny;
        }
        b.vx += p.vx * 0.25;
        b.vy += Math.min(0, p.vy) * 0.35;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 460) {
          b.vx *= 460 / sp;
          b.vy *= 460 / sp;
        }
      }
    });
    // gol
    let scorer = -1;
    if (b.x < GOAL_W - 2 && b.y > BAR_Y) scorer = 1;
    if (b.x > W - GOAL_W + 2 && b.y > BAR_Y) scorer = 0;
    if (scorer >= 0) {
      s.sc[scorer] += 1;
      s.msg = 'GOOOL!';
      s.pause = 1.4;
      kickoff(s, scorer);
    }
    if (s.t <= 0) {
      s.over = true;
      s.msg = s.sc[0] === s.sc[1] ? 'BERABERE' : `${s.names[s.sc[0] > s.sc[1] ? 0 : 1]} KAZANDI`;
    }
    // ağ için yuvarla
    s.p.forEach((p) => {
      p.x = r1(p.x);
      p.y = r1(p.y);
    });
  },
  result(s) {
    if (!s.over) return null;
    return { winner: s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, text: `${s.sc[0]} – ${s.sc[1]}` };
  },
  bot(s, i, mem) {
    const p = s.p[i];
    const b = s.b;
    const dir = i === 0 ? 1 : -1; // hücum yönü
    const ownGoalX = i === 0 ? 0 : W;
    let bits = 0;
    mem.react = (mem.react || 0) - 1 / 60;
    const behind = (b.x - p.x) * dir < -2; // top, bot ile kendi kalesi arasında
    if (mem.react <= 0) {
      mem.react = 0.06 + Math.random() * 0.1;
      const toOwn = b.vx * dir < -110; // top hızla kendi kalesine geliyor
      if (toOwn && (b.x - ownGoalX) * dir < (p.x - ownGoalX) * dir + 70) mem.tx = ownGoalX + dir * (GOAL_W + PR + 6); // kaleye koş
      else if (behind) mem.tx = b.x - dir * 26;
      else if (Math.abs(b.x - ownGoalX) < 90) mem.tx = b.x - dir * 16; // kale önü: topla kale arasında kal
      else mem.tx = b.x - dir * 11;
      mem.err = (Math.random() - 0.5) * 10; // insan gibi küçük hatalar
    }
    const tx = (mem.tx ?? p.x) + (mem.err || 0);
    const dx = tx - p.x;
    if (dx > 4) bits |= IN.R;
    if (dx < -4) bits |= IN.L;
    const ddx = b.x - p.x;
    const ddy = b.y - p.y;
    const onGround = p.y >= GROUND - PR - 0.5;
    // topun arkasına geçerken üstünden atla (kendi kalesine itmesin)
    const keeper = Math.abs(p.x - (ownGoalX + dir * (GOAL_W + PR + 6))) < 12;
    if (keeper && Math.abs(ddx) < 50 && ddy < -10 && ddy > -70 && onGround) bits |= IN.U; // kaleci kafası
    else if (behind && Math.abs(ddx) < 34 && b.y > p.y - 12 && onGround) bits |= IN.U;
    else if (!behind && Math.abs(ddx) < 36 && ddy < -18 && ddy > -80 && Math.random() < 0.12) bits |= IN.U;
    if (!behind && Math.hypot(ddx - dir * 14, b.y - (p.y + PR)) < 24) bits |= IN.A;
    return bits;
  },
  render(c, s, me) {
    // gök + tribün
    const sky = c.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#0b1230');
    sky.addColorStop(1, '#1b2b5c');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 40; i++) c.fillRect((i * 37) % W, 30 + ((i * 53) % 40), 3, 3);
    // projektörler
    c.fillStyle = 'rgba(255,240,180,0.07)';
    c.beginPath();
    c.moveTo(40, 0);
    c.lineTo(10, GROUND);
    c.lineTo(110, GROUND);
    c.fill();
    c.beginPath();
    c.moveTo(W - 40, 0);
    c.lineTo(W - 110, GROUND);
    c.lineTo(W - 10, GROUND);
    c.fill();
    // çim
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#2f8f3a' : '#2a8234';
      c.fillRect((i * W) / 8, GROUND, W / 8, H - GROUND);
    }
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(W / 2, GROUND);
    c.lineTo(W / 2, H);
    c.stroke();
    // kaleler
    for (const [gx, side] of [
      [0, 0],
      [W - GOAL_W, 1],
    ]) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(gx, BAR_Y, GOAL_W, GROUND - BAR_Y);
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      for (let y = BAR_Y; y < GROUND; y += 6) {
        c.beginPath();
        c.moveTo(gx, y);
        c.lineTo(gx + GOAL_W, y);
        c.stroke();
      }
      c.fillStyle = '#f2f2f2';
      c.fillRect(gx, BAR_Y - 2, GOAL_W, 4);
      c.fillRect(side === 0 ? gx + GOAL_W - 2 : gx, BAR_Y - 2, 3, GROUND - BAR_Y + 2);
    }
    // oyuncular
    s.p.forEach((p, i) => {
      const dir = i === 0 ? 1 : -1;
      // gölge
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath();
      c.ellipse(p.x, GROUND + 2, 14, 3, 0, 0, Math.PI * 2);
      c.fill();
      // ayak/bacak
      const kick = p.kick > 0;
      c.strokeStyle = '#222';
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(p.x - dir * 3, p.y + PR - 4);
      c.lineTo(p.x - dir * 4, p.y + PR + 3);
      c.stroke();
      c.strokeStyle = PCOL[i];
      c.beginPath();
      c.moveTo(p.x + dir * 3, p.y + PR - 4);
      c.lineTo(kick ? p.x + dir * 16 : p.x + dir * 5, kick ? p.y + PR - 4 : p.y + PR + 3);
      c.stroke();
      // kafa
      const grd = c.createRadialGradient(p.x - 5, p.y - 6, 3, p.x, p.y, PR);
      grd.addColorStop(0, '#ffd9b8');
      grd.addColorStop(1, '#d99a6c');
      c.fillStyle = grd;
      c.beginPath();
      c.arc(p.x, p.y, PR, 0, Math.PI * 2);
      c.fill();
      // saç / bandana
      c.fillStyle = PCOL[i];
      c.beginPath();
      c.arc(p.x, p.y, PR, Math.PI * 1.05, Math.PI * 1.95);
      c.fill();
      // göz
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(p.x + dir * 6, p.y - 2, 3.4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#111';
      c.beginPath();
      c.arc(p.x + dir * 7, p.y - 2, 1.6, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#7a3b22';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(p.x + dir * 5, p.y + 6, 3.5, 0.2, Math.PI - 0.2);
      c.stroke();
      if (i === me) {
        c.fillStyle = PCOL[i];
        c.beginPath();
        c.moveTo(p.x, p.y - PR - 4);
        c.lineTo(p.x - 4, p.y - PR - 10);
        c.lineTo(p.x + 4, p.y - PR - 10);
        c.fill();
      }
    });
    // top
    const b = s.b;
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(b.x, GROUND + 2, 6, 2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(b.x, b.y, BR, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#222';
    c.beginPath();
    c.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
    c.fill();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + b.x / 8;
      c.beginPath();
      c.arc(b.x + Math.cos(a) * 5.2, b.y + Math.sin(a) * 5.2, 1.3, 0, Math.PI * 2);
      c.fill();
    }
    drawHud(c, W, { left: `${s.names[0]}  ${s.sc[0]}`, right: `${s.sc[1]}  ${s.names[1]}`, center: `⏱ ${Math.ceil(s.t)}`, me });
    if (s.msg) drawBanner(c, W, H, s.msg, s.over ? `${s.sc[0]} – ${s.sc[1]}` : '');
  },
};
