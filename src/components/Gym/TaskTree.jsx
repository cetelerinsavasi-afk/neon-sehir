import { EQUIP } from './gymMeta';
import './Gym.css';

// v77 — sağ üstte 3 aşamalı görev listesi: yapılan ✓, sıradaki parlar.
// Sıradaki göreve dokununca karakter o alete yürür.
export default function TaskTree({ membership, onTapCurrent }) {
  if (!membership) return null;
  const cur = membership.tasks[membership.step];
  return (
    <div className="gy-tree">
      <span className="gy-tree-title">
        Antrenman {Math.min(membership.step + 1, membership.tasks.length)}/{membership.tasks.length}
      </span>
      <div className="gy-tree-nodes">
        {membership.tasks.map((t, i) => {
          const done = i < membership.step;
          const isCur = i === membership.step;
          return (
            <div key={t + i} className="gy-tree-row">
              {i > 0 && <i className={`gy-tree-line${i <= membership.step ? ' on' : ''}`} />}
              <button className={`gy-node${done ? ' done' : ''}${isCur ? ' cur cue-pulse' : ''}`} disabled={!isCur} onClick={() => isCur && onTapCurrent?.(t)} title={EQUIP[t].name}>
                {done ? '✓' : EQUIP[t].icon}
              </button>
            </div>
          );
        })}
      </div>
      {cur && <span className="gy-tree-sub">Sıradaki: {EQUIP[cur].name}</span>}
      {membership.bonus && <span className="gy-tree-sub hot">🔥 +%10 güç</span>}
      {membership.expiresAtMs > 0 && (
        <span className="gy-tree-sub">
          Son saat: {new Date(membership.expiresAtMs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
