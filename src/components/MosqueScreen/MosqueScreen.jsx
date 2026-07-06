import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useMosqueAttendance } from '../../hooks/useMosqueAttendance';
import { prayAtMosque } from '../../services/gameActions';
import './MosqueScreen.css';

const WINDOW_HOURS = {
  1: '00:00-12:00',
  2: '12:00-15:00',
  3: '15:00-18:00',
  4: '18:00-21:00',
  5: '21:00-24:00',
};

export default function MosqueScreen() {
  const { members, window: win } = useMosqueAttendance();

  return (
    <div className="mosque-screen">
      <SimpleActionScreen
        signInMessage="İbadet etmek için giriş yapmalısın."
        description={`Günde 5 vakit (${WINDOW_HOURS[win]} şu an ${win}. vakit) ibadet ederek her seferinde şüpheni 5 azaltabilirsin. Ücretsiz.`}
        buttonLabel="İbadet Et (Şüphe -5)"
        doneLabel="Bu vakitte zaten ibadet ettin"
        isDone={(actions) => Boolean(actions.prayedWindows?.[win])}
        actionFn={prayAtMosque}
      />

      {members.length > 0 && (
        <div className="mosque-congregation">
          <p className="mosque-congregation-title">
            {win}. Vakitteki Cemaat ({members.length})
          </p>
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
