import { DOOR_TYPES, DOOR_TYPE_KEYS, DEFAULT_DOOR, doorRange } from '../../../functions/houseDoor.js';

// v101 — evin giriş kapısı: tip + duvar + duvardaki yer (ücretsiz)
const WALL_BTNS = [
  { w: 2, label: '⬇ Arka' },
  { w: 0, label: '⬆ Karşı' },
  { w: 3, label: '⬅ Sol' },
  { w: 1, label: '➡ Sağ' },
];

export default function EntranceDoorPicker({ door, onChange }) {
  const d = door || DEFAULT_DOOR;
  const lim = doorRange(d.w, d.t);
  const move = (dx) => onChange({ x: Math.max(-lim, Math.min(lim, d.x + dx)) });
  return (
    <>
      <div className="hs-surf-row">
        <span className="hs-surf-label">Kapı</span>
        {DOOR_TYPE_KEYS.map((t) => (
          <button key={t} className={`hs-surf${d.t === t ? ' on' : ''}`} onClick={() => onChange({ t })}>
            <i className="hs-door-ico">{DOOR_TYPES[t].icon}</i>
            <span>{DOOR_TYPES[t].name}</span>
            <span className="hs-price free sm">Ücretsiz</span>
          </button>
        ))}
      </div>
      <div className="hs-surf-row hs-door-pos">
        <span className="hs-surf-label">Yer</span>
        {WALL_BTNS.map((b) => (
          <button key={b.w} className={`hs-door-wall${d.w === b.w ? ' on' : ''}`} onClick={() => onChange({ w: b.w, x: 0 })}>
            {b.label}
          </button>
        ))}
        <button className="hs-door-step" onClick={() => move(-0.5)} aria-label="Sola kaydır">◀</button>
        <input type="range" min={-lim} max={lim} step={0.25} value={d.x} onChange={(e) => onChange({ x: Number(e.target.value) })} aria-label="Kapının yeri" />
        <button className="hs-door-step" onClick={() => move(0.5)} aria-label="Sağa kaydır">▶</button>
      </div>
    </>
  );
}
