import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import { prayAtMosque } from '../../services/gameActions';

export default function MosqueScreen() {
  return (
    <SimpleActionScreen
      signInMessage="Dua etmek için giriş yapmalısın."
      description="Günde bir kez dua ederek şüphe puanını azaltabilirsin. Ücretsiz."
      buttonLabel="Dua Et (Şüphe -5)"
      doneLabel="Bugün zaten dua ettin"
      dailyFlagKey="prayed"
      actionFn={prayAtMosque}
    />
  );
}
