# Neon Sehir v145 + v146 - seyyar satici 3D, karargahlar, polis teskilati, ev satisi, transfer vergisi, mobilyalar
#   1) Sunucu fonksiyonlari (4 grup, her biri 3 deneme)
#   2) firestore.rules (teskilat takma kimlik izinleri)
#   3) Hepsi basariliysa git commit + push (arayuz)
#   Cift tikla: deploy-v146.bat   - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

# yogun saatlerde yukleme yapma (23:00-01:00, 17:45-19:15)
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
  @('ev / magaza / seyyar', 'functions:houseAction,functions:shopAction,functions:buyFromVendor,functions:giftHeldItem'),
  @('cete', 'functions:gangAction,functions:gangClock'),
  @('belediye / futbol', 'functions:belediyeAction,functions:getStateReport,functions:buyFutbolPlayer'),
  @('zamanlayicilar', 'functions:cronTick,functions:dailyReset,functions:dailyResetRecovery'),
  @('firestore kurallari', 'firestore:rules')
)
foreach ($g in $gruplar) {
  if (-not (Yukle $g[0] $g[1])) {
    Write-Host "$($g[0]) yuklenemedi. git push YAPILMADI. Ciktiyi Claude'a gonder." -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v143.ps1','deploy-v143.bat','deploy-v144.ps1','deploy-v144.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- firestore.rules functions src preview V145-DEGISIKLIKLER.md V146-DEGISIKLIKLER.md deploy-v146.ps1 deploy-v146.bat
git commit -q -m "v145+v146: seyyar satici 3D, karargahlar, polis teskilati, ev satisi, transfer vergisi, mobilyalar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GmN9LMEuYnrHkisB1"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu guncel ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v146 canlida." -ForegroundColor Green
