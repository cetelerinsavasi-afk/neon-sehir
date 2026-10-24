# Neon Sehir v124 (v123 de bununla birlikte gider — v123 henuz yuklenmediyse)
#   - Suphe 50+: ekip kurabilir / katilabilir, soygun baslatilamaz (adi soylenir)
#   - Isim degisikligi cete + arkadas listesi + ChatsApp'e yansir; silah tamirinde en guclu silah secili;
#     2. elde "Sifir" filtresi; isletme listesinde fiyatlar
#   - Yeni oyuncu gorevleri (gorev 2-3 degisti, 3 gorev kalkti; kaldigi yerden devam)
#   - Amazor + Liman kalkti (AMAZOR_PRICES kaldi); liman siparisleri iade + SMS; DEPO isletmesi + oyunun deposu
#   - Malzeme sistemi: fabrika + isletme ortak envanteri, Magaza (B2B), malzeme vergisi kalkti
#   - Oyunun gazinosu: Casino uygulamasi kalkti, rulet, yeni slot, gazino basina piyango
#   - Oyuncu gazinolari (slot / rulet / 10 Numara / piyango, makine kasalari, %10 cekim vergisi)
#   - Yayinda "Casinolar"
#   - Ceteler: 10 gun oyuna girmeyen uye ceteden cikar; her cete gunde (00:00 uye sayisi x 1.250)
#     altinlik yasakli madde siparis edebilir (yol sahibine eklenir); yoldaki tirlar Savas panelinde
#
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v124.ps1
#
# Sira: 1) Firestore kurallari + indeksler  2) TUM fonksiyonlar (index.js'teki ortak gorev
# yardimcisi her yerde kullanildigi icin hepsi) — 8'erli gruplar, aralarda bekleme (kota)
# 3) en son gece isi + gecis isi (v124Migrate)  4) git push (istemci).
# Toplam sure: yaklasik 1-1,5 saat. Yarida kalirsa sadece "yuklenemedi" listesini tekrar calistir.

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
  @('futbolProAction', 'futbolTransferMarketHourlyMaintenance', 'gangAction', 'gangClock', 'getCreditInfo', 'getFactoryValue', 'getFutbolTeamDetail', 'getMyFutbolTeamFinance'),
  @('getMyRedemptionCode', 'getPlayerCard', 'getStateReport', 'giftHeldItem', 'giveNasihat', 'goldLedger', 'hourlyInvestmentUpdate', 'houseAction'),
  @('initializePlayer', 'instantSellFutbolPlayer', 'instantSellListing', 'joinFactoryMachine', 'joinHeistPlan', 'joinOnNumaraTable', 'joinRaceRoom', 'kickFromHeistPlan'),
  @('leaveHeistPlan', 'leaveOnNumaraTable', 'leaveRaceRoomAsJoiner', 'listFactoryShare', 'listFutbolBuyableTeams', 'listFutbolClubs', 'listFutbolManagerApplications', 'listFutbolManagerOpportunities'),
  @('listFutbolPlayerForSale', 'listFutbolTeamForManagers', 'listFutbolTeamForSale', 'listFutbolTransferMarket', 'listSponsorshipFactoriesForTeam', 'listSponsorshipTeamsForFactory', 'markAllMessagesRead', 'markAllSixtagramNotificationsRead'),
  @('markFactoryNotificationsRead', 'markFutbolTeamNotificationsRead', 'markMessageRead', 'mekanSayacEvCikis', 'mekanSayacEvGiris', 'mekanSayacIcCikis', 'mekanSayacIcGiris', 'mekanSayacParkCikis'),
  @('mekanSayacParkGiris', 'migrateArabaGelistirmeUnification', 'migrateOnboardingPoliceRule', 'migrateVehicleWeaponLifeCap', 'migrateVehicleWeaponLifeCap20', 'migrateWeaponLifeCap10', 'onNumaraAutoStand', 'onNumaraHit'),
  @('onNumaraStand', 'openFutbolTreasuryWithdrawRequest', 'payFutbolTrainingSlot', 'pingRoom', 'placeFutbolBet', 'placeFutbolCupBet', 'placeLimanOrder', 'playBillingSweep'),
  @('playerNameSweep', 'prayAtMosque', 'presenceSummary', 'processCreditDefaults', 'produceAtFactory', 'raceHubAction', 'raiseSponsorshipFee', 'reactChatMessage'),
  @('reassignEmployee', 'recomputeTodaysFutbolOddsNow', 'recordVenueVisit', 'refreshHeistPlanParticipants', 'removeFutbolTraining', 'renameVehicle', 'repairItem', 'repayCredit'),
  @('repayStateDebt', 'repayVehicleLoan', 'reportContent', 'requestAccountDeletion', 'requestFutbolManagerHandover', 'requestSponsorshipFeeRaise', 'resetFutbolTransferMarket', 'resignFromFactory'),
  @('resignFromPolice', 'resignFutbolManager', 'resignImam', 'resolveFutbolMatchdayReveal', 'resolveFutbolMatchdayStart', 'resolveStuckRewardsNow', 'respondFutbolManagerApplication', 'respondFutbolManagerHandover'),
  @('respondFutbolTreasuryWithdrawRequest', 'respondSponsorshipFeeRaiseRequest', 'respondSponsorshipOffer', 'runFactoryMachines', 'runFutbolBotPlayerBoostNow', 'runFutbolBotTreasuryFixNow', 'runMergeLegacyMaterialListings', 'seedFutbolWorld'),
  @('sellContrabandAtPark', 'sellContrabandToDepo', 'sellFutbolTeam', 'sellInvestment', 'sellMaterial', 'sellSilahMaterial', 'sendChatMessage', 'sendClubSponsorshipOffer'),
  @('sendFactorySponsorshipOffer', 'sendOnNumaraEmoji', 'sendRaceEmoji', 'setAvatar', 'setDisplayName', 'setFactoryLogo', 'setFactoryName', 'setFactorySalary'),
  @('setFutbolLineup', 'setFutbolTeamLogo', 'setFutbolTicketPrice', 'settleMaterialListingBatches', 'shopAction', 'shopierOsbWebhook', 'socialAction', 'socialCleanup'),
  @('spinRoulette', 'spinSlot', 'startRace', 'streamAction', 'submitFeedback', 'submitFlappyScore', 'syncAchievements', 'takeCredit'),
  @('takeVehicleLoan', 'toggleFeedbackLike', 'toggleSixtagramLike', 'triggerAllMining', 'unblockUser', 'updateHeistPlanNote', 'updateSponsorshipNote', 'upgradeFutbolStadium'),
  @('upgradeVehicle', 'upgradeWeapon', 'verifyPlayPurchase', 'withdrawFromBank', 'withdrawFutbolTreasury20Percent', 'withdrawSponsorshipCancellation', 'withdrawSponsorshipOffer'),
  @('dailyReset', 'dailyResetRecovery', 'v124Migrate')
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

Write-Host "===== Firestore kurallari + indeksler =====" -ForegroundColor Cyan
firebase deploy --only firestore:rules,firestore:indexes
if ($LASTEXITCODE -ne 0) {
  Start-Sleep -Seconds 60
  firebase deploy --only firestore:rules,firestore:indexes
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "Kurallar / indeksler yuklenemedi. Once bunu coz (fonksiyonlara gecilmedi)." -ForegroundColor Red
  exit 1
}

$i = 0
foreach ($g in $gruplar) { $i++; Yukle $g "Grup $i / $($gruplar.Count)" }

Write-Host ""
if ($basarisiz.Count -eq 0) {
  Write-Host "TAMAM: Kurallar, indeksler ve tum fonksiyonlar yuklendi. Simdi istemci icin:" -ForegroundColor Green
  Write-Host '  git add -A' -ForegroundColor Green
  Write-Host '  git commit -m "v124"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene (git push'u bunlar bitince yap):" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
