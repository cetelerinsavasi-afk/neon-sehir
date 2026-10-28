import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PlayerCard from '../PlayerCard/PlayerCard';
import PostCard from './PostCard';
import { StoryRing } from './SixStories';
import { setFollow, useSixtagramPublicProfile, useSixtagramSocial } from '../../hooks/useSixtagramSocial';

// =============================================================================
// v135 — Sixtagram profilleri
//   • Kendi profilin: gönderi (son 24 saat) · takipçi · takip · beğeni; takipçilerine
//     ve takip ettiklerine dokununca liste açılır (takibi bırakabilirsin).
//   • Başka oyuncu: takip et / takibi bırak, takipçi ve beğeni sayısı, son 24 saatte
//     paylaştıkları (akıştan — ek okuma yok), oyuncu kartı.
// =============================================================================
const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('tr-TR');

function Stat({ n, label, onClick }) {
  return (
    <button className="six-stat" onClick={onClick} disabled={!onClick}>
      <b>{fmt(n)}</b>
      <span>{label}</span>
    </button>
  );
}

export function FollowButton({ uid, name, small = false }) {
  const { isFollowing } = useSixtagramSocial();
  const on = isFollowing(uid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = async () => {
    setBusy(true);
    setErr('');
    try {
      await setFollow(uid, !on, name);
    } catch (e) {
      setErr(e?.message || 'Olmadı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className={`six-follow${on ? ' on' : ''}${small ? ' sm' : ''}`} disabled={busy} onClick={toggle}>
        {on ? 'Takiptesin' : 'Takip et'}
      </button>
      {err && <p className="six-err">{err}</p>}
    </>
  );
}

export function MyProfile({ player, myProfile, posts, storyGroup, onOpenStory, likedIds, myUid, onOpenProfile }) {
  const { following, followers } = useSixtagramSocial();
  const [list, setList] = useState(null); // 'followers' | 'following'
  const nFollowing = Object.keys(following).length;
  const nFollowers = Math.max(Object.keys(followers).length, Number(myProfile?.followerCount || 0));
  const feedPosts = posts.filter((p) => !p.story);
  return (
    <div className="six-profile">
      <div className="six-prof-head">
        {storyGroup ? (
          <StoryRing avatar={player?.avatar} seen={storyGroup.seen} own size={86} onClick={() => onOpenStory(0)} />
        ) : (
          <span className="six-prof-av">
            <AvatarSvg avatar={player?.avatar} size={82} rounded />
          </span>
        )}
        <div className="six-stats">
          <Stat n={posts.length} label="gönderi" />
          <Stat n={nFollowers} label="takipçi" onClick={() => setList('followers')} />
          <Stat n={nFollowing} label="takip" onClick={() => setList('following')} />
          <Stat n={myProfile?.totalLikes} label="beğeni" />
        </div>
      </div>
      <p className="six-prof-name">{player?.displayName || 'Oyuncu'}</p>
      <p className="six-prof-sub">Son 24 saatte paylaştıkların</p>
      {storyGroup && (
        <div className="six-prof-stories">
          {storyGroup.posts.map((p, i) => (
            <button key={p.id} className="six-prof-story" onClick={() => onOpenStory(i)}>
              <span>📸</span>
              <small>👁 {fmt((p.viewers || []).length)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="six-feed">
        {feedPosts.length === 0 && !storyGroup && <p className="six-hint">Henüz bir paylaşımın yok.</p>}
        {feedPosts.map((p) => (
          <PostCard key={p.id} post={p} liked={likedIds.has(p.id)} isOwn />
        ))}
      </div>
      {list && (
        <FollowList
          title={list === 'followers' ? 'Takipçiler' : 'Takip edilenler'}
          map={list === 'followers' ? followers : following}
          myUid={myUid}
          onClose={() => setList(null)}
          onOpen={(u) => {
            setList(null);
            onOpenProfile(u);
          }}
        />
      )}
    </div>
  );
}

function FollowList({ title, map, onClose, onOpen }) {
  const rows = Object.entries(map)
    .map(([uid, v]) => ({ uid, n: v?.n || 'Oyuncu', ms: Number(v?.ms || 0) }))
    .sort((a, b) => b.ms - a.ms);
  return (
    <div className="six-sheet">
      <div className="six-sheet-head">
        <button className="six-ic" onClick={onClose} aria-label="Geri">
          <ChevronLeft size={22} />
        </button>
        <b>{title}</b>
        <span className="six-ic" />
      </div>
      <div className="six-sheet-body">
        {rows.length === 0 && <p className="six-hint">Burada henüz kimse yok.</p>}
        {rows.map((r) => (
          <div className="six-row" key={r.uid}>
            <button className="six-row-main" onClick={() => onOpen({ uid: r.uid, name: r.n })}>
              <span className="six-initial">{(r.n || '?').slice(0, 1).toUpperCase()}</span>
              <b>{r.n}</b>
            </button>
            <FollowButton uid={r.uid} name={r.n} small />
          </div>
        ))}
      </div>
    </div>
  );
}

export function UserProfileSheet({ target, posts, storyGroup, onOpenStory, likedIds, myUid, onClose }) {
  const prof = useSixtagramPublicProfile(target.uid);
  const [card, setCard] = useState(false);
  const theirs = posts.filter((p) => p.uid === target.uid);
  const feedPosts = theirs.filter((p) => !p.story);
  const name = prof?.displayName || target.name || 'Oyuncu';
  const avatar = prof?.avatar || target.avatar || null;
  const isMe = target.uid === myUid;
  return (
    <div className="six-sheet">
      <div className="six-sheet-head">
        <button className="six-ic" onClick={onClose} aria-label="Geri">
          <ChevronLeft size={22} />
        </button>
        <b>{name}</b>
        <span className="six-ic" />
      </div>
      <div className="six-sheet-body">
        <div className="six-prof-head">
          {storyGroup ? (
            <StoryRing avatar={avatar} seen={storyGroup.seen} size={86} onClick={() => onOpenStory()} />
          ) : (
            <span className="six-prof-av">
              <AvatarSvg avatar={avatar} size={82} rounded />
            </span>
          )}
          <div className="six-stats">
            <Stat n={theirs.length} label="gönderi" />
            <Stat n={prof?.followerCount} label="takipçi" />
            <Stat n={prof?.followingCount} label="takip" />
            <Stat n={prof?.totalLikes} label="beğeni" />
          </div>
        </div>
        <p className="six-prof-name">{name}</p>
        {!isMe && (
          <div className="six-prof-btns">
            <FollowButton uid={target.uid} name={name} />
            <button className="six-follow alt" onClick={() => setCard(true)}>
              🪪 Oyuncu kartı
            </button>
          </div>
        )}
        <p className="six-prof-sub">Son 24 saatte paylaştıkları</p>
        <div className="six-feed">
          {feedPosts.length === 0 && <p className="six-hint">Son 24 saatte bir gönderisi yok.</p>}
          {feedPosts.map((p) => (
            <PostCard key={p.id} post={p} liked={likedIds.has(p.id)} isOwn={p.uid === myUid} />
          ))}
        </div>
      </div>
      {card && <PlayerCard uid={target.uid} name={name} avatar={avatar} onClose={() => setCard(false)} />}
    </div>
  );
}
