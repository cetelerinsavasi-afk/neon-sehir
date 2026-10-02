// Önizleme: Realtime Database'in minimal taklidi. Aynı tarayıcıdaki sekmeler
// arasında localStorage + BroadcastChannel ile paylaşılır (online oyun testi için).
const KEY = 'rtdb-mock';
const bc = new BroadcastChannel('rtdb-mock');
const listeners = new Set();
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
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
  const root = load();
  fn(root);
  localStorage.setItem(KEY, JSON.stringify(root));
  bc.postMessage('x');
  notify();
}
function notify() {
  const root = load();
  listeners.forEach((l) => l.check(root));
}
bc.onmessage = () => notify();

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
export async function set(r, v) {
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
