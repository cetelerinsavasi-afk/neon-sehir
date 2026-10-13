# Neon Sehir - Firebase fonksiyonlarini KUCUK GRUPLAR halinde yukler.
# Neden: Hepsini birden yuklerken Google "kota asildi" (429 / CPU quota) hatasi
# veriyor ve bazi fonksiyonlar eski surumde kaliyor. Gruplar arasinda bekleyince
# bu hata olusmuyor.
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-parcali.ps1

$gruplar = @(
  @('gangClock', 'verifyPlayPurchase', 'playBillingSweep', 'shopAction', 'socialAction'),
  @('streamAction', 'adminAccountDeletion', 'getFactoryValue', 'payFutbolTrainingSlot', 'placeLimanOrder'),
  @('repayVehicleLoan', 'runFutbolBotTreasuryFixNow', 'sellContrabandAtPark', 'setFutbolTicketPrice', 'shopierOsbWebhook'),
  @('socialCleanup', 'startRace', 'submitFeedback', 'submitFlappyScore', 'takeCredit'),
  @('toggleFeedbackLike', 'toggleSixtagramLike', 'unblockUser', 'updateSponsorshipNote', 'upgradeFutbolStadium'),
  @('upgradeWeapon', 'withdrawFromBank', 'withdrawFutbolTreasury20Percent', 'withdrawSponsorshipCancellation', 'withdrawSponsorshipOffer')
)

$basarisiz = @()
$i = 0
foreach ($g in $gruplar) {
  $i++
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== Grup $i / $($gruplar.Count): $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Bu grup hata verdi. 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
    if ($LASTEXITCODE -ne 0) { $basarisiz += $g }
  }
  if ($i -lt $gruplar.Count) {
    Write-Host "Kota dolmasin diye 60 sn bekleniyor..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 60
  }
}

Write-Host ""
if ($basarisiz.Count -eq 0) {
  Write-Host "TAMAM: Tum gruplar basariyla yuklendi." -ForegroundColor Green
} else {
  Write-Host "Hala yuklenemeyenler: $($basarisiz -join ', ')" -ForegroundColor Red
  Write-Host "Birkac dakika sonra bu dosyayi tekrar calistir ya da bu ciktiyi Claude'a gonder."
}
