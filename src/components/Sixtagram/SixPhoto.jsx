import { lazy, Suspense, useEffect, useState } from 'react';
import { loadSixImage } from '../../lib/sixImage';
import { getCachedPhoto, photoKey, IS_MOBILE_DEVICE } from '../../lib/photoCache';

const HousePhoto = lazy(() => import('../HouseScreen/HousePhoto'));
const CityPhoto = lazy(() => import('../City/CityPhoto'));

// =============================================================================
// v160.2 — Sixtagram ev / şehir fotoğrafı
//   • Yeni gönderiler (attachment.img): çeken cihazın gönderdiği JPEG — sadece <img>.
//   • Eski gönderiler (görselsiz, en geç 24 saatte silinir): telefonda 3D sahne ARTIK
//     KURULMAZ (çökmenin asıl sebebi); cihazda kayıtlıysa o gösterilir. Bilgisayarda eski yol.
// =============================================================================
export default function SixPhoto({ post, attachment, onReady, story = false }) {
  const vert = Boolean(attachment.vert) && !attachment.sq;
  const isCity = attachment.type === 'cityPhoto';
  const remote = Boolean(attachment.img && post?.id);
  const legacyMobile = !remote && IS_MOBILE_DEVICE;
  const [src, setSrc] = useState(null);
  const [done, setDone] = useState(false);
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setDone(false);
    if (remote) {
      loadSixImage(post.id).then((u) => {
        if (!alive) return;
        setSrc(u);
        setDone(true);
      });
    } else if (legacyMobile) {
      getCachedPhoto(photoKey(`${isCity ? 'c' : 'h'}|${JSON.stringify(attachment)}`)).then((u) => {
        if (!alive) return;
        setSrc(u);
        setDone(true);
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, remote, legacyMobile]);
  useEffect(() => {
    if (done && !src) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, src]);

  if (remote || legacyMobile) {
    if (src)
      return (
        <img
          className={`post-att-housephoto-img${vert ? ' vert' : ''}`}
          src={src}
          alt=""
          decoding="async"
          onLoad={() => onReady?.()}
          onError={() => {
            // v160.5: görsel açılamadı (ör. iPhone'da eski önbellek kaydı) → bir kez sunucudan yeniden
            if (remote && !retried) {
              setRetried(true);
              loadSixImage(post.id, { fresh: true }).then((u) => setSrc(u || null));
            } else {
              setSrc(null);
              onReady?.();
            }
          }}
        />
      );
    return <div className={`post-att-housephoto-empty${vert ? ' vert' : ''}`}>{done ? (isCity ? '🌆' : '🏠') : ''}</div>;
  }
  return (
    <Suspense fallback={<div className="post-att-housephoto-empty" />}>
      {isCity ? <CityPhoto attachment={attachment} manual={story ? false : undefined} /> : <HousePhoto attachment={attachment} manual={story ? false : undefined} />}
    </Suspense>
  );
}
