import { useEffect, useRef } from 'react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { createAvatarImageCache, renderPhotoFrame } from '../../lib/canvasWorldKit';
import { renderPhotoFrame as parkRenderPhotoFrame } from '../../lib/parkScene';
import { getInterviewBackgroundDrawer, INTERVIEW_SCENE_W, INTERVIEW_SCENE_H } from '../../lib/interviewLocations';
import './TalkingAvatarScene.css';

// Sahnedeki avatar sprite'ları için önbellek — PostAttachment.jsx'teki
// interiorPhotoImageCache ile AYNI mantık, ayrı bir örnek (röportaj arka
// planındaki dekoratif NPC'ler için).
const sceneAvatarImageCache = createAvatarImageCache(buildFullAvatarSvgMarkup, DEFAULT_AVATAR);

// TalkingAvatarScene — röportaj (madde 1) VE TV spikeri (madde 3) için
// ORTAK görsel: GERÇEK mekan arka planı (bkz. lib/interviewLocations.js —
// her mekanın kendi drawXxxSceneBackground'ı, "camide röportaj" gerçekten
// oyundaki camii sahnesi) + üstüne bindirilmiş, kameraya karşıdan bakan
// büyük bir avatar (variant="full", alt kısmı kadraj dışına taşıyor —
// bkz. TalkingAvatarScene.css). Ağız animasyonu UYDURMA bir overlay değil —
// avatarShapes.js'in KENDİ mouthShape='open' çizimi (bkz. lib/avatarShapes.js
// mouthShape()) `mouthOpen` true olduğunda geçici olarak zorlanıyor, false
// olduğunda oyuncunun gerçek/seçili mouthShape'ine dönülüyor — yani "ağzın
// açılıp kapanması" gerçekten var olan bir çizim arasında geçiş yapıyor.
export default function TalkingAvatarScene({ locationId, avatar, mouthOpen, extra, studio = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (studio) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const drawBackground = getInterviewBackgroundDrawer(locationId);
    let raf;
    let frames = 0;
    // originX/originY — kadrajın world-space'teki odak noktası. Sabit,
    // her mekanın orta/alt bölgesine (eşyaların/NPC'lerin bulunduğu alan)
    // bakacak şekilde seçildi — canlı bir kamera değil, sabit bir "röportaj
    // çekimi" kadrajı.
    const originX = INTERVIEW_SCENE_W / 2;
    const originY = INTERVIEW_SCENE_H * 0.46;
    const draw = () => {
      if (locationId === 'park') {
        parkRenderPhotoFrame(ctx, {
          width: canvas.width,
          height: canvas.height,
          originX,
          originY,
          entities: [],
          getAvatarImage: sceneAvatarImageCache,
        });
      } else {
        renderPhotoFrame(ctx, {
          width: canvas.width,
          height: canvas.height,
          originX,
          originY,
          entities: [],
          getAvatarImage: sceneAvatarImageCache,
          drawBackground: (bgCtx) => drawBackground(bgCtx, sceneAvatarImageCache, extra),
        });
      }
      frames += 1;
      if (frames < 90) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [locationId, extra, studio]);

  const talkingAvatar = {
    ...(avatar || DEFAULT_AVATAR),
    mouthShape: mouthOpen ? 'open' : (avatar || DEFAULT_AVATAR).mouthShape || 'neutral',
  };

  return (
    <div className={`talking-scene${studio ? ' talking-scene-studio' : ''}`}>
      {!studio && <canvas ref={canvasRef} width={480} height={600} className="talking-scene-canvas" />}
      <div className="talking-scene-avatar">
        {/* variant="full" BİLEREK seçildi: "headshot" varyantı kendi arka
            plan rengini uyguluyor (bkz. AvatarSvg.jsx yorumu), bu da gerçek
            mekan arka planının üstünde çirkin bir renkli kutu olarak
            görünürdü. "full" varyant şeffaf — avatar sahnenin üstüne
            gerçekten oturuyor (madde 1: "sanki o mekanda kamerayla
            çekiliyormuş gibi"). */}
        <AvatarSvg avatar={talkingAvatar} variant="full" pose="idle" />
      </div>
    </div>
  );
}
