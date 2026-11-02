# Neon Sehir v139 - Polis operasyonu ucreti 100.000 -> 50.000 (tir + bahisli savas operasyonu)
#   Sadece gangAction fonksiyonu yuklenir (~2 dk), sonra git commit + push.
#   Cift tikla: deploy-v139.bat   - soru sormaz.
# DIKKAT: 23:00-01:00 arasinda calismaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'   # git "Unlink ... (y/n)" sorusunu sormasin (otomatik hayir, guvenli)

$tr = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time')
if ($tr.Hour -ge 23 -or $tr.Hour -lt 1) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - gece 23:00 ile 01:00 arasinda yukleme yapma." -ForegroundColor Red
  exit 1
}

$tamam = $false
for ($deneme = 1; $deneme -le 3 -and -not $tamam; $deneme++) {
  Write-Host ""
  Write-Host "===== gangAction (deneme $deneme / 3) =====" -ForegroundColor Cyan
  firebase deploy --only functions:gangAction --non-interactive
  if ($LASTEXITCODE -eq 0) { $tamam = $true }
  elseif ($deneme -lt 3) { Write-Host "Yuklenemedi, 90 sn sonra tekrar..." -ForegroundColor Yellow; Start-Sleep -Seconds 90 }
}
if (-not $tamam) {
  Write-Host "gangAction yuklenemedi (oyun eski ucretle calismaya devam ediyor). Ciktiyi Claude'a gonder; git push YAPILMADI." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v137.ps1','deploy-v137.bat','deploy-v138.ps1','deploy-v138.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -A
git commit -q -m "v139: polis operasyonu ucreti 100.000 -> 50.000" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXKE5Yxz69rehZyJAHp"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Ucret sunucuda 50.000 oldu, arayuz yazisi eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v139 canlida." -ForegroundColor Green
