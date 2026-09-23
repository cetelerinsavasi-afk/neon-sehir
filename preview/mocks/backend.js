// Önizleme arka ucu: GERÇEK çete sistemi + bellek içi Firestore, tarayıcıda.
// Sadece görsel inceleme / uçtan uca akış testi içindir; production build'e girmez.
import { FakeFirestore, FieldValue } from '../../functions/gang/test/fakeFirestore.js';
import { createGangSystem } from '../../functions/gang/system.js';
import { VEHICLE_CATALOG, WEAPON_CATALOG } from '../../functions/catalogData.js';

export const PREVIEW_UID = 'previewAdmin';
export const PREVIEW_PASSWORD = 'test';

export class PreviewHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const fakeDb = new FakeFirestore({ yieldEvery: true });
export const system = createGangSystem({
  db: fakeDb,
  FieldValue,
  HttpsError: PreviewHttpsError,
  getMaxWeaponPower: async () => 45_000,
  splitIncomeForDebt: (debt, amount) => ({ goldDelta: amount, debtDelta: 0 }),
  catalogs: { VEHICLE_CATALOG, WEAPON_CATALOG, AMAZOR_PRICES: { tamirMalzemesi: 10, silahUpgrade: 100, arabaGelistirme: 500, yasakliMadde: 2500 } },
  lifeDays: 20,
  adminUids: [PREVIEW_UID],
  getTestPassword: () => PREVIEW_PASSWORD,
  log: () => {},
});

// normal oyuncu belgesi (usePlayer için)
fakeDb.doc(`users/${PREVIEW_UID}`).set({ displayName: 'Önizleme Admin', gold: 5_000_000, reputation: 100, suspicion: 0 });
if (typeof window !== 'undefined') window.__gang = { fakeDb, system };
