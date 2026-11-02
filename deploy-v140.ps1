# Neon Sehir v140 - Sarki yapma ekrani: uzun nota, 3 oktav, 8 bolum, 5 kanal, sifirla, 15 yeni enstruman
#   1) Sunucu: shopAction + createSixtagramPost (yeni sarki bicimini kabul etsin diye ONCE bunlar)
#   2) Arayuz: git commit + push
#   Cift tikla: deploy-v140.bat   - soru sormaz.
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
  Write-Host "===== shopAction + createSixtagramPost (deneme $deneme / 3) =====" -ForegroundColor Cyan
  firebase deploy --only "functions:shopAction,functions:createSixtagramPost" --non-interactive
  if ($LASTEXITCODE -eq 0) { $tamam = $true }
  elseif ($deneme -lt 3) { Write-Host "Yuklenemedi, 90 sn sonra tekrar..." -ForegroundColor Yellow; Start-Sleep -Seconds 90 }
}
if (-not $tamam) {
  Write-Host "Sunucu fonksiyonlari yuklenemedi. Oyun eski haliyle calismaya devam ediyor. Ciktiyi Claude'a gonder; git push YAPILMADI." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v139.ps1','deploy-v139.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- functions/songData.js src/lib/songEngine.js src/lib/songShare.js src/components/Sixtagram/SongMaker.jsx src/components/Sixtagram/SongMaker.css src/components/Sixtagram/SongView.jsx src/components/HomeOffice/StudioScreen.jsx V140-DEGISIKLIKLER.md deploy-v140.ps1 deploy-v140.bat
git commit -q -m "v140: sarki yapma - uzun nota, 3 oktav, 8 bolum, 5 kanal, sifirla, yeni enstrumanlar, yanki" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXLirxVX3AzEcXXxgJv"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu yeni sarkilari kabul ediyor ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v140 canlida." -ForegroundColor Green
