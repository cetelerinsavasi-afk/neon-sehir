import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useSixtagramNotifications } from '../../hooks/useSixtagramNotifications';
import { markAllSixtagramNotificationsRead } from '../../services/gameActions';
import './NotificationsPanel.css';

function timeAgo(createdAtMs) {
  if (!createdAtMs) return '';
  const diffMs = Date.now() - createdAtMs;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}

function notifText(n) {
  if (n.type === 'like') return `${n.fromName} gönderini beğendi.`;
  if (n.type === 'comment')
    return `${n.fromName} gönderine yorum yaptı: "${n.textPreview || ''}"`;
  if (n.type === 'reply') return `${n.fromName} yorumuna yanıt verdi: "${n.textPreview || ''}"`;
  return `${n.fromName} bir etkileşimde bulundu.`;
}

function notifEmoji(type) {
  if (type === 'like') return '❤️';
  if (type === 'comment') return '💬';
  if (type === 'reply') return '↩️';
  return '🔔';
}

export default function NotificationsPanel({ onClose, onOpenComments }) {
  const { notifications } = useSixtagramNotifications();

  useEffect(() => {
    markAllSixtagramNotificationsRead().catch((err) =>
      console.error('Bildirimler okundu işaretlenemedi:', err)
    );
  }, []);

  const handleClick = (n) => {
    if ((n.type === 'comment' || n.type === 'reply') && n.postId) {
      onOpenComments?.(n.postId);
      return;
    }
    // 'like' bildiriminde açılacak bir yorum paneli yok, sadece kapat.
    onClose();
  };

  return (
    <div className="six-notif-backdrop" onClick={onClose}>
      <div className="six-notif-panel" onClick={(e) => e.stopPropagation()}>
        <div className="six-notif-head">
          <p className="six-notif-title">Bildirimler</p>
          <button className="six-notif-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="six-notif-list">
          {notifications.length === 0 && (
            <p className="six-notif-hint">Henüz bir bildirimin yok.</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              className={`six-notif-row ${n.read ? '' : 'unread'}`}
              onClick={() => handleClick(n)}
            >
              <span className="six-notif-emoji">{notifEmoji(n.type)}</span>
              <div className="six-notif-body">
                <p className="six-notif-text">{notifText(n)}</p>
                <p className="six-notif-time">{timeAgo(n.createdAtMs)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
