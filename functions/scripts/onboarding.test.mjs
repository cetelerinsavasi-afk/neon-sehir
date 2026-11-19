// v124 — yeni oyuncu görevleri: 20 → 17 görev, güvenli geçiş (functions/onboardingData.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ONBOARDING_ORDER,
  ONBOARDING_TASK_COUNT,
  ONBOARDING_REMOVED_IDS,
  migrateOnboardingStep,
  onboardingPosOf,
  onboardingTaskIdAt,
  currentOnboardingTaskId,
} from '../onboardingData.js';

test('18 görev; slot (8), 2. el alışveriş (15), silah malzemesi (18) yok', () => {
  assert.equal(ONBOARDING_TASK_COUNT, 18);
  for (const r of ONBOARDING_REMOVED_IDS) assert.ok(!ONBOARDING_ORDER.includes(r));
  assert.deepEqual(ONBOARDING_ORDER.slice(0, 3), [21, 1, 2]); // v167: ışınlan → fabrikada çalış → yasaklı madde
});

test('geçiş: kaldırılan görevdeyse sonrakine geçer, gerisindeyse onları yapmaz, ilerisindeyse başa dönmez', () => {
  // eski adım → yeni sıradaki görev kimliği
  const taskAfter = (oldStep) => currentOnboardingTaskId({ onboardingStep: oldStep }); // eski (v1) kayıt
  assert.equal(taskAfter(1), 21, 'eski 1 → yeni 1. görev (ışınlan)');
  for (let s = 2; s <= 7; s++) assert.equal(taskAfter(s), s, `eski ${s} aynı görevde`);
  assert.equal(taskAfter(8), 9, 'slot görevindeyken → şüphe görevine geçer');
  assert.equal(taskAfter(9), 9);
  assert.equal(taskAfter(14), 14);
  assert.equal(taskAfter(15), 16, '2. el görevindeyken → avatar görevine geçer');
  assert.equal(taskAfter(17), 17);
  assert.equal(taskAfter(18), 19, 'silah malzemesi görevindeyken → silah geliştirme görevine geçer');
  assert.equal(taskAfter(20), 20);
  assert.equal(migrateOnboardingStep(21), 18, 'hepsini bitirmiş → bitti (v2)');
  assert.equal(onboardingPosOf({ onboardingStep: 21 }), 19, 'hepsini bitirmiş → bitti (v3)');
  assert.equal(onboardingTaskIdAt(19), null);
  // her eski kalan görev kendi kimliğine eşlenir (kimse geri gitmez / görev atlamaz)
  for (const id of ONBOARDING_ORDER) if (id !== 21 && id !== 1) assert.equal(taskAfter(id), id);
});

test('onboardingV: 3 olan oyuncunun adımı çevrilmez; v2 / eski kayıt aynı görevde kalır; eksik/bozuk adım 1 sayılır', () => {
  assert.equal(onboardingPosOf({ onboardingStep: 9, onboardingV: 3 }), 9);
  assert.equal(currentOnboardingTaskId({ onboardingStep: 9, onboardingV: 3 }), 9);
  assert.equal(onboardingPosOf({ onboardingStep: 8, onboardingV: 2 }), 9, 'v2 8 → v3 9 (görev 9)');
  assert.equal(currentOnboardingTaskId({ onboardingStep: 8, onboardingV: 2 }), 9);
  assert.equal(onboardingPosOf({ onboardingStep: 8 }), 9, 'eski kayıt: 8 → 9 (görev 9)');
  assert.equal(currentOnboardingTaskId({ onboardingStep: 16 }), 16, 'hâlâ avatar görevinde');
  assert.equal(onboardingPosOf({}), 1);
  assert.equal(onboardingPosOf(null), 1);
  assert.equal(onboardingPosOf({ onboardingStep: 99, onboardingV: 3 }), 19);
  assert.equal(onboardingPosOf({ onboardingStep: 18, onboardingV: 2 }), 19, 'v2 hepsini bitirmiş → v3 bitti');
  // v2'de her sıradaki oyuncu AYNI görevde kalır (yeni görev araya girdi diye geri gitmez)
  const V2 = [21, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20];
  V2.forEach((id, i) => assert.equal(currentOnboardingTaskId({ onboardingStep: i + 1, onboardingV: 2 }), id));
});

test('index.js: kaldırılan görevler okuma yapmaz; ilerleme yeni sırayla yazılır; güvenli park satışı görevi ilerletmez', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  for (const id of [8, 15, 18]) assert.ok(!src.includes(`advanceOnboardingStep(uid, ${id})`), `görev ${id} çağrısı yok`);
  const adv = src.slice(src.indexOf('async function advanceOnboardingStep'), src.indexOf('export const checkOnboardingProgress'));
  assert.ok(adv.indexOf('ONBOARDING_ORDER.includes(taskNumber)') < adv.indexOf('runTransaction'));
  assert.ok(adv.includes('onboardingStep: pos + 1, onboardingV: ONBOARDING_V'));
  const chk = src.slice(src.indexOf('export const checkOnboardingProgress'), src.indexOf('export const completeOnboardingChecklist'));
  assert.ok(!/onboardingStep: \d+/.test(chk), 'sabit adım numarası yazılmaz');
  const safe = src.slice(src.indexOf('async function sellContrabandSafe'), src.indexOf('export const sellContrabandAtPark'));
  assert.ok(!safe.includes('advanceOnboardingStep(uid, 3)'));
  const risky = src.slice(src.indexOf('export const sellContrabandAtPark')).slice(0, 6000);
  assert.ok(risky.includes('advanceOnboardingStep(uid, 3)'));
});

test('v160.3 / v167: yeni oyuncu önce ışınlanır, sonra fabrikada çalışır; ilerisindekiler sıfırlanmaz', () => {
  assert.equal(currentOnboardingTaskId({}), 21);
  assert.equal(currentOnboardingTaskId({ onboardingStep: 1, onboardingV: 2 }), 21);
  assert.equal(currentOnboardingTaskId({ onboardingStep: 2, onboardingV: 3 }), 1, 'v3: 2. görev = fabrikada çalış');
  assert.equal(currentOnboardingTaskId({ onboardingStep: 2, onboardingV: 2 }), 2, 'v2 kaydı fabrika görevini atlar');
  assert.equal(currentOnboardingTaskId({ onboardingStep: 2 }), 2);
});

test('v167: fabrikada maaş alınca görev 1 ilerler', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(src.includes('await advanceOnboardingStep(uid, 1);'));
});
