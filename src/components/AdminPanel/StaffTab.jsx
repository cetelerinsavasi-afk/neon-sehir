import { useEffect, useState } from 'react';
import { adminAction } from '../../services/gameActions';
import { ROLE_LABELS, errText } from './adminLabels';

// Ekip (yalnızca yönetici) — tüm yetkililer. Rol vermek/almak için oyuncu
// kartındaki "🎖️ Rol" düğmesi kullanılır.
export default function StaffTab({ me, onOpenUser }) {
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminAction('listStaff')
      .then((r) => setStaff(r.staff))
      .catch((err) => setError(errText(err)));
  }, []);

  return (
    <div className="adm-stack">
      <p className="adm-dim">Yeni moderatör eklemek için Oyuncular sekmesinden oyuncuyu bul → 🎖️ Rol.</p>
      {error && <p className="adm-error">{error}</p>}
      {staff?.map((s) => (
        <button key={s.uid} className="adm-user-row" onClick={() => onOpenUser(s.uid)}>
          <span className="adm-user-name">
            {s.name}
            <span className={`adm-role adm-role-${s.role}`}>{ROLE_LABELS[s.role]}</span>
            {s.bootstrapAdmin && <span className="adm-tag">kurucu</span>}
            {s.uid === me.uid && <span className="adm-tag">sen</span>}
          </span>
          <span className="adm-uid">{s.uid}</span>
        </button>
      ))}
    </div>
  );
}
