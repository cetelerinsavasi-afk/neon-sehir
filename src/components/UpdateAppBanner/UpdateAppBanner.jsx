import { useState } from 'react';
import { ANDROID_UPDATE_AVAILABLE, PLAY_STORE_URL } from '../../lib/platform';
import './UpdateAppBanner.css';

// v91 — Android uygulaması en yeni sürümden eskiyse altta kapatılabilir
// "Yeni güncelleme var" uyarısı gösterir; butona basan Play Store sayfasına gider.
// Sürüm bilgisi otomatik (src/lib/androidAppVersion.js, configure.mjs yazar).
// Kapatılınca o oturum boyunca bir daha çıkmaz.
const DISMISS_KEY = 'ns_update_banner_dismissed';

export default function UpdateAppBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!ANDROID_UPDATE_AVAILABLE || hidden) return null;
  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* yok say */
    }
    setHidden(true);
  };
  return (
    <div className="update-app-banner" role="status">
      <span className="update-app-banner-text">
        🚀 Yeni güncelleme var! Neon Şehir'i güncellemek için dokun.
      </span>
      <a className="update-app-banner-btn" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
        Güncelle
      </a>
      <button className="update-app-banner-x" onClick={dismiss} aria-label="Kapat">
        ✕
      </button>
    </div>
  );
}
