import { buildAvatarSvgInner, DEFAULT_AVATAR } from '../../lib/avatarShapes';

// variant='headshot' (varsayılan): kafa+üst gövdeyi gösterir — chat,
// profil, katılımcı listesi gibi küçük gösterimlerde kullanılır, eski
// davranışla birebir aynı (viewBox 0 0 320 400).
// variant='full': bacak + ayakkabı dahil tüm vücudu gösterir — Avatar
// Düzenleyici önizlemesi ve ParkWorld gibi gezilebilir sahnelerde
// karakteri bizzat göstermek için kullanılır (viewBox 0 0 320 530).
const VIEWBOX = {
  headshot: '0 0 320 400',
  full: '0 0 320 530',
};

// pose: 'idle' | 'walk1' | 'walk2' — sadece variant='full' iken görünür
// etkisi olur (bkz. avatarShapes.buildAvatarSvgInner). Hareket motoru
// bu iki yürüme karesini değiştirerek basit bir animasyon üretir.
export default function AvatarSvg({ avatar, size, rounded = false, variant = 'headshot', pose = 'idle' }) {
  const a = avatar || DEFAULT_AVATAR;
  const inner = buildAvatarSvgInner(a, { pose });

  const style = size
    ? { width: size, height: size, borderRadius: rounded ? '50%' : 8, overflow: 'hidden', flexShrink: 0 }
    : { width: '100%', height: '100%' };

  return (
    <div style={style}>
      <svg
        viewBox={VIEWBOX[variant] || VIEWBOX.headshot}
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', display: 'block', background: a.background || '#080b13' }}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    </div>
  );
}
