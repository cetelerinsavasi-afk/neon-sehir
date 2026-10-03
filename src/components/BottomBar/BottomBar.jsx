import './BottomBar.css';

// Alt çubuk (3 sekme): Çeteler – Soygun (Mekanlar) – Profil.
// Telefon artık alt çubukta DEĞİL: ana sayfada ChatsApp kısayolunun hemen
// üstünde, aynı boyutta ayrı bir buton (bkz. App.jsx → .map-phone-btn).
// Futbol sekmesi de kaldırıldı: Futbol paneline haritadaki Stadyum'a
// dokunarak girilir.
export default function BottomBar({ onHeistClick, onGangsClick, onProfileClick, gangsBadge = false }) {
  return (
    <div className="bottom-bar">
      <button className="bottom-bar-btn gangs" onClick={onGangsClick} aria-label="Çeteler">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 21V3" strokeLinecap="round" />
          <path d="M5 4h12l-2.5 4L17 12H5" fill="currentColor" fillOpacity="0.25" strokeLinejoin="round" />
        </svg>
        {gangsBadge && <span className="bottom-bar-dot" />}
      </button>
      <button className="bottom-bar-btn danger" onClick={onHeistClick} aria-label="Mekanlar">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
          <rect x="2" y="11" width="15" height="3.5" rx="1" />
          <rect x="14" y="8" width="3.5" height="4" rx="1" />
          <rect x="16.5" y="11" width="3" height="3" rx="0.5" />
          <path d="M6 14.5 L6 20 a1 1 0 0 0 1 1 h2 a1 1 0 0 0 1-1 v-3 h1 v-3 z" />
        </svg>
      </button>
      <button className="bottom-bar-btn profile" onClick={onProfileClick} aria-label="Profil">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8.2" r="4" fill="currentColor" fillOpacity="0.25" />
          <path d="M4.5 20.5c.8-4 3.9-6.3 7.5-6.3s6.7 2.3 7.5 6.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
