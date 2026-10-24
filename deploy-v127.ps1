# Neon Sehir v127 - BELEDIYE SISTEMI
#   - Belediye binasi: "Belediye" butonu herkese acik (Rapor / Sohbet / Bakanliklar / Borclar / Baskanlik)
#   - Tum vergi ve kamu maaslari belediye tarafindan belirlenir (gun icinde 1 adim, 00:00'da yururluk)
#   - Belediye kasasi eksiye dusmez: maas borclari + soygun borclari (%1 faiz)
#   - Gece maaslari (polis + imam + belediye kadrosu) belediye kasasindan
#   - Baskan / yardimci / bakan kadrosu, davet, yetkiler, imami gorevden alma, bagis
#   - Cete yasakli madde siparis hakki: uye x 2.500 altin
#
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v127.ps1
#
# Sira: 1) Firestore kurallari  2) TUM fonksiyonlar (index.js'teki ortak oran
# sarmalayicisi (loadRates) ve vergi degisiklikleri her yerde kullanildigi icin
# hepsi) - 8'erli gruplar, aralarda bekleme (kota)  3) en son gece isleri + cete
# saati + belediye (ayni grupta)  4) git push (istemci).
# DIKKAT: gece 23:00 - 01:00 arasinda CALISTIRMA (gece maaslari / rapor sirasinda
# eski ve yeni kod karismasin). Toplam sure: yaklasik 1,5 saat.

$saat = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time').Hour
if ($saat -ge 23 -or $saat -lt 1) {
  Write-Host "Saat $saat - gece 23:00 ile 01:00 arasinda yukleme yapma. 01:00'dan sonra tekrar calistir." -ForegroundColor Red
  exit 1
}

$gruplar = @(
  @('achievementsSweep', 'addFutbolTraining', 'adminAccountDeletion', 'adminAction', 'adminBanSweep', 'adminManualCreditPackage', 'advertiseListing', 'applyForImam'),
  @('applyForPolice', 'applyFutbolManager', 'applyReferralCode', 'assignFutbolDoctor', 'attemptHeist', 'autoJoinFactory', 'becomeBeggar', 'blockUser'),
  @('bribePolice', 'businessRollover', 'buyEmeraldOffer', 'buyFactoryMachine', 'buyFactoryShare', 'buyFromAmazor', 'buyFromBufe', 'buyFromGazinoBar'),
  @('buyFromVendor', 'buyFutbolPlayer', 'buyFutbolTeam', 'buyInvestment', 'buyListing', 'buyLotteryTicket', 'buyVehicle', 'buyWeapon'),
  @('cancelFactoryShareListing', 'cancelFutbolDoctor', 'cancelFutbolManagerListing', 'cancelFutbolPlayerListing', 'cancelFutbolTeamListing', 'cancelHeistPlan', 'cancelLimanOrder', 'cancelListing'),
  @('cancelPendingPoliceChange', 'cancelRaceRoom', 'cancelSponsorship', 'captureCameraSnapshot', 'checkOnboardingProgress', 'claimImamSalary', 'claimPoliceSalary', 'cleanupSixtagramPosts'),
  @('completeOnboardingChecklist', 'cosmeticsAction', 'createFactory', 'createHeistPlan', 'createListing', 'createOnNumaraTable', 'createRaceRoom', 'createSixtagramComment'),
  @('createSixtagramPost', 'dealOnNumaraCards', 'declineOpponent', 'deleteSixtagramPost', 'depositToBank', 'donateFutbolTreasury', 'donateToBeggar', 'emptyFutbolTreasuryAndReclaim'),
  @('ensureFactoryMigrationsV38', 'ensureFutbolBotTreasuryFix', 'enterInterior', 'enterPark', 'executeHeistPlan', 'expireHeistPlans', 'expireInteriorPresence', 'expireOldFactoryShareListings'),
  @('expireOldMarketplaceListings', 'expireOnNumaraTables', 'expireParkPresence', 'expireRaceRooms', 'fireEmployee', 'fireFutbolManager', 'forceRefreshFutbolTransferMarket', 'forfeitRace'),
  @('futbolProAction', 'futbolTransferMarketHourlyMaintenance', 'getCreditInfo', 'getFactoryValue', 'getFutbolTeamDetail', 'getMyFutbolTeamFinance', 'getMyRedemptionCode', 'getPlayerCard'),
  @('getStateReport', 'giftHeldItem', 'giveNasihat', 'goldLedger', 'hourlyInvestmentUpdate', 'houseAction', 'initializePlayer', 'instantSellFutbolPlayer'),
  @('instantSellListing', 'joinFactoryMachine', 'joinHeistPlan', 'joinOnNumaraTable', 'joinRaceRoom', 'kickFromHeistPlan', 'leaveHeistPlan', 'leaveOnNumaraTable'),
  @('leaveRaceRoomAsJoiner', 'listFactoryShare', 'listFutbolBuyableTeams', 'listFutbolClubs', 'listFutbolManagerApplications', 'listFutbolManagerOpportunities', 'listFutbolPlayerForSale', 'listFutbolTeamForManagers'),
  @('listFutbolTeamForSale', 'listFutbolTransferMarket', 'listSponsorshipFactoriesForTeam', 'listSponsorshipTeamsForFactory', 'markAllMessagesRead', 'markAllSixtagramNotificationsRead', 'markFactoryNotificationsRead', 'markFutbolTeamNotificationsRead'),
  @('markMessageRead', 'mekanSayacEvCikis', 'mekanSayacEvGiris', 'mekanSayacIcCikis', 'mekanSayacIcGiris', 'mekanSayacParkCikis', 'mekanSayacParkGiris', 'migrateArabaGelistirmeUnification'),
  @('migrateOnboardingPoliceRule', 'migrateVehicleWeaponLifeCap', 'migrateVehicleWeaponLifeCap20', 'migrateWeaponLifeCap10', 'onNumaraAutoStand', 'onNumaraHit', 'onNumaraStand', 'openFutbolTreasuryWithdrawRequest'),
  @('payFutbolTrainingSlot', 'pingRoom', 'placeFutbolBet', 'placeFutbolCupBet', 'placeLimanOrder', 'playBillingSweep', 'playerNameSweep', 'prayAtMosque'),
  @('presenceSummary', 'processCreditDefaults', 'produceAtFactory', 'raceHubAction', 'raiseSponsorshipFee', 'reactChatMessage', 'reassignEmployee', 'recomputeTodaysFutbolOddsNow'),
  @('recordVenueVisit', 'refreshHeistPlanParticipants', 'removeFutbolTraining', 'renameVehicle', 'repairItem', 'repayCredit', 'repayStateDebt', 'repayVehicleLoan'),
  @('reportContent', 'requestAccountDeletion', 'requestFutbolManagerHandover', 'requestSponsorshipFeeRaise', 'resetFutbolTransferMarket', 'resignFromFactory', 'resignFromPolice', 'resignFutbolManager'),
  @('resignImam', 'resolveFutbolMatchdayReveal', 'resolveFutbolMatchdayStart', 'resolveStuckRewardsNow', 'respondFutbolManagerApplication', 'respondFutbolManagerHandover', 'respondFutbolTreasuryWithdrawRequest', 'respondSponsorshipFeeRaiseRequest'),
  @('respondSponsorshipOffer', 'runFactoryMachines', 'runFutbolBotPlayerBoostNow', 'runFutbolBotTreasuryFixNow', 'runMergeLegacyMaterialListings', 'runV124MigrationsNow', 'seedFutbolWorld', 'sellContrabandAtPark'),
  @('sellContrabandToDepo', 'sellFutbolTeam', 'sellInvestment', 'sellMaterial', 'sellSilahMaterial', 'sendChatMessage', 'sendClubSponsorshipOffer', 'sendFactorySponsorshipOffer'),
  @('sendOnNumaraEmoji', 'sendRaceEmoji', 'setAvatar', 'setDisplayName', 'setFactoryLogo', 'setFactoryName', 'setFactorySalary', 'setFutbolLineup'),
  @('setFutbolTeamLogo', 'setFutbolTicketPrice', 'settleMaterialListingBatches', 'shopAction', 'shopierOsbWebhook', 'socialAction', 'socialCleanup', 'spinRoulette'),
  @('spinSlot', 'startRace', 'streamAction', 'submitFeedback', 'submitFlappyScore', 'syncAchievements', 'takeCredit', 'takeVehicleLoan'),
  @('toggleFeedbackLike', 'toggleSixtagramLike', 'triggerAllMining', 'unblockUser', 'updateHeistPlanNote', 'updateSponsorshipNote', 'upgradeFutbolStadium', 'upgradeVehicle'),
  @('upgradeWeapon', 'v124Migrate', 'verifyPlayPurchase', 'withdrawFromBank', 'withdrawFutbolTreasury20Percent', 'withdrawSponsorshipCancellation', 'withdrawSponsorshipOffer'),
  @('gangClock', 'gangAction', 'dailyReset', 'dailyResetRecovery', 'belediyeAction')
)

$basarisiz = @()
function Yukle($g, $etiket) {
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== $etiket : $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  # Cok sayida fonksiyonda ilk deneme genelde kota yuzunden yarim kalir: 2 kez daha denenir
  $deneme = 1
  while ($LASTEXITCODE -ne 0 -and $deneme -le 2) {
    Write-Host "Hata. 120 sn bekleyip tekrar deneniyor ($deneme / 2)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
    $deneme++
  }
  if ($LASTEXITCODE -ne 0) { $script:basarisiz += ,$g }
  Start-Sleep -Seconds 45
}

Write-Host "===== Firestore kurallari =====" -ForegroundColor Cyan
firebase deploy --only firestore:rules
if ($LASTEXITCODE -ne 0) {
  Start-Sleep -Seconds 60
  firebase deploy --only firestore:rules
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "Kurallar yuklenemedi. Once bunu coz (fonksiyonlara gecilmedi)." -ForegroundColor Red
  exit 1
}

$i = 0
foreach ($g in $gruplar) { $i++; Yukle $g "Grup $i / $($gruplar.Count)" }

Write-Host ""
if ($basarisiz.Count -eq 0) {
  Write-Host "TAMAM: Kurallar ve tum fonksiyonlar yuklendi. Simdi istemci icin:" -ForegroundColor Green
  Write-Host '  git add -A' -ForegroundColor Green
  Write-Host '  git commit -m "v127"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene (git push'u bunlar bitince yap):" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
