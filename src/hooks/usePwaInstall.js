import { useEffect, useRef, useState } from 'react';

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * usePwaInstall — Android/Chrome'da native "beforeinstallprompt" olayını
 * yakalayıp tetikleyebilen, iOS'ta ise (o olay hiç ateşlenmediği için)
 * bunun yerine manuel bir "nasıl eklenir" rehberi gösterilmesi gerektiğini
 * bildiren hook.
 *
 * ÖNEMLİ: Chrome bu event'i sayfa yüklendikten hemen sonra DEĞİL, kendi
 * dahili "yüklenebilirlik" kriterlerine göre GECİKMELİ ateşleyebiliyor.
 * Kullanıcı butona event daha gelmeden basarsa, eskiden direkt "kılavuz"
 * gösteriliyordu (Android'de bile) — artık bunun yerine "istek bekliyor"
 * bayrağı koyuyoruz; event birazdan gelirse native pencereyi OTOMATİK
 * açıyoruz, kullanıcının tekrar basmasına gerek kalmıyor.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const pendingInstallRef = useRef(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (pendingInstallRef.current) {
        pendingInstallRef.current = false;
        e.prompt();
      }
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) {
      // Event henüz gelmedi — gelir gelmez otomatik tetiklenmesi için işaretle.
      pendingInstallRef.current = true;
      return null;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice;
  };

  return {
    installed,
    canPromptNatively: Boolean(deferredPrompt),
    isIos: isIos(),
    promptInstall,
  };
}
