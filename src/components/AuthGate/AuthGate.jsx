import { useAuth } from '../../contexts/AuthContext';
import './AuthGate.css';

/**
 * AuthGate — kullanıcı giriş yapmadan oyuna erişemez.
 * Faz 2'de gerçek Firebase Authentication (Google) zorunlu hale geldi;
 * önceki fazlardaki mock veri kaldırıldı.
 */
export default function AuthGate({ children }) {
  const { user, loading, initError, signIn } = useAuth();

  if (loading) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-gate">
        <h1 className="auth-gate-title">Neon Şehir</h1>
        <p className="auth-gate-subtitle">Devam etmek için giriş yap.</p>
        <button className="auth-gate-button" onClick={signIn}>
          Google ile Giriş Yap
        </button>
        {initError && <p className="auth-gate-error">{initError}</p>}
      </div>
    );
  }

  return children;
}
