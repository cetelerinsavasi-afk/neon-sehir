// =============================================================================
// v168 — Senaryo karakteri (Rıza Amca, Emre, Nevzat, polisler…).
// Karakterler motora "uzaktaki oyuncu" olarak verilir (upsertPlayer / upsertCar): diğer oyuncuları
// çizen kod kullanılır, yeni çizim sistemi yok. Hiçbir şey ağa / Firestore'a yazılmaz — sadece bu
// cihazda görünürler. Kimlikleri 'npc_' ile başlar (motor ve şehir ekranı bunları gerçek oyuncu saymaz).
// =============================================================================
import { navRoute } from '../cityJobs.js';

const OFFSET = 2; // sağ şerit
// v168.1: Amca daha hızlı ve akıcı sürer (eskiden virajdan çok önce yavaşlıyordu)
export const CRUISE = 14.5;
const SLOW = 8;
const ACC = 6.5;
const BRAKE = 8;
let seq = 0;
const stamp = () => (seq = Math.max(seq + 1, Date.now()));
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const unit = (x, z) => {
  const n = Math.hypot(x, z);
  return n > 1e-6 ? { x: x / n, z: z / n } : { x: 0, z: 0 };
};
function offsetPath(pts, off) {
  if (pts.length < 2) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const d1 = unit(b.x - a.x, b.z - a.z);
    const d2 = unit(c.x - b.x, c.z - b.z);
    let nx = (d1.x || d2.x) + (d2.x || d1.x);
    let nz = (d1.z || d2.z) + (d2.z || d1.z);
    const n = Math.hypot(nx, nz) || 1;
    nx /= n;
    nz /= n;
    const k = Math.max(0.5, d1.x * nx + d1.z * nz || 1);
    out.push({ x: b.x - (nz * off) / k, z: b.z + (nx * off) / k });
  }
  return out;
}
function smooth(pts, it = 2) {
  let p = pts;
  for (let k = 0; k < it; k++) {
    if (p.length < 3) return p;
    const o = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}
function dedupe(pts) {
  const o = [];
  pts.forEach((p) => {
    const l = o[o.length - 1];
    if (!l || Math.hypot(p.x - l.x, p.z - l.z) > 0.6) o.push({ x: p.x, z: p.z });
  });
  return o;
}
function cumul(pts) {
  const a = [0];
  for (let i = 1; i < pts.length; i++) a.push(a[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return a;
}
function at(path, s) {
  const { pts, acc } = path;
  const L = acc[acc.length - 1];
  s = Math.max(0, Math.min(L, s));
  let i = 1;
  while (i < acc.length - 1 && acc[i] < s) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const t = (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}
// yol ağı üzerinden (oyunun yol tarifi ile aynı) sağ şeritte
export function roadPath(from, to) {
  let raw = null;
  try {
    raw = navRoute(from, to);
  } catch {
    raw = null;
  }
  if (!raw || raw.length < 2) raw = [from, to];
  const p = offsetPath(dedupe(raw), OFFSET);
  p[0] = { x: from.x, z: from.z };
  const s = smooth(dedupe(p), 2);
  return { pts: s, acc: cumul(s) };
}
export function linePath(pts) {
  const s = smooth(dedupe(pts), 1);
  return { pts: s, acc: cumul(s) };
}

// eng: motor · gy(x, z): zemin yüksekliği (çömelme koltuk yüksekliği için)
export function createActor(eng, { id, name, avatar, carId = null }, gy = () => 0) {
  const a = { id, name, avatar, carId, x: 0, z: 0, p: 'w', sy: 0.45, ro: null, rk: 1, posFn: null, moving: false, run: false, face: false, hold: null, emote: null, emoteT: 0, walk: null, car: null, path: null, s: 0, onArrive: null, follow: null, cruise: CRUISE, alive: true, beat: 0, slowEnd: true };
  function pushMe() {
    if (!a.alive) return;
    let src = a;
    if (a.p === 'd' && a.car) src = a.car;
    else if (a.p === 'r' && a.posFn) src = a.posFn() || a;
    const st = { n: a.name, a: a.avatar, x: src.x, z: src.z, t: stamp(), p: a.p, m: +!!a.moving, l: +!!a.face };
    if (a.run) st.r = 1;
    if (a.hold) st.h = a.hold;
    if (a.p === 's') st.sy = a.sy;
    if (a.p === 'r') {
      st.ro = a.ro;
      st.rk = a.rk;
    }
    if (a.emote) {
      st.e = a.emote;
      st.et = a.emoteT;
    }
    eng.upsertPlayer(a.id, st);
  }
  function pushCar() {
    if (!a.car) return;
    const c = a.car;
    const t = stamp();
    eng.upsertCar(a.id, { v: a.carId, x: c.x, z: c.z, y: c.yaw, s: Math.round(c.spd * 10) / 10, st: c.steer, d: +(a.p === 'd'), ct: t, t, n: a.name });
  }
  const finishWalk = (ok) => {
    const w = a.walk;
    a.walk = null;
    w?.done?.(ok);
  };
  const arrive = () => {
    const f = a.onArrive;
    a.onArrive = null;
    f?.();
  };
  const actor = {
    st: a,
    get pos() {
      if (a.p === 'd' && a.car) return { x: a.car.x, z: a.car.z };
      return (a.p === 'r' && a.posFn && a.posFn()) || { x: a.x, z: a.z };
    },
    get carPos() {
      return a.car ? { x: a.car.x, z: a.car.z, yaw: a.car.yaw, spd: a.car.spd } : null;
    },
    get driving() {
      return Boolean(a.path);
    },
    get walking() {
      return Boolean(a.walk);
    },
    get inCar() {
      return a.p === 'd';
    },
    get alive() {
      return a.alive;
    },
    placeCar(x, z, yaw) {
      a.car = { x, z, yaw, spd: 0, steer: 0 };
      a.path = null;
      arrive();
      pushCar();
    },
    removeCar() {
      a.car = null;
      a.path = null;
      a.follow = null;
      arrive();
      eng.removeCar(a.id);
    },
    getOut(side = 1) {
      if (!a.car) return;
      const c = a.car;
      a.path = null;
      a.follow = null;
      c.spd = 0;
      a.x = c.x + Math.cos(c.yaw) * 2.1 * side;
      a.z = c.z - Math.sin(c.yaw) * 2.1 * side;
      a.p = 'w';
      arrive();
      pushCar();
      pushMe();
    },
    getIn() {
      finishWalk(false);
      a.p = 'd';
      pushMe();
      pushCar();
    },
    driveTo(to, { slowEnd = true, cruise = CRUISE } = {}) {
      if (!a.car) return Promise.resolve();
      arrive();
      a.follow = null;
      a.p = 'd';
      a.path = roadPath({ x: a.car.x, z: a.car.z }, to);
      a.s = 0;
      a.cruise = cruise;
      a.slowEnd = slowEnd;
      pushMe();
      return new Promise((r) => (a.onArrive = r));
    },
    driveAlong(pts, { cruise = CRUISE, slowEnd = true } = {}) {
      if (!a.car) return Promise.resolve();
      arrive();
      a.follow = null;
      a.p = 'd';
      a.path = linePath(pts);
      a.s = 0;
      a.cruise = cruise;
      a.slowEnd = slowEnd;
      pushMe();
      return new Promise((r) => (a.onArrive = r));
    },
    follow(get) {
      arrive();
      a.follow = { get, replanT: 0 };
      a.p = 'd';
      pushMe();
    },
    stopCar() {
      a.path = null;
      a.follow = null;
      if (a.car) a.car.spd = 0;
      arrive();
      pushCar();
    },
    placeAt(x, z) {
      finishWalk(false);
      a.x = x;
      a.z = z;
      a.p = 'w';
      a.moving = false;
      pushMe();
    },
    walkTo(x, z, speed = 1.7, run = false) {
      a.p = 'w';
      finishWalk(false);
      return new Promise((r) => {
        a.walk = { tx: x, tz: z, speed, done: r };
        a.run = run;
      });
    },
    // birden çok noktadan geçerek yürü (araçların içinden geçmesin diye)
    async walkPath(pts, speed = 1.7, run = false) {
      for (const p of pts) {
        if (!a.alive) return false;
        const ok = await actor.walkTo(p.x, p.z, speed, run);
        if (!ok) return false;
      }
      return true;
    },
    stopWalk() {
      finishWalk(false);
      a.moving = false;
      a.run = false;
      pushMe();
    },
    // v168: çökme oyuncunun çökmesiyle aynı yükseklikte (zemin + 0,2)
    crouch() {
      finishWalk(false);
      a.p = 's';
      a.sy = (Number(gy(a.x, a.z)) || 0) + 0.2;
      pushMe();
    },
    stand() {
      a.p = 'w';
      pushMe();
    },
    say(text) {
      eng.playerSay(a.id, text);
    },
    emote(k) {
      a.emote = k;
      a.emoteT = Date.now();
      pushMe();
    },
    hold(p) {
      a.hold = p || null;
      pushMe();
    },
    look(left) {
      a.face = Boolean(left);
      pushMe();
    },
    setAvatar(av) {
      a.avatar = av;
      pushMe();
    },
    remove() {
      if (!a.alive) return;
      a.alive = false;
      finishWalk(false);
      arrive();
      eng.removePlayer(a.id);
      if (a.car) {
        a.car = null;
        eng.removeCar(a.id);
      }
    },
    removePerson() {
      a.alive = false;
      a.path = null;
      a.follow = null;
      finishWalk(false);
      eng.removePlayer(a.id);
    },
    update(dt) {
      if (!a.alive) return;
      if (a.follow && a.car) {
        a.follow.replanT -= dt;
        const tg = a.follow.get();
        if (tg) {
          const d = Math.hypot(tg.x - a.car.x, tg.z - a.car.z);
          if (d < 12) {
            if (a.path) a.slowEnd = true;
            if (d < 9) a.path = null;
          } else if (a.follow.replanT <= 0 || !a.path) {
            a.follow.replanT = 1.2;
            a.path = roadPath({ x: a.car.x, z: a.car.z }, tg);
            a.s = 0;
            a.cruise = Math.min(19, CRUISE + d * 0.12);
            a.slowEnd = true;
          }
        }
      }
      if (a.path && a.car) {
        const P = a.path;
        const left = P.acc[P.acc.length - 1] - a.s;
        const here = at(P, a.s);
        const ahead = at(P, a.s + 8);
        const turn = Math.abs(angDiff(ahead.yaw, here.yaw));
        const cr = a.cruise || CRUISE;
        // sadece gerçek virajda (kavşak dönüşü) yavaşlar; şerit kaymalarında hız kesmez
        let want = turn > 0.7 ? SLOW : turn > 0.4 ? (SLOW + cr) / 2 : cr;
        if (a.slowEnd) want = Math.min(want, Math.sqrt(2 * BRAKE * 0.8 * Math.max(0, left - 1.2)));
        const c = a.car;
        c.spd += Math.max(-6.5 * dt, Math.min(ACC * dt, want - c.spd));
        a.s += c.spd * dt;
        const p = at(P, a.s);
        const prevYaw = c.yaw;
        const q = at(P, a.s + 2.2);
        const yaw = Math.hypot(q.x - p.x, q.z - p.z) > 0.8 ? Math.atan2(q.x - p.x, q.z - p.z) : p.yaw;
        c.yaw += angDiff(yaw, c.yaw) * Math.min(1, dt * 7);
        c.steer = Math.max(-0.6, Math.min(0.6, (angDiff(c.yaw, prevYaw) / Math.max(dt, 0.001)) * 0.35));
        c.x = p.x;
        c.z = p.z;
        if (left < 0.4 || (c.spd < 0.05 && left < 2)) {
          c.spd = 0;
          c.steer = 0;
          a.path = null;
          arrive();
        }
        pushCar();
        pushMe();
        return;
      }
      if (a.car && a.car.spd !== 0) {
        a.car.spd = 0;
        pushCar();
      }
      if (a.walk) {
        const w = a.walk;
        const dx = w.tx - a.x;
        const dz = w.tz - a.z;
        const d = Math.hypot(dx, dz);
        const step = w.speed * dt;
        if (Math.abs(dx) > 0.05) a.face = dx < 0;
        if (d <= step) {
          a.x = w.tx;
          a.z = w.tz;
          a.moving = false;
          a.run = false;
          finishWalk(true);
        } else {
          a.x += (dx / d) * step;
          a.z += (dz / d) * step;
          a.moving = true;
        }
        pushMe();
        return;
      }
      a.moving = false;
      a.beat -= dt;
      if (a.beat <= 0) {
        a.beat = a.p === 'r' ? 0.25 : 2;
        pushMe();
        if (a.car) pushCar();
      }
    },
  };
  return actor;
}
