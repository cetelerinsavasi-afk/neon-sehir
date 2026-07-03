import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './SignInBanner.css';

/**
 * SignInBanner — kullanıcı giriş yapmadığı sürece ekranın ortasında görünen,
 * ama arkasındaki haritayı tamamen kilitlemeyen bir panel. Harita hâlâ
 * gezilebilir (panelin kapladığı alan dışında); giriş yapmak isteyen
 * oyuncu bu panelden tek tıkla Google ile giriş yapabilir.
 *
 * İsteğe bağlı referans kodu: bir arkadaşının oyun içi ismini yazarsa,
 * hem kendisi 3000 altınla başlar hem de referansı yazan arkadaşı 2000
 * altın bonus kazanır (sadece bu tarayıcıda HİÇ hesap oluşturulmamışsa
 * geçerlidir).
 */
export default function SignInBanner() {
  const { user, loading, signIn, initError, setPendingReferralCode } = useAuth();
  const [referralCode, setReferralCode] = useState('');

  if (loading || user) return null;

  const handleSignIn = () => {
    setPendingReferralCode(referralCode);
    signIn();
  };

  return (
    <div className="sign-in-banner-layer">
      <div className="sign-in-banner">
        <h2 className="sign-in-banner-title">Neon Şehir</h2>
        <p className="sign-in-banner-subtitle">Oynamak için giriş yap</p>

        <input
          type="text"
          className="sign-in-referral-input"
          placeholder="Referans kodu (isteğe bağlı)"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value)}
          maxLength={20}
        />
        <p className="sign-in-referral-hint">
          Bir arkadaşının oyun içi ismini yazarsan, ikiniz de bonus altın kazanırsınız.
        </p>

        <button className="sign-in-banner-button" onClick={handleSignIn}>
          Google ile Giriş Yap
        </button>
        {initError && <p className="sign-in-banner-error">{initError}</p>}
      </div>
    </div>
  );
}
