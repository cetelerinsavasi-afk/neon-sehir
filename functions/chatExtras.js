// =============================================================================
// v72 — ChatsApp: mesaja YANIT ve emoji TEPKİSİ (genel sohbet + özel sohbet).
//  - Yanıt: istemci sadece yanıtlanan mesajın id'sini gönderir; alıntı (isim +
//    metnin başı) sunucuda o mesajdan okunur — sahte alıntı yazılamaz.
//  - Tepki: mesajda { reactions: { <uid>: emoji } }; kişi başı tek tepki, aynı
//    emojiye tekrar basınca kalkar. Sadece aşağıdaki emojiler geçerli.
// İstemci ikizi: src/components/ChatsAppScreen/chatExtras.jsx (CHAT_REACTIONS).
// =============================================================================
export const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];
export const REPLY_SNIPPET = 120;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const isMsgId = (v) => typeof v === 'string' && ID_RE.test(v);

// Yanıtlanan mesajdan saklanacak alıntıyı üretir (yoksa/gizliyse null).
export function replyQuoteOf(id, data, nameFallback) {
  if (!data || data.hidden) return null;
  const text = String(data.text || '').replace(/\s+/g, ' ').trim().slice(0, REPLY_SNIPPET);
  if (!text) return null;
  return { id, uid: String(data.uid || ''), name: String(data.displayName || nameFallback || 'Oyuncu').slice(0, 40), text };
}

// Tepki değişimini hesaplar: { value } → yeni değer, { remove: true } → kaldır
export function nextReaction(current, emoji) {
  if (!CHAT_REACTIONS.includes(emoji)) return { error: 'Geçersiz tepki.' };
  return current === emoji ? { remove: true } : { value: emoji };
}
