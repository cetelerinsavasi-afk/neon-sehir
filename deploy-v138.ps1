# Neon Sehir v138 - MALIYET (v137'yi de icerir; once v137'yi calistirmana gerek yok)
#   - 26 zamanlanmis is tek "cronTick" fonksiyonunda (Cloud Scheduler ~96 TL -> ~0 TL)
#   - "Mekanda kac kisi var" artik Realtime Database'te, oyuncunun cihazinda sayiliyor
#     (anlik + dogru; mekanSayac* fonksiyonlari kaldirildi)
#   - Firestore yerel onbellegi (ekranlara donuste tekrar okuma yok)
#   - Mekan nabzi 30 -> 60 sn
#   + v137: polis gunluk tir limiti, yurtdisi saat notu, mining okumalari, playBilling 2 saat
#
#   Cift tikla: deploy-v138.bat   - her sey kendiliginden yapilir (soru sormaz).
#
# Sira (oyuncu magdur olmasin diye):
#   1) Realtime Database kurallari (yeni "occ" alani)
#   2) Eski 26 zamanlanmis is + 6 mekanSayac tetikleyicisi silinir
#   3) HEMEN cronTick yuklenir (aradaki bosluk ~1-2 dk; isler ikiser kez calismasin diye bu sira)
#   4) Tum fonksiyonlar
#   5) Ancak hepsi basariliysa: git commit + push (arayuz canliya cikar)
# DIKKAT: 23:00-01:00 ve 17:45-19:15 (futbol 18:00/19:00) arasinda calismaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

$tr = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time')
$dk = $tr.Hour * 60 + $tr.Minute
if ($tr.Hour -ge 23 -or $tr.Hour -lt 1) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - gece 23:00 ile 01:00 arasinda yukleme yapma." -ForegroundColor Red
  exit 1
}
if ($dk -ge (17 * 60 + 45) -and $dk -le (19 * 60 + 15)) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - 17:45 ile 19:15 arasi futbol maclari hesaplaniyor, sonra dene." -ForegroundColor Red
  exit 1
}

function Retry-Deploy([string]$what, [string]$label) {
  $deneme = 0
  do {
    $deneme++
    Write-Host ""
    Write-Host "===== $label (deneme $deneme / 3) =====" -ForegroundColor Cyan
    firebase deploy --only $what --non-interactive
    if ($LASTEXITCODE -ne 0 -and $deneme -lt 3) {
      Write-Host "Yuklenemeyen var. 90 sn sonra tekrar denenecek..." -ForegroundColor Yellow
      Start-Sleep -Seconds 90
    }
  } while ($LASTEXITCODE -ne 0 -and $deneme -lt 3)
  return ($LASTEXITCODE -eq 0)
}

Write-Host "===== 1) Realtime Database kurallari =====" -ForegroundColor Cyan
firebase deploy --only database --non-interactive
if ($LASTEXITCODE -ne 0) { Write-Host "RTDB kurallari yuklenemedi, durdu. Oyunda hicbir sey degismedi." -ForegroundColor Red; exit 1 }

$isaret = Join-Path $PSScriptRoot '.v138-eski-isler-silindi'
$eskiler = @(
  'businessRollover','playerNameSweep','v124Migrate','champV2Migrate','shopV130Migrate','achievementsSweep',
  'socialCleanup','adminBanSweep','hourlyInvestmentUpdate','processCreditDefaults','expireParkPresence',
  'expireInteriorPresence','presenceSummary','expireHeistPlans','expireRaceRooms','settleMaterialListingBatches',
  'expireOldMarketplaceListings','expireOldFactoryShareListings','expireOnNumaraTables','resolveFutbolMatchdayStart',
  'resolveFutbolMatchdayReveal','futbolTransferMarketHourlyMaintenance','playBillingSweep','cleanupSixtagramPosts',
  'politicsClock','gangClock',
  'mekanSayacParkGiris','mekanSayacParkCikis','mekanSayacIcGiris','mekanSayacIcCikis','mekanSayacEvGiris','mekanSayacEvCikis'
)
if (-not (Test-Path $isaret)) {
  Write-Host ""
  Write-Host "===== 2) Eski zamanlanmis isler siliniyor ($($eskiler.Count)) =====" -ForegroundColor Cyan
  firebase functions:delete @eskiler --region europe-west1 --force
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Silme basarisiz. Eski isler calismaya devam ediyor; oyun etkilenmedi. Ciktiyi Claude'a gonder." -ForegroundColor Red
    exit 1
  }
  Set-Content -Path $isaret -Value (Get-Date).ToString('s')
} else {
  Write-Host "2) Eski isler daha once silinmis, atlandi." -ForegroundColor DarkGray
}

if (-not (Retry-Deploy 'functions:cronTick' '3) cronTick (zamanlayici)')) {
  Write-Host "!!! cronTick yuklenemedi - ZAMANLANMIS ISLER SU AN CALISMIYOR. Bu dosyayi hemen tekrar calistir; olmazsa ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

if (-not (Retry-Deploy 'functions' '4) Tum fonksiyonlar')) {
  Write-Host "Hala yuklenemeyen var (cronTick calisiyor, oyun durmadi). Bu dosyayi tekrar calistir; olmazsa ciktiyi Claude'a gonder. git push YAPILMADI." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "===== 5) git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v136.ps1','deploy-v136.bat','deploy-v137.ps1','deploy-v137.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
if (Test-Path $isaret) { Remove-Item -Force $isaret }
git add -A
git commit -q -m "v138: maliyet - tek zamanlayici, RTDB mekan sayaci, Firestore onbellegi (+v137 polis limiti, yurtdisi saat)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXKE5Yxz69rehZyJAHp"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Fonksiyonlar canlida, arayuz degil. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "TAMAM: v138 canlida." -ForegroundColor Green
