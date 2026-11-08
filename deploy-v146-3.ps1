# Neon Sehir v146.3 - tasarla modunda esyanin geri ziplamasi + zemin/duvar parcasi hizli silme
#   Sadece arayuz: git commit + push (sunucu fonksiyonu yok)
#   Cift tikla: deploy-v146-3.bat

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

$dk = (Get-Date).Hour * 60 + (Get-Date).Minute
if ($dk -ge 1380 -or $dk -lt 60 -or ($dk -ge 1065 -and $dk -lt 1155)) {
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir." -ForegroundColor Yellow
  exit 1
}

Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v146-2.ps1','deploy-v146-2.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- src deploy-v146-3.ps1 deploy-v146-3.bat
git commit -q -m "v146.3: tasarla modunda esya geri ziplamasi duzeltildi, zemin/duvar parcasi silince en yakini secilir" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GmN9LMEuYnrHkisB1"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v146.3 canlida." -ForegroundColor Green
