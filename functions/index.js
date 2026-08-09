import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { VEHICLE_CATALOG, WEAPON_CATALOG } from './catalogData.js';

admin.initializeApp();
const db = admin.firestore();

// DİKKAT: Bu bölge, istemcideki VITE_FIREBASE_FUNCTIONS_REGION ile
// (src/firebase.js) birebir aynı olmalı, yoksa çağrılar 404 döner.
setGlobalOptions({ region: 'europe-west1' });

// ADMIN_UIDS — oyunculardan gizli, sadece geliştiriciye açık aksiyonlar
// (örn. transfer piyasasını elle anında yeniden kurma) için basit bir
// izin listesi. Firebase Console > Authentication > Users sekmesinden
// kendi hesabının UID'sini kopyalayıp buraya ekle — src/config/admin.js
// içindeki liste de BİREBİR AYNI UID(ler) ile güncellenmeli (istemci
// tarafında butonun görünürlüğünü kontrol eden yer orası).
const ADMIN_UIDS = ['REPLACE_WITH_YOUR_FIREBASE_AUTH_UID'];

function requireAdmin(request) {
  const uid = requireAuth(request);
  if (!ADMIN_UIDS.includes(uid)) {
    throw new HttpsError('permission-denied', 'Bu aksiyon sadece yöneticiye açık.');
  }
  return uid;
}

// ---------------------------------------------------------------------------
// FABRİKA SİSTEMİ (oyuncu kurduğu/işlettiği fabrikalar) — Bölüm 6/8.2'nin
// yerini alır. Her oyuncu en fazla 1 fabrika kurabilir (satılamaz), içine
// istediği kadar makine koyabilir. Makineler (mining hariç) işçi gerektirir;
// işçi "Üretim Yap"a bastıkça hem maaşını alır hem patronun envanterine
// rastgele (min-max arası) ürün eklenir. Mining makinesi işçi gerektirmez
// ve arayüzde tek tek değil TEK bir panelde ("Mining Makinesi ×N")
// gösterilir — sahibi HER GÜN bu panelin TEK "Üretim Yap" butonuyla, sahip
// olduğu TÜM mining makinelerini (kaç tane olursa olsun) AYNI ANDA
// tetikler; tetiklenen üretim o gece 00:00'da tamamlanır ve kripto
// bakiyesine eklenir (bkz. triggerAllMining / dailyReset).
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

// 2. el satış değeri artık hem ÖMÜR hem KALAN TAMİR HAKKI birlikte
// hesaplanır (kullanıcı revizesi, 2. sürüm): sadece tamir hakkına bakmak da
// eksikti — mesela ömrü 0'a düşmüş (henüz tamir edilmemiş, tamir hakkı hâlâ
// dolu) bir araç bu şekilde "tam fiyat" görünüyordu, ki o an fiilen
// kullanılamaz durumda. Formül: (kalanTamirHakkı × 3) + kalanÖmür.
// Maksimum: 10 tamir hakkının hepsi duruyorsa (10×3=30) + tam ömür (30) =
// 60 → oran 1 (tam fiyat). Örnek: tamir hakkının hepsi dolu ama ömür 0 ise
// 30/60 = ratio 0.5 (yarı fiyat) — mantıklı, çünkü tamir edilmeden
// kullanılamıyor. Tamir hakkı bitmiş (0) ama ömür hâlâ tam (30) ise yine
// 30/60 = ratio 0.5 — bu da mantıklı, çünkü bir daha hiç tamir edilemeyecek
// ve yakında hurdaya çıkacak.
function valueRatioOf(item) {
  const repairsUsed = item?.repairsUsed || 0;
  const remainingRepairs = Math.max(0, VEHICLE_WEAPON_MAX_REPAIRS - repairsUsed);
  const lifeDays = Math.max(0, item?.lifeDays ?? VEHICLE_WEAPON_INITIAL_LIFE_DAYS);
  const combined = remainingRepairs * REPAIR_LIFE_BONUS_DAYS + lifeDays;
  const maxCombined = VEHICLE_WEAPON_MAX_REPAIRS * REPAIR_LIFE_BONUS_DAYS + VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
  return Math.max(0, Math.min(1, combined / maxCombined));
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

// logNewsEvent — kullanıcı revizesi: telefonda bir "gazete" olsun, gün
// içinde olan biten (soygun, tutuklama, futbol sonuçları, sezon sonu vb.)
// haber olarak gözüksün. Bu fonksiyon, olay gerçekleştiği anda kısa/
// ANONİM (kimlik açıklamayan) bir özet yazıyor — piyango ve şampiyona
// zaten kendi koleksiyonlarında (lottery/championshipDaily) yeterince
// veri tuttuğu için onlar için ayrıca log YOK, sadece Faz Newspaper
// ekranı doğrudan o koleksiyonlardan okuyor. Hata olursa (log yazımı
// başarısız olursa) oyunun asıl akışını ASLA bozmasın diye best-effort/
// sessiz.
async function logNewsEvent(type, payload = {}) {
  try {
    await db.collection('newsEvents').add({
      type,
      dateKey: istanbulDateKey(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...payload,
    });
  } catch (err) {
    console.error('logNewsEvent hata:', type, err);
  }
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

// triggerMining — mining makineleri işçi gerektirmez ama artık OTOMATİK
// üretmiyor (kullanıcı revizesi): sahibi her gün bu fonksiyonu çağırıp
// (Fabrika ekranındaki "Üretim Yap" butonu) o günkü üretimi TETİKLEMELİ.
// Tetiklenen makine, o günün 00:00'ında (bir sonraki dailyReset'te)
// rastgele bir miktar kripto üretir ve sahibine SMS gider — bkz.
// dailyReset içindeki mining bloğu. Diğer makine türlerinden farkı: tek
// bir "iş" slotuna bağlı değil, sahibi o gün TÜM mining makinelerini
// (kaç tane olursa olsun) ayrı ayrı tetikleyebilir.
// triggerAllMining — mining makineleri işçi gerektirmez ama artık OTOMATİK
// üretmiyor (kullanıcı revizesi): sahibi her gün bu fonksiyonu çağırıp
// (Fabrika ekranındaki TEK "Üretim Yap" butonu) o günkü üretimi
// TETİKLEMELİ. Kullanıcı revizesi 2. sürüm: mining makineleri artık ayrı
// ayrı kartlar hâlinde değil, TEK bir panelde ("Mining Makinesi ×N")
// gösteriliyor ve bu buton sahip olunan TÜM mining makinelerini (kaç tane
// olursa olsun) TEK seferde tetikliyor. Tetiklenen makineler, o günün
// 00:00'ında (bir sonraki dailyReset'te) rastgele bir miktar kripto üretir
// ve sahibine TEK bir SMS gider — bkz. dailyReset içindeki mining bloğu.
export const triggerAllMining = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const machinesRef = db.collection('factories').doc(uid).collection('machines');
  const machinesSnap = await machinesRef.where('type', '==', 'mining').get();
  if (machinesSnap.empty) {
    throw new HttpsError('failed-precondition', 'Hiç mining makinen yok.');
  }
  const untriggered = machinesSnap.docs.filter((m) => m.data().miningTriggeredDateKey !== dateKey);
  if (untriggered.length === 0) {
    throw new HttpsError('failed-precondition', 'Bugün zaten tüm mining makinelerini tetikledin.');
  }
  const batch = db.batch();
  untriggered.forEach((m) => batch.update(m.ref, { miningTriggeredDateKey: dateKey }));
  await batch.commit();

  return { ok: true, triggeredCount: untriggered.length, totalCount: machinesSnap.size };
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

    // 0) BORSA BÜLTENİ ANLIK GÖRÜNTÜSÜ (Gazete > Borsa Bülteni) — elmas/
    // hisse/kripto fiyatları hourlyInvestmentUpdate ile SAATTE BİR
    // değişmeye devam ediyor (alım/satım hep canlı fiyattan olur), ama
    // gazetedeki bülten sadece burada, gece 00:00'da bir kez "dondurulan"
    // bir anlık görüntü. Böylece gazete gün içinde sabit kalır, sadece
    // ertesi gece yenilenir.
    {
      const bulletinRef = db.collection('newspaperBulletin').doc('current');
      const [prevBulletinSnap, liveInvestmentSnap] = await Promise.all([
        bulletinRef.get(),
        db.collection('investments').doc('current').get(),
      ]);
      const prevBulletin = prevBulletinSnap.exists ? prevBulletinSnap.data() : null;
      const live = liveInvestmentSnap.exists ? liveInvestmentSnap.data() : DEFAULT_PRICES;
      await bulletinRef.set({
        dateKey,
        diamondPrice: live.diamondPrice ?? DEFAULT_PRICES.diamondPrice,
        stockPrice: live.stockPrice ?? DEFAULT_PRICES.stockPrice,
        cryptoPrice: live.cryptoPrice ?? DEFAULT_PRICES.cryptoPrice,
        prevDiamondPrice: prevBulletin?.diamondPrice ?? live.diamondPrice ?? DEFAULT_PRICES.diamondPrice,
        prevStockPrice: prevBulletin?.stockPrice ?? live.stockPrice ?? DEFAULT_PRICES.stockPrice,
        prevCryptoPrice: prevBulletin?.cryptoPrice ?? live.cryptoPrice ?? DEFAULT_PRICES.cryptoPrice,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

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
    // düşürüldü — eski (50 güne göre yaşlanmış) kayıtları yeni tavana
    // çeker. runVehicleWeaponLifeCapMigration kendi içinde bir bayrak
    // dokümanıyla (migrations/vehicleWeaponLifeCap) korunuyor, bu yüzden
    // sistemde toplamda sadece bir kez gerçek iş yapar.
    await runVehicleWeaponLifeCapMigration();

    // -0.5) Mining makineleri işçi gerektirmez ama artık otomatik de
    // üretmiyor (kullanıcı revizesi) — sadece sahibinin dün (bugünün
    // 00:00'ından önceki gün) triggerAllMining ile TETİKLEDİĞİ makineler
    // üretim yapar. Aynı sahibin birden çok tetiklenmiş makinesi varsa
    // hepsi ayrı ayrı üretir, toplamı TEK bir SMS ile bildirilir.
    {
      const prevDateKey = addDaysToDateKey(dateKey, -1);
      const miningSnap = await db.collectionGroup('machines').where('type', '==', 'mining').get();
      const triggeredDocs = miningSnap.docs.filter((m) => m.data().miningTriggeredDateKey === prevDateKey);
      const miningJobs = [];
      const producedByOwner = new Map();
      triggeredDocs.forEach((m) => {
        const factoryId = m.ref.parent.parent.id;
        const qty = randomInRange(MACHINE_TYPES.mining.min, MACHINE_TYPES.mining.max);
        miningJobs.push(
          db
            .collection('users')
            .doc(factoryId)
            .update({ cryptoHoldings: admin.firestore.FieldValue.increment(qty) })
        );
        producedByOwner.set(factoryId, (producedByOwner.get(factoryId) || 0) + qty);
      });
      await Promise.all(miningJobs);

      const smsJobs = [];
      producedByOwner.forEach((totalQty, ownerId) => {
        smsJobs.push(
          db
            .collection('users')
            .doc(ownerId)
            .collection('messages')
            .add({
              text: `Mining makinen bu gece ${totalQty.toFixed(4)} kripto üretti. Kripto bakiyene eklendi.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'mining_production',
            })
        );
      });
      await Promise.all(smsJobs);
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
    // en az turda bitiren TÜM oyuncular büyük ödülü (galeri fiyatının 1/5'i,
    // bölünmeden, herkese tam) kazanır.
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
        const leaders =
          champ.leaders && champ.leaders.length
            ? champ.leaders
            : [{ uid: champ.leaderUid, name: champ.leaderName, vehicleModel: champ.leaderVehicleModel }];
        const reward = Math.round(
          (VEHICLE_CATALOG[catalogId]?.price || 0) * CHAMPIONSHIP_REWARD_RATIO
        );
        for (const leader of leaders) {
          const winnerRef = db.collection('users').doc(leader.uid);
          const winnerSnap = await winnerRef.get();
          const { goldDelta, debtDelta } = splitIncomeForDebt(winnerSnap.data()?.debtToState, reward);
          await winnerRef.update({
            gold: admin.firestore.FieldValue.increment(goldDelta),
            debtToState: admin.firestore.FieldValue.increment(debtDelta),
          });
          await winnerRef.collection('messages').add({
            text: `Tebrikler! ${VEHICLE_CATALOG[catalogId]?.name} şampiyonasını ${champ.leaderTurns} turda tamamlayarak kazandın. Ödül: ${reward.toLocaleString('tr-TR')} altın.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            type: 'championship_win',
          });
        }
        await champRef.update({
          finalized: true,
          winnerUid: champ.leaderUid,
          winnerName: champ.leaderName,
          winnerVehicleModel: champ.leaderVehicleModel,
          winnerTurns: champ.leaderTurns,
          winners: leaders,
          rewardAmount: reward,
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
      // bankCostBasis — kullanıcı revizesi: "faizdeki paranın bize ne
      // kadar kâr/zarar ettirdiğini anlık görelim" — yatırdığımız
      // TOPLAM anaparayı ayrıca tutuyoruz (faiz bunu artırmaz, sadece
      // yatırma artırır) ki bankBalance - bankCostBasis her an net kâr
      // olsun.
      bankCostBasis: admin.firestore.FieldValue.increment(amt),
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
    const updates = {
      gold: admin.firestore.FieldValue.increment(amt),
      bankBalance: admin.firestore.FieldValue.increment(-amt),
    };
    // Kullanıcı revizesi: "parayı TAMAMEN çektiğimizde (kâr/zarar
    // sayacı) sıfırlansın, çekmediğimiz sürece aynı şekilde devam
    // etsin". Yani kısmi çekimlerde anapara takibini DEĞİŞTİRMİYORUZ —
    // sadece bakiye tamamen boşalınca (0'a inince) sıfırlıyoruz.
    if ((user.bankBalance || 0) - amt <= 0) {
      updates.bankCostBasis = 0;
    }
    tx.update(userRef, updates);
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
// INVESTMENT_COST_BASIS_FIELD — kullanıcı revizesi: yatırımların (elmas/
// hisse/kripto) anlık kâr/zararını görebilmek için, o varlığa o ana
// kadar yatırılmış TOPLAM altını (anaparayı) ayrıca tutuyoruz. Kâr/zarar
// = güncel değer - bu alan. Varlık TAMAMEN satılınca (0'a inince)
// sıfırlanır, kısmi satışta değişmez (bkz. depositToBank/withdrawFromBank
// üzerindeki aynı mantığın notu).
const INVESTMENT_COST_BASIS_FIELD = {
  diamond: 'diamondCostBasis',
  stock: 'stockCostBasis',
  crypto: 'cryptoCostBasis',
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
  const costBasisField = INVESTMENT_COST_BASIS_FIELD[assetType];

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
      [costBasisField]: admin.firestore.FieldValue.increment(goldAmount),
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
  const costBasisField = INVESTMENT_COST_BASIS_FIELD[assetType];

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

    const updates = {
      gold: admin.firestore.FieldValue.increment(totalValue),
      [holdingsField]: admin.firestore.FieldValue.increment(-units),
    };
    // Tamamen (ya da neredeyse tamamen — kesirli yuvarlama payı) satıldıysa
    // anapara takibini sıfırla; kısmi satışta dokunma.
    if (have - units <= 1e-9) {
      updates[costBasisField] = 0;
    }
    tx.update(userRef, updates);
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
// TELEFON — FLAPPY BIRD MİNİ OYUNU
// =============================================================================
// Tamamen istemci tarafında (canvas) oynanan basit bir reflex oyunu —
// sunucunun tek görevi, oyun bitince skoru KAYDETMEK. Her oyuncunun
// SADECE kişisel en iyi skoru tutuluyor (flappyScores/{uid}) — bu hem
// "genel en iyi 10" sorgusunu (tek koleksiyonu skora göre sıralamak
// yeterli) hem de "kendi rekorumu" göstermeyi kolaylaştırıyor. Skor
// üzerinde ucuz ama makul bir üst sınır kontrolü var (client tarafında
// sahte yüksek skor gönderilmesine karşı hafif bir engel — bu bir
// reflex oyunu olduğu için tam bir anti-cheat şart değil).
const FLAPPY_MAX_PLAUSIBLE_SCORE = 100000;

export const submitFlappyScore = onCall(async (request) => {
  const uid = requireAuth(request);
  const score = Math.round(Number(request.data?.score));
  if (!Number.isInteger(score) || score < 0 || score > FLAPPY_MAX_PLAUSIBLE_SCORE) {
    throw new HttpsError('invalid-argument', 'Geçersiz skor.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const displayName = userSnap.data()?.displayName || 'Oyuncu';

  const scoreRef = db.collection('flappyScores').doc(uid);
  let isNewBest = false;
  let best = score;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(scoreRef);
    const current = snap.exists ? snap.data().score || 0 : 0;
    if (score > current) {
      isNewBest = true;
      best = score;
      tx.set(
        scoreRef,
        { uid, displayName, score, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    } else {
      best = current;
    }
  });

  return { ok: true, isNewBest, best };
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
      // penaltyAmount/dateKey — Sixtagram "Bugün Yediğim Ceza" post eki bu
      // alanları okuyor (bkz. src/components/Sixtagram). Metinden regex
      // ile parse etmek yerine ayrı alanlar tutmak daha sağlam.
      penaltyAmount,
      dateKey: istanbulDateKey(),
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
    await logNewsEvent('arrest', { count: 1, totalFine: result.reward });
  } else {
    await logNewsEvent('heist_success', { target, amount: result.reward });
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

  // Gazete haberi — kimlik açıklamadan sadece SONUCU kaydediyoruz.
  if (caughtBySuspicion) {
    const totalFine = captureSmsList.reduce((sum, c) => sum + c.penaltyAmount, 0);
    await logNewsEvent('arrest', { count: captureSmsList.length, totalFine });
  } else if (busted) {
    await logNewsEvent('heist_stopped_by_police', { target: plan.target });
  } else {
    await logNewsEvent('heist_success', { target: plan.target, amount: totalReward });
  }

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
async function runVehicleWeaponLifeCapMigration() {
  // BUG DÜZELTMESİ: bu fonksiyon önceden App.jsx tarafından HER oturum
  // açılışında çağrılıyordu ve kendi içinde bir "zaten çalıştı mı" kontrolü
  // yoktu. "life > 29" koşulu YENİ tavan olan 30'u da kapsadığı için, her
  // girişte (hatta başka bir oyuncunun girişinde bile — tüm koleksiyonu
  // tarıyor) taze alınmış/tamir edilmiş 30 ömürlü araç ve silahlar da
  // yanlışlıkla 29'a çekiliyordu. Artık tek bir bayrak dokümanıyla bu iş
  // sistemde SADECE BİR KEZ (ilk çağrıda) yapılıyor, sonraki çağrılar anında
  // no-op dönüyor.
  const migrationRef = db.collection('migrations').doc('vehicleWeaponLifeCap');
  const migrationSnap = await migrationRef.get();
  if (migrationSnap.exists) return;

  for (const collName of ['vehicles', 'weapons']) {
    const snap = await db.collection(collName).get();
    const jobs = [];
    snap.forEach((docSnap) => {
      const item = docSnap.data();
      let life = item.lifeDays;
      let capped = false;
      if (typeof life === 'number' && life > VEHICLE_WEAPON_INITIAL_LIFE_DAYS) {
        life = VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
        capped = true;
      } else if (life === undefined) {
        // Ömür alanı hiç yoksa (çok eski kayıt), eski tavan (50) sayılırdı
        // — yeni tavana (30) çekiyoruz.
        life = VEHICLE_WEAPON_INITIAL_LIFE_DAYS;
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

  await migrationRef.set({ ranAt: admin.firestore.FieldValue.serverTimestamp() });
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
// NOT: Daha önce burada, art arda gelen zar atışlarını reddeden bir
// RACE_MIN_ROLL_INTERVAL_MS koruması vardı ("6 kere zar atılmış gibi
// başlama" bug'ına karşı). O bug'ın GERÇEK sebebi bulundu ve düzeltildi
// (RaceRoom.jsx'teki run() fonksiyonu, bir istek HATA alınca butonun
// kilidini hiç açmıyordu — bu artık düzeltildi). Bu koruma, gerçek
// sebep düzeltildikten sonra kullanıcıya çok sinir bozucu yanlış-pozitif
// "az önce zar attın" uyarıları vermeye başladığı için (kullanıcı
// revizesi) TAMAMEN KALDIRILDI.
const RACE_STATION_PRICES = { refuel: 10 };
const RACE_OFFSITE_FUEL_PRICE = 100;
const RACE_NITRO_PRICE = 50;
// Şampiyona ödülü, aracın galeri satış fiyatının 1/5'i (2 katına çıkarıldı).
const CHAMPIONSHIP_REWARD_RATIO = 0.2;

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
    if (u === 'bot') return; // bot'un gerçek bir users/{uid} dokümanı yok, ödeme alamaz
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
// NOT (performans): "araba yarışına ilk girdiğimde çok kasıyor, zar/vites
// tepki vermiyor" şikayeti Cloud Functions'ın "cold start"ı yüzünden
// oluyordu. İlk adım — 7 ayrı yarış aksiyonunu (rollDice, trainingRollDice,
// autoRoll, raceRefuel, raceBuyNitro, raceChangeGear, championshipRollDice)
// TEK bir Cloud Function'da (aşağıdaki raceHubAction) toplamak — maliyetsiz
// bir iyileşme sağladı ama YETERLİ OLMADI: functions/index.js dosyası çok
// büyüdüğü için (8000+ satır), her cold start'ta dosyanın tamamının
// yüklenmesi gerekiyor ve bu, dosya büyüdükçe daha da yavaşlıyor. Bu yüzden
// raceHubAction'a minInstances:1 eklendi (bkz. fonksiyon tanımı) — küçük
// bir aylık maliyet karşılığında cold start'ı tamamen ortadan kaldırıyor.
// RaceRoom ekranına girer girmez gönderilen "ping" aksiyonu da (warmUpRaceHub)
// ekstra bir güvenlik önlemi olarak duruyor.
// ---------------------------------------------------------------------------

// createRaceRoom — oda kurar (status: 'waiting', rakip yok).
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
    // NOT: antrenman odalarında ikinci katılımcı 'bot' — gerçek bir
    // users/{uid} dokümanı YOK, bu yüzden onu OKUMAYA bile çalışmıyoruz
    // (gereksiz bir Firestore okuması + potansiyel gecikme kaynağıydı).
    const userRefs = {};
    const userSnaps = {};
    for (const u of room.participantUids) {
      if (u === 'bot') continue;
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
// NOT (performans): bu ve aşağıdaki yarış aksiyonları (antrenman/
// otomatik zar, benzin, nitro, vites, şampiyona) artık AYRI Cloud
// Functions DEĞİL — hepsi tek bir "raceHubAction" callable'ının içinde
// birer dahili fonksiyon (bkz. dosyanın sonundaki raceHubAction, artık
// minInstances:1 ile sürekli sıcak bekliyor — cold start tamamen
// ortadan kalktı).
async function doRollDice(request) {
  const uid = requireAuth(request);
  const { roomId, useNitro, useTurbo } = request.data || {};
  const outcome = await resolveRoll({ roomId, uid, useNitro, useTurbo });
  return { ok: true, ...outcome };
}

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

// doCreateTrainingRace / doCreateChampionshipRace — kullanıcı revizesi:
// "şampiyona/antrenman başında 30 saniyelik donma devam ediyor" —
// sebebi bulundu: bu iki oda-kurma fonksiyonu raceHubAction'dan AYRI
// birer Cloud Function'dı, warmUpRaceHub SADECE raceHubAction'ı
// ısıtıyordu, bu ikisi HİÇ ısıtılmıyordu — her yeni antrenman/şampiyona
// başlatışında GERÇEK bir cold start yaşanıyordu. Artık bunlar da
// raceHubAction'ın içine taşındı, aynı sıcak instance'ı paylaşıyorlar.
async function doCreateTrainingRace(request) {
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
    // localMode — kullanıcı önerisi: botla antrenmanda sunucunun asıl işi
    // sadece hakkı/aracı doğrulayıp odayı açmak; zar/vites/nitro/benzin
    // mekaniği bundan sonra TAMAMEN istemcide çalışır (bkz.
    // src/hooks/useLocalRace.js), sunucuya tur başına hiçbir istek gitmez.
    // Bu bayrak istemciye "bu odada canlı dinlemeyi bırak, kendi simüle
    // et" sinyalini verir.
    localMode: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    players: {
      [uid]: freshRacePlayerState(user?.displayName || 'Oyuncu', vehicleId, vehicle),
      bot: freshBotPlayerState(lvl),
    },
  });

  return { ok: true, roomId: roomRef.id };
}

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

// autoRoll — 10 saniyelik süre dolduğunda, odadaki herhangi bir katılımcının
// istemcisi tarafından tetiklenir (sırası gelen oyuncu adına otomatik atar).
async function doAutoRoll(request) {
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
}

// ---------------------------------------------------------------------------
// Yarış içi satın almalar (istasyon, istasyon dışı benzin, nitro) ve vites —
// hepsi sadece SIRASI GELEN oyuncu tarafından kullanılabilir.
// ---------------------------------------------------------------------------
// raceRefuel — akıllı benzin doldurma: oyuncu tam bir istasyon karesindeyse
// (10 karede bir) 10 altına, değilse 100 altına tam dolum yapar. Tekerlek
// geliştirme / benzin tasarrufu seçenekleri kaldırıldı — istasyonda SADECE
// benzin doldurma var.
async function doRaceRefuel(request) {
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
}

async function doRaceBuyNitro(request) {
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
}

// raceChangeGear — 1. turda (hiç atmadıysa) tamamen kapalı. Sonraki
// turlarda o turun BAŞINDAKİ vitese göre en fazla ±1 değişebilir.
async function doRaceChangeGear(request) {
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
}

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

async function doCreateChampionshipRace(request) {
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
      // localMode — bkz. doCreateTrainingRace'teki aynı isimli notun
      // birebir aynısı: şampiyonada da rakip olmadığı için sunucunun tur
      // başına araya girmesine gerek yok, sadece BAŞINDA (hak kontrolü)
      // ve SONUNDA (liderlik tablosu — doFinishSoloRace) devrede.
      localMode: true,
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
}


// finishSoloRace — YEREL YARIŞ MİMARİSİ (kullanıcı önerisi — bkz. 4.
// madde): antrenman ve şampiyona artık zar/vites/nitro/benzin
// mekaniğinin TAMAMINI istemcide (src/lib/raceEngine.js +
// src/hooks/useLocalRace.js) çalıştırıyor, sunucuya tur başına HİÇBİR
// istek gitmiyor — bu yüzden cold-start/kuyruklama kaynaklı donmalar
// (özellikle şampiyona başında ve botun hamlesi sırasında yaşananlar)
// artık oluşamaz. Sunucunun görevi: (1) yarış başlarken araç/hak
// kontrolü (doCreateTrainingRace/doCreateChampionshipRace, değişmedi)
// ve (2) yarış bitince BURADA sonucu karara bağlamak. raceGold zaten
// yarış dışına hiç çıkmıyor (bkz. finalizeRace yorumu) — bu yüzden
// istemciden gelen ara pozisyon/benzin verilerine güvenmenin ekonomik
// bir riski yok, sadece GÖSTERİM amaçlı, clamp'lenerek yazılıyor.
// Şampiyonada turnsUsed'a (liderlik tablosunu etkilediği için) aracın
// gerçek istatistiklerine göre teorik bir alt sınır kontrolü uygulanıyor
// — tam bir RNG replay'i değil (bilinçli bir tercih), ama "1 turda
// bitirdim" gibi imkânsız sonuçları eler.
function cleanRacePlayer(incoming, fallback) {
  const maxFuel = fallback.maxFuel || 0;
  const maxGear = fallback.maxGear || 1;
  return {
    ...fallback,
    position: clamp(Math.round(Number(incoming?.position) || 0), 0, RACE_TRACK_LENGTH),
    fuel: clamp(Math.round(Number(incoming?.fuel) || 0), 0, maxFuel),
    raceGold: Math.max(0, Math.round(Number(incoming?.raceGold) || 0)),
    gear: clamp(Math.round(Number(incoming?.gear) || 1), 1, maxGear),
    turboCount: clamp(Math.round(Number(incoming?.turboCount) || 0), 0, fallback.turboTotal || 0),
    nitroActive: false,
    hasRolledOnce: true,
    finished: Boolean(incoming?.finished),
    lostByFuel: Boolean(incoming?.lostByFuel),
  };
}

async function doFinishSoloRace(request) {
  const uid = requireAuth(request);
  const { roomId, winnerUid, turnsUsed, outOfFuel, players } = request.data || {};
  const roomRef = db.collection('raceRooms').doc(roomId);

  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
  const room = roomSnap.data();
  if (room.creatorUid !== uid) {
    throw new HttpsError('failed-precondition', 'Bu oda size ait değil.');
  }
  if (!room.localMode || !(room.isTraining || room.isChampionship)) {
    throw new HttpsError('failed-precondition', 'Bu oda yerel modda değil.');
  }
  if (room.status !== 'racing') {
    return { ok: true, alreadyFinished: true };
  }

  const meIncoming = players?.[uid];
  if (!meIncoming || typeof meIncoming !== 'object') {
    throw new HttpsError('invalid-argument', 'Geçersiz sonuç verisi.');
  }
  const meClean = cleanRacePlayer(meIncoming, room.players[uid]);

  if (room.isTraining) {
    const botClean = players?.bot
      ? cleanRacePlayer(players.bot, room.players.bot)
      : room.players.bot;
    const finalWinner = winnerUid === 'bot' ? 'bot' : winnerUid === 'draw' ? 'draw' : uid;
    await roomRef.update({
      status: 'finished',
      winnerUid: finalWinner,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      [`players.${uid}`]: meClean,
      'players.bot': botClean,
    });
    await processTrainingReward(roomId);
    return { ok: true };
  }

  // --- Şampiyona ---
  if (outOfFuel) {
    await roomRef.update({
      status: 'finished',
      winnerUid: null,
      championshipResult: 'fuel_out',
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      [`players.${uid}`]: { ...meClean, lostByFuel: true },
    });
    return { ok: true };
  }

  const turns = Math.round(Number(turnsUsed));
  if (!Number.isInteger(turns) || turns < 1 || turns > 300) {
    throw new HttpsError('invalid-argument', 'Geçersiz tur sayısı.');
  }

  const me = room.players[uid];
  const maxStepsPerTurn = (me.maxGear || 1) * 6 * 3 + (me.wheelBonus || 0); // x3 = kombo (nitro+turbo)
  const theoreticalMinTurns = Math.max(1, Math.ceil(RACE_TRACK_LENGTH / Math.max(1, maxStepsPerTurn)));
  if (turns < theoreticalMinTurns) {
    throw new HttpsError('failed-precondition', 'Geçersiz sonuç.');
  }

  const champDailyRef = db
    .collection('championshipDaily')
    .doc(`${room.championshipCatalogId}_${room.championshipDateKey}`);

  await db.runTransaction(async (tx) => {
    const champDailySnap = await tx.get(champDailyRef);
    tx.update(roomRef, {
      status: 'finished',
      winnerUid: uid,
      championshipResult: 'completed',
      championshipTurns: turns,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      [`players.${uid}`]: { ...meClean, turnsUsed: turns, finished: true },
    });

    const champDaily = champDailySnap.exists ? champDailySnap.data() : null;
    const meName = me.displayName;
    const meVehicle = me.vehicleModel;
    if (!champDaily || !champDaily.leaderTurns || turns < champDaily.leaderTurns) {
      tx.set(
        champDailyRef,
        {
          catalogId: room.championshipCatalogId,
          dateKey: room.championshipDateKey,
          leaderUid: uid,
          leaderName: meName,
          leaderVehicleModel: meVehicle,
          leaderTurns: turns,
          leaders: [{ uid, name: meName, vehicleModel: meVehicle }],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (turns === champDaily.leaderTurns) {
      const existingLeaders =
        champDaily.leaders && champDaily.leaders.length
          ? champDaily.leaders
          : champDaily.leaderUid
            ? [
                {
                  uid: champDaily.leaderUid,
                  name: champDaily.leaderName,
                  vehicleModel: champDaily.leaderVehicleModel,
                },
              ]
            : [];
      if (!existingLeaders.some((l) => l.uid === uid)) {
        tx.update(champDailyRef, {
          leaders: [...existingLeaders, { uid, name: meName, vehicleModel: meVehicle }],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  });

  return { ok: true };
}

// raceHubAction — yukarıdaki 7 yarış aksiyonunun (rollDice, training,
// autoRoll, refuel, nitro, vites, şampiyona) TEK giriş noktası. Ayrıca
// istemcinin yarış ekranına girer girmez (kullanıcı henüz hiçbir butona
// basmadan) gönderdiği ücretsiz "ping" aksiyonunu da karşılar — bu, tek
// sıcak instance'ı kullanıcı daha zar atmadan ısıtmaya çalışır.
// NOT (kullanıcı revizesi — "30sn-2dk gecikme, hâlâ donuyor"): concurrency
// hiç belirtilmediğinde Cloud Functions v2, düşük CPU tahsisinde
// eşzamanlılığı 1'e düşürebiliyor — yani bir istek işlenirken SONRAKİ
// istek (senin bir sonraki tıklaman) cold start DEĞİL, sırf "kuyrukta
// bekliyor" olabilir. cpu:1 + concurrency:10 vermek, minInstances'ın
// AKSİNE sürekli bir maliyet YARATMAZ (idle'da hâlâ 0 instance'a
// inebiliyor) — sadece bir instance uyanıkken birden fazla isteği aynı
// anda işleyebilsin diye.
export const raceHubAction = onCall({ cpu: 1, concurrency: 10 }, async (request) => {
  const { action } = request.data || {};
  switch (action) {
    case 'ping':
      requireAuth(request);
      return { ok: true };
    case 'rollDice':
      return doRollDice(request);
    case 'autoRoll':
      return doAutoRoll(request);
    case 'raceRefuel':
      return doRaceRefuel(request);
    case 'raceBuyNitro':
      return doRaceBuyNitro(request);
    case 'raceChangeGear':
      return doRaceChangeGear(request);
    case 'createTrainingRace':
      return doCreateTrainingRace(request);
    case 'createChampionshipRace':
      return doCreateChampionshipRace(request);
    // finishSoloRace — kullanıcı önerisi (bkz. dosyanın üstündeki NOT):
    // antrenman ve şampiyona artık TAMAMEN istemcide (src/lib/raceEngine.js
    // + src/hooks/useLocalRace.js) simüle ediliyor, sunucuya tur başına
    // hiç istek gitmiyor — sadece yarış bitince BURASI çağrılıyor.
    case 'finishSoloRace':
      return doFinishSoloRace(request);
    default:
      throw new HttpsError('invalid-argument', 'Geçersiz aksiyon.');
  }
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
      const vehicleMax = Math.round(baseVehiclePrice * vehicleUpgradeMult * valueRatioOf(v));
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
        vehicleRepairsUsed: v.repairsUsed || 0,
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
      const weaponMax = Math.round(baseWeaponPrice * weaponMult * valueRatioOf(w));
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
        weaponRepairsUsed: w.repairsUsed || 0,
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
      const minPrice = Math.floor((base * mult * valueRatioOf(v)) / 2);
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
        vehicleRepairsUsed: v.repairsUsed || 0,
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
      const minPrice = Math.floor((base * mult * valueRatioOf(w)) / 2);
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
        weaponRepairsUsed: w.repairsUsed || 0,
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

// --- Futbol modülü: Faz 1 (iskelet) ---

// sendFutbolSms — users/{uid}/messages alt koleksiyonuna (telefon
// uygulamasındaki mesajlarla AYNI şema) bir futbol bildirimi ekler.
function sendFutbolSms(batch, uid, text, type) {
  if (!uid) return;
  const smsRef = db.collection('users').doc(uid).collection('messages').doc();
  batch.set(smsRef, {
    text,
    type,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  });
}
// --- Futbol modülü: Faz 2 (lig/takım/oyuncu/fikstür veri modeli) ---

const FUTBOL_TEAM_SIZE_PER_LEAGUE = 8;
const FUTBOL_SEASON_START = 1;

// Örnek/fiktif takım isimleri — gerçek kulüplerle karışmasın diye
// bilerek uydurma isimler kullanılıyor. 16 tanesi ilk 2 lig için,
// gerideki havuz sonraki ligler (3. lig vb.) otomatik oluştuğunda
// kullanılacak.
const FUTBOL_TEAM_NAME_POOL = [
  'Yıldız Spor', 'Kartal Gençlik', 'Demir Çelik FK', 'Anadolu Yıldızları',
  'Ejder Spor', 'Kuzey Rüzgarı', 'Volkan FK', 'Deniz Yıldızı SK',
  'Çelik Kanat', 'Boğa Spor', 'Şimşek FK', 'Kale Bekçileri',
  'Aslan Yürek SK', 'Rüzgargülü FK', 'Toprak Ana SK', 'Gece Yıldızları',
  'Meşale Spor', 'Kartepe FK', 'Gümüş Ay SK', 'Bozkır Kartalları',
  'Alev Spor', 'Fırtına FK', 'Yeşil Vadi SK', 'Kızıl Şahin',
];

// Kullanıcı revizesi: "isimler ful benzer, birçoğu aynı" — eski havuz
// 24 ad × 20 soyad (480 kombinasyon) idi, büyük bir ligler arası
// evrende çok hızlı tekrar ediyordu. Havuzu ciddi genişlettik VE
// (kullanıcının istediği gibi) gerçek/ünlü futbolcu isimlerinden oluşan
// ayrı bir havuz ekledik — randomFutbolPlayerName() ikisini karıştırıyor.
const FUTBOL_FIRST_NAMES = [
  'Emre', 'Burak', 'Kaan', 'Deniz', 'Onur', 'Mert', 'Barış', 'Cem',
  'Serkan', 'Volkan', 'Uğur', 'Berk', 'Tolga', 'Ozan', 'Kerem', 'Tarık',
  'Yusuf', 'Eren', 'Arda', 'Furkan', 'Cenk', 'Hakan', 'Selim', 'Kağan',
  'Mustafa', 'Ahmet', 'Mehmet', 'Ali', 'Murat', 'Serhat', 'Gökhan', 'Caner',
  'Umut', 'İlker', 'Batuhan', 'Efe', 'Alper', 'Sinan', 'Baran', 'Kemal',
  'Orkun', 'Yiğit', 'Doruk', 'Poyraz', 'Atakan', 'Bora', 'Çağatay', 'Ege',
  'Fatih', 'Halil', 'İbrahim', 'Recep', 'Şükrü', 'Taner', 'Ufuk', 'Vedat',
  'Yavuz', 'Zeki', 'Adem', 'Bilal', 'Coşkun', 'Doğukan', 'Erhan', 'Faruk',
];
const FUTBOL_LAST_NAMES = [
  'Yıldırım', 'Kaya', 'Demir', 'Şahin', 'Aydın', 'Öztürk', 'Çelik',
  'Aksoy', 'Doğan', 'Arslan', 'Koç', 'Polat', 'Yalçın', 'Ergün', 'Bulut',
  'Kurt', 'Özdemir', 'Tekin', 'Güneş', 'Karaca',
  'Aktaş', 'Avcı', 'Bozkurt', 'Ceylan', 'Çakır', 'Duman', 'Ekinci', 'Erdem',
  'Güler', 'Kandemir', 'Karahan', 'Kılıç', 'Korkmaz', 'Kaplan', 'Şen', 'Tunç',
  'Uysal', 'Yavaş', 'Yıldız', 'Acar', 'Baş', 'Candan', 'Dinç', 'Ekici',
  'Erol', 'Genç', 'Işık', 'Kartal', 'Nalbant', 'Orhan', 'Öz', 'Sezer',
  'Taş', 'Toprak', 'Turan', 'Ünal', 'Vural', 'Yaman', 'Zengin', 'Aslan',
];
// FUTBOL_FAMOUS_NAMES — kullanıcı revizesi: "ekstra ünlü futbolcu
// isimlerini de ekleyelim, çeşitlilik artsın". Gerçek (çoğu emekli/
// efsane, bir kısmı hâlâ aktif) futbolcuların isimleri — sadece isim
// olarak, oyundaki kurgusal oyuncularla (rastgele güç/yaş/değer) hiçbir
// gerçek istatistik ya da iddia bağlantısı yok, salt çeşitlilik amaçlı.
const FUTBOL_FAMOUS_NAMES = [
  'Hakan Şükür', 'Rüştü Reçber', 'Alpay Özalan', 'Emre Belözoğlu',
  'Tuncay Şanlı', 'Nihat Kahveci', 'Arda Turan', 'Burak Yılmaz',
  'Hakan Çalhanoğlu', 'Cenk Tosun', 'İlkay Gündoğan', 'Uğurcan Çakır',
  'Rıdvan Dilmen', 'Fatih Terim', 'Oğuz Çetin', 'Bülent Korkmaz',
  'Zinedine Zidane', 'Ronaldinho', 'Kaká', 'Andrea Pirlo', 'Xavi Hernández',
  'Andrés Iniesta', 'Thierry Henry', 'Didier Drogba', 'Samuel Eto\'o',
  'Ronaldo Nazário', 'Roberto Carlos', 'Cafu', 'Paolo Maldini',
  'Francesco Totti', 'Alessandro Del Piero', 'Fabio Cannavaro',
  'Michael Ballack', 'Miroslav Klose', 'Bastian Schweinsteiger',
  'Philipp Lahm', 'Manuel Neuer', 'Iker Casillas', 'Sergio Ramos',
  'David Villa', 'Fernando Torres', 'Luis Suárez', 'Diego Forlán',
  'Radamel Falcao', 'James Rodríguez', 'Diego Maradona', 'Gabriel Batistuta',
  'Javier Zanetti', 'Steven Gerrard', 'Frank Lampard', 'John Terry',
  'Rio Ferdinand', 'Wayne Rooney', 'David Beckham', 'Ryan Giggs',
  'Paul Scholes', 'Patrick Vieira', 'Robert Pirès',
  'Didier Deschamps', 'Marcel Desailly', 'Lilian Thuram', 'Edwin van der Sar',
  'Ruud van Nistelrooy', 'Dennis Bergkamp', 'Clarence Seedorf',
  'Luís Figo', 'Rui Costa', 'Cristiano Ronaldo', 'Pepe',
  'Gianluigi Buffon', 'Andriy Shevchenko', 'Zlatan Ibrahimović',
  'Henrik Larsson', 'Peter Schmeichel', 'Roy Keane', 'Eric Cantona',
];

// randomFutbolPlayerName — %20 ihtimalle ünlü havuzdan, aksi halde
// genişletilmiş rastgele ad+soyad havuzundan bir isim üretir.
function randomFutbolPlayerName() {
  if (Math.random() < 0.2) {
    return FUTBOL_FAMOUS_NAMES[Math.floor(Math.random() * FUTBOL_FAMOUS_NAMES.length)];
  }
  return `${FUTBOL_FIRST_NAMES[Math.floor(Math.random() * FUTBOL_FIRST_NAMES.length)]} ${
    FUTBOL_LAST_NAMES[Math.floor(Math.random() * FUTBOL_LAST_NAMES.length)]
  }`;
}

// Logo — gönderdiğin logo tasarımcısı bileşeninin (takim-logosu-
// tasarlayici.jsx) tam interaktif editörü Faz "Takımım/Taktik"te
// bağlanacak; şimdilik her takıma rastgele ama tutarlı bir forma
// (şekil+desen+renk) atanıyor ki liste/kart görünümlerinde boş
// kalmasın. `src/components/FutbolScreen/FutbolCrest.jsx` bu config'i
// SVG'ye çeviriyor.
const FUTBOL_LOGO_SHAPES = ['shield', 'circle', 'hexagon'];
const FUTBOL_LOGO_PATTERNS = ['solid', 'halves', 'stripes', 'hoops', 'diagonal'];
const FUTBOL_LOGO_ICONS = [
  'shield', 'star', 'zap', 'crown', 'flame', 'anchor',
  'feather', 'sword', 'paw', 'bird', 'mountain', 'heart',
];
const FUTBOL_LOGO_PALETTES = [
  { primary: '#C8102E', secondary: '#FFFFFF' },
  { primary: '#0C2340', secondary: '#FFD100' },
  { primary: '#00843D', secondary: '#101820' },
  { primary: '#6E1E33', secondary: '#1B3A6B' },
  { primary: '#5B2A86', secondary: '#FFD100' },
  { primary: '#F26522', secondary: '#0C1B33' },
];
function randomFutbolLogo() {
  const palette = FUTBOL_LOGO_PALETTES[Math.floor(Math.random() * FUTBOL_LOGO_PALETTES.length)];
  return {
    shape: FUTBOL_LOGO_SHAPES[Math.floor(Math.random() * FUTBOL_LOGO_SHAPES.length)],
    pattern: FUTBOL_LOGO_PATTERNS[Math.floor(Math.random() * FUTBOL_LOGO_PATTERNS.length)],
    icon: FUTBOL_LOGO_ICONS[Math.floor(Math.random() * FUTBOL_LOGO_ICONS.length)],
    primary: palette.primary,
    secondary: palette.secondary,
  };
}

// pickUniqueFutbolLogo — bir set içinde (aynı işlem/batch boyunca)
// birbirinin AYNISI olmayan bir forma üretir. Şekil×desen×ikon×renk
// kombinasyonu ~1000'in üzerinde olduğu için birkaç denemede bulunur.
function pickUniqueFutbolLogo(usedSignatures) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const logo = randomFutbolLogo();
    const signature = `${logo.shape}|${logo.pattern}|${logo.icon}|${logo.primary}|${logo.secondary}`;
    if (!usedSignatures.has(signature)) {
      usedSignatures.add(signature);
      return logo;
    }
  }
  return randomFutbolLogo(); // pratikte hiç buraya düşmez
}

// Piyasa değeri = (Güç × 1000) × (Kalan Kariyer Yılı / 20), Kalan Kariyer
// Yılı = 20 - (Yaş - 16). Bir hedef değer bandından geriye doğru rastgele
// bir yaş+güç kombinasyonu üretiyoruz.
function randomFutbolPlayer(position, tier) {
  const age = Math.floor(randomInRange(18, 32));
  const remainingSeasons = 20 - (age - 16);
  const bands = { ucuz: [20000, 50000], orta: [50000, 90000], pahali: [90000, 140000] };
  const [min, max] = bands[tier];
  const targetValue = randomInRange(min, max);
  let power = (targetValue * 20) / (1000 * remainingSeasons);
  power = Math.max(35, Math.round(power * 10) / 10);
  const value = Math.round((power * 1000 * remainingSeasons) / 20);
  const name = randomFutbolPlayerName();
  return { name, position, age, power, form: 100, value, forSale: false, listedAt: null };
}

// 1. Lig kadro şablonu: GK 1 pahalı+1 orta+1 ucuz, DEF/MID 2 orta+2
// pahalı+2 ucuz, FWD 1 pahalı+1 orta+1 ucuz (Bölüm — kullanıcı promptu).
const TIER1_SQUAD_TEMPLATE = [
  ['GK', 'pahali'], ['GK', 'orta'], ['GK', 'ucuz'],
  ['DEF', 'orta'], ['DEF', 'orta'], ['DEF', 'pahali'], ['DEF', 'pahali'], ['DEF', 'ucuz'], ['DEF', 'ucuz'],
  ['MID', 'orta'], ['MID', 'orta'], ['MID', 'pahali'], ['MID', 'pahali'], ['MID', 'ucuz'], ['MID', 'ucuz'],
  ['FWD', 'pahali'], ['FWD', 'orta'], ['FWD', 'ucuz'],
];
// 2. lig (ve sonraki ligler) kadro şablonu: 1 orta+2 ucuz / 2 orta+4 ucuz.
const TIER2_SQUAD_TEMPLATE = [
  ['GK', 'orta'], ['GK', 'ucuz'], ['GK', 'ucuz'],
  ['DEF', 'orta'], ['DEF', 'orta'], ['DEF', 'ucuz'], ['DEF', 'ucuz'], ['DEF', 'ucuz'], ['DEF', 'ucuz'],
  ['MID', 'orta'], ['MID', 'orta'], ['MID', 'ucuz'], ['MID', 'ucuz'], ['MID', 'ucuz'], ['MID', 'ucuz'],
  ['FWD', 'orta'], ['FWD', 'ucuz'], ['FWD', 'ucuz'],
];

// randomFutbolSquadComposition — her takımın kadro büyüklüğü/dağılımı
// artık BİREBİR AYNI değil, takıma göre rastgele (kullanıcı promptu):
// minimum kadro şartını (2 kaleci/3 defans/3 orta/2 forvet) her zaman
// garantiler, üstüne rastgele ekstra oyuncu ekler. 1. Lig (tier 1)
// takımları orta/pahalı ağırlıklı, diğer ligler ucuz ağırlıklı kalmaya
// devam ediyor (spec'teki oranın ruhu korunuyor, sayılar artık sabit
// değil).
function randomFutbolSquadComposition(tier) {
  const counts = {
    GK: 2 + Math.floor(Math.random() * 2), // 2-3
    DEF: 3 + Math.floor(Math.random() * 4), // 3-6
    MID: 3 + Math.floor(Math.random() * 4), // 3-6
    FWD: 2 + Math.floor(Math.random() * 3), // 2-4
  };
  const bandWeights =
    tier === 1
      ? { ucuz: 0.25, orta: 0.4, pahali: 0.35 }
      : { ucuz: 0.55, orta: 0.35, pahali: 0.1 };
  const pickBand = () => {
    const r = Math.random();
    if (r < bandWeights.ucuz) return 'ucuz';
    if (r < bandWeights.ucuz + bandWeights.orta) return 'orta';
    return 'pahali';
  };
  const composition = [];
  Object.entries(counts).forEach(([position, count]) => {
    for (let i = 0; i < count; i++) composition.push([position, pickBand()]);
  });
  return composition;
}

// Klasik "circle method" round-robin: 8 takım → 7 tur (herkes herkesle
// bir kez), sonra ev sahibi/deplasman ters çevrilerek rövanş 7 turu
// daha eklenir. Toplam 14 tur × 4 maç = 56 maç.
function generateRoundRobinRounds(teamIds) {
  const list = teamIds.slice();
  const numRounds = list.length - 1;
  const half = list.length / 2;
  let arr = list.slice();
  const firstLeg = [];
  for (let r = 0; r < numRounds; r++) {
    const roundMatches = [];
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[arr.length - 1 - i];
      roundMatches.push(r % 2 === 0 ? [home, away] : [away, home]);
    }
    firstLeg.push(roundMatches);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }
  const secondLeg = firstLeg.map((round) => round.map(([h, a]) => [a, h]));
  return [...firstLeg, ...secondLeg];
}

async function deleteCollectionBatched(collectionName) {
  const snap = await db.collection(collectionName).get();
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count += 1;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 450 !== 0) await batch.commit();
}

// seedFutbolWorld — 1. ve 2. Lig'i (toplam 16 bot takım + transfer
// piyasası stoğu) ve tam sezon fikstürünü oluşturur. Zaten veri varsa
// hiçbir şey yapmaz (idempotent) — istemci, dünya boşsa bunu otomatik
// (herhangi bir oyuncunun ilk girişinde) çağırır, admin gerekmez.
export const seedFutbolWorld = onCall(async (request) => {
  requireAuth(request);

  const existing = await db.collection('futbolLeagues').limit(1).get();
  if (!existing.empty) {
    return { ok: false, reason: 'already-seeded' };
  }

  const shuffledNames = FUTBOL_TEAM_NAME_POOL.slice().sort(() => Math.random() - 0.5);
  const leagueDefs = [
    { tier: 1, name: '1. Lig' },
    { tier: 2, name: '2. Lig' },
  ];

  let nameIdx = 0;
  const usedLogoSignatures = new Set();
  const batch = db.batch();
  // Transfer piyasası "taban gücü" bu yeni takımların oyuncularından
  // hesaplanacağı için, oluşturulan her oyuncunun gücünü mevkiine göre
  // burada da (Firestore'a tekrar sorgu atmadan) topluyoruz.
  const seededPowerByPosition = { GK: [], DEF: [], MID: [], FWD: [] };

  for (const leagueDef of leagueDefs) {
    const leagueRef = db.collection('futbolLeagues').doc();
    const teamIds = [];

    for (let i = 0; i < FUTBOL_TEAM_SIZE_PER_LEAGUE; i++) {
      const teamRef = db.collection('futbolTeams').doc();
      teamIds.push(teamRef.id);
      batch.set(teamRef, {
        name: shuffledNames[nameIdx++],
        leagueId: leagueRef.id,
        tier: leagueDef.tier,
        ownerUid: null,
        isBot: true,
        fans: Math.floor(randomInRange(10000, 30000)),
        tactic: 'dengeli',
        formation: '2-2-1',
        logo: pickUniqueFutbolLogo(usedLogoSignatures),
        stats: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      for (const [position, priceTier] of randomFutbolSquadComposition(leagueDef.tier)) {
        const playerRef = db.collection('futbolPlayers').doc();
        const playerData = randomFutbolPlayer(position, priceTier);
        batch.set(playerRef, { teamId: teamRef.id, ...playerData });
        if (seededPowerByPosition[position]) seededPowerByPosition[position].push(playerData.power);
      }
    }

    batch.set(leagueRef, {
      tier: leagueDef.tier,
      name: leagueDef.name,
      season: FUTBOL_SEASON_START,
      teamIds,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const rounds = generateRoundRobinRounds(teamIds);
    rounds.forEach((roundMatches, roundIdx) => {
      roundMatches.forEach(([homeTeamId, awayTeamId]) => {
        const matchRef = db.collection('futbolMatches').doc();
        batch.set(matchRef, {
          leagueId: leagueRef.id,
          season: FUTBOL_SEASON_START,
          round: roundIdx + 1,
          homeTeamId,
          awayTeamId,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
          playedAt: null,
        });
      });
    });
  }

  // Transfer piyasası: her mevki için az önce oluşturulan oyunculardan
  // en güçlüsünü taban alıp 12 sistem slotunu (4 mevki × 3 bant) o taze
  // dünyaya göre kuruyoruz — bkz. Faz 5b'deki FUTBOL_SYSTEM_POWER_BANDS.
  const seededMaxPowerByPosition = {};
  FUTBOL_TRANSFER_POSITIONS.forEach((pos) => {
    const powers = seededPowerByPosition[pos];
    seededMaxPowerByPosition[pos] = powers.length ? Math.max(...powers) : FUTBOL_SYSTEM_FALLBACK_POWER;
  });
  FUTBOL_TRANSFER_POSITIONS.forEach((position) => {
    FUTBOL_SYSTEM_POWER_BANDS.forEach((_, bandIndex) => {
      buildFutbolSystemStockWrite(batch, position, bandIndex, seededMaxPowerByPosition);
    });
  });

  await batch.commit();
  return { ok: true };
});

// --- Futbol modülü: Faz 3 (maç simülasyon motoru) ---
// NOT: Takımım/kadro yönetimi (Faz 4) henüz yok, bu yüzden şimdilik HER
// takım (bot ya da ileride oyuncu sahipli) varsayılan 2-2-1 / dengeli /
// "en yüksek etkin güçlü 6 oyuncu" ile sahaya çıkıyor — tam olarak
// promptundaki "kadro ayarlanmadıysa otomatik" kuralı. Kadro/taktik
// ekranı gelince buradaki sabit FUTBOL_DEFAULT_FORMATION yerine takımın
// kendi seçimi kullanılacak.
const FUTBOL_DEFAULT_FORMATION = { GK: 1, DEF: 2, MID: 2, FWD: 1 };
const FUTBOL_FORMATIONS = {
  '2-2-1': { GK: 1, DEF: 2, MID: 2, FWD: 1 },
  '2-1-2': { GK: 1, DEF: 2, MID: 1, FWD: 2 },
  '3-1-1': { GK: 1, DEF: 3, MID: 1, FWD: 1 },
  '1-2-2': { GK: 1, DEF: 1, MID: 2, FWD: 2 },
  '1-3-1': { GK: 1, DEF: 1, MID: 3, FWD: 1 },
  '1-1-3': { GK: 1, DEF: 1, MID: 1, FWD: 3 },
};
const FUTBOL_TACTICS = ['defansif', 'dengeli', 'ofansif'];
const FUTBOL_MIN_SQUAD = { GK: 2, DEF: 3, MID: 3, FWD: 2 };
const FUTBOL_MAX_ROUNDS = 14;
const FUTBOL_SEASON_REWARDS = { champion: 500000, secondThird: 250000, promoted: 250000, other: 100000 };

function futbolEffectivePower(p) {
  return p.power * (p.form / 100);
}

// logFutbolGrowth — "Takımım > Antrenman > Gelişimler" ekranının
// okuyacağı kısa günlük kaydı. type: 'mac' | 'antrenman'.
function logFutbolGrowth(batch, { teamId, playerId, playerName, amount, type }) {
  const ref = db.collection('futbolGrowthLogs').doc();
  batch.set(ref, {
    teamId,
    playerId,
    playerName,
    amount,
    type,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Puan tablosu sıralaması — istemcideki useFutbolTeams.js ile BİREBİR
// aynı kural (puan → averaj → attığı gol → yediği gol → isim).
function compareFutbolStandings(a, b) {
  if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
  const gdA = a.stats.gf - a.stats.ga;
  const gdB = b.stats.gf - b.stats.ga;
  if (gdB !== gdA) return gdB - gdA;
  if (b.stats.gf !== a.stats.gf) return b.stats.gf - a.stats.gf;
  if (a.stats.ga !== b.stats.ga) return a.stats.ga - b.stats.ga;
  return a.name.localeCompare(b.name, 'tr');
}

function pickFutbolLineup(playersByPosition, formation) {
  const selected = [];
  const bench = [];
  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const list = (playersByPosition[pos] || [])
      .slice()
      .sort((a, b) => futbolEffectivePower(b) - futbolEffectivePower(a));
    const need = formation[pos] || 0;
    selected.push(...list.slice(0, need));
    bench.push(...list.slice(need));
  }
  return { selected, bench };
}

function futbolLinePowers(selectedPlayers, isHome, tactic) {
  const lines = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of selectedPlayers) {
    if (lines[p.position] !== undefined) lines[p.position] += futbolEffectivePower(p);
  }
  // Ev sahibi avantajı: tüm mevkiler %10 daha güçlü.
  if (isHome) {
    for (const key of Object.keys(lines)) lines[key] *= 1.1;
  }
  // Taktik: ofansif forvet+ortasahayı güçlendirip kaleci+defansı
  // zayıflatır, defansif tam tersi, dengeli hiçbir şeyi değiştirmez.
  if (tactic === 'ofansif') {
    lines.FWD *= 1.1;
    lines.MID *= 1.1;
    lines.GK *= 0.9;
    lines.DEF *= 0.9;
  } else if (tactic === 'defansif') {
    lines.GK *= 1.1;
    lines.DEF *= 1.1;
    lines.FWD *= 0.9;
    lines.MID *= 0.9;
  }
  return lines;
}

// Maç sonucu hesaplama — kullanıcı promptundaki formül birebir:
// önce iki takım da 1'er "rastgele şut" çeker (%50 gol), sonra forvet/
// ortasaha karşılaştırmalarına göre 4 ek %50 şans daha denenir. Skorla
// birlikte, canlı anlatım ekranının oynatacağı bir "timeline" (dakika +
// olay) ve maç boyunca değişen bir top oynama yüzdesi serisi de üretilir
// — gerçek sonuç burada, 18:00'de belli oluyor; istemci sadece bunu
// zamana yayarak "canlı" gibi gösteriyor.
function simulateFutbolMatch(homeLines, awayLines) {
  const timeline = [];
  const usedMinutes = new Set();
  const nextMinute = () => {
    let m;
    do {
      m = 1 + Math.floor(Math.random() * 90);
    } while (usedMinutes.has(m));
    usedMinutes.add(m);
    return m;
  };

  let homeScore = 0;
  let awayScore = 0;
  const attempt = (team, label, chance) => {
    const scored = Math.random() < chance;
    if (scored) {
      if (team === 'home') homeScore += 1;
      else awayScore += 1;
    }
    timeline.push({ minute: nextMinute(), team, type: scored ? 'goal' : 'shot_on', label });
  };

  attempt('home', 'Serbest atak', 0.5);
  attempt('away', 'Serbest atak', 0.5);
  if (homeLines.FWD >= awayLines.GK) attempt('home', 'Forvet - Kaleci karşı karşıya', 0.5);
  if (homeLines.FWD >= awayLines.DEF) attempt('home', 'Forvet - Defans arkasında', 0.5);
  if (homeLines.MID >= awayLines.DEF) attempt('home', 'Orta saha - Defans\'ı geçti', 0.5);
  if (homeLines.MID >= awayLines.GK) attempt('home', 'Orta saha - Kaleciyle karşı karşıya', 0.5);
  if (awayLines.FWD >= homeLines.GK) attempt('away', 'Forvet - Kaleci karşı karşıya', 0.5);
  if (awayLines.FWD >= homeLines.DEF) attempt('away', 'Forvet - Defans arkasında', 0.5);
  if (awayLines.MID >= homeLines.DEF) attempt('away', 'Orta saha - Defans\'ı geçti', 0.5);
  if (awayLines.MID >= homeLines.GK) attempt('away', 'Orta saha - Kaleciyle karşı karşıya', 0.5);

  // Sadece görsel canlılık için — sonucu ETKİLEMEYEN ekstra şut/kurtarış
  // olayları. Sayıları hafifçe takımın gücüne göre yanlı (daha güçlü
  // takım biraz daha fazla "hareket" üretir).
  const homeTotal = homeLines.GK + homeLines.DEF + homeLines.MID + homeLines.FWD;
  const awayTotal = awayLines.GK + awayLines.DEF + awayLines.MID + awayLines.FWD;
  const flavorCount = (team, strength, oppStrength) => {
    const bias = strength / Math.max(1, strength + oppStrength);
    const count = Math.round(randomInRange(2, 6) * (0.6 + bias));
    for (let i = 0; i < count; i++) {
      const type = Math.random() < 0.45 ? 'shot_on' : 'shot_off';
      timeline.push({
        minute: nextMinute(),
        team,
        type,
        label: type === 'shot_on' ? 'Şut kaleciden döndü' : 'Şut auta / bloke oldu',
      });
    }
  };
  flavorCount('home', homeTotal, awayTotal);
  flavorCount('away', awayTotal, homeTotal);

  timeline.sort((a, b) => a.minute - b.minute);

  // Top oynama yüzdesi — orta saha + hücum ağırlıklı bir taban orandan,
  // her 10 dakikada bir hafifçe o tabana doğru "sürüklenen" rastgele
  // yürüyüşle üretiliyor, böylece maç boyunca değişken ama gerçekçi
  // kalıyor (tamamen rastgele zıplamıyor).
  const homeAttackStrength = homeLines.MID + homeLines.FWD + homeLines.DEF * 0.3;
  const awayAttackStrength = awayLines.MID + awayLines.FWD + awayLines.DEF * 0.3;
  const basePossession = Math.round(
    (homeAttackStrength / Math.max(1, homeAttackStrength + awayAttackStrength)) * 100
  );
  const possessionCheckpoints = [];
  let current = 50;
  for (let minute = 0; minute <= 90; minute += 10) {
    const drift = (basePossession - current) * 0.3 + (Math.random() * 10 - 5);
    current = Math.max(28, Math.min(72, Math.round(current + drift)));
    possessionCheckpoints.push({ minute, home: current, away: 100 - current });
  }

  return { homeScore, awayScore, timeline, possessionCheckpoints };
}

function groupFutbolPlayersByPositionArr(players) {
  const map = { GK: [], DEF: [], MID: [], FWD: [] };
  players.forEach((data) => {
    if (map[data.position]) map[data.position].push(data);
  });
  return map;
}

// Bir takımın maça çıkaracağı kadroyu belirler: eğer takım sahibi
// (Takımım > Kadroyu Yönet) geçerli bir dizilim+kadro seçtiyse VE seçilen
// oyuncuların hiçbirinin formu %50'nin altında değilse onu kullanır;
// aksi halde (kadro seçilmemişse, seçim artık geçersizse, ya da düşük
// formlu oyuncu içeriyorsa) otomatiğe döner: 2-2-1 / dengeli / en yüksek
// etkin güçlü 6 oyuncu — kullanıcı promptundaki kural birebir.
function resolveFutbolTeamLineup(team, players) {
  const byId = {};
  players.forEach((p) => (byId[p.id] = p));
  const formationKey = FUTBOL_FORMATIONS[team.formation] ? team.formation : null;
  const manualIds = Array.isArray(team.lineup) ? team.lineup : null;

  if (formationKey && manualIds) {
    const need = FUTBOL_FORMATIONS[formationKey];
    const manualPlayers = manualIds.map((id) => byId[id]).filter(Boolean);
    const allStillOnRoster = manualPlayers.length === manualIds.length;
    const got = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    manualPlayers.forEach((p) => {
      if (got[p.position] !== undefined) got[p.position] += 1;
    });
    const shapeOk = Object.keys(need).every((k) => need[k] === (got[k] || 0));
    const anyLowForm = manualPlayers.some((p) => p.form < 50);

    if (allStillOnRoster && shapeOk && !anyLowForm) {
      const selectedSet = new Set(manualIds);
      return {
        selected: manualPlayers,
        bench: players.filter((p) => !selectedSet.has(p.id)),
        tactic: FUTBOL_TACTICS.includes(team.tactic) ? team.tactic : 'dengeli',
      };
    }
  }

  const auto = pickFutbolLineup(groupFutbolPlayersByPositionArr(players), FUTBOL_DEFAULT_FORMATION);
  return { selected: auto.selected, bench: auto.bench, tactic: 'dengeli' };
}

function groupFutbolPlayersByPosition(snap) {
  const map = { GK: [], DEF: [], MID: [], FWD: [] };
  snap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    if (map[data.position]) map[data.position].push(data);
  });
  return map;
}

// Tek bir maçı çözer: skoru hesaplar, maç/takım/oyuncu dokümanlarını
// tek bir batch'te günceller. Aynı turda takımlar birbirine karışmadığı
// için maçlar sırayla (await ... for..of) işleniyor — paralel çalıştırıp
// yarış durumu (race condition) yaratmamak için bilerek böyle.
// computeFutbolMatchLive — 18:00'de çağrılır: skoru/olay listesini/top
// oynama serisini hesaplayıp saklar, durumu 'live' yapar. BİLEREK hiçbir
// takım/oyuncu/altın/taraftar güncellemesi yapmaz ve SMS göndermez —
// sonuç 19:00'a kadar (applyFutbolMatchResult çağrılana dek) sadece
// Firestore'da "ham veri" olarak durur, hiçbir oyuncu bilmez.
async function computeFutbolMatchLive(match) {
  const [homeTeamSnap, awayTeamSnap, homePlayersSnap, awayPlayersSnap] = await Promise.all([
    db.collection('futbolTeams').doc(match.homeTeamId).get(),
    db.collection('futbolTeams').doc(match.awayTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.homeTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.awayTeamId).get(),
  ]);
  if (!homeTeamSnap.exists || !awayTeamSnap.exists) return;

  // Antrenmandaki oyuncular (18:00-19:00 arası) o günkü maça katılamaz.
  const homeTraining = new Set(homeTeamSnap.data().trainingPlayerIds || []);
  const awayTraining = new Set(awayTeamSnap.data().trainingPlayerIds || []);
  const homePlayersArr = homePlayersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => !homeTraining.has(p.id));
  const awayPlayersArr = awayPlayersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => !awayTraining.has(p.id));
  const homeResolved = resolveFutbolTeamLineup(homeTeamSnap.data(), homePlayersArr);
  const awayResolved = resolveFutbolTeamLineup(awayTeamSnap.data(), awayPlayersArr);
  const homeLines = futbolLinePowers(homeResolved.selected, true, homeResolved.tactic);
  const awayLines = futbolLinePowers(awayResolved.selected, false, awayResolved.tactic);
  const { homeScore, awayScore, timeline, possessionCheckpoints } = simulateFutbolMatch(homeLines, awayLines);

  // matchStartAt→revealAt (18:00→19:00, tam 1 saat) istemcinin canlı
  // anlatımı GERÇEK zamana yayması için — bkz. FutbolMatchDetail.jsx.
  const matchStartAt = new Date();
  const revealAt = new Date(matchStartAt.getTime());
  revealAt.setUTCHours(revealAt.getUTCHours() + 1);

  await db.collection('futbolMatches').doc(match.id).update({
    homeScore,
    awayScore,
    status: 'live',
    matchStartAt: admin.firestore.Timestamp.fromDate(matchStartAt),
    revealAt: admin.firestore.Timestamp.fromDate(revealAt),
    timeline,
    possessionCheckpoints,
    // 19:00'da applyFutbolMatchResult'ın kimi hariç tuttuğunu tekrar
    // hesaplamasına gerek kalmasın diye kadroları da saklıyoruz.
    homeLineupIds: homeResolved.selected.map((p) => p.id),
    homeBenchIds: homeResolved.bench.map((p) => p.id),
    awayLineupIds: awayResolved.selected.map((p) => p.id),
    awayBenchIds: awayResolved.bench.map((p) => p.id),
  });
}

// applyFutbolMatchResult — 19:00'de çağrılır: computeFutbolMatchLive'ın
// önceden hesapladığı sonucu RESMİLEŞTİRİR — takım istatistikleri,
// taraftar sayısı, ev sahibi altın kazancı, oyuncu gelişimi, ve SMS
// bildirimleri (maç sonucu + bilet geliri) burada uygulanır.
async function applyFutbolMatchResult(matchId) {
  const matchSnap = await db.collection('futbolMatches').doc(matchId).get();
  if (!matchSnap.exists) return;
  const match = matchSnap.data();
  if (match.status !== 'live') return; // zaten uygulanmış ya da hiç hesaplanmamış

  const [homeTeamSnap, awayTeamSnap, homePlayersSnap, awayPlayersSnap] = await Promise.all([
    db.collection('futbolTeams').doc(match.homeTeamId).get(),
    db.collection('futbolTeams').doc(match.awayTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.homeTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.awayTeamId).get(),
  ]);
  if (!homeTeamSnap.exists || !awayTeamSnap.exists) return;

  const homeName = homeTeamSnap.data().name;
  const awayName = awayTeamSnap.data().name;
  const { homeScore, awayScore } = match;

  const batch = db.batch();
  batch.update(db.collection('futbolMatches').doc(matchId), {
    status: 'finished',
    playedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const applyTeamResult = (teamId, gf, ga) => {
    const won = gf > ga;
    const drawn = gf === ga;
    batch.update(db.collection('futbolTeams').doc(teamId), {
      'stats.played': admin.firestore.FieldValue.increment(1),
      'stats.won': admin.firestore.FieldValue.increment(won ? 1 : 0),
      'stats.drawn': admin.firestore.FieldValue.increment(drawn ? 1 : 0),
      'stats.lost': admin.firestore.FieldValue.increment(!won && !drawn ? 1 : 0),
      'stats.gf': admin.firestore.FieldValue.increment(gf),
      'stats.ga': admin.firestore.FieldValue.increment(ga),
      'stats.points': admin.firestore.FieldValue.increment(won ? 3 : drawn ? 1 : 0),
    });
  };
  applyTeamResult(match.homeTeamId, homeScore, awayScore);
  applyTeamResult(match.awayTeamId, awayScore, homeScore);

  // Taraftar sayısı: kazanan +1..10.000, kaybeden -1..10.000 (0'ın altına
  // inmez), beraberlikte değişmez.
  let fanGoldEarned = 0;
  if (homeScore !== awayScore) {
    const fanDelta = Math.floor(randomInRange(1, 10000));
    const homeWon = homeScore > awayScore;
    const winnerId = homeWon ? match.homeTeamId : match.awayTeamId;
    const loserSnap = homeWon ? awayTeamSnap : homeTeamSnap;
    const loserId = homeWon ? match.awayTeamId : match.homeTeamId;
    batch.update(db.collection('futbolTeams').doc(winnerId), {
      fans: admin.firestore.FieldValue.increment(fanDelta),
    });
    batch.update(db.collection('futbolTeams').doc(loserId), {
      fans: Math.max(0, (loserSnap.data().fans || 0) - fanDelta),
    });
  }

  // Kendi sahasında oynayan takımın sahibi (varsa) taraftar sayısı kadar altın kazanır.
  const homeOwnerUid = homeTeamSnap.data().ownerUid;
  const homeFans = homeTeamSnap.data().fans || 0;
  if (homeOwnerUid) {
    fanGoldEarned = homeFans;
    batch.update(db.collection('users').doc(homeOwnerUid), {
      gold: admin.firestore.FieldValue.increment(homeFans),
    });
  }

  // Oyuncu gelişimi: sahaya çıkanlar 0.1-2.0 güç kazanır + yaşı kadar
  // form kaybeder; yedekler formu +50 kazanır (100'ü geçmez).
  const homeLineupSet = new Set(match.homeLineupIds || []);
  const awayLineupSet = new Set(match.awayLineupIds || []);
  const applyPlayerUpdates = (snap, lineupSet, teamId) => {
    snap.docs.forEach((d) => {
      const p = d.data();
      if (lineupSet.has(d.id)) {
        const gain = Math.round(randomInRange(0.1, 2.0) * 10) / 10;
        batch.update(d.ref, {
          power: Math.round((p.power + gain) * 10) / 10,
          form: Math.max(0, p.form - p.age),
        });
        // "Gelişimler" ekranı için: bu maçta gelişim yaşayan oyuncuyu
        // kısa bir günlük kaydına da yazıyoruz.
        logFutbolGrowth(batch, { teamId, playerId: d.id, playerName: p.name, amount: gain, type: 'mac' });
      } else {
        batch.update(d.ref, { form: Math.min(100, p.form + 50) });
      }
    });
  };
  applyPlayerUpdates(homePlayersSnap, homeLineupSet, match.homeTeamId);
  applyPlayerUpdates(awayPlayersSnap, awayLineupSet, match.awayTeamId);

  // SMS — takım sahiplerine maç sonucu (+ ev sahibiyse bilet geliri).
  const outcomeText = (myScore, oppScore) =>
    myScore > oppScore ? 'kazandı' : myScore < oppScore ? 'kaybetti' : 'berabere kaldı';
  if (homeOwnerUid) {
    let text = `⚽ ${homeName} ${homeScore}-${awayScore} ${awayName} — takımın ${outcomeText(homeScore, awayScore)}.`;
    if (fanGoldEarned > 0) text += ` Sahanızdaki bilet gelirinden ${fanGoldEarned.toLocaleString('tr-TR')} altın kazandınız.`;
    sendFutbolSms(batch, homeOwnerUid, text, 'futbol_match_result');
  }
  const awayOwnerUid = awayTeamSnap.data().ownerUid;
  if (awayOwnerUid) {
    const text = `⚽ ${homeName} ${homeScore}-${awayScore} ${awayName} — takımın (deplasmanda) ${outcomeText(awayScore, homeScore)}.`;
    sendFutbolSms(batch, awayOwnerUid, text, 'futbol_match_result');
  }

  await batch.commit();

  // Gazete haberi — maç sonucu, logolarla birlikte (kimlik gizliliği
  // gerektirmiyor, takım isimleri zaten herkese açık).
  await logNewsEvent('football_match', {
    leagueId: match.leagueId,
    homeName,
    awayName,
    homeLogo: homeTeamSnap.data().logo || null,
    awayLogo: awayTeamSnap.data().logo || null,
    homeScore,
    awayScore,
  });
}

// Sezon bitince: ödüller (sahibi olan takımlara), terfi/küme düşme
// (sadece ardışık tier çiftleri arasında — 3. lig yoksa 2. liganın
// sonuncusu düşemez, bu doğal olarak sağlanıyor çünkü döngü sadece var
// olan lig çiftleri arasında çalışıyor), istatistik sıfırlama, yeni
// fikstür, ve oyuncu yaşlandırma/emeklilik.
async function finishFutbolSeason(leagueIds) {
  const allLeaguesSnap = await db.collection('futbolLeagues').get();
  const leagues = allLeaguesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => leagueIds.includes(l.id))
    .sort((a, b) => a.tier - b.tier);

  const leagueData = [];
  for (const league of leagues) {
    const teamsSnap = await db.collection('futbolTeams').where('leagueId', '==', league.id).get();
    const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(compareFutbolStandings);
    leagueData.push({ league, teams });
  }

  // 1) Ödüller + terfi/küme düşme ataması tek batch'te.
  const promoRelegateBatch = db.batch();
  const topThree = []; // sadece 1. Lig — şampiyon/2./3.
  const promotions = []; // { teamName, fromTier, toTier }
  const relegations = []; // { teamName, fromTier, toTier }
  leagueData.forEach(({ league, teams }, idx) => {
    const isTopTier = idx === 0;
    teams.forEach((team, rank) => {
      let reward = FUTBOL_SEASON_REWARDS.other;
      if (isTopTier && rank === 0) reward = FUTBOL_SEASON_REWARDS.champion;
      else if (isTopTier && (rank === 1 || rank === 2)) reward = FUTBOL_SEASON_REWARDS.secondThird;
      else if (!isTopTier && rank < 2) reward = FUTBOL_SEASON_REWARDS.promoted;
      if (isTopTier && rank < 3) {
        topThree.push({ rank: rank + 1, teamName: team.name, logo: team.logo || null });
      }
      if (team.ownerUid) {
        promoRelegateBatch.update(db.collection('users').doc(team.ownerUid), {
          gold: admin.firestore.FieldValue.increment(reward),
        });
        let rewardText = `Sezon sonu: ${team.name} ${rank + 1}. sırada bitirdi, ${reward.toLocaleString('tr-TR')} altın kazandın.`;
        if (isTopTier && rank === 0) rewardText = `🏆 Şampiyon oldun! ${team.name} sezonu 1. sırada bitirdi, ${reward.toLocaleString('tr-TR')} altın kazandın.`;
        else if (!isTopTier && rank < 2) rewardText += ' Bir üst lige terfi ettin!';
        sendFutbolSms(promoRelegateBatch, team.ownerUid, rewardText, 'futbol_season_end');
      }
    });
  });
  for (let i = 0; i < leagueData.length - 1; i++) {
    const upper = leagueData[i];
    const lower = leagueData[i + 1];
    lower.teams.slice(0, 2).forEach((t) => {
      promoRelegateBatch.update(db.collection('futbolTeams').doc(t.id), {
        leagueId: upper.league.id,
        tier: upper.league.tier,
      });
      promotions.push({ teamName: t.name, fromTier: lower.league.tier, toTier: upper.league.tier });
    });
    upper.teams.slice(-2).forEach((t) => {
      promoRelegateBatch.update(db.collection('futbolTeams').doc(t.id), {
        leagueId: lower.league.id,
        tier: lower.league.tier,
      });
      relegations.push({ teamName: t.name, fromTier: upper.league.tier, toTier: lower.league.tier });
    });
  }
  await promoRelegateBatch.commit();

  // Gazete haberi — sezonun bittiğini duyuran özet (şampiyon/2./3. +
  // terfi/küme düşme listesi).
  await logNewsEvent('football_season_end', { topThree, promotions, relegations });

  // 2) Yeni takım listeleriyle: istatistik sıfırlama + yeni sezon fikstürü.
  //    Önceki sezonun maçları SİLİNİYOR — yoksa fikstür/maçlar koleksiyonu
  //    her sezon kalabalıklaşır ve (round numaraları çakıştığı için)
  //    "güncel tur" hesaplamaları/iddaa ekranı bozulur.
  for (const { league } of leagueData) {
    const oldMatchesSnap = await db
      .collection('futbolMatches')
      .where('leagueId', '==', league.id)
      .where('season', '==', league.season || 1)
      .get();
    let deleteBatch = db.batch();
    let deleteCount = 0;
    for (const d of oldMatchesSnap.docs) {
      deleteBatch.delete(d.ref);
      deleteCount += 1;
      if (deleteCount % 450 === 0) {
        await deleteBatch.commit();
        deleteBatch = db.batch();
      }
    }
    if (deleteCount % 450 !== 0) await deleteBatch.commit();

    const teamsSnap = await db.collection('futbolTeams').where('leagueId', '==', league.id).get();
    const teamIds = teamsSnap.docs.map((d) => d.id);
    const seasonBatch = db.batch();
    teamIds.forEach((id) => {
      seasonBatch.update(db.collection('futbolTeams').doc(id), {
        stats: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
      });
    });
    const nextSeason = (league.season || 1) + 1;
    generateRoundRobinRounds(teamIds).forEach((roundMatches, roundIdx) => {
      roundMatches.forEach(([homeTeamId, awayTeamId]) => {
        const matchRef = db.collection('futbolMatches').doc();
        seasonBatch.set(matchRef, {
          leagueId: league.id,
          season: nextSeason,
          round: roundIdx + 1,
          homeTeamId,
          awayTeamId,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
          playedAt: null,
        });
      });
    });
    seasonBatch.update(db.collection('futbolLeagues').doc(league.id), {
      season: nextSeason,
      currentRound: 1,
      teamIds,
    });
    await seasonBatch.commit();
  }

  // 3) Yaşlanma: SADECE oyuncuya (gerçek sahibi) ait takımların
  //    oyuncuları yaşlanır — yaşı +1, 35'i geçen (36 olacak olan) emekli
  //    olur (silinir). Bot takımların oyuncuları YAŞLANMAZ — bunun
  //    yerine 30'un üzerindeki bot oyuncuları düzenli olarak 20 yaşına
  //    "gençleştirilir" (kullanıcı promptu) ki bot kadroları sonsuza
  //    kadar sağlıklı kalsın.
  const teamOwnerByIdSnap = await db.collection('futbolTeams').get();
  const ownerByTeamId = {};
  teamOwnerByIdSnap.docs.forEach((d) => (ownerByTeamId[d.id] = d.data().ownerUid || null));

  const allPlayersSnap = await db.collection('futbolPlayers').get();
  let ageBatch = db.batch();
  let opCount = 0;
  for (const doc of allPlayersSnap.docs) {
    const player = doc.data();
    const isBotTeam = !ownerByTeamId[player.teamId];
    if (isBotTeam) {
      if (player.age > 30) {
        // Kullanıcı revizesi: gücü AYNEN korumak sonsuza kadar
        // sınırsız artmasına yol açıyordu (her yaşlanma turunda biraz
        // daha güçlenip hiç tavan görmüyordu) — bu da anlamsız bir
        // enflasyona sebep olurdu. Bunun yerine 30'u geçen bot oyuncusu
        // 20 yaşına, 100 forma VE SABİT 99 güce "gençleştirilir" — bot
        // takımları güçlü kalmaya devam eder ama gücü belirli bir tavanda
        // (99) tutulur. Değeri de bu sabit güce göre yeniden hesaplanır
        // ki piyasa/takım değeri tutarsız kalmasın.
        const remainingSeasons = 20 - (20 - 16); // 20 yaşında kalan kariyer yılı (16)
        const value = Math.round((99 * 1000 * remainingSeasons) / 20);
        ageBatch.update(doc.ref, { age: 20, power: 99, form: 100, value });
        opCount += 1;
      }
      continue;
    }
    const age = player.age + 1;
    if (age > 35) {
      ageBatch.delete(doc.ref);
    } else {
      ageBatch.update(doc.ref, { age, form: 100 });
    }
    opCount += 1;
    if (opCount % 450 === 0) {
      await ageBatch.commit();
      ageBatch = db.batch();
    }
  }
  if (opCount % 450 !== 0) await ageBatch.commit();

  // 4) Yaşlanma sonrası minimum kadronun (2 kaleci/3 defans/3 orta/2
  // forvet) altına düşen, oyuncuya ait takımlar otomatik olarak bota
  // devredilir: sahibine takımın anında satış değeri ödenir, kadro
  // sıfırdan (tier'ına uygun şablonla) yeniden kurulur — kullanıcı
  // promptundaki "minimum oyuncu sayısı" kuralı.
  const allTeamsSnap = await db.collection('futbolTeams').get();
  for (const teamDoc of allTeamsSnap.docs) {
    const team = teamDoc.data();
    if (!team.ownerUid) continue;
    const counts = await getFutbolTeamPositionCounts(teamDoc.id);
    if (meetsFutbolMinSquad(counts)) continue;

    const value = await computeFutbolTeamValue(teamDoc.id);
    const payout = Math.round((value * 2) / 3);
    const oldPlayersSnap = await db.collection('futbolPlayers').where('teamId', '==', teamDoc.id).get();
    const revertBatch = db.batch();
    revertBatch.update(db.collection('users').doc(team.ownerUid), {
      gold: admin.firestore.FieldValue.increment(payout),
    });
    oldPlayersSnap.docs.forEach((d) => revertBatch.delete(d.ref));
    const template = randomFutbolSquadComposition(team.tier);
    template.forEach(([position, tierBand]) => {
      const playerRef = db.collection('futbolPlayers').doc();
      revertBatch.set(playerRef, { teamId: teamDoc.id, ...randomFutbolPlayer(position, tierBand) });
    });
    revertBatch.update(teamDoc.ref, {
      ownerUid: null,
      isBot: true,
      tactic: 'dengeli',
      formation: '2-2-1',
      lineup: admin.firestore.FieldValue.delete(),
    });
    await revertBatch.commit();
  }

  // 5) Yeni lig açılışı: mevcut toplam takımların yarısı (ya da fazlası)
  // artık oyunculara aitse, mevcut lig büyüklüğünde yeni bir lig açılır
  // — kullanıcı revizesi, bkz. maybeCreateNextFutbolTierByOwnershipRatio.
  await maybeCreateNextFutbolTierByOwnershipRatio();
}

// resolveFutbolTrainingForAllTeams — antrenmandaki (en fazla 3'er)
// oyuncuların gücünü artırır, seçimi temizler. 19:00'da (maçlarla AYNI
// anda açığa çıkacak şekilde) çağrılır.
async function resolveFutbolTrainingForAllTeams() {
  const teamsSnap = await db.collection('futbolTeams').get();
  const batch = db.batch();
  let count = 0;
  for (const teamDoc of teamsSnap.docs) {
    const trainingPlayerIds = teamDoc.data().trainingPlayerIds;
    if (!Array.isArray(trainingPlayerIds) || trainingPlayerIds.length === 0) continue;
    for (const playerId of trainingPlayerIds) {
      const playerRef = db.collection('futbolPlayers').doc(playerId);
      const playerSnap = await playerRef.get();
      if (playerSnap.exists && playerSnap.data().teamId === teamDoc.id) {
        const gain = Math.round(randomInRange(0.1, 4.0) * 10) / 10;
        const newPower = Math.round((playerSnap.data().power + gain) * 10) / 10;
        batch.update(playerRef, { power: newPower });
        logFutbolGrowth(batch, {
          teamId: teamDoc.id,
          playerId,
          playerName: playerSnap.data().name,
          amount: gain,
          type: 'antrenman',
        });
      }
    }
    batch.update(teamDoc.ref, { trainingPlayerIds: admin.firestore.FieldValue.delete() });
    count += 1;
  }
  if (count > 0) await batch.commit();
}

// cleanupOldFutbolGrowthLogs — "Gelişimler" günlüğü sınırsız büyümesin
// diye 21 günden eski kayıtları düzenli temizler (her gün sınırlı sayıda
// — maliyeti kontrollü tutmak için).
async function cleanupOldFutbolGrowthLogs() {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const oldSnap = await db
    .collection('futbolGrowthLogs')
    .where('createdAt', '<', cutoff)
    .limit(400)
    .get();
  if (oldSnap.empty) return;
  const batch = db.batch();
  oldSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// cleanupOldNewsEvents — Gazete sadece bugünü/son birkaç günü gösteriyor,
// koleksiyon sınırsız büyümesin diye 5 günden eski haberleri temizler.
async function cleanupOldNewsEvents() {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const oldSnap = await db.collection('newsEvents').where('createdAt', '<', cutoff).limit(400).get();
  if (oldSnap.empty) return;
  const batch = db.batch();
  oldSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// pickFutbolBotTrainingIds — bir bot takımının o günkü antrenman
// seçimini belirler (kullanıcı promptu): kadroya (o günkü otomatik ilk
// 11'e) girmeyen oyuncular arasından, formu 100 olanlar öncelikli, formu
// 100 olan yoksa en güçlüler seçilir; ELİNDEN GELDİĞİNCE farklı
// mevkilerden (aynı gün 3 forvet yerine 1 kaleci/1 defans/1 forvet gibi)
// seçim yapılır — FUTBOL_TRAINING_SLOTS (4, mevki başına 1) oyuncuya kadar.
function pickFutbolBotTrainingIds(players, excludeIds) {
  const eligible = players.filter((p) => !excludeIds.has(p.id));
  const rank = (p) => (p.form >= 100 ? 1 : 0) * 100000 + p.power;
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  eligible.forEach((p) => {
    if (byPos[p.position]) byPos[p.position].push(p);
  });
  Object.values(byPos).forEach((list) => list.sort((a, b) => rank(b) - rank(a)));

  // Mevki sırasını her gün/takımda karıştırıyoruz ki hep aynı 3 mevki
  // seçilmesin (bugün GK/DEF/MID, yarın MID/FWD/GK gibi çeşitlilik olsun).
  const positions = Object.keys(byPos).filter((pos) => byPos[pos].length > 0);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const picked = [];
  const pickedIds = new Set();
  for (const pos of positions) {
    if (picked.length >= FUTBOL_TRAINING_SLOTS) break;
    const candidate = byPos[pos][0];
    picked.push(candidate);
    pickedIds.add(candidate.id);
  }
  if (picked.length < FUTBOL_TRAINING_SLOTS) {
    const rest = eligible.filter((p) => !pickedIds.has(p.id)).sort((a, b) => rank(b) - rank(a));
    for (const p of rest) {
      if (picked.length >= FUTBOL_TRAINING_SLOTS) break;
      picked.push(p);
      pickedIds.add(p.id);
    }
  }
  return picked.map((p) => p.id);
}

// assignFutbolBotTraining — her gün antrenman sonuçlandıktan (ve o günkü
// trainingPlayerIds temizlendikten) hemen sonra çağrılır: her BOT takımı
// için ertesi güne kadar sürecek yeni bir antrenman seçimi yapar, tıpkı
// kullanıcıların "Antrenmanı Başlat" ile kendi oyuncularını seçmesi gibi
// — kullanıcı promptu: botlar da bizim gibi gelişsin.
async function assignFutbolBotTraining() {
  const botTeamsSnap = await db.collection('futbolTeams').where('ownerUid', '==', null).get();
  let batch = db.batch();
  let opCount = 0;
  for (const teamDoc of botTeamsSnap.docs) {
    const playersSnap = await db.collection('futbolPlayers').where('teamId', '==', teamDoc.id).get();
    const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (players.length === 0) continue;
    // O günkü maça çıkacak (otomatik seçilen) ilk 11 antrenmana giremez —
    // kullanıcıların tabi olduğu kuralla birebir aynı.
    const auto = pickFutbolLineup(groupFutbolPlayersByPositionArr(players), FUTBOL_DEFAULT_FORMATION);
    const lineupIds = new Set(auto.selected.map((p) => p.id));
    const trainingIds = pickFutbolBotTrainingIds(players, lineupIds);
    if (trainingIds.length > 0) {
      batch.update(teamDoc.ref, { trainingPlayerIds: trainingIds });
      opCount += 1;
      if (opCount % 450 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
  }
  if (opCount % 450 !== 0) await batch.commit();
}

// resolveFutbolMatchdayStart — her gün 18:00 (İstanbul saati): o günün
// turundaki tüm maçların sonucunu hesaplar ('live' durumuna alır) ama
// HİÇBİR ŞEYİ açığa çıkarmaz — takım istatistikleri, taraftar, altın,
// SMS hepsi 19:00'a (resolveFutbolMatchdayReveal) kadar bekler.
export const resolveFutbolMatchdayStart = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'Europe/Istanbul' },
  async () => {
    const leaguesSnap = await db.collection('futbolLeagues').get();
    for (const leagueDoc of leaguesSnap.docs) {
      const league = leagueDoc.data();
      const round = league.currentRound || 1;
      const matchesSnap = await db
        .collection('futbolMatches')
        .where('leagueId', '==', leagueDoc.id)
        .where('round', '==', round)
        .where('season', '==', league.season || 1)
        .where('status', '==', 'scheduled')
        .get();
      for (const matchDoc of matchesSnap.docs) {
        await computeFutbolMatchLive({ id: matchDoc.id, ...matchDoc.data() });
      }
    }
  }
);

// resolveFutbolMatchdayReveal — her gün 19:00 (İstanbul saati): 18:00'de
// hesaplanmış ('live') tüm maçları resmileştirir (istatistik/altın/SMS),
// iddaa kuponlarını sonuçlandırır, turu ilerletir (ya da sezonu kapatır),
// ve antrenman bonuslarını uygular — hepsi AYNI anda, "19'da her şey
// birden açılır" hissi için.
export const resolveFutbolMatchdayReveal = onSchedule(
  { schedule: '0 19 * * *', timeZone: 'Europe/Istanbul' },
  async () => {
    const leaguesSnap = await db.collection('futbolLeagues').get();
    const leagues = leaguesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const finishedLeagueIds = [];

    for (const league of leagues) {
      const round = league.currentRound || 1;
      const matchesSnap = await db
        .collection('futbolMatches')
        .where('leagueId', '==', league.id)
        .where('round', '==', round)
        .where('season', '==', league.season || 1)
        .where('status', '==', 'live')
        .get();

      for (const matchDoc of matchesSnap.docs) {
        await applyFutbolMatchResult(matchDoc.id);
      }
      await resolveFutbolBetsForRound(league.id, round);

      const nextRound = round + 1;
      if (nextRound > FUTBOL_MAX_ROUNDS) {
        finishedLeagueIds.push(league.id);
      } else {
        await db.collection('futbolLeagues').doc(league.id).update({ currentRound: nextRound });
      }
    }

    if (finishedLeagueIds.length > 0) {
      await finishFutbolSeason(finishedLeagueIds);
    }
    await resolveFutbolTrainingForAllTeams();
    await assignFutbolBotTraining();
    await cleanupOldFutbolGrowthLogs();
    await cleanupOldNewsEvents();
  }
);

// --- Futbol modülü: Faz 4 (takım satın alma / satma) ---

async function computeFutbolTeamValue(teamId) {
  const playersSnap = await db.collection('futbolPlayers').where('teamId', '==', teamId).get();
  return playersSnap.docs.reduce((sum, d) => sum + (d.data().value || 0), 0);
}

// listFutbolBuyableTeams — sahipsiz (bot) takımlar (piyasa değeriyle) +
// oyuncuların kendi ilan ettiği (forSale=true) takımlar (kendi
// belirledikleri fiyatla) birlikte döner.
export const listFutbolBuyableTeams = onCall(async (request) => {
  requireAuth(request);
  const [botSnap, listedSnap] = await Promise.all([
    db.collection('futbolTeams').where('ownerUid', '==', null).get(),
    db.collection('futbolTeams').where('forSale', '==', true).get(),
  ]);
  const botTeams = await Promise.all(
    botSnap.docs.map(async (d) => {
      const data = d.data();
      const value = await computeFutbolTeamValue(d.id);
      return {
        id: d.id,
        name: data.name,
        tier: data.tier,
        leagueId: data.leagueId,
        fans: data.fans || 0,
        logo: data.logo || null,
        value,
        price: value,
        listedByPlayer: false,
      };
    })
  );
  const listedTeams = await Promise.all(
    listedSnap.docs.map(async (d) => {
      const data = d.data();
      const value = await computeFutbolTeamValue(d.id);
      return {
        id: d.id,
        name: data.name,
        tier: data.tier,
        leagueId: data.leagueId,
        fans: data.fans || 0,
        logo: data.logo || null,
        value,
        price: data.salePrice,
        listedByPlayer: true,
      };
    })
  );
  const teams = [...botTeams, ...listedTeams];
  teams.sort((a, b) => a.tier - b.tier || b.price - a.price);
  return { teams };
});

// getMyFutbolTeamFinance — sahibi olduğun takımın güncel değeri, anında
// satış fiyatı (2/3) ve azami ilan fiyatı (4/3 — oyuncu piyasasındaki
// aynı mantık).
export const getMyFutbolTeamFinance = onCall(async (request) => {
  const uid = requireAuth(request);
  const teamSnap = await db.collection('futbolTeams').where('ownerUid', '==', uid).limit(1).get();
  if (teamSnap.empty) return { team: null };
  const teamDoc = teamSnap.docs[0];
  const value = await computeFutbolTeamValue(teamDoc.id);
  return {
    team: {
      id: teamDoc.id,
      ...teamDoc.data(),
      value,
      instantSellPrice: Math.round((value * 2) / 3),
      maxListPrice: Math.round((value * 4) / 3),
    },
  };
});

// Kullanıcı revizesi: eskiden SADECE tüm takımlar oyunculara satıldığında
// (hiç bot kalmadığında) yeni bir alt lig açılıyordu ve bu her takım
// satışında ANINDA kontrol ediliyordu. Artık kural: SEZON SONUNDA (bkz.
// finishFutbolSeason), mevcut TOPLAM takımların EN AZ YARISI oyunculara
// aitse yeni bir lig (mevcut lig büyüklüğünde) açılır — böylece oyuncu
// sayısı arttıkça ligler kademeli olarak büyür. Yeni ligdeki takımların
// oyuncuları, eski tier/fiyat-bandı sisteminden BAĞIMSIZ, sabit bir
// aralıkta üretilir (bkz. FUTBOL_NEW_TIER_* sabitleri).
const FUTBOL_NEW_TIER_AGE_MIN = 20;
const FUTBOL_NEW_TIER_AGE_MAX = 25;
const FUTBOL_NEW_TIER_POWER_MIN = 50;
const FUTBOL_NEW_TIER_POWER_MAX = 100;
// [mevki, oyuncu sayısı] — toplam 12 (2+4+4+2), kullanıcı promptu.
const FUTBOL_NEW_TIER_SQUAD = [
  ['GK', 2],
  ['DEF', 4],
  ['MID', 4],
  ['FWD', 2],
];

function randomFutbolNewTierPlayer(position) {
  const power = Math.round(randomInRange(FUTBOL_NEW_TIER_POWER_MIN, FUTBOL_NEW_TIER_POWER_MAX) * 10) / 10;
  const age = Math.floor(randomInRange(FUTBOL_NEW_TIER_AGE_MIN, FUTBOL_NEW_TIER_AGE_MAX + 1));
  const remainingSeasons = Math.max(20 - (age - 16), 1);
  const value = Math.round((power * 1000 * remainingSeasons) / 20);
  const name = randomFutbolPlayerName();
  return { name, position, age, power, form: 100, value, forSale: false, listedAt: null };
}

// maybeCreateNextFutbolTierByOwnershipRatio — SEZON SONUNDA çağrılır
// (bkz. finishFutbolSeason). Mevcut toplam takımların yarısı (ya da
// fazlası) oyunculara aitse, mevcut lig büyüklüğünde (8 takım) yeni bir
// lig açar — ör. 16 takımdan 8'i oyuncularda ise 3. lig (toplam 24
// takım), sonraki sezon sonunda 24 takımdan 12'si oyunculardaysa 4. lig
// (toplam 32 takım), ve bu şekilde devam eder.
async function maybeCreateNextFutbolTierByOwnershipRatio() {
  const allTeamsSnap = await db.collection('futbolTeams').get();
  const totalCount = allTeamsSnap.size;
  if (totalCount === 0) return;
  const ownedCount = allTeamsSnap.docs.filter((d) => d.data().ownerUid).length;
  if (ownedCount * 2 < totalCount) return; // yarısından azı oyunculardaysa yeni lig yok

  const leaguesSnap = await db.collection('futbolLeagues').get();
  const leagues = leaguesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const newTier = Math.max(...leagues.map((l) => l.tier)) + 1;

  const usedNames = new Set(allTeamsSnap.docs.map((d) => d.data().name));
  const names = [];
  for (const n of FUTBOL_TEAM_NAME_POOL) {
    if (names.length >= FUTBOL_TEAM_SIZE_PER_LEAGUE) break;
    if (!usedNames.has(n)) names.push(n);
  }
  let suffix = 2;
  while (names.length < FUTBOL_TEAM_SIZE_PER_LEAGUE) {
    const base = FUTBOL_TEAM_NAME_POOL[names.length % FUTBOL_TEAM_NAME_POOL.length];
    const candidate = `${base} ${suffix}`;
    if (!usedNames.has(candidate) && !names.includes(candidate)) names.push(candidate);
    else suffix += 1;
  }

  const leagueRef = db.collection('futbolLeagues').doc();
  const teamIds = [];
  const batch = db.batch();
  const usedLogoSignatures = new Set();
  names.forEach((name) => {
    const teamRef = db.collection('futbolTeams').doc();
    teamIds.push(teamRef.id);
    batch.set(teamRef, {
      name,
      leagueId: leagueRef.id,
      tier: newTier,
      ownerUid: null,
      isBot: true,
      fans: Math.floor(randomInRange(10000, 30000)),
      tactic: 'dengeli',
      formation: '2-2-1',
      logo: pickUniqueFutbolLogo(usedLogoSignatures),
      stats: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    FUTBOL_NEW_TIER_SQUAD.forEach(([position, count]) => {
      for (let i = 0; i < count; i++) {
        const playerRef = db.collection('futbolPlayers').doc();
        batch.set(playerRef, { teamId: teamRef.id, ...randomFutbolNewTierPlayer(position) });
      }
    });
  });
  batch.set(leagueRef, {
    tier: newTier,
    name: `${newTier}. Lig`,
    season: FUTBOL_SEASON_START,
    teamIds,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  generateRoundRobinRounds(teamIds).forEach((roundMatches, roundIdx) => {
    roundMatches.forEach(([homeTeamId, awayTeamId]) => {
      const matchRef = db.collection('futbolMatches').doc();
      batch.set(matchRef, {
        leagueId: leagueRef.id,
        season: FUTBOL_SEASON_START,
        round: roundIdx + 1,
        homeTeamId,
        awayTeamId,
        homeScore: null,
        awayScore: null,
        status: 'scheduled',
        playedAt: null,
      });
    });
  });
  await batch.commit();
}

// buyFutbolTeam — iki kaynaktan biri: (a) bot (sahipsiz) takım, piyasa
// değeri üzerinden; (b) bir oyuncunun kendi ilan ettiği takım, onun
// belirlediği fiyattan (parayı SATICI alır). Bir oyuncunun aynı anda
// birden fazla takımı olamaz.
export const buyFutbolTeam = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId } = request.data || {};
  if (!teamId) throw new HttpsError('invalid-argument', 'teamId gerekli.');

  const alreadyOwned = await db.collection('futbolTeams').where('ownerUid', '==', uid).limit(1).get();
  if (!alreadyOwned.empty) {
    throw new HttpsError('failed-precondition', 'Zaten bir takımın var — önce onu satman gerekir.');
  }

  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) throw new HttpsError('not-found', 'Takım bulunamadı.');
  const team = teamSnap.data();

  const isBotTeam = !team.ownerUid;
  const isPlayerListing = Boolean(team.ownerUid) && team.forSale;
  if (!isBotTeam && !isPlayerListing) {
    throw new HttpsError('failed-precondition', 'Bu takım satılık değil.');
  }

  const price = isBotTeam ? await computeFutbolTeamValue(teamId) : team.salePrice;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if ((userSnap.data()?.gold || 0) < price) {
    throw new HttpsError('failed-precondition', 'Yeterli altının yok.');
  }

  const batch = db.batch();
  batch.update(userRef, { gold: admin.firestore.FieldValue.increment(-price) });
  if (isPlayerListing) {
    batch.update(db.collection('users').doc(team.ownerUid), {
      gold: admin.firestore.FieldValue.increment(price),
    });
    sendFutbolSms(
      batch,
      team.ownerUid,
      `⚽ ${team.name} takımın ${price.toLocaleString('tr-TR')} altına satıldı.`,
      'futbol_team_sold'
    );
  }
  batch.update(teamRef, {
    ownerUid: uid,
    isBot: false,
    forSale: false,
    salePrice: admin.firestore.FieldValue.delete(),
    listedAt: admin.firestore.FieldValue.delete(),
  });
  await batch.commit();

  // NOT: yeni lig açılışı artık burada (her satın almada anında) değil,
  // SEZON SONUNDA (finishFutbolSeason içinde, %50 sahiplik kuralına
  // göre) kontrol ediliyor — kullanıcı revizesi.

  return { ok: true, price };
});

// listFutbolTeamForSale — sahip olduğun takımı kendi belirlediğin bir
// fiyattan (anında satış fiyatı ile azami satış fiyatı arasında) diğer
// oyunculara açık şekilde listeler.
export const listFutbolTeamForSale = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId, price } = request.data || {};
  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }
  const value = await computeFutbolTeamValue(teamId);
  const minPrice = Math.round((value * 2) / 3);
  const maxPrice = Math.round((value * 4) / 3);
  const clean = Math.round(Number(price));
  if (!Number.isFinite(clean) || clean < minPrice || clean > maxPrice) {
    throw new HttpsError(
      'invalid-argument',
      `Fiyat ${minPrice.toLocaleString('tr-TR')} - ${maxPrice.toLocaleString('tr-TR')} altın arasında olmalı.`
    );
  }
  await teamRef.update({
    forSale: true,
    salePrice: clean,
    listedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

export const cancelFutbolTeamListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId } = request.data || {};
  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }
  await teamRef.update({
    forSale: false,
    salePrice: admin.firestore.FieldValue.delete(),
    listedAt: admin.firestore.FieldValue.delete(),
  });
  return { ok: true };
});

// sellFutbolTeam — anında satış, piyasa değerinin 2/3'ü karşılığında;
// takım tekrar bota döner (kullanıcı promptu: "anında sattığında takımın
// tekrardan botlara geçer").
export const sellFutbolTeam = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId } = request.data || {};
  if (!teamId) throw new HttpsError('invalid-argument', 'teamId gerekli.');

  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) throw new HttpsError('not-found', 'Takım bulunamadı.');
  if (teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }

  const value = await computeFutbolTeamValue(teamId);
  const instantPrice = Math.round((value * 2) / 3);
  const teamName = teamSnap.data().name;

  const batch = db.batch();
  batch.update(db.collection('users').doc(uid), { gold: admin.firestore.FieldValue.increment(instantPrice) });
  sendFutbolSms(
    batch,
    uid,
    `⚽ ${teamName} takımını anında ${instantPrice.toLocaleString('tr-TR')} altına sattın.`,
    'futbol_team_sold'
  );
  batch.update(teamRef, {
    ownerUid: null,
    isBot: true,
    tactic: 'dengeli',
    formation: '2-2-1',
    forSale: false,
    salePrice: admin.firestore.FieldValue.delete(),
    listedAt: admin.firestore.FieldValue.delete(),
  });
  // Bota dönen takımın oyuncuları artık yaşlanmayacak; 30 yaşın
  // üzerinde olan varsa (oyuncu sahibiyken yaşlanmış olabilir) hemen
  // 20'ye + sabit 99 güce gençleştiriyoruz — sezon sonunu beklemeden,
  // finishFutbolSeason'daki bot gençleştirme kuralıyla birebir aynı
  // (bkz. oradaki not: güç sınırsız artmasın diye 99'da sabitleniyor).
  const playersSnap = await db.collection('futbolPlayers').where('teamId', '==', teamId).get();
  const remainingSeasonsAt20 = 20 - (20 - 16);
  const rejuvenatedValue = Math.round((99 * 1000 * remainingSeasonsAt20) / 20);
  playersSnap.docs.forEach((d) => {
    if (d.data().age > 30) {
      batch.update(d.ref, { age: 20, power: 99, form: 100, value: rejuvenatedValue });
    }
  });
  await batch.commit();

  return { ok: true, price: instantPrice };
});

// --- Futbol modülü: Faz 5a (kadro/taktik yönetimi) ---

// setFutbolLineup — takım sahibi dizilim, taktik ve 6 kişilik ilk 11'i
// (halısaha formatı) seçer. Sunucu, seçimin dizilimle birebir uyduğunu
// (pozisyon sayıları) ve aynı oyuncunun 2 kere seçilmediğini doğrular.
export const setFutbolLineup = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId, formation, tactic, lineup } = request.data || {};
  if (!FUTBOL_FORMATIONS[formation]) throw new HttpsError('invalid-argument', 'Geçersiz dizilim.');
  if (!FUTBOL_TACTICS.includes(tactic)) throw new HttpsError('invalid-argument', 'Geçersiz taktik.');
  if (!Array.isArray(lineup)) throw new HttpsError('invalid-argument', 'Geçersiz kadro.');

  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }

  if (new Set(lineup).size !== lineup.length) {
    throw new HttpsError('invalid-argument', 'Aynı oyuncu birden fazla kez seçilemez.');
  }

  const trainingPlayerIds = teamSnap.data().trainingPlayerIds || [];
  if (lineup.some((id) => trainingPlayerIds.includes(id))) {
    throw new HttpsError('failed-precondition', 'Antrenmandaki bir oyuncu ilk 11e alınamaz.');
  }

  const playersSnap = await db.collection('futbolPlayers').where('teamId', '==', teamId).get();
  const byId = {};
  playersSnap.docs.forEach((d) => (byId[d.id] = { id: d.id, ...d.data() }));

  const need = FUTBOL_FORMATIONS[formation];
  const got = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of lineup) {
    const p = byId[id];
    if (!p) throw new HttpsError('invalid-argument', 'Kadroda olmayan bir oyuncu seçildi.');
    if (got[p.position] === undefined) throw new HttpsError('invalid-argument', 'Geçersiz mevki.');
    got[p.position] += 1;
  }
  const shapeOk = Object.keys(need).every((k) => need[k] === (got[k] || 0));
  if (!shapeOk) {
    throw new HttpsError('invalid-argument', 'Seçilen oyuncular dizilimle uyuşmuyor.');
  }

  await teamRef.update({ formation, tactic, lineup });
  return { ok: true };
});

// --- Futbol modülü: Faz 5b (transfer piyasası) ---
//
// Kullanıcı revizesi: eski sistem stoğu (ucuz/orta/pahalı fiyat bandı,
// randomFutbolPlayer'ın değer→güç formülüyle) takımlardaki gerçek
// oyunculardan tamamen kopuk, bazen 200-270 güç gibi anlamsız değerler
// üretiyordu (oyundaki en güçlü oyuncu ~100 güçteyken). Yeni sistem:
// her mevki için o mevkideki (bir takıma ait, transfer listesindeki
// DEĞİL) en güçlü oyuncunun gücünü baz alır; her mevkide 3 "slot" var,
// her biri o taban güce göre bir bant içinde (bkz. FUTBOL_SYSTEM_POWER_
// BANDS) üretilir. 4 mevki × 3 slot = 12 sistem oyuncusu — sayı aynı
// kaldı, ama artık oyunun mevcut güç seviyesiyle orantılı.
const FUTBOL_TRANSFER_POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const FUTBOL_SYSTEM_LISTING_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 saat satılmazsa kendiliğinden yenilenir
// FUTBOL_OWNER_LISTING_MAX_AGE_MS — kullanıcı revizesi: "sistemin
// koyduğu oyuncular 24 saatte listeden kalkıyor, bu anında satılanlar
// ve oyuncuların kendi ilanları için de geçerli olsun" — eskiden 7
// gündü, artık sistemle AYNI (24 saat).
const FUTBOL_OWNER_LISTING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTBOL_SYSTEM_RESTOCK_DELAY_MS = 60 * 60 * 1000; // satıldıktan 1 saat sonra yenisi gelsin
// Slot 0 = en güçlü, slot 1 = orta (%75-90'ı), slot 2 = en zayıf
// (%50-75'i). Kullanıcı revizesi: slot 0 ÖNCEDEN taban gücün %90-110'u
// idi — ama bu, oyuncular sürekli en güçlü sistem oyuncusunu alıp yeni
// taban yaptıkça (taban → +%10 → taban → +%10 ...) ortalama gücü
// hızlıca ve durmadan şişiriyordu, parası çok olan orantısız hızlı
// güçleniyordu. Artık slot 0 en fazla %2 YUKARI, en fazla %10 AŞAĞI
// (taban 100 ise: 90-102 arası) — hâlâ takımın en iyisine yakın ama
// artık her satın almada ortalamayı agresifçe yukarı taşımıyor.
const FUTBOL_SYSTEM_POWER_BANDS = [
  { min: 0.9, max: 1.02 },
  { min: 0.75, max: 0.9 },
  { min: 0.5, max: 0.75 },
];
const FUTBOL_SYSTEM_MIN_AGE = 16;
const FUTBOL_SYSTEM_MAX_AGE = 30;
// Henüz hiç takımda o mevkide oyuncu yoksa (teorik olarak imkansız ama
// güvenlik için) düşecek taban güç.
const FUTBOL_SYSTEM_FALLBACK_POWER = 50;

async function getFutbolTeamPositionCounts(teamId, excludePlayerId) {
  const snap = await db.collection('futbolPlayers').where('teamId', '==', teamId).get();
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  snap.docs.forEach((d) => {
    if (d.id === excludePlayerId) return;
    const pos = d.data().position;
    if (counts[pos] !== undefined) counts[pos] += 1;
  });
  return counts;
}

function meetsFutbolMinSquad(counts) {
  return Object.keys(FUTBOL_MIN_SQUAD).every((k) => (counts[k] || 0) >= FUTBOL_MIN_SQUAD[k]);
}

// computeFutbolMaxPowerByPosition — o an BİR TAKIMA AİT (transfer
// listesindeki sistem/anında/manuel ilanlar HARİÇ — teamId==null) tüm
// oyuncular arasında, her mevkideki DÜZ (basit) en yüksek gücü döner.
// Transfer piyasasının "taban"ı budur. Kullanıcı revizesi: otomatik
// "outlier ayıklama" kaldırıldı — mantık artık dolambaçsız: taban güç
// birebir takımlardaki en güçlü oyuncu. Anormal/bozuk bir kayıt varsa
// (örn. eski sistemden kalma), doğrudan Firestore'dan o oyuncunun
// gücünü düzeltmek yeterli — bir sonraki hesaplamada (satın alma, 15
// dakikalık slot doldurma, 24 saatlik tazeleme ya da aşağıdaki
// forceRefreshFutbolTransferMarket ile ANINDA) taban da otomatik düzelir.
async function computeFutbolMaxPowerByPosition() {
  const snap = await db.collection('futbolPlayers').get();
  const max = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  snap.docs.forEach((d) => {
    const p = d.data();
    if (!p.teamId) return; // transfer listesinde/sahipsiz — sayılmaz
    if (max[p.position] !== undefined && p.power > max[p.position]) {
      max[p.position] = p.power;
    }
  });
  Object.keys(max).forEach((pos) => {
    if (!(max[pos] > 0)) max[pos] = FUTBOL_SYSTEM_FALLBACK_POWER;
  });
  return max;
}

// randomFutbolSystemPlayer — verilen mevki+bant için, taban güce göre
// bant aralığında bir güç, 16-30 arası rastgele yaş üretir. Değer,
// diğer oyuncularla aynı formülle (randomFutbolPlayer'daki gibi)
// güç×kalan kariyer yılına göre hesaplanır ki ekonomi tutarlı kalsın.
function randomFutbolSystemPlayer(position, basePower, bandIndex) {
  const band = FUTBOL_SYSTEM_POWER_BANDS[bandIndex];
  const power = Math.max(20, Math.round(randomInRange(basePower * band.min, basePower * band.max) * 10) / 10);
  const age = Math.floor(randomInRange(FUTBOL_SYSTEM_MIN_AGE, FUTBOL_SYSTEM_MAX_AGE + 1));
  const remainingSeasons = 20 - (age - 16);
  const value = Math.round((power * 1000 * remainingSeasons) / 20);
  const name = randomFutbolPlayerName();
  return { name, position, age, power, form: 100, value, forSale: false, listedAt: null };
}

// buildFutbolSystemStockWrite — bir slot (position_bandIndex) için yeni
// bir sistem oyuncusu dokümanı + slot dokümanı güncellemesini VERİLEN
// batch'e ekler (kendi commit'ini yapmaz — çağıran karar verir). newRef
// olarak yeni oluşturulan futbolPlayers doküman referansını döner.
function buildFutbolSystemStockWrite(batch, position, bandIndex, maxPowerByPosition) {
  const slotKey = `${position}_${bandIndex}`;
  const playerRef = db.collection('futbolPlayers').doc();
  const data = randomFutbolSystemPlayer(position, maxPowerByPosition[position], bandIndex);
  batch.set(playerRef, {
    teamId: null,
    ...data,
    forSale: true,
    salePrice: data.value,
    saleSource: 'system',
    sellerUid: null,
    slotKey,
    bandIndex,
    listedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(
    db.collection('futbolTransferSlots').doc(slotKey),
    { position, bandIndex, playerId: playerRef.id, refillAt: admin.firestore.FieldValue.delete() },
    { merge: true }
  );
  return playerRef;
}

// rebuildFutbolTransferMarket — sistem stoğunu (mevcut ne varsa) tamamen
// silip, O ANKİ takım güçlerine göre 12 slotu (4 mevki × 3 bant) sıfırdan
// kurar. Hem tek seferlik geçiş (runFutbolDataIntegrityFix) hem de
// istendiğinde elle tetiklenen forceRefreshFutbolTransferMarket bu
// ORTAK fonksiyonu kullanır — mantık tek bir yerde.
async function rebuildFutbolTransferMarket() {
  // Var olan sistem stoğunu (bant/slot fark etmeksizin) tamamen sil.
  const oldSystemSnap = await db.collection('futbolPlayers').where('saleSource', '==', 'system').get();
  let delBatch = db.batch();
  let delCount = 0;
  for (const d of oldSystemSnap.docs) {
    delBatch.delete(d.ref);
    delCount += 1;
    if (delCount % 450 === 0) {
      await delBatch.commit();
      delBatch = db.batch();
    }
  }
  if (delCount % 450 !== 0) await delBatch.commit();

  // Olası eski slot dokümanlarını da (varsa) temizle.
  const oldSlotsSnap = await db.collection('futbolTransferSlots').get();
  if (!oldSlotsSnap.empty) {
    let slotDelBatch = db.batch();
    oldSlotsSnap.docs.forEach((d) => slotDelBatch.delete(d.ref));
    await slotDelBatch.commit();
  }

  const maxPowerByPosition = await computeFutbolMaxPowerByPosition();
  const batch = db.batch();
  FUTBOL_TRANSFER_POSITIONS.forEach((position) => {
    FUTBOL_SYSTEM_POWER_BANDS.forEach((_, bandIndex) => {
      buildFutbolSystemStockWrite(batch, position, bandIndex, maxPowerByPosition);
    });
  });
  await batch.commit();
}

// runFutbolDataIntegrityFix — BİR KEZ (migration bayrağıyla) çalışıp
// biten, ucuz bir düzeltme. Kullanıcı revizesi: kalıcı/her-yazımda-
// tetiklenen bir trigger (önceki syncFutbolPlayerValue) YERİNE — o,
// takımdaki HER oyuncunun HER maç/antrenman güç kazanışında sonsuza dek
// ekstra bir yazma yapıyordu ve Firestore faturasını (özellikle
// "writes") gereksiz yere şişiriyordu. Bunun yerine:
//   1) TÜM oyuncuların "value" alanını GÜNCEL power+age'e göre TEK SEFER
//      düzeltir (sadece gerçekten yanlışsa yazar),
//   2) Ardından transfer piyasasının 12 sistem oyuncusunu bu düzeltilmiş
//      güncel taban güce göre sıfırdan kurar.
// Bir daha ASLA tekrar çalışmaz (migration bayrağı) — bu yüzden
// maliyeti tamamen SINIRLI ve TEK SEFERLİK, kalıcı bir yük değil.
async function runFutbolDataIntegrityFix() {
  const migrationRef = db.collection('migrations').doc('futbolDataIntegrityFixV1');
  const migrationSnap = await migrationRef.get();
  if (migrationSnap.exists) return;

  // Dünya (ligler/takımlar) henüz kurulmadıysa bir şey yapmayalım —
  // bayrağı işaretlemeden çıkıyoruz ki bir sonraki denemede tekrar
  // bakılsın.
  const leaguesSnap = await db.collection('futbolLeagues').limit(1).get();
  if (leaguesSnap.empty) return;

  const allPlayersSnap = await db.collection('futbolPlayers').get();
  let batch = db.batch();
  let opCount = 0;
  for (const d of allPlayersSnap.docs) {
    const p = d.data();
    if (typeof p.power !== 'number' || typeof p.age !== 'number') continue;
    const remainingSeasons = Math.max(20 - (p.age - 16), 1);
    const correctValue = Math.round((p.power * 1000 * remainingSeasons) / 20);
    if (p.value === correctValue) continue; // zaten doğru, gereksiz yazma yok
    batch.update(d.ref, { value: correctValue });
    opCount += 1;
    if (opCount % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (opCount % 450 !== 0) await batch.commit();

  await rebuildFutbolTransferMarket();

  await migrationRef.set({ ranAt: admin.firestore.FieldValue.serverTimestamp() });
}

// Otomatik (bir kerelik, migration bayrağıyla) tetikleme için ince bir
// onCall sarmalayıcı — App.jsx girişte otomatik çağırır.
export const resetFutbolTransferMarket = onCall(async (request) => {
  requireAuth(request);
  await runFutbolDataIntegrityFix();
  return { ok: true };
});

// forceRefreshFutbolTransferMarket — YUKARIDAKİNİN AKSİNE bayraksız,
// HER ÇAĞRIDA çalışır. Kullanım senaryosu: Firestore'dan elle bozuk bir
// oyuncunun gücünü düzelttikten sonra, transfer piyasasının bu yeni
// (doğru) taban güce göre ANINDA yeniden kurulmasını istediğinde — saatlik
// otomatik döngüyü beklemene gerek kalmadan. SADECE YÖNETİCİ (ADMIN_UIDS)
// çağırabilir — oyuncular bu aksiyonu ne görür ne de tetikleyebilir
// (bkz. requireAdmin). NOT: bu fonksiyonu deploy sonrası bir kez elle
// tetiklemene aslında gerek YOK — runFutbolDataIntegrityFix zaten
// deploy'dan sonra en geç 1 saat içinde kendiliğinden aynı işi yapacak.
// Sadece "hemen şimdi görmek istiyorum" durumları için burada duruyor.
export const forceRefreshFutbolTransferMarket = onCall(async (request) => {
  requireAdmin(request);
  await rebuildFutbolTransferMarket();
  return { ok: true };
});

// instantSellFutbolPlayer — oyuncuyu anında sisteme sat (değerin 2/3'ü),
// oyuncu takımdan çıkar ve %10 zamla (kullanıcı promptu) tekrar transfer
// listesine düşer. Minimum kadro (2 kaleci/3 defans/3 orta/2 forvet)
// altına düşürecek satışlar reddedilir.
export const instantSellFutbolPlayer = onCall(async (request) => {
  const uid = requireAuth(request);
  const { playerId } = request.data || {};
  const playerRef = db.collection('futbolPlayers').doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) throw new HttpsError('not-found', 'Oyuncu bulunamadı.');
  const player = playerSnap.data();
  if (!player.teamId) throw new HttpsError('failed-precondition', 'Bu oyuncu bir takıma ait değil.');

  const teamSnap = await db.collection('futbolTeams').doc(player.teamId).get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu oyuncu senin takımında değil.');
  }

  const counts = await getFutbolTeamPositionCounts(player.teamId, playerId);
  if (!meetsFutbolMinSquad(counts)) {
    throw new HttpsError('failed-precondition', 'Bu satışla minimum kadro sayısının altına düşersin.');
  }

  const instantPrice = Math.round((player.value * 2) / 3);
  const relistPrice = Math.round(instantPrice * 1.1);

  const batch = db.batch();
  batch.update(db.collection('users').doc(uid), { gold: admin.firestore.FieldValue.increment(instantPrice) });
  sendFutbolSms(
    batch,
    uid,
    `⚽ ${player.name} oyuncunu anında ${instantPrice.toLocaleString('tr-TR')} altına sattın.`,
    'futbol_player_sold'
  );
  batch.update(playerRef, {
    teamId: null,
    forSale: true,
    salePrice: relistPrice,
    saleSource: 'instant',
    sellerUid: null,
    listedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true, price: instantPrice };
});

// listFutbolPlayerForSale — takım sahibi oyuncusunu transfer listesine
// kendi belirlediği bir fiyattan koyar (anında satış fiyatı ile azami
// satış fiyatı arasında — kullanıcı promptundaki band).
export const listFutbolPlayerForSale = onCall(async (request) => {
  const uid = requireAuth(request);
  const { playerId, price } = request.data || {};
  const playerRef = db.collection('futbolPlayers').doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) throw new HttpsError('not-found', 'Oyuncu bulunamadı.');
  const player = playerSnap.data();
  if (!player.teamId) throw new HttpsError('failed-precondition', 'Bu oyuncu bir takıma ait değil.');

  const teamSnap = await db.collection('futbolTeams').doc(player.teamId).get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu oyuncu senin takımında değil.');
  }

  const minPrice = Math.round((player.value * 2) / 3);
  const maxPrice = Math.round((player.value * 4) / 3);
  const clean = Math.round(Number(price));
  if (!Number.isFinite(clean) || clean < minPrice || clean > maxPrice) {
    throw new HttpsError(
      'invalid-argument',
      `Fiyat ${minPrice.toLocaleString('tr-TR')} - ${maxPrice.toLocaleString('tr-TR')} altın arasında olmalı.`
    );
  }

  await playerRef.update({
    forSale: true,
    salePrice: clean,
    saleSource: 'manual',
    sellerUid: uid,
    listedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

export const cancelFutbolPlayerListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { playerId } = request.data || {};
  const playerRef = db.collection('futbolPlayers').doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) throw new HttpsError('not-found', 'Oyuncu bulunamadı.');
  const player = playerSnap.data();
  if (player.saleSource !== 'manual' || player.sellerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu ilan sana ait değil.');
  }
  await playerRef.update({
    forSale: false,
    salePrice: admin.firestore.FieldValue.delete(),
    saleSource: admin.firestore.FieldValue.delete(),
    sellerUid: admin.firestore.FieldValue.delete(),
    listedAt: admin.firestore.FieldValue.delete(),
  });
  return { ok: true };
});

// buyFutbolPlayer — sistem stoğu / anında-satılmış / oyuncunun kendi
// ilanı fark etmeksizin tek giriş noktası. Sistem ve anında-satış
// ilanlarında ödeme kimseye gitmez (sink); manuel ilanlarda satıcıya
// gider. Sistem ilanı satıldığında aynı mevki+banttan yenisi üretilir.
export const buyFutbolPlayer = onCall(async (request) => {
  const uid = requireAuth(request);
  const { playerId } = request.data || {};

  const myTeamSnap = await db.collection('futbolTeams').where('ownerUid', '==', uid).limit(1).get();
  if (myTeamSnap.empty) throw new HttpsError('failed-precondition', 'Önce bir takımın olmalı.');
  const myTeam = myTeamSnap.docs[0];

  const playerRef = db.collection('futbolPlayers').doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) throw new HttpsError('not-found', 'Oyuncu bulunamadı.');
  const player = playerSnap.data();
  if (!player.forSale) throw new HttpsError('failed-precondition', 'Bu oyuncu satılık değil.');
  if (player.teamId === myTeam.id) throw new HttpsError('failed-precondition', 'Bu oyuncu zaten senin takımında.');

  const price = player.salePrice || 0;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if ((userSnap.data()?.gold || 0) < price) {
    throw new HttpsError('failed-precondition', 'Yeterli altının yok.');
  }

  if (player.saleSource === 'manual' && player.teamId) {
    const counts = await getFutbolTeamPositionCounts(player.teamId, playerId);
    if (!meetsFutbolMinSquad(counts)) {
      await playerRef.update({
        forSale: false,
        salePrice: admin.firestore.FieldValue.delete(),
        saleSource: admin.firestore.FieldValue.delete(),
        sellerUid: admin.firestore.FieldValue.delete(),
        listedAt: admin.firestore.FieldValue.delete(),
      });
      throw new HttpsError('failed-precondition', 'Bu oyuncu artık satılık değil.');
    }
  }

  const batch = db.batch();
  batch.update(userRef, { gold: admin.firestore.FieldValue.increment(-price) });
  if (player.saleSource === 'manual' && player.sellerUid) {
    batch.update(db.collection('users').doc(player.sellerUid), {
      gold: admin.firestore.FieldValue.increment(price),
    });
    sendFutbolSms(
      batch,
      player.sellerUid,
      `⚽ ${player.name} oyuncun ${price.toLocaleString('tr-TR')} altına satıldı.`,
      'futbol_player_sold'
    );
  }
  batch.update(playerRef, {
    teamId: myTeam.id,
    forSale: false,
    salePrice: admin.firestore.FieldValue.delete(),
    saleSource: admin.firestore.FieldValue.delete(),
    sellerUid: admin.firestore.FieldValue.delete(),
    listedAt: admin.firestore.FieldValue.delete(),
    tierBand: admin.firestore.FieldValue.delete(),
    slotKey: admin.firestore.FieldValue.delete(),
    bandIndex: admin.firestore.FieldValue.delete(),
  });
  if (player.saleSource === 'system' && player.slotKey) {
    // Kullanıcı promptu: satılan sistem oyuncusunun yeri HEMEN
    // doldurulmaz — 1 saat sonra futbolTransferMarketHourlyMaintenance tarafından
    // doldurulur (bkz. yukarıdaki FUTBOL_SYSTEM_RESTOCK_DELAY_MS).
    batch.set(
      db.collection('futbolTransferSlots').doc(player.slotKey),
      {
        playerId: null,
        refillAt: admin.firestore.Timestamp.fromMillis(Date.now() + FUTBOL_SYSTEM_RESTOCK_DELAY_MS),
      },
      { merge: true }
    );
  }
  await batch.commit();
  return { ok: true, price };
});

// futbolTransferMarketHourlyMaintenance — SAATTE BİR çalışan TEK görev
// (kullanıcı revizesi: maliyeti azaltmak için önceki 15-dakikalık ayrı
// görevle birleştirildi — günde 120 yerine 24 tetikleme). Üç işi birden
// yapar:
//   1) Tek seferlik veri/piyasa düzeltmesini dener (bkz.
//      runFutbolDataIntegrityFix) — ilk başarılı çalıştıktan sonra
//      sadece 1 ucuz bayrak okumasıyla anında çıkar, kalıcı bir yük
//      DEĞİLDİR.
//   2) Bekleme süresi (1 saat) dolmuş boş transfer slotlarını doldurur.
//   3) 24 saattir satılmayan sistem oyuncularını yerinde tazeler; 24
//      saattir satılmayan kişisel ilanların (anında satış/elle listeleme)
//      süresini doldurur — anında satılanlar tamamen kalkar (yok olur),
//      elle listelenenler ilandan çıkıp sahibinin kadrosuna geri döner
//      (tekrar listeleyebilir).
// computeFutbolMaxPowerByPosition (pahalı tam koleksiyon taraması)
// SADECE gerçekten bir şey dolduracaksak/tazeleyeceksek çağrılır, ayrıca
// (2) ve (3) aynı çalıştırmada ikisi de gerekiyorsa TEK seferde
// hesaplanıp paylaşılır — gereksiz tekrar taramayı önler.
export const futbolTransferMarketHourlyMaintenance = onSchedule({ schedule: 'every 60 minutes' }, async () => {
  await runFutbolDataIntegrityFix();

  const nowMs = Date.now();
  const nowTs = admin.firestore.Timestamp.now();

  const [dueSlotsSnap, listedSnap] = await Promise.all([
    db.collection('futbolTransferSlots').where('playerId', '==', null).where('refillAt', '<=', nowTs).get(),
    db.collection('futbolPlayers').where('forSale', '==', true).get(),
  ]);

  const batch = db.batch();
  const staleSystemSlots = [];

  listedSnap.docs.forEach((d) => {
    const p = d.data();
    if (!p.listedAt) return;
    const ageMs = nowMs - p.listedAt.toMillis();
    if (p.saleSource === 'system' && ageMs > FUTBOL_SYSTEM_LISTING_MAX_AGE_MS) {
      batch.delete(d.ref);
      if (p.slotKey) staleSystemSlots.push({ slotKey: p.slotKey, position: p.position, bandIndex: p.bandIndex });
    } else if (p.saleSource === 'instant' && ageMs > FUTBOL_OWNER_LISTING_MAX_AGE_MS) {
      batch.delete(d.ref);
    } else if (p.saleSource === 'manual' && ageMs > FUTBOL_OWNER_LISTING_MAX_AGE_MS) {
      batch.update(d.ref, {
        forSale: false,
        salePrice: admin.firestore.FieldValue.delete(),
        saleSource: admin.firestore.FieldValue.delete(),
        sellerUid: admin.firestore.FieldValue.delete(),
        listedAt: admin.firestore.FieldValue.delete(),
      });
    }
  });

  const needsMaxPower = !dueSlotsSnap.empty || staleSystemSlots.length > 0;
  if (needsMaxPower) {
    const maxPowerByPosition = await computeFutbolMaxPowerByPosition();
    dueSlotsSnap.docs.forEach((slotDoc) => {
      const { position, bandIndex } = slotDoc.data();
      buildFutbolSystemStockWrite(batch, position, bandIndex, maxPowerByPosition);
    });
    staleSystemSlots.forEach(({ position, bandIndex }) => {
      buildFutbolSystemStockWrite(batch, position, bandIndex, maxPowerByPosition);
    });
  }

  await batch.commit();
});

// listFutbolTransferMarket — mevcut tüm satılık oyuncuları döner
// (sistem + anında + manuel), istemci sekmelere ayırıyor.
export const listFutbolTransferMarket = onCall(async (request) => {
  requireAuth(request);
  const snap = await db.collection('futbolPlayers').where('forSale', '==', true).get();
  const players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { players };
});

// --- Futbol modülü: Faz 5c (forma/logo kaydetme) ---
export const setFutbolTeamLogo = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId, shape, pattern, icon, primary, secondary } = request.data || {};
  if (!FUTBOL_LOGO_SHAPES.includes(shape) || !FUTBOL_LOGO_PATTERNS.includes(pattern)) {
    throw new HttpsError('invalid-argument', 'Geçersiz forma seçimi.');
  }
  if (icon && !FUTBOL_LOGO_ICONS.includes(icon)) {
    throw new HttpsError('invalid-argument', 'Geçersiz ikon.');
  }
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  if (!hexRe.test(primary) || !hexRe.test(secondary)) {
    throw new HttpsError('invalid-argument', 'Geçersiz renk.');
  }
  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }
  await teamRef.update({ logo: { shape, pattern, icon: icon || null, primary, secondary } });
  return { ok: true };
});

// --- Futbol modülü: Faz 6 (antrenman — tüm takımlarda hazır kurulu) ---

// FUTBOL_TRAINING_SLOTS — kullanıcı revizesi: artık 3 "genel" boş kutu
// değil, TAM OLARAK 4 kutu var — her mevki (Kaleci/Defans/Orta Saha/
// Forvet) için bir tane. Bir mevkide aynı anda sadece 1 oyuncu antrenman
// yapabilir; toplamda dolarsa (4 mevkinin hepsi doluysa) 4 oyuncu olur.
const FUTBOL_TRAINING_SLOTS = 4;

// addFutbolTraining — bir oyuncuyu o günkü antrenman listesine ekler.
// Kullanıcı revizesi: artık mevki başına 1 kutu (toplam 4) — aynı
// mevkiden ikinci bir oyuncu antrenmana giremez, önce o mevkideki
// oyuncu çıkarılmalı (kutuyu boşalt → başka oyuncu koy). 18:00'de gücü
// artar (bkz. resolveFutbolTrainingForAllTeams), 19:00'a kadar (maçla
// aynı süre) o oyuncu o günkü maça çıkamaz.
export const addFutbolTraining = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId, playerId } = request.data || {};
  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }
  const current = teamSnap.data().trainingPlayerIds || [];
  if (current.includes(playerId)) {
    return { ok: true }; // zaten ekli
  }
  if (current.length >= FUTBOL_TRAINING_SLOTS) {
    throw new HttpsError('failed-precondition', `Günde en fazla ${FUTBOL_TRAINING_SLOTS} oyuncu antrenman yapabilir.`);
  }
  const lineup = teamSnap.data().lineup || [];
  if (lineup.includes(playerId)) {
    throw new HttpsError('failed-precondition', 'Bu oyuncu ilk 11 kadroda, önce kadrodan çıkarmalısın.');
  }
  const playerSnap = await db.collection('futbolPlayers').doc(playerId).get();
  if (!playerSnap.exists || playerSnap.data().teamId !== teamId) {
    throw new HttpsError('invalid-argument', 'Bu oyuncu senin kadronda değil.');
  }
  const newPlayer = playerSnap.data();
  if (current.length > 0) {
    const currentPlayersSnap = await db
      .collection('futbolPlayers')
      .where(admin.firestore.FieldPath.documentId(), 'in', current.slice(0, 30))
      .get();
    const samePositionTaken = currentPlayersSnap.docs.some(
      (d) => d.data().position === newPlayer.position
    );
    if (samePositionTaken) {
      const posLabels = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
      throw new HttpsError(
        'failed-precondition',
        `${posLabels[newPlayer.position] || newPlayer.position} kutusu zaten dolu.`
      );
    }
  }
  await teamRef.update({ trainingPlayerIds: [...current, playerId] });
  return { ok: true };
});

export const removeFutbolTraining = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId, playerId } = request.data || {};
  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }
  const current = teamSnap.data().trainingPlayerIds || [];
  await teamRef.update({ trainingPlayerIds: current.filter((id) => id !== playerId) });
  return { ok: true };
});

// --- Futbol modülü: Faz 7 (İddaa Bayii) ---

const FUTBOL_BET_PAYOUT_MULTIPLIER = 5;

function futbolMatchOutcome(match) {
  if (match.homeScore > match.awayScore) return 'home';
  if (match.homeScore < match.awayScore) return 'away';
  return 'draw';
}

// placeFutbolBet — o ligin GÜNCEL turundaki (4 maç) hepsi için tahmin
// gerektirir. Maçlardan biri bile artık 'scheduled' değilse (yani gün
// 18:00'i geçtiyse) kupon reddedilir — kullanıcı promptundaki "saat
// 18'e kadar" kuralı, sunucu saatine güvenmek yerine maçların gerçek
// durumuna bakarak uygulanıyor.
export const placeFutbolBet = onCall(async (request) => {
  const uid = requireAuth(request);
  const { leagueId, stake, predictions } = request.data || {};
  const cleanStake = Math.round(Number(stake));
  if (!Number.isFinite(cleanStake) || cleanStake <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz bahis miktarı.');
  }
  if (!Array.isArray(predictions) || predictions.length !== 4) {
    throw new HttpsError('invalid-argument', "Tam olarak 4 maç için tahmin gerekli.");
  }

  const leagueSnap = await db.collection('futbolLeagues').doc(leagueId).get();
  if (!leagueSnap.exists) throw new HttpsError('not-found', 'Lig bulunamadı.');
  const round = leagueSnap.data().currentRound || 1;

  // Kullanıcı, aynı tur için birden fazla kupon oynayabilir (kullanıcı
  // promptu) — bu yüzden burada tekil kupon kontrolü YOK.

  const matchesSnap = await db
    .collection('futbolMatches')
    .where('leagueId', '==', leagueId)
    .where('round', '==', round)
    .get();
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (matches.length !== 4) {
    throw new HttpsError('failed-precondition', 'Bu ligde güncel turda 4 maç yok.');
  }
  if (matches.some((m) => m.status !== 'scheduled')) {
    throw new HttpsError('failed-precondition', "Bugünün maçları başladı, kupon için 18:00'i bekle.");
  }

  const matchIds = new Set(matches.map((m) => m.id));
  const predictedIds = new Set(predictions.map((p) => p.matchId));
  if (predictedIds.size !== 4 || [...predictedIds].some((id) => !matchIds.has(id))) {
    throw new HttpsError('invalid-argument', 'Tahminler bu turun maçlarıyla uyuşmuyor.');
  }
  if (predictions.some((p) => !['home', 'draw', 'away'].includes(p.pick))) {
    throw new HttpsError('invalid-argument', 'Geçersiz tahmin.');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if ((userSnap.data()?.gold || 0) < cleanStake) {
    throw new HttpsError('failed-precondition', 'Yeterli altının yok.');
  }

  const betRef = db.collection('futbolBets').doc();
  const batch = db.batch();
  batch.update(userRef, { gold: admin.firestore.FieldValue.increment(-cleanStake) });
  batch.set(betRef, {
    uid,
    leagueId,
    round,
    stake: cleanStake,
    predictions,
    status: 'pending',
    payout: 0,
    placedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true };
});

// resolveFutbolBetsForRound — o turun 4 maçı bitince (resolveFutbolMatch
// çağrılarının hemen ardından) çağrılır: 4 tahmin de tutarsa 5 kat
// ödeme, tutmazsa yatırılan altın (zaten düşülmüştü) kalıcı olarak gider.
async function resolveFutbolBetsForRound(leagueId, round) {
  const [betsSnap, matchesSnap] = await Promise.all([
    db.collection('futbolBets').where('leagueId', '==', leagueId).where('round', '==', round).where('status', '==', 'pending').get(),
    db.collection('futbolMatches').where('leagueId', '==', leagueId).where('round', '==', round).get(),
  ]);
  if (betsSnap.empty) return;

  const outcomeByMatchId = {};
  matchesSnap.docs.forEach((d) => {
    const m = d.data();
    if (m.status === 'finished') outcomeByMatchId[d.id] = futbolMatchOutcome(m);
  });

  const batch = db.batch();
  betsSnap.docs.forEach((d) => {
    const bet = d.data();
    const allCorrect = bet.predictions.every((p) => outcomeByMatchId[p.matchId] === p.pick);
    if (allCorrect) {
      const payout = bet.stake * FUTBOL_BET_PAYOUT_MULTIPLIER;
      batch.update(db.collection('users').doc(bet.uid), {
        gold: admin.firestore.FieldValue.increment(payout),
      });
      batch.update(d.ref, { status: 'won', payout });
      sendFutbolSms(
        batch,
        bet.uid,
        `🎉 İddaa kuponun tuttu! 4/4 doğru tahmin, ${payout.toLocaleString('tr-TR')} altın kazandın.`,
        'futbol_bet_result'
      );
    } else {
      batch.update(d.ref, { status: 'lost', payout: 0 });
      sendFutbolSms(
        batch,
        bet.uid,
        `İddaa kuponun tutmadı. Yatırdığın ${bet.stake.toLocaleString('tr-TR')} altın gitti.`,
        'futbol_bet_result'
      );
    }
  });
  await batch.commit();
}

// --- Futbol modülü: Faz 10 (Kulüpler dizini) ---

// getFutbolTeamDetail — puan tablosunda bir takıma tıklandığında logo,
// başkan (oyuncuya aitse adı, botsa "Bot Yönetimi") ve güncel değerini
// döner. Başkan adı için users/{uid} okunuyor — bunu istemci YAPAMAZ
// (firestore.rules sadece kendi dokümanını okumana izin verir), bu
// yüzden Admin SDK ile burada, sunucu tarafında yapılıyor.
export const getFutbolTeamDetail = onCall(async (request) => {
  requireAuth(request);
  const { teamId } = request.data || {};
  if (!teamId) throw new HttpsError('invalid-argument', 'teamId gerekli.');

  const teamSnap = await db.collection('futbolTeams').doc(teamId).get();
  if (!teamSnap.exists) throw new HttpsError('not-found', 'Takım bulunamadı.');
  const team = teamSnap.data();
  const value = await computeFutbolTeamValue(teamId);

  let chairman = 'Bot Yönetimi';
  if (team.ownerUid) {
    const ownerSnap = await db.collection('users').doc(team.ownerUid).get();
    chairman = ownerSnap.exists ? ownerSnap.data().displayName || 'İsimsiz Başkan' : 'İsimsiz Başkan';
  }

  return {
    team: {
      id: teamId,
      name: team.name,
      logo: team.logo || null,
      tier: team.tier,
      fans: team.fans || 0,
      value,
      chairman,
      isBot: !team.ownerUid,
    },
  };
});

// listFutbolClubs — bir ligdeki tüm kulüpleri, başkanları (sahibi varsa
// displayName, yoksa "Bot Yönetimi"), güncel piyasa değeri ve taraftar
// sayısıyla döner. Başkan adı için users/{uid} okunuyor — bunu istemci
// YAPAMAZ (firestore.rules sadece kendi dokümanını okumana izin verir),
// bu yüzden Admin SDK ile burada, sunucu tarafında yapılıyor.
export const listFutbolClubs = onCall(async (request) => {
  requireAuth(request);
  const { leagueId } = request.data || {};
  if (!leagueId) throw new HttpsError('invalid-argument', 'leagueId gerekli.');

  const teamsSnap = await db.collection('futbolTeams').where('leagueId', '==', leagueId).get();
  const clubs = await Promise.all(
    teamsSnap.docs.map(async (d) => {
      const team = d.data();
      const value = await computeFutbolTeamValue(d.id);
      let chairman = 'Bot Yönetimi';
      if (team.ownerUid) {
        const ownerSnap = await db.collection('users').doc(team.ownerUid).get();
        chairman = ownerSnap.exists ? ownerSnap.data().displayName || 'İsimsiz Başkan' : 'İsimsiz Başkan';
      }
      return {
        id: d.id,
        name: team.name,
        logo: team.logo || null,
        tier: team.tier,
        fans: team.fans || 0,
        value,
        chairman,
        isBot: !team.ownerUid,
      };
    })
  );
  clubs.sort((a, b) => b.value - a.value);
  return { clubs };
});

// =============================================================================
// TELEFON — "ALTIN MAĞAZASI" (Shopier ile gerçek para karşılığı altın satışı)
// =============================================================================
// Akış:
//   1) İstemci createGoldStoreOrder(packageId) çağırır. Sunucu "pending"
//      bir sipariş dokümanı (goldStoreOrders/{orderId}) açar ve Shopier'in
//      klasik Ödeme Formu API'si (api_pay4.php) için gereken alanları +
//      imzayı üretip istemciye döner. Paket başına satın alma sayısında
//      SINIR YOK — oyuncu istediği kadar alabilir.
//   2) İstemci bu alanlarla GİZLİ bir <form> oluşturup Shopier'e POST eder
//      (bkz. src/components/GoldStoreScreen). Oyuncu tam sayfa Shopier'in
//      güvenli ödeme sayfasına yönlenir, kart bilgilerini ORADA girer —
//      kart bilgisi hiçbir zaman bizim sunucumuzdan/istemcimizden geçmez.
//   3) Ödeme tamamlanınca Shopier, Shopier panelinizde tanımlayacağınız
//      "Otomatik Sipariş Bildirimi / Webhook" adresine (bu dosyadaki
//      shopierGoldStoreWebhook fonksiyonunun URL'i) SUNUCUDAN SUNUCUYA bir
//      POST atar. Biz İMZAYI doğrulamadan asla altın basmıyoruz — istemci
//      tarafındaki yönlendirme sadece kullanıcıya "ödeme tamam" göstermek
//      içindir, gerçek teslim/güven burada, webhook'ta gerçekleşir.
//
// KURULUM (siz yapmanız gereken):
//   - Shopier hesabınızdan (shopier.com/m/login.php) API anahtarınızı alın:
//     Ayarlarım > API Bilgileri. Bunları İSTEMCİYE DEĞİL, sadece Firebase
//     Functions ortamına şu komutlarla tanımlayın (repo'ya asla yazmayın):
//       firebase functions:secrets:set SHOPIER_API_KEY
//       firebase functions:secrets:set SHOPIER_API_SECRET
//   - Deploy sonrası shopierGoldStoreWebhook fonksiyonunun URL'ini
//     (firebase deploy çıktısında görünür, örn.
//     https://europe-west1-PROJENIZ.cloudfunctions.net/shopierGoldStoreWebhook)
//     Shopier panelinde Ek Özellikler > Sipariş Bildirimi / Webhook
//     bölümüne kaydedin. Shopier bu alanı zaman zaman güncelliyor
//     (bkz. developer.shopier.com/reference/webhooks) — panelde gördüğünüz
//     alan adları burada varsaydığımız `platform_order_id/status/signature/
//     random_nr/total_order_value/currency` alanlarından farklıysa,
//     shopierGoldStoreWebhook içindeki alan isimlerini panelinizdeki örnek
//     koda göre güncelleyin.
//   - ÖNEMLİ: Şirketiniz olmadığı için Shopier'de "Bireysel" hesap
//     kullanacaksınız — bu tamamen desteklenen bir seçenek, kurumsal
//     evrak istemiyor, sadece kimlik doğrulaması istiyor.
// ---------------------------------------------------------------------------

const shopierApiKey = defineSecret('SHOPIER_API_KEY');
const shopierApiSecret = defineSecret('SHOPIER_API_SECRET');

// Paket tanımları BİLEREK sadece burada, sunucuda tutuluyor — istemci
// sadece packageId gönderir, fiyat/miktarları asla istemciden almıyoruz
// (aksi halde biri tarayıcı konsolundan "0 TL'ye 1 milyon altın" isteği
// uydurabilirdi).
const GOLD_STORE_PACKAGES = {
  paket1: {
    id: 'paket1',
    name: '20.000 Altın',
    priceTRY: 30,
    gold: 20000,
    items: {},
  },
  paket2: {
    id: 'paket2',
    name: '60.000 Altın + Özel Paket',
    priceTRY: 100,
    gold: 60000,
    items: {
      yasakliMadde: 4,
      tamirMalzemesi: 1000,
      silahUpgrade: 100,
      arabaGelistirme: 20,
    },
  },
};

// Shopier'e gönderilecek toplam tutar formatı: nokta ondalık ayraçlı,
// ondalıksız TL'ler için de "30.00" gibi iki basamak beklenir.
function formatShopierAmount(amountTRY) {
  return Number(amountTRY).toFixed(2);
}

function shopierSignature(secret, randomNr, orderId, totalOrderValue, currency) {
  const data = `${randomNr}${orderId}${totalOrderValue}${currency}`;
  return crypto.createHmac('sha256', secret).update(data).digest('base64');
}

// createGoldStoreOrder — "Altın Mağazası"nda bir paket seçildiğinde
// çağrılır. Ödeme yapılmadan HİÇBİR altın/eşya verilmez; bu fonksiyon
// sadece Shopier ödeme sayfasına gitmek için gereken imzalı form
// alanlarını üretir.
export const createGoldStoreOrder = onCall(
  { secrets: [shopierApiKey, shopierApiSecret] },
  async (request) => {
    const uid = requireAuth(request);
    const { packageId, returnOrigin } = request.data || {};
    const pack = GOLD_STORE_PACKAGES[packageId];
    if (!pack) {
      throw new HttpsError('invalid-argument', 'Geçersiz paket.');
    }
    // returnOrigin — istemcinin kendi origin'i (https://oyununuz.com gibi).
    // Sadece kullanıcıyı ödeme sonrası nereye geri yönlendireceğimizi
    // belirlemek için kullanılır; whitelisting olmadan açık yönlendirme
    // riskine karşı basit bir https şema kontrolü yapıyoruz.
    if (typeof returnOrigin !== 'string' || !/^https:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(returnOrigin)) {
      throw new HttpsError('invalid-argument', 'Geçersiz dönüş adresi.');
    }

    const dateKey = istanbulDateKey();
    const orderRef = db.collection('goldStoreOrders').doc();
    const randomNr = crypto.randomBytes(16).toString('hex');
    const totalOrderValue = formatShopierAmount(pack.priceTRY);
    const currency = 'TL';

    await orderRef.set({
      uid,
      packageId: pack.id,
      priceTRY: pack.priceTRY,
      dateKey,
      status: 'pending',
      randomNr,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const signature = shopierSignature(
      shopierApiSecret.value(),
      randomNr,
      orderRef.id,
      totalOrderValue,
      currency
    );

    const callbackUrl = `${returnOrigin}/?goldOrder=${orderRef.id}`;

    // Shopier'in klasik "Ödeme Formu" API'si (api_pay4.php) — bu alan
    // listesi Shopier panelindeki "API Bilgileri" sayfasında verilen
    // örnek entegrasyon dosyasıyla birebir aynı olmalı. Panelinizdeki
    // örnekte ek/eksik bir alan görürseniz burayı ona göre güncelleyin.
    const fields = {
      API_key: shopierApiKey.value(),
      website_index: '1',
      platform_order_id: orderRef.id,
      product_name: pack.name,
      product_type: '1', // 1 = sanal/dijital ürün
      buyer_name: request.auth.token.name?.split(' ')[0] || 'Oyuncu',
      buyer_surname: request.auth.token.name?.split(' ').slice(1).join(' ') || 'Oyuncu',
      buyer_email: request.auth.token.email || `${uid}@neon-sehir.oyun`,
      buyer_account_age: '0',
      buyer_id_nr: '11111111111',
      buyer_phone: '5555555555',
      billing_address: 'Dijital teslimat - fiziksel adres yok',
      billing_city: 'İstanbul',
      billing_country: 'Turkey',
      billing_postcode: '34000',
      shipping_address: 'Dijital teslimat - fiziksel adres yok',
      shipping_city: 'İstanbul',
      shipping_country: 'Turkey',
      shipping_postcode: '34000',
      total_order_value: totalOrderValue,
      currency,
      platform: '0',
      is_in_frame: '0',
      current_language: '0',
      modul_version: '1.0.4',
      random_nr: randomNr,
      signature,
      callback_url: callbackUrl,
    };

    return {
      orderId: orderRef.id,
      actionUrl: 'https://www.shopier.com/ShowProduct/api_pay4.php',
      fields,
    };
  }
);

// shopierGoldStoreWebhook — Shopier'in ödeme sonucunu bize SUNUCUDAN
// SUNUCUYA bildirdiği uç nokta. Bu URL'i Shopier panelinde tanımlamanız
// gerekiyor (bkz. yukarıdaki KURULUM notu). İmza doğrulanmadan HİÇBİR
// altın/eşya verilmez.
export const shopierGoldStoreWebhook = onRequest(
  { secrets: [shopierApiSecret] },
  async (req, res) => {
    try {
      const body = req.body || {};
      const {
        status,
        platform_order_id: orderId,
        random_nr: randomNr,
        total_order_value: totalOrderValue,
        currency,
        signature,
      } = body;

      if (!orderId || !signature || !randomNr) {
        console.error('shopierGoldStoreWebhook: eksik alan', body);
        res.status(400).send('missing fields');
        return;
      }

      const expectedSignature = shopierSignature(
        shopierApiSecret.value(),
        randomNr,
        orderId,
        totalOrderValue,
        currency
      );
      const providedSignature = Buffer.from(String(signature), 'base64');
      const expectedBuffer = Buffer.from(expectedSignature, 'base64');
      const validSignature =
        providedSignature.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedSignature, expectedBuffer);

      if (!validSignature) {
        console.error('shopierGoldStoreWebhook: geçersiz imza', orderId);
        res.status(400).send('invalid signature');
        return;
      }

      const orderRef = db.collection('goldStoreOrders').doc(orderId);

      if (String(status).toLowerCase() !== 'success') {
        await orderRef.set(
          { status: 'failed', webhookStatus: String(status || '') },
          { merge: true }
        );
        res.status(200).send('OK');
        return;
      }

      await db.runTransaction(async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) {
          throw new Error(`Bilinmeyen sipariş: ${orderId}`);
        }
        const order = orderSnap.data();

        // İdempotentlik: aynı webhook Shopier tarafından tekrar
        // gönderilirse (ağ hatası sonrası retry gibi) iki kez altın
        // basmayalım.
        if (order.status === 'paid') {
          return;
        }
        // Rastgele değer eşleşmiyorsa (biri orderId tahmin edip sahte
        // webhook atmaya çalışıyor olabilir) reddet.
        if (order.randomNr !== randomNr) {
          throw new Error(`random_nr uyuşmuyor: ${orderId}`);
        }

        const pack = GOLD_STORE_PACKAGES[order.packageId];
        if (!pack) {
          throw new Error(`Bilinmeyen paket: ${order.packageId}`);
        }

        const userRef = db.collection('users').doc(order.uid);
        tx.set(userRef, { gold: admin.firestore.FieldValue.increment(pack.gold) }, { merge: true });
        Object.entries(pack.items).forEach(([materialType, qty]) => {
          const inventoryRef = userRef.collection('inventory').doc(materialType);
          tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(qty) }, { merge: true });
        });
        tx.set(
          orderRef,
          {
            status: 'paid',
            webhookStatus: String(status),
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        const msgRef = userRef.collection('messages').doc();
        tx.set(msgRef, {
          from: 'Altın Mağazası',
          text: `${pack.name} satın alımın tamamlandı — hesabına ${pack.gold.toLocaleString('tr-TR')} altın yüklendi.`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      res.status(200).send('OK');
    } catch (err) {
      console.error('shopierGoldStoreWebhook hata:', err);
      // 500 dönersek Shopier'in webhook'u tekrar denemesini sağlarız
      // (geçici bir Firestore hatası olabilir); imza/veri hataları zaten
      // yukarıda 400 ile erken kesiliyor.
      res.status(500).send('error');
    }
  }
);

// =============================================================================
// TELEFON — "SIXTAGRAM" (mini sosyal medya uygulaması)
// =============================================================================
// - Postlar 24 saat sonra otomatik silinir (bkz. cleanupSixtagramPosts);
//   oyuncular kendi postlarını istedikleri an da silebilir (bkz.
//   deleteSixtagramPost).
// - Anasayfa akışı en çok beğeni alan (SÜRESİ DOLMAMIŞ) postları listeler.
// - "Toplam beğeni" HERKESE AÇIK bir dokümanda tutulur
//   (sixtagramProfiles/{uid}.totalLikes) — çünkü users/{uid} sadece
//   sahibi tarafından okunabiliyor (Bölüm 15), ama başka bir oyuncunun
//   postuna tıklayıp profiline bakabilmek için bu sayının HERKESÇE
//   okunabilmesi gerekiyor. Post silinse/süresi dolsa bile bu sayaç
//   ETKİLENMEZ (beğeni geri çekilirse azalır, sadece o).
// - "Hangi postları beğendim" bilgisi sixtagramUserLikes/{uid} (SADECE
//   sahibi okuyabilir) dokümanındaki bir haritada tutulur — bunu bir
//   collectionGroup sorgusuyla DEĞİL, tek bir doküman dinleyerek
//   okuyoruz; böylece ekstra bir Firestore index'ine ihtiyaç kalmıyor ve
//   sekmeler arası geçişte veri kaybolmuyor.
// - Görsel eklerin (avatar/araba/kupon/maç/yatırım/ceza) TÜMÜ istemciden
//   ham veri olarak alınmaz — istemci sadece "hangisini" seçtiğini söyler
//   (örn. hangi vehicleId), gerçek veri burada, sunucuda, oyuncunun kendi
//   kayıtlarından okunup doğrulanarak gömülür. Böylece kimse sahte skor/
//   sahte kupon/başkasının arabasını paylaşamaz.
// ---------------------------------------------------------------------------

const SIXTAGRAM_MAX_TEXT_LEN = 280;
const SIXTAGRAM_POST_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SIXTAGRAM_ASSET_LABELS = { diamond: 'Elmas', stock: 'Hisse Senedi', crypto: 'Kripto' };

// buildSixtagramAttachment — istemcinin seçtiği ek türünü, sunucudaki
// GERÇEK veriden yeniden inşa eder. `attachment` yoksa/null ise null döner
// (sadece yazı paylaşımı da geçerlidir).
async function buildSixtagramAttachment(uid, attachment) {
  if (!attachment || !attachment.type) return null;
  const { type } = attachment;

  if (type === 'avatar') {
    const userSnap = await db.collection('users').doc(uid).get();
    const avatar = userSnap.data()?.avatar || null;
    if (!avatar) {
      throw new HttpsError(
        'failed-precondition',
        'Önce Profil > Avatar Oluştur ile bir avatar oluşturmalısın.'
      );
    }
    return { type: 'avatar', avatar };
  }

  if (type === 'vehicle') {
    const vehicleId = attachment.vehicleId;
    if (!vehicleId) throw new HttpsError('invalid-argument', 'Araç seçilmedi.');
    const vSnap = await db.collection('vehicles').doc(vehicleId).get();
    if (!vSnap.exists || vSnap.data().ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Bu araç sana ait değil.');
    }
    const v = vSnap.data();
    return {
      type: 'vehicle',
      catalogId: v.catalogId,
      model: v.model,
      gearLevel: v.gearLevel,
      gearUpgraded: !!v.gearUpgraded,
      tankUpgraded: !!v.tankUpgraded,
      lifeDays: v.lifeDays ?? null,
    };
  }

  if (type === 'iddaa') {
    const betId = attachment.betId;
    if (!betId) throw new HttpsError('invalid-argument', 'Kupon seçilmedi.');
    const betSnap = await db.collection('futbolBets').doc(betId).get();
    if (!betSnap.exists || betSnap.data().uid !== uid) {
      throw new HttpsError('permission-denied', 'Bu kupon sana ait değil.');
    }
    const bet = betSnap.data();
    const predictionList = bet.predictions || [];

    const [leagueSnap, matchSnaps] = await Promise.all([
      db.collection('futbolLeagues').doc(bet.leagueId).get(),
      Promise.all(predictionList.map((p) => db.collection('futbolMatches').doc(p.matchId).get())),
    ]);

    const matchById = {};
    matchSnaps.forEach((s) => {
      if (s.exists) matchById[s.id] = s.data();
    });
    const teamIds = new Set();
    matchSnaps.forEach((s) => {
      if (s.exists) {
        teamIds.add(s.data().homeTeamId);
        teamIds.add(s.data().awayTeamId);
      }
    });
    const teamSnaps = await Promise.all(
      [...teamIds].map((id) => db.collection('futbolTeams').doc(id).get())
    );
    const teamById = {};
    teamSnaps.forEach((s) => {
      if (s.exists) teamById[s.id] = s.data();
    });

    // predictions — bu kuponun İÇERİĞİ: her maç için ev sahibi/deplasman
    // adı, oyuncunun tahmini VE (maç bittiyse) tuttu mu tutmadı mı.
    const predictions = predictionList.map((p) => {
      const m = matchById[p.matchId] || {};
      const home = teamById[m.homeTeamId] || {};
      const away = teamById[m.awayTeamId] || {};
      let correct = null;
      if (m.status === 'finished' && m.homeScore != null && m.awayScore != null) {
        const actual = m.homeScore === m.awayScore ? 'draw' : m.homeScore > m.awayScore ? 'home' : 'away';
        correct = actual === p.pick;
      }
      return {
        homeName: home.name || '?',
        awayName: away.name || '?',
        pick: p.pick,
        homeScore: m.status === 'finished' ? m.homeScore : null,
        awayScore: m.status === 'finished' ? m.awayScore : null,
        correct,
      };
    });

    return {
      type: 'iddaa',
      leagueName: leagueSnap.exists ? leagueSnap.data().name || null : null,
      round: bet.round,
      stake: bet.stake,
      status: bet.status,
      payout: bet.payout || 0,
      predictions,
    };
  }

  if (type === 'lastMatches') {
    const dateKey = istanbulDateKey();
    const snap = await db
      .collection('newsEvents')
      .where('dateKey', '==', dateKey)
      .where('type', '==', 'football_match')
      .limit(4)
      .get();
    if (snap.empty) {
      throw new HttpsError('failed-precondition', 'Bugün henüz sonuçlanan bir maç yok.');
    }
    const matches = snap.docs.map((d) => {
      const m = d.data();
      return {
        homeName: m.homeName,
        awayName: m.awayName,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeLogo: m.homeLogo || null,
        awayLogo: m.awayLogo || null,
      };
    });
    return { type: 'lastMatches', matches };
  }

  if (type === 'upcomingMatches') {
    const leagueId = attachment.leagueId;
    if (!leagueId) throw new HttpsError('invalid-argument', 'Lig seçilmedi.');
    const leagueSnap = await db.collection('futbolLeagues').doc(leagueId).get();
    if (!leagueSnap.exists) throw new HttpsError('not-found', 'Lig bulunamadı.');
    const league = leagueSnap.data();
    const round = league.currentRound || 1;

    const matchesSnap = await db
      .collection('futbolMatches')
      .where('leagueId', '==', leagueId)
      .where('round', '==', round)
      .where('status', '==', 'scheduled')
      .get();
    if (matchesSnap.empty) {
      throw new HttpsError('failed-precondition', 'Bu ligde şu an bekleyen bir maç yok.');
    }
    const matchDocs = matchesSnap.docs.slice(0, 4);
    const teamIds = new Set();
    matchDocs.forEach((d) => {
      teamIds.add(d.data().homeTeamId);
      teamIds.add(d.data().awayTeamId);
    });
    const teamSnaps = await Promise.all(
      [...teamIds].map((id) => db.collection('futbolTeams').doc(id).get())
    );
    const teamById = {};
    teamSnaps.forEach((s) => {
      if (s.exists) teamById[s.id] = s.data();
    });
    const matches = matchDocs.map((d) => {
      const m = d.data();
      const home = teamById[m.homeTeamId] || {};
      const away = teamById[m.awayTeamId] || {};
      return {
        homeName: home.name || '?',
        awayName: away.name || '?',
        homeLogo: home.logo || null,
        awayLogo: away.logo || null,
      };
    });
    return { type: 'upcomingMatches', leagueName: league.name || null, round, matches };
  }

  if (type === 'investment') {
    const asset = ['diamond', 'stock', 'crypto'].includes(attachment.asset)
      ? attachment.asset
      : 'stock';
    const priceField = INVESTMENT_PRICE_FIELD[asset];
    const [currentSnap, historySnap] = await Promise.all([
      db.collection('investments').doc('current').get(),
      db.collection('investmentHistory').orderBy('createdAt', 'desc').limit(24).get(),
    ]);
    const points = historySnap.docs
      .map((d) => d.data()[priceField])
      .filter((p) => typeof p === 'number')
      .reverse();
    if (!points.length) {
      throw new HttpsError('failed-precondition', 'Henüz yeterli piyasa verisi yok.');
    }
    const current = currentSnap.exists ? currentSnap.data()[priceField] : points[points.length - 1];
    return {
      type: 'investment',
      asset,
      assetLabel: SIXTAGRAM_ASSET_LABELS[asset],
      current,
      points,
    };
  }

  if (type === 'fine') {
    // Bugün VEYA dün yenen ceza — gece yarısına yakın yaşanmış bir
    // yakalanmayı da paylaşabilsin diye 2 günlük pencereye bakıyoruz.
    const dateKey = istanbulDateKey();
    const yesterdayKey = addDaysToDateKey(dateKey, -1);
    const messagesRef = db.collection('users').doc(uid).collection('messages');
    const [todaySnap, yesterdaySnap] = await Promise.all([
      messagesRef.where('type', '==', 'capture_penalty').where('dateKey', '==', dateKey).get(),
      messagesRef.where('type', '==', 'capture_penalty').where('dateKey', '==', yesterdayKey).get(),
    ]);
    const allDocs = [...todaySnap.docs, ...yesterdaySnap.docs];
    if (!allDocs.length) {
      throw new HttpsError(
        'failed-precondition',
        'Son 2 gündür bir ceza yemedin (iyi haber!).'
      );
    }
    const totalAmount = allDocs.reduce((sum, d) => sum + (d.data().penaltyAmount || 0), 0);
    return { type: 'fine', totalAmount, count: allDocs.length };
  }

  throw new HttpsError('invalid-argument', 'Geçersiz ek türü.');
}

// createSixtagramPost — yeni bir gönderi paylaşır. `text` ve/veya
// `attachment` verilebilir, ikisi de boşsa reddedilir.
export const createSixtagramPost = onCall(async (request) => {
  const uid = requireAuth(request);
  const { text, attachment } = request.data || {};
  const cleanText = typeof text === 'string' ? text.trim().slice(0, SIXTAGRAM_MAX_TEXT_LEN) : '';

  const builtAttachment = await buildSixtagramAttachment(uid, attachment);
  if (!cleanText && !builtAttachment) {
    throw new HttpsError(
      'invalid-argument',
      'Boş gönderi paylaşamazsın — bir şeyler yaz ya da bir ek ekle.'
    );
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() || {};
  const nowMs = Date.now();

  const postRef = db.collection('sixtagramPosts').doc();
  const profileRef = db.collection('sixtagramProfiles').doc(uid);
  const batch = db.batch();
  batch.set(postRef, {
    uid,
    authorName: user.displayName || 'Oyuncu',
    authorAvatar: user.avatar || null,
    text: cleanText,
    attachment: builtAttachment,
    likeCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + SIXTAGRAM_POST_LIFETIME_MS,
  });
  // sixtagramProfiles — herkese açık profil özeti (isim/avatar); bir
  // başkasının postuna tıklayınca açılan panel buradan okur. totalLikes
  // alanına BURADA dokunmuyoruz (merge onu olduğu gibi bırakır).
  batch.set(
    profileRef,
    {
      displayName: user.displayName || 'Oyuncu',
      avatar: user.avatar || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();

  return { ok: true, postId: postRef.id };
});

// toggleSixtagramLike — beğen/beğeniyi geri çek. Kendi postunu da
// beğenebilir (kısıtlama yok), istemci isterse UI'da engelleyebilir.
export const toggleSixtagramLike = onCall(async (request) => {
  const uid = requireAuth(request);
  const { postId } = request.data || {};
  if (!postId) throw new HttpsError('invalid-argument', 'postId gerekli.');

  const postRef = db.collection('sixtagramPosts').doc(postId);
  const likeRef = postRef.collection('likes').doc(uid);
  const myLikesRef = db.collection('sixtagramUserLikes').doc(uid);

  let liked = false;
  await db.runTransaction(async (tx) => {
    const [postSnap, likeSnap] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
    if (!postSnap.exists) {
      throw new HttpsError('not-found', 'Gönderi bulunamadı (süresi dolup silinmiş olabilir).');
    }
    const post = postSnap.data();
    const profileRef = db.collection('sixtagramProfiles').doc(post.uid);

    if (likeSnap.exists) {
      tx.delete(likeRef);
      tx.update(postRef, { likeCount: admin.firestore.FieldValue.increment(-1) });
      tx.set(profileRef, { totalLikes: admin.firestore.FieldValue.increment(-1) }, { merge: true });
      tx.set(
        myLikesRef,
        { postIds: { [postId]: admin.firestore.FieldValue.delete() } },
        { merge: true }
      );
      liked = false;
    } else {
      tx.set(likeRef, { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.update(postRef, { likeCount: admin.firestore.FieldValue.increment(1) });
      tx.set(profileRef, { totalLikes: admin.firestore.FieldValue.increment(1) }, { merge: true });
      tx.set(myLikesRef, { postIds: { [postId]: true } }, { merge: true });
      liked = true;
    }
  });

  return { ok: true, liked };
});

// deleteSixtagramPostAndLikes — bir postu VE onun beğeni alt
// koleksiyonunu (+ beğenen herkesin sixtagramUserLikes haritasındaki
// ilgili girdisini) siler. Hem deleteSixtagramPost (oyuncu isteğiyle)
// hem cleanupSixtagramPosts (24 saat dolunca) tarafından kullanılır.
async function deleteSixtagramPostAndLikes(postRef) {
  const likesSnap = await postRef.collection('likes').limit(500).get();
  if (!likesSnap.empty) {
    const batch = db.batch();
    likesSnap.forEach((l) => {
      batch.delete(l.ref);
      batch.set(
        db.collection('sixtagramUserLikes').doc(l.id),
        { postIds: { [postRef.id]: admin.firestore.FieldValue.delete() } },
        { merge: true }
      );
    });
    await batch.commit();
  }
  await postRef.delete();
}

// deleteSixtagramPost — oyuncu kendi gönderisini istediği an silebilir.
// totalLikes sayacı BİLEREK azaltılmıyor (24 saatlik otomatik silinmeyle
// aynı davranış — kazanılan beğeni kalıcı bir başarı gibi kalır).
export const deleteSixtagramPost = onCall(async (request) => {
  const uid = requireAuth(request);
  const { postId } = request.data || {};
  if (!postId) throw new HttpsError('invalid-argument', 'postId gerekli.');

  const postRef = db.collection('sixtagramPosts').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return { ok: true };
  if (postSnap.data().uid !== uid) {
    throw new HttpsError('permission-denied', 'Bu gönderi sana ait değil.');
  }
  await deleteSixtagramPostAndLikes(postRef);
  return { ok: true };
});

// cleanupSixtagramPosts — süresi (24 saat) dolan postları temizler.
// Saatte bir çalışır, her seferinde en fazla 100 post (büyük birikme
// olursa bir sonraki saatte devam eder).
export const cleanupSixtagramPosts = onSchedule(
  { schedule: 'every 1 hours', timeZone: 'Europe/Istanbul' },
  async () => {
    const cutoffMs = Date.now();
    const expiredSnap = await db
      .collection('sixtagramPosts')
      .where('expiresAtMs', '<', cutoffMs)
      .limit(100)
      .get();

    for (const postDoc of expiredSnap.docs) {
      await deleteSixtagramPostAndLikes(postDoc.ref);
    }
  }
);

