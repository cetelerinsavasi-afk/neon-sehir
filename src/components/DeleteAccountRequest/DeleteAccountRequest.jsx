import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import '../ConfirmModal/ConfirmModal.css';
import './DeleteAccountRequest.css';

// DeleteAccountRequest — Profil (Ev) ekranının en altındaki "Hesabımı Sil".
// Faz 5a: silme SUNUCUDA OTOMATİK YAPILMAZ. Oyuncunun uid'sini içeren
// hazır bir e-posta oluşturulur; talep, hesabın Google e-postasından
// geldiği doğrulandıktan sonra elle (yerel silme aracıyla) işlenir.
// Hiçbir veriye yazmaz, hiçbir Cloud Function çağırmaz.
const SUPPORT_EMAIL = 'cetelerinsavasi@gmail.com';

function buildMailto(uid, displayName) {
  const subject = 'Hesap silme talebi';
  const body = [
    'Merhaba,',
    '',
    'Neon Şehir hesabımın ve ilişkili verilerimin silinmesini talep ediyorum.',
    '',
    `Oyun kimliğim (uid): ${uid}`,
    `Oyun içi adım: ${displayName || '-'}`,
    '',
    'Bu e-postayı oyuna giriş yaptığım Google hesabımın e-posta adresinden gönderiyorum.',
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function DeleteAccountRequest() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [step, setStep] = useState(null); // null | 'confirm' | 'sent'
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const close = () => {
    setStep(null);
    setCopied(false);
  };

  const openMail = () => {
    window.location.href = buildMailto(user.uid, player?.displayName);
    setStep('sent');
  };

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
    } catch {
      // Pano engelli olabilir — kod ekranda seçilebilir durumda.
    }
  };

  return (
    <div className="home-section del-acc">
      <p className="home-section-title">Hesap</p>
      <button type="button" className="del-acc-btn" onClick={() => setStep('confirm')}>
        Hesabımı Sil
      </button>

      {step && (
        <div className="confirm-modal-backdrop" onClick={close}>
          <div className="confirm-modal del-acc-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-modal-title">
              {step === 'sent' ? 'Silme talebini gönder' : 'Hesabını silmek istiyor musun?'}
            </p>

            {step === 'confirm' && (
              <>
                <p className="confirm-modal-message">
                  Hesabın ve tüm oyun verilerin (altın, eşyalar, araçlar, ilerleme, mesajlar) en geç 30 gün
                  içinde <strong>kalıcı olarak</strong> silinir. Bu işlem geri alınamaz.
                </p>
                <p className="confirm-modal-message">
                  Devam edersen hesap bilgilerinin hazır yazıldığı bir e-posta açılır. Talebin işleme
                  alınabilmesi için e-postayı <strong>oyuna giriş yaptığın Google adresinden</strong>
                  {user.email ? (
                    <>
                      {' '}(<strong className="del-acc-email">{user.email}</strong>)
                    </>
                  ) : null}{' '}
                  göndermelisin.
                </p>
              </>
            )}

            {step === 'sent' && (
              <p className="confirm-modal-message">
                E-posta uygulaman açılmadıysa <strong>{SUPPORT_EMAIL}</strong> adresine "Hesap silme
                talebi" konulu bir e-posta gönder ve aşağıdaki oyun kimliğini ekle.
              </p>
            )}

            <div className="del-acc-uid">
              <span className="del-acc-uid-label">Oyun kimliğin</span>
              <code className="del-acc-uid-code">{user.uid}</code>
              <button type="button" className="del-acc-copy" onClick={copyUid}>
                {copied ? 'Kopyalandı ✓' : 'Kopyala'}
              </button>
            </div>

            <div className="confirm-modal-actions">
              <button className="confirm-modal-cancel" onClick={close}>
                {step === 'sent' ? 'Kapat' : 'Vazgeç'}
              </button>
              {step === 'confirm' && (
                <button className="confirm-modal-confirm del-acc-confirm" onClick={openMail}>
                  E-postayı Oluştur
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
