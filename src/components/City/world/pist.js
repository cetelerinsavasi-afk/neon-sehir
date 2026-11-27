// =============================================================================
// v219 — NEON ŞEHİR PİSTİ (3D): pist cebi (asfalt, bariyerler, tribünler, pit binası, helikopter
// pisti, sağlık merkezi) + pist girişi / festival alanı (sahne, satıcılar, otopark, kapılar).
// Yol üstü cebi olarak kurulur (roadside.js B.pist / B.pistgiris). Geometri: pistPlan.js.
// Prototipten (harita_duzeni5) aktarıldı; çizim kodu prototiple birebir.
// =============================================================================
import * as THREE from 'three';
import { Kit as QN, M as J, glowMat as RN, canvasTex as MN, floorRep as LN, floorMat as IN } from '../kit.js';
import { buildVehicle as GE } from '../vehicles.js';
import { buildVendor as oMe } from '../buildings.js';
import { VENUES as fd } from '../../../../functions/venueLayouts.js';
import {
  STAGE as Ak, FESTIVAL as kk, TRACK as Ck, PIST_PARK as Ok, PIT as Dk, CAR_GATE as jk, FOOT_GATE as Mk, tAt as wk, START_I as Ek, PIT_LANE as Fk,
  SERVICE_ROAD as Pk, SERVICE_END as Nk, distToTrack as YTe, segIdx as Tk, STANDS as nEe, STANDS_X as rEe, PIST_ROAD as Sk,
} from './pistPlan.js';

const soe = THREE;
const ky = THREE.Float32BufferAttribute;
const Iy = THREE.BufferGeometry;
const ib = THREE.PlaneGeometry;
const fS = THREE.MeshStandardMaterial;
const cS = THREE.ShapeGeometry;
const nS = THREE.Shape;
const yy = THREE.Color;
const Jx = THREE.ConeGeometry;
const eL = Math.PI;
const tL = 0.05; // cep zemininin üstü
const nL = ['#ff2d8a', '#19e8ff', '#ffd23f', '#39ff88', '#ff7a1a', '#b46bff'];
const rL = () => YI(IN('asfalt'), 2);

function JI(e, t, n, r) {
  let i = [],
    a = [],
    o = [];
  for (let o = 0; o < e.length; o++) (i.push(e[o][0], n, e[o][1], t[o][0], n, t[o][1]), a.push(e[o][0] / r, e[o][1] / r, t[o][0] / r, t[o][1] / r));
  for (let t = 0; t < e.length - 1; t++) {
    let e = t * 2;
    o.push(e, e + 2, e + 1, e + 1, e + 2, e + 3);
  }
  let s = new Iy();
  if (
    (s.setAttribute(`position`, new ky(i, 3)),
    s.setAttribute(`uv`, new ky(a, 2)),
    s.setIndex(o),
    s.computeVertexNormals(),
    s.attributes.normal.getY(0) < 0)
  ) {
    let e = s.index.array;
    for (let t = 0; t < e.length; t += 3) [e[t + 1], e[t + 2]] = [e[t + 2], e[t + 1]];
    s.computeVertexNormals();
  }
  return s;
}
function YI(e, t) {
  let n = e.clone();
  return ((n.polygonOffset = !0), (n.polygonOffsetFactor = -t), (n.polygonOffsetUnits = -t), n);
}
function BIe(e, t) {
  let n = [],
    r = [],
    i = e.length;
  for (let a = 0; a < i; a++) {
    let o = e[Math.max(0, a - 1)],
      s = e[Math.min(i - 1, a + 1)],
      c = s[0] - o[0],
      l = s[1] - o[1],
      u = Math.hypot(c, l) || 1;
    ((c /= u), (l /= u), n.push([e[a][0] + l * t, e[a][1] - c * t]), r.push([e[a][0] - l * t, e[a][1] + c * t]));
  }
  return [n, r];
}
function VIe(e, t = 1.5) {
  let n = [];
  for (let r = 0; r < e.length - 1; r++) {
    let i = e[Math.max(0, r - 1)],
      a = e[r],
      o = e[r + 1],
      s = e[Math.min(e.length - 1, r + 2)],
      c = Math.max(2, Math.round(Math.hypot(o[0] - a[0], o[1] - a[1]) / t));
    for (let e = 0; e < c; e++) {
      let t = e / c,
        r = t * t,
        l = r * t,
        u = (e, n, i, a) => 0.5 * (2 * n + (-e + i) * t + (2 * e - 5 * n + 4 * i - a) * r + (-e + 3 * n - 3 * i + a) * l);
      n.push([u(i[0], a[0], o[0], s[0]), u(i[1], a[1], o[1], s[1])]);
    }
  }
  return (n.push(e.at(-1)), n);
}
function XI(e, t, n, { y: r = 0.095, center: i = !0, edge: a = !0 } = {}) {
  let o = VIe(t),
    [s, c] = BIe(o, n);
  e.mesh(JI(s, c, r, LN(`asfalt`)), rL(), 0, 0, 0, 0, { cast: !1 });
  let l = YI(J(`#f2f2f2`, 0.6), 4);
  if (a)
    for (let t of [-1, 1]) {
      let [i] = BIe(o, t * (n - 0.35)),
        [a] = BIe(o, t * (n - 0.2));
      e.mesh(JI(i, a, r + 0.005, 4), l, 0, 0, 0, 0, { cast: !1 });
    }
  if (i)
    for (let t = 0; t < o.length - 1; t += 4) {
      let [n, i] = o[t],
        [a, s] = o[Math.min(o.length - 1, t + 2)];
      e.box(Math.hypot(a - n, s - i), 0.02, 0.14, l, (n + a) / 2, r - 0.01, (i + s) / 2, { ry: -Math.atan2(s - i, a - n), cast: !1 });
    }
}
function HIe(e, t, n, r, i, a, o, s) {
  let c = e.mesh(new ib(t, n), r, i, a, o, 0, { cast: !1 });
  return ((c.rotation.order = `YXZ`), c.rotation.set(-eL / 2, s, 0), c);
}
function UIe() {
  return MN(
    `pist_checker2`,
    256,
    64,
    (e, t, n) => {
      for (let t = 0; t < 16; t++) for (let n = 0; n < 4; n++) ((e.fillStyle = (t + n) % 2 ? `#111` : `#fafafa`), e.fillRect(t * 16, n * 16, 16, 16));
    },
    { repeat: !1 },
  );
}
export function ZI(e, t, n, r, i) {
  let a = GE(t, null);
  (a.root.position.set(n, tL, r),
    (a.root.rotation.y = i),
    a.trailer && ((a.trailer.pivot.visible = !0), (a.trailerOn = !0)),
    a.root.traverse((e) => e.isMesh && (e.castShadow = !0)),
    e.add(a.root));
  let o = (a.len || 4.5) + (a.trailer ? a.trailer.length : 0),
    s = a.trailer ? a.trailer.length / 2 : 0;
  return (e.solid(n - Math.sin(i) * s, r - Math.cos(i) * s, (a.halfW || 1) + 0.1, o / 2, i), a);
}
export function QI(e, t, n, r, i, a = {}) {
  let o = e.item(t, n, r, 0, a.ti || 0, { y: tL + (a.y || 0), solid: a.solid !== !1, scale: a.scale || 1 });
  return (o && (o.rotation.y = i), o);
}
function WIe(e, t, n, r = 0) {
  let i = J(`#9aa0a8`, 0.4, 0.7);
  (e.box(0.5, 16, 0.5, i, t, tL, n),
    e.box(3.4, 1.2, 0.5, J(`#2a2d33`, 0.5, 0.5), t, 15.65, n, { ry: r }),
    e.box(3, 0.8, 0.1, RN(`#f4f8ff`, 2.4), t + Math.sin(r) * 0.3, 15.850000000000001, n + Math.cos(r) * 0.3, { ry: r, cast: !1 }),
    e.light(t + Math.sin(r) * 2, 14.05, n + Math.cos(r) * 2, `#eef4ff`, 10, 46),
    e.solid(t, n, 0.3, 0.3));
}
function GIe(e, t, n, r, i, a, o = {}) {
  let s = new QN(`pv_${t}_${Math.round(n)}`);
  (s.group.position.set(n, tL, r),
    (s.group.rotation.y = i),
    e.group.add(s.group),
    oMe(s, t, fd[t], o),
    e.solids.push(...s.solids),
    e.seats.push(...s.seats),
    e.lights.push(...s.lights),
    e.ticks.push(...s.ticks));
  let c = Math.cos(i),
    l = Math.sin(i);
  s.npcs.forEach((e) => a.npc.push({ x: n + e.x * c + e.z * l, z: r - e.x * l + e.z * c, name: e.name, av: e.av, lines: e.lines }));
}
function KIe(e, t, n, r = 5.2) {
  let i = Math.hypot(n[0] - t[0], n[1] - t[1]),
    a = Math.max(4, Math.round(i / 1.2)),
    o = -Math.atan2(n[1] - t[1], n[0] - t[0]);
  e.box(i, 0.03, 0.03, J(`#2a2d33`, 0.6), (t[0] + n[0]) / 2, tL + r - 0.4, (t[1] + n[1]) / 2, { ry: o, cast: !1 });
  for (let i = 0; i < a; i++) {
    let s = (i + 0.5) / a,
      c = Math.sin(s * eL) * 0.6,
      l = e.mesh(new Jx(0.32, 0.6, 3), J(nL[i % nL.length], 0.7), t[0] + (n[0] - t[0]) * s, tL + r - 0.75 - c, t[1] + (n[1] - t[1]) * s, o, {
        cast: !1,
      });
    l.rotation.z = eL;
  }
}
function $I(e, t, n, r, i, a, { h: o = 1.1, y: s = 1.45, color: c = `#ffffff`, bg: l = `#14161b`, post: u = !0 } = {}) {
  u && e.box(0.12, s, 0.12, J(`#9aa0a8`, 0.4, 0.7), r, tL, i);
  let d = e.sign(t, n, o, r + Math.sin(a) * 0.05, tL + s, i + Math.cos(a) * 0.05, a, {
    color: c,
    bg: l,
    font: `900 100px Arial, sans-serif`,
    light: !1,
  });
  return (
    e.box(d.userData.signW + 0.12, o + 0.14, 0.06, J(`#2a2d33`, 0.6), r - Math.sin(a) * 0.02, tL + s - o / 2 - 0.07, i - Math.cos(a) * 0.02, {
      ry: a,
      cast: !1,
    }),
    d
  );
}
export function buildPistPad(e, t, n) {
  let r = t.cx,
    i = t.cz,
    a = ([e, t]) => [e - r, t - i],
    o = (e, t) => a(wk(e, t)),
    s = Ck.N;
  const NLp = [...VIe(Fk.pin, 1), ...VIe(Fk.pout, 1), ...VIe(Pk, 1)],
    __nl = (p, d) => NLp.some((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < d * d);
  {
    let n = t.x1,
      r = t.z1,
      i = t.round || 0,
      a = t.roundT || 0,
      o = new nS();
    (o.moveTo(-n + i, -r),
      o.lineTo(n - i, -r),
      o.absarc(n - i, -r + i, i, -eL / 2, 0, !1),
      o.lineTo(n, r - a),
      o.absarc(n - a, r - a, a, 0, eL / 2, !1),
      o.lineTo(-n + a, r),
      o.absarc(-n + a, r - a, a, eL / 2, eL, !1),
      o.lineTo(-n, -r + i),
      o.absarc(-n + i, -r + i, i, eL, eL * 1.5, !1));
    let s = new cS(o, 24),
      c = s.attributes.uv,
      l = s.attributes.position,
      u = LN(`cim`);
    for (let e = 0; e < c.count; e++) c.setXY(e, l.getX(e) / u, l.getY(e) / u);
    e.mesh(s, IN(`cim`), 0, tL, 0, 0, { cast: !1, rx: -eL / 2 });
  }
  let c = YI(J(`#d8c290`, 0.95), 1),
    l = [],
    u = null;
  for (let e = 0; e < s; e++) {
    let t = Math.abs(Ck.curv[e]) > 1 / 60,
      sg = Math.sign(Ck.curv[e]);
    u && t && u[2] !== sg && (l.push(u), (u = null));
    t && !u ? (u = [e, e, sg]) : t ? (u[1] = e) : (u &&= (l.push(u), null));
  }
  (u && l.push(u),
    l.forEach(([t, n]) => {
      let t0 = Math.max(0, t - 6),
        t1 = Math.min(s - 1, n + 6),
        L = (d) => {
          let q = 0,
            p = null;
          for (let e = t0; e <= t1; e++) {
            let w = wk(e, d);
            p && (q += Math.hypot(w[0] - p[0], w[1] - p[1]));
            p = w;
          }
          return q;
        },
        sd = L(12) >= L(-12) ? 1 : -1,
        r = [],
        i = [],
        fl = () => {
          r.length > 1 && e.mesh(JI(r, i, 0.07, 4), c, 0, 0, 0, 0, { cast: !1 });
          r = [];
          i = [];
        };
      for (let e = t0; e <= t1; e++) {
        if (Math.abs(e - Nk.i) < 8 || __nl(wk(e, sd * 12), 10)) {
          fl();
          continue;
        }
        (r.push(o(e, sd * 8.5)), i.push(o(e, sd * 16.5)));
      }
      fl();
    }));
  {
    let t = [],
      n = [];
    for (let e = 0; e <= s; e++) (t.push(o(e, -7)), n.push(o(e, 7)));
    e.mesh(JI(t, n, 0.1, LN(`asfalt`)), rL(), 0, 0, 0, 0, { cast: !1 });
    let r = YI(J(`#f4f4f4`, 0.6), 4);
    for (let t of [-1, 1]) {
      let n = [],
        i = [];
      for (let e = 0; e <= s; e++) (n.push(o(e, t * 6.35)), i.push(o(e, t * 6.75)));
      e.mesh(JI(n, i, 0.11, 4), r, 0, 0, 0, 0, { cast: !1 });
    }
  }
  {
    let t = [],
      n = [],
      r = [],
      i = new yy(`#d32f2f`),
      a = new yy(`#f4f4f4`),
      c = 0;
    for (let e = 0; e < s; e++) {
      if (Math.abs(Ck.curv[e]) < 1 / 75) continue;
      let l = (e + 1) % s,
        u = Math.floor(Ck.len[e] / 2.5) % 2 ? i : a;
      for (let [i, a] of [
        [6.8, 8.4],
        [-8.4, -6.8],
      ]) {
        if (__nl(wk(e, (i + a) / 2), 5.5)) continue;
        ([o(e, i), o(l, i), o(l, a), o(e, a)].forEach(([e, r]) => {
          (t.push(e, 0.13, r), n.push(u.r, u.g, u.b));
        }),
          r.push(c, c + 1, c + 2, c, c + 2, c + 3),
          (c += 4));
      }
    }
    let l = new Iy();
    if (
      (l.setAttribute(`position`, new ky(t, 3)),
      l.setAttribute(`color`, new ky(n, 3)),
      l.setIndex(r),
      l.computeVertexNormals(),
      l.attributes.normal.count && l.attributes.normal.getY(0) < 0)
    ) {
      let e = l.index.array;
      for (let t = 0; t < e.length; t += 3) [e[t + 1], e[t + 2]] = [e[t + 2], e[t + 1]];
      l.computeVertexNormals();
    }
    e.mesh(l, new fS({ vertexColors: !0, roughness: 0.6, side: 2, polygonOffset: !0, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), 0, 0, 0, 0, {
      cast: !1,
    });
  }
  XI(e, Pk.map(a), 4.2, { center: !1 });
  {
    let [t, n] = a(Pk[1]);
    $I(e, `pist_servis`, `PİST GİRİŞİ`, t - 6, n + 2, eL / 2, { h: 0.8, y: 2.6, color: `#06202a`, bg: `#19e8ff` });
  }
  XI(e, Fk.lane.map(a), 5.6, { center: !1, y: 0.097 });
  taper(e, Fk.pin.map(a), 3.8, 5.6, 0.097, t.cx, t.cz);
  taper(e, Fk.pout.map(a), 5.6, 3.8, 0.097, t.cx, t.cz);
  {
    let t = J(`#e9ecf0`, 0.6),
      n = J(`#d32f2f`, 0.6);
    for (let r = Dk.i0 + 2; r < Dk.i1 - 2; r += 3) {
      let i = o(r, -14.6),
        a = o(r + 3, -14.6),
        s = -Math.atan2(a[1] - i[1], a[0] - i[0]),
        c = Math.hypot(a[0] - i[0], a[1] - i[1]) + 0.05;
      (e.box(c, 1, 0.4, t, (i[0] + a[0]) / 2, tL, (i[1] + a[1]) / 2, { ry: s }),
        e.box(c, 0.12, 0.42, (r / 3) % 2 < 1 ? n : t, (i[0] + a[0]) / 2, 1.05, (i[1] + a[1]) / 2, { ry: s, cast: !1 }),
        e.solid((i[0] + a[0]) / 2, (i[1] + a[1]) / 2, c / 2, 0.22, s));
    }
  }
  {
    let t = (Dk.b0 + Dk.b1) / 2,
      n = Math.abs(Dk.b1 - Dk.b0),
      r = o(Dk.i0 + 6, t),
      i = o(Dk.i1 - 6, t),
      a = Math.hypot(i[0] - r[0], i[1] - r[1]),
      s = (i[0] - r[0]) / a,
      c = (i[1] - r[1]) / a,
      l = o(Math.round((Dk.i0 + Dk.i1) / 2), 0),
      u = (r[0] + i[0]) / 2,
      d = (r[1] + i[1]) / 2,
      f = -c,
      p = s;
    (l[0] - u) * f + (l[1] - d) * p < 0 && ((f = -f), (p = -p));
    let m = -Math.atan2(c, s),
      h = Math.atan2(f, p),
      g = (e, t) => [u + s * e + f * t, d + c * e + p * t],
      _ = 6.5,
      v = J(`#e9ecf0`, 0.55),
      y = J(`#1d2128`, 0.4, 0.4),
      [b, x] = g(0, -n / 2 + 0.2);
    (e.box(a, _, 0.4, v, b, tL, x, { ry: m }),
      e.solid(b, x, a / 2, 0.25, m),
      (e.blocker(a, _, 0.5, b, tL, x).rotation.y = m),
      e.box(a + 1, 0.5, n + 2.5, y, u + f * 0.6, 6.55, d + p * 0.6, { ry: m }),
      e.box(a, 3.2, n - 1, J(`#9fc7d9`, 0.08, 0.35), u - f * 0.5, 7.05, d - p * 0.5, { ry: m }),
      e.box(a + 1, 0.4, n + 1.5, y, u, 10.25, d, { ry: m }));
    let [S, C] = g(0, n / 2 + 1.2);
    e.box(a + 1, 0.1, 0.1, RN(`#19e8ff`, 2.6), S, 6.6, C, { ry: m, cast: !1 });
    let [w, T] = g(0, n / 2 + 1.35);
    e.sign(`pist_pit_on`, `PIT`, 2.6, w, 8.55, T, h, { color: `#ffffff`, glow: `#ff2d8a`, font: `900 120px Arial, sans-serif`, li: 10, ld: 22 });
    let [E, D] = g(0, -n / 2 - 0.05);
    e.sign(`pist_pit_arka`, `PIT · PADOK`, 1.3, E, 4.949999999999999, D, h + eL, {
      color: `#ffffff`,
      glow: `#19e8ff`,
      font: `900 110px Arial, sans-serif`,
      li: 6,
      ld: 12,
    });
    let O = Math.max(6, Math.floor(a / 7.2)),
      k = a / O;
    for (let t = 0; t <= O; t++) {
      let [r, i] = g(-a / 2 + t * k, 0);
      (e.box(0.3, _, n - 0.4, v, r, tL, i, { ry: m }), e.solid(r, i, 0.18, (n - 0.4) / 2, m));
    }
    let A = Math.floor(O / 2);
    for (let t = 0; t < O; t++) {
      let r = -a / 2 + (t + 0.5) * k,
        [i, o] = g(r, 0),
        s = HIe(e, k - 0.4, n - 0.6, J(t === A ? `#14161b` : `#4a4d53`, 0.35, 0.2), i, 0.11, o, m);
      s.renderOrder = 1;
      let [c, l] = g(r, n / 2 + 0.05);
      if (
        (t !== A &&
          e.sign(`pit_no_${t}`, `${t + 1}`, 0.7, c, 5.75, l, h, {
            color: `#ffffff`,
            bg: nL[t % nL.length],
            font: `900 100px Arial, sans-serif`,
            light: !1,
          }),
        e.light(i, 5.95, o, `#f4f8ff`, 5, 10),
        t === A)
      ) {
        e.sign(`pit_lounge`, `PIT LOUNGE`, 0.7, c, 5.75, l, h, {
          color: `#ffffff`,
          glow: `#ff3a2a`,
          font: `900 100px Arial, sans-serif`,
          li: 5,
          ld: 9,
        });
        let t = (e, t) => g(r + e, t),
          i = t(-1.4, -n / 2 + 1.2);
        (QI(e, `sofa2`, i[0], i[1], h),
          (i = t(1.6, -n / 2 + 1.2)),
          QI(e, `sofa2`, i[0], i[1], h),
          (i = t(-2.6, 0.8)),
          QI(e, `armchair`, i[0], i[1], h + eL / 2),
          (i = t(0, -n / 2 + 0.45)),
          QI(e, `tvwall`, i[0], i[1], h, { solid: !1, y: 1.2 }),
          (i = t(1.8, 1.4)),
          QI(e, `bartable`, i[0], i[1], h));
        for (let n of [1.1, 2.5]) ((i = t(n, 2.2)), QI(e, `stool`, i[0], i[1], h));
        ((i = t(2.9, -n / 2 + 1)),
          QI(e, `drinkfridge`, i[0], i[1], h),
          (i = t(-0.2, -n / 2 + 0.3)),
          QI(e, `neon3`, i[0], i[1], h, { solid: !1, y: 2.2 }));
        continue;
      }
      if (t % 3 == 1) {
        let t = g(r - 1.2, -n / 2 + 1.2);
        (QI(e, `waitseats`, t[0], t[1], h),
          (t = g(r + 1.8, -n / 2 + 0.9)),
          QI(e, `toolchest`, t[0], t[1], h),
          (t = g(r + 2.2, 1.5)),
          QI(e, `tires`, t[0], t[1], h));
        continue;
      }
      let [u, d] = g(r, 0.6);
      (t % 3 == 0 && QI(e, `carlift`, u, d, h), ZI(e, [9, 8, 7, 10][t % 4], u, d, h));
      let f = g(r + k / 2 - 1, -n / 2 + 0.9);
      (QI(e, `toolchest`, f[0], f[1], h), (f = g(r - k / 2 + 0.9, -n / 2 + 0.9)), QI(e, `tires`, f[0], f[1], h));
    }
    for (let t = 0; t < O; t += 2) {
      let [r, i] = g(-a / 2 + (t + 0.5) * k, n / 2 + 4.2);
      QI(e, `tires`, r, i, h);
    }
    for (let t = 0; t < 4; t++) {
      let [r, i] = g(-a / 2 + 14 + (t * (a - 28)) / 3, -n / 2 - 9);
      ZI(e, 11, r, i, m - eL / 2);
    }
    for (let t = 0; t < 3; t++) {
      let [r, i] = g(-a / 2 + 30 + t * 34, -n / 2 - 20);
      QI(e, `container`, r, i, h + eL / 2);
    }
    let [j, M] = g(a / 2 - 10, -n / 2 - 19);
    QI(e, `forklift`, j, M, h);
  }
  {
    let t = J(`#c9ccd2`, 0.7),
      n = [J(`#d32f2f`, 0.6), J(`#f4f4f4`, 0.6)];
    for (let r = 0; r < s; r += 2) {
      if (Math.abs(r - Nk.i) < 7) continue;
      let i = wk(r, 18),
        a = wk(r + 2, 18);
      if (YTe(i[0], i[1]) < 16.5 || YTe(a[0], a[1]) < 16.5 || __nl(i, 7) || __nl(a, 7)) continue;
      let s = o(r, 18),
        c = o(r + 2, 18),
        l = Math.hypot(c[0] - s[0], c[1] - s[1]),
        u = -Math.atan2(c[1] - s[1], c[0] - s[0]),
        d = (s[0] + c[0]) / 2,
        f = (s[1] + c[1]) / 2;
      (e.box(l + 0.06, 0.95, 0.6, t, d, tL, f, { ry: u }),
        e.box(l + 0.07, 0.18, 0.62, n[(r / 2) % 2], d, 1, f, { ry: u, cast: !1 }),
        e.solid(d, f, l / 2, 0.3, u),
        (e.solids.at(-1).car = !0));
    }
  }
  {
    let t = o(Ek, -7),
      n = o(Ek, 7),
      r = -Math.atan2(n[1] - t[1], n[0] - t[0]);
    HIe(
      e,
      14,
      2.4,
      new fS({ map: UIe(), roughness: 0.6, polygonOffset: !0, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
      (t[0] + n[0]) / 2,
      0.13,
      (t[1] + n[1]) / 2,
      r,
    );
    let i = o(Ek, -10.5),
      a = o(Ek, 10.5),
      s = J(`#14161b`, 0.4, 0.6);
    for (let t of [i, a]) (e.box(0.7, 8, 0.7, s, t[0], tL, t[1]), e.solid(t[0], t[1], 0.4, 0.4));
    e.box(21.6, 1.6, 0.8, s, (i[0] + a[0]) / 2, 7.25, (i[1] + a[1]) / 2, { ry: r });
    let c = Ck.nrm[Ek];
    for (let t of [-1, 1]) {
      let n = -c[1] * t,
        r = c[0] * t;
      e.sign(`pist_start_${t}`, `START · FINISH`, 1, (i[0] + a[0]) / 2 + n * 0.42, 8.05, (i[1] + a[1]) / 2 + r * 0.42, Math.atan2(n, r), {
        color: `#ffffff`,
        glow: `#ff2d8a`,
        font: `900 110px Arial, sans-serif`,
        li: 10,
        ld: 18,
      });
    }
    let l = YI(J(`#f4f4f4`, 0.6), 5);
    for (let t = 1; t <= 10; t++) {
      let n = o(Ek - t * 4, t % 2 ? 3.2 : -3.2);
      e.box(2.4, 0.02, 0.15, l, n[0], 0.11, n[1], { ry: r, cast: !1 });
    }
  }
  let d = J(`#7d8794`, 0.6);
  (nEe.forEach((t, n) => {
    let r = t.name === `ANA TRİBÜN` ? 3 : 2;
    for (let n = 0; n < r; n++) {
      let r = t.o0 + 1.6 + n * 2.2,
        i = n * 1.15,
        a = 0,
        c = o(t.i0, r);
      for (let n = t.i0 + 1; n <= t.i1; n++) {
        let t = o(n, r);
        if (((a += Math.hypot(t[0] - c[0], t[1] - c[1])), (c = t), a < 3.1)) continue;
        a = 0;
        let l = Ck.nrm[n % s],
          u = Math.atan2(-l[0], -l[1]);
        (i > 0 && (e.box(3.15, i, 2.3, d, t[0], tL, t[1], { ry: u }), e.solid(t[0], t[1], 1.58, 1.15, u)),
          QI(e, `bleacher`, t[0], t[1], u, { y: i }));
      }
    }
    let i = t.o0 + 1.6 + r * 2.2 + 0.2;
    for (let n = t.i0; n < t.i1; n += 4) {
      let a = Math.min(t.i1, n + 4),
        s = o(n, i),
        c = o(a, i),
        l = -Math.atan2(c[1] - s[1], c[0] - s[0]),
        u = Math.hypot(c[0] - s[0], c[1] - s[1]) + 0.4,
        d = r * 1.15 + (r === 3 ? 5.4 : 2.8);
      if (
        (e.box(u, d, 0.35, J(`#d9dde3`, 0.6), (s[0] + c[0]) / 2, tL, (s[1] + c[1]) / 2, { ry: l }),
        e.solid((s[0] + c[0]) / 2, (s[1] + c[1]) / 2, u / 2, 0.2, l),
        r === 3)
      ) {
        let r = o(n, t.o0 + 4),
          c = o(a, t.o0 + 4);
        if (
          (e.box(
            u,
            0.3,
            i - t.o0 + 1,
            J(`#1d2128`, 0.4, 0.4),
            (r[0] + c[0]) / 2 + (s[0] - r[0]) * 0.35,
            tL + d,
            (r[1] + c[1]) / 2 + (s[1] - r[1]) * 0.35,
            { ry: l },
          ),
          (n - t.i0) % 16 == 0)
        ) {
          let r = o(n, t.o0 + 0.6);
          (e.box(0.25, d, 0.25, J(`#3a3e47`, 0.4, 0.6), r[0], tL, r[1]), e.solid(r[0], r[1], 0.15, 0.15));
        }
      }
    }
    let a = Math.round((t.i0 + t.i1) / 2),
      c = Ck.nrm[a % s],
      l = o(a, i - 0.25);
    e.sign(`pist_tr${n}`, t.name, 1.4, l[0], tL + r * 1.15 + (r === 3 ? 3.8 : 1.9), l[1], Math.atan2(-c[0], -c[1]), {
      color: `#ffffff`,
      glow: nL[n % nL.length],
      font: `900 110px Arial, sans-serif`,
      li: 6,
      ld: 14,
    });
  }),
    rEe.forEach((t, n) => {
      let [r, i] = a([t.x, t.z]),
        o = t.face > 0 ? eL / 2 : -eL / 2;
      for (let n = 0; n < 2; n++) {
        let a = r + t.face * (t.w / 2 - 1.6 - n * 2.2),
          s = n * 1.15;
        for (let n = i - t.d / 2 + 1.6; n <= i + t.d / 2 - 1.6; n += 3.1)
          (s > 0 && (e.box(2.3, s, 3.15, d, a, tL, n), e.solid(a, n, 1.15, 1.58)), QI(e, `bleacher`, a, n, o, { y: s }));
      }
      let s = r - t.face * (t.w / 2 - 0.3);
      (e.box(0.35, 5.2, t.d, J(`#d9dde3`, 0.6), s, tL, i),
        e.solid(s, i, 0.2, t.d / 2),
        e.sign(`pist_bx${n}`, t.name, 1.3, s + t.face * 0.2, 4.45, i, o, {
          color: `#ffffff`,
          glow: nL[(n + 3) % nL.length],
          font: `900 110px Arial, sans-serif`,
          li: 6,
          ld: 14,
        }));
    }));
  for (let t = 10; t < s; t += 55) {
    if (Math.abs(t - Nk.i) < 12) continue;
    let n = o(t, 21.5),
      r = Ck.nrm[t];
    WIe(e, n[0], n[1], Math.atan2(-r[0], -r[1]));
  }
  ([
    [`NEON PETROL`, `#ff2d8a`],
    [`ÇETELERİN SAVAŞI`, `#1f6fd0`],
    [`NEON COLA`, `#c8141e`],
    [`FORCE GAMES`, `#14161b`],
    [`KERVAN LOJİSTİK`, `#e8890c`],
    [`NEON BANK`, `#2d8a7a`],
    [`ELMAS MADENCİLİK`, `#7d3fa8`],
  ].forEach(([t, n], r) => {
    let i = Tk(0, 0.3) + r * 26,
      a = o(i, 9.8),
      c = Ck.nrm[i % s];
    $I(e, `pist_sp${r}`, t, a[0], a[1], Math.atan2(-c[0], -c[1]), { bg: n });
  }),
    [
      [`T1`, 4],
      [`S`, 7],
      [`SAÇ TOKASI`, 11],
      [`ŞİKAN`, 23],
    ].forEach(([t, n], r) => {
      let i = Tk(n, 0.3),
        a = o(i, 20.5),
        c = Ck.nrm[i % s];
      $I(e, `pist_vr${r}`, t, a[0], a[1], Math.atan2(-c[0], -c[1]), { h: 1, y: 3.6, color: `#14161b`, bg: `#ffd23f` });
    }));
  {
    let [t, r] = a([640, -60]);
    pistClinic(e, t, r, 640, -60);
    ZI(e, 15, t + 8, r + 10, eL / 2);
    let [i, o] = a([688, -60]);
    (QI(e, `helipad`, i, o, 0, { scale: 3.4 }), QI(e, `windsock`, i + 13, o - 10, 0));
    for (let r = 0; r < 8; r++) {
      let a = (r / 8) * Math.PI * 2;
      QI(e, `padlight`, i + Math.cos(a) * 9.6, o + Math.sin(a) * 9.6, 0, { solid: !1 });
    }
    let [s, c] = a([730, -40]);
    (e.box(0.6, 9, 0.6, J(`#14161b`, 0.5), s - 7, tL, c),
      e.box(0.6, 9, 0.6, J(`#14161b`, 0.5), s + 7, tL, c),
      e.box(14.6, 7, 0.4, J(`#14161b`, 0.5), s, 5.05, c),
      e.sign(`pist_ekran`, `CANLI · NEON GP`, 2.4, s, 8.450000000000001, c + 0.24, 0, {
        color: `#ffffff`,
        glow: `#19e8ff`,
        font: `900 110px Arial, sans-serif`,
        li: 10,
        ld: 20,
      }),
      e.solid(s - 7, c, 0.35, 0.35),
      e.solid(s + 7, c, 0.35, 0.35));
  }
  return (e.label(`🏁 NEON ŞEHİR PİSTİ`, ...a([680, -90]).flatMap((e, t) => (t === 0 ? [e, 10] : [e])), `map`), []);
}
export function buildPistGirisPad(e, t, n) {
  let r = t.cx,
    i = t.cz,
    a = ([e, t]) => [e - r, t - i],
    o = (e, t, n, r) => {
      let [i, o] = a([e, t]),
        [s, c] = a([n, r]);
      return { x: (i + s) / 2, z: (o + c) / 2, w: s - i, d: c - o };
    };
  {
    let n = t.x1,
      r = t.z1,
      i = t.roundT || 0,
      a = new nS();
    (a.moveTo(-n, -r),
      a.lineTo(n, -r),
      a.lineTo(n, r - i),
      a.absarc(n - i, r - i, i, 0, eL / 2, !1),
      a.lineTo(-n + i, r),
      a.absarc(-n + i, r - i, i, eL / 2, eL, !1),
      a.lineTo(-n, -r));
    let o = new cS(a, 16),
      s = o.attributes.uv,
      c = o.attributes.position,
      l = LN(`kaldirim`);
    for (let e = 0; e < s.count; e++) s.setXY(e, c.getX(e) / l, c.getY(e) / l);
    e.mesh(o, IN(`kaldirim`), 0, tL, 0, 0, { cast: !1, rx: -eL / 2 });
  }
  let s = rL(),
    c = (t, n, r, i, a = 0.03) => {
      let c = o(t, n, r, i),
        l = LN(`asfalt`),
        u = new ib(c.w, c.d),
        d = u.attributes.uv;
      for (let e = 0; e < d.count; e++) d.setXY(e, d.getX(e) * (c.w / l), d.getY(e) * (c.d / l));
      e.mesh(u, s, c.x, tL + a, c.z, 0, { cast: !1, rx: -eL / 2 });
    },
    l = [jk.x, -207];
  (XI(e, [...Sk, [488, -208.4], [496, -208.3]].map(a), 3.6, { center: !0 }),
    XI(e, [l, [jk.x, -199], [jk.x, t.cz + t.z1 + 0.6]].map(a), 3.9, { center: !1 }),
    XI(
      e,
      [
        [jk.x - 8, -208.5],
        [jk.x - 8, -215.5],
      ].map(a),
      3.4,
      { center: !1 },
    ),
    c(Ok.x0, Ok.z0, Ok.x1, Ok.z1));
  {
    let q = LN(`asfalt`),
      g = new ib(16.6, 10),
      u = g.attributes.uv;
    for (let k = 0; k < u.count; k++) u.setXY(k, (u.getX(k) * 16.6) / q, (u.getY(k) * 10) / q);
    let [x, z] = a([jk.x - 3.9, -207.4]),
      m = e.mesh(g, YI(IN(`asfalt`), 8), x, tL + 0.09, z, 0, { cast: !1, rx: -eL / 2 });
    m.renderOrder = 2;
  }
  let u = YI(J(`#f4f4f4`, 0.6), 4),
    d = [1, 2, 3, 4, 5, 6, 7, 10, 2, 5],
    f = 0;
  for (let t = 0; t < 2; t++) {
    let n = Ok.z0 + 7 + t * 18;
    for (let r = 0; r < 22; r++) {
      let i = Ok.x0 + 4 + r * 3.3,
        [o, s] = a([i, n]);
      if ((e.box(0.12, 0.02, 5.2, u, o, 0.09, s, { cast: !1 }), (r * 7 + t * 3) % 5 < 3 && r < 21)) {
        let [r, o] = a([i + 1.65, n]);
        ZI(e, d[f++ % d.length], r, o, t ? eL : 0);
      }
    }
  }
  $I(e, `pg_otopark`, `OTOPARK`, ...a([Ok.x0 + 4, Ok.z1 + 0.6]), 0, { h: 1, y: 2.8, bg: `#1d4f9a` });
  {
    let [t, n] = a([480, -208.5]),
      r = J(`#14161b`, 0.4, 0.6);
    for (let i of [-1, 1])
      (e.box(0.5, 6, 0.5, r, t, tL, n + i * 5.2),
        e.solid(t, n + i * 5.2, 0.3, 0.3),
        e.box(0.12, 5.8, 0.12, RN(`#ff2d8a`, 2.4), t + 0.3, tL, n + i * 5.2, { cast: !1 }));
    (e.box(0.6, 1.2, 11, r, t, 5.6499999999999995, n),
      e.sign(`pg_hosgeldin_a`, `NEON ŞEHİR PİSTİ`, 0.9, t - 0.32, 6.25, n, -eL / 2, {
        color: `#ffffff`,
        glow: `#ff2d8a`,
        font: `900 110px Arial, sans-serif`,
        li: 6,
        ld: 12,
      }),
      e.sign(`pg_hosgeldin_b`, `İYİ YOLCULUKLAR`, 0.7, t + 0.32, 6.25, n, eL / 2, {
        color: `#ffffff`,
        glow: `#19e8ff`,
        font: `900 110px Arial, sans-serif`,
        light: !1,
      }));
  }
  {
    let [t, n] = a([jk.x, jk.z]),
      r = 4.6;
    (e.box(2.4, 2.8, 2.4, J(`#e9edf2`, 0.5), t - r - 1.8, tL, n),
      e.box(2.6, 0.2, 2.6, J(`#19e8ff`, 0.4), t - r - 1.8, 2.8499999999999996, n),
      e.solid(t - r - 1.8, n, 1.2, 1.2));
    let i = e.box(0.18, 0.18, 7, J(`#d32f2f`, 0.5), t - r + 0.4, 1.1500000000000001, n - 0.2, { cast: !1 });
    ((i.rotation.x = 1.1), i.position.set(t - r + 0.4, 3.9499999999999997, n - 1.4));
    for (let r of [-1, 1])
      (e.box(0.3, 5, 0.3, J(`#14161b`, 0.5), t + r * 4.8999999999999995, tL, n), e.solid(t + r * 4.8999999999999995, n, 0.2, 0.2));
    (e.box(10.2, 0.6, 0.4, J(`#14161b`, 0.5), t, 4.85, n),
      e.sign(`pg_arac`, `ARAÇ GİRİŞİ`, 0.5, t, 5.1499999999999995, n - 0.22, eL, {
        color: `#06202a`,
        bg: `#19e8ff`,
        font: `900 100px Arial, sans-serif`,
        light: !1,
      }),
      e.sign(`pg_arac2`, `PİST`, 0.5, t, 5.1499999999999995, n + 0.22, 0, {
        color: `#06202a`,
        bg: `#19e8ff`,
        font: `900 100px Arial, sans-serif`,
        light: !1,
      }));
  }
  {
    let [t, n] = a([Mk.x, Mk.z]),
      r = J(`#14161b`, 0.4, 0.6);
    for (let i of [-1, 1])
      (e.box(1.2, 7, 1.2, r, t + i * (Mk.w / 2 + 0.6), tL, n),
        e.solid(t + i * (Mk.w / 2 + 0.6), n, 0.6, 0.6),
        e.box(0.14, 6.8, 0.14, RN(i > 0 ? `#ff2d8a` : `#19e8ff`, 2.6), t + i * (Mk.w / 2 + 0.6), tL, n + 0.66, { cast: !1 }));
    (e.box(Mk.w + 3, 1.6, 1.2, r, t, 6.25, n),
      e.sign(`pg_kemer`, `NEON ŞEHİR GRAND PRIX`, 1.1, t, 7.05, n - 0.62, eL, {
        color: `#ffffff`,
        glow: `#ff2d8a`,
        font: `900 110px Arial, sans-serif`,
        li: 10,
        ld: 18,
      }),
      e.sign(`pg_kemer2`, `YAYA GİRİŞİ · TRİBÜNLER`, 0.8, t, 7.05, n + 0.62, 0, {
        color: `#ffffff`,
        glow: `#19e8ff`,
        font: `900 110px Arial, sans-serif`,
        li: 6,
        ld: 12,
      }));
    for (let r = -2; r <= 2; r++) QI(e, `stanchion`, t + r * 1.9, n - 1.6, 0);
  }
  {
    let t = o(kk.x0, kk.z0, kk.x1, kk.z1);
    (e.floor(`beton`, t.w, t.d, t.x, t.z, 0.07), festVendors(e, a, n));
    for (let t = 0; t < 6; t++) {
      let [n, r] = a([kk.x0 + 14 + t * 18.5, kk.z0 + 13]);
      QI(e, `plastikmasa`, n, r, 0);
      for (let [t, i] of [
        [-0.8, 0],
        [0.8, 0],
        [0, 0.8],
        [0, -0.8],
      ])
        QI(e, `plastiktabure`, n + t, r + i, 0);
      QI(e, `umbrella`, n, r, 0, { solid: !1, ti: t % 6 });
    }
    let r = [];
    for (let e = 0; e <= 7; e++) r.push(a([kk.x0 + e * 16, e % 2 ? kk.z0 + 7.5 : kk.z1 - 0.5]));
    r.forEach(([t, n]) => {
      (e.box(0.12, 5.4, 0.12, J(`#d8dce2`, 0.35, 0.7), t, tL, n),
        e.solid(t, n, 0.1, 0.1),
        e.box(0.5, 0.2, 0.3, RN(`#ffe9a8`, 2.2), t, 5.35, n, { cast: !1 }),
        e.light(t, 5.05, n, `#ffd9a0`, 4, 10));
    });
    for (let t = 0; t < r.length - 1; t++) KIe(e, r[t], r[t + 1]);
    $I(e, `pg_fest`, `NEON FEST`, ...a([kk.x0 + 1.5, kk.z1 - 1]), -eL / 2, { h: 1.2, y: 3.4, bg: `#ff2d8a` });
  }
  {
    let [t, n] = a([Ak.x, Ak.z]);
    (e.box(Ak.w, 1.4, Ak.d, J(`#1d2128`, 0.5), t, tL, n), e.mass(Ak.w, 1.4, Ak.d, t, n, tL));
    stageStairs(e, t, n);
    let r = J(`#3a3f4a`, 0.4, 0.7);
    for (let i of [-1, 1]) for (let a of [-1, 1]) e.box(0.5, 10, 0.5, r, t + i * (Ak.w / 2 - 0.4), tL, n + a * (Ak.d / 2 - 0.4));
    for (let i of [-1, 1]) e.box(Ak.w, 0.5, 0.5, r, t, 10.05, n + i * (Ak.d / 2 - 0.4));
    for (let i of [-1, 1]) e.box(0.5, 0.5, Ak.d, r, t + i * (Ak.w / 2 - 0.4), 10.05, n);
    (e.box(Ak.w - 6, 6, 0.3, J(`#0b0c10`, 0.4), t, 2.65, n - Ak.d / 2 + 1),
      e.sign(`pg_sahne`, `NEON FEST · CANLI`, 1.8, t, 6.45, n - Ak.d / 2 + 1.2, 0, {
        color: `#ffffff`,
        glow: `#b46bff`,
        font: `900 110px Arial, sans-serif`,
        li: 10,
        ld: 20,
      }));
    for (let r = 0; r < 6; r++)
      e.cyl(0.35, 0.35, 0.5, RN(nL[r], 3), t - Ak.w / 2 + 3 + r * ((Ak.w - 6) / 5), 9.450000000000001, n + Ak.d / 2 - 1, 10, { cast: !1 });
    for (let r of [-1, 1]) QI(e, `speaker`, t + r * (Ak.w / 2 - 2), n + Ak.d / 2 - 2, 0, { y: 1.4 });
    for (let r of [-1, 1]) QI(e, `searchlight`, t + r * (Ak.w / 2 + 2.5), n + Ak.d / 2, 0);
    e.light(t, 8.05, n + Ak.d / 2 + 2, `#b46bff`, 12, 30);
  }
  for (let t = 0; t < 4; t++) {
    let [n, r] = a([Ok.x0 + 10 + t * 20, (Ok.z0 + Ok.z1) / 2]);
    e.item(`streetlamp`, n, r, 0, 0, { y: tL });
  }
  let p = (e, t, r, i, o) => {
    let [s, c] = a([t, r]);
    n.npc.push({ x: s, z: c, name: e, av: i, lines: o });
  };
  return (
    p(
      `Bilet Görevlisi Selin`,
      Mk.x - 3,
      Mk.z - 3,
      { clothing: `jacket`, clothColor: `#ff2d8a`, hat: `cap`, hatColor: `#14161b`, pantsColor: `#2b3550` },
      [`Tribünler bu kapıdan, buyurun.`, `Bugün Neon GP var, çok kalabalık!`, `Arabayla gelenler araç kapısından.`],
    ),
    p(
      `Kapı Görevlisi Murat`,
      jk.x - 8,
      jk.z - 4,
      { clothing: `jacket`, clothColor: `#19b8e8`, hat: `cap`, hatColor: `#14161b`, pantsColor: `#2b3550` },
      [`Yarışacaksan araç kapısından geç.`, `Servis yolu seni son virajın çıkışına bırakır.`],
    ),
    p(`Taraftar Ece`, kk.x0 + 40, kk.z0 + 17, { clothing: `hoodie`, clothColor: `#19e8ff`, pantsColor: `#1a1a1c` }, [
      `T1 tribününden izle, en iyi orası!`,
      `Sahne akşam açılıyor.`,
    ]),
    p(`Taraftar Burak`, kk.x0 + 70, kk.z0 + 18, { clothing: `hoodie`, clothColor: `#ffd23f`, pantsColor: `#1a1a1c` }, [
      `Saç tokasında hep kaza oluyor.`,
      `Arabanı modifiye ettirdin mi?`,
    ]),
    []
  );
}

// --- prototipten: festival satıcıları, sahne merdivenleri, sağlık merkezi, pit yolu ağzı ---------
var FEST_FOODS = [`kofteci`, `donerci`, `kokorecci`, `midyeci`, `dondurmaci`, `simitci`];
function festVendors(e, a, n) {
  for (var r = 0; r < 12; r++) {
    var p = a([kk.x0 + 6 + r * 9.1, kk.z0 + 2.4]);
    GIe(e, FEST_FOODS[r % 6], p[0], p[1], 0, n, { compact: !0 });
  }
  var S = [577, 584.5, 592, 599.5, 607, 625.5, 634.75, 644, 653.25, 662.5, 671.75, 681];
  S.forEach(function (x, i) {
    var p = a([x, kk.z1 - 2.4]);
    GIe(e, FEST_FOODS[(i + 3) % 6], p[0], p[1], Math.PI, n, { compact: !0, nolamp: !0 });
  });
  [580.75, 595.75, 630.1, 648.6, 667.1].forEach(function (x, i) {
    var p = a([x, kk.z1 - 0.9]);
    e.item(`streetlamp`, p[0], p[1], 4, 0, { y: tL });
    if (i % 2 == 0) {
      var q = a([x + 1.4, kk.z1 - 1.2]);
      e.item(`copkutusu`, q[0], q[1], 0, 0, { y: tL });
    }
  });
}
function stageStairs(e, t, n) {
  var top = 1.4,
    ns = 6,
    run = 0.5,
    W = 2.6,
    fz = n + 7,
    mt = J(`#1d2128`, 0.5),
    nz = RN(`#b46bff`, 2.2),
    rl = J(`#c9ccd2`, 0.25, 0.85);
  [-11, 11].forEach(function (dx) {
    var x = t + dx;
    for (var i = 0; i < ns; i++) {
      var h = ((i + 1) * top) / ns;
      e.box(W, h, run + 0.01, mt, x, tL, fz + ns * run - (i + 0.5) * run);
      e.box(W, 0.03, 0.05, nz, x, tL + h - 0.01, fz + ns * run - i * run - 0.04, { cast: !1 });
    }
    e.solid(x, fz + (ns * run) / 2, W / 2, (ns * run) / 2);
    e.solids.at(-1).car = !0;
    [-1, 1].forEach(function (s) {
      var px = x + s * (W / 2 + 0.03),
        L = Math.hypot(ns * run, top),
        an = Math.atan2(top, ns * run);
      var rr = e.box(0.06, 0.06, L, rl, px, tL + top / 2 + 0.95, fz + (ns * run) / 2, { center: !0 });
      rr.rotation.x = an;
      for (var j = 0; j < 3; j++) {
        var zz = fz + 0.15 + (j * (ns * run - 0.3)) / 2;
        e.box(0.05, 0.95, 0.05, rl, px, tL + top * (1 - (zz - fz) / (ns * run)), zz);
      }
    });
  });
}
let CLINIC = null;
export const pistClinic_ = () => CLINIC; // motor: içerideyken çatı gizlenir
function pistClinic(e, t, r, wx, wz) {
  const W = 22,
    D = 12,
    H = 4.5,
    wh = J(`#f4f1f1`, 0.6).clone(),
    red = J(`#c8141e`, 0.5),
    gry = J(`#cfd6de`, 0.5),
    gl = new soe.MeshStandardMaterial({ color: `#cfe8f5`, roughness: 0.05, metalness: 0.2, transparent: !0, opacity: 0.25, depthWrite: !1, side: 2 }),
    fz = r + D / 2 - 0.15,
    bz = r - D / 2 + 0.15;
  e.floor(`zemin_beyaz`, W - 0.5, D - 0.5, t, r, tL + 0.06);
  const NM = (m) => ((m.userData.noMerge = !0), m),
    RF2 = [];
  NM(e.box(W, H, 0.3, wh, t, tL, bz));
  for (const sx of [-1, 1]) NM(e.box(0.3, H, D, wh, t + sx * (W / 2 - 0.15), tL, r));
  for (const [x0, x1] of [
    [-W / 2, -1.4],
    [1.4, W / 2],
  ]) {
    const w = x1 - x0,
      cx = t + (x0 + x1) / 2;
    NM(e.box(w, 0.9, 0.3, wh, cx, tL, fz));
    NM(e.box(w, 1.1, 0.3, wh, cx, tL + 3.4, fz));
    const g = e.mesh(new soe.PlaneGeometry(w - 0.2, 2.5), gl, cx, tL + 2.15, fz, 0, { cast: !1, receive: !1 });
    g.renderOrder = 5;
    for (let x = x0 + 2.5; x < x1 - 0.5; x += 2.5) e.box(0.08, 2.5, 0.1, gry, t + x, tL + 0.9, fz);
  }
  NM(e.box(2.8, 1.1, 0.3, wh, t, tL + 3.4, fz));
  for (const sx of [-1, 1]) {
    const g = e.mesh(new soe.PlaneGeometry(D - 3, 1.4), gl, t + sx * (W / 2 - 0.15), tL + 2.4, r, Math.PI / 2, { cast: !1, receive: !1 });
    g.renderOrder = 5;
  }
  RF2.push(NM(e.box(W + 0.6, 0.4, D + 0.6, red, t, tL + H, r)), NM(e.box(W, 0.12, D, J(`#eef1f4`, 0.6), t, tL + H - 0.12, r, { cast: !1 })));
  RF2.push(NM(e.box(3.6, 0.18, 2, red, t, tL + 3.1, fz + 1)));
  for (const sx of [-1, 1]) e.box(0.12, 3.1, 0.12, gry, t + sx * 1.7, tL, fz + 1.9);
  const RC = RN(`#ff2a3a`, 2.4);
  RF2.push(
    NM(e.box(0.5, 1.6, 0.12, RC, t + 7.5, tL + H + 0.45, fz - 0.2, { cast: !1 })),
    NM(e.box(1.6, 0.5, 0.12, RC, t + 7.5, tL + H + 1, fz - 0.2, { cast: !1 })),
  );
  e.sign(`pist_saglik`, `PİST SAĞLIK MERKEZİ`, 0.8, t, tL + 3.95, fz + 0.18, 0, {
    color: `#ffffff`,
    bg: `#c8141e`,
    font: `900 100px Arial, sans-serif`,
    light: !1,
  });
  e.solid(t, bz, W / 2, 0.25);
  for (const sx of [-1, 1]) e.solid(t + sx * (W / 2 - 0.15), r, 0.25, D / 2);
  for (const sx of [-1, 1]) e.solid(t + sx * (W / 4 + 0.65), fz, W / 4 - 0.65, 0.25);
  for (let i = 0; i < 4; i++) {
    const x = t - 8.4 + i * 3.2;
    QI(e, `bed1`, x, bz + 1.4, 0);
    QI(e, `nightst`, x + 1.25, bz + 0.5, 0);
  }
  for (let i = 0; i < 3; i++) e.box(0.05, 2.2, 2.2, J([`#7fc8c0`, `#9fd0e8`, `#7fc8c0`][i], 0.8), t - 6.8 + i * 3.2, tL + 0.25, bz + 1.4, { cast: !1 });
  QI(e, `desk`, t + 5.6, fz - 2.4, Math.PI);
  QI(e, `chairw`, t + 5.6, fz - 3, 0, { solid: !1 });
  QI(e, `filecab`, t + 9.9, bz + 0.6, 0);
  QI(e, `filecab`, t + 9, bz + 0.6, 0);
  QI(e, `watercooler`, t + 10.2, fz - 1, -Math.PI / 2, { solid: !1 });
  QI(e, `waitseats`, t - 6.4, fz - 1.3, Math.PI);
  QI(e, `waitseats`, t - 3.6, fz - 1.3, Math.PI);
  QI(e, `plantb`, t - 10.2, fz - 0.8, 0, { solid: !1 });
  QI(e, `plantb`, t + 2, fz - 0.8, 0, { solid: !1 });
  QI(e, `extinguisher`, t - 10.4, bz + 0.6, 0, { solid: !1 });
  QI(e, `tvwall`, t + 3.4, bz + 0.2, 0, { solid: !1, y: 1.2 });
  e.box(2, 0.9, 0.8, J(`#e8eef4`, 0.5), t + 7.4, tL, r + 0.4);
  e.box(0.9, 0.06, 1.9, J(`#2a5fd0`, 0.5), t + 2.4, tL + 0.8, r + 0.6);
  for (const dz of [-0.7, 0.7]) e.box(0.06, 0.8, 0.06, gry, t + 2.4, tL, r + 0.6 + dz);
  e.light(t - 5, tL + 3.6, r, `#f4fbff`, 6, 12);
  e.light(t + 5, tL + 3.6, r, `#f4fbff`, 6, 12);
  RF2.push(
    NM(e.box(W - 2, 0.05, 0.3, RN(`#f4fbff`, 1.8), t, tL + H - 0.2, r - 2, { cast: !1 })),
    NM(e.box(W - 2, 0.05, 0.3, RN(`#f4fbff`, 1.8), t, tL + H - 0.2, r + 2, { cast: !1 })),
  );
  e.box(2.6, 0.02, 1.6, J(`#c8141e`, 0.8), t, tL + 0.07, fz + 0.9, { cast: !1 });
  CLINIC = { x: wx, z: wz, W, D, roof: RF2, mat: wh, ins: !1 };
}
function taper(e, P, w0, w1, y, ox, oz) {
  const o = VIe(P, 1),
    n = o.length,
    L = [],
    Rr = [],
    N = [],
    cum = [0];
  for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(o[k][0] - o[k - 1][0], o[k][1] - o[k - 1][1]));
  const T = cum[n - 1] || 1;
  for (let k = 0; k < n; k++) {
    const a = o[Math.max(0, k - 1)],
      b = o[Math.min(n - 1, k + 1)];
    let dx = b[0] - a[0],
      dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const u = cum[k] / T,
      s = u * u * (3 - 2 * u),
      w = w0 + (w1 - w0) * s;
    N.push([dz, -dx, w]);
    L.push([o[k][0] + dz * w, o[k][1] - dx * w]);
    Rr.push([o[k][0] - dz * w, o[k][1] + dx * w]);
  }
  e.mesh(JI(L, Rr, y, LN(`asfalt`)), rL(), 0, 0, 0, 0, { cast: !1 });
  const lm = YI(J(`#f2f2f2`, 0.6), 4);
  for (const sg of [1, -1]) {
    let A = [],
      B = [];
    const fl = () => {
      A.length > 1 && e.mesh(JI(A, B, y + 0.006, 4), lm, 0, 0, 0, 0, { cast: !1 });
      A = [];
      B = [];
    };
    for (let k = 0; k < n; k++) {
      const [nx, nz, w] = N[k],
        c = o[k],
        p1 = [c[0] + nx * sg * (w - 0.35), c[1] + nz * sg * (w - 0.35)],
        p2 = [c[0] + nx * sg * (w - 0.2), c[1] + nz * sg * (w - 0.2)];
      if (YTe(p2[0] + ox, p2[1] + oz) < 7.6) {
        fl();
        continue;
      }
      A.push(p1);
      B.push(p2);
    }
    fl();
  }
}
