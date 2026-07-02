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
          <path d="M2 13h9V9h6v2h3l2 2v2h-2v2h-2v-2H9v2H4v-2H2v-2z" />
        </svg>
      </button>
    </div>
  );
}
