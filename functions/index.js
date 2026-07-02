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

const VALID_MACHINES = ['depoUpgrade', 'vitesUpgrade', 'silahUpgrade', 'yasakliMadde'];
const MACHINE_PRICE = 100000; // Bölüm 8.2
const FACTORY_WAGE = 500; // Bölüm 6 — işçilik günlük ücreti
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

const MATERIAL_SMS_LABELS = {
  depoUpgrade: 'depo geliştirme malzemesi',
  vitesUpgrade: 'vites geliştirme malzemesi',
  silahUpgrade: 'silah geliştirme malzemesi',
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
      gold: 2000,
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

// İstifa artık ANLIK — 00:00 beklemeye gerek yok (soygun parası çalma
// istismarı sadece polis OLMAKLA ilgiliydi, istifa etmek bu riski
// taşımıyor). Onay istemek client tarafında yapılıyor.
export const resignFromPolice = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.data();

  if (!user || user.profession !== 'polis') {
    throw new HttpsError('failed-precondition', 'Polis değilsin.');
  }

  await userRef.update({ profession: null, pendingPoliceChange: null });
  await userRef.collection('private').doc('meta').set({ isPolice: false }, { merge: true });
  return { ok: true };
});

export const cancelPendingPoliceChange = onCall(async (request) => {
  const uid = requireAuth(request);
  await db.collection('users').doc(uid).update({ pendingPoliceChange: null });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// factoryWork — Bölüm 6, Bölüm 7. Günde 1 kez, 500 altın. Meslek şartı yok —
// işçilik artık herkese açık (Bölüm 7 sadeleştirmesi).
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
    if (!user) {
      throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
    }
    if (dailySnap.exists && dailySnap.data().factoryWork) {
      throw new HttpsError('failed-precondition', 'Bugün zaten çalıştınız.');
    }
    const { goldDelta, debtDelta } = splitIncomeForDebt(user.debtToState, FACTORY_WAGE);
    tx.set(
      userRef,
      {
        gold: admin.firestore.FieldValue.increment(goldDelta),
        debtToState: admin.firestore.FieldValue.increment(debtDelta),
      },
      { merge: true }
    );
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
    if (!user) {
      throw new HttpsError('failed-precondition', 'Oyuncu bulunamadı.');
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

    // 0) Bekleyen polislik başvurularını işle (Bölüm 7): anlık meslek
    // değişimiyle istismarı önlemek için başvuru bir sonraki 00:00'da
    // gerçekleşir. İstifa artık ANLIK (resignFromPolice), burada işlenmez.
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
            text: 'Polislik başvurun onaylandı! Artık polissin. Günlük maaşın Karakol üzerinden işlenecek.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            type: 'police_approved',
          })
      )
    );

    // 1) Polis maaşı — 1000 altın, sadece suspicion=0 olan polislere (Bölüm 7)
    const policeSnap = await db
      .collection('users')
      .where('profession', '==', 'polis')
      .get();
    const policeBatch = db.batch();
    policeSnap.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.suspicion === 0) {
        const { goldDelta, debtDelta } = splitIncomeForDebt(user.debtToState, 1000);
        policeBatch.update(docSnap.ref, {
          gold: admin.firestore.FieldValue.increment(goldDelta),
          debtToState: admin.firestore.FieldValue.increment(debtDelta),
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
        for (const materialType of ['depoUpgrade', 'vitesUpgrade', 'silahUpgrade']) {
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
        for (const materialType of ['depoUpgrade', 'vitesUpgrade', 'silahUpgrade']) {
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
              'loaded.depoUpgrade': 0,
              'loaded.vitesUpgrade': 0,
              'loaded.silahUpgrade': 0,
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
    // krediler el konur (ödenen kısım iade edilir); aktif, henüz el
    // konulmamış kredisi olanlara hatırlatma SMS'i gönderilir. Tek eşitlik
    // filtresi (mortgaged) kullanılıyor, vade karşılaştırması JS'de
    // yapılıyor — composite index riski yok.
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
        // Vade doldu, borç tam ödenmedi — ödenen kısım iade, araç el konur.
        loanBatch.update(db.collection('users').doc(v.ownerId), {
          gold: admin.firestore.FieldValue.increment(paid),
        });
        loanBatch.update(docSnap.ref, { seizedByBank: true, loanPaid: 0 });
        loanSmsPromises.push(
          db
            .collection('users')
            .doc(v.ownerId)
            .collection('messages')
            .add({
              text: `Banka: ${v.model} aracınızın kredi vadesi doldu, borç tam ödenmediği için araca el konuldu. Kalan borcunuzu (${totalOwed.toLocaleString('tr-TR')} altın) öderseniz aracınızı geri alabilirsiniz.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
              type: 'loan_seized',
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
      : { diamondPrice: 1000, cryptoPrice: 100000 };

    const diamondChangePct = (Math.random() * 0.03 + 0.01) * (Math.random() < 0.5 ? -1 : 1);
    const cryptoChangePct = (Math.random() * 0.19 + 0.01) * (Math.random() < 0.5 ? -1 : 1);
    const diamondPrice = clamp(Math.round(prev.diamondPrice * (1 + diamondChangePct)), 100, 10000);
    const cryptoPrice = clamp(
      Math.round(prev.cryptoPrice * (1 + cryptoChangePct)),
      10000,
      1000000
    );

    const roundedDiamondPct = Math.round(diamondChangePct * 1000) / 10;
    const roundedCryptoPct = Math.round(cryptoChangePct * 1000) / 10;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await currentRef.set({
      diamondPrice,
      cryptoPrice,
      diamondChangePct: roundedDiamondPct,
      cryptoChangePct: roundedCryptoPct,
      updatedAt: now,
    });

    await db.collection('investmentHistory').add({
      diamondPrice,
      cryptoPrice,
      diamondChangePct: roundedDiamondPct,
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
      seizedByBank: false,
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
  yasakliMadde: 4000,
  vitesUpgrade: 500,
  depoUpgrade: 500,
  silahUpgrade: 100,
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
// sellSilahMaterial — Liman & Depo > Depo'da gelişim malzemesi satışı
// (Bölüm 8.3 — 50 altın/adet). Alım artık Telefon > Amazor'dan yapılıyor.
// ---------------------------------------------------------------------------

export const sellSilahMaterial = onCall(async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection('users').doc(uid);
  const inventoryRef = userRef.collection('inventory').doc('silahUpgrade');

  await db.runTransaction(async (tx) => {
    const [invSnap, userSnap] = await Promise.all([tx.get(inventoryRef), tx.get(userRef)]);
    const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
    if (have < 1) {
      throw new HttpsError('failed-precondition', 'Satacak gelişim malzemeniz yok.');
    }
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-1) }, { merge: true });
    const { goldDelta, debtDelta } = splitIncomeForDebt(
      userSnap.data()?.debtToState,
      UPGRADE_MATERIAL_REFUND
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

const DEFAULT_PRICES = { diamondPrice: 1000, cryptoPrice: 100000 };

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
// şüphe -5, saygınlık +10.
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
    if (!user || (user.gold || 0) < VENDOR_COST) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(-VENDOR_COST),
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
  casino: { suspicionCost: 25, reward: 200000, requiredPower: 70000 },
  araba_galerisi: { suspicionCost: 25, reward: 100000, requiredPower: 50000 },
  modifiye_garaji: { suspicionCost: 25, reward: 20000, requiredPower: 20000 },
  fabrika: { suspicionCost: 25, reward: 4000, requiredPower: 10000 },
  seyyar_satici_1: { suspicionCost: 5, reward: 1600, requiredPower: 4500 },
  seyyar_satici_2: { suspicionCost: 5, reward: 1200, requiredPower: 3000 },
  seyyar_satici_3: { suspicionCost: 5, reward: 800, requiredPower: 1500 },
  seyyar_satici_4: { suspicionCost: 5, reward: 400, requiredPower: 1000 },
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

const CONTRABAND_DEPO_SELL_PRICE = 2500; // Depo'ya satış — şüphe ARTMAZ
const CONTRABAND_PARK_SELL_PRICE = 5000; // Park'ta satış — şüphe +5 (kaynağı fark etmez)
const PARK_SUSPICION_COST = 5;

// ---------------------------------------------------------------------------
// sellContrabandToDepo — güvenli, şüphesiz satış kanalı. Alım artık
// Telefon > Amazor'dan yapılıyor (4000 altın/adet, aynı fiyat).
// ---------------------------------------------------------------------------
export const sellContrabandToDepo = onCall(async (request) => {
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
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
    const { goldDelta, debtDelta } = splitIncomeForDebt(
      userSnap.data()?.debtToState,
      qty * CONTRABAND_DEPO_SELL_PRICE
    );
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(goldDelta),
      debtToState: admin.firestore.FieldValue.increment(debtDelta),
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
    if (user?.profession === 'polis' || user?.pendingPoliceChange === 'apply') {
      throw new HttpsError(
        'failed-precondition',
        'Polis mesleğindeyken/başvurun beklerken şüpheni artıracak hiçbir şey yapamazsın.'
      );
    }
    tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
    const { goldDelta, debtDelta } = splitIncomeForDebt(
      user?.debtToState,
      qty * CONTRABAND_PARK_SELL_PRICE
    );
    tx.update(userRef, {
      gold: admin.firestore.FieldValue.increment(goldDelta),
      debtToState: admin.firestore.FieldValue.increment(debtDelta),
      suspicion: clampSuspicion((user.suspicion || 0) + PARK_SUSPICION_COST),
    });
  });

  return { ok: true, earned: qty * CONTRABAND_PARK_SELL_PRICE };
});

// ---------------------------------------------------------------------------
// placeLimanOrder — Liman'dan toplu/ucuz malzeme siparişi.
// Gemi 'departing' ya da 'loading' durumundaysa (gün 2-3, gemi diğer
// şehirde/yolda mal topluyor) sipariş DOĞRUDAN 'loaded' kovasına gider —
// gemi şehre döndüğünde (gün 1) teslim edilir. Gemi 'docking' ya da
// 'in_transit' durumundaysa (gün 1, 4) sipariş 'pending' kovasına gider —
// ancak gemi bir sonraki kez yola çıktığında (gün 2) 'loaded'a taşınır,
// yani teslimat bir tur daha gecikir (bkz. dailyReset).
// Limitler (10/10/50) 'loaded'+'pending' toplamına göre uygulanır.
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

  const dateKey = istanbulDateKey();
  const shipSnap = await db.collection('shipSchedule').doc(dateKey).get();
  const shipStatus = shipSnap.exists ? shipSnap.data().status : 'docking';
  const bucket = shipStatus === 'departing' || shipStatus === 'loading' ? 'loaded' : 'pending';

  const userRef = db.collection('users').doc(uid);
  const orderRef = db.collection('limanOrders').doc(uid);

  await db.runTransaction(async (tx) => {
    const [userSnap, orderSnap] = await Promise.all([tx.get(userRef), tx.get(orderRef)]);
    const user = userSnap.data();
    const order = orderSnap.exists ? orderSnap.data() : {};
    const existing =
      (order.loaded?.[materialType] || 0) + (order.pending?.[materialType] || 0);

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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + HEIST_PLAN_DURATION_MS),
  });
  await planRef.collection('participants').doc(uid).set({
    uid,
    displayName: user?.displayName || 'Oyuncu',
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

  const participantsSnap = await planRef.collection('participants').get();
  if (participantsSnap.size >= HEIST_PLAN_MAX_PARTICIPANTS) {
    throw new HttpsError('failed-precondition', 'Bu ekip zaten dolu (en fazla 4 kişi).');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  const myPower = await getMaxWeaponPower(uid);

  await planRef.collection('participants').doc(uid).set({
    uid,
    displayName: user?.displayName || 'Oyuncu',
    weaponPower: myPower,
    suspicion: user?.suspicion || 0,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (user?.profession === 'polis' && !plan.policeWarningSent) {
    const creatorSnap = await db.collection('users').doc(plan.creatorUid).get();
    const creatorReputation = creatorSnap.data()?.reputation || 0;
    if (Math.random() * 100 < creatorReputation) {
      await planRef.update({ policeWarningSent: true });
      await db
        .collection('users')
        .doc(plan.creatorUid)
        .collection('messages')
        .add({
          text: 'Esnaftan bir haber var: kurduğun soygun planına içeriden biri sızmış olabilir.',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          type: 'heist_warning',
          planId,
        });
    }
  }

  return { ok: true };
});

export const leaveHeistPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId } = request.data || {};
  await db.collection('heistPlans').doc(planId).collection('participants').doc(uid).delete();
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
  const busted = policeIdx.length > 0;
  let caughtBySuspicion = false;

  const totalReward = config.reward;
  const dateKey = istanbulDateKey();
  const batch = db.batch();
  const captureSmsList = []; // { uid, penaltyAmount, newTotalDebt }
  const policeEarningSmsList = []; // { uid, amount }

  if (busted) {
    // Sızan polis(ler) engelledikleri parayı bölüşür (gerçek kazanç —
    // borç varsa %50'si borca gider); soyguncular aynı miktarı devlete
    // BORÇ olarak öder — önce mevcut altınlarından kesilir, yetmeyen kısım
    // borca yazılır (Bölüm 10).
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
    // Ekipte sızmış polis yok — ama herkesin KENDİ şüphesine göre bağımsız
    // bir yakalanma riski var (yakalanma ihtimali = o kişinin şüphe %'si;
    // şüphesi 0 olan biri hiç yakalanmaz). Katılımcılardan BİRİ bile
    // yakalanırsa TÜM soygun başarısız sayılır ve herkes payını devlete
    // borç olarak öder (önce mevcut altından kesilir, kalan borç yazılır).
    const suspicions = userSnaps.map((s) => s.data()?.suspicion || 0);
    const anyCaught = suspicions.some((s) => Math.random() < s / 100);

    const perPersonAmount = Math.floor(totalReward / participants.length);
    participants.forEach((p, i) => {
      const data = userSnaps[i].data();
      const currentSuspicion = suspicions[i];
      const currentReputation = data?.reputation || 0;
      const updates = {
        suspicion: clampSuspicion(currentSuspicion + config.suspicionCost),
        reputation: clampSuspicion(currentReputation - config.suspicionCost),
      };
      if (anyCaught) {
        const { debtAdded } = applyCapturePenalty(perPersonAmount);
        updates.debtToState = admin.firestore.FieldValue.increment(debtAdded);
        captureSmsList.push({
          uid: p.uid,
          penaltyAmount: perPersonAmount,
          newTotalDebt: (data?.debtToState || 0) + debtAdded,
        });
      } else {
        const { goldDelta, debtDelta } = splitIncomeForDebt(data?.debtToState, perPersonAmount);
        updates.gold = admin.firestore.FieldValue.increment(goldDelta);
        updates.debtToState = admin.firestore.FieldValue.increment(debtDelta);
      }
      batch.update(db.collection('users').doc(p.uid), updates);
    });

    if (anyCaught) {
      caughtBySuspicion = true;
    }
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

  await db.collection('globalChat').add({
    uid,
    displayName,
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

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

async function getVehicleForRace(uid, vehicleId) {
  const vSnap = await db.collection('vehicles').doc(vehicleId).get();
  if (!vSnap.exists || vSnap.data().ownerId !== uid) {
    throw new HttpsError('failed-precondition', 'Bu araç size ait değil.');
  }
  return vSnap.data();
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
function finalizeRace({ tx, roomRef, room, winnerUid, players, userRefs, userSnaps }) {
  const pot = room.betAmount;
  const uids = Object.keys(players);

  uids.forEach((u) => {
    let refund = 0;
    let winnings = 0;
    if (winnerUid === 'draw') {
      refund = pot;
    } else if (winnerUid === u) {
      refund = pot;
      winnings = pot;
    }
    const raceGold = players[u]?.raceGold || 0;
    const splittable = winnings + raceGold;
    const { goldDelta, debtDelta } = splitIncomeForDebt(
      userSnaps[u]?.data()?.debtToState,
      splittable
    );
    tx.update(userRefs[u], {
      gold: admin.firestore.FieldValue.increment(refund + goldDelta),
      debtToState: admin.firestore.FieldValue.increment(debtDelta),
    });
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
          turnDeadline: admin.firestore.Timestamp.fromMillis(
            Date.now() + RACE_TURN_SECONDS * 1000
          ),
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

    // Sıra karşı tarafa geçer.
    tx.update(roomRef, {
      [`players.${uid}`]: meUpdated,
      currentTurnUid: otherUid,
      turnDeadline: admin.firestore.Timestamp.fromMillis(Date.now() + RACE_TURN_SECONDS * 1000),
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
    if (me.raceGold < 20) {
      throw new HttpsError('failed-precondition', 'Yeterli yarış altının yok.');
    }
    tx.update(roomRef, {
      [`players.${uid}`]: { ...me, raceGold: me.raceGold - 20, nitroActive: true },
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
//   - machine: productionMachines/{uid}/{machineType}.owned ANINDA false
//     yapılır (rezerve edilir), iptal edilirse geri owned:true yapılır.
// marketplaceListings/{listingId}: sellerId, itemType, price, sold, ...
// =============================================================================

const MATERIAL_TYPES = ['depoUpgrade', 'vitesUpgrade', 'silahUpgrade', 'yasakliMadde'];

export const createListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { itemType, itemId, materialType, quantity, machineType, price } = request.data || {};
  const priceNum = Number(price);
  if (!Number.isInteger(priceNum) || priceNum <= 0) {
    throw new HttpsError('invalid-argument', 'Geçersiz fiyat.');
  }

  const listingRef = db.collection('marketplaceListings').doc();
  const userSnap = await db.collection('users').doc(uid).get();
  const sellerName = userSnap.data()?.displayName || 'Oyuncu';

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
        price: priceNum,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else if (itemType === 'material') {
    if (!MATERIAL_TYPES.includes(materialType)) {
      throw new HttpsError('invalid-argument', 'Geçersiz malzeme türü.');
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpsError('invalid-argument', 'Geçersiz miktar.');
    }
    const inventoryRef = db.collection('users').doc(uid).collection('inventory').doc(materialType);
    await db.runTransaction(async (tx) => {
      const invSnap = await tx.get(inventoryRef);
      const have = invSnap.exists ? invSnap.data().quantity || 0 : 0;
      if (have < qty) {
        throw new HttpsError('failed-precondition', 'Yeterli malzemeniz yok.');
      }
      tx.set(inventoryRef, { quantity: admin.firestore.FieldValue.increment(-qty) }, { merge: true });
      tx.set(listingRef, {
        sellerId: uid,
        sellerName,
        itemType,
        materialType,
        quantity: qty,
        price: priceNum,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sold: false,
      });
    });
  } else if (itemType === 'machine') {
    if (!VALID_MACHINES.includes(machineType)) {
      throw new HttpsError('invalid-argument', 'Geçersiz makine türü.');
    }
    const machineRef = db.collection('users').doc(uid).collection('productionMachines').doc(machineType);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(machineRef);
      if (!snap.exists || !snap.data().owned) {
        throw new HttpsError('failed-precondition', 'Bu makineye sahip değilsiniz.');
      }
      tx.update(machineRef, { owned: false });
      tx.set(listingRef, {
        sellerId: uid,
        sellerName,
        itemType,
        machineType,
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
      const machineRef = db
        .collection('users')
        .doc(uid)
        .collection('productionMachines')
        .doc(listing.machineType);
      tx.update(machineRef, { owned: true });
    }

    tx.update(listingRef, { sold: true, cancelled: true });
  });

  return { ok: true };
});

export const buyListing = onCall(async (request) => {
  const uid = requireAuth(request);
  const { listingId } = request.data || {};
  const listingRef = db.collection('marketplaceListings').doc(listingId);
  const buyerRef = db.collection('users').doc(uid);

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
    const buyer = buyerSnap.data();
    if (!buyer || (buyer.gold || 0) < listing.price) {
      throw new HttpsError('failed-precondition', 'Yetersiz altın.');
    }

    // Firestore transaction kuralı: TÜM okumalar yazmalardan önce olmalı.
    const sellerRef = db.collection('users').doc(listing.sellerId);
    const sellerSnap = await tx.get(sellerRef);

    // Alıcıdan tam fiyat düşülür.
    tx.update(buyerRef, { gold: admin.firestore.FieldValue.increment(-listing.price) });

    // Satıcıya gelir — borç varsa Bölüm 10 kuralına göre bölüştürülür.
    const { goldDelta, debtDelta } = splitIncomeForDebt(
      sellerSnap.data()?.debtToState,
      listing.price
    );
    tx.update(sellerRef, {
      gold: admin.firestore.FieldValue.increment(goldDelta),
      debtToState: admin.firestore.FieldValue.increment(debtDelta),
    });

    // Ürünü transfer et.
    if (listing.itemType === 'vehicle') {
      tx.update(db.collection('vehicles').doc(listing.vehicleId), {
        ownerId: uid,
        listed: false,
      });
    } else if (listing.itemType === 'weapon') {
      tx.update(db.collection('weapons').doc(listing.weaponId), {
        ownerId: uid,
        listed: false,
      });
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
      const machineRef = db
        .collection('users')
        .doc(uid)
        .collection('productionMachines')
        .doc(listing.machineType);
      tx.set(machineRef, { owned: true, lastCollectedAt: null }, { merge: true });
    }

    tx.update(listingRef, { sold: true, buyerId: uid, soldAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  const listingSnap2 = await listingRef.get();
  const listing2 = listingSnap2.data();
  const itemLabel =
    listing2.itemType === 'vehicle'
      ? listing2.vehicleModel
      : listing2.itemType === 'weapon'
        ? listing2.weaponName
        : listing2.itemType === 'material'
          ? `${listing2.quantity} adet malzeme`
          : 'ürün';
  await db
    .collection('users')
    .doc(listing2.sellerId)
    .collection('messages')
    .add({
      text: `2. El: "${itemLabel}" ilanın ${listing2.price.toLocaleString('tr-TR')} altına satıldı.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'marketplace_sale',
    });

  return { ok: true };
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
    seats: { [uid]: { displayName: user.displayName || 'Oyuncu' } },
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
      [`seats.${uid}`]: { displayName: user.displayName || 'Oyuncu' },
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
    tx.update(tableRef, {
      seatOrder: newSeatOrder,
      [`seats.${uid}`]: admin.firestore.FieldValue.delete(),
    });
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

    tx.update(tableRef, {
      seats: newSeats,
      seatOrder: newSeatOrder,
      round: {
        phase: firstTurnUid ? 'playing' : 'dealer',
        participants: eligible,
        hands,
        dealerCards,
        dealerStatus: 'playing',
        pot: table.betAmount * eligible.length,
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

    // Kazananları belirle.
    const participants = round.participants;
    const hands = round.hands;
    const contenders = participants.filter((u) => hands[u].status !== 'bust');
    const dealerIn = dealerStatus !== 'bust';
    const dealerSum = sumCards(dealerCards);

    let bestSum = dealerIn ? dealerSum : -1;
    contenders.forEach((u) => {
      const s = sumCards(hands[u].cards);
      if (s > bestSum) bestSum = s;
    });

    const humanWinners = contenders.filter((u) => sumCards(hands[u].cards) === bestSum);
    const dealerWins = dealerIn && dealerSum === bestSum;

    // Firestore transaction kuralı: tüm okumalar yazmalardan önce.
    const winnerRefs = !dealerWins ? humanWinners.map((u) => db.collection('users').doc(u)) : [];

    const updatedHands = { ...hands };
    if (!dealerWins && humanWinners.length > 0) {
      const share = Math.floor(round.pot / humanWinners.length);
      humanWinners.forEach((u, i) => {
        updatedHands[u] = { ...hands[u], status: 'won' };
        // 10 Numara kazancı borca gitmez — direkt altına eklenir.
        tx.update(winnerRefs[i], { gold: admin.firestore.FieldValue.increment(share) });
      });
    }

    tx.update(tableRef, {
      round: {
        ...round,
        phase: 'resolved',
        dealerCards,
        dealerStatus,
        hands: updatedHands,
        currentTurnUid: null,
        turnDeadline: null,
        result: {
          winners: dealerWins ? [] : humanWinners,
          dealerWon: dealerWins,
          bestSum,
          share: !dealerWins && humanWinners.length > 0 ? Math.floor(round.pot / humanWinners.length) : 0,
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
