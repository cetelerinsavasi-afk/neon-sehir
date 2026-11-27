// =============================================================================
// v219 — NEON ŞEHİR PİSTİ (şehrin dışında, doğu): pistin geometrisi (three.js yok).
// Neon Petrol'den (O-77 gidiş) ayrılan pist yolu → Pist Girişi · Festival alanı → ana tribün.
// Pist bir yol üstü cebi (roadside 'pist' / 'pistgiris') olarak kurulur (roadside.js → world/pist.js).
// Harita (map.js) da buradan çizer. Prototipten (harita_duzeni5) aktarıldı.
//   PIST_AREAS   iki alan (pist, pist girişi) — roadsideGeo bunları cep (pad) olarak ekler
//   PIST_ROAD    Neon Petrol → pist girişi bağlantı yolu (kontrol noktaları)
//   TRACK        pist orta çizgisi (2 m aralıklı), tAt(i, lat) → [x, z]
//   PIST_SPOTS   hızlı ışınlanma noktaları (giriş, festival, tribün, pit, start)
//   inPistArea   oyuncu pist bölgesinde mi? ("🏁 Yarış Pisti" düğmesi)
// =============================================================================
export const PIST_PLAN = { show: false, name: 'Neon Şehir Pisti' }; // eski v160 taslağı kalktı (geriye uyum)

export function catmullLoop(e, t = 2) {
  let n = e.length,
    r = [],
    i = [];
  for (let a = 0; a < n; a++) {
    let o = e[(a - 1 + n) % n],
      s = e[a],
      c = e[(a + 1) % n],
      l = e[(a + 2) % n],
      u = Math.max(4, Math.round(Math.hypot(c[0] - s[0], c[1] - s[1]) / t));
    for (let e = 0; e < u; e++) {
      let t = e / u,
        n = t * t,
        d = n * t,
        f = (e, r, i, a) => 0.5 * (2 * r + (-e + i) * t + (2 * e - 5 * r + 4 * i - a) * n + (-e + 3 * r - 3 * i + a) * d);
      (r.push([f(o[0], s[0], c[0], l[0]), f(o[1], s[1], c[1], l[1])]), i.push(a));
    }
  }
  return { pts: r, seg: i };
}
export function trackFrames(e) {
  let t = e.length,
    n = 0;
  for (let r = 0; r < t; r++) {
    let i = e[r],
      a = e[(r + 1) % t];
    n += i[0] * a[1] - a[0] * i[1];
  }
  let r = n > 0 ? -1 : 1,
    i = [],
    a = [],
    o = [0];
  for (let n = 0; n < t; n++) {
    let a = e[(n - 1 + t) % t],
      s = e[(n + 1) % t],
      c = s[0] - a[0],
      l = s[1] - a[1],
      u = Math.hypot(c, l) || 1;
    (i.push([(-l / u) * r, (c / u) * r]), n && o.push(o[n - 1] + Math.hypot(e[n][0] - e[n - 1][0], e[n][1] - e[n - 1][1])));
  }
  for (let n = 0; n < t; n++) {
    let r = e[(n - 3 + t) % t],
      i = e[n],
      o = e[(n + 3) % t],
      s = i[0] - r[0],
      c = i[1] - r[1],
      l = o[0] - i[0],
      u = o[1] - i[1],
      d = s * u - c * l,
      f = Math.hypot(s, c) * Math.hypot(l, u) * Math.hypot(o[0] - r[0], o[1] - r[1]);
    a.push(f ? (2 * d) / f : 0);
  }
  return { nrm: i, curv: a, len: o, out: r };
}
export function distToTrack(e, t) {
  let n = 1 / 0,
    r = Math.floor(e / 16),
    i = Math.floor(t / 16);
  for (let a = -1; a <= 1; a++)
    for (let o = -1; o <= 1; o++) {
      let s = TRACK_HASH.get(`${r + a},${i + o}`);
      if (s) for (let r of s) n = Math.min(n, (TRACK.pts[r][0] - e) ** 2 + (TRACK.pts[r][1] - t) ** 2);
    }
  return Math.sqrt(n);
}
export function distToLine(e, t, n) {
  let r = 1 / 0;
  for (let i = 0; i < e.length - 1; i++) {
    let [a, o] = e[i],
      s = e[i + 1][0] - a,
      c = e[i + 1][1] - o,
      l = Math.max(0, Math.min(1, ((t - a) * s + (n - o) * c) / (s * s + c * c || 1)));
    r = Math.min(r, Math.hypot(t - a - s * l, n - o - c * l));
  }
  return r;
}
export function pistOffAsphalt(e, t) {
  return !(
    e < PIST_AREA.x0 ||
    e > PIST_AREA.x1 ||
    t < PIST_AREA.z0 ||
    t > PIST_AREA.z1 ||
    distToTrack(e, t) <= 8.6 ||
    distToLine(PIT_LANE.lane, e, t) <= 5.8 ||
    distToLine(PIT_LANE.pin, e, t) <= 4.2 ||
    distToLine(PIT_LANE.pout, e, t) <= 4.2 ||
    distToLine(SERVICE_ROAD, e, t) <= 4.6
  );
}
export function inPistArea(e, t) {
  if (PIST_AREAS.some((n) => e >= n.x0 && e <= n.x1 && t >= n.z0 && t <= n.z1)) return !0;
  for (let n = 0; n < PIST_ROAD.length - 1; n++) {
    let [r, i] = PIST_ROAD[n],
      a = PIST_ROAD[n + 1][0] - r,
      o = PIST_ROAD[n + 1][1] - i,
      s = Math.max(0, Math.min(1, ((e - r) * a + (t - i) * o) / (a * a + o * o)));
    if (Math.hypot(e - r - a * s, t - i - o * s) < 6) return !0;
  }
  return !1;
}
export function pistMapGeom() {
  let e = TRACK.N,
    t = [];
  for (let n = 0; n < e; n++) {
    let r = (n + 1) % e;
    t.push({ ground: [tAt(n, 17), tAt(r, 17), tAt(r, -15), tAt(n, -15)], asphalt: [tAt(n, 7), tAt(r, 7), tAt(r, -7), tAt(n, -7)], bridge: !1 });
  }
  let n = (e, t, n, r) => {
      let i = [],
        a = [];
      for (let o = e; o <= t; o++) (i.push(tAt(o, n)), a.push(tAt(o, r)));
      return i.concat(a.reverse());
    },
    r = STANDS[0];
  return {
    segs: t,
    startLine: [tAt(START_I, -7), tAt(START_I, 7)],
    stands: n(r.i0, r.i1, r.o0, r.o1),
    pits: n(PIT.i0 + 8, PIT.i1 - 8, PIT.b0, PIT.b1),
    park: [
      [PIST_PARK.x0, PIST_PARK.z0],
      [PIST_PARK.x1, PIST_PARK.z0],
      [PIST_PARK.x1, PIST_PARK.z1],
      [PIST_PARK.x0, PIST_PARK.z1],
    ],
    ring: null,
    service: SERVICE_ROAD,
    road: PIST_ROAD,
    poi: { x: 680, z: -60 },
    label: { x: 680, z: -90 },
  };
}
export let PIST_NAME,
  PIST_AREAS,
  PIST_ROAD,
  CTRL0,
  CTRL,
  TRACK,
  tAt,
  segIdx,
  START_I,
  PIT,
  STANDS,
  STANDS_X,
  PIST_PARK,
  FESTIVAL,
  STAGE,
  CAR_GATE,
  FOOT_GATE,
  SERVICE_END,
  SERVICE_ROAD,
  PIT_LANE,
  TRACK_HASH,
  PIST_AREA,
  PIST_SPOTS;

    ((PIST_NAME = `Neon Şehir Pisti`),
      (PIST_AREAS = [
        { key: `pist`, kind: `pist`, name: PIST_NAME, glyph: `flag`, x0: 472, x1: 885, z0: -197, z1: 99, round: 70, roundT: 14 },
        { key: `pist_giris`, kind: `pistgiris`, name: `Pist Girişi · Festival`, glyph: `flag`, x0: 478, x1: 690, z0: -252, z1: -197, roundT: 18 },
      ]),
      (PIST_ROAD = [
        [459.8, -205.5],
        [462.8, -202.3],
        [466.3, -200.9],
        [470.6, -202.4],
        [475.6, -205.6],
        [481, -207.9],
      ]),
      (CTRL0 = [
        [525, -160],
        [610, -161],
        [700, -160],
        [755, -157],
        [788, -138],
        [797, -104],
        [777, -76],
        [794, -46],
        [771, -18],
        [789, 12],
        [785, 40],
        [764, 58],
        [740, 50],
        [737, 24],
        [716, -4],
        [660, -18],
        [585, -20],
        [548, -6],
        [528, 22],
        [500, 46],
        [470, 44],
        [454, 18],
        [468, -14],
        [494, -40],
        [470, -70],
        [474, -108],
        [496, -146],
      ]),
      (CTRL = CTRL0.map(([e, t]) => [515 + (e - 454) * 0.95, t])),
      (TRACK = (() => {
        let { pts: e, seg: t } = catmullLoop(CTRL, 2),
          n = trackFrames(e),
          r = e.length;
        return { pts: e, seg: t, N: r, ...n, total: n.len[r - 1] + Math.hypot(e[0][0] - e[r - 1][0], e[0][1] - e[r - 1][1]) };
      })()),
      (tAt = (e, t = 0) => {
        let n = ((e % TRACK.N) + TRACK.N) % TRACK.N,
          r = TRACK.pts[n],
          i = TRACK.nrm[n];
        return [r[0] + i[0] * t, r[1] + i[1] * t];
      }),
      (segIdx = (e, t = 0) => {
        let n = TRACK.seg.indexOf(e),
          r = n;
        for (; TRACK.seg[r + 1] === e;) r++;
        return Math.round(n + (r - n) * t);
      }),
      (START_I = segIdx(1, 0.1)),
      (PIT = { i0: segIdx(0, 0.25), i1: segIdx(2, 0.65), lane: -21, b0: -27, b1: -41 }),
      (STANDS = [
        { name: `ANA TRİBÜN`, i0: segIdx(0, 0.35), i1: segIdx(2, 0.7), o0: 11, o1: 25, rows: 8 },
        { name: `T1 TRİBÜNÜ`, i0: segIdx(3, 0.45), i1: segIdx(5, 0.15), o0: 20, o1: 27, rows: 4 },
        { name: `SAÇ TOKASI`, i0: segIdx(10, 0.3), i1: segIdx(12, 0.3), o0: 18, o1: 27, rows: 5 },
      ]),
      (STANDS_X = [
        { name: `S TRİBÜNÜ`, x: 867, z: -30, w: 12, d: 100, face: -1 },
        { name: `ŞİKAN TRİBÜNÜ`, x: 499, z: -62, w: 11, d: 84, face: 1 },
      ]),
      (PIST_PARK = { x0: 488, x1: 566, z0: -248, z1: -216 }),
      (FESTIVAL = { x0: 572, x1: 684, z0: -224, z1: -200 }),
      (STAGE = { x: 622, z: -240, w: 34, d: 14 }),
      (CAR_GATE = { x: 506, z: -200, w: 12 }),
      (FOOT_GATE = { x: 616, z: -199, w: 10 }),
      (SERVICE_END = { i: segIdx(26, 0.55) }),
      (SERVICE_ROAD = [[506, -197], [507, -189], [516, -178], [532, -170], tAt(SERVICE_END.i, 9)]),
      (PIT_LANE = (() => {
        let e = [];
        for (let t = PIT.i0; t <= PIT.i1; t++) e.push(tAt(t, PIT.lane));
        return {
          lane: e,
          pin: [tAt(PIT.i0 - 34, -6), tAt(PIT.i0 - 16, -13), tAt(PIT.i0, PIT.lane)],
          pout: [tAt(PIT.i1, PIT.lane), tAt(PIT.i1 + 14, -13), tAt(PIT.i1 + 28, -6)],
        };
      })()),
      (TRACK_HASH = new Map()),
      TRACK.pts.forEach(([e, t], n) => {
        let r = `${Math.floor(e / 16)},${Math.floor(t / 16)}`;
        (TRACK_HASH.has(r) || TRACK_HASH.set(r, []), TRACK_HASH.get(r).push(n));
      }),
      (PIST_AREA = PIST_AREAS[0]),
      (PIST_SPOTS = {
        giris: { x: 486, z: -214, yaw: Math.PI * 0.75 },
        festival: { x: 612, z: -212, yaw: 0 },
        tribun: { x: 640, z: -178, yaw: 0 },
        pit: { x: 640, z: -132, yaw: Math.PI },
        start: { x: 600, z: -162, yaw: -Math.PI / 2 },
      }));
