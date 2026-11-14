// =============================================================================
// cityHeist.js — v154 SOYGUN DİZİSİ (sinematik). Kaynak: "Neon Şehir · Soygun Dizisi (prototip)".
// Şehir motoruna takılır (cityEngine.js → api.heist). start({ target, crew, outcome, reward,
// carId, carMods, onDone }) — crew[0] = soygunu başlatan (lider). outcome: 'ok' | 'caught' | 'busted'.
//   • 1 kişi: lider tek; 2: lider + şoför; 3: + tetikçi; 4: + gözcü (zb).
//   • 'busted' (ekipte gizli polis): polis pusuda bekler, ekipten KİMSE polis diye gösterilmez.
//   • Mekânın içi lotun altında (y = -60) kurulur; şehirde hiçbir şey değişmez.
// Prototipten birebir alındı (davranış aynı); dışa bağlı isimler aşağıda oyunun gerçek
// karşılıklarına bağlandı. Kısa (küçültülmüş) yerel isimler prototipten geliyor.
// =============================================================================
/* eslint-disable */
import * as THREE from 'three';
import { Kit } from './kit.js';
import { VENUES } from '../../../functions/venueLayouts.js';
import { buildVehicle, seatedPerson } from './vehicles.js';
import { botAvatar } from './jobWorld.js';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes.js';
import './cityHeist.css';

const X = THREE.Vector3;
const We = THREE.MeshStandardMaterial;
const Go = VENUES;
const Eo = THREE.PointLight;
const Nt = THREE.PlaneGeometry;
const Yt = THREE.MeshBasicMaterial;
const ne = THREE.Mesh;
const Mn = THREE.CanvasTexture;
const en = THREE.SRGBColorSpace;
const _c = buildFullAvatarSvgMarkup;
const J0 = DEFAULT_AVATAR;
const ns = Kit;
const mc = THREE.AmbientLight;
const Nn = THREE.SphereGeometry;
const kt = THREE.CylinderGeometry;
const sn = THREE.DoubleSide;
const yt = THREE.Group;
const Bi = THREE.CircleGeometry;
const Ml = buildVehicle;
const Wo = seatedPerson;
const Za = THREE.Sprite;
const Ba = THREE.SpriteMaterial;
const ra = THREE.AdditiveBlending;
const Ks = THREE.NormalBlending;
const Ci = botAvatar;

var xn = X,
  Vh = (t, e, n) => Math.max(e, Math.min(n, t)),
  n0 = (t, e, n) => t + (e - t) * n,
  w1 = (t) => t * t * (3 - 2 * t),
  Ss = (t) => Math.round(Number(t) || 0).toLocaleString("tr-TR"),
  Ts = Symbol("cancel"),
  Pb = -60,
  Cb = Pb + 0.14,
  u9 = (580 * 1.75) / 507,
  p9 = (18 * 1.75) / 507,
  $h = 3,
  wn = 6.2,
  m9 = {
    gender: "erkek",
    build: "iri",
    skin: "#c68863",
    hairStyle: "short",
    hairColor: "#0d0a08",
    clothing: "police",
    clothColor: "#1a2a4a",
    hat: "policecap",
    hatColor: "#12213d",
    pantsColor: "#12213d",
  },
  Yh = { lead: "L\u0130DER", gun: "TET\u0130K\xC7\u0130", driver: "\u015EOF\xD6R", look: "G\xD6ZC\xDC" },
  zb = (t) => (t <= 1 ? ["lead"] : t === 2 ? ["lead", "driver"] : t === 3 ? ["lead", "gun", "driver"] : ["lead", "gun", "driver", "look"]),
  Vc = {
    banka: {
      key: "banka",
      lot: "banka",
      venue: "banka",
      name: "Banka",
      icon: "\u{1F3E6}",
      title: "PARARA BANK VURGUNU",
      sizes: [3, 4],
      reward: 5e5,
    },
    casino: {
      key: "casino",
      lot: "casino",
      venue: "gazino",
      name: "Casino",
      icon: "\u{1F3B0}",
      title: "NEON GAZ\u0130NO VURGUNU",
      sizes: [2, 3, 4],
      reward: 25e4,
    },
    silah: {
      key: "silah",
      lot: "silah",
      venue: "silah_magazasi",
      name: "Silah\xE7\u0131",
      icon: "\u{1F52B}",
      title: "S\u0130LAH\xC7I VURGUNU",
      sizes: [1, 2, 3, 4],
      reward: 6e4,
    },
    fabrika: {
      key: "fabrika",
      lot: "fabrika",
      name: "Fabrika",
      icon: "\u{1F3ED}",
      title: "FABR\u0130KA VURGUNU",
      sizes: [1, 2, 3, 4],
      reward: 1e4,
    },
    netkafe: {
      key: "netkafe",
      lot: "netkafe",
      name: "\u0130nternet Kafe",
      icon: "\u{1F5A5}\uFE0F",
      title: "NET CAFE VURGUNU",
      sizes: [1, 2, 3, 4],
      reward: 2e4,
    },
    galeri: {
      key: "galeri",
      lot: "galeri",
      venue: "araba_galerisi",
      name: "Galeri",
      icon: "\u{1F697}",
      title: "GALER\u0130 VURGUNU",
      sizes: [2, 3, 4],
      reward: 125e3,
      walkCamU: [-2.5, -2.3],
    },
  },
  ci = (t, e, n, i, a = 0, o = 0) => ({ i: t, k: e, x: n, z: i, r: a, c: o }),
  b9 = {
    fabrika: {
      floor: "beton",
      wall: "tugla",
      items: [
        ci("fb_wb1", "workbench", -8.3, -1, 2),
        ci("fb_tw", "toolwall", -9, 1.4, 2),
        ci("fb_tc", "toolchest", -8.4, 3.2, 2),
        ci("fb_pl1", "pallets", -6, 5.6),
        ci("fb_cr1", "crates", -7.8, 5.7),
        ci("fb_br1", "barrel", -8.5, 6.4),
        ci("fb_fl", "forklift", -3, 4.6, 2),
        ci("fb_pl2", "pallets", -0.6, 5.8),
        ci("fb_od", "officedesk", 7.3, -5.6, 4),
        ci("fb_sf", "safe", 8.4, -6.6),
        ci("fb_fc", "filecab", 5.6, -6.7),
        ci("fb_dr", "doordeco", 5, 7, 4),
      ],
    },
    netkafe: {
      floor: "neon_grid",
      wall: "boya_mor",
      items: [
        ci("nk_pc1", "pcstation", -6.5, -5.8, 0, 0),
        ci("nk_pc2", "pcstation", -2.5, -5.8, 0, 1),
        ci("nk_pc3", "pcstation", 1.5, -5.8, 0, 2),
        ci("nk_pc4", "pcstation", -6.5, -1.1, 0, 3),
        ci("nk_pc5", "pcstation", -2.5, -1.1, 0, 4),
        ci("nk_pc6", "pcstation", 1.5, -1.1, 0, 0),
        ci("nk_cc", "cafecounter", 6.7, -4.2, 6),
        ci("nk_df", "drinkfridge", 8.5, -6.4, 6),
        ci("nk_kc", "kcoffee", 8.4, -2.4, 6),
        ci("nk_ar1", "arcade", -8.3, 2.4, 2),
        ci("nk_ar2", "arcade", -8.3, 3.8, 2),
        ci("nk_sf", "sofa2", -2.6, 6.2, 4),
        ci("nk_tv", "tvwall", -2.6, 7, 4),
        ci("nk_n1", "neon3", 0, -7),
        ci("nk_n2", "neon2", 9, 1.2, 6),
        ci("nk_dr", "doordeco", 5, 7, 4),
      ],
    },
  },
  y9 = {
    gender: "erkek",
    build: "zayif",
    skin: "#caa07a",
    hairStyle: "short",
    hairColor: "#171310",
    facialHair: "goatee",
    clothing: "tuxedo",
    clothColor: "#14151a",
    neckAcc: "bow",
    pantsColor: "#101114",
  },
  x9 = 1.25;
function Wc(t, e, n) {
  let i = document.createElement("canvas");
  ((i.width = t), (i.height = e), n(i.getContext("2d"), t, e));
  let a = new Mn(i);
  return ((a.colorSpace = en), a);
}
function S1(t) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(_c({ ...J0, ...(t || {}) }, { pose: "idle" }));
}
function g9() {
  let t = null,
    e = !1,
    n = [],
    i = () => t.destination,
    a = (r, l, c, f = "sine", h = 0.08, d = 0) => {
      if (!t || e) return;
      let m = t.currentTime + d,
        u = t.createOscillator(),
        b = t.createGain();
      ((u.type = f),
        u.frequency.setValueAtTime(r, m),
        l !== r && u.frequency.exponentialRampToValueAtTime(l, m + c),
        b.gain.setValueAtTime(1e-4, m),
        b.gain.exponentialRampToValueAtTime(h, m + 0.015),
        b.gain.exponentialRampToValueAtTime(1e-4, m + c),
        u.connect(b).connect(i()),
        u.start(m),
        u.stop(m + c + 0.05));
    },
    o = (r, l, c = 0.1, f = 1.2) => {
      if (!t || e) return;
      let h = Math.floor(t.sampleRate * r),
        d = t.createBuffer(1, h, t.sampleRate),
        m = d.getChannelData(0);
      for (let y = 0; y < h; y++) m[y] = (Math.random() * 2 - 1) * (1 - y / h);
      let u = t.createBufferSource();
      u.buffer = d;
      let b = t.createBiquadFilter();
      ((b.type = "bandpass"), (b.frequency.value = l), (b.Q.value = f));
      let p = t.createGain();
      ((p.gain.value = c), u.connect(b).connect(p).connect(i()), u.start());
    };
  return {
    unlock() {
      try {
        (t || (t = new (window.AudioContext || window.webkitAudioContext)()), t.resume?.());
      } catch {
        t = null;
      }
    },
    setMuted(r) {
      ((e = r), n.forEach((l) => (l.mg.gain.value = r ? 0 : 1)));
    },
    get muted() {
      return e;
    },
    stopAll() {
      (n.slice().forEach((r) => r.stop()), (n = []));
    },
    loop: (r) => {
      if (!t) return () => {};
      let l = t.createOscillator(),
        c = t.createGain(),
        f = t.createOscillator(),
        h = t.createGain();
      (r === "siren"
        ? ((l.type = "sawtooth"), (l.frequency.value = 760), (f.frequency.value = 0.9), (h.gain.value = 190), (c.gain.value = 0.035))
        : ((l.type = "square"),
          (l.frequency.value = 840),
          (f.type = "square"),
          (f.frequency.value = 2.4),
          (h.gain.value = 130),
          (c.gain.value = 0.028)),
        f.connect(h).connect(l.frequency));
      let d = t.createGain();
      ((d.gain.value = e ? 0 : 1), l.connect(c).connect(d).connect(i()), l.start(), f.start());
      let m = {
        mg: d,
        stop: () => {
          try {
            (l.stop(), f.stop());
          } catch {}
        },
      };
      return (
        n.push(m),
        () => {
          (m.stop(), (n = n.filter((u) => u !== m)));
        }
      );
    },
    thud: () => {
      (a(120, 45, 0.25, "sine", 0.22), o(0.18, 300, 0.12));
    },
    clank: () => {
      (o(0.09, 2600, 0.1, 3), a(1900, 1500, 0.06, "square", 0.03));
    },
    cash: (r = 0) => a(1250 + r * 90, 1900 + r * 90, 0.09, "triangle", 0.06),
    screech: () => o(0.7, 1700, 0.09, 6),
    vroom: () => {
      (a(70, 190, 1.6, "sawtooth", 0.07), o(0.5, 900, 0.05, 2));
    },
    sting: () => {
      (a(98, 98, 1.4, "sawtooth", 0.05), a(147, 147, 1.4, "sawtooth", 0.04), a(196, 196, 1.4, "triangle", 0.05));
    },
    win: () => [523, 659, 784, 1047].forEach((r, l) => a(r, r, 0.22, "triangle", 0.08, l * 0.11)),
    lose: () => [392, 330, 262, 196].forEach((r, l) => a(r, r, 0.28, "sawtooth", 0.05, l * 0.16)),
    tick: () => a(1500, 1500, 0.03, "square", 0.02),
  };
}
function k6(t) {
  let {
      scene: e,
      container: n,
      layer: i,
      camera: a,
      Fig: o,
      me: s,
      self: r,
      zones: l,
      city: c,
      groundY: f,
      placeLabel: h,
      headMat: d,
      snapCam: m,
      warm: W0,
    } = t,
    u = null,
    b = null,
    p = null,
    y = {},
    v = {},
    g = g9(),
    E = new xn();
  function L(A) {
    if (y[A.key]) return y[A.key];
    let T = l.find((ae) => ae.kind === "door" && ae.type === A.lot),
      ye = c.lots.find((ae) => ae.type === A.lot);
    if (!T || !ye) return null;
    let G = { x: Math.sin(T.out), z: Math.cos(T.out) },
      Be = { x: Math.cos(T.out), z: -Math.sin(T.out) },
      R = (T.x - ye.mx) * G.x + (T.z - ye.mz) * G.z,
      ee = 40 / 2 - R,
      $ = (ae, Ue, Ge = null) => {
        let qe = T.x + Be.x * ae + G.x * Ue,
          ct = T.z + Be.z * ae + G.z * Ue;
        return new xn(qe, Ge ?? f(qe, ct), ct);
      },
      le = ee - 5.4;
    return (
      (y[A.key] = {
        door: T,
        lot: ye,
        o: G,
        r: Be,
        W: $,
        vLane: ee - 2.1,
        vFar: ee + 2.1,
        vWalk: le,
        sv: (ae) => le * ae,
        carYaw: Math.atan2(-Be.x, -Be.z),
        I: (ae, Ue, Ge) => new xn(ye.mx + ae, Pb + Ue, ye.mz + Ge),
      }),
      y[A.key]
    );
  }
  let C = {
    banka: {
      ceil: "#d9d4c8",
      amb: ["#ffffff", 0.55],
      lamps: [
        [0, 3, -1.5, "#fff0d8", 46, 26],
        [5, 2.9, 3.6, "#e8f4ff", 26, 18],
        [-5.5, 2.9, 2.5, "#fff0d8", 22, 18],
      ],
    },
    silah: {
      ceil: "#2a2624",
      amb: ["#fff2e0", 0.5],
      lamps: [
        [-1, 2.9, -4, "#ffe2b8", 32, 14],
        [-6, 2.9, -4.5, "#ffe2b8", 20, 10],
        [7, 2.8, -4.4, "#ffffff", 18, 9],
        [3, 2.9, 3.2, "#3ad6ff", 22, 14],
        [-4, 2.9, 2.5, "#fff2e0", 22, 14],
      ],
    },
    fabrika: {
      ceil: "#3a3f48",
      amb: ["#ffe6c8", 0.5],
      lamps: [
        [-3, 3, -3, "#ffd9a8", 36, 16],
        [3, 3, -2, "#ffd9a8", 24, 14],
        [7.3, 2.8, -5, "#fff4e0", 18, 8],
        [-4, 3, 3.6, "#ffd9a8", 24, 14],
        [3.5, 3, 4, "#ffd9a8", 20, 14],
      ],
    },
    netkafe: {
      ceil: "#140d22",
      amb: ["#e2d4ff", 0.42],
      lamps: [
        [-2.5, 2.9, -5, "#8f7bff", 26, 12],
        [-2.5, 2.9, -0.4, "#c58bff", 26, 12],
        [6.7, 2.8, -4.2, "#ffd2a0", 20, 9],
        [-6, 2.9, 3.2, "#ff3fd1", 22, 12],
        [3.6, 2.9, 3.6, "#3ad6ff", 22, 14],
        [-2.6, 2.6, 5.4, "#7fb8ff", 12, 8],
      ],
    },
    galeri: {
      ceil: "#e6e7ec",
      amb: ["#ffffff", 0.6],
      lamps: [
        [-4.6, 3, -3, "#ffffff", 34, 14],
        [3, 3, -3, "#ffffff", 30, 14],
        [6.8, 2.9, -0.8, "#fff0d8", 20, 10],
        [-5, 2.9, 3.4, "#e8f4ff", 22, 14],
        [3.5, 2.9, 4, "#e8f4ff", 20, 14],
      ],
    },
    casino: {
      ceil: "#1c0a14",
      amb: ["#ffd9ec", 0.42],
      lamps: [
        [-2.2, 2.9, -2.8, "#ffcf8a", 30, 12],
        [3.2, 2.9, -1.6, "#ffcf8a", 24, 10],
        [5.2, 2.9, 3.4, "#ff5cb0", 26, 14],
        [-6.2, 2.9, 1, "#b46bff", 26, 14],
        [6.3, 2.8, -4.2, "#fff0d8", 20, 9],
        [0, 2.9, 3.5, "#ffd6f0", 14, 14],
      ],
    },
  };
  function D(A, T) {
    if (v[A.key]) return v[A.key];
    let ye = Go[A.venue] || b9[A.key],
      G = C[A.key],
      Be = new ns(`soygun-${A.key}`),
      R = Be.group;
    (Be.floor(ye.floor, 18, 14, 0, 0),
      Be.wallBox(ye.wall, 18.4, 3.4, 0.2, 0, 0, -7.1),
      Be.wallBox(ye.wall, 18.4, 3.4, 0.2, 0, 0, 7.1),
      Be.wallBox(ye.wall, 0.2, 3.4, 14, -9.1, 0, 0),
      Be.wallBox(ye.wall, 0.2, 3.4, 14, 9.1, 0, 0),
      Be.box(18.4, 0.2, 14.4, new We({ color: G.ceil, roughness: 0.9 }), 0, 3.4, 0));
    let ee = {};
    (ye.items.forEach((ae) => {
      var Ge;
      let Ue = null;
      try {
        let qe = A.key === "galeri" && ae.i === "gl_c1" ? 2 : ae.c || 0;
        Ue = Be.item(ae.k, ae.x, ae.z, ae.r || 0, qe, { solid: !1, dyn: !0 });
      } catch {
        Ue = null;
      }
      Ue && (ee[(Ge = ae.k)] || (ee[Ge] = [])).push(Ue);
    }),
      R.traverse((ae) => {
        ae.isMesh && ((ae.castShadow = !1), (ae.receiveShadow = !1));
      }),
      G.lamps.forEach(([ae, Ue, Ge, qe, ct, Et]) => {
        let _t = new Eo(qe, ct, Et, 1.6);
        (_t.position.set(ae, Ue, Ge), R.add(_t));
      }),
      R.add(new mc(G.amb[0], G.amb[1])));
    let $ = new Eo("#ff2030", 0, 30, 1.2);
    ($.position.set(0, 3, 1), R.add($));
    let le = { g: R, k: Be, items: ee, alarmL: $ };
    return (
      A.key === "banka" && _(le),
      A.key === "fabrika" && N(le),
      R.position.set(T.lot.mx, Pb, T.lot.mz),
      (R.visible = !1),
      e.add(R),
      (v[A.key] = le),
      le
    );
  }
  function N(A) {
    let T = A.k,
      ye = new We({ color: "#59606b", roughness: 0.5, metalness: 0.6 }),
      G = new We({ color: "#1b1d21", roughness: 0.9 }),
      Be = new We({ color: "#e8b923", roughness: 0.6 });
    (T.box(10.6, 0.8, 1.2, ye, -2.25, 0, -3.5), T.box(10.6, 0.06, 1, G, -2.25, 0.8, -3.5));
    for (let Ue = -7.2; Ue <= 2.8; Ue += 2) T.box(0.12, 0.8, 1.3, Be, Ue, 0, -3.5);
    let R = new We({ color: "#b98a52", roughness: 0.8 }),
      ee = [];
    for (let Ue = 0; Ue < 7; Ue++) ee.push(T.box(0.55, 0.45, 0.55, R, -7.4 + Ue * 1.5, 0.86, -3.5));
    let $ = [];
    for (let Ue of [-5.2, -1.2]) {
      (T.box(1.6, 2.6, 1.3, new We({ color: "#2f6b8f", roughness: 0.5, metalness: 0.4 }), Ue, 0, -5.2),
        T.box(1, 0.5, 0.9, ye, Ue, 2.6, -5.2));
      let Ge = new We({ color: "#2bd46a", emissive: "#2bd46a", emissiveIntensity: 2 });
      ($.push(Ge), T.mesh(new Nn(0.14, 12, 8), Ge, Ue + 0.55, 2.75, -4.5, 0, { cast: !1 }));
    }
    (T.box(0.18, 1.1, 0.18, Be, 3.7, 0, -3.5), T.box(0.36, 0.3, 0.3, G, 3.7, 1.1, -3.5));
    let le = new We({ color: "#e31b23", emissive: "#e31b23", emissiveIntensity: 0.8 });
    T.mesh(new kt(0.13, 0.13, 0.12, 16), le, 3.7, 1.32, -3.4, 0, { cast: !1, rx: Math.PI / 2 });
    let ae = new We({ color: "#9cc7d9", roughness: 0.05, metalness: 0.2, transparent: !0, opacity: 0.25, depthWrite: !1, side: sn });
    (T.mesh(new Nt(2.8, 2.6), ae, 7.6, 1.3, -3.2, 0, { cast: !1 }),
      T.box(0.1, 2.6, 0.1, ye, 6.2, 0, -3.2),
      T.box(2.9, 0.1, 0.1, ye, 7.6, 2.6, -3.2),
      T.mesh(new Nt(3.8, 2.6), ae, 5.2, 1.3, -5.1, Math.PI / 2, { cast: !1 }),
      T.box(0.1, 2.6, 0.1, ye, 5.2, 0, -3.2),
      T.box(1.4, 0.04, 0.5, new Yt({ color: "#ffffff" }), 7.6, 2, -3.18, { cast: !1 }),
      (A.belt = { on: !0, crates: ee, lampMats: $, btn: le }));
  }
  function O(A) {
    let T = p?.belt;
    T &&
      (T.on && T.crates.forEach((ye) => (ye.position.x = ye.position.x + A * 0.9 > 2.6 ? -7.4 : ye.position.x + A * 0.9)),
      T.lampMats.forEach((ye) => {
        let G = T.on ? "#2bd46a" : Math.sin((u?.t || 0) * 8) > 0 ? "#ff2a2a" : "#4a0a0a";
        (ye.color.set(G), ye.emissive.set(G));
      }),
      (T.btn.emissiveIntensity = T.on ? 0.8 : 2.5));
  }
  function _(A) {
    let T = A.items.vaultdoor?.[0];
    if (!T) return;
    let ye = T.children.slice(1),
      G = new yt();
    (G.position.set(-0.95, 0, 0.3),
      T.add(G),
      ye.forEach(($) => {
        (G.add($), ($.position.x += 0.95), ($.position.z -= 0.3));
      }));
    let Be = Wc(256, 256, ($, le) => {
        (($.fillStyle = "#120c02"),
          $.beginPath(),
          $.arc(le / 2, le / 2, le / 2, 0, Math.PI * 2),
          $.fill(),
          $.save(),
          $.beginPath(),
          $.arc(le / 2, le / 2, le / 2 - 6, 0, Math.PI * 2),
          $.clip());
        for (let ae = 0; ae < 7; ae++)
          for (let Ue = -1; Ue < 6; Ue++) {
            let Ge = Ue * 46 + (ae % 2) * 23 + 4,
              qe = 232 - ae * 26,
              ct = $.createLinearGradient(Ge, qe, Ge, qe + 22);
            (ct.addColorStop(0, "#ffe98a"),
              ct.addColorStop(0.5, "#f5b82e"),
              ct.addColorStop(1, "#a8690a"),
              ($.fillStyle = ct),
              $.fillRect(Ge, qe, 42, 22),
              ($.strokeStyle = "#7a4d00"),
              ($.lineWidth = 2),
              $.strokeRect(Ge, qe, 42, 22));
          }
        $.restore();
      }),
      R = new ne(new Bi(0.9, 40), new Yt({ map: Be, toneMapped: !1 }));
    (R.position.set(0, 1.2, 0.262), T.add(R));
    let ee = new Eo("#ffc23a", 0, 6, 1.6);
    (ee.position.set(0, 1.3, 0.55),
      T.add(ee),
      Object.assign(A, { vault: T, vaultPivot: G, goldL: ee, spokes: ye.filter(($) => $.geometry?.type === "BoxGeometry") }));
  }
  // v156: iç mekânı (ve içerideki kişileri) başlık kartı sırasında GPU'ya hazırla → kapıdan girerken
  // ilk çizimde shader derleme / doku yükleme donması olmaz (eskiden 2-3 sn kararıyordu)
  function Ww() {
    if (!W0 || !p) return;
    let A = p.g.visible,
      T = u.npcs.map((G) => G.group.visible);
    try {
      ((p.g.visible = !0), u.npcs.forEach((G) => (G.group.visible = !0)), W0(b.I(5, 1.6, 6.3), b.I(0, 1.1, -1)));
    } catch {
      /* yoksay */
    } finally {
      ((p.g.visible = A), u.npcs.forEach((G, Be) => (G.group.visible = T[Be])));
    }
  }
  function k(A, T = "", ye = null) {
    let G = document.createElement("div");
    return ((G.className = A), T && (G.innerHTML = T), (ye || u.root).appendChild(G), G);
  }
  function K() {
    let A = document.createElement("div");
    ((A.className = "hx-root"),
      n.appendChild(A),
      n.classList.add("hx-active"),
      (u.root = A),
      (u.fx = k("hx-fx")),
      (u.flash = k("hx-flash")),
      (u.barT = k("hx-bar top")),
      (u.barB = k("hx-bar bot")),
      (u.fade = k("hx-fade on intro")),
      (u.title = k("hx-title")),
      (u.cast = k("hx-cast")),
      (u.cap = k("hx-cap")),
      (u.hud = k("hx-hud", '<span class="hx-clock">\u23F1 <b>01:00</b></span><span class="hx-loot">\u{1F4B0} <b>0</b></span>')),
      (u.clockEl = u.hud.querySelector(".hx-clock b")),
      (u.lootEl = u.hud.querySelector(".hx-loot b")),
      (u.prog = k("hx-prog", "<span></span><i><u></u></i>")));
    // v160.7: video sunucu cevabından sonra başlar (dokunuş anı değil) → telefonda ses kilitli kalıyordu;
    // videodaki ilk dokunuşta ses açılır
    let un = () => {
      g.unlock();
      ["pointerup", "touchend", "click"].forEach(($) => document.removeEventListener($, un, !0));
    };
    ["pointerup", "touchend", "click"].forEach(($) => document.addEventListener($, un, !0));
    let T = k("hx-tools"),
      ye = document.createElement("button");
    // v160.7: ses / Geç düğmeleri telefonda çalışmıyordu (yalnız onclick vardı; bazı telefonlarda /
    // WebView'da click gelmiyor) → sonuç kartındaki gibi pointerup + click, çift tetiklenmez
    (ye.type = "button"), (ye.textContent = g.muted ? "\u{1F507}" : "\u{1F50A}"), (ye.setAttribute("aria-label", "Ses")),
      hxTap(ye, () => {
        (g.unlock(), g.setMuted(!g.muted), (ye.textContent = g.muted ? "\u{1F507}" : "\u{1F50A}"));
      });
    let G = document.createElement("button");
    ((G.type = "button"),
      (G.textContent = "Ge\xE7 \u23ED"),
      hxTap(G, () => ri(!0)),
      ["pointerdown", "touchstart", "mousedown"].forEach(($) => T.addEventListener($, (le) => le.stopPropagation(), { passive: !0 })),
      T.append(ye, G),
      (u.tools = T),
      requestAnimationFrame(() => A.classList.add("on")));
  }
  let Z = (A) => {
    ((u.cap.textContent = A || ""), u.cap.classList.toggle("on", !!A));
  };
  function ie(A, T) {
    ((u.cast.innerHTML = `<img src="${S1(A.avatar)}" alt=""><div><small>${T}</small><b></b></div>`),
      (u.cast.querySelector("b").textContent = A.name),
      u.cast.classList.remove("on"),
      u.cast.offsetWidth,
      u.cast.classList.add("on"));
  }
  function I(A, T) {
    (u.prog.classList.toggle("on", T != null),
      T != null &&
        ((u.prog.querySelector("span").textContent = A), (u.prog.querySelector("u").style.width = `${Math.round(Vh(T, 0, 1) * 100)}%`)));
  }
  let oe = async (A, T = 0.28) => {
    ((u.fade.style.transitionDuration = `${T}s`), u.fade.classList.toggle("on", A), await te(T));
  };
  function te(A) {
    return new Promise((T, ye) => {
      if (!u || u.cancelled) return ye(Ts);
      u.timers.push({ t: A, res: T, rej: ye });
    });
  }
  function ve(A, T, ye = (G) => G) {
    return new Promise((G, Be) => {
      if (!u || u.cancelled) return Be(Ts);
      u.tweens.push({ t: 0, dur: A, fn: T, ease: ye, res: G, rej: Be });
    });
  }
  function he(A, T, ye, G = !1) {
    let Be = A === "self" ? s : new o(e, i, { id: `hx_${A}`, name: T, avatar: ye, npc: G });
    return ((Be.hx = { q: [], spd: $h, res: null, face: null, inside: !1 }), (Be.group.visible = !1), Be !== s && u.figs.push(Be), Be);
  }
  function me(A, T, ye = A.hx.inside) {
    ((A.hx.inside = ye),
      (A.hx.q.length = 0),
      (A.x = T.x),
      (A.z = T.z),
      (A.y = ye ? Cb : f(T.x, T.z)),
      (A.group.visible = !0),
      (A.moving = !1));
  }
  let ke = (A) => {
    ((A.group.visible = !1), (A.label.style.display = "none"));
  };
  function be(A, T, ye = $h) {
    return (
      A.setForcePose(null),
      (A.hx.q = (Array.isArray(T) ? T : [T]).map((G) => ({ x: G.x, z: G.z }))),
      (A.hx.spd = ye),
      (A.hx.face = null),
      new Promise((G, Be) => {
        if (!u || u.cancelled) return Be(Ts);
        ((A.hx.res = G), (A.hx.rej = Be));
      })
    );
  }
  let Ie = (A, T) => (A.hx.face = T ? { x: T.x, z: T.z } : null),
    ue = (A, T, ye = !1) => {
      (A.setForcePose(T), (A.shakeUntil = ye ? performance.now() + 6e5 : 0));
    };
  function He(A, T, ye) {
    let G = A.hx,
      Be = 0,
      R = 0;
    if (G.q.length) {
      let le = G.q[0];
      ((Be = le.x - A.x), (R = le.z - A.z));
      let ae = Math.hypot(Be, R),
        Ue = G.spd * T;
      (ae <= Ue
        ? ((A.x = le.x), (A.z = le.z), G.q.shift(), G.q.length || (G.res?.(), (G.res = null)))
        : ((A.x += (Be / ae) * Ue), (A.z += (R / ae) * Ue)),
        (A.moving = G.q.length > 0),
        (A.run = G.spd > 4));
    } else ((A.moving = !1), G.face && ((Be = G.face.x - A.x), (R = G.face.z - A.z)));
    let ee = Be * E.x + R * E.z;
    Math.abs(ee) > 0.02 && (A.facingLeft = ee < 0);
    let $ = G.inside ? Cb : f(A.x, A.z);
    ((A.y += ($ - A.y) * Math.min(1, T * 12)), A !== s && A.group.visible && A.update(T, a, ye));
  }
  function it(A, T = null) {
    let ye = Ml(A, T),
      G = new ne(new Nt(3.4, 7.5), d("#ffe9b8", 0.5));
    ((G.rotation.x = -Math.PI / 2), G.position.set(0, 0.04, ye.len / 2 + 3.9), ye.root.add(G), (ye.root.visible = !1), e.add(ye.root));
    let Be = { v: ye, x: 0, z: 0, yaw: 0, flash: !1, pax: [], brake: !1 };
    return (u.cars.push(Be), Be);
  }
  function de(A, T, ye) {
    ((A.x = T.x), (A.z = T.z), (A.yaw = ye), (A.v.root.visible = !0));
  }
  function ze(A, T) {
    (A.pax.forEach((Be) => Be.parent?.remove(Be)), (A.pax = []));
    let ye = A.v,
      G = ye.seatPts?.length ? ye.seatPts : [[ye.seat?.[0] ?? 0.36, ye.seat?.[1] ?? 0.5, -(ye.spec?.Wd ?? 1.6) * 0.22]];
    for (let Be = 0; Be < Math.min(T, G.length); Be++) {
      let R = G[Be],
        ee = Wo(11 + Be * 7, {});
      (ee.position.set(R[0] - 0.05, R[1], R[2]), ee.scale.setScalar(0.92), ye.body.add(ee), A.pax.push(ee));
    }
  }
  function F(A, T, ye, G, Be = null) {
    let R = { x: A.x, z: A.z },
      ee = A.yaw;
    return ve(
      ye,
      ($) => {
        let le = n0(R.x, T.x, $),
          ae = n0(R.z, T.z, $);
        ((A.moved = Math.hypot(le - A.x, ae - A.z)),
          (A.x = le),
          (A.z = ae),
          Be != null && (A.yaw = n0(ee, Be, w1(Vh(($ - 0.55) / 0.45, 0, 1)))));
      },
      G,
    );
  }
  function ce(A, T, ye) {
    let G = A.v;
    (G.root.position.set(A.x, f(A.x, A.z), A.z), (G.root.rotation.y = A.yaw));
    let Be = A.moved || 0;
    ((A.moved = 0),
      G.wheels?.forEach((R) => (R.spin.rotation.z -= Be / R.r)),
      G.tlMat && (G.tlMat.emissiveIntensity = A.brake ? 5 : 1.4),
      G.flashers?.length &&
        G.flashers.forEach(
          (R) => (R.mat.emissiveIntensity = A.flash ? R.base * (Math.sin(ye * (R.fast ? 13 : 5) + R.phase) > 0 ? 1 : 0.08) : 0.12),
        ));
  }
  function we(A) {
    (e.remove(A.v.root),
      A.v.root.traverse((T) => {
        T.isMesh && (T.geometry.dispose(), T.material?.userData?.shared !== !0 && !Array.isArray(T.material) && T.material.dispose?.());
      }));
  }
  function J(A, T = !0) {
    ((u.shot = A), T && (u.camSnap = !0));
  }
  let U = (A) => (typeof A == "function" ? A() : A);
  function Pe(A) {
    if (!u?.shot) return !1;
    let T = u.shot,
      ye = U(T.pos),
      G = U(T.look),
      Be = u.camSnap ? 1 : 1 - Math.exp(-A * (T.k || 3));
    (u.camP.lerp(ye, Be), u.camL.lerp(G, u.camSnap ? 1 : 1 - Math.exp(-A * (T.kl || T.k || 5))), (u.camSnap = !1), a.position.copy(u.camP));
    let R = u.t,
      ee = T.sway ?? 0.035;
    ((a.position.x += Math.sin(R * 1.3) * ee + (Math.random() - 0.5) * u.shake),
      (a.position.y += Math.sin(R * 1.9 + 1) * ee * 0.7 + (Math.random() - 0.5) * u.shake),
      (u.shake *= Math.exp(-A * 6)),
      a.lookAt(u.camL));
    let $ = a.aspect || 1,
      le = Math.min(88, (T.fov || 55) * ($ < 1 ? 1 + (1 - $) * 1.1 : 1));
    return (
      Math.abs(a.fov - le) > 0.05 && ((a.fov = u.camFovSnap ? le : a.fov + (le - a.fov) * Math.min(1, A * 3)), a.updateProjectionMatrix()),
      !0
    );
  }
  let Oe = null,
    Ve = null,
    Ze = null,
    St = () =>
      Oe ||
      (Oe = Wc(96, 48, (A) => {
        ((A.fillStyle = "#1d7a3e"),
          A.fillRect(0, 0, 96, 48),
          (A.fillStyle = "#4fd17a"),
          A.fillRect(4, 4, 88, 40),
          (A.strokeStyle = "#1d7a3e"),
          (A.lineWidth = 3),
          A.beginPath(),
          A.arc(48, 24, 11, 0, Math.PI * 2),
          A.stroke(),
          (A.fillStyle = "#1d7a3e"),
          (A.font = "900 16px Arial"),
          (A.textAlign = "center"),
          A.fillText("\u20BA", 48, 30));
      })),
    nt = () =>
      Ve ||
      (Ve = Wc(64, 64, (A) => {
        ((A.fillStyle = "#b37800"),
          A.beginPath(),
          A.arc(32, 32, 30, 0, Math.PI * 2),
          A.fill(),
          (A.fillStyle = "#ffcf33"),
          A.beginPath(),
          A.arc(32, 32, 25, 0, Math.PI * 2),
          A.fill(),
          (A.fillStyle = "#8a5a00"),
          (A.font = "900 30px Arial"),
          (A.textAlign = "center"),
          A.fillText("\u20BA", 32, 43));
      })),
    W = {},
    P = (A) =>
      W[A] ||
      (W[A] = Wc(64, 64, (T) => {
        ((T.fillStyle = A),
          T.beginPath(),
          T.arc(32, 32, 30, 0, Math.PI * 2),
          T.fill(),
          (T.strokeStyle = "#fff"),
          (T.lineWidth = 7),
          T.setLineDash([9, 9]),
          T.beginPath(),
          T.arc(32, 32, 25, 0, Math.PI * 2),
          T.stroke(),
          T.setLineDash([]),
          (T.fillStyle = "#fff"),
          T.beginPath(),
          T.arc(32, 32, 13, 0, Math.PI * 2),
          T.fill(),
          (T.fillStyle = A),
          (T.font = "900 15px Arial"),
          (T.textAlign = "center"),
          T.fillText("NG", 32, 38));
      })),
    Me = null,
    Le = () =>
      Me ||
      (Me = Wc(128, 64, (A) => {
        ((A.fillStyle = "#1e1f22"),
          A.fillRect(14, 16, 96, 16),
          A.fillRect(96, 12, 18, 6),
          (A.fillStyle = "#2e2f33"),
          A.fillRect(14, 30, 70, 6),
          (A.fillStyle = "#3a2a1a"),
          A.beginPath(),
          A.moveTo(20, 30),
          A.lineTo(40, 30),
          A.lineTo(34, 58),
          A.lineTo(14, 58),
          A.closePath(),
          A.fill(),
          (A.strokeStyle = "#1e1f22"),
          (A.lineWidth = 4),
          A.beginPath(),
          A.arc(48, 38, 7, 0, Math.PI),
          A.stroke());
      })),
    De = () =>
      Ze ||
      (Ze = Wc(32, 32, (A) => {
        let T = A.createRadialGradient(16, 16, 0, 16, 16, 16);
        (T.addColorStop(0, "#fff"),
          T.addColorStop(0.3, "#ffd45a"),
          T.addColorStop(1, "rgba(255,120,0,0)"),
          (A.fillStyle = T),
          A.fillRect(0, 0, 32, 32));
      }));
  function Te(A, T, ye, G, { arc: Be = 0.8, size: R = [0.3, 0.3], spin: ee = 8, add: $ = !1 } = {}) {
    let le = new Za(new Ba({ map: A, transparent: !0, toneMapped: !1, depthWrite: !1, blending: $ ? ra : Ks }));
    (le.scale.set(R[0], R[1], 1),
      le.position.copy(T),
      e.add(le),
      u.parts.push({ sp: le, from: T.clone(), to: ye.clone(), t: 0, dur: G, arc: Be, spin: ee, j: Math.random() * 6 }));
  }
  function mt(A) {
    u.parts = u.parts.filter((T) => {
      T.t += A;
      let ye = Vh(T.t / T.dur, 0, 1);
      return (
        T.sp.position.lerpVectors(T.from, T.to, ye),
        (T.sp.position.y += Math.sin(ye * Math.PI) * T.arc),
        (T.sp.material.rotation = ye * T.spin + T.j),
        T.spin === 0 && (T.sp.material.opacity = 1 - ye),
        ye >= 1 ? (e.remove(T.sp), T.sp.material.dispose(), !1) : !0
      );
    });
  }
  function fe(A, T = 3) {
    for (let ye = 0; ye < T; ye++) {
      let G = A.clone().add(new xn((Math.random() - 0.5) * 1.1, Math.random() * 0.5 - 0.5, (Math.random() - 0.5) * 1.1));
      Te(De(), A, G, 0.25 + Math.random() * 0.25, { arc: 0.25, size: [0.16, 0.16], spin: 0, add: !0 });
    }
  }
  let Ee = (A) => {
      u.flash.className = `hx-flash${A ? " siren" : ""}`;
    },
    $e = (A) => {
      ((u.flash.className = `hx-flash${A ? " alarm" : ""}`), (u.alarm = A));
    };
  function pe(A, T, ye) {
    let G = k(`hx-float ${A}`, "", u.fx);
    ((G.textContent = T), u.floats.push({ e: G, wp: ye.clone(), t0: performance.now() }));
  }
  let xe = (A, T) => A?.say(T);
  async function Xe() {
    let A = u.T,
      { W: T, o: ye, r: G, vLane: Be, vFar: R, vWalk: ee, sv: $, carYaw: le } = b,
      { crew: ae, outcome: Ue } = u.opts,
      Ge = ae.length,
      { lead: qe, gun: ct, driver: Et, look: _t } = u.A,
      Ut = (Qt) => {
        let Vt = u.roles.indexOf(Qt);
        Vt >= 0 && ie(ae[Vt], Yh[Qt]);
      },
      pn = !Et,
      Wt = pn ? null : it(u.opts.carId ?? 5, u.opts.carMods || null),
      Kn = T(0.5, Be),
      _i = ee > 11 ? wn : 4.6;
    ((u.focus = () => T(0, $(0.7))),
      Wt
        ? (de(Wt, T(62, Be), le),
          ze(Wt, Ge),
          J({ pos: T(-7.5, ee + 0.6, 1.15), look: () => new xn(Wt.x, 0.9, Wt.z), k: 0, kl: 6, fov: 48 }))
        : (me(qe, T(7, ee + 1.3), !1),
          Ie(qe, T(0, 0)),
          J({ pos: T(-4.5, ee + 1, 1.4), look: () => new xn(qe.x, 1.1, qe.z), k: 0, kl: 6, fov: 46 })),
      Ww(),
      (u.title.innerHTML = `<small>NEON \u015EEH\u0130R</small><b>${A.title}</b><i>${pn ? "Tek ba\u015F\u0131na" : `${Ge} ki\u015Filik ekip`}</i>`),
      u.title.classList.add("on"),
      g.sting(),
      await te(1.4),
      u.title.classList.remove("on"),
      await oe(!1, 0.35),
      pn ? await lt(qe) : await Ln());
    async function Ln() {
      (g.vroom(),
        await F(Wt, { x: T(9, Be).x, z: T(9, Be).z }, 1.6, (Qt) => Qt),
        (Wt.brake = !0),
        g.screech(),
        await F(Wt, { x: Kn.x, z: Kn.z }, 0.8, (Qt) => 1 - (1 - Qt) * (1 - Qt)),
        J({ pos: T(6.2, ee + 1.3, 1.5), look: T(0, ee + 1.2, 1.15), fov: 50 }),
        ze(Wt, 1),
        [
          [qe, T(1.2, ee + 1.5)],
          [ct, T(-0.4, ee + 1.2)],
          [_t, T(-1.9, ee + 1.6)],
        ].forEach(([Qt, Vt]) => {
          Qt && (me(Qt, Vt, !1), Ie(Qt, T(0, 0)));
        }),
        g.thud(),
        // v157: üstteki 60 sn sayacı kaldırıldı
        (u.clockOn = !1),
        Ut("driver"),
        pe("talk", "\u201CMotor \xE7al\u0131\u015F\u0131yor.\u201D", new xn(Wt.x, 2.2, Wt.z)),
        await te(0.6));
    }
    let zt = (ee + 2) / _i,
      [Hi, Bn] = A.walkCamU || [-7.2, -5.2];
    (J({
      pos: () => T(n0(Hi, Bn, u.dolly), n0(ee + 3.2, 5.6, u.dolly), 1.9),
      look: () => T(0, n0($(0.55), 0.8, u.dolly), 1.2),
      k: 2.5,
      fov: 52,
    }),
      (u.dolly = 0),
      ve(zt, (Qt) => (u.dolly = Qt), w1).catch(() => {}),
      Ut("lead"),
      _t &&
        be(_t, [T(-2.2, $(0.7)), T(-2.9, $(0.55))], _i)
          .then(() => {
            (Ie(_t, T(-3, 12)), xe(_t, "Sokak temiz. \u{1F440}"), Ut("look"));
          })
          .catch(() => {}));
    // v157: ekip gerçek kapıdan içeri yürür (kapı açılır, içerisi görünür) — kararma ancak içerideyken
    let Ea = [be(qe, [T(1, $(0.6)), T(0.3, -0.9), T(0.3, -2.3)], _i)];
    if (
      (ct && Ea.push(be(ct, [T(-0.4, $(0.54)), T(-0.3, -1), T(-0.3, -2.4)], _i)),
      await Promise.all(Ea),
      await oe(!0, 0.1),
      ke(qe),
      ct && ke(ct),
      _t && ke(_t),
      Wt && (Wt.v.root.visible = !1),
      (p.g.visible = !0),
      (u.inside = !0),
      u.npcs.forEach((Qt) => (Qt.group.visible = !0)),
      await ({ casino: re, galeri: et, silah: Ye, fabrika: bt, netkafe: gt }[A.key] || Xt)({ lead: qe, gun: ct, card: Ut }),
      await oe(!0, 0.15),
      Ue === "busted" && !pn)
    )
      return gn({ lead: qe, gun: ct, driver: Et, look: _t, car: Wt });
    if (Ue === "ok" && A.key === "galeri")
      return (In(), (Wt.v.root.visible = !0), (Wt.brake = !1), Re({ lead: qe, gun: ct, look: _t, car: Wt }));
    (In(),
      Wt && ((Wt.v.root.visible = !0), (Wt.brake = !1)),
      me(qe, T(0.3, -0.6), !1),
      ct && me(ct, T(-0.4, -0.7), !1),
      _t && (me(_t, T(-2.9, $(0.55)), !1), Ie(_t, T(0, 0))));
    let za = () => (ct ? new xn((qe.x + ct.x) / 2, 1.1, (qe.z + ct.z) / 2) : new xn(qe.x, 1.1, qe.z));
    if (Ue === "caught" || (Ue === "busted" && pn)) {
      let Qt = it(14),
        Vt = it(14);
      ((Qt.flash = Vt.flash = !0),
        de(Qt, T(-58, R), le + Math.PI),
        de(Vt, T(64, Be), le),
        At(),
        (u.stopSiren = g.loop("siren")),
        await oe(!1, 0.18),
        Ee(!0));
      let As = [be(qe, [T(0.7, $(0.52))], wn)];
      ct && As.push(be(ct, [T(-0.6, $(0.45))], wn));
      let fo = F(Qt, T(-6.5, Be + 1.2), 1.7, (Ya) => 1 - (1 - Ya) * (1 - Ya), le + Math.PI - 0.6),
        yr = F(Vt, T(7.5, Be - 0.3), 1.9, (Ya) => 1 - (1 - Ya) * (1 - Ya), le + 0.5);
      return (
        await te(0.8),
        g.screech(),
        (u.shake = 0.06),
        await Promise.all([fo, yr, ...As]),
        g.screech(),
        vt()[0].say("POL\u0130S! Eller yukar\u0131! \u{1F6A8}"),
        await te(0.3),
        [qe, ct, _t].forEach((Ya) => {
          Ya && (Ie(Ya, T(0, 12)), ue(Ya, "handsup", !0));
        }),
        pe("police", "\u{1F6A8} POL\u0130S!", za().add(new xn(0, 1.4, 0))),
        await te(0.7),
        J({ pos: T(-0.5, ee + 0.3, 1.7), look: () => za(), fov: 42 }),
        await te(0.4),
        xe(qe, pn ? "Eyvah\u2026 yakaland\u0131m." : "Eyvah\u2026 yakaland\u0131k."),
        Et && (ze(Wt, 0), me(Et, T(1.6, ee + 1.5), !1), Ie(Et, T(5, ee)), ue(Et, "handsup", !0)),
        await te(1.3),
        Yn()
      );
    }
    if (pn) return Je(qe);
    (J({ pos: T(6.6, ee + 1.6, 1.3), look: () => za().lerp(T(0.5, ee + 1, 1), 0.35), k: 2.5, fov: 52 }),
      await oe(!1, 0.18),
      _t && xe(_t, "Hadi hadi hadi!"));
    let Pi = [be(qe, [T(0.8, $(0.48)), T(1.1, ee + 1.7)], wn)];
    (ct && Pi.push(be(ct, [T(-0.3, $(0.48)), T(-0.3, ee + 1.7)], wn)),
      _t && Pi.push(te(0.5).then(() => be(_t, [T(-1.5, ee + 1.7)], wn))),
      await Promise.all(Pi),
      [qe, ct, _t].forEach((Qt) => Qt && ke(Qt)),
      ze(Wt, Ge),
      g.thud(),
      pe("talk", "\u201CBas gaza!\u201D", new xn(Wt.x, 2.2, Wt.z)),
      await te(0.15));
    let br = Math.sin(le),
      ui = Math.cos(le);
    (J({
      pos: () => new xn(Wt.x - br * 7.5 + G.x * 0, 2.5, Wt.z - ui * 7.5).addScaledVector(new xn(ye.x, 0, ye.z), -1.2),
      look: () => new xn(Wt.x + br * 3, 0.9, Wt.z + ui * 3),
      k: 2.6,
      kl: 7,
      fov: 60,
    }),
      g.vroom(),
      g.screech(),
      (u.focus = () => new xn(Wt.x, 0, Wt.z)));
    let $a = T(-118, Be),
      Ke = F(Wt, { x: $a.x, z: $a.z }, 4.4, (Qt) => Qt * Qt);
    return (
      await te(1.7),
      (u.stopSiren = g.loop("siren")),
      Z("\u{1F693} Sirenler uzakta kald\u0131\u2026"),
      (u.shot = { ...u.shot, pos: u.camP.clone().setY(3.4), k: 1.2 }),
      await te(1.5),
      Ke.catch(() => {}),
      Yn()
    );
  }
  async function lt(A) {
    let { W: T, vWalk: ye, sv: G } = b;
    (u.clockOn = !1); // v157: sayaç yok
    let Be = Yh.lead;
    (ie(u.opts.crew[0], `${Be} \xB7 TEK BA\u015EINA`), xe(A, "Tek ba\u015F\u0131ma hallederim."));
    let R = (ye + 7) / 4.6;
    (J({
      pos: () => T(n0(-6.2, -4.8, u.dolly), n0(ye + 2.6, 5.6, u.dolly), 1.9),
      look: () => new xn(A.x, 1.15, A.z),
      k: 2.5,
      kl: 5,
      fov: 50,
    }),
      (u.dolly = 0),
      ve(R, (ee) => (u.dolly = ee), w1).catch(() => {}),
      await be(A, [T(1.2, G(0.6)), T(0.3, -0.9), T(0.3, -2.3)], 4.6),
      await oe(!0, 0.12));
  }
  async function Je(A) {
    let { W: T, o: ye, r: G, vWalk: Be, sv: R, carYaw: ee } = b;
    (J({ pos: T(6.4, Be + 1, 1.4), look: () => new xn(A.x, 1.1, A.z), k: 3, fov: 52 }),
      await oe(!1, 0.18),
      await be(A, [T(0.6, R(0.5)), T(-1, Be + 0.8)], wn));
    let $ = Math.sin(ee),
      le = Math.cos(ee);
    (J({
      pos: () => new xn(A.x - $ * 5.5, 2.2, A.z - le * 5.5).addScaledVector(new xn(ye.x, 0, ye.z), 1),
      look: () => new xn(A.x + $ * 3, 1, A.z + le * 3),
      k: 3,
      kl: 7,
      fov: 58,
    }),
      (u.focus = () => new xn(A.x, 0, A.z)));
    let ae = be(A, [T(-40, Be + 0.8)], wn);
    return (
      await te(2),
      (u.stopSiren = g.loop("siren")),
      Z("\u{1F693} Sirenler uzakta kald\u0131\u2026"),
      (u.shot = { ...u.shot, pos: u.camP.clone().setY(3.2), k: 1.2 }),
      await te(1.6),
      ae.catch(() => {}),
      Yn()
    );
  }
  function At() {
    let { W: A, vLane: T, vWalk: ye, sv: G } = b,
      Be = Math.max(0, ye - 8.4);
    J({ pos: A(-2.5, T + 8.2 + Be * 0.3, 4.6 + Be * 0.25), look: A(0.3, G(0.65), 0.9), fov: 58, sway: 0.05 });
  }
  function vt() {
    let { W: A, vWalk: T } = b;
    return [A(-4, T - 0.4), A(-2.3, T + 0.5), A(4.3, T - 0.4), A(2.9, T + 0.6)].map((ye, G) => {
      let Be = he(`cop${G}`, "Polis", m9, !0);
      return (me(Be, ye, !1), Ie(Be, b.W(0, b.sv(0.35))), ue(Be, "aim"), Be);
    });
  }
  async function Xt({ lead: A, gun: T, card: ye }) {
    let { I: G } = b,
      { crew: Be, outcome: R } = u.opts;
    (me(A, G(4.5, 0, 4.4), !0),
      T && me(T, G(5.4, 0, 4.9), !0),
      J({ pos: G(-0.6, 1.55, -0.6), look: G(4.4, 1.25, 4.6), fov: 52 }),
      await oe(!1, 0.15),
      await Promise.all([be(A, G(4, 0, 3), wn), T ? be(T, G(5.6, 0, 3.6), wn) : null]),
      Ie(A, G(0, 0, -5)),
      ue(A, "aim"),
      T && (Ie(T, G(0, 0, 0)), ue(T, "aim")),
      g.thud(),
      (u.shake = 0.05),
      xe(A, "Kimse k\u0131p\u0131rdamas\u0131n! Bu bir soygun! \u{1F52B}"),
      await te(0.2),
      ft(A),
      await te(0.35),
      J({ pos: G(7.4, 2.7, 6), look: G(-0.5, 0.9, -3.6), fov: 58 }),
      u.npcs[1]?.say("Tamam, tamam! Ate\u015F etmeyin!"),
      await te(0.6),
      T &&
        (xe(T, "Eller havada kals\u0131n!"),
        ye("gun"),
        be(T, G(1.6, 0, 0.2), $h)
          .then(() => {
            (Ie(T, G(-1, 0, -4)), ue(T, "aim"));
          })
          .catch(() => {})),
      await be(A, [G(6.2, 0, 0.5), G(7.75, 0, -3.1)], wn),
      Ie(A, G(9, 0, -3.2)),
      J({ pos: G(5.1, 1.75, 0.4), look: G(8.9, 1.2, -3.3), fov: 44 }),
      (A.shakeUntil = performance.now() + 6e4));
    let ee = R === "caught" ? 4 : 99;
    for (let $ = 0; $ <= 8; $++)
      (I("\u{1F510} Kasa a\xE7\u0131l\u0131yor", $ / 8),
        p.spokes?.forEach((le) => (le.rotation.z += 0.6)),
        $ % 2 === 0 && g.clank(),
        $ === ee && un(u.npcs[3]),
        await te(0.13));
    ((A.shakeUntil = 0),
      I("", null),
      g.thud(),
      await ve(
        0.6,
        ($) => {
          (p.vaultPivot && (p.vaultPivot.rotation.y = -1.95 * $), p.goldL && (p.goldL.intensity = 3.5 * $));
        },
        w1,
      ),
      await Lt(G(8.75, 1.2, -3.2), A, 14, 0, u.opts.reward, [0.8, 0.9]),
      A.setAvatar({ ...Be[0].avatar, heldItem: "canta" }),
      pe("gold", `+${Ss(u.opts.reward)}`, new xn(A.x, A.y + 2.2, A.z)),
      await te(0.2),
      xe(A, R === "caught" ? "Alarm! \xC7abuk \xE7\u0131k\u0131n!" : "\xC7antalar doldu, \xE7\u0131k\u0131yoruz!"),
      Z(""),
      await te(0.25),
      J({ pos: G(-0.6, 1.6, 0.4), look: G(4.6, 1.2, 5.2), fov: 52 }),
      T && ue(T, null),
      await Promise.all([be(A, [G(6.2, 0, 0.5), G(5, 0, 6.4)], wn), T ? be(T, [G(4.2, 0, 3), G(5.5, 0, 6.5)], wn) : null]));
  }
  async function re({ lead: A, gun: T, card: ye }) {
    let { I: G } = b,
      { crew: Be, outcome: R, reward: ee } = u.opts,
      $ = u.npcByRole;
    (me(A, G(4.5, 0, 4.4), !0),
      T && me(T, G(5.4, 0, 4.9), !0),
      J({ pos: G(-0.4, 1.55, 0.6), look: G(4.6, 1.25, 4.8), fov: 54 }),
      await oe(!1, 0.15),
      await Promise.all([be(A, G(4.2, 0, 2.8), wn), T ? be(T, G(5.8, 0, 3.4), wn) : null]),
      Ie(A, G(0, 0, -5)),
      ue(A, "aim"),
      T && (Ie(T, G(-4, 0, 0)), ue(T, "aim")),
      g.thud(),
      (u.shake = 0.05),
      xe(A, "Oyun bitti! Herkes eller yukar\u0131! \u{1F52B}"),
      await te(0.2),
      ft(A),
      await te(0.35),
      J({ pos: G(7.6, 2.6, 5.6), look: G(-2.4, 0.9, -2.6), fov: 60 }),
      $.dealer?.say("Fi\u015Fler sizin olsun, ate\u015F etmeyin!"),
      await te(0.55));
    let le = T ? Math.round(ee * 0.2) : 0,
      ae = null;
    (T &&
      (ye("gun"),
      xe(T, "Masadakiler de bizim!"),
      (ae = be(T, [G(1, 0, 0.6), G(-2, 0, -1.55)], wn).then(async () => {
        (Ie(T, G(-2.2, 0, -3.5)), ue(T, null));
      }))),
      await be(A, [G(5.5, 0, 0.6), G(6.3, 0, -4.7)], wn),
      Ie(A, G(6.3, 0, -7)),
      ue(A, "aim"),
      J({ pos: G(3.7, 1.75, -1.5), look: G(6.5, 1.2, -5.8), fov: 44 }),
      xe(A, "Kasay\u0131 bo\u015Falt! Hepsi \xE7antaya! \u{1F4B0}"),
      $.cashier?.say("Tamam, tamam!"),
      await te(0.3));
    let Ue = R === "caught" ? 6 : 99;
    if (
      (await Lt(G(6.3, 1.25, -5.6), A, 12, 0, ee - le, [0.9, 0.3], (Ge) => {
        (I("\u{1F4B0} Kasa bo\u015Falt\u0131l\u0131yor", (Ge + 1) / 12), Ge === Ue && un($.guard));
      }),
      I("", null),
      A.setAvatar({ ...Be[0].avatar, heldItem: "canta" }),
      ue(A, "aim"),
      T)
    ) {
      (await ae, J({ pos: G(0.9, 1.85, -0.4), look: G(-2.5, 0.95, -2.9), fov: 46 }));
      let Ge = ["#c4161c", "#111111", "#0d7a3e", "#1d4fbf", "#c9a24a"];
      for (let qe = 0; qe < 12; qe++) {
        let ct = G(-3.1 + Math.random() * 1.8, 0.95, -3.2 + Math.random() * 0.9);
        (Te(P(Ge[qe % Ge.length]), ct, new xn(T.x, T.y + 1, T.z), 0.45, { arc: 0.35, size: [0.2, 0.2], spin: 4 }),
          qe % 2 === 0 && g.cash(qe % 6),
          (u.loot = ee - le + Math.round((le * (qe + 1)) / 12)),
          await te(0.06));
      }
      (T.setAvatar({ ...Be[1].avatar, heldItem: "canta" }), ue(T, "aim"));
    }
    if (((u.loot = ee), pe("gold", `+${Ss(ee)}`, new xn(A.x, A.y + 2.2, A.z)), R === "ok" && $.slot)) {
      (J({ pos: G(-5.3, 1.7, 2.3), look: G(-8, 1.1, -0.1), fov: 48 }), ue($.slot, null), Ie($.slot, G(-9, 0, 0)));
      let Ge = G(-8, 1.25, 0);
      for (let qe = 0; qe < 16; qe++)
        Te(nt(), Ge, G(-7.6 + Math.random() * 1.6, 0.05, -0.9 + Math.random() * 1.8), 0.5 + Math.random() * 0.3, {
          arc: 0.6,
          size: [0.2, 0.2],
        });
      (pe("gold", "JACKPOT! \u{1F3B0}", G(-8, 1.7, 0.4)),
        [0, 1, 2, 3].forEach((qe) => g.cash(qe + 2)),
        $.slot.say("\u015Eimdi mi \xE7\u0131kt\u0131 bu?!"),
        await te(0.9));
    } else (xe(A, R === "caught" ? "Alarm! \xC7abuk \xE7\u0131k\u0131n!" : "\xC7antalar doldu, \xE7\u0131k\u0131yoruz!"), await te(0.3));
    (Z(""),
      J({ pos: G(-0.4, 1.6, 0.6), look: G(4.8, 1.2, 5), fov: 54 }),
      ue(A, null),
      T && ue(T, null),
      await Promise.all([be(A, [G(5.5, 0, 0.6), G(5, 0, 6.4)], wn), T ? be(T, [G(1, 0, 0.6), G(5.5, 0, 6.5)], wn) : null]));
  }
  async function et({ lead: A, gun: T, card: ye }) {
    let { I: G } = b,
      { crew: Be, outcome: R, reward: ee } = u.opts,
      $ = u.npcByRole;
    (me(A, G(4.5, 0, 4.4), !0),
      T && me(T, G(5.4, 0, 4.9), !0),
      J({ pos: G(-0.6, 1.55, -0.2), look: G(4.4, 1.25, 4.6), fov: 52 }),
      await oe(!1, 0.15),
      await Promise.all([be(A, G(4, 0, 3), wn), T ? be(T, G(5.6, 0, 3.6), wn) : null]),
      Ie(A, G(0, 0, -5)),
      ue(A, "aim"),
      T && (Ie(T, G(-4, 0, 0)), ue(T, "aim")),
      g.thud(),
      (u.shake = 0.05),
      xe(A, "Test s\xFCr\xFC\u015F\xFC bitti! Eller yukar\u0131! \u{1F52B}"),
      await te(0.2),
      ft(A),
      await te(0.35),
      J({ pos: G(7.4, 2.7, 6), look: G(-2, 0.9, -3.4), fov: 58 }),
      $.dealer?.say("Sakin olun, ne isterseniz verelim!"),
      await te(0.55),
      T &&
        (ye("gun"),
        xe(T, "Eller havada kals\u0131n!"),
        be(T, G(0.6, 0, 0.9), $h)
          .then(() => {
            (Ie(T, G(-4, 0, -2)), ue(T, "aim"));
          })
          .catch(() => {})),
      await be(A, [G(5.6, 0, 1), G(5.25, 0, -1.2)], wn),
      Ie(A, G(9, 0, -1.2)),
      ue(A, "aim"),
      J({ pos: G(3, 1.7, 1.7), look: G(7.6, 1.1, -1.3), fov: 44 }),
      xe(A, "Kasay\u0131 ve anahtarlar\u0131 ver! \u{1F511}"),
      $.dealer?.say("Al, al! Hepsi burada!"),
      await te(0.3));
    let le = R === "caught" ? 6 : 99;
    (await Lt(G(7.3, 1, -1.2), A, 12, 0, ee, [0.3, 0.6], (ae) => {
      (I("\u{1F4B0} Kasa bo\u015Falt\u0131l\u0131yor", (ae + 1) / 12), ae === le && un($.guard));
    }),
      I("", null),
      A.setAvatar({ ...Be[0].avatar, heldItem: "canta" }),
      ue(A, "aim"),
      pe("gold", `+${Ss(ee)}`, new xn(A.x, A.y + 2.2, A.z)),
      R === "ok"
        ? (pe("talk", "\u{1F511} Vitrindeki S\xFCper Spor", G(7, 1.9, -1.2)),
          await te(0.35),
          J({ pos: G(-7.9, 2, 1.1), look: G(-4.3, 0.7, -3.6), fov: 52 }),
          xe(A, "Vitrindeki de bizim!"),
          u.npcByRole.buyer?.say("Benim alaca\u011F\u0131m araba o!"),
          await te(0.9))
        : (xe(A, R === "caught" ? "Alarm! \xC7abuk \xE7\u0131k\u0131n!" : "\xC7antalar doldu, \xE7\u0131k\u0131yoruz!"),
          await te(0.3),
          Z(""),
          J({ pos: G(-0.6, 1.6, 0.4), look: G(4.6, 1.2, 5.2), fov: 52 }),
          ue(A, null),
          T && ue(T, null),
          await Promise.all([be(A, [G(5.6, 0, 1), G(5, 0, 6.4)], wn), T ? be(T, [G(4.2, 0, 3), G(5.5, 0, 6.5)], wn) : null])));
  }
  async function Re({ lead: A, gun: T, look: ye, car: G }) {
    let { W: Be, o: R, vLane: ee, vWalk: $, sv: le, carYaw: ae } = b,
      Ue = T ? 2 : 1,
      Ge = it(8),
      qe = Math.atan2(R.x, R.z);
    (de(Ge, Be(0.4, 1.6), qe), ze(Ge, Ue), ye && (me(ye, Be(-2.9, le(0.55)), !1), Ie(ye, Be(0, 0))));
    let ct = Be(0.4, 0.2, 1.4);
    (J({ pos: Be(2.5, le(0.35), 4), look: () => new xn(Ge.x, 0.9, Ge.z), k: 3, fov: 56 }),
      await oe(!1, 0.12),
      g.thud(),
      g.screech(),
      (u.shake = 0.08),
      fe(ct, 14),
      ye && xe(ye, "Bu ne be?! \u{1F633}"),
      g.vroom());
    let Et = ae - qe;
    ((Et = Math.atan2(Math.sin(Et), Math.cos(Et))), await F(Ge, Be(0.6, $ - 0.5), 1, (zt) => zt * zt));
    let _t = ye ? be(ye, [Be(-1.5, $ + 1.7)], wn).then(() => ke(ye)) : null;
    (await F(Ge, Be(7.5, ee), 1, (zt) => 1 - (1 - zt) * (1 - zt), qe + Et),
      (Ge.yaw = qe + Et),
      await _t,
      ze(G, ye ? 2 : 1),
      pe("talk", "\u201CTakip et!\u201D", new xn(G.x, 2.2, G.z)));
    let Ut = Math.sin(ae),
      pn = Math.cos(ae);
    (J({
      pos: () => new xn(Ge.x - Ut * 7.5, 2.4, Ge.z - pn * 7.5).addScaledVector(new xn(R.x, 0, R.z), -1.2),
      look: () => new xn(Ge.x + Ut * 4, 0.9, Ge.z + pn * 4),
      k: 2.6,
      kl: 7,
      fov: 60,
    }),
      g.vroom(),
      (u.focus = () => new xn(Ge.x, 0, Ge.z)));
    let Wt = Be(-118, ee),
      Kn = Be(-108, ee),
      _i = F(G, { x: Wt.x, z: Wt.z }, 4.2, (zt) => zt * zt),
      Ln = te(0.25).then(() => F(Ge, { x: Kn.x, z: Kn.z }, 4, (zt) => zt * zt));
    return (
      await te(1.8),
      (u.stopSiren = g.loop("siren")),
      Z("\u{1F693} Sirenler uzakta kald\u0131\u2026"),
      (u.shot = { ...u.shot, pos: u.camP.clone().setY(3.4), k: 1.2 }),
      await te(1.4),
      _i.catch(() => {}),
      Ln.catch(() => {}),
      Yn()
    );
  }
  async function Ye({ lead: A, gun: T, card: ye }) {
    let { I: G } = b,
      { crew: Be, outcome: R, reward: ee } = u.opts,
      $ = u.npcByRole;
    (me(A, G(4.5, 0, 4.4), !0),
      T && me(T, G(5.4, 0, 4.9), !0),
      J({ pos: G(-2.6, 1.55, 0.2), look: G(4.4, 1.25, 4.6), fov: 52 }),
      await oe(!1, 0.15),
      await Promise.all([be(A, G(3.2, 0, 1.4), wn), T ? be(T, G(4.8, 0, 2.2), wn) : null]),
      Ie(A, G(-1, 0, -5)),
      ue(A, "aim"),
      T && (Ie(T, G(-4, 0, 0)), ue(T, "aim")),
      g.thud(),
      (u.shake = 0.05),
      xe(A, "Kimse k\u0131p\u0131rdamas\u0131n! Eller yukar\u0131! \u{1F52B}"),
      await te(0.2),
      u.npcs.forEach((Ge, qe) => {
        (Ie(Ge, { x: A.x, z: A.z }), Ge !== $.dealer && setTimeout(() => u && !u.cancelled && ue(Ge, "handsup", !0), qe * 70));
      }),
      await te(0.3),
      ue($.dealer, "aim"),
      J({ pos: G(-2.5, 1.75, -6.3), look: G(2.6, 1.2, 0.6), fov: 50 }),
      (u.shake = 0.04),
      $.dealer.say("Benim d\xFCkk\xE2n\u0131mda m\u0131?!"),
      await te(0.8),
      xe(T || A, "\u0130ndir onu Kemal, yoksa\u2026"),
      T &&
        be(T, G(1.6, 0, -1.9), $h)
          .then(() => Ie(T, $.dealer))
          .catch(() => {}),
      await te(0.7),
      ue($.dealer, "handsup", !0),
      $.dealer.say("Tamam, tamam\u2026 al ne istiyorsan."),
      await te(0.5),
      J({ pos: G(7.2, 2.6, 5.6), look: G(-2.4, 0.9, -3.4), fov: 58 }),
      T && (ye("gun"), xe(T, "Raftakiler de bizim!")));
    let le = T ? be(T, [G(1.9, 0, -2.6), G(1.9, 0, -5.8), G(-0.6, 0, -6.1)], wn).then(() => Ie(T, G(-0.6, 0, -8))) : null;
    (await be(A, [G(-3.6, 0, -1.6), G(-6.6, 0, -5.4)], wn),
      Ie(A, G(-6.6, 0, -8)),
      ue(A, "aim"),
      J({ pos: G(-3.6, 1.7, -2.6), look: G(-6.8, 1, -6.3), fov: 46 }),
      xe(A, "Kasa! \u015Eimdi! \u{1F4B0}"),
      await te(0.25));
    let ae = T ? Math.round(ee * 0.3) : 0,
      Ue = R === "caught" ? 6 : 99;
    if (
      (await Lt(G(-6.6, 0.8, -6.5), A, 12, 0, ee - ae, [0.4, 0.3], (Ge) => {
        (I("\u{1F4B0} Kasa bo\u015Falt\u0131l\u0131yor", (Ge + 1) / 12), Ge === Ue && un($.dealer));
      }),
      I("", null),
      A.setAvatar({ ...Be[0].avatar, heldItem: "canta" }),
      T)
    ) {
      (await le, J({ pos: G(1.3, 1.8, -3), look: G(-1, 1.3, -6.6), fov: 50 }));
      for (let Ge = 0; Ge < 9; Ge++) {
        let qe = G(-2.6 + Math.random() * 3.8, 1 + Math.random() * 1, -6.85);
        (Te(Le(), qe, new xn(T.x, T.y + 1, T.z), 0.45, { arc: 0.3, size: [0.5, 0.25], spin: 2 }),
          Ge % 2 === 0 && g.clank(),
          (u.loot = ee - ae + Math.round((ae * (Ge + 1)) / 9)),
          await te(0.08));
      }
      T.setAvatar({ ...Be[1].avatar, heldItem: "canta" });
    }
    ((u.loot = ee),
      pe("gold", `+${Ss(ee)}`, new xn(A.x, A.y + 2.2, A.z)),
      await an(A, T, [G(-3.6, 0, -1.6), G(5, 0, 6.4)], [G(1.9, 0, -5.8), G(1.9, 0, -2.6), G(5.5, 0, 6.5)], {
        pos: G(-2.6, 1.6, 0.2),
        look: G(4.6, 1.2, 5.2),
      }));
  }
  async function bt({ lead: A, gun: T, card: ye }) {
    let { I: G } = b,
      { crew: Be, outcome: R, reward: ee } = u.opts,
      $ = u.npcByRole;
    (me(A, G(4.5, 0, 4.4), !0),
      T && me(T, G(5.4, 0, 4.9), !0),
      J({ pos: G(-3.6, 1.7, 1.2), look: G(4.4, 1.25, 4.6), fov: 54 }),
      await oe(!1, 0.15),
      await Promise.all([be(A, G(3.4, 0, 2.6), wn), T ? be(T, G(4.8, 0, 3.4), wn) : null]),
      Ie(A, G(-3, 0, -3)),
      ue(A, "aim"),
      T && (Ie(T, G(-5, 0, 0)), ue(T, "aim")),
      g.thud(),
      (u.shake = 0.05),
      xe(A, "Herkes i\u015Fi b\u0131raks\u0131n! Eller yukar\u0131! \u{1F52B}"),
      await te(0.2),
      ft(A),
      await te(0.35),
      J({ pos: G(7, 3, 5.4), look: G(-3, 0.8, -3), fov: 60 }),
      $.worker?.say("Abi biz i\u015F\xE7iyiz, bizde para yok!"),
      await te(0.6));
    let le = T || A;
    (T && ye("gun"),
      await be(le, [G(4.6, 0, -1.2), G(4, 0, -2.4)], wn),
      Ie(le, G(3.7, 0, -3.6)),
      ue(le, null),
      J({ pos: G(6.6, 2.6, 0.9), look: G(3.6, 0.9, -3.2), fov: 50 }),
      await te(0.2),
      (p.belt.on = !1),
      g.thud(),
      (u.shake = 0.05),
      xe(le, "Bant durdu! Kimse k\u0131p\u0131rdamas\u0131n!"),
      await te(0.5),
      ue(le, "aim"),
      Ie(le, G(-3, 0, -2)),
      await be(A, [G(5.7, 0, -1.2), G(5.7, 0, -3.6), G(6.6, 0, -4.5)], wn),
      Ie(A, G(7.4, 0, -6.4)),
      ue(A, "aim"),
      J({ pos: G(8.6, 1.7, -3.6), look: G(6.9, 1, -6.3), fov: 54 }),
      xe(A, "Maa\u015F kasas\u0131! A\xE7 \u015Funu! \u{1F4B0}"),
      $.boss?.say("Bug\xFCn maa\u015F g\xFCn\xFCyd\xFC be\u2026"),
      await te(0.35));
    let ae = R === "caught" ? 6 : 99;
    (await Lt(G(8.4, 0.8, -6.5), A, 12, 0, ee, [0.4, 0.3], (Ue) => {
      (I("\u{1F4B0} Maa\u015F kasas\u0131 bo\u015Falt\u0131l\u0131yor", (Ue + 1) / 12), Ue === ae && un($.guard));
    }),
      I("", null),
      A.setAvatar({ ...Be[0].avatar, heldItem: "canta" }),
      pe("gold", `+${Ss(ee)}`, new xn(A.x, A.y + 2.2, A.z)),
      await an(A, T, [G(5.7, 0, -3.6), G(5.7, 0, -1.2), G(5, 0, 6.4)], [G(4.6, 0, -1.2), G(5.5, 0, 6.5)], {
        pos: G(-3.6, 1.7, 1.2),
        look: G(4.6, 1.2, 5.2),
      }));
  }
  async function gt({ lead: A, gun: T, card: ye }) {
    let { I: G } = b,
      { crew: Be, outcome: R, reward: ee } = u.opts,
      $ = u.npcByRole;
    (me(A, G(4.5, 0, 4.4), !0),
      T && me(T, G(5.4, 0, 4.9), !0),
      J({ pos: G(-2, 1.55, 2.4), look: G(4.4, 1.25, 4.8), fov: 54 }),
      await oe(!1, 0.15),
      await Promise.all([be(A, G(3.6, 0, 2.8), wn), T ? be(T, G(5.2, 0, 3.4), wn) : null]),
      Ie(A, G(-3, 0, -3)),
      ue(A, "aim"),
      T && (Ie(T, G(-5, 0, 0)), ue(T, "aim")),
      g.thud(),
      (u.shake = 0.05),
      xe(A, "Klavyeler b\u0131rak\u0131ls\u0131n! Eller yukar\u0131! \u{1F52B}"),
      await te(0.2),
      u.npcs.forEach((Ue, Ge) => {
        Ue !== $.gamer && (Ie(Ue, { x: A.x, z: A.z }), setTimeout(() => u && !u.cancelled && ue(Ue, "handsup", !0), Ge * 70));
      }),
      await te(0.35),
      J({ pos: G(6.6, 2.6, 4.8), look: G(-2, 0.8, -2.4), fov: 58 }),
      $.cashier?.say("Tamam, sakin olun!"),
      await te(0.45),
      J({ pos: G(3, 1.5, 2.2), look: G(1.2, 0.9, -0.6), fov: 46 }),
      $.gamer.say("\u{1F3A7} Bir dakika abi, ma\xE7 bitsin!"),
      await te(0.8));
    let le = T || A;
    (T && ye("gun"),
      J({ pos: G(3.6, 1.7, 1.8), look: G(0.9, 1, -0.2), fov: 50 }),
      await be(le, G(0.3, 0, 0.7), wn),
      Ie(le, $.gamer),
      ue(le, "aim"),
      xe(le, "Duymad\u0131n m\u0131?!"),
      (u.shake = 0.03),
      await te(0.45),
      ($.gamer.sitting = !1),
      ($.gamer.seatYaw = null),
      ue($.gamer, "handsup", !0),
      Ie($.gamer, le),
      $.gamer.say("Tamam! Rank d\xFC\u015Ft\xFC zaten\u2026"),
      await te(0.7),
      await be(A, [G(4.8, 0, -1.4), G(5.6, 0, -4.2)], wn),
      Ie(A, G(8, 0, -4.2)),
      ue(A, "aim"),
      J({ pos: G(3.2, 1.7, -1.8), look: G(7, 1.1, -4.6), fov: 46 }),
      xe(A, "Kasay\u0131 bo\u015Falt! \u{1F4B0}"),
      await te(0.25));
    let ae = R === "caught" ? 6 : 99;
    (await Lt(G(6.7, 1.1, -4.2), A, 12, 0, ee, [0.3, 0.5], (Ue) => {
      (I("\u{1F4B0} Kasa bo\u015Falt\u0131l\u0131yor", (Ue + 1) / 12), Ue === ae && un($.cashier));
    }),
      I("", null),
      A.setAvatar({ ...Be[0].avatar, heldItem: "canta" }),
      pe("gold", `+${Ss(ee)}`, new xn(A.x, A.y + 2.2, A.z)),
      await an(A, T, [G(4.8, 0, -1.4), G(5, 0, 6.4)], [G(4, 0, 2.8), G(5.5, 0, 6.5)], { pos: G(-2, 1.6, 2.4), look: G(4.6, 1.2, 5.2) }));
  }
  async function an(A, T, ye, G, Be) {
    let { outcome: R } = u.opts;
    (await te(0.2),
      xe(A, R === "caught" ? "Alarm! \xC7abuk \xE7\u0131k\u0131n!" : "\xC7antalar doldu, \xE7\u0131k\u0131yoruz!"),
      Z(""),
      await te(0.25),
      J({ ...Be, fov: 54 }),
      ue(A, null),
      T && ue(T, null),
      await Promise.all([be(A, ye, wn), T ? be(T, G, wn) : null]));
  }
  function ft(A) {
    u.npcs.forEach((T, ye) => {
      (Ie(T, { x: A.x, z: A.z }), setTimeout(() => u && !u.cancelled && ue(T, "handsup", !0), ye * 70));
    });
  }
  function un(A) {
    ($e(!0),
      (u.stopAlarm = g.loop("alarm")),
      (u.shake = 0.06),
      Z("\u{1F6A8} Sessiz alarm \u2014 \u015F\xFCphe \xE7ok y\xFCksekti"),
      A?.say("Polis yolda!"));
  }
  async function Lt(A, T, ye, G, Be, [R, ee], $) {
    for (let le = 0; le < ye; le++) {
      let ae = le % 3 !== 0;
      (Te(
        ae ? St() : nt(),
        A.clone().add(new xn((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * R, (Math.random() - 0.5) * ee)),
        new xn(T.x, T.y + 1, T.z),
        0.5,
        { arc: 0.5, size: ae ? [0.4, 0.2] : [0.24, 0.24] },
      ),
        g.cash(le % 6),
        (u.loot = Math.round(G + ((Be - G) * (le + 1)) / ye)),
        $?.(le),
        await te(0.075));
    }
  }
  async function gn({ lead: A, gun: T, driver: ye, look: G, car: Be }) {
    let { W: R, vLane: ee, vWalk: $, sv: le, carYaw: ae } = b;
    (In(), (Be.v.root.visible = !0));
    let Ue = it(14),
      Ge = it(14);
    ((Ue.flash = Ge.flash = !0), de(Ue, R(-6.5, ee + 1.2), ae + Math.PI - 0.6), de(Ge, R(7.5, ee - 0.3), ae + 0.5), ze(Be, 0));
    let qe = vt();
    ([
      [ye, R(1.6, $ + 1.5)],
      [G, R(-2.9, le(0.55))],
    ].forEach(([Et, _t]) => {
      Et && (me(Et, _t, !1), Ie(Et, R(0, 12)), ue(Et, "handsup", !0));
    }),
      me(A, R(0.3, -0.6), !1),
      T && me(T, R(-0.4, -0.7), !1));
    let ct = () => (T ? new xn((A.x + T.x) / 2, 1.1, (A.z + T.z) / 2) : new xn(A.x, 1.1, A.z));
    return (
      At(),
      Ee(!0),
      (u.stopSiren = g.loop("siren")),
      g.sting(),
      await oe(!1, 0.15),
      qe[0].say("POL\u0130S! Sizi bekliyorduk. Eller yukar\u0131! \u{1F6A8}"),
      await Promise.all([be(A, [R(0.7, le(0.52))], wn), T ? be(T, [R(-0.6, le(0.45))], wn) : null]),
      [A, T].forEach((Et) => {
        Et && (Ie(Et, R(0, 12)), ue(Et, "handsup", !0));
      }),
      Z("\u{1F694} Pusu \u2014 ekipte gizli polis vard\u0131"),
      pe("police", "\u{1F6A8} POL\u0130S!", ct().add(new xn(0, 1.4, 0))),
      await te(0.6),
      J({ pos: R(-0.5, $ + 0.3, 1.7), look: () => ct(), fov: 42 }),
      xe(A, "Biri bizi satm\u0131\u015F\u2026"),
      await te(1.5),
      Yn()
    );
  }
  function In() {
    ((u.inside = !1), (p.g.visible = !1), u.npcs.forEach(ke), $e(!1), u.stopAlarm?.(), (u.stopAlarm = null));
  }
  async function Yn() {
    (await oe(!0, 0.45), ri(!1));
  }
  function Jn() {
    let { crew: A, outcome: T, reward: ye } = u.opts,
      G = T === "ok",
      Be = Math.floor(ye / A.length),
      R = k(`hx-result ${G ? "ok" : "bad"}`),
      ee = A.map(($, le) => {
        let ae = G ? `+${Ss(Be)}` : T === "busted" && le > 0 ? "?" : `\u2212${Ss(Be)}`;
        return `<li><img src="${S1($.avatar)}" alt=""><span><b data-n="${le}"></b><small>${Yh[u.roles[le]]}</small></span><em class="${G ? "plus" : ae === "?" ? "unk" : "minus"}">${ae}</em></li>`;
      }).join("");
    ((R.innerHTML = `
      <div class="hx-res-top">
        <small>${G ? "B\xD6L\xDCM SONU" : T === "busted" ? "\u0130HANET" : "BASKIN"}</small>
        <h2>${G ? "SOYGUN BA\u015EARILI" : "YAKALANDINIZ"}</h2>
        <p>${G ? `\u{1F4B0} ${Ss(ye)} alt\u0131n` : T === "busted" ? "\u{1F694} Ekipte gizli polis vard\u0131" : "\u{1F6A8} \u015E\xFCphe \xE7ok y\xFCksekti"}</p>
      </div>
      <ul>${ee}</ul>
      <div class="hx-res-btn"><button data-a="again">\u21BB Tekrar izle</button><button data-a="close" class="pri">Kapat</button></div>`),
      A.forEach(($, le) => (R.querySelector(`[data-n="${le}"]`).textContent = $.name)),
      ["pointerdown", "touchstart", "mousedown"].forEach(($) => R.addEventListener($, (le) => le.stopPropagation(), { passive: !0 })),
      Rb(R.querySelector('[data-a="again"]'), () => {
        let $ = u?.opts;
        if (!$) return;
        (Vo(!0), Rs($) || $.onDone?.({ outcome: $.outcome }));
      }),
      Rb(R.querySelector('[data-a="close"]'), () => {
        let $ = u?.opts;
        if (!$) return;
        (Vo(!1), $.onDone?.({ outcome: $.outcome }));
      }),
      requestAnimationFrame(() => R.classList.add("on")),
      G ? g.win() : g.lose());
  }
  // v160.7: tekrar basılabilen düğme (ses aç/kapa) — pointerup + click, aynı dokunuşta bir kez
  function hxTap(A, T) {
    let last = 0,
      G = (Be) => {
        Be.preventDefault?.(), Be.stopPropagation?.();
        let now = performance.now();
        if (now - last < 450) return;
        (last = now), T();
      };
    (A.addEventListener("click", G), A.addEventListener("pointerup", G));
  }
  // v156: düğme hem click hem pointerup ile çalışır (bazı WebView'larda click gelmiyordu); bir kez
  function Rb(A, T) {
    let ye = !1,
      G = (Be) => {
        (Be.preventDefault?.(), Be.stopPropagation?.(), ye || ((ye = !0), T()));
      };
    (A.addEventListener("click", G), A.addEventListener("pointerup", G));
  }
  function ri(A) {
    !u ||
      u.done ||
      ((u.done = !0),
      (u.cancelled = !0),
      u.timers.forEach((T) => T.rej(Ts)),
      u.tweens.forEach((T) => T.rej(Ts)),
      [s, ...u.figs].forEach((T) => T.hx?.rej?.(Ts)),
      (u.timers = []),
      (u.tweens = []),
      g.stopAll(),
      fi(),
      u.root.classList.add("ended"),
      n.classList.remove("hx-active"),
      (u.fade.style.transitionDuration = A ? "0.2s" : "0s"),
      u.fade.classList.add("on", "dim"),
      Jn());
  }
  function fi() {
    (u.figs.forEach((T) => T.dispose(e)),
      (u.figs = []),
      u.cars.forEach(we),
      (u.cars = []),
      u.parts.forEach((T) => {
        (e.remove(T.sp), T.sp.material.dispose());
      }),
      (u.parts = []),
      u.floats.forEach((T) => T.e.remove()),
      (u.floats = []),
      p &&
        ((p.g.visible = !1),
        p.vaultPivot && (p.vaultPivot.rotation.y = 0),
        p.goldL && (p.goldL.intensity = 0),
        p.belt && (p.belt.on = !0),
        (p.alarmL.intensity = 0)),
      s.setForcePose(null),
      (s.shakeUntil = 0),
      s.setAvatar(u.opts.crew[0].avatar));
    let A = b.W(0, b.sv(0.43));
    ((r.x = A.x),
      (r.z = A.z),
      (r.target = null),
      (r.path = null),
      (s.x = A.x),
      (s.z = A.z),
      (s.y = f(A.x, A.z)),
      (s.moving = !1),
      (s.group.visible = !0),
      (s.hx = null),
      (u.shot = null),
      (r.camYaw = b.door.out + 0.35),
      (r.camPitch = 0.2),
      (r.camDist = 7.5),
      (a.fov = 60),
      a.updateProjectionMatrix(),
      m());
  }
  function Vo(A) {
    u &&
      (u.done ||
        ((u.done = !0),
        (u.cancelled = !0),
        u.timers.forEach((T) => T.rej(Ts)),
        u.tweens.forEach((T) => T.rej(Ts)),
        [s, ...u.figs].forEach((T) => T.hx?.rej?.(Ts)),
        g.stopAll(),
        fi()),
      u.root.remove(),
      n.classList.remove("hx-active"),
      (u = null));
  }
  function Rs(A) {
    if (u || t.isBusy()) return !1;
    let T = Vc[A.target || "banka"];
    if (!T || ((b = L(T)), !b)) return !1;
    ((p = D(T, b)), g.unlock());
    let ye = A.crew.slice(0, 4);
    if (ye.length < T.sizes[0]) return !1;
    let G = zb(ye.length);
    ((u = {
      T,
      roles: G,
      opts: { reward: T.reward, outcome: "ok", ...A, target: T.key, crew: ye },
      t: 0,
      timers: [],
      tweens: [],
      figs: [],
      cars: [],
      parts: [],
      floats: [],
      npcs: [],
      npcByRole: {},
      A: {},
      camP: new xn(),
      camL: new xn(),
      camSnap: !0,
      shake: 0,
      clock: 60,
      clockOn: !1,
      loot: 0,
      lootShown: -1,
      dolly: 0,
      focus: null,
      shot: null,
    }),
      K(),
      ye.forEach(($, le) => (u.A[G[le]] = he(le === 0 ? "self" : `crew${le}`, $.name, $.avatar))),
      s.setAvatar(ye[0].avatar));
    let Be = Go[T.venue] || { npcs: [] },
      R = Object.fromEntries(Be.npcs.map(($) => [$.id, $])),
      ee =
        T.key === "casino"
          ? [
              { role: "cashier", name: "Kasiyer Fatma", av: R.npc_biletci?.av, x: 6.3, z: -6.45, fz: 1 },
              { role: "barmen", name: R.npc_barmen?.name, av: R.npc_barmen?.av, x: -1.6, z: -6.85, fz: 1 },
              { role: "dealer", name: "Krupiye", av: y9, x: -2.2, z: -4, fz: 1 },
              { role: "guard", name: "G\xFCvenlik", av: R.npc_gguv?.av, x: 2.2, z: 4.7, fz: 1 },
              { role: "slot", name: "M\xFC\u015Fteri", av: Ci(4.2), x: -7.5, z: 0, fx: -1 },
              { name: "M\xFC\u015Fteri", av: Ci(9.3), x: -7.5, z: -2.2, fx: -1 },
              { name: "M\xFC\u015Fteri", av: Ci(14.6), x: -7.5, z: 2.2, fx: -1 },
              { name: "M\xFC\u015Fteri", av: Ci(2.8), x: -3.5, z: -1.8, fz: -1 },
              { name: "M\xFC\u015Fteri", av: Ci(21.1), x: -0.55, z: -3.7, fx: -1 },
              { name: "M\xFC\u015Fteri", av: Ci(6.6), x: 3.2, z: -0.35, fz: -1 },
              { name: "M\xFC\u015Fteri", av: Ci(17.9), x: 2, z: -1.6, fx: 1 },
            ]
          : T.key === "silah"
            ? [
                { role: "dealer", name: R.npc_silahci?.name, av: R.npc_silahci?.av, x: -1, z: -4.7, fz: 1 },
                { name: "M\xFC\u015Fteri", av: Ci(3.3), x: -1, z: -2.9, fz: -1 },
                { name: "M\xFC\u015Fteri", av: Ci(13.2), x: -4, z: 2.1, fz: -1 },
                { name: "M\xFC\u015Fteri", av: Ci(19.4), x: 6.9, z: -4.4, fx: 1 },
              ]
            : T.key === "fabrika"
              ? [
                  {
                    role: "boss",
                    name: "Ustaba\u015F\u0131 Remzi",
                    av: {
                      gender: "erkek",
                      build: "iri",
                      skin: "#c68642",
                      hairStyle: "short",
                      hairColor: "#8a8a8a",
                      facialHair: "mustache",
                      clothing: "vest",
                      clothColor: "#3a4048",
                      neckAcc: "tie",
                      pantsColor: "#22262f",
                    },
                    x: 7.3,
                    z: -6.3,
                    fz: 1,
                  },
                  {
                    role: "worker",
                    name: "\u0130\u015F\xE7i",
                    av: {
                      gender: "erkek",
                      build: "iri",
                      skin: "#c68642",
                      hairStyle: "short",
                      hairColor: "#241813",
                      facialHair: "mustache",
                      clothing: "jumpsuit",
                      clothColor: "#3a4048",
                      pantsColor: "#22262f",
                      hat: "cap",
                      hatColor: "#c0392b",
                    },
                    x: -5.6,
                    z: -2.6,
                    fz: -1,
                  },
                  {
                    name: "\u0130\u015F\xE7i",
                    av: {
                      gender: "erkek",
                      build: "standart",
                      skin: "#e0ac69",
                      hairStyle: "short",
                      hairColor: "#2b2118",
                      clothing: "jumpsuit",
                      clothColor: "#1d3d5c",
                      pantsColor: "#1d3d5c",
                      hat: "helmet",
                      hatColor: "#e8b923",
                    },
                    x: -2.2,
                    z: -2.6,
                    fz: -1,
                  },
                  {
                    name: "\u0130\u015F\xE7i",
                    av: {
                      gender: "kadin",
                      build: "standart",
                      skin: "#8d5524",
                      hairStyle: "bun",
                      hairColor: "#0d0a08",
                      clothing: "jumpsuit",
                      clothColor: "#1d3d5c",
                      pantsColor: "#1d3d5c",
                      hat: "helmet",
                      hatColor: "#e8b923",
                    },
                    x: 1,
                    z: -2.6,
                    fz: -1,
                  },
                  {
                    name: "\u0130\u015F\xE7i",
                    av: {
                      gender: "erkek",
                      build: "zayif",
                      skin: "#c68863",
                      hairStyle: "curly",
                      hairColor: "#3b2a1a",
                      clothing: "jumpsuit",
                      clothColor: "#3a4048",
                      pantsColor: "#22262f",
                    },
                    x: -7.4,
                    z: -1,
                    fx: -1,
                  },
                  { role: "guard", name: "Bek\xE7i", av: Go.banka.npcs.find(($) => $.id === "npc_bguv")?.av, x: 2.2, z: 4.7, fz: 1 },
                ]
              : T.key === "netkafe"
                ? [
                    {
                      role: "cashier",
                      name: "Kafeci Selim",
                      av: {
                        gender: "erkek",
                        build: "standart",
                        skin: "#d9a066",
                        hairStyle: "undercut",
                        hairColor: "#2b2118",
                        facialHair: "goatee",
                        clothing: "hoodie",
                        clothColor: "#4a1d5c",
                        pantsColor: "#22262f",
                      },
                      x: 7.6,
                      z: -4.2,
                      fx: -1,
                    },
                    {
                      role: "gamer",
                      name: "Oyuncu",
                      av: { ...Ci(23.7), clothing: "hoodie", clothColor: "#1d5c3a" },
                      x: 1.5,
                      z: -0.25,
                      fz: -1,
                      sit: !0,
                    },
                    { name: "Oyuncu", av: Ci(7.2), x: -6.5, z: -5, fz: -1 },
                    { name: "Oyuncu", av: Ci(15.5), x: -2.5, z: -5, fz: -1 },
                    { name: "Oyuncu", av: Ci(28.1), x: -2.5, z: -0.3, fz: -1 },
                    { name: "M\xFC\u015Fteri", av: Ci(11.9), x: -7.4, z: 3.1, fx: -1 },
                  ]
                : T.key === "galeri"
                  ? [
                      { role: "dealer", name: R.npc_galerici?.name, av: R.npc_galerici?.av, x: 8, z: -1.2, fx: -1 },
                      { role: "buyer", name: "M\xFC\u015Fteri", av: Ci(5.4), x: -2.9, z: -1.5, fx: -1, fz: -1 },
                      { name: "M\xFC\u015Fteri", av: Ci(11.8), x: 1.5, z: -1.6, fx: 1, fz: -1 },
                      { name: "M\xFC\u015Fteri", av: Ci(8.1), x: -6, z: 1.8, fz: 1 },
                      {
                        name: "Sat\u0131\u015F Dan\u0131\u015Fman\u0131",
                        av: {
                          gender: "kadin",
                          build: "zayif",
                          skin: "#e0ac69",
                          hairStyle: "bun",
                          hairColor: "#3b2a1a",
                          clothing: "suit",
                          clothColor: "#2b3550",
                          neckAcc: "none",
                          pantsColor: "#22262f",
                        },
                        x: -1.6,
                        z: 2.2,
                        fx: -1,
                      },
                      { role: "guard", name: "G\xFCvenlik", av: Go.banka.npcs.find(($) => $.id === "npc_bguv")?.av, x: 2.2, z: 4.7, fz: 1 },
                    ]
                  : [
                      ...Be.npcs.filter(($) => $.id !== "npc_bguv").map(($) => ({ name: $.name, av: $.av, x: $.x, z: $.z, fz: 1 })),
                      { role: "guard", name: "G\xFCvenlik", av: R.npc_bguv?.av, x: 2.3, z: 4.9, fz: 1 },
                      { name: "M\xFC\u015Fteri", av: Ci(3.1), x: -0.5, z: -3.7, fz: 1 },
                      { name: "M\xFC\u015Fteri", av: Ci(7.7), x: 1, z: -2.3, fz: 1 },
                      { name: "M\xFC\u015Fteri", av: Ci(12.4), x: -5, z: 1.7, fz: 1 },
                    ];
    return (
      (u.npcs = ee.map(($, le) => {
        let ae = he(`npc${le}`, $.name, $.av, !0);
        return (
          me(ae, b.I($.x, 0, $.z), !0),
          Ie(ae, b.I($.x + ($.fx || 0) * 3, 0, $.z + ($.fz || 0) * 3)),
          (ae.group.visible = !1),
          $.role && (u.npcByRole[$.role] = ae),
          $.sit && ((ae.sitting = !0), (ae.seatY = Cb + 0.5), (ae.seatYaw = Math.atan2($.fx || 0, $.fz || 0))),
          ae
        );
      })),
      Xe().catch(($) => {
        $ !== Ts && (console.error($), u && !u.done && ri(!0));
      }),
      !0
    );
  }
  function Co(A, T) {
    let ye = Math.max(1, Math.floor(window.__hxSpeed || 1));
    for (let G = 0; G < ye; G++) Po(A, T);
  }
  function Po(A, T) {
    if (!(!u || u.done)) {
      ((A *= x9), (u.t += A), E.setFromMatrixColumn(a.matrixWorld, 0));
      for (let ye = u.timers.length - 1; ye >= 0; ye--) {
        let G = u.timers[ye];
        if (((G.t -= A), G.t <= 0 && (u.timers.splice(ye, 1), G.res(), !u || u.done))) return;
      }
      for (let ye = u.tweens.length - 1; ye >= 0; ye--) {
        let G = u.tweens[ye];
        G.t += A;
        let Be = Vh(G.t / G.dur, 0, 1);
        if ((G.fn(G.ease(Be)), Be >= 1 && (u.tweens.splice(ye, 1), G.res(), !u || u.done))) return;
      }
      if ((u.cars.forEach((ye) => ce(ye, A, u.t)), [s, ...u.figs].forEach((ye) => ye.hx && He(ye, A, T)), mt(A), u.focus)) {
        let ye = u.focus();
        ((r.x = ye.x), (r.z = ye.z));
      }
      if (u.clockOn) {
        let ye = Math.ceil(u.clock);
        u.clock = Math.max(0, u.clock - A * (u.alarm ? 1.6 : 1.15));
        let G = Math.ceil(u.clock);
        G !== ye &&
          ((u.clockEl.textContent = `00:${String(G).padStart(2, "0")}`),
          u.clockEl.parentElement.classList.toggle("hot", G <= 20 || !!u.alarm),
          u.alarm && g.tick());
      }
      (u.loot !== u.lootShown &&
        ((u.lootShown = u.loot), (u.lootEl.textContent = Ss(u.loot)), u.lootEl.parentElement.classList.toggle("on", u.loot > 0)),
        p && (p.alarmL.intensity = u.alarm && u.inside ? (Math.sin(u.t * 9) > 0 ? 34 : 4) : 0),
        p && u.inside && (p.k.ticks.forEach(({ ctl: ye }) => ye.tick?.(u.t, A, 0)), O(A)));
    }
  }
  function j(A, T) {
    u &&
      (u.done ||
        (u.figs.forEach((ye) => {
          if (!ye.group.visible) {
            ye.label.style.display = "none";
            return;
          }
          h(ye.label, ye.x, ye.y + u9 - p9 + 0.12, ye.z, A, T, 34);
        }),
        (u.floats = u.floats.filter((ye) => {
          let G = Vh(((performance.now() - ye.t0) / 2400) * Math.max(1, Math.floor(window.__hxSpeed || 1)), 0, 1);
          return (
            (ye.e.style.opacity = String(G < 0.1 ? G / 0.1 : G > 0.8 ? (1 - G) / 0.2 : 1)),
            h(ye.e, ye.wp.x, ye.wp.y + G * 0.45, ye.wp.z, A, T, 90),
            G >= 1 ? (ye.e.remove(), !1) : !0
          );
        }))));
  }
  return {
    get active() {
      return !!u;
    },
    start: Rs,
    stop: () => Vo(!1),
    step: Co,
    cam: Pe,
    render: j,
  };
}


// sahneler (prototip anahtarları: banka, casino, silah, fabrika, netkafe, galeri)
export const HEIST_SCENES = Vc;
export const heistRoles = zb;
export const HEIST_ROLE_LABEL = Yh;
export { k6 as createCityHeist };
