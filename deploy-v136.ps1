# Neon Sehir v136 - SECIM + DARBE SISTEMI + CUMARTESI SAVASI
#   Cuma 00:00 imza donemi, Pazar secim, 21:00-24:00 sayim, Pazartesi 00:00 yeni baskan,
#   anasayfa secim butonu, belediyede Imza / Secimler, gazetede secim haberleri.
#   Darbe: EGM baslatir (Paz/Pzt), rutbeli oylamasi, 24 saat halk destegi, yonetim/erken secim karari.
#   Darbe kilidi: EGM darbe bitene kadar istifa edemez/atilamaz/rutbesi dusmez; darbede Polis Memuru 1 guc.
#   Belediye Baskani / yardimcilar / Teskilat Bakani teskilata YETKILI olarak girer (genel+belediye sohbeti, izleme).
#   Ticaret yolu savasi Cumartesi; siparis Paz-Cum; bahis Paz-Per.
#   + polis gunluk atma hakki (EGM 2, Amir 1), baskan istifasi (2 adim), soygun paneli notlari,
#   + teskilat istifa mesajlari, admin: eski polis mesajinin yazari + sixtagram gonderi onizleme,
#   + ilk acilista yuklenmeyen ekranlar, magaza listesi, 2. el paneli, sixtagram cek-kapat.
#   Yeni fonksiyonlar: politicsAction, politicsClock (dakikada bir).
#
#   BU AKSAM 23:00'TEN ONCE calistirilmali (ilk imzalar Cuma 00:00'da).
#   Cift tikla: deploy-v136.bat   (ya da: powershell -ExecutionPolicy Bypass -File .\deploy-v136.ps1)
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
foreach ($f in @('deploy-v133.ps1','deploy-v133.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -A
git commit -q -m "v136: secim sistemi (imza, oylama, sayim, devir), Cumartesi ticaret yolu savasi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXL8cfx35Wbv219jG6U"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "TAMAM: v136 canlida." -ForegroundColor Green
