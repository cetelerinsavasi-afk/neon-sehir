import { managerLevelInfo } from '../../lib/managerLevel';
import './FutbolLevelBar.css';

// FutbolLevelBar (v38) — menajerlik seviyesi puan aralığı üzerinde nerede
// olduğunu gösterir: sol uç = bir alt seviyeye düşüş, sağ uç = bir üst
// seviyeye çıkış. Uçlardaki küçük rozetler kaç maç kaldığını söyler.
export default function FutbolLevelBar({ player }) {
  const { level, points, lo, hi, toUp, toDown } = managerLevelInfo(player);
  const span = hi - lo + 1;
  const ratio = span > 0 ? (points - lo + 0.5) / span : 0.5;
  const pct = Math.max(3, Math.min(97, ratio * 100));

  return (
    <div className="futbol-level-bar-wrap">
      <span className="futbol-level-badge">Seviye {level}</span>
      <span className="futbol-level-edge down" title={`${toDown} mağlubiyette Seviye ${level - 1}`}>
        ▼{toDown}
      </span>
      <div className="futbol-level-track">
        <div className={`futbol-level-fill ${ratio >= 0.5 ? 'pos' : 'neg'}`} style={{ width: `${pct}%` }} />
        <div className="futbol-level-dot" style={{ left: `${pct}%` }} />
      </div>
      <span className="futbol-level-edge up" title={`${toUp} galibiyette Seviye ${level + 1}`}>
        ▲{toUp}
      </span>
    </div>
  );
}
