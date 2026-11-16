// =============================================================================
// PİST 2 (prototip) — yükseltili, köprülü "8" devre · şehir sürüşüyle AYNI his, DETERMİNİSTİK fizik
// (pistSim.js'ten bağımsız: o prototip aynen duruyor. Fark: pist yüksekliği + şehirdeki yokuş fiziği)
// =============================================================================
// Şehirdeki araba fiziği (src/components/City/cityEngine.js → stepDrive) buraya
// birebir taşındı; tek farklar:
//   • sabit adım (60 Hz) ve sadece + − × ÷ √ ile yazılmış trigonometri
//     (raceSim.js'teki dsin/dcos/dexp) → sunucu tuş kaydını oynatıp süreyi
//     KENDİSİ hesaplayabilir (eski yarıştaki hile koruması aynen korunur)
//   • yarış seviyesi (1-3) ve nitro (eski yarıştaki nitro değerlerinden)
//   • pist zemini: asfalt / kerb / çim / çakıl + bariyer (duvar)
//
// Birim: metre, m/s. Yön: ileri = (sin yaw, cos yaw) — şehir motoruyla aynı.
// Bu dosya istemcide ve sunucuda AYNEN çalışır (three.js'e bağımlı değil).
// =============================================================================
import { dsin, dcos, datan2, dexp, angDiff, carStats as raceCarStats } from './raceSim.js';
import { VEHICLE_CATALOG } from './catalogData.js';

export const FPS = 60;
export const DT = 1 / FPS;
export const MAX_FRAMES = FPS * 60 * 6;

// Girdi bitleri (eski yarışla aynı + el freni)
export const IN_L = 1;
export const IN_R = 2;
export const IN_G = 4;
export const IN_B = 8;
export const IN_N = 16;
export const IN_H = 32;

// --- Pist ölçüleri (m) --------------------------------------------------------
export const STEP = 2; // merkez çizgi örnek aralığı
export const HALF = 7; // asfalt yarı genişliği (pist 14 m)
export const KERB = 1.3; // kerb genişliği
export const BAR = 19; // merkez çizgiden bariyere (duvar) uzaklık
export const GRID_BACK = 16; // ilk grid kutusu çizginin kaç örnek (×2 m) gerisinde

// Merkez çizgi kontrol noktaları [x, z, yükseklik]. "8" şeklinde: güney döngüsü (ana düzlük)
// ve kuzey döngüsü (tepe) ortada KESİŞİR — ilk geçiş alttan, dönüş köprünün üstünden.
// Sıra: ana düzlük (batıya) → T1 sağ firkete → kuzeye yokuş → alt geçit → tırmanan S'ler →
// tepe firketesi → uzun sol "kaşık" → köprü (inişli) → hızlı 130R → şikan → son viraj → düzlük
const CP0 = [
  [40, -270, 0], [-60, -270, 0], [-165, -270, 0],
  [-200, -272, 0], [-219, -263, 0.2], [-224, -246, 0.5], [-214, -230, 0.8],
  [-190, -214, 1.1], [-175, -185, 1.2], [-172, -150, 1.2], [-150, -118, 1],
  [-112, -82, 0.5], [-55, -40, 0],
  [0, 0, 0],
  [45, 35, 1], [78, 72, 2.5],
  [90, 110, 4.5], [122, 140, 7], [130, 180, 9.5], [114, 216, 11.5], [124, 250, 13.5], [154, 264, 15],
  [178, 280, 16.5], [192, 296, 17.2], [192, 312, 17.6], [178, 322, 17.9], [158, 318, 18], [130, 304, 18],
  [80, 302, 18], [25, 292, 18], [-35, 302, 18], [-100, 296, 17.5],
  [-158, 278, 17], [-203, 242, 16], [-220, 192, 15], [-202, 142, 14],
  [-152, 96, 12.5], [-92, 55, 11], [-42, 26, 10.2],
  [0, 0, 10],
  [45, -30, 9], [92, -58, 7.5], [132, -96, 6], [152, -142, 4.5],
  [154, -170, 3],
  [156, -190, 2.4], [168, -205, 2], [178, -222, 1.6], [173, -241, 1.2],
  [155, -259, 0.6], [124, -270, 0.1],
];
export const PIST_SCALE = 1.0;

function buildTrack() {
  const CP = CP0.map((p) => [p[0] * PIST_SCALE, p[1] * PIST_SCALE, p[2]]);
  const n = CP.length;
  // kapalı Catmull-Rom (x, z, yükseklik) → yoğun nokta
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = CP[(i - 1 + n) % n];
    const p1 = CP[i];
    const p2 = CP[(i + 1) % n];
    const p3 = CP[(i + 2) % n];
    for (let s = 0; s < 60; s++) {
      const t = s / 60;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push([0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  dense.push(dense[0]);
  // yatayda eşit aralıklı (STEP) yeniden örnekle; yükseklik doğrusal
  const PT = [[dense[0][0], dense[0][1]]];
  const H = [dense[0][2]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let [ax, az, ah] = dense[i - 1];
    const [bx, bz, bh] = dense[i];
    let seg = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    while (acc + seg >= STEP) {
      const f = (STEP - acc) / seg;
      ax += (bx - ax) * f;
      az += (bz - az) * f;
      ah += (bh - ah) * f;
      PT.push([ax, az]);
      H.push(ah);
      seg = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      acc = 0;
    }
    acc += seg;
  }
  const last = PT[PT.length - 1];
  if (Math.sqrt((last[0] - PT[0][0]) ** 2 + (last[1] - PT[0][1]) ** 2) < STEP * 0.6) {
    PT.pop();
    H.pop();
  }
  const N = PT.length;
  // yükseklik yumuşatma (Catmull-Rom'un küçük dalgalanmalarını al)
  for (let pass = 0; pass < 3; pass++) {
    const h0 = H.slice();
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = -4; k <= 4; k++) sum += h0[(i + k + N) % N];
      H[i] = sum / 9;
    }
  }
  const TAN = [];
  const NRM = [];
  const ANG = [];
  const G = []; // eğim (yükseklik / yatay yol), ileri yönde
  for (let i = 0; i < N; i++) {
    const a = PT[(i - 1 + N) % N];
    const b = PT[(i + 1) % N];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const l = Math.sqrt(tx * tx + tz * tz);
    tx /= l;
    tz /= l;
    TAN.push([tx, tz]);
    NRM.push([tz, -tx]); // "sağ" normal
    ANG.push(datan2(tx, tz));
    G.push((H[(i + 2) % N] - H[(i - 2 + N) % N]) / (4 * STEP));
  }
  const CURV = [];
  for (let i = 0; i < N; i++) CURV.push(angDiff(ANG[(i + 5) % N], ANG[(i - 5 + N) % N]) / (10 * STEP));
  const KERBS = [];
  const GRAVEL = [];
  for (let i = 0; i < N; i++) {
    let mx = 0;
    let sg = 0;
    for (let k = -14; k <= 14; k++) {
      const c = CURV[(i + k + N) % N];
      if (Math.abs(c) > mx) {
        mx = Math.abs(c);
        sg = c;
      }
    }
    KERBS.push(Math.abs(CURV[i]) > 1 / 140 ? 1 : 0);
    // yaw artınca araç +normal tarafına döner → viraj dışı = −normal
    GRAVEL.push(mx > 1 / 75 ? (sg > 0 ? -1 : 1) : 0);
  }
  // köprü: altından başka bir pist bölümü geçen noktalar (yatayda yakın, en az 4 m aşağıda)
  const BRIDGE = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j += 1) {
      const di = Math.min(Math.abs(i - j), N - Math.abs(i - j));
      if (di < 40) continue;
      const dx = PT[i][0] - PT[j][0];
      const dz = PT[i][1] - PT[j][1];
      if (dx * dx + dz * dz < (BAR + 6) * (BAR + 6) && H[i] - H[j] > 4) {
        BRIDGE[i] = 1;
        break;
      }
    }
  }
  // bariyer uzaklığı (sağ = +normal, sol = −normal): sıkı virajların İÇİNDE duvar yaklaşır
  // (gerçek pistlerdeki gibi) — böylece dar firketeler mümkün olur, dış taraf hep geniş
  const BP = new Array(N).fill(BAR);
  const BM = new Array(N).fill(BAR);
  for (let i = 0; i < N; i++) {
    let mx = 0;
    let sg = 0;
    for (let k = -10; k <= 10; k++) {
      const c = CURV[(i + k + N) % N];
      if (Math.abs(c) > mx) {
        mx = Math.abs(c);
        sg = c;
      }
    }
    if (mx < 1e-6) continue;
    const inner = Math.max(HALF + KERB + 1, Math.min(BAR, 1 / mx - 3));
    if (sg > 0) BP[i] = inner; // +normal tarafına dönüyor → iç taraf +
    else BM[i] = inner;
  }
  for (const A of [BP, BM]) {
    // önce yakın çevredeki en dar değer (duvar virajdan önce yaklaşmaya başlasın), sonra yumuşat
    const a1 = A.slice();
    for (let i = 0; i < N; i++) {
      let m = a1[i];
      for (let k = -8; k <= 8; k++) m = Math.min(m, a1[(i + k + N) % N]);
      A[i] = m;
    }
    for (let pass = 0; pass < 8; pass++) {
      const a0 = A.slice();
      for (let i = 0; i < N; i++) A[i] = (a0[(i - 2 + N) % N] + a0[(i - 1 + N) % N] + a0[i] + a0[(i + 1) % N] + a0[(i + 2) % N]) / 5;
    }
  }
  // çakıl köprüde olmaz
  for (let i = 0; i < N; i++) if (BRIDGE[i]) GRAVEL[i] = 0;
  const START = 0;
  const S1 = Math.floor(N / 3);
  const S2 = Math.floor((2 * N) / 3);
  return { PT, H, G, N, TAN, NRM, ANG, CURV, KERBS, GRAVEL, BRIDGE, BP, BM, START, S1, S2, LEN: N * STEP };
}
export const PIST = buildTrack();

// --- Araçlar ------------------------------------------------------------------
// phys: şehirdeki değerler (vehicles.js) · L/Wd/wx: model ölçüleri (dingil mesafesi wx farkı)
const CARS = {
  1: { phys: { vmax: 17, acc: 4.2, grip: 7, steer: 0.55 }, L: 4.2, Wd: 1.42, wb: 2.95 },
  2: { phys: { vmax: 24, acc: 6.5, grip: 9, steer: 0.62 }, L: 3.95, Wd: 1.75, wb: 2.55 },
  3: { phys: { vmax: 26, acc: 6.2, grip: 8, steer: 0.5 }, L: 5.3, Wd: 2, wb: 3.45 },
  4: { phys: { vmax: 33, acc: 8, grip: 9.5, steer: 0.6 }, L: 4.25, Wd: 1.75, wb: 2.47 },
  5: { phys: { vmax: 36, acc: 8.6, grip: 10, steer: 0.58 }, L: 4.6, Wd: 1.82, wb: 2.78 },
  6: { phys: { vmax: 40, acc: 10, grip: 8, steer: 0.52 }, L: 4.95, Wd: 1.9, wb: 3.1 },
  7: { phys: { vmax: 45, acc: 11, grip: 10.5, steer: 0.56 }, L: 4.75, Wd: 1.92, wb: 2.94 },
  8: { phys: { vmax: 50, acc: 13, grip: 12, steer: 0.6 }, L: 4.5, Wd: 1.98, wb: 2.58 },
  9: { phys: { vmax: 52, acc: 13.5, grip: 12.5, steer: 0.6 }, L: 4.65, Wd: 2.02, wb: 2.84 },
  10: { phys: { vmax: 55, acc: 14, grip: 11, steer: 0.58 }, L: 4.45, Wd: 1.9, wb: 2.7 },
};
export const CAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Seviye çarpanları (1-3) — TEK yerden ayarlanır
export const LEVEL_MUL = {
  vmax: [1, 1.06, 1.12],
  acc: [1, 1.08, 1.16],
  grip: [1, 1.04, 1.08],
};

// Yarış değerleri. nitro: eski yarıştaki süre/güç (fiyat + seviye) şehir birimine uyarlanır.
export function pistStats(catalogId, level = 1, { nitro = true } = {}) {
  const id = CARS[Number(catalogId)] ? Number(catalogId) : 1;
  const lv = Math.max(1, Math.min(3, Math.round(Number(level) || 1)));
  const c = CARS[id];
  const old = raceCarStats(id, lv); // s, ncap, nacc, nvm
  return {
    catalogId: id,
    level: lv,
    name: VEHICLE_CATALOG[id]?.name || 'Araç',
    price: VEHICLE_CATALOG[id]?.price || 0,
    vmax: c.phys.vmax * LEVEL_MUL.vmax[lv - 1],
    acc: c.phys.acc * LEVEL_MUL.acc[lv - 1],
    grip: c.phys.grip * LEVEL_MUL.grip[lv - 1],
    steer: c.phys.steer,
    wb: c.wb,
    len: c.L + 0.2,
    halfW: c.Wd / 2,
    nitro: Boolean(nitro),
    ncap: old.ncap, // saniye
    nacc: 1 + (old.nacc - 1) * 0.6, // ivme çarpanı
    nvm: old.nvm, // azami hız çarpanı
  };
}

// --- Deterministik yardımcılar ---------------------------------------------------
// q^1.7 = q · √q · q^0.2 (q ∈ [0,1]); beşinci kök Newton ile
function pow17(q) {
  if (q <= 0) return 0;
  if (q >= 1) return q * Math.sqrt(q) * 1; // >1 durumunda çarpan zaten 0'a kırpılır
  let r = 1;
  for (let i = 0; i < 24; i++) {
    const r2 = r * r;
    const r4 = r2 * r2;
    r = r - (r4 * r - q) / (5 * r4);
  }
  return q * Math.sqrt(q) * r;
}
const wrapPi = (a) => {
  while (a > 3.141592653589793) a -= 6.283185307179586;
  while (a < -3.141592653589793) a += 6.283185307179586;
  return a;
};
const absv = (v) => (v < 0 ? -v : v);
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// --- Durum ---------------------------------------------------------------------
// back: başlangıç çizgisinin kaç örnek gerisinden (grid) başlansın
export function newState(back = GRID_BACK) {
  const T = PIST;
  const i = (T.START - back + T.N) % T.N;
  const p = T.PT[i];
  return { x: p[0], z: p[1], y: T.H[i], gp: 0, yaw: T.ANG[i], vx: 0, vz: 0, steer: 0, idx: i, prog: -back, nitro: 1, nos: 0, f: 0, hits: 0, lastHitF: -999, surf: 0, lat: 0, hit: 0, vF: 0, yawRate: 0, done: false };
}
export const SURF = { ASFALT: 0, KERB: 1, CIM: 2, CAKIL: 3 };

// Bir fizik adımı. finishProg: bu ilerlemeye (örnek) ulaşınca done=true (yarış için T.N).
export function stepCar(S, P, inp, finishProg = Infinity) {
  if (S.done) return S;
  const T = PIST;
  S.f += 1;
  S.hit = 0;
  const dt = DT;
  let thr = inp & IN_G || inp & IN_N ? 1 : inp & IN_B ? -1 : 0;
  const st = (inp & IN_R ? 1 : 0) - (inp & IN_L ? 1 : 0);
  const hand = Boolean(inp & IN_H);
  const nos = P.nitro && inp & IN_N && S.nitro > 0 && thr > 0 ? 1 : 0;
  S.nos = nos;
  // zemin (önceki adımın yanal konumundan)
  const al = absv(S.lat);
  const g = T.GRAVEL[S.idx];
  const surf = al <= HALF ? 0 : al <= HALF + KERB ? 1 : g !== 0 && sgn(S.lat) === g && al > HALF + KERB + 1.5 ? 3 : 2;
  S.surf = surf;
  // 1) direksiyon (şehirle aynı)
  let fx = dsin(S.yaw);
  let fz = dcos(S.yaw);
  const vF0 = S.vx * fx + S.vz * fz;
  S.steer += (-st - S.steer) * Math.min(1, dt * (st ? 3.6 : 6));
  const delta = (S.steer * P.steer) / (1 + absv(vF0) * 0.045);
  let yawRate = (vF0 * (dsin(delta) / dcos(delta))) / P.wb;
  if (hand && absv(vF0) > 3) yawRate *= 1.45;
  S.yaw = wrapPi(S.yaw + yawRate * dt);
  S.yawRate = yawRate;
  // 2) ileri / yan bileşen
  fx = dsin(S.yaw);
  fz = dcos(S.yaw);
  const sx = fz;
  const sz = -fx;
  let vF = S.vx * fx + S.vz * fz;
  let vL = S.vx * sx + S.vz * sz;
  const vmax = P.vmax * (nos ? P.nvm : 1);
  const A = P.acc * (nos ? P.nacc : 1);
  let acc = 0;
  if (thr > 0) {
    if (vF < -0.4) acc = 18;
    else acc = A * Math.max(0, 1 - pow17(Math.max(0, vF) / vmax));
  } else if (thr < 0) {
    if (vF > 0.4) acc = -20;
    else acc = vF > -P.vmax * 0.28 ? -P.acc * 0.55 : 0;
  }
  acc -= vF * 0.06;
  if (!thr) acc -= sgn(vF) * 2.4;
  if (hand) acc -= sgn(vF) * 7;
  // pist dışı: çim / çakıl yavaşlatır
  let gripK = 1;
  // (direnç hızla orantılı: en yavaş araç da çimden / çakıldan çıkabilir)
  if (surf === 2) {
    acc = acc * (acc > 0 ? 0.6 : 1) - vF * 0.7;
    gripK = 0.45;
  } else if (surf === 3) {
    acc = acc * (acc > 0 ? 0.4 : 1) - vF * 1.3;
    gripK = 0.6;
  }
  const before = vF;
  vF += acc * dt;
  if (!thr && sgn(vF) !== sgn(before)) vF = 0;
  const grip = hand ? 1.4 : Math.max(3.2, P.grip - absv(vF) * 0.09) * gripK;
  vL *= dexp(-grip * dt);
  S.vx = fx * vF + sx * vL;
  S.vz = fz * vF + sz * vL;
  // yokuş (şehirdeki gibi): yokuş yukarı yavaşlar, aşağı hızlanır
  if (S.gp && (thr || absv(vF) > 0.5)) {
    S.vx -= fx * 9.8 * S.gp * 0.3 * dt;
    S.vz -= fz * 9.8 * S.gp * 0.3 * dt;
  }
  if (nos) S.nitro = Math.max(0, S.nitro - dt / P.ncap);
  // 3) hareket
  S.x += S.vx * dt;
  S.z += S.vz * dt;
  // en yakın merkez nokta (dairesel pencere)
  let bi = S.idx;
  let bd = 1e18;
  for (let k = -8; k <= 24; k++) {
    const i = (S.idx + k + T.N) % T.N;
    const dx = T.PT[i][0] - S.x;
    const dz = T.PT[i][1] - S.z;
    const dd = dx * dx + dz * dz;
    if (dd < bd) {
      bd = dd;
      bi = i;
    }
  }
  let dIdx = bi - S.idx;
  if (dIdx > T.N / 2) dIdx -= T.N;
  if (dIdx < -T.N / 2) dIdx += T.N;
  S.prog += dIdx;
  S.idx = bi;
  const p = T.PT[bi];
  const n = T.NRM[bi];
  let l = (S.x - p[0]) * n[0] + (S.z - p[1]) * n[1];
  // 4) bariyer: aracın köşeleri duvara değiyor mu
  const rel = angDiff(S.yaw, T.ANG[bi]);
  const ext = P.halfW * absv(dcos(rel)) + (P.len / 2) * absv(dsin(rel));
  const lim = (l > 0 ? T.BP[bi] : T.BM[bi]) - ext;
  if (absv(l) > lim) {
    const s = sgn(l);
    const ex = l - s * lim;
    S.x -= n[0] * ex;
    S.z -= n[1] * ex;
    l = s * lim;
    const vn = S.vx * n[0] + S.vz * n[1];
    if (vn * s > 0) {
      const imp = absv(vn);
      S.vx -= n[0] * vn * 1.2;
      S.vz -= n[1] * vn * 1.2;
      const k = 1 - Math.min(0.45, imp / 40);
      S.vx *= k;
      S.vz *= k;
      S.yaw = wrapPi(S.yaw + angDiff(T.ANG[bi], S.yaw) * 0.12 * (absv(rel) < 1.6 ? 1 : 0));
      if (imp > 3) S.hit = imp * s;
      if (imp > 6 && S.f - S.lastHitF > 30) {
        S.hits += 1;
        S.lastHitF = S.f;
      }
    }
    const sc = 1 - 0.8 * dt;
    S.vx *= sc;
    S.vz *= sc;
  }
  S.lat = l;
  S.vF = vF;
  // yükseklik + araç yönündeki eğim (şehirdeki slopeOf gibi yumuşatılır, ±0,2)
  S.y = T.H[bi];
  let want = T.G[bi] * dcos(angDiff(S.yaw, T.ANG[bi]));
  if (want > 0.2) want = 0.2;
  if (want < -0.2) want = -0.2;
  S.gp += (want - S.gp) * Math.min(1, dt * 6);
  if (S.prog >= finishProg) S.done = true;
  return S;
}
export const framesToMs = (f) => Math.round((f * 1000) / FPS);

// Yarış: grid'den başla, tam bir tur sonra başlangıç çizgisini geç
export const RACE_FINISH = PIST.N;

// --- Tuş kaydı (RLE) + sunucu doğrulaması (raceSim ile aynı biçim) ---------------
export function createInputRecorder() {
  const runs = [];
  return {
    push(bits) {
      const b = bits & 63;
      const n = runs.length;
      if (n && runs[n - 2] === b && runs[n - 1] < 65535) runs[n - 1] += 1;
      else runs.push(b, 1);
    },
    runs,
  };
}
export function replayRun(catalogId, level, runs, opts = {}) {
  if (!Array.isArray(runs) || runs.length % 2 || runs.length > 40000) return { ok: false, reason: 'format' };
  const P = pistStats(catalogId, level, opts);
  const S = newState();
  let total = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const b = Number(runs[i]);
    const c = Number(runs[i + 1]);
    if (!Number.isInteger(b) || b < 0 || b > 63 || !Number.isInteger(c) || c < 1 || c > 65535) return { ok: false, reason: 'format' };
    total += c;
    if (total > MAX_FRAMES) return { ok: false, reason: 'long' };
    for (let k = 0; k < c; k++) {
      stepCar(S, P, b, RACE_FINISH);
      if (S.done) return { ok: true, frames: S.f, ms: framesToMs(S.f), hits: S.hits };
    }
  }
  return { ok: false, reason: 'unfinished', frames: S.f, prog: S.prog };
}
