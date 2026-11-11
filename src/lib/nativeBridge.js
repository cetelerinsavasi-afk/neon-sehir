// =============================================================================
// v148 — Android WebView kabuğunun native köprüsü (window.NeonAndroid).
//
// Köprü SADECE yeni WebView uygulamasında (android-webview/, versionCode 14+)
// vardır. Tarayıcıda ve eski TWA uygulamasında window.NeonAndroid yoktur; bu
// dosyadaki her yardımcı o durumda ya hiçbir şey yapmaz ya da mevcut web
// davranışına düşer.
//
// Native taraf sonuçları şu çağrıyla geri verir (ana thread'de):
//   window.__neonNative.resolve("<JSON metni>")
//   JSON: { requestId: "...", ok: true|false, ...sonuç alanları }
//
// Bu dosya Firestore'a / ağa HİÇBİR istek atmaz.
// =============================================================================
import { IS_ANDROID_WEBVIEW } from './platform';

const pending = new Map();
let seq = 0;

function bridge() {
  if (!IS_ANDROID_WEBVIEW || typeof window === 'undefined') return null;
  const b = window.NeonAndroid;
  return b && typeof b === 'object' ? b : null;
}

export function hasNativeBridge() {
  return Boolean(bridge());
}

function installResolver() {
  if (typeof window === 'undefined') return;
  if (window.__neonNative && window.__neonNative.__installed) return;
  window.__neonNative = {
    __installed: true,
    resolve(raw) {
      let msg;
      try {
        msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        return;
      }
      const id = msg && msg.requestId;
      const entry = id ? pending.get(id) : null;
      if (!entry) return; // zaman aşımına uğramış / bilinmeyen istek
      pending.delete(id);
      clearTimeout(entry.timer);
      entry.resolve(msg);
    },
  };
}
if (IS_ANDROID_WEBVIEW) installResolver();

// Asenkron köprü çağrısı: native metodun İLK argümanı requestId'dir.
// Zaman aşımında { ok:false, timeout:true } ile çözülür (asla reddetmez,
// köprü yoksa null döner).
function callAsync(method, args, timeoutMs) {
  const b = bridge();
  if (!b || typeof b[method] !== 'function') return Promise.resolve(null);
  installResolver();
  seq += 1;
  const requestId = `r${Date.now().toString(36)}_${seq}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ requestId, ok: false, timeout: true });
    }, timeoutMs);
    pending.set(requestId, { resolve, timer });
    try {
      b[method](requestId, ...args);
    } catch (err) {
      pending.delete(requestId);
      clearTimeout(timer);
      resolve({ requestId, ok: false, error: String(err?.message || err) });
    }
  });
}

// ---------------------------------------------------------------- Google girişi
// Dönen: { ok:true, idToken } | { ok:false, cancelled:true } |
//        { ok:false, error:"Türkçe mesaj" } | { ok:false, timeout:true } | null (köprü yok)
// Zaman aşımı uzun (5 dk): oyuncu hesap seçicide yeni Google hesabı ekliyor
// olabilir; vazgeçerse native taraf zaten "cancelled" bildirir.
export function nativeGoogleSignIn() {
  return callAsync('signInWithGoogle', [], 5 * 60_000);
}

// Credential Manager'daki kayıtlı hesap seçimini temizler. Hata verirse yutulur.
export function nativeSignOutGoogle() {
  try {
    bridge()?.signOutGoogle?.();
  } catch {
    /* yoksay */
  }
}

// ------------------------------------------------------------------ Uygulamadan çık
// WebView'da window.close() işe yaramaz; native finish() çağrılır.
// Köprü yoksa false döner (çağıran mevcut web davranışına devam eder).
export function nativeExitApp() {
  const b = bridge();
  if (!b || typeof b.exitApp !== 'function') return false;
  try {
    b.exitApp();
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------- Pano
// Önce navigator.clipboard denenir (tarayıcıda/TWA'da davranış birebir aynı).
// Başarısız olursa ve WebView köprüsü varsa native panoya yazılır.
// İkisi de olmazsa İLK hata aynen fırlatılır (çağıranların catch'i değişmez).
export async function copyText(text) {
  const value = String(text ?? '');
  let firstErr;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard yok');
    await navigator.clipboard.writeText(value);
    return true;
  } catch (err) {
    firstErr = err;
  }
  const b = bridge();
  if (b && typeof b.copyText === 'function') {
    try {
      if (b.copyText(value) === true) return true;
    } catch {
      /* aşağıda ilk hata fırlatılır */
    }
  }
  throw firstErr;
}

// ------------------------------------------------------------- Dosya kaydetme
// Blob'u telefonun İndirilenler klasörüne kaydeder (WebView'da blob: indirmesi
// çalışmaz). 512 KB'tan küçük dosyalar tek çağrıda (saveFile), büyükler 512 KB'lık
// parçalarla (saveFileBegin / saveFileChunk / saveFileEnd) gönderilir; böylece
// köprüden tek seferde birkaç MB'lık metin geçmez.
// Dönen: { ok:true, name } | { ok:false, error } | null (köprü yok)
const CHUNK_BYTES = 512 * 1024;

function bytesToBase64(bytes) {
  let bin = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

export async function nativeSaveBlob(blob, fileName, mimeType) {
  const b = bridge();
  if (!b) return null;
  const type = mimeType || blob.type || 'application/octet-stream';
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (bytes.length <= CHUNK_BYTES) {
    return callAsync('saveFile', [fileName, type, bytesToBase64(bytes)], 60_000);
  }

  if (typeof b.saveFileBegin !== 'function') return { ok: false, error: 'Kaydetme desteklenmiyor.' };
  let transferId = '';
  try {
    transferId = String(b.saveFileBegin(fileName, type) || '');
  } catch {
    transferId = '';
  }
  if (!transferId) return { ok: false, error: 'Dosya kaydedilemedi.' };
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    let ok = false;
    try {
      ok = b.saveFileChunk(transferId, bytesToBase64(bytes.subarray(i, i + CHUNK_BYTES))) === true;
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        b.saveFileAbort?.(transferId);
      } catch {
        /* yoksay */
      }
      return { ok: false, error: 'Dosya kaydedilemedi.' };
    }
    // arayüz donmasın
    await new Promise((r) => setTimeout(r, 0));
  }
  return callAsync('saveFileEnd', [transferId], 60_000);
}

// ------------------------------------------------- v155 Google Play Faturalandırma (native)
// Sadece köprüsünde faturalandırma OLAN WebView sürümünde (v15+) çalışır. Karar sürüm
// numarasına göre değil köprünün yeteneğine göre: getInfo().billing === true.
// getInfo() senkron (JavascriptInterface) → modül ilk kullanıldığında bir kez okunur;
// böylece mağaza ilk çizimde bir görünüp bir kaybolmaz. Native taraf ASLA zümrüt yüklemez,
// Firestore'a dokunmaz; zümrütü SADECE sunucu (verifyPlayPurchase) yükler.
let billingCap = null;
export function hasNativeBilling() {
  if (billingCap !== null) return billingCap;
  billingCap = false;
  const b = bridge();
  if (!b || typeof b.getInfo !== 'function') return billingCap;
  try {
    const info = JSON.parse(b.getInfo() || '{}');
    billingCap = info?.billing === true && typeof b.billingPurchase === 'function';
  } catch {
    billingCap = false;
  }
  return billingCap;
}

const BILLING_TIMEOUT = 20_000;
const PURCHASE_TIMEOUT = 10 * 60_000;
const billingReady = () => hasNativeBilling();

// [{ itemId, title, price, priceAmountMicros, priceCurrencyCode }] | { error, code, unavailable }
export async function nativeBillingDetails(productIds) {
  if (!billingReady()) return null;
  return callAsync('billingGetDetails', [JSON.stringify(productIds || [])], BILLING_TIMEOUT);
}
// { ok, productId, purchaseToken, orderId, quantity } | { pending, productId, purchaseToken }
// | { cancelled } | { alreadyOwned } | { error, code, unavailable } | { timeout }
// accountHash: Firebase UID'nin SHA-256 özeti (64 hex) — Play'e hile sinyali (ham UID gitmez)
export async function nativeBillingPurchase(productId, accountHash) {
  if (!billingReady()) return null;
  return callAsync('billingPurchase', [String(productId), accountHash ? String(accountHash) : ''], PURCHASE_TIMEOUT);
}
// { ok, purchases: [{ itemId, purchaseToken, purchaseState, quantity }] } (sadece PURCHASED)
export async function nativeBillingList() {
  if (!billingReady()) return null;
  return callAsync('billingListPurchases', [], BILLING_TIMEOUT);
}
// Sunucu doğruladıktan SONRA çağrılır; hata yutulur (sunucu zaten tüketiyor)
export async function nativeBillingConsume(purchaseToken) {
  if (!billingReady()) return null;
  return callAsync('billingConsume', [String(purchaseToken)], BILLING_TIMEOUT);
}
