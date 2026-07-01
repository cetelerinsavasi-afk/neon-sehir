import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * gameActions — Faz 2 kapsamındaki oyun-kritik işlemler.
 * Hepsi Cloud Functions üzerinden çalışır; istemci asla gold/suspicion
 * gibi alanları doğrudan Firestore'a yazmaz (Bölüm 15).
 */
export const chooseProfession = (profession) =>
  httpsCallable(functions, 'chooseProfession')({ profession });

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

export const buyWeapon = (catalogId) =>
  httpsCallable(functions, 'buyWeapon')({ catalogId });

export const upgradeWeapon = (weaponId) =>
  httpsCallable(functions, 'upgradeWeapon')({ weaponId });

export const buySilahMaterial = () => httpsCallable(functions, 'buySilahMaterial')();

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

// --- Faz 5: Şüphe Yönetimi ve Soygun ---

export const prayAtMosque = () => httpsCallable(functions, 'prayAtMosque')();

export const bribePolice = () => httpsCallable(functions, 'bribePolice')();

export const buyFromVendor = (vendorId) =>
  httpsCallable(functions, 'buyFromVendor')({ vendorId });

export const attemptHeist = (target) =>
  httpsCallable(functions, 'attemptHeist')({ target });

// --- Faz 6: Depo, Park, Liman (kaçakçılık) ---

export const buyContrabandFromDepo = (quantity) =>
  httpsCallable(functions, 'buyContrabandFromDepo')({ quantity });

export const sellContrabandToDepo = (quantity) =>
  httpsCallable(functions, 'sellContrabandToDepo')({ quantity });

export const sellContrabandAtPark = (quantity) =>
  httpsCallable(functions, 'sellContrabandAtPark')({ quantity });

export const placeLimanOrder = (materialType, quantity) =>
  httpsCallable(functions, 'placeLimanOrder')({ materialType, quantity });
