import { leaveOnNumaraTable } from '../../services/gameActions';
import { useFirestoreResume } from '../../hooks/useFirestoreResume';
import { useEffect } from 'react';
import OnNumaraTable from './OnNumaraTable';
import { streamBroadcast, publishCardsFrame, clearGameFrame } from '../Stream/streamShared';
import './OnNumaraFullScreen.css';

export default function OnNumaraFullScreen({ tableId, myUid, onExit }) {
  // Yarış ekranındaki ile aynı sebep: ekrana girişte başta yaşanan lag'i
  // önlemek için Firestore ağını taze bir bağlantıya zorla.
  useFirestoreResume({ runOnMount: true });

  // v82.2: yayındaysam izleyiciler bu masayı canlı izler
  useEffect(() => {
    if (!streamBroadcast.uid || !tableId) return undefined;
    publishCardsFrame(tableId);
    const iv = setInterval(() => publishCardsFrame(tableId), 1000);
    return () => {
      clearInterval(iv);
      if (streamBroadcast.uid) clearGameFrame();
    };
  }, [tableId]);

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
