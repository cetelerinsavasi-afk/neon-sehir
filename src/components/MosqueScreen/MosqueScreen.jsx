import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import { prayAtMosque } from '../../services/gameActions';

export default function MosqueScreen() {
  return (
    <SimpleActionScreen
      signInMessage="İbadet etmek için giriş yapmalısın."
      description="Günde bir kez ibadet ederek şüphe puanını azaltabilirsin. Ücretsiz."
      buttonLabel="İbadet Et (Şüphe -5)"
      doneLabel="Bugün zaten ibadet ettin"
      dailyFlagKey="prayed"
      actionFn={prayAtMosque}
    />
  );
}
