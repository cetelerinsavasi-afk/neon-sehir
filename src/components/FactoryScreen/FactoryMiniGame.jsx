import { useState } from 'react';
import FactoryShiftGame from './FactoryShiftGame';
import HookGoldGame from './HookGoldGame';
import TempoSyncGame from './TempoSyncGame';

// FactoryMiniGame — yeni istek: "fabrikada üretim yapıldığında şu anda tek
// bir mini oyun (koli yakalama) çıkıyor, bunu 3 farklı mini oyun arasından
// rastgele seçilecek şekilde genişlet." FactoryScreen.jsx'teki HER İKİ
// çağrı yeri (WorkerView + OwnerView) artık doğrudan FactoryShiftGame yerine
// bu bileşeni kullanıyor. Üçü de AYNI dış arayüzü (`onComplete`/`onClose`
// prop'ları, submitting/success/error faz akışı) paylaştığı için burada
// sadece rastgele biri seçilip aynı prop'larla render ediliyor — hangi
// oyunun açıldığı, bileşen ilk monte olduğunda BİR KEZ belirlenir (modal her
// açılışta yeniden monte olduğu için bu, her üretim denemesinde yeni bir
// rastgele seçim anlamına gelir).
// KULLANICI REVİZESİ: "kanca ile altın kapmaca oyununun denk gelme şansını
// 2 katına çıkaralım. yani oyuncular yüzde 50 ihtimalle bu mini oyunu
// yüzde 25 ihtimalle diğer 2 oyunu oynasınlar" — artık eşit 1/3 yerine
// AĞIRLIKLI bir seçim var: HookGoldGame ağırlığı 2, diğer ikisi 1'er
// (toplam 4 birim) → Hook %50, FactoryShiftGame %25, TempoSyncGame %25.
const WEIGHTED_MINI_GAMES = [
  { Component: FactoryShiftGame, weight: 1 },
  { Component: HookGoldGame, weight: 2 },
  { Component: TempoSyncGame, weight: 1 },
];
const TOTAL_MINI_GAME_WEIGHT = WEIGHTED_MINI_GAMES.reduce((sum, g) => sum + g.weight, 0);

function pickWeightedMiniGame() {
  let roll = Math.random() * TOTAL_MINI_GAME_WEIGHT;
  for (const { Component, weight } of WEIGHTED_MINI_GAMES) {
    if (roll < weight) return Component;
    roll -= weight;
  }
  // Kayan nokta yuvarlaması yüzünden roll tam sınırda kalırsa (nadir),
  // son oyunu döndür — asla undefined dönme.
  return WEIGHTED_MINI_GAMES[WEIGHTED_MINI_GAMES.length - 1].Component;
}

export default function FactoryMiniGame({ onComplete, onClose }) {
  const [GameComponent] = useState(() => pickWeightedMiniGame());
  return <GameComponent onComplete={onComplete} onClose={onClose} />;
}
