import { IS_ANDROID_APP } from '../../lib/platform';
import './LegalLinks.css';

// Gizlilik Politikası ve Kullanım Koşulları statik sayfalardır
// (public/gizlilik.html, public/kosullar.html — React paketinin dışında,
// Cloudflare doğrudan sunar). Yeni sekmede açılır, oyun kapanmaz.
// Android (TWA) içinde ?p=android eklenir: sayfa yeni sekmede açılıp
// sessionStorage'ı görmese bile Kullanım Koşulları'ndaki web'e özel satın
// alma bölümü gizli kalır.
const suffix = IS_ANDROID_APP ? '?p=android' : '';
const PRIVACY_URL = `/gizlilik${suffix}`;
const TERMS_URL = `/kosullar${suffix}`;
const DELETE_URL = `/hesap-silme${suffix}`;

function LegalLink({ href, children }) {
  return (
    <a className="legal-link" href={href} target="_blank" rel="noopener">
      {children}
    </a>
  );
}

// variant="consent": giriş butonunun altındaki onay cümlesi.
// variant="footer" (varsayılan): "Gizlilik Politikası · Kullanım Koşulları · Hesap Silme" satırı.
export default function LegalLinks({ variant = 'footer' }) {
  if (variant === 'consent') {
    return (
      <p className="legal-consent">
        Giriş yaparak <LegalLink href={TERMS_URL}>Kullanım Koşulları</LegalLink>'nı ve{' '}
        <LegalLink href={PRIVACY_URL}>Gizlilik Politikası</LegalLink>'nı kabul etmiş olursun.
      </p>
    );
  }
  return (
    <p className="legal-footer">
      <LegalLink href={PRIVACY_URL}>Gizlilik Politikası</LegalLink>
      <span aria-hidden="true"> · </span>
      <LegalLink href={TERMS_URL}>Kullanım Koşulları</LegalLink>
      <span aria-hidden="true"> · </span>
      <LegalLink href={DELETE_URL}>Hesap Silme</LegalLink>
    </p>
  );
}
