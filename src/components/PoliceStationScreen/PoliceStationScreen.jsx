import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import PoliceApplicationSection from '../PoliceApplicationSection/PoliceApplicationSection';
import { bribePolice } from '../../services/gameActions';

export default function PoliceStationScreen() {
  return (
    <div>
      <SimpleActionScreen
        signInMessage="Rüşvet vermek için giriş yapmalısın."
        description="Günde bir kez, 3000 altın karşılığında şüphe puanını azaltabilirsin."
        buttonLabel="Rüşvet Ver (3000 altın, Şüphe -10)"
        doneLabel="Bugün zaten rüşvet verdin"
        dailyFlagKey="bribed"
        goldCost={3000}
        actionFn={bribePolice}
      />
      <PoliceApplicationSection />
    </div>
  );
}
