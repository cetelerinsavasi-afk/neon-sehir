import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useMosqueAttendance } from '../../hooks/useMosqueAttendance';
import { prayAtMosque } from '../../services/gameActions';
import './MosqueScreen.css';

export default function MosqueScreen() {
  const { members } = useMosqueAttendance();

  return (
    <div className="mosque-screen">
      <SimpleActionScreen
        signInMessage="İbadet etmek için giriş yapmalısın."
        description="Günde bir kez ibadet ederek şüphe puanını azaltabilirsin. Ücretsiz."
        buttonLabel="İbadet Et (Şüphe -10)"
        doneLabel="Bugün ibadet ettin"
        dailyFlagKey="prayed"
        actionFn={prayAtMosque}
      />

      {members.length > 0 && (
        <div className="mosque-congregation">
          <p className="mosque-congregation-title">Bugünkü Cemaat ({members.length})</p>
          <div className="mosque-congregation-list">
            {members.map((m) => (
              <div key={m.id} className="mosque-member">
                <AvatarSvg avatar={m.avatar} size={30} rounded />
                <span>{m.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
