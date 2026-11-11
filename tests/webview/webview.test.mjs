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

function run(scenario, env, extraEnv = {}) {
  // --import dosya ADRESİ ister (Windows'ta C:\... yolu kabul edilmez)
  const loaderUrl = pathToFileURL(`${dir}loader.mjs`).href;
  const raw = execFileSync(process.execPath, ['--import', loaderUrl, `${dir}probe.mjs`, scenario], {
    env: { ...process.env, NS_ENV: JSON.stringify(env), ...extraEnv },
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

// ---------------------------------------------------------------- v155 Zümrüt (native Play)
const APP15_UA = `${WEBVIEW_UA_NO_MARK} NeonSehirApp/15`;
const sha = (t) => import('node:crypto').then((c) => c.createHash('sha256').update(t).digest('hex'));

test('zümrüt: tarayıcıda mağaza açık (Shopier yolu), Play servisi yok, geri yükleme yok', () => {
  const r = run('billing-store', {});
  assert.equal(r.billingCap, false);
  assert.equal(r.storeOpen, false); // WebView değil → bu bayrak sadece WebView içindir
  assert.equal(r.reachable, true); // "Telefon › Zümrüt Mağazası" yazısı görünür
  assert.equal(r.restoreOk, false);
  assert.equal(r.service, null);
});

test('zümrüt: eski TWA (Digital Goods yok bu ortamda) → native servis asla seçilmez', () => {
  const r = run('billing-store', { url: 'https://cetelerinsavasi.com/?src=twa&av=13' });
  assert.equal(r.billingCap, false);
  assert.equal(r.reachable, true);
  assert.equal(r.restoreOk, true); // TWA geri yüklemesi eskisi gibi
  assert.equal(r.service, null); // getDigitalGoodsService yok → null (davranış değişmedi)
});

test('zümrüt: WebView v14 (köprüde faturalandırma yok) → mağaza KAPALI, yazı gizli, geri yükleme yok', () => {
  const r = run('billing-store', { ua: APP_UA, bridge: true });
  assert.equal(r.billingCap, false);
  assert.equal(r.storeOpen, false);
  assert.equal(r.reachable, false);
  assert.equal(r.restoreOk, false);
  assert.equal(r.service, null);
});

test('zümrüt: WebView v15 (billing:true) → mağaza AÇIK, native servis, Play fiyatları', () => {
  const r = run('billing-prices', { ua: APP15_UA, bridge: true, billing: {} });
  assert.equal(r.billingCap, true);
  assert.equal(r.storeOpen, true);
  assert.equal(r.reachable, true);
  assert.equal(r.restoreOk, true);
  assert.equal(r.service, 'native');
  assert.deepEqual(r.prices, { zumrut_50: '₺49,99', zumrut_200: '₺159,99' });
  assert.equal(r.unavailable, false);
});

test('zümrüt: Play bu cihazda kullanılamıyor → mağaza açık ama "kullanılamıyor" işareti', () => {
  const r = run('billing-prices', { ua: APP15_UA, bridge: true, billing: { unavailable: true } });
  assert.equal(r.storeOpen, true);
  assert.equal(r.unavailable, true);
  assert.deepEqual(r.prices, {});
});

test("zümrüt: satın al → UID SHA-256 özeti Play'e, sunucu doğrular, sonra tüketilir (bir kez)", async () => {
  const r = run('billing-buy', { ua: APP15_UA, bridge: true, billing: {} });
  assert.equal(r.buy.ok, true);
  assert.equal(r.buy.emerald, 50);
  const want = await sha('uid-123');
  assert.equal(r.hash, want);
  const p = r.calls.find((c) => c[0] === 'billingPurchase');
  assert.deepEqual(p, ['billingPurchase', 'zumrut_50', want]); // ham UID gitmez
  assert.ok(!JSON.stringify(r.calls).includes('uid-123'));
  assert.deepEqual(r.verify, [['zumrut_50', 'tok_zumrut_50']]);
  const iv = r.calls.findIndex((c) => c[0] === 'billingConsume');
  assert.ok(iv > r.calls.findIndex((c) => c[0] === 'billingPurchase'), 'tüketme doğrulamadan SONRA');
});

test('zümrüt: birden çok adet → sunucuya GÖNDERİLMEZ, tüketilmez (3 günde otomatik iade)', () => {
  const r = run('billing-buy', { ua: APP15_UA, bridge: true, billing: { purchase: { ok: true, productId: 'zumrut_50', purchaseToken: 'tokQ', quantity: 3 } } });
  assert.match(r.buy.thrown, /birden fazla paket/);
  assert.deepEqual(r.verify, []);
  assert.ok(!r.calls.some((c) => c[0] === 'billingConsume'));
  const g = run('billing-restore', { ua: APP15_UA, bridge: true, billing: { list: [{ itemId: 'zumrut_50', purchaseToken: 'tokQ', purchaseState: 1, quantity: 2 }, { itemId: 'zumrut_200', purchaseToken: 'tokR', purchaseState: 1, quantity: 1 }] } });
  assert.equal(g.restored, 200); // sadece tek adetli olan
  assert.deepEqual(g.verify, [['zumrut_200', 'tokR']]);
});

test('zümrüt: bekleyen (yavaş kart) → zümrüt yüklenmez, onay bekliyor', () => {
  const r = run('billing-buy', { ua: APP15_UA, bridge: true, billing: { purchase: { ok: false, pending: true, productId: 'zumrut_50', purchaseToken: 'tokP' } } });
  assert.deepEqual(r.buy, { pending: true });
  assert.deepEqual(r.verify, []);
});

test('zümrüt: vazgeç → sessiz; hata → Türkçe mesaj; kullanılamıyor → işaret', () => {
  assert.deepEqual(run('billing-buy', { ua: APP15_UA, bridge: true, billing: { purchase: { ok: false, cancelled: true } } }).buy, { cancelled: true });
  const e = run('billing-buy', { ua: APP15_UA, bridge: true, billing: { purchase: { ok: false, code: 6, error: 'Ödeme reddedildi.' } } });
  assert.equal(e.buy.thrown, 'Ödeme reddedildi.');
  const u = run('billing-buy', { ua: APP15_UA, bridge: true, billing: { purchase: { ok: false, code: 3, unavailable: true, error: 'x' } } });
  assert.equal(u.buy.unavailable, true);
});

test('zümrüt: zaten sahip (tüketilmemiş eski satın alma) → önce geri yükleme', () => {
  const r = run('billing-buy', { ua: APP15_UA, bridge: true, billing: { purchase: { ok: false, alreadyOwned: true }, list: [{ itemId: 'zumrut_50', purchaseToken: 'tokOld', purchaseState: 1, quantity: 1 }] } });
  assert.equal(r.buy.ok, true);
  assert.equal(r.buy.restored, true);
  assert.deepEqual(r.verify, [['zumrut_50', 'tokOld']]);
});

test('zümrüt: aynı jeton satın alma + geri yüklemeden aynı anda → sunucuya TEK doğrulama', () => {
  const r = run('billing-race', { ua: APP15_UA, bridge: true, billing: { list: [{ itemId: 'zumrut_50', purchaseToken: 'tok_zumrut_50', purchaseState: 1, quantity: 1 }] } });
  assert.equal(r.verify.length, 1);
  assert.equal(r.buy.ok, true);
});

test('zümrüt: KAPATMA ANAHTARI kapalı → mağaza + satın alma gizli, ama sessiz geri yükleme ÇALIŞIR', () => {
  const off = { NS_BILLING_OFF: '1' };
  const s = run('billing-store', { ua: APP15_UA, bridge: true, billing: {} }, off);
  assert.equal(s.flag, false);
  assert.equal(s.storeOpen, false);
  assert.equal(s.reachable, false);
  assert.equal(s.restoreOk, true);
  assert.equal(s.service, 'native');
  const b = run('billing-buy', { ua: APP15_UA, bridge: true, billing: {} }, off);
  assert.match(b.buy.thrown, /kapalı/);
  assert.ok(!b.calls.some((c) => c[0] === 'billingPurchase'));
  const q = run('billing-quiet', { ua: APP15_UA, bridge: true, billing: { list: [{ itemId: 'zumrut_200', purchaseToken: 'tokW', purchaseState: 1, quantity: 1 }] } }, off);
  assert.equal(q.restored, 200, 'bekleyen ödeme anahtar kapalıyken de yüklenir');
  assert.deepEqual(q.verify, [['zumrut_200', 'tokW']]);
});
