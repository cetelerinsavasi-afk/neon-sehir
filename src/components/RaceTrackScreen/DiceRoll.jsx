import { useEffect, useState } from 'react';

// Zar atıldığında kısa bir "sallanma" animasyonu gösterip son sonuçlarda
// karar kılan basit bir görsel bileşen.
export default function DiceRoll({ rollKey, sum, count }) {
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (rollKey === undefined || rollKey === null) return;
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 500);
    return () => clearTimeout(t);
  }, [rollKey]);

  if (sum === null || sum === undefined) return null;

  return (
    <div className={`dice-roll${rolling ? ' rolling' : ''}`}>
      <span className="dice-roll-icon">🎲</span>
      <span className="dice-roll-text">
        {count} zar → toplam {sum}
      </span>
    </div>
  );
}
