# Neon Sehir v133 - v132'nin TAMAMI + duzeltmeler:
#   botlar (tasarla'da platform/bot, bota dokununca secilir, yeni tipler, dans yok, fotografta botlar,
#   "... Bot" adi, ziyaretcide garson butonu / ofis urunleri), oyunun silah/araba magazasi en ucuz fiyat,
#   sampiyona odulleri, yeni soygun paneli, "elinde" paneli kalkti, bankada sira numarasi elde
#
#   Cift tikla: deploy-v133.bat   (ya da: powershell -ExecutionPolicy Bypass -File .\deploy-v133.ps1)
#
# Sira onemli (oyuncu magdur olmasin diye):
#   1) Firestore kurallari
#   2) TUM fonksiyonlar
#   3) Ancak hepsi basariliysa: git commit + push (arayuz canliya cikar)
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

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
# eski deploy betikleri artik gereksiz
foreach ($f in @('deploy-v130.ps1','deploy-v130.bat','deploy-v131.ps1','deploy-v131.bat','deploy-v132.ps1','deploy-v132.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -A
git commit -q -m "v133: v132 + bot duzeltmeleri, magaza en ucuz fiyat, sampiyona odulleri, yeni soygun paneli, sira numarasi elde" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01RoR8v3wbem97FBA1vtPaXJ"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "TAMAM: v133 canlida." -ForegroundColor Green
