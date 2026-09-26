import { useCallback, useRef } from 'react';

// Uzun basma (mobil) + sağ tık (masaüstü). Kaydırma ya da parmak hareketi
// iptal eder; kısa dokunuş normal davranışı bozmaz.
export function useLongPress(onLongPress, { ms = 450 } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const onPointerDown = useCallback(
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    [onLongPress, ms, clear]
  );
  const onPointerMove = useCallback(
    (e) => {
      if (!timer.current || !start.current) return;
      if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clear();
    },
    [clear]
  );
  const onContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      clear();
      if (!fired.current) onLongPress();
      fired.current = false;
    },
    [onLongPress, clear]
  );
  return { onPointerDown, onPointerMove, onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear, onContextMenu };
}

// Metni panoya kopyala (eski tarayıcılar için yedekli)
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
