// =============================================================================
// v188 — Bildirim rozetleri Realtime Database'ten
//
// Eskiden çevrimiçi HER oyuncu, oyun açık olduğu sürece Firestore'da globalChat'in son
// mesajını (limit 1) ve stats/sixtagram belgesini dinliyordu: her yeni sohbet mesajı / gönderi
// = çevrimiçi oyuncu sayısı kadar Firestore okuması. Artık mesajı / gönderiyi yazan sunucu
// fonksiyonu RTDB'ye küçük bir özet de yazar; rozetler ve üst bildirim şeridi buradan beslenir
// (RTDB okuma başına değil, indirilen veri başına ücretlenir; özet ~300 bayt).
//   badge/chat = { id, uid, name, text, at }   (sendChatMessage)
//   badge/six  = { uid, at }                   (createSixtagramPost, belediye gönderisi)
// Kurallar (database.rules.json › badge): okuma giriş yapmış herkese, yazma sadece sunucu.
// Sohbet ekranının kendisi (GroupChat) Firestore'dan okumaya devam eder.
// Yazım "en iyi çaba": hata asıl işlemi (mesaj / gönderi) asla bozmaz. Daha yeni bir özetin
// üstüne geç kalmış eski bir özet yazılmaz (işlem / transaction ile).
// =============================================================================
export const BADGE_TEXT_MAX = 300;
export const BADGE_NAME_MAX = 40;

const str = (v, n) => String(v ?? '').slice(0, n);

export function chatBadge({ id, uid, displayName, text, at }) {
  return { id: str(id, 64), uid: str(uid, 128), name: str(displayName || 'Oyuncu', BADGE_NAME_MAX), text: str(text, BADGE_TEXT_MAX), at: Number(at) || 0 };
}
export function sixBadge({ uid, at }) {
  return { uid: str(uid, 128), at: Number(at) || 0 };
}
// Var olandan eski değilse yaz (aynı anda iki mesajda sıra karışmasın)
export const newer = (cur, val) => (cur && Number(cur.at) > Number(val.at) ? undefined : val);

export function createBadgeFeed({ rtdb, log = console }) {
  async function put(key, val) {
    try {
      const ref = (await rtdb()).ref(`badge/${key}`);
      await ref.transaction((cur) => newer(cur, val));
      return true;
    } catch (err) {
      log.error?.(`rozet ${key}`, err?.message || err);
      return false;
    }
  }
  return {
    chat: (m) => put('chat', chatBadge(m)),
    six: (p) => put('six', sixBadge(p)),
  };
}
