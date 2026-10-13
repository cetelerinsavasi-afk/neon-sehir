// =============================================================================
// v91 — GOOGLE PLAY FATURALANDIRMA (Android uygulaması içinde zümrüt satışı)
//
// Android uygulaması (TWA) içinde gerçek parayla dijital ürün satmak için
// Google Play kuralı gereği Google Play Faturalandırma kullanılmalı (Shopier
// bağlantısı Android'de hiçbir yerde gösterilmez). Akış:
//
//   1) Oyuncu Zümrüt Mağazası'nda paketi seçer → web tarafı Digital Goods API
//      + Payment Request API ile Google Play ödeme penceresini açar
//      (src/lib/playBilling.js).
//   2) Ödeme bitince Google bir "purchaseToken" verir; istemci bunu
//      verifyPlayPurchase fonksiyonuna yollar.
//   3) Sunucu, Google Play Developer API'den bu satın almanın GERÇEK olduğunu
//      ve ödendiğini doğrular → paketi (zümrüt) TEK SEFER yükler
//      (playPurchases/{tokenHash} belgesi transaction içinde kilit görevi
//      görür) → satın almayı "consume" eder (paket tekrar alınabilir olur ve
//      Google'a "teslim edildi" bildirilmiş olur; 3 gün içinde bildirilmeyen
//      satın almaları Google otomatik iade eder).
//
// v91.1 — İADE / DOLANDIRICILIK KORUMASI (büyük oyunların yaptığı gibi):
//   - Google Play "Voided Purchases API" 30 dakikada bir taranır
//     (playVoidedSweep). İade edilen, ödemesi geri çekilen (chargeback) ya da
//     iptal edilen her satın almanın zümrütü oyuncudan GERİ ALINIR. Oyuncu o
//     zümrütü harcamışsa bakiye EKSİYE düşer (borç); sonraki zümrütlerden
//     kendiliğinden düşülür ve eksi bakiyeyle zümrüt harcanamaz.
//   - İade edilmiş bir satın alma tekrar yüklenemez.
//   - PLAY_REFUND_BLOCK_LIMIT kez iade alan hesabın mağazası kısıtlanır.
// v91.1 — TESLİM GÜVENCESİ:
//   - Tüketilemeyen (Google'a "teslim edildi" denemeyen) satın almalar
//     saatlik taramada tekrar denenir (purchaseToken sunucuda saklanır).
//   - İstemci, uygulama her açıldığında yarım kalanları sunucuya gönderir.
//   - Hiçbir yolla teslim edilemeyen ödeme Google tarafından 3 gün içinde
//     otomatik iade edilir → oyuncu hiçbir durumda parasını kaybetmez.
//
// Play Console'da oluşturulacak ürün kimlikleri (Product ID) aşağıdaki
// PLAY_PRODUCT_TO_PACKAGE anahtarlarıyla BİREBİR aynı olmalı.
// Rehber: docs/play-store/03-PLAY-FATURALANDIRMA-ZUMRUT.md
// =============================================================================
import crypto from 'crypto';

export const PLAY_PACKAGE_NAME = 'com.cetelerinsavasi.twa';

// Play Console ürün kimliği → GOLD_STORE_PACKAGES paketi (functions/index.js).
export const PLAY_PRODUCT_TO_PACKAGE = {
  zumrut_50: 'paket1', // 50 Zümrüt
  zumrut_200: 'paket2', // 200 Zümrüt
};

// Bu kadar iadeden sonra hesabın Play mağazası kısıtlanır (istemci "Satın Al"ı kapatır).
export const PLAY_REFUND_BLOCK_LIMIT = 3;
// Google'ın voided purchases listesi en fazla 30 gün geriye gider.
const VOIDED_MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const VOIDED_OVERLAP_MS = 2 * 60 * 60 * 1000;

// Google'ın iade sebep kodları (voidedReason) → okunur metin
const VOIDED_REASON_TEXT = {
  0: 'diğer',
  1: 'vazgeçme',
  2: 'ürün ulaşmadı',
  3: 'kusurlu',
  4: 'yanlışlıkla satın alma',
  5: 'dolandırıcılık',
  6: 'izinsiz ödeme itirazı',
  7: 'banka ödeme itirazı (chargeback)',
  8: 'teslim onaylanmadı',
};

const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

// Gerçek Google Play Developer API istemcisi. Cloud Functions'ın kendi servis
// hesabıyla (Application Default Credentials) çalışır — bu hesabın e-postası
// Play Console > Kullanıcılar ve izinler'e davet edilmiş olmalı (rehber, Adım 6).
export function createGooglePlayApi() {
  let authPromise = null;
  async function client() {
    if (!authPromise) {
      authPromise = import('google-auth-library').then(({ GoogleAuth }) =>
        new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] }).getClient()
      );
    }
    return authPromise;
  }
  const url = (pkg, productId, token, suffix = '') =>
    `${API_BASE}/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}${suffix}`;
  return {
    async getProductPurchase(pkg, productId, token) {
      const c = await client();
      const res = await c.request({ url: url(pkg, productId, token), method: 'GET' });
      return res.data || {};
    },
    async consume(pkg, productId, token) {
      const c = await client();
      await c.request({ url: url(pkg, productId, token, ':consume'), method: 'POST' });
    },
    // type=0: yalnızca uygulama içi ürünler. Dönen: { voidedPurchases, tokenPagination }
    async listVoided(pkg, { startTime, endTime, token }) {
      const c = await client();
      const params = new URLSearchParams({ startTime: String(startTime), endTime: String(endTime), maxResults: '1000', type: '0' });
      if (token) params.set('token', token);
      const res = await c.request({ url: `${API_BASE}/${encodeURIComponent(pkg)}/purchases/voidedpurchases?${params}`, method: 'GET' });
      return res.data || {};
    },
  };
}

function httpStatusOf(err) {
  return Number(err?.response?.status || err?.status || err?.code || 0);
}

export function createPlayBilling({ db, FieldValue, HttpsError, writeGoldStorePackage, packages, playApi }) {
  const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

  async function tryConsume(ref, productId, purchaseToken) {
    try {
      await playApi.consume(PLAY_PACKAGE_NAME, productId, purchaseToken);
      await ref.set({ consumedAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    } catch (err) {
      console.warn('playBilling consume', productId, httpStatusOf(err), err?.message);
      // Zaten tüketilmişse Google hata döner — durumu sorup kaydı düzelt.
      try {
        const p = await playApi.getProductPurchase(PLAY_PACKAGE_NAME, productId, purchaseToken);
        if (Number(p.consumptionState) === 1) {
          await ref.set({ consumedAt: FieldValue.serverTimestamp() }, { merge: true });
          return true;
        }
      } catch {
        /* sonraki taramada tekrar denenir */
      }
      return false;
    }
  }

  function tokenRef(purchaseToken) {
    return db.collection('playPurchases').doc(tokenHash(purchaseToken));
  }

  async function verifyPlayPurchase(uid, data = {}) {
    const productId = String(data.productId || '').trim();
    const purchaseToken = String(data.purchaseToken || '').trim();
    if (!productId || !purchaseToken || purchaseToken.length > 4096) {
      throw new HttpsError('invalid-argument', 'Eksik satın alma bilgisi.');
    }
    const packageId = PLAY_PRODUCT_TO_PACKAGE[productId];
    const pack = packageId ? packages[packageId] : null;
    if (!pack) throw new HttpsError('invalid-argument', 'Bilinmeyen ürün.');

    const ref = db.collection('playPurchases').doc(tokenHash(purchaseToken));

    // Daha önce yüklendiyse (tekrar deneme / uygulama açılışında listPurchases)
    // Google'a sormadan dön; sadece tüketilmemişse tüketmeyi tekrar dene.
    const pre = await ref.get();
    if (pre.exists && (pre.data().revokedAt || pre.data().voidedAt)) {
      throw new HttpsError('failed-precondition', 'Bu satın alma iade edilmiş / iptal edilmiş.');
    }
    if (pre.exists && pre.data().creditedAt) {
      if (pre.data().uid !== uid) {
        throw new HttpsError('permission-denied', 'Bu satın alma başka bir hesaba yüklenmiş.');
      }
      if (!pre.data().consumedAt) await tryConsume(ref, productId, purchaseToken);
      return { ok: true, credited: false, alreadyCredited: true, emerald: pack.emerald || 0 };
    }

    let purchase;
    try {
      purchase = await playApi.getProductPurchase(PLAY_PACKAGE_NAME, productId, purchaseToken);
    } catch (err) {
      const st = httpStatusOf(err);
      console.error('playBilling verify', productId, st, err?.message, JSON.stringify(err?.response?.data || {}));
      if (st === 400 || st === 404 || st === 410) {
        throw new HttpsError('invalid-argument', 'Google Play bu satın almayı tanımadı.');
      }
      if (st === 401 || st === 403) {
        throw new HttpsError(
          'unavailable',
          'Ödeme alındı ama sunucu Google Play ile doğrulama yapamadı. Merak etme, paran kaybolmaz — biraz sonra mağazayı tekrar açınca otomatik yüklenecek.'
        );
      }
      throw new HttpsError('unavailable', 'Google Play şu an yanıt vermiyor, biraz sonra tekrar dene.');
    }

    // purchaseState: 0 = ödendi, 1 = iptal, 2 = beklemede (ör. nakit ödeme)
    const state = Number(purchase.purchaseState ?? -1);
    if (state === 2) return { ok: false, pending: true };
    if (state !== 0) throw new HttpsError('failed-precondition', 'Bu satın alma iptal edilmiş.');

    let credited = false;
    await db.runTransaction(async (tx) => {
      credited = false;
      const s = await tx.get(ref);
      if (s.exists && (s.data().revokedAt || s.data().voidedAt)) {
        throw new HttpsError('failed-precondition', 'Bu satın alma iade edilmiş / iptal edilmiş.');
      }
      if (s.exists && s.data().creditedAt) {
        if (s.data().uid !== uid) throw new HttpsError('permission-denied', 'Bu satın alma başka bir hesaba yüklenmiş.');
        return;
      }
      writeGoldStorePackage(tx, uid, packageId);
      tx.set(ref, {
        uid,
        productId,
        packageId,
        emerald: pack.emerald || 0,
        orderId: purchase.orderId || null,
        purchaseTimeMillis: purchase.purchaseTimeMillis ? Number(purchase.purchaseTimeMillis) : null,
        // purchaseType: 0 = test (lisans test hesabı), 1 = promosyon, 2 = ödüllü; gerçek satışta alan yoktur
        purchaseType: purchase.purchaseType ?? null,
        regionCode: purchase.regionCode || null,
        // Saklanıyor: tüketme başarısız olursa saatlik tarama tekrar dener.
        // Belge yalnızca sunucuya açık (firestore.rules varsayılan: kapalı).
        purchaseToken,
        consumeAttempts: 0,
        consumedAt: null,
        creditedAt: FieldValue.serverTimestamp(),
        creditedAtMs: Date.now(),
      });
      credited = true;
    });

    await tryConsume(ref, productId, purchaseToken);
    return { ok: true, credited, alreadyCredited: !credited, emerald: pack.emerald || 0 };
  }

  // ---------------------------------------------------------------------------
  // İADE TARAMASI — Google'ın iade/iptal listesi okunur, zümrüt geri alınır.
  // İdempotent: aynı iade iki kez işlenmez (revokedAt). Kontrol noktası:
  // system/playVoidedSweep.lastEndMs (2 saat örtüşmeyle — kaçırma olmasın).
  // ---------------------------------------------------------------------------
  async function revokeVoided(v) {
    const token = String(v?.purchaseToken || '');
    if (!token) return { skipped: true };
    const ref = tokenRef(token);
    const voidInfo = {
      voidedTimeMillis: v.voidedTimeMillis ? Number(v.voidedTimeMillis) : null,
      voidedReason: v.voidedReason ?? null,
      voidedSource: v.voidedSource ?? null,
      voidedOrderId: v.orderId || null,
    };
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists && (s.data().revokedAt || s.data().voidedAt)) return { already: true };
      if (!s.exists || !s.data().creditedAt) {
        // Hiç yüklenmemiş satın alma iade edilmiş — geri alınacak bir şey yok,
        // ama işaretle ki bu token bir daha asla yüklenemesin.
        tx.set(ref, { ...voidInfo, voidedAt: FieldValue.serverTimestamp(), creditedAt: null }, { merge: true });
        return { notCredited: true };
      }
      const rec = s.data();
      const uid = rec.uid;
      const amount = Number(rec.emerald || 0);
      const userRef = db.collection('users').doc(uid);
      const userSnap = await tx.get(userRef);
      const user = userSnap.exists ? userSnap.data() : {};
      const refundCount = Number(user.playRefundCount || 0) + 1;
      const before = Number(user.emerald || 0);
      const after = before - amount;
      tx.set(
        userRef,
        {
          emerald: FieldValue.increment(-amount),
          playRefundCount: FieldValue.increment(1),
          ...(refundCount >= PLAY_REFUND_BLOCK_LIMIT ? { playPurchaseBlocked: true } : {}),
        },
        { merge: true }
      );
      tx.set(ref, { ...voidInfo, revokedAt: FieldValue.serverTimestamp(), revokedEmerald: amount }, { merge: true });
      tx.set(db.collection('playRefunds').doc(), {
        uid,
        tokenHash: ref.id,
        orderId: rec.orderId || voidInfo.voidedOrderId,
        productId: rec.productId,
        emerald: amount,
        emeraldBefore: before,
        emeraldAfter: after,
        refundCount,
        ...voidInfo,
        at: FieldValue.serverTimestamp(),
      });
      const reasonText = VOIDED_REASON_TEXT[Number(voidInfo.voidedReason)] || 'iade';
      tx.set(userRef.collection('messages').doc(), {
        from: 'Zümrüt Mağazası',
        text:
          `Google Play satın alman (${amount} zümrüt) iade edildiği için (${reasonText}) bu zümrütler hesabından geri alındı.` +
          (after < 0 ? ` Zümrüt bakiyen ${after} oldu; eksi bakiye sonraki zümrütlerinden düşülür.` : '') +
          (refundCount >= PLAY_REFUND_BLOCK_LIMIT ? ' Tekrarlanan iadeler nedeniyle hesabında zümrüt satın alma kısıtlandı.' : ''),
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { revoked: true, uid, amount, after, refundCount };
    });
  }

  async function processVoidedPurchases(nowMs = Date.now()) {
    const stateRef = db.collection('system').doc('playVoidedSweep');
    const st = (await stateRef.get()).data() || {};
    const minStart = nowMs - VOIDED_MAX_LOOKBACK_MS + 60_000;
    const startTime = Math.max(minStart, Number(st.lastEndMs || 0) - VOIDED_OVERLAP_MS);
    const endTime = nowMs;
    const out = { seen: 0, revoked: 0, notCredited: 0, already: 0 };
    let token = null;
    let pages = 0;
    do {
      const res = await playApi.listVoided(PLAY_PACKAGE_NAME, { startTime, endTime, token });
      for (const v of res.voidedPurchases || []) {
        out.seen += 1;
        const r = await revokeVoided(v);
        if (r.revoked) out.revoked += 1;
        else if (r.notCredited) out.notCredited += 1;
        else if (r.already) out.already += 1;
      }
      token = res.tokenPagination?.nextPageToken || null;
      pages += 1;
    } while (token && pages < 50);
    await stateRef.set({ lastEndMs: endTime, lastRunAt: FieldValue.serverTimestamp(), last: out }, { merge: true });
    return out;
  }

  // ---------------------------------------------------------------------------
  // TÜKETME TEKRARI — zümrütü yüklenmiş ama Google'a "teslim edildi"
  // denememiş satın almalar (ağ hatası vb.) tekrar denenir. Bu yapılmazsa
  // Google 3 gün sonra parayı iade eder ve oyuncu zümrütü bedavaya almış olur.
  // ---------------------------------------------------------------------------
  async function retryPendingConsumes(nowMs = Date.now()) {
    const snap = await db.collection('playPurchases').where('consumedAt', '==', null).limit(200).get();
    let ok = 0;
    for (const d of snap.docs) {
      const r = d.data();
      if (!r.creditedAt || !r.purchaseToken || r.revokedAt || r.voidedAt) continue;
      if (nowMs - Number(r.creditedAtMs || 0) < 5 * 60 * 1000) continue; // taze olanlar zaten deneniyor
      await d.ref.set({ consumeAttempts: FieldValue.increment(1) }, { merge: true });
      if (await tryConsume(d.ref, r.productId, r.purchaseToken)) ok += 1;
    }
    return { checked: snap.size, consumed: ok };
  }

  return { verifyPlayPurchase, processVoidedPurchases, revokeVoided, retryPendingConsumes };
}
