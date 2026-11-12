// v158 — uzak tır işi: Kervankent'e yakınken yük Kervankent'ten alınıp Neon Şehir'e götürülür
import test from 'node:test';
import assert from 'node:assert/strict';
import { planJob } from '../jobs.js';
import { FAR_DEPOT, FAR_TIR_LEN } from '../cityJobsData.js';

test('v158: uzak tır yakın uçtan kalkar (Kervankent → Neon Şehir dönüş işi)', () => {
  const back = planJob('tir', { x: FAR_DEPOT.x + 20, z: FAR_DEPOT.z }, true);
  assert.equal(back.task.from, 1);
  assert.equal(back.task.far, true);
  assert.ok(back.len > 3000 && back.len < FAR_TIR_LEN, `dönüş uzunluğu ${back.len}`);
  const go = planJob('tir', { x: 0, z: 0 }, true);
  assert.equal(go.task.from, undefined);
  assert.equal(go.len, FAR_TIR_LEN);
  assert.equal(planJob('tir', null, true).task.from, undefined);
});
