# Neon Sehir v143 - Sampiyona buyuk odulu 500.000 -> 400.000, Ustun Cabrio basari yazisi.
#   1) Sunucu: raceHubAction (sampiyona odulunu oduyor)
#   2) Basariliysa git commit + push (arayuz: odul tablosu + basari yazisi)
#   Cift tikla: deploy-v143.bat   - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

$tamam = $false
for ($deneme = 1; $deneme -le 3 -and -not $tamam; $deneme++) {
  Write-Host ""
  Write-Host "===== raceHubAction (deneme $deneme / 3) =====" -ForegroundColor Cyan
  firebase deploy --only functions:raceHubAction --non-interactive
  if ($LASTEXITCODE -eq 0) { $tamam = $true }
  elseif ($deneme -lt 3) { Write-Host "Yuklenemedi, 90 sn sonra tekrar..." -ForegroundColor Yellow; Start-Sleep -Seconds 90 }
}
if (-not $tamam) {
  Write-Host "raceHubAction yuklenemedi. git push YAPILMADI. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v142.ps1','deploy-v142.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- functions/championshipPrizes.js functions/achievementsData.js functions/scripts/champ-prizes.test.mjs deploy-v143.ps1 deploy-v143.bat
git commit -q -m "v143: sampiyona buyuk odulu 400.000, Ustun Cabrio basari yazisi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXPfWsmWM5K5TViTPig"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu guncel ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v143 canlida." -ForegroundColor Green
