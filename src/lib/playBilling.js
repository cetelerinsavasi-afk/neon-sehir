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
import { IS_ANDROID_APP } from './platform';
import { verifyPlayPurchase } from '../services/gameActions';

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
// Yine olmazsa satın alma Play'de "tüketilmemiş" kalır → uygulama bir sonraki
// açılışta / mağaza açılışında restorePlayPurchases ile tamamlanır. Hiç
// tamamlanamazsa Google 3 gün içinde parayı kendiliğinden iade eder.
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
    'Ödemen güvende ✓ Zümrütlerin birkaç dakika içinde otomatik yüklenecek (uygulamayı kapatıp açman da yeterli). Yüklenmezse Google ödemeni 3 gün içinde kendiliğinden iade eder.'
  );
  e.safePending = true;
  e.cause = lastErr;
  throw e;
}

async function verifyAndConsume(service, productId, purchaseToken) {
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

// Paketi satın al. Dönen: { ok, emerald } | { pending } | { cancelled } — hata ise fırlatır.
export async function buyWithPlay(service, productId) {
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
    try {
      const data = await verifyAndConsume(service, p.itemId, p.purchaseToken);
      if (data.ok && data.credited) total += Number(data.emerald || 0);
    } catch (err) {
      console.warn('Play satın alma tamamlanamadı:', p.itemId, err);
    }
  }
  return total;
}
