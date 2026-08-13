import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import PoliceApplicationSection from '../PoliceApplicationSection/PoliceApplicationSection';
import { bribePolice } from '../../services/gameActions';

// mode — KarakolWorldScreen (girilebilir karakol) artık girişteki polis
// memuru NPC'si için SADECE rüşvet bölümünü, içerideki komiser NPC'si için
// SADECE başvuru bölümünü açıyor (bkz. madde 5). Eski düz "RegionModal"
// giriş noktası (artık App.jsx'te bypass edildiği için pratikte
// kullanılmıyor ama zararsız/geriye dönük uyumlu bırakıldı) hâlâ mode
// verilmeden 'full' ile ikisini birden gösteriyor — tek kaynak, kod
// tekrarı yok.
export default function PoliceStationScreen({ mode = 'full' }) {
  const showBribe = mode === 'full' || mode === 'bribe';
  const showApplication = mode === 'full' || mode === 'application';
  return (
    <div>
      {showBribe && (
        <SimpleActionScreen
          signInMessage="Rüşvet vermek için giriş yapmalısın."
          description="Günde bir kez, 3000 altın karşılığında şüphe puanını azaltabilirsin. Verdiğin rüşvet, o günün polis maaş havuzuna eklenir."
          buttonLabel="Rüşvet Ver (3000 altın, Şüphe -20)"
          doneLabel="Bugün zaten rüşvet verdin"
          dailyFlagKey="bribed"
          goldCost={3000}
          actionFn={bribePolice}
        />
      )}
      {showApplication && <PoliceApplicationSection />}
    </div>
  );
}
