# Neon Sehir v130 - silahci/galeri STOK sistemi, sifir satis kar vergisi, 2. el "En pahali",
#                   isletme ayarlari sadelestirme, belediye kadro agaci + istifa,
#                   belediye gorevlilerine soygun / harac / ekip yasagi
#
#   Cift tikla: deploy-v130.bat   (ya da: powershell -ExecutionPolicy Bypass -File .\deploy-v130.ps1)
#
# Sira onemli (oyuncu magdur olmasin diye):
#   1) Firestore kurallari (yeni shopStocks belgesi)
#   2) TUM fonksiyonlar (yeni stok islemleri + vergi)  -> eski vitrin kapanir
#   3) Gecis: dukkan vitrinindeki silah/arabalar sahibine doner
#      (ilandakiler 2. elde satista kalir, ilansizlar envantere doner, omur degismez)
#   4) Ancak hepsi basariliysa: git commit + push (arayuz canliya cikar)
#
# NOT: "Silinsin mi? (delete)" diye sorarsa N de.
# DIKKAT: gece 23:00 - 01:00 arasinda calistirma.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

$saat = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time').Hour
if ($saat -ge 23 -or $saat -lt 1) {
  Write-Host "Saat $saat - gece 23:00 ile 01:00 arasinda yukleme yapma." -ForegroundColor Red
  exit 1
}

Write-Host "===== Firestore kurallari =====" -ForegroundColor Cyan
firebase deploy --only firestore:rules
if ($LASTEXITCODE -ne 0) { Write-Host "Kurallar yuklenemedi, durdu. git push YAPILMADI." -ForegroundColor Red; exit 1 }

$deneme = 0
do {
  $deneme++
  Write-Host ""
  Write-Host "===== Fonksiyonlar (deneme $deneme / 3) =====" -ForegroundColor Cyan
  firebase deploy --only functions
  if ($LASTEXITCODE -ne 0 -and $deneme -lt 3) {
    Write-Host "Bazi fonksiyonlar yuklenemedi. 90 sn sonra sadece kalanlar denenecek..." -ForegroundColor Yellow
    Start-Sleep -Seconds 90
  }
} while ($LASTEXITCODE -ne 0 -and $deneme -lt 3)

if ($LASTEXITCODE -ne 0) {
  Write-Host "Hala yuklenemeyen var. Ciktiyi Claude'a gonder; git push YAPILMADI." -ForegroundColor Red
  exit 1
}

# Vitrin -> stok gecisi (saatlik is de yapar; bu beklemeden hemen yapsin diye). Tekrar calismasi zararsiz.
Write-Host ""
Write-Host "===== Vitrin gecisi (dukkandaki silah / arabalar sahiplerine) =====" -ForegroundColor Cyan
try {
  $r = Invoke-RestMethod -Uri "https://europe-west1-neon-sehir.cloudfunctions.net/runShopV130MigrationNow?secret=854f8bf3de15bf540bd36a26a3cce7e5" -TimeoutSec 540
  $r | ConvertTo-Json -Depth 6
} catch {
  Write-Host "Gecis cagrisi basarisiz: $($_.Exception.Message) - saatlik is 1 saat icinde kendisi yapacak." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
# eski deploy betikleri (v124-v128) artik gereksiz
foreach ($f in @('deploy-v124.ps1','deploy-v125.ps1','deploy-v126.ps1','deploy-v127.ps1','deploy-v127-hizli.ps1','deploy-v128.ps1')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -A
git commit -q -m "v130: silahci/galeri stok sistemi, sifir satis kar vergisi, 2. el en pahali, isletme ayarlari sade, belediye kadro agaci + istifa, belediye gorevlilerine soygun yasagi, Ustun Cabrio basarisi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01JAuxvFjksP5qb7Z4Vdvt6G"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "TAMAM: v130 canlida." -ForegroundColor Green
