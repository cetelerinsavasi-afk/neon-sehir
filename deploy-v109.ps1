# Neon Sehir v108 + v109 - Devlet kasasi, Belediye binasi, Polis Teskilati (Istihbarat + Polis birlesti)
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v109.ps1
#
# SIRA ONEMLI:
#  1) Once kritik fonksiyonlar (cete sistemi, gece 00:00 isleri, soygunlar, polislik/imamlik)
#     gangClock yuklendikten sonraki ilk 5 dakikalik turda TEK SEFERLIK GECIS calisir:
#     tum polisler Polis Teskilatina, tum istihbaratcilar polislige (migrations/rolesV109).
#     Ilk 00:00'da polis olan imam gorevden alinir (migrations/imamRoleV109).
#  2) Sonra Firestore kurallari
#  3) Sonra GERI KALAN TUM fonksiyonlar: vergi yazan her fonksiyon devlet kasasina da
#     yaziyor; eski surumde kalan fonksiyonun vergisi Belediye Raporu'na girmez.
#  4) En son git push (istemci) - fonksiyonlar biter bitmez, bekletmeden.
# Kota (429) hatasina karsi gruplar kucuk, aralarinda bekleme var; hata veren grup 120 sn
# sonra bir kez daha denenir, yine olmazsa en sonda listelenir.

# v109: v108 paketinden kalan, artik kullanilmayan dosyalar (varsa) silinir
foreach ($f in @('functions\gang\actions\police.js', 'functions\gang\test\v108.test.js', 'src\components\Gangs\tabs\PoliceTab.jsx', 'deploy-v108.ps1')) {
  if (Test-Path $f) { Remove-Item $f -Force; Write-Host "Silindi: $f" -ForegroundColor DarkGray }
}

$kritik = @(
  @('gangAction', 'gangClock', 'dailyReset', 'getStateReport', 'applyForPolice'),
  @('cancelPendingPoliceChange', 'resignFromPolice', 'applyForImam', 'claimImamSalary', 'initializePlayer'),
  @('attemptHeist', 'executeHeistPlan', 'joinHeistPlan', 'sellContrabandAtPark', 'houseAction', 'enterInterior'),
  @('resignImam', 'claimPoliceSalary', 'bribePolice')
)
$kalan = @(
  @('achievementsSweep', 'addFutbolTraining', 'adminAccountDeletion', 'adminAction', 'adminBanSweep', 'adminManualCreditPackage', 'advertiseListing', 'applyFutbolManager'),
  @('applyReferralCode', 'assignFutbolDoctor', 'autoJoinFactory', 'becomeBeggar', 'blockUser', 'businessRollover', 'buyEmeraldOffer'),
  @('buyFactoryMachine', 'buyFactoryShare', 'buyFromAmazor', 'buyFromBufe', 'buyFromGazinoBar', 'buyFromVendor', 'buyFutbolPlayer', 'buyFutbolTeam'),
  @('buyInvestment', 'buyListing', 'buyLotteryTicket', 'buyVehicle', 'buyWeapon', 'cancelFactoryShareListing', 'cancelFutbolDoctor', 'cancelFutbolManagerListing'),
  @('cancelFutbolPlayerListing', 'cancelFutbolTeamListing', 'cancelHeistPlan', 'cancelLimanOrder', 'cancelListing', 'cancelRaceRoom', 'cancelSponsorship', 'captureCameraSnapshot'),
  @('checkOnboardingProgress', 'cleanupSixtagramPosts', 'completeOnboardingChecklist', 'cosmeticsAction', 'createFactory', 'createHeistPlan', 'createListing'),
  @('createOnNumaraTable', 'createRaceRoom', 'createSixtagramComment', 'createSixtagramPost', 'dailyResetRecovery', 'dealOnNumaraCards', 'declineOpponent', 'deleteSixtagramPost'),
  @('depositToBank', 'donateFutbolTreasury', 'donateToBeggar', 'emptyFutbolTreasuryAndReclaim', 'ensureFactoryMigrationsV38', 'ensureFutbolBotTreasuryFix', 'enterPark', 'expireHeistPlans'),
  @('expireInteriorPresence', 'expireOldFactoryShareListings', 'expireOldMarketplaceListings', 'expireOnNumaraTables', 'expireParkPresence', 'expireRaceRooms', 'fireEmployee', 'fireFutbolManager'),
  @('forceRefreshFutbolTransferMarket', 'forfeitRace', 'futbolProAction', 'futbolTransferMarketHourlyMaintenance', 'getCreditInfo', 'getFactoryValue', 'getFutbolTeamDetail', 'getMyFutbolTeamFinance'),
  @('getMyRedemptionCode', 'getPlayerCard', 'giftHeldItem', 'giveNasihat', 'goldLedger', 'hourlyInvestmentUpdate', 'instantSellFutbolPlayer', 'instantSellListing'),
  @('joinFactoryMachine', 'joinOnNumaraTable', 'joinRaceRoom', 'kickFromHeistPlan', 'leaveHeistPlan', 'leaveOnNumaraTable', 'leaveRaceRoomAsJoiner', 'listFactoryShare'),
  @('listFutbolBuyableTeams', 'listFutbolClubs', 'listFutbolManagerApplications', 'listFutbolManagerOpportunities', 'listFutbolPlayerForSale', 'listFutbolTeamForManagers', 'listFutbolTeamForSale', 'listFutbolTransferMarket'),
  @('listSponsorshipFactoriesForTeam', 'listSponsorshipTeamsForFactory', 'markAllMessagesRead', 'markAllSixtagramNotificationsRead', 'markFactoryNotificationsRead', 'markFutbolTeamNotificationsRead', 'markMessageRead', 'mekanSayacEvCikis'),
  @('mekanSayacEvGiris', 'mekanSayacIcCikis', 'mekanSayacIcGiris', 'mekanSayacParkCikis', 'mekanSayacParkGiris', 'migrateArabaGelistirmeUnification', 'migrateOnboardingPoliceRule', 'migrateVehicleWeaponLifeCap'),
  @('migrateVehicleWeaponLifeCap20', 'migrateWeaponLifeCap10', 'onNumaraAutoStand', 'onNumaraHit', 'onNumaraStand', 'openFutbolTreasuryWithdrawRequest', 'payFutbolTrainingSlot', 'pingRoom'),
  @('placeFutbolBet', 'placeFutbolCupBet', 'placeLimanOrder', 'playBillingSweep', 'playerNameSweep', 'prayAtMosque', 'presenceSummary', 'processCreditDefaults'),
  @('produceAtFactory', 'raceHubAction', 'raiseSponsorshipFee', 'reactChatMessage', 'reassignEmployee', 'recomputeTodaysFutbolOddsNow', 'recordVenueVisit', 'refreshHeistPlanParticipants'),
  @('removeFutbolTraining', 'renameVehicle', 'repairItem', 'repayCredit', 'repayStateDebt', 'repayVehicleLoan', 'reportContent', 'requestAccountDeletion'),
  @('requestFutbolManagerHandover', 'requestSponsorshipFeeRaise', 'resetFutbolTransferMarket', 'resignFromFactory', 'resignFutbolManager', 'resolveFutbolMatchdayReveal', 'resolveFutbolMatchdayStart', 'resolveStuckRewardsNow'),
  @('respondFutbolManagerApplication', 'respondFutbolManagerHandover', 'respondFutbolTreasuryWithdrawRequest', 'respondSponsorshipFeeRaiseRequest', 'respondSponsorshipOffer', 'runFactoryMachines', 'runFutbolBotPlayerBoostNow', 'runFutbolBotTreasuryFixNow'),
  @('runMergeLegacyMaterialListings', 'seedFutbolWorld', 'sellContrabandToDepo', 'sellFutbolTeam', 'sellInvestment', 'sellMaterial', 'sellSilahMaterial', 'sendChatMessage'),
  @('sendClubSponsorshipOffer', 'sendFactorySponsorshipOffer', 'sendOnNumaraEmoji', 'sendRaceEmoji', 'setAvatar', 'setDisplayName', 'setFactoryLogo', 'setFactoryName'),
  @('setFactorySalary', 'setFutbolLineup', 'setFutbolTeamLogo', 'setFutbolTicketPrice', 'settleMaterialListingBatches', 'shopAction', 'shopierOsbWebhook', 'socialAction'),
  @('socialCleanup', 'spinSlot', 'startRace', 'streamAction', 'submitFeedback', 'submitFlappyScore', 'syncAchievements', 'takeCredit'),
  @('takeVehicleLoan', 'toggleFeedbackLike', 'toggleSixtagramLike', 'triggerAllMining', 'unblockUser', 'updateHeistPlanNote', 'updateSponsorshipNote', 'upgradeFutbolStadium'),
  @('upgradeVehicle', 'upgradeWeapon', 'verifyPlayPurchase', 'withdrawFromBank', 'withdrawFutbolTreasury20Percent', 'withdrawSponsorshipCancellation', 'withdrawSponsorshipOffer')
)

$basarisiz = @()
function Yukle($g, $etiket) {
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== $etiket : $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Hata. 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
    if ($LASTEXITCODE -ne 0) { $script:basarisiz += ,$g }
  }
  Start-Sleep -Seconds 60
}

$i = 0
foreach ($g in $kritik) { $i++; Yukle $g "Kritik $i / $($kritik.Count)" }

Write-Host ""
Write-Host "===== Firestore kurallari =====" -ForegroundColor Cyan
firebase deploy --only firestore:rules
if ($LASTEXITCODE -ne 0) { Write-Host "KURALLAR YUKLENEMEDI - tekrar dene: firebase deploy --only firestore:rules" -ForegroundColor Red }

$i = 0
foreach ($g in $kalan) { $i++; Yukle $g "Kalan $i / $($kalan.Count)" }

Write-Host ""
if ($basarisiz.Count -eq 0) {
  Write-Host "TAMAM: Tum fonksiyonlar ve kurallar yuklendi. Simdi: git push" -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene:" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
