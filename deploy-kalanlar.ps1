# Neon Sehir v92 - ilk yuklemede KOTA (CPU quota) yuzunden yuklenemeyen 39 fonksiyon
# + v92.2'de degisen createSixtagramPost (Sarki Yap).
# Once en onemlileri (streamAction, shopAction...) yuklenir, sonra 5'erli gruplar.
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-kalanlar.ps1

$gruplar = @(
  @('streamAction', 'shopAction', 'giftHeldItem', 'createSixtagramPost'),
  @('socialAction', 'sendChatMessage'),
  @('adminAccountDeletion', 'gangClock', 'getMyFutbolTeamFinance', 'getMyRedemptionCode', 'hourlyInvestmentUpdate'),
  @('migrateVehicleWeaponLifeCap', 'reassignEmployee', 'repayStateDebt', 'setAvatar', 'setDisplayName'),
  @('setFactoryLogo', 'setFactorySalary', 'setFutbolLineup', 'setFutbolTeamLogo', 'setFutbolTicketPrice'),
  @('shopierOsbWebhook', 'socialCleanup', 'spinSlot', 'startRace', 'submitFeedback'),
  @('submitFlappyScore', 'syncAchievements', 'takeCredit', 'takeVehicleLoan', 'toggleFeedbackLike'),
  @('toggleSixtagramLike', 'triggerAllMining', 'updateHeistPlanNote', 'upgradeFutbolStadium', 'upgradeVehicle'),
  @('withdrawFromBank', 'withdrawFutbolTreasury20Percent', 'withdrawSponsorshipCancellation', 'withdrawSponsorshipOffer')
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
