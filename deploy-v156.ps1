# Neon Sehir v156 - Akici soygun videosu + Benzinlik (benzin al + market)
#   Once v155 yuklenmis olmali (deploy-v155.bat).
#   1) neon-sehir-v156.zip dosyasini proje klasorune acar (once guvenlik kontrolu)
#   2) Arayuz derlemesi + WebView/sehir testleri + fonksiyon testleri
#   3) Sadece 3 fonksiyon yuklenir: cityAction (benzin + market), belediyeAction, getStateReport
#      Kurallar / indeksler / RTDB DEGISMEZ.
#   4) git commit + push -> Cloudflare siteyi yayinlar
#   Cift tikla: deploy-v156.bat (yogun saatte: deploy-v156-simdi.bat) - soru sormaz.

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
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir ya da hemen yuklemek icin deploy-v156-simdi.bat kullan." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path 'package.json') -or -not (Test-Path 'functions\index.js')) {
  Dur "Bu dosyalar neon-sehir proje klasorunun ICINDE olmali (package.json bulunamadi)."
}

# v155 once yuklenmis olmali (commit edilmis)
$v155 = git log --oneline -1 --grep "v155: Zumrut Magazasi"
if (-not $v155) { Dur "Once v155'i yukle (deploy-v155.bat). v155 commit'i bu bilgisayarin git gecmisinde yok. HICBIR SEY YAPILMADI." }

# ---------------------------------------------------------------- 1) zip'i bul (en yenisi)
$adaylar = @()
foreach ($d in @($PSScriptRoot, "$env:USERPROFILE\Downloads")) {
  if (Test-Path $d) { $adaylar += Get-ChildItem -Path $d -Filter 'neon-sehir-v156*.zip' -File -ErrorAction SilentlyContinue }
}
$zip = ($adaylar | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
if (-not $zip) { Dur "neon-sehir-v156.zip bulunamadi. Zip'i bu klasore (ya da Indirilenler'e) koy ve tekrar calistir." }
Write-Host "Zip (en yeni): $zip" -ForegroundColor Cyan

# ---------------------------------------------------------------- 2) guvenlik kontrolu
# Her dosya ya v155 halinde ya da zaten v156 halinde olmali; baska degisiklik varsa ustune yazilmaz.
$izinli = @{
  'functions/index.js' = @('2d2704d4272a0b65b0ff64f52156ac04700a77f8', 'c7cb18ac6636712bdd1e47530759e64ea680ba1f')
  'functions/package.json' = @('fc2fbd60c5075f697e74e6a5ef6a4e533b53b5d0', 'fbf3affc03f3839b3727e0b2920962a59b1f4c58')
  'functions/stateTreasury.js' = @('700dae2b1cb976adaaafb526a2e17232cd24c4cd', '70d9a22b51df1588eb356cba163afe1fd9812792')
  'preview/mocks/backend.js' = @('86c7e04d37bbf77541fb231f69e8420a862626eb', '89e4ffe731410e45372c484b3c766135553535f6')
  'preview/mocks/firebase-functions.js' = @('ec8af09e1811e138a61e3245b21fdb686bce2224', '679b99791b86611e362ed9f84f060001dedd5663')
  'src/components/Belediye/BakanliklarTab.jsx' = @('d05f359fdb37feea7f0f9893b9781201ca6287d4', 'e512f3fbfc97d7e03b2635c94be11cf2590ac138')
  'src/components/City/City.css' = @('be62f8c63b13af80bc3df6c3490ae8cc245da474', 'aeefd85b0a5a02d540f651c88c2d41e5de809119')
  'src/components/City/CityScreen.jsx' = @('937c5a1124614c1f444bd69bfaa11aaae7e0db60', 'd7cc71ce723f683f47b02067e8bfe1d6e7393522')
  'src/components/City/HeistVideo.jsx' = @('516b0967d6779c46eb4ebb9fb0f2f0f2330eb48c', 'e22a3d387c4055b26c194f4cf441be5adfa4ac36')
  'src/components/City/cityEngine.js' = @('fe6e1015828d5ef769472621f6a5714683a2473b', '5b1f1be577716756c960342c3b5f8e80421ecadd')
  'src/components/City/cityHeist.css' = @('bbd249d09987853929a39aae657165ecdde259c2', 'b1ee34241b98a0930ef8f50b84383a08f6f7b93d')
  'src/components/City/cityHeist.js' = @('21a048dcef1dc7e936778b3ead0b40762c727db2', '5bd675ee8c827e6e975a9b0b71b0ca31d61cde9a')
  'src/components/City/jobBuildings.js' = @('097bd755feaeb60c3c73e9fe88461fd7689bbc1d', '1774837880c6edb3f7d4a364e46e59924f363fea')
  'src/lib/moneySources.js' = @('7fb26bbfca9309ef6b9058d4134bf6aeff53e10d', '9e1f07aab3ce1650ec47cbdac735de9a043cf06c')
  'V156-DEGISIKLIKLER.md' = @('475326c69cccbd5f9eac8162570c3c0e2261fa4c')
  'functions/gasStation.js' = @('beb6a1fbe963052e8fa291c5e1fe891ba51eb6d0')
  'functions/scripts/v156-gas.test.mjs' = @('6b8994d140c4472d6c847b95f884ba6c9630d439')
}
$degisen = @()
foreach ($f in $izinli.Keys) {
  if (-not (Test-Path $f)) { continue }
  $h = (git hash-object -- $f).Trim()
  if ($izinli[$f] -notcontains $h) { $degisen += $f }
}
if ($degisen.Count -gt 0) {
  Write-Host "Su dosyalar v155'ten sonra baska sekilde degismis:" -ForegroundColor Yellow
  $degisen | Sort-Object | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Dur "Ustune yazarsam bu degisiklikler kaybolur. HICBIR SEY YAPILMADI. Bu listeyi Claude'a gonder."
}

# ---------------------------------------------------------------- 3) dosyalari yerlestir
$tmp = Join-Path $env:TEMP 'neon-v156-zip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
try {
  Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop
} catch {
  Dur "Zip acilamadi: $($_.Exception.Message)"
}
Write-Host ""
Write-Host "===== dosyalar yerlestiriliyor =====" -ForegroundColor Cyan
try {
  Copy-Item -Path (Join-Path $tmp '*') -Destination $PSScriptRoot -Recurse -Force -ErrorAction Stop
} catch {
  Dur "Dosyalar kopyalanamadi: $($_.Exception.Message)"
}
foreach ($f in @('functions\gasStation.js', 'functions\scripts\v156-gas.test.mjs', 'V156-DEGISIKLIKLER.md')) {
  if (-not (Test-Path $f)) { Dur "Zip eksik acildi: $f yok." }
}
Write-Host "Tamam." -ForegroundColor Green

# ---------------------------------------------------------------- 4) derle + test
Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI (site eskisi gibi calisiyor). Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== WebView + sehir testleri =====" -ForegroundColor Cyan
node --test tests/webview/webview.test.mjs tests/city/jobs-resume.test.mjs tests/city/kurye.test.mjs
if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== fonksiyon testleri (hepsi) =====" -ForegroundColor Cyan
npm --prefix functions test
if ($LASTEXITCODE -ne 0) { Dur "Fonksiyon testleri basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

# kurallar / indeksler degismemis olmali
$kural = git status --porcelain -- firestore.rules database.rules.json firestore.indexes.json src/lib/androidAppVersion.js
if ($kural) { Dur "Kural/indeks dosyalarinda degisiklik var (bu surumde olmamali): $kural  HICBIR SEY YUKLENMEDI. Claude'a gonder." }

# ---------------------------------------------------------------- 5) fonksiyonlar (SITEDEN ONCE)
$only = 'functions:cityAction,functions:belediyeAction,functions:getStateReport'
Write-Host ""
Write-Host "===== Fonksiyonlar: cityAction, belediyeAction, getStateReport =====" -ForegroundColor Cyan
firebase deploy --only $only
if ($LASTEXITCODE -ne 0) {
  Write-Host "Hata verdi (kota olabilir). 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
  Start-Sleep -Seconds 120
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) { Dur "Fonksiyonlar yuklenemedi. git push YAPILMADI (site eskisi gibi). Biraz sonra deploy-v156-simdi.bat ile tekrar calistir; olmazsa ciktiyi Claude'a gonder." }
}

# ---------------------------------------------------------------- 6) commit + push
Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @('functions/index.js', 'functions/package.json', 'functions/stateTreasury.js', 'preview/mocks/backend.js', 'preview/mocks/firebase-functions.js', 'src/components/Belediye/BakanliklarTab.jsx', 'src/components/City/City.css', 'src/components/City/CityScreen.jsx', 'src/components/City/HeistVideo.jsx', 'src/components/City/cityEngine.js', 'src/components/City/cityHeist.css', 'src/components/City/cityHeist.js', 'src/components/City/jobBuildings.js', 'src/lib/moneySources.js', 'V156-DEGISIKLIKLER.md', 'functions/gasStation.js', 'functions/scripts/v156-gas.test.mjs', 'deploy-v156.ps1', 'deploy-v156.bat', 'deploy-v156-simdi.bat') | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) {
  git reset -q
  Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli  -> commit YAPILMADI. Claude'a gonder."
}
git commit -q -m "v156: akici soygun videosu (isitma, kapida kararma yok, sonuc dugmeleri) + benzinlik (benzin al 100 altin RP, market: kola/cips...)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1HNT2q1ev1cdukFpYM"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Fonksiyonlar yuklendi ama site eski. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "TAMAM: v156 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
Write-Host "Test et: Soygun yap (akicilik, Kapat / Tekrar izle), benzinlikte arabayla 'Benzin al', marketten cips." -ForegroundColor Cyan
