// =============================================================================
// v91 — Google Play Faturalandırma (Android uygulaması / TWA içinde)
//
// Android uygulamasında gerçek parayla zümrüt satışı Google Play üzerinden
// yapılır (Play kuralı). Tarayıcı tarafında iki standart API kullanılır:
//   - Digital Goods API  → ürünlerin Play'deki fiyatlarını getirir,
//                          yarım kalmış satın almaları listeler, tüketir.
//   - Payment Request API → Google Play ödeme penceresini açar.
// Satın alma sonrası "purchaseToken" sunucuya (verifyPlayPurchase) gönderilir;
// zümrütü SUNUCU, Google'dan doğruladıktan sonra yükler.
//
// Ürün kimlikleri Play Console'daki "Ürün kimliği" ile BİREBİR aynı olmalı
// (sunucuda: functions/playBilling.js > PLAY_PRODUCT_TO_PACKAGE).
// =============================================================================
import { IS_ANDROID_APP, IS_ANDROID_WEBVIEW } from './platform';
import { verifyPlayPurchase } from '../services/gameActions';
import { hasNativeBilling, nativeBillingDetails, nativeBillingPurchase, nativeBillingList, nativeBillingConsume } from './nativeBridge';

// -----------------------------------------------------------------------------
// v155 — KAPATMA ANAHTARI (WebView v15+ native Play ödemesi)
// false yapıp siteyi yayınlarsan: WebView'da Zümrüt Mağazası ve "Satın Al" GİZLENİR
// (yeni AAB gerekmez). AMA açılıştaki sessiz geri yükleme (quietRestorePlayPurchases →
// sunucu doğrulaması) ÇALIŞMAYA DEVAM EDER — o anda bekleyen bir ödeme varsa zümrüt yine
// yüklenir; yoksa Google 3 gün içinde tüketilmeyen ödemeyi iade eder ve oyuncu zümrütünü
// alamaz. Eski TWA ve tarayıcı bu anahtardan etkilenmez.
// -----------------------------------------------------------------------------
export const NATIVE_PLAY_BILLING_ON = true;

// WebView'da mağaza açık mı? (köprüde faturalandırma var + anahtar açık). Senkron.
export const webViewStoreOpen = () => IS_ANDROID_WEBVIEW && hasNativeBilling() && NATIVE_PLAY_BILLING_ON;
// Zümrüt mağazasına yönlendiren yazılar ("Telefon › Zümrüt Mağazası") gösterilsin mi?
export const zumrutStoreReachable = () => !IS_ANDROID_WEBVIEW || webViewStoreOpen();
// Sessiz geri yükleme bu cihazda çalışsın mı? (anahtardan BAĞIMSIZ — bkz. yukarısı)
export const playRestoreSupported = () => IS_ANDROID_APP && (!IS_ANDROID_WEBVIEW || hasNativeBilling());

// v155: native adaptör — Digital Goods servisiyle AYNI arayüz (getDetails / listPurchases / consume)
// + purchase. "Bu cihazda Play kullanılamıyor" (BILLING_UNAVAILABLE vb.) durumunu `unavailable` ile verir.
function createNativeService() {
  const svc = {
    isNative: true,
    unavailable: false,
    async getDetails(ids) {
      const r = await nativeBillingDetails(ids);
      if (Array.isArray(r?.items)) {
        svc.unavailable = false;
        return r.items;
      }
      if (r?.unavailable) svc.unavailable = true;
      const e = new Error(r?.error || (r?.timeout ? 'Google Play yanıt vermedi.' : 'Google Play fiyatları alınamadı.'));
      e.name = r?.code != null ? `PlayBilling${r.code}` : 'PlayBilling';
      throw e;
    },
    async listPurchases() {
      const r = await nativeBillingList();
      if (Array.isArray(r?.purchases)) return r.purchases;
      if (r?.unavailable) svc.unavailable = true;
      throw new Error(r?.error || 'Google Play satın alma listesi alınamadı.');
    },
    async consume(purchaseToken) {
      await nativeBillingConsume(purchaseToken);
    },
    purchase: (productId, accountHash) => nativeBillingPurchase(productId, accountHash),
  };
  return svc;
}
let nativeService = null;

export const PLAY_BILLING_METHOD = 'https://play.google.com/billing';

export const PLAY_PRODUCTS = [
  // FİYAT: Play Console'da fiyatı değiştirirsen buradaki `price` yazısını da
  // güncelle (mağazada gösterilen yazı). Play canlı fiyat verirse o kullanılır.
  { productId: 'zumrut_50', packageId: 'paket1', emerald: 50, price: '49,99 TL' },
  { productId: 'zumrut_200', packageId: 'paket2', emerald: 200, price: '159,99 TL', badge: 'EN AVANTAJLI' },
];

let servicePromise = null;

// Play Faturalandırma bu cihazda kullanılabilir mi? (Android uygulaması +
// uygulama kabuğu faturalandırma destekli sürüm + Chrome 101+)
export async function getPlayBillingService() {
  // v155: WebView kabuğunda native faturalandırma (köprü yeteneği: getInfo().billing). Kapatma
  // anahtarı kapalıyken de servis döner (sessiz geri yükleme çalışsın); satın alma ayrıca engellenir.
  if (IS_ANDROID_WEBVIEW) {
    if (!hasNativeBilling()) return null; // v14: faturalandırmasız kabuk → mağaza kapalı
    if (!nativeService) nativeService = createNativeService();
    return nativeService;
  }
  // Eski TWA: Digital Goods API (DEĞİŞMEDİ)
  if (!IS_ANDROID_APP || typeof window === 'undefined' || !('getDigitalGoodsService' in window)) return null;
  if (!servicePromise) {
    servicePromise = window.getDigitalGoodsService(PLAY_BILLING_METHOD).catch((err) => {
      console.warn('Play Faturalandırma kullanılamıyor:', err);
      servicePromise = null;
      return null;
    });
  }
  return servicePromise;
}

// Play'deki yerel fiyatlar: { zumrut_50: '₺49,99', ... }
// v91.5: Play'in döndürdüğü fiyat farklı biçimlerde gelebiliyor (price.value,
// price.amount, priceAmountMicros, düz metin) — hepsi tanınır. Toplu sorgu boş
// dönerse ürünler tek tek sorulur; olmadıysa sebep `diag` ile ekrana verilir.
let lastPriceDiag = '';
export function getPlayPriceDiag() {
  return lastPriceDiag;
}
function formatPrice(d) {
  if (!d) return null;
  const p = d.price;
  if (typeof p === 'string' && p.trim()) return p.trim();
  let value = p?.value ?? p?.amount ?? null;
  let cur = p?.currency ?? p?.currencyCode ?? d.priceCurrencyCode ?? null;
  if (value == null && d.priceAmountMicros != null) value = Number(d.priceAmountMicros) / 1e6;
  if (value == null && typeof d.formattedPrice === 'string') return d.formattedPrice;
  if (value == null || !cur) return null;
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur }).format(Number(value));
  } catch {
    return `${value} ${cur}`;
  }
}
async function fetchDetails(service, ids) {
  try {
    const r = await service.getDetails(ids);
    return { list: Array.isArray(r) ? r : [], err: null };
  } catch (err) {
    return { list: [], err };
  }
}
export async function getPlayPrices(service) {
  const out = {};
  const ids = PLAY_PRODUCTS.map((p) => p.productId);
  let list = [];
  let lastErr = null;
  for (const wait of [0, 1500, 4000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const r = await fetchDetails(service, ids);
    list = r.list;
    lastErr = r.err;
    if (list.length) break;
    // Toplu sorgu boşsa tek tek dene (bir ürün sorunluysa diğerleri gelsin)
    for (const id of ids) {
      const one = await fetchDetails(service, [id]);
      if (one.list.length) list.push(...one.list);
      else if (one.err) lastErr = one.err;
    }
    if (list.length) break;
  }
  list.forEach((d) => {
    const f = formatPrice(d);
    if (f && d?.itemId) out[d.itemId] = f;
  });
  if (Object.keys(out).length === ids.length) {
    lastPriceDiag = '';
  } else if (lastErr) {
    lastPriceDiag = `${lastErr.name || 'Hata'}: ${String(lastErr.message || lastErr).slice(0, 120)}`;
  } else if (!list.length) {
    lastPriceDiag = 'Play boş liste döndürdü';
  } else {
    try {
      lastPriceDiag = 'Biçim: ' + JSON.stringify(list[0]).slice(0, 160);
    } catch {
      lastPriceDiag = 'Fiyat biçimi tanınmadı';
    }
  }
  if (lastPriceDiag) console.warn('Play fiyat tanısı:', lastPriceDiag);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set(['functions/unavailable', 'functions/internal', 'functions/deadline-exceeded', 'functions/resource-exhausted', 'unavailable', 'internal']);

// v91.1: ağ / sunucu geçici hatalarında 3 kez dener (0 sn, 2 sn, 6 sn).
// Yine olmazsa satın alma sunucuda bekletilir (playPending) ve 30 dakikalık
// taramayla / uygulama açılışında restorePlayPurchases ile tamamlanır.
async function verifyWithRetry(productId, purchaseToken) {
  let lastErr = null;
  for (const wait of [0, 2000, 6000]) {
    if (wait) await sleep(wait);
    try {
      return await verifyPlayPurchase(productId, purchaseToken);
    } catch (err) {
      lastErr = err;
      const code = String(err?.code || '');
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!RETRYABLE.has(code) && !offline && code) throw err;
    }
  }
  const e = new Error(
    '✓ Ödemen alındı. Zümrütlerin kısa süre içinde yüklenecek, SMS ile haber vereceğiz.'
  );
  e.safePending = true;
  e.cause = lastErr;
  throw e;
}

// v155: aynı jeton aynı anda iki kez doğrulanmasın (satın alma sonucu + o anda çalışan geri yükleme).
// Sunucu zaten tek seferlik yüklüyor; bu kilit "+N zümrüt" mesajının iki kez çıkmasını önler.
const verifying = new Map();
function verifyAndConsume(service, productId, purchaseToken) {
  const k = `${productId}|${purchaseToken}`;
  if (verifying.has(k)) return verifying.get(k).then((d) => ({ ...d, credited: false }));
  const p = verifyAndConsumeOnce(service, productId, purchaseToken).finally(() => verifying.delete(k));
  verifying.set(k, p);
  return p;
}
async function verifyAndConsumeOnce(service, productId, purchaseToken) {
  const res = await verifyWithRetry(productId, purchaseToken);
  const data = res?.data || {};
  if (data.ok) {
    // Sunucu zaten tüketiyor; burada da denemek zararsız (zaten tüketildiyse hata yutulur).
    try {
      await service.consume(purchaseToken);
    } catch {
      /* zaten tüketilmiş */
    }
  }
  return data;
}

// v155: adet koruması — sunucu her jeton için TEK paket yükler. Play'den birden çok adet
// gelirse doğrulamaya gönderilmez (tüketilmez → Google 3 gün içinde otomatik iade eder).
export const MULTI_QTY_TEXT = 'Aynı anda birden fazla paket alınamaz. Bu ödeme 3 gün içinde Google Play tarafından otomatik iade edilecek.';
const multiQty = (p) => Number(p?.quantity || 1) > 1;

// v155: Play'e hile sinyali — Firebase UID'nin SHA-256 özeti (64 hex). Ham UID / e-posta GİTMEZ.
export async function accountHashOf(uid) {
  try {
    if (!uid || !globalThis.crypto?.subtle) return '';
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(uid)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

const unavailableErr = () => {
  const e = new Error('Google Play ödemesi bu cihazda kullanılamıyor.');
  e.unavailable = true;
  return e;
};

// v155: WebView v15+ — native Play ödeme akışı (Payment Request yerine). Dönüş biçimi aynı.
async function buyWithNative(service, productId, uid) {
  if (!NATIVE_PLAY_BILLING_ON) throw new Error('Zümrüt satın alma şu an kapalı.');
  const r = await service.purchase(productId, await accountHashOf(uid));
  if (!r) throw unavailableErr();
  if (r.cancelled) return { cancelled: true };
  if (r.alreadyOwned) {
    // Önceki bir satın alma tüketilmemiş (ör. internet kesildi) → önce onu tamamla
    const n = await restorePlayPurchases(service);
    if (n > 0) return { ok: true, emerald: n, restored: true };
    return { ok: false, alreadyOwned: true };
  }
  if (r.timeout) {
    const e = new Error('✓ Google Play yanıtı gecikti. Ödeme yaptıysan zümrütlerin kısa süre içinde yüklenecek.');
    e.safePending = true;
    throw e;
  }
  if (r.unavailable) {
    service.unavailable = true;
    throw unavailableErr();
  }
  if (r.error) throw new Error(r.error);
  if (multiQty(r)) throw new Error(MULTI_QTY_TEXT);
  if (r.pending) return { pending: true };
  if (!r.purchaseToken) throw new Error('Google Play bir satın alma bilgisi döndürmedi.');
  return verifyAndConsume(service, productId, r.purchaseToken);
}

// Paketi satın al. Dönen: { ok, emerald } | { pending } | { cancelled } — hata ise fırlatır.
// uid: oturumdaki oyuncu (sadece native yolda, SHA-256 özeti Play'e gider)
export async function buyWithPlay(service, productId, uid = null) {
  if (service?.isNative) return buyWithNative(service, productId, uid);
  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: productId } }],
    // Play bu tutarı kullanmaz ama Payment Request API zorunlu tutuyor.
    { total: { label: 'Toplam', amount: { currency: 'TRY', value: '0' } } }
  );
  let response;
  try {
    response = await request.show();
  } catch (err) {
    if (err?.name === 'AbortError') return { cancelled: true };
    if (err?.name === 'NotSupportedError') {
      // Uygulama eski sürüm / Play dışından kurulmuş / tarayıcı desteklemiyor.
      throw new Error(
        "Bu cihazda Google Play ödemesi açılamadı. Neon Şehir'i Google Play Store'dan güncelleyip tekrar dene. Sorun sürerse telefonunda varsayılan tarayıcı olarak Chrome'u seç."
      );
    }
    throw err;
  }
  const purchaseToken = response?.details?.purchaseToken;
  if (!purchaseToken) {
    await response.complete('fail').catch(() => {});
    throw new Error('Google Play bir satın alma bilgisi döndürmedi.');
  }
  try {
    const data = await verifyAndConsume(service, productId, purchaseToken);
    await response.complete(data.ok || data.pending ? 'success' : 'fail').catch(() => {});
    return data;
  } catch (err) {
    // Ödeme alındı ama doğrulama şimdilik yapılamadı: Play penceresini
    // "başarılı" kapat (ödeme gerçekten yapıldı), zümrüt sonra yüklenecek.
    await response.complete(err?.safePending ? 'success' : 'fail').catch(() => {});
    throw err;
  }
}

// v91.1: uygulama açılışında ve öne gelişinde sessizce yarım kalanları tamamla.
let quietRestoreRunning = false;
export async function quietRestorePlayPurchases() {
  if (quietRestoreRunning) return 0;
  quietRestoreRunning = true;
  try {
    const svc = await getPlayBillingService();
    return svc ? await restorePlayPurchases(svc) : 0;
  } catch {
    return 0;
  } finally {
    quietRestoreRunning = false;
  }
}

// Yarım kalmış (ödendi ama zümrütü yüklenmemiş) satın almaları tamamlar —
// ör. ödeme sonrası internet kesildiyse. Mağaza her açıldığında çağrılır.
// Dönen: yüklenen toplam zümrüt.
export async function restorePlayPurchases(service) {
  let total = 0;
  let list = [];
  try {
    list = (await service.listPurchases()) || [];
  } catch (err) {
    console.warn('Play satın alma listesi alınamadı:', err);
    return 0;
  }
  for (const p of list) {
    if (!PLAY_PRODUCTS.some((x) => x.productId === p.itemId)) continue;
    if (multiQty(p)) {
      // v155: birden çok adet → doğrulanmaz (3 günde otomatik iade)
      console.warn('Play satın alma birden çok adet, atlandı:', p.itemId);
      continue;
    }
    try {
      const data = await verifyAndConsume(service, p.itemId, p.purchaseToken);
      if (data.ok && data.credited) total += Number(data.emerald || 0);
    } catch (err) {
      console.warn('Play satın alma tamamlanamadı:', p.itemId, err);
    }
  }
  return total;
}
