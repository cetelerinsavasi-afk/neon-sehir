import { useCallback, useEffect, useRef, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import { EQUIP } from './gymMeta';
import './Gym.css';

// =============================================================================
// v77 — Alet başında kısa mini oyun (~10–15 sn). Kaybetmek yok; amaç görevi
// bitirmek. Her alet farklı bir oyun:
//   🏃 Koşu bandı  → sol-sağ ayağa sırayla bas, hız göstergesini yüksek tut
//   🏋️ Bench press → gidip gelen ibre yeşil alandayken bas (zamanlama)
//   🥊 Boks torbası→ torbada yanan hedeflere sönmeden vur (refleks)
//   💪 Dambıl      → ok hangi kolu gösteriyorsa o tarafta yukarı kaydır
// Seri (kombo) ve "Harika!" geri bildirimleri sadece eğlence içindir.
// İlerleme hem harekete hem süreye bağlı (en az ~10,5 sn); süre sunucuda da
// doğrulanır (gymStep / gymStepDone).
// =============================================================================
const MIN_MS = 10_500;
const NEED = { treadmill: 34, bench: 7, bag: 18, dumbbells: 10 };
const HOW = {
  treadmill: 'Sol, sağ, sol, sağ… sırayla bas!',
  bench: 'İbre yeşildeyken bas.',
  bag: 'Yanan hedefe vur.',
  dumbbells: 'Ok olan tarafta yukarı kaydır.',
};
const PRAISE = ['Harika!', 'Süper!', 'Mükemmel!', 'Böyle devam!', 'Güçlü!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default function GymMiniGame({ equipment, onDone, onClose }) {
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState('starting'); // starting | count | play | saving | err
  const [count, setCount] = useState(3);
  const [combo, setCombo] = useState(0);
  const [pop, setPop] = useState(null); // { text, good, n }
  const startRef = useRef(0);
  const comboRef = useRef(0);
  const need = NEED[equipment] || 10;
  const prog = Math.min(score / need, elapsed / MIN_MS, 1);
  const moveDone = score >= need;

  // sunucuda adımı başlat → 3-2-1 → oyun
  useEffect(() => {
    let alive = true;
    shopAction({ op: 'gymStep', equipment })
      .then(() => alive && setPhase('count'))
      .catch(() => alive && setPhase('err'));
    return () => {
      alive = false;
    };
  }, [equipment]);
  useEffect(() => {
    if (phase !== 'count') return undefined;
    if (count <= 0) {
      startRef.current = performance.now();
      setPhase('play');
      return undefined;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 650);
    return () => clearTimeout(t);
  }, [phase, count]);
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const iv = setInterval(() => setElapsed(performance.now() - startRef.current), 80);
    return () => clearInterval(iv);
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

  const hit = useCallback(
    (n = 1, text) => {
      if (phase !== 'play') return;
      setScore((s) => s + n);
      const next = comboRef.current + 1;
      comboRef.current = next;
      setCombo(next);
      setPop({ text: text || (next % 5 === 0 ? `${next} seri! ${pick(PRAISE)}` : null), good: true, n: Date.now() });
    },
    [phase]
  );
  const miss = useCallback(
    (text) => {
      if (phase !== 'play') return;
      comboRef.current = 0;
      setCombo(0);
      setPop({ text, good: false, n: Date.now() });
    },
    [phase]
  );

  const e = EQUIP[equipment] || { icon: '🏋️', name: 'Alet' };
  const play = phase === 'play';
  return (
    <div className="gy-game" onClick={(ev) => ev.stopPropagation()}>
      <div className="gy-game-head">
        <span className="gy-game-ico">{e.icon}</span>
        <div className="gy-game-titles">
          <b>{e.name}</b>
          <small>
            {play
              ? moveDone
                ? 'Tamam, set bitiyor!'
                : `${Math.min(score, need)}/${need} · ${combo >= 3 ? `🔥 ${combo} seri` : 'seri yap!'}`
              : 'Görev'}
          </small>
        </div>
        {onClose && (
          <button className="wk-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        )}
      </div>
      <i className="gy-game-bar">
        <i style={{ width: `${Math.round(prog * 100)}%` }} />
      </i>
      <p className="gy-how">{HOW[equipment]}</p>

      {phase === 'starting' && <div className="gy-game-wait">Hazırlanıyor…</div>}
      {phase === 'count' && (
        <div className="gy-game-wait gy-count" key={count}>
          {count > 0 ? count : 'Başla!'}
        </div>
      )}
      {phase === 'err' && <div className="gy-game-wait small">Bağlantı sorunu oldu. Kapatıp alete tekrar dokun.</div>}
      {phase === 'saving' && <div className="gy-game-wait small cue-glow">✓ Görev tamamlandı!</div>}

      {play && (
        <div className="gy-arena">
          {pop?.text && (
            <span key={pop.n} className={`gy-pop${pop.good ? '' : ' bad'}`}>
              {pop.text}
            </span>
          )}
          {equipment === 'treadmill' && <Treadmill onHit={hit} onMiss={miss} />}
          {equipment === 'bench' && <Bench onHit={hit} onMiss={miss} />}
          {equipment === 'bag' && <Bag onHit={hit} onMiss={miss} />}
          {equipment === 'dumbbells' && <Dumbbells onHit={hit} onMiss={miss} />}
        </div>
      )}
    </div>
  );
}

// 🏃 Koşu bandı — sırayla sol/sağ; hız = son basışlar arası süre
function Treadmill({ onHit, onMiss }) {
  const last = useRef(null);
  const times = useRef([]);
  const [speed, setSpeed] = useState(0);
  const [dist, setDist] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      const now = performance.now();
      times.current = times.current.filter((t) => now - t < 1200);
      setSpeed(Math.min(1, times.current.length / 7));
    }, 100);
    return () => clearInterval(iv);
  }, []);
  const tap = (side) => {
    if (last.current === side) return onMiss('Aynı ayak! Sırayla bas.');
    last.current = side;
    times.current.push(performance.now());
    setDist((d) => d + 1.4);
    onHit(1);
  };
  const next = last.current === 'L' ? 'R' : 'L';
  return (
    <div className="gy-tm">
      <div className="gy-tm-track" style={{ '--spd': `${Math.max(0.15, 1.2 - speed)}s` }}>
        <span className="gy-tm-runner" style={{ transform: `translateX(${speed * 60}px)` }}>
          🏃
        </span>
      </div>
      <div className="gy-tm-meta">
        <span>Hız: {speed > 0.75 ? 'Çok hızlı 🔥' : speed > 0.4 ? 'Hızlı' : speed > 0 ? 'Yavaş' : 'Dur'}</span>
        <i className="gy-tm-speed">
          <i style={{ width: `${speed * 100}%` }} />
        </i>
        <span>{dist.toFixed(0)} m</span>
      </div>
      <div className="gy-pads">
        {['L', 'R'].map((s) => (
          <button key={s} className={`gy-pad${next === s ? ' next' : ''}`} onPointerDown={() => tap(s)}>
            <span className="gy-pad-ico">👣</span>
            <small>{s === 'L' ? 'Sol' : 'Sağ'}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

// 🏋️ Bench — ibre 0..100 gidip gelir; yeşil alan rastgele yer değiştirir
function Bench({ onHit, onMiss }) {
  const [x, setX] = useState(0);
  const [zone, setZone] = useState({ a: 38, w: 26 });
  const [lift, setLift] = useState(false);
  const xr = useRef(0);
  const dir = useRef(1);
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const step = (t) => {
      const dt = t - prev;
      prev = t;
      let v = xr.current + dir.current * dt * 0.095;
      if (v >= 100) {
        v = 100;
        dir.current = -1;
      }
      if (v <= 0) {
        v = 0;
        dir.current = 1;
      }
      xr.current = v;
      setX(v);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  const press = () => {
    const v = xr.current;
    if (v >= zone.a && v <= zone.a + zone.w) {
      const center = Math.abs(v - (zone.a + zone.w / 2)) < zone.w / 6;
      onHit(1, center ? 'Tam ortası! Mükemmel!' : pick(PRAISE));
      setLift(true);
      setTimeout(() => setLift(false), 350);
      const w = Math.max(16, zone.w - 1.5);
      setZone({ a: 8 + Math.random() * (84 - w), w });
    } else onMiss(v < zone.a ? 'Biraz erken!' : 'Biraz geç!');
  };
  return (
    <div className="gy-bench">
      <div className={`gy-bench-bar${lift ? ' up' : ''}`}>🏋️</div>
      <div className="gy-meter">
        <i className="gy-meter-zone" style={{ left: `${zone.a}%`, width: `${zone.w}%` }} />
        <i className="gy-meter-needle" style={{ left: `${x}%` }} />
      </div>
      <button className="gy-bigbtn" onPointerDown={press}>
        KALDIR!
      </button>
    </div>
  );
}

// 🥊 Boks torbası — 3×3 hedef; biri yanar, ~1 sn içinde vurulmalı
function Bag({ onHit, onMiss }) {
  const [target, setTarget] = useState(4);
  const [shake, setShake] = useState(0);
  const timer = useRef(0);
  const life = useRef(1100);
  const next = useCallback(
    (prev) => {
      let n = Math.floor(Math.random() * 9);
      if (n === prev) n = (n + 1 + Math.floor(Math.random() * 8)) % 9;
      setTarget(n);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onMiss('Kaçırdın! Daha hızlı.');
        life.current = Math.min(1300, life.current + 80);
        next(n);
      }, life.current);
    },
    [onMiss]
  );
  useEffect(() => {
    next(-1);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const punch = (i) => {
    if (i !== target) return onMiss('Yanlış yere vurdun!');
    setShake((s) => s + 1);
    life.current = Math.max(650, life.current - 25);
    onHit(1);
    next(i);
  };
  return (
    <div className={`gy-bag${shake % 2 ? ' hit-a' : shake ? ' hit-b' : ''}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <button key={i} className={`gy-bag-cell${i === target ? ' on' : ''}`} onPointerDown={() => punch(i)}>
          {i === target ? '🎯' : ''}
        </button>
      ))}
    </div>
  );
}

// 💪 Dambıl — ok sol ya da sağ kolu gösterir; o yarıda yukarı kaydır
function Dumbbells({ onHit, onMiss }) {
  const [side, setSide] = useState('L');
  const [up, setUp] = useState(null);
  const y0 = useRef(null);
  const down = (ev) => {
    y0.current = { y: ev.clientY, x: ev.clientX, w: ev.currentTarget.getBoundingClientRect() };
  };
  const release = (ev) => {
    const s = y0.current;
    y0.current = null;
    if (!s) return;
    if (s.y - ev.clientY < 40) return onMiss('Parmağını YUKARI kaydır.');
    const half = s.x - s.w.left < s.w.width / 2 ? 'L' : 'R';
    if (half !== side) return onMiss(side === 'L' ? 'Sol kol sırası!' : 'Sağ kol sırası!');
    setUp(half);
    setTimeout(() => setUp(null), 300);
    onHit(1);
    setSide(Math.random() < 0.7 ? (half === 'L' ? 'R' : 'L') : half);
  };
  return (
    <div className="gy-db" onPointerDown={down} onPointerUp={release} onPointerCancel={() => (y0.current = null)}>
      {['L', 'R'].map((s) => (
        <div key={s} className={`gy-db-half${side === s ? ' on' : ''}${up === s ? ' up' : ''}`}>
          <span className="gy-db-arrow">{side === s ? '⬆' : ''}</span>
          <span className="gy-db-ico">💪</span>
          <small>{s === 'L' ? 'Sol kol' : 'Sağ kol'}</small>
        </div>
      ))}
    </div>
  );
}
