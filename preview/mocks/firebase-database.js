// Önizleme: Realtime Database'in minimal taklidi. Aynı tarayıcıdaki sekmeler
// arasında localStorage + BroadcastChannel ile paylaşılır (online oyun testi için).
const KEY = 'rtdb-mock';
const bc = new BroadcastChannel('rtdb-mock');
const listeners = new Set();
// v147: her yol ayrı anahtar (rtdb:yol) → iki sekme aynı anda yazınca birbirini ezmesin
const PFX = 'rtdb:';
const load = () => {
  const root = {};
  try {
    const legacy = JSON.parse(localStorage.getItem(KEY) || '{}');
    Object.assign(root, legacy);
  } catch {
    /* yoksay */
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(PFX)) continue;
    try {
      setAt(root, k.slice(PFX.length), JSON.parse(localStorage.getItem(k)));
    } catch {
      /* yoksay */
    }
  }
  return root;
};
const parts = (p) => String(p).split('/').filter(Boolean);
function getAt(root, p) {
  let cur = root;
  for (const k of parts(p)) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur === undefined ? null : cur;
}
function setAt(root, p, v) {
  const ks = parts(p);
  let cur = root;
  ks.slice(0, -1).forEach((k) => {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  });
  const last = ks[ks.length - 1];
  if (v === null || v === undefined) delete cur[last];
  else cur[last] = v;
}
const resolveTs = (v) => {
  if (v && typeof v === 'object') {
    if (v['.sv'] === 'timestamp') return Date.now();
    const o = Array.isArray(v) ? [] : {};
    for (const k of Object.keys(v)) o[k] = resolveTs(v[k]);
    return o;
  }
  return v;
};
function write(fn) {
  // fn eski API'yle kökü değiştirir; değişen yaprakları ayrı anahtarlara yaz
  const before = load();
  const root = JSON.parse(JSON.stringify(before));
  fn(root);
  const flat = (o, pre, out) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const ks = Object.keys(o);
      if (!ks.length && pre) out[pre] = null;
      ks.forEach((k) => flat(o[k], pre ? `${pre}/${k}` : k, out));
    } else out[pre] = o;
    return out;
  };
  const a = flat(before, '', {});
  const b = flat(root, '', {});
  Object.keys(b).forEach((k) => {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) localStorage.setItem(PFX + k, JSON.stringify(b[k]));
  });
  Object.keys(a).forEach((k) => {
    if (!(k in b)) localStorage.removeItem(PFX + k);
  });
  localStorage.removeItem(KEY);
  bc.postMessage('x');
  notify();
}
function notify() {
  const root = load();
  listeners.forEach((l) => l.check(root));
}
bc.onmessage = () => notify();
// v147: başka sekmenin yazdığı veri bu sekmeye ulaşınca (storage olayı) da kontrol et
let stTimer = 0;
addEventListener('storage', (e) => {
  if (e.key && !e.key.startsWith(PFX) && e.key !== KEY) return;
  clearTimeout(stTimer);
  stTimer = setTimeout(notify, 30);
});

let seq = 0;
export function getDatabase() {
  return {};
}
export const ref = (db, path = '') => ({ path: parts(path).join('/'), key: parts(path).slice(-1)[0] || null });
export const child = (r, p) => ref(null, `${r.path}/${p}`);
export function push(r) {
  const key = `k${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return ref(null, `${r.path}/${key}`);
}
export const serverTimestamp = () => ({ '.sv': 'timestamp' });
// önizleme: ?oldrules=1 → sunucu kuralları eskiymiş gibi yeni oda alanlarına (p/, i/) yazma reddedilir
const denied = (path) => new URLSearchParams(location.search).get('oldrules') === '1' && /^arcade\/[^/]+\/[^/]+\/(p|i)(\/|$)/.test(path);
const permErr = () => Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
export async function set(r, v) {
  if (denied(r.path)) throw permErr();
  write((root) => setAt(root, r.path, resolveTs(v)));
}
export async function update(r, obj) {
  write((root) => Object.entries(obj).forEach(([k, v]) => setAt(root, `${r.path}/${k}`, resolveTs(v))));
}
export async function remove(r) {
  write((root) => setAt(root, r.path, null));
}
export const orderByChild = (p) => ({ kind: 'order', p });
export const equalTo = (v) => ({ kind: 'eq', v });
export const limitToLast = (n) => ({ kind: 'limit', n });
export const query = (r, ...cs) => ({ ...r, cs });
function snapOf(path, v) {
  return {
    key: parts(path).slice(-1)[0],
    val: () => v,
    exists: () => v != null,
    forEach(fn) {
      Object.keys(v || {})
        .sort()
        .forEach((k) => fn(snapOf(`${path}/${k}`, v[k])));
    },
  };
}
export function onValue(q, cb) {
  let last;
  const compute = (root) => {
    let v = getAt(root, q.path);
    if (q.cs && v && typeof v === 'object') {
      const order = q.cs.find((c) => c.kind === 'order');
      const eq = q.cs.find((c) => c.kind === 'eq');
      const out = {};
      Object.keys(v).forEach((k) => {
        const cv = order ? getAt(v[k], order.p) : v[k];
        if (!eq || cv === eq.v) out[k] = v[k];
      });
      v = out;
    }
    return v;
  };
  const l = {
    check(root) {
      const v = compute(root);
      const j = JSON.stringify(v);
      if (j === last) return;
      last = j;
      setTimeout(() => cb(snapOf(q.path, v)), 0);
    },
  };
  listeners.add(l);
  l.check(load());
  return () => listeners.delete(l);
}
export async function runTransaction(r, fn) {
  if (denied(r.path)) throw permErr();
  let committed = false;
  write((root) => {
    const cur = getAt(root, r.path);
    const next = fn(cur);
    if (next !== undefined) {
      setAt(root, r.path, next);
      committed = true;
    }
  });
  return { committed };
}
const pending = new Map();
addEventListener('pagehide', () => pending.forEach((op) => op()));
export function onDisconnect(r) {
  return {
    remove: async () => pending.set(r.path, () => write((root) => setAt(root, r.path, null))),
    set: async (v) => pending.set(r.path, () => write((root) => setAt(root, r.path, v))),
    cancel: async () => pending.delete(r.path),
  };
}
