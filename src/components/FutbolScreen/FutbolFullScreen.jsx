import { useAuth } from '../../contexts/AuthContext';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import FutbolShell from './FutbolShell';
import './FutbolFullScreen.css';

/**
 * FutbolFullScreen — Futbol modülünün giriş noktası. Oyun genelinden
 * bağımsız çalışır (mevcut haritayı/HUD'u etkilemez). Giriş yapmış her
 * oyuncu doğrudan Futbol modülüne (FutbolShell) erişebilir.
 */
export default function FutbolFullScreen({ onClose }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="futbol-fullscreen">
        <div className="futbol-fullscreen-header">
          <span className="futbol-fullscreen-title">⚽ Futbol</span>
          <button className="futbol-fullscreen-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="futbol-fullscreen-body">
          <SignInPrompt message="Futbol modülünü kullanmak için giriş yapmalısın." />
        </div>
      </div>
    );
  }

  return <FutbolShell onClose={onClose} />;
}
