import { useAuth } from '../../contexts/AuthContext';
import './SignInPrompt.css';

/**
 * SignInPrompt — tam ekranı kaplamaz, sadece bir aksiyonun (meslek seçme,
 * fabrikada çalışma vb.) giriş gerektirdiği yerlerde inline gösterilir.
 * Harita, HUD ve "yakında" placeholder ekranları girişsiz de görülebilir;
 * sadece oyun-kritik aksiyonlar bu bileşenin arkasında.
 */
export default function SignInPrompt({ message = 'Bunu yapmak için giriş yapmalısın.' }) {
  const { signIn, initError } = useAuth();

  return (
    <div className="sign-in-prompt">
      <p className="sign-in-prompt-message">{message}</p>
      <button className="sign-in-prompt-button" onClick={signIn}>
        Google ile Giriş Yap
      </button>
      {initError && <p className="sign-in-prompt-error">{initError}</p>}
    </div>
  );
}
