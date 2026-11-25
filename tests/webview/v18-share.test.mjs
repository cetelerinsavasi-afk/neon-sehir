// v203 / Android v18 — "Arkadaşını Davet Et" paylaşımı + "Oyunu Değerlendir".
// Çalıştır (proje kökünden):  node --test tests/webview/v18-share.test.mjs
// Her senaryo temiz bir alt süreçte (platform değerleri açılışta bir kez hesaplanır).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const APP_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 NeonSehirApp/18';
const OLD_APP_UA = APP_UA.replace('NeonSehirApp/18', 'NeonSehirApp/17');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PLAY_MARKET = 'market://details?id=com.cetelerinsavasi.twa';
const src = (p) => readFileSync(`${root}${p}`, 'utf8');

function run(scenario, env, extraEnv = {}) {
  const loaderUrl = pathToFileURL(`${dir}loader.mjs`).href;
  const raw = execFileSync(process.execPath, ['--import', loaderUrl, `${dir}probe.mjs`, scenario], {
    env: { ...process.env, NS_ENV: JSON.stringify(env), ...extraEnv },
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

const EXPECTED = (name) =>
  `Neon Şehir'de buluşalım! Gerçek oyuncularla dolu bir şehirde fabrika kur, çete topla ya da başkan ol. Oyuna girerken davet eden kısmına "${name}" yaz: https://cetelerinsavasi.com`;

// ----------------------------------------------------------------- Metin
test('paylaşım metni: oyuncunun KENDİ davet adı (profilde gösterilen) + site linki', () => {
  const r = run('share', { ua: APP_UA, bridge: true, share: true }, { NS_INVITE_NAME: 'Kara Kartal' });
  assert.equal(r.text, EXPECTED('Kara Kartal'));
  assert.deepEqual(r.calls, [['shareText', EXPECTED('Kara Kartal')]]);
});

test('davet adı boşsa paylaşım yapılmaz (köprü/pano hiç çağrılmaz)', () => {
  const r = run('share', { ua: APP_UA, bridge: true, share: true }, { NS_INVITE_NAME: '   ' });
  assert.equal(r.text, '');
  assert.equal(r.share, 'failed');
  assert.deepEqual(r.calls, []);
});

test('profil paneli: davet adı = player.displayName (Referans Kodun ile aynı değer)', () => {
  const home = src('src/components/HomeScreen/HomeScreen.jsx');
  assert.match(home, /Referans Kodun: <strong>\{player\?\.displayName \|\| '—'\}<\/strong>/);
  assert.match(home, /<InviteShareButton inviteName=\{player\?\.displayName\} \/>/);
  // buton davet panelinin İÇİNDE
  const box = home.slice(home.indexOf('<div className="home-referral-box">'));
  assert.ok(box.indexOf('<InviteShareButton') < box.indexOf('</div>'), 'buton panelin içinde olmalı');
  assert.match(home, /Davet mesajı kopyalandı/);
});

// ----------------------------------------------------------- Android v18
test('Android v18 (shareText var): Android paylaşım menüsü, pano kullanılmaz', () => {
  const r = run('share', { ua: APP_UA, bridge: true, share: true, clipboard: 'ok' });
  assert.equal(r.IS_ANDROID_WEBVIEW, true);
  assert.equal(r.share, 'shared');
  assert.deepEqual(r.calls.map((c) => c[0]), ['shareText']);
});

// ----------------------------------------------------- Android v14–v17
test('Android v14–v17 (shareText YOK): mevcut copyText ile kopyalanır → "kopyalandı"', () => {
  const r = run('share', { ua: OLD_APP_UA, bridge: true });
  assert.equal(r.IS_ANDROID_WEBVIEW, true);
  assert.equal(r.share, 'copied');
  assert.deepEqual(r.calls, [['copyText', EXPECTED('Rois')]]);
});

test('Android v14–v17: tarayıcı panosu çalışıyorsa o kullanılır, yine "kopyalandı"', () => {
  const r = run('share', { ua: OLD_APP_UA, bridge: true, clipboard: 'ok' });
  assert.equal(r.share, 'copied');
  assert.deepEqual(r.calls, []);
});

// ------------------------------------------------- Tarayıcı / iPhone / TWA
test('tarayıcı/iPhone (navigator.share var): sistem paylaşımı', () => {
  const r = run('share', { ua: IPHONE_UA, navShare: 'ok' });
  assert.equal(r.IS_ANDROID_APP, false);
  assert.equal(r.share, 'shared');
  assert.deepEqual(r.navShares, [EXPECTED('Rois')]);
});

test('tarayıcı: oyuncu paylaşım menüsünü kapatırsa sessiz (kopyalama yok)', () => {
  const r = run('share', { navShare: 'abort', clipboard: 'ok' });
  assert.equal(r.share, 'cancelled');
});

test('tarayıcı: navigator.share hata verirse panoya düşer', () => {
  const r = run('share', { navShare: 'fail', clipboard: 'ok' });
  assert.equal(r.share, 'copied');
});

test('tarayıcı (navigator.share yok): panoya kopyala; pano da yoksa "failed" (çökme yok)', () => {
  assert.equal(run('share', { clipboard: 'ok' }).share, 'copied');
  assert.equal(run('share', { clipboard: 'fail' }).share, 'failed');
});

test('eski TWA (köprü yok, Chrome navigator.share): sistem paylaşımı', () => {
  const r = run('share', { url: 'https://cetelerinsavasi.com/?src=twa&av=13', navShare: 'ok' });
  assert.equal(r.IS_ANDROID_TWA, true);
  assert.equal(r.share, 'shared');
});

// ------------------------------------------------------ Oyunu Değerlendir
test('Değerlendir: WebView köprüsü → market:// (Play Store uygulaması)', () => {
  const r = run('rate', { ua: OLD_APP_UA, bridge: true });
  assert.equal(r.rate, true);
  assert.deepEqual(r.calls, [['openExternal', PLAY_MARKET]]);
});

test('Değerlendir: köprü yoksa (TWA/tarayıcı) false → normal https Play linki çalışır', () => {
  assert.equal(run('rate', { url: 'https://cetelerinsavasi.com/?src=twa&av=13' }).rate, false);
  assert.equal(run('rate', {}).rate, false);
});

test('Değerlendir butonu SADECE Android uygulamasında (IS_ANDROID_APP), İçindekiler altında', () => {
  const g = src('src/components/GuideScreen/GuideScreen.jsx');
  assert.match(g, /function RateOnPlay\(\) \{\n\s+if \(!IS_ANDROID_APP\) return null;/);
  assert.match(g, /<LegalLinks \/>\n\s+<RateOnPlay \/>/);
  assert.match(g, /href=\{PLAY_WEB_URL\}/);
  assert.equal((g.match(/<RateOnPlay \/>/g) || []).length, 1, 'tek yerde');
});

test('Değerlendir: ödül YOK, yıldız yönlendirmesi YOK, sunucu çağrısı YOK, kendiliğinden açılmaz', () => {
  const s = src('src/lib/shareInvite.js');
  const g = src('src/components/GuideScreen/GuideScreen.jsx');
  assert.equal(s.includes('gameActions'), false, 'shareInvite sunucuya hiçbir istek atmaz');
  assert.equal(/gameActions|httpsCallable|firebase/.test(g), false, 'rehber ekranı sunucu çağırmaz');
  const rate = g.slice(g.indexOf('function RateOnPlay'), g.indexOf('function Detail'));
  assert.equal(/ödül|altın|zümrüt|yıldız ver|5 yıldız|★★★★★/i.test(rate), false);
  assert.equal(/useEffect/.test(rate), false, 'pop-up / kendiliğinden açılma yok');
  assert.match(s, /export const RATE_TEXT = "Oyunu beğendin mi\? Google Play'de değerlendir";/);
});

test('Davet butonu ödül mantığına dokunmaz (sunucu çağrısı yok, sadece dokununca)', () => {
  const home = src('src/components/HomeScreen/HomeScreen.jsx');
  const btn = home.slice(home.indexOf('function InviteShareButton'), home.indexOf('function weaponImage'));
  assert.equal(/applyReferralCode|gameActions|httpsCallable/.test(btn), false);
  assert.equal(/useEffect\(\(\) => \{[^}]*shareInvite/.test(btn), false, 'kendiliğinden paylaşım yok');
  assert.match(btn, /onClick=\{onShare\}/);
});

// --------------------------------------------------------- Native kabuk
test('NeonBridge.shareText: ACTION_SEND + createChooser, güvenilir sayfa kontrolü, yeni kütüphane yok', () => {
  const kt = src('android-webview/app/src/main/java/com/cetelerinsavasi/twa/NeonBridge.kt');
  const fn = kt.slice(kt.indexOf('fun shareText'), kt.indexOf('// ---------------------------------------------------------- Dışarıda aç'));
  assert.match(fn, /if \(!trusted\(\) \|\| text\.isNullOrBlank\(\)\) return false/);
  assert.match(fn, /Intent\.ACTION_SEND/);
  assert.match(fn, /Intent\.createChooser/);
  const gradle = src('android-webview/app/build.gradle.kts');
  assert.match(gradle, /versionCode = 18/);
  assert.match(gradle, /versionName = "1\.3\.1"/);
  assert.match(gradle, /implementation\("com\.android\.billingclient:billing:9\.1\.0"\)/);
  assert.match(gradle, /-Xskip-metadata-version-check/);
});
