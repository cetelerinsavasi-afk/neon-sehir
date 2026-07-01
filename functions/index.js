import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// DİKKAT: Bu bölge, istemcideki VITE_FIREBASE_FUNCTIONS_REGION ile
// (src/firebase.js) birebir aynı olmalı, yoksa çağrılar 404 döner.
setGlobalOptions({ region: 'europe-west1' });

const VALID_PROFESSIONS = ['isci', 'uretici', 'polis'];
const VALID_MACHINES = ['depoUpgrade', 'vitesUpgrade', 'silahUpgrade'];
const MACHINE_PRICE = 100000; // Bölüm 8.2
const DAILY_OUTPUT = {
  depoUpgrade: 10,
  vitesUpgrade: 10,
  silahUpgrade: 50,
};

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Bu işlem için giriş yapmalısınız.');
  }
  return request.auth.uid;
}

function istanbulDateKey(date = new Date()) {
  // Sunucu saati UTC olsa bile günlük döngü sınırını İstanbul saatine göre belirler.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// initializePlayer — ilk girişte users/{uid} dokümanını sunucu tarafında oluşturur.
// İstemci başlangıç altını/mesleği gibi kritik alanları asla kendisi yazamaz.
// ---------------------------------------------------------------------------
export const initializePlayer = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const privateRef = userRef.collection('private').doc('meta');

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists) return; // zaten var, dokunma

    tx.set(userRef, {
      displayName: request.auth.token.name || 'Oyuncu',
      xp: 0,
      gold: 0,
      suspicion: 0,
      reputation: 0,
      profession: null,
      debtToState: 0,
      bankBalance: 0,
      bankDebt: null,
      lastDailyResetAt: null,
      avatarConfig: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // isPolice, Bölüm 14 gereği ayrı ve gizli bir alt dokümanda tutulur.
    tx.set(privateRef, { isPolice: false });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// chooseProfession — Bölüm 7. Polis için silah sahipliği + şüphe=0 kontrolü.
// ---------------------------------------------------------------------------
export const chooseProfession = onCall(async (request) => {
  const uid = requireAuth(request);
  const { profession } = request.data || {};
  if (!VALID_PROFESSIONS.includes(profession)) {
    throw new HttpsError('invalid-argument', 'Geçersiz meslek.');
  }

  const userRef = db.collection('users').doc(uid);

  if (profession === 'polis') {
    const userSnap = await userRef.get();
    const user = userSnap.data();
    if (!user || user.suspicion !== 0) {
      throw new HttpsError(
        'failed-precondition',
        'Polis olmak için şüphe puanınız %0 olmalı.'
      );
    }
    const weaponsSnap = await db
      .collection('weapons')
      .where('ownerId', '==', uid)
      .limit(1)
      .get();
    if (weaponsSnap.empty) {
      throw new HttpsError(
        'failed-precondition',
        'Polis olmak için bir silaha sahip olmalısınız.'
      );
    }
  }

  await userRef.update({ profession });
  await userRef
    .collection('private')
    .doc('meta')
    .set({ isPolice: profession === 'polis' }, { merge: true });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// factoryWork — Bölüm 6, Bölüm 7. Günde 1 kez, 100 altın.
// ---------------------------------------------------------------------------
export const factoryWork = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap] = await Promise.all([
      tx.get(userRef),
      tx.get(dailyRef),
    ]);
    const user = userSnap.data();
    if (!user || user.profession !== 'isci') {
      throw new HttpsError(
        'failed-precondition',
        'Fabrikada çalışmak için "işçi" mesleğinde olmalısınız.'
      );
    }
    if (dailySnap.exists && dailySnap.data().factoryWork) {
      throw new HttpsError('failed-precondition', 'Bugün zaten çalıştınız.');
    }
    tx.set(userRef, { gold: admin.firestore.FieldValue.increment(100) }, { merge: true });
    tx.set(dailyRef, { factoryWork: true }, { merge: true });
  });

  return { ok: true, earned: 100 };
});

// ---------------------------------------------------------------------------
// buyProductionMachine — Bölüm 8.2. Her makine 100.000 altın, "üretici" gerekli.
// ---------------------------------------------------------------------------
export const buyProductionMachine = onCall(async (request) => {
  const uid = requireAuth(request);
  const { machineType } = request.data || {};
  if (!VALID_MACHINES.includes(machineType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz makine türü.');
  }

  const userRef = db.collection('users').doc(uid);
  const machineRef = userRef.collection('productionMachines').doc(machineType);

  await db.runTransaction(async (tx) => {
    const [userSnap, machineSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(machineRef),
    ]);
    const user = userSnap.data();
    if (!user || user.profession !== 'uretici') {
      throw new HttpsError(
        'failed-precondition',
        'Üretim makinesi almak için "üretici" mesleğinde olmalısınız.'
      );
    }
    if (machineSnap.exists) {
      throw new HttpsError('failed-precondition', 'Bu makineye zaten sahipsiniz.');
    }
    if ((user.gold || 0) < MACHINE_PRICE) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.set(
      userRef,
      { gold: admin.firestore.FieldValue.increment(-MACHINE_PRICE) },
      { merge: true }
    );
    tx.set(machineRef, {
      owned: true,
      lastCollectedAt: null,
      purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// collectProduction — Bölüm 6, Bölüm 8.2. Günlük üretimi toplama.
// O gün toplanmazsa üretim birikmez, kaybolur (master prompt kuralı).
// ---------------------------------------------------------------------------
export const collectProduction = onCall(async (request) => {
  const uid = requireAuth(request);
  const { machineType } = request.data || {};
  if (!VALID_MACHINES.includes(machineType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz makine türü.');
  }

  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const machineRef = userRef.collection('productionMachines').doc(machineType);
  const inventoryRef = userRef.collection('inventory').doc(machineType);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  await db.runTransaction(async (tx) => {
    const [machineSnap, dailySnap] = await Promise.all([
      tx.get(machineRef),
      tx.get(dailyRef),
    ]);
    if (!machineSnap.exists || !machineSnap.data().owned) {
      throw new HttpsError('failed-precondition', 'Bu makineye sahip değilsiniz.');
    }
    const alreadyCollected =
      dailySnap.exists && dailySnap.data().machinesCollected?.[machineType];
    if (alreadyCollected) {
      throw new HttpsError('failed-precondition', 'Bugünün üretimi zaten toplandı.');
    }

    const amount = DAILY_OUTPUT[machineType];
    tx.set(
      inventoryRef,
      { quantity: admin.firestore.FieldValue.increment(amount) },
      { merge: true }
    );
    tx.set(
      machineRef,
      { lastCollectedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.set(dailyRef, { machinesCollected: { [machineType]: true } }, { merge: true });
  });

  return { ok: true, collected: DAILY_OUTPUT[machineType] };
});

// ---------------------------------------------------------------------------
// dailyReset — Bölüm 6. Her gün 00:00 (Europe/Istanbul) çalışır.
// Faz 2 kapsamı: polis maaşı, banka faizi, yatırım fiyatları, gemi takvimi.
// (Piyango çekilişi Faz 8'de, yasaklı madde üretimi Faz 7'de eklenecek.)
// ---------------------------------------------------------------------------
export const dailyReset = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'Europe/Istanbul' },
  async () => {
    const dateKey = istanbulDateKey();

    // 1) Polis maaşı — 500 altın, sadece suspicion=0 olan polislere (Bölüm 7)
    const policeSnap = await db
      .collection('users')
      .where('profession', '==', 'polis')
      .get();
    const policeBatch = db.batch();
    policeSnap.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.suspicion === 0) {
        policeBatch.update(docSnap.ref, {
          gold: admin.firestore.FieldValue.increment(500),
        });
      }
    });
    if (!policeSnap.empty) await policeBatch.commit();

    // 2) Banka mevduat faizi — günlük %1 (Bölüm 13)
    const bankSnap = await db.collection('users').where('bankBalance', '>', 0).get();
    const bankBatch = db.batch();
    bankSnap.forEach((docSnap) => {
      const balance = docSnap.data().bankBalance || 0;
      const interest = Math.floor(balance * 0.01);
      if (interest > 0) {
        bankBatch.update(docSnap.ref, {
          bankBalance: admin.firestore.FieldValue.increment(interest),
        });
      }
    });
    if (!bankSnap.empty) await bankBatch.commit();

    // 3) Yatırım araçları — elmas %1-%10, kripto %1-%50 rastgele değişim (Bölüm 13)
    const prevInvestSnap = await db
      .collection('investments')
      .orderBy('__name__', 'desc')
      .limit(1)
      .get();
    const prev = prevInvestSnap.empty
      ? { diamondPrice: 1000, cryptoPrice: 100000 }
      : prevInvestSnap.docs[0].data();
    const diamondChangePct = (Math.random() * 0.09 + 0.01) * (Math.random() < 0.5 ? -1 : 1);
    const cryptoChangePct = (Math.random() * 0.49 + 0.01) * (Math.random() < 0.5 ? -1 : 1);
    const diamondPrice = clamp(
      Math.round(prev.diamondPrice * (1 + diamondChangePct)),
      100,
      10000
    );
    const cryptoPrice = clamp(
      Math.round(prev.cryptoPrice * (1 + cryptoChangePct)),
      10000,
      1000000
    );
    await db
      .collection('investments')
      .doc(dateKey)
      .set({ diamondPrice, cryptoPrice, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    // 4) Gemi takvimi bir gün ilerler — 4 günlük döngü (Bölüm 12)
    const prevShipSnap = await db
      .collection('shipSchedule')
      .orderBy('__name__', 'desc')
      .limit(1)
      .get();
    const prevDay = prevShipSnap.empty ? 4 : prevShipSnap.docs[0].data().dayInCycle;
    const nextDay = (prevDay % 4) + 1;
    const statusByDay = {
      1: 'docking', // gemi şehirde, mal indiriyor
      2: 'departing', // gemi şehirden ayrılıyor
      3: 'loading', // gemi gittiği şehirde mal yüklüyor
      4: 'in_transit', // gemi yolda
    };
    await db.collection('shipSchedule').doc(dateKey).set({
      dayInCycle: nextDay,
      status: statusByDay[nextDay],
      // Gerçek şehir listesi Faz 7'de eklenecek.
      destinationCity: null,
    });

    console.log(`dailyReset tamamlandı: ${dateKey}`);
  }
);
