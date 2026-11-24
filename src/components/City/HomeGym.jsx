// v199 — evde spor aletinde üyeliksiz serbest çalışma (eski ev ekranındaki "💪 Serbest çalış").
// Sunucuya gitmez, güç kazandırmaz (GymMiniGame free).
import GymMiniGame from '../Gym/GymMiniGame';
import '../Workshop/Workshop.css';

export default function HomeGym({ equipment, onDone, onClose }) {
  return (
    <div className="wk-sheet-bg" onClick={onClose}>
      <div className="wk-sheet" onClick={(e) => e.stopPropagation()}>
        <GymMiniGame equipment={equipment} free onDone={onDone} onClose={onClose} />
      </div>
    </div>
  );
}
