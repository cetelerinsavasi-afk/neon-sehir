import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Trash2, X } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PostAttachment from './PostAttachment';
import { deleteSixtagramPost } from '../../services/gameActions';
import { patchSixtagramFeedPost } from '../../hooks/useSixtagramFeed';
import { flushStoryViews, isStorySeen, markStorySeen } from '../../hooks/useSixtagramSocial';

const HousePhoto = lazy(() => import('../HouseScreen/HousePhoto'));

// =============================================================================
// v135 — Sixtagram hikâyeleri (mekânda çekilen fotoğraflar).
//   • Sıra: önce kendi hikâyen, sonra izlemediklerin, en sonda izlediklerin;
//     her grup kendi içinde takipçisi çoktan aza.
//   • İzlenmemiş halka renkli, izlenmiş gri. Anasayfada izlenen, Takip'te de izlenmiş sayılır.
//   • Hikâyede altta küçük fotoğraf + ad; kendi hikâyende kaç kişinin gördüğü.
// =============================================================================
const STORY_MS = 5500;
export const isStoryPost = (p) => Boolean(p?.story);

function timeAgo(ms) {
  const m = Math.floor((Date.now() - Number(ms || 0)) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk`;
  return `${Math.floor(m / 60)} sa`;
}

export function buildStoryGroups(posts, myUid, onlyUids = null) {
  const now = Date.now();
  const by = new Map();
  posts.forEach((p) => {
    if (!isStoryPost(p) || Number(p.expiresAtMs || 0) <= now) return;
    if (onlyUids && p.uid !== myUid && !onlyUids.has(p.uid)) return;
    let g = by.get(p.uid);
    if (!g) {
      g = { uid: p.uid, name: p.authorName || 'Oyuncu', avatar: p.authorAvatar || null, posts: [], followers: 0, latest: 0 };
      by.set(p.uid, g);
    }
    g.posts.push(p);
    g.followers = Math.max(g.followers, Number(p.authorFollowers || 0));
    g.latest = Math.max(g.latest, Number(p.createdAtMs || 0));
  });
  const list = [...by.values()];
  list.forEach((g) => {
    g.posts.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
    g.seen = g.posts.every((p) => isStorySeen(p, myUid));
  });
  const mine = list.filter((g) => g.uid === myUid);
  const rest = list.filter((g) => g.uid !== myUid).sort((a, b) => Number(a.seen) - Number(b.seen) || b.followers - a.followers || b.latest - a.latest);
  return [...mine, ...rest];
}

export function StoryRing({ avatar, seen, size = 62, onClick, label, own = false, plus = false }) {
  return (
    <button className="six-story" onClick={onClick} style={{ width: size + 8 }}>
      <span className={`six-ring${seen ? ' seen' : ''}${own && seen ? ' own' : ''}`} style={{ width: size, height: size }}>
        <span className="six-ring-in">
          <AvatarSvg avatar={avatar} size={size - 8} rounded variant="headshot" />
        </span>
        {plus && <span className="six-ring-plus">＋</span>}
      </span>
      {label != null && <span className="six-story-name">{label}</span>}
    </button>
  );
}

export function StoryRow({ groups, myUid, onOpen }) {
  if (!groups.length) return null;
  return (
    <div className="six-stories">
      {groups.map((g, i) => (
        <StoryRing key={g.uid} avatar={g.avatar} seen={g.seen} own={g.uid === myUid} label={g.uid === myUid ? 'Hikâyen' : g.name} onClick={() => onOpen(i)} />
      ))}
    </div>
  );
}

function StoryContent({ post, onReady }) {
  const att = post.attachment;
  useEffect(() => {
    if (att?.type !== 'housePhoto') onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);
  if (att?.type === 'housePhoto') {
    return (
      <div className="six-sv-photo">
        <Suspense fallback={<div className="six-sv-wait">📸</div>}>
          <HousePhotoReady attachment={att} onReady={onReady} />
        </Suspense>
      </div>
    );
  }
  return (
    <div className="six-sv-photo square">
      <PostAttachment attachment={att} post={post} />
    </div>
  );
}
// HousePhoto yüklenince süre başlasın
function HousePhotoReady({ attachment, onReady }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => {
      if (el.querySelector('img')) {
        onReady?.();
        return true;
      }
      return false;
    };
    if (check()) return undefined;
    const mo = new MutationObserver(() => check() && mo.disconnect());
    mo.observe(el, { childList: true, subtree: true });
    const fallback = setTimeout(() => onReady?.(), 6000);
    return () => {
      mo.disconnect();
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} className="six-sv-hp">
      <HousePhoto attachment={attachment} />
    </div>
  );
}

export function StoryViewer({ groups, start, startPi = null, myUid, onClose, onOpenProfile }) {
  const [gi, setGi] = useState(start);
  const g = groups[gi];
  const firstUnseen = (grp) => Math.max(0, grp ? grp.posts.findIndex((p) => !isStorySeen(p, myUid)) : 0);
  const [pi, setPi] = useState(() => (startPi != null ? startPi : groups[start]?.uid === myUid ? 0 : firstUnseen(groups[start])));
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [deleted, setDeleted] = useState({});
  const posts = useMemo(() => (g ? g.posts.filter((p) => !deleted[p.id]) : []), [g, deleted]);
  const post = posts[Math.min(pi, posts.length - 1)] || null;
  const own = g?.uid === myUid;
  const elapsed = useRef(0);
  const lastT = useRef(0);
  const [, setFrame] = useState(0);

  useEffect(() => () => flushStoryViews(), []);
  useEffect(() => {
    setReady(false);
    elapsed.current = 0;
    if (post) markStorySeen(post, myUid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  const next = () => {
    if (pi < posts.length - 1) setPi(pi + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setPi(groups[gi + 1].uid === myUid ? 0 : firstUnseen(groups[gi + 1]));
    } else onClose();
  };
  const prev = () => {
    if (pi > 0) setPi(pi - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setPi(0);
    } else elapsed.current = 0;
  };
  // süre (duraklatılabilir)
  useEffect(() => {
    if (!post) return undefined;
    let raf;
    lastT.current = performance.now();
    const loop = (t) => {
      const dt = t - lastT.current;
      lastT.current = t;
      if (ready && !paused) elapsed.current += dt;
      setFrame((n) => (n + 1) % 1000);
      if (elapsed.current >= STORY_MS) {
        elapsed.current = 0;
        next();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, ready, paused, gi, pi]);
  useEffect(() => {
    if (g && !posts.length) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  if (!g || !post) return null;
  const pct = Math.min(1, elapsed.current / STORY_MS);
  const remove = async () => {
    setPaused(true);
    try {
      await deleteSixtagramPost(post.id);
      patchSixtagramFeedPost(post.id, null);
      setDeleted((d) => ({ ...d, [post.id]: true }));
    } catch {
      /* yoksay */
    } finally {
      setPaused(false);
    }
  };
  return (
    <div className="six-sv" role="dialog" aria-label="Hikâye">
      <div className="six-sv-bars">
        {posts.map((p, i) => (
          <i key={p.id}>
            <b style={{ width: `${i < pi ? 100 : i === pi ? pct * 100 : 0}%` }} />
          </i>
        ))}
      </div>
      <button className="six-sv-close" onClick={onClose} aria-label="Kapat">
        <X size={22} />
      </button>
      <div
        className="six-sv-stage"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <StoryContent key={post.id} post={post} onReady={() => setReady(true)} />
        {post.text && <p className="six-sv-caption">{post.text}</p>}
        <button className="six-sv-zone l" onClick={prev} aria-label="Önceki" />
        <button className="six-sv-zone r" onClick={next} aria-label="Sonraki" />
      </div>
      <div className="six-sv-foot">
        <button className="six-sv-who" onClick={() => onOpenProfile?.({ uid: g.uid, name: g.name, avatar: g.avatar })}>
          <span className="six-sv-av">
            <AvatarSvg avatar={g.avatar} size={30} rounded variant="headshot" />
          </span>
          <b>{own ? 'Hikâyen' : g.name}</b>
          <small>{timeAgo(post.createdAtMs)}</small>
        </button>
        <span className="six-sp" />
        {own && (
          <>
            <span className="six-sv-views">
              <Eye size={16} /> {(post.viewers || []).length.toLocaleString('tr-TR')}
            </span>
            <button className="six-sv-del" onClick={remove} aria-label="Hikâyeyi sil">
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
