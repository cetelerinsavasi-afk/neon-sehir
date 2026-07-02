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

export const factoryWork = () => httpsCallable(functions, 'factoryWork')();

export const buyProductionMachine = (machineType) =>
  httpsCallable(functions, 'buyProductionMachine')({ machineType });

export const collectProduction = (machineType) =>
  httpsCallable(functions, 'collectProduction')({ machineType });

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


export const sellSilahMaterial = () => httpsCallable(functions, 'sellSilahMaterial')();

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

// --- Casino: Piyango (Bölüm 11) ---

export const buyLotteryTicket = (quantity) =>
  httpsCallable(functions, 'buyLotteryTicket')({ quantity });

// --- Telefon: "2." İkinci El Satış (Bölüm 9.1) ---

export const createListing = (payload) => httpsCallable(functions, 'createListing')(payload);

export const cancelListing = (listingId) =>
  httpsCallable(functions, 'cancelListing')({ listingId });

export const buyListing = (listingId) => httpsCallable(functions, 'buyListing')({ listingId });

// --- Faz 5: Şüphe Yönetimi ve Soygun ---

export const prayAtMosque = () => httpsCallable(functions, 'prayAtMosque')();

export const bribePolice = () => httpsCallable(functions, 'bribePolice')();

export const buyFromVendor = (vendorId) =>
  httpsCallable(functions, 'buyFromVendor')({ vendorId });

export const attemptHeist = (target) =>
  httpsCallable(functions, 'attemptHeist')({ target });

// --- Faz 6: Depo, Park, Liman (kaçakçılık) ---


export const sellContrabandToDepo = (quantity) =>
  httpsCallable(functions, 'sellContrabandToDepo')({ quantity });

export const sellContrabandAtPark = (quantity) =>
  httpsCallable(functions, 'sellContrabandAtPark')({ quantity });

export const placeLimanOrder = (materialType, quantity) =>
  httpsCallable(functions, 'placeLimanOrder')({ materialType, quantity });

// --- Faz 7: Ekip Soygunu ---
// (Polisin rolü sızmaktır — kendi soygun/plan başlatamaz, ama başkasının
// planına joinHeistPlan ile katılabilir. Ayrı bir "nöbet" mekaniği yok.)

export const createHeistPlan = (target) =>
  httpsCallable(functions, 'createHeistPlan')({ target });

export const joinHeistPlan = (planId) =>
  httpsCallable(functions, 'joinHeistPlan')({ planId });

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

// --- Faz 9: Yarış Pisti ---

export const createRaceRoom = (vehicleId, betAmount) =>
  httpsCallable(functions, 'createRaceRoom')({ vehicleId, betAmount });

export const joinRaceRoom = (roomId, vehicleId) =>
  httpsCallable(functions, 'joinRaceRoom')({ roomId, vehicleId });

export const declineOpponent = (roomId) =>
  httpsCallable(functions, 'declineOpponent')({ roomId });

export const startRace = (roomId) => httpsCallable(functions, 'startRace')({ roomId });

export const cancelRaceRoom = (roomId) =>
  httpsCallable(functions, 'cancelRaceRoom')({ roomId });

export const rollDice = (roomId, useNitro, useTurbo) =>
  httpsCallable(functions, 'rollDice')({ roomId, useNitro, useTurbo });

export const autoRoll = (roomId) => httpsCallable(functions, 'autoRoll')({ roomId });

export const raceBuyAtStation = (roomId, item) =>
  httpsCallable(functions, 'raceBuyAtStation')({ roomId, item });

export const raceBuyOffsiteFuel = (roomId) =>
  httpsCallable(functions, 'raceBuyOffsiteFuel')({ roomId });

export const raceBuyNitro = (roomId) =>
  httpsCallable(functions, 'raceBuyNitro')({ roomId });

export const raceChangeGear = (roomId, delta) =>
  httpsCallable(functions, 'raceChangeGear')({ roomId, delta });
