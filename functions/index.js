import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import admin from 'firebase-admin';
import { VEHICLE_CATALOG, WEAPON_CATALOG } from './catalogData.js';

admin.initializeApp();
const db = admin.firestore();

// DİKKAT: Bu bölge, istemcideki VITE_FIREBASE_FUNCTIONS_REGION ile
// (src/firebase.js) birebir aynı olmalı, yoksa çağrılar 404 döner.
setGlobalOptions({ region: 'europe-west1' });

const VALID_PROFESSIONS = ['isci', 'uretici', 'polis'];
const VALID_MACHINES = ['depoUpgrade', 'vitesUpgrade', 'silahUpgrade', 'yasakliMadde'];
const MACHINE_PRICE = 100000; // Bölüm 8.2
const DAILY_OUTPUT = {
  depoUpgrade: 10,
  vitesUpgrade: 10,
  silahUpgrade: 50,
  yasakliMadde: 1, // kaçakçılık üretimi kasıtlı olarak çok kısıtlı
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

// addDaysToDateKey — "YYYY-MM-DD" formatındaki bir tarihe gün ekler/çıkarır.
// Bunu, Firestore'da "en son kaydı bul" için orderBy('__name__') sorgusu
// kullanmak YERİNE tercih ediyoruz: o sorgu composite index istiyor ve
// index yoksa Cloud Function'ı 500 hatasıyla çökertiyordu. Tarihi
// hesaplamak deterministik ve index gerektirmiyor.
function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
      .doc(addDaysToDateKey(dateKey, -1))
      .get();
    const prev = prevInvestSnap.exists
      ? prevInvestSnap.data()
      : { diamondPrice: 1000, cryptoPrice: 100000 };
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
      .doc(addDaysToDateKey(dateKey, -1))
      .get();
    const prevDay = prevShipSnap.exists ? prevShipSnap.data().dayInCycle : 4;
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

    // 6) Gemi şehre döndüyse (dayInCycle=1), bekleyen Liman siparişlerini
    // ilgili oyuncuların envanterine ekle ve sipariş kayıtlarını temizle.
    if (nextDay === 1) {
      const ordersSnap = await db.collection('limanOrders').get();
      const deliveries = [];
      for (const orderDoc of ordersSnap.docs) {
        const data = orderDoc.data();
        const targetUid = orderDoc.id;
        let hasAny = false;
        for (const materialType of ['depoUpgrade', 'vitesUpgrade', 'silahUpgrade']) {
          const qty = data[materialType] || 0;
          if (qty > 0) {
            hasAny = true;
            const invRef = db
              .collection('users')
              .doc(targetUid)
              .collection('inventory')
              .doc(materialType);
            deliveries.push(
              invRef.set({ quantity: admin.firestore.FieldValue.increment(qty) }, { merge: true })
            );
          }
        }
        if (hasAny) {
          deliveries.push(orderDoc.ref.delete());
        }
      }
      await Promise.all(deliveries);
    }

    console.log(`dailyReset tamamlandı: ${dateKey}`);
  }
);

// =============================================================================
// FAZ 3 — ARABA VE SİLAH SİSTEMİ (Bölüm 8.1, 8.2, 8.3)
// =============================================================================

const UPGRADE_MATERIAL_PRICE = 100; // Bölüm 8.3 — gelişim malzemesi alım fiyatı
const UPGRADE_MATERIAL_REFUND = 50; // Bölüm 8.3 — geri satış fiyatı
const MATERIAL_SELL_PRICE = { depoUpgrade: 250, vitesUpgrade: 250 }; // Bölüm 8.2 — Modifiye Garajı'na satış

// ---------------------------------------------------------------------------
// buyVehicle — Araba Galerisi'nden araç satın alma (Bölüm 2, 13).
// Basitleştirme: oyuncu aynı katalog modelinden yalnızca bir adet
// sahip olabilir (envanter/UI karmaşıklığını sınırlamak için).
// ---------------------------------------------------------------------------
export const buyVehicle = onCall(async (request) => {
  const uid = requireAuth(request);
  const { catalogId } = request.data || {};
  const catalogEntry = VEHICLE_CATALOG[catalogId];
  if (!catalogEntry) {
    throw new HttpsError('invalid-argument', 'Geçersiz araç.');
  }

  const userRef = db.collection('users').doc(uid);
  const vehiclesRef = db.collection('vehicles');

  await db.runTransaction(async (tx) => {
    const [userSnap, existingSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(
        vehiclesRef
          .where('ownerId', '==', uid)
          .where('catalogId', '==', Number(catalogId))
      ),
    ]);
    const user = userSnap.data();
    if (!existingSnap.empty) {
      throw new HttpsError('failed-precondition', 'Bu modele zaten sahipsiniz.');
    }
    if (!user || (user.gold || 0) < catalogEntry.price) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }

    tx.set(
      userRef,
      { gold: admin.firestore.FieldValue.increment(-catalogEntry.price) },
      { merge: true }
    );
    const newVehicleRef = vehiclesRef.doc();
    tx.set(newVehicleRef, {
      ownerId: uid,
      catalogId: Number(catalogId),
      model: catalogEntry.name,
      baseGalleryValue: catalogEntry.price,
      gearLevel: catalogEntry.gearLevel,
      baseTank: catalogEntry.baseTank,
      tankBonus: 0,
      gearUpgraded: false,
      tankUpgraded: false,
      storage: catalogEntry.storage,
      turboCount: catalogEntry.turboCount,
      mortgaged: false,
      purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// upgradeVehicle — Modifiye Garajı'nda araç geliştirme (Bölüm 8.1).
// 2 adet ilgili malzeme harcanır; her geliştirme türü araç başına 1 kez.
// ---------------------------------------------------------------------------
export const upgradeVehicle = onCall(async (request) => {
  const uid = requireAuth(request);
  const { vehicleId, upgradeType } = request.data || {};
  if (!['gear', 'tank'].includes(upgradeType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz geliştirme türü.');
  }

  const vehicleRef = db.collection('vehicles').doc(vehicleId);
  const materialType = upgradeType === 'gear' ? 'vitesUpgrade' : 'depoUpgrade';
  const inventoryRef = db.collection('users').doc(uid).collection('inventory').doc(materialType);

  await db.runTransaction(async (tx) => {
    const [vehicleSnap, inventorySnap] = await Promise.all([
      tx.get(vehicleRef),
      tx.get(inventoryRef),
    ]);
    const vehicle = vehicleSnap.data();
    if (!vehicleSnap.exists || vehicle.ownerId !== uid) {
      throw new HttpsError('failed-precondition', 'Bu araç size ait değil.');
    }
    const flagField = upgradeType === 'gear' ? 'gearUpgraded' : 'tankUpgraded';
    if (vehicle[flagField]) {
      throw new HttpsError('failed-precondition', 'Bu geliştirme zaten uygulanmış.');
    }
    const qty = inventorySnap.exists ? inventorySnap.data().quantity || 0 : 0;
    if (qty < 2) {
      throw new HttpsError('failed-precondition', 'Yetersiz geliştirme malzemesi (2 adet gerekli).');
    }

    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-2) }, { merge: true });
    if (upgradeType === 'gear') {
      tx.update(vehicleRef, {
        gearLevel: admin.firestore.FieldValue.increment(1),
        gearUpgraded: true,
      });
    } else {
      tx.update(vehicleRef, {
        tankBonus: admin.firestore.FieldValue.increment(50),
        tankUpgraded: true,
      });
    }
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// sellMaterial — üretilen depo/vites malzemesini Modifiye Garajı'na satma
// (Bölüm 8.2 — 250 altın/adet).
// ---------------------------------------------------------------------------
export const sellMaterial = onCall(async (request) => {
  const uid = requireAuth(request);
  const { materialType, quantity } = request.data || {};
  const unitPrice = MATERIAL_SELL_PRICE[materialType];
  const qty = Number(quantity);
  if (!unitPrice || !Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz malzeme veya miktar.');
  }

  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc(materialType);

  await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(inventoryRef);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < qty) {
      throw new HttpsError('failed-precondition', 'Yeterli malzemeniz yok.');
    }
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
    tx.set(
      userRef,
      { gold: admin.firestore.FieldValue.increment(qty * unitPrice) },
      { merge: true }
    );
  });

  return { ok: true, earned: qty * unitPrice };
});

// ---------------------------------------------------------------------------
// buyWeapon — Silah Mağazası'ndan silah satın alma (Bölüm 8.3, 13).
// Araçların aksine birden fazla adet aynı modelden alınabilir (yedek silah
// mantıklı bir oyun senaryosu).
// ---------------------------------------------------------------------------
export const buyWeapon = onCall(async (request) => {
  const uid = requireAuth(request);
  const { catalogId } = request.data || {};
  const catalogEntry = WEAPON_CATALOG[catalogId];
  if (!catalogEntry) {
    throw new HttpsError('invalid-argument', 'Geçersiz silah.');
  }

  const userRef = db.collection('users').doc(uid);
  const weaponsRef = db.collection('weapons');

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user || (user.gold || 0) < catalogEntry.price) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.set(
      userRef,
      { gold: admin.firestore.FieldValue.increment(-catalogEntry.price) },
      { merge: true }
    );
    const newWeaponRef = weaponsRef.doc();
    tx.set(newWeaponRef, {
      ownerId: uid,
      catalogId: Number(catalogId),
      name: catalogEntry.name,
      basePrice: catalogEntry.price,
      basePower: catalogEntry.power,
      power: catalogEntry.power,
      level: 1,
      purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// upgradeWeapon — silah geliştirme (Bölüm 8.3).
// Seviye 2: güç ×1.5. Seviye 3 (max): güç ×2 (başlangıcın 2 katı).
// Her seviye 1 gelişim malzemesi harcar.
// ---------------------------------------------------------------------------
export const upgradeWeapon = onCall(async (request) => {
  const uid = requireAuth(request);
  const { weaponId } = request.data || {};

  const weaponRef = db.collection('weapons').doc(weaponId);
  const inventoryRef = db.collection('users').doc(uid).collection('inventory').doc('silahUpgrade');

  await db.runTransaction(async (tx) => {
    const [weaponSnap, inventorySnap] = await Promise.all([
      tx.get(weaponRef),
      tx.get(inventoryRef),
    ]);
    const weapon = weaponSnap.data();
    if (!weaponSnap.exists || weapon.ownerId !== uid) {
      throw new HttpsError('failed-precondition', 'Bu silah size ait değil.');
    }
    if (weapon.level >= 3) {
      throw new HttpsError('failed-precondition', 'Bu silah zaten maksimum seviyede.');
    }
    const qty = inventorySnap.exists ? inventorySnap.data().quantity || 0 : 0;
    if (qty < 1) {
      throw new HttpsError('failed-precondition', 'Yetersiz gelişim malzemesi (1 adet gerekli).');
    }

    const newLevel = weapon.level + 1;
    const multiplier = newLevel === 2 ? 1.5 : 2;
    const newPower = Math.round(weapon.basePower * multiplier);

    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-1) }, { merge: true });
    tx.update(weaponRef, { level: newLevel, power: newPower });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// buySilahMaterial / sellSilahMaterial — Silah Mağazası'nda gelişim
// malzemesi alım-satımı (Bölüm 8.3 — 100 altına al, 50 altına sat).
// ---------------------------------------------------------------------------
export const buySilahMaterial = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('silahUpgrade');

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user || (user.gold || 0) < UPGRADE_MATERIAL_PRICE) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.set(
      userRef,
      { gold: admin.firestore.FieldValue.increment(-UPGRADE_MATERIAL_PRICE) },
      { merge: true }
    );
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(1) }, { merge: true });
  });

  return { ok: true };
});

export const sellSilahMaterial = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('silahUpgrade');

  await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(inventoryRef);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < 1) {
      throw new HttpsError('failed-precondition', 'Satacak gelişim malzemeniz yok.');
    }
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-1) }, { merge: true });
    tx.set(
      userRef,
      { gold: admin.firestore.FieldValue.increment(UPGRADE_MATERIAL_REFUND) },
      { merge: true }
    );
  });

  return { ok: true };
});

// =============================================================================
// FAZ 4 — BANKA VE YATIRIM SİSTEMİ (Bölüm 13)
// =============================================================================

const DEFAULT_PRICES = { diamondPrice: 1000, cryptoPrice: 100000 };

async function getCurrentPrices() {
  const dateKey = istanbulDateKey();
  const todaySnap = await db.collection('investments').doc(dateKey).get();
  if (todaySnap.exists) return todaySnap.data();
  // Bugün için dailyReset henüz çalışmadıysa dünün kaydına bak.
  const yesterdaySnap = await db
    .collection('investments')
    .doc(addDaysToDateKey(dateKey, -1))
    .get();
  return yesterdaySnap.exists ? yesterdaySnap.data() : DEFAULT_PRICES;
}

// ---------------------------------------------------------------------------
// depositToBank / withdrawFromBank — altın ↔ banka bakiyesi.
// Bakiye, dailyReset tarafından her gün %1 faiz kazanır.
// ---------------------------------------------------------------------------
export const depositToBank = onCall(async (request) => {
  const uid = requireAuth(request);
  const amt = Number(request.data?.amount);
  if (!Number.isInteger(amt) || amt <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const user = snap.data();
    if (!user || (user.gold || 0) < amt) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-amt),
      bankBalance: admin.firestore.FieldValue.increment(amt),
    });
  });
  return { ok: true };
});

export const withdrawFromBank = onCall(async (request) => {
  const uid = requireAuth(request);
  const amt = Number(request.data?.amount);
  if (!Number.isInteger(amt) || amt <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const user = snap.data();
    if (!user || (user.bankBalance || 0) < amt) {
      throw new HttpsError('failed-precondition', 'Yetersiz banka bakiyesi.');
    }
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(amt),
      bankBalance: admin.firestore.FieldValue.increment(-amt),
    });
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// buyInvestment / sellInvestment — elmas/kripto alım-satımı.
// ADET DEĞİL, ALTIN TUTARI bazlı: oyuncu "100 altınlık kripto al" der,
// sistem güncel fiyata bölüp kesirli miktar (ör. 0.001 adet) verir. Bu
// sayede kripto gibi pahalı araçlar da küçük bütçelerle alınabilir.
// Bu yüzden holdings alanları KESİRLİ (float) sayılardır.
// ---------------------------------------------------------------------------
export const buyInvestment = onCall(async (request) => {
  const uid = requireAuth(request);
  const { assetType } = request.data || {};
  const goldAmount = Number(request.data?.amount);
  if (!['diamond', 'crypto'].includes(assetType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz yatırım aracı.');
  }
  if (!Number.isInteger(goldAmount) || goldAmount <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz altın miktarı.');
  }

  const prices = await getCurrentPrices();
  const unitPrice = assetType === 'diamond' ? prices.diamondPrice : prices.cryptoPrice;
  const units = goldAmount / unitPrice;
  const holdingsField = assetType === 'diamond' ? 'diamondHoldings' : 'cryptoHoldings';

  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const user = snap.data();
    if (!user || (user.gold || 0) < goldAmount) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-goldAmount),
      [holdingsField]: admin.firestore.FieldValue.increment(units),
    });
  });

  return { ok: true, unitPrice, units };
});

// sellInvestment: ya belirli bir altın tutarı karşılığı satar ({amount}),
// ya da elindeki tüm varlığı satar ({all: true}) — kesirli miktarları elle
// girmek zor olduğu için "tümünü sat" kısayolu eklendi.
export const sellInvestment = onCall(async (request) => {
  const uid = requireAuth(request);
  const { assetType, all } = request.data || {};
  if (!['diamond', 'crypto'].includes(assetType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz yatırım aracı.');
  }

  const prices = await getCurrentPrices();
  const unitPrice = assetType === 'diamond' ? prices.diamondPrice : prices.cryptoPrice;
  const holdingsField = assetType === 'diamond' ? 'diamondHoldings' : 'cryptoHoldings';

  const userRef = db.collection('users').doc(uid);
  let totalValue = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const user = snap.data();
    const have = user?.[holdingsField] || 0;

    let units;
    if (all) {
      units = have;
    } else {
      const goldAmount = Number(request.data?.amount);
      if (!Number.isInteger(goldAmount) || goldAmount <= 0) {
        throw new HttpsError('invalid-argument', 'Geçersiz altın miktarı.');
      }
      units = goldAmount / unitPrice;
      if (units > have + 1e-9) {
        throw new HttpsError('failed-precondition', 'Yeterli varlığınız yok.');
      }
    }
    totalValue = Math.floor(units * unitPrice);

    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(totalValue),
      [holdingsField]: admin.firestore.FieldValue.increment(-units),
    });
  });

  return { ok: true, unitPrice, totalValue };
});

// =============================================================================
// FAZ 5 — ŞÜPHE YÖNETİMİ VE SOYGUN SİSTEMİ (Bölüm 13, 14)
// =============================================================================

function clampSuspicion(v) {
  return clamp(Math.round(v), 0, 100);
}

// ---------------------------------------------------------------------------
// prayAtMosque — Camii: günde 1 kez, ücretsiz, şüphe -5.
// ---------------------------------------------------------------------------
export const prayAtMosque = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef)]);
    const user = userSnap.data();
    if (dailySnap.exists && dailySnap.data().prayed) {
      throw new HttpsError('failed-precondition', 'Bugün zaten dua ettin.');
    }
    tx.update(userRef, { suspicion: clampSuspicion((user?.suspicion || 0) - 5) });
    tx.set(dailyRef, { prayed: true }, { merge: true });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// bribePolice — Karakol: günde 1 kez, 3000 altın, şüphe -10.
// ---------------------------------------------------------------------------
const BRIBE_COST = 3000;

export const bribePolice = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef)]);
    const user = userSnap.data();
    if (dailySnap.exists && dailySnap.data().bribed) {
      throw new HttpsError('failed-precondition', 'Bugün zaten rüşvet verdin.');
    }
    if (!user || (user.gold || 0) < BRIBE_COST) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-BRIBE_COST),
      suspicion: clampSuspicion((user.suspicion || 0) - 10),
    });
    tx.set(dailyRef, { bribed: true }, { merge: true });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// buyFromVendor — Seyyar Satıcı: her satıcının KENDİ günlük hakkı var
// (Kokoreçci, Simitçi, Dönerci, Köfteci birbirinden bağımsız), 1000 altın,
// şüphe -5, saygınlık +5.
// ---------------------------------------------------------------------------
const VENDOR_COST = 1000;

export const buyFromVendor = onCall(async (request) => {
  const uid = requireAuth(request);
  const { vendorId } = request.data || {};
  if (!vendorId) {
    throw new HttpsError('invalid-argument', 'Geçersiz satıcı.');
  }
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef)]);
    const user = userSnap.data();
    if (dailySnap.exists && dailySnap.data().vendorPurchases?.[vendorId]) {
      throw new HttpsError('failed-precondition', 'Bu satıcıdan bugün zaten alışveriş yaptın.');
    }
    if (!user || (user.gold || 0) < VENDOR_COST) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-VENDOR_COST),
      suspicion: clampSuspicion((user.suspicion || 0) - 5),
      reputation: clamp(Math.round((user.reputation || 0) + 5), 0, 100),
    });
    tx.set(dailyRef, { vendorPurchases: { [vendorId]: true } }, { merge: true });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// attemptHeist — Bölüm 13 soygun sistemi.
// Basitleştirme: bu sürümde tek oyunculu, anlık sonuçlanan bir soygun var.
// Polis oyuncularının soygunlara canlı müdahalesi (Bölüm 14'teki
// policeInfiltrators mantığı) çok oyunculu koordinasyon gerektirdiği için
// ayrı bir fazda ele alınacak — şimdilik başarı şansı sahip olunan en
// güçlü silaha ve mevcut şüpheye göre hesaplanıyor.
// ---------------------------------------------------------------------------
const HEIST_CONFIG = {
  banka: { suspicionCost: 50, rewardMin: 50000, rewardMax: 100000, baseChance: 0.35 },
  'araba-galerisi': { suspicionCost: 25, rewardMin: 10000, rewardMax: 30000, baseChance: 0.5 },
  'silah-magazasi': { suspicionCost: 25, rewardMin: 8000, rewardMax: 20000, baseChance: 0.5 },
};

export const attemptHeist = onCall(async (request) => {
  const uid = requireAuth(request);
  const { target } = request.data || {};
  const config = HEIST_CONFIG[target];
  if (!config) {
    throw new HttpsError('invalid-argument', 'Geçersiz soygun hedefi.');
  }

  const dateKey = istanbulDateKey();
  const dailyRefId = `${uid}_${dateKey}`;
  const dailyRef = db.collection('dailyActions').doc(dailyRefId);
  const userRef = db.collection('users').doc(uid);

  const [dailySnap, weaponsSnap] = await Promise.all([
    dailyRef.get(),
    db.collection('weapons').where('ownerId', '==', uid).get(),
  ]);
  if (dailySnap.exists && dailySnap.data().heist?.[target]) {
    throw new HttpsError('failed-precondition', 'Bu hedefi bugün zaten denedin.');
  }

  let maxPower = 0;
  weaponsSnap.forEach((d) => {
    maxPower = Math.max(maxPower, d.data().power || 0);
  });

  let result = null;
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user) {
      throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    }
    const suspicion = user.suspicion || 0;
    const chance = clamp(
      config.baseChance + Math.min(maxPower / 50000, 1) * 0.2 - suspicion * 0.003,
      0.1,
      0.9
    );
    const success = Math.random() < chance;
    const reward = success
      ? Math.round(config.rewardMin + Math.random() * (config.rewardMax - config.rewardMin))
      : 0;

    tx.update(userRef, {
      suspicion: clampSuspicion(suspicion + config.suspicionCost),
      ...(success ? { gold: admin.firestore.FieldValue.increment(reward) } : {}),
    });
    tx.set(dailyRef, { heist: { [target]: true } }, { merge: true });

    result = { success, reward, chance: Math.round(chance * 100) };
  });

  return { ok: true, ...result };
});

// =============================================================================
// FAZ 6 — DEPO, PARK VE LİMAN (KAÇAKÇILIK) SİSTEMİ
// =============================================================================

const CONTRABAND_DEPO_BUY_PRICE = 4000; // Depo'dan alış
const CONTRABAND_DEPO_SELL_PRICE = 2500; // Depo'ya satış — şüphe ARTMAZ
const CONTRABAND_PARK_SELL_PRICE = 5000; // Park'ta satış — şüphe +5 (kaynağı fark etmez)
const PARK_SUSPICION_COST = 5;

// ---------------------------------------------------------------------------
// buyContrabandFromDepo / sellContrabandToDepo — güvenli, şüphesiz kanal.
// ---------------------------------------------------------------------------
export const buyContrabandFromDepo = onCall(async (request) => {
  const uid = requireAuth(request);
  const qty = Number(request.data?.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  const totalCost = qty * CONTRABAND_DEPO_BUY_PRICE;
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('yasakliMadde');

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user || (user.gold || 0) < totalCost) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-totalCost) });
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(qty) }, { merge: true });
  });

  return { ok: true };
});

export const sellContrabandToDepo = onCall(async (request) => {
  const uid = requireAuth(request);
  const qty = Number(request.data?.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('yasakliMadde');

  await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(inventoryRef);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < qty) {
      throw new HttpsError('failed-precondition', 'Yeterli malınız yok.');
    }
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(qty * CONTRABAND_DEPO_SELL_PRICE),
    });
  });

  return { ok: true, earned: qty * CONTRABAND_DEPO_SELL_PRICE };
});

// ---------------------------------------------------------------------------
// sellContrabandAtPark — riskli kanal, +5 şüphe (kaynağı fark etmez: ister
// kendin üret, ister Depo'dan al, Park'ta satmak her zaman şüphe artırır).
// ---------------------------------------------------------------------------
export const sellContrabandAtPark = onCall(async (request) => {
  const uid = requireAuth(request);
  const qty = Number(request.data?.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('yasakliMadde');

  await db.runTransaction(async (tx) => {
    const [invSnap, userSnap] = await Promise.all([tx.get(inventoryRef), tx.get(userRef)]);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < qty) {
      throw new HttpsError('failed-precondition', 'Yeterli malınız yok.');
    }
    const user = userSnap.data();
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(qty * CONTRABAND_PARK_SELL_PRICE),
      suspicion: clampSuspicion((user.suspicion || 0) + PARK_SUSPICION_COST),
    });
  });

  return { ok: true, earned: qty * CONTRABAND_PARK_SELL_PRICE };
});

// ---------------------------------------------------------------------------
// placeLimanOrder — Liman'dan toplu/ucuz malzeme siparişi.
// Limitler GÜNLÜK değil, geminin turu boyunca geçerli: limanOrders/{uid}
// dokümanı sadece gemi şehre döndüğünde (dayInCycle=1) sıfırlanır/teslim
// edilir (bkz. dailyReset). Basitleştirme: siparişin tam olarak hangi
// yükleme penceresinde (2. veya 3. gün) verildiği ayırt edilmiyor — her
// sipariş, geminin şehre bir sonraki dönüşünde teslim edilir.
// ---------------------------------------------------------------------------
const LIMAN_PRICES = { depoUpgrade: 400, vitesUpgrade: 400, silahUpgrade: 80 };
const LIMAN_MAX_PER_CYCLE = { depoUpgrade: 10, vitesUpgrade: 10, silahUpgrade: 50 };

export const placeLimanOrder = onCall(async (request) => {
  const uid = requireAuth(request);
  const { materialType } = request.data || {};
  const qty = Number(request.data?.quantity);
  if (!LIMAN_PRICES[materialType]) {
    throw new HttpsError('invalid-argument', 'Geçersiz malzeme.');
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }

  const unitPrice = LIMAN_PRICES[materialType];
  const maxPerCycle = LIMAN_MAX_PER_CYCLE[materialType];
  const totalCost = unitPrice * qty;

  const userRef = db.collection('users').doc(uid);
  const orderRef = db.collection('limanOrders').doc(uid);

  await db.runTransaction(async (tx) => {
    const [userSnap, orderSnap] = await Promise.all([tx.get(userRef), tx.get(orderRef)]);
    const user = userSnap.data();
    const existing = orderSnap.exists ? orderSnap.data()[materialType] || 0 : 0;

    if (existing + qty > maxPerCycle) {
      throw new HttpsError(
        'failed-precondition',
        `Bu tur için en fazla ${maxPerCycle} adet sipariş verebilirsin (şu ana kadar sipariş verdiğin: ${existing}).`
      );
    }
    if (!user || (user.gold || 0) < totalCost) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }

    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-totalCost) });
    tx.set(orderRef, { [materialType]: admin.firestore.FieldValue.increment(qty) }, { merge: true });
  });

  return { ok: true };
});
