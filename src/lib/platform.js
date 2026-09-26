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

export const PLATFORM_WEB = 'web';
export const PLATFORM_ANDROID = 'android';

const TWA_QUERY_KEY = 'src';
const TWA_QUERY_VALUE = 'twa';
const SESSION_KEY = 'ns_platform';

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

// ?src=twa parametresini adres çubuğundan sessizce siler (sayfa yeniden
// yüklenmez, geçmişe yeni kayıt eklenmez). Diğer parametreler ve #hash
// aynen korunur. SADECE Android tespitinden sonra ve parametre gerçekten
// src=twa ise çalışır — web'de hiçbir zaman çağrılmaz.
function stripTwaQueryParam() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(TWA_QUERY_KEY) !== TWA_QUERY_VALUE) return;
    url.searchParams.delete(TWA_QUERY_KEY);
    const cleaned = url.pathname + url.search + url.hash;
    window.history.replaceState(window.history.state, '', cleaned);
  } catch {
    // replaceState desteklenmiyorsa parametre adres çubuğunda kalır —
    // zararsız, tespit sonucu etkilenmez.
  }
}

function detectPlatform() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return PLATFORM_WEB;
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
