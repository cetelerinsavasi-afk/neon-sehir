// firebase/firestore modüler API'sinin önizleme için minimal taklidi
import { fakeDb } from './backend.js';

export function getFirestore() {
  return {};
}
export function doc(db, path) {
  return { type: 'doc', path };
}
export function collection(db, path) {
  return { type: 'coll', path, constraints: [] };
}
export function where(field, op, value) {
  return { kind: 'where', field, op, value };
}
export function orderBy(field, dir = 'asc') {
  return { kind: 'orderBy', field, dir };
}
export function limit(n) {
  return { kind: 'limit', n };
}
export function query(coll, ...constraints) {
  return { type: 'query', path: coll.path, constraints };
}
function build(target) {
  let q = fakeDb.collection(target.path);
  for (const c of target.constraints || []) {
    if (c.kind === 'where') q = q.where(c.field, c.op, c.value);
    else if (c.kind === 'orderBy') q = q.orderBy(c.field, c.dir);
    else if (c.kind === 'limit') q = q.limit(c.n);
  }
  return q;
}
export function onSnapshot(target, next, onError) {
  let alive = true;
  let scheduled = false;
  const run = async () => {
    scheduled = false;
    try {
      if (target.type === 'doc') {
        const s = await fakeDb.doc(target.path).get();
        if (alive) next({ id: s.id, exists: () => s.exists, data: () => s.data() });
      } else {
        const s = await build(target).get();
        if (alive) next({ size: s.size, empty: s.empty, docs: s.docs.map((d) => ({ id: d.id, data: () => d.data() })) });
      }
    } catch (err) {
      if (alive && onError) onError(err);
    }
  };
  const unsub = fakeDb.subscribe(() => {
    if (!scheduled) {
      scheduled = true;
      setTimeout(run, 30);
    }
  });
  run();
  return () => {
    alive = false;
    unsub();
  };
}
export async function getDoc(ref) {
  const s = await fakeDb.doc(ref.path).get();
  return { id: s.id, exists: () => s.exists, data: () => s.data() };
}
export async function getDocs(target) {
  const s = await build(target).get();
  return { docs: s.docs.map((d) => ({ id: d.id, data: () => d.data() })) };
}
