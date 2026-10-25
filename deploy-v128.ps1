# Neon Sehir v128 - sampiyona, faiz tavani, polis supheleri, fabrika magaza, otomatik tedarik (oyunun dukkani dahil)
#   powershell -ExecutionPolicy Bypass -File .\deploy-v128.ps1
#
# NOT: "Silinsin mi? (delete)" diye sorarsa N de.
# DIKKAT: gece 23:00 - 01:00 arasinda calistirma.

$saat = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time').Hour
if ($saat -ge 23 -or $saat -lt 1) {
  Write-Host "Saat $saat - gece 23:00 ile 01:00 arasinda yukleme yapma." -ForegroundColor Red
  exit 1
}

Write-Host "===== Firestore kurallari =====" -ForegroundColor Cyan
firebase deploy --only firestore:rules
if ($LASTEXITCODE -ne 0) { Write-Host "Kurallar yuklenemedi, durdu." -ForegroundColor Red; exit 1 }

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
  Write-Host "Hala yuklenemeyen var. Ciktiyi Claude'a gonder; git push YAPMA." -ForegroundColor Red
  exit 1
}

# Bugun eski sistemle yarisanlari yeni listeye ekle + surelerine gore odul ver
# (saatlik is de yapar; bu sadece beklemeden hemen yapsin diye). Tekrar calismasi zararsiz.
Write-Host ""
Write-Host "===== Sampiyona gecisi (bugunun yarislari) =====" -ForegroundColor Cyan
try {
  $r = Invoke-RestMethod -Uri "https://europe-west1-neon-sehir.cloudfunctions.net/runChampV2MigrationNow?secret=854f8bf3de15bf540bd36a26a3cce7e5" -TimeoutSec 540
  $r | ConvertTo-Json -Depth 6
} catch {
  Write-Host "Gecis cagrisi basarisiz: $($_.Exception.Message) - saatlik is 1 saat icinde kendisi yapacak." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "TAMAM. Simdi:" -ForegroundColor Green
Write-Host '  git add -A' -ForegroundColor Green
Write-Host '  git commit -m "v128: sampiyona, polis suphe, fabrika magaza, otomatik tedarik"' -ForegroundColor Green
Write-Host '  git push' -ForegroundColor Green
