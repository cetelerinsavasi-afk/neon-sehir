// Savaş zar animasyonu. Akış:
//  1) açılır açılmaz sunucuya istek gider, zarlar havada döner (buton kilitli)
//  2) sunucu sonucu gelince zarlar SUNUCUNUN değerlerine oturur
//  3) "🎲 2 + 🎲 6 = 8" → "8 × 40.000" → katkı sayacı yükselir
// Animasyon sadece görseldir; değerlerin tamamı sunucudan gelir.
import { useEffect, useRef, useState } from 'react';
import { fmt } from './gangConstants';
import { friendlyError } from './gangApi';

const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const FACE_ROT = {
  1: 'rotateX(0deg) rotateY(0deg)',
  6: 'rotateX(0deg) rotateY(180deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(-90deg) rotateY(0deg)',
  2: 'rotateX(90deg) rotateY(0deg)',
};
const FACE_POS = { 1: 'front', 6: 'back', 3: 'right', 4: 'left', 5: 'top', 2: 'bottom' };

function Die({ value, rolling, delay = 0 }) {
  return (
    <div className="gx-die-scene">
      <div className={`gx-cube${rolling ? ' rolling' : ''}`} style={{ transform: rolling ? undefined : `${FACE_ROT[value] || FACE_ROT[1]} rotateZ(${delay ? 360 : -360}deg)`, animationDelay: `${delay}ms` }}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className={`gx-face gx-face-${FACE_POS[n]}`}>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className={PIPS[n].includes(i) ? 'pip' : ''} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function useCountUp(target, active, duration = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let raf;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return v;
}

export default function DiceRoller({ title, subtitle, onRoll, onClose, sideLabel }) {
  const [phase, setPhase] = useState('rolling'); // rolling → landed → multiply → result | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const started = useRef(false);
  const count = useCountUp(result?.contribution || 0, phase === 'result');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const minSpin = new Promise((r) => setTimeout(r, 1100));
    Promise.all([onRoll(), minSpin])
      .then(([res]) => {
        setResult(res);
        setPhase('landed');
        setTimeout(() => setPhase('multiply'), 900);
        setTimeout(() => setPhase('result'), 1700);
      })
      .catch((err) => {
        setError(friendlyError(err));
        setPhase('error');
      });
  }, [onRoll]);

  const d = result?.dice || [1, 1];
  const sum = d[0] + d[1];
  const done = phase === 'result' || phase === 'error';

  return (
    <div className="gx-sheet-backdrop gx-center" onClick={done ? onClose : undefined}>
      <div className="gx-dice-modal" onClick={(e) => e.stopPropagation()}>
        <p className="gx-dice-title">{title}</p>
        {subtitle && <p className="gx-dice-sub">{subtitle}</p>}
        <div className={`gx-dice-row${phase === 'rolling' ? ' shaking' : ''}`}>
          <Die value={d[0]} rolling={phase === 'rolling'} />
          <Die value={d[1]} rolling={phase === 'rolling'} delay={120} />
        </div>
        {phase === 'rolling' && <p className="gx-dice-eq dim">Zarlar atılıyor…</p>}
        {phase === 'error' && <p className="gx-dice-eq err">{error}</p>}
        {result && phase !== 'rolling' && (
          <>
            <p className="gx-dice-eq pop">
              🎲 {d[0]} + 🎲 {d[1]} = <b>{sum}</b>
            </p>
            {(phase === 'multiply' || phase === 'result') && (
              <p className="gx-dice-mult pop">
                {sum} × {fmt(result.power)} <span className="dim">güç</span>
              </p>
            )}
            {phase === 'result' && (
              <div className="gx-dice-result pop">
                <span className="gx-dice-result-label">⚔️ Savaş Katkısı{sideLabel ? ` · ${sideLabel}` : ''}</span>
                <span className="gx-dice-result-val">{fmt(count)}</span>
                <span className="gx-dice-prestige">+{fmt(result.prestige)} prestij</span>
              </div>
            )}
          </>
        )}
        <button className="gx-btn gx-btn-primary gx-btn-block" onClick={onClose} disabled={!done}>
          {done ? 'Tamam' : '…'}
        </button>
      </div>
    </div>
  );
}
