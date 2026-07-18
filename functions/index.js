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

// ---------------------------------------------------------------------------
// FABRİKA SİSTEMİ (oyuncu kurduğu/işlettiği fabrikalar) — Bölüm 6/8.2'nin
// yerini alır. Her oyuncu en fazla 1 fabrika kurabilir (satılamaz), içine
// istediği kadar makine koyabilir. Makineler (mining hariç) işçi gerektirir;
// işçi "Üretim Yap"a bastıkça hem maaşını alır hem patronun envanterine
// rastgele (min-max arası) ürün eklenir.
// ---------------------------------------------------------------------------
const FACTORY_CREATE_COST = 100000;
const FACTORY_MIN_SALARY = 1000;
const FACTORY_MAX_SALARY = 5000;
// Mining hariç tüm makine türleri sabit fiyatlı; mining'in fiyatı canlı
// kripto fiyatına bağlı (2 kripto değerinde) — bkz. miningMachinePrice().
const MACHINE_TYPES = {
  mining: { label: 'Mining Makinesi', needsWorker: false, min: 0.01, max: 0.1, unit: 'crypto' },
  tamirMalzemesi: { label: 'Tamir Malzemesi Makinesi', needsWorker: true, price: 100000, min: 1, max: 4000 },
  silahUpgrade: { label: 'Silah Geliştirme Malzemesi Makinesi', needsWorker: true, price: 50000, min: 1, max: 200 },
  // Depo ve Vites Geliştirme makineleri birleştirildi — ikisi de aynı
  // malzemeyi (arabaGelistirme) üretiyordu, artık TEK makine.
  arabaGelistirme: { label: 'Araba Geliştirme Malzemesi Makinesi', needsWorker: true, price: 50000, min: 1, max: 40 },
  yasakliMadde: { label: 'Yasaklı Madde Üretim Makinesi', needsWorker: true, price: 100000, min: 1, max: 10 },
};
const VALID_MACHINES = Object.keys(MACHINE_TYPES);

// ---------------------------------------------------------------------------
// ARAÇ/SİLAH ÖMRÜ + TAMİR SİSTEMİ — her araç/silah satın alındığı andan
// itibaren 30 günlük bir ömre sahiptir (her gün 1 azalır, bkz. dailyReset).
// Ömür bittiğinde VE 10 tamir hakkının tamamı kullanıldığında ürün
// hurdaya çıkarılır (silinir + SMS). Her tamir ömrü +3 gün (%10) uzatır
// (orijinal 30 günü aşmaz) ve tamir hakkını 1 azaltır. 2. el satış fiyat
// aralığı (min/max), ömür oranıyla (kalanÖmür/30) doğru orantılı düşer.
// ---------------------------------------------------------------------------
const VEHICLE_WEAPON_INITIAL_LIFE_DAYS = 30;
const VEHICLE_WEAPON_MAX_REPAIRS = 10;
const REPAIR_LIFE_BONUS_DAYS = 3;

function lifeRatioOf(item) {
  const life = item?.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
  return Math.max(0, Math.min(1, life / VEHICLE_WEAPON_INITIAL_LIFE_DAYS));
}

// Tamir için gereken malzeme: fiyat/100 (100₺'lik silah için 1 adet,
// 1.000₺'lik için 10 adet — silah geliştirme malzemesiyle aynı oran).
function repairRequiredQty(price) {
  return Math.max(1, Math.round((price || 0) / 100));
}

async function miningMachinePrice() {
  const prices = await getCurrentPrices();
  return Math.ceil(2 * (prices.cryptoPrice || 0));
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

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

// istanbulPrayerWindow — günü 5 "vakite" böler (kullanıcı revizesi):
// 1: 00-12, 2: 12-15, 3: 15-18, 4: 18-21, 5: 21-24. Camii'de günde 5 kez
// ibadet edilebilir, her vakitte bir kez.
function istanbulPrayerWindow(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      hour12: false,
    }).format(date)
  );
  if (hour < 12) return 1;
  if (hour < 15) return 2;
  if (hour < 18) return 3;
  if (hour < 21) return 4;
  return 5;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const MATERIAL_SMS_LABELS = {
  tamirMalzemesi: 'tamir malzemesi',
  silahUpgrade: 'silah geliştirme malzemesi',
  arabaGelistirme: 'araba geliştirme malzemesi',
  yasakliMadde: 'yasaklı madde',
};

// ---------------------------------------------------------------------------
// splitIncomeForDebt — Bölüm 10 (Borç Sistemi):
// "Borç bitene kadar: her kaynaktan kazanılan paranın %50'si otomatik
// borca gider, kalan %50 kendisine kalır."
// Her yerde (işçilik, satış, soygun, yarış, faiz, vb.) kazanılan altın bu
// fonksiyondan geçirilip {goldDelta, debtDelta} olarak uygulanmalı.
// ---------------------------------------------------------------------------
function splitIncomeForDebt(currentDebt, amount) {
  const debt = currentDebt || 0;
  if (debt <= 0 || amount <= 0) {
    return { goldDelta: amount, debtDelta: 0 };
  }
  const repay = Math.min(Math.floor(amount / 2), debt);
  return { goldDelta: amount - repay, debtDelta: -repay };
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
// ---------------------------------------------------------------------------
// initializePlayer — yeni oyuncu kaydı. Her zaman 2000 altınla başlar.
// Referans kodu artık BURADA değil, girişten SONRA (sadece yeni hesaplar
// için gösterilen ayrı bir adımda) applyReferralCode ile uygulanıyor —
// bu sayede giriş ekranı sadece giriş yapmaya odaklanıyor, referans
// teşviki yalnızca gerçekten yeni oyunculara gösteriliyor.
// ---------------------------------------------------------------------------
export const initializePlayer = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const privateRef = userRef.collection('private').doc('meta');
  let isNewPlayer = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists) return; // zaten var, dokunma

    isNewPlayer = true;
    tx.set(userRef, {
      displayName: request.auth.token.name || 'Oyuncu',
      xp: 0,
      gold: 2000,
      suspicion: 0,
      reputation: 0,
      profession: null,
      debtToState: 0,
      bankBalance: 0,
      bankDebt: null,
      lastDailyResetAt: null,
      avatarConfig: null,
      referredBy: null,
      referralUsed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // isPolice, Bölüm 14 gereği ayrı ve gizli bir alt dokümanda tutulur.
    tx.set(privateRef, { isPolice: false });
  });

  return { ok: true, isNewPlayer };
});

// ---------------------------------------------------------------------------
// applyReferralCode — YENİ hesaplar girişten hemen sonra (ilk 15 dakika
// içinde, sadece bir kez) bir referans kodu (başka bir oyuncunun oyun içi
// ismi) girebilir:
//   - Kendisi +1000 altın bonus kazanır (2000 + 1000 = 3000 toplam).
//   - Referans sahibi +2000 altın bonus kazanır + SMS ile haberdar edilir.
// ---------------------------------------------------------------------------
export const applyReferralCode = onCall(async (request) => {
  const uid = requireAuth(request);
  const rawReferral = String(request.data?.referralCode || '').trim();
  if (!rawReferral) {
    throw new HttpsError('invalid-argument', 'Referans kodu boş olamaz.');
  }
  const referralKey = rawReferral.toLocaleLowerCase('tr-TR');
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user) throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    if (user.referralUsed) {
      throw new HttpsError('failed-precondition', 'Referans kodu zaten kullanıldı.');
    }
    const createdAtMs = user.createdAt?.toMillis?.() ?? 0;
    if (Date.now() - createdAtMs > 15 * 60 * 1000) {
      throw new HttpsError(
        'failed-precondition',
        'Referans kodu sadece hesabını oluşturduktan kısa süre sonra girilebilir.'
      );
    }

    const nameSnap = await tx.get(db.collection('usernames').doc(referralKey));
    if (!nameSnap.exists || nameSnap.data().uid === uid) {
      throw new HttpsError('failed-precondition', 'Geçersiz referans kodu.');
    }
    const referrerUid = nameSnap.data().uid;
    const referrerRef = db.collection('users').doc(referrerUid);
    const referrerSnap = await tx.get(referrerRef);
    if (!referrerSnap.exists) {
      throw new HttpsError('failed-precondition', 'Geçersiz referans kodu.');
    }

    const REFERRAL_NEW_PLAYER_BONUS = 1000;
    const REFERRAL_REFERRER_BONUS = 2000;

    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(REFERRAL_NEW_PLAYER_BONUS),
      referredBy: referrerUid,
      referralUsed: true,
    });

    const { goldDelta, debtDelta } = splitIncomeForDebt(
      referrerSnap.data()?.debtToState,
      REFERRAL_REFERRER_BONUS
    );
    tx.update(referrerRef, {
      gold: admin.firestore.FieldValue.increment(goldDelta),
      debtToState: admin.firestore.FieldValue.increment(debtDelta),
    });
    const smsRef = referrerRef.collection('messages').doc();
    tx.set(smsRef, {
      text: `${user.displayName || 'Yeni bir oyuncu'} senin referans kodunla katıldı! 2000 altın bonus kazandın.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'referral_bonus',
    });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// chooseProfession — Bölüm 7. Polis için silah sahipliği + şüphe=0 kontrolü.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// applyForPolice / resignFromPolice / cancelPendingPoliceChange
// Meslek seçimi kaldırıldı — işçilik ve üreticilik artık herkese açık
// (Bölüm 7 sadeleştirmesi). SADECE polislik özel: anlık meslek değişimiyle
// oyuncular soygun anında polis olup parayı cebe atamasın diye, başvuru/
// istifa hemen değil, bir SONRAKİ 00:00 sıfırlamasında işleniyor.
// ---------------------------------------------------------------------------
export const applyForPolice = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.data();

  if (!user) {
    throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
  }
  if (user.profession === 'polis') {
    throw new HttpsError('failed-precondition', 'Zaten polissin.');
  }
  if (user.profession === 'imam') {
    throw new HttpsError('failed-precondition', 'İmamken polis olamazsın.');
  }
  if (user.pendingPoliceChange) {
    throw new HttpsError('failed-precondition', 'Bekleyen bir başvurun zaten var.');
  }
  if ((user.suspicion || 0) !== 0) {
    throw new HttpsError('failed-precondition', 'Polis olmak için şüphe puanın %0 olmalı.');
  }
  const weaponsSnap = await db.collection('weapons').where('ownerId', '==', uid).limit(1).get();
  if (weaponsSnap.empty) {
    throw new HttpsError('failed-precondition', 'Polis olmak için bir silaha sahip olmalısın.');
  }

  await userRef.update({ pendingPoliceChange: 'apply' });
  return { ok: true };
});

// İstifa artık ANLIK DEĞİL — yeni polis maaş havuzu sistemi (Bölüm 7
// revizyonu) günlük havuz/işçi sayısı hesaplarının tutarlı kalması için
// istifa talebini bir sonraki 00:00'a erteliyor. O ana kadar oyuncu polis
// olarak kalır (görevlerini/haklarını korur), istifa talebini iptal
// edebilir (bkz. cancelPendingPoliceChange).
export const resignFromPolice = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.data();

  if (!user || user.profession !== 'polis') {
    throw new HttpsError('failed-precondition', 'Polis değilsin.');
  }
  if (user.pendingPoliceChange === 'resign') {
    throw new HttpsError('failed-precondition', 'İstifa talebin zaten bekliyor.');
  }

  await userRef.update({ pendingPoliceChange: 'resign' });
  return { ok: true };
});

export const cancelPendingPoliceChange = onCall(async (request) => {
  const uid = requireAuth(request);
  await db.collection('users').doc(uid).update({ pendingPoliceChange: null });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// createFactory — 100.000 altın, oyuncu başına en fazla 1 fabrika, satılamaz.
// ---------------------------------------------------------------------------
export const createFactory = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const factoryRef = db.collection('factories').doc(uid);

  await db.runTransaction(async (tx) => {
    const [userSnap, factorySnap] = await Promise.all([tx.get(userRef), tx.get(factoryRef)]);
    const user = userSnap.data();
    if (factorySnap.exists) {
      throw new HttpsError('failed-precondition', 'Zaten bir fabrikan var.');
    }
    if (user?.employment) {
      throw new HttpsError('failed-precondition', 'Fabrika kurmak için önce işinden ayrılmalısın.');
    }
    if (!user || (user.gold || 0) < FACTORY_CREATE_COST) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-FACTORY_CREATE_COST) });
    tx.set(factoryRef, {
      ownerId: uid,
      ownerName: user.displayName || 'Oyuncu',
      salary: FACTORY_MIN_SALARY,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

// buyFactoryMachine — sadece fabrika sahibi, istediği kadar makine alabilir.
export const buyFactoryMachine = onCall(async (request) => {
  const uid = requireAuth(request);
  const { machineType } = request.data || {};
  if (!VALID_MACHINES.includes(machineType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz makine türü.');
  }
  const price =
    machineType === 'mining' ? await miningMachinePrice() : MACHINE_TYPES[machineType].price;

  const userRef = db.collection('users').doc(uid);
  const factoryRef = db.collection('factories').doc(uid);
  const machineRef = factoryRef.collection('machines').doc();

  await db.runTransaction(async (tx) => {
    const [userSnap, factorySnap] = await Promise.all([tx.get(userRef), tx.get(factoryRef)]);
    if (!factorySnap.exists) {
      throw new HttpsError('failed-precondition', 'Önce bir fabrika kurmalısın.');
    }
    const user = userSnap.data();
    if (!user || (user.gold || 0) < price) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-price) });
    tx.set(machineRef, {
      type: machineType,
      workerId: null,
      workerName: null,
      lastProducedDateKey: null,
      lastProducedQty: 0,
      purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, machineId: machineRef.id, price };
});

// setFactorySalary — sadece fabrika sahibi, 1000-5000 altın arası.
export const setFactorySalary = onCall(async (request) => {
  const uid = requireAuth(request);
  const salary = Number(request.data?.salary);
  if (!Number.isInteger(salary) || salary < FACTORY_MIN_SALARY || salary > FACTORY_MAX_SALARY) {
    throw new HttpsError(
      'invalid-argument',
      `Maaş ${FACTORY_MIN_SALARY.toLocaleString('tr-TR')} - ${FACTORY_MAX_SALARY.toLocaleString('tr-TR')} altın arasında olmalı.`
    );
  }
  const factoryRef = db.collection('factories').doc(uid);
  const factorySnap = await factoryRef.get();
  if (!factorySnap.exists) {
    throw new HttpsError('failed-precondition', 'Bir fabrikan yok.');
  }
  await factoryRef.update({ salary });
  return { ok: true };
});

// joinFactoryMachine — bir işçi, boş bir makineye (mining hariç) kendini
// atar. Fabrika sahibi de kendi fabrikasında SADECE 1 makinede çalışabilir
// (polis/imam değilse). Zaten başka bir yerde çalışıyorsa önce istifa etmeli.
export const joinFactoryMachine = onCall(async (request) => {
  const uid = requireAuth(request);
  const { factoryId, machineId } = request.data || {};
  const userRef = db.collection('users').doc(uid);
  const machineRef = db.collection('factories').doc(factoryId).collection('machines').doc(machineId);

  await db.runTransaction(async (tx) => {
    const [userSnap, machineSnap] = await Promise.all([tx.get(userRef), tx.get(machineRef)]);
    const user = userSnap.data();
    if (!user) throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    if (user.profession === 'polis' || user.pendingPoliceChange === 'apply') {
      throw new HttpsError('failed-precondition', 'Polis mesleğindeyken fabrikada çalışamazsın.');
    }
    if (user.profession === 'imam') {
      throw new HttpsError('failed-precondition', 'İmam fabrikada çalışamaz.');
    }
    if (user.employment) {
      throw new HttpsError('failed-precondition', 'Zaten bir fabrikada çalışıyorsun — önce istifa et.');
    }
    if (!machineSnap.exists) {
      throw new HttpsError('failed-precondition', 'Makine bulunamadı.');
    }
    const machine = machineSnap.data();
    if (machine.type === 'mining') {
      throw new HttpsError('failed-precondition', 'Mining makinesi işçi gerektirmez.');
    }
    if (machine.workerId) {
      throw new HttpsError('failed-precondition', 'Bu makinede zaten biri çalışıyor.');
    }
    tx.update(machineRef, { workerId: uid, workerName: user.displayName || 'Oyuncu' });
    tx.update(userRef, { employment: { factoryId, machineId } });
  });

  return { ok: true };
});

// autoJoinFactory — fabrikaları gezerken hangi makinenin dolu/boş olduğu
// artık gösterilmiyor; oyuncu sadece "İşe Gir"e basar, sunucu o fabrikadaki
// boş (mining hariç) makinelerden rastgele birine otomatik atar.
export const autoJoinFactory = onCall(async (request) => {
  const uid = requireAuth(request);
  const { factoryId } = request.data || {};
  if (!factoryId) {
    throw new HttpsError('invalid-argument', 'Fabrika belirtilmedi.');
  }
  const userRef = db.collection('users').doc(uid);
  const factoryRef = db.collection('factories').doc(factoryId);
  const machinesRef = factoryRef.collection('machines');

  let assignedMachineId = null;
  await db.runTransaction(async (tx) => {
    const [userSnap, factorySnap, machinesSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(factoryRef),
      tx.get(machinesRef),
    ]);
    const user = userSnap.data();
    if (!user) throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    if (user.profession === 'polis' || user.pendingPoliceChange === 'apply') {
      throw new HttpsError('failed-precondition', 'Polis mesleğindeyken fabrikada çalışamazsın.');
    }
    if (user.profession === 'imam') {
      throw new HttpsError('failed-precondition', 'İmam fabrikada çalışamaz.');
    }
    if (user.employment) {
      throw new HttpsError('failed-precondition', 'Zaten bir fabrikada çalışıyorsun — önce istifa et.');
    }
    if (!factorySnap.exists) {
      throw new HttpsError('failed-precondition', 'Fabrika bulunamadı.');
    }
    const openMachines = machinesSnap.docs.filter(
      (d) => d.data().type !== 'mining' && !d.data().workerId
    );
    if (openMachines.length === 0) {
      throw new HttpsError('failed-precondition', 'Bu fabrikada boş yer kalmadı.');
    }
    const chosen = openMachines[Math.floor(Math.random() * openMachines.length)];
    assignedMachineId = chosen.id;
    tx.update(chosen.ref, { workerId: uid, workerName: user.displayName || 'Oyuncu' });
    tx.update(userRef, { employment: { factoryId, machineId: chosen.id } });
  });

  return { ok: true, machineId: assignedMachineId };
});

// reassignEmployee — sadece fabrika sahibi; bugün henüz üretim yapmamış bir
// işçiyi, aynı fabrikadaki başka boş bir makineye taşır.
export const reassignEmployee = onCall(async (request) => {
  const uid = requireAuth(request);
  const { machineId, targetMachineId } = request.data || {};
  if (!machineId || !targetMachineId) {
    throw new HttpsError('invalid-argument', 'Makine belirtilmedi.');
  }
  if (machineId === targetMachineId) {
    throw new HttpsError('invalid-argument', 'Aynı makineye taşınamaz.');
  }
  const dateKey = istanbulDateKey();
  const factoryRef = db.collection('factories').doc(uid);
  const fromRef = factoryRef.collection('machines').doc(machineId);
  const toRef = factoryRef.collection('machines').doc(targetMachineId);

  await db.runTransaction(async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    if (!fromSnap.exists || !toSnap.exists) {
      throw new HttpsError('failed-precondition', 'Makine bulunamadı.');
    }
    const from = fromSnap.data();
    const to = toSnap.data();
    if (!from.workerId) {
      throw new HttpsError('failed-precondition', 'Bu makinede kimse çalışmıyor.');
    }
    if (from.lastProducedDateKey === dateKey) {
      throw new HttpsError('failed-precondition', 'Bu işçi bugün üretim yaptı, bugün taşınamaz.');
    }
    if (to.type === 'mining') {
      throw new HttpsError('failed-precondition', 'Mining makinesine işçi taşınamaz.');
    }
    if (to.workerId) {
      throw new HttpsError('failed-precondition', 'Hedef makine dolu.');
    }
    const workerId = from.workerId;
    const workerName = from.workerName;
    tx.update(fromRef, { workerId: null, workerName: null });
    tx.update(toRef, { workerId, workerName });
    tx.update(db.collection('users').doc(workerId), {
      employment: { factoryId: uid, machineId: targetMachineId },
    });
  });

  return { ok: true };
});

// sendSalaryPenaltySms — patronun altını yetmediği için maaş farkının
// devlete borç yazıldığı her seferinde patrona SMS gönderir.
async function sendSalaryPenaltySms(uid, penaltyAmount, newTotalDebt) {
  await db
    .collection('users')
    .doc(uid)
    .collection('messages')
    .add({
      text: `Fabrikandaki bir işçinin maaşını ödemeye altının yetmedi. Eksik ${penaltyAmount.toLocaleString('tr-TR')} altın devlete borç yazıldı. Toplam borcun: ${newTotalDebt.toLocaleString('tr-TR')} altın.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'salary_penalty',
    });
}

// produceAtFactory — işçi "Üretim Yap"a basınca: maaşını alır (patronun
// altını yetmezse fark patrona CEZA/borç olarak yazılır ve patrona SMS
// gider, işçi yine de tam maaşını alır), patronun envanterine rastgele
// (min-max) miktarda ürün eklenir. Makine başına günde 1 kez.
// İSTİSNA: patron kendi fabrikasında kendisi çalışıyorsa (isSelfEmployed),
// kendine maaş ödemez/almaz — sadece üretim gerçekleşir.
export const produceAtFactory = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const dateKey = istanbulDateKey();

  let outcome = null;
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user?.employment) {
      throw new HttpsError('failed-precondition', 'Bir fabrikada çalışmıyorsun.');
    }
    const { factoryId, machineId } = user.employment;
    const isSelfEmployed = factoryId === uid;
    const factoryRef = db.collection('factories').doc(factoryId);
    const machineRef = factoryRef.collection('machines').doc(machineId);
    const ownerRef = db.collection('users').doc(factoryId);
    const [machineSnap, ownerSnap] = await Promise.all([
      tx.get(machineRef),
      isSelfEmployed ? Promise.resolve(userSnap) : tx.get(ownerRef),
    ]);
    if (!machineSnap.exists) {
      throw new HttpsError('failed-precondition', 'Makine bulunamadı.');
    }
    const machine = machineSnap.data();
    if (machine.workerId !== uid) {
      throw new HttpsError('failed-precondition', 'Bu makinede çalışan sen değilsin.');
    }
    if (machine.lastProducedDateKey === dateKey) {
      throw new HttpsError('failed-precondition', 'Bugün bu makinede zaten üretim yaptın.');
    }
    const factorySnap = await tx.get(factoryRef);
    const salary = factorySnap.data()?.salary || FACTORY_MIN_SALARY;

    const cfg = MACHINE_TYPES[machine.type];
    const qty =
      machine.type === 'yasakliMadde' || machine.type === 'silahUpgrade'
        ? Math.floor(randomInRange(cfg.min, cfg.max + 1))
        : Math.round(randomInRange(cfg.min, cfg.max));

    let shortfall = 0;
    let newOwnerDebt = null;

    if (isSelfEmployed) {
      // Kendi fabrikanda kendin çalışıyorsan kendine maaş ödemezsin.
      tx.update(userRef, { employmentProducedDateKey: dateKey });
    } else {
      const owner = ownerSnap.data();
      const ownerGold = owner?.gold || 0;
      const ownerPay = Math.min(salary, ownerGold);
      shortfall = salary - ownerPay;

      // İşçi: maaşını TAM alır. employmentProducedDateKey, frontend'in
      // "bugün üretim yaptın mı" (istifa butonu görünürlüğü) sorusunu
      // makine dokümanına ayrıca bakmadan cevaplayabilmesi için.
      tx.update(userRef, {
        gold: admin.firestore.FieldValue.increment(salary),
        employmentProducedDateKey: dateKey,
      });
      // Patron: elinden çıkabildiği kadarı düşülür, yetmeyen kısım CEZA/borç olur.
      tx.update(ownerRef, {
        gold: admin.firestore.FieldValue.increment(-ownerPay),
        debtToState: admin.firestore.FieldValue.increment(shortfall),
      });
      if (shortfall > 0) {
        newOwnerDebt = (owner?.debtToState || 0) + shortfall;
      }
    }

    const inventoryRef = ownerRef.collection('inventory').doc(machine.type);
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(qty) }, { merge: true });
    tx.update(machineRef, { lastProducedDateKey: dateKey, lastProducedQty: qty });

    outcome = {
      salary: isSelfEmployed ? 0 : salary,
      qty,
      shortfall,
      isSelfEmployed,
      ownerId: factoryId,
      newOwnerDebt,
    };
  });

  if (outcome.shortfall > 0 && outcome.newOwnerDebt != null) {
    await sendSalaryPenaltySms(outcome.ownerId, outcome.shortfall, outcome.newOwnerDebt);
  }

  return { ok: true, ...outcome };
});

// resignFromFactory — bugün üretim yapmadıysan istifa edebilirsin.
export const resignFromFactory = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const dateKey = istanbulDateKey();

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user?.employment) {
      throw new HttpsError('failed-precondition', 'Bir fabrikada çalışmıyorsun.');
    }
    const { factoryId, machineId } = user.employment;
    const machineRef = db.collection('factories').doc(factoryId).collection('machines').doc(machineId);
    const machineSnap = await tx.get(machineRef);
    if (machineSnap.exists && machineSnap.data().lastProducedDateKey === dateKey) {
      throw new HttpsError('failed-precondition', 'Bugün üretim yaptın, bugün istifa edemezsin.');
    }
    if (machineSnap.exists) {
      tx.update(machineRef, { workerId: null, workerName: null });
    }
    tx.update(userRef, { employment: admin.firestore.FieldValue.delete() });
  });

  return { ok: true };
});

// fireEmployee — sadece fabrika sahibi; işçi bugün üretim yaptıysa
// çıkaramaz.
export const fireEmployee = onCall(async (request) => {
  const uid = requireAuth(request);
  const { machineId } = request.data || {};
  const dateKey = istanbulDateKey();
  const machineRef = db.collection('factories').doc(uid).collection('machines').doc(machineId);

  await db.runTransaction(async (tx) => {
    const machineSnap = await tx.get(machineRef);
    if (!machineSnap.exists) {
      throw new HttpsError('failed-precondition', 'Makine bulunamadı.');
    }
    const machine = machineSnap.data();
    if (!machine.workerId) {
      throw new HttpsError('failed-precondition', 'Bu makinede kimse çalışmıyor.');
    }
    if (machine.lastProducedDateKey === dateKey) {
      throw new HttpsError('failed-precondition', 'Bu işçi bugün üretim yaptı, bugün çıkaramazsın.');
    }
    tx.update(db.collection('users').doc(machine.workerId), {
      employment: admin.firestore.FieldValue.delete(),
    });
    tx.update(machineRef, { workerId: null, workerName: null });
  });

  return { ok: true };
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

    // -1) TEK SEFERLİK GÖÇ: eski (oyuncu-başına-1-makine) fabrika
    // sistemindeki makine sahiplerine 150.000 altın iade edilir, eski
    // makineleri iptal edilir. migrations/oldFactoryCleanup dokümanı
    // varsa bu blok bir daha çalışmaz.
    const migrationRef = db.collection('migrations').doc('oldFactoryCleanup');
    const migrationSnap = await migrationRef.get();
    if (!migrationSnap.exists) {
      const OLD_MACHINE_REFUND = 150000;
      const usersSnap = await db.collection('users').get();
      const refundJobs = [];
      for (const userDoc of usersSnap.docs) {
        const machinesSnap = await userDoc.ref.collection('productionMachines').get();
        const ownedMachines = machinesSnap.docs.filter((m) => m.data().owned);
        if (ownedMachines.length === 0) continue;
        const refund = OLD_MACHINE_REFUND * ownedMachines.length;
        refundJobs.push(
          (async () => {
            const batch = db.batch();
            batch.update(userDoc.ref, { gold: admin.firestore.FieldValue.increment(refund) });
            ownedMachines.forEach((m) => batch.delete(m.ref));
            batch.set(userDoc.ref.collection('messages').doc(), {
              text: `Fabrika sistemi tamamen değişti! Eski üretim makinen/makinelerin için ${refund.toLocaleString('tr-TR')} altın iade edildi. Artık kendi fabrikanı kurup makine alabilir, ya da başka oyuncuların fabrikasında çalışabilirsin.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'factory_system_migration',
            });
            await batch.commit();
          })()
        );
      }
      await Promise.all(refundJobs);
      await migrationRef.set({ ranAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // -0.9) TEK SEFERLİK GÖÇ: Depo + Vites Geliştirme Malzemeleri "Araba
    // Geliştirme Malzemesi"nde birleştirildi. Bu göç daha önce sadece
    // istemci (frontend) açılınca tetikleniyordu — frontend deploy
    // gecikirse/atlanırsa hiç çalışmıyordu. Artık burada, HER GECE
    // otomatik çalışan dailyReset içinde, bir bayrak dokümanıyla bir
    // kereliğine garanti altına alınıyor.
    const arabaMigrationRef = db.collection('migrations').doc('arabaGelistirmeUnification');
    const arabaMigrationSnap = await arabaMigrationRef.get();
    if (!arabaMigrationSnap.exists) {
      await runArabaGelistirmeMigration();
      await arabaMigrationRef.set({ ranAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // -0.8) TEK SEFERLİK GÖÇ: araç/silah ömür tavanı 50 günden 30 güne
    // düşürüldü — eski (50 güne göre yaşlanmış) kayıtları 29'a çeker.
    // Aynı sebeple (frontend'e bağımlı kalmasın diye) burada da bir
    // bayrak dokümanıyla garantiye alındı.
    const lifeCapMigrationRef = db.collection('migrations').doc('vehicleWeaponLifeCap');
    const lifeCapMigrationSnap = await lifeCapMigrationRef.get();
    if (!lifeCapMigrationSnap.exists) {
      await runVehicleWeaponLifeCapMigration();
      await lifeCapMigrationRef.set({ ranAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // -0.5) Mining makineleri işçi gerektirmez — her gün otomatik olarak
    // sahibinin kripto bakiyesine rastgele (min-max) miktar eklenir.
    {
      const miningSnap = await db.collectionGroup('machines').where('type', '==', 'mining').get();
      const miningJobs = [];
      miningSnap.forEach((m) => {
        const factoryId = m.ref.parent.parent.id;
        const qty = randomInRange(MACHINE_TYPES.mining.min, MACHINE_TYPES.mining.max);
        miningJobs.push(
          db
            .collection('users')
            .doc(factoryId)
            .update({ cryptoHoldings: admin.firestore.FieldValue.increment(qty) })
        );
      });
      await Promise.all(miningJobs);
    }

    // -0.3) Araç/silah ömrü — her gün 1 azalır. Ömrü biten VE tamir hakkı
    // (10) tükenen araç/silah hurdaya çıkarılır (silinir + SMS). Listede
    // (2. el satış) ise ilanı da iptal edilir.
    {
      const collections = [
        { name: 'vehicles', label: 'model' },
        { name: 'weapons', label: 'name' },
      ];
      for (const { name: collName, label: labelField } of collections) {
        const snap = await db.collection(collName).get();
        const jobs = snap.docs.map(async (docSnap) => {
          const item = docSnap.data();
          const currentLife = item.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
          const newLife = Math.max(0, currentLife - 1);
          const repairsUsed = item.repairsUsed || 0;
          if (newLife <= 0 && repairsUsed >= VEHICLE_WEAPON_MAX_REPAIRS) {
            const ownerId = item.ownerId;
            const displayLabel = item[labelField] || (collName === 'vehicles' ? 'aracınız' : 'silahınız');
            if (item.listed) {
              const listingSnap = await db
                .collection('marketplaceListings')
                .where(collName === 'vehicles' ? 'vehicleId' : 'weaponId', '==', docSnap.id)
                .where('sold', '==', false)
                .limit(1)
                .get();
              if (!listingSnap.empty) {
                await listingSnap.docs[0].ref.update({ sold: true, cancelled: true });
              }
            }
            await docSnap.ref.delete();
            if (ownerId) {
              await db
                .collection('users')
                .doc(ownerId)
                .collection('messages')
                .add({
                  text: `Sahip olduğunuz ${displayLabel} hurdalığa kaldırıldı.`,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  read: false,
                  type: collName === 'vehicles' ? 'vehicle_scrapped' : 'weapon_scrapped',
                });
            }
          } else {
            await docSnap.ref.update({ lifeDays: newLife });
            // 2. el satıştaki ilanın üzerinde donmuş (ilan açıldığı
            // andaki) ömür alanını da güncelle — yoksa listedeki araç/
            // silahın ömrü hiç azalmıyormuş gibi görünüyordu (bilinen
            // bir hataydı, burada düzeltiliyor).
            if (item.listed) {
              const listingSnap = await db
                .collection('marketplaceListings')
                .where(collName === 'vehicles' ? 'vehicleId' : 'weaponId', '==', docSnap.id)
                .where('sold', '==', false)
                .limit(1)
                .get();
              if (!listingSnap.empty) {
                const lifeField = collName === 'vehicles' ? 'vehicleLifeDays' : 'weaponLifeDays';
                await listingSnap.docs[0].ref.update({ [lifeField]: newLife });
              }
            }
          }
        });
        await Promise.all(jobs);
      }
    }

    // 0) Bekleyen polislik başvurularını işle (Bölüm 7): anlık meslek
    // değişimiyle istismarı önlemek için başvuru bir sonraki 00:00'da
    // gerçekleşir.
    const pendingApplySnap = await db
      .collection('users')
      .where('pendingPoliceChange', '==', 'apply')
      .get();
    const pendingBatch = db.batch();
    const policeApprovedSmsList = [];
    pendingApplySnap.forEach((docSnap) => {
      pendingBatch.update(docSnap.ref, { profession: 'polis', pendingPoliceChange: null });
      pendingBatch.set(docSnap.ref.collection('private').doc('meta'), { isPolice: true }, { merge: true });
      policeApprovedSmsList.push(docSnap.id);
    });
    if (!pendingApplySnap.empty) await pendingBatch.commit();
    await Promise.all(
      policeApprovedSmsList.map((uidTarget) =>
        db
          .collection('users')
          .doc(uidTarget)
          .collection('messages')
          .add({
            text: 'Polislik başvurun onaylandı! Artık polissin. Günlük maaşın, polislerin aralarında bölüştüğü rüşvet havuzundan Karakol üzerinden alınıyor.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            type: 'police_approved',
          })
      )
    );

    // 0.5) Bekleyen polislik istifalarını işle — istifa artık ANLIK değil,
    // bir sonraki 00:00'da işlenir (havuz/kadro sayımlarının gün içinde
    // tutarlı kalması için, bkz. resignFromPolice).
    const pendingResignSnap = await db
      .collection('users')
      .where('pendingPoliceChange', '==', 'resign')
      .get();
    const resignBatch = db.batch();
    pendingResignSnap.forEach((docSnap) => {
      resignBatch.update(docSnap.ref, { profession: null, pendingPoliceChange: null });
      resignBatch.set(docSnap.ref.collection('private').doc('meta'), { isPolice: false }, { merge: true });
    });
    if (!pendingResignSnap.empty) await resignBatch.commit();

    // 0.7) POLİS MAAŞ HAVUZU — Bölüm 7 revizyonu. Polislerin sabit maaşı
    // kaldırıldı; artık gün içinde verilen rüşvetler (bkz. bribePolice) bir
    // havuzda toplanıyor. Bir SONRAKİ gün, o havuz o günkü aktif polis
    // sayısına eşit bölünüyor ve polisler "Maaşı Al" ile kendi paylarını
    // talep edebiliyor (bkz. claimPoliceSalary). O günün sonunda (bu blok
    // tekrar çalıştığında): 1) dünün havuzundan artan kısım (maaş
    // ALMAYANLARIN payı), dün maaşını ALAN polislere eşit şekilde bonus
    // olarak otomatik dağıtılır + SMS gönderilir, 2) 3 gün üst üste
    // maaşını almayan polis otomatik olarak polislikten atılır, 3) BUGÜN
    // (dünkü rüşvetlerden oluşan) yeni havuz oluşturulur.
    {
      const yesterdayKeyForPolice = addDaysToDateKey(dateKey, -1);

      // 1) Dünkü havuzu kapat: bonus dağıt + kaçıranları işaretle/at.
      const yestPoolRef = db.collection('policeClaimPool').doc(yesterdayKeyForPolice);
      const yestPoolSnap = await yestPoolRef.get();
      if (yestPoolSnap.exists) {
        const pool = yestPoolSnap.data();
        const eligibleUids = pool.eligibleUids || [];
        const claimedUids = pool.claimedUids || [];
        const perOfficerShare = pool.perOfficerShare || 0;
        const leftover = Math.max(0, (pool.totalPool || 0) - (pool.claimedTotal || 0));
        const bonusPerClaimant = claimedUids.length > 0 ? Math.floor(leftover / claimedUids.length) : 0;

        const officerJobs = eligibleUids.map(async (officerUid) => {
          const officerRef = db.collection('users').doc(officerUid);
          const officerSnap = await officerRef.get();
          const officer = officerSnap.data();
          if (!officer || officer.profession !== 'polis') return; // zaten ayrılmış/atılmış

          if (claimedUids.includes(officerUid)) {
            const updates = { policeSalaryMissedStreak: 0 };
            if (bonusPerClaimant > 0) {
              const { goldDelta, debtDelta } = splitIncomeForDebt(officer.debtToState, bonusPerClaimant);
              updates.gold = admin.firestore.FieldValue.increment(goldDelta);
              updates.debtToState = admin.firestore.FieldValue.increment(debtDelta);
            }
            await officerRef.update(updates);
            if (bonusPerClaimant > 0) {
              await officerRef.collection('messages').add({
                text: `Dünkü rüşvet havuzundan artan pay eşit şekilde bölüştürüldü — ${bonusPerClaimant.toLocaleString('tr-TR')} altın ekstra hesabına yatırıldı.`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                type: 'police_pool_bonus',
              });
            }
          } else {
            const newStreak = (officer.policeSalaryMissedStreak || 0) + 1;
            if (newStreak >= 3) {
              await officerRef.update({
                profession: null,
                pendingPoliceChange: null,
                policeSalaryMissedStreak: 0,
              });
              await officerRef.collection('private').doc('meta').set({ isPolice: false }, { merge: true });
              await officerRef.collection('messages').add({
                text: '3 gün üst üste maaşını almadığın için polislikten otomatik olarak atıldın. İstersen tekrar başvurabilirsin.',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                type: 'police_auto_fired',
              });
            } else {
              await officerRef.update({ policeSalaryMissedStreak: newStreak });
            }
          }
        });
        await Promise.all(officerJobs);

        // Kitapçıktaki "günlük ortalama kazanç" istatistiği için: o gün
        // maaş alan bir polisin eline geçen TOPLAM tutar (pay + bonus).
        if (claimedUids.length > 0) {
          const payoutThatDay = perOfficerShare + bonusPerClaimant;
          const statsRef = db.collection('gameStats').doc('policeSalaryAvg');
          const statsSnap = await statsRef.get();
          const prevList = statsSnap.exists ? statsSnap.data().last10Payouts || [] : [];
          const nextList = [...prevList, payoutThatDay].slice(-10);
          const avg = Math.round(nextList.reduce((a, b) => a + b, 0) / nextList.length);
          await statsRef.set({ last10Payouts: nextList, avgDailyPayout: avg }, { merge: true });
        }
      }

      // 2) Bugünün havuzunu oluştur — DÜN verilen rüşvetlerden oluşur,
      // BUGÜNKÜ aktif polis kadrosuna (az önce işlenen başvuru/istifalar
      // dahil) eşit bölünür.
      const bribePoolSnap = await db.collection('policeBribePool').doc(yesterdayKeyForPolice).get();
      const bribeCount = bribePoolSnap.exists ? bribePoolSnap.data().bribeCount || 0 : 0;
      const totalPool = bribeCount * BRIBE_COST;

      const currentPoliceSnap = await db.collection('users').where('profession', '==', 'polis').get();
      const eligibleUids = currentPoliceSnap.docs.map((d) => d.id);
      const policeCount = eligibleUids.length;
      const perOfficerShare = policeCount > 0 ? Math.floor(totalPool / policeCount) : 0;

      await db
        .collection('policeClaimPool')
        .doc(dateKey)
        .set({
          dateKey,
          totalPool,
          bribeCount,
          policeCount,
          perOfficerShare,
          eligibleUids,
          claimedUids: [],
          claimedTotal: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    // 1b) İmam görev kontrolü: DÜN (biten gün) 5 vakit ibadetin hepsini
    // yapmadıysa YA DA hiç nasihat vermediyse, imamlıktan atılır. Yeni gün
    // için başvurular açılır; atılan imam yerine biri imam olup o da
    // atılana kadar tekrar başvuramaz (bkz. applyForImam > lastFiredUid).
    const yesterdayKey = addDaysToDateKey(dateKey, -1);
    const imamRef = db.collection('imamState').doc('current');
    const imamSnap = await imamRef.get();
    if (imamSnap.exists) {
      const imam = imamSnap.data();
      const imamDailySnap = await db
        .collection('dailyActions')
        .doc(`${imam.uid}_${yesterdayKey}`)
        .get();
      const imamDaily = imamDailySnap.data() || {};
      const prayedAllWindows = [1, 2, 3, 4, 5].every((w) => imamDaily.prayedWindows?.[w]);
      const gaveNasihat = Boolean(imamDaily.nasihatGiven);
      if (!prayedAllWindows || !gaveNasihat) {
        await imamRef.delete();
        await db.collection('imamState').doc('meta').set({ lastFiredUid: imam.uid }, { merge: true });
        await db.collection('users').doc(imam.uid).update({ profession: null });
        await db
          .collection('users')
          .doc(imam.uid)
          .collection('messages')
          .add({
            text: 'İmamlık görevlerini (5 vakit ibadet + günlük nasihat) tam yerine getirmediğin için imamlıktan azledildin.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            type: 'imam_fired',
          });
      }
    }

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

    // 3) Yatırım araçları artık günde 1 kez değil, saatte 1 kez ayrı bir
    // Cloud Function (hourlyInvestmentUpdate) tarafından güncelleniyor.

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

    // 4b) Gemi diğer şehirde mal yüklemeye başladığında (gün 3) TÜM
    // oyunculara bilgilendirme SMS'i gönder — bu, ucuz fiyattan sipariş
    // vermek için son gün (2 gün sonra teslim edilecek).
    if (nextDay === 3) {
      const allUsersSnap = await db.collection('users').get();
      const smsBatches = [];
      let currentBatch = db.batch();
      let opCount = 0;
      allUsersSnap.forEach((docSnap) => {
        const msgRef = docSnap.ref.collection('messages').doc();
        currentBatch.set(msgRef, {
          text: 'Gemiye mal yükleniyor. Sipariş vermek için son gün — 2 gün sonra teslim edilecek. Tüm ürünler %20 daha ucuz!',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          type: 'ship_loading',
        });
        opCount += 1;
        if (opCount >= 400) {
          smsBatches.push(currentBatch.commit());
          currentBatch = db.batch();
          opCount = 0;
        }
      });
      if (opCount > 0) smsBatches.push(currentBatch.commit());
      await Promise.all(smsBatches);
    }

    // 5) Liman siparişleri — İKİ KOVA sistemi (Bölüm 12 kullanıcı revizesi):
    //    - Gemi 'departing'e geçtiğinde (gün 2 başladığında): o ana kadar
    //      biriken 'pending' siparişler 'loaded' kovasına taşınır (artık bu
    //      turda gemiye yüklenmiş sayılırlar).
    //    - Gemi 'docking'e döndüğünde (gün 1): 'loaded' kovası envantere
    //      teslim edilir + SMS gönderilir, 'pending' kovası DOKUNULMADAN
    //      kalır (bir sonraki gün 2'de yüklenmeyi bekler).
    if (nextDay === 2) {
      const ordersSnap = await db.collection('limanOrders').get();
      const promotions = [];
      ordersSnap.forEach((orderDoc) => {
        const data = orderDoc.data();
        const pending = data.pending || {};
        const hasPending = Object.values(pending).some((q) => q > 0);
        if (!hasPending) return;
        const updates = {};
        for (const materialType of ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme', 'yasakliMadde']) {
          const qty = pending[materialType] || 0;
          if (qty > 0) {
            updates[`loaded.${materialType}`] = admin.firestore.FieldValue.increment(qty);
            updates[`pending.${materialType}`] = 0;
          }
        }
        promotions.push(orderDoc.ref.update(updates));
      });
      await Promise.all(promotions);
    }

    if (nextDay === 1) {
      const ordersSnap = await db.collection('limanOrders').get();
      const deliveries = [];
      const deliverySmsList = []; // { uid, summary }
      for (const orderDoc of ordersSnap.docs) {
        const data = orderDoc.data();
        const loaded = data.loaded || {};
        const targetUid = orderDoc.id;
        const delivered = [];
        for (const materialType of ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme', 'yasakliMadde']) {
          const qty = loaded[materialType] || 0;
          if (qty > 0) {
            delivered.push({ materialType, qty });
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
        if (delivered.length > 0) {
          deliveries.push(
            orderDoc.ref.update({
              'loaded.tamirMalzemesi': 0,
              'loaded.silahUpgrade': 0,
              'loaded.arabaGelistirme': 0,
              'loaded.yasakliMadde': 0,
            })
          );
          const summary = delivered
            .map((d) => `${d.qty} adet ${MATERIAL_SMS_LABELS[d.materialType] || d.materialType}`)
            .join(', ');
          deliverySmsList.push({ uid: targetUid, summary });
        }
      }
      await Promise.all(deliveries);
      await Promise.all(
        deliverySmsList.map((d) =>
          db
            .collection('users')
            .doc(d.uid)
            .collection('messages')
            .add({
              text: `Liman: siparişin geldi! ${d.summary} envanterine eklendi.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'liman_delivery',
            })
        )
      );
    }

    // 7) Araç kredileri (Bölüm 8.4, 9.3): vadesi geçmiş & tam ödenmemiş
    // krediler artık aracı EL KOYMUYOR — kalan borç doğrudan devlete CEZA
    // olarak yazılıyor (Banka'dan istediğin an ödenebilir, ya da
    // kazancının yarısı otomatik keser — Bölüm 10 ile aynı mantık), araç
    // sahibine iade edilir, kredi tamamen kapanır. Bu, önceki "el koy /
    // borcu öde / aracı geri al" akışının karmaşıklığını kaldırır — tek
    // seferlik, net bir sonuç.
    const mortgagedSnap = await db.collection('vehicles').where('mortgaged', '==', true).get();
    const loanBatch = db.batch();
    const loanSmsPromises = [];
    const nowMillis = Date.now();
    mortgagedSnap.forEach((docSnap) => {
      const v = docSnap.data();
      const paid = v.loanPaid || 0;
      const totalOwed = v.loanTotalOwed || 0;
      const dueMillis = v.loanDueAt?.toMillis?.() ?? 0;
      if (v.seizedByBank || paid >= totalOwed) {
        return;
      }
      if (dueMillis <= nowMillis) {
        // Vade doldu, borç tam ödenmedi — kalan miktar CEZA olarak devlete
        // yazılır, araç sahibine kalır, kredi kapanır.
        const remaining = totalOwed - paid;
        loanBatch.update(db.collection('users').doc(v.ownerId), {
          debtToState: admin.firestore.FieldValue.increment(remaining),
        });
        loanBatch.update(docSnap.ref, {
          mortgaged: false,
          seizedByBank: false,
          loanPrincipal: 0,
          loanTotalOwed: 0,
          loanPaid: 0,
        });
        loanSmsPromises.push(
          db
            .collection('users')
            .doc(v.ownerId)
            .collection('messages')
            .add({
              text: `Banka: ${v.model} aracınızın kredi vadesi doldu. Kalan borcunuz (${remaining.toLocaleString('tr-TR')} altın) devlete CEZA olarak yazıldı, aracınız elinizde kalıyor. Banka'dan istediğin an ödeyebilirsin.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'loan_penalty',
            })
        );
      } else {
        const remaining = totalOwed - paid;
        const daysLeft = Math.max(0, Math.ceil((dueMillis - nowMillis) / (24 * 60 * 60 * 1000)));
        loanSmsPromises.push(
          db
            .collection('users')
            .doc(v.ownerId)
            .collection('messages')
            .add({
              text: `Banka: ${v.model} aracınız için kalan borcunuz ${remaining.toLocaleString('tr-TR')} altın. Vadeye ${daysLeft} gün kaldı.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'loan_reminder',
            })
        );
      }
    });
    if (!mortgagedSnap.empty) await loanBatch.commit();
    await Promise.all(loanSmsPromises);

    // 8) Devlete borcu olanlara hatırlatma SMS'i (Bölüm 9.3). Tek alanda
    // range sorgusu (debtToState > 0) composite index istemiyor.
    const debtSnap = await db.collection('users').where('debtToState', '>', 0).get();
    const debtSmsPromises = [];
    debtSnap.forEach((docSnap) => {
      const debt = docSnap.data().debtToState || 0;
      debtSmsPromises.push(
        db
          .collection('users')
          .doc(docSnap.id)
          .collection('messages')
          .add({
            text: `Devlete borcunuz ${debt.toLocaleString('tr-TR')} altın. Borç bitene kadar kazandığınız her paranın yarısı otomatik borca gidiyor.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            type: 'debt_reminder',
          })
      );
    });
    await Promise.all(debtSmsPromises);

    // 9) Piyango çekilişi (Bölüm 11): bir önceki günün biletlerine göre
    // ağırlıklı rastgele kazanan seçilir, jackpot'un tamamı verilir.
    const prevDateKey = addDaysToDateKey(dateKey, -1);
    const prevLotteryRef = db.collection('lottery').doc(prevDateKey);
    const prevLotterySnap = await prevLotteryRef.get();
    if (prevLotterySnap.exists && !prevLotterySnap.data().drawnAt) {
      const lottery = prevLotterySnap.data();
      if (lottery.totalTickets > 0) {
        const ticketsSnap = await prevLotteryRef.collection('tickets').get();
        const roll = Math.random() * lottery.totalTickets;
        let cumulative = 0;
        let winnerUid = null;
        let winnerName = null;
        for (const ticketDoc of ticketsSnap.docs) {
          const t = ticketDoc.data();
          cumulative += t.count || 0;
          if (roll < cumulative) {
            winnerUid = t.uid;
            winnerName = t.displayName;
            break;
          }
        }
        if (winnerUid) {
          const winnerRef = db.collection('users').doc(winnerUid);
          const winnerSnap = await winnerRef.get();
          const { goldDelta, debtDelta } = splitIncomeForDebt(
            winnerSnap.data()?.debtToState,
            lottery.jackpot
          );
          await winnerRef.update({
            gold: admin.firestore.FieldValue.increment(goldDelta),
            debtToState: admin.firestore.FieldValue.increment(debtDelta),
          });
          await prevLotteryRef.update({
            winnerUid,
            winnerName,
            winnerAmount: lottery.jackpot,
            drawnAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await winnerRef.collection('messages').add({
            text: `Tebrikler! Piyangodan ${lottery.jackpot.toLocaleString('tr-TR')} altın kazandın.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            type: 'lottery_win',
          });
        }
      } else {
        // Kimse bilet almadıysa kazanan yok, sadece çekiliş yapıldı olarak işaretlenir.
        await prevLotteryRef.update({ drawnAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }

    // 10) Şampiyona (Bölüm 8.7-ek): bir önceki günün her araç şampiyonasında
    // en az turda bitiren oyuncu büyük ödülü (galeri fiyatının 1/10'u) kazanır.
    {
      const champPrevDateKey = addDaysToDateKey(dateKey, -1);
      const catalogIds = Object.keys(VEHICLE_CATALOG);
      for (const catalogId of catalogIds) {
        const champRef = db.collection('championshipDaily').doc(`${catalogId}_${champPrevDateKey}`);
        const champSnap = await champRef.get();
        if (!champSnap.exists || champSnap.data().finalized) continue;
        const champ = champSnap.data();
        if (!champ.leaderUid) {
          await champRef.update({ finalized: true });
          continue;
        }
        const reward = Math.round(
          (VEHICLE_CATALOG[catalogId]?.price || 0) * CHAMPIONSHIP_REWARD_RATIO
        );
        const winnerRef = db.collection('users').doc(champ.leaderUid);
        const winnerSnap = await winnerRef.get();
        const { goldDelta, debtDelta } = splitIncomeForDebt(winnerSnap.data()?.debtToState, reward);
        await winnerRef.update({
          gold: admin.firestore.FieldValue.increment(goldDelta),
          debtToState: admin.firestore.FieldValue.increment(debtDelta),
        });
        await champRef.update({
          finalized: true,
          winnerUid: champ.leaderUid,
          winnerName: champ.leaderName,
          winnerVehicleModel: champ.leaderVehicleModel,
          winnerTurns: champ.leaderTurns,
          rewardAmount: reward,
        });
        await winnerRef.collection('messages').add({
          text: `Tebrikler! ${VEHICLE_CATALOG[catalogId]?.name} şampiyonasını ${champ.leaderTurns} turda tamamlayarak kazandın. Ödül: ${reward.toLocaleString('tr-TR')} altın.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          type: 'championship_win',
        });
      }
    }

    console.log(`dailyReset tamamlandı: ${dateKey}`);
  }
);

// =============================================================================
// hourlyInvestmentUpdate — elmas/kripto fiyatları artık günde 1 kez değil,
// SAATTE 1 kez (günde 24 kez) rastgele hareket ediyor.
//   - Elmas: %1-%4 arası
//   - Kripto: %1-%20 arası
// Güncel fiyat investments/current dokümanında tutulur (alım/satım
// fonksiyonları buradan okur); her saatlik hareket ayrıca
// investmentHistory koleksiyonuna çizgi grafik için kaydedilir. 30
// günden eski geçmiş kayıtları otomatik temizlenir.
// =============================================================================
export const hourlyInvestmentUpdate = onSchedule(
  { schedule: 'every 1 hours', timeZone: 'Europe/Istanbul' },
  async () => {
    const currentRef = db.collection('investments').doc('current');
    const currentSnap = await currentRef.get();
    const prev = currentSnap.exists
      ? currentSnap.data()
      : { diamondPrice: 1000, stockPrice: 10000, cryptoPrice: 100000 };

    // Asimetrik oynaklık: düşüş oranı artış oranından biraz daha küçük
    // tutuluyor (kullanıcı revizesi) — aksi halde eşit oranlı rastgele
    // yürüyüş "düşmeye meyilli" oluyor (ör. %50 düşüp tekrar eski seviyeye
    // gelmek için %100 artış gerekir). Üst/alt sınır YOK — fiyat doğal
    // akışına bırakılıyor, sadece 1 altına inmesin diye güvenlik tabanı var.
    // Sıralama (oynaklık artan): Elmas < Hisse Senedi < Kripto.
    const diamondUp = Math.random() < 0.5;
    const diamondChangePct = diamondUp
      ? Math.random() * 0.04 + 0.01 // %1-5 artış
      : -(Math.random() * 0.03 + 0.01); // %1-4 düşüş
    const stockUp = Math.random() < 0.5;
    const stockChangePct = stockUp
      ? Math.random() * 0.09 + 0.01 // %1-10 artış
      : -(Math.random() * 0.07 + 0.01); // %1-8 düşüş
    const cryptoUp = Math.random() < 0.5;
    const cryptoChangePct = cryptoUp
      ? Math.random() * 0.19 + 0.01 // %1-20 artış
      : -(Math.random() * 0.15 + 0.01); // %1-16 düşüş

    const diamondPrice = Math.max(1, Math.round(prev.diamondPrice * (1 + diamondChangePct)));
    const stockPrice = Math.max(1, Math.round((prev.stockPrice ?? 10000) * (1 + stockChangePct)));
    const cryptoPrice = Math.max(1, Math.round(prev.cryptoPrice * (1 + cryptoChangePct)));

    const roundedDiamondPct = Math.round(diamondChangePct * 1000) / 10;
    const roundedStockPct = Math.round(stockChangePct * 1000) / 10;
    const roundedCryptoPct = Math.round(cryptoChangePct * 1000) / 10;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await currentRef.set({
      diamondPrice,
      stockPrice,
      cryptoPrice,
      diamondChangePct: roundedDiamondPct,
      stockChangePct: roundedStockPct,
      cryptoChangePct: roundedCryptoPct,
      updatedAt: now,
    });

    await db.collection('investmentHistory').add({
      diamondPrice,
      stockPrice,
      cryptoPrice,
      diamondChangePct: roundedDiamondPct,
      stockChangePct: roundedStockPct,
      cryptoChangePct: roundedCryptoPct,
      createdAt: now,
    });

    // 30 günden eski geçmiş kayıtlarını temizle (24/gün × 30 = ~720 kayıt
    // sınırı civarında tutulur).
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oldSnap = await db
      .collection('investmentHistory')
      .where('createdAt', '<', cutoff)
      .limit(200)
      .get();
    if (!oldSnap.empty) {
      const cleanupBatch = db.batch();
      oldSnap.forEach((doc) => cleanupBatch.delete(doc.ref));
      await cleanupBatch.commit();
    }
  }
);

// =============================================================================
// FAZ 3 — ARABA VE SİLAH SİSTEMİ (Bölüm 8.1, 8.2, 8.3)
// =============================================================================

const UPGRADE_MATERIAL_REFUND = 50; // Bölüm 8.3 — geri satış fiyatı
const MATERIAL_SELL_PRICE = { arabaGelistirme: 250, tamirMalzemesi: 8 }; // Bölüm 8.2 — Modifiye Garajı'na satış

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
      seizedByBank: false,
      lifeDays: VEHICLE_WEAPON_INITIAL_LIFE_DAYS,
      repairsUsed: 0,
      purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await db
    .collection('users')
    .doc(uid)
    .collection('messages')
    .add({
      text: `Banka: yeni ${catalogEntry.name} aracınızı ipotek ederek kredi çekebilirsiniz. Detaylar için Banka'ya uğrayın.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'loan_offer',
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
  // Depo ve Vites Geliştirme Malzemeleri birleştirildi — artık ikisi de
  // TEK malzeme: "Araba Geliştirme Malzemesi" (arabaGelistirme).
  const inventoryRef = db.collection('users').doc(uid).collection('inventory').doc('arabaGelistirme');

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
    // Malzeme gereksinimi aracın fiyatıyla doğru orantılı: 1000₺ araba
    // için 2 malzeme, 100.000₺ araba için 200 malzeme (oran: fiyat/500).
    const requiredQty = Math.max(2, Math.round((vehicle.baseGalleryValue || 0) / 500));
    const qty = inventorySnap.exists ? inventorySnap.data().quantity || 0 : 0;
    if (qty < requiredQty) {
      throw new HttpsError(
        'failed-precondition',
        `Yetersiz geliştirme malzemesi (${requiredQty} adet gerekli, ${qty} adedin var).`
      );
    }

    tx.set(
      inventoryRef,
      { quantity: admin.firestore.FieldValue.increment(-requiredQty) },
      { merge: true }
    );
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
// buyFromAmazor — Telefon > Amazor uygulamasından yasaklı madde/depo/vites/
// silah geliştirme malzemesi satın alma. Anında teslim edilir.
// Modifiye Garajı ve Silah Mağazası'ndan malzeme alım/satımı KALDIRILDI —
// tüm malzeme alımı artık Amazor'dan, tüm satımı Liman & Depo > Depo'dan.
// ---------------------------------------------------------------------------
const AMAZOR_PRICES = {
  tamirMalzemesi: 10,
  silahUpgrade: 100,
  arabaGelistirme: 500,
  yasakliMadde: 2500,
};

export const buyFromAmazor = onCall(async (request) => {
  const uid = requireAuth(request);
  const { materialType, quantity } = request.data || {};
  if (!AMAZOR_PRICES[materialType]) {
    throw new HttpsError('invalid-argument', 'Geçersiz malzeme türü.');
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  const totalCost = qty * AMAZOR_PRICES[materialType];
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc(materialType);

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

// ---------------------------------------------------------------------------
// sellMaterial — üretilen depo/vites malzemesini Liman & Depo > Depo'ya
// satma (Bölüm 8.2 — 250 altın/adet).
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
    const [invSnap, userSnap] = await Promise.all([tx.get(inventoryRef), tx.get(userRef)]);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < qty) {
      throw new HttpsError('failed-precondition', 'Yeterli malzemeniz yok.');
    }
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
    const { goldDelta, debtDelta } = splitIncomeForDebt(
      userSnap.data()?.debtToState,
      qty * unitPrice
    );
    tx.set(
      userRef,
      {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      },
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
      lifeDays: VEHICLE_WEAPON_INITIAL_LIFE_DAYS,
      repairsUsed: 0,
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
    // Bölüm 8.3: "Gereken malzeme miktarı (seviye başı) = silah fiyatı / 100."
    const requiredQty = Math.round(weapon.basePrice / 100);
    if (qty < requiredQty) {
      throw new HttpsError(
        'failed-precondition',
        `Yetersiz gelişim malzemesi (${requiredQty} adet gerekli, ${qty} adedin var).`
      );
    }

    const newLevel = weapon.level + 1;
    const multiplier = newLevel === 2 ? 1.5 : 2;
    const newPower = Math.round(weapon.basePower * multiplier);

    tx.set(
      inventoryRef,
      { quantity: admin.firestore.FieldValue.increment(-requiredQty) },
      { merge: true }
    );
    tx.update(weaponRef, { level: newLevel, power: newPower });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// repairItem — araç/silah tamiri. Ömrü (lifeDays) +3 gün uzatır (orijinal
// 30 günü aşmaz), tamir hakkını (repairsUsed) 1 artırır (toplamda en fazla
// 10 kez tamir edilebilir). Gereken tamir malzemesi = fiyat/100 (araçta
// baseGalleryValue, silahta basePrice) — silah geliştirmeyle aynı oran.
// ---------------------------------------------------------------------------
export const repairItem = onCall(async (request) => {
  const uid = requireAuth(request);
  const { itemType, itemId } = request.data || {};
  if (!['vehicle', 'weapon'].includes(itemType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz ürün türü.');
  }
  const itemRef = db.collection(itemType === 'vehicle' ? 'vehicles' : 'weapons').doc(itemId);
  const inventoryRef = db.collection('users').doc(uid).collection('inventory').doc('tamirMalzemesi');

  await db.runTransaction(async (tx) => {
    const [itemSnap, invSnap] = await Promise.all([tx.get(itemRef), tx.get(inventoryRef)]);
    if (!itemSnap.exists || itemSnap.data().ownerId !== uid) {
      throw new HttpsError(
        'failed-precondition',
        `Bu ${itemType === 'vehicle' ? 'araç' : 'silah'} size ait değil.`
      );
    }
    const item = itemSnap.data();
    const repairsUsed = item.repairsUsed || 0;
    if (repairsUsed >= VEHICLE_WEAPON_MAX_REPAIRS) {
      throw new HttpsError('failed-precondition', 'Tamir hakkı tükendi.');
    }
    const price = itemType === 'vehicle' ? item.baseGalleryValue || 0 : item.basePrice || 0;
    const requiredQty = repairRequiredQty(price);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < requiredQty) {
      throw new HttpsError(
        'failed-precondition',
        `Yetersiz tamir malzemesi (${requiredQty} adet gerekli, ${have} adedin var).`
      );
    }
    const currentLife = item.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
    const newLife = Math.min(VEHICLE_WEAPON_INITIAL_LIFE_DAYS, currentLife + REPAIR_LIFE_BONUS_DAYS);
    tx.set(
      inventoryRef,
      { quantity: admin.firestore.FieldValue.increment(-requiredQty) },
      { merge: true }
    );
    tx.update(itemRef, { lifeDays: newLife, repairsUsed: repairsUsed + 1 });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// sellSilahMaterial — Liman & Depo > Depo'da gelişim malzemesi satışı
// (Bölüm 8.3 — 50 altın/adet). Alım artık Telefon > Amazor'dan yapılıyor.
// ---------------------------------------------------------------------------

export const sellSilahMaterial = onCall(async (request) => {
  const uid = requireAuth(request);
  const qty = Math.max(1, Number(request.data?.quantity) || 1);
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('silahUpgrade');

  await db.runTransaction(async (tx) => {
    const [invSnap, userSnap] = await Promise.all([tx.get(inventoryRef), tx.get(userRef)]);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < qty) {
      throw new HttpsError('failed-precondition', 'Satacak yeterli gelişim malzemeniz yok.');
    }
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
    const { goldDelta, debtDelta } = splitIncomeForDebt(
      userSnap.data()?.debtToState,
      UPGRADE_MATERIAL_REFUND * qty
    );
    tx.set(
      userRef,
      {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      },
      { merge: true }
    );
  });

  return { ok: true };
});

// =============================================================================
// FAZ 4 — BANKA VE YATIRIM SİSTEMİ (Bölüm 13)
// =============================================================================

const DEFAULT_PRICES = { diamondPrice: 1000, stockPrice: 10000, cryptoPrice: 100000 };

async function getCurrentPrices() {
  const snap = await db.collection('investments').doc('current').get();
  return snap.exists ? snap.data() : DEFAULT_PRICES;
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
const INVESTMENT_PRICE_FIELD = { diamond: 'diamondPrice', stock: 'stockPrice', crypto: 'cryptoPrice' };
const INVESTMENT_HOLDINGS_FIELD = {
  diamond: 'diamondHoldings',
  stock: 'stockHoldings',
  crypto: 'cryptoHoldings',
};

export const buyInvestment = onCall(async (request) => {
  const uid = requireAuth(request);
  const { assetType } = request.data || {};
  const goldAmount = Number(request.data?.amount);
  if (!INVESTMENT_PRICE_FIELD[assetType]) {
    throw new HttpsError('invalid-argument', 'Geçersiz yatırım aracı.');
  }
  if (!Number.isInteger(goldAmount) || goldAmount <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz altın miktarı.');
  }

  const prices = await getCurrentPrices();
  const unitPrice = prices[INVESTMENT_PRICE_FIELD[assetType]];
  const units = goldAmount / unitPrice;
  const holdingsField = INVESTMENT_HOLDINGS_FIELD[assetType];

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
  if (!INVESTMENT_PRICE_FIELD[assetType]) {
    throw new HttpsError('invalid-argument', 'Geçersiz yatırım aracı.');
  }

  const prices = await getCurrentPrices();
  const unitPrice = prices[INVESTMENT_PRICE_FIELD[assetType]];
  const holdingsField = INVESTMENT_HOLDINGS_FIELD[assetType];

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
// BANKA KREDİSİ — ARAÇ İPOTEĞİ (Bölüm 8.4)
// =============================================================================
//
// - Kredi limiti = aracın galerideki GÜNCEL DEĞERİ (baseGalleryValue) —
//   geliştirmeler (vites/depo) limiti ARTIRMAZ.
// - Vade: 10 gün → %20 faiz, 20 gün → %40 faiz (tek seferlik, anaparaya
//   eklenir). Ödeme dilim dilim veya tek seferde yapılabilir.
// - Vade dolup borç tam ödenmemişse: o ana kadar ödenen kısım oyuncuya
//   İADE edilir, araç bankaya el konur (seizedByBank). Kalan borç (tam
//   loanTotalOwed) sonradan ödenirse araç geri alınır; ödenmezse araç
//   kalıcı olarak bankada kalır.
// =============================================================================

const LOAN_TERMS = {
  10: 0.2,
  20: 0.4,
};

export const takeVehicleLoan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { vehicleId, termDays } = request.data || {};
  const interestRate = LOAN_TERMS[termDays];
  if (!interestRate) {
    throw new HttpsError('invalid-argument', 'Vade 10 ya da 20 gün olmalı.');
  }

  const vehicleRef = db.collection('vehicles').doc(vehicleId);
  const userRef = db.collection('users').doc(uid);
  let totalOwedForSms = 0;

  await db.runTransaction(async (tx) => {
    const vehicleSnap = await tx.get(vehicleRef);
    const vehicle = vehicleSnap.data();
    if (!vehicleSnap.exists || vehicle.ownerId !== uid) {
      throw new HttpsError('failed-precondition', 'Bu araç size ait değil.');
    }
    if (vehicle.mortgaged) {
      throw new HttpsError('failed-precondition', 'Bu araç zaten ipotekli.');
    }
    if (vehicle.seizedByBank) {
      throw new HttpsError('failed-precondition', 'Bu araç bankaya el konulmuş durumda.');
    }
    if (vehicle.listed) {
      throw new HttpsError(
        'failed-precondition',
        '2. el satışta olan bir araca kredi çekemezsin.'
      );
    }
    const vehicleLife = vehicle.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
    if (!(vehicleLife > termDays)) {
      throw new HttpsError(
        'failed-precondition',
        `Aracın ömrü (${vehicleLife} gün) bu vadeden (${termDays} gün) fazla olmalı. Önce tamir ettirebilirsin.`
      );
    }

    const principal = vehicle.baseGalleryValue;
    const totalOwed = Math.round(principal * (1 + interestRate));
    totalOwedForSms = totalOwed;
    const now = Date.now();

    tx.update(vehicleRef, {
      mortgaged: true,
      seizedByBank: false,
      loanPrincipal: principal,
      loanTotalOwed: totalOwed,
      loanPaid: 0,
      loanTermDays: termDays,
      loanStartedAt: admin.firestore.Timestamp.fromMillis(now),
      loanDueAt: admin.firestore.Timestamp.fromMillis(now + termDays * 24 * 60 * 60 * 1000),
    });
    // Kredi anaparası BORÇLANILAN paradır, "kazanç" değildir — borç
    // bölüştürme (Bölüm 10) kredi kullanımına uygulanmaz.
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(principal) });
  });

  await db
    .collection('users')
    .doc(uid)
    .collection('messages')
    .add({
      text: `Banka: aracınız için ${termDays} günlük kredi başladı. Vade sonuna kadar toplam ${totalOwedForSms.toLocaleString('tr-TR')} altın ödemelisiniz.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'loan_started',
    });

  return { ok: true };
});

export const repayVehicleLoan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { vehicleId, amount } = request.data || {};
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }

  const vehicleRef = db.collection('vehicles').doc(vehicleId);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const [vehicleSnap, userSnap] = await Promise.all([tx.get(vehicleRef), tx.get(userRef)]);
    const vehicle = vehicleSnap.data();
    const user = userSnap.data();
    if (!vehicleSnap.exists || vehicle.ownerId !== uid) {
      throw new HttpsError('failed-precondition', 'Bu araç size ait değil.');
    }
    if (!vehicle.mortgaged) {
      throw new HttpsError('failed-precondition', 'Bu aracın aktif bir kredisi yok.');
    }
    if (!user || (user.gold || 0) < amt) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }

    const remaining = vehicle.loanTotalOwed - (vehicle.loanPaid || 0);
    const applied = Math.min(amt, remaining);
    const newPaid = (vehicle.loanPaid || 0) + applied;
    const fullyPaid = newPaid >= vehicle.loanTotalOwed;

    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-applied) });
    tx.update(vehicleRef, {
      loanPaid: newPaid,
      ...(fullyPaid
        ? { mortgaged: false, seizedByBank: false, loanPrincipal: 0, loanTotalOwed: 0, loanPaid: 0 }
        : {}),
    });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// repayStateDebt — Banka > Cezalar'dan devlete olan borcu ELLE ödeme.
// Normalde borç varken kazancının yarısı otomatik kesiliyor (Bölüm 10),
// ama oyuncu isterse cebindeki altınla borcunu doğrudan da kapatabilir.
// ---------------------------------------------------------------------------
export const repayStateDebt = onCall(async (request) => {
  const uid = requireAuth(request);
  const amt = Number(request.data?.amount);
  if (!Number.isInteger(amt) || amt <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }

  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user) throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    const debt = user.debtToState || 0;
    if (debt <= 0) {
      throw new HttpsError('failed-precondition', 'Devlete borcun yok.');
    }
    if ((user.gold || 0) < amt) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    const applied = Math.min(amt, debt);
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-applied),
      debtToState: admin.firestore.FieldValue.increment(-applied),
    });
  });

  return { ok: true };
});

// =============================================================================
// CASINO — PİYANGO (Bölüm 11)
// =============================================================================
//
// - Bilet: 100 altın. Günün jackpot'u 1000 altından başlar, satılan her
//   biletin tam bedeli (100 altın × adet) jackpot'a eklenir.
// - Kazanma şansı = oyuncunun bilet sayısı / o güne ait toplam bilet sayısı
//   (ağırlıklı rastgele) — dailyReset içinde (00:00) bir önceki günün
//   çekilişi yapılır, jackpot'un tamamı kazanana verilir.
// - lottery/{dateKey}: jackpot, totalTickets, winnerUid, winnerAmount, drawnAt
// - lottery/{dateKey}/tickets/{uid}: uid, displayName, count
// =============================================================================

const LOTTERY_TICKET_PRICE = 100;
const LOTTERY_BASE_JACKPOT = 1000;

export const buyLotteryTicket = onCall(async (request) => {
  const uid = requireAuth(request);
  const qty = Number(request.data?.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  const cost = qty * LOTTERY_TICKET_PRICE;
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const lotteryRef = db.collection('lottery').doc(dateKey);
  const ticketRef = lotteryRef.collection('tickets').doc(uid);

  await db.runTransaction(async (tx) => {
    const [userSnap, lotterySnap] = await Promise.all([tx.get(userRef), tx.get(lotteryRef)]);
    const user = userSnap.data();
    if (!user || (user.gold || 0) < cost) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-cost) });
    if (!lotterySnap.exists) {
      tx.set(lotteryRef, {
        jackpot: LOTTERY_BASE_JACKPOT + cost,
        totalTickets: qty,
        winnerUid: null,
        winnerAmount: null,
        drawnAt: null,
      });
    } else {
      tx.update(lotteryRef, {
        jackpot: admin.firestore.FieldValue.increment(cost),
        totalTickets: admin.firestore.FieldValue.increment(qty),
      });
    }
    tx.set(
      ticketRef,
      {
        uid,
        displayName: user.displayName || 'Oyuncu',
        count: admin.firestore.FieldValue.increment(qty),
      },
      { merge: true }
    );
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// spinSlot — Casino > Slot. Günde ilk çevirme ücretsiz, sonrası 750 altın.
// 3 makara, 5 olası sembol, tamamen rastgele. 2 ya da 3 aynı sembol
// gelirse ödül var; hepsi farklıysa ödül yok.
// ---------------------------------------------------------------------------
const SLOT_SPIN_COST = 500;
const SLOT_FREE_SPINS_PER_DAY = 3;
// Depo+Vites Geliştirme Malzemeleri "Araba Geliştirme Malzemesi" olarak
// birleştiği için slot artık 6 değil 5 sembol üzerinden dönüyor.
const SLOT_SYMBOLS = ['yasakliMadde', 'silahUpgrade', 'tamirMalzemesi', 'arabaGelistirme', 'altin'];
const SLOT_PRIZES = {
  tamirMalzemesi: { 2: 100, 3: 500 },
  silahUpgrade: { 2: 10, 3: 50 },
  arabaGelistirme: { 2: 2, 3: 10 },
  yasakliMadde: { 2: 1, 3: 2 },
  altin: { 2: 1000, 3: 10000 },
};

export const spinSlot = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  const reels = [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
  const counts = {};
  reels.forEach((s) => {
    counts[s] = (counts[s] || 0) + 1;
  });
  let prizeSymbol = null;
  let matchCount = 0;
  Object.entries(counts).forEach(([symbol, count]) => {
    if (count >= 2 && count > matchCount) {
      prizeSymbol = symbol;
      matchCount = count;
    }
  });
  const prizeAmount = prizeSymbol ? SLOT_PRIZES[prizeSymbol][matchCount] || 0 : 0;

  let usedFreeSpin = false;
  let freeSpinsLeft = 0;
  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef)]);
    const user = userSnap.data();
    const freeSpinsUsed = dailySnap.data()?.slotFreeSpinsUsed || 0;
    const hasFreeSpin = freeSpinsUsed < SLOT_FREE_SPINS_PER_DAY;
    const cost = hasFreeSpin ? 0 : SLOT_SPIN_COST;
    if (!user || (user.gold || 0) < cost) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    usedFreeSpin = hasFreeSpin;

    if (cost > 0) {
      tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-cost) });
    }
    if (hasFreeSpin) {
      tx.set(dailyRef, { slotFreeSpinsUsed: freeSpinsUsed + 1 }, { merge: true });
      freeSpinsLeft = SLOT_FREE_SPINS_PER_DAY - (freeSpinsUsed + 1);
    }

    if (prizeSymbol === 'altin') {
      // Slot kazancı 10 Numara/Piyango gibi asla otomatik borca gitmez.
      tx.update(userRef, { gold: admin.firestore.FieldValue.increment(prizeAmount) });
    } else if (prizeSymbol) {
      const inventoryRef = userRef.collection('inventory').doc(prizeSymbol);
      tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(prizeAmount) }, { merge: true });
    }
  });

  return { ok: true, reels, matchCount, prizeSymbol, prizeAmount, free: usedFreeSpin, freeSpinsLeft };
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
  const win = istanbulPrayerWindow();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef)]);
    const user = userSnap.data();
    if (dailySnap.exists && dailySnap.data().prayedWindows?.[win]) {
      throw new HttpsError('failed-precondition', 'Bu vakitte zaten ibadet ettin.');
    }
    const currentSuspicion = user?.suspicion || 0;
    const updates = { suspicion: clampSuspicion(currentSuspicion - 5) };
    if (currentSuspicion === 0) {
      updates.reputation = clamp(Math.round((user?.reputation || 0) + 10), 0, 100);
    }
    tx.update(userRef, updates);
    tx.set(dailyRef, { prayedWindows: { [win]: true } }, { merge: true });
    // "X. Vakitteki Cemaat" listesi için — Camii ekranında avatar+isimle
    // gösterilir. Vakite göre AYRI bir doküman altında tutuluyor.
    tx.set(
      db
        .collection('mosqueAttendance')
        .doc(`${dateKey}_w${win}`)
        .collection('members')
        .doc(uid),
      {
        uid,
        displayName: user?.displayName || 'Oyuncu',
        avatar: user?.avatar || null,
        prayedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    );
  });

  return { ok: true, window: win };
});

// ---------------------------------------------------------------------------
// Dilenciler (Camii) — günlük tarihe göre AYRI bir koleksiyonda tutulur
// (beggars/{dateKey}/entries/{uid}), bu yüzden 00:00'da otomatik olarak
// "sıfırlanmış" olur — yeni gün yeni, boş bir koleksiyon demektir, ekstra
// bir temizlik işine gerek yok. Zengin oyuncular (toplam serveti 10.000
// altını aşanlar) dilenci olamaz. Günde en fazla 5.000 altın kazanılabilir
// — bu sınıra ulaşınca dilenci listeden otomatik kaldırılır ve o gün
// tekrar dilenci olamaz.
// ---------------------------------------------------------------------------
const BEGGAR_WEALTH_LIMIT = 10000;
const BEGGAR_DAILY_EARN_CAP = 5000;

async function computeTotalWealth(userData, prices) {
  const gold = userData?.gold || 0;
  const bankBalance = userData?.bankBalance || 0;
  const diamondValue = (userData?.diamondHoldings || 0) * (prices.diamondPrice || 0);
  const stockValue = (userData?.stockHoldings || 0) * (prices.stockPrice || 0);
  const cryptoValue = (userData?.cryptoHoldings || 0) * (prices.cryptoPrice || 0);
  return gold + bankBalance + diamondValue + stockValue + cryptoValue;
}

// ---------------------------------------------------------------------------
// İmam (Camii) — oyunda TEK bir imam vardır. İmamlar polis olamaz,
// fabrikada çalışamaz, suç işleyemez (bkz. yukarıdaki profession==='imam'
// kontrolleri). İmam olmak için: 50 saygınlık, 0 şüphe. İmam maaşı günde
// 10.000 altın (manuel alınır, polis maaşı gibi). Görevler: günde 5 vakit
// ibadet + günde en az 1 nasihat — bunlardan biri eksikse dailyReset
// tarafından imamlıktan atılır (bkz. dailyReset).
// ---------------------------------------------------------------------------
const IMAM_SALARY = 10000;
const IMAM_REPUTATION_REQUIRED = 50;

export const applyForImam = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const imamRef = db.collection('imamState').doc('current');
  const imamMetaRef = db.collection('imamState').doc('meta');

  await db.runTransaction(async (tx) => {
    const [userSnap, imamSnap, metaSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(imamRef),
      tx.get(imamMetaRef),
    ]);
    const user = userSnap.data();
    if (!user) {
      throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    }
    if (imamSnap.exists) {
      throw new HttpsError('failed-precondition', 'Zaten bir imam var.');
    }
    if (metaSnap.data()?.lastFiredUid === uid) {
      throw new HttpsError(
        'failed-precondition',
        'İmamlıktan atıldığın için hemen tekrar başvuramazsın — yerine başka biri imam olup görevi bırakınca tekrar deneyebilirsin.'
      );
    }
    if (user.profession === 'polis' || user.pendingPoliceChange === 'apply') {
      throw new HttpsError(
        'failed-precondition',
        'Polis mesleğindeyken/başvurun beklerken imam olamazsın.'
      );
    }
    if ((user.reputation || 0) < IMAM_REPUTATION_REQUIRED) {
      throw new HttpsError(
        'failed-precondition',
        `İmam olmak için en az ${IMAM_REPUTATION_REQUIRED} saygınlığın olmalı.`
      );
    }
    if ((user.suspicion || 0) !== 0) {
      throw new HttpsError('failed-precondition', 'İmam olmak için şüphe puanın %0 olmalı.');
    }

    tx.set(imamRef, {
      uid,
      displayName: user.displayName || 'Oyuncu',
      avatar: user.avatar || null,
      lastNasihat: null,
      lastNasihatAt: null,
      becameImamAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(userRef, { profession: 'imam' });
  });

  return { ok: true };
});

export const giveNasihat = onCall(async (request) => {
  const uid = requireAuth(request);
  const text = String(request.data?.text || '').trim().slice(0, 280);
  if (!text) {
    throw new HttpsError('invalid-argument', 'Nasihat boş olamaz.');
  }
  const dateKey = istanbulDateKey();
  const imamRef = db.collection('imamState').doc('current');
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);

  const imamSnap = await imamRef.get();
  if (!imamSnap.exists || imamSnap.data().uid !== uid) {
    throw new HttpsError('permission-denied', 'İmam değilsin.');
  }
  await imamRef.update({
    lastNasihat: text,
    lastNasihatAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await dailyRef.set({ nasihatGiven: true }, { merge: true });
  return { ok: true };
});

export const claimImamSalary = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);
  const imamRef = db.collection('imamState').doc('current');

  await db.runTransaction(async (tx) => {
    const [dailySnap, imamSnap] = await Promise.all([tx.get(dailyRef), tx.get(imamRef)]);
    if (!imamSnap.exists || imamSnap.data().uid !== uid) {
      throw new HttpsError('permission-denied', 'İmam değilsin.');
    }
    if (dailySnap.data()?.imamSalaryClaimed) {
      throw new HttpsError('failed-precondition', 'Bugün maaşını zaten aldın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(IMAM_SALARY) });
    tx.set(dailyRef, { imamSalaryClaimed: true }, { merge: true });
  });

  return { ok: true };
});

export const becomeBeggar = onCall(async (request) => {
  const uid = requireAuth(request);
  const note = String(request.data?.note || '').slice(0, 140);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);
  const [userSnap, dailySnap] = await Promise.all([userRef.get(), dailyRef.get()]);
  const user = userSnap.data();
  if (dailySnap.data()?.beggarCapReached) {
    throw new HttpsError(
      'failed-precondition',
      'Bugün dilencilik kazanç sınırına zaten ulaştın, yarın tekrar deneyebilirsin.'
    );
  }
  const prices = await getCurrentPrices();
  const totalWealth = await computeTotalWealth(user, prices);
  if (totalWealth > BEGGAR_WEALTH_LIMIT) {
    throw new HttpsError(
      'failed-precondition',
      `Toplam servetin (${Math.floor(totalWealth).toLocaleString('tr-TR')} altın) ${BEGGAR_WEALTH_LIMIT.toLocaleString('tr-TR')} altını aştığı için dilenci olamazsın.`
    );
  }
  await db.collection('beggars').doc(dateKey).collection('entries').doc(uid).set({
    uid,
    displayName: user?.displayName || 'Oyuncu',
    avatar: user?.avatar || null,
    note,
    todayEarned: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  // Dilencilik saygınlığı sıfırlar — oyuncu bunu istemcide açıkça onaylamış
  // olmalı (bkz. frontend'deki onay penceresi).
  await userRef.update({ reputation: 0 });
  return { ok: true };
});

export const donateToBeggar = onCall(async (request) => {
  const uid = requireAuth(request);
  const { beggarUid } = request.data || {};
  const amount = Number(request.data?.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
  }
  if (beggarUid === uid) {
    throw new HttpsError('invalid-argument', 'Kendine bağış yapamazsın.');
  }
  const dateKey = istanbulDateKey();
  const beggarEntryRef = db.collection('beggars').doc(dateKey).collection('entries').doc(beggarUid);
  const beggarDailyRef = db.collection('dailyActions').doc(`${beggarUid}_${dateKey}`);
  const donorRef = db.collection('users').doc(uid);
  const beggarUserRef = db.collection('users').doc(beggarUid);

  await db.runTransaction(async (tx) => {
    const [donorSnap, beggarEntrySnap] = await Promise.all([
      tx.get(donorRef),
      tx.get(beggarEntryRef),
    ]);
    const donor = donorSnap.data();
    if (!beggarEntrySnap.exists) {
      throw new HttpsError('failed-precondition', 'Bu oyuncu bugün dilenci değil.');
    }
    const beggarEntry = beggarEntrySnap.data();
    if ((beggarEntry.todayEarned || 0) >= BEGGAR_DAILY_EARN_CAP) {
      throw new HttpsError('failed-precondition', 'Bu dilenci bugünkü kazanç sınırına ulaştı.');
    }
    if (!donor || (donor.gold || 0) < amount) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    const newEarned = (beggarEntry.todayEarned || 0) + amount;
    tx.update(donorRef, { gold: admin.firestore.FieldValue.increment(-amount) });
    tx.update(beggarUserRef, { gold: admin.firestore.FieldValue.increment(amount) });
    if (newEarned >= BEGGAR_DAILY_EARN_CAP) {
      // Sınıra ulaştı — dilenci listeden kaldırılır, bugün tekrar
      // dilenci olamaz.
      tx.delete(beggarEntryRef);
      tx.set(beggarDailyRef, { beggarCapReached: true }, { merge: true });
    } else {
      tx.update(beggarEntryRef, { todayEarned: newEarned });
    }
    tx.set(beggarUserRef.collection('messages').doc(), {
      text: `${donor.displayName || 'Bir oyuncu'} sana ${amount.toLocaleString('tr-TR')} altın bağışladı!`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'beggar_donation',
    });

  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// bribePolice — Karakol: günde 1 kez, 3000 altın, şüphe -20. Verilen her
// rüşvet, o günün polis maaş havuzuna eklenir (bkz. dailyReset 0.7 ve
// claimPoliceSalary) — polislerin artık sabit maaşı yok, sadece bu havuzu
// aralarında bölüşüyorlar.
// ---------------------------------------------------------------------------
const BRIBE_COST = 3000;

export const bribePolice = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);
  const bribePoolRef = db.collection('policeBribePool').doc(dateKey);

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
      suspicion: clampSuspicion((user.suspicion || 0) - 20),
    });
    tx.set(dailyRef, { bribed: true }, { merge: true });
    tx.set(bribePoolRef, { dateKey, bribeCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
  });

  return { ok: true };
});

// claimPoliceSalary — Karakol'da günde 1 kez; polisler artık sabit maaş
// almıyor, DÜNKÜ rüşvet havuzundan kendilerine düşen eşit payı alıyorlar
// (bkz. policeClaimPool/{dateKey}, dailyReset 0.7). Havuzdan pay almayan
// (bugün maaşını almayan) polis, günün sonunda hem bugünkü artan bonustan
// mahrum kalır hem de art arda 3. kez kaçırırsa otomatik atılır.
export const claimPoliceSalary = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const userRef = db.collection('users').doc(uid);
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);
  const poolRef = db.collection('policeClaimPool').doc(dateKey);

  let claimedShare = 0;
  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap, poolSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(dailyRef),
      tx.get(poolRef),
    ]);
    const user = userSnap.data();
    if (!user || user.profession !== 'polis') {
      throw new HttpsError('failed-precondition', 'Polis değilsin.');
    }
    if ((user.suspicion || 0) !== 0) {
      throw new HttpsError('failed-precondition', 'Maaş almak için şüphe puanın %0 olmalı.');
    }
    if (dailySnap.exists && dailySnap.data().policeSalaryClaimed) {
      throw new HttpsError('failed-precondition', 'Bugün zaten maaşını aldın.');
    }
    if (!poolSnap.exists) {
      throw new HttpsError('failed-precondition', 'Bugün için henüz maaş havuzu oluşmadı.');
    }
    const pool = poolSnap.data();
    if (!(pool.eligibleUids || []).includes(uid)) {
      throw new HttpsError('failed-precondition', 'Bugünkü havuza dahil değilsin.');
    }
    const share = pool.perOfficerShare || 0;
    claimedShare = share;
    const { goldDelta, debtDelta } = splitIncomeForDebt(user.debtToState, share);
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(goldDelta),
      debtToState: admin.firestore.FieldValue.increment(debtDelta),
    });
    tx.set(dailyRef, { policeSalaryClaimed: true, policeSalaryShare: share }, { merge: true });
    tx.update(poolRef, {
      claimedUids: admin.firestore.FieldValue.arrayUnion(uid),
      claimedTotal: admin.firestore.FieldValue.increment(share),
    });
  });

  return { ok: true, share: claimedShare };
});

// ---------------------------------------------------------------------------
// buyFromVendor — Seyyar Satıcı: her satıcının KENDİ günlük hakkı var
// (Kokoreçci, Simitçi, Dönerci, Köfteci birbirinden bağımsız), 1000 altın,
// şüphe -5, saygınlık +10.
// ---------------------------------------------------------------------------
const VENDOR_COST = 500;
// Not: Tüm seyyar satıcılarda alışveriş artık aynı fiyat (500 altın),
// bu yüzden özel bir eşleme gerekmiyor — VENDOR_COSTS boş bırakıldı,
// vendorCostFor() her zaman VENDOR_COST'a döner.
const VENDOR_COSTS = {};
function vendorCostFor(vendorId) {
  return VENDOR_COSTS[vendorId] ?? VENDOR_COST;
}

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
    const daily = dailySnap.data();
    if (daily?.vendorPurchases?.[vendorId]) {
      throw new HttpsError('failed-precondition', 'Bu satıcıdan bugün zaten alışveriş yaptın.');
    }
    if (daily?.heist?.[vendorId]) {
      throw new HttpsError(
        'failed-precondition',
        'Bu satıcıdan bugün haraç kestin, aynı gün alışveriş yapamazsın.'
      );
    }
    if (!user || (user.gold || 0) < vendorCostFor(vendorId)) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-vendorCostFor(vendorId)),
      suspicion: clampSuspicion((user.suspicion || 0) - 5),
      reputation: clamp(Math.round((user.reputation || 0) + 10), 0, 100),
    });
    tx.set(dailyRef, { vendorPurchases: { [vendorId]: true } }, { merge: true });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// attemptHeist — Bölüm 13/14 soygun sistemi (TEK BAŞINA).
// Kurallar:
//   - Polis mesleğindeki oyuncular soygun BAŞLATAMAZ (ne solo ne ekip
//     kurarak) — onların rolü sızmak, soymak değil.
//   - Güç yetersizse soygun hiç BAŞLAMAZ, şüphe artmaz. (Ekip kurulmalı.)
//   - Tek başınayken sızma riski yok (kimse yanında yok), AMA yakalanma
//     riski mevcut şüpheye bağlı: yakalanma ihtimali = şüphe yüzdesi.
//     Şüphen 0 ise yakalanma riskin de yoktur.
//   - Yakalanırsan: çalmaya çalıştığın TAM tutar (Bölüm 5/13) ceza olarak
//     kasaya gider — önce mevcut altınından kesilir, yetmezse kalanı
//     devlete borç yazılır (Bölüm 10).
//   - Başarılı olursan ödül, borç varsa Bölüm 10 kuralına göre (%50 borca,
//     %50 sana) bölüştürülür.
// ---------------------------------------------------------------------------
const HEIST_CONFIG = {
  banka: { suspicionCost: 50, reward: 500000, requiredPower: 100000 },
  casino: { suspicionCost: 40, reward: 250000, requiredPower: 70000 },
  araba_galerisi: { suspicionCost: 30, reward: 125000, requiredPower: 50000 },
  modifiye_garaji: { suspicionCost: 20, reward: 25000, requiredPower: 20000 },
  fabrika: { suspicionCost: 10, reward: 7500, requiredPower: 10000 },
  seyyar_satici_1: { suspicionCost: 5, reward: 2500, requiredPower: 4500 },
  seyyar_satici_2: { suspicionCost: 5, reward: 2000, requiredPower: 3000 },
  seyyar_satici_3: { suspicionCost: 5, reward: 1500, requiredPower: 1500 },
  seyyar_satici_4: { suspicionCost: 5, reward: 1000, requiredPower: 1000 },
};

// Yakalanma cezası: TAM tutar devlete BORÇ yazılır — cepten HİÇ kesilmez.
// Oyuncu Banka'dan istediği zaman, istediği miktarda öder; hiç ödemezse bile
// borç, kazandığı her paranın otomatik %50'siyle (splitIncomeForDebt) kendi
// kendine erir (Bölüm 10).
function applyCapturePenalty(amount) {
  return { debtAdded: amount };
}

async function sendCaptureSms(uid, penaltyAmount, newTotalDebt) {
  await db
    .collection('users')
    .doc(uid)
    .collection('messages')
    .add({
      text: `Yakalandın! ${penaltyAmount.toLocaleString('tr-TR')} altın devlete borç yazıldı. Toplam borcun: ${newTotalDebt.toLocaleString('tr-TR')} altın. Banka'dan istediğin an ödeyebilirsin; ödemesen bile borç bitene kadar kazandığın her paranın yarısına otomatik el konulacak.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'capture_penalty',
    });
}

async function getMaxWeaponPower(uid) {
  const snap = await db.collection('weapons').where('ownerId', '==', uid).get();
  let maxPower = 0;
  snap.forEach((d) => {
    maxPower = Math.max(maxPower, d.data().power || 0);
  });
  return maxPower;
}

export const attemptHeist = onCall(async (request) => {
  const uid = requireAuth(request);
  const { target } = request.data || {};
  const config = HEIST_CONFIG[target];
  if (!config) {
    throw new HttpsError('invalid-argument', 'Geçersiz soygun hedefi.');
  }

  const dateKey = istanbulDateKey();
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);
  const userRef = db.collection('users').doc(uid);

  const [dailySnap, userSnap0] = await Promise.all([dailyRef.get(), userRef.get()]);
  if (userSnap0.data()?.profession === 'polis' || userSnap0.data()?.pendingPoliceChange === 'apply') {
    throw new HttpsError('failed-precondition', 'Polis mesleğindeyken/başvurun beklerken soygun başlatamazsın.');
  }
  if (userSnap0.data()?.profession === 'imam') {
    throw new HttpsError('failed-precondition', 'İmam suç işleyemez.');
  }
  if (dailySnap.exists && dailySnap.data().heist?.[target]) {
    throw new HttpsError('failed-precondition', 'Bu hedefi bugün zaten denedin.');
  }
  if (dailySnap.exists && dailySnap.data().vendorPurchases?.[target]) {
    throw new HttpsError(
      'failed-precondition',
      'Bu satıcıdan bugün alışveriş yaptın, aynı gün haraç kesemezsin.'
    );
  }

  const maxPower = await getMaxWeaponPower(uid);
  if (maxPower < config.requiredPower) {
    // Soygun hiç başlamadı — şüphe kesinlikle artmaz.
    return {
      ok: true,
      started: false,
      reason: 'insufficient_power',
      requiredPower: config.requiredPower,
      yourPower: maxPower,
    };
  }

  // Soygun BAŞLADI — şüphe artık kesin artacak. Yakalanma ihtimali = şüphe %.
  let result = null;
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user) {
      throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    }
    const suspicion = user.suspicion || 0;
    const caught = Math.random() < suspicion / 100;
    const reward = config.reward;

    const updates = {
      suspicion: clampSuspicion(suspicion + config.suspicionCost),
      reputation: clampSuspicion((user.reputation || 0) - config.suspicionCost),
    };

    let newTotalDebt = user.debtToState || 0;
    if (caught) {
      const { debtAdded } = applyCapturePenalty(reward);
      updates.debtToState = admin.firestore.FieldValue.increment(debtAdded);
      newTotalDebt += debtAdded;
    } else {
      const { goldDelta, debtDelta } = splitIncomeForDebt(user.debtToState, reward);
      updates.gold = admin.firestore.FieldValue.increment(goldDelta);
      updates.debtToState = admin.firestore.FieldValue.increment(debtDelta);
    }

    tx.update(userRef, updates);
    tx.set(dailyRef, { heist: { [target]: true } }, { merge: true });

    result = { started: true, success: !caught, caught, reward, newTotalDebt };
  });

  if (result.caught) {
    await sendCaptureSms(uid, result.reward, result.newTotalDebt);
  }

  return { ok: true, ...result };
});

// =============================================================================
// FAZ 6 — DEPO, PARK VE LİMAN (KAÇAKÇILIK) SİSTEMİ
// =============================================================================

const CONTRABAND_PARK_SELL_PRICE = 5000; // Park'ta satış — şüphe +5 (kaynağı fark etmez)
const PARK_SUSPICION_COST = 5;

// ---------------------------------------------------------------------------
// sellContrabandToDepo — KAPATILDI. Yasaklı Madde artık Depo'ya
// satılamıyor; sadece 2. el satış sitesi (createListing/buyListing/
// instantSellListing) üzerinden alınıp satılabiliyor — orada herkesin
// (imamlar dahil) suç işlemeden serbestçe ticaret yapma hakkı var, hiçbir
// meslek kısıtlaması yok. Bu fonksiyon eski istemcilerden gelebilecek
// çağrıları güvenle reddetmek için burada duruyor.
// ---------------------------------------------------------------------------
export const sellContrabandToDepo = onCall(async () => {
  throw new HttpsError(
    'failed-precondition',
    'Bu satış kanalı kapatıldı. Yasaklı maddeni artık 2. el satış sitesinden satabilirsin.'
  );
});

// ---------------------------------------------------------------------------
// sellContrabandAtPark — riskli kanal, +5 şüphe (kaynağı fark etmez: ister
// kendin üret, ister Depo'dan al, Park'ta satmak her zaman şüphe artırır).
// ---------------------------------------------------------------------------
// sellContrabandAtPark — Park'ta yasaklı madde satışı, TEK SEFERDE 1 adet.
// Her satışta, o anki şüphe yüzdesi kadar ihtimalle polis tarafından
// yakalanma riski var (şüphe %40 ise %40 ihtimalle yakalanırsın).
// Yakalanırsan: mal yine elden gider ama kazanacağın altın YERİNE aynı
// miktar (5000) devlete borç yazılır — hiç cepten kesilmez, tamamı borca
// gider (Bölüm 10 kuralı). Yakalanmazsan normal şekilde kazanırsın.
export const sellContrabandAtPark = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('yasakliMadde');
  let outcome = null;

  await db.runTransaction(async (tx) => {
    const [invSnap, userSnap] = await Promise.all([tx.get(inventoryRef), tx.get(userRef)]);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < 1) {
      throw new HttpsError('failed-precondition', 'Yeterli malınız yok.');
    }
    const user = userSnap.data();
    if (user?.profession === 'polis' || user?.pendingPoliceChange === 'apply') {
      throw new HttpsError(
        'failed-precondition',
        'Polis mesleğindeyken/başvurun beklerken şüpheni artıracak hiçbir şey yapamazsın.'
      );
    }
    if (user?.profession === 'imam') {
      throw new HttpsError('failed-precondition', 'İmam suç işleyemez.');
    }

    const currentSuspicion = user.suspicion || 0;
    const currentReputation = user.reputation || 0;
    const caught = Math.random() * 100 < currentSuspicion;
    const newSuspicion = clampSuspicion(currentSuspicion + PARK_SUSPICION_COST);
    const newReputation = clampSuspicion(currentReputation - PARK_SUSPICION_COST);

    // Mal her durumda elden gider — satıldı ya da polis el koydu.
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-1) }, { merge: true });

    if (caught) {
      const newTotalDebt = (user.debtToState || 0) + CONTRABAND_PARK_SELL_PRICE;
      tx.update(userRef, {
        debtToState: newTotalDebt,
        suspicion: newSuspicion,
        reputation: newReputation,
      });
      outcome = { caught: true, penalty: CONTRABAND_PARK_SELL_PRICE, newTotalDebt };
    } else {
      const { goldDelta, debtDelta } = splitIncomeForDebt(
        user.debtToState,
        CONTRABAND_PARK_SELL_PRICE
      );
      tx.update(userRef, {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
        suspicion: newSuspicion,
        reputation: newReputation,
      });
      outcome = { caught: false, earned: CONTRABAND_PARK_SELL_PRICE };
    }
  });

  if (outcome.caught) {
    await sendCaptureSms(uid, outcome.penalty, outcome.newTotalDebt);
  }

  return { ok: true, ...outcome };
});

// ---------------------------------------------------------------------------
// placeLimanOrder — Liman'dan toplu/ucuz malzeme siparişi.
// Gemi 'departing' ya da 'loading' durumundaysa (gün 2-3, gemi diğer
// şehirde/yolda mal topluyor) sipariş DOĞRUDAN 'loaded' kovasına gider —
// gemi şehre döndüğünde (gün 1) teslim edilir. Gemi 'docking' ya da
// 'in_transit' durumundaysa (gün 1, 4) sipariş 'pending' kovasına gider —
// ancak gemi bir sonraki kez yola çıktığında (gün 2) 'loaded'a taşınır,
// yani teslimat bir tur daha gecikir (bkz. dailyReset).
// Miktar limiti yok — istediğin kadar sipariş verebilirsin.
// ---------------------------------------------------------------------------
const LIMAN_PRICES = { tamirMalzemesi: 8, silahUpgrade: 80, arabaGelistirme: 400, yasakliMadde: 2000 };

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
  const totalCost = unitPrice * qty;

  const dateKey = istanbulDateKey();
  const shipSnap = await db.collection('shipSchedule').doc(dateKey).get();
  const shipStatus = shipSnap.exists ? shipSnap.data().status : 'docking';
  const bucket = shipStatus === 'departing' || shipStatus === 'loading' ? 'loaded' : 'pending';

  const userRef = db.collection('users').doc(uid);
  const orderRef = db.collection('limanOrders').doc(uid);

  await db.runTransaction(async (tx) => {
    const [userSnap] = await Promise.all([tx.get(userRef)]);
    const user = userSnap.data();

    if (!user || (user.gold || 0) < totalCost) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }

    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-totalCost) });
    tx.set(
      orderRef,
      { [bucket]: { [materialType]: admin.firestore.FieldValue.increment(qty) } },
      { merge: true }
    );
  });

  return { ok: true, bucket };
});

// cancelLimanOrder — henüz teslim edilmemiş (loaded ya da pending
// kovasındaki) bir siparişi iptal edip parasını iade eder.
export const cancelLimanOrder = onCall(async (request) => {
  const uid = requireAuth(request);
  const { materialType } = request.data || {};
  if (!LIMAN_PRICES[materialType]) {
    throw new HttpsError('invalid-argument', 'Geçersiz malzeme.');
  }
  const unitPrice = LIMAN_PRICES[materialType];
  const userRef = db.collection('users').doc(uid);
  const orderRef = db.collection('limanOrders').doc(uid);

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError('failed-precondition', 'İptal edilecek sipariş yok.');
    }
    const order = orderSnap.data();
    const loadedQty = order.loaded?.[materialType] || 0;
    const pendingQty = order.pending?.[materialType] || 0;
    const totalQty = loadedQty + pendingQty;
    if (totalQty === 0) {
      throw new HttpsError('failed-precondition', 'Bu malzeme için bekleyen siparişin yok.');
    }
    const refund = totalQty * unitPrice;
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(refund) });
    tx.update(orderRef, {
      [`loaded.${materialType}`]: 0,
      [`pending.${materialType}`]: 0,
    });
  });

  return { ok: true };
});



// =============================================================================
// FAZ 7 — EKİP SOYGUN SİSTEMİ (Bölüm 13, 14)
// =============================================================================
//
// ÖNEMLİ — polislerin rolü "nöbet tutup engellemek" DEĞİL, "sızmak"tır:
//   - Polis mesleğindeki oyuncular kendi soygunlarını başlatamaz (attemptHeist
//     ve createHeistPlan bunu reddeder).
//   - Ama polis, BAŞKASININ kurduğu bir ekip soygun planına sivil gibi
//     katılabilir (joinHeistPlan'da hiçbir kısıtlama yok — bilerek).
//   - Plan yürütüldüğünde (executeHeistPlan), ekipteki HERKESİN gerçek
//     mesleği gizlice (sadece sunucuda, Admin SDK ile) kontrol edilir.
//     Aralarında polis varsa soygun "yakalanmış" sayılır:
//       * Soyguncular (polis olmayanlar) kazanacakları parayı DEVLETE BORÇ
//         olarak öderler (debtToState alanına eklenir, altın düşmez).
//       * Sızan polis(ler) engelledikleri parayı kendi aralarında bölüşür.
//     Ekipte hiç polis yoksa soygun normal şekilde başarılı olur, ödül
//     tüm katılımcılara eşit bölünür.
//   - Hiçbir zaman kimin polis olduğu diğer katılımcılara (ya da istemciye)
//     gösterilmez; users/{uid} zaten sadece sahibi tarafından okunabiliyor.
// =============================================================================

const HEIST_TARGETS = Object.keys(HEIST_CONFIG);
const HEIST_PLAN_MAX_PARTICIPANTS = 4;
const HEIST_PLAN_DURATION_MS = 24 * 60 * 60 * 1000;

// isAlreadyInActiveHeistPlanForTarget — bir oyuncunun (kurucu ya da
// katılımcı olarak) BELİRLİ BİR HEDEF için hâlâ açık bir ekip soygun
// planında olup olmadığını kontrol eder. Kısıtlama HEDEFE ÖZELDİR: aynı
// anda farklı hedeflerde (örn. hem Fabrika hem Garaj) ayrı ekiplerde
// olabilirsin, ama AYNI hedefte ikinci bir ekipte olamazsın.
async function isAlreadyInActiveHeistPlanForTarget(uid, target) {
  const openSnap = await db
    .collection('heistPlans')
    .where('status', '==', 'open')
    .where('target', '==', target)
    .get();
  for (const doc of openSnap.docs) {
    if (doc.data().creatorUid === uid) return true;
    const pSnap = await doc.ref.collection('participants').doc(uid).get();
    if (pSnap.exists) return true;
  }
  return false;
}

export const createHeistPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { target } = request.data || {};
  if (!HEIST_TARGETS.includes(target)) {
    throw new HttpsError('invalid-argument', 'Geçersiz soygun hedefi.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  if (user?.profession === 'polis' || user?.pendingPoliceChange === 'apply') {
    throw new HttpsError('failed-precondition', 'Polis mesleğindeyken/başvurun beklerken soygun planı kuramazsın.');
  }
  if (user?.profession === 'imam') {
    throw new HttpsError('failed-precondition', 'İmam suç işleyemez.');
  }
  if (await isAlreadyInActiveHeistPlanForTarget(uid, target)) {
    throw new HttpsError(
      'failed-precondition',
      'Bu hedefte zaten aktif bir ekip soygunundasın — önce ondan ayrılman/onu bitirmen gerekir.'
    );
  }

  const dateKey = istanbulDateKey();
  const dailySnap = await db.collection('dailyActions').doc(`${uid}_${dateKey}`).get();
  if (dailySnap.exists && dailySnap.data().heist?.[target]) {
    throw new HttpsError('failed-precondition', 'Bu hedefi bugün zaten denedin.');
  }
  if (dailySnap.exists && dailySnap.data().vendorPurchases?.[target]) {
    throw new HttpsError(
      'failed-precondition',
      'Bu satıcıdan bugün alışveriş yaptın, aynı gün haraç kesemezsin.'
    );
  }

  const myPower = await getMaxWeaponPower(uid);

  const planRef = db.collection('heistPlans').doc();
  await planRef.set({
    target,
    creatorUid: uid,
    status: 'open',
    note: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + HEIST_PLAN_DURATION_MS),
  });
  await planRef.collection('participants').doc(uid).set({
    uid,
    displayName: user?.displayName || 'Oyuncu',
    avatar: user?.avatar || null,
    weaponPower: myPower,
    suspicion: user?.suspicion || 0,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, planId: planRef.id };
});

// joinHeistPlan — KASITLI OLARAK meslek kontrolü yok. Polisler de dahil
// herkes katılabilir; bu, sızma mekaniğinin ta kendisi.
//
// Sızma uyarısı: bir polis plana katıldığında, plan SAHİBİNİN saygınlığına
// bağlı bir ihtimalle "içeride polis olabilir" diye esnaftan SMS gelir.
// İhtimal = saygınlık yüzdesi birebir (saygınlık 40 ise %40, 100 ise kesin).
// Bir kez başarılı uyarı gönderildiyse plan için tekrar gönderilmez.
// refreshHeistPlanParticipants — plan katılımcı listesindeki güç/şüphe
// alanları JOIN ANINDAKİ değerlerin donmuş (statik) bir kopyasıydı.
// Firestore güvenlik kuralları oyuncuların birbirinin users/{uid}
// dokümanını doğrudan okumasına izin vermediği için, plan görüntülenirken
// istemci bu fonksiyonu çağırır — Admin SDK ile HERKESİN güncel güç/şüphe
// değerlerini okuyup katılımcı alt dokümanlarına yazar, böylece canlı
// dinleyici (onSnapshot) güncel veriyi görür.
// updateHeistPlanNote — ekip soygun planına, katılımcıların birbirine
// kısa mesaj bırakabileceği paylaşımlı bir not. Tam bir sohbet değil,
// "şüphen düşmeden başlatma", "şu kişi polis olabilir" gibi kısa
// uyarılar için. Sadece plandaki katılımcılar (kurucu dahil) yazabilir.
export const updateHeistPlanNote = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId } = request.data || {};
  const note = String(request.data?.note || '').slice(0, 200);
  const planRef = db.collection('heistPlans').doc(planId);

  const [planSnap, participantSnap] = await Promise.all([
    planRef.get(),
    planRef.collection('participants').doc(uid).get(),
  ]);
  if (!planSnap.exists) {
    throw new HttpsError('failed-precondition', 'Plan bulunamadı.');
  }
  if (!participantSnap.exists) {
    throw new HttpsError('permission-denied', 'Bu planın bir katılımcısı değilsin.');
  }

  await planRef.update({
    note,
    noteUpdatedBy: participantSnap.data()?.displayName || 'Oyuncu',
    noteUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

export const refreshHeistPlanParticipants = onCall(async (request) => {
  requireAuth(request);
  const { planId } = request.data || {};
  const planRef = db.collection('heistPlans').doc(planId);
  const participantsSnap = await planRef.collection('participants').get();
  if (participantsSnap.empty) return { ok: true };

  const updates = await Promise.all(
    participantsSnap.docs.map(async (doc) => {
      const uid = doc.id;
      const [userSnap, power] = await Promise.all([
        db.collection('users').doc(uid).get(),
        getMaxWeaponPower(uid),
      ]);
      return { ref: doc.ref, suspicion: userSnap.data()?.suspicion || 0, power };
    })
  );

  const batch = db.batch();
  updates.forEach(({ ref, suspicion, power }) => {
    batch.update(ref, { suspicion, weaponPower: power });
  });
  await batch.commit();

  return { ok: true };
});

export const joinHeistPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId } = request.data || {};
  const planRef = db.collection('heistPlans').doc(planId);
  const planSnap = await planRef.get();
  if (!planSnap.exists || planSnap.data().status !== 'open') {
    throw new HttpsError('failed-precondition', 'Bu soygun planı artık açık değil.');
  }
  const plan = planSnap.data();
  if (plan.expiresAt && plan.expiresAt.toMillis() <= Date.now()) {
    await planRef.update({ status: 'expired' });
    throw new HttpsError('failed-precondition', 'Bu soygun planının 24 saatlik süresi doldu.');
  }
  if ((plan.removedUids || []).includes(uid)) {
    throw new HttpsError(
      'failed-precondition',
      'Bu ekipten ayrıldın/atıldın, tekrar katılamazsın.'
    );
  }
  if (plan.creatorUid !== uid && (await isAlreadyInActiveHeistPlanForTarget(uid, plan.target))) {
    throw new HttpsError(
      'failed-precondition',
      'Bu hedefte zaten aktif bir ekip soygunundasın — önce ondan ayrılman/onu bitirmen gerekir.'
    );
  }
  {
    const dateKey = istanbulDateKey();
    const dailySnap = await db.collection('dailyActions').doc(`${uid}_${dateKey}`).get();
    if (dailySnap.exists && dailySnap.data().heist?.[plan.target]) {
      throw new HttpsError(
        'failed-precondition',
        'Bu hedefi bugün zaten soydun (tek başına ya da ekiple) — aynı gün tekrar katılamazsın.'
      );
    }
    if (dailySnap.exists && dailySnap.data().vendorPurchases?.[plan.target]) {
      throw new HttpsError(
        'failed-precondition',
        'Bu satıcıdan bugün alışveriş yaptın, aynı gün haraç kesemezsin.'
      );
    }
  }

  const participantsSnap = await planRef.collection('participants').get();
  if (participantsSnap.size >= HEIST_PLAN_MAX_PARTICIPANTS) {
    throw new HttpsError('failed-precondition', 'Bu ekip zaten dolu (en fazla 4 kişi).');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  if (user?.profession === 'imam') {
    throw new HttpsError('failed-precondition', 'İmam suç işleyemez.');
  }
  const myPower = await getMaxWeaponPower(uid);
  const iAmPolice = user?.profession === 'polis';

  await planRef.collection('participants').doc(uid).set({
    uid,
    displayName: user?.displayName || 'Oyuncu',
    avatar: user?.avatar || null,
    weaponPower: myPower,
    suspicion: user?.suspicion || 0,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Şüphe uyarı sistemi (Bölüm 7 kullanıcı revizesi): saygınlık oranımıza
  // göre (örn %50 saygınlık = %50 ihtimal), KATILDIĞIMIZ ya da
  // KURDUĞUMUZ ekibe hâlihazırda bir polis sızmışsa YA DA az önce
  // sızdıysa, bunu (belli belirsiz) bir SMS ile öğrenebiliriz. Her
  // sivil kendi saygınlığına göre BAĞIMSIZ olarak "sezip sezmediğini"
  // dener; aynı sivil aynı plan için birden fazla kez uyarılmaz
  // (warnedUids).
  const warnedUids = new Set(plan.warnedUids || []);
  const existingProfessions = {}; // uid -> user verisi (sadece gerektiğinde çekilir)

  async function maybeWarn(targetUid) {
    if (targetUid === uid && iAmPolice) return; // polisin kendisini uyarmayız
    if (warnedUids.has(targetUid)) return;
    let targetUser = existingProfessions[targetUid];
    if (!targetUser) {
      const s = await db.collection('users').doc(targetUid).get();
      targetUser = s.data() || {};
      existingProfessions[targetUid] = targetUser;
    }
    if (targetUser.profession === 'polis') return; // polisi uyarmayız
    const reputation = targetUser.reputation || 0;
    if (Math.random() * 100 < reputation) {
      warnedUids.add(targetUid);
      await db
        .collection('users')
        .doc(targetUid)
        .collection('messages')
        .add({
          text: 'İçgüdülerin seni uyarıyor: bu ekipte tanımadığın/güvenmediğin biri olabilir. Dikkatli ol.',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          type: 'heist_warning',
          planId,
        });
    }
  }

  if (iAmPolice) {
    // Ben polisim ve az önce sızdım — plandaki MEVCUT sivillerin her biri
    // kendi saygınlığına göre bunu sezebilir.
    for (const doc of participantsSnap.docs) {
      if (doc.id === uid) continue;
      await maybeWarn(doc.id);
    }
  } else {
    // Ben sivilim — plana daha önce sızmış bir polis varsa, KENDİ
    // saygınlığıma göre bunu sezip sezemeyeceğimi dene.
    let alreadyHasPolice = false;
    for (const doc of participantsSnap.docs) {
      if (doc.id === uid) continue;
      const s = await db.collection('users').doc(doc.id).get();
      const u = s.data() || {};
      existingProfessions[doc.id] = u;
      if (u.profession === 'polis') {
        alreadyHasPolice = true;
        break;
      }
    }
    if (alreadyHasPolice) await maybeWarn(uid);
  }

  if (warnedUids.size > (plan.warnedUids || []).length) {
    await planRef.update({ warnedUids: Array.from(warnedUids) });
  }

  return { ok: true };
});

export const leaveHeistPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId } = request.data || {};
  const planRef = db.collection('heistPlans').doc(planId);
  await planRef.collection('participants').doc(uid).delete();
  // Çıkan oyuncu bu plana bir daha katılamaz.
  await planRef.update({ removedUids: admin.firestore.FieldValue.arrayUnion(uid) });
  return { ok: true };
});

export const kickFromHeistPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId, targetUid } = request.data || {};
  const planRef = db.collection('heistPlans').doc(planId);
  const planSnap = await planRef.get();
  if (!planSnap.exists || planSnap.data().creatorUid !== uid) {
    throw new HttpsError('permission-denied', 'Sadece planı kuran kişi katılımcı çıkarabilir.');
  }
  if (targetUid === uid) {
    throw new HttpsError(
      'invalid-argument',
      'Kendini çıkaramazsın, planı silmek için farklı bir yol gerekir.'
    );
  }
  await planRef.collection('participants').doc(targetUid).delete();
  // Atılan oyuncu bu plana bir daha katılamaz.
  await planRef.update({ removedUids: admin.firestore.FieldValue.arrayUnion(targetUid) });
  return { ok: true };
});

export const cancelHeistPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId } = request.data || {};
  const planRef = db.collection('heistPlans').doc(planId);
  const planSnap = await planRef.get();
  if (!planSnap.exists || planSnap.data().creatorUid !== uid) {
    throw new HttpsError('permission-denied', 'Sadece planı kuran kişi iptal edebilir.');
  }
  if (planSnap.data().status !== 'open') {
    throw new HttpsError('failed-precondition', 'Bu plan zaten sonuçlanmış.');
  }
  await planRef.update({ status: 'cancelled' });
  return { ok: true };
});

// executeHeistPlan — ekip gücü yeterliyse soygunu yürütür. Sonucu belirleyen
// TEK şey, ekipte sızmış polis olup olmadığıdır (bkz. dosya başındaki not).
export const executeHeistPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId } = request.data || {};
  const planRef = db.collection('heistPlans').doc(planId);
  const planSnap = await planRef.get();
  if (!planSnap.exists) {
    throw new HttpsError('failed-precondition', 'Plan bulunamadı.');
  }
  const plan = planSnap.data();
  if (plan.creatorUid !== uid) {
    throw new HttpsError('permission-denied', 'Sadece planı kuran kişi soygunu başlatabilir.');
  }
  if (plan.status !== 'open') {
    throw new HttpsError('failed-precondition', 'Bu plan zaten sonuçlanmış.');
  }

  const config = HEIST_CONFIG[plan.target];
  const participantsSnap = await planRef.collection('participants').get();
  const participants = participantsSnap.docs.map((d) => d.data());
  if (participants.length === 0) {
    throw new HttpsError('failed-precondition', 'Ekipte kimse yok.');
  }

  const totalPower = participants.reduce((sum, p) => sum + (p.weaponPower || 0), 0);
  if (totalPower < config.requiredPower) {
    // Soygun hiç başlamadı — kimsenin şüphesi/borcu değişmez.
    return {
      ok: true,
      started: false,
      reason: 'insufficient_power',
      requiredPower: config.requiredPower,
      totalPower,
    };
  }

  // Her katılımcının GERÇEK mesleğini gizlice kontrol et (sadece burada,
  // Admin SDK ile — hiçbir katılımcıya asla gösterilmez).
  const userSnaps = await Promise.all(
    participants.map((p) => db.collection('users').doc(p.uid).get())
  );
  const policeIdx = [];
  const civilianIdx = [];
  userSnaps.forEach((snap, i) => {
    if (snap.data()?.profession === 'polis') policeIdx.push(i);
    else civilianIdx.push(i);
  });

  const totalReward = config.reward;
  const dateKey = istanbulDateKey();
  const batch = db.batch();
  const captureSmsList = []; // { uid, penaltyAmount, newTotalDebt }
  const policeEarningSmsList = []; // { uid, amount }
  const successSmsList = []; // { uid, amount }

  // ADIM 1 — ÖNCE, polis hiç yokmuş GİBİ, her katılımcının KENDİ
  // şüphesine göre bağımsız bir yakalanma riski test edilir (yakalanma
  // ihtimali = o kişinin şüphe %'si). Katılımcılardan BİRİ bile böyle
  // yakalanırsa TÜM soygun şüpheden dolayı başarısız sayılır — bu
  // durumda ekipte sızmış bir polis olsa BİLE o ödül ALAMAZ (yakalanma
  // sebebi polis işi değil, şüphe olduğu için).
  const suspicions = userSnaps.map((s) => s.data()?.suspicion || 0);
  const caughtBySuspicion = suspicions.some((s) => Math.random() * 100 < s);
  const busted = !caughtBySuspicion && policeIdx.length > 0;

  if (caughtBySuspicion) {
    // Şüpheden yakalandılar. Ceza sadece SİVİLLERE uygulanır (varsa
    // sızmış polis bu turda ne ödül alır ne cezalandırılır — kimliği
    // hâlâ gizli kalır).
    const perCivilianPenalty =
      civilianIdx.length > 0 ? Math.floor(totalReward / civilianIdx.length) : 0;
    civilianIdx.forEach((i) => {
      const data = userSnaps[i].data();
      const currentSuspicion = data?.suspicion || 0;
      const currentReputation = data?.reputation || 0;
      const { debtAdded } = applyCapturePenalty(perCivilianPenalty);
      batch.update(db.collection('users').doc(participants[i].uid), {
        suspicion: clampSuspicion(currentSuspicion + config.suspicionCost),
        reputation: clampSuspicion(currentReputation - config.suspicionCost),
        debtToState: admin.firestore.FieldValue.increment(debtAdded),
      });
      captureSmsList.push({
        uid: participants[i].uid,
        penaltyAmount: perCivilianPenalty,
        newTotalDebt: (data?.debtToState || 0) + debtAdded,
      });
    });
  } else if (busted) {
    // ADIM 2 — Şüpheden yakalanmadılar AMA ekipte sızmış polis varsa,
    // polis artık YÜZDE YÜZ yakalar (kendi başarısı sayesinde), ödülü
    // tam alır; soyguncular aynı miktarı devlete BORÇ olarak öder (önce
    // mevcut altınlarından kesilir, yetmeyen kısım borca yazılır —
    // Bölüm 10).
    const perPoliceEarning = Math.floor(totalReward / policeIdx.length);
    const perCivilianPenalty =
      civilianIdx.length > 0 ? Math.floor(totalReward / civilianIdx.length) : 0;

    policeIdx.forEach((i) => {
      const currentDebt = userSnaps[i].data()?.debtToState || 0;
      const { goldDelta, debtDelta } = splitIncomeForDebt(currentDebt, perPoliceEarning);
      batch.update(db.collection('users').doc(participants[i].uid), {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
      policeEarningSmsList.push({ uid: participants[i].uid, amount: perPoliceEarning });
    });
    civilianIdx.forEach((i) => {
      const data = userSnaps[i].data();
      const currentSuspicion = data?.suspicion || 0;
      const currentReputation = data?.reputation || 0;
      const { debtAdded } = applyCapturePenalty(perCivilianPenalty);
      batch.update(db.collection('users').doc(participants[i].uid), {
        suspicion: clampSuspicion(currentSuspicion + config.suspicionCost),
        reputation: clampSuspicion(currentReputation - config.suspicionCost),
        debtToState: admin.firestore.FieldValue.increment(debtAdded),
      });
      captureSmsList.push({
        uid: participants[i].uid,
        penaltyAmount: perCivilianPenalty,
        newTotalDebt: (data?.debtToState || 0) + debtAdded,
      });
    });
  } else {
    // Ne şüpheden yakalandılar ne de ekipte polis var — soygun başarılı,
    // ödül tüm katılımcılara eşit bölünür. Herkese (sadece ekibi kuran
    // kişiye değil) SMS ile haber verilir.
    const perPersonAmount = Math.floor(totalReward / participants.length);
    participants.forEach((p, i) => {
      const data = userSnaps[i].data();
      const currentSuspicion = suspicions[i];
      const currentReputation = data?.reputation || 0;
      const { goldDelta, debtDelta } = splitIncomeForDebt(data?.debtToState, perPersonAmount);
      batch.update(db.collection('users').doc(p.uid), {
        suspicion: clampSuspicion(currentSuspicion + config.suspicionCost),
        reputation: clampSuspicion(currentReputation - config.suspicionCost),
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
      successSmsList.push({ uid: p.uid, amount: perPersonAmount });
    });
  }

  // Herkesin (polis dahil) o hedef için günlük hakkı bugün için tükenir.
  participants.forEach((p) => {
    const dailyRef = db.collection('dailyActions').doc(`${p.uid}_${dateKey}`);
    batch.set(dailyRef, { heist: { [plan.target]: true } }, { merge: true });
  });

  batch.update(planRef, {
    status: 'executed',
    result: { busted, caughtBySuspicion, totalReward },
  });
  await batch.commit();

  await Promise.all(
    captureSmsList.map((c) => sendCaptureSms(c.uid, c.penaltyAmount, c.newTotalDebt))
  );
  await Promise.all(
    policeEarningSmsList.map((p) =>
      db
        .collection('users')
        .doc(p.uid)
        .collection('messages')
        .add({
          text: `Sızdığın soygunu çökerttin! ${p.amount.toLocaleString('tr-TR')} altın ödül kazandın.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          type: 'police_bust_reward',
        })
    )
  );
  await Promise.all(
    successSmsList.map((s) =>
      db
        .collection('users')
        .doc(s.uid)
        .collection('messages')
        .add({
          text: `Katıldığın ekip soygunu başarılı oldu! Payına düşen ${s.amount.toLocaleString('tr-TR')} altın hesabına eklendi.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          type: 'heist_success',
        })
    )
  );

  return { ok: true, started: true, busted, caughtBySuspicion, totalReward };
});

// ---------------------------------------------------------------------------
// expireHeistPlans — Bölüm 13: "24 saat dolup güç yetmezse plan iptal
// olur." Saatte bir çalışıp süresi dolmuş 'open' planları 'expired' yapar.
// ---------------------------------------------------------------------------
export const expireHeistPlans = onSchedule({ schedule: 'every 60 minutes' }, async () => {
  const now = Date.now();
  // Tek eşitlik filtresi (status) — expiresAt karşılaştırması burada,
  // JS tarafında yapılıyor ki composite index gerekmesin (bkz. dailyReset
  // ile yaşadığımız orderBy('__name__') sorunu — aynı hatayı tekrarlamıyoruz).
  const openSnap = await db.collection('heistPlans').where('status', '==', 'open').get();
  const batch = db.batch();
  let any = false;
  openSnap.forEach((doc) => {
    const expiresAt = doc.data().expiresAt;
    if (expiresAt && expiresAt.toMillis() <= now) {
      batch.update(doc.ref, { status: 'expired' });
      any = true;
    }
  });
  if (any) await batch.commit();
});

// expireRaceRooms — 5 dakika boyunca rakip bulamayan (status='waiting')
// yarış odalarını otomatik iptal eder, kurucunun bahsini iade eder.
export const expireRaceRooms = onSchedule({ schedule: 'every 5 minutes' }, async () => {
  const now = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;
  const waitingSnap = await db.collection('raceRooms').where('status', '==', 'waiting').get();
  const refunds = [];
  waitingSnap.forEach((doc) => {
    const room = doc.data();
    const createdAtMs = room.createdAt?.toMillis?.() ?? 0;
    if (createdAtMs && now - createdAtMs >= FIVE_MIN) {
      refunds.push(
        db.collection('users').doc(room.creatorUid).update({
          gold: admin.firestore.FieldValue.increment(room.betAmount),
        }),
        doc.ref.update({ status: 'cancelled' })
      );
    }
  });
  if (refunds.length) await Promise.all(refunds);
});

// mergeLegacyMaterialListings — adet-fiyatlı/birleştirilebilir sisteme
// geçmeden ÖNCE açılmış (rastgele ID'li) eski malzeme ilanlarını, aynı
// satıcı+malzeme+adet fiyatına sahip canonical (deterministik ID'li)
// ilanla birleştirir. Yeni ilanlar zaten otomatik birleşiyor (bkz.
// createListing/instantSellListing); bu sadece GEÇMİŞTEKİ ilanlar için
// bir kerelik (ama her çağrıldığında güvenle tekrar çalışabilen) bir
// temizlik adımı — expireOldMarketplaceListings içinde her gün otomatik
// çalışır, istenirse runMergeLegacyMaterialListings ile hemen de
// tetiklenebilir.
async function mergeLegacyMaterialListings() {
  const openMaterialSnap = await db
    .collection('marketplaceListings')
    .where('itemType', '==', 'material')
    .where('sold', '==', false)
    .get();

  const groups = new Map();
  openMaterialSnap.forEach((doc) => {
    const d = doc.data();
    const unitPrice = d.unitPrice || Math.round((d.price || 0) / (d.quantity || 1));
    const canonicalId = `mat_${d.sellerId}_${d.materialType}_${unitPrice}`;
    if (doc.id === canonicalId) return; // zaten canonical, dokunma
    if (!groups.has(canonicalId)) groups.set(canonicalId, []);
    groups.get(canonicalId).push({ ref: doc.ref, data: d, unitPrice });
  });

  for (const [canonicalId, entries] of groups) {
    const canonicalRef = db.collection('marketplaceListings').doc(canonicalId);
    await db.runTransaction(async (tx) => {
      // Firestore kuralı: TÜM okumalar yazmalardan önce olmalı.
      const freshEntrySnaps = await Promise.all(entries.map((e) => tx.get(e.ref)));
      const canonicalSnap = await tx.get(canonicalRef);

      let addQty = 0;
      let addPrice = 0;
      freshEntrySnaps.forEach((snap, i) => {
        if (!snap.exists || snap.data().sold) return;
        const d = snap.data();
        const qty = d.quantity || 0;
        if (qty <= 0) return;
        addQty += qty;
        addPrice += entries[i].unitPrice * qty;
      });
      if (addQty <= 0) return;

      freshEntrySnaps.forEach((snap) => {
        if (snap.exists && !snap.data().sold) {
          tx.update(snap.ref, { sold: true, cancelled: true, mergedInto: canonicalId });
        }
      });

      if (canonicalSnap.exists && !canonicalSnap.data().sold) {
        tx.update(canonicalRef, {
          quantity: admin.firestore.FieldValue.increment(addQty),
          price: admin.firestore.FieldValue.increment(addPrice),
        });
      } else {
        const first = entries[0].data;
        tx.set(canonicalRef, {
          sellerId: first.sellerId,
          sellerName: first.sellerName,
          itemType: 'material',
          materialType: first.materialType,
          quantity: addQty,
          unitPrice: entries[0].unitPrice,
          price: addPrice,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sold: false,
        });
      }
    });
  }
}

// runMergeLegacyMaterialListings — mergeLegacyMaterialListings'i HEMEN
// (24 saatlik zamanlayıcıyı beklemeden) tetiklemek için — herhangi bir
// oturum açmış oyuncu bir kez çağırabilir, sonucu sadece ilan
// birleştirme, başka hiçbir veriyi etkilemiyor, zararsızdır.
export const runMergeLegacyMaterialListings = onCall(async (request) => {
  requireAuth(request);
  await mergeLegacyMaterialListings();
  return { ok: true };
});

// migrateArabaGelistirmeUnification — Depo Geliştirme Malzemesi ve Vites
// Geliştirme Malzemesi TEK malzemede ("arabaGelistirme" — Araba
// Geliştirme Malzemesi) birleştirildi. Bu, eski verideki her yeri
// (envanterler, fabrika makineleri, açık 2. el ilanları, Liman
// siparişleri) yeni birleşik malzemeye taşıyan BİR KERELİK ama güvenle
// tekrar tekrar çalıştırılabilen (idempotent) bir geçiş fonksiyonu.
// Herhangi bir oturum açmış oyuncu tetikleyebilir — sadece MEVCUT
// verileri yeniden düzenler, değer üretmez/yok etmez, zararsızdır.
async function runArabaGelistirmeMigration() {
  // 1) Envanterler.
  const usersSnap = await db.collection('users').get();
  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      const invRef = userDoc.ref.collection('inventory');
      const [depoSnap, vitesSnap] = await Promise.all([
        invRef.doc('depoUpgrade').get(),
        invRef.doc('vitesUpgrade').get(),
      ]);
      const depoQty = depoSnap.exists ? depoSnap.data().quantity || 0 : 0;
      const vitesQty = vitesSnap.exists ? vitesSnap.data().quantity || 0 : 0;
      if (depoQty <= 0 && vitesQty <= 0) return;
      const jobs = [
        invRef
          .doc('arabaGelistirme')
          .set(
            { quantity: admin.firestore.FieldValue.increment(depoQty + vitesQty) },
            { merge: true }
          ),
      ];
      if (depoSnap.exists) jobs.push(invRef.doc('depoUpgrade').delete());
      if (vitesSnap.exists) jobs.push(invRef.doc('vitesUpgrade').delete());
      await Promise.all(jobs);
    })
  );

  // 2) Fabrika makineleri.
  const factoriesSnap = await db.collection('factories').get();
  await Promise.all(
    factoriesSnap.docs.map(async (factoryDoc) => {
      const machinesSnap = await factoryDoc.ref.collection('machines').get();
      const jobs = [];
      machinesSnap.forEach((m) => {
        const type = m.data().type;
        if (type === 'depoUpgrade' || type === 'vitesUpgrade') {
          jobs.push(m.ref.update({ type: 'arabaGelistirme' }));
        }
      });
      await Promise.all(jobs);
    })
  );

  // 3) Açık 2. el malzeme ilanları — materialType'ı çevir, aynı satıcı +
  // adet fiyatına sahip olanları canonical ilanla birleştir.
  const oldListingsSnap = await db
    .collection('marketplaceListings')
    .where('itemType', '==', 'material')
    .where('sold', '==', false)
    .get();
  const groups = new Map();
  oldListingsSnap.forEach((doc) => {
    const d = doc.data();
    if (d.materialType !== 'depoUpgrade' && d.materialType !== 'vitesUpgrade') return;
    const unitPrice = d.unitPrice || Math.round((d.price || 0) / (d.quantity || 1));
    const canonicalId = `mat_${d.sellerId}_arabaGelistirme_${unitPrice}`;
    if (!groups.has(canonicalId)) groups.set(canonicalId, []);
    groups.get(canonicalId).push({ ref: doc.ref, data: d, unitPrice });
  });
  for (const [canonicalId, entries] of groups) {
    const canonicalRef = db.collection('marketplaceListings').doc(canonicalId);
    await db.runTransaction(async (tx) => {
      const freshEntrySnaps = await Promise.all(entries.map((e) => tx.get(e.ref)));
      const canonicalSnap = await tx.get(canonicalRef);
      let addQty = 0;
      let addPrice = 0;
      freshEntrySnaps.forEach((snap, i) => {
        if (!snap.exists || snap.data().sold) return;
        const d = snap.data();
        const qty = d.quantity || 0;
        if (qty <= 0) return;
        addQty += qty;
        addPrice += entries[i].unitPrice * qty;
      });
      if (addQty <= 0) return;
      freshEntrySnaps.forEach((snap) => {
        if (snap.exists && !snap.data().sold) {
          tx.update(snap.ref, { sold: true, cancelled: true, mergedInto: canonicalId });
        }
      });
      if (canonicalSnap.exists && !canonicalSnap.data().sold) {
        tx.update(canonicalRef, {
          quantity: admin.firestore.FieldValue.increment(addQty),
          price: admin.firestore.FieldValue.increment(addPrice),
        });
      } else {
        const first = entries[0].data;
        tx.set(canonicalRef, {
          sellerId: first.sellerId,
          sellerName: first.sellerName,
          itemType: 'material',
          materialType: 'arabaGelistirme',
          quantity: addQty,
          unitPrice: entries[0].unitPrice,
          price: addPrice,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sold: false,
        });
      }
    });
  }

  // 4) Liman (gemi) siparişleri.
  const ordersSnap = await db.collection('limanOrders').get();
  await Promise.all(
    ordersSnap.docs.map(async (orderDoc) => {
      const data = orderDoc.data();
      const pending = data.pending || {};
      const loaded = data.loaded || {};
      const pendingSum = (pending.depoUpgrade || 0) + (pending.vitesUpgrade || 0);
      const loadedSum = (loaded.depoUpgrade || 0) + (loaded.vitesUpgrade || 0);
      if (pendingSum <= 0 && loadedSum <= 0) return;
      const updates = {};
      if (pendingSum > 0) {
        updates['pending.arabaGelistirme'] = admin.firestore.FieldValue.increment(pendingSum);
      }
      if (loadedSum > 0) {
        updates['loaded.arabaGelistirme'] = admin.firestore.FieldValue.increment(loadedSum);
      }
      updates['pending.depoUpgrade'] = admin.firestore.FieldValue.delete();
      updates['pending.vitesUpgrade'] = admin.firestore.FieldValue.delete();
      updates['loaded.depoUpgrade'] = admin.firestore.FieldValue.delete();
      updates['loaded.vitesUpgrade'] = admin.firestore.FieldValue.delete();
      await orderDoc.ref.update(updates);
    })
  );
}

// Manuel (anlık) tetikleme için ince bir onCall sarmalayıcı — asıl işi
// runArabaGelistirmeMigration yapıyor, bu fonksiyon dailyReset içinden de
// (bkz. -1.5 bloğu) otomatik olarak çağrılıyor, frontend deploy'una
// bağımlı değil.
export const migrateArabaGelistirmeUnification = onCall(async (request) => {
  requireAuth(request);
  await runArabaGelistirmeMigration();
  return { ok: true };
});

// migrateVehicleWeaponLifeCap — araç/silah ömür TAVANI 50 günden 30 güne
// düşürüldü. Bu, sistemin ilk gününde (henüz 50 günlük tavana göre
// yaşlanmış) araç/silahların ömrünü 29 güne çeken bir kerelik ama güvenle
// tekrar çalıştırılabilen (idempotent) bir geçiş. SADECE 29'dan FAZLA
// ömrü olanları düşürür — zaten 29 ya da altında olanlara dokunmaz. Her
// oturum açmış oyuncu tetikleyebilir, zararsızdır (sadece aşırı yüksek
// ömür değerlerini yeni tavana çeker).
const LIFE_CAP_MIGRATION_TARGET = 29;

async function runVehicleWeaponLifeCapMigration() {
  for (const collName of ['vehicles', 'weapons']) {
    const snap = await db.collection(collName).get();
    const jobs = [];
    snap.forEach((docSnap) => {
      const item = docSnap.data();
      let life = item.lifeDays;
      let capped = false;
      if (typeof life === 'number' && life > LIFE_CAP_MIGRATION_TARGET) {
        life = LIFE_CAP_MIGRATION_TARGET;
        capped = true;
      } else if (life === undefined) {
        // Ömür alanı hiç yoksa (çok eski kayıt), eski tavan (50) sayılırdı
        // — yeni tavana göre 29'a çekiyoruz.
        life = LIFE_CAP_MIGRATION_TARGET;
        capped = true;
      }
      if (capped) {
        jobs.push(docSnap.ref.update({ lifeDays: life }));
      }
      // Listedeyse, ilandaki DONMUŞ ömür alanını da güncel değere
      // eşitle — bazı ilanlarda ömür hiç azalmıyormuş gibi görünen
      // bilinen hatayı da bu vesileyle düzeltiyoruz (bkz. dailyReset).
      if (item.listed) {
        jobs.push(
          (async () => {
            const listingSnap = await db
              .collection('marketplaceListings')
              .where(collName === 'vehicles' ? 'vehicleId' : 'weaponId', '==', docSnap.id)
              .where('sold', '==', false)
              .limit(1)
              .get();
            if (!listingSnap.empty) {
              const lifeField = collName === 'vehicles' ? 'vehicleLifeDays' : 'weaponLifeDays';
              const current = listingSnap.docs[0].data()[lifeField];
              if (current !== life) {
                await listingSnap.docs[0].ref.update({ [lifeField]: life });
              }
            }
          })()
        );
      }
    });
    await Promise.all(jobs);
  }
}

// Manuel (anlık) tetikleme için ince bir onCall sarmalayıcı — asıl işi
// runVehicleWeaponLifeCapMigration yapıyor, bu fonksiyon dailyReset
// içinden de (bkz. -1.5 bloğu) otomatik olarak çağrılıyor, frontend
// deploy'una bağımlı değil.
export const migrateVehicleWeaponLifeCap = onCall(async (request) => {
  requireAuth(request);
  await runVehicleWeaponLifeCapMigration();
  return { ok: true };
});


// expireOldMarketplaceListings — 7 gündür satılmayan 2. el ilanlarını
// otomatik kaldırır, ürünü/malzemeyi/makineyi sahibine iade eder
// (cancelListing ile birebir aynı iade mantığı), satıcıya SMS atar.
// Her çalıştığında ayrıca mergeLegacyMaterialListings'i de çalıştırır.
export const expireOldMarketplaceListings = onSchedule({ schedule: 'every 24 hours' }, async () => {
  await mergeLegacyMaterialListings();

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const openSnap = await db.collection('marketplaceListings').where('sold', '==', false).get();

  const jobs = [];
  openSnap.forEach((doc) => {
    const listing = doc.data();
    const createdAtMs = listing.createdAt?.toMillis?.() ?? 0;
    if (!createdAtMs || now - createdAtMs < SEVEN_DAYS_MS) return;

    jobs.push(
      (async () => {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(doc.ref);
          if (!snap.exists || snap.data().sold) return;
          const l = snap.data();
          const isSystemListing = l.sellerId === 'system';

          if (isSystemListing) {
            // "Sistem" ilanı (anında satış sonrası oyunun açtığı ilan) —
            // kimse almazsa ürün geri iade EDİLMEZ (asıl satıcı zaten
            // anında ödemesini almıştı), araç/silah kalıcı olarak silinir.
            if (l.itemType === 'vehicle') {
              tx.delete(db.collection('vehicles').doc(l.vehicleId));
            } else if (l.itemType === 'weapon') {
              tx.delete(db.collection('weapons').doc(l.weaponId));
            }
            // material/machine için zaten geri verilecek bir sahip yok —
            // hiçbir şey yapmadan sadece ilan kapatılır.
            tx.update(doc.ref, { sold: true, cancelled: true, expiredAutomatically: true });
            return;
          }

          if (l.itemType === 'vehicle') {
            tx.update(db.collection('vehicles').doc(l.vehicleId), { listed: false });
          } else if (l.itemType === 'weapon') {
            tx.update(db.collection('weapons').doc(l.weaponId), { listed: false });
          } else if (l.itemType === 'material') {
            const inventoryRef = db
              .collection('users')
              .doc(l.sellerId)
              .collection('inventory')
              .doc(l.materialType);
            tx.set(
              inventoryRef,
              { quantity: admin.firestore.FieldValue.increment(l.quantity) },
              { merge: true }
            );
          } else if (l.itemType === 'machine') {
            const sellerMachinesRef = db.collection('factories').doc(l.sellerId).collection('machines');
            tx.set(sellerMachinesRef.doc(), {
              type: l.machineType,
              workerId: null,
              workerName: null,
              lastProducedDateKey: null,
              lastProducedQty: 0,
              purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          tx.update(doc.ref, { sold: true, cancelled: true, expiredAutomatically: true });
          tx.set(db.collection('users').doc(l.sellerId).collection('messages').doc(), {
            text: '7 gündür satılmayan bir ilanın otomatik kaldırıldı, ürünün sana iade edildi.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            type: 'listing_expired',
          });
        });
      })()
    );
  });

  if (jobs.length) await Promise.all(jobs);
});

// ---------------------------------------------------------------------------
// markMessageRead — SMS gelen kutusundaki bir mesajı okundu olarak işaretler.
// ---------------------------------------------------------------------------
export const markMessageRead = onCall(async (request) => {
  const uid = requireAuth(request);
  const { messageId } = request.data || {};
  await db.collection('users').doc(uid).collection('messages').doc(messageId).update({
    read: true,
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// sendChatMessage — Telefon > ChatsApp. Tüm oyuncuların ortak kullandığı
// tek genel sohbet kanalı.
// ---------------------------------------------------------------------------
const CHAT_MAX_LENGTH = 300;

export const sendChatMessage = onCall(async (request) => {
  const uid = requireAuth(request);
  const text = String(request.data?.text || '').trim();
  if (!text) {
    throw new HttpsError('invalid-argument', 'Mesaj boş olamaz.');
  }
  if (text.length > CHAT_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `Mesaj en fazla ${CHAT_MAX_LENGTH} karakter olabilir.`);
  }
  const userSnap = await db.collection('users').doc(uid).get();
  const displayName = userSnap.data()?.displayName || 'Oyuncu';
  const avatar = userSnap.data()?.avatar || null;

  await db.collection('globalChat').add({
    uid,
    displayName,
    avatar,
    text,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// setDisplayName — Ev'de oyuncunun kendi belirlediği, benzersiz oyun içi
// isim. usernames/{lowercaseName} dokümanı rezervasyon için kullanılır;
// aynı ismi sadece tek kişi alabilir. Eski isim varsa serbest bırakılır.
// ---------------------------------------------------------------------------
export const setDisplayName = onCall(async (request) => {
  const uid = requireAuth(request);
  const raw = String(request.data?.displayName || '').trim();
  if (raw.length < 3 || raw.length > 20) {
    throw new HttpsError('invalid-argument', 'İsim 3-20 karakter arasında olmalı.');
  }
  if (!/^[a-zA-Z0-9ğüşöçıİĞÜŞÖÇ_ ]+$/.test(raw)) {
    throw new HttpsError('invalid-argument', 'İsim geçersiz karakterler içeriyor.');
  }
  const key = raw.toLocaleLowerCase('tr-TR');
  const userRef = db.collection('users').doc(uid);
  const newNameRef = db.collection('usernames').doc(key);

  await db.runTransaction(async (tx) => {
    const [userSnap, newNameSnap] = await Promise.all([tx.get(userRef), tx.get(newNameRef)]);
    const user = userSnap.data();
    if (newNameSnap.exists && newNameSnap.data().uid !== uid) {
      throw new HttpsError('already-exists', 'Bu isim zaten alınmış.');
    }
    const oldNameKey = user?.displayNameKey;
    if (oldNameKey && oldNameKey !== key) {
      tx.delete(db.collection('usernames').doc(oldNameKey));
    }
    tx.set(newNameRef, { uid });
    tx.update(userRef, { displayName: raw, displayNameKey: key });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// setAvatar — Profil'de oluşturulan avatarı kaydeder. Tüm alanlar
// AVATAR_OPTIONS'a (enum) ya da hex renk formatına karşı doğrulanır — bu
// veri daha sonra ham SVG markup'ına gömüleceği için (bkz. client
// avatarShapes.js) enjeksiyon riskine karşı sıkı doğrulama şart.
// ---------------------------------------------------------------------------
const AVATAR_ENUM_OPTIONS = {
  gender: ['erkek', 'kadin'],
  build: ['zayif', 'standart', 'iri'],
  faceShape: ['oval', 'round', 'square', 'heart', 'long', 'diamond'],
  hairStyle: [
    'kel', 'short', 'slick', 'wavy', 'long', 'mohawk', 'afro', 'bun', 'braids', 'undercut',
    'ponytail', 'curly', 'pixie',
  ],
  eyebrowShape: ['straight', 'arched', 'thick', 'thin', 'angled', 'unibrow'],
  eyeShape: ['almond', 'round', 'narrow', 'wide', 'hooded', 'downturned'],
  eyelash: ['none', 'natural', 'long', 'dramatic'],
  noseShape: ['small', 'straight', 'wide', 'button', 'aquiline', 'flat'],
  mouthShape: ['neutral', 'smile', 'smirk', 'full', 'thin', 'open'],
  facialHair: ['none', 'mustache', 'goatee', 'short', 'full', 'sideburns', 'vandyke', 'chinstrap', 'horseshoe'],
  faceAcc: ['none', 'sunglasses', 'scar', 'cigar', 'eyepatch', 'mask', 'monocle', 'freckles', 'piercing'],
  earring: ['yok', 'sol', 'sag', 'cift'],
  tattoo: ['yok', 'gozyasi', 'yildiz', 'boyunsembol', 'boyunyazi', 'yuzsembol', 'kolyazi'],
  clothing: ['suit', 'tuxedo', 'leather', 'hawaii', 'jumpsuit', 'hoodie', 'police', 'vest', 'tanktop', 'trenchcoat'],
  neckAcc: ['none', 'tie', 'bow', 'chain', 'scarf', 'dogtag'],
  hat: [
    'none', 'fedora', 'beret', 'bandana', 'cap', 'crown', 'tophat', 'hoodup', 'helmet',
    'policecap', 'beanie', 'headband',
  ],
  heldItem: ['yok', 'tabanca', 'bicak', 'sopa', 'para', 'canta', 'telefon', 'kadeh'],
};
const AVATAR_COLOR_FIELDS = ['skin', 'eyeColor', 'hairColor', 'clothColor', 'hatColor', 'lipColor', 'background'];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const setAvatar = onCall(async (request) => {
  const uid = requireAuth(request);
  const input = request.data?.avatar || {};
  const avatar = {};

  for (const [field, allowed] of Object.entries(AVATAR_ENUM_OPTIONS)) {
    const v = input[field];
    if (!allowed.includes(v)) {
      throw new HttpsError('invalid-argument', `Geçersiz avatar alanı: ${field}`);
    }
    avatar[field] = v;
  }
  for (const field of AVATAR_COLOR_FIELDS) {
    const v = input[field];
    if (typeof v !== 'string' || !HEX_COLOR_RE.test(v)) {
      throw new HttpsError('invalid-argument', `Geçersiz avatar rengi: ${field}`);
    }
    avatar[field] = v;
  }

  await db.collection('users').doc(uid).update({ avatar });
  return { ok: true };
});

// =============================================================================
// FAZ 9 — YARIŞ PİSTİ (Bölüm 8.7)
// =============================================================================
//
// Kurallar (master promptan birebir):
//   - Pist 500 kare. Oyuncular 1. viteste başlar, vites = atılacak zar sayısı.
//   - Başlangıç: 50 (yarış-içi) altın. Her 1 kare ilerleme = +1 altın, -1 benzin.
//   - Her 100 kareyi geçince ekstra +50 altın.
//   - 500. kareyi ilk tamamlayan kazanır. Aynı turda ikisi de bitirirse berabere.
//   - Her 10 karede istasyon: benzin 10 altın (tam doldur), tekerlek +1 adım/zar
//     kalıcı 20 altın, benzin tasarrufu +1 benzin/zar kalıcı 30 altın.
//   - İstasyon dışı benzin: 100 altın, tam dolum.
//   - Nitro: 20 altın, o elde zarı x2 yapar. Turbo: araca özel, ücretsiz,
//     elde envanterdeki turbo sayısı kadar kullanılabilir, aynı etki.
//   - Her tur 10 saniye; ikisi de attığında ya da süre dolunca tur kapanır.
//   - Zar 6 yüzeyli standart zar kabul edildi (promptta belirtilmemişti).
// =============================================================================

// =============================================================================
// FAZ 9 — YARIŞ PİSTİ (Bölüm 8.7) — TAMAMEN BAĞIMSIZ KİŞİSEL SAYAÇ MODELİ
// =============================================================================
//
// ÖNEMLİ TASARIM KARARI: Yarış, iki oyuncunun SIRAYLA/EŞ ZAMANLI tur
// paylaştığı bir sistem DEĞİL. Her oyuncunun KENDİ 10 saniyelik sayacı var;
// süre dolunca (rakibi beklemeden) otomatik zar atılır. Bu sayede:
//   - Bir oyuncu hiç zar atmasa bile (uygulamayı kapatsa bile) sayacı
//     otomatik işlemeye devam eder — biri her türlü yarışı bitirir.
//   - Kazanma kontrolü HER zar atışından hemen sonra yapılır (bekleme yok).
//   - "Beraberlik" kavramı yok — kim 500'e önce ulaşırsa kazanır.
//   - Benzini biten oyuncu O ANDA yarışı kaybeder (rakip otomatik kazanır).
// Kurallar (master promptan birebir):
//   - Pist 500 kare. Oyuncular 1. viteste başlar, vites = atılacak zar sayısı.
//   - Başlangıç: 50 (yarış-içi) altın. Her 1 kare ilerleme = +1 altın, -1 benzin.
//   - Her 100 kareyi geçince ekstra +50 altın.
//   - Her 10 karede istasyon: benzin 10 altın (tam doldur), tekerlek +1 adım/zar
//     kalıcı 20 altın, benzin tasarrufu +1 benzin/zar kalıcı 30 altın.
//   - İstasyon dışı benzin: HER ZAMAN 100 altın, tam dolum.
//   - Nitro: 20 altın, o elde zarı x2 yapar. Turbo: araca özel, ücretsiz,
//     elde envanterdeki turbo sayısı kadar kullanılabilir, aynı etki.
//   - Zar 6 yüzeyli standart zar kabul edildi (promptta belirtilmemişti).
// =============================================================================

// =============================================================================
// FAZ 9 — YARIŞ PİSTİ (SIRA TABANLI MODEL — Kullanıcı revizesi)
// =============================================================================
//
// KURALLAR (birebir):
//   - 2 oyuncu SIRAYLA oynar. Her oyuncunun hamle (zar atma) için 10 saniyesi
//     var. Zar atıldığı an sıra HEMEN karşı tarafa geçer.
//   - Pist 300 kare. 300. kareyi ilk geçen kazanır — AMA "adalet kuralı":
//     eğer ilk başlayan oyuncu (1. Oyuncu / oda kurucusu) bitirirse, 2.
//     Oyuncuya SON bir hamle hakkı verilir. O hamlede de bitirirse
//     BERABERE — bahisler iade edilir. 2. Oyuncu kendi sırasında (adalet
//     hamlesi olmadan) bitirirse yarış hemen biter, o kazanır.
//   - Vites = zar sayısı. 1. TUR: iki oyuncu da SADECE 1 zar atar (vites
//     zorla 1). 2. turdan itibaren her oyuncu kendi sırasında vitesini en
//     fazla 1 artırabilir/azaltabilir (aracın vites kapasitesiyle sınırlı).
//   - Başlangıç: 50 (yarış-içi) altın. Her kare +1 altın, -1 benzin. Her
//     100 kare +50 altın bonus. Benzin 0 olan ANINDA kaybeder.
//   - Her 10 karede istasyon: tam üstüne denk gelirse 10 altına doldurur.
//     İstasyon dışı, HER ZAMAN 100 altına doldurabilir.
//   - Nitro: 20 altın, o el zarın 2 katı. Turbo: araca özel, ücretsiz,
//     sınırlı kullanım, aynı etki. İKİSİ BİRDEN aktifse (kombo): 3 KATI.
//   - Oda kurulunca yarış OTOMATİK başlamaz — katılan biri olunca kurucu
//     "Yarışı Başlat" demeden yarış başlamaz; kurucu istemediği rakibi
//     reddedip odayı tekrar açabilir.
// =============================================================================

const RACE_TRACK_LENGTH = 300;
const RACE_TURN_SECONDS = 10;
const RACE_STATION_PRICES = { refuel: 10 };
const RACE_OFFSITE_FUEL_PRICE = 100;
const RACE_NITRO_PRICE = 50;
// Şampiyona ödülü, aracın galeri satış fiyatının 1/10'u.
const CHAMPIONSHIP_REWARD_RATIO = 0.1;

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

async function getVehicleForRace(uid, vehicleId) {
  const vSnap = await db.collection('vehicles').doc(vehicleId).get();
  if (!vSnap.exists || vSnap.data().ownerId !== uid) {
    throw new HttpsError('failed-precondition', 'Bu araç size ait değil.');
  }
  const vehicle = vSnap.data();
  const lifeDays = vehicle.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
  if (!(lifeDays > 0)) {
    throw new HttpsError(
      'failed-precondition',
      'Bu aracın ömrü bitmiş. Yarışa katılmadan önce tamir ettirmelisin.'
    );
  }
  return vehicle;
}

function freshRacePlayerState(displayName, vehicleId, vehicle) {
  const maxFuel = (vehicle.baseTank || 0) + (vehicle.tankBonus || 0);
  return {
    displayName,
    vehicleId,
    vehicleModel: vehicle.model,
    maxGear: vehicle.gearLevel || 1,
    turboTotal: vehicle.turboCount || 0,
    position: 0,
    gear: 1,
    gearAtTurnStart: 1,
    fuel: maxFuel,
    maxFuel,
    raceGold: 50,
    wheelBonus: 0,
    fuelSavingBonus: 0,
    nitroActive: false,
    turboCount: vehicle.turboCount || 0,
    hasRolledOnce: false,
    lastRollSteps: null,
    lastRollSum: null,
    lastRollMultiplier: null,
    finished: false,
    lostByFuel: false,
  };
}

function requirePlayerInRoom(room, uid) {
  const me = room.players?.[uid];
  if (!me) {
    throw new HttpsError('failed-precondition', 'Bu odada değilsin.');
  }
  return me;
}

// performRoll — vites (ya da 1. turda zorla 1) kadar zar atar. Nitro/turbo
// tek başına x2, ikisi birden (kombo) x3.
function performRoll(me, { useNitro = false, useTurbo = false } = {}) {
  const diceCount = me.hasRolledOnce ? me.gear : 1;
  const diceValues = [];
  let stepSum = 0;
  for (let i = 0; i < diceCount; i++) {
    const v = rollDie();
    diceValues.push(v);
    stepSum += v;
  }

  const nitroUsed = Boolean(useNitro && me.nitroActive);
  const turboUsed = Boolean(useTurbo && me.turboCount > 0);
  let multiplier = 1;
  if (nitroUsed && turboUsed) multiplier = 3;
  else if (nitroUsed || turboUsed) multiplier = 2;
  const boost = nitroUsed && turboUsed ? 'combo' : nitroUsed ? 'nitro' : turboUsed ? 'turbo' : null;

  const rolledSteps = stepSum * multiplier + me.wheelBonus;
  const actualSteps = Math.min(rolledSteps, Math.max(me.fuel, 0));
  const beforePos = me.position;
  const afterPos = Math.min(beforePos + actualSteps, RACE_TRACK_LENGTH);
  const movedSteps = afterPos - beforePos;

  let goldEarned = movedSteps;
  const beforeMilestone = Math.floor(beforePos / 100);
  const afterMilestone = Math.floor(afterPos / 100);
  if (afterMilestone > beforeMilestone) {
    goldEarned += (afterMilestone - beforeMilestone) * 50;
  }

  const newFuel = Math.min(Math.max(0, me.fuel - movedSteps) + me.fuelSavingBonus, me.maxFuel);

  return {
    updated: {
      ...me,
      position: afterPos,
      fuel: newFuel,
      raceGold: me.raceGold + goldEarned,
      lastRollSteps: movedSteps,
      lastRollSum: stepSum,
      lastRollDice: diceValues,
      lastRollMultiplier: multiplier,
      lastRollBoost: boost,
      finished: afterPos >= RACE_TRACK_LENGTH,
      nitroActive: nitroUsed ? false : me.nitroActive,
      turboCount: turboUsed ? me.turboCount - 1 : me.turboCount,
      hasRolledOnce: true,
      gearAtTurnStart: me.gear,
    },
    stepSum,
    multiplier,
    movedSteps,
    goldEarned,
  };
}

// Yarışı ödemeyle kapatır: kazanana bahis havuzu (ya da berabere ise her
// ikisine kendi bahsi), herkese kendi yarış-içi altını.
// Yarış-içi altın (raceGold) SADECE yarış sırasında geçerli bir kaynak —
// yarış bitince gerçek bakiyeye hiç aktarılmaz. Kazanan sadece bahis
// havuzunu (pot) alır, berabere olursa herkes kendi bahsini geri alır.
function finalizeRace({ tx, roomRef, room, winnerUid, players, userRefs, userSnaps }) {
  const pot = room.betAmount;
  const uids = Object.keys(players);

  uids.forEach((u) => {
    let amount = 0;
    if (winnerUid === 'draw') {
      amount = pot; // kendi bahsini geri al
    } else if (winnerUid === u) {
      amount = pot * 2; // ortadaki bahsin tamamı
    }
    if (amount > 0) {
      const { goldDelta, debtDelta } = splitIncomeForDebt(userSnaps[u]?.data()?.debtToState, amount);
      tx.update(userRefs[u], {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
    }
  });

  const playerUpdates = {};
  uids.forEach((u) => {
    playerUpdates[`players.${u}`] = players[u];
  });

  tx.update(roomRef, {
    status: 'finished',
    winnerUid,
    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...playerUpdates,
  });
}

// ---------------------------------------------------------------------------
// createRaceRoom — oda kurar (status: 'waiting', rakip yok).
// ---------------------------------------------------------------------------
export const createRaceRoom = onCall(async (request) => {
  const uid = requireAuth(request);
  const { vehicleId, betAmount } = request.data || {};
  const amount = Number(betAmount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz bahis miktarı.');
  }
  const vehicle = await getVehicleForRace(uid, vehicleId);

  const userRef = db.collection('users').doc(uid);
  const roomRef = db.collection('raceRooms').doc();

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user || (user.gold || 0) < amount) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-amount) });
    tx.set(roomRef, {
      status: 'waiting',
      betAmount: amount,
      creatorUid: uid,
      participantUids: [uid],
      currentTurnUid: null,
      turnDeadline: null,
      finalTurnFor: null,
      winnerUid: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      players: {
        [uid]: freshRacePlayerState(user.displayName || 'Oyuncu', vehicleId, vehicle),
      },
    });
  });

  return { ok: true, roomId: roomRef.id };
});

// cancelRaceRoom — kurucu, henüz rakip yokken odayı iptal eder.
export const cancelRaceRoom = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
    const room = roomSnap.data();
    if (room.creatorUid !== uid || room.status !== 'waiting') {
      throw new HttpsError('failed-precondition', 'Bu oda iptal edilemez.');
    }
    tx.update(db.collection('users').doc(uid), {
      gold: admin.firestore.FieldValue.increment(room.betAmount),
    });
    tx.update(roomRef, { status: 'cancelled' });
  });

  return { ok: true };
});

// joinRaceRoom — rakip katılır AMA yarış otomatik başlamaz (status:'ready').
export const joinRaceRoom = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId, vehicleId } = request.data || {};
  const vehicle = await getVehicleForRace(uid, vehicleId);
  const roomRef = db.collection('raceRooms').doc(roomId);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const [roomSnap, userSnap] = await Promise.all([tx.get(roomRef), tx.get(userRef)]);
    if (!roomSnap.exists || roomSnap.data().status !== 'waiting') {
      throw new HttpsError('failed-precondition', 'Bu oda artık açık değil.');
    }
    const room = roomSnap.data();
    if (room.creatorUid === uid) {
      throw new HttpsError('failed-precondition', 'Kendi odana katılamazsın.');
    }
    const user = userSnap.data();
    if (!user || (user.gold || 0) < room.betAmount) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-room.betAmount) });
    tx.update(roomRef, {
      status: 'ready',
      participantUids: admin.firestore.FieldValue.arrayUnion(uid),
      [`players.${uid}`]: freshRacePlayerState(user.displayName || 'Oyuncu', vehicleId, vehicle),
    });
  });

  return { ok: true };
});

// declineOpponent — kurucu, katılan rakibi istemezse reddeder (bahsi iade
// edilir), oda tekrar 'waiting' olur.
export const declineOpponent = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
    const room = roomSnap.data();
    if (room.creatorUid !== uid || room.status !== 'ready') {
      throw new HttpsError('failed-precondition', 'Bu işlem şu an yapılamaz.');
    }
    const joinerUid = room.participantUids.find((u) => u !== uid);
    if (joinerUid) {
      tx.update(db.collection('users').doc(joinerUid), {
        gold: admin.firestore.FieldValue.increment(room.betAmount),
      });
    }
    tx.update(roomRef, {
      status: 'waiting',
      participantUids: [uid],
      [`players.${joinerUid}`]: admin.firestore.FieldValue.delete(),
    });
  });

  return { ok: true };
});

// leaveRaceRoomAsJoiner — KATILAN oyuncu (kurucu değil), kurucu yarışı
// uzun süre başlatmıyorsa ya da vazgeçtiyse odadan ayrılabilir. Bahsi
// iade edilir, oda kurucu ile birlikte 'waiting' durumuna döner (yeni bir
// rakip bekleyebilir).
export const leaveRaceRoomAsJoiner = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
    const room = roomSnap.data();
    if (room.status !== 'ready' || room.creatorUid === uid) {
      throw new HttpsError('failed-precondition', 'Bu işlem şu an yapılamaz.');
    }
    if (!room.participantUids.includes(uid)) {
      throw new HttpsError('failed-precondition', 'Bu odada değilsin.');
    }
    tx.update(db.collection('users').doc(uid), {
      gold: admin.firestore.FieldValue.increment(room.betAmount),
    });
    tx.update(roomRef, {
      status: 'waiting',
      participantUids: [room.creatorUid],
      [`players.${uid}`]: admin.firestore.FieldValue.delete(),
    });
  });

  return { ok: true };
});

// forfeitRace — yarış devam ederken ("racing") oyuncu ekrandan çıkarsa
// çağrılır: çıkan oyuncu ANINDA kaybetmiş sayılır, rakip kazanır.
export const forfeitRace = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) return;
    const room = roomSnap.data();
    if (room.status !== 'racing') {
      throw new HttpsError('failed-precondition', 'Yarış aktif değil.');
    }
    const me = requirePlayerInRoom(room, uid);
    const otherUid = room.participantUids.find((u) => u !== uid);
    const other = otherUid ? room.players[otherUid] : null;

    const userRefs = {};
    const userSnaps = {};
    for (const u of room.participantUids) {
      userRefs[u] = db.collection('users').doc(u);
      userSnaps[u] = await tx.get(userRefs[u]);
    }

    const players = { ...room.players, [uid]: { ...me, forfeited: true } };
    finalizeRace({
      tx,
      roomRef,
      room,
      winnerUid: otherUid || null,
      players,
      userRefs,
      userSnaps,
    });
  });

  return { ok: true };
});

// startRace — kurucu, rakibi kabul edip yarışı başlatır. 1. Oyuncu (kurucu)
// ile başlar, ikisinin de vitesi 1'e sabitlenir (1. tur kuralı).
export const startRace = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
    const room = roomSnap.data();
    if (room.creatorUid !== uid || room.status !== 'ready') {
      throw new HttpsError('failed-precondition', 'Yarış şu an başlatılamaz.');
    }
    const updates = {
      status: 'racing',
      firstStarterUid: room.creatorUid,
      currentTurnUid: room.creatorUid,
      turnDeadline: admin.firestore.Timestamp.fromMillis(Date.now() + RACE_TURN_SECONDS * 1000),
    };
    room.participantUids.forEach((u) => {
      updates[`players.${u}`] = { ...room.players[u], gear: 1, gearAtTurnStart: 1 };
    });
    tx.update(roomRef, updates);
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// resolveRoll — ortak zar/tur çözümleme mantığı (rollDice ve autoRoll
// tarafından kullanılır).
// ---------------------------------------------------------------------------
async function resolveRoll({ roomId, uid, useNitro, useTurbo }) {
  const roomRef = db.collection('raceRooms').doc(roomId);
  let outcome = null;

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
    const room = roomSnap.data();
    if (room.status !== 'racing') {
      throw new HttpsError('failed-precondition', 'Yarış aktif değil.');
    }
    const isFinalTurn = room.finalTurnFor === uid;
    if (room.currentTurnUid !== uid && !isFinalTurn) {
      throw new HttpsError('failed-precondition', 'Sıra sende değil.');
    }
    const me = requirePlayerInRoom(room, uid);
    const otherUid = room.participantUids.find((u) => u !== uid);
    const other = otherUid ? room.players[otherUid] : null;

    // Firestore transaction kuralı: tüm okumalar yazmalardan önce.
    const userRefs = {};
    const userSnaps = {};
    for (const u of room.participantUids) {
      userRefs[u] = db.collection('users').doc(u);
      userSnaps[u] = await tx.get(userRefs[u]);
    }

    // Benzin bitmişse ANINDA kaybeder (adalet kuralı burada geçerli değil).
    if (me.fuel <= 0) {
      const meUpdated = { ...me, lostByFuel: true };
      const players = { ...room.players, [uid]: meUpdated };
      finalizeRace({
        tx,
        roomRef,
        room,
        winnerUid: otherUid || null,
        players,
        userRefs,
        userSnaps,
      });
      outcome = { outOfFuel: true, raceOver: true, winnerUid: otherUid || null };
      return;
    }

    const { updated: meUpdated, stepSum, multiplier, movedSteps, goldEarned } = performRoll(me, {
      useNitro,
      useTurbo,
    });

    if (isFinalTurn) {
      // Adalet kuralı: 2. Oyuncu'nun son hamlesi. Bitirdiyse berabere,
      // bitiremediyse ilk bitiren (firstStarterUid'nin YARIŞTA bitiş
      // anındaki hali zaten kaydedilmişti) kazanır.
      const players = { ...room.players, [uid]: meUpdated };
      const winnerUid = meUpdated.finished ? 'draw' : room.finalTurnWinnerUid;
      finalizeRace({ tx, roomRef, room, winnerUid, players, userRefs, userSnaps });
      outcome = {
        steps: movedSteps,
        rolledSum: stepSum,
        multiplier,
        goldEarned,
        raceOver: true,
        winnerUid,
        wasFinalTurn: true,
      };
      return;
    }

    if (meUpdated.finished) {
      if (uid === room.firstStarterUid) {
        // 1. Oyuncu bitirdi — 2. Oyuncuya adalet gereği son hamle hakkı.
        tx.update(roomRef, {
          [`players.${uid}`]: meUpdated,
          finalTurnFor: otherUid,
          finalTurnWinnerUid: uid,
          currentTurnUid: otherUid,
          turnDeadline: room.isTraining
            ? null
            : admin.firestore.Timestamp.fromMillis(Date.now() + RACE_TURN_SECONDS * 1000),
        });
        outcome = {
          steps: movedSteps,
          rolledSum: stepSum,
          multiplier,
          goldEarned,
          raceOver: false,
          grantedFinalTurnToOpponent: true,
        };
        return;
      }
      // 2. Oyuncu (ya da adalet kuralına gerek olmayan diğer durumlarda)
      // kendi sırasında bitirdi — yarış hemen biter.
      const players = { ...room.players, [uid]: meUpdated };
      finalizeRace({ tx, roomRef, room, winnerUid: uid, players, userRefs, userSnaps });
      outcome = {
        steps: movedSteps,
        rolledSum: stepSum,
        multiplier,
        goldEarned,
        raceOver: true,
        winnerUid: uid,
      };
      return;
    }

    // Bitirmedi. Bu atışla benzini TAM 0'a düştüyse yarış ANINDA biter —
    // rakibe sıra geçip "bir tur daha şans" verilmez (kullanıcı ısrarla
    // bunu istedi: benzin 0 görüldüğü an oyun biter).
    if (meUpdated.fuel <= 0) {
      const meFinal = { ...meUpdated, lostByFuel: true };
      const players = { ...room.players, [uid]: meFinal };
      finalizeRace({
        tx,
        roomRef,
        room,
        winnerUid: otherUid || null,
        players,
        userRefs,
        userSnaps,
      });
      outcome = {
        steps: movedSteps,
        rolledSum: stepSum,
        multiplier,
        goldEarned,
        outOfFuel: true,
        raceOver: true,
        winnerUid: otherUid || null,
      };
      return;
    }

    // Sıra karşı tarafa geçer. Antrenman modunda (bota karşı) süre baskısı
    // yok — botun hamlesi zaten otomatik ve gecikmeli işlendiği için gerçek
    // bir sayaç koymak, oyuncunun süresinin haksız yere erimesine yol açardı.
    tx.update(roomRef, {
      [`players.${uid}`]: meUpdated,
      currentTurnUid: otherUid,
      turnDeadline: room.isTraining
        ? null
        : admin.firestore.Timestamp.fromMillis(Date.now() + RACE_TURN_SECONDS * 1000),
    });
    outcome = { steps: movedSteps, rolledSum: stepSum, multiplier, goldEarned, raceOver: false };
  });

  return outcome;
}

// rollDice — sırası gelen oyuncunun kendi isteğiyle zar atması.
export const rollDice = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId, useNitro, useTurbo } = request.data || {};
  const outcome = await resolveRoll({ roomId, uid, useNitro, useTurbo });
  return { ok: true, ...outcome };
});

// =============================================================================
// ANTRENMAN MODU — 10 seviyeli, botlara karşı tek kişilik pratik yarışları.
// Oyuncu paneli gerçek çevrimiçi yarışla BİREBİR AYNI görünür (aynı
// raceRooms koleksiyonu + aynı RaceRoom.jsx bileşeni kullanılıyor) — ama
// rakip gerçek bir oyuncu değil, sabit vitesli, benzin/nitro/turbo/istasyon
// KULLANMAYAN basit bir bot. Bot'un "kullanıcı hesabı" olmadığı için
// betAmount HER ZAMAN 0 — bu sayede finalizeRace() gerçek para
// ödemesi yapmaya çalışmaz (amount=0 → ödeme adımı atlanır), botla ilgili
// hiçbir gerçek Firestore users/{uid} dokümanına dokunulmaz.
// =============================================================================
const TRAINING_LEVELS = 10;
const TRAINING_REWARD_PER_LEVEL = 1000;

function freshBotPlayerState(level) {
  return {
    displayName: `Seviye ${level} Bot`,
    vehicleModel: `Bot Aracı (${level}. Vites — Sabit)`,
    maxGear: level,
    turboTotal: 0,
    position: 0,
    gear: level,
    gearAtTurnStart: level,
    fuel: 999999,
    maxFuel: 999999,
    raceGold: 0,
    wheelBonus: 0,
    fuelSavingBonus: 0,
    nitroActive: false,
    turboCount: 0,
    hasRolledOnce: true, // vitesi hep sabit — "1. tur zorla vites 1" kuralı bota uygulanmaz
    lastRollSteps: null,
    lastRollSum: null,
    lastRollMultiplier: null,
    finished: false,
    lostByFuel: false,
  };
}

export const createTrainingRace = onCall(async (request) => {
  const uid = requireAuth(request);
  const { vehicleId, level } = request.data || {};
  const lvl = Number(level);
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > TRAINING_LEVELS) {
    throw new HttpsError('invalid-argument', 'Geçersiz seviye.');
  }
  const vehicle = await getVehicleForRace(uid, vehicleId);

  const progressSnap = await db.collection('trainingProgress').doc(uid).get();
  const unlockedLevel = progressSnap.data()?.unlockedLevel || 1;
  if (lvl > unlockedLevel) {
    throw new HttpsError('failed-precondition', 'Bu seviye henüz açılmadı.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();

  const roomRef = db.collection('raceRooms').doc();
  await roomRef.set({
    status: 'racing',
    betAmount: 0,
    creatorUid: uid,
    participantUids: [uid, 'bot'],
    firstStarterUid: uid,
    currentTurnUid: uid,
    turnDeadline: null,
    finalTurnFor: null,
    winnerUid: null,
    isTraining: true,
    trainingLevel: lvl,
    rewardProcessed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    players: {
      [uid]: freshRacePlayerState(user?.displayName || 'Oyuncu', vehicleId, vehicle),
      bot: freshBotPlayerState(lvl),
    },
  });

  return { ok: true, roomId: roomRef.id };
});

async function processTrainingReward(roomId) {
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    // ÖNEMLİ: Firestore transaction'larında TÜM okumalar TÜM yazmalardan
    // önce yapılmalı — sırası karışırsa transaction sessizce/hatayla
    // başarısız olur ve ödül/kilit açma hiç işlenmez (bu bug'ı yaşadık).
    const roomSnap = await tx.get(roomRef);
    const room = roomSnap.data();
    if (!room || room.rewardProcessed) return;

    const uid = room.creatorUid;
    const level = room.trainingLevel;
    const won = room.winnerUid === uid;

    let progressRef = null;
    let progress = null;
    let alreadyBeaten = false;
    if (won) {
      progressRef = db.collection('trainingProgress').doc(uid);
      const progressSnap = await tx.get(progressRef);
      progress = progressSnap.data() || { unlockedLevel: 1, beatenLevels: {} };
      alreadyBeaten = Boolean(progress.beatenLevels?.[level]);
    }

    // --- Buradan sonrası SADECE yazma ---
    tx.update(roomRef, { rewardProcessed: true });
    if (!won) return;

    const newUnlocked = Math.max(progress.unlockedLevel || 1, Math.min(TRAINING_LEVELS, level + 1));
    tx.set(
      progressRef,
      { unlockedLevel: newUnlocked, beatenLevels: { ...(progress.beatenLevels || {}), [level]: true } },
      { merge: true }
    );

    if (!alreadyBeaten) {
      const reward = level * TRAINING_REWARD_PER_LEVEL;
      tx.update(db.collection('users').doc(uid), {
        gold: admin.firestore.FieldValue.increment(reward),
      });
    }
  });
}

// trainingRollDice — insan kendi turunda bu fonksiyonu çağırır. Aynı çağrı
// içinde, sıra bota geçtiyse botun hamlesi de HEMEN (bekletmeden) çözülür
// — botun kendi "istemcisi" olmadığı için otomatik oynatılması gerekiyor.
export const trainingRollDice = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId, useNitro, useTurbo } = request.data || {};

  const humanOutcome = await resolveRoll({ roomId, uid, useNitro, useTurbo });

  const roomSnap = await db.collection('raceRooms').doc(roomId).get();
  const room = roomSnap.data();
  if (room?.status === 'racing' && room.currentTurnUid === 'bot') {
    // Bot, insan zar attıktan HEMEN sonra değil, 1 saniye gecikmeyle zar
    // atar — anında/robotik hissetmesin diye.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await resolveRoll({ roomId, uid: 'bot', useNitro: false, useTurbo: false });
  }

  const finalSnap = await db.collection('raceRooms').doc(roomId).get();
  const finalRoom = finalSnap.data();
  if (finalRoom?.status === 'finished' && finalRoom.isTraining) {
    await processTrainingReward(roomId);
  }

  return { ok: true, humanOutcome };
});

// autoRoll — 10 saniyelik süre dolduğunda, odadaki herhangi bir katılımcının
// istemcisi tarafından tetiklenir (sırası gelen oyuncu adına otomatik atar).
export const autoRoll = onCall(async (request) => {
  requireAuth(request);
  const { roomId } = request.data || {};
  const roomSnap = await db.collection('raceRooms').doc(roomId).get();
  if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
  const room = roomSnap.data();
  if (room.status !== 'racing') return { ok: true, skipped: true };
  if (!room.turnDeadline || room.turnDeadline.toMillis() > Date.now()) {
    return { ok: true, skipped: true };
  }
  const targetUid = room.finalTurnFor || room.currentTurnUid;
  const me = room.players?.[targetUid];
  const outcome = await resolveRoll({
    roomId,
    uid: targetUid,
    useNitro: me?.nitroActive,
    useTurbo: false,
  });
  return { ok: true, ...outcome };
});

// ---------------------------------------------------------------------------
// Yarış içi satın almalar (istasyon, istasyon dışı benzin, nitro) ve vites —
// hepsi sadece SIRASI GELEN oyuncu tarafından kullanılabilir.
// ---------------------------------------------------------------------------
// raceRefuel — akıllı benzin doldurma: oyuncu tam bir istasyon karesindeyse
// (10 karede bir) 10 altına, değilse 100 altına tam dolum yapar. Tekerlek
// geliştirme / benzin tasarrufu seçenekleri kaldırıldı — istasyonda SADECE
// benzin doldurma var.
export const raceRefuel = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);
  let outcomePrice = null;

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    const room = roomSnap.data();
    if (!room || room.status !== 'racing') {
      throw new HttpsError('failed-precondition', 'Yarış aktif değil.');
    }
    if (room.currentTurnUid !== uid && room.finalTurnFor !== uid) {
      throw new HttpsError('failed-precondition', 'Sıra sende değil.');
    }
    const me = requirePlayerInRoom(room, uid);
    if (me.fuel >= me.maxFuel) {
      throw new HttpsError('failed-precondition', 'Benzinin zaten dolu.');
    }
    const atStation = me.position % 10 === 0;
    const price = atStation ? RACE_STATION_PRICES.refuel : RACE_OFFSITE_FUEL_PRICE;
    if (me.raceGold < price) {
      throw new HttpsError('failed-precondition', 'Yeterli yarış altının yok.');
    }
    outcomePrice = price;
    tx.update(roomRef, {
      [`players.${uid}`]: { ...me, raceGold: me.raceGold - price, fuel: me.maxFuel },
    });
  });

  return { ok: true, price: outcomePrice };
});

export const raceBuyNitro = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    const room = roomSnap.data();
    if (!room || room.status !== 'racing') {
      throw new HttpsError('failed-precondition', 'Yarış aktif değil.');
    }
    if (room.currentTurnUid !== uid && room.finalTurnFor !== uid) {
      throw new HttpsError('failed-precondition', 'Sıra sende değil.');
    }
    const me = requirePlayerInRoom(room, uid);
    if (me.nitroActive) {
      throw new HttpsError('failed-precondition', 'Bu tur zaten nitro aldın.');
    }
    if (me.raceGold < RACE_NITRO_PRICE) {
      throw new HttpsError('failed-precondition', 'Yeterli yarış altının yok.');
    }
    tx.update(roomRef, {
      [`players.${uid}`]: { ...me, raceGold: me.raceGold - RACE_NITRO_PRICE, nitroActive: true },
    });
  });

  return { ok: true };
});

// raceChangeGear — 1. turda (hiç atmadıysa) tamamen kapalı. Sonraki
// turlarda o turun BAŞINDAKİ vitese göre en fazla ±1 değişebilir.
export const raceChangeGear = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId, delta } = request.data || {};
  const d = Number(delta);
  if (d !== 1 && d !== -1) {
    throw new HttpsError('invalid-argument', 'Geçersiz vites değişimi.');
  }
  const roomRef = db.collection('raceRooms').doc(roomId);

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    const room = roomSnap.data();
    if (!room || room.status !== 'racing') {
      throw new HttpsError('failed-precondition', 'Yarış aktif değil.');
    }
    if (room.currentTurnUid !== uid && room.finalTurnFor !== uid) {
      throw new HttpsError('failed-precondition', 'Sıra sende değil.');
    }
    const me = requirePlayerInRoom(room, uid);
    if (!me.hasRolledOnce) {
      throw new HttpsError(
        'failed-precondition',
        'İlk turda vites değiştirilemez, herkes 1. viteste başlar.'
      );
    }
    const newGear = clamp(me.gear + d, 1, me.maxGear);
    if (Math.abs(newGear - me.gearAtTurnStart) > 1) {
      throw new HttpsError('failed-precondition', 'Bu tur vitesi en fazla 1 değiştirebilirsin.');
    }
    tx.update(roomRef, { [`players.${uid}`]: { ...me, gear: newGear } });
  });

  return { ok: true };
});

// =============================================================================
// ŞAMPİYONA — her araç için ayrı, gün boyu (00:00-00:00) süren tek kişilik
// yarış. Rakip yok; amaç 300 karelik pisti EN AZ TURDA (en az zar atışıyla)
// bitirmek. Aynı raceRooms koleksiyonu + aynı RaceRoom.jsx bileşeni
// kullanılıyor (participantUids sadece kendi uid'imiz) — bu sayede
// raceRefuel/raceBuyNitro/raceChangeGear DEĞİŞİKLİKSİZ tekrar kullanılabiliyor
// (hepsi zaten sadece "sıra sende mi" kontrolü yapıyor, tek kişilik oda için
// sıra hep kendi uid'imizde kalıyor).
//
// championshipDaily/{catalogId}_{dateKey} — o araç+gün için canlı lider
// (en az turda bitiren) ve (bir sonraki dailyReset'te) kazananı tutar.
// dailyActions/{uid}_{dateKey}.championship_{catalogId} — o araçla o gün
// hakkın kullanılıp kullanılmadığını işaretler (kazansın/kaybetsin/yarım
// bıraksın fark etmez, günde 1 hak).
// =============================================================================

export const createChampionshipRace = onCall(async (request) => {
  const uid = requireAuth(request);
  const { vehicleId } = request.data || {};
  const vehicle = await getVehicleForRace(uid, vehicleId);
  if (vehicle.seizedByBank) {
    throw new HttpsError('failed-precondition', 'Bu araç bankaya el konulmuş durumda.');
  }
  const catalogId = Number(vehicle.catalogId);
  if (!catalogId || !VEHICLE_CATALOG[catalogId]) {
    throw new HttpsError('failed-precondition', 'Geçersiz araç.');
  }

  const dateKey = istanbulDateKey();
  const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey}`);
  const dailyField = `championship_${catalogId}`;

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();

  const roomRef = db.collection('raceRooms').doc();

  await db.runTransaction(async (tx) => {
    const dailySnap = await tx.get(dailyRef);
    if (dailySnap.exists && dailySnap.data()[dailyField]) {
      throw new HttpsError('failed-precondition', 'Bu araçla bugün şampiyonaya zaten katıldın.');
    }
    tx.set(dailyRef, { [dailyField]: true }, { merge: true });
    tx.set(roomRef, {
      status: 'racing',
      betAmount: 0,
      creatorUid: uid,
      participantUids: [uid],
      firstStarterUid: uid,
      currentTurnUid: uid,
      turnDeadline: null,
      finalTurnFor: null,
      winnerUid: null,
      isChampionship: true,
      championshipCatalogId: catalogId,
      championshipDateKey: dateKey,
      rewardProcessed: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      players: {
        [uid]: {
          ...freshRacePlayerState(user?.displayName || 'Oyuncu', vehicleId, vehicle),
          turnsUsed: 0,
        },
      },
    });
  });

  return { ok: true, roomId: roomRef.id };
});

// championshipRollDice — resolveRoll'un tek kişilik (rakipsiz) hali. Bitiş
// çizgisini geçince yarış anında biter (kimseye "adalet turu" verilmez,
// zaten rakip yok) ve o turda kaç zar attığı championshipDaily'de günün
// (şu ana kadarki) lideriyle karşılaştırılır.
export const championshipRollDice = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId, useNitro, useTurbo } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);
  let outcome = null;

  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
    const room = roomSnap.data();
    if (!room.isChampionship) {
      throw new HttpsError('failed-precondition', 'Bu bir şampiyona odası değil.');
    }
    if (room.status !== 'racing') {
      throw new HttpsError('failed-precondition', 'Yarış aktif değil.');
    }
    if (room.creatorUid !== uid) {
      throw new HttpsError('failed-precondition', 'Bu oda size ait değil.');
    }
    const me = requirePlayerInRoom(room, uid);

    // Transaction kuralı: tüm okumalar yazmalardan önce.
    const champDailyRef = db
      .collection('championshipDaily')
      .doc(`${room.championshipCatalogId}_${room.championshipDateKey}`);
    const champDailySnap = await tx.get(champDailyRef);

    if (me.fuel <= 0) {
      tx.update(roomRef, {
        status: 'finished',
        winnerUid: null,
        championshipResult: 'fuel_out',
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        [`players.${uid}`]: { ...me, lostByFuel: true },
      });
      outcome = { outOfFuel: true, raceOver: true };
      return;
    }

    const { updated: meUpdated, stepSum, multiplier, movedSteps, goldEarned } = performRoll(me, {
      useNitro,
      useTurbo,
    });
    const turnsUsed = (me.turnsUsed || 0) + 1;
    meUpdated.turnsUsed = turnsUsed;

    if (meUpdated.finished) {
      tx.update(roomRef, {
        status: 'finished',
        winnerUid: uid,
        championshipResult: 'completed',
        championshipTurns: turnsUsed,
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        [`players.${uid}`]: meUpdated,
      });

      const champDaily = champDailySnap.exists ? champDailySnap.data() : null;
      if (!champDaily || !champDaily.leaderTurns || turnsUsed < champDaily.leaderTurns) {
        tx.set(
          champDailyRef,
          {
            catalogId: room.championshipCatalogId,
            dateKey: room.championshipDateKey,
            leaderUid: uid,
            leaderName: me.displayName,
            leaderVehicleModel: me.vehicleModel,
            leaderTurns: turnsUsed,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      outcome = {
        steps: movedSteps,
        rolledSum: stepSum,
        multiplier,
        goldEarned,
        raceOver: true,
        finished: true,
        turnsUsed,
      };
      return;
    }

    if (meUpdated.fuel <= 0) {
      tx.update(roomRef, {
        status: 'finished',
        winnerUid: null,
        championshipResult: 'fuel_out',
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        [`players.${uid}`]: { ...meUpdated, lostByFuel: true },
      });
      outcome = {
        steps: movedSteps,
        rolledSum: stepSum,
        multiplier,
        goldEarned,
        outOfFuel: true,
        raceOver: true,
      };
      return;
    }

    tx.update(roomRef, { [`players.${uid}`]: meUpdated });
    outcome = { steps: movedSteps, rolledSum: stepSum, multiplier, goldEarned, raceOver: false };
  });

  return { ok: true, ...outcome };
});

// =============================================================================
// TELEFON — "2." İKİNCİ EL SATIŞ UYGULAMASI (Bölüm 9.1)
// =============================================================================
//
// Oyuncular araçlarını, silahlarını, geliştirme malzemelerini ve geliştirme
// makinelerini diğer oyunculara satabilir. itemType'a göre 4 farklı akış:
//   - vehicle: vehicles/{id} üzerinde 'listed' bayrağı — ipotekli/el konulmuş
//     araç listelenemez.
//   - weapon: weapons/{id} üzerinde 'listed' bayrağı.
//   - material: envanterden miktar ANINDA düşülür (rezerve edilir), iptal
//     edilirse geri eklenir.
//   - machine: factories/{ownerId}/machines/{machineId} dokümanı ANINDA
//     silinir (rezerve edilir), iptal edilirse aynı türde yeni bir makine
//     dokümanı olarak fabrikaya geri eklenir.
// marketplaceListings/{listingId}: sellerId, itemType, price, sold, ...
// =============================================================================

const MATERIAL_TYPES = ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme', 'yasakliMadde'];

export const createListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { itemType, itemId, materialType, quantity, machineType, price, unitPrice } = request.data || {};

  const userSnap = await db.collection('users').doc(uid).get();
  const sellerName = userSnap.data()?.displayName || 'Oyuncu';

  // MALZEME: artık toplam fiyat değil, ADET FİYATI ile ilan veriliyor —
  // alıcılar istedikleri kadar adet alabiliyor (bkz. buyListing). Aynı
  // satıcının aynı malzeme + aynı adet fiyatına sahip AÇIK bir ilanı
  // varsa, ilan kalabalığını azaltmak için yeni ilan açmak yerine
  // mevcutla birleştirilir — deterministik doküman ID'si bunu sorgusuz
  // garanti eder.
  if (itemType === 'material') {
    if (!MATERIAL_TYPES.includes(materialType)) {
      throw new HttpsError('invalid-argument', 'Geçersiz malzeme türü.');
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
    }
    const unitPriceNum = Number(unitPrice);
    if (!Number.isInteger(unitPriceNum) || unitPriceNum <= 0) {
      throw new HttpsError('invalid-argument', 'Geçersiz adet fiyatı.');
    }
    const unitMax = AMAZOR_PRICES[materialType];
    const unitMin = Math.floor(unitMax / 2);
    if (unitPriceNum < unitMin || unitPriceNum > unitMax) {
      throw new HttpsError(
        'invalid-argument',
        `Adet fiyatı ${unitMin.toLocaleString('tr-TR')} - ${unitMax.toLocaleString('tr-TR')} altın arasında olmalı.`
      );
    }
    const inventoryRef = db.collection('users').doc(uid).collection('inventory').doc(materialType);
    const mergedListingRef = db
      .collection('marketplaceListings')
      .doc(`mat_${uid}_${materialType}_${unitPriceNum}`);
    await db.runTransaction(async (tx) => {
      const [invSnap, listingSnap] = await Promise.all([tx.get(inventoryRef), tx.get(mergedListingRef)]);
      const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
      if (have < qty) {
        throw new HttpsError('failed-precondition', 'Yeterli malzemeniz yok.');
      }
      tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
      if (listingSnap.exists && !listingSnap.data().sold) {
        tx.update(mergedListingRef, {
          quantity: admin.firestore.FieldValue.increment(qty),
          price: admin.firestore.FieldValue.increment(unitPriceNum * qty),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(mergedListingRef, {
          sellerId: uid,
          sellerName,
          itemType,
          materialType,
          quantity: qty,
          unitPrice: unitPriceNum,
          price: unitPriceNum * qty,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sold: false,
        });
      }
    });
    return { ok: true, listingId: mergedListingRef.id };
  }

  const priceNum = Number(price);
  if (!Number.isInteger(priceNum) || priceNum <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz fiyat.');
  }

  const listingRef = db.collection('marketplaceListings').doc();

  if (itemType === 'vehicle') {
    const vehicleRef = db.collection('vehicles').doc(itemId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(vehicleRef);
      const v = snap.data();
      if (!snap.exists || v.ownerId !== uid) {
        throw new HttpsError('failed-precondition', 'Bu araç size ait değil.');
      }
      if (v.mortgaged || v.seizedByBank) {
        throw new HttpsError('failed-precondition', 'İpotekli/el konulmuş araç satılamaz.');
      }
      if (v.listed) {
        throw new HttpsError('failed-precondition', 'Bu araç zaten listelenmiş.');
      }
      const baseVehiclePrice = VEHICLE_CATALOG[v.catalogId]?.price || 0;
      const vehicleUpgradeMult =
        v.gearUpgraded && v.tankUpgraded ? 3 : v.gearUpgraded || v.tankUpgraded ? 2 : 1;
      const vehicleLifeDays = v.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
      if (vehicleLifeDays <= 0) {
        throw new HttpsError(
          'failed-precondition',
          'Bu aracın ömrü bitti — satışa çıkarmadan önce tamir ettirmelisin.'
        );
      }
      const vehicleMax = Math.round(baseVehiclePrice * vehicleUpgradeMult * lifeRatioOf(v));
      const vehicleMin = Math.floor(vehicleMax / 2);
      if (priceNum < vehicleMin || priceNum > vehicleMax) {
        throw new HttpsError(
          'invalid-argument',
          `Fiyat ${vehicleMin.toLocaleString('tr-TR')} - ${vehicleMax.toLocaleString('tr-TR')} altın arasında olmalı.`
        );
      }
      tx.update(vehicleRef, { listed: true });
      tx.set(listingRef, {
        sellerId: uid,
        sellerName,
        itemType,
        vehicleId: itemId,
        vehicleModel: v.model,
        vehicleCatalogId: v.catalogId,
        vehicleGearLevel: v.gearLevel,
        vehicleTank: (v.baseTank || 0) + (v.tankBonus || 0),
        vehicleGearUpgraded: Boolean(v.gearUpgraded),
        vehicleTankUpgraded: Boolean(v.tankUpgraded),
        vehicleLifeDays,
        price: priceNum,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else if (itemType === 'weapon') {
    const weaponRef = db.collection('weapons').doc(itemId);
    const sellerSnap0 = await db.collection('users').doc(uid).get();
    if (sellerSnap0.data()?.profession === 'polis') {
      const myWeaponsSnap = await db
        .collection('weapons')
        .where('ownerId', '==', uid)
        .get();
      const unlistedCount = myWeaponsSnap.docs.filter((d) => !d.data().listed).length;
      if (unlistedCount <= 1) {
        throw new HttpsError(
          'failed-precondition',
          'Polis olarak her zaman en az 1 silahın kalmalı, hepsini satışa çıkaramazsın.'
        );
      }
    }
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(weaponRef);
      const w = snap.data();
      if (!snap.exists || w.ownerId !== uid) {
        throw new HttpsError('failed-precondition', 'Bu silah size ait değil.');
      }
      if (w.listed) {
        throw new HttpsError('failed-precondition', 'Bu silah zaten listelenmiş.');
      }
      const baseWeaponPrice = WEAPON_CATALOG[w.catalogId]?.price || 0;
      const weaponMult = w.level || 1;
      const weaponLifeDays = w.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
      if (weaponLifeDays <= 0) {
        throw new HttpsError(
          'failed-precondition',
          'Bu silahın ömrü bitti — satışa çıkarmadan önce tamir ettirmelisin.'
        );
      }
      const weaponMax = Math.round(baseWeaponPrice * weaponMult * lifeRatioOf(w));
      const weaponMin = Math.floor(weaponMax / 2);
      if (priceNum < weaponMin || priceNum > weaponMax) {
        throw new HttpsError(
          'invalid-argument',
          `Fiyat ${weaponMin.toLocaleString('tr-TR')} - ${weaponMax.toLocaleString('tr-TR')} altın arasında olmalı.`
        );
      }
      tx.update(weaponRef, { listed: true });
      tx.set(listingRef, {
        sellerId: uid,
        sellerName,
        itemType,
        weaponId: itemId,
        weaponName: w.name,
        weaponCatalogId: w.catalogId,
        weaponLevel: w.level,
        weaponPower: w.power,
        weaponLifeDays,
        price: priceNum,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else if (itemType === 'machine') {
    const machineRef = db.collection('factories').doc(uid).collection('machines').doc(request.data?.machineId);
    const preSnap = await machineRef.get();
    if (!preSnap.exists) {
      throw new HttpsError('failed-precondition', 'Bu makine size ait değil.');
    }
    const preMachineType = preSnap.data().type;
    const base =
      preMachineType === 'mining' ? await miningMachinePrice() : MACHINE_TYPES[preMachineType].price;
    const machineMax = base;
    const machineMin = Math.floor(base / 2);
    if (priceNum < machineMin || priceNum > machineMax) {
      throw new HttpsError(
        'invalid-argument',
        `Fiyat ${machineMin.toLocaleString('tr-TR')} - ${machineMax.toLocaleString('tr-TR')} altın arasında olmalı.`
      );
    }
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(machineRef);
      if (!snap.exists) {
        throw new HttpsError('failed-precondition', 'Bu makine size ait değil.');
      }
      const m = snap.data();
      if (m.workerId) {
        throw new HttpsError(
          'failed-precondition',
          'Bu makinede biri çalışıyor, önce işçiyi çıkarmalısın.'
        );
      }
      tx.delete(machineRef);
      tx.set(listingRef, {
        sellerId: uid,
        sellerName,
        itemType,
        machineType: m.type,
        price: priceNum,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else {
    throw new HttpsError('invalid-argument', 'Geçersiz ürün türü.');
  }

  return { ok: true, listingId: listingRef.id };
});

// instantSellListing — ürünü PİYASAYA (diğer oyunculara) değil, doğrudan
// OYUNA anında satar: satıcı en düşük izin verilen fiyatı ANINDA alır,
// ürün de "sistem" tarafından %10 zamlı şekilde otomatik ilana çıkar.
// Sistem ilanını başka bir oyuncu alırsa, o para satıcıya DEĞİL, sisteme
// gider (satıcı zaten anında ödemesini almıştı) — bkz. buyListing'deki
// sellerId==='system' kontrolü. Satın alan çıkmazsa 7 gün sonra diğer
// ilanlar gibi otomatik kaldırılır (bkz. expireOldMarketplaceListings).
export const instantSellListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { itemType, itemId, materialType, quantity, machineType } = request.data || {};

  const sellerRef = db.collection('users').doc(uid);

  // MALZEME: satıcıya ANINDA adet başı sabit fiyat ödenir; sistem ilanı da
  // artık "toplam" değil ADET FİYATI ile tutuluyor ve aynı malzeme+fiyata
  // sahip tek bir kalıcı sistem ilanında birikiyor (ilan kalabalığını
  // azaltmak için, bkz. createListing).
  if (itemType === 'material') {
    if (!MATERIAL_TYPES.includes(materialType)) {
      throw new HttpsError('invalid-argument', 'Geçersiz malzeme türü.');
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
    }
    const unitSellPrice = Math.floor(AMAZOR_PRICES[materialType] / 2);
    const payout = unitSellPrice * qty;
    const systemUnitPrice = Math.ceil(unitSellPrice * 1.1);
    const inventoryRef = sellerRef.collection('inventory').doc(materialType);
    const mergedListingRef = db
      .collection('marketplaceListings')
      .doc(`mat_system_${materialType}_${systemUnitPrice}`);
    await db.runTransaction(async (tx) => {
      const [invSnap, sellerSnap, listingSnap] = await Promise.all([
        tx.get(inventoryRef),
        tx.get(sellerRef),
        tx.get(mergedListingRef),
      ]);
      const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
      if (have < qty) {
        throw new HttpsError('failed-precondition', 'Yeterli malzemeniz yok.');
      }
      const { goldDelta, debtDelta } = splitIncomeForDebt(sellerSnap.data()?.debtToState, payout);
      tx.update(sellerRef, {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
      tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
      if (listingSnap.exists && !listingSnap.data().sold) {
        tx.update(mergedListingRef, {
          quantity: admin.firestore.FieldValue.increment(qty),
          price: admin.firestore.FieldValue.increment(systemUnitPrice * qty),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(mergedListingRef, {
          sellerId: 'system',
          sellerName: 'Sistem',
          itemType,
          materialType,
          quantity: qty,
          unitPrice: systemUnitPrice,
          price: systemUnitPrice * qty,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sold: false,
        });
      }
    });
    return { ok: true, listingId: mergedListingRef.id, payout };
  }

  const listingRef = db.collection('marketplaceListings').doc();

  let payout = 0;

  if (itemType === 'vehicle') {
    const vehicleRef = db.collection('vehicles').doc(itemId);
    await db.runTransaction(async (tx) => {
      const [snap, sellerSnap] = await Promise.all([tx.get(vehicleRef), tx.get(sellerRef)]);
      const v = snap.data();
      if (!snap.exists || v.ownerId !== uid) {
        throw new HttpsError('failed-precondition', 'Bu araç size ait değil.');
      }
      if (v.mortgaged || v.seizedByBank || v.listed) {
        throw new HttpsError('failed-precondition', 'Bu araç şu an satılamaz.');
      }
      const base = VEHICLE_CATALOG[v.catalogId]?.price || 0;
      const mult = v.gearUpgraded && v.tankUpgraded ? 3 : v.gearUpgraded || v.tankUpgraded ? 2 : 1;
      const vehicleLifeDays = v.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
      if (vehicleLifeDays <= 0) {
        throw new HttpsError(
          'failed-precondition',
          'Bu aracın ömrü bitti — satmadan önce tamir ettirmelisin.'
        );
      }
      const minPrice = Math.floor((base * mult * lifeRatioOf(v)) / 2);
      payout = minPrice;
      const { goldDelta, debtDelta } = splitIncomeForDebt(sellerSnap.data()?.debtToState, minPrice);
      tx.update(sellerRef, {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
      tx.update(vehicleRef, { listed: true });
      tx.set(listingRef, {
        sellerId: 'system',
        sellerName: 'Sistem',
        itemType,
        vehicleId: itemId,
        vehicleModel: v.model,
        vehicleCatalogId: v.catalogId,
        vehicleGearLevel: v.gearLevel,
        vehicleTank: (v.baseTank || 0) + (v.tankBonus || 0),
        vehicleGearUpgraded: Boolean(v.gearUpgraded),
        vehicleTankUpgraded: Boolean(v.tankUpgraded),
        vehicleLifeDays,
        price: Math.ceil(minPrice * 1.1),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else if (itemType === 'weapon') {
    const weaponRef = db.collection('weapons').doc(itemId);
    const sellerProfSnap = await sellerRef.get();
    if (sellerProfSnap.data()?.profession === 'polis') {
      const myWeaponsSnap = await db.collection('weapons').where('ownerId', '==', uid).get();
      const unlistedCount = myWeaponsSnap.docs.filter((d) => !d.data().listed).length;
      if (unlistedCount <= 1) {
        throw new HttpsError(
          'failed-precondition',
          'Polis olarak her zaman en az 1 silahın kalmalı, hepsini satışa çıkaramazsın.'
        );
      }
    }
    await db.runTransaction(async (tx) => {
      const [snap, sellerSnap] = await Promise.all([tx.get(weaponRef), tx.get(sellerRef)]);
      const w = snap.data();
      if (!snap.exists || w.ownerId !== uid) {
        throw new HttpsError('failed-precondition', 'Bu silah size ait değil.');
      }
      if (w.listed) {
        throw new HttpsError('failed-precondition', 'Bu silah zaten listelenmiş.');
      }
      const base = WEAPON_CATALOG[w.catalogId]?.price || 0;
      const mult = w.level || 1;
      const weaponLifeDays = w.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
      if (weaponLifeDays <= 0) {
        throw new HttpsError(
          'failed-precondition',
          'Bu silahın ömrü bitti — satmadan önce tamir ettirmelisin.'
        );
      }
      const minPrice = Math.floor((base * mult * lifeRatioOf(w)) / 2);
      payout = minPrice;
      const { goldDelta, debtDelta } = splitIncomeForDebt(sellerSnap.data()?.debtToState, minPrice);
      tx.update(sellerRef, {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
      tx.update(weaponRef, { listed: true });
      tx.set(listingRef, {
        sellerId: 'system',
        sellerName: 'Sistem',
        itemType,
        weaponId: itemId,
        weaponName: w.name,
        weaponCatalogId: w.catalogId,
        weaponLevel: w.level,
        weaponPower: w.power,
        weaponLifeDays,
        price: Math.ceil(minPrice * 1.1),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else if (itemType === 'machine') {
    const machineRef = db.collection('factories').doc(uid).collection('machines').doc(request.data?.machineId);
    const preSnap = await machineRef.get();
    if (!preSnap.exists) {
      throw new HttpsError('failed-precondition', 'Bu makine size ait değil.');
    }
    const mType = preSnap.data().type;
    const base = mType === 'mining' ? await miningMachinePrice() : MACHINE_TYPES[mType].price;
    const minPrice = Math.floor(base / 2);
    payout = minPrice;
    await db.runTransaction(async (tx) => {
      const [snap, sellerSnap] = await Promise.all([tx.get(machineRef), tx.get(sellerRef)]);
      if (!snap.exists) {
        throw new HttpsError('failed-precondition', 'Bu makine size ait değil.');
      }
      const m = snap.data();
      if (m.workerId) {
        throw new HttpsError(
          'failed-precondition',
          'Bu makinede biri çalışıyor, önce işçiyi çıkarmalısın.'
        );
      }
      const { goldDelta, debtDelta } = splitIncomeForDebt(sellerSnap.data()?.debtToState, minPrice);
      tx.update(sellerRef, {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
      tx.delete(machineRef);
      tx.set(listingRef, {
        sellerId: 'system',
        sellerName: 'Sistem',
        itemType,
        machineType: m.type,
        price: Math.ceil(minPrice * 1.1),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else {
    throw new HttpsError('invalid-argument', 'Geçersiz ürün türü.');
  }

  return { ok: true, listingId: listingRef.id, payout };
});

export const cancelListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { listingId } = request.data || {};
  const listingRef = db.collection('marketplaceListings').doc(listingId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(listingRef);
    if (!snap.exists) {
      throw new HttpsError('failed-precondition', 'İlan bulunamadı.');
    }
    const listing = snap.data();
    if (listing.sellerId !== uid) {
      throw new HttpsError('permission-denied', 'Bu ilan size ait değil.');
    }
    if (listing.sold) {
      throw new HttpsError('failed-precondition', 'Bu ilan zaten satılmış.');
    }

    if (listing.itemType === 'vehicle') {
      tx.update(db.collection('vehicles').doc(listing.vehicleId), { listed: false });
    } else if (listing.itemType === 'weapon') {
      tx.update(db.collection('weapons').doc(listing.weaponId), { listed: false });
    } else if (listing.itemType === 'material') {
      const inventoryRef = db
        .collection('users')
        .doc(uid)
        .collection('inventory')
        .doc(listing.materialType);
      tx.set(
        inventoryRef,
        { quantity: admin.firestore.FieldValue.increment(listing.quantity) },
        { merge: true }
      );
    } else if (listing.itemType === 'machine') {
      const factoryMachinesRef = db.collection('factories').doc(uid).collection('machines');
      tx.set(factoryMachinesRef.doc(), {
        type: listing.machineType,
        workerId: null,
        workerName: null,
        lastProducedDateKey: null,
        lastProducedQty: 0,
        purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    tx.update(listingRef, { sold: true, cancelled: true });
  });

  return { ok: true };
});

// buyListing — araç/silah/makine ilanları TÜMÜYLE satın alınır. MALZEME
// ilanlarında istenen kadar ADET satın alınabilir (listingId + quantity);
// ilan tükenmeden kalan miktar ilanda kalmaya devam eder, tükenince
// "sold" olarak işaretlenir.
export const buyListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { listingId, quantity } = request.data || {};
  const listingRef = db.collection('marketplaceListings').doc(listingId);
  const buyerRef = db.collection('users').doc(uid);

  let result = {};

  await db.runTransaction(async (tx) => {
    const [listingSnap, buyerSnap] = await Promise.all([tx.get(listingRef), tx.get(buyerRef)]);
    if (!listingSnap.exists) {
      throw new HttpsError('failed-precondition', 'İlan bulunamadı.');
    }
    const listing = listingSnap.data();
    if (listing.sold) {
      throw new HttpsError('failed-precondition', 'Bu ilan zaten satılmış.');
    }
    if (listing.sellerId === uid) {
      throw new HttpsError('failed-precondition', 'Kendi ilanını satın alamazsın.');
    }

    const isMaterial = listing.itemType === 'material';
    let qty = null;
    let cost = listing.price;
    let unitPrice = null;
    if (isMaterial) {
      qty = Number(quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
      }
      if (qty > (listing.quantity || 0)) {
        throw new HttpsError('failed-precondition', 'İlanda bu kadar ürün kalmadı.');
      }
      unitPrice = listing.unitPrice || Math.round(listing.price / (listing.quantity || 1));
      cost = unitPrice * qty;
    }

    const buyer = buyerSnap.data();
    if (!buyer || (buyer.gold || 0) < cost) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }

    // Firestore transaction kuralı: TÜM okumalar yazmalardan önce olmalı.
    const isSystemListing = listing.sellerId === 'system';
    const sellerRef = isSystemListing ? null : db.collection('users').doc(listing.sellerId);
    const sellerSnap = isSystemListing ? null : await tx.get(sellerRef);

    // Makine sadece bir fabrikaya yerleştirilebileceği için, alıcının
    // kendi fabrikası olmalı — yoksa makineyi "koyacak" bir yeri yok.
    if (listing.itemType === 'machine') {
      const buyerFactorySnap = await tx.get(db.collection('factories').doc(uid));
      if (!buyerFactorySnap.exists) {
        throw new HttpsError(
          'failed-precondition',
          'Bu makineyi almak için önce kendi fabrikanı kurman gerekir.'
        );
      }
    }

    // Alıcıdan fiyat düşülür (malzemede sadece alınan adedin karşılığı).
    tx.update(buyerRef, { gold: admin.firestore.FieldValue.increment(-cost) });

    // Satıcıya gelir — borç varsa Bölüm 10 kuralına göre bölüştürülür.
    // "Sistem" ilanlarında satıcı zaten anında ödemesini almıştı — bu para
    // kimseye gitmez, oyun ekonomisinden çıkar.
    if (!isSystemListing) {
      const { goldDelta, debtDelta } = splitIncomeForDebt(sellerSnap.data()?.debtToState, cost);
      tx.update(sellerRef, {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      });
    }

    // Ürünü transfer et.
    if (listing.itemType === 'vehicle') {
      tx.update(db.collection('vehicles').doc(listing.vehicleId), {
        ownerId: uid,
        listed: false,
      });
      tx.update(listingRef, {
        sold: true,
        buyerId: uid,
        soldAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (listing.itemType === 'weapon') {
      tx.update(db.collection('weapons').doc(listing.weaponId), {
        ownerId: uid,
        listed: false,
      });
      tx.update(listingRef, {
        sold: true,
        buyerId: uid,
        soldAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (isMaterial) {
      const inventoryRef = db
        .collection('users')
        .doc(uid)
        .collection('inventory')
        .doc(listing.materialType);
      tx.set(
        inventoryRef,
        { quantity: admin.firestore.FieldValue.increment(qty) },
        { merge: true }
      );
      const remaining = (listing.quantity || 0) - qty;
      if (remaining <= 0) {
        tx.update(listingRef, {
          quantity: 0,
          price: 0,
          sold: true,
          buyerId: uid,
          soldAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(listingRef, { quantity: remaining, price: unitPrice * remaining });
      }
    } else if (listing.itemType === 'machine') {
      const buyerMachinesRef = db.collection('factories').doc(uid).collection('machines');
      tx.set(buyerMachinesRef.doc(), {
        type: listing.machineType,
        workerId: null,
        workerName: null,
        lastProducedDateKey: null,
        lastProducedQty: 0,
        purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(listingRef, {
        sold: true,
        buyerId: uid,
        soldAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    result = { cost, quantity: qty, sellerId: listing.sellerId, itemType: listing.itemType };
  });

  if (result.sellerId && result.sellerId !== 'system') {
    let itemLabel = 'ürün';
    if (result.itemType === 'material') {
      itemLabel = `${result.quantity} adet malzeme`;
    } else {
      const freshSnap = await listingRef.get();
      const fresh = freshSnap.data();
      if (result.itemType === 'vehicle') itemLabel = fresh?.vehicleModel || 'araç';
      else if (result.itemType === 'weapon') itemLabel = fresh?.weaponName || 'silah';
      else if (result.itemType === 'machine') itemLabel = MACHINE_TYPES[fresh?.machineType]?.label || 'makine';
    }
    await db
      .collection('users')
      .doc(result.sellerId)
      .collection('messages')
      .add({
        text: `2. El: "${itemLabel}" ilanın ${result.cost.toLocaleString('tr-TR')} altına satıldı.`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        type: 'marketplace_sale',
      });
  }

  return { ok: true, cost: result.cost, quantity: result.quantity };
});

// =============================================================================
// CASINO — "10 NUMARA" KART OYUNU (kullanıcının verdiği prototipe göre)
// =============================================================================
//
// Kurallar:
//   - Masa kapasitesi 1-4 insan oyuncu (+ her zaman kurpiyer). 1 kişilik
//     masa doğrudan kurpiyere karşı oynanır.
//   - Masa KALICI: bir tur bitince aynı masada yeni tur (yeni el) başlanabilir.
//   - Masayı kuran, kart dağıtma anında masada oturan herkesi o TURA dahil
//     eder. Tur devam ederken katılan biri, bir SONRAKİ dağıtımda dahil olur.
//   - Bahis, dağıtım anında herkesten (kurpiyer hariç) tek seferlik kesilir,
//     ortaya (pot) toplanır. Amaç 10'a en yakın (aşmadan) toplamı yapmak.
//   - Kart değerleri 1-5. Toplam 10'u geçerse (bust) elenir.
//   - Her oyuncunun hamlesi (kart çek/pas) için 10 saniyesi var; süre
//     dolarsa otomatik pas geçilir.
//   - Herkes bitince kurpiyer otomatik oynar (8'e kadar çeker). Kazanan(lar)
//     — kurpiyer dahil en yüksek (elenmemiş) toplamı yapan(lar) — arasında
//     kurpiyer varsa pot kimseye ödenmez (kasaya gider); sadece insan
//     oyuncular kazandıysa pot aralarında eşit bölünür.
//   - 10 Numara'dan kazanılan para ASLA otomatik borca gitmez (Bölüm 10
//     istisnası — kullanıcının özel talebi).
//   - Bahis miktarı kadar altının yoksa masaya giremezsin; tur esnasında
//     (dağıtım anında) altının bahisin altındaysa masadan atılırsın.
// =============================================================================

const ON_NUMARA_TARGET = 10;
const ON_NUMARA_DEALER_STAND_AT = 8;
const ON_NUMARA_TURN_SECONDS = 10;
const ON_NUMARA_EMOJIS = ['😂', '😢', '😡', '😮', '👍', '🔥'];
const RACE_EMOJIS = ['😂', '😢', '😡', '😮', '👍', '🔥'];

// sendRaceEmoji — 10 Numara'daki emoji tepki sistemiyle birebir aynı,
// yarış odaları için.
export const sendRaceEmoji = onCall(async (request) => {
  const uid = requireAuth(request);
  const { roomId, emoji } = request.data || {};
  if (!RACE_EMOJIS.includes(emoji)) {
    throw new HttpsError('invalid-argument', 'Geçersiz emoji.');
  }
  await db
    .collection('raceRooms')
    .doc(roomId)
    .update({ [`reactions.${uid}`]: { emoji, at: Date.now() } });
  return { ok: true };
});

function drawOnNumaraCard() {
  return 1 + Math.floor(Math.random() * 5);
}

function sumCards(cards) {
  return cards.reduce((a, b) => a + b, 0);
}

export const createOnNumaraTable = onCall(async (request) => {
  const uid = requireAuth(request);
  const { capacity, betAmount } = request.data || {};
  const cap = Number(capacity);
  const bet = Number(betAmount);
  if (![1, 2, 3, 4].includes(cap)) {
    throw new HttpsError('invalid-argument', 'Masa kapasitesi 1-4 arasında olmalı.');
  }
  if (!Number.isInteger(bet) || bet <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz bahis miktarı.');
  }
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  if (!user || (user.gold || 0) < bet) {
    throw new HttpsError('failed-precondition', 'Yetersiz altın.');
  }

  const tableRef = db.collection('onNumaraTables').doc();
  await tableRef.set({
    status: 'open',
    capacity: cap,
    betAmount: bet,
    creatorUid: uid,
    seatOrder: [uid],
    seats: { [uid]: { displayName: user.displayName || 'Oyuncu', netChange: 0 } },
    round: null,
    reactions: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, tableId: tableRef.id };
});

export const joinOnNumaraTable = onCall(async (request) => {
  const uid = requireAuth(request);
  const { tableId } = request.data || {};
  const tableRef = db.collection('onNumaraTables').doc(tableId);

  await db.runTransaction(async (tx) => {
    const [tableSnap, userSnap] = await Promise.all([
      tx.get(tableRef),
      tx.get(db.collection('users').doc(uid)),
    ]);
    if (!tableSnap.exists) throw new HttpsError('failed-precondition', 'Masa bulunamadı.');
    const table = tableSnap.data();
    if (table.seats[uid]) throw new HttpsError('failed-precondition', 'Zaten bu masadasın.');
    if (table.seatOrder.length >= table.capacity) {
      throw new HttpsError('failed-precondition', 'Masa dolu.');
    }
    const user = userSnap.data();
    if (!user || (user.gold || 0) < table.betAmount) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(tableRef, {
      seatOrder: admin.firestore.FieldValue.arrayUnion(uid),
      [`seats.${uid}`]: { displayName: user.displayName || 'Oyuncu', netChange: 0 },
    });
  });

  return { ok: true };
});

export const leaveOnNumaraTable = onCall(async (request) => {
  const uid = requireAuth(request);
  const { tableId } = request.data || {};
  const tableRef = db.collection('onNumaraTables').doc(tableId);

  await db.runTransaction(async (tx) => {
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists) return;
    const table = tableSnap.data();
    const newSeatOrder = (table.seatOrder || []).filter((u) => u !== uid);

    const updates = {
      seatOrder: newSeatOrder,
      [`seats.${uid}`]: admin.firestore.FieldValue.delete(),
    };

    if (newSeatOrder.length === 0) {
      // Masada kimse kalmadı — "Açık Masalar"dan kaybolsun.
      updates.status = 'closed';
    } else if (table.creatorUid === uid) {
      // Masayı kuran ayrıldı — kart dağıtma yetkisi sıradaki oyuncuya geçer.
      updates.creatorUid = newSeatOrder[0];
    }

    tx.update(tableRef, updates);
  });

  return { ok: true };
});

// dealCards — masayı kuran, oturan herkesle yeni bir el başlatır.
export const dealOnNumaraCards = onCall(async (request) => {
  const uid = requireAuth(request);
  const { tableId } = request.data || {};
  const tableRef = db.collection('onNumaraTables').doc(tableId);

  await db.runTransaction(async (tx) => {
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists) throw new HttpsError('failed-precondition', 'Masa bulunamadı.');
    const table = tableSnap.data();
    if (table.creatorUid !== uid) {
      throw new HttpsError('permission-denied', 'Sadece masayı kuran kart dağıtabilir.');
    }
    if (table.round && table.round.phase === 'playing') {
      throw new HttpsError('failed-precondition', 'Bu el zaten devam ediyor.');
    }

    // Bahis karşılayamayanları masadan at, kalanları kontrol et.
    const seatUids = table.seatOrder || [];
    const userRefs = seatUids.map((u) => db.collection('users').doc(u));
    const userSnaps = await Promise.all(userRefs.map((r) => tx.get(r)));
    const eligible = [];
    const kicked = [];
    seatUids.forEach((u, i) => {
      const g = userSnaps[i].data()?.gold || 0;
      if (g >= table.betAmount) eligible.push(u);
      else kicked.push(u);
    });
    if (eligible.length === 0) {
      throw new HttpsError('failed-precondition', 'Masada yeterli altınlı kimse yok.');
    }

    // Bahisleri kes.
    eligible.forEach((u) => {
      const ref = db.collection('users').doc(u);
      tx.update(ref, { gold: admin.firestore.FieldValue.increment(-table.betAmount) });
    });

    // Kartları dağıt.
    const hands = {};
    eligible.forEach((u) => {
      const cards = [drawOnNumaraCard(), drawOnNumaraCard()];
      const total = sumCards(cards);
      hands[u] = { cards, status: total >= ON_NUMARA_TARGET ? 'stand' : 'playing' };
    });
    const dealerCards = [drawOnNumaraCard(), drawOnNumaraCard()];

    // İlk sırası "playing" durumunda olan katılımcı.
    const firstTurnUid = eligible.find((u) => hands[u].status === 'playing') || null;

    const newSeats = { ...table.seats };
    const newSeatOrder = eligible.slice();
    kicked.forEach((u) => {
      delete newSeats[u];
    });
    eligible.forEach((u) => {
      const prevNet = typeof newSeats[u]?.netChange === 'number' ? newSeats[u].netChange : 0;
      newSeats[u] = {
        ...newSeats[u],
        netChange: prevNet - table.betAmount,
      };
    });

    tx.update(tableRef, {
      seats: newSeats,
      seatOrder: newSeatOrder,
      round: {
        phase: firstTurnUid ? 'playing' : 'dealer',
        participants: eligible,
        hands,
        dealerCards,
        dealerStatus: 'playing',
        // Kurpiyer de ortaya kendi bahsi kadar para koyar (Bölüm — kullanıcı
        // revizesi: "kasa hep daha fazla kazanmaya meyilli" olmasın diye).
        // İyi oynayan tek başına da kurpiyerden para kazanabilsin.
        pot: table.betAmount * (eligible.length + 1),
        currentTurnUid: firstTurnUid,
        turnDeadline: firstTurnUid
          ? admin.firestore.Timestamp.fromMillis(Date.now() + ON_NUMARA_TURN_SECONDS * 1000)
          : null,
        result: null,
      },
    });
  });

  // Eğer kimsenin ilk hamlesi yoksa (herkes 10'a ulaştıysa) doğrudan
  // kurpiyer aşamasına geç.
  await resolveOnNumaraIfDealerPhase(tableId);

  return { ok: true };
});

// Sıradaki "playing" katılımcıyı bulur; yoksa null (kurpiyer sırası demek).
function findNextTurnUid(participants, hands, afterUid) {
  const startIdx = afterUid ? participants.indexOf(afterUid) + 1 : 0;
  for (let i = startIdx; i < participants.length; i++) {
    if (hands[participants[i]].status === 'playing') return participants[i];
  }
  return null;
}

// Kurpiyer otomatik oynar + sonucu belirler (aynı transaction dışında,
// ayrı bir adım olarak çağrılabilir — dealOnNumaraCards ve
// resolveOnNumaraAction tarafından kullanılır).
async function resolveOnNumaraIfDealerPhase(tableId) {
  const tableRef = db.collection('onNumaraTables').doc(tableId);

  await db.runTransaction(async (tx) => {
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists) return;
    const table = tableSnap.data();
    const round = table.round;
    if (!round || round.phase !== 'dealer') return;

    // Kurpiyer: 8'e ulaşana ya da patlayana kadar çeker.
    let dealerCards = [...round.dealerCards];
    let dealerStatus = 'playing';
    while (true) {
      const total = sumCards(dealerCards);
      if (total > ON_NUMARA_TARGET) {
        dealerStatus = 'bust';
        break;
      }
      if (total >= ON_NUMARA_DEALER_STAND_AT) {
        dealerStatus = 'stand';
        break;
      }
      dealerCards.push(drawOnNumaraCard());
    }

    const participants = round.participants;
    const hands = round.hands;
    const contenders = participants.filter((u) => hands[u].status !== 'bust');
    const dealerIn = dealerStatus !== 'bust';
    const dealerSum = sumCards(dealerCards);

    // Kurpiyer DE battı, oyuncu(lar) da battı — kimse "kazanmadı" ama
    // kimse de "kaybetmedi" sayılır: BERABERE, herkes kendi bahsini geri
    // alır (cepten hiçbir şey eksilmez).
    if (!dealerIn && contenders.length === 0) {
      const refundRefs = participants.map((u) => db.collection('users').doc(u));
      const newSeatsRefund = { ...table.seats };
      participants.forEach((u, i) => {
        tx.update(refundRefs[i], { gold: admin.firestore.FieldValue.increment(table.betAmount) });
        if (newSeatsRefund[u]) {
          const prevNet = typeof newSeatsRefund[u].netChange === 'number' ? newSeatsRefund[u].netChange : 0;
          newSeatsRefund[u] = {
            ...newSeatsRefund[u],
            netChange: prevNet + table.betAmount,
          };
        }
      });
      tx.update(tableRef, {
        seats: newSeatsRefund,
        round: {
          ...round,
          phase: 'resolved',
          dealerCards,
          dealerStatus,
          currentTurnUid: null,
          turnDeadline: null,
          result: {
            winners: [],
            dealerWon: false,
            dealerTied: false,
            draw: true,
            bestSum: null,
            share: 0,
          },
        },
      });
      return;
    }

    // Kazananları belirle — kurpiyer de (kendi payını koyduğu için) bir
    // "yarışmacı" gibi değerlendirilir. En yüksek toplamı yapanlar arasında
    // kurpiyer de varsa, pot o kadar kişiye bölünür ama kurpiyerin payı
    // kimseye ödenmez (kasada kalır) — böylece TAM beraberlikte oyuncu da
    // payını alır, kurpiyer TEK BAŞINA en yüksek toplamı yaparsa kimse
    // ödeme almaz.
    let bestSum = dealerIn ? dealerSum : -1;
    contenders.forEach((u) => {
      const s = sumCards(hands[u].cards);
      if (s > bestSum) bestSum = s;
    });

    const humanWinners = contenders.filter((u) => sumCards(hands[u].cards) === bestSum);
    const dealerIsWinner = dealerIn && dealerSum === bestSum;
    const totalWinnerSlots = humanWinners.length + (dealerIsWinner ? 1 : 0);

    // Firestore transaction kuralı: tüm okumalar yazmalardan önce.
    const winnerRefs = humanWinners.map((u) => db.collection('users').doc(u));

    const updatedHands = { ...hands };
    const newSeatsWin = { ...table.seats };
    const share = totalWinnerSlots > 0 ? Math.floor(round.pot / totalWinnerSlots) : 0;
    if (humanWinners.length > 0 && share > 0) {
      humanWinners.forEach((u, i) => {
        updatedHands[u] = { ...hands[u], status: 'won' };
        // 10 Numara kazancı borca gitmez — direkt altına eklenir.
        tx.update(winnerRefs[i], { gold: admin.firestore.FieldValue.increment(share) });
        if (newSeatsWin[u]) {
          const prevNet = typeof newSeatsWin[u].netChange === 'number' ? newSeatsWin[u].netChange : 0;
          newSeatsWin[u] = {
            ...newSeatsWin[u],
            netChange: prevNet + share,
          };
        }
      });
    }

    tx.update(tableRef, {
      seats: newSeatsWin,
      round: {
        ...round,
        phase: 'resolved',
        dealerCards,
        dealerStatus,
        hands: updatedHands,
        currentTurnUid: null,
        turnDeadline: null,
        result: {
          winners: humanWinners,
          dealerWon: dealerIsWinner && humanWinners.length === 0,
          dealerTied: dealerIsWinner && humanWinners.length > 0,
          bestSum,
          share,
        },
      },
    });
  });
}

// Ortak hamle çözümleme — onNumaraHit / onNumaraStand / autoStand kullanır.
async function resolveOnNumaraAction({ tableId, uid, action }) {
  const tableRef = db.collection('onNumaraTables').doc(tableId);

  await db.runTransaction(async (tx) => {
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists) throw new HttpsError('failed-precondition', 'Masa bulunamadı.');
    const table = tableSnap.data();
    const round = table.round;
    if (!round || round.phase !== 'playing' || round.currentTurnUid !== uid) {
      throw new HttpsError('failed-precondition', 'Sıra sende değil.');
    }

    const hand = { ...round.hands[uid] };
    if (action === 'hit') {
      hand.cards = [...hand.cards, drawOnNumaraCard()];
      const total = sumCards(hand.cards);
      if (total > ON_NUMARA_TARGET) hand.status = 'bust';
      else if (total >= ON_NUMARA_TARGET) hand.status = 'stand';
      // total < 10 ise 'playing' kalır, aynı oyuncunun sırası devam eder.
    } else {
      hand.status = 'stand';
    }

    const newHands = { ...round.hands, [uid]: hand };
    const stillMyTurn = hand.status === 'playing';
    const nextTurnUid = stillMyTurn ? uid : findNextTurnUid(round.participants, newHands, uid);

    tx.update(tableRef, {
      round: {
        ...round,
        hands: newHands,
        phase: nextTurnUid ? 'playing' : 'dealer',
        currentTurnUid: nextTurnUid,
        turnDeadline: nextTurnUid
          ? admin.firestore.Timestamp.fromMillis(Date.now() + ON_NUMARA_TURN_SECONDS * 1000)
          : null,
      },
    });
  });

  await resolveOnNumaraIfDealerPhase(tableId);
}

export const onNumaraHit = onCall(async (request) => {
  const uid = requireAuth(request);
  const { tableId } = request.data || {};
  await resolveOnNumaraAction({ tableId, uid, action: 'hit' });
  return { ok: true };
});

export const onNumaraStand = onCall(async (request) => {
  const uid = requireAuth(request);
  const { tableId } = request.data || {};
  await resolveOnNumaraAction({ tableId, uid, action: 'stand' });
  return { ok: true };
});

// onNumaraAutoStand — 10 saniye dolunca herhangi bir bağlı istemci
// tarafından tetiklenir, sırası gelen oyuncuyu otomatik pas geçirir.
export const onNumaraAutoStand = onCall(async (request) => {
  requireAuth(request);
  const { tableId } = request.data || {};
  const tableSnap = await db.collection('onNumaraTables').doc(tableId).get();
  if (!tableSnap.exists) return { ok: true, skipped: true };
  const round = tableSnap.data().round;
  if (!round || round.phase !== 'playing' || !round.turnDeadline) {
    return { ok: true, skipped: true };
  }
  if (round.turnDeadline.toMillis() > Date.now()) {
    return { ok: true, skipped: true };
  }
  await resolveOnNumaraAction({ tableId, uid: round.currentTurnUid, action: 'stand' });
  return { ok: true };
});

// sendOnNumaraEmoji — masadaki oyunculara kısa ömürlü emoji tepkisi.
export const sendOnNumaraEmoji = onCall(async (request) => {
  const uid = requireAuth(request);
  const { tableId, emoji } = request.data || {};
  if (!ON_NUMARA_EMOJIS.includes(emoji)) {
    throw new HttpsError('invalid-argument', 'Geçersiz emoji.');
  }
  await db
    .collection('onNumaraTables')
    .doc(tableId)
    .update({ [`reactions.${uid}`]: { emoji, at: Date.now() } });
  return { ok: true };
});

// pingRoom — "Yenile" butonu için. Emoji göndermekle AYNI mekanizmayı
// (ilgili oda/masa dokümanına bir yazma işlemi) tetikler — kullanıcıların
// gözlemine göre, donan bağlantıyı asıl düzelten şey network'ü
// kapatıp-açmak değil, dokümana yeni bir YAZMA gelmesiymiş. `reactions`
// alanına DEĞİL, ayrı bir `lastPing` alanına yazıyoruz — böylece hiçbir
// oyuncuya emoji atılmış gibi görünmez.
export const pingRoom = onCall(async (request) => {
  const uid = requireAuth(request);
  const { collectionName, docId } = request.data || {};
  if (!['onNumaraTables', 'raceRooms'].includes(collectionName)) {
    throw new HttpsError('invalid-argument', 'Geçersiz koleksiyon.');
  }
  await db
    .collection(collectionName)
    .doc(docId)
    .update({ [`lastPing.${uid}`]: Date.now() });
  return { ok: true };
});
