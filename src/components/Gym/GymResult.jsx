import { useEffect, useState } from 'react';
import './Gym.css';

// v77 — 3 görev bitince savaştaki zar ekranına benzer sayaç: güç eskiden yeniye
// sayar; bonus tuttuysa sayıya altın parıltı.
export default function GymResult({ result, onClose }) {
  const [v, setV] = useState(result.from);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 1400);
      const e = 1 - Math.pow(1 - p, 3);
      setV(result.from + (result.to - result.from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result.from, result.to]);
  const done = Math.abs(v - result.to) < 0.05;
  return (
    <div className="gy-result-bg" onClick={onClose}>
      <div className="gy-result" onClick={(e) => e.stopPropagation()}>
        <div className="gy-result-ico">⚡</div>
        <div className={`gy-result-num${done && result.bonus ? ' cue-glow' : ''}`}>{v.toFixed(1).replace('.0', '')}</div>
        <div className="gy-result-gain">
          +{result.gain}
          {result.bonus && <span className="gy-bonus">🔥 {result.base} → {result.gain}</span>}
        </div>
        {result.from < 200 && result.to >= 200 && <div className="gy-result-star cue-glow">⭐ 200</div>}
        <button className="gy-go" onClick={onClose}>
          ✓
        </button>
      </div>
    </div>
  );
}
