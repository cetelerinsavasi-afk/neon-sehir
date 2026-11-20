// v124 — yeni oyuncu görevleri: 20 → 17 görev, güvenli geçiş (functions/onboardingData.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ONBOARDING_ORDER,
  ONBOARDING_TASK_COUNT,
  ONBOARDING_REMOVED_IDS,
  AMCA_FINALE_TASK_ID,
  legacyV3Pos,
  onboardingPosOf,
  onboardingTaskIdAt,
  currentOnboardingTaskId,
} from '../onboardingData.js';

test('v168: 19 görev; kaldırılanlar yok; fabrika → ışınlan → yasaklı madde; hurdalık (22) çeteden önce', () => {
  assert.equal(ONBOARDING_TASK_COUNT, 19);
  for (const r of ONBOARDING_REMOVED_IDS) assert.ok(!ONBOARDING_ORDER.includes(r));
  assert.deepEqual(ONBOARDING_ORDER.slice(0, 3), [1, 21, 2]);
  assert.deepEqual(ONBOARDING_ORDER.slice(-2), [AMCA_FINALE_TASK_ID, 20]);
  assert.equal(new Set(ONBOARDING_ORDER).size, ONBOARDING_ORDER.length);
});

test('v168 sıfırlama: eski kayıtta bitirmemiş → 1. görev; bitirmiş (Tamam’a bassın basmasın) → bitti', () => {
  const DONE = ONBOARDING_TASK_COUNT + 1;
  // bitirmemiş (v1 / v2 / v3 her sırada) → baştan
  for (let s = 1; s <= 20; s++) assert.equal(onboardingPosOf({ onboardingStep: s }), 1, `v1 ${s}`);
  for (let s = 1; s <= 17; s++) assert.equal(onboardingPosOf({ onboardingStep: s, onboardingV: 2 }), 1, `v2 ${s}`);
  for (let s = 1; s <= 18; s++) assert.equal(onboardingPosOf({ onboardingStep: s, onboardingV: 3 }), 1, `v3 ${s}`);
  // eski listede hepsi bitmiş ama "Tamam"a basmamış → bitti (sıfırlanmaz)
  assert.equal(onboardingPosOf({ onboardingStep: 21 }), DONE);
  assert.equal(onboardingPosOf({ onboardingStep: 18, onboardingV: 2 }), DONE);
  assert.equal(onboardingPosOf({ onboardingStep: 19, onboardingV: 3 }), DONE);
  // Tamam'a basmış (onboardingRewardClaimed) → hangi kayıt olursa olsun bitti
  assert.equal(onboardingPosOf({ onboardingStep: 3, onboardingV: 3, onboardingRewardClaimed: true }), DONE);
  assert.equal(onboardingPosOf({ onboardingRewardClaimed: true }), DONE);
  assert.equal(currentOnboardingTaskId({ onboardingStep: 9, onboardingV: 3, onboardingRewardClaimed: true }), null);
  assert.equal(legacyV3Pos({ onboardingStep: 8, onboardingV: 2 }), 9);
});

test('v168: onboardingV 4 kaydı çevrilmez; eksik/bozuk adım 1; taşan adım bitti', () => {
  ONBOARDING_ORDER.forEach((id, i) => assert.equal(currentOnboardingTaskId({ onboardingStep: i + 1, onboardingV: 4 }), id));
  assert.equal(onboardingPosOf({}), 1);
  assert.equal(onboardingPosOf(null), 1);
  assert.equal(currentOnboardingTaskId({}), 1, 'yeni oyuncu fabrikayla başlar');
  assert.equal(onboardingPosOf({ onboardingStep: 'x', onboardingV: 4 }), 1);
  assert.equal(onboardingPosOf({ onboardingStep: 99, onboardingV: 4 }), ONBOARDING_TASK_COUNT + 1);
  assert.equal(onboardingTaskIdAt(ONBOARDING_TASK_COUNT + 1), null);
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

test('v168: hurdalık görevi sadece finale olayıyla geçer (mezar aynı yazmada); kredi aktifse otomatik; replay görevlere dokunmaz', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('advanceOnboardingStep(uid, 22)'));
  const chk = src.slice(src.indexOf('export const checkOnboardingProgress'), src.indexOf('export const completeOnboardingChecklist'));
  assert.ok(/currentStep === AMCA_FINALE_TASK_ID\) \{[\s\S]{0,400}ev === 'finale'\) tx\.update\(userRef, \{ onboardingStep: pos \+ 1, onboardingV: ONBOARDING_V, amcaDead: true \}/.test(chk));
  assert.ok(/currentStep === 14\) \{[\s\S]{0,200}if \(user\.credit\) pass\(\)/.test(chk));
  const rep = chk.slice(chk.indexOf("if (ev === 'replay')"), chk.indexOf('if (currentStep === 21)'));
  assert.ok(rep.includes('!user.amcaDead && pos > ONBOARDING_TASK_COUNT'));
  assert.ok(!rep.includes('onboardingStep'), 'replay görev sırasını yazmaz');
});

test('v167: fabrikada maaş alınca görev 1 ilerler', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(src.includes('await advanceOnboardingStep(uid, 1);'));
});
