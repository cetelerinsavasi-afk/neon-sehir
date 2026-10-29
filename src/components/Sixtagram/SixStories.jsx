import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Trash2, X } from 'lucide-react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import PostAttachment from './PostAttachment';
import ConfirmSheet from './ConfirmSheet';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { useSheetDrag } from './useSheetDrag'; // v136
import { deleteSixtagramPost } from '../../services/gameActions';
import { patchSixtagramFeedPost } from '../../hooks/useSixtagramFeed';
import { flushStoryViews, isStorySeen, markStorySeen, useSixtagramPublicProfile } from '../../hooks/useSixtagramSocial';

const HousePhoto = lazy(() => import('../HouseScreen/HousePhoto'));

// =============================================================================
// v135 — Sixtagram hikâyeleri (mekânda çekilen fotoğraflar).
//   • Sıra: önce kendi hikâyen, sonra izlemediklerin, en sonda izlediklerin;
//     her grup kendi içinde takipçisi çoktan aza.
//   • İzlenmemiş halka renkli, izlenmiş gri. Anasayfada izlenen, Takip'te de izlenmiş sayılır.
//   • Hikâyede üst solda fotoğraf + ad (Instagram gibi); kendi hikâyende altta kaç kişinin
//     gördüğü, basınca görenler listesi.
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

// v136 — izlenecek sıra açılışta bir kez kurulur:
//   • izlenmemiş (ya da kendi) hikâyeden açılınca: sadece izlenmemiş hikâyeler; bitince kapanır
//   • izlenmiş birine basınca: o kişinin tüm hikâyeleri, sonra sıradaki izlenmiş kişiler
function buildQueue(groups, start, myUid) {
  const g0 = groups[start];
  if (!g0) return [];
  const unseenOf = (g) => g.posts.filter((p) => !isStorySeen(p, myUid));
  const own = g0.uid === myUid;
  if (!own && g0.seen) return groups.slice(start).filter((g) => g.uid !== myUid).map((g) => ({ ...g, posts: g.posts }));
  const first = { ...g0, posts: own ? g0.posts : unseenOf(g0) };
  const rest = groups
    .slice(start + 1)
    .filter((g) => g.uid !== myUid)
    .map((g) => ({ ...g, posts: unseenOf(g) }))
    .filter((g) => g.posts.length);
  return [first, ...rest].filter((g) => g.posts.length);
}

export function StoryViewer({ groups: allGroups, start, startPi = null, myUid, onClose, onOpenProfile }) {
  const [groups] = useState(() => {
    const q = buildQueue(allGroups, start, myUid);
    // gönderi avatarından belirli bir hikâyeyle açıldıysa (startPi) o kişinin tamamı
    if (startPi != null && allGroups[start]) return [allGroups[start]];
    return q.length ? q : allGroups[start] ? [allGroups[start]] : [];
  });
  const [gi, setGi] = useState(0);
  const g = groups[gi];
  const [pi, setPi] = useState(() => startPi || 0);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false); // v136: başkasının hikâyesini bildir
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [slide, setSlide] = useState('');
  const blockClick = useRef(false);
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
      setSlide('in-r');
      setGi(gi + 1);
      setPi(0);
    } else onClose();
  };
  const prev = () => {
    if (pi > 0) setPi(pi - 1);
    else if (gi > 0) {
      setSlide('in-l');
      setGi(gi - 1);
      setPi(0);
    } else elapsed.current = 0;
  };
  // kişiler arası geçiş: sağa/sola kaydır (o kişinin kalan hikâyeleri atlanır) · aşağı kaydır: kapat
  const goGroup = (d) => {
    const ng = gi + d;
    setDragX(0);
    if (ng < 0) return undefined;
    if (ng >= groups.length) return onClose();
    setSlide(d > 0 ? 'in-r' : 'in-l');
    setGi(ng);
    setPi(0);
    return undefined;
  };
  const swipe = useRef(null);
  const onSwDown = (e) => {
    setPaused(true);
    swipe.current = { x: e.clientX, y: e.clientY, t: Date.now(), drag: null };
  };
  const onSwMove = (e) => {
    const sw = swipe.current;
    if (!sw) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (!sw.drag && Math.max(Math.abs(dx), Math.abs(dy)) > 12) sw.drag = Math.abs(dx) > Math.abs(dy) ? 'x' : dy > 0 ? 'y' : own ? 'up' : null;
    if (sw.drag === 'x') setDragX(dx);
    if (sw.drag === 'y') setDragY(Math.max(0, dy));
  };
  const onSwUp = (e) => {
    const sw = swipe.current;
    swipe.current = null;
    if (!askDel && !viewersOpen && !reportOpen) setPaused(false);
    if (!sw?.drag) return;
    blockClick.current = true;
    setTimeout(() => (blockClick.current = false), 50);
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    const dt = Math.max(1, Date.now() - sw.t);
    if (sw.drag === 'y') {
      if (dy > 110 || (dy > 35 && dy / dt > 0.5)) onClose();
      else setDragY(0);
      return;
    }
    // v136: kendi hikâyende yukarı kaydır → görüntüleyenler
    if (sw.drag === 'up') {
      if (dy < -60 || (dy < -25 && -dy / dt > 0.5)) {
        setPaused(true);
        setViewersOpen(true);
      }
      return;
    }
    const fast = Math.abs(dx) / dt > 0.5;
    if (dx < -70 || (fast && dx < -25)) goGroup(1);
    else if (dx > 70 || (fast && dx > 25)) goGroup(-1);
    else setDragX(0);
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
  useEffect(() => {
    if (!g) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  if (!g || !post) return null;
  const pct = Math.min(1, elapsed.current / STORY_MS);
  const remove = async () => {
    await deleteSixtagramPost(post.id);
    patchSixtagramFeedPost(post.id, null);
    setDeleted((d) => ({ ...d, [post.id]: true }));
  };
  const viewers = post.viewers || [];
  const openWho = () => onOpenProfile?.({ uid: g.uid, name: g.name, avatar: g.avatar });
  return (
    <div className="six-sv" role="dialog" aria-label="Hikâye" style={dragY ? { transform: `translateY(${dragY}px) scale(${Math.max(0.85, 1 - dragY / 1600)})`, borderRadius: 18, opacity: Math.max(0.4, 1 - dragY / 700), transition: 'none' } : undefined}>
      <div className="six-sv-top">
        <div className="six-sv-bars">
          {posts.map((p, i) => (
            <i key={p.id}>
              <b style={{ width: `${i < pi ? 100 : i === pi ? pct * 100 : 0}%` }} />
            </i>
          ))}
        </div>
        <div className="six-sv-head">
          <button className="six-sv-who" onClick={openWho}>
            <span className="six-sv-av">
              <AvatarSvg avatar={g.avatar} size={32} rounded variant="headshot" />
            </span>
            <b>{own ? 'Hikâyen' : g.name}</b>
            <small>{timeAgo(post.createdAtMs)}</small>
          </button>
          <span className="six-sp" />
          {!own && (
            <button
              className="six-sv-close six-sv-report"
              onClick={() => {
                setPaused(true);
                setReportOpen(true);
              }}
              aria-label="Hikâyeyi bildir"
            >
              ⚑
            </button>
          )}
          <button className="six-sv-close" onClick={onClose} aria-label="Kapat">
            <X size={26} />
          </button>
        </div>
      </div>
      <div
        className="six-sv-stage"
        onPointerDown={onSwDown}
        onPointerMove={onSwMove}
        onPointerUp={onSwUp}
        onPointerCancel={onSwUp}
        onPointerLeave={(e) => swipe.current && onSwUp(e)}
      >
        <div key={g.uid} className={`six-sv-slide ${slide}${dragX ? ' drag' : ''}`} style={dragX ? { transform: `translateX(${dragX}px) rotateY(${-dragX / 18}deg)`, opacity: Math.max(0.35, 1 - Math.abs(dragX) / 500) } : undefined} onAnimationEnd={() => setSlide('')}>
          <StoryContent key={post.id} post={post} onReady={() => setReady(true)} />
        </div>
        {post.text && <p className="six-sv-caption">{post.text}</p>}
        <button className="six-sv-zone l" onClick={() => !blockClick.current && prev()} aria-label="Önceki" />
        <button className="six-sv-zone r" onClick={() => !blockClick.current && next()} aria-label="Sonraki" />
      </div>
      {own && (
        <div className="six-sv-foot">
          <button
            className="six-sv-views"
            onClick={() => {
              setPaused(true);
              setViewersOpen(true);
            }}
          >
            <span className="six-sv-views-av">
              {viewers.slice(0, 3).map((u) => (
                <ViewerHead key={u} uid={u} />
              ))}
            </span>
            <Eye size={17} />
            <span>{viewers.length ? `${viewers.length.toLocaleString('tr-TR')} kişi gördü` : 'Henüz gören yok'}</span>
          </button>
          <span className="six-sp" />
          <button
            className="six-sv-del"
            onClick={() => {
              setPaused(true);
              setAskDel(true);
            }}
            aria-label="Hikâyeyi sil"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
      {viewersOpen && (
        <ViewersSheet
          uids={viewers}
          onClose={() => {
            setViewersOpen(false);
            setPaused(false);
          }}
          onOpenProfile={onOpenProfile}
        />
      )}
      {reportOpen && (
        <ReportBlockSheet
          targetUid={g.uid}
          targetName={g.name || 'Oyuncu'}
          canBlock={false}
          items={[{ label: 'Hikâyeyi bildir', targetType: 'sixtagramPost', targetPath: `sixtagramPosts/${post.id}`, preview: post.text }]}
          onClose={() => {
            setReportOpen(false);
            setPaused(false);
          }}
        />
      )}
      {askDel && (
        <ConfirmSheet
          title="Hikâye silinsin mi?"
          text="Bu hikâye kalıcı olarak silinecek."
          onConfirm={remove}
          onClose={() => {
            setAskDel(false);
            setPaused(false);
          }}
        />
      )}
    </div>
  );
}

function ViewerHead({ uid }) {
  const prof = useSixtagramPublicProfile(uid);
  return (
    <span className="six-vh">
      <AvatarSvg avatar={prof?.avatar || null} size={22} rounded variant="headshot" />
    </span>
  );
}
function ViewerRow({ uid, onOpen }) {
  const prof = useSixtagramPublicProfile(uid);
  const name = prof?.displayName || '…';
  return (
    <button className="six-vw-row" onClick={() => onOpen({ uid, name, avatar: prof?.avatar || null })}>
      <span className="six-vw-av">
        <AvatarSvg avatar={prof?.avatar || null} size={44} rounded variant="headshot" />
      </span>
      <b>{name}</b>
    </button>
  );
}
// kendi hikâyeni görenler (Instagram "Etkinlik" sayfası gibi alttan açılır)
function ViewersSheet({ uids, onClose, onOpenProfile }) {
  const [shown, setShown] = useState(30);
  const drag = useSheetDrag(onClose); // v136: aşağı çekerek kapat
  const list = [...uids].reverse(); // en son görenler üstte
  return (
    <div className="six-vw-bg" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="six-vw" ref={drag.ref} style={drag.style} onClick={(e) => e.stopPropagation()}>
        <i className="six-vw-grab" />
        <div className="six-vw-head">
          <Eye size={18} /> <b>{uids.length.toLocaleString('tr-TR')}</b>
          <span>Görüntüleyenler</span>
        </div>
        <div
          className="six-vw-list"
          data-sheet-scroll
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 80) setShown((n) => Math.min(list.length, n + 30));
          }}
        >
          {list.length === 0 && <p className="six-vw-empty">Hikâyeni henüz kimse görmedi.</p>}
          {list.slice(0, shown).map((u) => (
            <ViewerRow
              key={u}
              uid={u}
              onOpen={(t) => {
                onClose();
                onOpenProfile?.(t);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
