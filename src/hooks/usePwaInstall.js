import { useEffect, useState } from 'react';

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
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
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
    if (!deferredPrompt) return null;
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
