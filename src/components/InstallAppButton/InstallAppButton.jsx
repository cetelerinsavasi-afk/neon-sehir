import { useState } from 'react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import './InstallAppButton.css';

export default function InstallAppButton() {
  const { installed, canPromptNatively, isIos, promptInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (installed) return null;

  const handleClick = async () => {
    if (canPromptNatively) {
      await promptInstall();
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      // Tarayıcı native prompt vermiyor (henüz kriterleri karşılamamış
      // olabilir) — yine de kısa bir yönlendirme gösterelim.
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <button className="install-app-btn" onClick={handleClick}>
        📲 Oyunu Ana Ekrana Ekle
      </button>

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
