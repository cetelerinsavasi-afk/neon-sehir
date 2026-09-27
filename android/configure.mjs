// configure.mjs — Android (TWA) paketinin alan adı, imza parmak izleri ve
// sürüm bilgisini TEK YERDEN doldurur. Bağımlılık yok (Node 18+).
//
// Kullanım (proje kökünden):
//   node android/configure.mjs --host=cetelerinsavasi.com       (varsayılan; zaten işli)
//   node android/configure.mjs --app-signing-sha=AA:BB:...  --upload-sha=CC:DD:...
//   node android/configure.mjs --version-code=2 --version-name=1.0.1
// (Parametreler birlikte ya da ayrı ayrı verilebilir.)
//
// Günceller:
//   android/twa-manifest.json          → host, ikon/manifest URL'leri, fingerprints, sürüm
//   public/.well-known/assetlinks.json → sha256_cert_fingerprints (web tarafı; deploy edilmeli)
//
// SHA-256 kaynakları:
//   --app-signing-sha : Play Console → Test ve yayınla → Uygulama bütünlüğü → Uygulama imzalama
//                       → "Uygulama imzalama anahtarı sertifikası" SHA-256 (cihazlardaki imza budur)
//   --upload-sha      : keytool -list -v -keystore android/android.keystore -alias android
//                       (yükleme anahtarı; dahili test / yerel APK kurulumunda gerekir)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TWA = `${root}android/twa-manifest.json`;
const LINKS = `${root}public/.well-known/assetlinks.json`;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([a-z-]+)=(.*)$/);
    if (!m) {
      console.error(`Geçersiz argüman: ${a}`);
      process.exit(2);
    }
    return [m[1], m[2]];
  })
);
if (!Object.keys(args).length) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}

const fail = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
function normSha(v, label) {
  const hex = String(v).replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 64) fail(`${label}: SHA-256 64 onaltılık karakter olmalı (şu an ${hex.length}).`);
  return hex.match(/.{2}/g).join(':');
}

const twa = JSON.parse(readFileSync(TWA, 'utf8'));
const links = JSON.parse(readFileSync(LINKS, 'utf8'));

if (args.host) {
  const host = args.host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) fail(`Geçersiz alan adı: ${args.host}`);
  twa.host = host;
  twa.iconUrl = `https://${host}/pwa-icon-512.png`;
  twa.maskableIconUrl = `https://${host}/pwa-maskable-512.png`;
  twa.webManifestUrl = `https://${host}/manifest.json`;
  twa.fullScopeUrl = `https://${host}/`;
  console.log(`✓ Alan adı: ${host}`);
}

const shas = [];
if (args['app-signing-sha']) shas.push({ name: 'Play uygulama imzalama anahtarı', value: normSha(args['app-signing-sha'], '--app-signing-sha') });
if (args['upload-sha']) shas.push({ name: 'Yükleme anahtarı', value: normSha(args['upload-sha'], '--upload-sha') });
if (shas.length) {
  // Mevcutlarla birleştir (aynı değer iki kez yazılmaz); yer tutucular atılır
  const merged = new Map((twa.fingerprints || []).map((f) => [f.value, f]));
  for (const f of shas) merged.set(f.value, f);
  twa.fingerprints = [...merged.values()];
  const target = links[0].target;
  const list = (target.sha256_cert_fingerprints || []).filter((f) => !f.startsWith('REPLACE_'));
  for (const f of shas) if (!list.includes(f.value)) list.push(f.value);
  target.sha256_cert_fingerprints = list;
  shas.forEach((f) => console.log(`✓ ${f.name}: ${f.value}`));
}

if (args['version-code']) {
  const n = Number(args['version-code']);
  if (!Number.isInteger(n) || n < 1) fail('--version-code pozitif tam sayı olmalı.');
  if (n <= Number(twa.appVersionCode || 0) && !args.force) fail(`--version-code (${n}) mevcut değerden (${twa.appVersionCode}) büyük olmalı (Play aynı/küçük kodu kabul etmez). Emin isen --force=1 ekle.`);
  twa.appVersionCode = n;
  console.log(`✓ versionCode: ${n}`);
}
if (args['version-name']) {
  twa.appVersion = args['version-name']; // Bubblewrap alan adı: appVersion (build.gradle → versionName)
  console.log(`✓ versionName: ${args['version-name']}`);
}
if (links[0].target.package_name !== twa.packageId) fail(`Paket adı uyuşmuyor: assetlinks ${links[0].target.package_name} ≠ twa ${twa.packageId}`);

writeFileSync(TWA, JSON.stringify(twa, null, 2) + '\n');
writeFileSync(LINKS, JSON.stringify(links, null, 2) + '\n');

const left = [];
if (twa.host.startsWith('REPLACE_')) left.push('--host');
if (links[0].target.sha256_cert_fingerprints.some((f) => f.startsWith('REPLACE_')) || !links[0].target.sha256_cert_fingerprints.length) left.push('--app-signing-sha / --upload-sha');
console.log(left.length ? `\nEksik: ${left.join(', ')}` : '\nHazır. Sonraki adım: cd android && bubblewrap update --skipVersionUpgrade && bubblewrap build');
