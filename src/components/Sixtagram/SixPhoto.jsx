import { lazy, Suspense, useEffect, useState } from 'react';
import { loadSixImage } from '../../lib/sixImage';
import { getCachedPhoto, photoKey, IS_MOBILE_DEVICE } from '../../lib/photoCache';

const HousePhoto = lazy(() => import('../HouseScreen/HousePhoto'));
const CityPhoto = lazy(() => import('../City/CityPhoto'));

// =============================================================================
// v160.2 — Sixtagram ev / şehir fotoğrafı
//   • Yeni gönderiler (attachment.img): çeken cihazın gönderdiği JPEG — sadece <img>.
//   • Eski gönderiler (görselsiz, en geç 24 saatte silinir): bilgisayarda 3D sahneden çizilir.
// v160.7 — telefonda eski (görselsiz) gönderiler artık sadece simge değil:
//   • akışta "göstermek için dokun" — dokunulan TEK fotoğraf çizilir (sırayla, aynı anda tek
//     3D sahne) ve cihaza kaydedilir; bir dahaki sefere anında açılır. Otomatik çizim YOK
//     (çökmenin asıl sebebi akıştaki her fotoğrafı kendiliğinden çizmekti).
//   • hikâyede izleyicinin "Fotoğrafı göster" düğmesi (onNeedTap / loadNow).
//   • yeni gönderinin görseli inmezse "tekrar dene".
// =============================================================================
export default function SixPhoto({ post, attachment, onReady, story = false, loadNow = false, onNeedTap }) {
  const vert = Boolean(attachment.vert) && !attachment.sq;
  const isCity = attachment.type === 'cityPhoto';
  const remote = Boolean(attachment.img && post?.id);
  const legacyMobile = !remote && IS_MOBILE_DEVICE;
  const [src, setSrc] = useState(null);
  const [done, setDone] = useState(false);
  const [retried, setRetried] = useState(false);
  const [asked, setAsked] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setDone(false);
    if (remote) {
      loadSixImage(post.id, { fresh: tries > 0 }).then((u) => {
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
  }, [post?.id, remote, legacyMobile, tries]);
  const want = asked || loadNow;
  // hikâyede: çizilmemiş eski fotoğraf → izleyici "Fotoğrafı göster" düğmesini gösterir
  useEffect(() => {
    if (!story || !legacyMobile || !done) return;
    onNeedTap?.(!src && !want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, legacyMobile, done, src, want]);
  useEffect(() => {
    if (done && !src && !(legacyMobile && want)) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, src]);

  const empty = <div className={`post-att-housephoto-empty${vert ? ' vert' : ''}`}>{done ? (isCity ? '🌆' : '🏠') : ''}</div>;

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

  if (remote) {
    if (!done) return empty;
    // görsel inmedi (bağlantı vb.) → elle tekrar dene
    return (
      <button
        type="button"
        className={`post-att-housephoto-empty post-att-cityphoto-tap${vert ? ' vert' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setRetried(false);
          setTries((n) => n + 1);
        }}
      >
        ⚠️ Fotoğraf yüklenemedi — tekrar denemek için dokun
      </button>
    );
  }

  if (legacyMobile) {
    if (!done) return empty;
    if (!want) {
      if (story) return empty; // düğme hikâye izleyicisinde (dokunma alanlarının üstünde)
      return (
        <button
          type="button"
          className={`post-att-housephoto-empty post-att-cityphoto-tap${vert ? ' vert' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setAsked(true);
          }}
        >
          {isCity ? '🌆 Şehir' : '🏠 Ev'} fotoğrafı — göstermek için dokun
        </button>
      );
    }
    // dokunuldu: tek fotoğraf, sırayla çizilir (photoCache kuyruğu) ve cihaza kaydedilir
  }
  return (
    <Suspense fallback={<div className="post-att-housephoto-empty" />}>
      {isCity ? <CityPhoto attachment={attachment} manual={false} /> : <HousePhoto attachment={attachment} manual={false} />}
    </Suspense>
  );
}
