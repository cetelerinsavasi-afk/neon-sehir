# Neon Sehir v160.2 - Sixtagram cokme duzeltmesi (fotograf gorseli + tembel yukleme), kostum fiyatlari,
#   kostume dokununca en uste, buyuk harita X, motor/bisiklette ic kamera fotografi, belediye X solda.
#   Bu betik:
#   1) derleme + testler
#   2) veritabani kurallari (sixImg) + 3 fonksiyon (createSixtagramPost, cleanupSixtagramPosts, cosmeticsAction)
#      (Firebase cogu zaman ancak 2. denemede "Deploy complete" diyor -> kendiliginden tekrar dener)
#   3) git commit + push   4) Cloudflare derlemesini bekler, sonucu soyler

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
if (-not (Test-Path 'src\lib\sixImage.js') -or -not (Test-Path 'functions\sixImage.js')) { Dur "v160.2 dosyalari bulunamadi. HICBIR SEY YAPILMADI." }

Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

$testler = @('tests/webview/webview.test.mjs', 'tests/city/jobs-resume.test.mjs', 'tests/city/kurye.test.mjs', 'functions/scripts/cosmetics.test.mjs', 'functions/scripts/six-image.test.mjs') | Where-Object { Test-Path $_ }
if ($testler.Count -gt 0) {
  Write-Host ""
  Write-Host "===== testler =====" -ForegroundColor Cyan
  node --test @testler
  if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }
}

function Yukle($only, $ad) {
  foreach ($bekle in @(0, 30, 90)) {
    if ($bekle -gt 0) {
      Write-Host "$ad tamamlanmadi, $bekle sn bekleyip tekrar deneniyor..." -ForegroundColor Yellow
      Start-Sleep -Seconds $bekle
    }
    firebase deploy --only $only
    if ($LASTEXITCODE -eq 0) { return $true }
  }
  return $false
}

Write-Host ""
Write-Host "===== veritabani kurallari (sixImg) =====" -ForegroundColor Cyan
if (-not (Yukle 'database' 'Veritabani kurallari')) { Dur "Veritabani kurallari yuklenemedi. Site GONDERILMEDI. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== fonksiyonlar =====" -ForegroundColor Cyan
if (-not (Yukle 'functions:createSixtagramPost,functions:cleanupSixtagramPosts,functions:cosmeticsAction' 'Fonksiyon yuklemesi')) { Dur "Fonksiyonlar yuklenemedi (3 deneme). Site GONDERILMEDI. Birkac dakika sonra bu dosyayi tekrar calistir ya da ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @(
  'database.rules.json',
  'functions/index.js',
  'functions/sixImage.js',
  'functions/cosmeticsData.js',
  'functions/package.json',
  'functions/scripts/cosmetics.test.mjs',
  'functions/scripts/six-image.test.mjs',
  'src/lib/sixImage.js',
  'src/services/gameActions.js',
  'src/components/Sixtagram/SixPhoto.jsx',
  'src/components/Sixtagram/sixLazy.jsx',
  'src/components/Sixtagram/PostAttachment.jsx',
  'src/components/Sixtagram/PostCard.jsx',
  'src/components/Sixtagram/SixStories.jsx',
  'src/components/Sixtagram/SixtagramScreen.jsx',
  'src/components/City/CityScreen.jsx',
  'src/components/City/City.css',
  'src/components/City/cityEngine.js',
  'src/components/HouseScreen/HouseScreen.jsx',
  'src/components/CostumeShop/CostumeShop.jsx',
  'src/components/Belediye/BelediyeScreen.jsx',
  'V160-DEGISIKLIKLER.md',
  'deploy-v160-2.ps1'
) | Where-Object { Test-Path $_ }
git add -- $ekle
git commit -q -m "v160.2: Sixtagram cokme duzeltmesi (ev/sehir fotograflari cekenin cihazindan JPEG olarak RTDB'ye, telefonda 3D sahne kurulmaz, tembel yukleme), kostum fiyatlari, kostume dokununca en uste, buyuk harita X, acik aracta ic kamera fotografi, belediye X solda" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1LKrqNSgRQ7mXcSDJS" -- $ekle
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz. Kurallar ve fonksiyonlar YUKLENDI, site gonderilmedi. Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Kurallar ve fonksiyonlar YUKLENDI, site gonderilmedi. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====" -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$sha = (git rev-parse HEAD).Trim()
$url = "https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/$sha/check-runs"
$sonuc = $null
for ($i = 0; $i -lt 32; $i++) {
  Start-Sleep -Seconds 15
  try { $r = Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent' = 'neon-sehir-deploy'; 'Accept' = 'application/vnd.github+json' } } catch { continue }
  $cf = $r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1
  if (-not $cf) { Write-Host "  ...Cloudflare henuz baslamadi" -ForegroundColor DarkGray; continue }
  if ($cf.status -ne 'completed') { Write-Host "  ...Cloudflare derliyor" -ForegroundColor DarkGray; continue }
  $sonuc = $cf.conclusion
  break
}
Write-Host ""
if ($sonuc -eq 'success') {
  Write-Host "TAMAM: v160.2 yayinda. Oyunu yenile (bilgisayarda Ctrl+F5)." -ForegroundColor Green
} elseif ($sonuc) {
  Write-Host "Cloudflare derlemesi BASARISIZ ($sonuc). Cloudflare panelinde Workers > neon-sehir > Deployments'taki hata kaydini Claude'a gonder." -ForegroundColor Red
} else {
  Write-Host "Cloudflare 8 dk icinde derlemeyi baslatmadi. Cloudflare panelinde Workers > neon-sehir > Deployments'ta son commit icin 'Retry build' de." -ForegroundColor Yellow
}
