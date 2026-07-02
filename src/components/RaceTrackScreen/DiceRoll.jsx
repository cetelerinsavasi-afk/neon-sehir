import { useEffect, useState } from 'react';

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// Zar atıldığında kısa bir "sallanma" animasyonu + atılan HER zarın kendi
// sonucunu ayrı ayrı gösteren görsel bileşen.
export default function DiceRoll({ rollKey, dice }) {
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (rollKey === undefined || rollKey === null) return;
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 500);
    return () => clearTimeout(t);
  }, [rollKey]);

  if (!dice || dice.length === 0) return null;

  return (
    <div className={`dice-roll${rolling ? ' rolling' : ''}`}>
      {dice.map((v, i) => (
        <span key={i} className="dice-face">
          {DIE_FACES[v] || v}
        </span>
      ))}
      <span className="dice-roll-sum">= {dice.reduce((a, b) => a + b, 0)}</span>
    </div>
  );
}
