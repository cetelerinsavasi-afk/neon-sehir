import { resolveEntrance, isEntranceItem } from '../../../functions/houseDoor.js';
import { CATALOG_MAP } from './houseCatalog';

// v102 — Kapılar sekmesinin üstü: giriş (ana) kapı ve varsayılan kapı.
// Kapı eşyasını seçip "⭐ Ana kapı yap" ile de ana kapı belirlenir.
export default function EntranceDoorBar({ design, onChange }) {
  const items = design?.items || [];
  const door = design?.door;
  const ent = resolveEntrance(door, items);
  const doors = items.filter(isEntranceItem);
  const defOn = ent.showDef;
  const mainName = ent.kind === 'item' ? CATALOG_MAP[ent.item.k]?.name || 'Kapı' : 'Varsayılan kapı';
  return (
    <div className="hs-door-bar">
      <span className="hs-door-main">
        ⭐ Giriş: <b>{mainName}</b>
      </span>
      {defOn && ent.kind === 'item' && (
        <button className="hs-door-btn" onClick={() => onChange({ main: null })}>
          Varsayılanı ana kapı yap
        </button>
      )}
      {defOn ? (
        <button className="hs-door-btn danger" disabled={!doors.length} onClick={() => onChange({ def: false })} title={doors.length ? '' : 'Önce odaya bir kapı koyup satın al'}>
          🗑 Varsayılan kapıyı kaldır
        </button>
      ) : (
        <button className="hs-door-btn" onClick={() => onChange({ def: true })}>
          ↩ Varsayılan kapıyı geri koy
        </button>
      )}
      {!doors.length && <span className="hs-door-hint">Kaldırmak için önce bir kapı al.</span>}
    </div>
  );
}
