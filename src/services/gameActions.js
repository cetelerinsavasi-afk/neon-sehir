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
