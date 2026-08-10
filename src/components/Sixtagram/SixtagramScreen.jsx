import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useSixtagramFeed } from '../../hooks/useSixtagramFeed';
import { useMySixtagramPosts } from '../../hooks/useMySixtagramPosts';
import { useMySixtagramLikedPostIds } from '../../hooks/useMySixtagramLikedPostIds';
import { useSixtagramProfile } from '../../hooks/useSixtagramProfile';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PostCard from './PostCard';
import ComposeModal from './ComposeModal';
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
  // Anasayfa sekmesine her giriş, akışı en güncel beğeni sırasına göre
  // baştan çeker (bkz. useSixtagramFeed'in üstündeki not — gezinirken
  // sıralamanın kendiliğinden zıplamasını istemediğimiz için canlı
  // dinleyici yerine bu "girişte yenile" deseni kullanılıyor).
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);

  const { posts: feedPosts, loading: feedLoading } = useSixtagramFeed(homeRefreshKey);
  const { posts: myPosts, loading: myPostsLoading } = useMySixtagramPosts();
  const likedIds = useMySixtagramLikedPostIds();
  const { profile: myProfile } = useSixtagramProfile(user?.uid);

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
        <button
          className="sixtagram-compose-btn"
          onClick={() => setComposeOpen(true)}
          disabled={!user}
          title={user ? 'Paylaşım yap' : 'Paylaşmak için giriş yap'}
        >
          ✏️ Paylaş
        </button>
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
    </div>
  );
}
