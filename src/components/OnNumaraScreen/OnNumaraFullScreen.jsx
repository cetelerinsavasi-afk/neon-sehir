import { leaveOnNumaraTable } from '../../services/gameActions';
import OnNumaraTable from './OnNumaraTable';
import './OnNumaraFullScreen.css';

export default function OnNumaraFullScreen({ tableId, myUid, onExit }) {
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
