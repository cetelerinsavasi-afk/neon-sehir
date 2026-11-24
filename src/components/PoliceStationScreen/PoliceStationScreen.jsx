import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import PoliceApplicationSection from '../PoliceApplicationSection/PoliceApplicationSection';
import { bribePolice } from '../../services/gameActions';
import { useTaskPass } from '../../hooks/useTaskPass'; // v168.1
import '../RolePanels/RolePanels.css'; // v197: yeni tasarım

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
  const taskPass = useTaskPass(); // v168.1: rüşvet görevinde tek seferlik hak
  return (
    <div className="role-panel">
      {showBribe && (
        <SimpleActionScreen
          icon="🤝"
          title="Memura rüşvet"
          tone="gold"
          showStats
          chips={[{ label: '−3.000 altın', tone: 'gold' }, { label: 'Şüphe −20', tone: 'good' }, { label: 'Günde 1 kez', tone: 'info' }]}
          signInMessage="Rüşvet vermek için giriş yapmalısın."
          description="Masanın altından uzat, memur görmezden gelsin. Verdiğin rüşvet o günün polis maaş havuzuna eklenir."
          buttonLabel="🤝 Rüşvet Ver"
          doneLabel="Bugün zaten rüşvet verdin"
          isDone={(a) => Boolean(a.bribed) && !taskPass.rusvet}
          goldCost={3000}
          actionFn={bribePolice}
        />
      )}
      {showApplication && <PoliceApplicationSection />}
    </div>
  );
}
