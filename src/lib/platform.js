// platform.js — Web / Android (Google Play TWA) ayrımı.
//
// TEK KARAR NOKTASI: Uygulamanın geri kalanı platformu SADECE buradaki
// IS_ANDROID_APP / PLATFORM değerlerinden okur. Değer modül ilk
// yüklendiğinde (React render'ından ÖNCE, bkz. main.jsx) BİR KEZ hesaplanır
// ve oturum boyunca sabittir.
//
// Android (TWA) sayılmak için şu sinyallerden biri gerekir:
//   1) Açılış URL'inde ?src=twa  (APK'nin launch URL'i: /?src=twa)
//   2) document.referrer === android-app://<bizim paketimiz>/
//      (TWA ilk açılışta referrer'ı bu şekilde verir; yenilemede kaybolur)
//   3) Aynı sekme oturumunda daha önce 1 veya 2 görülmüş olması
//      (sessionStorage'daki işaret — sayfa yenilense de TWA'da kalır)
//
// v148 — Android WebView kabuğu (android-webview/, versionCode 14+) için ek
// sinyaller (herhangi biri yeterli):
//   4) Açılış URL'inde ?src=app
//   5) navigator.userAgent içinde KENDİ ekimiz "NeonSehirApp/<sürüm>"
//      (genel "Android"/"wv" ifadeleri ile tespit YAPILMAZ — bkz. aşağısı)
//   6) window.NeonAndroid köprüsünün varlığı (sadece bizim uygulama ekler)
// Bu sinyallerden biri varsa IS_ANDROID_WEBVIEW = true; eski TWA sinyalleri
// (1-3) aynen geçerli ve IS_ANDROID_TWA'yı verir. IS_ANDROID_APP ikisinde de
// true'dur (Shopier gizleme vb. mevcut mantık WebView'ı da kapsar).
//
// Hiçbiri yoksa → WEB. Varsayılan her zaman WEB'dir; herhangi bir hata
// (sessionStorage erişimi engelli vb.) de WEB sonucunu verir.
//
// BİLEREK KULLANILMAYANLAR:
//   - navigator.userAgent: TWA, Android Chrome ile aynı UA'yı kullanır;
//     Android Chrome'daki web oyuncularını yanlışlıkla Android sayardı.
//   - display-mode: standalone: ana ekrana eklenmiş PWA'da da true'dur.
//   - localStorage: TWA, telefondaki Chrome ile aynı origin depolamasını
//     paylaşır; işaret localStorage'a yazılsaydı aynı telefonda Chrome'dan
//     siteye giren oyuncu da "Android" sayılırdı. Bu yüzden SADECE
//     sessionStorage (sekmeye özel) kullanılıyor.
//   - Genel "android-app://" eşleşmesi: Gmail/WhatsApp gibi başka bir
//     uygulamadan Chrome'da açılan linklerde de referrer android-app://...
//     olabilir. Bu yüzden SADECE bizim paket ad alanımız kabul edilir.

import { LATEST_ANDROID_APP_VERSION, LATEST_ANDROID_APP_VERSION_SET_AT } from './androidAppVersion.js';

export const PLATFORM_WEB = 'web';
export const PLATFORM_ANDROID = 'android';

const TWA_QUERY_KEY = 'src';
const TWA_QUERY_VALUE = 'twa';
const APP_QUERY_VALUE = 'app'; // v148: WebView kabuğunun açılış adresi /?src=app&av=N
// v148: WebView kabuğu UA'nın sonuna " NeonSehirApp/<versionCode>" ekler.
const APP_UA_RE = /\bNeonSehirApp\/(\d+)/;
const SESSION_KEY = 'ns_platform';
const SHELL_SESSION_KEY = 'ns_shell'; // v148: 'webview' (sadece WebView kabuğunda yazılır)
// v91: Android uygulama sürümü (açılış adresindeki ?av=N). 1.0.12'den (12)
// önceki sürümlerin açılış adresinde av yoktur → 0 sayılır.
const APP_VERSION_QUERY_KEY = 'av';
const APP_VERSION_SESSION_KEY = 'ns_app_ver';

// Zümrüt mağazasının (Google Play ödemesi) çalıştığı en eski Android sürümü.
// Bundan eski uygulamalarda "Güncelle" uyarısı gösterilir. Yeni bir zorunlu
// Android güncellemesi çıkınca bu sayıyı yükselt.
export const MIN_ANDROID_APP_VERSION = 12;
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.cetelerinsavasi.twa';

function uaAppVersion() {
  try {
    const m = APP_UA_RE.exec(navigator.userAgent || '');
    const v = m ? Number(m[1]) : 0;
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function captureAppVersion() {
  try {
    const v = Number(new URLSearchParams(window.location.search).get(APP_VERSION_QUERY_KEY));
    if (Number.isInteger(v) && v > 0) {
      window.sessionStorage.setItem(APP_VERSION_SESSION_KEY, String(v));
      return v;
    }
    const s = Number(window.sessionStorage.getItem(APP_VERSION_SESSION_KEY));
    if (Number.isInteger(s) && s > 0) return s;
  } catch {
    // sessionStorage kapalı olabilir — aşağıdaki UA yedeğine düş
  }
  // v148: WebView kabuğunda sürüm UA ekinden de okunur (yenilemede kaybolmaz).
  return uaAppVersion();
}
// Modül yüklenirken, URL temizlenmeden ÖNCE okunur.
const CAPTURED_APP_VERSION = typeof window === 'undefined' ? 0 : captureAppVersion();

// com.cetelerinsavasi ve altındaki her paket adı kabul edilir
// (örn. com.cetelerinsavasi.twa, ileride com.cetelerinsavasi.app).
// Başka hiçbir uygulamanın referrer'ı eşleşmez.
const TWA_REFERRER_RE = /^android-app:\/\/com\.cetelerinsavasi(\.[a-z0-9_]+)*(\/|$)/i;

function hasTwaQueryParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(TWA_QUERY_KEY) === TWA_QUERY_VALUE;
  } catch {
    return false;
  }
}

function hasAppQueryParam() {
  try {
    return new URLSearchParams(window.location.search).get(TWA_QUERY_KEY) === APP_QUERY_VALUE;
  } catch {
    return false;
  }
}

function hasAppUserAgent() {
  try {
    return APP_UA_RE.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

function hasNativeBridge() {
  try {
    return typeof window.NeonAndroid === 'object' && window.NeonAndroid !== null;
  } catch {
    return false;
  }
}

function readShellFlag() {
  try {
    return window.sessionStorage.getItem(SHELL_SESSION_KEY) === 'webview';
  } catch {
    return false;
  }
}

// v148: WebView kabuğu mu? (sinyal 4, 5 veya 6; ya da bu sekmede daha önce görüldü)
function detectWebViewShell() {
  try {
    if (typeof window === 'undefined') return false;
    if (hasAppQueryParam() || hasAppUserAgent() || hasNativeBridge()) {
      try {
        window.sessionStorage.setItem(SHELL_SESSION_KEY, 'webview');
      } catch {
        /* sessionStorage kapalı — UA/köprü her açılışta zaten var */
      }
      return true;
    }
    return readShellFlag();
  } catch {
    return false;
  }
}

function hasTwaReferrer() {
  try {
    return TWA_REFERRER_RE.test(document.referrer || '');
  } catch {
    return false;
  }
}

function readSessionFlag() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === PLATFORM_ANDROID;
  } catch {
    return false;
  }
}

// Sadece 'android' yazılır; 'web' hiçbir zaman yazılmaz (yanlış bir web
// sonucunun oturumda kalıcı hale gelmesini önlemek için).
function writeSessionFlag() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, PLATFORM_ANDROID);
  } catch {
    // sessionStorage kapalı olabilir — yok say; bu açılışta URL/referrer
    // sinyali zaten var, sonuç yine Android.
  }
}

// ?src=twa (v148: veya ?src=app) parametresini adres çubuğundan sessizce siler (sayfa yeniden
// yüklenmez, geçmişe yeni kayıt eklenmez). Diğer parametreler ve #hash
// aynen korunur. SADECE Android tespitinden sonra ve parametre gerçekten
// src=twa ise çalışır — web'de hiçbir zaman çağrılmaz.
function stripTwaQueryParam() {
  try {
    const url = new URL(window.location.href);
    const src = url.searchParams.get(TWA_QUERY_KEY);
    if (src !== TWA_QUERY_VALUE && src !== APP_QUERY_VALUE) return;
    url.searchParams.delete(TWA_QUERY_KEY);
    url.searchParams.delete(APP_VERSION_QUERY_KEY);
    const cleaned = url.pathname + url.search + url.hash;
    window.history.replaceState(window.history.state, '', cleaned);
  } catch {
    // replaceState desteklenmiyorsa parametre adres çubuğunda kalır —
    // zararsız, tespit sonucu etkilenmez.
  }
}

// Modül yüklenirken, URL temizlenmeden ÖNCE hesaplanır.
const WEBVIEW_SHELL = detectWebViewShell();

function detectPlatform() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return PLATFORM_WEB;
    }
    // v148: WebView kabuğu — UA eki / köprü her yenilemede zaten var.
    if (WEBVIEW_SHELL) {
      writeSessionFlag();
      stripTwaQueryParam();
      return PLATFORM_ANDROID;
    }
    // Oturumda işaret olsa bile (örn. TWA yeniden başlatıldı) URL'de
    // parametre kalmasın diye temizlik her Android sonucunda denenir.
    if (readSessionFlag()) {
      stripTwaQueryParam();
      return PLATFORM_ANDROID;
    }
    if (hasTwaQueryParam() || hasTwaReferrer()) {
      writeSessionFlag();
      stripTwaQueryParam();
      return PLATFORM_ANDROID;
    }
    return PLATFORM_WEB;
  } catch {
    return PLATFORM_WEB;
  }
}

export const PLATFORM = detectPlatform();
export const IS_ANDROID_APP = PLATFORM === PLATFORM_ANDROID;
// v148: Android kabuğunun türü. İkisi aynı anda true olamaz.
//   IS_ANDROID_WEBVIEW → yeni WebView uygulaması (android-webview/, versionCode 14+)
//   IS_ANDROID_TWA     → eski Bubblewrap TWA uygulaması (android/, versionCode ≤ 13)
export const IS_ANDROID_WEBVIEW = IS_ANDROID_APP && WEBVIEW_SHELL;
export const IS_ANDROID_TWA = IS_ANDROID_APP && !WEBVIEW_SHELL;
// Android uygulamasının sürüm kodu (0 = bilinmiyor / 1.0.12 öncesi).
export const ANDROID_APP_VERSION = IS_ANDROID_APP ? CAPTURED_APP_VERSION : 0;
// Zümrüt mağazası (Google Play ödemesi) için gereken en eski sürümün altında mı?
export const ANDROID_UPDATE_REQUIRED = IS_ANDROID_APP && ANDROID_APP_VERSION < MIN_ANDROID_APP_VERSION;
// Genel "Yeni güncelleme var" uyarısı: uygulama en yeni sürümden eskiyse ve
// en yeni sürüm hazırlanalı 24 saat geçtiyse (Play incelemesi bitmiş olsun).
const UPDATE_NOTICE_GRACE_MS = 24 * 60 * 60 * 1000;
export const ANDROID_UPDATE_AVAILABLE =
  IS_ANDROID_APP &&
  ANDROID_APP_VERSION < LATEST_ANDROID_APP_VERSION &&
  Date.now() > LATEST_ANDROID_APP_VERSION_SET_AT + UPDATE_NOTICE_GRACE_MS;
