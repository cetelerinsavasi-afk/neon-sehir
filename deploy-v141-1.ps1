# Neon Sehir v141.1 - Kafe & Bar: kullanilan gun cubuk gizlenir ve dolmaz; kart siralamasi
#   1) Sunucu: shopAction (~2 dk)   2) git commit + push (arayuz)
#   Cift tikla: deploy-v141-1.bat   - soru sormaz.
# DIKKAT: 23:00-01:00 arasinda calismaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

$tr = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time')
if ($tr.Hour -ge 23 -or $tr.Hour -lt 1) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - gece 23:00 ile 01:00 arasinda yukleme yapma." -ForegroundColor Red
  exit 1
}

$tamam = $false
for ($deneme = 1; $deneme -le 3 -and -not $tamam; $deneme++) {
  Write-Host ""
  Write-Host "===== shopAction (deneme $deneme / 3) =====" -ForegroundColor Cyan
  firebase deploy --only functions:shopAction --non-interactive
  if ($LASTEXITCODE -eq 0) { $tamam = $true }
  elseif ($deneme -lt 3) { Write-Host "Yuklenemedi, 90 sn sonra tekrar..." -ForegroundColor Yellow; Start-Sleep -Seconds 90 }
}
if (-not $tamam) {
  Write-Host "shopAction yuklenemedi (oyun v141 haliyle calismaya devam ediyor). Ciktiyi Claude'a gonder; git push YAPILMADI." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v141.ps1','deploy-v141.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- functions/venue.js functions/scripts/venue.test.mjs src/components/MekanlarScreen/SuspicionTab.jsx src/components/MekanlarScreen/SuspicionTab.css V141-DEGISIKLIKLER.md deploy-v141-1.ps1 deploy-v141-1.bat
git commit -q -m "v141.1: kafe & bar - kullanilan gun cubuk gizlenir ve dolmaz, kart siralamasi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXLirxVX3AzEcXXxgJv"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu guncel ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v141.1 canlida." -ForegroundColor Green
