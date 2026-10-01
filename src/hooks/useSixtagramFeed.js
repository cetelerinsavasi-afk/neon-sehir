import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const FETCH_LIMIT = 150;

/**
 * useSixtagramFeed — Anasayfa akışı.
 *
 * BİLEREK canlı dinleyici (onSnapshot) KULLANMIYORUZ — eskiden öyleydi,
 * ama en çok beğeniye göre sıralı bir listede canlı güncelleme şu soruna
 * yol açıyordu: birini beğendiğinde likeCount anında artıp post listede
 * YUKARI zıplıyordu, bu da postun "kaybolduğu" hissini veriyordu (aslında
 * sadece yer değiştiriyordu). Bunun yerine akışı SADECE şu anlarda bir
 * kez çekiyoruz: ekran ilk açıldığında, `refreshKey` değiştiğinde
 * (SixtagramScreen, Anasayfa sekmesine her girişte bunu artırır) ve
 * `refresh()` elle çağrıldığında. Böylece gezinirken sıralama sabit
 * kalır, ama sekmeden çıkıp tekrar girince en güncel (doğru) sıraya
 * göre yeniden dizilir.
 */
// v73 — maliyet: Anasayfa sekmesine her girişte 150 gönderi okunuyordu.
// 90 sn içinde tekrar girilirse son liste kullanılır (elle yenileme / yeni
// paylaşım her zaman taze çeker).
const CACHE_MS = 90_000;
let feedCache = { at: 0, posts: null };

// Önbellekteki tek gönderiyi günceller/siler (beğeni sayısı, silme) — tekrar
// girişte eski sayı görünmesin.
export function patchSixtagramFeedPost(id, patch) {
  if (!feedCache.posts) return;
  feedCache = {
    ...feedCache,
    posts: patch ? feedCache.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) : feedCache.posts.filter((p) => p.id !== id),
  };
}

export function invalidateSixtagramFeed() {
  feedCache = { at: 0, posts: null };
}

export function useSixtagramFeed(refreshKey) {
  const [posts, setPosts] = useState(() => feedCache.posts || []);
  const [loading, setLoading] = useState(!feedCache.posts);

  const fetchFeed = useCallback(async (opts) => {
    const force = opts === true || opts?.force === true;
    if (!force && feedCache.posts && Date.now() - feedCache.at < CACHE_MS) {
      setPosts(feedCache.posts);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, 'sixtagramPosts'),
        orderBy('createdAtMs', 'desc'),
        limit(FETCH_LIMIT)
      );
      const snap = await getDocs(q);
      const now = Date.now();
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => (p.expiresAtMs ?? 0) > now);
      // Sıralama (kullanıcı isteği): önce SON 1 SAATTE atılmış postlar
      // (en yeni en üstte), ardından geri kalanı en çok beğeniye göre.
      const recent = list
        .filter((p) => now - (p.createdAtMs || 0) < ONE_HOUR_MS)
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      const older = list
        .filter((p) => now - (p.createdAtMs || 0) >= ONE_HOUR_MS)
        .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
      const next = [...recent, ...older];
      feedCache = { at: Date.now(), posts: next };
      setPosts(next);
    } catch (err) {
      console.error('useSixtagramFeed çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [refreshKey, fetchFeed]);

  return { posts, loading, refresh: () => fetchFeed(true) };
}
