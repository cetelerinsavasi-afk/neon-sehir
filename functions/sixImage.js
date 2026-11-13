// =============================================================================
// v160.2 — SIXTAGRAM FOTOĞRAF GÖRSELİ
// Ev / şehir fotoğrafları eskiden her telefonda 3D sahneden YENİDEN çiziliyordu (akışta
// koca şehri ya da evi ekran dışında kurmak → bellek taşması → oyundan atma). Artık
// fotoğrafı çeken cihaz paylaşırken son kareyi küçük bir JPEG olarak gönderir; sunucu
// doğrulayıp Realtime Database'e yazar (sixImg/{postId}). Gönderi belgesine sadece
// attachment.img = 1 eklenir → Firestore okuma/yazma sayısı DEĞİŞMEZ; görsel sadece
// ekrana yaklaşan gönderi için bir kez iner ve cihazda saklanır.
// =============================================================================
export const SIX_IMG_MAX_B64 = 200_000; // ~150 KB JPEG
export const SIX_IMG_TYPES = ['cityPhoto', 'housePhoto'];
const MAX_W = 720;
const MAX_H = 1280;

// JPEG boyutu (SOF işaretinden)
export function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

// data:image/jpeg;base64,... → doğrulanmış base64 (ya da null)
export function cleanSixImage(s) {
  if (typeof s !== 'string' || s.length > SIX_IMG_MAX_B64 + 40) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m || m[1].length < 400) return null;
  const buf = Buffer.from(m[1], 'base64');
  const d = jpegSize(buf);
  if (!d || d.w < 64 || d.h < 64 || d.w > MAX_W || d.h > MAX_H) return null;
  if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null;
  return m[1];
}
