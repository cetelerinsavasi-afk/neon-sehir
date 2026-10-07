import { useWeapons } from '../../hooks/useWeapons';
import { LifeBar, UpgradeCells } from '../VehicleCard/VehicleCard';

// v77: silah geliştirme artık Silahçı Atölyesi'nde (oyunun Silah Mağazası ya
// da oyuncuların silahçı dükkânları). Burada sadece güç, ömür ve "geliştirilebilir
// mi" (Sv.2 / Sv.3 hücreleri) görünür.
export default function MyWeaponsPanel() {
  const { weapons: allWeapons } = useWeapons();
  // 2. el / vitrin (listed: true) silah fiilen kullanılamaz — gösterilmez
  const weapons = allWeapons.filter((w) => !w.listed);

  if (weapons.length === 0) {
    return <p className="heist-hint">Henüz bir silahın yok — Silah Mağazası'ndan satın alabilirsin.</p>;
  }

  return (
    <div className="heist-weapons-list">
      {weapons.map((w) => {
        const lv = w.level || 1;
        return (
          <div key={w.id} className="heist-weapon-card">
            <div className="heist-weapon-info">
              <span className="heist-weapon-name">
                {w.name} <span className="heist-weapon-level">Sv. {lv}</span>
              </span>
              <span className="heist-weapon-power">Güç: {w.power.toLocaleString('tr-TR')}</span>
              <LifeBar item={w} kind="weapon" />
              <UpgradeCells slots={[lv >= 2, lv >= 3]} kind="weapon" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
