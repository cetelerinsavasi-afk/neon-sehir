// Platform tespiti (Web / Android TWA) — diğer tüm modüllerden ÖNCE,
// render'dan önce bir kez çalışsın diye en üstte. Sadece okur, UI'a
// dokunmaz (bkz. src/lib/platform.js).
import './lib/platform.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// PWA — "ana ekrana ekle" davranışının çalışabilmesi için minimal bir
// service worker kaydediyoruz (bkz. public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker kaydı başarısız:', err);
    });
  });
}

// v85 — dokunmatik cihazlarda basılı tutunca çıkan sistem menüsü (Android
// "kopyala/paylaş", iPhone metin seçimi) oyunda araya girmesin. Yazı alanları
// (input/textarea) ve .selectable işaretli yerler hariç.
const TEXT_OK = 'input, textarea, select, [contenteditable="true"], .selectable';
const textOk = (t) => {
  const el = t instanceof Element ? t : t?.parentElement;
  return Boolean(el?.closest?.(TEXT_OK));
};
if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (!textOk(e.target)) e.preventDefault();
    },
    { capture: true },
  );
  // v86 — iPhone: CSS (user-select/touch-callout) basılı tutmada "Kopyala"yı her
  // zaman durdurmuyor. Oyun kontrollerinde dokunmanın varsayılan davranışı
  // iptal edilir (seçim/büyüteç/menü hiç başlamaz). Bu alanlar sadece pointer
  // olaylarıyla çalışır (onClick yok) → tuşlar etkilenmez.
  const HOLD_AREAS = '.gs-pad, .gs-canvas, .gs-stick, .gs-btn, .ta-ctl, .cue-hold, [data-hold]';
  document.addEventListener(
    'touchstart',
    (e) => {
      const el = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (el?.closest?.(HOLD_AREAS) && !textOk(el)) e.preventDefault();
    },
    { passive: false, capture: true },
  );
  // iOS: oyun dışı bir yere basılı tutunca kalan seçimi temizle
  document.addEventListener('selectstart', (e) => {
    if (!textOk(e.target)) e.preventDefault();
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
