import { useEffect, useRef, useState } from 'react';
import '../../styles/cues.css';

// Basılı tut → onay (yanlışlıkla dokunma ile kapanmasın)
export default function HoldButton({ ms = 900, onDone, disabled, className = '', children }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    setP(0);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const begin = (e) => {
    if (disabled) return;
    e.preventDefault();
    start.current = performance.now();
    const tick = (now) => {
      const v = Math.min(1, (now - start.current) / ms);
      setP(v);
      if (v >= 1) {
        setP(0);
        onDone?.();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  return (
    <button
      type="button"
      className={`cue-hold ${className}`}
      style={{ '--hold': p }}
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{children}</span>
    </button>
  );
}

