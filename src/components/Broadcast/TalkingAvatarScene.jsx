import { useEffect, useRef } from 'react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { drawBroadcastBackdrop, BROADCAST_BACKDROP_W, BROADCAST_BACKDROP_H } from '../../lib/broadcastBackdrops';
import './TalkingAvatarScene.css';

// TalkingAvatarScene — röportaj (madde 1) VE TV spikeri (madde 3) için
// ORTAK görsel.
//
// KULLANICI REVİZESİ: eskiden bu sahne oyunun üstten/izometrik "dünya"
// arka planını (drawBankSceneBackground vb.) bir fotoğraf kutusuyla
// kırpıp gösteriyordu — kullanıcı bunun "sanki o mekanda avatarımızla
// geziyormuşuz gibi" durduğunu belirtti. Artık arka plan GERÇEK bir
// kameranın arkamızdaki mekanı çektiği düz/sabit bir "stüdyo arka planı"
// (bkz. lib/broadcastBackdrops.js — mekanı birebir değil ama palet ve
// tanıdık ögelerle ANDIRIYOR) ve avatar da artık tam vücut değil, gerçek
// bir röportaj/haber çekimi gibi SADECE kafa + üst gövde (variant="bust")
// gösteriyor. Ağız animasyonu UYDURMA bir overlay değil — avatarShapes.js'in
// KENDİ mouthShape='open' çizimi (bkz. lib/avatarShapes.js mouthShape())
// `mouthOpen` true olduğunda geçici olarak zorlanıyor, false olduğunda
// oyuncunun gerçek/seçili mouthShape'ine dönülüyor.
export default function TalkingAvatarScene({ locationId, avatar, mouthOpen, studio = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    // studio modda (TV) arka plan sabit bir CSS gradyanı kullanıyor (bkz.
    // .talking-scene-studio) — TV spikerleri bir oyun mekanına değil,
    // stüdyoya bağlı, bu yüzden canvas orada hiç mount edilmiyor.
    if (studio) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf;
    const startedAt = performance.now();
    const draw = (now) => {
      const t = (now - startedAt) / 1000;
      drawBroadcastBackdrop(ctx, locationId, t);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [locationId, studio]);

  const talkingAvatar = {
    ...(avatar || DEFAULT_AVATAR),
    mouthShape: mouthOpen ? 'open' : (avatar || DEFAULT_AVATAR).mouthShape || 'neutral',
  };

  return (
    <div className={`talking-scene${studio ? ' talking-scene-studio' : ''}`}>
      {!studio && (
        <canvas
          ref={canvasRef}
          width={BROADCAST_BACKDROP_W}
          height={BROADCAST_BACKDROP_H}
          className="talking-scene-canvas"
        />
      )}
      <div className="talking-scene-avatar">
        {/* variant="bust" — KULLANICI REVİZESİ: kafa + üst gövde, şeffaf
            arka plan (bkz. AvatarSvg.jsx yorumu) — tam vücut değil, gerçek
            bir kamera çekimi hissi için. */}
        <AvatarSvg avatar={talkingAvatar} variant="bust" pose="idle" />
      </div>
    </div>
  );
}
