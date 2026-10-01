// backStack.js — v68: Android (TWA) ve ana ekrana eklenmiş uygulamada
// telefonun GERİ tuşu.
//   - Açık bir ekran / mekân / telefon uygulaması varsa geri tuşu EN SON
//     açılanı kapatır (mekândan → ana sayfaya).
//   - Ana sayfadayken geri tuşu "Çıkmak istiyor musun?" onayını açar; bir kez
//     daha geri tuşu uygulamayı kapatır, "Oyunda kal" onayı kapatır.
// Nasıl: tarayıcı geçmişine tek bir "bekçi" kaydı eklenir. Geri tuşu bu kaydı
// tükettiğinde (popstate) olay burada işlenir ve bekçi yeniden eklenir; böylece
// geçmiş büyümez. Ana sayfada bekçi yeniden eklenmez → sonraki geri tuşunu
// Android'in kendisi işler (uygulama kapanır).
// Web tarayıcısında (sekmede) devre dışıdır — tarayıcının geri tuşu bozulmasın.
import { useEffect, useRef } from 'react';
import { IS_ANDROID_APP } from './platform';

function standalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}
export const BACK_ENABLED = typeof window !== 'undefined' && (IS_ANDROID_APP || standalone());

const stack = [];
let installed = false;
let guardArmed = false;
let onRootBack = null;
let listener = null;

function pushGuard() {
  try {
    window.history.pushState({ nsGuard: true }, '');
    guardArmed = true;
  } catch {
    /* yoksay */
  }
}

export function installBackHandler(onExitAsk) {
  onRootBack = onExitAsk;
  if (!BACK_ENABLED || installed) return;
  installed = true;
  try {
    window.history.replaceState({ ...(window.history.state || {}), nsRoot: true }, '');
  } catch {
    installed = false;
    return;
  }
  pushGuard();
  listener = () => {
    guardArmed = false;
    const top = stack[stack.length - 1];
    if (top) {
      pushGuard();
      top.close();
    } else {
      onRootBack?.();
    }
  };
  window.addEventListener('popstate', listener);
}

// Çıkış sorusundan "Oyunda kal" → geri tuşu yeniden uygulamanın kontrolünde.
export function rearmBack() {
  if (!BACK_ENABLED || !installed || guardArmed) return;
  pushGuard();
}

// "Çık": tarayıcı izin verirse pencereyi kapatır; vermezse (TWA'da sayfa kendini
// kapatamayabilir) kök kayıttayız — bir sonraki geri tuşu uygulamayı kapatır.
export function exitApp() {
  try {
    window.close();
  } catch {
    /* yoksay */
  }
}

// open true olduğu sürece geri tuşu onClose'u çağırır (en son açılan önce).
// Ana sayfada bekçi düşmüşken yeni bir ekran açılırsa bekçi yeniden eklenir.
export function useBackClose(open, onClose) {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  });
  useEffect(() => {
    if (!open || !BACK_ENABLED) return undefined;
    const entry = { close: () => ref.current?.() };
    stack.push(entry);
    rearmBack();
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}
