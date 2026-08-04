import { leaveOnNumaraTable } from '../../services/gameActions';
import { useFirestoreResume } from '../../hooks/useFirestoreResume';
import OnNumaraTable from './OnNumaraTable';
import './OnNumaraFullScreen.css';

export default function OnNumaraFullScreen({ tableId, myUid, onExit }) {
  // Yarış ekranındaki ile aynı sebep: ekrana girişte başta yaşanan lag'i
  // önlemek için Firestore ağını taze bir bağlantıya zorla.
  useFirestoreResume({ runOnMount: true });

  const handleClose = async () => {
    try {
      await leaveOnNumaraTable(tableId);
    } catch {
      // yine de çıkışa izin ver
    }
    onExit();
  };

  return (
    <div className="onnumara-fullscreen">
      <div className="onnumara-fullscreen-header">
        <span className="onnumara-fullscreen-title">🎴 10 Numara</span>
        <button className="onnumara-fullscreen-close" onClick={handleClose}>
          ✕
        </button>
      </div>
      <div className="onnumara-fullscreen-body">
        <OnNumaraTable tableId={tableId} myUid={myUid} onLeave={onExit} />
      </div>
    </div>
  );
}
