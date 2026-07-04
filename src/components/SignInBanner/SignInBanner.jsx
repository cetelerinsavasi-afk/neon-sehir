import { useAuth } from '../../contexts/AuthContext';
import './SignInBanner.css';

/**
 * SignInBanner — kullanıcı giriş yapmadığı sürece ekranın ortasında görünen,
 * ama arkasındaki haritayı tamamen kilitlemeyen bir panel. Harita hâlâ
 * gezilebilir (panelin kapladığı alan dışında); giriş yapmak isteyen
 * oyuncu bu panelden tek tıkla Google ile giriş yapabilir.
 *
 * Referans kodu burada SORULMUYOR — girişten sonra, SADECE gerçekten yeni
 * bir hesap oluşturulduysa ReferralPrompt ile ayrıca sorulur.
 */
export default function SignInBanner() {
  const { user, loading, signIn, initError } = useAuth();

  if (loading || user) return null;

  return (
    <div className="sign-in-banner-layer">
      <div className="sign-in-banner">
        <h2 className="sign-in-banner-title">Neon Şehir</h2>
        <p className="sign-in-banner-subtitle">Oynamak için giriş yap</p>
        <button className="sign-in-banner-button" onClick={signIn}>
          Google ile Giriş Yap
        </button>
        {initError && <p className="sign-in-banner-error">{initError}</p>}
      </div>
    </div>
  );
}
