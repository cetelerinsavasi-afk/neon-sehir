# Neon Sehir v144 - Google arama: baslik, aciklama, Cetelerin Savasi adi, robots.txt, sitemap.xml
#   Sunucu fonksiyonu YOK - sadece git commit + push (arayuz).
#   Cift tikla: deploy-v144.bat

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
git add -- index.html public/robots.txt public/sitemap.xml public/manifest.json deploy-v144.ps1 deploy-v144.bat
git commit -q -m "v144: Google arama - baslik, aciklama, Cetelerin Savasi adi, robots.txt, sitemap.xml" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXPfWsmWM5K5TViTPig"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v144 canlida. Simdi Google Search Console'dan sitemap'i gonder (aciklama Claude'un mesajinda)." -ForegroundColor Green
