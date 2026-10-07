import { EQUIP } from './gymMeta';
import './Gym.css';

// v77 — sağda 3 aşamalı görev ağacı: yapılan ✓, sıradaki nabız atar
export default function TaskTree({ membership, onTapCurrent }) {
  if (!membership) return null;
  return (
    <div className="gy-tree">
      {membership.tasks.map((t, i) => {
        const done = i < membership.step;
        const cur = i === membership.step;
        return (
          <div key={t} className="gy-tree-row">
            {i > 0 && <i className={`gy-tree-line${i <= membership.step ? ' on' : ''}`} />}
            <button className={`gy-node${done ? ' done' : ''}${cur ? ' cur cue-pulse' : ''}`} disabled={!cur} onClick={() => cur && onTapCurrent?.(t)} title={EQUIP[t].name}>
              {done ? '✓' : EQUIP[t].icon}
            </button>
          </div>
        );
      })}
      {membership.bonus && <span className="gy-tree-bonus">🔥</span>}
      {membership.expiresAtMs > 0 && (
        <span className="gy-tree-time" title="Son süre">
          ⏳ {new Date(membership.expiresAtMs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
