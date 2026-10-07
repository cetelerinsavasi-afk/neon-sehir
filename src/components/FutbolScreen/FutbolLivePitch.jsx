import { useEffect, useRef, useState } from 'react';
import { pitchStateAt, teamDots, VARIANT_TEXT, VARIANT_ICON } from './futbolPitchScript';
import './FutbolLivePitch.css';

// =============================================================================
// v77 — Canlı saha: top gerçek zamanlı akar (1 maç dakikası ≈ 40 sn).
// Atakta top rakip yarıya iner, ceza sahası kızarır ("tehlike"), şut çıkar:
// GOL → ağlar sallanır, ekran parlar · KURTARIŞ · DİREK · AUT · BLOK.
// getMinute(): o anki simüle dakika (canlı ya da özet tekrarı).
// =============================================================================
export default function FutbolLivePitch({ timeline, possessionCheckpoints, getMinute, homeName, awayName, sponsorName }) {
  const [, force] = useState(0);
  const trail = useRef([]);
  const lastT = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      if (now - last > 33) {
        last = now;
        force((n) => (n + 1) % 1e6);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const t = Math.max(0, Math.min(90, getMinute()));
  const st = pitchStateAt(timeline, possessionCheckpoints, t);
  // top izi (geri sarma/atlama olursa sıfırla)
  if (t < lastT.current || t - lastT.current > 1) trail.current = [];
  lastT.current = t;
  trail.current = [...trail.current, st.ball].slice(-7);

  const home = teamDots('home', st.ball);
  const away = teamDots('away', st.ball);
  const e = st.event;
  const showBanner = e && (st.phase === 'shot' || (st.phase === 'after' && st.since < 0.42));
  const goalFlash = st.variant === 'goal' && st.phase === 'after' && st.since < 0.42;
  const dangerSide = st.phase === 'attack' && st.danger > 0.35 ? (st.attackSide === 'home' ? 'right' : 'left') : null;
  const netShake = goalFlash ? (st.attackSide === 'home' ? 'right' : 'left') : null;
  const teamName = (side) => (side === 'home' ? homeName : awayName);

  return (
    <div className={`flp${goalFlash ? ` flp-goal ${st.attackSide}` : ''}`}>
      <svg className="flp-svg" viewBox="-5 -3 110 70" preserveAspectRatio="xMidYMid meet">
        {/* çim şeritleri */}
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={i * 10} y={0} width={10} height={64} className={i % 2 ? 'flp-grass b' : 'flp-grass a'} />
        ))}
        {/* tehlike bölgesi */}
        {dangerSide && <rect className="flp-danger" x={dangerSide === 'right' ? 83 : 0} y={14} width={17} height={36} style={{ opacity: 0.15 + st.danger * 0.35 }} />}
        {/* çizgiler */}
        <g className="flp-lines">
          <rect x={0} y={0} width={100} height={64} />
          <line x1={50} y1={0} x2={50} y2={64} />
          <circle cx={50} cy={32} r={8} />
          <circle cx={50} cy={32} r={0.6} className="flp-dot" />
          <rect x={0} y={14} width={16} height={36} />
          <rect x={84} y={14} width={16} height={36} />
          <rect x={0} y={24} width={6} height={16} />
          <rect x={94} y={24} width={6} height={16} />
        </g>
        {/* kaleler */}
        <g className={`flp-net left${netShake === 'left' ? ' shake' : ''}`}>
          <rect x={-3.5} y={27.5} width={3.5} height={9} />
        </g>
        <g className={`flp-net right${netShake === 'right' ? ' shake' : ''}`}>
          <rect x={100} y={27.5} width={3.5} height={9} />
        </g>
        <line className={`flp-post${st.variant === 'post' && st.phase !== 'attack' && st.attackSide === 'away' ? ' hit' : ''}`} x1={0} y1={27.5} x2={0} y2={36.5} />
        <line className={`flp-post${st.variant === 'post' && st.phase !== 'attack' && st.attackSide === 'home' ? ' hit' : ''}`} x1={100} y1={27.5} x2={100} y2={36.5} />
        {/* oyuncular */}
        {home.map((p, i) => (
          <circle key={`h${i}`} cx={p.x} cy={p.y} r={i === 0 ? 1.9 : 1.7} className={`flp-pl home${i === 0 ? ' gk' : ''}`} />
        ))}
        {away.map((p, i) => (
          <circle key={`a${i}`} cx={p.x} cy={p.y} r={i === 0 ? 1.9 : 1.7} className={`flp-pl away${i === 0 ? ' gk' : ''}`} />
        ))}
        {/* top izi + top */}
        {trail.current.slice(0, -1).map((b, i) => (
          <circle key={`t${i}`} cx={b.x} cy={b.y} r={0.5 + i * 0.12} className="flp-trail" style={{ opacity: 0.05 + i * 0.05 }} />
        ))}
        <ellipse cx={st.ball.x + 0.4} cy={st.ball.y + 1.1} rx={1.1} ry={0.45} className="flp-shadow" />
        <circle cx={st.ball.x} cy={st.ball.y} r={1.15} className={`flp-ball${st.phase === 'shot' ? ' fast' : ''}`} />
      </svg>

      {sponsorName && <div className="flp-sponsor">🤝 {sponsorName}</div>}
      <div className="flp-clock">{Math.floor(t)}&apos;</div>
      {st.phase === 'attack' && st.danger > 0.2 && (
        <div className={`flp-attack ${st.attackSide}`}>⚡ {teamName(st.attackSide)} atakta</div>
      )}
      {showBanner && (
        <div key={`${e.minute}-${e.team}`} className={`flp-banner ${st.variant} ${st.attackSide}`}>
          <span className="flp-banner-ico">{VARIANT_ICON[st.variant]}</span>
          <b>{VARIANT_TEXT[st.variant]}</b>
          {st.variant === 'goal' && e.scorerName && (
            <small>
              {e.scorerName}
              {e.assistName ? ` · 🎯 ${e.assistName}` : ''}
            </small>
          )}
          {st.variant !== 'goal' && <small>{teamName(st.variant === 'save' || st.variant === 'block' ? (st.attackSide === 'home' ? 'away' : 'home') : st.attackSide)}</small>}
        </div>
      )}
    </div>
  );
}
