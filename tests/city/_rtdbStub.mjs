// v191 — test yardımcısı: cityNet.js'i Node'da çalıştırmak için sahte Realtime Database + yükleyici.
// Gerçek Firebase'e bağlanmaz. Kullanım: await loadCityNet(dosyaYolu) → { createCityNet, fake }
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HOOKS = `
export async function resolve(spec, ctx, next) {
  if (spec === 'firebase/database') return { url: 'stub:rtdb', shortCircuit: true };
  if (/\\/firebase(\\.js)?$/.test(spec) && ctx.parentURL && /cityNet/.test(ctx.parentURL)) return { url: 'stub:app', shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url === 'stub:app') return { format: 'module', source: 'export const app = {};', shortCircuit: true };
  if (url === 'stub:rtdb') return { format: 'module', source: ['getDatabase', 'ref', 'onValue', 'set', 'update', 'remove', 'onDisconnect', 'serverTimestamp', 'runTransaction'].map((k) => 'export const ' + k + ' = (...a) => globalThis.__fakeRtdb.' + k + '(...a);').join('\\n'), shortCircuit: true };
  const r = await next(url, ctx);
  if (/cityNet[^/]*\\.js/.test(url)) {
    const src = String(r.source).replace(/import\\.meta\\.env/g, '({ VITE_FIREBASE_DATABASE_URL: "https://x", DEV: false })');
    return { ...r, source: src, shortCircuit: true };
  }
  return r;
}`;
let registered = false;

export function makeFakeRtdb() {
  const data = new Map(); // tam yol → değer
  const subs = new Map(); // dinlenen yol → Set(cb)
  const stats = { sets: 0, updates: 0, cbs: 0, down: 0 }; // down: alıcılara inen yaklaşık bayt (veri + ~80 bayt çerçeve)
  const childrenOf = (p) => {
    const out = {};
    const pre = p + '/';
    data.forEach((v, k) => {
      if (k.startsWith(pre) && !k.slice(pre.length).includes('/')) out[k.slice(pre.length)] = v;
    });
    return Object.keys(out).length ? out : null;
  };
  const valOf = (p) => (data.has(p) ? data.get(p) : childrenOf(p));
  const notify = (path, bytes = 0) => {
    subs.forEach((set, sp) => {
      if (path === sp || path.startsWith(sp + '/')) {
        stats.down += set.size * (bytes + 80);
        const v = valOf(sp);
        // gerçek SDK gibi: her olayda yeni (kopya) nesne
        set.forEach((cb) => {
          stats.cbs += 1;
          cb({ val: () => (v == null ? null : JSON.parse(JSON.stringify(v))) });
        });
      }
    });
  };
  const f = {
    stats,
    data,
    getDatabase: () => ({}),
    ref: (_db, path) => ({ path }),
    serverTimestamp: () => ({ '.sv': 'timestamp' }),
    onDisconnect: () => ({ remove: async () => {}, cancel: async () => {} }),
    onValue: (r, cb) => {
      if (!subs.has(r.path)) subs.set(r.path, new Set());
      subs.get(r.path).add(cb);
      const v = r.path === '.info/connected' ? true : valOf(r.path);
      queueMicrotask(() => cb({ val: () => (v == null ? null : JSON.parse(JSON.stringify(v))) }));
      return () => subs.get(r.path)?.delete(cb);
    },
    set: async (r, val) => {
      stats.sets += 1;
      const v = { ...val };
      if (v.t && v.t['.sv']) v.t = Date.now();
      data.set(r.path, v);
      notify(r.path, JSON.stringify(v).length);
    },
    update: async (r, val) => {
      stats.updates += 1;
      const v = { ...val };
      if (v.t && v.t['.sv']) v.t = Date.now();
      data.set(r.path, { ...(data.get(r.path) || {}), ...v });
      notify(r.path, JSON.stringify(v).length); // gerçek RTDB de sadece birleştirilen alanları iletir
    },
    remove: async (r) => {
      data.delete(r.path);
      notify(r.path);
    },
    runTransaction: async (r, fn) => {
      const nv = fn(data.get(r.path) ?? null);
      if (nv === undefined) return { committed: false };
      data.set(r.path, nv);
      return { committed: true };
    },
  };
  return f;
}

export async function loadCityNet(file) {
  if (!registered) {
    register('data:text/javascript,' + encodeURIComponent(HOOKS));
    registered = true;
  }
  const fake = makeFakeRtdb();
  globalThis.__fakeRtdb = fake;
  const mod = await import(pathToFileURL(file).href + '?v=' + Math.random());
  return { createCityNet: mod.createCityNet, cellOf: mod.cellOf, fake };
}

// N uzak oyuncu aynı bölgede her ~300 ms'de bir yürür; bizim istemcimiz ms boyunca dinler.
export async function simulate(createCityNet, cellOf, fake, { players = 10, ms = 3000, avatarBytes = 6000 } = {}) {
  const avatar = { body: 'x'.repeat(avatarBytes), hat: 'cap', color: '#ff00aa' };
  for (let i = 0; i < players; i++) fake.data.set(`city/u/p${i}`, { n: `Oyuncu${i}`, a: JSON.stringify(avatar) });
  let onPlayerCalls = 0;
  let stringifyBytes = 0;
  const net = createCityNet({
    uid: 'me',
    name: 'Ben',
    avatar: {},
    onPlayer: (id, rec) => {
      onPlayerCalls += 1;
      // eski motor her çağrıda avatarı metne çeviriyordu (Fig.setAvatar) — aynı maliyet burada ölçülür
      if (rec.a && rec.a !== simulate.lastA?.get(id)) stringifyBytes += JSON.stringify(rec.a).length;
      (simulate.lastA ||= new Map()).set(id, rec.a);
    },
    onPlayerGone: () => {},
    onCar: () => {},
    onCarGone: () => {},
  });
  simulate.lastA = new Map();
  net.tick({ x: 10, z: 10, p: 'w' }, null);
  await new Promise((r) => setTimeout(r, 50));
  const cell = cellOf(10, 10);
  const pos = Array.from({ length: players }, (_, i) => ({ x: 5 + (i % 10), z: 5 + Math.floor(i / 10) }));
  const t0 = Date.now();
  let writes = 0;
  const timers = pos.map((p, i) =>
    setInterval(() => {
      p.x += 0.4;
      writes += 1;
      fake.set({ path: `city/p/${cell}/p${i}` }, { x: +p.x.toFixed(2), z: p.z, p: 'w', t: fake.serverTimestamp() });
      if (p.x > 60) p.x = 5;
    }, 300 + (i % 7) * 5)
  );
  await new Promise((r) => setTimeout(r, ms));
  timers.forEach(clearInterval);
  const cpuMs = Date.now() - t0;
  net.stop();
  return { players, writes, onPlayerCalls, perWrite: +(onPlayerCalls / Math.max(1, writes)).toFixed(2), avatarKB: Math.round(stringifyBytes / 1024), wallMs: cpuMs };
}

// v192 — kalabalık senaryosu: n istemci aynı bölgede; yürüyen / modifiyeli arabayla süren / duran.
// Her istemci gerçek cityNet örneğidir (yazım sıklığı kuralları dahil). Dönen: toplam inen bayt / sn.
export async function crowdBandwidth(createCityNet, fake, { n = 100, ms = 4000, drivers = 0.3, idle = 0.2 } = {}) {
  const mods = JSON.stringify({ paint: '#ff2e88', rim: '#c9ccd2', tire: '#121212', spoiler: 'gt', neon: '#19e8ff', tint: 'koyu', exhaust: 'cift', decal: 'alev', plate: '34 NEON 34', finish: 'metalik', hood: 'karbon', lights: 'led' }).padEnd(380, ' ');
  const nets = [];
  for (let i = 0; i < n; i++) {
    fake.data.set(`city/u/u${i}`, { n: `Oyuncu${i}`, a: '{}' });
    const net = createCityNet({ uid: `u${i}`, name: `Oyuncu${i}`, avatar: {}, onPlayer: () => {}, onPlayerGone: () => {}, onCar: () => {}, onCarGone: () => {} });
    const kind = i < n * drivers ? 'd' : i < n * (drivers + idle) ? 'i' : 'w';
    nets.push({ net, kind, x: 2 + (i % 10) * 3, z: 2 + Math.floor(i / 10) * 3, yaw: 0 });
  }
  await new Promise((r) => setTimeout(r, 300));
  const d0 = fake.stats.down;
  const t0 = Date.now();
  const iv = setInterval(() => {
    for (const p of nets) {
      if (p.kind === 'w') p.x += 0.15; // 1,5 m/sn
      if (p.kind === 'd') {
        p.x += 1.2; // 12 m/sn
        p.yaw = (p.yaw + 0.01) % 3;
      }
      if (p.x > 60) p.x = 2;
      const st = { x: +p.x.toFixed(2), z: p.z, l: 0, m: p.kind === 'w' ? 1 : 0, p: p.kind === 'd' ? 'd' : 'w' };
      const car = p.kind === 'd' ? { m: mods, ct: Date.now(), v: 5, x: +p.x.toFixed(2), z: p.z, y: +p.yaw.toFixed(3), s: 12, st: 0.1, d: 1 } : null;
      p.net.tick(st, car);
    }
  }, 100);
  await new Promise((r) => setTimeout(r, ms));
  clearInterval(iv);
  const sec = (Date.now() - t0) / 1000;
  nets.forEach((p) => p.net.stop());
  return { n, bytesPerSec: Math.round((fake.stats.down - d0) / sec), sets: fake.stats.sets, updates: fake.stats.updates };
}
