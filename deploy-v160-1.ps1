# Neon Sehir v160.1 - profil dugmeleri (Gunluk Rapor, Kostumler, Aksesuarlar, Mobilyalar),
#   Aksesuarlar bilgisayar duzeni, Kostumler ekrani bilgisayarda ortada.
#   v160 commit'i GitHub'a gitti ama Cloudflare derlemedi -> bu push v160'i de yayina cikarir.
#   Fonksiyonlar v160'ta yuklendi (degismedi). Bu betik:
#   1) derleme + testler   2) git commit + push   3) Cloudflare derlemesini bekler, sonucu soyler

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
if (-not (Test-Path 'src\lib\avatarLooks.js')) { Dur "v160 dosyalari yok (src\lib\avatarLooks.js). Once v160'i yukle. HICBIR SEY YAPILMADI." }

Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

$testler = @('tests/webview/webview.test.mjs', 'tests/city/jobs-resume.test.mjs', 'tests/city/kurye.test.mjs', 'functions/scripts/cosmetics.test.mjs') | Where-Object { Test-Path $_ }
if ($testler.Count -gt 0) {
  Write-Host ""
  Write-Host "===== testler =====" -ForegroundColor Cyan
  node --test @testler
  if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }
}

Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @(
  'src/components/HomeScreen/HomeScreen.jsx',
  'src/components/AccessoryShop/AccessoryShop.css',
  'src/components/CostumeShop/CostumeShop.jsx',
  'src/components/CostumeShop/CostumeShop.css',
  'V160-DEGISIKLIKLER.md',
  'deploy-v160-1.ps1'
) | Where-Object { Test-Path $_ }
git add -- $ekle
git commit -q -m "v160.1: profil dugmeleri (Gunluk Rapor, Kostumler, Aksesuarlar, Mobilyalar), Aksesuarlar bilgisayar duzeni (Kaydet cubugu sikisiyordu), Kostumler bilgisayarda ortada; v160'i yayina cikarir (Cloudflare v160'i derlememisti)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1LKrqNSgRQ7mXcSDJS" -- $ekle
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Ciktiyi Claude'a gonder." }

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
  Write-Host "TAMAM: v160 + v160.1 yayinda. Oyunu yenile (bilgisayarda Ctrl+F5)." -ForegroundColor Green
} elseif ($sonuc) {
  Write-Host "Cloudflare derlemesi BASARISIZ ($sonuc). Cloudflare panelinde Workers > neon-sehir > Deployments'taki hata kaydini Claude'a gonder." -ForegroundColor Red
} else {
  Write-Host "Cloudflare 8 dk icinde derlemeyi baslatmadi. Cloudflare panelinde Workers > neon-sehir > Deployments'ta son commit icin 'Retry build' (yeniden dene) de." -ForegroundColor Yellow
}
