import { useEffect, useRef, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import { EQUIP } from './gymMeta';
import './Gym.css';

// =============================================================================
// v77 — Alet başında kısa mini oyun (10–15 sn). Başarısızlık yok; başarı ekstra
// bir şey kazandırmaz, amaç görevi tamamlamak. Dört alet, dört hareket:
//   koşu bandı → ritimli sağ-sol dokunuş · bench → basılı tut-bırak
//   boks torbası → ritimli vuruş · dambıl → yukarı kaydırma
// İlerleme hem hareketle hem zamanla sınırlı (en az ~10,5 sn); süre sunucuda
// da doğrulanır (gymStep / gymStepDone).
// =============================================================================
const MIN_MS = 10_500;
const NEED = { treadmill: 34, bench: 7, bag: 18, dumbbells: 10 };

export default function GymMiniGame({ equipment, onDone, onClose }) {
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState('starting'); // starting | play | saving | err
  const [hold, setHold] = useState(0);
  const [beat, setBeat] = useState(false);
  const startRef = useRef(0);
  const lastSide = useRef(null);
  const holdStart = useRef(0);
  const swipeY = useRef(null);
  const need = NEED[equipment] || 10;
  const prog = Math.min(score / need, elapsed / MIN_MS, 1);

  useEffect(() => {
    let alive = true;
    shopAction({ op: 'gymStep', equipment })
      .then(() => {
        if (!alive) return;
        startRef.current = performance.now();
        setPhase('play');
      })
      .catch(() => alive && setPhase('err'));
    return () => {
      alive = false;
    };
  }, [equipment]);
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const iv = setInterval(() => {
      setElapsed(performance.now() - startRef.current);
      if (holdStart.current) setHold(Math.min(1, (performance.now() - holdStart.current) / 900));
    }, 60);
    const bi = setInterval(() => setBeat((b) => !b), 320);
    return () => {
      clearInterval(iv);
      clearInterval(bi);
    };
  }, [phase]);
  // tamamlandı → sunucuya bildir (erken sayılırsa kısa bekleyip yeniden dener)
  useEffect(() => {
    if (phase !== 'play' || prog < 1) return;
    setPhase('saving');
    let tries = 0;
    const send = () =>
      shopAction({ op: 'gymStepDone' })
        .then((r) => onDone?.(r))
        .catch((e) => {
          if (String(e?.message || '') === 'too-fast' && tries++ < 4) setTimeout(send, 900);
          else setPhase('err');
        });
    send();
  }, [prog, phase, onDone]);

  const add = (n = 1) => phase === 'play' && setScore((s) => s + n);
  const tapSide = (side) => {
    if (lastSide.current !== side) add(1);
    lastSide.current = side;
  };
  const holdDown = () => {
    holdStart.current = performance.now();
  };
  const holdUp = () => {
    if (holdStart.current && performance.now() - holdStart.current >= 900) add(1);
    holdStart.current = 0;
    setHold(0);
  };

  const e = EQUIP[equipment] || { icon: '🏋️' };
  return (
    <div className="gy-game" onClick={(ev) => ev.stopPropagation()}>
      <div className="gy-game-head">
        <span className="gy-game-ico">{e.icon}</span>
        <i className="gy-game-bar">
          <i style={{ width: `${Math.round(prog * 100)}%` }} />
        </i>
        {onClose && (
          <button className="wk-x" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      {phase === 'starting' && <div className="gy-game-wait">…</div>}
      {phase === 'err' && <div className="gy-game-wait">⚠️</div>}
      {phase === 'saving' && <div className="gy-game-wait cue-glow">✓</div>}
      {phase === 'play' && equipment === 'treadmill' && (
        <div className="gy-pads">
          <button className={`gy-pad${lastSide.current === 'L' ? '' : ' next'}`} onPointerDown={() => tapSide('L')}>
            👣
          </button>
          <button className={`gy-pad${lastSide.current === 'R' ? '' : ' next'}`} onPointerDown={() => tapSide('R')}>
            👣
          </button>
        </div>
      )}
      {phase === 'play' && equipment === 'bench' && (
        <button className="gy-hold" style={{ '--h': hold }} onPointerDown={holdDown} onPointerUp={holdUp} onPointerLeave={holdUp} onContextMenu={(ev) => ev.preventDefault()}>
          <span>{hold >= 1 ? '⬆' : '✋'}</span>
          <b>
            {score}/{need}
          </b>
        </button>
      )}
      {phase === 'play' && equipment === 'bag' && (
        <button className={`gy-punch${beat ? ' beat' : ''}`} onPointerDown={() => add(1)}>
          🥊
        </button>
      )}
      {phase === 'play' && equipment === 'dumbbells' && (
        <div
          className="gy-swipe"
          onPointerDown={(ev) => (swipeY.current = ev.clientY)}
          onPointerUp={(ev) => {
            if (swipeY.current !== null && swipeY.current - ev.clientY > 50) add(1);
            swipeY.current = null;
          }}
        >
          <span className="gy-swipe-arrow">⬆</span>
          <span className="gy-swipe-ico">💪</span>
          <b>
            {score}/{need}
          </b>
        </div>
      )}
    </div>
  );
}
