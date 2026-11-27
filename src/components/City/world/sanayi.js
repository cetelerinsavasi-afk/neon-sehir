// =============================================================================
// v219 — SANAYİ SİTESİ (yeni harita, doğu): motor galerisi (A-1), oto tamirci, konteyner sahası,
// inşaat alanı (kuzey) ve sitenin iç caddesi (kemer, "GİRİŞ YOK" bariyerleri, park etmiş kamyonlar).
// Prototipten (harita_duzeni5) aktarıldı. Motor galerisi / tamirci zemin kat dükkânları buildings.js'teki
// motoShowroom / tamirGarage ile aynı (kapı bölgeleri, NPC'ler, haritadaki simgeler değişmedi).
// =============================================================================
import * as THREE from 'three';
import { M as J, glowMat as RN, canvasTex as MN } from '../kit.js';
import { motoShowroom as iMe, tamirGarage as aMe, SHOW_DEPTH as kP, TAMIR_DEPTH as jP, TAMIR_H as MP } from '../buildings.js';
import { buildVehicle as GE } from '../vehicles.js';
import { SANAYI as RO } from '../cityLayout.js';

const fS = THREE.MeshStandardMaterial;
const Sy = THREE.MeshBasicMaterial;
const Gy = THREE.BoxGeometry;
const ib = THREE.PlaneGeometry;
const Jx = THREE.ConeGeometry;
const RP = Math.PI;
const zP = '#ffc21a'; // sanayi sarısı

function AMe(e = `#8d949c`) {
  let t = MN(`sac_${e}`, 128, 128, (t, n, r) => {
    ((t.fillStyle = e), t.fillRect(0, 0, n, r));
    for (let e = 0; e < n; e += 8)
      ((t.fillStyle = `rgba(255,255,255,0.12)`), t.fillRect(e, 0, 3, r), (t.fillStyle = `rgba(0,0,0,0.16)`), t.fillRect(e + 5, 0, 2, r));
    for (let e = 0; e < 18; e++)
      ((t.fillStyle = `rgba(90,60,30,${0.05 + Math.random() * 0.06})`),
        t.fillRect(Math.random() * n, Math.random() * r, 6 + Math.random() * 20, 2 + Math.random() * 10));
  });
  return (t.repeat.set(1, 1), new fS({ map: t, roughness: 0.55, metalness: 0.45 }));
}
function LP(e, t, n, r, i, a, o, s, c = 4) {
  let l = new Gy(t, n, r),
    u = l.attributes.uv;
  for (let e = 0; e < 6; e++) {
    let [i, a] = e < 2 ? [r, n] : e < 4 ? [t, r] : [t, n];
    for (let t = 0; t < 4; t++) {
      let n = e * 4 + t;
      u.setXY(n, u.getX(n) * (i / c), u.getY(n) * (a / c));
    }
  }
  return e.mesh(l, i, a, o + n / 2, s);
}
function jMe(e, t, n, r, i, a = null) {
  let o = MN(
      `bay_${r}x${i}`,
      256,
      Math.round((256 * i) / r),
      (e, t, n) => {
        ((e.fillStyle = `rgba(0,0,0,0)`),
          e.clearRect(0, 0, t, n),
          (e.strokeStyle = zP),
          (e.lineWidth = 10),
          e.strokeRect(5, 5, t - 10, n - 10),
          (e.lineWidth = 6));
        for (let r = -n; r < t; r += 26) (e.beginPath(), e.moveTo(r, n), e.lineTo(r + n, 0), e.stroke());
      },
      { repeat: !1 },
    ),
    s = e.mesh(
      new ib(r, i),
      new Sy({ map: o, transparent: !0, depthWrite: !1, polygonOffset: !0, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      t,
      0.16,
      n,
      0,
      { cast: !1, receive: !1, rx: -RP / 2 },
    );
  ((s.renderOrder = 1),
    a && (e.sign(`bayt_${a}_${t}_${n}`, a, 0.5, t, 0.17, n, 0, { color: zP, font: `900 100px Arial, sans-serif`, light: !1 }).rotation.x = -RP / 2));
}
function MMe(e, t, n, r = 2, i = `#b48a56`) {
  for (let a = 0; a < r; a++)
    (e.box(1.2, 0.14, 1, J(`#a07a4a`, 0.85), t, 0.12 + a * 0.9, n), e.box(1.1, 0.74, 0.92, J(a % 2 ? `#c9a46a` : i, 0.8), t, 0.26 + a * 0.9, n));
  e.solid(t, n, 0.62, 0.52);
}
function NMe(e, t, n, r = `#1f6fd0`) {
  (e.cyl(0.3, 0.3, 0.9, J(r, 0.5, 0.3), t, 0.12, n, 14), e.solid(t, n, 0.32, 0.32));
}
function PMe(e, t, { open: n, depth: r, oh: i, tint: a, label: o, sub: s }) {
  let { w: c, d: l } = t,
    u = 8.5,
    d = l / 2 - 8,
    f = -l / 2 + 0.4,
    p = AMe(a),
    m = n.x,
    h = n.w,
    g = d - r;
  LP(e, c - 0.8, u, g - f, p, 0, 0, (f + g) / 2);
  let _ = -c / 2 + 0.4,
    v = m - h / 2,
    y = m + h / 2,
    b = c / 2 - 0.4;
  (v - _ > 0.3 && LP(e, v - _, u, r, p, (_ + v) / 2, 0, d - r / 2),
    b - y > 0.3 && LP(e, b - y, u, r, p, (y + b) / 2, 0, d - r / 2),
    LP(e, h, u - i, r, p, m, i, d - r / 2));
  let x = J(`#5d636b`, 0.5, 0.5);
  for (let t = 0; t < 4; t++) {
    let n = f + (t + 0.5) * ((d - f) / 4),
      r = e.box(c - 0.6, 0.25, (d - f) / 4 - 0.2, x, 0, u, n);
    ((r.rotation.x = -0.18), e.box(c - 1.4, 0.9, 0.08, J(`#bcd6e6`, 0.1, 0.3), 0, 8.6, n - (d - f) / 8 + 0.3, { cast: !1 }));
  }
  (e.box(c - 0.6, 0.5, 0.3, J(`#2a2d33`, 0.5, 0.5), 0, u - 0.5, d + 0.12),
    e.sign(`san_${o}`, o, 1, 0, u - 1.4, d + 0.3, 0, { color: `#ffffff`, bg: `#14161b`, font: `900 100px Arial, sans-serif`, light: !1 }),
    s && e.sign(`san_s_${o}`, s, 0.55, 0, u - 2.35, d + 0.3, 0, { color: `#14161b`, bg: zP, font: `900 100px Arial, sans-serif`, light: !1 }),
    e.solid(0, (f + g) / 2, (c - 0.8) / 2, (g - f) / 2),
    e.blocker(c - 0.8, u, g - f, 0, 0, (f + g) / 2),
    v - _ > 0.3 && e.solid((_ + v) / 2, d - r / 2, (v - _) / 2, r / 2),
    b - y > 0.3 && e.solid((y + b) / 2, d - r / 2, (b - y) / 2, r / 2),
    e.box(5, 4.4, 0.1, J(`#9aa1a9`, 0.5, 0.5), -c / 4 - 2, 0, d + 0.06));
  for (let t of [-c / 4 - 4.9, -c / 4 + 0.9]) e.cyl(0.14, 0.14, 1.1, J(zP, 0.5), t, 0, d + 0.6, 10);
  return (
    e.box(1.2, 0.18, 0.4, RN(`#fff2d6`, 2), m, i + 0.5, d + 0.25, { cast: !1 }),
    e.light(m, i + 0.3, d + 1.2, `#ffe6c0`, 5, 9),
    { zf: d, H: u }
  );
}
function FMe(e, t, n, r = 0) {
  let { w: i, d: a } = t;
  (e.floor(`beton`, i, a / 2 - n, 0, (n + a / 2) / 2, 0.15),
    jMe(e, -i / 4 - 2, n + 3.6, 5.5, 6.4, null),
    MMe(e, i / 2 - 1.4, n + 1.2, 2),
    MMe(e, i / 2 - 1.4, n + 2.6, 1, `#c98a3a`),
    NMe(e, i / 2 - 3, n + 1, r % 2 ? `#1f6fd0` : `#c8141e`),
    NMe(e, i / 2 - 3.7, n + 1, `#2f8f4a`),
    e.item(`tires`, -i / 2 + 1.4, n + 1.2, 0, 0));
}
export function buildMotorLot(e, t) {
  let n = 4.5,
    { zf: r } = PMe(e, t, { open: { x: n, w: 9 }, depth: kP + 0.2, oh: 3.02, tint: `#8f969f`, label: `NEON MOTOR`, sub: `SANAYİ SİTESİ · A-1` });
  (FMe(e, t, r, 1), iMe(e, { x: n, zf: r, w: 8.6, inside: !0 }));
}
export function buildTamirLot(e, t) {
  let n = 4.5,
    { zf: r } = PMe(e, t, { open: { x: n, w: 9 }, depth: jP + 0.2, oh: MP + 0.02, tint: `#8a9097`, label: `OTO TAMİR`, sub: `SANAYİ SİTESİ · B-2` });
  (FMe(e, t, r, 2), aMe(e, { x: n, zf: r, w: 8.6, inside: !0 }));
}
export function buildKonteyner(e, t) {
  let { w: n, d: r } = t;
  e.floor(`beton`, n, r, 0, 0, 0.15);
  let i = [`#c0392b`, `#2471a3`, `#1e8449`, `#d68910`, `#7d3c98`, `#5d6d7e`],
    a = (t, n, r, i, a = 0) => {
      let o = LP(e, 2.44, 2.6, 6.1, AMe(i), t, 0.15 + r * 2.6, n, 2.4);
      o.rotation.y = a;
    },
    o = 0;
  for (let t = 0; t < 3; t++)
    for (let s = 0; s < 4; s++) {
      let c = -n / 2 + 2.2 + s * 3,
        l = -r / 2 + 4 + t * 6.8,
        u = 1 + ((t * 4 + s) % 3);
      for (let e = 0; e < u; e++) a(c, l, e, i[o++ % i.length]);
      (e.solid(c, l, 1.25, 3.1), e.blocker(2.44, u * 2.6, 6.1, c, 0.15, l));
    }
  let s = n / 2 - 7;
  for (let t of [-1, 1]) {
    for (let n of [-1, 1]) e.box(0.6, 11, 0.6, J(zP, 0.5, 0.3), s + n * 4.5, 0.15, t * (r / 2 - 2));
    (e.solid(s - 4.5, t * (r / 2 - 2), 0.35, 0.35), e.solid(s + 4.5, t * (r / 2 - 2), 0.35, 0.35));
  }
  for (let t of [-1, 1]) e.box(0.7, 0.9, r - 3.4, J(zP, 0.5, 0.3), s + t * 4.5, 11, 0);
  (e.box(9.7, 0.7, 2.2, J(`#d4a30e`, 0.5, 0.3), s, 10.4, 2),
    jMe(e, s, r / 2 - 4.5, 7, 6.5, null),
    e.sign(`konteyner_tab`, `KONTEYNER SAHASI`, 0.8, 0, 2.6, r / 2 + 0.2, 0, {
      color: `#14161b`,
      bg: zP,
      font: `900 100px Arial, sans-serif`,
      light: !1,
    }),
    e.box(0.14, 2.3, 0.14, J(`#9aa0a8`, 0.4, 0.7), -2.6, 0.15, r / 2 + 0.1),
    e.box(0.14, 2.3, 0.14, J(`#9aa0a8`, 0.4, 0.7), 2.6, 0.15, r / 2 + 0.1));
}
export function buildInsaat(e, t) {
  let { w: n, d: r } = t;
  e.floor(`tarla`, n, r, 0, 0, 0.14);
  let i = 0.14,
    a = J(`#b9b6ae`, 0.85),
    o = J(`#5a3a2a`, 0.6, 0.6),
    s = J(zP, 0.5, 0.3),
    c = MN(
      `insaat_pano`,
      512,
      128,
      (e, t, n) => {
        ((e.fillStyle = `#1d4f9a`),
          e.fillRect(0, 0, t, n),
          (e.fillStyle = zP),
          e.fillRect(0, n - 18, t, 18),
          (e.fillStyle = `#ffffff`),
          (e.font = `900 46px Arial, sans-serif`),
          (e.textAlign = `center`),
          (e.textBaseline = `middle`),
          e.fillText(`NEON YAPI · İNŞAAT ALANI`, t / 2, n / 2 - 8));
      },
      { repeat: !1 },
    ),
    l = new fS({ map: c, roughness: 0.7 }),
    u = (t, n, r, a) => {
      let o = Math.hypot(r - t, a - n),
        s = -Math.atan2(a - n, r - t),
        c = Math.max(1, Math.round(o / 8));
      for (let u = 0; u < c; u++) {
        let d = u / c,
          f = (u + 1) / c,
          p = t + (r - t) * d,
          m = n + (a - n) * d,
          h = t + (r - t) * f,
          g = n + (a - n) * f;
        (e.box(o / c - 0.05, 2.4, 0.08, l, (p + h) / 2, i, (m + g) / 2, { ry: s }), e.box(0.12, 2.6, 0.12, J(`#6b7178`, 0.4, 0.7), p, i, m));
      }
      e.solid((t + r) / 2, (n + a) / 2, o / 2, 0.08, s);
    },
    d = n / 2 - 0.3,
    f = r / 2 - 0.3;
  (u(-d, -f, d, -f),
    u(-d, -f, -d, f),
    u(d, -f, d, f),
    u(-d, f, -4.5, f),
    u(4.5, f, d, f),
    e.box(4.2, 2, 0.1, J(`#d4a30e`, 0.5, 0.3), -2.3, i, f + 0.3),
    e.solid(-2.3, f + 0.3, 2.1, 0.08),
    e.sign(`insaat_baret`, `BARETSİZ GİRMEK YASAKTIR`, 0.42, 6.5, 2.99, f + 0.08, 0, {
      color: `#ffffff`,
      bg: `#c8141e`,
      font: `900 100px Arial, sans-serif`,
      light: !1,
    }));
  for (let t of [-3.4, 0, 3.4]) e.item(`cone`, t, f + 1.4, 0, 0, { y: 0 });
  let p = -n / 2 + 20,
    m = -1.5;
  (e.box(30, 0.5, 16, a, p, i, m), e.solid(p, m, 30 / 2, 16 / 2), e.blocker(30, 8, 16, p, i, m));
  let h = [];
  for (let e = 0; e <= 5; e++) for (let t = 0; t <= 2; t++) h.push([p - 30 / 2 + 1 + (28 / 5) * e, -8.5 + (14 / 2) * t]);
  (h.forEach(([t, n]) => e.box(0.5, 3.2, 0.5, a, t, 0.64, n)),
    e.box(30, 0.35, 16, a, p, 3.8400000000000003, m),
    h.forEach(([t, n], r) => {
      if (!(t > p)) {
        for (let [r, i] of [
          [-0.18, -0.18],
          [0.18, -0.18],
          [-0.18, 0.18],
          [0.18, 0.18],
        ])
          e.cyl(0.03, 0.03, 1.4, o, t + r, 4.1899999999999995, n + i, 5, { cast: !1 });
        return;
      }
      if ((e.box(0.5, 3, 0.5, a, t, 4.1899999999999995, n), r % 2))
        for (let [r, i] of [
          [-0.18, -0.18],
          [0.18, 0.18],
        ])
          e.cyl(0.03, 0.03, 1.2, o, t + r, 7.1899999999999995, n + i, 5, { cast: !1 });
    }),
    e.box(30 / 2, 0.35, 16, a, p + 30 / 4, 7.1899999999999995, m),
    e.box(30 / 2 - 1, 0.6, 0.12, J(`#e0b43a`, 0.8), p - 30 / 4, 4.1899999999999995, 6.1));
  let g = 7.7,
    _ = J(`#9aa0a8`, 0.35, 0.8);
  for (let t = 0; t <= 10; t++) {
    let n = p - 30 / 2 + (30 / 10) * t;
    (e.box(0.08, 7.6, 0.08, _, n, i, g), e.box(0.08, 7.6, 0.08, _, n, i, 8.8));
  }
  for (let t of [2, 4, 6, 7.5])
    (e.box(30, 0.06, 0.06, _, p, i + t, g), e.box(30, 0.06, 0.06, _, p, i + t, 8.8), e.box(30, 0.05, 1.1, J(`#a07a4a`, 0.85), p, i + t - 0.05, 8.25));
  (e.mesh(new ib(30, 7.6), new fS({ color: `#2f8f4a`, transparent: !0, opacity: 0.35, side: 2, depthWrite: !1 }), p, 3.94, 8.9, 0, { cast: !1 }),
    e.solid(p, 8.25, 30 / 2, 0.6));
  let v = p + 30 / 2 + 6,
    y = -f + 4;
  e.box(3, 1.2, 3, a, v, i, y);
  for (let [t, n] of [
    [-0.75, -0.75],
    [0.75, -0.75],
    [-0.75, 0.75],
    [0.75, 0.75],
  ])
    e.box(0.16, 30, 0.16, s, v + t, 1.3399999999999999, y + n);
  for (let t = 2; t < 30; t += 2.5) e.box(1.6, 0.1, 1.6, s, v, 1.3399999999999999 + t, y);
  (e.box(2, 2, 2, J(`#e9edf2`, 0.5), v + 1.6, 31.34, y),
    e.box(34, 0.9, 0.9, s, v - 34 / 2 + 1, 33.34, y),
    e.box(10, 0.9, 0.9, s, v + 5.5, 33.34, y),
    e.box(2.4, 1.6, 1.4, a, v + 9, 31.740000000000002, y),
    e.box(0.3, 4, 0.3, s, v, 33.34, y));
  let b = v - 22;
  (e.box(0.04, 14, 0.04, J(`#2a2d33`, 0.5), b, 19.340000000000003, y, { cast: !1 }),
    e.box(1.2, 0.8, 1, J(`#a07a4a`, 0.8), b, 18.540000000000003, y),
    e.solid(v, y, 1.5, 1.5),
    e.light(v - 8, 32.14, y, `#ffe9b0`, 6, 30));
  let x = n / 2 - 6,
    S = f - 5;
  for (let t = 0; t < 2; t++) {
    e.box(6.1, 2.6, 2.44, J(t ? `#1d4f9a` : `#e9edf2`, 0.5), x, i + t * 2.6, S);
    for (let n = 0; n < 2; n++) e.box(1.2, 0.8, 0.05, J(`#9fc7d9`, 0.08, 0.4), x - 1.5 + n * 3, 1.3399999999999999 + t * 2.6, S + 1.24, { cast: !1 });
  }
  (e.sign(`insaat_santiye`, `ŞANTİYE`, 0.5, x, 5.739999999999999, S + 1.25, 0, {
    color: `#14161b`,
    bg: zP,
    font: `900 100px Arial, sans-serif`,
    light: !1,
  }),
    e.solid(x, S, 3.1, 1.25));
  let C = x - 2,
    w = -f + 5;
  (e.box(2.4, 1, 8.2, J(`#2a2d33`, 0.6), C, 0.64, w), e.box(2.4, 2.2, 2, J(`#e9edf2`, 0.5), C, 1.1400000000000001, w + 3.4));
  let T = e.cyl(1.1, 0.7, 4.6, J(`#ff7a1a`, 0.5, 0.3), C, 1.8399999999999999, w - 1.2, 16);
  T.rotation.x = RP / 2 - 0.25;
  for (let t of [-3, -1.5, 2.8])
    for (let n of [-1, 1]) e.cyl(0.5, 0.5, 0.35, J(`#16171a`, 0.8), C + n * 1.15, 0.64, w + t, 12, { cast: !1 }).rotation.z = RP / 2;
  e.solid(C, w, 1.3, 4.2);
  let E = p - 4,
    D = f - 4;
  (e.box(2.6, 0.8, 4, J(`#2a2d33`, 0.7), E, i, D),
    e.box(2.4, 1.6, 2.6, s, E, 0.9400000000000001, D - 0.2),
    e.box(1.2, 1.3, 1.2, J(`#9fc7d9`, 0.1, 0.4), E - 0.5, 2.54, D + 0.4));
  let O = e.box(0.5, 0.5, 4.2, s, E + 0.6, 2.94, D + 2.6);
  ((O.rotation.x = -0.5), e.box(1, 0.8, 0.9, J(`#3a3d42`, 0.5, 0.6), E + 0.6, 0.44, D + 4.6), e.solid(E, D + 1, 1.4, 3.2));
  let k = (t, n, r, a, o) => e.mesh(new Jx(r, a, 18), J(o, 0.95), t, i + a / 2, n, 0, { cast: !1 });
  (k(-n / 2 + 4, f - 4, 2.4, 1.6, `#d9c08a`), k(-n / 2 + 8.5, f - 3.5, 2, 1.4, `#8f8a80`), e.solid(-n / 2 + 4, f - 4, 1.8, 1.8));
  for (let t = 0; t < 4; t++)
    (e.box(1.2, 0.14, 1, J(`#a07a4a`, 0.85), p + 30 / 2 + 2 + t * 1.5, i, f - 3),
      e.box(1.1, 0.8, 0.9, J(`#b5523c`, 0.9), p + 30 / 2 + 2 + t * 1.5, 0.28, f - 3));
  e.solid(p + 30 / 2 + 4.3, f - 3, 3.1, 0.55);
  for (let t = 0; t < 8; t++)
    e.cyl(0.04, 0.04, 9, o, p + 30 / 2 + 2.5, 0.24000000000000002 + (t % 3) * 0.09, -f + 11 + t * 0.12, 5, { cast: !1 }).rotation.x = RP / 2;
  (e.box(0.14, 4.4, 0.14, J(`#6b7178`, 0.4, 0.7), -n / 2 + 12, i, f - 0.9),
    e.box(0.14, 4.4, 0.14, J(`#6b7178`, 0.4, 0.7), -n / 2 + 20, i, f - 0.9),
    e.sign(`insaat_proje`, `NEON TOWER · 2027`, 1.4, -n / 2 + 16, 3.94, f - 0.8, 0, {
      color: `#ffffff`,
      bg: `#14161b`,
      font: `900 100px Arial, sans-serif`,
      light: !1,
    }),
    e.light(p, 9.14, m, `#ffe9b0`, 5, 24));
}
export function buildSanayiStreet(e) {
  let t = RO.z,
    n = RO.x0,
    r = RO.x1,
    i = r - n,
    a = J(zP, 0.6);
  for (let o of [-3.55, 3.55]) {
    let s = e.box(i, 0.02, 0.2, a, (n + r) / 2, 0.012, t + o, { cast: !1 });
    s.renderOrder = 1;
  }
  for (let i = n + 2; i < r - 2; i += 4) {
    let n = e.box(2, 0.02, 0.18, a, i + 1, 0.013, t, { cast: !1 });
    n.renderOrder = 1;
  }
  let o = J(`#14161b`, 0.4, 0.6);
  for (let i of [n + 2, r - 2]) {
    for (let n of [-1, 1]) (e.box(0.45, 6.4, 0.45, J(zP, 0.5, 0.3), i, 0.12, t + n * 5.3), e.solid(i, t + n * 5.3, 0.25, 0.25));
    e.box(0.6, 1.1, 11.2, o, i, 5.6, t);
    for (let n of [-1, 1])
      e.sign(`sanayi_kemer_${i}_${n}`, `SANAYİ SİTESİ`, 0.8, i + n * 0.32, 6.15, t, n > 0 ? RP / 2 : -RP / 2, {
        color: `#14161b`,
        bg: zP,
        font: `900 110px Arial, sans-serif`,
        light: !1,
      });
  }
  let s = (t, n, r, i) => {
      let a = GE(t, null);
      (a.root.position.set(n, 0.12, r),
        (a.root.rotation.y = i),
        a.trailer && ((a.trailer.pivot.visible = !0), (a.trailerOn = !0)),
        a.root.traverse((e) => e.isMesh && (e.castShadow = !0)),
        e.add(a.root));
      let o = (a.len || 4.5) + (a.trailer ? a.trailer.length : 0),
        s = a.trailer ? a.trailer.length / 2 : 0;
      e.solid(n - Math.sin(i) * s, r - Math.cos(i) * s, (a.halfW || 1) + 0.1, o / 2, i);
    },
    c = J(`#6b7178`, 0.4, 0.7);
  RO.gaps.forEach((n, r) => {
    (jMe(e, n, t - 19, 5.2, 26, null), s(11, n, t - 17 + r * 0.5, 0));
    for (let e = 0; e < 3; e++) (r === 0 && e === 0) || s([3, 2, 5][(e + r) % 3], n, t + 9 + e * 8.5, RP);
    for (let r = 0; r <= 3; r++) {
      let i = e.box(5.4, 0.02, 0.14, J(`#f4f4f4`, 0.6), n, 0.135, t + 5 + r * 8.5, { cast: !1 });
      i.renderOrder = 1;
    }
    for (let r of [t - 36.2, t + 36.2]) {
      e.box(7.6, 1.6, 0.1, c, n, 0.12, r);
      for (let i = 0; i < 5; i++)
        e.box(1.4, 0.3, 0.12, J(i % 2 ? `#14161b` : zP, 0.5), n - 3 + i * 1.5, 0.9, r + (r > t ? 0.07 : -0.07), { cast: !1 });
      (e.solid(n, r, 3.8, 0.1),
        e.sign(`sanayi_kapali_${n}_${r}`, `GİRİŞ YOK`, 0.4, n, 1.95, r + (r > t ? 0.08 : -0.08), r > t ? 0 : RP, {
          color: `#ffffff`,
          bg: `#c8141e`,
          font: `900 100px Arial, sans-serif`,
          light: !1,
        }));
    }
  });
  for (let i = n + 14; i < r - 6; i += 26)
    for (let n of [-1, 1])
      (e.box(0.16, 6.5, 0.16, J(`#6b7178`, 0.4, 0.7), i, 0.12, t + n * 4.3),
        e.box(0.9, 0.2, 0.5, RN(`#ffd9a0`, 2), i, 6.5, t + n * 3.9, { cast: !1 }),
        e.light(i, 6.2, t + n * 3.6, `#ffd9a0`, 6, 14),
        e.solid(i, t + n * 4.3, 0.12, 0.12));
}
