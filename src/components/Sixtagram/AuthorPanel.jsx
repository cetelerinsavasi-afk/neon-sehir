import { X } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { useSixtagramProfile } from '../../hooks/useSixtagramProfile';
import './AuthorPanel.css';

// AuthorPanel — bir postun yazarının avatarına/adına tıklayınca açılan
// panel. Avatar/isim postun üzerinden (zaten elimizde, ekstra okuma
// gerekmiyor) gösterilir; toplam beğeni ise HERKESE AÇIK
// sixtagramProfiles/{uid} dokümanından canlı okunur.
export default function AuthorPanel({ uid, name, avatar, onClose }) {
  const { profile } = useSixtagramProfile(uid);

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
      </div>
    </div>
  );
}
