import { useEffect, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useNetCredits } from '../../hooks/useVenueData';
import './Venue.css';

// v77 — İnternet kafe: ödenmiş süre halkası (mekân dışında da görünür).
// Altın bir sonraki dakikaya yetmiyorsa sarı.
export default function NetCreditRing({ houseId = null, className = '' }) {
  const { player } = usePlayer();
  const rows = useNetCredits();
  const [now, setNow] = useState(Date.now());
  const active = rows.filter((r) => Number(r.creditUntilMs || 0) > now && (!houseId || r.houseId === houseId));
  useEffect(() => {
    // kayıtlar değişince saati hemen tazele (yoksa eski "şimdi" ile 60'tan büyük görünür)
    setNow(Date.now());
    if (!rows.some((r) => Number(r.creditUntilMs || 0) > Date.now())) return undefined;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [rows]);
  if (!active.length) return null;
  const s = active.sort((a, b) => b.creditUntilMs - a.creditUntilMs)[0];
  const left = Math.min(60, Math.max(0, Math.ceil((s.creditUntilMs - now) / 1000)));
  const p = Math.min(1, left / 60);
  const warn = Number(player?.gold || 0) < Number(s.lastPrice || 0);
  const size = 34;
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <span className={`vn-credit${warn ? ' warn' : ''} ${className}`} title={`🖥️ ${left} sn`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className="fg" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <b>{left}</b>
    </span>
  );
}
