import './BottomBar.css';

export default function BottomBar({ onPhoneClick, onHeistClick }) {
  return (
    <div className="bottom-bar">
      <button className="bottom-bar-btn" onClick={onPhoneClick} aria-label="Telefon">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
      </button>
      <button className="bottom-bar-btn danger" onClick={onHeistClick} aria-label="Soygun">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
          <rect x="2" y="11" width="15" height="3.5" rx="1" />
          <rect x="14" y="8" width="3.5" height="4" rx="1" />
          <rect x="16.5" y="11" width="3" height="3" rx="0.5" />
          <path d="M6 14.5 L6 20 a1 1 0 0 0 1 1 h2 a1 1 0 0 0 1-1 v-3 h1 v-3 z" />
        </svg>
      </button>
    </div>
  );
}
