import { useEffect, useState } from 'react';

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// Zar atıldığında kısa bir "sallanma" animasyonu + atılan HER zarın kendi
// sonucunu ayrı ayrı gösteren görsel bileşen.
//
// forcePending: kullanıcı revizesi — "ekran donuyor, tıkladığım an bir
// şey olduğunu görmüyorum" şikayeti üzerine eklendi. Sunucudan cevap
// gelmesini (ki cold start yüzünden birkaç saniye sürebiliyor) BEKLEMEDEN,
// butona basılır basılmaz true yapılıp gösterilir — zar SÜREKLİ sallanır
// gibi görünür, tıklamanın kayda geçtiği anında belli olur. Gerçek sonuç
// (rollKey/dice) gelince normal akışa döner.
export default function DiceRoll({ rollKey, dice, forcePending = false }) {
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (rollKey === undefined || rollKey === null) return;
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 500);
    return () => clearTimeout(t);
  }, [rollKey]);

  if (forcePending) {
    return (
      <div className="dice-roll rolling dice-roll-pending">
        <span className="dice-face">🎲</span>
        <span className="dice-roll-sum">atılıyor…</span>
      </div>
    );
  }

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
