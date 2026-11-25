// =============================================================================
// v203 (Android v18) — "Arkadaşını Davet Et" paylaşımı ve "Oyunu Değerlendir" linki.
//
// - Ödül mantığına DOKUNMAZ: davet ödülü eskisi gibi sunucuda (applyReferralCode),
//   yeni oyuncu girişte davet edenin oyun içi adını yazınca verilir. Burası sadece
//   o adı içeren mesajı paylaşmayı kolaylaştırır.
// - Değerlendirme için HİÇBİR ödül yok, yıldız yönlendirmesi yok (Google Play politikası).
// - Firestore'a / ağa istek atmaz. Hiçbir şey kendiliğinden açılmaz: sadece dokununca.
//
// Paylaşım sırası:
//   1) Android WebView v18+: NeonAndroid.shareText → Android paylaşım menüsü
//   2) Tarayıcı / iPhone / eski TWA (Chrome): navigator.share
//   3) Hiçbiri yoksa (WebView v14–v17 dahil): panoya kopyala → "Davet mesajı kopyalandı"
// =============================================================================
import { copyText, nativeShareText, nativeOpenExternal } from './nativeBridge';

export const SITE_URL = 'https://cetelerinsavasi.com';
export const PLAY_PACKAGE = 'com.cetelerinsavasi.twa';
export const PLAY_MARKET_URL = `market://details?id=${PLAY_PACKAGE}`;
export const PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
export const RATE_TEXT = "Oyunu beğendin mi? Google Play'de değerlendir";

// Davet adı = oyuncunun oyun içi adı (profilde "Referans Kodun" olarak gösterilen, yeni
// oyuncunun girişte yazacağı ad). Boşsa paylaşım yapılmaz.
export function buildInviteText(inviteName) {
  const name = String(inviteName ?? '').trim();
  if (!name) return '';
  return `Neon Şehir'de buluşalım! Gerçek oyuncularla dolu bir şehirde fabrika kur, çete topla ya da başkan ol. Oyuna girerken davet eden kısmına "${name}" yaz: ${SITE_URL}`;
}

// Dönen: 'shared' | 'copied' | 'cancelled' | 'failed'
// deps sadece testler için (varsayılan: gerçek köprü / navigator / pano).
export async function shareInvite(text, deps = {}) {
  const value = String(text ?? '');
  if (!value) return 'failed';
  const shareNative = deps.nativeShareText || nativeShareText;
  const copy = deps.copyText || copyText;
  const nav = deps.navigator !== undefined ? deps.navigator : typeof navigator !== 'undefined' ? navigator : null;

  if (shareNative(value)) return 'shared';

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text: value });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled'; // oyuncu menüyü kapattı
      // başka hata (izin yok vb.) → panoya kopyala
    }
  }

  try {
    await copy(value);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// "Oyunu Değerlendir": WebView köprüsü varsa market:// (Play Store uygulaması; yoksa
// kabuk kendisi https adresine düşer). true → çağıran link varsayılanını engeller.
// false → normal <a href={PLAY_WEB_URL}> çalışır (eski TWA'da Chrome Play'i açar).
export function openPlayReview(deps = {}) {
  const open = deps.nativeOpenExternal || nativeOpenExternal;
  return open(PLAY_MARKET_URL) === true;
}
