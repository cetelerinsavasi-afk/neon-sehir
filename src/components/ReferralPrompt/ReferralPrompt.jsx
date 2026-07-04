import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { applyReferralCode } from '../../services/gameActions';
import './ReferralPrompt.css';

/**
 * ReferralPrompt — sadece AuthContext'in isNewPlayer=true dediği anda
 * (yani bu oturumda GERÇEKTEN yeni bir hesap oluşturulduysa) gösterilir.
 * Vazgeç/Geç ile kapatılabilir, zorunlu değildir.
 */
export default function ReferralPrompt() {
  const { isNewPlayer, dismissNewPlayerFlag } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isNewPlayer) return null;

  const handleApply = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await applyReferralCode(code.trim());
      setSuccess(true);
      setTimeout(dismissNewPlayerFlag, 1800);
    } catch (err) {
      setError(err.message || 'Referans kodu uygulanamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="referral-prompt-backdrop">
      <div className="referral-prompt">
        {success ? (
          <p className="referral-prompt-success">
            Referans kodu uygulandı! 1000 altın bonus hesabına eklendi. 🎉
          </p>
        ) : (
          <>
            <p className="referral-prompt-title">Neon Şehir'e Hoş Geldin!</p>
            <p className="referral-prompt-hint">
              Seni davet eden bir arkadaşın var mı? Oyun içi ismini yazarsan, ikiniz de bonus altın
              kazanırsınız (sen +1000, o +2000).
            </p>
            <input
              type="text"
              className="referral-prompt-input"
              placeholder="Arkadaşının oyun içi ismi"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={20}
            />
            {error && <p className="referral-prompt-error">{error}</p>}
            <div className="referral-prompt-actions">
              <button className="referral-prompt-btn" disabled={busy} onClick={dismissNewPlayerFlag}>
                Geç
              </button>
              <button
                className="referral-prompt-btn primary"
                disabled={busy || !code.trim()}
                onClick={handleApply}
              >
                {busy ? '…' : 'Uygula'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
