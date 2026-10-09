// =============================================================================
// v78 — ZAMANA KARŞI YARIŞ: paylaşılan, DETERMİNİSTİK fizik motoru
// =============================================================================
// Bu dosya hem istemcide (src/components/RaceTrackScreen/TimeAttack*) hem de
// sunucuda (functions/index.js → raceHubAction) AYNEN çalışır.
//
//  • Yarış tamamen istemcide akar (lag yok): sabit adımlı (60 Hz) fizik.
//  • İstemci yarış bitince sadece tuş kaydını (RLE) gönderir; sunucu aynı
//    motorla yarışı baştan oynatır ve süreyi KENDİSİ hesaplar. Böylece
//    hızlandırılmış saat, sahte süre, duvar içinden geçme gibi hileler işe
//    yaramaz — süre = sunucunun hesapladığı kare sayısı / 60.
//  • Kasma/donma oyuncuyu cezalandırmaz: süre gerçek saat değil, fizik
//    adımı sayısıdır (donma sırasında yarış saati de durur).
//
// Determinizm: tarayıcılar (V8 / JavaScriptCore) Math.sin/cos/atan2/exp/log
// için son basamakta farklı sonuç verebilir; binlerce adımda bu fark
// büyür. Bu yüzden fizik SADECE + − × ÷ ve Math.sqrt (IEEE'de tam
// yuvarlanır) ile yazılmış kendi trigonometri fonksiyonlarımızı kullanır.
// Görsel efektler (kıvılcım, titreme) bu dosyada değildir.
// =============================================================================

import { VEHICLE_CATALOG } from './catalogData.js';

// --- Deterministik matematik --------------------------------------------------
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const SIN_C = (() => {
  // 1, -1/3!, 1/5!, ... (13 terim)
  const out = [];
  let f = 1;
  for (let n = 1; n <= 25; n += 2) {
    if (n > 1) f = f * (n - 1) * n;
    out.push((out.length % 2 ? -1 : 1) / f);
  }
  return out;
})();
export function dsin(x) {
  let r = x - Math.round(x / TWO_PI) * TWO_PI; // [-π, π]
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  let s = SIN_C[SIN_C.length - 1];
  for (let i = SIN_C.length - 2; i >= 0; i--) s = s * r2 + SIN_C[i];
  return s * r;
}
export function dcos(x) {
  return dsin(x + HALF_PI);
}
function datanUnit(z) {
  // |z| <= 1
  let off = 0;
  let w = z;
  if (w > 0.4142135623730951) {
    off = PI / 4;
    w = (w - 1) / (w + 1);
  } else if (w < -0.4142135623730951) {
    off = -PI / 4;
    w = (w + 1) / (w - 1);
  }
  const w2 = w * w;
  let s = 0;
  for (let n = 41; n >= 1; n -= 2) s = s * w2 + (((n - 1) / 2) % 2 ? -1 : 1) / n;
  return off + s * w;
}
export function datan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a = ay <= ax ? datanUnit(ay / ax) : HALF_PI - datanUnit(ax / ay);
  if (x < 0) a = PI - a;
  return y < 0 ? -a : a;
}
export function dexp(x) {
  // küçük |x| için seri (fizikte sadece −0,3…0 aralığı kullanılır)
  let s = 1;
  let t = 1;
  for (let n = 1; n <= 24; n++) {
    t = (t * x) / n;
    s += t;
  }
  return s;
}
const dlen = (x, y) => Math.sqrt(x * x + y * y);
export function angDiff(a, b) {
  let d = a - b;
  while (d > PI) d -= TWO_PI;
  while (d < -PI) d += TWO_PI;
  return d;
}

// --- Sabitler -----------------------------------------------------------------
export const FPS = 60;
export const DT = 1 / FPS;
export const ROAD = 240;
export const HALF = ROAD / 2;
export const STEP = 20;
export const TS = 1.6;
export const KMH = 0.6; // HUD km/h çarpanı
export const MAX_RACE_FRAMES = FPS * 60 * 6; // 6 dk üstü yarış geçersiz
export const VEHICLE_MAX_LEVEL = 3;

// Girdi bitleri
export const IN_L = 1;
export const IN_R = 2;
export const IN_G = 4;
export const IN_B = 8;
export const IN_N = 16;

// --- Pist ---------------------------------------------------------------------
const CP0 = [[0, 300], [0, -200], [0, -700], [200, -1100], [600, -1300], [1000, -1250], [1250, -950], [1250, -550], [1000, -300], [650, -300], [450, -50], [500, 350], [800, 600], [1200, 650], [1550, 450], [1850, 500], [2100, 800], [2100, 1250], [1800, 1550], [1300, 1600], [900, 1450], [500, 1500], [200, 1800]];

function buildTrack() {
  const CP = CP0.map((p) => [p[0] * TS, p[1] * TS]);
  const dense = [];
  for (let i = 0; i < CP.length - 1; i++) {
    const p0 = CP[Math.max(i - 1, 0)];
    const p1 = CP[i];
    const p2 = CP[i + 1];
    const p3 = CP[Math.min(i + 2, CP.length - 1)];
    for (let s = 0; s < 40; s++) {
      const t = s / 40;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  dense.push(CP[CP.length - 1]);
  const PT = [dense[0]];
  let d = 0;
  let last = dense[0];
  for (let i = 1; i < dense.length; i++) {
    const p = dense[i];
    let dx = p[0] - last[0];
    let dy = p[1] - last[1];
    let sl = dlen(dx, dy);
    while (d + sl >= STEP) {
      const f = (STEP - d) / sl;
      const nx = last[0] + dx * f;
      const ny = last[1] + dy * f;
      PT.push([nx, ny]);
      last = [nx, ny];
      dx = p[0] - nx;
      dy = p[1] - ny;
      sl = dlen(dx, dy);
      d = 0;
    }
    d += sl;
    last = p;
  }
  const N = PT.length;
  const TAN = [];
  const NRM = [];
  const ANG = [];
  const LE = [];
  const RE = [];
  for (let i = 0; i < N; i++) {
    const a = PT[Math.max(0, i - 1)];
    const b = PT[Math.min(N - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = dlen(tx, ty);
    tx /= l;
    ty /= l;
    TAN.push([tx, ty]);
    NRM.push([ty, -tx]);
    ANG.push(datan2(tx, -ty));
    LE.push([PT[i][0] + ty * HALF, PT[i][1] - tx * HALF]);
    RE.push([PT[i][0] - ty * HALF, PT[i][1] + tx * HALF]);
  }
  const START = 4;
  const LINE0 = 16;
  const FIN = N - 8;
  const PADS = [0.2, 0.4, 0.6, 0.8].map((f) => Math.floor(N * f));
  return { PT, N, TAN, NRM, ANG, LE, RE, START, LINE0, FIN, PADS, FINLEN: (FIN - START) * STEP };
}
export const TRACK = buildTrack();

// --- Araçlar ------------------------------------------------------------------
// Galerideki 10 aracın yarış (üstten görünüm) tasarımı — tip/renk orijinale
// yakın. Fiyat oranı (t) Math.log yerine sabit tablo (determinizm).
export const RACE_CAR_LOOKS = {
  1: { type: 'vint', col: '#1c1c21', L: 62, W: 30, seat: '#8b4513' },
  2: { type: 'hatch', col: '#f7a430', L: 56, W: 31 },
  3: { type: 'truck', col: '#6b1228', L: 76, W: 35 },
  4: { type: 'coupe', col: '#f2a22e', L: 62, W: 31, st: ['#ffffff'] },
  5: { type: 'sedan', col: '#0a45b8', L: 68, W: 33, st: ['#1a6bff'] },
  6: { type: 'muscle', col: '#141414', L: 72, W: 35, st: ['#e8e8e8'] },
  7: { type: 'gt', col: '#c9ccd1', L: 70, W: 34 },
  8: { type: 'super', col: '#e4e6e4', L: 70, W: 35, wing: 1, st: ['#111111'] },
  9: { type: 'race', col: '#ececec', L: 72, W: 37, wing: 1, st: ['#4fb3e8', '#0b0b5e', '#c40000'] },
  10: { type: 'conv', col: '#3d3f96', L: 66, W: 33 },
};
// ln(fiyat/3000) / ln(1.000.000/3000)
const PRICE_T = { 1: 0, 2: 0.2073, 3: 0.365, 4: 0.4843, 5: 0.6036, 6: 0.7614, 7: 0.8423, 8: 0.9121, 9: 0.9616, 10: 1 };

// Araç seviyesi (1-3). Eski sistemde yapılmış vites/depo geliştirmeleri
// seviyeye sayılır (her biri aynı malzemeyle yapılan 1 geliştirmeydi).
export function vehicleRaceLevel(v) {
  if (!v) return 1;
  const lv = Number(v.raceLevel);
  if (Number.isInteger(lv) && lv >= 1) return Math.min(VEHICLE_MAX_LEVEL, lv);
  return Math.min(VEHICLE_MAX_LEVEL, 1 + (v.gearUpgraded ? 1 : 0) + (v.tankUpgraded ? 1 : 0));
}

// Fiyat + seviye → yarış değerleri. En ucuz araç seviye 1: 230 (örnekteki
// en ucuz araç), en pahalı araç seviye 3: 560 (oyunun tavanı).
export function carStats(catalogId, level = 1) {
  const id = Number(catalogId);
  const t = PRICE_T[id] ?? 0;
  const lv = Math.max(1, Math.min(VEHICLE_MAX_LEVEL, Math.round(Number(level) || 1)));
  const s = 0.82 * t + 0.09 * (lv - 1);
  const acc = Math.min(100, 22 + 78 * s);
  const ncap = 2 + 6.5 * s;
  const nacc = 1.5 + 0.95 * s;
  const grip = 5.5 + 3 * s;
  const look = RACE_CAR_LOOKS[id] || RACE_CAR_LOOKS[1];
  return {
    catalogId: id,
    level: lv,
    name: VEHICLE_CATALOG[id]?.name || 'Araç',
    price: VEHICLE_CATALOG[id]?.price || 0,
    s,
    vmax: 230 + 330 * s,
    acc,
    a0: 40 + acc * 0.6,
    ncap,
    nacc,
    nvm: 1.08 + 0.13 * s,
    grip,
    gripK: dexp(-grip * DT),
    gripKBrake: dexp(-grip * 0.55 * DT),
    turn: 2.4 + 0.4 * s,
    ...look,
  };
}
// Gösterge çubukları (0-100): HIZ / İVME / NİTRO
export function statBars(st) {
  const clamp = (v) => Math.max(4, Math.min(100, Math.round(v)));
  return {
    speed: clamp((st.vmax - 200) / 3.6),
    accel: clamp(st.acc),
    nitro: clamp(((st.ncap * st.nacc) / 20.8) * 100),
    kmh: Math.round(st.vmax * KMH),
    nitroSec: Math.round(st.ncap * 10) / 10,
  };
}

// --- Fizik --------------------------------------------------------------------
export function newCarState() {
  const p = TRACK.PT[TRACK.START];
  return { x: p[0], y: p[1], vx: 0, vy: 0, a: TRACK.ANG[TRACK.START], steer: 0, idx: TRACK.START, nitro: 1, nos: 0, pads: 0, hits: 0, lastHitF: -999, f: 0, done: false, lat: 0, hit: 0 };
}

// Tek fizik adımı (DT). inp: girdi bitleri; bot için steerIn (−1…1) verilebilir.
// Durum yerinde güncellenir. Dönüş: aynı nesne.
export function stepCar(S, st, inp, steerIn = null) {
  if (S.done) return S;
  const T = TRACK;
  S.f += 1;
  S.hit = 0;
  let fx = dsin(S.a);
  let fy = -dcos(S.a);
  const fwd0 = S.vx * fx + S.vy * fy;
  const nos = inp & IN_N && S.nitro > 0 ? 1 : 0;
  S.nos = nos;
  const target = steerIn != null ? steerIn : (inp & IN_R ? 1 : 0) - (inp & IN_L ? 1 : 0);
  S.steer += (target - S.steer) * Math.min(1, 8 * DT);
  const af = Math.abs(fwd0);
  S.a += ((((S.steer * st.turn * Math.min(1, af / 100)) / (1 + af / 520)) * (nos ? 0.88 : 1) * (fwd0 < 0 ? -1 : 1)) * DT);
  fx = dsin(S.a);
  fy = -dcos(S.a);
  const rx = dcos(S.a);
  const ry = dsin(S.a);
  let fwd = S.vx * fx + S.vy * fy;
  let lat = S.vx * rx + S.vy * ry;
  const thr = inp & IN_G || nos;
  const vm = st.vmax * (nos ? st.nvm : 1);
  const brake = inp & IN_B;
  if (thr) {
    const q = Math.max(fwd, 0) / vm;
    fwd += st.a0 * (nos ? st.nacc : 1) * Math.max(0, 1 - q * q) * DT;
  }
  if (brake) fwd = fwd > 0 ? Math.max(0, fwd - 240 * DT) : Math.max(-100, fwd - 120 * DT);
  else if (!thr) {
    const d = (24 + Math.abs(fwd) * 0.12) * DT;
    fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), d);
  }
  if (fwd > vm) fwd -= (fwd - vm) * 1.5 * DT;
  lat *= brake && fwd > 120 ? st.gripKBrake : st.gripK;
  if (nos) S.nitro = Math.max(0, S.nitro - DT / st.ncap);
  S.vx = fx * fwd + rx * lat;
  S.vy = fy * fwd + ry * lat;
  S.x += S.vx * DT;
  S.y += S.vy * DT;
  // en yakın pist noktası
  let bi = S.idx;
  let bd = 1e18;
  const lo = Math.max(0, S.idx - 10);
  const hi = Math.min(T.N - 1, S.idx + 30);
  for (let i = lo; i <= hi; i++) {
    const dx = T.PT[i][0] - S.x;
    const dy = T.PT[i][1] - S.y;
    const dd = dx * dx + dy * dy;
    if (dd < bd) {
      bd = dd;
      bi = i;
    }
  }
  S.idx = bi;
  const p = T.PT[bi];
  const n = T.NRM[bi];
  const l = (S.x - p[0]) * n[0] + (S.y - p[1]) * n[1];
  S.lat = l;
  const lim = HALF - st.W / 2 - 2;
  if (Math.abs(l) > lim - 1) {
    const s = Math.sign(l);
    if (Math.abs(l) > lim) {
      const ex = l - s * lim;
      S.x -= n[0] * ex;
      S.y -= n[1] * ex;
    }
    const vn = S.vx * n[0] + S.vy * n[1];
    if (vn * s > 0) {
      const imp = Math.abs(vn);
      S.vx -= n[0] * vn * 1.15;
      S.vy -= n[1] * vn * 1.15;
      const k = 1 - Math.min(0.5, imp / 640);
      S.vx *= k;
      S.vy *= k;
      S.a += angDiff(T.ANG[bi], S.a) * 0.1;
      if (imp > 50) S.hit = imp * s; // görsel: kıvılcım + sarsıntı
      if (imp > 90 && S.f - S.lastHitF > 30) {
        S.hits += 1;
        S.lastHitF = S.f;
      }
    }
    const sc = 1 - 0.8 * DT;
    S.vx *= sc;
    S.vy *= sc;
  }
  // nitro pedleri (+%30)
  for (let k = 0; k < T.PADS.length; k++) {
    const bit = 1 << k;
    if (!(S.pads & bit) && Math.abs(S.idx - T.PADS[k]) <= 3 && Math.abs(l) < 55) {
      S.pads |= bit;
      S.nitro = Math.min(1, S.nitro + 0.3);
      S.padHit = S.f;
    }
  }
  if (S.idx >= T.FIN) S.done = true;
  return S;
}
export const framesToMs = (f) => Math.round((f * 1000) / FPS);

// --- Tuş kaydı (RLE) -------------------------------------------------------------
export function createInputRecorder() {
  const runs = [];
  return {
    push(bits) {
      const b = bits & 31;
      const n = runs.length;
      if (n && runs[n - 2] === b && runs[n - 1] < 65535) runs[n - 1] += 1;
      else runs.push(b, 1);
    },
    runs,
  };
}

// Sunucu: tuş kaydını oynat → { ok, frames, ms, hits } (bitmezse ok:false)
export function replayRun(catalogId, level, runs) {
  if (!Array.isArray(runs) || runs.length % 2 || runs.length > 40000) return { ok: false, reason: 'format' };
  const st = carStats(catalogId, level);
  const S = newCarState();
  let total = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const b = Number(runs[i]);
    const c = Number(runs[i + 1]);
    if (!Number.isInteger(b) || b < 0 || b > 31 || !Number.isInteger(c) || c < 1 || c > 65535) return { ok: false, reason: 'format' };
    total += c;
    if (total > MAX_RACE_FRAMES) return { ok: false, reason: 'long' };
    for (let k = 0; k < c; k++) {
      stepCar(S, st, b);
      if (S.done) return { ok: true, frames: S.f, ms: framesToMs(S.f), hits: S.hits };
    }
  }
  return { ok: false, reason: 'unfinished', frames: S.f, idx: S.idx };
}

// --- Bot (antrenman rakibi) -------------------------------------------------------
// Merkez çizgiyi ileriye bakarak takip eder, virajda yavaşlar, düzlükte nitro.
// skill: 1 = çok iyi sürücü; antrenman botu < 1.
export function botInput(S, st, skill = 0.9) {
  const T = TRACK;
  const sp = dlen(S.vx, S.vy);
  const la = Math.min(T.N - 1, S.idx + 3 + Math.floor(sp / 55));
  const tp = T.PT[la];
  const want = datan2(tp[0] - S.x, -(tp[1] - S.y));
  const err = angDiff(want, S.a);
  const steer = Math.max(-1, Math.min(1, err * 3.2));
  // ilerideki toplam dönüş → hedef hız
  const far = Math.min(T.N - 1, S.idx + 6 + Math.floor(sp / 30));
  let curv = 0;
  for (let i = S.idx; i < far; i += 2) curv = Math.max(curv, Math.abs(angDiff(T.ANG[Math.min(T.N - 1, i + 6)], T.ANG[i])));
  const vt = st.vmax * skill * Math.max(0.42, 1.12 - curv * 1.05);
  const fwd = S.vx * dsin(S.a) - S.vy * dcos(S.a);
  let bits = 0;
  if (fwd < vt) bits |= IN_G;
  else if (fwd > vt + 45) bits |= IN_B;
  if (curv < 0.22 && S.nitro > 0 && fwd > st.vmax * 0.55 * skill) bits |= IN_N;
  return { bits, steer };
}
// Bot yarışını baştan sona simüle et. every: kaç karede bir örnek alınsın
export function simulateBot(catalogId, level = 1, skill = 0.9, every = 0) {
  const st = carStats(catalogId, level);
  const S = newCarState();
  const samples = [];
  while (!S.done && S.f < MAX_RACE_FRAMES) {
    const { bits, steer } = botInput(S, st, skill);
    stepCar(S, st, bits, steer);
    if (every && S.f % every === 0) samples.push([S.f, S.x, S.y, S.a, S.nos]);
  }
  return { frames: S.f, ms: framesToMs(S.f), done: S.done, hits: S.hits, samples };
}

// Antrenman seviyesi N → bot N. galeri aracıyla (seviye 1). İlk seviyelerde
// bot biraz daha yavaş sürer (yeni oyuncu öğrensin), 10. seviyede en iyisi.
export function trainingBot(level) {
  const lv = Math.max(1, Math.min(10, Math.round(Number(level) || 1)));
  return { catalogId: lv, level: 1, skill: 0.82 + 0.008 * (lv - 1) };
}
const botCache = new Map();
export function trainingBotRun(level, every = 0) {
  const key = `${level}_${every}`;
  if (!botCache.has(key)) {
    const b = trainingBot(level);
    botCache.set(key, { ...b, ...simulateBot(b.catalogId, b.level, b.skill, every) });
  }
  return botCache.get(key);
}

// Not: S/A/B/C notu (sadece gösterim) — çok iyi bir sürücünün süresine göre
const parCache = new Map();
export function gradeOf(ms, catalogId, level) {
  const k = `${catalogId}_${level}`;
  if (!parCache.has(k)) parCache.set(k, simulateBot(catalogId, level, 1).ms);
  const par = parCache.get(k) * 1.04;
  const r = ms / par;
  return r <= 1 ? 'S' : r <= 1.1 ? 'A' : r <= 1.25 ? 'B' : 'C';
}
