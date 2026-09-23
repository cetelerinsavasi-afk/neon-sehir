// Bellek içi Firestore taklidi — SADECE otomatik testler için.
// Firestore emülatörü bu geliştirme ortamında indirilemediği için, çete
// sisteminin transaction/idempotency/race-condition davranışını test etmek
// üzere Admin SDK'nın kullandığımız alt kümesini taklit eder:
//   - doc/collection referansları, get/set(merge)/update(nokta yolu)/delete/create
//   - where(==,!=,<,<=,>,>=,in,array-contains) + orderBy + limit sorguları
//   - FieldValue.increment/delete/arrayUnion/arrayRemove/serverTimestamp
//   - runTransaction: gerçek Firestore gibi SERİLEŞTİRİLEBİLİR. Okunan her
//     belgenin (ve sorgu sonuç kümesinin) sürümü commit anında doğrulanır,
//     çakışma varsa fonksiyon baştan yeniden çalıştırılır (max 5 deneme).
//     tx.get() her çağrıda event-loop'a döner → eşzamanlı transaction'lar
//     gerçekten iç içe geçer (race condition'lar gerçekten oluşur).
//   - "yazmadan sonra okuma" gerçek Firestore'daki gibi hata fırlatır.

export class Timestamp {
  constructor(ms) {
    this._ms = ms;
  }
  static fromMillis(ms) {
    return new Timestamp(ms);
  }
  static now() {
    return new Timestamp(Date.now());
  }
  toMillis() {
    return this._ms;
  }
  toDate() {
    return new Date(this._ms);
  }
}

class Sentinel {
  constructor(kind, value) {
    this.kind = kind;
    this.value = value;
  }
}

export const FieldValue = {
  increment: (n) => new Sentinel('increment', n),
  delete: () => new Sentinel('delete'),
  arrayUnion: (...v) => new Sentinel('arrayUnion', v),
  arrayRemove: (...v) => new Sentinel('arrayRemove', v),
  serverTimestamp: () => new Sentinel('serverTimestamp'),
};

function clone(v) {
  if (v === undefined) return undefined;
  if (v instanceof Timestamp) return new Timestamp(v._ms);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = clone(x);
    return out;
  }
  return v;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Sentinel);
}

function eq(a, b) {
  if (a instanceof Timestamp && b instanceof Timestamp) return a._ms === b._ms;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
  }
  return a === b;
}

function applySentinel(current, s, clock) {
  switch (s.kind) {
    case 'increment':
      return (typeof current === 'number' ? current : 0) + s.value;
    case 'arrayUnion': {
      const arr = Array.isArray(current) ? [...current] : [];
      for (const v of s.value) if (!arr.some((x) => eq(x, v))) arr.push(clone(v));
      return arr;
    }
    case 'arrayRemove': {
      const arr = Array.isArray(current) ? current : [];
      return arr.filter((x) => !s.value.some((v) => eq(x, v)));
    }
    case 'serverTimestamp':
      return new Timestamp(clock());
    default:
      throw new Error('unknown sentinel ' + s.kind);
  }
}

function resolveValue(current, v, clock) {
  if (v instanceof Sentinel) return applySentinel(current, v, clock);
  if (isPlainObject(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (x instanceof Sentinel && x.kind === 'delete') continue;
      out[k] = resolveValue(undefined, x, clock);
    }
    return out;
  }
  return clone(v);
}

function deepMerge(target, src, clock) {
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(src)) {
    if (v instanceof Sentinel && v.kind === 'delete') {
      delete out[k];
    } else if (v instanceof Sentinel) {
      out[k] = applySentinel(out[k], v, clock);
    } else if (isPlainObject(v)) {
      out[k] = deepMerge(out[k], v, clock);
    } else {
      out[k] = clone(v);
    }
  }
  return out;
}

function setPath(obj, path, v, clock) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (v instanceof Sentinel && v.kind === 'delete') delete cur[last];
  else if (v instanceof Sentinel) cur[last] = applySentinel(cur[last], v, clock);
  else cur[last] = resolveValue(undefined, v, clock);
}

function getPath(obj, path) {
  let cur = obj;
  for (const p of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function cmp(a, b) {
  const va = a instanceof Timestamp ? a._ms : a;
  const vb = b instanceof Timestamp ? b._ms : b;
  if (va === vb) return 0;
  if (va === undefined || va === null) return -1;
  if (vb === undefined || vb === null) return 1;
  return va < vb ? -1 : 1;
}

export class FakeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class DocumentSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this._data = data;
    this.exists = data !== undefined;
  }
  data() {
    return this._data === undefined ? undefined : clone(this._data);
  }
  get(field) {
    return clone(getPath(this._data || {}, field));
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  forEach(fn) {
    this.docs.forEach(fn);
  }
}

class Query {
  constructor(db, collPath, filters = [], orders = [], lim = null) {
    this._db = db;
    this._path = collPath;
    this._filters = filters;
    this._orders = orders;
    this._limit = lim;
  }
  where(field, op, value) {
    return new Query(this._db, this._path, [...this._filters, { field, op, value }], this._orders, this._limit);
  }
  orderBy(field, dir = 'asc') {
    return new Query(this._db, this._path, this._filters, [...this._orders, { field, dir }], this._limit);
  }
  limit(n) {
    return new Query(this._db, this._path, this._filters, this._orders, n);
  }
  _match(data) {
    return this._filters.every(({ field, op, value }) => {
      const v = getPath(data, field);
      switch (op) {
        case '==':
          return eq(v, value);
        case '!=':
          return v !== undefined && !eq(v, value);
        case '<':
          return v !== undefined && cmp(v, value) < 0;
        case '<=':
          return v !== undefined && cmp(v, value) <= 0;
        case '>':
          return v !== undefined && cmp(v, value) > 0;
        case '>=':
          return v !== undefined && cmp(v, value) >= 0;
        case 'in':
          return value.some((x) => eq(v, x));
        case 'array-contains':
          return Array.isArray(v) && v.some((x) => eq(x, value));
        default:
          throw new Error('unsupported op ' + op);
      }
    });
  }
  _run() {
    const prefix = this._path + '/';
    const out = [];
    for (const [path, entry] of this._db._store) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes('/')) continue;
      if (!this._match(entry.data)) continue;
      // orderBy alanı olmayan belgeler sorgudan düşer (Firestore davranışı)
      if (this._orders.some((o) => getPath(entry.data, o.field) === undefined)) continue;
      out.push({ path, entry });
    }
    out.sort((a, b) => {
      for (const o of this._orders) {
        const c = cmp(getPath(a.entry.data, o.field), getPath(b.entry.data, o.field));
        if (c !== 0) return o.dir === 'desc' ? -c : c;
      }
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });
    return this._limit == null ? out : out.slice(0, this._limit);
  }
  async get() {
    await this._db._yield();
    return this._snapshot(this._run());
  }
  _snapshot(rows) {
    return new QuerySnapshot(rows.map((r) => new DocumentSnapshot(this._db.doc(r.path), r.entry.data)));
  }
}

class CollectionReference extends Query {
  constructor(db, path) {
    super(db, path);
    this.path = path;
    this.id = path.split('/').pop();
  }
  doc(id) {
    return new DocumentReference(this._db, `${this.path}/${id || this._db._autoId()}`);
  }
  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
  async listDocuments() {
    const prefix = this.path + '/';
    const ids = new Set();
    for (const path of this._db._store.keys()) {
      if (path.startsWith(prefix)) ids.add(path.slice(prefix.length).split('/')[0]);
    }
    return [...ids].map((id) => this.doc(id));
  }
}

class DocumentReference {
  constructor(db, path) {
    this._db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }
  get parent() {
    return new CollectionReference(this._db, this.path.split('/').slice(0, -1).join('/'));
  }
  collection(name) {
    return new CollectionReference(this._db, `${this.path}/${name}`);
  }
  async get() {
    await this._db._yield();
    return new DocumentSnapshot(this, this._db._store.get(this.path)?.data);
  }
  async set(data, opts) {
    this._db._applyWrites([{ type: 'set', ref: this, data, merge: Boolean(opts?.merge) }]);
  }
  async update(data) {
    this._db._applyWrites([{ type: 'update', ref: this, data }]);
  }
  async create(data) {
    this._db._applyWrites([{ type: 'create', ref: this, data }]);
  }
  async delete() {
    this._db._applyWrites([{ type: 'delete', ref: this }]);
  }
}

class Transaction {
  constructor(db) {
    this._db = db;
    this._reads = new Map(); // path -> version
    this._queryReads = []; // {query, signature}
    this._writes = [];
  }
  async get(refOrQuery) {
    if (this._writes.length > 0) {
      throw new FakeError('invalid-argument', 'Firestore transactions require all reads to be executed before all writes.');
    }
    await this._db._yield();
    if (refOrQuery instanceof DocumentReference) {
      const entry = this._db._store.get(refOrQuery.path);
      this._reads.set(refOrQuery.path, entry ? entry.version : 0);
      return new DocumentSnapshot(refOrQuery, entry?.data);
    }
    const rows = refOrQuery._run();
    this._queryReads.push({ query: refOrQuery, signature: rows.map((r) => `${r.path}@${r.entry.version}`).join('|') });
    for (const r of rows) this._reads.set(r.path, r.entry.version);
    return refOrQuery._snapshot(rows);
  }
  async getAll(...refs) {
    const out = [];
    for (const r of refs) out.push(await this.get(r));
    return out;
  }
  set(ref, data, opts) {
    this._writes.push({ type: 'set', ref, data, merge: Boolean(opts?.merge) });
    return this;
  }
  update(ref, data) {
    this._writes.push({ type: 'update', ref, data });
    return this;
  }
  create(ref, data) {
    this._writes.push({ type: 'create', ref, data });
    return this;
  }
  delete(ref) {
    this._writes.push({ type: 'delete', ref });
    return this;
  }
  _valid() {
    for (const [path, version] of this._reads) {
      const entry = this._db._store.get(path);
      if ((entry ? entry.version : 0) !== version) return false;
    }
    for (const { query, signature } of this._queryReads) {
      const now = query._run().map((r) => `${r.path}@${r.entry.version}`).join('|');
      if (now !== signature) return false;
    }
    return true;
  }
}

class WriteBatch {
  constructor(db) {
    this._db = db;
    this._writes = [];
  }
  set(ref, data, opts) {
    this._writes.push({ type: 'set', ref, data, merge: Boolean(opts?.merge) });
    return this;
  }
  update(ref, data) {
    this._writes.push({ type: 'update', ref, data });
    return this;
  }
  create(ref, data) {
    this._writes.push({ type: 'create', ref, data });
    return this;
  }
  delete(ref) {
    this._writes.push({ type: 'delete', ref });
    return this;
  }
  async commit() {
    await this._db._yield();
    this._db._applyWrites(this._writes);
  }
}

export class FakeFirestore {
  constructor({ clock = () => Date.now(), yieldEvery = true } = {}) {
    this._store = new Map();
    this._version = 0;
    this._clock = clock;
    this._yieldEvery = yieldEvery;
    this._idCounter = 0;
    this.stats = { txAttempts: 0, txConflicts: 0, txCommits: 0 };
    this._listeners = new Set();
  }
  // Önizleme (tarayıcı) için değişiklik bildirimi
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  _autoId() {
    this._idCounter += 1;
    return 'id' + this._idCounter.toString(36).padStart(6, '0') + Math.random().toString(36).slice(2, 8);
  }
  async _yield() {
    if (this._yieldEvery) await new Promise((r) => (typeof setImmediate === 'function' ? setImmediate(r) : setTimeout(r, 0)));
  }
  collection(path) {
    return new CollectionReference(this, path);
  }
  doc(path) {
    return new DocumentReference(this, path);
  }
  batch() {
    return new WriteBatch(this);
  }
  // Tüm yazmalar atomik uygulanır: önce doğrulama, sonra uygulama.
  _applyWrites(writes) {
    const staged = new Map();
    const current = (path) => (staged.has(path) ? staged.get(path) : this._store.get(path)?.data);
    for (const w of writes) {
      const path = w.ref.path;
      const cur = current(path);
      if (w.type === 'create') {
        if (cur !== undefined) throw new FakeError('already-exists', `Document already exists: ${path}`);
        staged.set(path, resolveValue(undefined, w.data, this._clock));
      } else if (w.type === 'set') {
        staged.set(path, w.merge ? deepMerge(cur, w.data, this._clock) : resolveValue(undefined, w.data, this._clock));
      } else if (w.type === 'update') {
        if (cur === undefined) throw new FakeError('not-found', `No document to update: ${path}`);
        const next = clone(cur);
        for (const [k, v] of Object.entries(w.data)) setPath(next, k, v, this._clock);
        staged.set(path, next);
      } else if (w.type === 'delete') {
        staged.set(path, undefined);
      }
    }
    for (const [path, data] of staged) {
      this._version += 1;
      if (data === undefined) this._store.delete(path);
      else this._store.set(path, { data, version: this._version });
    }
    if (this._listeners.size) for (const fn of this._listeners) fn([...staged.keys()]);
  }
  async runTransaction(fn, { maxAttempts = 5 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.stats.txAttempts += 1;
      const tx = new Transaction(this);
      const result = await fn(tx);
      // commit — doğrulama + uygulama arasında await YOK → atomik
      if (!tx._valid()) {
        this.stats.txConflicts += 1;
        lastErr = new FakeError('aborted', 'Transaction conflict');
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 3)));
        continue;
      }
      this._applyWrites(tx._writes);
      this.stats.txCommits += 1;
      return result;
    }
    throw lastErr;
  }
  async recursiveDelete(ref) {
    const prefix = ref.path + '/';
    for (const path of [...this._store.keys()]) {
      if (path === ref.path || path.startsWith(prefix)) this._store.delete(path);
    }
    if (this._listeners.size) for (const fn of this._listeners) fn([ref.path]);
  }
  // Test yardımcıları
  _dump(prefix = '') {
    const out = {};
    for (const [p, e] of this._store) if (p.startsWith(prefix)) out[p] = clone(e.data);
    return out;
  }
  _get(path) {
    return clone(this._store.get(path)?.data);
  }
}
