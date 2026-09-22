import { buildAvatarSvgInner, DEFAULT_AVATAR } from '../../lib/avatarShapes';

// variant='headshot' (varsayılan): kafa+üst gövdeyi gösterir — chat,
// profil, katılımcı listesi gibi küçük gösterimlerde kullanılır, eski
// davranışla birebir aynı (viewBox 0 0 320 400), seçilen "Arka Plan"
// rengiyle birlikte (küçük ikon/kart görünümü için bu arka plan iyi
// duruyor).
// variant='full': bacak + ayakkabı dahil tüm vücudu gösterir — Avatar
// Düzenleyici önizlemesi ve Park gibi gezilebilir sahnelerde karakteri
// bizzat göstermek için kullanılır (viewBox 0 0 320 580). Bu modda
// ARKA PLAN RENGİ BİLEREK UYGULANMAZ — karakter sahnenin (çim, zemin
// vb.) üzerine şeffaf biçimde oturmalı, aksi halde her karakterin
// arkasında çirkin bir renkli kutu görünür (PNG sticker etkisi).
// variant='bust': KULLANICI REVİZESİ — röportaj/TV spikeri için "gerçek
// bir kamerayla çekiliyormuş gibi" sadece kafa + üst gövde görünsün
// isteği. 'full' gibi ARKA PLANI ŞEFFAF bırakır — çünkü burada arkada
// avatarın kendi rengi değil, gerçek röportaj/TV arka planı (bkz.
// Broadcast/TalkingAvatarScene.jsx) görünmeli. 'headshot'tan (0 0 320 400)
// FARKLI, DAHA SIKI bir viewBox kullanır: KULLANICI REVİZESİ — üstte
// "çok fazla boşluk" vardı (saç/kafa viewBox'ın üst ~90px'i boşta
// duruyordu) ve alt kenarda bacak/ayakkabının küçük bir dilimi ("ayakkabı
// tarzı bi şey") sızıyordu. avatarShapes.js'teki WAIST_Y=380 sabiti
// gövdenin (torsoShape) TAM bittiği, bacakların (legsShape) TAM
// başladığı Y — viewBox'ı y=35'ten (en yüksek saç stili olan mohawk'ın
// tepe noktası y=44'ün hemen üstü, bkz. hairFrontShape) y=380'e (WAIST_Y,
// bacaklar başlamadan HEMEN önce) kadar kırpmak hem üst boşluğu önemli
// ölçüde azaltıyor hem de bacak/ayakkabıyı TAMAMEN kadraj dışına alıyor.
const VIEWBOX = {
  headshot: '0 0 320 400',
  full: '0 0 320 580',
  bust: '0 35 320 345',
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
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          background: variant === 'full' || variant === 'bust' ? 'transparent' : a.background || '#080b13',
        }}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    </div>
  );
}
