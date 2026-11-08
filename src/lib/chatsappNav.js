// v60 — Oyunun herhangi bir yerinden (Oyuncu Kartı → "💬 Mesaj") ChatsApp'ta
// belirli bir arkadaşla sohbeti açmak için küçük bir köprü. App telefonu
// açar, PhoneScreen ChatsApp'a geçer, ChatsAppScreen bekleyen hedefi alır.
let pending = null;
export const OPEN_DM_EVENT = 'neon-open-dm';

export function openDmWith(uid, name = null, avatar = null) {
  if (!uid) return;
  pending = { uid, name, avatar };
  window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: pending }));
}

// v146 — şu an açık olan özel sohbet (üst bildirim şeridi o kişi için çıkmasın)
let openDmUid = null;
export function setOpenDm(uid) {
  openDmUid = uid || null;
}
export function isDmOpen(uid) {
  return Boolean(uid) && openDmUid === uid;
}

export function takePendingDm() {
  const p = pending;
  pending = null;
  return p;
}
