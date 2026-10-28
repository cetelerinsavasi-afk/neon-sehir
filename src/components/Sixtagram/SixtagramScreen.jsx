import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { invalidateSixtagramFeed, useSixtagramFeed } from '../../hooks/useSixtagramFeed';
import { useMySixtagramPosts } from '../../hooks/useMySixtagramPosts';
import { useSixtagramProfile } from '../../hooks/useSixtagramProfile';
import { useSixtagramNotifications } from '../../hooks/useSixtagramNotifications';
import { useSixtagramSocial, useStorySeenTick } from '../../hooks/useSixtagramSocial';
import PostCard from './PostCard';
import { useBlocks } from '../../contexts/BlocksContext';
import { isHiddenForMe } from '../../lib/ugcVisibility';
import ComposeModal from './ComposeModal';
import NotificationsPanel from './NotificationsPanel';
import PostDetailPanel from './PostDetailPanel';
import { StoryRow, StoryViewer, buildStoryGroups, isStoryPost } from './SixStories';
import { MyProfile, UserProfileSheet } from './SixProfile';
import { SixNavContext } from './sixNav';
import { IgIcon } from './igIcons';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { ensureOverlayFonts } from '../../../functions/photoOverlay.js';
import { PullSpinner, usePullRefresh } from './usePullRefresh';
import './SixtagramScreen.css';

// =============================================================================
// v135 — Sixtagram (Instagram gibi): alt sekmeler Anasayfa · Medya · Paylaş · Takip · Profil
//   • Anasayfa: üstte hikâyeler (mekânda çekilen fotoğraflar), altta yazılar ve
//     "Görsel ekle" paylaşımları (borç, para, şüphe…). Şarkı/röportaj/resim Medya'da.
//   • Takip: sadece takip ettiklerinin hikâyeleri ve gönderileri (medya hariç).
//   • Tek akış isteği (son 150 gönderi, 90 sn önbellek) — sekmeler aynı listeyi süzer.
// =============================================================================
const MEDIA_TYPES = { song: 'Şarkılar', interview: 'Röportajlar', drawing: 'Resimler' };
const isMediaPost = (p) => Boolean(p?.attachment && MEDIA_TYPES[p.attachment.type]);
const TABS = [
  { id: 'home', label: 'Anasayfa', icon: 'home' },
  { id: 'media', label: 'Medya', icon: 'reels' },
  { id: 'share', label: 'Paylaş', icon: 'plus' },
  { id: 'follow', label: 'Takip', icon: 'users' },
  { id: 'profile', label: 'Profil', icon: null },
];
const MEDIA_ORDER = Object.keys(MEDIA_TYPES);
// v136 — Medya'da yeni içerik işareti: her kategoriye en son ne zaman bakıldığı (cihazda)
const MEDIA_SEEN_KEY = 'sixMediaSeen_v1';
function loadMediaSeen() {
  try {
    return JSON.parse(localStorage.getItem(MEDIA_SEEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export default function SixtagramScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const myUid = user?.uid || null;
  const [tab, setTab] = useState('home');
  const [media, setMedia] = useState('song');
  const [composeOpen, setComposeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [openPost, setOpenPost] = useState(null);
  const [viewer, setViewer] = useState(null); // { groups, start, startPi }
  const [profile, setProfile] = useState(null); // { uid, name, avatar }
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);

  const { posts: allFeedPosts, loading: feedLoading } = useSixtagramFeed(homeRefreshKey);
  const { isBlocked } = useBlocks();
  const feedPosts = useMemo(() => allFeedPosts.filter((p) => !isHiddenForMe(p, p.uid, isBlocked)), [allFeedPosts, isBlocked]);
  const { posts: myPosts } = useMySixtagramPosts();
  const { likedIds, following } = useSixtagramSocial();
  const { profile: myProfile } = useSixtagramProfile(myUid);
  const { unreadCount } = useSixtagramNotifications({ unreadOnly: true });
  const seenTick = useStorySeenTick();

  // kendi hikâyelerin akışta henüz yoksa (yeni paylaşıldı) kendi listenden eklenir
  const allPosts = useMemo(() => {
    const ids = new Set(feedPosts.map((p) => p.id));
    return [...feedPosts, ...myPosts.filter((p) => !ids.has(p.id))];
  }, [feedPosts, myPosts]);
  const followSet = useMemo(() => new Set(Object.keys(following)), [following]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const homeStories = useMemo(() => buildStoryGroups(allPosts, myUid), [allPosts, myUid, seenTick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const followStories = useMemo(() => buildStoryGroups(allPosts, myUid, followSet), [allPosts, myUid, followSet, seenTick]);
  const myGroup = homeStories.find((g) => g.uid === myUid) || null;
  const homeList = feedPosts.filter((p) => !isStoryPost(p) && !isMediaPost(p));
  const followList = feedPosts.filter((p) => !isStoryPost(p) && !isMediaPost(p) && followSet.has(p.uid));
  const mediaList = feedPosts.filter((p) => p.attachment?.type === media);

  useEffect(() => {
    ensureOverlayFonts(); // logo yazı tipi
  }, []);

  // yeni medya işareti (başkalarının, son bakıştan sonra paylaştığı şarkı / röportaj / resim)
  const [mediaSeen, setMediaSeen] = useState(loadMediaSeen);
  const mediaNew = useMemo(() => {
    const out = {};
    feedPosts.forEach((p) => {
      const k = p.attachment?.type;
      if (MEDIA_TYPES[k] && p.uid !== myUid && Number(p.createdAtMs || 0) > Number(mediaSeen[k] || 0)) out[k] = true;
    });
    return out;
  }, [feedPosts, mediaSeen, myUid]);
  useEffect(() => {
    if (tab !== 'media' || profile || !mediaNew[media]) return;
    setMediaSeen((cur) => {
      const nx = { ...cur, [media]: Date.now() };
      try {
        localStorage.setItem(MEDIA_SEEN_KEY, JSON.stringify(nx));
      } catch {
        /* depolama kapalı */
      }
      return nx;
    });
  }, [tab, media, profile, mediaNew]);
  const anyMediaNew = Object.keys(mediaNew).length > 0;

  // aşağı çekip yenileme (Anasayfa / Takip / Medya)
  const mainRef = useRef(null);
  const refresh = useCallback(() => setHomeRefreshKey((k) => k + 1), []);
  const p2r = usePullRefresh(mainRef, refresh, tab !== 'profile' && !profile);
  const go = (id) => {
    if (id === 'share') {
      if (user) setComposeOpen(true);
      return;
    }
    // Medya'dayken tekrar Medya'ya basınca sıradaki kategori (Şarkılar → Röportajlar → Resimler)
    if (id === 'media' && tab === 'media' && !profile) setMedia((m) => MEDIA_ORDER[(MEDIA_ORDER.indexOf(m) + 1) % MEDIA_ORDER.length]);
    setProfile(null);
    setTab(id);
    if (id === 'home' || id === 'follow' || id === 'media') setHomeRefreshKey((k) => k + 1);
  };
  const nav = useMemo(
    () => ({
      openProfile: (t) => t?.uid && setProfile(t),
      // gönderideki avatar: hikâyesi varsa halka + dokununca hikâye
      storyOf: (uid) => homeStories.find((g) => g.uid === uid) || null,
      openStory: (uid) => {
        const i = homeStories.findIndex((g) => g.uid === uid);
        if (i >= 0) setViewer({ groups: homeStories, start: i, startPi: null });
      },
    }),
    [homeStories]
  );
  const openStories = (groups, i, startPi = null) => groups[i] && setViewer({ groups, start: i, startPi });
  const groupOf = (uid) => homeStories.find((g) => g.uid === uid) || null;

  const list = (posts, empty) => (
    <div className="six-feed">
      {feedLoading && posts.length === 0 && <p className="six-hint">Yükleniyor…</p>}
      {!feedLoading && posts.length === 0 && <p className="six-hint">{empty}</p>}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} liked={likedIds.has(post.id)} isOwn={post.uid === myUid} />
      ))}
    </div>
  );

  return (
    <SixNavContext.Provider value={nav}>
      <div className="sixtagram ig">
        <header className="six-top">
          {tab === 'home' ? <h1 className="six-logo">Sixtagram</h1> : <h1 className="six-title">{tab === 'profile' ? player?.displayName || 'Profil' : TABS.find((t) => t.id === tab)?.label}</h1>}
          <button className="six-ic six-bell" onClick={() => setNotifOpen(true)} disabled={!user} aria-label="Bildirimler">
            <IgIcon n="heart" size={26} />
            {unreadCount > 0 && <span className="six-badge-dot" />}
          </button>
        </header>

        <main className="six-main" ref={mainRef}>
          <PullSpinner {...p2r} />
          {tab === 'home' && (
            <>
              <StoryRow groups={homeStories} myUid={myUid} onOpen={(i) => openStories(homeStories, i)} />
              {list(homeList, 'Henüz hiç gönderi yok — ilk paylaşımı sen yap!')}
            </>
          )}
          {tab === 'media' && (
            <>
              <div className="six-chips">
                {Object.entries(MEDIA_TYPES).map(([k, label]) => (
                  <button key={k} className={`six-chip${media === k ? ' on' : ''}`} onClick={() => setMedia(k)}>
                    {label}
                    {mediaNew[k] && media !== k && <i className="six-chip-dot" aria-label="yeni" />}
                  </button>
                ))}
              </div>
              {list(mediaList, media === 'song' ? 'Henüz şarkı yok.' : media === 'interview' ? 'Henüz röportaj yok.' : 'Henüz resim yok.')}
            </>
          )}
          {tab === 'follow' && (
            <>
              <StoryRow groups={followStories} myUid={myUid} onOpen={(i) => openStories(followStories, i)} />
              {followSet.size === 0 ? <p className="six-hint">Henüz kimseyi takip etmiyorsun.</p> : list(followList, 'Takip ettiklerinin son 24 saatte gönderisi yok.')}
            </>
          )}
          {tab === 'profile' && (
            <MyProfile
              player={player}
              myProfile={myProfile}
              posts={myPosts}
              storyGroup={myGroup}
              onOpenStory={(pi = 0) => myGroup && openStories([myGroup], 0, typeof pi === 'number' ? pi : 0)}
              likedIds={likedIds}
              myUid={myUid}
              onOpenProfile={nav.openProfile}
            />
          )}
        </main>

        <nav className="six-tabbar">
          {TABS.map(({ id, label, icon }) => {
            const on = tab === id && !profile;
            return (
              <button key={id} className={`six-tabbtn${on ? ' on' : ''}`} onClick={() => go(id)} aria-label={label} title={label} disabled={id === 'share' && !user}>
                {icon ? (
                  <span className="six-tab-ic">
                    <IgIcon n={icon} size={26} fill={on && icon === 'home'} stroke={on ? 2.4 : 1.9} />
                    {id === 'media' && anyMediaNew && !(tab === 'media' && !profile) && <i className="six-tab-dot" aria-label="yeni medya" />}
                  </span>
                ) : (
                  <span className={`six-tab-av${on ? ' on' : ''}`}>
                    <AvatarSvg avatar={player?.avatar} size={26} rounded />
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {profile && (
          <UserProfileSheet
            key={profile.uid}
            target={profile}
            posts={allPosts}
            storyGroup={groupOf(profile.uid)}
            onOpenStory={() => {
              const g = groupOf(profile.uid);
              if (g) openStories([g], 0);
            }}
            likedIds={likedIds}
            myUid={myUid}
            onClose={() => setProfile(null)}
          />
        )}

        {viewer && (
          <StoryViewer
            groups={viewer.groups}
            start={viewer.start}
            startPi={viewer.startPi}
            myUid={myUid}
            onClose={() => setViewer(null)}
            onOpenProfile={(t) => {
              setViewer(null);
              if (t.uid !== myUid) setProfile(t);
              else go('profile');
            }}
          />
        )}

        {composeOpen && (
          <ComposeModal
            onClose={() => setComposeOpen(false)}
            onPosted={() => {
              invalidateSixtagramFeed();
              setTab('home');
              setHomeRefreshKey((k) => k + 1);
            }}
          />
        )}

        {notifOpen && (
          <NotificationsPanel
            onClose={() => setNotifOpen(false)}
            onOpenPost={(postId, commentId) => {
              setOpenPost({ postId, commentId });
              setNotifOpen(false);
            }}
            onOpenProfile={(t) => {
              setNotifOpen(false);
              setProfile(t);
            }}
          />
        )}

        {openPost && (
          <PostDetailPanel
            key={`${openPost.postId}_${openPost.commentId || ''}`}
            postId={openPost.postId}
            focusCommentId={openPost.commentId}
            likedIds={likedIds}
            onClose={() => setOpenPost(null)}
          />
        )}
      </div>
    </SixNavContext.Provider>
  );
}
