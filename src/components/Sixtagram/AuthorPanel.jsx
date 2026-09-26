import { useState } from 'react';
import { X } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlocksContext';
import { useSixtagramProfile } from '../../hooks/useSixtagramProfile';
import './AuthorPanel.css';

// AuthorPanel — bir postun yazarının avatarına/adına tıklayınca açılan
// panel. Avatar/isim postun üzerinden (zaten elimizde, ekstra okuma
// gerekmiyor) gösterilir; toplam beğeni ise HERKESE AÇIK
// sixtagramProfiles/{uid} dokümanından canlı okunur.
export default function AuthorPanel({ uid, name, avatar, onClose }) {
  const { profile } = useSixtagramProfile(uid);
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [reportOpen, setReportOpen] = useState(false);
  const isSelf = user?.uid === uid;

  return (
    <div className="author-panel-backdrop" onClick={onClose}>
      <div className="author-panel" onClick={(e) => e.stopPropagation()}>
        <button className="author-panel-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="author-panel-avatar">
          <AvatarSvg avatar={avatar} />
        </div>
        <p className="author-panel-name">{name}</p>
        <p className="author-panel-likes">
          ❤️ {(profile?.totalLikes || 0).toLocaleString('tr-TR')} toplam beğeni
        </p>
        {!isSelf && user && (
          <button className="author-panel-report" onClick={() => setReportOpen(true)}>
            {isBlocked(uid) ? '🚫 Engelli · seçenekler' : '🚩 Şikâyet et / Engelle'}
          </button>
        )}
      </div>
      {reportOpen && (
        <ReportBlockSheet
          targetUid={uid}
          targetName={name || 'Oyuncu'}
          items={[{ label: 'Oyuncuyu / adını şikâyet et', targetType: 'user', targetPath: `users/${uid}` }]}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
