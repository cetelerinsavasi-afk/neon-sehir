import { useEffect, useRef, useState } from 'react';
import { AvatarViewer, avatarThumb3D, webglOk } from '../../lib/avatar3dView';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import './Avatar3D.css';

// =============================================================================
// v212 — React sarmalayıcıları
//  <Avatar3DView avatar pose />  : elle çevrilen 3D önizleme (kendi kendine dönmez)
//  <Avatar3DThumb avatar fallback /> : 3D küçük resim; hazır olana kadar 2D resim görünür,
//                                     sadece ekrana girince üretilir
// WebGL yoksa ikisi de 2D'ye düşer.
// =============================================================================

export function Avatar3DView({ avatar, pose = 'idle', className = '', frame = 'full', yaw }) {
  const ref = useRef(null);
  const viewer = useRef(null);
  const [failed, setFailed] = useState(() => !webglOk());
  const [ready, setReady] = useState(false);
  const avKey = JSON.stringify(avatar || {});

  useEffect(() => {
    if (failed || !ref.current) return undefined;
    try {
      viewer.current = new AvatarViewer(ref.current, { frame, ...(yaw != null ? { yaw } : {}) });
    } catch {
      setFailed(true);
      return undefined;
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [failed, frame, yaw]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    let live = true;
    v.setAvatar(JSON.parse(avKey)).then((ok) => live && ok && setReady(true));
    return () => {
      live = false;
    };
  }, [avKey, failed]);

  useEffect(() => {
    viewer.current?.setPose(pose);
  }, [pose, failed]);

  if (failed) return <AvatarSvg avatar={avatar} variant="full" />;
  return (
    <div className={`a3d-view ${className}`} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-label="3D avatar önizlemesi — çevirmek için yana sürükle" />
      {!ready && <div className="a3d-wait" aria-hidden="true" />}
    </div>
  );
}

// v217: kart ekrana yaklaşmadan HİÇBİR resim çizilmez. Eskiden 100 kartın hepsinin 2D (SVG)
// yedek resmi panel açılır açılmaz aynı anda çözülüyordu → telefonda bellek taşıp WebView
// çöküyordu. Şimdi: görünür olunca 3D resim üretilir; WebGL yoksa ya da 3D başarısızsa 2D
// yedek kullanılır. fallback bir fonksiyon da olabilir (sadece gerekince hesaplanır).
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export function Avatar3DThumb({ avatar, fallback, className = '', style, w = 200, h = 230, frame = 'bust', yaw = 0.32 }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const avKey = JSON.stringify(avatar || {});
  const fbRef = useRef(fallback);
  fbRef.current = fallback;
  useEffect(() => {
    setSrc(null);
    if (!ref.current) return undefined;
    let live = true;
    const el = ref.current;
    const fb = () => {
      const f = fbRef.current;
      return typeof f === 'function' ? f() : f;
    };
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (!webglOk()) {
          setSrc(fb() || null);
          return;
        }
        avatarThumb3D(JSON.parse(avKey), { w, h, frame, yaw })
          .then((u) => live && setSrc(u))
          .catch(() => live && setSrc(fb() || null));
      },
      { rootMargin: '150px' }
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [avKey, w, h, frame, yaw]);
  return <img ref={ref} className={className} style={style} src={src || BLANK} alt="" decoding="async" />;
}
