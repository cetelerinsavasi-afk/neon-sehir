import { useEffect, useRef, useState } from 'react';

// v136 — Instagram'daki gibi "aşağı çek, yenile": en üstteyken aşağı çekince dönen
// yuvarlak çıkar, bırakınca kısa bir süre döner ve onRefresh çağrılır.
// (Akış 90 sn önbellekli; yenileme önbelleği zorlamaz — Firestore okuması artmaz.)
const TRIGGER = 64;
const HOLD = 52;
const MAX = 110;

export function usePullRefresh(ref, onRefresh, enabled = true) {
  const [pull, setPull] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const st = useRef({ y: null, pull: 0, spinning: false });
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    const s = st.current;
    const begin = (y) => {
      if (s.spinning || el.scrollTop > 0) {
        s.y = null;
        return;
      }
      s.y = y;
    };
    const move = (y, e) => {
      if (s.y == null) return;
      const d = y - s.y;
      if (d <= 0 || el.scrollTop > 0) {
        if (s.pull) {
          s.pull = 0;
          setPull(0);
        }
        return;
      }
      if (e?.cancelable) e.preventDefault();
      s.pull = Math.min(MAX, d * 0.5);
      setPull(s.pull);
    };
    const end = () => {
      if (s.y == null) return;
      s.y = null;
      if (s.pull >= TRIGGER) {
        s.spinning = true;
        setSpinning(true);
        setPull(HOLD);
        try {
          navigator.vibrate?.(8);
        } catch {
          /* yoksay */
        }
        setTimeout(() => {
          cb.current?.();
          setTimeout(() => {
            s.spinning = false;
            s.pull = 0;
            setSpinning(false);
            setPull(0);
          }, 350);
        }, 750);
      } else {
        s.pull = 0;
        setPull(0);
      }
    };
    const ts = (e) => begin(e.touches[0].clientY);
    const tm = (e) => move(e.touches[0].clientY, e);
    const md = (e) => e.pointerType === 'mouse' && e.button === 0 && begin(e.clientY);
    const mm = (e) => e.pointerType === 'mouse' && move(e.clientY);
    const mu = (e) => e.pointerType === 'mouse' && end();
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('pointerdown', md);
    window.addEventListener('pointermove', mm);
    window.addEventListener('pointerup', mu);
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('pointerdown', md);
      window.removeEventListener('pointermove', mm);
      window.removeEventListener('pointerup', mu);
    };
  }, [ref, enabled]);

  return { pull, spinning, ready: pull >= TRIGGER, trigger: TRIGGER };
}

// Instagram'ın 12 çubuklu dönen yuvarlağı
export function PullSpinner({ pull, spinning, trigger }) {
  if (!pull && !spinning) return null;
  const p = Math.min(1, pull / trigger);
  return (
    <div className="six-p2r" style={{ height: pull }} aria-hidden="true">
      <svg className={`six-p2r-ic${spinning ? ' spin' : ''}`} width="30" height="30" viewBox="0 0 30 30" style={{ opacity: Math.max(0.15, p), transform: spinning ? undefined : `rotate(${p * 270}deg)` }}>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x="13.8" y="2" width="2.4" height="7.5" rx="1.2" fill="#a8a8a8" opacity={spinning ? 0.25 + (i / 12) * 0.75 : i < Math.round(p * 12) ? 0.9 : 0.12} transform={`rotate(${i * 30} 15 15)`} />
        ))}
      </svg>
    </div>
  );
}
