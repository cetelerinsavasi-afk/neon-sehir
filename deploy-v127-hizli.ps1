# Neon Sehir v127 - HIZLI deploy: kurallar + TUM fonksiyonlar TEK komutta (paralel)
#   Firebase CLI fonksiyonlari paralel yukler, kota hatasinda kendisi bekleyip dener.
#   Degismeyen fonksiyonlari atlar: hata olursa tekrar calistirinca sadece kalanlar yuklenir.
#   Tahmini sure: 15-30 dk.
#
#   powershell -ExecutionPolicy Bypass -File .\deploy-v127-hizli.ps1
#
# NOT: "Silinsin mi? (delete)" diye sorarsa N de (bulutta olup kodda olmayan eski fonksiyonlar).
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

Write-Host ""
if ($LASTEXITCODE -eq 0) {
  Write-Host "TAMAM: Kurallar ve tum fonksiyonlar yuklendi. Simdi:" -ForegroundColor Green
  Write-Host '  git add -A' -ForegroundColor Green
  Write-Host '  git commit -m "v127"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Hala yuklenemeyen var. Ciktiyi Claude'a gonder; git push YAPMA." -ForegroundColor Red
}
