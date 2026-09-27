// check-assetlinks.mjs — Android TWA için Digital Asset Links dosyasını
// doğrular. Bağımlılık yok (Node 18+ yerleşik fetch).
//
// Kullanım:
//   node scripts/check-assetlinks.mjs                              (canlı, varsayılan: https://cetelerinsavasi.com)
//   node scripts/check-assetlinks.mjs https://alan-adin.com        (canlı, başka alan adı)
//   node scripts/check-assetlinks.mjs public/.well-known/assetlinks.json   (yerel dosya)
//   İsteğe bağlı 2. argüman: beklenen paket adı (varsayılan com.cetelerinsavasi.twa)
//
// Canlı kontrolde: HTTP 200, yönlendirme YOK, Content-Type application/json,
// gövde geçerli JSON (SPA fallback'in döndürdüğü index.html'i yakalar).
// Her iki modda: ilişki, paket adı ve SHA-256 parmak izi formatı; REPLACE_
// yer tutucuları kaldıysa HATA verir.
import { readFile } from 'node:fs/promises';

const target = process.argv[2] || 'https://cetelerinsavasi.com';
const expectedPackage = process.argv[3] || 'com.cetelerinsavasi.twa';
const FP_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => { errors.push(msg); console.log(`  ✗ ${msg}`); };

if (!target) {
  console.error('Kullanım: node scripts/check-assetlinks.mjs <https://alan-adı | dosya-yolu> [paket-adı]');
  process.exit(2);
}

let raw;
if (/^https?:\/\//i.test(target)) {
  const url = new URL('/.well-known/assetlinks.json', target).toString();
  console.log(`Canlı kontrol: ${url}`);
  let res;
  try {
    res = await fetch(url, { redirect: 'manual', cache: 'no-store' });
  } catch (err) {
    console.error(`  ✗ İstek başarısız: ${err.message}`);
    process.exit(1);
  }
  if (res.status === 200) ok('HTTP 200');
  else if (res.status >= 300 && res.status < 400) fail(`Yönlendirme var (${res.status} → ${res.headers.get('location')}) — Google yönlendirmeyi kabul etmez`);
  else fail(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.toLowerCase().startsWith('application/json')) ok(`Content-Type: ${ct}`);
  else fail(`Content-Type "${ct}" — application/json olmalı (text/html ise dosya deploy edilmemiş, SPA fallback dönüyor)`);
  raw = await res.text();
} else {
  console.log(`Yerel dosya kontrolü: ${target}`);
  raw = await readFile(target, 'utf8');
}

let data;
try {
  data = JSON.parse(raw);
  ok('Geçerli JSON');
} catch {
  fail(`JSON değil (ilk karakterler: ${JSON.stringify(raw.slice(0, 40))})`);
}

if (data !== undefined) {
  const statements = Array.isArray(data) ? data : [];
  if (!statements.length) fail('Kök eleman boş olmayan bir dizi olmalı');
  const st = statements.find(
    (s) => s?.target?.namespace === 'android_app' && s?.target?.package_name === expectedPackage
  );
  if (!st) {
    fail(`"${expectedPackage}" paketi için android_app kaydı yok`);
  } else {
    ok(`Paket adı: ${expectedPackage}`);
    if (st.relation?.includes('delegate_permission/common.handle_all_urls')) ok('relation: handle_all_urls');
    else fail('relation "delegate_permission/common.handle_all_urls" içermeli');
    const fps = st.target.sha256_cert_fingerprints || [];
    if (!fps.length) fail('sha256_cert_fingerprints boş');
    fps.forEach((fp) => {
      if (FP_RE.test(fp)) ok(`Parmak izi formatı geçerli: ${fp.slice(0, 11)}…`);
      else if (/REPLACE/i.test(fp)) fail(`Yer tutucu değiştirilmemiş: ${fp}`);
      else fail(`Geçersiz parmak izi formatı (AA:BB:… 32 bayt, büyük harf): ${fp}`);
    });
  }
}

if (/^https?:\/\//i.test(target)) {
  const site = new URL(target).origin;
  console.log(
    `\nGoogle tarafında ek doğrulama (tarayıcıda aç):\n  https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=${encodeURIComponent(site)}&relation=delegate_permission/common.handle_all_urls`
  );
}

console.log(errors.length ? `\nSONUÇ: ${errors.length} hata ✗` : '\nSONUÇ: Geçti ✓');
process.exit(errors.length ? 1 : 0);
