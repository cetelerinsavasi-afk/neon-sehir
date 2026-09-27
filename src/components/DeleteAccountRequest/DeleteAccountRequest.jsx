import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { requestAccountDeletion } from '../../services/gameActions';
import '../ConfirmModal/ConfirmModal.css';
import './DeleteAccountRequest.css';

// DeleteAccountRequest — Profil (Ev) ekranının en altındaki "Hesabımı Sil".
// v62: onaylayınca sunucuda bir silme TALEBİ açılır (Yönetim Paneli › 🗑️ Silme'ye
// düşer) ve eskisi gibi hazır bir e-posta da açılır. Silme otomatik değildir;
// yönetici panelden inceleyip siler ya da talebi iptal eder.
const SUPPORT_EMAIL = 'studyohustle@gmail.com'; // v61: hesap silme talepleri bu adrese gelir

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
  const [busy, setBusy] = useState(false);
  const [requestSaved, setRequestSaved] = useState(null); // true | false (kaydedilemedi, yalnızca e-posta)
  const [pending, setPending] = useState(null); // açık talep (deletionRequests/{uid})

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      doc(db, 'deletionRequests', user.uid),
      (s) => {
        const d = s.exists() ? s.data() : null;
        setPending(d && ['pending', 'processing', 'failed'].includes(d.status) ? d : null);
      },
      () => setPending(null)
    );
  }, [user]);

  if (!user) return null;

  const close = () => {
    setStep(null);
    setCopied(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await requestAccountDeletion();
      setRequestSaved(true);
    } catch (err) {
      console.warn('requestAccountDeletion', err?.code, err?.message);
      setRequestSaved(false); // sunucuya ulaşılamadı — talep e-postayla yine iletilir
    } finally {
      setBusy(false);
    }
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
      {pending ? (
        <p className="del-acc-pending">
          🗑️ Hesap silme talebin alındı ({new Date(pending.createdAtMs || Date.now()).toLocaleDateString('tr-TR')}). Yönetici inceledikten sonra hesabın
          silinecek; vazgeçtiysen {SUPPORT_EMAIL} adresine yaz.
        </p>
      ) : (
        <button type="button" className="del-acc-btn" onClick={() => setStep('confirm')}>
          Hesabımı Sil
        </button>
      )}

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
                  Devam edersen silme talebin kaydedilir ve hesap bilgilerinin hazır yazıldığı bir e-posta açılır.
                  E-postayı <strong>oyuna giriş yaptığın Google adresinden</strong>
                  {user.email ? (
                    <>
                      {' '}(<strong className="del-acc-email">{user.email}</strong>)
                    </>
                  ) : null}{' '}
                  göndermelisin.
                </p>
              </>
            )}

            {step === 'sent' && requestSaved && (
              <p className="confirm-modal-message">
                ✅ <strong>Silme talebin alındı.</strong> Yönetici inceledikten sonra hesabın silinecek.
              </p>
            )}
            {step === 'sent' && requestSaved && (
              <p className="confirm-modal-message">E-posta uygulaman açılmadıysa sorun değil — talebin kayıtlı.</p>
            )}
            {step === 'sent' && !requestSaved && (
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
                <button className="confirm-modal-confirm del-acc-confirm" disabled={busy} onClick={submit}>
                  {busy ? '…' : 'Evet, silme talebi gönder'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
