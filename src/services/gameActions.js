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
