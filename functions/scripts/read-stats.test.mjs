// v165 — geçici okuma ölçümü: sunucu tarafı yalnızca temizleyip loglar
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReadStats, createReadStats } from '../readStats.js';

test('özet temizlenir ve sınırlanır', () => {
  const b = {};
  for (let i = 0; i < 200; i += 1) b[`users/*/coll${i}`] = [i, 1, 2, 3, 'x'];
  b['kötü<script>'] = [1, 1, 1, 1];
  b.notArray = 5;
  const s = sanitizeReadStats({ v: 165, sid: 'ab$c12', seq: 2, ms: 600000, vis: 1e12, rate: 5, app: 'web', b });
  assert.equal(s.sid, 'abc12');
  assert.equal(s.rate, 1);
  assert.equal(s.vis, 7 * 86400_000);
  assert.equal(Object.keys(s.b).length, 80);
  assert.deepEqual(s.b['users/*/coll3'], [3, 1, 2, 3]);
  assert.equal(sanitizeReadStats(null).sid, '');
  assert.deepEqual(sanitizeReadStats({ sid: 'a', b: { 'x/*': [-5, 'a', null, 2.7] } }).b['x/*'], [0, 0, 0, 2]);
});

test('fonksiyon: oturum açmamışsa loglamaz; açmışsa tek satır loglar, veritabanına dokunmaz', async () => {
  const logs = [];
  const onCall = (opts, fn) => Object.assign((r) => fn(r), { opts });
  const { clientReadStats } = createReadStats({ onCall, log: (o) => logs.push(o) });
  assert.equal(clientReadStats.opts.memory, '128MiB');
  assert.deepEqual(await clientReadStats({ data: { sid: 'x' } }), { ok: false });
  assert.deepEqual(await clientReadStats({ auth: { uid: 'u1' }, data: { sid: 'abc', b: { 'a/*': [1, 0, 1, 1] } } }), { ok: true });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].ns_read_stats, 1);
  assert.equal(JSON.stringify(logs[0]).includes('u1'), false, 'uid loglanmaz');
});
