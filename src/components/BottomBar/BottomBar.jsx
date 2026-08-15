import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import './BottomBar.css';

export default function BottomBar({ onPhoneClick, onHeistClick, onProfileClick, onFutbolClick }) {
  const { totalBadge } = useUnreadNotifications();

  return (
    <div className="bottom-bar">
      <button className="bottom-bar-btn futbol" onClick={onFutbolClick} aria-label="Futbol">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9.5" />
          <path
            d="M12 7.2 15.8 10 14.4 14.4H9.6L8.2 10 12 7.2Z"
            fill="currentColor"
            stroke="currentColor"
          />
          <path d="M12 2.5V7.2M4.6 7.4l3.6 2.6M19.4 7.4l-3.6 2.6M6.7 18.5l2.9-4.1M17.3 18.5l-2.9-4.1M2.6 12h4M17.4 12h4" />
        </svg>
      </button>
      <button className="bottom-bar-btn danger" onClick={onHeistClick} aria-label="Mekanlar">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
          <rect x="2" y="11" width="15" height="3.5" rx="1" />
          <rect x="14" y="8" width="3.5" height="4" rx="1" />
          <rect x="16.5" y="11" width="3" height="3" rx="0.5" />
          <path d="M6 14.5 L6 20 a1 1 0 0 0 1 1 h2 a1 1 0 0 0 1-1 v-3 h1 v-3 z" />
        </svg>
      </button>
      <button className="bottom-bar-btn" onClick={onPhoneClick} aria-label="Telefon">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        {totalBadge > 0 && <span className="bottom-bar-badge">{totalBadge > 9 ? '9+' : totalBadge}</span>}
      </button>
      <button className="bottom-bar-btn profile" onClick={onProfileClick} aria-label="Profil">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      </button>
    </div>
  );
}
