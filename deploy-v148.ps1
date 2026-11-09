# Neon Sehir v148 - Android WebView gecisi (1. adim, web tarafi + android-webview/ projesi)
#   1) neon-sehir-webview.zip dosyasini proje klasorune acar (ayni dosyalarin ustune yazar)
#   2) Arayuz derlemesi + WebView testleri (hata varsa push YAPILMAZ)
#   3) git commit + push  -> Cloudflare siteyi yayinlar
#   Firebase fonksiyonlari / kurallari bu surumde DEGISMEDI, yuklenmez.
#   Cift tikla: deploy-v148.bat   - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

function Dur($mesaj) {
  Write-Host ""
  Write-Host $mesaj -ForegroundColor Red
  exit 1
}

$dk = (Get-Date).Hour * 60 + (Get-Date).Minute
if ($dk -ge 1380 -or $dk -lt 60 -or ($dk -ge 1065 -and $dk -lt 1155)) {
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\lib\platform.js')) {
  Dur "Bu dosyalar neon-sehir proje klasorunun ICINDE olmali (package.json bulunamadi)."
}

# ---------------------------------------------------------------- 1) zip'i bul
$zip = $null
foreach ($aday in @("$PSScriptRoot\neon-sehir-webview.zip", "$env:USERPROFILE\Downloads\neon-sehir-webview.zip")) {
  if (Test-Path $aday) { $zip = $aday; break }
}
if (-not $zip) {
  Dur "neon-sehir-webview.zip bulunamadi. Zip'i bu klasore (ya da Indirilenler'e) koy ve tekrar calistir."
}
Write-Host "Zip: $zip" -ForegroundColor Cyan

# ---------------------------------------------------------------- 2) guvenlik kontrolu
# Degisiklikler v147.5 (948a950) uzerine yazildi. Bu dosyalarda o zamandan beri
# BASKA bir degisiklik varsa ustune yazmak onu siler -> dur.
$hedefler = @(
  'src/App.jsx',
  'src/components/ActionMenu/actionMenuUtils.js',
  'src/components/DeleteAccountRequest/DeleteAccountRequest.jsx',
  'src/components/GoldStoreScreen/GoldStoreScreen.jsx',
  'src/components/HouseScreen/BizRequirements.jsx',
  'src/components/HouseScreen/HouseScreen.jsx',
  'src/components/Phone/PhoneScreen.jsx',
  'src/contexts/AuthContext.jsx',
  'src/lib/backStack.js',
  'src/lib/platform.js',
  'src/lib/playBilling.js',
  'src/lib/songExport.js'
)
# Zip once gecici klasore acilir; bir dosya zip'tekiyle BIREBIR ayniysa (onceki
# calistirmada yerlestirilmis) sorun sayilmaz.
$tmp = Join-Path $env:TEMP 'neon-v148-zip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
try {
  Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop
} catch {
  Dur "Zip acilamadi: $($_.Exception.Message)"
}

git cat-file -e 948a950 2>$null
if ($LASTEXITCODE -ne 0) {
  Dur "Bu bilgisayardaki git gecmisinde v147.5 (948a950) yok. Once 'git pull' yap, sonra tekrar calistir."
}
$degisen = git diff --name-only 948a950 -- $hedefler | Where-Object {
  $yerel = Join-Path $PSScriptRoot $_
  $yeni = Join-Path $tmp $_
  -not ((Test-Path $yerel) -and (Test-Path $yeni) -and ((Get-FileHash $yerel).Hash -eq (Get-FileHash $yeni).Hash))
}
if ($degisen) {
  Write-Host "Su dosyalar v147.5'ten sonra degismis:" -ForegroundColor Yellow
  $degisen | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Dur "Ustune yazarsam bu degisiklikler kaybolur. HICBIR SEY YAPILMADI. Bu listeyi Claude'a gonder."
}

# ---------------------------------------------------------------- 3) dosyalari yerlestir
Write-Host ""
Write-Host "===== dosyalar yerlestiriliyor =====" -ForegroundColor Cyan
try {
  Copy-Item -Path (Join-Path $tmp '*') -Destination $PSScriptRoot -Recurse -Force -ErrorAction Stop
} catch {
  Dur "Dosyalar kopyalanamadi: $($_.Exception.Message)"
}
foreach ($f in @('android-webview\app\build.gradle.kts', 'android-webview\app\src\main\java\com\cetelerinsavasi\twa\LauncherActivity.kt', 'src\lib\nativeBridge.js', 'tests\webview\webview.test.mjs')) {
  if (-not (Test-Path $f)) { Dur "Zip eksik acildi: $f yok." }
}
Write-Host "Tamam." -ForegroundColor Green

# ---------------------------------------------------------------- 4) derle + test
Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
  Dur "Arayuz derlenemedi. git push YAPILMADI (site eskisi gibi calisiyor). Ciktiyi Claude'a gonder."
}

Write-Host ""
Write-Host "===== WebView testleri =====" -ForegroundColor Cyan
node --test tests/webview/webview.test.mjs
if ($LASTEXITCODE -ne 0) {
  Dur "Testler basarisiz. git push YAPILMADI (site eskisi gibi calisiyor). Ciktiyi Claude'a gonder."
}

# ---------------------------------------------------------------- 5) commit + push
Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v147-5.ps1', 'deploy-v147-5.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- src tests/webview android-webview deploy-v148.ps1 deploy-v148.bat

# Sifre / imza dosyasi ASLA gitmesin
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$)'
if ($gizli) {
  git reset -q
  Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli  -> commit YAPILMADI. Claude'a gonder."
}

git commit -q -m "v148: Android WebView kabugu (1. adim) - web: WebView tespiti (src=app / NeonSehirApp UA / NeonAndroid kopru), native Google girisi (signInWithCredential), WebView'da zumrut magazasi kapali, cikis butonu, pano yedegi, sarki kaydetme; android-webview/ projesi (versionCode 14)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1JEqfbMqQShYzEbbqZ"
if ($LASTEXITCODE -ne 0) {
  Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder."
}
git push
if ($LASTEXITCODE -ne 0) {
  Dur "git push basarisiz. Commit bilgisayarinda duruyor ama site eski. Ciktiyi Claude'a gonder."
}

Write-Host ""
Write-Host "TAMAM: v148 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
Write-Host ""
Write-Host "SIRADAKI (android-webview\WEBVIEW-TEST-LISTESI.md):" -ForegroundColor Cyan
Write-Host "  1) A bolumu: tarayicida (masaustu, Android Chrome, iPhone) her sey eskisi gibi mi?"
Write-Host "  2) B bolumu: telefondaki ESKI uygulamada (TWA) giris + zumrut magazasi calisiyor mu?"
Write-Host "  3) Sonra: Firebase'e Android uygulamasi + iki SHA-1 (android-webview\README.md - 4. adim)"
Write-Host "  4) Sonra: android-webview\aab-olustur.bat -> dahili test"
