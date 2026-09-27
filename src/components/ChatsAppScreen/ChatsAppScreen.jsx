import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { useGlobalChat } from '../../hooks/useGlobalChat';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import { OPEN_DM_EVENT, takePendingDm } from '../../lib/chatsappNav';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import GroupChat from './GroupChat';
import DmChat from './DmChat';
import { FriendsView, RequestsView } from './SocialViews';
import { listTimeOf, tsMs } from './chatsappTime';
import './ChatsAppScreen.css';

// v60 — ChatsApp artık WhatsApp benzeri: üstte Arkadaşlar / İstekler,
// altta sohbet listesi. "Neon Şehir" (tüm oyuncuların grubu = eski genel
// sohbet) sabit en üstte; arkadaş sohbetleri son mesaja göre sıralı.
export default function ChatsAppScreen() {
  const { user } = useAuth();
  const { chats, friends, requestCount } = useSocial();
  const { messages } = useGlobalChat();
  const { chatsAppHasNew } = useUnreadNotifications();
  const { isBlocked } = useBlocks();
  const [view, setView] = useState(() => {
    const p = takePendingDm();
    return p ? { name: 'dm', target: p } : { name: 'list' };
  });

  // Oyuncu Kartı → "💬 Mesaj" (ChatsApp açıkken de çalışsın)
  useEffect(() => {
    const on = () => {
      const p = takePendingDm();
      if (p) setView({ name: 'dm', target: p });
    };
    window.addEventListener(OPEN_DM_EVENT, on);
    return () => window.removeEventListener(OPEN_DM_EVENT, on);
  }, []);

  if (!user) {
    return <SignInPrompt message="Sohbete katılmak için giriş yapmalısın." />;
  }

  const back = () => setView({ name: 'list' });
  if (view.name === 'group') return <GroupChat onBack={back} />;
  if (view.name === 'dm') return <DmChat key={view.target.uid} target={view.target} onBack={back} />;
  if (view.name === 'friends') return <FriendsView onBack={back} onOpenChat={(f) => setView({ name: 'dm', target: f })} />;
  if (view.name === 'requests') return <RequestsView onBack={back} />;

  const visible = messages.filter((m) => !isHiddenForMe(m, m.uid, isBlocked));
  const lastGroup = visible[visible.length - 1];
  const groupPreview = lastGroup ? `${lastGroup.uid === user.uid ? 'Sen' : lastGroup.displayName || 'Oyuncu'}: ${lastGroup.text}` : 'Tüm oyuncuların sohbeti';

  return (
    <div className="chatsapp-screen">
      <div className="ca-top-buttons">
        <button className="ca-top-btn" onClick={() => setView({ name: 'friends' })}>
          👥 Arkadaşlar ({friends.length})
        </button>
        <button className={`ca-top-btn${requestCount > 0 ? ' hot' : ''}`} onClick={() => setView({ name: 'requests' })}>
          📨 Arkadaşlık istekleri ({requestCount})
        </button>
      </div>
      <div className="ca-list">
        <button className="ca-row" onClick={() => setView({ name: 'group' })}>
          <span className="ca-row-avatar ca-group-avatar" aria-hidden="true">
            🌆
          </span>
          <span className="ca-row-main">
            <span className="ca-row-top">
              <span className="ca-row-name">📌 Neon Şehir</span>
              <span className={`ca-row-time${chatsAppHasNew ? ' new' : ''}`}>{lastGroup ? listTimeOf(tsMs(lastGroup.createdAt)) : ''}</span>
            </span>
            <span className="ca-row-bottom">
              <span className="ca-row-last">{groupPreview}</span>
              {chatsAppHasNew && <span className="ca-dot" aria-label="yeni mesaj" />}
            </span>
          </span>
        </button>
        {chats.map((c) => (
          <button key={c.id} className="ca-row" onClick={() => setView({ name: 'dm', target: { uid: c.otherUid, name: c.otherName, avatar: c.otherAvatar } })}>
            <span className="ca-row-avatar">
              <AvatarSvg avatar={c.otherAvatar} size={44} rounded />
            </span>
            <span className="ca-row-main">
              <span className="ca-row-top">
                <span className="ca-row-name">{c.otherName}</span>
                <span className={`ca-row-time${c.myUnread ? ' new' : ''}`}>{listTimeOf(c.lastAtMs)}</span>
              </span>
              <span className="ca-row-bottom">
                <span className="ca-row-last">
                  {c.lastSenderUid === user.uid ? 'Sen: ' : ''}
                  {c.lastText}
                </span>
                {c.myUnread > 0 && <span className="ca-badge">{c.myUnread > 99 ? '99+' : c.myUnread}</span>}
              </span>
            </span>
          </button>
        ))}
        {chats.length === 0 && (
          <p className="ca-empty">
            {friends.length ? 'Arkadaşlarınla sohbet başlatmak için 👥 Arkadaşlar’a dokun.' : 'Oyuncuların adına dokunup ➕ Arkadaş ekle diyerek arkadaş edinebilirsin.'}
          </p>
        )}
      </div>
    </div>
  );
}
