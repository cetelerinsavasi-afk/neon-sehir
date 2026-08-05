import { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { verifyFutbolAdminAccess } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import FutbolShell from './FutbolShell';
import './FutbolFullScreen.css';

// Art arda tıklamaların "seri" sayılması için izin verilen en uzun boşluk.
const TAP_RESET_MS = 1500;
const TAPS_TO_REVEAL = 5;

/**
 * FutbolFullScreen — Futbol modülünün giriş noktası.
 *
 * Oyun genelinden TAMAMEN bağımsız çalışır: mevcut haritayı, HUD'u,
 * diğer ekranları hiçbir şekilde etkilemez (bkz. BottomBar / App.jsx'e
 * eklenen tek satırlık bağlantı noktaları dışında).
 *
 * Normal oyuncular için: sadece "çok yakında" yazısını görür.
 * Admin (bizim hesabımız) için: yazıya 5 kere art arda tıklayıp şifre
 * girince gerçek Futbol modülü (FutbolShell) açılır — bu sayede modül
 * geliştirilirken oyunculara erken/eksik/bozuk bir ekran gösterilmemiş
 * olur.
 *
 * Erişim kontrolü bilerek istemcide TUTULMUYOR (şifreyi JS bundle'ına
 * gömmek herkesin tarayıcı kaynak kodunda görebileceği anlamına gelir).
 * Bunun yerine şifre bir Cloud Function'a (verifyFutbolAdminAccess)
 * gönderilir, orada doğrulanır ve doğruysa users/{uid} dokümanına
 * futbolAdminUnlocked: true yazılır — projenin geri kalanındaki
 * "istemci asla kritik alanları doğrudan yazmaz" kuralıyla tutarlı.
 */
export default function FutbolFullScreen({ onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const isAdminUnlocked = Boolean(player?.futbolAdminUnlocked);

  const handleTeaserTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current > TAP_RESET_MS) {
      tapCountRef.current = 0;
    }
    lastTapRef.current = now;
    tapCountRef.current += 1;
    if (tapCountRef.current >= TAPS_TO_REVEAL) {
      tapCountRef.current = 0;
      setShowPasswordPrompt(true);
      setError('');
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setError('');
    try {
      const res = await verifyFutbolAdminAccess(password);
      if (!res?.data?.ok) {
        setError('Şifre yanlış.');
        setPassword('');
      } else {
        setShowPasswordPrompt(false);
        setPassword('');
      }
    } catch (err) {
      setError('Şifre yanlış.');
      setPassword('');
    } finally {
      setChecking(false);
    }
  };

  if (!user) {
    return (
      <div className="futbol-fullscreen">
        <FutbolHeader onClose={onClose} />
        <div className="futbol-fullscreen-body">
          <SignInPrompt message="Futbol modülünü kullanmak için giriş yapmalısın." />
        </div>
      </div>
    );
  }

  if (isAdminUnlocked) {
    return <FutbolShell onClose={onClose} />;
  }

  return (
    <div className="futbol-fullscreen">
      <FutbolHeader onClose={onClose} />
      <div className="futbol-fullscreen-body futbol-teaser">
        <p className="futbol-teaser-text" onClick={handleTeaserTap}>
          ⚽ Futbol çok yakında oyuna eklenecek!
        </p>

        {showPasswordPrompt && (
          <form className="futbol-admin-prompt" onSubmit={submitPassword}>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifre"
              className="futbol-admin-input"
            />
            <button type="submit" className="futbol-admin-submit" disabled={checking}>
              {checking ? '...' : 'Onayla'}
            </button>
          </form>
        )}
        {error && <p className="futbol-admin-error">{error}</p>}
      </div>
    </div>
  );
}

function FutbolHeader({ onClose }) {
  return (
    <div className="futbol-fullscreen-header">
      <span className="futbol-fullscreen-title">⚽ Futbol</span>
      <button className="futbol-fullscreen-close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
