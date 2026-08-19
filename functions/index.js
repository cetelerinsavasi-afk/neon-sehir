import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import admin from 'firebase-admin';
import crypto from 'crypto';
import Busboy from 'busboy';
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
// rastgele (min-max arası) ürün eklenir.
//
// Fabrika sahibi tarafında TEK bir "Makineleri Çalıştır" butonu var
// (runFactoryMachines): buna bastığında HEM sahip olduğu tüm mining
// makineleri (kaç tane olursa olsun) AYNI ANDA tetiklenir (miningTriggeredDateKey,
// tetiklenen üretim o gece 00:00'da tamamlanır ve kripto bakiyesine eklenir
// — davranış triggerAllMining ile birebir aynı, bkz. stampUntriggeredMining),
// HEM DE bugün henüz bir işçi tarafından ÜRETİLMEMİŞ (lastProducedDateKey
// bugün değil) diğer 4 makine türü "sahip devreye girdi" olarak damgalanır
// (ownerTriggeredDateKey = bugün). Bu damga ANINDA üretim yapmaz — o gece
// 00:00'da (dailyReset) eğer o gün İÇİNDE atanmış işçi normal "Üretim
// Yap" (produceAtFactory) akışıyla GERÇEKTEN üretim yapmadıysa, sahibi o
// makineyi KENDİSİ üretmiş sayılır ve normal miktarın SADECE 1/10'u kadar
// ürün kendi envanterine eklenir (maaş ödemesi yok). İşçi o gün fiilen
// üretim yaparsa (lastProducedDateKey bugüne eşitlenir) işçinin GERÇEK
// üretimi ÖNCELİKLİDİR ve sahip-yerine-üretim atlanır — bkz. dailyReset
// içindeki ilgili blok.
// ---------------------------------------------------------------------------
const FACTORY_CREATE_COST = 100000;
const FACTORY_MIN_SALARY = 1000;
const FACTORY_MAX_SALARY = 5000;
// Mining hariç tüm makine türleri sabit fiyatlı; mining'in fiyatı canlı
// kripto fiyatına bağlı (2 kripto değerinde) — bkz. miningMachinePrice().
const MACHINE_TYPES = {
  mining: { label: 'Mining Makinesi', needsWorker: false, min: 0.01, max: 0.1, unit: 'crypto' },
  tamirMalzemesi: { label: 'Tamir Malzemesi Makinesi', needsWorker: true, price: 100000, min: 1, max: 3000 },
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

// miningMachinePrice — mining makinesinin fiyatı canlı kripto fiyatına
// bağlı VE oyuncunun elindeki mining makinesi sayısına göre kademeli
// artıyor. DÜZELTME (kullanıcı revizesi, madde 2): eskiden her 100
// makinede +2x artıyordu (0-99:2x, 100-199:4x, ...) — artık çok daha
// kademeli/yumuşak: her 10 makinede +0.2x (0-9:2.0x, 10-19:2.2x,
// 20-29:2.4x, ...). 100'ün katlarında (100, 200, ...) İKİ FORMÜL DE AYNI
// sonucu verir (100'de 4x, 200'de 6x, ...), aradaki basamaklar artık çok
// daha kademeli. Böylece devasa mining çiftlikleri kurmak gitgide
// pahalanır. `ownedCount` — bu satın alımdan ÖNCE sahip olunan mining
// makinesi sayısı (bir sonraki makinenin fiyatını belirler).
async function miningMachinePrice(ownedCount) {
  const prices = await getCurrentPrices();
  const multiplier = 2 + 0.2 * Math.floor((ownedCount || 0) / 10);
  return Math.ceil(multiplier * (prices.cryptoPrice || 0));
}

// miningFleetValue — bir fabrikadaki TÜM mining makinelerinin GÜNCEL
// (canlı kripto fiyatına göre) toplam değeri. Kademeli fiyatlandırma
// yüzünden (bkz. miningMachinePrice) N. makinenin fiyatı, o an sahip
// olunan makine sayısına göre değişir — bu yüzden basitçe N × (şu anki
// tekil fiyat) YANLIŞ olur (birden fazla 100'lük dilime yayılan filoları
// yanlış değerlendirir). Doğrusu: 0..N-1 arasındaki her makinenin KENDİ
// diliminin fiyatını toplamak. Aynı dilimdeki tüm makinelerin fiyatı
// birbirine eşit olduğundan, tam dilimler kapalı-formülle (100 × dilim
// fiyatı), yarım kalan son dilim de tek çarpımla hesaplanır — büyük N
// için bile döngü sadece dilim sayısı (N/100) kadar çalışır.
// DÜZELTME (madde 2): dilim boyutu 100 → 10, dilim başı artış 2x → 0.2x
// (bkz. miningMachinePrice'taki AYNI değişiklik) — formül birebir aynı
// mantıkla, sadece yeni kademelerle.
function miningFleetValue(count, cryptoPrice) {
  const n = count || 0;
  const price = cryptoPrice || 0;
  if (n <= 0) return 0;
  const TIER_SIZE = 10;
  const TIER_STEP = 0.2;
  const fullTiers = Math.floor(n / TIER_SIZE);
  const remainder = n % TIER_SIZE;
  let total = 0;
  for (let tier = 0; tier < fullTiers; tier++) {
    const unitPrice = Math.ceil((2 + TIER_STEP * tier) * price);
    total += TIER_SIZE * unitPrice;
  }
  if (remainder > 0) {
    const unitPrice = Math.ceil((2 + TIER_STEP * fullTiers) * price);
    total += remainder * unitPrice;
  }
  return total;
}

// computeFactoryValue — bir fabrikanın GÜNCEL (canlı kripto fiyatına göre
// yeniden hesaplanan) parasal değeri: 100.000 altınlık kuruluş ücreti +
// sabit fiyatlı makinelerin (tamirMalzemesi/silahUpgrade/arabaGelistirme/
// yasakliMadde) toplam fiyatı + mining makinelerinin kademeli filo değeri
// (bkz. miningFleetValue). `machinesByType` — { [makineTürü]: adet }.
// NOT: Bu değer sadece bilgi amaçlıdır (Fabrikalar sekmesinde gösterilir);
// hiçbir para transferi/işlem bu sayıya dayanmaz, bu yüzden istemci
// tarafında da (aynı formülle) hesaplanır — bkz. src/components/FactoryScreen.
function computeFactoryValue(machinesByType, cryptoPrice) {
  let value = FACTORY_CREATE_COST;
  for (const type of VALID_MACHINES) {
    const count = machinesByType[type] || 0;
    if (type === 'mining') {
      value += miningFleetValue(count, cryptoPrice);
    } else {
      value += count * (MACHINE_TYPES[type].price || 0);
    }
  }
  return value;
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

// getFactoryValue — bir fabrikanın GÜNCEL parasal değerini sunucu
// tarafında (Admin SDK ile, canlı kripto fiyatı üzerinden) hesaplar ve
// döner — bkz. computeFactoryValue. Şu an istemci (Fabrikalar sekmesi)
// bu değeri ZATEN elindeki verilerle (useOpenFactories + useInvestmentPrices,
// her ikisi de gerçek zamanlı) aynı formülle client-side hesaplıyor —
// büyük fabrika listesini gösterirken her kart için ayrı bir Cloud
// Function çağrısı yapmak hem gecikmeli hem de gereksiz olurdu ve canlı
// (onSnapshot) güncellemeleri kaybettirirdi. Bu callable, aynı formülün
// sunucu tarafındaki GÜVENİLİR kaynağı olarak duruyor — ileride para
// hareketine bağlanacak bir özellik (ör. fabrika hisseleri) bu değere
// GÜVENMESİ gerektiğinde doğrudan burası kullanılabilir.
export const getFactoryValue = onCall(async (request) => {
  requireAuth(request);
  const { factoryId } = request.data || {};
  if (!factoryId) throw new HttpsError('invalid-argument', 'factoryId gerekli.');

  const factorySnap = await db.collection('factories').doc(factoryId).get();
  if (!factorySnap.exists) throw new HttpsError('not-found', 'Fabrika bulunamadı.');

  const [machinesSnap, prices] = await Promise.all([
    db.collection('factories').doc(factoryId).collection('machines').get(),
    getCurrentPrices(),
  ]);
  const machinesByType = {};
  machinesSnap.forEach((d) => {
    const type = d.data().type;
    machinesByType[type] = (machinesByType[type] || 0) + 1;
  });

  return { value: computeFactoryValue(machinesByType, prices.cryptoPrice || 0) };
});

// buyFactoryMachine — sadece fabrika sahibi, istediği kadar makine alabilir.
export const buyFactoryMachine = onCall(async (request) => {
  const uid = requireAuth(request);
  const { machineType } = request.data || {};
  if (!VALID_MACHINES.includes(machineType)) {
    throw new HttpsError('invalid-argument', 'Geçersiz makine türü.');
  }

  const userRef = db.collection('users').doc(uid);
  const factoryRef = db.collection('factories').doc(uid);
  const machinesRef = factoryRef.collection('machines');
  const machineRef = machinesRef.doc();

  // Mining makinesinin fiyatı sahip olunan makine sayısına bağlı olduğu
  // için (bkz. miningMachinePrice), fiyatı transaction DIŞINDA sabit bir
  // değişkende önceden hesaplayamıyoruz — art arda hızlı satın alımlarda
  // yanlış (bayat) sayıya göre hesaplanmış ucuz bir fiyat kullanılmasın
  // diye sayım da transaction İÇİNDE yapılıyor.
  let price = null;
  await db.runTransaction(async (tx) => {
    const [userSnap, factorySnap, miningCountSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(factoryRef),
      machineType === 'mining' ? tx.get(machinesRef.where('type', '==', 'mining')) : null,
    ]);
    if (!factorySnap.exists) {
      throw new HttpsError('failed-precondition', 'Önce bir fabrika kurmalısın.');
    }
    if (machineType === 'mining') {
      price = await miningMachinePrice(miningCountSnap.size);
    } else {
      price = MACHINE_TYPES[machineType].price;
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

// setFactoryName — sadece fabrika sahibi, fabrikasına özel bir isim
// verebilir. Boş bırakılırsa (client tarafında) UI "{ownerName}'in
// Fabrikası" varsayılanına düşer — sunucu tarafında yine de 1-24 karakter
// arası, boş olmayan bir metin zorunlu tutulur (alan hiç ayarlanmamışsa
// Firestore dokümanında `name` alanı yok demektir, bu da fallback'i tetikler).
const FACTORY_NAME_MAX_LEN = 22;
export const setFactoryName = onCall(async (request) => {
  const uid = requireAuth(request);
  const name = String(request.data?.name || '').trim();
  if (name.length < 1 || name.length > FACTORY_NAME_MAX_LEN) {
    throw new HttpsError(
      'invalid-argument',
      `Fabrika adı 1-${FACTORY_NAME_MAX_LEN} karakter arasında olmalı.`
    );
  }
  const factoryRef = db.collection('factories').doc(uid);
  const factorySnap = await factoryRef.get();
  if (!factorySnap.exists) {
    throw new HttpsError('failed-precondition', 'Bir fabrikan yok.');
  }
  await factoryRef.update({ name });
  return { ok: true };
});

// --- Fabrika logosu (kullanıcının gönderdiği tasarımcı örneğinden
// uyarlanmış, sadeleştirilmiş sürüm — bkz. FutbolCrest/FutbolLogoEditor
// için kullanılan aynı desen: şekil + ikon (lucide-react, zaten
// package.json'da mevcut) + renk paleti. `src/components/FactoryScreen/
// FactoryBadge.jsx` bu config'i SVG'ye çeviriyor, `FactoryLogoDesigner.jsx`
// ise interaktif editör. Sunucu tarafında şekil/ikon SABİT bir allowlist'e,
// renkler ise hex formatına karşı doğrulanıyor — istemciden gelen serbest
// metin/renk asla doğrudan güvenilmiyor. ---
const FACTORY_LOGO_SHAPES = ['hexagon', 'circle', 'shield', 'square', 'diamond'];
const FACTORY_LOGO_ICONS = [
  'factory', 'cog', 'settings', 'hammer', 'wrench', 'flame', 'zap', 'package',
  'truck', 'warehouse', 'cpu', 'boxes', 'container', 'gauge', 'layers',
  'recycle', 'shield', 'anchor', 'beaker', 'leaf',
];

// setFactoryLogo — sadece fabrika sahibi. `logo` alanı tek bir nested
// obje olarak factories/{uid}.logo altında saklanır.
export const setFactoryLogo = onCall(async (request) => {
  const uid = requireAuth(request);
  const { shape, icon, bg, metal, trim, hazard, rivets } = request.data?.logo || {};

  if (!FACTORY_LOGO_SHAPES.includes(shape)) {
    throw new HttpsError('invalid-argument', 'Geçersiz şekil seçimi.');
  }
  if (!FACTORY_LOGO_ICONS.includes(icon)) {
    throw new HttpsError('invalid-argument', 'Geçersiz ikon seçimi.');
  }
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  if (!hexRe.test(bg) || !hexRe.test(metal) || !hexRe.test(trim)) {
    throw new HttpsError('invalid-argument', 'Geçersiz renk.');
  }

  const factoryRef = db.collection('factories').doc(uid);
  const factorySnap = await factoryRef.get();
  if (!factorySnap.exists) {
    throw new HttpsError('failed-precondition', 'Bir fabrikan yok.');
  }
  await factoryRef.update({
    logo: {
      shape,
      icon,
      bg,
      metal,
      trim,
      hazard: !!hazard,
      rivets: !!rivets,
    },
  });
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

// ---------------------------------------------------------------------------
// FABRİKA HİSSE (STOK) PİYASASI — bir fabrika sahibi, fabrikasının %1-100'ü
// arasında bir dilimini, SABİT bir süre için (10 veya 20 gün) başka bir
// oyuncuya satabilir. Alıcı hisseyi satın aldığı anda TEK SEFERLİK bir
// bedel (price) öder (bkz. buyFactoryShare); bundan sonra her gece
// (dailyReset, Part B) fabrikanın o geceki dailyIncome'undan (Part A —
// bkz. dailyReset içindeki "FABRİKA GÜNLÜK GELİR HESABI" bloğu) payına
// düşeni (percent%) TEMETTÜ olarak alır. Fiyat sınırları, "adil değerin"
// (fairValue) yarısı ile tamamı arasındadır:
//   fairValue = (percent / 100) * dailyIncomeAtListing * days
//   maxPrice = round(fairValue), minPrice = floor(fairValue / 2)
// factories/{ownerId}/shares/{shareId} — bkz. dosya başındaki şema notu.
// ---------------------------------------------------------------------------
const SHARE_VALID_DAYS = [10, 20];

function shareFairValue(percent, days, dailyIncome) {
  return (percent / 100) * (dailyIncome || 0) * days;
}
function shareMaxPrice(percent, days, dailyIncome) {
  return Math.round(shareFairValue(percent, days, dailyIncome));
}
function shareMinPrice(percent, days, dailyIncome) {
  return Math.floor(shareFairValue(percent, days, dailyIncome) / 2);
}

// listFactoryShare — sadece fabrika sahibi. percent (1-100 tam sayı) +
// days (10 veya 20) + price (min/maxPrice aralığında) belirtir, yeni bir
// 'listed' hisse ilanı oluşturur. Fabrikanın zaten listed/active toplam
// yüzdesi + yeni percent 100'ü aşamaz (bir fabrikanın en fazla %100'ü
// satılabilir).
export const listFactoryShare = onCall(async (request) => {
  const uid = requireAuth(request);
  const percent = Number(request.data?.percent);
  const days = Number(request.data?.days);
  const price = Number(request.data?.price);

  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new HttpsError('invalid-argument', 'Yüzde 1-100 arasında tam sayı olmalı.');
  }
  if (!SHARE_VALID_DAYS.includes(days)) {
    throw new HttpsError('invalid-argument', 'Süre sadece 10 veya 20 gün olabilir.');
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz fiyat.');
  }

  const factoryRef = db.collection('factories').doc(uid);
  const factorySnap = await factoryRef.get();
  if (!factorySnap.exists) {
    throw new HttpsError('failed-precondition', 'Bir fabrikan yok.');
  }
  const factory = factorySnap.data();
  const dailyIncome = factory.dailyIncome || 0;

  const minPrice = shareMinPrice(percent, days, dailyIncome);
  const maxPrice = shareMaxPrice(percent, days, dailyIncome);
  if (price < minPrice || price > maxPrice) {
    throw new HttpsError(
      'invalid-argument',
      `Fiyat ${minPrice.toLocaleString('tr-TR')} - ${maxPrice.toLocaleString('tr-TR')} altın arasında olmalı.`
    );
  }

  const sharesRef = factoryRef.collection('shares');
  const existingSnap = await sharesRef.where('status', 'in', ['listed', 'active']).get();
  const existingTotal = existingSnap.docs.reduce((sum, d) => sum + (d.data().percent || 0), 0);
  if (existingTotal + percent > 100) {
    throw new HttpsError(
      'failed-precondition',
      `Fabrikanın en fazla %100'ü satılabilir. Şu an %${existingTotal} zaten listede/satılmış — en fazla %${100 - existingTotal} daha ekleyebilirsin.`
    );
  }

  const shareRef = sharesRef.doc();
  await shareRef.set({
    percent,
    days,
    price,
    status: 'listed',
    dailyIncomeAtListing: dailyIncome,
    sellerId: uid,
    sellerName: factory.ownerName || 'Oyuncu',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    buyerId: null,
    buyerName: null,
    boughtAt: null,
    totalDays: null,
    remainingDays: null,
    lastPayoutDateKey: null,
  });

  return { ok: true, shareId: shareRef.id, minPrice, maxPrice };
});

// cancelFactoryShareListing — sadece fabrika sahibi, sadece henüz
// SATILMAMIŞ ('listed') bir ilanı kaldırabilir — satılmış (active) bir
// hisse tek taraflı iptal edilemez.
export const cancelFactoryShareListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { shareId } = request.data || {};
  if (!shareId) throw new HttpsError('invalid-argument', 'shareId gerekli.');

  const shareRef = db.collection('factories').doc(uid).collection('shares').doc(shareId);
  const shareSnap = await shareRef.get();
  if (!shareSnap.exists) {
    throw new HttpsError('failed-precondition', 'Hisse ilanı bulunamadı.');
  }
  if (shareSnap.data().status !== 'listed') {
    throw new HttpsError('failed-precondition', 'Bu ilan zaten satılmış, kaldırılamaz.');
  }
  // Doküman silinir — böylece yüzdesi ANINDA listFactoryShare'in %100
  // tavan kontrolünden düşer, ekstra bir "iptal edildi" durumu tutmaya
  // gerek kalmaz.
  await shareRef.delete();
  return { ok: true };
});

// buyFactoryShare — fabrika sahibi HARİÇ herkes satın alabilir. Tek
// seferlik `price` altın satıcıya (fabrika sahibine) ödenir — bu, her
// gece (dailyReset) ödenecek temettülerden AYRI, geri ödenmez bir peşin
// bedeldir (temettü fabrika sahibinin GÜNLÜK bakiyesinden gelir, bu
// peşin bedelden DEĞİL).
export const buyFactoryShare = onCall(async (request) => {
  const uid = requireAuth(request);
  const { factoryId, shareId } = request.data || {};
  if (!factoryId || !shareId) {
    throw new HttpsError('invalid-argument', 'factoryId ve shareId gerekli.');
  }
  if (factoryId === uid) {
    throw new HttpsError('failed-precondition', 'Kendi fabrikanın hissesini alamazsın.');
  }

  const shareRef = db.collection('factories').doc(factoryId).collection('shares').doc(shareId);
  const buyerRef = db.collection('users').doc(uid);
  const sellerRef = db.collection('users').doc(factoryId);

  let result = {};
  await db.runTransaction(async (tx) => {
    const [shareSnap, buyerSnap, sellerSnap] = await Promise.all([
      tx.get(shareRef),
      tx.get(buyerRef),
      tx.get(sellerRef),
    ]);
    if (!shareSnap.exists) {
      throw new HttpsError('failed-precondition', 'Hisse ilanı bulunamadı.');
    }
    const share = shareSnap.data();
    if (share.status !== 'listed') {
      throw new HttpsError('failed-precondition', 'Bu hisse artık satışta değil.');
    }
    const buyer = buyerSnap.data();
    if (!buyer || (buyer.gold || 0) < share.price) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    if (!sellerSnap.exists) {
      throw new HttpsError('failed-precondition', 'Satıcı bulunamadı.');
    }

    // Alıcıdan peşin bedel düşülür.
    tx.update(buyerRef, { gold: admin.firestore.FieldValue.increment(-share.price) });
    // Satıcıya (fabrika sahibi) gelir — 2. el eşya satışıyla (buyListing)
    // BİREBİR AYNI şekilde, borç varsa Bölüm 10 kuralına göre bölüştürülür.
    const { goldDelta, debtDelta } = splitIncomeForDebt(sellerSnap.data()?.debtToState, share.price);
    tx.update(sellerRef, {
      gold: admin.firestore.FieldValue.increment(goldDelta),
      debtToState: admin.firestore.FieldValue.increment(debtDelta),
    });

    tx.update(shareRef, {
      status: 'active',
      buyerId: uid,
      buyerName: buyer.displayName || 'Oyuncu',
      boughtAt: admin.firestore.FieldValue.serverTimestamp(),
      totalDays: share.days,
      remainingDays: share.days,
      lastPayoutDateKey: null,
    });

    result = {
      price: share.price,
      percent: share.percent,
      days: share.days,
      sellerName: share.sellerName,
    };
  });

  await Promise.all([
    buyerRef.collection('messages').add({
      text: `${result.sellerName || 'Bir fabrika sahibi'}nin fabrikasından %${result.percent} hisse satın aldın (${result.price.toLocaleString('tr-TR')} altın ödedin). Önümüzdeki ${result.days} gün boyunca fabrikanın günlük gelirinden payına düşen temettüyü alacaksın.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'share_bought',
    }),
    sellerRef.collection('messages').add({
      text: `Fabrikandaki %${result.percent}'lik hisse ilanın satıldı — ${result.price.toLocaleString('tr-TR')} altın hesabına yatırıldı. Alıcı, önümüzdeki ${result.days} gün boyunca fabrikanın günlük gelirinden pay alacak.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'share_sold',
    }),
  ]);

  return { ok: true, ...result };
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

// sendElectricityBillSms — fabrikadaki bugün çalışan makinelerin türüne
// göre değişen (bkz. ELECTRICITY_BILL_PER_MACHINE_TYPE) toplam elektrik
// faturası, her gece 00:00'da SMS ile bildirilir; oyuncunun elinde altın
// varsa otomatik ödenir, yetmezse fark borca yazılır. Ödenebilen kısım
// anında düşülür, yetmeyen kısım (varsa) sendSalaryPenaltySms ile AYNI
// desende debtToState'e yazılır — bkz. dailyReset'teki elektrik faturası
// bloğu.
async function sendElectricityBillSms(uid, bill, shortfall, newTotalDebt) {
  const text =
    shortfall > 0
      ? `Fabrikandaki makineler için ${bill.toLocaleString('tr-TR')} altın elektrik faturası kesildi. Altının yetmediği için ${shortfall.toLocaleString('tr-TR')} altın devlete borç yazıldı. Toplam borcun: ${newTotalDebt.toLocaleString('tr-TR')} altın.`
      : `Fabrikandaki makineler için ${bill.toLocaleString('tr-TR')} altın elektrik faturası kesildi ve otomatik ödendi.`;
  await db.collection('users').doc(uid).collection('messages').add({
    text,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    type: 'factory_electricity_bill',
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
      machine.type === 'yasakliMadde' || machine.type === 'silahUpgrade' || machine.type === 'tamirMalzemesi'
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
      // factories/{ownerId}.salaryPaidToday — yeni istek: "hisse satışı
      // için günlük kazanç hesaplamasında işçiye verilen maaş düşülecek,
      // kâr eksi bile olabilir". Bu alan (ownerRef'ten AYRI, fabrika
      // belgesinde) gün içinde BİRİKTİRİLİR (tam maaş tutarı — ownerPay
      // değil, çünkü altın yetmese bile borca yazılan kısım da patrona
      // gerçek bir maliyettir) ve gece dailyReset Part A'da o günün brüt
      // üretim değerinden düşülüp sıfırlanır (bkz. dailyReset).
      // set+merge (update DEĞİL) — factorySnap.exists garanti değil (üstteki
      // salary okuması da aynı şekilde defansif), doküman yoksa update()
      // hata fırlatırdı.
      tx.set(factoryRef, { salaryPaidToday: admin.firestore.FieldValue.increment(salary) }, { merge: true });
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

// stampUntriggeredMining — bir fabrika sahibinin sahip olduğu, bugün henüz
// tetiklenmemiş TÜM mining makinelerine miningTriggeredDateKey damgası
// vurur (üretim yine o gece 00:00'da dailyReset içinde gerçekleşir).
// triggerAllMining VE runFactoryMachines tarafından ORTAK kullanılır ki
// damgalama mantığı iki yerde tekrar edilmesin.
async function stampUntriggeredMining(ownerUid, dateKey) {
  const machinesRef = db.collection('factories').doc(ownerUid).collection('machines');
  const machinesSnap = await machinesRef.where('type', '==', 'mining').get();
  const untriggered = machinesSnap.docs.filter((m) => m.data().miningTriggeredDateKey !== dateKey);
  if (untriggered.length > 0) {
    const batch = db.batch();
    untriggered.forEach((m) => batch.update(m.ref, { miningTriggeredDateKey: dateKey }));
    await batch.commit();
  }
  return { triggeredCount: untriggered.length, totalCount: machinesSnap.size };
}

// triggerAllMining — mining makineleri işçi gerektirmez ama artık OTOMATİK
// üretmiyor (kullanıcı revizesi): sahibi her gün bu fonksiyonu çağırıp
// o günkü üretimi TETİKLEMELİ. Tetiklenen makineler, o günün 00:00'ında
// (bir sonraki dailyReset'te) rastgele bir miktar kripto üretir ve
// sahibine TEK bir SMS gider — bkz. dailyReset içindeki mining bloğu.
// NOT: Arayüzde artık kendi başına bir buton yok — bu fonksiyon, birleşik
// "Makineleri Çalıştır" butonunun çağırdığı runFactoryMachines içinden de
// (stampUntriggeredMining üzerinden) AYNI mantıkla tetiklenir; bu
// callable fonksiyon geriye dönük uyumluluk/ayrı kullanım için duruyor.
export const triggerAllMining = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const result = await stampUntriggeredMining(uid, dateKey);
  if (result.totalCount === 0) {
    throw new HttpsError('failed-precondition', 'Hiç mining makinen yok.');
  }
  if (result.triggeredCount === 0) {
    throw new HttpsError('failed-precondition', 'Bugün zaten tüm mining makinelerini tetikledin.');
  }

  return { ok: true, ...result };
});

// runFactoryMachines — "Makineleri Çalıştır" butonu (sadece fabrika
// sahibi, günde 1 kez). Fabrikanın TÜM makinelerini tek seferde çalıştırır:
//  - mining makineleri: stampUntriggeredMining ile triggerAllMining ile
//    BİREBİR AYNI şekilde damgalanır (davranışta hiçbir değişiklik yok).
//  - diğer 4 (işçi gerektiren) tür: bugün henüz bir işçi tarafından
//    ÜRETİLMEMİŞ (lastProducedDateKey !== bugün) her makineye
//    ownerTriggeredDateKey = bugün damgası vurulur. Bu ANINDA üretim/ödeme
//    yapmaz — sadece "sahip devreye girdi" işaretidir. Gerçek üretim
//    (işçi o gün gelip gelmediğine göre) o gece 00:00'da dailyReset
//    içinde belirlenir (bkz. dailyReset'teki sahip-yerine-üretim bloğu).
export const runFactoryMachines = onCall(async (request) => {
  const uid = requireAuth(request);
  const dateKey = istanbulDateKey();
  const factoryRef = db.collection('factories').doc(uid);
  const factorySnap = await factoryRef.get();
  if (!factorySnap.exists) {
    throw new HttpsError('failed-precondition', 'Fabrikan yok.');
  }

  const machinesSnap = await factoryRef.collection('machines').get();
  if (machinesSnap.empty) {
    throw new HttpsError('failed-precondition', 'Hiç makinen yok.');
  }

  const workerMachines = machinesSnap.docs.filter((m) => m.data().type !== 'mining');
  const untriggeredWorkerMachines = workerMachines.filter(
    (m) => m.data().lastProducedDateKey !== dateKey && m.data().ownerTriggeredDateKey !== dateKey
  );

  const mining = await stampUntriggeredMining(uid, dateKey);

  let workerTriggeredCount = 0;
  if (untriggeredWorkerMachines.length > 0) {
    const batch = db.batch();
    untriggeredWorkerMachines.forEach((m) => batch.update(m.ref, { ownerTriggeredDateKey: dateKey }));
    await batch.commit();
    workerTriggeredCount = untriggeredWorkerMachines.length;
  }

  if (mining.triggeredCount === 0 && workerTriggeredCount === 0) {
    throw new HttpsError('failed-precondition', 'Bugün zaten tüm makineleri çalıştırdın.');
  }

  return {
    ok: true,
    miningTriggeredCount: mining.triggeredCount,
    miningTotalCount: mining.totalCount,
    workerTriggeredCount,
    workerTotalCount: workerMachines.length,
  };
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

// resolveStuckLotteryAndChampionship — dailyReset'in piyango (Bölüm 9) ve
// şampiyona (Bölüm 10) çözümleme mantığı, TEK BAŞINA çağrılabilsin diye
// ayrı bir fonksiyona çıkarıldı. dailyReset her gece bunu zaten normal
// akışının bir parçası olarak çağırıyor; AYRICA aşağıdaki
// resolveStuckRewardsNow (manuel/acil durum) endpoint'i de gece
// yarısını beklemeden AYNI mantığı elle bir kez tetiklemek için bunu
// çağırıyor — iki yerde de BİREBİR aynı kod çalışır, davranış farkı yok.
// Hem lottery (normal koleksiyon sorgusu, `drawnAt` alanı) hem
// championshipDaily (doküman ID'siyle doğrudan .get(), sorgu değil) hiçbir
// özel Firestore index'ine ihtiyaç duymaz — machines.ownerTriggeredDateKey
// index eksikliğinden TAMAMEN bağımsızdır, o yüzden index deploy'unu
// beklemeden hemen çalıştırılabilir.
async function resolveStuckLotteryAndChampionship(dateKey) {
  const summary = {
    lotteryDaysResolved: 0,
    lotteryGoldPaid: 0,
    championshipEntriesResolved: 0,
    championshipGoldPaid: 0,
  };

  // Piyango: GEÇMİŞTEKİ (bugün hariç) hâlâ çekilmemiş HER piyango gününü çeker.
  {
    const undrawnSnap = await db.collection('lottery').where('drawnAt', '==', null).get();
    for (const prevLotterySnap of undrawnSnap.docs) {
      if (prevLotterySnap.id >= dateKey) continue; // bugünün (henüz bitmemiş) piyangosu — dokunma
      const prevLotteryRef = prevLotterySnap.ref;
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
          summary.lotteryGoldPaid += lottery.jackpot;
        }
      } else {
        // Kimse bilet almadıysa kazanan yok, sadece çekiliş yapıldı olarak işaretlenir.
        await prevLotteryRef.update({ drawnAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      summary.lotteryDaysResolved += 1;
    }
  }

  // Şampiyona: geriye doğru son 7 GÜNÜN hepsi kontrol edilir (championshipDaily
  // dokümanında lottery'deki gibi baştan `finalized:false` yazılmıyor, bu
  // yüzden geniş bir `where` sorgusu yerine sınırlı bir gün penceresinde
  // doğrudan doküman ID'siyle kontrol ediyoruz).
  {
    const catalogIds = Object.keys(VEHICLE_CATALOG);
    const CHAMPIONSHIP_CATCHUP_DAYS = 7;
    for (let daysAgo = 1; daysAgo <= CHAMPIONSHIP_CATCHUP_DAYS; daysAgo += 1) {
      const champPrevDateKey = addDaysToDateKey(dateKey, -daysAgo);
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
          summary.championshipGoldPaid += reward;
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
        summary.championshipEntriesResolved += 1;
      }
    }
  }

  return summary;
}

// resolveStuckRewardsNow — GEÇİCİ/tek seferlik acil durum aracı: 13 Ağustos
// 2026 gecesi (bkz. machines.ownerTriggeredDateKey index eksikliği)
// dailyReset'in yarıda kesilmesiyle askıda kalan piyango/şampiyona
// ödüllerini, gece yarısını (bir sonraki dailyReset'i) beklemeden HEMEN
// dağıtmak için eklendi. dailyReset'in GERİ KALANINA (gün ilerletme,
// soygun/gazete/slot sıfırlama, fabrika kâr hesabı, banka faizi vb.)
// KESİNLİKLE DOKUNMAZ — SADECE piyango+şampiyona çözümlemesini çalıştırır,
// bu yüzden günün ortasında çağrılması oyunun geri kalanını bozmaz/başka
// bir günlük sıfırlamayı tekrarlatmaz. `drawnAt`/`finalized` kontrolleri
// sayesinde idempotenttir — birden fazla kez çağrılsa bile zaten ödenmiş
// bir günü TEKRAR ödemez, güvenle tekrar tekrar denenebilir.
// GÜVENLİK: basit bir paylaşılan sır (MAINTENANCE_SECRET) query param'ı ile
// korunuyor — oyunculardan/rastgele isteklerden gizli. Kullanım: deploy
// sonrası, fonksiyonun Cloud Functions URL'sini (deploy çıktısında görünür)
// tarayıcıda `?secret=...` ekleyerek BİR KEZ açmak yeterli. İşini bitirdikten
// sonra bu fonksiyonu (ve aşağıdaki sabiti) koddan tamamen silebilirsin —
// dailyReset kendi içindeki aynı mantıkla zaten her gece bunu otomatik
// yapmaya devam edecek.
const MAINTENANCE_SECRET = '854f8bf3de15bf540bd36a26a3cce7e5';

export const resolveStuckRewardsNow = onRequest(async (req, res) => {
  if (!req.query.secret || req.query.secret !== MAINTENANCE_SECRET) {
    res.status(403).json({ error: 'Yetkisiz.' });
    return;
  }
  try {
    const dateKey = istanbulDateKey();
    const summary = await resolveStuckLotteryAndChampionship(dateKey);
    console.log('resolveStuckRewardsNow tamamlandı:', summary);
    res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error('resolveStuckRewardsNow hata:', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
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

    // FABRİKA HİSSE SİSTEMİ İÇİN GECE BOYU PAYLAŞILAN DEĞİŞKENLER — mining
    // üretim bloğu bunları doldurur, "FABRİKA GÜNLÜK GELİR HESABI" bloğu
    // (Part A) ve onu takip eden hisse temettü ödemesi bloğu (Part B) bunları
    // okur. Aynı `dailyReset` çağrısı içinde, sırayla dolduruluyor.
    let nightCryptoPrice = 0;
    const miningCryptoQtyByOwner = new Map(); // ownerId -> bu gece üretilen toplam kripto miktarı
    const miningTriggeredCountByOwner = new Map(); // ownerId -> bu gece tetiklenen mining makine SAYISI (elektrik faturası için, bkz. Part A.5)
    const factoryDailyIncomeMap = new Map(); // ownerId -> bu geceki dailyIncome (altın) — hisse temettüsünün TEK kaynağı

    // 0) BORSA BÜLTENİ ANLIK GÖRÜNTÜSÜ (Gazete > Borsa Bülteni) — elmas/
    // hisse/kripto fiyatları hourlyInvestmentUpdate ile SAATTE BİR
    // değişmeye devam ediyor (alım/satım hep canlı fiyattan olur), ama
    // gazetedeki bülten sadece burada, gece 00:00'da bir kez "dondurulan"
    // bir anlık görüntü. Böylece gazete gün içinde sabit kalır, sadece
    // ertesi gece yenilenir.
    //
    // ÖNEMLİ: investments/current'ı DOĞRUDAN okumuyoruz — o doküman
    // hourlyInvestmentUpdate tarafından da tam gece yarısı civarında
    // güncelleniyor olabilir (aynı saat başı), iki zamanlanmış fonksiyon
    // arasında kim önce çalışır garantisi yok. Bunun yerine
    // investmentHistory'deki (her saat başı kaydedilen, gerçek zaman
    // damgalı) kayıtlardan "bugünün 00:00'ına en yakın" ve "dünün
    // 00:00'ına en yakın" olanları buluyoruz — hangi fonksiyonun önce
    // çalıştığından tamamen bağımsız, her zaman doğru eşleşir.
    {
      const nowMs = Date.now();
      const yesterdayMs = nowMs - 24 * 60 * 60 * 1000;

      const findSnapshotNear = async (targetMs) => {
        const beforeSnap = await db
          .collection('investmentHistory')
          .where('createdAt', '<=', admin.firestore.Timestamp.fromMillis(targetMs))
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        if (!beforeSnap.empty) return beforeSnap.docs[0].data();
        // Henüz hiç geçmiş kaydı yoksa (oyunun ilk günü): en eski kaydı kullan.
        const afterSnap = await db
          .collection('investmentHistory')
          .orderBy('createdAt', 'asc')
          .limit(1)
          .get();
        return afterSnap.empty ? null : afterSnap.docs[0].data();
      };

      const [current, prev] = await Promise.all([
        findSnapshotNear(nowMs),
        findSnapshotNear(yesterdayMs),
      ]);

      await db.collection('newspaperBulletin').doc('current').set({
        dateKey,
        diamondPrice: current?.diamondPrice ?? DEFAULT_PRICES.diamondPrice,
        stockPrice: current?.stockPrice ?? DEFAULT_PRICES.stockPrice,
        cryptoPrice: current?.cryptoPrice ?? DEFAULT_PRICES.cryptoPrice,
        prevDiamondPrice: prev?.diamondPrice ?? current?.diamondPrice ?? DEFAULT_PRICES.diamondPrice,
        prevStockPrice: prev?.stockPrice ?? current?.stockPrice ?? DEFAULT_PRICES.stockPrice,
        prevCryptoPrice: prev?.cryptoPrice ?? current?.cryptoPrice ?? DEFAULT_PRICES.cryptoPrice,
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

    // -0.7) FUTBOL SAKATLIK İYİLEŞMESİ — yeni istek: "sakat oyuncu gün
    // bazında iyileşsin maç olsa da olmasa da kupa maçı da olsa her
    // 00.00da doktorsuz 1 gün doktorla beraber +1 gün daha iyileşecek" ve
    // "doktora ödemesini yaptığınızda tedaviye başlar ve 00.00da işi biter
    // kutu boşalır". Maç takviminden (18:00/19:00) TAMAMEN BAĞIMSIZ, her
    // gece — lig günü, kupa günü, kutlama günü fark etmeksizin — çalışır.
    {
      const [injuredSnap, doctorTeamsSnap] = await Promise.all([
        db.collection('futbolPlayers').where('injuryDaysLeft', '>', 0).get(),
        db.collection('futbolTeams').where('doctorPlayerId', '!=', null).get(),
      ]);
      const doctorPlayerIds = new Set(doctorTeamsSnap.docs.map((d) => d.data().doctorPlayerId));
      let injuryBatch = db.batch();
      let injuryOpCount = 0;
      const injuryBatchJobs = [];
      const commitIfFull = () => {
        if (injuryOpCount >= 400) {
          injuryBatchJobs.push(injuryBatch.commit());
          injuryBatch = db.batch();
          injuryOpCount = 0;
        }
      };
      injuredSnap.forEach((d) => {
        const days = d.data().injuryDaysLeft || 0;
        const healAmount = doctorPlayerIds.has(d.id) ? 2 : 1; // doktor varsa +1 ekstra
        injuryBatch.update(d.ref, { injuryDaysLeft: Math.max(0, days - healAmount) });
        injuryOpCount += 1;
        commitIfFull();
      });
      // Doktor kutusu HER gece boşalır — tedavi görüp görmediğine
      // bakılmaksızın (oyuncu bu gece iyileştiyse de, iyileşmediyse de
      // kutu boşalır; tekrar tedavi için yeniden ödeme gerekir).
      doctorTeamsSnap.forEach((d) => {
        injuryBatch.update(d.ref, { doctorPlayerId: null });
        injuryOpCount += 1;
        commitIfFull();
      });
      if (injuryOpCount > 0) injuryBatchJobs.push(injuryBatch.commit());
      await Promise.all(injuryBatchJobs);
    }

    // -0.5) Mining makineleri işçi gerektirmez ama artık otomatik de
    // üretmiyor (kullanıcı revizesi) — sadece sahibinin dün (bugünün
    // 00:00'ından önceki gün) triggerAllMining ile TETİKLEDİĞİ makineler
    // üretim yapar. Aynı sahibin birden çok tetiklenmiş makinesi varsa
    // hepsi ayrı ayrı üretir, toplamı TEK bir SMS ile bildirilir.
    {
      const prevDateKey = addDaysToDateKey(dateKey, -1);
      const [miningSnap, nightPrices] = await Promise.all([
        db.collectionGroup('machines').where('type', '==', 'mining').get(),
        getCurrentPrices(),
      ]);
      // Bu geceki canlı kripto fiyatı — hem "FABRİKA GÜNLÜK GELİR HESABI"
      // (Part A, aşağıda) mining üretiminin altın karşılığını hesaplarken
      // hem de mining üretim ödemesinin kendisi (kripto miktarı, altında)
      // AYNI anlık görüntüyü kullanır, bkz. yukarıdaki dosya-üstü not.
      nightCryptoPrice = nightPrices.cryptoPrice || 0;
      const triggeredDocs = miningSnap.docs.filter((m) => m.data().miningTriggeredDateKey === prevDateKey);
      const miningJobs = [];
      triggeredDocs.forEach((m) => {
        const factoryId = m.ref.parent.parent.id;
        const qty = randomInRange(MACHINE_TYPES.mining.min, MACHINE_TYPES.mining.max);
        miningJobs.push(
          db
            .collection('users')
            .doc(factoryId)
            .update({ cryptoHoldings: admin.firestore.FieldValue.increment(qty) })
        );
        miningCryptoQtyByOwner.set(factoryId, (miningCryptoQtyByOwner.get(factoryId) || 0) + qty);
        miningTriggeredCountByOwner.set(factoryId, (miningTriggeredCountByOwner.get(factoryId) || 0) + 1);
      });
      await Promise.all(miningJobs);

      const smsJobs = [];
      miningCryptoQtyByOwner.forEach((totalQty, ownerId) => {
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

    // -0.4) SAHİP-YERİNE-ÜRETİM (işçi gerektiren 4 makine türü): sahibi dün
    // "Makineleri Çalıştır" butonuyla (runFactoryMachines) ownerTriggeredDateKey
    // damgaladığı makinelerden, o gün İÇİNDE atanmış işçi tarafından
    // GERÇEKTEN üretilmemiş (lastProducedDateKey dünün tarihiyle eşleşmeyen —
    // yani işçi hiç gelip normal "Üretim Yap" akışını çalıştırmamış) her
    // makine, sahibi tarafından üretilmiş sayılır ve SAHİBİN envanterine
    // eklenir. Maaş ödemesi YOK — işçi fiilen çalışmadı. Miktar formülü
    // makine türüne göre değişir: tamirMalzemesi ve yasakliMadde için KENDİ
    // özel formülleri var (bkz. aşağısı), diğer türler (silahUpgrade,
    // arabaGelistirme) hâlâ eski davranışı kullanıyor — normal min-max
    // miktar hesaplanıp (produceAtFactory ile AYNI formül) 1/10'una
    // düşürülüyor (0'a yuvarlanmaması için en az 1 birim garanti edilir).
    // İşçi o gün ZATEN gerçek üretim yaptıysa (lastProducedDateKey === dün),
    // işçinin üretimi ÖNCELİKLİDİR ve bu blok o makineyi atlar (çifte
    // üretim yok).
    {
      const prevDateKey = addDaysToDateKey(dateKey, -1);
      const workerMachineTypes = VALID_MACHINES.filter((t) => t !== 'mining');
      const ownerTriggeredSnap = await db
        .collectionGroup('machines')
        .where('ownerTriggeredDateKey', '==', prevDateKey)
        .get();
      const fallbackDocs = ownerTriggeredSnap.docs.filter(
        (m) => workerMachineTypes.includes(m.data().type) && m.data().lastProducedDateKey !== prevDateKey
      );

      const producedByOwner = new Map(); // ownerId -> [{type, qty}]
      const settleJobs = fallbackDocs.map((m) => {
        const machine = m.data();
        const factoryId = m.ref.parent.parent.id;
        const cfg = MACHINE_TYPES[machine.type];
        // Yeni istek: tamirMalzemesi ve yasakliMadde için genel "normal
        // miktarın 1/10'u" formülü yerine, işçisiz çalışırken KENDİ
        // (min-max'tan bağımsız) formülleri kullanılıyor.
        let qty;
        if (machine.type === 'tamirMalzemesi') {
          // "işçisiz çalışan tamir makinesi günlük 1-400 malzeme üretsin"
          qty = Math.floor(randomInRange(1, 401));
        } else if (machine.type === 'yasakliMadde') {
          // "işçisiz çalışan yasaklı madde üretme makinesi %5 ihtimalle 2
          // adet, %50 ihtimalle 1 adet, kalan ihtimallerde 0 üretim yapsın"
          const roll = Math.random();
          qty = roll < 0.05 ? 2 : roll < 0.55 ? 1 : 0;
        } else {
          const normalQty =
            machine.type === 'silahUpgrade'
              ? Math.floor(randomInRange(cfg.min, cfg.max + 1))
              : Math.round(randomInRange(cfg.min, cfg.max));
          qty = normalQty > 0 ? Math.max(1, Math.round(normalQty * 0.1)) : 0;
        }

        const jobs = [m.ref.update({ lastProducedDateKey: prevDateKey, lastProducedQty: qty })];
        if (qty > 0) {
          if (!producedByOwner.has(factoryId)) producedByOwner.set(factoryId, []);
          producedByOwner.get(factoryId).push({ type: machine.type, qty });
          jobs.push(
            db
              .collection('users')
              .doc(factoryId)
              .collection('inventory')
              .doc(machine.type)
              .set({ quantity: admin.firestore.FieldValue.increment(qty) }, { merge: true })
          );
        }
        return Promise.all(jobs);
      });
      await Promise.all(settleJobs);

      const ownerSmsJobs = [];
      producedByOwner.forEach((items, ownerId) => {
        const lines = items
          .map((it) => `${MACHINE_TYPES[it.type].label}: ${it.qty.toLocaleString('tr-TR')} adet`)
          .join(', ');
        ownerSmsJobs.push(
          db
            .collection('users')
            .doc(ownerId)
            .collection('messages')
            .add({
              text: `İşçin gelmediği için bazı makinelerini kendin çalıştırmış oldun (normalin 1/10'u verimle): ${lines}. Envanterine eklendi.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'factory_owner_production',
            })
        );
      });
      await Promise.all(ownerSmsJobs);
    }

    // -0.35) FABRİKA GÜNLÜK GELİR HESABI (Faz Fabrika Hisseleri — Part A):
    // üstteki iki blok bitince, dün (prevDateKey) üretim yapmış HER makine
    // (işçinin gerçek "Üretim Yap" akışı VEYA sahip-yerine-üretim — ikisi de
    // artık lastProducedDateKey = prevDateKey damgasını taşıyor) belli.
    // Her makinenin ürettiği malzeme/kripto, "anlık nakde çevirme" karşılığı
    // altın değerine çevrilip fabrika başına toplanır ve
    // factories/{ownerId}.dailyIncome alanına yazılır. Bu alan, aşağıdaki
    // hisse temettü ödemesinin (Part B) VE listFactoryShare'deki fiyat
    // sınırlarının TEK kaynağıdır.
    {
      const prevDateKey = addDaysToDateKey(dateKey, -1);

      // Malzemelerin "anlık nakde çevirme" altın karşılığı — gerçek satış
      // mekanizması olan 3 malzeme için oyundaki GERÇEK fiyatlar kullanılır.
      const materialGoldValue = {
        tamirMalzemesi: MATERIAL_SELL_PRICE.tamirMalzemesi, // 8 altın/adet — Modifiye Garajı
        arabaGelistirme: MATERIAL_SELL_PRICE.arabaGelistirme, // 250 altın/adet — Modifiye Garajı
        yasakliMadde: CONTRABAND_PARK_SELL_PRICE, // 5.000 altın/adet — Park'ta satış
        // silahUpgrade — bu malzeme için oyunda GERÇEK bir satış mekanizması
        // YOK (sadece silah geliştirmede tüketiliyor). TAHMİNİ değer:
        // Amazor alış fiyatının (100) yarısı — arabaGelistirme'de görülen
        // alış/satış oranıyla (500 alış / 250 satış, yani ~%50) tutarlı.
        silahUpgrade: 50,
      };

      const producedSnap = await db
        .collectionGroup('machines')
        .where('lastProducedDateKey', '==', prevDateKey)
        .get();

      const incomeByFactory = new Map(); // ownerId -> altın (yuvarlanmamış toplam)
      // Yeni istek: "günlük raporda kaç adet hangi malzemeden üretildiği de
      // yazsın" — gelir hesabının YANINDA, malzeme türü başına üretilen
      // miktar da fabrika başına ayrıca tutuluyor.
      const producedByTypeByFactory = new Map(); // ownerId -> { [type]: qty }
      producedSnap.forEach((m) => {
        const machine = m.data();
        const unitValue = materialGoldValue[machine.type];
        if (!unitValue) return; // mining burada yok — aşağıda ayrıca ekleniyor
        const factoryId = m.ref.parent.parent.id;
        const qty = machine.lastProducedQty || 0;
        const value = qty * unitValue;
        incomeByFactory.set(factoryId, (incomeByFactory.get(factoryId) || 0) + value);

        if (!producedByTypeByFactory.has(factoryId)) producedByTypeByFactory.set(factoryId, {});
        const typeMap = producedByTypeByFactory.get(factoryId);
        typeMap[machine.type] = (typeMap[machine.type] || 0) + qty;
      });

      // Mining: üstteki mining üretim bloğunda doldurulan
      // miningCryptoQtyByOwner (o gece üretilen toplam kripto miktarı),
      // AYNI gecenin canlı kripto fiyatıyla (nightCryptoPrice) çarpılır —
      // mining üretiminin kendisiyle (kripto bakiyesine ekleme) birebir
      // aynı anlık fiyat görüntüsü.
      miningCryptoQtyByOwner.forEach((qty, factoryId) => {
        const value = qty * nightCryptoPrice;
        incomeByFactory.set(factoryId, (incomeByFactory.get(factoryId) || 0) + value);
        if (!producedByTypeByFactory.has(factoryId)) producedByTypeByFactory.set(factoryId, {});
        const typeMap = producedByTypeByFactory.get(factoryId);
        typeMap.mining = (typeMap.mining || 0) + qty;
      });

      // -0.34) FABRİKA ELEKTRİK FATURASI — makineler işçisiz de işçiyle de
      // çalışabiliyor, nasıl çalıştığının önemi yok, çalışıyorsa elektrik
      // her türlü gelecek. Sahibi o gün oyuna hiç girmemiş olsa bile fatura
      // gelir — kullanıcının kendi kararı: "biz almamız gereken ürünü
      // oyunda değilken de alıyoruz, elektrik masrafı önemli değil,
      // cezalandırmak olarak sayılmaz."
      // GÜNCELLEME (kullanıcı revizesi): tutar artık makine türüne göre
      // sabit 100 değil — araba/silah geliştirme 100, tamir/yasaklı madde
      // 200, kripto (mining) 300 altın/gün.
      // "Çalıştı" = dün ÜRETTİ: işçi gerektiren 4 tür için producedSnap'te
      // zaten elimizde (lastProducedDateKey === prevDateKey — ister gerçek
      // işçi ister sahip-yerine-üretim, ikisi de AYNI damgayı taşıyor,
      // bkz. yukarısı; machine.type buradan okunur), mining için üstteki
      // (-0.5) bloktaki miningTriggeredCountByOwner (tetiklenen HER mining
      // makinesi, ürettiği kripto miktarından bağımsız — hepsi 300 altın).
      const ELECTRICITY_BILL_PER_MACHINE_TYPE = {
        silahUpgrade: 100,
        arabaGelistirme: 100,
        tamirMalzemesi: 200,
        yasakliMadde: 200,
        mining: 300,
      };
      const electricityBillByFactory = new Map(); // ownerId -> tutar (altın)
      const addElectricity = (factoryId, amount) => {
        if (amount <= 0) return;
        electricityBillByFactory.set(factoryId, (electricityBillByFactory.get(factoryId) || 0) + amount);
      };
      producedSnap.forEach((m) => {
        const factoryId = m.ref.parent.parent.id;
        const unit = ELECTRICITY_BILL_PER_MACHINE_TYPE[m.data().type] || 0;
        addElectricity(factoryId, unit);
      });
      miningTriggeredCountByOwner.forEach((count, factoryId) => {
        addElectricity(factoryId, count * ELECTRICITY_BILL_PER_MACHINE_TYPE.mining);
      });
      // Faturası olan sahiplerin GÜNCEL altın/borç bilgisini topluca çekiyoruz
      // — aşağıdaki batch yazımı senkron kurulduğu için, nakit/borç ayrımı bu
      // okumadan sonra hesaplanmalı (produceAtFactory'deki maaş açığı
      // mantığıyla AYNI desen, sadece transaction yerine toplu okuma).
      const electricityOwnerIds = Array.from(electricityBillByFactory.keys());
      const electricityOwnerSnaps = await Promise.all(
        electricityOwnerIds.map((id) => db.collection('users').doc(id).get())
      );
      const electricityOwnerGold = new Map();
      const electricityOwnerDebt = new Map();
      electricityOwnerSnaps.forEach((snap) => {
        electricityOwnerGold.set(snap.id, snap.data()?.gold || 0);
        electricityOwnerDebt.set(snap.id, snap.data()?.debtToState || 0);
      });
      const electricitySmsJobs = []; // { ownerId, bill, shortfall, newTotalDebt }

      // TÜM fabrikalara yaz — bugün hiç üretim yapmamış fabrikalar da
      // dailyIncome: 0 alır, yoksa eski (bayat) bir değer asılı kalır ve
      // hisse fiyat sınırlarını/temettülerini yanlış hesaplatır.
      const allFactoriesSnap = await db.collection('factories').get();
      let batch = db.batch();
      let opCount = 0;
      const batchJobs = [];
      allFactoriesSnap.forEach((f) => {
        // Yeni istek: "hisse satışı için günlük kazanç hesabında işçiye
        // verilen maaş düşülecek, kâr eksi bile olabilir" — dailyIncome
        // artık BRÜT üretim değeri değil, o günkü (gerçek işçilerle
        // üretilen makinelerin — sahip-yerine-üretimde maaş ödenmez, kendi
        // fabrikanda kendin çalışıyorsan da ödenmez) TOPLAM maaş
        // ödemelerinin düşüldüğü NET KÂR. Kasıtlı olarak 0'da
        // KIRPILMIYOR — bir makinenin ürettiği malın anlık satış değeri
        // maaştan düşük kalırsa o gün gerçekten zarar edilmiş demektir.
        const grossIncome = Math.round(incomeByFactory.get(f.id) || 0);
        const salaryPaid = Math.round(f.data().salaryPaidToday || 0);
        // Yeni istek (kullanıcı revizesi): "kar hesaplanırken elektrik
        // faturası masrafı da cirodan düşülsün" — dailyIncome artık
        // grossIncome - salaryPaid - electricityBill. electricityBill bu
        // fabrika için AŞAĞIDAKİ DEĞİL, YUKARIDAKİ elektrik faturası
        // bloğunda (Part A.5, electricityBillByFactory) zaten hesaplanmış
        // durumda, burada sadece okunuyor. Bu, hisse alım/satım fiyat
        // aralığının (shareMinPrice/shareMaxPrice) ve temettü ödemelerinin
        // TEK kaynağı olan dailyIncome'u da etkiler — artık elektrik
        // masrafı yüksek bir fabrikanın hisseleri daha düşük değerlenir/
        // temettü öder, kasıtlı ve istenen davranış.
        const electricityBill = electricityBillByFactory.get(f.id) || 0;
        const dailyIncome = Math.round(grossIncome - salaryPaid - electricityBill);
        factoryDailyIncomeMap.set(f.id, dailyIncome);

        // Son 10 günlük gelir geçmişi: Firestore'da atomik "ekle ve N ile
        // sınırla" bir array operasyonu olmadığı için, mevcut
        // dailyIncomeHistory'yi (zaten elimizdeki f.data()'dan, ekstra bir
        // okuma yapmadan) alıp bugünün değerini sona ekliyoruz ve son 10
        // elemanla sınırlıyoruz. dailyIncomeAvg10, dizideki GERÇEK eleman
        // sayısına bölünür (10 günden az geçmişi olan yeni bir fabrika için
        // her zaman 10'a değil, mevcut gün sayısına bölünür).
        const existingHistory = Array.isArray(f.data().dailyIncomeHistory)
          ? f.data().dailyIncomeHistory
          : [];
        const dailyIncomeHistory = [...existingHistory, dailyIncome].slice(-10);
        const dailyIncomeAvg10 = Math.round(
          dailyIncomeHistory.reduce((sum, v) => sum + (v || 0), 0) / dailyIncomeHistory.length
        );

        // Yeni istek: "fabrika sahipleri için günlük rapor — makinelerden
        // ne kadar kazandık, kâr ne kadar, masraf ne kadar hepsi
        // raporlansın". dailyIncome zaten NET kârı taşıyor ama brüt üretim
        // geliri (grossIncome) ile işçi maaş masrafı (salaryPaid) ayrı ayrı
        // saklanmıyordu — müşteri tarafında (FactoryScreen) "Günlük Rapor"
        // panelinin üç kalemi (kazanç/masraf/kâr) ayrı ayrı gösterebilmesi
        // için ikisi de dailyIncome'la AYNI desende (skaler + son 10 günlük
        // geçmiş dizisi) persist ediliyor.
        const existingGrossHistory = Array.isArray(f.data().dailyGrossIncomeHistory)
          ? f.data().dailyGrossIncomeHistory
          : [];
        const dailyGrossIncomeHistory = [...existingGrossHistory, grossIncome].slice(-10);
        const existingExpenseHistory = Array.isArray(f.data().dailySalaryExpenseHistory)
          ? f.data().dailySalaryExpenseHistory
          : [];
        const dailySalaryExpenseHistory = [...existingExpenseHistory, salaryPaid].slice(-10);

        // Malzeme türü başına dünkü üretim — bugün hiç üretim olmadıysa
        // boş obje ({}) yazılır (eski bayat değer asılı kalmasın diye).
        const dailyProducedByType = producedByTypeByFactory.get(f.id) || {};

        // Elektrik faturası (Part A.5) — bu fabrika için bugünkü tutar
        // (çalışan makine yoksa 0, yukarıda dailyIncome hesabında da
        // kullanıldı), günlük raporun giderler kısmında dailySalaryExpense
        // ile AYNI desende (skaler + son 10 gün geçmişi).
        const existingElectricityHistory = Array.isArray(f.data().dailyElectricityExpenseHistory)
          ? f.data().dailyElectricityExpenseHistory
          : [];
        const dailyElectricityExpenseHistory = [...existingElectricityHistory, electricityBill].slice(-10);

        batch.update(f.ref, {
          dailyIncome,
          dailyIncomeDateKey: prevDateKey,
          dailyIncomeHistory,
          dailyIncomeAvg10,
          dailyGrossIncome: grossIncome,
          dailyGrossIncomeHistory,
          dailySalaryExpense: salaryPaid,
          dailySalaryExpenseHistory,
          dailyElectricityExpense: electricityBill,
          dailyElectricityExpenseHistory,
          dailyProducedByType,
          // Yarın için sayaç sıfırlanır — bugün zaten yukarıda okunup
          // düşüldü (produceAtFactory bundan sonra tekrar biriktirmeye
          // başlar).
          salaryPaidToday: 0,
        });
        opCount += 1;
        if (opCount >= 400) {
          batchJobs.push(batch.commit());
          batch = db.batch();
          opCount = 0;
        }

        // Elektrik faturasını sahibin altınından düş — yetmiyorsa kalanı
        // (produceAtFactory'deki maaş açığı mantığıyla AYNI şekilde)
        // devlete borç yazılır. Fatura 0 ise (bugün çalışan makine yoksa)
        // hiçbir para hareketi/SMS olmaz.
        if (electricityBill > 0) {
          const ownerGold = electricityOwnerGold.get(f.id) || 0;
          const paidFromGold = Math.min(electricityBill, ownerGold);
          const shortfall = electricityBill - paidFromGold;
          batch.update(db.collection('users').doc(f.id), {
            gold: admin.firestore.FieldValue.increment(-paidFromGold),
            debtToState: admin.firestore.FieldValue.increment(shortfall),
          });
          opCount += 1;
          if (opCount >= 400) {
            batchJobs.push(batch.commit());
            batch = db.batch();
            opCount = 0;
          }
          electricitySmsJobs.push({
            ownerId: f.id,
            bill: electricityBill,
            shortfall,
            newTotalDebt: (electricityOwnerDebt.get(f.id) || 0) + shortfall,
          });
        }
      });
      if (opCount > 0) batchJobs.push(batch.commit());
      await Promise.all(batchJobs);
      // Elektrik faturası SMS'leri — batch commit'ler bittikten SONRA
      // gönderilir (sendSalaryPenaltySms'in produceAtFactory'de yapıldığı
      // gibi, para hareketi kesinleşmeden bildirim gitmesin diye).
      await Promise.all(
        electricitySmsJobs.map((job) =>
          sendElectricityBillSms(job.ownerId, job.bill, job.shortfall, job.newTotalDebt)
        )
      );
    }

    // -0.32) FABRİKA HİSSE (STOK) TEMETTÜ ÖDEMESİ (Faz Fabrika Hisseleri —
    // Part B): üstteki bloktan (Part A) taze factoryDailyIncomeMap hazır —
    // her AKTİF (satılmış, hâlâ ödeme süresi devam eden) hisse için, o
    // hissenin sahip olduğu fabrikanın BU GECEKİ dailyIncome'undan
    // (percent%) payına düşen kısım hisseyi ALAN oyuncuya ödenir.
    // Fabrika sahibinin altını yetmezse fark, produceAtFactory'deki maaş
    // mantığıyla BİREBİR AYNI şekilde (bkz. sendSalaryPenaltySms) sahibin
    // borcuna (debtToState) yazılır — alıcı HER ZAMAN temettüsünü TAM alır.
    {
      const todayDateKey = dateKey;
      const activeSharesSnap = await db.collectionGroup('shares').where('status', '==', 'active').get();

      await Promise.all(
        activeSharesSnap.docs.map(async (shareDoc) => {
          const share = shareDoc.data();
          const ownerId = shareDoc.ref.parent.parent.id;
          const factoryDailyIncome = factoryDailyIncomeMap.get(ownerId) || 0;
          const dividend = Math.round(((share.percent || 0) / 100) * factoryDailyIncome);
          const newRemainingDays = Math.max(0, (share.remainingDays || 0) - 1);

          // totalPaidOut/lastPayoutAmount — yeni istek (madde 4): "hisse
          // senedinden şu kadar para kazandın mesajında ... şu ana kadar şu
          // kadar toplamda kazandın" — yatırımcı ekranında ve SMS'te
          // gösterilecek kümülatif/bugünkü kazanç burada tutuluyor
          // (eskiden hiç kayıt yoktu, bkz. araştırma notu).
          const shareUpdate = {
            remainingDays: newRemainingDays,
            lastPayoutDateKey: todayDateKey,
            lastPayoutAmount: dividend,
            totalPaidOut: admin.firestore.FieldValue.increment(dividend),
          };
          if (newRemainingDays <= 0) shareUpdate.status = 'expired';

          if (dividend <= 0) {
            await shareDoc.ref.update(shareUpdate);
            return;
          }

          const buyerRef = db.collection('users').doc(share.buyerId);
          const ownerRef = db.collection('users').doc(ownerId);

          let shortfall = 0;
          let newOwnerDebt = null;
          await db.runTransaction(async (tx) => {
            const [buyerSnap, ownerSnap] = await Promise.all([tx.get(buyerRef), tx.get(ownerRef)]);
            if (!buyerSnap.exists || !ownerSnap.exists) {
              tx.update(shareDoc.ref, shareUpdate);
              return;
            }
            const owner = ownerSnap.data();
            const ownerGold = owner?.gold || 0;
            const ownerPay = Math.min(dividend, ownerGold);
            shortfall = dividend - ownerPay;

            // Hisse sahibi (alıcı): temettüsünü TAM alır — produceAtFactory'
            // deki işçi maaşı mantığıyla birebir aynı.
            tx.update(buyerRef, { gold: admin.firestore.FieldValue.increment(dividend) });
            // Fabrika sahibi: elinden çıkabildiği kadarı düşülür, yetmeyen
            // kısım CEZA/borç olur (splitIncomeForDebt DEĞİL — bu bir
            // ödeme YÜKÜMLÜLÜĞÜ, gelir değil, tıpkı maaş ödemesinde olduğu
            // gibi).
            tx.update(ownerRef, {
              gold: admin.firestore.FieldValue.increment(-ownerPay),
              debtToState: admin.firestore.FieldValue.increment(shortfall),
            });
            if (shortfall > 0) {
              newOwnerDebt = (owner?.debtToState || 0) + shortfall;
            }
            tx.update(shareDoc.ref, shareUpdate);
          });

          // Yeni istek (madde 4): "şu fiyata aldığın hisseden bugün şu kadar
          // kazandın ve şu ana kadar şu kadar toplamda bu kadar kazandın ve
          // vadenin bitmesine şu kadar gün kaldı" — mesaj artık tek bir
          // rakam yerine tüm bu bağlamı içeriyor. `newTotalPaidOut` burada
          // JS tarafında elle hesaplanıyor (FieldValue.increment sunucuda
          // atomik uygulanır ama anlık yeni değeri bize geri vermez).
          const newTotalPaidOut = (share.totalPaidOut || 0) + dividend;
          const expiryNote =
            newRemainingDays > 0
              ? `Vadenin bitmesine ${newRemainingDays} gün kaldı.`
              : 'Bu hissenin vadesi bugün doldu.';
          const smsJobs = [
            buyerRef.collection('messages').add({
              text: `📈 Hisse temettün ödendi! %${share.percent}'ini ${(share.price || 0).toLocaleString('tr-TR')} altına aldığın fabrika hissesinden bugün ${dividend.toLocaleString('tr-TR')} altın kazandın. Bu hisseden şu ana kadar toplam ${newTotalPaidOut.toLocaleString('tr-TR')} altın kazandın. ${expiryNote}`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'share_dividend',
            }),
          ];
          if (shortfall > 0 && newOwnerDebt != null) {
            smsJobs.push(
              ownerRef.collection('messages').add({
                text: `Fabrikandaki bir hisse sahibinin temettüsünü ödemeye altının yetmedi. Eksik ${shortfall.toLocaleString('tr-TR')} altın devlete borç yazıldı. Toplam borcun: ${newOwnerDebt.toLocaleString('tr-TR')} altın.`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                type: 'share_dividend_penalty',
              })
            );
          }
          await Promise.all(smsJobs);
        })
      );
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

    // 9-10) Piyango çekilişi + Şampiyona: ortak mantık artık
    // resolveStuckLotteryAndChampionship() içinde (bkz. yukarısı, dailyReset
    // tanımından hemen önce) — hem burada hem de acil durumda elle
    // tetiklenebilen resolveStuckRewardsNow endpoint'inde BİREBİR aynı kod
    // çalışır. GEÇMİŞTEKİ (bugün hariç) hâlâ çözülmemiş HER günü tarar —
    // eskiden SADECE "dün"e bakılıyordu; bu, dailyReset bir gece herhangi bir
    // sebeple (ör. eksik bir Firestore index'i) bu noktaya hiç ulaşamazsa o
    // günün ödüllerinin SONSUZA DEK kimseye ödenmeden askıda kalmasına yol
    // açıyordu.
    await resolveStuckLotteryAndChampionship(dateKey);

    console.log(`dailyReset tamamlandı: ${dateKey}`);
  }
);

// CRYPTO_TIME_WEIGHT_BUCKETS — kripto fiyat YÖNÜNÜ artık oyuncuların
// gerçek alış/satış işlemleri belirliyor (kullanıcı isteğiyle yeniden
// tasarlanan sistem). Her işlem, ne kadar YENİ olduğuna göre ağırlıklı
// sayılıyor — yeni işlemler daha güçlü, eski işlemler daha zayıf etkili.
// Sınır saat değeri dahil (<=) o kovaya girer; 24 saatten eski işlemler
// (ağırlık 0) zaten sorguya hiç dahil edilmiyor.
// GÜNCELLEME (kullanıcı revizesi): kovalar sadeleştirildi — son 6 saat 3x,
// 7-12 saat 2x, 13-24 saat 1x (önceki 5 kademeli — 1/3/6/12/24 saat,
// 4/3/2/1.5/1x — yapı yerine).
const CRYPTO_TIME_WEIGHT_BUCKETS = [
  { maxHours: 6, weight: 3 },
  { maxHours: 12, weight: 2 },
  { maxHours: 24, weight: 1 },
];
function cryptoTradeWeight(ageMs) {
  const ageHours = ageMs / (60 * 60 * 1000);
  for (const bucket of CRYPTO_TIME_WEIGHT_BUCKETS) {
    if (ageHours <= bucket.maxHours) return bucket.weight;
  }
  return 0;
}

// computeWeightedCryptoBuyRatio — YENİ SİSTEM (kullanıcı tasarımı): "KR
// fiyatının yönünü algoritma doğrudan belirlemesin; oyuncuların gerçek
// alış/satış davranışları fiyatın yönünü etkilesin. Ancak tek bir
// oyuncunun (ya da anlaşmalı küçük bir grubun) piyasayı tek başına
// yönlendirmesi mümkün olmasın." Adımlar:
//   1. Son 24 saatteki TÜM cryptoTrades kayıtları okunur (mining üretimi
//      buraya HİÇ girmez — sadece gerçekleşmiş alım/satım işlemleri,
//      bkz. buyInvestment/sellInvestment).
//   2. Her işleme yaşına göre zaman ağırlığı uygulanır (yukarısı).
//   3. Oyuncu bazında (uid) toplam ağırlıklı alış ve toplam ağırlıklı
//      satış hesaplanır — İŞLEM SAYISINA göre değil, TOPLAM ağırlıklı
//      hacme göre. Bir oyuncu 10M KR'yi 100×100K'lık parçaya bölerek
//      satsa bile, o oyuncunun toplam ağırlıklı satış hacmi yine 10M
//      olarak Map'te birikir — işlemi parçalara bölmek bu yüzden hiçbir
//      şey kazandırmaz. Ağırlık ALTIN değil KR MİKTARI (krAmount)
//      üzerinden hesaplanır (kullanıcı isteği).
//   4-7. En büyük ağırlıklı ALICININ toplam alış hacmi alış toplamından,
//      en büyük ağırlıklı SATICININ toplam satış hacmi satış toplamından
//      AYRI AYRI (birbirinden bağımsız) çıkarılır. Aynı oyuncu hem en
//      büyük alıcı hem en büyük satıcıysa, iki taraftan da (kendi payı
//      kadar) düşülür — "en büyük İŞLEM" değil "en büyük OYUNCUNUN toplam
//      hacmi" çıkarılıyor, bu yüzden 100 küçük işlem 1 büyük işlemden daha
//      fazla ağırlık taşıyorsa yine o oyuncu "en büyük" sayılıp çıkarılır.
//   8. Kalan (dışlanan oyuncular hariç) toplam alış/satış üzerinden oran
//      hesaplanır — bu oran hourlyInvestmentUpdate'teki %80/%20 kuralına
//      girdi olarak kullanılır (o kural DEĞİŞMEDİ, aynen korunuyor).
// NEDEN: Tek bir oyuncu "1M sat → satış baskısı oluştur → sonra 2M al →
// alış baskısı oluştur" döngüsünü tekrarlayarak fiyatı küçük hareketlerle
// kendi lehine yönlendirmeye çalışabilir. En büyük alıcı/satıcının payını
// hesaplamadan çıkarmak, tam olarak bu döngüyü (ve piyasadan görece kopuk
// tek bir whale'in etkisini) devre dışı bırakır — bkz. bu fonksiyonun
// altındaki test senaryoları için sohbet geçmişindeki analiz.
// Dönüş: kalan ağırlıklı alış / (alış+satış) oranı — dışlama sonrası
// anlamlı hacim kalmazsa (ör. tek oyuncu, ya da hiç işlem yoksa) null
// döner, çağıran taraf bu durumda mevcut sistemdeki gibi tamamen rastgele
// yöne döner (bkz. hourlyInvestmentUpdate).
async function computeWeightedCryptoBuyRatio() {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const tradesSnap = await db.collection('cryptoTrades').where('createdAt', '>=', cutoff).get();
  if (tradesSnap.empty) return null;

  const nowMs = Date.now();
  const buyByUid = new Map();
  const sellByUid = new Map();
  tradesSnap.forEach((doc) => {
    const t = doc.data();
    const tsMs = t.createdAt?.toMillis?.();
    if (!tsMs || !t.uid) return;
    const weight = cryptoTradeWeight(nowMs - tsMs);
    if (weight <= 0) return;
    const weighted = (t.krAmount || 0) * weight;
    if (weighted <= 0) return;
    const map = t.type === 'buy' ? buyByUid : t.type === 'sell' ? sellByUid : null;
    if (!map) return;
    map.set(t.uid, (map.get(t.uid) || 0) + weighted);
  });

  // En büyük ağırlıklı alıcı/satıcının TOPLAM hacmini bul (tek işlem değil,
  // o oyuncunun 24 saatteki tüm işlemlerinin toplamı — yukarıdaki Map zaten
  // bunu tutuyor).
  let totalBuy = 0;
  let maxBuyVal = 0;
  buyByUid.forEach((v) => {
    totalBuy += v;
    if (v > maxBuyVal) maxBuyVal = v;
  });
  let totalSell = 0;
  let maxSellVal = 0;
  sellByUid.forEach((v) => {
    totalSell += v;
    if (v > maxSellVal) maxSellVal = v;
  });

  // Aynı oyuncu hem en büyük alıcı hem en büyük satıcı olsa bile sorun
  // yok: maxBuyVal ve maxSellVal birbirinden bağımsız hesaplanıp ayrı ayrı
  // düşülüyor, yani o oyuncunun etkisi HER İKİ taraftan da kalkıyor.
  const remainingBuy = Math.max(0, totalBuy - maxBuyVal);
  const remainingSell = Math.max(0, totalSell - maxSellVal);
  const total = remainingBuy + remainingSell;
  if (total <= 0) return null;
  return remainingBuy / total;
}

// =============================================================================
// hourlyInvestmentUpdate — elmas/kripto/hisse senedi fiyatları SAATTE 1
// kez (günde 24 kez) hareket ediyor.
//   - Elmas: %1-%4 arası, hisse senedi: %1-%9 arası — İKİSİ DE hâlâ
//     tamamen rastgele (kullanıcı isteği: "şimdilik hisse senedi ve
//     elmasa dokunmayalım").
//   - Kripto: YÖN artık gerçek oyuncu alış/satış davranışına bağlı (bkz.
//     computeWeightedCryptoBuyRatio), miktar hâlâ %1-%20 artış / %1-%16
//     düşüş aralığından rastgele seçiliyor.
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

    // YENİ SİSTEM: kripto fiyatının YÖNÜ artık coin-flip değil, gerçek
    // oyuncu alış/satış davranışından hesaplanan olasılıkla belirleniyor
    // (bkz. computeWeightedCryptoBuyRatio — o fonksiyon ARTIK hem "en
    // büyük alıcı/satıcının payını çıkarma" mekanizmasını HEM DE zaman
    // ağırlığını uyguluyor; ikisi birlikte, iki KATMANLI bir koruma
    // oluşturuyor).
    //
    // 80/20 KURALI (en büyük alıcı/satıcı ÇIKARILDIKTAN SONRA, kalan
    // oyuncuların oranına uygulanır): oran %20-%80 arasında (sınırlar DAHİL)
    // ise doğrudan gerçek oran kullanılır (ör. %70 alış → %70 yükseliş
    // ihtimali). Ancak oran bu sınırın dışına (ör. %81 alış ya da %19
    // alış) çıkarsa sistem TAMAMEN NÖTR olur (%50/%50) — bu sayede toplu/
    // organize bir manipülasyon ("hepimiz alalım, fiyat kesin yükselsin")
    // ne kadar uç bir orana ulaşırsa ulaşsın, sınırı aştığı an kendi
    // amacını boşa çıkarır. EPSILON, %80/%20 sınırındaki kayan noktalı
    // (floating point) yuvarlama hatalarının örnek tablodaki "80/20 →
    // hâlâ yönlü, 81/19 → nötr" davranışını bozmaması için var.
    // Anlamlı işlem yoksa (null), ESKİ sistemdeki gibi %50/%50 tamamen
    // rastgele — bu, yeni sisteme geçişte de (henüz cryptoTrades hiç
    // birikmemişken) otomatik olarak devreye girer, fiyat mevcut
    // değerinden SORUNSUZCA devam eder.
    const cryptoBuyRatio = await computeWeightedCryptoBuyRatio();
    const RATIO_EPSILON = 1e-9;
    const withinEightyTwenty =
      cryptoBuyRatio != null &&
      cryptoBuyRatio >= 0.2 - RATIO_EPSILON &&
      cryptoBuyRatio <= 0.8 + RATIO_EPSILON;
    const cryptoUpProbability = withinEightyTwenty ? cryptoBuyRatio : 0.5;
    const cryptoUp = Math.random() < cryptoUpProbability;
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
      // cryptoUpProbability — sadece teşhis/şeffaflık amaçlı (bkz. madde
      // 3'teki örnek tablo) — hiçbir hesaplamada kullanılmıyor, istenirse
      // ileride oyuncuya "piyasa duyarlılığı" göstergesi olarak sunulabilir.
      cryptoUpProbability: Math.round(cryptoUpProbability * 1000) / 10,
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

    // cryptoTrades temizliği — algoritma sadece son 24 saate bakıyor, 2
    // günden eski kayıtların hiçbir işlevi kalmıyor (küçük bir tampon
    // payıyla saklanıp siliniyor, ileride istenirse ham veri incelemesi
    // için biraz daha uzun tutulabilir).
    const tradesCutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oldTradesSnap = await db
      .collection('cryptoTrades')
      .where('createdAt', '<', tradesCutoff)
      .limit(300)
      .get();
    if (!oldTradesSnap.empty) {
      const tradesCleanupBatch = db.batch();
      oldTradesSnap.forEach((doc) => tradesCleanupBatch.delete(doc.ref));
      await tradesCleanupBatch.commit();
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
    // Malzeme gereksinimi aracın GÜNCEL katalog fiyatıyla doğru orantılı
    // (eski araçlar da fiyat güncellemesinden sonra yeni orana göre
    // hesaplanır — sadece zaten çekilmiş kredi borçları donmuş kalır):
    // 1000₺ araba için 2 malzeme, 100.000₺ araba için 200 malzeme (oran:
    // fiyat/500).
    const livePrice = VEHICLE_CATALOG[vehicle.catalogId]?.price ?? vehicle.baseGalleryValue ?? 0;
    const requiredQty = Math.max(2, Math.round(livePrice / 500));
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
// GÜNCEL katalog fiyatı — eski araçlar da yeni fiyata göre hesaplanır,
// silahta basePrice) — silah geliştirmeyle aynı oran.
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
    const price =
      itemType === 'vehicle'
        ? VEHICLE_CATALOG[item.catalogId]?.price ?? item.baseGalleryValue ?? 0
        : item.basePrice || 0;
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
// ---------------------------------------------------------------------------
// depositToBank / withdrawFromBank — altın ↔ banka bakiyesi.
// Bakiye, dailyReset tarafından her gün %1 faiz kazanır.
//
// bankCostBasis — kâr/zarar rozetinin (PnlBadge) sıfır noktası. Kullanıcı
// revizesi: "bir para yatırdığımızda/çektiğimizde (kısmi bile olsa) sayaç
// SIFIRLANSIN, biz dokunmadığımız sürece (yani sadece günlük faiz
// işlerken) aradaki değişimi göstersin." Bu yüzden costBasis'i
// BİRİKTİRMİYORUZ — her yatırma/çekme işleminde İŞLEM SONRASI bakiyeye
// EŞİTLİYORUZ. Faiz cron'u bu alana hiç dokunmaz, o yüzden iki işlem
// arası % değişim tam olarak "kazandığın faiz" olur.
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
    const newBalance = (user.bankBalance || 0) + amt;
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-amt),
      bankBalance: admin.firestore.FieldValue.increment(amt),
      bankCostBasis: newBalance,
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
    const newBalance = (user.bankBalance || 0) - amt;
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(amt),
      bankBalance: admin.firestore.FieldValue.increment(-amt),
      // Kısmi çekimde de sıfırlanır (kullanıcı isteği) — kalan bakiye
      // "az önce yeniden yatırılmış" gibi davranır. Bakiye tamamen
      // boşaldıysa zaten 0 olur.
      bankCostBasis: newBalance,
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
  // cryptoTrades — YENİ İSTEK (kripto fiyat sistemi yeniden tasarımı):
  // KR fiyatının yönünü artık algoritma rastgele değil, oyuncuların
  // GERÇEK alış/satış işlemleri belirliyor (bkz. hourlyInvestmentUpdate
  // içindeki computeWeightedCryptoBuyRatio). Bunun için her KR alım/
  // satımı burada kalıcı olarak kaydediliyor — SADECE kripto için (elmas/
  // hisse senedi şimdilik eskisi gibi tamamen rastgele kalıyor). Ağırlık
  // hesaplamasında ALTIN tutarı değil, alınan/satılan KR MİKTARI (units)
  // kullanılıyor (kullanıcı isteği: "harcanan ya da kazanılan altın
  // miktarı değil alınan ve satılan kripto miktarı hesaplanacak").
  const tradeRef = assetType === 'crypto' ? db.collection('cryptoTrades').doc() : null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const user = snap.data();
    if (!user || (user.gold || 0) < goldAmount) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    const newHoldings = (user[holdingsField] || 0) + units;
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-goldAmount),
      [holdingsField]: admin.firestore.FieldValue.increment(units),
      // costBasis'i BİRİKTİRMİYORUZ — her alımda GÜNCEL fiyattan
      // sıfırdan set ediyoruz ki kâr/zarar rozeti "en son alım/satımdan
      // beri piyasa ne kadar hareket etti"yi göstersin (kullanıcı
      // isteği: her ekleme/çıkarmada sayaç sıfırlansın).
      [costBasisField]: newHoldings * unitPrice,
    });
    if (tradeRef) {
      tx.set(tradeRef, {
        uid,
        type: 'buy',
        krAmount: units,
        goldAmount,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
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
  // SATIŞ KOMİSYONU — YENİ İSTEK (kripto fiyat sistemi yeniden tasarımı):
  // KR satışında %1 komisyon (alışta YOK) — ekonomiye geri dönmeyen
  // gerçek bir para sink'i, oyuncuya NET tutar (komisyon düşülmüş)
  // ödenir. Elmas/hisse senedinde şimdilik komisyon YOK — kullanıcı:
  // "şimdilik hisse senedi ve elmasa dokunmayalım, sadece kripto için bu
  // yeniliği yapacağız."
  const SELL_COMMISSION_RATE = assetType === 'crypto' ? 0.01 : 0;

  const userRef = db.collection('users').doc(uid);
  // cryptoTrades — bkz. buyInvestment'taki AYNI yorum. Ağırlıklandırma
  // ALTIN değil KR MİKTARI (units) üzerinden yapılacağı için `krAmount`
  // burada da satılan gerçek KR adedi.
  const tradeRef = assetType === 'crypto' ? db.collection('cryptoTrades').doc() : null;
  let totalValue = 0;
  let grossValue = 0;
  let commission = 0;

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
    grossValue = Math.floor(units * unitPrice);
    commission = Math.round(grossValue * SELL_COMMISSION_RATE);
    totalValue = grossValue - commission;
    const remaining = have - units;

    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(totalValue),
      [holdingsField]: admin.firestore.FieldValue.increment(-units),
      // Kısmi satışta da sıfırlanır (kullanıcı isteği) — kalan pozisyon
      // "az önce güncel fiyattan yeniden alınmış" gibi davranır.
      [costBasisField]: remaining > 1e-9 ? remaining * unitPrice : 0,
    });
    if (tradeRef && units > 0) {
      tx.set(tradeRef, {
        uid,
        type: 'sell',
        krAmount: units,
        goldAmount: totalValue,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true, unitPrice, totalValue, grossValue, commission };
});

// =============================================================================
// BANKA KREDİSİ — ARAÇ İPOTEĞİ (Bölüm 8.4)
// =============================================================================
//
// - Kredi limiti = aracın GÜNCEL katalog fiyatı (VEHICLE_CATALOG'dan canlı
//   okunur — fiyat güncellemesi eski araçlara da anında yansır, ama zaten
//   çekilmiş bir kredinin borcu asla değişmez çünkü loanPrincipal/
//   loanTotalOwed kredi ANINDA dondurularak araç belgesine yazılır) —
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

    const principal = VEHICLE_CATALOG[vehicle.catalogId]?.price ?? vehicle.baseGalleryValue;
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
// bir temizlik işine gerek yok. Zengin oyuncular (toplam serveti 20.000
// altını aşanlar) dilenci olamaz. Günde en fazla 10.000 altın kazanılabilir
// — bu sınıra ulaşınca dilenci listeden otomatik kaldırılır ve o gün
// tekrar dilenci olamaz. Tek bir bağışçı, tek seferde en fazla 10.000
// altın gönderebilir (BEGGAR_MAX_SINGLE_DONATION).
// ---------------------------------------------------------------------------
const BEGGAR_WEALTH_LIMIT = 20000;
const BEGGAR_DAILY_EARN_CAP = 10000;
const BEGGAR_MAX_SINGLE_DONATION = 10000;

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
// 20.000 altın (manuel alınır, polis maaşı gibi). Görevler: günde 5 vakit
// ibadet + günde en az 1 nasihat — bunlardan biri eksikse dailyReset
// tarafından imamlıktan atılır (bkz. dailyReset).
// ---------------------------------------------------------------------------
const IMAM_SALARY = 20000;
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
  if (amount > BEGGAR_MAX_SINGLE_DONATION) {
    throw new HttpsError(
      'invalid-argument',
      `Tek seferde en fazla ${BEGGAR_MAX_SINGLE_DONATION.toLocaleString('tr-TR')} altın gönderebilirsin.`
    );
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
//     riski mevcut şüpheye bağlı: yakalanma ihtimali = şüphe yüzdesi
//     (taban %1 — bkz. captureRiskPercent). Şüphen 0 olsa bile en az
//     %1 yakalanma riskin vardır.
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

// captureRiskPercent — yakalanma ihtimalini şüphe yüzdesi olarak hesaplar.
// YENİ KURAL (kullanıcı isteği): şüphesi %0 olan bir oyuncunun bile en az
// %1 yakalanma riski olacak — diğer hiçbir şey değişmiyor, sadece 0'da
// (ve normalde 1'in altında kalacak her değerde) taban %1'e çekiliyor.
// Aynı "yakalanma ihtimali = şüphe %'si" formülü şüphenin geçerli olduğu
// HER yerde kullanılıyor (tek başına soygun, ekip soygunu, Park'ta
// yasaklı madde satışı) — tutarlılık için hepsi bu helper'dan geçiyor.
function captureRiskPercent(suspicion) {
  return Math.max(1, suspicion || 0);
}

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
    const caught = Math.random() < captureRiskPercent(suspicion) / 100;
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
// yakalanma riski var (şüphe %40 ise %40 ihtimalle yakalanırsın), taban
// %1 — şüphen %0 olsa bile en az %1 yakalanma riskin var (bkz.
// captureRiskPercent).
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
    const caught = Math.random() * 100 < captureRiskPercent(currentSuspicion);
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
// PARK DÜNYASI — gezilebilir Park sahnesi (Bölüm 6 genişletmesi).
//
// Tasarım notu: oyuncunun anlık (x,y) konumu, yönü ve elindeki ürün gibi
// alanlar EKONOMİYE dokunmuyor (altın/envanter yok) — sadece görsel/konum
// verisi. Her hareket karesinde bir Cloud Function çağırmak (100-300ms
// gecikme + soğuk başlatma) akıcı bir hareket için pratik değil, bu
// yüzden bu VERİ TÜRÜ İÇİN İSTİSNAİ olarak istemcinin doğrudan Firestore
// yazması firestore.rules'ta serbest bırakıldı — ama SADECE konum/pose/
// elde-tutulan/sohbet alanları için. displayName ve avatar ise, ekranda
// dangerouslySetInnerHTML ile ham SVG'ye gömüldüğü için (bkz. istemci
// avatarShapes.js) enjeksiyon riski taşır; bu yüzden BUNLAR sadece bu
// enterPark fonksiyonu tarafından, users/{uid} içindeki ZATEN
// doğrulanmış veriden kopyalanarak yazılabilir. firestore.rules,
// istemcinin sonraki (doğrudan) güncellemelerinde avatar/displayName'i
// DEĞİŞTİREMEYECEĞİNİ ayrıca garanti eder (bkz. kural dosyası).
// ---------------------------------------------------------------------------

// enterPark — Park dünyasına girişte bir kere çağrılır: mevcut (sunucuda
// doğrulanmış) ad/avatarı canlı-konum dokümanına kopyalar ve başlangıç
// pozisyonunu yazar. Sonraki hareket güncellemeleri istemciden doğrudan
// (bu fonksiyon çağrılmadan) yapılır.
export const enterPark = onCall(async (request) => {
  const uid = requireAuth(request);
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() || {};

  const presence = {
    displayName: user.displayName || 'Oyuncu',
    avatar: user.avatar || null,
    x: 600,
    y: 400,
    facing: 'down',
    pose: 'idle',
    holding: null,
    seat: null,
    chatText: null,
    chatTs: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    enteredAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('parkPresence').doc(uid).set(presence);
  return { ok: true, presence: { x: presence.x, y: presence.y } };
});

// expireParkPresence — 2 dakikadır güncellenmeyen (uygulamayı kapatıp
// leavePark'ı tetikleyemeyen) canlı-konum kayıtlarını siler. İstemci
// tarafında zaten ~20 saniyelik bir eskime filtresi var (bkz.
// useParkPresence) — bu sadece veritabanını uzun vadede temiz tutmak
// için bir arka plan süpürme işlemi.
export const expireParkPresence = onSchedule({ schedule: 'every 5 minutes' }, async () => {
  const TWO_MIN = 2 * 60 * 1000;
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - TWO_MIN);
  // Tüm koleksiyonu çekip istemci tarafında filtrelemek yerine, sadece
  // bayat kayıtları getiren bir sorgu kullanıyoruz — bu, süpürme
  // işleminin okuma maliyetini (dolayısıyla faturayı) önemli ölçüde
  // düşürür (updatedAt üzerinde otomatik tekil alan indeksi yeterli).
  const staleSnap = await db.collection('parkPresence').where('updatedAt', '<', cutoff).get();
  if (!staleSnap.empty) {
    await Promise.all(staleSnap.docs.map((d) => d.ref.delete()));
  }
});

// ---------------------------------------------------------------------------
// GİRİLEBİLİR MEKANLAR (Banka/Karakol/Camii/Gazino) — CANLI/ÇOK OYUNCULU
// (madde 17). Park'takiyle BİREBİR aynı desen — tek fark, hepsi TEK bir
// `interiorPresence` koleksiyonunu `locationId` alanıyla paylaşıyor (her
// mekan için ayrı koleksiyon açmak sadece kod tekrarı olurdu). Kural
// dosyasındaki güven modeli parkPresence ile aynı: konum/poz/sohbet gibi
// ekonomiyle ilgisiz alanlar istemciden doğrudan yazılabilir, avatar/
// displayName SADECE bu fonksiyon tarafından users/{uid}'den kopyalanır.
// ---------------------------------------------------------------------------
const INTERIOR_START_POS = {
  banka: { x: 340, y: 990 },
  karakol: { x: 340, y: 990 },
  camii: { x: 340, y: 990 },
  gazino: { x: 340, y: 990 },
  // Araba Galerisi / Silah Mağazası / Modifiye Garajı — 3 yeni girilebilir
  // mekan (bkz. yeni 3 mekan talebi). Diğerleriyle BİREBİR aynı kapı/spawn
  // noktası; her üç WorldScreen bileşeni de aynı START_POS sabitini
  // kullanıyor (bkz. ilgili .jsx dosyaları).
  araba_galerisi: { x: 340, y: 990 },
  silah_magazasi: { x: 340, y: 990 },
  modifiye_garaji: { x: 340, y: 990 },
};

// enterInterior — bir girilebilir mekana girişte bir kere çağrılır (bkz.
// enterPark üstündeki not, aynı gerekçe). locationId sunucu tarafında
// allowlist'e karşı doğrulanır.
export const enterInterior = onCall(async (request) => {
  const uid = requireAuth(request);
  const { locationId } = request.data || {};
  const start = INTERIOR_START_POS[locationId];
  if (!start) {
    throw new HttpsError('invalid-argument', 'Geçersiz mekan.');
  }
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() || {};

  const presence = {
    locationId,
    displayName: user.displayName || 'Oyuncu',
    avatar: user.avatar || null,
    x: start.x,
    y: start.y,
    facing: 'down',
    pose: 'idle',
    holding: null,
    seat: null,
    chatText: null,
    chatTs: null,
    // activity — baştan null olarak yazılıyor ki firestore.rules'taki
    // validInteriorPresenceFields alan hiç yokken değil, HER ZAMAN mevcut
    // (ama null) bir alan olarak kontrol edebilsin (bkz. rules'taki not).
    activity: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    enteredAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('interiorPresence').doc(uid).set(presence);
  return { ok: true, presence: { x: presence.x, y: presence.y } };
});

// expireInteriorPresence — expireParkPresence ile aynı gerekçe/mantık,
// sadece interiorPresence koleksiyonu için.
export const expireInteriorPresence = onSchedule({ schedule: 'every 5 minutes' }, async () => {
  const TWO_MIN = 2 * 60 * 1000;
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - TWO_MIN);
  const staleSnap = await db.collection('interiorPresence').where('updatedAt', '<', cutoff).get();
  if (!staleSnap.empty) {
    await Promise.all(staleSnap.docs.map((d) => d.ref.delete()));
  }
});

// ---------------------------------------------------------------------------
// buyFromBufe — Park'taki büfeden içecek/atıştırmalık satın alma.
// Ekonomiye dokunduğu (altın harcanıyor) için, tüm diğer satın alma
// işlemleri gibi bu da Cloud Function üzerinden, transaction'la yapılır.
// ---------------------------------------------------------------------------
const BUFE_PRICES = {
  sosisli: 100,
  tost: 100,
  cay: 10,
  kahve: 30,
  oralet: 20,
  latte: 500,
};

export const buyFromBufe = onCall(async (request) => {
  const uid = requireAuth(request);
  const itemId = request.data?.itemId;
  const price = BUFE_PRICES[itemId];
  if (!price) {
    throw new HttpsError('invalid-argument', 'Geçersiz büfe ürünü.');
  }

  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user || (user.gold || 0) < price) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-price) });
  });

  return { ok: true, itemId, price };
});

// ---------------------------------------------------------------------------
// buyFromGazinoBar — Gazino'daki bardan içecek satın alma. buyFromBufe ile
// AYNI yapı (transaction'la altın düşme) — tek fark kendi fiyat listesi
// (Gazino barı Park büfesinden farklı fiyatlandırılıyor, bkz. kullanıcı
// isteği: çay 20, kahve 50, kokteyl 500).
// ---------------------------------------------------------------------------
const GAZINO_BAR_PRICES = {
  cay: 20,
  kahve: 50,
  kokteyl: 500,
};

export const buyFromGazinoBar = onCall(async (request) => {
  const uid = requireAuth(request);
  const itemId = request.data?.itemId;
  const price = GAZINO_BAR_PRICES[itemId];
  if (!price) {
    throw new HttpsError('invalid-argument', 'Geçersiz bar ürünü.');
  }

  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.data();
    if (!user || (user.gold || 0) < price) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-price) });
  });

  return { ok: true, itemId, price };
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
  // ihtimali = o kişinin şüphe %'si, taban %1 — şüphesi %0 olan bir
  // katılımcının bile en az %1 yakalanma riski var, bkz.
  // captureRiskPercent). Katılımcılardan BİRİ bile böyle yakalanırsa TÜM
  // soygun şüpheden dolayı başarısız sayılır — bu durumda ekipte sızmış
  // bir polis olsa BİLE o ödül ALAMAZ (yakalanma sebebi polis işi değil,
  // şüphe olduğu için).
  const suspicions = userSnaps.map((s) => s.data()?.suspicion || 0);
  const caughtBySuspicion = suspicions.some((s) => Math.random() * 100 < captureRiskPercent(s));
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
  shoeStyle: ['klasik', 'spor', 'bot', 'sandalet'],
};
const AVATAR_COLOR_FIELDS = [
  'skin', 'eyeColor', 'hairColor', 'clothColor', 'hatColor', 'lipColor', 'background',
  'pantsColor', 'shoeColor',
];
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
    // DÜZELTME (yeni istek): kripto (mining) makineleri artık oyuncular
    // arası 2. el listeye ÇIKARILAMAZ — sadece "anında sat" (bkz.
    // instantSellListing) mümkün. Sebep: az makineli bir hesaptan çok
    // makineli bir hesaba ucuza kripto makinesi transferi, madde 2'deki
    // (miningMachinePrice) makine-sayısına-göre-artan fiyat kademesini
    // bypass ederdi — büyük hesaplar küçük hesaplardan ucuza makine
    // toplayıp kendi kademe fiyatını asla ödemezdi.
    if (preMachineType === 'mining') {
      throw new HttpsError(
        'failed-precondition',
        'Kripto (mining) makineleri 2. el satışa çıkarılamaz — sadece "Anında Sat" ile satabilirsin.'
      );
    }
    // preMachineType artık burada asla 'mining' olamaz (yukarıda reddedildi).
    const base = MACHINE_TYPES[preMachineType].price;
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
    const isMiningMachine = mType === 'mining';
    // Kripto (mining) makinesi için taban BİLEREK SABİT tutuluyor:
    // miningMachinePrice() argümansız çağrılınca her zaman taban kademeyi
    // (2×KR fiyatı) döner, /2 = 1×KR fiyatı — YENİ İSTEK: "sadece 1 kripto
    // fiyatına anında satabileceksin", makine sayısı/kademeden bağımsız,
    // her zaman sabit 1×KR fiyatı.
    const base = isMiningMachine ? await miningMachinePrice() : MACHINE_TYPES[mType].price;
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
      // YENİ İSTEK: kripto makineleri anında satıldığında (diğer araç/
      // silah/makine türlerinin aksine) sistem tarafından TEKRAR satışa
      // ÇIKARILMAZ — "anında satılanlar da oyundan silinecek". Başka bir
      // oyuncunun bu makineyi (kademe fiyatını ödemeden) devralması
      // mümkün olmasın diye bilerek burada listing OLUŞTURULMUYOR.
      if (!isMiningMachine) {
        tx.set(listingRef, {
          sellerId: 'system',
          sellerName: 'Sistem',
          itemType,
          machineType: m.type,
          price: Math.ceil(minPrice * 1.1),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sold: false,
        });
      }
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
      // Güvenlik ağı: kripto (mining) makineleri artık HİÇBİR şekilde 2.
      // el olarak satın alınamaz (bkz. createListing/instantSellListing'
      // deki değişiklikler — artık böyle bir ilan hiç oluşturulmuyor).
      // Yine de eski/olası bir ilan varsa burada da reddediliyor.
      if (listing.machineType === 'mining') {
        throw new HttpsError(
          'failed-precondition',
          'Kripto (mining) makineleri artık 2. el satın alınamaz.'
        );
      }
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
    // updatedAt — yeni istek: "içinde oyuncu olmayan masalar kapansın" —
    // her masa yazısında bu alan tazelenir, expireOnNumaraTables (aşağıda)
    // uzun süre hiç yazı almamış (terk edilmiş) masaları kapatır.
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (newSeatOrder.length === 0) {
      // Masada kimse kalmadı — "Açık Masalar"dan kaybolsun (yeni istek:
      // "biz masadaki son kişiysek masa direkt kapansın" — bu ANINDA olur,
      // beklemeye gerek yok).
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
    .update({
      [`reactions.${uid}`]: { emoji, at: Date.now() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
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
  const patch = { [`lastPing.${uid}`]: Date.now() };
  // onNumaraTables için updatedAt'i de tazeliyoruz — expireOnNumaraTables
  // (aşağıda) hâlâ oynanan ama başka hiçbir alanı değişmeyen masaları
  // yanlışlıkla "terk edilmiş" sanıp kapatmasın diye.
  if (collectionName === 'onNumaraTables') {
    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await db.collection(collectionName).doc(docId).update(patch);
  return { ok: true };
});

// expireOnNumaraTables — yeni istek: "içinde oyuncu olmayan / terk edilmiş
// masalar kapansın". Normal akışta masa zaten leaveOnNumaraTable içinde
// ANINDA kapanıyor (son oyuncu ayrılınca) — bu sadece tarayıcı sekmesi
// kapatılıp leaveOnNumaraTable'ın hiç çağrılamadığı durumlar için bir arka
// plan güvenlik ağı (bkz. expireRaceRooms/expireHeistPlans ile AYNI desen).
// Tek eşitlik filtresiyle (status) tüm açık masaları çekip zaman
// karşılaştırmasını JS tarafında yapıyoruz — composite index gerekmez.
export const expireOnNumaraTables = onSchedule({ schedule: 'every 5 minutes' }, async () => {
  const now = Date.now();
  const STALE_MS = 10 * 60 * 1000; // 10 dakikadır hiç hareket olmayan masa = terk edilmiş.
  const openSnap = await db.collection('onNumaraTables').where('status', '==', 'open').get();
  const batch = db.batch();
  let any = false;
  openSnap.forEach((doc) => {
    const d = doc.data();
    // updatedAt her yazıda tazelenir; eski (bu değişiklikten önce açılmış)
    // kayıtlarda hiç yoksa createdAt'e düşüyoruz.
    const lastActivityMs = d.updatedAt?.toMillis?.() ?? d.createdAt?.toMillis?.() ?? 0;
    if (!(d.seatOrder?.length > 0) || (lastActivityMs && now - lastActivityMs >= STALE_MS)) {
      batch.update(doc.ref, { status: 'closed' });
      any = true;
    }
  });
  if (any) await batch.commit();
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

// --- Futbol modülü: Stadyum (kapasite merdiveni + bilet fiyatı) ---
// Kapasite yükseltme merdiveni SUNUCU TARAFINDA tutulur — istemci bir
// sonraki seviyeyi (ve maliyetini) görebilir ama TÜM merdiveni göremez
// (ürün kararı: oyuncu ileriki seviyeleri önceden görmemeli).
// Yeni istek: "stadyum kapasite yükseltme fiyatlarını 2 katına çıkartalım"
// — tüm maliyetler (0 hariç) bir önceki (yarıya düşürülmüş) sürümün 2 katı.
const FUTBOL_STADIUM_LADDER = [
  { capacity: 2500, cost: 0 },
  { capacity: 5000, cost: 1000000 },
  { capacity: 10000, cost: 2000000 },
  { capacity: 20000, cost: 4000000 },
  { capacity: 40000, cost: 8000000 },
  { capacity: 75000, cost: 16000000 },
  { capacity: 150000, cost: 32000000 },
  { capacity: 250000, cost: 75000000 },
  { capacity: 500000, cost: 150000000 },
];
const FUTBOL_DEFAULT_TICKET_PRICE = 10;
const FUTBOL_MIN_TICKET_PRICE = 1;
const FUTBOL_MAX_TICKET_PRICE = 20;

// futbolStadiumAttendance — bilet fiyatına göre maça gelecek taraftar
// sayısı: fans/ticketPrice, stadyum kapasitesiyle sınırlı.
function futbolStadiumAttendance(fans, ticketPrice, stadiumCapacity) {
  return Math.min(stadiumCapacity, Math.floor((fans || 0) / (ticketPrice || FUTBOL_DEFAULT_TICKET_PRICE)));
}

// futbolTicketPriceFanEffect — bilet fiyatının taraftar memnuniyeti
// üzerindeki etkisi (kazanç/kayıp mekaniğinden BAĞIMSIZ, her ev sahibi
// maçında uygulanır). Yeni istek ile NÖTR BAND artık 9-10-11 (tek bir
// nokta değil): bu üç fiyattan hiçbiri taraftar artırmaz/azaltmaz.
// Bandın dışında, kullanıcının verdiği çapa noktalarından (12→1-1000,
// 15→1-4000, 20→1-9000 kayıp; 8→1-1000, 1→1-8000 kazanç) TAMAMEN
// DOĞRUSAL (linear) bir oran çıkıyor — her iki yönde de nötr sınırdan
// (11 ya da 9) 1 birim uzaklaşınca azami etki 1000 artıyor:
//   maxLoss(fiyat) = (fiyat - 11) * 1000   [fiyat > 11]
//   maxGain(fiyat) = (9 - fiyat) * 1000    [fiyat < 9]
// Doğrulama: 12→1000, 15→4000, 20→9000 ✓ · 8→1000, 1→8000 ✓
function futbolTicketPriceFanDelta(ticketPrice) {
  if (ticketPrice >= 9 && ticketPrice <= 11) return 0;
  if (ticketPrice > 11) {
    const maxLoss = (ticketPrice - 11) * 1000;
    return -Math.floor(randomInRange(1, maxLoss));
  }
  const maxGain = (9 - ticketPrice) * 1000;
  return Math.floor(randomInRange(1, maxGain));
}

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
        stadiumCapacity: FUTBOL_STADIUM_LADDER[0].capacity,
        ticketPrice: FUTBOL_DEFAULT_TICKET_PRICE,
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

// FUTBOL_MUCADELE_LEVELS — yeni istek: "kadro > taktiğin altına mücadele
// kısmı koyalım (Dikkatli/Normal/Agresif/Çok Agresif)". Sadece OYUNCU
// SAHİPLİ takımlarda geçerli (botlar hep 'normal', hiç sakatlanmaz —
// bkz. applyFutbolMatchResult'taki isBot kontrolü). injuryMult sakatlanma
// olasılığına, formLossMult maçtan sonraki form kaybına, powerMult o
// maçtaki oyuncu gücüne uygulanır.
const FUTBOL_MUCADELE_LEVELS = {
  dikkatli: { injuryMult: 0.5, formLossMult: 0.5, powerMult: 0.95 },
  normal: { injuryMult: 1, formLossMult: 1, powerMult: 1 },
  agresif: { injuryMult: 1.5, formLossMult: 1.5, powerMult: 1.05 },
  cok_agresif: { injuryMult: 2, formLossMult: 2, powerMult: 1.1 },
};
const FUTBOL_MUCADELE_DEFAULT = 'normal';
function futbolMucadeleConfig(team) {
  const key = FUTBOL_MUCADELE_LEVELS[team?.mucadele] ? team.mucadele : FUTBOL_MUCADELE_DEFAULT;
  return FUTBOL_MUCADELE_LEVELS[key];
}

// FUTBOL_INJURY — yeni istek: "her maçta 16-19 yaş arasında olan
// oyuncular %2, 20-29 arası %4, 30-35 arası %6 sakatlanma riski,
// sakatlanan oyuncu 1-5 maçlığına sakatlansın" (madde 3'te "30-35"
// olarak netleştirildi). SADECE oyuncu sahipli takımların o maçta
// SAHAYA ÇIKAN 6 kişisi bu riski taşır (bkz. applyFutbolMatchResult).
const FUTBOL_DOCTOR_COST = 5000;
function futbolInjuryChance(age) {
  if (age <= 19) return 0.02;
  if (age <= 29) return 0.04;
  return 0.06; // 30-35
}
function rollFutbolInjuryDays(age, mucadeleMult) {
  const chance = futbolInjuryChance(age) * mucadeleMult;
  if (Math.random() >= chance) return 0;
  return Math.floor(randomInRange(1, 6)); // 1-5 gün (randomInRange üst sınırı hariç tutuyor, bkz. tanımı)
}
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

function futbolLinePowers(selectedPlayers, isHome, tactic, mucadelePowerMult = 1) {
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
  // Mücadele — yeni istek: "Agresif ... tüm oyuncuların gücü o maçta %5
  // daha yüksek olacak", "Çok agresif ... %10 daha yüksek", "Dikkatli ...
  // güçler %5 daha düşük olacak". Tüm mevkilere eşit uygulanır (taktikten
  // farklı olarak mevkiye özel değil). Botlar hep 1 (normal) kullanır.
  if (mucadelePowerMult !== 1) {
    for (const key of Object.keys(lines)) lines[key] *= mucadelePowerMult;
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
// formationFullyFieldable — bir dizilimin (need) SAĞLIKLI (sakat olmayan)
// oyuncu havuzuyla TAM doldurulup doldurulamayacağını kontrol eder — yeni
// istek: "kadro 2-2-1 olmazsa 1-2-2 denensin ... tüm dizilimler denensin,
// herhangi biriyle maça çıkabiliyorsa çıkılsın".
function formationFullyFieldable(playersByPosition, need) {
  return Object.keys(need).every((pos) => (playersByPosition[pos]?.length || 0) >= need[pos]);
}

function resolveFutbolTeamLineup(team, players) {
  const byId = {};
  players.forEach((p) => (byId[p.id] = p));
  const formationKey = FUTBOL_FORMATIONS[team.formation] ? team.formation : null;
  const manualIds = Array.isArray(team.lineup) ? team.lineup : null;
  const mucadeleConfig = futbolMucadeleConfig(team);

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
    // Yeni istek: sakat oyuncu KESİNLİKLE sahaya çıkamaz — manuel kadroda
    // sakat biri varsa (form<50 ile AYNI şekilde) otomatiğe düşülür.
    const anyInjured = manualPlayers.some((p) => (p.injuryDaysLeft || 0) > 0);

    if (allStillOnRoster && shapeOk && !anyLowForm && !anyInjured) {
      const selectedSet = new Set(manualIds);
      return {
        selected: manualPlayers,
        bench: players.filter((p) => !selectedSet.has(p.id)),
        tactic: FUTBOL_TACTICS.includes(team.tactic) ? team.tactic : 'dengeli',
        mucadeleConfig,
      };
    }
  }

  // Otomatik dizilim — yeni istek: sakat oyuncular havuzdan TAMAMEN
  // çıkarılır (form<50 gibi sadece düşük öncelikli değil, kesin dışlanır),
  // sonra dizilimler sırayla (önce takımın kendi seçtiği, sonra varsayılan
  // 2-2-1, sonra kalan tüm dizilimler) denenir; SAĞLIKLI oyuncularla TAM
  // doldurulabilen İLK dizilim seçilir. Hiçbiri tam dolmuyorsa (normalde bu
  // noktaya gelinmeden ÖNCE takım günlük taramada bota devredilmiş olur —
  // bkz. dailySweepUnfieldableFutbolTeams) en iyi çabayla varsayılan
  // dizilimle devam edilir (eksik kalabilir, sahaya 6'dan az çıkabilir).
  const healthyPlayers = players.filter((p) => !((p.injuryDaysLeft || 0) > 0));
  const healthyByPos = groupFutbolPlayersByPositionArr(healthyPlayers);
  const formationOrder = [];
  if (formationKey) formationOrder.push(formationKey);
  Object.keys(FUTBOL_FORMATIONS).forEach((k) => {
    if (!formationOrder.includes(k)) formationOrder.push(k);
  });
  let chosenNeed = FUTBOL_DEFAULT_FORMATION;
  for (const key of formationOrder) {
    if (formationFullyFieldable(healthyByPos, FUTBOL_FORMATIONS[key])) {
      chosenNeed = FUTBOL_FORMATIONS[key];
      break;
    }
  }
  const auto = pickFutbolLineup(healthyByPos, chosenNeed);
  // Bench, TÜM kadroyu (sakatlar dahil) yansıtsın diye healthyPlayers değil
  // orijinal `players`den, seçilenler çıkarılarak hesaplanıyor — sakat
  // oyuncular sahaya çıkamaz ama hâlâ takımın bir parçası, "yedek" listesinde
  // görünmeye devam etmeli (maç kaydında/istemcide gösterim için).
  const selectedIds = new Set(auto.selected.map((p) => p.id));
  return {
    selected: auto.selected,
    bench: players.filter((p) => !selectedIds.has(p.id)),
    tactic: 'dengeli',
    mucadeleConfig,
  };
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
  const homeLines = futbolLinePowers(homeResolved.selected, true, homeResolved.tactic, homeResolved.mucadeleConfig.powerMult);
  const awayLines = futbolLinePowers(awayResolved.selected, false, awayResolved.tactic, awayResolved.mucadeleConfig.powerMult);
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
  // inmez), beraberlikte değişmez. Ev sahibinin taraftar sayısı ayrıca
  // aşağıda bilet fiyatı memnuniyet etkisiyle birleştirilip TEK bir
  // yazımla uygulanacağı için, burada deplasman takımının yazımı
  // doğrudan yapılıyor, ev sahibinin bu maçtaki galibiyet/mağlubiyet
  // katkısı ise bir değişkende tutulup aşağıda toplanıyor.
  let homeFanResultDelta = 0;
  if (homeScore !== awayScore) {
    const fanDelta = Math.floor(randomInRange(1, 10000));
    const homeWon = homeScore > awayScore;
    if (homeWon) {
      homeFanResultDelta = fanDelta;
      const awayFansBefore = awayTeamSnap.data().fans || 0;
      batch.update(db.collection('futbolTeams').doc(match.awayTeamId), {
        fans: Math.max(0, awayFansBefore - fanDelta),
      });
    } else {
      homeFanResultDelta = -fanDelta;
      batch.update(db.collection('futbolTeams').doc(match.awayTeamId), {
        fans: admin.firestore.FieldValue.increment(fanDelta),
      });
    }
  }

  // Stadyum — ev sahibinin bilet geliri: seyirci sayısı (taraftar/bilet
  // fiyatı, kapasiteyle sınırlı) çarpı bilet fiyatı. Bilet fiyatı 10
  // (nötr) iken ve kapasite yeterliyken bu, ESKİ düz "taraftar = altın"
  // formülüyle AYNI sonucu verir (10 taraftardan 1'i x 10 altın bilet =
  // yine taraftar sayısı kadar altın) — kapasite dolduğunda ya da
  // yuvarlamadan dolayı ayrışır, bu beklenen davranış. Gelir, maçın
  // başındaki (bu maçın etkilerinden ÖNCEKİ) taraftar sayısı ve o anki
  // bilet fiyatı/kapasite üzerinden hesaplanır.
  const homeOwnerUid = homeTeamSnap.data().ownerUid;
  const homeFansBefore = homeTeamSnap.data().fans || 0;
  const homeTicketPrice = homeTeamSnap.data().ticketPrice || FUTBOL_DEFAULT_TICKET_PRICE;
  const homeStadiumCapacity = homeTeamSnap.data().stadiumCapacity || FUTBOL_STADIUM_LADDER[0].capacity;
  const homeAttendance = futbolStadiumAttendance(homeFansBefore, homeTicketPrice, homeStadiumCapacity);
  const ticketRevenue = homeAttendance * homeTicketPrice;
  let fanGoldEarned = 0;
  if (homeOwnerUid) {
    fanGoldEarned = ticketRevenue;
    batch.update(db.collection('users').doc(homeOwnerUid), {
      gold: admin.firestore.FieldValue.increment(ticketRevenue),
    });
  }

  // Bilet fiyatı taraftar memnuniyeti — kazanç/kayıp mekaniğinden BAĞIMSIZ,
  // her ev sahibi maçında (galibiyet/beraberlik/mağlubiyet fark etmez)
  // uygulanır. 10 altın nötr; üstünde taraftar kızar (kaybeder), altında
  // memnun olur (kazanır). Bu maçın galibiyet/mağlubiyet katkısıyla
  // birlikte TEK bir yazımla (0'ın altına inmeyecek şekilde) uygulanır.
  const homeFanSatisfactionDelta = futbolTicketPriceFanDelta(homeTicketPrice);
  batch.update(db.collection('futbolTeams').doc(match.homeTeamId), {
    fans: Math.max(0, homeFansBefore + homeFanResultDelta + homeFanSatisfactionDelta),
  });

  // Oyuncu gelişimi: sahaya çıkanlar 0.1-2.0 güç kazanır + (mücadele
  // seviyesine göre ölçeklenen) yaşı kadar form kaybeder; yedekler formu
  // +50 kazanır (100'ü geçmez). Ayrıca — yeni istek: SADECE oyuncu sahipli
  // takımların (botlar hariç) sahaya çıkan 6 kişisi, yaşa ve mücadele
  // seviyesine göre sakatlanma riski taşır (16-19: %2, 20-29: %4, 30-35:
  // %6, mücadeleye göre 0.5x/1x/1.5x/2x çarpılır). Sakatlanan oyuncu
  // 1-5 gün (00:00'da her gece kendiliğinden azalan) sahaya çıkamaz/
  // antrenmana giremez — bkz. resolveFutbolTeamLineup ve addFutbolTraining.
  const homeLineupSet = new Set(match.homeLineupIds || []);
  const awayLineupSet = new Set(match.awayLineupIds || []);
  const homeMucadele = futbolMucadeleConfig(homeTeamSnap.data());
  const awayMucadele = futbolMucadeleConfig(awayTeamSnap.data());
  const injuredThisMatchByTeam = new Map(); // teamId -> [playerName, ...]
  const applyPlayerUpdates = (snap, lineupSet, teamId, mucadele, isBot) => {
    snap.docs.forEach((d) => {
      const p = d.data();
      if (lineupSet.has(d.id)) {
        const gain = Math.round(randomInRange(0.1, 2.0) * 10) / 10;
        const updates = {
          power: Math.round((p.power + gain) * 10) / 10,
          form: Math.max(0, Math.round(p.form - p.age * mucadele.formLossMult)),
        };
        if (!isBot) {
          const days = rollFutbolInjuryDays(p.age, mucadele.injuryMult);
          if (days > 0) {
            updates.injuryDaysLeft = days;
            if (!injuredThisMatchByTeam.has(teamId)) injuredThisMatchByTeam.set(teamId, []);
            injuredThisMatchByTeam.get(teamId).push(p.name);
          }
        }
        batch.update(d.ref, updates);
        // "Gelişimler" ekranı için: bu maçta gelişim yaşayan oyuncuyu
        // kısa bir günlük kaydına da yazıyoruz.
        logFutbolGrowth(batch, { teamId, playerId: d.id, playerName: p.name, amount: gain, type: 'mac' });
      } else {
        batch.update(d.ref, { form: Math.min(100, p.form + 50) });
      }
    });
  };
  applyPlayerUpdates(homePlayersSnap, homeLineupSet, match.homeTeamId, homeMucadele, homeTeamSnap.data().isBot);
  applyPlayerUpdates(awayPlayersSnap, awayLineupSet, match.awayTeamId, awayMucadele, awayTeamSnap.data().isBot);

  // SMS — takım sahiplerine maç sonucu (+ ev sahibiyse bilet geliri, +
  // varsa bu maçta sakatlanan oyuncuların isimleri).
  const outcomeText = (myScore, oppScore) =>
    myScore > oppScore ? 'kazandı' : myScore < oppScore ? 'kaybetti' : 'berabere kaldı';
  const injuryNote = (teamId) => {
    const names = injuredThisMatchByTeam.get(teamId);
    if (!names || names.length === 0) return '';
    return ` 🚑 Sakatlanan oyuncu(lar): ${names.join(', ')}.`;
  };
  if (homeOwnerUid) {
    let text = `⚽ ${homeName} ${homeScore}-${awayScore} ${awayName} — takımın ${outcomeText(homeScore, awayScore)}.`;
    if (fanGoldEarned > 0) {
      text += ` Stadyumunuza gelen ${homeAttendance.toLocaleString('tr-TR')} taraftardan bilet gelirlerinden ${fanGoldEarned.toLocaleString('tr-TR')} altın kazandınız.`;
    }
    text += injuryNote(match.homeTeamId);
    sendFutbolSms(batch, homeOwnerUid, text, 'futbol_match_result');
  }
  const awayOwnerUid = awayTeamSnap.data().ownerUid;
  if (awayOwnerUid) {
    let text = `⚽ ${homeName} ${homeScore}-${awayScore} ${awayName} — takımın (deplasmanda) ${outcomeText(awayScore, homeScore)}.`;
    text += injuryNote(match.awayTeamId);
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

// =============================================================================
// Kupa Modülü (Neon Kupası) — mevcut lig maç motorunu, sezon sistemini,
// iddaa sistemini DEĞİŞTİRMEDEN üstüne eklenmiştir. Tasarım özeti:
//
//   - futbolSeasonState/current: tüm liglerin ortak "bugün ne oynanıyor"
//     durumu — 'LEAGUE_DAY' | 'CUP_DAY' | 'CELEBRATION_DAY'. Lig turları
//     hâlâ her ligin kendi currentRound'unda ilerliyor (DEĞİŞMEDİ); bu
//     doküman sadece "bugün lig mi, kupa mı, kutlama mı oynanacak" kararını
//     TÜM ligler için merkezi ve tutarlı tutuyor.
//   - Kupa günleri, 1. Lig'in round'u FUTBOL_CUP_TRIGGER_AFTER_ROUND'daki
//     bir eşiğe (3/6/9/12) ulaştığında tetiklenir; o gün TÜM ligler için
//     lig maçı oluşturulmaz (kullanıcı promptu madde 2). Ertesi gün lig
//     kaldığı yerden (currentRound hiç dokunulmamıştı) devam eder.
//   - Sezon bitince (round 14 tamamlanınca) ÖNCE sadece ödül+istatistik
//     dağıtılır ve 1 GÜNLÜK 'CELEBRATION_DAY' başlar (finishFutbolSeasonPart1);
//     puan tablosu/fikstür/sonuçlar bilerek bir gün daha ELLENMİYOR. Ertesi
//     gün (kutlama gününün 19:00 reveal'i) gerçek sıfırlama+yeni fikstür+
//     terfi/düşme+yeni kupa kurası çalışır (finishFutbolSeasonPart2).
//   - Her iki geçiş de (kupa turu ilerletme, sezon Part1/Part2) SADECE
//     claimFutbolRevealForToday()'in İSTANBUL takvim gününe göre "bugünü
//     kazandığı" tek çağrıda çalışır — resolveFutbolMatchdayReveal aynı gün
//     içinde iki kez tetiklense bile (Cloud Scheduler'ın nadir ama olası
//     çift-tetikleme riski, kullanıcı edge-case listesi madde 1/24) hiçbir
//     ödül/geçiş iki kez uygulanmaz.
// =============================================================================

const FUTBOL_CUP_TIERS = [1, 2]; // Kupa'ya SADECE 1. ve 2. Lig katılır (kullanıcı promptu madde 1).
const FUTBOL_CUP_ROUND_ORDER = ['ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];
const FUTBOL_CUP_ROUND_LABELS = {
  ROUND_OF_16: 'Son 16',
  QUARTER_FINAL: 'Çeyrek Final',
  SEMI_FINAL: 'Yarı Final',
  FINAL: 'Final',
};
// 1. Lig'in round'u şu değerlere ULAŞTIĞI gün bir kupa günü başlar —
// kullanıcının örnek takvimiyle birebir (3 lig günü → Son16 → 3 gün →
// Çeyrek → 3 gün → Yarı → 3 gün → Final → kalan 2 lig günüyle sezon biter).
// FUTBOL_MAX_ROUNDS (14) hiçbir eşiğe denk gelmediği için sezon sonuyla
// asla çakışmaz.
const FUTBOL_CUP_TRIGGER_AFTER_ROUND = {
  3: 'ROUND_OF_16',
  6: 'QUARTER_FINAL',
  9: 'SEMI_FINAL',
  12: 'FINAL',
};
const FUTBOL_CUP_ROUND_MATCH_COUNT = { ROUND_OF_16: 8, QUARTER_FINAL: 4, SEMI_FINAL: 2, FINAL: 1 };
const FUTBOL_CUP_BET_MULTIPLIERS = { ROUND_OF_16: 50, QUARTER_FINAL: 10, SEMI_FINAL: 3, FINAL: 1.5 };
const FUTBOL_CUP_CHAMPION_REWARD = 250000;
const FUTBOL_CUP_FINALIST_REWARD = 100000;

// ensureFutbolSeasonState — futbolSeasonState/current dokümanı yoksa
// (bu kod ilk kez deploy edildiğinde, HÂLİHAZIRDA devam eden canlı sezon
// için) güvenli bir başlangıç durumuyla oluşturur: 'LEAGUE_DAY'. Bu,
// canlı sezonun round'una BAKMAKSIZIN lige normal devam ettirir — o anki
// sezon için kupa hiç çekilmemiş olacağından (createFutbolCupForSeason
// hiç çağrılmadığı için) resolveFutbolMatchdayStart'taki "kupa maçı yok"
// güvenlik ağı sayesinde bu sezon kupasız, sorunsuz tamamlanır; kupa bir
// SONRAKİ sezondan itibaren devreye girer.
async function ensureFutbolSeasonState() {
  const ref = db.collection('futbolSeasonState').doc('current');
  const snap = await ref.get();
  if (snap.exists) return { ref, state: snap.data() };
  const tier1Snap = await db.collection('futbolLeagues').where('tier', '==', 1).limit(1).get();
  const season = tier1Snap.empty ? FUTBOL_SEASON_START : tier1Snap.docs[0].data().season || FUTBOL_SEASON_START;
  const initial = {
    status: 'LEAGUE_DAY',
    season,
    pendingCupRound: null,
    finishedLeagueIds: [],
    promotionPlan: [],
    relegationPlan: [],
    championTeamName: null,
    cupChampionTeamName: null,
    lastRevealDateKey: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(initial, { merge: true });
  return { ref, state: initial };
}

// claimFutbolRevealForToday — resolveFutbolMatchdayReveal'ın İSTANBUL
// takvim günü başına SADECE BİR KEZ çalışmasını garanti eder (transaction
// içinde oku+kontrol et+yaz). lastRevealDateKey bugünle aynıysa
// { claimed:false } döner ve çağıran hiçbir şey yapmadan çıkar — bu,
// kullanıcı edge-case listesindeki "scheduled function iki kez çalışırsa"
// riskine karşı TÜM reveal akışını (kupa ödülü, sezon geçişi DAHİL) korur.
async function claimFutbolRevealForToday() {
  const ref = db.collection('futbolSeasonState').doc('current');
  const todayKey = istanbulDateKey();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (data && data.lastRevealDateKey === todayKey) {
      return { claimed: false, state: data };
    }
    const base = data || {
      status: 'LEAGUE_DAY',
      season: FUTBOL_SEASON_START,
      pendingCupRound: null,
      finishedLeagueIds: [],
      promotionPlan: [],
      relegationPlan: [],
    };
    const nextState = { ...base, lastRevealDateKey: todayKey };
    tx.set(ref, { ...nextState, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { claimed: true, state: base };
  });
}

// --- Kupa Modülü: penaltı sistemi (kullanıcı promptu madde 5-7) ---
// Normal maç taktikleri (ev sahibi avantajı, ofansif/defansif çarpanları)
// BİLEREK kullanılmıyor — sadece Güç×Form. Bu yüzden simulateFutbolMatch/
// futbolLinePowers'tan TAMAMEN bağımsız, ayrı bir hesaplama.
function futbolPenaltyStrength(p) {
  return (p.power || 0) * ((p.form ?? 100) / 100);
}

// pickFutbolPenaltyOrder — kaleci hariç, Güç×Form'a göre (eşitlikte
// oyuncu ID'sine göre) deterministik azalan sıralama. İlk 5 atışçı bu
// sıradan, sonrası da (ani ölüm) yine bu sıradan devam eder.
function pickFutbolPenaltyOrder(players) {
  return players
    .filter((p) => p.position !== 'GK')
    .slice()
    .sort((a, b) => {
      const diff = futbolPenaltyStrength(b) - futbolPenaltyStrength(a);
      if (diff !== 0) return diff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

// simulateFutbolPenaltyShootout — döner: { homeGoals, awayGoals, attempts, winner }.
// attempts, arayüzün penaltı sırasını gösterebilmesi için sırayla kaydedilir.
function simulateFutbolPenaltyShootout(homePlayers, awayPlayers) {
  const homeGK = homePlayers.find((p) => p.position === 'GK') || null;
  const awayGK = awayPlayers.find((p) => p.position === 'GK') || null;
  const homeOrder = pickFutbolPenaltyOrder(homePlayers);
  const awayOrder = pickFutbolPenaltyOrder(awayPlayers);

  const attempts = [];
  let homeGoals = 0;
  let awayGoals = 0;
  let homeIdx = 0;
  let awayIdx = 0;

  const nextShooter = (order, idx) => (order.length ? order[idx % order.length] : null);

  const takeAttempt = (team, shooter, keeper) => {
    if (!shooter) return;
    const shooterStrength = futbolPenaltyStrength(shooter);
    const keeperStrength = keeper ? futbolPenaltyStrength(keeper) : 0;
    // Kullanıcı promptu: oyuncu > kaleci VEYA EŞİT ise %75 gol (eşitlikte
    // oyuncu lehine korunur); oyuncu < kaleci ise %25 gol.
    const scoreChance = shooterStrength < keeperStrength ? 0.25 : 0.75;
    const scored = Math.random() < scoreChance;
    attempts.push({ team, shooterId: shooter.id, shooterName: shooter.name, scored });
    if (scored) {
      if (team === 'home') homeGoals += 1;
      else awayGoals += 1;
    }
  };

  // İlk 5 tur — iki takım da 5'er atış kullanır (kullanıcı promptu madde 5).
  for (let round = 0; round < 5; round++) {
    takeAttempt('home', nextShooter(homeOrder, homeIdx), awayGK);
    homeIdx += 1;
    takeAttempt('away', nextShooter(awayOrder, awayIdx), homeGK);
    awayIdx += 1;
  }

  // İlk 5'ten sonra eşitse ani ölüm; her iki takım aynı sayıda atış
  // yaptıktan sonra biri öndeyse HEMEN biter (madde 7). Sonsuz döngüye
  // karşı sabit bir güvenlik sınırı var (istatistiksel olarak pratikte
  // asla dolmaz — %75/%25 ihtimalle iki tarafın da sürekli eşit gitmesi
  // aşırı düşük olasılık).
  let suddenDeathRounds = 0;
  const MAX_SUDDEN_DEATH_ROUNDS = 20;
  while (homeGoals === awayGoals && suddenDeathRounds < MAX_SUDDEN_DEATH_ROUNDS) {
    takeAttempt('home', nextShooter(homeOrder, homeIdx), awayGK);
    homeIdx += 1;
    takeAttempt('away', nextShooter(awayOrder, awayIdx), homeGK);
    awayIdx += 1;
    suddenDeathRounds += 1;
  }

  let winner;
  if (homeGoals !== awayGoals) {
    winner = homeGoals > awayGoals ? 'home' : 'away';
  } else {
    // Güvenlik sınırına rağmen hâlâ eşitse (pratikte imkansıza yakın):
    // deterministik son çare, asla belirsiz kalmaz.
    const homeTotal = homeOrder.reduce((s, p) => s + futbolPenaltyStrength(p), 0);
    const awayTotal = awayOrder.reduce((s, p) => s + futbolPenaltyStrength(p), 0);
    winner = homeTotal >= awayTotal ? 'home' : 'away';
  }

  return { homeGoals, awayGoals, attempts, winner };
}

// --- Kupa Modülü: kura / tur ilerletme ---
function shuffleFutbolArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// createFutbolCupForSeason — yeni sezon başında (finishFutbolSeasonPart2)
// çağrılır: 1. ve 2. Lig'in TÜM takımlarını (8+8=16, seçim yok — kullanıcı
// promptu madde 1) tamamen rastgele eşleştirir. Seri başı / lig koruması
// YOK — 1. Lig şampiyonu ile 1. Lig'in başka bir takımı bile eşleşebilir.
async function createFutbolCupForSeason(season) {
  const leaguesSnap = await db.collection('futbolLeagues').where('tier', 'in', FUTBOL_CUP_TIERS).get();
  const eligibleLeagueIds = leaguesSnap.docs.map((d) => d.id);
  if (eligibleLeagueIds.length === 0) return;

  const teamsSnap = await db.collection('futbolTeams').where('leagueId', 'in', eligibleLeagueIds).get();
  const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (teams.length < 2) return;

  const shuffled = shuffleFutbolArray(teams);
  const cupRef = db.collection('futbolCups').doc(String(season));
  const batch = db.batch();
  batch.set(cupRef, {
    season,
    status: 'ROUND_OF_16',
    teamIds: shuffled.map((t) => t.id),
    championTeamId: null,
    finalistTeamId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const home = shuffled[i];
    const away = shuffled[i + 1];
    const matchRef = db.collection('futbolCupMatches').doc();
    batch.set(matchRef, {
      cupSeason: season,
      round: 'ROUND_OF_16',
      slot: i / 2,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeTeamName: home.name,
      awayTeamName: away.name,
      homeLogo: home.logo || null,
      awayLogo: away.logo || null,
      homeTier: home.tier,
      awayTier: away.tier,
      homeScore: null,
      awayScore: null,
      penalty: null,
      winnerTeamId: null,
      status: 'scheduled',
      playedAt: null,
    });
  }
  await batch.commit();
}

// advanceFutbolCupToNextRound — bir kupa turu (o turun TÜM maçları
// 'finished' + winnerTeamId dolu) bitince kazananları slot sırasına göre
// eşleştirip bir sonraki turu oluşturur. FINAL'den sonrası yok — final
// tamamlandığında burası hiç çağrılmaz, onun yerine awardFutbolCupTrophy
// çalışır.
async function advanceFutbolCupToNextRound(season, finishedRound) {
  const idx = FUTBOL_CUP_ROUND_ORDER.indexOf(finishedRound);
  const nextRound = FUTBOL_CUP_ROUND_ORDER[idx + 1];
  if (!nextRound) return;

  const matchesSnap = await db
    .collection('futbolCupMatches')
    .where('cupSeason', '==', season)
    .where('round', '==', finishedRound)
    .get();
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.slot - b.slot);
  if (matches.length === 0 || matches.some((m) => m.status !== 'finished' || !m.winnerTeamId)) return;

  const winners = matches.map((m) => ({
    id: m.winnerTeamId,
    name: m.winnerTeamId === m.homeTeamId ? m.homeTeamName : m.awayTeamName,
    logo: m.winnerTeamId === m.homeTeamId ? m.homeLogo : m.awayLogo,
    tier: m.winnerTeamId === m.homeTeamId ? m.homeTier : m.awayTier,
  }));

  const batch = db.batch();
  for (let i = 0; i + 1 < winners.length; i += 2) {
    const home = winners[i];
    const away = winners[i + 1];
    const matchRef = db.collection('futbolCupMatches').doc();
    batch.set(matchRef, {
      cupSeason: season,
      round: nextRound,
      slot: i / 2,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeTeamName: home.name,
      awayTeamName: away.name,
      homeLogo: home.logo || null,
      awayLogo: away.logo || null,
      homeTier: home.tier,
      awayTier: away.tier,
      homeScore: null,
      awayScore: null,
      penalty: null,
      winnerTeamId: null,
      status: 'scheduled',
      playedAt: null,
    });
  }
  batch.update(db.collection('futbolCups').doc(String(season)), {
    status: nextRound,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

// --- Kupa Modülü: kupa maçı hesaplama (18:00) / resmileştirme (19:00) ---

// computeFutbolCupMatchLive — lig maçından (computeFutbolMatchLive) TEK
// farkı: ev sahibi avantajı YOK (futbolLinePowers'a iki taraf için de
// isHome=false verilir — madde 3) ve normal süre sonunda skor eşitse
// HEMEN penaltılara geçilir (kupa maçı beraberlikle bitemez — madde 4).
async function computeFutbolCupMatchLive(match) {
  const [homeTeamSnap, awayTeamSnap, homePlayersSnap, awayPlayersSnap] = await Promise.all([
    db.collection('futbolTeams').doc(match.homeTeamId).get(),
    db.collection('futbolTeams').doc(match.awayTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.homeTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.awayTeamId).get(),
  ]);
  if (!homeTeamSnap.exists || !awayTeamSnap.exists) return;

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
  const homeLines = futbolLinePowers(homeResolved.selected, false, homeResolved.tactic, homeResolved.mucadeleConfig.powerMult);
  const awayLines = futbolLinePowers(awayResolved.selected, false, awayResolved.tactic, awayResolved.mucadeleConfig.powerMult);
  const { homeScore, awayScore, timeline, possessionCheckpoints } = simulateFutbolMatch(homeLines, awayLines);

  let penalty = null;
  let winnerTeamId;
  if (homeScore === awayScore) {
    const shootout = simulateFutbolPenaltyShootout(homeResolved.selected, awayResolved.selected);
    penalty = { homeScore: shootout.homeGoals, awayScore: shootout.awayGoals, attempts: shootout.attempts };
    winnerTeamId = shootout.winner === 'home' ? match.homeTeamId : match.awayTeamId;
  } else {
    winnerTeamId = homeScore > awayScore ? match.homeTeamId : match.awayTeamId;
  }

  const matchStartAt = new Date();
  const revealAt = new Date(matchStartAt.getTime());
  revealAt.setUTCHours(revealAt.getUTCHours() + 1);

  const updateData = {
    homeScore,
    awayScore,
    status: 'live',
    matchStartAt: admin.firestore.Timestamp.fromDate(matchStartAt),
    revealAt: admin.firestore.Timestamp.fromDate(revealAt),
    timeline,
    possessionCheckpoints,
    homeLineupIds: homeResolved.selected.map((p) => p.id),
    awayLineupIds: awayResolved.selected.map((p) => p.id),
    // 19:00'da (applyFutbolCupMatchResult) TEKRAR HESAPLANMAZ, aynen
    // kullanılır — penaltı sonucunun normal sonuç tarafından üzerine
    // yazılmasını engeller (kullanıcı edge-case listesi madde 26).
    winnerTeamId,
  };
  if (penalty) updateData.penalty = penalty;
  await db.collection('futbolCupMatches').doc(match.id).update(updateData);
}

// applyFutbolCupMatchResult — kupa maçını resmileştirir. Lig maçından
// farklı olarak takım istatistiklerine/taraftara/bilete HİÇ dokunmaz —
// kupa lig performansını etkilemez (madde 3). Oyuncu gelişimi lig
// maçlarındaki gibi uygulanır (kupa da gerçek bir maç).
async function applyFutbolCupMatchResult(matchId) {
  const matchSnap = await db.collection('futbolCupMatches').doc(matchId).get();
  if (!matchSnap.exists) return;
  const match = matchSnap.data();
  if (match.status !== 'live') return;

  const [homeTeamSnap, awayTeamSnap, homePlayersSnap, awayPlayersSnap] = await Promise.all([
    db.collection('futbolTeams').doc(match.homeTeamId).get(),
    db.collection('futbolTeams').doc(match.awayTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.homeTeamId).get(),
    db.collection('futbolPlayers').where('teamId', '==', match.awayTeamId).get(),
  ]);

  const batch = db.batch();
  batch.update(db.collection('futbolCupMatches').doc(matchId), {
    status: 'finished',
    playedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Kupa maçları da normal lig maçlarıyla AYNI mücadele/sakatlık kuralına
  // tabi (kullanıcı isteği "her maçta" — kupa maçı istisna değil).
  const homeLineupSet = new Set(match.homeLineupIds || []);
  const awayLineupSet = new Set(match.awayLineupIds || []);
  const injuredThisMatchByTeam = new Map();
  const applyPlayerUpdates = (snap, lineupSet, teamId, mucadele, isBot) => {
    snap.docs.forEach((d) => {
      const p = d.data();
      if (lineupSet.has(d.id)) {
        const gain = Math.round(randomInRange(0.1, 2.0) * 10) / 10;
        const updates = {
          power: Math.round((p.power + gain) * 10) / 10,
          form: Math.max(0, Math.round(p.form - p.age * mucadele.formLossMult)),
        };
        if (!isBot) {
          const days = rollFutbolInjuryDays(p.age, mucadele.injuryMult);
          if (days > 0) {
            updates.injuryDaysLeft = days;
            if (!injuredThisMatchByTeam.has(teamId)) injuredThisMatchByTeam.set(teamId, []);
            injuredThisMatchByTeam.get(teamId).push(p.name);
          }
        }
        batch.update(d.ref, updates);
        logFutbolGrowth(batch, { teamId, playerId: d.id, playerName: p.name, amount: gain, type: 'kupa' });
      } else {
        batch.update(d.ref, { form: Math.min(100, p.form + 50) });
      }
    });
  };
  if (homeTeamSnap.exists) {
    applyPlayerUpdates(
      homePlayersSnap,
      homeLineupSet,
      match.homeTeamId,
      futbolMucadeleConfig(homeTeamSnap.data()),
      homeTeamSnap.data().isBot
    );
  }
  if (awayTeamSnap.exists) {
    applyPlayerUpdates(
      awayPlayersSnap,
      awayLineupSet,
      match.awayTeamId,
      futbolMucadeleConfig(awayTeamSnap.data()),
      awayTeamSnap.data().isBot
    );
  }
  const injuryNote = (teamId) => {
    const names = injuredThisMatchByTeam.get(teamId);
    if (!names || names.length === 0) return '';
    return ` 🚑 Sakatlanan oyuncu(lar): ${names.join(', ')}.`;
  };

  const homeName = homeTeamSnap.exists ? homeTeamSnap.data().name : match.homeTeamName;
  const awayName = awayTeamSnap.exists ? awayTeamSnap.data().name : match.awayTeamName;
  const roundLabel = FUTBOL_CUP_ROUND_LABELS[match.round] || match.round;
  const winnerIsHome = match.winnerTeamId === match.homeTeamId;
  const scoreLine = match.penalty
    ? `${match.homeScore}-${match.awayScore} (Penaltılar: ${match.penalty.homeScore}-${match.penalty.awayScore})`
    : `${match.homeScore}-${match.awayScore}`;

  const homeOwnerUid = homeTeamSnap.exists ? homeTeamSnap.data().ownerUid : null;
  if (homeOwnerUid) {
    sendFutbolSms(
      batch,
      homeOwnerUid,
      `🏆 Neon Kupası ${roundLabel}: ${homeName} ${scoreLine} ${awayName} — takımın ${winnerIsHome ? 'bir üst tura yükseldi' : 'kupadan elendi'}.${injuryNote(match.homeTeamId)}`,
      'futbol_cup_match_result'
    );
  }
  const awayOwnerUid = awayTeamSnap.exists ? awayTeamSnap.data().ownerUid : null;
  if (awayOwnerUid) {
    sendFutbolSms(
      batch,
      awayOwnerUid,
      `🏆 Neon Kupası ${roundLabel}: ${homeName} ${scoreLine} ${awayName} — takımın ${!winnerIsHome ? 'bir üst tura yükseldi' : 'kupadan elendi'}.${injuryNote(match.awayTeamId)}`,
      'futbol_cup_match_result'
    );
  }

  await batch.commit();

  await logNewsEvent('football_cup_match', {
    round: match.round,
    homeName,
    awayName,
    homeLogo: match.homeLogo || null,
    awayLogo: match.awayLogo || null,
    homeTier: match.homeTier || null,
    awayTier: match.awayTier || null,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    penalty: match.penalty || null,
    winnerIsHome,
  });
}

// resolveFutbolCupBetsForRound — o kupa turunun TÜM maçları bitince
// çağrılır. Her tur AYRI bir kupon (madde 10): turun tüm maçlarını doğru
// bilen FUTBOL_CUP_BET_MULTIPLIERS[round] katı kazanır, bir maç bile
// yanlışsa kupon kaybedilir. Bir turun kuponu diğer turları etkilemez.
async function resolveFutbolCupBetsForRound(season, round) {
  const [betsSnap, matchesSnap] = await Promise.all([
    db
      .collection('futbolCupBets')
      .where('season', '==', season)
      .where('round', '==', round)
      .where('status', '==', 'pending')
      .get(),
    db.collection('futbolCupMatches').where('cupSeason', '==', season).where('round', '==', round).get(),
  ]);
  if (betsSnap.empty) return;

  const winnerByMatchId = {};
  matchesSnap.docs.forEach((d) => {
    const m = d.data();
    if (m.status === 'finished' && m.winnerTeamId) winnerByMatchId[d.id] = m.winnerTeamId;
  });

  const multiplier = FUTBOL_CUP_BET_MULTIPLIERS[round] || 1;
  const batch = db.batch();
  betsSnap.docs.forEach((d) => {
    const bet = d.data();
    const allCorrect = bet.predictions.every((p) => winnerByMatchId[p.matchId] === p.teamId);
    if (allCorrect) {
      const payout = Math.round(bet.stake * multiplier);
      batch.update(db.collection('users').doc(bet.uid), { gold: admin.firestore.FieldValue.increment(payout) });
      batch.update(d.ref, { status: 'won', payout });
      sendFutbolSms(
        batch,
        bet.uid,
        `🎉 Kupa kuponun tuttu! ${FUTBOL_CUP_ROUND_LABELS[round] || round}, ${payout.toLocaleString('tr-TR')} altın kazandın.`,
        'futbol_cup_bet_result'
      );
    } else {
      batch.update(d.ref, { status: 'lost', payout: 0 });
      sendFutbolSms(
        batch,
        bet.uid,
        `Kupa kuponun tutmadı (${FUTBOL_CUP_ROUND_LABELS[round] || round}). Yatırdığın ${bet.stake.toLocaleString('tr-TR')} altın gitti.`,
        'futbol_cup_bet_result'
      );
    }
  });
  await batch.commit();
}

// awardFutbolCupTrophy — kupa finali bitince çağrılır. İDEMPOTENCY:
// futbolCups dokümanının status'u transaction İÇİNDE kontrol edilip
// hemen 'DONE' yapılır ve AYNI transaction içinde ödeme+SMS uygulanır —
// aynı final iki kez tetiklense bile ikinci çağrı status'un zaten 'DONE'
// olduğunu görüp HİÇBİR ŞEY yapmaz (madde 12/20/34 koruması). Ödül
// transaction'ı BAŞARILI olduktan SONRA (aynı atomik transaction'ın
// içinde, yani parayla birlikte) SMS yazılır — asla önce SMS değil.
async function awardFutbolCupTrophy(season, finalMatch) {
  const cupRef = db.collection('futbolCups').doc(String(season));
  const champTeamId = finalMatch.winnerTeamId;
  const finalistTeamId = champTeamId === finalMatch.homeTeamId ? finalMatch.awayTeamId : finalMatch.homeTeamId;
  if (!champTeamId || !finalistTeamId) return false;

  const didAward = await db.runTransaction(async (tx) => {
    const cupSnap = await tx.get(cupRef);
    if (!cupSnap.exists || cupSnap.data().status === 'DONE') return false;

    const [champTeamSnap, finalistTeamSnap] = await Promise.all([
      tx.get(db.collection('futbolTeams').doc(champTeamId)),
      tx.get(db.collection('futbolTeams').doc(finalistTeamId)),
    ]);

    tx.update(cupRef, {
      status: 'DONE',
      championTeamId: champTeamId,
      finalistTeamId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (champTeamSnap.exists) {
      tx.update(champTeamSnap.ref, { cupsCount: admin.firestore.FieldValue.increment(1) });
      const champOwnerUid = champTeamSnap.data().ownerUid;
      if (champOwnerUid) {
        tx.update(db.collection('users').doc(champOwnerUid), {
          gold: admin.firestore.FieldValue.increment(FUTBOL_CUP_CHAMPION_REWARD),
        });
        tx.set(db.collection('users').doc(champOwnerUid).collection('messages').doc(), {
          text: `🏆 Tebrikler!\n${champTeamSnap.data().name} ile Neon Kupası'nı kazandınız.\n${FUTBOL_CUP_CHAMPION_REWARD.toLocaleString('tr-TR')} altın ödül hesabınıza yatırıldı.`,
          type: 'futbol_cup_champion',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });
      }
    }
    if (finalistTeamSnap.exists) {
      const finalistOwnerUid = finalistTeamSnap.data().ownerUid;
      if (finalistOwnerUid) {
        tx.update(db.collection('users').doc(finalistOwnerUid), {
          gold: admin.firestore.FieldValue.increment(FUTBOL_CUP_FINALIST_REWARD),
        });
        tx.set(db.collection('users').doc(finalistOwnerUid).collection('messages').doc(), {
          text: `🥈 Tebrikler!\n${finalistTeamSnap.data().name} ile Neon Kupası'nı ikinci olarak tamamladınız.\n${FUTBOL_CUP_FINALIST_REWARD.toLocaleString('tr-TR')} altın ödül hesabınıza yatırıldı.`,
          type: 'futbol_cup_finalist',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });
      }
    }
    return true;
  });

  if (didAward) {
    const champName = champTeamId === finalMatch.homeTeamId ? finalMatch.homeTeamName : finalMatch.awayTeamName;
    const champLogo = champTeamId === finalMatch.homeTeamId ? finalMatch.homeLogo : finalMatch.awayLogo;
    const finalistName = champTeamId === finalMatch.homeTeamId ? finalMatch.awayTeamName : finalMatch.homeTeamName;
    const finalistLogo = champTeamId === finalMatch.homeTeamId ? finalMatch.awayLogo : finalMatch.homeLogo;
    await logNewsEvent('football_cup_final', {
      season,
      championTeamName: champName,
      championLogo: champLogo || null,
      finalistTeamName: finalistName,
      finalistLogo: finalistLogo || null,
      homeScore: finalMatch.homeScore,
      awayScore: finalMatch.awayScore,
      penalty: finalMatch.penalty || null,
    });
  }
  return didAward;
}

// computeFutbolSeasonEndStats — sezon biterken (HENÜZ hiçbir istatistik
// sıfırlanmadan/kimse taşınmadan/silinmeden ÖNCE, finishFutbolSeasonPart1
// içinde) çağrılır. Hiçbir veri UYDURULMUYOR — sadece mevcut alanlardan
// (stats.gf/ga, player.power, computeFutbolTeamValue) okunuyor. Kupa
// maçları futbolTeams.stats'e HİÇ işlenmediği için (applyFutbolCupMatchResult
// bilerek dokunmuyor) bu istatistikler zaten SADECE lig performansını
// yansıtıyor (madde 16.1/16.2'nin "kupa maçları dahil edilmemeli" şartı).
async function computeFutbolSeasonEndStats() {
  const teamsSnap = await db.collection('futbolTeams').get();
  const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let topScorer = null;
  let bestDefense = null;
  for (const t of teams) {
    const played = t.stats?.played || 0;
    if (played === 0) continue;
    const gf = t.stats?.gf || 0;
    const ga = t.stats?.ga || 0;
    if (!topScorer || gf > topScorer.gf || (gf === topScorer.gf && t.id < topScorer.id)) {
      topScorer = { id: t.id, name: t.name, logo: t.logo || null, gf };
    }
    if (!bestDefense || ga < bestDefense.ga || (ga === bestDefense.ga && t.id < bestDefense.id)) {
      bestDefense = { id: t.id, name: t.name, logo: t.logo || null, ga };
    }
  }

  const teamById = {};
  teams.forEach((t) => (teamById[t.id] = t));
  const playersSnap = await db.collection('futbolPlayers').get();
  let bestPlayer = null;
  playersSnap.docs.forEach((d) => {
    const p = d.data();
    if (!p.teamId || !teamById[p.teamId]) return;
    if (!bestPlayer || p.power > bestPlayer.power || (p.power === bestPlayer.power && d.id < bestPlayer.id)) {
      bestPlayer = { id: d.id, name: p.name, power: p.power, teamName: teamById[p.teamId].name };
    }
  });

  let mostValuable = null;
  let leastValuable = null;
  for (const t of teams) {
    const value = await computeFutbolTeamValue(t.id);
    if (!mostValuable || value > mostValuable.value || (value === mostValuable.value && t.id < mostValuable.id)) {
      mostValuable = { id: t.id, name: t.name, logo: t.logo || null, value };
    }
    if (!leastValuable || value < leastValuable.value || (value === leastValuable.value && t.id < leastValuable.id)) {
      leastValuable = { id: t.id, name: t.name, logo: t.logo || null, value };
    }
  }

  return {
    topScorerTeam: topScorer ? { teamName: topScorer.name, logo: topScorer.logo, goals: topScorer.gf } : null,
    bestDefenseTeam: bestDefense ? { teamName: bestDefense.name, logo: bestDefense.logo, conceded: bestDefense.ga } : null,
    bestPlayer: bestPlayer ? { playerName: bestPlayer.name, teamName: bestPlayer.teamName, power: bestPlayer.power } : null,
    mostValuableTeam: mostValuable ? { teamName: mostValuable.name, logo: mostValuable.logo, value: mostValuable.value } : null,
    leastValuableTeam: leastValuable ? { teamName: leastValuable.name, logo: leastValuable.logo, value: leastValuable.value } : null,
  };
}

// finishFutbolSeasonPart1 — sezon bitince İLK adım: ödülleri dağıtır,
// şampiyonluk sayacını (championshipsCount) artırır, sezon sonu
// istatistiklerini hesaplar, zenginleştirilmiş bir "football_season_end"
// gazete haberi yazar ve 1 GÜNLÜK kutlamayı ('CELEBRATION_DAY') başlatır.
// BİLEREK YAPMADIKLARI: fikstür silme/oluşturma, stats sıfırlama, terfi/
// düşme UYGULAMASI (sadece PLANI hesaplayıp futbolSeasonState'e yazar),
// oyuncu yaşlandırma, yeni kupa kurası — hepsi finishFutbolSeasonPart2'de,
// kutlama gününün ERTESİ günü (yani kutlama gününün 19:00 reveal'inde)
// çalışır. Böylece kutlama günü boyunca puan tablosu/fikstür/sonuçlar
// biten sezonun son hali olarak görünmeye devam eder (madde 17/20).
async function finishFutbolSeasonPart1(leagueIds) {
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

  const rewardBatch = db.batch();
  const topThree = [];
  const promotionPlan = [];
  const relegationPlan = [];
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
        rewardBatch.update(db.collection('users').doc(team.ownerUid), {
          gold: admin.firestore.FieldValue.increment(reward),
        });
        let rewardText = `Sezon sonu: ${team.name} ${rank + 1}. sırada bitirdi, ${reward.toLocaleString('tr-TR')} altın kazandın.`;
        if (isTopTier && rank === 0) {
          rewardText = `🏆 Şampiyon oldun! ${team.name} sezonu 1. sırada bitirdi, ${reward.toLocaleString('tr-TR')} altın kazandın.`;
        } else if (!isTopTier && rank < 2) {
          rewardText += ' Bir üst lige terfi ettin! (Kutlama gününden sonra yeni ligindesin.)';
        }
        sendFutbolSms(rewardBatch, team.ownerUid, rewardText, 'futbol_season_end');
      }
    });
  });
  // Kullanıcı isteği: takımın kaç kez şampiyon olduğu hafızada tutulsun.
  const championTeam = leagueData[0]?.teams[0] || null;
  if (championTeam) {
    rewardBatch.update(db.collection('futbolTeams').doc(championTeam.id), {
      championshipsCount: admin.firestore.FieldValue.increment(1),
    });
  }
  for (let i = 0; i < leagueData.length - 1; i++) {
    const upper = leagueData[i];
    const lower = leagueData[i + 1];
    lower.teams.slice(0, 2).forEach((t) => {
      promotionPlan.push({
        teamId: t.id,
        teamName: t.name,
        fromTier: lower.league.tier,
        toTier: upper.league.tier,
        toLeagueId: upper.league.id,
      });
    });
    upper.teams.slice(-2).forEach((t) => {
      relegationPlan.push({
        teamId: t.id,
        teamName: t.name,
        fromTier: upper.league.tier,
        toTier: lower.league.tier,
        toLeagueId: lower.league.id,
      });
    });
  }
  await rewardBatch.commit();

  const seasonStats = await computeFutbolSeasonEndStats();

  const oldSeason = leagueData[0]?.league.season || null;
  let cupSummary = null;
  if (oldSeason != null) {
    const cupSnap = await db.collection('futbolCups').doc(String(oldSeason)).get();
    if (cupSnap.exists && cupSnap.data().status === 'DONE') {
      const cup = cupSnap.data();
      const flatTeams = {};
      leagueData.forEach(({ teams }) => teams.forEach((t) => (flatTeams[t.id] = t)));
      const champ = flatTeams[cup.championTeamId];
      const finalist = flatTeams[cup.finalistTeamId];
      cupSummary = {
        championTeamName: champ?.name || null,
        championLogo: champ?.logo || null,
        finalistTeamName: finalist?.name || null,
        finalistLogo: finalist?.logo || null,
      };
    }
  }

  await logNewsEvent('football_season_end', {
    season: oldSeason,
    topThree,
    promotions: promotionPlan.map((p) => ({ teamName: p.teamName, fromTier: p.fromTier, toTier: p.toTier })),
    relegations: relegationPlan.map((p) => ({ teamName: p.teamName, fromTier: p.fromTier, toTier: p.toTier })),
    cup: cupSummary,
    ...seasonStats,
  });

  await db.collection('futbolSeasonState').doc('current').set(
    {
      status: 'CELEBRATION_DAY',
      season: oldSeason,
      pendingCupRound: null,
      finishedLeagueIds: leagueIds,
      promotionPlan,
      relegationPlan,
      championTeamName: championTeam?.name || null,
      cupChampionTeamName: cupSummary?.championTeamName || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// finishFutbolSeasonPart2 — kutlama gününün (CELEBRATION_DAY) ERTESİ
// reveal'inde çalışır: terfi/düşmeyi UYGULAR, eski fikstürü siler, yeni
// sezon fikstürünü oluşturur, oyuncuları yaşlandırır, kadrosu eriyen
// takımları bota devreder, gerekiyorsa yeni lig açar ve YENİ kupa
// kurasını çeker. Adım 2-5, ORİJİNAL finishFutbolSeason'ın mantığıyla
// BİREBİR aynı — sadece bir gün ERTELENDİ ve terfi/düşme buraya taşındı.
async function finishFutbolSeasonPart2(state) {
  const leagueIds = state.finishedLeagueIds || [];
  const promotionPlan = state.promotionPlan || [];
  const relegationPlan = state.relegationPlan || [];

  // 0) Terfi/küme düşmeyi ŞİMDİ uygula (Part1'de sadece PLANLANMIŞTI).
  if (promotionPlan.length > 0 || relegationPlan.length > 0) {
    const moveBatch = db.batch();
    [...promotionPlan, ...relegationPlan].forEach((p) => {
      moveBatch.update(db.collection('futbolTeams').doc(p.teamId), {
        leagueId: p.toLeagueId,
        tier: p.toTier,
      });
    });
    await moveBatch.commit();
  }

  const allLeaguesSnap = await db.collection('futbolLeagues').get();
  const leagues = allLeaguesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => leagueIds.includes(l.id))
    .sort((a, b) => a.tier - b.tier);

  // 1) Eski sezon maçlarını sil + istatistikleri sıfırla + yeni fikstür.
  for (const league of leagues) {
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

  // 2) Yaşlanma — orijinal mantıkla birebir aynı.
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
        const remainingSeasons = 20 - (20 - 16);
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

  // 3) Minimum kadronun altına düşen oyuncu takımlarını bota devret —
  // orijinal mantıkla birebir aynı.
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

  // 4) Yeni lig açılışı — orijinal mantıkla birebir aynı.
  await maybeCreateNextFutbolTierByOwnershipRatio();

  // 5) YENİ: yeni sezon kupa kurası (SADECE 1./2. Lig — madde 1). Terfi/
  // düşme az önce uygulandığı için kadrolar güncel.
  const tier1Snap = await db.collection('futbolLeagues').where('tier', '==', 1).limit(1).get();
  const newSeason = tier1Snap.empty ? FUTBOL_SEASON_START : tier1Snap.docs[0].data().season || FUTBOL_SEASON_START;
  await createFutbolCupForSeason(newSeason);

  await logNewsEvent('football_new_season', {
    season: newSeason,
    previousChampionTeamName: state.championTeamName || null,
    previousCupChampionTeamName: state.cupChampionTeamName || null,
  });

  await db.collection('futbolSeasonState').doc('current').set(
    {
      status: 'LEAGUE_DAY',
      season: newSeason,
      pendingCupRound: null,
      finishedLeagueIds: [],
      promotionPlan: [],
      relegationPlan: [],
      championTeamName: null,
      cupChampionTeamName: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
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

// dailySweepFutbolTeamsBeforeMatchday — her gün 18:00'de, o günün
// maçları hesaplanmadan HEMEN ÖNCE, TÜM oyuncu sahipli (bot olmayan)
// takımlar için çalışır. Kullanıcı promptu: "kadro 2-2-1 olmazsa 1-2-2
// denensin ... tüm dizilimler denensin, herhangi biriyle maça
// çıkabiliyorsa çıkılsın, hiçbir dizilimle maça çıkamıyorsa takım o
// zaman oyuncunun elinden alınacak" + "antrenmandaki kutuları da
// otomatik dolduralım" (oyuncu giriş yapmasa bile takım gelişmeye devam
// etsin). NOT: takımın "bugün giriş yaptı mı" bilgisini tutan bir alan
// yok (kasıtlı basit tutuldu) — bunun yerine PRATİK bir vekil kural
// kullanılıyor: antrenman kutusu BOŞSA ve uygun (sağlıklı, kadro/
// antrenman dışı) bir aday VARSA otomatik dolduruluyor; oyuncu zaten
// kendi eliyle doldurmuşsa (kutu doluysa) dokunulmuyor.
//
// 1) SAHAYA ÇIKAMAYAN TAKIMLARI BOTA DEVRET — resolveFutbolTeamLineup'
//    taki AYNI 6 dizilim, AYNI formationFullyFieldable kontrolüyle
//    sırayla denenir; SAĞLIKLI (sakat olmayan) oyuncularla hiçbiri tam
//    dolmuyorsa takım elden alınır — finishFutbolSeasonPart2 adım
//    3'teki (minimum kadro altına düşen takımlar için) BİREBİR AYNI
//    devretme/ödeme mantığı: (takım değeri*2)/3 altın öder, eski
//    kadroyu siler, yeni rastgele kadro üretir, takımı bota çevirir.
// 2) KALAN (hâlâ oyuncuya ait) takımlarda BOŞ antrenman kutularını
//    (mevki başına 1, toplam 4) sağlıklı + kadro/antrenman dışı en iyi
//    adaylarla doldurur — botların kendi antrenman seçimiyle aynı
//    önceliklendirme (form 100 öncelik, sonra güç), ama addFutbolTraining
//    kuralına uyarak mevki başına SADECE 1 aday eklenir.
async function dailySweepFutbolTeamsBeforeMatchday() {
  const allTeamsSnap = await db.collection('futbolTeams').get();
  for (const teamDoc of allTeamsSnap.docs) {
    const team = teamDoc.data();
    if (!team.ownerUid) continue; // botlara dokunma

    const playersSnap = await db.collection('futbolPlayers').where('teamId', '==', teamDoc.id).get();
    const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const healthyPlayers = players.filter((p) => !((p.injuryDaysLeft || 0) > 0));
    const healthyByPos = groupFutbolPlayersByPositionArr(healthyPlayers);
    const canField = Object.values(FUTBOL_FORMATIONS).some((need) => formationFullyFieldable(healthyByPos, need));

    if (!canField) {
      // --- 1) Sahaya hiçbir dizilimle çıkamıyor — takımı elden al ---
      const value = await computeFutbolTeamValue(teamDoc.id);
      const payout = Math.round((value * 2) / 3);
      const revertBatch = db.batch();
      revertBatch.update(db.collection('users').doc(team.ownerUid), {
        gold: admin.firestore.FieldValue.increment(payout),
      });
      players.forEach((p) => revertBatch.delete(db.collection('futbolPlayers').doc(p.id)));
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
        mucadele: admin.firestore.FieldValue.delete(),
        doctorPlayerId: admin.firestore.FieldValue.delete(),
        trainingPlayerIds: admin.firestore.FieldValue.delete(),
      });
      sendFutbolSms(
        revertBatch,
        team.ownerUid,
        `⚽ ${team.name || 'Futbol takımın'} — kadronda sakatlık/form nedeniyle hiçbir dizilimle sahaya çıkacak sağlıklı oyuncu kalmadığı için takım elinden alındı. Takım değerinin karşılığı olarak ${payout.toLocaleString('tr-TR')} altın hesabına yatırıldı.`,
        'futbol_team_seized'
      );
      await revertBatch.commit();
      continue; // takım artık bot — antrenman doldurmaya gerek yok
    }

    // --- 2) Boş antrenman kutularını (mevki başına 1) otomatik doldur ---
    const currentTrainingIds = Array.isArray(team.trainingPlayerIds) ? team.trainingPlayerIds : [];
    const lineupIds = new Set(Array.isArray(team.lineup) ? team.lineup : []);
    const byId = {};
    players.forEach((p) => (byId[p.id] = p));
    const filledPositions = new Set(
      currentTrainingIds.map((id) => byId[id]?.position).filter(Boolean)
    );
    const openPositions = ['GK', 'DEF', 'MID', 'FWD'].filter((pos) => !filledPositions.has(pos));
    if (openPositions.length === 0) continue; // kutular zaten dolu

    const excludeIds = new Set([...lineupIds, ...currentTrainingIds]);
    const eligible = healthyPlayers.filter((p) => !excludeIds.has(p.id));
    if (eligible.length === 0) continue;
    const rank = (p) => (p.form >= 100 ? 1 : 0) * 100000 + p.power;
    const additions = [];
    for (const pos of openPositions) {
      const candidate = eligible
        .filter((p) => p.position === pos && !additions.includes(p.id))
        .sort((a, b) => rank(b) - rank(a))[0];
      if (candidate) additions.push(candidate.id);
    }
    if (additions.length > 0) {
      await teamDoc.ref.update({ trainingPlayerIds: [...currentTrainingIds, ...additions] });
    }
  }
}

// resolveFutbolMatchdayStart — her gün 18:00 (İstanbul saati). Önce
// futbolSeasonState/current'a bakar: 'CUP_DAY' ise o günkü kupa turunun
// maçlarını hesaplar ve o gün için LİG MAÇI HİÇ OLUŞTURULMAZ (kullanıcı
// promptu madde 2); 'CELEBRATION_DAY' ise (kutlama günü) hiç maç yok,
// hiçbir şey yapılmaz; aksi halde (normal 'LEAGUE_DAY') eskisi gibi o
// günün turundaki tüm maçların sonucunu hesaplar ('live' durumuna alır)
// ama HİÇBİR ŞEYİ açığa çıkarmaz — takım istatistikleri, taraftar, altın,
// SMS hepsi 19:00'a (resolveFutbolMatchdayReveal) kadar bekler.
export const resolveFutbolMatchdayStart = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'Europe/Istanbul' },
  async () => {
    const { state } = await ensureFutbolSeasonState();

    // Maçlar hesaplanmadan ÖNCE — kadrosu sakatlık/form yüzünden sahaya
    // çıkamayan takımları bota devret + boş antrenman kutularını
    // otomatik doldur (bkz. dailySweepFutbolTeamsBeforeMatchday). Kupa/
    // kutlama/lig günü fark etmeksizin her gün çalışır — hangi gün türü
    // olursa olsun takımların kadrosu güncel/sahaya çıkabilir halde
    // tutulmalı.
    await dailySweepFutbolTeamsBeforeMatchday();

    if (state.status === 'CUP_DAY' && state.pendingCupRound) {
      const cupMatchesSnap = await db
        .collection('futbolCupMatches')
        .where('cupSeason', '==', state.season)
        .where('round', '==', state.pendingCupRound)
        .where('status', '==', 'scheduled')
        .get();
      if (cupMatchesSnap.empty) {
        // Bu sezon için hiç kupa kurası çekilmemiş (ör. özellik canlıya bu
        // sezonun ortasında geldi) — güvenli şekilde lig gününe DÖN, hiçbir
        // şeyi bozma. Aşağıdaki normal lig akışına düşer (return YOK).
        await db
          .collection('futbolSeasonState')
          .doc('current')
          .set(
            { status: 'LEAGUE_DAY', pendingCupRound: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
      } else {
        for (const matchDoc of cupMatchesSnap.docs) {
          await computeFutbolCupMatchLive({ id: matchDoc.id, ...matchDoc.data() });
        }
        return; // kupa günü — lig maçı OLUŞTURULMAZ
      }
    }

    if (state.status === 'CELEBRATION_DAY') {
      return; // kutlama günü — hiç maç yok
    }

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

// resolveFutbolMatchdayReveal — her gün 19:00 (İstanbul saati). En başta
// claimFutbolRevealForToday() ile bugünü "kazanır" — aynı gün ikinci kez
// tetiklenirse (Cloud Scheduler'ın nadir çift-tetikleme riski) hiçbir şey
// yapmadan çıkar, böylece kupa ödülü/sezon geçişi gibi tek seferlik
// işlemler asla iki kez uygulanmaz. Sonra duruma göre dallanır: 'CUP_DAY'
// ise o turun kupa maçlarını resmileştirir, kupa kuponlarını sonuçlandırır
// ve turu ilerletir (ya da finaldeyse kupayı verir); 'CELEBRATION_DAY' ise
// yeni sezonu hazırlar (finishFutbolSeasonPart2); aksi halde eskisi gibi
// lig maçlarını resmileştirir, iddaa kuponlarını sonuçlandırır, turu
// ilerletir (ya da sezonu kapatıp kutlama gününü başlatır) ve gerekiyorsa
// bir sonraki kupa turunu tetikler.
export const resolveFutbolMatchdayReveal = onSchedule(
  { schedule: '0 19 * * *', timeZone: 'Europe/Istanbul' },
  async () => {
    const { claimed, state } = await claimFutbolRevealForToday();
    if (!claimed) return; // bugün zaten işlendi — çift tetikleme koruması

    if (state.status === 'CUP_DAY' && state.pendingCupRound) {
      const cupMatchesSnap = await db
        .collection('futbolCupMatches')
        .where('cupSeason', '==', state.season)
        .where('round', '==', state.pendingCupRound)
        .where('status', '==', 'live')
        .get();
      for (const matchDoc of cupMatchesSnap.docs) {
        await applyFutbolCupMatchResult(matchDoc.id);
      }
      await resolveFutbolCupBetsForRound(state.season, state.pendingCupRound);

      if (state.pendingCupRound === 'FINAL') {
        const finalSnap = await db
          .collection('futbolCupMatches')
          .where('cupSeason', '==', state.season)
          .where('round', '==', 'FINAL')
          .get();
        const finalMatch = finalSnap.docs[0]?.data();
        if (finalMatch && finalMatch.status === 'finished' && finalMatch.winnerTeamId) {
          await awardFutbolCupTrophy(state.season, finalMatch);
        }
      } else if (state.pendingCupRound) {
        await advanceFutbolCupToNextRound(state.season, state.pendingCupRound);
      }

      await db
        .collection('futbolSeasonState')
        .doc('current')
        .set(
          { status: 'LEAGUE_DAY', pendingCupRound: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      await cleanupOldNewsEvents();
      return; // kupa günü lig turunu ETKİLEMEZ — lig yarın kaldığı yerden devam eder
    }

    if (state.status === 'CELEBRATION_DAY') {
      await finishFutbolSeasonPart2(state);
      await cleanupOldNewsEvents();
      return; // kutlama günü — maç yok, sadece yeni sezon hazırlığı
    }

    // --- Normal lig günü (mevcut davranış) ---
    const leaguesSnap = await db.collection('futbolLeagues').get();
    const leagues = leaguesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const finishedLeagueIds = [];
    let canonicalRoundJustPlayed = null;

    for (const league of leagues) {
      const round = league.currentRound || 1;
      if (league.tier === 1) canonicalRoundJustPlayed = round;
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
      await finishFutbolSeasonPart1(finishedLeagueIds);
    } else {
      const cupRoundToStart = FUTBOL_CUP_TRIGGER_AFTER_ROUND[canonicalRoundJustPlayed];
      if (cupRoundToStart) {
        await db
          .collection('futbolSeasonState')
          .doc('current')
          .set(
            {
              status: 'CUP_DAY',
              pendingCupRound: cupRoundToStart,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
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
      stadiumCapacity: FUTBOL_STADIUM_LADDER[0].capacity,
      ticketPrice: FUTBOL_DEFAULT_TICKET_PRICE,
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
  const { teamId, formation, tactic, lineup, mucadele } = request.data || {};
  if (!FUTBOL_FORMATIONS[formation]) throw new HttpsError('invalid-argument', 'Geçersiz dizilim.');
  if (!FUTBOL_TACTICS.includes(tactic)) throw new HttpsError('invalid-argument', 'Geçersiz taktik.');
  if (!Array.isArray(lineup)) throw new HttpsError('invalid-argument', 'Geçersiz kadro.');
  // Mücadele — yeni istek: "kadro > taktiğin altına mücadele kısmı
  // koyalım (Dikkatli/Normal/Agresif/Çok Agresif)". Geriye dönük uyumluluk
  // için gönderilmezse 'normal' varsayılır.
  const resolvedMucadele = mucadele == null ? FUTBOL_MUCADELE_DEFAULT : mucadele;
  if (!FUTBOL_MUCADELE_LEVELS[resolvedMucadele]) {
    throw new HttpsError('invalid-argument', 'Geçersiz mücadele seviyesi.');
  }

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
    // Sakat oyuncu KESİNLİKLE ilk 11'e alınamaz — istemci zaten bunu
    // engelliyor ama sunucu tarafında da (tek doğru kaynak) reddedilir.
    if ((p.injuryDaysLeft || 0) > 0) {
      throw new HttpsError('invalid-argument', `${p.name} sakat, ilk 11'e alınamaz.`);
    }
    got[p.position] += 1;
  }
  const shapeOk = Object.keys(need).every((k) => need[k] === (got[k] || 0));
  if (!shapeOk) {
    throw new HttpsError('invalid-argument', 'Seçilen oyuncular dizilimle uyuşmuyor.');
  }

  await teamRef.update({ formation, tactic, lineup, mucadele: resolvedMucadele });
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
  // Sakat oyuncu antrenmana sokulamaz (yeni istek).
  if ((newPlayer.injuryDaysLeft || 0) > 0) {
    throw new HttpsError('failed-precondition', 'Sakat oyuncu antrenmana sokulamaz.');
  }
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

// --- Futbol modülü: Doktor (sakatlık tedavisi) ---
//
// assignFutbolDoctor — yeni istek: "doktor sekmesinde boş 1 adet kutu
// olsun oraya 1 oyuncu seçebilelim ... doktora oyuncumuzu verme fiyatı
// 5000 altın olacak. önce oyuncumuzu seçeceğiz sonra 5000 altını
// ödeyeceğiz ve saat 00.00da doktor sayesinde ekstradan futbolcumuz 1
// gün daha iyileşmiş olacak." Doktor "tek seferde 1 oyuncuyla
// ilgilenebilir" — team.doctorPlayerId zaten doluysa (bugünkü tedavi hâlâ
// sürüyor) yeni atama reddedilir; kutu her gece 00:00'da (dailyReset)
// otomatik boşalır (bkz. dailyReset'teki sakatlık iyileşme bloğu).
export const assignFutbolDoctor = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId, playerId } = request.data || {};
  const teamRef = db.collection('futbolTeams').doc(teamId);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const [teamSnap, playerSnap, userSnap] = await Promise.all([
      tx.get(teamRef),
      tx.get(db.collection('futbolPlayers').doc(playerId)),
      tx.get(userRef),
    ]);
    if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
    }
    if (teamSnap.data().doctorPlayerId) {
      throw new HttpsError('failed-precondition', 'Doktor şu an başka bir oyuncuyla ilgileniyor, yarın tekrar dene.');
    }
    if (!playerSnap.exists || playerSnap.data().teamId !== teamId) {
      throw new HttpsError('invalid-argument', 'Bu oyuncu senin kadronda değil.');
    }
    if (!((playerSnap.data().injuryDaysLeft || 0) > 0)) {
      throw new HttpsError('failed-precondition', 'Bu oyuncu sakat değil.');
    }
    const user = userSnap.data();
    if (!user || (user.gold || 0) < FUTBOL_DOCTOR_COST) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, { gold: admin.firestore.FieldValue.increment(-FUTBOL_DOCTOR_COST) });
    tx.update(teamRef, { doctorPlayerId: playerId });
  });

  return { ok: true };
});

// --- Futbol modülü: Faz 7 (İddaa Bayii) ---

// Kullanıcı revizesi: 4/4 doğru tahminin ödülü 5x'ten 10x'e çıkarıldı.
const FUTBOL_BET_PAYOUT_MULTIPLIER = 10;

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

// placeFutbolCupBet — bir kupa turunun TÜM maçları için tahmin gerektirir
// (kullanıcı promptu madde 10). predictions: [{matchId, teamId}] — kupa
// maçında beraberlik OLMADIĞI için 'home'/'away' yerine doğrudan
// kazanacağını düşündüğü takımın ID'si tahmin edilir. Her tur AYRI kupon.
export const placeFutbolCupBet = onCall(async (request) => {
  const uid = requireAuth(request);
  const { season, round, stake, predictions } = request.data || {};
  const cleanStake = Math.round(Number(stake));
  if (!Number.isFinite(cleanStake) || cleanStake <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz bahis miktarı.');
  }
  if (!FUTBOL_CUP_ROUND_ORDER.includes(round)) {
    throw new HttpsError('invalid-argument', 'Geçersiz kupa turu.');
  }
  const expectedCount = FUTBOL_CUP_ROUND_MATCH_COUNT[round];
  if (!Array.isArray(predictions) || predictions.length !== expectedCount) {
    throw new HttpsError('invalid-argument', `Bu tur için tam olarak ${expectedCount} maç tahmini gerekli.`);
  }

  const matchesSnap = await db
    .collection('futbolCupMatches')
    .where('cupSeason', '==', season)
    .where('round', '==', round)
    .get();
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (matches.length !== expectedCount) {
    throw new HttpsError('failed-precondition', 'Bu turun maçları henüz oluşmadı.');
  }
  if (matches.some((m) => m.status !== 'scheduled')) {
    throw new HttpsError('failed-precondition', 'Bu turun maçları başladı, kupon için bir sonraki tura kadar bekle.');
  }

  const matchById = {};
  matches.forEach((m) => (matchById[m.id] = m));
  const predictedIds = new Set(predictions.map((p) => p.matchId));
  if (predictedIds.size !== expectedCount || [...predictedIds].some((id) => !matchById[id])) {
    throw new HttpsError('invalid-argument', 'Tahminler bu turun maçlarıyla uyuşmuyor.');
  }
  if (
    predictions.some(
      (p) => p.teamId !== matchById[p.matchId].homeTeamId && p.teamId !== matchById[p.matchId].awayTeamId
    )
  ) {
    throw new HttpsError('invalid-argument', 'Geçersiz tahmin.');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if ((userSnap.data()?.gold || 0) < cleanStake) {
    throw new HttpsError('failed-precondition', 'Yeterli altının yok.');
  }

  const betRef = db.collection('futbolCupBets').doc();
  const batch = db.batch();
  batch.update(userRef, { gold: admin.firestore.FieldValue.increment(-cleanStake) });
  batch.set(betRef, {
    uid,
    season,
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
      stadiumCapacity: team.stadiumCapacity || FUTBOL_STADIUM_LADDER[0].capacity,
      value,
      chairman,
      isBot: !team.ownerUid,
      // Kullanıcı isteği: puan tablosunda tıklanan takımın şampiyonluk/
      // kupa geçmişi de gösterilsin.
      championshipsCount: team.championshipsCount || 0,
      cupsCount: team.cupsCount || 0,
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
        stadiumCapacity: team.stadiumCapacity || FUTBOL_STADIUM_LADDER[0].capacity,
        value,
        chairman,
        isBot: !team.ownerUid,
      };
    })
  );
  clubs.sort((a, b) => b.value - a.value);
  return { clubs };
});

// --- Futbol modülü: Stadyum (kapasite yükseltme + bilet fiyatı) ---

// upgradeFutbolStadium — takımın stadyum kapasitesini merdivende TAM
// OLARAK bir seviye yükseltir. Maliyet altından düşülür. Merdiven
// sadece sunucuda tutuluyor (bkz. FUTBOL_STADIUM_LADDER) — istemciye
// sadece mevcut + bir sonraki seviye döndürülüyor, tüm merdiven asla
// dönmüyor.
export const upgradeFutbolStadium = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId } = request.data || {};
  if (!teamId) throw new HttpsError('invalid-argument', 'teamId gerekli.');

  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }
  const team = teamSnap.data();
  const currentCapacity = team.stadiumCapacity || FUTBOL_STADIUM_LADDER[0].capacity;
  const currentIdx = FUTBOL_STADIUM_LADDER.findIndex((step) => step.capacity === currentCapacity);
  if (currentIdx === -1 || currentIdx === FUTBOL_STADIUM_LADDER.length - 1) {
    throw new HttpsError('failed-precondition', 'Zaten maksimum stadyum seviyesindesin.');
  }
  const nextStep = FUTBOL_STADIUM_LADDER[currentIdx + 1];

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if ((userSnap.data()?.gold || 0) < nextStep.cost) {
    throw new HttpsError('failed-precondition', 'Yeterli altının yok.');
  }

  const batch = db.batch();
  batch.update(userRef, { gold: admin.firestore.FieldValue.increment(-nextStep.cost) });
  batch.update(teamRef, { stadiumCapacity: nextStep.capacity });
  await batch.commit();

  const afterIdx = currentIdx + 1;
  const afterNextStep = FUTBOL_STADIUM_LADDER[afterIdx + 1] || null;
  return {
    ok: true,
    currentCapacity: nextStep.capacity,
    nextCapacity: afterNextStep ? afterNextStep.capacity : null,
    nextCost: afterNextStep ? afterNextStep.cost : null,
  };
});

// setFutbolTicketPrice — bilet fiyatını [1, 20] aralığında bir tam
// sayıya günceller. Fiyat, ev sahibi bilet gelirini VE maç sonrası
// taraftar memnuniyeti etkisini belirler (bkz. applyFutbolMatchResult).
export const setFutbolTicketPrice = onCall(async (request) => {
  const uid = requireAuth(request);
  const { teamId, ticketPrice } = request.data || {};
  if (!teamId) throw new HttpsError('invalid-argument', 'teamId gerekli.');
  if (
    typeof ticketPrice !== 'number' ||
    !Number.isInteger(ticketPrice) ||
    ticketPrice < FUTBOL_MIN_TICKET_PRICE ||
    ticketPrice > FUTBOL_MAX_TICKET_PRICE
  ) {
    throw new HttpsError('invalid-argument', `Bilet fiyatı ${FUTBOL_MIN_TICKET_PRICE}-${FUTBOL_MAX_TICKET_PRICE} altın arasında tam sayı olmalı.`);
  }

  const teamRef = db.collection('futbolTeams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists || teamSnap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Bu takım sana ait değil.');
  }

  await teamRef.update({ ticketPrice });
  return { ok: true, ticketPrice };
});

// =============================================================================
// TELEFON — "ALTIN MAĞAZASI" (Shopier Dükkan üzerinden gerçek para ile altın)
// =============================================================================
// ÖNEMLİ GEÇMİŞ NOT: İlk sürüm Shopier'in "kendi sitende ödeme formu"
// API'sini (api_pay4.php, imzalı form POST) kullanıyordu. Shopier bu
// hizmeti (Sanal POS) KALDIRDI — artık sadece kendi "Dükkan" sayfanızda
// listelenen ürünler üzerinden satış yapılabiliyor (bkz. Shopier
// destek yanıtı: "Sanal POS hizmetimiz sonlanmıştır"). Bu yüzden akış
// baştan aşağı değişti:
//
//   1) İki paket Shopier'in kendi Dükkan sayfasında ürün olarak
//      listelendi (satıcı panelinden elle eklendi, bu koddan bağımsız):
//        - Başlangıç Paketi (30 TL): shopier ürün ID 49730536
//        - 30.000 Altın + Özel Paket (100 TL): shopier ürün ID 49730517
//   2) Telefondaki "Altın Mağazası" ekranı, oyuncuya KENDİNE ÖZEL bir
//      6 haneli "Teslimat Kodu" gösterir (bkz. getMyRedemptionCode).
//   3) Oyuncu "Satın Al" butonuna basınca doğrudan Shopier'in ürün
//      sayfasına gider (yeni sekme) — ödemeyi TAMAMEN Shopier'in kendi
//      sayfasında yapar, kart bilgisi hiçbir zaman bize uğramaz. Checkout
//      sırasında Shopier'in "Sipariş Notu" alanına bu kodu yapıştırması
//      gerekiyor — oyuncuyu bu koddan tanıyabilmemizin TEK yolu bu.
//   4) Shopier, satış tamamlanınca "Otomatik Sipariş Bildirimi" (OSB)
//      ile sunucudan sunucuya bize bir POST atar (shopierOsbWebhook).
//      Bu bildirim; hangi ürünün (productid) satıldığını, tutarı VE
//      sipariş notunu (customernote — oyuncunun yapıştırdığı kod) içerir.
//      Kodu `redemptionCodes/{kod}`'dan uid'ye çeviririz, productid'yi
//      GOLD_STORE_PACKAGES ile eşleştirir, altın+eşyaları basarız.
//   5) Kod eksik/yanlışsa veya eşleşmezse PARAYI KAYBETMEYİZ — ödeme
//      `shopierUnmatchedOrders`'a düşer, geliştirici Firebase Console'dan
//      görüp orderid ve alıcı e-postasından elle eşleştirip
//      creditGoldStorePackage ile telafi edebilir.
//
// KURULUM (siz yapmanız gereken):
//   - https://www.shopier.com/m/notificationaccess.php adresinden bir
//     OSB kullanıcı adı/şifresi oluşturun, "Bildirim URL'si" alanına
//     shopierOsbWebhook fonksiyonunun deploy sonrası URL'ini yazın.
//   - Bu kullanıcı adı/şifreyi Firebase Functions secret olarak tanımlayın:
//       firebase functions:secrets:set SHOPIER_OSB_USERNAME
//       firebase functions:secrets:set SHOPIER_OSB_PASSWORD
//   - Ürün ID'leri değişirse (yeni ürün eklerseniz vb.) aşağıdaki
//     GOLD_STORE_PACKAGES ve SHOPIER_PRODUCT_TO_PACKAGE eşlemesini
//     güncelleyin.
// ---------------------------------------------------------------------------

const shopierOsbUsername = defineSecret('SHOPIER_OSB_USERNAME');
const shopierOsbPassword = defineSecret('SHOPIER_OSB_PASSWORD');

// Paket tanımları — sadece burada, sunucuda. Shopier ürün ID'leriyle
// eşleştirilir (aşağıdaki SHOPIER_PRODUCT_TO_PACKAGE).
const GOLD_STORE_PACKAGES = {
  paket1: {
    id: 'paket1',
    name: 'Başlangıç Paketi',
    priceTRY: 30,
    gold: 30000,
    items: {},
  },
  paket2: {
    id: 'paket2',
    name: '100.000 Altın + Özel Paket',
    priceTRY: 100,
    gold: 100000,
    items: {
      yasakliMadde: 4,
      tamirMalzemesi: 1000,
      silahUpgrade: 100,
      arabaGelistirme: 20,
    },
  },
};

// Shopier ürün ID'si → paket eşlemesi. Ürün ID'si, Shopier ürün
// linkinizin sonundaki sayı (örn. .../cetelerinsavasi/49730536 → 49730536).
const SHOPIER_PRODUCT_TO_PACKAGE = {
  '49730536': 'paket1',
  '49730517': 'paket2',
};

const REDEMPTION_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O, 1/I/L gibi karışabilecek karakterler çıkarıldı
function generateRedemptionCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += REDEMPTION_CODE_CHARS[Math.floor(Math.random() * REDEMPTION_CODE_CHARS.length)];
  }
  return code;
}

// getMyRedemptionCode — oyuncunun kendine özel teslimat kodunu döner;
// yoksa (ilk kez çağrılıyorsa) bir tane üretip kaydeder. Kod, harf/rakam
// çakışmasını önlemek için `redemptionCodes/{kod}` dokümanında da uid'ye
// işaretlenir (webhook bu koleksiyondan tersine arama yapar).
export const getMyRedemptionCode = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const existing = userSnap.data()?.redemptionCode;
  if (existing) {
    return { code: existing };
  }

  // Çakışma ihtimali çok düşük (32^6 ≈ 1 milyar), ama yine de birkaç kez
  // deneyip garanti altına alalım.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRedemptionCode();
    const codeRef = db.collection('redemptionCodes').doc(code);
    try {
      let assigned = false;
      await db.runTransaction(async (tx) => {
        const codeSnap = await tx.get(codeRef);
        if (codeSnap.exists) return; // çakıştı, tekrar dene
        tx.set(codeRef, { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.set(userRef, { redemptionCode: code }, { merge: true });
        assigned = true;
      });
      if (assigned) return { code };
    } catch (err) {
      console.error('getMyRedemptionCode deneme hatası:', err);
    }
  }
  throw new HttpsError('internal', 'Kod üretilemedi, tekrar dene.');
});

// creditGoldStorePackage — bir paketin altın/eşyalarını bir kullanıcıya
// basar. Hem shopierOsbWebhook (otomatik) hem de elle telafi durumları
// için ortak.
async function creditGoldStorePackage(uid, packageId, meta = {}) {
  const pack = GOLD_STORE_PACKAGES[packageId];
  if (!pack) throw new Error(`Bilinmeyen paket: ${packageId}`);

  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    tx.set(userRef, { gold: admin.firestore.FieldValue.increment(pack.gold) }, { merge: true });
    Object.entries(pack.items).forEach(([materialType, qty]) => {
      const inventoryRef = userRef.collection('inventory').doc(materialType);
      tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(qty) }, { merge: true });
    });
    const msgRef = userRef.collection('messages').doc();
    tx.set(msgRef, {
      from: 'Altın Mağazası',
      text: `${pack.name} satın alımın tamamlandı — hesabına ${pack.gold.toLocaleString('tr-TR')} altın yüklendi.`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  if (meta.orderId) {
    await db.collection('shopierOrders').doc(String(meta.orderId)).set(
      {
        uid,
        packageId,
        creditedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...meta,
      },
      { merge: true }
    );
  }
}

// shopierOsbWebhook — Shopier'in "Otomatik Sipariş Bildirimi" (OSB)
// uç noktası. Shopier her satışta buraya POST atar. Format Shopier'in
// kendi OSB dokümantasyonundaki örnekle birebir aynı: body iki elemanlı
// bir dizi ([{value: base64Payload}, {value: hash}]), imza
// HMAC-SHA256(base64Payload + OSB_USERNAME, OSB_PASSWORD) ile doğrulanır.
// extractShopierOsbFields — Shopier'in OSB isteğini, hangi Content-Type
// ile geldiğine bakılmaksızın { resVal, hashVal } olarak çıkarır.
// Shopier bu isteği bazen `multipart/form-data` (sınır/boundary'li)
// gövdeyle gönderiyor — Firebase Functions'ın gömülü gövde ayrıştırıcısı
// bunu OTOMATİK OLARAK req.body'ye çevirmiyor (sadece JSON ve
// application/x-www-form-urlencoded için otomatik ayrıştırma yapar).
// Bu yüzden Content-Type multipart ise req.rawBody'yi busboy ile elle
// ayrıştırıyoruz; değilse (JSON/urlencoded) Firebase'in zaten
// doldurduğu req.body'yi kullanıyoruz.
async function extractShopierOsbFields(req) {
  const contentType = String(req.headers['content-type'] || '');

  if (contentType.includes('multipart/form-data')) {
    const fields = await new Promise((resolve, reject) => {
      const collected = {};
      try {
        const bb = Busboy({ headers: req.headers });
        bb.on('field', (name, val) => {
          collected[name] = val;
        });
        bb.on('close', () => resolve(collected));
        bb.on('error', reject);
        bb.end(req.rawBody);
      } catch (err) {
        reject(err);
      }
    });
    return { resVal: fields.res ?? null, hashVal: fields.hash ?? null };
  }

  // JSON veya application/x-www-form-urlencoded — Firebase bunu zaten
  // otomatik olarak req.body'ye ayrıştırmış olur.
  const body = req.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    if (body.res && body.hash) {
      return { resVal: body.res, hashVal: body.hash };
    }
    // Eski/alternatif entegrasyon örneklerinde görülen dizi biçimi
    // ([{value:...},{value:...}]) ihtimaline karşı bir yedek daha:
    if (Array.isArray(body) && body[0]?.value && body[1]?.value) {
      return { resVal: body[0].value, hashVal: body[1].value };
    }
  }

  return { resVal: null, hashVal: null };
}

export const shopierOsbWebhook = onRequest(
  { secrets: [shopierOsbUsername, shopierOsbPassword] },
  async (req, res) => {
    try {
      const { resVal, hashVal } = await extractShopierOsbFields(req);
      if (!resVal || !hashVal) {
        console.error(
          'shopierOsbWebhook: res/hash bulunamadı — content-type:',
          req.headers['content-type'],
          'rawBody (ilk 200 karakter):',
          req.rawBody ? req.rawBody.toString('utf8').slice(0, 200) : null
        );
        res.status(400).send('missing fields');
        return;
      }

      const expectedHash = crypto
        .createHmac('sha256', shopierOsbPassword.value())
        .update(resVal + shopierOsbUsername.value())
        .digest('hex');

      const providedBuffer = Buffer.from(String(hashVal), 'utf8');
      const expectedBuffer = Buffer.from(expectedHash, 'utf8');
      const validSignature =
        providedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedBuffer, expectedBuffer);

      if (!validSignature) {
        console.error('shopierOsbWebhook: geçersiz imza');
        res.status(401).send('invalid signature');
        return;
      }

      const order = JSON.parse(Buffer.from(resVal, 'base64').toString('utf8'));
      const { orderid, productid, price, email, customernote, istest } = order;

      // Shopier panelinden atılan test bildirimlerinde gerçek altın
      // BASILMASIN diye burada durduruyoruz — ama 200 dönüp Shopier'in
      // "bildirim başarısız" sanıp tekrar tekrar denemesini engelliyoruz.
      if (istest) {
        console.log('shopierOsbWebhook: test bildirimi, altın basılmadı', orderid);
        res.status(200).send('success');
        return;
      }

      const packageId = SHOPIER_PRODUCT_TO_PACKAGE[String(productid)];
      const orderRef = db.collection('shopierOrders').doc(String(orderid || `unknown_${Date.now()}`));
      const orderSnap = await orderRef.get();
      if (orderSnap.exists && orderSnap.data().creditedAt) {
        // Aynı bildirim tekrar geldi (ağ hatası sonrası Shopier retry
        // atmış olabilir) — ikinci kez altın basma.
        res.status(200).send('success');
        return;
      }

      if (!packageId) {
        console.error('shopierOsbWebhook: bilinmeyen ürün ID', productid);
        await db.collection('shopierUnmatchedOrders').doc(String(orderid || Date.now())).set({
          reason: 'unknown-product',
          orderid: orderid || null,
          productid: productid || null,
          price: price || null,
          email: email || null,
          customernote: customernote || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).send('success'); // Shopier'e "aldım" de, tekrar denemesin — sorunu elle çözeceğiz.
        return;
      }

      // Sipariş notundan teslimat kodunu çıkar: sadece izin verilen
      // karakter setini alıp büyük harfe çeviriyoruz (kullanıcı boşluk/
      // küçük harfle yapıştırmış olabilir).
      const codeMatch = String(customernote || '')
        .toUpperCase()
        .match(/[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}/);
      const code = codeMatch ? codeMatch[0] : null;

      let uid = null;
      let matchedBy = null;
      if (code) {
        const codeSnap = await db.collection('redemptionCodes').doc(code).get();
        if (codeSnap.exists) {
          uid = codeSnap.data().uid;
          matchedBy = 'code';
        }
      }

      // YEDEK EŞLEŞTİRME: kod yoksa/eşleşmediyse, alıcının Shopier'e
      // girdiği e-postayla oyun hesabının e-postası AYNIYSA otomatik
      // eşleştir. Oyuncu kodu yapıştırmayı unutsa bile (aynı e-postayı
      // kullandıysa) altın otomatik yüklenir.
      if (!uid && email) {
        try {
          const userRecord = await admin.auth().getUserByEmail(String(email).trim());
          uid = userRecord.uid;
          matchedBy = 'email';
        } catch (err) {
          // getUserByEmail bulamazsa 'auth/user-not-found' fırlatır — bu
          // beklenen bir durum (oyuncu farklı e-posta kullanmış olabilir),
          // hata olarak loglamaya gerek yok.
        }
      }

      if (!uid) {
        console.error('shopierOsbWebhook: ne kod ne e-posta eşleşti', orderid, customernote, email);
        await db.collection('shopierUnmatchedOrders').doc(String(orderid || Date.now())).set({
          reason: 'no-matching-code-or-email',
          orderid: orderid || null,
          productid: productid || null,
          packageId,
          price: price || null,
          email: email || null,
          customernote: customernote || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).send('success');
        return;
      }

      await creditGoldStorePackage(uid, packageId, {
        orderId: orderid || null,
        productid: productid || null,
        price: price || null,
        email: email || null,
        matchedBy,
      });

      res.status(200).send('success');
    } catch (err) {
      console.error('shopierOsbWebhook hata:', err);
      // 500 dönersek Shopier'in tekrar denemesini sağlarız (geçici bir
      // Firestore hatası olabilir); imza/parse hataları zaten yukarıda
      // erken kesiliyor.
      res.status(500).send('error');
    }
  }
);

// adminManualCreditPackage — otomatik eşleştirme (kod/e-posta) başarısız
// olduğunda (bkz. shopierUnmatchedOrders) bir siparişi ELLE telafi etmek
// için. Kimlik doğrulaması Firebase Auth ÜZERİNDEN DEĞİL, sadece
// ADMIN_SECRET ile yapılıyor (bu fonksiyon site içinden değil, geliştirici
// tarafından bir HTTP isteğiyle — örn. curl — çağrılması için tasarlandı).
// Örnek kullanım:
//   curl -X POST https://<BÖLGE>-<PROJE_ID>.cloudfunctions.net/adminManualCreditPackage \
//     -H "Content-Type: application/json" \
//     -d '{"secret":"...", "email":"aliciposta@ornek.com", "packageId":"paket1"}'
const adminSecret = defineSecret('ADMIN_SECRET');

export const adminManualCreditPackage = onRequest(
  { secrets: [adminSecret] },
  async (req, res) => {
    try {
      const { secret, uid: uidInput, email, packageId } = req.body || {};
      if (!secret || secret !== adminSecret.value()) {
        res.status(403).send('forbidden');
        return;
      }
      if (!GOLD_STORE_PACKAGES[packageId]) {
        res.status(400).send(`invalid packageId (geçerli: ${Object.keys(GOLD_STORE_PACKAGES).join(', ')})`);
        return;
      }

      let uid = uidInput || null;
      if (!uid && email) {
        try {
          const userRecord = await admin.auth().getUserByEmail(String(email).trim());
          uid = userRecord.uid;
        } catch (err) {
          res.status(404).send(`Bu e-postayla eşleşen bir oyun hesabı bulunamadı: ${email}`);
          return;
        }
      }
      if (!uid) {
        res.status(400).send('uid veya email gerekli');
        return;
      }

      await creditGoldStorePackage(uid, packageId, {
        orderId: `manual_${Date.now()}`,
        manual: true,
        note: 'Elle telafi (adminManualCreditPackage)',
      });

      res.status(200).send(`OK: ${uid} hesabına ${packageId} yüklendi.`);
    } catch (err) {
      console.error('adminManualCreditPackage hata:', err);
      res.status(500).send(`error: ${err.message}`);
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
const SIXTAGRAM_COMMENT_MAX_LEN = 280;

// createSixtagramNotification — bir oyuncuya (toUid) "beğenildim/yorum
// aldım/yanıtlandım" bildirimi ekler (users/{toUid}/sixtagramNotifications).
// Kendi kendine bildirim ASLA gönderilmez (örn. kendi postuna yorum
// yazınca kendine bildirim gitmesin).
async function createSixtagramNotification(toUid, notif) {
  if (!toUid || toUid === notif.fromUid) return;
  await db
    .collection('users')
    .doc(toUid)
    .collection('sixtagramNotifications')
    .add({
      ...notif,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    });
}

// buildSixtagramAttachment — istemcinin seçtiği ek türünü, sunucudaki
// GERÇEK veriden yeniden inşa eder. `attachment` yoksa/null ise null döner
// (sadece yazı paylaşımı da geçerlidir).
// PHOTO_SNAPSHOT_MAX_AGE_MS — bir "dondurulmuş kare" (bkz. aşağı,
// captureCameraSnapshot) en fazla bu kadar süre geçerli sayılır (açıklama
// yazıp "Paylaş"a basmaya yetecek kadar cömert bir pencere). Bu sürenin
// ötesinde ya da hiç yoksa, buildSixtagramAttachment CANLI veriye
// (parkPresence/interiorPresence) geri döner (bkz. aşağıdaki 2. katman).
const PHOTO_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;

// tryUseFrozenSnapshot — yeni istek: "fotoğraf çektiğimizde karşımıza o
// anki gördüğümüz an çıkıyor ama paylaştığımızda paylaşırkenki an
// paylaşılıyor. direkt fotoğraf çektiğimiz an karşımıza gelen görüntü
// neyse onu paylaşsın, bozmasın." Eskiden fotoğraf makinesi AÇILDIĞINDA
// hiçbir sunucu çağrısı yapılmıyordu — "Paylaş"a basıldığı anda (birkaç
// saniye/açıklama yazma süresi sonra) parkPresence/interiorPresence CANLI
// olarak yeniden okunuyordu, bu da kendisinin veya yakındaki oyuncuların
// bu süre içinde hareket etmesi durumunda paylaşılan karenin, makine
// AÇILDIĞI anda görülenden FARKLI olmasına yol açıyordu. Artık istemci
// (bkz. her WorldScreen'in openCamera'sı) makine AÇILIR AÇILMAZ
// captureCameraSnapshot'ı çağırıp o ANKİ kareyi (self + yakındaki
// oyuncular) `photoSnapshots/{uid}` altında DONDURUYOR; "Paylaş"a
// basıldığında bu fonksiyon önce o dondurulmuş kareyi arar — varsa VE
// tazeyse (bkz. PHOTO_SNAPSHOT_MAX_AGE_MS) DOĞRUDAN onu kullanır, canlı
// veriye hiç bakmaz. Doküman (eşleşse de eşleşmese de) HER ZAMAN silinir
// — tek kullanımlık, eski/yanlış türden bir kare bir SONRAKİ fotoğrafa
// asla sızmasın diye.
async function tryUseFrozenSnapshot(uid, type, locationId) {
  const ref = db.collection('photoSnapshots').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  await ref.delete().catch(() => {});
  const ms = data.capturedAt?.toMillis?.() ?? 0;
  const fresh = ms > 0 && Date.now() - ms < PHOTO_SNAPSHOT_MAX_AGE_MS;
  const matches = data.type === type && (type !== 'interiorPhoto' || data.locationId === locationId);
  if (!fresh || !matches) return null;
  return {
    originX: data.originX ?? 0,
    originY: data.originY ?? 0,
    entities: Array.isArray(data.entities) ? data.entities : [],
  };
}

// buildPresenceEntities — Park VE girilebilir mekanların (Banka/Karakol/
// Camii/Gazino/Galeri/Silah Mağazası/Garaj) "kendim + yakındaki diğer
// CANLI oyuncular" mantığı — eskiden sadece parkPhoto'nun içinde vardı,
// artık ORTAK: hem captureCameraSnapshot (makine açılır açılmaz), hem de
// buildSixtagramAttachment'ın dondurulmuş kare yoksa başvurduğu CANLI
// yedek katman tarafından kullanılıyor. Yeni istek (madde 2): "camiide
// arkadaşımla fotoğraf çekecektim arkadaşım fotoğrafta çıkmıyor" — bu
// fonksiyon artık interiorPresence için de (locationFilter ile) çağrılıp
// mekanlardaki diğer GERÇEK oyuncuları da kareye ekliyor; öncesinde
// interiorPhoto'da bu mantık hiç yoktu (yalnızca fotoğrafı çeken vardı).
async function buildPresenceEntities({ uid, presenceCollection, locationFilter, radius, includeNpc }) {
  const PRESENCE_STALE_MS = 60_000;
  const BUBBLE_STALE_MS = 25_000;
  const ALLOWED_POSES = ['idle', 'walk1', 'walk2', 'sit'];
  const safePose = (p) => (ALLOWED_POSES.includes(p) ? p : 'idle');
  const isFresh = (data) => {
    const ms = data?.updatedAt?.toMillis?.() ?? 0;
    return ms > 0 && Date.now() - ms < PRESENCE_STALE_MS;
  };
  const bubbleTextOf = (data) => {
    const ms = data?.chatTs;
    if (!data?.chatText || typeof ms !== 'number' || Date.now() - ms > BUBBLE_STALE_MS) return null;
    return String(data.chatText).slice(0, 140);
  };

  const mySnap = await db.collection(presenceCollection).doc(uid).get();
  const myPresence = mySnap.exists ? mySnap.data() : null;
  if (
    !myPresence ||
    !isFresh(myPresence) ||
    (locationFilter && myPresence.locationId !== locationFilter)
  ) {
    return null;
  }
  const originX = myPresence.x ?? 0;
  const originY = myPresence.y ?? 0;

  let presenceQuery = db.collection(presenceCollection).limit(40);
  if (locationFilter) {
    presenceQuery = db
      .collection(presenceCollection)
      .where('locationId', '==', locationFilter)
      .limit(40);
  }
  const presenceSnap = await presenceQuery.get();
  const nearby = presenceSnap.docs
    .filter((d) => d.id !== uid)
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => isFresh(data))
    .map(({ id, data }) => ({
      id,
      dx: (data.x ?? 0) - originX,
      dy: (data.y ?? 0) - originY,
      pose: safePose(data.pose),
      facing: data.facing || 'down',
      holding: data.holding || null,
      bubbleText: bubbleTextOf(data),
    }))
    .filter((p) => Math.hypot(p.dx, p.dy) < radius)
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))
    .slice(0, 4);

  const uids = [uid, ...nearby.map((p) => p.id)];
  const snaps = await Promise.all(uids.map((id) => db.collection('users').doc(id).get()));
  const avatarByUid = new Map();
  snaps.forEach((s) => {
    if (s.exists) {
      avatarByUid.set(s.id, { displayName: s.data().displayName || 'Oyuncu', avatar: s.data().avatar || null });
    }
  });
  if (!avatarByUid.has(uid)) return null;

  const entities = [
    {
      dx: 0, dy: 0, isSelf: true,
      pose: safePose(myPresence.pose), facing: myPresence.facing || 'down', holding: myPresence.holding || null,
      displayName: avatarByUid.get(uid).displayName, avatar: avatarByUid.get(uid).avatar,
      bubbleText: bubbleTextOf(myPresence),
    },
    ...nearby
      .filter((p) => avatarByUid.has(p.id))
      .map((p) => ({
        dx: p.dx, dy: p.dy, isSelf: false,
        pose: p.pose, facing: p.facing, holding: p.holding,
        displayName: avatarByUid.get(p.id).displayName, avatar: avatarByUid.get(p.id).avatar,
        bubbleText: p.bubbleText,
      })),
  ];

  if (includeNpc) {
    // Şüpheli Adam (Park NPC'si) — gerçek bir oyuncu değil, konumu (x:140,
    // y:1030) ve görünümü src/components/ParkWorldScreen/ParkWorldScreen.jsx
    // içindeki NPC_POS/NPC_AVATAR ile BİREBİR AYNI (o dosya Cloud
    // Functions'a import edilemediği için burada sabit tekrarlanıyor).
    const NPC_POS = { x: 140, y: 1030 };
    const NPC_AVATAR = {
      gender: 'erkek', build: 'iri', skin: '#a86b3c', eyeColor: '#3b2a1a',
      faceShape: 'oval', background: 'transparent',
      hairStyle: 'short', hairColor: '#0d0a08',
      eyebrowShape: 'straight', eyeShape: 'almond', eyelash: 'none',
      noseShape: 'small', mouthShape: 'neutral', lipColor: '#a85a52',
      facialHair: 'none', faceAcc: 'sunglasses', earring: 'yok', tattoo: 'yok',
      clothing: 'trenchcoat', clothColor: '#22262f', neckAcc: 'tie',
      hat: 'fedora', hatColor: '#0d0d0d', heldItem: 'yok',
      pantsColor: '#0d0d0d', shoeColor: '#0d0d0d', shoeStyle: 'klasik',
    };
    const npcDx = NPC_POS.x - originX;
    const npcDy = NPC_POS.y - originY;
    if (Math.hypot(npcDx, npcDy) < radius) {
      entities.push({
        dx: npcDx, dy: npcDy, isSelf: false,
        pose: 'idle', facing: 'right', holding: null,
        displayName: 'Şüpheli Adam', avatar: NPC_AVATAR, isNpc: true, bubbleText: null,
      });
    }
  }

  return { originX, originY, entities };
}

// captureCameraSnapshot — fotoğraf makinesi AÇILDIĞI anda (istemci
// tarafında, bkz. her WorldScreen'in openCamera'sı) çağrılır; o ANKİ
// kareyi (kendim + yakındaki oyuncular, canlı presence'tan) hesaplayıp
// `photoSnapshots/{uid}` altında dondurur. "Paylaş"a basıldığında
// buildSixtagramAttachment bu dondurulmuş kareyi kullanır — bkz.
// tryUseFrozenSnapshot yorumu (madde 1: "fotoğraf çektiğimiz an neyse
// onu paylaşsın").
export const captureCameraSnapshot = onCall(async (request) => {
  const uid = requireAuth(request);
  const { type, locationId } = request.data || {};
  const ALLOWED_LOCATIONS = ['banka', 'karakol', 'camii', 'gazino', 'araba_galerisi', 'silah_magazasi', 'modifiye_garaji'];

  if (type !== 'parkPhoto' && type !== 'interiorPhoto') {
    throw new HttpsError('invalid-argument', 'Geçersiz fotoğraf türü.');
  }
  if (type === 'interiorPhoto' && !ALLOWED_LOCATIONS.includes(locationId)) {
    throw new HttpsError('invalid-argument', 'Geçersiz mekan.');
  }

  const CAMERA_RADIUS = 170;
  const result = await buildPresenceEntities({
    uid,
    presenceCollection: type === 'parkPhoto' ? 'parkPresence' : 'interiorPresence',
    locationFilter: type === 'parkPhoto' ? null : locationId,
    radius: CAMERA_RADIUS,
    includeNpc: type === 'parkPhoto',
  });
  if (!result) {
    throw new HttpsError(
      'failed-precondition',
      type === 'parkPhoto' ? 'Fotoğraf çekmek için parkta olmalısın.' : 'Bu mekanda değilsin.'
    );
  }

  await db.collection('photoSnapshots').doc(uid).set({
    type,
    locationId: type === 'interiorPhoto' ? locationId : null,
    originX: result.originX,
    originY: result.originY,
    entities: result.entities,
    capturedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

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
    // "Son Oynanan Maçlar" — bugünün maçları henüz sonuçlanmadıysa (yani
    // henüz 19:00 olmadıysa) DÜNÜN maçlarını kullan; böylece bir maç
    // sonuçlandığı andan bir sonraki günün maçları sonuçlanana kadar tam
    // 24 saat hep bir şey gösterilir. Artık İSTEĞE BAĞLI bir leagueId ile
    // belirli bir lige de filtrelenebiliyor (kullanıcı hangi ligi
    // görmek istediğini seçebilsin diye).
    const leagueId = attachment.leagueId || null;
    const dateKey = istanbulDateKey();
    const yesterdayKey = addDaysToDateKey(dateKey, -1);

    const buildQuery = (dk) => {
      let q = db
        .collection('newsEvents')
        .where('dateKey', '==', dk)
        .where('type', '==', 'football_match');
      if (leagueId) q = q.where('leagueId', '==', leagueId);
      return q.limit(4).get();
    };

    let snap = await buildQuery(dateKey);
    if (snap.empty) {
      snap = await buildQuery(yesterdayKey);
    }
    if (snap.empty) {
      throw new HttpsError('failed-precondition', 'Son 24 saatte sonuçlanan bir maç yok.');
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

    let leagueName = null;
    if (leagueId) {
      const leagueSnap = await db.collection('futbolLeagues').doc(leagueId).get();
      leagueName = leagueSnap.exists ? leagueSnap.data().name || null : null;
    }

    return { type: 'lastMatches', leagueName, matches };
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

  if (type === 'debt') {
    const userSnap = await db.collection('users').doc(uid).get();
    const debtToState = userSnap.data()?.debtToState || 0;
    if (debtToState <= 0) {
      throw new HttpsError('failed-precondition', 'Devlete hiç borcun yok, paylaşacak bir şey bulunamadı.');
    }
    return { type: 'debt', amount: debtToState };
  }

  // lotteryWin (madde 9) — piyango kazananı Sixtagram'da paylaşabilsin.
  // İstemciden hiçbir tutar/tarih ALINMIYOR — dünün piyango çekilişi
  // (lottery/{dünün tarihi}) sunucuda okunur, winnerUid GERÇEKTEN bu
  // kullanıcı değilse reddedilir (bkz. yukarıdaki günlük çekiliş cron'u).
  if (type === 'lotteryWin') {
    const dateKey = istanbulDateKey();
    const yesterdayKey = addDaysToDateKey(dateKey, -1);
    const lotterySnap = await db.collection('lottery').doc(yesterdayKey).get();
    const lottery = lotterySnap.exists ? lotterySnap.data() : null;
    if (!lottery || lottery.winnerUid !== uid || !lottery.winnerAmount) {
      throw new HttpsError('failed-precondition', 'Dünün piyango kazananı sen değilsin.');
    }
    return { type: 'lotteryWin', amount: lottery.winnerAmount, dateKey: yesterdayKey };
  }

  // flappyScore (madde 10) — Flappy Kuş kişisel rekoru. İstemciden skor
  // ALINMIYOR — flappyScores/{uid} (submitFlappyScore Cloud Function'ının
  // yazdığı, tek doğruluk kaynağı) doğrudan okunur. "Kaçıncı sıradayım"
  // bilgisi de İSTEMCİDEN ALINMIYOR — flappyScores koleksiyonu (her
  // oyuncunun SADECE kişisel en iyi skorunu tutar) üzerinde sunucuda
  // sayım sorgusu yapılır: benden KESİNLİKLE daha yüksek skoru olan
  // oyuncu sayısı + 1 = sıram (eşit skorlar aynı sırayı paylaşır). Sadece
  // ilk 10'daysam VE koleksiyonda "ilk 10"un bir anlam ifade etmesi için
  // yeterli sayıda (en az FLAPPY_MIN_PLAYERS_FOR_RANK) farklı oyuncu
  // varsa rank alanını eke ekliyoruz; aksi halde eskisi gibi sırasız
  // paylaşılıyor (regresyon yok).
  if (type === 'flappyScore') {
    const scoreSnap = await db.collection('flappyScores').doc(uid).get();
    const score = scoreSnap.exists ? scoreSnap.data().score || 0 : 0;
    if (score <= 0) {
      throw new HttpsError('failed-precondition', 'Henüz bir Flappy Kuş rekorun yok.');
    }

    const FLAPPY_MIN_PLAYERS_FOR_RANK = 10;
    const [higherCountSnap, totalCountSnap] = await Promise.all([
      db.collection('flappyScores').where('score', '>', score).count().get(),
      db.collection('flappyScores').count().get(),
    ]);
    const higherCount = higherCountSnap.data().count;
    const totalPlayers = totalCountSnap.data().count;
    const rank = higherCount + 1;
    const rankIncluded = totalPlayers >= FLAPPY_MIN_PLAYERS_FOR_RANK && rank <= 10;

    return { type: 'flappyScore', score, rank: rankIncluded ? rank : null };
  }

  // parkPhoto — Park'ta çekilen "grup fotoğrafı". Bu oyunda hiç dosya
  // yükleme YOK — istemciden GÜVENİLMEYEN hiçbir konum/poz/katılımcı
  // verisi alınmıyor. 1. katman: fotoğraf makinesi AÇILDIĞI anda dondurulan
  // kare varsa (bkz. captureCameraSnapshot/tryUseFrozenSnapshot) DOĞRUDAN
  // o kullanılır — "Paylaş"a basılana kadar geçen sürede kendisinin veya
  // yakındaki oyuncuların hareket etmesi paylaşılan kareyi ARTIK
  // etkilemez (madde 1 düzeltmesi). 2. katman (yedek — dondurulmuş kare
  // yoksa/süresi geçmişse): CANLI parkPresence'tan aynı mantıkla
  // (buildPresenceEntities) yeniden inşa edilir — eskiden burada olan
  // mantığın AYNISI, ortak fonksiyona taşındı.
  if (type === 'parkPhoto') {
    const frozen = await tryUseFrozenSnapshot(uid, 'parkPhoto', null);
    if (frozen) {
      return { type: 'parkPhoto', originX: frozen.originX, originY: frozen.originY, entities: frozen.entities };
    }

    const live = await buildPresenceEntities({
      uid,
      presenceCollection: 'parkPresence',
      locationFilter: null,
      radius: 170,
      includeNpc: true,
    });
    if (!live) {
      throw new HttpsError('failed-precondition', 'Fotoğraf çekmek için parkta olmalısın.');
    }
    return { type: 'parkPhoto', originX: live.originX, originY: live.originY, entities: live.entities };
  }

  // interiorPhoto — Banka/Karakol/Camii/Gazino gibi girilebilir mekanlarda
  // çekilen fotoğraf. 1. katman: parkPhoto ile AYNI dondurulmuş-kare
  // mekanizması (madde 1). 2. katman (yedek): artık burada da CANLI
  // interiorPresence'tan (aynı locationId, buildPresenceEntities) yakındaki
  // GERÇEK oyuncular aranıyor — DÜZELTME (madde 2: "camiide arkadaşımla
  // fotoğraf çekecektim arkadaşım fotoğrafta çıkmıyor"): eskiden bu
  // mekanlarda presence araması HİÇ yoktu, kare her zaman TEK KİŞİLİK
  // kalıyordu. 3. katman (presence kaydı da yoksa, son çare): sadece
  // kendi (allowlist ile doğrulanmış) pozu/konumuyla tek kişilik kare —
  // eski davranış korunuyor.
  if (type === 'interiorPhoto') {
    const ALLOWED_LOCATIONS = ['banka', 'karakol', 'camii', 'gazino', 'araba_galerisi', 'silah_magazasi', 'modifiye_garaji'];
    const ALLOWED_POSES = ['idle', 'walk1', 'walk2', 'sit'];
    const ALLOWED_FACINGS = ['up', 'down', 'left', 'right'];
    // Mekan tuvali sabit 680x1180 (bkz. her WorldScreen'deki W/H).
    const CANVAS_W = 680;
    const CANVAS_H = 1180;
    const safePose = (p) => (ALLOWED_POSES.includes(p) ? p : 'idle');
    const safeFacing = (f) => (ALLOWED_FACINGS.includes(f) ? f : 'down');
    const safeCoord = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : max / 2);
    const safeBubbleText = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 140) : null);

    const locationId = ALLOWED_LOCATIONS.includes(attachment.locationId) ? attachment.locationId : null;
    if (!locationId) {
      throw new HttpsError('invalid-argument', 'Geçersiz mekan.');
    }

    const frozen = await tryUseFrozenSnapshot(uid, 'interiorPhoto', locationId);
    if (frozen) {
      return { type: 'interiorPhoto', locationId, originX: frozen.originX, originY: frozen.originY, entities: frozen.entities };
    }

    const live = await buildPresenceEntities({
      uid,
      presenceCollection: 'interiorPresence',
      locationFilter: locationId,
      radius: 170,
      includeNpc: false,
    });
    if (live) {
      return { type: 'interiorPhoto', locationId, originX: live.originX, originY: live.originY, entities: live.entities };
    }

    // Presence kaydı hiç yoksa (ör. sekme geç açıldı) son çare: sadece
    // kendi (allowlist ile doğrulanmış) pozu/konumu — eskiden beri var
    // olan davranış, tek risk kendi görünümün (zaten kendi hesabın).
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    }
    const userData = userSnap.data();

    return {
      type: 'interiorPhoto',
      locationId,
      originX: safeCoord(attachment.x, CANVAS_W),
      originY: safeCoord(attachment.y, CANVAS_H),
      entities: [{
        dx: 0, dy: 0, isSelf: true,
        pose: safePose(attachment.pose), facing: safeFacing(attachment.facing), holding: null,
        displayName: userData.displayName || 'Oyuncu', avatar: userData.avatar || null,
        bubbleText: safeBubbleText(attachment.bubbleText),
      }],
    };
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
// createSixtagramComment — bir posta yorum ekler; `parentCommentId`
// verilirse bu, o yoruma bir YANITTIR (tek seviye — yanıta yanıt yok).
// Post sahibine 'comment' bildirimi, (yanıtsa ve farklı biriyse) yanıt
// verilen yorumun sahibine de ayrıca 'reply' bildirimi gider.
export const createSixtagramComment = onCall(async (request) => {
  const uid = requireAuth(request);
  const { postId, text, parentCommentId } = request.data || {};
  if (!postId) throw new HttpsError('invalid-argument', 'postId gerekli.');
  const cleanText = typeof text === 'string' ? text.trim().slice(0, SIXTAGRAM_COMMENT_MAX_LEN) : '';
  if (!cleanText) {
    throw new HttpsError('invalid-argument', 'Boş yorum gönderemezsin.');
  }

  const postRef = db.collection('sixtagramPosts').doc(postId);
  const [postSnap, userSnap] = await Promise.all([
    postRef.get(),
    db.collection('users').doc(uid).get(),
  ]);
  if (!postSnap.exists) {
    throw new HttpsError('not-found', 'Gönderi bulunamadı (süresi dolup silinmiş olabilir).');
  }
  const post = postSnap.data();
  const user = userSnap.data() || {};
  const fromName = user.displayName || 'Bir oyuncu';

  let parentComment = null;
  if (parentCommentId) {
    const parentSnap = await postRef.collection('comments').doc(parentCommentId).get();
    if (!parentSnap.exists) {
      throw new HttpsError('not-found', 'Yanıt verilen yorum bulunamadı.');
    }
    parentComment = parentSnap.data();
  }

  const commentRef = postRef.collection('comments').doc();
  const nowMs = Date.now();
  await db.runTransaction(async (tx) => {
    tx.set(commentRef, {
      uid,
      authorName: fromName,
      authorAvatar: user.avatar || null,
      text: cleanText,
      parentCommentId: parentCommentId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: nowMs,
    });
    tx.update(postRef, { commentCount: admin.firestore.FieldValue.increment(1) });
  });

  // Post sahibine "gönderine yorum yapıldı" bildirimi.
  await createSixtagramNotification(post.uid, {
    type: 'comment',
    postId,
    commentId: commentRef.id,
    fromUid: uid,
    fromName,
    textPreview: cleanText.slice(0, 80),
  });

  // Yanıtsa VE yanıtladığı yorumun sahibi post sahibinden farklıysa
  // (aksi halde aynı kişiye iki bildirim gitmesin), ayrıca 'reply'
  // bildirimi de gönder.
  if (parentComment && parentComment.uid !== post.uid) {
    await createSixtagramNotification(parentComment.uid, {
      type: 'reply',
      postId,
      commentId: commentRef.id,
      fromUid: uid,
      fromName,
      textPreview: cleanText.slice(0, 80),
    });
  }

  return { ok: true, commentId: commentRef.id };
});

// markAllSixtagramNotificationsRead — bildirim panelini açınca çağrılır,
// tüm okunmamış bildirimleri "okundu" işaretler.
export const markAllSixtagramNotificationsRead = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('sixtagramNotifications')
    .where('read', '==', false)
    .limit(200)
    .get();
  if (snap.empty) return { ok: true, count: 0 };
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
  return { ok: true, count: snap.size };
});

export const toggleSixtagramLike = onCall(async (request) => {
  const uid = requireAuth(request);
  const { postId } = request.data || {};
  if (!postId) throw new HttpsError('invalid-argument', 'postId gerekli.');

  const postRef = db.collection('sixtagramPosts').doc(postId);
  const likeRef = postRef.collection('likes').doc(uid);
  const myLikesRef = db.collection('sixtagramUserLikes').doc(uid);
  const myUserRef = db.collection('users').doc(uid);

  let liked = false;
  let postOwnerUid = null;
  let fromName = 'Bir oyuncu';
  await db.runTransaction(async (tx) => {
    const [postSnap, likeSnap, myUserSnap] = await Promise.all([
      tx.get(postRef),
      tx.get(likeRef),
      tx.get(myUserRef),
    ]);
    if (!postSnap.exists) {
      throw new HttpsError('not-found', 'Gönderi bulunamadı (süresi dolup silinmiş olabilir).');
    }
    const post = postSnap.data();
    if (post.uid === uid) {
      throw new HttpsError('failed-precondition', 'Kendi gönderini beğenemezsin.');
    }
    postOwnerUid = post.uid;
    fromName = myUserSnap.data()?.displayName || 'Bir oyuncu';
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

  // Sadece BEĞENİRKEN bildirim gönder (beğeniyi geri çekince değil).
  if (liked && postOwnerUid) {
    await createSixtagramNotification(postOwnerUid, {
      type: 'like',
      postId,
      fromUid: uid,
      fromName,
      textPreview: null,
    });
  }

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
  const commentsSnap = await postRef.collection('comments').limit(500).get();
  if (!commentsSnap.empty) {
    const batch = db.batch();
    commentsSnap.forEach((c) => batch.delete(c.ref));
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

