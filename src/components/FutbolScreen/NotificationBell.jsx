import { useState } from 'react';
import { useFutbolTeamNotifications } from '../../hooks/useFutbolTeamNotifications';
import { markFutbolTeamNotificationsRead } from '../../services/gameActions';
import './NotificationBell.css';

// NotificationBell — Bölüm 16: takım-bazlı bildirim çanı. `unread`
// (team.notifUnread) rozeti göstermek için; panel açılınca tüm bildirimler
// tek seferde okunmuş işaretlenir (normal SMS'in tek tek okunma
// davranışından FARKLI — bkz. markFutbolTeamNotificationsRead).
export default function NotificationBell({ teamId, unread }) {
  const [open, setOpen] = useState(false);
  const { notifications, loading } = useFutbolTeamNotifications(teamId, open);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      try {
        await markFutbolTeamNotificationsRead(teamId);
      } catch (err) {
        // sessizce yut — rozet bir sonraki açılışta yine denenir
      }
    }
  };

  return (
    <div className="futbol-notif-bell-wrap">
      <button className="futbol-notif-bell-btn" onClick={handleToggle}>
        🔔{unread && <span className="futbol-notif-bell-dot" />}
      </button>
      {open && (
        <div className="futbol-notif-bell-panel">
          <p className="futbol-notif-bell-title">Bildirimler</p>
          {loading && <p className="futbol-placeholder">Yükleniyor...</p>}
          {!loading && notifications.length === 0 && (
            <p className="futbol-placeholder">Henüz bir bildirim yok.</p>
          )}
          {!loading &&
            notifications.map((n) => (
              <div key={n.id} className="futbol-notif-bell-row">
                {n.text}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
