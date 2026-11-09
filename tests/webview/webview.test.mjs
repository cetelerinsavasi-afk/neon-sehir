// v148 — Android WebView kabuğu: platform tespiti + native köprü testleri.
// Çalıştır (proje kökünden):  node --test tests/webview/webview.test.mjs
// Her senaryo temiz bir alt süreçte çalışır (modül değerleri açılışta bir kez hesaplanır).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const WEBVIEW_UA_NO_MARK = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36';
const APP_UA = `${WEBVIEW_UA_NO_MARK} NeonSehirApp/14`;

function run(scenario, env) {
  // --import dosya ADRESİ ister (Windows'ta C:\... yolu kabul edilmez)
  const loaderUrl = pathToFileURL(`${dir}loader.mjs`).href;
  const raw = execFileSync(process.execPath, ['--import', loaderUrl, `${dir}probe.mjs`, scenario], {
    env: { ...process.env, NS_ENV: JSON.stringify(env) },
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

// ---------------------------------------------------------------- Tarayıcı
test('tarayıcı (masaüstü): WEB, hiçbir Android bayrağı yok', () => {
  const r = run('platform', { url: 'https://cetelerinsavasi.com/' });
  assert.equal(r.PLATFORM, 'web');
  assert.equal(r.IS_ANDROID_APP, false);
  assert.equal(r.IS_ANDROID_WEBVIEW, false);
  assert.equal(r.IS_ANDROID_TWA, false);
  assert.equal(r.session, null);
});

test('Android Chrome UA (genel "Android") → yine WEB', () => {
  const r = run('platform', { ua: ANDROID_CHROME_UA });
  assert.equal(r.PLATFORM, 'web');
});

test('başka bir WebView UA ("wv" var, bizim ek yok) → WEB', () => {
  const r = run('platform', { ua: WEBVIEW_UA_NO_MARK });
  assert.equal(r.PLATFORM, 'web');
});

test('başka uygulamanın referrer\'ı (WhatsApp) → WEB', () => {
  const r = run('platform', { referrer: 'android-app://com.whatsapp/' });
  assert.equal(r.PLATFORM, 'web');
});

test('tarayıcıda köprü fonksiyonları hiçbir şey yapmaz', () => {
  assert.equal(run('exit', {}).exit, false);
  assert.equal(run('signin', {}).signin, null);
  assert.equal(run('save-small', {}).save, null);
  const c = run('copy', { clipboard: 'fail' });
  assert.equal(c.copyErr, 'NotAllowedError'); // tarayıcıdaki hata aynen
  assert.equal(run('copy', { clipboard: 'ok' }).copy, true);
});

// ---------------------------------------------------------------- Eski TWA
test('eski TWA: ?src=twa&av=12 → ANDROID + TWA, URL temizlenir', () => {
  const r = run('platform', { url: 'https://cetelerinsavasi.com/?src=twa&av=12#x', ua: ANDROID_CHROME_UA });
  assert.equal(r.PLATFORM, 'android');
  assert.equal(r.IS_ANDROID_TWA, true);
  assert.equal(r.IS_ANDROID_WEBVIEW, false);
  assert.equal(r.ANDROID_APP_VERSION, 12);
  assert.equal(r.ANDROID_UPDATE_REQUIRED, false);
  assert.equal(r.href, 'https://cetelerinsavasi.com/#x');
  assert.equal(r.session, 'android');
});

test('eski TWA: referrer android-app://com.cetelerinsavasi.twa → TWA', () => {
  const r = run('platform', { referrer: 'android-app://com.cetelerinsavasi.twa/', ua: ANDROID_CHROME_UA });
  assert.equal(r.IS_ANDROID_TWA, true);
});

test('eski TWA: yenileme (sadece sessionStorage işareti) → TWA, sürüm korunur', () => {
  const r = run('platform', { ua: ANDROID_CHROME_UA, session: { ns_platform: 'android', ns_app_ver: '12' } });
  assert.equal(r.IS_ANDROID_TWA, true);
  assert.equal(r.ANDROID_APP_VERSION, 12);
});

test('eski TWA (av yok, 1.0.12 öncesi) → güncelleme zorunlu (davranış değişmedi)', () => {
  const r = run('platform', { url: 'https://cetelerinsavasi.com/?src=twa' });
  assert.equal(r.ANDROID_UPDATE_REQUIRED, true);
});

test('eski TWA\'da köprü yok → yardımcılar devre dışı', () => {
  const r = run('exit', { url: 'https://cetelerinsavasi.com/?src=twa&av=12' });
  assert.equal(r.hasBridge, false);
  assert.equal(r.exit, false);
});

// ---------------------------------------------------------------- WebView
test('WebView: ?src=app&av=14 + UA eki + köprü → ANDROID + WEBVIEW', () => {
  const r = run('platform', { url: 'https://cetelerinsavasi.com/?src=app&av=14', ua: APP_UA, bridge: true });
  assert.equal(r.PLATFORM, 'android');
  assert.equal(r.IS_ANDROID_APP, true);
  assert.equal(r.IS_ANDROID_WEBVIEW, true);
  assert.equal(r.IS_ANDROID_TWA, false);
  assert.equal(r.ANDROID_APP_VERSION, 14);
  assert.equal(r.ANDROID_UPDATE_REQUIRED, false);
  assert.equal(r.ANDROID_UPDATE_AVAILABLE, false);
  assert.equal(r.href, 'https://cetelerinsavasi.com/');
});

test('WebView: deep link yolu + diğer parametreler korunur', () => {
  const r = run('platform', { url: 'https://cetelerinsavasi.com/davet/ABC?ref=x&src=app&av=14', ua: APP_UA, bridge: true });
  assert.equal(r.href, 'https://cetelerinsavasi.com/davet/ABC?ref=x');
});

test('WebView: tarayıcıya ?src=app verilip yenilenirse yine WebView sayılır (TWA değil)', () => {
  const r = run('platform', { session: { ns_platform: 'android', ns_shell: 'webview' } });
  assert.equal(r.IS_ANDROID_WEBVIEW, true);
  assert.equal(r.IS_ANDROID_TWA, false);
});

test('WebView: tek başına her sinyal yeterli', () => {
  assert.equal(run('platform', { url: 'https://cetelerinsavasi.com/?src=app&av=14' }).IS_ANDROID_WEBVIEW, true);
  const ua = run('platform', { ua: APP_UA });
  assert.equal(ua.IS_ANDROID_WEBVIEW, true);
  assert.equal(ua.ANDROID_APP_VERSION, 14); // yenilemede UA'dan okunur
  assert.equal(run('platform', { bridge: true }).IS_ANDROID_WEBVIEW, true);
});

test('WebView: Google girişi idToken döner (JSON kaçışlı)', () => {
  const r = run('signin', { ua: APP_UA, bridge: true });
  assert.equal(r.signin.ok, true);
  assert.equal(r.signin.idToken, 'tok"en ');
});

test('WebView: native yanıt gelmezse zaman aşımı (reddetmez)', () => {
  const r = run('timeout', { ua: APP_UA, bridge: 'silent' });
  assert.equal(r.signin.ok, false);
  assert.equal(r.signin.timeout, true);
});

test('WebView: exitApp ve signOutGoogle köprüye gider', () => {
  assert.equal(run('exit', { ua: APP_UA, bridge: true }).exit, true);
  assert.deepEqual(run('signout', { ua: APP_UA, bridge: true }).calls, [['signOutGoogle']]);
});

test('WebView: pano başarısızsa native copyText yedeği', () => {
  const r = run('copy', { ua: APP_UA, bridge: true, clipboard: 'fail' });
  assert.equal(r.copy, true);
  assert.deepEqual(r.calls, [['copyText', 'abc']]);
  const ok = run('copy', { ua: APP_UA, bridge: true, clipboard: 'ok' });
  assert.deepEqual(ok.calls, []); // pano çalışıyorsa köprü hiç çağrılmaz
});

test('WebView: küçük dosya tek saveFile çağrısıyla', () => {
  const r = run('save-small', { ua: APP_UA, bridge: true });
  assert.equal(r.save.ok, true);
  assert.equal(r.sameBytes, true);
  assert.equal(r.calls.filter((c) => c[0] === 'saveFile').length, 1);
});

test('WebView: büyük dosya 512 KB parçalarla, baytlar birebir aynı', () => {
  const r = run('save-big', { ua: APP_UA, bridge: true });
  assert.equal(r.save.ok, true);
  assert.equal(r.sameBytes, true);
  const chunks = r.calls.filter((c) => c[0] === 'saveFileChunk');
  assert.equal(chunks.length, 3); // 1.300.000 B → 512K + 512K + kalan
  assert.ok(chunks.every((c) => c[1] <= Math.ceil((512 * 1024) / 3) * 4));
});
