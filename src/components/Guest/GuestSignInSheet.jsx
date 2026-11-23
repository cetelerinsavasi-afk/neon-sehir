import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { GuestPerks } from './GuestWelcome';
import './Guest.css';

// v134 — misafirin yapamadığı bir şeye dokununca çıkan küçük giriş kartı
// v192: altında giriş yapınca neler açılacağı (kısa liste) — "neden giriş yapayım?" sorusunun cevabı
export default function GuestSignInSheet({ onClose, message = 'Misafir modundasın — bunu yapmak için giriş yapmalısın.', perks = true }) {
  return (
    <div className="gv-sheet-bg" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="gv-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="gv-sheet-x" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
        <SignInPrompt message={message} />
        {perks && (
          <div className="gv-sheet-perks">
            <small>Giriş yapınca</small>
            <GuestPerks compact />
          </div>
        )}
      </div>
    </div>
  );
}
