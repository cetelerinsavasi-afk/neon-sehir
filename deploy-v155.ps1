# Neon Sehir v155 - Zumrut Magazasi (Google Play Faturalandirma) - WEB tarafi + Android kaynak kodu
#   SUNUCUYA DOKUNMAZ: functions/, firestore.rules, database.rules.json, indeksler DEGISMEDI. firebase deploy YOK.
#   Once v154 yuklenmis olmali (deploy-v154.bat).
#   1) neon-sehir-v155.zip dosyasini proje klasorune acar (once guvenlik kontrolu)
#   2) Arayuz derlemesi + WebView testleri (zumrut: kopru yok / v14 / v15 / kapatma anahtari / adet / UID ozeti)
#   3) git commit + push -> Cloudflare siteyi yayinlar (tarayici + eski TWA + v14 WebView DEGISMEZ;
#      v15 WebView'da magaza acilir)
#   Sonra: android-webview\aab-olustur.bat -> NeonSehir-webview-v15.aab -> Play Console DAHILI TEST.
#   Cift tikla: deploy-v155.bat (yogun saatte: deploy-v155-simdi.bat) - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

function Dur($mesaj) {
  Write-Host ""
  Write-Host $mesaj -ForegroundColor Red
  exit 1
}

$dk = (Get-Date).Hour * 60 + (Get-Date).Minute
if ($env:NEON_SIMDI -ne '1' -and ($dk -ge 1380 -or $dk -lt 60 -or ($dk -ge 1065 -and $dk -lt 1155))) {
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir ya da hemen yuklemek icin deploy-v155-simdi.bat kullan." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\lib\playBilling.js')) {
  Dur "Bu dosyalar neon-sehir proje klasorunun ICINDE olmali (package.json bulunamadi)."
}

# v154 once yuklenmis olmali (commit + push edilmis)
$v154 = git log --oneline -1 --grep "v154: yolcu kamerasi"
if (-not $v154) { Dur "Once v154'u yukle (deploy-v154.bat). v154 commit'i bu bilgisayarin git gecmisinde yok. HICBIR SEY YAPILMADI." }
if (Test-Path '.deploy-v154-tamam.txt') { Dur "v154 yuklemesi yarim kalmis (.deploy-v154-tamam.txt duruyor). Once deploy-v154.bat'i tamamla. HICBIR SEY YAPILMADI." }

# ---------------------------------------------------------------- 1) zip'i bul
$zip = $null
foreach ($aday in @("$PSScriptRoot\neon-sehir-v155.zip", "$env:USERPROFILE\Downloads\neon-sehir-v155.zip")) {
  if (Test-Path $aday) { $zip = $aday; break }
}
if (-not $zip) { Dur "neon-sehir-v155.zip bulunamadi. Zip'i bu klasore (ya da Indirilenler'e) koy ve tekrar calistir." }
Write-Host "Zip: $zip" -ForegroundColor Cyan

# ---------------------------------------------------------------- 2) guvenlik kontrolu
# Her dosya ya v154 halinde ya da zaten v155 halinde olmali; baska degisiklik varsa ustune yazilmaz.
$izinli = @{
  'android-webview/README.md' = @('50231b3094ad0e11f3ed2891be0db4bdb58a4ba2', '7925f0824614c278f3d25edf2c6e7c86ea77ac84')
  'android-webview/SURUM-NOTU.txt' = @('42f9fec241419b8b116a11dc4ac6b2841c56efdc', 'e27779cc32f5eb5b5dd6a7ade7edc5fe1dff8456')
  'android-webview/WEBVIEW-TEST-LISTESI.md' = @('353a74c34a63a55e2a439cba8a1df70294865754', 'fc9d5d02770694f80edb9cd76c0a7b9e94d8478b')
  'android-webview/app/build.gradle.kts' = @('442614a253e763162d62e574e14aca59d97bc66a', '3d60e874a198ad8b381450fa12f43c871df6299e')
  'android-webview/app/proguard-rules.pro' = @('c648e48509fd48aab92ef05091356f161c4edfab', '7e5066dc561beb20e00f61e8ce9b65d25bc62afa')
  'android-webview/app/src/main/java/com/cetelerinsavasi/twa/LauncherActivity.kt' = @('d043a79801b206f914c47a5fd719beff51e773d0', 'e0a3d7f93501bd66356c22a568316d8c98c41b08')
  'android-webview/app/src/main/java/com/cetelerinsavasi/twa/NeonBridge.kt' = @('8d11e9ed870f1eb9a3c244f2b846f53579941a1f', '985612c4fdc59ecd74b1e12bb6b3d7f8762a4d97')
  'src/App.jsx' = @('aec10026c03a9a0256f3816d3339f09024356cc5', 'c39154bfe2e6c5d656b24d4e95d924cf65e1fbf6')
  'src/components/GoldStoreScreen/GoldStoreScreen.jsx' = @('34b0b4b17df982d0fed971e1882e633de1b87967', '06340cf9d03ae618ca66f73e7808a9412777fdf0')
  'src/components/HouseScreen/BizRequirements.jsx' = @('07bdcc3f0f941a2141200b0ee63797d8c11b0df8', 'ab40cae0b44014c93066d6cb36bcfea225eb9231')
  'src/components/HouseScreen/HouseScreen.jsx' = @('d05155ab51e49a12445469a3199a60c8b33722bd', 'd5c37820f946414a8aa21a8d1295730e92b971ce')
  'src/components/Phone/PhoneScreen.jsx' = @('a64f223e90feb751ab9e3aea83f347854e2dc4d7', '6e0bbd5f4f052ac78b2bf36163e66ed52f348f00')
  'src/lib/nativeBridge.js' = @('236e32e5908df948fd7c3421a0c3d7bf39ff7897', 'eedf5e539e7443e6a1c3f6e8dacc7eb80f241976')
  'src/lib/playBilling.js' = @('8979bbafe90f7138ebc2402523e2c6a808b5690a', '11a591d4afd02d49871509e115ae2b61642ac6c2')
  'tests/webview/env.mjs' = @('4e4cc4cc9a2785f848195e560ff90914d8cc401d', '0823ad25053be938b0128845302f1ecddc63d426')
  'tests/webview/loader.mjs' = @('aa995025277f0ee5749d418b678cb5a520e73169', 'fe589b177e9644e909f92032d4fe2b544648f71f', '7c2b7d05d05c464a22f8b2257ee1c0b6979427a3')
  'tests/webview/probe.mjs' = @('60c4bc56d72c7b4a39442fdbc8499e6dca6f5ecb', '5ffeed14be2dbf4c0ad3f313942326f0780e3206')
  'tests/webview/webview.test.mjs' = @('c1c31f7f3ee3f9a93a5090418852525fe4c12265', 'deae077baab4356b11b5c144bc8d87ec7fea4e71')
}
$degisen = @()
foreach ($f in $izinli.Keys) {
  if (-not (Test-Path $f)) { continue }
  $h = (git hash-object -- $f).Trim()
  if ($izinli[$f] -notcontains $h) { $degisen += $f }
}
if ($degisen.Count -gt 0) {
  Write-Host "Su dosyalar v154'ten sonra baska sekilde degismis:" -ForegroundColor Yellow
  $degisen | Sort-Object | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Dur "Ustune yazarsam bu degisiklikler kaybolur. HICBIR SEY YAPILMADI. Bu listeyi Claude'a gonder."
}

# ---------------------------------------------------------------- 3) dosyalari yerlestir
$tmp = Join-Path $env:TEMP 'neon-v155-zip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
try {
  Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop
} catch {
  Dur "Zip acilamadi: $($_.Exception.Message)"
}
if (Test-Path (Join-Path $tmp 'functions')) { Dur "Zip'te functions klasoru var - bu surum sunucuya dokunmamali. HICBIR SEY YAPILMADI. Claude'a gonder." }
Write-Host ""
Write-Host "===== dosyalar yerlestiriliyor =====" -ForegroundColor Cyan
try {
  Copy-Item -Path (Join-Path $tmp '*') -Destination $PSScriptRoot -Recurse -Force -ErrorAction Stop
} catch {
  Dur "Dosyalar kopyalanamadi: $($_.Exception.Message)"
}
foreach ($f in @('android-webview\app\src\main\java\com\cetelerinsavasi\twa\PlayBilling.kt', 'src\lib\playBilling.js', 'tests\webview\stubGameActions.mjs')) {
  if (-not (Test-Path $f)) { Dur "Zip eksik acildi: $f yok." }
}
Write-Host "Tamam." -ForegroundColor Green

# ---------------------------------------------------------------- 4) derle + test
Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI (site eskisi gibi calisiyor). Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== WebView + zumrut testleri =====" -ForegroundColor Cyan
node --test tests/webview/webview.test.mjs
if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

# sunucu dosyalari degismemis olmali
$sunucu = git status --porcelain -- functions firestore.rules database.rules.json firestore.indexes.json src/lib/androidAppVersion.js
if ($sunucu) { Dur "Sunucu/kural dosyalarinda degisiklik var (bu surumde olmamali): $sunucu  HICBIR SEY YUKLENMEDI. Claude'a gonder." }

# ---------------------------------------------------------------- 5) commit + push
Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @('android-webview/README.md', 'android-webview/SURUM-NOTU.txt', 'android-webview/WEBVIEW-TEST-LISTESI.md', 'android-webview/app/build.gradle.kts', 'android-webview/app/proguard-rules.pro', 'android-webview/app/src/main/java/com/cetelerinsavasi/twa/LauncherActivity.kt', 'android-webview/app/src/main/java/com/cetelerinsavasi/twa/NeonBridge.kt', 'android-webview/app/src/main/java/com/cetelerinsavasi/twa/PlayBilling.kt', 'src/App.jsx', 'src/components/GoldStoreScreen/GoldStoreScreen.jsx', 'src/components/HouseScreen/BizRequirements.jsx', 'src/components/HouseScreen/HouseScreen.jsx', 'src/components/Phone/PhoneScreen.jsx', 'src/lib/nativeBridge.js', 'src/lib/playBilling.js', 'tests/webview/env.mjs', 'tests/webview/loader.mjs', 'tests/webview/probe.mjs', 'tests/webview/stubGameActions.mjs', 'tests/webview/webview.test.mjs', 'V155-ZUMRUT-DEGISIKLIKLER.md', 'deploy-v155.ps1', 'deploy-v155.bat', 'deploy-v155-simdi.bat') | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) {
  git reset -q
  Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli  -> commit YAPILMADI. Claude'a gonder."
}
git commit -q -m "v155: Zumrut Magazasi WebView v15+ (native Google Play Faturalandirma) - kopru yetenegiyle acilir, v14'te kapali; kapatma anahtari sadece satin almayi kapatir (geri yukleme surer); adet korumasi; obfuscatedAccountId (UID SHA-256); Android versionCode 15 / 1.2.0" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1HNT2q1ev1cdukFpYM"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Commit bilgisayarinda duruyor ama site eski. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "TAMAM: v155 (web) gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
Write-Host "1) Test et: tarayici (Shopier aynen), eski TWA (Play magazasi aynen), v14 WebView (magaza KAPALI)." -ForegroundColor Cyan
Write-Host "2) android-webview\aab-olustur.bat -> NeonSehir-webview-v15.aab -> Play Console > Dahili test (README 7)." -ForegroundColor Cyan
