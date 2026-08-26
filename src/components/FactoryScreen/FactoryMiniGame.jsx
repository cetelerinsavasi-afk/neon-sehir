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
const MINI_GAMES = [FactoryShiftGame, HookGoldGame, TempoSyncGame];

export default function FactoryMiniGame({ onComplete, onClose }) {
  const [GameComponent] = useState(() => MINI_GAMES[Math.floor(Math.random() * MINI_GAMES.length)]);
  return <GameComponent onComplete={onComplete} onClose={onClose} />;
}
