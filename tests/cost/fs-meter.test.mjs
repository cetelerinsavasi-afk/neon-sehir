// v165 — geçici okuma ölçümü: etiketler, sayım kuralları ve "oyuna etkisi yok"
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, collectionGroup, doc, query, where, limit, orderBy, or } from 'firebase/firestore';
import { createMeter, labelOf, pathPattern, wrapListenerArgs, RESUME_REBILL_MS } from '../../src/lib/fsMeter/meter.js';

const db = getFirestore(initializeApp({ projectId: 'demo-neon', apiKey: 'x' }));

test('etiketler: kimlikler * olur, değerler asla etikete girmez', () => {
  assert.equal(pathPattern('users/AbCdEfGhIjKlMnOpQrStUvWxYz12/inventory'), 'users/*/inventory');
  assert.equal(pathPattern('investments/current'), 'investments/current');
  assert.equal(labelOf(doc(db, 'users', 'AbCdEfGhIjKlMnOpQrStUvWxYz12')), 'doc:users/*');
  assert.equal(labelOf(collection(db, 'users', 'u123456789012345678', 'inventory')), 'col:users/*/inventory');
  const q = query(collection(db, 'heistPlans'), where('status', '==', 'open'), orderBy('createdAt'), limit(40));
  assert.equal(labelOf(q), 'q:heistPlans[status==] L40');
  const q2 = query(collection(db, 'houses'), where('invites.AbCdEfGhIjKlMnOpQrStUvWxYz12', '>', 5));
  assert.equal(labelOf(q2), 'q:houses[invites.*>]');
  assert.equal(labelOf(query(collectionGroup(db, 'members'), where('uid', '==', 'gizli'))), 'cg:members[uid==]');
  assert.ok(!labelOf(query(collection(db, 'raceRooms'), where('participantUids', 'array-contains', 'GIZLI-UID'))).includes('GIZLI'));
  assert.equal(labelOf(query(collection(db, 'x'), or(where('a', '==', 1), where('b', '==', 2)))), 'q:x[a==|b==]');
  assert.equal(labelOf(null), '?');
});

const qs = (n, changes, fromCache = false) => ({ metadata: { fromCache }, size: n, docChanges: () => new Array(changes).fill({}) });
const ds = (exists, fromCache = false) => ({ metadata: { fromCache }, exists: () => exists });

test('sorgu dinleyicisi: ilk yük + değişiklikler kesin; boş sonuç 1; önbellekten açılış olası', () => {
  const m = createMeter();
  const target = query(collection(db, 'globalChat'), limit(50));
  const a = m.listen(target);
  a.snap(qs(50, 50)); // sunucudan ilk yük
  a.snap(qs(50, 1)); // 1 yeni mesaj
  const b = m.listen(query(collection(db, 'empty')));
  b.snap(qs(0, 0)); // boş sorgu → 1
  const c = m.listen(collection(db, 'cached'));
  c.snap(qs(7, 7, true)); // önbellekten → olası 7
  c.snap(qs(7, 2)); // sunucu: 2 değişen
  const s = m.take();
  assert.deepEqual(s.b['q:globalChat L50'], [51, 0, 2, 1]);
  assert.deepEqual(s.b['col:empty'], [1, 0, 1, 1]); // kısıtsız query() koleksiyonun kendisi
  assert.deepEqual(s.b['col:cached'], [2, 7, 2, 1]);
  assert.equal(s.total, 54);
  assert.deepEqual(m.take().b, {}, 'take sıfırlar');
});

test('belge dinleyicisi ve get: sunucudan gelen her olay 1; önbellek sayılmaz', () => {
  const m = createMeter();
  const d = m.listen(doc(db, 'users', 'AbCdEfGhIjKlMnOpQrStUvWxYz12'));
  d.snap(ds(true));
  d.snap(ds(true));
  m.got(query(collection(db, 'houses'), where('ownerUid', '==', 'x')), qs(3, 3));
  m.got(query(collection(db, 'houses'), where('ownerUid', '==', 'x')), qs(0, 0));
  m.got(doc(db, 'config', 'main'), ds(false));
  m.got(doc(db, 'config', 'main'), ds(true, true));
  const s = m.take();
  assert.deepEqual(s.b['doc:users/*'], [2, 0, 2, 1]);
  assert.deepEqual(s.b['q:houses[ownerUid==] (get)'], [4, 0, 2, 0]);
  assert.deepEqual(s.b['doc:config/main (get)'], [1, 0, 1, 0]);
});

test('ağ 30 dk+ kapalı kalıp açılınca açık dinleyiciler olası yeniden okuma; kapananlar sayılmaz', () => {
  let t = 0;
  const m = createMeter({ now: () => t });
  const a = m.listen(collection(db, 'a'));
  a.snap(qs(10, 10));
  const b = m.listen(collection(db, 'b'));
  b.snap(qs(4, 4));
  b.close();
  m.networkOff();
  t += RESUME_REBILL_MS - 1;
  m.networkOn();
  assert.equal(m.take().b['col:a']?.[1] ?? 0, 0, '30 dk altı: resume token, ek okuma yok');
  m.networkOff();
  t += RESUME_REBILL_MS + 1;
  m.networkOn();
  const s = m.take();
  assert.deepEqual(s.b['col:a'], [0, 10, 0, 0]);
  assert.equal(s.b['col:b'], undefined);
  assert.equal(m._active(), 1);
});

test('görünür süre ölçülür', () => {
  let t = 0;
  const m = createMeter({ now: () => t, isVisible: () => true });
  t = 1000;
  m.visibility(false);
  t = 5000;
  m.visibility(true);
  t = 6000;
  const s = m.take();
  assert.equal(s.ms, 6000);
  assert.equal(s.vis, 2000);
});

test('OYUNA ETKİSİ YOK: uygulamanın geri çağrısı aynı anlık görüntüyü alır; sayaç hatası yutulur', () => {
  const seen = [];
  const snap = qs(1, 1);
  const fn = (s) => {
    seen.push(s);
    return 'r';
  };
  // (onNext, onError)
  let w = wrapListenerArgs([fn, () => {}], () => {});
  assert.equal(w[0](snap), 'r');
  assert.equal(seen[0], snap);
  assert.equal(w.length, 2);
  // (options, onNext)
  const opts = { includeMetadataChanges: true };
  w = wrapListenerArgs([opts, fn], () => {});
  assert.equal(w[0], opts);
  w[1](snap);
  assert.equal(seen[1], snap);
  // observer
  const errs = [];
  w = wrapListenerArgs([{ next: fn, error: (e) => errs.push(e) }], () => {});
  w[0].next(snap);
  w[0].error('E');
  assert.equal(seen[2], snap);
  assert.deepEqual(errs, ['E']);
  // sayaç patlarsa: meter.snap kendi içinde yakalar
  const m = createMeter();
  const rec = m.listen(collection(db, 'x'));
  assert.doesNotThrow(() => rec.snap({ get metadata() { throw new Error('boom'); } }));
});
