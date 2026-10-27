import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './Guest.css';

// v134 — misafirin yapamadığı bir şeye dokununca çıkan küçük giriş kartı
export default function GuestSignInSheet({ onClose, message = 'Misafir modundasın — bunu yapmak için giriş yapmalısın.' }) {
  return (
    <div className="gv-sheet-bg" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="gv-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="gv-sheet-x" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
        <SignInPrompt message={message} />
      </div>
    </div>
  );
}
