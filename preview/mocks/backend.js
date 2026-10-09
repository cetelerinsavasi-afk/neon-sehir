// Önizleme arka ucu: GERÇEK çete sistemi + bellek içi Firestore, tarayıcıda.
// Sadece görsel inceleme / uçtan uca akış testi içindir; production build'e girmez.
import { createVisits } from '../../functions/visits.js';
import { FakeFirestore, FieldValue } from '../../functions/gang/test/fakeFirestore.js';
import { createGangSystem } from '../../functions/gang/system.js';
import { VEHICLE_CATALOG, WEAPON_CATALOG } from '../../functions/catalogData.js';
import { createHouses } from '../../functions/houses.js';
import { createBusiness } from '../../functions/business.js';
import { createShop } from '../../functions/shop.js';
import { createVenue } from '../../functions/venue.js';
import { createGym } from '../../functions/gym.js';
import { createFutbolPro } from '../../functions/futbolPro.js';
import { futbolDayKey } from '../../functions/businessCatalogData.js';
import { createRaceTa } from '../../functions/raceTa.js';
import { createCosmetics } from '../../functions/cosmetics.js';

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
fakeDb.doc(`users/${PREVIEW_UID}`).set({ displayName: 'Önizleme Admin', gold: 5_000_000, emerald: 120, reputation: 100, suspicion: 0 });
if (typeof window !== 'undefined') window.__gang = { fakeDb, system };

// v77 İşletmeler önizlemesi (gerçek sunucu kodu)
export const business = createBusiness({ db: fakeDb, FieldValue });
export const venue = createVenue({ db: fakeDb, FieldValue, HttpsError: PreviewHttpsError, splitIncomeForDebt: (debt, amount) => ({ goldDelta: amount, debtDelta: 0 }), business });
export const gym = createGym({ db: fakeDb, FieldValue, HttpsError: PreviewHttpsError, splitIncomeForDebt: (debt, amount) => ({ goldDelta: amount, debtDelta: 0 }), business });
export const shop = createShop({
  extraOps: { ...venue.ops, ...gym.ops },
  db: fakeDb,
  FieldValue,
  HttpsError: PreviewHttpsError,
  requireAuth: (r) => r.auth.uid,
  onCall: (fn) => fn,
  splitIncomeForDebt: (debt, amount) => ({ goldDelta: amount, debtDelta: 0 }),
  business,
});

// v77 ziyaret sayacı
export const visits = createVisits({ db: fakeDb, FieldValue });
// v65 3D Ev önizlemesi
export const houses = createHouses({
  visits,
  bizHooks: shop.bizHooks,
  db: fakeDb,
  FieldValue,
  HttpsError: PreviewHttpsError,
  requireAuth: (r) => r.auth.uid,
  onCall: (fn) => fn,
  isAdmin: (uid) => uid === PREVIEW_UID,
  assertCanSpeak: async () => {},
  isFriend: async (a, b) => Boolean((await fakeDb.doc(`friendships/${a}`).get()).data()?.friends?.[b]),
});
fakeDb.doc('users/misafir1').set({ gold: 3_000_000, emerald: 10, displayName: 'Misafir Ali', avatar: { gender: 'kadin', hairStyle: 'long', clothColor: '#8a1d1d' } });
fakeDb.doc('usernames/misafir ali').set({ uid: 'misafir1' });
fakeDb.doc(`friendships/${PREVIEW_UID}`).set({ friends: { misafir1: true } });
fakeDb.doc('friendships/misafir1').set({ friends: { [PREVIEW_UID]: true } });

// v67 önizleme verileri
fakeDb.doc(`users/${PREVIEW_UID}`).set({ achievements: { imam: Date.now() - 86400000, piyango: Date.now() - 3600000 } }, { merge: true });
['Banka: kredin yattı.', 'Başarılar: 🏆 Piyango kazandın!', 'Emlak: evin hazır.'].forEach((text, i) =>
  fakeDb.collection(`users/${PREVIEW_UID}/messages`).doc(`m${i}`).set({ text, read: false, createdAt: { toDate: () => new Date(Date.now() - i * 60000) } })
);
[
  { kind: 'fikir', text: 'Evlerde havuz olsun, yazın partiler verelim!', likeCount: 12, ago: 30 },
  { kind: 'hata', text: 'Yarış ekranında bazen geri tuşu çalışmıyor.', likeCount: 3, ago: 60 * 50 },
  { kind: 'fikir', text: 'Çetelere bayrak tasarımı eklensin.', likeCount: 27, ago: 60 * 70 },
].forEach((f, i) =>
  fakeDb.collection('feedback').doc(`f${i}`).set({ uid: `o${i}`, displayName: ['Ayşe', 'Mert', 'Can'][i], avatar: null, kind: f.kind, text: f.text, likeCount: f.likeCount, createdAtMs: Date.now() - f.ago * 60000 })
);

// v77 Faz 5 önizlemesi — gerçek futbolcular (aynı sunucu modülü)
const fMode = (t) => (t.managerUid ? 'MANAGED' : !t.ownerUid ? 'BOT' : t.autoManaged ? 'OWNER_AUTO' : 'OWNER_ACTIVE');
export const futbolPro = createFutbolPro({
  db: fakeDb,
  FieldValue,
  HttpsError: PreviewHttpsError,
  futbolDayKey,
  getControlMode: fMode,
  controllerUidOf: (t) => (t.managerUid ? t.managerUid : fMode(t) === 'OWNER_ACTIVE' ? t.ownerUid : null),
});

// v78 zamana karşı yarış önizlemesi (gerçek sunucu modülü raceTa)
export const raceTa = createRaceTa({
  db: fakeDb,
  FieldValue,
  HttpsError: PreviewHttpsError,
  requireAuth: (r) => r.auth.uid,
  finalizeRace: ({ tx, roomRef, room, winnerUid, players, userRefs }) => {
    Object.keys(players).forEach((u) => {
      if (u === 'bot') return;
      const amount = winnerUid === 'draw' ? room.betAmount : winnerUid === u ? room.betAmount * 2 : 0;
      if (amount > 0) tx.update(userRefs[u], { gold: FieldValue.increment(amount) });
    });
    const upd = { status: 'finished', winnerUid };
    Object.keys(players).forEach((u) => (upd[`players.${u}`] = players[u]));
    tx.update(roomRef, upd);
  },
  processTrainingReward: async () => {},
});

// v78 evcil hayvan & aksesuar önizlemesi (gerçek sunucu modülü)
export const cosmetics = createCosmetics({ db: fakeDb, FieldValue, HttpsError: PreviewHttpsError });
