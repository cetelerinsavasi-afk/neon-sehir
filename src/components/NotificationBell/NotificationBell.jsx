import { useState } from 'react';
import { useFutbolTeamNotifications } from '../../hooks/useFutbolTeamNotifications';
import { useFactoryNotifications } from '../../hooks/useFactoryNotifications';
import { markFutbolTeamNotificationsRead, markFactoryNotificationsRead } from '../../services/gameActions';
import './NotificationBell.css';

// NotificationBell — Bölüm 16 (Bildirimler): paylaşımlı çan bileşeni,
// hem futbol takımı (futbolTeams/{id}/notifications) hem fabrika
// (factories/{id}/notifications) bildirim panelleri için kullanılır.
// `kind` hangi bildirim kaynağının dinleneceğini seçer — panel açılınca
// tüm bildirimler tek seferde okunmuş işaretlenir (normal SMS'in tek tek
// okunma davranışından FARKLI).
export default function NotificationBell({ kind = 'team', id, unread }) {
  const [open, setOpen] = useState(false);

  // Hook sayısı render'lar arasında SABİT kalmalı (React kuralı) — bu
  // yüzden `kind` fark etmeksizin HER İKİ hook da her zaman çağrılır,
  // sadece ilgili olanın `active` bayrağı açılır; kullanılmayan hook
  // `id`/`active` false olduğu için hiç sorgu kurmaz (bkz. hook'ların
  // kendi içindeki erken-çıkış).
  const teamResult = useFutbolTeamNotifications(kind === 'team' ? id : null, open && kind === 'team');
  const factoryResult = useFactoryNotifications(kind === 'factory' ? id : null, open && kind === 'factory');
  const { notifications, loading } = kind === 'factory' ? factoryResult : teamResult;

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      try {
        if (kind === 'factory') {
          await markFactoryNotificationsRead();
        } else {
          await markFutbolTeamNotificationsRead(id);
        }
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
          {loading && <p className="futbol-notif-bell-empty">Yükleniyor...</p>}
          {!loading && notifications.length === 0 && (
            <p className="futbol-notif-bell-empty">Henüz bir bildirim yok.</p>
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
