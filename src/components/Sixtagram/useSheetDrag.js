// v136 — Alttan açılan paneli (yorumlar, hikâyeyi görenler…) AŞAĞI ÇEKEREK kapatma.
// Panelin herhangi bir yerinden (başlık, boş alan) aşağı çekilince panel parmağı
// izler; yeterince çekilince kapanır. Kaydırılabilir listenin içindeyken liste en
// üstte değilse normal kaydırma olur (liste en üstteyken aşağı çekmek kapatır).
// Kullanım: const drag = useSheetDrag(onClose); <div ref={drag.ref} style={drag.style}>
//   kaydırılan listeye data-sheet-scroll özniteliği verilir.
import { useCallback, useEffect, useRef, useState } from 'react';

const CLOSE_PX = 110;

export function useSheetDrag(onClose) {
  const [dy, setDy] = useState(0);
  const [el, setEl] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const ref = useCallback((node) => setEl(node), []);

  useEffect(() => {
    if (!el) return undefined;
    let s = null;
    const scrollerOf = (t) => (t && t.closest ? t.closest('[data-sheet-scroll]') : null);
    const noDrag = (t) => Boolean(t && t.closest && t.closest('input, textarea, select, [data-no-sheet-drag]'));
    const start = (y, target) => {
      if (noDrag(target)) return;
      s = { y0: y, t: Date.now(), sc: scrollerOf(target), on: false, dy: 0 };
    };
    const move = (y, ev) => {
      if (!s) return;
      const d = y - s.y0;
      if (!s.on) {
        if (d < -6) {
          s = null; // yukarı: normal kaydırma
          return;
        }
        if (d > 8 && (!s.sc || s.sc.scrollTop <= 0)) {
          s.on = true;
          s.y0 = y;
        } else return;
      }
      if (ev?.cancelable) ev.preventDefault();
      s.dy = Math.max(0, y - s.y0);
      setDy(s.dy);
    };
    const end = () => {
      if (!s) return;
      const { on, dy: d, t } = s;
      s = null;
      if (!on) return;
      const v = d / Math.max(1, Date.now() - t);
      if (d > CLOSE_PX || (d > 45 && v > 0.6)) closeRef.current?.();
      else setDy(0);
    };
    const ts = (e) => start(e.touches[0].clientY, e.target);
    const tm = (e) => move(e.touches[0].clientY, e);
    const md = (e) => {
      if (e.button !== 0) return;
      start(e.clientY, e.target);
      const mm = (ev) => move(ev.clientY, ev);
      const mu = () => {
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup', mu);
        end();
      };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('mousedown', md);
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('mousedown', md);
    };
  }, [el]);

  return { ref, dy, style: dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined };
}
