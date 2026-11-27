import { useState } from 'react';
import { useBlocks } from '../../contexts/BlocksContext';
import { unblockUser } from '../../services/gameActions';
import './BlockedPlayersList.css';

// BlockedPlayersList — Profil (Ev) ekranında "Engellenen oyuncular" bölümü.
// Liste boşsa da bölüm görünür (engellemenin nereden kaldırılacağı bilinsin).
export default function BlockedPlayersList() {
  const { list } = useBlocks();
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false); // v219: açılır-kapanır, başta kapalı

  const handleUnblock = async (uid) => {
    setBusyUid(uid);
    setError('');
    try {
      await unblockUser(uid);
    } catch (err) {
      setError(err?.message || 'Engel kaldırılamadı, tekrar dene.');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className={`home-section home-fold blocked-list${open ? ' open' : ''}`}>
      <button type="button" className={`home-fold-head${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="home-fold-icon">🚫</span>
        <span className="home-fold-title">Engellenen oyuncular</span>
        <span className="home-fold-count">{list.length}</span>
        <span className="home-fold-chev">▾</span>
      </button>
      {!open ? null : list.length === 0 ? (
        <p className="home-hint">Kimseyi engellemedin. Bir oyuncuyu, mesajının ya da paylaşımının yanındaki ⋯ menüsünden engelleyebilirsin.</p>
      ) : (
        <ul className="blocked-ul">
          {list.map((b) => (
            <li key={b.uid} className="blocked-row">
              <span className="blocked-name">🚫 {b.name}</span>
              <button className="blocked-unblock" disabled={busyUid === b.uid} onClick={() => handleUnblock(b.uid)}>
                {busyUid === b.uid ? '…' : 'Engeli kaldır'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="home-error">{error}</p>}
    </div>
  );
}
