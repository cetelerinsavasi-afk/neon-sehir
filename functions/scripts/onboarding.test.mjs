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
  // (v168.1: tek istisna yöneticinin kendi hesabını 1. göreve döndürmesi)
  assert.ok(!/onboardingStep: \d+/.test(chk.replace(/if \(ev === 'adminReset'\)[\s\S]*?return;\n    \}/, '')), 'sabit adım numarası yazılmaz');
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

test('v168.1: tek seferlik görev hakkı — sadece o görevdeyken ve bir kez', async () => {
  const { hasFreePass, storyStarted, ONBOARDING_ORDER: O } = await import('../onboardingData.js');
  const at = (id, extra = {}) => ({ onboardingStep: O.indexOf(id) + 1, onboardingV: 4, storyStarted: true, ...extra });
  assert.equal(hasFreePass(at(4), 4), true);
  assert.equal(hasFreePass(at(4, { obFree: { pray: true } }), 4), false, 'kullanıldıysa bir daha yok');
  assert.equal(hasFreePass(at(5), 4), false, 'görev geçtiyse yok');
  assert.equal(hasFreePass(at(6), 6), true);
  assert.equal(hasFreePass(at(7), 7), true);
  assert.equal(hasFreePass(at(7, { obFree: { bagis: true } }), 7), false);
  assert.equal(hasFreePass(at(3), 3), false, 'başka görevlerde hak yok');
  assert.equal(hasFreePass(null, 4), false);
  // hikâye başladı mı?
  assert.equal(storyStarted({}), false, 'yeni oyuncu: 3 yıl önce izlenmeden başlamaz');
  assert.equal(storyStarted({ onboardingStep: 3 }), false, 'eski kayıt bitmemiş → sıfırlanır, başlamamış');
  assert.equal(storyStarted({ storyStarted: true }), true);
  assert.equal(storyStarted({ onboardingStep: 2, onboardingV: 4 }), true, 'v4’te ilerlemiş oyuncu başlamış sayılır');
  assert.equal(storyStarted({ onboardingRewardClaimed: true }), true);
  assert.equal(storyStarted({ amcaDead: true }), true);
});

test('v168.1: sunucu — hikâye başlamadan görev ilerlemez; hak işlem içinde kullanılır; yönetici sıfırlaması korumalı', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const adv = src.slice(src.indexOf('async function advanceOnboardingStep'), src.indexOf('export const checkOnboardingProgress'));
  assert.ok(adv.indexOf('if (!storyStarted(user)) return;') > -1 && adv.indexOf('if (!storyStarted(user)) return;') < adv.indexOf('tx.update(userRef'));
  const chk = src.slice(src.indexOf('export const checkOnboardingProgress'), src.indexOf('export const completeOnboardingChecklist'));
  assert.ok(/ev === 'adminReset'\) \{\s*if \(!ADMIN_UIDS\.includes\(uid\)\) throw/.test(chk));
  assert.ok(chk.indexOf("if (!storyStarted(user)) return;") > chk.indexOf("ev === 'start'"));
  const pray = src.slice(src.indexOf('export const prayAtMosque'), src.indexOf('export const prayAtMosque') + 3000);
  assert.ok(pray.includes("if (!hasFreePass(user, 4)) throw"));
  assert.ok(/if \(freePass\) \{\s*tx\.update\(userRef, \{ \.\.\.updates, \[`obFree\.\$\{FREE_PASS_KEYS\[4\]\}`\]: true \}\);\s*return;/.test(pray), 'serbest ibadette cemaate yazılmaz');
  const vend = src.slice(src.indexOf('export const buyFromVendor'), src.indexOf('export const buyFromVendor') + 3500);
  assert.ok(vend.includes('if (!hasFreePass(user, 7)) throw'));
  assert.ok(vend.includes("'Bu satıcıdan bugün haraç kestin, aynı gün bağış yapamazsın.'"), 'haraç kesilen satıcıya bağış kuralı kalır');
  const heist = src.slice(src.indexOf('export const attemptHeist'), src.indexOf('export const attemptHeist') + 6000);
  assert.ok(heist.includes('hasFreePass(pre, 6)') && heist.includes('if (freePass && !hasFreePass(user, 6)) throw'));
});
