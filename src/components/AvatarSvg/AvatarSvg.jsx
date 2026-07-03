import { buildAvatarSvgInner, DEFAULT_AVATAR } from '../../lib/avatarShapes';

// size verilmezse dış kapsayıcıya göre esner (büyük önizlemede kullanılır).
// size verilirse sabit boyutlu, yuvarlak bir ikon olarak render edilir
// (chat, soygun planı katılımcı listesi gibi küçük gösterimlerde).
export default function AvatarSvg({ avatar, size, rounded = false }) {
  const inner = buildAvatarSvgInner(avatar || DEFAULT_AVATAR);

  const style = size
    ? { width: size, height: size, borderRadius: rounded ? '50%' : 8, overflow: 'hidden', flexShrink: 0 }
    : { width: '100%', height: '100%' };

  return (
    <div style={style}>
      <svg
        viewBox="0 0 320 400"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', display: 'block', background: '#080b13' }}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    </div>
  );
}
