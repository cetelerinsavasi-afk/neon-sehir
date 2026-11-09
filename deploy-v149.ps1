# Neon Sehir v149 - Sixtagram yenilenme, hikaye kaldigi yer, yolcu akiciligi, misafir sehir,
#   stadyum (haritaya gomulu + mac izleme), arac ici kamera, yayinda mac kaldirildi.
#   1) neon-sehir-v149.zip dosyasini proje klasorune acar (ayni dosyalarin ustune yazar)
#   2) Arayuz derlemesi + WebView testleri (hata varsa hicbir sey YUKLENMEZ)
#   3) Realtime Database kurallari (araba kaydina 'ct' alani) - SITEDEN ONCE
#   4) git commit + push  -> Cloudflare siteyi yayinlar
#   Firebase fonksiyonlari / Firestore kurallari DEGISMEDI.
#   Cift tikla: deploy-v149.bat   - soru sormaz.

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

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) {
  Dur "Bu dosyalar neon-sehir proje klasorunun ICINDE olmali (package.json bulunamadi)."
}

# ---------------------------------------------------------------- 1) zip'i bul
$zip = $null
foreach ($aday in @("$PSScriptRoot\neon-sehir-v149.zip", "$env:USERPROFILE\Downloads\neon-sehir-v149.zip")) {
  if (Test-Path $aday) { $zip = $aday; break }
}
if (-not $zip) { Dur "neon-sehir-v149.zip bulunamadi. Zip'i bu klasore (ya da Indirilenler'e) koy ve tekrar calistir." }
Write-Host "Zip: $zip" -ForegroundColor Cyan

# ---------------------------------------------------------------- 2) guvenlik kontrolu
# Degisiklikler v148 (dee8518) uzerine yazildi. Bu dosyalarda o zamandan beri BASKA bir
# degisiklik varsa ustune yazmak onu siler -> dur.
$hedefler = @(
  'database.rules.json',
  'preview/mocks/firebase-auth.js',
  'src/App.jsx',
  'src/components/City/City.css',
  'src/components/City/CityPhoto.jsx',
  'src/components/City/CityScreen.jsx',
  'src/components/City/buildings.js',
  'src/components/City/cityEngine.js',
  'src/components/City/kit.js',
  'src/components/FutbolScreen/FutbolLigler.jsx',
  'src/components/FutbolScreen/FutbolTakimim.css',
  'src/components/FutbolScreen/FutbolTakimim.jsx',
  'src/components/Guest/GuestVenueScreen.jsx',
  'src/components/GuideScreen/guideContent.js',
  'src/components/HouseScreen/HousePhoto.jsx',
  'src/components/HouseScreen/HouseScreen.jsx',
  'src/components/HouseScreen/houseEngine.js',
  'src/components/MekanlarScreen/VisitTab.jsx',
  'src/components/Sixtagram/SixStories.jsx',
  'src/components/Stream/StreamHost.jsx',
  'src/components/Stream/StreamViewer.jsx',
  'src/components/Stream/StreamMatchView.jsx',
  'src/components/Stream/StreamMatchMirror.jsx',
  'src/lib/photoCache.js'
)
$tmp = Join-Path $env:TEMP 'neon-v149-zip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
try {
  Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop
} catch {
  Dur "Zip acilamadi: $($_.Exception.Message)"
}
git cat-file -e dee8518 2>$null
if ($LASTEXITCODE -ne 0) { Dur "Bu bilgisayardaki git gecmisinde v148 (dee8518) yok. Once 'git pull' yap, sonra tekrar calistir." }
$degisen = git diff --name-only dee8518 -- $hedefler | Where-Object {
  $yerel = Join-Path $PSScriptRoot $_
  $yeni = Join-Path $tmp $_
  -not ((Test-Path $yerel) -and (Test-Path $yeni) -and ((Get-FileHash $yerel).Hash -eq (Get-FileHash $yeni).Hash))
} | Where-Object { $_ -notmatch 'StreamMatch(View|Mirror)\.jsx$' }
if ($degisen) {
  Write-Host "Su dosyalar v148'den sonra degismis:" -ForegroundColor Yellow
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
foreach ($f in @('src\components\City\stadium.js', 'src\components\City\stadiumMatch.js', 'src\hooks\useStadiumMatches.js')) {
  if (-not (Test-Path $f)) { Dur "Zip eksik acildi: $f yok." }
}
# yayinda mac izleme kaldirildi
foreach ($f in @('src/components/Stream/StreamMatchView.jsx', 'src/components/Stream/StreamMatchMirror.jsx')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
Write-Host "Tamam." -ForegroundColor Green

# ---------------------------------------------------------------- 4) derle + test
Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI (site eskisi gibi calisiyor). Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== WebView testleri =====" -ForegroundColor Cyan
node --test tests/webview/webview.test.mjs
if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

# ---------------------------------------------------------------- 5) RTDB kurallari (SITEDEN ONCE)
# Yeni site araba kaydina 'ct' alani yazar; eski kural bunu reddeder -> once kural.
Write-Host ""
Write-Host "===== Realtime Database kurallari =====" -ForegroundColor Cyan
firebase deploy --only database
if ($LASTEXITCODE -ne 0) {
  Write-Host "Kural yuklenemedi. 30 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
  Start-Sleep -Seconds 30
  firebase deploy --only database
  if ($LASTEXITCODE -ne 0) { Dur "Realtime Database kurali yuklenemedi. git push YAPILMADI (site eskisi gibi). Ciktiyi Claude'a gonder." }
}

# ---------------------------------------------------------------- 6) commit + push
Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
git add -- src preview/mocks/firebase-auth.js database.rules.json V149-DEGISIKLIKLER.md deploy-v149.ps1 deploy-v149.bat
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) {
  git reset -q
  Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli  -> commit YAPILMADI. Claude'a gonder."
}
git commit -q -m "v149: Sixtagram yenilenme (tek foto kuyrugu, hafif foto motoru), hikaye kaldigi yerden, yolcu arabasi akici (ct tahmini), misafir sehir, Ziyaret'ten park/satici kalkti, stadyum haritaya gomulu (prototip) + cihazda mac izleme + sponsor panolari + saha kilidi, Futbol Maclar/Forma sekmeleri kalkti (kalem), mekan Goz modu kalkti, arac ici kamera, yayinda mac kaldirildi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GukBVJkhsdTAoHWBc"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Commit bilgisayarinda duruyor ama site eski. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "TAMAM: v149 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
Write-Host "Kontrol: Sixtagram (telefon), hikayeler, yolcu, misafir sehir, stadyum (18:00-19:00 mac secici), arac ici kamera." -ForegroundColor Cyan
