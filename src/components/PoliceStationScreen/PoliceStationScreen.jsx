import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import PoliceApplicationSection from '../PoliceApplicationSection/PoliceApplicationSection';
import { bribePolice } from '../../services/gameActions';

export default function PoliceStationScreen() {
  return (
    <div>
      <SimpleActionScreen
        signInMessage="Rüşvet vermek için giriş yapmalısın."
        description="Günde bir kez, 4000 altın karşılığında şüphe puanını azaltabilirsin."
        buttonLabel="Rüşvet Ver (4000 altın, Şüphe -20)"
        doneLabel="Bugün zaten rüşvet verdin"
        dailyFlagKey="bribed"
        goldCost={4000}
        actionFn={bribePolice}
      />
      <PoliceApplicationSection />
    </div>
  );
}
