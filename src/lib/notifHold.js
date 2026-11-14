// =============================================================================
// v160.7 — üst bildirim şeridini (SMS / ChatsApp) geçici olarak BEKLET.
// Soygun videosu oynarken sonuç SMS'i üstten düşüp hem sonucu önceden söylüyor hem de
// videonun "Geç" / ses düğmelerinin üstüne biniyordu. Video (ve sonuç kartı) açıkken gelen
// bildirim bekletilir, kapanınca gösterilir — SMS yine gelir, sadece sonra.
// =============================================================================
let holds = 0;
let safety = 0;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn(holds > 0));

export const notificationsHeld = () => holds > 0;
export function onNotificationHold(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
// tutar; dönen fonksiyon bırakır (iki kez çağrılsa da bir kez sayılır)
export function holdNotifications() {
  holds += 1;
  clearTimeout(safety);
  // emniyet: bir hata yüzünden bırakılmazsa 4 dk sonra kendiliğinden açılır
  safety = setTimeout(() => {
    holds = 0;
    emit();
  }, 240_000);
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (!holds) clearTimeout(safety);
    emit();
  };
}
