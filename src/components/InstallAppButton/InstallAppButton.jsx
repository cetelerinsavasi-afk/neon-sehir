import { useState } from 'react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import './InstallAppButton.css';

export default function InstallAppButton() {
  const { installed, canPromptNatively, isIos, promptInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [preparing, setPreparing] = useState(false);

  if (installed) return null;

  const handleClick = async () => {
    if (canPromptNatively) {
      await promptInstall();
      return;
    }
    if (isIos) {
      setShowIosGuide(true);
      return;
    }
    // Android/diğer: tarayıcı "yükleme hazır" sinyalini (beforeinstallprompt)
    // henüz göndermemiş olabilir — bu event sayfa açıldıktan biraz sonra
    // gelebiliyor. Kılavuz göstermek yerine, işareti koyup birazdan
    // OTOMATİK açılmasını bekliyoruz (bkz. usePwaInstall).
    await promptInstall();
    setPreparing(true);
    setTimeout(() => setPreparing(false), 5000);
  };

  return (
    <>
      <button className="install-app-btn" onClick={handleClick}>
        📲 Oyunu Ana Ekrana Ekle
      </button>
      {preparing && (
        <p className="install-app-preparing">
          Hazırlanıyor… birkaç saniye içinde yükleme penceresi açılacak. Açılmazsa tarayıcı
          menüsünden "Ana ekrana ekle" seçeneğini kullanabilirsin.
        </p>
      )}

      {showIosGuide && (
        <div className="install-guide-backdrop" onClick={() => setShowIosGuide(false)}>
          <div className="install-guide" onClick={(e) => e.stopPropagation()}>
            <p className="install-guide-title">Ana Ekrana Ekle</p>
            {isIos ? (
              <ol className="install-guide-steps">
                <li>
                  Alt menüdeki <strong>Paylaş</strong> ikonuna (kare + yukarı ok) dokun.
                </li>
                <li>
                  Açılan listede <strong>"Ana Ekrana Ekle"</strong> seçeneğini bul ve dokun.
                </li>
                <li>
                  Sağ üstteki <strong>"Ekle"</strong>'ye dokun — Neon Şehir artık normal bir
                  uygulama gibi ana ekranında olacak.
                </li>
              </ol>
            ) : (
              <p className="install-guide-hint">
                Tarayıcının menüsünden "Ana ekrana ekle" ya da "Uygulamayı yükle" seçeneğini
                kullanabilirsin.
              </p>
            )}
            <button className="install-guide-close" onClick={() => setShowIosGuide(false)}>
              Anladım
            </button>
          </div>
        </div>
      )}
    </>
  );
}
