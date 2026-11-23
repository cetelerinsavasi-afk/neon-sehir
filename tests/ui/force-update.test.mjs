// v188 — zorunlu güncelleme (src/lib/forceUpdate.js). Çalıştır: node --test tests/ui/force-update.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILD, createForceUpdate, isOutdated, IDLE_MS, RELOAD_GAP_MS, RELOAD_KEY, BUSY_SELECTOR } from '../../src/lib/forceUpdate.js';

function rig({ minBuild = BUILD + 1, busy = false, hidden = false } = {}) {
  const st = { t: 1_000_000, reloads: [], busy, hidden, flags: { minBuild }, store: new Map() };
  const fu = createForceUpdate({
    now: () => st.t,
    fetchFlags: async () => st.flags,
    reload: (why) => st.reloads.push(why),
    isBusy: () => st.busy,
    isHidden: () => st.hidden,
    storage: { getItem: (k) => st.store.get(k) ?? null, setItem: (k, v) => st.store.set(k, v) },
  });
  return { st, fu };
}

test('isOutdated: minBuild yoksa / bozuksa / eşitse eski değil', () => {
  assert.equal(isOutdated(null), false);
  assert.equal(isOutdated({}), false);
  assert.equal(isOutdated({ minBuild: 'x' }), false);
  assert.equal(isOutdated({ minBuild: BUILD }), false);
  assert.equal(isOutdated({ minBuild: BUILD + 1 }), true);
});

test('güncel sürüm: hiç yenilenmez', async () => {
  const { st, fu } = rig({ minBuild: BUILD });
  await fu.check('start');
  st.hidden = true;
  fu.hidden();
  st.t += IDLE_MS * 2;
  fu.tick();
  assert.deepEqual(st.reloads, []);
});

test('açılışta eski + oyuncu henüz dokunmadı → hemen yenilenir', async () => {
  const { st, fu } = rig();
  await fu.check('start');
  assert.deepEqual(st.reloads, ['start']);
});

test('açılışta eski ama oyuncu dokunmuş → beklenir, uygulama arka plana alınınca yenilenir', async () => {
  const { st, fu } = rig();
  fu.input();
  await fu.check('start');
  assert.deepEqual(st.reloads, []);
  st.hidden = true;
  fu.hidden();
  assert.deepEqual(st.reloads, ['hidden']);
});

test('açık ekranda: 3 dk dokunulmadıysa ve meşgul değilse yenilenir', async () => {
  const { st, fu } = rig();
  fu.input();
  await fu.check('check');
  st.t += IDLE_MS - 1000;
  fu.tick();
  assert.deepEqual(st.reloads, [], 'henüz 3 dk olmadı');
  st.t += 2000;
  fu.tick();
  assert.deepEqual(st.reloads, ['idle']);
});

test('meşgulken (araç / yarış / yazı) asla yenilenmez; meşguliyet bitince yenilenir', async () => {
  const { st, fu } = rig({ busy: true });
  fu.input();
  await fu.check('check');
  st.t += IDLE_MS * 5;
  fu.tick();
  assert.deepEqual(st.reloads, []);
  st.busy = false;
  fu.tick();
  assert.deepEqual(st.reloads, ['idle']);
});

test('açılışta meşgulse (ör. hemen yazı alanı) beklenir', async () => {
  const { st, fu } = rig({ busy: true });
  await fu.check('start');
  assert.deepEqual(st.reloads, []);
});

test('döngü koruması: 10 dk içinde ikinci yenileme yok', async () => {
  const { st, fu } = rig();
  await fu.check('start');
  assert.equal(st.reloads.length, 1);
  assert.equal(Number(st.store.get(RELOAD_KEY)), st.t);
  // CDN eski dosyayı vermiş gibi: yeni sayfa da eski çıktı
  const again = createForceUpdate({
    now: () => st.t + 60_000,
    fetchFlags: async () => st.flags,
    reload: (why) => st.reloads.push(why),
    isBusy: () => false,
    isHidden: () => false,
    storage: { getItem: (k) => st.store.get(k) ?? null, setItem: (k, v) => st.store.set(k, v) },
  });
  await again.check('start');
  assert.equal(st.reloads.length, 1, 'yenilenmedi');
  const later = createForceUpdate({
    now: () => st.t + RELOAD_GAP_MS + 1,
    fetchFlags: async () => st.flags,
    reload: (why) => st.reloads.push(why),
    isBusy: () => false,
    isHidden: () => false,
    storage: { getItem: (k) => st.store.get(k) ?? null, setItem: (k, v) => st.store.set(k, v) },
  });
  await later.check('start');
  assert.equal(st.reloads.length, 2, '10 dk sonra yeniden denenir');
});

test('bayrak dosyası okunamazsa hiçbir şey yapılmaz', async () => {
  const st = { reloads: [] };
  const fu = createForceUpdate({
    now: () => 1,
    fetchFlags: async () => {
      throw new Error('ağ yok');
    },
    reload: (w) => st.reloads.push(w),
    isBusy: () => false,
    isHidden: () => true,
    storage: null,
  });
  assert.equal(await fu.check('start'), false);
  fu.hidden();
  assert.deepEqual(st.reloads, []);
});

test('meşgul seçicileri: sürüş, iş, yarış, arcade, slot, yayın, yazı alanı', () => {
  for (const s of ['.cs-drive', '.cs-job.on', '.race-fullscreen', '.ta-root', '.gs-runner', '.slot-screen', '.st-hostfs', 'input:focus', 'textarea:focus', '.ns-busy']) {
    assert.ok(BUSY_SELECTOR.split(', ').includes(s), s);
  }
  const city = readFileSync(new URL('../../src/components/City/CityScreen.jsx', import.meta.url), 'utf8');
  assert.match(city, /<div className="cs-drive">/, 'sürüş tuşları .cs-drive sınıfında');
  assert.match(city, /\{riding && \(\s*<div className="hs-actions ns-busy">/, 'yolcu da meşgul sayılır');
  assert.match(city, /className=\{`cs-job\$\{jobUi\?\.active \? ' on' : ''\}`\}/, 'iş sürerken .cs-job.on');
});

test('neon-flags.json: minBuild bu sürümden büyük değil (yeni sürüm kendini yenilemez)', () => {
  const flags = JSON.parse(readFileSync(new URL('../../public/neon-flags.json', import.meta.url), 'utf8'));
  assert.ok(Number.isInteger(flags.minBuild));
  assert.ok(flags.minBuild <= BUILD, `minBuild ${flags.minBuild} > BUILD ${BUILD}`);
});
