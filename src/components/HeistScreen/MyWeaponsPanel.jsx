import { useState } from 'react';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { upgradeWeapon } from '../../services/gameActions';

// Silah geliştirme işlemleri artık Silah Mağazası'nda değil, burada
// (Soygun ekranı > Silahlarım) yapılıyor.
export default function MyWeaponsPanel() {
  const { weapons } = useWeapons();
  const { inventory } = useInventory();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const materialQty = inventory.silahUpgrade || 0;

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  if (weapons.length === 0) {
    return <p className="heist-hint">Henüz bir silahın yok — Silah Mağazası'ndan satın alabilirsin.</p>;
  }

  return (
    <div className="heist-weapons-list">
      <p className="heist-hint">Gelişim malzemesi: {materialQty} adet</p>
      {weapons.map((w) => {
        const requiredQty = Math.round(w.basePrice / 100);
        return (
          <div key={w.id} className="heist-weapon-card">
            <div className="heist-weapon-info">
              <span className="heist-weapon-name">
                {w.name} <span className="heist-weapon-level">Sv. {w.level}</span>
              </span>
              <span className="heist-weapon-power">Güç: {w.power.toLocaleString('tr-TR')}</span>
            </div>
            <button
              className="heist-weapon-btn"
              disabled={w.level >= 3 || materialQty < requiredQty || busy === w.id}
              onClick={() => run(w.id, () => upgradeWeapon(w.id))}
            >
              {w.level >= 3 ? 'Maks. Seviye' : `Geliştir (${requiredQty} malzeme)`}
            </button>
          </div>
        );
      })}
      {error && <p className="heist-panel-error">{error}</p>}
    </div>
  );
}
