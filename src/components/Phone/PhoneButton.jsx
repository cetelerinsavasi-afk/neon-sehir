import './PhoneButton.css';

export default function PhoneButton({ onClick }) {
  return (
    <button className="phone-button" onClick={onClick} aria-label="Telefon">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
    </button>
  );
}
