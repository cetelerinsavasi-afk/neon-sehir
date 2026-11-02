# Neon Sehir v141.2 - Supheler > Kafe & Bar: gereksiz aciklama yazilari kaldirildi
#   Sadece arayuz: git commit + push (sunucu degismedi)
#   Cift tikla: deploy-v141-2.bat   - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v141-1.ps1','deploy-v141-1.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- src/components/MekanlarScreen/SuspicionTab.jsx deploy-v141-2.ps1 deploy-v141-2.bat
git commit -q -m "v141.2: kafe & bar karti - gereksiz yazilar kaldirildi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXLirxVX3AzEcXXxgJv"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v141.2 canlida." -ForegroundColor Green
