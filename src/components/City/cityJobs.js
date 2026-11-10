// =============================================================================
// v151 — MESLEK OYNANIŞI (istemci). Ticari aracın sahibi araca binince üstte
// "İşe başla" çıkar; basınca işler art arda gelir (günlük hak dolana / "İşi
// bırak"a basana kadar). İşi sunucu seçer (jobStart), bitince kazanç sunucuda
// hesaplanır (jobDone). Bot yolcular / hasta / şüpheli sadece şoförün cihazında;
// diğer oyuncular aracın "işte" hâlini (tepe lambası, içindeki yolcular) görür.
//   tır     : liman yükleme alanı → (yükleme 4 sn) → depo → (boşaltma 3 sn)
//   otobüs  : 10 durak sırayla; her durakta dur (kapılar 3 sn), yolcular iner/biner
//   taksi   : el sallayan müşteriye git → varış noktasına götür
//   ambulans: vaka yerine git (sedyeye alma 3 sn) → hastane acil girişi
//   polis   : kaçan şüpheliyi kovala (yanında 3 sn kal) ya da 3 noktada devriye
// Hız: hedefe yakın + neredeyse durmuş (< 1,4 m/s). Çarpma (> 5 m/s) kazancı düşürür.
// =============================================================================
import { LIMAN_BAY, DEPOTS, HOSPITAL, BUS_STOPS, ROAD_SPOTS } from '../../../functions/cityJobsData.js';
import { JOBS } from '../../../functions/vehicleKinds.js';

const STOP_V = 1.4;

// --- v152: YOL BULMA (yol ızgarası üzerinde en kısa yol) — yol çizgisi için --------------
const RX = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
const RZ = [-140, -100, -60, -20, 20, 60, 100];
const BIG = [
  [-36, 36, -16, 16],
  [44, 116, -16, 56],
  [-76, -4, 24, 56],
  [-116, -44, 64, 96],
];
const coveredRoad = (x, z) => BIG.some(([x0, x1, z0, z1]) => x > x0 + 1 && x < x1 - 1 && z > z0 + 1 && z < z1 - 1);
const NODES = [];
RX.forEach((x, i) => RZ.forEach((z, j) => NODES.push({ i, j, x, z, id: i * RZ.length + j })));
const nodeAt = (i, j) => (i >= 0 && j >= 0 && i < RX.length && j < RZ.length ? NODES[i * RZ.length + j] : null);
const EDGES = [];
NODES.forEach((n) => {
  [[1, 0], [0, 1]].forEach(([di, dj]) => {
    const m = nodeAt(n.i + di, n.j + dj);
    if (m && !coveredRoad((n.x + m.x) / 2, (n.z + m.z) / 2)) EDGES.push([n, m]);
  });
});
const ADJ = new Map(NODES.map((n) => [n.id, []]));
EDGES.forEach(([a, b]) => {
  const L = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
  ADJ.get(a.id).push([b, L]);
  ADJ.get(b.id).push([a, L]);
});
// noktayı en yakın yol kenarına izdüşür
function snapRoad(p) {
  let best = null;
  EDGES.forEach(([a, b]) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.d) best = { a, b, x, z, d };
  });
  return best;
}
export function roadRoute(from, to) {
  const s = snapRoad(from);
  const e = snapRoad(to);
  if (!s || !e) return [from, to];
  const pts = [{ x: s.x, z: s.z }];
  // aynı yol parçasındaysa doğrudan
  if ((s.a === e.a && s.b === e.b) || (s.a === e.b && s.b === e.a)) {
    pts.push({ x: e.x, z: e.z });
  } else {
    // Dijkstra: başlangıç parçanın iki ucu → bitiş parçanın iki ucu
    const dist = new Map();
    const prev = new Map();
    const q = [];
    [s.a, s.b].forEach((n) => {
      const d = Math.hypot(n.x - s.x, n.z - s.z);
      if (d < (dist.get(n.id) ?? Infinity)) {
        dist.set(n.id, d);
        q.push(n);
      }
    });
    while (q.length) {
      q.sort((m, n) => dist.get(m.id) - dist.get(n.id));
      const n = q.shift();
      ADJ.get(n.id).forEach(([m, L]) => {
        const nd = dist.get(n.id) + L;
        if (nd < (dist.get(m.id) ?? Infinity)) {
          dist.set(m.id, nd);
          prev.set(m.id, n);
          if (!q.includes(m)) q.push(m);
        }
      });
    }
    const ends = [e.a, e.b].map((n) => ({ n, d: (dist.get(n.id) ?? Infinity) + Math.hypot(n.x - e.x, n.z - e.z) }));
    ends.sort((m, n) => m.d - n.d);
    const chain = [];
    for (let n = ends[0].n; n; n = prev.get(n.id)) chain.unshift(n);
    chain.forEach((n) => pts.push({ x: n.x, z: n.z }));
    pts.push({ x: e.x, z: e.z });
  }
  if (Math.hypot(to.x - e.x, to.z - e.z) > 1) pts.push({ x: to.x, z: to.z });
  return pts;
}
const fmtT = (s) => {
  const n = Math.max(0, Math.round(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
const spot = (i) => ROAD_SPOTS[i] || ROAD_SPOTS[0];
const ERR = {
  'job-limit': 'Bugünkü iş hakkın doldu. Yarın tekrar çalışabilirsin.',
  'too-fast': 'Bu iş o kadar kısa sürede bitemez — sayılmadı.',
  'no-run': 'İş zaman aşımına uğradı, yeni iş başlatılıyor.',
  'not-work-vehicle': 'Bu araçla meslek yapılmaz.',
  listed: 'Araç ilanda — önce ilandan kaldır.',
  life0: 'Aracın ömrü bitti.',
  seized: 'Araca bankaca el konulmuş.',
};

export function createJobRunner({ engine, call, onUi, onToast, onPaid }) {
  let veh = null; // { id, catalogId }
  let job = null; // tir | otobus | taksi | polis | ambulans
  let run = null; // sunucunun işi
  let st = null; // yerel durum
  let active = false;
  let busy = false;
  let left = null;
  let daily = null;
  let lastHitAt = 0;
  const now = () => performance.now() / 1000;
  const E = () => engine();

  function ui(extra = {}) {
    onUi?.({
      active,
      busy,
      job,
      left,
      daily,
      title: st?.title || '',
      sub: st?.sub || '',
      bar: st?.bar ?? null,
      hits: st?.hits || 0,
      ...(active && run ? compass() : {}),
      ...extra,
    });
  }
  let tgt = null; // pusula için: şu anki hedef
  let routeAt = 0;
  let routeFrom = null;
  function target(t) {
    tgt = t ? { ...t } : null;
    E()?.jobTarget(t);
    routeAt = 0; // yol hemen yeniden çizilsin
    if (!t) E()?.jobRoute(null);
  }
  // v152: hedefe giden yol (araç yer değiştirdikçe / şüpheli kaçtıkça yenilenir)
  function refreshRoute() {
    const p = E()?.jobProbe();
    if (!p || !tgt) return;
    const t = performance.now();
    const moved = !routeFrom || Math.hypot(p.x - routeFrom.x, p.z - routeFrom.z) > 6;
    if (t - routeAt < (tgt.follow ? 700 : 1500) && !moved) return;
    if (t - routeAt < 350) return;
    routeAt = t;
    routeFrom = { x: p.x, z: p.z };
    let to = { x: tgt.x, z: tgt.z };
    if (tgt.follow) to = E()?.jobSuspectPos() || to;
    const pts = roadRoute({ x: p.x, z: p.z }, to);
    // v153: şerit aracın tam altından başlar, hedefin kendisinde biter
    if (pts.length && Math.hypot(pts[0].x - p.x, pts[0].z - p.z) > 0.5) pts.unshift({ x: p.x, z: p.z });
    E()?.jobRoute(pts, tgt.color || '#19e8ff');
  }
  function compass() {
    const p = E()?.jobProbe();
    if (!p || !tgt) return {};
    let tx = tgt.x;
    let tz = tgt.z;
    if (tgt.follow) {
      const s = E()?.jobSuspectPos();
      if (s) {
        tx = s.x;
        tz = s.z;
      }
    }
    // aracın yönüne göre hedefin açısı (0 = tam önde, + sağda)
    let a = Math.atan2(tx - p.x, tz - p.z) - p.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    return { dir: Math.round((-a * 180) / Math.PI), dist: Math.round(Math.hypot(tx - p.x, tz - p.z)) };
  }
  function people(list) {
    E()?.jobPeople(list);
  }
  function setPax(n) {
    E()?.setJob({ on: active, pax: n });
  }
  function clearWorld() {
    target(null);
    E()?.jobRoute(null);
    people([]);
    E()?.jobSuspect(null);
  }
  const near = (p, pt, r) => Math.hypot(pt.x - p.x, pt.z - p.z) < (pt.r || r) && p.speed < STOP_V;

  // --- iş başlat -----------------------------------------------------------------------
  async function begin() {
    if (!active || !veh || busy) return;
    const p = E()?.jobProbe();
    busy = true;
    st = { title: 'İş aranıyor…', sub: '', hits: 0 };
    ui();
    try {
      const r = await call({ op: 'jobStart', vehicleId: veh.id, x: p?.x, z: p?.z });
      run = r.run;
      left = r.left;
      daily = r.daily;
      busy = false;
      setup();
    } catch (e) {
      busy = false;
      const m = String(e?.message || '');
      onToast?.(ERR[m] || m || 'İş alınamadı.');
      stop(true);
    }
  }

  function setup() {
    const T = run.task;
    st = { hits: 0, t0: null, phaseT: 0, title: '', sub: '' };
    setPax(0);
    if (T.type === 'tir') {
      st.phase = 'pickup';
      st.depot = DEPOTS[T.depot] || DEPOTS[0];
      st.title = `📦 ${T.cargo} · ${T.ton} t`;
      st.sub = `⚓ Limandaki sarı YÜKLEME alanına gir ve dur, dorseni al → ${st.depot.name}`;
      target({ ...LIMAN_BAY, name: 'Liman — Yükleme', icon: '⚓', color: '#ffd23f', r: 6 });
    } else if (T.type === 'otobus') {
      st.phase = 'drive';
      st.route = BUS_STOPS.map((_, k) => BUS_STOPS[(T.start + k) % BUS_STOPS.length]);
      st.waiting = st.route.map((s) => T.waiting?.[s.n - 1] ?? 2);
      st.idx = 0;
      st.onboard = 0;
      busPeople();
      busTarget();
    } else if (T.type === 'taksi') {
      st.phase = 'toCustomer';
      st.from = spot(T.from);
      st.to = spot(T.to);
      st.title = `🚕 Çağrı: ${T.pax}${T.rush ? ' · ⚡ acil' : ''}`;
      st.sub = `🧍 ${st.from.name} — kaldırımda el sallıyor`;
      people([{ id: 'pax', x: st.from.sx, z: st.from.sz, wave: true, seed: T.from * 3.1 }]);
      target({ x: st.from.x, z: st.from.z, name: T.pax, icon: '🧍', color: '#3ad07a', r: 7 });
    } else if (T.type === 'ambulans') {
      st.phase = 'toPatient';
      st.from = spot(T.from);
      st.title = `🚨 112: ${T.title}`;
      st.sub = `${T.desc} — ${st.from.name}`;
      st.t0 = now();
      people([
        { id: 'hasta', x: st.from.sx, z: st.from.sz, lie: true, seed: T.from * 1.7 },
        { id: 'yakin', x: st.from.sx + st.from.fz * 1.4, z: st.from.sz - st.from.fx * 1.4, wave: true, seed: T.from * 2.9 },
      ]);
      target({ x: st.from.x, z: st.from.z, name: `Vaka: ${T.title}`, icon: '🚨', color: '#ff3b3b', r: 7 });
    } else if (T.type === 'polis' && T.mode === 'chase') {
      st.phase = 'chase';
      const s = spot(T.from);
      st.title = `🚨 İhbar: ${T.crime}`;
      st.sub = `Şüpheli araç ${s.name} civarında — sirenle yanında 3 sn kal`;
      st.catchT = 0;
      st.t0 = now();
      E()?.jobSuspect({ car: T.car, x: s.x, z: s.z, yaw: Math.atan2(-s.fz, s.fx) });
      target({ x: s.x, z: s.z, name: 'Şüpheli', icon: '🚗', color: '#ff2e8c', r: 4, follow: true });
    } else if (T.type === 'polis') {
      st.phase = 'patrol';
      st.pts = (T.pts || []).map(spot);
      st.pi = 0;
      st.t0 = null;
      st.title = '🚓 Devriye';
      patrolTarget();
    }
    ui();
  }
  function busPeople() {
    const list = [];
    st.route.forEach((s, k) => {
      if (k < st.idx) return;
      const n = st.waiting[k] || 0;
      for (let i = 0; i < n; i++) {
        const a = (i - (n - 1) / 2) * 0.8;
        list.push({ id: `d${s.n}_${i}`, x: s.sx + s.fz * a, z: s.sz - s.fx * a, seed: s.n * 13 + i * 7 });
      }
    });
    people(list);
  }
  function busTarget() {
    const s = st.route[st.idx];
    st.title = `🚌 Sıradaki: ${s.name}`;
    st.sub = `Durak ${st.idx + 1}/${st.route.length} · 👥 ${st.onboard} yolcu`;
    target({ x: s.x, z: s.z, name: `Durak ${s.n}: ${s.name}`, icon: '🚏', color: '#19e8ff', r: 7.5 });
  }
  function patrolTarget() {
    const p = st.pts[st.pi];
    st.sub = `Kontrol noktası ${st.pi + 1}/${st.pts.length} — ${p.name}`;
    target({ x: p.x, z: p.z, name: `Devriye ${st.pi + 1}/${st.pts.length}`, icon: '🚓', color: '#1e5bff', r: 9 });
  }

  // --- iş bitti → sunucu öder ----------------------------------------------------------------
  async function finish(t) {
    if (!run || busy) return;
    busy = true;
    const runId = run.id;
    const hits = st.hits;
    clearWorld();
    setPax(0);
    st = { title: 'Ödeme alınıyor…', sub: '', hits };
    ui();
    try {
      const r = await call({ op: 'jobDone', vehicleId: veh.id, runId, t: Math.round(t * 10) / 10, hits });
      left = r.left;
      daily = r.daily;
      onPaid?.({ job, total: r.total, perf: r.perf, t: r.t, hits: r.hits, left: r.left, daily: r.daily, toDebt: r.toDebt });
      run = null;
      busy = false;
      if (!active) return;
      if (r.left <= 0) {
        onToast?.(`✅ Bugünkü ${JOBS[job]?.unit || 'iş'} hakkın doldu (${r.daily}/${r.daily}).`);
        stop(true);
        return;
      }
      st = { title: 'Sıradaki iş geliyor…', sub: `Bugün kalan: ${r.left}/${r.daily}`, hits: 0 };
      ui();
      setTimeout(() => active && !run && begin(), 3500);
    } catch (e) {
      busy = false;
      run = null;
      const m = String(e?.message || '');
      onToast?.(ERR[m] || m || 'Ödeme alınamadı.');
      if (m === 'job-limit') stop(true);
      else if (active) setTimeout(() => active && !run && begin(), 2500);
    }
  }

  // --- her 100 ms -------------------------------------------------------------------------
  function tick(dt) {
    if (!active || !run || busy || !st) return;
    const p = E()?.jobProbe();
    if (!p) return;
    refreshRoute();
    const T = run.task;
    const tnow = now();
    if (T.type === 'tir') {
      if (st.phase === 'pickup' && near(p, LIMAN_BAY, 6)) {
        st.phase = 'loading';
        st.phaseT = 0;
        target(null);
      } else if (st.phase === 'loading') {
        if (p.speed > STOP_V) st.phaseT = Math.max(0, st.phaseT - dt);
        else st.phaseT += dt;
        st.sub = '🏗️ Yükleniyor… aracı oynatma';
        st.bar = st.phaseT / 4;
        if (st.phaseT >= 4) {
          setPax(1); // v152: dorse takılır (diğer oyuncular da görür)
          st.phase = 'deliver';
          st.t0 = tnow;
          st.bar = null;
          target({ ...st.depot, icon: '📦', color: '#19e8ff' });
          onToast?.(`✅ Yüklendi! ${st.depot.name}'na götür`);
        }
      } else if (st.phase === 'deliver') {
        st.sub = `${st.depot.name} · ⏱️ ${fmtT(tnow - st.t0)} / hedef ${fmtT(run.par)} · 💥 ${st.hits}`;
        if (near(p, st.depot, 7)) {
          st.phase = 'unloading';
          st.phaseT = 0;
          st.dt = tnow - st.t0;
          target(null);
        }
      } else if (st.phase === 'unloading') {
        st.phaseT += p.speed < STOP_V ? dt : 0;
        st.sub = '📤 Boşaltılıyor…';
        st.bar = st.phaseT / 3;
        if (st.phaseT >= 3) {
          setPax(0); // dorse depoda kalır
          return finish(st.dt);
        }
      }
    } else if (T.type === 'otobus') {
      const s = st.route[st.idx];
      if (st.phase === 'drive') {
        if (near(p, s, 7.5)) {
          st.phase = 'doors';
          st.phaseT = 0;
          const last = st.idx === st.route.length - 1;
          st.off = last ? st.onboard : Math.floor(Math.random() * (st.onboard + 1));
          st.on = last ? 0 : st.waiting[st.idx] || 0;
          if (st.idx === 0) st.t0 = tnow;
          target(null);
        } else busTarget();
      } else if (st.phase === 'doors') {
        if (p.speed > STOP_V) st.phaseT = Math.max(0, st.phaseT - dt);
        else st.phaseT += dt;
        st.title = `🚏 ${s.name}`;
        st.sub = `🚪 Kapılar açık · ⬇️ ${st.off} iniyor · ⬆️ ${st.on} biniyor`;
        st.bar = st.phaseT / 3;
        if (st.phaseT >= 3) {
          st.onboard = Math.max(0, st.onboard - st.off + st.on);
          st.waiting[st.idx] = 0;
          st.bar = null;
          setPax(st.onboard);
          st.idx += 1;
          if (st.idx >= st.route.length) return finish(tnow - (st.t0 ?? tnow));
          st.phase = 'drive';
          busPeople();
          busTarget();
        }
      }
    } else if (T.type === 'taksi') {
      if (st.phase === 'toCustomer' && near(p, st.from, 7)) {
        people([]);
        setPax(1);
        st.phase = 'ride';
        st.t0 = tnow;
        st.title = `🚕 ${T.pax}`;
        target({ x: st.to.x, z: st.to.z, name: `${st.to.name} (varış)`, icon: '🏁', color: '#ff2e8c', r: 7 });
        onToast?.(`💬 ${T.pax}: “${st.to.name}, lütfen.”`);
      } else if (st.phase === 'ride') {
        st.sub = `🏁 ${st.to.name} · ⏱️ ${fmtT(tnow - st.t0)}${T.rush ? ` / acil ${fmtT(run.par)}` : ''} · 💥 ${st.hits}`;
        if (near(p, st.to, 7)) return finish(tnow - st.t0);
      }
    } else if (T.type === 'ambulans') {
      if (st.phase === 'toPatient') {
        st.sub = `${T.desc} — ${st.from.name} · ⏱️ ${fmtT(tnow - st.t0)}`;
        if (near(p, st.from, 7)) {
          st.phase = 'loading';
          st.phaseT = 0;
          target(null);
        }
      } else if (st.phase === 'loading') {
        if (p.speed > STOP_V) st.phaseT = Math.max(0, st.phaseT - dt);
        else st.phaseT += dt;
        st.sub = '🩺 Hasta sedyeye alınıyor…';
        st.bar = st.phaseT / 3;
        if (st.phaseT >= 3) {
          people([]);
          setPax(1);
          st.phase = 'toHospital';
          st.t1 = tnow;
          st.bar = null;
          target({ ...HOSPITAL, icon: '🏥', color: '#ff3b3b' });
          onToast?.('✅ Hasta araçta — hastaneye, ACİL girişine!');
        }
      } else if (st.phase === 'toHospital') {
        st.title = '🏥 Hastaneye yetiştir';
        st.sub = `⏱️ ${fmtT(tnow - st.t1)} / hedef ${fmtT(run.par)} · 💥 ${st.hits}`;
        if (near(p, HOSPITAL, 7)) {
          st.phase = 'unloading';
          st.phaseT = 0;
          st.dt = tnow - st.t1;
          target(null);
        }
      } else if (st.phase === 'unloading') {
        st.phaseT += p.speed < STOP_V ? dt : 0;
        st.sub = '🏥 Hasta acile teslim ediliyor…';
        st.bar = st.phaseT / 3;
        if (st.phaseT >= 3) return finish(st.dt);
      }
    } else if (T.type === 'polis' && T.mode === 'chase') {
      const s = E()?.jobSuspectPos();
      if (s) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < 10) st.catchT += dt;
        else st.catchT = Math.max(0, st.catchT - dt * 0.5);
        st.bar = st.catchT / 3;
        st.sub = `Şüpheliye ${Math.round(d)} m · ⏱️ ${fmtT(tnow - st.t0)} · yanında 3 sn kal`;
        if (st.catchT >= 3) {
          E()?.jobStopSuspect();
          onToast?.('🚔 Şüpheli kenara çekti — yakalandı!');
          return finish(tnow - st.t0);
        }
        if (d > 330) {
          onToast?.('😤 Şüpheli kaçtı… merkez yeni ihbar gönderiyor');
          call({ op: 'jobCancel', vehicleId: veh.id }).catch(() => {});
          clearWorld();
          run = null;
          setTimeout(() => active && !run && begin(), 2500);
          return undefined;
        }
      }
    } else if (T.type === 'polis') {
      const pt = st.pts[st.pi];
      if (Math.hypot(pt.x - p.x, pt.z - p.z) < 9) {
        if (st.pi === 0) st.t0 = tnow;
        st.pi += 1;
        if (st.pi >= st.pts.length) return finish(tnow - (st.t0 ?? tnow));
        onToast?.(`✔️ Kontrol noktası ${st.pi}/${st.pts.length}`);
        patrolTarget();
      }
    }
    ui();
    return undefined;
  }

  function crash(speed) {
    if (!active || !run || !st || speed < 5) return;
    const t = now();
    if (t - lastHitAt < 1.2) return;
    lastHitAt = t;
    st.hits = (st.hits || 0) + 1;
    onToast?.(`💥 Çarptın (${st.hits}) — kazançtan düşülecek`);
  }

  function stop(silent = false) {
    const had = Boolean(run);
    active = false;
    clearWorld();
    E()?.setJob({ on: false });
    if (had && veh) call({ op: 'jobCancel', vehicleId: veh.id }).catch(() => {});
    run = null;
    st = null;
    busy = false;
    if (!silent && had) onToast?.('İş bırakıldı (hak harcanmadı).');
    ui();
  }

  return {
    // vehicle: { id, catalogId, job }
    setVehicle(v) {
      if (veh?.id !== v?.id && active) stop(true);
      veh = v || null;
      job = v?.job || null;
      left = null;
      daily = null;
      ui();
    },
    start() {
      if (!veh || !job) return;
      active = true;
      E()?.setJob({ on: true, pax: 0 });
      begin();
    },
    stop,
    tick,
    crash,
    get active() {
      return active;
    },
  };
}
