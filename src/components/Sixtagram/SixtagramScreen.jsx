import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useSixtagramFeed } from '../../hooks/useSixtagramFeed';
import { useMySixtagramPosts } from '../../hooks/useMySixtagramPosts';
import { useMySixtagramLikedPostIds } from '../../hooks/useMySixtagramLikedPostIds';
import { useSixtagramProfile } from '../../hooks/useSixtagramProfile';
import { useSixtagramNotifications } from '../../hooks/useSixtagramNotifications';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PostCard from './PostCard';
import ComposeModal from './ComposeModal';
import NotificationsPanel from './NotificationsPanel';
import CommentsPanel from './CommentsPanel';
import './SixtagramScreen.css';

const TABS = [
  { id: 'home', label: 'Anasayfa' },
  { id: 'profile', label: 'Profil' },
];

export default function SixtagramScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [tab, setTab] = useState('home');
  const [composeOpen, setComposeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // Bir bildirimden (yorum/yanıt) tıklanınca, o postun yorum paneli
  // BURADA (SixtagramScreen seviyesinde) açılır — çünkü o post o an
  // Anasayfa/Profil listesinde görünür olmayabilir (feed'de aşağıda
  // kalmış, hatta hiç yüklenmemiş olabilir).
  const [openCommentsPostId, setOpenCommentsPostId] = useState(null);
  // Anasayfa sekmesine her giriş, akışı en güncel beğeni sırasına göre
  // baştan çeker (bkz. useSixtagramFeed'in üstündeki not — gezinirken
  // sıralamanın kendiliğinden zıplamasını istemediğimiz için canlı
  // dinleyici yerine bu "girişte yenile" deseni kullanılıyor).
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);

  const { posts: feedPosts, loading: feedLoading } = useSixtagramFeed(homeRefreshKey);
  const { posts: myPosts, loading: myPostsLoading } = useMySixtagramPosts();
  const likedIds = useMySixtagramLikedPostIds();
  const { profile: myProfile } = useSixtagramProfile(user?.uid);
  const { unreadCount: notifUnreadCount } = useSixtagramNotifications();

  const handleTabClick = (id) => {
    setTab(id);
    if (id === 'home') setHomeRefreshKey((k) => k + 1);
  };

  return (
    <div className="sixtagram">
      <div className="sixtagram-topbar">
        <div className="sixtagram-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`sixtagram-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => handleTabClick(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="sixtagram-topbar-actions">
          <button
            className="sixtagram-compose-btn"
            onClick={() => setComposeOpen(true)}
            disabled={!user}
            title={user ? 'Paylaşım yap' : 'Paylaşmak için giriş yap'}
          >
            ✏️ Paylaş
          </button>
          <button
            className="sixtagram-notif-btn"
            onClick={() => setNotifOpen(true)}
            disabled={!user}
            title="Bildirimler"
          >
            <Bell size={18} />
            {notifUnreadCount > 0 && (
              <span className="sixtagram-notif-badge">{notifUnreadCount}</span>
            )}
          </button>
        </div>
      </div>
      {tab === 'home' && (
        <div className="sixtagram-feed">
          {feedLoading && <p className="sixtagram-hint">Yükleniyor…</p>}
          {!feedLoading && feedPosts.length === 0 && (
            <p className="sixtagram-hint">Henüz hiç gönderi yok — ilk paylaşımı sen yap!</p>
          )}
          {feedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              liked={likedIds.has(post.id)}
              isOwn={post.uid === user?.uid}
            />
          ))}
        </div>
      )}

      {tab === 'profile' && (
        <div className="sixtagram-profile">
          <div className="sixtagram-profile-head">
            <div className="sixtagram-profile-avatar">
              <AvatarSvg avatar={player?.avatar} size={64} rounded />
            </div>
            <div>
              <p className="sixtagram-profile-name">{player?.displayName || 'Oyuncu'}</p>
              <p className="sixtagram-profile-likes">
                ❤️ {(myProfile?.totalLikes || 0).toLocaleString('tr-TR')} toplam beğeni
              </p>
            </div>
          </div>

          <div className="sixtagram-feed">
            {myPostsLoading && <p className="sixtagram-hint">Yükleniyor…</p>}
            {!myPostsLoading && myPosts.length === 0 && (
              <p className="sixtagram-hint">Henüz bir gönderin yok.</p>
            )}
            {myPosts.map((post) => (
              <PostCard key={post.id} post={post} liked={likedIds.has(post.id)} isOwn />
            ))}
          </div>
        </div>
      )}

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onPosted={() => {
            setTab('home');
            setHomeRefreshKey((k) => k + 1);
          }}
        />
      )}

      {notifOpen && (
        <NotificationsPanel
          onClose={() => setNotifOpen(false)}
          onOpenComments={(postId) => {
            setOpenCommentsPostId(postId);
            setNotifOpen(false);
          }}
        />
      )}

      {openCommentsPostId && (
        <CommentsPanel
          postId={openCommentsPostId}
          onClose={() => setOpenCommentsPostId(null)}
        />
      )}
    </div>
  );
}
