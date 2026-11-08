# Neon Sehir v146.1 - cete paneli alt sekme ortusmesi + ucuz ilan otomatik satis 7 -> 3 gun
#   1) Sunucu fonksiyonlari (2 grup, her biri 3 deneme)
#   2) Hepsi basariliysa git commit + push (arayuz)
#   Cift tikla: deploy-v146-1.bat   - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

$dk = (Get-Date).Hour * 60 + (Get-Date).Minute
if ($dk -ge 1380 -or $dk -lt 60 -or ($dk -ge 1065 -and $dk -lt 1155)) {
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir." -ForegroundColor Yellow
  exit 1
}

function Yukle($ad, $hedef) {
  for ($deneme = 1; $deneme -le 3; $deneme++) {
    Write-Host ""
    Write-Host "===== $ad (deneme $deneme / 3) =====" -ForegroundColor Cyan
    firebase deploy --only $hedef --non-interactive
    if ($LASTEXITCODE -eq 0) { return $true }
    if ($deneme -lt 3) { Write-Host "Yuklenemedi, 90 sn sonra tekrar..." -ForegroundColor Yellow; Start-Sleep -Seconds 90 }
  }
  return $false
}

$gruplar = @(
  @('2. el ilanlar', 'functions:createListing,functions:buyListing,functions:settleMaterialListingBatches,functions:expireOldMarketplaceListings,functions:shopAction'),
  @('cete', 'functions:gangAction,functions:gangClock')
)
foreach ($g in $gruplar) {
  if (-not (Yukle $g[0] $g[1])) {
    Write-Host "$($g[0]) yuklenemedi. git push YAPILMADI. Ciktiyi Claude'a gonder." -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v146.ps1','deploy-v146.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- functions src deploy-v146-1.ps1 deploy-v146-1.bat
git commit -q -m "v146.1: cete paneli alt sekme ortusmesi, ucuz ilan otomatik satis 3 gun" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GmN9LMEuYnrHkisB1"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu guncel ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v146.1 canlida." -ForegroundColor Green
