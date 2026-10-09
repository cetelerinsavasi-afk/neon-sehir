// =============================================================================
// v78 — Zamana Karşı Yarış: oyun döngüsü + çizim (canvas 2.5D gece pisti)
// Fizik functions/raceSim.js (deterministik, sabit 60 Hz adım). Bu dosya
// sadece girdi, döngü, kamera ve görsel efektlerden sorumlu.
// =============================================================================
import { TRACK, HALF, DT, FPS, KMH, stepCar, newCarState, createInputRecorder, angDiff, IN_L, IN_R, IN_G, IN_B, IN_N } from '../../../functions/raceSim.js';
import { drawCarRear } from './raceDraw';

const { PT, N, TAN, NRM, ANG, LE, RE, LINE0, FIN, PADS } = TRACK;
const ang = angDiff;
export const fmtRace = (ms) => {
  const v = Math.max(0, Math.round(ms));
  return `${String(Math.floor(v / 60000)).padStart(2, '0')}:${String(Math.floor(v / 1000) % 60).padStart(2, '0')}.${String(v % 1000).padStart(3, '0')}`;
};

// Şehir binaları (sadece görüntü — sabit tohumlu)
const HUES = ['#00f0ff', '#ff2bd6', '#8a5bff', '#ffb23d'];
const BLD = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [];
  for (let i = 8; i < N - 4; i += 2)
    for (const s of [-1, 1]) {
      const w = 60 + rnd() * 90;
      const h = 60 + rnd() * 110;
      const d = HALF + 40 + Math.max(w, h) * 0.6 + rnd() * 110;
      const x = PT[i][0] + NRM[i][0] * s * d;
      const y = PT[i][1] + NRM[i][1] * s * d;
      const rad = Math.hypot(w, h) / 2 + HALF + 26;
      let ok = true;
      for (let j = 0; j < N; j += 3) {
        const dx = PT[j][0] - x;
        const dy = PT[j][1] - y;
        if (dx * dx + dy * dy < rad * rad) {
          ok = false;
          break;
        }
      }
      if (ok) out.push({ i, x, y, w, h, r: ANG[i], z: 50 + rnd() * 140, c: HUES[Math.floor(rnd() * 4)] });
    }
  return out;
})();

// Mini harita arka planı
const MM = (() => {
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  PT.forEach((p) => {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  });
  const s = Math.min(108 / (x1 - x0), 172 / (y1 - y0));
  return { s, ox: (128 - (x1 - x0) * s) / 2 - x0 * s, oy: (192 - (y1 - y0) * s) / 2 - y0 * s };
})();
let mmBg = null;
function miniBg() {
  if (mmBg) return mmBg;
  mmBg = document.createElement('canvas');
  mmBg.width = 128;
  mmBg.height = 192;
  const b = mmBg.getContext('2d');
  b.strokeStyle = '#00f0ff';
  b.lineWidth = 4;
  b.lineJoin = 'round';
  b.globalAlpha = 0.8;
  b.beginPath();
  PT.forEach((p, i) => b[i ? 'lineTo' : 'moveTo'](p[0] * MM.s + MM.ox, p[1] * MM.s + MM.oy));
  b.stroke();
  b.fillStyle = '#ffc83d';
  b.globalAlpha = 1;
  b.fillRect(PT[FIN][0] * MM.s + MM.ox - 4, PT[FIN][1] * MM.s + MM.oy - 4, 8, 8);
  return mmBg;
}

// Rakip örneklerinden (kare, x, y, açı, nitro) belirli karedeki konum
export function makeSampler(samples, { extrapolate = 60 } = {}) {
  // samples: kareye göre sıralı [[f,x,y,a,nos], ...] (dizi büyüyebilir)
  let k = 0;
  return (f) => {
    const n = samples.length;
    if (!n) return null;
    if (f <= samples[0][0]) {
      const s = samples[0];
      return { x: s[1], y: s[2], a: s[3], nos: s[4] || 0 };
    }
    if (k >= n) k = n - 1;
    while (k > 0 && samples[k][0] > f) k--;
    while (k < n - 1 && samples[k + 1][0] <= f) k++;
    const a = samples[k];
    const b = samples[k + 1];
    if (b) {
      const t = (f - a[0]) / Math.max(1, b[0] - a[0]);
      return { x: a[1] + (b[1] - a[1]) * t, y: a[2] + (b[2] - a[2]) * t, a: a[3] + ang(b[3], a[3]) * t, nos: b[4] || 0 };
    }
    // son örneğin ötesi: kısa süre hızla tahmin, sonra bekle
    const p = samples[n - 2];
    if (!p || f - a[0] > extrapolate) return { x: a[1], y: a[2], a: a[3], nos: a[4] || 0, stale: f - a[0] > extrapolate };
    const t = (f - a[0]) / Math.max(1, a[0] - p[0]);
    return { x: a[1] + (a[1] - p[1]) * t, y: a[2] + (a[2] - p[2]) * t, a: a[3], nos: a[4] || 0 };
  };
}

function nearestIdx(x, y, hint = 0) {
  let bi = hint;
  let bd = 1e18;
  const lo = Math.max(0, hint - 30);
  const hi = Math.min(N - 1, hint + 60);
  for (let i = lo; i <= hi; i++) {
    const d = (PT[i][0] - x) ** 2 + (PT[i][1] - y) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

/**
 * createTimeAttackGame
 *  canvas, mini (mini harita canvas), hud: { tm, sp, nb, pg, pgo, wrong, cd, gap }
 *  car: raceSim.carStats(...)
 *  opp: { look, name, sample(f) → {x,y,a,nos}|null, finishMs? } | null
 *  onStartRace(): GO anında · onFinish({ frames, runs, hits }) · onFrame(f)
 */
export function createTimeAttackGame({ canvas, mini, hud, car, opp = null, onStartRace, onFinish, onFrame }) {
  const ctx = canvas.getContext('2d');
  const mmx = mini?.getContext('2d');
  let W;
  let H;
  let DPR;
  let vig = null;
  const K = { l: 0, r: 0, g: 0, b: 0, n: 0 };
  let phase = 'count'; // count | race | done
  let cd0 = performance.now();
  let S = newCarState();
  let P0 = { x: S.x, y: S.y, a: S.a };
  const rec = createInputRecorder();
  let acc = 0;
  let camA = S.a;
  let shake = 0;
  let zoom = 1;
  let nosA = 0;
  let PART = [];
  let raf = 0;
  let last = performance.now();
  let alive = true;
  let oppIdx = TRACK.START;
  let muted = false;
  let AC = null;
  let osc = null;
  let gn = null;
  const hs = {};
  const setT = (el, key, v) => {
    if (el && hs[key] !== v) {
      hs[key] = v;
      el.textContent = v;
    }
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    vig = null;
  }
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  window.addEventListener('resize', resize);

  function audioStart() {
    if (AC || muted) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      osc = AC.createOscillator();
      osc.type = 'sawtooth';
      const f = AC.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 650;
      gn = AC.createGain();
      gn.gain.value = 0;
      osc.connect(f);
      f.connect(gn);
      gn.connect(AC.destination);
      osc.start();
    } catch {
      AC = null;
    }
  }

  const spark = (x, y, vx, vy, l, c, s) => {
    if (PART.length < 160) PART.push({ x, y, vx, vy, l, m: l, c, s });
  };
  const inputBits = () => (K.l ? IN_L : 0) | (K.r ? IN_R : 0) | (K.g ? IN_G : 0) | (K.b ? IN_B : 0) | (K.n ? IN_N : 0);

  function simulate(realDt, now) {
    if (phase === 'count') {
      const e = now - cd0;
      if (e < 3000) {
        const n = 3 - Math.floor(e / 1000);
        if (hud.cd && hud.cd.dataset.n !== String(n)) {
          hud.cd.dataset.n = String(n);
          hud.cd.innerHTML = `<b>${n}</b>`;
        }
        return;
      }
      phase = 'race';
      acc = 0;
      if (hud.cd) {
        hud.cd.dataset.n = '';
        hud.cd.innerHTML = '<b>GO!</b>';
        setTimeout(() => alive && hud.cd && (hud.cd.innerHTML = ''), 800);
      }
      onStartRace?.();
    }
    if (phase !== 'race') return;
    // sabit adım: donma/kasma süreyi uzatmaz (en fazla 0,1 sn yetişir)
    acc += Math.min(0.1, realDt);
    while (acc >= DT && phase === 'race') {
      P0 = { x: S.x, y: S.y, a: S.a };
      const bits = inputBits();
      rec.push(bits);
      stepCar(S, car, bits);
      acc -= DT;
      // görsel olaylar
      if (S.hit) {
        const s = Math.sign(S.hit);
        const imp = Math.abs(S.hit);
        const n = NRM[S.idx];
        shake = Math.min(10, imp / 28);
        for (let q = 0; q < 8; q++) spark(S.x + n[0] * s * 10, S.y + n[1] * s * 10, (Math.random() - 0.5) * 220 - n[0] * s * 80, (Math.random() - 0.5) * 220 - n[1] * s * 80, 0.35, '#ffd27a', 2);
      }
      if (S.padHit === S.f) for (let q = 0; q < 14; q++) spark(S.x, S.y, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, 0.5, '#00f0ff', 3);
      if (S.nos) {
        const fx = Math.sin(S.a);
        const fy = -Math.cos(S.a);
        const ex = S.x - fx * car.L * 0.5;
        const ey = S.y - fy * car.L * 0.5;
        if (S.f % 2 === 0) spark(ex + (Math.random() - 0.5) * 8, ey + (Math.random() - 0.5) * 8, -fx * 120 + (Math.random() - 0.5) * 60, -fy * 120 + (Math.random() - 0.5) * 60, 0.3, Math.random() < 0.5 ? '#6ad8ff' : '#ff4be0', 2.5);
      }
      if (S.done) {
        phase = 'done';
        onFinish?.({ frames: S.f, runs: rec.runs.slice(), hits: S.hits });
      }
    }
    onFrame?.(S.f);
  }

  function step(dt) {
    if (phase === 'done' && !S.coastEnd) {
      // bitişten sonra araç süzülerek yavaşlar (sadece görüntü)
      const k = Math.pow(0.35, dt);
      S.vx *= k;
      S.vy *= k;
      S.x += S.vx * dt;
      S.y += S.vy * dt;
      S.nos = 0;
      if (Math.hypot(S.vx, S.vy) < 4) S.coastEnd = true;
    }
    nosA += (S.nos - nosA) * Math.min(1, 6 * dt);
    if (osc && gn && !muted && AC) {
      const sp = Math.hypot(S.vx, S.vy);
      const r = ((sp / car.vmax) * 5) % 1;
      osc.frequency.setTargetAtTime(52 + r * 85 + car.s * 30 + (S.nos ? 45 : 0), AC.currentTime, 0.05);
      gn.gain.setTargetAtTime(phase === 'race' ? 0.045 : 0.01, AC.currentTime, 0.1);
    }
  }

  function render(dt) {
    // fizik adımları arası yumuşatma
    const al = phase === 'race' ? Math.min(1, acc / DT) : 1;
    const vx = P0.x + (S.x - P0.x) * al;
    const vy = P0.y + (S.y - P0.y) * al;
    const va = P0.a + ang(S.a, P0.a) * al;
    const sp = Math.hypot(S.vx, S.vy);
    const vr = sp / car.vmax;
    zoom += (1 - 0.1 * nosA - zoom) * Math.min(1, 4 * dt);
    camA += ang(va, camA) * Math.min(1, 5 * dt);
    shake *= Math.pow(0.02, dt);
    const shk = shake + nosA * 2.5;
    const ox = (Math.random() - 0.5) * shk;
    const oy = (Math.random() - 0.5) * shk;
    const U = Math.min(W, H * 0.62);
    const FOC = U * 0.69 * zoom;
    const HY = H * 0.38 + oy;
    const CX = W / 2 + ox;
    const CD = 230 + 40 * nosA + 25 * vr;
    const CH = 230;
    const cfx = Math.sin(camA);
    const cfy = -Math.cos(camA);
    const crx = Math.cos(camA);
    const cry = Math.sin(camA);
    const camX = vx - cfx * CD;
    const camY = vy - cfy * CD;
    const P = (x, y, z = 0) => {
      const dx = x - camX;
      const dy = y - camY;
      const f = dx * cfx + dy * cfy;
      if (f < 25) return null;
      const s = FOC / f;
      return [CX + (dx * crx + dy * cry) * s, HY + (CH - z) * s, s, f];
    };
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    let g = ctx.createLinearGradient(0, 0, 0, HY + 4);
    g.addColorStop(0, '#02030a');
    g.addColorStop(0.6, '#150a2e');
    g.addColorStop(1, '#6a1f78');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HY + 4);
    g = ctx.createLinearGradient(0, HY, 0, HY + 160);
    g.addColorStop(0, '#3a1450');
    g.addColorStop(1, '#05060c');
    ctx.fillStyle = g;
    ctx.fillRect(0, HY, W, H - HY);
    const i0 = Math.max(0, S.idx - 14);
    const i1 = Math.min(N - 1, S.idx + 110);
    const pl = [];
    const pr = [];
    const pl2 = [];
    const pr2 = [];
    for (let i = i0; i <= i1; i++) {
      pl[i] = P(LE[i][0], LE[i][1]);
      pr[i] = P(RE[i][0], RE[i][1]);
      pl2[i] = P(LE[i][0], LE[i][1], 16);
      pr2[i] = P(RE[i][0], RE[i][1], 16);
    }
    let a = i0;
    while (a < i1 && !(pl[a] && pr[a] && pl2[a] && pr2[a])) a++;
    const ok = (i) => pl[i] && pr[i] && pl[i + 1] && pr[i + 1];
    const poly = (A, B, col) => {
      ctx.beginPath();
      for (let i = a; i <= i1; i++) if (A[i]) ctx.lineTo(A[i][0], A[i][1]);
      for (let i = i1; i >= a; i--) if (B[i]) ctx.lineTo(B[i][0], B[i][1]);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    };
    poly(pl, pr, '#13151f');
    ctx.beginPath();
    for (let i = a; i < i1; i++)
      if (i % 6 < 3 && ok(i)) {
        ctx.moveTo(pl[i][0], pl[i][1]);
        ctx.lineTo(pr[i][0], pr[i][1]);
        ctx.lineTo(pr[i + 1][0], pr[i + 1][1]);
        ctx.lineTo(pl[i + 1][0], pl[i + 1][1]);
        ctx.closePath();
      }
    ctx.fillStyle = 'rgba(120,130,200,.05)';
    ctx.fill();
    ctx.beginPath();
    for (let i = a; i < i1; i++)
      if (i % 4 < 2) {
        const n = NRM[i];
        const m = NRM[i + 1];
        const p = PT[i];
        const q = PT[i + 1];
        const A = P(p[0] + n[0] * 3, p[1] + n[1] * 3);
        const B = P(p[0] - n[0] * 3, p[1] - n[1] * 3);
        const C = P(q[0] - m[0] * 3, q[1] - m[1] * 3);
        const D = P(q[0] + m[0] * 3, q[1] + m[1] * 3);
        if (A && B && C && D) {
          ctx.moveTo(A[0], A[1]);
          ctx.lineTo(B[0], B[1]);
          ctx.lineTo(C[0], C[1]);
          ctx.lineTo(D[0], D[1]);
          ctx.closePath();
        }
      }
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fill();
    ctx.lineCap = 'round';
    for (const [E, T2, col] of [
      [pl, pl2, '0,240,255'],
      [pr, pr2, '255,43,214'],
    ]) {
      poly(E, T2, '#1b1f33');
      for (let pass = 0; pass < 2; pass++) {
        ctx.save();
        if (!pass) ctx.globalCompositeOperation = 'lighter';
        for (let i = a; i < i1; i++) {
          const A = T2[i];
          const B = T2[i + 1];
          if (!A || !B) continue;
          ctx.beginPath();
          ctx.moveTo(A[0], A[1]);
          ctx.lineTo(B[0], B[1]);
          ctx.strokeStyle = pass ? `rgb(${col})` : `rgba(${col},.2)`;
          ctx.lineWidth = Math.max(1.5, (pass ? 5 : 22) * A[2]);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    const vis = [];
    for (const b of BLD) {
      if (b.i < i0 || b.i > i1) continue;
      vis.push([(b.x - camX) * cfx + (b.y - camY) * cfy, b]);
    }
    vis.sort((p, q) => q[0] - p[0]);
    for (const [, b] of vis) {
      const co = Math.cos(b.r);
      const si = Math.sin(b.r);
      const hw = b.w / 2;
      const hh = b.h / 2;
      const cs = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ].map(([u, v]) => [b.x + u * co - v * si, b.y + u * si + v * co]);
      const B = cs.map((p) => P(p[0], p[1]));
      const T = cs.map((p) => P(p[0], p[1], b.z));
      if (B.some((p) => !p) || T.some((p) => !p)) continue;
      const fs = [0, 1, 2, 3].map((k) => [k, (B[k][3] + B[(k + 1) % 4][3]) / 2]).sort((x, y) => y[1] - x[1]);
      for (const [k] of fs) {
        const k2 = (k + 1) % 4;
        ctx.beginPath();
        ctx.moveTo(B[k][0], B[k][1]);
        ctx.lineTo(B[k2][0], B[k2][1]);
        ctx.lineTo(T[k2][0], T[k2][1]);
        ctx.lineTo(T[k][0], T[k][1]);
        ctx.closePath();
        ctx.fillStyle = k % 2 ? '#0e1226' : '#0a0d1c';
        ctx.fill();
        ctx.strokeStyle = b.c;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      T.forEach((p, j) => ctx[j ? 'lineTo' : 'moveTo'](p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = '#0c0f20';
      ctx.fill();
      ctx.strokeStyle = b.c;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const checker = (i) => {
      const p = PT[i];
      const n = NRM[i];
      const t = TAN[i];
      for (let c = 0; c < 20; c++)
        for (let r = 0; r < 2; r++) {
          const u0 = -HALF + c * 12;
          const v0 = (r - 1) * 12;
          const q = [
            [u0, v0],
            [u0 + 12, v0],
            [u0 + 12, v0 + 12],
            [u0, v0 + 12],
          ].map(([u, v]) => P(p[0] + n[0] * u + t[0] * v, p[1] + n[1] * u + t[1] * v));
          if (q.some((z) => !z)) continue;
          ctx.beginPath();
          q.forEach((z, j) => ctx[j ? 'lineTo' : 'moveTo'](z[0], z[1]));
          ctx.closePath();
          ctx.fillStyle = (c + r) % 2 ? '#e8e8e8' : '#14141a';
          ctx.fill();
        }
      const A = P(LE[i][0], LE[i][1]);
      const B = P(RE[i][0], RE[i][1]);
      const A2 = P(LE[i][0], LE[i][1], 115);
      const B2 = P(RE[i][0], RE[i][1], 115);
      if (A && B && A2 && B2) {
        ctx.strokeStyle = '#2b3050';
        ctx.lineWidth = Math.max(2, 7 * A[2]);
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        ctx.lineTo(A2[0], A2[1]);
        ctx.moveTo(B[0], B[1]);
        ctx.lineTo(B2[0], B2[1]);
        ctx.stroke();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,200,60,.9)';
        ctx.lineWidth = Math.max(3, 12 * A2[2]);
        ctx.beginPath();
        ctx.moveTo(A2[0], A2[1]);
        ctx.lineTo(B2[0], B2[1]);
        ctx.stroke();
        ctx.restore();
      }
    };
    if (LINE0 >= i0 && LINE0 <= i1) checker(LINE0);
    if (FIN >= i0 && FIN <= i1) checker(FIN);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = Math.ceil(a / 8) * 8; i <= i1; i += 8) {
      const s = (i / 8) % 2 ? 1 : -1;
      const n = NRM[i];
      const p = PT[i];
      const bx = p[0] + n[0] * s * (HALF + 26);
      const by = p[1] + n[1] * s * (HALF + 26);
      const B = P(bx, by);
      const T = P(bx, by, 95);
      const G = P(bx - n[0] * s * 90, by - n[1] * s * 90);
      if (!B || !T || !G) continue;
      ctx.strokeStyle = '#343a5c';
      ctx.lineWidth = Math.max(1, 3 * B[2]);
      ctx.beginPath();
      ctx.moveTo(B[0], B[1]);
      ctx.lineTo(T[0], T[1]);
      ctx.stroke();
      ctx.save();
      ctx.translate(G[0], G[1]);
      ctx.scale(1, 0.3);
      let q = ctx.createRadialGradient(0, 0, 0, 0, 0, 240 * G[2]);
      q.addColorStop(0, 'rgba(255,214,150,.35)');
      q.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = q;
      ctx.beginPath();
      ctx.arc(0, 0, 240 * G[2], 0, 7);
      ctx.fill();
      ctx.restore();
      q = ctx.createRadialGradient(T[0], T[1], 0, T[0], T[1], 70 * T[2]);
      q.addColorStop(0, 'rgba(255,243,208,.9)');
      q.addColorStop(0.2, 'rgba(255,214,150,.35)');
      q.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = q;
      ctx.beginPath();
      ctx.arc(T[0], T[1], 70 * T[2], 0, 7);
      ctx.fill();
    }
    const pu = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    PADS.forEach((pi, k) => {
      if (S.pads & (1 << k) || pi < a || pi > i1) return;
      const p = PT[pi];
      const n = NRM[pi];
      const t = TAN[pi];
      const C = P(p[0], p[1]);
      if (!C) return;
      ctx.strokeStyle = `rgba(0,240,255,${pu})`;
      ctx.lineWidth = Math.max(2, 7 * C[2]);
      ctx.lineJoin = 'round';
      for (let q = 0; q < 3; q++) {
        const v = q * 26 - 26;
        const A = P(p[0] + n[0] * -34 + t[0] * v, p[1] + n[1] * -34 + t[1] * v);
        const M = P(p[0] + t[0] * (v + 26), p[1] + t[1] * (v + 26));
        const B = P(p[0] + n[0] * 34 + t[0] * v, p[1] + n[1] * 34 + t[1] * v);
        if (!A || !M || !B) continue;
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        ctx.lineTo(M[0], M[1]);
        ctx.lineTo(B[0], B[1]);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(C[0], C[1]);
      ctx.scale(1, 0.35);
      const q = ctx.createRadialGradient(0, 0, 0, 0, 0, 110 * C[2]);
      q.addColorStop(0, 'rgba(0,240,255,.45)');
      q.addColorStop(1, 'rgba(0,240,255,0)');
      ctx.fillStyle = q;
      ctx.beginPath();
      ctx.arc(0, 0, 110 * C[2], 0, 7);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
    g = ctx.createLinearGradient(0, HY - 30, 0, HY + 80);
    g.addColorStop(0, 'rgba(106,31,120,0)');
    g.addColorStop(0.4, 'rgba(58,20,80,.88)');
    g.addColorStop(1, 'rgba(5,6,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, HY - 30, W, 110);
    const fx = Math.sin(va);
    const fy = -Math.cos(va);
    const rx = Math.cos(va);
    const ry = Math.sin(va);
    const w = car.W / 2;
    const hl = car.L / 2;
    {
      const q = [
        [-w * 0.5, hl],
        [w * 0.5, hl],
        [w + 90, hl + 420],
        [-w - 90, hl + 420],
      ].map(([u, v]) => P(vx + rx * u + fx * v, vy + ry * u + fy * v));
      if (q.every((z) => z)) {
        const gr = ctx.createLinearGradient(0, q[0][1], 0, q[3][1]);
        gr.addColorStop(0, 'rgba(255,246,200,.34)');
        gr.addColorStop(1, 'rgba(255,246,200,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gr;
        ctx.beginPath();
        q.forEach((z, j) => ctx[j ? 'lineTo' : 'moveTo'](z[0], z[1]));
        ctx.fill();
        ctx.restore();
      }
    }
    // --- rakip (hayalet — çarpışma yok) ---
    let oppDraw = null;
    if (opp) {
      const o = opp.sample(phase === 'count' ? 0 : S.f + (phase === 'race' ? al : 0));
      if (o) {
        oppIdx = nearestIdx(o.x, o.y, oppIdx);
        const C = P(o.x, o.y);
        // kameranın dibindeki (arkadaki) hayalet ekranı kaplamasın
        if (C && C[3] > 150) {
          oppDraw = () => {
            ctx.save();
            ctx.globalAlpha = 0.58;
            ctx.translate(C[0], C[1]);
            ctx.scale(C[2], C[2]);
            ctx.rotate(ang(o.a, camA) * 0.35);
            drawCarRear(ctx, opp.look, { fl: o.nos ? 0.8 : 0 });
            ctx.restore();
            ctx.save();
            const tagY = C[1] - 62 * C[2] - 8;
            ctx.font = `700 ${Math.max(10, Math.min(14, 28 * C[2]))}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,43,214,.95)';
            ctx.shadowColor = '#ff2bd6';
            ctx.shadowBlur = 8;
            ctx.fillText(opp.name, C[0], tagY);
            ctx.restore();
          };
          oppDraw.f = C[3];
        }
      }
    }
    const br = phase === 'race' && K.b && S.vx * fx + S.vy * fy > 5;
    const C = P(vx, vy);
    if (oppDraw && (!C || oppDraw.f >= C[3])) oppDraw();
    if (C) {
      ctx.save();
      ctx.translate(C[0], C[1]);
      ctx.scale(C[2], C[2]);
      ctx.rotate(ang(va, camA) * 0.35);
      drawCarRear(ctx, car, { fl: nosA, br });
      ctx.restore();
    }
    if (oppDraw && C && oppDraw.f < C[3]) oppDraw();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = PART.length - 1; i >= 0; i--) {
      const q = PART[i];
      q.l -= dt;
      if (q.l <= 0) {
        PART.splice(i, 1);
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const z = P(q.x, q.y, 3);
      if (!z) continue;
      ctx.globalAlpha = q.l / q.m;
      ctx.fillStyle = q.c;
      ctx.beginPath();
      ctx.arc(z[0], z[1], Math.max(1, q.s * z[2] * 1.4), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (nosA > 0.05) {
      ctx.globalAlpha = 0.32 * nosA;
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
      ctx.globalAlpha = 1;
    }
    const inten = Math.max(nosA, Math.max(0, (vr - 0.6) / 0.5) * 0.55);
    if (inten > 0.05) {
      ctx.strokeStyle = '#bfeaff';
      ctx.lineWidth = 1.5;
      const cx = W / 2;
      const cy = H * 0.5;
      const m = Math.hypot(W, H) / 2;
      for (let i = 0; i < 26 * inten; i++) {
        const an = Math.random() * 7;
        const r1 = m * (0.4 + Math.random() * 0.25);
        const r2 = r1 + m * (0.15 + Math.random() * 0.25 * inten);
        ctx.globalAlpha = 0.3 * inten;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1);
        ctx.lineTo(cx + Math.cos(an) * r2, cy + Math.sin(an) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (nosA > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(0,120,255,${0.1 * nosA})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!vig) {
      vig = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
      vig.addColorStop(0, 'rgba(0,0,8,0)');
      vig.addColorStop(1, 'rgba(0,0,8,.7)');
    }
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    return { vx, vy };
  }

  function updateHud(pos) {
    const v = Math.hypot(S.vx, S.vy);
    setT(hud.tm, 'tm', fmtRace((S.f * 1000) / FPS));
    setT(hud.sp, 'sp', String(Math.round(v * KMH)));
    if (hud.nb) hud.nb.style.transform = `scaleX(${S.nitro})`;
    const prog = Math.min(100, Math.max(0, ((S.idx - TRACK.START) / (FIN - TRACK.START)) * 100));
    if (hud.pg) hud.pg.style.width = `${prog}%`;
    if (opp && hud.pgo) hud.pgo.style.left = `${Math.min(100, Math.max(0, ((oppIdx - TRACK.START) / (FIN - TRACK.START)) * 100))}%`;
    const fwd = S.vx * TAN[S.idx][0] + S.vy * TAN[S.idx][1];
    if (hud.wrong) hud.wrong.style.display = phase === 'race' && fwd < -20 ? 'block' : 'none';
    if (opp && hud.gap && phase !== 'count') {
      const d = oppIdx - S.idx;
      setT(hud.gap, 'gap', d > 2 ? `${opp.name} önde` : d < -2 ? `${opp.name} geride` : 'Başa baş!');
      hud.gap.dataset.s = d > 2 ? 'behind' : d < -2 ? 'ahead' : 'even';
    }
    if (mmx) {
      mmx.clearRect(0, 0, 128, 192);
      mmx.drawImage(miniBg(), 0, 0);
      if (opp) {
        const o = PT[oppIdx];
        mmx.fillStyle = '#ff2bd6';
        mmx.beginPath();
        mmx.arc(o[0] * MM.s + MM.ox, o[1] * MM.s + MM.oy, 4, 0, 7);
        mmx.fill();
      }
      mmx.fillStyle = '#fff';
      mmx.beginPath();
      mmx.arc(pos.vx * MM.s + MM.ox, pos.vy * MM.s + MM.oy, 5, 0, 7);
      mmx.fill();
    }
  }

  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    const realDt = (now - last) / 1000;
    last = now;
    simulate(realDt, now);
    step(dt);
    const pos = render(dt);
    updateHud(pos);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setKey(k, v) {
      K[k] = v ? 1 : 0;
      if (v) audioStart();
      if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
    },
    releaseAll() {
      Object.keys(K).forEach((k) => (K[k] = 0));
    },
    setMuted(m) {
      muted = m;
      if (m && gn) gn.gain.value = 0;
      else audioStart();
    },
    restartCountdown() {
      cd0 = performance.now();
    },
    get phase() {
      return phase;
    },
    get frames() {
      return S.f;
    },
    get state() {
      return S;
    },
    stop() {
      phase = 'done';
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      try {
        osc?.stop();
        AC?.close();
      } catch {
        /* yoksay */
      }
    },
  };
}
