import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * gameActions — Faz 2 kapsamındaki oyun-kritik işlemler.
 * Hepsi Cloud Functions üzerinden çalışır; istemci asla gold/suspicion
 * gibi alanları doğrudan Firestore'a yazmaz (Bölüm 15).
 */
export const applyForPolice = () => httpsCallable(functions, 'applyForPolice')();

export const resignFromPolice = () => httpsCallable(functions, 'resignFromPolice')();

export const cancelPendingPoliceChange = () =>
  httpsCallable(functions, 'cancelPendingPoliceChange')();

export const createFactory = () => httpsCallable(functions, 'createFactory')();

export const buyFactoryMachine = (machineType) =>
  httpsCallable(functions, 'buyFactoryMachine')({ machineType });

export const setFactorySalary = (salary) =>
  httpsCallable(functions, 'setFactorySalary')({ salary });

export const setFactoryName = (name) =>
  httpsCallable(functions, 'setFactoryName')({ name });

export const setFactoryLogo = (logo) =>
  httpsCallable(functions, 'setFactoryLogo')({ logo });

export const joinFactoryMachine = (factoryId, machineId) =>
  httpsCallable(functions, 'joinFactoryMachine')({ factoryId, machineId });

export const autoJoinFactory = (factoryId) =>
  httpsCallable(functions, 'autoJoinFactory')({ factoryId });

export const produceAtFactory = () => httpsCallable(functions, 'produceAtFactory')();

export const resignFromFactory = () => httpsCallable(functions, 'resignFromFactory')();

export const triggerAllMining = () => httpsCallable(functions, 'triggerAllMining')();

export const runFactoryMachines = () => httpsCallable(functions, 'runFactoryMachines')();

export const fireEmployee = (machineId) =>
  httpsCallable(functions, 'fireEmployee')({ machineId });

export const reassignEmployee = (machineId, targetMachineId) =>
  httpsCallable(functions, 'reassignEmployee')({ machineId, targetMachineId });

// --- Fabrika Hisse (Stok) Piyasası ---

export const listFactoryShare = (percent, days, price) =>
  httpsCallable(functions, 'listFactoryShare')({ percent, days, price });

export const cancelFactoryShareListing = (shareId) =>
  httpsCallable(functions, 'cancelFactoryShareListing')({ shareId });

export const buyFactoryShare = (factoryId, shareId) =>
  httpsCallable(functions, 'buyFactoryShare')({ factoryId, shareId });

// --- Faz 3: Araba ve Silah Sistemi ---

export const buyVehicle = (catalogId) =>
  httpsCallable(functions, 'buyVehicle')({ catalogId });

export const upgradeVehicle = (vehicleId, upgradeType) =>
  httpsCallable(functions, 'upgradeVehicle')({ vehicleId, upgradeType });

export const sellMaterial = (materialType, quantity) =>
  httpsCallable(functions, 'sellMaterial')({ materialType, quantity });

export const buyFromAmazor = (materialType, quantity) =>
  httpsCallable(functions, 'buyFromAmazor')({ materialType, quantity });

export const buyWeapon = (catalogId) =>
  httpsCallable(functions, 'buyWeapon')({ catalogId });

export const upgradeWeapon = (weaponId) =>
  httpsCallable(functions, 'upgradeWeapon')({ weaponId });

export const repairItem = (itemType, itemId) =>
  httpsCallable(functions, 'repairItem')({ itemType, itemId });


export const sellSilahMaterial = (quantity) =>
  httpsCallable(functions, 'sellSilahMaterial')({ quantity });

// --- Faz 4: Banka ve Yatırım ---

export const depositToBank = (amount) =>
  httpsCallable(functions, 'depositToBank')({ amount });

export const withdrawFromBank = (amount) =>
  httpsCallable(functions, 'withdrawFromBank')({ amount });

export const buyInvestment = (assetType, amount) =>
  httpsCallable(functions, 'buyInvestment')({ assetType, amount });

export const sellInvestment = (assetType, amount) =>
  httpsCallable(functions, 'sellInvestment')({ assetType, amount });

export const sellAllInvestment = (assetType) =>
  httpsCallable(functions, 'sellInvestment')({ assetType, all: true });

// --- Banka Kredisi: Araç İpoteği (Bölüm 8.4) ---

export const takeVehicleLoan = (vehicleId, termDays) =>
  httpsCallable(functions, 'takeVehicleLoan')({ vehicleId, termDays });

export const repayVehicleLoan = (vehicleId, amount) =>
  httpsCallable(functions, 'repayVehicleLoan')({ vehicleId, amount });

export const repayStateDebt = (amount) =>
  httpsCallable(functions, 'repayStateDebt')({ amount });

// --- Casino: Piyango (Bölüm 11) ---

export const buyLotteryTicket = (quantity) =>
  httpsCallable(functions, 'buyLotteryTicket')({ quantity });

export const spinSlot = () => httpsCallable(functions, 'spinSlot')();

// --- Telefon: Flappy Bird mini oyunu ---

export const submitFlappyScore = (score) =>
  httpsCallable(functions, 'submitFlappyScore')({ score });

// --- Telefon: "2." İkinci El Satış (Bölüm 9.1) ---

export const createListing = (payload) => httpsCallable(functions, 'createListing')(payload);

export const instantSellListing = (payload) =>
  httpsCallable(functions, 'instantSellListing')(payload);

export const cancelListing = (listingId) =>
  httpsCallable(functions, 'cancelListing')({ listingId });

// --- Telefon: Sixtagram (mini sosyal medya) ---

export const createSixtagramPost = (text, attachment) =>
  httpsCallable(functions, 'createSixtagramPost')({ text, attachment });

// captureCameraSnapshot — fotoğraf makinesi AÇILDIĞI anda çağrılır, o ANKİ
// kareyi (kendim + yakındaki oyuncular) sunucuda dondurur; "Paylaş"a
// basıldığında createSixtagramPost bu dondurulmuş kareyi kullanır, böylece
// paylaşılan fotoğraf makine açıldığında görülenden farklı olmaz.
export const captureCameraSnapshot = (payload) =>
  httpsCallable(functions, 'captureCameraSnapshot')(payload);

export const toggleSixtagramLike = (postId) =>
  httpsCallable(functions, 'toggleSixtagramLike')({ postId });

export const deleteSixtagramPost = (postId) =>
  httpsCallable(functions, 'deleteSixtagramPost')({ postId });

export const createSixtagramComment = (postId, text, parentCommentId) =>
  httpsCallable(functions, 'createSixtagramComment')({ postId, text, parentCommentId });

export const markAllSixtagramNotificationsRead = () =>
  httpsCallable(functions, 'markAllSixtagramNotificationsRead')();

// --- Telefon: Altın Mağazası (Shopier Dükkan üzerinden gerçek para) ---

export const getMyRedemptionCode = () => httpsCallable(functions, 'getMyRedemptionCode')();

// quantity sadece malzeme ilanlarında kullanılır — istenen kadar adet
// satın almak için (bkz. functions/index.js buyListing).
export const buyListing = (listingId, quantity) =>
  httpsCallable(functions, 'buyListing')({ listingId, quantity });

// Eski (adet-fiyatlı/birleştirme sisteminden önce açılmış, rastgele
// ID'li) malzeme ilanlarını canonical ilanla birleştirir. Zararsız/
// idempotent — MarketplaceScreen açılınca otomatik bir kez çağrılıyor.
export const runMergeLegacyMaterialListings = () =>
  httpsCallable(functions, 'runMergeLegacyMaterialListings')();

// Depo + Vites Geliştirme Malzemeleri'ni TEK malzemede (Araba Geliştirme
// Malzemesi) birleştiren bir kerelik geçiş — envanterler, fabrika
// makineleri, açık 2. el ilanları, Liman siparişleri. Zararsız/
// idempotent — uygulama açılınca otomatik bir kez çağrılıyor (bkz.
// App.jsx GameShell).
export const migrateArabaGelistirmeUnification = () =>
  httpsCallable(functions, 'migrateArabaGelistirmeUnification')();

// Araç/silah ömür tavanı 50'den 30 güne düştüğünde, eski (50 güne göre
// yaşlanmış) kayıtları yeni tavana (29) çeken bir kerelik geçiş.
// Zararsız/idempotent — uygulama açılınca otomatik bir kez çağrılıyor.
export const migrateVehicleWeaponLifeCap = () =>
  httpsCallable(functions, 'migrateVehicleWeaponLifeCap')();

export const migrateVehicleWeaponLifeCap20 = () =>
  httpsCallable(functions, 'migrateVehicleWeaponLifeCap20')();

// --- Faz 5: Şüphe Yönetimi ve Soygun ---

export const prayAtMosque = () => httpsCallable(functions, 'prayAtMosque')();

export const becomeBeggar = (note) => httpsCallable(functions, 'becomeBeggar')({ note });

export const donateToBeggar = (beggarUid, amount) =>
  httpsCallable(functions, 'donateToBeggar')({ beggarUid, amount });

export const applyForImam = () => httpsCallable(functions, 'applyForImam')();

export const giveNasihat = (text) => httpsCallable(functions, 'giveNasihat')({ text });

export const claimImamSalary = () => httpsCallable(functions, 'claimImamSalary')();

export const bribePolice = () => httpsCallable(functions, 'bribePolice')();

export const claimPoliceSalary = () => httpsCallable(functions, 'claimPoliceSalary')();

export const applyReferralCode = (referralCode) =>
  httpsCallable(functions, 'applyReferralCode')({ referralCode });

export const buyFromVendor = (vendorId) =>
  httpsCallable(functions, 'buyFromVendor')({ vendorId });

export const attemptHeist = (target) =>
  httpsCallable(functions, 'attemptHeist')({ target });

// --- Faz 6: Depo, Park, Liman (kaçakçılık) ---


export const sellContrabandToDepo = (quantity) =>
  httpsCallable(functions, 'sellContrabandToDepo')({ quantity });

export const sellContrabandAtPark = () => httpsCallable(functions, 'sellContrabandAtPark')();

// --- Park Dünyası ---

export const enterPark = () => httpsCallable(functions, 'enterPark')();

export const buyFromBufe = (itemId) => httpsCallable(functions, 'buyFromBufe')({ itemId });

// --- Gazino Dünyası (madde 7-9) ---

export const buyFromGazinoBar = (itemId) => httpsCallable(functions, 'buyFromGazinoBar')({ itemId });

// --- Girilebilir mekanlar: canlı/çok oyunculu (madde 17) ---

export const enterInterior = (locationId) =>
  httpsCallable(functions, 'enterInterior')({ locationId });

export const placeLimanOrder = (materialType, quantity) =>
  httpsCallable(functions, 'placeLimanOrder')({ materialType, quantity });

export const cancelLimanOrder = (materialType) =>
  httpsCallable(functions, 'cancelLimanOrder')({ materialType });

// --- Faz 7: Ekip Soygunu ---
// (Polisin rolü sızmaktır — kendi soygun/plan başlatamaz, ama başkasının
// planına joinHeistPlan ile katılabilir. Ayrı bir "nöbet" mekaniği yok.)

export const createHeistPlan = (target) =>
  httpsCallable(functions, 'createHeistPlan')({ target });

export const joinHeistPlan = (planId) =>
  httpsCallable(functions, 'joinHeistPlan')({ planId });

export const refreshHeistPlanParticipants = (planId) =>
  httpsCallable(functions, 'refreshHeistPlanParticipants')({ planId });

export const updateHeistPlanNote = (planId, note) =>
  httpsCallable(functions, 'updateHeistPlanNote')({ planId, note });

export const leaveHeistPlan = (planId) =>
  httpsCallable(functions, 'leaveHeistPlan')({ planId });

export const kickFromHeistPlan = (planId, targetUid) =>
  httpsCallable(functions, 'kickFromHeistPlan')({ planId, targetUid });

export const cancelHeistPlan = (planId) =>
  httpsCallable(functions, 'cancelHeistPlan')({ planId });

export const executeHeistPlan = (planId) =>
  httpsCallable(functions, 'executeHeistPlan')({ planId });

// --- SMS gelen kutusu ---

export const markMessageRead = (messageId) =>
  httpsCallable(functions, 'markMessageRead')({ messageId });

// --- ChatsApp (genel sohbet) ---

export const sendChatMessage = (text) => httpsCallable(functions, 'sendChatMessage')({ text });

// --- Ev: oyuncu profili ---

export const setDisplayName = (displayName) =>
  httpsCallable(functions, 'setDisplayName')({ displayName });

export const setAvatar = (avatar) => httpsCallable(functions, 'setAvatar')({ avatar });

// --- Faz 9: Yarış Pisti ---

export const createRaceRoom = (vehicleId, betAmount) =>
  httpsCallable(functions, 'createRaceRoom')({ vehicleId, betAmount });

export const joinRaceRoom = (roomId, vehicleId) =>
  httpsCallable(functions, 'joinRaceRoom')({ roomId, vehicleId });

export const declineOpponent = (roomId) =>
  httpsCallable(functions, 'declineOpponent')({ roomId });

export const leaveRaceRoomAsJoiner = (roomId) =>
  httpsCallable(functions, 'leaveRaceRoomAsJoiner')({ roomId });

export const startRace = (roomId) => httpsCallable(functions, 'startRace')({ roomId });

export const cancelRaceRoom = (roomId) =>
  httpsCallable(functions, 'cancelRaceRoom')({ roomId });

export const forfeitRace = (roomId) => httpsCallable(functions, 'forfeitRace')({ roomId });

// NOT (performans/maliyet): zar atma, vites, nitro, benzin, antrenman ve
// şampiyona aksiyonlarının HEPSİ artık tek bir Cloud Function'a
// (raceHubAction) gidiyor — her biri ayrı fonksiyon olduğunda ilk
// kullanımda ayrı ayrı "cold start" (birkaç saniyelik uyanma) yaşanıyor,
// bu da yarışa ilk girişte kasma/tepkisizlik olarak hissediliyordu. Tek
// fonksiyona indirince sadece ilk aksiyon bu gecikmeyi yaşıyor, ondan
// sonraki tüm yarış aksiyonları aynı sıcak instance'ı paylaşıyor —
// minInstances gibi sürekli bir maliyet gerektirmez.
const raceHub = (action, data) => httpsCallable(functions, 'raceHubAction')({ action, ...data });

// warmUpRaceHub — RaceRoom ekranı açılır açılmaz, kullanıcı henüz
// hiçbir butona basmadan sessizce gönderilir; amaç raceHubAction'ı
// kullanıcı ilk zarı atmadan ÖNCE ısıtmak (cold start'ı gizlemek).
// Hata olursa (offline vs.) sessizce yutulur, kullanıcıya yansımaz.
export const warmUpRaceHub = () => raceHub('ping').catch(() => {});

export const rollDice = (roomId, useNitro, useTurbo) =>
  raceHub('rollDice', { roomId, useNitro, useTurbo });

export const autoRoll = (roomId) => raceHub('autoRoll', { roomId });

export const createTrainingRace = (vehicleId, level) =>
  raceHub('createTrainingRace', { vehicleId, level });

export const createChampionshipRace = (vehicleId) =>
  raceHub('createChampionshipRace', { vehicleId });

// NOT (mimari değişikliği — bkz. src/hooks/useLocalRace.js): antrenman ve
// şampiyona artık zar/vites/nitro/benzin mekaniğinin TAMAMINI istemcide
// çalıştırıyor, sunucuya tur başına hiç istek gitmiyor. finishSoloRace,
// yarış bitince (kazanınca/benzin bitince) TEK SEFERLİK çağrılıp sonucu
// sunucuya bildiren fonksiyon — ödül/liderlik tablosu gibi gerçek
// ekonomik etkisi olan her şey hâlâ sunucuda karara bağlanıyor.
export const finishSoloRace = (payload) => raceHub('finishSoloRace', payload);

export const raceRefuel = (roomId) => raceHub('raceRefuel', { roomId });

export const raceBuyNitro = (roomId) => raceHub('raceBuyNitro', { roomId });

export const raceChangeGear = (roomId, delta) => raceHub('raceChangeGear', { roomId, delta });

// --- Casino: "10 Numara" ---

export const createOnNumaraTable = (capacity, betAmount) =>
  httpsCallable(functions, 'createOnNumaraTable')({ capacity, betAmount });

export const joinOnNumaraTable = (tableId) =>
  httpsCallable(functions, 'joinOnNumaraTable')({ tableId });

export const leaveOnNumaraTable = (tableId) =>
  httpsCallable(functions, 'leaveOnNumaraTable')({ tableId });

export const dealOnNumaraCards = (tableId) =>
  httpsCallable(functions, 'dealOnNumaraCards')({ tableId });

export const onNumaraHit = (tableId) => httpsCallable(functions, 'onNumaraHit')({ tableId });

export const onNumaraStand = (tableId) => httpsCallable(functions, 'onNumaraStand')({ tableId });

export const onNumaraAutoStand = (tableId) =>
  httpsCallable(functions, 'onNumaraAutoStand')({ tableId });

export const sendOnNumaraEmoji = (tableId, emoji) =>
  httpsCallable(functions, 'sendOnNumaraEmoji')({ tableId, emoji });

export const pingOnNumaraTable = (tableId) =>
  httpsCallable(functions, 'pingRoom')({ collectionName: 'onNumaraTables', docId: tableId });

export const pingRaceRoom = (roomId) =>
  httpsCallable(functions, 'pingRoom')({ collectionName: 'raceRooms', docId: roomId });

export const sendRaceEmoji = (roomId, emoji) =>
  httpsCallable(functions, 'sendRaceEmoji')({ roomId, emoji });

// --- Faz Futbol ---

export const seedFutbolWorld = () => httpsCallable(functions, 'seedFutbolWorld')();

export const resetFutbolTransferMarket = () =>
  httpsCallable(functions, 'resetFutbolTransferMarket')();

export const forceRefreshFutbolTransferMarket = () =>
  httpsCallable(functions, 'forceRefreshFutbolTransferMarket')();

// --- Faz Futbol: Faz 4 (takım satın alma / satma) ---

export const listFutbolBuyableTeams = () => httpsCallable(functions, 'listFutbolBuyableTeams')();

export const getMyFutbolTeamFinance = () => httpsCallable(functions, 'getMyFutbolTeamFinance')();

export const buyFutbolTeam = (teamId) => httpsCallable(functions, 'buyFutbolTeam')({ teamId });

export const sellFutbolTeam = (teamId) => httpsCallable(functions, 'sellFutbolTeam')({ teamId });

// --- Faz Futbol: Faz 5 (kadro/taktik, transfer piyasası, forma) ---

export const setFutbolLineup = (teamId, formation, tactic, lineup, mucadele) =>
  httpsCallable(functions, 'setFutbolLineup')({ teamId, formation, tactic, lineup, mucadele });

// assignFutbolDoctor — sakat bir oyuncuyu 5000 altın karşılığında o gece
// bir gün daha hızlı iyileştir (doktor kutusu 00:00'da her halükarda
// boşalır, bkz. dailyReset).
export const assignFutbolDoctor = (teamId, playerId) =>
  httpsCallable(functions, 'assignFutbolDoctor')({ teamId, playerId });

export const listFutbolTransferMarket = () => httpsCallable(functions, 'listFutbolTransferMarket')();

export const instantSellFutbolPlayer = (playerId) =>
  httpsCallable(functions, 'instantSellFutbolPlayer')({ playerId });

export const listFutbolPlayerForSale = (playerId, price) =>
  httpsCallable(functions, 'listFutbolPlayerForSale')({ playerId, price });

export const cancelFutbolPlayerListing = (playerId) =>
  httpsCallable(functions, 'cancelFutbolPlayerListing')({ playerId });

export const buyFutbolPlayer = (playerId) => httpsCallable(functions, 'buyFutbolPlayer')({ playerId });

export const setFutbolTeamLogo = (teamId, shape, pattern, icon, primary, secondary) =>
  httpsCallable(functions, 'setFutbolTeamLogo')({ teamId, shape, pattern, icon, primary, secondary });

// --- Faz Futbol: Faz 6 (antrenman) ---

export const addFutbolTraining = (teamId, playerId) =>
  httpsCallable(functions, 'addFutbolTraining')({ teamId, playerId });

export const removeFutbolTraining = (teamId, playerId) =>
  httpsCallable(functions, 'removeFutbolTraining')({ teamId, playerId });

// --- Faz Futbol: Faz 7 (İddaa Bayii) ---

// placeFutbolBet — KULLANICI REVİZESİ (Çoklu Maç Kuponu): kupon artık TEK
// bir maça değil, `selections` dizisiyle (1 ya da daha fazla) istenildiği
// kadar maça birden yapılabiliyor. Her eleman { matchId, pick } şeklinde —
// gerçek oran istemciden GÖNDERİLMEZ, sunucu her maç için o gece dondurulmuş
// oranı kendisi okur ve çarpar (bkz. functions/index.js placeFutbolBet).
export const placeFutbolBet = (selections, stake) =>
  httpsCallable(functions, 'placeFutbolBet')({ selections, stake });

export const listFutbolTeamForSale = (teamId, price) =>
  httpsCallable(functions, 'listFutbolTeamForSale')({ teamId, price });

export const cancelFutbolTeamListing = (teamId) =>
  httpsCallable(functions, 'cancelFutbolTeamListing')({ teamId });

// --- Faz Futbol: Faz 10 (Kulüpler dizini) ---

export const listFutbolClubs = (leagueId) => httpsCallable(functions, 'listFutbolClubs')({ leagueId });

export const getFutbolTeamDetail = (teamId) =>
  httpsCallable(functions, 'getFutbolTeamDetail')({ teamId });

// --- Faz Futbol: Stadyum (kapasite yükseltme + bilet fiyatı) ---

export const upgradeFutbolStadium = (teamId) =>
  httpsCallable(functions, 'upgradeFutbolStadium')({ teamId });

export const setFutbolTicketPrice = (teamId, ticketPrice) =>
  httpsCallable(functions, 'setFutbolTicketPrice')({ teamId, ticketPrice });

// --- Kupa modülü ---

export const placeFutbolCupBet = (matchId, pick, stake) =>
  httpsCallable(functions, 'placeFutbolCupBet')({ matchId, pick, stake });

// --- Fabrika ↔ Futbol Kulübü Sponsorluk Sistemi ---

export const sendFactorySponsorshipOffer = (teamId, dailyAmount) =>
  httpsCallable(functions, 'sendFactorySponsorshipOffer')({ teamId, dailyAmount });

export const sendClubSponsorshipOffer = (factoryOwnerUid, dailyAmount) =>
  httpsCallable(functions, 'sendClubSponsorshipOffer')({ factoryOwnerUid, dailyAmount });

export const respondSponsorshipOffer = (offerId, accept) =>
  httpsCallable(functions, 'respondSponsorshipOffer')({ offerId, accept });

export const withdrawSponsorshipOffer = (offerId) =>
  httpsCallable(functions, 'withdrawSponsorshipOffer')({ offerId });

export const cancelSponsorship = (teamId) =>
  httpsCallable(functions, 'cancelSponsorship')({ teamId });

export const raiseSponsorshipFee = (teamId, newDailyAmount) =>
  httpsCallable(functions, 'raiseSponsorshipFee')({ teamId, newDailyAmount });

export const updateSponsorshipNote = (factoryOwnerUid, teamId, note) =>
  httpsCallable(functions, 'updateSponsorshipNote')({ factoryOwnerUid, teamId, note });

export const listSponsorshipTeamsForFactory = () =>
  httpsCallable(functions, 'listSponsorshipTeamsForFactory')();

export const listSponsorshipFactoriesForTeam = () =>
  httpsCallable(functions, 'listSponsorshipFactoriesForTeam')();
