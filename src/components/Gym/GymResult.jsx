import { useEffect, useState } from 'react';
import './Gym.css';

const f1 = (v) => Number(v || 0).toFixed(1).replace('.0', '');

// v77 — 3 görev bitince güç eskiden yeniye sayar; bonus tuttuysa altın parıltı.
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
  const extra = result.bonus ? Math.round((Number(result.gain) - Number(result.base)) * 10) / 10 : 0;
  return (
    <div className="gy-result-bg" onClick={onClose}>
      <div className="gy-result" onClick={(e) => e.stopPropagation()}>
        <div className="gy-result-ico">💪</div>
        <p className="gy-result-title">Antrenman tamamlandı!</p>
        <div className={`gy-result-num${done && result.bonus ? ' cue-glow' : ''}`}>{f1(v)}</div>
        <p className="gy-result-line">
          Gücün arttı: <b>{f1(result.from)}</b> → <b>{f1(result.to)}</b> (+{f1(result.gain)})
        </p>
        {result.bonus && extra > 0 && <p className="gy-result-line hot">🔥 Bonuslu salon sayesinde +{f1(extra)} fazladan güç</p>}
        {result.from < 200 && result.to >= 200 && <p className="gy-result-star cue-glow">⭐ 200 güce ulaştın! Bundan sonra güç daha yavaş artar.</p>}
        <p className="gy-result-line dim">Yeni antrenman hakkın saat 19:00&apos;da gelir.</p>
        <button className="gy-go" onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}
